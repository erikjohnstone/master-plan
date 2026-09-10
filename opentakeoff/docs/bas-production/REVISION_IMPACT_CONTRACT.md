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
