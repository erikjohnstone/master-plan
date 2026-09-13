# Complete BAS Agent walkthrough — Federal Attachment 4 mechanical

Date: 2026-09-13

This is an unmocked browser walkthrough of the production Agent path against
`opentakeoff-corpus/raw/federal-attachment4-mechanical.pdf` (24 sheets, SHA-256
`b98b269834a4abfdbb508bd83c2efc53a46d32f3030789e6bd36446ee7148f10`).
The literal prompt was:

> Run a BAS takeoff.

The final post-index prompt-to-finish time was **16.964 seconds** against the
declared **180-second** ceiling. The persisted deterministic run took **13.977
seconds**.

## Observed result

- 128 equipment records
- three point-list matrices / 26 rows
- 12 sequence records / 132 retained sections
- 13 control schematics / one riser or flow diagram
- 99 reconciliation rows: 95 `MATCH`, four `SCHEDULE_ONLY`, zero `PLAN_ONLY`,
  refused, or ambiguous rows
- 334 row citations / 19 table citations
- `AHU-1` plan evidence on PDF page 7 and its schedule-row evidence on PDF page
  14 open as distinct exact highlights and together in a high-resolution,
  read-only comparison reader
- `BOILER SYSTEM - CONTROL DIAGRAM` on PDF page 20 is bound to the exact
  `HEATING HOT WATER SYSTEM - SEQUENCE OF OPERATION`; its retained instrument
  labels include both printed `DPT` instances

All 12 compiled sequences are reader-accessible bodies. The selected 69-clause
AHU-1 sequence excludes the adjacent LEED pre-occupancy flush-out sequence.
Release remains `human_review_required`; the diagram inventory retains 1,061
unresolved crossings, 16 unmapped instrument labels and three unresolved
sequence bindings rather than claiming a verified semantic graph. The increase
from the earlier checkpoint is deliberate: corrected diagram boundaries now
retain previously clipped authored linework instead of making the review queue
look smaller by omission.

## Artifacts

- `01-agent-result.png` — Agent result and source coverage
- `02-takeoff-table.png` — consolidated takeoff workspace
- `02-source-comparison.png` — simultaneous grounded plan-marker and schedule-row evidence
- `02a-plan-match-source.png` — grounded AHU-1 plan evidence
- `02b-schedule-row-source.png` — distinct grounded AHU-1 schedule row
- `03-workflow-review.png` — human review workflow
- `04-sequence-reader.png` — 69-clause AHU-1 reader
- `summary.json` — exact receipt, timing and UI assertions
- `journey.webm` — complete upload, one-prompt Agent, review and export walkthrough
