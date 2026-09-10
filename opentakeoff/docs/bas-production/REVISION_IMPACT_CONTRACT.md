# BAS revision impact — implementation contract

2026-09-10, after `c2685089`. This implements the remaining change-analysis part
of workflow E; it does not replace issue resolution, selective approvals,
snapshots, A–D acceptance gates or the final symbol phase.

## Research and shared-path decision

Autodesk's official [comparison workflow](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Compare_Sheets.html)
selects explicit sheet/version/snapshot sides and separately displays inventory
quantity differences. Its [version indicators](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Version_in_Sheets_Models.html)
warn about takeoff remaining on previous versions. Rechecked 2026-09-10;
documentation only, not hands-on competitor testing. Our design inference:
pin both source and decision versions before comparing, and keep evidence,
interpreted meaning, quantity basis and review status distinct.

**SHOULD THIS BE ON THE SHARED PATH? Yes.** Version selection, item ownership,
correspondence, semantic differences, quantity comparability and dependency
impact live in shared modules. Python remains the only arithmetic engine.
Forms, source-view navigation, file delivery and persistence adapters remain
surface-specific. No VectorGrid/symbol/extraction or old math changes.

## Pinned comparison basis

Each side names a complete retained drawing source set and an explicit selection
of SOO, equipment, assembly and engineering event heads and assignment/assembly
calculation IDs for each capture used by that set. Defaults may suggest current
heads, but the saved basis contains the resolved IDs, not a floating "latest".
Null means no selected record, not no requirements or a completed review.
Foreign or duplicate selectors fail. Older selections remain inspectable and
are labeled historical; mixed dependency heads remain stale, never silently
rebased. A selected source set may combine original and incoming captures.

Inventory includes the retained drawing text/page frame, point matrices and
rows, narrative clauses and supported requirements, raw equipment rows,
scopes/equipment/template assignments, declared component requirements,
assembly components and responsibility claims, engineering resources/checks,
and saved assigned-point/assembly results. Unknown/uninterpreted text remains
available through original pages and explicit discovery limitations.

Every item carries a capture-bound typed identity, selected source/decision
version, original data, source references and typed links to related items.
Source-set coverage is inside, crosses the selected boundary, outside, or
unlocated. Missing locations do not become all-pages or zero scope; outside and
partially selected dependencies remain visible for review. Source references
retain original page IDs, span IDs, text and bboxes. Full raw records are retained
even when only a subset has supported semantic interpretation.

Original-content identity is independent from UI order and navigation aliases.
Document/page/frame and source/rule identities remain separately inspectable.
Decisions carry their recorded origin; explicit input is never relabeled as
extracted fact. Source bytes and actual Python replay are independent checks.

Implemented inventory references also pin their actual dependency event, not
just the UUID of equipment/component/resource. A mismatched selected event is
an explicit unresolved reference; its original evidence still comes from the
old dependency. Component-local claim identities distinguish one declaration
applied to disjoint equipment groups. The inventory content fingerprint excludes
whole-register event heads, so an unrelated edit need not alter unaffected
content; **it is not an approval fingerprint**. Approval still requires the
forthcoming relevant dependency closure and matching decision provenance.

## Correspondence and differences

Exact same bound item identity can pair itself. Cross-version matching requires
an explicit reviewed one-to-one link or separately proven unique scoped identity;
bare tags, row indices, filenames and similar labels are only suggestions.
All baseline/incoming items need retained, replaced, added, removed or unresolved
accounting. Splits/joins remain explicit unresolved identity work unless their
individual correspondence and basis are established. Page accounting does not
provide item identity automatically. Duplicate incoming views are not extra units.

Report original evidence changes separately from supported semantic field changes
and dependency changes. Preserve structured before/after values and source links;
do not concatenate arbitrary JSON into a claimed BAS interpretation. An unmatched
item is not a verified addition/removal until explicitly accounted for. A missing
or unavailable domain is not an empty side. Arbitrary SOO remains uninterpreted.

Quantity entries preserve their exact dimension and basis: listed I/O observation,
listed software value, printed schedule count, named scheduled members, assigned
listed value or reviewed declared assembly contribution. Attributes/alarm flags
are not quantities. Named members, printed count and installed count are distinct.
No new installed count is created. Unknown, sparse or ambiguous values remain
null; absence of an item is not numeric zero. Changed units, lifecycle, replication
or applicability is a basis change requiring explicit review. Only comparable
same-basis values receive a Python-computed delta, with before/after evidence and
required replay of saved derived values. Cross-kind or unresolved matches have
no numeric delta. No new signal, physical device or accessory is inferred.

