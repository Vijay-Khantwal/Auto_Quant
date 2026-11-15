"""
Debate engine: builds a debate between Value and Risk agents.

Demo mode (default): loads pre-written debates from fixtures.
LLM mode (optional): calls Anthropic API, falls back to demo on any error.
"""
import json
import logging
import os
from pathlib import Path

logger = logging.getLogger('core')

FIXTURES_DIR = Path(__file__).resolve().parent.parent / 'fixtures'


def _load_debates_fixture():
    """Load the debates.json fixture."""
    path = FIXTURES_DIR / 'debates.json'
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def _generic_debate_turns(signal):
    """Generate a generic templated debate from signal fields."""
    return [
        {
            'order': 1, 'agent': 'value', 'stance': 'buy',
            'text': (
                f"Looking at {signal.company_name}, the ML model flags this at "
                f"{signal.ml_confidence}% confidence. At ₹{signal.price}, "
                f"with a market cap of ${signal.market_cap_usd:,}, there's "
                f"potential here. {signal.ml_reason}"
            ),
            'evidence': [
                f"ML confidence: {signal.ml_confidence}%",
                f"Price: ₹{signal.price}",
            ],
            'conviction_delta': 10,
        },
        {
            'order': 2, 'agent': 'risk', 'stance': 'object',
            'text': (
                f"Hold on. We need to consider the broader sector risks in "
                f"{signal.sector}. The confidence score alone doesn't tell us "
                f"about potential headwinds or liquidity concerns."
            ),
            'evidence': [
                f"Sector: {signal.sector}",
                'Liquidity risk should be assessed',
            ],
            'conviction_delta': -8,
        },
        {
            'order': 3, 'agent': 'value', 'stance': 'buy',
            'text': (
                f"Fair point on sector risk, but the fundamentals for "
                f"{signal.company_name} stand on their own. The model has "
                f"accounted for sector correlation in its scoring."
            ),
            'evidence': ['Model accounts for sector correlation'],
            'conviction_delta': 5,
        },
        {
            'order': 4, 'agent': 'risk', 'stance': 'object',
            'text': (
                "I remain cautious. We should let Jev run the compliance "
                "checks before committing capital. Position sizing and risk "
                "limits matter more than conviction."
            ),
            'evidence': ['Risk limits protect capital'],
            'conviction_delta': -5,
        },
    ]


def _build_jev_turn(user, signal, turns):
    """Build the Jev turn from a real evaluate_trade call."""
    from core.jev import evaluate_trade
    from core.models import Portfolio

    # Compute default quantity
    try:
        portfolio = user.portfolio
        risk = user.risk_settings
        max_value = (portfolio.total_value * risk.max_position_pct) / 100
        default_qty = max(1, int(max_value / signal.price))
    except Exception:
        default_qty = 10

    report = evaluate_trade(user, signal, default_qty)
    order = max(t['order'] for t in turns) + 1 if turns else 1

    if report['approved']:
        text = (
            f"Compliance review complete. All {len(report['checks'])} checks passed. "
            f"This trade of {default_qty} shares at ₹{signal.price} is within "
            f"your risk parameters. Proceed if you agree with the committee."
        )
        stance = 'neutral'
    else:
        failed = [c for c in report['checks'] if not c['passed']]
        text = (
            f"Compliance review complete. {len(failed)} check(s) failed. "
            f"This trade is BLOCKED. "
            + ' '.join(c['detail'] for c in failed)
        )
        stance = 'object'

    evidence = [c['detail'] for c in report['checks']][:3]

    return {
        'order': order,
        'agent': 'jev',
        'stance': stance,
        'text': text,
        'evidence': evidence,
        'conviction_delta': 0,
    }


def get_or_create_debate(user, signal):
    """Get or create a debate for the given user and signal."""
    from core.models import Debate, DebateTurn, SkillProfile

    # Determine active skill
    active_skill = SkillProfile.objects.filter(
        user=user, is_active=True
    ).first()

    # Check cache: one debate per (user, signal, skill)
    existing = Debate.objects.filter(
        signal=signal,
        user=user,
        skill_profile=active_skill,
    ).first()
    if existing and existing.turns.exists():
        return existing

    # Try LLM mode
    llm_provider = os.environ.get('AUTOQUANT_LLM', '').lower()
    turns_data = None

    if llm_provider == 'anthropic':
        try:
            turns_data = _generate_llm_debate(user, signal, active_skill)
        except Exception as e:
            logger.warning("LLM debate failed, falling back to demo: %s", e)
            turns_data = None

    # Demo mode (default or fallback)
    source = 'demo'
    if turns_data is None:
        fixtures = _load_debates_fixture()
        style = active_skill.parsed.get('style', 'balanced') if active_skill else 'balanced'
        # Try style-specific variant first, then generic symbol
        key = f"{signal.symbol}_{style}"
        if key in fixtures:
            turns_data = fixtures[key]
        elif signal.symbol in fixtures:
            turns_data = fixtures[signal.symbol]
        else:
            turns_data = _generic_debate_turns(signal)
    else:
        source = 'llm'

    # Build Jev turn from real evaluation
    jev_turn = _build_jev_turn(user, signal, turns_data)
    turns_data.append(jev_turn)

    # Determine summary and lesson
    fixtures = _load_debates_fixture()
    meta = fixtures.get(f"_meta_{signal.symbol}", {})
    summary = meta.get('summary', 'The committee debated this signal.')
    lesson = meta.get('lesson',
        'Always verify ML signals against fundamental analysis and risk parameters.'
    )

    # Create debate
    debate = Debate.objects.create(
        signal=signal,
        user=user,
        skill_profile=active_skill,
        summary_verdict=summary,
        lesson=lesson,
        source=source,
    )

    # Create turns
    for td in turns_data:
        DebateTurn.objects.create(
            debate=debate,
            order=td['order'],
            agent=td['agent'],
            stance=td['stance'],
            text=td['text'],
            evidence=td.get('evidence', []),
            conviction_delta=td.get('conviction_delta', 0),
        )

    return debate


def _generate_llm_debate(user, signal, skill_profile):
    """Generate a debate using Anthropic API. Raises on failure."""
    import anthropic
    from core.agents.prompts import build_system_prompt

    client = anthropic.Anthropic(api_key=os.environ.get('ANTHROPIC_API_KEY'))
    turns = []

    for i, agent_role in enumerate(['value', 'risk', 'value', 'risk', 'value']):
        prompt = build_system_prompt(skill_profile, signal, agent_role)
        context = ''
        if turns:
            context = '\n\nPrevious turns:\n' + '\n'.join(
                f"- {t['agent']}: {t['text']}" for t in turns
            )

        response = client.messages.create(
            model='claude-sonnet-4-20250514',
            max_tokens=500,
            system=prompt,
            messages=[{
                'role': 'user',
                'content': f"Make your argument.{context}",
            }],
        )

        text = response.content[0].text
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON from the response
            data = {
                'text': text[:500],
                'stance': 'buy' if agent_role == 'value' else 'object',
                'evidence': [],
                'conviction_delta': 8 if agent_role == 'value' else -6,
            }

        turns.append({
            'order': i + 1,
            'agent': agent_role,
            'stance': data.get('stance', 'buy' if agent_role == 'value' else 'object'),
            'text': data.get('text', text[:500]),
            'evidence': data.get('evidence', [])[:3],
            'conviction_delta': max(-20, min(20, data.get('conviction_delta', 0))),
        })

    return turns
