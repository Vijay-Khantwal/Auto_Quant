# AutoQuant Boardroom

> **AI Agents Debate. You Decide.**  
> A Django + React boardroom simulation where two AI agents debate a stock, a deterministic compliance guardian (Jev) checks trade limits, and you cast the final vote: **Execute** or **Pass**.

Educational paper-trading simulation. Not financial advice.

---

## ⚡ Quick Start (< 8 Commands)

```bash
# 1. Create and activate virtual environment
python -m venv venv
venv\Scripts\activate          # On Linux/macOS: source venv/bin/activate

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Apply database migrations
python manage.py migrate

# 4. Seed demo users, signals, debates, and skills (idempotent)
python manage.py seed_demo

# 5. Build React frontend
cd frontend && npm install && npm run build && cd ..

# 6. Run development server
python manage.py runserver
```

Open **http://127.0.0.1:8000** in your browser.

---

## 🔑 Demo Credentials

| Role | Username | Password | Notes |
|---|---|---|---|
| **Demo User** | `demo` | `demo1234` | Member of `Analyst` group; has seeded portfolio (virtual cash) and preloaded skills |
| **Superuser** | `admin` | `admin1234` | Full Django Admin access at `/admin/` |

---

## 🎬 3-Minute Demo Script (Class Presentation)

1. **Landing Page (`/`)**:
   - Show the dark "private boardroom" hero and animated CSS agent speech bubbles.
   - Click **Log In** and sign in as `demo / demo1234`.
2. **The Boardroom (`/boardroom/`)**:
   - Point out the active skill badge: `Agents tuned by: Balanced Default`.
   - Click **IOLCP.NS** (87% ML confidence) in the left Signal Feed.
   - Watch the ~15-second real-time debate:
     - **Value Agent** (emerald) highlights the cheap P/E and ~20% margin expansion.
     - **Risk Agent** (coral) objects regarding insider sales and sector headwinds.
     - Observe the **Conviction Bar** tug-of-war animate between Bullish and Cautious as points are scored.
3. **Jev: Deterministic Compliance Review**:
   - Notice Jev's badge ("Not an AI"). The 5 risk checks resolve with animated green checkmarks:
     `position_size`, `market_cap`, `daily_trade_limit`, `cash_available`, `ml_confidence`.
   - Big stamp: **✓ APPROVED**.
   - **Interactive check:** Drag the quantity slider to the right until trade size exceeds your limit (e.g., 50 shares). Jev instantly switches to **✗ BLOCKED**, and **Execute** is immediately greyed out with a reason tooltip! Slide back to re-approve.
4. **Research Assistant (Right Drawer)**:
   - Ask the chat: `"Pull the latest SEC filing"`.
   - Notice the tool chip `🔧 get_latest_filing(IOLCP.NS)` and the key bullet points summary.
   - Try the quick buttons: **News** and **Price**.
5. **Tune the Agents (Skills Page `/skills/`)**:
   - Navigate to `/skills/`.
   - Activate **Crypto Momentum** or upload `crypto_momentum.yaml`.
   - Return to `/boardroom/` and replay the debate to see the agents' personality tags and arguments shift!
6. **Execution & History (`/history/`)**:
   - Click **⚡ Execute**. Enjoy the confetti burst and paper-trading toast!
   - Review the **"What you just learned"** EdTech takeaway card.
   - Visit `/history/` to show the persisted trade log with GET filtering by decision and symbol.
   - Visit `/admin/` to show the models and Jev audit records.
7. **Syllabus Coverage Map (`/syllabus/`)**:
   - Open `/syllabus/` to walk through every requirement and its exact file implementation.

---

## 🐚 Explore with the Django Shell

Run `python manage.py shell` to interact with the models:

```python
# 1. Insert a new StockSignal
from core.models import StockSignal
sig = StockSignal.objects.create(
    symbol="INFY.NS",
    company_name="Infosys Ltd",
    sector="IT Services",
    price=1850.00,
    market_cap_usd=92_000_000_000,
    ml_confidence=79,
    ml_reason="Consolidation breakout with rising RSI",
    sparkline=[1800 + i * 2 for i in range(30)]
)
print("Created:", sig)

# 2. Filter StockSignals with high ML confidence
top_signals = StockSignal.objects.filter(ml_confidence__gte=75)
print("Top signals:", [(s.symbol, s.ml_confidence) for s in top_signals])

# 3. Related lookup: Fetch user's holdings through Portfolio
from django.contrib.auth.models import User
demo = User.objects.get(username="demo")
portfolio = demo.portfolio
print(f"Demo Cash: ₹{portfolio.cash:,.2f}, Total: ₹{portfolio.total_value:,.2f}")
for holding in portfolio.holdings.all():
    print(f"Holding: {holding.symbol} x{holding.quantity} @ ₹{holding.avg_price}")

# 4. Update RiskSettings
risk = demo.risk_settings
risk.max_position_pct = 7.5
risk.save()
print("Updated max position limit to:", risk.max_position_pct, "%")

# 5. Delete a temporary signal
StockSignal.objects.filter(symbol="INFY.NS").delete()
print("Deleted INFY.NS")
```

---

## 🧠 Optional: Real LLM Mode (Anthropic / Azure OpenAI)

The app works completely offline in `DEMO_MODE` with pre-written debates and zero API keys.

To enable live LLM debate generation:
1. Copy `.env.example` to `.env`.
2. Set your provider and API key:
   ```env
   AUTOQUANT_LLM=anthropic
   ANTHROPIC_API_KEY=your_key_here
   ```
   *(Or connect your Azure OpenAI deployment credentials from `.env`).*
3. If an API call fails or times out, AutoQuant silently and gracefully falls back to the deterministic demo fixtures.

---

## 🛠 Optional Debugging Tool: Django Debug Toolbar

To add Django Debug Toolbar for performance profiling in development:
```bash
pip install django-debug-toolbar
```
Then add `'debug_toolbar'` to `INSTALLED_APPS` and `'debug_toolbar.middleware.DebugToolbarMiddleware'` to `MIDDLEWARE` in `autoquant/settings.py`.

---

## 🧪 Running Tests

```bash
python manage.py test
```

All 21 automated unit and integration tests run in under 5 seconds.
