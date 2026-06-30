"""Smoke tests covering normalizers, the merge engine, and the full pipeline."""
import json
import os
import pytest

from backend.normalizers.email import normalize_email
from backend.normalizers.phone import normalize_phone
from backend.normalizers.skill import normalize_skills
from backend.normalizers.location import normalize_location
from backend.normalizers.date import normalize_month, normalize_year
from backend.merger.merge_engine import merge_records
from backend.validation.validator import validate_profile
from backend.projection.projector import project, get_by_path
from backend.services.pipeline import transform

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "sample_inputs")


def test_normalize_email():
    assert normalize_email(" Alice@Example.COM ") == "alice@example.com"
    assert normalize_email("Alice <a@b.io>") == "a@b.io"
    assert normalize_email("nope") is None


@pytest.mark.parametrize("raw,country,expected", [
    ("+1 (415) 555-1212", None, "+14155551212"),
    ("415-555-1212", "US", "+14155551212"),
    ("020 7946 0958", "GB", "+442079460958"),
    ("abc", None, None),
])
def test_normalize_phone(raw, country, expected):
    assert normalize_phone(raw, country) == expected


def test_normalize_skills_canonicalizes_and_dedupes():
    out = normalize_skills("js, JavaScript, node.js, Python")
    assert out == ["JavaScript", "Node.js", "Python"]


def test_normalize_location_us_state():
    loc = normalize_location("San Francisco, CA")
    assert loc == {"city": "San Francisco", "region": "CA", "country": "US"}


def test_normalize_date_variants():
    assert normalize_month("January 2024") == "2024-01"
    assert normalize_month("2024-03-15") == "2024-03"
    assert normalize_month("Present") is None
    assert normalize_year("Graduated 2023") == 2023


def test_merge_engine_resolves_conflicts():
    records = [
        {"source": "recruiter_csv", "kind": "structured", "method": "csv_field",
         "full_name": "Alice Smith", "emails": ["a@x.io"], "phones": [], "location": None,
         "links": {"linkedin": None, "github": None, "portfolio": None, "other": []},
         "headline": "SWE", "years_experience": 3, "skills": [
             {"name": "Python", "source": "recruiter_csv", "method": "csv_field"}
         ], "experience": [], "education": []},
        {"source": "ats_json", "kind": "structured", "method": "json_field",
         "full_name": "Alice J. Smith", "emails": ["a@x.io", "alice@x.io"], "phones": ["+14155551212"],
         "location": {"city": "SF", "region": "CA", "country": "US"},
         "links": {"linkedin": "https://linkedin.com/in/alice", "github": None,
                   "portfolio": None, "other": []},
         "headline": "Senior SWE", "years_experience": 4, "skills": [
             {"name": "Python", "source": "ats_json", "method": "json_field"}
         ], "experience": [], "education": []},
    ]
    profile, report = merge_records(records)
    # ATS has higher priority than CSV.
    assert profile["full_name"] == "Alice J. Smith"
    assert profile["headline"] == "Senior SWE"
    # Dedup keeps the single best email (most agreement); "a@x.io" appears in both sources.
    assert profile["emails"] == ["a@x.io"]
    assert profile["skills"][0]["confidence"] > 0.5
    assert profile["overall_confidence"] > 0
    assert report["record_count"] == 2


def test_validator_flags_bad_phone():
    profile = {
        "candidate_id": "cand-x", "full_name": "X", "emails": ["a@b.io"],
        "phones": ["555"], "location": None, "links": {}, "headline": None,
        "years_experience": None, "skills": [], "experience": [], "education": [],
        "provenance": [], "overall_confidence": 0.5,
    }
    rep = validate_profile(profile)
    assert not rep["valid"]
    assert any(e["code"] == "not_e164" for e in rep["errors"])


def test_projector_handles_array_index_and_normalize():
    profile = {
        "emails": ["FOO@bar.io", "baz@bar.io"],
        "phones": ["+14155551212"],
        "skills": [{"name": "Python", "confidence": 0.7, "sources": ["x"]}],
    }
    cfg = {"fields": [
        {"path": "primary_email", "from": "emails[0]", "normalize": "email", "type": "string"},
        {"path": "skill_names", "from": "skills[].name", "type": "string[]"},
    ]}
    out = project(profile, cfg)["output"]
    assert out["primary_email"] == "foo@bar.io"
    assert out["skill_names"] == ["Python"]


def test_get_by_path_array_map():
    obj = {"items": [{"v": 1}, {"v": 2}]}
    assert get_by_path(obj, "items[].v") == [1, 2]


def test_full_pipeline_on_samples():
    sources = {
        "csv":  os.path.join(SAMPLES, "recruiter.csv"),
        "ats":  os.path.join(SAMPLES, "ats.json"),
        "pdf":  os.path.join(SAMPLES, "resume.pdf"),
    }
    # TXT is optional in the samples — include only if present.
    txt_path = os.path.join(SAMPLES, "resume.txt")
    if os.path.exists(txt_path):
        sources["txt"] = txt_path

    result = transform(sources)
    assert result["profile"]["candidate_id"].startswith("cand-")
    assert result["validation_report"]["valid"] in (True, False)
    assert result["merge_report"]["record_count"] >= 2
    # Determinism — same inputs ⇒ same profile JSON.
    again = transform(sources)
    assert json.dumps(result["profile"], sort_keys=True) == json.dumps(again["profile"], sort_keys=True)
