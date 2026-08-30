# Demo slate

This is an ordered slate, not proof. A row becomes selected only after its
hardness and stress evidence are independently rechecked from rendered source
sheets. If the evidence does not hold, replace the target before N=5 runs.

| ID | Estimator workflow | Candidate hard set | Required stress |
|---|---|---|---|
| D01 | Locate CH-A1 and join its plan symbol to chiller performance and associated CHW valve data | `navfac-cherry-point-atc` | 75 sheets; three building namespaces; site-plan placement plus equipment and valve schedules |
| D02 | Trace an AHU BAS point from points list to controlled equipment and physical location | `navfac-cherry-point-atc` | BAS point list, equipment schedule, narrative/plan evidence on separate sheets |
| D03 | Full HVAC/BAS project takeoff with equipment and controls breakdown | `navfac-cherry-point-atc` | full-set rollup across Air Ops, MITRACON, and ATCT; 20% hand-count reconciliation |
| D04 | VAV scope rollup with quantities and schedule attributes | `federal-mech` | dense VAV population and fragmented plan labels; 20% hand-count reconciliation |
| D05 | Coordinate RTU mechanical data with electrical connection requirements | `baker-county-eoc` | cross-discipline equipment and connection schedules in a 65-sheet bid set |
| D06 | Take off chilled-water valves and distinguish installed, packaged, and unscaled evidence | `itd-d1-lab` | dense real valve vocabulary, repeated symbols, and honest scale refusal path |
| D07 | Link VAV schedule rows to plan locations while disclosing exploded-text fan limits | `bldg5406-hvac-demo` | quarter-turned schedule extraction plus vector-path-only labels that must refuse |
| D08 | Compare air-device or FCU quantities across independent buildings | `navfac-cherry-point-atc` | reused local tag namespaces and cross-building dedup; 20% hand-count reconciliation |
| D09 | Produce a room-oriented HVAC coordination package with equipment, air devices, and cited room context | `baker-county-eoc` | architectural room data joined to mechanical plan/schedule evidence |
| D10 | Full BAS points takeoff grouped by controller/equipment and point type | `navfac-cherry-point-atc` | multiple points-list families and buildings; AI/AO/BI/BO breakdown; 20% hand-count reconciliation |

## D01 selection record

Status: `LOCKED — 5/5 clean; p95 3.988 s; production UI proof validated`

The target holds up. Independent graph extraction from the real NAVFAC PDF
found the `AIR COOLED CHILLER SCHEDULE` and `CHW CONTROL VALVE SCHEDULE` on
page 44, while the authored source audit places the real `CH-A1` outdoor unit
on the mechanical site plan at page 3. The set has 75 sheets and three
independent area namespaces (`A`, `M`, and `T`), so retrieval must disambiguate
the Air Operations chiller rather than succeeding on a small or single-area
sample.

The first rasterization also exposed and fixed an evidence-integrity blocker:
the table renderer's old filenames omitted table identity, causing all nine
page-44 table crops to overwrite one another. Unique evidence crops, typed
ground truth and N=5 API gate are locked in
`D01-chiller-plan-to-controls/`. The replacement 34.8-second production-UI
recording shows the frozen prompt, live tools, complete answer, actual MS101
plan tag, and both M-603 schedule rows highlighted. The artifact harness
validated the final answer and saved the strict pass under
`/opt/cursor/artifacts/`; D01 now counts toward ten.

## D02 selection record

Status: `LOCKED — API 5/5; p95 7.263 s; truth harness green`

The NAVFAC target holds up after direct rendering. MI731 contains one 62-row
`POINTS LIST AHU-T1A/TIB` that interleaves AHU-T1A and AHU-T1B under repeated
AI/AO/BI/BO marks. AI10 is specifically `AHU-T1A HW VALVE POSITION
(FEEDBACK)`. Its controlled unit must then be joined to the separate M-621 air
handling schedule, the physical `AHU-T1A / AHU-T1B SECTION`, and the M-002
ATCT cab narrative. Those sources occupy four different sheets in a 75-sheet,
three-building set, so the required BAS-to-equipment-to-location stress is
genuine rather than inferred from the slate.

N=5 production runs are 5/5 under `verify:demo` (values, citation
resolvability, and OCR grounding) with nearest-rank p95 **7.263 s**. Failed
cold attempts remain under `runs/failed/` with classified diagnostics.
Localhost stdio and production-UI proof follow the same harness rules as D01.
