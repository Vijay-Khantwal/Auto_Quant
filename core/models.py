"""
Core data models for AutoQuant Boardroom.
Syllabus: Unit V — Models, migrations, ORM, FKs.
"""
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db import models
from django.utils import timezone


class RiskSettings(models.Model):
    """Per-user risk parameters that Jev enforces on every trade."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='risk_settings',
    )
    max_position_pct = models.DecimalField(
        max_digits=5, decimal_places=2, default=5.0,
        validators=[MinValueValidator(0.5), MaxValueValidator(25)],
        help_text='Maximum single-trade size as % of portfolio',
    )
    min_market_cap_usd = models.BigIntegerField(
        default=50_000_000,
        help_text='Minimum market cap in USD',
    )
    max_trades_per_day = models.IntegerField(
        default=5,
        help_text='Max trades allowed per calendar day',
    )
    min_ml_confidence = models.IntegerField(
        default=60,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Minimum ML confidence score (0-100)',
    )

    def __str__(self):
        """String representation of RiskSettings."""
        return f"RiskSettings({self.user.username})"

    class Meta:
        verbose_name_plural = 'Risk settings'


class Portfolio(models.Model):
    """Virtual paper-trading portfolio for a user."""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='portfolio',
    )
    cash = models.DecimalField(
        max_digits=12, decimal_places=2, default=100_000.00,
        help_text='Available virtual cash',
    )

    def __str__(self):
        """String representation of Portfolio."""
        return f"Portfolio({self.user.username}, cash={self.cash})"

    @property
    def total_value(self):
        """Cash plus market value of all holdings."""
        holdings_value = sum(
            h.quantity * h.avg_price for h in self.holdings.all()
        )
        return self.cash + holdings_value


class Holding(models.Model):
    """A single stock position within a portfolio."""
    portfolio = models.ForeignKey(
        Portfolio, on_delete=models.CASCADE, related_name='holdings',
    )
    symbol = models.CharField(max_length=20)
    quantity = models.IntegerField(default=0)
    avg_price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        """String representation of Holding."""
        return f"{self.symbol} x{self.quantity}"

    class Meta:
        unique_together = ('portfolio', 'symbol')


class SkillProfile(models.Model):
    """An uploaded skill file that tunes the AI agents' personality."""
    STYLE_CHOICES = [
        ('deep_value', 'Deep Value'),
        ('momentum', 'Momentum'),
        ('balanced', 'Balanced'),
    ]
    RISK_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='skill_profiles',
    )
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    raw_text = models.TextField(help_text='The uploaded file content verbatim')
    parsed = models.JSONField(
        default=dict,
        help_text='Validated structure extracted from the skill file',
    )
    is_active = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        """String representation of SkillProfile."""
        active = ' ✓' if self.is_active else ''
        return f"{self.name} ({self.user.username}){active}"

    def save(self, *args, **kwargs):
        """Enforce exactly one active skill per user."""
        if self.is_active:
            SkillProfile.objects.filter(
                user=self.user, is_active=True,
            ).exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class StockSignal(models.Model):
    """A buy signal produced by 'the ML model' (seeded for demo)."""
    symbol = models.CharField(max_length=20, db_index=True)
    company_name = models.CharField(max_length=200)
    sector = models.CharField(max_length=100)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    market_cap_usd = models.BigIntegerField()
    ml_confidence = models.IntegerField(
        validators=[MinValueValidator(0), MaxValueValidator(100)],
    )
    ml_reason = models.CharField(max_length=300)
    sparkline = models.JSONField(
        default=list,
        help_text='List of 30 floats for the mini chart',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        """String representation of StockSignal."""
        return f"{self.symbol} ({self.ml_confidence}%)"

    @property
    def market_cap_display(self):
        """Format market cap into Indian Rupees (Cr)."""
        # If market_cap_usd is in raw amount e.g. 50_000_000, convert or display in Cr
        cr = self.market_cap_usd / 10_000_000
        if cr >= 1000:
            return f"₹{cr:,.0f} Cr"
        return f"₹{cr:,.1f} Cr"


class Debate(models.Model):
    """A recorded debate between Value and Risk agents about a signal."""
    SOURCE_CHOICES = [('demo', 'Demo'), ('llm', 'LLM')]

    signal = models.ForeignKey(
        StockSignal, on_delete=models.CASCADE, related_name='debates',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='debates',
    )
    skill_profile = models.ForeignKey(
        SkillProfile,
        on_delete=models.SET_NULL,
        null=True, blank=True,
    )
    summary_verdict = models.CharField(max_length=300, blank=True, default='')
    lesson = models.TextField(
        blank=True, default='',
        help_text='Short educational takeaway shown after the vote',
    )
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='demo')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        """String representation of Debate."""
        return f"Debate on {self.signal.symbol} ({self.source})"


class DebateTurn(models.Model):
    """A single turn in a debate."""
    AGENT_CHOICES = [
        ('value', 'Value Agent'),
        ('risk', 'Risk Agent'),
        ('jev', 'Jev'),
    ]
    STANCE_CHOICES = [
        ('buy', 'Buy'),
        ('object', 'Object'),
        ('neutral', 'Neutral'),
    ]

    debate = models.ForeignKey(
        Debate, on_delete=models.CASCADE, related_name='turns',
    )
    order = models.IntegerField()
    agent = models.CharField(max_length=10, choices=AGENT_CHOICES)
    stance = models.CharField(max_length=10, choices=STANCE_CHOICES)
    text = models.TextField()
    evidence = models.JSONField(
        default=list,
        help_text='List of 1-3 short evidence strings',
    )
    conviction_delta = models.IntegerField(
        default=0,
        validators=[MinValueValidator(-20), MaxValueValidator(20)],
        help_text='Moves the conviction tug-of-war bar',
    )

    def __str__(self):
        """String representation of DebateTurn."""
        return f"Turn {self.order}: {self.agent} ({self.stance})"

    class Meta:
        ordering = ['order']


class Trade(models.Model):
    """A recorded trade decision (execute or pass)."""
    DECISION_CHOICES = [('execute', 'Execute'), ('pass', 'Pass'), ('sell', 'Sell')]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='trades',
    )
    signal = models.ForeignKey(
        StockSignal, on_delete=models.CASCADE, related_name='trades',
    )
    debate = models.ForeignKey(
        Debate, on_delete=models.CASCADE, related_name='trades',
        null=True, blank=True,
    )
    decision = models.CharField(max_length=10, choices=DECISION_CHOICES)
    quantity = models.IntegerField(default=0)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    jev_approved = models.BooleanField(default=False)
    jev_report = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        """String representation of Trade."""
        return f"{self.decision.upper()} {self.signal.symbol} x{self.quantity}"

    class Meta:
        permissions = [
            ('can_view_audit_log', 'Can view Jev audit log'),
        ]


class ChatMessage(models.Model):
    """Saved chat history between user and research assistant/agents for a stock."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='chat_messages',
    )
    signal = models.ForeignKey(
        StockSignal,
        on_delete=models.CASCADE,
        related_name='chat_messages',
    )
    role = models.CharField(max_length=20)  # user, assistant, agent_value, agent_risk
    text = models.TextField()
    tool = models.CharField(max_length=100, blank=True, default='')
    args = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        """String representation of ChatMessage."""
        return f"[{self.role}] {self.signal.symbol}: {self.text[:30]}"

    class Meta:
        ordering = ['created_at']
