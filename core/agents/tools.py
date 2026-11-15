"""
Research tools for the AutoQuant Boardroom chat assistant.

Data sources: fixtures/filings.json and fixtures/news.json (always works).
Keyword router decides which tool to call.
"""
import json
import logging
from pathlib import Path

logger = logging.getLogger('core')

FIXTURES_DIR = Path(__file__).resolve().parent.parent / 'fixtures'


def _load_fixture(filename):
    """Load a JSON fixture file."""
    path = FIXTURES_DIR / filename
    if path.exists():
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}


def get_latest_filing(symbol):
    """Return title, date, and 3-5 key bullet points for a symbol."""
    data = _load_fixture('filings.json')
    filing = data.get(symbol, data.get('_default', {
        'title': f'{symbol} Q2 FY2025 Results',
        'date': '2025-10-28',
        'bullets': [
            'Revenue grew 12% year-over-year',
            'Operating margins expanded by 180 basis points',
            'Management maintained full-year guidance',
            'Free cash flow remained positive',
        ],
    }))
    return filing


def get_news(symbol):
    """Return 3 headlines with sentiment for a symbol."""
    data = _load_fixture('news.json')
    news = data.get(symbol, data.get('_default', [
        {'headline': f'{symbol} reports strong quarterly results', 'sentiment': 'positive'},
        {'headline': f'Sector rotation impacts {symbol} peer group', 'sentiment': 'neutral'},
        {'headline': f'Analysts maintain coverage on {symbol}', 'sentiment': 'neutral'},
    ]))
    return news


def get_price_summary(symbol):
    """Return price, 30-day change, and 52-week range from signal data."""
    from core.models import StockSignal
    try:
        sig = StockSignal.objects.filter(symbol=symbol).latest('created_at')
        sparkline = sig.sparkline or []
        change_30d = 0
        if len(sparkline) >= 2:
            change_30d = round(
                ((sparkline[-1] - sparkline[0]) / sparkline[0]) * 100, 2
            ) if sparkline[0] != 0 else 0
        low_52w = min(sparkline) if sparkline else float(sig.price) * 0.75
        high_52w = max(sparkline) if sparkline else float(sig.price) * 1.25
        return {
            'symbol': symbol,
            'price': float(sig.price),
            'change_30d_pct': change_30d,
            'low_52w': round(low_52w, 2),
            'high_52w': round(high_52w, 2),
        }
    except Exception:
        return {
            'symbol': symbol,
            'price': None,
            'change_30d_pct': None,
            'low_52w': None,
            'high_52w': None,
        }


def route_chat(message, symbol):
    """Keyword router: decide which tool to call and return the response."""
    msg_lower = message.lower()

    if any(kw in msg_lower for kw in ('filing', 'sec', '10-k', '10k', 'annual report')):
        result = get_latest_filing(symbol)
        # Build a friendly reply
        bullets = result.get('bullets', [])
        bullets_text = '\n'.join(f'• {b}' for b in bullets)
        reply = (
            f"Latest filing ({result.get('title', 'N/A')}, "
            f"{result.get('date', 'N/A')}):\n{bullets_text}"
        )
        return {
            'tool': 'get_latest_filing',
            'args': {'symbol': symbol},
            'result': result,
            'reply': reply,
        }

    elif any(kw in msg_lower for kw in ('news', 'headline')):
        result = get_news(symbol)
        headlines = '\n'.join(
            f"• {n['headline']} ({n['sentiment']})" for n in result
        )
        reply = f"Recent headlines for {symbol}:\n{headlines}"
        return {
            'tool': 'get_news',
            'args': {'symbol': symbol},
            'result': result,
            'reply': reply,
        }

    elif any(kw in msg_lower for kw in ('price', 'chart', 'performance')):
        result = get_price_summary(symbol)
        if result['price'] is not None:
            reply = (
                f"{symbol}: ₹{result['price']:,.2f} "
                f"(30-day: {result['change_30d_pct']:+.1f}%, "
                f"52w range: ₹{result['low_52w']:,.2f} – ₹{result['high_52w']:,.2f})"
            )
        else:
            reply = f"No price data available for {symbol}."
        return {
            'tool': 'get_price_summary',
            'args': {'symbol': symbol},
            'result': result,
            'reply': reply,
        }

    else:
        return {
            'tool': None,
            'args': {},
            'result': None,
            'reply': (
                "I can help you research this stock! Try asking about:\n"
                "• **Latest filing** — \"Pull the latest SEC filing\"\n"
                "• **News** — \"What's the latest news?\"\n"
                "• **Price summary** — \"Show me the price performance\""
            ),
        }
