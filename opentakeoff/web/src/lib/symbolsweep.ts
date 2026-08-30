// Symbol Sweep — deterministic repeated-symbol matching (pure, no DOM;
// node-testable, the sheets.ts/oneclick.ts precedent).
//
// Plan symbols — drains, thresholds, fixtures, transition markers — are
// repeated vector blocks: the same little cluster of segments stamped across
// the sheet. Given ONE example instance (a marquee around it), find every
// other placement of that same cluster from the linework alone. No ML, no
// vision, no guessing: a placement either reproduces the seed's segments
// within a pixel tolerance or it doesn't, and the score says exactly how much
// of the seed it reproduced.
//
// The pipeline:
//   1. FINGERPRINT — the segments fully inside the seed rect, expressed
//      relative to their length-weighted centroid. Fully-inside, not
//      intersecting: a marquee around a drain must not drag in the wall run
//      passing behind it.
//   2. CANDIDATES — constellation anchoring. Sheets run 100k+ segments, so a
//      naive O(n·m) scan of every position is out. Instead, up to
//      ANCHOR_COUNT seed segments of DISTINCT quantized length (rarest
//      sheet-wide first — a rare length prunes hardest) each vote: every
//      sheet segment of matching length proposes the centroid the symbol
//      would have if that segment were this anchor, per symmetry transform.
//      Several anchors, deliberately: a placement stays discoverable even
//      when one of its segments is drawn perturbed (the near-miss case whose
//      whole point is to be REPORTED).
//   3. SCORE — for each candidate placement, each transformed seed segment
//      looks up a sheet segment whose endpoints both sit within tolPx (either
//      orientation) via an endpoint grid. Score = length-weighted fraction of
//      seed segments matched — a long wall-side matching counts more than a
//      tick mark.
//   4. CLASSIFY — score ≥ scoreHigh is a match; [scoreLow, scoreHigh) is a
//      WITHHELD near-match with a reason (a question the caller can answer
//      with a look, never a silent commit or a silent drop); below is not the
//      symbol. The seed's own location is reported separately and never
//      returned as a match.
//
// Symmetry: symbols rotate and flip on plans, so placements are searched
// under the square's symmetry group — 0/90/180/270 rotation × optional
// mirror — with both options ON by default and independently switchable.
//
// Work is CEILINGED and the ceiling is REPORTED: by default every proposed
// placement is scored (proposal enumeration is paid before the cap ever
// applied, so the cap only ever saved scoring time — #261 measured 19 of 62
// receptacles surviving a 20k cap that saved ~1 s), up to a hard ceiling for
// pathological sheets. `complete: false` plus candidates.dropped > 0 means
// some placements were never scored, and the caller is told rather than
// handed a silently truncated count (the sheet_context decimation doctrine).
//
// Phase 2 splits the pipeline at its natural seam: fingerprintSymbol (step 1)
// builds the centroid-relative fingerprint from ONE sheet's segments, and
// matchSymbol (steps 2–4) searches ANY sheet's segments for it — so a symbol
// marqueed on a detail or legend sheet can be counted across the plan sheets.
//
// Scale (#186). The fingerprint is size-true — translation plus the square
// symmetry group, no scaling — and the search stays that way: a scale SEARCH
// would trade exactness for guesses. But a detail sheet is drawn enlarged
// (1-1/2" = 1'-0" against a 1/8" plan is a 12× ratio), so a size-true search
// finds nothing there and, worse, finds it silently: no placement clears
// scoreLow, so zero matches with zero near-misses reads exactly like "that
// symbol isn't on these sheets." The fix is a STATED ratio, never a searched
// one — `opts.scale` is seed-sheet px per target-sheet px, which the caller
// computes from the two sheets' own committed scales (upp_seed / upp_target).
// One number, derived from data the estimator already stated. The endpoint
// test stays exactly as strict; tolerance rides the ratio only when the seed
// is being MAGNIFIED (its jitter magnifies with it), so scale ≤ 1 and the
// whole one-sheet surface are bit-for-bit unchanged.
//
// sweepSymbols composes the two on one sheet, unchanged.

export type Point = [number, number];

export interface SweepOptions {
  /** Also try 90/180/270 rotated placements (default true — symbols rotate on plans). */
  rotations?: boolean;
  /** Also try mirrored placements (default true). */
  mirror?: boolean;
  /** Endpoint match tolerance, image px (default 2 — CAD jitter, not drift). */
  tolPx?: number;
  /** Commit bar: score ≥ this is a match (default 0.92). */
  scoreHigh?: number;
  /** Withhold floor: [scoreLow, scoreHigh) is a reported near-match (default 0.75). */
  scoreLow?: number;
  /** Whole-symbol mode: demote richer-variant placements (extra linework past
   * SWEEP_EXTRA_MAX) to withheld instead of matching them with disclosure.
   * Default false — the contained-seed workflow (#259) depends on supersets
   * matching. Stands down when counter-examples are in play. */
  variantGuard?: boolean;
  /** Cap on scored placements (default SWEEP_CANDIDATE_CEILING — every
   * proposal is scored unless the sheet is pathological). Overflow is
   * counted in candidates.dropped and flips `complete` false, never silent. */
  maxCandidates?: number;
  /** The sheet's per-segment stroke luminance (#260), aligned to `segs`.
   * Carried through on its own; it gates NOTHING unless `lumTol` is stated. */
  lum?: Uint8Array;
  /** Stated luminance tolerance, 0–255: a sheet segment only answers for a
   * seed segment when their stroke luminances are within it (#260, reported by
   * @FrankAtGHub). Opt-in and disclosed, in the spirit of `tolPx` — a hidden
   * color heuristic would silently drop a symbol somebody redrew in a
   * different pen. The case it exists for is a flattened export where a black
   * fixture outline and a grey ceiling grid are geometrically identical: 0 vs
   * 219 is not a near miss, so a tolerance of 32–64 separates them without
   * touching anti-aliasing wobble. Ignored when no `lum` is supplied. */
  lumTol?: number;
  /** Counter-examples: rects around instances you do NOT mean (#259, reported
   * by @FrankAtGHub). The same gesture as the seed — drag a box around the
   * thing that is not it — and the engine works out WHY it is not it. See
   * `buildNegative` for the two mechanics and how the mode is inferred. Read
   * against the segments handed to THIS call; for a sweep that crosses sheets,
   * build them once on the seed sheet and pass `negatives` instead. */
  exclude?: Array<[Point, Point]>;
  /** Counter-examples already read (canonical frame) — the cross-sheet form of
   * `exclude`, scaled with the fingerprint when a size ratio applies. */
  negatives?: SymbolNegative[];
}

export interface SweepMatch {
  /** The placed symbol's centroid, image px. */
  at: Point;
  /** Length-weighted fraction of seed segments matched, 0..1. */
  score: number;
  /** Detected rotation, degrees CW in image space (y down): 0 | 90 | 180 | 270. */
  rotation: number;
  mirrored: boolean;
  /** SWEEP_EXTRA_MAX disclosure: present when the placement carries more than
   * the bar in UNMATCHED extra linework (fraction of the seed's total length)
   * — a richer-variant suspect. On a match row it says LOOK AT THIS ONE FIRST;
   * under variantGuard such placements demote to withheld instead. */
  extra?: number;
}

export interface SweepWithheld extends SweepMatch {
  reason: string;
}

/** A placement a counter-example rejected (#259). Disclosed the way `withheld`
 * is — with the negative that did it and what it saw — because an exclusion is
 * a judgement and judgements get revised: everything needed to reinstate it by
 * hand is here, without re-running the sweep. */
export interface SweepRejected extends SweepMatch {
  /** Index into the `exclude` array — which counter-example rejected it. */
  by: number;
  /** "shape": the negative's extra linework is present here. "crossing": a
   * line the negative sits ON runs through this placement unbroken. */
  mode: "shape" | "crossing";
  /** Fraction of that negative's discriminating evidence found here, 0..1. */
  evidence: number;
  reason: string;
}

export interface SweepResult {
  seed: {
    /** Segments the fingerprint was built from (fully inside the rect). */
    segments: number;
    /** The seed instance's own centroid, image px — reported, never a match. */
    center: Point;
    /** Total seed linework length, image px. */
    length_px: number;
  };
  matches: SweepMatch[];
  withheld: SweepWithheld[];
  /** Work accounting: dropped > 0 means the candidate ceiling bit and some
   * placements were never scored — the caller must be told. */
  candidates: { considered: number; dropped: number };
  /** True when every proposed placement was scored — the count is a total.
   * False means the ceiling bit: the count is a FLOOR, not a total (#261). */
  complete: boolean;
  /** Placements a counter-example rejected (#259) — named, with which negative
   * did it and what it saw, so an exclusion can be revised without re-running
   * the sweep. Empty when no counter-example was given. */
  rejected: SweepRejected[];
  /** What each counter-example was read AS (#259), in `exclude` order: the
   * mechanic inferred from the rect's own contents, how much discriminating
   * linework it carries, and where the engine found the instance it aligned
   * to. A negative that read as nothing usable is reported null — silence
   * there would look like a negative that simply never fired. */
  negatives?: Array<{ mode: "shape" | "crossing"; segments: number; center: Point } | null>;
  /** The stated luminance gate and what it cost, when one was applied (#260):
   * every placement the geometry would have committed and the pen did not,
   * named — a rejection is a question answered, and the caller can look. */
  lum_gate?: { tol: number; seed_lum: number[]; rejected: number; at: Point[] };
}

export const SWEEP_TOL_PX = 2;
export const SWEEP_SCORE_HIGH = 0.92;
export const SWEEP_SCORE_LOW = 0.75;
/** The richer-variant bar (field report: grilles / vents / registers
 * confused). Recall alone cannot tell a symbol from a RICHER variant: a
 * supply register is a grille plus louver lines, so against a grille seed it
 * reproduces 100% of the seed's linework and reads as a match. Extra ink is
 * measured as the fraction of the seed's total length found UNMATCHED inside
 * the placement's footprint (fully inside, so a background run crossing the
 * symbol never counts against it — and coincident duplicate ink matches the
 * seed, so fill-and-stroke pairs and abutting tiles never count either).
 *
 * Two modes, because the same geometry carries opposite intents:
 * — DISCLOSURE (default): matches stand — #259's contained-seed workflow
 *   (seed a bare sub-shape, count the richer symbols that contain it, then
 *   exclude what you don't mean) depends on supersets matching — but every
 *   match past this bar carries its measured `extra` fraction, so a mislabel
 *   is named on the row instead of hiding in the count.
 * — GUARD (variantGuard: true): a whole-symbol workflow — such placements
 *   demote to withheld with the variant reason, Spline's behavior (where
 *   this term shipped first). The guard stands down when counter-examples
 *   are in play: supplying negatives IS manual variant discrimination. */
export const SWEEP_EXTRA_MAX = 0.30;
/** Hard ceiling on scored placements. Proposals are fully enumerated before
 * this ever applies, so it bounds SCORING time only — measured ~1.6 s at 87.5k
 * on a 50k-segment sheet (#261), so the ceiling costs single-digit seconds at
 * worst. It exists for pathological sheets, not as a tuning knob: small dense
 * device symbols (short, common segment lengths — most of an electrical sheet)
 * legitimately propose ~90k placements, and the old 20k default silently hid
 * 43 of 62 receptacles behind a plausible-looking count. */
export const SWEEP_CANDIDATE_CEILING = 250000;
/** Distinct-length anchors used for candidate generation. Three means a
 * placement survives discovery even with one perturbed segment — the
 * near-miss band exists to be populated, and a single anchor would hide
 * exactly the placements it is supposed to report. */
export const ANCHOR_COUNT = 3;
/** Seed segments shorter than this (px) are dropped from the fingerprint —
 * sub-pixel specks can't be matched at any honest tolerance. */
const MIN_SEG_LEN = 0.5;
/** A marquee holding more segments than this is not one symbol instance. */
const MAX_SEED_SEGS = 2000;
/** Stated size ratios outside this band say the two sheets disagree by more
 * than any real drawing set does — 64× is already past a full-size detail
 * against a 1/16" plan — so the likelier reading is a wrong `set_scale` on one
 * of them than a genuine ratio. Refused rather than swept. */
export const SWEEP_MIN_SCALE = 1 / 64;
export const SWEEP_MAX_SCALE = 64;
/** A scaled-down symbol must still be this many tolerance balls across, or
 * "matching" degenerates: every tolerance ball covers the whole symbol and
 * anything scores. The refusal is the honest answer — the detail is drawn too
 * large relative to the plan for its linework to survive the trip. */
const MIN_FOOTPRINT_TOLS = 6;

interface Xform { rotation: number; mirrored: boolean; m: [number, number, number, number]; }

/** The symmetry transforms to search, deterministic order: unmirrored
 * rotations first, 0° first — ties in dedupe resolve toward the plainest
 * reading. Matrices act on centroid-relative coords in image space (y down);
 * rotation is CW degrees in that frame. */
function transformsFor(rotations: boolean, mirror: boolean): Xform[] {
  const rots: [number, [number, number, number, number]][] = [
    [0, [1, 0, 0, 1]], [90, [0, -1, 1, 0]], [180, [-1, 0, 0, -1]], [270, [0, 1, -1, 0]],
  ];
  const use = rotations ? rots : rots.slice(0, 1);
  const out: Xform[] = use.map(([rotation, m]) => ({ rotation, mirrored: false, m }));
  if (mirror) {
    // reflect x, then rotate: m' = R · diag(-1, 1)
    for (const [rotation, m] of use) out.push({ rotation, mirrored: true, m: [-m[0], m[1], -m[2], m[3]] });
  }
  return out;
}

const apply = (m: [number, number, number, number], x: number, y: number): Point =>
  [m[0] * x + m[1] * y, m[2] * x + m[3] * y];

/** m ∘ t — apply t first, then m. Both are orthogonal 2×2s from transformsFor. */
const compose = (m: [number, number, number, number], t: [number, number, number, number]): [number, number, number, number] =>
  [m[0] * t[0] + m[1] * t[2], m[0] * t[1] + m[1] * t[3], m[2] * t[0] + m[3] * t[2], m[2] * t[1] + m[3] * t[3]];

/** Endpoint spatial hash over the sheet's segments: cell → segment indices
 * with an endpoint in that cell. Cell size ≥ 2×tol so a tolerance ball around
 * any query point is covered by the 3×3 cell neighborhood. */
class EndpointGrid {
  private cells = new Map<number, number[]>();
  private cell: number;
  constructor(private segs: number[], tol: number) {
    this.cell = Math.max(2 * tol, 4);
    const n = segs.length >> 2;
    for (let i = 0; i < n; i++) {
      this.add(segs[i * 4], segs[i * 4 + 1], i);
      this.add(segs[i * 4 + 2], segs[i * 4 + 3], i);
    }
  }
  private key(cx: number, cy: number): number { return cx * 73856093 ^ cy * 19349663; }
  /** Segment indices with an endpoint anywhere in the rect (deduped) — the
   * SWEEP_EXTRA_MAX footprint query; any segment FULLY inside the rect
   * necessarily has both endpoints in covered cells. */
  nearRect(x0: number, y0: number, x1: number, y1: number): Set<number> {
    const out = new Set<number>();
    const c0x = Math.floor(x0 / this.cell), c1x = Math.floor(x1 / this.cell);
    const c0y = Math.floor(y0 / this.cell), c1y = Math.floor(y1 / this.cell);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const a = this.cells.get(this.key(cx, cy));
      if (a) for (const i of a) out.add(i);
    }
    return out;
  }
  private add(x: number, y: number, i: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const a = this.cells.get(k);
    if (a) { if (a[a.length - 1] !== i) a.push(i); } else this.cells.set(k, [i]);
  }
  /** Indices of segments with an endpoint within one cell of (x, y). */
  near(x: number, y: number, out: number[]): number[] {
    out.length = 0;
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = this.cells.get(this.key(cx + dx, cy + dy));
      if (a) for (const i of a) out.push(i);
    }
    return out;
  }
}

const segLen = (segs: number[], i: number): number =>
  Math.hypot(segs[i * 4 + 2] - segs[i * 4], segs[i * 4 + 3] - segs[i * 4 + 1]);

/** Immutable-sheet acceleration shared by every fingerprint swept against the
 * same extracted geometry. A project takeoff can call matchSymbol hundreds of
 * times per plan sheet; rebuilding the length histogram and endpoint hash for
 * every equipment row is identical O(sheet segments) work each time.
 *
 * Geometry arrays are immutable after extraction and identity-stable in both
 * the browser and MCP Session. Weak keys release the index with the geometry,
 * so this adds no document-lifetime leak. Endpoint grids depend on tolerance
 * (cross-scale sweeps can change it); cap variants per sheet so pathological
 * scale metadata cannot grow an unbounded cache. */
