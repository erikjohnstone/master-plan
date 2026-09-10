# Equipment/template assignment — pre-implementation contract

This is the next workflow after retained SOO/point comparison, not a completion
report. The five-workflow goal and original acceptance plan remain unchanged.
No extraction modification or installed-quantity relaxation is authorized here.

## Shared-path decision and existing code findings

YES shared: source-bound equipment occurrences, explicit identity resolution,
template applicability, quantity basis, deduplication, assignment events and
Python demand inputs. NO shared: equipment selection, table layout, form state,
source navigation and download controls.

- `schedulePlanReconcile.mjs` already exposes schedule and sweep evidence. Reuse
  the shared Session sweep entry points; never run a second browser detector.
- Its legacy summary is insufficient as the new BAS authority: the family
  reader's `seen` set is tag-only; `scheduledQtyStatusFromRow` defaults absent
  quantities to one and uses `parseInt`; `MATCH` can mean installed quantity is
  greater than scheduled. Preserve those existing contracts, but do not treat
  their summary labels/defaults as scoped source proof for BAS replication.
- Retain the original graph table/row/cell evidence and actual sweep result
  behind a new validated additive record. Distinguish printed quantity, named
  equipment membership, verified plan occurrences and user-confirmed scope.
- `bas_engine.models.EquipmentGroup` accepts strict nonnegative quantities and
  explicit independent/shared allocation. It can calculate an established
  assignment; it cannot establish template applicability or installed quantity.
- Current SOO associations identify source references, not canonical equipment.
  In particular, a literal reference containing `OR` must not become a count of
  all alternatives. Existing association events remain readable and unchanged.

## Evidence, identities and quantity bases

1. Capture every admitted equipment schedule occurrence with original source
   hash/page/table/row identity, mark text and boxes. Retain repeated candidates;
   discovery is not permission to deduplicate across buildings, systems or phases.
2. Separate a version-bound occurrence ID from a durable equipment identity.
   Identity resolution records scope and its provenance. Unknown scope is not a
   wildcard joining every equal tag. Cross-version correspondence must be an
   explicit record; a renamed/renumbered source cannot silently erase history.
3. Admitted identities include explicit single tags and complete lists/ranges
   whose grammar and applicability are established. Preserve original strings,
   zero padding and suffixes. Report duplicate members, unsupported mixed
   prefixes, descending/oversized ranges, exclusions and alternatives; do not
   expand partial matches while dropping the rest of a source expression.
4. Quantity bases are distinct: explicit scheduled count; resolved named-member
   set; corroborated installed instances; explicit typical multiplier;
   user-confirmed quantity with source/reason; and unresolved. Empty evidence is
   not zero. An explicitly supported zero stays zero. A decimal, range, footnote
   or malformed count must not pass through integer-prefix parsing.
5. Existing/reused, demolition, new and unknown phase/scope remain separate.
   Repeated sheets, legends, details, alternative schemes and reference mentions
   are never additional installations. Conflicting views produce a review issue.

## Template assignment and deterministic derivation

### Source capture and candidate identity

Retain all `equipment`-classified graph tables, including their original rows,
cells, continuation sheets and opaque graph metadata. This is accounting of
discovered equipment schedules, not a claim that all BAS equipment was found.
Other table kinds are not promoted by this adapter. Recognize only complete
MARK/TAG/TAG NO/ID/EQUIPMENT ID designation headers and QTY/QUANTITY/COUNT
quantity headers; a component's fan quantity or a model number is not a unit
count/tag. Multiple designation/count columns remain ambiguous. Missing cells
and unsupported membership remain visible. Never substitute the graph row key
for the printed designation cell.

Version-bound row occurrence identities use the source-owned table content and
row index, not an array-wide table position. Duplicate source tables and repeated
tags are retained as separate candidates needing review. Continuation rows cite
their own page, never the base sheet. Unknown sheet ownership cannot be used for
an assignment. Renaming a loaded file changes navigation aliases only; IDs and
original cells stay the same. Capture verification checks both the immutable raw
payload and source ownership. Graph-provided building qualifiers are retained as
hints with their original row/table; no unlabeled scope or phase is guessed.

