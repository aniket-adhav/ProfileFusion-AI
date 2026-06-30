import re

# E.164 = "+" + 1..3 digit country code + national number, max 15 digits total.
_DIGITS = re.compile(r"\D+")

# Light alpha-2 → dialing-code map for inference when no "+" is present.
_COUNTRY_DIAL = {
    "US": "1", "CA": "1", "GB": "44", "IN": "91", "AU": "61", "DE": "49",
    "FR": "33", "ES": "34", "IT": "39", "NL": "31", "BR": "55", "JP": "81",
    "CN": "86", "SG": "65", "AE": "971", "MX": "52", "ZA": "27", "IE": "353",
}


def normalize_phone(value, country_hint=None):
    """Return an E.164-formatted string, or None if it cannot be parsed."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None

    has_plus = raw.lstrip().startswith("+")
    digits = _DIGITS.sub("", raw)
    if not digits:
        return None

    if has_plus:
        if len(digits) < 8 or len(digits) > 15:
            return None
        return "+" + digits

    # No leading "+"; infer country code.
    cc = _COUNTRY_DIAL.get((country_hint or "").upper())
    if cc:
        # Strip a leading "0" (trunk prefix used in many countries).
        if digits.startswith("0"):
            digits = digits.lstrip("0")
        # If the number already starts with the country code, don't duplicate.
        if not digits.startswith(cc):
            digits = cc + digits
    elif len(digits) == 10:
        # Best-effort default: assume NANP (US/CA).
        digits = "1" + digits

    if len(digits) < 8 or len(digits) > 15:
        return None
    return "+" + digits
