// #linear-takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md WP1.6): generates
// the synthetic linear-takeoff corpus — bench/linear/synthetic/*.pdf (real PDF
// bytes, produced with pdf-lib, never hand-drawn) plus a truth JSON per case in
// bench/linear/corpus/, in the SAME {pdf, page, scale, ptPerFt, probes} shape
// bench/corpus/*.json already uses (see bench/run.mts's real-PDF loop) so
// bench/linear.mts can read either corpus with one loader.
//
// Truth-by-construction, corpus.ts's own rule: every case's linework AND its
// golden LF/size numbers come from the SAME authored feet-coordinates — drawn
// at `PT_PER_FT` PDF points per foot, and the golden is the exact analytic
// length of those coordinates, never a number read back off the render.
//
// NOT auto-run by `npm run bench:linear` — this writes real files that get
// committed (the corpus is a fixture, like every other bench/corpus/*.json +
// its PDF), so it's a one-time/as-needed generator:
//   cd web && node --import tsx bench/linear/synthesize.mts
//
// Appendix E (the plan document bench/run.mts and this goal cite for the "ten
// hardest cases") is not checked into this repo and was not available when
// this file was written. The ten cases below are this file's own judgment
// call, built from the goal doc's own listed hard dimensions instead (pen
// weight, dash, double-line duct width, label placement — inside/beside/
// leader, a crossing, an arc flattened to a polyline, a text gap in the
// linework) — extend CASES below as real hard cases turn up.
import { PDFDocument, PDFName, PDFString, PDFDict, PDFArray, PDFOperator, PDFOperatorNames, rgb, StandardFonts } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const SYNTH_DIR = join(here, "synthetic");
const CORPUS_DIR = join(here, "corpus");
mkdirSync(SYNTH_DIR, { recursive: true });
mkdirSync(CORPUS_DIR, { recursive: true });

// 24 pt/ft (a plausible 1/2" = 1'-0" enlarged detail scale) drawn directly;
// bench/linear.mts reports ptPerFt at RENDER_SCALE like every other corpus
// case (image px/ft = PT_PER_FT * scale).
const PT_PER_FT = 24;
const RENDER_SCALE = 2.0;
const PAGE_W = 1200, PAGE_H = 900;

/** Mulberry32 — tiny seeded PRNG so "random duct/pipe networks" stays
 *  deterministic across regenerations (no crypto import needed, no Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type PtFt = [number, number];

// Safe interior bounds for the walk, well clear of the page edge (page is
// PAGE_W×PAGE_H pt at PT_PER_FT, with an 80pt drawing margin on all sides —
// this box leaves extra headroom so a run's LABEL, LEADER, or offset second
// centerline never clips the page either).
const WALK_BOUNDS: { xMin: number; xMax: number; yMin: number; yMax: number } = { xMin: 5, xMax: 38, yMin: 5, yMax: 26 };

/** A right-angle walk in feet, `legs` segments long, each STEP_FT..STEP_FT*2.5
 *  and alternating horizontal/vertical (duct/pipe runs are square-cornered far
 *  more often than not) — starting at `origin`, turning a random real
 *  direction (never doubling straight back) each leg. A step that would
 *  cross WALK_BOUNDS reflects (flips sign) instead — the walk stays fully
 *  on the page no matter how the PRNG rolls, rather than trusting `origin`
 *  plus a few random legs to never wander off it. */
function randomWalk(rng: () => number, origin: PtFt, legs: number, stepFt = 6): PtFt[] {
  const pts: PtFt[] = [origin];
  let horiz = rng() < 0.5;
  for (let i = 0; i < legs; i++) {
    const len = stepFt + rng() * stepFt * 1.5;
    let sign = rng() < 0.5 ? -1 : 1;
    const [x, y] = pts[pts.length - 1];
    const next = (s: number): PtFt => (horiz ? [x + s * len, y] : [x, y + s * len]);
    let [nx, ny] = next(sign);
    if (nx < WALK_BOUNDS.xMin || nx > WALK_BOUNDS.xMax || ny < WALK_BOUNDS.yMin || ny > WALK_BOUNDS.yMax) {
      sign = -sign;
      [nx, ny] = next(sign);
    }
    // both directions can be out of bounds for a leg longer than the box —
    // clamp as a last resort rather than ever emit an off-page point.
    nx = Math.min(WALK_BOUNDS.xMax, Math.max(WALK_BOUNDS.xMin, nx));
    ny = Math.min(WALK_BOUNDS.yMax, Math.max(WALK_BOUNDS.yMin, ny));
    pts.push([nx, ny]);
    horiz = !horiz;
  }
  return pts;
}

