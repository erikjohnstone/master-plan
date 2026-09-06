// THE BOX THE APP ACTUALLY PAINTS, MEASURED.
//
// `opentakeoff/bakeoff/boxscore.py` reports 137/137 correct at Error-of-Boundary
// ≤ 4pt against the hand-authored boxes in `keys/*.tableboxes.csv`. That number
// is true and it is about the PYTHON engine, scored in Python, straight off
// `vectorgrid.find_tables`.
//
// What the estimator sees is `ScheduleTable.region`, and by the time a region
// becomes a highlight it has been through `scheduleTableFromODL`,
// `adoptVectorGridTables`, `dedupCrossSourceTables`,
// `collapseEquivalentPrimaryTables` and `snapAllTableCellBboxes` — and it may
// have come from ODL or the geometric extractor instead. Nobody had ever scored
// THAT, which is how a 100% engine and a schedule highlight that runs off into
// the notes block next door are both real at the same time.
//
// This script closes that gap. It runs the same three lines
// `scripts/production-graph-cli.mjs` runs — the same three the browser reaches
// through `POST /__ot/sheet-graph`, whose `g.tables` the Schedules panel paints
// verbatim — so the number printed here is literally the number the highlight
// is drawn from.
//
// WHOLE DOCUMENTS ONLY, deliberately. Scoring a qpdf-sliced single page would
// be minutes instead of hours, and it lies: SheetGraph's role classifier reads
// the whole set, `isScheduleTarget` (vectorTakeoffPipeline.ts) gates vectorgrid
// on that role, and a sliced page classifies differently. Measured on
// 009_FL#30 — five authored panel schedules, zero tables either way, but for
// two different reasons. A fast mode that changes the answer is a trap.
//
//   node --import tsx scripts/table-box-eval.mjs <corpus-dir> [setId ...]
//     --write-baseline freeze the current run to eval/tablebox-scoreboard.json
//     --check          fail if any table regressed against that baseline
//     --json <path>    also dump the full per-table result
//
// LOCAL GATE, NOT CI. The corpus lives outside this repo and is partly
// non-redistributable (see sets.json's provenance notes), so this belongs in
// STATE.md's gate list beside boxscore.py, not in a GitHub workflow.
//
// Dumb, stable ruler — the same standing rule as reference-eval.mjs and
// table-recall-eval.mjs: do NOT "improve" the scorer to make a run look better.
// Register a case, or fix the extractor.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import pLimit from "p-limit";
import { Session } from "../src/session.ts";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";
import { resolveSetFiles } from "./corpusFiles.mjs";
import { RENDER_SCALE } from "../../web/src/lib/sheets.ts";
import { eob, iou, assignByIou, CORRECT_EOB_PT } from "../../web/bench/boxScore.ts";

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const positional = argv.filter((a, i) =>
  !a.startsWith("--") && argv[i - 1] !== "--single-json" && argv[i - 1] !== "--json");

const [corpusDir, ...only] = positional;
const singleJsonSetId = opt("--single-json");
const writeBaseline = flag("--write-baseline");
const check = flag("--check");
const jsonOut = opt("--json");
const CONCURRENCY = Number(process.env.OPENTAKEOFF_EVAL_CONCURRENCY) || 2;

if (!corpusDir) {
  console.error("usage: node --import tsx scripts/table-box-eval.mjs <corpus-dir> [setId ...] [--write-baseline] [--check] [--json <path>]");
  process.exit(2);
}
const corpus = resolve(corpusDir);
const here = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolve(here, "..", "..", "eval", "tablebox-scoreboard.json");

// ── the authored key ────────────────────────────────────────────────────────
// keys/<set_id>.tableboxes.csv:  sheet,table_title,x0,top,x1,bot,provenance
// A row with an EMPTY x0 was authored as NOT LOCATED and is not scoreable;
// boxscore.py skips those and so do we, rather than counting them as misses.
// Boxes are PDF POINTS, top-left origin, MediaBox-normalised, /Rotate applied —
// the frame sidecar/vectorgrid_rpc.py calls "pdf-points-topleft".
function parseCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

function readAuthored(setId) {
  const p = join(corpus, "keys", `${setId}.tableboxes.csv`);
  if (!existsSync(p)) return [];
  const out = [];
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const r = parseCsvLine(line);
    if (r[0] === "sheet" || r.length < 6 || !r[2]) continue;
    const box = [Number(r[2]), Number(r[3]), Number(r[4]), Number(r[5])];
    if (box.some((v) => !Number.isFinite(v))) continue;
    out.push({ sheet: r[0], title: r[1], box, provenance: r[6] || "" });
  }
  return out;
}

