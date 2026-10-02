// The sheet graph comes back keyed by the upload spool's content hash, while
// the canvas is keyed by the real filename. These pin the translation — and,
// as much as the translation, what it must NOT touch.
import { test } from "node:test";
import assert from "node:assert/strict";
import { remapKey, remapGraphSheetKeys, remapPacketId } from "../src/lib/graphKeys.js";

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

test("a control packet's id is rekeyed where the readings cite it; drawing text and other ids are not", () => {
  // 096_IN through the Takeoff panel: the readings' cites carried
  // "<sha>.pdf#36#p8", and the panel printed "(control packet <sha>…)" beside
  // a sheet already named for the file.
  assert.equal(remapPacketId(`${SHA}.pdf#36#p8`, map), "05__USDA_APHIS.pdf#36#p8");
  assert.equal(remapPacketId("plans.pdf#36#p8", map), "plans.pdf#36#p8");
  assert.equal(remapPacketId(`${"a".repeat(64)}.pdf#36#p8`, map), `${"a".repeat(64)}.pdf#36#p8`, "a sha we did not upload stays");
  // federal-mech through the Takeoff panel: a zone plan's readings cite
  // "<sha>.pdf#2#zones" (the VAV boxes' CO2 sensors drawn in their zones).
  assert.equal(remapPacketId(`${SHA}.pdf#2#zones`, map), "05__USDA_APHIS.pdf#2#zones");
  assert.equal(remapPacketId(`${SHA}.pdf#2#zonesX`, map), `${SHA}.pdf#2#zonesX`, "only the zone plan's own suffix");
  assert.equal(remapPacketId(`${SHA}.pdf#2`, map), `${SHA}.pdf#2`, "a sheet key is remapKey's");
  const g: any = {
    control: { packets: [{ id: `${SHA}.pdf#36#p8`, sheet: `${SHA}.pdf#36` }] },
    control_readings: { units: [{ item: 3, decisions: [{ cites: [{ packet: `${SHA}.pdf#36#p8`, sheet: `${SHA}.pdf#36`, text: `${SHA}.pdf#36#p8` }] }] }] },
    items: [{ id: "row-7", sheet_id: `${SHA}.pdf#36` }],
  };
  remapGraphSheetKeys(g, map);
  assert.equal(g.control.packets[0].id, "05__USDA_APHIS.pdf#36#p8");
  const cite = g.control_readings.units[0].decisions[0].cites[0];
  assert.deepEqual([cite.packet, cite.sheet], ["05__USDA_APHIS.pdf#36#p8", "05__USDA_APHIS.pdf#36"]);
  assert.equal(cite.text, `${SHA}.pdf#36#p8`, "quoted drawing text is never rewritten");
  assert.equal(g.items[0].id, "row-7");
});

test("a reconcile row's schedule-row sheet and prose citing a spooled file read back as the real name", () => {
  const H = "c239d0ce532a94a008318711b0b165f42fe8e7bf8465cc3006f6e248dd784541";
  const result: any = { rows: [{
    tag: "AHU-1",
    reason: `Schedule row "AHU-1" (SCHEDULE on ${H}.pdf#8) cannot be geometrically anchored`,
    schedule_cite: { sheet: `${H}.pdf#8`, title: "SCHEDULE", row_sheet: `${H}.pdf#8`, row_bbox: { x0: 1, y0: 2, x1: 3, y1: 4 } },
    plan_other_cites: [{ sheet: `${H}.pdf#3`, at: [1, 2], reason: "repeat_view", counted_on: `${H}.pdf#4` }],
    cells: { NOTE: "SEE abc.pdf" },
  }] };
  remapGraphSheetKeys(result, new Map([[H, "nv-central.pdf"]]));
  const row = result.rows[0];
  assert.equal(row.schedule_cite.row_sheet, "nv-central.pdf#8");
  assert.equal(row.plan_other_cites[0].counted_on, "nv-central.pdf#4");
  assert.match(row.reason, /SCHEDULE on nv-central\.pdf#8\)/);
  // ordinary text (a real filename, cell content) is untouched
  assert.equal(row.cells.NOTE, "SEE abc.pdf");
  // an unknown spool name stays as it is rather than being guessed
  const other: any = { note: `see ${"f".repeat(64)}.pdf#2` };
  remapGraphSheetKeys(other, new Map([[H, "nv-central.pdf"]]));
  assert.equal(other.note, `see ${"f".repeat(64)}.pdf#2`);
});
