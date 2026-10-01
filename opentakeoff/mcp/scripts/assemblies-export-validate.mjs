// ASSEMBLIES goal, instrument 5 — EXPORT VALIDATION (goals/ASSEMBLIES.md
// MEASURE 5; GATE 7 reads it).
//
// SHOULD THIS BE ON THE SHARED PATH? What it validates is shared: the CSV set
// (web/src/lib/assemblies/exportSet.ts) of the apply path's result (apply.ts)
// over the compile, and the HIT export (valveSizeExport.ts,
// valveSizeTemplate.ts) over the control-valve and embedded-coil compiles.
// The checks are exportSet.ts's csvSetProblems, which the unit tests run
// too; this script runs them on real documents and reports.
//
//   node --import tsx scripts/assemblies-export-validate.mjs <corpus-dir> [setId ...] [--heldout] [--report]
//
// Per document of the frozen split (dev by default), it:
//   · takes the attribute eval's snapshot child with --with-hit (the cached
//     sheet graph, then the compiles);
//   · applies the starter library, then builds and checks the CSV set;
//   · builds the HIT rows, coil-derived ones included, and fills the
//     template, reading each workbook back for its data rows.
// Coil-derived rows are compared with the WP0.1 census
// (reports/assemblies/00-baseline.json: embedded coils with no scheduled
// valve). Held-out documents are gates only, so their report is aggregates.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { snapshotInChild } from "./assemblies-attr-eval.mjs";
import { applyAssemblies } from "../../web/src/lib/assemblies/apply.ts";
import { assembliesCsvSet, csvSetProblems } from "../../web/src/lib/assemblies/exportSet.ts";
import { assembliesReport } from "../../web/src/lib/assemblies/report.ts";
import { sanitizeAssemblyDefinitions } from "../../web/src/lib/assemblies/schema.ts";
import { buildValveSizeExport } from "../../web/src/lib/valveSizeExport.ts";
import { valveSizeTemplateFiles, VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW, VALVE_SIZE_TEMPLATE_ROWS_PER_FILE } from "../../web/src/lib/valveSizeTemplate.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const WEB = resolve(HERE, "../../web");
const STARTER = ["us-typicals-v1.json", "us-hookups-v1.json"];
const FIRST_DATA_ROW = 6;

/** The starter library through the load gate (every record must pass). */
export function starterLibrary() {
  const raw = STARTER.flatMap((f) => JSON.parse(readFileSync(join(WEB, "src/lib/assemblies/starter", f), "utf8")).assemblies);
  const { assemblies, rejected } = sanitizeAssemblyDefinitions(raw);
  if (rejected.length) throw new Error(`the starter fails its own gate: ${rejected.map((r) => r.id).join(", ")}`);
  return assemblies;
}

/** The data rows a filled workbook holds, read back from its sheet XML. */
export function workbookDataRows(bytes) {
  const xml = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
  const rows = [...xml.matchAll(/<x:row r="(\d+)"/g)].map((m) => Number(m[1])).filter((r) => r >= FIRST_DATA_ROW);
  return { rows: rows.length, last: rows.length ? Math.max(...rows) : null };
}

