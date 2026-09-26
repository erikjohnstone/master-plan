// CONTROL INTENT WP2: the packet finder and the binder, one test per failure
// mode met on the dev documents (synthetic spans; no document text).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPackets, packetKind, repairSpacing, sheetTitleOf, subjectFamily } from "../../src/lib/controlIntent/evidence.ts";
import { bindPackets, tagKey, titleTags } from "../../src/lib/controlIntent/binding.ts";
import type { NoteSpan } from "../../src/lib/assemblies/scheduleNotes.ts";
import type { RowUnit } from "../../src/lib/controlIntent/rowReader.ts";

/** A span of `str` at (x, y), `h` tall, about 0.55 h per character wide. */
const sp = (str: string, x: number, y: number, h = 19, rot?: number): NoteSpan => {
  const w = str.length * 0.55 * h;
  return rot === 90 ? { str, x0: x, y0: y, x1: x + h, y1: y + w, rot: 90 } : { str, x0: x, y0: y, x1: x + w, y1: y + h };
};
/** A paragraph of body lines under (x, y). */
const para = (x: number, y: number, n: number, text = "THE CONTROLLER SHALL MODULATE THE VALVE TO MAINTAIN SETPOINT") =>
  Array.from({ length: n }, (_, i) => sp(text, x, y + i * 23));

test("vocabulary: a control title names a subject; discipline-only, notes, schedules and device phrases do not", () => {
  assert.equal(packetKind("EXHAUST FAN CONTROL - AHU INTERLOCK - FAN-A"), "detail");
  assert.equal(packetKind("RTU-5 SEQUENCE OF OPERATIONS"), "sequence");
  assert.equal(packetKind("HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - HHW SYSTEM"), "points");
  assert.equal(packetKind("CHILLED WATER SYSTEM - CONTROL DIAGRAM"), "diagram");
  assert.equal(packetKind("HVAC CONTROLS"), null);
  assert.equal(packetKind("SEQUENCE OF OPERATION:"), null);
  assert.equal(packetKind("STEAM HUMIDIFIER CONTROL NOTES:"), null);
  assert.equal(packetKind("CONTROL DAMPER SCHEDULE"), null);
  assert.equal(packetKind("HOT WATER HEATING COIL 2-WAY CONTROL VALVE W/ FREEZE PUMP"), null);
  assert.equal(packetKind("DEHUMIDIFICATION CONTROL SEQUENCE: DEHUMIDIFICATION TO BE ENABLED"), null);
  // Letter-spaced print is repaired against the vocabulary only.
  assert.equal(repairSpacing("CHILLED W ATER PUM P CO NTROL"), "CHILLED WATER PUMP CONTROL");
  assert.equal(repairSpacing("CARTW ASHER AND W ASHER"), "CARTW ASHER AND WASHER");
  assert.equal(packetKind("TEM PERATURE CO NTROL"), null);
});

test("families: the schedule-title rules read a title's subject, the right-headed part and the keyword part win", () => {
  assert.equal(subjectFamily("UNIT HEATER CONTROL - HYDRONIC"), "UNIT_HEATER");
  assert.equal(subjectFamily("EXHAUST FAN CONTROL - AHU INTERLOCK - FAN-A"), "FAN");
  assert.equal(subjectFamily("VARIABLE AIR VOLUME AIR HANDLING UNIT CONTROL SYSTEM SCHEMATIC"), "AHU");
  assert.equal(subjectFamily("DUAL DUCT VAV TERMINAL UNIT:"), "VAV");
  assert.equal(subjectFamily("CHILLED W ATER PUM P CONTROL"), "PUMP");
  assert.equal(subjectFamily("HEATING WATER SYSTEM CONTROL SCHEMATIC"), null);
});

test("captions: a big title with its detail number and scale note owns the drawing above it, to the caption above in its lane", () => {
  const spans = [
    // Two details stacked in one lane, each with a caption under it.
    sp("SUPPLY FAN", 700, 300), sp("SF", 900, 400), sp("DDC CONTROLLER", 700, 500), sp("AI", 1000, 520), sp("DO", 1050, 520),
    sp("1", 651, 1020, 50), sp("EXHAUST FAN CONTROL", 734, 1000, 50), sp("SCALE: NONE", 734, 1060, 25),
    sp("UNIT HEATER", 700, 1300), sp("T-STAT", 900, 1400),
    sp("2", 651, 1820, 50), sp("UNIT HEATER CONTROL - HYDRONIC", 734, 1800, 50), sp("SCALE: NONE", 734, 1860, 25),
    // Body text elsewhere sets the page's body size.
    ...para(3000, 300, 12),
  ];
  const packets = findPackets("s.pdf#1", spans);
  const ef = packets.find((p) => p.title === "EXHAUST FAN CONTROL")!;
  const uh = packets.find((p) => p.title === "UNIT HEATER CONTROL - HYDRONIC")!;
  assert.equal(ef.direction, "above_title");
  assert.equal(ef.detail_number, "1");
  assert.ok(ef.spans.some((s) => s.str === "SUPPLY FAN"));
  assert.ok(!ef.spans.some((s) => s.str === "UNIT HEATER"));
  assert.ok(uh.spans.some((s) => s.str === "T-STAT"));
  assert.ok(!uh.spans.some((s) => s.str === "SUPPLY FAN"), "the region stops at the caption above in the lane");
});