function keyedSetIds() {
  const dir = join(corpus, "keys");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".tableboxes.csv"))
    .map((f) => f.slice(0, -".tableboxes.csv".length))
    .sort();
}

// ── resolving a keyed set to its PDF ────────────────────────────────────────
// Every tableboxes key names its sheets `<set_id>.pdf#<page>`, and 9 of the 31
// keyed set-ids are NOT registered in sets.json — they are single-sheet partial
// keys, not full document registrations. Resolving through resolveSetFiles
// alone therefore silently scores 22/31 of the ground truth. Mirror
// bakeoff.py's own find_pdf: sets.json first, then the two bulk trees by
// set-id. Registering the 9 in sets.json instead would change what every OTHER
// corpus gate iterates, which is not this script's business.
const spec = JSON.parse(readFileSync(join(corpus, "sets.json"), "utf8"));
function pdfFor(setId) {
  const set = spec.sets.find((s) => s.id === setId);
  if (set) {
    const files = resolveSetFiles(corpus, spec, set);
    if (files.length && existsSync(files[0])) return files;
  }
  for (const d of ["bulk/HVAC_BAS_Plan_Sets", "bulk/HVAC_BAS_Plan_Sets_Vol2", "raw", "."]) {
    const p = join(corpus, d, `${setId}.pdf`);
    if (existsSync(p)) return [p];
  }
  return null;
}

const shaOf = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

async function graphFor(files) {
  const s = new Session();
  for (let i = 0; i < files.length; i++) await s.loadPlan(files[i], { merge: i > 0 });
  return cachedSheetGraph(files[0], {
    expectedSha256: shaOf(files[0]),
    identity: files.slice(1).map(shaOf),
    compute: () => s.graphForPipeline(),
  });
}

// ── the table's own numbers ─────────────────────────────────────────────────
const norm = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();

/** `t.title?.text || t.title` is wrong: a title CELL can exist with empty text,
 *  and then that expression hands back the Evidence object where a string was
 *  expected. Same trap scheduleBrowse.tableTitleText documents. */
function titleText(t) {
  const v = t?.title;
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof v.text === "string") return v.text;
  return "";
}

function titlesOf(t) {
  const out = [titleText(t)];
  for (const p of t?.parts || []) {
    if (typeof p?.title === "string") out.push(p.title);
    else if (p?.title?.text) out.push(p.title.text);
  }
  return out.map(norm).filter(Boolean);
}

const isBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => Number.isFinite(v));
const toPt = (b) => [b[0] / RENDER_SCALE, b[1] / RENDER_SCALE, b[2] / RENDER_SCALE, b[3] / RENDER_SCALE];

/** Which stage produced this table. The ledger keys on (sheet, title, region);
 *  a continued table overrides everything, because continuation happens inside
 *  buildSheetGraph and is not a pipeline stage at all. */
function stageIndex(graph) {
  const byExact = new Map(), bySheetTitle = new Map();
  for (const e of graph?.vector_pipeline?.stage_tables || []) {
    if (!isBox(e.region)) continue;
    byExact.set(`${e.sheet}|${norm(e.title)}|${e.region.map((v) => Math.round(v)).join(",")}`, e.stage);
    const k = `${e.sheet}|${norm(e.title)}`;
    if (!bySheetTitle.has(k)) bySheetTitle.set(k, e.stage);
  }
  return (t) => {
    if ((t.parts || []).length > 1) return "continuation";
    if (!isBox(t.region)) return "unattributed";
    const exact = byExact.get(`${t.sheet}|${norm(titleText(t))}|${t.region.map((v) => Math.round(v)).join(",")}`);
    if (exact) return exact;
    return bySheetTitle.get(`${t.sheet}|${norm(titleText(t))}`) || "unattributed";
  };
}

