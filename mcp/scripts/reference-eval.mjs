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
import { Session } from "../src/session.ts";
import { buildPlanSetTakeoff } from "../src/takeoff.ts";

const [corpusDir, ...only] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!corpusDir) {
  console.error("usage: node --import tsx scripts/reference-eval.mjs <corpus-dir> [setId ...]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));

function splitCsv(l) {
  const cells = [];
  let cur = "", q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') {
      if (q && l[i + 1] === '"') { cur += '"'; i++; continue; }
      q = !q; continue;
    }
    if (ch === "," && !q) { cells.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cells.push(cur);
  return cells;
}

function parseReferenceKeyCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !/^\s*#/.test(l));
  if (lines.length < 2) return [];
  const head = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name) => head.indexOf(name);
  const iSheet = idx("sheet"), iTitle = idx("table_title"), iKey = idx("row_key"), iCol = idx("column"), iVal = idx("expected_value");
  return lines.slice(1).map((l) => {
    const c = splitCsv(l);
    return {
      sheet: (c[iSheet] ?? "").trim(),
      table_title: (c[iTitle] ?? "").trim(),
      row_key: (c[iKey] ?? "").trim(),
      column: (c[iCol] ?? "").trim(),
      expected_value: (c[iVal] ?? "").trim(),
    };
  });
}

const norm = (s) => (s || "").trim().toUpperCase().replace(/\s+/g, " ");

function scoreReference(referenceTables, key) {
  // index the pipeline's own output the same way an estimator would look it
  // up: (sheet, table title, row key) -> cells
  const byRow = new Map();
  for (const t of referenceTables) {
    for (const r of t.rows) {
      byRow.set(`${t.sheet}::${norm(t.table_title ?? t.title)}::${norm(r.key)}`, r.cells);
    }
  }
  const perCell = key.map((k) => {
    const rowKey = `${k.sheet}::${norm(k.table_title)}::${norm(k.row_key)}`;
    const cells = byRow.get(rowKey);
    const actual = cells ? (cells[k.column] ?? null) : null;
    const exact = actual != null && norm(actual) === norm(k.expected_value);
    return { ...k, actual, exact };
  });
  const exactCount = perCell.filter((c) => c.exact).length;
  return { perCell, exactCount, total: perCell.length, exactPct: perCell.length ? exactCount / perCell.length : 1 };
}

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";

async function evalSet(set) {
  const keyPath = join(corpus, "keys", `${set.id}.reference.csv`);
  if (!existsSync(keyPath)) return { id: set.id, unlabelled: true };
  const key = parseReferenceKeyCsv(readFileSync(keyPath, "utf8"));

  const s = new Session();
  const files = set.files.map((f) => join(set.root ?? spec.root, f));
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
  const takeoff = await buildPlanSetTakeoff(s, { categories: null });

  return { id: set.id, score: scoreReference(takeoff.reference_tables, key) };
}

const wanted = spec.sets.filter((s) => !only.length || only.includes(s.id));
const results = [];
for (const set of wanted) {
  process.stderr.write(`· ${set.id} …\n`);
  try { results.push(await evalSet(set)); }
  catch (e) { results.push({ id: set.id, error: String(e.message || e) }); }
}

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
