import re

from backend.config.skill_aliases import SKILL_ALIASES


def normalize_skills(raw):
    """Accept str | list and return a de-duplicated list of canonical names."""
    if raw is None:
        return []
    if isinstance(raw, str):
        items = re.split(r"[,;|/\n]+", raw)
    elif isinstance(raw, (list, tuple)):
        items = list(raw)
    else:
        items = [str(raw)]

    out, seen = [], set()
    for item in items:
        if item is None:
            continue
        s = str(item).strip()
        if not s:
            continue
        canonical = SKILL_ALIASES.get(s.lower(), s)
        key = canonical.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(canonical)
    return out
