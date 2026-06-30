"""Combine per-source records into one canonical candidate profile."""
import json
import uuid
from datetime import datetime, timezone

# Source priority for conflict resolution on scalar fields.
SOURCE_PRIORITY = {
    "ats_json": 5,
    "resume_pdf": 4,
    "github_api": 4,
    "resume_txt": 3,
    "recruiter_csv": 3,
    "linkedin_url": 2,
}

_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def _pri(src):
    return SOURCE_PRIORITY.get(src, 0)


def _stable_id(seed):
    return "cand-" + str(uuid.uuid5(_NAMESPACE, str(seed or "candidate")))[:12]


def _pick_scalar(field, records):
    contribs = [
        {"source": r["source"], "method": r["method"], "value": r[field]}
        for r in records
        if r.get(field) not in (None, "", [])
    ]
    if not contribs:
        return {"value": None, "contributors": [], "winner": None}
    winner = max(contribs, key=lambda c: _pri(c["source"]))
    return {"value": winner["value"], "contributors": contribs, "winner": winner}


def _pick_location(records):
    contribs = [
        {"source": r["source"], "method": r["method"], "value": r["location"]}
        for r in records
        if r.get("location") and any(r["location"].get(f) for f in ("city", "region", "country"))
    ]
    if not contribs:
        return {"value": None, "contributors": [], "winner": None}
    sorted_c = sorted(contribs, key=lambda c: _pri(c["source"]), reverse=True)
    merged = {"city": None, "region": None, "country": None}
    for f in merged:
        for c in sorted_c:
            if c["value"].get(f):
                merged[f] = c["value"][f]
                break
    return {"value": merged, "contributors": contribs, "winner": sorted_c[0]}


def _merge_string_list(records, field):
    items, seen, by_value = [], set(), {}
    for r in records:
        for v in r.get(field) or []:
            key = str(v).lower()
            if key not in seen:
                seen.add(key)
                items.append(v)
            by_value.setdefault(key, [])
            if r["source"] not in by_value[key]:
                by_value[key].append(r["source"])
    return items, by_value


def _merge_links(records):
    merged = {"linkedin": None, "github": None, "portfolio": None, "other": []}
    for r in sorted(records, key=lambda x: _pri(x["source"]), reverse=True):
        links = r.get("links") or {}
        for f in ("linkedin", "github", "portfolio"):
            if not merged[f] and links.get(f):
                merged[f] = links[f]
        for u in links.get("other") or []:
            if u and u not in merged["other"] and u not in (merged["linkedin"], merged["github"], merged["portfolio"]):
                merged["other"].append(u)
    return merged


def _merge_skills(records):
    by_name = {}
    for r in records:
        for s in r.get("skills") or []:
            key = s["name"].lower()
            entry = by_name.setdefault(key, {"name": s["name"], "sources": []})
            if r["source"] not in entry["sources"]:
                entry["sources"].append(r["source"])
    out = []
    for e in by_name.values():
        conf = min(1.0, round(0.5 + 0.2 * (len(e["sources"]) - 1) + 0.1, 3))
        out.append({"name": e["name"], "confidence": conf, "sources": e["sources"]})
    return out


def _merge_list_by_key(records, field, key_fn):
    seen = {}
    for r in records:
        for item in r.get(field) or []:
            k = key_fn(item)
            if not k:
                continue
            if k not in seen:
                seen[k] = {**item, "_sources": [r["source"]]}
            elif r["source"] not in seen[k]["_sources"]:
                seen[k]["_sources"].append(r["source"])
    return [{kk: vv for kk, vv in item.items() if kk != "_sources"} for item in seen.values()]


