// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane A's own disclosed
// requirement 3 ("excluding forms whose content is mostly text/page
// furniture/title blocks/borders/repeated non-countable stuff") — this
// slice is the concrete direction the prior PROGRESS.md entry's own
// structural finding pointed to: primitive-level signals scored against
// an exclusive baseline (style/connectivity/carrier) are mathematically
// unable to discriminate a Lane-A-vs-Lane-B dispute, because every real
// such cluster found across 5 real documents has zero exclusive
// primitives, by construction. What CAN discriminate it is a judgment
// about the FORM itself, not any one of its primitives.
//
// SHATTER COUNT: the real, already-available signal used here. When a
// Lane A Form's own content is EXHAUSTIVELY partitioned into many
// separate, mutually-disconnected Lane B components, that is itself
// real evidence the Form is not one cohesive physical symbol — a real
// symbol (an equipment icon, a valve glyph) is typically one connected
// figure, or a small handful of them (an outline plus a few internal
// marks); a title block, border, or general-notes block routinely
// shatters into dozens or hundreds of disconnected text/rule fragments
// (confirmed exactly on two real documents this session: Cherry Point
// #12's dominant cluster shatters into 8 Lane B pieces; tinker-afb-iwcs-
// controls.pdf#13's shatters into 259).
//
// ASPECT RATIO: a secondary, independent signal — a title block, border,
// or margin strip is often a long thin rectangle (Cherry Point #12's own
// real dominant-cluster bbox: 176.584 × 37.052, aspect ≈4.77), unlike a
// typical compact equipment symbol.
//
// THIS IS A DETECTOR ONLY, not wired into ownershipEligibility.ts,
// ownershipAssignment.ts, or any resolution module — deliberately, same
// as invisibleInk.ts and carrierClassification.ts's own first slices.
// Real further work, disclosed: an actual "reject/keep this whole Form as
// a candidate instance" decision needs this signal combined with real
// evidence about what its OWN Lane B pieces look like (are they text-
// glyph-shaped strokes? hatch-density?) — page-furniture classification
// proper, which this slice does not attempt; it only flags the ONE
// structural fact (shatter count + shape) this session's own real-sheet
// findings already established as meaningful.
export interface FormPlausibilityInput {
  /** the Form's own bbox, in the same coordinate space as everything
   *  else in this session's own pipeline (page image px). */
  x0: number; y0: number; x1: number; y1: number;
  /** how many mutually-disjoint Lane B connected components exhaustively
   *  (or partially) partition this Form's own primitive set — e.g. the
   *  count of distinct Lane B proposals sharing primitives with this
   *  Lane A proposal, from an ownership cluster's own `proposalIds`. */
  componentCount: number;
}

export interface FormPlausibilityOptions {
  /** a Form shattering into at least this many disjoint Lane B pieces is
   *  flagged implausible as one physical symbol. Default 5 — real,
   *  measured evidence (Cherry Point's real 8, Tinker's real 259) both
   *  clear this by a wide margin; a genuine symbol with a body outline
   *  plus a few internal marks might reach 3-4 legitimately, so 5 is a
   *  deliberately conservative floor, not tuned to either real case
   *  specifically. */
  shatterThreshold?: number;
  /** a bbox whose long side is at least this many times its short side
   *  is flagged implausible as a compact symbol. Default 6. */
  aspectRatioThreshold?: number;
}

export interface FormPlausibilityResult {
  plausibleAsSingleSymbol: boolean;
  shatterCount: number;
  aspectRatio: number;
  /** which specific check(s) failed — "shatter" and/or "aspect" — so a
   *  caller (or a human reviewing a real-sheet report) can see WHY,
   *  never just a bare boolean. Empty when plausible. */
  reasons: ("shatter" | "aspect")[];
}

const DEFAULT_SHATTER_THRESHOLD = 5;
const DEFAULT_ASPECT_RATIO_THRESHOLD = 6;

/** Pure: assesses whether a Lane A Form proposal plausibly represents
 *  ONE physical symbol, using only structural facts already available
 *  elsewhere in this pipeline (shatter count, bbox shape) — never a
 *  regex, name, or per-project convention. Never mutates any input. */
export function assessFormPlausibility(
  input: FormPlausibilityInput,
  opts: FormPlausibilityOptions = {},
): FormPlausibilityResult {
  const shatterThreshold = opts.shatterThreshold ?? DEFAULT_SHATTER_THRESHOLD;
  const aspectRatioThreshold = opts.aspectRatioThreshold ?? DEFAULT_ASPECT_RATIO_THRESHOLD;

  const width = Math.abs(input.x1 - input.x0);
  const height = Math.abs(input.y1 - input.y0);
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const aspectRatio = shortSide > 0 ? longSide / shortSide : (longSide > 0 ? Infinity : 1);

  const reasons: ("shatter" | "aspect")[] = [];
  if (input.componentCount >= shatterThreshold) reasons.push("shatter");
  if (aspectRatio >= aspectRatioThreshold) reasons.push("aspect");

  return {
    plausibleAsSingleSymbol: reasons.length === 0,
    shatterCount: input.componentCount,
    aspectRatio,
    reasons,
  };
}
