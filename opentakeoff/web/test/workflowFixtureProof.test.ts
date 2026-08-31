// Fixture-facing proofs for production workflows (set-agnostic tool path).
// Counts on the NAVFAC graph are acceptance checks only — not product hardcodes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { queryTable } from "../src/lib/queryTable.mjs";
import {
  compileBasTakeoff,
  compileControlValveTakeoff,
  compileHvacTakeoff,
} from "../src/lib/corpusTakeoff.mjs";
import {
  classifyTakeoffIntent,
  namedPointsListTitles,
  suggestedScheduleTitles,
  valveServiceFromGoal,
} from "../src/lib/takeoffWorkflow.js";
import { familyTableCite } from "../src/lib/agentTakeoff.js";

const GRAPH_CANDIDATES = [
  "/tmp/g-navfac.json",
  "/tmp/ui-sheet-graph.json",
];

function loadGraph() {
  for (const p of GRAPH_CANDIDATES) {
    if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  }
  return null;
}

test("D08 FCU title-scan building_tag_counts match fixture acceptance (42 = 14+10+18)", () => {
  const graph = loadGraph();
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const r = queryTable(graph, { title: "FAN COIL UNIT SCHEDULE" });
  assert.equal(r.count, 42);
  assert.equal(r.building_tag_counts?.A, 14);
  assert.equal(r.building_tag_counts?.M, 10);
  assert.equal(r.building_tag_counts?.T, 18);
  assert.equal(
    classifyTakeoffIntent(
      "Compare scheduled fan-coil quantities across Air Ops, MITRACON, and the ATCT",
    ),
    "fcu_buildings",
  );
});

test("D10 five POINTS/DDC lists: title parse + row/AI-AO-BI-BO acceptance", () => {
  const graph = loadGraph();
  const d10 = readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D10-bas-points-takeoff/prompt.txt", import.meta.url),
    "utf8",
  );
  assert.equal(classifyTakeoffIntent(d10), "points_takeoff");
  const titles = namedPointsListTitles(d10);
  assert.equal(titles.length, 5);
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const want = {
    "POINTS LIST DOAH-TI": { count: 34, AI: 13, AO: 4, BI: 13, BO: 4 },
    "POINTS LIST AHU-T1A/TIB": { count: 62, AI: 21, AO: 7, BI: 26, BO: 8 },
    "FCU WITH COOLING COILS DDC POINTS LIST": { count: 9, AI: 3, AO: 1, BI: 4, BO: 1 },
    "FCU WITH HEATING AND COOLING COILS DDC POINTS LIST": { count: 11, AI: 4, AO: 2, BI: 4, BO: 1 },
    "UNIT HEATER DDC POINTS LIST": { count: 6, AI: 2, AO: 1, BI: 2, BO: 1 },
  };
  let total = 0;
  for (const title of titles) {
    const r = queryTable(graph, { title });
    const key = Object.keys(want).find((k) => title.toUpperCase().includes(k.slice(0, 24)));
    assert.ok(key, `unexpected title ${title}`);
    assert.equal(r.count, want[key].count, title);
    total += r.count;
    for (const pt of ["AI", "AO", "BI", "BO"]) {
      assert.equal(r.point_type_counts?.[pt], want[key][pt], `${title} ${pt}`);
    }
  }
  assert.equal(total, 122);
});

test("corpus compiles expose empty-page accounting (HVAC + BAS)", () => {
  const graph = loadGraph();
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const hvac = compileHvacTakeoff(null, graph);
  const bas = compileBasTakeoff(null, graph);
  assert.equal(hvac.totals?.items, 396);
  assert.equal(bas.totals?.rows, 122);
  assert.ok(hvac.page_accounting?.sheet_count >= 70);
  assert.ok(hvac.page_accounting?.empty_pages > 0);
  assert.ok(bas.page_accounting?.empty_pages > 0);
  assert.ok(
    hvac.page_accounting.pages.some((p) => /empty_for_hvac/i.test(p.status)),
  );
  assert.ok(
    bas.page_accounting.pages.some((p) => /empty_for_bas/i.test(p.status)),
  );
});

test("D06 valve_join: CONTROL VALVE + BYPASS schedules extract on fixture graph", () => {
  const graph = loadGraph();
  const d06 = readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D06-control-valve-takeoff/prompt.txt", import.meta.url),
    "utf8",
  );
  assert.equal(classifyTakeoffIntent(d06), "valve_join");
  if (!graph) {
    test.skip("No cached sheet graph — skip fixture acceptance");
    return;
  }
  // D06 fixture is itd-d1-lab (not NAVFAC CHW/HHW valve schedules).
  const cv = (graph.tables || []).find((t) => {
    const title = t.title?.text || "";
    return /CONTROL VALVE SCHEDULE/i.test(title)
      && !/BYPASS/i.test(title)
      && !/\bCHW\b|\bHHW\b/i.test(title);
  });
  const bcv = (graph.tables || []).find((t) =>
    /BYPASS CONTROL VALVE SCHEDULE/i.test(t.title?.text || ""));
  if (!cv || !bcv) {
    test.skip("Cached graph is not the D06 itd-d1-lab set — engine regression covers extractability");
    return;
  }
  assert.ok((cv.rows || []).length >= 1, "CONTROL VALVE SCHEDULE must extract");
  assert.ok((bcv.rows || []).length >= 1, "BYPASS CONTROL VALVE SCHEDULE must extract");
});

