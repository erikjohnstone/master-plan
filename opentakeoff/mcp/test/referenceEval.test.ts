import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReferenceKeyCsv, scoreReference } from "../src/referenceEval.ts";
import type { ReferenceTable } from "../src/takeoff.ts";

test("parseReferenceKeyCsv handles comments, quoted commas, and escaped quotes", () => {
  const rows = parseReferenceKeyCsv([
    "# independently verified key",
    "sheet,table_title,row_key,column,expected_value",
    'plan.pdf#2,"CONTROL, POINTS",AHU-1,NOTE,"Enable ""occupied"" mode"',
  ].join("\n"));

  assert.deepEqual(rows, [{
    sheet: "plan.pdf#2",
    table_title: "CONTROL, POINTS",
    row_key: "AHU-1",
    column: "NOTE",
    expected_value: 'Enable "occupied" mode',
  }]);
});

test("parseReferenceKeyCsv preserves literal inch marks in unquoted fields", () => {
  const rows = parseReferenceKeyCsv([
    "sheet,table_title,row_key,column,expected_value",
    'plan.pdf#2,COIL SCHEDULE,CHWC,LENGTH,107"',
  ].join("\n"));
  assert.equal(rows[0].expected_value, '107"');
});

test("scoreReference preserves standalone evaluator matching semantics", () => {
  const tables: ReferenceTable[] = [{
    sheet: "plan.pdf#2",
    title: "Control Points",
    headers: ["ALARM", "VALUE"],
    rows: [{
      key: "ahu-1",
      cells: { ALARM: " yes ", VALUE: "42" },
    }],
  }];
  const score = scoreReference(tables, [
    { sheet: "plan.pdf#2", table_title: "CONTROL   POINTS", row_key: "AHU-1", column: "ALARM", expected_value: "YES" },
    { sheet: "plan.pdf#2", table_title: "CONTROL POINTS", row_key: "AHU-1", column: "VALUE", expected_value: "43" },
    { sheet: "plan.pdf#2", table_title: "CONTROL POINTS", row_key: "AHU-2", column: "ALARM", expected_value: "YES" },
  ]);

  assert.equal(score.total, 3);
  assert.equal(score.exactCount, 1);
  assert.equal(score.exactPct, 1 / 3);
  assert.deepEqual(score.perCell.map((cell) => [cell.actual, cell.exact]), [
    [" yes ", true],
    ["42", false],
    [null, false],
  ]);
});

test("scoreReference treats an empty key as fully exact", () => {
  assert.deepEqual(scoreReference([], []), {
    perCell: [],
    exactCount: 0,
    total: 0,
    exactPct: 1,
  });
});

// THE MULTI-TIER HEADER CASE — federal-attachment4-mechanical.pdf#14, AIR
// HANDLING UNIT HYDRONIC COIL SCHEDULE. vectorgrid reads the drawing's real
// grouped-header structure ("WATERSIDE DATA" over EWT/LWT/FLOW/PD) where the
// key was authored against a flattened header ("EWT °F"). A raw exact-string
// column lookup reported ten real, correct cells as "(missing)"; this is the
// fix.
test("scoreReference matches a column across a multi-tier header prefix", () => {
  const tables: ReferenceTable[] = [{
    sheet: "federal-attachment4-mechanical.pdf#14",
    title: "AIR HANDLING UNIT HYDRONIC COIL SCHEDULE",
    headers: ["TYPE", "WATERSIDE DATA EWT °F", "WATERSIDE DATA LWT °F"],
    rows: [{
      key: "CHWC",
      cells: { TYPE: "CHWC", "WATERSIDE DATA EWT °F": "44", "WATERSIDE DATA LWT °F": "54" },
    }],
  }];
  const score = scoreReference(tables, [
    { sheet: "federal-attachment4-mechanical.pdf#14", table_title: "AIR HANDLING UNIT HYDRONIC COIL SCHEDULE",
      row_key: "CHWC", column: "EWT °F", expected_value: "44" },
    { sheet: "federal-attachment4-mechanical.pdf#14", table_title: "AIR HANDLING UNIT HYDRONIC COIL SCHEDULE",
      row_key: "CHWC", column: "LWT °F", expected_value: "54" },
  ]);
  assert.equal(score.exactCount, 2);
  assert.deepEqual(score.perCell.map((c) => c.actual), ["44", "54"]);
});

test("scoreReference refuses an ambiguous suffix match rather than guessing", () => {
  const tables: ReferenceTable[] = [{
    sheet: "p.pdf#1",
    title: "T",
    headers: ["SUPPLY EWT °F", "RETURN EWT °F"],
    rows: [{ key: "K", cells: { "SUPPLY EWT °F": "10", "RETURN EWT °F": "20" } }],
  }];
  const score = scoreReference(tables, [
    { sheet: "p.pdf#1", table_title: "T", row_key: "K", column: "EWT °F", expected_value: "10" },
  ]);
  assert.equal(score.perCell[0].actual, null);
  assert.equal(score.perCell[0].exact, false);
});

test("scoreReference does not let a shorter actual column match a longer expected one", () => {
  const tables: ReferenceTable[] = [{
    sheet: "p.pdf#1",
    title: "T",
    headers: ["°F"],
    rows: [{ key: "K", cells: { "°F": "10" } }],
  }];
  const score = scoreReference(tables, [
    { sheet: "p.pdf#1", table_title: "T", row_key: "K", column: "WATERSIDE DATA EWT °F", expected_value: "10" },
  ]);
  assert.equal(score.perCell[0].actual, null);
});
