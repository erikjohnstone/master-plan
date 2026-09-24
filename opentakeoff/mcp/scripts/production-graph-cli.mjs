/**
 * Production sheet-graph CLI — same Session + ODL path MCP tools use.
 *
 * Modes:
 *   --mode graph              → write SheetGraph JSON to --out (or stdout if small)
 *   --mode compile --kind …   → compileCorpusTakeoff JSON on stdout
 *   --mode complete_bas       → five compilers + reconcile on one Session
 *   --mode sweep --tag …      → Session.sweepScheduleRow JSON on stdout
 *                                (`--sweep-options` carries Session-native JSON)
 *   --mode symbol_sweep        → Session.symbolSweep JSON on stdout
 *   --mode count_marks        → Session.countMarks JSON on stdout
 *   --mode reconcile          → reconcileSchedulePlan JSON on stdout
 *   --mode assemblies_project → the project the assemblies apply path reads
 *                                (mcp/src/assemblies.ts, the apply_assemblies builder)
 *
 * Progress (compile walkthrough): lines on stderr of the form
 *   OT_PROGRESS\t{"phase":"…","message":"…"}\n
 * so the Vite UI middleware can stream them to the Agent panel.
 *
 * Usage:
 *   node --import tsx scripts/production-graph-cli.mjs \
 *     --mode graph|compile --pdf /abs/plan.pdf [--pdf …] [--kind …] [--out /path.json]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";
import { writeJsonAndExit } from "./cliJson.mjs";
import { Session } from "../src/session.ts";
import { compileProductionTakeoff, compileProductionTakeoffs } from "../src/productionTakeoff.ts";
import { reconcileSchedulePlan } from "../src/takeoff.ts";
import { sessionAssembliesProject } from "../src/assemblies.ts";

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
const processStartedAt = performance.now();
function progress(phase, message, extra = {}) {
  const payload = JSON.stringify({ phase, message, elapsed_ms: Math.round(performance.now() - processStartedAt), ...extra });
  process.stderr.write(`OT_PROGRESS\t${payload}\n`);
}

const mode = arg(process.argv, "--mode") || "graph";
const kind = arg(process.argv, "--kind");
const service = arg(process.argv, "--service");
const basMathOptions = process.argv.includes("--bas-math-options-stdin")
  ? JSON.parse(readFileSync(0, "utf8")) : undefined;
const sweepTag = arg(process.argv, "--tag");
const marksCsv = arg(process.argv, "--marks");
const family = arg(process.argv, "--family");
const tagsCsv = arg(process.argv, "--tags");
const categoriesCsv = arg(process.argv, "--categories");
const categories = categoriesCsv
  ? categoriesCsv.split(",").map((s) => s.trim()).filter(Boolean)
  : null;
const familySweepAll = process.argv.includes("--family-sweep-all");
// MCP's own real default is exhaustive (sweep_schedule_row's tagged_only
// z.boolean().default(false), mcp/src/tools.ts) — every caller through this
// CLI (both HTTP-bridged UI reconcile/sweep calls and direct script calls)
// was unconditionally getting the faster, less-thorough mode regardless of
// what was asked, so the UI and MCP could disagree on an installed count
// from the same tag. Opt-in flag now, matching the real default.
const evaluationFast = process.argv.includes("--evaluation-fast");
const sweepOptionsRaw = arg(process.argv, "--sweep-options");
const symbolPdfIndex = Number(arg(process.argv, "--symbol-pdf-index") ?? 0);
const symbolPage = Number(arg(process.argv, "--symbol-page") ?? 0);
const symbolSeedRectRaw = arg(process.argv, "--symbol-seed-rect");
const symbolScope = arg(process.argv, "--symbol-scope") || "sheet";
const symbolOptionsRaw = arg(process.argv, "--symbol-options");
const outPath = arg(process.argv, "--out");
const pdfs = argsOf(process.argv, "--pdf").map((p) => resolve(p));
if (!pdfs.length) {
  console.error("usage: production-graph-cli.mjs --mode graph|compile|sweep|count_marks|reconcile --pdf <path> [--pdf …] [--kind …] [--tag …] [--sweep-options JSON] [--marks a,b] [--family VAV] [--tags a,b] [--family-sweep-all] [--service CHW|HHW] [--out …]");
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
if (mode === "symbol_sweep" && (
  !Number.isInteger(symbolPdfIndex) || symbolPdfIndex < 0 || symbolPdfIndex >= pdfs.length
  || !Number.isInteger(symbolPage) || symbolPage < 1 || !symbolSeedRectRaw
  || !["sheet", "set"].includes(symbolScope)
)) {
  console.error("--mode symbol_sweep requires a valid --symbol-pdf-index, --symbol-page, --symbol-seed-rect and --symbol-scope sheet|set");
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

// Symbol spotting is a geometry/text operation and deliberately does not
// build the schedule/table graph. This is the exact Session product path the
// MCP tool calls; the browser bridge uses it for set-wide sweeps so UI and MCP
// cannot carry separate counting implementations.
if (mode === "symbol_sweep") {
  const seedRect = JSON.parse(symbolSeedRectRaw);
  const symbolOptions = symbolOptionsRaw ? JSON.parse(symbolOptionsRaw) : {};
  // Session's canonical key for page 1 is the bare filename; only later
  // pages carry `#N`. Constructing `file#1` made the browser production
  // bridge refuse every page-1 symbol request before matching began.
  const sheetBase = basename(pdfs[symbolPdfIndex]);
  const sheet = symbolPage === 1 ? sheetBase : `${sheetBase}#${symbolPage}`;
  progress("symbol_sweep", `Sweeping ${symbolScope === "set" ? "the plan set" : sheet} on shared Session path…`, {
    scope: symbolScope,
    sheet,
  });
  const result = await session.symbolSweep(sheet, {
    seedRect,
    scope: symbolScope,
    rotations: symbolOptions.rotations !== false,
    mirror: symbolOptions.mirror !== false,
    ...(symbolOptions.tolerancePx != null ? { tolerancePx: symbolOptions.tolerancePx } : {}),
    ...(symbolOptions.variantGuard === true ? { variantGuard: true } : {}),
    ...(symbolOptions.luminanceTolerance != null ? { luminanceTolerance: symbolOptions.luminanceTolerance } : {}),
    ...(symbolOptions.affine ? { affine: symbolOptions.affine } : {}),
  });
  await writeJsonAndExit(result);
}

progress("graph", "Building Session + ODL sheet graph (schedules, roles, tables)…");
// THE INDEX. cachedSheetGraph is content-addressed on the PDF bytes plus the
// engine source digest, and until now it was called only by tests — every
// upload and every corpus run rebuilt a graph it already had. A whole set is
// minutes of ODL and extraction; a re-open should be instant.
//
// Every PDF in a merged set is part of the identity: two sets that happen to
// share a first file are not the same document.
const shaOf = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const graph = await cachedSheetGraph(pdfs[0], {
  expectedSha256: shaOf(pdfs[0]),
  identity: pdfs.slice(1).map(shaOf),
  // Every sheet key in the graph is `<basename>#<page>`, so the names are part
  // of the answer and must be part of the key — see sheetGraphCache.mjs.
  names: pdfs.slice(1).map((p) => basename(p)),
  compute: () => session.graphForPipeline(),
});
session.seedPipelineGraph?.(graph);
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
    await writeJsonAndExit({ ok: true, bytes: json.length, out: outPath });
  } else {
    // Large graphs can stress pipe buffering — prefer --out from the middleware.
    await writeJsonAndExit(graph);
  }
}

if (mode === "sweep") {
  progress("sweep", `Sweeping schedule row ${sweepTag} on shared Session path…`, { tag: sweepTag });
  const sweepOptions = sweepOptionsRaw ? JSON.parse(sweepOptionsRaw) : {};
  const result = await session.sweepScheduleRow(sweepTag, {
    evaluationFast,
    ...(sweepOptions.verifyTaggedGeometry === true ? { verifyTaggedGeometry: true } : {}),
    ...(typeof sweepOptions.rotations === "boolean" ? { rotations: sweepOptions.rotations } : {}),
    ...(typeof sweepOptions.mirror === "boolean" ? { mirror: sweepOptions.mirror } : {}),
    ...(typeof sweepOptions.tolerancePx === "number" ? { tolerancePx: sweepOptions.tolerancePx } : {}),
    ...(typeof sweepOptions.preferSheet === "string" ? { preferSheet: sweepOptions.preferSheet } : {}),
    ...(typeof sweepOptions.preferTitle === "string" ? { preferTitle: sweepOptions.preferTitle } : {}),
    ...(sweepOptions.affine && typeof sweepOptions.affine === "object" ? { affine: sweepOptions.affine } : {}),
  });
  await writeJsonAndExit(result);
}

if (mode === "count_marks") {
  const marks = marksCsv
    ? marksCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  progress("count", `Counting marks on shared Session path…`, { marks: marks?.length ?? "all" });
  const result = await session.countMarks({ marks });
  await writeJsonAndExit(result);
}

if (mode === "reconcile") {
  const tags = tagsCsv
    ? tagsCsv.split(",").map((s) => s.trim()).filter(Boolean)
    : null;
  progress("reconcile", `Reconciling schedule to plan${family ? ` (${family})` : ""}…`, { family });
  const result = await reconcileSchedulePlan(session, {
    family,
    tags,
    categories,
    evaluationFast,
    familySweepAll,
    onProgress: (event) => {
      if (event.state === "start") {
        progress("reconcile_row", `Grounding schedule tag ${event.tag}…`, event);
        return;
      }
      const total = event.total ? ` of ${event.total}` : "";
      progress("reconcile", `Grounded ${event.processed}${total} schedule tag${event.processed === 1 ? "" : "s"} — ${event.tag} (${event.elapsed_ms ?? 0} ms).`, event);
    },
  });
  await writeJsonAndExit(result);
}

if (mode === "complete_bas") {
  // SHOULD THIS BE ON THE SHARED PATH? Yes. This is exactly the same five
  // production compilers and the same shared reconcile function as the
  // individual UI/MCP calls, but one loaded Session prevents a large drawing
  // set from being reopened six times after it has already been indexed.
  const compileOrder = [
    "hvac_equipment",
    "bas_points",
    "sequences",
    "control_valves",
    "embedded_coil_gaps",
  ];
  const labels = {
    hvac_equipment: "HVAC equipment",
    bas_points: "BAS points",
    sequences: "sequences-of-operations",
    control_valves: "control valves",
    embedded_coil_gaps: "embedded-coil valve gaps",
  };
  const compiles = await compileProductionTakeoffs(
    session,
    graph,
    compileOrder.map((compileKind) => ({
      kind: compileKind,
      options: compileKind === "bas_points" && basMathOptions ? { bas_math: basMathOptions } : {},
    })),
    ({ kind: compileKind, index, total, state }) => {
      progress("compile", state === "start"
        ? `Compiling ${labels[compileKind] || compileKind} (${index + 1} of ${total})…`
        : `Compiled ${labels[compileKind] || compileKind} (${index} of ${total}).`, {
        kind: compileKind,
        processed: index,
        total,
        state,
      });
    },
  );
  progress("reconcile", "Reconciling schedule quantities to grounded plan evidence…");
  const reconcile = await reconcileSchedulePlan(session, {
    categories,
    evaluationFast,
    onProgress: (event) => {
      if (event.state === "start") {
        progress("reconcile_row", `Grounding schedule tag ${event.tag}…`, event);
        return;
      }
      const total = event.total ? ` of ${event.total}` : "";
      progress("reconcile", `Grounded ${event.processed}${total} schedule tag${event.processed === 1 ? "" : "s"} — ${event.tag} (${event.elapsed_ms ?? 0} ms).`, event);
    },
  });
  const controlSchematics = graph.control_schematics || await session.controlSchematics();
  progress("done", "Complete BAS extraction and reconciliation finished.", {
    compile_count: compileOrder.length,
    reconcile_rows: reconcile.rows.length,
  });
  await writeJsonAndExit({
    schema_version: "opentakeoff.complete_bas_batch.v1",
    compile_order: compileOrder,
    compiles,
    control_schematics: controlSchematics,
    reconcile,
  });
}

if (mode === "assemblies_project") {
  // SHOULD THIS BE ON THE SHARED PATH? Yes: the builder MCP's apply_assemblies
  // calls. The browser applies its library to this project with the same
  // applyAssemblies (web/src/lib/assemblies/apply.ts).
  progress("compile", "Compiling HVAC equipment and reading its schedule notes for assemblies…");
  const project = await sessionAssembliesProject(session);
  progress("done", `Assemblies project ready — ${project.items.length} scheduled row${project.items.length === 1 ? "" : "s"}.`, { items: project.items.length });
  await writeJsonAndExit(project);
}

if (mode !== "compile") {
  console.error(`unknown --mode ${mode}`);
  process.exit(2);
}

progress("compile", `Compiling ${kindLabel} takeoff from extracted schedules…`, { kind });
const compiled = await compileProductionTakeoff(session, graph, kind, {
  ...(service ? { service } : {}), ...(basMathOptions ? { bas_math: basMathOptions } : {}),
});
const totals = compiled?.totals || {};
const items = totals.items ?? totals.rows ?? null;
progress("done", items != null
  ? `Compile finished — ${items} line${items === 1 ? "" : "s"} ready for Takeoff.`
  : "Compile finished — opening Takeoff.", {
  kind: compiled?.kind,
  takeoff_id: compiled?.takeoff_id,
  items,
});
// Exiting immediately after write truncated larger BAS results at the pipe
// buffer boundary. Falling off the script instead leaves reader children alive.
// Drain the exact response first, then exit. No extraction semantics change.
await writeJsonAndExit(compiled);
