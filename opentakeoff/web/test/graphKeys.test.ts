// The sheet graph comes back keyed by the upload spool's content hash, while
// the canvas is keyed by the real filename. These pin the translation — and,
// as much as the translation, what it must NOT touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { remapKey, remapGraphSheetKeys } from "../src/lib/graphKeys.js";

const SHA = "d2e1967964c07d7bd1c058e1e17acaae79c344c83f0e8c9d5241dc9493637da1";
const map = new Map([[SHA, "05__USDA_APHIS.pdf"]]);

test("remapKey: a spooled key becomes the real one, page marker intact", () => {
  assert.equal(remapKey(`${SHA}.pdf#12`, map), "05__USDA_APHIS.pdf#12");
  assert.equal(remapKey(`${SHA}.pdf`, map), "05__USDA_APHIS.pdf");
  assert.equal(remapKey(`${SHA.toUpperCase()}.pdf#3`, map), "05__USDA_APHIS.pdf#3");
});

test("remapKey leaves everything that is not a spooled name alone", () => {
  assert.equal(remapKey("plans.pdf#4", map), "plans.pdf#4");
  // a real 64-hex name we have no mapping for stays as it is, rather than
  // becoming undefined
  const other = "a".repeat(64);
  assert.equal(remapKey(`${other}.pdf#1`, map), `${other}.pdf#1`);
  // 63 hex is not a sha256
  assert.equal(remapKey(`${"b".repeat(63)}.pdf`, map), `${"b".repeat(63)}.pdf`);
  assert.equal(remapKey("", map), "");
  assert.equal(remapKey(undefined as any, map), undefined);
});

test("a filename containing # keeps it; only a trailing #<digits> is a page", () => {
  const m = new Map([[SHA, "set #2.pdf"]]);
  assert.equal(remapKey(`${SHA}.pdf#7`, m), "set #2.pdf#7");
  assert.equal(remapKey(`${SHA}.pdf#rev`, m), `${SHA}.pdf#rev`, "not a page marker — not a key we understand");
});

test("remapGraphSheetKeys rewrites every sheet key the graph carries, at depth", () => {
  const g: any = {
    sheets: [{ key: `${SHA}.pdf#1`, schedules: [{ title: "FAN SCHEDULE", region: [0, 0, 1, 1] }] }],
    tables: [{
      sheet: `${SHA}.pdf#2`,
      title: { sheet: `${SHA}.pdf#2`, text: "VAV SCHEDULE", bbox: [0, 0, 1, 1] },
      rows: [{ key: "VAV-1", sheet: `${SHA}.pdf#3`, cells: { TAG: { text: "VAV-1", bbox: [0, 0, 1, 1] } } }],
      parts: [{ sheet: `${SHA}.pdf#2` }, { sheet: `${SHA}.pdf#3` }],
    }],
  };
  remapGraphSheetKeys(g, map);
  assert.equal(g.sheets[0].key, "05__USDA_APHIS.pdf#1");
  assert.equal(g.tables[0].sheet, "05__USDA_APHIS.pdf#2");
  assert.equal(g.tables[0].title.sheet, "05__USDA_APHIS.pdf#2");
  assert.equal(g.tables[0].rows[0].sheet, "05__USDA_APHIS.pdf#3", "a continued row cites its OWN sheet");
  assert.deepEqual(g.tables[0].parts.map((p: any) => p.sheet), ["05__USDA_APHIS.pdf#2", "05__USDA_APHIS.pdf#3"]);
});

test("it rewrites a row key that is NOT a sheet key never — only the named fields", () => {
  const g: any = {
    tables: [{
      sheet: `${SHA}.pdf#2`,
      // `key` on a ROW is a MARK, not a sheet key; it is left alone because it
      // is not a spooled name, and the field-name walk plus the shape guard
      // both have to hold for it to be touched
      rows: [{ key: "AHU-1", sheet: `${SHA}.pdf#2`, cells: { NOTE: { text: `${SHA}.pdf#2` } } }],
    }],
  };
  remapGraphSheetKeys(g, map);
  assert.equal(g.tables[0].rows[0].key, "AHU-1");
  assert.equal(g.tables[0].rows[0].sheet, "05__USDA_APHIS.pdf#2");
  assert.equal(g.tables[0].rows[0].cells.NOTE.text, `${SHA}.pdf#2`, "cell TEXT is drawing content, never a key");
});

test("a map KEYED BY sheet key is rekeyed too", () => {
  const g: any = { spans: { [`${SHA}.pdf#5`]: [{ text: "AHU-1" }] } };
  remapGraphSheetKeys(g, map);
  assert.deepEqual(Object.keys(g.spans), ["05__USDA_APHIS.pdf#5"]);
});

test("no map, empty map, or a cyclic graph are all safe", () => {
  const g: any = { tables: [{ sheet: `${SHA}.pdf#1` }] };
  assert.equal(remapGraphSheetKeys(g, new Map()), g);
  assert.equal(g.tables[0].sheet, `${SHA}.pdf#1`, "an empty map changes nothing");
  assert.equal(remapGraphSheetKeys(null as any, map), null);

  const cyc: any = { tables: [{ sheet: `${SHA}.pdf#1` }] };
  cyc.self = cyc;
  remapGraphSheetKeys(cyc, map);
  assert.equal(cyc.tables[0].sheet, "05__USDA_APHIS.pdf#1");
});