/** One document: the CSV set's checks and counts, and the HIT export's. */
export async function validateDocument(snapshot, library, template) {
  const project = { items: snapshot.items, tables: snapshot.tables, pages: snapshot.pages, printed_points: snapshot.printed_points };
  const applied = applyAssemblies({ project, library });
  const report = assembliesReport(applied.instances, applied.applications, applied.lines);
  const set = assembliesCsvSet({ ...applied, report });
  const problems = csvSetProblems(set);
  const rowsOf = (text) => text.split("\r\n").length - 2;
  const csv = Object.fromEntries(Object.entries(set).map(([f, t]) => [f, rowsOf(t)]));

  const hit = buildValveSizeExport(snapshot.hit.valves, { coilGaps: snapshot.hit.coils });
  const files = await valveSizeTemplateFiles(template, hit.rows);
  const readBack = files.map((f) => {
    const back = workbookDataRows(f.bytes);
    return { filename: f.filename, written: f.rows, read: back.rows, last: back.last };
  });
  const hitProblems = [];
  for (const f of readBack) {
    if (f.read !== f.written) hitProblems.push(`${f.filename}: ${f.written} rows written, ${f.read} read back`);
    if (f.written > VALVE_SIZE_TEMPLATE_ROWS_PER_FILE) hitProblems.push(`${f.filename}: ${f.written} rows, over ${VALVE_SIZE_TEMPLATE_ROWS_PER_FILE}`);
    if (f.last !== null && f.last > VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW) hitProblems.push(`${f.filename}: a row at ${f.last}, past the dropdown range (${VALVE_SIZE_TEMPLATE_DROPDOWN_LAST_ROW})`);
  }
  const readRows = readBack.reduce((n, f) => n + f.read, 0);
  if (readRows !== hit.rows.length) hitProblems.push(`the workbooks hold ${readRows} rows for ${hit.rows.length} valves`);
  const coilRows = hit.rows.filter((r) => r._source.coilDerived);
  for (const r of coilRows) {
    if (r.consumerDpPsi !== null) hitProblems.push(`${r.unitNo ?? "(no tag)"}: a coil-derived row fills CoilDP`);
  }
  return {
    units: report.totals.units,
    records: report.totals.records,
    lines: report.totals.lines,
    csv_rows: csv,
    csv_problems: problems,
    hit: {
      scheduled_rows: hit.rows.length - coilRows.length,
      coil_derived_rows: coilRows.length,
      coil_derived_with_gpm: coilRows.filter((r) => r.designFlowRateGpm !== null).length,
      coil_derived_with_system: coilRows.filter((r) => r.system !== null).length,
      workbooks: readBack.map((f) => ({ filename: f.filename, rows: f.written, read_back: f.read, last_row: f.last })),
      rows_read_back: readRows,
      problems: hitProblems,
    },
  };
}

function wp0Coils(corpus) {
  try {
    const b = JSON.parse(readFileSync(join(corpus, "reports/assemblies/00-baseline.json"), "utf8"));
    return new Map((b.per_set ?? []).map((s) => [s.id, s.embedded_coils?.without_scheduled_valve ?? null]));
  } catch {
    return new Map();
  }
}

