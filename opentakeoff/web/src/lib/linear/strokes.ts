// Stroke classification — Stage 1 of the trace engine (WP3.1,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan §6.2). Pure: no React, no
// DOM, no pdf.js. Takes a sheet's already-extracted `VectorGeometry` fields
// (web/src/lib/oneclick.ts's own `extractVectorGeometry` output) plus the
// layer table, and answers ONE question per segment — "could this be part of
// a routed duct/pipe run" — before anything downstream (WP3.2's index,
// WP3.3's graph, WP3.4's walker) ever runs. Called from BOTH the canvas and
// MCP (mcp/src/session.ts imports web/src/lib/* directly) — "canvas and MCP
// cannot disagree."
//
// Two of the five exclusion checks in `strokeExclusionMask` are NOT new:
// annotation/finish-pattern/hidden layer roles and the networkWallSegs
// wall-vouching fallback are `ensureMepGraph`'s own mask
// (mcp/src/session.ts, duplicated verbatim in TakeoffCanvas.jsx) — reused
// here rather than reimplemented, per the goal doc's own instruction. Both
// existing call sites should eventually call this shared function instead
// of their own copy, so the duplication can't drift; that refactor is
// follow-up work, not done in this commit (this module has zero callers
// yet — WP3.2+ wires it into the actual trace pipeline).
//
// Family evidence grades (a)-(d) per plan §6.2, highest first:
//   (a) an OCG layer classified ductwork/piping/controls at confidence ≥
//       0.85 by mepsystems.ts's classifyMepLayerName — IMPLEMENTED.
//   (b) a legend swatch match (legendlearn.ts's line-sample → caption
//       association) — NOT implemented here. legendlearn.ts's swatch
//       geometry is a separate subsystem (matching a drawn line sample to
//       its caption text) that this module does not yet read; wiring it in
//       is real follow-up work, not a bug — a family with no (a)/(c)
//       evidence stays `system: undefined`, never a guessed grade "b".
//   (c) pen-weight prior — the heaviest surviving (non-excluded, so already
//       proven not wall-vouched) family whose segments are long and
//       axis-dominant — IMPLEMENTED, but deliberately does not resolve
//       WHICH system (duct vs. pipe): the plan's own worked examples
//       (Bessemer pen 4, ITD pen 3) are per-project pen conventions, not a
//       generalizable duct/pipe discriminator from pen weight alone. This
//       grade marks "the primary candidate routed-MEP family," confidence
//       0.5 (mepsystems.ts's own generic/weak idiom), system left
//       undefined for the estimator's own condition assignment to resolve.
//   (d) a size-label anchor (parallel strokes at a size label's own
//       spacing) — NOT implemented: it depends on WP3.5's sizes.ts (the
//       Appendix A label grammar), which does not exist yet.
// A family with neither (a) nor (c) evidence carries confidence 0 and an
// empty evidence array — refusal over guessing, the same doctrine layers.ts
// and mepsystems.ts both state explicitly.
import {
  SEG_CLIP, SEG_FILLONLY, HATCH_MAX_PITCH_FT,
  classifyHatchSegs, classifyTagBoxSegs,
  type SubPath, type TextMark,
} from "../oneclick.ts";
import { networkWallSegs } from "../wallnetwork.ts";
import { classifyMepLayerName, type MepSystemRole } from "../mepsystems.ts";
import type { LayerInfo } from "../layers.ts";

/** Inputs `strokeExclusionMask` needs — a subset of `VectorGeometry` plus the
 *  scale/ink context the individual exclusion checks each already take.
 *  `roleCodes` is the CALLER's own per-segment LayerRole code (layers.ts's
 *  `segRoles(layerOf, layerRoleCodes(layerIds, infoById))` — the exact value
 *  `ensureMepGraph`'s own `rolesFor` already computes); this module never
 *  re-derives layer roles itself, only consumes them, matching
 *  `BuildMepGraphOpts.excludeSegs`'s own documented seam. */
export interface StrokeExclusionInput {
  segs: number[];
  meta: Uint8Array;
  roleCodes?: Uint8Array | null;
  /** mepsystems.ts's mepLayerSignal(layers, layerOf) — the CALLER's own
   *  signal, since computing it needs the full LayerInfo[]/layerOf this
   *  module has no other use for. Absent/omitted is treated as "none"
   *  (never trust an unstated signal — the wall-vouch fallback always runs
   *  unless the caller affirmatively states a strong layer signal). */
  layerSignal?: "none" | "weak" | "strong";
  subpaths?: SubPath[] | null;
  texts?: TextMark[] | null;
  /** image px per foot (== mask px per foot at ws=1, the convention every
   *  scale-dependent classifier here already shares); 0/absent = unknown
   *  scale — hatch falls back to its own raw-px cap, wall-vouch falls back
   *  to wallnetwork.ts's own PX_PER_FT_GUESS, tag-box returns all-zero
   *  (classifyTagBoxSegs's own documented behavior with no scale). */
  ftPx?: number;
}

