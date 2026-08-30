/**
 * Measure full production index time: loadPlan (text) + graphForPipeline (geo+ODL).
 * Usage: node --import tsx scripts/time-full-index.mjs [pdf…]
 */
import { writeFileSync, statSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Session } from "../src/session.ts";

const pdfs = process.argv.slice(2).length
  ? process.argv.slice(2).map((p) => resolve(p))
  : [
      resolve("../../opentakeoff-corpus/raw/navfac-cherry-point-atc-mechanical.pdf"),
      resolve("../samples/bessemer-mechanical-bidset.pdf"),
    ];

async function timeOne(pdf) {
  const s = new Session();
  const t0 = Date.now();
  await s.loadPlan(pdf);
  const t1 = Date.now();
  const g = await s.graphForPipeline();
  const t2 = Date.now();
  return {
    pdf: basename(pdf),
    pdf_mb: +(statSync(pdf).size / 1024 / 1024).toFixed(1),
    sheets: g.sheets.length,
    tables: g.tables.length,
    loadPlan_ms: t1 - t0,
    geo_odl_ms: t2 - t1,
    total_ms: t2 - t0,
    odl_note: (g.notes || []).find((n) => /OpenDataLoader/i.test(n)) || null,
  };
}

const results = [];
for (const pdf of pdfs) {
  const pass1 = await timeOne(pdf);
  const pass2 = await timeOne(pdf);
  results.push({ pass1, pass2 });
  console.error(`${basename(pdf)}: pass1=${pass1.total_ms}ms pass2=${pass2.total_ms}ms sheets=${pass1.sheets} tables=${pass1.tables}`);
}

const out = {
  definition: "full production index = loadPlan (all-page text) + graphForPipeline (geometric schedule tables + ODL JVM enhance). Excludes tile rasters, full vector geometry for every sheet, and MEP connectivity graphs.",
  cold_odl_note: "With empty ODL disk cache, NAVFAC historically cost 12+ minutes of JVM/ODL per eval (mcp/src/opendataloader.ts). Warm cache: ODL near-instant; remaining time is geometric build + merge.",
  measured_at: new Date().toISOString(),
  results,
};
mkdirSync("/opt/cursor/artifacts", { recursive: true });
writeFileSync("/opt/cursor/artifacts/full-index-timing.json", JSON.stringify(out, null, 2));
process.stdout.write(JSON.stringify(out, null, 2) + "\n");
