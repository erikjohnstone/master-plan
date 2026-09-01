## 2026-09-01 — P1 L2 sidecar wired

- Added `sidecar/tables.py` JSON-RPC (pdfplumber vector-lines + lines backends).
- Node `tableSidecarClient.ts` + `scheduleTableSidecarAdapter.ts` → `scheduleTableFromODL`.
- `vectorTakeoffPipeline.ts` calls sidecar when TS L2 fallbacks find zero tables.
- Next target: P2 grid typing + column extractors; extend eval gold for `table_cell_f1`.
