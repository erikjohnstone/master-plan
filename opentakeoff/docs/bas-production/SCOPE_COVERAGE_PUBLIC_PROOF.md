# Public scope and source-coverage proof

2026-09-10, after `371ec826`. This increment exposes the existing shared scope
and coverage journal through the ordinary Takeoff UI and packaged MCP. It does
not complete workflow E or the main BAS goal. Acceptance was declared in
`SCOPE_COVERAGE_PUBLIC_CONTRACT.md` before implementation.

## What changes

**Scope & coverage**, inside **Review & changes**, offers a populated inventory
of retained equipment, assignments, components, responsibilities and engineering
checks. An estimator can choose included claims, record source-backed exclusions,
preview dependencies, save an explicit scope and review original page/span
coverage. Exact source-reference intersections suggest existing evidence items;
they do not supply an applicability verdict. Historical replay retains original
inputs, conflicts, supersession, withdrawal and dependency changes.

Shared-path gate: catalogs, source ownership, mapping candidates, preview and
journal semantics belong in `web/src/lib`. UI layout, draft/paging state and
browser adoption remain surface-specific. The MCP adapter supplies only guarded
Session delivery, bounded paging and atomic exports. No extraction, VectorGrid,
symbol matching, point interpretation, bbox contract or Python arithmetic change.
The source lookup was factored from the existing journal without changing its
canonical source payload or fingerprint meaning.

Browser writes remain self-declared operator decisions; MCP writes are agent
proposals. Neither is approval. The local, unpublished MCP metadata is
`0.9.78`, with 53 registered tools. Normal BAS tests now include the scope gate.

## Original input and reproducibility

Real original: `12__vol2__028__Fort_Sam_Houston_Building_615_Controls_Excerpt.pdf`,
nine pages, 924,578 bytes, SHA-256
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
The input history is
`evidence/engineering-families-browser-3/ip-reviewed.takeoff.json`, SHA-256
`afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`.
Hardware ratings, applicability, exclusions and reviewer declarations are
controlled inputs. This is not fresh extraction ground truth, a real addendum
or verification of the installed design.

Run `web/scripts/playwright-bas-scope.mjs` with the original PDF, input history
and a fresh output directory. Use this checkout's Vite on port 5177 and Chrome
through `OT_BROWSER_PATH`. Then build MCP and run
`mcp/scripts/verify-bas-scope.mts` with the original PDF, the browser's
`reviewed.takeoff.json`, its `coverage-review.json` and a fresh output directory.
Both use ordinary public upload/import and tool/UI operations, not injected
React state or direct Session mutation.

Final browser workflow SHA-256:
`669c397133b88b7870e6e8027d28f7e3f2583b09a778b64ea14f0bd9b5fae156`;
browser coverage replay:
`3d505c0756c342e735815bad8c069eab39b48b7438f3641d69e4fc9da86d920c`;
final changed MCP workflow:
`62707f44fc527e3661ffa226f541fa77b79efdfd2616430a1299ec79fd364232`.

## Actual browser journey

Final session **43229 exited 0**; authoritative evidence is
`evidence/scope-browser-7/proof.json` and its sibling artifacts:

1. Upload the original PDF and import retained review history. Create the drawing
   source set through the existing UI; populate nine available claims.
2. Explicitly exclude one declared engineering claim with a reason, consequence
   and original-page reference. Open that exact whole page in the original-source
   reader. Return with the unsaved scope and decision reason preserved.
3. Preview without saving, then save with keyboard activation and explicit
   self-declared identity. Edit the saved scope and discard the changed draft;
   the saved name/history remain unchanged.
4. Select the supply-fan VFD assembly claim and its original controls page. Load
   all retained text, choose an assessment and explicitly select 26 source-linked
   candidates. No assessment or source-inspection attestation was preselected.
5. Follow the component's original VFD clause to M-512 with its unchanged bbox.
   Wait for actual sheet rendering. Return with the mappings and reason intact.
6. Save and replay coverage, export the full original/current evidence, then
   record a controlled conflicting assessment on one exact original text span.
   Empty span selection cannot prepare a review. Both overlapping decisions
   remain visible. Explicit withdrawal clears the active conflict, not history.
7. Withdraw the original coverage, export the full workflow, reload and inspect
   the retained withdrawn decision. Five scope events survive; original captures
   and independent engineering history are unchanged.

Zero browser errors. Measured catalog/preview/save-scope/load-source/prepare/
save-coverage/replay times: **944 / 1,378 / 3,666 / 1,011 / 991 / 4,262 / 1,183 ms**.
Each is below the predeclared 10-second public-operation bound. These are one
serial real-retained journey's measurements, not a p95 or maximum-capacity claim.

All 24 scope/coverage/history/conflict screenshots were visually inspected at
1280×800, 1440×900 and 1920×1080 in both themes, plus the whole-page reader and
exact-clause source screenshot. Dense tables retain internal scrolling/paging;
screenshots taken after navigation show their actual scroll positions. The
unchanged horizontal-overflow assertion passes. Original source references and
full exported text are not shortened to fit the display.

## Packaged MCP journey

