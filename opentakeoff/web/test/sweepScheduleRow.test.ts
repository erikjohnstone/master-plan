// sweep_schedule_row's shared engine (maturity plan Phase 3, #HVAC-crossscale):
// sweepRatio, corroborateFingerprint, classifySweepMatches — extracted from
// the MCP server's session.ts (mcp/src/session.ts, sweepScheduleRow) into
// symbolsweep.ts so the browser Agent and the MCP server call the identical
// pure engine instead of two implementations that can silently drift, same
// doctrine as fingerprintSymbol/matchSymbol themselves. Real gap this closes:
// the browser's own pre-Phase-3 port explicitly skipped corroboration and
// cross-scale matching entirely (documented in its own code comment).
//
// Same synthetic-symbol convention as symbolsweep.test.ts (asymmetric under
// every rotation/mirror, so a wrong transform is never accidentally right).
import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprintSymbol, sweepRatio, corroborateFingerprint, classifySweepMatches, dedupeCrossDisciplineRoomViews, dedupeAlignedSameSheetViews, disciplineOfSheetNumber, pickSameDisciplineCorroborator, prefersTagClaimCoverage, typicalCountMultiplier, splitHyphenTagOcc, isIndividuallyMarkedEquipmentSchedule, type Point, type RoomSweepInstance, type TaggedViewLandmark } from "../src/lib/symbolsweep.ts";

const SYMBOL: [number, number, number, number][] = [
  [0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0],  // square
  [0, 0, 20, 20],                                                   // diagonal
  [20, 10, 34, 10],                                                 // stub, +x
];
function place(sets: { at: Point; rot?: number; mir?: boolean; sc?: number; segs?: [number, number, number, number][] }[]): number[] {
  const out: number[] = [];
  for (const s of sets) {
    const th = ((s.rot ?? 0) * Math.PI) / 180;
    const c = Math.cos(th), sn = Math.sin(th);
    const k = s.sc ?? 1;
    const tx = (x0: number, y0: number): Point => {
      const x = x0 * k, y = y0 * k;
      const mx = s.mir ? -x : x;
      return [mx * c - y * sn + s.at[0], mx * sn + y * c + s.at[1]];
    };
    for (const [ax, ay, bx, by] of s.segs ?? SYMBOL) {
      const a = tx(ax, ay), b = tx(bx, by);
      out.push(a[0], a[1], b[0], b[1]);
    }
  }
  return out;
}
// A tag's own text bbox, sitting just left of its marker at `at` — the same
// real-world layout sweep_schedule_row assumes (bbox padding grows from the
// tag's own height, not the marker's). h is deliberately generous (the real
// SYMBOL fixture spans 34×20 local units) so pad 1× alone comfortably
// encloses the whole marker — these tests are about corroboration/
// classification logic, not re-testing the pad ladder's own widening
// behavior (that's covered directly, see the "bare underline" test below).
const tagNear = (at: Point, h = 40): { cx: number; cy: number; h: number; bbox: [number, number, number, number] } => ({
  cx: at[0] - 5, cy: at[1] + h / 2, h, bbox: [at[0] - 10, at[1], at[0], at[1] + h],
});

// ── sweepRatio ───────────────────────────────────────────────────────────
test("sweepRatio: same object short-circuits to {scale:1, known:true} without touching upp", () => {
  const seed = { upp: null };
  assert.deepEqual(sweepRatio(seed, seed), { scale: 1, known: true });
});
test("sweepRatio: both scales known — the real ratio, upp_seed / upp_target", () => {
  assert.deepEqual(sweepRatio({ upp: 0.5 }, { upp: 0.25 }), { scale: 2, known: true });
  assert.deepEqual(sweepRatio({ upp: 0.25 }, { upp: 0.5 }), { scale: 0.5, known: true });
});
test("sweepRatio: either sheet missing a scale — 1:1 assumed, but disclosed as NOT known", () => {
  assert.deepEqual(sweepRatio({ upp: null }, { upp: 0.5 }), { scale: 1, known: false });
  assert.deepEqual(sweepRatio({ upp: 0.5 }, { upp: null }), { scale: 1, known: false });
  assert.deepEqual(sweepRatio({ upp: null }, { upp: null }), { scale: 1, known: false });
  assert.deepEqual(sweepRatio({ upp: undefined }, { upp: 0.5 }), { scale: 1, known: false });
});

