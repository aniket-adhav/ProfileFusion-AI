"""Extract candidate fields from raw source payloads into a uniform "record"
shape that the merge engine can combine across sources.
"""
import re

from backend.normalizers.email import normalize_email
from backend.normalizers.phone import normalize_phone
from backend.normalizers.skill import normalize_skills
from backend.normalizers.location import normalize_location
from backend.normalizers.date import normalize_month, normalize_year
from backend.config.skill_aliases import SKILL_ALIASES


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
# Strict phone matcher: requires either a leading "+" country code, parenthesized
# area code, or explicit separators between groups. Bare digit runs (years, IDs,
# digits embedded in URLs/slugs) are rejected.
PHONE_RE = re.compile(
    r"(?:(?<![\w/+.-]))"
    r"(?:"
    r"\+\d{1,3}[\s.\-]\d{2,4}[\s.\-]?\d{3,4}[\s.\-]?\d{3,4}"
    r"|\+\d{10,15}"
    r"|\(\d{2,4}\)\s*\d{3,4}[\s.\-]?\d{3,4}"
    r"|\d{3,4}[\s.\-]\d{3,4}[\s.\-]\d{3,4}"
    r")"
    r"(?![\w/-])"
)
URL_STRIP_RE = re.compile(r"https?://\S+", re.I)
LINKEDIN_RE = re.compile(r"https?://(?:www\.)?linkedin\.com/in/[A-Za-z0-9_\-]+", re.I)
GITHUB_RE = re.compile(r"https?://(?:www\.)?github\.com/[A-Za-z0-9_\-]+", re.I)
URL_RE = re.compile(r"https?://[\w.\-]+\.[A-Za-z]{2,}(?:/[\w./?&=%\-]*)?")
HEADLINE_HINT = re.compile(
    r"(engineer|developer|intern|manager|designer|scientist|analyst|consultant|lead|architect|student)",
    re.I,
)
EXP_YEARS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*\+?\s*years?\s+(?:of\s+)?experience", re.I)
SUMMARY_HEADER_RE = re.compile(
    r"^\s*(professional\s+summary|summary|profile|about\s+me|objective)\s*:?\s*$",
    re.I,
)
SECTION_HEADER_RE = re.compile(
    r"^\s*(skills|experience|work\s+experience|projects|education|achievements|"
    r"certifications|awards|publications|contact|languages|interests|hobbies)\s*:?\s*$",
    re.I,
)


def _uniq(seq):
    seen, out = set(), []
    for v in seq:
        if not v:
            continue
        key = v.lower() if isinstance(v, str) else v
        if key in seen:
            continue
        seen.add(key)
        out.append(v)
    return out


def _skills_from_text(text, source):
    found, seen = [], set()
    lower = text.lower()
    for alias, canonical in SKILL_ALIASES.items():
        safe = re.escape(alias)
        if re.search(rf"(?:^|[^a-z0-9]){safe}(?:[^a-z0-9]|$)", lower):
            key = canonical.lower()
            if key in seen:
                continue
            seen.add(key)
            found.append({"name": canonical, "source": source, "method": "keyword_match"})
    return found


def _name_from_text(text):
    for line in [l.strip() for l in text.splitlines() if l.strip()][:6]:
        if re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$", line):
            return line
    return None


def _headline_from_text(text):
    for line in [l.strip() for l in text.splitlines() if l.strip()][:8]:
        if 6 <= len(line) <= 90 and not re.search(r"@|http|\d{3,}", line) and HEADLINE_HINT.search(line):
            return line
    return None


def _location_from_text(text):
    m = re.search(
        r"\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\s*,\s*([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\b",
        text,
    )
    return normalize_location(f"{m.group(1)}, {m.group(2)}") if m else None


def _links_from_text(text):
    linkedin = (LINKEDIN_RE.search(text) or [None]) and (LINKEDIN_RE.search(text).group(0) if LINKEDIN_RE.search(text) else None)
    github = GITHUB_RE.search(text).group(0) if GITHUB_RE.search(text) else None
    other = []
    for u in URL_RE.findall(text):
        u = u.rstrip(".,;")
        if u == linkedin or u == github:
            continue
        if u not in other:
            other.append(u)
    return {"linkedin": linkedin, "github": github, "portfolio": None, "other": other}


