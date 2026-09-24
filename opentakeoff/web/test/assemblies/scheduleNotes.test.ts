// ASSEMBLIES WP2 — schedule notes (src/lib/assemblies/scheduleNotes.ts) and
// how the normalizer applies them to the rows that cite them.
import test from "node:test";
import assert from "node:assert/strict";
import { citedCodeLegend, citedNoteIds, controlItems, noteValues, scheduleLegend, scheduleNotes, type NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
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
  assert.deepEqual(v("INVERTER DUTY MOTOR."), ["yes"]);
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