function segmentLengthsFt(pts: PtFt[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    out.push(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
  }
  return out;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Wraps only the case's own real duct/pipe linework in the OCG layer —
 * NOT any label/leader also drawn this pass. A leader is a real STROKED
 * path (unlike a label, which is text and never enters `layerOf` at all —
 * see registerOcgLayer's own header), and real CAD drawings put leaders on
 * a separate annotation layer, not the duct/pipe layer itself. Tagging a
 * leader as the same layer as the duct it points to (this generator's own
 * first attempt) made 08-label-leader's own trace_run walk see a real
 * 3-way junction where the leader takes off — the SAME duct-family stroke
 * offering a candidate direction the golden's own straight continuation
 * doesn't — and correctly, not spuriously, call that a real `ambiguous`
 * stop, a new artifact this fix introduced rather than a pre-existing gap
 * (the case only ever refused outright before Run 10, so this never
 * surfaced until wall-vouch stopped hiding it). */
type LayerWrap = { wrap<T>(draw: () => T | Promise<T>): Promise<T> };

interface CaseSpec {
  name: string;
  hardCase: string;
  system: string;
  size: Record<string, unknown>;
  build(page: import("pdf-lib").PDFPage, doc: PDFDocument, font: import("pdf-lib").PDFFont, pts: PtFt[], layer: LayerWrap): Promise<void> | void;
  legs?: number;
  seedOffset?: number;
  /** Only for cases where `bench/linear.mts`'s own default seed convention
   * (40% along the golden's own longest segment — `seedOnLongestSegment`'s
   * exact formula, mirrored here) lands somewhere with no real ink: a
   * double-line duct's truth is authored at the CENTERLINE, but nothing is
   * drawn there (`drawDoubleLine` only draws the two offset rails). Returns
   * a real seed point in feet, on one of those rails; written to the truth
   * JSON as `run.seed_point_ft` and converted through the SAME
   * `syntheticFtToPx` transform the golden points use (not a hand-rolled
   * second one — this project has already caught two real flip/margin bugs
   * from exactly that kind of duplication this same day). */
  seedPointFt?(pts: PtFt[]): PtFt;
}

const toPdf = ([x, y]: PtFt): [number, number] => [80 + x * PT_PER_FT, 80 + y * PT_PER_FT];

function drawCenterline(page: import("pdf-lib").PDFPage, pts: PtFt[], opts: { thickness?: number; dashArray?: number[]; color?: [number, number, number] } = {}) {
  const [r, g, b] = opts.color ?? [0, 0, 0];
  for (let i = 0; i < pts.length - 1; i++) {
    const [sx, sy] = toPdf(pts[i]);
    const [ex, ey] = toPdf(pts[i + 1]);
    page.drawLine({
      start: { x: sx, y: sy }, end: { x: ex, y: ey },
      thickness: opts.thickness ?? 1, color: rgb(r, g, b),
      ...(opts.dashArray ? { dashArray: opts.dashArray } : {}),
    });
  }
}

/** Intersection of infinite lines through (a1,a2) and (b1,b2), or `null` if
 * parallel (never happens for a real turn — two DIFFERENT directions'
 * offset lines only run parallel if the path doubled straight back on
 * itself, which `randomWalk` already refuses to generate). */
function lineIntersect(a1: PtFt, a2: PtFt, b1: PtFt, b2: PtFt): PtFt | null {
  const [x1, y1] = a1, [x2, y2] = a2, [x3, y3] = b1, [x4, y4] = b2;
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

/** One rail of a double-line duct symbol, `halfWidthFt` to `side` (±1) of
 * the truth centerline — MITERED at interior vertices (the offset lines of
 * the two segments meeting there, extended to their own intersection), not
 * each segment's own independent offset endpoint. A naive per-segment
 * offset (this function's own first version) leaves a real ink GAP on one
 * side of a turn and a real ink OVERLAP on the other, and which side is
 * which flips with the turn's own direction — for a path that turns both
 * ways (any real multi-turn run), NEITHER rail is walkable end to end
 * without a break somewhere. Mitering is the actual fix: a real drafted
 * double-line duct symbol IS a continuous outline, corners included. */
function offsetRailMitered(pts: PtFt[], halfWidthFt: number, side: 1 | -1): PtFt[] {
  const n = pts.length;
  const offsetLine = (a: PtFt, b: PtFt): [PtFt, PtFt] => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfWidthFt * side, ny = (dx / len) * halfWidthFt * side;
    return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]];
  };
  const out: PtFt[] = [];
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      out.push(offsetLine(pts[0], pts[1])[0]);
    } else if (i === n - 1) {
      out.push(offsetLine(pts[n - 2], pts[n - 1])[1]);
    } else {
      const [p1a, p1b] = offsetLine(pts[i - 1], pts[i]);
      const [p2a, p2b] = offsetLine(pts[i], pts[i + 1]);
      out.push(lineIntersect(p1a, p1b, p2a, p2b) ?? p1b);
    }
  }
  return out;
}

