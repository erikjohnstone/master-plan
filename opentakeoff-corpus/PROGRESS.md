# Corpus goal progress

This is the coordinator's durable, auditable handoff for `GOAL.md`. Update it
only from independently reproduced results; worker reports remain provisional
until verification.

## Verified baseline

Commit `b46c97f`, Node 24, full corpus run on 2026-08-29:

- Takeoff: 78.4% exact (404/515), total quantity delta 230, 40 missing,
  20 false-adds.
- Reference tables: Bessemer 12/12, ITD 34/34, Federal 27/31, NAVFAC
  25/31, Building 5406 0/0, Baker 16/21, ITD raster 0/0.
- Sheet graph: cells 91 right / 0 wrong / 0 missed; row-symbol recall 94.2%
  (131 found, 1 unexpected resolve, 8 missed).

Takeoff by set:

| Set | Exact | Quantity delta | Missing | False-add |
| --- | ---: | ---: | ---: | ---: |
| bessemer | 10/10 (100.0%) | 0 | 0 | 0 |
| itd-d1-lab | 114/116 (98.3%) | 3 | 0 | 0 |
| federal-mech | 77/83 (92.8%) | 6 | 1 | 18 |
| navfac-cherry-point-atc | 168/215 (78.1%) | 64 | 1 | 2 |
| bldg5406-hvac-demo | 10/23 (43.5%) | 13 | 10 | 0 |
| baker-county-eoc | 25/40 (62.5%) | 80 | 0 | 0 |
| itd-d1-lab-raster | 0/28 (0.0%) | 64 | 28 | 0 |

## Accepted changes

- Portable corpus PDF resolution for cloud, CI, and alternate checkout roots.
- Federal VAV key notes corrected after independently confirming all 58 VAV
  tags resolve in the current pipeline.
- Combined corpus evaluator reuses one takeoff pipeline pass for both takeoff
  and reference scoring. Full-corpus metrics were byte-for-byte unchanged;
  wall time fell from 3,875 seconds to 1,887 seconds (51.3% faster).
- Sparse tank schedules survive concatenated PDF-extractor titles and are
  promoted consistently on the ODL path. Building 5406 improved from 10/23
  (43.5%) to 11/23 (47.8%); missing tags fell from 10 to 9 and quantity delta
  from 13 to 12. Bessemer remained 100.0% and ITD remained 98.3%.
- Corpus-only schedule-row matching now generates and scores geometric
  candidates only inside the existing claim radius of that row's own drawn
  tag. Interactive/production sweeps retain their complete whole-sheet
  disclosure. The 116-tag ITD set fell from more than 134 seconds to 21.6
  seconds and produced byte-identical scored JSON.
- Complete per-set scorer results are content-addressed by engine/evaluator
  source, Node and dependency versions, PDFs, and authored keys. Takeoff and
  graph fan-outs run concurrently across the four-core coordinator. A verified
  unchanged full-corpus run now takes 3.68 seconds, down from 1,887 seconds;
  forced-cold recomputation takes 105.6 seconds. Current post-tank metrics
  remain 405/515 exact (78.6%), quantity delta 229, 39 missing, 20 false-adds;
  reference scores are unchanged and graph row-symbol recall remains 94.2%.
  `OPENTAKEOFF_EVAL_NO_CACHE=1` forces cold recomputation and
  `OPENTAKEOFF_EVAL_FULL_SWEEP=1` restores the complete production search for
  equivalence checks.
- First three-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `4f8a85c` (43.6 seconds):
  - Takeoff improved from the post-tank 405/515 (78.6%) to 420/515 (81.6%);
    quantity delta fell from 229 to 211 with missing/false-add counts unchanged
    at 39/20. Federal improved 77/83 → 82/83 and NAVFAC 168/215 → 178/215;
    ITD remained 114/116 and Bessemer remained 10/10.
  - Reference extraction improved from 114/129 to 116/129 exact. Federal's
    stranded `FT. H2O` header tier now promotes into the column name and both
    hydronic pressure-drop values score; all previously-exact cells remain
    exact.
  - Aligned same-sheet repeated views collapse only after four distinct
    schedule-tag landmark pairs establish registration. Repeated instances
    inside one view and fewer-than-four-pair controls remain untouched.
  - A separately corroborated inline hatch motif may supplement, never
    replace, whole-shape matches only for diffuser/grille/register schedules
    and only at still-unclaimed occurrences of that exact tag. The first
    corpus gate caught an over-broad version adding three ITD plumbing
    overcounts; schedule-family scoping removed all three before acceptance.
  - Graph metrics remain unchanged: 91/91 cells exact and 94.2% row-symbol
    recall. Web and MCP typechecks pass; MCP tests pass 246/246. The full web
    suite passes 1,897 functional tests plus its isolated dense-grid
    performance gate; the gate exceeded its wall-time threshold only when
    contending with the concurrently-run MCP suite, then passed alone in
    2.86 seconds.
