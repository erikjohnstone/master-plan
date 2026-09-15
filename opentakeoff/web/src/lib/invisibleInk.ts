// GOAL.md's own standing rule: "A census pass... is not ground truth...
// real ground truth means an agent actually rendered the page and looked
// at it." Real-sheet validation for Phase 4's own carrier/eligibility
// modules had been entirely numeric until this slice — rendering an
// actual crop of the region behind Cherry Point #12's own real ownership
// clusters (per the PROGRESS.md entries above) showed BLANK WHITE, no
// visible ink at all, despite the geometry index reporting hundreds of
// real, non-clip primitives there. Investigated rather than waved off:
// those primitives carry `lum: 255` — pure white stroke color. This is a
// real, common CAD/Revit export technique (a white-ink mask drawn behind
// a label so it stays legible over hatching), not a parsing bug — the
// geometry is real and correctly extracted, it is simply never meant to
// be SEEN.
//
// Precise scope, measured on Cherry Point #12: 1,618 of 102,352 sheet
// primitives (1.6%) carry lum >= 250 — a small sheet-wide fraction — but
// WITHIN each of the sheet's 5 real ownership clusters, the DOMINANT
// (Lane A whole-Form) proposal is 91%-97% white ink by primitive count.
// This means Lane A's own content-signature computation (candidateBodyLaneA.ts)
// currently treats invisible masking geometry as equally real evidence of
// a Form's "content" as its genuinely visible strokes — corrupting body
// signatures, bboxes, and every eligibility signal computed from a
// proposal's own primitive set for exactly the clusters real ground-truth
// rendering was able to catch.
//
// THIS SLICE IS DELIBERATELY SMALL: a standalone, tested detector, real-
// sheet-validated against the exact case above — NOT a retrofit of Lane
// A/B/fusion or any already-shipped ownership module. Wiring this into
// those modules (which primitive sets a proposal should actually be built
// from, re-running every downstream real-sheet number affected) is real,
// disclosed further work with meaningful blast radius, not attempted
// here.
export interface InvisibleInkOptions {
  /** primitives at or above this luminance are treated as invisible
   *  against a white page. Default 250 (out of 255) — a real, measured
   *  choice: Cherry Point #12's own masking ink sits at lum 255 exactly,
   *  and 250 leaves a small margin for near-white without catching
   *  genuinely light-but-visible gray ink. */
  lumThreshold?: number;
}

const DEFAULT_LUM_THRESHOLD = 250;

/** Pure: true iff `primitive.lum` indicates ink that would not be visible
 *  against a white page background. Returns false (not flagged) when
 *  `lum` is null — no luminance fact was recorded, so there is no
 *  evidence to flag it on; a caller wanting a stricter "unknown is
 *  suspicious" policy makes that choice itself, not this function.
 *
 *  ASSUMES A WHITE PAGE BACKGROUND — real, disclosed, unverified for a
 *  colored-background sheet (e.g. a dark/inverted CAD theme, rare but
 *  real in this corpus): this function has no access to the actual
 *  rendered background color, only the convention that construction PDF
 *  sheets are overwhelmingly white. Not validated against a colored-
 *  background counter-example. */
export function isLikelyInvisibleInk(
  primitive: { lum: number | null },
  opts: InvisibleInkOptions = {},
): boolean {
  const threshold = opts.lumThreshold ?? DEFAULT_LUM_THRESHOLD;
  return primitive.lum !== null && primitive.lum >= threshold;
}

export interface InvisibleInkStats {
  total: number;
  invisibleCount: number;
  visibleCount: number;
  /** primitives with no recorded lum at all — neither counted as visible
   *  nor invisible; reported separately so a caller can see whether the
   *  input actually carries luminance facts. */
  unknownLumCount: number;
}

/** Pure: summarizes how much of `primitiveIds` reads as invisible ink —
 *  the exact question real-sheet validation above needed answered per
 *  proposal, generalized into a reusable utility rather than one-off
 *  script logic. */
export function summarizeInvisibleInk(
  primitiveIds: readonly number[],
  idx: { primitives: readonly { lum: number | null }[] },
  opts: InvisibleInkOptions = {},
): InvisibleInkStats {
  let invisibleCount = 0, visibleCount = 0, unknownLumCount = 0;
  for (const pid of primitiveIds) {
    const p = idx.primitives[pid];
    if (!p) continue;
    if (p.lum === null) unknownLumCount++;
    else if (isLikelyInvisibleInk(p, opts)) invisibleCount++;
    else visibleCount++;
  }
  return { total: primitiveIds.length, invisibleCount, visibleCount, unknownLumCount };
}
