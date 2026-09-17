// Linear-takeoff benchmark runner (#linear-takeoff WP1.6 + WP3+ GATE 3):
//   npm run bench:linear          (from web/)
// TWO scored halves, kept structurally separate:
//   1. MANUAL mode (WP1.6's own original scope) — parity, totals,
//      determinism, over the synthetic corpus (bench/linear/corpus/*.json
//      + the PDFs bench/linear/synthetic/synthesize.mts generated them
//      from). A human/agent supplies the points outright here, so there
//      is nothing to "find" — see score.ts's own header on why the full
//      recall/precision/Fréchet/vertex-F1 suite didn't apply to THIS half.
//   2. TRACE engine (added post-WP3.8, GATE 3's own scope) — `trace_run`
//      seeded on the SAME synthetic corpus AND on the real hand-traced
//      goldens (opentakeoff-corpus/ground_truth/linear/*.json, WP1.7 +
//      WP3.8's "ground truth v2"), scored by the goal document's own
//      literal method ("discrete Frechet < 2 pt, length overlap >= 80%"
//      for recall; length-weighted correct/walked ratio for precision —
//      see score.ts's own header on both). This is the scorer
//      docs/LINEAR-TRACE-EVAL.md's own Findings 1-4 were measured
//      against; that doc keeps the narrative history, this file is the
//      live ruler.
//
// Same shape as bench/run.mts: writes bench/linear/results.json (null, 1
// indent, diffable) and CI diff-gates it exactly like results.json (#198
// pattern, .github/workflows/ci.yml) — an engine change that moves a linear
// number must ship its own results.json delta in the same PR.
import { createRequire } from "module";
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { Session } from "../../mcp/src/session.ts";
import { resolveRunSegments, type ComputedRun } from "../src/lib/linear/run.ts";
import type { AuthoredRun, RunSize } from "../src/lib/linear/types.ts";
import { extractVectorGeometry, type Point } from "../src/lib/oneclick.ts";
import {
  scoreLinearParity, scoreLinearTotals, scoreLinearDeterminism, aggregateLinear,
  scoreTraceShapeMatch, scoreTraceRecall, scoreTracePrecision, aggregateTrace,
  scoreRefusalCorrectness,
  type LinearTotalsRow, type LinearDeterminismRow, type TraceRunRow, type TraceAggregate,
  type RefusalRow,
} from "./score.ts";

// THE MARGIN IS MEASURED, not chosen for comfort (bench/run.mts's own rule).
//
// totals: measure_line's length_lf sums RAW segment lengths in px space then
// rounds once (openLen(pts) * upp, round2'd); this bench's truth sums the
// SAME raw lengths computed directly in feet, also round2'd once. The two
// are the same value under real-number math (hypot is homogeneous — scaling
// both legs by a constant scales the result by that constant), but
// Math.hypot's internal rescaling algorithm is not bit-exact under that
// substitution, so the two sums can differ by a handful of floating-point
// ULPs — enough, right at a rounding-boundary case, to round to an adjacent
// cent. Measured max across regenerations of this ten-case corpus: 0.02 ft
// (one case landed exactly on such a boundary). Gate at 0.03 — one more
// cent above the measured max, not merely equal to it, so a harmless
// float-representation nudge at the boundary (0.02 stored as
// 0.020000000000003) never trips a threshold that reads "0.02".
//
// determinism: rotate90/translate/reverse are EXACT (0.000 ft on every case,
// every time) — a rotated/translated/reversed segment has the identical
// hypot length, so its rounded lf is identical too; there is no rounding
// path for these three to disagree at all, and a nonzero reading from them
// means a real bug, not noise. scale2x is the one transform that changes
// segment lengths, and resolveRunSegments rounds EACH segment to 2dp before
// totaling — rounding is not linear, so "2× the rounded baseline total" and
// "rounded total of the doubled segments" can differ by up to ~0.005 ft per
// segment in the worst case (a segment sitting right at a rounding
// boundary). Measured max on this corpus: 0.02 ft, on the 9-segment
// flattened-arc case (the corpus's most segments, so the most
// boundary-rounding chances) — consistent with that bound. Gate at 1.5×.
const THRESHOLDS = {
  maxTotalsErrFt: 0.03,
  maxDeterminismErrFt: 0.03,
  maxParityFailures: 0,
};