test("headings: a body-size sequence heading owns the block under it; a numbered section heading is no packet", () => {
  const spans = [
    sp("RTU-5 SEQUENCE OF OPERATIONS", 3543, 167),
    ...para(3543, 200, 8),
    sp("2. TEMPERATURE CONTROL", 3543, 420),
    ...para(3543, 445, 4),
    ...para(500, 1500, 10),
  ];
  const packets = findPackets("s.pdf#2", spans);
  assert.deepEqual(packets.map((p) => p.title), ["RTU-5 SEQUENCE OF OPERATIONS"]);
  assert.equal(packets[0].direction, "below_title");
  assert.ok(packets[0].spans.some((s) => s.str === "2. TEMPERATURE CONTROL"), "its sections are part of it");
});

test("two sequences one under the other are two packets; a caption keeps its period; other trades' control is no packet", () => {
  // Robustness finds (unseen sets): a second fan's sequence printed one line
  // under the first's last sentence joined the first packet, and a detail
  // caption ending in a period was read as a sentence.
  const spans = [
    sp("EXHAUST FAN (EF-1,2) SEQUENCE OF OPERATION", 500, 100),
    sp("THESE FANS AND ASSOCIATED LOUVERS SHALL BE OPERATED BY A MANUAL SWITCH.", 500, 123),
    sp("1. WHEN COMMANDED TO RUN, EXHAUST FAN AND INTERLOCKED LOUVER SHALL OPEN.", 510, 146),
    // Closer to the sentence above it than to its own text below: it still
    // heads the text below.
    sp("EXHAUST FAN (EF-3) SEQUENCE OF OPERATION", 500, 168),
    sp("THE MAIN PLC SHALL CONTROL THESE FANS AND ASSOCIATED LOUVERS.", 500, 198),
    sp("1. WHEN COMMANDED TO RUN, EXHAUST FAN SHALL OPEN THE INTERLOCKED MOTORIZED DAMPER.", 510, 221),
    ...para(3000, 300, 12),
  ];
  const packets = findPackets("s.pdf#3", spans);
  assert.deepEqual(packets.map((p) => p.title), ["EXHAUST FAN (EF-1,2) SEQUENCE OF OPERATION", "EXHAUST FAN (EF-3) SEQUENCE OF OPERATION"]);
  assert.ok(!packets[0].spans.some((s) => /MOTORIZED DAMPER/.test(s.str)), "EF-3's clause is not EF-1 and EF-2's");
  assert.equal(packets[1].direction, "below_title");
  assert.ok(packets[1].spans.some((s) => /MOTORIZED DAMPER/.test(s.str)));
  assert.ok(!packets[1].spans.some((s) => /MANUAL SWITCH/.test(s.str)), "the text above it is the first sequence's");
  // A line inside one sequence that names no equipment still does not split it.
  const one = findPackets("s.pdf#4", [
    sp("AHU-1 SEQUENCE OF OPERATION", 500, 100), ...para(500, 123, 3),
    sp("SEQUENCE OF OPERATION NOTES CONTINUED", 500, 192), ...para(500, 215, 3),
    ...para(3000, 300, 12),
  ]);
  assert.deepEqual(one.map((p) => p.title), ["AHU-1 SEQUENCE OF OPERATION"]);
  // A title set as a title keeps its closing period; a sentence does not.
  assert.equal(packetKind("LIGHTNG AND EXHAUST FAN CONTROL DIAGRAM.", { titled: true }), "diagram");
  assert.equal(packetKind("LIGHTNG AND EXHAUST FAN CONTROL DIAGRAM."), null);
  // Seismic, vibration, noise and erosion control are other trades'.
  assert.equal(packetKind("SEISMIC AND VIBRATION CONTROL"), null);
  assert.equal(packetKind("NOISE CONTROL DETAILS"), null);
});

test("the title block: a strip of field labels holds no packet; its drawing title is read under DRAWING TITLE", () => {
  const spans = [
    sp("CHILLED WATER SYSTEM - CONTROL DIAGRAM", 1600, 1400, 31), sp("CH-1", 1700, 900), sp("DDC", 1800, 1000), sp("STATUS", 1900, 1100), sp("AO", 1950, 1150),
    ...para(400, 1700, 12),
    sp("DRAWING TITLE", 5490, 3740), sp("MECHANICAL CONTROLS -", 5500, 3770, 44), sp("CHILLED WATER SYSTEM", 5500, 3820, 44),
    sp("SCALE", 5490, 3880), sp("DRAWING NUMBER", 5490, 3950), sp("PROJECT NUMBER", 5490, 4000), sp("M8.3", 5800, 4090, 82),
  ];
  assert.equal(sheetTitleOf(spans), "MECHANICAL CONTROLS - CHILLED WATER SYSTEM");
  const packets = findPackets("s.pdf#3", spans);
  assert.ok(packets.some((p) => p.title === "CHILLED WATER SYSTEM - CONTROL DIAGRAM" && p.scope === "detail"));
  assert.ok(packets.some((p) => p.scope === "sheet" && p.title === "MECHANICAL CONTROLS - CHILLED WATER SYSTEM"));
  assert.ok(!packets.some((p) => p.scope === "detail" && /MECHANICAL CONTROLS/.test(p.title)));
});

