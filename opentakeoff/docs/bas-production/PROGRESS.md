# BAS production workflow progress

### Final verification for the point-record checkpoint

All handles listed in the checkpoint below are now terminal; **do not restart
them**. Web `78183` completed the entire check: 2,573 pass / 13 existing skips,
typecheck, lint, benchmark and build pass. Final MCP `1624` completed typecheck,
**20 tests** (including diagnostic negative controls) and build. Python remains
97 pass / mypy 11 source files. `git diff --check` passes.

Baseline takeoff/reference `59931` completed: all three per-set metric lines and
every reported takeoff/reference failure detail are identical to candidate.
The seven missing items, 16 key-flagged additions and 30 missing ITD reference
cells are therefore reproduced on the starting revision, not newly introduced
by this batch. These are unresolved baseline failures, not correctness passes.
Graph A/B `81547` completed for all three documents: baseline tables preserved
12/12 Fort Sam, 9/9 Behavioral Medicine and 1/1 JVWTP; only Fort Sam has added
regions (eight, independently keyed). Replay table sequences and remaining
relationships match. Timing/cache limitations below remain; this is not a
frozen final performance gate or a full-corpus result.

The newly authored matrix audit had a false-pass hole: a missing nonempty-cell
box was skipped. A controlled checksum fixture reproduced it; missing, inverted
or out-of-region boxes now fail. The original PDF/key audit reran with this
stricter diagnostic and still passes all 1,603 values, every expected nonempty
box check, 193 rows and 12 preserved original tables. No historical scorer or
key changed. Report normalization now accurately states NFKC/case/whitespace,
not the earlier inaccurate “whitespace-only” description. Logs:
`point-audit-box-before.log`, `point-matrix-audit-final.log`,
`point-production-mcp-verified.log`, `point-production-web-verified.log`.

This is a local implementation checkpoint, not production completion. No active
verification jobs remain. Keep the detached baseline checkout for later frozen
performance/coverage checks. Next substantive implementation remains canonical
durable BAS/equipment workflow state and actual Takeoff presentation, then the
remaining required SOO/assignment/assembly/compatibility/revision journeys.

## Source-bound point records on production path — 2026-09-09

The preceding user-question turn was **no progress** (status clarification).
This continuation is **progress**: shared Python point interpretation, strict
source/result contracts, independent negative controls, production orchestration,
MCP schema exposure and source-preserving browser adaptation. No VectorGrid
reader/parser/threshold change, no agents, no push/merge/deploy.

- Shared `bas_point_lists_v1` retains all matrix rows/cells and supported literal
  controller notes. Source byte/page identity is separate from navigation names.
  Hardware declarations, software values and attribute flags remain distinct;
  the new record deliberately has no installed-device or field-wiring total.
- Fort Sam fresh production CLI: 12 matrices / 193 retained listed rows / 246
  observations, six actual footnote spans, 16 reviewed chiller/boiler row bindings.
  Every legacy and `bas_math` field equals the prior compile exactly. The original
  zero-row legacy compiler result is still disclosed; it is not silently repaired
  by substituting these observations into its old contract.
- Real MCP `load_plan` + `compile_corpus_takeoff` verified against that CLI result,
  including raw rows, source IDs, all note text/boxes and structured/text parity.
  MCP's existing `path:null`/`export_path:null` envelope is checked explicitly.
  An initial diagnostic failed because it had not accounted for those two
  existing transport fields; the failure log is retained. Corrected parity:
  `evidence/fort-sam-point-production-parity.json`, 28,905 ms, main-process peak
  RSS 407,207,936 bytes. This is not a whole-process-tree or performance A/B claim.
- Python: **97 pass**; mypy **11 source files pass**. MCP shared BAS suite:
  **16 pass**, typecheck and build pass. Browser adapter: four tests pass,
  including the real retained point result. Final full web rerun is live after
  replacing unsupported ES2022 `Object.hasOwn` with the existing target's
  `hasOwnProperty.call`; no TypeScript target or lint gate was relaxed.
