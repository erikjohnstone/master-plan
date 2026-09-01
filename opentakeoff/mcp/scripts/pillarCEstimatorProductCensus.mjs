/**
 * Pillar C WIDTH — live estimator_product census on shared Session path.
 * Records printed BAS, inventory, estimate_only, valves — never locks GT.
 *
 *   node --import tsx scripts/pillarCEstimatorProductCensus.mjs [setId ...]
 */
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const filterIds = new Set(process.argv.slice(2));

function compileKeys() {
  return readdirSync(CROSS)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => {
      const key = JSON.parse(readFileSync(resolve(CROSS, f), "utf8"));
      return { key };
    });
}

function refuseGates(status) {
  return (status?.gates || [])
    .filter((g) => g.status === "refuse_not_done")
    .map((g) => g.gate);
}

async function censusOne(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-estimator-product");
  if (!loaded) {
    return { id: key.set_id, skip: "pdf_or_parts_missing" };
  }
  const { graph } = loaded;
  const bas = compileCorpusTakeoff(null, graph, "bas_points");
  const valves = compileCorpusTakeoff(null, graph, "control_valves");
  const product = bas.estimator_product;
  const vest = valves.estimator_product;
  return {
    id: key.set_id,
    pdf: key.pdf || null,
    ms: Math.round(performance.now() - started),
    sheets: graph?.sheets?.length ?? 0,
    tables: graph?.tables?.length ?? 0,
    bas: {
      printed_rows: bas.totals?.rows ?? 0,
      lists: bas.totals?.lists ?? 0,
      inventory_units: product?.equipment_inventory?.unit_count ?? 0,
      estimate_only_points: product?.schedule_derived_estimate?.totals?.points ?? 0,
      never_merged: true,
      gap_count: product?.gap_vs_printed?.inventory_without_printed_points_count ?? 0,
      soo: product?.soo?.status ?? "unknown",
      plan_paint_targets: product?.plan_paint?.targets?.length ?? 0,
      estimator_complete: false,
      gt_locked: false,
      refuse_gates: refuseGates(bas.estimator_status),
    },
    valves: {
      printed_items: valves.totals?.items ?? 0,
      families: Object.keys(valves.categories || {}),
      contractor_gaps: vest?.contractor_column_coverage?.missing_on_some_rows ?? [],
      plan_paint_targets: vest?.plan_paint?.targets?.length ?? 0,
      estimator_complete: false,
      gt_locked: false,
    },
  };
}

const bearing = new Set(
  JSON.parse(readFileSync(resolve(CORPUS, "takeoffs/pillar-c-census.json"), "utf8")).bas_bearing_names || [],
);

const keys = compileKeys().filter(({ key }) => {
  if (filterIds.size) return filterIds.has(key.set_id);
  return bearing.has(key.set_id);
});

const results = [];
const skipped = [];
for (const { key } of keys) {
  const row = await censusOne(key);
  if (row.skip) skipped.push(row);
  else results.push(row);
}

const out = {
  as_of: new Date().toISOString(),
  note: "Pillar C WIDTH estimator_product census — shared compile; still 0 locked",
  locked: 0,
  n: results.length,
  skipped_n: skipped.length,
  with_printed_bas: results.filter((r) => r.bas.printed_rows > 0).length,
  with_inventory: results.filter((r) => r.bas.inventory_units > 0).length,
  with_valves: results.filter((r) => r.valves.printed_items > 0).length,
  any_locked: false,
  results,
  skipped,
};

const outPath = process.env.PILLAR_C_ARTIFACT
  || "/opt/cursor/artifacts/pillar-c-estimator-product-census-wave.json";
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, artifact: outPath, summary: {
  n: out.n,
  with_printed_bas: out.with_printed_bas,
  with_inventory: out.with_inventory,
  with_valves: out.with_valves,
} }, null, 2));
