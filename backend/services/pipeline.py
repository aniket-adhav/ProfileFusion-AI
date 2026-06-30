"""End-to-end transformation pipeline: parse → extract → merge → validate → project."""
from backend.parsers.csv_parser import parse_csv
from backend.parsers.ats_parser import parse_ats
from backend.parsers.pdf_parser import parse_pdf
from backend.parsers.txt_parser import parse_txt
from backend.parsers.github_parser import parse_github
from backend.parsers.linkedin_parser import parse_linkedin
from backend.extractors.record_extractor import (
    record_from_csv_row, record_from_ats, record_from_text,
    record_from_github, record_from_linkedin,
)
from backend.merger.merge_engine import merge_records
from backend.validation.validator import validate_profile
from backend.projection.projector import project


def transform(sources, config=None):
    """Run the pipeline.

    ``sources`` is a dict with optional keys: csv, ats, pdf, txt, github, linkedin.
    File-backed values may be a path, bytes, or a file-like object. The
    ``github`` and ``linkedin`` values are profile URLs (strings).
    """
    records = []

    if sources.get("csv") is not None:
        for row in parse_csv(sources["csv"]):
            rec = record_from_csv_row(row)
            if rec:
                records.append(rec)

    if sources.get("ats") is not None:
        rec = record_from_ats(parse_ats(sources["ats"]))
        if rec:
            records.append(rec)

    if sources.get("pdf") is not None:
        rec = record_from_text(parse_pdf(sources["pdf"]), source="resume_pdf")
        if rec:
            records.append(rec)

    if sources.get("txt") is not None:
        rec = record_from_text(parse_txt(sources["txt"]), source="resume_txt")
        if rec:
            records.append(rec)

    if sources.get("github"):
        rec = record_from_github(parse_github(sources["github"]))
        if rec:
            records.append(rec)

    if sources.get("linkedin"):
        rec = record_from_linkedin(parse_linkedin(sources["linkedin"]))
        if rec:
            records.append(rec)

    if not records:
        raise ValueError("No valid sources provided")

    profile, merge_report = merge_records(records)
    validation_report = validate_profile(profile)

    from backend.projection.projector import ProjectionError
    projection_error = None
    if config:
        try:
            projection = project(profile, config)
        except ProjectionError as e:
            projection_error = e
            projection = {
                "output": None, "errors": e.errors, "applied": True,
                "report": {"valid": False, "errors": e.errors, "warnings": [],
                           "checked_fields": [f["path"] for f in config.get("fields", [])],
                           "mode": config.get("on_missing", "null"),
                           "aborted": True},
            }
    else:
        projection = {"output": profile, "errors": [], "applied": False,
                      "report": {"valid": True, "errors": [], "warnings": [],
                                 "checked_fields": [], "mode": "passthrough"}}

    return {
        "profile": profile,
        "merge_report": merge_report,
        "validation_report": validation_report,
        "projection": projection,
        "projection_error": projection_error,
    }