The candidate's named-member count, printed count, and installed count are
separate. A mismatch is a review issue, not an instruction to multiply the first
two. Installed count remains unknown until the subsequent corroboration workflow.
Test exact original graph retention, continuation ownership, duplicate tables,
same tag/two buildings, missing/ambiguous headers, malformed quantities, nested
component quantity columns, file aliases, foreign sheets and source corruption.

### First shared expression grammar

Before implementation, bound literal membership parsing to letter-led equipment
tags with numeric indices (hyphenated or unhyphenated), optional letter suffixes,
comma/semicolon/AND/ampersand lists and explicit THRU/THROUGH/TO numeric ranges.
Ranges require matching prefixes, separator style and suffix; preserve explicit
zero padding. A single EXCEPT clause may subtract an equally explicit member
list. Reject duplicates, absent exclusions, incompatible/descending ranges,
alternative OR/slash expressions, partial syntax and expansions over 10,000
members. Do not reinterpret a bare operating count as a tag. Failure has null
membership, not zero. Printed-count parsing accepts only a whole nonnegative
safe integer (optionally correctly comma-grouped); never integer prefixes,
decimals, footnotes, units, signs or quantity ranges. These are shared parsing
primitives, not equipment discovery, applicability or installed-quantity proof.

A template retains its original point matrix/sequence identity and establishes
whether it is per equipment, per named group, project-wide or unresolved. The
operator can establish applicability from cited drawing text and/or a disclosed
decision, including exceptions. Automatic rules may only act on the explicitly
supported source patterns proven by independent development keys.

Assignment inputs must identify the template, exact equipment/member set,
quantity basis, scope, exceptions, source links and reason. Preview the resulting
point identities and multipliers before recording the decision. Do not multiply
both an explicit quantity and the same expanded member list. A project-wide
matrix is applied once, not once per AHU. Multiple references to one physical
point do not authorize addition or max-envelope conflict resolution.

Use the shared Python engine for demand multiplication/aggregation after these
identities and quantities are established. Preserve physical I/O, software
variables, attributes and physical devices as different concepts. Template
assignment does not automatically establish field wiring or assembly devices.

New decisions extend the existing review-history machinery with validated,
versioned actions. Existing captures/events keep their exact fingerprints.
Stale edits reject; exact operation retries are idempotent; source evidence is
immutable; changes/removals retain earlier decisions. No approval carries across
changed dependencies. Export/import must preserve both the evidence and decision.

### First durable assignment transaction

The initial equipment decision is a complete, validated replacement of the
current equipment register/assignment state within one immutable capture. Keep
every earlier event. It has a UUID operation ID, expected prior equipment head,
capture ID, reason, entry-point origin and content fingerprint. Exact retries are
idempotent; a changed request using an old operation ID, a stale head, corrupt
history or foreign evidence rejects before mutation. This is a review decision
or Agent proposal, not an approved release or authenticated operator identity.

Scopes have explicitly chosen UUIDs, building/level/system/phase labels (null
means unknown), optional retained source spans and a reason. Equipment has a
durable UUID, scope ID, canonical label and one or more exact source row/member
bindings. Equal labels alone never merge identities. Every binding must resolve
to a complete printed member and owned page; one source member cannot back two
equipment identities. Several views may be explicitly bound to one identity.
Duplicate canonical tags in one explicit scope reject; genuinely separate
equipment requires separately established scope. The initial quantity basis is
named scheduled equipment only; printed aggregate, manual quantity and installed
corroboration extensions remain required later, not falsely covered by this step.

