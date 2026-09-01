/**
 * Rescore all bulk HVAC_BAS sets after extract fixes.
 * node --import tsx scripts/rescore-bulk-all.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { Session } from "../src/session.ts";
import {
  compileHvacTakeoff,
  compileBasTakeoff,
  compileControlValveTakeoff,
} from "../../web/src/lib/corpusTakeoff.mjs";

const BULK = "/workspace/opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets";
const REJOIN = path.join(BULK, "_rejoined");

function listSets() {
  const ids = new Set();
  for (const f of fs.readdirSync(BULK)) {
    if (f.startsWith("_") || f.startsWith("DOWNLOAD") || f.startsWith("REJOIN") || f.startsWith("INDEX")) continue;
    if (f.endsWith(".pdf")) ids.add(f.replace(/\.pdf$/, ""));
    else if (fs.statSync(path.join(BULK, f)).isDirectory() && !f.startsWith("_")) ids.add(f);
  }
  return [...ids].sort();
}

function pdfFor(id) {
  const rejoin = path.join(REJOIN, `${id}.pdf`);
  if (fs.existsSync(rejoin)) return { pdf: rejoin, source: "rejoined" };
  const single = path.join(BULK, `${id}.pdf`);
  if (fs.existsSync(single)) return { pdf: single, source: "single" };
  return null;
}

const rows = [];
for (const id of listSets()) {
  const loc = pdfFor(id);
  if (!loc) {
    console.log("SKIP", id);
    continue;
  }
  const t0 = Date.now();
  try {
    const s = new Session();
    await s.loadPlan(loc.pdf);
    const g = await s.graphForPipeline();
    const hvac = compileHvacTakeoff(s, g);
    const bas = compileBasTakeoff(s, g);
    const valve = compileControlValveTakeoff(s, g);
    const cats = Object.entries(hvac.categories || {})
      .filter(([, v]) => v?.count > 0)
      .map(([k, v]) => `${k}:${v.count}`)
      .join("|");
    const h = hvac.totals?.items ?? 0;
    const tier = h >= 5 ? "MEAT" : h >= 1 ? "WEAK" : "ZERO";
    const row = {
      id,
      source: loc.source,
      sheets: g.sheets?.length ?? 0,
      tables: g.tables?.length ?? 0,
      hvac: h,
      bas: bas.totals?.items ?? 0,
      valve: valve.totals?.items ?? 0,
      cats,
      ms: Date.now() - t0,
      tier,
    };
    rows.push(row);
    console.log(`${tier} ${id} h=${h} t=${row.tables} [${loc.source}] ${cats || "-"}`);
  } catch (e) {
    console.error("FAIL", id, e.message);
    rows.push({ id, error: e.message, tier: "FAIL" });
  }
}

const meat = rows.filter((r) => r.tier === "MEAT").length;
const weak = rows.filter((r) => r.tier === "WEAK").length;
const zero = rows.filter((r) => r.tier === "ZERO").length;
const summary = { total: rows.length, meat, weak, zero };
console.log("\n=== RESCORE ===", JSON.stringify(summary));
fs.writeFileSync("/opt/cursor/artifacts/bulk-all30-rescore.json", JSON.stringify({ summary, rows }, null, 2));
