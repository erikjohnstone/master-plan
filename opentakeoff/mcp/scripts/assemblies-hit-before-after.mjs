// ASSEMBLIES goal, WP0.4 — the HIT export before/after column report
// (goals/ASSEMBLIES.md: "Re-run the export on navfac and itd-d1-lab
// (VectorGrid on) and report which columns changed and how many rows").
//
// SHOULD THIS BE ON THE SHARED PATH? No — an evaluation script. It compiles
// each set ONCE through the same production path the export uses
// (Session.graphForPipeline + compileProductionTakeoff "control_valves"),
// then feeds that one compile to two builders: valveSizeExport.ts as it was
// at a base git revision, and as it is in the working tree. Every difference
// it reports is therefore the builder's, never the pipeline's.
//
//   node --import tsx scripts/assemblies-hit-before-after.mjs <corpus-dir> --base <git-rev> [--out <dir>] [setId ...]
//
// Default sets: navfac-cherry-point-atc itd-d1-lab. Writes
// <corpus>/reports/assemblies/00-hit-export-before-after.{json,md}; with
// --out, also each set's AFTER workbook + report.json under <dir>/<set>/.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSetFiles, validateSets } from "./corpusFiles.mjs";
import { resolveVectorGridMode } from "../../web/src/lib/vectorGridMode.mjs";

const argv = process.argv.slice(2);
const baseIdx = argv.indexOf("--base");
const baseRev = baseIdx >= 0 ? argv[baseIdx + 1] : null;
const outIdx = argv.indexOf("--out");
const outRoot = outIdx >= 0 ? resolve(argv[outIdx + 1]) : null;
const [corpusDir, ...only] = argv.filter((a, i) => !a.startsWith("--")
  && !(baseIdx >= 0 && i === baseIdx + 1) && !(outIdx >= 0 && i === outIdx + 1));
