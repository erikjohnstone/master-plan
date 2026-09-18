// linear/sizes.ts — the size-label grammar (#linear-takeoff WP3.5,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md, plan Appendix A / §3.1). This
// file's own acceptance criterion, stated in the plan itself: every label
// string in plan §3.1 parses to the stated size; every negative example is
// rejected. The strings below are lifted verbatim from §3.1's per-sheet
// table and prose (Bessemer, ITD, Federal, Bldg 5406, Weld County, Baker
// County) — rotation markers (`@270`, `@90`) are the probe scripts' own
// documentation of how the label sits on the sheet, not embedded label
// text, so they're stripped before the string reaches parseSize here (the
// orientation/placement half of WP3.5 — not yet built — is what would
// consume that rotation, not the grammar).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeLabelText, parseSize, associateLabel, associateOnRunFallback, associationWindowPx, resolveSizeConflicts, type BoundSize, type SizeLabelSpan } from "../../src/lib/linear/sizes.ts";
import { buildSegmentIndex } from "../../src/lib/linear/index.ts";

function idxFor(segs: number[]) {
  const n = segs.length >> 2;
  return buildSegmentIndex(segs, new Uint8Array(n), { candidate: new Uint8Array(n).fill(1) });
}
function label(text: string, over: Partial<SizeLabelSpan> = {}): SizeLabelSpan {
  return { text, x0: 0, y0: 0, x1: 10, y1: 10, rotDeg: 0, textHeightPx: 10, ...over };
}

// ── normalizeLabelText: Appendix A's own pre-normalisation rules ──────────

test("normalizeLabelText: multiplication sign becomes x, curly/straight double-prime becomes \"", () => {
  assert.equal(normalizeLabelText("12×6"), "12X6");
  assert.equal(normalizeLabelText("12\u201d"), '12"');
  assert.equal(normalizeLabelText("12\u2033"), '12"');
});

test("normalizeLabelText: unicode fractions become N/D text before uppercasing", () => {
  assert.equal(normalizeLabelText("3½"), "31/2");
  assert.equal(normalizeLabelText("¾"), "3/4");
  assert.equal(normalizeLabelText("¼ ⅛ ⅜ ⅝ ⅞"), "1/4 1/8 3/8 5/8 7/8");
});

test("normalizeLabelText: collapses whitespace, uppercases, and normalizes ø/⌀/%%c to lowercase ø after uppercasing", () => {
  assert.equal(normalizeLabelText("  12   x   6  "), "12 X 6");
  assert.equal(normalizeLabelText("8\"ø"), '8"ø');
  assert.equal(normalizeLabelText("8\"Ø"), '8"ø');
  assert.equal(normalizeLabelText("8\"⌀"), '8"ø');
  assert.equal(normalizeLabelText("8\"%%c"), '8"ø');
});

// ── RECT — real labels from Bessemer, ITD, Federal, Bldg 5406, Weld, Baker ─

test("parseSize: RECT — Bessemer M101's 12\"x6\", 16\"x8\", 10\"x6\"", () => {
  assert.deepEqual(parseSize('12"x6"')?.size, { kind: "rect", w_in: 12, h_in: 6 });
  assert.deepEqual(parseSize('16"x8"')?.size, { kind: "rect", w_in: 16, h_in: 8 });
  assert.deepEqual(parseSize('10"x6"')?.size, { kind: "rect", w_in: 10, h_in: 6 });
});

test("parseSize: RECT — Bessemer's 14x3½ resolves the fraction to a decimal before the RECT grammar runs (plan §3.1 vs Appendix A reconciliation)", () => {
  const parsed = parseSize("14x3½");
  assert.deepEqual(parsed?.size, { kind: "rect", w_in: 14, h_in: 3.5 });
  assert.equal(parsed?.raw, "14X3.5");
});

test("parseSize: RECT — MP001 legend's 24x14, and spaced/mixed-case forms (12 x 8, 18X10)", () => {
  assert.deepEqual(parseSize("24x14")?.size, { kind: "rect", w_in: 24, h_in: 14 });
  assert.deepEqual(parseSize("12 x 8")?.size, { kind: "rect", w_in: 12, h_in: 8 });
  assert.deepEqual(parseSize("18X10")?.size, { kind: "rect", w_in: 18, h_in: 10 });
});

