// ASSEMBLIES WP2 — schedule notes (src/lib/assemblies/scheduleNotes.ts) and
// how the normalizer applies them to the rows that cite them.
import test from "node:test";
import assert from "node:assert/strict";
import { citedCodeLegend, citedNoteIds, controlItems, ecmOrDrive, noteValues, scheduleLegend, scheduleNotes, type NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
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
  // A range printed with an en dash (AS-72).
  assert.deepEqual(citedNoteIds("1–4, 16"), { all: false, ids: ["1", "2", "3", "4", "16"] });
  assert.deepEqual(citedNoteIds("1-3"), { all: false, ids: ["1", "2", "3"] });
  assert.deepEqual(citedNoteIds("SEE NOTES"), { all: true, ids: [] });
  assert.deepEqual(citedNoteIds("ALL"), { all: true, ids: [] });
  assert.equal(citedNoteIds("PROVIDE DISCONNECT"), null);
  assert.equal(citedNoteIds(""), null);
});

test("what a note states, in its formulaic forms only", () => {
  const attrs = new Set(["vfd", "ecm", "bas_interface", "glycol_pct", "economizer", "heating_type", "filter_merv", "control"]);
  const v = (text: string) => Object.fromEntries(noteValues({ id: "1", text }, attrs).map((x) => [x.attr, x.value]));
  assert.deepEqual(v("PROVIDE VFD FOR EACH FAN. PROVIDE HAND OFF AUTO SWITCH."), { vfd: "yes", control: "HAND OFF AUTO SWITCH" });
  assert.deepEqual(v("PROVIDE BACnet INTEGRATION CARD"), { bas_interface: "BACNET" });
  assert.deepEqual(v("PROVIDE FACTORY FURNISHED CONTROLLER AND CONNECT TO EXISTING BMS"), { bas_interface: "EXISTING BMS" });
  assert.deepEqual(v("ADDITIONAL CONTROL POINTS SHALL BE ADDED TO EXISTING DDC SYSTEM."), {}, "points added to a system are not the unit's interface");
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

test("a row gets the notes its REMARKS cell cites; a cited note that contradicts the row's cell leaves it unknown", () => {
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
  // 14_OR's SP-1: MOTOR CONTROL "ECM" while its NOTES cite note 1, "INTEGRATED
  // VFD" (the key: not one value).
  const ef2 = normalizeCompileItem(row("EF-2", "FAN SCHEDULE", { CFM: "400", VFD: "NO", REMARKS: "SEE NOTES 2, 4" }), "FAN", table);
  assert.equal(ef2.attributes.vfd, undefined, "the row's VFD cell and the note it cites disagree");
  assert.match(ef2.unknown.vfd.reason, /state it differently/);
  const ef3 = normalizeCompileItem(row("EF-3", "FAN SCHEDULE", { CFM: "300", REMARKS: "" }), "FAN", table);
  assert.equal(ef3.attributes.control, undefined, "a citation column that cites nothing applies no note");
});

test("a table with no citation column prints its notes for every row, except one naming only other units", () => {
  const notes = [
    { id: "1", text: "PROVIDE VFD FOR EACH PUMP." },
    { id: "2", text: "P-3 AND P-4: CAPACITY BASED ON 100% WATER." },
  ];
  const table = { headers: ["MARK", "GPM"], notes };
  const p1 = normalizeCompileItem(row("P-1", "PUMP SCHEDULE", { GPM: "40" }), "PUMP", table);
  assert.equal(p1.attributes.vfd.value, "yes");
  assert.equal(p1.attributes.glycol_pct, undefined);
  const p3 = normalizeCompileItem(row("P-3", "PUMP SCHEDULE", { GPM: "40" }), "PUMP", table);
  assert.equal(p3.attributes.glycol_pct.value, 0);
});

// federal-mech PUMP SCHEDULE: note 1 "PROVIDE VFD FOR EACH HW AND CW PUMP."
// over pumps whose SYSTEM is HOT WATER, CHILLED WATER, CONDENSATE or a unit's
// tag; the REMARKS column prints remarks, never a citation.
test("a note naming services speaks for the rows of those services; remarks that cite nothing are no citation column", () => {
  const notes = [{ id: "1", text: "PROVIDE VFD FOR EACH HW AND CW PUMP." }];
  const rows = [
    { key: "CWP-1", cells: { MARK: "CWP-1", SYSTEM: "CHILLED WATER", REMARKS: "BASE-MOUNTED" } },
    { key: "HWP-1", cells: { MARK: "HWP-1", SYSTEM: "HOT WATER", REMARKS: "BASE-MOUNTED" } },
    { key: "CP-1", cells: { MARK: "CP-1", SYSTEM: "CONDENSATE", REMARKS: "CONDENSATE PUMP" } },
    { key: "HWRP-1", cells: { MARK: "HWRP-1", SYSTEM: "AHU-1", REMARKS: "IN-LINE" } },
  ];
  const table = { headers: ["MARK", "SYSTEM", "GPM", "REMARKS"], notes, rows };
  const vfd = (r: (typeof rows)[number]) => normalizeCompileItem(row(r.key, "PUMP SCHEDULE", { SYSTEM: r.cells.SYSTEM, GPM: "40", REMARKS: r.cells.REMARKS }), "PUMP", table).attributes.vfd?.value;
  assert.deepEqual(rows.map(vfd), ["yes", "yes", undefined, undefined]);
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

test("a control note gives the devices it provides, not the whole note; a disconnect is not a control", () => {
  assert.deepEqual(controlItems("PROVIDE UNIT WITH MANUFACTURER'S ALUMINUM ROOF CAP (FLAT ROOF) EQUAL TO COOK MODEL PR (W/ INTEGRAL BIRD SCREEN AND ROOF CURB), BACKDRAFT DAMPER, STANDARD PLUG DISCONNECT, PRE-WIRED FAN SPEED CONTROLLER, AND OUTLET FLEX DUCT CONNECTION."),
    ["PRE-WIRED FAN SPEED CONTROLLER"]);
  assert.deepEqual(controlItems("PROVIDE UNIT WITH ROOF CURB, THERMAL OVERLOAD PROTECTION, PRE-WIRED NEMA 3R ELECTRICAL DISCONNECT SWITCH, AND INTEGRAL BIRD SCREEN"), []);
  assert.deepEqual(controlItems("ELECTRICAL TO PROVIDE DISCONNECT SWITCH."), []);
  assert.deepEqual(controlItems("INSTALL INLINE FAN IN EXISTING EQUIPMENT VENT DUCT. PROVIDE WALL MOUNTED MANUAL SWITCH."), ["WALL MOUNTED MANUAL SWITCH"]);
  assert.deepEqual(controlItems("PROVIDE TWO SPEED FAN AND WALL MOUNTED THERMOSTAT."), ["TWO SPEED FAN AND WALL MOUNTED THERMOSTAT"]);
  assert.deepEqual(controlItems("FAN SHALL RUN WITH LIGHT SWITCH"), ["LIGHT SWITCH"]);
});

test("a VFD note is the fan's or motor's, never a compressor's own drive", () => {
  const attrs = new Set(["vfd"]);
  const v = (text: string) => noteValues({ id: "1", text }, attrs).map((x) => x.value);
  assert.deepEqual(v("VARIABLE SPEED COMPRESSOR WITH FACTORY VFD."), []);
  assert.deepEqual(v("DIRECT DRIVE, VARIABLE SPEED PLENUM BLOWER WITH FACTORY VFD."), ["yes"]);
  // A motor rated for a drive is built to run on one; alone it does not say
  // one runs it (012_MO's pumps), beside a variable-speed fan it does (004_MO's
  // notes 1 and 2, here in one note; across two notes, the normalizer).
  assert.deepEqual(v("INVERTER DUTY MOTOR."), []);
  assert.deepEqual(v("PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING."), []);
  assert.deepEqual(v("PROVIDE UNIT WITH VFD RATED MOTOR WITH SHAFT GROUNDING."), []);
  assert.deepEqual(v("VARIABLE SPEED, DIRECT DRIVE SUPPLY FAN. INVERTER DUTY MOTOR."), ["yes"]);
  assert.deepEqual(v("EXISTING VFDs ARE TO BE REUSED FOR CONTROL OF NEW TOWERS."), ["yes"]);
});

test("dev 3: EC motors or VFDs offered as alternatives state neither; the row's own choice decides, and rules out the other", () => {
  const attrs = new Set(["vfd", "ecm"]);
  const v = (text: string) => noteValues({ id: "1", text }, attrs).map((x) => `${x.attr}=${x.value}`);
  assert.deepEqual(v("PROVIDE FANS WITH EC MOTORS (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES."), []);
  assert.deepEqual(v("PROVIDE VFD OR ECM FOR EACH FAN."), []);
  assert.deepEqual(v("PROVIDE EC MOTOR. PROVIDE VFD FOR EXHAUST FAN."), ["vfd=yes", "ecm=yes"]);
  assert.ok(ecmOrDrive("PROVIDE FANS WITH EC MOTORS (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES"));
  assert.ok(!ecmOrDrive("PROVIDE EC MOTOR AND VFD"));
  // 25_WA's relief fans: note 1 offers both, each row's REMARKS names one.
  const notes = [{ id: "1", text: "PROVIDE FANS WITH EC MOTORS (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES." }];
  // No row's REMARKS cites a note, so the table's note speaks for every row.
  const rows = [
    { key: "REF-1", cells: { CFM: "7300", REMARKS: "MAX INLET 17.4 SONES W/ VFD" } },
    { key: "REF-2", cells: { CFM: "2900", REMARKS: "MAX INLET 21.0 SONES W/ ECM" } },
  ];
  const fan = (tag: string, remark: string) => {
    const item: CompileItem = { tag, sheet_id: "set.pdf#4", table_title: "FAN SCHEDULE", cells: { CFM: { text: "7300", bbox: null }, REMARKS: { text: remark, bbox: null } } };
    const n = normalizeCompileItem(item, "FAN", { headers: ["CFM", "REMARKS"], notes, rows });
    return [n.attributes.vfd?.value, n.attributes.ecm?.value];
  };
  assert.deepEqual(fan("REF-1", "MAX INLET 17.4 SONES W/ VFD"), ["yes", "no"]);
  assert.deepEqual(fan("REF-2", "MAX INLET 21.0 SONES W/ ECM"), ["no", "yes"]);
  assert.deepEqual(fan("REF-3", "MAX INLET 9.0 SONES"), [undefined, undefined]);
});

test("dev 3: a drive-rated motor in one note and a variable-speed fan in another is a VFD; either alone is not", () => {
  const item: CompileItem = { tag: "SF-1", sheet_id: "set.pdf#4", table_title: "SUPPLY FAN SCHEDULE", cells: { CFM: { text: "1200", bbox: null } } };
  const vfd = (notes: Array<{ id: string; text: string }>) => normalizeCompileItem(item, "FAN", { headers: ["CFM"], notes }).attributes.vfd?.value;
  assert.equal(vfd([{ id: "1", text: "VARIABLE SPEED, DIRECT DRIVE SUPPLY FAN." }, { id: "2", text: "INVERTER DUTY MOTOR." }]), "yes");
  assert.equal(vfd([{ id: "2", text: "INVERTER DUTY MOTOR." }]), undefined);
  assert.equal(vfd([{ id: "1", text: "VARIABLE SPEED, DIRECT DRIVE SUPPLY FAN." }]), undefined);
  assert.equal(vfd([{ id: "1", text: "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." }]), undefined);
});

test("dev 3: a central controller the units connect to is their interface; BACnet spelled BACKNET is BACnet; an N-speed motor's speeds", () => {
  const v = (text: string, attrs: string[]) => noteValues({ id: "5", text }, new Set(attrs)).map((x) => `${x.attr}=${x.value}`);
  assert.deepEqual(v("PROVIDE AND CONNECT ALL INDOOR UNITS TO A CENTRAL AE - 200A CONTROLLER.", ["bas_interface"]), ["bas_interface=CENTRAL AE-200A CONTROLLER"]);
  assert.deepEqual(v("PROVIDE AND CONNECT ALL OUTDOOR UNITS TO A SINGLE CENTRAL AE - 200A CONTROLLER.", ["bas_interface"]), ["bas_interface=CENTRAL AE-200A CONTROLLER"]);
  assert.deepEqual(v("PROVIDE A CENTRAL CONTROLLER FOR THE SYSTEM.", ["bas_interface"]), []);
  assert.deepEqual(v("DOAS UNIT TO BE PROVIDED WITH FACTORY CONTROLS WITH BACKNET INTERFACE. SEE DOAS UNIT SPECIFICATIONS.", ["bas_interface"]), ["bas_interface=BACNET"]);
  assert.deepEqual(v("PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER.", ["fan_speeds", "ecm"]), ["ecm=yes", "fan_speeds=3"]);
  assert.deepEqual(v("PROVIDE THREE SPEED FAN SWITCH.", ["fan_speeds"]), ["fan_speeds=3"]);
  assert.deepEqual(v("PROVIDE 2 SPEED COMPRESSOR.", ["fan_speeds"]), []);
  assert.deepEqual(v("PROVIDE FAN SPEED CONTROLLER.", ["fan_speeds"]), []);
});

test("dev 3: a control list's last two items joined by AND keep only the control device", () => {
  assert.deepEqual(controlItems("PROVIDE FACTORY-INSTALLED DISCONNECT SWITCH, INTEGRAL FAN SPEED CONTROLLER AND BIRD SCREEN."), ["INTEGRAL FAN SPEED CONTROLLER"]);
  assert.deepEqual(controlItems("PROVIDE TWO SPEED FAN AND WALL MOUNTED THERMOSTAT."), ["TWO SPEED FAN AND WALL MOUNTED THERMOSTAT"]);
});

test("dev 3: an unlabeled numbered list inside the table at its left edge is the table's notes; the header band past a gap is not", () => {
  // 096_IN's AHU index (page 19): notes 1-4 between the title and the header
  // band, with no NOTES / REMARKS label.
  const spans: NoteSpan[] = [
    { str: "AIR HANDLING UNIT SYSTEM INDEX SCHEDULE", x0: 2400, y0: 160, x1: 3300, y1: 190 },
    { str: "1. AHU TO HAVE SINGLE POINT CONNECTION FOR 460/3 POWER AND A SEPARATE CONNECTION FOR 120/1.", x0: 232, y0: 271, x1: 1197, y1: 290 },
    { str: "2. MOUNT AHU ON MINIMUM 6\" HIGH CONCRETE PAD WHICH EXTENDS 6\" BEYOND PERIMETER OF AHU.", x0: 232, y0: 292, x1: 1158, y1: 310 },
    { str: "3. UNIT IS REQUIRED TO BE BUILT TO PRECISE OUTER DIMENSIONS AS NOTED ON SHEET M-507.", x0: 232, y0: 313, x1: 1747, y1: 331 },
    { str: "4. DOAS UNIT TO BE PROVIDED WITH FACTORY CONTROLS WITH BACKNET INTERFACE. SEE DOAS UNIT SPECIFICATIONS.", x0: 232, y0: 333, x1: 1329, y1: 352 },
    { str: "MARK", x0: 240, y0: 404, x1: 320, y1: 422 },
    { str: "LOCATION", x0: 513, y0: 404, x1: 621, y1: 422 },
    { str: "AHU-4", x0: 240, y0: 560, x1: 330, y1: 578 },
    { str: "1,2,3,4", x0: 5321, y0: 560, x1: 5423, y1: 578 },
  ];
  const notes = scheduleNotes(spans, [227, 134, 5450, 627]);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3", "4"]);
  assert.equal(notes[3].text, "DOAS UNIT TO BE PROVIDED WITH FACTORY CONTROLS WITH BACKNET INTERFACE. SEE DOAS UNIT SPECIFICATIONS.");
  // A table whose rows happen to hold one numbered line is not a notes list.
  assert.deepEqual(scheduleNotes([
    { str: "1. SEE PLANS FOR LOCATION OF ALL UNITS", x0: 232, y0: 271, x1: 900, y1: 290 },
    { str: "MARK", x0: 240, y0: 404, x1: 320, y1: 422 },
  ], [227, 134, 5450, 627]), []);
});

test("a block labelled REMARKS: is read like NOTES:; a REMARKS column header is not a label; a note naming makers is not a list", () => {
  const spans: NoteSpan[] = [
    { str: "NEW PUMP SCHEDULE", x0: 2500, y0: 860, x1: 2900, y1: 880 },
    { str: "REMARKS", x0: 4393, y0: 878, x1: 4480, y1: 896 },
    { str: "HWP-1", x0: 2560, y0: 1000, x1: 2620, y1: 1018 },
    { str: "1 , 2 , 3 , 4", x0: 4393, y0: 1000, x1: 4480, y1: 1018 },
    { str: "REMARKS:", x0: 2555, y0: 1407, x1: 2640, y1: 1425 },
    { str: "3.", x0: 2575, y0: 1543, x1: 2590, y1: 1561 },
    { str: "CAPACITY BASED ON 70% WATER AND 30% PROPYLENE GLYCOL.", x0: 2610, y0: 1543, x1: 3200, y1: 1561 },
    { str: "1.", x0: 2575, y0: 1433, x1: 2590, y1: 1451 },
    { str: "APPROVED ALTERNATE MANUFACTURERS: B&G, GRUNDFOS, TACO.", x0: 2610, y0: 1433, x1: 3300, y1: 1451 },
    { str: "2.", x0: 2575, y0: 1488, x1: 2590, y1: 1506 },
    { str: "PROVIDE SUCTION DIFFUSER.", x0: 2610, y0: 1488, x1: 2900, y1: 1506 },
  ];
  const notes = scheduleNotes(spans, [2550, 860, 4500, 1400]);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3"]);
  assert.equal(notes[2].text, "CAPACITY BASED ON 70% WATER AND 30% PROPYLENE GLYCOL.");
  assert.equal(notes[0].text, "APPROVED ALTERNATE MANUFACTURERS: B&G, GRUNDFOS, TACO.", "a note naming makers is a note, not a list heading");
});

// 094_FL…pdf page 8, Air Handling Unit Schedule: a components legend holds the
// table's lower-left corner, the NOTES: label sits beside it, the notes run in
// two columns, and a sound-power table sits right of the second column.
const ahuRegion: [number, number, number, number] = [300.48, 133.2, 5281.42, 532.56];
const ahuSheet: NoteSpan[] = [
  at(1500, 140, 2000, "Air Handling Unit Schedule CHW"),
  at(334, 584, 505, "Comopnents Legend"), at(1326, 584, 1395, "NOTES:"),
  at(3695, 597, 4620, "MAXIMUM PERMISSIBLE SOUND POWER LEVELS SCHEDULE - CENTRAL STATION AIR HANDLING UNITS"),
  at(334, 624, 357, "PF"), at(406, 624, 518, "- PREFILTER"), at(853, 624, 903, "MXB2"), at(925, 624, 1184, "- MIXING BOX SECTION WITH"),
  at(1369, 624, 2177, "1. UNIT SIZES AND EQUIPMENT SELECTIONS BASED ON TRANE."),
  at(2468, 624, 2484, "7."), at(2504, 624, 3075, "FILTER EFFICIENCIES BASED ON ASHRAE 52-76 TEST METHOD."),
  at(4129, 633, 4185, "AHU-4"), at(4215, 633, 4270, "AHU-5"),
  at(334, 645, 356, "FF"), at(406, 645, 538, "- FINAL FILTER"), at(935, 645, 1203, "RA MOTORIZED DAMPER AND"),
  at(2468, 645, 2484, "8."), at(2504, 645, 3251, "COOLING COILS SHALL BE RECONNECTED TO EXISTING 3-WAY CONTROL VALVES."),
  at(3711, 651, 3992, "MAX. PWL AT UNIT DISCHARGE"), at(4050, 651, 4100, "63 HZ"), at(4147, 651, 4167, "85"),
  at(334, 666, 374, "HCS"), at(406, 666, 692, "- ELEC. HEATING COIL SECTION"), at(935, 666, 1161, "OA MOTORIZED DAMPER"),
  at(1369, 666, 2286, "2. MOTORS SHALL BE 3 PHASE, 1800 RPM."),
  at(334, 686, 359, "HF"), at(406, 686, 707, "- ELECTRIC HUMIDIFIER SECTION"),
];

test("a notes label beside a legend; the legend itself; a table beside the notes is not note text", () => {
  const notes = scheduleNotes(ahuSheet, ahuRegion);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "7", "8"]);
  assert.equal(notes.find((n) => n.id === "7")?.text, "FILTER EFFICIENCIES BASED ON ASHRAE 52-76 TEST METHOD.");
  assert.equal(notes.find((n) => n.id === "8")?.text, "COOLING COILS SHALL BE RECONNECTED TO EXISTING 3-WAY CONTROL VALVES.");
  assert.ok(!notes.some((n) => /PREFILTER|MIXING BOX|AHU-4|PWL/.test(n.text)), "neither the legend nor the sound table is note text");
  assert.deepEqual(scheduleLegend(ahuSheet, ahuRegion), {
    PF: "PREFILTER", MXB2: "MIXING BOX SECTION WITH RA MOTORIZED DAMPER AND OA MOTORIZED DAMPER",
    FF: "FINAL FILTER", HCS: "ELEC. HEATING COIL SECTION", HF: "ELECTRIC HUMIDIFIER SECTION",
  });
});

// federal-attachment4-mechanical.pdf page 14, CHILLER SCHEDULE: the notes'
// second column runs past the next table's title, printed to their right.
test("another table's title beside the notes is skipped, not the end of them", () => {
  const region: [number, number, number, number] = [867.6, 1325.28, 5376.22, 1572.7];
  const sheet: NoteSpan[] = [
    at(2500, 1330, 3200, "CHILLER SCHEDULE (ELECTRIC AIR-COOLED)"),
    at(879, 1642, 940, "NOTES:"),
    at(879, 1664, 893, "1."), at(910, 1664, 1127, "PROVIDE THE FOLLOWING:"),
    at(1311, 1664, 1325, "3."), at(1342, 1664, 1644, "CHILLER SHALL EXCEED ASHRAE 90.1"),
    at(940, 1685, 1282, "- LOW AMBIENT OPERATION DOWN TO 0°F."),
    at(1311, 1750, 1325, "4."), at(1342, 1750, 1763, "PROVIDE HARDWIRE INTERFACE BETWEEN CHILLER"),
    at(3320, 1768, 4456, "HOT WATER CONDENSING BOILER SCHEDULE"),
    at(1342, 1772, 1614, "PANEL AND SITE DDC CONTROLS."),
    at(879, 1794, 893, "2."), at(910, 1794, 1300, "PROVIDE CONDENSER COIL GUARDS."),
  ];
  const notes = scheduleNotes(sheet, region);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3", "4"]);
  assert.equal(notes.find((n) => n.id === "4")?.text, "PROVIDE HARDWIRE INTERFACE BETWEEN CHILLER PANEL AND SITE DDC CONTROLS.");
  assert.deepEqual(noteValues(notes.find((n) => n.id === "4")!, new Set(["bas_interface"])).map((v) => v.value), ["HARDWIRE"]);
});

// itd-d1-lab-mechanical.pdf page 13, LAB EXHAUST FAN SCHEDULE note 2: a
// sub-list numbered "2.1.3." and "(2)" inside note 2.
test("a sub-list in another numbering style stays in its note", () => {
  const region: [number, number, number, number] = [100, 100, 2000, 400];
  const sheet: NoteSpan[] = [
    at(110, 105, 600, "LAB EXHAUST FAN SCHEDULE"),
    at(110, 420, 180, "NOTES:"),
    at(110, 442, 125, "1."), at(150, 442, 900, "PROVIDE FAN WITH FRP CONSTRUCTION."),
    at(110, 464, 125, "2."), at(150, 464, 1100, "CONTRACTOR SHALL PROVIDE AND INSTALL THE FOLLOWING:"),
    at(190, 486, 240, "2.1.3."), at(260, 486, 300, "(2)"), at(320, 486, 800, "VARIABLE FREQUENCY DRIVES (NEMA 3R)"),
    at(110, 508, 125, "3."), at(150, 508, 900, "THE AIR BALANCING CONTRACTOR SHALL CONFIRM THE SET POINT."),
  ];
  const notes = scheduleNotes(sheet, region);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3"]);
  assert.equal(notes[1].text, "CONTRACTOR SHALL PROVIDE AND INSTALL THE FOLLOWING: 2.1.3. (2) VARIABLE FREQUENCY DRIVES (NEMA 3R)");
  assert.deepEqual(noteValues(notes[1], new Set(["vfd"])).map((v) => v.value), ["yes"]);
});

// 040_IL…pdf page 47: SCHEDULE GENERAL NOTES at the sheet's right edge, notes
// lettered A-G; the FAN SCHEDULE's header cites NOTE C for its codes.
test("the codes a header's cited note defines, confirmed by the note naming the column", () => {
  const sheet: NoteSpan[] = [
    at(5203, 239, 5758, "SCHEDULE GENERAL NOTES:"),
    at(5159, 295, 5736, "A. DISCONNECT AND CONTROLLER STARTER FURNISHED AND"), at(5159, 316, 5297, "INSTALLED BY:"),
    at(5159, 337, 5378, "MFR = MANUFACTURER"), at(5159, 358, 5465, "EC = ELECTRICAL CONTRACTOR."),
    at(5159, 380, 5757, "MC = FURNISHED BY MECHANICAL CONTRACTOR, INSTALLED BY"), at(5159, 401, 5418, "ELECTRICAL CONTRACTOR."),
    at(5159, 511, 5365, "B. DISCONNECT TYPE:"), at(5159, 532, 5256, "F = FUSED"), at(5159, 553, 5317, "NF = NON-FUSED"),
    at(5159, 592, 5463, "C. CONTROLLER STARTER TYPE:"), at(5159, 613, 5344, "FV = FULL VOLTAGE"),
    at(5159, 634, 5332, "WYE = WYE-DELTA"), at(5159, 656, 5462, "SS = SOLID STATE (SOFT START)"),
    at(5159, 698, 5495, "VFD = VARIABLE FREQUENCY DRIVE"),
    at(5159, 765, 5790, "D. FAN RPM SHALL NOT EXCEED 110% OF SCHEDULED VALUE, WITH"),
  ];
  assert.deepEqual(citedCodeLegend(sheet, "ELECTRICAL (NOTE 1) CONTROLLER/ STARTER TYPE (NOTE C)"),
    { FV: "FULL VOLTAGE", WYE: "WYE-DELTA", SS: "SOLID STATE (SOFT START)", VFD: "VARIABLE FREQUENCY DRIVE" });
  assert.equal(citedCodeLegend(sheet, "ELECTRICAL (NOTE 1) CONTROLLER/ STARTER BY (NOTE A)")?.MC, "FURNISHED BY MECHANICAL CONTRACTOR, INSTALLED BY ELECTRICAL CONTRACTOR");
  assert.equal(citedCodeLegend(sheet, "FAN RPM (NOTE D)"), null, "a note that defines no codes");
  assert.equal(citedCodeLegend(sheet, "CURB TYPE (NOTE C)"), null, "a note that does not name the column");
  assert.equal(citedCodeLegend(sheet, "CONTROLLER/ STARTER TYPE"), null, "a header citing no note");
});

// ── AS-17: note forms from the second dev tier (each from a dev-2 table) ────

test("a BAS interface: BACnet's variant, a named interface, the system a controller interfaces with; never a component's connection", () => {
  const bas = (text: string) => noteValues({ id: "1", text }, new Set(["bas_interface"]))[0]?.value;
  assert.equal(bas("PROVIDE WITH BACNET MSTP OPTION FOR INTEGRATION INTO BAS. PROVIDE WITH FLOW SWITCH."), "BACNET MSTP"); // 14_OR
  assert.equal(bas("PROVIDE BACnet INTEGRATION CARD"), "BACNET"); // itd-d1-lab
  assert.equal(bas("PROVIDE BMS GATEWAY INTERFACE AND CONNECT TO DDC SYSTEM."), "BMS GATEWAY"); // 03_FL
  assert.equal(bas("PROVIDE WITH ABB INTERFACE FOR INTEGRATION."), "ABB"); // 088_AZ
  assert.equal(bas("CONTROLLER SHALL INTERFACE WITH BUILDING AUTOMATION SYSTEM."), "BUILDING AUTOMATION SYSTEM"); // 047_NC
  assert.equal(bas("PROVIDE FACTORY FURNISHED CONTROLLER AND CONNECT TO EXISTING BMS"), "EXISTING BMS"); // 094_FL
  assert.equal(bas("FACTORY INSTALLED AIR PURIFICATION SYSTEM. CONNECT TO BAS SYSTEM TO MONITOR STATUS AND PROVIDE ALARM."), undefined, "a component's connection");
  assert.equal(bas("PROVIDE A COMMUNICATION INTERFACE."), undefined, "no name");
});

test("a loop's glycol by the sentence's system; 100% outside air; the energy recovery type; coil rows", () => {
  const b = { id: "B", text: "CHILLED WATER SYSTEM IS 40% PROPYLENE GLYCOL. HOT WATER SYSTEM IS WATER ONLY." };
  const glycol = (service: string | null) => noteValues(b, new Set(["glycol_pct"]), service)[0]?.value;
  assert.deepEqual([glycol("CHILLED WATER"), glycol("PRIMARY HW"), glycol("SNOWMELT"), glycol(null)], [40, 0, undefined, undefined]); // 14_OR
  assert.equal(noteValues({ id: "1", text: "SYSTEM IS 30% PROPYLENE GLYCOL." }, new Set(["glycol_pct"]))[0]?.value, 30, "a sentence naming no system speaks for every row");
  const doas = noteValues({ id: "2", text: "100% OSA UNIT WITH STATIC PLATE ENERGY RECOVERY." }, new Set(["outdoor_air_pct", "energy_recovery"]));
  assert.deepEqual(doas.map((v) => [v.attr, v.value]), [["outdoor_air_pct", 100], ["energy_recovery", "plate"]]);
  assert.equal(noteValues({ id: "1", text: "UNIT SHALL BE ENTHALPY WHEEL TYPE." }, new Set(["energy_recovery"]))[0]?.value, "wheel"); // 16_NV
  assert.equal(noteValues({ id: "1", text: "UNIT WITHOUT ENERGY RECOVERY WHEEL." }, new Set(["energy_recovery"]))[0], undefined);
  const rows = noteValues({ id: "11", text: "PROVIDE MINIMUM 8-ROW COOLING COILS AND 1-ROW HEATING COILS." }, new Set(["chw_rows", "hw_rows"]));
  assert.deepEqual(rows.map((v) => [v.attr, v.value]), [["chw_rows", 8], ["hw_rows", 1]]); // 03_FL
});

test("a control note: what the unit is interlocked with; the device without its purpose", () => {
  assert.deepEqual(controlItems("INTERLOCK FAN WITH SMOKE CONTROL PANEL LOCATED IN XXX ROOM."), ["INTERLOCK WITH SMOKE CONTROL PANEL"]); // 088_AZ
  assert.deepEqual(controlItems("INTERLOCK WITH HOOD EXHAUST FAN."), ["INTERLOCK WITH HOOD EXHAUST FAN"]); // 03_FL
  assert.deepEqual(controlItems("PROVIDE FANS WITH SPEED CONTROLLER FOR AIR FLOW BALANCING. MOUNT CONTROLLER WITHIN FAN HOUSING."), ["SPEED CONTROLLER"]);
  assert.deepEqual(controlItems("INTERLOCK AHU'S TO ENABLE FAN SHUTDOWN UPON AN INDICATION OF ALARM."), [], "no WITH: nothing it is interlocked with");
});

test("a second list printed under the first (GENERAL NOTES, then NOTES); a label a little apart from its list", () => {
  // 14_OR page 3, the HYDRONIC PUMPS notes.
  const spans: NoteSpan[] = [
    { str: "CHP-1", x0: 400, y0: 480, x1: 450, y1: 500 },
    { str: "GENERAL NOTES:", x0: 393.4, y0: 534.5, x1: 539.7, y1: 555.1 },
    { str: "A. EFFICIENCY LISTED IS WIRE TO WATER EFFICIENCY.", x0: 460.1, y0: 561.6, x1: 910.2, y1: 582.2 },
    { str: "B. CHILLED WATER SYSTEM IS 40% PROPYLENE GLYCOL. HOT WATER SYSTEM IS WATER ONLY.", x0: 460.8, y0: 591.6, x1: 1248.4, y1: 612.2 },
    { str: "NOTES:", x0: 393.4, y0: 621.6, x1: 456.2, y1: 642.2 },
    { str: "1. PROVIDE WITH INVERTER DUTY MOTOR AND INTEGRATED VFD.", x0: 461.5, y0: 651.6, x1: 1019.7, y1: 672.2 },
  ];
  assert.deepEqual(scheduleNotes(spans, [390, 300, 1500, 510]).map((n) => n.id), ["A", "B", "1"]);
  // 044_NY page 21, the FAN SCHEDULE: its NOTES label sits almost three lines above note 1.
  const apart: NoteSpan[] = [
    { str: "EF-7", x0: 500, y0: 1885.5, x1: 540, y1: 1904.4 },
    { str: "NOTES", x0: 499.9, y0: 1945.7, x1: 564.6, y1: 1964.6 },
    { str: "1. ALL SELECTIONS ARE BASED ON AN ALTITUDE OF 200 FEET.", x0: 499.9, y0: 2018, x1: 1074.2, y1: 2036.9 },
    { str: "4. PROVIDE VFD (BY DIV 26)", x0: 499.9, y0: 2039.1, x1: 751.7, y1: 2058 },
  ];
  assert.deepEqual(scheduleNotes(apart, [490, 1500, 3000, 1910]).map((n) => n.id), ["1", "4"]);
});

test("notes no row cites are the table's own; a cited note against the row's cell; a remark that is the motor's starter", () => {
  const notes = [
    { id: "1", text: "PROVIDE WITH INVERTER DUTY MOTOR AND INTEGRATED VFD." },
    { id: "A", text: "EFFICIENCY LISTED IS WIRE TO WATER EFFICIENCY." },
    { id: "B", text: "CHILLED WATER SYSTEM IS 40% PROPYLENE GLYCOL. HOT WATER SYSTEM IS WATER ONLY." },
  ];
  const cells = (service: string, control: string, cites: string) => ({ SERVICE: service, "MOTOR CONTROL": control, NOTES: cites });
  const rows = [
    { key: "CHP-1", cells: cells("CHILLED WATER", "VFD", "1,2") },
    { key: "BP-1", cells: cells("PRIMARY HW", "ECM", "2") },
    { key: "SP-1", cells: cells("SNOWMELT", "ECM", "1,2") },
  ];
  const table = { headers: ["MARK", "SERVICE", "MOTOR CONTROL", "NOTES"], notes, rows };
  const pump = (r: typeof rows[number]) => normalizeCompileItem(row(r.key, "HYDRONIC PUMPS", r.cells), "PUMP", table);
  const [chp, bp, sp] = rows.map(pump);
  assert.deepEqual([chp.attributes.vfd?.value, chp.attributes.glycol_pct?.value], ["yes", 40]);
  assert.deepEqual([bp.attributes.vfd?.value, bp.attributes.glycol_pct?.value], ["no", 0], "note B, cited by no row, speaks for every row");
  assert.equal(sp.attributes.vfd, undefined, "ECM against its cited note 1's integrated VFD");
  assert.equal(sp.attributes.glycol_pct, undefined, "note B names no snowmelt system");
  const starter = normalizeCompileItem(row("CHWP-1", "PUMP SCHEDULE", { SERVICE: "CHILLED", REMARKS: "PROVIDE WITH MOTOR STARTER" }), "PUMP", { headers: ["MARK", "SERVICE", "REMARKS"] });
  assert.equal(starter.attributes.vfd?.value, "no"); // 03_FL
  assert.equal(starter.attributes.vfd?.cite.header, "REMARKS");
});

test("dev 3 A/B: an unlabeled list ends at a table beside or below it, and at a number out of turn", () => {
  // 01_NY page 88: the STEAM HUMIDIFIERS' notes 1-4 (no label), then the
  // FANS table's title and header row, then that table's own notes 1-5.
  const spans: NoteSpan[] = [
    { str: "STEAM HUMIDIFIERS", x0: 4100, y0: 470, x1: 4600, y1: 495 },
    { str: "MARK", x0: 2980, y0: 540, x1: 3060, y1: 565 },
    { str: "H-1", x0: 2980, y0: 620, x1: 3030, y1: 645 },
    { str: "1,2,3,4", x0: 5700, y0: 620, x1: 5800, y1: 645 },
    { str: "1. PROVIDE INSULATED TUBES AND HEADERS, STAINLESS STEEL MOUNTING FRAME.", x0: 2978, y0: 725, x1: 4217, y1: 750 },
    { str: "2. PROVIDE BACNET MSTP CONTROL INTERFACE, AIR PROVING SWITCH.", x0: 2978, y0: 754, x1: 4363, y1: 779 },
    { str: "3. PROVIDE WITH STEAM SEPARATOR, Y-TYPE STRAINER, CONTROL VALVE AND STEAM TRAPS.", x0: 2978, y0: 783, x1: 5353, y1: 808 },
    { str: "IRON IS PROHIBITED.", x0: 2995, y0: 812, x1: 3188, y1: 837 },
    { str: "4. PROVIDE UNIT WITH SELF-ACTUATED CONDENSATE DRAIN COOLER. REFER TO PLANS FOR LOCATION.", x0: 2978, y0: 841, x1: 3947, y1: 866 },
    { str: "FANS", x0: 4687, y0: 888, x1: 4754, y1: 914 },
    { str: "UNIT NO", x0: 3603, y0: 936, x1: 3705, y1: 961 },
    { str: "TYPE", x0: 3838, y0: 936, x1: 3903, y1: 961 },
    { str: "CFM", x0: 4041, y0: 936, x1: 4096, y1: 961 },
    { str: "1. PROVIDE FANS WITH VFD COMPATIBLE MOTOR AND COUNTER-WEIGHTED GRAVITY DAMPERS.", x0: 3584, y0: 1071, x1: 4589, y1: 1096 },
    { str: "5. AIRFLOW SCHEDULED IS FINAL BALANCING VALUE AT END OF PHASE 2.", x0: 3584, y0: 1215, x1: 4892, y1: 1241 },
  ];
  const notes = scheduleNotes(spans, [2968, 467, 5877, 683]);
  assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3", "4"]);
  assert.equal(notes[2].text, "PROVIDE WITH STEAM SEPARATOR, Y-TYPE STRAINER, CONTROL VALVE AND STEAM TRAPS. IRON IS PROHIBITED.");
  assert.equal(notes[3].text, "PROVIDE UNIT WITH SELF-ACTUATED CONDENSATE DRAIN COOLER. REFER TO PLANS FOR LOCATION.");
});

test("dev 3 A/B: a note's outdoor air share is never a mode's", () => {
  const v = (text: string) => noteValues({ id: "3", text }, new Set(["outdoor_air_pct"])).map((x) => x.value);
  assert.deepEqual(v("100% OUTDOOR AIR EMERGENCY EPIDEMIC MODE DUTY."), []);
  assert.deepEqual(v("UNIT SHALL PROVIDE 100% OUTSIDE AIR SMOKE PURGE."), []);
  assert.deepEqual(v("100% OSA UNIT."), [100]);
});

test("dev 4: a label naming its table; the next table's labeled notes beside them end the block's width, not the notes", () => {
  // 01_NY page 88: NOTES FOR AIR HANDLING UNIT: 1-11 run down the left, and
  // the STEAM HUMIDIFIERS table and its NOTES FOR STEAM HUMIDIFIERS: sit to
  // their right partway down.
  const spans: NoteSpan[] = [
    { str: "AIR HANDLING UNIT", x0: 3714.7, y0: 178.2, x1: 3957.9, y1: 203.5 },
    { str: "UNIT NO", x0: 1816.3, y0: 352.7, x1: 1919.1, y1: 378 },
    { str: "AHU-1", x0: 1830.2, y0: 387.2, x1: 1905.5, y1: 412.6 },
    { str: "NOTES FOR AIR HANDLING UNIT:", x0: 1797.8, y0: 472.6, x1: 2098.5, y1: 497.8 },
    { str: "STEAM HUMIDIFIERS", x0: 4294.6, y0: 479.6, x1: 4550.3, y1: 505 },
    { str: "1. REFER TO HUMIDIFIER SCHEDULE FOR AHU HUMIDIFIER.", x0: 1797.8, y0: 501.4, x1: 2341.9, y1: 526.6 },
    { str: "2. SUPPLY AIRFLOWS AND STATIC PRESSURES INDICATED ARE TOTAL FOR UNIT. UNIT SHALL CONTAIN TWO SUPPLY FANS (5", x0: 1797.8, y0: 530.5, x1: 2950.7, y1: 555.6 },
    { str: "HP EACH) WITH APPROXIMATELY 70% REDUNDANCY. PERFORMANCE WITH ONE FAN OPERATING SHALL BE AS FOLLOWS:", x0: 1814.2, y0: 559.3, x1: 2936.4, y1: 584.4 },
    { str: "UNIT NO", x0: 2988.2, y0: 585.2, x1: 3091, y1: 610.6 },
    { str: "LOCATION", x0: 3119.8, y0: 585.2, x1: 3247.7, y1: 610.6 },
    { str: "NOTES", x0: 5721.1, y0: 585.2, x1: 5807.4, y1: 610.6 },
    { str: "3815 CFM, 2.7 IN WG TSP, 2425 RPM, 2.8 BHP. FANS SHALL BE CENTRIFUGAL PLENUM FANS, DIRECT DRIVE.", x0: 1814.2, y0: 588.1, x1: 2794.8, y1: 613.2 },
    { str: "3. 100% OUTDOOR AIR EMERGENCY EPIDEMIC MODE DUTY.", x0: 1797.8, y0: 617.1, x1: 2346.4, y1: 642.2 },
    { str: "H-1", x0: 3019.4, y0: 619.8, x1: 3059.9, y1: 645.1 },
    { str: "AHU-1", x0: 3146.1, y0: 619.8, x1: 3221.4, y1: 645.1 },
    { str: "4. NORMAL MODE DUTY.", x0: 1797.8, y0: 645.9, x1: 2020.7, y1: 671 },
    { str: "5. BASIS OF DESIGN DAIKIN OAH020GDGM.", x0: 1797.8, y0: 674.7, x1: 2188.5, y1: 699.8 },
    { str: "NOTES FOR STEAM HUMIDIFIERS:", x0: 2978.4, y0: 696.1, x1: 3288.4, y1: 721.2 },
    { str: "6. PROVIDE UNIT AT 460V/3PH.", x0: 1797.8, y0: 703.8, x1: 2075.7, y1: 728.9 },
    { str: "1. PROVIDE INSULATED TUBES AND HEADERS, STAINLESS STEEL MOUNTING FRAME, AND FACTORY RECOMMENDED INLET ADAPTER.", x0: 2978.4, y0: 724.9, x1: 4217, y1: 750 },
    { str: "7. STEAM COIL BRANCH PIPE SIZE SHALL BE 2\" FOR SUPPLY AND 1-1/2\" FOR RETURN.", x0: 1797.8, y0: 732.6, x1: 2581.6, y1: 757.7 },
    { str: "2. PROVIDE BACNET MSTP CONTROL INTERFACE, AIR PROVING SWITCH, AND MODULATING DUCT MOUNTED CONTROL AND HIGH LIMIT HUMIDISTATS.", x0: 2978.4, y0: 753.9, x1: 4362.6, y1: 779 },
    { str: "8. FAN MOTORS SHALL BE VFD COMPATIBLE. PROVIDE FANS WITH GRAVITY BACKDRAFT DAMPERS.", x0: 1797.8, y0: 761.4, x1: 2715.8, y1: 786.5 },
    { str: "9. TOTAL STATIC PRESSURE INCLUDES SCHEDULED DIRTY FILTER PRESSURE DROP. ESP INCLUDES ONLY EXTERNAL", x0: 1797.8, y0: 790.4, x1: 2883.2, y1: 815.5 },
    { str: "PRESSURE DROPS.", x0: 1814.2, y0: 819.2, x1: 1993.9, y1: 844.3 },
    { str: "10. AIRFLOWS SCHEDULED ARE FINAL BALANCING VALUES AT END OF PHASE 2. UNIT SHALL BE BALANCED AT END OF", x0: 1797.8, y0: 848, x1: 2888.1, y1: 873.1 },
    { str: "PHASE 1 TO THE FOLLOWING AIRFLOWS (TOTAL AIRFLOW FOR UNIT):", x0: 1814.2, y0: 876.8, x1: 2452.5, y1: 901.9 },
    { str: "MAX CFM: 3055", x0: 1830.2, y0: 905.8, x1: 1968.3, y1: 931 },
    { str: "MIN CFM: 2405", x0: 1830.2, y0: 934.6, x1: 1961.9, y1: 959.8 },
    { str: "OA CFM: 1225", x0: 1830.2, y0: 963.4, x1: 1954.7, y1: 988.6 },
    { str: "11. PROVIDE BLANK OFF PLATES AT EACH SECTION AS REQUIRED.", x0: 1797.8, y0: 992.5, x1: 2411.9, y1: 1017.6 },
  ];
  const ahu: [number, number, number, number] = [1795.9, 165.6, 5877.1, 456.2];
  const humidifiers: [number, number, number, number] = [2967.8, 467, 5877.1, 683.3];
  for (const others of [[humidifiers], []]) {
    const notes = scheduleNotes(spans, ahu, others);
    assert.deepEqual(notes.map((n) => n.id), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"], `${others.length} other tables`);
    assert.equal(notes[1].text, "SUPPLY AIRFLOWS AND STATIC PRESSURES INDICATED ARE TOTAL FOR UNIT. UNIT SHALL CONTAIN TWO SUPPLY FANS (5 HP EACH) WITH APPROXIMATELY 70% REDUNDANCY. PERFORMANCE WITH ONE FAN OPERATING SHALL BE AS FOLLOWS: 3815 CFM, 2.7 IN WG TSP, 2425 RPM, 2.8 BHP. FANS SHALL BE CENTRIFUGAL PLENUM FANS, DIRECT DRIVE.");
    assert.equal(notes[5].text, "PROVIDE UNIT AT 460V/3PH.");
    assert.equal(notes[9].text, "AIRFLOWS SCHEDULED ARE FINAL BALANCING VALUES AT END OF PHASE 2. UNIT SHALL BE BALANCED AT END OF PHASE 1 TO THE FOLLOWING AIRFLOWS (TOTAL AIRFLOW FOR UNIT): MAX CFM: 3055 MIN CFM: 2405 OA CFM: 1225");
  }
  // The humidifiers' own notes, under their label.
  assert.deepEqual(scheduleNotes(spans, humidifiers, [ahu]).map((n) => n.id), ["1", "2"]);
});

test("dev 4: an accessories legend under the notes ends them; one beside them ends the block's width", () => {
  // 089_FL page 136: the FAN SCHEDULE's note 1, then ACCESSORIES: 1) 2) 3)
  // (the numbers its rows cite); the ELECTRIC UNIT HEATER SCHEDULE runs
  // beside, down to its own REMARKS:.
  const spans: NoteSpan[] = [
    { str: "EF-2", x0: 275.8, y0: 1041.7, x1: 309.6, y1: 1061.3 },
    { str: "PROPELLER BELT DRIVEN", x0: 552.7, y0: 1041.7, x1: 756.4, y1: 1061.3 },
    { str: "IF-1", x0: 278.9, y0: 1077.7, x1: 306.5, y1: 1097.3 },
    { str: "EUH-3", x0: 2310, y0: 1090.7, x1: 2366.7, y1: 1110.2 },
    { str: "NOTES:", x0: 273.8, y0: 1153.8, x1: 332.5, y1: 1173.4 },
    { str: "EUH-5", x0: 2310, y0: 1167.7, x1: 2366.7, y1: 1187.3 },
    { str: "1. MODEL NUMBERS AND FAN SELECTION ARE BASED ON GREENHECK.", x0: 273.8, y0: 1180.5, x1: 830.9, y1: 1200 },
    { str: "EUH-6", x0: 2310, y0: 1206.1, x1: 2366.7, y1: 1225.7 },
    { str: "ACCESSORIES:", x0: 281, y0: 1232.8, x1: 399.5, y1: 1252.3 },
    { str: "EUH-7", x0: 2310, y0: 1244.5, x1: 2366.7, y1: 1264.1 },
    { str: "1) BACKDRAFT DAMPER", x0: 275.5, y0: 1266.1, x1: 463.6, y1: 1285.7 },
    { str: "8) INLET SCREEN", x0: 666.2, y0: 1266.1, x1: 798.9, y1: 1285.7 },
    { str: "2) THERMOSTAT", x0: 274.1, y0: 1290.6, x1: 400.5, y1: 1310.2 },
    { str: "3) BIRDSCREEN", x0: 274.1, y0: 1315.3, x1: 395.5, y1: 1334.9 },
    { str: "REMARKS:", x0: 2319.4, y0: 1329.3, x1: 2420.2, y1: 1348.8 },
    { str: "1. PROVIDE BUILT-IN THERMOSTAT.", x0: 2319.4, y0: 1353.3, x1: 2700, y1: 1372.8 },
    { str: "2. PROVIDE LINE VOLTAGE THERMOSTAT AND SUMMER/WINTER BUILT-IN FAN SWITCH.", x0: 2319.4, y0: 1377.8, x1: 3200, y1: 1397.3 },
  ];
  assert.deepEqual(scheduleNotes(spans, [276, 866, 3576, 1111]), [{ id: "1", text: "MODEL NUMBERS AND FAN SELECTION ARE BASED ON GREENHECK." }]);
  // 077_MT page 3: REMARKS: 1-4 with the ACCESSORIES: 1-6 legend beside them.
  const grd: NoteSpan[] = [
    { str: "GRILLE, REGISTER AND DIFFUSER SCHEDULE", x0: 2651.3, y0: 907.1, x1: 3781.5, y1: 957.6 },
    { str: "REMARKS:", x0: 1768.1, y0: 977.3, x1: 1866, y1: 996.2 },
    { str: "ACCESSORIES:", x0: 3161.3, y0: 977.3, x1: 3302.1, y1: 996.2 },
    { str: "1. THE CONTRACTOR SHALL BE RESPONSIBLE FOR PROVIDING ALL FITTINGS AND ACCESSORIES REQUIRED FOR A COMPLETE INSTALLATION.", x0: 1768.1, y0: 998.5, x1: 3084.9, y1: 1017.4 },
    { str: "1. PROVIDE FRAME FOR INSTALLATION IN RELEVANT CEILING TYPE. REFER TO ARCHITECTURAL RCP FOR CEILING TYPE.", x0: 3161.3, y0: 998.5, x1: 4279.4, y1: 1017.4 },
    { str: "2. THE N.C. VALUES LISTED ARE VALID FOR THE SCHEDULED AIRFLOW ONLY AND REPRESENT A MAXIMUM ACCEPTABLE VALUE. SUBSTITUTE", x0: 1768.1, y0: 1019.6, x1: 3078.1, y1: 1038.5 },
    { str: "2. REMOTE DAMPERS SHALL BE GREENHECK MODEL RBDR-50 WITH REMOTE WALL PLATE(S) IN LOCATION(S) SHOWN ON DRAWINGS.", x0: 3161.3, y0: 1019.6, x1: 4394.1, y1: 1038.5 },
    { str: "EQUIPMENT SHALL HAVE N.C. VALUE EQUAL TO OR BELOW THE VALUE SCHEDULED.", x0: 1768.1, y0: 1040.7, x1: 2551.7, y1: 1059.6 },
    { str: "3. PAINT INTERIOR OF VISIBLE RETURN DUCTS & PLENUMS BLACK.", x0: 1768.1, y0: 1061.8, x1: 2384.9, y1: 1080.7 },
    { str: "4. COORDINATE LINEAR SLOT WIDTHS WITH THE WIDTH OF THE WOOD SLAT CEILINGS THEY WILL BE INSTALLED IN PRIOR TO ORDERING.", x0: 1768.1, y0: 1083.2, x1: 3039.3, y1: 1102.1 },
  ];
  const remarks = scheduleNotes(grd, [1763.5, 905.3, 4669, 1421.8]);
  assert.deepEqual(remarks.map((n) => n.id), ["1", "2", "3", "4"]);
  assert.equal(remarks[1].text, "THE N.C. VALUES LISTED ARE VALID FOR THE SCHEDULED AIRFLOW ONLY AND REPRESENT A MAXIMUM ACCEPTABLE VALUE. SUBSTITUTE EQUIPMENT SHALL HAVE N.C. VALUE EQUAL TO OR BELOW THE VALUE SCHEDULED.");
});

test("dev 4 A/B: the table under the notes ends them (a title with no SCHEDULE word, a NOTES column header), and its notes are never these", () => {
  // 14_OR page 2: the AIR COOLED CHILLER's notes 1-5, the HOT WATER
  // CONDENSING BOILER table under them with its own notes 1-7, then the
  // EXHAUST FANS table (no region: the sheet graph did not read it).
  const spans: NoteSpan[] = [
    { str: "NOTES:", x0: 304.8, y0: 2068.3, x1: 367.6, y1: 2089 },
    { str: "1. SOUND PRESSURE: 94 DBA OVERALL. SOUND POWER: 93 DBA OVERALL.", x0: 351.8, y0: 2100.5, x1: 978.9, y1: 2121.1 },
    { str: "2. PROVIDE COMPRESSOR SOUND BLANKETS.", x0: 351.8, y0: 2126.4, x1: 737.9, y1: 2147 },
    { str: "3. SINGLE POINT POWER CONNECTION AND DISCONNECT. PHASE AND UNDER/OVER VOLTAGE PROTECTION.", x0: 351.8, y0: 2152.6, x1: 1266.2, y1: 2173.2 },
    { str: "4. ", x0: 351.8, y0: 2178.2, x1: 379.7, y1: 2198.9 },
    { str: "INSTALL ON XXX (CONCRETE PAD) . SEE X/M701 FOR DETAILS.", x0: 379.7, y0: 2184, x1: 893.4, y1: 2204.6 },
    { str: "5. SEE 1/M502 FOR PIPING DIAGRAM. HEAT TRACE EXTERIOR PIPES.", x0: 351.8, y0: 2204.4, x1: 924.6, y1: 2225 },
    { str: "HOT WATER CONDENSING BOILER", x0: 1406.9, y0: 2271.3, x1: 1987.8, y1: 2312.4 },
    { str: "INPUT", x0: 555.8, y0: 2331.8, x1: 609.7, y1: 2352.5 },
    { str: "HIGH FIRE", x0: 655.2, y0: 2331.8, x1: 740.4, y1: 2352.5 },
    { str: "MARK", x0: 308.4, y0: 2344.3, x1: 361.5, y1: 2365 },
    { str: "LOCATION", x0: 414.2, y0: 2344.3, x1: 503.2, y1: 2365 },
    { str: "[MBH]", x0: 554.9, y0: 2356.8, x1: 610.8, y1: 2377.4 },
    { str: "OUTPUT [MBH]", x0: 631.7, y0: 2356.8, x1: 763.9, y1: 2377.4 },
    { str: "B-1", x0: 320.6, y0: 2397.8, x1: 348.9, y1: 2418.5 },
    { str: "BOILER RM", x0: 411.4, y0: 2397.8, x1: 506.4, y1: 2418.5 },
    { str: "600", x0: 567.1, y0: 2397.8, x1: 598.5, y1: 2418.5 },
    { str: "B-2", x0: 320.6, y0: 2427.4, x1: 348.9, y1: 2448 },
    { str: "BOILER RM", x0: 411.4, y0: 2427.4, x1: 506.4, y1: 2448 },
    { str: "600", x0: 567.1, y0: 2427.4, x1: 598.5, y1: 2448 },
    { str: "NOTES:", x0: 314.2, y0: 2455.4, x1: 377, y1: 2476.1 },
    { str: "1. PROVIDE ONE ANSI CERTIFIED GAS REGULATOR WITH EACH BOILER. CONTRACTOR TO VENT REGULATOR OUTDOORS.", x0: 361.2, y0: 2484.2, x1: 1372, y1: 2504.9 },
    { str: "2. PROVIDE MANUFACTURER'S CONDENSATE NEUTRALIZER. ONE PER BOILER.", x0: 361.2, y0: 2513.3, x1: 1016.6, y1: 2533.9 },
    { str: "3. PROVIDE MANUFACTURER'S CONCENTRIC VENT KIT. ONE PER BOILER.", x0: 361.2, y0: 2542.1, x1: 971.9, y1: 2562.7 },
    { str: "4. PROVIDE 6\" CONCRETE SERVICE PAD.", x0: 361.2, y0: 2571.1, x1: 698.8, y1: 2591.8 },
    { str: "5. PROVIDE WITH BACNET MSTP OPTION FOR INTEGRATION INTO BAS. PROVIDE WITH FLOW SWITCH.", x0: 361.2, y0: 2599.9, x1: 1218.6, y1: 2620.6 },
    { str: "6. PROVIDE HIGH ALTITUDE OPTION IF REQUIRED", x0: 361.2, y0: 2629, x1: 779.5, y1: 2649.6 },
    { str: "7. SEE M501 FOR PIPING DIAGRAM", x0: 361.2, y0: 2659.2, x1: 661.1, y1: 2679.8 },
    { str: "EXHAUST FANS", x0: 970.3, y0: 2729.9, x1: 1229, y1: 2771 },
    { str: "MOTOR", x0: 1066.1, y0: 2793.6, x1: 1133.6, y1: 2814.2 },
    { str: "MARK", x0: 333.4, y0: 2813.5, x1: 386.4, y1: 2834.2 },
    { str: "SERVING", x0: 544.1, y0: 2813.5, x1: 619.1, y1: 2834.2 },
    { str: "CFM", x0: 747.6, y0: 2813.5, x1: 786, y1: 2834.2 },
    { str: "MAKE & MODEL", x0: 1511.3, y0: 2813.5, x1: 1649.9, y1: 2834.2 },
    { str: "NOTES", x0: 1810.8, y0: 2813.5, x1: 1867.8, y1: 2834.2 },
    { str: "KITCHEN GREASE HOOD", x0: 481.9, y0: 2873.5, x1: 681.8, y1: 2894.2 },
    { str: "1, 2, 3", x0: 1813.9, y0: 2873.5, x1: 1864.5, y1: 2894.2 },
    { str: "KEF-1", x0: 336.5, y0: 2877.6, x1: 383.4, y1: 2898.2 },
  ];
  const chiller: [number, number, number, number] = [299.8, 1871.8, 2910.7, 2231.8];
  const boiler: [number, number, number, number] = [287, 2265.8, 3108, 2455.9];
  const ch = scheduleNotes(spans, chiller, [boiler]);
  assert.deepEqual(ch.map((n) => n.id), ["1", "2", "3", "4", "5"], "the boiler's notes 6 and 7 are not the chiller's");
  assert.equal(ch[3].text, "INSTALL ON XXX (CONCRETE PAD) . SEE X/M701 FOR DETAILS.");
  assert.equal(ch[4].text, "SEE 1/M502 FOR PIPING DIAGRAM. HEAT TRACE EXTERIOR PIPES.", "no header of the boiler");
  const b = scheduleNotes(spans, boiler, [chiller]);
  assert.deepEqual(b.map((n) => n.id), ["1", "2", "3", "4", "5", "6", "7"]);
  assert.equal(b[6].text, "SEE M501 FOR PIPING DIAGRAM", "the exhaust fans' header line and rows are not note 7");
});

test("dev 4 A/B: another table's notes beside or under these are never read as their continuation", () => {
  // federal-mech page 14: the chiller prints notes 1, 3 and 4 (no 2); the
  // boiler table to the right and below prints its own NOTES: 1, 2.
  const spans: NoteSpan[] = [
    { str: "TAG", x0: 906.5, y0: 1448.7, x1: 958.1, y1: 1474.1 },
    { str: "CH-1", x0: 910.6, y0: 1547.1, x1: 954.2, y1: 1566 },
    { str: "NOTES:", x0: 879.1, y0: 1641.7, x1: 939.8, y1: 1660.8 },
    { str: "1.", x0: 879.1, y0: 1663.5, x1: 892.5, y1: 1682.6 },
    { str: "PROVIDE THE FOLLOWING:", x0: 909.6, y0: 1663.5, x1: 1126.5, y1: 1682.6 },
    { str: "3.", x0: 1311.1, y0: 1663.5, x1: 1324.5, y1: 1682.6 },
    { str: "CHILLER SHALL EXCEED ASHRAE 90.1", x0: 1341.8, y0: 1663.5, x1: 1643.9, y1: 1682.6 },
    { str: "PERFORMANCE REQUIREMENTS, AS FOLLOWS:", x0: 1341.8, y0: 1685.1, x1: 1723.6, y1: 1704.2 },
    { str: "4.", x0: 1311.1, y0: 1750.4, x1: 1324.5, y1: 1769.5 },
    { str: "PROVIDE HARDWIRE INTERFACE BETWEEN CHILLER", x0: 1341.8, y0: 1750.4, x1: 1762.5, y1: 1769.5 },
    { str: "HOT WATER CONDENSING BOILER SCHEDULE", x0: 3319.9, y0: 1767.8, x1: 4456.2, y1: 1818.2 },
    { str: "PANEL AND SITE DDC CONTROLS.", x0: 1341.8, y0: 1772, x1: 1613.5, y1: 1791.1 },
    { str: "TAG", x0: 2451.4, y0: 1892.7, x1: 2503, y1: 1918.1 },
    { str: "B-1", x0: 2462.4, y0: 1988.2, x1: 2491.6, y1: 2007.1 },
    { str: "NOTES:", x0: 2431.9, y0: 2058.3, x1: 2492.6, y1: 2077.4 },
    { str: "1.", x0: 2431.9, y0: 2080.1, x1: 2445.3, y1: 2099.3 },
    { str: "PROVIDE STAINLESS STEEL EXHAUST AND PVC INLET.", x0: 2462.6, y0: 2080.1, x1: 2897, y1: 2099.3 },
    { str: "2.", x0: 2431.9, y0: 2102, x1: 2445.3, y1: 2121.1 },
    { str: "SEE SHEET M5.1 FOR HOT WATER PIPING DIAGRAM AND ADDITIONAL HOT WATER SYSTEM COMPONENTS.", x0: 2462.6, y0: 2102, x1: 3314.8, y1: 2121.1 },
  ];
  const chiller: [number, number, number, number] = [867.6, 1325.3, 5376.2, 1572.7];
  const boiler: [number, number, number, number] = [2405.3, 1771.9, 5370.9, 2040];
  for (const others of [[boiler], []]) assert.deepEqual(scheduleNotes(spans, chiller, others).map((n) => n.id), ["1", "3", "4"], `${others.length} other tables`);
  // 009_FL page 18: the valve schedule's unlabeled notes, the AIR HANDLING
  // UNIT SCHEDULE's rows and NOTES: to their right.
  const valves: NoteSpan[] = [
    { str: "HYDRONIC CONTROL VALVE SCHEDULE", x0: 2700, y0: 1880, x1: 3400, y1: 1905.2 },
    { str: "CV-2", x0: 2477.8, y0: 2155.7, x1: 2522.2, y1: 2180.9 },
    { str: "3-WAY", x0: 3276.5, y0: 2155.7, x1: 3338.5, y1: 2180.9 },
    { str: "1. CV-1 SERVES AHU-1", x0: 2437, y0: 2216.9, x1: 2652.8, y1: 2242.1 },
    { str: "AHU-1", x0: 3800.6, y0: 2243.3, x1: 3859.3, y1: 2268.5 },
    { str: "2. CV-2 SERVES AHU-2", x0: 2437, y0: 2247.4, x1: 2652.8, y1: 2272.6 },
    { str: "AHU-2", x0: 3800.6, y0: 2275.5, x1: 3859.3, y1: 2300.6 },
    { str: "NOTES:", x0: 3783.8, y0: 2339.3, x1: 3856.5, y1: 2364.5 },
    { str: "1. EXISTING UNIT. INFORMATION PROVIDED FOR BALANCING.", x0: 3783.8, y0: 2371.5, x1: 4375.8, y1: 2396.6 },
    { str: "2. CLEAN ALL COILS, REPLACE FAN BELTS, AND DAMPER ACTUATORS. ENSURE DAMPER ARE IN OPERATING CONDITION.", x0: 3783.8, y0: 2403.4, x1: 4954, y1: 2428.6 },
  ];
  const valveRegion: [number, number, number, number] = [2432.6, 1874.9, 3743.5, 2333.8];
  const ahuRegion: [number, number, number, number] = [3779.5, 1876.3, 5432.6, 2533.7];
  for (const others of [[ahuRegion], []]) {
    assert.deepEqual(scheduleNotes(valves, valveRegion, others), [{ id: "1", text: "CV-1 SERVES AHU-1" }, { id: "2", text: "CV-2 SERVES AHU-2" }], `${others.length} other tables`);
  }
});

test("dev 4: notes that state a fan coil's piping, a pump's role, an air handler's humidifier, supply fans and power", () => {
  const v = (text: string, attrs: string[]) => noteValues({ id: "1", text }, new Set(attrs)).map((x) => `${x.attr}=${x.value}`);
  assert.deepEqual(v("4-PIPE CONFIGURATION.", ["pipes"]), ["pipes=4"]); // 028_TX
  assert.deepEqual(v("PROVIDE TWO PIPE FAN COIL UNITS.", ["pipes"]), ["pipes=2"]);
  assert.deepEqual(v("UNITS ARE 2-PIPE OR 4-PIPE AS SCHEDULED.", ["pipes"]), [], "two counts: not one");
  assert.deepEqual(v("STANDBY PUMP", ["pump_arrangement"]), ["pump_arrangement=standby"]); // 033_MN P-13
  assert.deepEqual(v("PROVIDE STANDBY PUMP ON SHELF.", ["pump_arrangement"]), [], "a spare to furnish is no role");
  assert.deepEqual(v("N+1 PUMPS.", ["pump_arrangement"]), ["pump_arrangement=duty_standby"]); // 067_CA
  assert.deepEqual(v("REFER TO HUMIDIFIER SCHEDULE FOR AHU HUMIDIFIER.", ["humidifier"]), ["humidifier=yes"]); // 01_NY
  assert.deepEqual(v("PROVIDE UNIT WITH STEAM HUMIDIFIER SECTION.", ["humidifier"]), ["humidifier=yes"]);
  assert.deepEqual(v("PROVISIONS FOR FUTURE HUMIDIFIER.", ["humidifier"]), []);
  assert.deepEqual(v("UNIT SHALL NOT BE PROVIDED WITH HUMIDIFIER.", ["humidifier"]), []);
  assert.deepEqual(v("UNIT SHALL CONTAIN TWO SUPPLY FANS (5 HP EACH) WITH APPROXIMATELY 70% REDUNDANCY.", ["supply_fan_qty"]), ["supply_fan_qty=2"]); // 01_NY
  assert.deepEqual(v("PROVIDE UNIT AT 460V/3PH.", ["volts", "phase"]), ["volts=460", "phase=3"]); // 01_NY
  assert.deepEqual(v("PROVIDE 120V/1PH RECEPTACLE IN UNIT.", ["volts", "phase"]), [], "a receptacle's power");
  assert.deepEqual(v("UNIT IS 120-1/2 INCHES LONG.", ["volts", "phase"]), [], "a dimension, no power");
  assert.deepEqual(v("UNIT SHALL BE 460V/3PH OR 208V/3PH.", ["volts", "phase"]), [], "two powers: not one");
  assert.deepEqual(v("PROVIDE UNIT AT 460V/3PH. PROVIDE 120V/1PH RECEPTACLE AT UNIT.", ["volts", "phase"]), ["volts=460", "phase=3"], "the receptacle's sentence is another device's");
});

test("dev 5: an unlabeled (1) list under the table's last row; the row above it is no note", () => {
  // 016_NY page 18: AIR HANDLING UNIT SCHEDULE's row AHU-1, then its notes
  // (1)-(3) inside the table's frame, no label.
  const spans: NoteSpan[] = [
    { str: "AIR HANDLING UNIT SCHEDULE", x0: 2144, y0: 142, x1: 2665, y1: 180 },
    { str: "UNIT", x0: 663, y0: 219, x1: 726, y1: 247 },
    { str: "REMARKS", x0: 4894, y0: 219, x1: 5005, y1: 247 },
    { str: "AHU-1", x0: 663.6, y0: 285.7, x1: 726.8, y1: 313.8 },
    { str: "MECH ROOM 005", x0: 787.7, y0: 285.7, x1: 938.7, y1: 313.8 },
    { str: "SEE PLANS", x0: 965, y0: 285.7, x1: 1066.4, y1: 313.8 },
    { str: "3,450", x0: 1104.1, y0: 285.7, x1: 1149.8, y1: 313.8 },
    { str: "1,2,3", x0: 4930, y0: 285.7, x1: 4990, y1: 313.8 },
    { str: "(1) PROVIDE WITH DUCT SMOKE DETECTOR.", x0: 632.3, y0: 329.5, x1: 1129.1, y1: 357.6 },
    { str: "(2) PROVIDE WITH UNIT MOUNTED STARTER AND DISCONNECT.", x0: 632.3, y0: 359.9, x1: 1341.3, y1: 388 },
    { str: "(3) PROVIDE WITH SINGLE POINT POWER CONNECTION.", x0: 632.3, y0: 390.2, x1: 1255.2, y1: 418.3 },
  ];
  const notes = scheduleNotes(spans, [622.68, 121.68, 5028.72, 432.72]);
  assert.deepEqual(notes, [
    { id: "1", text: "PROVIDE WITH DUCT SMOKE DETECTOR." },
    { id: "2", text: "PROVIDE WITH UNIT MOUNTED STARTER AND DISCONNECT." },
    { id: "3", text: "PROVIDE WITH SINGLE POINT POWER CONNECTION." },
  ]);
  // A single "(1)" line is no list.
  assert.deepEqual(scheduleNotes(spans.slice(0, 9), [622.68, 121.68, 5028.72, 432.72]), []);
});

test("dev 5: a cited note that only provides the unit's starter; humidifier dispersion tubes; a coil's entering water", () => {
  const notes = [
    { id: "1", text: "PROVIDE WITH DUCT SMOKE DETECTOR." },
    { id: "2", text: "PROVIDE WITH UNIT MOUNTED STARTER AND DISCONNECT." },
    { id: "3", text: "PROVIDE WITH STARTER FOR THE ENERGY WHEEL MOTOR." },
  ];
  const ahu = (remarks: string) => normalizeCompileItem(row("AHU-1", "AIR HANDLING UNIT SCHEDULE", { "SUPPLY CFM": "3,450", REMARKS: remarks }), "AHU",
    { headers: ["UNIT NO.", "SUPPLY CFM", "REMARKS"], notes, rows: [{ key: "AHU-1", cells: { REMARKS: remarks } }] }).attributes.vfd?.value;
  assert.equal(ahu("1,2"), "no"); // 016_NY AHU-1
  assert.equal(ahu("1"), undefined, "a note the row does not cite");
  assert.equal(ahu("1,3"), undefined, "another motor's starter");
  const v = (text: string, attrs: string[]) => noteValues({ id: "5", text }, new Set(attrs)).map((x) => `${x.attr}=${x.value}`);
  // 061_IA AHU-A note 5; FCU note 2.
  assert.deepEqual(v("FACTORY PROVIDED HUMIDIFIER DISPERSION TUBES USING CONTRACTOR PROVIDED STEAM-TO-STEAM GENERATOR.", ["humidifier"]), ["humidifier=yes"]);
  assert.deepEqual(v("UNIT SHALL NOT BE PROVIDED WITH HUMIDIFIER DISPERSION TUBES.", ["humidifier"]), []);
  const ewt = ["chw_ewt_f", "hw_ewt_f"];
  assert.deepEqual(v("CAPACITY BASED ON 42 DEG. F. ENTERING WATER TEMPERATURE AND 80 DEG. F. D.B./67 DEG. F. W.B. ENTERING AIR CONDITIONS.", ewt), ["chw_ewt_f=42"]);
  assert.deepEqual(v("HEATING CAPACITY BASED ON 180°F EWT.", ewt), ["hw_ewt_f=180"]);
  assert.deepEqual(v("CAPACITY BASED ON 85°F ENTERING WATER.", ewt), [], "a condenser loop's, neither coil's");
  // The note's entering water speaks only where the row prints that coil's water.
  const fcu = (cells: Record<string, string>) => normalizeCompileItem(row("FCU-A", "FAN COIL UNIT SCHEDULE", cells), "FCU",
    { headers: Object.keys(cells), notes: [{ id: "2", text: "CAPACITY BASED ON 42 DEG. F. ENTERING WATER TEMPERATURE." }] }).attributes.chw_ewt_f?.value;
  assert.equal(fcu({ "COOLING COIL FLOW RATE (GPM)": "2.5", "COOLING COIL L.W.T. (°F)": "60.0" }), 42);
  assert.equal(fcu({ "COOLING CAP.": "11,400 Btu/h" }), undefined);
});