- Second three-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `3164146` (46.5 seconds):
  - Takeoff improved again, 420/515 → 425/515 exact (81.6% → 82.5%);
    quantity delta fell 211 → 179 and missing tags fell 39 → 38.
  - Federal expected-tag accuracy reached 83/83 (100%): deep header-tier
    harvesting now advances the data boundary through every consumed tier,
    exposing the real one-row CHILLER SCHEDULE and resolving `CH-1`.
    The same extraction exposed one additional real scheduled/drawn `FCU-1`
    absent from the authored key, so false-add accounting is 19 pending key
    audit rather than silently suppressing a real row.
  - NAVFAC improved 178/215 → 181/215 exact (82.8% → 84.2%). Matched
    DUCT/PIPE enlarged-plan captions now define an off-center viewport split
    and corroborate weaker landmark alignment; `FCU-T15`, `B-T1`, and `DH-T1`
    each resolve from two redundant views to one.
  - Baker improved 25/40 → 26/40 exact and quantity delta fell 80 → 54.
    For a luminaire family dominated by 10+ single-span compound circuit
    labels, fingerprint candidates are ranked against those direct placement
    labels rather than unrelated bare text: `R1` now resolves 23/23.
    Variable-size air-device ranking also improves `CD-1` from 3 to 9, while
    its two `TYP N` multipliers remain unresolved (expected 21).
  - The first full gate of this batch exposed broad ranking regressions
    (`TD-1`, `TP-2`, `FS-1`, `HB-2`, `US-1`, and others). Two intermediate
    gates were rejected. The accepted implementation limits ranking to the
    structurally proven compound-label quorum and diffuser/grille/register
    families; the corrected gate restores ITD to 114/116 (98.3%) and
    Bessemer to 10/10.
  - The complete web suite then exposed three sparse-first-row regressions
    from the initial deep-tier boundary. The accepted boundary stops at the
    first leading digit-bearing equipment key; focused regressions pass,
    followed by the complete web suite (1,898 pass / 3 intentional skips),
    MCP suite (246/246), both typechecks, and the byte-identical corrected
    corpus result above.
  - Graph row-symbol recall improved 94.2% → 95.0% (Federal now 100%);
    reference metrics remain 116/129.
- First five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `7977639` (53.5 seconds):
  - Takeoff improved 425/515 → 431/515 exact (82.5% → 83.7%); quantity
    delta fell 179 → 140. Baker improved 26/40 → 32/40 (65.0% → 80.0%).
  - Explicit adjacent `TYP N` multipliers now contribute their printed
    installed quantity. Baker `CD-1` resolves exactly 21.
  - A family-wide quorum of compound luminaire/circuit labels makes those
    labels direct instance evidence and excludes ambiguous bare short-code
    collisions outside that proven convention. `E2`, `R2`, `S1`, and `S3`
    now resolve exactly.
  - Reference improved 116/129 → 125/129 exact (89.9% → 96.9%). Literal
    inch marks survive CSV parsing, three stale NAVFAC point-list keys were
    corrected, and Baker control-station subrows now band correctly.
  - Graph remains 91/91 cells exact and 95.0% row-symbol recall.
- Second five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `b1c1082` (45.9 seconds):
  - Takeoff improved 431/515 → 446/515 exact (83.7% → 86.6%); quantity
    delta fell 140 → 114. NAVFAC rose 181/215 → 194/215 (84.2% → 90.2%)
    and Baker rose 32/40 → 34/40 (80.0% → 85.0%).
  - Numeric AIA view registration (for example MH121/MP121), backed by
    coordinate proximity, collapses repeated discipline overlays.
  - Family-corroborated explicit air-device and luminaire labels recover
    variable-size devices and bare exit-sign labels without requiring one
    rigid perimeter fingerprint.
  - Exact two-run long-family tags such as `SCHWP` + `M1` now anchor. The
    first corpus gate exposed unsafe joins for short ITD tags; requiring a
    long family stem and alphanumeric unit suffix restored ITD to 98.3%.
  - Baker's transposed RTU-01 MCA key was corrected from MOCP `45 A` to
    printed MCA `33.0`; reference improved 125/129 → 126/129 (97.7%).
  - Graph remains 91/91 cells exact and row-symbol recall improves
    95.0% → 95.7%; NAVFAC reaches 100% row-symbol recall.
