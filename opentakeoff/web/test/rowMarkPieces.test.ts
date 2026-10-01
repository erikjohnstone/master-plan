// AS-138: a separator inside a mark's parentheses does not split the mark.
// 26_CA's M0.09 lists the tri-path air handlers of typical levels by
// "AHU-(6-33)-1", "AHU-(34,35)-1" and their "-2" twins; the comma split
// "AHU-(34,35)-1" into "AHU-(34" and "35)-1", and both rows read as one unit
// named "AHU-(34".
import { test } from "node:test";
import assert from "node:assert/strict";
import { compileHvacTakeoff, splitRowMarks } from "../src/lib/corpusTakeoff.mjs";

test("AS-138: a separator inside a mark's parentheses does not split it", () => {
  assert.deepEqual(splitRowMarks("AHU-(34,35)-1", true), ["AHU-(34,35)-1"]);
  assert.deepEqual(splitRowMarks("AHU-(34/35)-1", false), ["AHU-(34/35)-1"]);
  // Outside parentheses, as before.
  assert.deepEqual(splitRowMarks("CWP-1/CWP-2", false), ["CWP-1", "CWP-2"]);
  assert.deepEqual(splitRowMarks("DFC-1 , DCU-1", true), ["DFC-1", "DCU-1"]);
  assert.deepEqual(splitRowMarks("AHU-(6-33)-1/AHU-(34,35)-1", true), ["AHU-(6-33)-1", "AHU-(34,35)-1"]);
  // An unclosed parenthesis keeps the rest of the text whole.
  assert.deepEqual(splitRowMarks("(E AHU-1, AHU-2", true), ["(E AHU-1, AHU-2"]);
});

test("AS-138: 26_CA's typical-level air handlers are two units each pair, never one named AHU-(34", () => {
  const row = (mark: string, levels: string) => ({ key: mark.replace(/[^A-Z0-9-]/g, ""), cells: { DESIGNATION: { text: mark }, "TYPICAL LEVELS": { text: levels } } });
  const graph = { tables: [{
    kind: "equipment", sheet: "m.pdf#9", title: { text: "CUSTOM FACTORY-BUILT TRI-PATH MULTI-ZONE AIR HANDLING UNITS (SPECIFICATION SECTION 23 73 63)" },
    headers: ["DESIGNATION", "TYPICAL LEVELS"],
    rows: [row("AHU-(6-33)-1", "6-33"), row("AHU-(6-33)-2", "6-33"), row("AHU-(34,35)-1", "34-35"), row("AHU-(34,35)-2", "34-35")],
  }] };
  const tags = ((compileHvacTakeoff(null, graph) as any).categories?.AHU?.items ?? []).map((i: { tag: string }) => i.tag).sort();
  assert.deepEqual(tags, ["AHU-(34,35)-1", "AHU-(34,35)-2", "AHU-(6-33)-1", "AHU-(6-33)-2"]);
});
