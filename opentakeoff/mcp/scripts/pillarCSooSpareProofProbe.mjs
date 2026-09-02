/**
 * Pillar C — SOO + spare/proof column probe on keyed BAS sets (shared path).
 *
 *   node --import tsx scripts/pillarCSooSpareProofProbe.mjs [setId ...]
 */
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const filterIds = new Set(process.argv.slice(2));
const keyedDefault = JSON.parse(
  readFileSync(resolve(CORPUS, "takeoffs/pillar-c-census.json"), "utf8"),
).bas_keyed_ids || [];

async function probeOne(key) {
  const loaded = await loadCachedKeySession(CORPUS, key, "pillar-c-soo-spare-proof");
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const { graph } = loaded;
  const bas = compileCorpusTakeoff(null, graph, "bas_points");
  return {
    set_id: key.set_id,
    printed_bas_rows: bas.totals.rows ?? 0,
    soo: bas.estimator_product?.soo,
    controls_column_probe: bas.estimator_product?.controls_column_probe,
    spare_io_policy: bas.estimator_product?.spare_io_policy,
    estimator_gates: bas.estimator_status?.gates?.filter((g) =>
      ["soo_derived_points", "spare_io_capacity", "proofs_interlocks_alarms_trends_beyond_printed"].includes(g.gate),
    ),
    gt_locked: false,
    estimator_complete: false,
  };
}

const keys = readdirSync(CROSS)
  .filter((f) => f.endsWith(".compile.json"))
  .map((f) => JSON.parse(readFileSync(resolve(CROSS, f), "utf8")))
  .filter((key) => {
    if (filterIds.size) return filterIds.has(key.set_id);
    return keyedDefault.includes(key.set_id);
  });

const results = [];
const skipped = [];
for (const key of keys) {
  const row = await probeOne(key);
  if (row.skip) skipped.push(row);
  else results.push(row);
}

const out = {
  as_of: new Date().toISOString(),
  note: "Keyed BAS SOO/spare/proof probe — refuse_not_done; never invent points",
  locked: 0,
  n: results.length,
  skipped_n: skipped.length,
  soo_present: results.filter((r) => r.soo?.present).length,
  proof_spare_columns: results.filter((r) =>
    (r.controls_column_probe?.proof_interlock_column_headers?.length ?? 0) > 0
    || (r.controls_column_probe?.spare_io_column_headers?.length ?? 0) > 0,
  ).length,
  results,
  skipped,
};

const outPath = process.env.PILLAR_C_ARTIFACT
  || "/opt/cursor/artifacts/pillar-c-soo-spare-proof-keyed-batch.json";
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...out, artifact: outPath }, null, 2));
