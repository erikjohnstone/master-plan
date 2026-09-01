// Durable takeoff workflow state machine — intent classify, phase advance,
// illegal transitions (no corpus hardcoding).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTakeoffIntent,
  corpusCompileKind,
  namedPointsListTitles,
  scheduleFamilyNeedles,
  suggestedScheduleTitles,
  valveServiceFromGoal,
  advanceTakeoffWorkflow,
  isIllegalWorkflowTransition,
  workflowDirective,
  scaleRefuseMessage,
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
  assert.equal(classifyTakeoffIntent("Trace AHU-1 connectivity"), "connectivity");
});

test("symbol_sweep / connectivity / scale_refuse intents are phrase-robust", () => {
  assert.equal(
    classifyTakeoffIntent("Find every instance of this plan symbol from the seed marquee"),
    "symbol_sweep",
  );
  assert.equal(
    classifyTakeoffIntent("Run a symbol_sweep on this valve seed across the set"),
    "symbol_sweep",
  );
  assert.equal(
    classifyTakeoffIntent("Trace which valve belongs to which equipment via drawn pipe connectivity"),
    "connectivity",
  );
  assert.equal(
    classifyTakeoffIntent("Refuse installed duct length on an unscaled sheet — set_scale first"),
    "scale_refuse",
  );
  assert.equal(
    scaleRefuseMessage("plan.pdf#3", "1/4\" = 1'-0\""),
    "Set the scale for plan.pdf#3 first — use set_scale (detected: 1/4\" = 1'-0\").",
  );
  assert.equal(
    scaleRefuseMessage("plan.pdf#3"),
    "Set the scale for plan.pdf#3 first — use set_scale.",
  );
  const sweep = advanceTakeoffWorkflow("symbol_sweep", [
    { name: "sheet_graph", out: { sheets: [] } },
  ], "Find every instance of this symbol");
  assert.equal(sweep.phase, "spot_cites");
  assert.ok(sweep.allowedTools?.includes("symbol_sweep"));
  assert.match(sweep.nextMove || "", /symbol_sweep|seed_rect/i);
  const conn = advanceTakeoffWorkflow("connectivity", [
    { name: "sheet_graph", out: { sheets: [] } },
  ], "Trace valve to equipment connectivity");
  assert.ok(conn.allowedTools?.includes("trace_connectivity"));
  assert.match(conn.nextMove || "", /trace_connectivity/i);
  const scale = advanceTakeoffWorkflow("scale_refuse", [
    { name: "sheet_graph", out: { sheets: [] } },
  ], "installed length on unscaled sheet");
  assert.match(scale.nextMove || "", /set_scale|refuse/i);
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

test("valveServiceFromGoal: CHW / HHW only; both or neither → null", () => {
  assert.equal(
    valveServiceFromGoal("Complete chilled-water control valve takeoff of this set"),
    "CHW",
  );
  assert.equal(
    valveServiceFromGoal("Complete CHW valve takeoff on these drawings"),
    "CHW",
  );
  assert.equal(
    valveServiceFromGoal("Complete hot-water control valve takeoff of this set"),
    "HHW",
  );
  assert.equal(
    valveServiceFromGoal("HHW control valve quantity takeoff of the loaded set"),
    "HHW",
  );
  assert.equal(
    valveServiceFromGoal("Complete heating-water valve takeoff of this set"),
    "HHW",
  );
  assert.equal(
    valveServiceFromGoal("Complete valve takeoff of this set"),
    null,
  );
  assert.equal(
    valveServiceFromGoal("Complete CHW and HHW control valve takeoff of this set"),
    null,
  );
  const chwPhase = advanceTakeoffWorkflow(
    "corpus_valves",
    [],
    "Complete chilled-water control valve takeoff of this set",
  );
  assert.match(chwPhase.nextMove || "", /service="CHW"/);
  const bothPhase = advanceTakeoffWorkflow(
    "corpus_valves",
    [],
    "Run a complete valve takeoff on this blueprint set",
  );
  assert.equal(/service="(?:CHW|HHW)"/.test(bothPhase.nextMove || ""), false);
});

test("phrase-robust corpus compile: valve ≡ control valve; take off; full; no literal complete", () => {
  const valvePhrases = [
    "Run a complete valve takeoff on this blueprint set",
    "Run a complete control valve takeoff on this blueprint set",
    "Do a full control-valve takeoff of these drawings",
    "Take off all valves on this set",
    "valve takeoff for this project",
    "Control valve quantity takeoff of the loaded set",
  ];
  for (const p of valvePhrases) {
    assert.equal(corpusCompileKind(p), "control_valves", p);
    assert.equal(classifyTakeoffIntent(p), "corpus_valves", p);
  }
  const hvacPhrases = [
    "Do a complete HVAC equipment quantity takeoff of this set",
    "Full HVAC equipment takeoff on these drawings",
    "HVAC equipment takeoff of the loaded set",
  ];
  for (const p of hvacPhrases) {
    assert.equal(corpusCompileKind(p), "hvac_equipment", p);
  }
  const basPhrases = [
    "Do a complete BAS / DDC points takeoff of this set",
    "Full DDC points takeoff on these drawings",
    "BAS points takeoff of the loaded set",
  ];
  for (const p of basPhrases) {
    assert.equal(corpusCompileKind(p), "bas_points", p);
  }
  // Named multi-list stays off compile.
  assert.equal(corpusCompileKind(D10_GOAL), null);
  // FCU across buildings without hardcoding project names.
  assert.equal(
    classifyTakeoffIntent("Compare scheduled fan-coil quantities across the three buildings"),
    "fcu_buildings",
  );
});

test("D10 frozen prompt extracts five list titles without merging FCU siblings", () => {
  const d10 = readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D10-bas-points-takeoff/prompt.txt", import.meta.url),
    "utf8",
  );
  const titles = namedPointsListTitles(d10);
  assert.equal(titles.length, 5, JSON.stringify(titles));
  assert.ok(titles.some((t) => /DOAH-TI/i.test(t)));
  assert.ok(titles.some((t) => /AHU-T1A/i.test(t)));
  assert.ok(titles.some((t) => /COOLING COILS DDC/i.test(t) && !/HEATING/i.test(t)));
  assert.ok(titles.some((t) => /HEATING AND COOLING/i.test(t)));
  assert.ok(titles.some((t) => /UNIT HEATER DDC/i.test(t)));
  assert.equal(classifyTakeoffIntent(d10), "points_takeoff");
  assert.equal(corpusCompileKind(d10), null);
});

test("D08 / D06 frozen prompts route to fcu_buildings / valve_join", () => {
  const d08 = readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D08-fcu-cross-building/prompt.txt", import.meta.url),
    "utf8",
  );
  const d06 = readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D06-control-valve-takeoff/prompt.txt", import.meta.url),
    "utf8",
  );
  assert.equal(classifyTakeoffIntent(d08), "fcu_buildings");
  assert.equal(advanceTakeoffWorkflow("fcu_buildings", [], d08).phase, "title_scans");
  assert.equal(classifyTakeoffIntent(d06), "valve_join");
  assert.equal(advanceTakeoffWorkflow("valve_join", [], d06).phase, "survey");
});

