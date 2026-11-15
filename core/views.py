"""
Page views for AutoQuant Boardroom (Django templates).
Syllabus: Unit II (views), III (templates, DTL), IV (forms, POST-redirect-GET),
          VI (session, cookie, login_required).
"""
import json
import logging

from django.contrib import messages
from django.contrib.auth import login, logout
from django.contrib.auth.decorators import login_required, permission_required
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, redirect, render

from core.forms import RiskSettingsForm, SignupForm, SkillUploadForm, TradeFilterForm
from core.models import (
    Portfolio, RiskSettings, SkillProfile, StockSignal, Trade,
)

logger = logging.getLogger('core')


def home(request):
    """Landing page for anonymous users; dashboard summary for logged-in."""
    if request.user.is_authenticated:
        portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
        # SESSION USE (one use): read last_signal_id to offer a resume link
        last_signal_id = request.session.get('last_signal_id')
        last_signal = None
        if last_signal_id:
            try:
                last_signal = StockSignal.objects.get(pk=last_signal_id)
            except StockSignal.DoesNotExist:
                pass
        return render(request, 'home.html', {
            'portfolio': portfolio,
            'last_signal': last_signal,
        })
    return render(request, 'home.html')


def signup(request):
    """User registration. Creates RiskSettings + Portfolio + default skill on success."""
    if request.user.is_authenticated:
        return redirect('home')
    if request.method == 'POST':
        form = SignupForm(request.POST)
        if form.is_valid():
            user = form.save()
            # Create companion objects
            RiskSettings.objects.create(user=user)
            Portfolio.objects.create(user=user)
            # Load default balanced skill
            _create_default_skill(user)
            login(request, user)
            messages.success(request, 'Welcome to AutoQuant Boardroom!')
            return redirect('boardroom')
    else:
        form = SignupForm()
    return render(request, 'registration/signup.html', {'form': form})


def _create_default_skill(user):
    """Create the default balanced skill for a new user."""
    from pathlib import Path
    preset_dir = Path(__file__).resolve().parent / 'skill_presets'
    default_file = preset_dir / 'balanced_default.md'
    if default_file.exists():
        raw = default_file.read_text(encoding='utf-8')
        from core.agents.skills import parse_skill_file
        parsed, _ = parse_skill_file(raw, 'balanced_default.md')
        SkillProfile.objects.create(
            user=user,
            name=parsed.get('name', 'Balanced Default') if parsed else 'Balanced Default',
            description='Default balanced analysis style',
            raw_text=raw,
            parsed=parsed or {},
            is_active=True,
        )
    else:
        SkillProfile.objects.create(
            user=user,
            name='Balanced Default',
            description='Default balanced analysis style',
            raw_text='',
            parsed={'name': 'Balanced Default', 'style': 'balanced',
                    'risk_tolerance': 'medium'},
            is_active=True,
        )


@login_required
def boardroom(request):
    """Render the React Boardroom mount page. Sets the onboarded cookie."""
    active_skill = SkillProfile.objects.filter(
        user=request.user, is_active=True
    ).first()
    portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
    risk, _ = RiskSettings.objects.get_or_create(user=request.user)

    bootstrap = {
        'username': request.user.username,
        'skill_name': active_skill.name if active_skill else 'Default',
        'cash': float(portfolio.cash),
        'total_value': float(portfolio.total_value),
        'risk_settings': {
            'max_position_pct': float(risk.max_position_pct),
            'min_market_cap_usd': risk.min_market_cap_usd,
            'max_trades_per_day': risk.max_trades_per_day,
            'min_ml_confidence': risk.min_ml_confidence,
        },
    }

    response = render(request, 'boardroom.html', {'bootstrap': bootstrap})

    # COOKIE USE (one use, Syllabus Unit VI):
    # Set aq_onboarded cookie after first Boardroom visit to hide the intro
    # tooltip tour on subsequent visits.
    if not request.COOKIES.get('aq_onboarded'):
        response.set_cookie('aq_onboarded', 'true', max_age=365 * 24 * 3600)

    return response


@login_required
def risk_settings(request):
    """Edit risk settings form. POST-redirect-GET with messages flash."""
    rs, _ = RiskSettings.objects.get_or_create(user=request.user)
    if request.method == 'POST':
        form = RiskSettingsForm(request.POST, instance=rs)
        if form.is_valid():
            form.save()
            messages.success(request, 'Risk settings updated successfully.')
            return redirect('risk_settings')
    else:
        form = RiskSettingsForm(instance=rs)
    return render(request, 'settings.html', {'form': form})


