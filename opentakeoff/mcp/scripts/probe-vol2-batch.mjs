/**
 * Probe unkeyed Vol2 PDFs (singles or rejoined multipart) on Session+ODL.
 * Usage: node --import tsx scripts/probe-vol2-batch.mjs 048 012 088 ...
 * Prefers bulk/.../_rejoined/<id>.pdf, else single PDF, else merge parts dir.
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
const REJOINED = resolve(VOL2, "_rejoined");

const prefixes = process.argv.slice(2).map((p) => String(p).padStart(3, "0"));
if (!prefixes.length) {
  console.error("usage: probe-vol2-batch.mjs <id> [id...]");
  process.exit(2);
}

function liveCats(hvac) {
  const out = {};
  for (const [name, cat] of Object.entries(hvac.categories || {})) {
    const n = cat?.count ?? cat?.items?.length ?? 0;
    if (n > 0) out[name] = n;
  }
  return out;
}

function resolveTargets(prefix) {
  const out = [];
  if (existsSync(REJOINED)) {
    for (const f of readdirSync(REJOINED)) {
      if (f.endsWith(".pdf") && (f.startsWith(prefix + "_") || f.startsWith(prefix))) {
        out.push({ setId: basename(f, ".pdf"), pdf: resolve(REJOINED, f), via: "rejoined" });
      }
    }
  }
  if (out.length) return out;
  for (const f of readdirSync(VOL2)) {
    if (f.endsWith(".pdf") && (f.startsWith(prefix + "_") || f.startsWith(prefix))) {
      out.push({ setId: basename(f, ".pdf"), pdf: resolve(VOL2, f), via: "single" });
    }
  }
  if (out.length) return out;
  for (const d of readdirSync(VOL2, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (!(d.name.startsWith(prefix + "_") || d.name.startsWith(prefix))) continue;
    const dir = resolve(VOL2, d.name);
    const parts = readdirSync(dir).filter((f) => f.endsWith(".pdf")).sort();
    if (!parts.length) continue;
    out.push({ setId: d.name, partsDir: dir, parts, via: "parts" });
  }
  return out;
}

const targets = prefixes.flatMap(resolveTargets);
if (!targets.length) {
  console.error("no Vol2 PDF/parts matched", prefixes.join(","));
  process.exit(2);
}

for (const t of targets) {
  const t0 = Date.now();
  const setId = t.setId;
  try {
    const graph = await cachedSheetGraph(t.pdf || t.partsDir, {
      identity: [setId, "vol2-probe", t.via],
      compute: async () => {
        const session = new Session();
        if (t.pdf) {
          await session.loadPlan(t.pdf);
        } else {
          await session.loadPlan(resolve(t.partsDir, t.parts[0]));
          for (let i = 1; i < t.parts.length; i++) {
            await session.loadPlan(resolve(t.partsDir, t.parts[i]), { merge: true });
          }
        }
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
      via: t.via,
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
      via: t.via,
      error: String(e?.stack || e).slice(0, 500),
      ms: Date.now() - t0,
    }));
  }
}