test("named-family / FCU / valve-join goals route through durable intents", () => {
  assert.equal(
    classifyTakeoffIntent("How many FCUs across Air Ops vs MITRACON buildings?"),
    "fcu_buildings",
  );
  const fcu = advanceTakeoffWorkflow("fcu_buildings", [], "How many FCUs across Air Ops vs MITRACON?");
  assert.equal(fcu.phase, "title_scans");
  assert.match(fcu.nextMove || "", /FAN COIL/);

  const d06 = readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D06-control-valve-takeoff/prompt.txt", import.meta.url),
    "utf8",
  );
  assert.equal(classifyTakeoffIntent(d06), "valve_join");
  assert.equal(corpusCompileKind(d06), null);
  const vj = advanceTakeoffWorkflow("valve_join", [], d06);
  assert.equal(vj.phase, "survey");
  assert.ok(vj.allowedTools?.includes("sheet_graph"));
  const afterGraph = advanceTakeoffWorkflow("valve_join", [{
    name: "sheet_graph",
    out: { sheets: [{ id: "M-601" }] },
  }], d06);
  assert.equal(afterGraph.phase, "title_scans");
  assert.match(afterGraph.nextMove || "", /CONTROL VALVE/);
});

test("all D01–D10 frozen prompts route to durable non-generic intents", () => {
  const want = {
    "D01-chiller-plan-to-controls": "equipment_plan_join",
    "D02-ahu-bas-point-to-location": "bas_point_trace",
    "D03-hvac-bas-project-takeoff": "project_takeoff",
    "D04-vav-scope-rollup": "equipment_schedule",
    "D05-rtu-mech-to-electrical": "cross_discipline_join",
    "D06-control-valve-takeoff": "valve_join",
    "D07-vav-plan-link-fan-refuse": "plan_link_refuse",
    "D08-fcu-cross-building": "fcu_buildings",
    "D09-room-hvac-coordination": "room_coordination",
    "D10-bas-points-takeoff": "points_takeoff",
  };
  for (const [dir, intent] of Object.entries(want)) {
    const g = readFileSync(
      new URL(`../../../opentakeoff-corpus/demos/${dir}/prompt.txt`, import.meta.url),
      "utf8",
    );
    assert.equal(classifyTakeoffIntent(g), intent, dir);
    const state = advanceTakeoffWorkflow(intent, [], g);
    assert.ok(state.nextMove || state.phase === "title_scans" || state.phase === "survey", dir);
    assert.notEqual(intent, "generic", dir);
  }
});

