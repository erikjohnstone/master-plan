/**
 * Production sheet-graph CLI — same Session + ODL path MCP tools use.
 *
 * Modes:
 *   --mode graph              → write SheetGraph JSON to --out (or stdout if small)
 *   --mode compile --kind …   → compileCorpusTakeoff JSON on stdout
 *
 * Progress (compile walkthrough): lines on stderr of the form
 *   OT_PROGRESS\t{"phase":"…","message":"…"}\n
 * so the Vite UI middleware can stream them to the Agent panel.
 *
 * Usage:
 *   node --import tsx scripts/production-graph-cli.mjs \
 *     --mode graph|compile --pdf /abs/plan.pdf [--pdf …] [--kind …] [--out /path.json]
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";

function argsOf(argv, name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name && argv[i + 1]) out.push(argv[++i]);
  }
  return out;
}
function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
}

/** Emit a structured progress line the UI middleware can stream. */
function progress(phase, message, extra = {}) {
  const payload = JSON.stringify({ phase, message, ...extra });
  process.stderr.write(`OT_PROGRESS\t${payload}\n`);
}

const mode = arg(process.argv, "--mode") || "graph";
const kind = arg(process.argv, "--kind");
const service = arg(process.argv, "--service");
const outPath = arg(process.argv, "--out");
const pdfs = argsOf(process.argv, "--pdf").map((p) => resolve(p));
if (!pdfs.length) {
  console.error("usage: production-graph-cli.mjs --mode graph|compile --pdf <path> [--pdf …] [--kind …] [--service CHW|HHW] [--out …]");
  process.exit(2);
}
if (mode === "compile" && !kind) {
  console.error("--kind required for --mode compile");
  process.exit(2);
}

const kindLabel = kind === "bas_points" ? "BAS points"
  : kind === "control_valves" ? "control valves"
  : kind === "hvac_equipment" ? "HVAC equipment"
  : (kind || "takeoff");

progress("load", `Loading ${pdfs.length} plan PDF${pdfs.length === 1 ? "" : "s"}…`, { pdf_count: pdfs.length });
const session = new Session();
await session.loadPlan(pdfs[0]);
for (let i = 1; i < pdfs.length; i++) {
  progress("load", `Merging plan ${i + 1} of ${pdfs.length}…`, { pdf_index: i + 1, pdf_count: pdfs.length });
  await session.loadPlan(pdfs[i], { merge: true });
}

progress("graph", "Building Session + ODL sheet graph (schedules, roles, tables)…");
const graph = await session.graphForPipeline();
const sheetCount = Array.isArray(graph?.sheets) ? graph.sheets.length : 0;
const tableCount = Array.isArray(graph?.tables) ? graph.tables.length : 0;
progress("graph", `Sheet graph ready — ${sheetCount} sheet${sheetCount === 1 ? "" : "s"}, ${tableCount} schedule table${tableCount === 1 ? "" : "s"}.`, {
  sheet_count: sheetCount,
  table_count: tableCount,
});

if (mode === "graph") {
  const json = JSON.stringify(graph);
  if (outPath) {
    writeFileSync(outPath, json);
    process.stdout.write(`${JSON.stringify({ ok: true, bytes: json.length, out: outPath })}\n`);
  } else {
    // Large graphs can stress pipe buffering — prefer --out from the middleware.
    process.stdout.write(`${json}\n`);
  }
  process.exit(0);
}

progress("compile", `Compiling ${kindLabel} takeoff from extracted schedules…`, { kind });
const compiled = compileCorpusTakeoff(session, graph, kind, service ? { service } : {});
const totals = compiled?.totals || {};
const items = totals.items ?? totals.rows ?? null;
progress("done", items != null
  ? `Compile finished — ${items} line${items === 1 ? "" : "s"} ready for Takeoff.`
  : "Compile finished — opening Takeoff.", {
  kind: compiled?.kind,
  takeoff_id: compiled?.takeoff_id,
  items,
});
process.stdout.write(`${JSON.stringify(compiled)}\n`);
