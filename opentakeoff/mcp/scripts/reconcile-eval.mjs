// The RECONCILE EVAL: the schedule<->plan reconcile scored in both directions
// (a scheduled unit's plan placements; a drawn tag's schedule row) against the
// reconcile keys, which are authored from renders and the text layer, never
// pipeline output (keys/<set>.plansheets.csv, keys/<set>.plantags.csv).
//
// SHOULD THIS BE ON THE SHARED PATH? What it measures is shared: the reconcile
// every surface runs (reconcileSchedulePlan through production-graph-cli, the
// route the UI's Takeoff canvas and MCP's reconcile_schedule_plan share). The
// scoring (reconcileEval.mjs) is eval-only; no surface imports it.
//
//   node --import tsx scripts/reconcile-eval.mjs <corpus-dir> [setId ...]
//        [--check] [--fast] [--runs DIR] [--report] [--detail]
//
//   --check    the check side (reports/reconcile/01-split.json): documents
//              keyed but never tuned on; aggregates only.
//   --fast     the evaluation-fast lane (tagged sweep only); the default is the
//              production lane (full sweep), as the UI runs it.
//   --runs DIR read each set's reconcile output from DIR/<set>.json when there,
//              and write it there when run: rescoring without re-running.
//   --report   write reports/reconcile/02-reconcile-eval-<side>{-fast}.{json,md}.
//   --detail   (dev only) every unit and link that disagrees with the key.
//   --score-only  with --runs: score the run files there, never run a reconcile
//              (a set with no run file is reported as an error), so outputs
//              made by another checkout are scored by this scorer, unmixed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { readReconcileKey, scoreReconcileSet, totals, pct } from "./reconcileEval.mjs";
import { resolveSetFiles } from "./corpusFiles.mjs";

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const opt = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--runs");
const [corpusDir, ...only] = positional;
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/reconcile-eval.mjs <corpus-dir> [setId ...] [--check] [--fast] [--runs DIR] [--report] [--detail]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const side = flag("--check") ? "check" : "dev";
if (flag("--detail") && side === "check") { console.error("--detail is dev-only: the check side is scored in aggregate"); process.exit(2); }
const fast = flag("--fast");
const runsDir = opt("--runs");
const split = JSON.parse(readFileSync(join(corpus, "reports", "reconcile", "01-split.json"), "utf8"));
const sideSets = split[side].sets;
const unknown = only.filter((id) => !sideSets.includes(id));
if (unknown.length) { console.error(`not ${side} documents: ${unknown.join(", ")}`); process.exit(2); }
const setIds = (only.length ? only : sideSets).filter((id) => readReconcileKey(corpus, id));
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
const here = fileURLToPath(new URL(".", import.meta.url));

function runReconcile(id) {
  const files = resolveSetFiles(corpus, spec, spec.sets.find((s) => s.id === id));
  const args = ["--import", "tsx", join(here, "production-graph-cli.mjs"), "--mode", "reconcile", ...files.flatMap((f) => ["--pdf", f]), ...(fast ? ["--evaluation-fast"] : [])];
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { cwd: join(here, ".."), stdio: ["ignore", "pipe", "pipe"] });
    const out = [], err = [];
    child.stdout.on("data", (b) => out.push(b));
    child.stderr.on("data", (b) => { err.push(b); if (err.length > 200) err.shift(); });
    const timer = setTimeout(() => child.kill("SIGKILL"), 3 * 3600 * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(out).toString("utf8");
      const start = text.indexOf("{");
      const tail = Buffer.concat(err).toString("utf8").split("\n").filter((l) => l.trim() && !/Warning/.test(l)).slice(-3).join(" | ");
      if (code !== 0 || start < 0) return fail(new Error(`${id}: reconcile exited ${code}${tail ? ` (${tail.slice(0, 400)})` : ""}`));
      try { ok(JSON.parse(text.slice(start))); } catch (e) { fail(new Error(`${id}: unreadable reconcile output (${e.message})`)); }
    });
  });
}

const results = [];
for (const id of setIds) {
  const key = readReconcileKey(corpus, id);
  const cached = runsDir && join(runsDir, `${id}.json`);
  let output;
  const t0 = Date.now();
  if (cached && existsSync(cached)) output = JSON.parse(readFileSync(cached, "utf8"));
  else if (flag("--score-only")) { results.push({ id, error: "no run file (--score-only)" }); continue; }
  else {
    process.stderr.write(`· ${id} …\n`);
    try { output = await runReconcile(id); } catch (e) { console.error(`  ${e.message}`); results.push({ id, error: e.message }); continue; }
    if (cached) { mkdirSync(runsDir, { recursive: true }); writeFileSync(cached, JSON.stringify(output)); }
    process.stderr.write(`  ${id}: ${output.rows?.length ?? 0} reconcile rows in ${Math.round((Date.now() - t0) / 1000)}s\n`);
  }
  results.push({ id, ...scoreReconcileSet(key, output) });
}

