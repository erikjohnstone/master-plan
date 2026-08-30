// Inline motif matching (accuracy-hardening plan Phase 4) — anchoring a small,
// recognizable motif that is structurally EMBEDDED within a longer duct run
// (a tapered hatched register/grille transition), never marqueed as its own
// isolated block the way symbolsweep.ts's whole-shape fingerprint model
// assumes. Found real and named in the maturity plan's own Phase 1 corpus
// work: `bessemer`'s own row-to-symbol recall caps at 73.3% (11/15) because
// SR-1/SR-2/TG-1/TG-2 are exactly this shape — a real, drawn, tagged
// register/grille mark whose own hatch fill IS the identifying feature, with
// no independent 4-sided perimeter of its own (two of its "sides" are
// literally the tail end of the same long duct-wall stroke feeding it).
//
// Measured live against the real Bessemer sheet before writing a line of
// this file (never assumed): marqueeing SR-1's own box directly and running
// the EXISTING `symbol_sweep` whole-shape matcher (`matchSymbol`) scores every
// real sibling SR-1 instance at only ~76-77% — well under the 92% commit
// bar — because the register's own PHYSICAL SIZE genuinely differs by CFM
// rating (a 145 CFM register is a visibly bigger box, with more hatch fill,
// than a 55 CFM one) — this is not drafting sloppiness or noise, it is a
// real, designed size difference between real instances of "the same
// symbol type." A whole-shape, near-exact-segment-count fingerprint can
// never score these as one symbol; a NEW, coarser mode is the actual fix.
//
// What identifies a real register/grille mark is not its exact segment
// count — it is that a COMPACT, densely-hatched region sits at roughly a
// given real-world size, at a given hatch angle/pitch (a real drafting
// convention: the pitch drifts only a little across genuinely different
// box sizes, ~10-15% measured, nowhere near the 25%+ drift that would make
// it ambiguous with an unrelated texture). So: cluster a hatch family's own
// members by real 2D PROXIMITY (not connectivity — hatch strokes routinely
// do NOT touch each other at all, confirmed live: `buildMepGraph`'s own
// JTS-noding reuse, legendlearn.ts's own working answer to a superficially
// similar clustering problem, was tried FIRST here and produces only
// degenerate single-stroke "clusters" for this real register's own hatch
// fill, because its dense rows of short parallel dashes never share an
// endpoint — a genuinely different shape of problem from a legend glyph's
// own touching strokes, so a genuinely different clustering primitive is
// needed, not reused). A cluster whose real-world size is small enough and
// whose member count is high enough to be real fill (not sparse noise) is
// a real candidate; matched against the seed's own real-world size within a
// tolerance wide enough for a different CFM rating, narrow enough to
// exclude an unrelated texture region.
import { hatchFamilies, type HatchFamily } from "./oneclick.ts";
import type { FlatSpan, TagOcc } from "./symbolsweep.ts";
import { leftoverLabeledOccs, typicalMultiplierNear } from "./symbolsweep.ts";
import { MARK_CLUSTER_K } from "./markid.ts";

export type Point = [number, number];

/** How far apart (in multiples of the family's own hatch pitch) two hatch
 * strokes may sit and still be treated as the same physical fill region.
 * Measured against the real Bessemer register: its own rows sit ~0.5-2px
 * apart at a ~2.1-2.4px pitch — comfortably inside 1.5x. A real, caught bug
 * at 3x: one real duct's own family also carried a handful of unrelated
 * marks (dimension ticks, wall dashes) at ~9-14px spacing along the SAME
 * duct run, sharing this family's exact (angle, pitch) signature by
 * coincidence — a 3x margin (bridge distance ~2× that) chained them all
 * the way into the register's own cluster, inflating a real ~35×48px box
 * into a false ~36×622px strip that then failed the aspect filter below and
 * silently dropped a real instance. Measured directly: the real gap
 * distribution's own p90 is ~7px with the next gap at ~14px — a clean,
 * real break the noise sits clearly on the far side of at 1.5x (bridge
 * ~2×pitch, well under 9px) but not at 3x. */
