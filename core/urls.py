"""
URL configuration for the core app.
Syllabus: Unit II — Views and URL mapping, URL params, regex in URLs.
"""
from django.contrib.auth import views as auth_views
from django.urls import path, re_path

from core import views, api

urlpatterns = [
    # ── Pages (DTL) ──────────────────────────────────────────────────────
    path('', views.home, name='home'),
    path('signup/', views.signup, name='signup'),
    path('login/', auth_views.LoginView.as_view(
        template_name='registration/login.html',
    ), name='login'),
    path('logout/', views.user_logout, name='logout'),
    path('boardroom/', views.boardroom, name='boardroom'),
    path('portfolio/', views.portfolio_view, name='portfolio_view'),
    path('settings/', views.risk_settings, name='risk_settings'),
    path('skills/', views.skills, name='skills'),
    path('skills/download-example/', views.skill_download_example,
         name='skill_download_example'),
    path('history/', views.history, name='history'),

    # URL params (Syllabus: Unit II)
    path('signal/<int:signal_id>/', views.signal_detail, name='signal_detail'),

    # REGEX IN URLs (one use, Syllabus Unit II):
    # re_path uses a regex to match NSE-style ticker symbols like IOLCP.NS
    re_path(
        r'^ticker/(?P<symbol>[A-Z0-9]+\.[A-Z]{2})/$',
        views.ticker_detail,
        name='ticker_detail',
    ),

    path('audit/', views.audit_log, name='audit_log'),
    path('syllabus/', views.syllabus, name='syllabus'),

    # ── JSON API (for React Boardroom) ───────────────────────────────────
    path('api/signals/', api.api_signals, name='api_signals'),
    path('api/signals/search_or_create/', api.api_search_or_create_signal, name='api_search_or_create_signal'),
    path('api/debate/<int:signal_id>/', api.api_debate, name='api_debate'),
    path('api/debate/<int:signal_id>/stream/', api.api_debate_stream, name='api_debate_stream'),
    path('api/debate/<int:signal_id>/regenerate/', api.api_debate_regenerate, name='api_debate_regenerate'),
    path('api/jev-check/', api.api_jev_check, name='api_jev_check'),
    path('api/trade/', api.api_trade, name='api_trade'),
    path('api/chat/', api.api_chat, name='api_chat'),
    path('api/chat/<int:signal_id>/history/', api.api_chat_history, name='api_chat_history'),
    path('api/chat/<int:signal_id>/clear/', api.api_chat_clear, name='api_chat_clear'),
    path('api/signals/<int:signal_id>/quant/', api.api_signal_quant, name='api_signal_quant'),
    path('api/portfolio/', api.api_portfolio, name='api_portfolio'),
    path('api/portfolio/sell/', api.api_portfolio_sell, name='api_portfolio_sell'),
]

# Custom error handlers (Syllabus: Unit II — error handling)
handler404 = 'core.views.custom_404'
handler500 = 'core.views.custom_500'