// ── #linear-takeoff WP3+ — trace-engine thresholds (GATE 3, plan §2's
// "run recall / precision (discrete Frechet < 2 pt, length overlap >=
// 80%)"). GATE 3's own real targets are recall>=0.85, precision>=0.95,
// length error<=3%, over-trace<=3%, size accuracy>=0.90 — NOT met yet
// (docs/LINEAR-TRACE-EVAL.md's own Findings 1/2/4). Per this file's own
// "MEASURED, not chosen for comfort" rule, TRACE_THRESHOLDS below is the
// CURRENT ratchet point — today's actual measured floor on the REAL
// ground truth (recall 1/7 = 0.143, precision 0.612, checked directly
// against a real run before writing these numbers), NOT GATE 3's own
// targets. Ratchet these UP as WP3+'s own fixes land, never down. The
// dominant miss (5 of 7 real cases refuse outright) is Finding 1's
// wall-vouch exclusion, off this project's own "never touch
// wallnetwork.ts/mepconnectivity.ts" list — 0.85 is not reachable by
// anything this bench is allowed to fix on its own. The SYNTHETIC
// corpus's own trace numbers (reported, NOT gated) are confounded the
// same way for a different reason (Finding 5: its random-walk path
// generator often produces near-closed rectangular loops that trip the
// SAME wall-vouch heuristic, masking whatever property — pen weight,
// dash, label placement — each case actually meant to isolate); fixing
// the generator to dodge that is real, separate follow-up work, not done
// here, so gating on it today would just be gating on Finding 1 again
// under a different name.
const TRACE_FRECHET_TOL_PX = 2;      // plan's own literal "discrete Frechet < 2 pt"
const TRACE_OVERLAP_MIN = 0.8;       // plan's own literal "length overlap >= 80%"
const TRACE_THRESHOLDS = {
  minRecall: 0.1,           // measured 2/8 = 0.25 on the development tier (weld-county-m1-0.json added the 2nd hit)
  minPrecision: 0.5,        // measured 0.743 on the development tier
  maxLenErrPct: 1.0,        // Finding 4 (a branchy trunk's own over-trace) reads as ~85% error under this scorer; not yet a per-case cap worth tightening
  maxOverTracePct: 1.0,
  // Unlike the ratchet-point thresholds above, this one IS GATE 3's own
  // target, not today's measured floor: refusals.json is a small, hand-
  // curated set of UNAMBIGUOUSLY non-linework seeds (title block text,
  // a room label, blank margin) -- there is no judgment call for trace_run
  // to get "partially" right here, so anything short of 100% is a real
  // false-confident trace, not a hard case. Confirmed 4/4 = 1.0 measured
  // on first run (see docs/LINEAR-TRACE-EVAL.md).
  minRefusalRate: 1.0,
};

interface CaseTruth {
  name: string;
  hardCase: string;
  pdf: string;
  page: number;
  scale: number;
  ptPerFt: number;
  run: { points_ft: [number, number][]; system: string; size: RunSize };
  expected: { segment_lf: number[]; total_lf: number };
}

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, "linear", "corpus");
const caseFiles = readdirSync(corpusDir).filter((f) => f.endsWith(".json")).sort();
if (!caseFiles.length) {
  console.error(`No cases in ${corpusDir} — run 'node --import tsx bench/linear/synthesize.mts' first.`);
  process.exit(1);
}

const req = createRequire(import.meta.url);
const pdfjs = await import(req.resolve("pdfjs-dist/legacy/build/pdf.mjs"));

const parity: Array<{ caseName: string; ok: boolean; mismatch?: string }> = [];
const totals: LinearTotalsRow[] = [];
const determinism: LinearDeterminismRow[] = [];
const extractionSanity: Array<{ caseName: string; segs: number }> = [];

/** Rotate (px,py) 90° CCW about (cx,cy) — lossless, so LF must not move. */
function rotate90(pts: [number, number][], cx: number, cy: number): [number, number][] {
  return pts.map(([x, y]) => [cx - (y - cy), cy + (x - cx)]);
}
function translate(pts: [number, number][], dx: number, dy: number): [number, number][] {
  return pts.map(([x, y]) => [x + dx, y + dy]);
}
function scalePts(pts: [number, number][], k: number, cx: number, cy: number): [number, number][] {
  return pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]);
}
function totalLf(run: ComputedRun | null): number {
  if (!run) return 0;
  return Math.round(run.segments.reduce((a, s) => a + s.lf, 0) * 100) / 100;
}