interface SheetMatchIndex {
  lengths: Float64Array;
  lenBucket: Map<number, number[]>;
  endpointGrids: Map<number, EndpointGrid>;
}

const MAX_TOLERANCE_INDEXES_PER_SHEET = 8;
const sheetMatchIndexes = new WeakMap<number[], SheetMatchIndex>();

function sheetMatchIndex(segs: number[], tol: number): SheetMatchIndex & { grid: EndpointGrid } {
  let cached = sheetMatchIndexes.get(segs);
  if (!cached) {
    const n = segs.length >> 2;
    const lengths = new Float64Array(n);
    const lenBucket = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
      const length = segLen(segs, i);
      lengths[i] = length;
      const bucket = Math.round(length);
      const entries = lenBucket.get(bucket);
      if (entries) entries.push(i);
      else lenBucket.set(bucket, [i]);
    }
    cached = { lengths, lenBucket, endpointGrids: new Map() };
    sheetMatchIndexes.set(segs, cached);
  }
  let grid = cached.endpointGrids.get(tol);
  if (!grid) {
    grid = new EndpointGrid(segs, tol);
    if (cached.endpointGrids.size < MAX_TOLERANCE_INDEXES_PER_SHEET) {
      cached.endpointGrids.set(tol, grid);
    }
  }
  return { ...cached, grid };
}

/** A symbol's fingerprint, detached from the sheet it was marqueed on:
 * centroid-relative segments plus the diagnostics every consumer reports.
 * Pure data — matchSymbol can run it against any sheet's segments. */
export interface SymbolFingerprint {
  /** Centroid-relative seed segments: [ax, ay, bx, by, len] per entry. */
  rel: number[][];
  /** Total seed linework length, px. */
  totalLen: number;
  /** Seed segment count. */
  segments: number;
  /** The seed instance's own length-weighted centroid, SOURCE-sheet image px
   * — meaningful only on the sheet the fingerprint was built from. */
  center: Point;
  /** Diagonal of the seed's tight bbox, px — the symbol's physical footprint.
   * Half of it is the shadow-suppression radius: two REAL instances can never
   * sit closer without physically overlapping. */
  footprint: number;
  /** Per-rel-entry stroke luminance, 0–255, when the caller handed in the
   * sheet's `lum` channel (#260). Only consulted when a luminance tolerance is
   * STATED — see MatchOptions.lumTol. */
  lum?: number[];
  /** Seed segments that fell below MIN_SEG_LEN when the fingerprint was scaled
   * down to a target sheet — detail that cannot survive the trip and is
   * excluded from the score rather than depressing it. Present only on a
   * scaled fingerprint, and only when something was actually dropped: the
   * caller discloses it, because "matched 100% of what was left" is a
   * different claim from "matched 100% of the symbol". */
  subPixelDropped?: number;
}

export interface SymbolMatchResult {
  matches: SweepMatch[];
  withheld: SweepWithheld[];
  candidates: { considered: number; dropped: number };
  /** True when every proposed placement was scored — the count is a total.
   * False means the ceiling bit: the count is a FLOOR, not a total (#261). */
  complete: boolean;
  /** Present ONLY when a stated ratio ≠ 1 was applied (#186), so a same-scale
   * result is the same object it always was. What the ratio cost, so the
   * caller can disclose it: the searched-for symbol's size on the target
   * sheet, how many seed segments went sub-pixel getting there, and the
   * tolerance the endpoints were actually tested at. */
  scaled?: { ratio: number; segments: number; sub_pixel_dropped: number; footprint_px: number; tol_px: number };
  /** Placements a counter-example rejected (#259) — named, with the negative
   * that did it and what it saw, so an exclusion can be revised without
   * re-running the sweep. Empty when no counter-example was given. */
  rejected: SweepRejected[];
  /** What each counter-example was read as, in `exclude` order (#259) — the
   * mechanic inferred from the rect's own contents. null means the rect held
   * nothing usable, which is a report, not a silence. */
  negatives?: Array<{ mode: "shape" | "crossing"; segments: number; center: Point } | null>;
  /** Present ONLY when a luminance tolerance was stated and the sheet supplied
   * the channel (#260). What the gate was and what it cost: the seed's own
   * luminance band, and how many placements it pulled under the commit bar —
   * a stated gate that removes 152 matches has to say so. */
  lum_gate?: { tol: number; seed_lum: number[]; rejected: number; at: Point[] };
}

export interface MatchOptions extends SweepOptions {
  /** Suppress placements within half a footprint of this point — the seed's
   * own location when matching the sheet it was marqueed on. Omit when the
   * fingerprint came from a DIFFERENT sheet: there is no seed here to shadow. */
  excludeCenter?: Point;
  /** Stated seed→target size ratio: seed-sheet image px per target-sheet image
   * px, i.e. `upp_seed / upp_target` (#186). Default 1 — the same-scale case,
   * bit-for-bit the pre-#186 search. A symbol marqueed on a 1-1/2" = 1'-0"
   * detail and swept across a 1/8" plan passes ~1/12. NEVER searched: the
   * caller states it from two committed scales or doesn't sweep across them. */
  scale?: number;
  /** Richer-variant bar (default SWEEP_EXTRA_MAX): a high-recall placement
   * whose footprint carries more than this fraction of unmatched extra
   * linework demotes to withheld with the variant reason. */
  extraMax?: number;
  /** Optional exact search windows for callers whose result can only use
   * placements near known points (schedule-row evaluation is one such
   * caller: a counted marker must claim that row's own drawn tag).
   *
   * This is a work bound, not a scoring heuristic. Candidate centroids
   * outside every window are omitted before scoring; candidates inside are
   * generated and scored identically to an unrestricted sweep. Normal
   * interactive symbol_sweep calls leave this unset and retain the complete
   * whole-sheet search. */
  candidateRegions?: Array<{ center: Point; radius: number }>;
}

/** A fingerprint resized by a stated ratio, for matching against a sheet drawn
 * at a different scale (#186). Pure and separately testable.
 *
 * Sub-pixel casualties are real and are dropped, not carried: a seed segment
 * that scales below MIN_SEG_LEN cannot be matched at any honest tolerance, so
 * leaving it in `totalLen` would permanently depress every score on that sheet
 * and push real instances under the commit bar. `totalLen` is recomputed over
 * the survivors and the count of the fallen rides `subPixelDropped` — the
 * score stays a truthful fraction of what was actually searched for, and the
 * caller can say so. */
export function scaleFingerprint(fp: SymbolFingerprint, k: number): SymbolFingerprint {
  if (!Number.isFinite(k) || !(k > 0)) {
    throw new Error(`Size ratio must be a positive, finite number (seed-sheet px per target-sheet px) — got ${k}.`);
  }
  if (k === 1) return fp;
  if (k < SWEEP_MIN_SCALE || k > SWEEP_MAX_SCALE) {
    throw new Error(`Size ratio ${k.toFixed(4)} is outside the sane band (${SWEEP_MIN_SCALE} – ${SWEEP_MAX_SCALE}) — that is a larger disagreement than any real sheet pair, so the likelier cause is a wrong scale on one of the two sheets. Check set_scale on both before sweeping across them.`);
  }
  const rel: number[][] = [];
  const lum: number[] = [];
  let totalLen = 0;
  let subPixelDropped = 0;
  for (let i = 0; i < fp.rel.length; i++) {
    const r = fp.rel[i];
    const len = r[4] * k;
    if (len < MIN_SEG_LEN) { subPixelDropped++; continue; }
    rel.push([r[0] * k, r[1] * k, r[2] * k, r[3] * k, len]);
    if (fp.lum) lum.push(fp.lum[i]);
    totalLen += len;
  }
  if (!rel.length) {
    throw new Error(`At a ${k.toFixed(4)} size ratio every segment of this symbol falls below ${MIN_SEG_LEN} px on the target sheet — there is no linework left to match. Marquee an instance drawn on the target sheet itself.`);
  }
  return {
    rel,
    totalLen,
    segments: rel.length,
    center: fp.center,
    footprint: fp.footprint * k,
    ...(fp.lum ? { lum } : {}),
    ...(subPixelDropped ? { subPixelDropped } : {}),
  };
}

/** Step 1 alone: the segments fully inside the seed rect, expressed relative
 * to their length-weighted centroid. Throws the same instructive refusals
 * sweepSymbols always has (empty marquee, region-sized marquee). */
export function fingerprintSymbol(segs: number[], seedRect: [Point, Point], lum?: Uint8Array): SymbolFingerprint {
  const rx0 = Math.min(seedRect[0][0], seedRect[1][0]), rx1 = Math.max(seedRect[0][0], seedRect[1][0]);
  const ry0 = Math.min(seedRect[0][1], seedRect[1][1]), ry1 = Math.max(seedRect[0][1], seedRect[1][1]);

  const inside = (x: number, y: number): boolean => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1;
  const seedIdx: number[] = [];
  // A fully-contained segment necessarily has an endpoint in one of the
  // rectangle's endpoint-index cells. Query that immutable sheet index
  // instead of rescanning 100k+ segments for every pad/anchor attempt in a
  // schedule-row evaluation. Sort to retain the original segment-order
  // fingerprint exactly.
  const candidates = [...sheetMatchIndex(segs, SWEEP_TOL_PX).grid.nearRect(rx0, ry0, rx1, ry1)].sort((a, b) => a - b);
  for (const i of candidates) {
    if (inside(segs[i * 4], segs[i * 4 + 1]) && inside(segs[i * 4 + 2], segs[i * 4 + 3]) && segLen(segs, i) >= MIN_SEG_LEN) {
      seedIdx.push(i);
    }
  }
  if (!seedIdx.length) {
    throw new Error("No vector segments sit fully inside the seed rect — marquee tightly around one whole symbol instance (segments crossing the rect edge don't count as the symbol).");
  }
  if (seedIdx.length > MAX_SEED_SEGS) {
    throw new Error(`The seed rect holds ${seedIdx.length} segments — that is a region, not one symbol instance. Marquee a single symbol.`);
  }

  let totalLen = 0, cxw = 0, cyw = 0;
  for (const i of seedIdx) {
    const L = segLen(segs, i);
    totalLen += L;
    cxw += ((segs[i * 4] + segs[i * 4 + 2]) / 2) * L;
    cyw += ((segs[i * 4 + 1] + segs[i * 4 + 3]) / 2) * L;
  }
  const seedCx = cxw / totalLen, seedCy = cyw / totalLen;
  // centroid-relative seed segments: [ax, ay, bx, by, len] per entry
  const rel = seedIdx.map((i) => [
    segs[i * 4] - seedCx, segs[i * 4 + 1] - seedCy,
    segs[i * 4 + 2] - seedCx, segs[i * 4 + 3] - seedCy,
    segLen(segs, i),
  ]);
  // the symbol's own footprint (tight bbox over the seed segments) — the
  // shadow-suppression radius in matchSymbol is half its diagonal
  let sbx0 = Infinity, sby0 = Infinity, sbx1 = -Infinity, sby1 = -Infinity;
  for (const i of seedIdx) {
    sbx0 = Math.min(sbx0, segs[i * 4], segs[i * 4 + 2]); sby0 = Math.min(sby0, segs[i * 4 + 1], segs[i * 4 + 3]);
    sbx1 = Math.max(sbx1, segs[i * 4], segs[i * 4 + 2]); sby1 = Math.max(sby1, segs[i * 4 + 1], segs[i * 4 + 3]);
  }
  return {
    rel,
    totalLen,
    segments: seedIdx.length,
    center: [seedCx, seedCy],
    footprint: Math.hypot(sbx1 - sbx0, sby1 - sby0),
    ...(lum && lum.length ? { lum: seedIdx.map((i) => lum[i] ?? 0) } : {}),
  };
}

// ── counter-examples ────────────────────────────────────────────────────────
// #259, reported by @FrankAtGHub, from counting a wall-mounted data outlet on
// an electrical set: the flush-floor variant of the same device is the SAME
// TRIANGLE inside a square, so it contains the wall symbol by drafting
// convention and matches on every sheet drawn that way. Asking drafting
// offices to stop reusing generic shapes is not a remedy — the matcher has to
// absorb the ambiguity.
//
// A negative is one more marquee: drag a box around the thing you do not mean.
// The caller never chooses a mechanism; the rect's own contents decide which
// of the two applies, because both are the same gesture to the person doing
// it.
//
//   SHAPE — the negative holds extra linework the positive does not (the
//   square around the flush outlet, the letter inside a keynote triangle).
//   The discriminator is local, so it fingerprints exactly like a positive.
//
//   CROSSING — the negative holds NO extra contained linework; what
//   distinguishes it is a line that passes THROUGH it. This mode exists
//   because `fingerprintSymbol` admits only segments FULLY INSIDE the rect,
//   which structurally excludes background structure — background structure
//   is long by nature. Frank's measured case: a 2×4 ceiling fixture on a 2 ft
//   grid, where two empty tiles reproduce the fixture's outline exactly. The
//   empty tile still has the grid line running through its middle at 337 px;
//   the real fixture, drawn over the grid, BREAKS it. A clean presence/absence
//   discriminator that no contained fingerprint can express.
//
// Both are expressed in the POSITIVE's canonical frame, so a rejection applies
// under every rotation and mirror the sweep searches.

/** Evidence bar: a placement is rejected when this fraction of the negative's
 * discriminating linework (by length) is present at it. Half is the honest
 * reading of "the negative explains this placement at least as well" — a
 * lookalike carries the whole feature or none of it, and demanding all of it
 * would let one clipped segment reinstate a phantom. */
export const EXCLUDE_EVIDENCE_BAR = 0.5;

/** A negative resized for a target sheet drawn at another scale (#186's rule
 * applied to #259's counter-examples): sub-pixel casualties are dropped rather
 * than carried, so the evidence fraction stays a truthful fraction of what was
 * actually searched for. */
export function scaleNegative(neg: SymbolNegative, k: number): SymbolNegative {
  if (k === 1) return neg;
  const rel: number[][] = [];
  for (const r of neg.rel) {
    const len = r[4] * k;
    if (len < MIN_SEG_LEN) continue;
    rel.push([r[0] * k, r[1] * k, r[2] * k, r[3] * k, len]);
  }
  return { mode: neg.mode, rel, totalLen: rel.reduce((t, r) => t + r[4], 0), center: neg.center };
}

export interface SymbolNegative {
  mode: "shape" | "crossing";
  /** Discriminating segments in the POSITIVE's canonical frame:
   * [ax, ay, bx, by, len] — contained extras (shape) or rect-clipped
   * crossings (crossing). */
  rel: number[][];
  totalLen: number;
  /** The negative instance's own centroid on the seed sheet — reported so a
   * caller can show what it read. */
  center: Point;
}

/** Cell index over segment BODIES — the endpoint hash cannot answer "is a
 * long line running through here", because a 337 px grid line's endpoints are
 * nowhere near the symbol it crosses. Built lazily, and only when a crossing
 * negative is in play. */
class BodyGrid {
  private cells = new Map<number, number[]>();
  constructor(private segs: number[], private cell: number) {
    const n = segs.length >> 2;
    for (let i = 0; i < n; i++) {
      const ax = segs[i * 4], ay = segs[i * 4 + 1], bx = segs[i * 4 + 2], by = segs[i * 4 + 3];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / cell));
      let last = -1;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const key = this.key(Math.floor((ax + (bx - ax) * t) / cell), Math.floor((ay + (by - ay) * t) / cell));
        if (key === last) continue;
        last = key;
        const a = this.cells.get(key);
        if (a) { if (a[a.length - 1] !== i) a.push(i); } else this.cells.set(key, [i]);
      }
    }
  }
  private key(cx: number, cy: number): number { return cx * 73856093 ^ cy * 19349663; }
  /** Segment indices whose body passes through the cell holding (x, y) or any neighbour. */
  near(x: number, y: number): number[] {
    const out: number[] = [];
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const a = this.cells.get(this.key(cx + dx, cy + dy));
      if (a) for (const i of a) if (!out.includes(i)) out.push(i);
    }
    return out;
  }
}

/** Clip a segment to a rect (Liang–Barsky), or null when it misses. */
function clipToRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) { if (q[k] < 0) return null; continue; }
    const r = q[k] / p[k];
    if (p[k] < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
    else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
}

