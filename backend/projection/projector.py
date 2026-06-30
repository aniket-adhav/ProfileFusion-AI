"""Config-driven projection layer — reshape and validate the canonical profile.

Config shape:
{
  "fields": [
    { "path": "primary_email", "from": "emails[0]", "type": "string", "required": true },
    { "path": "phone", "from": "phones[0]", "normalize": "E164" },
    { "path": "skills", "from": "skills[].name", "type": "string[]" }
  ],
  "include_confidence": true,
  "include_provenance": false,
  "on_missing": "include_null" | "omit" | "error"   # default "include_null"
}

The projector accepts three ``on_missing`` modes. ``include_null`` is an alias
for the internal ``null`` mode:

* ``"include_null"`` / ``"null"`` — emit the field with value ``None`` (default).
* ``"omit"``  — drop the field entirely from the projected output.
* ``"error"`` — abort the projection by raising :class:`ProjectionError`.
                The CLI catches this, writes ``projection_report.json`` with
                the failure, and exits non-zero.

After projection the output is validated **against the requested config
schema** (types + required), and a ``projection_report`` is returned so
callers can prove the result matches what the config asked for.
"""
import re


from backend.normalizers.email import normalize_email
from backend.normalizers.phone import normalize_phone
from backend.normalizers.skill import normalize_skills


class ProjectionError(Exception):
    """Raised when ``on_missing='error'`` and a required field is missing."""

    def __init__(self, errors):
        self.errors = errors
        super().__init__(
            "Projection failed: "
            + ", ".join(f"{e['field']} ({e['code']})" for e in errors)
        )


_TOKEN_RE = re.compile(r"\[(\d*)\]|([A-Za-z_][\w]*)")


def get_by_path(obj, expr):
    """Read 'foo.bar[0]' / 'foo[].bar' style paths off a nested object."""
    if not expr:
        return None
    tokens = []
    for m in _TOKEN_RE.finditer(expr):
        if m.group(2):
            tokens.append(("name", m.group(2)))
        else:
            tokens.append(("idx", m.group(1)))

    cur = obj
    for i, (kind, val) in enumerate(tokens):
        if cur is None:
            return None
        if kind == "name":
            if not isinstance(cur, dict):
                return None
            cur = cur.get(val)
        else:
            if val == "":
                rest = tokens[i + 1:]
                if not isinstance(cur, list):
                    return None
                out = []
                for el in cur:
                    sub = el
                    for k2, v2 in rest:
                        if sub is None:
                            break
                        sub = sub.get(v2) if k2 == "name" else (
                            sub[int(v2)] if isinstance(sub, list) else None
                        )
                    if sub is not None:
                        out.append(sub)
                return out
            cur = cur[int(val)] if isinstance(cur, list) and int(val) < len(cur) else None
    return cur


def set_by_path(obj, path, value):
    parts = path.split(".")
    cur = obj
    for p in parts[:-1]:
        cur = cur.setdefault(p, {})
    cur[parts[-1]] = value


def _apply_normalize(value, kind):
    if value is None:
        return None
    if kind == "E164":
        return [normalize_phone(v) for v in value if normalize_phone(v)] if isinstance(value, list) else normalize_phone(value)
    if kind == "email":
        return [normalize_email(v) for v in value if normalize_email(v)] if isinstance(value, list) else normalize_email(value)
    if kind == "canonical":
        return normalize_skills(value) if isinstance(value, list) else value
    if kind == "lower":
        return [str(v).lower() for v in value] if isinstance(value, list) else str(value).lower()
    return value


def _check_type(value, type_str):
    if value is None:
        return type_str.endswith("?")
    base = type_str.rstrip("?")
    if base == "string":     return isinstance(value, str)
    if base == "number":     return isinstance(value, (int, float)) and not isinstance(value, bool)
    if base == "boolean":    return isinstance(value, bool)
    if base == "object":     return isinstance(value, dict)
    if base == "string[]":   return isinstance(value, list) and all(isinstance(v, str) for v in value)
    if base == "number[]":   return isinstance(value, list) and all(isinstance(v, (int, float)) for v in value)
    if base == "object[]":   return isinstance(value, list) and all(isinstance(v, dict) for v in value)
    return True


def _is_missing(value):
    return value is None or (isinstance(value, list) and not value)


def project(profile, config):
    """Project the canonical profile through ``config``.

    Returns ``{"output", "errors", "applied", "report"}``. ``report`` is the
    projection-validation report (see :func:`validate_projection`).

    Raises :class:`ProjectionError` when ``on_missing == "error"`` and a
    required field is missing.
    """
    if not config or not config.get("fields"):
        report = {"valid": True, "errors": [], "checked_fields": [], "mode": "passthrough"}
        return {"output": profile, "errors": [], "applied": False, "report": report}

    on_missing = config.get("on_missing", "null")
    # README/UX uses `include_null`; internal mode is `null`.
    if on_missing == "include_null":
        on_missing = "null"
    if on_missing not in ("null", "omit", "error"):
        raise ValueError(f"Invalid on_missing mode: {config.get('on_missing')!r} (expected include_null|omit|error)")

    out, errors = {}, []
    omitted = []

    for f in config["fields"]:
        src = f.get("from") or f["path"]
        value = get_by_path(profile, src)
        if f.get("normalize"):
            value = _apply_normalize(value, f["normalize"])

        if _is_missing(value):
            required = bool(f.get("required"))
            errors.append({
                "field": f["path"],
                "code": "missing_required" if required else "missing_optional",
                "from": src,
                "required": required,
                "on_missing": on_missing,
            })

            if on_missing == "error" and required:
                # Hard-fail before writing anything else.
                raise ProjectionError([e for e in errors if e["code"] == "missing_required"])
            if on_missing == "omit":
                omitted.append(f["path"])
                continue
            # "null" (or non-required under "error"): emit explicit null.
            value = None

        if f.get("type") and value is not None and not _check_type(value, f["type"]):
            errors.append({
                "field": f["path"], "code": "type_mismatch",
                "expected": f["type"], "got": type(value).__name__,
            })

        set_by_path(out, f["path"], value)

    if config.get("include_confidence"):
        out["_overall_confidence"] = profile.get("overall_confidence")
    if config.get("include_provenance"):
        out["_provenance"] = profile.get("provenance")

    report = validate_projection(out, config, omitted=omitted)
    return {"output": out, "errors": errors, "applied": True, "report": report}


def validate_projection(output, config, omitted=None):
    """Validate the **projected** output against the requested config schema.

    This is distinct from validating the canonical profile — it proves the
    config-shaped result actually matches what the config asked for
    (required fields present, types correct, structure as declared).
    """
    omitted = set(omitted or [])
    errors, warnings, checked = [], [], []
    on_missing = config.get("on_missing", "null")
    if on_missing == "include_null":
        on_missing = "null"

    for f in config.get("fields", []):
        path = f["path"]
        checked.append(path)
        # Walk the projected output along path.
        cur, present = output, True
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                cur, present = None, False
                break

        required = bool(f.get("required"))

        if not present:
            if on_missing == "omit" and path in omitted and not required:
                continue  # expected omission, not an error
            if required:
                errors.append({"field": path, "code": "required_field_absent"})
            else:
                warnings.append({"field": path, "code": "field_absent"})
            continue

        if cur is None:
            if required and on_missing != "null":
                errors.append({"field": path, "code": "required_field_null"})
            continue

        if f.get("type") and not _check_type(cur, f["type"]):
            errors.append({
                "field": path, "code": "type_mismatch",
                "expected": f["type"], "got": type(cur).__name__,
            })

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "checked_fields": checked,
        "mode": on_missing,
    }