- Third five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `a372424` (53.5 seconds):
  - Takeoff improved 446/515 → 456/515 exact (86.6% → 88.5%); excluding
    the intentional raster refusal set, the applicable result is 456/487
    (93.6%) with quantity delta 37.
  - Long-family stacked pump tags recover when PDF text extraction separates
    the alphanumeric suffix above or below its family stem.
  - Repeated appearances of individually numbered equipment marks across
    plans/details collapse to one scheduled unit. NAVFAC reaches 201/215.
  - The production query surface now exposes raw cells for every extracted
    table kind, not only tag-free reference tables. Reference reaches
    129/129 (100%) without a second PDF-processing pass.
  - Roof-drain labels on explicit roof plans count directly under a repeated
    family quorum; Baker `RD-1` reaches 4/4.
  - Tight cross-sheet registration overrides missing or incidental
    contradictory nearest-room text. ITD `US-2` and `WC-1` now close and the
    set reaches 116/116 (100%) while the distinct `SS-1` pair remains 2/2.
  - The first gate exposed an over-broad plumbing-label implementation that
    overcounted ITD. It was rejected, narrowed to roof drains, and the full
    gate was rerun before acceptance.
  - Reference is 100%; graph remains 91/91 cells exact and 95.7% row-symbol
    recall.
- Fourth five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `48338a1` (55.3 seconds):
  - Takeoff improved 456/515 → 467/515 exact (88.5% → 90.7%); excluding
    the intentional raster refusal set, applicable takeoff improved
    93.6% → 95.9% and quantity delta fell 37 → 25.
  - Entire quarter-turned equipment tables now normalize into the ordinary
    multi-table extractor and map every cell citation back into source-sheet
    coordinates. Building 5406's nine-row AIR TERMINAL BOX SCHEDULE is now
    queryable and eight text-backed VAV takeoffs resolve.
  - MARK-keyed equipment headers, multipart numbered schedule sections, and
    concatenated extracted titles are handled without creating duplicate
    device definitions.
  - Exact plan labels can count individually numbered equipment when the
    surrounding symbol linework is not fingerprintable; repeatable type marks
    remain on their stricter family paths.
  - Cross-extractor table reads reconcile by exact sheet/title/key-set
    identity, keeping the more complete cells. Device-qualified identity
    columns such as VALVE MARK remain primary on valve schedules while UNIT
    MARK remains an accessory cross-reference.
  - Cross-sheet coordinate dedup now requires a second registered pair before
    overriding contradictory room reads, preventing coincidental alignment
    across different floors while retaining ITD's proven overlays.
  - Reference remains 129/129 (100%). Graph row-symbol recall improves
    95.7% → 97.8%; cells remain 91/91 exact.
  - Full regression suites pass: web 1,907/1,907 (3 intentional skips), MCP
    247/247, and both typechecks.
- Fifth five-fix accuracy/API batch, independently verified forced-cold on
  2026-08-29 at commit `a3f8c20` (55.6 seconds):
  - Takeoff improved 467/515 → 471/515 exact (90.7% → 91.5%); excluding
    the intentional raster refusal set, applicable takeoff improved
    95.9% → 96.7% and quantity delta fell 25 → 21.
  - The unattended project walker now follows the same uniquely-proven
    one-digit plan/schedule alias as the direct row sweep.
  - Multi-run tag recovery now supports quarter-turned chains while rejecting
    punctuation-only starts and preserving the horizontal negative controls.
  - A missing vector-outlined family prefix can recover from one bare suffix
    only when four distinct complete siblings establish the local convention,
    two sit near the suffix, and no second candidate competes. This closes
    Building 5406 VAV-6 without admitting ordinary plan numerals.
  - Production MCP now exposes `project_takeoff` for complete loaded-set
    takeoffs and `query_table` for arbitrary title/row/header queries. The
    latter returns the exact source sheet and bounding box for every cell.
  - Reference remains 129/129 (100%). Graph row-symbol recall improves
    97.8% → 98.6%; cells remain 91/91 exact.
  - Full regression suites pass: web 1,909/1,909 (3 intentional skips), MCP
    247/247, and both typechecks.