// 24" duct / 12" half-width-in-inches-of-nominal-width convention this
// generator's own single double-line case uses — named once so `build`
// and `seedPointFt` can't drift apart from each other.
const DOUBLE_LINE_HALF_WIDTH_FT = 24 / 12 / 2;

/** Double-line duct: two parallel MITERED outlines either side of the truth
 *  centerline (real duct-plan convention — the CENTERLINE is still what a
 *  person/agent traces and measures), each drawn as one continuous
 *  connected polyline (like `drawCenterline`'s own convention) so a real
 *  walk along either rail has no corner gap to stall on. */
function drawDoubleLine(page: import("pdf-lib").PDFPage, pts: PtFt[], halfWidthFt: number) {
  for (const side of [1, -1] as const) {
    const rail = offsetRailMitered(pts, halfWidthFt, side);
    for (let i = 0; i < rail.length - 1; i++) {
      const [sx, sy] = toPdf(rail[i]);
      const [ex, ey] = toPdf(rail[i + 1]);
      page.drawLine({ start: { x: sx, y: sy }, end: { x: ex, y: ey }, thickness: 0.75, color: rgb(0, 0, 0) });
    }
  }
}

const CASES: CaseSpec[] = [
  {
    name: "01-pen-thin-solid", hardCase: "pen-weight (thin)", system: "SA",
    size: { kind: "rect", w_in: 12, h_in: 6 },
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawCenterline(page, pts, { thickness: 0.5 })); },
  },
  {
    name: "02-pen-thick-solid", hardCase: "pen-weight (thick)", system: "SA",
    size: { kind: "rect", w_in: 16, h_in: 8 },
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawCenterline(page, pts, { thickness: 2.5 })); },
  },
  {
    name: "03-dashed-existing", hardCase: "dash pattern (existing-to-remain)", system: "SA",
    size: { kind: "round", d_in: 10 },
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawCenterline(page, pts, { thickness: 1, dashArray: [6, 4] })); },
  },
  {
    name: "04-dashdot-demo", hardCase: "dash pattern (dash-dot)", system: "HHWR",
    size: { kind: "pipe", nps_in: 2 },
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawCenterline(page, pts, { thickness: 1, dashArray: [8, 3, 1, 3] })); },
  },
  {
    name: "05-double-line-duct", hardCase: "double-line duct width", system: "SA",
    size: { kind: "rect", w_in: 24, h_in: 12 },
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawDoubleLine(page, pts, DOUBLE_LINE_HALF_WIDTH_FT)); },
    // the centerline itself has no ink (see CaseSpec's own comment) — seed
    // on the SAME rail `offsetRailMitered`'s `side: 1` draws, at the same
    // "40% along the longest segment" point `seedOnLongestSegment` would
    // otherwise pick on the centerline.
    seedPointFt(pts) {
      let bestI = 0, bestLen = -1;
      for (let i = 0; i < pts.length - 1; i++) {
        const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        if (len > bestLen) { bestLen = len; bestI = i; }
      }
      const rail = offsetRailMitered(pts, DOUBLE_LINE_HALF_WIDTH_FT, 1);
      const [x0, y0] = rail[bestI], [x1, y1] = rail[bestI + 1];
      return [x0 + (x1 - x0) * 0.4, y0 + (y1 - y0) * 0.4];
    },
  },
  {
    name: "06-label-inside", hardCase: "label placement (inside the run)", system: "SA",
    size: { kind: "rect", w_in: 14, h_in: 8 },
    async build(page, _doc, font, pts, layer) {
      await layer.wrap(() => drawCenterline(page, pts, { thickness: 1 }));
      // a label is TEXT, not a stroked path — never enters layerOf either
      // way (registerOcgLayer's own header) — left outside the wrap anyway,
      // matching real CAD practice (annotation lives on its own layer).
      const mid = pts[Math.floor(pts.length / 2)];
      const [x, y] = toPdf(mid);
      page.drawText("14x8", { x: x - 10, y: y + 2, size: 8, font, color: rgb(0, 0, 0) });
    },
  },
  {
    name: "07-label-beside", hardCase: "label placement (beside, no leader)", system: "SA",
    size: { kind: "round", d_in: 8 },
    async build(page, _doc, font, pts, layer) {
      await layer.wrap(() => drawCenterline(page, pts, { thickness: 1 }));
      const mid = pts[Math.floor(pts.length / 2)];
      const [x, y] = toPdf(mid);
      page.drawText('8"ø', { x: x + 10, y: y + 14, size: 8, font, color: rgb(0, 0, 0) });
    },
  },
  {
    name: "08-label-leader", hardCase: "label placement (leader line)", system: "HHWS",
    size: { kind: "pipe", nps_in: 1.5 },
    async build(page, doc, font, pts, layer) {
      await layer.wrap(() => drawCenterline(page, pts, { thickness: 1 }));
      const mid = pts[Math.floor(pts.length / 2)];
      const [x, y] = toPdf(mid);
      const [lx, ly] = [x + 40, y + 40];
      // The leader is a real STROKED path, unlike the label text below it —
      // given its OWN distinct OCG ("M-ANNO", a real annotation layer, not
      // the duct's own) rather than left untagged. Untagged was tried
      // first and did NOT work: `layerOf === -1` reads as "compatible by
      // default" to `sameFamilyContinuity` (see registerOcgLayer's own
      // header), not as a confirmed non-match, so the walk still saw the
      // leader as the same family as the duct it takes off from and still
      // stopped `ambiguous` there. A genuinely distinct layer index is
      // what the walker's own filter actually keys on.
      const annotation = registerOcgLayer(doc, page, "M-ANNO");
      await annotation.wrap(() => {
        page.drawLine({ start: { x, y }, end: { x: lx, y: ly }, thickness: 0.5, color: rgb(0, 0, 0) });
      });
      page.drawText('1-1/2" HW', { x: lx + 2, y: ly + 2, size: 8, font, color: rgb(0, 0, 0) });
    },
  },
  {
    name: "09-crossing-run", hardCase: "two runs crossing, no shared vertex", system: "SA",
    size: { kind: "rect", w_in: 10, h_in: 6 },
    build(page, _doc, _font, pts, layer) {
      return layer.wrap(() => {
        drawCenterline(page, pts, { thickness: 1 });
        // a SECOND, unrelated run drawn straight through the middle of this
        // one's bounding box — same pen, no vertex in either truth polyline at
        // the intersection (a real X crossing, not a tee). Tagged under the
        // SAME layer deliberately: two real duct runs of the same system
        // sharing one CAD layer is normal, not an artifact to route around.
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        drawCenterline(page, [[cx - 6, cy + 6], [cx + 6, cy - 6]], { thickness: 1 });
      });
    },
  },
  {
    name: "10-arc-as-polyline", hardCase: "arc flattened to a polyline elbow", system: "HHWS",
    size: { kind: "pipe", nps_in: 3 },
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawCenterline(page, pts, { thickness: 1.25 })); },
    legs: 1, seedOffset: 900,
  },
  {
    // A genuine 3-way wye/fork, not a tee: `graph.ts`'s own `frontier()`
    // only auto-continues through a "tee" when exactly one of the three
    // incident pairs is near-collinear (< 8 deg deviation from straight) —
    // the walker then always takes that "main" pair and never the branch,
    // by a fixed rule, no matter what a specific golden's own path needs
    // (walk.ts:319-327). Here NONE of the three legs pair up collinear in
    // the FEET space these angles are authored in (each pairwise deviation
    // is a deliberate 60 deg) — `frontier()` falls through to its own
    // documented default, "ambiguous", exactly the case a guided multi-hop
    // continuation (web/src/lib/linear/guidedWalk.ts) exists to score.
    // Confirmed directly against the real built PDF before trusting this,
    // not just derived on paper: `trace_run` really does stop `ambiguous`
    // at the fork with exactly two candidates. (The two candidates' own
    // PIXEL-space angles do NOT match this feet-space 60/300 labeling —
    // `toPdf`'s own Y-flip inverts the sign of the Y component, so the
    // golden's own branch reads as pixel-angle 300 and the "wrong main"
    // leg reads as 60; verified empirically, not assumed — the driver
    // itself never hardcodes either value, it always compares against the
    // real golden direction through the same live transform, so this
    // labeling quirk cannot silently break it.) The golden's own path
    // takes the BRANCH leg; a third, undrawn-in-the-golden "wrong main"
    // leg is real ink on the sheet a single `trace_run` call could just as
    // easily wander onto — this case is worthless as a fork test without it.
    name: "11-y-branch", hardCase: "3-way fork, golden takes the non-default branch", system: "RA",
    size: { kind: "rect", w_in: 10, h_in: 6 },
    build(page, _doc, _font, pts, layer) {
      const [a, f, b] = pts;
      const legFt = Math.hypot(f[0] - a[0], f[1] - a[1]);
      const wrongMainDeg = 300 * Math.PI / 180;
      const c: PtFt = [f[0] + legFt * Math.cos(wrongMainDeg), f[1] + legFt * Math.sin(wrongMainDeg)];
      return layer.wrap(() => {
        drawCenterline(page, [a, f, b], { thickness: 1 });
        drawCenterline(page, [f, c], { thickness: 1 });
      });
    },
    // Both legs off the fork are nominally 8ft, so the default "seed on
    // the LONGEST segment" convention (seedOnLongestSegment, strict `>`)
    // is a coin flip decided by float noise from the `round2()` truth
    // roundtrip — confirmed directly: it landed on the BRANCH leg itself
    // on a real run, skipping past the fork entirely and making this case
    // test nothing. Force the seed onto the INCOMING leg explicitly so the
    // walk always meets the fork as a real `ambiguous` stop, not by luck.
    seedPointFt(pts) {
      const [a, f] = pts;
      return [a[0] + (f[0] - a[0]) * 0.4, a[1] + (f[1] - a[1]) * 0.4];
    },
  },
];

