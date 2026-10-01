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
  isEquipmentInstanceLabel,
  isStackedInstrumentFamily,
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
  /** The mark touches a room sensor's ring (a thermostat's circled T): it may
   * be that sensor's label, naming the unit it serves where the sensor is, or
   * the unit's own tag beside its own thermostat. Never a reason to drop the
   * match; the sweep ranks such a view after the unit's other views (AS-105). */
  sensor_label?: boolean;
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
  /** Offer an occurrence the shared labeler reads no token for as its own
   * source token (exactOccurrenceToken). Only a caller whose row names one
   * unit per mark sets it: a type mark's label may also name what a control
   * line or thermostat serves (016_NY's FT-A at four thermostat lines), so a
   * type mark's text keeps the labeler's reading alone. */
  occurrenceTokens?: boolean;
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

/** The room sensors a unit's mark labels with the unit each serves: a
 * thermostat's T, a temperature, humidity or CO2 sensor's function, a zone
 * sensor's (the room-mounted functions of the labeler's embedded instrument
 * vocabulary). */
const ROOM_SENSOR_FUNCTIONS = new Set(["T", "TS", "TC", "HS", "RH", "CO2", "ZS", "ZNS", "ZNT"]);

/** The ring around lettering: ink crossing each of the four half-axes from
 * its centre, outside its own glyphs and within a letter height of its box.
 * Its box from the nearest crossings, or null where a side stays open. */
function letteringRing(span: LabelSpan, segs: number[]): [number, number, number, number] | null {
  const cx = (span.x0 + span.x1) / 2, cy = (span.y0 + span.y1) / 2;
  const hw = (span.x1 - span.x0) / 2, hh = (span.y1 - span.y0) / 2;
  const quarter = Math.round((span.rot ?? 0) / 90) % 2 !== 0;
  const letter = Math.max(quarter ? 2 * hw : 2 * hh, 1);
  const reachX = hw + letter, reachY = hh + letter;
  const coreX = 0.6 * hw, coreY = 0.6 * hh;
  let left = Infinity, right = Infinity, up = Infinity, down = Infinity;
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const ax = segs[i], ay = segs[i + 1], bx = segs[i + 2], by = segs[i + 3];
    if (Math.max(ax, bx) < cx - reachX || Math.min(ax, bx) > cx + reachX
      || Math.max(ay, by) < cy - reachY || Math.min(ay, by) > cy + reachY) continue;
    if (ay !== by && (ay - cy) * (by - cy) <= 0) {
      const x = ax + (cy - ay) * (bx - ax) / (by - ay);
      if (x <= cx - coreX && cx - x <= reachX) left = Math.min(left, cx - x);
      if (x >= cx + coreX && x - cx <= reachX) right = Math.min(right, x - cx);
    }
    if (ax !== bx && (ax - cx) * (bx - cx) <= 0) {
      const y = ay + (cx - ax) * (by - ay) / (bx - ax);
      if (y <= cy - coreY && cy - y <= reachY) up = Math.min(up, cy - y);
      if (y >= cy + coreY && y - cy <= reachY) down = Math.min(down, y - cy);
    }
  }
  return [left, right, up, down].every(Number.isFinite) ? [cx - left, cy - up, cx + right, cy + down] : null;
}

/** How near a room sensor's ring a mark must be lettered to touch it, in the
 * mark's letter heights: 004_MO's thermostat labels touch their rings (0 to
 * 0.13); its unit heaters' own tags sit 0.3 to 0.7 from their thermostats. */
const SENSOR_RING_TOUCH_K = 0.25;

/** Whether an occurrence of a mark touches a room sensor's ring: a
 * thermostat's circled T, a temperature, humidity or CO2 sensor's (AS-105).
 * Lettered so, the mark labels that sensor with the unit it serves
 * (004_MO's rooftop units on the floor plan below them) or is the unit's own
 * tag beside the unit's own thermostat (040_IL's UH-2). */
function touchesRoomSensor(occurrence: TagOcc, spans: LabelSpan[], segs: number[]): boolean {
  const [ox0, oy0, ox1, oy1] = occurrence.bbox;
  const reach = SENSOR_RING_TOUCH_K * Math.max(occurrence.h, 1);
  return spans.some((span) => {
    if (!ROOM_SENSOR_FUNCTIONS.has(canonicalTag(span.str))) return false;
    if (Math.min(span.x1, ox1) > Math.max(span.x0, ox0) && Math.min(span.y1, oy1) > Math.max(span.y0, oy0)) return false;
    const letter = Math.max(span.y1 - span.y0, span.x1 - span.x0, 1);
    if (Math.max(span.x0 - ox1, ox0 - span.x1, span.y0 - oy1, oy0 - span.y1, 0) > letter + reach) return false;
    const ring = letteringRing(span, segs);
    return !!ring && Math.max(ring[0] - ox1, ox0 - ring[2], ring[1] - oy1, oy0 - ring[3], 0) <= reach;
  });
}