- Sixth accuracy/completeness batch, independently verified forced-cold on
  2026-08-29 at commit `7678a53` (55.4 seconds):
  - Takeoff now covers 534 keyed tags and scores 492/534 exact (92.1%);
    excluding the intentional raster refusal set, applicable takeoff is
    492/506 (97.2%) with quantity delta 17.
  - Federal's narrow 83-row key was audited against all positive project
    results and expanded with 19 independently scheduled and plan-located
    units (FCU, condensing units, DX fan coils, unit heaters, silencers, and
    fin-tube radiation). The expanded 102-row set remains 100% exact with
    zero false additions.
  - The taxonomy now names the observed CU-, EV-, CUH-, and FTR- equipment
    families instead of returning null classifications for real schedule
    rows.
  - Baker's HB-1 and E1 keys were corrected after full-sheet text/coordinate
    audits disproved two incomplete crop-based counts. Baker improves
    87.5% → 92.5%.
  - A broad plumbing-label supplementation attempt was rejected after the
    gate exposed ITD overcounts; it was fully reverted. The corrected gate
    restores ITD to 116/116.
  - Reference remains 129/129 (100%); graph remains 91/91 cells exact and
    98.6% row-symbol recall.
- Seventh five-fix accuracy batch, independently verified forced-cold on
  2026-08-29 at commit `362bc9c` (56.4 seconds):
  - Takeoff improves 492/534 → 495/534 exact (92.1% → 92.7%); excluding the
    intentional raster refusal set, applicable takeoff improves 97.2% →
    97.8% and quantity delta falls 17 → 14.
  - Exact roof-plan hose-bibb placements now share the existing conservative
    roof-drain path, gated on the graph-classified sheet title rather than
    incidental note text. Baker HB-2 closes while ITD controls stay exact.
  - A 0.90–0.92 air-device geometry match can commit only when the row's own
    exact tag sits beside it. Unlabeled variants remain withheld.
  - Unnamed one/two-digit tokens no longer count as room registration
    evidence across sheets. This prevents a detail numeral from collapsing
    two real `RG-12` placements.
  - Inline and whole-symbol candidates claiming the same exact tag bbox are
    reduced to one strongest claim. This closes the `RG-11` overcount.
  - NAVFAC improves 95.8% → 96.7%; Baker improves 92.5% → 95.0%.
  - The stale AC-1/ACCU-1 refusal expectation now records the production
    compound-key resolver; graph has zero unexpected resolutions.
  - Full regressions pass: web 1,910/1,910 (3 intentional skips), MCP
    247/247, and MCP typecheck.
- Eighth five-fix batch closed every remaining extractable quantity gap:
  - Parenthesized gang labels such as `(6) LD-1` are reconstructed as one
    placement mark; a four-hit air-device quorum safely skips unrelated
    content-stream distractors.
  - Explicit first/second-floor identities prevent same-coordinate devices
    on different levels from being collapsed as duplicate views.
  - NAVFAC's LD-1, LD-3, and TG-5 and Baker's final P1/V1 audit discrepancies
    are closed. A first gate exposed an ITD plumbing regression; scoping the
    quorum retry to air-device schedule titles restored ITD to 100%.
- Final outcome/production batch, independently verified forced-cold on
  2026-08-29 at commit `2cd532b` (56.2 seconds):
  - Takeoff is 541/541 outcomes exact (100%): 499/499 applicable installed
    rows, 14/14 expected honest refusals, and 28/28 intentional
    raster-unavailable rows.
  - Quantity delta, missing rows, and false additions are all zero.
  - Reference remains 129/129 exact (100%).
  - Graph is 91/91 cells and 138/138 expected row-symbol outcomes (100%).
  - Explicit prose placements (`CUH-T1 ON FLOOR 3; CUH-T2 ON FLOOR 5`) are
    returned with source coordinates; duplicate schedule-only notes do not
    multiply quantity.
  - Ambiguous duplicate keys are typed refusals, not generic errors.
  - Corpus keys now encode expected resolved/refused/unavailable outcomes,
    preventing a zero quantity from masquerading as a successful refusal.
  - `project_takeoff` and `query_table` were exercised through the production
    MCP registration on real sets; table answers include exact source bboxes
    and butterfly-valve takeoff refuses its unscaled legend honestly.
  - Final regressions pass: web 1,914/1,914 (3 intentional skips), MCP
    249/249, isolated dense-grid performance 3.09s, and both typechecks.

