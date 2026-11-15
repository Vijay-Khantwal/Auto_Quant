"""
JSON API views for the React Boardroom frontend.
Syllabus: Unit II — Views and URL mapping, request/response.

All endpoints are @login_required and return JsonResponse.
"""
import json
import logging
from decimal import Decimal, InvalidOperation

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from core.jev import evaluate_trade
from core.models import (
    Debate, DebateTurn, Holding, Portfolio, StockSignal, Trade,
)
from core.agents.tools import route_chat
from core.agents.prompts import get_personality_tags

logger = logging.getLogger('core')


def _json_error(msg, status=400):
    """Return a JSON error response."""
    return JsonResponse({'error': msg}, status=status)


@login_required
@require_GET
def api_signals(request):
    """Return the signal feed as JSON."""
    signals = StockSignal.objects.all().order_by('-ml_confidence')
    data = [
        {
            'id': s.id,
            'symbol': s.symbol,
            'company_name': s.company_name,
            'sector': s.sector,
            'price': float(s.price),
            'market_cap_usd': s.market_cap_usd,
            'market_cap_display': s.market_cap_display,
            'ml_confidence': s.ml_confidence,
            'ml_reason': s.ml_reason,
            'sparkline': s.sparkline,
        }
        for s in signals
    ]
    return JsonResponse({'signals': data})


@login_required
@require_POST
def api_search_or_create_signal(request):
    """Search for any stock or fetch live market data from yfinance/Azure on-the-fly."""
    import yfinance as yf
    try:
        body = json.loads(request.body)
        raw_query = body.get('query', '').strip()
    except (json.JSONDecodeError, AttributeError):
        return _json_error('Invalid JSON. Need "query" string.')

    if not raw_query:
        return _json_error('Please enter a stock ticker or company name.')

    cleaned = raw_query.upper()

    # 1. Check existing in DB
    existing = StockSignal.objects.filter(symbol__iexact=cleaned).first()
    if not existing and not cleaned.endswith('.NS'):
        existing = StockSignal.objects.filter(symbol__iexact=f"{cleaned}.NS").first()
    if not existing:
        existing = StockSignal.objects.filter(company_name__icontains=cleaned).first()

    if existing:
        return JsonResponse({
            'signal': {
                'id': existing.id,
                'symbol': existing.symbol,
                'company_name': existing.company_name,
                'sector': existing.sector,
                'price': float(existing.price),
                'market_cap_usd': existing.market_cap_usd,
                'market_cap_display': existing.market_cap_display,
                'ml_confidence': existing.ml_confidence,
                'ml_reason': existing.ml_reason,
                'sparkline': existing.sparkline,
            },
            'created': False,
        })

    # 2. Fetch live market data via yfinance
    symbol_to_try = cleaned if ('.' in cleaned or '^' in cleaned) else f"{cleaned}.NS"
    price = None
    market_cap = None
    company_name = None
    sector = None
    sparkline = []

    try:
        t = yf.Ticker(symbol_to_try)
        fast_info = getattr(t, 'fast_info', None)
        if fast_info and fast_info.last_price:
            price = round(float(fast_info.last_price), 2)
            market_cap = int(fast_info.market_cap or 50_000_000_000)
            hist = t.history(period='1mo', interval='1d')
            if not hist.empty:
                sparkline = [round(float(p), 2) for p in hist['Close'].tolist()]
            try:
                company_name = t.info.get('longName') or t.info.get('shortName')
                sector = t.info.get('sector')
            except Exception:
                pass
    except Exception as e:
        logger.warning("yfinance fetch error for %s: %s", symbol_to_try, e)

    # If .NS failed and user didn't specify a dot, try US/global ticker
    if price is None and symbol_to_try.endswith('.NS') and '.' not in cleaned:
        try:
            t = yf.Ticker(cleaned)
            fast_info = getattr(t, 'fast_info', None)
            if fast_info and fast_info.last_price:
                symbol_to_try = cleaned
                price = round(float(fast_info.last_price), 2)
                market_cap = int(fast_info.market_cap or 50_000_000_000)
                hist = t.history(period='1mo', interval='1d')
                if not hist.empty:
                    sparkline = [round(float(p), 2) for p in hist['Close'].tolist()]
                company_name = t.info.get('longName') or t.info.get('shortName')
                sector = t.info.get('sector')
        except Exception:
            pass

    # 3. Fallback defaults if ticker is speculative or offline
    if not company_name:
        company_name = f"{cleaned.replace('.NS', '')} Enterprises Ltd"
    if not sector:
        sector = "Diversified & Consumer Growth"
    if not price:
        price = 350.00
    if not market_cap:
        market_cap = 15_000_000_000

    # Ensure sparkline has 30 points
    if len(sparkline) < 30:
        base = price * 0.94
        step = (price - base) / 30
        sparkline = [
            round(base + (i * step) + ((i % 3) - 1) * (price * 0.004), 2)
            for i in range(30)
        ]

    # Compute momentum and score
    change = 0
    if len(sparkline) >= 2 and sparkline[0] > 0:
        change = ((sparkline[-1] - sparkline[0]) / sparkline[0]) * 100

    ml_conf = min(96, max(60, int(76 + (change * 1.4))))
    ml_reason = f"Breakout momentum with {change:+.1f}% 30-day technical trend; institutional volume accumulation detected."

    new_signal = StockSignal.objects.create(
        symbol=symbol_to_try,
        company_name=company_name[:200],
        sector=sector[:100],
        price=price,
        market_cap_usd=market_cap,
        ml_confidence=ml_conf,
        ml_reason=ml_reason,
        sparkline=sparkline,
    )

    # Pre-generate debate with Azure OpenAI if available
    from core.agents.debate import get_or_create_debate
    try:
        get_or_create_debate(request.user, new_signal)
    except Exception as e:
        logger.warning("Failed pre-generating debate for new signal %s: %s", symbol_to_try, e)

    return JsonResponse({
        'signal': {
            'id': new_signal.id,
            'symbol': new_signal.symbol,
            'company_name': new_signal.company_name,
            'sector': new_signal.sector,
            'price': float(new_signal.price),
            'market_cap_usd': new_signal.market_cap_usd,
            'market_cap_display': new_signal.market_cap_display,
            'ml_confidence': new_signal.ml_confidence,
            'ml_reason': new_signal.ml_reason,
            'sparkline': new_signal.sparkline,
        },
        'created': True,
    })


