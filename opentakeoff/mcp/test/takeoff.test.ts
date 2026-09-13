// takeoff.ts — the project-level plan-set takeoff pipeline. `classifyLegendCaption`
// is pure (no Session/PDF), so it's unit-tested directly; `buildLegendTakeoff`'s
// scale-gate and glyph-detection wiring is exercised against the bundled demo
// plan and the existing legend-plan.pdf fixture (no new fixture PDF needed —
// this session's own real-corpus run against itd-d1-lab-mechanical.pdf, kept
// external per this project's own corpus-PDFs-never-enter-the-repo rule,
// already exercised the full real path end to end: 226 real legend glyphs
// detected across 2 real legend sheets, 20 matching the valve/actuator/damper
// taxonomy, all correctly refused with REFUSED_NO_SCALE because neither real
// legend sheet in that set carries a title-block scale note — see this
// session's own final report for the exact numbers and a visually-verified
// match).
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import {
  buildPlanSetTakeoff,
  buildLegendTakeoff,
  classifyLegendCaption,
  classifyError,
  hasAuthoredReconciliationStructure,
  isInstalledEquipmentTakeoffTable,
} from "../src/takeoff.ts";
import { shutdownVectorGrid } from "../../web/src/lib/vectorGridClient.ts";

after(async () => { await shutdownVectorGrid(); });

const DEMO = fileURLToPath(new URL("../../demo/sample-plan.pdf", import.meta.url));
const LEGENDPLAN = fileURLToPath(new URL("./fixtures/legend-plan.pdf", import.meta.url));
const SCALEGAP = fileURLToPath(new URL("./fixtures/legend-scale-gap.pdf", import.meta.url));

test("classifyError: an unscoped reused group mark is a reviewable association refusal, not an engine error", () => {
  assert.equal(classifyError('The mark "SG-1" is independently defined in drawing groups AIR OPS, ATCT, but set.pdf#31 has no authored drawing-group title. Those placements cannot be assigned to AIR OPS without guessing.'), "CROSS_SHEET_ASSOCIATION_FAILURE");
});

test("installed-equipment walk excludes BAS points rows while preserving ordinary equipment schedules", () => {
  const points = {
    sheet: "set.pdf#10",
    kind: "equipment",
    title: { text: "AHU DDC POINTS LIST", bbox: [0, 0, 100, 10] },
    headers: ["MARK", "DESCRIPTION", "ALARM", "TREND"],
    rows: [{ key: "AI01", cells: {} }],
  } as any;
  const equipment = {
    sheet: "set.pdf#11",
    kind: "equipment",
    title: { text: "AIR HANDLING UNIT SCHEDULE", bbox: [0, 0, 100, 10] },
    headers: ["MARK", "CFM"],
    rows: [{ key: "AHU-1", cells: {} }],
  } as any;

  assert.equal(isInstalledEquipmentTakeoffTable(points), false);
  assert.equal(isInstalledEquipmentTakeoffTable(equipment), true);
});

test("installed-equipment walk refuses anonymous one-cell plan crops but keeps structurally authored grids", () => {
  const planCrop = {
    sheet: "set.pdf#4",
    kind: "equipment",
    title: { text: "341.1-2", bbox: [100, 100, 200, 120] },
    headers: ["COL1", "COL2", "COL3", "COL4"],
    rows: [{
      key: "CP-63381EV-6EV-5CP-5",
      cells: { COL1: { text: "CP-6 338.1 EV-6 EV-5 CP-5" } },
    }],
  } as any;
  const anonymousButStructured = {
    ...planCrop,
    rows: [{
      key: "P-1",
      cells: { COL1: { text: "P-1" }, COL2: { text: "120 GPM" } },
    }],
  } as any;
  const namedSingleColumn = {
    ...planCrop,
    headers: ["MARK"],
    rows: [{ key: "P-1", cells: { MARK: { text: "P-1" } } }],
  } as any;

  assert.equal(isInstalledEquipmentTakeoffTable(planCrop), false);
  assert.equal(isInstalledEquipmentTakeoffTable(anonymousButStructured), true);
  assert.equal(isInstalledEquipmentTakeoffTable(namedSingleColumn), true);
  assert.equal(
    hasAuthoredReconciliationStructure({ ...planCrop, kind: "reference" }),
    false,
    "the same pseudo-grid must not re-enter through the deferred reference-table pass",
  );
  assert.equal(
    hasAuthoredReconciliationStructure({ ...anonymousButStructured, kind: "reference" }),
    true,
  );
});

