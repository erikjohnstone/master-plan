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
import { fingerprintSymbol, sweepRatio, corroborateFingerprint, classifySweepMatches, leftoverLabeledOccs, typicalMultiplierNear, matchQuantity, markRoutingLabels, preferInstallTagOccs, discloseRoutingLabels, dedupeCrossDisciplineRoomViews, disciplineOfSheetNumber, pickSameDisciplineCorroborator, isViewportTitle, viewportSpaceKey, detectSheetViewports, isSheetCategoryTitle, spaceKeyIsLocated, assignMarkToViewport, buildingKeyFromTitle, tileSpaceKey, collapseSpaceKey, OVERSIZED_MARKER_SEGS, type Point, type RoomSweepInstance, type SheetViewport, type TagOcc } from "../src/lib/symbolsweep.ts";

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
const tagNear = (at: Point, h = 40, kind?: TagOcc["kind"]): TagOcc => ({
  cx: at[0] - 5, cy: at[1] + h / 2, h, bbox: [at[0] - 10, at[1], at[0], at[1] + h],
  ...(kind ? { kind } : {}),
});
const tagCompound = (at: Point, h = 40): TagOcc => tagNear(at, h, "compound");

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

test("corroborateFingerprint: an oversized grab is not a marker, even when the same region recurs", () => {
  // A hatch-field of parallel ticks around the tag, copied at a second
  // occurrence. Without the size floor this "corroborates" via an inflated
  // footprint; it is a region, not a device.
  const ticks = (x0: number, y0: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i < OVERSIZED_MARKER_SEGS + 10; i++) out.push(x0 + i * 0.4, y0, x0 + i * 0.4, y0 + 30);
    return out;
  };
  const segs = [...ticks(70, 95), ...ticks(370, 95)];
  const anchor = tagNear([100, 100]);
  const r = corroborateFingerprint(segs, { w: 1000, h: 1000 }, anchor, {
    segs, occ: [tagNear([400, 100])], ratio: { scale: 1, known: true },
  });
  assert.equal(r, null, "a region-sized grab must not corroborate as a device marker");
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

test("classifySweepMatches: a leftover labeled occurrence on a sheet that already has a counted match is promoted", () => {
  // Production sweep_schedule_row does not pass excludeCenter — the seed's
  // own self-match is a counted instance. A second own-tag occurrence a
  // room away, with no sibling marker clearing the bar, is then a leftover
  // labeled install (circuit-label lights, a second hose bibb), not a note.
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }]);
  const far = tagCompound([700, 700]);
  const occ = [tagNear([100, 100]), far];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(r.matches.length, 2, "seed self-match plus the leftover labeled occurrence");
  assert.equal(r.matches.filter((m) => m.labeled_leftover).length, 1);
  assert.equal(r.text_only.length, 0, "the leftover left text_only once it was counted");
  assert.equal(matchQuantity(r.matches), 2);
});

test("markRoutingLabels / preferInstallTagOccs: a destination callout is dropped when a real install remains", () => {
  const installAt: Point = [100, 100];
  const routeAt: Point = [100, 130];
  const occ: TagOcc[] = [tagNear(installAt, 10, "exact"), tagNear(routeAt, 10, "exact")];
  const spans = [
    { str: "EQ-1", x0: 85, y0: 100, x1: 95, y1: 110 },
    { str: "EQ-1", x0: 85, y0: 130, x1: 95, y1: 140 },
    { str: "DUCT DOWN TO", x0: 88, y0: 142, x1: 140, y1: 152 },
  ];
  const marked = markRoutingLabels(spans, occ);
  assert.equal(marked.filter((o) => o.kind === "routing").length, 1);
  assert.equal(marked.filter((o) => o.kind !== "routing").length, 1);
  const split = preferInstallTagOccs(marked);
  assert.equal(split.occ.length, 1, "the install tag remains");
  assert.equal(split.routing.length, 1, "the destination mention is disclosed, not counted");
  assert.ok(Math.abs(split.occ[0].cy - tagNear(installAt, 10).cy) < 1);
});

test("preferInstallTagOccs: if every occurrence is a routing mention, keep them (do not refuse a lone tagged unit)", () => {
  const only: TagOcc[] = [tagNear([100, 100], 10, "routing")];
  const split = preferInstallTagOccs(only);
  assert.equal(split.occ.length, 1);
  assert.equal(split.routing.length, 0);
});

