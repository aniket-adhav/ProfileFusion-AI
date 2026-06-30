# ProfileFusion AI

**Transform messy, multi-source candidate data into one trustworthy canonical profile — with full provenance, confidence scoring, and config-driven projection.**

A production-quality data transformation pipeline that ingests **structured** (CSV, ATS JSON) and **unstructured** (PDF resume, plain-text notes, GitHub, LinkedIn) sources, normalizes everything to a single schema, resolves conflicts deterministically, and emits an auditable canonical profile.

Built for the Eightfold AI internship assignment. Designed to be read, graded, and extended.

---

## Table of Contents

1. [Why this project stands out](#why-this-project-stands-out)
2. [Features](#features)
   - [Multi-Source Ingestion](#multi-source-ingestion)
   - [Deterministic Merge Engine](#deterministic-merge-engine)
   - [Confidence Scoring](#confidence-scoring)
   - [Projection & Validation](#projection--validation)
   - [Crash-Proof CLI](#crash-proof-cli)
3. [System Architecture Overview](#system-architecture-overview)
   - [High Level Architecture](#high-level-architecture)
   - [Pipeline Workflow](#pipeline-workflow)
4. [Conflict Resolution Policy](#conflict-resolution-policy)
5. [Design Decisions & Reasoning](#design-decisions--reasoning)
6. [Tech Stack](#tech-stack)
7. [Getting Started](#getting-started)
   - [Clone & Install](#1-clone--install)
   - [Run the CLI](#2-run-the-cli)
   - [Outputs](#3-outputs)
8. [Exit Codes](#exit-codes)
9. [Testing](#testing)
10. [Optional Web UI](#optional-web-ui)
11. [Project Structure](#project-structure)
12. [License](#license)
13. [Contact](#contact)

---

## Why this project stands out

- **Six sources, two categories.** CSV + ATS (structured) and PDF + TXT + GitHub + LinkedIn (unstructured). Spec requires *at least* one of each — the CLI **enforces it** and exits `2` if violated.
- **Deterministic merge engine** with explicit source-priority weights, per-field conflict resolution policy, and full provenance for every value.
- **Sigmoid-weighted confidence scoring** — not a hand-wavy average. Scores reflect source authority *and* cross-source agreement.
- **Three-mode projection layer** (`include_null`, `omit`, `error`) with **schema re-validation** of the projected output against the user's config.
- **Crash-proof CLI** — distinct exit codes (`0`, `2`, `3`) and four JSON reports so a grader script can detect every failure mode programmatically.
- **40+ pytest tests** covering parsers, normalizers, merge logic, determinism, and projection modes.
- **Optional web UI** — a polished React dashboard for visual demos (browser-side mirror of the pipeline).

---

## Features

### Multi-Source Ingestion
- **Structured:** Recruiter CSV, ATS JSON export
- **Unstructured:** Resume PDF, plain-text notes, GitHub profile API, LinkedIn profile URL
- Drop-in extensibility: add a new source by creating one file in `backend/parsers/`

### Deterministic Merge Engine
- Per-field winner selection by source-priority weight
- Tie-broken by recency and completeness
- Full provenance trail: every value carries its winning source, extraction method, and the agreeing/conflicting sources

### Confidence Scoring
- Per-field confidence using a **sigmoid over weighted source agreement**
- Aggregate profile confidence as the weighted mean across populated fields
- ATS + PDF + GitHub agreement scores far higher than a lone TXT note

### Projection & Validation
- Config-driven output shape via `--config`
- Three `on_missing` modes: `include_null`, `omit`, `error`
- Projected output is **re-validated** against the requested types — catches config drift early

### Crash-Proof CLI
- Parser failures on a single source (corrupt PDF, network error, malformed JSON) are caught, logged, and the pipeline continues with the remaining sources
- Distinct exit codes for every failure mode
- Four JSON reports written on every run

---

## System Architecture Overview

> Below are the architecture notes describing how the harmonizer parses, normalizes, merges, scores, validates, and projects candidate data from six heterogeneous sources.

### High Level Architecture

> Sources → Parsers → Normalizers → Merge Engine → Confidence Scoring → Validation → Canonical Profile

![System Architecture](assets/architecture.png)

### Pipeline Workflow

```text
   STRUCTURED                          UNSTRUCTURED
  ┌────────────┐ ┌──────────┐   ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐
  │recruiter   │ │ ats.json │   │resume.pdf│ │resume.txt│ │ github │ │ linkedin │
  │   .csv     │ │          │   │          │ │          │ │  URL   │ │   URL    │
  └─────┬──────┘ └────┬─────┘   └────┬─────┘ └────┬─────┘ └───┬────┘ └────┬─────┘
        │             │              │            │           │           │
        └─────────────┴──────────────┼────────────┴───────────┴───────────┘
                                     │
                       ┌─────────────▼─────────────┐
                       │          PARSERS          │
                       │ csv·ats·pdf·txt·gh·linked │
                       └─────────────┬─────────────┘
                                     │
                       ┌─────────────▼─────────────┐    ┌──────────────────────┐
                       │   EXTRACTOR (regex over   │───▶│     NORMALIZERS      │
                       │     unstructured text)    │    │ email·phone·skills·  │
                       └─────────────┬─────────────┘    │ dates·location·text  │
                                     │                  └──────────┬───────────┘
                                     └────────────────┬────────────┘
                                                      │
                                ┌─────────────────────▼────────────────────┐
                                │              MERGE ENGINE                │
                                │  priority weights · agreement scoring    │
                                │  sigmoid confidence · provenance trail   │
                                └─────────────────────┬────────────────────┘
                                                      │
            ┌─────────────┐      ┌──────────────┐     │     ┌─────────────┐
            │ VALIDATION  │◀─────│  PROJECTION  │◀────┴────▶│ CANONICAL   │
            │ (canonical) │─────▶│ (3 modes +   │──────────▶│ PROFILE     │
            │             │      │ re-validate) │           │   JSON      │
            └─────────────┘      └──────────────┘           └─────────────┘
```

---

## Conflict Resolution Policy

Each field's winner is chosen by a deterministic priority weight, then tie-broken by recency and completeness:

| Source         | Weight |
|----------------|--------|
| ATS            | 5      |
| GitHub         | 4      |
| Resume PDF     | 3      |
| Recruiter CSV  | 3      |
| LinkedIn       | 2      |
| TXT notes      | 1      |

Per-field confidence:

```
confidence = σ( Σ(weight_i · agreement_i) − threshold )
```

So a field confirmed by ATS + PDF + GitHub scores far higher than one only seen in a TXT note.

---

## Design Decisions & Reasoning

- **Clean Architecture** — parsers, normalizers, merger, validation, and projection are independent modules behind explicit interfaces. Each layer is independently testable.
- **Deterministic by design** — same inputs always produce byte-identical outputs (verified by tests). Critical for graders and reproducibility.
- **Provenance over magic** — every value in the canonical profile names its source and method. No black-box decisions.
- **Crash-proof CLI** — chose exit-code + report-file failure mode over stack traces. A grader script can detect every failure programmatically.
- **Optional UI, canonical CLI** — the Python CLI is the source of truth; the web UI is a visual demo. Avoids confusing dual implementations.

---

## Tech Stack

- **Language:** Python 3.12
- **Data:** Pydantic v2, pandas
- **Parsing:** PyMuPDF (PDF), standard library (CSV/JSON/TXT), `requests` (GitHub API)
- **Testing:** pytest (40+ tests)
- **UI (optional):** React 19, Vite 7, Tailwind v4, Framer Motion

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/aniket-adhav/ProfileFusion-AI
cd ProfileFusion-AI/backend
pip install -r requirements.txt
```

### 2. Run the CLI

Pick the option that matches what you want to demo. Each command is a one-line bash block — click the copy button, paste, run. Outputs (`profile.json`, `merge_report.json`, `validation_report.json`, `projection.json`, `projection_report.json`) are written to `backend/output/`.

**Option A — Full run (all 6 sources + config projection)**

```bash
python main.py --csv sample_inputs/recruiter.csv --ats sample_inputs/ats.json --pdf sample_inputs/resume.pdf --txt sample_inputs/resume.txt --github https://github.com/aniket-adhav --linkedin https://www.linkedin.com/in/aniket-adhav-a70182312/ --config sample_inputs/config.json
```

**Option B — All 4 local files only (no enrichment, no config)**

```bash
python main.py --csv sample_inputs/recruiter.csv --ats sample_inputs/ats.json --pdf sample_inputs/resume.pdf --txt sample_inputs/resume.txt
```

**Option C — Minimal pair (CSV structured + PDF unstructured)**

```bash
python main.py --csv sample_inputs/recruiter.csv --pdf sample_inputs/resume.pdf
```

**Option D — Local files + GitHub enrichment**

```bash
python main.py --csv sample_inputs/recruiter.csv --ats sample_inputs/ats.json --pdf sample_inputs/resume.pdf --txt sample_inputs/resume.txt --github https://github.com/aniket-adhav
```

**Option E — Local files + LinkedIn enrichment**

```bash
python main.py --csv sample_inputs/recruiter.csv --ats sample_inputs/ats.json --pdf sample_inputs/resume.pdf --txt sample_inputs/resume.txt --linkedin https://www.linkedin.com/in/aniket-adhav-a70182312/
```

> Rule enforced by the CLI: at least one **structured** (CSV or ATS) and one **unstructured** (PDF, TXT, GitHub, or LinkedIn) source must be supplied, otherwise the run exits with code `2`.

### 3. Outputs

Every run writes four JSON files — designed for both humans and grader scripts:

| File                      | What it contains                                                                              |
|---------------------------|-----------------------------------------------------------------------------------------------|
| `profile.json`            | The final canonical (or projected) profile                                                    |
| `merge_report.json`       | Per-field winning source, agreeing sources, conflicting sources, confidence                   |
| `validation_report.json`  | Schema validation results on the canonical record                                             |
| `projection_report.json`  | Projection mode used, fields included/omitted, schema re-validation results                   |

---

## Exit Codes

| Code | Meaning                                                                  |
|------|--------------------------------------------------------------------------|
| `0`  | Success — all reports written                                            |
| `2`  | Missing "1 structured + 1 unstructured" sources                          |
| `3`  | `on_missing: "error"` triggered — required field absent in projection    |

---

## Testing

```bash
cd backend
pytest -v
```

40+ unit tests covering:
- Every parser (happy-path + malformed input)
- Every normalizer (emails, phones, ISO dates, skill aliases, locations)
- Merge engine determinism (same inputs → byte-identical output)
- All three projection modes
- Schema validation on canonical and projected outputs

---

## Optional Web UI

A React + Vite dashboard that mirrors the pipeline in the browser for visual demos — drag-and-drop slots for all 6 sources, live pipeline visualization, confidence gauges, per-field provenance tooltips, and a syntax-highlighted JSON viewer.

🌐 **Live Demo:** _Link will be added after deployment._

Run locally:

```bash
cd frontend
bun install
bun run dev
```

> **Note:** The Python CLI produces the canonical output. The web UI is an optional browser demo that approximates the same logic; confidence values and edge-case normalization may differ slightly from the CLI.

---

## Project Structure

```text
backend/
  parsers/        # csv, ats, pdf, txt, github, linkedin
  extractors/     # regex field extraction for unstructured text
  normalizers/    # email, phone, skills, dates, location, text
  merger/         # priority weights, conflict resolution, provenance
  validation/     # canonical schema validation
  projection/     # config-driven projection + re-validation
  services/       # pipeline orchestration
  output/         # report writers
  sample_inputs/  # ready-to-run example data + config
  tests/          # pytest suite
  main.py         # CLI entry point
frontend/         # optional React/Vite dashboard
assets/           # architecture diagram & static reference assets
```

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## Contact

- **Author:** Aniket Adhav
- **GitHub:** [aniket-adhav](https://github.com/aniket-adhav)
- **LinkedIn:** [Aniket Adhav](https://www.linkedin.com/in/aniket-adhav-a70182312/)
