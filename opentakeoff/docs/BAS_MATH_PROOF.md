# BAS math: verification record

Work date: 2026-09-09. Implementation branch: `codex/bas-math-engine`.
Base: `61698a0b`. No changes to VectorGrid, graph extraction, legend learning,
symbol sweep, or the legacy BAS/equipment/valve compiler.

## What was proved against drawings

The coordinator rendered the actual PDF pages and independently checked the
printed physical and integration assignments. The original production graph
tables were retained in `bas_engine/tests/fixtures/indexed-bas-tables.json`;
separate manually derived per-row expectations live in `test_real_index.py`.
Tests check every one of the 180 rows below, including rows with no physical or
integration assignment. These are not inferred project-wide device counts.

| Source and reviewed scope | Rows | AI | AO | DI | DO | Soft variables |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Fort Sam Houston excerpt, M510 FCU list, once | 19 | 5 | 3 | 0 | 1 | 0 |
| Same excerpt, M511 DOAS-3 list, once | 29 | 5 | 4 | 3 | 10 | 0 |
| Same excerpt, M511 VAV list, once | 4 | 0 | 0 | 2 | 1 | 0 |
| Same excerpt, M512 DOAS-1/2 list, once | 27 | 5 | 4 | 2 | 9 | 0 |
| Center for Behavioral Medicine, M701 matrix | 101 | 33 | 21 | 23 | 14 | 9 |

Fort Sam Houston total over these four lists is **[15,11,7,21]**. The engine
preserves unusual *printed* choices such as setpoints in DO and pressure in DI;
it does not silently reclassify them using point-name guesses. Twenty-five
alarm-only rows do not create additional copper or soft variables.

The M701 cross-check is independently decomposable: three chillers each have
8 AI, 2 AO, 1 DO and 3 integration variables; eight pumps each have 2 DI, 1 AO
and 1 DO; three towers each have 2 AI, 2 AO, 2 DI and 1 DO. The remaining rows
add 3 AI, 1 AO and 1 DI. Row 1 has GUI flags only. Read-only/read-write, trend,
alarm and GUI flags never add physical terminals or duplicate integration points.

### Real input limits, not hidden zeroes

- The Fort Sam Houston file contains 9 supplied pages, not the entire underlying
  project set. The existing benchmark review identifies 193 point-matrix rows
  across 12 templates. Only 79 rows across four matrices are typed by this
  current graph path. This work does **not** claim the missing 114 rows vanished
  or that each template occurs once in the installed project.
- The initial legacy compiler selected none of Fort Sam Houston's singular
  `BAS INPUT/OUTPUT POINT LIST` tables. The additive BAS adapter can consume
  those already-indexed cells without changing the legacy classifier or totals.
- M701's graph contains its typed nested column headings as the first row.
  The BAS adapter reads that existing structure and retains header citations.
  It does not assign meaning to opaque `DDC HARD WIRED POINTS 2` headings
  without their explicit subheadings.
- The existing sequence compiler returned zero sequences on both inspected
  graphs. The source drawings visibly contain SOO, including M701's detailed
  chilled-water sequence beside its matrix. The automatic runs therefore stay
  point-list-only and flag the missing SOO result. No copied point list was
  presented as independently extracted SOO. SOO-only and both-source math are
  tested with explicit typed arrays, including contradictions and missing rows.
- Network endpoint routes/distances, controller purchase scope and license
  contracts are not established by those matrices. Factory-integral/existing
  controllers are not proof that another controller should be purchased.
  Nothing in these proofs selects products, certifies installation wiring, or
  ingests a specifications book.

## Live Takeoff verification

`web/scripts/playwright-bas-math.mjs` uploads the actual source PDF, waits for the
existing production graph, calls the actual `compile_corpus_takeoff` path, and
reads the rendered top-level Takeoff panel. It does not stub responses, inject
a fixture into the UI, or replace the graph. The deterministic compile entry
point is used directly, so no LLM/API key is required for this engine proof.

The demo deliberately supplies a clearly named abstract profile: rigid
**[8,4,8,4] plus 8 UI**, with a **15/100 demand-add-on** spare rule. These are
demonstration inputs, not requirements claimed from either blueprint. Group
quantity remains one per listed table; equipment replication is flagged.
An explicit 10-point software-license pack is likewise illustrative.

