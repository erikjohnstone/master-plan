# BAS takeoff production completion acceptance

Date: 2026-09-12

Branch: `codex/bas-production-completion`

## Outcome

The five requested deterministic BAS workflows are implemented and wired through
the shared browser/MCP workflow records and the existing Python calculation
authority:

1. point-list and sequence-of-operation evidence;
2. printed equipment membership and point-template applicability;
3. controls assemblies and independent furnish/install/wire/program/test scope;
4. manufacturer-independent engineering compatibility checks;
5. findings, drawing revisions, reviewed scope, and release snapshots.

These workflows are production-viable as **human-in-the-loop takeoff controls**.
They preserve source text, tables, cells, page identities, citations, bboxes,
decisions, calculation inputs, history, and explicit unknowns. They are not a
claim that every uploaded project can be autonomously completed or released.

## Shared-path decision

Point-list truth, directional I/O, equipment candidates, Python point math, and
project findings answer shared takeoff questions. Their changes therefore live
on the shared UI/MCP path. Workspace layout, navigation, reader presentation,
and click behavior remain browser-only.

This completion does **not** change VectorGrid, table geometry, row/column or bbox
semantics, symbol recognition, legend learning, OCR/vision, pricing, costing, or
labor. It does not manufacture installed quantity.

## Final generalized point-list hardening

- Explicit row-oriented `POINT FUNCTION SCHEDULE` tables retain their printed
  point name/tag and per-row `POINT TYPE`/`I/O TYPE`.
- Exact printed AI/AO/BI/BO/DI/DO marks in structured DDC/BACnet point tables
  become directional physical observations. BI and BO normalize to DI and DO.
- Exact AV/BV/MI/MO/MSV object marks remain separate software values and never
  become copper counts.
- If the general table graph clips an otherwise structured point table, the
  shared consumer can recover only the printed core rows from PDF source spans.
  It never fills missing alarm, trend, graphic, fail-mode, or other attributes.
- Split/partial table fragments may merge only under same-sheet, title, and
  region-overlap constraints. Original graph cells win over recovered cells.
- Point matrices are excluded from equipment candidates. Only explicit known
  cross-trade schedule families are excluded; unknown equipment schedules stay
  visible for review.

## Real-PDF evidence

| Project | Role | Result | Boundary |
| --- | --- | --- | --- |
| Fort Sam retained project | Product/browser walkthrough | 12 point matrices, 193 rows; five workflows exercised with exact source return and persistence | Existing reviewed development evidence. |
| Behavioral Medicine, 29 pages | Equipment/assembly walkthrough | 14 independently keyed equipment members with reviewed applicability, calculation, history, and withdrawal | Required a 4 GiB Node heap for the browser run. Installed quantity stayed unknown. |
| Albany VA Main Boiler Replacement, 31 pages | Blind full-pipeline holdout | 2/2 authored point matrices, 96/96 rows, no false additions | BACnet attributes did not become hardwired I/O. |
| Eglin AFB NICoE Mechanical Controls, 24 pages | Post-fix full regression | 5/5 point matrices, 158/158 rows; AI 59, AO 33, DI 41, DO 25; 17/17 equipment schedules, 132/132 rows | Source records are not independently reverified. Installed quantity stayed `null`. |
| USDA APHIS Building 63, 31 pages | Failure-driven development case | Initial full run found 7/8 matrices and 50/75 rows; generalized source recovery subsequently returned the expected aggregate of 8 matrices/75 rows in a source-only diagnostic | Three full-title associations remain ambiguous to the diagnostic's generic-title matcher. Initial cold graph took 823.7 s and peaked at 1.91 GB RSS. Not a blind post-fix result. |
| Orange County Public Safety, 128 pages | Final blind source-path reserve | 0/1 expected table | Honest miss on a control diagram classified as a one-row table in the independent record; no post-open tuning. Not a full-graph run. |

Detailed holdout role disclosure is in
`evidence/frozen-holdout-final/README.md`. Screenshot and operator instructions
are in `../BAS_TAKEOFF_WALKTHROUGH.md`.

## Release gates

Final clean results on the completion branch:

- Python: **495 passed, 1 skipped**; mypy: **21 source files, 0 issues**.
- MCP: **130** core BAS, **33** revision, **6** issue, and **17** scope/release
  tests passed; MCP typecheck passed.
- Web: **3,006/3,019 passed**, **13** expected fixture/model skips, **0** failures;
  typecheck, BAS benchmarks, generic benchmark, and production build passed.
- Lint: **0 errors**, with three pre-existing `TakeoffCanvas.jsx` warnings.
- Package: MCP production build, distribution smoke, **4/4** packaging/parity
  tests, and the exact **55-tool** registry gate passed.
- `git diff --check`: passed.

The web production build retains its existing chunk-size/dynamic-import warnings
and warns when no Cerebras key is configured. Those warnings do not change the
deterministic BAS workflows.

## Honest remaining boundaries

- Specification-book ingestion is not implemented.
- Symbol/legend/vision recognition is outside this completion and installed plan
  quantity remains unavailable unless separate nonoverlapping evidence and human
  decisions establish it.
- Sequence discovery retains source clauses but does not claim complete semantic
  interpretation or automatic equipment applicability.
- Source-recovered core rows explicitly block release where attribute columns are
  absent or unobserved.
- The final blind source-path reserve missed a control-diagram truth item. A
  future improvement needs a new independently reserved corpus or a separately
  declared development set—not tuning against that now-open reserve.
- Large cold PDFs can take minutes and high memory to graph. The worst retained
  case was 823.7 s and 1.91 GB RSS; the 29-page browser walkthrough needed a 4 GiB
  heap. Performance is disclosed, not treated as solved.
- Revision proof used a controlled page-reordered derivative, not an issued
  addendum from a live project.
- Browser-local approval records are auditable application records, not
  authenticated signatures or server-enforced immutable records.

These boundaries stay visible to estimators as unknowns, blockers, history, and
source-linked review work. They are not silently converted to zero, complete,
installed, passed, or approved.
