# Production workflow inventory (~50 intent-matched)

Living catalog for the **platform harden** mandate in `takeoffs/GOAL.md`.
Target: **~50 genuine production-ready** estimator chat workflows.

**Definition of done (each row):**
1. Intent-matched + **phrase-robust** in `takeoffWorkflow.js` (general patterns — not set titles).
2. Shared UI+MCP path (compile / tools / Takeoff) — scrap ≠ Takeoff tab.
3. Contractor columns + honest cites.
4. Automated (+ Agent UI where chat-facing) proof on a corpus **fixture**.
5. **Merged to `main`** when genuinely complete.

**Statuses:** `TODO` · `ROUTING` · `PROVEN` · `ON_MAIN`

Fixture counts (396 / 122 / 163, building names, schedule titles) are
**acceptance checks only** — never product special cases.

| # | Intent family | Example phrasings (non-exhaustive) | Durable path | Fixture proof | Status |
|---|---|---|---|---|---|
| 1 | Complete HVAC equipment takeoff | complete HVAC equipment takeoff of this set; full equipment quantity takeoff on these drawings | `corpus_hvac` → `compile_corpus_takeoff` | T-HVAC-01 (396) | ON_MAIN |
| 2 | Complete BAS / DDC points takeoff | complete BAS points takeoff of this set; full DDC points takeoff on these drawings | `corpus_bas` → compile | T-BAS-01 (122) | ON_MAIN |
| 3 | Complete control-valve takeoff | complete valve takeoff; complete control valve takeoff on this blueprint set | `corpus_valves` → compile; Takeoff UI: Building · CHW/HHW + Unit Mark + whole-row cites | T-VALVE-01 (163) | ON_MAIN |
| 4 | Named multi-list points takeoff | Takeoff POINTS LIST … + DDC lists: row counts + AI/AO/BI/BO | `points_takeoff` | D10 engine+golden+follow-up 24/24/14 | ON_MAIN |
| 5 | FCU / fan-coil cross-building split | How many FCUs across buildings; compare fan-coil quantities by building | `fcu_buildings` | D08 | ON_MAIN |
| 6 | Valve schedule + plan join | Take off CONTROL VALVE SCHEDULE + installed plan qty for CV-n | `valve_join` | D06 engine+sweep | ON_MAIN |
| 7 | Equipment schedule family rollup | How many VAVs on the volume control box schedule + attributes | `equipment_schedule` | D04 engine+golden | ON_MAIN |
| 8 | Room ↔ HVAC coordination | Room-oriented HVAC package: finishes + diffusers + serving RTU | `room_coordination` | D09 engine+golden | ON_MAIN |
| 9 | BAS point → equipment → location | Trace AHU point from points list to unit location | `bas_point_trace` | D02 engine+golden | ON_MAIN |
| 10 | Chiller / equipment plan → schedule → valve | Find CH-n; capacity + matching CHW valve | `equipment_plan_join` | D01 engine+sweep | ON_MAIN |
| 11 | Project HVAC+BAS rollup (named families) | Full HVAC/BAS takeoff across buildings with cited MARKs | `project_takeoff` | D03 engine+golden | ON_MAIN |
| 12 | RTU mech ↔ electrical connection | Packaged rooftop + connection schedule join | `cross_discipline_join` | D05 engine+golden | ON_MAIN |
| 13 | VAV schedule ↔ plan link + honest refuse | VAV tags on plan; EF tags refuse when not drawn | `plan_link_refuse` | D07 engine+refuse | ON_MAIN |
| 14 | Single schedule title-scan count | How many rows on \<SCHEDULE TITLE\> | `equipment_schedule` + title needle | suggestedScheduleTitles + D04 | ON_MAIN |
| 15 | Single MARK schedule attributes | Give CFM/GPM/… for TAG-n from its schedule | `equipment_schedule` | D04/D08 attrs | ON_MAIN |
| 16 | Building-split any equipment family | Split AHU/VAV/FCU counts by building prefix | `fcu_buildings` / title-scan building_tag_counts | D08 building_tag_counts | ON_MAIN |
| 17 | CHW-only valve takeoff | Complete chilled-water control valve takeoff | `corpus_valves` + `service=CHW` | T-VALVE-01 filter (64) | ON_MAIN |
| 18 | HHW-only valve takeoff | Complete hot-water control valve takeoff | `corpus_valves` + `service=HHW` | T-VALVE-01 filter (99) | ON_MAIN |
| 19 | Bypass valve schedule takeoff | BYPASS CONTROL VALVE SCHEDULE counts + attrs | `valve_join` | D06 BCV | ON_MAIN |
| 20 | Pump schedule takeoff | Pump schedule counts + GPM/head | `equipment_schedule` + suggested titles | T-HVAC-01 PUMP (26) + intent/title needles | ON_MAIN |
| 21 | Boiler schedule takeoff | Boiler schedule totals + capacity | `equipment_schedule` + suggested titles | T-HVAC-01 BOILER (6) + intent/title needles | ON_MAIN |
| 22 | Chiller schedule takeoff | Air-cooled / heat-recovery chiller counts | `equipment_schedule` + suggested titles | D01 chiller schedule | ON_MAIN |
| 23 | AHU schedule takeoff | AHU schedule totals + CFM | `equipment_schedule` + suggested titles | D02 AHU schedule | ON_MAIN |
| 24 | DOAH / DOAS schedule takeoff | Dedicated outdoor-air unit schedules | `equipment_schedule` + suggested titles | T-HVAC-01 DOAH_UNIT (3) + D03 | ON_MAIN |
| 25 | Fan schedule takeoff | Exhaust/supply fan schedule + plan refuse | `equipment_schedule` / `plan_link_refuse` | D07 FAN SCHEDULE | ON_MAIN |
| 26 | Diffuser / grille schedule takeoff | Diffuser-grille schedule attrs | `equipment_schedule` + suggested titles | T-HVAC-01 GRD (30) + D09 | ON_MAIN |
| 27 | Humidifier / dehumidifier takeoff | Humidity equipment schedules | `equipment_schedule` + suggested titles | T-HVAC-01 HUMIDIFIER (12) | ON_MAIN |
| 28 | CRAH / computer-room unit takeoff | CRAH schedule | `equipment_schedule` + suggested titles | T-HVAC-01 CRAH (6) | ON_MAIN |
| 29 | Unit heater / CUH takeoff | Unit heater + cabinet unit heater | `equipment_schedule` + suggested titles | T-HVAC-01 UH (6) + CUH (5) | ON_MAIN |
| 30 | Air separator / expansion tank takeoff | Hydronic accessories as scheduled | `equipment_schedule` + suggested titles | T-HVAC-01 AS (6) + ET (4) | ON_MAIN |
| 31 | Single POINTS LIST title-scan | Row count + AI/AO/BI/BO for one named list | `points_takeoff` (≥1 title) | D10 subset + unit test | ON_MAIN |
| 32 | Points list MARK cite spot-check | query_table row_key + highlight | points_takeoff | D10 AI07/AI10/AO01/BI02 | ON_MAIN |
| 33 | Non-extractable points list disclose | Title present but typed rows unavailable — honest disclose | bas compile exclusions | T-BAS-01 exclusions + extractable-only lists | ON_MAIN |
| 34 | Empty-page accounting (HVAC) | Sheets with no HVAC schedule equipment | corpus compile `page_accounting` | T-HVAC-01 | ON_MAIN |
| 35 | Empty-page accounting (BAS) | Sheets with no points/DDC lists | corpus compile `page_accounting` | T-BAS-01 | ON_MAIN |
| 36 | Schedule title region cite | Paint whole schedule table from title bbox | highlight_citation / `familyTableCite` | T-HVAC-01 `table_bbox_px` + familyTableCite | ON_MAIN |
| 37 | Installed plan quantity via tagged sweep | sweep_schedule_row for MARK | sweep | D01/D06 sweeps | ON_MAIN |
| 38 | Symbol sweep from seed | Find every instance of a plan symbol | `symbol_sweep` intent → tool | MCP symbol_sweep fixtures + intent/phase lock | ON_MAIN |
| 39 | Valve↔equipment connectivity walk | Trace drawn pipe from valve to equipment | `connectivity` → `trace_connectivity` | MCP mep fixtures + intent/phase lock | ON_MAIN |
| 40 | Scale / unscaled honest refusal | Refuse installed qty when sheet unscaled | `scale_refuse` + scaleRefuseMessage | MCP unscaled refuse + message contract | ON_MAIN |
| 41 | Exploded-text / vector-path-only refuse | Refuse when tag not drawable text | refuse path | D07 EF-2/EF-3 | ON_MAIN |
| 42 | Zero-padded tag join | RTU-1 ↔ 001 forms across schedules | resolve_tag / join | D05 RTU-01 | ON_MAIN |
| 43 | Continuation-page dedupe | 1 OF 2 / 2 OF 2 must not double-count MARKs | query_table + HVAC compile | DOAH continuation unique MARK lock | ON_MAIN |
| 44 | Export CSV / Excel / PDF takeoff | Download finished takeoff workbook | Takeoff panel | agentTakeoff csv/xlsx/pdf | ON_MAIN |
| 45 | Workflow data vs Takeoff tab honesty | Exploratory evidence stays on Workflow data | TakeoffDataPanel | scrap≠Takeoff lines tests | ON_MAIN |
| 46 | Multi-prompt phrase variants (HVAC) | ≥5 phrasings → same compile | corpus_hvac | T-HVAC-01 | ON_MAIN |
| 47 | Multi-prompt phrase variants (BAS) | ≥5 phrasings → same compile | corpus_bas | T-BAS-01 | ON_MAIN |
| 48 | Multi-prompt phrase variants (valves) | ≥5 phrasings → same compile | corpus_valves | T-VALVE-01 | ON_MAIN |
| 49 | Follow-up cite after takeoff | Spot-check MARK without destroying locked lines | agent loop | D10 follow-up intent lock | ON_MAIN |
| 50 | Suite regression gate | Engine demos + golden verify + fixture proofs stay green; never ship N if 1…N−1 regress | `npm run test:demos` (cacache sheet-graph; warm ~30s) + `test:workflows` cross-corpus + web fixtures | D01–D10 + T-* + multi-set PDFs | ON_MAIN |

**Progress:** count `PROVEN` + `ON_MAIN` toward 50. Re-open a row if it regresses.
**Tests always:** every PROVEN/ON_MAIN row must keep automated coverage; suite
gate (#50) must stay green as the inventory grows.

**2026-08-30:** Inventory rows #1–#50 are on `main` with durable intent +
fixture/demo coverage (cacache `test:demos`, schedule-family title needles,
symbol_sweep/connectivity/scale_refuse intents, Building · valve Takeoff,
compile progress walkthrough). Re-open any row that regresses.
