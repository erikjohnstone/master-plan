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
