# Complete BAS Agent walkthrough — NAVFAC Cherry Point

Date: 2026-09-13

This is an unmocked browser walkthrough of the production Agent path against
`opentakeoff-corpus/raw/navfac-cherry-point-atc-mechanical.pdf` (75 sheets,
SHA-256 `9b83f64b9ef98c22a4053ab4e79665fe7581a620c2908c2239b9216c02e2c0bf`).
The literal prompt was:

> Run a BAS takeoff.

The post-index prompt-to-finish time was **37.673 seconds** against a declared
**180-second** ceiling. The persisted deterministic run took **32.420 seconds**.
The browser used the configured server-side provider; no credential is included
in these artifacts.

## Observed result

- 396 equipment records across 63 extracted categories
- 21 point lists / 546 listed point rows
- 8 sequence-of-operation records / 54 retained sections
- 163 control-valve records / 6 embedded-coil gaps
- 9 control schematics / 1 riser or flow diagram
- 293 reconciliation rows: 141 `MATCH`, 152 `SCHEDULE_ONLY`, zero
  `PLAN_ONLY`, refused, or ambiguous rows
- 3,381 row citations / 50 table citations in the Takeoff workspace
- eight selectable sequences; the selected sequence exposed ten clause rows,
  ten source buttons, an enabled whole-sequence source jump, and all 75 source
  pages in the evidence export

The five retained estimator workflows intentionally remain `not_started` until
a human makes the project-specific decisions. Release remains
`human_review_required`. The diagram result is an evidence inventory, not a
verified semantic control graph: 1,359 crossings and 59 instrument labels remain
unresolved. The `compiled_records` value in `summary.json` is only a harness
non-empty check across unlike domains; it is not an EA or installed-quantity
total and is never displayed as one.

## Artifacts

- `01-agent-result.png` — Agent answer and review workspace after completion
- `02-takeoff-table.png` — consolidated, separately labeled BAS results
- `03-workflow-review.png` — source-linked finding queue
- `04-sequence-reader.png` — original SOO clause text and source controls
- `summary.json` — deterministic receipt, UI assertions, timings, evidence and
  export checks

The generating command was:

```sh
OT_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
OT_UI_URL='http://127.0.0.1:5184/' \
OT_COMPLETE_BAS_OUT='/tmp/opentakeoff-complete-bas-agent-navfac-final-ui-pass' \
OT_COMPLETE_BAS_SLA_MS=180000 \
node scripts/playwright-complete-bas-agent.mjs
```

The walkthrough asserts that the consolidated header and both navigation
surfaces say `ready` rather than presenting the mixed record count as EA; that
the UI agrees exactly with the deterministic receipt; that scheduled quantity,
installed quantity and status columns exist when reconciliation rows exist; and
that CSV and evidence/history exports retain quantity provenance and source
pages.