const PROXIMITY_PITCH_MULT = 1.5;
/** A cluster with fewer members than this is noise (a stray tick mark, a
 * dimension hash) sharing this family's (angle, pitch) signature by
 * coincidence, not a real hatch-filled box — measured live: every real
 * noise cluster on the real Bessemer sheet tops out at 21 members, every
 * real register box has 100+. */
const MIN_FILL_MEMBERS = 40;
/** A cluster whose short side is under this fraction of its long side is a
 * degenerate strip (a border rule, a long dimension line's own tick-hash
 * run) — never a real 2-D hatch-filled box. */
const MIN_ASPECT_FRAC = 0.15;
/** Real-world size tolerance band, as a fraction of the seed's own size —
 * wide enough that a different CFM rating's genuinely different physical
 * size still matches (measured live: a 145 CFM and a 55 CFM real register
 * on the same sheet differ by close to 2x in one dimension), narrow enough
 * to exclude an unrelated hatch region (measured live: the sheet's other
 * hatch regions run 5-20x bigger in real feet, not a close call). */
const SIZE_TOL_FRAC = 1.2;
/** Hatch pitch tolerance, as a fraction of the seed's own pitch — measured
 * live: the same real symbol at a different physical size still pitches its
 * hatch within ~15%; an unrelated texture is either a wildly different
 * pitch or (per MIN_FILL_MEMBERS/size) already excluded by then anyway. */
const PITCH_TOL_FRAC = 0.35;
/** A real fill region sits LOCAL to the rect that found it — "nearest
 * cluster to the rect's own center" (fingerprintInlineMotif, below) is only
 * a safe rule when every candidate cluster is roughly rect-sized to begin
 * with. sweep_schedule_row's own caller (corroborateInlineMotif,
 * mcp/src/session.ts) grows this rect around a tag's drawn text with NO
 * marqueed shape to bound it — unlike sweep_inline_motif's own tight,
 * human-marqueed seed_rect — so "nearest to center" can walk clean past the
 * rect's own bounds into an unrelated, much larger hatch region that merely
 * happens to share this family's (angle, pitch) signature. Measured live
 * against a real HVAC sheet (itd-d1-lab-mechanical.pdf, tag "B-2"): a
 * search rect ~192x228px around the tag's own text found — and accepted —
 * an 800+px-tall wall/insulation cross-hatch field this way (684 members,
 * nowhere near a compact register/grille), because that field's pitch
 * coincidentally matched and its bbox happened to sit nearest the rect's
 * center. A real register's own cluster is on the order of the rect that
 * finds it, never many times larger — this bounds the ratio directly,
 * rather than trying to characterize "wall hatch" by shape (which a
 * legitimately large real register must not be penalized for). */
const MAX_CLUSTER_TO_RECT_FRAC = 2.5;

export interface InlineMotifFingerprint {
  /** Hatch angle, folded to [0, 90) — rotation-normalized (a duct run's own
   * 90/180/270 turn keeps the same relative hatch angle; see matchSymbol's
   * own identical 90-degree-family assumption). */
  angleMod90: number;
  pitchPx: number;
  widthPx: number;
  heightPx: number;
  /** Real-world size, when a scale is committed on the seed sheet — null
   * when not (matching honestly falls back to image-px comparison, same
   * sheet only, same discipline as every scale-dependent tool here). */
  widthFt: number | null;
  heightFt: number | null;
  members: number;
  center: Point;
  /** Tight bbox around the seed's own fill cluster — feed straight into
   * symbol_sweep's own seed_rect for corroboration, or view_sheet to look. */
  rect: [Point, Point];
}

export interface InlineMotifMatch {
  at: Point;
  rect: [Point, Point];
  w_px: number;
  h_px: number;
  w_ft: number | null;
  h_ft: number | null;
  members: number;
  /** How closely this candidate's own real-world size matches the seed's,
   * 0-1 (1 = identical) — disclosed, never hidden, the same "score means
   * something concrete" doctrine symbol_sweep's own score carries. */
  size_score: number;
}

