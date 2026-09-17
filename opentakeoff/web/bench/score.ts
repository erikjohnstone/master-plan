// Benchmark scoring — pure (no DOM, no pdf.js), node-testable.
//
// The upstream RFC's ground rule: engine claims are opinions without corpus
// numbers. Every probe traces a region and is scored against a GOLDEN polygon
// by rasterized IoU; the aggregate reports the RFC's four headline metrics —
// mean IoU, floor IoU, refusal rate, leak rate — plus correct-refusal rate
// for probes whose golden answer is "refuse".
import { pointInPoly } from "../src/lib/geometry.js";
import type { Point } from "../src/lib/oneclick";
import type { ComputedRun } from "../src/lib/linear/run.ts";

/** Rasterized IoU of two polygons (cell centers on the union bbox, 1 px grid).
 *  Exact enough for room-scale rings; dependency-free and orientation-proof. */
export function polyIoU(a: Point[], b: Point[], cell = 1): number {
  if (a.length < 3 || b.length < 3) return 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of [...a, ...b]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  let inter = 0, union = 0;
  for (let y = y0 + cell / 2; y <= y1; y += cell) {
    for (let x = x0 + cell / 2; x <= x1; x += cell) {
      const inA = pointInPoly(x, y, a), inB = pointInPoly(x, y, b);
      if (inA && inB) inter++;
      if (inA || inB) union++;
    }
  }
  return union ? inter / union : 0;
}

export function ringAreaAbs(p: Point[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export interface ProbeScore {
  caseName: string;
  probeName: string;
  expect: "golden" | "refusal";
  status: string;              // engine status ("ok" / "leak" / "tiny" / "boundary")
  iou?: number;                // golden probes that traced
  sfErr?: number;              // |engine area − golden area| / golden area — what a bid actually buys
  leak?: boolean;              // traced but ballooned past the golden
  refused?: boolean;           // golden probe the engine declined
  confidence?: number;         // engine's own 0–1 confidence for the trace
  correctRefusal?: boolean;    // refusal probe the engine declined
  knownFail?: boolean;         // tracked but not gating
  tags?: string[];
}

/** Area (px²) of the overlap between two rings — sampled only over the
 *  intersection of their bounding boxes, so disjoint rooms cost nothing.
 *  Used for the per-case tiling check: two probes' engine regions claiming
 *  the same floor is double-counted square footage. */
export function polyOverlapPx2(a: Point[], b: Point[], cell = 1): number {
  if (a.length < 3 || b.length < 3) return 0;
  let ax0 = Infinity, ay0 = Infinity, ax1 = -Infinity, ay1 = -Infinity;
  for (const [x, y] of a) { ax0 = Math.min(ax0, x); ax1 = Math.max(ax1, x); ay0 = Math.min(ay0, y); ay1 = Math.max(ay1, y); }
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const [x, y] of b) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y); }
  const x0 = Math.max(ax0, bx0), x1 = Math.min(ax1, bx1), y0 = Math.max(ay0, by0), y1 = Math.min(ay1, by1);
  if (x0 >= x1 || y0 >= y1) return 0;
  let inter = 0;
  for (let y = y0 + cell / 2; y <= y1; y += cell) {
    for (let x = x0 + cell / 2; x <= x1; x += cell) {
      if (pointInPoly(x, y, a) && pointInPoly(x, y, b)) inter++;
    }
  }
  return inter * cell * cell;
}

export interface CaseCoverage {
  caseName: string;
  probes: number;              // golden probes contributing
  sumGoldenSF: number;         // Σ golden areas (the answer key's total floor)
  sumEngineSF: number;         // Σ engine areas
  ratio: number;               // sumEngine / sumGolden — missed or phantom floor shows here
  overlapSF: number;           // Σ pairwise engine-region overlap — double-counted floor
  maxSfErr: number;            // worst per-probe RELATIVE SF error
  /** worst per-probe ABSOLUTE SF divergence, |engine − golden| in square feet
   *  (audit F6). The relative figure above is blind on a room that dominates a
   *  case: 2.5% of the VA plan's cloud-corridor is 43.6 SF, so a 37 SF move
   *  sits inside the band and ships without an adjudication. Square feet are
   *  what a bid is written in, so they get their own trigger. */
  maxSfAbs: number;
  /** the probe that set `maxSfAbs`, so the failure message names a room. */
  maxSfAbsProbe: string;
  humanMeasured: boolean;      // hard gates apply only where truth is human-authored
}

/** Whole-case accounting from golden probes' rings: per-room SF error alone
 *  can't see floor that NO probe covers or floor counted twice — the case's
 *  totals and pairwise overlaps can. pxPerFt converts ring px² to SF;
 *  deductsSF (columns, casework the human deducted) reduces the golden total. */
export function caseCoverage(caseName: string, rows: Array<{ golden: Point[]; ring: Point[] | null; name?: string }>, pxPerFt: number, humanMeasured: boolean, deductsSF = 0, cell = 2): CaseCoverage {
  const sf = (px2: number) => px2 / (pxPerFt * pxPerFt);
  let sumG = 0, sumE = 0, maxErr = 0, maxAbs = 0, maxAbsProbe = "";
  const rings: Point[][] = [];
  for (const r of rows) {
    const g = sf(ringAreaAbs(r.golden));
    sumG += g;
    const bumpAbs = (d: number) => { if (d > maxAbs || maxAbsProbe === "") { maxAbs = d; maxAbsProbe = r.name ?? "(unnamed)"; } };
    if (r.ring && r.ring.length >= 3) {
      const e = sf(ringAreaAbs(r.ring));
      sumE += e;
      rings.push(r.ring);
      if (g > 0) maxErr = Math.max(maxErr, Math.abs(e - g) / g);
      bumpAbs(Math.abs(e - g));
    } else {
      maxErr = Math.max(maxErr, 1);        // refused probe: 100% of that room missing
      bumpAbs(g);                          // ...and 100% of its square footage, absolutely
    }
  }
  let overlapPx2 = 0;
  for (let i = 0; i < rings.length; i++)
    for (let j = i + 1; j < rings.length; j++) overlapPx2 += polyOverlapPx2(rings[i], rings[j], cell);
  const g = Math.max(0, sumG - deductsSF);
  return {
    caseName,
    probes: rows.length,
    sumGoldenSF: g,
    sumEngineSF: sumE,
    ratio: g > 0 ? sumE / g : 1,
    overlapSF: sf(overlapPx2),
    maxSfErr: maxErr,
    maxSfAbs: maxAbs,
    maxSfAbsProbe: maxAbsProbe,
    humanMeasured,
  };
}