An assignment names a matrix, canonical equipment IDs, explicit exceptions,
per-equipment versus system-once applicability, optional SOO region/source-span
references, and a reason. All members and references must exist. Repeating a
matrix for the same included member, or mixing system-once and per-equipment
applications of that matrix in one scope, rejects rather than silently adding.
Different matrices may still describe duplicate physical points; expose that
unresolved relationship rather than claiming identity reconciliation is complete.
Assignments retain field-wiring and installed-quantity uncertainty. Original
matrix values and sequence interpretations never change through assignment.
For explicitly selected body-bearing SOO regions, the assignment view reuses the
existing shared sequence/point comparator exactly. Its results are attached to
the assignment's scoped equipment IDs: listed, selected-matrix omission,
ambiguous rows or unavailable labels. Do not infer signal types or new points.
Keep unpaired matrix rows and source span IDs. A source region with no discovered
body cannot produce a supported comparison. This is a reviewed three-way link,
not automatic template applicability or a complete SOO interpretation.

Tests must include valid source member selection, range/list membership,
multi-view explicit binding, unknown scope, scope collision, exclusions,
system-once/per-unit conflicts, foreign matrix/member/span, stale update,
operation retry, event corruption, import/replay, history removal and exact
original capture preservation. The full end-to-end journey below still applies.

## Complete journey and UI placement

### Assignment demand adapter — next implementation boundary

Code inspection confirms the existing Python `calculate` multiplies explicit
`EquipmentGroup.quantity` and reconciles point identities before arithmetic.
`PointListResult` already separates declared I/O, software values, attributes,
controller qualifiers, ambiguous observations and missing columns. Reuse those
records; do not run a second table/header interpreter in JavaScript or introduce
default hardware, protocol, license policy or point identities from proximity.

The new adapter must bind its result to the verified capture, equipment decision
head, selected matrix/row/observation IDs and its own rule/engine version. A
per-equipment assignment uses the exact included named equipment set; system-once
uses one explicitly scoped matrix application, not the member count. Retain each
exception and source cell in the derivation. A row-level count, a named-member
count and a printed aggregate are never multiplied together without their distinct
applicability being established. All-excluded assignments remain explicit empty
scope, not missing evidence.

Calculate *assigned listed requirements*, not installed devices or field-wired
terminals. Preserve software observations independently of physical I/O and
attributes. Null/ambiguous observations, missing typed cells, source conflict,
controller-provided notes and possible repeated physical requirements stay
visible; do not silently supply zero or aggregate conflicting templates into a
verified project total. A whole-matrix requirement and an equipment-local one
need explicit point-identity resolution before combination. The existing max
envelope cannot establish that resolution.

The browser's calculation action must invoke the same server/shared orchestration
as MCP, with Python doing all demand multiplication and arithmetic. Persist the
validated input/dependency identity, full result and evidence. Reject stale
responses instead of attaching an old calculation to a newer assignment. Export,
reload, replay and withdrawal must preserve previous results and identify those
whose dependencies changed. Byte/time limits remain explicit failures, never
silent matrix/row truncation. Large-input batching, if needed, must preserve
global identity/conflict checks rather than independently adding batch totals.

Acceptance before implementation: exact per-unit/system-once/exception cases;
zero versus unavailable; original observation/citation preservation; duplicate
matrix/member and multi-template physical-identity conflicts; controller notes;
no invented software protocol/hardware/spares; stale calculation races; Python
and UI/MCP parity; durable results and non-commercial export; measured large-set
request/result sizes and runtime. These remain required work, not accomplished
by the present assignment editor or its preview.

The first arithmetic record is a **listed-observation derivation**, not a
unique-device or field-terminal total. Each original observation gets an
addressable matrix/row/column reference, original value, explicit replication
factor and assigned value. Attributes remain attributes and are not multiplied
as quantities. Ambiguous observations stay null even when all members are
excluded; known values multiplied by an explicit empty selection yield zero.
Retain row qualifiers, missing typed columns and uninterpreted columns. Show
known listed subtotals separately from unobserved/ambiguous coverage; never label
them the full point requirement. Do not add different assignments into a project
total before physical requirement identities are established. Potential shared
points across a system-wide and local matrix need review even when the selected
equipment lists are disjoint within the same scope. Python reuses its existing
I/O vector math and header classifications; no second JavaScript interpreter or
default hardware/licensing request is introduced. The raw matrix, sources and
review history remain unchanged.

