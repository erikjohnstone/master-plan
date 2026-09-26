// ASSEMBLIES goal, WP0.1 — baseline census
// (opentakeoff-corpus/goals/ASSEMBLIES.md, plans/04-assemblies-plan.md).
//
// SHOULD THIS BE ON THE SHARED PATH? No — this is an evaluation script. It
// only CALLS the shared path (Session.graphForPipeline + the one compile
// dispatcher, web/src/lib/compileTakeoff.mjs) and never changes extraction.
//
// For every corpus set whose PDFs exist in THIS environment it records:
//   · compiled equipment instances per family (hvac_equipment), with the
//     scheduled_qty sum and how many are controls-relevant;
//   · a header census per family: normalized schedule header → how many
//     items carry a printed (non-empty) cell under it. This is the raw
//     material WP1's canonical attribute schema is designed from. It is
//     REPORTED, never "fixed" or classified here;
//   · hydronic coils the existing structural detector finds inside equipment
//     schedules, and how many have no scheduled control valve
//     (compileEmbeddedCoilGaps);
//   · scheduled control-valve rows per family (compileControlValveTakeoff);
//   · printed points lists: lists, rows, AI/AO/BI/BO (compileBasTakeoff);
//   · wall time, plus (once, in the parent) the VectorGrid mode and whether
//     its python runtime can import its dependencies — a silent fallback to
//     the weaker table engine must never pass as a VectorGrid measurement.
// Sets whose PDFs are absent here are listed as absent — never guessed.
//
// Each set runs in its own child process (memory isolation, bounded time) and
// its result is cached through evalCache.mjs (engine source + PDF identity +
// this script's own source), so an unchanged rerun answers from cache.
//
//   node --import tsx scripts/assemblies-baseline.mjs <corpus-dir> [setId ...] [--out <dir>]
//
// WP0.2 — the frozen dev / held-out draw — is a second mode of this script,
// run AFTER the census (it reads 00-baseline.json, never recompiles):
//
//   node --import tsx scripts/assemblies-baseline.mjs <corpus-dir> --split <seed>
//
// It reads <corpus>/reports/assemblies/drafters.json (which firm drafted each
// document, with the text evidence) and writes 01-split.{json,md}.
//
// Env: OPENTAKEOFF_EVAL_CONCURRENCY (default 1 — one heavy job at a time),
//      OPENTAKEOFF_EVAL_TIMEOUT_MS (default 45 min per set),
//      OPENTAKEOFF_EVAL_NO_CACHE=1 to recompute.
// Writes <corpus>/reports/assemblies/00-baseline.json and 00-baseline.md.
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { childStdoutText } from "./childText.mjs";
import { createHash } from "node:crypto";
import pLimit from "p-limit";
import { CONTROLS_RELEVANT_FAMILIES, drawSplit } from "./assembliesSplit.mjs";
import { resolveSetFiles, validateSets } from "./corpusFiles.mjs";
import { cachedEvalResult } from "./evalCache.mjs";
import { resolveVectorGridMode } from "../../web/src/lib/vectorGridMode.mjs";

const argv = process.argv.slice(2);
const singleIdx = argv.indexOf("--single-json");
const singleSetId = singleIdx >= 0 ? argv[singleIdx + 1] : null;
const splitIdx = argv.indexOf("--split");
const splitSeed = splitIdx >= 0 ? Number(argv[splitIdx + 1]) : null;
if (splitIdx >= 0 && !Number.isSafeInteger(splitSeed)) {
  console.error("--split needs an integer seed");
  process.exit(2);
}
const outIdx = argv.indexOf("--out");
const outOverride = outIdx >= 0 ? resolve(argv[outIdx + 1]) : null;
const positional = argv.filter((a, i) => !a.startsWith("--")
  && !(singleIdx >= 0 && i === singleIdx + 1) && !(splitIdx >= 0 && i === splitIdx + 1)
  && !(outIdx >= 0 && i === outIdx + 1));