// ── the wall-semantics declaration, CHECKED (audit F5) ──────────────────────
// A corpus case declares `wallSemantics`: which line its goldens measure to.
// The check used to be `c.wallSemantics !== WALL_SEMANTICS`, i.e. a comparison
// against the constant that every writer of the field stamped it FROM
// (bench/from-takeoff.mts for human keys, bench/pin-goldens.mts for engine-
// pinned ones) — so it could not fail, and it did not, for the three months the
// value it certified ("centerline") was false on 60% of the corpus's SF.
// This is the version with something to say. Three separate things can be
// wrong, and they are three separate messages:
//   (1) the value is not in the vocabulary at all — a typo, or a convention the
//       bench has no measurand for;
//   (2) the value is a real measurand, but not the one the engine returns — the
//       SF gates would be comparing a human's tape to a different line;
//   (3) the value IS the engine's, but the goldens do not actually sit on drawn
//       path vertices — the declaration is unearned, whoever stamped it.
// Only (3) needs the data, and (3) is the whole point.

export interface SemanticsCoverage { caseName: string; probeName: string; onVertex: number; verts: number; cov: number }

/** Fraction of a golden ring's vertices that coincide (within `tolPx`) with a
 *  drawn path vertex — the measurable content of "drawn-path-vertex". */
export function goldenVertexCoverage(golden: Point[], points: Point[], tolPx: number): SemanticsCoverage["cov"] {
  if (!golden.length) return 1;
  let on = 0;
  for (const [gx, gy] of golden) {
    for (const [px, py] of points) {
      if (Math.hypot(px - gx, py - gy) <= tolPx) { on++; break; }
    }
  }
  return on / golden.length;
}

export function checkWallSemantics(opts: {
  caseName: string;
  declared: unknown;
  engine: string;
  known: readonly string[];
  probes: Array<{ name: string; golden?: Point[] }>;
  points: Point[];
  tolPx: number;
  minCoverage: number;
}): { failures: string[]; coverage: SemanticsCoverage[] } {
  const { caseName, declared, engine, known, probes, points, tolPx, minCoverage } = opts;
  const failures: string[] = [];
  const coverage: SemanticsCoverage[] = [];
  if (typeof declared !== "string" || !known.includes(declared)) {
    failures.push(`${caseName}: wallSemantics is ${JSON.stringify(declared ?? null)} — not one of ${known.join(", ")} (see bench/corpus.ts)`);
    return { failures, coverage };
  }
  if (declared !== engine) {
    failures.push(`${caseName}: wallSemantics is "${declared}" but the engine returns "${engine}" — the SF gates would be comparing two different measurands. Re-measure the key, or grade this case by hand.`);
    return { failures, coverage };
  }
  for (const p of probes) {
    if (!p.golden || p.golden.length < 3) continue;
    const cov = goldenVertexCoverage(p.golden, points, tolPx);
    const on = Math.round(cov * p.golden.length);
    coverage.push({ caseName, probeName: p.name, onVertex: on, verts: p.golden.length, cov });
    if (cov < minCoverage)
      failures.push(`${caseName}/${p.name}: only ${on}/${p.golden.length} golden vertices (${(cov * 100).toFixed(0)}%) sit within ${tolPx} px of a drawn path vertex — the case declares "${engine}" and this golden does not measure to one (floor ${(minCoverage * 100).toFixed(0)}%)`);
  }
  return { failures, coverage };
}

export interface Aggregate {
  goldenProbes: number; meanIoU: number; floorIoU: number;
  refusalRate: number; leakRate: number;
  refusalProbes: number; correctRefusalRate: number;
  knownFails: number;
}

/** Classify one golden probe: refused, leaked (IoU < 0.5 with area overshoot), or scored. */
export function scoreGolden(status: string, traced: Point[] | null, golden: Point[]): { iou: number; sfErr?: number; leak: boolean; refused: boolean } {
  if (status !== "ok" || !traced || traced.length < 3) return { iou: 0, leak: false, refused: true };
  const iou = polyIoU(traced, golden);
  const ag = ringAreaAbs(golden);
  const sfErr = ag > 0 ? Math.abs(ringAreaAbs(traced) - ag) / ag : undefined;
  const leak = iou < 0.5 && ringAreaAbs(traced) > ag * 1.5;
  return { iou, sfErr, leak, refused: false };
}

// ── cross-resolution agreement (RFC failure mode #3) ────────────────────────
// The same click must mean the same thing at every mask resolution: a room the
// engine traces at the production cap but refuses (or traces differently) on a
// half-resolution mask is resolution-dependent behavior, not measurement. Each
// probe runs at several ws factors; agreement is two-part — every resolution
// reaches the same VERDICT (traced vs refused), and the rings traced agree
// pairwise by IoU (rings are in image px, so they compare directly).

export interface CrossRun { res: number; status: string; ring: Point[] | null; }
export interface CrossScore {
  caseName: string;
  probeName: string;
  expect: "golden" | "refusal";
  resolutions: number[];       // ws factors probed (1 = production cap)
  statuses: string[];          // engine status per resolution
  statusAgree: boolean;        // same verdict at every GATING resolution
  minPairIoU?: number;         // worst pairwise ring agreement (≥2 traced, gating res only)
  iouByRes?: number[];         // per-resolution IoU vs the golden (diagnostic, all res)
  subFloorRes?: number[];      // resolutions below the engine's determinism floor — tracked, non-gating
  ungated?: boolean;           // FEWER THAN TWO resolutions at/above the floor: this case is
                               // NOT cross-checked at all — the honest statement, never a
                               // self-comparison dressed up as agreement (review round 8)
  knownFail?: boolean;
  tags?: string[];
}

export function crossAgreement(runs: CrossRun[], cell = 1): { statuses: string[]; statusAgree: boolean; minPairIoU?: number } {
  const statuses = runs.map((r) => r.status);
  // agreement = same VERDICT everywhere (all traced or all refused) — whether
  // that verdict is CORRECT is the baseline gate's job, not this one's
  const traced = runs.filter((r) => r.status === "ok" && r.ring && r.ring.length >= 3);
  const statusAgree = traced.length === runs.length || runs.every((r) => r.status !== "ok");
  let minPairIoU: number | undefined;
  for (let i = 0; i < traced.length; i++)
    for (let j = i + 1; j < traced.length; j++) {
      const iou = polyIoU(traced[i].ring!, traced[j].ring!, cell);
      if (minPairIoU === undefined || iou < minPairIoU) minPairIoU = iou;
    }
  return { statuses, statusAgree, minPairIoU };
}