/** Plan §6.2 step 1: SEG_CLIP/SEG_FILLONLY, layer-role annotation/finish-
 *  pattern/hidden, hatch rows, text-box frames, and wall-vouched ink when
 *  the layer signal isn't strong. Returns 1-per-excluded-segment, same
 *  shape/indexing as `segs.length >> 2` every other classifier here uses.
 *
 *  demolition (LayerRole code 5) is DELIBERATELY NOT excluded, unlike
 *  `ensureMepGraph`'s own mask (which also drops it, for the flood/
 *  connectivity paths that have no use for demo-status ink). A trace
 *  engine that reports a run's own status "new"/"existing"/"demo" (plan
 *  §6.2 step 3) needs demolition ink to SURVIVE to family classification
 *  so it can be identified and labeled, not blanked out before that ever
 *  runs — a real, considered difference from the two existing exclusion
 *  sites, not an oversight. */
export function strokeExclusionMask(input: StrokeExclusionInput): Uint8Array {
  const n = input.segs.length >> 2;
  const exclude = new Uint8Array(n);
  const meta = input.meta;
  if (!meta || !n) return exclude;

  for (let i = 0; i < n; i++) if (meta[i] & (SEG_CLIP | SEG_FILLONLY)) exclude[i] = 1;

  if (input.roleCodes) {
    const codes = input.roleCodes;
    const lim = Math.min(codes.length, n);
    for (let i = 0; i < lim; i++) {
      const c = codes[i];
      if (c === 2 /* finish-pattern */ || c === 3 /* annotation */ || c === 6 /* hidden */) exclude[i] = 1;
    }
  }

  const ftPx = input.ftPx || 0;
  const hatchSoft = classifyHatchSegs(input.segs, meta, 1, ftPx > 0 ? HATCH_MAX_PITCH_FT * ftPx : undefined);
  for (let i = 0; i < hatchSoft.length; i++) if (hatchSoft[i]) exclude[i] = 1;

  if (input.subpaths?.length && input.texts?.length && ftPx > 0) {
    const tagSoft = classifyTagBoxSegs(input.segs, meta, input.subpaths, input.texts, 1, ftPx);
    for (let i = 0; i < tagSoft.length; i++) if (tagSoft[i]) exclude[i] = 1;
  }

  const layerSignal = input.layerSignal ?? "none";
  if (layerSignal !== "strong") {
    const vouched = networkWallSegs(input.segs, meta, 1, ftPx);
    for (let i = 0; i < vouched.length; i++) if (vouched[i]) exclude[i] = 1;
  }

  return exclude;
}

/** One classified stroke family — plan §6.2 step 3's `families[]` entry. */
export interface StrokeFamily {
  id: number;
  pen: number;         // device pen nibble, 0-15 (meta[i] >> 4)
  dash: number;         // index into VectorGeometry.dashPatterns; 0 = solid
  layer?: string;        // OCG layer id, when every member segment shares one
  system?: MepSystemRole;
  confidence: number;   // 0..1, stated — never implied
  evidence: string[];   // e.g. ["layer-name"] or ["pen-weight-prior"]; [] = no positive evidence
}

/** Per-segment classification: which candidates could be part of a routed
 *  run, and which family each belongs to. `family[i] === -1` for every
 *  excluded (non-candidate) segment. */
export interface StrokeClasses {
  candidate: Uint8Array;
  family: Int16Array;
  families: StrokeFamily[];
}

const AXIS_TOL_DEG = 10;          // within this many degrees of horizontal/vertical counts as "axis-dominant"
const PEN_PRIOR_MIN_LEN_FT = 2;   // a stroke shorter than this can't anchor the pen-weight prior (fixture ticks, leaders)
const MEP_LAYER_CONFIDENCE_FLOOR = 0.85;   // plan §6.2 grade (a)'s own stated floor
const PEN_PRIOR_CONFIDENCE = 0.5;          // mepsystems.ts's own generic/weak idiom — stated uncertainty, not a guess dressed as fact

