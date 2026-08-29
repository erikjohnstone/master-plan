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

## Verification in progress

- Lower the 105.6-second forced-cold path with reusable PDF/geometry artifacts;
  the normal coding loop is already below the 30-second requirement.

## Local implementation queue

- General same-device multi-view deduplication with legitimate repeated-device
  negative controls.
- General reference-table extraction accuracy.
- Federal false-adds, Baker misses, and NAVFAC pump/valve handling.

Cloud dispatch is paused per the user's 2026-08-29 instruction after all three
initial Composer workers failed at the cloud-state layer. The coordinator VM
is the critical path. Any output returned by workers already in flight remains
provisional and may be used only after independent local verification.

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

After the recovered Building 5406 patch is verified, select the highest
measured non-overlapping defect from fresh evaluator output. Known candidates
include Federal `CH-1` single-row/multi-tier schedule discovery, multi-view
overcounts, and remaining safe tag/table normalization failures. Continue
locally until the goal or a demonstrated ceiling is reached.