export interface CrossAggregate {
  crossProbes: number;         // gating probes compared across resolutions
  disagreements: number;       // gating probes whose verdict flips with resolution
  crossFloorIoU: number;       // worst pairwise ring agreement among gating golden probes
  crossMeanIoU: number;
  ungated: number;             // probes with <2 gated resolutions — NOT cross-checked
  knownFails: number;
}

export function aggregateCross(scores: CrossScore[]): CrossAggregate {
  const gating = scores.filter((s) => !s.knownFail && !s.ungated);
  const ious = gating.filter((s) => s.minPairIoU !== undefined).map((s) => s.minPairIoU!);
  return {
    crossProbes: gating.length,
    disagreements: gating.filter((s) => !s.statusAgree).length,
    crossFloorIoU: ious.length ? Math.min(...ious) : 1,
    crossMeanIoU: ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : 1,
    ungated: scores.filter((s) => s.ungated).length,
    knownFails: scores.filter((s) => s.knownFail).length,
  };
}

// ── the anti-correlation gate (audit A2) ────────────────────────────────────
// RFC item D shipped a confidence score that was ANTI-correlated with error:
// annotation-ring-room measured −35% at 1.00, partition-bank-15in +384% at
// 0.95, tile-demising-same-pen +97% at 0.95, and TakeoffCanvas only ever shows
// the badge when the score is < 1, so the worst of those reached the estimator
// with no flag at all. This gate is what keeps that fixed.
//
// It is deliberately keyed on SF ERROR, not IoU. IoU is the wrong measure for
// a bid: two-doorways/center reports 4.33% SF error at confidence 1.00 with
// IoU 0.957, which sits in the dead zone of any IoU-keyed threshold. Square
// footage is what the estimator sells.
//
// IT DELIBERATELY IGNORES `knownFail`. `aggregate` and `aggregateCross` below
// both open with `scores.filter((s) => !s.knownFail)`, and three of the four
// worst-calibrated probes carry that flag — run through either aggregate this
// gate could not fire at all. Everything here reads the raw `scores` array.
export const CONF_GATE = {
  ceilSfErr: 0.025,    // above this SF error a probe is INACCURATE...
  ceilConf: 0.90,      // ...and may not report more confidence than this
  floorSfErr: 0.005,   // at or below this SF error a probe is ACCURATE...
  // ...and may not score below the median of the inaccurate population plus
  // this margin. RELATIVE, because an absolute floor is gameable in the other
  // direction: a traceConfidence that returns a constant satisfies any ceiling
  // and any non-strict floor. The margin is what makes a constant fail — with
  // one, min(accurate) ≥ median(inaccurate) + margin is unsatisfiable by any
  // function whose output does not depend on the trace.
  floorMargin: 0.03,
  // ...and, separately, the absolute floor CALIBRATED from what the deductions
  // actually produce (measured after the A3 disclosure and the magnitude work
  // landed: the accurate population's minimum is va-finish-plan/ward-vestibule
  // at 0.89 — 0.97 wedge × 0.99 min-passage × 0.92 curve-bounded). A flat 0.90
  // was not available: A3's own disclosure fires only on six VA probes, every
  // one of them inside the accurate band, one having removed 82.9% of the
  // verbatim flood. Set one notch under the measured minimum.
  floorAbs: 0.88,
};

/** An exemption's XFAIL DIRECTION — the assertion that makes the exemption
 *  self-destruct the day the situation it documents improves. At least one
 *  direction is required (bounded by test/benchScore.test.ts). */
export interface ConfGateExemption {
  /** the probe still scores ABOVE this — "no signal fires here, and none has". */
  xfailAbove?: number;
  /** the probe still scores AT OR BELOW this — "a deduction fires here that
   *  the engine cannot yet justify withholding, and it still can't". */
  xfailAtMost?: number;
  /** the probe still scores AT OR ABOVE this — the OTHER half of `xfailAtMost`
   *  (audit F6/W6). An upper bound alone tolerates collapse: a
   *  `traceConfidence` that returned 0.10 on this probe, or piled three more
   *  spurious deductions onto it, would satisfy "still ≤ 0.87" and the
   *  exemption would absorb the regression silently. Paired, the two bounds
   *  say what the exemption actually claims: the score is pinned in a band,
   *  and anything leaving that band in either direction needs re-argument. */
  xfailAtLeast?: number;
  /** the probe still scores EXACTLY what the named other probe scores. The
   *  sharpest direction available when the finding IS the identity: one signal
   *  producing one number on a probe that is exactly right and on a probe that
   *  is wildly wrong is a demonstration that the signal does not discriminate. */
  xfailEquals?: string;
  reason: string;
}

/** Probes exempt from the gate, each with the SIGNAL SET it was evaluated
 *  against — an exemption without one is just `knownFail` under a new name.
 *  This list is BOUNDED by a test (see test/benchScore.test.ts) and each entry
 *  carries an XFAIL WITH A DIRECTION, so the day the situation improves the
 *  gate fails loudly instead of quietly absorbing it.
 *
 *  A5b GREW THIS LIST FROM ONE TO THREE, and that needs stating plainly. The
 *  two additions are not new defects — they are defects the gate could not see
 *  while the bench measured the wrong quantity. Before A5b the bench scored
 *  `traceRegion` instead of the product's snapped ring, which parked every
 *  synthetic probe at a systematic ~0.8–4.3% SF error: squarely inside this
 *  gate's DEAD ZONE (above floorSfErr 0.5%, and mostly below ceilSfErr 2.5%),
 *  so not one of the nine entered either population. Measuring what the product
 *  returns moved them all to ~0.00% and put them in the accurate population for
 *  the first time — where two of them fail the floor. The gate was passing
 *  because the bench was wrong. */