def _confidence_for(pick):
    if not pick or not pick["contributors"]:
        return 0.0
    winner_json = json.dumps(pick["value"], sort_keys=True, default=str)
    agree = sum(
        1 for c in pick["contributors"]
        if json.dumps(c["value"], sort_keys=True, default=str) == winner_json
    )
    total = len(pick["contributors"])
    base = 0.55 + 0.1 * _pri(pick["winner"]["source"]) / 5
    return min(1.0, round(base + 0.25 * (agree / total) + 0.05 * (agree - 1), 3))


def merge_records(records):
    if not records:
        raise ValueError("merge_records called with no records")

    name = _pick_scalar("full_name", records)
    headline = _pick_scalar("headline", records)
    summary = _pick_scalar("summary", records)
    years_exp = _pick_scalar("years_experience", records)
    location = _pick_location(records)

    _all_emails, email_contribs = _merge_string_list(records, "emails")
    _all_phones, phone_contribs = _merge_string_list(records, "phones")

    def _pick_best(items, contribs):
        if not items:
            return []
        best, best_count = items[0], len(contribs.get(str(items[0]).lower(), []))
        for it in items[1:]:
            c = len(contribs.get(str(it).lower(), []))
            if c > best_count:
                best, best_count = it, c
        return [best]

    emails = _pick_best(_all_emails, email_contribs)
    phones = _pick_best(_all_phones, phone_contribs)
    links = _merge_links(records)
    skills = _merge_skills(records)
    experience = _merge_list_by_key(
        records, "experience",
        lambda e: f"{(e.get('company') or '').lower()}|{(e.get('title') or '').lower()}|{e.get('start') or ''}",
    )
    education = _merge_list_by_key(
        records, "education",
        lambda e: f"{(e.get('institution') or '').lower()}|{(e.get('degree') or '').lower()}",
    )

    provenance = []
    for field, pick in (("full_name", name), ("headline", headline), ("summary", summary),
                        ("years_experience", years_exp), ("location", location)):
        for c in pick["contributors"]:
            provenance.append({"field": field, "source": c["source"], "method": c["method"]})
    for r in records:
        for field in ("emails", "phones", "skills", "experience", "education"):
            if r.get(field):
                provenance.append({"field": field, "source": r["source"], "method": r["method"]})
        links_r = r.get("links") or {}
        if any(links_r.get(f) for f in ("linkedin", "github", "portfolio")) or links_r.get("other"):
            provenance.append({"field": "links", "source": r["source"], "method": r["method"]})

    field_confs = [
        _confidence_for(name), _confidence_for(headline),
        _confidence_for(years_exp), _confidence_for(location),
    ]
    if emails:
        field_confs.append(min(1.0, 0.6 + 0.1 * len(next(iter(email_contribs.values()), []))))
    if phones:
        field_confs.append(min(1.0, 0.6 + 0.1 * len(next(iter(phone_contribs.values()), []))))
    if skills:
        field_confs.append(sum(s["confidence"] for s in skills) / len(skills))
    field_confs = [c for c in field_confs if c > 0]
    overall = round(sum(field_confs) / len(field_confs), 3) if field_confs else 0.0

    candidate_id = _stable_id(name["value"] or (emails[0] if emails else None) or links.get("linkedin"))

    profile = {
        "candidate_id": candidate_id,
        "full_name": name["value"],
        "emails": emails,
        "phones": phones,
        "location": location["value"],
        "links": links,
        "headline": headline["value"],
        "summary": summary["value"],
        "years_experience": years_exp["value"],
        "skills": skills,
        "experience": experience,
        "education": education,
        "provenance": provenance,
        "overall_confidence": overall,
    }

    merge_report = {
        "record_count": len(records),
        "sources": [r["source"] for r in records],
        "field_decisions": {
            "full_name": name,
            "headline": headline,
            "summary": summary,
            "years_experience": years_exp,
            "location": location,
            "emails": {"items": emails, "contributors": email_contribs},
            "phones": {"items": phones, "contributors": phone_contribs},
        },
        "skill_count": len(skills),
        "experience_count": len(experience),
        "education_count": len(education),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    return profile, merge_report
