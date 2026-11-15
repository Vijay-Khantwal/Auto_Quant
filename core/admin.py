"""
Admin configuration for AutoQuant Boardroom.
Syllabus: Unit V — Admin, groups, users, permissions.
"""
from django.contrib import admin
from core.models import (
    RiskSettings, Portfolio, Holding, SkillProfile,
    StockSignal, Debate, DebateTurn, Trade,
)


@admin.register(RiskSettings)
class RiskSettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'max_position_pct', 'min_market_cap_usd',
                    'max_trades_per_day', 'min_ml_confidence')
    list_filter = ('max_trades_per_day',)
    search_fields = ('user__username',)


@admin.register(Portfolio)
class PortfolioAdmin(admin.ModelAdmin):
    list_display = ('user', 'cash', 'total_value')
    search_fields = ('user__username',)

    def total_value(self, obj):
        """Format total portfolio value as INR currency string."""
        return f"₹{obj.total_value:,.2f}"
    total_value.short_description = 'Total Value'


@admin.register(Holding)
class HoldingAdmin(admin.ModelAdmin):
    list_display = ('portfolio', 'symbol', 'quantity', 'avg_price')
    list_filter = ('symbol',)
    search_fields = ('symbol', 'portfolio__user__username')


@admin.register(SkillProfile)
class SkillProfileAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'user__username')


@admin.register(StockSignal)
class StockSignalAdmin(admin.ModelAdmin):
    list_display = ('symbol', 'company_name', 'sector', 'price',
                    'ml_confidence', 'created_at')
    list_filter = ('sector',)
    search_fields = ('symbol', 'company_name')


@admin.register(Debate)
class DebateAdmin(admin.ModelAdmin):
    list_display = ('signal', 'user', 'source', 'summary_verdict', 'created_at')
    list_filter = ('source',)
    search_fields = ('signal__symbol', 'user__username')


@admin.register(DebateTurn)
class DebateTurnAdmin(admin.ModelAdmin):
    list_display = ('debate', 'order', 'agent', 'stance', 'conviction_delta')
    list_filter = ('agent', 'stance')


@admin.register(Trade)
class TradeAdmin(admin.ModelAdmin):
    list_display = ('user', 'signal', 'decision', 'quantity', 'price',
                    'jev_approved', 'created_at')
    list_filter = ('decision', 'jev_approved')
    search_fields = ('user__username', 'signal__symbol')
