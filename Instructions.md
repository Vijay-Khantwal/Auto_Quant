# AutoQuant Boardroom: Build Instructions for the Agent

You are building **AutoQuant Boardroom**, a class presentation project. It is a Django + React web app where a user watches two AI agents debate a stock, a deterministic "compliance officer" (Jev) checks the trade, and the user casts the final vote: **Execute** or **Pass**.

Read this whole file before writing code. Follow it as written. When something is ambiguous, pick the simplest option that keeps the demo impressive and note the choice in `README.md`. Do not ask questions unless something is truly blocking.

---

## 0. Priorities (in order)

1. **Visual and interactive quality** of the Boardroom screen. This is what the class sees.
2. **Completeness and cohesion.** Every page works, links to the next, and has seed data. No dead buttons, no empty states in the demo path.
3. **Django syllabus coverage**, visibly and simply (see section 2).
4. **Simplicity.** The logic can be simple. Prefer readable code with short comments over clever code.

**The demo must work offline with no API keys.** Everything runs in `DEMO_MODE` with pre-written debates and mock tools by default. A real LLM is an optional upgrade, not a requirement.

**Safety framing:** all trading is **paper trading** (virtual money). Show a small persistent footer: *"Educational simulation. Not financial advice."*

---

## 1. Tech Stack and Constraints

| Layer | Choice |
|---|---|
| Backend | Django 5.x, plain Django views returning `JsonResponse` for the API. **Do not use Django REST Framework.** |
| Database | SQLite (configured explicitly in `settings.py`, see syllabus map) |
| Frontend (Boardroom page only) | React 18 + Vite, Tailwind CSS, Framer Motion, lucide-react, recharts (sparkline only) |
| Other pages | Django templates (DTL) with template inheritance, styled by a shared `theme.css` |
| Auth | Django built-in `django.contrib.auth` |
| Optional LLM | Anthropic API via env var `ANTHROPIC_API_KEY`. Falls back to demo mode if missing or failing. |
| Skill file parsing | `PyYAML` |

**Hard rules**
- Do not add features not listed here (no real brokerage, no websockets, no Celery, no Docker, no TypeScript).
- Do not use `localStorage` for anything important. Server is the source of truth.
- Keep regex, cookies, and sessions to **exactly one small use each** (section 2).
- Each Python file should stay readable. Add a one-line docstring per function.

---

## 2. Django Syllabus Coverage Map

Every syllabus concept must appear somewhere real. Include a **"Syllabus Map" page** at `/syllabus/` (a Django template) that lists each concept, where it is used, and the file path. It is a presentation aid and doubles as a checklist.

| Unit | Concept | Where it appears in AutoQuant |
|---|---|---|
| II | Views and URL mapping, request/response | All views in `core/views.py`; `core/urls.py` |
| II | URL params | `/signal/<int:signal_id>/` and `/api/debate/<int:signal_id>/` |
| II | **Regex in URLs (minimal, one use)** | `re_path(r'^ticker/(?P<symbol>[A-Z0-9]+\.[A-Z]{2})/$', ...)` shows a ticker detail page for symbols like `IOLCP.NS` |
| II | Error handling | Custom `404.html` and `500.html`, handler views, JSON errors from the API |
| III | Templates, DTL, tags, variables, for/if | Landing, history, skills, settings, syllabus pages |
| III | Template inheritance | `base.html` with `{% block content %}`; all non-React pages extend it |
| III | Debugging | `DEBUG=True` in dev, `logging` config, one `logger.info` in Jev. Mention Django Debug Toolbar in README (optional install) |
| III | Testing | `core/tests.py` (section 11) |
| IV | Forms, GET/POST, validation | `RiskSettingsForm`, `SkillUploadForm`, `SignupForm`, `TradeFilterForm` (GET) |
| IV | CSRF | `{% csrf_token %}` in forms; React reads the `csrftoken` cookie and sends `X-CSRFToken` header |
| IV | POST-redirect-GET | After saving settings, uploading a skill, or signup, redirect with a `messages` flash |
| V | Models, migrations, ORM, FKs | Section 4 |
| V | Django shell | README section "Explore with the shell" with 5 example ORM commands (insert, update, delete, filter, related lookup) |
| V | Admin, groups, users, permissions | Admin registered for all models; `Analyst` group created by seed command; custom permission `can_view_audit_log` |
| V | Database configuration | Explicit `DATABASES` block with comments |
| VI | **Session (minimal, one use)** | `request.session['last_signal_id']` remembers the last debate viewed; landing page shows "Resume last debate" |
| VI | **Cookie (minimal, one use)** | `aq_onboarded` cookie set via `response.set_cookie` after the first Boardroom visit; hides the intro tooltip tour |
| VI | Users, login/logout, `login_required` | Built-in `LoginView`/`LogoutView`, `@login_required` on all app pages |

