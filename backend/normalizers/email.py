import re

_EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def normalize_email(value):
    """Lowercase, strip, and validate. Returns None for invalid input."""
    if not value:
        return None
    cleaned = str(value).strip().lower()
    # Some recruiters paste "Name <email>" — pull the address out.
    m = re.search(r"[\w.+\-]+@[\w.\-]+\.[a-z]{2,}", cleaned)
    if not m:
        return None
    addr = m.group(0)
    return addr if _EMAIL_RE.match(addr) else None