test("classifySweepMatches: a routing-kind occurrence cannot claim a match", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100], 40, "exact"), tagNear([400, 400], 40, "routing")];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(matchQuantity(r.matches), 1, "the routing mention does not count as a second install");
  assert.equal(r.matches.filter((m) => m.labeled_leftover).length, 0);
  assert.ok(r.withheld.some((w) => /carries no/.test(w.reason)), "routing-site geometry cannot claim the mention, so it stays unlabeled");
});

test("classifySweepMatches: two unlabeled-as-routing installs still count as two", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100], 40, "exact"), tagNear([400, 400], 40, "exact")];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(matchQuantity(r.matches), 2, "real second units stay counted");
});

test("discloseRoutingLabels: appends withheld mentions without duplicating text_only", () => {
  const routing: TagOcc[] = [tagNear([700, 700], 10, "routing")];
  const already = discloseRoutingLabels([], routing);
  assert.equal(already.length, 1);
  assert.equal(discloseRoutingLabels(already, routing).length, 1);
});

test("classifySweepMatches: a bare leftover with no nearby marker stays text_only", () => {
  // Production fixture T1: a plan sheet already has counted matches, plus
  // one bare "T1" note with no sibling marker. That note is not an install.
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }]);
  const occ = [tagNear([100, 100], 40, "exact"), tagNear([700, 700], 40, "exact")];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(r.matches.filter((m) => m.labeled_leftover).length, 0);
  assert.equal(r.text_only.length, 1, "the bare note stays disclosed, never counted");
  assert.equal(matchQuantity(r.matches), 1);
});

test("classifySweepMatches: an extra label clustered on a counted match is not a second install", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }]);
  const twin = tagNear([102, 100], 20); // same device, second convention
  const occ = [tagNear([100, 100]), twin];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(r.matches.filter((m) => m.labeled_leftover).length, 0, "a twin label on the counted instance must not promote");
});

test("classifySweepMatches: TYP N next to a geometrically-confirmed tag multiplies that match only", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }]);
  const occ = [tagNear([100, 100]), tagCompound([700, 700])];
  const typSpans = [
    { str: "TYP 3", x0: 90, y0: 130, x1: 130, y1: 150 },
  ];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { typSpans });
  const geo = r.matches.find((m) => !m.labeled_leftover)!;
  const leftover = r.matches.find((m) => m.labeled_leftover)!;
  assert.equal(geo.count, 3, "the confirmed match sits next to TYP 3");
  assert.equal(leftover.count, 1, "a leftover label never inherits TYP");
  assert.equal(matchQuantity(r.matches), 4);
});

test("leftoverLabeledOccs: no counted match — leftovers stay unpromoted (a note on an empty sheet)", () => {
  const occ: TagOcc[] = [tagCompound([700, 700])];
  assert.deepEqual(leftoverLabeledOccs([], occ, new Set(), 20), []);
});

test("leftoverLabeledOccs: a bare leftover never promotes — only a compound circuit/panel label does", () => {
  const counted = [{ at: [100, 100] as Point, tag_at: [90, 90, 110, 110] as [number, number, number, number] }];
  const bareFar = tagNear([700, 700], 40, "exact");
  assert.equal(leftoverLabeledOccs(counted, [bareFar], new Set(), 20).length, 0);
  assert.equal(leftoverLabeledOccs(counted, [tagCompound([700, 700])], new Set(), 20).length, 1);
});

