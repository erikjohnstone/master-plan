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

## Verification in progress

- Start the next five-fix accuracy batch from the current 88.5% takeoff
  (93.6% applicable), 129/129 reference, and 95.7% graph baseline.

## Local implementation queue

- NAVFAC's remaining air-device undercounts and pump/valve refusals are the
  largest vector/text-backed quantity gap.
- Baker's remaining deterministic gaps are `HB-1`, `E1`, `HB-2`, `P1`, and
  `V1`.
- Building 5406's exploded-letterform VAV rows account for all six graph
  row-symbol misses.
- Reference extraction is closed at 129/129.

Cloud dispatch and all subagent dispatch are prohibited by the user's
2026-08-29 instruction. The coordinator VM is the only execution path.

## Rejected or deferred approaches

- NAVFAC per-area row-key scoping: zero scored NAVFAC tags are currently
  blocked by `AMBIGUOUS_ROW_KEY`; the remaining ambiguous marks have no
  extracted area qualifier and resolving them would increase false-adds.
- Taxonomy-only score fix: equipment-table rows are already swept regardless
  of taxonomy classification. Prefix additions improve labels but do not close
  the measured score gap.
- OCR, raster vision, and learned symbol detection are out of the current
  user-authorized scope.

## Next queue

Select five non-overlapping fixes from the current evaluator output, using
focused diagnostics between changes and one full corpus gate after the batch.
Prioritize NAVFAC repeated views and air devices, Baker's remaining
vector-backed deltas, and graph row-symbol misses; preserve exact sets and
honest refusal behavior.
