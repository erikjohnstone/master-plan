// Scored evaluation for WP7 (plans/03-drawing-tag-recognition-audit.md
// §3.8): does WP2's buildTagIndex (graph.tags) find the tags a human
// actually sees on the rendered sheet? Mirrors table-recall-eval.mjs's own
// conventions exactly — the corpus lives OUTSIDE this repo, this script is
// a dumb, stable ruler; do not "improve" the scorer to make a run look
// better, register a new key row instead.
//
//   node --import tsx scripts/tag-eval.mjs <corpus-dir> [setId ...]
//
// Key format (CSV, header row required, "#"-prefixed lines and blank lines
// are comments) — keys/<id>.tags.csv:
//   sheet,tag,role,in_table,note
// One row per drawn tag INSTANCE a human sees on an independently rendered
// crop (render-page-crop.mjs — never view_sheet's own graph-aware crop,
// which would defeat the measurement by showing the pipeline's own answer).
// Matching is sheet + canonical key identity only (tagEval.ts), the same
// {sheet, title} identity table-recall-eval.mjs already uses — no bbox
// column. An earlier version of this key carried a hand-estimated
// x0,y0,x1,y1 bbox matched with a center-distance tolerance; a live check
// against real corpus data found that hand-measuring pixel offsets off a
// single rendered page doesn't reliably land in the same coordinate space
// as graph.tags' own bbox on this corpus's CAD-exported PDFs (some pages
// carry content in more than one coordinate regime), so it was dropped —
// see tagEval.ts's own header comment for the full story.
//
// Exits non-zero when any keyed set falls under the §3.11.4 floors:
// precision < 0.97 or recall < 0.95.
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import pLimit from "p-limit";
import { Session } from "../src/session.ts";
import { parseTagKeyCsv, scoreTagEval } from "../src/tagEval.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--") && a !== "--single-json");
// --single-json <setId>: internal mode, see takeoff-eval.mjs's own identical
// mechanism — real per-set CPU-bound work needs real OS-level parallelism
// (a child process per set), not just promise concurrency in one process.
const singleJsonIdx = process.argv.indexOf("--single-json");
const singleJsonSetId = singleJsonIdx >= 0 ? process.argv[singleJsonIdx + 1] : null;
const CONCURRENCY = Number(process.env.OPENTAKEOFF_EVAL_CONCURRENCY) || 2;
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/tag-eval.mjs <corpus-dir> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

const PRECISION_FLOOR = 0.97;
const RECALL_FLOOR = 0.95;
const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";

async function evalSet(set) {
  const keyPath = join(corpus, "keys", `${set.id}.tags.csv`);
  if (!existsSync(keyPath)) return { id: set.id, unlabelled: true };
  const key = parseTagKeyCsv(readFileSync(keyPath, "utf8"), keyPath);

  const s = new Session();
  const files = resolveSetFiles(corpus, spec, set);
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
  const graph = await s.graphForPipeline();

  return { id: set.id, score: scoreTagEval(graph.tags ?? [], key) };
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
console.log("║ TAG CENSUS — does graph.tags find what a human sees on the render (WP7)");
console.log("╚══════════════════════════════════════════════════════════════════════════\n");
console.log("set                        found/total  recall   precision");
console.log("────────────────────────────────────────────────────────────");
let anyLabelled = false;
let anyBelowFloor = false;
for (const r of results) {
  if (r.unlabelled) { console.log(`${r.id.padEnd(26)} (no *.tags.csv key — not scored)`); continue; }
  if (r.error) { console.log(`${r.id.padEnd(26)} ERROR: ${r.error}`); continue; }
  anyLabelled = true;
  const belowFloor = r.score.precisionPct < PRECISION_FLOOR || r.score.recallPct < RECALL_FLOOR;
  if (belowFloor) anyBelowFloor = true;
  const flag = belowFloor ? " *** BELOW FLOOR ***" : "";
  console.log(`${r.id.padEnd(26)} ${String(r.score.found).padStart(3)}/${String(r.score.total).padEnd(6)} ${pct(r.score.recallPct)}   ${pct(r.score.precisionPct)}${flag}`);
  for (const row of r.score.perTag) {
    if (row.status === "MISSED") console.log(`   MISSED  "${row.tag}" on ${row.sheet}${row.note ? ` — ${row.note}` : ""}`);
  }
  for (const extra of r.score.extras) {
    console.log(`   EXTRA   "${extra.text}" on ${extra.sheet} (role ${extra.role}) — found by the pipeline, not in the key, and matches a family the key enumerates there`);
  }
  const roleRows = Object.entries(r.score.byRole).map(([role, s]) => `${role}: ${s.found}/${s.total}`).join(", ");
  const famRows = Object.entries(r.score.byFamily).map(([fam, s]) => `${fam}: ${s.found}/${s.total}`).join(", ");
  console.log(`   by role: ${roleRows}`);
  console.log(`   by family: ${famRows}`);
}
if (!anyLabelled) console.log("(no sets had a *.tags.csv key)");
if (anyBelowFloor) {
  console.error(`\ntag-eval: at least one keyed set fell under the floor (precision < ${PRECISION_FLOOR}, recall < ${RECALL_FLOOR}).`);
  process.exit(1);
}