test("typicalMultiplierNear: TYP / TYPICAL + integer 2–50; running text and TYP. alone never multiply", () => {
  const at: Point = [100, 100];
  assert.equal(typicalMultiplierNear([{ str: "TYP 3", x0: 90, y0: 90, x1: 120, y1: 110 }], at, 40), 3);
  assert.equal(typicalMultiplierNear([{ str: "TYPICAL 8", x0: 90, y0: 90, x1: 140, y1: 110 }], at, 40), 8);
  assert.equal(typicalMultiplierNear([{ str: "TYP.", x0: 90, y0: 90, x1: 120, y1: 110 }], at, 40), 1);
  assert.equal(typicalMultiplierNear([{ str: "TYPICAL FOR", x0: 90, y0: 90, x1: 180, y1: 110 }], at, 40), 1);
  assert.equal(typicalMultiplierNear([{ str: "TYP 1", x0: 90, y0: 90, x1: 120, y1: 110 }], at, 40), 1);
  assert.equal(typicalMultiplierNear([{ str: "TYP 99", x0: 90, y0: 90, x1: 120, y1: 110 }], at, 40), 1);
  assert.equal(typicalMultiplierNear([{ str: "TYP 3", x0: 900, y0: 900, x1: 930, y1: 920 }], at, 40), 1, "far-away TYP is someone else's callout");
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

test("classifySweepMatches: two matches closer than half a symbol diagonal collapse to one", () => {
  // Same-device dual convention: two tags, two high-score centroids inside
  // one footprint. Nearest-claim would bill each tag; they overlap, so only
  // the better score counts.
  const anchorSegs = place([{ at: [200, 200] }]);
  const anchor = tagNear([200, 200]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const near: Point = [212, 200];
  const sheetSegs = place([{ at: [200, 200] }, { at: near }]);
  const occ = [tagNear([200, 200]), tagNear(near)];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(r.matches.length, 1, "overlapping matches are one device");
  assert.ok(r.withheld.some((w) => /within a symbol/.test(w.reason)), "the shadow is a disclosed question");
});

test("classifySweepMatches: a different-transform match inside one footprint is a symmetry shadow, not a second install", () => {
  // The seed read under 180°+mirror lands a second centroid just outside
  // half-diagonal (eccentricity). Same-transform siblings at that distance
  // stay two installs; a different transform is the same ink.
  const anchorSegs = place([{ at: [200, 200] }]);
  const anchor = tagNear([200, 200]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const shifted: Point = [200, 226];
  const sheetSegs = place([{ at: [200, 200] }, { at: shifted, rot: 180, mir: true }]);
  const occ = [tagNear([200, 200]), tagNear(shifted)];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {});
  assert.equal(r.matches.length, 1, "a symmetry shadow does not count as a second device");
});

test("classifySweepMatches: two close same-tag labels each keep the match nearest them, not whichever occurrence sorts first", () => {
  // Real undercount shape: two labeled instances sit inside one footprint
  // of each other. First-in-array claiming billed both matches to the
  // earlier occurrence and left the later one text_only, even though each
  // match's own nearest tag was a different real instance.
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const a: Point = [400, 400];
  const b: Point = [400, 455];
  const sheetSegs = place([{ at: [100, 100] }, { at: a }, { at: b }]);
  const occ = [tagNear([100, 100]), tagNear(a), tagNear(b)];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, { excludeCenter: cf.fp.center });
  assert.equal(r.matches.length, 2, "each labeled instance counts once");
  assert.equal(r.text_only.length, 0, "neither close tag is left as bare text");
});

test("classifySweepMatches: a single leftover labeled near-bar match stays withheld", () => {
  // One leftover tagged near-miss is the schematic-versus-plan extra, not
  // a sibling cluster. scoreHigh is raised past 1 so an otherwise-identical
  // second instance falls in the withheld band; the tight family rule, not
  // a lower bar, is what must leave it a question.
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100]), tagNear([400, 400])];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {
    excludeCenter: cf.fp.center,
    scoreHigh: 1.01,
  });
  assert.equal(r.matches.length, 0, "one leftover labeled near-miss is not a family");
  assert.ok(r.withheld.some((w) => w.reason.includes("tag is drawn beside it")), "the leftover stays a disclosed question");
});

test("classifySweepMatches: the seed occurrence does not count as a leftover in the family rule", () => {
  // Same-sheet extra sitting close enough that its withheld is also
  // within R of the seed tag. Treating the seed's own tag as leftover #2
  // would promote that one extra (the schematic/cross-ref shape). The
  // seed is already counted — it is not a leftover.
  const anchorSegs = place([{ at: [200, 200] }]);
  const anchor = tagNear([200, 200]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const extra: Point = [250, 200];
  const sheetSegs = place([{ at: [200, 200] }, { at: extra }]);
  const occ = [tagNear([200, 200]), tagNear(extra)];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {
    excludeCenter: cf.fp.center,
    scoreHigh: 1.01,
  });
  assert.equal(r.matches.length, 0, "seed + one nearby leftover is not a family of two leftovers");
  assert.ok(r.withheld.length >= 1, "the leftover stays a disclosed question");
});

test("classifySweepMatches: extra labels beside the counted instance are not a family", () => {
  // Two leftover tags sharing one near-bar withheld next to the seed —
  // schedule text + a leader on the same device. That is not two sibling
  // copies. scoreHigh past 1 puts the extra geometry in the withheld band.
  const anchorSegs = place([{ at: [200, 200] }]);
  const anchor = tagNear([200, 200]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const extra: Point = [248, 200];
  const sheetSegs = place([{ at: [200, 200] }, { at: extra }]);
  const occ = [tagNear([200, 200]), tagNear(extra), tagNear([248, 230])];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {
    excludeCenter: cf.fp.center,
    scoreHigh: 1.01,
  });
  assert.equal(r.matches.length, 0, "labels on the counted instance do not promote a family");
  assert.ok(r.withheld.length >= 1);
});