const ok = results.filter((r) => !r.error);
const T = totals(ok);
const L = [];
L.push(`RECONCILE EVAL — ${side}${fast ? " (evaluation-fast lane)" : " (production lane: full sweep)"}; ${ok.length} documents${results.length > ok.length ? `, ${results.length - ok.length} errored` : ""}`);
L.push("");
L.push("ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)");
L.push(`  units keyed ${T.units ?? 0}; no reconcile row ${T.unmatched ?? 0}; listed in two rows ${T.duplicate_rows ?? 0}`);
L.push(`  drawn on a plan: found ${T.drawn_tp ?? 0}, missed ${T.drawn_fn ?? 0}; not drawn: said not drawn ${T.drawn_tn ?? 0}, cited anyway ${T.drawn_fp ?? 0}`);
L.push(`  placements: key ${T.key_placements ?? 0}, pipeline ${T.pipeline_placements ?? 0}, agreeing ${T.placement_hits ?? 0} (recall ${pct(T.placement_hits, T.key_placements)}, precision ${pct(T.placement_hits, T.pipeline_placements)})`);
L.push(`  placements on a keyed view of the unit: ${T.placement_located ?? 0} (recall ${pct(T.placement_located, T.key_placements)}, precision ${pct(T.placement_located, T.pipeline_placements)})`);
L.push(`  unit count exact ${T.count_exact ?? 0}/${(T.units ?? 0) - (T.unmatched ?? 0)} (${pct(T.count_exact, (T.units ?? 0) - (T.unmatched ?? 0))}); over ${T.count_over ?? 0}, under ${T.count_under ?? 0}`);
L.push(`  by its tag, verified or tag text only (AMBIGUOUS): drawn units found ${T.tag_drawn_tp ?? 0}, missed ${T.tag_drawn_fn ?? 0}; on a keyed view ${T.tag_located ?? 0} (recall ${pct(T.tag_located, T.key_placements)}, precision ${pct(T.tag_located, T.tag_observations)})`);
L.push("");
L.push("PLAN -> ROW (each keyed drawn tag on an examined plan sheet)");
L.push(`  a scheduled unit's tag linked to its row on that sheet: ${T.linked ?? 0}/${T.links ?? 0} (${pct(T.linked, T.links)})`);
L.push(`  an unscheduled tag named on the review list: ${T.unscheduled_listed ?? 0}/${T.unscheduled ?? 0} (${pct(T.unscheduled_listed, T.unscheduled)}); taken for a row: ${T.unscheduled_linked_to_a_row ?? 0}`);
L.push(`  review list entries on examined sheets: ${T.review_listed ?? 0}; an unscheduled unit's tag ${T.review_unscheduled ?? 0} (${pct(T.review_unscheduled, T.review_listed)}), a scheduled unit's tag ${T.review_scheduled ?? 0}, no unit tag ${T.review_not_a_unit ?? 0}`);
L.push(`  likely-units list: names ${T.unscheduled_units_listed ?? 0}/${T.unscheduled ?? 0} unscheduled tags (${pct(T.unscheduled_units_listed, T.unscheduled)}); ${T.units_listed ?? 0} entries on examined sheets: an unscheduled unit's tag ${T.units_unscheduled ?? 0} (${pct(T.units_unscheduled, T.units_listed)}), a scheduled unit's tag ${T.units_scheduled ?? 0}, no unit tag ${T.units_not_a_unit ?? 0}`);
L.push("");
L.push("| set | units | unmatched | drawn found/missed | by its tag | cited not drawn | placements key/pipe/agree | count exact | links | unscheduled listed | review list unit/all |");
L.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const r of results) {
  if (r.error) { L.push(`| ${r.id} | error: ${r.error} |`); continue; }
  const s = r.summary;
  L.push(`| ${r.id} | ${s.units} | ${s.unmatched} | ${s.drawn_tp}/${s.drawn_fn} | ${s.tag_drawn_tp}/${s.tag_drawn_tp + s.tag_drawn_fn} | ${s.drawn_fp} | ${s.key_placements}/${s.pipeline_placements}/${s.placement_hits} | ${s.count_exact}/${s.units - s.unmatched} | ${s.linked}/${s.links} | ${s.unscheduled_listed}/${s.unscheduled} | ${s.review_unscheduled}/${s.review_listed} |`);
}
if (flag("--detail")) {
  for (const r of ok) {
    const bad = r.units.filter((u) => !u.matched || u.key !== u.pipeline);
    const badLinks = r.links.filter((l) => l.unit === "unscheduled" ? !l.listed || l.linked_to_a_row : !l.linked);
    if (!bad.length && !badLinks.length) continue;
    L.push("", `## ${r.id}`);
    for (const u of bad) L.push(u.matched ? `- ${u.unit.split("|")[1]}: key ${u.key}, pipeline ${u.pipeline} [${u.status}; installed ${u.installed_qty}] ${u.sheets.map((s) => `${s.sheet.replace(/^.*#/, "p")} ${s.key}/${s.pipeline}`).join(", ")}` : `- ${u.unit.split("|")[1]}: NO RECONCILE ROW`);
    for (const l of badLinks) L.push(`- drawn ${l.drawn} on ${l.sheet.replace(/^.*#/, "p")} (${l.unit === "unscheduled" ? "unscheduled" : l.unit.split("|")[1]}): ${l.unit === "unscheduled" ? `${l.listed ? "listed" : "NOT LISTED"}${l.linked_to_a_row ? ", TAKEN FOR A ROW" : ""}` : `NOT LINKED${l.row ? "" : " (no row)"}`}`);
  }
}
const text = L.join("\n");
console.log(text);
if (flag("--report")) {
  const dir = join(corpus, "reports", "reconcile");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `02-reconcile-eval-${side}${fast ? "-fast" : ""}`);
  const heldAggregate = side === "check";
  writeFileSync(`${base}.json`, JSON.stringify({ side, fast, totals: T, sets: heldAggregate ? results.map((r) => ({ id: r.id, error: r.error, summary: r.summary })) : results }, null, 1) + "\n");
  writeFileSync(`${base}.md`, `# Reconcile eval — ${side}${fast ? " (fast lane)" : ""}\n\n\`\`\`\n${text}\n\`\`\`\n`);
}
process.exit(0);
