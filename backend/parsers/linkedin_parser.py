"""LinkedIn profile URL parser.

The LinkedIn public API requires OAuth and member consent, so we cannot fetch
the underlying profile. What we *can* do — and what the spec asks for — is
recognize the URL, validate its shape, extract the vanity slug, and contribute
the canonical link (plus a best-effort name guess from the slug) to the merge
engine. Higher-priority structured sources will override the guess when
available.
"""
import re


LINKEDIN_URL_RE = re.compile(
    r"^https?://(?:www\.)?linkedin\.com/in/(?P<slug>[A-Za-z0-9_\-]{3,100})/?(?:\?.*)?$",
    re.IGNORECASE,
)


def extract_slug(url):
    if not url:
        return None
    m = LINKEDIN_URL_RE.match(str(url).strip())
    return m.group("slug") if m else None


def _name_from_slug(slug):
    """Heuristic: ``john-doe-12345`` → ``John Doe``."""
    if not slug:
        return None
    # drop trailing numeric tokens commonly added by LinkedIn
    parts = [p for p in re.split(r"[-_]+", slug) if p and not p.isdigit()]
    if not parts:
        return None
    if len(parts) > 4:
        parts = parts[:4]
    cleaned = [p for p in parts if not re.fullmatch(r"\d+", p)]
    if not cleaned or all(len(p) < 2 for p in cleaned):
        return None
    return " ".join(w.capitalize() for w in cleaned)


def parse_linkedin(url):
    """Return a dict describing the LinkedIn profile, or ``None`` if invalid.

    Shape::

        {
          "slug": str,
          "url": str,                # canonical https://www.linkedin.com/in/<slug>
          "name_guess": str | None,  # human-readable guess; merge engine will defer
        }
    """
    slug = extract_slug(url)
    if not slug:
        return None
    return {
        "slug": slug,
        "url": f"https://www.linkedin.com/in/{slug}",
        "name_guess": _name_from_slug(slug),
    }
