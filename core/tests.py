"""
Tests for AutoQuant Boardroom.
Syllabus: Unit III — Testing.
"""
import json
from decimal import Decimal
from pathlib import Path

from django.contrib.auth.models import User
from django.test import TestCase, Client
from django.urls import reverse, resolve

from core.models import (
    Debate, DebateTurn, Holding, Portfolio, RiskSettings,
    SkillProfile, StockSignal, Trade,
)
from core.jev import evaluate_trade
from core.agents.tools import route_chat


class JevTestCase(TestCase):
    """Test the deterministic compliance engine — the most important tests."""

    def setUp(self):
        """Set up test user, risk settings, portfolio, and signal."""
        self.user = User.objects.create_user('testuser', password='test1234')
        self.risk = RiskSettings.objects.create(
            user=self.user,
            max_position_pct=Decimal('5.0'),
            min_market_cap_usd=50_000_000,
            max_trades_per_day=5,
            min_ml_confidence=60,
        )
        self.portfolio = Portfolio.objects.create(user=self.user, cash=Decimal('100000.00'))
        self.signal = StockSignal.objects.create(
            symbol='TEST.NS',
            company_name='Test Corp',
            sector='Technology',
            price=Decimal('500.00'),
            market_cap_usd=100_000_000,
            ml_confidence=75,
            ml_reason='Strong momentum',
            sparkline=[100 + i for i in range(30)],
        )

    def test_approves_safe_trade(self):
        """Jev approves a trade that passes all 5 checks."""
        result = evaluate_trade(self.user, self.signal, 5)
        self.assertTrue(result['approved'])
        self.assertEqual(len(result['checks']), 5)
        self.assertTrue(all(c['passed'] for c in result['checks']))

    def test_blocks_position_size(self):
        """Jev blocks when trade exceeds max position size."""
        # 50 shares × 500 = 25000, which is 25% of 100000
        result = evaluate_trade(self.user, self.signal, 50)
        self.assertFalse(result['approved'])
        pos_check = next(c for c in result['checks'] if c['rule'] == 'position_size')
        self.assertFalse(pos_check['passed'])

    def test_blocks_market_cap(self):
        """Jev blocks when signal market cap is below minimum."""
        self.signal.market_cap_usd = 10_000_000  # below 50M minimum
        self.signal.save()
        result = evaluate_trade(self.user, self.signal, 5)
        self.assertFalse(result['approved'])
        cap_check = next(c for c in result['checks'] if c['rule'] == 'market_cap')
        self.assertFalse(cap_check['passed'])

    def test_blocks_daily_trade_limit(self):
        """Jev blocks when daily trade limit is reached."""
        self.risk.max_trades_per_day = 0
        self.risk.save()
        result = evaluate_trade(self.user, self.signal, 5)
        self.assertFalse(result['approved'])
        limit_check = next(c for c in result['checks'] if c['rule'] == 'daily_trade_limit')
        self.assertFalse(limit_check['passed'])

    def test_blocks_cash_available(self):
        """Jev blocks when not enough cash for the trade."""
        self.portfolio.cash = Decimal('100.00')
        self.portfolio.save()
        result = evaluate_trade(self.user, self.signal, 5)
        self.assertFalse(result['approved'])
        cash_check = next(c for c in result['checks'] if c['rule'] == 'cash_available')
        self.assertFalse(cash_check['passed'])

    def test_blocks_ml_confidence(self):
        """Jev blocks when ML confidence is below minimum."""
        self.signal.ml_confidence = 30  # below 60 minimum
        self.signal.save()
        result = evaluate_trade(self.user, self.signal, 5)
        self.assertFalse(result['approved'])
        conf_check = next(c for c in result['checks'] if c['rule'] == 'ml_confidence')
        self.assertFalse(conf_check['passed'])

    def test_approved_false_if_any_fails(self):
        """approved is False when even one check fails."""
        self.signal.ml_confidence = 30
        self.signal.save()
        result = evaluate_trade(self.user, self.signal, 5)
        self.assertFalse(result['approved'])
        # Only ml_confidence should fail, rest should pass
        passed = [c for c in result['checks'] if c['passed']]
        failed = [c for c in result['checks'] if not c['passed']]
        self.assertEqual(len(failed), 1)
        self.assertEqual(len(passed), 4)