/** Distance from (px,py) to the segment (ax,ay)-(bx,by). */
function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Read one counter-example rect into a negative, in the positive's frame.
 *
 * Alignment first: the negative is an instance of the positive PLUS whatever
 * makes it not one, so the positive is located inside the rect (best scoring
 * placement whose centroid lands there) and everything is expressed relative
 * to THAT placement. Without this step a negative marqueed at a different
 * rotation, or a few px off-centre, would describe geometry that never lines
 * up with a candidate.
 *
 * Returns null when the rect holds no recognisable instance of the positive
 * (nothing to subtract from — the caller refuses rather than guessing) or when
 * it holds no discriminating geometry at all (a negative identical to the
 * positive would reject every real match).
 */
export function buildNegative(fp: SymbolFingerprint, segs: number[], rect: [Point, Point], opts: MatchOptions = {}): SymbolNegative | null {
  const tol = opts.tolPx ?? SWEEP_TOL_PX;
  const rx0 = Math.min(rect[0][0], rect[1][0]), rx1 = Math.max(rect[0][0], rect[1][0]);
  const ry0 = Math.min(rect[0][1], rect[1][1]), ry1 = Math.max(rect[0][1], rect[1][1]);
  const pad = fp.footprint + 4 * tol;
  // work against the rect's neighbourhood only: alignment is a local question
  const localIdx: number[] = [];
  const local: number[] = [];
  const n = segs.length >> 2;
  for (let i = 0; i < n; i++) {
    const ax = segs[i * 4], ay = segs[i * 4 + 1], bx = segs[i * 4 + 2], by = segs[i * 4 + 3];
    if (Math.max(ax, bx) < rx0 - pad || Math.min(ax, bx) > rx1 + pad) continue;
    if (Math.max(ay, by) < ry0 - pad || Math.min(ay, by) > ry1 + pad) continue;
    localIdx.push(i);
    local.push(ax, ay, bx, by);
  }
  if (!local.length) return null;

  // align: score the positive against the neighbourhood and keep the best
  // placement centred inside the rect
  const aligned = matchSymbol(fp, local, {
    rotations: opts.rotations ?? true,
    mirror: opts.mirror ?? true,
    tolPx: tol,
    scoreHigh: 1.01,          // classify nothing; we only want the scored list
    scoreLow: 0.5,
  });
  const inRect = aligned.withheld.filter((w) => w.at[0] >= rx0 && w.at[0] <= rx1 && w.at[1] >= ry0 && w.at[1] <= ry1);
  if (!inRect.length) return null;
  const best = inRect.reduce((a, b) => (b.score > a.score ? b : a));
  const xf = transformsFor(opts.rotations ?? true, opts.mirror ?? true)
    .find((x) => x.rotation === best.rotation && x.mirrored === best.mirrored);
  if (!xf) return null;
  // canonical frame: undo the negative instance's own placement. The
  // transforms are orthogonal, so the inverse is the transpose.
  const inv: [number, number, number, number] = [xf.m[0], xf.m[2], xf.m[1], xf.m[3]];
  const toCanon = (x: number, y: number): Point => apply(inv, x - best.at[0], y - best.at[1]);

  // which local segments the positive already explains at that placement
  const explained = new Set<number>();
  for (const r of fp.rel) {
    const a = apply(xf.m, r[0], r[1]);
    const b = apply(xf.m, r[2], r[3]);
    const ax = a[0] + best.at[0], ay = a[1] + best.at[1], bx = b[0] + best.at[0], by = b[1] + best.at[1];
    for (let k = 0; k < localIdx.length; k++) {
      const px = local[k * 4], py = local[k * 4 + 1], qx = local[k * 4 + 2], qy = local[k * 4 + 3];
      const hit = (Math.hypot(px - ax, py - ay) <= tol && Math.hypot(qx - bx, qy - by) <= tol)
        || (Math.hypot(qx - ax, qy - ay) <= tol && Math.hypot(px - bx, py - by) <= tol);
      // no break: EVERY local segment the positive explains is explained.
      // Drafting duplicates coincident linework constantly — adjacent ceiling
      // tiles each draw the edge they share — and stopping at the first hit
      // would leave the twin looking like extra evidence, which flips the
      // inferred mode and turns a background line into a "shape" negative.
      if (hit) explained.add(k);
    }
  }

  const inside = (x: number, y: number): boolean => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1;
  const extras: number[][] = [];
  const crossings: number[][] = [];
  for (let k = 0; k < localIdx.length; k++) {
    if (explained.has(k)) continue;
    const ax = local[k * 4], ay = local[k * 4 + 1], bx = local[k * 4 + 2], by = local[k * 4 + 3];
    const L = Math.hypot(bx - ax, by - ay);
    if (L < MIN_SEG_LEN) continue;
    if (inside(ax, ay) && inside(bx, by)) {
      const a = toCanon(ax, ay), b = toCanon(bx, by);
      extras.push([a[0], a[1], b[0], b[1], L]);
    } else {
      const c = clipToRect(ax, ay, bx, by, rx0, ry0, rx1, ry1);
      // a crossing must genuinely PASS THROUGH: a stub poking into the rect is
      // an alignment artifact, not background structure
      if (c && Math.hypot(c[2] - c[0], c[3] - c[1]) >= 2 * tol && L > fp.footprint) {
        const a = toCanon(c[0], c[1]), b = toCanon(c[2], c[3]);
        crossings.push([a[0], a[1], b[0], b[1], Math.hypot(c[2] - c[0], c[3] - c[1])]);
      }
    }
  }
  // Contained extras win where they exist: they are local evidence, and a
  // symbol that carries its own distinguishing mark should not be judged by
  // what happens to run past it.
  const rel = extras.length ? extras : crossings;
  if (!rel.length) return null;
  return {
    mode: extras.length ? "shape" : "crossing",
    rel,
    totalLen: rel.reduce((t, r) => t + r[4], 0),
    center: [Math.round(best.at[0] * 10) / 10, Math.round(best.at[1] * 10) / 10],
  };
}

/** One physical placement, one entry (#293). A dense symbol proposes the same
 * instance from many anchor pairs at centers spread wider than the merge
 * radius, so clustering keeps the old walking semantics — an entry follows
 * the best-scoring proposal of its neighborhood — but that walk could END
 * with two entries on the same peak: each walker absorbed its own chain, and
 * nothing re-checked the pairwise invariant after a move. Measured on a real
 * plumbing sheet as one floor drain committed twice, 0.2 px apart (0.921 and
 * 0.925), the two markers stacked into what renders as a single ×. The final
 * pass restores the invariant greedily by score — greedy never moves a
 * position, so it cannot re-break what it enforces. Exported for the tests:
 * the failure is a property of proposal ORDER, which drawn-ink fixtures
 * cannot pin down deterministically. */
export function mergeProposals<T extends { at: Point; score: number; xf: number; rotation: number; mirrored: boolean }>(scored: T[], mergeR: number): T[] {
  const kept: T[] = [];
  for (const s of scored) {
    const twin = kept.find((k) => Math.hypot(k.at[0] - s.at[0], k.at[1] - s.at[1]) <= mergeR);
    if (!twin) { kept.push({ ...s }); continue; }
    if (s.score > twin.score || (s.score === twin.score && s.xf < twin.xf)) {
      twin.at = s.at; twin.score = s.score; twin.rotation = s.rotation; twin.mirrored = s.mirrored; twin.xf = s.xf;
    }
  }
  const byBest = [...kept].sort((a, b) =>
    b.score - a.score || a.xf - b.xf || a.at[1] - b.at[1] || a.at[0] - b.at[0]);
  const out: T[] = [];
  for (const s of byBest) {
    if (out.some((k) => Math.hypot(k.at[0] - s.at[0], k.at[1] - s.at[1]) <= mergeR)) continue;
    out.push(s);
  }
  return out;
}

/** Steps 2–4 against ANY sheet's segments: constellation candidates, scoring,
 * classification. Anchor rarity is judged per TARGET sheet — the same seed
 * prunes differently on sheets with different length histograms, which is the
 * point of rarity-first anchors. */
