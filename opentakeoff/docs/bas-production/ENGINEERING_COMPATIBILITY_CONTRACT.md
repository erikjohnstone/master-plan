# Evidence-backed engineering compatibility

Pre-implementation acceptance contract, 2026-09-09. This is workflow D of
`../BAS_PRODUCTION_GOAL.md`; all A/B/C/E obligations remain. A rule kernel or a
form alone is not completion.

## Audit and source basis

The current `bas_engine/hardware.py` solves four-dimensional integer capacity
with an explicit universal-input pool. Its `HardwareProfile` has no voltage,
current, resistance, pulse or electrical ratings. `network.py` solves declared
ordered serial routes and fixed-closet port capacity. Neither establishes an
electrically compatible installed design. Preserve these solvers and their
existing responses. Do not silently reinterpret `calculated` as compatibility.

Shared-path decision: **YES** for rating contracts, evidence ownership,
endpoint/allocation identity, rules, outcomes, dependencies and persistence;
**NO** for equipment-detail forms, disclosures, keyboard and source-view state.
Python owns numeric comparisons/aggregation. JS validates transport, sources and
history but must not implement a second engineering calculator.

Primary sources reviewed 2026-09-09:

- [UFGS 23 09 23.02](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2023.02.pdf),
  2.3.2 and 2.3.4: analog, contact, triac and pulse interfaces have different
  characteristics; expansion hardware is not interchangeable with standalone
  equipment. This supports explicit mode/range and expansion compatibility
  inputs. Its example ratings are not project defaults.
- [UFGS 23 09 13](https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2013.pdf),
  2.4.5, 2.7.1 and 2.9.1: power capacity, signal characteristics, actuator
  torque/shutoff, environment and fail position are separate constraints. Its
  spare factor, torque factors, voltage tolerances and fail positions must not
  be imported into a project automatically.
- Existing `BAS_MATH_RESEARCH.md` explains exact capacity, network load, route
  and scope constraints and their primary sources. Reuse those algorithms;
  do not produce another inferred network topology.

Official Autodesk comparison documentation and W3C disclosure guidance were
rechecked in the current work. Detailed inputs belong in selected equipment;
project conflicts belong in the one internal Review & changes workspace. No
new permanent canvas rail or top-level feature tab.

## Independently inspected real starting case

