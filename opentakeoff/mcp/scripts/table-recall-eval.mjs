// Scored evaluation for the RECALL tier — the question every other key in
// this project cannot answer: does the pipeline ever find a schedule table
// at all? takeoff/reference/rowsym keys are all scoped to tables sheetgraph.ts
// already extracted (they walk the pipeline's own output and check its
// content), so a table the pipeline never sees cannot appear in any of them
// — those tiers measure precision and are structurally blind to recall. This
// tier's key is authored the opposite way: render the real sheet and write
// down every schedule table a human sees, independent of what the pipeline
// found. Mirrors reference-eval.mjs's own conventions: the corpus lives
// OUTSIDE this repo, this script is a dumb, stable ruler — do not "improve"
// the scorer to make a run look better; register a new case instead.
//
//   node --import tsx scripts/table-recall-eval.mjs <corpus-dir> [setId ...]
//
// Key format (CSV, header row required, "#"-prefixed lines and blank lines
// are comments) — keys/<id>.tables.csv:
//   sheet,table_title,note
// One row per schedule table a human sees on the rendered sheet. ~10x
// cheaper per document to author than a cell-level key, and the only tier
// that catches a whole-table miss (a rule sheetgraph.ts's table-discovery
// pass never fires for at all) rather than a wrong cell in a table it did find.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pLimit from "p-limit";
import { Session } from "../src/session.ts";
import { parseTableRecallKeyCsv, scoreTableRecall } from "../src/tableRecallEval.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== "--single-json");
// --single-json <setId>: internal mode, see takeoff-eval.mjs's own identical
// mechanism for the full rationale (real per-set CPU-bound work needs real
// OS-level parallelism — a child process per set — not just promise
// concurrency in one process).
const singleJsonIdx = process.argv.indexOf("--single-json");
const singleJsonSetId = singleJsonIdx >= 0 ? process.argv[singleJsonIdx + 1] : null;
const CONCURRENCY = Number(process.env.OPENTAKEOFF_EVAL_CONCURRENCY) || 2;
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/table-recall-eval.mjs <corpus-dir> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";

async function evalSet(set) {
  const keyPath = join(corpus, "keys", `${set.id}.tables.csv`);
  if (!existsSync(keyPath)) return { id: set.id, unlabelled: true };
  const key = parseTableRecallKeyCsv(readFileSync(keyPath, "utf8"), keyPath);

  const s = new Session();
  const files = resolveSetFiles(corpus, spec, set);
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
  const g = await s.sheetGraph();
  // Session.sheetGraph()'s per-sheet schedules are the SheetGraphSchedule
  // summary shape — title is already a plain string here (not an Evidence
  // object like g.tables[].title on the raw graph), and rows is already a
  // count, not the row array. Confirmed live: reading t.title?.text against
  // this shape silently produced "" for every table.
  const foundTables = g.sheets.flatMap((sheet) => sheet.schedules.map((t) => ({ sheet: sheet.sheet, title: t.title || "" })));

  return { id: set.id, score: scoreTableRecall(foundTables, key) };
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
console.log("║ TABLE RECALL — does the pipeline find the table at all (not just score it right)");
console.log("╚══════════════════════════════════════════════════════════════════════════\n");
console.log("set                        tables  recall");
console.log("──────────────────────────────────────────");
let anyLabelled = false;
for (const r of results) {
  if (r.unlabelled) { console.log(`${r.id.padEnd(26)} (no *.tables.csv key — not scored)`); continue; }
  if (r.error) { console.log(`${r.id.padEnd(26)} ERROR: ${r.error}`); continue; }
  anyLabelled = true;
  console.log(`${r.id.padEnd(26)} ${String(r.score.total).padStart(6)}   ${pct(r.score.recallPct)}`);
  for (const row of r.score.perTable) {
    if (row.status === "MISSED") console.log(`   MISSED  "${row.sheet}" / "${row.table_title}"${row.note ? ` — ${row.note}` : ""}`);
  }
  for (const extra of r.score.extras) {
    console.log(`   EXTRA   "${extra.sheet}" / "${extra.title}" — found by the pipeline, not in the key`);
  }
}
if (!anyLabelled) console.log("(no sets had a *.tables.csv key)");
