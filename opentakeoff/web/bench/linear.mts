// Linear-takeoff benchmark runner (#linear-takeoff WP1.6):
//   npm run bench:linear          (from web/)
// Scores the synthetic linear corpus (bench/linear/corpus/*.json + the PDFs
// bench/linear/synthetic/synthesize.mts generated them from) on the THREE
// things that can regress in MANUAL mode — parity, totals, determinism — per
// the goal document's own WP1.6 scope (see score.ts's header comment on why
// the full recall/precision/Fréchet/vertex-F1 suite doesn't apply yet).
//
// Same shape as bench/run.mts: writes bench/linear/results.json (null, 1
// indent, diffable) and CI diff-gates it exactly like results.json (#198
// pattern, .github/workflows/ci.yml) — an engine change that moves a linear
// number must ship its own results.json delta in the same PR.
import { createRequire } from "module";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { Session } from "../../mcp/src/session.ts";
import { resolveRunSegments, type ComputedRun } from "../src/lib/linear/run.ts";
import type { AuthoredRun, RunSize } from "../src/lib/linear/types.ts";
import { extractVectorGeometry } from "../src/lib/oneclick.ts";
import {
  scoreLinearParity, scoreLinearTotals, scoreLinearDeterminism, aggregateLinear,
  type LinearTotalsRow, type LinearDeterminismRow,
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

// ── report ──────────────────────────────────────────────────────────────────
for (const p of parity) console.log(`${p.caseName.padEnd(28)} parity ${p.ok ? "OK" : `MISMATCH: ${p.mismatch}`}`);
for (const t of totals) console.log(`${t.caseName.padEnd(28)} totals  expected ${t.expectedLf} LF, got ${t.actualLf} LF (err ${t.errFt.toFixed(3)} ft)`);
for (const d of determinism) console.log(`${d.caseName.padEnd(28)} determinism/${d.transform.padEnd(10)} expected ${d.expectedLf} LF, got ${d.actualLf} LF (err ${d.errFt.toFixed(3)} ft)`);
for (const s of extractionSanity) console.log(`${s.caseName.padEnd(28)} extraction sanity: ${s.segs} segment(s) found`);

const agg = aggregateLinear(parity, totals, determinism);
console.log("\naggregate:", agg);

writeFileSync(join(here, "linear", "results.json"), JSON.stringify({
  cases: caseFiles.length,
  parity, totals, determinism, extractionSanity,
  aggregate: agg,
  thresholds: THRESHOLDS,
}, null, 1));

const failures: string[] = [];
if (agg.parityFailures > THRESHOLDS.maxParityFailures) failures.push(`parity failures ${agg.parityFailures} > ${THRESHOLDS.maxParityFailures}`);
if (agg.maxTotalsErrFt > THRESHOLDS.maxTotalsErrFt) failures.push(`max totals error ${agg.maxTotalsErrFt} ft > ${THRESHOLDS.maxTotalsErrFt} ft`);
if (agg.maxDeterminismErrFt > THRESHOLDS.maxDeterminismErrFt) failures.push(`max determinism error ${agg.maxDeterminismErrFt} ft > ${THRESHOLDS.maxDeterminismErrFt} ft`);
if (extractionSanity.some((s) => s.segs === 0)) failures.push("a synthetic case produced zero extracted segments");

if (failures.length) {
  console.error("\nbench:linear FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("\nbench:linear passed");
