// Exact-tag installed-quantity grounding.
//
// A schedule row's printed tag establishes identity, but text alone does not
// establish a physical installation. This pure shared layer verifies the
// missing second half: distinctive vector geometry must sit at that exact tag
// and the drawing's own adjacency/leader convention must assign the tag to the
// geometry. It deliberately does not search the whole sheet for repetitions;
// callers use it only for bounded, exact-tag reconciliation. Exhaustive
// symbol discovery remains symbolsweep.ts's job.

import {
  assertDistinctiveSymbolSeed,
  fingerprintSymbol,
  type Point,
  type SymbolFingerprint,
  type TagOcc,
} from "./symbolsweep.ts";
import {
  labelTokens,
  labelPlacements,
  leaderTerminalPointsForLabel,
  type LabelSpan,
  type PlacementLabel,
} from "./symbollabels.ts";

export interface TaggedVectorAttachment {
  occurrence: TagOcc;
  fingerprint: SymbolFingerprint;
  /** The bounded tag-neighbourhood used to read the vector fingerprint. */
  rect: [Point, Point];
  /** Tight bbox of the retained vector ink, excluding authoritative text-box strokes. */
  geometry_bbox: [number, number, number, number];
  label: PlacementLabel;
  pad_step: number;
}

export interface TaggedVectorTextOnly {
  occurrence: TagOcc;
  reason: "no_distinctive_local_geometry" | "geometry_not_attached_to_exact_tag";
}

export interface TaggedVectorGroundingResult {
  matches: TaggedVectorAttachment[];
  text_only: TaggedVectorTextOnly[];
  /** Distinctive local candidates actually offered to tag assignment. */
  candidates_considered: number;
}

export interface TaggedVectorGroundingInput {
  tag: string;
  occurrences: TagOcc[];
  spans: LabelSpan[];
  segs: number[];
  lum?: Uint8Array;
  width: number;
  height: number;
  /** Text-height multiples around each exact tag. Defaults to the proven row-sweep ladder. */
  pad_steps?: number[];
}

const canonicalTag = (value: string): string => value
  .trim()
  .toUpperCase()
  .replace(/[\u2010-\u2015\u2212]/g, "-")
  .replace(/\s+/g, "");

const boxCenter = (box: [number, number, number, number]): Point => [
  (box[0] + box[2]) / 2,
  (box[1] + box[3]) / 2,
];

/** A reconstructed split/stacked token may differ by fractions of a pixel
 * from the occurrence box. Require substantial overlap plus local centers;
 * label equality alone is insufficient when the same tag repeats. */
function sameSourceBox(
  token: [number, number, number, number] | undefined,
  occurrence: [number, number, number, number],
): boolean {
  if (!token) return false;
  const ix = Math.max(0, Math.min(token[2], occurrence[2]) - Math.max(token[0], occurrence[0]));
  const iy = Math.max(0, Math.min(token[3], occurrence[3]) - Math.max(token[1], occurrence[1]));
  const tokenArea = Math.max(1, (token[2] - token[0]) * (token[3] - token[1]));
  const occurrenceArea = Math.max(1, (occurrence[2] - occurrence[0]) * (occurrence[3] - occurrence[1]));
  const overlap = ix * iy / Math.min(tokenArea, occurrenceArea);
  const [tx, ty] = boxCenter(token);
  const [ox, oy] = boxCenter(occurrence);
  const local = Math.max(2, 0.35 * Math.max(token[3] - token[1], occurrence[3] - occurrence[1], 1));
  return overlap >= 0.6 && Math.hypot(tx - ox, ty - oy) <= local;
}

function fingerprintBounds(fp: SymbolFingerprint): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const rel of fp.rel) {
    const ax = fp.center[0] + rel[0], ay = fp.center[1] + rel[1];
    const bx = fp.center[0] + rel[2], by = fp.center[1] + rel[3];
    x0 = Math.min(x0, ax, bx); y0 = Math.min(y0, ay, by);
    x1 = Math.max(x1, ax, bx); y1 = Math.max(y1, ay, by);
  }
  return [x0, y0, x1, y1];
}

type Candidate = {
  occurrenceIndex: number;
  occurrence: TagOcc;
  fingerprint: SymbolFingerprint;
  rect: [Point, Point];
  geometry_bbox: [number, number, number, number];
  pad_step: number;
};

/**
 * Verify every exact occurrence independently. The smallest distinctive pad
 * wins; unresolved tags widen through the same 1×/2×/3× text-height ladder
 * used by schedule-row anchoring. A result is counted only when label
 * assignment returns both the requested tag and this occurrence's own source
 * bbox, preventing one repeated tag token from claiming a neighbour's shape.
 */