Final session **6167 exited 0**; authoritative evidence is
`evidence/scope-mcp-2/proof.json` and its sibling artifacts. The actual built
stdio server loads the original and imports the browser history. Its complete
historical source/mapping projection equals the browser's original projection
and the shared replay result. A two-row catalog page reports the full total;
atomic exports retain the full projection. The source crop visibly highlights
the same VFD clause, using the original PDF and bbox.

The script records an agent proposal, verifies exact retry and stale-head
rejection, and proves failed writes leave history unchanged. Actual public
`compile_corpus_takeoff` review commands then change an unrelated engineering
note and a related equipment-member decision. Coverage stays
`current_dependencies` for the former and becomes `changed_dependencies` for
the latter. Its original evidence never changes. Full export/import into a new
server process preserves all six scope events and the exact workflow.

Catalog/replay/prepare/record/unrelated-replay/related-replay/reopen times:
**2,227 / 1,752 / 1,734 / 1,838 / 2,095 / 2,109 / 2,002 ms**. Each is below 10 s.
This verifies public transport, replay and declared dependency handling, not
additional automatic BAS interpretation or installed quantities.

## Regression gates

Focused **26266 exited 0**: 19 catalog, ownership, review and browser-guard tests;
web types, scoped lint and script syntax. Repeated labels and IDs across captures
remain separate. Tests cover unselected source sets, excluded pages, foreign
spans, immutable request capture before awaits, cancellation, stale browser
workflow/source/storage/epoch, 2,000-claim refusal without truncation, retained
exclusions, and every row across a 213-item paged list.

Focused MCP **90876 exited 0**: types, 11 scope/registered-tool/shared-Python
integration tests and packaging build. Existing unknowns and failed constraints
are retained. Expired/replaced views, stale/cancelled operations and invalid
response queries cannot silently adopt a decision.

Final web **73663 exited 0**, `npm run check`: **2,862 pass / 13 existing skips /
zero failures**; types, lint, all configured benchmarks and production build
pass. Tests took 86.031 s; build 8.94 s. The same three canvas lint warnings,
four legacy One-Click known-fail controls and bundle/Agent notices remain. None
of their gates or exemptions changed. This is not a new HVAC/BAS corpus score.

The retained scope-journal benchmark measured **1.359–2.382 s** per operation,
**152,059,904-byte** incremental peak RSS, below its unchanged 5 s/512 MiB bounds.
The scope compiler measured **1.460–1.772 s / 60,375,040-byte** incremental RSS.
Document links pass for all 31 checked files. Node 24.13.1, macOS arm64, Apple M2.
Logs: `tmp/bas-scope-web-final.log`, `tmp/bas-scope-doc-links-final.log`.

Final MCP **36909 exited 0**: types; **128 BAS + 33 revision + six issue + 11
scope + four packaging + 122 staging/safe-write/tool tests**, all pass. Existing
revision/issue performance gates pass. Tool-count validation reports 53 tools,
three markers and zero stale counts. Revision comparison took 2.932–2.978 s;
revision journal operations 2.971–3.212 s; issue journal operations 1.357–1.728 s.
Their incremental peak RSS was 143,540,224 / 267,698,176 / 428,539,904 bytes,
respectively, below the unchanged 512 MiB budgets. These are retained-data
regression checks, not new corpus interpretation scores.

Logs: `tmp/bas-scope-mcp-{types,bas,pack,tools}-final.log` and
`tmp/bas-scope-tool-count-final.log`. Python **45740 exited 0** with
`OT_BAS_VERIFY_PACKAGE=1`: **453 pass / zero skips**, 12.40 s, including actual
packaged-runtime parity. Configured mypy passes all 20 source files. Python
3.14.3; no Python source changes. Logs: `tmp/bas-scope-python-final.log` and
`tmp/bas-scope-mypy-final.log`.

## Failed attempts and limits

Browser runs 1–4 remain local: an implicit select-label lookup, two reproduced
nested-fieldset overflows, and a filled-textarea label lookup after remounting.
The last was independently reproduced with a minimal Playwright page; the draft
was present. Explicit labels and scope-only intrinsic sizing fixed the actual
issues. No assertion was weakened. Run 4's premature rendering screenshot was
rejected. Run 5 passed the first journey; run 6 added span conflicts and edit
discard. Run 7 adds whole-page exclusion navigation and is the final UI proof.
MCP run 1 passed, but its source crop selected a nonrepresentative numeric span;
run 2 selects an actual source reference of the reviewed component.

Nine populated claims and 26 selected reference candidates measure workflow
organization, not automatic requirement coverage or correct installed quantity.
Users still decide scope, applicability, mappings and conflicts. Source bytes
and saved Python results are not verified merely by recording coverage. The
original source reader and calculation replay have separate verification paths.
The page-text reader includes non-BAS spans and requires paging; it does not rank
semantic relevance. Meaningful accepted/corrected/rejected draft coverage and
remaining estimator effort still need measurement in the final A–D journeys.

No new corpus or blind-holdout evaluation was performed for this public access
increment. The existing non-green corpus baseline is not superseded. Selective
readiness/approval, source-inclusive approved snapshots, remaining A–D acceptance,
final corpus/holdout checks and the appended researched symbol/installed-plan
phase remain required. No push, merge, deployment or publication occurred.