if (!corpusDir || !baseRev) {
  console.error("usage: node --import tsx scripts/assemblies-hit-before-after.mjs <corpus-dir> --base <git-rev> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
validateSets(spec);
const setIds = only.length ? only : ["navfac-cherry-point-atc", "itd-d1-lab"];

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8" }).trim();
const baseSha = execFileSync("git", ["rev-parse", baseRev], { cwd: repoRoot, encoding: "utf8" }).trim();
const LIB = "opentakeoff/web/src/lib/valveSizeExport.ts";
const oldSource = execFileSync("git", ["show", `${baseSha}:${LIB}`], { cwd: repoRoot, encoding: "utf8" });
// Its only import is `import type` (erased at runtime), so it loads from anywhere.
const oldPath = join(tmpdir(), `valveSizeExport.${baseSha.slice(0, 12)}.ts`);
writeFileSync(oldPath, oldSource);
const before = await import(pathToFileURL(oldPath).href);
const after = await import("../../web/src/lib/valveSizeExport.ts");
const { fillValveSizeTemplate, VALVE_SIZE_TEMPLATE_FILENAME } = await import("../../web/src/lib/valveSizeTemplate.ts");
const { Session } = await import("../src/session.ts");
const { compileProductionTakeoff } = await import("../src/productionTakeoff.ts");

const COLS = ["unitNo", "location", "system", "ports", "pnClass", "lineSizeIn", "designFlowRateGpm",
  "consumerDpPsi", "branchDpPsi", "tolerancePct", "positioningSignal", "operatingVoltage"];
const rowKey = (r) => `${r._source?.family}|${r._source?.tag}|${r._source?.sheetId}`;
const templateBytes = new Uint8Array(readFileSync(join(here, "../../web/public/templates/Valve_Size_Template_US_Global.xlsx")));

const results = [];
for (const id of setIds) {
  const set = spec.sets.find((s) => s.id === id);
  if (!set) throw new Error(`unknown set ${id}`);
  const files = resolveSetFiles(corpus, spec, set);
  const t0 = Date.now();
  const session = new Session();
  for (let i = 0; i < files.length; i++) await session.loadPlan(files[i], { merge: i > 0 });
  const graph = await session.graphForPipeline();
  const compiled = await compileProductionTakeoff(session, graph, "control_valves", {});
  const b = before.buildValveSizeExport(compiled);
  const a = after.buildValveSizeExport(compiled);
  const bMap = new Map(b.rows.map((r) => [rowKey(r), r]));
  const aMap = new Map(a.rows.map((r) => [rowKey(r), r]));
  const columns = {};
  for (const c of COLS) {
    const transitions = {};
    let changed = 0;
    for (const [k, br] of bMap) {
      const ar = aMap.get(k);
      if (!ar) continue;
      const bv = br[c] ?? null;
      const av = ar[c] ?? null;
      if (JSON.stringify(bv) === JSON.stringify(av)) continue;
      changed += 1;
      const t = `${bv === null ? "blank" : JSON.stringify(bv)} → ${av === null ? "blank" : JSON.stringify(av)}`;
      transitions[t] = (transitions[t] || 0) + 1;
    }
    columns[c] = {
      filled_before: b.rows.filter((r) => r[c] !== null && r[c] !== undefined).length,
      filled_after: a.rows.filter((r) => r[c] !== null && r[c] !== undefined).length,
      rows_changed: changed,
      // a single transition kind is summarized; many numeric ones are counted, not listed
      transitions: Object.keys(transitions).length <= 6 ? transitions : { [`${Object.keys(transitions).length} distinct value changes`]: changed },
    };
  }
  const signal = {};
  const printedBlank = {};
  for (const r of a.rows) {
    const s = r._derived.positioningSignal;
    const k = s.value ? `written from ${s.header}` : `blank: ${s.blankReason}`;
    signal[k] = (signal[k] || 0) + 1;
    if (!s.value && s.printed) printedBlank[`${s.header}: ${s.printed}`] = (printedBlank[`${s.header}: ${s.printed}`] || 0) + 1;
  }
  if (outRoot) {
    const outDir = join(outRoot, id);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, VALVE_SIZE_TEMPLATE_FILENAME), await fillValveSizeTemplate(templateBytes, a.rows));
    writeFileSync(join(outDir, "report.json"), `${JSON.stringify({
      set: id, base: baseSha, source_item_count: a.sourceItemCount, rows_written: a.rows.length,
      excluded_families: a.excludedFamilies, coverage: a.coverage, notes: a.notes, rows: a.rows,
      before_rows: b.rows,
    }, null, 1)}\n`);
  }
  results.push({
    set: id,
    ms: Date.now() - t0,
    rows_before: b.rows.length,
    rows_after: a.rows.length,
    rows_only_before: [...bMap.keys()].filter((k) => !aMap.has(k)).length,
    rows_only_after: [...aMap.keys()].filter((k) => !bMap.has(k)).length,
    columns,
    valve_dp_derived_after: a.rows.filter((r) => r._derived.valveDpPsi !== null).length,
    positioning_signal_after: signal,
    blank_with_printed_text_after: printedBlank,
    notes_after: a.notes,
  });
  console.error(`${id}: ${b.rows.length} → ${a.rows.length} rows in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const out = {
  generated_at: new Date().toISOString(),
  base_revision: baseSha,
  vectorgrid_mode: resolveVectorGridMode(),
  vectorgrid_python: process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "python3",
  table_sidecar_python: process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "python3",
  results,
};
const dir = join(corpus, "reports", "assemblies");
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "00-hit-export-before-after.json"), `${JSON.stringify(out, null, 1)}\n`);

const L = [];
L.push("# Assemblies goal — WP0.4 HIT export, before / after");
L.push("");
L.push(`Generated ${out.generated_at}. Base (before) = \`valveSizeExport.ts\` at \`${baseSha.slice(0, 12)}\`; after = the working tree. One compile per set through the production path (VectorGrid mode \`${out.vectorgrid_mode}\`, python \`${out.vectorgrid_python}\`), fed to both builders, so every difference below is the builder's.`);
L.push(`Reproduce: \`cd opentakeoff/mcp && node --import tsx scripts/assemblies-hit-before-after.mjs ../../opentakeoff-corpus --base ${baseSha.slice(0, 12)}\`.`);
for (const r of results) {
  L.push("");
  L.push(`## \`${r.set}\` — ${r.rows_before} rows before, ${r.rows_after} after (${r.rows_only_before} only before, ${r.rows_only_after} only after)`);
  L.push("");
  L.push("| Column | Filled before | Filled after | Rows changed | Change |");
  L.push("|---|---|---|---|---|");
  for (const [c, v] of Object.entries(r.columns)) {
    const t = Object.entries(v.transitions).map(([k, n]) => `${k} ×${n}`).join("; ") || "—";
    L.push(`| ${c} | ${v.filled_before} | ${v.filled_after} | ${v.rows_changed} | ${t} |`);
  }
  L.push("");
  L.push(`Valve Δp (derived), reported not written: ${r.valve_dp_derived_after} of ${r.rows_after} rows.`);
  L.push(`Positioning Signal after: ${Object.entries(r.positioning_signal_after).map(([k, n]) => `${k} ×${n}`).join("; ")}.`);
  const pb = Object.entries(r.blank_with_printed_text_after);
  if (pb.length) L.push(`Blank despite printed signal text: ${pb.map(([k, n]) => `\`${k}\` ×${n}`).join("; ")}.`);
}
L.push("");
writeFileSync(join(dir, "00-hit-export-before-after.md"), `${L.join("\n")}\n`);
console.log(`wrote ${join(dir, "00-hit-export-before-after.{json,md}")}`);
process.exit(0); // AS-6: a VectorGrid sidecar can hold the loop open after the work is done
