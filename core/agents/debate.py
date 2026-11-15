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
    llm_provider = os.environ.get('LLM_PROVIDER', os.environ.get('AUTOQUANT_LLM', '')).lower()
    has_azure = bool(os.environ.get('AZURE_OPENAI_KEY') and os.environ.get('AZURE_OPENAI_ENDPOINT'))
    turns_data = None
    meta_override = {}

    if llm_provider == 'azure' or has_azure:
        try:
            logger.info("Generating dynamic debate via Azure OpenAI for %s...", signal.symbol)
            llm_result = _generate_azure_debate(user, signal, active_skill)
            turns_data = llm_result.get('turns', [])
            meta_override = {
                'summary': llm_result.get('summary', ''),
                'lesson': llm_result.get('lesson', ''),
            }
        except Exception as e:
            logger.warning("Azure LLM debate failed, falling back to demo: %s", e)
            turns_data = None

    elif llm_provider == 'anthropic':
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
    summary = meta_override.get('summary') or meta.get('summary', f'The committee debated {signal.symbol}.')
    lesson = meta_override.get('lesson') or meta.get(
        'lesson',
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


def regenerate_debate(user, signal):
    """Delete any existing debate for this user/signal and generate a fresh one."""
    from core.models import Debate, SkillProfile
    active_skill = SkillProfile.objects.filter(user=user, is_active=True).first()
    Debate.objects.filter(signal=signal, user=user, skill_profile=active_skill).delete()
    return get_or_create_debate(user, signal)


def stream_debate_events(user, signal, active_skill=None):
    """
    Generator yielding real-time debate events via Server-Sent Events (SSE):
    - {'event': 'init', 'data': {...}}
    - {'event': 'turn', 'data': {'turn': {...}, 'conviction': int}}
    - {'event': 'jev', 'data': {'turn': {...}, 'report': {...}, 'conviction': int}}
    - {'event': 'done', 'data': {'debate_id': int, 'summary': str, 'lesson': str}}
    """
    import time
    from core.models import SkillProfile, Debate, DebateTurn
    from core.jev import evaluate_trade

    if active_skill is None:
        active_skill = SkillProfile.objects.filter(user=user, is_active=True).first()

    yield {
        'event': 'init',
        'data': {
            'signal_id': signal.id,
            'symbol': signal.symbol,
            'company_name': signal.company_name,
            'skill_name': active_skill.name if active_skill else 'Default',
        }
    }

    endpoint = os.environ.get('AZURE_OPENAI_ENDPOINT')
    key = os.environ.get('AZURE_OPENAI_KEY')
    version = os.environ.get('AZURE_OPENAI_API_VERSION', '2024-02-15-preview')
    deployment = os.environ.get('AZURE_OPENAI_DEPLOYMENT_NAME', 'gpt-5.4-mini')

    turns_collected = []
    running_conviction = 0
    summary = ''
    lesson = ''
    source = 'llm'

    if endpoint and key:
        style = active_skill.parsed.get('style', 'balanced') if active_skill else 'balanced'
        instructions = active_skill.parsed.get('instructions', '') if active_skill else ''
        mcap = getattr(signal, 'market_cap_display', f'${signal.market_cap_usd:,}')

        prompt = f"""Generate an institutional boardroom debate for Indian equity {signal.symbol} ({signal.company_name}) at ₹{signal.price}.
Sector: {signal.sector}
Market Cap: {mcap}
ML Momentum Confidence: {signal.ml_confidence}%
Technical/ML Setup: {signal.ml_reason}
Active Committee Style: {style}
Tuning Directives: {instructions}

Debate between Value Agent (seeking growth/moats/catalysts) and Risk Agent (probing valuation, headwinds, governance).
Output EXACTLY 5 lines, one for each turn, starting with TURN: followed by a JSON object, then SUMMARY: and LESSON:. Do NOT wrap in markdown code blocks.
Format:
TURN: {{"order": 1, "agent": "value", "stance": "buy", "text": "...", "evidence": ["..."], "conviction_delta": 10}}
TURN: {{"order": 2, "agent": "risk", "stance": "object", "text": "...", "evidence": ["..."], "conviction_delta": -8}}
TURN: {{"order": 3, "agent": "value", "stance": "buy", "text": "...", "evidence": ["..."], "conviction_delta": 7}}
TURN: {{"order": 4, "agent": "risk", "stance": "object", "text": "...", "evidence": ["..."], "conviction_delta": -6}}
TURN: {{"order": 5, "agent": "value", "stance": "buy", "text": "...", "evidence": ["..."], "conviction_delta": 5}}
SUMMARY: <verdict text>
LESSON: <lesson text>"""

        try:
            from openai import AzureOpenAI
            client = AzureOpenAI(
                api_key=key,
                api_version=version,
                azure_endpoint=endpoint,
                max_retries=2,
            )
            stream = client.chat.completions.create(
                model=deployment,
                messages=[
                    {"role": "system", "content": "You are an expert Dalal Street investment committee simulating debates. Output exactly one line per turn starting with TURN: then JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_completion_tokens=1800,
                stream=True,
            )

            buffer = ''
            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    buffer += chunk.choices[0].delta.content
                    while '\n' in buffer:
                        line, buffer = buffer.split('\n', 1)
                        line = line.strip()
                        if line.startswith('TURN:'):
                            try:
                                turn_json = json.loads(line[5:].strip())
                                running_conviction += turn_json.get('conviction_delta', 0)
                                turns_collected.append(turn_json)
                                yield {
                                    'event': 'turn',
                                    'data': {
                                        'turn': turn_json,
                                        'conviction': running_conviction,
                                    }
                                }
                            except Exception as parse_err:
                                logger.warning("Error parsing streamed turn line: %s", parse_err)
                        elif line.startswith('SUMMARY:'):
                            summary = line[8:].strip()
                        elif line.startswith('LESSON:'):
                            lesson = line[7:].strip()

            if buffer.strip():
                line = buffer.strip()
                if line.startswith('TURN:'):
                    try:
                        turn_json = json.loads(line[5:].strip())
                        running_conviction += turn_json.get('conviction_delta', 0)
                        turns_collected.append(turn_json)
                        yield {
                            'event': 'turn',
                            'data': {
                                'turn': turn_json,
                                'conviction': running_conviction,
                            }
                        }
                    except Exception:
                        pass
                elif line.startswith('SUMMARY:'):
                    summary = line[8:].strip()
                elif line.startswith('LESSON:'):
                    lesson = line[7:].strip()

        except Exception as e:
            logger.warning("Streaming from Azure OpenAI failed, using fallback: %s", e)
            turns_collected = []

    # Fallback if Azure failed or returned empty
    if not turns_collected:
        source = 'demo'
        fixtures = _load_debates_fixture()
        style = active_skill.parsed.get('style', 'balanced') if active_skill else 'balanced'
        key = f"{signal.symbol}_{style}"
        if key in fixtures:
            fallback_turns = fixtures[key]
        elif signal.symbol in fixtures:
            fallback_turns = fixtures[signal.symbol]
        else:
            fallback_turns = _generic_debate_turns(signal)

        running_conviction = 0
        for td in fallback_turns:
            time.sleep(0.3)
            running_conviction += td.get('conviction_delta', 0)
            turns_collected.append(td)
            yield {
                'event': 'turn',
                'data': {
                    'turn': td,
                    'conviction': running_conviction,
                }
            }

    # Jev deterministic compliance evaluation
    try:
        portfolio = user.portfolio
        risk = user.risk_settings
        max_value = (portfolio.total_value * risk.max_position_pct) / 100
        default_qty = max(1, int(max_value / signal.price))
    except Exception:
        default_qty = 10

    report = evaluate_trade(user, signal, default_qty)
    jev_turn = _build_jev_turn(user, signal, turns_collected)
    turns_collected.append(jev_turn)

    yield {
        'event': 'jev',
        'data': {
            'turn': jev_turn,
            'conviction': running_conviction,
            'report': report,
            'default_quantity': default_qty,
        }
    }

    if not summary:
        summary = f"The committee analyzed {signal.symbol}."
    if not lesson:
        lesson = "Always verify quantitative conviction against sector headwinds and compliance limits."

    # Persist completed debate into SQLite
    debate = Debate.objects.create(
        signal=signal,
        user=user,
        skill_profile=active_skill,
        summary_verdict=summary,
        lesson=lesson,
        source=source,
    )
    for td in turns_collected:
        DebateTurn.objects.create(
            debate=debate,
            order=td['order'],
            agent=td['agent'],
            stance=td['stance'],
            text=td['text'],
            evidence=td.get('evidence', []),
            conviction_delta=td.get('conviction_delta', 0),
        )

    yield {
        'event': 'done',
        'data': {
            'debate_id': debate.id,
            'summary': debate.summary_verdict,
            'lesson': debate.lesson,
        }
    }


def _generate_azure_debate(user, signal, skill_profile):
    """Generate dynamic boardroom debate using Azure OpenAI."""
    from openai import AzureOpenAI
    endpoint = os.environ.get('AZURE_OPENAI_ENDPOINT')
    key = os.environ.get('AZURE_OPENAI_KEY')
    version = os.environ.get('AZURE_OPENAI_API_VERSION', '2024-02-15-preview')
    deployment = os.environ.get('AZURE_OPENAI_DEPLOYMENT_NAME', 'gpt-5.4-mini')

    if not endpoint or not key:
        raise ValueError("Azure OpenAI endpoint/key missing.")

    client = AzureOpenAI(
        api_key=key,
        api_version=version,
        azure_endpoint=endpoint,
        max_retries=2,
    )

    style = skill_profile.parsed.get('style', 'balanced') if skill_profile else 'balanced'
    instructions = skill_profile.parsed.get('instructions', '') if skill_profile else ''

    prompt = f"""You are simulating an institutional Investment Committee boardroom debate for an Indian stock:
Ticker: {signal.symbol} ({signal.company_name})
Sector: {signal.sector}
Current Price: ₹{signal.price}
Market Cap: {getattr(signal, 'market_cap_display', f'${signal.market_cap_usd:,}')}
ML Quantitative Momentum Score: {signal.ml_confidence}%
Technical/ML Setup: {signal.ml_reason}

Active Committee Style Tuning:
Style: {style}
Tuning Directives: {instructions}

Generate a vigorous, high-conviction 5-turn debate between the Value Agent (bullish, seeking growth, valuation discount & catalysts) and the Risk Agent (bearish, scrutinizing valuation, governance, sector headwinds, and liquidity risk).

Output ONLY a JSON object with this exact schema:
{{
  "summary": "<1-2 sentence overall verdict of the debate>",
  "lesson": "<1-2 sentence educational takeaway for retail investors about what to watch in this stock>",
  "turns": [
    {{
      "order": 1,
      "agent": "value",
      "stance": "buy",
      "text": "<Value agent opening argument citing margin expansion, market tailwinds, or business moats>",
      "evidence": ["<key metric 1>", "<key metric 2>"],
      "conviction_delta": 12
    }},
    {{
      "order": 2,
      "agent": "risk",
      "stance": "object",
      "text": "<Risk agent counter argument attacking governance, sector headwinds, or valuation stretch>",
      "evidence": ["<risk point 1>", "<risk point 2>"],
      "conviction_delta": -10
    }},
    {{
      "order": 3,
      "agent": "value",
      "stance": "buy",
      "text": "<Value agent rebuttal addressing the risk and highlighting competitive moat>",
      "evidence": ["<point>"],
      "conviction_delta": 7
    }},
    {{
      "order": 4,
      "agent": "risk",
      "stance": "object",
      "text": "<Risk agent second objection regarding macroeconomic sensitivity or earnings quality>",
      "evidence": ["<point>"],
      "conviction_delta": -6
    }},
    {{
      "order": 5,
      "agent": "value",
      "stance": "buy",
      "text": "<Value agent closing conviction summary with risk-reward ratio>",
      "evidence": ["<point>"],
      "conviction_delta": 8
    }}
  ]
}}"""

    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "system", "content": "You are an expert Dalal Street equity research committee member. Output pure JSON only."},
            {"role": "user", "content": prompt}
        ],
        max_completion_tokens=2500,
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```json"):
        content = content[7:]
    elif content.startswith("```"):
        content = content[3:]
    if content.endswith("```"):
        content = content[:-3]

    data = json.loads(content.strip())
    # Validate turns
    if 'turns' not in data or not isinstance(data['turns'], list):
        raise ValueError("Invalid turns format from LLM.")
    return data


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