export function matchSymbol(fp: SymbolFingerprint, segs: number[], opts: MatchOptions = {}): SymbolMatchResult {
  const scale = opts.scale ?? 1;
  // The seed's own drawn jitter is magnified along with the seed, so tolerance
  // follows the ratio UP and never down: the target sheet's jitter is its own
  // and does not shrink because the fingerprint did. max(1, scale) also makes
  // every scale ≤ 1 path — including the whole one-sheet surface — take the
  // identical tolerance it took before #186.
  const tol = (opts.tolPx ?? SWEEP_TOL_PX) * Math.max(1, scale);
  const scoreHigh = opts.scoreHigh ?? SWEEP_SCORE_HIGH;
  const scoreLow = opts.scoreLow ?? SWEEP_SCORE_LOW;
  const maxCandidates = opts.maxCandidates ?? SWEEP_CANDIDATE_CEILING;
  const xforms = transformsFor(opts.rotations ?? true, opts.mirror ?? true);
  const n = segs.length >> 2;
  if (scale !== 1 && opts.excludeCenter) {
    throw new Error("excludeCenter is a point on the SEED sheet and means nothing on a target sheet at a different scale — omit it when sweeping across sheets (there is no seed there to shadow).");
  }
  const fpS = scale === 1 ? fp : scaleFingerprint(fp, scale);
  // Only the scaling trip is guarded. A caller who widens tolPx on a same-scale
  // sweep is making a deliberate, long-standing choice about ITS OWN sheet and
  // is not owed a refusal; a symbol that shrank into the tolerance did not
  // choose anything, and its "matches" would be noise.
  if (scale !== 1 && fpS.footprint < MIN_FOOTPRINT_TOLS * tol) {
    throw new Error(`At a ${scale.toFixed(4)} size ratio this symbol is ${fpS.footprint.toFixed(1)} px across on the target sheet — inside the ${tol.toFixed(1)} px matching tolerance, where every placement scores alike and a "match" means nothing. The seed is drawn too large relative to the target for its linework to survive the trip: marquee an instance on the target sheet itself, or count the tag text with sweep_schedule_row.`);
  }
  const { rel, totalLen } = fpS;

  // ── 2. candidates ──────────────────────────────────────────────────────────
  // Sheet-wide immutable indexes are shared across every schedule-row sweep
  // in this document; see sheetMatchIndex's lifetime and tolerance contract.
  const { lengths, lenBucket, grid } = sheetMatchIndex(segs, tol);
  const regions = opts.candidateRegions?.filter((r) =>
    Number.isFinite(r.center[0]) && Number.isFinite(r.center[1]) && Number.isFinite(r.radius) && r.radius >= 0);
  // If a candidate centroid is inside a requested region, every one of its
  // anchor endpoints must be inside this expanded box. Querying the endpoint
  // index up front avoids walking the sheet-wide length bucket for every
  // anchor while remaining complete for all centroids the caller requested.
  let regionSegments: Set<number> | null = null;
  if (regions?.length) {
    regionSegments = new Set<number>();
    let maxRelRadius = 0;
    for (const r of rel) {
      maxRelRadius = Math.max(maxRelRadius, Math.hypot(r[0], r[1]), Math.hypot(r[2], r[3]));
    }
    for (const region of regions) {
      const reach = region.radius + maxRelRadius + 2 * tol;
      for (const i of grid.nearRect(
        region.center[0] - reach, region.center[1] - reach,
        region.center[0] + reach, region.center[1] + reach,
      )) regionSegments.add(i);
    }
  }
  let focusedLenBucket: Map<number, number[]> | null = null;
  if (regionSegments) {
    focusedLenBucket = new Map<number, number[]>();
    for (const i of regionSegments) {
      const bucket = Math.round(lengths[i]);
      const entries = focusedLenBucket.get(bucket);
      if (entries) entries.push(i);
      else focusedLenBucket.set(bucket, [i]);
    }
  }
  const activeLenBucket = focusedLenBucket ?? lenBucket;
  const insideRequestedRegion = (x: number, y: number): boolean =>
    !regions?.length || regions.some((r) => {
      const dx = x - r.center[0], dy = y - r.center[1];
      return dx * dx + dy * dy <= r.radius * r.radius;
    });
  const bucketBand = (L: number): number[] => {
    // every sheet segment with |len − L| ≤ 2·tol (both endpoints off by tol
    // can stretch/shrink the drawn length by up to 2·tol)
    const out: number[] = [];
    for (let b = Math.floor(L - 2 * tol); b <= Math.ceil(L + 2 * tol); b++) {
      const a = activeLenBucket.get(b);
      if (a) for (const i of a) {
        if (Math.abs(lengths[i] - L) <= 2 * tol) out.push(i);
      }
    }
    return out;
  };

  // anchor selection: rarest DISTINCT quantized lengths first (rarity prunes
  // hardest), longest first on ties so structure beats tick marks
  const byLenQ = new Map<number, { relIdx: number; len: number; rarity: number }>();
  for (let k = 0; k < rel.length; k++) {
    const L = rel[k][4];
    const q = Math.round(L);
    if (!byLenQ.has(q)) byLenQ.set(q, { relIdx: k, len: L, rarity: bucketBand(L).length });
  }
  const anchors = [...byLenQ.values()]
    .sort((a, b) => a.rarity - b.rarity || b.len - a.len || a.relIdx - b.relIdx)
    .slice(0, ANCHOR_COUNT);

  // Each (anchor, transform, matching sheet segment, endpoint pairing)
  // proposes ONE candidate centroid. Both endpoint mappings must agree on the
  // centroid within tolerance, or the sheet segment merely shares a length.
  type Cand = { tx: number; ty: number; xf: number };
  const proposals: Cand[] = [];
  const seen = new Set<string>();
  const quant = Math.max(tol, 1);
  for (let xi = 0; xi < xforms.length; xi++) {
    const { m } = xforms[xi];
    for (const anc of anchors) {
      const r = rel[anc.relIdx];
      const A = apply(m, r[0], r[1]);
      const B = apply(m, r[2], r[3]);
      for (const j of bucketBand(anc.len)) {
        const px = segs[j * 4], py = segs[j * 4 + 1], qx = segs[j * 4 + 2], qy = segs[j * 4 + 3];
        // pairing 1: (p, q) = (A, B); pairing 2: reversed
        for (const [ax, ay, bx, by] of [[A[0], A[1], B[0], B[1]], [B[0], B[1], A[0], A[1]]] as const) {
          const c1x = px - ax, c1y = py - ay;
          const c2x = qx - bx, c2y = qy - by;
          if (Math.abs(c1x - c2x) > 2 * tol || Math.abs(c1y - c2y) > 2 * tol) continue;
          const tx = (c1x + c2x) / 2, ty = (c1y + c2y) / 2;
          if (!insideRequestedRegion(tx, ty)) continue;
          const key = `${xi}:${Math.round(tx / quant)}:${Math.round(ty / quant)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          proposals.push({ tx, ty, xf: xi });
        }
      }
    }
  }

  // Deterministic scoring order (reading order, then transform preference),
  // so the cap — when it bites — always drops the same placements and the
  // dropped count means the same thing run to run.
  proposals.sort((a, b) => a.ty - b.ty || a.tx - b.tx || a.xf - b.xf);
  const considered = Math.min(proposals.length, maxCandidates);
  const dropped = proposals.length - considered;

  // ── 3. score ───────────────────────────────────────────────────────────────
  const scratch: number[] = [];
  const tol2 = tol * tol;
  const near = (x1: number, y1: number, x2: number, y2: number): boolean =>
    (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2) <= tol2;
  // #260 — the stated luminance gate. Live only when the caller supplied the
  // sheet's channel AND a tolerance: a sheet segment answers for a seed
  // segment only if their stroke luminances are within it. Off by default, so
  // every existing sweep scores exactly as it did.
  const sheetLum = opts.lum;
  const lumTol = opts.lumTol;
  const lumGate = sheetLum && sheetLum.length && fpS.lum && typeof lumTol === "number" && lumTol >= 0 && lumTol < 255;
  const lumOk = (j: number, k: number): boolean =>
    !lumGate || Math.abs((sheetLum as Uint8Array)[j] - (fpS.lum as number[])[k]) <= (lumTol as number);
  const scoreAt = (m: [number, number, number, number], tx: number, ty: number, ungated?: { v: number }): number => {
    let matched = 0, matchedAny = 0;
    for (let k = 0; k < rel.length; k++) {
      const r = rel[k];
      const a = apply(m, r[0], r[1]);
      const b = apply(m, r[2], r[3]);
      const ax = a[0] + tx, ay = a[1] + ty, bx = b[0] + tx, by = b[1] + ty;
      let hit = false, hitAny = false;
      for (const j of grid.near(ax, ay, scratch)) {
        const px = segs[j * 4], py = segs[j * 4 + 1], qx = segs[j * 4 + 2], qy = segs[j * 4 + 3];
        if ((near(px, py, ax, ay) && near(qx, qy, bx, by)) || (near(qx, qy, ax, ay) && near(px, py, bx, by))) {
          hitAny = true;
          if (lumOk(j, k)) { hit = true; break; }
        }
      }
      if (hit) matched += r[4];
      if (hitAny) matchedAny += r[4];
    }
    if (ungated) ungated.v = matchedAny / totalLen;
    return matched / totalLen;
  };

  // ── 4. classify + dedupe ───────────────────────────────────────────────────
  // One physical placement can be proposed by several anchors and — for a
  // symmetric symbol — several transforms; centers agree within ~tol, so a
  // small merge radius collapses them to the best score (earliest transform
  // on ties: the plainest reading wins deterministically).
  type Scored = SweepMatch & { xf: number };
  const scored: Scored[] = [];
  const ungated = { v: 0 };
  // Placements the geometry alone would have COMMITTED and the stated
  // luminance gate did not — the gate's cost, collected as placements rather
  // than tallied as proposals: one physical spot is proposed by several
  // anchors and transforms, and a count that says 16 for 8 phantoms is a
  // count nobody can check against the sheet.
  const lumOut: Point[] = [];
  for (let k = 0; k < considered; k++) {
    const c = proposals[k];
    const score = scoreAt(xforms[c.xf].m, c.tx, c.ty, lumGate ? ungated : undefined);
    if (lumGate && ungated.v >= scoreHigh && score < scoreHigh) lumOut.push([c.tx, c.ty]);
    if (score < scoreLow) continue;
    scored.push({ at: [c.tx, c.ty], score, rotation: xforms[c.xf].rotation, mirrored: xforms[c.xf].mirrored, xf: c.xf });
  }
  const mergeR = Math.max(2 * tol, 4);
  const kept = mergeProposals(scored, mergeR);

  // Shadow suppression. A partially-symmetric symbol reads ALMOST as itself
  // under the wrong transform — square + diagonal without the stub — at a
  // center offset by up to the centroid's eccentricity. Those readings are
  // not questions: the instance is already counted (or is the seed itself).
  // Two REAL instances can never sit within half a symbol diagonal of each
  // other without physically overlapping, so anything that close to the seed
  // or to an accepted match is the same ink read sideways, and listing it as
  // withheld would bury the real near-misses in symmetry noise.
  const suppressR = Math.max(mergeR, fpS.footprint / 2);
  const ex = opts.excludeCenter;
  const away = ex ? kept.filter((s) => Math.hypot(s.at[0] - ex[0], s.at[1] - ex[1]) > suppressR) : kept;

  // one physical spot per entry, seed shadow excluded, reading order — the
  // same treatment matches and withheld get, so the numbers are comparable
  const lumRejectedAt: Point[] = [];
  for (const p of lumOut) {
    if (ex && Math.hypot(p[0] - ex[0], p[1] - ex[1]) <= suppressR) continue;
    if (lumRejectedAt.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= mergeR)) continue;
    lumRejectedAt.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }
  lumRejectedAt.sort((a, b) => a[1] - b[1] || a[0] - b[0]);

  // ── 4b. counter-examples (#259) ───────────────────────────────────────────
  // Read each negative rect once, then test every surviving placement against
  // it. Rejection is disclosed, never silent: a placement that the geometry
  // accepted and a negative refused is the most interesting thing the sweep
  // has to say.
  // A counter-example's discriminating linework is expressed in the POSITIVE's
  // canonical frame — but a symbol that maps onto ITSELF under a rotation or a
  // mirror has no single canonical frame, and the transform a match reports is
  // then arbitrary among its equivalents (the merge keeps the earliest on a
  // tie). A square seed is the extreme case: eight transforms, one shape. So
  // the negative is tested under every transform that maps the SEED onto
  // itself, and the best reading wins. Without this, a rotated instance of the
  // very thing you excluded comes back counted, which is the same miscount the
  // issue is about, wearing a different hat.
  const selfSym: Array<[number, number, number, number]> = [];
  {
    const relPts = rel.map((r) => [r[0], r[1], r[2], r[3], r[4]] as const);
    const hasSeg = (ax: number, ay: number, bx: number, by: number): boolean =>
      relPts.some((q) =>
        (Math.hypot(q[0] - ax, q[1] - ay) <= tol && Math.hypot(q[2] - bx, q[3] - by) <= tol)
        || (Math.hypot(q[2] - ax, q[3] - ay) <= tol && Math.hypot(q[0] - bx, q[1] - by) <= tol));
    for (const xf of xforms) {
      let same = true;
      for (const r of relPts) {
        const a = apply(xf.m, r[0], r[1]);
        const b = apply(xf.m, r[2], r[3]);
        if (!hasSeg(a[0], a[1], b[0], b[1])) { same = false; break; }
      }
      if (same) selfSym.push(xf.m);
    }
    if (!selfSym.length) selfSym.push([1, 0, 0, 1]);
  }

  const negRects = opts.exclude || [];
  const negatives: Array<SymbolNegative | null> = opts.negatives
    ? opts.negatives.map((neg) => (scale === 1 ? neg : scaleNegative(neg, scale)))
    : negRects.map((r) => buildNegative(fp, segs, r, { ...opts, exclude: undefined, negatives: undefined }));
  const liveNegs = negatives.filter((neg): neg is SymbolNegative => !!neg);
  const needsBody = liveNegs.some((neg) => neg.mode === "crossing");
  const body = needsBody ? new BodyGrid(segs, Math.max(32, fpS.footprint)) : null;
  // how much of a negative's discriminating linework is present at a placement
  const evidenceOne = (neg: SymbolNegative, m: [number, number, number, number], tx: number, ty: number): number => {
    let found = 0;
    for (const r of neg.rel) {
      const a = apply(m, r[0], r[1]);
      const b = apply(m, r[2], r[3]);
      const ax = a[0] + tx, ay = a[1] + ty, bx = b[0] + tx, by = b[1] + ty;
      if (neg.mode === "shape") {
        // the extra mark itself, endpoint-matched exactly like the positive
        let hit = false;
        for (const j of grid.near(ax, ay, scratch)) {
          const px = segs[j * 4], py = segs[j * 4 + 1], qx = segs[j * 4 + 2], qy = segs[j * 4 + 3];
          if ((near(px, py, ax, ay) && near(qx, qy, bx, by)) || (near(qx, qy, ax, ay) && near(px, py, bx, by))) { hit = true; break; }
        }
        if (hit) found += r[4];
      } else {
        // the line that passes through: present when ONE sheet segment covers
        // the whole chord. A broken line — the fixture drawn over the grid —
        // has no such segment, which is the whole discriminator.
        let covered = false;
        for (const j of body!.near((ax + bx) / 2, (ay + by) / 2)) {
          const px = segs[j * 4], py = segs[j * 4 + 1], qx = segs[j * 4 + 2], qy = segs[j * 4 + 3];
          if (distToSeg(ax, ay, px, py, qx, qy) <= tol && distToSeg(bx, by, px, py, qx, qy) <= tol) { covered = true; break; }
        }
        if (covered) found += r[4];
      }
    }
    return neg.totalLen ? found / neg.totalLen : 0;
  };
  /** The best reading across the seed's own symmetry group (see selfSym). */
  const evidenceAt = (neg: SymbolNegative, m: [number, number, number, number], tx: number, ty: number): number => {
    let best = 0;
    for (const t of selfSym) {
      best = Math.max(best, evidenceOne(neg, compose(m, t), tx, ty));
      if (best >= 1) break;
    }
    return best;
  };
  const rejected: SweepRejected[] = [];
  const survivors: Scored[] = [];
  for (const sc of away) {
    let killed: { by: number; neg: SymbolNegative; ev: number } | null = null;
    for (let bi = 0; bi < negatives.length; bi++) {
      const neg = negatives[bi];
      if (!neg) continue;
      const ev = evidenceAt(neg, xforms[sc.xf].m, sc.at[0], sc.at[1]);
      if (ev >= EXCLUDE_EVIDENCE_BAR && (!killed || ev > killed.ev)) killed = { by: bi, neg, ev };
    }
    if (killed) {
      rejected.push({
        at: [Math.round(sc.at[0] * 10) / 10, Math.round(sc.at[1] * 10) / 10] as Point,
        score: Math.round(sc.score * 1000) / 1000,
        rotation: sc.rotation,
        mirrored: sc.mirrored,
        by: killed.by,
        mode: killed.neg.mode,
        evidence: Math.round(killed.ev * 1000) / 1000,
        reason: killed.neg.mode === "shape"
          ? `matched the seed at ${Math.round(sc.score * 100)}%, but ${Math.round(killed.ev * 100)}% of counter-example ${killed.by + 1}'s extra linework is here too — the negative explains this placement at least as well`
          : `matched the seed at ${Math.round(sc.score * 100)}%, but the line counter-example ${killed.by + 1} sits on runs through this placement UNBROKEN (${Math.round(killed.ev * 100)}% of it) — a real instance drawn over it would break it`,
      });
      continue;
    }
    survivors.push(sc);
  }

  // ── 4c. precision (SWEEP_EXTRA_MAX): extra ink the seed lacks ──────────────
  // Only high-recall survivors need the check (it decides match vs withheld,
  // never resurrects a low scorer, and negatives have already had their say).
  // A sheet segment counts as EXTRA only if it sits FULLY inside the
  // placement's transformed seed bbox (pad tol) AND matches no transformed
  // seed segment: fully-inside excludes background runs crossing the symbol,
  // no-seed-match excludes coincident duplicate ink and abutting tiles.
  // Two modes (see SWEEP_EXTRA_MAX): DISCLOSURE by default — supersets match,
  // because #259's contained-seed workflow (seed a bare square every drain
  // CONTAINS, then exclude the decoys) depends on exactly that — with the
  // extra fraction named on any match past the bar. GUARD under variantGuard —
  // the whole-symbol workflow, where a superset is a mislabel suspect and
  // demotes to withheld. The guard stands down when counter-examples are in
  // play: bringing negatives IS taking manual control of variant
  // discrimination, and it is how a contained-seed caller who ALSO wants the
  // guard's semantics expresses which supersets they mean.
  const manual = (opts.exclude?.length ?? 0) + (opts.negatives?.length ?? 0) > 0;
  const extraBar = opts.extraMax ?? SWEEP_EXTRA_MAX;
  const guardOn = opts.variantGuard === true && !manual;
  const relBBoxByXf = new Map<number, [number, number, number, number]>();
  const relBBoxFor = (xi: number): [number, number, number, number] => {
    let bb = relBBoxByXf.get(xi);
    if (bb) return bb;
    const { m } = xforms[xi];
    bb = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rel) {
      const a = apply(m, r[0], r[1]), b = apply(m, r[2], r[3]);
      bb[0] = Math.min(bb[0], a[0], b[0]); bb[1] = Math.min(bb[1], a[1], b[1]);
      bb[2] = Math.max(bb[2], a[0], b[0]); bb[3] = Math.max(bb[3], a[1], b[1]);
    }
    relBBoxByXf.set(xi, bb);
    return bb;
  };
  const extraFor = (s: Scored): number => {
    const bb = relBBoxFor(s.xf);
    const bx0 = bb[0] + s.at[0] - tol, by0 = bb[1] + s.at[1] - tol;
    const bx1 = bb[2] + s.at[0] + tol, by1 = bb[3] + s.at[1] + tol;
    const { m } = xforms[s.xf];
    const placed = rel.map((r) => {
      const a = apply(m, r[0], r[1]), b = apply(m, r[2], r[3]);
      return [a[0] + s.at[0], a[1] + s.at[1], b[0] + s.at[0], b[1] + s.at[1]] as const;
    });
    let extraLen = 0;
    for (const j of grid.nearRect(bx0, by0, bx1, by1)) {
      const px = segs[j * 4], py = segs[j * 4 + 1], qx = segs[j * 4 + 2], qy = segs[j * 4 + 3];
      if (px < bx0 || px > bx1 || py < by0 || py > by1 || qx < bx0 || qx > bx1 || qy < by0 || qy > by1) continue;
      let covered = false;
      for (const t of placed) {
        if ((near(px, py, t[0], t[1]) && near(qx, qy, t[2], t[3]))
          || (near(qx, qy, t[0], t[1]) && near(px, py, t[2], t[3]))) { covered = true; break; }
      }
      if (!covered) extraLen += segLen(segs, j);
    }
    return extraLen / totalLen;
  };
  const extraOf = new Map<Scored, number>();
  for (const s of survivors) if (s.score >= scoreHigh) extraOf.set(s, extraFor(s));

  const matches: SweepMatch[] = [];
  const withheld: SweepWithheld[] = [];
  const pct = (v: number): number => Math.round(v * 1000) / 1000;
  const row = (s: Scored): SweepMatch => ({
    at: [Math.round(s.at[0] * 10) / 10, Math.round(s.at[1] * 10) / 10] as Point,
    score: pct(s.score),
    rotation: s.rotation,
    mirrored: s.mirrored,
  });
  const isMatch = (s: Scored): boolean =>
    s.score >= scoreHigh && (!guardOn || (extraOf.get(s) ?? 0) <= extraBar);
  for (const s of survivors) {
    if (!isMatch(s)) continue;
    const ev = extraOf.get(s) ?? 0;
    // disclosure: a match carrying substantial extra ink is a variant SUSPECT
    // — named on the row so it is looked at first, never hidden in the count
    matches.push(ev > extraBar ? { ...row(s), extra: pct(ev) } : row(s));
  }
  for (const s of survivors) {
    if (isMatch(s)) continue;
    if (matches.some((m) => Math.hypot(m.at[0] - s.at[0], m.at[1] - s.at[1]) <= suppressR)) continue;
    if (s.score >= scoreHigh) {
      const ev = extraOf.get(s) ?? 0;
      withheld.push({
        ...row(s), extra: pct(ev),
        reason: `reproduces ${Math.round(s.score * 100)}% of the seed but carries ~${Math.round(ev * 100)}% extra linework the seed lacks (bar ${Math.round(extraBar * 100)}%) — under variant_guard a richer variant (a different grille/register/fixture type) is a question, not a count; look before counting it. If you meant to seed a contained sub-shape and count the richer symbols, drop variant_guard or pass a counter-example around the variant you DON'T mean`,
      });
      continue;
    }
    withheld.push({ ...row(s), reason: `matched ${Math.round(s.score * 100)}% of the seed's linework (commit bar ${Math.round(scoreHigh * 100)}%) — likely a variant or an overlapped instance; look before counting it` });
  }
  const order = (a: SweepMatch, b: SweepMatch): number =>
    a.at[1] - b.at[1] || a.at[0] - b.at[0] || a.rotation - b.rotation || Number(a.mirrored) - Number(b.mirrored);
  matches.sort(order);
  withheld.sort(order);
  rejected.sort(order);

  return {
    matches,
    withheld,
    rejected,
    ...(negatives.length ? { negatives: negatives.map((neg) => (neg ? { mode: neg.mode, segments: neg.rel.length, center: neg.center } : null)) } : {}),
    candidates: { considered, dropped },
    complete: dropped === 0,
    ...(lumGate ? { lum_gate: {
      tol: lumTol as number,
      seed_lum: [...new Set(fpS.lum as number[])].sort((a, b) => a - b),
      rejected: lumRejectedAt.length,
      at: lumRejectedAt,
    } } : {}),
    ...(scale === 1 ? {} : {
      scaled: {
        ratio: Math.round(scale * 1e6) / 1e6,
        segments: fpS.segments,
        sub_pixel_dropped: fpS.subPixelDropped ?? 0,
        footprint_px: Math.round(fpS.footprint * 10) / 10,
        tol_px: Math.round(tol * 100) / 100,
      },
    }),
  };
}

/** The one-sheet sweep, unchanged: fingerprint the marquee, match the same
 * sheet, suppress the seed's own location. */
export function sweepSymbols(segs: number[], seedRect: [Point, Point], opts: SweepOptions = {}): SweepResult {
  const fp = fingerprintSymbol(segs, seedRect, opts.lum);
  const m = matchSymbol(fp, segs, { ...opts, excludeCenter: fp.center });
  return {
    seed: {
      segments: fp.segments,
      center: [Math.round(fp.center[0] * 10) / 10, Math.round(fp.center[1] * 10) / 10],
      length_px: Math.round(fp.totalLen * 10) / 10,
    },
    matches: m.matches,
    withheld: m.withheld,
    rejected: m.rejected,
    ...(m.negatives ? { negatives: m.negatives } : {}),
    candidates: m.candidates,
    complete: m.complete,
    ...(m.lum_gate ? { lum_gate: m.lum_gate } : {}),
  };
}

