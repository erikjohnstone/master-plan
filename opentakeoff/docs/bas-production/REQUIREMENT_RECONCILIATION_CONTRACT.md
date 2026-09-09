# Point and component identity — next implementation contract

This is required continuation work, not an implemented feature or a reduced
finish line. The five workflows and their full acceptance gates remain in force.
Research basis: `RESEARCH.md`; source facts reviewed before implementation:
`web/test/fixtures/bas-requirement-source-cases.json` (path from package root).

## Shared-path gate

YES: scope/identity, supported source interpretation, point equivalence,
quantity allocation, conflict accounting, component derivation, responsibility
and engineering decisions belong on the shared UI/MCP path. Demand arithmetic
continues in Python. NO: forms, source-reader layout, navigation and scroll.
No VectorGrid, graph citation/bbox, legacy math or symbol threshold change.

## What must be distinguished

An original source occurrence, an assigned listed observation, a canonical
control requirement and a physical assembly component are different identities.
The current assignment calculation deliberately does not conflate them. A
temperature observation and its setpoint are not equivalent just because their
names share words; a VFD's speed command does not create an additional VFD.

Every reconciliation must keep the original evidence and its interpretation,
source document/page, equipment/system/building/phase scope, applicability,
explicit member selection, exceptions, rule and decision history. The source
can disagree with engineering expectation (for example a printed DO setpoint).
That becomes an inspectable issue, not silently corrected extraction.

## Supported complete journey

Assigned listed observations and supported SOO requirements → source comparison
inside selected equipment → establish distinct/equivalent requirement identities
and explicit scope → preview counts and unresolved claims → record source-backed
decision → shared Python reconciliation → persisted/exported result → reopen
source → edit/withdraw/recompute with historical decisions retained.

- Automatic equivalence needs established, source-backed equipment/function
  identity. Never merge by fuzzy label, equal count, row order or proximity.
  Explicit operator equivalence is allowed with all contributing references and
  a reason; label it as a decision, not extracted truth.
- Per-equipment observation instances retain their bound member. System-wide
  aggregate cells cannot be distributed among equipment arbitrarily. Any split
  needs an explicit allocation whose sum agrees with the original known count,
  or a disclosed correction with conflicting source retained. Unknown counts
  cannot be split into a fabricated complete allocation.
- A single claim cannot be consumed twice. Duplicate evidence for one established
  requirement corroborates it rather than adds quantity. Disjoint requirements
  remain additive. Multi-signal devices retain distinct signals under one
  component; software values, alarm/trend attributes and accessories are not
  converted to physical I/O.
- Preserve all source-only and unpaired requirements. A missing SOO match is
  not permission to delete a point-list row. A narrative monitoring clause with
  no stated channel cannot independently establish a terminal type/count.
- Known counts may agree, disagree, or be absent. The existing legacy maximum
  envelope remains untouched, but cannot resolve disagreement into drawing truth
  in this new workflow. Unresolved conflicts block a complete resolved total.
  Explicit source-preserving corrections require cited reason and original values.
- Assemblies use independently established component requirements, not one device
  per point. Preserve conditional predicates and integral/factory/existing scope.
  Repeated mentions of an onboard controller are not extra controllers; supply
  and exhaust VFD roles are distinct. Damper count does not prove actuator count.
- Activities remain independent: furnish, install, wire/connect, program and test.
  Factory-furnished does not assign every activity to a vendor. Field-installed
  does not identify a contractor. Unknown assignments remain unknown.

## Evidence and calculation boundaries

The resulting validated records refer to retained source observations and SOO
spans, not free-form copied evidence or UI-only quantities. The canonical scope
and every source claim remain addressable through MCP and the browser. Preview,
save, Python input, output and exports must agree exactly. No default protocol,
hardware rating, spare factor, accessory kit, role owner or installed count.

Keep displayed known subtotals separate from resolved quantities and coverage.
Neither a resolved selected subset nor an explicitly approved partial scope is
whole-project completeness. References missing source bytes remain visible; a
local fingerprint detects accidental corruption, not authenticated approval.

Every response can only add its requested result; dropping earlier captures,
decisions or calculations is an error. Changes to source, scope, rules or relevant
decisions make dependent results/approvals stale. Idempotent retries and imports
must not create duplicate requirements or reset review history.

## Acceptance before implementation

Use the reviewed M-512/M-601 examples plus other development sets, and controlled
negative cases clearly separated from original source truth. Keep holdouts blind.

1. Same measured-temperature requirement in SOO and its point row counts once
   after established identity; its setpoint remains separate and its original
   printed type stays unchanged.
2. Repeated global alarm labels retain both occurrences and never become two
   wired points. Unknown physical identity is not an automatic merge.
3. One onboard controller referenced by requirement/monitoring/alarm clauses and
   schedule note remains one scoped component after explicit identity review.
   Supply and exhaust VFDs remain two distinct per-unit roles, not four devices
   after their AO command rows are considered.
4. Conflicting/ambiguous quantities, incomplete aggregate allocation, duplicate
   claim consumption, same tag in different scopes, excluded members, unsupported
   clauses and zero versus unavailable receive positive and negative tests.
