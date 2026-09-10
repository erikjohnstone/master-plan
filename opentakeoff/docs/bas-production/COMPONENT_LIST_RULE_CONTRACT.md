# Explicit component lists and frozen rule migration

Pre-implementation contract, 2026-09-09. This extends workflows A/B/C; it does
not replace the complete five-workflow goal. Shared-path decision: **YES** for
source interpretation, distinct component roles, rule selection, reviewed
migration, quantity validation and persisted history; **NO** for form layout.

## Reproduced source gap

The independent `web/test/fixtures/bas-requirement-source-cases.json` key names
the complete M-511 VAV declaration in original PDF page 7, spans 156/157/163/169.
The full original page was visually rechecked before this change. Existing
narrative discovery correctly returns the complete paragraph and its original
four spans. Component rule `explicit_component_declarations_1` returns **zero
components**, leaving the paragraph uninterpreted. This is a downstream
interpretation gap, not missing PDF text or a VectorGrid defect.

Expected declared requirements, per subject only after applicability review:
one terminal-equipment controller, one dual-technology occupancy sensor, one
downstream static-pressure sensor, and one primary modulating supply-air damper.
The two sensor functions belong to separate sensor requirements; dual technology
does not double the occupancy device. No extra actuator, terminal, conductor,
voltage, torque, mounting kit, contractor or installed count is established.
The adjacent four point rows and subsequent behavioral references must not add
four further devices. The DOAS 3 sequence elsewhere on the same page remains
separate evidence with separate applicability.

## Research and scope

[UFGS 23 09 00](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2000.pdf),
sections 3.3.3, 3.3.7 and 3.3.10, separately describes device identities,
functions, equipment schedules and hardware/network/configuration points.
[UFGS 23 09 23.02](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2023.02.pdf),
section 2.3.2.6, expressly includes integral sensors/actuators in its hardware
I/O discussion. These support maintaining device-versus-point identity; their
options/ratings are not imported project requirements. Accessed 2026-09-09.
The actual drawing, not a guide, supplies the four declared components here.

## Supported new rule

Add an explicitly dispatched `explicit_component_declarations_2` with a strict
v2 source-result schema. Keep v1 implementation/output replay byte-equivalent.
Use the existing source-validated headed narrative paragraphs; do not scan
arbitrary page-concatenated text or classify tables with a keyword list.

Admit complete declarative `EACH <subject> WILL/SHALL BE PROVIDED WITH ...`
paragraphs. The list contains explicitly quantified singular items (A/AN/ONE/1),
separated by commas/conjunctions. Support the reviewed terminal controller,
dual-technology occupancy sensor, downstream static-pressure sensor and primary
modulating supply-air damper noun phrases. Lists may contain supported subsets,
reordered items and ordinary case/whitespace/hyphen variants. They must not be
tied to a PDF, sheet name, tag, specific four-item order or corpus identifier.

Every item retains its physical kind **and distinct functional role**. Different
sensor roles cannot be silently merged merely because both have kind `sensor`.
Repeated same-role items require review rather than deduplication or an invented
quantity. Unknown list items, plural/ambiguous counts, negation, alternatives,
conditions and extra trailing instructions leave the whole declaration
uninterpreted. All source text remains available. No substring-only acceptance.

Literal BACnet compatibility remains a protocol requirement, not tested product
compatibility, transport selection, physical channel type or power rating.
All five activity responsibilities remain unknown for this declaration. Quantity
expansion stays in Python after explicit equipment applicability decisions.

## Integration and migration requirements

- Source result verification dispatches by its declared version. V1 cannot
  carry v2 component kinds/roles, and unknown versions reject.
- Saved assembly events retain their pinned rule, interpretation fingerprint,
  IDs, source spans, inputs and calculation results. A new default must not
  silently upgrade a saved register during view, compile, retry or import.
- A reviewed transition is a new complete-register event against current
  source/equipment/assembly heads, with a reason. Earlier events/calculations
  remain readable. Changed rule dependencies make prior results stale.
- Shared validation uses functional role identity for merging source references;
  separate occupancy and static-pressure requirements cannot masquerade as one
  source-derived sensor. Explicit corrections remain disclosed review issues.
- UI candidate labels expose functional roles, not two indistinguishable
  `sensor` buttons. UI and MCP offer the same source requirements and rule
  transition; Python transport accepts only the validated pinned versions.

## Falsifiable acceptance before calling the increment complete

1. Original four independently keyed components, quantities and all four spans
   exact; no extra actuator/I/O/owner. Old source, tables and sequence output
   unchanged. V1 replay continues to leave this clause uninterpreted.
2. Variable subject, reordered/subset lists, case/whitespace/hyphen/number-word
   variants pass; repeated roles and unsupported/conditional/negated/alternative
   lists never yield a plausible partial kit. Tampered role/source/version fails.
3. Distinct sensor roles reject a source-derived merge. Repeated references
   cannot inflate quantities. Separate equipment/source scopes stay separate.
4. Real original-PDF UI and public MCP save/retry/reload/export/import and
   explicit v1-to-v2 transition preserve old history, cite navigation and Python
   results. No fixture-injected UI response counts as this proof.
5. Both themes, dense data, keyboard, drafts and stale actions work; focused and
   full regression gates pass without changing keys or extraction thresholds.

Parser-only tests are an intermediate dependency, not this complete acceptance.
