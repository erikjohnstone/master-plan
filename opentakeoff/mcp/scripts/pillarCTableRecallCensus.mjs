/**
 * Pillar C GT harness — table recall + compile census on shared vector pipeline.
 * Measures graph.tables with valve/BAS marks, not compile alone.
 *
 *   node --import tsx scripts/pillarCTableRecallCensus.mjs valve [setId ...]
 *   node --import tsx scripts/pillarCTableRecallCensus.mjs bas [setId ...]
 *   node --import tsx scripts/pillarCTableRecallCensus.mjs all [setId ...]
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedGraphForKey } from "../test/helpers/loadKeySession.mjs";
import { pipelineHarnessSnapshot } from "../../web/src/lib/pipelineHarness.mjs";
import { VECTOR_PIPELINE_CACHE_ID } from "./graphCacheConstants.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");
const GT_DIR = resolve(CORPUS, "takeoffs/pillar-c-gt");
// Was its own private "vector-stack-table-recall-v1" string — meant this
// script's cold builds never benefited from (or contributed to) the shared
// graph cache prewarm-corpus-graph.mjs/emit-corpus-takeoff.mjs use, so every
// set was paying the full cold-build cost on every run regardless of
// prewarming. graphCacheConstants.mjs's own comment says all corpus tools
// must share this identity — this one didn't.
const CACHE_ID = VECTOR_PIPELINE_CACHE_ID;

const mode = process.argv[2];
const filterIds = new Set(process.argv.slice(3));
if (!mode || !["valve", "bas", "all"].includes(mode)) {
  console.error("usage: pillarCTableRecallCensus.mjs <valve|bas|all> [setId ...]");
  process.exit(2);
}

const census = JSON.parse(readFileSync(resolve(CORPUS, "takeoffs/pillar-c-census.json"), "utf8"));

function compileKeys() {
  return readdirSync(CROSS)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => JSON.parse(readFileSync(resolve(CROSS, f), "utf8")));
}

function gtDraftPath(setId) {
  const direct = resolve(GT_DIR, `${setId}.gt.draft.json`);
  if (existsSync(direct)) return direct;
  const alt = readdirSync(GT_DIR).find((f) => f.startsWith(setId.slice(0, 6)) && f.endsWith(".gt.draft.json"));
  return alt ? resolve(GT_DIR, alt) : direct;
}

function patchGtHarness(setId, harness) {
  const path = gtDraftPath(setId);
  let draft = { set_id: setId, gt_locked: false, pillar_c_complete: false };
  if (existsSync(path)) {
    try {
      draft = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      /* fresh */
    }
  }
  draft.pipeline_harness = {
    ...harness,
    cache_identity: CACHE_ID,
    gt_locked: false,
    corroboration: "pipeline_graph_and_compile",
    note: "Graph valve/BAS table recall + compile on shared vector stack — not coordinator-verified alone",
  };
  draft.gt_locked = false;
  draft.pillar_c_complete = false;
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
}

function targetIds() {
  const valve = new Set(census.valve_bearing_names || []);
  const bas = new Set(census.bas_bearing_names || []);
  const keys = compileKeys();
  return keys.filter((k) => {
    if (filterIds.size) return filterIds.has(k.set_id);
    if (mode === "valve") return valve.has(k.set_id);
    if (mode === "bas") return bas.has(k.set_id);
    return valve.has(k.set_id) || bas.has(k.set_id);
  });
}

async function censusOne(key) {
  const started = performance.now();
  const graph = await cachedGraphForKey(CORPUS, key, CACHE_ID);
  if (!graph) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const valves = compileCorpusTakeoff(null, graph, "control_valves");
  const bas = compileCorpusTakeoff(null, graph, "bas_points");
  const harness = pipelineHarnessSnapshot(graph, valves, bas);

  const row = {
    set_id: key.set_id,
    ms: Math.round(performance.now() - started),
    sheets: graph?.sheets?.length ?? 0,
    ...harness,
    gt_locked: false,
  };
  patchGtHarness(key.set_id, row);
  return row;
}

const keys = targetIds();
const results = [];
const skipped = [];
for (const key of keys) {
  try {
    const row = await censusOne(key);
    if (row.skip) skipped.push(row);
    else results.push(row);
    if (results.length % 5 === 0 && results.length) {
      console.error(`progress ${results.length}/${keys.length} …`);
    }
  } catch (e) {
    skipped.push({ set_id: key.set_id, skip: "error", detail: String(e?.message || e).slice(0, 200) });
  }
}

const valveRows = results.filter((r) => (census.valve_bearing_names || []).includes(r.set_id));
const basRows = results.filter((r) => (census.bas_bearing_names || []).includes(r.set_id));

const summary = {
  n: results.length,
  skipped_n: skipped.length,
  valve_sets: valveRows.length,
  valve_graph_tables_gt0: valveRows.filter((r) => r.graph_valve?.tables > 0).length,
  valve_compile_gt0: valveRows.filter((r) => r.compile_valve_items > 0).length,
  valve_graph_without_compile: valveRows.filter((r) => r.valve_graph_without_compile).length,
  valve_compile_without_graph: valveRows.filter((r) => r.compile_without_graph_valve).length,
  bas_sets: basRows.length,
  bas_graph_tables_gt0: basRows.filter((r) => r.graph_bas?.tables > 0).length,
  bas_compile_gt0: basRows.filter((r) => r.compile_bas_rows > 0).length,
  bas_graph_without_compile: basRows.filter((r) => r.bas_graph_without_compile).length,
  ocr_assists: results.filter((r) => (r.vector_pipeline?.ocr_assists ?? 0) > 0).length,
  l2_fallback_tables: results.filter((r) =>
    (r.vector_pipeline?.tables_added ?? 0) + (r.vector_pipeline?.tables_replaced ?? 0) > 0,
  ).length,
};

const out = {
  as_of: new Date().toISOString(),
  cache_identity: CACHE_ID,
  mode,
  note: "GT harness table recall census — graph.tables valve/BAS marks + compile on vector stack v1",
  gt_locked: 0,
  summary,
  results,
  skipped,
};

const outPath = process.env.PILLAR_C_ARTIFACT
  || `/opt/cursor/artifacts/pillar-c-table-recall-census-${mode}.json`;
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, artifact: outPath }, null, 2));
