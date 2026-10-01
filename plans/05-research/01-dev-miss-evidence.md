<!--
Research note R2 for the control-intent goal (plans/05-control-intent-plan.md,
opentakeoff-corpus/goals/CONTROL_INTENT.md). Written 2026-09-24 by the coordinator.

Evidence: dev documents, dev keys and dev reports only. The source is the ASSEMBLIES
typical eval at be3e942 (opentakeoff-corpus/reports/assemblies/05-typical-eval-dev.md)
and keys/<dev set>.typicals.csv. Reproduce with plans/05-research/pilot/r2-*.mjs.
The per-row table is plans/05-research/dev-misses-by-evidence.csv.
-->

# What decides the typicals the assemblies loop missed (dev)

**Question.** The assemblies loop picks the right typical and options for 116 of 244 dev instances (47.5%). Which evidence would have decided each of the other 128? How many of them could an estimator's answer to a project question settle, and how many need the control drawings read?

**Method.**
1. `r2-misses.mjs` takes every miss listed in the dev report (21 wrong typicals, 44 wrong options, 63 unresolved). It joins each miss to its key row's basis note. Keys are written the way an estimator reads the set: from renders, schedule notes, sequences and control drawings, without looking at pipeline output.
2. Each miss is classified by the evidence its note names. The classification is a hand-written table (`r2-classes.mjs`, one entry per set and tag), not a regex over the notes.
3. `r2-targeting.mjs` asks, for every miss the control drawings decide, whether today's sheet graph already puts that evidence within reach of the unit. It reads the L4.8 control schematics and the sequence narratives, from cached graphs only.

## 1. The answer

| Evidence that decides the row | Rows | Who can settle it |
|---|---:|---|
| **A project fact**, the same for every unit in the project | **31** | **one project question each** |
| &nbsp;&nbsp;there is no BAS in the project (004, baker-county-eoc) | 20 | |
| &nbsp;&nbsp;DoD owner, so UFC 3-410-01 minimum points apply (federal pumps) | 4 | |
| &nbsp;&nbsp;existing units keep their controls (031, 069); the schedule prints the per-unit flag | 5 | |
| &nbsp;&nbsp;motors without a scheduled VFD are constant speed (bldg5406 CP-1, itd EF-4) | 2 | |
| **The control drawings** | **71** | **reading the evidence bound to the unit** |
| &nbsp;&nbsp;sequence or note prose ("THIS SYSTEM IS STANDALONE…", "CONSTANT SPEED…") | 15 | |
| &nbsp;&nbsp;a control detail or points schedule that shows the devices and I/O | 41 | |
| &nbsp;&nbsp;absence on the bound detail ("no smoke detector on the schematic") | 12 | |
| &nbsp;&nbsp;a control detail plus the DoD fact (federal AHU-1 and CH-1, bldg5406 CH-1) | 3 | |
| **The schedule already prints it** (normalizer or extraction gap) | 11 | the ASSEMBLIES normalizer; no AI and no question |
| **Floor-plan evidence per zone** (a CO2 sensor in 15 federal VAV zones) | 15 | out of scope for both items |

**Ceiling.** Settling every question and reading every bound control evidence correctly would give 116 + 31 + 71 = **218 of 244 (89.3%)**. The 11 schedule rows would add 11 more (229, 93.9%), and the 15 plan rows would take it to 244.

The miss categories break down as follows (full table in the CSV):

| class | wrong typical | wrong option | unresolved |
|---|---:|---:|---:|
| Q (question) | 10 | 4 | 17 |
| R (control drawings) | 8 | 23 | 40 |
| S (schedule) | 3 | 2 | 6 |
| P (plan) | 0 | 15 | 0 |

## 2. The project-fact rows (31)

- **No BAS: 20 rows.** Two dev projects have no BAS.
  - 004's M-602 general controls note 1 says the sequences run on the manufacturers' factory controllers "WITHOUT THE USE OF A BUILDING AUTOMATION SYSTEM (BAS), UNLESS OTHERWISE NOTED".
  - baker-county-eoc runs its units from programmable thermostats. DDC and BMS appear only in its abbreviations list.
  - Every scheduled unit in both projects keys to "none". One "Is there a BAS in scope?" answer settles all 20 rows.
- **DoD: 4 rows, and part of 3 more.** Eglin AFB (federal-mech) and Davis-Monthan AFB (bldg5406) are DoD, so UFC 3-410-01 Table 3-1 minimum points apply.
  - The four federal pumps differ from the key only in `ufc_minimum_points`.
  - Federal AHU-1, federal CH-1 and bldg5406 CH-1 also need options that only their control details decide.
  - **Pitfall found in the keys:** bldg5406 CP-1 is a domestic hot-water recirculation pump. Its key sets `ufc_minimum_points=false`, because plumbing service is outside UFC 3-410-01's HVAC control scope. A DoD answer must therefore apply UFC minimums to HVAC-service units only.
- **Existing equipment: 5 rows.** Each unit carries a printed per-unit flag:
  - 031 schedule remark 'EXISTING', with plan note "…TO REMAIN";
  - 069 table titles "EXISTING … SCHEDULE", tags "B-1(E)", and remark "SPECIFICATIONS SHOWN FOR REFERENCE ONLY".
  
  The policy is a project fact: 069's M-601/M-602 have the controls contractor "modify the existing DDC package and integrate only the new components". The flag comes from the schedule; the policy needs one question.