test("parseSize: RECT — ITD p3/p4/Federal's 58\"x22\", 24\"x16\", 28\"x16\", 14\"x10\", 32\"x8\", 66\"x32\"", () => {
  assert.deepEqual(parseSize('58"x22"')?.size, { kind: "rect", w_in: 58, h_in: 22 });
  assert.deepEqual(parseSize('24"x16"')?.size, { kind: "rect", w_in: 24, h_in: 16 });
  assert.deepEqual(parseSize('28"x16"')?.size, { kind: "rect", w_in: 28, h_in: 16 });
  assert.deepEqual(parseSize('14"x10"')?.size, { kind: "rect", w_in: 14, h_in: 10 });
  assert.deepEqual(parseSize('32"x8"')?.size, { kind: "rect", w_in: 32, h_in: 8 });
  assert.deepEqual(parseSize('66"x32"')?.size, { kind: "rect", w_in: 66, h_in: 32 });
});

test("parseSize: RECT — Bldg 5406/Weld/Baker's 12x12, 8x8, 10x8, 10X10, 26X10, 22X10", () => {
  assert.deepEqual(parseSize("12x12")?.size, { kind: "rect", w_in: 12, h_in: 12 });
  assert.deepEqual(parseSize("8x8")?.size, { kind: "rect", w_in: 8, h_in: 8 });
  assert.deepEqual(parseSize("10x8")?.size, { kind: "rect", w_in: 10, h_in: 8 });
  assert.deepEqual(parseSize("10X10")?.size, { kind: "rect", w_in: 10, h_in: 10 });
  assert.deepEqual(parseSize("26X10")?.size, { kind: "rect", w_in: 26, h_in: 10 });
  assert.deepEqual(parseSize("22X10")?.size, { kind: "rect", w_in: 22, h_in: 10 });
});

test("parseSize: RECT with a trailing system tag — Baker's 24X14 SA, 8X8 EA", () => {
  const sa = parseSize("24X14 SA");
  assert.deepEqual(sa?.size, { kind: "rect", w_in: 24, h_in: 14 });
  assert.deepEqual(sa?.systems, ["SA"]);
  const ea = parseSize("8X8 EA");
  assert.deepEqual(ea?.size, { kind: "rect", w_in: 8, h_in: 8 });
  assert.deepEqual(ea?.systems, ["EA"]);
});

test("parseSize: RECT with the FO/flat-oval suffix — major is always the larger dimension regardless of input order", () => {
  const a = parseSize("24x12 FO");
  assert.deepEqual(a?.size, { kind: "oval", major_in: 24, minor_in: 12 });
  const b = parseSize("12x24 FO");
  assert.deepEqual(b?.size, { kind: "oval", major_in: 24, minor_in: 12 });
});

// ── ROUND — Bessemer, ITD, Bldg 5406, Weld, Baker ──────────────────────────

test("parseSize: ROUND — Bessemer's 8\"ø, 6\"ø", () => {
  assert.deepEqual(parseSize('8"ø')?.size, { kind: "round", d_in: 8 });
  assert.deepEqual(parseSize('6"ø')?.size, { kind: "round", d_in: 6 });
});

test("parseSize: ROUND — bare ø with no inch mark at all (6Ø), and mixed-case Ø/ø (10\"Ø, 12\"ø, 14\"Ø, 26\"ø)", () => {
  assert.deepEqual(parseSize("6Ø")?.size, { kind: "round", d_in: 6 });
  assert.deepEqual(parseSize('10"Ø')?.size, { kind: "round", d_in: 10 });
  assert.deepEqual(parseSize('12"ø')?.size, { kind: "round", d_in: 12 });
  assert.deepEqual(parseSize('14"Ø')?.size, { kind: "round", d_in: 14 });
  assert.deepEqual(parseSize('26"ø')?.size, { kind: "round", d_in: 26 });
});