export const CONF_GATE_EXEMPT: Record<string, ConfGateExemption> = {
  "annotation-ring-room/center": {
    xfailAbove: 0.90,
    reason:
      "Instrumented against the complete signal set traceConfidence can read — raster false, " +
      "hatchFiltered false (hatchTier absent), sealedPx undefined, virtualFrac undefined, wedges undefined, " +
      "wedgeGrowth undefined, curveFrac undefined (no curve linework on the boundary), minPassDelta exactly " +
      "0.0000 (the minimum-passage rule ran at r=5 and changed nothing), areaSF 79, mppf 18 (well above " +
      "DETERMINISM_MIN_MPPF). Every signal reads clean because the trace IS clean: a verbatim vector trace " +
      "that stopped at a drawn finish-tag annotation ring rather than the wall behind it. There is nothing " +
      "for a confidence deduction to key on; separating an annotation ring from a wall needs vector-native " +
      "topology (RFC item A), not tuning. XFAIL DIRECTION: asserted to stay ABOVE 0.90 — if a future signal " +
      "fires here the assertion breaks and the exemption must be re-argued or dropped.",
  },
  "tile-grid-room/in-cell": {
    xfailEquals: "partition-bank-15in/mid-bay",
    reason:
      "Added by audit A5b, and the exemption IS the finding. Signal set as measured: raster false, " +
      "sealedPx undefined, virtualFrac undefined, wedges undefined, wedgeGrowth undefined, curveFrac " +
      "undefined, minPassDelta undefined, mppf 18, areaSF 1029 — and hatchFiltered true with hatchTier " +
      "\"override\", which is the ONLY factor, giving score 0.850 exactly. partition-bank-15in/mid-bay " +
      "carries the identical single factor at the identical 0.850 while measuring 400.0% wrong, and " +
      "tile-demising-same-pen/room-a likewise at 100.0% wrong. So `hatch-filtered(override)` is the sole " +
      "deduction on the corpus's most accurate escalated trace AND on its two worst: it reports the " +
      "REGIME the escalation was accepted under, which is equally true of all three, and says nothing " +
      "about whether the result is plausible. Separating them needs a signal keyed on the escalated " +
      "region's own geometry, which is a change to src/lib/confidence.ts and outside A5b's scope. " +
      "XFAIL DIRECTION: asserted to stay EXACTLY EQUAL to partition-bank-15in/mid-bay's score. The day " +
      "any signal tells the two apart this breaks, and the exemption must be dropped — not widened.",
  },
  "two-doorways/center": {
    xfailAtMost: 0.87,
    xfailAtLeast: 0.80,
    reason:
      "Added by audit A5b. Signal set as measured: raster false, hatchFiltered false (hatchTier absent), " +
      "wedges undefined, wedgeGrowth undefined, curveFrac undefined, mppf 18, areaSF 19.8, sealedPx set " +
      "with virtualFrac 0.00, and minPassDelta ≥ 1 — the sole-minimum-passage deduction, whose own " +
      "factor string is \"the drawn linework does not enclose this space\". Score 0.850. That statement " +
      "is TRUE: the fixture is a room with two undrawn cased openings, and every square foot of its " +
      "boundary across those openings is synthetic. The probe measures 0.00% off only because the " +
      "golden is authored under the same convention the engine guessed (a cased opening is bridged) — " +
      "the engine had no evidence for that and correctly declined to claim any. So this is a case where " +
      "the gate's floor premise (accurate ⇒ confident) does not hold, rather than a miscalibration to " +
      "tune away. XFAIL DIRECTION: asserted to stay in the BAND 0.80 ≤ conf ≤ 0.87 — the upper bound sits " +
      "below CONF_GATE.floorAbs, so if the engine ever learns to distinguish a bridged drawn opening from " +
      "an invented wall it will score at or above the floor, this breaks, and the exemption must be " +
      "dropped. The lower bound was added by audit F6: `xfailAtMost` alone tolerates COLLAPSE, and this " +
      "exemption excuses exactly one deduction (CONF_MINPASS_SOLE = 0.85, the whole score) — not a pile " +
      "of them. At 0.80 the bound fires the moment a factor of ×0.94 or stronger stacks on top " +
      "(raster-traced ×0.90, coarse-mask ×0.90, hatch-filtered(override) ×0.85, any curve-bounded or " +
      "oversize factor); it still tolerates the two mildest (door-swing ×0.97 → 0.82, " +
      "hatch-filtered(bounded) ×0.95 → 0.81), which is deliberate — those two would be arguable on this " +
      "fixture, and a bound that fires on an arguable change is a bound that gets widened.",
  },
};

export interface ConfGateResult {
  accurate: Array<{ probe: string; confidence: number }>;
  inaccurate: Array<{ probe: string; confidence: number; why: string }>;
  exempt: Array<{ probe: string; confidence: number | undefined }>;
  medianInaccurate?: number;
  minAccurate?: number;
  failures: string[];
}

