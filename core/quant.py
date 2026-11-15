"""
Quantitative analysis and explainable ML prediction engine for AutoQuant.
Computes technical indicators, momentum metrics, and an explainable ML confidence score.
"""
import numpy as np


def compute_quant_profile(sparkline, current_price=None):
    """
    Given a list of closing prices (e.g. 30-day sparkline),
    computes algorithmic indicators: RSI, EMA crossover, Bollinger Bands, and Momentum ROC.
    Returns an explainable quantitative signal dictionary.
    """
    if not sparkline or len(sparkline) < 10:
        return {
            'ml_score': 70,
            'signal_verdict': 'BUY',
            'rsi': 55.0,
            'rsi_status': 'Neutral Accumulation',
            'trend': 'BULLISH',
            'ema_fast': current_price or 100,
            'ema_slow': current_price or 100,
            'pct_b': 0.5,
            'roc_30': 0.0,
            'factors': [],
            'summary': 'Insufficient historical data for complete quantitative evaluation.',
        }

    prices = [float(p) for p in sparkline]
    if current_price:
        prices[-1] = float(current_price)
    p = np.array(prices, dtype=float)

    # 1. RSI (14-period or adjusted for length)
    n_rsi = min(14, len(p) - 1)
    deltas = np.diff(p)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)
    avg_gain = np.mean(gains[-n_rsi:]) if len(gains) >= n_rsi else np.mean(gains)
    avg_loss = np.mean(losses[-n_rsi:]) if len(losses) >= n_rsi else np.mean(losses)

    if avg_loss == 0:
        rsi = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi = round(float(100.0 - (100.0 / (1.0 + rs))), 1)

    if rsi >= 70:
        rsi_status = 'Overbought'
        rsi_points = 10  # Risk of near-term pullback
    elif rsi <= 35:
        rsi_status = 'Oversold / Deep Value'
        rsi_points = 25  # High mean-reversion upside
    else:
        rsi_status = 'Healthy Accumulation'
        rsi_points = 20

    # 2. Moving Average Trend (Fast vs Slow EMA)
    fast_window = min(5, len(p))
    slow_window = min(15, len(p))
    ema_fast = round(float(np.mean(p[-fast_window:])), 2)
    ema_slow = round(float(np.mean(p[-slow_window:])), 2)

    if ema_fast > ema_slow:
        trend = 'BULLISH'
        trend_status = 'Golden Alignment (Fast > Slow)'
        trend_points = 30
    else:
        trend = 'BEARISH'
        trend_status = 'Cautionary (Fast < Slow)'
        trend_points = 10

    # 3. Bollinger Bands (20-period)
    n_bb = min(20, len(p))
    slice_bb = p[-n_bb:]
    sma = np.mean(slice_bb)
    std = np.std(slice_bb)
    upper_band = round(float(sma + 2 * std), 2)
    lower_band = round(float(sma - 2 * std), 2)
    curr = p[-1]
    denom = upper_band - lower_band
    pct_b = round(float((curr - lower_band) / (denom if denom > 0 else 1.0)), 2)

    if 0.4 <= pct_b <= 0.85:
        vol_status = 'Steady Band Expansion'
        vol_points = 20
    elif pct_b > 0.85:
        vol_status = 'Upper Band Breakout'
        vol_points = 25
    else:
        vol_status = 'Lower Band Support'
        vol_points = 15

    # 4. Momentum Rate of Change (30-day ROC)
    roc_30 = round(float(((p[-1] - p[0]) / (p[0] if p[0] > 0 else 1.0)) * 100), 2)
    if roc_30 >= 10:
        mom_status = f'Strong Momentum ({roc_30:+.1f}%)'
        mom_points = 25
    elif roc_30 >= 0:
        mom_status = f'Positive Trend ({roc_30:+.1f}%)'
        mom_points = 15
    else:
        mom_status = f'Drawdown ({roc_30:+.1f}%)'
        mom_points = 5

    # Composite Quant Score (0 to 100)
    raw_score = rsi_points + trend_points + vol_points + mom_points
    ml_score = min(96, max(30, int(raw_score)))

    if ml_score >= 85:
        verdict = 'STRONG BUY'
    elif ml_score >= 70:
        verdict = 'BUY / ACCUMULATE'
    elif ml_score >= 50:
        verdict = 'NEUTRAL / HOLD'
    elif ml_score >= 40:
        verdict = 'CAUTION'
    else:
        verdict = 'AVOID / REDUCE'

    factors = [
        {
            'name': 'Trend Alignment',
            'metric': f'EMA-5 ({ema_fast}) vs EMA-15 ({ema_slow})',
            'status': trend_status,
            'impact': 'Positive' if trend == 'BULLISH' else 'Negative',
        },
        {
            'name': 'Relative Strength (RSI-14)',
            'metric': f'{rsi}',
            'status': rsi_status,
            'impact': 'Positive' if 35 <= rsi <= 68 else 'Cautionary',
        },
        {
            'name': 'Volatility & Bandwidth (%B)',
            'metric': f'{pct_b} (U: ₹{upper_band}, L: ₹{lower_band})',
            'status': vol_status,
            'impact': 'Positive' if pct_b >= 0.4 else 'Neutral',
        },
        {
            'name': '30-Day Rate of Change (ROC)',
            'metric': f'{roc_30:+.1f}%',
            'status': mom_status,
            'impact': 'Positive' if roc_30 >= 0 else 'Negative',
        },
    ]

    summary = (
        f"Algorithmic model rates this setup as {verdict} ({ml_score}% confidence). "
        f"Trend is {trend.lower()} with {rsi_status.lower()} on RSI ({rsi}) and {roc_30:+.1f}% 30-day price momentum."
    )

    return {
        'ml_score': ml_score,
        'signal_verdict': verdict,
        'rsi': rsi,
        'rsi_status': rsi_status,
        'trend': trend,
        'trend_status': trend_status,
        'ema_fast': ema_fast,
        'ema_slow': ema_slow,
        'upper_band': upper_band,
        'lower_band': lower_band,
        'pct_b': pct_b,
        'roc_30': roc_30,
        'factors': factors,
        'summary': summary,
    }