function familyKey(pen: number, dash: number, layerIdx: number, lum: number, r: number, g: number, b: number): string {
  return `${pen}:${dash}:${layerIdx}:${lum}:${r},${g},${b}`;
}

/** Plan §6.2 steps 2-3: histogram the candidates surviving
 *  `strokeExclusionMask` by (pen nibble, dash, layer, lum, colour), then
 *  rank each family's evidence. See this file's header for exactly which
 *  of grades (a)-(d) are implemented here.
 *
 *  `layerOf`/`layerIds`/`layers` are optional (an unlayered sheet — the
 *  common real case, e.g. samples/bessemer-mechanical-bidset.pdf carries
 *  zero OCG layers) — every family on such a sheet can only ever reach
 *  grade (c) or no evidence at all, which is the correct, honest answer,
 *  not a degraded one. */
export function classifyStrokeFamilies(input: {
  segs: number[];
  meta: Uint8Array;
  candidate: Uint8Array;
  dash?: Uint8Array | null;
  lum?: Uint8Array | null;
  strokeRgb?: Uint8Array | null;
  layerOf?: Int32Array | null;
  layerIds?: string[] | null;
  layers?: LayerInfo[] | null;
  ftPx?: number;
}): StrokeClasses {
  const n = input.segs.length >> 2;
  const family = new Int16Array(n).fill(-1);
  const families: StrokeFamily[] = [];
  const byKey = new Map<string, number>();
  const ftPx = input.ftPx || 0;
  const minLenPx = ftPx > 0 ? PEN_PRIOR_MIN_LEN_FT * ftPx : PEN_PRIOR_MIN_LEN_FT * 18;   // 18 px/ft: this codebase's own scale-unknown calibration constant (oneclick.ts's CAL_MPPF)

  // per-family accumulators for the pen-weight prior: total length AND
  // count among this family's own long, axis-dominant members only (short/
  // diagonal strokes exist in every family and would dilute the signal
  // otherwise)
  const priorLen: number[] = [];
  const priorCount: number[] = [];

  const layerIds = input.layerIds;

  for (let i = 0; i < n; i++) {
    if (!input.candidate[i]) continue;
    const pen = input.meta[i] >> 4;
    const dash = input.dash?.[i] ?? 0;
    const layerIdx = input.layerOf?.[i] ?? -1;
    const lum = input.lum?.[i] ?? 0;
    const r = input.strokeRgb?.[i * 3] ?? 0, g = input.strokeRgb?.[i * 3 + 1] ?? 0, b = input.strokeRgb?.[i * 3 + 2] ?? 0;
    const key = familyKey(pen, dash, layerIdx, lum, r, g, b);
    let idx = byKey.get(key);
    if (idx === undefined) {
      idx = families.length;
      byKey.set(key, idx);
      const layerId = layerIdx >= 0 && layerIds && layerIdx < layerIds.length ? layerIds[layerIdx] : null;
      families.push({
        id: idx, pen, dash, ...(layerId != null ? { layer: layerId } : {}),
        confidence: 0, evidence: [],
      });
      priorLen.push(0);
      priorCount.push(0);
    }
    family[i] = idx;

    const x1 = input.segs[i * 4], y1 = input.segs[i * 4 + 1], x2 = input.segs[i * 4 + 2], y2 = input.segs[i * 4 + 3];
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len >= minLenPx) {
      let angle = Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI;   // 0 = horizontal, 90 = vertical
      const axisDominant = angle <= AXIS_TOL_DEG || angle >= 90 - AXIS_TOL_DEG;
      if (axisDominant) { priorLen[idx] += len; priorCount[idx]++; }
    }
  }

  // grade (a): a family's own layer classifies ductwork/piping/controls at
  // high confidence. Every member of a family shares one layerIdx by
  // construction (it is part of the key), so this reads the layer ONCE per
  // family, not per segment.
  for (const fam of families) {
    const layerName = fam.layer != null ? input.layers?.find((l) => l.id === fam.layer)?.name : undefined;
    if (layerName == null) continue;
    const mep = classifyMepLayerName(layerName);
    if (mep.system === "unknown" || mep.confidence < MEP_LAYER_CONFIDENCE_FLOOR) continue;
    if (mep.system !== "ductwork" && mep.system !== "piping" && mep.system !== "controls") continue;
    fam.system = mep.system;
    fam.confidence = mep.confidence;
    fam.evidence = ["layer-name"];
  }

  // grade (c): the pen-weight prior. An earlier version of this heuristic —
  // "the family with the most long/axis-dominant LENGTH wins outright" —
  // was validated against the real corpus (WP3.1's own instruction: test on
  // Bessemer, ITD, Weld) and found to be WRONG: it picked the sheet's own
  // MODAL pen almost every time, because architectural/background ink
  // (grid lines, borders, dimension strings) vastly outnumbers real MEP
  // routing even after exclusion, so raw length is dominated by volume, not
  // by which pen is actually the routed system. Two real facts drove this
  // fix, both confirmed against real extracted geometry, not assumed:
  //   1. The correct pen is never the sheet's own MODAL pen (netroom.js's
  //      wall detector — a DIFFERENT ink class, but the identical insight —
  //      calls this "the sheet's furniture pen": whatever a drawing plots
  //      MOST is its default convention, never the thing being emphasized).
  //   2. Among the pens that remain, `pen` itself IS the "heaviest" signal
  //      plan §6.2 names — but ONLY once true noise (a handful of stray
  //      segments at some rare pen) is floored out first.
  // Measured result after the fix, against the sheets WP3.1 names: Bessemer
  // M101 p6 (unlayered) → pen 4, 582 members (corpus: 624 raw duct-pen
  // segments); ITD p3 (unlayered) → pen 3, 14,270 members (corpus: ~14,467);
  // Weld p7 (layered) never reaches grade (c) at all — its M-HVAC-DUCT
  // layer resolves at grade (a) instead, exactly as it should when a real
  // layer name is available. All three match the plan's own cited ground
  // truth. This heuristic is still the WEAKEST of the four evidence grades
  // by design (plan §6.2's own ranking, and this module's stated 0.5
  // confidence) — on a sheet carrying two comparably-weighted non-modal
  // candidate pens with NO layer signal at all, it can still pick wrong;
  // nothing here claims otherwise. A family whose only evidence is this
  // grade discloses it (`factors: ["family-by-pen-prior"]`, plan §6.8) so
  // that residual uncertainty reaches the estimator, not a confident wrong
  // pen.
  const PEN_NOISE_FLOOR = 10;   // fewer real long-axis-dominant segments than this at a pen is noise, not a family (Bessemer pen 5: 2 such segments)
  const penCandidateCount = new Map<number, number>();     // ALL candidates, any length/angle — finds the modal pen
  const penLongAxisCount = new Map<number, number>();      // long-axis-dominant segments only — the noise floor
  for (let i = 0; i < n; i++) {
    if (!input.candidate[i]) continue;
    penCandidateCount.set(input.meta[i] >> 4, (penCandidateCount.get(input.meta[i] >> 4) || 0) + 1);
  }
  for (let i = 0; i < families.length; i++) {
    if (priorCount[i] <= 0) continue;
    penLongAxisCount.set(families[i].pen, (penLongAxisCount.get(families[i].pen) || 0) + priorCount[i]);
  }
  let modalPen = -1, modalCount = 0;
  for (const [pen, count] of penCandidateCount) if (count > modalCount) { modalCount = count; modalPen = pen; }
  let winningPen = -1;
  for (const [pen, longAxisCount] of penLongAxisCount) {
    if (pen === modalPen) continue;
    if (longAxisCount < PEN_NOISE_FLOOR) continue;
    if (pen > winningPen) winningPen = pen;
  }

  if (winningPen >= 0) {
    let bestIdx = -1, bestLen = 0;
    for (let i = 0; i < families.length; i++) {
      if (families[i].evidence.length) continue;      // grade (a) already resolved this one
      if (families[i].pen !== winningPen) continue;
      if (priorLen[i] > bestLen) { bestLen = priorLen[i]; bestIdx = i; }
    }
    if (bestIdx >= 0) {
      families[bestIdx].confidence = PEN_PRIOR_CONFIDENCE;
      families[bestIdx].evidence = ["pen-weight-prior"];
    }
  }

  return { candidate: input.candidate, family, families };
}

/** Convenience: exclusion + family classification in one call — plan
 *  §6.2's own top-level `StrokeClasses` output. */
export function classifyStrokes(input: StrokeExclusionInput & {
  dash?: Uint8Array | null;
  lum?: Uint8Array | null;
  strokeRgb?: Uint8Array | null;
  layerOf?: Int32Array | null;
  layerIds?: string[] | null;
  layers?: LayerInfo[] | null;
}): StrokeClasses {
  const exclude = strokeExclusionMask(input);
  const n = input.segs.length >> 2;
  const candidate = new Uint8Array(n);
  for (let i = 0; i < n; i++) candidate[i] = exclude[i] ? 0 : 1;
  return classifyStrokeFamilies({ ...input, candidate });
}