// ── classifyLegendCaption (pure) ────────────────────────────────────────────

test("classifyLegendCaption: a caption naming a family this taxonomy has no specific entry for still classifies at the CATEGORY level", () => {
  // "triple duty valve" is a real device (observed live, itd-d1-lab-
  // mechanical.pdf's own general legend) with no dedicated VALVES entry —
  // must still be recognized as a valve, not dropped, mirroring
  // classifyTag's own "unrecognized tag is corpus evidence, not a reason to
  // drop the row" doctrine for the schedule-row pass above it.
  const m = classifyLegendCaption("TRIPLE DUTY VALVE", ["valve", "actuator", "damper"]);
  assert.equal(m.category, "valve");
  assert.equal(m.equipment_type, null);
});

test("classifyLegendCaption: an unambiguous caption resolves to the ONE specific hvacTaxonomy component it names", () => {
  const m = classifyLegendCaption("OPPOSED BLADE CONTROL DAMPER", ["valve", "actuator", "damper"]);
  assert.equal(m.category, "damper");
  assert.equal(m.equipment_type, "Opposed-blade damper");
});

test("classifyLegendCaption: a caption that scores equally against 2+ specific components is reported AMBIGUOUS, never silently resolved by picking one", () => {
  // real case, itd-d1-lab-mechanical.pdf#16's own "CONTROLS LEGEND": one
  // glyph captioned for both port counts at once, ties exactly between the
  // 2-way and 3-way electric control-valve entries.
  const m = classifyLegendCaption("3-WAY, 2-WAY CONTROL VALVE", ["valve"]);
  assert.equal(m.category, "valve");
  assert.equal(m.equipment_type, null);
  assert.ok(m.ambiguous_with && m.ambiguous_with.length >= 2);
});

test("classifyLegendCaption: a spelled-out number word compares equal to hvacTaxonomy's own numeral convention", () => {
  // real bug found and fixed building this pass: itd-d1-lab-mechanical.pdf's
  // own general legend spells the port count out ("THREE-WAY CONTROL
  // VALVE") on a DIFFERENT sheet than its numeral-using "CONTROLS LEGEND"
  // ("3-WAY..."). Before normalizing number words, "THREE-WAY CONTROL
  // VALVE" scored HIGHER against the unrelated "Bypass control valve" (2 of
  // 3 words hit) than against "3-way electric/pneumatic control valve" (3
  // of 5, missing only "THREE"↔"3") — a wrong specific match, not just an
  // unresolved one.
  const m = classifyLegendCaption("THREE-WAY CONTROL VALVE", ["valve"]);
  assert.equal(m.category, "valve");
  assert.notEqual(m.equipment_type, "Bypass control valve");
  assert.ok(!m.equipment_type || /3-way/.test(m.equipment_type), `expected a 3-way control valve candidate (or an honest ambiguity between them), got ${JSON.stringify(m)}`);
});

test("classifyLegendCaption: a caption naming no in-scope family at all classifies as nothing (not forced into the nearest category)", () => {
  const m = classifyLegendCaption("UNION", ["valve", "actuator", "damper"]);
  assert.equal(m.category, null);
  assert.equal(m.equipment_type, null);
});

test("classifyLegendCaption: category filter is honored — a real match outside the requested categories is excluded", () => {
  const m = classifyLegendCaption("GATE VALVE", ["damper"]);
  assert.equal(m.category, null, "valve is a real match, but this run only asked for damper");
});