test("parseSize: ROUND — Weld/Baker's 14\"Ø, 6\"Ø, 8\"Ø, and a trailing system tag (8\"Ø EA)", () => {
  assert.deepEqual(parseSize('14"Ø')?.size, { kind: "round", d_in: 14 });
  assert.deepEqual(parseSize('6"Ø')?.size, { kind: "round", d_in: 6 });
  assert.deepEqual(parseSize('8"Ø')?.size, { kind: "round", d_in: 8 });
  const ea = parseSize('8"Ø EA');
  assert.deepEqual(ea?.size, { kind: "round", d_in: 8 });
  assert.deepEqual(ea?.systems, ["EA"]);
});

test("parseSize: ROUND — ITD p5 piping's 2\"ø, 1\"ø, 3\"ø", () => {
  assert.deepEqual(parseSize('2"ø')?.size, { kind: "round", d_in: 2 });
  assert.deepEqual(parseSize('1"ø')?.size, { kind: "round", d_in: 1 });
  assert.deepEqual(parseSize('3"ø')?.size, { kind: "round", d_in: 3 });
});

// ── PIPE — bare inches, hyphenated/unicode fractions, DN/mm forms ─────────

test("parseSize: PIPE — a bare inch size with no system at all (2\", P101's 1\"ø-style bare pipes)", () => {
  const bare = parseSize('2"');
  assert.deepEqual(bare?.size, { kind: "pipe", nps_in: 2 });
  assert.deepEqual(bare?.systems, []);
});

test("parseSize: PIPE — hyphenated and unicode fraction inches (1-1/2\", 1½\") both resolve to 1.5", () => {
  assert.deepEqual(parseSize('1-1/2"')?.size, { kind: "pipe", nps_in: 1.5 });
  assert.deepEqual(parseSize('1\u00bd"')?.size, { kind: "pipe", nps_in: 1.5 });
});

test("parseSize: PIPE — Bessemer M101's 4\" EA, P101's 4\" DN", () => {
  const ea = parseSize('4" EA');
  assert.deepEqual(ea?.size, { kind: "pipe", nps_in: 4 });
  assert.deepEqual(ea?.systems, ["EA"]);
  const dn = parseSize('4" DN');
  assert.deepEqual(dn?.size, { kind: "pipe", nps_in: 4 });
  assert.equal(dn?.direction, "down");
});

test("parseSize: PIPE — Federal p6's 1\" HHWS, 1 1/4\" HHWR, 3\" HHWS, 2 1/2\" HHWS", () => {
  const a = parseSize('1" HHWS');
  assert.deepEqual(a?.size, { kind: "pipe", nps_in: 1 });
  assert.deepEqual(a?.systems, ["HHWS"]);
  assert.deepEqual(parseSize('1 1/4" HHWR')?.size, { kind: "pipe", nps_in: 1.25 });
  assert.deepEqual(parseSize('3" HHWS')?.size, { kind: "pipe", nps_in: 3 });
  assert.deepEqual(parseSize('2 1/2" HHWS')?.size, { kind: "pipe", nps_in: 2.5 });
});

test("parseSize: PIPE — Federal p7's 4\" CHWR, Bldg 5406 P-101's 1-1/4\" CW, 2\" CW", () => {
  assert.deepEqual(parseSize('4" CHWR')?.size, { kind: "pipe", nps_in: 4 });
  assert.deepEqual(parseSize('1-1/4" CW')?.size, { kind: "pipe", nps_in: 1.25 });
  assert.deepEqual(parseSize('2" CW')?.size, { kind: "pipe", nps_in: 2 });
});

test("parseSize: PIPE — Baker p42 gas schematic's 3\" NG, 1 1/4\" NG", () => {
  assert.deepEqual(parseSize('3" NG')?.size, { kind: "pipe", nps_in: 3 });
  assert.deepEqual(parseSize('1 1/4" NG')?.size, { kind: "pipe", nps_in: 1.25 });
});

