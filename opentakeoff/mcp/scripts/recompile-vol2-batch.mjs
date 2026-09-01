/**
 * Recompile Vol2 key PDFs and print category/totals vs locked keys.
 * Usage: node --import tsx scripts/recompile-vol2-batch.mjs [set_id_prefix...]
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const CORPUS = resolve(ROOT, "opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const prefixes = process.argv.slice(2);
const keys = readdirSync(CROSS)
  .filter((f) => f.endsWith(".compile.json"))
  .filter((f) => !prefixes.length || prefixes.some((p) => f.startsWith(p)))
  .sort();

async function graphForPdf(pdf, setId) {
  return cachedSheetGraph(pdf, {
    identity: [setId, "vol2-recompile"],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(pdf);
      return session.graphForPipeline();
    },
  });
}

function liveCats(hvac) {
  const out = {};
  for (const [name, cat] of Object.entries(hvac.categories || {})) {
    const n = cat?.count ?? cat?.items?.length ?? 0;
    if (n > 0) out[name] = n;
  }
  return out;
}

for (const f of keys) {
  const t0 = Date.now();
  try {
    const key = JSON.parse(readFileSync(resolve(CROSS, f), "utf8"));
    const pdf = resolve(CORPUS, key.source_file);
    if (!existsSync(pdf)) {
      console.log(JSON.stringify({ set: key.set_id, error: "missing_pdf", ms: Date.now() - t0 }));
      continue;
    }
    const graph = await graphForPdf(pdf, key.set_id);
    const hvac = compileCorpusTakeoff(null, graph, "hvac_equipment");
    const bas = compileCorpusTakeoff(null, graph, "bas_points");
    const cats = liveCats(hvac);
    const items = hvac.totals?.items ?? 0;
    const basRows = bas.totals?.rows ?? bas.categories?.points_lists?.totals?.rows ?? 0;
    const lockCats = key.categories || {};
    const catDiff = {};
    for (const k of new Set([...Object.keys(lockCats), ...Object.keys(cats)])) {
      const a = lockCats[k] ?? 0;
      const b = cats[k] ?? 0;
      if (a !== b) catDiff[k] = { locked: a, live: b };
    }
    const match = items === (key.totals?.items ?? 0) && Object.keys(catDiff).length === 0;
    console.log(JSON.stringify({
      set: key.set_id.slice(0, 48),
      match,
      items: { locked: key.totals?.items, live: items },
      bas: { locked: key.bas_points?.rows, live: basRows },
      catDiff: Object.keys(catDiff).length ? catDiff : undefined,
      ms: Date.now() - t0,
    }));
  } catch (e) {
    console.log(JSON.stringify({ set: f, error: String(e?.stack || e).slice(0, 500), ms: Date.now() - t0 }));
  }
}