- New negative cases reject BAS-keyword-only/reference captions, invalid raw
  boxes (including unknown columns), malformed source identities, orphaned or
  altered output evidence, omitted rows, status conflicts, and ambiguously owned
  notes. Missing/rotated/out-of-region footnotes do not become integration facts.
- Sparse graph cells are an intentional existing contract. New
  `unobserved_columns` lists absent cells without manufacturing zero/box evidence;
  `uninterpreted_columns` separately retains supplied unknown content. The first
  missing-cell test draft failed on a fixture KeyError, not an engine defect;
  corrected before/after evidence is retained and documented in the contract.
- Core candidate gate completed: takeoff 89.8% exact / seven missing / 16 keyed
  false-add flags; applicable installed 148/160, expected refusals 1/6; reference
  37/67; graph 78 correct / zero wrong / 13 missing CEILING cells; symbols 66/66.
  Starting-revision Baker graph independently reproduces the same 13 misses.
  Baseline takeoff/reference comparison remains live, so its other misses are
  not yet labeled pre-existing. No table-recall keys exist for these three sets.
- Equal 4-GiB-heap graph A/B retry completed Behavioral Medicine: all nine tables,
  sheet metadata and remaining relationships unchanged; no additions. The first
  default-heap baseline OOM remains retained. Fort Sam preserves all 12 previous
  tables and adds the independently keyed eight regions. JVWTP comparison remains
  live. Cache repeats overlapped non-extraction MCP source changes, which are in
  the cache digest: do **not** interpret their warm labels as verified cache hits
  or call these a frozen full-code performance gate. A final frozen warm check
  remains required; no extraction code changed during those comparisons.

Current live handles at this checkpoint: baseline takeoff/reference `59931`;
graph A/B `81547` (JVWTP candidate); final web `78183`. Terminal: fresh CLI
`81751` pass, first MCP diagnostic `79619` fail (envelope described above),
corrected MCP parity `83377` pass, MCP gates `31180` pass, Python `6463` pass.

**Remaining end state:** all five complete workflows remain required. Point
records are now in shared compile JSON and carried by browser metadata, but
dedicated UI presentation, canonical durable state, reviewed corrections,
equipment/template joins and complete export are not implemented. Next move is
canonical persisted BAS workflow/equipment records and actual Takeoff presentation,
alongside SOO requirement interpretation—not more observer-only completion claims.
Large-source batching (current 32-MiB transport), source version retention,
assemblies/responsibilities, compatibility, revisions/approvals, full corpus and
holdout/UI gates remain open. Holdouts have not been opened.

Contract: `POINT_REVIEW_CONTRACT.md`. Graph/routing contract separately updated
with fail-before/pass-after glued POINTLIST admission, not inferred from the
mixed-caption Fort Sam page. No completion or genuine blocker claim.

## Point-header interpretation and regression checkpoint — 2026-09-09

The previous user-question turn was a status clarification (no implementation
progress). This continuation made concrete progress: reproduced six header
interpretation failures, fixed the shared Python consumer, verified all 73
Python tests, mypy on nine source files, seven transport tests, MCP typecheck
and build. No VectorGrid reader/geometry/parser change. No push/merge/deploy.

- Nested HARDWARE POINTS / SOFTWARE POINTS parent headings now expose the
  existing directional/value children. Four M-506 matrices independently
  verify four positive AI rows and fifteen AV rows; trend/alarm/display flags
  add neither terminals nor software values. Explicit conflicting scope is
  unresolved, not resolved by precedence. Full source tables remain untouched.
- Fresh real production CLI compile: original legacy result excluding
  `bas_math` is exactly unchanged. Four formerly untyped matrices now contribute
  19 typed rows. The result remains `review_required`, `project_complete=false`.
  **Not installed demand:** controller integration qualifiers and applicability
  still need their source-bound workflow. Retained result:
  `evidence/fort-sam-point-header-compile.json`.
