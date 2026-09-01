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

**Bulk corpus in scope:** Vol1 (`bulk/HVAC_BAS_Plan_Sets`, ~30) **+ Vol2
entirety** (`bulk/HVAC_BAS_Plan_Sets_Vol2`, **all 82** INDEX sets — see
`GOAL.md` §8 and `takeoffs/VOL2_INTAKE.md`).

**Coordinator-only** — no cloud workers. Shared UI+MCP path for compile,
reconcile, and plan joins.

### Batch accepted this session (independently verified on branch)

- **WP2 CLOSED:** `T-VALVE-01` **LOCKED MCP 5/5 · UI 5/5** (Gates 1–5 live via
  `CEREBRAS_API_KEY`); SLATE + GOAL amended for third takeoff ID.
- **WP5 CLOSED:** Browser geometric fork removed; production HTTP for plan tools;
  UI graph prewarm (`schedules indexing…`) + `prewarmGraphSmoke.test.mjs`.
- **Bulk rescore (2026-08-31 tip `cdfded4`):** MEAT **20** · WEAK **2** · ZERO **9** (Douglas misc+VRF MEAT; SDSU 85; Kennebec+Suwannee honest WEAK).
- **Orange County cross-set key:** 32 VAV + **33** HVAC items (BP-1 only; fake HRC/UH dropped); reconcile scaffold test.
- **WP1 bulk keys:** Johnson (8), Kennebec (2), Northport (**16**), Spokane (5→**8**), Macon Bibb (5), Hawthorn (5), Suwannee (1), St Louis (30), Valdosta (16), Reid (12), Hurlburt (13), Colville (**50**), Baker MS (**21**), Klamath (**53**), Douglas (**18**), Jeff City CST (**32**), **SDSU EngSciences (208)**, **MSU Life Sciences (5)**, bldg5406 (**32**), Carson (**58**), federal-mech (**103**), **itd-d1-lab (93)** locked.
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
- **WP4 SDSU VAV sample MATCH lock:** CAV sample + floor ECAV (`N1/N2/S*`) MATCH under `evaluationFast`; basement ECAV NB/SB honest SCHEDULE_ONLY (full ECAV **16/25 MATCH**).
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
- **WP4 SDSU ECAV reconcile sample:** plan-drawn floor ECAV (`N1/N2/S*`) MATCH locked with CAV sample; basement `ECAV-NB-1` swept negative → SCHEDULE_ONLY. Full ECAV census **16/25 MATCH · 9 SO** under `evaluationFast`.
- **WP1 honest ZERO bulk keys:** Ogden, TroopB, Augusta, Iowa State, Vista, Judson, KCHA, JPS, weld-mech — compile totals **0** locked (no silent HVAC inflation). Re-probed 2026-08-31.
- **WP4 Spokane VFD reconcile:** all 3 `VFD-*` SCHEDULE_ONLY under `evaluationFast` (honest — tags not plan text). SDSU CAV sample expanded (`S1-4/S1-7/S2-3/S3-3`).
- **equipment_schedule needles (shared path):** FUME HOOD VAV DAMPER / ECV, VFD, CEILING FAN title suggestions; AHU needle accepts `AIR HANDLER HEAT PUMP`.
- **WP4 reconcile comma-split parity (shared path):** `normalizeEquipMark` no longer strips `AHU-1, HP-1` before split; `rowIdentityTag` returns raw marks (normalize after split, same as compile). Baker HEAT_PUMP scaffold **2→5** (HP-1..3 restored). Baker GRD **4/4 MATCH** + outdoor HP-5/6 MATCH locked; Douglas VRF/HP sample MATCH locked.
- **WP4 same-sheet shadow-extract collapse (shared Session.sweepScheduleRow):** thinner same-sheet rows whose cell values are covered by a denser sibling are excluded (not AMBIGUOUS). Baker UNIT_HEATER EH-* and Klamath PUMP (untitled hydronic summary) no longer AMBIGUOUS. Cross-sheet / equal-richness twins still refuse.
- **WP1.4 FAN KEF blank-title (shared path):** `KEF-*` kitchen exhaust on blank-title summaries + `KITCHEN EXHAUST FAN SCHEDULE` title signal. Klamath **52→53** (FAN:1). Negatives: SDSU FAN 5, federal FAN 4, itd FAN 7, Baker FAN 2.
- **WP4 Baker EH MATCH + Klamath KEF SO:** after shadow collapse, Baker UNIT_HEATER **4/4 MATCH**; Klamath blank-title KEF-1 honest SCHEDULE_ONLY under `evaluationFast`.
- **WP4 glued compound rowKeyAnswersFor (shared path):** comma + glued `AHU-1HP-1` keys answer for each half (digit+letter suffixes like `AHU-1A` do not split). Baker AHU **3/3 MATCH** + indoor HP-1/2/3 MATCH (was false SCHEDULE_ONLY — sweep could not find the row).
- **WP1.4 ERV keyRe + ERV-paired HP (shared path):** `ERU-*/ERV-*` keyRe comma-splits SYMBOL; HEAT_PUMP no longer excludes ENERGY RECOVERY titles so outdoor HP-* halves join. Baker **20→21** (HP-4); ERU-1 + HP-4 **MATCH**. Negatives: Colville 50, itd 93, federal 103, Klamath 53.
- **WP1.4 VACUUM_PUMP (shared path):** titled `VACUUM PUMP SCHEDULE` + `V-*` (titledOnly; hydronic PUMP still excludes VACUUM). SDSU **206→207** (V-1). Negatives: Colville 50, itd 93, Carson 58, Baker 21, Klamath 53, federal 103.
- **WP1.4 BRINE_TANK (shared path):** titled softener/brine schedules + `BT-*` (titledOnly — Colville BUFFER_TANK BT-* unchanged). SDSU **207→208** (BT-1). Negatives: Colville 50 (BUFFER intact), itd 93, Carson 58, Baker 21.
- **WP4 SDSU vacuum/softener MATCH:** `V-1` + `WS-1` MATCH under `evaluationFast`; brine `BT-1` + flash `FT-1` honest SCHEDULE_ONLY.
- **WP4 prefer-schedule sweep (shared Session.sweepScheduleRow):** callers that already know the owning table (`preferSheet`/`preferTitle` from family reconcile scaffold + project-takeoff row walk) disambiguate shared building letters across distinct equipment schedules. Carson CONTROL_DAMPER/OAU/RTU/ERV/FURNACE/CONDENSING/RANGE_HOOD **all MATCH** under `evaluationFast` (was heavy AMBIGUOUS). Unscoped `sweep_schedule_row B1` still AMBIGUOUS (honest). Negatives: Baker EH, Klamath PUMP, SDSU vacuum/softener. `test:workflows` **41/41**.
- **WP4 titled-first family collect (shared compile+reconcile):** `uniqueFamily` + reconcile scaffold claim titled schedules before blank/catch-all so Colville ERV-1 cites `ENERGY RECOVERY VENTILATOR SCHEDULE` (not blank seismic summary). Sheet-only prefer also narrows to the unique non-blank title. Colville ERV **MATCH**. Compile totals held: Colville 50, Carson 58, itd 93, Baker 21, Klamath 53, federal 103.
- **WP1.4 ampersand equip marks (shared path):** `expandAmpersandEquipMarks` + prefer ampersand TAG over glued `row.key` — Northport `RF-1 & 2` → RF-1/RF-2 (FAN **1→2**, total **15→16**). Negatives: Colville 50, itd 93, Carson 58, Baker 21, federal 103.
- **WP4 Hurlburt ATU spaced marks (shared path):** `rowKeyAnswersFor` strips revision/`N` prefixes (`NATUK1`↔`ATU K1`); `sweepScheduleRow` prefers the plan-drawn spaced MARK form. Hurlburt VAV **ATU K1/K2 MATCH** (was SCHEDULE_ONLY). Negatives: Carson prefer-schedule, Colville ERV, Baker EH, SDSU vacuum. `test:workflows` **43/43**.
- **WP1.4 / BAS I/O LIST titles (shared path):** `isBasPointsListTitle` accepts POINTS LIST / DDC POINTS / I/O LIST / IO LIST; column-label TAG rows skipped; title-only schematics stay empty. Colville **bas_points 0→42** (I/O LIST WHITE STURGEON PLC). NAVFAC T-BAS-01 still **122** rows / 5 lists. Negatives: SDSU HVAC 208 / BAS 0.
- **WP4 SDSU FAN MATCH lock:** all 5 scheduled FAN tags MATCH under `evaluationFast` (EF-1-ABC, EF-2-ABCD, TEF-1, TEF-2, GX-1). Northport RF-* remain honest SCHEDULE_ONLY (no plan text). `test:workflows` **44/44**.
- **WP1.4 / BAS I/O LIST ANALOG/DIGITAL rollup (shared path):** device rows without AI## MARK prefixes accumulate ANALOG→AI and DIGITAL→BI point totals (direction not distinguished). Colville **AI 0→33 · BI 0→21** (rows stay 42). NAVFAC T-BAS-01 still **122** rows / AI43 AO15 BI49 BO15.
- **WP4 Northport FAN honest SO lock:** RF-1/RF-2 SCHEDULE_ONLY under `evaluationFast` (no drawable plan text) — ceiling documented beside SDSU FAN MATCH.
- **Vol2 batch-1 intake (shared path):** FAN keyRe `S-A-*`/`R-A-*`/`DSF`/`EG`/`SEF`; UNIT_HEATER `ECUH`/`HWUH` + duct-heater titles; DUCT_MOUNTED_COIL `HWC`; BAS `DDC CONTROLLER INPUT/OUTPUT` titles. NIST **13→19**; Missoula **12→30**; Lab BAS **0→63** rows / 3 lists; APHIS **10→15**. Keys: 5 MEAT + 1 WEAK + 2 ZERO under `cross-set-compile/`. Unit + Vol2 acceptance **8/8**.
- **Vol2 batch-2 intake (shared path):** RTU `PACKAGED EQUIPMENT SCHEDULE (RTU)` + `RTU-*` keyRe; UNIT_HEATER `GUH`/`NUH`; DOAS `DEDICATED OUTSIDE AIR SYSTEM`. Locked **12** more Vol2 keys (7 MEAT / 3 WEAK / 2 ZERO) including ATC tower **396** HVAC + **122** BAS. Vol2 keyed total **20**. Acceptance **12/12**. Suwannee RTU negative still **1**.
- **Vol2 batch-3 intake (shared path):** building-prefix `markCoreForKeyRe` (WHSE-ET-1→ET-1; reject catalog `TPLFY-EP15NEM4`); VRF_INDOOR/OUTDOOR; humidifier OCR/SH digit-gated; EXPANSION SYSTEM + zone-letter ET-A1; BUFFER GST-*. Locked **12** more Vol2 keys (5 MEAT / 2 WEAK / 5 ZERO) including warehouse **89** + chiller/VRF **15**. Vol2 keyed total **32**/82. Negatives: Orange `SHT. NO.`, Iowa `ETC.…`, Douglas model→EP pump, Missoula ET-A1 retained.
- **Vol2 batch-4 intake (shared path):** PUMP hydronic titles without SCHEDULE; AIR_SEPARATOR plural + `IAS-*`; titled HEAT_EXCHANGER keeps set-local marks; HHW/CHW start-anchored bare `VALVE SCHEDULE` + `V-HHW*`/`V-CHW*` (unanchored form regressed NAVFAC 396→233 by forcing altKeyRe on CONTROL VALVE titles). Locked **12** more Vol2 keys (7 MEAT / 3 WEAK / 2 ZERO) including VA ER **43** (38 HHW valves; GRD drops header `MIN.`) + ITD lab **93** (incl. 9 HHW reheat CVs). Vol2 keyed total **44**/82.
- **Schedule header junk gate (shared path):** reject `MODEL`/`TAG`/`MIN.`-class labels on titled schedules without keyRe (Colville HX was 6→4 false). Do **not** require digits on unfiltered titled marks — that dropped NAVFAC letter-suffix valves (`CV-CHW-BP-A`, 396→391 / 163→158).
- **Vol2 batch-5 intake (shared path):** `DUCT_MOUNTED_COIL` accepts `ELECTRIC DUCT COIL` + `DH-*`. Locked **12** more Vol2 keys (1 MEAT / 5 WEAK / 6 ZERO) including Miller dining **14** + Renne Library **11**. Vol2 keyed total **56**/82.
- **Warehouse HX recovery:** titled HEAT_EXCHANGER blankKeyRe path recovers WHSE-HX* — warehouse key **89→91**. HEAT_PUMP title still matches Baker-shaped `ENERGY RECOVERY … (WITH HEAT PUMP)` so outdoor HP-* halves compile; keyRe keeps ERU-* on ERV.
- **Vol2 batch-6 intake (shared path):** Locked remaining **13** single-file INDEX sets (2 MEAT / 4 WEAK / 7 ZERO) including Town Offices **12** + Vermillion Jail **131** HVAC / **231** BAS. Vol2 keyed total **69**/82 (all single-file INDEX sets keyed; **13** multipart rejoins remain).
- **044 HX recovery:** titled HEAT_EXCHANGER recovers FHX-* — main-boilers key **28→30**.
- **Vol2 batch-7 intake (shared path):** Ran `REJOIN_full_sets.sh` (qpdf); locked **13**/13 multipart rejoins (3 MEAT / 5 WEAK / 3 ZERO) including chiller upgrade **32**, NY EHRM **18**, Jonesboro VRF **24**; LBNL honest ZERO (311 sheets). Workflow `graphForKey` prefers `_rejoined/` then merges `source_parts_dir`. Vol2 keyed total **82**/82 (all 13 multipart rejoins keyed, incl. PHX **64** + FL airport **20**).
- **WP4 Vermillion County Jail VAV reconcile:** Vol2 **096** bulk **58/58 VAV MATCH** under `evaluationFast` (locked in `reconcileWorkflow.test.mjs`).
- **WP4 Vol2 MEAT rejoin reconcile locks (012 chiller ACC/PUMP/VFD, 089 FL airport DOAS/HP/PUMP/WH/FAN, 088 PHX plant+terminal families):** multipart-aware `loadKeySession` helper; locked in `reconcileWorkflow.test.mjs`. `test:workflows` **50/50** green (2026-09-01).
- **WP4 Vol2 MEAT reconcile sweep (unlocked leftovers):** APHIS **009** AHU/ACC/pump/fan MATCH (UH 4/5); NIST **017** fan+humidifier MATCH (duct coils SO); MO steam **024** RTU 4/4; Patriot Cafe **042** GRD 5/5; LAMBDA **060** duct coils MATCH · GRD 6/10; West Valley **072/074** FAN 10/11 + ERV; lab **021** + Bldg615 **028** honest plant SO. WEAK BAS drift audit: **0**. `test:workflows` **83/83** green (2026-09-01).
- **WP4 WEAK/MEAT reconcile deepen:** Renne **075** AHU/HP/ERV/coil MATCH (GRD SO); JVWTP **097** all MATCH; Bruneau **098** FCU/fan/UH MATCH; Harrison **063** GRD MATCH; Antelope **068** boiler MATCH; NY EHRM **030** pumps 14/15; Irish Hill **016** AHU MATCH. `test:workflows` **90/90** green (2026-09-01).
- **WP4 Vol1 plant + WEAK remainder:** Las Vegas CUP **04** CT MATCH · pumps 11/12; Colville **27** fans MATCH · pumps 13/14; unheated **008** UH+louver; NC EHRM **034** pumps; sterile **049** compressors; sterile **041** GRD; ITD D2 **069** honest plant SO. `test:workflows` **97/97** green (2026-09-01).
- **Pillar A deepen — dampers/valves + POINTS SCHEDULE (shared path):** `CONTROL_DAMPER` altTitleRe `MOTORIZED DAMPER SCHEDULE` + `MD-*`; `ISOLATION_VALVE` (bare `VALVE SCHEDULE` + `VLV-*`), `PRESSURE_REDUCING_VALVE` (`PRV-*`), `MIXING_VALVE` (`MX-*`/`MV-*`); `isBasPointsListTitle` accepts `POINTS SCHEDULE` (not SOO “point list table”). Key lifts: pier **015** 47→83 (+21 MD +15 VLV), sterile **040** 24→29 (+5 PRV), FL airport **089** 20→22 (+2 MX), lab **021** 64→66 (+2 PRV). Vermillion **096** BAS unchanged (231). Negatives: T-VALVE/BAS/HVAC-01 locked. Prep for Pillar C — not commercial valve/BAS workflows yet.
- **Pillar B locks on new damper/valve families:** pier **015** CONTROL_DAMPER 21/21 MATCH · ISOLATION_VALVE 13 MATCH / 2 SO; sterile **040** PRV honest SO; FL airport **089** MIXING_VALVE 1 MATCH / 1 SO; lab **021** PRV honest SO. Focused reconcile locks green.

