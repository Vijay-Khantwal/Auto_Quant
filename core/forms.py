"""
Forms for AutoQuant Boardroom.
Syllabus: Unit IV — Forms, GET/POST, validation, CSRF.
"""
import re
import yaml
from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.models import User

from core.models import RiskSettings


class RiskSettingsForm(forms.ModelForm):
    """ModelForm for editing per-user risk parameters."""

    class Meta:
        model = RiskSettings
        fields = [
            'max_position_pct',
            'min_market_cap_usd',
            'max_trades_per_day',
            'min_ml_confidence',
        ]
        widgets = {
            'max_position_pct': forms.NumberInput(attrs={
                'class': 'form-input', 'step': '0.5', 'min': '0.5', 'max': '25',
            }),
            'min_market_cap_usd': forms.NumberInput(attrs={
                'class': 'form-input', 'min': '0',
            }),
            'max_trades_per_day': forms.NumberInput(attrs={
                'class': 'form-input', 'min': '1', 'max': '50',
            }),
            'min_ml_confidence': forms.NumberInput(attrs={
                'class': 'form-input', 'min': '0', 'max': '100',
            }),
        }


class SignupForm(UserCreationForm):
    """Extends UserCreationForm with an email field, case-insensitive uniqueness, and whitespace cleanup."""
    email = forms.EmailField(required=True, widget=forms.EmailInput(attrs={
        'class': 'form-input', 'placeholder': 'you@example.com',
    }))

    class Meta:
        model = User
        fields = ['username', 'email', 'password1', 'password2']

    def __init__(self, *args, **kwargs):
        """Initialize form fields with CSS styling classes."""
        super().__init__(*args, **kwargs)
        for field in self.fields.values():
            if 'class' not in field.widget.attrs:
                field.widget.attrs['class'] = 'form-input'

    def clean_username(self):
        username = self.cleaned_data.get('username', '').strip()
        if User.objects.filter(username__iexact=username).exists():
            raise forms.ValidationError("A user with this username already exists.")
        return username

    def clean_email(self):
        email = self.cleaned_data.get('email', '').strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("A user with this email address already exists.")
        return email


class TradeFilterForm(forms.Form):
    """GET form for filtering the trade history page."""
    decision = forms.ChoiceField(
        required=False,
        choices=[('', 'All'), ('execute', 'Execute'), ('pass', 'Pass')],
        widget=forms.Select(attrs={'class': 'form-input'}),
    )
    symbol = forms.CharField(
        required=False,
        max_length=20,
        widget=forms.TextInput(attrs={
            'class': 'form-input', 'placeholder': 'Search symbol…',
        }),
    )


VALID_STYLES = {'deep_value', 'momentum', 'balanced'}
VALID_RISK_TOLERANCES = {'low', 'medium', 'high'}


class SkillUploadForm(forms.Form):
    """Upload and validate a skill file (.md, .yaml, .yml)."""
    file = forms.FileField(
        widget=forms.FileInput(attrs={'class': 'form-input', 'accept': '.md,.yaml,.yml'}),
    )

    def clean_file(self):
        """Validate extension, size, YAML structure, and required fields."""
        f = self.cleaned_data['file']

        # Extension check
        name = f.name.lower()
        if not name.endswith(('.md', '.yaml', '.yml')):
            raise forms.ValidationError(
                'Only .md, .yaml, and .yml files are accepted.'
            )

        # Size check (≤ 20 KB)
        if f.size > 20 * 1024:
            raise forms.ValidationError(
                'File is too large. Maximum size is 20 KB.'
            )

        # Read content
        raw = f.read().decode('utf-8', errors='replace')
        f.seek(0)

        # Parse YAML
        yaml_text = raw
        if name.endswith('.md'):
            # Extract YAML front matter between --- lines
            parts = raw.split('---', 2)
            if len(parts) >= 3:
                yaml_text = parts[1]
            else:
                raise forms.ValidationError(
                    'Markdown files must have YAML front matter between --- lines.'
                )

        try:
            data = yaml.safe_load(yaml_text)
        except yaml.YAMLError as e:
            raise forms.ValidationError(
                f'Could not parse YAML: {e}'
            )

        if not isinstance(data, dict):
            raise forms.ValidationError('Skill file must contain a YAML mapping.')

        # Required fields
        for field in ('name', 'style', 'risk_tolerance'):
            if field not in data:
                raise forms.ValidationError(f'Missing required field: {field}')

        # Enum validation
        if data['style'] not in VALID_STYLES:
            raise forms.ValidationError(
                f"Invalid style '{data['style']}'. "
                f"Must be one of: {', '.join(sorted(VALID_STYLES))}"
            )
        if data['risk_tolerance'] not in VALID_RISK_TOLERANCES:
            raise forms.ValidationError(
                f"Invalid risk_tolerance '{data['risk_tolerance']}'. "
                f"Must be one of: {', '.join(sorted(VALID_RISK_TOLERANCES))}"
            )

        # Strip control characters from instructions (treat as untrusted data)
        if 'instructions' in data:
            data['instructions'] = re.sub(
                r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', str(data['instructions'])
            )

        # Store parsed data on the form for the view to use
        self._parsed_data = data
        self._raw_text = raw

        return f
