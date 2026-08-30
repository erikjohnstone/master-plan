// Scored evaluation for sweep_inline_motif (accuracy-hardening plan Phase 4)
// against REAL plan sets. Method, current results and known gaps:
// docs/INLINE-MOTIF-EVAL.md
//
//   node --import tsx scripts/inline-motif-eval.mjs <corpus-dir> [setId ...]
//
// Mirrors graph-eval.mjs/mep-trace-eval.mjs's own conventions exactly: the
// corpus lives OUTSIDE this repo, the key is authored by RENDERING the real
// sheet and looking at it (never by trusting sweep_inline_motif's own output
// as its own ground truth), and this script is a dumb, stable ruler — do
// not "improve" the scorer to make a run look better; register a new case
// instead.
//
// Key format — keys/<id>.inlinemotif.csv:
//   sheet, seed_x, seed_y, target_x, target_y, expect_status, note
//     sheet          sheet key exactly as load_plan/sheet_info report it
//     seed_x/y       image px (RENDER_SCALE 2.0) — inside ONE real
//                    register/grille's own hatched fill, marqueed once
//     target_x/y     image px — a SECOND real instance's own center, that
//                    the seed's own sweep should (or should not) find
//     expect_status  matched | missed
//     note           how the target was independently verified (which
//                    region was rendered, what was seen)
//
// ONE metric: recall — of the real target instances the key says the seed
// should find, how many did sweep_inline_motif actually report as a match
// within a real tolerance radius of the target's own center?
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { Session } from "../src/session.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const writeReport = process.argv.includes("--report");
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/inline-motif-eval.mjs <corpus-dir> [setId ...] [--report]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

function readCsv(path) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((l) => {
    const cells = [];
    let cur = "", q = false;
    for (const ch of l) {
      if (ch === '"') { q = !q; continue; }
      if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

// A real match's own footprint radius isn't in the key (the key only names
// centers) — a generous, real, disclosed tolerance: half the sheet's own
// typical register box long-side, measured across this corpus's own real
// boxes so far (~35-80 image px). 60px covers that with room to spare
// without risking two genuinely distinct real instances colliding.
const MATCH_TOL_PX = 60;

async function evalSet(set) {
  const s = new Session();
  const files = resolveSetFiles(corpus, spec, set);
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });

  const key = readCsv(join(corpus, "keys", `${set.id}.inlinemotif.csv`));
  const out = { id: set.id, gc: set.gc, project: set.project, misses: [] };
  if (!key) { out.unlabelled = true; return out; }

  // group rows by (sheet, seed) so the sweep runs once per real seed, not
  // once per target row
  const bySeed = new Map();
  for (const row of key) {
    const k = `${row.sheet}|${row.seed_x}|${row.seed_y}`;
    if (!bySeed.has(k)) bySeed.set(k, { sheet: row.sheet, seed_x: Number(row.seed_x), seed_y: Number(row.seed_y), rows: [] });
    bySeed.get(k).rows.push(row);
  }

  let tp = 0, fn = 0, tnRefusalCorrect = 0, fp = 0;
  for (const { sheet, seed_x, seed_y, rows } of bySeed.values()) {
    let res;
    try {
      // a real committed scale, when the sheet has one, is what makes the
      // real-world size tolerance mean anything across genuinely different
      // real fixture sizes — never silently skipped.
      const info = await s.sheetInfo(sheet);
      if (!info.scale_set && info.detected_scale) await s.setScale(sheet, { use_detected: true });
      res = await s.sweepInlineMotif(sheet, { seedRect: [[seed_x - 15, seed_y - 40], [seed_x + 15, seed_y + 40]] });
    } catch (e) {
      res = { matches: [] };
      out.misses.push({ kind: "seed-refused", sheet, seed: [seed_x, seed_y], reason: String(e.message || e) });
    }
    for (const row of rows) {
      const tx = Number(row.target_x), ty = Number(row.target_y);
      const found = res.matches.some((m) => Math.hypot(m.at[0] - tx, m.at[1] - ty) <= MATCH_TOL_PX);
      if (row.expect_status === "matched") {
        if (found) tp++;
        else { fn++; out.misses.push({ kind: "target-missed", sheet, target: [tx, ty], note: row.note }); }
      } else {
        // expect_status === "missed" — a real, disclosed limitation the key
        // itself names; scored as a correct refusal only if it STAYS missed
        if (!found) tnRefusalCorrect++;
        else { fp++; out.misses.push({ kind: "unexpected-match", sheet, target: [tx, ty], note: row.note }); }
      }
    }
  }
  const matchN = tp + fn;
  out.recall = matchN ? { tp, fn, recall: tp / matchN } : null;
  out.disclosed_misses = { correct: tnRefusalCorrect, unexpected: fp };
  out.cases = key.length;
  return out;
}

const wanted = spec.sets.filter((s) => !only.length || only.includes(s.id));
const results = [];
for (const set of wanted) {
  process.stderr.write(`· ${set.id} …\n`);
  try { results.push(await evalSet(set)); }
  catch (e) { results.push({ id: set.id, gc: set.gc, project: set.project, error: String(e.message || e) }); }
}

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";
const lines = [];
lines.push("╔══════════════════════════════════════════════════════════════════════════");
lines.push("║ SWEEP_INLINE_MOTIF — scored against real sets");
lines.push("╚══════════════════════════════════════════════════════════════════════════");
lines.push("");
lines.push("set                        cases   recall     disclosed-miss (correct/unexpected)");
lines.push("──────────────────────────────────────────────────────────────────────────");
let agg = { tp: 0, fn: 0, correct: 0, unexpected: 0, cases: 0 };
for (const r of results) {
  if (r.error) { lines.push(`${r.id.padEnd(24)}  ERROR: ${r.error}`); continue; }
  if (r.unlabelled) { lines.push(`${r.id.padEnd(24)}  (no key yet)`); continue; }
  const rc = r.recall ? pct(r.recall.recall) : "  —  ";
  lines.push(`${r.id.padEnd(24)} ${String(r.cases).padStart(6)}   ${rc}     ${r.disclosed_misses.correct}/${r.disclosed_misses.unexpected}`);
  if (r.recall) { agg.tp += r.recall.tp; agg.fn += r.recall.fn; }
  agg.correct += r.disclosed_misses.correct; agg.unexpected += r.disclosed_misses.unexpected;
  agg.cases += r.cases;
}
lines.push("──────────────────────────────────────────────────────────────────────────");
const aggN = agg.tp + agg.fn;
lines.push(`CORPUS                   ${String(agg.cases).padStart(6)}   ${aggN ? pct(agg.tp / aggN) : "  —  "}     ${agg.correct}/${agg.unexpected}`);
lines.push("");
lines.push(`recall  ${agg.tp} real target instances correctly found · ${agg.fn} missed`);
lines.push(`disclosed-miss  ${agg.correct} real, named limitation correctly STAYED a miss · ${agg.unexpected} unexpectedly resolved (the key's own "missed" case now matches — a real improvement, update the key)`);
for (const r of results) for (const m of r.misses || []) lines.push(`  [${r.id}] ${m.kind}: ${JSON.stringify(m)}`);

const report = lines.join("\n");
console.log(report);
if (writeReport) writeFileSync(join(process.cwd(), "inline-motif-eval-report.txt"), report + "\n");
