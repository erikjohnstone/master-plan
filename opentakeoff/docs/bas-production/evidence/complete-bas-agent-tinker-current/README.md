# Complete BAS Agent walkthrough — Tinker AFB IWCS

Date: 2026-09-13

This is an unmocked browser walkthrough of the production Agent path against
`opentakeoff-corpus/raw/tinker-afb-iwcs-controls.pdf` (31 sheets, SHA-256
`ffbae6e626baa25c4c2a1ab033ab596e647a5d3903853ecc07b4f8db297f854a`).
The literal prompt was:

> Run a BAS takeoff.

The post-index prompt-to-finish time was **15.664 seconds** against the declared
**180-second** ceiling. The persisted deterministic run took **15.539 seconds**.

## Observed result

- five building-specific sequence records / 65 retained sections
- zero scheduled-equipment records, point-list matrices, control-valve records,
  schematic inventories, risers, or reconciliation rows
- all five compiled sequences are reader-accessible bodies; the selected
  Building 214 sequence exposes 13 cited clauses
- the selected sequence excludes the adjacent lift-station detail, switch tags,
  station-vault text, flow-meter text and off-page destination text

This is an intentional negative quantity path: the controls source contains
useful operating narratives but no quantity-bearing equipment schedule. The UI
does not infer equipment or installed points from narrative prose, explains the
missing inputs, and routes the estimator directly to sequence review. Release
remains `human_review_required`.

## Artifacts

- `01-agent-result.png` — honest controls-only Agent result
- `02-takeoff-table.png` — non-quantity empty state with sequence-review action
- `03-workflow-review.png` — human review workflow
- `04-sequence-reader.png` — Building 214 cited sequence clauses
- `summary.json` — exact receipt, timing and UI assertions
