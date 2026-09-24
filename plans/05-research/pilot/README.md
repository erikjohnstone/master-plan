# Research scripts for the control-intent goal (dev documents only)

These scripts are the evidence behind `plans/05-research/01–03`. They are research code, not product code. Each one reads only the frozen assemblies split's dev documents, and refuses a held-out id where it takes one.

| Step | Command (from the repo root unless noted) | Writes |
|---|---|---|
| R2 misses | `node plans/05-research/pilot/r2-misses.mjs` | `out/misses.json`, `../dev-misses-by-evidence.csv`, counts on stdout |
| R2 targeting | `cd opentakeoff/mcp && node --import tsx ../../plans/05-research/pilot/r2-targeting.mjs`; then rerun r2-misses to fill the CSV's targeting column | `out/targeting.json` |
| R3 pilot inputs | `opentakeoff/.venv-sidecar/bin/python plans/05-research/pilot/r3-extract.py` (pymupdf) | `out/pilot-pages.json`, `out/094-ahu458.png` |
| R3 schedule rows | `cd opentakeoff/mcp && node --import tsx ../../plans/05-research/pilot/r3-rows.mjs` | `out/pilot-rows.json` |
| R3 text pilot | `node plans/05-research/pilot/r3-text-pilot.mjs` (needs `CEREBRAS_API_KEY`; 12 calls) | `out/pilot-results-gpt-oss-120b.json` |
| R3 vision probe | `node plans/05-research/pilot/r3-vision-probe.mjs` (needs `CEREBRAS_API_KEY`; 2 calls) | `out/vlm-probe-results.json` |

**Notes:**
- `r2-targeting.mjs` and `r3-rows.mjs` read the cached sheet graphs (`mcp/scripts/sheetGraphCache.mjs`). A cache miss aborts instead of building a graph.
- The committed `out/*results*.json` files are the runs quoted in the notes, from 2026-09-24. A rerun calls the live models, and its output can differ; that is exactly why the goal requires record/replay.
- `r2-classes.mjs` is the hand classification of each miss, read from its key's basis note. The goal freezes it at approval for GATE B2.