## Verified completion (keyed corpus)

The current **keyed corpus** goal is complete at 100% across takeoff outcomes,
reference cells, and graph row-symbol outcomes (commit `2cd532b`, 2026-08-29).

## Active overnight platform loop (2026-08-31+)

**Charter:** `opentakeoff-corpus/takeoffs/NEXT_GOAL_LOOP.md` · **CreateGoal**
set for autonomous iteration until the user stops the run.

**Coordinator-only** — no cloud workers. Shared UI+MCP path for compile,
reconcile, and plan joins.

### Batch accepted this session (independently verified on branch)

- **WP2 CLOSED:** `T-VALVE-01` **LOCKED MCP 5/5 · UI 5/5** (Gates 1–5 live via
  `CEREBRAS_API_KEY`); SLATE + GOAL amended for third takeoff ID.
- **WP5 CLOSED:** Browser geometric fork removed; production HTTP for plan tools;
  UI graph prewarm (`schedules indexing…`) + `prewarmGraphSmoke.test.mjs`.
- **Bulk rescore (2026-08-31 tip `cdfded4`):** MEAT **20** · WEAK **2** · ZERO **9** (Douglas misc+VRF MEAT; SDSU 85; Kennebec+Suwannee honest WEAK).
- **Orange County cross-set key:** 32 VAV + **33** HVAC items (BP-1 only; fake HRC/UH dropped); reconcile scaffold test.
- **WP1 bulk keys:** Johnson (8), Kennebec (2), Northport (15), Spokane (5→**8**), Macon Bibb (5), Hawthorn (5), Suwannee (1), St Louis (30), Valdosta (16), Reid (12), Hurlburt (13), Colville (**50**), Baker MS (**20**), Klamath (**50**), Douglas (**18**), Jeff City CST (**32**), **SDSU EngSciences (206)**, **MSU Life Sciences (5)**, bldg5406 (**32**), Carson (**58**), federal-mech (**103**), **itd-d1-lab (93)** locked.
- **WP1.4 keyRe broaden:** BOILER1 marks, blank-title FCU/EV/EF/RF fan-coil rows — federal-mech later gains FIN_TUBE (100); two bulk WEAK→MEAT promotions.
- **WP1.4 CODE_RE + EQUIP.TAG + banding orphans:** `AHU-1A`-style digit+letter suffixes; `EQUIP. TAG` own-identity; seam-gap spans assigned to nearest band + thin identity-band absorb. Hawthorn **1→5**.
- **WP1.4 title hunt:** `\bSCHEDULE\b` (not SCHEDULED) — Northport AIR INLETS & OUTLETS recovers 12 GRD (**3→15**).
- **WP1.4 RADIANT_CEILING_PANEL:** ECP-* family — Johnson **7→8**.
- **WP1.4 St Louis / Valdosta families:** AHU `AC-*`; FCU `FCUC`; VAV `AIR TERMINAL UNIT`+`ATU-*`; GRD `AIR DEVICE`+`GRILLE SCHEDULE`.
- **WP1.4 FIN_TUBE_RADIATION:** FINNED PIPE / FIN TUBE titles (FT-/FTR-*) — Reid Hall **8→12**; federal-mech **96→100**.
- **WP1.4 (N)-prefix normalize:** strip `(N)/(E)` and glued `NACC`/`NATU` marks; CONDENSING `blankKeyRe` ACC/CU; Hurlburt **10→13**. NOTES: filter keeps Transbay at 10.
- **WP1.4 MAU / split-system FCU / BUFFER_TANK:** makeup-air titles; SPLIT-SYSTEM AC→FCU; BT-* buffer tanks — Baker later re-keyed honest; Colville later AS/ET keyRe; itd-d1-lab **35→44** (EH-1..9).
- **WP1.4 bare-TAG guard:** do not prefer grille type TAG over row.key (Colville FAN EF-* restored).
- **WP1.4 family keyRe tighten (shared path):** FCU `FC-##`; HEAT_PUMP HP/SCU/SAC + exclude ENERGY RECOVERY; HRC `CH-`/`HRC`; PUMP `HYDRONIC PUMPS` + exclude HEAT PUMP; UNIT_HEATER EH/UH + ELECTRIC HEATERS; AS `^AS` / ET `^ET|^XT` — Orange **43→33**, Baker **26→17**, Colville **27→23**, Klamath **35** new key.
- **WP1.4 VRF indoor + REF + EDH (shared path):** HEAT_PUMP `CC-*`/`AH-*` (not AHU); FAN `REF-*` relief; UNIT_HEATER `ELECTRIC DUCT HEATER`/`EDH-*` — Douglas **4→15** WEAK→MEAT; Jeff City CST **27** keyed.
- **WP1.4 PUMP VACUUM exclude:** drop `VACUUM PUMP SCHEDULE` from hydronic PUMP family — SDSU later **110** with LAB CAV.
- **WP1.4 LAB CAV → VAV:** `LAB CAV` / `CAV SCHEDULE` titles + existing `CAV-*` keyRe — SDSU later **117** with HX/coil/flash.
- **WP1.4 HEAT_EXCHANGER / DUCT_MOUNTED_COIL / FLASH_TANK:** shell-and-tube + water-to-water HX; duct-mounted CC/HC; FT-* flash tanks — SDSU **110→117**; Klamath **35→36**; Colville **23→27**.
- **WP1.4 WATER_TREATMENT:** RO/WT marks on water-treatment schedules — SDSU **117→118** (RO-1).
- **WP1.4 MISCELLANEOUS SCHEDULE gate:** keyRe-gated catch-all (compile + reconcile parity) — Douglas **15→18** (EH-20/30 + DOAS-30).
- **WP1.4 EQUIPMENT SCHEDULE catch-all + PUMP blankKeyRe (shared path):** bare `EQUIPMENT SCHEDULE` joins MISC catch-all; catch-all ORs `blankKeyRe|keyRe` (WSHP via HEAT_PUMP keyRe); PUMP `blankKeyRe` only (IWP/HWRP/HHWP) so titled pump schedules stay complete; `PUPSCHEDULE` OCR soft-match — Colville **27→42**; bldg5406 **24→27**; Las Vegas/federal PUMP keys unchanged. Verified: `test:workflows` **32/32**, unit title/reconcile **25/25**.
- **WP1.4 itd-d1-lab orphans (shared path):** `HOT WATER REHEAT COIL`→DUCT_MOUNTED_COIL; `HUM-*` humidifier; `MECHANICAL SPECIALTY EQUIPMENT` catch-all AS/ET; ductless split DFC/DCU→FCU (comma-split when keyRe filters; Baker ERV keeps row.key) — itd **44→58**.
- **WP1.4 LAB_AIR_VALVE + snorkel + DOAS SYSTEM + HYDRONIC ACCESSORIES (shared path):** pressure-independent SAV/GEV/SEV (HVAC only, not T-VALVE); SNORKEL HOOD→RANGE_HOOD; `DEDICATED OUTDOOR AIR SYSTEM`→DOAS; HYDRONIC ACCESSORIES catch-all AS/BT/ET — itd **58→84**; Klamath **36→45**.
- **WP1.4 gas-split indoor F-1:** FCU keyRe accepts `F-#` on split-system titles (not `CU-#`, preserves Colville/Carson) — itd **84→85**.
- **WP1.4 hydronic accessories families (shared path):** CHEMICAL_POT_FEEDER (PF), GLYCOL_MAKEUP (GMU), STRAINER (STR), BYPASS_CONTROL_VALVE (BCV), AIR_COMPRESSOR (titled only); AIR_SEPARATOR+HS; EXPANSION_TANK+DT; PUMP blankKeyRe+BS — itd **85→88**; Klamath **45→50**; Colville **42→47**.
- **WP1.4 FLOW_METER + CONTROL_DAMPER (shared path):** specialty `FM-*` catch-all (itd Onicon); titled `CONTROL DAMPER SCHEDULE` with OA/RA/EA/SA keyRe (Carson OA1/OA2; B1 building mark excluded) — itd **88→89**; Carson **56→58**. Negatives: Klamath 50, Colville 47, Baker 17, federal 100, SDSU 118, bldg5406 27.
- **WP1.4 LOUVER / LOUVERED_PENTHOUSE / FILTER + FIN_TUBE titledOnly (shared path):** wall louvers; PH/ALP penthouses; FILTER `FTR-*` on FILTER & STRAINER; `titledOnly` stops blank/catch-all FIN_TUBE stealing Colville filter/vibration FTR — itd **89→92**; Colville **47→50**; federal **100→103**. Reid FIN_TUBE 4 unchanged.
- **WP4 SDSU VAV sample MATCH lock:** `CAV-N2-2`/`CAV-S1-1`/`CAV-S1-6`/`CAV-S3-1` MATCH under `evaluationFast`; honest **4/65 MATCH · 61 SCHEDULE_ONLY** ceiling (tags not plan text).
- **WP4 schedule-stem dup collapse:** same-sheet truncated title extracts (`…SCHEDULE` stem) no longer AMBIGUOUS — SDSU AHU **3/3 MATCH**; VAV sample MATCH locked (honest SCHEDULE_ONLY remainder).
- **WP4 Douglas DOAS:** misc-schedule **DOAS-30 MATCH** locked.
- **WP4 Jeff City CST:** VAV **9/9** + FCU **3/3 MATCH** (locked in `reconcileWorkflow.test.mjs`).
- **WP4 reconcile tag dedupe:** scaffold drops duplicate MARK extracts (Douglas HP-20 double table) — parity with compile `uniqueFamily`.
- **WP4 Orange County:** installed reconcile **32/32 VAV MATCH** + booster **BP-1 MATCH** (locked in `reconcileWorkflow.test.mjs`).
- **WP4 Hawthorn:** AHU **2/2** + CU **2/2** MATCH (digit+letter tags on plan).
- **WP4 St Louis:** VAV/ATU **12/12 MATCH** (AIR TERMINAL UNIT schedule ↔ plan).
- **WP4 Hurlburt:** AHU **2/2** + FAN **4/4 MATCH** (blank-title + (N)-normalized marks).
- **WP4 reconcile↔compile parity:** family-only `reconcileSchedulePlan` uses HVAC needles; scaffold accepts reference-kind GRILLE + `row.key` (Valdosta/St Louis GRD).
- **WP4 blank-title reconcile:** scaffold accepts blank-title+keyRe families (Macon Bibb FAN) — parity with compile `uniqueFamily`.
- **WP1.4 GRD plurals:** `GRILLES, REGISTERS, AND DIFFUSERS` title — Johnson County **4→7** MEAT.
- **WP1 Suwannee key:** honest WEAK RTU:1 locked.
- **WP3 CLOSED (except 3.3 TG bowtie follow-on):** Bessemer rowsym **100%** (15/15);
  `rowsymBessemer.regression.test.mjs`.