The correspondence/impact review is append-only, dependency-bound and exported.
Changing relevant source/selection/mapping invalidates the impact review without
altering old evidence. Scoped approval consumes its exact dependency closure,
not a blanket whole-workflow digest. No impact preview approves anything.

## Acceptance and performance gates

### Comparison implementation boundary (before implementation)

An explicit comparison request pins both bases and contains one-to-one item
matches, reasoned added/removed item decisions and optional reasoned membership
comparison confirmations. Remaining identical capture-bound identities pair
automatically; all other unpaired in-scope records stay unresolved. Outside-set
records remain accounted for separately. Matching never derives identity from
row position, bare tags, filenames or label similarity. A manual correspondence
is an auditable decision, not an automatically proven physical identity.

Each pair reports original-version identity, retained evidence/text/geometry,
supported declared fields, rule changes, dependency/source-boundary issues and
quantities independently. Original records remain retrievable from each pinned
inventory. No source-text diff implies arbitrary SOO comprehension or complete
PDF ink equality. Typed relation identities are normalized through the reviewed
correspondence map, never by deleting all fields called `id`.
Engineering inputs and constraint statuses are compared separately from exact
saved-output representation. Output rule labels can embed resource IDs, and
network output carries original closet/port IDs. Those bytes stay intact and a
separate `saved_output_equal` flag discloses any difference; they are not used as
proof that the engineering requirement changed. No arbitrary result-text ID
replacement or network-layout equivalence is claimed.

Known same-dimension, same-denominator quantities may receive a delta. Changed
variable, units/dimension, applicability (`per_equipment` versus `system_once`),
lifecycle, condition, disposition or rule is incompatible without a new suitable
basis; no override can force a delta across these conditions. For derived group
quantities whose measure is otherwise identical, changed included membership or
replication factor requires a separate explicit confirmation and reason before
comparison. Membership includes the actual pinned equipment tag, scope and
source-occurrence bindings, not only its reusable UUID. Missing sides/values,
attributes, stale dependencies, unavailable
source coverage and unlocated/cross-boundary quantity scope have no numeric delta.
Add/remove decisions still display their original quantities; absence is not zero.

Python subtracts only validated comparable count pairs. The service replays the
exact selected saved assignment, assembly and engineering records in Python;
persisted hashes/status labels cannot replace replay. It binds returned pair IDs,
metrics, inputs and rules before accepting any output. Cancellation, ownership or
response failure returns no successful partial report and never changes history.
Retained point observations also run through the existing Python original-cell,
header/channel and missing-column validator. Derived comparisons resolve the
actual source row's point variable; explicit pairing cannot equate supply-air and
return-air variables merely because both use AI channels.

Hard comparison bounds: 200,000 accounted rows, 64 MiB encoded report; numeric
transport batches reuse the 1,000-record / 30 MiB limits. Establish the first
complete serial real-retained-input comparison timing/memory baseline before
optimization. The inventory gate remains unchanged; do not falsely apply its
five-second budget to the newly added math/replay and two-sided comparison.

Initial complete comparison baseline (before optimization): retained Fort Sam /
controlled hardware, 496 rows, 175 comparable values, 12 point matrices validated
and two selected saved records replayed; 4.136 / 3.996 / 3.947 s, incremental peak
RSS 186,449,920 bytes, 6,450,016-byte report. Node 24.13.1 / Apple M2 / darwin-arm64;
fixture SHA-256 `afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`.
Before further candidate evaluation, set a serial regression budget of 6 seconds
per full comparison and 512 MiB incremental peak RSS on this fixture: roughly
45% latency margin over the first measured run, not an improvement claim or an
interactive keystroke budget. It includes existing history validation and Python
startup/replay, not PDF extraction or original-byte verification. Public operations
must show progress/cancellation; large schema limits are not performance promises.

Before public completion: positive changed-requirement, unchanged re-export,
renumbered/reordered pages, same-tag/different-building, quantity/basis change,
partial addendum, removed/added/ambiguous/split item, stale and unrelated decision
edits; old record selection; sparse/unknown values; extra graph metadata; corrupt
ownership/head/IDs; mixed source-set boundaries; duplicate inputs; deterministic
replay, persistence and export in actual UI and packaged MCP. Each requested
domain must be represented, not replaced with an all-unresolved placeholder.

For inventory development, reuse the retained real Fort Sam/controlled-hardware
fixture and the existing five-second serial history budget for the complete
verify-and-inventory operation (three runs), with incremental peak process RSS
under 512 MiB. This is an inventory gate, not PDF extraction or full revision
analysis. The starting history-only baseline is 3.069 / 2.987 / 2.996 seconds.
Hard limits: 100,000 inventory items and 64 MiB encoded inventory, explicit errors
instead of silent truncation. Public listing renders/returns bounded pages while
exports retain the complete valid report. Establish separate before-optimization
end-to-end comparison budgets from its first measured baseline.