const median = (xs: number[]): number => {
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Evaluate the anti-correlation gate over ALL probes, known-fails included. */
export function confidenceGate(scores: ProbeScore[]): ConfGateResult {
  const key = (s: ProbeScore) => `${s.caseName}/${s.probeName}`;
  const failures: string[] = [];
  const accurate: ConfGateResult["accurate"] = [];
  const inaccurate: ConfGateResult["inaccurate"] = [];
  const exempt: ConfGateResult["exempt"] = [];

  const confByProbe = new Map(scores.map((s) => [key(s), s.confidence]));
  for (const s of scores) {
    const k = key(s);
    if (k in CONF_GATE_EXEMPT) {
      exempt.push({ probe: k, confidence: s.confidence });
      const { xfailAbove, xfailAtMost, xfailAtLeast, xfailEquals, reason } = CONF_GATE_EXEMPT[k];
      // xfail WITH A DIRECTION — see CONF_GATE_EXEMPT
      if (s.confidence == null) failures.push(`exempt ${k}: reports no confidence at all — the exemption asserts a value it can no longer check (${reason.slice(0, 60)}…)`);
      else {
        if (xfailAbove != null && s.confidence <= xfailAbove) failures.push(`exempt ${k}: XFAIL FLIPPED — confidence ${s.confidence.toFixed(2)} ≤ ${xfailAbove}. A signal now fires on the probe the exemption says has none. Re-argue the exemption or delete it; do not widen the list.`);
        if (xfailAtMost != null && s.confidence > xfailAtMost) failures.push(`exempt ${k}: XFAIL FLIPPED — confidence ${s.confidence.toFixed(2)} > ${xfailAtMost}. The deduction the exemption says the engine cannot yet withhold is no longer binding here. Drop the exemption; do not widen the list.`);
        if (xfailAtLeast != null && s.confidence < xfailAtLeast) failures.push(`exempt ${k}: XFAIL FLIPPED DOWNWARD — confidence ${s.confidence.toFixed(2)} < ${xfailAtLeast}. The exemption excuses ONE known deduction, not a collapse: something else is now firing here too. The exemption does not cover it — find it, or re-argue the band.`);
        if (xfailEquals != null) {
          const other = confByProbe.get(xfailEquals);
          if (other == null) failures.push(`exempt ${k}: XFAIL UNCHECKABLE — it asserts equality with ${xfailEquals}, which reports no confidence (or is not in the corpus).`);
          else if (Math.abs(other - s.confidence) > 1e-9) failures.push(`exempt ${k}: XFAIL FLIPPED — confidence ${s.confidence.toFixed(3)} no longer equals ${xfailEquals}'s ${other.toFixed(3)}. Some signal now tells them apart, which is what the exemption was waiting for. Drop the exemption; do not widen the list.`);
        }
      }
      continue;
    }
    // a refusal probe that TRACED is as wrong as a measurement can be — no SF
    // error is even defined for it, so it joins the inaccurate population on
    // its verdict alone, and a missing confidence is itself a failure
    if (s.expect === "refusal") {
      if (s.correctRefusal) continue;
      if (s.confidence == null) { failures.push(`${k}: traced a refusal probe and reports NO confidence — it cannot be gated`); continue; }
      inaccurate.push({ probe: k, confidence: s.confidence, why: `traced (${s.status}) where the answer key says refuse` });
      continue;
    }
    if (s.refused || s.sfErr == null || s.confidence == null) continue;   // no measurement to correlate
    if (s.sfErr > CONF_GATE.ceilSfErr) inaccurate.push({ probe: k, confidence: s.confidence, why: `SF error ${(s.sfErr * 100).toFixed(1)}%` });
    else if (s.sfErr <= CONF_GATE.floorSfErr) accurate.push({ probe: k, confidence: s.confidence });
  }

  // ── ceiling ──
  for (const p of inaccurate)
    if (p.confidence > CONF_GATE.ceilConf) failures.push(`${p.probe}: ${p.why} at confidence ${p.confidence.toFixed(2)} > ${CONF_GATE.ceilConf} — confidence is anti-correlated with error`);

  // ── floor ── explicit about the empty populations, because "no probes, so
  // no complaint" is how a gate becomes decorative.
  const minAccurate = accurate.length ? Math.min(...accurate.map((p) => p.confidence)) : undefined;
  const medianInaccurate = inaccurate.length ? median(inaccurate.map((p) => p.confidence)) : undefined;
  if (!accurate.length) {
    // FAILS. A corpus with nothing inside floorSfErr cannot demonstrate that
    // confidence tracks accuracy in the good direction, and passing here would
    // let the whole gate be disabled by deleting the accurate probes.
    failures.push(`confidence gate: NO probe scores within ${CONF_GATE.floorSfErr * 100}% SF error — the floor cannot be evaluated, so the gate is not satisfied. Restore an accurate probe or re-argue the gate.`);
  } else if (medianInaccurate === undefined) {
    // The relative floor has no reference population. Fall back to the
    // calibrated absolute floor and say so — do NOT skip the check.
    if (minAccurate! < CONF_GATE.floorAbs) failures.push(`confidence gate: no inaccurate probes to take a median of, so the ABSOLUTE floor applies: worst accurate probe ${minAccurate!.toFixed(2)} < ${CONF_GATE.floorAbs}`);
  } else {
    const need = medianInaccurate + CONF_GATE.floorMargin;
    for (const p of accurate)
      if (p.confidence < need) failures.push(`${p.probe}: accurate (≤ ${CONF_GATE.floorSfErr * 100}% SF) yet confidence ${p.confidence.toFixed(2)} < median-of-inaccurate ${medianInaccurate.toFixed(2)} + margin ${CONF_GATE.floorMargin} = ${need.toFixed(2)}`);
    if (minAccurate! < CONF_GATE.floorAbs) failures.push(`confidence gate: worst accurate probe ${minAccurate!.toFixed(2)} < calibrated absolute floor ${CONF_GATE.floorAbs}`);
  }
  return { accurate, inaccurate, exempt, medianInaccurate, minAccurate, failures };
}

export function aggregate(scores: ProbeScore[]): Aggregate {
  const gating = scores.filter((s) => !s.knownFail);
  const golden = gating.filter((s) => s.expect === "golden");
  const refuse = gating.filter((s) => s.expect === "refusal");
  const traced = golden.filter((s) => !s.refused);
  const ious = traced.map((s) => s.iou ?? 0);
  return {
    goldenProbes: golden.length,
    meanIoU: ious.length ? ious.reduce((a, b) => a + b, 0) / ious.length : 0,
    floorIoU: ious.length ? Math.min(...ious) : 0,
    refusalRate: golden.length ? golden.filter((s) => s.refused).length / golden.length : 0,
    leakRate: golden.length ? golden.filter((s) => s.leak).length / golden.length : 0,
    refusalProbes: refuse.length,
    correctRefusalRate: refuse.length ? refuse.filter((s) => s.correctRefusal).length / refuse.length : 1,
    knownFails: scores.filter((s) => s.knownFail).length,
  };
}

// ── #linear-takeoff (WP1.6) — manual-run scoring: parity, determinism, totals.
// Deliberately NOT the full run-recall/precision/Fréchet/vertex-F1 suite the
// goal document's §2 describes — that's WP3+'s trace-engine scoring, and has
// no meaning yet: manual mode never "finds" a run, a person/agent supplies
// its points outright, so there is nothing to score for recall against. What
// CAN regress in manual mode is covered here: canvas and MCP computing a
// different answer for the identical input (parity), the computed LF/size
// breakdown drifting from the geometry's own analytic truth (totals), and the
// answer changing under a lossless geometric transform of the same run
// (determinism) — rotating or translating a polyline must not move its LF by
// a hair, and scaling it must move LF by exactly that factor.

/** Deep-equality check for two ComputedRun reads of what should be the
 *  IDENTICAL run — canvas's own resolveRunSegments call and MCP's replied
 *  computed_run for the same points/scale/run block. Structural, not
 *  tolerance-based: these two are supposed to be the same object by
 *  construction (both are the one shared function), so ANY difference is a
 *  wiring bug (a size seeded differently, a system dropped, an index off by
 *  one) — never a rounding matter. */
export function scoreLinearParity(caseName: string, canvas: ComputedRun | null, mcp: ComputedRun | null): { caseName: string; ok: boolean; mismatch?: string } {
  if (!canvas || !mcp) {
    if (canvas === mcp) return { caseName, ok: true };
    return { caseName, ok: false, mismatch: "one side resolved a run and the other didn't" };
  }
  const a = JSON.stringify(canvas), b = JSON.stringify(mcp);
  if (a === b) return { caseName, ok: true };
  return { caseName, ok: false, mismatch: `canvas computed_run !== MCP computed_run: ${a} vs ${b}` };
}

/** LF total against the case's analytic truth (the same feet-coordinates the
 *  synthetic generator drew from) — errFt/errPct should read as pure
 *  round-to-cent noise, never a real measurement drift. */
export interface LinearTotalsRow { caseName: string; expectedLf: number; actualLf: number; errFt: number; errPct: number }
export function scoreLinearTotals(caseName: string, expectedLf: number, actualLf: number): LinearTotalsRow {
  const errFt = Math.abs(actualLf - expectedLf);
  return { caseName, expectedLf, actualLf, errFt, errPct: expectedLf > 0 ? errFt / expectedLf : 0 };
}

/** One determinism probe: the SAME run under a lossless transform of its own
 *  points (rotate/translate/reverse — LF unchanged; scale — LF scaled by the
 *  same factor). `expectedLf` is the untransformed case's own actual LF times
 *  `lfScale` (1 for rotate/translate/reverse, the scale factor otherwise). */
export interface LinearDeterminismRow { caseName: string; transform: string; expectedLf: number; actualLf: number; errFt: number }
export function scoreLinearDeterminism(caseName: string, transform: string, expectedLf: number, actualLf: number): LinearDeterminismRow {
  return { caseName, transform, expectedLf, actualLf, errFt: Math.abs(actualLf - expectedLf) };
}

export interface LinearAggregate {
  cases: number;
  parityFailures: number;
  maxTotalsErrFt: number;
  maxTotalsErrPct: number;
  maxDeterminismErrFt: number;
}
export function aggregateLinear(parity: Array<{ ok: boolean }>, totals: LinearTotalsRow[], determinism: LinearDeterminismRow[]): LinearAggregate {
  return {
    cases: totals.length,
    parityFailures: parity.filter((p) => !p.ok).length,
    maxTotalsErrFt: totals.length ? Math.max(...totals.map((t) => t.errFt)) : 0,
    maxTotalsErrPct: totals.length ? Math.max(...totals.map((t) => t.errPct)) : 0,
    maxDeterminismErrFt: determinism.length ? Math.max(...determinism.map((d) => d.errFt)) : 0,
  };
}

// ── #linear-takeoff WP3+ — trace-engine scoring (GATE 3). The goal
// document's own LINEAR BENCH instrument text names the exact method:
// "run recall / precision (discrete Frechet < 2 pt, length overlap >=
// 80%)". Distinct from everything above this comment (which scores
// MANUAL mode — a human/agent supplies the points outright, so there is
// nothing to "find"): this scores whether `trace_run`, given only a seed
// point, finds the SAME shape a human already traced.
//
// Fréchet distance needs both curves walked in a consistent direction —
// `trace_run` starts from wherever the seed happens to land and walks
// both ways, so its own polyline's direction relative to the golden's is
// arbitrary. `bestFrechetOverlap` below tries both orientations of the
// traced polyline and keeps whichever scores better, exactly the same
// "don't let an arbitrary convention fail an otherwise-correct answer"
// reasoning `walk.ts`'s own `segs` combination already applies elsewhere.
//
// A trace that ran LONGER than the golden (over-trace) must not itself
// fail Fréchet/overlap — that failure mode has its own separate metric
// (`overTracePct`, scoreLinearTraceRun below) by design, mirroring
// mep-trace-eval.mjs's own "reach accuracy, refusal correctness and
// false-confident rate scored apart from each other on purpose" doctrine.
// So the traced polyline is CLIPPED to the arc-length span between the
// golden's own two endpoints (each projected onto the trace) before
// Fréchet/overlap ever compares it to the golden — over-trace beyond
// that span is invisible to this pair of numbers on purpose.
import type { Point as GeoPoint } from "../src/lib/oneclick";

function polySegLen(a: GeoPoint, b: GeoPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

export function polylineLength(poly: GeoPoint[]): number {
  let s = 0;
  for (let i = 0; i < poly.length - 1; i++) s += polySegLen(poly[i], poly[i + 1]);
  return s;
}

/** Nearest point on polyline `poly` to `pt`, as an arc-length position
 *  from `poly`'s own start (0) — O(n) over its segments. */
export function projectOntoPolyline(pt: GeoPoint, poly: GeoPoint[]): { arcLen: number; at: GeoPoint; dist: number } {
  let best = { arcLen: 0, at: poly[0], dist: Infinity };
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const segLen = Math.hypot(dx, dy);
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, py = y1 + t * dy;
    const dist = Math.hypot(pt[0] - px, pt[1] - py);
    if (dist < best.dist) best = { arcLen: acc + t * segLen, at: [px, py], dist };
    acc += segLen;
  }
  return best;
}

/** The point on `poly` at arc-length `arcLen` from its own start, clamped
 *  to the polyline's own extent. */
function pointAtArcLen(poly: GeoPoint[], arcLen: number): GeoPoint {
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const segLen = polySegLen(poly[i], poly[i + 1]);
    if (arcLen <= acc + segLen || i === poly.length - 2) {
      const t = segLen ? Math.max(0, Math.min(1, (arcLen - acc) / segLen)) : 0;
      return [poly[i][0] + t * (poly[i + 1][0] - poly[i][0]), poly[i][1] + t * (poly[i + 1][1] - poly[i][1])];
    }
    acc += segLen;
  }
  return poly[poly.length - 1];
}