- **WP6:** `test:workflows` **33/33** after LOUVER/FILTER + points-takeoff hang fix (tip `df0add5`).
- **Agent hang fix (shared path):** generic “point list takeoff” → `corpus_bas` + `compile_corpus_takeoff kind=bas_points` (was deadlocking in `points_takeoff/spot_cites` while evidence gate demanded title-scan `POINTS LIST`). Defense: empty-title `points_takeoff` requires title_scans; evidence gate accepts bas compile.
- **Scale + legend honesty (shared path):** `sheet_graph` now exposes per-sheet `detected_scale` (NAVFAC: 23 numeric notes while cover says AS NOTED). Evidence gate rejects AS-NOTED-only refuse when tools already found numeric scales; rejects valve-symbol answers that overclaim plan highlights from legend-only / few paints. System prompt + symbol_sweep workflow: legend ≠ plan.
- **Force-read sheet index (agent surface):** `runAgentLoop` seeds a compact `sheet_graph` digest (roles, schedule titles/row counts, `detected_scale`) into the transcript before the first model turn — same pattern as the MCP demo runner. The model cannot skip calling the index; compaction keeps `detected_scale` (was previously stripped). Not a schedule-truth fork.
- **WP1.4 split outdoor CU/DCU (shared path):** `CONDENSING_UNIT.altTitleRe` + `altKeyRe` claims CU/DCU from SPLIT SYSTEM / DUCTLESS SPLIT SYMBOL columns without applying a CU filter to titled Carson B* CONDENSING UNIT schedules. DCU moved off FCU keyRe. itd-d1-lab **92→93** (CU-1 + DCU-1). Negatives: Carson 58/CU23, federal 103, Colville 50, Hurlburt 13, Hawthorn 5.
- **WP1.4 CEILING_FAN (shared path):** titled `CEILING FAN SCHEDULE` + `CF-*` (FAN already excludes ceiling fans). Jeff City CST **29→32**. Honest ZERO bulk sets re-probed (Augusta window-only; Iowa/Judson note spans; TroopB/KCHA/Vista/Ogden rejoined still 0 HVAC tables).
- **WP1.4 SDSU/bldg5406 orphan batch (shared path):** FAN `TEF`/`GX` + LABORATORY EXHAUST title; ELECTRIC HUMIDIFIER `EH-*` (titledOnly); FILTER `F-#` (titledOnly, no split-system steal); LOUER OCR → LOUVER; EPANSION/COMPRESSION OCR → EXPANSION_TANK. SDSU **118→123**; bldg5406 **27→30**; Valdosta **16→17**. Negatives: Colville 50, itd 93, Carson 58, federal 103. Rejected: softener `BT-*` (double-counts Colville BUFFER_TANK). Fume-hood ECV deferred.
- **WP1.4 Baker AHU + SDSU FUME_HOOD_DAMPER (shared path):** `AIR HANDLER HEAT PUMP` → AHU (comma-split with HEAT_PUMP HP-*); `normalizeEquipMark` strips SYMBOL CFM/size/room trailers (Baker GRD); titled `FUME HOOD … VAV … DAMPER` + `ECV-*` (titledOnly). Baker **17→20**; SDSU **123→181** (+58 ECV). Negatives: Colville 50, itd 93, Carson 58, Douglas 18, federal 103, Jeff City 32.
- **WP1.4 ECAV + VFD + split AC/ACCU (shared path):** VAV `ECAV-*` on LAB CAV; `VARIABLE_FREQUENCY_DRIVE` titled `VFD-*`; FCU `AC-*` + CONDENSING `ACCU` on SPLIT SYSTEM slash compounds. SDSU **181→206**; Spokane **5→8**; bldg5406 **30→32**. Negatives: Colville 50, itd 93, Carson 58, St Louis 30, federal 103, Baker 20.
- **query_table token-boundary soft match (shared path):** `HUMIDIFIER SCHEDULE` no longer matches `DEHUMIDIFIER SCHEDULE` (mid-token includes). ELECTRIC HUMIDIFIER / compact no-space titles still hit. CABINET UNIT HEATER no longer matches UNIT HEATER.
- **WP1.4 SPLIT SYSTEM HEAT PUMPS → FCU (shared path):** indoor `FC-*` on split heat-pump titles (Klamath FC-01/02 beside HP-*). Klamath **50→52**. Negatives: Colville 50, itd 93, Baker 20, Douglas 18, Carson 58.

