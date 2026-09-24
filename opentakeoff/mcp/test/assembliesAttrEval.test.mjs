// ASSEMBLIES instrument 2 — the attribute eval's scoring rules
// (scripts/assemblies-attr-eval.mjs; reports/assemblies/key-work/README.md
// "How a key is scored"), on synthetic keys and compile items, plus a check
// that its CSV reader reads every committed key exactly as the transcription
// helper expands it.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expandTranscription, parseTranscription } from "../scripts/assemblies-key-transcribe.mjs";
import {
  KEY_COLUMNS, canonTag, compileTableTitle, gateVerdict, keyTables, lineSlice, parseAttrKeyCsv,
  sameCanonical, scoreSet, summarize, tally,
} from "../scripts/assemblies-attr-eval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const WORK = join(CORPUS, "reports", "assemblies", "key-work");

const q = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const csv = (lines, comments = []) => [...comments, KEY_COLUMNS.join(","),
  ...lines.map((l) => KEY_COLUMNS.map((c) => q(l[c] ?? "")).join(","))].join("\n");
const line = (o) => ({ sheet: "a.pdf#2", table_title: "PUMP SCHEDULE", family: "PUMP", unit: "", source_header: "", note: "", ...o });
const item = (o) => ({ family: "PUMP", sheet_id: "a.pdf#2", table_title: "PUMP SCHEDULE", cells: {}, ...o });
const cite = (o = {}) => ({ sheet: "a.pdf#2", table_title: "PUMP SCHEDULE", header: "GPM", bbox: null, ...o });
const val = (value, o = {}) => ({ value, printed: String(value), cite: cite(o), rule: "test" });
/** A normalizer that answers from a table: tag -> { attribute -> value }. */
const fake = (byTag) => (it, family) => ({ family, tag: it.tag, attributes: byTag[it.tag] ?? {}, unknown: {} });
const outcomeOf = (r, tag, attribute) => r.outcomes.find((o) => o.tag === tag && o.attribute === attribute)?.outcome;

test("reads a key: quoted fields, the column check, and the printed titles of a table keyed in parts", () => {
  const key = parseAttrKeyCsv(csv([
    line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm", source_header: "CAPACITY, GPM" }),
  ], [
    "# x.attrs.csv — header",
    '#   a.pdf#2 | PUMP SCHEDULE | PUMP | all 1 printed row | render: part 2, printed as "PUMP SCHEDULE 2 OF 2", page 2 crop 1,2,3,4 at 3x',
    '#   a.pdf#2 | PUMP SCHEDULE | PUMP | all 1 printed row | render: page 2 crop 1,2,3,4 at 3x',
  ]));
  assert.equal(key.rows.length, 1);
  assert.equal(key.rows[0].source_header, "CAPACITY, GPM");
  assert.deepEqual(key.parts, [{ sheet: "a.pdf#2", table_title: "PUMP SCHEDULE", printed: "PUMP SCHEDULE 2 OF 2" }]);
  assert.throws(() => parseAttrKeyCsv("sheet,tag\nx,y"), /expected/);
  assert.throws(() => parseAttrKeyCsv(`${KEY_COLUMNS.join(",")}\na,b`), /fields/);
});

test("every committed key reads exactly as its transcription expands", () => {
  const files = existsSync(WORK) ? readdirSync(WORK).filter((f) => f.endsWith(".transcription.txt")) : [];
  assert.ok(files.length >= 17, `found ${files.length} transcriptions`);
  for (const f of files) {
    const setId = f.replace(/\.transcription\.txt$/, "");
    const expanded = expandTranscription(parseTranscription(readFileSync(join(WORK, f), "utf8")));
    const read = parseAttrKeyCsv(readFileSync(join(CORPUS, "keys", `${setId}.attrs.csv`), "utf8")).rows;
    assert.equal(read.length, expanded.length, setId);
    read.forEach((r, i) => {
      for (const c of KEY_COLUMNS) assert.equal(r[c], String(expanded[i][c] ?? ""), `${setId} line ${i + 1} ${c}`);
    });
  }
});

