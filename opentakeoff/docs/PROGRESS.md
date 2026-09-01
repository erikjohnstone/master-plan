## 2026-09-01 — P2 integrated on Pillars A/B/C/D (not a fork)

- `gridClassify.mjs` — P2 grid typing delegates to L5 `isControlValveHeaderShape` / `isBasPointsListTable`.
- `takeoffEvidence.mjs` — grounded EVIDENCE from compile cells (shared path).
- `estimatorTakeoffDocument.mjs` — `out/*.takeoff.json` wraps `compileCorpusTakeoff` + `pipelineHarnessSnapshot`; preserves `pillars.a/b/c/d` + `estimator_status`; accepts Pillar B reconcile + Pillar D legend rollups via opts.
- `pipelineHarness.mjs` — graph vs compile corroboration for Pillar C GT harness.
- `emit-takeoff-json.mjs` — Session.graphForPipeline → document; optional `--with-reconcile` / `--with-legend` attach Pillars B/D without re-running extraction logic.
- `pillarCTableRecallCensus.mjs` — table recall census on shared vector stack.
- Eval: `npm run eval` runs P2 + vector stack unit tests (18 passing).
- Next: eval gold for `grid_type_acc`; P3 sequences; corpus emit batch toward MVP gates.