def _summary_from_text(text):
    """Extract the Professional Summary block from a resume.

    Looks for a header line like 'PROFESSIONAL SUMMARY' / 'SUMMARY' / 'PROFILE'
    and returns the paragraph(s) that follow, stopping at the next section header.
    """
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if SUMMARY_HEADER_RE.match(line):
            collected = []
            for nxt in lines[i + 1:]:
                if not nxt.strip():
                    if collected:
                        break
                    continue
                if SECTION_HEADER_RE.match(nxt) or SUMMARY_HEADER_RE.match(nxt):
                    break
                collected.append(nxt.strip())
            summary = " ".join(collected).strip()
            if 20 <= len(summary) <= 2000:
                return summary
            return summary or None
    return None


# ---------- Public API ----------

def record_from_csv_row(row, source="recruiter_csv"):
    location = normalize_location(row.get("location") or row.get("city") or row.get("address"))
    country = (location or {}).get("country") if location else None
    emails = _uniq(
        normalize_email(row.get(k))
        for k in ("email", "email_address", "primary_email")
        if row.get(k)
    )
    phones = _uniq(
        normalize_phone(row.get(k), country)
        for k in ("phone", "phone_number", "mobile")
        if row.get(k)
    )
    skills_raw = row.get("skills") or row.get("technologies") or row.get("tech_stack") or ""
    skills = [
        {"name": s, "source": source, "method": "csv_field"}
        for s in normalize_skills(skills_raw)
    ]
    try:
        yrs = row.get("years_of_experience") or row.get("experience_years")
        yrs = float(yrs) if yrs is not None and yrs != "" else None
    except (TypeError, ValueError):
        yrs = None
    return {
        "source": source,
        "kind": "structured",
        "method": "csv_field",
        "full_name": row.get("name") or row.get("full_name") or row.get("candidate_name"),
        "emails": emails,
        "phones": phones,
        "location": location,
        "links": {
            "linkedin": row.get("linkedin"),
            "github": row.get("github"),
            "portfolio": row.get("portfolio") or row.get("website"),
            "other": [],
        },
        "headline": row.get("title") or row.get("current_role") or row.get("role") or row.get("headline"),
        "years_experience": yrs,
        "skills": skills,
        "experience": [],
        "education": [],
    }


def record_from_ats(data, source="ats_json"):
    """ATS payloads often use different field names than ours — try variants."""
    root = data[0] if isinstance(data, list) and data else data
    if not isinstance(root, dict):
        return None
    c = root.get("candidate") if isinstance(root.get("candidate"), dict) else root

    full_name = (
        c.get("fullName")
        or c.get("full_name")
        or " ".join(filter(None, [c.get("firstName") or c.get("first_name"),
                                   c.get("lastName") or c.get("last_name")])).strip()
        or c.get("name")
        or None
    )

    raw_emails = []
    for src in (c.get("emailAddresses"), c.get("emails")):
        if isinstance(src, list):
            raw_emails.extend(e.get("value") or e.get("email") if isinstance(e, dict) else e for e in src)
    if c.get("email"):
        raw_emails.append(c["email"])

    raw_phones = []
    for src in (c.get("phoneNumbers"), c.get("phones")):
        if isinstance(src, list):
            raw_phones.extend(p.get("value") or p.get("number") if isinstance(p, dict) else p for p in src)
    if c.get("phone"):
        raw_phones.append(c["phone"])

    location = normalize_location(c.get("location") or c.get("address"))
    country = (location or {}).get("country") if location else None

    emails = _uniq(normalize_email(e) for e in raw_emails)
    phones = _uniq(normalize_phone(p, country) for p in raw_phones)

    raw_skills = c.get("skills") or c.get("skillSet") or c.get("tags") or []
    if isinstance(raw_skills, str):
        raw_skills = re.split(r"[,;|]+", raw_skills)
    flat = [s.get("name") or s.get("skill") if isinstance(s, dict) else s for s in raw_skills]
    skills = [{"name": s, "source": source, "method": "json_field"} for s in normalize_skills(flat)]

    experience = []
    for e in (c.get("experience") or c.get("workHistory") or c.get("positions") or []):
        if not isinstance(e, dict):
            continue
        item = {
            "company": e.get("company") or e.get("employer") or e.get("organization"),
            "title": e.get("title") or e.get("position") or e.get("role"),
            "start": normalize_month(e.get("start") or e.get("startDate") or e.get("from")),
            "end": normalize_month(e.get("end") or e.get("endDate") or e.get("to")),
            "summary": e.get("summary") or e.get("description"),
        }
        if item["company"] or item["title"]:
            experience.append(item)

    education = []
    for e in (c.get("education") or c.get("schools") or []):
        if not isinstance(e, dict):
            continue
        item = {
            "institution": e.get("institution") or e.get("school") or e.get("university"),
            "degree": e.get("degree"),
            "field": e.get("field") or e.get("fieldOfStudy") or e.get("major"),
            "end_year": normalize_year(
                e.get("end") or e.get("endDate") or e.get("graduationYear") or e.get("endYear")
            ),
        }
        if item["institution"]:
            education.append(item)

    yrs = c.get("yearsOfExperience") or c.get("experienceYears") or c.get("years_experience")
    try:
        yrs = float(yrs) if yrs is not None else None
    except (TypeError, ValueError):
        yrs = None

    return {
        "source": source,
        "kind": "structured",
        "method": "json_field",
        "full_name": full_name,
        "emails": emails,
        "phones": phones,
        "location": location,
        "links": {
            "linkedin": c.get("linkedin") or c.get("linkedinUrl"),
            "github": c.get("github") or c.get("githubUrl"),
            "portfolio": c.get("portfolio") or c.get("website"),
            "other": [],
        },
        "headline": c.get("headline") or c.get("title") or c.get("currentTitle"),
        "summary": c.get("summary") or c.get("about") or c.get("bio") or c.get("profile"),
        "years_experience": yrs,
        "skills": skills,
        "experience": experience,
        "education": education,
    }