test("parseSize: PIPE — VA Durham M-401's glycol-return risers, 6\" GLR, 4\" GLR, 3/4\" GLR, and a 6\" GLS supply counterpart (#linear-takeoff GATE 3 bug catalogue: GLS/GLR were missing from SYS_ALT entirely, so every real glycol-loop label on this sheet failed to parse as a size at all, not merely lost its system tag)", () => {
  const a = parseSize('6" GLR');
  assert.deepEqual(a?.size, { kind: "pipe", nps_in: 6 });
  assert.deepEqual(a?.systems, ["GLR"]);
  assert.deepEqual(parseSize('4" GLR')?.size, { kind: "pipe", nps_in: 4 });
  assert.deepEqual(parseSize('3/4" GLR')?.size, { kind: "pipe", nps_in: 0.75 });
  const s = parseSize('6" GLS');
  assert.deepEqual(s?.size, { kind: "pipe", nps_in: 6 });
  assert.deepEqual(s?.systems, ["GLS"]);
});

test("parseSize: PIPE — DN/NPS/mm forms (Appendix A's own second PIPE alternative, not yet seen in the six named sets but part of the stated grammar)", () => {
  assert.deepEqual(parseSize("DN150")?.size, { kind: "pipe", nps_in: 5.91 });
  assert.deepEqual(parseSize("NPS100")?.size, { kind: "pipe", nps_in: 3.94 });
  assert.deepEqual(parseSize("150MM")?.size, { kind: "pipe", nps_in: 5.91 });
});

// ── Multi-service and direction — the riser-marker half of the grammar ────

test("parseSize: multi-service HW/CW yields one size and a systems[] of two (Appendix A's shared_geometry doctrine)", () => {
  const parsed = parseSize('\u00be" HW/CW UP');
  assert.deepEqual(parsed?.size, { kind: "pipe", nps_in: 0.75 });
  assert.deepEqual(parsed?.systems, ["HW", "CW"]);
  assert.equal(parsed?.direction, "up");
});

test("parseSize: multi-service shorthand CWS/R also yields a systems[] of two", () => {
  const parsed = parseSize('2" CWS/R');
  assert.deepEqual(parsed?.size, { kind: "pipe", nps_in: 2 });
  assert.deepEqual(parsed?.systems, ["CWS", "R"]);
});

test("parseSize: P101's riser markers — 2\" SAN UP, 1½\" V UP both carry direction \"up\"", () => {
  const san = parseSize('2" SAN UP');
  assert.deepEqual(san?.size, { kind: "pipe", nps_in: 2 });
  assert.deepEqual(san?.systems, ["SAN"]);
  assert.equal(san?.direction, "up");
  const v = parseSize('1\u00bd" V UP');
  assert.deepEqual(v?.size, { kind: "pipe", nps_in: 1.5 });
  assert.deepEqual(v?.systems, ["V"]);
  assert.equal(v?.direction, "up");
});

test("parseSize: P101's 1½\" V UP/DN is a real riser marker going BOTH directions — not collapsed into plain \"down\"", () => {
  const parsed = parseSize('1\u00bd" V UP/DN');
  assert.deepEqual(parsed?.size, { kind: "pipe", nps_in: 1.5 });
  assert.deepEqual(parsed?.systems, ["V"]);
  assert.equal(parsed?.direction, "both", "UP/DN must map to \"both\", matching types.ts's own vertex_overrides dir vocabulary — collapsing it into \"down\" would silently lose the fact this riser also goes up");
});

test("parseSize: VTR (vent through roof) is its own direction, distinct from up/down/both", () => {
  const parsed = parseSize('3" VTR');
  assert.deepEqual(parsed?.size, { kind: "pipe", nps_in: 3 });
  assert.equal(parsed?.direction, "vtr");
});

test("parseSize: the UP/DN direction suffix is not PIPE-only — RECT and ROUND accept it too, per Appendix A's own grammar", () => {
  const rect = parseSize('12"x6" UP/DN');
  assert.equal(rect?.direction, "both");
  const round = parseSize('6"ø DN');
  assert.equal(round?.direction, "down");
  const up = parseSize('12"x6" UP');
  assert.equal(up?.direction, "up");
});

