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
            'ml_confidence': s.ml_confidence,
            'ml_reason': s.ml_reason,
            'sparkline': s.sparkline,
        }
        for s in signals
    ]
    return JsonResponse({'signals': data})


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
        risk = request.user.risk_settings
        portfolio = request.user.portfolio
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
    portfolio = request.user.portfolio
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
def api_chat(request):
    """Research assistant chat endpoint."""
    try:
        body = json.loads(request.body)
        message = body.get('message', '')
        signal_id = body.get('signal_id')
    except json.JSONDecodeError:
        return _json_error('Invalid JSON.')

    if not message.strip():
        return _json_error('Message cannot be empty.')

    # Get the symbol from the signal
    symbol = 'IOLCP.NS'
    if signal_id:
        try:
            sig = StockSignal.objects.get(pk=signal_id)
            symbol = sig.symbol
        except StockSignal.DoesNotExist:
            pass

    result = route_chat(message, symbol)
    return JsonResponse(result)


@login_required
@require_GET
def api_portfolio(request):
    """Return the user's portfolio: cash, holdings, total value."""
    portfolio = request.user.portfolio
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