// ── corroborateFingerprint ───────────────────────────────────────────────
test("corroborateFingerprint: no corroborator (tag drawn once) — first real-marker pad accepted, uncorroborated", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null);
  assert.ok(r);
  assert.equal(r!.corroborated, false);
  assert.equal(r!.fp.segments, 6, "the whole marker, not just the underline");
});

test("corroborateFingerprint: same-scale corroborator — accepts once the fingerprint recurs there", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const corroSegs = place([{ at: [500, 500] }]); // a second, same-shape instance on the corroborating sheet
  const corroOcc = [tagNear([500, 500])];
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, { segs: corroSegs, occ: corroOcc, ratio: { scale: 1, known: true } });
  assert.ok(r);
  assert.equal(r!.corroborated, true);
});

test("corroborateFingerprint: CROSS-SCALE corroborator — a plan-scale anchor corroborates against a 12x detail sheet", () => {
  // the real HVAC scenario Phase 3 exists for: two plan sheets (or a plan +
  // detail) drawn at genuinely different scales, ratio read from their own
  // committed upp — never searched.
  const anchorSegs = place([{ at: [100, 100] }]); // plan-scale anchor
  const anchor = tagNear([100, 100]);
  const corroSegs = place([{ at: [2000, 1500], sc: 12 }]); // the SAME mark drawn 12x larger on a detail sheet
  const corroOcc = [tagNear([2000, 1500], 120)]; // the tag's own text is 12x larger there too
  const ratio = sweepRatio({ upp: 1 }, { upp: 1 / 12 }); // anchor upp=1, corroborator upp=1/12 → scale 12
  assert.equal(ratio.scale, 12);
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, { segs: corroSegs, occ: corroOcc, ratio });
  assert.ok(r, "corroborates across the scale boundary using the STATED ratio, not a search");
  assert.equal(r!.corroborated, true);
});

test("corroborateFingerprint: refuses (null) when nothing ever recurs at the corroborator", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  // corroborator sheet has SOME geometry, but not a matching instance anywhere
  const corroSegs = place([{ at: [900, 900], segs: [[0, 0, 5, 0]] }]); // an unrelated stray line
  const corroOcc = [tagNear([900, 900])];
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, { segs: corroSegs, occ: corroOcc, ratio: { scale: 1, known: true } });
  assert.equal(r, null, "no repeatable marker geometry — refused, never a guessed fingerprint");
});

test("corroborateFingerprint: a bare underline/leader (< 3 segments) at pad 1 is degenerate — widens instead of accepting it", () => {
  // pad 1 around the tag catches only a short 2-segment scrap; pad 2 reaches the real marker
  const anchorSegs = [
    ...place([{ at: [100, 100], segs: [[-5, 20, 25, 20]] }]), // a lone underline right under the tag (1 segment)
    ...place([{ at: [100, 100] }]),                            // the real marker, further out
  ];
  const anchor = tagNear([100, 100]);
  const r = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null);
  assert.ok(r);
  assert.ok(r!.fp.segments >= 3, "never fingerprints the degenerate underline alone");
});

// ── disciplineOfSheetNumber / pickSameDisciplineCorroborator ────────────────
// The real HUM-1/DFC-1 bug (itd-d1-lab, set 002): each tag's HUMIDIFIER
// SCHEDULE / DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE table has no
// sibling row at all (a genuine single-row table), and the tag's only OTHER
// drawn text occurrence anywhere in the set sat on a different-discipline
// sheet (a plumbing sheet's own callout at the unit's connection point) —
// sweep_schedule_row's same-tag corroboration required a whole-shape match
// to recur THERE, which it structurally never could (a plumbing callout
// isn't the mechanical symbol's own linework), producing a false "linework
// does not recur" refusal on a tag confirmed by direct render to be a real,
// correctly single, drawn instance. These fixtures are synthetic — no
// set/tag/page from the real corpus — so the fix is proven generic.
test("disciplineOfSheetNumber: reads the leading AIA letters off a real sheet number", () => {
  assert.equal(disciplineOfSheetNumber("M3.0"), "M");
  assert.equal(disciplineOfSheetNumber("P4.0"), "P");
  assert.equal(disciplineOfSheetNumber("E-101"), "E");
  assert.equal(disciplineOfSheetNumber("ahu-3"), "AHU", "case-insensitive, up to 3 letters");
});
test("disciplineOfSheetNumber: no leading letters, empty, or missing — null, never guessed", () => {
  assert.equal(disciplineOfSheetNumber("3.0"), null);
  assert.equal(disciplineOfSheetNumber(""), null);
  assert.equal(disciplineOfSheetNumber(null), null);
  assert.equal(disciplineOfSheetNumber(undefined), null);
});

