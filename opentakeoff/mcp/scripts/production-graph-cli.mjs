/**
 * Production sheet-graph CLI — same Session + ODL path MCP tools use.
 *
 * Modes:
 *   --mode graph              → write SheetGraph JSON to --out (or stdout if small)
 *   --mode compile --kind …   → compileCorpusTakeoff JSON on stdout
 *   --mode sweep --tag …      → Session.sweepScheduleRow JSON on stdout
 *   --mode count_marks        → Session.countMarks JSON on stdout
 *   --mode reconcile          → reconcileSchedulePlan JSON on stdout
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
import { compileTakeoff } from "../../web/src/lib/compileTakeoff.mjs";
import { reconcileSchedulePlan } from "../src/takeoff.ts";

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
const sweepTag = arg(process.argv, "--tag");
const marksCsv = arg(process.argv, "--marks");
const family = arg(process.argv, "--family");
const tagsCsv = arg(process.argv, "--tags");
const familySweepAll = process.argv.includes("--family-sweep-all");
const outPath = arg(process.argv, "--out");
const pdfs = argsOf(process.argv, "--pdf").map((p) => resolve(p));
if (!pdfs.length) {
  console.error("usage: production-graph-cli.mjs --mode graph|compile|sweep|count_marks|reconcile --pdf <path> [--pdf …] [--kind …] [--tag …] [--marks a,b] [--family VAV] [--tags a,b] [--family-sweep-all] [--service CHW|HHW] [--out …]");
  process.exit(2);
}
if (mode === "compile" && !kind) {
  console.error("--kind required for --mode compile");
  process.exit(2);
}
if (mode === "sweep" && !sweepTag) {
  console.error("--tag required for --mode sweep");
  process.exit(2);
}

const kindLabel = kind === "bas_points" ? "BAS points"
  : kind === "control_valves" ? "control valves"
  : kind === "hvac_equipment" ? "HVAC equipment"
  : (kind === "sequences" || kind === "T-SOO-01") ? "sequences-of-operations"
  : (kind === "embedded_coil_gaps" || kind === "T-VALVE-EMBEDDED-01") ? "embedded-coil valve gaps"
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

if (mode === "sweep") {
  progress("sweep", `Sweeping schedule row ${sweepTag} on shared Session path…`, { tag: sweepTag });
  const result = await session.sweepScheduleRow(sweepTag, { evaluationFast: true });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

if (mode === "count_marks") {
  const marks = marksCsv
    ? marksCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  progress("count", `Counting marks on shared Session path…`, { marks: marks?.length ?? "all" });
  const result = await session.countMarks({ marks });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

if (mode === "reconcile") {
  const tags = tagsCsv
    ? tagsCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  progress("reconcile", `Reconciling schedule to plan${family ? ` (${family})` : ""}…`, { family });
  const result = await reconcileSchedulePlan(session, {
    family,
    tags,
    evaluationFast: true,
    familySweepAll,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exit(0);
}

if (mode !== "compile") {
  console.error(`unknown --mode ${mode}`);
  process.exit(2);
}

progress("compile", `Compiling ${kindLabel} takeoff from extracted schedules…`, { kind });
const compiled = compileTakeoff(session, graph, kind, service ? { service } : {});
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