// ── reference-shape-seeded matching (maturity plan Phase 2, #HVAC-3) ──────
// Every match above needs a human (or agent) to marquee ONE real instance
// first, every time, on every sheet. This is the missing "propose a
// hypothesis without a seed" path — for symbols whose SHAPE is standardized
// enough across real firms' drawings to be worth a small hand-authored
// reference fingerprint (see web/src/lib/hvacRefShapes.ts for the actual
// shapes and the real corpus evidence behind each one; this module stays
// domain-agnostic, same as fingerprintSymbol/matchSymbol above — it works
// for any reference shape, HVAC or not).
//
// Scale is the real design problem a reference shape has that a marqueed
// seed never does: a seed comes from the SAME sheet it searches (or a
// stated seed/target upp ratio, #186 above), but a hand-authored reference
// shape has no sheet of its own. The established, already-tested precedent
// (sweepRatio: seed.upp / target.upp — a symbol's PIXEL size scales with
// the sheet's own real-world scale, not printed-page-size-invariant) is
// reused here, not re-decided: a reference shape states its own notional
// real-world size (inches), and the caller supplies the TARGET sheet's own
// committed upp (feet per image px) to convert it into that sheet's actual
// pixel space before fingerprinting — never guessed, never searched across
// scales. No committed scale on the target, no match attempt: refused with
// a named reason, the same discipline every scale-dependent tool in this
// codebase already holds to.
export interface RefShape {
  /** Human name — carried straight through as the result's own label. */
  name: string;
  /** Segments in real-world INCHES (a notional reference size for this
   * symbol family — flat [ax,ay,bx,by, ...], the same layout `segs` always
   * uses elsewhere in this module), NOT image px. Converted to the target
   * sheet's own px space using its committed upp before matching. */
  segsIn: number[];
}

export interface LibraryMatch {
  name: string;
  result: SymbolMatchResult;
}

/** Every reference shape in `library`, matched against `segs` — the target
 * sheet's own vector geometry, in that sheet's own image px. `targetUpp` is
 * the target sheet's committed feet-per-px (ctx.uppFor's own convention);
 * null/undefined REFUSES rather than guessing a scale (mirrors matchSymbol's
 * own no-scale-assumed doctrine, one level up). Each reference shape goes
 * through the EXACT SAME scoring/refusal machinery matchSymbol already has
 * — a match is a match, a near-miss is withheld with a reason, nothing is
 * ever asserted from a weak score. `opts.excludeCenter` is never meaningful
 * here (a reference shape has no seed instance of its own to shadow) and is
 * silently ignored if passed. */
export function matchAgainstLibrary(
  segs: number[], library: RefShape[], targetUpp: number | null | undefined, opts: MatchOptions = {},
): LibraryMatch[] {
  if (!targetUpp) {
    throw new Error("No committed scale on this sheet — a reference shape's real-world size cannot be converted to this sheet's pixels without one. Set the scale first, or marquee a real instance and use symbol_sweep instead.");
  }
  const pxPerIn = 1 / (targetUpp * 12);   // targetUpp: real feet per image px
  const { excludeCenter: _ignored, ...rest } = opts;
  const out: LibraryMatch[] = [];
  const footprints: number[] = [];   // parallel to `out` — each shape's own bbox diagonal, px
  const segCounts: number[] = [];    // parallel to `out` — each shape's own segment count
  for (const ref of library) {
    const segsPx = ref.segsIn.map((v) => v * pxPerIn);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < segsPx.length; i += 4) {
      x0 = Math.min(x0, segsPx[i], segsPx[i + 2]); x1 = Math.max(x1, segsPx[i], segsPx[i + 2]);
      y0 = Math.min(y0, segsPx[i + 1], segsPx[i + 3]); y1 = Math.max(y1, segsPx[i + 1], segsPx[i + 3]);
    }
    const fp = fingerprintSymbol(segsPx, [[x0, y0], [x1, y1]]);
    out.push({ name: ref.name, result: matchSymbol(fp, segs, rest) });
    footprints.push(fp.footprint);
    segCounts.push(fp.segments);
  }
  // Cross-shape disambiguation (#259's own class of problem, in a library
  // with no marqueed sheet to draw a counter-example on): a reference shape
  // that is a literal SUBSET of another library shape (real, measured case:
  // a 2-way control valve's own body is exactly a 3-way's body minus its
  // third leg) scores a clean 1.0 match wherever the LARGER shape is
  // actually drawn — extra ink around a smaller seed never lowers its own
  // score. Demoted here, not in matchSymbol itself: only meaningful when
  // multiple library shapes are compared in the same call. A strictly
  // smaller shape's match is demoted to withheld whenever a strictly LARGER
  // shape (more segments) has its own CLEAN MATCH (never its withheld —a
  // withheld near-miss is the larger shape's own honest "this isn't me",
  // real evidence a location is the SMALLER shape, not grounds to doubt
  // it; using withheld here was a real, measured bug caught before this
  // shipped, see the git history) within the smaller shape's own footprint
  // of the same point — never silently dropped, always naming which
  // larger shape did it.
  for (let i = 0; i < out.length; i++) {
    for (let j = 0; j < out.length; j++) {
      if (i === j || segCounts[i] >= segCounts[j]) continue;
      const smaller = out[i], larger = out[j];
      if (!larger.result.matches.length) continue;
      const tol = footprints[i];
      const kept: SweepMatch[] = [];
      for (const m of smaller.result.matches) {
        const hit = larger.result.matches.find((lm) => Math.hypot(lm.at[0] - m.at[0], lm.at[1] - m.at[1]) <= tol);
        if (hit) {
          smaller.result.withheld.push({ ...m, reason: `a larger reference shape ("${larger.name}") also matches this same location — this instance is very likely a "${larger.name}", not a "${smaller.name}"; view_sheet here and confirm before trusting either` });
        } else {
          kept.push(m);
        }
      }
      smaller.result.matches = kept;
    }
  }
  return out;
}

// ── sweep_schedule_row's engine (maturity plan Phase 3, #HVAC-crossscale) ──
// A schedule row names a tag, not a symbol — the marker has to be found
// FROM the tag's own drawn occurrence(s), corroborated before it's trusted,
// then swept across a whole plan set that may not be drawn at one scale.
// This was real, working logic in the MCP server (mcp/src/session.ts) the
// browser's own port explicitly did NOT carry over (documented in its own
// code comment) — extracted here so canvas and MCP call the identical
// pure engine instead of two implementations that can silently drift, the
// same "canvas and MCP cannot disagree" doctrine fingerprintSymbol/
// matchSymbol above already keep. Both callers still own everything
// session-shaped: resolving the row, walking their own sheet list,
// deciding what to commit. This owns only the geometry.

/** One drawn occurrence of a tag's text on a sheet — the shape both the MCP
 * server's session.ts and the browser's TakeoffCanvas.jsx already compute
 * identically from their own span sources, just never shared as one type. */
export interface TagOcc {
  cx: number;
  cy: number;
  /** The text span's own height, image px — the pad-ladder step size and the
   * match-radius floor both ride this, never a fixed constant, so a tiny
   * tag and a huge one both get a proportionate footprint. */
  h: number;
  bbox: [number, number, number, number];
}

/** A minimal positioned text span — the shape both sweep_schedule_row's own
 * occOf (MCP session.ts and the browser's TakeoffCanvas.jsx) already carry;
 * kept local so this module never has to import either side's own richer
 * span type. */
export interface FlatSpan { str: string; x0: number; y0: number; x1: number; y1: number }

/**
 * Read an explicit drafting multiplier attached to one tag callout.
 * "TYP 8" means the tagged symbol represents eight installed instances.
 * The annotation must be a standalone span immediately above or below the
 * tag and horizontally aligned with it; unrelated plan notes are ignored.
 */
export function typicalCountMultiplier(
  spans: FlatSpan[],
  tagBox: [number, number, number, number],
): number {
  const [x0, y0, x1, y1] = tagBox;
  const tagCx = (x0 + x1) / 2;
  const tagH = Math.max(1, y1 - y0);
  for (const span of spans) {
    const match = span.str.trim().match(/^TYP(?:ICAL)?\.?\s*(?:X\s*)?(\d{1,3})$/i);
    if (!match) continue;
    const count = Number(match[1]);
    if (!Number.isInteger(count) || count < 2 || count > 100) continue;
    const spanCx = (span.x0 + span.x1) / 2;
    const spanH = Math.max(1, span.y1 - span.y0);
    const verticalGap = Math.max(0, span.y0 - y1, y0 - span.y1);
    const horizontalOverlap = Math.min(x1, span.x1) - Math.max(x0, span.x0);
    const aligned = horizontalOverlap >= 0
      || Math.abs(spanCx - tagCx) <= Math.max(x1 - x0, span.x1 - span.x0) * 0.75;
    if (aligned && verticalGap <= Math.max(tagH, spanH) * 1.5) return count;
  }
  return 1;
}

/** A single span LONGER than the key — the schedule's own bare key with more
 * text appended in the SAME PDF text run (a circuit/panel reference, an
 * inverter tag, …), never split across separate spans at all. Real,
 * confirmed live — baker-county-eoc-bidset.pdf#54's own LUMINAIRE plan draws
 * every "R1" fixture as ONE PDF text run reading "R1 /C-11", "R1 /INV-2", …
 * (23 of them; occOf's own exact match sees none, since none is bare "R1",
 * and fragmentedTagOcc's join-fragments search can never fire either, since
 * a starting fragment there must be SHORTER than the key). A real token
 * boundary is required right after the key (anything but a letter/digit,
 * including end-of-string) so "R1" can never absorb "R10" or "R1A" — a
 * different, real, separately-scheduled tag.
 *
 * Unlike fragmentedTagOcc's own join search (which risks stitching
 * unrelated short spans together, and so stays gated to "only when the
 * exact match found nothing"), a match here is a single already-complete
 * span — it can never coincide with an exact match's own span (that
 * requires equality, this requires strictly-longer), so `occOf` merges this
 * in ALONGSIDE the exact match unconditionally: a sheet can legitimately
 * carry both a bare, unrelated coincidental "R1" elsewhere AND this row's
 * own real compound-labeled instances, and both are real occurrences of
 * whatever anchors on this sheet right now (baker-county-eoc-bidset.pdf#54's
 * own "P1" — one bare span plus three "P1 /C-11"-style compound spans, all
 * four real). */
export function compoundTagOcc(spans: FlatSpan[], key: string): TagOcc[] {
  const upper = (s: string) => s.trim().toUpperCase();
  const keyUpper = upper(key);
  if (!keyUpper) return [];
  const out: TagOcc[] = [];
  for (const sp of spans) {
    const t = upper(sp.str);
    if (t.length <= keyUpper.length || !t.startsWith(keyUpper)) continue;
    if (/[A-Z0-9]/.test(t[keyUpper.length])) continue;
    out.push({ cx: (sp.x0 + sp.x1) / 2, cy: (sp.y0 + sp.y1) / 2, h: Math.max(sp.y1 - sp.y0, 6), bbox: [sp.x0, sp.y0, sp.x1, sp.y1] });
  }
  return out;
}

/**
 * Recover the common two-run form of a one-hyphen tag when the PDF omits
 * the printed hyphen from text extraction ("SCHWP" + "M1"). Both sides
 * must exactly equal the key's two components and sit adjacently on one
 * baseline; this never performs a fuzzy prefix chain.
 */
export function splitHyphenTagOcc(spans: FlatSpan[], key: string): TagOcc[] {
  const parts = key.trim().toUpperCase().split("-");
  // Structural scope: long equipment-family stem plus an alphanumeric
  // unit suffix (SCHWP-M1, PCHWP-MT1). Short generic tags such as TP-2 or
  // US-1 already use fragmentedTagOcc's proven conservative path; admitting
  // them here recreates dense plumbing-sheet cross-joins.
  if (parts.length !== 2 || parts[0].length < 5
    || !/[A-Z]/.test(parts[1]) || !/\d/.test(parts[1])) return [];
  const upper = (value: string) => value.trim().toUpperCase();
  const out: TagOcc[] = [];
  for (const left of spans.filter((span) => upper(span.str) === parts[0])) {
    const h = Math.max(left.y1 - left.y0, 6);
    const right = spans
      .filter((span) =>
        upper(span.str) === parts[1]
        && (
          (Math.abs(span.y0 - left.y0) <= h * 0.4
            && span.x0 >= left.x1 - 1
            && span.x0 - left.x1 <= h * 2)
          // Rotated/stacked pump tags often extract the unit suffix on the
          // line immediately above or below the long family stem.
          || (Math.abs((span.x0 + span.x1) / 2 - (left.x0 + left.x1) / 2) <= h * 4
            && Math.max(0, span.y0 - left.y1, left.y0 - span.y1) <= h * 2)
        ))
      .sort((a, b) =>
        Math.hypot(a.x0 - left.x1, a.y0 - left.y0)
        - Math.hypot(b.x0 - left.x1, b.y0 - left.y0))[0];
    if (!right) continue;
    out.push({
      cx: (left.x0 + right.x1) / 2,
      cy: (Math.min(left.y0, right.y0) + Math.max(left.y1, right.y1)) / 2,
      h: Math.max(left.y1, right.y1) - Math.min(left.y0, right.y0),
      bbox: [left.x0, Math.min(left.y0, right.y0), right.x1, Math.max(left.y1, right.y1)],
    });
  }
  return out;
}

/** sweep_schedule_row's own tag-occurrence match (`occOf` in both
 * session.ts and TakeoffCanvas.jsx) requires the FULL tag text to appear as
 * ONE literal span — but a real drawn tag is routinely split across
 * MULTIPLE runs, and the split shape itself varies by firm: measured live,
 * the real Bessemer sample draws "SR-1" as three same-row adjacent runs
 * ("SR", "-", "1"), while a real itd-d1-lab hexagon tag bubble draws "EF-1"
 * as TWO runs stacked on separate lines ("EF" over "1"), with no hyphen run
 * anywhere at all. Both real shapes defeated occOf's own exact-match
 * before this fix, and — confirmed live — this is the actual reason
 * sweep_schedule_row refuses "not drawn on any plan sheet" for tags that
 * ARE genuinely drawn (SR-1/SR-2/TG-1/TG-2 on Bessemer; the entire real
 * equipment tag set on itd-d1-lab).
 *
 * This is a FALLBACK, tried only when the exact single-span match (and
 * compoundTagOcc above, occOf's own doctrine) already found nothing — it
 * can only ever ADD a way to succeed, never change an already-passing case.
 * Starting from a span whose own text is a real (hyphen-insensitive) PREFIX
 * of the key and SHORTER than it, it extends a bounded chain (same-row
 * adjacent, or the next line directly below — the two real shapes measured)
 * until the accumulated text exactly reconstructs the key
 * (hyphen-insensitive) or the chain runs out — never a sheet-wide text
 * search, never a fuzzy match. */
export function fragmentedTagOcc(spans: FlatSpan[], key: string): TagOcc[] {
  const stripHy = (s: string) => s.replace(/-/g, "");
  const targetStripped = stripHy(key);
  if (!targetStripped) return [];
  // Parenthesized gang counts belong to the placement callout, not the
  // schedule mark itself: "(6) LD" + "-" + "1" is one LD-1 occurrence.
  const upper = (s: string) => s.trim().toUpperCase().replace(/^\(\d+\)\s*/, "");
  const out: TagOcc[] = [];
  const starts = spans.filter((sp) => {
    const t = upper(sp.str);
    return t.length > 0 && t.length < key.length && targetStripped.startsWith(stripHy(t));
  });
  for (const start of starts) {
    let text = upper(start.str);
    let x0 = start.x0, y0 = start.y0, x1 = start.x1, y1 = start.y1;
    let cur = start;
    let ok = stripHy(text) === targetStripped;
    for (let guard = 0; !ok && stripHy(text).length < targetStripped.length && guard < 4; guard++) {
      const h = Math.max(cur.y1 - cur.y0, 6);
      const next = spans.find((sp) => {
        if (sp === cur) return false;
        const sameRow = Math.abs(sp.y0 - cur.y0) < h * 0.4 && sp.x0 >= cur.x0 - 1 && sp.x0 - cur.x1 < h * 1.5;
        const nextLine = Math.abs(sp.y0 - cur.y1) < h * 0.6 && Math.abs((sp.x0 + sp.x1) / 2 - (cur.x0 + cur.x1) / 2) < h * 1.5;
        return sameRow || nextLine;
      });
      if (!next) break;
      const candidate = text + upper(next.str);
      if (!targetStripped.startsWith(stripHy(candidate))) break;
      text = candidate;
      x0 = Math.min(x0, next.x0); y0 = Math.min(y0, next.y0); x1 = Math.max(x1, next.x1); y1 = Math.max(y1, next.y1);
      cur = next;
      ok = stripHy(text) === targetStripped;
    }
    if (ok) out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: Math.max(y1 - y0, 6), bbox: [x0, y0, x1, y1] });
  }
  return out;
}

