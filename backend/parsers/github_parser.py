"""GitHub profile parser.

Given a public GitHub profile URL (e.g. ``https://github.com/octocat``), fetch
the user's public profile and top repository languages via the GitHub REST API
and return a normalized payload that the extractor can turn into a record.

Network errors degrade gracefully — we return whatever we could derive from
the URL itself (at minimum the username and canonical link).
"""
import json
import re
import urllib.error
import urllib.request


GITHUB_URL_RE = re.compile(
    r"^https?://(?:www\.)?github\.com/(?P<user>[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))/?$",
    re.IGNORECASE,
)
_API = "https://api.github.com"
_TIMEOUT = 8


def _http_json(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "candidate-data-harmonizer/1.0",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
        if resp.status != 200:
            return None
        return json.loads(resp.read().decode("utf-8"))


def extract_username(url_or_user):
    """Accept a full GitHub URL or a bare username; return canonical username."""
    if not url_or_user:
        return None
    s = str(url_or_user).strip()
    if not s:
        return None
    m = GITHUB_URL_RE.match(s)
    if m:
        return m.group("user")
    # bare username fallback
    if re.match(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$", s):
        return s
    return None


def parse_github(url_or_user):
    """Return a dict describing the GitHub profile, or ``None`` if not parsable.

    Shape::

        {
          "username": str,
          "url": str,
          "name": str | None,
          "bio": str | None,
          "location": str | None,
          "blog": str | None,
          "company": str | None,
          "public_repos": int,
          "followers": int,
          "languages": [str, ...],   # top repo languages, frequency-ranked
        }
    """
    user = extract_username(url_or_user)
    if not user:
        return None

    profile_url = f"https://github.com/{user}"
    result = {
        "username": user,
        "url": profile_url,
        "name": None,
        "bio": None,
        "location": None,
        "blog": None,
        "company": None,
        "public_repos": 0,
        "followers": 0,
        "languages": [],
    }

    # Best-effort enrichment from the API.
    try:
        data = _http_json(f"{_API}/users/{user}")
        if data:
            result.update(
                {
                    "name": data.get("name") or None,
                    "bio": data.get("bio") or None,
                    "location": data.get("location") or None,
                    "blog": (data.get("blog") or None) or None,
                    "company": data.get("company") or None,
                    "public_repos": int(data.get("public_repos") or 0),
                    "followers": int(data.get("followers") or 0),
                }
            )
    except (urllib.error.URLError, ValueError, TimeoutError, OSError):
        return result  # degrade gracefully — URL is still useful

    try:
        repos = _http_json(f"{_API}/users/{user}/repos?per_page=30&sort=updated")
        if isinstance(repos, list):
            freq = {}
            for r in repos:
                if not isinstance(r, dict) or r.get("fork"):
                    continue
                lang = r.get("language")
                if lang:
                    freq[lang] = freq.get(lang, 0) + 1
            result["languages"] = [
                lang for lang, _ in sorted(freq.items(), key=lambda kv: (-kv[1], kv[0]))
            ]
    except (urllib.error.URLError, ValueError, TimeoutError, OSError):
        pass

    return result