test("classifyLegendCaption: an actuator caption matches the actuator family purely from hvacTaxonomy's own derived vocabulary", () => {
  const m = classifyLegendCaption("ELECTRIC ACTUATOR", ["valve", "actuator", "damper"]);
  assert.equal(m.category, "actuator");
  assert.equal(m.equipment_type, "Electric actuator");
});

// ── buildPlanSetTakeoff (schedule-row pass) — the demo plan carries no
// equipment schedule, so this exercises the "nothing in scope" path honestly
// rather than crashing or fabricating a table. ─────────────────────────────

test("buildPlanSetTakeoff: a plan with no equipment schedule returns zero items, not an error, and every item carries source: schedule_row", async () => {
  const s = new Session();
  await s.loadPlan(DEMO);
  const r = await buildPlanSetTakeoff(s, { categories: ["valve", "actuator", "damper"] });
  assert.equal(r.stats.schedule_rows_total, 0);
  assert.deepEqual(r.items, []);
  assert.ok(r.legend_items, "the legend pass is wired in and always present, even when empty");
});

// ── buildLegendTakeoff ───────────────────────────────────────────────────

test("buildLegendTakeoff: no legend-role sheet in the set returns an honest empty result", async () => {
  const s = new Session();
  await s.loadPlan(DEMO);
  const r = await buildLegendTakeoff(s, { categories: ["valve", "actuator", "damper"] });
  assert.deepEqual(r.legend_sheets_seen, []);
  assert.deepEqual(r.items, []);
  assert.equal(r.stats.glyphs_seen, 0);
});

test("buildLegendTakeoff: a legend-only fixture discovers its real rows and refuses counts without scale", async () => {
  // The generated fixture has a literal CONTROLS SYMBOLS title and four
  // visually verified valve/damper rows. It is correctly legend-role under
  // the current classifier; because it has no scale or plan sheet, each
  // installed count must refuse rather than invent a legend-to-plan ratio.
  const s = new Session();
  await s.loadPlan(LEGENDPLAN);
  const r = await buildLegendTakeoff(s, { categories: ["valve", "actuator", "damper"] });
  assert.deepEqual(r.legend_sheets_seen, [{ sheet: "legend-plan.pdf", glyphs_detected: 4 }]);
  assert.equal(r.items.length, 4);
  assert.ok(r.items.every((item) => item.status === "refused"));
  assert.ok(r.items.every((item) => /No committed real-world scale/.test(item.reason || "")));
});

// This session's own investigation (SET 002, itd-d1-lab-mechanical.pdf):
// the real corpus's 20 REFUSED_NO_SCALE legend items are refused because
// the LEGEND SHEET ITSELF carries no real-world scale, detected or
// committed — every one of the set's 10 real plan-role sheets already has
// a usable detected title-block scale (confirmed directly, this session's
// own probe script), so the gap is never the "some plan sheet lacks scale"
// half of the old blanket check. An empirical test (temporarily bypassing
// the scale gate to sweep at an assumed 1:1 ratio) confirmed this refusal
// is load-bearing, not over-conservative: several legend glyphs came back
// with thousands of obviously-false "matches" (10000+, one over 26000
// total instances across the set) once the true size ratio was assumed
// away — real, direct evidence a legend glyph's own drawn size is NOT a
// reliable stand-in for its real installed size, so REFUSED_NO_SCALE is
// correct here, not a bug to route around. The four-row legend-plan.pdf test
// above pins that refusal. The smaller legend-scale-gap.pdf below carries
// only one glyph/caption row; current legend learning requires structural
// repetition before creating an inventory, so that separate fixture pins
// the honest no-quorum outcome instead of weakening the detector.
test("buildLegendTakeoff: a one-row legend without structural quorum remains an honest empty inventory", async () => {
  const s = new Session();
  await s.loadPlan(SCALEGAP);
  const r = await buildLegendTakeoff(s, { categories: ["valve", "actuator", "damper"] });
  assert.equal(r.legend_sheets_seen.length, 1);
  assert.equal(r.legend_sheets_seen[0].glyphs_detected, 0);
  assert.deepEqual(r.items, []);
  assert.equal(r.failures.length, 0);
});