test("D10 follow-up acceptance: AHU-T1A/T1B description split + AI10 attrs", () => {
  const graph = loadGraph();
  const truth = JSON.parse(readFileSync(
    new URL("../../../opentakeoff-corpus/demos/D10-bas-points-takeoff/truth.json", import.meta.url),
    "utf8",
  ));
  assert.equal(classifyTakeoffIntent(truth.follow_up.prompt), "points_takeoff");
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const ahu = (graph.tables || []).find((t) => /POINTS LIST AHU-T1A/i.test(t.title?.text || ""));
  assert.ok(ahu, "AHU points list must extract");
  assert.equal((ahu.rows || []).length, 62);
  const cellText = (row, headerRe) => {
    for (const [header, cell] of Object.entries(row.cells || {})) {
      if (headerRe.test(header)) return String(cell?.text || "").trim();
    }
    return "";
  };
  let onlyA = 0;
  let onlyB = 0;
  let neither = 0;
  for (const row of ahu.rows || []) {
    const desc = cellText(row, /DESCRIPTION/i);
    const hasA = /AHU-T1A/i.test(desc);
    const hasB = /AHU-T1B/i.test(desc);
    if (hasA && !hasB) onlyA += 1;
    else if (hasB && !hasA) onlyB += 1;
    else neither += 1;
  }
  assert.equal(onlyA, truth.follow_up.expected.ahu_t1a_named);
  assert.equal(onlyB, truth.follow_up.expected.ahu_t1b_named);
  assert.equal(neither, truth.follow_up.expected.ahu_shared);
  const ai10 = (ahu.rows || []).find((row) => String(row.key || "").toUpperCase() === "AI10");
  assert.ok(ai10);
  assert.equal(cellText(ai10, /DESCRIPTION/i), truth.follow_up.expected.ai10_description);
  assert.equal(cellText(ai10, /^ALARM$/i), truth.follow_up.expected.ai10_alarm);
  assert.equal(cellText(ai10, /^TREND$/i), truth.follow_up.expected.ai10_trend);
});

test("CHW/HHW valve service filter acceptance on fixture graph", () => {
  const graph = loadGraph();
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  assert.equal(valveServiceFromGoal("Complete chilled-water valve takeoff of this set"), "CHW");
  assert.equal(valveServiceFromGoal("Complete hot-water control valve takeoff of this set"), "HHW");
  const all = compileControlValveTakeoff(null, graph);
  const chw = compileControlValveTakeoff(null, graph, { service: "CHW" });
  const hhw = compileControlValveTakeoff(null, graph, { service: "HHW" });
  assert.equal(all.totals.items, 163);
  assert.equal(chw.totals.items, 64);
  assert.equal(hhw.totals.items, 99);
  assert.equal(chw.service_filter, "CHW");
  assert.equal(hhw.service_filter, "HHW");
});