---

## 3. Project Structure

```
autoquant/
├── manage.py
├── requirements.txt            # django, pyyaml, anthropic (optional)
├── README.md                   # setup, demo script, shell examples
├── .env.example
├── autoquant/                  # Django project (settings, urls, wsgi)
├── core/                       # the single Django app
│   ├── models.py
│   ├── forms.py
│   ├── views.py                # page views (DTL)
│   ├── api.py                  # JSON views for React
│   ├── urls.py
│   ├── admin.py
│   ├── tests.py
│   ├── jev.py                  # deterministic compliance engine (pure Python)
│   ├── agents/
│   │   ├── debate.py           # builds a debate (demo or LLM)
│   │   ├── prompts.py          # system prompt assembly from skill file
│   │   ├── tools.py            # research tools (mock + optional real)
│   │   └── skills.py           # parse/validate uploaded skill files
│   ├── management/commands/seed_demo.py
│   ├── fixtures/               # signals.json, debates.json, filings.json, news.json
│   ├── skill_presets/          # warren_buffett.md, crypto_momentum.yaml, balanced_default.md
│   ├── templates/
│   │   ├── base.html
│   │   ├── home.html
│   │   ├── registration/login.html
│   │   ├── registration/signup.html
│   │   ├── settings.html
│   │   ├── skills.html
│   │   ├── history.html
│   │   ├── ticker.html
│   │   ├── syllabus.html
│   │   ├── boardroom.html      # mounts React
│   │   ├── 404.html
│   │   └── 500.html
│   └── static/
│       ├── css/theme.css       # design tokens shared by Django pages and React
│       └── boardroom/          # Vite build output (fixed filenames: boardroom.js, boardroom.css)
└── frontend/                   # React source
    ├── package.json
    ├── vite.config.js          # output to core/static/boardroom, fixed filenames, no hashes
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js              # fetch helpers with CSRF header
        ├── hooks/useDebatePlayer.js
        └── components/
            ├── SignalFeed.jsx
            ├── SignalCard.jsx
            ├── BoardroomTable.jsx
            ├── AgentSeat.jsx
            ├── SpeechBubble.jsx
            ├── ConvictionBar.jsx
            ├── JevPanel.jsx
            ├── VoteBar.jsx
            ├── ResearchChat.jsx
            ├── PortfolioSidebar.jsx
            └── Onboarding.jsx
```

**React/Django integration (keep it simple):** `boardroom.html` extends `base.html`, contains `<div id="root"></div>`, passes bootstrap data via `{{ bootstrap|json_script:"bootstrap-data" }}` (username, risk settings, active skill name), and loads `boardroom.js`/`boardroom.css` with `{% static %}`. For development, run `vite build --watch`. No Vite manifest or hashing.

---

## 4. Data Models (`core/models.py`)

Use `settings.AUTH_USER_MODEL` for user FKs. Add `__str__` to every model.