/** Sub-polyline of `poly` spanning arc-lengths [a, b] (a <= b), keeping
 *  every original vertex strictly inside that span so the clip's own
 *  shape (elbows included) survives, not just its two new endpoints. */
export function clipPolyline(poly: GeoPoint[], a: number, b: number): GeoPoint[] {
  const out: GeoPoint[] = [pointAtArcLen(poly, a)];
  let acc = 0;
  for (let i = 0; i < poly.length; i++) {
    if (acc > a && acc < b) out.push(poly[i]);
    if (i < poly.length - 1) acc += polySegLen(poly[i], poly[i + 1]);
  }
  out.push(pointAtArcLen(poly, b));
  return out;
}

/** Perpendicular distance from `p` to the infinite line through `a`-`b`
 *  (falls back to point-to-point distance when `a === b`). */
function perpDist(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (!len) return polySegLen(p, a);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
}

/** Douglas-Peucker simplification, iterative (an explicit stack, not
 *  recursion — same reasoning as discreteFrechet below: a long polyline
 *  must not be able to blow the call stack). Drops a vertex only when its
 *  own perpendicular deviation from the chord it sits on is <= `tolPx` —
 *  this exists because discrete Fréchet (below) is a per-VERTEX distance,
 *  not a per-CURVE one: a golden hand-authored as a straight 2-point run
 *  compared against a `trace_run` polyline that revisits the SAME straight
 *  line with several extra, functionally-redundant vertices (a fitting
 *  symbol's own tiny kinks, a snapped-grid rounding step) reads as a large
 *  "shape mismatch" under raw discreteFrechet even though the two curves
 *  are geometrically identical — the DP's own monotone correspondence has
 *  to walk through every extra vertex on the denser side before it can
 *  advance on the sparser one, and the worst intermediate gap becomes the
 *  reported distance. Simplifying both curves to their OWN true corners
 *  first (a small, fixed tolerance well under the recall gate's own 2px
 *  Fréchet threshold, so a genuine elbow is never mistaken for noise)
 *  removes that artifact without weakening what over-trace/shape-mismatch
 *  scoring is actually for. Caught measuring itd-p4-ea-duct-stub (GATE 3
 *  held-out tier, 2026-09-17): LF matched exactly (3.02→3.02) yet
 *  frechetPx read 9.2 — reproduced directly against `discreteFrechet`
 *  with the exact traced/golden points, confirmed as this artifact (not
 *  real engine noise), and fixed here rather than left as a documented,
 *  accepted "engine limitation" that this project's own methodology
 *  actually caused. */
