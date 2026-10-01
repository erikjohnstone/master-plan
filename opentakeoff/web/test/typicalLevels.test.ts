// AS-139: a row standing for one unit on each typical level it lists. 26_CA's
// tri-path air handlers are scheduled "AHU-(6-33)-1" under TYPICAL LEVELS
// "6-33" (one air handler on each of levels 6 to 33, tagged AHU 6-1, AHU 17-1
// on the level plans), its exhaust terminals "CAV-X-2" under TYPICAL FLOORS
// "3-4, 6-34" (tagged CAV-X-2 on each); its typical plans stand for several
// levels ("MECHANICAL TYPICAL PLAN - LEVELS 6-16").
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLevelList, planTitleLevels, reconcileRowsFromTakeoffItems, scheduledQtyStatusFromRow, typicalLevelInstalled,
  typicalLevelMarks, typicalLevelsOfRow, unscheduledTagsAndAliasCandidates,
} from "../src/lib/schedulePlanReconcile.mjs";
import { compileHvacTakeoff } from "../src/lib/corpusTakeoff.mjs";

const cells = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([h, t]) => [h, { text: t }]));

test("AS-139: the levels a list prints", () => {
  assert.equal(parseLevelList("6-33")?.length, 28);
  assert.deepEqual(parseLevelList("34-35"), ["34", "35"]);
  assert.deepEqual(parseLevelList("34,35"), ["34", "35"]);
  assert.equal(parseLevelList("3-4, 6-34")?.length, 31);
  assert.deepEqual(parseLevelList("P3"), ["P3"]);
  assert.deepEqual(parseLevelList("06"), ["6"]);
  for (const bad of ["", "SEE NOTE", "6-6", "33-6", "1-500", "6-33 TYP", "3, 3"]) assert.equal(parseLevelList(bad), null, bad);
});

test("AS-139: a row is a typical-level template only where its mark prints its levels or an X for them", () => {
  const row = (mark: string, levels: string, h = "TYPICAL LEVELS") => ({ cells: cells({ DESIGNATION: mark, [h]: levels }) });
  assert.deepEqual(typicalLevelsOfRow(row("AHU-(6-33)-1", "6-33"), "AHU-(6-33)-1"),
    { levels: parseLevelList("6-33"), count: 28, header: "TYPICAL LEVELS", text: "6-33", template: "levels" });
  assert.equal(typicalLevelsOfRow(row("AHU-(34,35)-1", "34-35"), "AHU-(34,35)-1")?.count, 2);
  assert.equal(typicalLevelsOfRow(row("CAV-X-1", "3-4, 6-34", "TYPICAL FLOORS"), "CAV-X-1")?.template, "placeholder");
  // the mark read off the row when not given
  assert.equal(typicalLevelsOfRow({ key: "AHU-6-33-1", cells: cells({ DESIGNATION: "AHU-(6-33)-1", "TYPICAL LEVELS": "6-33" }) })?.count, 28);
  // one level, no template, levels the column does not list, no levels column: one unit
  assert.equal(typicalLevelsOfRow(row("CAV-2-1", "2", "TYPICAL FLOORS"), "CAV-2-1"), null);
  assert.equal(typicalLevelsOfRow(row("CAV-X-1", "2", "TYPICAL FLOORS"), "CAV-X-1"), null, "an X over one level is one unit");
  assert.equal(typicalLevelsOfRow(row("FCU-1", "3-10", "TYPICAL FLOORS"), "FCU-1"), null);
  assert.equal(typicalLevelsOfRow(row("AHU-(6-49)-2", "6-33"), "AHU-(6-49)-2"), null);
  assert.equal(typicalLevelsOfRow({ cells: cells({ DESIGNATION: "AHU-X-1", LEVELS: "6-33" }) }, "AHU-X-1"), null);
  assert.equal(typicalLevelsOfRow(row("EX-1", "3-4", "TYPICAL FLOORS"), "EX-1"), null, "an X in a word is no placeholder");
});