export interface InlineMotifWithheld extends InlineMotifMatch {
  reason: string;
}

export interface InlineMotifResult {
  matches: InlineMotifMatch[];
  withheld: InlineMotifWithheld[];
  /** Candidate clusters considered before size/aspect filtering — for
   * disclosure only, mirrors symbol_sweep's own candidates.considered. */
  candidates_considered: number;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Cluster = { x0: number; y0: number; x1: number; y1: number; members: number };

/** Real-2D-proximity clusters within ONE hatch family's own members —
 * expand each member's own bbox by `marginPx` and union-find merge overlaps.
 * Deliberately NOT connectivity/JTS-based (see this file's own header
 * comment for why that was tried first, on this exact real data, and
 * produced only degenerate single-stroke clusters). */
function clusterByProximity(segs: number[], memberIdx: number[], marginPx: number): Cluster[] {
  const boxes: Box[] = memberIdx.map((i) => {
    const x1 = segs[i * 4], y1 = segs[i * 4 + 1], x2 = segs[i * 4 + 2], y2 = segs[i * 4 + 3];
    return {
      x0: Math.min(x1, x2) - marginPx, y0: Math.min(y1, y2) - marginPx,
      x1: Math.max(x1, x2) + marginPx, y1: Math.max(y1, y2) + marginPx,
    };
  });
  const n = boxes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const overlaps = (a: Box, b: Box) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
  // Grid-bucketed sweep, not naive O(n^2): a dense sheet's own biggest hatch
  // family runs into the thousands of members, and this runs once per sweep.
  const cell = Math.max(1, marginPx);
  const buckets = new Map<string, number[]>();
  const keyOf = (gx: number, gy: number) => `${gx},${gy}`;
  for (let i = 0; i < n; i++) {
    const gx0 = Math.floor(boxes[i].x0 / cell), gx1 = Math.floor(boxes[i].x1 / cell);
    const gy0 = Math.floor(boxes[i].y0 / cell), gy1 = Math.floor(boxes[i].y1 / cell);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
      const k = keyOf(gx, gy);
      let b = buckets.get(k); if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }
  }
  for (const b of buckets.values()) {
    for (let a = 0; a < b.length; a++) for (let c = a + 1; c < b.length; c++) {
      if (overlaps(boxes[b[a]], boxes[b[c]])) union(b[a], b[c]);
    }
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const r = find(i); let g = groups.get(r); if (!g) { g = []; groups.set(r, g); } g.push(i); }
  const out: Cluster[] = [];
  for (const idxs of groups.values()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const k of idxs) {
      const i = memberIdx[k];
      const sx1 = segs[i * 4], sy1 = segs[i * 4 + 1], sx2 = segs[i * 4 + 2], sy2 = segs[i * 4 + 3];
      x0 = Math.min(x0, sx1, sx2); x1 = Math.max(x1, sx1, sx2);
      y0 = Math.min(y0, sy1, sy2); y1 = Math.max(y1, sy1, sy2);
    }
    out.push({ x0, y0, x1, y1, members: idxs.length });
  }
  return out;
}

const foldAngle90 = (a: number): number => { let x = a % 90; if (x < 0) x += 90; return x; };
const angleDist90 = (a: number, b: number): number => { const d = Math.abs(foldAngle90(a) - foldAngle90(b)); return Math.min(d, 90 - d); };

/** Step 1: given a marqueed seed rect, find the dominant hatch family
 * overlapping it and the specific real-2D cluster (within that family) that
 * IS the seed's own fill region — not the family's own sheet-wide bbox,
 * which routinely spans every unrelated instance of the same (angle,
 * pitch, pen) signature sheet-wide (measured live: one real family's own
 * sheet-wide bbox ran nearly 3000px wide, aggregating a dozen unrelated
 * hatch regions that happen to share a drafting pitch). */
