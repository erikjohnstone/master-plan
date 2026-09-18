import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTagKeyCsv, scoreTagEval } from "../src/tagEval.ts";

test("parseTagKeyCsv handles comments, blanks, and quoted commas", () => {
  const rows = parseTagKeyCsv([
    "# authored by rendering set.pdf and reading every drawn tag",
    "sheet,tag,role,in_table,note",
    "",
    'set.pdf#5,"FCU-2",plan,false,"leader to a duct fitting, near the IDF room"',
  ].join("\n"));
  assert.deepEqual(rows, [{ sheet: "set.pdf#5", tag: "FCU-2", role: "plan", in_table: false, note: "leader to a duct fitting, near the IDF room" }]);
});

test("parseTagKeyCsv throws a named error when required columns are missing", () => {
  assert.throws(
    () => parseTagKeyCsv("sheet,tag\nset.pdf#5,FCU-2", "keys/foo.tags.csv"),
    /keys\/foo\.tags\.csv.*role.*in_table/,
  );
});

test("parseTagKeyCsv tolerates a missing optional note column", () => {
  const rows = parseTagKeyCsv("sheet,tag,role,in_table\nset.pdf#5,FCU-2,plan,false");
  assert.deepEqual(rows, [{ sheet: "set.pdf#5", tag: "FCU-2", role: "plan", in_table: false, note: "" }]);
});

test("scoreTagEval matches on sheet + canonical key identity, hyphen/space-insensitive, no bbox needed", () => {
  const found = [{ sheet: "set.pdf#5", text: "FCU-2", key: "FCU2", family: "FCU", role: "plan", in_table: false }];
  const key = [
    { sheet: "set.pdf#5", tag: "FCU 2", role: "plan", in_table: false, note: "" },
    { sheet: "set.pdf#5", tag: "AHU-1", role: "plan", in_table: false, note: "the pipeline never saw this one" },
  ];
  const score = scoreTagEval(found, key);
  assert.equal(score.total, 2);
  assert.equal(score.found, 1);
  assert.equal(score.recallPct, 0.5);
  assert.deepEqual(score.perTag.map((r) => r.status), ["FOUND", "MISSED"]);
  assert.equal(score.perTag[0].foundRole, "plan");
});

test("scoreTagEval never needs bbox: identical text on the same sheet+key still matches without any coordinates", () => {
  // A drawn tag whose real DrawnTag bbox a hand-authored key could never
  // reliably reconstruct (see tagEval.ts's own header comment) must still
  // score FOUND on sheet+identity alone.
  const found = [{ sheet: "set.pdf#7", text: "BCV-1", key: "BCV1", family: "BCV", role: "plan", in_table: false }];
  const key = [{ sheet: "set.pdf#7", tag: "BCV-1", role: "plan", in_table: false, note: "" }];
  assert.equal(scoreTagEval(found, key).recallPct, 1);
});

test("scoreTagEval ignores sheet-callout instances entirely (never FOUND, never an extra)", () => {
  const found = [{ sheet: "set.pdf#5", text: "FCU-2", key: "FCU2", family: "FCU", role: "plan", in_table: false, sheet_callout: true }];
  const key = [{ sheet: "set.pdf#5", tag: "FCU-2", role: "plan", in_table: false, note: "" }];
  const score = scoreTagEval(found, key);
  assert.equal(score.found, 0);
  assert.deepEqual(score.extras, []);
});

test("scoreTagEval reports an extra only on a keyed sheet, within a family the key was enumerating there", () => {
  const found = [
    { sheet: "set.pdf#5", text: "FCU-2", key: "FCU2", family: "FCU", role: "plan", in_table: false },
    { sheet: "set.pdf#5", text: "FCU-9", key: "FCU9", family: "FCU", role: "plan", in_table: false }, // same family, not in key
    { sheet: "set.pdf#5", text: "VAV-3", key: "VAV3", family: "VAV", role: "plan", in_table: false }, // family the key never enumerated on this sheet
    { sheet: "set.pdf#9", text: "FCU-9", key: "FCU9", family: "FCU", role: "plan", in_table: false }, // sheet the key never reviewed at all
  ];
  const key = [{ sheet: "set.pdf#5", tag: "FCU-2", role: "plan", in_table: false, note: "" }];
  const score = scoreTagEval(found, key);
  assert.equal(score.found, 1);
  assert.deepEqual(score.extras, [{ sheet: "set.pdf#5", text: "FCU9", role: "plan" }]);
  assert.equal(score.precisionPct, 0.5);
});

test("scoreTagEval extracts the family prefix from the same raw hyphenated shape on both sides (regression: '<FAMILY>-A#' tags used to vanish from precision)", () => {
  // markKey strips hyphens before this ever reaches the scorer's canonical
  // `key` field ("AHU-A2" -> "AHUA2"); computing the family prefix off that
  // stripped form merges the "A" into the prefix ("AHUA", not "AHU") and
  // silently drops every such tag out of the precision denominator. The
  // fix reads the family prefix off `t.text` (still hyphenated) instead.
  const found = [{ sheet: "set.pdf#29", text: "AHU-A2", key: "AHUA2", family: "AHU-A", role: "plan", in_table: false }];
  const key = [{ sheet: "set.pdf#29", tag: "AHU-A2", role: "plan", in_table: false, note: "" }];
  const score = scoreTagEval(found, key);
  assert.equal(score.found, 1);
  assert.equal(score.precisionPct, 1);
  assert.deepEqual(score.extras, []);
});

test("scoreTagEval never penalizes duplicate raw census entries of an already-keyed tag (regression: recognition-pass duplicates, and repeatable schedule/type marks like CD-1/RG-1 that legitimately label many physical fixtures, used to each count as their own extra)", () => {
  const found = [
    { sheet: "set.pdf#38", text: "CD-1", key: "CD1", family: "CD", role: "plan", in_table: false },
    { sheet: "set.pdf#38", text: "CD-1", key: "CD1", family: "CD", role: "plan", in_table: false },
    { sheet: "set.pdf#38", text: "CD-1", key: "CD1", family: "CD", role: "plan", in_table: false },
  ];
  const key = [{ sheet: "set.pdf#38", tag: "CD-1", role: "plan", in_table: false, note: "" }];
  const score = scoreTagEval(found, key);
  assert.equal(score.found, 1);
  assert.equal(score.precisionPct, 1);
  assert.deepEqual(score.extras, []);
});

test("scoreTagEval still reports a genuinely different, unkeyed key in the same family as exactly one extra, however many raw duplicates it has", () => {
  const found = [
    { sheet: "set.pdf#38", text: "RG-1", key: "RG1", family: "RG", role: "plan", in_table: false },
    { sheet: "set.pdf#38", text: "RG-2", key: "RG2", family: "RG", role: "plan", in_table: false },
    { sheet: "set.pdf#38", text: "RG-2", key: "RG2", family: "RG", role: "plan", in_table: false },
  ];
  const key = [{ sheet: "set.pdf#38", tag: "RG-1", role: "plan", in_table: false, note: "" }];
  const score = scoreTagEval(found, key);
  assert.equal(score.found, 1);
  assert.deepEqual(score.extras, [{ sheet: "set.pdf#38", text: "RG2", role: "plan" }]);
  assert.equal(score.precisionPct, 0.5);
});

test("scoreTagEval treats an empty key as fully recalled and fully precise", () => {
  const score = scoreTagEval([], []);
  assert.equal(score.found, 0);
  assert.equal(score.total, 0);
  assert.equal(score.recallPct, 1);
  assert.equal(score.precisionPct, 1);
});