const [corpusDir, ...only] = positional;
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/assemblies-baseline.mjs <corpus-dir> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
validateSets(spec);
const thisScript = fileURLToPath(import.meta.url);
const SCRIPT_DIGEST = createHash("sha256").update(readFileSync(thisScript)).digest("hex");

// The family buckets, the coverage list and the seeded draws live in
// assembliesSplit.mjs (pure, so tests reproduce every draw); re-exported here
// for the scripts and comments that name this file.
export { ATTR_KEY_FAMILIES, CONTROLS_RELEVANT_FAMILIES, HELDOUT_MIN_DOCS, KEY_ROWS_PER_TABLE_MAX, REQUIRED_KEY_COVERAGE, drawSplit } from "./assembliesSplit.mjs";

/** Header text as printed, normalized only for counting: upper-case,
 * collapsed whitespace. No synonym folding — that is WP1's job, done from
 * this census plus the authored keys, never guessed here. */
const normHeader = (h) => String(h || "").toUpperCase().replace(/\s+/g, " ").trim();

async function computeSet(set) {
  const { cachedSheetGraph } = await import("./sheetGraphCache.mjs");
  const { compileTakeoff } = await import("../../web/src/lib/compileTakeoff.mjs");
  const t0 = Date.now();
  const files = resolveSetFiles(corpus, spec, set);
  const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
  // The same content-addressed sheet graph the attribute and typical evals
  // read (sheetGraphCache.mjs; its key covers the graph build), so the census
  // never rebuilds a graph those runs already hold. The compiles read the
  // graph alone (corpusTakeoff.mjs sheetRecords: the UI path).
  const graph = await cachedSheetGraph(files[0], {
    expectedSha256: sha(files[0]),
    identity: files.slice(1).map(sha),
    names: files.slice(1).map((p) => basename(p)),
    compute: async () => {
      const { Session } = await import("../src/session.ts");
      const session = new Session();
      for (let i = 0; i < files.length; i++) await session.loadPlan(files[i], { merge: i > 0 });
      return session.graphForPipeline();
    },
  });
  const tGraph = Date.now() - t0;

  const hvac = compileTakeoff(null, graph, "hvac_equipment");
  const families = {};
  for (const [family, cat] of Object.entries(hvac.categories || {})) {
    const items = cat.items || [];
    if (!items.length) continue;
    const headers = {};
    for (const item of items) {
      for (const [header, cell] of Object.entries(item.cells || {})) {
        const text = typeof cell === "object" ? cell?.text : cell;
        if (!String(text ?? "").trim()) continue;
        const h = normHeader(header);
        headers[h] = (headers[h] || 0) + 1;
      }
    }
    families[family] = {
      items: items.length,
      count: cat.count ?? items.length,
      scheduled_qty_sum: items.reduce((n, it) => n + (Number.isInteger(it.scheduled_qty) ? it.scheduled_qty : 0), 0),
      scheduled_qty_unknown: items.filter((it) => !Number.isInteger(it.scheduled_qty)).length,
      controls_relevant: CONTROLS_RELEVANT_FAMILIES.has(family),
      tables: [...new Set(items.map((it) => `${it.sheet_id} :: ${it.table_title}`))],
      table_rows: items.reduce((m, it) => {
        const k = `${it.sheet_id} :: ${it.table_title}`;
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {}),
      headers,
    };
  }

  const valves = compileTakeoff(null, graph, "control_valves");
  const valveRows = {};
  for (const [family, cat] of Object.entries(valves.categories || {})) {
    if ((cat.items || []).length) valveRows[family] = cat.items.length;
  }

  const coils = compileTakeoff(null, graph, "embedded_coil_gaps");
  const coilsFound = coils.totals?.coils_found ?? 0;
  const coilGaps = coils.totals?.gaps ?? 0;
  // The compile exposes every coil only as a count; the rows it returns are
  // the GAPS (coils with no scheduled valve), each carrying its coil label.
  const gapLabels = {};
  for (const g of coils.categories?.embedded_coil_gaps?.items || []) {
    const label = normHeader(g.cells?.["COIL LABEL"]?.text);
    gapLabels[label] = (gapLabels[label] || 0) + 1;
  }

  const bas = compileTakeoff(null, graph, "bas_points");
  const basTotals = bas.totals || {};

  return {
    id: set.id,
    files: files.map((f) => f.replace(corpus, "<corpus>")),
    sheet_count: graph.sheets?.length ?? null,
    table_count: (graph.tables || []).length,
    families,
    control_valve_rows: valveRows,
    embedded_coils: { found: coilsFound, without_scheduled_valve: coilGaps, gaps_by_label: gapLabels },
    points_lists: {
      lists: basTotals.lists ?? 0, rows: basTotals.rows ?? 0,
      AI: basTotals.AI ?? 0, AO: basTotals.AO ?? 0, BI: basTotals.BI ?? 0, BO: basTotals.BO ?? 0,
    },
    ms: { graph: tGraph, total: Date.now() - t0 },
  };
}

if (splitSeed !== null) {
  const dir = join(corpus, "reports", "assemblies");
  const baseline = JSON.parse(readFileSync(join(dir, "00-baseline.json"), "utf8"));
  const drafters = JSON.parse(readFileSync(join(dir, "drafters.json"), "utf8"));
  const split = drawSplit(baseline, drafters, splitSeed);
  split.generated_at = new Date().toISOString();
  split.baseline_generated_at = baseline.generated_at;
  writeFileSync(join(dir, "01-split.json"), `${JSON.stringify(split, null, 1)}\n`);
  const L = [];
  const rows = (ts) => ts.reduce((n, t) => n + t.keyed_rows_max, 0);
  L.push("# Assemblies goal — WP0.2 frozen dev / held-out split");
  L.push("");
  L.push(`Seed **${split.seed}**, drawn ${split.generated_at} from the census of ${split.baseline_generated_at}.`);
  L.push(`Reproduce: \`cd opentakeoff/mcp && node --import tsx scripts/assemblies-baseline.mjs ../../opentakeoff-corpus --split ${split.seed}\`.`);
  L.push("");
  L.push("Rules (TRUTH, goals/ASSEMBLIES.md): documents are grouped by drafter (`drafters.json`, with the text evidence per firm) so no drafter sits on both sides; the seed shuffles the groups; groups go to held-out in that order until it holds ≥ " + split.heldout_min_docs + " documents, skipping a group whose removal would leave a required family uncovered in dev; then one claimed table is drawn per document × family stratum, and every printed row of it (up to " + split.key_rows_per_table_max + ", in printed order) is keyed from the render. Held-out documents are never used for tuning and are scored only at gates.");
  L.push("");
  L.push(`Population: ${split.population_docs} documents with ≥ 1 compiled row in a keyed equipment family (duplicates and derived renditions excluded: ${Object.keys(split.excluded_from_population).join(", ") || "none"}).`);
  if (split.required_coverage_missing_from_population.length) L.push(`Required families absent from the whole local population (not coverable here): ${split.required_coverage_missing_from_population.join(", ")}.`);
  L.push(`Seeded group order: ${split.shuffled_group_order.map((g) => `\`${g}\``).join(" → ")}.`);
  if (split.skipped_for_dev_coverage.length) L.push(`Kept in dev to preserve coverage: ${split.skipped_for_dev_coverage.map((s) => `\`${s.group}\` (${s.would_uncover.join(", ")})`).join("; ")}.`);
  for (const side of ["dev", "heldout"]) {
    const x = split[side];
    L.push("");
    L.push(`## ${side === "dev" ? "Dev" : "HELD-OUT"} — ${x.sets.length} documents, ${x.tables.length} tables, ≤ ${rows(x.tables)} keyed rows (upper bound from the compile's claimed rows)`);
    L.push("");
    L.push(`Drafter groups: ${x.groups.map((g) => `\`${g}\``).join(", ")}. Covers: ${x.covers.join(", ") || "—"}.`);
    L.push("");
    L.push("| Set | Family | Table drawn (sheet :: title) | Claimed rows | Keyed rows ≤ | Tables in stratum |");
    L.push("|---|---|---|---|---|---|");
    for (const t of x.tables) L.push(`| \`${t.set}\` | ${t.family} | ${t.table} | ${t.claimed_rows} | ${t.keyed_rows_max} | ${t.tables_in_stratum} |`);
  }
  L.push("");
  writeFileSync(join(dir, "01-split.md"), `${L.join("\n")}\n`);
  console.log(`split seed ${split.seed}: dev ${split.dev.sets.length} docs / ${split.dev.tables.length} tables / ≤${rows(split.dev.tables)} rows; held-out ${split.heldout.sets.length} docs / ${split.heldout.tables.length} tables / ≤${rows(split.heldout.tables)} rows`);
} else if (singleSetId) {
  const set = spec.sets.find((s) => s.id === singleSetId);
  if (!set) { console.error(`unknown set id: ${singleSetId}`); process.exit(2); }
  let result;
  try {
    const files = resolveSetFiles(corpus, spec, set);
    result = await cachedEvalResult("assemblies-baseline", files, [JSON.stringify(set), SCRIPT_DIGEST],
      () => computeSet(set));
  } catch (e) {
    result = { id: set.id, error: String(e?.stack || e?.message || e) };
  }
  process.stdout.write(JSON.stringify(result), () => process.exit(0));
} else {
  // A silently missing VectorGrid runtime drops the pipeline to its weaker
  // fallback and undercounts (PR #101: navfac 142 vs 163 valve rows) — so the
  // engine that actually ran is part of the report, probed once, up front.
  const importsOk = (py) => {
    const probe = spawnSync(py, ["-c", "import pdfplumber, pymupdf, shapely"], { encoding: "utf8" });
    if (probe.status !== 0) console.error(`WARNING: ${py} cannot import pdfplumber/pymupdf/shapely: ${String(probe.stderr || probe.error || "").trim().split("\n").pop()}`);
    return probe.status === 0;
  };
  // Same resolution order as vectorGridClient.ts and tableSidecarClient.ts.
  const VG_PYTHON = process.env.OPENTAKEOFF_VECTORGRID_PYTHON || process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "python3";
  const VG_IMPORTS_OK = importsOk(VG_PYTHON);
  const SIDECAR_PYTHON = process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON || "python3";
  const SIDECAR_IMPORTS_OK = process.env.OPENTAKEOFF_TABLE_SIDECAR === "0" ? null : importsOk(SIDECAR_PYTHON);
  const CONCURRENCY = Number(process.env.OPENTAKEOFF_EVAL_CONCURRENCY) || 1;
  const PER_SET_TIMEOUT_MS = Number(process.env.OPENTAKEOFF_EVAL_TIMEOUT_MS) || 45 * 60 * 1000;
  const wanted = spec.sets.filter((s) => !only.length || only.includes(s.id));
  const present = [];
  const absent = [];
  for (const set of wanted) {
    const files = resolveSetFiles(corpus, spec, set);
    (files.every((f) => existsSync(f)) ? present : absent).push(set);
  }

  const runChild = (set) => new Promise((res) => {
    const started = Date.now();
    process.stderr.write(`· ${set.id} …\n`);
    const child = spawn(process.execPath, ["--import", "tsx", thisScript, corpus, "--single-json", set.id],
      { stdio: ["ignore", "pipe", "inherit"] });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.stderr.write(`  ${set.id} done in ${((Date.now() - started) / 1000).toFixed(0)}s${value.error ? " (ERROR)" : ""}\n`);
      res(value);
    };
    const timer = setTimeout(() => { child.kill("SIGKILL"); finish({ id: set.id, error: `timed out after ${PER_SET_TIMEOUT_MS}ms` }); }, PER_SET_TIMEOUT_MS);
    const text = childStdoutText(child);
    child.on("close", (code) => {
      const out = text();
      if (code !== 0 || !out.trim()) return finish({ id: set.id, error: `child exited ${code} with no result` });
      try { finish(JSON.parse(out)); } catch (e) { finish({ id: set.id, error: `bad child JSON: ${e?.message || e}` }); }
    });
    child.on("error", (e) => finish({ id: set.id, error: String(e?.message || e) }));
  });

  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(present.map((set) => limit(() => runChild(set))));
  const ok = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);

  // ── aggregate ───────────────────────────────────────────────────────────
  const famAgg = {};
  for (const r of ok) {
    for (const [family, f] of Object.entries(r.families)) {
      const a = famAgg[family] ??= { sets: 0, items: 0, controls_relevant: f.controls_relevant, headers: {} };
      a.sets += 1;
      a.items += f.items;
      for (const [h, n] of Object.entries(f.headers)) {
        const ha = a.headers[h] ??= { sets: 0, items: 0 };
        ha.sets += 1;
        ha.items += n;
      }
    }
  }
  const setsWithControls = ok.filter((r) => Object.values(r.families).some((f) => f.controls_relevant));
  const controlsUnits = ok.reduce((n, r) => n + Object.values(r.families)
    .filter((f) => f.controls_relevant).reduce((m, f) => m + f.items, 0), 0);
  const summary = {
    generated_at: new Date().toISOString(),
    node: process.version,
    vectorgrid_python: VG_PYTHON,
    vectorgrid_mode: resolveVectorGridMode(),
    vectorgrid_python_imports_ok: VG_IMPORTS_OK,
    table_sidecar_python: process.env.OPENTAKEOFF_TABLE_SIDECAR === "0" ? "disabled (OPENTAKEOFF_TABLE_SIDECAR=0)" : SIDECAR_PYTHON,
    table_sidecar_python_imports_ok: SIDECAR_IMPORTS_OK,
    corpus_sets_registered: spec.sets.length,
    sets_requested: wanted.length,
    sets_present_here: present.length,
    sets_absent_here: absent.map((s) => s.id),
    sets_measured: ok.length,
    sets_errored: errors.map((r) => ({ id: r.id, error: String(r.error).split("\n")[0] })),
    sets_with_controls_relevant_equipment: setsWithControls.length,
    controls_relevant_units: controlsUnits,
    sets_with_points_list_rows: ok.filter((r) => r.points_lists.rows > 0).length,
    sets_with_control_valve_rows: ok.filter((r) => Object.keys(r.control_valve_rows).length > 0).length,
    control_valve_rows: ok.reduce((n, r) => n + Object.values(r.control_valve_rows).reduce((m, v) => m + v, 0), 0),
    embedded_coils_found: ok.reduce((n, r) => n + r.embedded_coils.found, 0),
    embedded_coils_without_scheduled_valve: ok.reduce((n, r) => n + r.embedded_coils.without_scheduled_valve, 0),
    families: famAgg,
    per_set: results,
  };

  // --out <dir> writes the census elsewhere (a reproducibility re-run must
  // not overwrite the committed baseline it is being compared against).
  const outDir = outOverride || join(corpus, "reports", "assemblies");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "00-baseline.json"), `${JSON.stringify(summary, null, 1)}\n`);

  const L = [];
  L.push("# Assemblies goal — WP0.1 baseline census");
  L.push("");
  L.push(`Generated ${summary.generated_at} by \`mcp/scripts/assemblies-baseline.mjs\` (Node ${summary.node}; VectorGrid mode \`${summary.vectorgrid_mode}\`, python \`${summary.vectorgrid_python}\`, imports ${summary.vectorgrid_python_imports_ok ? "OK" : "FAILED — weaker fallback engine"}; fallback table sidecar \`${summary.table_sidecar_python}\`${summary.table_sidecar_python_imports_ok === false ? " FAILED to import" : ""}).`);
  L.push("Reproduce: `cd opentakeoff/mcp && node --import tsx scripts/assemblies-baseline.mjs ../../opentakeoff-corpus`.");
  L.push("");
  L.push("## Coverage of this run");
  L.push("");
  L.push(`- Registered sets: ${summary.corpus_sets_registered}; PDFs present in this environment: **${summary.sets_present_here}**; measured: **${summary.sets_measured}**; errored: ${summary.sets_errored.length}.`);
  L.push(`- Absent here (not guessed): ${summary.sets_absent_here.length} sets.`);
  if (summary.sets_errored.length) L.push(`- Errors: ${summary.sets_errored.map((e) => `\`${e.id}\` (${e.error})`).join("; ")}.`);
  L.push("");
  L.push("## Headline numbers (measured sets only)");
  L.push("");
  L.push("| Measure | Value |");
  L.push("|---|---|");
  L.push(`| Sets with controls-relevant equipment | ${summary.sets_with_controls_relevant_equipment} / ${summary.sets_measured} |`);
  L.push(`| Controls-relevant schedule rows (units) | ${summary.controls_relevant_units} |`);
  L.push(`| Sets yielding any points-list rows | ${summary.sets_with_points_list_rows} / ${summary.sets_measured} |`);
  L.push(`| Sets yielding control-valve rows | ${summary.sets_with_control_valve_rows} / ${summary.sets_measured} (${summary.control_valve_rows} rows) |`);
  L.push(`| Hydronic coils found inside equipment schedules | ${summary.embedded_coils_found} (${summary.embedded_coils_without_scheduled_valve} with no scheduled valve) |`);
  L.push("");
  L.push("## Per set");
  L.push("");
  L.push("| Set | Sheets | Tables | Controls units | Families | Valve rows | Coils (no valve) | Points rows | Graph s |");
  L.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    if (r.error) { L.push(`| \`${r.id}\` | ERROR: ${String(r.error).split("\n")[0].slice(0, 80)} | | | | | | | |`); continue; }
    const cu = Object.values(r.families).filter((f) => f.controls_relevant).reduce((m, f) => m + f.items, 0);
    const fams = Object.entries(r.families).map(([k, f]) => `${k} ${f.items}`).join(", ");
    const vr = Object.values(r.control_valve_rows).reduce((m, v) => m + v, 0);
    L.push(`| \`${r.id}\` | ${r.sheet_count} | ${r.table_count} | ${cu} | ${fams || "—"} | ${vr} | ${r.embedded_coils.found} (${r.embedded_coils.without_scheduled_valve}) | ${r.points_lists.rows} | ${(r.ms.graph / 1000).toFixed(0)} |`);
  }
  L.push("");
  L.push("## Header census by family (headers carried by ≥ 2 items; items = rows with a printed cell)");
  L.push("");
  L.push("Raw material for WP1's canonical attribute schema. Printed text only, no synonym folding.");
  for (const [family, a] of Object.entries(famAgg).sort((x, y) => y[1].items - x[1].items)) {
    L.push("");
    L.push(`### ${family} — ${a.items} rows in ${a.sets} set(s)${a.controls_relevant ? "" : " (not controls-relevant)"}`);
    const hs = Object.entries(a.headers).filter(([, v]) => v.items >= 2).sort((x, y) => y[1].items - x[1].items);
    L.push("");
    L.push(hs.length ? hs.map(([h, v]) => `\`${h}\` ${v.items}/${v.sets}s`).join(" · ") : "_(no header carried by ≥ 2 rows)_");
  }
  L.push("");
  writeFileSync(join(outDir, "00-baseline.md"), `${L.join("\n")}\n`);
  console.log(`assemblies-baseline: ${ok.length}/${present.length} present sets measured (${absent.length} absent here, ${errors.length} errored) → ${join(outDir, "00-baseline.{json,md}")}`);
}
