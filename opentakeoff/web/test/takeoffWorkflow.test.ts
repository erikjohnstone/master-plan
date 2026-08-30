// Durable takeoff workflow state machine — intent classify, phase advance,
// illegal transitions (no corpus hardcoding).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTakeoffIntent,
  namedPointsListTitles,
  advanceTakeoffWorkflow,
  isIllegalWorkflowTransition,
  workflowDirective,
} from "../src/lib/takeoffWorkflow.js";

const D10_GOAL = [
  "Takeoff POINTS LIST DOAH-TI, POINTS LIST AHU-T1A/TIB,",
  "FCU WITH COOLING ONLY DDC POINTS LIST, FCU WITH HEATING AND COOLING DDC POINTS LIST,",
  "and UNIT HEATER DDC POINTS LIST: row counts and AI/AO/BI/BO point-type breakdown and totals.",
].join(" ");

test("classifyTakeoffIntent maps points-list takeoffs", () => {
  assert.equal(classifyTakeoffIntent(D10_GOAL), "points_takeoff");
  assert.equal(
    classifyTakeoffIntent("How many FCUs across Air Ops vs MITRACON buildings?"),
    "fcu_buildings",
  );
  assert.equal(classifyTakeoffIntent("Trace AHU-1 connectivity"), "generic");
});

test("namedPointsListTitles extracts goal list titles", () => {
  const titles = namedPointsListTitles(D10_GOAL);
  assert.ok(titles.some((t) => /DOAH-TI/i.test(t)));
  assert.ok(titles.some((t) => /AHU-T1A/i.test(t)));
  assert.ok(titles.some((t) => /UNIT HEATER DDC/i.test(t)));
});

test("points_takeoff advances survey → title_scans → spot_cites", () => {
  const intent = "points_takeoff";
  const survey = advanceTakeoffWorkflow(intent, [], D10_GOAL);
  assert.equal(survey.phase, "survey");
  assert.ok(survey.allowedTools?.includes("sheet_graph"));
  assert.equal(
    isIllegalWorkflowTransition(survey, "query_table", { title: "POINTS LIST DOAH-TI" }),
    true,
  );

  const afterGraph = advanceTakeoffWorkflow(intent, [{
    name: "sheet_graph",
    out: { sheets: [{ id: "M-601" }] },
  }], D10_GOAL);
  assert.equal(afterGraph.phase, "title_scans");
  assert.equal(
    isIllegalWorkflowTransition(afterGraph, "query_table", {
      title: "POINTS LIST DOAH-TI",
      cell_contains: "AI",
    }),
    true,
    "bans AI/AO/BI/BO cell_contains during title_scans",
  );
  assert.equal(
    isIllegalWorkflowTransition(afterGraph, "query_table", {
      title: "POINTS LIST DOAH-TI",
    }),
    false,
  );

  const titles = namedPointsListTitles(D10_GOAL);
  const scans = titles.map((title) => ({
    name: "query_table",
    args: { title },
    out: { query: { title }, count: 10, matches: [{ title: { text: title } }], point_type_counts: { AI: 1 } },
  }));
  const afterScans = advanceTakeoffWorkflow(intent, [
    { name: "sheet_graph", out: { sheets: [] } },
    ...scans,
  ], D10_GOAL);
  assert.equal(afterScans.phase, "spot_cites");
});

test("workflowDirective is non-null for active intents", () => {
  const intent = classifyTakeoffIntent(D10_GOAL);
  const state = advanceTakeoffWorkflow(intent, [], D10_GOAL);
  const d = workflowDirective(intent, state);
  assert.match(String(d), /Takeoff workflow/);
  assert.match(String(d), /phase=survey/);
  assert.equal(workflowDirective("generic", state), null);
});