function markdown(side, rows, totals, split) {
  const L = [];
  L.push(`# Assemblies goal — instrument 5, export validation (${side})`);
  L.push("");
  L.push(`Generated ${new Date().toISOString()}. Documents: the frozen ${side} split (${split.length}). Reproduce: \`cd opentakeoff/mcp && node --import tsx scripts/assemblies-export-validate.mjs ../../opentakeoff-corpus${side === "heldout" ? " --heldout" : ""} --report\`.`);
  L.push("");
  L.push("Per document: the starter applied to the compile, the CSV set built and checked (`exportSet.ts` `csvSetProblems`); the HIT rows built (coil-derived ones included) and filled into the template, each workbook read back.");
  L.push("");
  if (side === "dev") {
    L.push("| Document | Units | Lines | CSV problems | lines.csv | points.csv | valves.csv | HIT scheduled | HIT coil-derived | WP0 coils without a valve | Workbooks | HIT problems |");
    L.push("|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const r of rows) {
      if (r.error) { L.push(`| \`${r.id}\` | ERROR: ${String(r.error).split("\n")[0].slice(0, 120)} |||||||||||`); continue; }
      L.push(`| \`${r.id}\` | ${r.units} | ${r.lines} | ${r.csv_problems.length} | ${r.csv_rows["lines.csv"]} | ${r.csv_rows["points.csv"]} | ${r.csv_rows["valves.csv"]} | ${r.hit.scheduled_rows} | ${r.hit.coil_derived_rows} | ${r.wp0_coils_without_valve ?? "—"} | ${r.hit.workbooks.length} | ${r.hit.problems.length} |`);
    }
    L.push("");
    const bad = rows.filter((r) => !r.error && (r.csv_problems.length || r.hit.problems.length));
    for (const r of bad) {
      L.push(`## \`${r.id}\``);
      for (const p of [...r.csv_problems, ...r.hit.problems]) L.push(`- ${p}`);
      L.push("");
    }
  }
  L.push("## Totals");
  L.push("");
  for (const [k, v] of Object.entries(totals)) L.push(`- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`);
  L.push("");
  L.push(`GATE 7 (${side}): export validation ${totals.documents_with_problems === 0 && totals.errored === 0 ? "green" : "RED"}; coil-derived rows ${totals.coil_derived_rows} against ${totals.wp0_coils_without_valve} WP0 coils without a scheduled valve.`);
  return L.join("\n");
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (f) => argv.includes(f);
  const [corpusDir, ...only] = argv.filter((a) => !a.startsWith("--"));
  if (!corpusDir) {
    console.error("usage: node --import tsx scripts/assemblies-export-validate.mjs <corpus-dir> [setId ...] [--heldout] [--report]");
    process.exit(2);
  }
  const corpus = resolve(corpusDir);
  const split = JSON.parse(readFileSync(join(corpus, "reports/assemblies/01-split.json"), "utf8"));
  const side = flag("--heldout") ? "heldout" : "dev";
  const ids = only.length ? only : split[side].sets;
  const other = side === "dev" ? new Set(split.heldout.sets) : new Set(split.dev.sets);
  const stray = ids.filter((id) => other.has(id));
  if (stray.length) {
    console.error(`${stray.join(", ")}: not in the ${side} split`);
    process.exit(2);
  }
  const library = starterLibrary();
  const template = new Uint8Array(readFileSync(join(WEB, "public/templates/Valve_Size_Template_US_Global.xlsx")));
  const wp0 = wp0Coils(corpus);
  const rows = [];
  for (const id of ids) {
    const snap = await snapshotInChild(corpus, id, { hit: true });
    if (snap.error) { rows.push({ id, error: snap.error }); continue; }
    try {
      rows.push({ id, graph: snap.graph, ...(await validateDocument(snap, library, template)), wp0_coils_without_valve: wp0.get(id) ?? null });
    } catch (e) {
      rows.push({ id, error: String(e?.stack || e?.message || e) });
    }
    const r = rows.at(-1);
    if (side === "dev") console.error(r.error ? `  ${id}: ERROR ${String(r.error).split("\n")[0]}` : `  ${id}: ${r.lines} lines; CSV problems ${r.csv_problems.length}; HIT ${r.hit.scheduled_rows} + ${r.hit.coil_derived_rows} coil-derived (WP0 ${r.wp0_coils_without_valve ?? "—"}); HIT problems ${r.hit.problems.length}`);
  }
  const ok = rows.filter((r) => !r.error);
  const totals = {
    documents: rows.length,
    errored: rows.length - ok.length,
    documents_with_problems: ok.filter((r) => r.csv_problems.length || r.hit.problems.length).length,
    csv_problems: ok.reduce((n, r) => n + r.csv_problems.length, 0),
    hit_problems: ok.reduce((n, r) => n + r.hit.problems.length, 0),
    units: ok.reduce((n, r) => n + r.units, 0),
    lines: ok.reduce((n, r) => n + r.lines, 0),
    hit_scheduled_rows: ok.reduce((n, r) => n + r.hit.scheduled_rows, 0),
    coil_derived_rows: ok.reduce((n, r) => n + r.hit.coil_derived_rows, 0),
    coil_derived_with_gpm: ok.reduce((n, r) => n + r.hit.coil_derived_with_gpm, 0),
    coil_derived_with_system: ok.reduce((n, r) => n + r.hit.coil_derived_with_system, 0),
    wp0_coils_without_valve: ok.reduce((n, r) => n + (r.wp0_coils_without_valve ?? 0), 0),
    documents_whose_coil_rows_differ_from_wp0: ok.filter((r) => r.wp0_coils_without_valve !== null && r.wp0_coils_without_valve !== r.hit.coil_derived_rows).length,
    workbooks: ok.reduce((n, r) => n + r.hit.workbooks.length, 0),
  };
  const md = markdown(side, rows, totals, ids);
  console.log(side === "dev" ? md : md.slice(md.indexOf("## Totals")));
  if (flag("--report")) {
    const base = join(corpus, "reports/assemblies", `07-export-validation-${side}`);
    const json = side === "dev" ? { generated_at: new Date().toISOString(), side, documents: rows, totals } : { generated_at: new Date().toISOString(), side, documents: ids.length, totals };
    writeFileSync(`${base}.json`, `${JSON.stringify(json, null, 2)}\n`);
    writeFileSync(`${base}.md`, `${md}\n`);
    console.error(`wrote ${base}.{json,md}`);
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