5. A 0–10 VDC actuator control requirement cannot become a 10-V power supply,
   a torque rating or an invented actuator quantity. Repeated mounting notes
   cannot generate a numeric accessory kit or a default responsible contractor.
6. Actual UI/MCP, Python arithmetic, source painting, drafts, both themes, dense
   tables, save/reload/export/import, withdrawal, races and stale replay work.
   Measure coverage, unsupported claims, false additions, runtime and memory;
   retain all prior corpus/table/grounding gates without weakening keys.

Before implementing the transaction, specify the exact versioned schema for
claim references, scope, allocation, equivalence/correction and dependencies.
This contract alone does not satisfy the acceptance tests or authorize a partial
completion claim. Installed/phase/multi-view reconciliation and all remaining
assembly/compatibility/revision workflows are still required.

## First component-source grammar, before implementation

Start with the independently visible M-512 clause 1.2: an explicit subject
shall be provided with one VFD for one named fan role AND one VFD for a different
named fan role. Admit complete declarative paragraphs only, with A/ONE/1 and
SUPPLY/RETURN/EXHAUST/RELIEF roles. Reject conditions, alternatives, negation,
duplicate roles, omitted quantities and unconsumed trailing instructions. Source
paragraphs and their spans remain unchanged, including unsupported paragraphs.
This is deterministic component-requirement evidence, not equipment applicability,
installed scope, field wiring, a responsibility assignment or a project total.

Use the existing shared narrative paragraph discovery. Expose an additive,
versioned result without changing the retained monitoring result/capture version.
Every discovered clause is accounted for; discovery and whole-sequence coverage
remain incomplete. Each admitted component has its original page/clause/spans,
declared subject, fan role, literal quantity one and an explicit applicability-
review requirement. Python will perform later assignment/aggregation math.

Tests before integration: exact original M-512 source and two distinct roles;
case/whitespace/number-word variants; unsupported conditional/alternative,
negative, duplicate-role, extra-clause and quantity cases; deterministic replay;
original source/monitoring output preservation; complete clause accounting.
This parser is an intermediate dependency of the full assembly/reconciliation
journey, not a standalone completion target. Other component patterns, durable
decisions, UI/MCP integration and all earlier acceptance cases remain required.

### Factory onboard-controller declaration and output validation

The reviewed M-512 paragraph 2 consists of a short control label, an explicit
factory-furnished onboard BACnet-controller declaration, then an instruction
that the manufacturer use its preferred sequence to meet following requirements.
Admit that exact grammatical structure, and a standalone complete declaration,
for an explicit subject and A/ONE/1 quantity. Accept spelling/case/whitespace
variants of factory-furnished and onboard/on-board. No conditional, alternative,
negated or unconsumed tail is admitted. Do not broaden to arbitrary references
to a controller. The label and manufacturer sequence instruction are retained
as uninterpreted text; the compound paragraph is only partially interpreted.

The result declares a controller requirement with quantity one **per declared
subject after applicability review**, not per equipment row automatically.
"System" is retained in the subject. Record the required BACnet protocol label
without inventing a transport, point list, electrical mode or verified device
capability. Only furnishing is marked factory-furnished; named party, install,
wire, program and test stay unknown. The manufacturer sequence instruction is
not a program-responsibility assignment. Subsequent monitoring/alarm references
remain retained unsupported clauses, not additional controller requirements.

`bas_component_requirements_v1` is a strict, bounded shared result. Component
kinds have discriminated schemas; installed quantities remain null. Every
clause retains region/page/clause identity, all original source spans and raw
reading text. A shared verification function recomputes against the retained
source context and checks canonical equality; schema validity or a plausible
source ID alone is not sufficient evidence. No existing capture is reinterpreted
or migrated as part of this intermediate parser addition.

Acceptance additions: original declaration and both subsequent references;
standalone and compound variants; explicit positive furnishing with four unknown
activities; zero added controllers for conditional/negated/reference/extra-tail
cases; malformed outputs, altered raw text/bbox/ownership, dropped clauses,
invented responsibility or device fields and unknown schema versions rejected.
Reviewing a parser candidate does not yet satisfy the durable assembly workflow.

### Next independently reviewed patterns (not yet implemented)

Original M-511 has a VAV paragraph explicitly listing one terminal controller,
one dual-technology occupancy sensor, one downstream static-pressure sensor and
one primary modulating supply-air damper per declared VAV subject. Its complete
literal source, spans and expected distinctions are now independently keyed.
Supporting this must not turn dual technology into two sensors, a damper into a
separately quantified actuator, or BACnet compatibility into a terminal type.
Review equipment applicability before any replication; quantity math stays Python.

M-511's separate DOAS 3 sequence and M-512's DOAS 1&2 sequence repeat the same
generic component declarations but differ in operating behavior. Their source
occurrences must remain separate. The shared interpreter currently preserves
page/clause IDs, but identical labels do not resolve equipment applicability or
prove a duplicated view. Test the separately reviewed captions and memberships
when implementing cross-region identity transactions. No automatic global DOAS
join and no inferred installed count.