for (const file of caseFiles) {
  const c: CaseTruth = JSON.parse(readFileSync(join(corpusDir, file), "utf8"));
  const pdfPath = join(corpusDir, c.pdf);

  // extraction sanity: the synthetic PDF must actually parse and yield real
  // vector segments — a smoke check, not a scored metric (WP1.6's own scope
  // is manual-mode parity/totals/determinism; whether the RENDER looks right
  // to an automated finder is WP3's bench to write).
  const doc = await pdfjs.getDocument({ url: pdfPath, useSystemFonts: true }).promise;
  const page = await doc.getPage(c.page);
  const vp = page.getViewport({ scale: c.scale });
  const ops = await page.getOperatorList();
  const g = extractVectorGeometry(ops, vp.transform, pdfjs.OPS);
  extractionSanity.push({ caseName: c.name, segs: g.segs.length / 4 });
  if (!g.segs.length) console.error(`${c.name}: extractVectorGeometry found ZERO segments — the synthetic PDF is malformed`);

  const upp = 1 / c.ptPerFt;
  const pts: [number, number][] = c.run.points_ft.map(([x, y]) => [x * c.ptPerFt, y * c.ptPerFt]);

  // ── canvas path: build the authored run block exactly like
  // TakeoffCanvas.jsx's commitLinear would for a routed condition (WP1.5's
  // linearParity.test.ts owns proving this formula stays byte-identical to
  // the canvas source; this bench reuses the same shape it produces) ───────
  const authoredRun: AuthoredRun = { system: c.run.system, size_overrides: { "0": c.run.size } };
  const canvasComputed = resolveRunSegments(pts, upp, authoredRun);

  // ── MCP path: the real measure_line call, over a real Session ───────────
  const session = new Session();
  await session.loadPlan(pdfPath);
  const sheetKey = pdfPath.replace(/^.*[\\/]/, "");
  session.setScale(sheetKey, { upp });
  const reply = session.measureLine(sheetKey, pts, { condition: `BENCH-${c.name}`, system: c.run.system, size: c.run.size }) as { length_lf: number; computed_run?: ComputedRun };

  parity.push(scoreLinearParity(c.name, canvasComputed, reply.computed_run ?? null));
  totals.push(scoreLinearTotals(c.name, c.expected.total_lf, reply.length_lf));

  // ── determinism: same geometry, four lossless transforms ────────────────
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const baseLf = totalLf(canvasComputed);
  const probes: Array<[string, [number, number][], number]> = [
    ["rotate90", rotate90(pts, cx, cy), baseLf],
    ["translate", translate(pts, 500, -300), baseLf],
    ["reverse", [...pts].reverse(), baseLf],
    ["scale2x", scalePts(pts, 2, cx, cy), Math.round(baseLf * 2 * 100) / 100],
  ];
  for (const [name, transformed, expectedLf] of probes) {
    const run = resolveRunSegments(transformed, upp, authoredRun);
    determinism.push(scoreLinearDeterminism(c.name, name, expectedLf, totalLf(run)));
  }
}

// ── trace-engine scoring (GATE 3) ────────────────────────────────────────────
// Two corpora, scored the same way, reported separately (a synthetic
// truth-by-construction case failing means something regressed; a real
// ground-truth case failing may just mean the real sheet has one of the
// project's own already-documented, out-of-scope limitations —
// docs/LINEAR-TRACE-EVAL.md's own Findings 1/4. Blending them into one
// number would hide that distinction, the same reasoning
// mep-trace-eval.mjs's own reach/refusal/false-confident split already
// uses).
const sizeKey = (sz: RunSize | null | undefined): string | null => {
  if (!sz) return null;
  if (sz.kind === "rect") return `rect:${sz.w_in}x${sz.h_in}`;
  if (sz.kind === "round") return `round:${sz.d_in}`;
  if (sz.kind === "oval") return `oval:${sz.major_in}x${sz.minor_in}`;
  if (sz.kind === "pipe") return `pipe:${sz.nps_in}`;
  return JSON.stringify(sz);
};

