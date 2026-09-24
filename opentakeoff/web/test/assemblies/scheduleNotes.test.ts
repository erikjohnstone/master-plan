// ASSEMBLIES WP2 — schedule notes (src/lib/assemblies/scheduleNotes.ts) and
// how the normalizer applies them to the rows that cite them.
import test from "node:test";
import assert from "node:assert/strict";
import { citedNoteIds, noteValues, scheduleNotes, type NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
import { normalizeCompileItem, type CompileItem } from "../../src/lib/assemblies/normalize.ts";

// bldg5406-hvac-demo-mechanical.pdf page 6 as mcp/src/pdf.ts textSpans reads
// it: the sheet is drawn at a quarter turn (every run at rot 90), so the AIR
// TERMINAL BOX SCHEDULE's rows step DOWN in x and its notes sit at lower x
// than its last row (VAV-9).
const R = 90;
const rotatedSheet: NoteSpan[] = [
  { str: "AIR TERMINAL BOX SCHEDULE", x0: 1002.6, y0: 468.6, x1: 1011.5, y1: 603.2, rot: R },
  { str: "VAV-1", x0: 973.9, y0: 68.1, x1: 979.8, y1: 85.2, rot: R },
  { str: "SEE NOTES", x0: 973.9, y0: 621, x1: 979.8, y1: 655, rot: R },
  { str: "VAV-9", x0: 871.9, y0: 67.7, x1: 877.8, y1: 84.7, rot: R },
  { str: "SEE NOTES", x0: 871.9, y0: 621, x1: 877.8, y1: 655, rot: R },
  { str: "NOTES:", x0: 856.9, y0: 45.1, x1: 862.8, y1: 67.3, rot: R },
  { str: "1.", x0: 850.6, y0: 45.2, x1: 856.5, y1: 52.1, rot: R },
  { str: "PROVIDE WALL MOUNTED THERMOSTAT.", x0: 850.6, y0: 62.1, x1: 856.5, y1: 182.5, rot: R },
  { str: "2.", x0: 844.1, y0: 45.2, x1: 850, y1: 52.1, rot: R },
  { str: "PROVIDE ELECTRIC REHEAT COIL.", x0: 844.1, y0: 62.1, x1: 850, y1: 162.7, rot: R },
  // the next schedule's own notes label, far past this table
  { str: "NOTES:", x0: 706.1, y0: 50.3, x1: 712, y1: 72.5, rot: R },
  { str: "1.", x0: 699.8, y0: 50.3, x1: 705.7, y1: 57, rot: R },
  { str: "PROVIDE CONTROL TRANSFORMER AND FLOW SWITCH.", x0: 699.8, y0: 62, x1: 705.7, y1: 240, rot: R },
];
const vavRegion: [number, number, number, number] = [866, 60, 1013, 700];

test("notes past a quarter-turned table are read in the table's own frame", () => {
  assert.deepEqual(scheduleNotes(rotatedSheet, vavRegion), [
    { id: "1", text: "PROVIDE WALL MOUNTED THERMOSTAT." },
    { id: "2", text: "PROVIDE ELECTRIC REHEAT COIL." },
  ]);
});

test("an upright table: the label may carry the first note; continuation lines join; a gap ends the notes", () => {
  const spans: NoteSpan[] = [
    { str: "PUMP SCHEDULE", x0: 100, y0: 90, x1: 300, y1: 100 },
    { str: "P-1", x0: 100, y0: 120, x1: 120, y1: 130 },
    { str: "NOTES: 1. PROVIDE VFD FOR EACH HW AND CW", x0: 95, y0: 140, x1: 400, y1: 150 },
    { str: "PUMP.", x0: 110, y0: 152, x1: 150, y1: 162 },
    { str: "2. CAPACITY BASED ON 70% WATER AND 30% PROPYLENE GLYCOL.", x0: 95, y0: 164, x1: 500, y1: 174 },
    { str: "FAN SCHEDULE", x0: 100, y0: 260, x1: 250, y1: 270 },
  ];
  assert.deepEqual(scheduleNotes(spans, [95, 88, 500, 132]), [
    { id: "1", text: "PROVIDE VFD FOR EACH HW AND CW PUMP." },
    { id: "2", text: "CAPACITY BASED ON 70% WATER AND 30% PROPYLENE GLYCOL." },
  ]);
  assert.deepEqual(scheduleNotes(spans.slice(0, 2), [95, 88, 500, 132]), [], "no label, no notes");
});

test("citations: numbered, ranged, every note, none", () => {
  assert.deepEqual(citedNoteIds("SEE NOTES 1, 2, 4"), { all: false, ids: ["1", "2", "4"] });
  assert.deepEqual(citedNoteIds("NOTE 3"), { all: false, ids: ["3"] });
  assert.deepEqual(citedNoteIds("1-3"), { all: false, ids: ["1", "2", "3"] });
  assert.deepEqual(citedNoteIds("SEE NOTES"), { all: true, ids: [] });
  assert.deepEqual(citedNoteIds("ALL"), { all: true, ids: [] });
  assert.equal(citedNoteIds("PROVIDE DISCONNECT"), null);
  assert.equal(citedNoteIds(""), null);
});

test("what a note states, in its formulaic forms only", () => {
  const attrs = new Set(["vfd", "ecm", "bas_interface", "glycol_pct", "economizer", "heating_type", "filter_merv", "control"]);
  const v = (text: string) => Object.fromEntries(noteValues({ id: "1", text }, attrs).map((x) => [x.attr, x.value]));
  assert.deepEqual(v("PROVIDE VFD FOR EACH FAN. PROVIDE HAND OFF AUTO SWITCH."), { vfd: "yes", control: "VFD FOR EACH FAN. PROVIDE HAND OFF AUTO SWITCH" });
  assert.deepEqual(v("PROVIDE BACnet INTEGRATION CARD"), { bas_interface: "BACNET" });
  assert.deepEqual(v("PROVIDE FACTORY FURNISHED CONTROLLER AND CONNECT TO EXISTING BMS"), { bas_interface: "EXISTING BMS" });
  assert.deepEqual(v("CAPACITY BASED ON 70% WATER AND 30% PROPYLENE GLYCOL"), { glycol_pct: 30 });
  assert.deepEqual(v("CAPACITY BASED ON 100% WATER"), { glycol_pct: 0 });
  assert.deepEqual(v("COMPARATIVE ENTHALPY ECONOMIZER WITH BAROMETRIC RELIEF DAMPER"), { economizer: "airside" });
  assert.deepEqual(v("INDIRECT FIRED NATURAL GAS STAINLESS STEEL FURNACE WITH 16:1 TURNDOWN"), { heating_type: "gas" });
  assert.deepEqual(v("PROVIDE MERV 8 PREFILTER AND MERV 14 FINAL FILTER."), { filter_merv: 14 });
  assert.deepEqual(v("NO VFD REQUIRED"), {});
  assert.deepEqual(v("UNIT TO BE POWERED THROUGH SINGLE POINT CONNECTION"), {});
  assert.deepEqual(noteValues({ id: "1", text: "PROVIDE VFD" }, new Set(["ecm"])), [], "only the family's attributes");
});

const row = (tag: string, table_title: string, cells: Record<string, string>): CompileItem => ({
  tag, sheet_id: "set.pdf#6", table_title,
  cells: Object.fromEntries(Object.entries(cells).map(([h, text]) => [h, { text, bbox: null }])),
});

test("a row gets the notes its REMARKS cell cites; the grid outranks a note", () => {
  const notes = [
    { id: "1", text: "PROVIDE MOTORIZED DAMPER." },
    { id: "2", text: "PROVIDE NEMA-1 TOGGLE SWITCH." },
    { id: "3", text: "PROVIDE SOLID STATE SPEED CONTROL." },
    { id: "4", text: "PROVIDE VFD." },
  ];
  const table = { headers: ["MARK", "CFM", "VFD", "REMARKS"], notes };
  const ef1 = normalizeCompileItem(row("EF-1", "FAN SCHEDULE", { CFM: "165", REMARKS: "SEE NOTES 1, 2, 3" }), "FAN", table);
  assert.equal(ef1.attributes.control.value, "NEMA-1 TOGGLE SWITCH; SOLID STATE SPEED CONTROL");
  assert.equal(ef1.attributes.control.cite.header, "(table note 2)");
  assert.equal(ef1.attributes.vfd, undefined, "note 4 is not cited");
  const ef2 = normalizeCompileItem(row("EF-2", "FAN SCHEDULE", { CFM: "400", VFD: "NO", REMARKS: "SEE NOTES 2, 4" }), "FAN", table);
  assert.equal(ef2.attributes.vfd.value, "no", "the row's own VFD cell outranks note 4");
  const ef3 = normalizeCompileItem(row("EF-3", "FAN SCHEDULE", { CFM: "300", REMARKS: "" }), "FAN", table);
  assert.equal(ef3.attributes.control, undefined, "a citation column that cites nothing applies no note");
});

test("a table with no citation column prints its notes for every row, except one naming only other units", () => {
  const notes = [
    { id: "1", text: "PROVIDE VFD FOR EACH HW AND CW PUMP." },
    { id: "2", text: "P-3 AND P-4: CAPACITY BASED ON 100% WATER." },
  ];
  const table = { headers: ["MARK", "GPM"], notes };
  const p1 = normalizeCompileItem(row("P-1", "PUMP SCHEDULE", { GPM: "40" }), "PUMP", table);
  assert.equal(p1.attributes.vfd.value, "yes");
  assert.equal(p1.attributes.glycol_pct, undefined);
  const p3 = normalizeCompileItem(row("P-3", "PUMP SCHEDULE", { GPM: "40" }), "PUMP", table);
  assert.equal(p3.attributes.glycol_pct.value, 0);
});

// 004_MO_T2504_03…pdf page 39, EXHAUST FAN SCHEDULE: the graph's region
// contains the notes block; the notes run in two columns (1-9, 10-12); a list
// of alternate manufacturers, numbered from 1 again, sits to their right; a
// NOTES column header sits in the header band.
const efRegion: [number, number, number, number] = [2725.66, 1411.68, 4599.76, 1945.22];
const h = 19;
const at = (x0: number, y0: number, x1: number, str: string): NoteSpan => ({ str, x0, y0, x1, y1: y0 + h });
const efSheet: NoteSpan[] = [
  at(3473.3, 1412.6, 3860.5, "EXHAUST FAN SCHEDULE"),
  at(2879.4, 1488.4, 3007.1, "MANUFACTURER"),
  at(4431.6, 1488.4, 4484, "NOTES"),
  at(2740, 1600, 2800, "EF - 1"),
  at(4431.6, 1600, 4560, "SEE NOTES 1, 12"),
  at(2736.2, 1707.9, 2792.9, "NOTES:"),
  at(2736.2, 1730.8, 2748.9, "1."), at(2776.8, 1730.8, 2950.9, "STEEL WEATHERHOOD"),
  at(3479.6, 1731.5, 3500.7, "10."), at(3520.1, 1731.5, 3701, "CEILING MOUNTED FAN."),
  at(2736.2, 1753.7, 2748.9, "2."), at(2776.8, 1753.7, 2948.7, "1\" DRAIN CONNECTION"),
  at(3479.6, 1754.4, 3500.7, "11."), at(3520.1, 1754.4, 3889.6, "SIDEWALL TERMINATION KIT WITH BIRD SCREEN."),
  at(2736.2, 1776.6, 2748.9, "3."), at(2776.8, 1776.6, 3257.4, "1\" DIRECT MOUNT ISOLATORS, ISOLATOR SPRING, RESTRAINED"),
  at(3479.6, 1777.3, 3500.7, "12."), at(3520.1, 1777.3, 3753.5, "ECM VARIABLE SPEED MOTOR."),
  at(2736.2, 1799.5, 2748.9, "4."), at(2776.8, 1799.5, 3306, "NEMA PREMIUM EFFICIENT MOTOR AND VARIABLE FREQUENCY DRIVE"),
  at(4245.6, 1835.1, 4588, "ALTERNATE EXHAUST FAN MANUFACTURERS"),
  at(4259.1, 1858, 4271.8, "1."), at(4299.7, 1858, 4401.1, "LOREN COOK"),
  at(2736.2, 1845.3, 2748.9, "6."), at(2776.8, 1845.3, 3084.7, "HIGH TEMP CURB SEAL RATED AT 1500°F"),
];

test("a notes block inside the table's region, in two columns, beside a list of manufacturers", () => {
  const notes = scheduleNotes(efSheet, efRegion);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3", "4", "6", "10", "11", "12"]);
  assert.equal(notes.find((n) => n.id === "4")?.text, "NEMA PREMIUM EFFICIENT MOTOR AND VARIABLE FREQUENCY DRIVE");
  assert.equal(notes.find((n) => n.id === "12")?.text, "ECM VARIABLE SPEED MOTOR.");
  assert.ok(!notes.some((n) => /LOREN COOK/.test(n.text)), "the manufacturers list is not a note");
});

test("a VFD note is the fan's or motor's, never a compressor's own drive", () => {
  const attrs = new Set(["vfd"]);
  const v = (text: string) => noteValues({ id: "1", text }, attrs).map((x) => x.value);
  assert.deepEqual(v("VARIABLE SPEED COMPRESSOR WITH FACTORY VFD."), []);
  assert.deepEqual(v("DIRECT DRIVE, VARIABLE SPEED PLENUM BLOWER WITH FACTORY VFD."), ["yes"]);
  assert.deepEqual(v("INVERTER DUTY MOTOR."), ["yes"]);
});