test("classifySweepMatches: two leftover labeled near-bar matches on a one-instance sheet COUNT", () => {
  // Same-convention siblings of the seed: the fingerprint cleared the bar
  // once and missed it twice by hatch/size, each leftover still carrying
  // this row's own tag. That cluster is the family exception.
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const a: Point = [400, 400];
  const b: Point = [700, 400];
  const sheetSegs = place([{ at: [100, 100] }, { at: a }, { at: b }]);
  const occ = [tagNear([100, 100]), tagNear(a), tagNear(b)];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {
    excludeCenter: cf.fp.center,
    scoreHigh: 1.01,
  });
  assert.equal(r.matches.length, 2, "the labeled family is promoted, not left withheld");
  const tags = r.matches.map((m) => m.tag_at).sort();
  assert.deepEqual(tags, [occ[1].bbox, occ[2].bbox].sort());
  assert.equal(r.text_only.length, 0);
});

test("classifySweepMatches: a near-bar withheld match with NO own tag stays withheld", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100])];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, [], anchor.h, {
    excludeCenter: cf.fp.center,
    scoreHigh: 1.01,
  });
  assert.equal(r.matches.length, 0);
  assert.ok(r.withheld.length >= 1, "unlabeled near-bar geometry stays a disclosed question");
});

test("classifySweepMatches: a near-bar withheld match carrying a SIBLING's tag is excluded, not promoted", () => {
  const anchorSegs = place([{ at: [100, 100] }]);
  const anchor = tagNear([100, 100]);
  const cf = corroborateFingerprint(anchorSegs, { w: 1000, h: 1000 }, anchor, null)!;
  const sheetSegs = place([{ at: [100, 100] }, { at: [400, 400] }]);
  const occ = [tagNear([100, 100])];
  const siblingOcc = [{ key: "T2", cx: 400 - 15, cy: 400 + 10 }];
  const r = classifySweepMatches("T1", cf.fp, sheetSegs, { scale: 1, known: true }, occ, siblingOcc, anchor.h, {
    excludeCenter: cf.fp.center,
    scoreHigh: 1.01,
  });
  assert.equal(r.matches.length, 0);
  assert.equal(r.excluded.length, 1);
  assert.equal(r.excluded[0].tag, "T2");
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

test("dedupeCrossDisciplineRoomViews: same room, far coordinates, CROSS-discipline — still collapses (enlarged M vs P views of one room, different page crops)", () => {
  // Each sheet crops the same physical room to a different page origin, so
  // the room label (same tag + name) sits near that sheet's own mark — not
  // at one shared bbox that would fail the other crop's attribution pad.
  const roomOnM = { tag: "120", name: "MECH", bbox: [780, 580, 820, 620] as [number, number, number, number] };
  const roomOnP = { tag: "120", name: "MECH", bbox: [2380, 1780, 2420, 1820] as [number, number, number, number] };
  const instances = [
    inst(1, "M3.0", "M", [800, 600], [roomOnM]),
    inst(2, "P4.0", "P", [2400, 1800], [roomOnP]),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "cross-discipline same-room pair collapses even when page crops differ");
  assert.equal(redundant[0].keptDiscipline, "M");
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
  // "PIPING FLOOR PLAN" is a view-type phrase — the leftover FLOOR must not
  // split a duct plan from the piping plan of the same area tile.
  assert.equal(
    viewportSpaceKey("CAMPUS FIRST FLOOR MECHANICAL DUCTWORK PLAN - AREA B"),
    viewportSpaceKey("CAMPUS FIRST FLOOR MECHANICAL PIPING FLOOR PLAN - AREA B"),
  );
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
  assert.equal(single.length, 1, "a single whole-sheet plan title is a space identity for cross-sheet collapse");
  assert.equal(dedupeCrossDisciplineRoomViews([
    inst(1, "MH1", "MH", [1200, 1300], [ROOM], single),
    inst(2, "MH1", "MH", [3400, 1310], [ROOM], single),
  ]).length, 0, "one title is not a same-sheet dual-view — two marks stay two installs");
  // Title-block reprint of the same caption is still one viewport.
  const reprint = detectSheetViewports([
    { str: "FIRST FLOOR MECHANICAL PLAN", x: 1600, y: 3100, w: 400, h: 24 },
    { str: "FIRST FLOOR MECHANICAL PLAN", x: 4800, y: 2400, w: 400, h: 24 },
  ]);
  assert.equal(reprint.length, 1, "the same title printed twice (drawing + title block) is one space, not two views");
  const aliasReprint = detectSheetViewports([
    { str: "CAMPUS - MECHANICAL DUCTWORK ROOF PLAN", x: 4700, y: 2360, w: 400, h: 24 },
    { str: "CAMPUS - MECHANICAL DUCT ROOF PLAN", x: 770, y: 2770, w: 400, h: 24 },
  ]);
  assert.equal(aliasReprint.length, 1, "DUCT vs DUCTWORK is a title-block wording alias, not two views");
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

test("isSheetCategoryTitle / spaceKeyIsLocated: sheet names and key plans are not viewports; a room/floor number is a located space", () => {
  assert.equal(isSheetCategoryTitle("AIR OPS - MECHANICAL ENLARGED PLANS"), true);
  assert.equal(isSheetCategoryTitle("MTRACON - MECHANICAL ENLARGED PLANS"), true);
  assert.equal(isSheetCategoryTitle("ATCT - MECHANICAL DUCTWORK PLAN - FLRS 7, 8, 9, & 10"), true);
  assert.equal(isSheetCategoryTitle("TOWER - MECHANICAL PIPING PLAN - 1, 3 & 5"), true);
  assert.equal(isSheetCategoryTitle("MECHANICAL - DUCT ENLARGED PLAN"), false);
  assert.equal(isSheetCategoryTitle("ATCT - MECHANICAL DUCTWORK PLAN - FLR 8"), false);
  // Singular FLR N & M is one typical-pair drawing, not a multi-floor key plan.
  assert.equal(isSheetCategoryTitle("TOWER - MECHANICAL DUCTWORK PLAN - FLR 3 & 5"), false);
  assert.equal(isSheetCategoryTitle("TOWER - MECHANICAL DUCTWORK PLAN - FLR 11 & 12"), false);
  assert.equal(spaceKeyIsLocated(viewportSpaceKey("ATCT - MECHANICAL DUCTWORK PLAN - FLR 8")), true);
  assert.equal(spaceKeyIsLocated(viewportSpaceKey("MECHANICAL - ROOM 152 ENLARGED DUCT PLAN")), true);
  assert.equal(spaceKeyIsLocated(viewportSpaceKey("MECHANICAL - DUCT ENLARGED PLAN")), false);
  assert.equal(spaceKeyIsLocated(viewportSpaceKey("CAMPUS FIRST FLOOR MECHANICAL DUCTWORK PLAN - AREA B")), true);
  assert.equal(spaceKeyIsLocated(viewportSpaceKey("CAMPUS - MECHANICAL PIPING PLAN")), true);
  assert.equal(buildingKeyFromTitle("CAMPUS - MECHANICAL ENLARGED PLANS"), "CAMPUS");
  assert.equal(buildingKeyFromTitle("MECHANICAL - DUCT ENLARGED PLAN"), "");
  assert.equal(tileSpaceKey("CAMPUS FIRST FLOOR MECHANICAL AREA A"), tileSpaceKey("CAMPUS FIRST FLOOR MECHANICAL AREA B"));
});

test("detectSheetViewports: drops a rotated title-block sheet name so the duct/pipe pair survives", () => {
  const vps = detectSheetViewports([
    { str: "MECHANICAL - DUCT ENLARGED PLAN", x: 323, y: 1414, w: 764, h: 50 },
    { str: "MTRACON - MECHANICAL ENLARGED PLANS", x: 4735, y: 2156, w: 25, h: 426 },
    { str: "MECHANICAL - ENLARGED PIPE PLAN", x: 314, y: 2740, w: 745, h: 50 },
  ], 4896);
  assert.equal(vps.length, 2);
  assert.equal(vps[0].spaceKey, vps[1].spaceKey);
  assert.ok(vps.every((v) => !/PLANS/.test(v.title)));
  assert.equal(vps[0].buildingKey, "MTRACON");
  assert.equal(vps[1].buildingKey, "MTRACON");
});

test("assignMarkToViewport: a stacked duct/pipe pair assigns the lower mark to the lower title (title sits under its view)", () => {
  const stacked: SheetViewport[] = [
    { title: "MECHANICAL - DUCT ENLARGED PLAN", spaceKey: viewportSpaceKey("MECHANICAL - DUCT ENLARGED PLAN"), at: [705, 1439] },
    { title: "MECHANICAL - ENLARGED PIPE PLAN", spaceKey: viewportSpaceKey("MECHANICAL - ENLARGED PIPE PLAN"), at: [686, 2765] },
  ];
  const upper = assignMarkToViewport([681, 687], stacked, 4896, 3168);
  const lower = assignMarkToViewport([825, 2012], stacked, 4896, 3168);
  assert.equal(upper?.title, "MECHANICAL - DUCT ENLARGED PLAN");
  assert.equal(lower?.title, "MECHANICAL - ENLARGED PIPE PLAN");
});

test("dedupeCrossDisciplineRoomViews: stacked same-sheet duct/pipe (titles under each view) collapses", () => {
  const stacked: SheetViewport[] = [
    { title: "MECHANICAL - DUCT ENLARGED PLAN", spaceKey: viewportSpaceKey("MECHANICAL - DUCT ENLARGED PLAN"), at: [705, 1439] },
    { title: "MECHANICAL - ENLARGED PIPE PLAN", spaceKey: viewportSpaceKey("MECHANICAL - ENLARGED PIPE PLAN"), at: [686, 2765] },
  ];
  const instances = [
    inst(1, "M-411", "M", [681, 687], [ROOM], stacked),
    inst(2, "M-411", "M", [825, 2012], [ROOM], stacked),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 1, "lower-view redraw is one install, not a second unit");
});

test("dedupeCrossDisciplineRoomViews: 2×2 room grid — duct/pipe of ONE room collapse; the other room stays", () => {
  const grid: SheetViewport[] = [
    { title: "MECHANICAL - ROOM 151 ENLARGED DUCT PLAN", spaceKey: viewportSpaceKey("MECHANICAL - ROOM 151 ENLARGED DUCT PLAN"), at: [892, 1209] },
    { title: "MECHANICAL - ROOM 151 ENLARGED PIPE PLAN", spaceKey: viewportSpaceKey("MECHANICAL - ROOM 151 ENLARGED PIPE PLAN"), at: [2547, 1209] },
    { title: "MECHANICAL - ROOM 152 ENLARGED DUCT PLAN", spaceKey: viewportSpaceKey("MECHANICAL - ROOM 152 ENLARGED DUCT PLAN"), at: [892, 2946] },
    { title: "MECHANICAL - ROOM 152 ENLARGED PIPE PLAN", spaceKey: viewportSpaceKey("MECHANICAL - ROOM 152 ENLARGED PIPE PLAN"), at: [2532, 2937] },
  ];
  const sameRoom = [
    inst(1, "M-401", "M", [1139, 1991], [ROOM], grid),
    inst(2, "M-401", "M", [3179, 2082], [ROOM], grid),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(sameRoom).length, 1, "room-152 duct + pipe of one pump");
  const twoRooms = [
    inst(1, "M-401", "M", [600, 600], [ROOM], grid),
    inst(2, "M-401", "M", [600, 2000], [OTHER_ROOM], grid),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(twoRooms).length, 0, "room 151 vs room 152 are two spaces");
});

test("dedupeCrossDisciplineRoomViews: cross-sheet complementary views of the same floor collapse", () => {
  const none: typeof ROOM[] = [];
  const ductFlr8: SheetViewport[] = [
    { title: "ATCT - MECHANICAL DUCTWORK PLAN - FLR 7", spaceKey: viewportSpaceKey("ATCT - MECHANICAL DUCTWORK PLAN - FLR 7"), at: [1000, 800] },
    { title: "ATCT - MECHANICAL DUCTWORK PLAN - FLR 8", spaceKey: viewportSpaceKey("ATCT - MECHANICAL DUCTWORK PLAN - FLR 8"), at: [3200, 800] },
  ];
  const pipeFlr8: SheetViewport[] = [
    { title: "ATCT - MECHANICAL PIPING PLAN - FLR 7", spaceKey: viewportSpaceKey("ATCT - MECHANICAL PIPING PLAN - FLR 7"), at: [1000, 800] },
    { title: "ATCT - MECHANICAL PIPING PLAN - FLR 8", spaceKey: viewportSpaceKey("ATCT - MECHANICAL PIPING PLAN - FLR 8"), at: [3200, 800] },
  ];
  assert.equal(ductFlr8[1].spaceKey, pipeFlr8[1].spaceKey);
  // Farther than COORD_ATTRIBUTION_MAX_PX, no room bubbles — only space-key.
  const pair = [
    inst(1, "MH122", "MH", [3300, 200], none, ductFlr8),
    inst(2, "MP122", "MP", [3400, 600], none, pipeFlr8),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(pair);
  assert.equal(redundant.length, 1, "duct-plan + piping-plan of floor 8 is one install");
  const differentFloors = [
    inst(1, "MH122", "MH", [1100, 200], none, ductFlr8),
    inst(2, "MP122", "MP", [3300, 200], none, pipeFlr8),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(differentFloors).length, 0, "floor 7 vs floor 8 stay independent");
});

test("dedupeCrossDisciplineRoomViews: two real repeats on the kept sheet survive a complementary-view collapse", () => {
  const none: typeof ROOM[] = [];
  const duct: SheetViewport[] = [
    { title: "LEVEL 2 MECHANICAL DUCTWORK PLAN", spaceKey: viewportSpaceKey("LEVEL 2 MECHANICAL DUCTWORK PLAN"), at: [2500, 1800] },
    { title: "LEVEL 1 MECHANICAL DUCTWORK PLAN", spaceKey: viewportSpaceKey("LEVEL 1 MECHANICAL DUCTWORK PLAN"), at: [2500, 3800] },
  ];
  const pipe: SheetViewport[] = [
    { title: "LEVEL 2 MECHANICAL PIPING PLAN", spaceKey: viewportSpaceKey("LEVEL 2 MECHANICAL PIPING PLAN"), at: [2500, 1800] },
    { title: "LEVEL 1 MECHANICAL PIPING PLAN", spaceKey: viewportSpaceKey("LEVEL 1 MECHANICAL PIPING PLAN"), at: [2500, 3800] },
  ];
  assert.equal(duct[1].spaceKey, pipe[1].spaceKey);
  const instances = [
    inst(1, "MH101", "MH", [1800, 2500], none, duct),
    inst(2, "MH101", "MH", [3200, 2700], none, duct),
    inst(3, "MP101", "MP", [1900, 3000], none, pipe),
    inst(4, "MP101", "MP", [3100, 3200], none, pipe),
  ];
  const redundant = dedupeCrossDisciplineRoomViews(instances);
  assert.equal(redundant.length, 2, "the piping-plan pair is the redraw; both duct-plan installs remain");
});

test("assignMarkToViewport: a 2×2 grid assigns a left-column mark to the left title, not a higher right-column title", () => {
  const grid: SheetViewport[] = [
    { title: "TOWER DUCTWORK PLAN - FLR 2", spaceKey: viewportSpaceKey("TOWER DUCTWORK PLAN - FLR 2"), at: [3200, 1500] },
    { title: "TOWER DUCTWORK PLAN - FLR 1", spaceKey: viewportSpaceKey("TOWER DUCTWORK PLAN - FLR 1"), at: [900, 2900] },
    { title: "TOWER DUCTWORK PLAN - FLR 3 & 5", spaceKey: viewportSpaceKey("TOWER DUCTWORK PLAN - FLR 3 & 5"), at: [2800, 2900] },
  ];
  const left = assignMarkToViewport([800, 1520], grid, 4896, 3168);
  assert.equal(left?.title, "TOWER DUCTWORK PLAN - FLR 1", "upper-left belongs to the left column, not FLR 2");
  const rightUpper = assignMarkToViewport([3300, 400], grid, 4896, 3168);
  assert.equal(rightUpper?.title, "TOWER DUCTWORK PLAN - FLR 2");
});

test("dedupeCrossDisciplineRoomViews: whole-sheet duct vs piping of the same area tile collapse", () => {
  const none: typeof ROOM[] = [];
  const ductTitle = "CAMPUS FIRST FLOOR MECHANICAL DUCTWORK PLAN - AREA B";
  const pipeTitle = "CAMPUS FIRST FLOOR MECHANICAL PIPING FLOOR PLAN - AREA B";
  assert.equal(viewportSpaceKey(ductTitle), viewportSpaceKey(pipeTitle));
  const duct: SheetViewport[] = [{ title: ductTitle, spaceKey: viewportSpaceKey(ductTitle), at: [1050, 2420], buildingKey: "CAMPUS" }];
  const pipe: SheetViewport[] = [{ title: pipeTitle, spaceKey: viewportSpaceKey(pipeTitle), at: [1080, 2420], buildingKey: "CAMPUS" }];
  const pair = [
    inst(1, "MH102", "MH", [1670, 1660], none, duct),
    inst(2, "MP102", "MP", [1690, 1535], none, pipe),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(pair).length, 1, "one install on complementary whole-sheet plans");
});

test("dedupeCrossDisciplineRoomViews: floor plan vs enlarged crop of the same building collapse", () => {
  const none: typeof ROOM[] = [];
  const floorTitle = "CAMPUS - MECHANICAL PIPING PLAN";
  const enlDuct = "MECHANICAL - DUCT ENLARGED PLAN";
  const enlPipe = "MECHANICAL - ENLARGED PIPE PLAN";
  const floor: SheetViewport[] = [{ title: floorTitle, spaceKey: viewportSpaceKey(floorTitle), at: [400, 2760], buildingKey: "CAMPUS" }];
  const enlarged: SheetViewport[] = [
    { title: enlDuct, spaceKey: viewportSpaceKey(enlDuct), at: [705, 1439], buildingKey: "CAMPUS" },
    { title: enlPipe, spaceKey: viewportSpaceKey(enlPipe), at: [686, 2765], buildingKey: "CAMPUS" },
  ];
  assert.equal(collapseSpaceKey(enlDuct, viewportSpaceKey(enlDuct), "CAMPUS"), collapseSpaceKey(floorTitle, viewportSpaceKey(floorTitle), "CAMPUS"));
  const pair = [
    inst(1, "MP111", "MP", [2150, 2050], none, floor),
    inst(2, "M-411", "M", [1070, 1010], none, enlarged),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(pair).length, 1, "enlarged crop is the same install as the floor plan");
  const bare: SheetViewport[] = [
    { title: enlDuct, spaceKey: viewportSpaceKey(enlDuct), at: [705, 1439] },
    { title: enlPipe, spaceKey: viewportSpaceKey(enlPipe), at: [686, 2765] },
  ];
  const otherBare: SheetViewport[] = [
    { title: "MECHANICAL DUCT ENLARGED PLAN - MECH RM", spaceKey: viewportSpaceKey("MECHANICAL DUCT ENLARGED PLAN - MECH RM"), at: [900, 1500] },
  ];
  assert.equal(dedupeCrossDisciplineRoomViews([
    inst(1, "M-4A", "M", [800, 800], none, bare),
    inst(2, "M-4B", "M", [900, 900], none, otherBare),
  ]).length, 0, "two untitled enlarged rooms never meet");
});

test("dedupeCrossDisciplineRoomViews: two area tiles of the same floor share a unique tag (match-line)", () => {
  const none: typeof ROOM[] = [];
  const areaA = "CAMPUS FIRST FLOOR MECHANICAL PIPING FLOOR PLAN - AREA A";
  const areaB = "CAMPUS FIRST FLOOR MECHANICAL PIPING FLOOR PLAN - AREA B";
  const a: SheetViewport[] = [{ title: areaA, spaceKey: viewportSpaceKey(areaA), at: [580, 2750], buildingKey: "CAMPUS" }];
  const b: SheetViewport[] = [{ title: areaB, spaceKey: viewportSpaceKey(areaB), at: [1080, 2420], buildingKey: "CAMPUS" }];
  const pair = [
    inst(1, "MP101", "MP", [1200, 2410], none, a),
    inst(2, "MP102", "MP", [1290, 1360], none, b),
  ];
  assert.equal(dedupeCrossDisciplineRoomViews(pair).length, 1, "match-line redraw on adjacent area tiles is one install");
  const lvl2 = "CAMPUS SECOND FLOOR MECHANICAL PIPING FLOOR PLAN - AREA B";
  const otherFloor: SheetViewport[] = [{ title: lvl2, spaceKey: viewportSpaceKey(lvl2), at: [1080, 2420], buildingKey: "CAMPUS" }];
  assert.equal(dedupeCrossDisciplineRoomViews([
    inst(1, "MP101", "MP", [1200, 2410], none, a),
    inst(2, "MP104", "MP", [1290, 1360], none, otherFloor),
  ]).length, 0, "first floor vs second floor stay independent");
  const twoAndTwo = [
    inst(1, "MP101", "MP", [800, 800], none, a),
    inst(2, "MP101", "MP", [1600, 900], none, a),
    inst(3, "MP102", "MP", [900, 800], none, b),
    inst(4, "MP102", "MP", [1700, 900], none, b),
  ];
  assert.equal(
    dedupeCrossDisciplineRoomViews(twoAndTwo).length, 0,
    "two real units on each area tile of a type-mark are not a match-line unique",
  );
});
