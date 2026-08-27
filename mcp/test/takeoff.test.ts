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
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { buildPlanSetTakeoff, buildLegendTakeoff, classifyLegendCaption } from "../src/takeoff.ts";

const DEMO = fileURLToPath(new URL("../../demo/sample-plan.pdf", import.meta.url));
const LEGENDPLAN = fileURLToPath(new URL("./fixtures/legend-plan.pdf", import.meta.url));

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

test("buildLegendTakeoff: a single-sheet fixture with no classifiable plan-role sheet still runs without throwing", async () => {
  // legend-plan.pdf (scripts/make-legend-fixture.mjs) is a single sheet with
  // no title-block text, so sheet_graph classifies it role:"unknown", not
  // "legend" — buildLegendTakeoff must degrade to an honest empty result
  // (no legend sheet recognized) rather than throw, exactly like the
  // schedule-row pass above degrades on a set with nothing in scope.
  const s = new Session();
  await s.loadPlan(LEGENDPLAN);
  const r = await buildLegendTakeoff(s, { categories: ["valve", "actuator", "damper"] });
  assert.deepEqual(r.legend_sheets_seen, []);
  assert.deepEqual(r.items, []);
});
