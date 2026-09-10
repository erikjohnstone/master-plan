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