export function fingerprintInlineMotif(
  segs: number[], meta: Uint8Array, seedRect: [Point, Point], upp: number | null,
  // The reference size for MAX_CLUSTER_TO_RECT_FRAC, below — defaults to
  // seedRect's own size (sweep_inline_motif's direct, human-marqueed rect:
  // the rect IS the right reference). corroborateInlineMotif's own pad
  // ladder (mcp/src/session.ts's sweep_schedule_row) widens seedRect at
  // every retry, though, and a reference that widens WITH it would let the
  // exact same oversized cluster pass at a later, bigger padK after being
  // correctly rejected at a smaller one — so that caller pins this to its
  // ladder's own smallest rect instead of letting it float.
  maxClusterRef?: { w: number; h: number },
): InlineMotifFingerprint | null {
  const families = hatchFamilies(segs, meta);
  const rx0 = Math.min(seedRect[0][0], seedRect[1][0]), rx1 = Math.max(seedRect[0][0], seedRect[1][0]);
  const ry0 = Math.min(seedRect[0][1], seedRect[1][1]), ry1 = Math.max(seedRect[0][1], seedRect[1][1]);
  let best: { family: HatchFamily; inCount: number } | null = null;
  for (const f of families) {
    let inCount = 0;
    for (const i of f.memberIdx) {
      const x1 = segs[i * 4], y1 = segs[i * 4 + 1], x2 = segs[i * 4 + 2], y2 = segs[i * 4 + 3];
      if (x1 >= rx0 && x1 <= rx1 && y1 >= ry0 && y1 <= ry1 && x2 >= rx0 && x2 <= rx1 && y2 >= ry0 && y2 <= ry1) inCount++;
    }
    if (inCount > 0 && (!best || inCount > best.inCount)) best = { family: f, inCount };
  }
  if (!best) return null;
  const margin = Math.max(best.family.pitch_px * PROXIMITY_PITCH_MULT, 1);
  const clusters = clusterByProximity(segs, best.family.memberIdx, margin);
  // Skip oversized clusters BEFORE picking nearest. A sheet-wide same-
  // pitch field whose bbox contains the rect center wins d=0 under
  // "nearest then reject" and shadows a compact local fill that also
  // overlaps this rect — the function can only return null. Sparse
  // local ticks stay a POST-pick rejection (do not walk from ticks to
  // a distant dense box; that is the hatch-floor). A candidate must
  // also overlap the seed rect so a far compact sibling cannot become
  // the seed after the containing field is skipped. Aspect stays a
  // sweep-time filter — a long linear diffuser is a real seed.
  const cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2;
  const refW = maxClusterRef ? maxClusterRef.w : rx1 - rx0, refH = maxClusterRef ? maxClusterRef.h : ry1 - ry0;
  const overlapsRect = (c: Cluster) => c.x1 >= rx0 && c.x0 <= rx1 && c.y1 >= ry0 && c.y0 <= ry1;
  const notOversized = (c: Cluster): boolean => {
    const cw = c.x1 - c.x0, ch = c.y1 - c.y0;
    if (cw <= 0 || ch <= 0) return false;
    return cw <= MAX_CLUSTER_TO_RECT_FRAC * Math.max(refW, 1)
      && ch <= MAX_CLUSTER_TO_RECT_FRAC * Math.max(refH, 1);
  };
  let seedCluster: Cluster | null = null, bestD = Infinity;
  for (const c of clusters) {
    if (!notOversized(c) || !overlapsRect(c)) continue;
    const inside = cx >= c.x0 && cx <= c.x1 && cy >= c.y0 && cy <= c.y1;
    const d = inside ? 0 : Math.hypot(Math.max(c.x0 - cx, 0, cx - c.x1), Math.max(c.y0 - cy, 0, cy - c.y1));
    if (d < bestD) { bestD = d; seedCluster = c; }
  }
  if (!seedCluster || seedCluster.members < MIN_FILL_MEMBERS) return null;
  const w = seedCluster.x1 - seedCluster.x0, h = seedCluster.y1 - seedCluster.y0;
  return {
    angleMod90: foldAngle90(best.family.angle_deg),
    pitchPx: best.family.pitch_px,
    widthPx: w, heightPx: h,
    widthFt: upp ? w * upp : null, heightFt: upp ? h * upp : null,
    members: seedCluster.members,
    center: [(seedCluster.x0 + seedCluster.x1) / 2, (seedCluster.y0 + seedCluster.y1) / 2],
    rect: [[seedCluster.x0, seedCluster.y0], [seedCluster.x1, seedCluster.y1]],
  };
}