This distinction was rechecked against UFGS 23 09 00 §3.3.10–3.3.10.6 (PDF
pp.44–45, accessed 2026-09-09): hardware, network and configuration entries are
separate, with source-specific DDC ownership and signal types. The guide is
research support, not an imported project requirement:
https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2000.pdf

Real drawing set → shared schedule/plan/SOO evidence → equipment table with
separate quantity bases and unresolved identity/scope → selected-equipment
template/points detail → source inspection → applicability and exception review
→ exact preview → recorded assignment → shared Python demand → save/reload →
non-commercial export/import → edit/withdraw/recompute with prior history.

Takeoff remains the primary table. Use selected-equipment detail for templates,
points and the later assembly/responsibility/engineering sections. No permanent
canvas rail, top toolbar or parallel navigation stack. Source return preserves
selection/filter/scroll/draft. Readiness remains unapproved until the later
complete release workflow establishes its prerequisites.

## Falsifiable acceptance, before implementation

### Equipment editing surface (next increment)

The internal Takeoff Equipment view starts with a source-occurrence table. It
also offers the explicit equipment register; selecting an item opens its details
in the same workspace. No new canvas launcher or nested dialog. Scope creation
and edits, exact printed-member selection, explicit multi-view binding, template
assignment/edit/withdrawal and equipment removal all use the existing shared
full-register transaction. The browser constructs user input, never reimplements
membership parsing, comparison, validation or quantity calculation.

Before save, validate a preview through `validateBasEquipmentRegister` and show
the selected scope, matrix, included/excluded named members and linked sequences.
Any input edit invalidates the preview. A changed capture/head requires a new
review; no silent rebase of another edit. Preserve forms, selection, filters and
table scroll when inspecting source. Every mutation needs a reason; historical
events and raw sources survive removal. Equipment still referenced by an
assignment cannot be removed until its assignments are explicitly updated.

Real browser gates: original PDF upload/compile; create scope; select independently
keyed scheduled members; save identity records; assign a system matrix once;
edit exclusions; inspect unchanged source; keyboard preview/save; both themes at
1280/1920; autosave/reload/export/fresh import parity; withdraw with history.
Controlled malformed/stale actions remain unit/production-boundary negative
tests, not fabricated original-PDF ground truth. Demand arithmetic and installed
reconciliation are subsequent required increments, not claimed by this UI.

- Real source-reviewed schedule rows, applicability clauses and their point
  matrices from several development projects; not only a controls-only excerpt.
  Preserve the six reserved holdouts until frozen evaluation.
- Positive single tags, explicit lists, compatible-prefix ranges, explicit
  counts, per-unit and whole-system templates, exclusions and recorded manual
  assignments all produce exact source-grounded membership and derivation.
- Negative controls: same tag/two buildings; repeated schedule/plan/detail;
  `OR` alternatives; range holes; mixed prefixes; malformed/decimal quantities;
  existing/demo versus new; conflicting scope; undefined sources; stale captures.
- A global matrix remains once; a per-unit matrix applies once to each member;
  quantity and list evidence cannot double-multiply. Duplicate assignment/retry
  is idempotent. Unsupported expressions remain visible, never partially counted.
- Python tests prove exact demand after valid assignment; false physical/soft
  additions remain zero. Scope/quantity provenance survives UI and MCP parity,
  actual persistence, import/export, edits/removals and source inspection.
- Track automatic, operator-resolved, unresolved and unavailable cases
  separately. Source-referenced equipment is not verified installed equipment.
- Preserve existing cell/row/citation/quantity contracts and cross-trade metrics.
  Record large-set runtime, memory and transport size; the current 32-MiB Python
  request limit needs measured batching rather than silent source truncation.

Current implementation evidence is tracked in `PROGRESS.md`, not inferred from
this acceptance contract. Scoped records, explicit assignment actions and editor
have verified development journeys. Automatic applicability/exception rules,
assignment demand, installed reconciliation, assemblies/responsibilities,
compatibility extensions, revisions and approvals remain required work.