// ── scoring one set ─────────────────────────────────────────────────────────
async function evalSet(setId) {
  const authored = readAuthored(setId);
  if (!authored.length) return { id: setId, skipped: "no authored boxes" };
  const files = pdfFor(setId);
  if (!files) return { id: setId, error: `no PDF found for ${setId}` };

  const bySheet = new Map();
  for (const a of authored) {
    if (!bySheet.has(a.sheet)) bySheet.set(a.sheet, []);
    bySheet.get(a.sheet).push(a);
  }

  const rows = [], frameFlags = [];
  const graph = await graphFor(files);
  const stageOf = stageIndex(graph);
  const roleOf = new Map((graph.sheets || []).map((s) => [s.key, s.role]));
  // vectorgrid — the engine that scores 137/137 in Python — is gated per sheet
  // by isScheduleTarget (vectorTakeoffPipeline.ts): a sheet whose role is not
  // schedule/legend/unknown is never even offered to it. So a MISSING box has
  // two very different causes, and reporting them as one number would send
  // someone to tune a box heuristic for a table nothing ever looked for.
  const SCHEDULE_TARGET_ROLES = new Set(["schedule", "legend", "unknown"]);

  for (const [sheetKey, wanted] of bySheet) {
    const emitted = (graph.tables || []).filter((t) => isBox(t.region) && t.sheet === sheetKey);
    const role = roleOf.get(sheetKey) ?? (roleOf.has(sheetKey) ? "?" : "no-such-sheet");
    const offered = SCHEDULE_TARGET_ROLES.has(role);

    // FRAME ASSERTION 1 — every authored box must lie on the page it names. A
    // constant translation (page_origin's own warning) puts it outside, and a
    // silent translation is invisible inside the process that makes it.
    const emittedUnion = emitted.length
      ? emitted.reduce((acc, t) => [
        Math.min(acc[0], t.region[0]), Math.min(acc[1], t.region[1]),
        Math.max(acc[2], t.region[2]), Math.max(acc[3], t.region[3]),
      ], [Infinity, Infinity, -Infinity, -Infinity])
      : null;
    if (emittedUnion && Number.isFinite(emittedUnion[0])) {
      const u = toPt(emittedUnion);
      for (const a of wanted) {
        const far = Math.min(Math.abs(a.box[0] - u[0]), Math.abs(a.box[2] - u[2]));
        if (far > 4000) frameFlags.push(`${sheetKey} "${a.title}" is ${far.toFixed(0)}pt from anything emitted — check the page frame`);
      }
    }

    const emittedPt = emitted.map((t) => toPt(t.region));
    const authoredBoxes = wanted.map((a) => a.box);

    // MATCH A — by the table's own extracted title. Not circular w.r.t.
    // geometry: the authored titles were read off renders, independent of any
    // box. MATCH B — optimal assignment on IoU. Where they disagree is the most
    // informative output this script has, so both run and both are reported.
    const titleMatch = new Map();          // authored index -> emitted index
    const takenByTitle = new Set();
    wanted.forEach((a, ai) => {
      const want = norm(a.title);
      if (!want) return;
      const ei = emitted.findIndex((t, i) => !takenByTitle.has(i) && titlesOf(t).includes(want));
      if (ei >= 0) { titleMatch.set(ai, ei); takenByTitle.add(ei); }
    });
    const geomPairs = assignByIou(emittedPt, authoredBoxes, 0.30);
    const geomMatch = new Map(geomPairs.map((p) => [p.b, p.a]));

    wanted.forEach((a, ai) => {
      const byTitle = titleMatch.has(ai) ? titleMatch.get(ai) : -1;
      const byGeom = geomMatch.has(ai) ? geomMatch.get(ai) : -1;
      let bucket, ei;
      if (byTitle >= 0 && byGeom >= 0 && byTitle === byGeom) { bucket = "both"; ei = byTitle; }
      else if (byTitle >= 0 && byGeom >= 0) { bucket = "disagree"; ei = byTitle; }
      else if (byTitle >= 0) { bucket = "title_only"; ei = byTitle; }
      else if (byGeom >= 0) { bucket = "geom_only"; ei = byGeom; }
      else { bucket = "missing"; ei = -1; }

      const got = ei >= 0 ? emittedPt[ei] : null;
      rows.push({
        set: setId,
        sheet: a.sheet,
        title: a.title,
        bucket,
        role,
        cause: bucket !== "missing" ? null
          : role === "no-such-sheet" ? "the graph has no such sheet"
            : !offered ? `sheet role "${role}" — never offered to the table engine (isScheduleTarget)`
              : emitted.length ? "the sheet was read, this table was not found"
                : "the sheet was offered to the engine and produced no tables",
        stage: ei >= 0 ? stageOf(emitted[ei]) : null,
        eob_pt: got ? eob(got, a.box) : null,
        iou: got ? iou(got, a.box) : 0,
        correct: got ? eob(got, a.box) <= CORRECT_EOB_PT : false,
        got: got ? got.map((v) => Math.round(v * 10) / 10) : null,
        want: a.box,
      });
    });

    // spurious: emitted tables no authored box claimed. NEVER failed on —
    // several keys say in their own header that they cover one sheet only.
    const claimed = new Set([...titleMatch.values(), ...geomPairs.map((p) => p.a)]);
    for (let i = 0; i < emitted.length; i++) {
      if (claimed.has(i)) continue;
      rows.push({
        set: setId, sheet: sheetKey, title: titleText(emitted[i]) || "(untitled)",
        bucket: "spurious", role, cause: null, stage: stageOf(emitted[i]), eob_pt: null, iou: 0,
        correct: false, got: emittedPt[i].map((v) => Math.round(v * 10) / 10), want: null,
      });
    }
  }

  return { id: setId, rows, frameFlags };
}