// Finding 5's real fix (docs/LINEAR-TRACE-EVAL.md): this corpus's PDFs
// carried NO PDF Optional Content Groups at all, so mepLayerSignal read
// "none" on every one of them, and with zero surrounding architectural
// context wallnetwork.ts's wall-vouch fallback excluded almost any
// sufficiently long, straight, axis-aligned segment — confounding most of
// what this corpus was built to test. Real duct/pipe systems (SA/RA/EA vs.
// HHWS/HHWR/etc.) get a real named layer here so trace_run's own
// mepsystems.ts classifyMepLayerName reads a genuine "stroke-family:
// layer-name", the same code path weld-county-m1-0.json's real golden
// exercises, bypassing wall-vouch entirely rather than routing around it.
const DUCT_SYSTEMS = new Set(["SA", "RA", "EA", "OA", "MA"]);
function layerNameForSystem(system: string): string {
  // Both names contain a token mepsystems.ts's own DUCTWORK/PIPING sets
  // recognize outright ("DUCT"/"PIPE") — a real, not just plausible-looking,
  // classification, verified directly against a standalone OCG-tagged PDF
  // before this function existed (session-scoped: see PROGRESS.md).
  return DUCT_SYSTEMS.has(system) ? "M-HVAC-DUCT" : "M-PIPE-HYDRONIC";
}