/**
 * Complete missed same-row fragments only after four ordinary occurrences
 * prove this page's family convention. The legacy extractor intentionally
 * keeps PDF content-stream order; dense labels can put an overlapping room
 * word before the adjacent "-" or suffix. Under a four-hit quorum, retry
 * with nearest viable continuations while preserving every prefix check.
 */
export function familyQuorumFragmentedTagOcc(spans: FlatSpan[], key: string): TagOcc[] {
  const base = fragmentedTagOcc(spans, key);
  if (base.length < 4) return base;
  const stripHy = (s: string) => s.replace(/-/g, "");
  const target = stripHy(key);
  const upper = (s: string) => s.trim().toUpperCase().replace(/^\(\d+\)\s*/, "");
  const recovered: TagOcc[] = [];
  for (const start of spans) {
    let text = upper(start.str);
    if (!text || text.length >= key.length || !target.startsWith(stripHy(text))) continue;
    let x0 = start.x0, y0 = start.y0, x1 = start.x1, y1 = start.y1;
    let cur = start;
    const used = new Set<FlatSpan>([start]);
    for (let guard = 0; stripHy(text).length < target.length && guard < 4; guard++) {
      const h = Math.max(cur.y1 - cur.y0, 6);
      const candidates = spans.filter((span) => {
        if (used.has(span)) return false;
        const candidate = text + upper(span.str);
        if (!target.startsWith(stripHy(candidate))) return false;
        return Math.abs(span.y0 - cur.y0) < h * 0.4
          && span.x0 >= cur.x0 - 1
          && span.x0 - cur.x1 < h * 1.5;
      }).sort((a, b) => Math.abs(a.x0 - cur.x1) - Math.abs(b.x0 - cur.x1));
      const next = candidates[0];
      if (!next) break;
      used.add(next);
      text += upper(next.str);
      x0 = Math.min(x0, next.x0); y0 = Math.min(y0, next.y0);
      x1 = Math.max(x1, next.x1); y1 = Math.max(y1, next.y1);
      cur = next;
    }
    if (stripHy(text) === target) {
      recovered.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, h: Math.max(y1 - y0, 6), bbox: [x0, y0, x1, y1] });
    }
  }
  const merged = [...base];
  for (const occurrence of recovered) {
    if (!merged.some((existing) =>
      Math.hypot(existing.cx - occurrence.cx, existing.cy - occurrence.cy) <= Math.max(existing.h, occurrence.h))) {
      merged.push(occurrence);
    }
  }
  return merged;
}

/** A SEPARATE, DEEPER same-row fragment chain for a real shape
 * fragmentedTagOcc's own 4-hop, first-array-order chain cannot reach: a
 * multi-segment hyphenated abbreviation tag split across SIX or more
 * same-row runs. Real, confirmed live — navfac-cherry-point-atc's own
 * pump/valve tag set draws "CV-CHW-BP-M" as SEVEN separate same-row runs
 * ("CV","-","CHW","-","BP","-","M", six hops) and "SHHWP-M1"/"SCHWP-M1"-
 * style pump tags as three ("SHHWP","-","M1", two hops) — both past what
 * fragmentedTagOcc's own conservative budget (chosen for the two originally
 * -measured shapes: Bessemer's 3-run "SR-1", itd-d1-lab's 2-run stacked
 * "EF-1") was ever sized for.
 *
 * This is deliberately its OWN function, never a parameter on
 * fragmentedTagOcc's own loop, and never invoked unless fragmentedTagOcc's
 * own (unmodified) search ALREADY found nothing — occOf's own third
 * fallback tier, after exact/compound AND fragmentedTagOcc. Two real,
 * measured dangers this owns instead of fragmentedTagOcc, kept OUT of that
 * shared function entirely:
 *
 * 1. Simply raising fragmentedTagOcc's own hop budget is safe on its own
 *    (measured: zero raw-match change across itd-d1-lab-mechanical.pdf's
 *    entire real 29-sheet set, 110 real tags × 29 sheets, hop budget 4
 *    through 20, first-array-order selection unchanged) — the real danger
 *    is touching fragmentedTagOcc's own CANDIDATE-SELECTION step. Even a
 *    well-motivated "prefer same-row, nearest by distance" reselection
 *    (this function's own algorithm) measurably reshuffles which real
 *    physical instance's fragments get linked to which chain on
 *    itd-d1-lab's own densely-packed plumbing sheets (#22/#23/#25 — a
 *    dozen-plus real, independently-tagged fixtures within a few hundred
 *    px of each other): TP-2 alone went from 15 to 23 raw candidate
 *    matches, with 15 other (tag, sheet) pairs changing and one brand-new
 *    false completion (LS-1, a real cross-sheet redundant-view risk
 *    documented live against WC-1/US-2 on this exact sheet pair). A prior
 *    attempt at this exact fix (2026-08-28) applied a nearest-not-first
 *    reselection directly to fragmentedTagOcc itself and, even in its most
 *    conservative form, silently regressed itd-d1-lab (98.3% -> 93.1%
 *    exact) — correctly reverted rather than shipped.
 * 2. This function's own nearest-by-distance reselection is therefore never
 *    allowed anywhere NEAR fragmentedTagOcc's own call graph or itd-d1-
 *    lab's own tag vocabulary: every real tag in every one of this
 *    project's real corpus keys (itd-d1-lab, bessemer, federal-mech,
 *    baker-county-eoc, bldg5406-hvac-demo) has zero or one hyphen — never
 *    two — so gating this function to keys with >=2 hyphens (a real,
 *    general property of the tag's OWN naming convention, not a
 *    corpus-specific hardcode) makes it STRUCTURALLY inapplicable to any
 *    of those real tags, not merely empirically safe: it can never even be
 *    reached for a 0- or 1-hyphen key, regardless of what fragmentedTagOcc
 *    finds or fails to find. Confirmed live: with this gate, this function
 *    produces zero matches anywhere in itd-d1-lab-mechanical.pdf's real
 *    29-sheet set for any of its 110 real keys (none has >=2 hyphens) —
 *    the gate closes before this function's own search logic ever runs,
 *    not merely because fragmentedTagOcc happens to already succeed there.
 *
 * SAME-ROW ONLY (no next-line jump — that stacked-bubble shape is
 * fragmentedTagOcc's own nextLine branch's territory, already handled),
 * nearest-by-x-distance among same-row candidates (the real disambiguator
 * PDF content-stream order structurally can't be: CV-CHW-BP-M's own real
 * "CV" start has a coincidental word — "AS", part of unrelated nearby duct
 * text — positioned directly below it that the content stream happens to
 * list BEFORE the correct same-row "-" neighbor; first-array-order picks
 * the wrong one and the chain breaks at hop 0). Hop budget sized to the
 * deepest real shape measured (CV-CHW-BP-M's six hops) with headroom. */
export function deepHyphenChainTagOcc(spans: FlatSpan[], key: string): TagOcc[] {
  if ((key.match(/-/g) ?? []).length < 2) return []; // structural gate — see header
  const HOP_BUDGET = 10;
  const stripHy = (s: string) => s.replace(/-/g, "");
  const targetStripped = stripHy(key);
  if (!targetStripped) return [];
  const upper = (s: string) => s.trim().toUpperCase();
  const out: TagOcc[] = [];
  const starts = spans.filter((sp) => {
    const t = upper(sp.str);
    return stripHy(t).length > 0 && t.length < key.length && targetStripped.startsWith(stripHy(t));
  });
  for (const start of starts) {
    let text = upper(start.str);
    let x0 = start.x0, y0 = start.y0, x1 = start.x1, y1 = start.y1;
    let cur = start;
    const used = new Set<FlatSpan>([start]);
    let ok = stripHy(text) === targetStripped;
    for (let guard = 0; !ok && stripHy(text).length < targetStripped.length && guard < HOP_BUDGET; guard++) {
      const h = Math.max(cur.y1 - cur.y0, 6);
      let next: FlatSpan | null = null, bestD = Infinity;
      for (const sp of spans) {
        if (used.has(sp)) continue;
        const candidate = text + upper(sp.str);
        if (!targetStripped.startsWith(stripHy(candidate))) continue;
        const sameRow = Math.abs(sp.y0 - cur.y0) < h * 0.4 && sp.x0 >= cur.x0 - 1 && sp.x0 - cur.x1 < h * 1.5;
        const sameColumn = Math.abs(sp.x0 - cur.x0) < h * 0.4
          && ((sp.y1 <= cur.y1 + 1 && cur.y0 - sp.y1 < h * 1.5)
            || (sp.y0 >= cur.y0 - 1 && sp.y0 - cur.y1 < h * 1.5));
        if (!sameRow && !sameColumn) continue;
        const dx = (sp.x0 + sp.x1) / 2 - (cur.x0 + cur.x1) / 2;
        const dy = (sp.y0 + sp.y1) / 2 - (cur.y0 + cur.y1) / 2;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; next = sp; }
      }
      if (!next) break;
      const candidate = text + upper(next.str);
      text = candidate;
      x0 = Math.min(x0, next.x0); y0 = Math.min(y0, next.y0); x1 = Math.max(x1, next.x1); y1 = Math.max(y1, next.y1);
      cur = next;
      used.add(next);
      ok = stripHy(text) === targetStripped;
    }
    if (ok) out.push({
      cx: (x0 + x1) / 2,
      cy: (y0 + y1) / 2,
      h: Math.max(Math.min(x1 - x0, y1 - y0), 6),
      bbox: [x0, y0, x1, y1],
    });
  }
  return out;
}

/**
 * Recover a tag whose family prefix was emitted as vector outlines while its
 * suffix remained searchable text. This is deliberately family-corroborated:
 * at least four distinct complete sibling tags must establish the local
 * convention, and exactly one same-sized bare suffix must sit near two of
 * those siblings. A page's ordinary detail/dimension numeral cannot satisfy
 * that shape by itself.
 */