export function simplifyPolyline(poly: GeoPoint[], tolPx: number): GeoPoint[] {
  if (poly.length < 3) return poly;
  const keep = new Uint8Array(poly.length);
  keep[0] = 1;
  keep[poly.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, poly.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    if (hi <= lo + 1) continue;
    let bestI = -1, bestD = tolPx;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(poly[i], poly[lo], poly[hi]);
      if (d > bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0) {
      keep[bestI] = 1;
      stack.push([lo, bestI], [bestI, hi]);
    }
  }
  return poly.filter((_, i) => keep[i]);
}

/** Discrete Fréchet distance (Eiter & Mannila 1994) between two point
 *  sequences — iterative bottom-up DP (not the textbook's own recursive
 *  form) so a long over-traced polyline can't stack-overflow this. */
export function discreteFrechet(a: GeoPoint[], b: GeoPoint[]): number {
  const n = a.length, m = b.length;
  if (!n || !m) return Infinity;
  const ca = new Float64Array(n * m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      const d = Math.hypot(a[i][0] - b[j][0], a[i][1] - b[j][1]);
      let v: number;
      if (i === 0 && j === 0) v = d;
      else if (i === 0) v = Math.max(ca[j - 1], d);
      else if (j === 0) v = Math.max(ca[(i - 1) * m], d);
      else v = Math.max(Math.min(ca[(i - 1) * m + j], ca[(i - 1) * m + j - 1], ca[i * m + j - 1]), d);
      ca[i * m + j] = v;
    }
  }
  return ca[n * m - 1];
}

export interface TraceShapeMatch {
  caseName: string;
  frechetPx: number;
  lengthOverlapPct: number;   // fraction of the golden's own length within `overlapTolPx` of the clipped trace
  clippedLenFt: number;
  goldenLenFt: number;
}

/** Scores how well a traced polyline reproduces a golden's own SHAPE over
 *  the golden's own span (see this section's header on why over-trace
 *  beyond that span is deliberately invisible here). Tries the traced
 *  polyline both forwards and reversed, keeping whichever orientation
 *  gives the smaller Fréchet distance — `trace_run`'s own walk direction
 *  relative to the golden's is arbitrary, not a real mismatch to penalize. */
// Well under the recall gate's own 2px Fréchet threshold, so a genuine
// elbow (a real perpendicular deviation an engineer would call a corner)
// is never simplified away — see simplifyPolyline's own header.
const SHAPE_SIMPLIFY_TOL_PX = 0.5;

export function scoreTraceShapeMatch(caseName: string, golden: GeoPoint[], traced: GeoPoint[], upp: number, overlapTolFt = 0.5): TraceShapeMatch {
  const p0 = projectOntoPolyline(golden[0], traced);
  const p1 = projectOntoPolyline(golden[golden.length - 1], traced);
  const a = Math.min(p0.arcLen, p1.arcLen), b = Math.max(p0.arcLen, p1.arcLen);
  const clipped = simplifyPolyline(clipPolyline(traced, a, b), SHAPE_SIMPLIFY_TOL_PX);
  const simplifiedGolden = simplifyPolyline(golden, SHAPE_SIMPLIFY_TOL_PX);
  const reversed = [...clipped].reverse();
  const frechetPx = Math.min(discreteFrechet(simplifiedGolden, clipped), discreteFrechet(simplifiedGolden, reversed));

  const overlapTolPx = overlapTolFt / (upp || 1);
  const samples = 50;
  const goldenLenPx = polylineLength(golden);
  let covered = 0;
  for (let i = 0; i <= samples; i++) {
    const at = pointAtArcLen(golden, (goldenLenPx * i) / samples);
    if (projectOntoPolyline(at, clipped).dist <= overlapTolPx) covered++;
  }
  return {
    caseName, frechetPx,
    lengthOverlapPct: covered / (samples + 1),
    clippedLenFt: round2(polylineLength(clipped) * upp),
    goldenLenFt: round2(goldenLenPx * upp),
  };
}
function round2(n: number): number { return Math.round(n * 100) / 100; }

export interface TraceRunRow {
  caseName: string;
  status: "reached" | "refused" | "error";
  reason?: string;
  goldenLf: number;
  tracedLf: number | null;
  lenErrPct: number | null;
  overTracePct: number;        // 0 unless the trace ran LONGER than the golden
  goldenSizeKey: string | null;
  tracedSizeKey: string | null;
  sizeMatch: boolean | null;   // null when the golden carries no size to check against
  shape?: TraceShapeMatch;
  buildMs?: number;            // present only on this sheet's FIRST trace_run call (cold: index build + query)
  queryMs?: number;            // present on every call — the warm-query component alone
}

