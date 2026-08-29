// Scored evaluation for the project-level takeoff pipeline (src/takeoff.ts's
// buildPlanSetTakeoff) against REAL plan sets. Mirrors graph-eval.mjs's and
// mep-trace-eval.mjs's own conventions exactly: the corpus lives OUTSIDE this
// repo, the key is authored by RENDERING the real sheet and looking at it
// directly (never by trusting buildPlanSetTakeoff's own output as its own
// ground truth — see keys/<id>.takeoff.csv's own header for exactly how),
// and this script is deliberately a dumb, stable ruler — do not "improve" the
// scorer to make a run look better; register a new case instead, same
// discipline as every other eval in this project.
//
//   node --import tsx scripts/takeoff-eval.mjs <corpus-dir> [setId ...] [--report]
//
// FOUR things reported, kept structurally separate (never blended into one
// flattering pass/fail number — same doctrine as mep-trace-eval.mjs's own
// three-metric split):
//
//   1. QUANTITY DELTA per tag — expected (the key) vs. actual (what
//      buildPlanSetTakeoff's own sweep_schedule_row call really counted).
//      A tag the pipeline never resolved counts as actual=0, so a real
//      extraction failure shows up as a real delta, not a silent skip.
//   2. MISSING — a key tag with NO item at all in the pipeline's own output
//      (out of the run's category scope, or the schedule table itself was
//      never seen). Different from a quantity delta of 0 vs N: this is the
//      pipeline never having tried.
//   3. FALSELY ADDED — a resolved, quantity>0 pipeline item whose tag the
//      key never mentions at all: either a real schedule row this key
//      hasn't caught up with yet, or the pipeline inventing/misreading a tag.
//   4. FAILURE-TYPE BREAKDOWN — buildPlanSetTakeoff's own TakeoffFailure[],
//      tallied by its closed taxonomy (TABLE_DISCOVERY_FAILURE,
//      SYMBOL_FALSE_NEGATIVE, AMBIGUOUS_ROW_KEY, ... — see takeoff.ts).
//
// Key format (CSV, header row required, "#"-prefixed lines and blank lines
// are comments) — keys/<id>.takeoff.csv:
//   tag, equipment_type, expected_quantity, sheets (";"-separated), notes
// The comparison math itself (per-tag delta, missing/falsely-added,
// failure-breakdown, the aggregate summary) lives in src/takeoffEval.ts —
// pulled out of this script specifically so it carries a real regression
// test (test/takeoffEval.test.ts) against a synthetic key + synthetic
// pipeline output; this script is just the corpus-walking CLI shell around it.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pLimit from "p-limit";
import { Session } from "../src/session.ts";
import { buildPlanSetTakeoff } from "../src/takeoff.ts";
import { parseTakeoffKeyCsv, scoreTakeoff } from "../src/takeoffEval.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== "--single-json");
const writeReport = process.argv.includes("--report");
// --single-json <setId>: internal mode used by the parallel fan-out below —
// evaluate exactly one set and print ONLY its JSON result to stdout, no
// table/formatting. Not meant to be invoked directly by a human/agent; the
// public CLI contract (a corpus dir + optional set ids + --report) is
// unchanged.
const singleJsonIdx = process.argv.indexOf("--single-json");
const singleJsonSetId = singleJsonIdx >= 0 ? process.argv[singleJsonIdx + 1] : null;
// Bounded fan-out concurrency: each set's own evaluation (pdf.js parsing +
// sheetgraph computation) is real, synchronous, CPU-bound work — running it
// "concurrently" via Promise.all/p-limit WITHIN one process would not
// actually parallelize it (JS is single-threaded; p-limit only helps
// I/O-bound waiting). Genuine wall-clock speedup needs real OS-level
// parallelism, so each set is fanned out to its OWN child process (the
// exact same command a human/agent would run standalone for one set) and
// bounded to CONCURRENCY at a time so this doesn't itself blow past the
// project's own load-average safety mandate on an 8-core machine that may
// already have other agent workers running. Override via
// OPENTAKEOFF_EVAL_CONCURRENCY if a caller has real headroom to spend.
const CONCURRENCY = Number(process.env.OPENTAKEOFF_EVAL_CONCURRENCY) || 2;
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/takeoff-eval.mjs <corpus-dir> [setId ...] [--report]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";

async function evalSet(set) {
  const keyPath = join(corpus, "keys", `${set.id}.takeoff.csv`);
  if (!existsSync(keyPath)) return { id: set.id, gc: set.gc, project: set.project, unlabelled: true };
  const key = parseTakeoffKeyCsv(readFileSync(keyPath, "utf8"));

  const s = new Session();
  const files = resolveSetFiles(corpus, spec, set);
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
  const takeoff = await buildPlanSetTakeoff(s, { categories: null }); // "all" — the key is authored against the full real equipment-kind scope, not a partial run

  const score = scoreTakeoff(takeoff, key);
  return { id: set.id, gc: set.gc, project: set.project, score };
}