test("single POINTS LIST title still routes to points_takeoff", () => {
  const g = "Takeoff POINTS LIST DOAH-TI: row counts and AI/AO/BI/BO point-type breakdown";
  assert.equal(classifyTakeoffIntent(g), "points_takeoff");
  assert.equal(namedPointsListTitles(g).length, 1);
  const state = advanceTakeoffWorkflow("points_takeoff", [
    { name: "sheet_graph", out: { sheets: [] } },
  ], g);
  assert.equal(state.phase, "title_scans");
  assert.match(state.nextMove || "", /POINTS LIST DOAH-TI/i);
});

test("generic point list takeoff routes to corpus_bas compile (no spot_cites deadlock)", () => {
  const g = "Can you run a point list takeoff for me?";
  assert.equal(namedPointsListTitles(g).length, 0);
  assert.equal(corpusCompileKind(g), "bas_points");
  assert.equal(classifyTakeoffIntent(g), "corpus_bas");
  const state = advanceTakeoffWorkflow("corpus_bas", [
    { name: "sheet_graph", out: { sheets: [{ id: "M-601" }] } },
  ], g);
  assert.equal(state.phase, "compile");
  assert.ok(state.allowedTools?.includes("compile_corpus_takeoff"));
  assert.equal(
    isIllegalWorkflowTransition(state, "compile_corpus_takeoff", { kind: "bas_points" }),
    false,
  );
  // Defense: if still on points_takeoff with empty titles, require title_scans
  // (never jump straight to spot_cites).
  const defensive = advanceTakeoffWorkflow("points_takeoff", [
    { name: "sheet_graph", out: { sheets: [] } },
  ], g);
  assert.equal(defensive.phase, "title_scans");
  assert.match(defensive.nextMove || "", /POINTS LIST|bas_points/i);
});

test("corpus_bas after compile requires plan paint on served_equipment (Pillar C)", () => {
  const g = "Complete BAS points takeoff of this set";
  const compiled = advanceTakeoffWorkflow("corpus_bas", [
    { name: "sheet_graph", out: { sheets: [{ id: "M-601" }] } },
    { name: "compile_corpus_takeoff", out: { kind: "bas_points", takeoff_id: "T-BAS-01" } },
  ], g);
  assert.equal(compiled.phase, "spot_cites");
  assert.ok(compiled.allowedTools?.includes("sweep_schedule_row"));
  assert.match(compiled.nextMove || "", /served_equipment|plan/i);

  const cited = advanceTakeoffWorkflow("corpus_bas", [
    { name: "sheet_graph", out: { sheets: [{ id: "M-601" }] } },
    { name: "compile_corpus_takeoff", out: { kind: "bas_points", takeoff_id: "T-BAS-01" } },
    { name: "query_table", args: { row_key: "AI01" }, out: { rows: [{ key: "AI01" }] } },
  ], g);
  assert.equal(cited.phase, "paint");
  assert.ok(cited.allowedTools?.includes("sweep_schedule_row"));
  assert.match(cited.nextMove || "", /plan paint|plan locations|finished points takeoff/i);

  const grounded = advanceTakeoffWorkflow("corpus_bas", [
    { name: "sheet_graph", out: { sheets: [{ id: "M-601" }] } },
    { name: "compile_corpus_takeoff", out: { kind: "bas_points", takeoff_id: "T-BAS-01" } },
    { name: "query_table", args: { row_key: "AI01" }, out: { rows: [{ key: "AI01" }] } },
    { name: "sweep_schedule_row", out: { found: 1, sheets: [{ sheet: "M-101", matches: [{ at: [1, 2] }] }] } },
    { name: "highlight_citation", out: { bbox_px: [0, 0, 10, 10] } },
  ], g);
  assert.equal(grounded.phase, "answer");
  assert.match(grounded.nextMove || "", /served_equipment|painted plan/i);
});