class TradeAPITestCase(TestCase):
    """Test the trade API endpoint."""

    def setUp(self):
        """Set up test client, user, signal, and debate."""
        self.client = Client()
        self.user = User.objects.create_user('testuser', password='test1234')
        self.risk = RiskSettings.objects.create(user=self.user)
        self.portfolio = Portfolio.objects.create(user=self.user, cash=Decimal('100000.00'))
        self.signal = StockSignal.objects.create(
            symbol='TEST.NS',
            company_name='Test Corp',
            sector='Tech',
            price=Decimal('500.00'),
            market_cap_usd=100_000_000,
            ml_confidence=75,
            ml_reason='Test',
            sparkline=[100 + i for i in range(30)],
        )
        self.debate = Debate.objects.create(
            signal=self.signal,
            user=self.user,
            summary_verdict='Test debate',
            source='demo',
        )
        self.client.login(username='testuser', password='test1234')

    def test_blocked_trade_returns_403(self):
        """A blocked trade returns 403 even if client sends decision=execute."""
        # Make it fail: set ML confidence below threshold
        self.signal.ml_confidence = 30
        self.signal.save()

        response = self.client.post(
            reverse('api_trade'),
            data=json.dumps({
                'signal_id': self.signal.id,
                'debate_id': self.debate.id,
                'decision': 'execute',
                'quantity': 5,
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_approved_trade_updates_portfolio(self):
        """Approved trade updates cash and creates Trade + Holding."""
        initial_cash = self.portfolio.cash

        response = self.client.post(
            reverse('api_trade'),
            data=json.dumps({
                'signal_id': self.signal.id,
                'debate_id': self.debate.id,
                'decision': 'execute',
                'quantity': 5,
            }),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)

        # Check Trade was created
        self.assertTrue(Trade.objects.filter(user=self.user, decision='execute').exists())

        # Check Portfolio updated
        self.portfolio.refresh_from_db()
        expected_cost = Decimal('500.00') * 5
        self.assertEqual(self.portfolio.cash, initial_cash - expected_cost)

        # Check Holding created
        self.assertTrue(Holding.objects.filter(
            portfolio=self.portfolio, symbol='TEST.NS'
        ).exists())


class AuthTestCase(TestCase):
    """Test authentication flows."""

    def test_anonymous_redirected_from_boardroom(self):
        """Anonymous user is redirected from /boardroom/ to login."""
        response = self.client.get(reverse('boardroom'))
        self.assertEqual(response.status_code, 302)
        self.assertIn('/login/', response.url)

    def test_signup_creates_companion_objects(self):
        """Signup creates RiskSettings and Portfolio for the new user."""
        response = self.client.post(reverse('signup'), {
            'username': 'newuser',
            'email': 'new@test.com',
            'password1': 'TestPass123!',
            'password2': 'TestPass123!',
        })
        self.assertEqual(response.status_code, 302)  # redirect

        user = User.objects.get(username='newuser')
        self.assertTrue(hasattr(user, 'risk_settings'))
        self.assertTrue(hasattr(user, 'portfolio'))


class FormTestCase(TestCase):
    """Test form validation."""

    def test_risk_settings_rejects_out_of_range(self):
        """RiskSettingsForm rejects values outside valid range."""
        from core.forms import RiskSettingsForm
        form = RiskSettingsForm(data={
            'max_position_pct': 50,   # max is 25
            'min_market_cap_usd': 50000000,
            'max_trades_per_day': 5,
            'min_ml_confidence': 60,
        })
        self.assertFalse(form.is_valid())

    def test_skill_upload_rejects_txt(self):
        """SkillUploadForm rejects a .txt file."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from core.forms import SkillUploadForm

        file = SimpleUploadedFile('bad.txt', b'name: test', content_type='text/plain')
        form = SkillUploadForm(files={'file': file})
        self.assertFalse(form.is_valid())

    def test_skill_upload_rejects_malformed_yaml(self):
        """SkillUploadForm rejects malformed YAML."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from core.forms import SkillUploadForm

        file = SimpleUploadedFile('bad.yaml', b': : invalid yaml [[[', content_type='text/yaml')
        form = SkillUploadForm(files={'file': file})
        self.assertFalse(form.is_valid())

    def test_skill_upload_accepts_preset(self):
        """SkillUploadForm accepts a valid preset skill file."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        from core.forms import SkillUploadForm

        preset_dir = Path(__file__).resolve().parent / 'skill_presets'
        preset = preset_dir / 'crypto_momentum.yaml'
        if preset.exists():
            content = preset.read_bytes()
            file = SimpleUploadedFile('crypto_momentum.yaml', content, content_type='text/yaml')
            form = SkillUploadForm(files={'file': file})
            self.assertTrue(form.is_valid(), f'Form errors: {form.errors}')


class RegexURLTestCase(TestCase):
    """Test the regex-based ticker URL."""

    def setUp(self):
        """Set up test user, risk settings, portfolio, and signal."""
        self.user = User.objects.create_user('testuser', password='test1234')
        RiskSettings.objects.create(user=self.user)
        Portfolio.objects.create(user=self.user)
        self.client.login(username='testuser', password='test1234')

    def test_ticker_url_resolves(self):
        """/ticker/IOLCP.NS/ resolves and returns 200."""
        # Create a signal so the page has data
        StockSignal.objects.create(
            symbol='IOLCP.NS', company_name='IOL Chemicals',
            sector='Chemicals', price=450, market_cap_usd=80_000_000_000,
            ml_confidence=87, ml_reason='Test', sparkline=[100]*30,
        )
        response = self.client.get('/ticker/IOLCP.NS/')
        self.assertEqual(response.status_code, 200)

    def test_ticker_bad_url_returns_404(self):
        """/ticker/bad/ does not match the regex pattern and returns 404."""
        response = self.client.get('/ticker/bad/')
        self.assertEqual(response.status_code, 404)


class ChatRouterTestCase(TestCase):
    """Test the research chat keyword router."""

    def test_filing_keyword_routes_correctly(self):
        """'pull the latest SEC filing' calls get_latest_filing."""
        StockSignal.objects.create(
            symbol='TEST.NS', company_name='Test', sector='Tech',
            price=100, market_cap_usd=100000000, ml_confidence=70,
            ml_reason='Test', sparkline=[100]*30,
        )
        result = route_chat('pull the latest SEC filing', 'TEST.NS')
        self.assertEqual(result['tool'], 'get_latest_filing')

    def test_news_keyword_routes_correctly(self):
        """'what is the latest news' calls get_news."""
        result = route_chat('what is the latest news', 'TEST.NS')
        self.assertEqual(result['tool'], 'get_news')

    def test_price_keyword_routes_correctly(self):
        """'show me the price' calls get_price_summary."""
        StockSignal.objects.create(
            symbol='TEST.NS', company_name='Test', sector='Tech',
            price=100, market_cap_usd=100000000, ml_confidence=70,
            ml_reason='Test', sparkline=[100]*30,
        )
        result = route_chat('show me the price performance', 'TEST.NS')
        self.assertEqual(result['tool'], 'get_price_summary')

    def test_unknown_returns_help(self):
        """Unknown query returns help text with tool=None."""
        result = route_chat('hello there', 'TEST.NS')
        self.assertIsNone(result['tool'])


class StreamDebateTestCase(TestCase):
    """Test the real-time SSE streaming endpoint for debates."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('streamuser', password='password123')
        self.signal = StockSignal.objects.create(
            symbol='TCS.NS',
            company_name='Tata Consultancy Services',
            sector='Technology',
            price=3800.00,
            market_cap_usd=140_000_000_000,
            ml_confidence=85,
            ml_reason='Strong earnings momentum',
            sparkline=[3800.0] * 30,
        )

    def test_stream_requires_login(self):
        """Anonymous access redirects to login."""
        res = self.client.get(f'/api/debate/{self.signal.id}/stream/')
        self.assertEqual(res.status_code, 302)

    def test_stream_returns_event_stream(self):
        """Logged in user gets text/event-stream content type."""
        self.client.login(username='streamuser', password='password123')
        res = self.client.get(f'/api/debate/{self.signal.id}/stream/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res['Content-Type'], 'text/event-stream')


class PortfolioAndQuantTestCase(TestCase):
    """Test Portfolio PnL tracking, selling, and Quant ML indicators."""

    def setUp(self):
        self.client = Client()
        self.user = User.objects.create_user('portuser', password='password123')
        self.portfolio = Portfolio.objects.create(user=self.user, cash=Decimal('100000.00'))
        self.signal = StockSignal.objects.create(
            symbol='INFY.NS',
            company_name='Infosys Limited',
            sector='Technology',
            price=Decimal('1500.00'),
            market_cap_usd=60_000_000_000,
            ml_confidence=82,
            ml_reason='Breakout momentum',
            sparkline=[1400.0 + i*4 for i in range(30)],
        )
        self.holding = Holding.objects.create(
            portfolio=self.portfolio,
            symbol='INFY.NS',
            quantity=10,
            avg_price=Decimal('1450.00'),
        )
        self.client.login(username='portuser', password='password123')

    def test_portfolio_pnl_calculation(self):
        """api_portfolio correctly returns unrealized PnL."""
        res = self.client.get('/api/portfolio/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data['holdings_count'], 1)
        # Cost = 1450 * 10 = 14500; Current value = 1500 * 10 = 15000; PnL = +500
        holding = data['holdings'][0]
        self.assertEqual(holding['invested_value'], 14500.0)
        self.assertEqual(holding['market_value'], 15000.0)
        self.assertEqual(holding['unrealized_pnl'], 500.0)
        self.assertAlmostEqual(holding['unrealized_pnl_pct'], 3.45, places=1)

    def test_portfolio_sell_holding(self):
        """api_portfolio_sell successfully sells position and credits cash."""
        res = self.client.post('/api/portfolio/sell/', json.dumps({
            'symbol': 'INFY.NS',
            'quantity': 5,
        }), content_type='application/json')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertEqual(data['sold_quantity'], 5)
        self.assertEqual(data['remaining_quantity'], 5)
        # 5 * 1500 = 7500 added to cash (100000 + 7500 = 107500)
        self.assertEqual(data['cash'], 107500.0)

    def test_quant_signal_api(self):
        """api_signal_quant returns explainable multi-factor metrics."""
        res = self.client.get(f'/api/signals/{self.signal.id}/quant/')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('profile', data)
        prof = data['profile']
        self.assertIn('rsi', prof)
        self.assertIn('trend', prof)
        self.assertIn('factors', prof)
        self.assertIn('signal_verdict', prof)

    def test_portfolio_page_view(self):
        """The portfolio HTML page renders with 200 OK."""
        res = self.client.get('/portfolio/')
        self.assertEqual(res.status_code, 200)
        self.assertContains(res, 'INFY.NS')