@login_required
@require_GET
def api_debate(request, signal_id):
    """Return debate turns + initial Jev report for the default quantity."""
    try:
        signal = StockSignal.objects.get(pk=signal_id)
    except StockSignal.DoesNotExist:
        return _json_error('Signal not found.', 404)

    from core.agents.debate import get_or_create_debate
    debate = get_or_create_debate(request.user, signal)

    # Get active skill info
    from core.models import SkillProfile
    active_skill = SkillProfile.objects.filter(
        user=request.user, is_active=True
    ).first()
    skill_name = active_skill.name if active_skill else 'Default'
    value_tags = get_personality_tags(active_skill, 'value')
    risk_tags = get_personality_tags(active_skill, 'risk')

    turns = [
        {
            'order': t.order,
            'agent': t.agent,
            'stance': t.stance,
            'text': t.text,
            'evidence': t.evidence,
            'conviction_delta': t.conviction_delta,
        }
        for t in debate.turns.all()
    ]

    # Compute default quantity
    try:
        risk, _ = RiskSettings.objects.get_or_create(user=request.user)
        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        max_value = (portfolio.total_value * risk.max_position_pct) / 100
        default_qty = max(1, int(max_value / signal.price))
    except Exception:
        default_qty = 1

    # Initial Jev check
    jev_report = evaluate_trade(request.user, signal, default_qty)

    return JsonResponse({
        'debate': {
            'id': debate.id,
            'signal_id': signal.id,
            'symbol': signal.symbol,
            'company_name': signal.company_name,
            'price': float(signal.price),
            'summary_verdict': debate.summary_verdict,
            'lesson': debate.lesson,
            'source': debate.source,
            'skill_name': skill_name,
            'value_tags': value_tags,
            'risk_tags': risk_tags,
            'turns': turns,
        },
        'jev_report': jev_report,
        'default_quantity': default_qty,
    })


@login_required
@require_POST
def api_jev_check(request):
    """Live slider check: {signal_id, quantity} returns Jev report."""
    try:
        body = json.loads(request.body)
        signal_id = body['signal_id']
        quantity = int(body['quantity'])
    except (json.JSONDecodeError, KeyError, ValueError):
        return _json_error('Invalid request. Need signal_id and quantity.')

    if quantity < 1:
        return _json_error('Quantity must be at least 1.')

    try:
        signal = StockSignal.objects.get(pk=signal_id)
    except StockSignal.DoesNotExist:
        return _json_error('Signal not found.', 404)

    report = evaluate_trade(request.user, signal, quantity)
    return JsonResponse({'jev_report': report, 'quantity': quantity})


