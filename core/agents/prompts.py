"""
System prompt assembly from the user's active skill file.
Used when AUTOQUANT_LLM=anthropic to build LLM prompts.
"""


def build_system_prompt(skill_profile, signal, agent_role='value'):
    """Build a system prompt for the given agent role using the skill profile."""
    parsed = skill_profile.parsed if skill_profile else {}

    style = parsed.get('style', 'balanced')
    risk_tolerance = parsed.get('risk_tolerance', 'medium')
    focus = parsed.get('focus', [])
    avoid = parsed.get('avoid', [])
    instructions = parsed.get('instructions', '')

    style_descriptions = {
        'deep_value': 'You are a deep value investor. Focus on intrinsic value, margin of safety, and long-term fundamentals.',
        'momentum': 'You are a momentum trader. Focus on technical trends, volume patterns, and price action.',
        'balanced': 'You are a balanced analyst. Weigh both fundamental value and market momentum equally.',
    }

    risk_descriptions = {
        'low': 'You are very risk-averse. Emphasize capital preservation and downside protection.',
        'medium': 'You have moderate risk tolerance. Balance risk and reward.',
        'high': 'You are comfortable with higher risk for higher returns. Focus on upside potential.',
    }

    if agent_role == 'value':
        role_prompt = (
            "You are the VALUE AGENT in an investment boardroom debate. "
            "Your job is to argue the BULLISH case for buying this stock. "
            "Present compelling reasons to buy based on fundamental analysis."
        )
    else:
        role_prompt = (
            "You are the RISK AGENT in an investment boardroom debate. "
            "Your job is to argue the BEARISH case and highlight risks. "
            "Present compelling reasons to be cautious or avoid this stock."
        )

    parts = [
        role_prompt,
        style_descriptions.get(style, style_descriptions['balanced']),
        risk_descriptions.get(risk_tolerance, risk_descriptions['medium']),
    ]

    if focus:
        parts.append(f"Focus areas: {', '.join(focus)}.")
    if avoid:
        parts.append(f"Avoid discussing: {', '.join(avoid)}.")
    if instructions:
        parts.append(f"Additional instructions: {instructions}")

    parts.append(
        f"\nThe stock under discussion is {signal.symbol} ({signal.company_name}), "
        f"sector: {signal.sector}, price: ₹{signal.price}, "
        f"market cap: ${signal.market_cap_usd:,}, "
        f"ML confidence: {signal.ml_confidence}%."
    )

    parts.append(
        "\nProvide your argument in JSON format: "
        '{"text": "your argument", "stance": "buy|object", '
        '"evidence": ["point 1", "point 2"], "conviction_delta": -20 to +20}'
    )

    return '\n\n'.join(parts)


def get_personality_tags(skill_profile, agent_role='value'):
    """Return 2 personality tags for the agent seat UI based on the active skill."""
    parsed = skill_profile.parsed if skill_profile else {}
    style = parsed.get('style', 'balanced')

    tags = {
        'deep_value': {
            'value': ['Fundamental', 'Patient'],
            'risk': ['Cautious', 'Thorough'],
        },
        'momentum': {
            'value': ['Trend-follower', 'Aggressive'],
            'risk': ['Contrarian', 'Data-driven'],
        },
        'balanced': {
            'value': ['Analytical', 'Optimistic'],
            'risk': ['Prudent', 'Skeptical'],
        },
    }

    return tags.get(style, tags['balanced']).get(agent_role, ['Analytical', 'Neutral'])