// ── Negative examples — refusal over guessing ──────────────────────────────

test("parseSize: rejects elevation/dimension/note text that a naive \\d+\" pattern would misread as a size", () => {
  assert.equal(parseSize('48" MAX'), null);
  assert.equal(parseSize('80" MIN'), null);
  assert.equal(parseSize('12" ABOVE'), null);
  assert.equal(parseSize('#4@12" O.C.'), null);
});

test("parseSize: rejects a dimension string (^\\d+'-\\d+) and elevation-callout tokens (BOD/AFF/etc.)", () => {
  assert.equal(parseSize('12\'-6"'), null);
  assert.equal(parseSize("EL 100.50"), null);
  assert.equal(parseSize('8\'-0" AFF'), null);
  assert.equal(parseSize("TYP"), null);
});

test("parseSize: rejects empty text and ordinary prose that matches no structural pattern", () => {
  assert.equal(parseSize(""), null);
  assert.equal(parseSize("SEE DETAIL 4 THIS SHEET"), null);
});

// ── associateLabel — plan §6.6's orientation/placement scoring ────────────

test("associateLabel: binds to the nearby, correctly-oriented segment as \"beside\" — confidence is min(orientation, placement)", () => {
  const idx = idxFor([0, 0, 200, 0]);   // a horizontal duct run
  const l = label('12"x6"', { x0: 95, y0: 0, x1: 105, y1: 10, rotDeg: 0, textHeightPx: 10 });   // centered at (100,5), reads horizontally
  const bound = associateLabel(idx, l, 18);
  assert.ok(bound);
  assert.equal(bound!.seg, 0);
  assert.equal(bound!.placement, "beside");
  assert.equal(bound!.confidence, 0.9);
  assert.deepEqual(bound!.parsed.size, { kind: "rect", w_in: 12, h_in: 6 });
});

test("associateLabel: the orientation gate rejects a perpendicular label even when it sits geometrically beside the run", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const l = label('12"x6"', { x0: 95, y0: 0, x1: 105, y1: 10, rotDeg: 90, textHeightPx: 10 });   // vertical text beside a horizontal duct
  assert.equal(associateLabel(idx, l, 18), null);
});

test("associateLabel: orientation tolerance is inclusive at exactly ±10° and rejects just past it", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const atEdge = associateLabel(idx, label('12"x6"', { x0: 95, y0: 0, x1: 105, y1: 10, rotDeg: 10, textHeightPx: 10 }), 18);
  assert.ok(atEdge);
  assert.equal(atEdge!.confidence, 0.7, "1 - (10/10)*0.3 = 0.7 at the tolerance edge");
  const pastEdge = associateLabel(idx, label('12"x6"', { x0: 95, y0: 0, x1: 105, y1: 10, rotDeg: 11, textHeightPx: 10 }), 18);
  assert.equal(pastEdge, null);
});

test("associateLabel: no nearby beside candidate falls back to a leader-terminal point the caller supplies", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const l = label('12"x6"', { x0: 300, y0: 300, x1: 310, y1: 310, rotDeg: 0, textHeightPx: 10 });   // far from the duct — never a "beside" candidate
  const noLeader = associateLabel(idx, l, 18);
  assert.equal(noLeader, null, "no leaderPoints supplied — nothing to bind to");
  const withLeader = associateLabel(idx, l, 18, { leaderPoints: [[100, 0]] });   // the leader's own terminal lands right on the duct
  assert.ok(withLeader);
  assert.equal(withLeader!.seg, 0);
  assert.equal(withLeader!.placement, "leader");
  assert.equal(withLeader!.confidence, 0.75);
});