test("AS-139: a typical-level row schedules one unit a level; a printed QTY and a row of several marks read as before", () => {
  const status = scheduledQtyStatusFromRow({ cells: cells({ DESIGNATION: "AHU-(6-33)-1", "TYPICAL LEVELS": "6-33" }) }, { mark: "AHU-(6-33)-1" });
  assert.deepEqual(status, { qty: 28, refused: false, reason: null, basis: "one_per_typical_level", source_header: "TYPICAL LEVELS", source_text: "6-33" });
  // flat row cells, as a takeoff item carries them
  assert.equal(scheduledQtyStatusFromRow({ cells: { DESIGNATION: "CAV-X-2", "TYPICAL FLOORS": "3-4, 6-34" } }, { mark: "CAV-X-2" }).qty, 31);
  assert.equal(scheduledQtyStatusFromRow({ cells: cells({ DESIGNATION: "CAV-X-2", "TYPICAL FLOORS": "3-4, 6-34", QTY: "2" }) }, { mark: "CAV-X-2" }).basis, "printed_schedule_quantity");
  assert.equal(scheduledQtyStatusFromRow({ cells: cells({ DESIGNATION: "AHU-(6-33)-1", "TYPICAL LEVELS": "6-33" }) }, { mark: "AHU-(6-33)-1", marks: 2 }).basis, "one_per_unique_schedule_row");
  assert.equal(scheduledQtyStatusFromRow({ cells: cells({ DESIGNATION: "CAV-2-1", "TYPICAL FLOORS": "2" }) }).basis, "one_per_unique_schedule_row");
});

test("AS-139: the levels a plan's title draws", () => {
  assert.equal(planTitleLevels("MECHANICAL TYPICAL PLAN - LEVELS 6-16")?.length, 11);
  assert.deepEqual(planTitleLevels("MECHANICAL LEVEL 17 PLAN"), ["17"]);
  assert.deepEqual(planTitleLevels("MECHANICAL LEVEL 61 ALTERNATE PLAN"), ["61"]);
  assert.deepEqual(planTitleLevels("MECHANICAL PARKING LEVEL 1 PLAN"), ["P1"]);
  assert.equal(planTitleLevels("MECHANICAL MULTI-TENANT CORRIDOR - LEVELS 4, 6-14")?.length, 10);
  assert.deepEqual(planTitleLevels("3RD FLOOR MECHANICAL PLAN"), ["3"]);
  for (const none of ["MECHANICAL LEVEL 64 ROOF PLAN".replace("LEVEL 64 ", ""), "MECHANICAL CHILLER PLANT ENLARGED PLAN", ""]) assert.equal(planTitleLevels(none), null, none);
});

const TITLES: Record<string, string> = {
  "s#14": "MECHANICAL LEVEL 3 PLAN", "s#15": "MECHANICAL LEVEL 4 PLAN", "s#17": "MECHANICAL TYPICAL PLAN - LEVELS 6-16",
  "s#18": "MECHANICAL LEVEL 17 PLAN", "s#20": "MECHANICAL TYPICAL PLAN - LEVELS 19-30", "s#21": "MECHANICAL LEVEL 31 PLAN",
  "s#34": "MECHANICAL LEVEL 61 PLAN", "s#35": "MECHANICAL LEVEL 61 ALTERNATE PLAN", "s#43": "MECHANICAL CHILLER PLANT ENLARGED PLAN",
};
const titleOf = (key: string) => TITLES[key] || "";

test("AS-139: each placement stands for the row's levels its plan draws, each level once", () => {
  const levels = parseLevelList("6-33")!;
  const r = typicalLevelInstalled(levels, [{ sheet: "s#17" }, { sheet: "s#18" }, { sheet: "s#20" }, { sheet: "s#21" }], titleOf)!;
  assert.equal(r.qty, 11 + 1 + 12 + 1);
  assert.deepEqual(r.levels_missing, ["18", "32", "33"]);
  // a second plan of a level counted adds none; a plan naming no level of the row adds one
  assert.equal(typicalLevelInstalled(["35", "61"], [{ sheet: "s#34" }, { sheet: "s#35" }], titleOf)!.qty, 1);
  assert.equal(typicalLevelInstalled(levels, [{ sheet: "s#43" }], titleOf)!.qty, 1);
  assert.equal(typicalLevelInstalled(levels, [], titleOf), null);
});

test("AS-139: the marks a typical-level row's unit is drawn by", () => {
  assert.deepEqual(typicalLevelMarks("AHU-(34,35)-2", { levels: ["34", "35"], template: "levels" }), ["AHU-34-2", "AHU-35-2", "AHU-X-2"]);
  assert.deepEqual(typicalLevelMarks("CAV-X-1", { levels: ["3", "4"], template: "placeholder" }), ["CAV-3-1", "CAV-4-1"]);
});

