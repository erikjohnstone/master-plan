// Scored evaluation for the linear trace engine (#linear-takeoff WP3, GATE 3)
// against the REAL, hand-traced goldens in opentakeoff-corpus/ground_truth/
// linear/*.json (WP1.7 + WP3.8's "ground truth v2" pass). Method, current
// results and known gaps: docs/LINEAR-TRACE-EVAL.md. Mirrors
// mep-trace-eval.mjs's own conventions: the corpus/goldens live OUTSIDE this
// repo, the key was authored by hand-tracing rendered PDFs BEFORE this
// engine ever touched them (never by trusting trace_run's own output as its
// own ground truth), and this script is deliberately a dumb, stable ruler —
// do not "improve" the scorer to make a run look better; register a new
// golden instead, same discipline as every other eval in this project.
//
//   node --import tsx scripts/linear-trace-eval.mjs <ground-truth-dir>
//
// What this DOES score, against each golden run:
//   - reach          seeded from a point ON the golden run (not an endpoint),
//                     does trace_run walk a real run at all (vs. refuse)?
//   - length error    |traced length_lf - golden total_lf| / golden total_lf
//   - over-trace      the SAME delta, but only counted when the trace ran
//                     LONGER than the golden (the walker continuing past
//                     where the human annotator stopped) — a distinct
//                     failure mode from simply under/over by noise
//   - size accuracy   the traced `size` at the seed vs. the golden's own
//                     size_overrides for the segment the seed sits on,
//                     length-weighted by that golden run's own total_lf
//   - build ms / query ms  wall-clock around the FIRST trace_run call per
//                     sheet (index build + first query, worker-equivalent)
//                     vs. every SUBSEQUENT call on an already-indexed sheet
//                     (warm query only) — the plan's own build/click split
//
// What this DELIBERATELY does NOT score, and why:
//   - precision / false-positive rate — these goldens are curated positive
//     examples (real runs a human traced), not an exhaustive labeling of
//     every pixel on each sheet. A "precision" number computed against them
//     would only ever measure recall a second time under a different name.
//     A real precision figure needs explicit REFUSAL/negative cases (empty
//     space, schedule text, a hatch pattern) the way mep-trace-eval.mjs's
//     .mep.csv key carries expect_status:refused rows — none exist yet for
//     linear. Flagged in the report footer, not silently assumed to be 100%.
//   - held-out tier — every golden checked in today is tier:"development".
//     No held-out sheet exists yet, so "within 5 points of development" is
//     not assessable; the report says so rather than comparing dev to dev.
//   - click-to-proposal < 16ms as a GATE — this script reports the warm
//     query ms it measures, but a few Node-process trace_run calls are not
//     the same measurement as the browser worker's own steady-state timing
//     claim; treat the number here as a sanity check, not the gate's own
//     evidence.
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const gtDirArg = process.argv[2];
const gtDir = resolve(gtDirArg || join(repoRoot, "opentakeoff-corpus/ground_truth/linear"));

const files = readdirSync(gtDir).filter((f) => f.endsWith(".json")).sort();
if (!files.length) {
  console.error(`No ground-truth files in ${gtDir}`);
  process.exit(1);
}

const pct = (n) => (n * 100).toFixed(1).padStart(5) + "%";
const sizeKey = (sz) => {
  if (!sz) return null;
  if (sz.kind === "rect") return `rect:${sz.w_in}x${sz.h_in}`;
  if (sz.kind === "round") return `round:${sz.d_in}`;
  if (sz.kind === "oval") return `oval:${sz.major_in}x${sz.minor_in}`;
  if (sz.kind === "pipe") return `pipe:${sz.nps_in}`;
  return JSON.stringify(sz);
};

/** Pick a seed point ON the golden's longest segment (40% along it, away
 *  from both endpoints/junctions), in page px (verts_norm * viewport dims —
 *  the exact same convention every WP3.8 golden's own verts_norm uses). */
function seedFor(run, widthPx, heightPx) {
  const verts = run.verts_norm.map(([x, y]) => [x * widthPx, y * heightPx]);
  let bestI = 0, bestLen = -1;
  for (let i = 0; i < verts.length - 1; i++) {
    const [x0, y0] = verts[i], [x1, y1] = verts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len > bestLen) { bestLen = len; bestI = i; }
  }
  const [x0, y0] = verts[bestI], [x1, y1] = verts[bestI + 1];
  return { seed: [x0 + (x1 - x0) * 0.4, y0 + (y1 - y0) * 0.4], segIndex: bestI };
}

const sheetsSeen = new Set();
const rows = [];