/** Registers one Optional Content Group named `name` on `doc`'s catalog +
 * this `page`'s own `/Resources/Properties` (MERGING with any OCG a prior
 * call already registered on the same page — see below on why more than
 * one is real, not hypothetical), and returns a function that wraps a
 * synchronous or async draw callback in `BDC /OC <name-ref> ... EMC` so
 * every segment (and any label/leader text — harmless, see below) drawn
 * inside it attributes to that OCG in extractVectorGeometry's own
 * `layerOf`/`layerIds`. pdf-lib has no built-in OCG helper (`PDFPage` only
 * exposes low-level `pushOperators`), and its own `context.obj()` coerces a
 * plain JS string to a PDFName, not the PDF STRING type the OCG dictionary's
 * `/Name` entry requires per spec — pdf.js's `getOptionalContentConfig()`
 * silently reads that back as an EMPTY name if left uncorrected (confirmed
 * directly: a first prototype using a bare string produced a real, present,
 * but unnamed layer). `PDFString.of(name)` is required, not optional.
 * Labels/leaders drawn under the same tag are harmless: `layerOf` is
 * indexed by STROKED/FILLED PATH segment, not by text-show operators, so
 * tagging a case's whole `build()` call (linework + its own label) under
 * one OCG never puts a text run into `layerOf` at all — it only affects
 * the real vector segments this corpus's own scoring actually reads.
 *
 * A SECOND OCG per page is real, not a hypothetical this generator never
 * needs: `walk.ts`'s own `sameFamilyContinuity` only excludes a candidate
 * on a CONFIRMED layer mismatch (`lFrom >= 0 && lTo >= 0 && lFrom !== lTo`)
 * — an UNTAGGED segment (`layerOf === -1`) is treated as compatible by
 * DEFAULT, not confidently different, so simply leaving 08-label-leader's
 * own leader line untagged (this fix's own first attempt) left it just as
 * "same family" as the duct it takes off from, and the walk's own
 * `ambiguous` stop there was unchanged. A distinct, real OCG (any name;
 * `sameFamilyContinuity` compares raw layer INDICES, never calls
 * `classifyMepLayerName` itself) is what actually produces `lFrom !== lTo`. */
