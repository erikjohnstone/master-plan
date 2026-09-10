# BAS workflow contracts and acceptance plan

This is the pre-implementation acceptance plan for `../BAS_PRODUCTION_GOAL.md`, not a completion report. Baseline production commit: `161583a4aeabd5de08b092d0c154aa880bd02b24`. Research: `RESEARCH.md`. No new production behavior has been implemented at this checkpoint.

## Shared-path decisions

### Integration audit, 2026-09-10 (after `6192c488`)

The browser Agent's `agentTools.js` exposes `compile_corpus_takeoff` with kind,
download, service and optional `bas_math`. Its dispatcher does not expose the new
equipment, assignment, assembly, engineering or scope-review operations offered
by MCP/the Takeoff workspace. Therefore merging the current branch alone does
**not** provide a complete conversational five-workflow takeoff. Before final
acceptance, connect the existing Agent conversation to shared deterministic
draft preparation and validated operations, preserving human-only approval.
Verify an actual browser prompt → supported cited draft → review/correction →
durable results/export journey, not just a mocked tool definition. Report useful
automatic/accepted/corrected/rejected work and remaining user decisions. No model
interpretation of new requirements/ratings or guessed quantities is authorized.

Readiness research also confirms `assignment_demand.py` always reports
`UNIQUE_POINT_IDENTITIES_NOT_ESTABLISHED` and
`PROJECT_TOTAL_WITHHELD_UNRESOLVED_POINT_IDENTITIES`. These are retained limitations,
not errors to hide for a green approval. The final A/B reconciliation acceptance
must address supported unique requirement identities and remaining conflicts
before a complete assigned-point deliverable is claimed. Current scoped-readiness
positives for equipment/components/responsibilities/declared compatibility are
not a substitute for the assigned-point or Agent-driven acceptance gates.

- YES shared: PDF text exposure, source identities, narrative region discovery, table interpretation, equipment/template joins, component derivation, responsibility scope, engineering rules, revision correspondence, approval invalidation, readiness, deterministic exports.
- NO shared: workspace layout, selection, filters, scroll, theme, keyboard focus, downloads and browser storage transport. These consume validated shared records and do not compute separate quantities or approval truth.
- Keep current `compileTakeoff`, graph construction, VectorGrid, symbols, legends, and existing exports intact. Add a separate versioned BAS workflow result; do not repurpose `bas_math.project_complete=false` into a project certification.
- Reuse Python for engineering math. A persistence or UI adapter must not duplicate these calculations.

## Canonical record

Implement a validated `bas_workflow_v1` record, independent from legacy annotation shapes and legacy BAS printed totals. Optional extensions must omit or round-trip safely in old projects. All records need strict finite values, bounded strings/collections, referential integrity, and explicit schema versions.

| Entity | Required identity / provenance | Semantics |
| --- | --- | --- |
| Source document version | Content SHA-256; display filename separate; byte size; page count | Byte identity survives rename; changed bytes produce a distinct immutable version. |
| Source page / evidence | Document version, one-based PDF page, original coordinate frame and bbox, raw text/span references | Source coordinates never become screen coordinates. No origin bbox substituted for missing evidence. |
| Narrative/table region | Version-scoped stable ID, all contributing evidence, discovery status, segmentation/continuation links | Raw evidence remains immutable; interpretation is separate. Explicit omissions and unreadable text are accounted for. |
| Equipment | Project/building/system/level/phase scope, tag/explicit discriminator, source links | Business identity is distinct from each version's occurrences. Do not merge solely on tag text. |
| Control template | Source/version identity, local requirements, applicability evidence, per-unit/project/unknown basis | A source matrix does not become a unit template by default. |
| Assignment | Template, equipment/group, explicit quantity basis, applicability/exceptions, decision source | Preview derivation before apply. Do not multiply two independent quantity bases. |
| Requirement | Equipment/template scope, function, physical/soft/component distinction, source interpretation/rule | Conflicting sources retained; typed I/O is not a physical device inventory. |
| Assembly component | Stable scoped requirement identity, physical kind, explicit count derivation, existing/factory/new status | Merge only established same-device requirements; no one-component-per-point shortcut. |
| Responsibility | Component/scope, activity, party, source or user decision, reason | Furnish/install/wire/program/test independent. “Factory furnished” sets only the supported activity. |
| Engineering check | Rule ID/version, demanded/provided inputs, source/decision dependencies, outcome | Pass, fail, or not evaluable. Unknown is never pass. |
| Decision event | ID, previous state/dependency fingerprint, action, subject, reason, time, actor origin | Inputs are explicit events. Replays are deterministic and stale actions rejected. Self-declared identity is labeled. |
| Review issue | Stable rule/subject/dependency identity, severity, evidence, resolution history | Repeated compile is idempotent. A changed input can reopen an issue. |
| Snapshot | Full record/source/rule/dependency digests, reviewed scope, exclusions, event history, exported result | Append-only through app APIs; local tamper detection is not authenticated/server-enforced immutability. |