/** Step 2: sweep ANY sheet's segments for the fingerprinted motif — every
 * hatch family whose angle (mod 90, matching matchSymbol's own 90-degree
 * rotation-family assumption — real duct runs turn in right angles) and
 * pitch sit within tolerance of the seed's is clustered the same way, and
 * every resulting cluster is scored by real-world size closeness. */
export function sweepInlineMotif(
  fp: InlineMotifFingerprint, segs: number[], meta: Uint8Array, upp: number | null,
  opts: { sizeTolFrac?: number; pitchTolFrac?: number; excludeCenter?: Point; excludeR?: number } = {},
): InlineMotifResult {
  const sizeTol = opts.sizeTolFrac ?? SIZE_TOL_FRAC;
  const pitchTol = opts.pitchTolFrac ?? PITCH_TOL_FRAC;
  const families = hatchFamilies(segs, meta);
  const matches: InlineMotifMatch[] = [];
  const withheld: InlineMotifWithheld[] = [];
  let considered = 0;
  const seedW = fp.widthFt ?? fp.widthPx, seedH = fp.heightFt ?? fp.heightPx;
  const toReal = (px: number) => (upp ? px * upp : px);
  for (const f of families) {
    if (angleDist90(f.angle_deg, fp.angleMod90) > 6) continue;               // ~6deg drafting slack
    if (Math.abs(f.pitch_px - fp.pitchPx) / fp.pitchPx > pitchTol) continue;
    const margin = Math.max(f.pitch_px * PROXIMITY_PITCH_MULT, 1);
    const clusters = clusterByProximity(segs, f.memberIdx, margin);
    for (const c of clusters) {
      if (c.members < MIN_FILL_MEMBERS) continue;
      const w = c.x1 - c.x0, h = c.y1 - c.y0;
      if (w <= 0 || h <= 0) continue;
      if (Math.min(w, h) / Math.max(w, h) < MIN_ASPECT_FRAC) continue;
      considered++;
      const at: Point = [(c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2];
      if (opts.excludeCenter && opts.excludeR && Math.hypot(at[0] - opts.excludeCenter[0], at[1] - opts.excludeCenter[1]) <= opts.excludeR) continue;
      const cW = toReal(w), cH = toReal(h);
      // orientation-free size compare: this real box's own [long,short] vs the
      // seed's [long,short] — a duct run's own 90-degree turn swaps w/h.
      const [sLong, sShort] = seedW >= seedH ? [seedW, seedH] : [seedH, seedW];
      const [cLong, cShort] = cW >= cH ? [cW, cH] : [cH, cW];
      const longR = Math.abs(cLong - sLong) / sLong, shortR = Math.abs(cShort - sShort) / sShort;
      const sizeScore = Math.max(0, 1 - Math.max(longR, shortR));
      const item: InlineMotifMatch = {
        at, rect: [[c.x0, c.y0], [c.x1, c.y1]], w_px: w, h_px: h,
        w_ft: upp ? cW : null, h_ft: upp ? cH : null, members: c.members, size_score: +sizeScore.toFixed(3),
      };
      if (longR <= sizeTol && shortR <= sizeTol) matches.push(item);
      else if (longR <= sizeTol * 1.6 && shortR <= sizeTol * 1.6) {
        withheld.push({ ...item, reason: `real-world size is ${Math.round(Math.max(longR, shortR) * 100)}% off the seed's own — likely a different fitting size or an unrelated hatch region; look before counting it` });
      }
    }
  }
  const byPos = (a: { at: Point }, b: { at: Point }) => a.at[1] - b.at[1] || a.at[0] - b.at[0];
  matches.sort(byPos); withheld.sort(byPos);
  return { matches, withheld, candidates_considered: considered };
}

export interface InlineMotifSweepMatch extends InlineMotifMatch {
  tag_at: [number, number, number, number];
  labeled_leftover?: boolean;
  count?: number;
}
export interface InlineMotifSweepResult {
  matches: InlineMotifSweepMatch[];
  /** A matching box whose footprint carries a SIBLING row's tag, not this
   * one's — mirrors classifySweepMatches' identical disclosure exactly. */
  excluded: Array<{ at: Point; tag: string }>;
  withheld: InlineMotifWithheld[];
  /** A drawn occurrence of the tag with no matching hatched box nearby. */
  text_only: Array<{ at: Point }>;
  candidates_considered: number;
  complete: true;
}

/** sweep_schedule_row's own tag/sibling/text_only classification
 * (classifySweepMatches, symbolsweep.ts), reimplemented here rather than
 * shared — deliberately: that function calls `matchSymbol` internally and
 * is a delicate, heavily-tested two-call-site function (MCP + browser);
 * reshaping its signature to accept a pre-computed result risked the
 * ALREADY-WORKING whole-shape path for a fallback path this narrow. The
 * classification RULES themselves (tag-radius footprint test, sibling
 * exclusion, text-only disclosure) are copied exactly, not reinvented. */
export function classifyInlineMotifMatches(
  tag: string, res: InlineMotifResult, occ: TagOcc[],
  siblingOcc: Array<{ key: string; cx: number; cy: number }>, anchorH: number,
  excludeCenter?: Point,
  typSpans?: FlatSpan[],
): InlineMotifSweepResult {
  const matches: InlineMotifSweepMatch[] = [];
  const excluded: Array<{ at: Point; tag: string }> = [];
  const withheld: InlineMotifWithheld[] = [];
  const matchedOcc = new Set<number>();
  for (const m of res.matches) {
    const R = Math.max(m.w_px, m.h_px) / 2 + anchorH;
    let oi = -1;
    for (let k = 0; k < occ.length; k++) {
      if (Math.hypot(m.at[0] - occ[k].cx, m.at[1] - occ[k].cy) <= R) { oi = k; break; }
    }
    if (oi >= 0) { matchedOcc.add(oi); matches.push({ ...m, tag_at: occ[oi].bbox }); continue; }
    const sib = siblingOcc.find((sp) => Math.hypot(m.at[0] - sp.cx, m.at[1] - sp.cy) <= R);
    if (sib) { excluded.push({ at: m.at, tag: sib.key }); continue; }
    withheld.push({ ...m, reason: `the hatched box matches size but carries no "${tag}" tag within its footprint — an unlabeled instance or a shared fitting shape; look before counting it` });
  }
  for (const w of res.withheld) {
    const R = Math.max(w.w_px, w.h_px) / 2 + anchorH;
    const near = occ.some((o) => Math.hypot(w.at[0] - o.cx, w.at[1] - o.cy) <= R);
    withheld.push(near ? { ...w, reason: `${w.reason} — and the "${tag}" tag is drawn beside it` } : w);
  }
  const byPos = (a: { at: Point }, b: { at: Point }) => a.at[1] - b.at[1] || a.at[0] - b.at[0];
  matches.sort(byPos); excluded.sort(byPos); withheld.sort(byPos);
  let text_only = occ
    .filter((o, k) => !matchedOcc.has(k)
      && !res.withheld.some((w) => Math.hypot(w.at[0] - o.cx, w.at[1] - o.cy) <= (Math.max(w.w_px, w.h_px) / 2 + anchorH))
      && !(excludeCenter && Math.hypot(o.cx - excludeCenter[0], o.cy - excludeCenter[1]) <= anchorH * 3))
    .map((o) => ({ at: [Math.round(o.cx * 10) / 10, Math.round(o.cy * 10) / 10] as Point }));
  const clusterR = MARK_CLUSTER_K * Math.max(anchorH, 6);
  const leftovers = leftoverLabeledOccs(matches, occ, matchedOcc, clusterR, excludeCenter, anchorH * 3);
  for (const o of leftovers) {
    const w = Math.max(o.bbox[2] - o.bbox[0], 6), h = Math.max(o.bbox[3] - o.bbox[1], 6);
    matches.push({
      at: [Math.round(o.cx * 10) / 10, Math.round(o.cy * 10) / 10],
      rect: [[o.bbox[0], o.bbox[1]], [o.bbox[2], o.bbox[3]]],
      w_px: w, h_px: h, w_ft: null, h_ft: null, members: 0, size_score: 0,
      tag_at: o.bbox, labeled_leftover: true, count: 1,
    });
  }
  if (leftovers.length) {
    text_only = text_only.filter((t) =>
      !leftovers.some((o) => Math.hypot(o.cx - t.at[0], o.cy - t.at[1]) < 0.6));
    matches.sort(byPos);
  }
  if (typSpans?.length) {
    const typR = Math.max(4 * anchorH, 40);
    for (const m of matches) {
      if (m.labeled_leftover) { m.count = 1; continue; }
      const tx = (m.tag_at[0] + m.tag_at[2]) / 2, ty = (m.tag_at[1] + m.tag_at[3]) / 2;
      m.count = typicalMultiplierNear(typSpans, [tx, ty], typR);
    }
  }
  return { matches, excluded, withheld, text_only, candidates_considered: res.candidates_considered, complete: true };
}

/** sweep_schedule_row's own fallback: when corroborateFingerprint's
 * WHOLE-SHAPE match fails to recur (this file's own header comment for the
 * exact real reason a register/grille tag's OWN drawn instances routinely
 * fail that check), try corroborating an inline-motif fingerprint instead
 * — the SAME pad-ladder discipline (grow the rect around the anchor tag's
 * own text bbox until a real hatch cluster is found), checked against the
 * corroborator's own occurrence the same way. Never runs unless the
 * whole-shape path already failed — see this file's own header comment on
 * why this stays a separate function rather than a shared refactor. */
export function corroborateInlineMotif(
  anchorSegs: number[], anchorMeta: Uint8Array, anchorDims: { w: number; h: number },
  anchor: TagOcc, anchorUpp: number | null,
  corro: { segs: number[]; meta: Uint8Array; occ: TagOcc[]; upp: number | null } | null,
): { fp: InlineMotifFingerprint; anchorRect: [Point, Point]; corroborated: boolean } | null {
  const cX = (v: number) => Math.max(0, Math.min(v, anchorDims.w));
  const cY = (v: number) => Math.max(0, Math.min(v, anchorDims.h));
  // MAX_CLUSTER_TO_RECT_FRAC's own reference size is pinned to this ladder's
  // SMALLEST (first, padK=2) rect and reused at every wider padK — a
  // reference that instead floated with each retry's own widening rect
  // would let the identical oversized cluster that padK=2 correctly
  // rejected pass anyway once padK=6 made the rect big enough to outgrow
  // it, silently undoing the rejection rather than upholding it.
  const rectAt = (padK: number): [Point, Point] => {
    const pad = padK * anchor.h;
    return [[cX(anchor.bbox[0] - pad), cY(anchor.bbox[1] - pad)], [cX(anchor.bbox[2] + pad), cY(anchor.bbox[3] + pad)]];
  };
  const refRect = rectAt(2);
  const clusterRef = { w: refRect[1][0] - refRect[0][0], h: refRect[1][1] - refRect[0][1] };
  for (const padK of [2, 4, 6]) {
    const rect = rectAt(padK);
    const cand = fingerprintInlineMotif(anchorSegs, anchorMeta, rect, anchorUpp, clusterRef);
    if (!cand) continue;
    if (!corro) return { fp: cand, anchorRect: rect, corroborated: false };
    const probe = sweepInlineMotif(cand, corro.segs, corro.meta, corro.upp);
    const pr = Math.max(cand.widthPx, cand.heightPx) / 2 + anchor.h;
    if (corro.occ.some((o) => probe.matches.some((m) => Math.hypot(m.at[0] - o.cx, m.at[1] - o.cy) <= pr))) {
      return { fp: cand, anchorRect: rect, corroborated: true };
    }
  }
  return null;
}
