// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 gate — "dense-grid cases
// preserve all real instances and suppress neighbor-borrowed phantoms."
// The prior PROGRESS.md entry's own scope-boundary finding: a dense grid
// of REPEATED RAW-GEOMETRY symbols (no Form XObject at all) generates
// zero Lane A invocations, so it never enters detectOwnershipClusters's
// own view — none of this session's Phase 4 ownership machinery ever
// runs on it. This module is the disclosed "dedicated real-sheet dense-
// grid check" that same entry named as one of two ways forward. It does
// NOT extend conflict detection (a bigger, riskier change to an already-
// shipped module); it instead gives a caller direct visibility into
// whether Lane B is finding the SAME repeated body multiple times, by
// generalizing Lane A's own already-shipped "group by identical
// signature hash" rule (computeFormContentSignatures's own
// repeatedGroups) to raw-geometry Lane B bodies Lane A can never see —
// reusing candidateBodySignature.ts's own computeBodySignatures
// unchanged, not a second signature algorithm.
//
// Deliberately NOT attempted here (disclosed, real further work): this
// module only GROUPS same-signature bodies — it does not judge whether a
// group's own member COUNT is plausible (a real dense diffuser grid
// might legitimately have 30+ repeats; a signature bucket collision
// between two UNRELATED small symbols is also possible and would show up
// as a false "repeated group" here), and it does not check the gate's
// own "suppress neighbor-borrowed phantoms" half at all — that needs
// comparing each group's own real page positions against expected grid
// spacing, not attempted in this slice.
//
// SIZE/COMPLEXITY FILTER (added after real-sheet visual ground truth):
// the PROGRESS.md entry this module's own real-sheet check produced
// found its LARGEST real-corpus group (264 members) was a decorative
// dashed rope/dot border pattern around a professional-engineer seal
// stamp, not equipment symbols — each member had only 3 primitives.
// `filterPlausibleSymbolGroups` below started as a real, disclosed,
// coarse heuristic for exactly that: a body with too few primitives to
// plausibly be a real equipment icon is excluded.
//
// SECOND REAL COUNTER-EXAMPLE, found by re-checking the FILTER's own
// output visually rather than trusting the smaller numbers: primitive
// count alone was not enough. The same sheet's own dotted border (small
// filled circles) SURVIVED the primitive-count filter — a filled circle
// drawn with bezier curves decomposes into ~16 primitives despite being
// visually tiny, so a genuinely decorative element can still have a
// HIGH primitive count. Added a second, independent dimension:
// `minDiagonal`, the body's own bbox diagonal — a body physically too
// small to be a real equipment icon is excluded regardless of how many
// primitives it took to draw it. Both real false positives found this
// session (the rope tick mark, diagonal ≈3.16, and the dotted-border
// circle, diagonal ≈6.1) are now excluded by the default; NEITHER
// threshold is a calibrated classifier — both are real, measured,
// disclosed, tunable knobs chosen to exclude the two concrete cases
// found so far, not a general solution to "is this a real symbol."
// This is scale-dependent and unvalidated across a differently-scaled
// sheet, disclosed rather than assumed portable.
import type { CandidateBody } from "./candidateBodyLaneB.ts";
import type { PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";
import { computeBodySignatures } from "./candidateBodySignature.ts";

export interface RepeatedGroupsResult {
  /** body ids grouped by identical signature hash — a group of size 1 is
   *  not repeated, only groups of 2+ are included, same convention as
   *  Lane A's own repeatedGroups. */
  repeatedGroups: number[][];
  /** how many bodies produced no signature at all (empty/unresolvable
   *  primitiveIds) — reported so a caller can tell "checked, nothing
   *  repeats" apart from "some bodies couldn't even be checked." */
  unsignedBodyCount: number;
}

/** Pure: groups Lane B candidate bodies by identical structural
 *  signature — the SAME rule candidateBodyLaneA.ts's own
 *  computeFormContentSignatures already applies to Form invocations,
 *  extended here to raw-geometry bodies Lane A can never see. Never
 *  mutates any input. */
export function groupRepeatedLaneBBodies(
  bodies: readonly CandidateBody[],
  attributes: readonly PrimitiveNodeAttributes[],
): RepeatedGroupsResult {
  const signatures = computeBodySignatures(bodies, attributes);
  const unsignedBodyCount = bodies.length - signatures.size;

  const byHash = new Map<string, number[]>();
  for (const [bodyId, sig] of signatures) {
    let arr = byHash.get(sig.hash);
    if (!arr) { arr = []; byHash.set(sig.hash, arr); }
    arr.push(bodyId);
  }
  const repeatedGroups = [...byHash.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.slice().sort((a, b) => a - b));
  return { repeatedGroups, unsignedBodyCount };
}

export interface SymbolGroupFilterOptions {
  /** a body with FEWER than this many primitives is excluded as too
   *  simple to plausibly be a real equipment symbol. Default 4 — a
   *  real, measured choice: the decorative rope-border tick mark found
   *  on tarrant-county-mechanical.pdf#1's own largest real group has
   *  exactly 3. Not a calibrated boundary; a real symbol with fewer
   *  than 4 primitives (e.g. a simple 2-line corner mark) would also be
   *  excluded here, a real, disclosed false-negative risk of this
   *  coarse a filter. */
  minPrimitiveCount?: number;
  /** a body whose own bbox diagonal is SMALLER than this is excluded
   *  regardless of primitive count. Default 8 — a real, measured
   *  choice covering both real false positives found this session: the
   *  rope tick mark (diagonal ≈3.16) and a dotted-border circle
   *  (diagonal ≈6.1, despite ~16 bezier primitives — proof primitive
   *  count alone is not sufficient). Scale-dependent and unvalidated
   *  across a differently-scaled sheet; disclosed, not assumed
   *  portable. */
  minDiagonal?: number;
}

export interface PlausibleSymbolGroupsResult {
  plausibleGroups: number[][];
  /** groups this filter excluded, preserved rather than discarded — a
   *  caller (or a human reviewing a real-sheet report) can see exactly
   *  what was filtered out and why, not just a smaller final count. */
  excludedGroups: number[][];
}

/** Pure: splits `groups` (repeatedGroups from `groupRepeatedLaneBBodies`
 *  above) into plausible-as-equipment-symbol and excluded-as-too-simple,
 *  by each group's own primitive count. Every member of one repeated
 *  group shares an identical structural signature by construction — and
 *  a signature is built directly from a body's own primitive-attribute
 *  list, so members necessarily share an identical primitive count too
 *  — meaning checking the FIRST member's own count is representative of
 *  the whole group, not an approximation. Never mutates any input. */
export function filterPlausibleSymbolGroups(
  groups: readonly (readonly number[])[],
  bodiesById: ReadonlyMap<number, CandidateBody>,
  opts: SymbolGroupFilterOptions = {},
): PlausibleSymbolGroupsResult {
  const minPrimitiveCount = opts.minPrimitiveCount ?? 4;
  const minDiagonal = opts.minDiagonal ?? 8;
  const plausibleGroups: number[][] = [];
  const excludedGroups: number[][] = [];
  for (const group of groups) {
    const body = bodiesById.get(group[0]);
    const primitiveCount = body?.primitiveIds.length ?? 0;
    const diagonal = body ? Math.hypot(body.x1 - body.x0, body.y1 - body.y0) : 0;
    const plausible = primitiveCount >= minPrimitiveCount && diagonal >= minDiagonal;
    (plausible ? plausibleGroups : excludedGroups).push(group.slice());
  }
  return { plausibleGroups, excludedGroups };
}
