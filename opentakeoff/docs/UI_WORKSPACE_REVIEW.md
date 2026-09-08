# Workspace UI rewrite — review and verification

Branch: `codex/ui-workspace-rewrite`. Baseline: `8414e3ae` (latest `origin/main`
when the clean worktree was created). Do not merge this branch until the full
release gates are green. The original dirty checkout was not modified.

## Scope decision

**SHOULD THIS BE ON THE SHARED PATH? NO.** This work is navigation, panel layout,
presentation, sizing, focus and UI verification. Session and the shared graph
remain the only owners of table truth. No files under `web/src/lib/`, `mcp/`,
`server/` or `opentakeoff-corpus/` are changed. No table/citation/bbox fields,
agent execution, proposal semantics, persistence schemas, totals or exports are
changed. The new localStorage keys contain only dock dimensions/expanded state.

## Changed surfaces

- Labeled Plans, Schedules, Agent, Takeoff and Report destinations.
- A compact toolbar and sheet strip: 121 CSS px total with the sample loaded.
- On-demand condition properties with outside-click/Escape dismissal and the
  existing shortcut pause mechanism.
- One primary dock at a time, sensible drawing space, pointer/keyboard resizing,
  expanded view and focus return. No fixed 360/380px primary panel.
- Schedules sheet navigator, search and sheet/kind facets, full cell grid,
  internal wide-table scrolling and selected-row feedback.
- Agent starter drafts, persistent composer, larger proposal review controls.
  All existing callbacks and argument ordering are retained.

## Verified locally

The bundled mechanical set yields **9 schedules / 2 schedule sheets / 24 rows**.
The entire graphTables output is compared, not just these totals. The exact
before/after evidence is in [baseline](ui-workspace/evidence/baseline/evidence.json)
and [after](ui-workspace/evidence/after/evidence.json).

- Schedule View paints one normalized `schedule_browse` box on its own sheet.
  Repeated views leave one box. A row paints its own smaller cell union.
  Closing removes browse highlights only.
- Agent citation navigation retains the original sheet/bbox payload.
- Two count proposals remain pending until an explicit accept/reject. Accept
  commits one count; Reject all removes the remaining proposal, not the shape.
- A clearly labeled UI-only query fixture appears in Workflow data but does not
  become a finished quantity. Its CSV and all visible takeoff data match before
  and after exactly. This fixture is not a model-generated takeoff result.
- Only transient object IDs, condition IDs and creation/acceptance timestamps
  are excluded from semantic comparison. Table IDs and all data geometry remain
  in the comparison.
- `npm test`: 2,515 passed, 0 failed, 13 skipped (2,528 tests).
- `npm run bench`: passed; committed benchmark results unchanged.
- `npm run build`: passed.
- Existing topbar driver: passed at 1280, 1440, 1920 and 2560 widths.
- Existing schedules, inline-citation and count-proposals drivers: passed on
  the real built-in sample.
- New workspace driver: **115 checks passed**, including navigation, active state, shell height, no page overflow,
  original grid cells/headers, filtering, split/expanded view, pointer/keyboard
  resize, focus return, and exact Agent callbacks. Synthetic Agent props exercise
  running/review states without a model request.
- Evidence clicks restore split view from an expanded workspace without changing
  the drawing footprint or the existing citation/highlight callback payload.
- Matched sample screenshots captured at 1280×800, 1440×900, 1920×1080 and
  2560×1440. These show Plans, selected FAN schedule, Agent empty and seeded
  answer/proposal review. HUD is captured at 2560. No screenshot is represented
  as a live model run.
- Expanded views additionally show the wide FAN and diffuser/grille/register
  schedules together, with their complete extracted grids and internal scrolling.
- Additional real corpus UI check passed on document 19, Orange County Regional
  History Center HVAC (nine-page set): four schedules / 11 rows on M-401, sheet 8.
  The AHU schedule has 35 columns. Every header and first-row cell was checked
  against the graph, and split/expanded/far-right-column screenshots inspected.
  Table/row navigation, idempotence, filtering, and highlight cleanup passed.
- GitHub's `ui-contracts` job passed on commit `3fca9ee8` in
  [run 34290188833](https://github.com/erikjohnstone/master-plan/actions/runs/34290188833).
  This is distinct from the full TypeScript check, which remains red.

## Open release gates — not claimed complete

1. `npm run check` already fails on baseline main with **252 TypeScript errors**.
   The after run reports the same 252 diagnostics. Full lint also reports
   inherited errors, including prohibited shared-engine files. These were not
   hidden, ignored, weakened or repaired in a UI-only change.
2. `playwright-table-takeoff-ui.mjs --doc 05` and
   `playwright-takeoff-ui-demo.mjs hvac` were attempted but refuse to start
   without a live `CEREBRAS_API_KEY`. The isolated environment has no key.
   Deterministic UI callback and real graph/citation tests do not replace those
   live end-to-end gates.
3. This monorepo had no root `.github/workflows` directory; nested package
   workflows are not discovered by GitHub. The new root workflow runs the full
   check without relaxing it and runs the focused browser contracts separately.
   All required checks must be green before this is review-ready for release.
4. The available 30-document collection's document 05 (USDA APHIS Plant
   Inspection Station, Building 63) was attempted through the real schedules
   driver. It timed out after 900,000 ms waiting for schedule graph readiness,
   before reaching panel assertions. That larger corpus UI verification is
   **unverified**, not passed; the separate document 19 multi-sheet UI check
   succeeded as described above. No extraction or corpus files were changed.

## Reproduce

From `opentakeoff/web`, install package dependencies and MCP dependencies, then
run Vite on port 5176. Install the Playwright Chromium build with
`npx playwright install chromium`; alternatively set `OT_BROWSER_PATH` to a
local Chromium executable. No platform path is hardcoded in the updated drivers.

```sh
OT_UI_URL=http://localhost:5176 OT_UI_PDF=public/demo/sample-mechanical-set.pdf node scripts/playwright-workspace.mjs
OT_UI_URL=http://localhost:5176 OT_UI_PDF=public/demo/sample-mechanical-set.pdf node scripts/playwright-topbar.mjs --widths 1280,1440,1920,2560
OT_UI_URL=http://localhost:5176 OT_UI_PDF=public/demo/sample-mechanical-set.pdf node scripts/playwright-schedules-panel.mjs
OT_UI_URL=http://localhost:5176 OT_UI_PDF=public/demo/sample-mechanical-set.pdf node scripts/playwright-inline-cites.mjs
OT_UI_URL=http://localhost:5176 OT_UI_PDF=public/demo/sample-mechanical-set.pdf node scripts/playwright-count-proposals.mjs
```

Run `ui-workspace-proof.mjs` with `OT_PROOF_PHASE=baseline` on the baseline
checkout, and `OT_PROOF_PHASE=after` on this branch, sharing `OT_PROOF_OUT`.
The after pass asserts complete semantic equality and captures the screenshots.

## Representative comparison (1440×900)

Before:

![Previous schedules drawer](ui-workspace/evidence/baseline/1440-schedules.png)

After:

![Schedules workspace](ui-workspace/evidence/after/1440-schedules.png)

![Agent workspace](ui-workspace/evidence/after/1440-agent-empty.png)
