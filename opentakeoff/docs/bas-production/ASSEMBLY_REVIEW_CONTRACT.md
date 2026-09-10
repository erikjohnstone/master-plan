# Source-backed assembly review — implementation contract

This is one required part of workflow C, not a replacement for the full five-
workflow goal. Research: `RESEARCH.md`, UFGS 23 09 00 packaged-control activities,
and independently reviewed M-511/M-512/M-601 source cases. No default assemblies,
manufacturer selection, cost, installation count, signal rating or conductor count.

## Shared path and input

YES shared: the record/schema, source/member ownership, component identity,
scope, evidence provenance, duplicate accounting, responsibility conflict and
resolution state. Quantity expansion and engineering math remain Python.
NO shared: forms, scroll, selection, readable table layout and source-click UX.

Use a strict `bas_assembly_register_v1` with stable UUID component identities.
Each component record includes:

- Explicit existing equipment scope, selected named equipment IDs and excluded
  member IDs. All selected members must belong to the same established scope.
  Per-equipment versus once-for-selected-group is an explicit reviewed choice.
- Component kind, functional label, original interpreted requirement IDs and
  retained drawing-text span IDs. Physical devices/accessories are distinct from
  points, channels and software variables. An I/O observation is not a device.
- Nullable nonnegative integer declared quantity with `source_declaration` or
  `explicit_decision` origin and reason. A source-derived quantity must exactly
  match its supported source declarations, including compatible component roles.
  User-defined/corrected quantities preserve all cited source claims and their
  different values; they are disclosed decisions, not extracted truth.
- New/existing/reuse/demolition/unknown lifecycle; included/excluded disposition
  with separate exclusion reason; member exceptions with reason. No default-new
  installed scope. Unsupported or unknown quantities stay unknown, not zero.
- An explicit condition state: unconditional, satisfied, not satisfied or
  unresolved, with predicate/decision evidence. Conditional inclusion is never
  assumed from a component name. Python later handles the resolved factor/zero.
- Independent furnish/install/wire/program/test claims. Each user claim has an
  ID, assignment basis, nullable named party, source span IDs and reason. A
  factory-furnished basis is only valid for furnish; field-installed only for
  install. Named-party, by-others and unknown are activity-specific.

Source-backed parser claims are reconstructed from the pinned source rule and
retained context, not accepted as caller-authored copied text. A factory-furnished
controller contributes a furnishing claim only. It does not assign programming
because the following sentence refers to a manufacturer's sequence. Immutable
source claims and explicit user claims are shown together.

## Validation and derived review view

Before validation, verify the source context and the equipment register against
its retained equipment/point evidence. Reject foreign member IDs, foreign spans,
unowned source requirements, duplicated identities, cross-scope selections,
exceptions outside selection, and claimed extracted quantities without evidence.

One source requirement cannot be consumed by two included assembly components
for the same included equipment member. Different members may share a reviewed
per-equipment requirement. Preserve excluded rows rather than deleting history.
Do not automatically merge different source occurrences with matching labels;
surface same-kind/role overlaps as possible duplicate review, not a second count
or a confirmed equivalence. A source-derived single component cannot merge the
separate supply and exhaust VFD roles. Explicit source-preserving corrections
remain labeled decisions and retain the conflict for review.

Responsibility claims that agree corroborate each other. Unknown is not a
contradictory named assignment. Different known assignments for one activity
produce a conflict until an explicit resolution selects a retained claim and
records a reason. Resolution never deletes losing evidence. A selected
factory/by-others basis still does not invent a named contractor. Unresolved
activities stay visible. Unknown conditions, scope and quantities remain issues.

The shared view retains original records, included member identities, full
source declaration/spans, responsibility claims and resolution rationale, and
structured issues. It does not calculate component totals or report installed
quantities. The Python adapter uses these exact validated records.

## Durable transaction and complete journey (still required)

Selected equipment → inspect source candidates → create/edit a component with
applicability and quantity basis → inspect independent responsibility claims →
resolve/exclude with reason → shared validated preview → persisted decision →
Python quantity result → source navigation → export/reload/import → edit and
stale-dependent-result disclosure. No new permanent toolbar or side rail.

Assembly events must pin capture, equipment decision head and component rule
version, use optimistic expected assembly heads and operation IDs, and preserve
every older event. Source/rule/equipment changes invalidate dependent results.
Historical imports validate against their original equipment event, not the
latest edited register. Freeze supported rule implementations before persisting
them; adding a parser rule must not silently reinterpret old accepted decisions.
Old workflow capture fingerprints and existing point/assignment results remain
unchanged. Define the additive persistence revision before integrating events.