export function groundExactTagsToVectorGeometry(
  input: TaggedVectorGroundingInput,
): TaggedVectorGroundingResult {
  const requested = canonicalTag(input.tag);
  if (!requested || !input.occurrences.length || !input.segs.length) {
    return {
      matches: [],
      text_only: input.occurrences.map((occurrence) => ({
        occurrence,
        reason: "no_distinctive_local_geometry" as const,
      })),
      candidates_considered: 0,
    };
  }

  const pads = (input.pad_steps?.length ? input.pad_steps : [1, 2, 3])
    .filter((step) => Number.isFinite(step) && step > 0);
  const unresolved = new Set(input.occurrences.map((_, index) => index));
  const sawDistinctive = new Set<number>();
  const accepted = new Map<number, TaggedVectorAttachment>();
  let candidatesConsidered = 0;

  const offerCandidates = (candidates: Candidate[]) => {
    if (!candidates.length) return;
    candidatesConsidered += candidates.length;
    const labels = labelPlacements(
      candidates.map((candidate) => candidate.fingerprint.center),
      input.spans,
      input.segs,
      input.lum,
      {
        preferredLabel: input.tag,
        // Exact-tag reconciliation accepts only this literal source label
        // below. Asking the shared labeler to propose every unrelated token
        // on a dense plan sheet cannot change that verdict; it only repeats
        // sheet-wide work once per schedule row.
        restrictToPreferredLabel: true,
        // Installed quantity requires the body at the end of the authored
        // leader. A nearby pipe elbow or symbol crossed along the route is
        // evidence of proximity, not evidence that the tag identifies it.
        requireLeaderTerminal: true,
        scores: candidates.map(() => 1),
        symbolInkLengthPxByPlacement: candidates.map((candidate) => candidate.fingerprint.totalLen),
      },
    );
    candidates.forEach((candidate, index) => {
      const label = labels[index];
      if (!label
        || canonicalTag(label.label) !== requested
        || !sameSourceBox(label.token_bbox, candidate.occurrence.bbox)) return;
      accepted.set(candidate.occurrenceIndex, {
        occurrence: candidate.occurrence,
        fingerprint: candidate.fingerprint,
        rect: candidate.rect,
        geometry_bbox: candidate.geometry_bbox,
        label,
        pad_step: candidate.pad_step,
      });
      unresolved.delete(candidate.occurrenceIndex);
    });
  };

  // A true equipment leader can put the physical body several text heights
  // away from the printed tag. Inspect compact windows around the route's
  // outside endpoint before considering tag-neighbourhood ink; otherwise a
  // nearer pipe fitting crossed by the leader can win simply because the
  // actual valve/actuator is outside the old 1×/2×/3× crop ladder.
  const tokens = labelTokens(input.spans);
  const sourceTokenByOccurrence = input.occurrences.map((occurrence) => tokens.find((token) =>
    canonicalTag(token.str) === requested
    && sameSourceBox([token.x0, token.y0, token.x1, token.y1], occurrence.bbox)));
  const terminalsByOccurrence = sourceTokenByOccurrence.map((token) => token
    ? leaderTerminalPointsForLabel(token, input.spans, input.segs, input.lum)
    : []);
  for (const padStep of [0.75, 1, 1.5, 2]) {
    if (!unresolved.size) break;
    const candidates: Candidate[] = [];
    for (const occurrenceIndex of unresolved) {
      const occurrence = input.occurrences[occurrenceIndex];
      const terminals = terminalsByOccurrence[occurrenceIndex];
      if (!terminals.length) continue;
      const pad = padStep * Math.max(occurrence.h, 1);
      for (const terminal of terminals) {
        const rect: [Point, Point] = [
          [Math.max(0, terminal[0] - pad), Math.max(0, terminal[1] - pad)],
          [Math.min(input.width, terminal[0] + pad), Math.min(input.height, terminal[1] + pad)],
        ];
        try {
          const textBoxes = input.spans
            .filter((span) => span.x1 >= rect[0][0] && span.x0 <= rect[1][0]
              && span.y1 >= rect[0][1] && span.y0 <= rect[1][1])
            .map((span) => [span.x0, span.y0, span.x1, span.y1] as [number, number, number, number]);
          const fingerprint = fingerprintSymbol(input.segs, rect, undefined, {
            dropGlyphClusters: false,
            textBoxes,
          });
          assertDistinctiveSymbolSeed(fingerprint);
          sawDistinctive.add(occurrenceIndex);
          candidates.push({
            occurrenceIndex,
            occurrence,
            fingerprint,
            rect,
            geometry_bbox: fingerprintBounds(fingerprint),
            pad_step: padStep,
          });
        } catch {
          // Try the next compact terminal window. A pipe run, isolated
          // arrowhead, or text fragment is not an installed device body.
        }
      }
    }
    offerCandidates(candidates);
  }

  for (const padStep of pads) {
    if (!unresolved.size) break;
    const candidates: Candidate[] = [];
    for (const occurrenceIndex of unresolved) {
      const occurrence = input.occurrences[occurrenceIndex];
      const pad = padStep * Math.max(occurrence.h, 1);
      const rect: [Point, Point] = [
        [Math.max(0, occurrence.bbox[0] - pad), Math.max(0, occurrence.bbox[1] - pad)],
        [Math.min(input.width, occurrence.bbox[2] + pad), Math.min(input.height, occurrence.bbox[3] + pad)],
      ];
      try {
        const fingerprint = fingerprintSymbol(input.segs, rect, undefined, {
          dropGlyphClusters: false,
          textBoxes: [occurrence.bbox],
        });
        assertDistinctiveSymbolSeed(fingerprint);
        sawDistinctive.add(occurrenceIndex);
        candidates.push({
          occurrenceIndex,
          occurrence,
          fingerprint,
          rect,
          geometry_bbox: fingerprintBounds(fingerprint),
          pad_step: padStep,
        });
      } catch {
        // Empty, weak, open, or region-sized local ink is not a device.
        // Widening may still capture the complete attached symbol.
      }
    }
    offerCandidates(candidates);
  }

  return {
    matches: [...accepted.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, match]) => match),
    text_only: [...unresolved]
      .sort((a, b) => a - b)
      .map((index) => ({
        occurrence: input.occurrences[index],
        reason: sawDistinctive.has(index)
          ? "geometry_not_attached_to_exact_tag" as const
          : "no_distinctive_local_geometry" as const,
      })),
    candidates_considered: candidatesConsidered,
  };
}