// ── child-process fan-out (real CPU-bound work needs real parallelism) ──────
if (singleJsonSetId) {
  let result;
  try { result = await evalSet(singleJsonSetId); }
  catch (e) { result = { id: singleJsonSetId, error: String(e?.stack || e?.message || e) }; }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}

const wanted = keyedSetIds().filter((id) => !only.length || only.includes(id));
const thisScript = fileURLToPath(import.meta.url);
const limit = pLimit(CONCURRENCY);

function evalInChild(setId) {
  return new Promise((res) => {
    process.stderr.write(`· ${setId} …\n`);
    const args = ["--import", "tsx", thisScript, corpus, "--single-json", setId];
    const child = spawn(process.execPath, args, { stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("close", (code) => {
      if (code !== 0 || !out.trim()) { res({ id: setId, error: `child exited ${code} with no result` }); return; }
      try { res(JSON.parse(out)); }
      catch (e) { res({ id: setId, error: `bad child JSON: ${String(e?.message || e)}` }); }
    });
    child.on("error", (e) => res({ id: setId, error: String(e?.message || e) }));
  });
}

const results = await Promise.all(wanted.map((id) => limit(() => evalInChild(id))));
const allRows = results.flatMap((r) => r.rows || []);
const scoreable = allRows.filter((r) => r.bucket !== "spurious");

console.log("\n╔══════════════════════════════════════════════════════════════════════════");
console.log("║ TABLE BOXES, AS THE APP EMITS THEM");
console.log("║ EoB in POINTS against opentakeoff-corpus/keys/*.tableboxes.csv");
console.log("╚══════════════════════════════════════════════════════════════════════════\n");

for (const r of results) {
  if (r.error) { console.log(`${r.id.padEnd(52)} ERROR: ${r.error.split("\n")[0]}`); continue; }
  if (r.skipped) continue;
  for (const f of r.frameFlags || []) console.log(`  FRAME  ${f}`);
}

const stages = new Map();
for (const r of scoreable) {
  const k = r.stage || "unmatched";
  if (!stages.has(k)) stages.set(k, []);
  stages.get(k).push(r);
}
console.log("stage               n   correct@4pt   mean EoB    p95 EoB   mean IoU");
console.log("──────────────────────────────────────────────────────────────────────");
const fmt = (v) => (v == null ? "     —" : v.toFixed(1).padStart(6));
for (const [stage, rs] of [...stages].sort((a, b) => b[1].length - a[1].length)) {
  const withBox = rs.filter((r) => r.eob_pt != null).map((r) => r.eob_pt).sort((a, b) => a - b);
  const mean = withBox.length ? withBox.reduce((a, b) => a + b, 0) / withBox.length : null;
  const p95 = withBox.length ? withBox[Math.min(withBox.length - 1, Math.floor(withBox.length * 0.95))] : null;
  const miou = rs.reduce((a, b) => a + b.iou, 0) / rs.length;
  console.log(`${stage.padEnd(18)}${String(rs.length).padStart(3)}   ${String(rs.filter((r) => r.correct).length).padStart(4)}/${String(rs.length).padEnd(6)} ${fmt(mean)}pt   ${fmt(p95)}pt      ${miou.toFixed(3)}`);
}

const buckets = {};
for (const r of allRows) buckets[r.bucket] = (buckets[r.bucket] || 0) + 1;
console.log(`\nbuckets: ${Object.entries(buckets).map(([k, v]) => `${k} ${v}`).join(" · ")}`);

// WHY a box is missing matters more than how many are. A box the engine never
// looked for and a box the engine looked at and got wrong are different bugs in
// different files, and one number for both sends you to the wrong one.
const causes = {};
for (const r of scoreable) if (r.cause) causes[r.cause] = (causes[r.cause] || 0) + 1;
if (Object.keys(causes).length) {
  console.log("\nwhy the missing ones are missing:");
  for (const [c, n] of Object.entries(causes).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
}
const correct = scoreable.filter((r) => r.correct).length;
console.log(`CORRECT (EoB <= ${CORRECT_EOB_PT}pt)   ${correct}/${scoreable.length}  (${(100 * correct / Math.max(1, scoreable.length)).toFixed(1)}%)`);

const worst = scoreable.filter((r) => !r.correct).sort((a, b) => (b.eob_pt ?? 1e9) - (a.eob_pt ?? 1e9));
if (worst.length) {
  console.log("\nworst boxes (this is the list to fix):");
  for (const r of worst.slice(0, 40)) {
    const e = r.eob_pt == null ? "MISSING" : `${r.eob_pt.toFixed(1)}pt`;
    console.log(`  ${e.padStart(9)}  IoU ${r.iou.toFixed(3)}  ${(r.stage || "—").padEnd(14)} ${r.set.slice(0, 26).padEnd(26)} ${r.sheet.split("#")[1] ? `p${r.sheet.split("#")[1]}` : "p1"}  ${r.title.slice(0, 40)}`);
    if (r.got && r.want) console.log(`             got ${JSON.stringify(r.got)}  want ${JSON.stringify(r.want)}`);
  }
  if (worst.length > 40) console.log(`  … and ${worst.length - 40} more`);
}

// ── baseline ────────────────────────────────────────────────────────────────
const keyOf = (r) => `${r.sheet}::${r.title}`;
const snapshot = {
  generated_at: new Date().toISOString(),
  render_scale: RENDER_SCALE,
  totals: { correct, scoreable: scoreable.length },
  per_table: Object.fromEntries(scoreable.map((r) => [keyOf(r), {
    stage: r.stage, bucket: r.bucket, role: r.role,
    eob_pt: r.eob_pt == null ? null : Math.round(r.eob_pt * 100) / 100,
    iou: Math.round(r.iou * 1000) / 1000,
  }])),
};
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ ...snapshot, rows: allRows }, null, 1)); console.log(`\nwrote ${jsonOut}`); }
if (writeBaseline) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, `${JSON.stringify(snapshot, null, 1)}\n`);
  console.log(`\nfroze baseline → ${BASELINE}`);
}

