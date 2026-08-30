// Durable takeoff workflow state machine — intent classify, phase advance,
// illegal transitions (no corpus hardcoding).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTakeoffIntent,
  corpusCompileKind,
  namedPointsListTitles,
  advanceTakeoffWorkflow,
  isIllegalWorkflowTransition,
  workflowDirective,
} from "../src/lib/takeoffWorkflow.js";
import { readFileSync } from "node:fs";

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

test("complete set HVAC/BAS/valve goals route to corpus compile", () => {
  const hvac = readFileSync(
    new URL("../../../opentakeoff-corpus/takeoffs/T-HVAC-01-navfac-equipment/prompt.txt", import.meta.url),
    "utf8",
  );
  const bas = readFileSync(
    new URL("../../../opentakeoff-corpus/takeoffs/T-BAS-01-navfac-points/prompt.txt", import.meta.url),
    "utf8",
  );
  const valveGoal = "Run a complete valve takeoff on this blueprint set";
  assert.equal(classifyTakeoffIntent(hvac), "corpus_hvac");
  assert.equal(classifyTakeoffIntent(bas), "corpus_bas");
  assert.equal(classifyTakeoffIntent(valveGoal), "corpus_valves");
  assert.equal(corpusCompileKind(hvac), "hvac_equipment");
  assert.equal(corpusCompileKind(bas), "bas_points");
  assert.equal(corpusCompileKind(valveGoal), "control_valves");
  // Named multi-list goals stay on title-scan workflow.
  assert.equal(corpusCompileKind(D10_GOAL), null);

  const compilePhase = advanceTakeoffWorkflow("corpus_hvac", [], hvac);
  assert.equal(compilePhase.phase, "compile");
  assert.ok(compilePhase.allowedTools?.includes("compile_corpus_takeoff"));
  assert.equal(
    isIllegalWorkflowTransition(compilePhase, "find_schedule"),
    true,
  );
  const after = advanceTakeoffWorkflow("corpus_hvac", [{
    name: "compile_corpus_takeoff",
    out: { takeoff_id: "T-HVAC-01", kind: "hvac_equipment", totals: { items: 396 } },
  }], hvac);
  assert.equal(after.phase, "spot_cites");

  const valvePhase = advanceTakeoffWorkflow("corpus_valves", [], valveGoal);
  assert.equal(valvePhase.phase, "compile");
  assert.match(valvePhase.nextMove || "", /control_valves/);
  assert.equal(isIllegalWorkflowTransition(valvePhase, "read_schedule"), true);
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
