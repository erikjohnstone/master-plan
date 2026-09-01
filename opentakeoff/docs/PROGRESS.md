## 2026-09-01 — Pillar gap closure on vector stack (70 valve / 49 BAS zero floors)

- **Goal updated** (`docs/GOAL.md`): explicit mandate to finish Pillars A–D extraction gaps through L0–L5, not regex-only or refuse weakening.
- `scheduleLanguageScan.ts` — shared valve/BAS/schedule language scan (embedded AHU POINTS LIST, CHW valve schedule, I/O list).
- `pillarGapRecovery.ts` — **L2.5** title-anchored stream + sidecar recovery when language exists but no valve/BAS-shaped table.
- Wired into `vectorTakeoffPipeline.ts` + expanded `session.ts` points-list title detection.
- `sequenceExtract.ts` + `topologyConsumer.ts` — P3 sequences + L3.5 topology summary on shared path.
- `pillarGapAudit.mjs` — measures compile-zero floors vs graph valve/BAS rows + missing-target sheets.
- `emit-corpus-takeoff.mjs` + `eval/runCorpusEval.mjs` — batch emit + scoreboard (in progress).
- Next: run `pillarGapAudit` before/after on 17 tabular-language sets; corpus emit batch; eval gold.

## 2026-09-01 — Corpus batch emit in progress

- Fixed `emit-corpus-takeoff.mjs` CLI (`--corpus`, `--resume`, `--limit`, `--sets`).
- `npm run emit:corpus` / `npm run eval:corpus` added to root package.json.
- Full batch running: `emit-corpus-takeoff.mjs --resume` → `opentakeoff/out/<set_id>.takeoff.json` (116 keys).
- Partial eval (3/116): `grounding_coverage=1.0`, `valve_rec=1.0` on emitted valve sets; `corpus_pass_rate=0.026`.
- ~2–3 min/set — full corpus ~4–6h; re-run with `--resume` to continue after interruption.

## 2026-09-01 — P2 integrated on Pillars A/B/C/D (not a fork)

- `gridClassify.mjs` — P2 grid typing delegates to L5 `isControlValveHeaderShape` / `isBasPointsListTable`.
- `takeoffEvidence.mjs` — grounded EVIDENCE from compile cells (shared path).
- `estimatorTakeoffDocument.mjs` — `out/*.takeoff.json` wraps `compileCorpusTakeoff` + `pipelineHarnessSnapshot`; preserves `pillars.a/b/c/d` + `estimator_status`; accepts Pillar B reconcile + Pillar D legend rollups via opts.
- `pipelineHarness.mjs` — graph vs compile corroboration for Pillar C GT harness.
- `emit-takeoff-json.mjs` — Session.graphForPipeline → document; optional `--with-reconcile` / `--with-legend` attach Pillars B/D without re-running extraction logic.
- `pillarCTableRecallCensus.mjs` — table recall census on shared vector stack.
- Eval: `npm run eval` runs P2 + vector stack unit tests (18 passing).
- Next: eval gold for `grid_type_acc`; P3 sequences; corpus emit batch toward MVP gates.