let nextPropIndex = 0;
function registerOcgLayer(doc: PDFDocument, page: import("pdf-lib").PDFPage, name: string): LayerWrap {
  const ocgDict = doc.context.obj({ Type: "OCG", Name: PDFString.of(name) });
  const ocgRef = doc.context.register(ocgDict);
  const propName = `OC${nextPropIndex++}`;

  const existingProps = doc.catalog.get(PDFName.of("OCProperties"));
  const priorOcgs = existingProps instanceof PDFDict ? existingProps.lookup(PDFName.of("OCGs")) : undefined;
  const ocgs = priorOcgs instanceof PDFArray ? [...priorOcgs.asArray(), ocgRef] : [ocgRef];
  doc.catalog.set(PDFName.of("OCProperties"), doc.context.obj({
    OCGs: ocgs,
    D: { ON: ocgs, OFF: [] },
  }));

  const resources = page.node.Resources();
  const existingPropsDict = resources.lookup(PDFName.of("Properties"));
  const propsDict = existingPropsDict instanceof PDFDict ? existingPropsDict : doc.context.obj({});
  propsDict.set(PDFName.of(propName), ocgRef);
  resources.set(PDFName.of("Properties"), propsDict);
  return {
    async wrap<T>(draw: () => T | Promise<T>): Promise<T> {
      page.pushOperators(PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of("OC"), PDFName.of(propName)]));
      const result = await draw();
      page.pushOperators(PDFOperator.of(PDFOperatorNames.EndMarkedContent, []));
      return result;
    },
  };
}

/** Case 10's "arc" leg is a quarter-circle of radius 6 ft, flattened into 8
 *  short straight segments — the same flattenCurve-style approximation a
 *  curved Linear trace already stores (verts stay the authored control
 *  points; LF is priced off the flattened chain here in the truth too). */