@login_required
def skills(request):
    """List skills, upload new ones, activate or delete."""
    user_skills = SkillProfile.objects.filter(user=request.user).order_by('-created_at')

    if request.method == 'POST':
        action = request.POST.get('action', '')

        if action == 'upload':
            form = SkillUploadForm(request.POST, request.FILES)
            if form.is_valid():
                parsed = form._parsed_data
                raw = form._raw_text
                SkillProfile.objects.create(
                    user=request.user,
                    name=parsed.get('name', 'Unnamed Skill'),
                    description=parsed.get('description', ''),
                    raw_text=raw,
                    parsed=parsed,
                    is_active=False,
                )
                messages.success(request, f'Skill "{parsed["name"]}" uploaded successfully.')
                return redirect('skills')
        elif action == 'activate':
            skill_id = request.POST.get('skill_id')
            try:
                skill = SkillProfile.objects.get(pk=skill_id, user=request.user)
                skill.is_active = True
                skill.save()  # save() enforces one active per user
                messages.success(request, f'"{skill.name}" is now active.')
            except SkillProfile.DoesNotExist:
                messages.error(request, 'Skill not found.')
            return redirect('skills')
        elif action == 'delete':
            skill_id = request.POST.get('skill_id')
            try:
                skill = SkillProfile.objects.get(pk=skill_id, user=request.user)
                name = skill.name
                if skill.is_active:
                    messages.error(request, 'Cannot delete the active skill. Activate another first.')
                else:
                    skill.delete()
                    messages.success(request, f'"{name}" deleted.')
            except SkillProfile.DoesNotExist:
                messages.error(request, 'Skill not found.')
            return redirect('skills')
    else:
        form = SkillUploadForm()

    return render(request, 'skills.html', {
        'skills': user_skills,
        'form': form,
    })


@login_required
def skill_download_example(request):
    """Download an example skill file."""
    from pathlib import Path
    preset_dir = Path(__file__).resolve().parent / 'skill_presets'
    example = preset_dir / 'warren_buffett.md'
    if example.exists():
        content = example.read_text(encoding='utf-8')
        response = HttpResponse(content, content_type='text/markdown')
        response['Content-Disposition'] = 'attachment; filename="warren_buffett.md"'
        return response
    return HttpResponse('Example file not found.', status=404)


@login_required
def history(request):
    """Trade history with GET filter form (Syllabus: Unit IV)."""
    form = TradeFilterForm(request.GET)
    trades = Trade.objects.filter(user=request.user).order_by('-created_at')

    if form.is_valid():
        if form.cleaned_data.get('decision'):
            trades = trades.filter(decision=form.cleaned_data['decision'])
        if form.cleaned_data.get('symbol'):
            trades = trades.filter(
                signal__symbol__icontains=form.cleaned_data['symbol']
            )

    return render(request, 'history.html', {'trades': trades, 'form': form})


@login_required
def signal_detail(request, signal_id):
    """Signal detail page. Stores last_signal_id in session (Syllabus: Unit VI)."""
    signal = get_object_or_404(StockSignal, pk=signal_id)
    # SESSION USE (one use, Syllabus Unit VI):
    # Store last viewed signal so the landing page can show "Resume last debate".
    request.session['last_signal_id'] = signal.id
    return render(request, 'signal_detail.html', {'signal': signal})


@login_required
def ticker_detail(request, symbol):
    """Ticker detail page reached via regex URL (Syllabus: Unit II)."""
    signal = StockSignal.objects.filter(symbol=symbol).first()
    return render(request, 'ticker.html', {'signal': signal, 'symbol': symbol})


@login_required
def portfolio_view(request):
    """Dedicated Portfolio and PnL Tracking Dashboard."""
    portfolio, _ = Portfolio.objects.get_or_create(user=request.user)
    signal_map = {s.symbol: s for s in StockSignal.objects.all()}

    holdings_data = []
    total_invested = 0.0
    total_market_value = 0.0

    for h in portfolio.holdings.all():
        sig = signal_map.get(h.symbol)
        ltp = float(sig.price) if sig else float(h.avg_price)
        cost = float(h.avg_price) * h.quantity
        val = ltp * h.quantity
        pnl = val - cost
        pnl_pct = (pnl / cost * 100) if cost > 0 else 0.0

        total_invested += cost
        total_market_value += val

        holdings_data.append({
            'symbol': h.symbol,
            'company_name': sig.company_name if sig else h.symbol,
            'quantity': h.quantity,
            'avg_price': h.avg_price,
            'current_price': ltp,
            'invested_value': cost,
            'market_value': val,
            'unrealized_pnl': pnl,
            'unrealized_pnl_pct': pnl_pct,
        })

    cash = float(portfolio.cash)
    total_equity = cash + total_market_value
    unrealized_pnl = total_market_value - total_invested
    unrealized_pnl_pct = (unrealized_pnl / total_invested * 100) if total_invested > 0 else 0.0

    trades = Trade.objects.filter(user=request.user).select_related('signal').order_by('-created_at')[:20]

    context = {
        'portfolio': portfolio,
        'cash': cash,
        'invested_capital': total_invested,
        'holdings_value': total_market_value,
        'total_value': total_equity,
        'unrealized_pnl': unrealized_pnl,
        'unrealized_pnl_pct': unrealized_pnl_pct,
        'holdings': holdings_data,
        'recent_trades': trades,
    }
    return render(request, 'portfolio.html', context)


@permission_required('core.can_view_audit_log', raise_exception=True)
@login_required
def audit_log(request):
    """Jev audit log — requires can_view_audit_log permission."""
    trades = Trade.objects.filter(
        decision='execute'
    ).select_related('user', 'signal').order_by('-created_at')[:50]
    return render(request, 'audit.html', {'trades': trades})


def syllabus(request):
    """Presentation aid listing every syllabus concept and its location."""
    return render(request, 'syllabus.html')


def custom_404(request, exception):
    """Custom 404 handler."""
    return render(request, '404.html', status=404)


def custom_500(request):
    """Custom 500 handler."""
    return render(request, '500.html', status=500)


def user_logout(request):
    """Log out user and redirect to home."""
    logout(request)
    messages.info(request, 'You have been logged out.')
    return redirect('home')
