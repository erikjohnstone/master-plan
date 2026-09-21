/**
 * Export the Siemens "Global Valves" mass-sizing template from any plan
 * set, through the SAME production Session+ODL pipeline compile_corpus_takeoff
 * (MCP) and the UI's /__ot/compile-corpus-takeoff CLI both call — no
 * separate extraction path for this testing tool.
 *
 * Usage:
 *   node --import tsx scripts/export-valve-size-template.mjs --pdf <path> [--pdf <path2> ...] --out <dir> [--service CHW|HHW] [--tier primary|secondary]
 *
 * Writes <out>/Valve_Size_Template_US_Global.xlsx plus <out>/report.json
 * (coverage/notes/excluded families/every mapped row) and prints a
 * console summary — the fastest way to see what a real plan set actually
 * fills vs. what stayed blank.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileProductionTakeoff } from "../src/productionTakeoff.ts";
import { buildValveSizeExport } from "../../web/src/lib/valveSizeExport.ts";
import { fillValveSizeTemplate, VALVE_SIZE_TEMPLATE_FILENAME } from "../../web/src/lib/valveSizeTemplate.ts";

function args(argv) {
  const out = { pdfs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pdf") out.pdfs.push(argv[++i]);
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--service") out.service = argv[++i];
    else if (a === "--tier") out.tier = argv[++i];
  }
  return out;
}

const { pdfs, out, service, tier } = args(process.argv.slice(2));
if (!pdfs.length || !out) {
  console.error("usage: node --import tsx scripts/export-valve-size-template.mjs --pdf <path> [--pdf <path2> ...] --out <dir> [--service CHW|HHW] [--tier primary|secondary]");
  process.exit(2);
}

const t0 = Date.now();
const mark = (label) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);
const session = new Session();
for (let i = 0; i < pdfs.length; i++) {
  await session.loadPlan(resolve(pdfs[i]), { merge: i > 0 });
  mark(`loaded ${pdfs[i]}`);
}
const graph = await session.graphForPipeline();
mark(`graphForPipeline done (${graph.sheets?.length ?? "?"} sheets)`);
const compiled = await compileProductionTakeoff(session, graph, "control_valves", service ? { service } : {});
mark("compileProductionTakeoff done");
const valveExport = buildValveSizeExport(compiled, tier ? { hydronicTier: tier } : {});
mark("buildValveSizeExport done");

await mkdir(out, { recursive: true });
const templatePath = fileURLToPath(new URL("../../web/public/templates/Valve_Size_Template_US_Global.xlsx", import.meta.url));
const templateBytes = new Uint8Array(await readFile(templatePath));
const filled = await fillValveSizeTemplate(templateBytes, valveExport.rows);
const xlsxPath = resolve(out, VALVE_SIZE_TEMPLATE_FILENAME);
await writeFile(xlsxPath, filled);

const report = {
  pdfs: pdfs.map((p) => resolve(p)),
  takeoff_id: compiled.takeoff_id,
  sheet_count: compiled.sheet_count,
  source_item_count: valveExport.sourceItemCount,
  rows_written: valveExport.rows.length,
  excluded_families: valveExport.excludedFamilies,
  coverage: valveExport.coverage,
  notes: valveExport.notes,
  rows: valveExport.rows,
  latency_ms: Date.now() - t0,
};
const reportPath = resolve(out, "report.json");
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n${pdfs.map((p) => p.split("/").at(-1)).join(", ")} -> ${valveExport.rows.length} valve row(s) (of ${valveExport.sourceItemCount} scheduled) in ${report.latency_ms}ms`);
if (valveExport.excludedFamilies.length) {
  console.log("Excluded families:", valveExport.excludedFamilies.map((f) => `${f.family}(${f.count})`).join(", "));
}
console.log("Coverage:");
for (const [key, { filled: n, total }] of Object.entries(valveExport.coverage)) {
  const pct = total ? Math.round((n / total) * 100) : 0;
  console.log(`  ${key.padEnd(20)} ${String(n).padStart(4)}/${total} (${pct}%)`);
}
console.log(`\nWrote ${xlsxPath}\nWrote ${reportPath}`);
