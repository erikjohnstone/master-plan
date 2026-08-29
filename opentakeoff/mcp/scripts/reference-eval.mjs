// Scored evaluation for the "reference"-kind table extraction path
// (sheetgraph.ts's structural, vocabulary-free fourth table kind — see its
// own header comment for the full design rationale). Mirrors takeoff-eval.mjs's
// own conventions: the corpus lives OUTSIDE this repo, the key is authored by
// rendering the real sheet and reading it directly (never by trusting this
// pipeline's own output as its own ground truth — see
// keys/<id>.reference.csv's own header for exactly how), and this script is
// a dumb, stable ruler — do not "improve" the scorer to make a run look
// better; register a new case instead.
//
//   node --import tsx scripts/reference-eval.mjs <corpus-dir> [setId ...]
//
// Key format (CSV, header row required, "#"-prefixed lines and blank lines
// are comments) — keys/<id>.reference.csv:
//   sheet,table_title,row_key,column,expected_value
// One row per (table row x column) cell — long format, since each real
// reference table's own column set differs firm to firm.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pLimit from "p-limit";
import { Session } from "../src/session.ts";
import { buildPlanSetTakeoff } from "../src/takeoff.ts";
import { parseReferenceKeyCsv, scoreReference } from "../src/referenceEval.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== "--single-json");
// --single-json <setId>: internal mode, see takeoff-eval.mjs's own identical
// mechanism for the full rationale (real per-set CPU-bound work needs real
// OS-level parallelism — a child process per set — not just promise
// concurrency in one process).
const singleJsonIdx = process.argv.indexOf("--single-json");
const singleJsonSetId = singleJsonIdx >= 0 ? process.argv[singleJsonIdx + 1] : null;
const CONCURRENCY = Number(process.env.OPENTAKEOFF_EVAL_CONCURRENCY) || 2;
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/reference-eval.mjs <corpus-dir> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";

async function evalSet(set) {
  const keyPath = join(corpus, "keys", `${set.id}.reference.csv`);
  if (!existsSync(keyPath)) return { id: set.id, unlabelled: true };
  const key = parseReferenceKeyCsv(readFileSync(keyPath, "utf8"));

  const s = new Session();
  const files = resolveSetFiles(corpus, spec, set);
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
  const takeoff = await buildPlanSetTakeoff(s, { categories: null });

  return { id: set.id, score: scoreReference(takeoff.reference_tables, key) };
}

if (singleJsonSetId) {
  const set = spec.sets.find((s) => s.id === singleJsonSetId);
  if (!set) { console.error(`unknown set id: ${singleJsonSetId}`); process.exit(2); }
  let result;
  try { result = await evalSet(set); }
  catch (e) { result = { id: set.id, error: String(e.message || e) }; }
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
      if (code !== 0 || !out.trim()) { res({ id: set.id, error: `child process exited ${code} with no result` }); return; }
      try { res(JSON.parse(out)); }
      catch (e) { res({ id: set.id, error: `bad child JSON: ${String(e.message || e)}` }); }
    });
    child.on("error", (e) => res({ id: set.id, error: String(e.message || e) }));
  });
}

const results = await Promise.all(wanted.map((set) => limit(() => evalSetInChildProcess(set))));

console.log("╔══════════════════════════════════════════════════════════════════════════");
console.log("║ REFERENCE-TABLE EXTRACTION — scored against real sets");
console.log("╚══════════════════════════════════════════════════════════════════════════\n");
console.log("set                        cells   exact");
console.log("──────────────────────────────────────────");
let anyLabelled = false;
for (const r of results) {
  if (r.unlabelled) { console.log(`${r.id.padEnd(26)} (no reference key — not scored)`); continue; }
  if (r.error) { console.log(`${r.id.padEnd(26)} ERROR: ${r.error}`); continue; }
  anyLabelled = true;
  console.log(`${r.id.padEnd(26)} ${String(r.score.total).padStart(5)}   ${pct(r.score.exactPct)}`);
  for (const c of r.score.perCell) {
    if (!c.exact) console.log(`   MISMATCH  "${c.table_title}" / "${c.row_key}" / "${c.column}": expected "${c.expected_value}" got ${c.actual == null ? "(missing)" : `"${c.actual}"`}`);
  }
}
if (!anyLabelled) console.log("(no sets had a *.reference.csv key)");