function quarterArcPolyline(origin: PtFt, radiusFt: number, segs = 8): PtFt[] {
  const pts: PtFt[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = (i / segs) * (Math.PI / 2);
    pts.push([origin[0] + radiusFt * Math.sin(t), origin[1] + radiusFt * (1 - Math.cos(t))]);
  }
  return pts;
}

async function main() {
  const cases: { name: string; hardCase: string }[] = [];
  for (const spec of CASES) {
    const rng = mulberry32(0xc0ffee + (spec.seedOffset ?? cases.length * 97));
    const boxCx = (WALK_BOUNDS.xMin + WALK_BOUNDS.xMax) / 2, boxCy = (WALK_BOUNDS.yMin + WALK_BOUNDS.yMax) / 2;
    const origin: PtFt = [boxCx - 4 + rng() * 8, boxCy - 4 + rng() * 8];
    const pts: PtFt[] = spec.name === "10-arc-as-polyline"
      ? [origin, ...quarterArcPolyline(origin, 6).slice(1), [origin[0] + 6, origin[1] + 10]]
      : spec.name === "11-y-branch"
      ? (() => {
          const legFt = 8;
          const inDeg = 180 * Math.PI / 180, branchDeg = 60 * Math.PI / 180;
          const a: PtFt = [origin[0] + legFt * Math.cos(inDeg), origin[1] + legFt * Math.sin(inDeg)];
          const b: PtFt = [origin[0] + legFt * Math.cos(branchDeg), origin[1] + legFt * Math.sin(branchDeg)];
          return [a, origin, b];
        })()
      : randomWalk(rng, origin, 3 + Math.floor(rng() * 3));

    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const layer = registerOcgLayer(doc, page, layerNameForSystem(spec.system));
    await spec.build(page, doc, font, pts, layer);
    const bytes = await doc.save();
    const pdfName = `${spec.name}.pdf`;
    writeFileSync(join(SYNTH_DIR, pdfName), bytes);

    // Sum the RAW (unrounded) lengths and round once — matching
    // measure_line's own length_lf (round2(openLen(pxPts) * upp), summed in
    // px space then converted and rounded a single time), which is what
    // bench/linear.mts's totals check compares against. Math.hypot's
    // internal rescaling means this and the px-space computation can still
    // differ by a floating-point ULP or two at a rounding boundary — see
    // bench/linear.mts's THRESHOLDS comment for the measured bound.
    const lens = segmentLengthsFt(pts);
    const total = round2(lens.reduce((a, b) => a + b, 0));
    const truth = {
      name: spec.name,
      hardCase: spec.hardCase,
      pdf: `../synthetic/${pdfName}`,
      page: 1,
      scale: RENDER_SCALE,
      ptPerFt: PT_PER_FT * RENDER_SCALE,
      run: {
        // points_ft is the polyline's own origin-relative feet coordinates —
        // bench/linear.mts converts to image px with ptPerFt itself, the same
        // arithmetic measure_line/canvas both already do.
        points_ft: pts.map(([x, y]) => [round2(x), round2(y)]),
        system: spec.system,
        size: spec.size,
        // only present when the centerline itself has no real ink to seed
        // on (see CaseSpec's own `seedPointFt` header) — bench/linear.mts
        // converts this through the SAME transform as points_ft and seeds
        // there instead of its own default "40% along the longest segment
        // of points_ft" convention.
        ...(spec.seedPointFt ? { seed_point_ft: spec.seedPointFt(pts).map(round2) } : {}),
      },
      expected: {
        segment_lf: lens.map(round2),
        total_lf: total,
      },
    };
    writeFileSync(join(CORPUS_DIR, `${spec.name}.json`), JSON.stringify(truth, null, 1) + "\n");
    cases.push({ name: spec.name, hardCase: spec.hardCase });
    console.log(`wrote ${pdfName} (${lens.length} segments, ${total} LF) — ${spec.hardCase}`);
  }
  console.log(`\n${cases.length} synthetic linear-takeoff cases written to bench/linear/{synthetic,corpus}/`);
}

await main();