for (const file of files) {
  const golden = JSON.parse(readFileSync(join(gtDir, file), "utf8"));
  const pdfPath = resolve(repoRoot, golden.source_pdf);
  let s;
  try {
    s = new Session();
    await s.loadPlan(pdfPath);
    s.setScale(golden.sheet_id, { use_detected: true });
  } catch (e) {
    for (const run of golden.runs) {
      rows.push({ file, run_id: run.run_id, status: "load-error", note: String(e.message || e) });
    }
    continue;
  }

  const sheetState = s.sheet(golden.sheet_id);
  for (const run of golden.runs) {
    const { seed, segIndex } = seedFor(run, sheetState.widthPx, sheetState.heightPx);
    const coldSheet = !sheetsSeen.has(golden.sheet_id);
    sheetsSeen.add(golden.sheet_id);
    const t0 = performance.now();
    let r, error;
    try {
      r = await s.traceRun(golden.sheet_id, seed, {});
    } catch (e) {
      error = String(e.message || e);
    }
    const ms = performance.now() - t0;

    if (!r) {
      rows.push({ file, run_id: run.run_id, status: "refused", error, ms, cold: coldSheet });
      continue;
    }

    const goldenLf = run.computed.perimeter_lf;
    const tracedLf = r.length_lf ?? null;
    const lenErrPct = tracedLf != null && goldenLf > 0 ? Math.abs(tracedLf - goldenLf) / goldenLf : null;
    const overTracePct = tracedLf != null && goldenLf > 0 && tracedLf > goldenLf ? (tracedLf - goldenLf) / goldenLf : 0;

    const goldenSize = run.run?.size_overrides?.[String(segIndex)] ?? null;
    const goldenSizeKey = sizeKey(goldenSize);
    const tracedSizeKey = sizeKey(r.size);
    const sizeMatch = goldenSizeKey != null ? goldenSizeKey === tracedSizeKey : null;

    rows.push({
      file, run_id: run.run_id, status: "reached", ms, cold: coldSheet,
      goldenLf, tracedLf, lenErrPct, overTracePct,
      goldenSizeKey, tracedSizeKey, sizeMatch,
      factors: r.factors,
    });
  }
}

console.log("╔══════════════════════════════════════════════════════════════════════════");
console.log("║ LINEAR TRACE ENGINE — scored against real hand-traced goldens (GATE 3)");
console.log("╚══════════════════════════════════════════════════════════════════════════");
console.log("");
console.log("run                                    status     LF gold→traced   len err   size");
console.log("──────────────────────────────────────────────────────────────────────────────────");
for (const row of rows) {
  const name = row.run_id.padEnd(38);
  if (row.status !== "reached") {
    console.log(`${name} ${row.status.padEnd(10)} ${row.error ? row.error.slice(0, 50) : ""}`);
    continue;
  }
  const lf = `${row.goldenLf.toFixed(2)}→${row.tracedLf != null ? row.tracedLf.toFixed(2) : "—"}`.padEnd(16);
  const err = row.lenErrPct != null ? pct(row.lenErrPct) : "    —";
  const sz = row.sizeMatch == null ? "(n/a)" : row.sizeMatch ? "OK" : `${row.goldenSizeKey} != ${row.tracedSizeKey}`;
  console.log(`${name} ${"reached".padEnd(10)} ${lf} ${err}   ${sz}`);
}
console.log("──────────────────────────────────────────────────────────────────────────────────");

const reached = rows.filter((r) => r.status === "reached");
const recall = rows.length ? reached.length / rows.length : 0;
const lenErrs = reached.map((r) => r.lenErrPct).filter((x) => x != null);
const maxLenErr = lenErrs.length ? Math.max(...lenErrs) : null;
const meanLenErr = lenErrs.length ? lenErrs.reduce((a, b) => a + b, 0) / lenErrs.length : null;
const overTraceCases = reached.filter((r) => r.overTracePct > 0);
const maxOverTrace = overTraceCases.length ? Math.max(...overTraceCases.map((r) => r.overTracePct)) : 0;

const sizedRuns = reached.filter((r) => r.sizeMatch != null);
const sizeWeightedOk = sizedRuns.reduce((a, r) => a + (r.sizeMatch ? r.goldenLf : 0), 0);
const sizeWeightedTotal = sizedRuns.reduce((a, r) => a + r.goldenLf, 0);
const sizeAccuracy = sizeWeightedTotal > 0 ? sizeWeightedOk / sizeWeightedTotal : null;

const coldMs = reached.filter((r) => r.cold).map((r) => r.ms);
const warmMs = reached.filter((r) => !r.cold).map((r) => r.ms);

console.log("");
console.log(`run recall        ${reached.length}/${rows.length} reached (${pct(recall)}) — GATE 3 target ≥ 85%`);
console.log(`length error      max ${maxLenErr != null ? pct(maxLenErr) : "—"}, mean ${meanLenErr != null ? pct(meanLenErr) : "—"} — GATE 3 target ≤ 3%`);
console.log(`over-trace        ${overTraceCases.length} case(s) over golden length, worst ${pct(maxOverTrace)} — GATE 3 target ≤ 3%`);
console.log(`size accuracy     ${sizeAccuracy != null ? pct(sizeAccuracy) : "—"} length-weighted (${sizedRuns.length} run(s) with a golden size) — GATE 3 target ≥ 90%`);
console.log(`build+first-query ${coldMs.length ? coldMs.map((n) => n.toFixed(0) + "ms").join(", ") : "—"} (per distinct sheet, cold)`);
console.log(`warm query        ${warmMs.length ? warmMs.map((n) => n.toFixed(0) + "ms").join(", ") : "—"} (subsequent trace_run calls on an already-indexed sheet)`);
console.log("");
console.log("NOT scored (see this script's own header for why): precision/false-positive");
console.log("rate (no negative/refusal goldens exist yet), held-out tier delta (every");
console.log("golden checked in today is tier:\"development\"), and the browser's own");
console.log("steady-state click-to-proposal claim (this measures Node process calls, a");
console.log("sanity check on warm-query cost, not the gate's own evidence).");

const anyRefused = rows.some((r) => r.status !== "reached");
process.exit(anyRefused ? 1 : 0);
