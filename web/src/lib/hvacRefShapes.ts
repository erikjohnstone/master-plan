// Hand-authored reference-shape library (maturity plan Phase 2, #HVAC-3) —
// the actual geometry `matchAgainstLibrary` (symbolsweep.ts) seeds against a
// sheet, instead of requiring a human to marquee a real instance first. Not
// scraped from any dataset or symbol library — every shape here is drawn
// from first principles against a REAL, standard drafting convention this
// project's own research already confirmed (the bowtie/hourglass valve-body
// glyph — two triangles meeting at a point — is the universal ANSI/ASME
// piping-symbol convention for a valve body, independent of valve TYPE; see
// hvacTaxonomy.ts and the real Eglin AFB controls legend it cites for the
// type-specific variants — control valve, ball valve, butterfly valve —
// this library does not yet attempt to fingerprint individually).
//
// Real-world size is a DISCLOSED ESTIMATE, not an independently measured
// fact: control/valve schematic symbols are conventionally drawn at a fixed,
// legible glyph size for ANNOTATION purposes, not scaled to the valve's
// actual physical dimensions the way a wall or a room is — this project has
// not yet measured a real, dimensioned valve symbol against its own sheet's
// stated scale to confirm the exact real-world inch figure below. The
// PROPORTIONS (body width : height : stem length) are real, carried over
// unchanged from the maturity plan's own Phase 1 valve-precision fixture
// (mcp/scripts/make-valve-fixture.mjs, already measured end-to-end against
// symbol_sweep's real scoring) — only the absolute inch scale is an
// estimate, and it is named as one here rather than asserted as measured.
import type { RefShape } from "./symbolsweep.ts";

const BODY_W_IN = 6, BODY_H_IN = 3.5;   // the bowtie's own bounding box, estimated
const STEM_IN = 3.25;                   // gate valve's straight rising stem
// Ball valve's lever handle is drawn clearly LONGER than a gate valve's stem
// in real schematic convention (a real, plausible distinction — not merely
// a different angle at the same length). This matters more than it looks:
// an earlier version of this file gave the handle nearly the SAME length as
// STEM_IN (only the angle differed) — real, measured against
// matchAgainstLibrary itself (see hvacRefShapes.test.ts), that version
// scored a false MATCH (1.0) against a bare gate valve at this library's
// real-world scale (6in body → 8px/in on a typical committed sheet scale):
// a ~0.13in length difference is under 2px at that scale, inside the
// matcher's own tolerance. Length alone, not angle alone, has to carry the
// distinction at small real-world print sizes — the same lesson
// confidence.ts's own "a small shape is thin evidence" doctrine already
// states elsewhere in this codebase, now measured here too.
const HANDLE_IN = 4.5;

const bowtieIn = (): number[] => {
  const w = BODY_W_IN, h = BODY_H_IN, hw = w / 2;
  return [
    0, 0, hw, h / 2,
    hw, h / 2, 0, h,
    0, h, 0, 0,
    w, 0, hw, h / 2,
    hw, h / 2, w, h,
    w, h, w, 0,
  ];
};

/** Gate valve: the bowtie body + a straight stem rising from the apex — see
 * hvacTaxonomy.ts's VALVES entry for the real tag-prefix conventions this
 * shape's own tag should be corroborated against. */
export const GATE_VALVE: RefShape = {
  name: "gate valve",
  segsIn: [...bowtieIn(), BODY_W_IN / 2, BODY_H_IN / 2, BODY_W_IN / 2, BODY_H_IN / 2 - STEM_IN],
};

/** Ball valve: the identical bowtie body + a diagonal lever handle from the
 * same apex — differs from GATE_VALVE in exactly one segment's direction,
 * the same precision case Phase 1's valve-precision fixture proved
 * matchSymbol's scoring keeps apart without a counter-example (#HVAC-1). */
export const BALL_VALVE: RefShape = {
  name: "ball valve",
  segsIn: [...bowtieIn(), BODY_W_IN / 2, BODY_H_IN / 2, BODY_W_IN / 2 + HANDLE_IN * 0.8, BODY_H_IN / 2 - HANDLE_IN * 0.6],
};

/** Every reference shape this library currently ships — deliberately small.
 * Extend this array (and add a matching, real-corpus-cited entry in
 * hvacTaxonomy.ts's VALVES/DAMPERS lists) only when a NEW shape has real
 * evidence behind it, the same discipline every entry above already
 * follows — never speculative pre-population "for completeness." */
export const HVAC_REF_SHAPES: RefShape[] = [GATE_VALVE, BALL_VALVE];