test("associateLabel: beside beats leader when both are available, per plan §6.6's own tie-break order", () => {
  const idx = idxFor([0, 0, 200, 0, 1000, 1000, 1200, 1000]);   // seg0: the real nearby duct; seg1: a distant, identically-oriented duct only a (contrived) leader could reach
  const l = label('12"x6"', { x0: 95, y0: 0, x1: 105, y1: 10, rotDeg: 0, textHeightPx: 10 });
  const bound = associateLabel(idx, l, 18, { leaderPoints: [[1100, 1000]] });
  assert.equal(bound!.seg, 0, "seg1's own leader candidate scores only 0.75 (leader) vs seg0's 0.9 (beside) — beside wins even though both pass the orientation gate");
  assert.equal(bound!.placement, "beside");
});

test("associateLabel: a label whose text isn't a size at all never binds, regardless of geometry", () => {
  const idx = idxFor([0, 0, 200, 0]);
  const l = label("SEE DETAIL 4 THIS SHEET", { x0: 95, y0: 0, x1: 105, y1: 10, rotDeg: 0, textHeightPx: 10 });
  assert.equal(associateLabel(idx, l, 18), null);
});

test("associationWindowPx: the larger of 6x text height and 4ft*ppf", () => {
  assert.equal(associationWindowPx(label("x", { textHeightPx: 20 }), 10), 120);   // 6*20=120 > 4*10=40
  assert.equal(associationWindowPx(label("x", { textHeightPx: 2 }), 50), 200);    // 4*50=200 > 6*2=12
});

test("associationWindowPx: with no textHeightPx, falls back to the bbox's SHORTER dimension as font height — not the longer one, which is just the string's own length", () => {
  const wide = label("x", { x0: 0, y0: 0, x1: 100, y1: 10, textHeightPx: undefined });    // wide, short — ordinary horizontal text
  assert.equal(associationWindowPx(wide, 1), 60, "6 * 10 (the short dimension), not 6 * 100");
  const tall = label("x", { x0: 0, y0: 0, x1: 10, y1: 100, textHeightPx: undefined });    // narrow, tall — rotated text
  assert.equal(associationWindowPx(tall, 1), 60, "6 * 10 (the short dimension) again, regardless of orientation");
});

// ── associateOnRunFallback — Run 77's own attempted fix for Run 76's own
//    catalogued orientation-gate blind spot: a horizontal label beside a
//    VERTICAL run can never pass associateLabel's own beside orientation
//    check at all (this function is validated correct below and kept, but
//    Run 77 declined to wire it live — see its own writeup for why)
//    (confirmed on three real-corpus instances) ──────────────────────────

test("associateOnRunFallback: a horizontal label beside a vertical run binds when associateLabel itself would reject it outright", () => {
  const idx = idxFor([100, 0, 100, 200]);   // a vertical riser
  const l = label('4" GLR', { x0: 82, y0: 95, x1: 98, y1: 105, rotDeg: 0, textHeightPx: 10 });   // horizontal text, close beside it (center 10px off)
  assert.equal(associateLabel(idx, l, 18), null, "the ordinary path rejects this outright — 90 deg off, not merely scored lower");
  const fallback = associateOnRunFallback(idx, [l], new Set([0]));
  assert.ok(fallback);
  assert.equal(fallback!.seg, 0);
  assert.equal(fallback!.placement, "on-run");
  assert.equal(fallback!.confidence, 0.6, "below LEADER_CONFIDENCE — a genuinely weaker signal than either beside or leader");
  assert.deepEqual(fallback!.parsed.size, { kind: "pipe", nps_in: 4 });
});

test("associateOnRunFallback: restricted to the walked segments — a closer, better-oriented OFF-run stroke never wins over the walked run", () => {
  const idx = idxFor([100, 0, 100, 200, 40, 95, 90, 95]);   // seg 0: the vertical riser; seg 1: a horizontal tick-mark right at the label's own baseline
  const l = label('4" GLR', { x0: 82, y0: 95, x1: 98, y1: 105, rotDeg: 0, textHeightPx: 10 });
  // associateLabel itself picks the tick-mark (seg 1) via ordinary beside placement, exactly like the real bug this catalogues
  const ordinary = associateLabel(idx, l, 18);
  assert.ok(ordinary);
  assert.equal(ordinary!.seg, 1, "the real, confirmed failure mode: a closer, correctly-oriented but unrelated stroke wins");
  // the fallback is only ever tried against the ACTUAL walked segments — seg 1 (the tick-mark) is never a candidate, seg 0 (the real riser) is
  const fallback = associateOnRunFallback(idx, [l], new Set([0]));
  assert.ok(fallback);
  assert.equal(fallback!.seg, 0);
});