test("pickSameDisciplineCorroborator: real HUM-1/DFC-1 shape — the only other occurrence is a DIFFERENT discipline, so no corroborator (null), not a false pick", () => {
  const candidates = [{ sheetNumber: "P4.0" }]; // the plumbing callout — the tag's only other occurrence
  const pick = pickSameDisciplineCorroborator("M3.0", candidates, (c) => c.sheetNumber);
  assert.equal(pick, null, "a cross-discipline occurrence must never be trusted as a required same-tag corroborator");
});

test("pickSameDisciplineCorroborator: a real same-discipline second occurrence IS picked, even when a cross-discipline one is preferred by the caller's own ordering", () => {
  const candidates = [{ sheetNumber: "P4.0" }, { sheetNumber: "M5.0" }]; // caller's own preference order (occ-count/ord)
  const pick = pickSameDisciplineCorroborator("M3.0", candidates, (c) => c.sheetNumber);
  assert.deepEqual(pick, { sheetNumber: "M5.0" }, "skips the cross-discipline candidate for the real same-discipline one");
});

test("pickSameDisciplineCorroborator: anchor discipline unreadable — falls back to the caller's first candidate unchanged (prior any-sheet behavior)", () => {
  const candidates = [{ sheetNumber: "P4.0" }, { sheetNumber: "M5.0" }];
  const pick = pickSameDisciplineCorroborator(null, candidates, (c) => c.sheetNumber);
  assert.deepEqual(pick, candidates[0], "no cross-discipline distinction can be safely drawn without a known anchor discipline");
});

test("pickSameDisciplineCorroborator: no candidates at all — null", () => {
  assert.equal(pickSameDisciplineCorroborator("M3.0", [], (c: { sheetNumber: string }) => c.sheetNumber), null);
});

// ── classifySweepMatches ─────────────────────────────────────────────────
test("classifySweepMatches: a confident match carrying its OWN tag counts", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100]), tagNear([400, 400])];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 1, "the seed itself is excluded via excludeCenter, the other instance counts");
  assert.deepEqual(r.matches[0].tag_at, occ[1].bbox);
});

test("classifySweepMatches: a confident match carrying a SIBLING's tag is excluded, named", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100])]; // ONLY T1's own tag is here — the second instance is unlabeled by T1
  const siblingOcc = [{ key: "T2", cx: 400 - 15, cy: 400 + 10 }]; // but IS labeled T2
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, siblingOcc, anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 0);
  assert.equal(r.excluded.length, 1);
  assert.equal(r.excluded[0].tag, "T2");
});

test("classifySweepMatches: a confident match with no tag at all is withheld as a question, reason names the row", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100])]; // the second instance has no tag drawn near it, from ANY row
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 0);
  assert.equal(r.withheld.length, 1);
  assert.match(r.withheld[0].reason, /carries no "T1" tag/);
});

test("classifySweepMatches: a drawn tag occurrence with no matching geometry nearby is text_only, never counted", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }]); // only the seed's own instance — nothing at [700,700]
  const occ = [tagNear([100, 100]), tagNear([700, 700])]; // but T1 is drawn (bare text) at [700,700] too
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 0, "the seed is excluded via excludeCenter — nothing else to count");
  assert.equal(r.text_only.length, 1);
  const t = tagNear([700, 700]);
  assert.deepEqual(r.text_only[0].at, [Math.round(t.cx * 10) / 10, Math.round(t.cy * 10) / 10]);
});