Controlled fixtures supplement real drawings and are labeled. Do not touch the
blind holdout or relax any key, scorer, threshold or preservation gate. Finishing
an internal inventory is not completion of this contract or the main BAS goal.

## Inventory checkpoint — 2026-09-10

Implemented shared `basRevisionBasis.ts` and `basRevisionInventory.ts`. The only
existing workflow implementation change exports/renames its unchanged alias
normalizer; capture hashes and merge equality are unchanged. No schema revision,
public tool/UI behavior, extraction, Python arithmetic or installed quantity
changes. Basis/inventory are derived read-only from a verified retained workflow.
No client-provided inventory is accepted as source truth.

Final web check **58915 exit 0: 2,783 pass / 13 existing skips**, 29.769 s tests,
5.58 s build. Twelve added shared tests cover source-owned domain inventory,
raw metadata, unknown/attribute values, alias stability, old selections, reused
UUIDs, disjoint source claims, scope boundaries, cancellation/input ownership and
the real retained Fort Sam/hardware fixture. Size boundaries are exact helper
unit tests, not a 100,000-item performance claim. Three existing lint warnings,
known One-Click failures and bundle/unconfigured-Agent warnings remain.

Final MCP **95875 exit 0**: types, **127 BAS tests** (50.846 s), build and **four
packaging/proof tests** (87.753 ms). Added actual Python assignment/assembly/
engineering integration proves old results keep their original evidence after
equipment and assembly rebinding, changed replication basis is retained, and
saved values never acquire a replay/approval claim merely through inventory.
The initial controlled fixture lacked required association references and used
incorrect attribute/software channel labels; validators rejected it. Corrected
the fixture, not production math, validators, existing assertions or scorers.

Predeclared serial inventory gate passes with **496 items / 3,044,819 encoded
bytes** from the 3,511,836-byte retained Fort Sam/explicit-hardware review file.
Initial **3.113 / 3.110 / 3.064 s**, incremental peak RSS **126,484,480 bytes**;
final full-check **2.997 / 3.030 / 2.961 s**, **77,725,696 bytes**. Gates remain
5 s / 512 MiB, Node 24.13.1, Apple M2/darwin-arm64. These are verify+inventory
measurements, not PDF extraction, complete comparison, source-byte verification
or fresh Python replay. Existing history and drawing benchmarks also pass.

Evidence: `evidence/revision-inventory-1/proof.json`. No fresh full-corpus/holdout,
standalone Python-suite or public UI/MCP comparison walkthrough in this slice.
The main goal remains active: implement item correspondence and semantic/
comparable-quantity impact, issue decisions, selective approvals and approved
snapshots; complete remaining A–D corpus/holdout gates; then execute the appended
researched symbol/installed-plan phase. No push, merge, publication or deployment.

## Comparison checkpoint — 2026-09-10

The shared read-only service now implements the above correspondence, declared-
field and comparable-count boundary. Existing Python validators/calculators are
reused; the only new arithmetic is exact count subtraction. Neither extracted
source values nor previous math algorithms are changed. Schema/correspondence
preparation is not a Python replay receipt, and replay is not source-byte proof.

Final web check: **2,793 pass / 13 existing skips**; standalone Python **452 pass /
one explicit packaging skip**, configured mypy **20 files pass**. MCP types,
**127 prior BAS + 19 new comparison tests**, **four packaging tests**, and the
separately enabled original/bundled Python parity test pass. New tests include
real Python evaluation/replay of all 11 controlled engineering families, positive
changed counts/SOO, unlike-variable and membership/basis refusal, strict output
binding, exact UTF-8/count batching and invalid/runtime/cancellation cases.
No generated-response fixture is passed off as actual runtime evidence.

Final serial complete comparison **4.217 / 4.171 / 4.149 s**, incremental peak
RSS **172,523,520 bytes**, report **6,462,912 bytes**, with 496 rows / 175 comparable
values, two selected saved records replayed and 12 point matrices validated.
The predeclared 6 s / 512 MiB gate and all unchanged history/inventory gates pass.
Baseline and exact evidence: `evidence/revision-comparison-1/proof.json`.

Public item correspondence, its append-only journal, actual UI/MCP comparison
walkthroughs and export, issue decisions, dependency-bound approvals and snapshots
remain unfinished. No full-corpus/holdout gate or real issued-addendum validation
is claimed here. The main BAS goal remains active and the appended symbol phase
remains after it. This checkpoint is progress, not production completion.