test("associateOnRunFallback: two on-run labels with different sizes are a genuine ambiguity — withheld, never guessed", () => {
  const idx = idxFor([100, 0, 100, 200]);
  const a = label('4" GLR', { x0: 82, y0: 95, x1: 98, y1: 105, rotDeg: 0, textHeightPx: 10 });
  const b = label('6" GLR', { x0: 82, y0: 145, x1: 98, y1: 155, rotDeg: 0, textHeightPx: 10 });
  assert.equal(associateOnRunFallback(idx, [a, b], new Set([0])), null);
});

test("associateOnRunFallback: two on-run labels that AGREE on the same size are not treated as a conflict", () => {
  const idx = idxFor([100, 0, 100, 200]);
  const a = label('4" GLR', { x0: 82, y0: 95, x1: 98, y1: 105, rotDeg: 0, textHeightPx: 10 });
  const b = label('4" GLR', { x0: 82, y0: 145, x1: 98, y1: 155, rotDeg: 0, textHeightPx: 10 });
  const fallback = associateOnRunFallback(idx, [a, b], new Set([0]));
  assert.ok(fallback);
  assert.deepEqual(fallback!.parsed.size, { kind: "pipe", nps_in: 4 });
});

test("associateOnRunFallback: a label too far from every walked segment finds nothing", () => {
  const idx = idxFor([100, 0, 100, 200]);
  const l = label('4" GLR', { x0: 400, y0: 400, x1: 450, y1: 410, rotDeg: 0, textHeightPx: 10 });
  assert.equal(associateOnRunFallback(idx, [l], new Set([0])), null);
});

test("associateOnRunFallback: text that isn't a size at all never binds, regardless of geometry", () => {
  const idx = idxFor([100, 0, 100, 200]);
  const l = label("MECHANICAL ROOM", { x0: 40, y0: 95, x1: 90, y1: 105, rotDeg: 0, textHeightPx: 10 });
  assert.equal(associateOnRunFallback(idx, [l], new Set([0])), null);
});

// ── resolveSizeConflicts — the other half of "uniqueness" ─────────────────

function bound(seg: number, wIn: number, confidence: number): BoundSize {
  return { parsed: { size: { kind: "rect", w_in: wIn, h_in: 6 }, systems: [], raw: `${wIn}X6` }, seg, placement: "beside", confidence, factors: { orientation: 1, placement: 0.9 } };
}

test("resolveSizeConflicts: two labels agreeing on the same segment resolve to the higher-confidence one, no conflict", () => {
  const { resolved, conflicts } = resolveSizeConflicts([bound(0, 12, 0.9), bound(0, 12, 0.7)]);
  assert.equal(conflicts.length, 0);
  assert.equal(resolved.get(0)?.confidence, 0.9);
});

test("resolveSizeConflicts: two labels disagreeing on the same segment are withheld with both, per plan §6.6", () => {
  const { resolved, conflicts } = resolveSizeConflicts([bound(0, 12, 0.9), bound(0, 16, 0.9)]);
  assert.equal(resolved.has(0), false, "a conflicted segment never silently resolves to either candidate");
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].seg, 0);
  assert.equal(conflicts[0].candidates.length, 2);
});

test("resolveSizeConflicts: bindings on different segments never conflict with each other", () => {
  const { resolved, conflicts } = resolveSizeConflicts([bound(0, 12, 0.9), bound(1, 16, 0.9)]);
  assert.equal(conflicts.length, 0);
  assert.equal(resolved.get(0)?.parsed.size.kind === "rect" && (resolved.get(0)!.parsed.size as { w_in: number }).w_in, 12);
  assert.equal(resolved.get(1)?.parsed.size.kind === "rect" && (resolved.get(1)!.parsed.size as { w_in: number }).w_in, 16);
});
