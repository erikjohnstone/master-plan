// ASSEMBLIES WP8.1 — the library as CSV (src/lib/assemblies/libraryCsv.ts): one row per
// item, a lossless round trip through the same load gate as a profile, and every problem
// reported by row and column.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_CSV_COLUMNS, importLibraryCsv, libraryFromCsv, libraryToCsv } from "../../src/lib/assemblies/libraryCsv.ts";
import { cloneForEdit } from "../../src/lib/assemblies/libraryEdit.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const STARTER = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;

test("round trip: the whole starter library, CSV → records → CSV, lossless and byte for byte", () => {
  const csv = libraryToCsv(STARTER);
  const back = libraryFromCsv(csv);
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.library, STARTER);
  assert.equal(libraryToCsv(back.library), csv);
  const rows = csv.trimEnd().split("\r\n").length - 1;
  const items = STARTER.reduce((n, a) => n + 1 + a.options.length + a.variables.length + a.lines.length + a.provenance.length, 0);
  assert.ok(rows >= items, "a row per item");
});

test("a partner's edited record with partner fields round-trips too", () => {
  const fcu = STARTER.find((a) => a.id === "fcu")!;
  const mine = cloneForEdit(fcu, STARTER);
  mine.lines = mine.lines.map((l, i) => (i === 0 ? { ...l, partner: { part_no: "PN-1", unit_cost: 12.5, hours: 0.75, labor_category: "tech" }, export: { cost_code: "23-09" } } : l));
  mine.lines[1] = { ...mine.lines[1], label: 'Label with "quotes", a comma\nand a line break' };
  const back = libraryFromCsv(libraryToCsv([...STARTER, mine]));
  assert.deepEqual(back.errors, []);
  assert.deepEqual(back.library.find((a) => a.id === "fcu" && a.version === mine.version), mine);
});

/** RFC 4180 rows and back, for editing a cell the way a spreadsheet would. */
function rows(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); out.push(row); row = []; cell = ""; i++; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
const csvOf = (rs: string[][]) => `${rs.map((r) => r.map((c) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n")}\r\n`;

test("errors name the row and column; a record with any error is not returned; the gate's rejections name the record's rows", () => {
  const rs = rows(libraryToCsv(STARTER.filter((a) => a.id === "fcu" || a.id === "pump-vfd")));
  const col = (name: string) => rs[0].indexOf(name);
  // Break one line row of fcu: its role has no vocab.
  const i = rs.findIndex((r) => r[0] === "line" && r[1] === "fcu");
  const good = rs[i][col("role")];
  rs[i][col("role")] = "control-valve";
  let r = libraryFromCsv(csvOf(rs));
  assert.deepEqual(r.library.map((a) => a.id), ["pump-vfd"], "the broken record is held back; the good one loads");
  assert.ok(r.errors.some((e) => e.row === i + 1 && e.column === "role" && /vocab:id/.test(e.message)), JSON.stringify(r.errors));
  // A cell-clean record the gate rejects: a selector that reads no attribute of the family.
  rs[i][col("role")] = good;
  const j = rs.findIndex((x) => x[0] === "assembly" && x[1] === "pump-vfd");
  rs[j][col("selector")] = "attr.no_such_attribute = 'x'";
  r = libraryFromCsv(csvOf(rs));
  const gate = r.errors.find((e) => e.record === "pump-vfd@1");
  assert.ok(gate && /no_such_attribute/.test(gate.message) && /^rows \d+–\d+/.test(gate.message), JSON.stringify(r.errors));
  assert.deepEqual(r.library.map((x) => x.id), ["fcu"]);
  // Structure: a missing column and an unknown row type.
  assert.match(libraryFromCsv("row_type,assembly_id\r\n").errors[0].message, /missing column/);
  const unknownType = libraryFromCsv(`${LIBRARY_CSV_COLUMNS.join(",")}\r\nwidget,fcu,1\r\n`);
  assert.ok(unknownType.errors.some((e) => e.row === 2 && e.column === "row_type"));
});

test("import beside the starter: a whole-library export reads back unchanged; a partner record resolves the starter's parts; an edited starter record is refused", () => {
  const hook = STARTER.find((a) => a.lines.some((l) => l.kind === "assembly" && l.ref))!;
  const myHook = cloneForEdit(hook, STARTER);
  const myFcu = cloneForEdit(STARTER.find((a) => a.id === "fcu")!, STARTER);
  // The whole library (starter and partner) exported and read back.
  const all = importLibraryCsv(libraryToCsv([...STARTER, myFcu, myHook]), STARTER, []);
  assert.deepEqual(all.errors, []);
  assert.deepEqual(all.unchanged.length, STARTER.length);
  assert.deepEqual(all.added.sort(), [`${myFcu.id}@${myFcu.version}`, `${myHook.id}@${myHook.version}`].sort());
  assert.deepEqual(all.partner, [myFcu, myHook]);
  // A partner-only file: its hook-up names a starter part, and it resolves.
  const only = importLibraryCsv(libraryToCsv([myHook]), STARTER, []);
  assert.deepEqual(only.errors, []);
  assert.deepEqual(only.added, [`${myHook.id}@${myHook.version}`]);
  // Reading it again changes nothing; a changed partner record replaces its own version.
  const again = importLibraryCsv(libraryToCsv([myHook]), STARTER, only.partner);
  assert.deepEqual([again.added, again.replaced, again.unchanged], [[], [], [`${myHook.id}@${myHook.version}`]]);
  const edited = { ...myHook, title: `${myHook.title} (edited)` };
  assert.deepEqual(importLibraryCsv(libraryToCsv([edited]), STARTER, only.partner).replaced, [`${myHook.id}@${myHook.version}`]);
  // A starter record changed in place is refused, and nothing else is lost.
  const starterEdit = { ...STARTER[0], title: "changed in place" };
  const refused = importLibraryCsv(libraryToCsv([starterEdit, myFcu]), STARTER, []);
  assert.ok(refused.errors.some((e) => e.record === `${STARTER[0].id}@1` && /read-only: clone it/.test(e.message)), JSON.stringify(refused.errors));
  assert.deepEqual(refused.added, [`${myFcu.id}@${myFcu.version}`]);
});