### Active goal (platform loop)

**Foundation:** Trust and genuine agnostic blueprint workflows are our main
goal and our foundation — shared Session+ODL path, set-agnostic, cite-honest,
UI+MCP parity, no corpus hardcodes.

| Pillar | Scope | Status |
|---|---|---|
| **A — Cross-set compile** | Vol1 + Vol2 (82/82 INDEX) schedule compile | **Largely complete** — 23 WEAK + 27 ZERO keys audited 2026-09-01 (zero drift/inflation) |
| **B — Reconcile** | Schedule↔plan with contractor columns+cites | **Near §6 bar** — Vol2 MEAT + high-value WEAK locks; honest SO ceilings documented |
| **C — Valve + BAS depth** | Air/water valves, dampers, actuators; BAS points, I/O, SOO | **Queued** — WP7–WP8 after §6 A+B bar |
| **D — Grounding depth** | Symbol counts highlighted and accurate on plan | **Queued** — WP9 after §6 A+B bar |

Authority: `GOAL.md` §8 · `takeoffs/NEXT_GOAL_LOOP.md`.

### Next queue (platform loop)

1. **Pillar B / §6 judgment:** Vol2 + Vol1 plant reconcile dense (incl. Las Vegas CUP **04**, Colville **27** pumps/fans, WEAK MATCH leftovers). Klamath FC/HP/DOAS remain honest SO.
2. **Pillar A tail:** WEAK→MEAT only when probe finds new extractable schedules (23 WEAK + 27 ZERO stable; BAS drift 0). Damper/isolation/PRV/mixing families now compile on pier/sterile/airport MEAT keys.
3. **Merge branch stack → `main`** when A+B §6 metrics met; WORKFLOWS #51 ON_MAIN.
4. **Pillar C (after A+B):** WP7 valve/damper/actuator depth + WP8 BAS points/SOO
   — grow from 4/82 Vol2 BAS rows and ~3/82 valve rows.
5. **Pillar D (after A+B):** WP9 highlight-accuracy proofs for symbol counts.
6. WP3.3 TG bowtie dedicated detector (tracked follow-on).
7. WP4: Klamath FC/HP/DOAS still SCHEDULE_ONLY under evaluationFast.
8. Optional: BlueprintParser_OS as complementary LLM recall only — never qty/cite truth.

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