test("classifySweepMatches: cross-scale sweep — the fingerprint is resized per-sheet, and it says so", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  // this sheet draws the SAME mark 12x larger
  const sheetSegs = place([{ at: [2000, 1500], sc: 12 }]);
  const occ = [tagNear([2000, 1500], 120)];
  const ratio = sweepRatio({ upp: 1 }, { upp: 1 / 12 });
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, ratio, occ, [], anchor.h, {});
  assert.equal(r.matches.length, 1, "found only because the ratio resized the seed before matching");
  assert.ok(r.scaled, "a non-1 ratio discloses what it cost (#186)");
  assert.equal(r.scaled!.ratio, 12);
});

// ── dedupeCrossDisciplineRoomViews ──────────────────────────────────────────
// The real AC-1 bug (itd-d1-lab-mechanical.pdf#7/#25, set 002): the SAME
// physical unit drawn on an M-series AND a P-series "enlarged" plan of the
// SAME room reads as two installs unless something recognizes the two
// occurrences as one redrawn device, not two. These fixtures are synthetic —
// no set/tag/page from the real corpus — so the function is proven generic.
const ROOM = { tag: "120", name: "MECH", bbox: [1000, 1000, 1040, 1020] as [number, number, number, number] };
const OTHER_ROOM = { tag: "130", name: "ELEC", bbox: [4000, 3000, 4040, 3020] as [number, number, number, number] };
const NEAR_ROOM = [1010, 1010] as Point; // well inside ROOM's bbox
const SHEET_W = 5000, SHEET_H = 4000;
function inst(id: number, sheet: string, discipline: string | null, at: Point, rooms: typeof ROOM[]): RoomSweepInstance<number> {
  return { id, sheet, discipline, at, rooms, sheetWidthPx: SHEET_W, sheetHeightPx: SHEET_H };
}

