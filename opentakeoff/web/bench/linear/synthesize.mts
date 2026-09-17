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

/** Double-line duct: two parallel offset strokes either side of the truth
 *  centerline (real duct-plan convention — the CENTERLINE is still what a
 *  person/agent traces and measures). */
function drawDoubleLine(page: import("pdf-lib").PDFPage, pts: PtFt[], halfWidthFt: number) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * halfWidthFt, ny = (dx / len) * halfWidthFt;
    const off = ([x, y]: PtFt, s: number): PtFt => [x + nx * s, y + ny * s];
    for (const s of [1, -1]) {
      const [sx, sy] = toPdf(off([ax, ay], s));
      const [ex, ey] = toPdf(off([bx, by], s));
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
    build(page, _doc, _font, pts, layer) { return layer.wrap(() => drawDoubleLine(page, pts, 24 / 12 / 2)); },
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