export function familySuffixTagOcc(spans: FlatSpan[], key: string): TagOcc[] {
  const target = key.trim().toUpperCase().replace(/\s+/g, "");
  const match = target.match(/^([A-Z][A-Z0-9-]*-)(\d+[A-Z]?)$/);
  if (!match) return [];
  const [, stem, suffix] = match;
  const normalize = (text: string) => text.trim().toUpperCase().replace(/\s+/g, "");
  const siblingPattern = new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d+[A-Z]?)$`);
  const siblings = spans.flatMap((span) => {
    const sibling = normalize(span.str).match(siblingPattern);
    return sibling && sibling[1] !== suffix ? [{ span, suffix: sibling[1] }] : [];
  });
  if (new Set(siblings.map((entry) => entry.suffix)).size < 4) return [];
  const heights = siblings.map(({ span }) => Math.max(span.y1 - span.y0, 1)).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)];
  const candidates = spans.filter((span) => {
    if (normalize(span.str) !== suffix) return false;
    const h = Math.max(span.y1 - span.y0, 1);
    // A CAD font can outline the missing prefix at a different rotation,
    // leaving the searchable suffix with roughly half the sibling run's
    // reported axis-aligned height.
    if (h < medianH * 0.4 || h > medianH * 1.6) return false;
    const cx = (span.x0 + span.x1) / 2, cy = (span.y0 + span.y1) / 2;
    const nearby = siblings.filter(({ span: sibling }) => {
      const sx = (sibling.x0 + sibling.x1) / 2, sy = (sibling.y0 + sibling.y1) / 2;
      return Math.hypot(cx - sx, cy - sy) <= medianH * 25;
    });
    return nearby.length >= 2;
  });
  if (candidates.length !== 1) return [];
  const span = candidates[0];
  return [{
    cx: (span.x0 + span.x1) / 2,
    cy: (span.y0 + span.y1) / 2,
    h: Math.max(span.y1 - span.y0, 6),
    bbox: [span.x0, span.y0, span.x1, span.y1],
  }];
}

/** The seed→target size ratio for a cross-sheet sweep (#186): seed-sheet
 * image px per target-sheet image px, exactly `upp_seed / upp_target` —
 * both sheets' own committed scales, no search and no guess.
 *
 * `known: false` means at least one of the two sheets has no scale set. The
 * sweep can still run at 1.0 (same-size drafting is the norm across the
 * plan sheets of one set) but the caller MUST disclose the assumption: an
 * unknown ratio and a zero count are otherwise indistinguishable from "the
 * symbol isn't there" — the exact silent wrong answer #186 exists to kill. */
export function sweepRatio(seed: { upp: number | null | undefined }, target: { upp: number | null | undefined }): { scale: number; known: boolean } {
  if (seed === target) return { scale: 1, known: true };
  if (seed.upp && target.upp) return { scale: seed.upp / target.upp, known: true };
  return { scale: 1, known: false };
}

/** A candidate fingerprint degenerate enough to recur at every tagged mark —
 * a bare underline or leader stroke, not a real device symbol. Matching on
 * it would count tags' furniture, not devices; widen the pad instead. */
const MIN_MARKER_SEGMENTS = 3;

/** Step 3 of sweep_schedule_row: anchor a fingerprint on the tag's own drawn
 * occurrence and corroborate it — recur at a SECOND occurrence — before it
 * is trusted. A deterministic pad ladder (1×/2×/3× the tag's own text
 * height) around the tag's bbox, widening until a real marker's worth of
 * linework (≥3 segments) is captured; each candidate is corroborated by
 * probing the corroborator's own geometry (resized by `corroRatio` when the
 * two sheets are drawn at different scales — #186, never searched, always
 * the caller's own stated ratio) for a match landing on one of the
 * corroborator's other occurrences of the tag.
 *
 * `corro: null` means the tag is drawn exactly once anywhere in the set —
 * the FIRST pad that captures real marker geometry (≥3 segments) is
 * accepted uncorroborated (`corroborated: false` in the result), which is
 * weaker evidence and the caller should disclose it, not silently trust it
 * the same as a corroborated anchor.
 *
 * Returns null when no pad ever produces a fingerprint that's both
 * non-degenerate AND (when a corroborator exists) recurs there — "no
 * repeatable marker geometry", the caller's cue to refuse and suggest a
 * manual symbol_sweep instead of guessing from text alone. */
export function corroborateFingerprint(
  anchorSegs: number[],
  anchorDims: { w: number; h: number },
  anchor: TagOcc,
  corro: { segs: number[]; occ: TagOcc[]; ratio: { scale: number; known: boolean } } | null,
  opts: MatchOptions = {},
): { fp: SymbolFingerprint; anchorRect: [Point, Point]; corroborated: boolean } | null {
  const cX = (v: number) => Math.max(0, Math.min(v, anchorDims.w));
  const cY = (v: number) => Math.max(0, Math.min(v, anchorDims.h));
  for (const padK of [1, 2, 3]) {
    const pad = padK * anchor.h;
    const rect: [Point, Point] = [
      [cX(anchor.bbox[0] - pad), cY(anchor.bbox[1] - pad)],
      [cX(anchor.bbox[2] + pad), cY(anchor.bbox[3] + pad)],
    ];
    let cand: SymbolFingerprint;
    try {
      cand = fingerprintSymbol(anchorSegs, rect);
    } catch (e) {
      // nothing fully inside yet → widen; a region-sized grab → bigger pads only get worse
      if (e instanceof Error && /region, not one symbol/.test(e.message)) break;
      continue;
    }
    if (cand.segments < MIN_MARKER_SEGMENTS) continue;
    if (!corro) return { fp: cand, anchorRect: rect, corroborated: false };
    let probe: SymbolMatchResult;
    try {
      probe = matchSymbol(cand, corro.segs, { ...opts, ...(corro.ratio.scale === 1 ? {} : { scale: corro.ratio.scale }) });
    } catch {
      continue; // this pad's fingerprint can't survive the trip (too small once scaled) — a wider pad may
    }
    const pr = (probe.scaled ? probe.scaled.footprint_px : cand.footprint) / 2 + anchor.h;
    if (corro.occ.some((o) => probe.matches.some((m) => Math.hypot(m.at[0] - o.cx, m.at[1] - o.cy) <= pr))) {
      return { fp: cand, anchorRect: rect, corroborated: true };
    }
  }
  return null;
}

export interface SweepSheetMatch extends SweepMatch {
  /** The tag-text evidence bbox that put this match IN the count — a match
   * counts only when the row's own tag sits inside its footprint. */
  tag_at: [number, number, number, number];
}
export interface SweepSheetResult {
  matches: SweepSheetMatch[];
  /** A matching marker whose footprint carries a SIBLING row's tag, not this
   * one's — that mark belongs to the sibling, disclosed with which tag. */
  excluded: Array<{ at: Point; tag: string }>;
  withheld: SweepWithheld[];
  /** A drawn occurrence of the tag with no matching marker geometry nearby —
   * disclosed, never counted: the tag is there, the symbol isn't. */
  text_only: Array<{ at: Point }>;
  candidates: { considered: number; dropped: number };
  complete: boolean;
  scaled?: NonNullable<SymbolMatchResult["scaled"]>;
}

/** Step 4 of sweep_schedule_row, for ONE sheet: sweep it for the corroborated
 * fingerprint (resized by `ratio` when this sheet is drawn at a different
 * scale than the anchor — #186) and classify every match against this
 * sheet's own drawn tag occurrences (`occ`) and every SIBLING row's
 * occurrences (`siblingOcc`, from every OTHER schedule row in the set) —
 * geometry alone is never identity, because drafting reuses one bubble
 * shape across many tags. Five outcomes, every one disclosed: a confident
 * match whose footprint carries this row's own tag COUNTS; a confident
 * match carrying a sibling's tag is EXCLUDED (named); a confident match
 * carrying no tag is WITHHELD as a question; matchSymbol's own near-matches
 * (`res.withheld`, the score-band between scoreLow/scoreHigh) are carried
 * through as WITHHELD too, with the tag-adjacency noted when one is drawn
 * beside it; a tag occurrence with no matching geometry nearby at all is
 * TEXT_ONLY. `tag` is the row's own canonical key, used only to word the
 * withheld/text_only reasons — it never gates what counts. */
export function classifySweepMatches(
  tag: string,
  fp: SymbolFingerprint,
  sheetSegs: number[],
  ratio: { scale: number; known: boolean },
  occ: TagOcc[],
  siblingOcc: Array<{ key: string; cx: number; cy: number }>,
  anchorH: number,
  opts: MatchOptions = {},
): SweepSheetResult {
  const res = matchSymbol(fp, sheetSegs, { ...opts, ...(ratio.scale === 1 ? {} : { scale: ratio.scale }) });
  const R = (res.scaled ? res.scaled.footprint_px : fp.footprint) / 2 + anchorH;
  const matches: SweepSheetMatch[] = [];
  const excluded: Array<{ at: Point; tag: string }> = [];
  const withheld: SweepWithheld[] = [];
  const matchedOcc = new Set<number>();
  // Pass 1: find every match's nearest occurrence (if any) within R, without
  // committing yet. One real drawn instance has exactly one leader/tag — two
  // raw match centroids both landing within R of the SAME single occurrence
  // is never two physical devices sharing one label, it is the marker's own
  // nearby furniture (a leader-line stub, a text underline) independently
  // clearing the score bar right next to itself and getting read as a second
  // hit. Same doctrine matchSymbol's own shadow-suppression comment already
  // states for the excludeCenter case ("two REAL instances can never sit
  // within half a symbol diagonal of each other without physically
  // overlapping") — applied here at the occurrence-claiming step so it also
  // catches the case where BOTH centroids sit far enough apart to survive
  // mergeR, but still both point at one tag (issue: sweep_schedule_row
  // false-doubled EWH-1/EBB-8 on the bessemer set — see takeoff-eval.mjs).
  const claims: Array<{ m: SweepMatch; oi: number }> = [];
  const unclaimed: SweepMatch[] = [];
  for (const m of res.matches) {
    let oi = -1;
    for (let k = 0; k < occ.length; k++) {
      if (Math.hypot(m.at[0] - occ[k].cx, m.at[1] - occ[k].cy) <= R) { oi = k; break; }
    }
    if (oi >= 0) claims.push({ m, oi }); else unclaimed.push(m);
  }
  // Best-scoring claim per occurrence wins (ties broken by reading order —
  // res.matches already arrives position-sorted, so the first claim seen for
  // a tied score is the earliest); every other claim on that same occurrence
  // is a real, disclosed question, not a silently dropped or silently
  // double-counted match.
  const bestForOcc = new Map<number, SweepMatch>();
  for (const { m, oi } of claims) {
    const cur = bestForOcc.get(oi);
    if (!cur || m.score > cur.score) bestForOcc.set(oi, m);
  }
  for (const { m, oi } of claims) {
    if (bestForOcc.get(oi) === m) { matchedOcc.add(oi); matches.push({ ...m, tag_at: occ[oi].bbox }); continue; }
    withheld.push({ ...m, reason: `the marker geometry matches near the "${tag}" tag, but a closer/better-scoring match already claims this same occurrence — most likely this instance's own leader-line or label furniture read a second time, not a second device; look before counting it` });
  }
  for (const m of unclaimed) {
    const sib = siblingOcc.find((sp) => Math.hypot(m.at[0] - sp.cx, m.at[1] - sp.cy) <= R);
    if (sib) { excluded.push({ at: m.at, tag: sib.key }); continue; }
    withheld.push({ ...m, reason: `the marker geometry matches but carries no "${tag}" tag within its footprint — an unlabeled instance or a shared marker shape; look before counting it` });
  }
  // matchSymbol's OWN near-matches (score in [scoreLow, scoreHigh)) — carried
  // through, not dropped, with the tag-adjacency noted when this row's tag
  // happens to sit right beside one (a real clue the near-match IS this row's).
  for (const w of res.withheld) {
    const near = occ.some((o) => Math.hypot(w.at[0] - o.cx, w.at[1] - o.cy) <= R);
    withheld.push(near ? { ...w, reason: `${w.reason} — and the "${tag}" tag is drawn beside it` } : w);
  }
  const byPos = (a: { at: Point }, b: { at: Point }) => a.at[1] - b.at[1] || a.at[0] - b.at[0];
  matches.sort(byPos); excluded.sort(byPos); withheld.sort(byPos);
  // An occurrence sitting at (or right beside) opts.excludeCenter is the
  // seed's own shadow: matchSymbol suppresses it from res.matches AND
  // res.withheld before we ever see it (it's already counted — as the seed
  // — not an unexplained gap), so it must not fall through to text_only.
  const ex = opts.excludeCenter;
  const text_only = occ
    .filter((o, k) => !matchedOcc.has(k)
      && !res.withheld.some((w) => Math.hypot(w.at[0] - o.cx, w.at[1] - o.cy) <= R)
      && !(ex && Math.hypot(o.cx - ex[0], o.cy - ex[1]) <= R))
    .map((o) => ({ at: [Math.round(o.cx * 10) / 10, Math.round(o.cy * 10) / 10] as Point }));
  return {
    matches, excluded, withheld, text_only,
    candidates: res.candidates, complete: res.complete,
    ...(res.scaled ? { scaled: res.scaled } : {}),
  };
}

// ── same-tag corroborator discipline gate ───────────────────────────────────
// sweep_schedule_row: a tag's OTHER occurrence, on a different plan sheet, is
// only real corroborating evidence for the SAME symbol's own linework when
// it's a plausible second DRAWN INSTANCE of that symbol — real case found on
// itd-d1-lab (HUM-1, DFC-1): the tag's only other drawn occurrence anywhere
// sat on a different trade's own "enlarged" plan of the same room (a
// plumbing sheet's callout at the unit's water/condensate connection), which
// by the IDENTICAL doctrine the cross-discipline redundant-view collapse
// below already establishes is a reference to the SAME single physical
// device for another trade's own drawing — never a second occurrence of the
// mechanical symbol's own linework. Requiring it to recur there manufactured
// a false "linework does not recur" refusal on a tag that was genuinely,
// correctly, singly installed. `disciplineOfSheetNumber` is the identical
// first-token-of-the-sheet-number read `dedupeCrossDisciplineRoomViews`'s own
// caller and layers.ts's DISCIPLINES table already trust — extracted here so
// both the corroborator gate and the redundant-view collapse share one read,
// never two that could silently drift.
export function disciplineOfSheetNumber(sheetNumber: string | null | undefined): string | null {
  const m = /^[A-Z]{1,3}/.exec((sheetNumber || "").trim().toUpperCase());
  return m ? m[0] : null;
}

/** Among same-tag corroborator candidates (already sorted by the caller's
 * own preference — most occurrences first, ties by sheet order), pick the
 * first one that shares the anchor sheet's own AIA discipline — real
 * corroborating evidence, a plausible second drawn instance of the same
 * symbol. Returns null when the anchor's discipline IS known but no
 * candidate shares it: the caller's cue to treat the tag as having no
 * same-tag corroborator at all (same as a tag drawn exactly once anywhere),
 * falling through to cross-tag/uncorroborated handling rather than refusing
 * on a cross-discipline reference that was never going to recur. When the
 * anchor's own discipline can't be read at all (never guessed — no
 * classifiable sheet number), there is no cross-discipline distinction to
 * safely draw, so the caller's first candidate is returned unchanged — the
 * prior any-sheet behavior, exactly as before this gate existed. */
export function pickSameDisciplineCorroborator<T>(
  anchorSheetNumber: string | null | undefined,
  candidates: T[],
  sheetNumberOf: (c: T) => string | null | undefined,
): T | null {
  if (!candidates.length) return null;
  const anchorDisc = disciplineOfSheetNumber(anchorSheetNumber);
  if (!anchorDisc) return candidates[0];
  return candidates.find((c) => disciplineOfSheetNumber(sheetNumberOf(c)) === anchorDisc) ?? null;
}

// ── cross-sheet redundant room-view dedup ───────────────────────────────────
// A real, common drafting convention: two DIFFERENT SHEETS each draw their
// OWN "enlarged"/purpose-specific plan of the SAME physical room, redrawing
// whatever equipment sits in it for that sheet's own reference. A schedule
// row's tag drawn once on each sheet's own view of the SAME room is the SAME
// physical device, not one install per sheet — sweep_schedule_row's
// per-sheet fingerprint search has no way to know that on its own, since
// each sheet's tag occurrence independently clears the match bar on its own
// linework. This is a GENERIC pattern (any tag, any set that uses this
// convention), not specific to any one project, sheet, or tag — no
// filename/page/tag is named here. Two shapes of it are both real,
// confirmed corpus cases: CROSS-discipline (the original AC-1 bug — an
// M-series sheet and a P-series sheet both redrawing one physical device)
// and SAME-discipline-different-sheet (itd-d1-lab-mechanical.pdf's WC-1/
// S-2/US-2: P1.0 "PLUMBING FOUNDATION PLAN" underground rough-in and P2.0
// "PLUMBING FLOOR PLAN" above-floor fixture layout both redraw the SAME
// physical fixture at near-pixel-identical page coordinates) — collapseGroup
// (below) groups by SHEET, a strict generalization of grouping by discipline
// that catches both shapes identically; see its own comment for why this is
// provably backward-compatible with every discipline-keyed case.
//
// The signal used: the two occurrences sit in the SAME named/numbered room
// (via the existing room-tag reader, sheetgraph.ts's roomTags — the identical
// "digit(s) drawn near a bubble" pattern already trusted for room-finish
// takeoffs). `discipline` (M/P/E/… the standard "M3.0"/"P4.0" convention,
// read the same first-token-of-the-sheet-number way layers.ts's DISCIPLINES
// table reads a CAD layer name) is still required to be READABLE at all
// before an instance enters dedup — an instance on a sheet with no
// classifiable AIA-style sheet number is never guessed into this — but is no
// longer itself the collapse key. Two genuinely SEPARATE installed units
// sharing one tag would ordinarily sit in different rooms — that is what
// makes them separate installs — so "same room, same tag, different sheet"
// is a narrow, specific shape, not a general "trust the first count"
// heuristic.
//
// Never applied when: the two occurrences share a SHEET (a real repeat on
// one sheet's own drawing is a genuine separate-install signal, not a
// redrawn reference — left alone); no room can be confidently attributed to
// an occurrence (never guessed — see maxDist below); or only one sheet
// is represented in a room (nothing to collapse against). The kept count for
// a duplicated room is the LARGEST single-sheet count seen there — never
// the SUM (double/triple-counts the redundant views, the actual AC-1 bug)
// and never the smallest (a partial crop that only shows some of a room's
// real units must never silently undercut a fuller sibling view).
export interface RoomCandidate { tag: string; name: string; bbox: [number, number, number, number] }
export interface RoomSweepInstance<Id> {
  id: Id;
  sheet: string;
  /** Full title-block sheet number, when available. Paired discipline
   * overlays commonly share its numeric view suffix (MH121 / MP121). */
  sheetNumber?: string | null;
  /** Leading AIA discipline letters off the sheet's own title-block sheet
   *  number ("M3.0" → "M"); null when no sheet number was read — an
   *  attribution never guessed, so the instance never enters the dedup. */
  discipline: string | null;
  at: Point;
  /** This occurrence's own sheet's rooms (sheetgraph.ts's roomTags output)
   *  and its full page size, so "nearest room" can be bounded to a plausible
   *  fraction of the sheet rather than ever crediting a room that merely
   *  happens to be the closest number ON A SHEET with no room genuinely near
   *  the mark (an unrelated title-block digit or grid bubble, e.g.). */
  rooms: RoomCandidate[];
  sheetWidthPx: number;
  sheetHeightPx: number;
}
export interface RedundantRoomView<Id> {
  id: Id;
  sheet: string;
  room: string;
  /** The discipline (and one of its sheets) whose count this duplicates. */
  keptDiscipline: string;
  keptSheet: string;
}

export interface TaggedViewLandmark {
  tag: string;
  at: Point;
}

export interface TaggedViewCaption {
  text: string;
  at: Point;
}

export interface TagClaimCoverage {
  claimed: number;
  rawMatches: number;
  segments: number;
}

/**
 * Rank fingerprints by evidence tied to the requested tag, not by generic
 * geometric hit count. More distinct claimed tag occurrences wins; equal
 * coverage prefers fewer unclaimed geometric hits, then the richer shape.
 */
export function prefersTagClaimCoverage(candidate: TagClaimCoverage, current: TagClaimCoverage | null): boolean {
  if (!current) return true;
  if (candidate.claimed !== current.claimed) return candidate.claimed > current.claimed;
  if (candidate.rawMatches !== current.rawMatches) return candidate.rawMatches < current.rawMatches;
  return candidate.segments > current.segments;
}

/**
 * Schedules whose marks identify individually numbered equipment rather
 * than repeatable type symbols. Repeated appearances of one such mark are
 * plan/section/detail references to the same scheduled unit.
 */
export function isIndividuallyMarkedEquipmentSchedule(title: string): boolean {
  const squashed = title.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /(?:AIRHANDLING|DEDICATEDOUT(?:SIDE|DOOR)AIR|FANCOIL|ENERGYRECOVERY|ROOFTOP|CONDENSINGUNIT|HEATPUMP|PUMP|BOILER|CHILLER|UNITHEATER|DEHUMIDIFIER|EXHAUSTFAN)/.test(squashed)
    && !/(?:DIFFUSER|GRILLE|REGISTER|FIXTURE|LUMINAIRE)/.test(squashed);
}

/**
 * Collapse repeated plan views drawn side-by-side on one sheet.
 *
 * Room attribution cannot distinguish these because both views may omit room
 * labels entirely. Instead, require a strong sheet-intrinsic registration
 * signal: at least four distinct schedule tags must occur exactly once in
 * each page half and retain the same coordinate on the orthogonal axis. This
 * is the characteristic shape of two system-specific overlays of one floor
 * plan (for example duct and piping), while ordinary repeated type marks are
 * excluded from the evidence because they occur more than once per half.
 *
 * Once that registration is proven, keep the larger count from either view,
 * never the sum and never the smaller partial view. Repeats within one view
 * remain untouched. Vertical and horizontal layouts are both supported.
 */
