# Autonomous corpus-goal execution

The repository-wide mission is defined by `opentakeoff-corpus/GOAL.md`. Read it
before planning work anywhere in this repository. `opentakeoff/AGENTS.md`
continues to govern implementation and verification inside `opentakeoff/`.

## Coordinator policy

When working autonomously toward the corpus goal:

1. Keep available isolated cloud-worker slots assigned to non-overlapping,
   implementation-first tasks chosen from the highest-impact measured gaps.
2. Use Composer 2.5 Fast for workers unless the user explicitly changes the
   worker model. The coordinator remains responsible for higher-reasoning
   review, integration, and final verification.
3. Refill a worker slot when its result returns. Do not allow an investigation
   that finds a stale or unsafe premise to stall the queue; dispatch the next
   measurable gap.
4. While cloud workers are active, maintain a recurring two-minute health
   check against their backend lifecycle state. Immediately replace workers
   in `ERROR`; do not rely only on delayed completion notifications or the
   last progress message visible in the UI.
5. Independently reproduce and verify every worker result before integrating
   it. Require exact before/after metrics, focused regression tests, and
   negative controls. A worker's claim is evidence to check, not proof.
6. Workers must reuse the verified baseline in
   `opentakeoff-corpus/PROGRESS.md`. They run only the affected set to
   reproduce a defect, then the affected sets plus small negative controls
   after implementation. Do not spend worker time rerunning the entire corpus.
   The coordinator runs the full corpus after integrating a batch of changes,
   or when the evaluation infrastructure itself is under test.
7. Never improve a score by changing a key/scorer, hardcoding a corpus
   identifier, weakening a threshold, or collapsing genuinely distinct
   devices. Prefer an honest documented ceiling to an unsafe heuristic.
8. Do not prioritize OCR, raster vision, or learned symbol detection until the
   user explicitly reopens that scope.
9. Keep `opentakeoff-corpus/PROGRESS.md` current with verified baselines,
   active work, accepted changes, rejected approaches, and the next queue.
10. Continue until `GOAL.md` is satisfied or the remaining ceiling has been
   demonstrated with reproducible evidence.
