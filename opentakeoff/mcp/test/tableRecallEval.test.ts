import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTableRecallKeyCsv, scoreTableRecall } from "../src/tableRecallEval.ts";

test("parseTableRecallKeyCsv handles comments, blanks, and quoted commas", () => {
  const rows = parseTableRecallKeyCsv([
    "# authored by rendering set.pdf and reading every schedule table",
    "sheet,table_title,note",
    "",
    'set.pdf#5,"VAV, SCHEDULE",continuation on #6',
  ].join("\n"));
  assert.deepEqual(rows, [{ sheet: "set.pdf#5", table_title: "VAV, SCHEDULE", note: "continuation on #6" }]);
});

test("parseTableRecallKeyCsv throws a named error when required columns are missing", () => {
  assert.throws(
    () => parseTableRecallKeyCsv("sheet,title\nset.pdf#5,VAV SCHEDULE", "keys/foo.tables.csv"),
    /keys\/foo\.tables\.csv.*table_title/,
  );
});

test("parseTableRecallKeyCsv tolerates a missing optional note column", () => {
  const rows = parseTableRecallKeyCsv("sheet,table_title\nset.pdf#5,VAV SCHEDULE");
  assert.deepEqual(rows, [{ sheet: "set.pdf#5", table_title: "VAV SCHEDULE", note: "" }]);
});

test("scoreTableRecall matches on sheet + normalized title, case/whitespace-insensitive", () => {
  const found = [{ sheet: "set.pdf#5", title: "VAV   Schedule" }];
  const key = [
    { sheet: "set.pdf#5", table_title: "VAV SCHEDULE", note: "" },
    { sheet: "set.pdf#5", table_title: "COIL SCHEDULE", note: "the pipeline never saw this one" },
  ];
  const score = scoreTableRecall(found, key);
  assert.equal(score.total, 2);
  assert.equal(score.found, 1);
  assert.equal(score.recallPct, 0.5);
  assert.deepEqual(score.perTable.map((r) => r.status), ["FOUND", "MISSED"]);
});

test("scoreTableRecall reports an extra only on a sheet the key actually reviewed", () => {
  const found = [
    { sheet: "set.pdf#5", title: "VAV SCHEDULE" },
    { sheet: "set.pdf#5", title: "DUCT DETAIL LEGEND" },   // not in the key, but sheet #5 WAS reviewed
    { sheet: "set.pdf#9", title: "UNREVIEWED SHEET TABLE" }, // sheet #9 never appears in the key at all
  ];
  const key = [{ sheet: "set.pdf#5", table_title: "VAV SCHEDULE", note: "" }];
  const score = scoreTableRecall(found, key);
  assert.equal(score.found, 1);
  assert.deepEqual(score.extras, [{ sheet: "set.pdf#5", title: "DUCT DETAIL LEGEND" }]);
});

test("scoreTableRecall treats an empty key as fully recalled", () => {
  assert.deepEqual(scoreTableRecall([], []), { perTable: [], extras: [], found: 0, total: 0, recallPct: 1 });
});
