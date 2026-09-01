/**
 * Pillar C — BAS plan-paint census on the shared Session path.
 *
 *   node --import tsx scripts/pillarCBasPlanPaintCensus.mjs inventory [setId ...]
 *   node --import tsx scripts/pillarCBasPlanPaintCensus.mjs keyed-served [setId ...]
 *
 * Writes JSON to stdout; redirect to /opt/cursor/artifacts/ for coordinator records.
 */
import { writeFileSync } from "node:fs";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { sweepBasServedMark } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const mode = process.argv[2];
const filterIds = new Set(process.argv.slice(3));
if (!mode || !["inventory", "keyed-served"].includes(mode)) {
  console.error("usage: pillarCBasPlanPaintCensus.mjs <inventory|keyed-served> [setId ...]");
  process.exit(2);
}

function compileKeys() {
  return readdirSync(CROSS)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => {
      const keyPath = resolve(CROSS, f);
      const key = JSON.parse(readFileSync(keyPath, "utf8"));
      return { file: f, keyPath, key };
    });
}

function tallyStatus() {
  return { MATCH: 0, SCHEDULE_ONLY: 0, AMBIGUOUS: 0, ERROR: 0 };
}

async function censusOne(key, keyPath, { servedOnly = false } = {}) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-plan-paint");
  if (!loaded) {
    return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  }
  const { session, graph } = loaded;
  const hvac = compileCorpusTakeoff(null, graph, "hvac_equipment");
  const bas = compileCorpusTakeoff(null, graph, "bas_points");
  const product = bas.estimator_product;
  if (!product?.plan_paint?.targets?.length) {
    return { set_id: key.set_id, skip: "no_plan_paint_targets" };
  }

  let targets = product.plan_paint.targets;
  if (servedOnly) {
    // Keyed BAS: sweep full plan_paint target list (inventory + served_equipment).
    targets = product.plan_paint.targets;
  } else {
    targets = targets.filter((t) => t.source === "inventory");
  }
  if (!targets.length) {
    return { set_id: key.set_id, skip: servedOnly ? "no_served_targets" : "no_inventory_targets" };
  }

  const sample = targets.slice(0, mode === "inventory" ? 8 : targets.length);
  const tallies = tallyStatus();
  const rows = [];
  for (const t of sample) {
    const out = await sweepBasServedMark(session, t.tag, {
      evaluationFast: true,
      preferTitle: t.prefer_schedule_title || null,
      preferSheet: t.prefer_schedule_sheet || null,
    });
    tallies[out.status] = (tallies[out.status] ?? 0) + 1;
    rows.push({
      tag: t.tag,
      source: t.source,
      preferTitle: t.prefer_schedule_title || null,
      preferSheet: t.prefer_schedule_sheet || null,
      status: out.status,
      found: out.found ?? 0,
      cites: out.cites ?? 0,
      reason: out.reason?.slice(0, 200) || null,
    });
  }

  return {
    set_id: key.set_id,
    kind: servedOnly ? "bas_served_plan_paint_preferTitle" : "bas_inventory_plan_paint_preferTitle",
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - started),
    gt_locked: false,
    printed_bas_rows: bas.totals.rows ?? bas.totals.items ?? 0,
    inventory_units: product.equipment_inventory?.unit_count ?? 0,
    served_targets: servedOnly ? sample.length : undefined,
    sampled_tags: sample.length,
    tallies,
    status: "refuse_not_done",
    estimator_complete: false,
    sample: rows.slice(0, 6),
  };
}

const keys = compileKeys().filter(({ key }) => {
  if (filterIds.size && !filterIds.has(key.set_id)) return false;
  if (mode === "keyed-served") return (key.bas_points?.rows ?? 0) > 0;
  return (key.bas_points?.rows ?? 0) === 0;
});

const results = [];
for (const { key, keyPath } of keys) {
  const row = await censusOne(key, keyPath, { servedOnly: mode === "keyed-served" });
  if (!row.skip) results.push(row);
}

const out = {
  as_of: new Date().toISOString(),
  mode,
  note: "Pillar C plan-paint census — shared sweepBasServedMark + preferTitle/sheet; still 0 locked",
  locked: 0,
  n: results.length,
  with_match: results.filter((r) => (r.tallies?.MATCH ?? 0) > 0).length,
  results,
};

const outPath = process.env.PILLAR_C_ARTIFACT
  || `/opt/cursor/artifacts/pillar-c-plan-paint-census-${mode}-wave.json`;
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, artifact: outPath }, null, 2));