- A/B Python invocation at baseline `08dffc79` and current consumer preserves
  the entire EngineResult exactly for both earlier Fort Sam and Behavioral
  fixtures, not just totals. Command used the same `.venv-bas/bin/python` with
  each checkout as cwd, `python -m bas_engine`, and each fixture's tables as
  BlueprintInput. Existing 61 tests plus 12 new cases pass.
- Final previous web `npm run check` did complete: 2,570 pass / 13 existing
  skips / zero failures, typecheck/lint/bench/build pass. Current Python and
  diagnostic-only edits do not change that web build; no new UI work this turn.
- Completed real Fort Sam graph A/B: all 12 original full table objects and
  remaining graph relationships unchanged; eight new independently keyed
  regions. Candidate cold and both normal cache reads have identical table
  sequences. Cold baseline 19,760 ms / RSS 413,990,912 bytes; cold candidate
  22,567 ms / RSS 443,924,480 bytes; candidate warm 1,701 ms. One observation
  under concurrent evaluation load, not a statistical speedup or whole-process-
  tree peak measurement. Baseline warm timing still pending.
- Tightened the **new diagnostic comparator**, not any existing scorer: match
  table occurrences one-to-one and reject additions/reordering on replay.
  Three adversarial tests pass; rerunning it on saved Fort Sam graphs passes.
  `evidence/point-routing-comparator-fort-sam.log` retains the stronger check.
- Focused core graph scorer completed in 711.4 s: 78 correct / zero wrong /
  13 missing keyed cells (all Baker County CEILING); 66/66 expected row-symbol
  anchors. No positive room-tag key cases in this selected set. This is **not
  a clean graph baseline claim**: starting-revision Baker reproduction is live.
  Takeoff/reference stages still running. All three sets lack table-recall
  keys, so table recall was **not scored**.
- Broader A/B stopped with a terminal V8 heap-limit failure on **baseline**
  Behavioral Medicine (22), before running its candidate or document 21.
  Default 2 GiB JS heap exhausted; retained log shows 250.13 s and maximum RSS
  1,631,633,408 bytes. This is not a comparison pass. Original failed logs
  preserved. Retry both revisions under the same explicit heap cap after
  memory headroom is available; do not restart still-running core jobs.

Current live handles: core takeoff/reference `66455`; starting-revision Baker
graph reproduction `40164`. Terminal: A/B `38653` (failed as above), Python
`28931` (pass), MCP `31779` (pass), comparator/typecheck `30627` (pass), production
compile `17383` (pass). Graph/routing candidate remains frozen while core child
processes run. Python consumer is not used by those graph/scorer entry points.

Next: finish/classify pending baseline comparisons, retry remaining A/B cases
with sufficient equal memory caps, cover glued-caption admission separately,
then commit the verified routing/header batch. Continue source-bound controller
qualifiers and complete point/SOO interpretation into canonical persisted BAS
records. All five end-to-end workflows, full corpus gates, holdout and UI
persistence/review/export remain required. No completion or blocking claim.

Contracts: `POINT_HEADER_CONTRACT.md`, `POINT_ROUTING_CONTRACT.md`.

## Point-list routing recovery — active verification, 2026-09-09

User approved obtaining the missing information while preserving VectorGrid and
reiterated production-quality completion. Previous implementation turn was
progress; intervening clarification only explained the pending choice. Current
batch implements shared page admission and fixes a reproduced downstream
duplicate-removal error. No VectorGrid reader/adapter/parser changes.

- Regression tests reproduced both defects before their fixes.
- Real source audit: 12/12 BAS matrices, 193/193 listed rows and 1,603/1,603
  cell values match existing independently authored keys, including blank flags
  and nonempty-cell source-region checks. Baseline was four matrices/79 rows/610
  cell values. All twelve original complete table objects are exactly unchanged.