test("scores exact, wrong, missed, invented and correctly-unknown per key line", () => {
  const key = parseAttrKeyCsv(csv([
    line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm" }),
    line({ tag: "P-1", attribute: "head_ft", value: "40", unit: "ft" }),
    line({ tag: "P-1", attribute: "motor_hp", value: "5", unit: "hp" }),
    line({ tag: "P-1", attribute: "volts", value: "", unit: "V", note: "not printed" }),
    line({ tag: "P-1", attribute: "rpm", value: "", unit: "rpm", note: "blank cell" }),
  ]));
  const r = scoreSet({ setId: "s", key, snapshot: { items: [item({ tag: "P-1" })], tables: [] },
    normalize: fake({ "P-1": { gpm: val(120), head_ft: val(45), volts: val(460) } }) });
  assert.equal(outcomeOf(r, "P-1", "gpm"), "exact");
  assert.equal(outcomeOf(r, "P-1", "head_ft"), "wrong");
  assert.equal(outcomeOf(r, "P-1", "motor_hp"), "missed");
  assert.equal(outcomeOf(r, "P-1", "volts"), "invented");
  assert.equal(outcomeOf(r, "P-1", "rpm"), "correctly_unknown");
  const t = tally(r.outcomes);
  assert.deepEqual([t.printed, t.exact, t.wrong, t.missed, t.invented, t.correctly_unknown], [3, 1, 1, 1, 1, 1]);
  assert.equal(t.exact_pct, 1 / 3);
});

test("a key value printed in another unit is compared in the canonical unit", () => {
  const key = parseAttrKeyCsv(csv([
    line({ tag: "P-1", attribute: "motor_hp", value: "746", unit: "W" }),
  ]));
  const r = scoreSet({ setId: "s", key, snapshot: { items: [item({ tag: "P-1" })], tables: [] },
    normalize: fake({ "P-1": { motor_hp: val(746 / 745.7) } }) });
  assert.equal(outcomeOf(r, "P-1", "motor_hp"), "exact");
  assert.ok(sameCanonical("cooling_mbh", 48.4, 48400 * 0.001));
  assert.ok(!sameCanonical("cooling_mbh", 48.4, 48.5));
  assert.ok(sameCanonical("area_served", "Mech  Room 101", "MECH ROOM 101"));
});

test("a value cited outside the key's table is out of key scope, never exact or invented", () => {
  const key = parseAttrKeyCsv(csv([
    line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm" }),
    line({ tag: "P-1", attribute: "volts", value: "", unit: "V", note: "not printed" }),
  ]));
  const r = scoreSet({ setId: "s", key, snapshot: { items: [item({ tag: "P-1" })], tables: [] },
    normalize: fake({ "P-1": { gpm: val(120, { table_title: "MOTOR SCHEDULE" }), volts: val(460, { sheet: "a.pdf#3" }) } }) });
  assert.equal(outcomeOf(r, "P-1", "gpm"), "out_of_scope");
  assert.equal(outcomeOf(r, "P-1", "volts"), "out_of_scope");
  assert.equal(tally(r.outcomes).exact_pct, 0);
});

test("a cite in a printed part of the keyed table is in scope", () => {
  const key = parseAttrKeyCsv(csv([
    line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm" }),
  ], ['#   a.pdf#2 | PUMP SCHEDULE | PUMP | all 1 printed row | render: part 2, printed as "PUMP DATA (PART 2 OF 2)", page 2 crop 1,2,3,4 at 3x']));
  assert.ok(keyTables(key).get("a.pdf#2|PUMP SCHEDULE").titles.has("PUMP DATA (PART 2 OF 2)"));
  const r = scoreSet({ setId: "s", key, snapshot: { items: [item({ tag: "P-1" })], tables: [] },
    normalize: fake({ "P-1": { gpm: val(120, { table_title: "PUMP DATA (PART 2 OF 2)" }) } }) });
  assert.equal(outcomeOf(r, "P-1", "gpm"), "exact");
  assert.equal(compileTableTitle("DEDICATED OUTDOOR AIR UNIT SCHEDULE 2 OF 2"), "DEDICATED OUTDOOR AIR UNIT SCHEDULE");
  assert.equal(compileTableTitle("WATER SOURCE HEAT PUMP (PART 2 OF 2)"), "WATER SOURCE HEAT PUMP (PART 2 OF 2)");
});

test("every value reported from a table keyed 'rows: none' is invented", () => {
  const key = parseAttrKeyCsv(csv([
    line({ table_title: "EQUIPMENT ANCHORAGE SCHEDULE", family: "DUCT_MOUNTED_COIL", tag: "", attribute: "", note: "no DUCT_MOUNTED_COIL instance printed: none" }),
  ]));
  const r = scoreSet({ setId: "s", key,
    snapshot: { items: [item({ tag: "C-1", family: "DUCT_MOUNTED_COIL", table_title: "EQUIPMENT ANCHORAGE SCHEDULE" })], tables: [] },
    normalize: fake({ "C-1": { hw_gpm: val(3, { table_title: "EQUIPMENT ANCHORAGE SCHEDULE" }), hw_mbh: val(20, { table_title: "EQUIPMENT ANCHORAGE SCHEDULE" }) } }) });
  assert.deepEqual(r.outcomes.map((o) => o.outcome), ["invented", "invented"]);
  assert.equal(summarize([r]).total.invented, 2);
});

