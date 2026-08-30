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
| 4 | Named multi-list points takeoff | Takeoff POINTS LIST … + DDC lists: row counts + AI/AO/BI/BO | `points_takeoff` | D10 | ROUTING |
| 5 | FCU / fan-coil cross-building split | How many FCUs across buildings; compare fan-coil quantities by building | `fcu_buildings` | D08 | PROVEN |
| 6 | Valve schedule + plan join | Take off CONTROL VALVE SCHEDULE + installed plan qty for CV-n | `valve_join` | D06 | ROUTING |
| 7 | Equipment schedule family rollup | How many VAVs on the volume control box schedule + attributes | `equipment_schedule` | D04 | ROUTING |
| 8 | Room ↔ HVAC coordination | Room-oriented HVAC package: finishes + diffusers + serving RTU | `room_coordination` | D09 | ROUTING |
| 9 | BAS point → equipment → location | Trace AHU point from points list to unit location | `bas_point_trace` | D02 | ROUTING |
| 10 | Chiller / equipment plan → schedule → valve | Find CH-n; capacity + matching CHW valve | `equipment_plan_join` | D01 | ROUTING |
| 11 | Project HVAC+BAS rollup (named families) | Full HVAC/BAS takeoff across buildings with cited MARKs | `project_takeoff` | D03 | ROUTING |
| 12 | RTU mech ↔ electrical connection | Packaged rooftop + connection schedule join | `cross_discipline_join` | D05 | ROUTING |
| 13 | VAV schedule ↔ plan link + honest refuse | VAV tags on plan; EF tags refuse when not drawn | `plan_link_refuse` | D07 | ROUTING |
| 14 | Single schedule title-scan count | How many rows on \<SCHEDULE TITLE\> | `equipment_schedule` + title needle | — | ROUTING |
| 15 | Single MARK schedule attributes | Give CFM/GPM/… for TAG-n from its schedule | `equipment_schedule` | — | ROUTING |
| 16 | Building-split any equipment family | Split AHU/VAV/FCU counts by building prefix | `fcu_buildings` / title-scan building_tag_counts | — | ROUTING |
| 17 | CHW-only valve takeoff | Complete chilled-water control valve takeoff | `corpus_valves` + `service=CHW` | T-VALVE-01 filter (64) | PROVEN |
| 18 | HHW-only valve takeoff | Complete hot-water control valve takeoff | `corpus_valves` + `service=HHW` | T-VALVE-01 filter (99) | PROVEN |
| 19 | Bypass valve schedule takeoff | BYPASS CONTROL VALVE SCHEDULE counts + attrs | `valve_join` | — | ROUTING |
| 20 | Pump schedule takeoff | Pump schedule counts + GPM/head | `equipment_schedule` + suggested titles | — | ROUTING |
| 21 | Boiler schedule takeoff | Boiler schedule totals + capacity | `equipment_schedule` + suggested titles | — | ROUTING |
| 22 | Chiller schedule takeoff | Air-cooled / heat-recovery chiller counts | `equipment_schedule` + suggested titles | — | ROUTING |
| 23 | AHU schedule takeoff | AHU schedule totals + CFM | `equipment_schedule` + suggested titles | — | ROUTING |
| 24 | DOAH / DOAS schedule takeoff | Dedicated outdoor-air unit schedules | `equipment_schedule` + suggested titles | — | ROUTING |
| 25 | Fan schedule takeoff | Exhaust/supply fan schedule + plan refuse | `equipment_schedule` / `plan_link_refuse` | — | ROUTING |
| 26 | Diffuser / grille schedule takeoff | Diffuser-grille schedule attrs | `equipment_schedule` + suggested titles | — | ROUTING |
| 27 | Humidifier / dehumidifier takeoff | Humidity equipment schedules | `equipment_schedule` + suggested titles | — | ROUTING |
| 28 | CRAH / computer-room unit takeoff | CRAH schedule | `equipment_schedule` + suggested titles | — | ROUTING |
| 29 | Unit heater / CUH takeoff | Unit heater + cabinet unit heater | `equipment_schedule` + suggested titles | — | ROUTING |
| 30 | Air separator / expansion tank takeoff | Hydronic accessories as scheduled | `equipment_schedule` + suggested titles | — | ROUTING |
| 31 | Single POINTS LIST title-scan | Row count + AI/AO/BI/BO for one named list | `points_takeoff` (≥1 title) | D10 subset | ROUTING |
| 32 | Points list MARK cite spot-check | query_table row_key + highlight | points_takeoff | — | TODO |
| 33 | Non-extractable points list disclose | Title present but typed rows unavailable — honest disclose | bas compile exclusions | — | TODO |
| 34 | Empty-page accounting (HVAC) | Sheets with no HVAC schedule equipment | corpus compile `page_accounting` | T-HVAC-01 | PROVEN |
| 35 | Empty-page accounting (BAS) | Sheets with no points/DDC lists | corpus compile `page_accounting` | T-BAS-01 | PROVEN |
| 36 | Schedule title region cite | Paint whole schedule table from title bbox | highlight_citation | — | TODO |
| 37 | Installed plan quantity via tagged sweep | sweep_schedule_row for MARK | sweep | — | TODO |
| 38 | Symbol sweep from seed | Find every instance of a plan symbol | symbol_sweep | — | TODO |
| 39 | Valve↔equipment connectivity walk | Trace drawn pipe from valve to equipment | connectivity | — | TODO |
| 40 | Scale / unscaled honest refusal | Refuse installed qty when sheet unscaled | refuse path | — | TODO |
| 41 | Exploded-text / vector-path-only refuse | Refuse when tag not drawable text | refuse path | D07 | TODO |
| 42 | Zero-padded tag join | RTU-1 ↔ 001 forms across schedules | resolve_tag / join | D05 | TODO |
| 43 | Continuation-page dedupe | 1 OF 2 / 2 OF 2 must not double-count MARKs | query_table | — | TODO |
| 44 | Export CSV / Excel / PDF takeoff | Download finished takeoff workbook | Takeoff panel | T-* | TODO |
| 45 | Workflow data vs Takeoff tab honesty | Exploratory evidence stays on Workflow data | TakeoffDataPanel | — | TODO |
| 46 | Multi-prompt phrase variants (HVAC) | ≥5 phrasings → same compile | corpus_hvac | T-HVAC-01 | PROVEN |
| 47 | Multi-prompt phrase variants (BAS) | ≥5 phrasings → same compile | corpus_bas | T-BAS-01 | PROVEN |
| 48 | Multi-prompt phrase variants (valves) | ≥5 phrasings → same compile | corpus_valves | T-VALVE-01 | PROVEN |
| 49 | Follow-up cite after takeoff | Spot-check MARK without destroying locked lines | agent loop | — | TODO |
| 50 | Suite regression gate | Engine demos + golden verify + fixture proofs stay green; never ship N if 1…N−1 regress | `npm run test:demos` (cacache sheet-graph; warm ~30s) + `test:workflows` cross-corpus compiles + web fixture proofs | D01–D10 + T-* + multi-set PDFs | PROVEN |

**Progress:** count `PROVEN` + `ON_MAIN` toward 50. Re-open a row if it regresses.
**Tests always:** every PROVEN/ON_MAIN row must keep automated coverage; suite
gate (#50) must stay green as the inventory grows.
