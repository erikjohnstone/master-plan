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
import { fingerprintSymbol, sweepRatio, corroborateFingerprint, classifySweepMatches, dedupeCrossDisciplineRoomViews, disciplineOfSheetNumber, pickSameDisciplineCorroborator, isViewportTitle, viewportSpaceKey, detectSheetViewports, type Point, type RoomSweepInstance, type SheetViewport } from "../src/lib/symbolsweep.ts";

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
function inst(id: number, sheet: string, discipline: string | null, at: Point, rooms: typeof ROOM[], viewports?: SheetViewport[]): RoomSweepInstance<number> {
  return { id, sheet, discipline, at, rooms, sheetWidthPx: SHEET_W, sheetHeightPx: SHEET_H, ...(viewports ? { viewports } : {}) };
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
  // coordinate clustering does not join them — two real, unrelated marks
  // that just happen to have no nearby room.
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

test("dedupeCrossDisciplineRoomViews: one side room-attributed, the other not, marks within the coordinate threshold — collapses (asymmetric roomTags on two same-footprint plan sheets)", () => {
  // Real residual after the sheet-key generalization: a pair at ~6–30px on
  // P1.0 / P2.0 where only one sheet's roomTags() credits a nearby bubble.
  // Grouping by room first left the attributed mark out of the coordinate
  // pool, so the pair survived as two installs.
  const instances = [
    inst(1, "P1.0", "P", [2439.6, 980.7], [ROOM]), // ROOM is ~1400px away — not attributed
    inst(2, "P2.0", "P", [2437.9, 986.7], [{ tag: "124", name: "ASPHALT LAB", bbox: [2420, 970, 2460, 1000] }]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "an attributed/unattributed pair at the same coordinate still collapses");
  assert.equal(redundant[0].keptDiscipline, "P");
});

test("dedupeCrossDisciplineRoomViews: same room name, different sheets, marks far apart — never collapses (two real installs, not a redraw)", () => {
  // Two service sinks sharing a tag, each drawn on only one of two same-
  // discipline plan sheets, ~200px apart — the same room bubble is near
  // both on a full-sheet diagonal pad, but they are not the same fixture.
  const janitor = { tag: "105", name: "JANITOR", bbox: [2700, 1100, 2860, 1220] as [number, number, number, number] };
  const instances = [
    inst(1, "P1.0", "P", [2593, 1150], [janitor]),
    inst(2, "P2.0", "P", [2796, 1151], [janitor]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "same room, 200px apart, two sheets: two real fixtures, never collapsed");
});

// ── same-sheet titled viewports (duct plan | piping plan of one room) ─────

const DUCT_TITLE = "MECHANICAL ROOM ENLARGED DUCT PLAN";
const PIPE_TITLE = "MECHANICAL ROOM ENLARGED PIPING PLAN";
const DUAL_VIEWS: SheetViewport[] = [
  { title: DUCT_TITLE, spaceKey: viewportSpaceKey(DUCT_TITLE), at: [1000, 3200] },
  { title: PIPE_TITLE, spaceKey: viewportSpaceKey(PIPE_TITLE), at: [3200, 3200] },
];

test("viewportSpaceKey: complementary views of one room compare equal; different rooms/levels stay distinct", () => {
  assert.equal(viewportSpaceKey(DUCT_TITLE), viewportSpaceKey(PIPE_TITLE));
  assert.equal(viewportSpaceKey("MECHANICAL ROOM SECTION 1"), viewportSpaceKey("MECHANICAL ROOM SECTION 3"));
  assert.notEqual(viewportSpaceKey("LEVEL 1 PLAN"), viewportSpaceKey("LEVEL 2 PLAN"));
  assert.notEqual(viewportSpaceKey("ROOM 151 ENLARGED DUCT PLAN"), viewportSpaceKey("ROOM 202 ENLARGED DUCT PLAN"));
});

test("isViewportTitle / detectSheetViewports: accepts paired room-plan titles, rejects notes and a lone whole-sheet title", () => {
  assert.equal(isViewportTitle(DUCT_TITLE), true);
  assert.equal(isViewportTitle(PIPE_TITLE), true);
  assert.equal(isViewportTitle("MECHANICAL ROOM SECTION 1"), true);
  assert.equal(isViewportTitle("PROVIDE VOLUME DAMPERS ON ALL DUCT TAKEOFFS SERVING"), false);
  assert.equal(isViewportTitle("AND DUCT PLANS"), false);
  assert.equal(isViewportTitle("PLAN"), false);
  const dual = detectSheetViewports([
    { str: DUCT_TITLE, x: 800, y: 3180, w: 400, h: 24 },
    { str: PIPE_TITLE, x: 3000, y: 3180, w: 440, h: 24 },
    { str: "PROVIDE DUCT PRESSURE READING PORTS BEFORE AND AFTER", x: 5000, y: 350, w: 500, h: 16 },
  ]);
  assert.equal(dual.length, 2);
  assert.equal(dual[0].spaceKey, dual[1].spaceKey);
  const single = detectSheetViewports([
    { str: "FIRST FLOOR MECHANICAL PLAN", x: 2000, y: 3800, w: 400, h: 24 },
  ]);
  assert.equal(single.length, 0, "a single whole-sheet plan title is not a dual-view");
  // Title-block reprint of the same caption is still one viewport.
  const reprint = detectSheetViewports([
    { str: "FIRST FLOOR MECHANICAL PLAN", x: 1600, y: 3100, w: 400, h: 24 },
    { str: "FIRST FLOOR MECHANICAL PLAN", x: 4800, y: 2400, w: 400, h: 24 },
  ]);
  assert.equal(reprint.length, 0, "the same title printed twice (drawing + title block) is not a dual-view");
  const aliasReprint = detectSheetViewports([
    { str: "MTRACON - MECHANICAL DUCTWORK ROOF PLAN", x: 4700, y: 2360, w: 400, h: 24 },
    { str: "MTRACON - MECHANICAL DUCT ROOF PLAN", x: 770, y: 2770, w: 400, h: 24 },
  ]);
  assert.equal(aliasReprint.length, 0, "DUCT vs DUCTWORK is a title-block wording alias, not two views");
  assert.equal(isViewportTitle("INDICATED ON THE FLOOR PLAN"), false);
  assert.equal(isViewportTitle("MECHANICAL ROOF PLAN FOR CONTINUATION."), false);
});

test("dedupeCrossDisciplineRoomViews: same tag, same sheet, two titled viewports of the same room — collapses (duct plan | piping plan)", () => {
  const instances = [
    inst(1, "M4.1", "M", [1200, 1300], [ROOM], DUAL_VIEWS),
    inst(2, "M4.1", "M", [3400, 1310], [ROOM], DUAL_VIEWS),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "the piping-plan redraw collapses; one install remains");
  assert.equal(redundant[0].sheet, "M4.1");
  assert.equal(redundant[0].keptSheet, "M4.1");
});

test("dedupeCrossDisciplineRoomViews: same tag, same sheet, two matches in ONE viewport — still a real repeat, never collapsed", () => {
  const instances = [
    inst(1, "M4.1", "M", [1100, 1300], [ROOM], DUAL_VIEWS),
    inst(2, "M4.1", "M", [1300, 1500], [ROOM], DUAL_VIEWS),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "both marks nearest the same view title — two real units on one drawing");
});

test("dedupeCrossDisciplineRoomViews: same tag, same sheet, two viewports of DIFFERENT spaces — never collapsed", () => {
  const views: SheetViewport[] = [
    { title: "LEVEL 1 MECHANICAL PLAN", spaceKey: viewportSpaceKey("LEVEL 1 MECHANICAL PLAN"), at: [1000, 2000] },
    { title: "LEVEL 2 MECHANICAL PLAN", spaceKey: viewportSpaceKey("LEVEL 2 MECHANICAL PLAN"), at: [3500, 2000] },
  ];
  assert.notEqual(views[0].spaceKey, views[1].spaceKey);
  const instances = [
    inst(1, "M2.1", "M", [1200, 1500], [ROOM], views),
    inst(2, "M2.1", "M", [3600, 1500], [OTHER_ROOM], views),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 0, "two floors on one sheet are two installs even if the tag string matches");
});

test("dedupeCrossDisciplineRoomViews: same-sheet viewport collapse does not require a room bubble (enlarged room IS the sheet)", () => {
  const elsewhere = [{ tag: "999", name: "ELSEWHERE", bbox: [4800, 3800, 4840, 3820] as [number, number, number, number] }];
  const noRoom = [
    inst(1, "M4.1", "M", [1200, 1300], elsewhere, DUAL_VIEWS),
    inst(2, "M4.1", "M", [3400, 1310], elsewhere, DUAL_VIEWS),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(noRoom);
  assert.equal(redundant.length, 1, "viewport path fires even when no room number is near either mark");
});