/** Seeds on the longest segment of a golden run (40% along it, away from
 *  both endpoints/junctions) — the same "don't seed exactly on a vertex"
 *  reasoning a real click never lands exactly on one either. */
function seedOnLongestSegment(pts: Point[]): Point {
  let bestI = 0, bestLen = -1;
  for (let i = 0; i < pts.length - 1; i++) {
    const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (len > bestLen) { bestLen = len; bestI = i; }
  }
  const [x0, y0] = pts[bestI], [x1, y1] = pts[bestI + 1];
  return [x0 + (x1 - x0) * 0.4, y0 + (y1 - y0) * 0.4];
}

async function traceOneRun(
  session: Session, sheetKey: string, golden: Point[], goldenLf: number, goldenSize: RunSize | null | undefined,
  cold: boolean,
): Promise<TraceRunRow> {
  const seed = seedOnLongestSegment(golden);
  const caseName = sheetKey;
  const t0 = performance.now();
  let r;
  try {
    r = await session.traceRun(sheetKey, seed, {});
  } catch (e) {
    return { caseName, status: "refused", reason: String((e as Error).message || e), goldenLf, tracedLf: null, lenErrPct: null, overTracePct: 0, goldenSizeKey: sizeKey(goldenSize), tracedSizeKey: null, sizeMatch: null };
  }
  const ms = performance.now() - t0;
  const tracedLf = r.length_lf ?? null;
  const lenErrPct = tracedLf != null && goldenLf > 0 ? Math.abs(tracedLf - goldenLf) / goldenLf : null;
  const overTracePct = tracedLf != null && goldenLf > 0 && tracedLf > goldenLf ? (tracedLf - goldenLf) / goldenLf : 0;
  const goldenSizeKeyStr = sizeKey(goldenSize);
  const tracedSizeKeyStr = sizeKey(r.size as RunSize | undefined);
  const shape = scoreTraceShapeMatch(caseName, golden, r.points as Point[], session.sheet(sheetKey).upp || 0);
  return {
    caseName, status: "reached", goldenLf, tracedLf, lenErrPct, overTracePct,
    goldenSizeKey: goldenSizeKeyStr, tracedSizeKey: tracedSizeKeyStr,
    sizeMatch: goldenSizeKeyStr != null ? goldenSizeKeyStr === tracedSizeKeyStr : null,
    shape,
    ...(cold ? { buildMs: ms } : { queryMs: ms }),
  };
}

const traceRows: TraceRunRow[] = [];
const traceSeenSheets = new Set<string>();

// Truth-by-construction px conversion for the SYNTHETIC corpus's ABSOLUTE
// position (the manual-mode loop above never needed this — resolveRunSegments
// only cares about relative distances between the points it's handed, so a
// missing offset/flip is invisible to parity/totals/determinism; a seed for
// trace_run has to land on the REAL drawn ink, which lives in a real
// coordinate frame). Mirrors bench/linear/synthesize.mts's own `toPdf`
// exactly: `[80 + x*PT_PER_FT, 80 + y*PT_PER_FT]` in native PDF points
// (bottom-left origin, y UP), which pdf.js's own viewport then flips to
// image px (top-left origin, y DOWN) on render. PAGE_H/margin duplicated
// rather than imported — synthesize.mts has top-level side effects (it
// WRITES the corpus on load), so importing it here would regenerate
// fixtures on every bench run; this codebase's own established convention
// for a small, stable primitive like this is to copy it, not force an
// import dependency across an otherwise-unrelated module boundary (same
// reasoning graph.ts's own `angleDiff` duplication states).
const SYNTH_MARGIN_PT = 80;   // synthesize.mts's own toPdf: "80 + x*PT_PER_FT" — PAGE_H itself isn't needed since `heightPx` (the real rendered sheet height) already equals PAGE_H*scale by construction
function syntheticFtToPx([xFt, yFt]: [number, number], ptPerFt: number, scale: number, heightPx: number): Point {
  return [SYNTH_MARGIN_PT * scale + xFt * ptPerFt, heightPx - SYNTH_MARGIN_PT * scale - yFt * ptPerFt];
}

