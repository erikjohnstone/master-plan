# Workspace UI rewrite — review and verification

Branch: `codex/ui-workspace-rewrite`. Baseline: `8414e3ae` (latest `origin/main`
when the clean worktree was created). Do not merge this branch until the full
release gates are green. The original dirty checkout was not modified.

## Scope decision

**SHOULD THIS BE ON THE SHARED PATH? NO.** This work is navigation, panel layout,
presentation, sizing, focus and UI verification. Session and the shared graph
remain the only owners of table truth. No files under `mcp/`, `server/` or
`opentakeoff-corpus/` are changed. The UI work itself does not modify shared
logic; a separately user-authorized lint-only exception touches three existing
`web/src/lib/` files, detailed below. No table/citation/bbox fields,
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
- New workspace driver: **119 checks passed**, including navigation, active state, shell height, no page overflow,
  original grid cells/headers, filtering, split/expanded view, pointer/keyboard
  resize, focus return, and exact Agent callbacks. Synthetic Agent props exercise
  running/review states without a model request.
- The Agent fixture retains the real workspace rectangle below the toolbar and
  above the status bar, rather than assuming the entire 900px viewport is free.
  Four additional bounds checks prove running status, running/review composer,
  and pending-review heading fit inside that rectangle. The resulting light
  running and HUD review screenshots were inspected; these are deterministic
  component fixtures, not live-model output.
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
- GitHub's `ui-contracts` job passed on commit `05bbc38f` in
  [run 34290478079](https://github.com/erikjohnstone/master-plan/actions/runs/34290478079).
  This is distinct from the full release check.
- Both `full-web-check` and `ui-contracts` passed on `0082b7a9` in
  [run 34292447597](https://github.com/erikjohnstone/master-plan/actions/runs/34292447597).

## Separately authorized test typing

The user explicitly approved test-only typing fixes, preserving every assertion
and leaving all production/extraction code untouched. The 252 inherited
TypeScript diagnostics are resolved with type annotations/assertions in 16 test
files and a type-only fixture helper. No fixture values, runtime assertions,
production types, compiler options or lint rules were changed.

`node scripts/verify-test-runtime-parity.mjs 05bbc38f` compares executable
JavaScript before and after the typing edits, normalizing redundant parentheses
while preserving optional-chain boundaries. All 16 edited test files match.
The historical baseline/after logs still document the original UI-only state;
the separate `test-typing-*` evidence records this authorized follow-up.

The first post-typing unit run passed 2,514 tests and failed one unchanged
`mepconnectivity` wall-clock guard (64.31 seconds against 60 seconds) while
other validation jobs were running. An isolated rerun passed all 28 MEP tests,
with the dense-grid case taking 6.46 seconds. The failed concurrent run is kept
as evidence; no timing threshold or engine implementation was edited. Build
and benchmarks also pass after the typing changes.
The subsequent unmodified `npm test` run, without other validation jobs running,
passed **2,515 tests, 0 failed, 13 skipped** (2,528 total).

## Separately authorized lint-only cleanup

After the user delegated the decision in response to the explicit four-file
lint-cleanup question, the follow-up removes the 50 inherited lint errors:

- `agentLoop.js` and `takeoffWorkflow.js`: only redundant escapes; the former
  also loses one never-called arrow-function helper.
- `agentTakeoff.js`: unused local bindings become `_rowCount` and `_col`.
  The public `rowCount` property, its default/getter evaluation, function arity,
  and every call site are preserved.
- `TakeoffCanvas.jsx`: ten unused import bindings and one empty-catch binding
  are removed. Every import source and its evaluation order remain intact.

**Shared-path decision for this exception: YES for the existing shared-file
cleanup, NO for canvas imports and verification.** No UI/MCP fork is introduced.
No algorithms, matching rules, prompts, contracts or lint configuration change.
The three existing lint warnings remain; changing hook dependencies is outside
this behavior-preserving cleanup.

`node scripts/verify-lint-cleanup-parity.mjs c1b245a5` passes a whole-file parsed
structure comparison, permitting only the specified unused-binding/helper
removals and equivalent literal spellings. It verifies 654 regex literal
structures, identical cooked prompt/template text, unchanged raw tagged
templates, and scope-aware unused imports. The proof is separate from the
unchanged behavioral test suite.

The complete `npm run check` now passes: TypeScript, lint (0 errors / 3 inherited
warnings), 2,515 passing tests / 13 skipped, benchmarks, and production build.
The browser proof was repeated after cleanup against the original baseline:
all 9 tables, citation/bbox outputs, proposals, takeoff data and CSV still match.

## Live Agent table walkthrough

The user supplied a local key, verified by an authenticated models request.
It is locally Git-excluded, owner-readable only, never included in a commit or
this evidence. Captured text artifacts were checked for the secret before copying.

The real table-takeoff driver ran on document 19 through upload → indexing →
Agent Run → answer → Takeoff, without the `--compile` bypass or seeded results.
All four tables and all 11 graph rows match the unchanged ground truth. There
were zero browser errors; indexing took 21 seconds and the driver reported 49
seconds at Agent completion. The ordinary schedule query produced no finished
takeoff lines, consistent with the existing distinction between workflow data
and a compiled takeoff.

The existing strict answer scorer reports **0/5 completely exact rows and
240/260 tokens (92.3%)**. Inspection of every unmatched token found hyphenated
text (`DRAW-THRU`, component strings, drive descriptions) and ASCII dash
placeholders rendered by the model with typographic hyphens/dashes. The score
and scorer are unchanged; this is not labeled perfect transcription or an
extraction improvement. The full HVAC takeoff/export driver is a separate gate.

[Actual Agent screenshot](ui-workspace/evidence/live-table19/19__vol2__094.3b-agent-after-run.png)
and [unaltered result metrics](ui-workspace/evidence/live-table19/results.json).

## Open release gates — not claimed complete

1. The inherited **252 TypeScript errors and 50 lint errors are resolved** by
   the separately authorized typing and lint-only checkpoints. Three inherited
   warnings remain. No checks were hidden, ignored or weakened. The complete
   local check and both CI jobs passed on cleanup commit `0082b7a9`.
2. `playwright-table-takeoff-ui.mjs --doc 05` and
   `playwright-takeoff-ui-demo.mjs hvac` were attempted but refuse to start
   without a live `CEREBRAS_API_KEY`. The user subsequently supplied a local key;
   authentication was verified. The live table19 query completed (metrics above).
   The full HVAC driver reached a reported compile of 413 lines but its Takeoff
   panel contained zero lines/evidence and the driver failed its existing
   `T-HVAC-01` assertion. This is an unresolved end-to-end handoff failure, not a
   successful takeoff. No execution/extraction logic or expected results were
   changed to conceal it. A second live run captured the failure: `bad CLI JSON`
   at character 65,309. See the transport diagnosis below.
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

## Answer readability follow-up — first pass, superseded by reader below

Shared-path gate: **NO**. `AgentAnswer` lays out the existing flattened
`label: value · label: value` answer text; it does not query tables, infer a
quantity, repair content, modify prompts, or create takeoff records. Four or
more explicit fields become an expandable definition list. Duplicate labels,
empty values, original order and original Unicode characters remain intact.
Unstructured text and short lists retain their existing rendering. Long
headings remain in a labeled disclosure. Nonbreaking spaces in labels gain
layout-only word-break opportunities; no characters are substituted.

`playwright-agent-answer.mjs` replays the five recorded table19 answer rows
(175 fields), restoring Markdown markers lost by the earlier innerText capture.
This is explicitly a **presentation replay**, not a new live-model success and
not a repair of the recorded model's strict transcription score. The test
compares every rendered label/value exactly and checks keyboard disclosure,
responsive bounds and a separate synthetic citation callback/bbox control.
Screenshots show the production components with replayed response rows, not
the full original conversation or a newly extracted result.

## Explore results workspace — user-approved second pass

After reviewing the first pass, the user explicitly requested a dedicated
results workspace instead of in-chat field accordions. Dense unordered answer
rows now show **Explore results** in the conversation. It temporarily expands
the existing Agent workspace, with a searchable row navigator and a spacious
selected-row detail list. **Compare rows** is available only when every row's
field labels match exactly, position by position; duplicate labels keep their
separate positions. No field union, inference, renaming or value repair occurs.
Ordered/mixed instructions retain their original order in the conversation.

The existing composer, draft, run status/errors and pending proposal review
remain accessible. Back/Escape restores the prior dock width/expanded state and
launch-button focus. A cited value closes the reader and invokes the existing
Agent citation callback, which reveals the drawing. Reader expansion is
transient and is never written to project data or dock preferences. Removing
the answer cleans up its reader. The original row text remains available in a
disclosure. No new agent/extraction/backend props or callbacks were added.

The browser replay now loads and opens the actual built-in PDF before mounting
its controlled Agent state, so it uses the production workspace height and does
not leave the hidden Plan Navigator's capture-phase keyboard handler mounted.
That fixture issue was found by the Escape assertion; production keyboard
handling was not changed to accommodate the fixture.

Verified: 37 focused reader browser checks and all 119 workspace checks pass;
the full web check passes with 2,522 tests passed, 13 skipped, zero failures,
plus typecheck, lint, benchmarks and build. The reader is also tested with the
second live answer's long row labels. Long navigation/headline labels use CSS
ellipsis and retain their complete tooltip/text; every original value remains
fully readable in Details. Comparison pins the first field while scrolling.

The fresh live table19 run opened both reader and comparison successfully,
without seeded answers. Its graph again matched 4/4 tables, 4/4 row counts and
11/11 rows. Its generated answer scored **219/260 strict value tokens (84.2%),
0/5 fully exact rows**, versus 92.3% on the earlier model run. No prompt, scorer,
truth key, or extraction code was changed. UI presentation success is not a
claim of perfect model transcription. The original screenshots from that run
precede the long-label ellipsis polish; both source recordings are retained.

[Fresh live metrics](ui-workspace/evidence/live-results19/results.json) ·
[Fresh live reader](ui-workspace/evidence/live-results19/19__vol2__094.3c-results-reader.png) ·
[Reader regression checks](ui-workspace/evidence/results-reader/checks.json)

## Live HVAC transport failure — outside the UI change boundary

The retry's [recorded Agent outcome](ui-workspace/evidence/live-hvac-failure/agent-outcome.txt)
reports `bad CLI JSON: Expected ':' after property name in JSON at position
65309`. Takeoff again contained zero lines/evidence, and the unchanged full
HVAC driver failed. Dependencies are installed; the answer's suggestion to
install them is existing error wording, not a verified diagnosis.

The production CLI writes the compiled JSON to stdout and immediately calls
`process.exit(0)` (`mcp/scripts/production-graph-cli.mjs`, final statements).
Its Vite caller parses that stdout as JSON. Both files are byte-unchanged from
baseline `8414e3ae`. A local subprocess reproduction of this exact write/exit
pattern produced **65,536 of 1,048,588 expected bytes, invalid JSON, exit 0**
in all three trials. A separate synthetic control waiting for the write
callback delivered **1,048,588 bytes and valid JSON** in all three trials.
This strongly identifies pipe truncation as the live failure mechanism; no
production code was changed, and no compiled quantities were substituted.

The synthetic reproduction requires no blueprint, key, backend edits, or new
extraction logic:

```js
const result = spawnSync(process.execPath, ['-e',
  "process.stdout.write(JSON.stringify({value:'x'.repeat(1048576)}));process.exit(0)"
], { maxBuffer: 2000000 });
// Inspect result.stdout.length and JSON.parse(result.stdout.toString()).
// Control: process.stdout.write(payload, () => process.exit(0)).
```

Fixing the CLI output lifecycle is a runtime/transport change, not cosmetics.
It remains unmodified under the user's strict UI-only boundary. This live gate
is **failed**, even if the PR's deterministic UI and standard CI checks pass.

## Representative comparison (1440×900)

Before:

![Previous schedules drawer](ui-workspace/evidence/baseline/1440-schedules.png)

After:

![Schedules workspace](ui-workspace/evidence/after/1440-schedules.png)

![Agent workspace](ui-workspace/evidence/after/1440-agent-empty.png)