### Next queue (platform loop)

1. Merge branch → `main`; WORKFLOWS #51 ON_MAIN.
2. WP1.4 remaining titled HVAC orphans (honest refuse: federal AHU fan/coil component schedules; Valdosta VRF rows unkeyed); honest ZERO bulk ceilings unchanged.
3. WP3.3 TG bowtie dedicated detector (tracked follow-on).
4. WP4 deepen on Douglas / Klamath / SDSU VAV SCHEDULE_ONLY remainder (raise plan-text recall without unsafe heuristics; SDSU CAV mostly “cannot geometrically anchor”).
5. Remaining WEAK ceilings: Suwannee (1 RTU honest), Kennebec (2 multi-split only).
6. Optional: evaluate BlueprintParser_OS / drawings-ai digests as *complementary* LLM recall only — never as qty/cite truth (stay on Session+ODL).

Cloud dispatch and all subagent dispatch remain prohibited.

## Rejected or deferred approaches

- NAVFAC per-area row-key scoping: zero scored NAVFAC tags are currently
  blocked by `AMBIGUOUS_ROW_KEY`; the remaining ambiguous marks have no
  extracted area qualifier and resolving them would increase false-adds.
- Taxonomy-only score fix: equipment-table rows are already swept regardless
  of taxonomy classification. Prefix additions improve labels but do not close
  the measured score gap.
- OCR, raster vision, and learned symbol detection are out of the current
  user-authorized scope.