test("keyword-less captions: equipment over control content is a packet, an installation detail is not", () => {
  const spans = [
    sp("SENSOR", 100, 100, 6), sp("DDC CONTROLLER", 150, 150, 6), sp("STATUS", 200, 200, 6), sp("AI", 250, 210, 6), sp("BO", 280, 210, 6),
    sp("1", 90, 400, 8), sp("VARIABLE AIR VOLUME TERMINAL UNIT (VAV-1 THRU VAV-9)", 105, 400, 10), sp("SCALE: N.T.S.", 105, 415, 5),
    sp("CURB", 700, 100, 6), sp("FLASHING", 750, 150, 6),
    sp("2", 690, 400, 8), sp("ROOF MOUNTED EXHAUST FAN DETAIL", 705, 400, 10), sp("SCALE: N.T.S.", 705, 415, 5),
    ...Array.from({ length: 12 }, (_, i) => sp("THE CONTROLLER SHALL MONITOR THE FAN STATUS AT ALL TIMES", 1200, 100 + i * 8, 6)),
  ];
  const titles = findPackets("s.pdf#4", spans).map((p) => p.title);
  assert.ok(titles.includes("VARIABLE AIR VOLUME TERMINAL UNIT (VAV-1 THRU VAV-9)"));
  assert.ok(!titles.includes("ROOF MOUNTED EXHAUST FAN DETAIL"));
});

test("a generic sequence heading: its items that name equipment are packets", () => {
  const spans = [
    sp("G.", 744, 688), sp("SEQUENCE OF OPERATION:", 816, 688),
    sp("A.", 816, 710), sp("DUAL DUCT VAV TERMINAL UNIT:", 888, 710),
    ...para(960, 733, 6),
    sp("B.", 816, 880), sp("OCCUPIED MODE:", 888, 880),
    ...para(960, 903, 3),
    ...para(3000, 100, 12),
  ];
  const packets = findPackets("s.pdf#5", spans);
  assert.deepEqual(packets.map((p) => [p.scope, p.title]), [["section", "DUAL DUCT VAV TERMINAL UNIT:"]]);
});

test("a subtitle under a caption is part of its title and never the next packet's", () => {
  const spans = [
    ...para(3373, 443, 8, "THE GENERAL EXHAUST FAN SYSTEM SHALL CONSIST OF A FAN"),
    sp("GENERAL EXHAUST FAN SEQUENCE OF OPERATION", 3363, 647, 52), sp("(EF-1, EF-2, & EF-3)", 3364, 707),
    sp("EF-1", 3500, 900), sp("DDC", 3600, 950),
    sp("GENERAL EXHAUST FAN CONTROL SCHEMATIC", 3411, 1190, 52), sp("(EF-1, EF-2, & EF-3)", 3412, 1250),
    ...para(3343, 1543, 8, "THE ELECTRIC UNIT HEATER SHALL BE CONTROLLED BY A THERMOSTAT"),
    sp("ELECTRIC UNIT HEATER SEQUENCE OF OPERATION", 3281, 2334, 51),
  ];
  const packets = findPackets("s.pdf#6", spans);
  const sch = packets.find((p) => p.title === "GENERAL EXHAUST FAN CONTROL SCHEMATIC")!;
  const euh = packets.find((p) => p.title === "ELECTRIC UNIT HEATER SEQUENCE OF OPERATION")!;
  assert.equal(sch.subtitle, "(EF-1, EF-2, & EF-3)");
  assert.ok(!euh.spans.some((s) => s.str.startsWith("(EF-1")));
});

test("rotated pages: text set at a quarter turn is read in its own frame", () => {
  const spans = [
    sp("SINGLE AIR COOLED CHILLER SYSTEM (CH-1, CWP-1, CWP-2)", 452, 426, 10, 90),
    sp("1", 452, 410, 8, 90),
    sp("SCALE: N.T.S.", 440, 426, 5, 90),
    ...Array.from({ length: 10 }, (_, i) => sp("THE CONTROLLER SHALL ENABLE THE CHILLER", 480 + i * 8, 100, 6, 90)),
    sp("DDC", 600, 450, 6, 90), sp("STATUS", 620, 450, 6, 90), sp("AI", 640, 450, 6, 90),
  ];
  const packets = findPackets("s.pdf#7", spans);
  assert.ok(packets.some((p) => p.title === "SINGLE AIR COOLED CHILLER SYSTEM (CH-1, CWP-1, CWP-2)"));
});

// ── Binding ─────────────────────────────────────────────────────────────────