// ── synthetic truth-by-construction corpus — same cases as the manual-mode
// loop above (reusing each case's own `expected`), but with the real
// absolute px conversion a seed needs (see syntheticFtToPx's own header).
for (const file of caseFiles) {
  const c: CaseTruth = JSON.parse(readFileSync(join(corpusDir, file), "utf8"));
  const pdfPath = join(corpusDir, c.pdf);
  const upp = 1 / c.ptPerFt;
  const session = new Session();
  await session.loadPlan(pdfPath);
  const sheetKey = pdfPath.replace(/^.*[\\/]/, "");
  session.setScale(sheetKey, { upp });
  const sheet = session.sheet(sheetKey);
  const pts: Point[] = c.run.points_ft.map((p) => syntheticFtToPx(p, c.ptPerFt, c.scale, sheet.heightPx));
  const cold = !traceSeenSheets.has(sheetKey);
  traceSeenSheets.add(sheetKey);
  traceRows.push(await traceOneRun(session, sheetKey, pts, c.expected.total_lf, c.run.size, cold));
}

// ── real hand-traced goldens (WP1.7 + WP3.8's "ground truth v2") — a
// DIFFERENT JSON shape (opentakeoff.linear_takeoff_ground_truth.v1:
// verts_norm fractions of the sheet's own viewport, one file can hold
// several runs) than the synthetic corpus above; adapted here rather
// than reshaping the real corpus to match the synthetic schema.
interface RealGolden {
  source_pdf: string;
  sheet_id: string;
  // absent on any golden authored before this field existed -- treated as
  // "development" (see the fallback below), matching every prior file's
  // own actual tier rather than silently dropping it from either bucket.
  tier?: "development" | "held_out";
  runs: Array<{ verts_norm: [number, number][]; computed: { perimeter_lf: number }; run?: { size_overrides?: Record<string, RunSize> } }>;
}
const repoRoot = resolve(here, "../../..");
const realGtDir = join(repoRoot, "opentakeoff-corpus/ground_truth/linear");
// refusals.json lives in the same directory but is a DIFFERENT schema (the
// negative corpus below, opentakeoff.linear_refusal_ground_truth.v1) --
// excluded by name, not just by shape, since parsing it as a RealGolden
// yields `source_pdf: undefined` and fails loudly rather than skipping.
const realFiles = readdirSync(realGtDir).filter((f) => f.endsWith(".json") && f !== "refusals.json").sort();
// held-out rows go to their OWN array, never into the shared `traceRows`
// the synthetic/development slicing below depends on -- opentakeoff-corpus/
// reports/LINEAR_HELDOUT.txt is the frozen split this reads `tier` against.
const heldOutTraceRows: TraceRunRow[] = [];
for (const file of realFiles) {
  const g: RealGolden = JSON.parse(readFileSync(join(realGtDir, file), "utf8"));
  const pdfPath = resolve(repoRoot, g.source_pdf);
  const session = new Session();
  await session.loadPlan(pdfPath);
  session.setScale(g.sheet_id, { use_detected: true });
  const sheet = session.sheet(g.sheet_id);
  for (const run of g.runs) {
    const pts: Point[] = run.verts_norm.map(([x, y]) => [x * sheet.widthPx, y * sheet.heightPx]);
    // the golden segment the SEED (40% along the longest leg) actually
    // sits on, for the size-accuracy comparison — same longest-segment
    // convention `seedOnLongestSegment` uses, computed again here since
    // the size lookup needs the segment INDEX, not just the seed point.
    let bestI = 0, bestLen = -1;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (len > bestLen) { bestLen = len; bestI = i; }
    }
    const goldenSize = run.run?.size_overrides?.[String(bestI)];
    const cold = !traceSeenSheets.has(g.sheet_id);
    traceSeenSheets.add(g.sheet_id);
    const row = await traceOneRun(session, g.sheet_id, pts, run.computed.perimeter_lf, goldenSize, cold);
    if (g.tier === "held_out") heldOutTraceRows.push(row);
    else traceRows.push(row);
  }
}