Use one specified canonical serialization for fingerprints. Test Unicode, ordering, integer/decimal edge cases, equivalent input order, and changed evidence. Do not hash incidental UI filter/order/time into semantic quantity identity. Preserve authored/source strings separately from any normalization.

## Complete journeys and supported input patterns

### A — source coverage and point/SOO requirements

PDF upload → source/page inventory → text/table region discovery → explicit requirements with citations → coverage review → corrections/links → durable result → export.

Initial supported deterministic patterns must cover the real development sources and include:

- Existing typed point-list columns, explicit nested headings, physical versus network/configuration columns, and literal flag/count semantics.
- Positioned horizontal narrative blocks with explicit SOO/control-sequence headings; multiple independent columns on one page; neighboring tables/diagrams; separately scoped headings; explicit continuation references.
- Explicit device/component and typed-signal requirements, with subject and applicability established. Preserve conditions/negation. Keep behavioral clauses as behavioral requirements when signal type or physical quantity is not stated.
- Explicit references to schedules, diagrams, and another sequence become links or unresolved references, not invented content.

Do not silently accept rotated, interleaved, fragmented, exploded, or raster prose as successfully interpreted. Account for it and offer source-bound review. Do not use an entire page's concatenated text as one sequence or count a caption and body as separate equipment.

Acceptance: all authored positive cases for each declared supported pattern exact; zero false physical/soft additions in negative controls; every interpreted value source-grounded; ambiguous/unsupported cases visible and editable without changing raw source. Compare discovered region coverage, interpreted clause coverage, recovered table cells, and false additions independently. Explicit empty evidence and unavailable source are different states.

### B — templates to actual equipment

Equipment schedule/plan evidence → scoped identities → template candidates with applicability → explicit assignment/exception review → exact derivation → persisted equipment rows and exported mappings.

Support explicit tag lists/ranges, “each” statements with a proven equipment set, explicit quantities, split building/phase scopes, whole-system matrices, named template exceptions, factory-integral equipment, and existing/demo/new scope. Ambiguous joins remain candidates, never automatic installations. User-confirmed quantities require source/reason and remain labeled user-confirmed.

Acceptance cases: same tag in two buildings remains two; schedule+plan+detail views do not create three devices; a global matrix is not replicated per unit; a per-unit list maps to the exact selected equipment set once; tag-range holes and exceptions are honored; existing/demo records do not enter new scope by default; zero quantity stays zero; repeated compile/apply is idempotent. Plan evidence requires applicable existing verifiers, not proximity alone.

### C — assemblies and responsibilities

Assigned equipment → explicit component requirements → assembly table with source/derivation → independent responsibility matrix → edit/exclude with reason → source-preserving export.

Support explicit device/accessory requirements and user-authored versioned templates; conditional components only after a predicate is established. Do not infer a relay, transformer, enclosure, or cable length merely because one would commonly be used. Expand physical components separately from I/O channels and software variables. Preserve duplicates as review candidates unless same-device identity is established.

Acceptance cases: one multi-signal sensor remains one device; independent sensors remain distinct; one network device with many values does not become many devices; factory-furnish does not imply field-install/program/test; “by others” applies only to its established subject/activity; conflicting parties create an issue; unknown party stays unknown; overrides preserve the original requirement and source. Audit history, exported responsibilities and displayed values agree after reload.

### D — engineering compatibility

Equipment/component → explicit demand/capability inputs → controller/panel allocation → shared Python checks → fix failing inputs/assignments → replay → persisted check results and exports.

Implement the rule catalog in `RESEARCH.md`: channel mode and range/direction, power/load, declared mechanical/fail/environment constraints, allocation/expansion, network/device/location constraints. Each rule needs positive, negative, missing-input and boundary tests; no inferred hardware ratings.

Acceptance cases: voltage versus current mismatch; contact versus energized output mismatch; incompatible range; AC/DC mismatch; pulse-rate capacity; insufficient continuous/startup supply; VA versus W requires appropriate units; double-allocated endpoint; incompatible expansion; count-sufficient but signal-incompatible controller; integral device not duplicated as a new standalone controller; missing/partial network route stays not evaluable. Exact rational/integer math, no rounded-to-pass boundaries. Previously passing Python BAS math remains unchanged.

### E — review, revisions and approved snapshots

Issue queue → source inspection → explicit source-preserving decision → shared recomputation → source version import/pairing → semantic diff → affected approvals stale → re-review → approved scoped snapshot/export → reload/reimport.

Version pairing order: exact content match; explicit existing correspondence; only then supported unique sheet identity/content evidence. Ambiguous pairing requires operator action. Reordered pages/renumbered sheets need established correspondence. A partial addendum does not delete omitted sheets. Separate byte changes, evidence changes, interpreted value changes and quantity changes.

Acceptance cases: byte-identical duplicate upload; renamed file; unchanged semantic re-export; changed quantity with same tag; removed/replaced page; partial addendum; duplicate sheet numbers; ambiguous correspondence; changed rule version; changed relevant user input; changed unrelated item; stale resolution action; snapshot restoration; missing referenced source; storage quota/error; competing save/revision number. Invalidate only approvals with affected dependencies, without silently inheriting any approval for a new dependency set.