const unit = (index: number, tag: string, family: string, table: string, cells: Record<string, string> = {}, notes: string[] = []): RowUnit => ({
  index, tag, family, attributes: {}, unknown: {}, cells, table_title: table, table_headers: Object.keys(cells),
  cite: { sheet: "sched.pdf#1", table_title: table, header: "TAG", bbox: null },
  notes: notes.map((text, i) => ({ id: String(i + 1), text })),
} as unknown as RowUnit);
const packet = (id: string, title: string, kind: "sequence" | "points" | "diagram" | "detail", spans: NoteSpan[] = [], extra: Record<string, unknown> = {}) => ({
  id, sheet: "c.pdf#1", kind, scope: "detail" as const, title, title_box: [0, 0, 10, 10] as [number, number, number, number], direction: "above_title" as const,
  region: [0, 0, 1000, 1000] as [number, number, number, number], spans, ...extra,
});

test("tags: lists carry their prefix, ranges expand only across scheduled tags, numbers compare as integers", () => {
  const sched = ["RTU-1", "RTU-2", "RTU-3", "RTU-4", "AHU-04", "AHU-40", "VAV-1", "VAV-2", "VAV-10"].map((t) => tagKey(t)!);
  const tags = (t: string) => titleTags(t, sched).map((x) => `${x.key.prefix}-${x.key.n}`);
  assert.deepEqual(tags("RTU-1, 2, 3 SEQUENCE OF OPERATIONS"), ["RTU-1", "RTU-2", "RTU-3"]);
  assert.deepEqual(tags("VARIABLE AIR VOLUME AHU-4, AHU-5 & AHU-8 CONTROLS"), ["AHU-4", "AHU-5", "AHU-8"]);
  assert.deepEqual(tags("TERMINAL UNIT (VAV-1 THRU VAV-9)"), ["VAV-1", "VAV-2", "VAV-9"]);
  assert.deepEqual(tags("EF-1 AND EF-2 SERVING ROOMS 101, 102"), ["EF-1", "EF-2"]);
  assert.deepEqual(tagKey("B-1(E)"), { prefix: "B", n: 1, suffix: "" });
  const b = bindPackets([packet("p1", "VARIABLE AIR VOLUME AHU-4, AHU-5 & AHU-8 CONTROLS", "detail")], [unit(0, "AHU-04", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "AHU-40", "AHU", "AIR HANDLING UNIT SCHEDULE")]);
  assert.equal(b.get(0)?.[0].kind, "list_range");
  assert.equal(b.get(1), undefined);
});

