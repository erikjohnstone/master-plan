## Active work

### Pillar C — graph preferTitle+sheet pairing clears Colville AMBIGUOUS (2026-09-01 19:00 UTC)

- **Root cause:** inventory `sheet_id` pointed at blank reference table (#13) while graph-resolved `prefer_schedule_title` was `EQUIPMENT SCHEDULE` on #37 — mismatched preferSheet+preferTitle kept 11 tags AMBIGUOUS.
- **Fix:** `planPaintPreferHint()` pairs graph-resolved title with owning sheet via `preferScheduleHintForEquipmentTag()`; never pairs graph title with wrong inventory sheet.
- **Keyed BAS served re-census:** Colville **32 MATCH / 19 SCHEDULE_ONLY / 0 AMBIGUOUS** (was 21/19/11). Floor totals unchanged: 001 116/120, 015 19/26, 021 0/73, 096 59/75. Artifact: `/opt/cursor/artifacts/pillar-c-bas-plan-paint-preferTitle-recensus.json`.
- **Platform tests:** web `npm test` **2098/2113 pass** (2 pre-existing unrelated fails: extractTable hyphen, mepconnectivity perf); targeted MCP regressions re-run this turn.
- **Still 0/112 BAS · 0/81 valve** at `estimator_complete` / `gt_locked`.

### Prior — served_equipment plan-paint + graph preferTitle fallback (2026-09-01 18:50 UTC)

- **Shared path:** `preferScheduleTitleForEquipmentTag()` scans graph tables when HVAC `table_title` is blank or a BAS I/O list title — resolves to owning equipment schedule (e.g. Colville HWP-1 → `EQUIPMENT SCHEDULE`, not `I/O LIST WHITE STURGEON PLC`). `buildBasEstimatorProduct.plan_paint.targets[]` now merges **inventory + unique served_equipment** marks with HVAC/graph preferTitle hints.
- **Keyed BAS served plan-paint re-census (5 sets, `sweepBasServedMark` + product `preferTitle`):**
  - 001 NAVFAC **116 MATCH / 4 SCHEDULE_ONLY** (120 served targets; was 3/3 sample).
  - 015 Pier **19 MATCH / 7 SCHEDULE_ONLY** (26 targets).
  - 021 Lab **0 MATCH / 73 SCHEDULE_ONLY** (73 targets — tags not drawable on plans; honest ceiling).
  - 027 Colville **21 MATCH / 19 SCHEDULE_ONLY / 11 AMBIGUOUS** (51 targets; was 17 MATCH / **25 ERROR** — preferTitle clears thrown errors; 11 AMBIGUOUS remain on duplicate keys in generic `EQUIPMENT SCHEDULE`).
  - 096 Vermillion **59 MATCH / 16 SCHEDULE_ONLY** (75 targets).
  - Artifact: `/opt/cursor/artifacts/pillar-c-bas-plan-paint-preferTitle-recensus.json`.
- Unit tests **13/13** `corpusTakeoffBas` (+ served_equipment preferTitle target test).
- **Still 0/112 BAS and 0/81 valve** at `estimator_complete` / `gt_locked`. Full served-target plan-paint ≠ Pillar C done.

### Prior — preferTitle inventory plan-paint expand + product hints (2026-09-01 18:40 UTC)

- **Inventory plan-paint census (9 bas:0 sets) with `sweepBasServedMark` + HVAC `table_title` as `preferTitle`:**
  - **8/9 with MATCH** (Orange County 8/8, Las Vegas 7/1, St Louis 7/1, Carson 8/8, Ames 8/8, Douglas 8/8, Hawthorn 5/5, SDSU 7/1).
  - Klamath 14 remains honest **0 MATCH / 8 SCHEDULE_ONLY** (tags not drawable — refuse, not invented).
  - Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-inventory-expand.json`.
- **Shared product path:** `buildBasEstimatorProduct.plan_paint.targets[]` now carries `prefer_schedule_title` / `prefer_schedule_sheet` from HVAC `table_title` / `sheet_id`; Agent Takeoff emits `plan_paint_prefer_schedule_title` rows so the agent can pass them into `sweep_schedule_row` (UI+MCP already forward `prefer_schedule_title` → Session `preferTitle`).
- **Valve parity:** `buildValveEstimatorProduct.plan_paint.targets[]` + Takeoff `plan_paint_prefer_schedule_title` rows for valve/damper MARKs (schedule `table_title` as prefer hint).
- **Keyed valve plan-paint census re-run (11 sets):** reconcile sweeps with `preferTitle` from scaffold — e.g. NAVFAC 001 **3 MATCH / 160 SCHEDULE_ONLY** on 163 CHW+HHV rows; Carson 16 **2/2 MATCH** on dampers; SDSU 11 **13 MATCH / 47 SCHEDULE_ONLY** on 60 fume-hood dampers. All still `refuse_not_done` / `gt_locked: false`. Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-keyed-floor.json`.
- **PROOF/SPARE column-header probe** on keyed BAS sets: no real PROOF/INTERLOCK/SPARE columns (CAPACITY false-positives only) — spare/proof gates stay `refuse_not_done`; free-text phrase hits remain disclose-only.
- Unit tests **53/53** (`schedulePlanReconcile` + `corpusTakeoffBas` + `agentTakeoff`).
- **Still 0/112 BAS and 0/81 valve** at `estimator_complete` / `gt_locked`. PreferTitle plan-paint ≠ Pillar C done.

### Prior — preferTitle inventory plan-paint (2026-09-01 18:24 UTC)

- **Shared helper `sweepBasServedMark`:** forwards `preferTitle` / `preferSheet` into `Session.sweepScheduleRow`, then `classifyBasServedSweepOutcome`. Cross-family building letters (Carson B1 on furnace + CU + OAU) resolve when the HVAC item already carries `table_title`.
- **Re-census:** Carson 16 → **8/8 MATCH** (was 6 AMBIGUOUS); Ames 061 → **8/8 MATCH** (was 1 MATCH / 7 AMBIGUOUS). Still `refuse_not_done` / `gt_locked: false`.
- Artifacts: `/opt/cursor/artifacts/pillar-c-plan-paint-preferTitle-recensus.json`.

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
- **Pillar B locks on new damper/valve families:** pier **015** CONTROL_DAMPER 21/21 MATCH · ISOLATION_VALVE 13 MATCH / 2 SO; sterile **040** PRV honest SO; FL airport **089** MIXING_VALVE 1 MATCH / 1 SO; lab **021** PRV honest SO. Focused reconcile locks green. `test:workflows` **97/97** after 021 PRV key fix (2026-09-01). Full `reconcileWorkflow` **86/86** with new locks.
- **Pillar B WEAK leftover SO ceilings:** unlocked thin WEAK sets **066**/ **033**/ **067**/ **078**/ **013** locked as honest SCHEDULE_ONLY (HP/humidifier/GRD, AHU/pump, HX/GRD, FAN, VFD). No false MATCH inflation.
- **Pillar A/B — STEAM PRV compact titles (shared path):** `PRESSURE_REDUCING_VALVE` altTitleRe `STEAM PRV` / `PRV SCHEDULE` (excludes FLASH TANK). SDSU **11** 208→210 (+2 PRV-1A/1B); reconcile **2/2 MATCH**. Unit + T-VALVE/BAS/HVAC-01 green.
- **Pillar A/B — motorized *D dampers + plant isolation/PSV (shared path):** `CONTROL_DAMPER` altKeyRe `/^[A-Z]{1,3}D[\s\-]?\d/i` (JED/PED/MD on MOTORIZED DAMPER SCHEDULE; OA/RA stay primary-only); `ISOLATION_VALVE` keyRe adds `IV|ISO|GV|BV`; new `PRESSURE_SAFETY_VALVE` (`PSV-*`); `normalizeEquipMark` strips building-letter `"B GV-7"`; `BOILER` titleRe = `HOT WATER (CONDENSING) BOILER` | `BOILER SCHEDULE` (keeps Klamath/Antelope; excludes plant isolation boards). Key lifts: Vermillion **096** 131→155 (+24 CONTROL_DAMPER; reconcile 12 MATCH / 12 SO); main boilers **044** 30→41 (+8 ISOLATION honest SO, +4 PSV honest SO; BOILER 5→4 honest). Pier **015** unchanged. Unit + T-VALVE/BAS/HVAC-01 + focused reconcile green.

### Active goal (platform loop)

**Foundation:** Trust and genuine agnostic blueprint workflows are our main
goal and our foundation — shared Session+ODL path, set-agnostic, cite-honest,
UI+MCP parity, no corpus hardcodes.

| Pillar | Scope | Status |
|---|---|---|
| **A — Cross-set compile** | Vol1 + Vol2 (82/82 INDEX) schedule compile | **§6 MET** — 82/82 Vol2 + Vol1 keys; soft titles + sibling-exclusion; T-HVAC-01/T-BAS-01 green; honest WEAK/ZERO stable |
| **B — Reconcile** | Schedule↔plan with contractor columns+cites | **§6 MET** — on `main`; NAVFAC + Vol1/Vol2 bulk locks; Agent UI proof; WORKFLOWS **#51 ON_MAIN**; full `test:workflows` **104/104** |
| **C — Estimator takeoff + plan paint** | Corpus-deep points + valve/damper/actuator takeoffs; every BAS set + every valve set self-checked and pipeline-corroborated | **Not done** — WP7/WP8 printed-list plumbing only. **Stop condition:** every corpus BAS set and every corpus valve set has coordinator-verified truth + GT/pipeline corroboration. Today ~5 BAS keys / ~12 valve-family keys are the floor to deepen, then expand to all bearing sets. T-BAS-01 122 ≠ complete points takeoff. `test:workflows` **104/104** green post-WP8 (plumbing). |
| **D — Symbol-count grounding** | Symbol counts highlighted and accurate on plan | **Queued** — WP9 after C takeoff+paint bar |

Authority: `GOAL.md` · `takeoffs/NEXT_GOAL_LOOP.md`.

### §6 A+B gate evidence (2026-09-01 coordinator — **MET**)

1. Pillar A: Vol2 INDEX **82/82** compile keys + Vol1; `T-HVAC-01` / `T-BAS-01` LOCKED.
2. `T-VALVE-01` LOCKED MCP+UI 5/5.
3. WP3: Bessemer rowsym ≥90% (`rowsymBessemer.regression.test.mjs` pass).
4. Pillar B: reconcile locks include Las Vegas CUP **04**, Colville **27** pumps/fans, Vol2 WEAK leftovers honest SO, Klamath FC/HP/DOAS honest SO; Orange County / Vermillion Jail VAV MATCH; Playwright Agent UI proof.
5. §6 judgment leftovers focused **7/7** (Orange County 32/32 · Vermillion 58/58 · Klamath honest SO · WEAK SO · Las Vegas CUP 04 · Colville 27 · Colville ERV-1).
6. Shared-path: `planToolParity` + `prewarmGraphSmoke` pass.
7. WORKFLOWS **#51** → **ON_MAIN**; merge stack on `main`.
8. Non-NAVFAC complete/family compile + reconcile via bulk keys + UI path (no per-job title hardcodes).
9. Fast workflow locks **12/12**.
10. **Full `npm run test:workflows` green — 104 pass / 0 fail** (~36 min), including WP1 keyed Vol1+Vol2 compile. Log: `/opt/cursor/artifacts/workflows-full-suite.log`.

**Where we refuse (not done — never a success metric):** Klamath FC/HP/DOAS
SCHEDULE_ONLY under `evaluationFast`; WEAK/ZERO compile keys where no
extractable tables; WP3.3 TG bowtie follow-on. Refuse/stop = unfinished work.

### Pillar C depth mandate (2026-09-01 — user)

Pillar C is **corpus-complete or it is not done**. Coordinator must personally
verify the right answer on each BAS set and each valve set, then corroborate
via the shared-path pipeline / GT harness. Sample proofs and POINTS LIST
scrapes do not satisfy the mandate.

**Census (INDEX-derived, 2026-09-01):** Vol1+Vol2 = 112 sets. **BAS-bearing ≈112**
(Vol2 all carry BAS terms; 5 currently keyed with `bas_points.rows>0`).
**Valve/damper-bearing ≈81** (11 keyed with valve/damper family counts).
Estimator-complete + self-check + pipeline GT: **0 / 112 BAS**, **0 / 81 valve**.
Artifact: `/opt/cursor/artifacts/pillar-c-corpus-census.json` ·
`takeoffs/pillar-c-census.json`.

**NAVFAC 001 deep probe (PARTIAL, not done):** HVAC inventory + printed BAS 122;
`served_equipment` DOAH-T1/AHU-T1A/T1B plan paint MATCH; SOO **honest refuse**;
UH labeled estimate 11×6=66; FCU×qty **honest refuse**. Valve identity fix:
reconcile now prefers `VALVE MARK` over `UNIT MARK` — HHW/CHW row counts match
keys (64/64, 99/99); most valve marks honest **SCHEDULE_ONLY** (CV-* not plan
text). Shared-path unit test green. Draft GT still `gt_locked: false`.
**NAVFAC 001 deepening:** Coverage matrix — POINTS served only AHU-T1A/B + DOAH-T1; AHU-A/M and DOAH-A/M lack unit lists (honest gap). Plan-paint regression 3/3 PASS. Still unlocked.
**NAVFAC 001 drawing-backed verify (2026-09-01, still unlocked):** D10 fixture
(PDF byte-identical to Vol2 001) — D10 totals match; **25/25** stratified POINTS
cell sample corroborated via `findText` (contiguous desc); AI10 follow-up +
AHU-T1A/B 24/24/14 split match D10 truth; missing-unit POINTS refuse **6/6**
(AHU-A1/A2/M1, DOAH-A1/A2/M1 — no POINTS LIST title/phrase); CV sample **12/12**
schedule±legend only (legend ≠ plan paint; SCHEDULE_ONLY ceiling holds). Still
blocks lock: FCU×42 coil multiply refuse, SOO refuse, estimator-complete BAS
beyond printed 122, corpus-deep C. Artifacts:
`/opt/cursor/artifacts/pillar-c-navfac-001-drawing-verify.{json,md}` · draft
`takeoffs/pillar-c-gt/001_…gt.draft.json` `drawing_verify`.

**Pier 015 probe (PARTIAL, drawing-backed):** BAS 39=key; `served_equipment`
joins CCC/P/MPAC/HPAC/FC (no longer treats `AI-1` hyphen points as equipment).
Plan paint MATCH: CCC-1, CCC-2, P-1/2, FC-3; MPAC×4/HPAC×3 honest miss (no equipment
schedule rows). CONTROL_DAMPER 21=key; ISOLATION_VALVE 15=key. Drawing verify
2026-09-01: **25/25** POINTS cell sample; damper sample honest (MD-11 MATCH via
sweep on plan #6; exact findText schedule-only noted); iso sample **8/8** MATCH
with plan text; SOO refuse. Draft GT still `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-pier-015-drawing-verify.json`.


**Vermillion 096 probe (PARTIAL, drawing-backed):** BAS 231=key across ~10 generic
"SCHEDULE OF DDC POINTS" lists; only **HRC-1** has served_equipment (plan paint
MATCH). Inventory without POINTS joins: **78** → qty×points HONEST_REFUSE.
CONTROL_DAMPER 24=key · drawing sample **10/10** honest. POINTS cell sample
**25/25 PASS**. SOO refuse. Draft GT still `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-vermillion-096-drawing-verify.json`.

**Lab 021 drawing-backed (PARTIAL, unlocked):** BAS 63=key · POINTS sample **25/25**
from DDC I/O legend/summary (ignore narrative chiller "POINT LIST TABLE"). Served
tags lack equipment schedule rows (honest sweep ERROR). PRV×2 keyed. SOO open.

**Colville 027 drawing-backed (PARTIAL, unlocked):** BAS 42=key · I/O LIST WHITE
STURGEON PLC · sample **25/25** (BS-1PNL printed as "BS-1 PNL"). EP-4 paint MATCH;
most served tags no schedule rows. No valve families keyed. SOO open.

**Keyed BAS floor (5/5) drawing-sampled, 0 locked:** 001, 015, 021, 027, 096.
Estimator-complete + corpus-deep C still **0 / 112 BAS**, **0 / 81 valve**.




**Valve-keyed drawing floor (2026-09-01, all unlocked):** Completed drawing-backed
valve/damper samples on remaining keyed valve-only sets: **040** PRV 5/5 SO;
**044** ISO 8 + PSV 4 all SO; **053** HHW CV 38 (sample 8/8 SO); **062** / **itd-d1-lab**
HHW CV 9 MATCH + LAB_AIR 21 MATCH + BYPASS 1 MATCH; **089** MIX 2 (1 MATCH/1 SO);
**11** FUME_HOOD_DAMPER 58 (sample honest; 11 MATCH/47 SO) + PRV 2 MATCH; **16**
CONTROL_DAMPER 2/2 MATCH. Counts matched keys; samples honest vs reconcile. Still
`gt_locked: false` on every set. Artifacts: `/opt/cursor/artifacts/pillar-c-*-valve-drawing-verify.json`
+ `pillar-c-valve-keyed-batch-summary.json`.

**Keyed floor status:** 5/5 BAS + 8/8 valve-only drawing-sampled · **0 locked**.
Corpus-deep C still **0 / ~112 BAS**, **0 / ~81 valve** after key expansion.

**Refuse language (2026-09-01 — user clarification):** Tables labeled “honest
ceiling” / SCHEDULE_ONLY / SOO refuse are **unfinished work**, not locked truth.
Prefer **“Where we refuse (not done)”**. Printed POINTS/I/O rows alone never
mean Pillar C done. Shared-path `basEstimatorStatus` / `estimator_status` on
every BAS compile now emits `estimator_complete: false`, `gt_locked: false`,
and `refuse_not_done` gates (SOO points, spare I/O, proofs/interlocks beyond
printed, GT lock). Takeoff panel surfaces `BAS_ESTIMATOR` refuse rows so UI
cannot read a POINTS scrape as complete. Title near-miss scan: Northport bare
`INPUT/OUTPUT SUMMARY` correctly rejected (system matrix ≠ typed points).
**0 sets locked.**

**Estimator product path (2026-09-01 — shared UI+MCP, still not C done):**
`compileBasTakeoff` attaches `estimator_product`: HVAC point-bearing inventory +
SOO presence disclose + labeled `estimate_only` schedule qty×points/unit totals
(never merged into printed `totals.rows`) + inventory↔printed gap + ASHRAE G13
spare % policy note. `compileControlValveTakeoff` attaches parallel
`estimator_product` / `estimator_status` (contractor-column coverage, plan-paint
`refuse_not_done`, gt_lock). Takeoff emits `BAS_ESTIMATOR` and `VALVE_ESTIMATOR`
rows. Unit tests **37/37** green.

**Keyed BAS floor live product (2026-09-01, still 0 locked):**

| Set | Printed BAS | Inventory | Estimate_only pts | Gap | SOO | Valves | Valve column gaps |
|---|---:|---:|---:|---:|---|---:|---|
| 001 NAVFAC | 122 | 143 | 965 | 125 | absent/not detected | 163 | Actuator/Fail/Signal |
| 015 Pier | 39 | 17 | 71 | 14 | absent | 36 | Served/Size/GPM/Cv |
| 021 Lab | 63 | 44 | 279 | 44 | present_not_row_extractable | 2 | Size/Cv/Actuator/Fail |
| 027 Colville | 42 | 22 | 71 | 8 | absent | 0 | — |
| 096 Vermillion | 231 | 92 | 437 | 74 | absent | 24 | Served/Size/GPM/Cv |

All five: `estimator_complete: false`, `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-keyed-bas-valve-estimator-floor.json`.

**Keyed BAS estimator gap/SOO drawing verify (2026-09-01, still 0 locked):**
Coordinator corroborated inventory↔printed gaps + SOO status on all 5 keyed BAS
sets. Method: tag on HVAC inventory, absent from POINTS list titles + printed
`served_equipment`, SOO status match. **Never locks GT.**

| Set | Gap verify | SOO | Artifact |
|---|---|---|---|
| 001 NAVFAC | **6/6** AHU-A/M + DOAH-A/M | absent match | `pillar-c-001-estimator-gap-verify` |
| 015 Pier | **14/14** all gap tags | absent match | `pillar-c-015-estimator-gap-verify` |
| 021 Lab | **44/44** all gap tags | present_not_row_extractable match | `pillar-c-021-estimator-gap-verify` |
| 027 Colville | **8/8** all gap tags | absent match | `pillar-c-027-estimator-gap-verify` |
| 096 Vermillion | **60/60** of 74 (product sample cap) | absent match | `pillar-c-096-estimator-gap-verify` |

Batch: `/opt/cursor/artifacts/pillar-c-estimator-gap-verify-keyed-floor.json`.
Draft GTs patched with `estimator_product` + `estimator_gap_drawing_verify`;
still `gt_locked: false` / `estimator_complete: false` on every set.

**Valve estimator contractor-column honesty (2026-09-01, still 0 locked):**
Recount of `normalizeControlValveCells` vs `estimator_product.contractor_column_coverage`
on **11** keyed valve sets — **all_honest: true** (missing lists match; 7/7 columns).
Examples: NAVFAC 001 missing only Actuator/Fail/Signal (Served/Size/GPM/Cv present);
053 Size present; dampers/iso often missing served+size+Cv. Still
`gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-valve-estimator-columns-batch.json`.
Corpus-deep C still **0 / ~112 BAS**, **0 / ~81 valve**.

**Expanded estimator_product census (2026-09-01, 15 bearing sets, still 0 locked):**
Live compile on controls/HVAC-named sets beyond the 5 keyed BAS floor — **0**
new printed BAS lists (title gate + empty tables honest). **11/15** still emit
inventory + labeled `estimate_only` + gap with `estimator_complete: false`
(e.g. SDSU 11: inv 128 / est 708 / gap 78; Klamath 14: inv 37 / est 307;
ITD 062: SOO `present_not_row_extractable`). Valve families continue to compile
where schedules exist. Artifact:
`/opt/cursor/artifacts/pillar-c-estimator-product-census-batch.json`.
**No new BAS keys** — do not invent POINTS from equipment schedules.

**bas:0 inventory drawing verify (2026-09-01, still 0 locked):** SDSU 11 inventory
sample **20/20** on drawing (printed BAS 0); Klamath 14 **15/15** on drawing
(printed BAS 0). Draft GT created/patched; `gt_locked: false`. Artifact:
`/opt/cursor/artifacts/pillar-c-inventory-drawing-verify-batch.json`.

**bas:0 inventory expanded (2026-09-01, 57 inventory + 7 zero floors = 64 floors, still 0 locked):**

| Set | Inv | Est pts | Sample on drawing | SOO |
|---|---:|---:|---|---|
| 11 SDSU | 128 | 708 | **20/20** | absent |
| 14 Klamath | 37 | 307 | **15/15** | absent |
| 062 ITD | 16 | 88 | **16/16** | present_not_row_extractable |
| 05 St Louis | 14 | 89 | **14/14** | absent |
| 04 Las Vegas CUP | 16 | 60 | **16/16** | absent |
| 044 Boilers | 22 | 90 | **13/15** (FOP-2/34 miss) | absent |
| 040 Sterile | 8 | 24 | **8/8** | absent |
| 25 Douglas | 3 | 27 | **3/3** | absent |
| 10 Hawthorn | 2 | 42 | **2/2** | absent |
| 017 NIST | 6 | 18 | **6/6** | absent |
| 16 Carson | 6 | 90 | **6/6** | absent |
| 01 Northport | 3 | 27 | **3/3** | absent |
| 03 Hurlburt | 11 | 73 | **11/11** | absent |
| 06 Jeff City CST | 14 | 87 | **14/14** | absent |
| 12 Reid Hall | 4 | 20 | **4/4** | absent |
| 17 Suwannee | 1 | 15 | **1/1** | absent |
| 18 Baker MS | 6 | 84 | **6/6** | absent |
| 21 Orange County | 33 | 163 | **15/15** | absent |
| 22 Valdosta FS8 | 5 | 33 | **5/5** | absent |
| 23 Macon Bibb | 4 | 17 | **4/4** | absent |
| 24 Johnson Co | 3 | 19 | **3/3** | absent |
| 26 Transbay | 7 | 35 | **7/7** | absent |
| 30 Spokane Transit | 5 | 24 | **4/5** (1 miss) | absent |
| 004 Interior Reno | 12 | 138 | **12/12** | absent |
| 009 APHIS | 9 | 63 | **9/9** | absent |
| 012 Chiller Behavioral | 16 | 57 | **15/15** | absent |
| 014 Missoula Fire | 14 | 90 | **14/14** | absent |
| 016 Irish Hill | 1 | 21 | **1/1** | absent |
| 018 Poultry | 1 | 3 | **1/1** | absent |
| 019 Eglin | 83 | 430 | **20/20** | absent |
| 023 Salinity | 2 | 6 | **2/2** | absent |
| 024 Steam Heat | 4 | 60 | **4/4** | absent |
| 028 Bldg 615 | 7 | 81 | **7/7** | absent |
| 030 EHRM NY | 15 | 50 | **15/15** | absent |
| 031 Warehouse MO | 12 | 54 | **12/12** | present_not_row_extractable |
| 032 EHRM PA | 1 | 3 | **1/1** | absent |
| 033 Construct MN | 3 | 27 | **3/3** | absent |
| 034 EHRM NC | 2 | 6 | **2/2** | absent |
| 037 AHU AR | 1 | 3 | **1/1** | absent |
| 041 Sterile IL | 3 | 19 | **3/3** | absent |
| 042 Patriot Cafe | 1 | 3 | **1/1** | absent |
| 047 Chillers NC | 3 | 9 | **3/3** | absent |
| 061 Ames Wilhelm | 23 | 92 | **20/20** | absent |
| 063 Harrison Extruder | 2 | 10 | **2/2** | absent |
| 067 SLAC PCW | 2 | 6 | **2/2** | absent |
| 068 Antelope Valley | 4 | 18 | **3/4** (1 miss) | absent |
| 069 ITD D2 Lab | 9 | 57 | **9/9** | absent |
| 071 Health Science ME | 21 | 103 | **20/20** | absent |
| 072 West Valley Sci | 11 | 33 | **11/11** | absent |
| 074 West Valley STEM | 11 | 33 | **11/11** | absent |
| 075 Renne Library | 2 | 42 | **2/2** | absent |
| 078 Sparty Store | 1 | 3 | **1/1** | absent |
| 083 Town Offices MA | 4 | 32 | **4/4** | absent |
| 088 Sky Harbor | 31 | 155 | **20/20** | absent |
| 094 Orange Hist | 6 | 111 | **6/6** | absent |
| 097 JVWTP Chem | 1 | 15 | **1/1** | absent |
| 098 Bruneau Shed | 5 | 25 | **5/5** | absent |

All printed BAS 0 · estimate_only never merged · **0 locked**. Same batch artifact.
Wave-2 product census (18 more bearing sets): **11/18** inventory-bearing, **0** new printed BAS lists.
Wave-3 product census (18 more): **11/18** inventory-bearing, **0** new printed BAS lists.
Wave-4 product census (20 more): **9/20** inventory-bearing, **0** new printed BAS lists;
031 Warehouse SOO `present_not_row_extractable` (same class as ITD 062).
Wave-5 product census (24 more): **11/24** inventory-bearing, **0** new printed BAS lists.
Wave-6 final remaining pool (11): **4** inventory (all green) + **7** honest zero-inventory floors;
**0** new printed BAS lists. Remaining-pool census complete for bearing names.
Artifacts: `/opt/cursor/artifacts/pillar-c-estimator-product-census-wave2.json`,
`/opt/cursor/artifacts/pillar-c-estimator-product-census-wave3.json`.

**Plan-paint census — keyed floor (2026-09-01, still 0 locked):**

BAS `served_equipment` sweep with product `preferTitle` (full tag census):

| Set | Targets | MATCH | SO | AMB | Status |
|---|---:|---:|---:|---:|---|
| 001 NAVFAC | 120 | **116** | 4 | 0 | partial (most units paint; 4 honest SO) |
| 015 Pier | 26 | **19** | 7 | 0 | partial (pumps/fans largely MATCH) |
| 021 Lab | 73 | 0 | **73** | 0 | honest SO ceiling (tags not on plans) |
| 027 Colville | 51 | **32** | 19 | **0** | partial (was 11 AMBIGUOUS — sheet pairing fix) |
| 096 Vermillion | 75 | **59** | 16 | 0 | partial (VAV/FCU/AHU largely MATCH) |

Artifact: `/opt/cursor/artifacts/pillar-c-bas-plan-paint-preferTitle-recensus.json`.

Valve reconcile rollup (MATCH / SCHEDULE_ONLY):

| Set | Items | MATCH | SO | Notes |
|---|---:|---:|---:|---|
| 001 NAVFAC | 163 | 3 | 160 | CV mostly schedule-only (honest) |
| 015 Pier | 36 | 34 | 2 | iso/damper largely plan-text |
| 062 ITD lab | 31 | **31** | 0 | full MATCH |
| 16 Carson | 2 | **2** | 0 | dampers MATCH |
| 053 ER | 38 | 0 | **38** | all SO (honest) |
| 11 SDSU | 60 | 13 | 47 | hood dampers mostly SO |

Artifact: `/opt/cursor/artifacts/pillar-c-plan-paint-census-keyed-floor.json`.
`estimator_product.plan_paint` stays **`refuse_not_done`** until corpus-complete.
Regression: `basServedEquipmentPlanPaint.test.mjs` **3/3** green.

**bas inventory floors — corpus-wide (2026-09-01, 112/112 floors checked, still 0 locked):**
Every BAS-bearing set now has either a drawing-backed inventory sample or an honest
zero-inventory floor from product census. Keyed printed-BAS sets also sampled
(001/015/027/096 **20/20**; 021 **18/20** honest misses; 089 airport **13/20**).
This is **not** Pillar C complete — SOO/I/O/spare/proofs + valve estimator + pipeline GT remain.

**Valve product census — corpus-wide (2026-09-01, 81/81, still 0 locked):**
Live `compileCorpusTakeoff(..., control_valves)` on every valve-bearing set.
**11/81** have printed valve/damper items — exactly the keyed family sets (no new
printed schedules beyond current set-agnostic title/keyRe). **70/81** honest zero
valve floors. Contractor-column honesty already verified on the 11 keyed.
Do **not** invent valve keys from equipment schedules. Artifact:
`/opt/cursor/artifacts/pillar-c-valve-product-census-all.json`.

**SOO deepen — present_not_row_extractable (2026-09-01, still 0 locked):**
Coordinator drawing/text probe on 021 Lab, 031 Warehouse, 062 ITD Lab.
- **062:** SOO title + live text `BOILER/VFD/AHU POINTS LIST` on sheets 18–19, but
  **0 geometric tables** on those sheets → cannot promote to printed BAS without
  OCR/raster (out of scope). Honest `present_not_row_extractable`.
- **021 / 031:** SOO present / phrase hits; still refuse SOO-derived points.
Artifacts: `/opt/cursor/artifacts/pillar-c-*-soo-probe.json`,
`pillar-c-062-points-list-near-miss.json`, `pillar-c-062-points-list-title-assoc.json`.

### Next queue (platform loop)

1. **Pillar C (corpus-deep):** inventory floors **112/112** + valve product census **81/81** (11 printed / 70 zero) but **0** estimator-complete;
   deepen SOO/I/O/spare/proofs on keyed+SOO-present sets; expand valve contractor columns
   beyond 11 keyed; pipeline GT lock only when complete. Prior: 1. **Pillar C (corpus-deep):** Gap/SOO + valve columns + plan-paint census on keyed floor;
   BAS inventory floors **112/112** checked (drawing or honest zero) — **0 locked**. Next: extend inventory
   + plan-paint to more bearing sets; tabular SOO where vector allows; expand keys only
   when live compile finds real lists; lock only with self-check + pipeline GT on
   **every** BAS + valve set.
   Post-WP8 `test:workflows` **104/104** green (plumbing only — not C done).
2. **Pillar D:** WP9 symbol-count highlight-accuracy proofs (≥3 bulk).
3. WP3.3 TG bowtie dedicated detector (tracked follow-on).
4. Optional: BlueprintParser_OS as complementary LLM recall only — never qty/cite truth.

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