Under that policy Fort Sam Houston needs 1, 3, 1 and 3 abstract blocks for its
four separate table scopes. M701 needs seven blocks for its one declared pool;
the 25 required AO terminals govern that ceiling. Nine listed integration
variables fit one 10-point illustrative pack. These results are mathematical
capacity scenarios, **not controller purchase orders**.

Evidence bundles contain the actual response, export, screenshots and machine
assertions. Checks cover displayed totals, keyboard tabs, JSON download,
opening a source on the drawing, reopening Takeoff and filtering without
changing totals. The source screenshot waits for the real sheet to finish
rendering, not merely for a highlight record to exist.

## Defects exposed by integration

1. **Large-response truncation:** the production CLI called `process.exit(0)`
   immediately after `stdout.write`. The larger BAS payload was cut off around
   64 KB. The new shared CLI writer awaits completion before exiting; a 5 MB
   UTF-8 regression also proves that a persistent child/timer does not keep the
   completed command alive. Values are not altered.
2. **New BAS citation identity:** the upload cache returns hashed filenames;
   the canvas uses original filenames. The existing graph identity translation
   is reused for the **new BAS evidence only**. Tests preserve original compiler
   output, point/group IDs, text, quantities and bbox coordinates byte-for-byte.
3. **Nested indexed headers:** explicit physical/integration subheadings were
   present but not previously consumed by the math adapter. Reading them adds
   no PDF/geometry/extraction fork and keeps GUI/read-write flags out of counts.
4. **Zero-equipment soft licensing:** project-scoped soft variables attached
   only to a zero-quantity equipment group must not create phantom demand.
5. **Agent text budget:** the real M701 BAS result serializes to about 300,000
   characters, but the existing Agent text limit is 5,000. Sending that raw
   field before the legacy metadata cut off diagnostics, hardware and the old
   completion fields. A chat-only bounded projection now preserves core totals,
   readiness and diagnostic codes, with explicit omitted-entry counts. The
   canonical UI/tool result, point rows, citations and JSON export are unchanged.
   Regression tests use both real responses and the actual provider-request
   builder (mock provider only, no LLM answer used as mathematical evidence).

## Verification gates

- Python: strict Pydantic V2 inputs/outputs, strict mypy, pytest covering exact
  hardware assignment and route-partition enumeration, spare denominators,
  10^12 equipment replication without materializing devices, SOO-only/table-only/
  both, negative/bool/fractional/NaN inputs, missing/duplicate identities,
  independent licensing, infeasible capacity/distance and every source row above.
- Node: Python transport validation, missing runtime and timeout, safe JSON
  integer limits, unmodified non-BAS/legacy outputs and multi-megabyte CLI flush.
- Web: full existing `npm run check`; new source-key and presentation regression
  tests; real-upload walkthroughs and visual inspection.
- Packaging: build/install the Python wheel, build the MCP distribution, retain
  the same Python sources in the distribution, and run the MCP protocol smoke.

### Completed local results

- **61 Python tests passed**, including the independent 180-row drawing keys.
  Strict mypy passes all nine engine modules.
- **Seven Node transport/orchestration tests passed**, covering strict and oversized input,
  rounded-result rejection, timeout, missing runtime, legacy preservation and
  complete UTF-8 pipe flushing. The packaged server also
  passed a real MCP-stdio call exercising SOO-only input, replicated integer
  hardware, separate software packs, serial partitioning, IP sizing and exact
  text/structured-result parity (`mcp/scripts/smoke-bas-dist.mjs`). Its blank PDF
  and explicitly typed requirements are runtime fixtures, not extraction proof.
- **The complete web `npm run check` passed:** 2,553 tests passed, 13 skipped,
  zero failed; type checking, lint, the unchanged One-Click benchmark and the
  production build also passed. The broader MCP regression limitation is
  documented below; it is not counted as green.
- Both full-file Takeoff walkthroughs passed all eight checks with no browser
  page errors: the supplied **nine-page Fort Sam excerpt** and the **entire
  29-page Center for Behavioral Medicine file**, not a reduced page substitute.
- Actual downloaded BAS JSON was compared with the complete displayed Python
  result using deep equality for both files. All fields, not just totals, match.
- The source screenshots were visually inspected: Fort Sam navigates to M511's
  damper-position row; the second file navigates to M701's chilled-water
  differential-pressure sensor row. The original coordinate boxes are retained.
- MCP distribution build and protocol smoke passed. Every distributed Python
  module was checked byte-for-byte against the one shared source implementation.