test("AS-139: the whole-set reconcile reads a typical-level row's placements over its plans' levels", () => {
  const item = (tag: string, sheets: string[], row: Record<string, string>) => ({
    tag, status: "resolved", quantity: sheets.length, placement_count: sheets.length, quantity_basis: "tag_attached_vector",
    schedule: { sheet: "s#11", kind: "equipment", title: "SINGLE DUCT CAV EXHAUST TERMINAL" }, schedule_row: row,
    drawing_locations: sheets.map((sheet) => ({ sheet, at: [1, 1] })), plan_search_complete: true, search_scope: "exhaustive",
  });
  const [all, short, plain] = reconcileRowsFromTakeoffItems([
    item("AHU-(6-33)-1", ["s#17", "s#18", "s#20", "s#21"], { DESIGNATION: "AHU-(6-33)-1", "TYPICAL LEVELS": "6-31" }),
    item("CAV-X-2", ["s#14", "s#15", "s#17"], { DESIGNATION: "CAV-X-2", "TYPICAL FLOORS": "3-4, 6-34" }),
    item("CAV-2-1", ["s#18"], { DESIGNATION: "CAV-2-1", "TYPICAL FLOORS": "2" }),
  ], [], { sheetTitleOf: titleOf });
  assert.equal(all.scheduled_qty_basis, "one_per_unique_schedule_row", "levels the mark does not print: no template");
  assert.equal(all.installed_qty, 4);
  assert.equal(all.typical_levels, undefined);
  assert.equal(short.scheduled_qty, 31);
  assert.equal(short.scheduled_qty_basis, "one_per_typical_level");
  assert.equal(short.installed_qty, 2 + 11);
  assert.equal(short.placement_count, 3);
  assert.equal(short.status, "SCHEDULE_ONLY");
  assert.deepEqual(short.typical_levels?.levels_missing, parseLevelList("17-34"));
  assert.match(String(short.reason), /no plan in this set draws levels 17-34/);
  assert.equal(plain.installed_qty, 1);
  assert.equal(plain.status, "MATCH");
  assert.equal(plain.typical_levels, undefined);
  // every level drawn (no plan draws level 18, so the row lists none): MATCH
  const [full] = reconcileRowsFromTakeoffItems([
    item("CAV-X-2", ["s#14", "s#15", "s#17", "s#18", "s#20", "s#21"], { DESIGNATION: "CAV-X-2", "TYPICAL FLOORS": "3-4, 6-17, 19-21, 31" }),
  ], [], { sheetTitleOf: titleOf });
  assert.equal(full.installed_qty, full.scheduled_qty);
  assert.equal(full.status, "MATCH");
  // without plan titles, the placements are counted as before
  const [bare] = reconcileRowsFromTakeoffItems([item("CAV-X-2", ["s#14", "s#17"], { DESIGNATION: "CAV-X-2", "TYPICAL FLOORS": "3-4, 6-34" })]);
  assert.equal(bare.installed_qty, 2);
});

test("AS-139: the takeoff schedules a typical-level row's units; the review list calls no level's mark unscheduled", () => {
  const graph = {
    tables: [{ kind: "equipment", sheet: "s#9", title: { text: "CUSTOM FACTORY-BUILT TRI-PATH MULTI-ZONE AIR HANDLING UNITS (SPECIFICATION SECTION 23 73 63)" },
      headers: ["DESIGNATION", "TYPICAL LEVELS"],
      rows: [{ key: "AHU-6-33-1", cells: cells({ DESIGNATION: "AHU-(6-33)-1", "TYPICAL LEVELS": "6-33" }) },
        { key: "AHU-3435-1", cells: cells({ DESIGNATION: "AHU-(34,35)-1", "TYPICAL LEVELS": "34-35" }) }] }],
    tags: [{ sheet: "s#17", role: "plan", text: "AHU 6-1", key: "AHU61", family: "AHU", bbox: [0, 0, 1, 1] },
      { sheet: "s#24", role: "plan", text: "AHU 34-1", key: "AHU341", family: "AHU", bbox: [0, 0, 1, 1] },
      { sheet: "s#26", role: "plan", text: "AHU X-1", key: "AHUX1", family: "AHU", bbox: [0, 0, 1, 1] },
      { sheet: "s#26", role: "plan", text: "AHU 36-1", key: "AHU361", family: "AHU", bbox: [0, 0, 1, 1] }],
  };
  const items = (compileHvacTakeoff(null, graph) as any).categories.AHU.items;
  assert.deepEqual(items.map((i: any) => [i.tag, i.scheduled_qty, i.scheduled_qty_basis]),
    [["AHU-(6-33)-1", 28, "one_per_typical_level"], ["AHU-(34,35)-1", 2, "one_per_typical_level"]]);
  const listed = unscheduledTagsAndAliasCandidates(graph).unscheduled_tags.map((t: any) => t.text);
  assert.deepEqual(listed, ["AHU 36-1"], "levels 6 and 34 are the rows' units, X a typical plan's; level 36 no row's");
});