test("tags printed in a packet: a tag symbol's letters over its number; a tag in another family's sentence is no binding", () => {
  const schematic = packet("p1", "HEATING WATER SYSTEM CONTROL SCHEMATIC", "diagram", [
    { str: "HWP", x0: 100, y0: 100, x1: 136, y1: 119 }, { str: "1", x0: 114, y0: 125, x1: 122, y1: 134 },
  ]);
  const efDetail = packet("p2", "EXHAUST FAN CONTROL", "detail", [{ str: "EXHAUST FAN SHALL BE INTERLOCKED TO RUN WITH AHU-1 AT ALL TIMES", x0: 0, y0: 0, x1: 900, y1: 19 }]);
  const b = bindPackets([schematic, efDetail], [unit(0, "HWP-1", "PUMP", "PUMP SCHEDULE"), unit(1, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE")]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind]), [["p1", "tag_body"]]);
  assert.equal(b.get(1), undefined);
});

test("family details: qualifiers confirmed by the row decide; unconfirmed ones only propose; the most specific confirmed title wins", () => {
  const packets = [
    packet("hw", "UNIT HEATER CONTROL - HYDRONIC", "detail"),
    packet("el", "UNIT HEATER CONTROL - ELECTRIC", "detail"),
    packet("fc", "FAN COIL UNIT - CONTROL DIAGRAM", "diagram"),
    packet("dx", "DX SPLIT SYSTEM - CONTROL DIAGRAM", "diagram"),
  ];
  const b = bindPackets(packets, [
    unit(0, "UH-1", "UNIT_HEATER", "UNIT HEATER SCHEDULE - HOT WATER"),
    unit(1, "EV-1", "FCU", "DX FAN COIL UNIT SCHEDULE", { SYSTEM: "CU-1" }),
    unit(2, "CU-1", "CONDENSING_UNIT", "AIR-COOLED CONDENSING UNIT SCHEDULE"),
    unit(3, "FCU-1", "FCU", "HOT WATER FAN COIL UNIT SCHEDULE"),
  ]);
  assert.deepEqual(b.get(0)?.map((x) => x.packet), ["hw"]);
  assert.deepEqual(b.get(1)?.map((x) => x.packet), ["dx"], "DX confirmed by its schedule, SPLIT by its paired condensing unit");
  assert.deepEqual(b.get(2)?.map((x) => [x.packet, x.kind]), [["dx", "component_of"]], "the outdoor unit takes its indoor unit's packet");
  assert.deepEqual(b.get(3)?.map((x) => x.packet), ["fc"]);
});

test("cross-references: a schedule cell equal to a title's designator; a points schedule grouped by detail number", () => {
  const fanA = packet("a", "EXHAUST FAN CONTROL - AHU INTERLOCK - FAN-A", "detail");
  const toilet = packet("t", "TOILET EXHAUST FANS - CONTROL DIAGRAM", "diagram", [], { detail_number: "1" });
  const misc = packet("m", "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS", "points", [
    { str: "1. EF-1,2,3", x0: 2333, y0: 2989, x1: 2457, y1: 3014 }, { str: "1 EXHAUST FAN START/STOP", x0: 2344, y0: 3023, x1: 2720, y1: 3049 },
  ]);
  const b = bindPackets([fanA, toilet, misc], [
    unit(0, "EF-1A", "FAN", "FAN SCHEDULE", { "CONTROL TYPE": "FAN-A" }),
    unit(1, "EF-2", "FAN", "GENERAL FAN SCHEDULE", { "AREA SERVED": "TREATMENT ROOMS" }),
  ]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind]), [["a", "cross_reference"]]);
  assert.deepEqual(b.get(1)?.map((x) => x.packet).sort(), ["m", "t"]);
});

test("a row that puts its unit outside the BAS keeps only title bindings; a schedule's explicit references are its rows'", () => {
  const euh = packet("e", "ELECTRIC UNIT HEATER CONTROL SCHEMATIC", "diagram");
  const units = [
    unit(0, "EH-1", "UNIT_HEATER", "ELECTRIC HEATER SCHEDULE", { REMARKS: "1, 5" }, ["SEE CONTROL DRAWINGS FOR SEQUENCE OF OPERATION."]),
    unit(1, "EH-7", "UNIT_HEATER", "ELECTRIC HEATER SCHEDULE", { REMARKS: "1, 6" }, ["UNIT TO BE STANDALONE AND NOT CONTROLLED BY DDC."]),
  ];
  const b = bindPackets([euh], units, { standalone: new Set([1]) });
  assert.deepEqual(b.get(0)?.map((x) => x.packet), ["e"]);
  assert.equal(b.get(1), undefined);
});

test("marks several kinds of unit share: a qualified tag is only its kind's; a bare shared mark binds by the title's subject or as a proposal; point labels are no tags", () => {
  // Robustness finds (unseen sets): one set marks an outdoor air unit, a
  // furnace and a condensing unit all "B1" and draws "EF-B1 CONTROL DIAGRAM"
  // for an exhaust fan; another schedules "AHU-A1" beside "DOAH-A1".
  assert.deepEqual(titleTags("EF-B1 CONTROL DIAGRAM", []).map((x) => x.key), [{ prefix: "B", n: 1, suffix: "", qualifier: "EF" }]);
  assert.deepEqual(titleTags("EF-B1 THRU EF-B3", ["B1", "B2", "B3"].map((t) => tagKey(t)!)).map((x) => `${x.key.qualifier}:${x.key.prefix}-${x.key.n}`), ["EF:B-1", "EF:B-2", "EF:B-3"]);
  const packets = [
    packet("ef", "EF-B1 CONTROL DIAGRAM", "diagram"),
    packet("fu", "FURNACE CONTROL DIAGRAM", "diagram"),
    packet("b1", "B1 CONTROL SEQUENCE", "sequence"),
    packet("fb1", "FURNACE B1 SEQUENCE OF OPERATION", "sequence"),
    packet("rtu", "ROOF TOP UNIT CONTROL DIAGRAM", "diagram", [sp("BO-1", 100, 100), sp("BO-2", 100, 140), sp("SUPPLY FAN START/STOP", 200, 100)]),
    packet("ahu", "AHU-A1 CONTROL DIAGRAM", "diagram"),
    packet("w", "AHU-1 SEQUENCE OF OPERATIONS", "sequence"),
    packet("ef7", "EF-B7 CONTROL", "detail"),
  ];
  const b = bindPackets(packets, [
    unit(0, "B1", "OUTDOOR_AIR_UNIT", "OUTDOOR AIR UNIT SCHEDULE"),
    unit(1, "B1", "FURNACE", "FURNACE SCHEDULE"),
    unit(2, "B1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE"),
    unit(3, "B2", "FURNACE", "FURNACE SCHEDULE"),
    unit(4, "BO1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE"),
    unit(5, "AHU-A1", "AHU", "AIR HANDLING UNIT SCHEDULE"),
    unit(6, "DOAH-A1", "DOAH_UNIT", "DEDICATED OUTDOOR AIR UNIT SCHEDULE"),
    unit(7, "WHSE-AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE"),
    unit(8, "B7", "FAN", "EXHAUST FAN SCHEDULE"),
  ]);
  const of = (i: number) => b.get(i)?.map((x) => `${x.packet}:${x.kind}${x.proposal ? ":proposal" : ""}`);
  // "EF-B1" names an exhaust fan: none of the three B1s.
  assert.deepEqual(of(1), ["b1:tag:proposal", "fb1:tag"], "the furnace: its own titled sequence, and the shared mark only as a proposal");
  assert.deepEqual(of(0), ["b1:tag:proposal"]);
  assert.deepEqual(of(2), ["b1:tag:proposal"]);
  assert.deepEqual(of(3), ["fu:family_detail"]);
  assert.equal(b.get(4), undefined, "BO-1 in a control diagram is a binary output, not the condensing unit BO1");
  assert.deepEqual(of(5), ["ahu:tag"]);
  assert.equal(b.get(6), undefined, "AHU-A1 is not DOAH-A1");
  assert.deepEqual(of(7), ["w:tag"], "a building prefix does not stop a bare title tag");
  assert.deepEqual(of(8), ["ef7:tag"], "EF names an exhaust fan: the fan schedule's B7");
});

test("a detail whose own label lists units of its family is theirs; a list may run on over two lines; one that says ALL is typical for all", () => {
  // Robustness finds (unseen sets): "EXHAUST FAN CONTROLS" over a diagram
  // labelled "EXHAUST FAN (EF-1, 2, 3, 4, & 5)" bound a gatehouse toilet fan,
  // EF-7, by family, and its intake damper was read for it; "TYP. FANS
  // EF-A1, / EF-A3, & SEF-A3" is set on two lines.
  const packets = [
    packet("ef", "EXHAUST FAN CONTROLS", "detail", [sp("EXHAUST FAN (EF - 1, 2, 3, 4, & 5)", 100, 100), sp("INTAKE DAMPER OPEN/CLOSE", 100, 140)]),
    packet("gef", "GENERAL EXHAUST FAN DDC CONTROL DETAIL", "detail", [sp("TYP. FANS EF-A1 ,", 100, 100), sp("EF-A3 , & SEF-A3", 100, 121)]),
    packet("uh", "UNIT HEATER CONTROL DIAGRAM", "diagram", [sp("UH-1, UH-2 (TYPICAL OF ALL)", 100, 100)]),
    packet("esd", "EMERGENCY SHUTDOWN - CONTROL DIAGRAM", "diagram", [sp("EF-1, 2 & 3", 100, 100)]),
  ];
  const fans = ["EF-1", "EF-2", "EF-3", "EF-4", "EF-5", "EF-7", "EF-A1", "EF-A2", "EF-A3", "SEF-A3"];
  const b = bindPackets(packets, [
    ...fans.map((t, i) => unit(i, t, "FAN", "EXHAUST FAN SCHEDULE")),
    ...["UH-1", "UH-2", "UH-3"].map((t, i) => unit(20 + i, t, "UNIT_HEATER", "UNIT HEATER SCHEDULE")),
  ]);
  const of = (i: number) => b.get(i)?.map((x) => `${x.packet}:${x.kind}${x.proposal ? ":proposal" : ""}`);
  assert.deepEqual(of(2), ["ef:label_list"], "EF-3 is listed by its detail's own label");
  assert.equal(b.get(5), undefined, "EF-7 is in neither list: neither detail is its");
  assert.deepEqual(of(6), ["gef:label_list"], "EF-A1 is listed on the line the list runs on from");
  assert.deepEqual(of(9), ["gef:label_list"]);
  assert.equal(b.get(7), undefined, "EF-A2 is in neither list");
  assert.deepEqual(of(22), ["uh:family_detail"], "a label typical of all speaks for UH-3 too");
  assert.deepEqual(of(1), ["ef:label_list"], "a system's list (an emergency shutdown) names what it acts on, not its units");
});

test("variants of one kind: a title names a part the row's columns confirm or deny; a sequence printed under its variant's diagram is that variant's", () => {
  // Robustness find (unseen set): "VAV BOX WITH HEATING COIL CONTROL
  // DIAGRAM" and "COOLING ONLY VAV BOX CONTROL DIAGRAM", each over its own
  // "VAV BOX SEQUENCE OF OPERATION"; the schedule's reheat coil columns are
  // filled for the reheat boxes and blank ("-") for the cooling-only box.
  assert.equal(subjectFamily("VAV BOX WITH HEATING COIL CONTROL DIAGRAM"), "VAV", "what comes after WITH is what the box carries");
  const at = (x0: number, y0: number, x1: number, y1: number, ty: number) => ({ region: [x0, y0, x1, y1] as [number, number, number, number], title_box: [x0, ty, x0 + 600, ty + 38] as [number, number, number, number] });
  const packets = [
    packet("rh", "VAV BOX WITH HEATING COIL CONTROL DIAGRAM", "diagram", [], at(180, 30, 1740, 1210, 1144)),
    packet("co", "COOLING ONLY VAV BOX CONTROL DIAGRAM", "diagram", [], at(1920, 30, 3160, 1000, 933)),
    packet("s1", "VAV BOX SEQUENCE OF OPERATION", "sequence", [], { ...at(420, 1238, 1650, 2120, 1238), direction: "below_title" }),
    packet("s2", "VAV BOX SEQUENCE OF OPERATION", "sequence", [], { ...at(1890, 1054, 3095, 1476, 1054), direction: "below_title" }),
  ];
  const coil = (mbh: string, gpm: string, rows: string) => ({ "REHEAT COIL DATA E.A.T DEG. F": "55.0", "REHEAT COIL DATA MBH": mbh, "REHEAT COIL DATA GPM": gpm, "REHEAT COIL DATA ROWS": rows });
  const units = [
    unit(0, "VAV-1-01", "VAV", "VAV TERMINAL BOX SCHEDULE", coil("5.2", "0.4", "1")),
    unit(1, "VAV-1-02", "VAV", "VAV TERMINAL BOX SCHEDULE", coil("7.9", "0.6", "2")),
    unit(2, "VAV-1-16", "VAV", "VAV TERMINAL BOX SCHEDULE", coil("-", "-", "-")),
  ];
  const b = bindPackets(packets, units);
  const of = (i: number) => b.get(i)?.map((x) => `${x.packet}:${x.kind}${x.proposal ? ":proposal" : ""}${x.ambiguous ? ":ambiguous" : ""}`);
  assert.deepEqual(of(0), ["rh:family_detail", "s1:family_detail"], "a reheat box: the heating-coil diagram and the sequence under it");
  assert.deepEqual(of(1), ["rh:family_detail", "s1:family_detail"]);
  assert.deepEqual(of(2), ["co:family_detail", "s2:family_detail"], "the cooling-only box: its diagram and the sequence under that");
  // With no filled coil column anywhere, no row says which variant a box is:
  // the titles' parts only propose, and the two sequences stay ambiguous.
  const bare = bindPackets(packets, [unit(0, "VAV-1", "VAV", "VAV TERMINAL BOX SCHEDULE", { "CFM DESIGN": "220" }), unit(1, "VAV-2", "VAV", "VAV TERMINAL BOX SCHEDULE", { "CFM DESIGN": "400" })]);
  assert.deepEqual(bare.get(0)?.map((x) => `${x.packet}:${x.kind}${x.proposal ? ":proposal" : ""}${x.ambiguous ? ":ambiguous" : ""}`),
    ["rh:family_detail:proposal:ambiguous", "co:family_detail:proposal:ambiguous", "s1:family_detail:ambiguous", "s2:family_detail:ambiguous"]);
});

test("a title's qualifiers are the unit's: another subject joined by AND, the family's name in another spelling, a bid alternate and on/off are none; a detail for the plain kind is not a special kind's scheduled apart", () => {
  // Robustness finds (unseen sets; census of 1,198 family details, 532 of
  // them proposals): "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION" left
  // every condensing unit a proposal on "FURNACE" and bound no furnace;
  // "VAV/CAV", "ROOF TOP" beside a repaired "ROOFTOP", "(HP)" and "BID
  // ALTERNATE #2" were read as qualifiers; "EXHAUST FAN ON OFF CONTROLS" is
  // the exhaust fans' detail, not the smoke exhaust fans' scheduled apart.
  const of = (b: Map<number, Array<{ packet: string; kind: string; proposal?: true; ambiguous?: true }>>, i: number) =>
    b.get(i)?.map((x) => `${x.packet}:${x.kind}${x.proposal ? ":proposal" : ""}${x.ambiguous ? ":ambiguous" : ""}`);
  const split = bindPackets([
    packet("soo", "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION", "sequence"),
    packet("fdia", "FURNACE CONTROL DIAGRAM", "diagram"),
    packet("fcu", "FAN COIL UNIT (HEATING AND COOLING) CONTROL DIAGRAM", "diagram"),
  ], [
    unit(0, "F-1", "FURNACE", "2-STAGE, GAS FIRED FURNACE SCHEDULE"),
    unit(1, "CU-1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE"),
    unit(2, "FC-1", "FCU", "FAN COIL UNIT SCHEDULE"),
  ]);
  assert.deepEqual(of(split, 0), ["soo:family_detail", "fdia:family_detail"], "the furnace takes the furnace-and-condensing-unit sequence");
  assert.deepEqual(of(split, 1), ["soo:family_detail"], "so does the condensing unit: FURNACE is the other subject, not its qualifier");
  assert.deepEqual(of(split, 2), ["fcu:family_detail:proposal"], "HEATING AND COOLING name no second kind of unit: they stay qualifiers");

  const spell = bindPackets([
    packet("vav", "VAV/CAV TERMINAL BOX CONTROL SCHEMATIC", "diagram"),
    packet("cav", "SEQUENCE OF OPERATION - CAV BOXES", "sequence"),
    packet("rtu", "ROOF TOP UNIT CONTROL DIAGRAM", "diagram"),
    packet("hp", "SEQUENCE OF OPERATIONS HEAT PUMP TERMINAL UNIT (HP)", "sequence"),
    packet("alt", "BID ALTERNATE #2 EXHAUST FAN POINTS LIST", "points"),
  ], [
    unit(0, "VAV-1-1", "VAV", "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE"),
    unit(1, "AC-1", "RTU", "ROOF TOP UNIT SCHEDULE"),
    unit(2, "HP 12-1", "HEAT_PUMP", "EXISTING HEAT PUMP SCHEDULE"),
    unit(3, "EF-1", "FAN", "EXHAUST FAN SCHEDULE"),
  ]);
  assert.deepEqual(of(spell, 0), ["vav:family_detail", "cav:family_detail:proposal"], "VAV/CAV names either; CAV alone is still a qualifier a VAV row does not print");
  assert.deepEqual(of(spell, 1), ["rtu:family_detail"], "ROOF TOP is ROOFTOP");
  assert.deepEqual(of(spell, 2), ["hp:family_detail"], "(HP) abbreviates the title's own HEAT PUMP");
  assert.deepEqual(of(spell, 3), ["alt:family_detail"], "a bid alternate says when the work is bought, not what the fan is");

  const onOff = packet("ef", "EXHAUST FAN ON OFF CONTROLS", "detail");
  const apart = bindPackets([onOff], [unit(0, "EF-1", "FAN", "EXHAUST FAN SCHEDULE"), unit(1, "SEF-1", "FAN", "SMOKE EXHAUST FAN SCHEDULE")]);
  assert.deepEqual(of(apart, 0), ["ef:family_detail"], "ON OFF says how the fan is switched");
  assert.deepEqual(of(apart, 1), ["ef:family_detail:proposal"], "the project schedules its smoke exhaust fans apart, and the title does not name them");
  assert.match(apart.get(1)![0].evidence, /schedules "SMOKE EXHAUST FAN SCHEDULE" apart from "EXHAUST FAN SCHEDULE"/);
  // Scope notes are no kind: two buildings' schedules are one kind.
  const scoped = bindPackets([onOff], [unit(0, "EF-1", "FAN", "EXHAUST FAN SCHEDULE (BUILDING A)"), unit(1, "EF-2", "FAN", "EXHAUST FAN SCHEDULE (BUILDING B)"), unit(2, "EF-3", "FAN", "EXHAUST FAN SCHEDULE")]);
  assert.deepEqual([0, 1, 2].map((i) => of(scoped, i)), [["ef:family_detail"], ["ef:family_detail"], ["ef:family_detail"]]);
});

test("a mark printed with a space is a tag when it is a scheduled unit's; a number in a title names a unit by its mark, never a digit its row prints elsewhere; P&ID is no qualifier", () => {
  // Robustness find (an unseen set): "DOAS 3 P&ID" and "DOAS 1&2 P&ID" were
  // family details of every DOAS, and reading P&ID as a drawing's kind let
  // "3" be confirmed by DOAS-1's "460/3/60".
  const sched = ["DOAS-1", "DOAS-2", "DOAS-3", "VAV-1"].map((t) => tagKey(t)!);
  const tags = (t: string) => titleTags(t, sched).map((x) => `${x.key.prefix}-${x.key.n}:${x.how}`);
  assert.deepEqual(tags("DOAS 3 P&ID"), ["DOAS-3:tag"]);
  assert.deepEqual(tags("DOAS 1&2 P&ID"), ["DOAS-1:list_range", "DOAS-2:list_range"]);
  assert.deepEqual(tags("DOAS 4 P&ID"), [], "no DOAS-4 is scheduled");
  assert.deepEqual(tags("VAV 100% OUTSIDE AIR"), [], "a quantity after a unit's letters is no tag");
  assert.deepEqual(tags("LEVEL 2 VAV BOX DIAGRAM"), []);
  const volts = { "ELECTRICAL": "460/3/60" };
  const units = [1, 2, 3].map((n) => unit(n - 1, `DOAS-${n}`, "DOAS", "DEDICATED OUTSIDE AIR SYSTEM SCHEDULE", volts));
  const b = bindPackets([packet("p12", "DOAS 1&2 P&ID", "diagram"), packet("p3", "DOAS 3 P&ID", "diagram")], units);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind, Boolean(x.proposal)]), [["p12", "list_range", false]]);
  assert.deepEqual(b.get(2)?.map((x) => [x.packet, x.kind, Boolean(x.proposal)]), [["p3", "tag", false]]);
  // A number no tag reading takes ("BOILER 3" beside boilers marked B-n) is
  // confirmed by the unit's own mark only.
  const boilers = [1, 3].map((n, i) => unit(i, `B-${n}`, "BOILER", "BOILER SCHEDULE", volts));
  const bb = bindPackets([packet("p1", "BOILER 3 CONTROL DIAGRAM", "diagram")], boilers);
  assert.equal(bb.get(0)?.[0].proposal, true, "B-1's row prints a 3 in its voltage, which names nothing");
  assert.equal(bb.get(1)?.[0].proposal, undefined, "B-3 is the boiler numbered 3");
  // P&ID says what kind of drawing it is, not which unit.
  const fcus = [unit(0, "FCU 1-3", "FCU", "CHILLED WATER FAN COIL UNIT SCHEDULE")];
  assert.deepEqual(bindPackets([packet("p1", "FCU P&ID", "diagram")], fcus).get(0)?.map((x) => [x.kind, Boolean(x.proposal)]), [["family_detail", false]]);
});

test("components: a unit in another scheduled unit takes its packets; one located in an unscheduled terminal unit takes that kind's detail", () => {
  const ahuSoo = packet("s", "AHU-1 SEQUENCE OF OPERATIONS", "sequence");
  const tu = packet("tu", "VARIABLE VOLUME AIR TERMINAL UNIT CONTROL DIAGRAM", "diagram");
  const b = bindPackets([ahuSoo, tu], [
    unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE"),
    unit(1, "SF-1", "FAN", "FAN SCHEDULE", { "SYSTEM AND/OR SERVICE": "AHU-1", LOCATION: "AHU-1" }),
    unit(2, "RHC-1", "DUCT_MOUNTED_COIL", "HOT WATER HEATING COIL SCHEDULE", { LOCATION: "1-1-TU01", "SYSTEM AND/OR SERVICE": "AHU-1" }),
  ]);
  assert.deepEqual(b.get(1)?.map((x) => [x.packet, x.kind]), [["s", "component_of"]]);
  assert.deepEqual(b.get(2)?.map((x) => [x.packet, x.kind]), [["tu", "component_of"]]);
});