// Internal single-set worker mode — runs in its own child process, prints
// exactly one JSON line, exits. See CONCURRENCY comment above.
if (singleJsonSetId) {
  const set = spec.sets.find((s) => s.id === singleJsonSetId);
  if (!set) { console.error(`unknown set id: ${singleJsonSetId}`); process.exit(2); }
  let result;
  try { result = await evalSet(set); }
  catch (e) { result = { id: set.id, gc: set.gc, project: set.project, error: String(e.message || e) }; }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

const wanted = spec.sets.filter((s) => !only.length || only.includes(s.id));
const thisScript = fileURLToPath(import.meta.url);
const limit = pLimit(CONCURRENCY);

function evalSetInChildProcess(set) {
  return new Promise((res) => {
    process.stderr.write(`· ${set.id} …\n`);
    const child = spawn(process.execPath, ["--import", "tsx", thisScript, corpus, "--single-json", set.id], { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      if (code !== 0 || !out.trim()) {
        res({ id: set.id, gc: set.gc, project: set.project, error: `child process exited ${code} with no result` });
        return;
      }
      try { res(JSON.parse(out)); }
      catch (e) { res({ id: set.id, gc: set.gc, project: set.project, error: `bad child JSON: ${String(e.message || e)}` }); }
    });
    child.on("error", (e) => res({ id: set.id, gc: set.gc, project: set.project, error: String(e.message || e) }));
  });
}

const results = await Promise.all(wanted.map((set) => limit(() => evalSetInChildProcess(set))));

const lines = [];
const say = (l = "") => { lines.push(l); console.log(l); };

say("╔══════════════════════════════════════════════════════════════════════════");
say("║ PROJECT-LEVEL TAKEOFF — scored against real sets");
say("╚══════════════════════════════════════════════════════════════════════════");
say("");
say("set                        tags   exact    Σ|Δqty|   missing   false-add");
say("──────────────────────────────────────────────────────────────────────────");
const agg = { tags: 0, exact: 0, delta: 0, missing: 0, falseAdd: 0 };
const failureAgg = new Map();
for (const r of results) {
  if (r.error) { say(`${r.id.padEnd(26)} ERROR: ${r.error.slice(0, 60)}`); continue; }
  if (r.unlabelled) { say(`${r.id.padEnd(26)} (no takeoff key yet)`); continue; }
  const { score } = r;
  agg.tags += score.summary.total_tags;
  agg.exact += score.summary.exact_matches;
  agg.delta += score.summary.total_quantity_delta;
  agg.missing += score.missing.length;
  agg.falseAdd += score.falsely_added.length;
  for (const [type, n] of Object.entries(score.failure_breakdown)) failureAgg.set(type, (failureAgg.get(type) || 0) + n);
  say(`${r.id.padEnd(26)}${String(score.summary.total_tags).padStart(5)}   ${pct(score.summary.exact_match_pct)}   `
    + `${String(score.summary.total_quantity_delta).padStart(7)}   ${String(score.missing.length).padStart(7)}   ${String(score.falsely_added.length).padStart(9)}`);
}
say("──────────────────────────────────────────────────────────────────────────");
say(`${"CORPUS".padEnd(26)}${String(agg.tags).padStart(5)}   ${pct(agg.tags ? agg.exact / agg.tags : 0)}   `
  + `${String(agg.delta).padStart(7)}   ${String(agg.missing).padStart(7)}   ${String(agg.falseAdd).padStart(9)}`);
say("");

// per-tag detail, worst first (largest |delta| first, then missing, then falsely-added)
for (const r of results) {
  if (r.error || r.unlabelled) continue;
  const { score } = r;
  const offenders = score.per_tag.filter((t) => !t.exact).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (offenders.length || score.missing.length || score.falsely_added.length) {
    say(`── ${r.id} — real mismatches ──`);
    for (const t of offenders) {
      say(`  ${t.tag.padEnd(10)} expected=${t.expected}  actual=${t.actual}  Δ=${t.delta > 0 ? "+" : ""}${t.delta}  status=${t.status}`);
    }
    for (const tag of score.missing) say(`  ${tag.padEnd(10)} MISSING — no item at all in the pipeline's output (out of scope, or the table was never seen)`);
    for (const f of score.falsely_added) say(`  ${f.tag.padEnd(10)} FALSELY ADDED — qty=${f.quantity}, type=${f.equipment_type ?? "(unclassified)"}, the key never mentions this tag`);
    say("");
  }
}

if (failureAgg.size) {
  say("── failure-type breakdown (TakeoffFailure[], every set) ──");
  for (const [type, n] of [...failureAgg.entries()].sort((a, b) => b[1] - a[1])) say(`  ${String(n).padStart(4)}×  ${type}`);
  say("");
}

if (writeReport) {
  const p = join(corpus, "reports", `TAKEOFF-EVAL-${new Date(spec.stamp ?? Date.now()).toISOString().slice(0, 10)}.txt`);
  writeFileSync(p, lines.join("\n"));
  console.error(`\nwrote ${p}`);
}
process.exit(0);
