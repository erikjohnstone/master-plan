# Demo slate

This is an ordered slate, not proof. A row becomes selected only after its
hardness and stress evidence are independently rechecked from rendered source
sheets. If the evidence does not hold, replace the target before N=5 runs.

**Suite finish line (see `GOAL.md` Final suite gate):** after D10 locks,
re-run N=5 for **every** demo D01–D10 sequentially (**50** API runs, all
must pass) and **3** correct UI tests per demo (**30** total, no video
required for that final UI pass). Earlier per-demo locks do not skip this.

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

Status: `LOCKED — API 5/5; UI re-proved (full row values + answering-cell paints, 12 regions)`

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
`D01-chiller-plan-to-controls/`. UI re-proof under the usefulness bar
(intelligent prompt + every requested field + painted answering value cells)
is saved as
`/opt/cursor/artifacts/d01_ui_prompt_tools_answer_highlights_2026-08-30T05-09-16-177Z.webm`
(12 painted regions on MS101 + M-603). Production gates stay
methodology-general. D01 counts toward ten.

## D02 selection record

Status: `LOCKED — API 5/5; p95 7.263 s; UI re-proof with multi-field paints (incl. CFM) validated`

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
Localhost stdio harness True. UI re-proof under the usefulness bar (full
fields + each distinct answering value cell painted, including **3850 CFM**)
is saved as
`/opt/cursor/artifacts/d02_ui_prompt_tools_answer_highlights_2026-08-30T05-05-42-831Z.webm`
(8 painted regions). Production gates stay methodology-general — no corpus
hardcoding. D02 counts toward ten. Next: D03.

## D03 selection record

Status: `LOCKED — API 5/5; UI re-proof (expandable cards + verified follow-up)`

Target holds: 75-sheet NAVFAC set with Air Ops / MITRACON / ATCT namespaces.
Independent equipment-schedule inventory (unique MARK rows) yields AHU 5,
DOAH unit 3 (HANDLING DOAH-T1 covered in follow-up), FCU 42, VAV 52,
air-cooled chillers 2, heat-recovery chillers 2, boilers 6, and MI731
AHU-T1A/TIB points list at 62 rows. Stratified 20% find_text hand-count
reconciled before model runs (`hand_count_20pct` in truth.json). Vibration-
isolation compound keys are not equipment units.

N=5 API/stdio 5/5 (p95 **12.156 s**). UI re-proved under the chat-usefulness
bar: answer-first visible Answer, expandable source cards, follow-up **asked
+ verified** (HANDLING title + ATCT FCU 18 + FCU-T11) in
`/opt/cursor/artifacts/d03_ui_prompt_answer_cards_followup_2026-08-30T11-52-24-499Z.webm`.
Next: D05.

## D04 selection record

Status: `LOCKED — API 5/5; UI re-proof (expandable cards + verified follow-up)`

Target holds: 24-sheet `federal-mech` set. `VOLUME CONTROL BOX SCHEDULE` on
sheet #16 lists VAV-1..VAV-58 (58 unique VAV-* tags; junk key SUITE100
excluded). Plan sheets carry hundreds of fragmented `VAV-` labels, so the
rollup must use the schedule title-scan — not plan-label frequency.
Independent 20% find_text hand-count (13 tags) reconciled before model runs.
Re-verified 2026-08-30 from pinned PDF: 59 rows, 58 VAV-*, SUITE100 junk;
VAV-1/12/30/58 attribute cells match truth.

N=5 API/stdio 5/5 (p95 **3.535 s**). UI re-proved under the chat-usefulness
bar: complete structured Answer, expandable source cards (`tag · field ·
value` + dropdown), follow-up **asked + verified** (SUITE100 not a VAV;
VAV-58 CFM 350) in
`/opt/cursor/artifacts/d04_ui_prompt_answer_cards_followup_2026-08-30T11-28-54-597Z.webm`.
D03 and D04 locked; next: D05.

## D05 selection record

Status: `SELECTED — ground truth authored; N=5 pending`

Target holds: 65-sheet `baker-county-eoc` bid set. Mechanical
`PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE (GAS HEAT)` on sheet #41
uses `RTU-1`/`RTU-2`; electrical `MECHANICAL EQUIPMENT CONNECTION SCHEDULE`
on sheet #60 zero-pads to `RTU-01`/`RTU-02`. Roof plan label for RTU-1 is on
sheet #39. Ground truth for RTU-1 mech attrs + RTU-01 electrical join (and
RTU-2↔RTU-02 follow-up) authored from live `query_table`/`find_text` before
any model run — see `D05-rtu-mech-to-electrical/truth.json`.