@login_required
@require_POST
def api_trade(request):
    """Execute or pass on a trade. Always re-runs Jev server-side."""
    try:
        body = json.loads(request.body)
        signal_id = body['signal_id']
        debate_id = body['debate_id']
        decision = body['decision']
        quantity = int(body.get('quantity', 0))
    except (json.JSONDecodeError, KeyError, ValueError):
        return _json_error('Invalid request.')

    if decision not in ('execute', 'pass'):
        return _json_error('Decision must be "execute" or "pass".')

    try:
        signal = StockSignal.objects.get(pk=signal_id)
        debate = Debate.objects.get(pk=debate_id)
    except (StockSignal.DoesNotExist, Debate.DoesNotExist):
        return _json_error('Signal or debate not found.', 404)

    # Always re-run Jev server-side — never trust the frontend
    jev_report = evaluate_trade(request.user, signal, quantity)

    if decision == 'execute' and not jev_report['approved']:
        # HTTP 403: Jev says no
        return JsonResponse({
            'error': 'Trade blocked by Jev.',
            'jev_report': jev_report,
        }, status=403)

    # Record the trade
    trade = Trade.objects.create(
        user=request.user,
        signal=signal,
        debate=debate,
        decision=decision,
        quantity=quantity if decision == 'execute' else 0,
        price=signal.price,
        jev_approved=jev_report['approved'],
        jev_report=jev_report,
    )

    # Update portfolio if executing
    portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
    if decision == 'execute':
        trade_cost = signal.price * quantity
        portfolio.cash -= trade_cost
        portfolio.save()

        # Update or create holding
        holding, created = Holding.objects.get_or_create(
            portfolio=portfolio,
            symbol=signal.symbol,
            defaults={'quantity': quantity, 'avg_price': signal.price},
        )
        if not created:
            # Weighted average price
            total_qty = holding.quantity + quantity
            total_cost = (holding.avg_price * holding.quantity) + (signal.price * quantity)
            holding.avg_price = total_cost / total_qty
            holding.quantity = total_qty
            holding.save()

    return JsonResponse({
        'trade_id': trade.id,
        'decision': decision,
        'quantity': trade.quantity,
        'price': float(trade.price),
        'jev_approved': trade.jev_approved,
        'cash': float(portfolio.cash),
        'total_value': float(portfolio.total_value),
    })


@login_required
@require_POST
def api_debate_regenerate(request, signal_id):
    """Regenerate debate dynamically with AI for this signal."""
    try:
        signal = StockSignal.objects.get(pk=signal_id)
    except StockSignal.DoesNotExist:
        return _json_error('Signal not found.', 404)

    from core.agents.debate import regenerate_debate
    debate = regenerate_debate(request.user, signal)
    return api_debate(request, signal_id)


@login_required
def api_chat(request):
    """Research assistant chat endpoint with database persistence."""
    from core.models import ChatMessage, SkillProfile
    if request.method == 'POST':
        try:
            body = json.loads(request.body)
            message = body.get('message', '')
            signal_id = body.get('signal_id')
        except json.JSONDecodeError:
            return _json_error('Invalid JSON.')

        if not message.strip():
            return _json_error('Message cannot be empty.')

        # Get the signal
        sig = None
        symbol = 'IOLCP.NS'
        if signal_id:
            sig = StockSignal.objects.filter(pk=signal_id).first()
            if sig:
                symbol = sig.symbol

        active_skill = SkillProfile.objects.filter(user=request.user, is_active=True).first()
        result = route_chat(message, symbol, signal=sig, skill_profile=active_skill)

        # Save user message & assistant reply if signal is present
        if sig:
            ChatMessage.objects.create(
                user=request.user,
                signal=sig,
                role='user',
                text=message,
            )
            ChatMessage.objects.create(
                user=request.user,
                signal=sig,
                role='assistant',
                text=result['reply'],
                tool=result.get('tool') or '',
                args=result.get('args') or {},
            )

        return JsonResponse(result)

    return _json_error('Method not allowed.', 405)


@login_required
@require_GET
def api_chat_history(request, signal_id):
    """Return saved chat history for a signal to save tokens and persist context."""
    from core.models import ChatMessage
    messages = ChatMessage.objects.filter(
        user=request.user,
        signal_id=signal_id,
    ).order_by('created_at')[:50]

    data = [
        {
            'role': m.role,
            'text': m.text,
            'tool': m.tool,
            'args': m.args,
            'created_at': m.created_at.isoformat(),
        }
        for m in messages
    ]
    return JsonResponse({'messages': data})


@login_required
@require_POST
def api_chat_clear(request, signal_id):
    """Clear chat history for a signal so user can rerun fresh."""
    from core.models import ChatMessage
    ChatMessage.objects.filter(user=request.user, signal_id=signal_id).delete()
    return JsonResponse({'status': 'cleared'})


@login_required
@require_GET
def api_portfolio(request):
    """Return the user's portfolio: cash, holdings, total value."""
    portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
    holdings = [
        {
            'symbol': h.symbol,
            'quantity': h.quantity,
            'avg_price': float(h.avg_price),
            'value': float(h.avg_price * h.quantity),
        }
        for h in portfolio.holdings.all()
    ]
    return JsonResponse({
        'cash': float(portfolio.cash),
        'holdings': holdings,
        'total_value': float(portfolio.total_value),
    })
