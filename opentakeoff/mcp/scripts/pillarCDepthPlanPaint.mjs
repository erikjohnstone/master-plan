/**
 * Pillar C DEPTH — full plan-paint sweep on ALL targets (not width samples).
 * Uses width material map; records per-set tallies + updates GT draft stubs.
 *
 *   node --import tsx scripts/pillarCDepthPlanPaint.mjs bas [setId ...]
 *   node --import tsx scripts/pillarCDepthPlanPaint.mjs valve [setId ...]
 */
import { writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { sweepBasServedMark } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");
const GT_DIR = resolve(CORPUS, "takeoffs/pillar-c-gt");

const mode = process.argv[2];
const filterIds = new Set(process.argv.slice(3));
if (!mode || !["bas", "valve"].includes(mode)) {
  console.error("usage: pillarCDepthPlanPaint.mjs <bas|valve> [setId ...]");
  process.exit(2);
}

function compileKeys() {
  return readdirSync(CROSS)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => JSON.parse(readFileSync(resolve(CROSS, f), "utf8")));
}

function tallyStatus() {
  return { MATCH: 0, SCHEDULE_ONLY: 0, AMBIGUOUS: 0, ERROR: 0 };
}

function gtDraftPath(setId) {
  const direct = resolve(GT_DIR, `${setId}.gt.draft.json`);
  if (existsSync(direct)) return direct;
  const alt = readdirSync(GT_DIR).find((f) => f.includes(setId.slice(0, 20)) && f.endsWith(".gt.draft.json"));
  return alt ? resolve(GT_DIR, alt) : direct;
}

function patchGtDraft(setId, section) {
  const path = gtDraftPath(setId);
  let draft = { set_id: setId, gt_locked: false, pillar_c_complete: false };
  if (existsSync(path)) {
    try { draft = JSON.parse(readFileSync(path, "utf8")); } catch { /* fresh stub */ }
  }
  draft.depth_plan_paint_full = {
    ...section,
    gt_locked: false,
    note: "Full target sweep — depth phase; refuse_not_done until estimator_complete gates close",
  };
  draft.gt_locked = false;
  draft.pillar_c_complete = false;
  writeFileSync(path, `${JSON.stringify(draft, null, 2)}\n`);
}

async function depthBas(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-depth-bas");
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };

  const { session, graph } = loaded;
  const bas = compileCorpusTakeoff(null, graph, "bas_points");
  const targets = bas.estimator_product?.plan_paint?.targets || [];
  if (!targets.length) return { set_id: key.set_id, skip: "no_plan_paint_targets" };

  const tallies = tallyStatus();
  const rows = [];
  for (const t of targets) {
    const out = await sweepBasServedMark(session, t.tag, {
      evaluationFast: true,
      preferTitle: t.prefer_schedule_title || null,
      preferSheet: t.prefer_schedule_sheet || null,
    });
    tallies[out.status] = (tallies[out.status] ?? 0) + 1;
    rows.push({
      tag: t.tag,
      source: t.source || null,
      status: out.status,
      preferTitle: t.prefer_schedule_title || null,
    });
  }

  const result = {
    set_id: key.set_id,
    kind: "bas_depth_plan_paint_full",
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - started),
    printed_bas_rows: bas.totals?.rows ?? 0,
    inventory_units: bas.estimator_product?.equipment_inventory?.unit_count ?? 0,
    targets_total: targets.length,
    tallies,
    estimator_complete: false,
    gt_locked: false,
  };
  patchGtDraft(key.set_id, result);
  return result;
}

async function depthValve(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-depth-valve");
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };

  const { session, graph } = loaded;
  const valve = compileCorpusTakeoff(null, graph, "control_valves");
  const targets = valve.estimator_product?.plan_paint?.targets || [];
  if (!targets.length) return { set_id: key.set_id, skip: "no_valve_plan_paint_targets" };

  const tallies = tallyStatus();
  for (const t of targets) {
    const out = await sweepBasServedMark(session, t.tag, {
      evaluationFast: true,
      preferTitle: t.prefer_schedule_title || null,
      preferSheet: t.prefer_schedule_sheet || null,
    });
    tallies[out.status] = (tallies[out.status] ?? 0) + 1;
  }

  const result = {
    set_id: key.set_id,
    kind: "valve_depth_plan_paint_full",
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - started),
    printed_items: valve.totals?.items ?? 0,
    targets_total: targets.length,
    tallies,
    estimator_complete: false,
    gt_locked: false,
  };
  patchGtDraft(key.set_id, result);
  return result;
}

const census = JSON.parse(readFileSync(resolve(CORPUS, "takeoffs/pillar-c-census.json"), "utf8"));

const keys = compileKeys().filter((key) => {
  if (filterIds.size) return filterIds.has(key.set_id);
  if (mode === "bas") return (census.bas_keyed_ids || []).includes(key.set_id);
  return (census.valve_keyed_ids || []).includes(key.set_id);
});

const results = [];
const skipped = [];
for (const key of keys) {
  const row = mode === "bas" ? await depthBas(key) : await depthValve(key);
  if (row.skip) skipped.push(row);
  else results.push(row);
}

const out = {
  as_of: new Date().toISOString(),
  mode: `depth_${mode}_plan_paint_full`,
  note: "Pillar C DEPTH — full target sweep; width material applied; still 0 gt_locked",
  locked: 0,
  n: results.length,
  skipped_n: skipped.length,
  results,
  skipped,
};

const outPath = process.env.PILLAR_C_ARTIFACT
  || `/opt/cursor/artifacts/pillar-c-depth-${mode}-plan-paint-batch.json`;
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ artifact: outPath, n: out.n, skipped_n: out.skipped_n }, null, 2));
