"""
Jev: the deterministic compliance guardian.

Pure Python with zero LLM calls.  "LLMs advise, Jev decides what is allowed."
Syllabus: Unit III — debugging (logger.info).
"""
import logging
from datetime import date
from decimal import Decimal

logger = logging.getLogger('core')


def evaluate_trade(user, signal, quantity):
    """Return {"approved": bool, "checks": [{rule, passed, detail}, ...]}."""
    risk = user.risk_settings
    portfolio = user.portfolio
    trade_value = Decimal(str(signal.price)) * Decimal(str(quantity))
    total_value = portfolio.total_value

    checks = []

    # 1. Position size: trade value / total portfolio value ≤ max_position_pct
    if total_value > 0:
        pct = (trade_value / total_value) * 100
    else:
        pct = Decimal('100')
    position_ok = pct <= risk.max_position_pct
    checks.append({
        'rule': 'position_size',
        'passed': position_ok,
        'detail': (
            f"Trade is {pct:.1f}% of portfolio; "
            f"your limit is {risk.max_position_pct}%."
        ),
    })

    # 2. Market cap: signal.market_cap_usd ≥ min_market_cap_usd
    cap_ok = signal.market_cap_usd >= risk.min_market_cap_usd
    checks.append({
        'rule': 'market_cap',
        'passed': cap_ok,
        'detail': (
            f"Market cap is ${signal.market_cap_usd:,}; "
            f"your minimum is ${risk.min_market_cap_usd:,}."
        ),
    })

    # 3. Daily trade limit: trades today < max_trades_per_day
    from core.models import Trade  # deferred to avoid circular import
    trades_today = Trade.objects.filter(
        user=user,
        created_at__date=date.today(),
        decision='execute',
    ).count()
    limit_ok = trades_today < risk.max_trades_per_day
    checks.append({
        'rule': 'daily_trade_limit',
        'passed': limit_ok,
        'detail': (
            f"You have made {trades_today} trade(s) today; "
            f"your limit is {risk.max_trades_per_day}."
        ),
    })

    # 4. Cash available: cash ≥ trade value
    cash_ok = portfolio.cash >= trade_value
    checks.append({
        'rule': 'cash_available',
        'passed': cash_ok,
        'detail': (
            f"Trade costs ₹{trade_value:,.2f}; "
            f"you have ₹{portfolio.cash:,.2f} available."
        ),
    })

    # 5. ML confidence: signal.ml_confidence ≥ min_ml_confidence
    conf_ok = signal.ml_confidence >= risk.min_ml_confidence
    checks.append({
        'rule': 'ml_confidence',
        'passed': conf_ok,
        'detail': (
            f"ML confidence is {signal.ml_confidence}%; "
            f"your minimum is {risk.min_ml_confidence}%."
        ),
    })

    approved = all(c['passed'] for c in checks)
    result = {'approved': approved, 'checks': checks}

    # Syllabus: logger.info in Jev (Unit III debugging)
    logger.info(
        "Jev evaluated %s x%d for %s: %s",
        signal.symbol, quantity, user.username,
        'APPROVED' if approved else 'BLOCKED',
    )

    return result
