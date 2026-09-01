/**
 * Probe unkeyed Vol2 PDFs on the shared Session+ODL compile path.
 * Usage: node --import tsx scripts/probe-vol2-batch.mjs 048 049 050 ...
 * Prints HVAC cats / BAS rows / valve items — no key writes.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const CORPUS = resolve(ROOT, "opentakeoff-corpus");
const VOL2 = resolve(CORPUS, "bulk/HVAC_BAS_Plan_Sets_Vol2");

const prefixes = process.argv.slice(2).map((p) => String(p).padStart(3, "0"));
if (!prefixes.length) {
  console.error("usage: probe-vol2-batch.mjs <id> [id...]");
  process.exit(2);
}

const pdfs = readdirSync(VOL2)
  .filter((f) => f.endsWith(".pdf"))
  .filter((f) => prefixes.some((p) => f.startsWith(p + "_") || f.startsWith(p)))
  .sort();

function liveCats(hvac) {
  const out = {};
  for (const [name, cat] of Object.entries(hvac.categories || {})) {
    const n = cat?.count ?? cat?.items?.length ?? 0;
    if (n > 0) out[name] = n;
  }
  return out;
}

for (const f of pdfs) {
  const t0 = Date.now();
  const setId = basename(f, ".pdf");
  const pdf = resolve(VOL2, f);
  try {
    if (!existsSync(pdf)) {
      console.log(JSON.stringify({ set: setId, error: "missing_pdf" }));
      continue;
    }
    const graph = await cachedSheetGraph(pdf, {
      identity: [setId, "vol2-probe"],
      compute: async () => {
        const session = new Session();
        await session.loadPlan(pdf);
        return session.graphForPipeline();
      },
    });
    const hvac = compileCorpusTakeoff(null, graph, "hvac_equipment");
    const bas = compileCorpusTakeoff(null, graph, "bas_points");
    const valve = compileCorpusTakeoff(null, graph, "control_valves");
    const cats = liveCats(hvac);
    const items = hvac.totals?.items ?? 0;
    const basRows = bas.totals?.rows ?? bas.categories?.points_lists?.totals?.rows ?? 0;
    const valveItems = valve.totals?.items ?? 0;
    const tier = items >= 12 ? "MEAT" : items >= 1 ? "WEAK" : "ZERO";
    console.log(JSON.stringify({
      set: setId.slice(0, 52),
      tier,
      items,
      bas: basRows,
      valves: valveItems,
      cats,
      ms: Date.now() - t0,
    }));
  } catch (e) {
    console.log(JSON.stringify({
      set: setId.slice(0, 52),
      error: String(e?.stack || e).slice(0, 500),
      ms: Date.now() - t0,
    }));
  }
}