Release requires explicit reviewed scope and no unresolved blocking conditions inside it. The snapshot includes exclusions and all outstanding issues outside that scope. Never label a partial-scope approval “project complete.” A failed engineering constraint cannot be suppressed into a pass with a dismissal note. Unauthenticated local names are not verified identities. No new auth/cloud infrastructure without approval.

## UI acceptance

Keep the present canvas navigation and theme. Takeoff is the default table, not a stack of summary panels. Equipment detail and Review & changes are internal workspace routes; do not nest modals. One project review entry, compact per-row state.

- At 1280×800, 1440×900 and 1920×1080, primary table rows and actions are visible without excessive instructional chrome. No page-level horizontal overflow; wide tables scroll internally. Do not hide columns from exports when simplifying the screen.
- Keyboard focus/activation, semantic tables, accessible status labels and focus return work in both themes. Status is not color-only. Buttons never cover source or table content.
- Dense real results, search/filter, row selection, internal navigation, citation return, drafts and scroll restoration work. Reload/reopen restores durable BAS results and decisions.
- Deep engineering fields do not crowd ordinary equipment review. No new permanent pricing, labor, product-catalog, or revision rail.

## Baseline and evaluation discipline

`corpus-inventory.json` verifies 30 focus PDFs / 1,489 pages and 190 physical source PDFs / 4,799 pages across 113 logical sets. All source hashes match. Its `bas_screened_sets=82` is metadata coverage, not a new BAS applicability measurement; all 113 sets remain in inspection scope.

Reserve focus ranks 5, 8, 15, 19, 24, 27 and their source sets/duplicate part hashes from new workflow development. No bodies or keys inspected for this goal before the frozen new-workflow evaluation. Historical engine exposure is known: this is not a claim of never-seen generalization. If debugged, retire holdout status and disclose the affected scope.

The 24 development records pass their existing schema-appropriate validators with writes disabled. This checks retained assertions and integrity, not a complete independent interpretation of every new feature. Extend evaluation with separately authored source-backed expectations for requirements, assignments, responsibilities, compatibility inputs and revisions. Do not make expectations by serializing production output.

Required gates:

1. Before behavior changes: save exact baseline commit, inputs, graph/output fingerprints, test commands/outcomes and source screenshots. Reproduce known failures rather than silently adopting old “100%” notes.
2. Each change: focused tests and per-document comparisons plus negative controls. New rules need positive coverage, not only refusal tests.
3. Each batch: relevant Python/web/MCP gates and cached full-corpus regression. Report takeoff, reference/table and graph/grounding metrics separately. Full cold run at milestones/final handoff.
4. Final: all 30 focus documents plus applicable available BAS sets, frozen holdout, cross-trade controls, real UI and MCP workflows, replay/persistence/export/source equivalence, cold/warm duration and peak memory.
5. No measured regression on unaffected tables/cells/header hierarchy/citations/bboxes/counts/symbol outputs. Any intentional corrected interpretation must match independent source truth and be separately reported. Never weaken keys, thresholds, scoring, or existing negative controls.
6. Record refusals, not-evaluable results, discovered/interpreted coverage, source conflicts, false additions and per-document deltas separately. No blended “production score.” The corpus cannot prove universal future accuracy.

Known baseline: Python 61 pass; configured mypy nine source files pass; Node BAS transport seven pass; full web check passes (2,553 pass, 13 skips, benchmarks/build). Full MCP suite is not claimed green: prior same-commit evidence records WP1 baseline failures. Re-run applicable MCP gates and classify existing failures before integration. Current real SOO compile is zero on Fort Sam and Behavioral saved production graphs. Fort Sam typed matrices cover 79 of 193 reviewed source rows; the missing rows remain required investigation, not excluded scope.

## Implementation order

1. Add shared source-version/text-only exposure and tested evidence contracts. Freeze baseline copies; no VectorGrid change.
2. Build source-region accounting and narrative/point-list interpretation with real development cases and negative controls. Investigate missing matrices at their actual failing layer.
3. Add canonical equipment/template/requirement model, scoped assignments, and deterministic replay. Connect durable browser/MCP state early, so subsequent feature work is end-to-end rather than transient demos.
4. Implement equipment-centered UI with real compiled data; verify density/navigation before adding deeper views.
5. Implement assemblies, activity responsibility matrix and complete reviewed edit/export path.
6. Implement engineering rules and allocation through shared Python; preserve prior math and outputs.
7. Integrate issue review, source-version retention, correspondence/diff, stale approval logic and approved snapshot exports using existing storage conventions.
8. Whole-workflow real corpus/UI/MCP regression, holdout, performance and documentation. Commit coherent verified batches locally; no push, merge, deploy or external publication.

Each step is part of the full goal, not a replacement completion target. If an essential capability requires prohibited technology or new infrastructure, surface the exact decision before changing scope.
