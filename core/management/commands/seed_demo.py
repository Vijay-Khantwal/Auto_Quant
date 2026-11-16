"""
Management command to seed demo data.
Idempotent: safe to run multiple times.

Creates: superuser, demo user, signals, debates, skills, sample trades.
Syllabus: Unit V — Admin, groups, users, permissions.
"""
import json
from pathlib import Path

from django.contrib.auth.models import Group, Permission, User
from django.core.management.base import BaseCommand

from core.models import (
    Debate, DebateTurn, Holding, Portfolio, RiskSettings,
    SkillProfile, StockSignal, Trade,
)
from core.agents.skills import parse_skill_file

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / 'fixtures'
PRESETS_DIR = Path(__file__).resolve().parent.parent.parent / 'skill_presets'


class Command(BaseCommand):
    help = 'Seed the database with demo data (idempotent).'

    def handle(self, *args, **options):
        """Execute the seeding process."""
        self.stdout.write('Seeding demo data...')
        self._create_superuser()
        demo = self._create_demo_user()
        self._create_analyst_group(demo)
        signals = self._create_signals()
        self._create_skills(demo)
        self._create_debates(demo, signals)
        self._create_sample_trades(demo, signals)
        self.stdout.write(self.style.SUCCESS('✓ Demo data seeded successfully.'))

    def _create_superuser(self):
        """Create admin superuser."""
        if not User.objects.filter(username='admin').exists():
            User.objects.create_superuser('admin', 'admin@autoquant.dev', 'admin1234')
            self.stdout.write('  Created superuser: admin / admin1234')
        else:
            self.stdout.write('  Superuser admin already exists.')

    def _create_demo_user(self):
        """Create demo user with RiskSettings and Portfolio."""
        user, created = User.objects.get_or_create(
            username='demo',
            defaults={'email': 'demo@autoquant.dev'},
        )
        if created:
            user.set_password('demo1234')
            user.save()
            self.stdout.write('  Created demo user: demo / demo1234')
        else:
            self.stdout.write('  Demo user already exists.')

        # Ensure companion objects
        RiskSettings.objects.get_or_create(user=user)
        portfolio, _ = Portfolio.objects.get_or_create(
            user=user,
            defaults={'cash': 100_000},
        )

        return user

    def _create_analyst_group(self, demo_user):
        """Create Analyst group with can_view_audit_log permission."""
        group, _ = Group.objects.get_or_create(name='Analyst')
        perm = Permission.objects.filter(codename='can_view_audit_log').first()
        if perm:
            group.permissions.add(perm)
        demo_user.groups.add(group)
        self.stdout.write('  Analyst group configured.')

    def _create_signals(self):
        """Load signals from fixture."""
        filepath = FIXTURES_DIR / 'signals.json'
        if not filepath.exists():
            self.stdout.write(self.style.WARNING('  signals.json not found!'))
            return {}

        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        signals = {}
        for item in data:
            sig, created = StockSignal.objects.update_or_create(
                symbol=item['symbol'],
                defaults={
                    'company_name': item['company_name'],
                    'sector': item['sector'],
                    'price': item['price'],
                    'market_cap_usd': item['market_cap_usd'],
                    'ml_confidence': item['ml_confidence'],
                    'ml_reason': item['ml_reason'],
                    'sparkline': item['sparkline'],
                },
            )
            signals[sig.symbol] = sig
            if created:
                self.stdout.write(f'  Created signal: {sig.symbol}')

        return signals

    def _create_skills(self, user):
        """Load preset skill files for the demo user."""
        presets = [
            ('balanced_default.md', True),   # active
            ('warren_buffett.md', False),
            ('crypto_momentum.yaml', False),
        ]

        for filename, is_active in presets:
            filepath = PRESETS_DIR / filename
            if not filepath.exists():
                continue

            if SkillProfile.objects.filter(user=user, name__icontains=filename.split('.')[0].replace('_', ' ')).exists():
                continue

            raw = filepath.read_text(encoding='utf-8')
            parsed, errors = parse_skill_file(raw, filename)
            if errors:
                self.stdout.write(self.style.WARNING(f'  Skill {filename} parse errors: {errors}'))
                continue

            SkillProfile.objects.create(
                user=user,
                name=parsed.get('name', filename),
                description=parsed.get('description', ''),
                raw_text=raw,
                parsed=parsed,
                is_active=is_active,
            )
            self.stdout.write(f'  Created skill: {parsed.get("name", filename)}')

    def _create_debates(self, user, signals):
        """Create debates from fixture for each signal."""
        filepath = FIXTURES_DIR / 'debates.json'
        if not filepath.exists():
            self.stdout.write(self.style.WARNING('  debates.json not found!'))
            return

        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)

        for symbol, signal in signals.items():
            if Debate.objects.filter(signal=signal, user=user).exists():
                continue

            turns_data = data.get(symbol, data.get('_default', []))
            meta = data.get(f'_meta_{symbol}', {})

            if not turns_data:
                continue

            debate = Debate.objects.create(
                signal=signal,
                user=user,
                summary_verdict=meta.get('summary', 'The committee debated this signal.'),
                lesson=meta.get('lesson', 'Always verify ML signals against fundamental analysis.'),
                source='demo',
            )

            for td in turns_data:
                DebateTurn.objects.create(
                    debate=debate,
                    order=td['order'],
                    agent=td['agent'],
                    stance=td['stance'],
                    text=td['text'],
                    evidence=td.get('evidence', []),
                    conviction_delta=td.get('conviction_delta', 0),
                )

            # Add Jev turn
            from core.jev import evaluate_trade
            try:
                risk = user.risk_settings
                portfolio = user.portfolio
                max_value = (portfolio.total_value * risk.max_position_pct) / 100
                default_qty = max(1, int(max_value / signal.price))
            except Exception:
                default_qty = 10

            report = evaluate_trade(user, signal, default_qty)
            last_order = max(td['order'] for td in turns_data) + 1

            if report['approved']:
                jev_text = (
                    f"Compliance review complete. All checks passed. "
                    f"This trade of {default_qty} shares at ₹{signal.price} is within "
                    f"your risk parameters. Proceed if you agree with the committee."
                )
                jev_stance = 'neutral'
            else:
                failed = [c for c in report['checks'] if not c['passed']]
                jev_text = (
                    f"Compliance review complete. {len(failed)} check(s) failed. "
                    f"This trade is BLOCKED. "
                    + ' '.join(c['detail'] for c in failed)
                )
                jev_stance = 'object'

            DebateTurn.objects.create(
                debate=debate,
                order=last_order,
                agent='jev',
                stance=jev_stance,
                text=jev_text,
                evidence=[c['detail'] for c in report['checks']][:3],
                conviction_delta=0,
            )

            self.stdout.write(f'  Created debate for {symbol}')

    def _create_sample_trades(self, user, signals):
        """Create a few historical trades so the History page is not empty."""
        if Trade.objects.filter(user=user).exists():
            return

        # Find debates to reference
        sample_trades = []

        for symbol in ['IOLCP.NS', 'TCS.NS']:
            signal = signals.get(symbol)
            if not signal:
                continue
            debate = Debate.objects.filter(signal=signal, user=user).first()
            if not debate:
                continue

            from core.jev import evaluate_trade
            qty = 10
            report = evaluate_trade(user, signal, qty)

            sample_trades.append(Trade(
                user=user,
                signal=signal,
                debate=debate,
                decision='execute',
                quantity=qty,
                price=signal.price,
                jev_approved=report['approved'],
                jev_report=report,
            ))

        # One pass trade
        for symbol in ['LOWCONF.NS']:
            signal = signals.get(symbol)
            if not signal:
                continue
            debate = Debate.objects.filter(signal=signal, user=user).first()
            if not debate:
                continue
            sample_trades.append(Trade(
                user=user,
                signal=signal,
                debate=debate,
                decision='pass',
                quantity=0,
                price=signal.price,
                jev_approved=False,
                jev_report={'approved': False, 'checks': []},
            ))

        Trade.objects.bulk_create(sample_trades)
        self.stdout.write(f'  Created {len(sample_trades)} sample trade(s).')
