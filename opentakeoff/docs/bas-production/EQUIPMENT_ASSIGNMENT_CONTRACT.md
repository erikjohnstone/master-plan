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

## Complete journey and UI placement

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

Unimplemented at this contract checkpoint: canonical equipment records and
assignment actions/UI, automatic applicability/exception rules, demand adapter,
assemblies/responsibilities, compatibility extension, revisions and approvals.