if (check) {
  if (!existsSync(BASELINE)) { console.error(`\n--check: no baseline at ${BASELINE}; run with --write-baseline first`); process.exit(2); }
  const base = JSON.parse(readFileSync(BASELINE, "utf8"));
  // A per-table gate, not an aggregate one. An aggregate hides a SWAP — one
  // table improving while another breaks — and a schedule box eating the block
  // next door is a single-table event.
  const regressions = [];
  for (const r of scoreable) {
    const b = base.per_table[keyOf(r)];
    if (!b) continue;                                     // new authored box, nothing to compare
    if (b.eob_pt != null && r.eob_pt == null) regressions.push(`${keyOf(r)} — was ${b.eob_pt}pt, now unmatched (${r.bucket})`);
    else if (b.eob_pt != null && r.eob_pt > b.eob_pt + 0.5) regressions.push(`${keyOf(r)} — EoB ${b.eob_pt}pt → ${r.eob_pt.toFixed(1)}pt`);
    else if (b.bucket === "both" && r.bucket !== "both") regressions.push(`${keyOf(r)} — bucket ${b.bucket} → ${r.bucket}`);
  }
  if (correct < base.totals.correct) regressions.push(`total correct@4pt ${base.totals.correct} → ${correct}`);
  if (regressions.length) {
    console.error(`\n--check FAILED, ${regressions.length} regression${regressions.length === 1 ? "" : "s"}:`);
    for (const m of regressions) console.error(`  ${m}`);
    process.exit(1);
  }
  console.log(`\n--check OK against ${basename(BASELINE)} (${Object.keys(base.per_table).length} pinned tables)`);
}