```
RiskSettings          # OneToOne -> User
  max_position_pct     Decimal, default 5.0   (validators 0.5 to 25)
  min_market_cap_usd   BigInteger, default 50_000_000
  max_trades_per_day   Integer, default 5
  min_ml_confidence    Integer, default 60    (0 to 100)

Portfolio             # OneToOne -> User
  cash                 Decimal, default 100000.00   (virtual money)

Holding               # FK -> Portfolio
  symbol, quantity, avg_price

SkillProfile          # FK -> User
  name, description
  raw_text             TextField     (the uploaded file content)
  parsed               JSONField     (validated structure, see section 7)
  is_active            Boolean       (exactly one active per user; enforce in save())
  created_at

StockSignal           # produced by "the ML model" (seeded)
  symbol (e.g. IOLCP.NS), company_name, sector
  price Decimal, market_cap_usd BigInteger
  ml_confidence Integer (0-100), ml_reason (short text)
  sparkline JSONField (list of 30 floats)
  created_at

Debate                # FK -> StockSignal, FK -> User (nullable for shared demo debates)
  skill_profile FK nullable
  summary_verdict      (short text)
  source               CharField choices: "demo", "llm"
  created_at

DebateTurn            # FK -> Debate
  order Integer
  agent                choices: "value", "risk", "jev"
  stance               choices: "buy", "object", "neutral"
  text                 TextField
  evidence             JSONField (list of 1-3 short strings, e.g. "P/E 11.2 vs sector 19")
  conviction_delta     Integer (-20 to +20; moves the tug-of-war bar)

Trade                 # FK -> User, FK -> StockSignal, FK -> Debate
  decision             choices: "execute", "pass"
  quantity, price
  jev_approved         Boolean
  jev_report           JSONField (snapshot of the checks)
  created_at
  class Meta: permissions = [("can_view_audit_log", "Can view Jev audit log")]
```

Create migrations. Register all models in `admin.py` with `list_display`, `list_filter`, and `search_fields` where useful. `TradeAdmin` should show `jev_approved` as a boolean icon.

---

## 5. Jev: The Deterministic Guardian (`core/jev.py`)

Jev is **pure Python with zero LLM calls**. This is the key talking point: *"LLMs advise, Jev decides what is allowed."*

```python
def evaluate_trade(user, signal, quantity) -> dict:
    """Return {"approved": bool, "checks": [ {rule, passed, detail} ... ]}"""
```

