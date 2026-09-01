/**
 * Pillar C — valve/damper plan-paint census on the shared Session path.
 *
 *   node --import tsx scripts/pillarCValvePlanPaintCensus.mjs [setId ...]
 *
 * Sweeps estimator_product.plan_paint targets via sweepBasServedMark + preferTitle.
 */
import { writeFileSync } from "node:fs";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { sweepBasServedMark } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const filterIds = new Set(process.argv.slice(2));

function compileKeys() {
  return readdirSync(CROSS)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => {
      const keyPath = resolve(CROSS, f);
      const key = JSON.parse(readFileSync(keyPath, "utf8"));
      return { keyPath, key };
    });
}

function tallyStatus() {
  return { MATCH: 0, SCHEDULE_ONLY: 0, AMBIGUOUS: 0, ERROR: 0 };
}

async function censusOne(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-valve-plan-paint");
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };

  const { session, graph } = loaded;
  const valve = compileCorpusTakeoff(null, graph, "control_valves");
  const product = valve.estimator_product;
  const targets = product?.plan_paint?.targets || [];
  if (!targets.length) return { set_id: key.set_id, skip: "no_valve_plan_paint_targets" };

  const sample = targets.slice(0, Math.min(targets.length, filterIds.size ? targets.length : 12));
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
      family: t.family || null,
      preferTitle: t.prefer_schedule_title || null,
      preferSheet: t.prefer_schedule_sheet || null,
      status: out.status,
      found: out.found ?? 0,
      cites: out.cites ?? 0,
    });
  }

  return {
    set_id: key.set_id,
    kind: "valve_plan_paint_preferTitle",
    at: new Date().toISOString(),
    ms: Math.round(performance.now() - started),
    gt_locked: false,
    printed_items: product.printed_items ?? valve.totals.items ?? 0,
    plan_paint_targets: targets.length,
    sampled_tags: sample.length,
    tallies,
    status: "refuse_not_done",
    estimator_complete: false,
    sample: rows.slice(0, 6),
  };
}

const valveKeyed = new Set(
  JSON.parse(readFileSync(resolve(CORPUS, "takeoffs/pillar-c-census.json"), "utf8")).valve_keyed_ids || [],
);

const keys = compileKeys().filter(({ key }) => {
  if (filterIds.size && !filterIds.has(key.set_id)) return false;
  if (!filterIds.size) return valveKeyed.has(key.set_id);
  return true;
});

const results = [];
for (const { key } of keys) {
  const row = await censusOne(key);
  if (!row.skip) results.push(row);
}

const out = {
  as_of: new Date().toISOString(),
  note: "Pillar C valve plan-paint census — sweepBasServedMark + preferTitle; still 0 locked",
  locked: 0,
  n: results.length,
  with_match: results.filter((r) => (r.tallies?.MATCH ?? 0) > 0).length,
  results,
};

const outPath = process.env.PILLAR_C_ARTIFACT
  || "/opt/cursor/artifacts/pillar-c-valve-plan-paint-census-batch.json";
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, artifact: outPath }, null, 2));