The original Fort Sam nine-page development PDF, SHA-256
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`,
page 9 / M-601, was inspected as a complete rendered sheet. Note 10 below the
dedicated outside-air schedule explicitly specifies a 0–10 VDC modulating
actuator. DOAS-1, DOAS-2 and DOAS-3 each list note 10. The paragraph is retained
as text span 972, bbox `[1364.4,1766.7,2533.9,1787.3]` in the 4896×3168
source frame. This supplies a signal requirement, not an actuator power supply,
load, torque, part selection or a new installed actuator count. The neighboring
schedule's equipment VOLT/PH and MCA fields cannot supply missing actuator
control-power ratings. A user-reviewed requirement can cite this note without
forcing schedule notes into headed SOO or changing VectorGrid.

The first real workflow must inspect that note, establish equipment/note
applicability, enter a source-bound signal requirement, and compare explicit
capabilities. Counterpart ratings absent from this PDF must be labeled controlled
test inputs, not extracted capabilities. Unknown counterparts remain not
evaluable. At least one other real development document and cross-trade controls
remain required; this case alone is not full workflow D or corpus coverage.

## Complete input and outcome contract

1. Introduce a validated additive engineering register and append-only event
   history. Pin the engineering rule, current capture, equipment head and any
   assembly/requirement dependencies. Equipment IDs are not generic tag strings.
   Every entered characteristic retains source-span/cell references where
   available, original text, origin and reason. A manually transcribed rating is
   disclosed as a user decision, not promoted to automatically extracted truth.
2. Use stable endpoint/channel/module/supply/segment identities and explicit
   equipment/panel/location ownership. Physical endpoints, components and
   software variables are distinct. No endpoint is invented from an AI count.
3. Quantities use bounded exact decimal strings or integers with explicit units;
   reject NaN, infinity, booleans, coercive numeric strings in integer fields,
   reversed intervals and incompatible dimensions. Python uses exact rational
   comparisons/conversions, never a rounded boundary to turn fail into pass.
   Preserve authored values/units beside normalized comparison values.
4. Each check identifies its subject, rule/version, input references and outcome
   `pass`, `fail` or `not_evaluable`, plus exact reasons and missing inputs.
   A pass names only the established constraint. A failed constraint remains
   failed when another input is missing. An unknown constraint cannot be marked
   not-applicable without an explicit scoped decision and reason.
5. Overall completeness includes coverage of relevant constraints, not merely
   absence of failures in a caller-selected subset. No row count, rule hash or
   local actor label certifies the whole project or actual installation.

## Required rule families and independently bounded tests

| Rule family | Explicit inputs and supported check | Positive, negative and missing-input acceptance |
| --- | --- | --- |
| Signal direction/mode | Source/sink identity and configured voltage/current/contact/resistance/pulse modes | Source→sink succeeds; source→source, V→mA, contact→energized and distinct modes fail; absent mode/direction is not evaluable. |
| Analog range and electrical loading | Configured output interval, accepted input interval, AC/DC, permitted excitation, output load/input impedance as applicable | Inclusive boundaries; partial overlap insufficient; 0–10 vs 2–10 mismatch; exact unit-equivalent values; unknown load/excitation remains a separate unresolved constraint. |
| Contact and pulse | Dry/wet/relay/triac interface, circuit AC/DC/rating, pulse frequency/width and sink limits | Relay/triac not silently interchangeable; insufficient contact rating, too-fast or too-short pulses fail; a DI count proves none of these. |
| Power and loading | One declared supply/pool, output type/interval, explicit connected loads and applicable operating/startup scenarios, capacity/derating policy | Exact total at capacity passes, one increment above fails; missing one load prevents a complete pass; AC/DC/range mismatch; W and VA never equated without applicable declared power factor. No default 80% factor or invented simultaneous-startup assumption. |
| Mechanical/fail/environment | Required and supplied torque/close-off, fail behavior, temperature interval, declared enclosure/location class | Like-dimension comparison only; insufficient rating or wrong fail position fails; missing requirements are not a pass. No area-based torque heuristic or inferred spring return. |
| Endpoint/channel allocation | Explicit endpoint and selected channel, pool/owner identity, supported channel mode and usage constraints | One terminal cannot serve two independently required endpoints; a universal terminal cannot be consumed twice; sufficient aggregate count does not repair signal mismatch. Distinct buildings/panels remain separate. |
| Expansion | Base, module and supported interface identity, explicit compatibility declaration, module/channel/power limits | Incompatible base/module fails; maximum count is a hard boundary; unknown compatibility is not inferred from BACnet branding; standalone controller is not auto-converted to expansion. |
| Network and location | Explicit devices, segment/closet membership, declared protocol/media/baud/load/address constraints, routes/distances | Reuse existing partition/port solvers for their exact subproblems; validate duplicate allocation and declared location boundaries. Missing physical route stays not evaluable; software points are not devices. No hidden route synthesis. |

The first implementation dependency may cover individual rule families, but
none of these rows is optional and no partial kernel satisfies workflow D.
Unsupported electrical topologies/characteristics retain their source and a
specific issue. Never report an unsupported topology as a zero-load solution.

## Persistence, shared service and UI journey

### Numeric dependency contract (implementation order, not reduced scope)

The Python dependency starts with typed signal, load, contact, pulse, power and
mechanical checks. Each check has a stable ID, explicit equipment IDs and a
reason; each characteristic has its own origin, original wording and source IDs
or explicit-input reason. Missing values are null, not omitted calculations.
Results retain the entire input and individual rule outcomes with input paths.
Known failures take precedence over missing inputs, while both remain visible.
Empty selections never mean complete. Allocation/expansion/network integration,
source ownership, persistence and the complete browser/MCP journey remain
mandatory subsequent dependencies before workflow D can be called usable.

Comparisons use exact rational arithmetic. Common electrical/SI units and
international inch/foot torque/pressure units are explicit. The exact force
definition and length factors are from [NIST SP 811 Appendix B](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9);
derive torque and pressure factors from those definitions, not rounded table
display factors. Temperature intervals use affine Celsius/Fahrenheit conversion.
The [DOE Electrical Science handbook, volume 3, ES-09](https://www.energy.gov/sites/default/files/2026-04/DOE-HDBK-1011-92_VOL3.pdf)
distinguishes real and apparent power. W-to-VA conversion requires an explicit
scenario-specific power factor; no unity assumption. Power scenarios enumerate
every declared connected load's operating/startup/off state and retain the
author's reason; none are generated by assuming simultaneous startup. Missing
load values do not erase a known overload. These references were checked
2026-09-09; their example ratings do not become project requirements.

Allocation also needs cross-check exclusivity: universal-mode aliases reference
one physical terminal. Reusing a terminal or endpoint in multiple check rows is
a conflict. One physical supply/base cannot be split into independent check
rows with partial load/module lists. Expansion power references a same-base,
same-pool power check containing every declared module and matching equipment
ownership; missing dependencies are unresolved, not zero load. Exact rational
intermediates above 8,192 bits reject explicitly before text serialization;
accepted comparisons never round or truncate.

Network implementation research was rechecked 2026-09-09, before that dependency
is coded: [BACnet addendum ce, clause 9](https://bacnet.org/wp-content/uploads/sites/4/2023/10/135_2020_ce_20220121.pdf)
permits manager addresses 0–127, subordinate addresses 0–254, and reserves 255
for broadcast. [Modbus serial V1.02, 2.2](https://www.modbus.org/file/secure/modbusoverserial.pdf)
uses unique server addresses 1–247; zero is broadcast, and the client has no
server address. [TI's RS-485 guide](https://www.ti.com/lit/an/slla272d/slla272d.pdf)
distinguishes unit loading, biasing and rate/length constraints. These require
explicit endpoint roles and declared electrical/route limits; no universal
device-count, baud or cable-length default. Reuse existing serial/IP solvers
and preserve their capacity-only/physical-route distinction.

### Network dependency acceptance before implementation

Represent one explicitly declared serial segment or fixed IP closet per check,
with physical port-scoped endpoint IDs, equipment/scope ownership, individual
source-based settings and nullable ratings. Serial protocol/role/address,
media/baud/frame settings, device/manager/unit-load budgets, head-end reservations
and chainage/lead length are separate inputs. IP checks retain an explicit address
domain, media/protocol, switch port/reservation/count and each cable length.
No silent 32-device, 100-metre, router-address-zero or all-manager defaults.

Reuse `serial_partition` and `ip_switches` unchanged for their existing exact
subproblems. A serial check describes one segment: a solver result requiring
multiple segments fails that allocation; it does not install more gateways.
Missing chainages may yield a clearly labeled capacity-only partition, retaining
all original partial positions. Known overlength or out-of-order chainages still
fail independently. Unknown load/reservation policies prevent solver invocation,
while known overload subtotals remain failed. An IP overlength cable cannot be
repaired by declaring extra switches in the same closet.

Accept only unique port allocation and explicit scope membership. Duplicate
known addresses fail even when another address is missing; IP canonical address
comparison is scoped to the declared address domain across closets. Reserved
serial addresses cannot collide with device addresses. Modbus server and BACnet
manager/subordinate address limits come from the references above. Settings
must match the explicitly selected network; no protocol translation is inferred.
This does not establish arbitrary routes, subnet/routing/BBMD/SC configuration,
termination/bias design, upstream network redundancy or complete installation.

Tests must include positive known configurations, exact overload/reach boundaries,
missing each characteristic, false software-node admission, cross-scope/duplicate
ports and addresses, incompatible protocols/settings, partial route data, reserved
resources, solver-result equality, replay and actual Python process parity.

- Follow `basAssemblyQuantities.ts`'s validated service/expected-head/cancellation
  pattern and the one `basMath.ts` bounded Python process transport. Add a new
  envelope member without changing existing request behavior. Source checking
  precedes accepting caller-provided ratings or counterpart IDs.
- Extend `basWorkflowRevision.ts` and `basWorkflow.ts` additively: old workflow
  replays retain their exact data, new engineering events use current heads,
  retries are idempotent, incompatible histories reject, historical results
  survive changes. Import validation is not just a result-shape check.
- Input/source/rule changes stale affected results; no old pass is shown as
  current. Preserve original claims and reasoned corrections. Duplicate or
  removed equipment cannot silently reassign a constraint to a similarly named
  equipment item. Approval invalidation composes with workflow E.
- Selected equipment → Engineering shows a compact checks table → selected
  check reveals inputs, ratings, allocation and evidence → edit with reason →
  shared preview → persist → calculate in Python → inspect source → fix failure
  → recompute → reload → export/import. No transient/demo-only completion.
- UI/MCP share register validation, outcomes and exports. Existing Agent may
  propose explicit inputs but does not generate authoritative hidden ratings.
  Existing takeoff rows/tables/citations/math are unchanged. Non-commercial
  exports include all inputs, decisions, versions, missing checks and results.

## Completion gates

### Shared transport acceptance before integration

All eleven Python check variants need strict, non-coercing UI/MCP transport
schemas. They preserve decimal strings, units, nulls, evidence bases and original
array order. JS validates structure and response lineage, not engineering math;
Python remains the authority for dimensions, numerical bounds and cross-check
constraints. A successful JS parse alone must never permit saving a review.
Use the existing bounded process transport, including cancellation, timeout and
runtime diagnostics. Check actual process round trips for every variant, missing
and failed cases, response/source substitution, omitted/reordered checks and
forged passing summary states. Existing envelopes must remain identical.
No public UI/MCP action is exposed until source/asset ownership and durable
history are implemented. Imported historical calculations require integrity
validation and shared-engine replay before being accepted as current outcomes;
local hashes alone are not authenticated proof of the result.

Each rule family needs exact boundary, incompatible, omitted, malformed and
cross-scope cases. Independently enumerate small allocation/power cases where
applicable. Preserve all prior Python/web/MCP and source/quantity regressions.
Real original-PDF browser and public MCP proofs must cover source capture,
reasoned inputs, failure and correction, unchanged original evidence, stale
results, retry, concurrent state change, reload and fresh import/export parity.
Test both themes at 1280/1440/1920, keyboard and dense tables. Report conditional
input scenarios separately from extracted facts and installed quantities.
Full applicable corpus and untouched-holdout gates remain required by the goal.

No product catalogs, specification ingestion, pricing/labor, new model, OCR,
vision, extraction threshold changes or new external infrastructure.