test("suggestedScheduleTitles maps family words to industry schedule needles", () => {
  const ahu = suggestedScheduleTitles("How many AHUs are on the air handling schedule?");
  assert.ok(ahu.some((t) => /AIR HANDLING/i.test(t)));
  const ahuHandler = scheduleFamilyNeedles("AHU takeoff on air handler heat pump schedule");
  assert.ok(ahuHandler.some((n) => n.titleRe.test("AIR HANDLER HEAT PUMP SCHEDULE (WITH ELECTRIC HEAT)")));
  const boiler = suggestedScheduleTitles("Boiler schedule takeoff — totals and capacity");
  assert.ok(boiler.some((t) => /BOILER/i.test(t)));
  const state = advanceTakeoffWorkflow(
    "equipment_schedule",
    [{ name: "sheet_graph", out: { sheets: [] } }],
    "How many VAVs on the volume control box schedule?",
  );
  assert.equal(state.phase, "title_scans");
  assert.match(state.nextMove || "", /VOLUME CONTROL|AIR TERMINAL|VARIABLE AIR/i);
});

test("remaining schedule families route + suggest query_table-viable titles", () => {
  const cases = [
    ["Pump schedule takeoff — counts and GPM/head", /PUMP SCHEDULE/i],
    ["Boiler schedule takeoff — totals and capacity", /BOILER SCHEDULE/i],
    ["Dedicated outdoor-air / DOAS schedule takeoff", /DEDICATED OUTDOOR AIR UNIT SCHEDULE/i],
    ["Diffuser grille schedule takeoff", /GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER/i],
    ["Humidifier schedule takeoff", /HUMIDIFIER SCHEDULE/i],
    ["CRAH / computer-room air handler schedule takeoff", /COMPUTER ROOM AIR HANDLER/i],
    ["Unit heater schedule takeoff", /UNIT HEATER SCHEDULE/i],
    ["Cabinet unit heater takeoff", /CABINET UNIT HEATER SCHEDULE/i],
    ["Air separator schedule takeoff", /AIR SEPARATOR SCHEDULE/i],
    ["Expansion tank schedule takeoff", /EXPANSION TANK SCHEDULE/i],
    ["Fume hood VAV damper / ECV schedule takeoff", /FUME HOOD VARIABLE AIR VOLUME DAMPER SCHEDULE/i],
    ["VFD / variable frequency drive schedule takeoff", /VARIABLE FREQUENCY DRIVE SCHEDULE/i],
    ["Ceiling fan schedule takeoff", /CEILING FAN SCHEDULE/i],
  ];
  for (const [goal, titleRe] of cases) {
    assert.equal(classifyTakeoffIntent(goal), "equipment_schedule", goal);
    const titles = suggestedScheduleTitles(goal);
    assert.ok(titles.some((t) => titleRe.test(t)), `${goal} → ${titles.join("|")}`);
    // query_table rejects short needles (<12) for substring matches — titles must be viable.
    assert.ok(titles.every((t) => t.length >= 12), `${goal} short needle ${titles.join("|")}`);
  }
});

test("D01–D10 follow-up prompts stay on durable intents (not remapped to unrelated families)", () => {
  const cases = [
    ["D03-hvac-bas-project-takeoff", "equipment_schedule"],
    ["D04-vav-scope-rollup", "equipment_schedule"],
    ["D05-rtu-mech-to-electrical", "cross_discipline_join"],
    ["D08-fcu-cross-building", "equipment_schedule"],
    ["D09-room-hvac-coordination", "room_coordination"],
    ["D10-bas-points-takeoff", "points_takeoff"],
  ];
  for (const [dir, want] of cases) {
    const truth = JSON.parse(readFileSync(
      new URL(`../../../opentakeoff-corpus/demos/${dir}/truth.json`, import.meta.url),
      "utf8",
    ));
    const fu = truth.follow_up?.prompt;
    assert.ok(fu, dir);
    assert.equal(classifyTakeoffIntent(fu), want, `${dir} follow-up`);
  }
});

test("phrase variants keep D01/D05/D08/D10 intents stable", () => {
  assert.equal(
    classifyTakeoffIntent("Locate CH-A1 on the plan and give cooling capacity plus matching CHW control valve Cv"),
    "equipment_plan_join",
  );
  assert.equal(
    classifyTakeoffIntent("Join RTU-1 packaged rooftop schedule to the electrical connection schedule for MCA MOCP and circuit"),
    "cross_discipline_join",
  );
  assert.equal(
    classifyTakeoffIntent("Compare fan-coil counts across the buildings on this set"),
    "fcu_buildings",
  );
  assert.equal(
    classifyTakeoffIntent(
      "Takeoff POINTS LIST A, POINTS LIST B, FCU WITH COOLING COILS DDC POINTS LIST, "
      + "FCU WITH HEATING AND COOLING COILS DDC POINTS LIST, and UNIT HEATER DDC POINTS LIST: "
      + "row counts and AI/AO/BI/BO breakdown",
    ),
    "points_takeoff",
  );
});
