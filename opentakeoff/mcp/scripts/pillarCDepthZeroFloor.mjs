/**
 * Pillar C DEPTH — verify compile-empty floors (no extractable BAS inventory / valve schedule rows).
 * Live compile only — NOT a claim that the job has zero physical valves or controls.
 * Drawing corroboration is a separate depth step. Patches GT drafts; still 0 gt_locked.
 *
 *   node --import tsx scripts/pillarCDepthZeroFloor.mjs bas [setId ...]
 *   node --import tsx scripts/pillarCDepthZeroFloor.mjs valve [setId ...]
 *   node --import tsx scripts/pillarCDepthZeroFloor.mjs all [setId ...]
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");
const GT_DIR = resolve(CORPUS, "takeoffs/pillar-c-gt");

const mode = process.argv[2];
const filterIds = new Set(process.argv.slice(3));
if (!mode || !["bas", "valve", "all"].includes(mode)) {
  console.error("usage: pillarCDepthZeroFloor.mjs <bas|valve|all> [setId ...]");
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

function patchGtDraft(setId, section) {
  const path = gtDraftPath(setId);
  let draft = { set_id: setId, gt_locked: false, pillar_c_complete: false };
  if (existsSync(path)) {
    try { draft = JSON.parse(readFileSync(path, "utf8")); } catch { /* fresh */ }
  }
  draft.depth_zero_floor_verify = {
    ...section,
    gt_locked: false,
    corroboration: "compile_only",
    note: "Compile-empty floor — zero extractable schedule rows from shared compile; not verified absent on drawings; still refuse_not_done until full estimator_complete",
  };
  draft.gt_locked = false;
  draft.pillar_c_complete = false;
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
}

async function verifyBasZero(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-depth-zero-bas");
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const bas = compileCorpusTakeoff(null, loaded.graph, "bas_points");
  const product = bas.estimator_product;
  const printed = bas.totals?.rows ?? 0;
  const inv = product?.equipment_inventory?.unit_count ?? 0;
  const targets = product?.plan_paint?.targets?.length ?? 0;
  const compileEmpty = printed === 0 && inv === 0 && targets === 0;
  const result = {
    set_id: key.set_id,
    kind: "bas_compile_empty_floor",
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - started),
    printed_bas_rows: printed,
    inventory_units: inv,
    plan_paint_targets: targets,
    soo: product?.soo?.status ?? "unknown",
    compile_empty: compileEmpty,
    honest_zero: compileEmpty, // legacy alias — means compile-empty, not "no valves on job"
    gt_locked: false,
  };
  if (compileEmpty) patchGtDraft(key.set_id, result);
  return result;
}

async function verifyValveZero(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-depth-zero-valve");
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const valves = compileCorpusTakeoff(null, loaded.graph, "control_valves");
  const items = valves.totals?.items ?? 0;
  const targets = valves.estimator_product?.plan_paint?.targets?.length ?? 0;
  const compileEmpty = items === 0 && targets === 0;
  const result = {
    set_id: key.set_id,
    kind: "valve_compile_empty_floor",
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - started),
    printed_items: items,
    plan_paint_targets: targets,
    compile_empty: compileEmpty,
    honest_zero: compileEmpty, // legacy alias — means no extractable valve schedule rows
    gt_locked: false,
  };
  // Do not patch valve GT drafts on compile-empty alone — PDF text scan shows
  // most compile-zero sets still contain valve/damper content (extraction gap).
  return result;
}

function defaultBasZeroIds() {
  const keyed = new Set(census.bas_keyed_ids || []);
  const out = [];
  for (const id of census.bas_bearing_names || []) {
    if (keyed.has(id)) continue;
    if ((census.valve_zero_floor_ids || []).includes(id)) {
      // still bas-bearing; check compile key
    }
    // Use precomputed list from width: zero inventory from census counts
  }
  // Derive from compile keys + estimator waves already recorded in GT or use all bas bearing minus keyed minus those with depth_plan_paint
  const depthInv = new Set();
  for (const f of ["batch1", "batch2", "batch3"]) {
    try {
      const j = JSON.parse(readFileSync(`/opt/cursor/artifacts/pillar-c-depth-bas-inventory-${f}.json`, "utf8"));
      for (const r of j.results || []) depthInv.add(r.set_id);
    } catch { /* optional */ }
  }
  for (const id of census.bas_bearing_names || []) {
    if (keyed.has(id)) continue;
    if (depthInv.has(id)) continue;
    out.push(id);
  }
  return out;
}

function defaultValveZeroIds() {
  return census.valve_zero_floor_ids || [];
}

const keyById = new Map(compileKeys().map((k) => [k.set_id, k]));

async function runBas(ids) {
  const results = [];
  const skipped = [];
  for (const id of ids) {
    const key = keyById.get(id);
    if (!key) { skipped.push({ set_id: id, skip: "no_compile_key" }); continue; }
    const row = await verifyBasZero(key);
    if (row.skip) skipped.push(row);
    else results.push(row);
  }
  return { results, skipped };
}

async function runValve(ids) {
  const results = [];
  const skipped = [];
  for (const id of ids) {
    const key = keyById.get(id);
    if (!key) { skipped.push({ set_id: id, skip: "no_compile_key" }); continue; }
    const row = await verifyValveZero(key);
    if (row.skip) skipped.push(row);
    else results.push(row);
  }
  return { results, skipped };
}

let basIds = [];
let valveIds = [];
if (filterIds.size) {
  basIds = [...filterIds];
  valveIds = [...filterIds];
} else if (mode === "bas") basIds = defaultBasZeroIds();
else if (mode === "valve") valveIds = defaultValveZeroIds();
else {
  basIds = defaultBasZeroIds();
  valveIds = defaultValveZeroIds();
}

const out = {
  as_of: new Date().toISOString(),
  mode: `depth_zero_floor_${mode}`,
  note: "Compile-empty floor live-verify — zero extractable schedule rows; not drawing-verified; still 0 gt_locked",
  locked: 0,
  bas: mode === "valve" ? null : await runBas(basIds),
  valve: mode === "bas" ? null : await runValve(valveIds),
};

if (out.bas) {
  out.bas_n = out.bas.results.length;
  out.bas_compile_empty = out.bas.results.filter((r) => r.compile_empty).length;
  out.bas_not_compile_empty = out.bas.results.filter((r) => !r.compile_empty);
  out.bas_honest = out.bas_compile_empty; // legacy alias
  out.bas_dishonest = out.bas_not_compile_empty;
}
if (out.valve) {
  out.valve_n = out.valve.results.length;
  out.valve_compile_empty = out.valve.results.filter((r) => r.compile_empty).length;
  out.valve_not_compile_empty = out.valve.results.filter((r) => !r.compile_empty);
  out.valve_honest = out.valve_compile_empty; // legacy alias
  out.valve_dishonest = out.valve_not_compile_empty;
}

const outPath = process.env.PILLAR_C_ARTIFACT
  || `/opt/cursor/artifacts/pillar-c-depth-zero-floor-${mode}.json`;
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({
  artifact: outPath,
  bas_compile_empty: out.bas_compile_empty,
  valve_compile_empty: out.valve_compile_empty,
}, null, 2));