- First routing-only candidate recovered seven tables; trace proved the fallback
  reconciliation removed the gas-meter matrix after VectorGrid read it. Separate
  regions no longer collapse merely because their title/local row keys match.
- MCP typecheck, 29 Session/BAS tests and build pass. Web final check: 2,570 pass,
  13 existing skips, zero fail; benchmark/build completed successfully.
- Printed recovery is NOT physical I/O, installed count or semantic completeness.
  HARDWARE/SOFTWARE nested headings and integration qualifiers remain next-work
  items. No partial implementation is declared production complete.

Contract, evidence and limitations: `POINT_ROUTING_CONTRACT.md`.
Current verification handles: web check `63436`; focused core-corpus gate `66455`
(bessemer, itd-d1-lab, baker-county-eoc); real compile `23623`. Poll live handles
before doing anything with them. Terminal: MCP `57962`, Fort Sam graph `53244`.
Temporary detached baseline checkout, created for A/B checks only:
`/tmp/opentakeoff-routing-baseline.k9rAWG/checkout` at `08dffc79`; dependency
symlinks only, no source modifications. Preserve until comparisons finish.
Candidate code is frozen during the running corpus gate; do not mix revisions
between its child processes. Broad corpus/holdout gates remain incomplete.

## Narrative discovery and omission diagnosis — 2026-09-09

Previous brief goal/status turn was no progress. This continuation added shared
`basNarratives.ts` plus `Session.basNarrativesForPipeline()` and source-backed
tests. This remains an internal building block, not a completed persisted/UI
workflow. VectorGrid, graph routing, legacy compilers, Python math and UI code
are unchanged. No external push/merge/deploy.

- Ten new focused narrative tests pass. Nine exact source regions across Fort
  Sam and Behavioral Medicine are independently checked, including two embedded
  reset tables and all twelve Behavioral SOO sections. Source text/coordinates
  are preserved, and equal titles with different behavior remain distinct.
- Final real Session audit: all 24 development PDFs / 1,253 pages / 563,248 spans
  pass exhaustive disjoint accounting and deterministic replay. Nine authored
  region checks pass. Holdouts remain unopened. Observed 54 bodies / 62 heading
  candidates / one segmentation conflict are **not** corpus accuracy results.
- Discovery summed 637 ms; full load/validation/replay diagnostic 54,715 ms;
  cumulative peak RSS 1,062,305,792 bytes. No whole-takeoff performance claim.
- Final web check passed: 2,567 pass, 13 existing skips, zero failures, bench
  and build pass. MCP typecheck/build and nine BAS tests pass. Full legacy
  quantity/reference/graph gates have not been repeated for this source-only
  batch; remain pending, with existing baseline failures still disclosed.
- Final negative testing reproduced and fixed accepting a four-word scale
  caption as narrative. The final repeat retained all nine reviewed regions
  and changed one rank-25 candidate to heading-only. Exact logs and source
  results are in `evidence/narrative-discovery-release/` and the corresponding
  `narrative-release-*` logs. No source/table quantity was changed.
- Reproduced Fort Sam's missing 114 listed rows: three pages (detail/elevation
  roles) are excluded **before** the existing positive points-title check.
  The graph's twelve tables include only four BAS matrices, not twelve.
  This identifies an upstream shared routing defect, not yet a VectorGrid
  extraction defect. Exact diagnosis and preservation limits:
  `POINT_OMISSION_DIAGNOSIS.md`.
- Asked permission to fix that routing gate under regression tests; no reply
  at this checkpoint. No gate edit made. Other goal work can continue.

Contract, limitations and evidence: `NARRATIVE_CONTRACT.md`. Next: broaden
source-bound narrative interpretation and canonical equipment/template/decision
records with durable state; resolve the routing permission before touching that
gate. All five complete workflows and final corpus/UI/MCP gates remain required.

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
