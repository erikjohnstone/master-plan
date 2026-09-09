# BAS production workflow progress

## Shared source foundation — 2026-09-09

Research/acceptance baseline committed locally as `333c5bac`. The first code
step adds loaded-byte SHA-256 identity and `Session.basSourcesForPipeline()`;
shared schema/alias validation lives in `web/src/lib/basSources.ts`. This is
the source adapter for upcoming workflow consumers, not completed SOO discovery
or a newly exposed UI/MCP workflow. Existing graph, table, symbol, legacy compile
and BAS math code are unchanged. No pricing/costing/labor or runtime vision.

Verified final candidate:

- Four shared-contract unit tests pass; two real-PDF Session tests plus the
  existing seven BAS transport tests pass. Default MCP `npm test` now runs this
  BAS gate via its pretest hook; this does not imply the remaining legacy suite
  is green.
- MCP typecheck and build pass. Full web check passes on the final candidate:
  2,557 pass, 13 pre-existing skips, zero failures, benchmarks and build pass.
- Final source parity run: 24 development PDFs, 1,253 pages, 563,248 spans,
  every source hash/text/bbox/page frame/replay check passed. Two textless pages
  are retained as unavailable text, not interpreted as empty BAS scope.
  Six holdout records/bodies remain unopened.
- The diagnostic took 89,830 ms summed across documents and peaked at
  1,088,503,808 RSS bytes. It includes two PDF reads plus validation and replay;
  this is not a cold/warm takeoff-pipeline performance claim.
- Source contract and exact test semantics: `SOURCE_CONTRACT.md`. Eight
  explicitly titled, independently source-reviewed primary SOO bodies and
  negative controls for the next step: `NARRATIVE_CASES.md`.

Next: shared narrative region discovery and complete coverage accounting,
beginning with independently reviewed multi-column/mixed-table source layouts.
Then equipment/template joins and durable BAS records, following the full
implementation plan. None of the five end-to-end workflows is declared complete.

## Checkpoint — 2026-09-09

Goal: `../BAS_PRODUCTION_GOAL.md`. Active, incomplete. Coordinator-only.
Branch: `codex/bas-math-engine`; production baseline `161583a4aeabd5de08b092d0c154aa880bd02b24`.
Original corpus root is read-only. No production behavior changed in this research checkpoint. No push/merge/deploy.

### Completed evidence

- Read goal, repository instructions and BAS architecture. Primary-source/competitor research and code map: `RESEARCH.md`.
- Pre-implementation contracts, five complete journeys, UI placement and acceptance gates: `IMPLEMENTATION_PLAN.md`.
- Content-identity inventory: 30/30 focus PDF hashes match, 190/190 source PDF hashes match, 113 logical source sets. Inventory script is offline metadata only.
- New-workflow holdout reserved before body/key inspection: ranks 5, 8, 15, 19, 24, 27 plus matching source sets/hashes. Historical exposure is disclosed, not called never-seen generalization.
- Revalidated all 24 development records. Initial bundle-only validator passed 23 and rejected schema-1 record 21; its existing dispatcher/schema-1 validator then passed 242 assertions. No key/scorer changes. Raw logs preserve the initial failure and correct follow-up.
- Full `web/npm run check` exited zero: 2,553 pass, 13 skip, zero fail; benchmarks and build pass. Build warns about bundle sizes and unconfigured Agent key; deterministic workflow tests need no key.
- Python pytest: 61 pass. Configured mypy (`--config-file bas_engine/pyproject.toml ... --exclude tests`): nine source files pass. A bare unconfigured mypy invocation traversed build copies and failed; not the configured gate and not fixed by changing production code.
- Node BAS transport tests: seven pass. Current MCP typecheck exited zero.
- Real Fort Sam UI upload → production compile → shared Python → source navigation/export: existing eight-check harness passes. Totals [15,11,7,21], not installed project quantity.
- New UI baseline: six screenshots, 1920/1440/1280 widths in light/dark. Source is a real upload; no injected result. No page errors. BAS metadata present before reload and absent afterward.
- Text-only capture from production PDF adapter: nine Fort Sam pages / 3,995 spans. M-509 sequence headings/bodies present. Source page visually inspected: two separate sequence columns. Existing table-centered sequence compiler remains zero on the retained Fort Sam/Behavioral graphs.

### Confirmed gaps driving next work

1. Narrative prose is available but omitted by table-centered sequence extraction. Add shared text/region path; do not force prose through VectorGrid.
2. Fort Sam current typed matrices cover 79 of 193 independently reviewed source rows. Diagnose the other 114 by discovery/extraction/interpretation; no implied waiver.
3. BAS state is transient; stable source/equipment identities and durable decisions are required before revisions can be reliable.
4. Existing PDF revision store deletes revision bytes on file removal. Referenced approved BAS sources need retention and portable export.
5. Existing revision comparison is flooring/condition-quantity oriented; reuse storage conventions but do not alter its commercial math or call it BAS review.
6. Current BAS UI spends most of the first 1280×800 screen on headings, navigation, copy and summaries. Use one equipment-centered table with contextual details and Review & changes.

### Baseline limitations

Full MCP is not green by claim. Same-baseline prior proof records WP1 failures (bldg5406 32 vs 14; federal 103 vs 128; ITD 93 vs 97) reproduced with unchanged legacy compiler outputs. Existing main-compiler comparison used the same saved production graph, not a second forced-cold extraction. Re-run applicable gates before integration; never hide these failures.

Ground-truth validators corroborate authored assertions and source/render integrity, not automatic completeness for new workflows or fresh independent symbol counts. New feature expectations and full corpus metrics remain to be built and executed. Metadata BAS screening is not a complete new applicability judgment.

### Next

Add the tested shared source-version/text-only seam, then source accounting and narrative discovery. Preserve existing contracts/outputs. Connect durable BAS state before expanding UI functionality. Follow the complete implementation sequence and gates in `IMPLEMENTATION_PLAN.md`.