test("dedupeCrossDisciplineRoomViews: same tag, same room, two different-discipline sheets — collapses to one (the real AC-1 shape)", () => {
  const instances = [
    inst(1, "M3.0", "M", NEAR_ROOM, [ROOM]),
    inst(2, "P4.0", "P", NEAR_ROOM, [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "exactly one of the two collapses");
  // disciplines tie at 1 match each — alphabetically-first ("M") wins the keep
  assert.equal(redundant[0].id, 2);
  assert.equal(redundant[0].sheet, "P4.0");
  assert.equal(redundant[0].keptDiscipline, "M");
  assert.equal(redundant[0].keptSheet, "M3.0");
  assert.match(redundant[0].room, /120/);
});

test("dedupeCrossDisciplineRoomViews: negative control — same tag, DIFFERENT rooms, different disciplines — both real, both kept", () => {
  const instances = [
    inst(1, "M3.0", "M", [1010, 1010], [ROOM]),
    inst(2, "P4.0", "P", [4010, 3010], [OTHER_ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "two genuinely distinct installs in two different rooms must never collapse");
});

test("dedupeCrossDisciplineRoomViews: unnamed two-digit tokens do not prove a shared room", () => {
  const weak = { tag: "12", name: "", bbox: [990, 990, 1030, 1010] as [number, number, number, number] };
  const instances = [
    inst(1, "M1.0", "M", [1000, 1000], [weak]),
    inst(2, "M2.0", "M", [1400, 1200], [weak]),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(instances).length, 0,
    "the same nearby detail/size numeral on two sheets is not room-registration evidence");
});

test("dedupeCrossDisciplineRoomViews: negative control — same tag, same room, SAME discipline — a real repeat within one trade, not a redundant view", () => {
  const instances = [
    inst(1, "M3.0", "M", [1005, 1005], [ROOM]),
    inst(2, "M3.0", "M", [1030, 1015], [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "one discipline drawing the same room twice is a real separate-install signal, never collapsed");
});

test("dedupeCrossDisciplineRoomViews: no room within a plausible distance, and the marks themselves are far apart too — never guesses, never collapses", () => {
  // ROOM sits far outside the 20%-of-diagonal attribution bound from `at`,
  // and the two `at` marks are also >COORD_ATTRIBUTION_MAX_PX apart, so
  // NEITHER the room-based nor the coordinate-proximity fallback fires —
  // two real, unrelated marks that just happen to have no nearby room.
  const instances = [
    inst(1, "M3.0", "M", [10, 10], [ROOM]),
    inst(2, "P4.0", "P", [500, 500], [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "a room label too far from the mark is never attributed, and the marks are too far apart to be the same device, so nothing collapses");
});

test("dedupeCrossDisciplineRoomViews: no room nearby, but the marks sit at nearly the same coordinate — coordinate-proximity fallback collapses (real LEF-1 shape, itd-d1-lab-mechanical.pdf: an exhaust fan serving a building-wide riser, no room number drawn near it on either its M2.0 or P3.0 view, marks 9.2px apart)", () => {
  const instances = [
    inst(1, "M3.0", "M", [2231.8, 2356.8], [ROOM]),
    inst(2, "P4.0", "P", [2234.7, 2363.5], [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "two cross-discipline marks with no attributable room, sitting within the coordinate-proximity threshold, collapse to one");
  assert.equal(redundant[0].id, 2);
  assert.equal(redundant[0].keptDiscipline, "M");
  assert.equal(redundant[0].keptSheet, "M3.0");
});

test("dedupeCrossDisciplineRoomViews: no room nearby, marks close but SAME discipline — a real repeat, never collapsed by the coordinate fallback either", () => {
  const instances = [
    inst(1, "M3.0", "M", [10, 10], [ROOM]),
    inst(2, "M3.0", "M", [15, 12], [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "same-discipline marks, even at near-identical coordinates, are a real separate-install signal — the coordinate fallback still requires 2+ disciplines, same doctrine as the room-based path");
});

test("dedupeCrossDisciplineRoomViews: same tag, same room, SAME discipline but two DIFFERENT SHEETS — collapses (real itd-d1-lab-mechanical.pdf WC-1 shape: P1.0 'PLUMBING FOUNDATION PLAN' and P2.0 'PLUMBING FLOOR PLAN', both discipline 'P', both redrawing the same physical water closet in 'Rest. 102')", () => {
  const instances = [
    inst(1, "P1.0", "P", [1005, 1005], [ROOM]),
    inst(2, "P2.0", "P", NEAR_ROOM, [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "one sheet's redrawn view collapses even though both share a discipline");
  assert.equal(redundant[0].keptDiscipline, "P", "the kept view's own discipline is still reported correctly");
  assert.match(redundant[0].room, /120/);
});

test("dedupeCrossDisciplineRoomViews: negative control — same tag, same discipline, different sheets, but DIFFERENT rooms — never collapses (two real, distinct installs, e.g. two different floors using the same room-numbering)", () => {
  const instances = [
    inst(1, "P1.0", "P", [1010, 1010], [ROOM]),
    inst(2, "P2.0", "P", [4010, 3010], [OTHER_ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "two genuinely distinct installs in two different rooms must never collapse, even on same-discipline sheets");
});

test("dedupeCrossDisciplineRoomViews: no room nearby, marks close, SAME discipline but DIFFERENT sheets — coordinate-proximity fallback now collapses too (the WC-1 shape without a readable room label)", () => {
  const instances = [
    inst(1, "P1.0", "P", [2231.8, 2356.8], [ROOM]),
    inst(2, "P2.0", "P", [2234.7, 2363.5], [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "same-discipline marks on two different sheets, within the coordinate-proximity threshold, collapse to one");
  assert.equal(redundant[0].keptDiscipline, "P");
  assert.equal(redundant[0].keptSheet, "P1.0");
});

test("dedupeCrossDisciplineRoomViews: asymmetric room attribution still collapses a tight redraw pair", () => {
  const room = { tag: "102", name: "RESTROOM", bbox: [90, 90, 110, 110] as [number, number, number, number] };
  const instances: RoomSweepInstance<number>[] = [
    { id: 1, sheet: "set.pdf#1", discipline: "P", at: [100, 100], rooms: [room], sheetWidthPx: 5000, sheetHeightPx: 5000 },
    { id: 2, sheet: "set.pdf#2", discipline: "P", at: [112, 106], rooms: [], sheetWidthPx: 5000, sheetHeightPx: 5000 },
  ];
  assert.deepEqual(dedupeCrossDisciplineRoomViews(instances).map((entry) => entry.id), [2]);
});

test("dedupeCrossDisciplineRoomViews: two sub-30px pairs override contradictory incidental room reads", () => {
  const instances: RoomSweepInstance<number>[] = [
    { id: 1, sheet: "set.pdf#1", discipline: "P", at: [100, 100], rooms: [{ tag: "102", name: "", bbox: [95, 95, 105, 105] }], sheetWidthPx: 5000, sheetHeightPx: 5000 },
    { id: 2, sheet: "set.pdf#2", discipline: "P", at: [118, 108], rooms: [{ tag: "103", name: "", bbox: [113, 103, 123, 113] }], sheetWidthPx: 5000, sheetHeightPx: 5000 },
    { id: 3, sheet: "set.pdf#1", discipline: "P", at: [500, 500], rooms: [{ tag: "104", name: "", bbox: [495, 495, 505, 505] }], sheetWidthPx: 5000, sheetHeightPx: 5000 },
    { id: 4, sheet: "set.pdf#2", discipline: "P", at: [512, 508], rooms: [{ tag: "105", name: "", bbox: [507, 503, 517, 513] }], sheetWidthPx: 5000, sheetHeightPx: 5000 },
  ];
  assert.deepEqual(dedupeCrossDisciplineRoomViews(instances).map((entry) => entry.id), [2, 4]);
});

test("dedupeCrossDisciplineRoomViews: one tight coincidence across different rooms is not registration", () => {
  const instances: RoomSweepInstance<number>[] = [
    { id: 1, sheet: "set.pdf#1", discipline: "M", at: [100, 100], rooms: [{ tag: "101", name: "", bbox: [95, 95, 105, 105] }], sheetWidthPx: 5000, sheetHeightPx: 5000 },
    { id: 2, sheet: "set.pdf#2", discipline: "M", at: [112, 106], rooms: [{ tag: "201", name: "", bbox: [107, 101, 117, 111] }], sheetWidthPx: 5000, sheetHeightPx: 5000 },
  ];
  assert.deepEqual(dedupeCrossDisciplineRoomViews(instances), []);
});

test("dedupeCrossDisciplineRoomViews: an instance with no known discipline never enters the dedup (never dropped, never a kept anchor)", () => {
  const instances = [
    inst(1, "M3.0", "M", NEAR_ROOM, [ROOM]),
    inst(2, "UNKNOWN", null, NEAR_ROOM, [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "only one known discipline present (the unattributed instance sits out) — nothing to collapse against");
});

test("dedupeCrossDisciplineRoomViews: three disciplines drawing the same room — keeps the LARGEST single-discipline count, never the sum", () => {
  const instances = [
    inst(1, "M3.0", "M", [1005, 1005], [ROOM]),
    inst(2, "M3.0", "M", [1030, 1015], [ROOM]), // M draws 2 real units in this room
    inst(3, "P4.0", "P", NEAR_ROOM, [ROOM]),
    inst(4, "E2.0", "E", NEAR_ROOM, [ROOM]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 2, "P's and E's single redrawn views both collapse; M's real 2 units are untouched");
  const ids = redundant.map((r) => r.id).sort();
  assert.deepEqual(ids, [3, 4]);
  for (const r of redundant) assert.equal(r.keptDiscipline, "M");
});

test("dedupeCrossDisciplineRoomViews: paired AIA discipline-overlay sheets register by suffix and position", () => {
  const instances: RoomSweepInstance<number>[] = [
    { id: 1, sheet: "set.pdf#14", sheetNumber: "MH121", discipline: "MH", at: [900, 1650], rooms: [], sheetWidthPx: 5000, sheetHeightPx: 5000 },
    { id: 2, sheet: "set.pdf#23", sheetNumber: "MP121", discipline: "MP", at: [828, 1428], rooms: [], sheetWidthPx: 5000, sheetHeightPx: 5000 },
  ];
  assert.deepEqual(dedupeCrossDisciplineRoomViews(instances).map((entry) => entry.id), [2]);
  assert.deepEqual(dedupeCrossDisciplineRoomViews([
    instances[0],
    { ...instances[1], id: 3, at: [3000, 3000] },
  ]), [], "a shared numeric suffix without coordinate registration is insufficient");
});

test("dedupeAlignedSameSheetViews: aligned side-by-side system plans collapse one redrawn instance", () => {
  const landmarks: TaggedViewLandmark[] = ["AHU-1", "P-1", "P-2", "AS-1"].flatMap((tag, i) => [
    { tag, at: [500 + i * 40, 600 + i * 100] as Point },
    { tag, at: [3500 + i * 55, 605 + i * 100] as Point },
  ]);
  const redundant = dedupeAlignedSameSheetViews(
    [{ id: 1, at: [600, 900] }, { id: 2, at: [3600, 905] }],
    landmarks,
    5000,
    4000,
  );
  assert.deepEqual(redundant, [2], "the right-hand redraw collapses after four independent aligned tags prove two registered views");
});

test("dedupeAlignedSameSheetViews: repeated equipment within one view is never collapsed", () => {
  const landmarks: TaggedViewLandmark[] = ["AHU-1", "P-1", "P-2", "AS-1"].flatMap((tag, i) => [
    { tag, at: [500 + i * 40, 600 + i * 100] as Point },
    { tag, at: [3500 + i * 55, 605 + i * 100] as Point },
  ]);
  const redundant = dedupeAlignedSameSheetViews(
    [{ id: 1, at: [500, 900] }, { id: 2, at: [700, 930] }],
    landmarks,
    5000,
    4000,
  );
  assert.deepEqual(redundant, [], "two real instances in the same left-hand plan remain two");
});

test("dedupeAlignedSameSheetViews: fewer than four aligned tag pairs is insufficient evidence", () => {
  const landmarks: TaggedViewLandmark[] = ["T-1", "T-2", "T-3"].flatMap((tag, i) => [
    { tag, at: [500, 600 + i * 100] as Point },
    { tag, at: [3500, 600 + i * 100] as Point },
  ]);
  const redundant = dedupeAlignedSameSheetViews(
    [{ id: 1, at: [500, 900] }, { id: 2, at: [3500, 900] }],
    landmarks,
    5000,
    4000,
  );
  assert.deepEqual(redundant, [], "weak symmetry on a normal plan cannot erase a real installation");
});

test("dedupeAlignedSameSheetViews: paired duct/pipe enlarged-plan captions admit four paired tags with two aligned", () => {
  const landmarks: TaggedViewLandmark[] = [
    { tag: "B-1", at: [100, 100] }, { tag: "B-1", at: [600, 390] },
    { tag: "B-2", at: [120, 200] }, { tag: "B-2", at: [620, 202] },
    { tag: "DH-1", at: [140, 300] }, { tag: "DH-1", at: [640, 300] },
    { tag: "FCU-1", at: [160, 400] }, { tag: "FCU-1", at: [660, 510] },
  ];
  const instances = [{ id: "left", at: [150, 300] as Point }, { id: "right", at: [650, 300] as Point }];
  const captions = [
    { text: "MECHANICAL DUCT ENLARGED PLAN - MECH RM", at: [250, 600] as Point },
    { text: "MECHANICAL PIPE ENLARGED PLAN - MECH RM", at: [750, 600] as Point },
  ];
  assert.deepEqual(dedupeAlignedSameSheetViews(instances, landmarks, 2000, 800, captions), ["right"]);
  assert.deepEqual(dedupeAlignedSameSheetViews(
    instances,
    landmarks,
    2000,
    800,
    captions.map((caption) => ({ ...caption, text: caption.text.replace(/DUCT|PIPE/, "DUCT") })),
  ), []);
});

test("dedupeAlignedSameSheetViews: horizontal stacked views retain the larger view count", () => {
  const landmarks: TaggedViewLandmark[] = ["AHU-1", "P-1", "P-2", "AS-1"].flatMap((tag, i) => [
    { tag, at: [600 + i * 100, 500] as Point },
    { tag, at: [605 + i * 100, 3500] as Point },
  ]);
  const redundant = dedupeAlignedSameSheetViews(
    [{ id: 1, at: [600, 500] }, { id: 2, at: [650, 550] }, { id: 3, at: [605, 3500] }],
    landmarks,
    5000,
    5000,
  );
  assert.deepEqual(redundant, [3], "the fuller top view's two real instances win over the partial bottom redraw");
});

test("prefersTagClaimCoverage ranks exact-tag coverage before raw geometric popularity", () => {
  assert.equal(prefersTagClaimCoverage(
    { claimed: 8, rawMatches: 8, segments: 20 },
    { claimed: 7, rawMatches: 3, segments: 40 },
  ), true);
  assert.equal(prefersTagClaimCoverage(
    { claimed: 8, rawMatches: 12, segments: 40 },
    { claimed: 8, rawMatches: 8, segments: 20 },
  ), false);
  assert.equal(prefersTagClaimCoverage(
    { claimed: 8, rawMatches: 8, segments: 40 },
    { claimed: 8, rawMatches: 8, segments: 20 },
  ), true);
});

test("typicalCountMultiplier reads only an adjacent aligned TYP count", () => {
  const spans = [
    { str: "TYP 8", x0: 100, y0: 130, x1: 144, y1: 149 },
    { str: "TYP 50", x0: 700, y0: 130, x1: 760, y1: 149 },
  ];
  assert.equal(typicalCountMultiplier(spans, [100, 100, 133, 119]), 8);
  assert.equal(typicalCountMultiplier(spans, [400, 100, 433, 119]), 1);
  assert.equal(typicalCountMultiplier([{ str: "TYP NOTE", x0: 100, y0: 130, x1: 160, y1: 149 }], [100, 100, 133, 119]), 1);
});

test("splitHyphenTagOcc recovers an exact adjacent two-run tag without fuzzy joining", () => {
  const spans = [
    { str: "SCHWP", x0: 100, y0: 200, x1: 160, y1: 220 },
    { str: "M1", x0: 176, y0: 200, x1: 196, y1: 220 },
    { str: "M2", x0: 400, y0: 200, x1: 420, y1: 220 },
  ];
  assert.equal(splitHyphenTagOcc(spans, "SCHWP-M1").length, 1);
  assert.equal(splitHyphenTagOcc(spans, "SCHWP-M2").length, 0);
  assert.equal(splitHyphenTagOcc(spans, "SCHWP-M1-X").length, 0);
  assert.equal(splitHyphenTagOcc([
    { str: "TP", x0: 100, y0: 200, x1: 120, y1: 220 },
    { str: "2", x0: 125, y0: 200, x1: 135, y1: 220 },
  ], "TP-2").length, 0, "short plumbing tags stay on the existing conservative fragment path");
  assert.equal(splitHyphenTagOcc([
    { str: "M2", x0: 100, y0: 160, x1: 120, y1: 180 },
    { str: "SHHWP", x0: 80, y0: 190, x1: 140, y1: 210 },
  ], "SHHWP-M2").length, 1, "a rotated pump tag may extract its suffix immediately above the family stem");
});

test("individually marked equipment schedules exclude repeatable type-symbol schedules", () => {
  assert.equal(isIndividuallyMarkedEquipmentSchedule("FAN COIL UNIT SCHEDULE"), true);
  assert.equal(isIndividuallyMarkedEquipmentSchedule("AIRHANDLINGUNITSCHEDULE"), true);
  assert.equal(isIndividuallyMarkedEquipmentSchedule("DEDICATED OUTDOOR AIR UNIT SCHEDULE"), true);
  assert.equal(isIndividuallyMarkedEquipmentSchedule("SECONDARY CHILLED WATER PUMP SCHEDULE"), true);
  assert.equal(isIndividuallyMarkedEquipmentSchedule("GRILLE, REGISTER, AND DIFFUSER SCHEDULE"), false);
  assert.equal(isIndividuallyMarkedEquipmentSchedule("PLUMBING FIXTURE SCHEDULE"), false);
  assert.equal(isIndividuallyMarkedEquipmentSchedule("LUMINAIRE SCHEDULE"), false);
});