test("a compile item in a keyed table that matches no keyed instance is out of key scope (AS-13)", () => {
  const key = parseAttrKeyCsv(csv([line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm" })]));
  const r = scoreSet({ setId: "s", key, snapshot: { items: [item({ tag: "P-1" }), item({ tag: "P-31" })], tables: [] },
    normalize: fake({ "P-1": { gpm: val(120) }, "P-31": { gpm: val(99) } }) });
  assert.equal(r.outcomes.length, 1);
  assert.deepEqual(r.outOfScopeItems.map((i) => [i.tag, i.values]), [["P-31", 1]]);
});

test("tags match across case, spacing and dash glyphs; a dashless match must be unique", () => {
  assert.equal(canonTag(" ahu‑1 "), "AHU-1");
  const key = parseAttrKeyCsv(csv([
    line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm" }),
    line({ tag: "P2", attribute: "gpm", value: "80", unit: "gpm" }),
    line({ tag: "P3", attribute: "gpm", value: "80", unit: "gpm" }),
  ]));
  const snapshot = { items: [item({ tag: "p–1" }), item({ tag: "P-2" }), item({ tag: "P-3" }), item({ tag: "P.3" })], tables: [] };
  const r = scoreSet({ setId: "s", key, snapshot, normalize: fake({ "p–1": { gpm: val(120) }, "P-2": { gpm: val(80) } }) });
  const by = Object.fromEntries(r.instances.map((i) => [i.tag, i]));
  assert.equal(by["P-1"].how, "tag");
  assert.equal(by.P2.how, "tag without dashes");
  assert.equal(by.P3.matched, false);
  assert.equal(outcomeOf(r, "P3", "gpm"), "missed");
});

test("two compile items with the key's tag: the one of the key's family is scored", () => {
  const key = parseAttrKeyCsv(csv([
    line({ table_title: "SPLIT SYSTEM SCHEDULE", family: "FCU", tag: "F-1", attribute: "cfm", value: "800", unit: "cfm" }),
  ]));
  const at = { table_title: "SPLIT SYSTEM SCHEDULE" };
  const snapshot = { items: [item({ tag: "F-1", family: "CONDENSING_UNIT", ...at }), item({ tag: "F-1", family: "FCU", ...at })], tables: [] };
  const normalize = (it, family) => ({ family, tag: it.tag, unknown: {},
    attributes: family === "FCU" ? { cfm: val(800, at) } : { cfm: val(1, at) } });
  const r = scoreSet({ setId: "s", key, snapshot, normalize });
  assert.equal(outcomeOf(r, "F-1", "cfm"), "exact");
  assert.equal(r.instances[0].item_family, "FCU");
  assert.deepEqual(r.outOfScopeItems.map((i) => i.family), ["CONDENSING_UNIT"]);
});

test("the normalizer gets the item's family and its table's headers and notes", () => {
  const key = parseAttrKeyCsv(csv([line({ tag: "P-1", attribute: "gpm", value: "120", unit: "gpm" })]));
  let seen = null;
  const notes = [{ id: "1", text: "PROVIDE VFD." }];
  scoreSet({ setId: "s", key,
    snapshot: { items: [item({ tag: "P-1" })], tables: [{ sheet: "a.pdf#2", title: "PUMP SCHEDULE", headers: ["MARK", "GPM"], notes }, { sheet: "a.pdf#9", title: "PUMP SCHEDULE", headers: ["X"], notes: [] }] },
    normalize: (it, family, table) => { seen = { family, table }; return { family, tag: it.tag, attributes: {}, unknown: {} }; } });
  assert.deepEqual(seen, { family: "PUMP", table: { headers: ["MARK", "GPM"], notes, rows: [] } });
});

test("slices and the gate", () => {
  assert.equal(lineSlice({ source_header: "NOTE 2, where the row's REMARKS cite it", note: "" }), "notes");
  assert.equal(lineSlice({ source_header: "[NOTE 1]", note: "" }), "notes");
  assert.equal(lineSlice({ source_header: "NOTES 1, 2", note: "notes 1 and 2, cited by every row (the author's reading)" }), "notes");
  assert.equal(lineSlice({ source_header: "TYPE", note: "printed 'X'; author's reading of the printed row" }), "reading");
  assert.equal(lineSlice({ source_header: "GPM", note: "" }), "grid");
  const pass = { exact_pct: 0.985, wrong_pct: 0.004, invented: 0 };
  assert.equal(gateVerdict(pass, "dev").pass, true);
  assert.equal(gateVerdict({ ...pass, invented: 1 }, "dev").pass, false);
  assert.equal(gateVerdict({ ...pass, exact_pct: 0.979 }, "dev").pass, false);
  assert.equal(gateVerdict({ ...pass, exact_pct: 0.96, wrong_pct: 0.009 }, "heldout").pass, true);
});
