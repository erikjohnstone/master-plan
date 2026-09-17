// Stage 6 — confidence, refusal, and the trace receipt (WP3.6,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan §6.8). Pure: no React,
// no DOM. Builds the `origin` record a committed trace stamps on a shape —
// `method: "traced"`, `reviewed: false`, `confidence`/`confidence_factors`,
// and the receipt itself under `trace` — matching the ALREADY-SHIPPED
// `origin` convention (TakeoffCanvas.jsx's own `one_click_v1`/`net_v1`
// records: method, reviewed, confidence, confidence_factors) rather than
// inventing a parallel shape, and `mepconnectivity.ts`'s own
// `traceConnectivity` for the factors-as-named-strings idiom and its
// `layer-unclassified` penalty value (0.6), reused verbatim below since
// it is the same underlying signal (a stroke family with no real CAD
// layer backing its classification).
//
// Plan §6.8: "A run's confidence is the minimum over its factors, each
// named in origin.trace.factors: stroke-family evidence grade; size-
// binding grade (or size_missing); width cross-check; vertex ambiguity
// count; bridged gaps; layer-unclassified; scale_unconfirmed." Three of
// those seven are NOT computed here, honestly excluded rather than
// fabricated:
//   - width cross-check needs a double-line duct pair's own drawn width
//     (WP4's own centerline pairing, not built yet);
//   - bridged gaps needs `mepconnectivity.ts`'s own gap-bridging pass,
//     which this walker never calls (a dead end here is just that, no
//     bridging attempted);
//   - "vertex ambiguity count" is, for THIS walker, always 0 or 1: plan
//     §6.3's own decision tree makes `ambiguous` a hard STOP, never
//     something a walk passes through and continues past, so the richer
//     "count along the whole run" the phrase suggests can never exceed 1
//     against this engine's actual behavior.
// A factor with no real signal behind it is left out of BOTH the
// returned `factors` list and the confidence minimum, never assigned a
// guessed number — the same refusal-over-guessing doctrine `sizes.ts`'s
// own header states for the grammar itself.
import type { WalkStop, WalkStopReason } from "./walk.ts";
import type { SegmentIndex } from "./index.ts";
import type { StrokeFamily } from "./strokes.ts";
import type { BoundSize, SizeConflict } from "./sizes.ts";
import type { Continuation } from "./graph.ts";

const LAYER_UNCLASSIFIED_CONFIDENCE = 0.6;   // mepconnectivity.ts's traceConnectivity, same signal, reused verbatim
const AMBIGUOUS_STOP_CONFIDENCE = 0.5;        // weaker than a missing-layer signal — the run itself stopped short, unresolved
const SCALE_UNCONFIRMED_CONFIDENCE = 0.7;     // a guessed px-per-foot fallback, not a detected scale — every length this run carries is suspect by the same factor

export interface TraceLabelRecord {
  text: string;
  x0: number; y0: number; x1: number; y1: number;
  seg: number;
  size?: BoundSize["parsed"]["size"];
  withheld?: boolean;   // true when this label's own segment had a size conflict — see `sizeConflictRefusal`
}

export interface TraceReceipt {
  seed: { seg: number; x: number; y: number };
  /** original segment indices, in travel order — `walk.ts`'s own `segs`. */
  segs: number[];
  labels: TraceLabelRecord[];
  /** the seed segment's own device pen width, px — an audit record of the
   *  drawn ink, NOT the width-cross-check plan §6.6 describes (that needs
   *  a double-line pair's spacing, WP4 scope). */
  drawn_width_px: number;
  stops: { forward: WalkStop; backward: WalkStop };
  /** present only when a stop's own reason was "ambiguous" — the fan of
   *  candidates a UI offers as continuations, per plan §6.3. */
  candidates?: Continuation[];
  factors: string[];
}

export interface TraceOrigin {
  method: "traced";
  reviewed: false;
  confidence: number;
  confidence_factors: string[];
  trace: TraceReceipt;
}

/** Builds the `origin` a committed trace stamps on a shape, from a walked
 *  run (`walkBothDirections`'s own return shape — `segs`/`stops`), the
 *  stroke family the walked segments belong to, and whatever size labels
 *  `associateLabel`/`resolveSizeConflicts` (sizes.ts, WP3.5) already
 *  resolved for the sheet — filtered here to just the ones landing on a
 *  segment this run actually walked. */