Checks (all read from the user's `RiskSettings`, `Portfolio`, and the signal):

1. `position_size`: trade value / total portfolio value ≤ `max_position_pct`
2. `market_cap`: `signal.market_cap_usd` ≥ `min_market_cap_usd`
3. `daily_trade_limit`: trades today < `max_trades_per_day`
4. `cash_available`: cash ≥ trade value
5. `ml_confidence`: `signal.ml_confidence` ≥ `min_ml_confidence`

Rules:
- `approved` is `True` only if **all** checks pass.
- Each check's `detail` is a plain-English sentence, e.g. `"Trade is 7.2% of portfolio; your limit is 5%."`
- Log the result with `logger.info`.
- **Always re-run Jev server-side** when a trade is submitted. Never trust the frontend. If Jev says no, return HTTP 403 with the report.
- Default trade quantity: computed as the largest whole-share quantity at or under `max_position_pct`. The user can adjust it with a slider in the UI, and Jev re-checks live via `POST /api/jev-check/` (debounced).

---

## 6. Debates (`core/agents/debate.py`)

**Function:** `get_or_create_debate(user, signal) -> Debate`

- **Demo mode (default):** load a pre-written debate from `fixtures/debates.json` keyed by symbol. Each debate has 5 to 7 turns alternating Value, Risk, Value, Risk, then a final Jev line. If a symbol has no fixture, generate a generic templated debate from the signal's fields so nothing ever breaks.
- **LLM mode** (`AUTOQUANT_LLM=anthropic` and key present): build the system prompt from the user's active skill (section 7), ask for strict JSON matching the `DebateTurn` shape, validate it, save it. On any error or invalid JSON, **fall back to demo mode silently** and log a warning.
- Cache: one debate per (user, signal, skill). Replays do not regenerate.
- The Jev turn at the end is **not LLM-generated**. It is built from the real `evaluate_trade` result so the narration always matches the actual button state.

**Required demo content:** the headline debate must be for `IOLCP.NS`:
- Value Agent: cheap P/E, ~20% margin expansion.
- Risk Agent: CEO sold ~10% of shares, regulatory headwinds in the sector.
- Add one rebuttal each, then Jev's verdict.

Seed at least 6 signals. Design them so the demo shows both outcomes:
- 3 signals that Jev **approves** (including IOLCP.NS at default settings).
- 1 signal that fails **market cap** (a micro-cap).
- 1 signal that fails **position size** at the default quantity until the slider is lowered.
- 1 signal that fails **ML confidence**.

---

## 7. Custom Skill Files (`core/agents/skills.py`)

Users upload `.md` or `.yaml`/`.yml` files from the Skills page. **Support both.**

**Format:**
- `.yaml`: a plain mapping.
- `.md`: YAML front matter between `---` lines, followed by free-text instructions.

**Fields:**
```yaml
name: Warren Buffett Value
style: deep_value            # one of: deep_value, momentum, balanced
risk_tolerance: low          # low | medium | high
focus: [moat, free_cash_flow, management_quality]
avoid: [hype, leverage]
instructions: |              # free text injected into the agent prompts
  Only favor businesses with durable competitive advantages...
```

**Validation (in `SkillUploadForm.clean_file`):**
- Extension must be `.md`, `.yaml`, or `.yml`; size ≤ 20 KB.
- Must parse with `yaml.safe_load` (never `yaml.load`).
- Required: `name`, `style`, `risk_tolerance`. Enum fields must be valid.
- Show friendly form errors, not stack traces.
- Strip control characters from `instructions`. Treat file content as **untrusted data** inserted into a prompt, never as code.

**Behavior:**
- Saved as a `SkillProfile`. The user can click "Activate" (POST, then redirect).
- Active skill name is shown in the Boardroom header as a pill: `Agents tuned by: Warren Buffett Value`.
- In demo mode, the skill changes the **personality tags and tone shown on agent seats** and picks a matching fixture variant if one exists (for example, `deep_value` vs `momentum` text for the Value Agent). In LLM mode, it drives the prompt.
- Ship three presets in `skill_presets/` and load them for the demo user: `warren_buffett.md`, `crypto_momentum.yaml`, `balanced_default.md`. Offer a **"Download example skill file"** link on the Skills page.

---

## 8. Research Tools and Chat (`core/agents/tools.py`)

Endpoint: `POST /api/chat/` with `{message, signal_id}`.

Tools (plain Python functions):
- `get_latest_filing(symbol)` returns title, date, and 3 to 5 key bullet points.
- `get_news(symbol)` returns 3 headlines with sentiment.
- `get_price_summary(symbol)` returns price, 30-day change, and 52-week range.

**Data sources:** read from `fixtures/filings.json` and `fixtures/news.json` (mock, always works). Optionally, if a US ticker (no `.NS` suffix) and network access is available, `get_latest_filing` may call SEC EDGAR. Note in the README that NSE stocks use exchange filings, mocked here. Any real call must have a 5-second timeout and fall back to the mock.

**Routing (keep it dumb and reliable):** a keyword router decides which tool to call:
- contains "filing", "sec", "10-k", "annual report" → `get_latest_filing`
- contains "news", "headline" → `get_news`
- contains "price", "chart", "performance" → `get_price_summary`
- otherwise → a friendly help reply listing what it can do.

**Response shape:**
```json
{
  "tool": "get_latest_filing",
  "args": {"symbol": "IOLCP.NS"},
  "result": {...},
  "reply": "Latest filing (Q2 results, 28 Oct): revenue up 14%, margins ..."
}
```
The `reply` is templated in demo mode (LLM-summarized if LLM mode is on). The UI must **show the tool call as a chip** (e.g., `🔧 get_latest_filing(IOLCP.NS)`) with a short "running…" animation before the answer appears.

---

## 9. URLs and Endpoints (`core/urls.py`)

**Pages (DTL, all `@login_required` except home, login, signup, syllabus, 404/500):**

| URL | View | Notes |
|---|---|---|
| `/` | `home` | Landing for anonymous users; dashboard summary for logged-in (portfolio value, last debate resume link from session) |
| `/signup/` | `signup` | `SignupForm` (extends `UserCreationForm`, adds email). On success: create `RiskSettings` + `Portfolio` + default skill, log in, redirect |
| `/login/`, `/logout/` | Django auth views | `LOGIN_REDIRECT_URL='/boardroom/'` |
| `/boardroom/` | `boardroom` | Renders the React mount page; sets `aq_onboarded` cookie |
| `/settings/` | `risk_settings` | `RiskSettingsForm` (ModelForm), POST-redirect-GET |
| `/skills/` | `skills` | List + upload form + activate/delete |
| `/history/` | `history` | Trades list with `TradeFilterForm` (GET: decision filter, symbol search) |
| `/signal/<int:signal_id>/` | `signal_detail` | Stores `last_signal_id` in session; links to boardroom |
| `/ticker/<regex symbol>/` | `ticker_detail` (`re_path`) | e.g. `/ticker/IOLCP.NS/` |
| `/audit/` | `audit_log` | Requires `core.can_view_audit_log`; shows Jev reports |
| `/syllabus/` | `syllabus` | Presentation aid |

**JSON API (all `@login_required`, JSON errors with proper status codes):**

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/signals/` | GET | Signal feed |
| `/api/debate/<int:signal_id>/` | GET | Debate turns plus initial Jev report for the default quantity |
| `/api/jev-check/` | POST | `{signal_id, quantity}` returns Jev report (live slider checks) |
| `/api/trade/` | POST | `{signal_id, debate_id, decision, quantity}`; re-runs Jev; records Trade; updates Portfolio |
| `/api/chat/` | POST | Research assistant |
| `/api/portfolio/` | GET | Cash, holdings, total value |

Error handling: any exception in an API view returns `{"error": "..."}` with 4xx/5xx. Set `handler404` and `handler500` to render the custom templates.

---

## 10. UI/UX Specification (most important section)

### 10.1 Design System (`theme.css`, mirrored in Tailwind config)

- **Mood:** premium dark "private boardroom". Think glass panels on deep navy with warm gold accents.
- **Palette (CSS variables):**
  - `--bg: #0B1020`, `--panel: rgba(255,255,255,0.05)`, `--border: rgba(255,255,255,0.10)`
  - `--text: #E8ECF5`, `--muted: #8B93A7`
  - `--value: #34D399` (emerald, Value Agent)
  - `--risk: #F87171` (coral, Risk Agent)
  - `--jev: #60A5FA` (blue, Jev)
  - `--gold: #F5C451` (accents, user chair, primary CTA)
- **Typography:** Google Fonts "Inter" for UI and "JetBrains Mono" for numbers/tickers. Always include fallbacks.
- **Style:** rounded-2xl glass cards with backdrop blur, soft glows, 1px borders, generous spacing. Smooth 200 to 300 ms transitions. Respect `prefers-reduced-motion`.
- The Django pages (landing, settings, etc.) must use the same tokens so the app feels like one product. Landing page needs a hero with a headline, a short animated preview (CSS-only) of agent bubbles, and clear Sign up / Log in buttons.

### 10.2 Boardroom Screen Layout (desktop first, responsive down to tablet)

```
┌──────────────────────────────────────────────────────────────────────┐
│ Header: AutoQuant logo · skill pill · cash · "Syllabus" link · logout│
├───────────────┬──────────────────────────────────┬───────────────────┤
│ SIGNAL FEED   │          THE BOARDROOM           │ RESEARCH CHAT     │
│ (left, cards) │  ┌─────────┐        ┌─────────┐  │ (right drawer)    │
│               │  │ VALUE   │        │  RISK   │  │                   │
│ IOLCP.NS  87  │  │ agent   │        │  agent  │  │ messages + tool   │
│ ...           │  └─────────┘        └─────────┘  │ chips             │
│               │   speech bubbles appear below    │                   │
│               │   ──── Conviction tug-of-war ─── │ quick prompts:    │
│               │        ┌──── JEV ────┐           │ [Latest filing]   │
│               │        │ checklist   │           │ [News] [Price]    │
│               │        └─────────────┘           │                   │
│               │  [ Pass ]  Qty slider  [Execute ]│                   │
├───────────────┴──────────────────────────────────┴───────────────────┤
│ Portfolio strip: cash · holdings chips · footer disclaimer           │
└──────────────────────────────────────────────────────────────────────┘
```

### 10.3 Components and Behaviors

**SignalFeed / SignalCard**
- Cards show ticker (mono font), company, sector, price, and a circular **ML confidence ring** (SVG, animated fill on mount, color shifts amber to green by score). Tiny recharts sparkline.
- Selected card has a gold border glow. Clicking loads the debate. Staggered fade-in on first load.

**BoardroomTable + AgentSeat**
- Two agent seats (Value left, Risk right) with avatar circles (use lucide icons: `TrendingUp`, `ShieldAlert`; no external images), name, role, and 2 personality tags taken from the active skill.
- The **speaking agent** gets a pulsing colored ring and slight scale-up; the other dims slightly.
- Jev appears in the center-bottom as a badge-style "Compliance Officer" with a lock icon, visually distinct (squared shape, blue) to emphasize it is not an LLM.

**SpeechBubble + typewriter**
- Each turn appears as a bubble on its agent's side with a **typewriter effect** (character-by-character). Evidence appears as small chips below the bubble that pop in after the text finishes (e.g., `P/E 11.2 vs sector 19`).
- Previous bubbles stay in a scrollable transcript, slightly faded.

**`useDebatePlayer` hook (the "15-second real-time debate")**
- Takes the turns array; plays them sequentially, with per-turn duration proportional to text length, scaled so the full debate lasts about **15 seconds** (clamp 12 to 18 s).
- Controls: **Pause/Play**, **Skip to end**, **Replay**, and a progress bar. While playing, Execute/Pass are visible but locked with the tooltip "Hear the committee first".
- Each turn applies its `conviction_delta` to the tug-of-war bar as it appears.

**ConvictionBar (tug-of-war)**
- A horizontal bar: emerald (Value) on the left, coral (Risk) on the right, with a glowing marker that slides with spring animation. Labels: "Bullish" / "Cautious". Starts centered.

**JevPanel (the visual climax)**
- After the debate ends, Jev "reviews the trade": the 5 checks appear one by one (about 300 ms apart) with a spinner that resolves to a green ✓ or red ✗, each with its plain-English detail.
- Final stamp animation: **APPROVED** (green) or **BLOCKED** (red) with a subtle shake on blocked.
- A caption under the panel: *"Jev is rule-based code, not an AI. It can't be talked into anything."*
- When the user moves the quantity slider, the panel re-checks live (debounced 300 ms via `/api/jev-check/`) and updates in place.

**VoteBar (Execute / Pass)**
- Big gold **Execute** button and a ghost **Pass** button, with the quantity slider and estimated trade value between them.
- **Execute is disabled and greyed out whenever Jev says BLOCKED**, with a tooltip that lists the failing rules. The Pass button is always available.
- On Execute: confetti-style burst (simple CSS/Framer particles, no heavy library), a toast `Bought 40 × IOLCP.NS (paper)`, and the portfolio strip number animates (count-up).
- On Pass: a quiet toast and the next signal is auto-selected.
- After any decision, show a short **"What you just learned"** card (1 to 2 sentences, from a `lesson` field on the debate, e.g., *"Insider selling can signal that executives see limited upside. Always check it against valuation."*). This is the EdTech hook.

**ResearchChat**
- Right-side panel with message bubbles, three quick-prompt buttons (Latest filing, News, Price summary) and a free-text input.
- Show the tool-call chip with a running animation, then the answer. Typing indicator while waiting. Handle errors gracefully with an inline message.

**PortfolioSidebar / strip**
- Cash, total value, holdings as chips. Updates after each trade.

**Onboarding**
- If the `aq_onboarded` cookie is absent, show a 3-step tooltip tour: "These are your analysts", "Jev guards your risk limits", "You make the final call". Dismissible.

**States**
- Skeleton loaders for the feed and debate, friendly empty states, and error toasts. No blank screens at any time.

---

## 11. Testing (`core/tests.py`)

Use Django `TestCase`. Keep it readable. Minimum:

1. **Jev (most important):** approves a safe trade; blocks each of the 5 rules individually (5 small tests); `approved` is False if any check fails.
2. **Trade API:** blocked trade returns 403 even if the client sends `decision=execute`; approved trade updates cash and creates a `Trade` plus `Holding`.
3. **Auth:** anonymous user is redirected from `/boardroom/` to login; signup creates `RiskSettings` and `Portfolio`.
4. **Forms:** `RiskSettingsForm` rejects out-of-range values; `SkillUploadForm` rejects a `.txt` file and malformed YAML, and accepts the preset files.
5. **Regex URL:** `/ticker/IOLCP.NS/` resolves (200) and `/ticker/bad/` returns 404.
6. **Chat router:** "pull the latest SEC filing" calls `get_latest_filing`.

Run with `python manage.py test`. All tests must pass before you finish.

---

## 12. Seed Data and Admin (`seed_demo` command)

`python manage.py seed_demo` must be **idempotent** and create:
- Superuser `admin / admin1234`
- Demo user `demo / demo1234` with `RiskSettings` defaults, a `Portfolio` (cash 100000), and the three preset skills (Balanced active)
- The 6+ `StockSignal` rows, plus their debates from fixtures
- Group `Analyst` with permission `can_view_audit_log`, and `demo` added to it (so the audit page works for the demo)
- A few historical `Trade` rows so the History page is not empty

---

## 13. Build Order (do these in sequence, verify each)

1. **Scaffold:** project, app, settings (explicit DB config, static, templates, messages, auth redirects), `theme.css`, `base.html`, landing page.
2. **Models + migrations + admin + `seed_demo`.** Verify in admin.
3. **Auth pages:** signup, login, logout; `login_required` on app pages.
4. **Jev + its tests.** Get these green first.
5. **API:** signals, debate, jev-check, trade, chat, portfolio.
6. **Django pages:** settings, skills (with upload + validation), history (with filter), ticker (regex), signal detail (session), audit, syllabus, 404/500.
7. **React Boardroom:** build components in this order: SignalFeed → BoardroomTable/AgentSeat → `useDebatePlayer` + SpeechBubble → ConvictionBar → JevPanel → VoteBar → ResearchChat → PortfolioSidebar → Onboarding → polish and animation pass.
8. **Polish:** loading/empty/error states, responsive check, reduced-motion check.
9. **README + final test run.**

---

## 14. README Must Contain

- Setup in under 8 commands (create venv, install, migrate, seed, `npm install && npm run build`, runserver).
- Demo credentials.
- A **3-minute demo script** for the presentation:
  1. Landing page, then login as `demo`.
  2. Boardroom: select **IOLCP.NS**, watch the debate, point out the conviction bar.
  3. Jev reviews: all green. Drag the slider up until position size fails; Execute greys out.
  4. Ask the chat: "pull the latest SEC filing", then show the tool chip.
  5. Upload `crypto_momentum.yaml`, activate it, and replay to show the agents' tone change.
  6. Execute a trade, then show History and the Admin panel.
  7. Open `/syllabus/` to map the project to the course.
- "Explore with the shell" with 5 ORM examples.
- A short "How to enable real LLM mode" section.

---

## 15. Definition of Done

- [ ] `python manage.py test` passes.
- [ ] Fresh clone + README steps yields a working app with seeded data.
- [ ] The Boardroom screen: debate plays in about 15 s with typewriter bubbles, conviction bar, Jev checklist, and a working Execute/Pass flow.
- [ ] Execute is greyed out with a reason tooltip when Jev blocks, and the server also rejects the trade.
- [ ] Skill upload accepts valid `.md` and `.yaml`, rejects invalid files with friendly errors, and visibly changes the agents' presentation.
- [ ] Research chat returns a tool chip plus a summary for filings, news, and price.
- [ ] Every syllabus concept in section 2 is present and listed on `/syllabus/`.
- [ ] Regex, session, and cookie are each used exactly once and are explained in code comments.
- [ ] Works fully offline with no API keys.
- [ ] No console errors in the browser; no unhandled 500s on the demo path.