const syntheticTraceRows = traceRows.slice(0, caseFiles.length);
const realTraceRows = traceRows.slice(caseFiles.length);
const syntheticTraceAgg: TraceAggregate = aggregateTrace(syntheticTraceRows, TRACE_FRECHET_TOL_PX, TRACE_OVERLAP_MIN);
const realTraceAgg: TraceAggregate = aggregateTrace(realTraceRows, TRACE_FRECHET_TOL_PX, TRACE_OVERLAP_MIN);
// Reported, NOT gated at "within 5 points" yet: the plan's own GATE 3 rule
// ("a metric that passes development and fails held-out by > 5 points...
// is a FAILED step") needs enough held-out cases for a percentage-point gap
// to mean anything. At n=1 (opentakeoff-corpus/reports/LINEAR_HELDOUT.txt
// declares 7, only 1 authored so far) this bench's own per-case binary
// recall criterion can only ever read 0% or 100% on this tier -- gating
// that against development's own smoother 7-case percentage would just be
// gating on which single case got authored, not on whether the engine
// generalizes. Revisit once held-out has enough cases for its own recall
// number to move in less-than-100-point steps.
const heldOutTraceAgg: TraceAggregate = aggregateTrace(heldOutTraceRows, TRACE_FRECHET_TOL_PX, TRACE_OVERLAP_MIN);

// ── refusal correctness — a labeled NEGATIVE corpus (opentakeoff-corpus/
// ground_truth/linear/refusals.json), the measurement docs/
// LINEAR-TRACE-EVAL.md's own "what this does not score" section named as
// missing: `scoreTracePrecision` above only ever sees seeds ON a real
// golden run, so it can never catch a seed that should refuse outright
// but instead confidently (wrongly) traces something.
interface RefusalCase { note: string; source_pdf: string; sheet_id: string; seed_norm: [number, number]; expect_status: "refused" }
interface RefusalCorpus { cases: RefusalCase[] }
const refusalRows: RefusalRow[] = [];
const refusalCorpusPath = join(realGtDir, "refusals.json");
if (existsSync(refusalCorpusPath)) {
  const refusalCorpus: RefusalCorpus = JSON.parse(readFileSync(refusalCorpusPath, "utf8"));
  for (const c of refusalCorpus.cases) {
    const pdfPath = resolve(repoRoot, c.source_pdf);
    const session = new Session();
    await session.loadPlan(pdfPath);
    session.setScale(c.sheet_id, { use_detected: true });
    const sheet = session.sheet(c.sheet_id);
    const seed: Point = [c.seed_norm[0] * sheet.widthPx, c.seed_norm[1] * sheet.heightPx];
    let gotStatus: "refused" | "reached" = "reached";
    try { await session.traceRun(c.sheet_id, seed, {}); } catch { gotStatus = "refused"; }
    refusalRows.push({ caseName: `${c.sheet_id} — ${c.note}`, correct: gotStatus === c.expect_status, gotStatus });
  }
}
const refusalAgg = scoreRefusalCorrectness(refusalRows);

// ── report ──────────────────────────────────────────────────────────────────
for (const p of parity) console.log(`${p.caseName.padEnd(28)} parity ${p.ok ? "OK" : `MISMATCH: ${p.mismatch}`}`);
for (const t of totals) console.log(`${t.caseName.padEnd(28)} totals  expected ${t.expectedLf} LF, got ${t.actualLf} LF (err ${t.errFt.toFixed(3)} ft)`);
for (const d of determinism) console.log(`${d.caseName.padEnd(28)} determinism/${d.transform.padEnd(10)} expected ${d.expectedLf} LF, got ${d.actualLf} LF (err ${d.errFt.toFixed(3)} ft)`);
for (const s of extractionSanity) console.log(`${s.caseName.padEnd(28)} extraction sanity: ${s.segs} segment(s) found`);

const agg = aggregateLinear(parity, totals, determinism);
console.log("\naggregate (manual mode):", agg);

console.log("\n── trace engine (synthetic corpus) ──");
for (const r of syntheticTraceRows) console.log(`${r.caseName.padEnd(28)} ${r.status}${r.status === "reached" ? ` LF ${r.goldenLf}→${r.tracedLf} size ${r.sizeMatch == null ? "n/a" : r.sizeMatch ? "OK" : `${r.goldenSizeKey}!=${r.tracedSizeKey}`}` : ` ${r.reason ?? ""}`}`);
console.log("aggregate (synthetic trace):", syntheticTraceAgg);

console.log("\n── trace engine (real ground truth, development tier) ──");
for (const r of realTraceRows) console.log(`${r.caseName.padEnd(40)} ${r.status}${r.status === "reached" ? ` LF ${r.goldenLf}→${r.tracedLf} size ${r.sizeMatch == null ? "n/a" : r.sizeMatch ? "OK" : `${r.goldenSizeKey}!=${r.tracedSizeKey}`}` : ` ${r.reason ?? ""}`}`);
console.log("aggregate (real trace):", realTraceAgg);

