// AS-141: a schedule title that cites its specification section, and the bare
// family nouns 26_CA titles its plant by (CHILLER, PUMPS, COOLING TOWER), read
// as their families' titles; a water-cooled chiller (WCU-*) under a chiller
// title and a blower coil (BCU-*) under a fan coil title are those families'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { familyRuleTitle } from "../src/lib/scheduleTitleMatch.mjs";
import { compileHvacTakeoff } from "../src/lib/corpusTakeoff.mjs";

test("AS-141: a family's title rules read a title without the section it cites", () => {
  assert.equal(familyRuleTitle("PUMPS (SPECIFICATION SECTION 23 21 23)"), "PUMPS");
  assert.equal(familyRuleTitle("FAN POWERED TERMINAL UNIT SCHEDULE (SECTION 23 36 00)"), "FAN POWERED TERMINAL UNIT SCHEDULE");
  assert.equal(familyRuleTitle("AIR HANDLING UNIT (COOLING) (SPECIFICATION 23 73 23)"), "AIR HANDLING UNIT (COOLING)");
  assert.equal(familyRuleTitle("BOILER SCHEDULE (SPEC SECTION 235216)"), "BOILER SCHEDULE");
  assert.equal(familyRuleTitle("CHILLER (SPECIFICATION SECTION 23 64 16)"), "CHILLER");
  assert.equal(familyRuleTitle("COOLING TOWER (SPECIFICATION"), "COOLING TOWER");
  // Other parentheticals stay.
  assert.equal(familyRuleTitle("AIR HANDLING UNIT (COOLING)"), "AIR HANDLING UNIT (COOLING)");
  assert.equal(familyRuleTitle("PUMP SCHEDULE (BASE BID)"), "PUMP SCHEDULE (BASE BID)");
  assert.equal(familyRuleTitle("EXHAUST FAN SCHEDULE (2 OF 3)"), "EXHAUST FAN SCHEDULE");
});

const row = (mark: string, extra: Record<string, string> = {}) => ({
  key: mark.replace(/[^A-Z0-9-]/gi, ""),
  cells: { DESIGNATION: { text: mark }, ...Object.fromEntries(Object.entries(extra).map(([h, t]) => [h, { text: t }])) },
});
const table = (title: string | null, headers: string[], rows: ReturnType<typeof row>[]) =>
  ({ kind: "equipment", sheet: "m.pdf#9", title: title ? { text: title } : null, headers, rows });
const tags = (graph: object, family: string) =>
  (((compileHvacTakeoff(null, graph) as any).categories?.[family]?.items ?? []) as Array<{ tag: string }>).map((i) => i.tag).sort();

test("AS-141: 26_CA's M0.09 plant, titled by section, reads its chillers, pumps, cooling towers and blower coils", () => {
  const graph = { tables: [
    table("CHILLER (SPECIFICATION SECTION 23 64 16)", ["DESIGNATION", "TYPE", "REFRIGERANT", "CAPACITY (TONS)"],
      [row("WCU-2-1 ,2", { TYPE: "CENTRIFUGAL" }), row("WCU-2-3", { TYPE: "CENTRIFUGAL" }), row("WCU-2-4", { TYPE: "CENTRIFUGAL" })]),
    table("PUMPS (SPECIFICATION SECTION 23 21 23)", ["COL1", "DESIGNATION", "LOCATION/ SERVICE", "TYPE", "GPM"],
      [row("CHWP-2-1 THRU 3"), row("PHWP-2-1 THRU 4"), row("SHWP-34-1 & 2"), row("CWP-62-4")]),
    table("COOLING TOWER (SPECIFICATION SECTION 23 65 13)", ["DESIGNATION", "CAPACITY (TONS)", "GPM"],
      [row("CT-R-1"), row("CT-R-2")]),
    table("FAN COIL (SPECIFICATION SECTION 23 82 19)", ["DESIGNATION", "LOCATION / SERVICE", "CFM"],
      [row("BCU-P3-1"), row("FCU-P2-2"), row("BCU-2-1")]),
  ] };
  assert.deepEqual(tags(graph, "AIR_COOLED_CHILLER"), ["WCU-2-1", "WCU-2-2", "WCU-2-3", "WCU-2-4"]);
  assert.deepEqual(tags(graph, "PUMP"), ["CHWP-2-1", "CHWP-2-2", "CHWP-2-3", "CWP-62-4", "PHWP-2-1", "PHWP-2-2", "PHWP-2-3", "PHWP-2-4", "SHWP-34-1", "SHWP-34-2"]);
  assert.deepEqual(tags(graph, "COOLING_TOWER"), ["CT-R-1", "CT-R-2"]);
  assert.deepEqual(tags(graph, "FCU"), ["BCU-2-1", "BCU-P3-1", "FCU-P2-2"]);
  // The items cite the table's own title.
  const ch = (compileHvacTakeoff(null, graph) as any).categories.AIR_COOLED_CHILLER.items.find((i: { tag: string }) => i.tag === "WCU-2-3");
  assert.equal(ch.table_title, "CHILLER (SPECIFICATION SECTION 23 64 16)");
});

test("AS-141: a blower coil with no fan coil title is no fan coil; a chiller title reads its chillers, not its pumps; a heat pump is no pump", () => {
  const graph = { tables: [
    table(null, ["DESIGNATION", "LOCATION", "CFM", "ESP"], [row("BCU-1"), row("FCU-1")]),
    table("CHILLER", ["DESIGNATION", "TYPE"], [row("CH-1"), row("P-1")]),
    table("HEAT PUMPS", ["DESIGNATION", "TYPE"], [row("HP-1")]),
    table("PUMPS AND ACCESSORIES", ["DESIGNATION", "TYPE"], [row("PA-1")]),
    table(null, ["DESIGNATION", "TYPE", "TONS"], [row("WCU-9")]),
  ] };
  assert.deepEqual(tags(graph, "FCU"), ["FCU-1"]);
  assert.deepEqual(tags(graph, "AIR_COOLED_CHILLER"), ["CH-1"], "a WCU mark needs a chiller title");
  assert.ok(!tags(graph, "PUMP").includes("HP-1"));
  assert.ok(!tags(graph, "PUMP").includes("PA-1"), "PUMPS is a title on its own, not a word in one");
});
