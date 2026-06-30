"""Lightweight structural validator for the canonical profile."""
import re

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
_E164_RE = re.compile(r"^\+\d{8,15}$")


def validate_profile(profile):
    errors, warnings = [], []

    if not profile.get("candidate_id"):
        errors.append({"field": "candidate_id", "code": "missing"})
    if not profile.get("full_name"):
        warnings.append({"field": "full_name", "code": "missing"})

    for e in profile.get("emails") or []:
        if not _EMAIL_RE.match(e or ""):
            errors.append({"field": "emails", "code": "invalid_format", "value": e})
    for p in profile.get("phones") or []:
        if not _E164_RE.match(p or ""):
            errors.append({"field": "phones", "code": "not_e164", "value": p})

    loc = profile.get("location")
    if loc and loc.get("country") and not re.match(r"^[A-Z]{2}$", str(loc["country"])):
        warnings.append({"field": "location.country", "code": "not_iso_alpha2", "value": loc["country"]})

    oc = profile.get("overall_confidence")
    if not isinstance(oc, (int, float)) or not 0 <= oc <= 1:
        errors.append({"field": "overall_confidence", "code": "out_of_range", "value": oc})

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "checked_fields": [
            "candidate_id", "full_name", "emails", "phones",
            "location.country", "overall_confidence",
        ],
    }