test("schedule-family ROUTING rows: intent → title needle → fixture counts + cites", () => {
  const graph = loadGraph();
  // Acceptance counts from T-HVAC-01 (fixture only — not product hardcodes).
  const families = [
    {
      goal: "Pump schedule takeoff — counts and GPM/head",
      cat: "PUMP",
      count: 26,
      titleRe: /PUMP SCHEDULE/i,
    },
    {
      goal: "Boiler schedule takeoff — totals and capacity",
      cat: "BOILER",
      count: 6,
      titleRe: /BOILER SCHEDULE/i,
    },
    {
      goal: "Dedicated outdoor-air unit schedule takeoff",
      cat: "DOAH_UNIT",
      count: 3,
      titleRe: /DEDICATED OUTDOOR AIR UNIT SCHEDULE/i,
    },
    {
      goal: "Diffuser grille schedule takeoff",
      cat: "GRD",
      count: 30,
      titleRe: /GRILLE,\s*REGISTER,\s*AND\s*DIFFUSER/i,
    },
    {
      goal: "Humidifier schedule takeoff",
      cat: "HUMIDIFIER",
      count: 12,
      titleRe: /HUMIDIFIER SCHEDULE/i,
    },
    {
      goal: "CRAH schedule takeoff",
      cat: "CRAH",
      count: 6,
      titleRe: /COMPUTER ROOM AIR HANDLER/i,
    },
    {
      goal: "Unit heater schedule takeoff",
      cat: "UNIT_HEATER",
      count: 6,
      titleRe: /UNIT HEATER SCHEDULE/i,
    },
    {
      goal: "Cabinet unit heater takeoff",
      cat: "CABINET_UNIT_HEATER",
      count: 5,
      titleRe: /CABINET UNIT HEATER/i,
    },
    {
      goal: "Air separator schedule takeoff",
      cat: "AIR_SEPARATOR",
      count: 6,
      titleRe: /AIR SEPARATOR SCHEDULE/i,
    },
    {
      goal: "Expansion tank schedule takeoff",
      cat: "EXPANSION_TANK",
      count: 4,
      titleRe: /EXPANSION TANK SCHEDULE/i,
    },
  ];
  for (const fam of families) {
    assert.equal(classifyTakeoffIntent(fam.goal), "equipment_schedule", fam.goal);
    const titles = suggestedScheduleTitles(fam.goal);
    assert.ok(titles.some((t) => fam.titleRe.test(t)), `${fam.goal} titles=${titles.join("|")}`);
  }
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const hvac = compileHvacTakeoff(null, graph);
  for (const fam of families) {
    const cat = hvac.categories[fam.cat];
    assert.ok(cat, fam.cat);
    assert.equal(cat.count, fam.count, fam.cat);
    assert.ok(cat.items.length === fam.count);
    const withCite = cat.items.filter((i) =>
      i.sheet_id && (i.bbox_px || i.row_bbox_px || i.table_bbox_px));
    assert.equal(withCite.length, fam.count, `${fam.cat} cites`);
    const titleNeedle = suggestedScheduleTitles(fam.goal).find((t) => fam.titleRe.test(t));
    const qt = queryTable(graph, { title: titleNeedle });
    assert.ok(!qt.error, `${fam.goal} query_table: ${qt.error}`);
    assert.equal(qt.count, fam.count, `${fam.goal} query_table count`);
  }
});

test("continuation-page MARK dedupe: 1 OF 2 / 2 OF 2 must not double-count", () => {
  const graph = loadGraph();
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const cont = (graph.tables || []).filter((t) =>
    /DEDICATED OUTDOOR AIR UNIT/i.test(t.title?.text || "")
    && !/HANDLING/i.test(t.title?.text || "")
    && /\d+\s+OF\s+\d+/i.test(t.title?.text || ""));
  assert.ok(cont.length >= 2, "fixture must expose continuation-titled DOAH schedules");
  let rawRows = 0;
  const rawKeys = new Set();
  for (const t of cont) {
    for (const row of t.rows || []) {
      rawRows += 1;
      const k = String(row.key || "").toUpperCase().replace(/\s+/g, "");
      if (k) rawKeys.add(k);
    }
  }
  assert.ok(rawRows > rawKeys.size, "continuation pages must repeat MARK keys in raw rows");
  const qt = queryTable(graph, { title: "DEDICATED OUTDOOR AIR UNIT SCHEDULE" });
  assert.equal(qt.count, rawKeys.size, "query_table must dedupe continuation MARKs");
  const hvac = compileHvacTakeoff(null, graph);
  assert.equal(hvac.categories.DOAH_UNIT.count, rawKeys.size);
});

test("BAS compile discloses non-extractable title-only points lists", () => {
  const graph = loadGraph();
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const bas = compileBasTakeoff(null, graph);
  assert.equal(bas.totals.rows, 122);
  assert.equal(bas.totals.lists, 5);
  assert.ok(Array.isArray(bas.exclusions) && bas.exclusions.length >= 1);
  assert.ok(
    bas.exclusions.some((e) => /non-extractable|title-only|schematic/i.test(e)),
    `exclusions must disclose non-extractable lists: ${bas.exclusions.join("; ")}`,
  );
  // Extractable lists must carry typed rows — never invent empty title-only entries as counted lists.
  for (const list of bas.categories.points_lists.lists) {
    assert.ok(list.rows >= 1, list.title);
    assert.ok((list.items || []).length === list.rows, list.title);
  }
});

test("schedule title region cite: family items expose table_bbox_px for whole-table paint", () => {
  const graph = loadGraph();
  if (!graph) {
    test.skip("No cached NAVFAC sheet graph — skip fixture acceptance");
    return;
  }
  const hvac = compileHvacTakeoff(null, graph);
  const pump = hvac.categories.PUMP;
  assert.ok(pump.count >= 1);
  const withTable = pump.items.filter((i) => Array.isArray(i.table_bbox_px) && i.table_bbox_px.length === 4);
  assert.ok(withTable.length >= 1, "at least one pump row must carry schedule title/region bbox");
  const cite = familyTableCite({
    family: "PUMP SCHEDULE",
    lines: withTable.map((i) => ({
      sheet_id: i.sheet_id,
      table_bbox_px: i.table_bbox_px,
      bbox_px: i.bbox_px,
      table_title: i.table_title,
    })),
  });
  assert.ok(cite);
  assert.equal(cite.kind, "table");
  assert.ok(cite.sheet_id);
  assert.equal(cite.bbox_px.length, 4);
});