### Additive persistence revision: `bas_assembly_5`

Keep `bas_workflow_v1`, original capture fingerprints and revisions 1–4 valid.
Only an accepted assembly event upgrades to revision 5. Every prior mutation
must preserve the highest revision and all assembly history. Optional
`assembly_events` are a per-capture, optimistic linked history of complete
register snapshots with unique operation/event IDs, reason, declared operator
or Agent-proposal origin and timestamp. The request pins the current equipment
decision; the event pins that historical equipment decision permanently, plus
the frozen component rule and a fingerprint of its source interpretation.

Old events validate against their own equipment decision, not a later register.
Withdrawing equipment leaves assemblies readable but stale. Rebase is a new
reasoned assembly event validated against the current equipment head; it does
not edit older records. Withdrawal of a component uses an excluded record or a
new snapshot; previous source evidence and decisions survive either operation.
Exact request retries do not add another event, including after later changes;
reusing an operation ID with different meaning/origin fails. Divergent imported
histories fail rather than selecting a winner. Ordinary persistence and export
carry this same optional extension. Hashes detect accidental corruption and
lineage changes; they are not authenticated signatures or server immutability.

The v1 interpreter is explicitly dispatched by its pinned version and rejects
unknown versions or changed narrative dependencies. Later interpretation rules
must add a new implementation/dispatch, not alter the persisted v1 meaning.
The retained interpretation fingerprint also detects changes within a version.
Acceptance of the register alone does not prove Python-derived assembly
quantities or surface integration. Each has separate required verification.

The surface editor can stage several component repairs or withdrawals before
validating the complete register. Staged data is a local draft, not a partial
accepted domain record. A final event preserves all changed component reasons
and withdrawal reasons, with the overall review reason. Source/equipment/head
changes invalidate the pending batch. Saved assemblies remain reachable from
the equipment table even if the current equipment identity was removed; a
retained stale record cannot be silently relabeled as current applicability.

### Shared Python quantity contract: `declared_assembly_quantities_1`

Input pins capture, equipment head and assembly head and carries the entire
validated register plus the source-backed equipment-ID/scope projection. The
shared service validates source claims and historical ownership first; Python
defensively validates record shape, selected/excluded members, scope and duplicate
source consumption. It does not parse PDFs or invent source claims.

Each output retains the entire original record and included member IDs.
Replication is number of selected non-excluded members for `per_equipment`, or
one for a nonempty selected group for `selected_group_once`. Python alone
calculates that factor and declared quantity × factor. Explicitly excluded
records, empty included membership or a false condition produce zero included
contribution only when the original quantity is known. An unknown quantity
stays null even when excluded. An unresolved condition produces null included
quantity unless an independent explicit exclusion already makes it inapplicable.
Unknown original predicates/quantities remain disclosed issues even when an
exclusion resolves contribution. A known zero is not an unknown value.

Keep original new/existing/reuse/demolition/unknown lifecycle and all
responsibility claims/resolutions. Do not combine these records into installed,
project, unique-device, channel or field-wiring totals. A calculated declared
assembly contribution is not installed verification, completeness, contractor
acceptance or engineering approval. Exact Python integers beyond the JS-safe
transport range are rejected at the existing process boundary, never rounded.

## Falsifiable acceptance

1. The actual two VFD roles stay distinct; their AO point rows add no devices.
   A source-defined controller retains factory furnishing and unknown other
   activities. Future VAV support treats dual-technology sensing as one device.
2. Source/member/role/quantity spoofing rejects; same labels in different source
   scopes are not merged. Duplicate source consumption rejects for overlapping
   members, with disjoint scopes and explicit exclusions as negative controls.
3. Contradictory user/source activity claims remain visible; selected resolution
   has a reason and retains every claim. Foreign/stale claim IDs reject. Unknown
   does not become a named contractor or a pass.
4. Zero, unknown, conditional inclusion, exclusions, existing/demolition and
   explicit correction origins remain distinct. No interpreted I/O/software
   observation becomes an assembly component without an explicit decision.
5. The complete actual UI/MCP/Python/replay/persistence/export journey above is
   verified on real source inputs, both themes and dense results. Shared schema
   and unit tests alone do not complete workflow C. Full goal gates remain.
