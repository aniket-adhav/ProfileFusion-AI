import re
from datetime import datetime

_MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}


def normalize_month(value):
    """Return 'YYYY-MM' for a wide range of date inputs, or None."""
    if value is None:
        return None
    s = str(value).strip()
    if not s or s.lower() in {"present", "current", "now"}:
        return None

    # ISO-ish: 2024-01, 2024-01-15, 2024/01.
    m = re.match(r"^(\d{4})[\-/](\d{1,2})", s)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        if 1 <= mo <= 12:
            return f"{y:04d}-{mo:02d}"

    # "January 2024" / "Jan 2024".
    m = re.match(r"^([A-Za-z]{3,9})[\s,]+(\d{4})$", s)
    if m:
        mo = _MONTHS.get(m.group(1).lower())
        if mo:
            return f"{int(m.group(2)):04d}-{mo:02d}"

    # Fallback: try parsing as a full date string.
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.strftime("%Y-%m") if fmt != "%Y" else None
        except ValueError:
            continue
    return None


def normalize_year(value):
    """Extract a 4-digit year, or return None."""
    if value is None:
        return None
    m = re.search(r"(19|20)\d{2}", str(value))
    return int(m.group(0)) if m else None