export function dedupeAlignedSameSheetViews<Id>(
  instances: Array<{ id: Id; at: Point }>,
  landmarks: TaggedViewLandmark[],
  sheetWidthPx: number,
  sheetHeightPx: number,
  captions: TaggedViewCaption[] = [],
): Id[] {
  if (instances.length < 2 || landmarks.length < 8) return [];

  type Axis = "vertical" | "horizontal";
  const captionKind = (text: string): "duct" | "pipe" | null =>
    /\bDUCT\b/i.test(text) ? "duct" : /\b(?:PIPE|PIPING)\b/i.test(text) ? "pipe" : null;
  const captionStem = (text: string): string =>
    text.toUpperCase().replace(/\b(?:DUCT|PIPE|PIPING)\b/g, "").replace(/[^A-Z0-9]+/g, " ").trim();
  let captionPair: [TaggedViewCaption, TaggedViewCaption] | null = null;
  for (const first of captions) {
    for (const second of captions) {
      if (first === second
        || !/\bENLARGED\s+PLANS?\b/i.test(first.text)
        || !/\bENLARGED\s+PLANS?\b/i.test(second.text)
        || captionKind(first.text) === null
        || captionKind(second.text) === null
        || captionKind(first.text) === captionKind(second.text)
        || captionStem(first.text) !== captionStem(second.text)) continue;
      captionPair = [first, second];
      break;
    }
    if (captionPair) break;
  }
  const captionAxis: Axis | null = captionPair
    ? Math.abs(captionPair[0].at[0] - captionPair[1].at[0]) >= Math.abs(captionPair[0].at[1] - captionPair[1].at[1])
      ? "vertical" : "horizontal"
    : null;
  const splitFor = (axis: Axis): number => captionPair && captionAxis === axis
    ? ((axis === "vertical" ? captionPair[0].at[0] + captionPair[1].at[0] : captionPair[0].at[1] + captionPair[1].at[1]) / 2)
    : (axis === "vertical" ? sheetWidthPx / 2 : sheetHeightPx / 2);
  const support = (axis: Axis): { aligned: number; paired: number } => {
    const byTag = new Map<string, TaggedViewLandmark[]>();
    for (const landmark of landmarks) {
      const tag = landmark.tag.trim().toUpperCase();
      const group = byTag.get(tag);
      if (group) group.push(landmark); else byTag.set(tag, [landmark]);
    }
    const split = splitFor(axis);
    const orthogonalTolerance = (axis === "vertical" ? sheetHeightPx : sheetWidthPx) * 0.03;
    let aligned = 0, paired = 0;
    for (const group of byTag.values()) {
      const first = group.filter((p) => (axis === "vertical" ? p.at[0] : p.at[1]) < split);
      const second = group.filter((p) => (axis === "vertical" ? p.at[0] : p.at[1]) >= split);
      if (first.length !== 1 || second.length !== 1) continue;
      paired++;
      const orthogonalDelta = Math.abs(
        (axis === "vertical" ? first[0].at[1] : first[0].at[0])
        - (axis === "vertical" ? second[0].at[1] : second[0].at[0]),
      );
      if (orthogonalDelta <= orthogonalTolerance) aligned++;
    }
    return { aligned, paired };
  };

  const verticalSupport = support("vertical");
  const horizontalSupport = support("horizontal");
  const axis: Axis = captionAxis ?? (verticalSupport.aligned >= horizontalSupport.aligned ? "vertical" : "horizontal");
  const evidence = axis === "vertical" ? verticalSupport : horizontalSupport;
  const split = splitFor(axis);
  if (evidence.aligned < 4 && !(captionPair && evidence.paired >= 4 && evidence.aligned >= 2)) return [];

  const first = instances.filter((p) => (axis === "vertical" ? p.at[0] : p.at[1]) < split);
  const second = instances.filter((p) => (axis === "vertical" ? p.at[0] : p.at[1]) >= split);
  if (!first.length || !second.length) return [];
  // Deterministic tie: retain the first (left/top) view.
  return (first.length >= second.length ? second : first).map((p) => p.id);
}

/** Fraction of the sheet's own diagonal a room's label must sit within to be
 * credited to a nearby occurrence — generous enough for a real "enlarged"
 * partial-sheet plan (which crops tightly around the one room it shows),
 * tight enough to reject an unrelated title-block/revision digit clear
 * across a full floor-plan sheet. */
const ROOM_ATTRIBUTION_MAX_DIAGONAL_FRAC = 0.2;

/** Shared "collapse a group of same-tag, multi-SHEET instances" decision —
 * keep the SHEET with the MOST occurrences in the group (never the sum,
 * never the fewest — the doctrine both the room-keyed and the
 * coordinate-keyed grouping below share); ties broken alphabetically by
 * sheet for full determinism. Returns nothing when the group is
 * single-sheet — a real repeat WITHIN one sheet's own drawing is a genuine
 * separate-install signal, never collapsed (test: "same tag, same room,
 * SAME discipline — a real repeat within one trade").
 *
 * Grouped by SHEET, not by discipline (2026-08-28, itd-d1-lab-mechanical.pdf
 * WC-1/S-2/US-2 shape): discipline was the original, narrower proxy this was
 * built against (the real AC-1 bug — an M-series sheet and a P-series sheet
 * both redrawing one physical device for their own trade's reference), but
 * the SAME redundant-view pattern also occurs WITHIN one discipline — real,
 * measured case: itd-d1-lab-mechanical.pdf's P1.0 "PLUMBING FOUNDATION PLAN"
 * (underground waste/vent rough-in coordination) and P2.0 "PLUMBING FLOOR
 * PLAN" (above-floor domestic water) both draw the SAME physical fixture
 * (WC-1 in "Rest. 102") at near-pixel-identical page coordinates (~7px
 * apart, RENDER_SCALE=2) — two different-PURPOSE plumbing plans of the
 * identical footprint, not two installed toilets. `discipline` remains the
 * ELIGIBILITY gate one level up (an instance with no readable AIA discipline
 * still never enters dedup at all — unchanged), but the actual collapse
 * key is the sheet itself, a strict generalization: every existing
 * cross-discipline case already had each discipline confined to its own
 * single sheet, so grouping by sheet reproduces every prior result exactly
 * (verified: all pre-existing dedupeCrossDisciplineRoomViews tests pass
 * unchanged) while additionally catching this same-discipline,
 * different-sheet shape the discipline-keyed grouping structurally could
 * not see. `keptDiscipline` is still reported (read off the kept sheet's own
 * instances) so callers/tests that care which TRADE view survived keep
 * working unchanged. */
function collapseGroup<Id, A extends { discipline: string | null; sheet: string; id: Id }>(
  group: A[], describeRoom: (kept: A) => string,
): RedundantRoomView<Id>[] {
  const bySheet = new Map<string, A[]>();
  for (const a of group) {
    const arr = bySheet.get(a.sheet);
    if (arr) arr.push(a); else bySheet.set(a.sheet, [a]);
  }
  if (bySheet.size < 2) return [];
  let keptSheet = "", keptGroup: A[] = [];
  for (const [sheet, arr] of [...bySheet.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (arr.length > keptGroup.length) { keptSheet = sheet; keptGroup = arr; }
  }
  const keptDisc = keptGroup[0].discipline!;
  const out: RedundantRoomView<Id>[] = [];
  for (const [sheet, arr] of bySheet) {
    if (sheet === keptSheet) continue;
    for (const a of arr) out.push({ id: a.id, sheet: a.sheet, room: describeRoom(a), keptDiscipline: keptDisc, keptSheet });
  }
  return out;
}

/** How close (image px, same RENDER_SCALE throughout this pipeline, so a
 * real cross-sheet px distance is meaningful without a scale conversion) two
 * cross-discipline matches with NO attributable room must sit to be trusted
 * as the same physical device redrawn — not a room-sized radius (that would
 * risk crediting two genuinely different nearby devices), a tight one: real,
 * measured case (itd-d1-lab-mechanical.pdf's LEF-1, an exhaust fan serving a
 * building-wide riser with no room number drawn anywhere near it on EITHER
 * its M2.0 or P3.0 "enlarged" view) sits 9.2px apart. */
const COORD_ATTRIBUTION_MAX_PX = 40;

export function dedupeCrossDisciplineRoomViews<Id>(instances: RoomSweepInstance<Id>[]): RedundantRoomView<Id>[] {
  type Attributed = RoomSweepInstance<Id> & { room: RoomCandidate };
  const attributed: Attributed[] = [];
  const unattributed: RoomSweepInstance<Id>[] = [];
  const sheetPair = (a: string, b: string): string => a < b ? `${a}\0${b}` : `${b}\0${a}`;
  const tightPairCounts = new Map<string, number>();
  for (let i = 0; i < instances.length; i++) {
    for (let j = i + 1; j < instances.length; j++) {
      if (instances[i].sheet === instances[j].sheet
        || Math.hypot(instances[i].at[0] - instances[j].at[0], instances[i].at[1] - instances[j].at[1]) > 30) continue;
      const key = sheetPair(instances[i].sheet, instances[j].sheet);
      tightPairCounts.set(key, (tightPairCounts.get(key) || 0) + 1);
    }
  }
  for (const inst of instances) {
    if (!inst.discipline) continue; // no discipline read at all — never enters either path
    let best: RoomCandidate | null = null, bestD = Infinity;
    if (inst.rooms.length) {
      const maxDist = ROOM_ATTRIBUTION_MAX_DIAGONAL_FRAC * Math.hypot(inst.sheetWidthPx, inst.sheetHeightPx);
      for (const r of inst.rooms) {
        const cx = (r.bbox[0] + r.bbox[2]) / 2, cy = (r.bbox[1] + r.bbox[3]) / 2;
        const d = Math.hypot(inst.at[0] - cx, inst.at[1] - cy);
        if (d < bestD) { bestD = d; best = r; }
      }
      if (!best || bestD > maxDist) best = null;
      // A bare one/two-digit token with no room name is weak enough to be a
      // keynote, detail number, or duct size. It must not collapse two
      // different plan sheets merely because both nearest-token reads happen
      // to say "12"; named rooms and conventional 3+ digit room tags retain
      // the existing attribution path.
      if (best && !best.name.trim() && /^\d{1,2}$/.test(best.tag.trim())) best = null;
    }
    if (best) attributed.push({ ...inst, room: best });
    else unattributed.push(inst); // no room credited — try coordinate proximity below, never guessed either way
  }
  const byRoom = new Map<string, Attributed[]>();
  for (const a of attributed) {
    const key = `${a.room.tag.trim().toUpperCase()}|${a.room.name.trim().toUpperCase()}`;
    const arr = byRoom.get(key);
    if (arr) arr.push(a); else byRoom.set(key, [a]);
  }
  const out: RedundantRoomView<Id>[] = [];
  for (const group of byRoom.values()) {
    out.push(...collapseGroup<Id, Attributed>(group, (a) => `${a.room.name ? `${a.room.name} ` : ""}${a.room.tag}`.trim()));
  }

  // Asymmetric attribution fallback: one drawing can carry a readable room
  // label while its registered counterpart omits it. A tight same-location
  // cross-sheet pair is still the same redraw; requiring both sides to be
  // either attributed or unattributed strands exactly this mixed case.
  const roomRedundant = new Set(out.map((entry) => entry.id));
  const mixed = [
    ...attributed.filter((entry) => !roomRedundant.has(entry.id)),
    ...unattributed,
  ];
  const mixedParent = Array.from({ length: mixed.length }, (_, i) => i);
  const mixedRoot = (i: number): number =>
    mixedParent[i] === i ? i : (mixedParent[i] = mixedRoot(mixedParent[i]));
  const attributedIds = new Set(attributed.map((entry) => entry.id));
  for (let i = 0; i < mixed.length; i++) {
    for (let j = i + 1; j < mixed.length; j++) {
      const distance = Math.hypot(mixed[i].at[0] - mixed[j].at[0], mixed[i].at[1] - mixed[j].at[1]);
      const asymmetric = attributedIds.has(mixed[i].id) !== attributedIds.has(mixed[j].id);
      // Extremely tight registration overrides contradictory nearest-room
      // reads only when another pair independently registers the same two
      // sheets. One coincidentally aligned device on different floors is
      // not enough evidence that the drawings are redundant overlays.
      const registeredPair = (tightPairCounts.get(sheetPair(mixed[i].sheet, mixed[j].sheet)) || 0) >= 2;
      if (mixed[i].sheet === mixed[j].sheet
        || !((distance <= 30 && registeredPair) || (asymmetric && distance <= COORD_ATTRIBUTION_MAX_PX))) continue;
      const ri = mixedRoot(i), rj = mixedRoot(j);
      if (ri !== rj) mixedParent[ri] = rj;
    }
  }
  const mixedClusters = new Map<number, RoomSweepInstance<Id>[]>();
  for (let i = 0; i < mixed.length; i++) {
    const r = mixedRoot(i);
    const arr = mixedClusters.get(r);
    if (arr) arr.push(mixed[i]); else mixedClusters.set(r, [mixed[i]]);
  }
  const mixedHandled = new Set<Id>();
  for (const cluster of mixedClusters.values()) {
    if (cluster.length < 2) continue;
    cluster.forEach((entry) => mixedHandled.add(entry.id));
    out.push(...collapseGroup<Id, RoomSweepInstance<Id>>(cluster, () => "(one view has no readable room — same-location redraw)"));
  }

  // Coordinate-proximity fallback — ONLY for instances no room could be
  // credited to at all (never overrides a real room attribution above).
  // Simple connected-components clustering: two instances within
  // COORD_ATTRIBUTION_MAX_PX of each other join one cluster (transitively —
  // A near B near C clusters all three, same as the real drafting case
  // would produce for a 3+-discipline redraw), then the identical
  // multi-discipline collapse doctrine applies per cluster.
  const proximityCandidates = unattributed.filter((entry) => !mixedHandled.has(entry.id));
  const n = proximityCandidates.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(proximityCandidates[i].at[0] - proximityCandidates[j].at[0], proximityCandidates[i].at[1] - proximityCandidates[j].at[1]) <= COORD_ATTRIBUTION_MAX_PX) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
  }
  const clusters = new Map<number, RoomSweepInstance<Id>[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    const arr = clusters.get(r);
    if (arr) arr.push(proximityCandidates[i]); else clusters.set(r, [proximityCandidates[i]]);
  }
  for (const cluster of clusters.values()) {
    out.push(...collapseGroup<Id, RoomSweepInstance<Id>>(cluster, () => "(no room drawn nearby — same-location redraw)"));
  }

  // Paired discipline-overlay fallback. AIA sheet series commonly preserve
  // the numeric plan/view identity while changing only the discipline
  // letters (MH121 / MP121). When the same tag also lands within 5% of the
  // page diagonal on those paired sheets, registration is stronger than a
  // missing or noisy room label. This is not a suffix-only collapse.
  const alreadyRedundant = new Set(out.map((entry) => entry.id));
  const viewStem = (sheetNumber: string | null | undefined): string | null => {
    const m = /^[A-Z]{1,3}[- ]?(.+)$/.exec((sheetNumber || "").trim().toUpperCase());
    return m?.[1]?.replace(/[^A-Z0-9]/g, "") || null;
  };
  const byViewStem = new Map<string, RoomSweepInstance<Id>[]>();
  for (const inst of instances) {
    if (!inst.discipline || alreadyRedundant.has(inst.id)) continue;
    const stem = viewStem(inst.sheetNumber);
    if (!stem) continue;
    const arr = byViewStem.get(stem);
    if (arr) arr.push(inst); else byViewStem.set(stem, [inst]);
  }
  for (const group of byViewStem.values()) {
    if (new Set(group.map((entry) => entry.sheet)).size < 2) continue;
    const parent = Array.from({ length: group.length }, (_, i) => i);
    const root = (i: number): number => parent[i] === i ? i : (parent[i] = root(parent[i]));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].sheet === group[j].sheet) continue;
        const maxDist = Math.min(
          Math.hypot(group[i].sheetWidthPx, group[i].sheetHeightPx),
          Math.hypot(group[j].sheetWidthPx, group[j].sheetHeightPx),
        ) * 0.05;
        if (Math.hypot(group[i].at[0] - group[j].at[0], group[i].at[1] - group[j].at[1]) > maxDist) continue;
        const ri = root(i), rj = root(j);
        if (ri !== rj) parent[ri] = rj;
      }
    }
    const registered = new Map<number, RoomSweepInstance<Id>[]>();
    for (let i = 0; i < group.length; i++) {
      const r = root(i);
      const arr = registered.get(r);
      if (arr) arr.push(group[i]); else registered.set(r, [group[i]]);
    }
    for (const cluster of registered.values()) {
      const collapsed = collapseGroup<Id, RoomSweepInstance<Id>>(cluster, () => "(paired discipline-overlay sheets)");
      for (const entry of collapsed) {
        if (!alreadyRedundant.has(entry.id)) {
          alreadyRedundant.add(entry.id);
          out.push(entry);
        }
      }
    }
  }
  return out;
}
