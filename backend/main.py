
import argparse
import json
import os
import sys

# Allow both supported execution styles:
#   1) from project root: python -m backend.main ...
#   2) from backend/:    python main.py ...
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BACKEND_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.services.pipeline import transform


def main(argv=None):
    p = argparse.ArgumentParser(description="Candidate Data Harmonizer")
    p.add_argument("--csv", help="Recruiter CSV path")
    p.add_argument("--ats", help="ATS JSON path")
    p.add_argument("--pdf", help="Resume PDF path")
    p.add_argument("--txt", help="Resume / notes TXT path")
    p.add_argument("--github", help="Public GitHub profile URL")
    p.add_argument("--linkedin", help="Public LinkedIn profile URL")
    p.add_argument("--config", help="Projection config JSON path")
    p.add_argument("--out", "--output-dir", dest="out", default="output", help="Output directory (default: output/)")
    args = p.parse_args(argv)

    sources = {k: v for k, v in {
        "csv": args.csv, "ats": args.ats, "pdf": args.pdf, "txt": args.txt,
        "github": args.github, "linkedin": args.linkedin,
    }.items() if v}

    structured = any(k in sources for k in ("csv", "ats"))
    unstructured = any(k in sources for k in ("pdf", "txt", "github", "linkedin"))
    if not (structured and unstructured):
        print("ERROR: provide at least one structured (--csv/--ats) AND one unstructured (--pdf/--txt/--github/--linkedin) source.", file=sys.stderr)
        return 2

    config = None
    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            config = json.load(f)

    result = transform(sources, config=config)

    os.makedirs(args.out, exist_ok=True)
    outputs = [
        ("profile.json", result["profile"]),
        ("merge_report.json", result["merge_report"]),
        ("validation_report.json", result["validation_report"]),
    ]
    if config:
        outputs.append(("projection.json", result["projection"]["output"]))
        outputs.append(("projection_report.json", result["projection"]["report"]))

    for name, payload in outputs:
        with open(os.path.join(args.out, name), "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)

    written = ", ".join(n for n, _ in outputs)
    print(f"Wrote: {written} → {args.out}/")

    if result.get("projection_error") is not None:
        print(f"ERROR: projection aborted (on_missing='error'): {result['projection_error']}", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