def record_from_text(text, source):
    if not text or not text.strip():
        return None
    location = _location_from_text(text)
    country = (location or {}).get("country") if location else None
    # Strip URLs and emails before phone extraction so digit runs inside
    # vanity slugs (e.g. linkedin.com/in/.../a70182312) are not mistaken
    # for phone numbers.
    phone_text = EMAIL_RE.sub(" ", URL_STRIP_RE.sub(" ", text))
    return {
        "source": source,
        "kind": "unstructured",
        "method": "regex_extract",
        "full_name": _name_from_text(text),
        "emails": _uniq(normalize_email(m) for m in EMAIL_RE.findall(text)),
        "phones": _uniq(normalize_phone(m, country) for m in PHONE_RE.findall(phone_text)),
        "location": location,
        "links": _links_from_text(text),
        "headline": _headline_from_text(text),
        "summary": _summary_from_text(text),
        "years_experience": float(EXP_YEARS_RE.search(text).group(1)) if EXP_YEARS_RE.search(text) else None,
        "skills": _skills_from_text(text, source),
        "experience": [],
        "education": [],
    }


def record_from_github(gh, source="github_api"):
    """Build a record from a parsed GitHub profile dict."""
    if not gh or not gh.get("username"):
        return None
    location = normalize_location(gh.get("location"))
    blog = gh.get("blog") or None
    if blog and not blog.startswith(("http://", "https://")):
        blog = "https://" + blog
    skills = [
        {"name": lang, "source": source, "method": "github_languages"}
        for lang in (gh.get("languages") or [])
    ]
    return {
        "source": source,
        "kind": "unstructured",
        "method": "github_api",
        "full_name": gh.get("name") or None,
        "emails": [],
        "phones": [],
        "location": location,
        "links": {
            "linkedin": None,
            "github": gh.get("url"),
            "portfolio": blog,
            "other": [],
        },
        "headline": gh.get("bio") or None,
        "years_experience": None,
        "skills": skills,
        "experience": [],
        "education": [],
    }


def record_from_linkedin(li, source="linkedin_url"):
    """Build a record from a parsed LinkedIn URL dict.

    The public LinkedIn API requires OAuth, so we only contribute the
    canonical URL and a best-effort name guess from the vanity slug.
    """
    if not li or not li.get("url"):
        return None
    return {
        "source": source,
        "kind": "unstructured",
        "method": "linkedin_url",
        "full_name": li.get("name_guess"),
        "emails": [],
        "phones": [],
        "location": None,
        "links": {
            "linkedin": li["url"],
            "github": None,
            "portfolio": None,
            "other": [],
        },
        "headline": None,
        "years_experience": None,
        "skills": [],
        "experience": [],
        "education": [],
    }