/** The caller's tag reader establishes an occurrence of the requested mark
 * where the shared labeler reads no token: a mark printed with a word space
 * ("HP 12-1") is no label token, and a family stacked over its number
 * ("FPB" over "3-11") need not form the repeated convention stacked tokens
 * require. The occurrence itself is then the source token: its box, and its
 * runs' lettering height and rotation. It carries the mark's letters as its
 * family only where the labeler's own instance rule reads the mark, its word
 * space read as the separator it stands for (HP 12-1 as HP-12-1), as one
 * equipment instance, and never an instrument function's (which names the
 * bubble it sits in); a type mark such as "CD 1" stays a plain token. Its
 * leader and adjacency are read through the identical gates. */
function exactOccurrenceToken(tag: string, occurrence: TagOcc, spans: LabelSpan[]): LabelSpan | null {
  const [x0, y0, x1, y1] = occurrence.bbox;
  const tol = 0.25 * Math.max(occurrence.h, 1);
  const runs = spans.filter((span) => span.x0 >= x0 - tol && span.x1 <= x1 + tol
    && span.y0 >= y0 - tol && span.y1 <= y1 + tol);
  // The occurrence must print the whole mark: its spacing may differ, and a
  // line break may stand for its hyphen (FPB over 3-11), but no printed
  // character may be missing. Never a shorthand the tag reader accepted for
  // it (an abbreviation list's "AHU" for AHU-1), nor the mark without its
  // hyphen (a column grid bubble's "B2" for boiler B-2): exact-tag
  // verification verifies exact tags.
  const compact = (text: string): string => text.toUpperCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, "").replace(/-{2,}/g, "-");
  const lines: LabelSpan[][] = [];
  for (const run of [...runs].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1) || a.x0 - b.x0)) {
    const line = lines.find((l) => Math.abs((l[0].y0 + l[0].y1) / 2 - (run.y0 + run.y1) / 2)
      <= 0.5 * Math.max(Math.min(l[0].y1 - l[0].y0, run.y1 - run.y0), 1));
    if (line) line.push(run); else lines.push([run]);
  }
  const printed = (order: LabelSpan[][]): string =>
    compact(order.map((line) => [...line].sort((a, b) => a.x0 - b.x0).map((run) => run.str).join("")).join("-"));
  const mark = compact(tag);
  if (!mark || (printed(lines) !== mark && printed([...lines].reverse()) !== mark)) return null;
  const rotations = new Set(runs.map((span) => span.rot ?? 0));
  const heights = runs.map((span) => {
    const quarter = Math.round((span.rot ?? 0) / 90) % 2 !== 0;
    return Math.max(quarter ? span.x1 - span.x0 : span.y1 - span.y0, 1);
  });
  const separated = tag.trim().toUpperCase().replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, "-").replace(/-+/g, "-");
  const family = separated.match(/^[A-Z]{1,8}(?=-)/)?.[0];
  const instance = !!family && !isStackedInstrumentFamily(family) && isEquipmentInstanceLabel(separated);
  return {
    str: tag,
    x0, y0, x1, y1,
    ...(rotations.size === 1 ? { rot: [...rotations][0] } : {}),
    ...(instance ? { family } : {}),
    text_height_px: heights.length ? Math.min(...heights) : Math.max(occurrence.h, 1),
  };
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
  // Each occurrence's source token: the labeler's own reading of it, or the
  // occurrence itself where the labeler reads none (exactOccurrenceToken).
  const tokens = labelTokens(input.spans);
  const readTokenByOccurrence = input.occurrences.map((occurrence) => tokens.find((token) =>
    canonicalTag(token.str) === requested
    && sameSourceBox([token.x0, token.y0, token.x1, token.y1], occurrence.bbox)));
  const occurrenceTokenByOccurrence = input.occurrences.map((occurrence, index) =>
    input.occurrenceTokens && !readTokenByOccurrence[index]
      ? exactOccurrenceToken(input.tag, occurrence, input.spans)
      : null);
  const exactTokens = occurrenceTokenByOccurrence.filter((token): token is LabelSpan => !!token);
  const sourceTokenByOccurrence = readTokenByOccurrence.map((token, index) =>
    token ?? occurrenceTokenByOccurrence[index] ?? undefined);

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
        exactTokens,
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
          const geometry = fingerprintBounds(fingerprint);
          sawDistinctive.add(occurrenceIndex);
          candidates.push({
            occurrenceIndex,
            occurrence,
            fingerprint,
            rect,
            geometry_bbox: geometry,
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
        const geometry = fingerprintBounds(fingerprint);
        sawDistinctive.add(occurrenceIndex);
        candidates.push({
          occurrenceIndex,
          occurrence,
          fingerprint,
          rect,
          geometry_bbox: geometry,
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
      .map(([, match]) => touchesRoomSensor(match.occurrence, input.spans, input.segs) ? { ...match, sensor_label: true } : match),
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