/** recall: caseName counts as a HIT when reached AND Fréchet < frechetTolPx
 *  AND length overlap >= overlapPctMin — the goal doc's own "discrete
 *  Frechet < 2 pt, length overlap >= 80%" criterion, applied per case. */
export function scoreTraceRecall(rows: TraceRunRow[], frechetTolPx: number, overlapPctMin: number): { hits: number; total: number; recall: number; misses: TraceRunRow[] } {
  const misses: TraceRunRow[] = [];
  let hits = 0;
  for (const r of rows) {
    const hit = r.status === "reached" && r.shape != null && r.shape.frechetPx < frechetTolPx && r.shape.lengthOverlapPct >= overlapPctMin;
    if (hit) hits++; else misses.push(r);
  }
  return { hits, total: rows.length, recall: rows.length ? hits / rows.length : 0, misses };
}

/** precision: of the length actually WALKED, what fraction corresponds to
 *  the golden's own real path? A trace that wanders onto unrelated
 *  linework (the crossing-run precision case) or over-traces past the
 *  golden dilutes this; a clean, exact-length trace scores 1.0. Defined
 *  per case then length-weighted across cases (a 2 ft case's own noise
 *  should not swing the aggregate as hard as a 40 ft case's real drift). */
export function scoreTracePrecision(rows: TraceRunRow[]): number {
  const reached = rows.filter((r) => r.status === "reached" && r.tracedLf != null);
  if (!reached.length) return 0;
  let correctSum = 0, tracedSum = 0;
  for (const r of reached) {
    const correct = Math.min(r.goldenLf, r.tracedLf!);
    correctSum += correct;
    tracedSum += r.tracedLf!;
  }
  return tracedSum > 0 ? correctSum / tracedSum : 0;
}

export interface TraceAggregate {
  cases: number;
  recall: number;
  precision: number;
  maxLenErrPct: number;
  meanLenErrPct: number;
  maxOverTracePct: number;
  sizeAccuracyPct: number | null;      // length-weighted; null when no case carries a golden size
  // The plan's own §2 metric spec asks for "size accuracy (exact +
  // length-weighted, no-label vs wrong-label separated)" — a WRONG size
  // (trace_run bound something, just not the golden's own value) is a much
  // worse failure than NO size (trace_run correctly declined to guess, the
  // UI's own honest "size unknown, verify manually" state) — collapsing
  // both into one "not a match" bucket, as sizeAccuracyPct alone does,
  // hides that distinction. Both length-weighted over the same `sized`
  // population as sizeAccuracyPct; sizeAccuracyPct + sizeWrongLabelPct +
  // sizeNoLabelPct sum to 1 whenever sizeAccuracyPct is non-null.
  sizeWrongLabelPct: number | null;
  sizeNoLabelPct: number | null;
  maxColdBuildMs: number | null;
  maxWarmQueryMs: number | null;
}
export function aggregateTrace(rows: TraceRunRow[], frechetTolPx: number, overlapPctMin: number): TraceAggregate {
  const recall = scoreTraceRecall(rows, frechetTolPx, overlapPctMin);
  const precision = scoreTracePrecision(rows);
  const reached = rows.filter((r) => r.status === "reached");
  const lenErrs = reached.map((r) => r.lenErrPct).filter((x): x is number => x != null);
  const sized = reached.filter((r) => r.sizeMatch != null);
  const sizeWeightedOk = sized.reduce((a, r) => a + (r.sizeMatch ? r.goldenLf : 0), 0);
  const sizeWeightedNoLabel = sized.reduce((a, r) => a + (!r.sizeMatch && r.tracedSizeKey == null ? r.goldenLf : 0), 0);
  const sizeWeightedWrongLabel = sized.reduce((a, r) => a + (!r.sizeMatch && r.tracedSizeKey != null ? r.goldenLf : 0), 0);
  const sizeWeightedTotal = sized.reduce((a, r) => a + r.goldenLf, 0);
  const coldMs = rows.map((r) => r.buildMs).filter((x): x is number => x != null);
  const warmMs = rows.filter((r) => r.buildMs == null).map((r) => r.queryMs).filter((x): x is number => x != null);
  return {
    cases: rows.length,
    recall: recall.recall,
    precision,
    maxLenErrPct: lenErrs.length ? Math.max(...lenErrs) : 0,
    meanLenErrPct: lenErrs.length ? lenErrs.reduce((a, b) => a + b, 0) / lenErrs.length : 0,
    maxOverTracePct: reached.length ? Math.max(...reached.map((r) => r.overTracePct)) : 0,
    sizeAccuracyPct: sizeWeightedTotal > 0 ? sizeWeightedOk / sizeWeightedTotal : null,
    sizeWrongLabelPct: sizeWeightedTotal > 0 ? sizeWeightedWrongLabel / sizeWeightedTotal : null,
    sizeNoLabelPct: sizeWeightedTotal > 0 ? sizeWeightedNoLabel / sizeWeightedTotal : null,
    maxColdBuildMs: coldMs.length ? Math.max(...coldMs) : null,
    maxWarmQueryMs: warmMs.length ? Math.max(...warmMs) : null,
  };
}

// ── refusal correctness — a DIFFERENT question from recall/precision
// above (mirrors mep-trace-eval.mjs's own "reach accuracy, refusal
// correctness and false-confident rate scored apart from each other on
// purpose" doctrine): of the seeds a labeled negative corpus says should
// REFUSE (not on any real drawn duct/pipe linework at all), how many
// actually did, rather than confidently tracing something? This is the
// measurement docs/LINEAR-TRACE-EVAL.md's own "what this does not score"
// section named as missing — `scoreTracePrecision` above only ever sees
// cases seeded ON a real golden run, so it can never surface a seed that
// should have refused outright but didn't.
export interface RefusalRow {
  caseName: string;
  correct: boolean;      // true iff trace_run actually refused
  gotStatus: "refused" | "reached";
}
export function scoreRefusalCorrectness(rows: RefusalRow[]): { correct: number; total: number; rate: number; misses: RefusalRow[] } {
  const misses = rows.filter((r) => !r.correct);
  return { correct: rows.length - misses.length, total: rows.length, rate: rows.length ? (rows.length - misses.length) / rows.length : 0, misses };
}