console.log("\n── trace engine (real ground truth, held-out tier — reported only, not yet gated; see heldOutTraceAgg's own comment above) ──");
for (const r of heldOutTraceRows) console.log(`${r.caseName.padEnd(40)} ${r.status}${r.status === "reached" ? ` LF ${r.goldenLf}→${r.tracedLf} size ${r.sizeMatch == null ? "n/a" : r.sizeMatch ? "OK" : `${r.goldenSizeKey}!=${r.tracedSizeKey}`}` : ` ${r.reason ?? ""}`}`);
console.log("aggregate (held-out trace):", heldOutTraceAgg);

console.log("\n── refusal correctness (negative corpus) ──");
for (const r of refusalRows) console.log(`${r.caseName.padEnd(60)} ${r.correct ? "OK" : `WRONG: got ${r.gotStatus}`}`);
console.log("aggregate (refusal):", refusalAgg);

writeFileSync(join(here, "linear", "results.json"), JSON.stringify({
  cases: caseFiles.length,
  parity, totals, determinism, extractionSanity,
  aggregate: agg,
  thresholds: THRESHOLDS,
  trace: {
    frechetTolPx: TRACE_FRECHET_TOL_PX, overlapMin: TRACE_OVERLAP_MIN, thresholds: TRACE_THRESHOLDS,
    synthetic: { rows: syntheticTraceRows, aggregate: syntheticTraceAgg },
    real: { rows: realTraceRows, aggregate: realTraceAgg },
    heldOut: { rows: heldOutTraceRows, aggregate: heldOutTraceAgg },
  },
  refusal: { rows: refusalRows, aggregate: refusalAgg },
}, null, 1));

const failures: string[] = [];
if (agg.parityFailures > THRESHOLDS.maxParityFailures) failures.push(`parity failures ${agg.parityFailures} > ${THRESHOLDS.maxParityFailures}`);
if (agg.maxTotalsErrFt > THRESHOLDS.maxTotalsErrFt) failures.push(`max totals error ${agg.maxTotalsErrFt} ft > ${THRESHOLDS.maxTotalsErrFt} ft`);
if (agg.maxDeterminismErrFt > THRESHOLDS.maxDeterminismErrFt) failures.push(`max determinism error ${agg.maxDeterminismErrFt} ft > ${THRESHOLDS.maxDeterminismErrFt} ft`);
if (extractionSanity.some((s) => s.segs === 0)) failures.push("a synthetic case produced zero extracted segments");
// Trace-engine gating checks the REAL ground truth (the plan's own
// "development tier" language) against TRACE_THRESHOLDS's current
// ratchet point, not GATE 3's own not-yet-met targets — see that
// constant's own header for why.
if (realTraceAgg.recall < TRACE_THRESHOLDS.minRecall) failures.push(`trace recall (real) ${realTraceAgg.recall.toFixed(3)} < ${TRACE_THRESHOLDS.minRecall}`);
if (realTraceAgg.precision < TRACE_THRESHOLDS.minPrecision) failures.push(`trace precision (real) ${realTraceAgg.precision.toFixed(3)} < ${TRACE_THRESHOLDS.minPrecision}`);
if (realTraceAgg.maxLenErrPct > TRACE_THRESHOLDS.maxLenErrPct) failures.push(`trace max length error (real) ${realTraceAgg.maxLenErrPct.toFixed(3)} > ${TRACE_THRESHOLDS.maxLenErrPct}`);
if (realTraceAgg.maxOverTracePct > TRACE_THRESHOLDS.maxOverTracePct) failures.push(`trace max over-trace (real) ${realTraceAgg.maxOverTracePct.toFixed(3)} > ${TRACE_THRESHOLDS.maxOverTracePct}`);
if (refusalAgg.total > 0 && refusalAgg.rate < TRACE_THRESHOLDS.minRefusalRate) failures.push(`refusal correctness ${refusalAgg.rate.toFixed(3)} < ${TRACE_THRESHOLDS.minRefusalRate} (misses: ${refusalAgg.misses.map((m) => m.caseName).join(", ")})`);

if (failures.length) {
  console.error("\nbench:linear FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nbench:linear passed");
