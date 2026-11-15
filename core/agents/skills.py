"""
Skill file parser and validator.

Supports .md (YAML front matter between --- lines) and .yaml/.yml (plain mapping).
"""
import re
import yaml


VALID_STYLES = {'deep_value', 'momentum', 'balanced'}
VALID_RISK_TOLERANCES = {'low', 'medium', 'high'}


def parse_skill_file(raw_text, filename=''):
    """Parse a skill file and return (parsed_dict, errors_list)."""
    errors = []
    name_lower = filename.lower()

    # Determine format
    if name_lower.endswith('.md'):
        parts = raw_text.split('---', 2)
        if len(parts) >= 3:
            yaml_text = parts[1]
            instructions_block = parts[2].strip() if len(parts) > 2 else ''
        else:
            return None, ['Markdown files must have YAML front matter between --- lines.']
    else:
        yaml_text = raw_text
        instructions_block = ''

    # Parse YAML (safe_load only — never yaml.load)
    try:
        data = yaml.safe_load(yaml_text)
    except yaml.YAMLError as e:
        return None, [f'Could not parse YAML: {e}']

    if not isinstance(data, dict):
        return None, ['Skill file must contain a YAML mapping.']

    # Required fields
    for field in ('name', 'style', 'risk_tolerance'):
        if field not in data:
            errors.append(f'Missing required field: {field}')

    if errors:
        return None, errors

    # Enum validation
    if data['style'] not in VALID_STYLES:
        errors.append(
            f"Invalid style '{data['style']}'. "
            f"Must be one of: {', '.join(sorted(VALID_STYLES))}"
        )
    if data['risk_tolerance'] not in VALID_RISK_TOLERANCES:
        errors.append(
            f"Invalid risk_tolerance '{data['risk_tolerance']}'. "
            f"Must be one of: {', '.join(sorted(VALID_RISK_TOLERANCES))}"
        )

    if errors:
        return None, errors

    # Merge markdown instructions block into the parsed data
    if instructions_block and 'instructions' not in data:
        data['instructions'] = instructions_block

    # Strip control characters from instructions (untrusted data)
    if 'instructions' in data:
        data['instructions'] = re.sub(
            r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', str(data['instructions'])
        )

    # Normalize optional fields
    data.setdefault('focus', [])
    data.setdefault('avoid', [])
    data.setdefault('instructions', '')
    data.setdefault('description', '')

    return data, []