- **Motor speed when no VFD is scheduled: 2 rows.** With nothing printed, the loop honestly waits for `attr.vfd`. A disclosed project default ("unscheduled means constant speed") settles these two.
  - The other 16 VFD-unresolved dev rows are counted under the control drawings or the schedule. There, the same default would give the right typical for 15:
    - 4 then match exactly;
    - 1 matches once the DoD answer is also given;
    - 10 still need a damper option from their control details.
  - **Pitfall:** the default gives the wrong typical for 031 WHSE-EF2. Its schedule prints SPEED CONTROL 'VARIABLE' in a column the normalizer does not read. So the default may apply only when the schedule has no speed column at all, never when a printed value was simply not extracted.
- **A candidate fifth question.** Should plumbing-service equipment (condensate, sump, DHW recirculation) count in the BAS scope?
  - It would settle federal CP-1…6: condensate pumps with packaged float control and no BMS point anywhere. Those rows are counted under "absence" above.
  - The answer is project-specific: bldg5406's DHW pump schedule prints "BMS CONTROLS".

## 3. The control-drawing rows (71), and whether the graph reaches them today

| Targeting today (`r2-targeting.mjs`) | Rows |
|---|---:|
| an L4.8 control schematic binds the tag to its schedule row | 18 |
| the tag is printed on a schematic but not bound to a row | 2 |
| only a schematic or sequence title names the unit's family (a "typical detail") | 18 |
| nothing | 33 |

**Only 18 of the 71 (25%) are bound today.** Targeting is the first bottleneck, before any reading. The evidence exists in all 71 cases, and each is in a vector PDF with a text layer. The 33 "nothing" rows fail for reasons deterministic code can fix:

- **Title forms L4.8 does not recognize.** Its title rule needs "CONTROL DIAGRAM", "CONTROL SCHEMATIC" or "SCHEMATIC". These titles are all in the text layer:
  - 040 M402: "UNIT HEATER CONTROL - HYDRONIC", "EXHAUST FAN CONTROL - AHU INTERLOCK - FAN-A", "…DISINFECTOR FAN CONTROL - FAN-B";
  - 094 M-201: "VARIABLE AIR VOLUME AHU-4, AHU-5 & AHU-8 CONTROLS", "CONSTANT VOLUME AHU-6 CONTROLS", "100% DEDICATED OUTDOOR AIR SYSTEM AHU-7 CONTROLS";
  - bldg5406 M-903/904: "EXHAUST FAN - ON/OFF (EF-1 THRU EF-3)", "VARIABLE AIR VOLUME TERMINAL UNIT (VAV-1 THRU VAV-9)".
- **Tag lists and ranges.** "AHU-4, AHU-5 & AHU-8" and "EF-1 THRU EF-3" name units without printing each tag.
- **Schedule cross-references.** 040's fan schedule CONTROL column holds "FAN-A" / "FAN-B", which is the suffix of the detail title. itd-d1-lab's heater remark 5 points to the M6.5 sequence.
- **Family-level typical details.** Titles such as "TOILET EXHAUST FANS - CONTROL DIAGRAM", "UNIT HEATER - CONTROL DIAGRAM" and "DX SPLIT SYSTEM - CONTROL DIAGRAM" apply to every unit of a type. The 18 "family title only" rows are these.
  - The attribute that picks between two typical details has to come from the schedule, for example hot water or electric.
- **Absence across a whole points schedule.** Federal CP-1…6 carry no BMS point on any controls sheet.
- **Drafting noise.** itd-d1-lab's heating-water schematic prints "BP-1" twice and never "BP-2".

**Side findings.**
- **Some control-drawing rows are also on the schedule.** 040 EF-1A's own row prints "BACKDRAFT DAMPER TYPE: MOTORIZED", yet the normalizer does not map it to `motorized_damper`.
- **Label traps.** 094's outside-air damper is labelled "SMOKE MODE OUTSIDE AIR". A word search for "SMOKE" would invent a smoke detector that the detail does not have.
- **AS-19's ceiling assumed single-unit I/O counts.** The earlier census counted schematics that bind one unit and print its I/O (3 dev units). Reading options from evidence bound through tag lists, ranges, cross-references and typical details does not need single-unit schematics, so AS-19 does not cap this approach.

## 4. Project facts in the text layer: why they are questions, not regexes

A marker count over the dev PDFs shows that the facts are often printed, but only noisily.

| Document | "no BAS" phrase | DoD marker hits | What the DoD hits actually are |
|---|---:|---:|---|
| 004 | 1 | 2 | "UFC 4-010-01" (antiterrorism site standard), not the controls UFC |
| baker-county-eoc | 1 | 1 | "UFC UNIFORM FIRE CODE" in the abbreviations |
| bldg5406 | 0 | 1 | "DMAFB, DAVIS MONTHAN" and "UNIFIED FACILITIES CRITERIA (UFC)" |
| federal-mech | 0 | 53 | Eglin AFB, UFC 3-410 references |

The facts are there, but a regex cannot decide them (L1). They become questions whose answer is pre-filled from this evidence: the estimator sees the quote and confirms or corrects it.

## 5. Disclosure

While checking how the DoD option is keyed, I ran a grep over every `*.typicals.csv` file, not just the dev ones. It printed one aggregate count from a held-out key: how many rows in one held-out document carry `ufc_minimum_points=true`. No held-out row or note was displayed, and that number is used nowhere in this research or the goal. Every script in `plans/05-research/pilot/` now reads only the frozen split's dev list and refuses anything else.
