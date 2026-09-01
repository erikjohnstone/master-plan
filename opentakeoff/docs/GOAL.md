# Estimator takeoff goal (authoritative)

See the full mission, output schema (`out/<file>.takeoff.json`), work plan P1–P7,
eval harness, acceptance gates, and iteration protocol in the agent goal document
armed via `/goal`.

**Current phase:** P1 — L2 Python sidecar (`sidecar/tables.py`) + Node
`scheduleTableSidecarAdapter.ts` on the shared `Session.graphForPipeline()` path.

**Out of scope until later phases:** UI/canvas changes, VLM on scored path,
corpus-wide GT locks, pricing.
