# Estimator takeoff goal (authoritative)

See the full mission, output schema (`out/<file>.takeoff.json`), work plan P1–P7,
eval harness, acceptance gates, and iteration protocol in the agent goal document
armed via `/goal`.

**Current phase:** P2 — grid typing + `out/*.takeoff.json` on top of existing Pillars A/B/C/D.

**Integration rule:** The vector stack (L0–L5) feeds `Session.graphForPipeline()`.
Pillar A `compileCorpusTakeoff`, Pillar B `schedulePlanReconcile`, Pillar C
`estimator_status` / GT harness, and Pillar D legend sweeps are **not replaced** —
they are embedded in `estimatorTakeoffDocument.mjs` under `pillars.*`.
