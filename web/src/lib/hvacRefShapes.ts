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

// ── BAS control-valve family (accuracy-hardening plan Phase 1) ───────────
// Real, MEASURED geometry — read directly off the real PDF's own vector
// segments (mcp Session.sheetContext against
// federal-attachment4-mechanical.pdf#17, the SmithGroup "MECHANICAL
// CONTROLS - LEGEND" sheet M8.1, already part of this project's own
// federal-mech corpus set), not eyeballed from a raster crop and not
// scraped from any symbol library. A GENUINELY DIFFERENT drafting
// convention from GATE_VALVE/BALL_VALVE above, confirmed by reading the
// real segments: this family draws its valve-body "bowtie" as two
// VERTICALS plus two crossing DIAGONALS (4 segments), not two solid
// triangle outlines (6 segments) — visually similar (an hourglass),
// topologically different, so a fingerprint built from one convention does
// NOT reliably match how a sheet drawn in the other actually renders it.
//
// Real-world size is a disclosed ESTIMATE, same caveat as GATE_VALVE/
// BALL_VALVE above: the motor-actuator box is assumed 4in per side (a
// plausible annotation size), and every other measurement is scaled
// proportionally from the real, measured PDF geometry at that one
// assumption — the PROPORTIONS are real and measured directly off the
// sheet; only the absolute inch scale is estimated, and named as one here.
// Real, measured PROPORTIONS — read via mcp Session.sheetContext, which
// reports coordinates at RENDER_SCALE 2.0 (image px), not raw PDF points;
// the literal below is that image-px reading (real PDF pt would be half),
// carried through unchanged since only the RATIOS between these numbers are
// asserted as real and measured — the absolute MBOX_IN estimate above is
// already disclosed as arbitrary regardless of which unit this literal is.
const MBOX_PT = 23.5;       // the real M-box's own drawn side, image px (at RENDER_SCALE 2.0) — see note above
const MBOX_IN = 4;          // disclosed estimate
const PT_IN = MBOX_IN / MBOX_PT;
const pt = (v: number) => +(v * PT_IN).toFixed(3);

/** The motor-actuator box + its connecting stem down to the valve-body
 * diamond's own center — shared by every 2-way/3-way electric control
 * valve variant below. Local origin: the M-box's own top-left corner,
 * y down (image-px convention). Real measured pt values: box 23.5×23.5,
 * stem from box-bottom (y=23.5) to the diamond's own center (y=46.1). */
const controlValveMAndStem = (): number[] => [
  0, 0, MBOX_PT, 0,
  MBOX_PT, 0, MBOX_PT, MBOX_PT,
  MBOX_PT, MBOX_PT, 0, MBOX_PT,
  0, MBOX_PT, 0, 0,
  MBOX_PT / 2, MBOX_PT, MBOX_PT / 2, 46.1,
].map(pt);

/** The valve-body diamond itself — two verticals + two crossing diagonals
 * (the real, measured segment topology; see the family comment above),
 * centered on the stem's own end point. Real measured pt values: half-width
 * 17.5 (x -5.8..29.2 relative to the M-box's left edge), y 34.2..57.9. */
const controlValveDiamond = (): number[] => [
  -5.8, 34.2, -5.8, 57.9,
  -5.8, 34.2, 29.2, 57.9,
  29.2, 57.9, 29.2, 34.2,
  29.2, 34.2, -5.8, 57.9,
].map(pt);

/** 2-way electric control valve: M-box + stem + the bare diamond — the
 * simplest member of this family, real and measured. */
export const CONTROL_VALVE_2WAY_ELECTRIC: RefShape = {
  name: "2-way electric control valve",
  segsIn: [...controlValveMAndStem(), ...controlValveDiamond()],
};

/** 3-way electric control valve: the IDENTICAL 2-way body plus a real,
 * measured THIRD leg — a downward-pointing triangle from the diamond's own
 * center — a genuine geometric distinction the real Eglin AFB legend
 * draws, not merely a different caption on the same shape. This is
 * deliberately a real STRICT-SUPERSET precision case (2-way's own segments
 * are a subset of 3-way's) — see hvacRefShapes.test.ts for whether scoring
 * alone keeps a 2-way instance from over-matching a 3-way's own extra leg,
 * the same #259-class question the original symbol-plan.pdf fixture was
 * built to answer for a different shape family. Real measured pt values:
 * the third leg spreads from the diamond's own center (11.75, 46.1) out to
 * (0, 63.6) and (23.5, 63.6). */
export const CONTROL_VALVE_3WAY_ELECTRIC: RefShape = {
  name: "3-way electric control valve",
  segsIn: [
    ...controlValveMAndStem(), ...controlValveDiamond(),
    ...[MBOX_PT / 2, 46.1, 0, 63.6, 0, 63.6, MBOX_PT, 63.6, MBOX_PT, 63.6, MBOX_PT / 2, 46.1].map(pt),
  ],
};

/** Every reference shape this library currently ships — deliberately small.
 * Extend this array (and add a matching, real-corpus-cited entry in
 * hvacTaxonomy.ts's VALVES/DAMPERS lists) only when a NEW shape has real
 * evidence behind it, the same discipline every entry above already
 * follows — never speculative pre-population "for completeness." */
export const HVAC_REF_SHAPES: RefShape[] = [GATE_VALVE, BALL_VALVE, CONTROL_VALVE_2WAY_ELECTRIC, CONTROL_VALVE_3WAY_ELECTRIC];