| Live evidence | Points table | I/O capacity | Licenses | Issues | Original drawing |
| --- | --- | --- | --- | --- | --- |
| Fort Sam Houston | [Screenshot](bas-math-evidence/fort-sam-final/01-points.png) | [Screenshot](bas-math-evidence/fort-sam-final/02-capacity.png) | [Screenshot](bas-math-evidence/fort-sam-final/03-licenses.png) | [Screenshot](bas-math-evidence/fort-sam-final/04-issues.png) | [Source highlight](bas-math-evidence/fort-sam-final/05-source.png) |
| Center for Behavioral Medicine | [Screenshot](bas-math-evidence/behavioral-final/01-points.png) | [Screenshot](bas-math-evidence/behavioral-final/02-capacity.png) | [Screenshot](bas-math-evidence/behavioral-final/03-licenses.png) | [Screenshot](bas-math-evidence/behavioral-final/04-issues.png) | [Source highlight](bas-math-evidence/behavioral-final/05-source.png) |

Each linked directory also contains `result.json`, the actual `export.json`,
and `checks.json`. The first file supplies 54 positively typed requirements;
the second supplies 100 (91 physical and nine software). Source rows with only
GUI/alarm flags remain in the independent source review but not in those totals.

To repeat the live proof, start the existing development server with the BAS
Python runtime installed, then from `web/` run:

```sh
OT_UI_URL=http://127.0.0.1:5177 \
OT_UI_PDF='/absolute/path/to/the/original.pdf' \
OT_BAS_OUT=/absolute/path/to/a/new/evidence-directory \
OT_BROWSER_LARGE_HEAP=1 \
node scripts/playwright-bas-math.mjs
```

If Playwright's default browser is not installed, set `OT_BROWSER_PATH` to an
installed compatible Chromium executable. `OT_BROWSER_LARGE_HEAP=1` raises the
test browser's heap; it does not change application code or extraction rules.
Use `NODE_OPTIONS=--max-old-space-size=8192` when starting the local server for
the larger unchanged graph workload. Neither memory setting is required by the
small deterministic Python calculations themselves.

### Broader MCP regression limitation

The full existing MCP command was attempted serially. Its tool conformance and
context tests passed, as did structural HVAC/BAS/valve compiles across every
available PDF in that cross-set test (about 560 seconds). The older WP1
acceptance assertions then failed on three existing fixtures:

| Fixture | Existing expected HVAC total | Actual from this branch | Actual from unchanged main |
| --- | ---: | ---: | ---: |
| bldg5406-hvac-demo | 32 | 14 | 14 |
| federal-mech | 103 | 128 | 128 |
| itd-d1-lab | 93 | 97 | 97 |

A detached checkout of **main `61698a0b`** compiled the exact same actual saved
graphs. Every output field matched this branch for all three legacy kinds:
HVAC, BAS and control valves. [A/B result](bas-math-evidence/main-compiler-comparison.json).
This isolates compiler equivalence; it is not represented as a second cold
extraction run. Session, VectorGrid, the graph pipeline and both existing
compilers are unchanged in the diff.

Additional older bulk cases were skipped because their expected `bulk/...`
PDF paths are absent in this checkout. The broad run also held an idle table
sidecar open after its completed cross-set assertions; that owned process was
stopped so the test runner could proceed. After reproducing the above baseline
failures, the remaining broad run was stopped. Unexecuted tests are **not**
claimed to pass. No expectations, thresholds or extraction code were changed.

Consequently this is a verified BAS-engine implementation with real-source UI
proof, **not a claim that the entire platform has a green MCP release gate**.
It remains on the feature branch, unmerged and undeployed. The existing
acceptance discrepancies require separate investigation before a clean release.

## Deployment boundary

The checked-out UI runs against the existing local server-capable compile
endpoint. Python 3.11+ and Pydantic V2 are required on that host. Static-only
hosting cannot execute this engine; this change does not create a cloud backend,
provision an interpreter, publish an npm package or change live production.
An unavailable runtime is disclosed rather than replaced with browser math.
The 29-page source graph exceeded the default Node heap during the first local
read; an 8 GiB maximum heap allowed that unchanged graph path to finish. An
initial browser walkthrough also exited before completion. The successful
full-file retry used the explicit larger browser heap and retained all 29 pages.
These are recorded workload/resource limits, not BAS arithmetic fixes.
