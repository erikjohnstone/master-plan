# Complete BAS Agent walkthrough — ITD D-1 laboratory

Date: 2026-09-13

This is an unmocked browser walkthrough of the production Agent path against
`opentakeoff-corpus/raw/itd-d1-lab-mechanical.pdf` (29 sheets, SHA-256
`9dafcead2eb5fe3679921f336ccd7ca4813da1524580c5fee75a87c99e1b2707`).
The literal prompt was:

> Run a BAS takeoff.

The post-index prompt-to-finish time was **15.682 seconds** against the declared
**180-second** ceiling. The persisted deterministic run took **13.424 seconds**.

## Observed result

- 97 equipment records
- no extractable point-list matrix; this is disclosed as missing source evidence
- 13 sequence records / 79 retained sections / one explicit labeled SOO point
  candidate
- 31 control-valve records / 11 embedded-coil gaps
- 13 control schematics / zero risers
- 37 reconciliation rows: 36 `MATCH`, one `SCHEDULE_ONLY`, zero `PLAN_ONLY`,
  refused, or ambiguous rows
- 224 row citations / 24 table citations
- `AC-1` plan evidence on PDF page 25 and its schedule-row evidence on PDF page
  28 open as distinct exact highlights

All 13 compiled sequences are reader-accessible bodies. The selected ductless
split-system sequence exposes four cited clauses, retains `DISABLED.` and
`OPERATOR'S WORKSTATION.`, and excludes adjacent controls-legend and network
architecture text. Release remains `human_review_required`; 497 diagram
crossings and 38 instrument labels remain unresolved.

## Artifacts

- `01-agent-result.png` — Agent result and disclosed source boundaries
- `02-takeoff-table.png` — consolidated takeoff workspace
- `02a-plan-match-source.png` — grounded plan evidence for a `MATCH`
- `02b-schedule-row-source.png` — distinct grounded schedule-row evidence
- `03-workflow-review.png` — human review workflow
- `04-sequence-reader.png` — complete ductless sequence reader
- `summary.json` — exact receipt, timing and UI assertions