export function buildTraceReceipt(
  index: SegmentIndex,
  seed: { seg: number; x: number; y: number },
  walk: { segs: number[]; stops: { forward: WalkStop; backward: WalkStop } },
  family: StrokeFamily,
  allBoundSizes: BoundSize[],
  conflicts: SizeConflict[],
  // keyed by the BINDING itself, not by `seg` — two labels conflicting on
  // the SAME segment need their own DISTINCT bbox each; a seg-keyed lookup
  // could only ever return one of the two.
  opts: { scaleConfirmed: boolean; labelText?: (b: BoundSize) => { x0: number; y0: number; x1: number; y1: number } | undefined },
): TraceOrigin {
  const walkedSegs = new Set(walk.segs);
  const factors: string[] = [];
  const confidenceValues: number[] = [];

  const familyGrade = family.evidence[0] ?? "unclassified";
  factors.push(`stroke-family:${familyGrade}`);
  confidenceValues.push(family.confidence);

  const onRun = allBoundSizes.filter((b) => walkedSegs.has(b.seg));
  const conflictedSegs = new Set(conflicts.filter((c) => walkedSegs.has(c.seg)).map((c) => c.seg));
  const labels: TraceLabelRecord[] = [];
  for (const c of conflicts) {
    if (!walkedSegs.has(c.seg)) continue;
    for (const cand of c.candidates) {
      const span = opts.labelText?.(cand);
      labels.push({ text: cand.parsed.raw, x0: span?.x0 ?? 0, y0: span?.y0 ?? 0, x1: span?.x1 ?? 0, y1: span?.y1 ?? 0, seg: cand.seg, withheld: true });
    }
  }
  const clean = onRun.filter((b) => !conflictedSegs.has(b.seg));
  if (clean.length) {
    const best = clean.reduce((a, b) => (b.confidence > a.confidence ? b : a));
    for (const b of clean) {
      const span = opts.labelText?.(b);
      labels.push({ text: b.parsed.raw, x0: span?.x0 ?? 0, y0: span?.y0 ?? 0, x1: span?.x1 ?? 0, y1: span?.y1 ?? 0, seg: b.seg, size: b.parsed.size });
    }
    factors.push(`size-binding:${best.placement}`);
    confidenceValues.push(best.confidence);
  } else if (conflictedSegs.size) {
    factors.push("size_withheld");
  } else {
    factors.push("size_missing");
  }

  if (walk.stops.forward.reason === "ambiguous" || walk.stops.backward.reason === "ambiguous") {
    factors.push("ambiguous_stop");
    confidenceValues.push(AMBIGUOUS_STOP_CONFIDENCE);
  }

  if (!family.evidence.includes("layer-name")) {
    factors.push("layer-unclassified");
    confidenceValues.push(LAYER_UNCLASSIFIED_CONFIDENCE);
  }

  if (!opts.scaleConfirmed) {
    factors.push("scale_unconfirmed");
    confidenceValues.push(SCALE_UNCONFIRMED_CONFIDENCE);
  }

  const candidates = walk.stops.forward.candidates ?? walk.stops.backward.candidates;
  const trace: TraceReceipt = {
    seed, segs: walk.segs, labels,
    drawn_width_px: index.meta[seed.seg] >> 4,
    stops: walk.stops,
    ...(candidates ? { candidates } : {}),
    factors,
  };

  return {
    method: "traced", reviewed: false,
    confidence: Math.min(...confidenceValues),
    confidence_factors: factors,
    trace,
  };
}

// ── Refusals (plan §6.8's own texts, verbatim) ─────────────────────────────

export const REFUSAL_NO_LINEWORK =
  "No routed linework under the cursor — click on a drawn duct or pipe line, or switch to manual (M)";

export const REFUSAL_NO_STROKE_FAMILY =
  "This sheet's linework has no stroke family I can attribute to ductwork or piping — trace manually, or open Layers to mark one.";

/** Plan §6.8's own template, for the width-cross-check case it describes
 *  (a label's stated size vs. a double-line pair's own drawn spacing —
 *  WP4 scope, not yet a real caller of this function). */
export function sizeWithheldRefusal(labelSize: string, drawnWidthIn: number): string {
  return `Size withheld: the label reads ${labelSize} but the drawn width is ${drawnWidthIn} in. Pick one.`;
}

/** The SAME "Size withheld... Pick one." framing, for the conflict
 *  `resolveSizeConflicts` (sizes.ts, WP3.5) can actually detect today:
 *  two labels landing on one segment, disagreeing with EACH OTHER rather
 *  than with a drawn width. */
export function sizeConflictRefusal(conflict: SizeConflict): string {
  const raws = conflict.candidates.map((c) => `"${c.parsed.raw}"`).join(" vs. ");
  return `Size withheld: two labels disagree on this run — ${raws}. Pick one.`;
}
