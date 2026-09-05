# Estimator takeoff goal (authoritative)

> **Superseded.** Despite the title, the current mandate lives in
> `opentakeoff-corpus/GOAL.md` — read that first.

See the full mission, output schema (`out/<file>.takeoff.json`), work plan P1–P7,
eval harness, acceptance gates, and iteration protocol in the agent goal document
armed via `/goal`.

**Current phase:** P2–P3 + **Pillar gap closure** — finish what Pillars A–D could not
extract, through the L0–L5 vector stack on the shared Session path.

## Integration rule

The vector stack (L0–L5) feeds `Session.graphForPipeline()`.
Pillar A `compileCorpusTakeoff`, Pillar B `schedulePlanReconcile`, Pillar C
`estimator_status` / GT harness, and Pillar D legend sweeps are **not replaced** —
they are embedded in `estimatorTakeoffDocument.mjs` under `pillars.*`.

## Pillar gap closure (explicit goal)

Pillars A–D proved schedule/BAS/valve **language exists** on many sets where
**geometric tables never landed** in `graph.tables`:

| Gap | Scale | Root cause | Vector-stack fix (shared path) |
|-----|------:|------------|--------------------------------|
| Valve compile-zero floors | **70 / 81** valve-bearing sets | L1/L2 table extraction; untitled valve grids | L2 stream + sidecar + **L2.5 title-anchored pillar-gap recovery** |
| PDF text with tabular schedule language, compile still 0 | **17** sets | Schedule keywords present, no grid in graph | Title-anchored stream band + sidecar `bboxHint` |
| BAS compile-zero floors | **49** sets | POINTS LIST titles without geometric tables (SOO narrative, near-miss) | Expanded `scheduleLanguageScan` + forced recovery on legend/unknown sheets |
| SOO / sequence narrative | 2+ keyed sets | Text titles, zero typed rows | P3 `sequenceExtract.ts` — disclose, never invent points |

**Wrong fix:** expand `titleRe` regex only, or weaken Pillar C refuse gates.  
**Right fix:** ensure valve/BAS schedule **grids exist in `graph.tables`**, then let
existing Pillar A compile + Pillar B reconcile + Pillar C GT harness run unchanged.

### Shared modules (do not fork)

- `scheduleLanguageScan.ts` — valve/BAS/schedule language in vector text
- `pillarGapRecovery.ts` — L2.5 recovery when language ⊃ extracted tables
- `sequenceExtract.ts` — SOO sections (no implied points on scored path)
- `topologyConsumer.ts` — L3.5 `vector_topology` summary + systemTag enrich

### Success metrics (replace compile-only counts)

| Metric | Target |
|--------|--------|
| Valve-bearing sets with ≥1 valve/damper-shaped table in `graph.tables` | Track via `pillarGapAudit.mjs` + `pipelineHarnessSnapshot` |
| BAS sets with POINTS LIST language → graph BAS rows or honest refuse | Same |
| `valve_graph_without_compile` / `bas_graph_without_compile` | Trend down batch-over-batch |
| Every compile row has cell bbox cite | Keep (Pillar A) |
| `out/<set_id>.takeoff.json` for corpus | `emit-corpus-takeoff.mjs` |

## Batch emit policy (coordinator-only, prewarm-first)

**No subagents.** The coordinator alone runs shell/tmux workers — no `Task`,
`computerUse`, or cloud workers for this batch.

Bulk emit must **not** cold-build `graphForPipeline()` inline per set. Order:

1. **Prewarm** — four shards, sidecar off: `npm run prewarm:corpus:shard{0,1,2,3}`
   from `opentakeoff/` (runs in `mcp/` via `node --import tsx`).
2. **Emit** — four shards, `--resume`: `npm run emit:corpus:shard{0,1,2,3}`.
   Warm cache → seconds per set → `out/<set_id>.takeoff.json`.
3. **Scoreboard** — `npm run eval:document-scoreboard` after 116/116 files exist. (Renamed from `eval:corpus` — that name collided with mcp/'s own `eval:corpus`, the actual hand-keyed 7-set scored corpus; this script's own gold is pipeline output, see opentakeoff-corpus/STATE.md.)

Do not restart workers mid-build (cache writes only after a full graph completes).
See also `opentakeoff-corpus/GOAL.md` § execution policy.
