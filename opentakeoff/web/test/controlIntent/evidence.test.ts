// CONTROL INTENT WP2: the packet finder and the binder, one test per failure
// mode met on the dev documents (synthetic spans; no document text).
import { test } from "node:test";
import assert from "node:assert/strict";
import { controlFamily, findPackets, packetKind, repairSpacing, sheetTitleOf, subjectFamily } from "../../src/lib/controlIntent/evidence.ts";
import { bindPackets, familyOf, tagKey, titleTags } from "../../src/lib/controlIntent/binding.ts";
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
  assert.deepEqual(of(split, 2), ["fcu:family_detail"]);
  assert.match(split.get(2)![0].evidence, /does not print "HEATING", "COOLING"; the family's one diagram detail, for its one unit$/,
    "HEATING AND COOLING name no second kind of unit: they stay qualifiers, and the set's one fan coil unit takes its family's one diagram (CI-58)");

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

test("a hydronic plant's drawings bind its equipment: chillers, boilers and towers by kind, pumps and exchangers by the plant their service names; never a domestic or a unit's coil pump, a steam boiler, a terminal unit or a row with no tag", () => {
  const chw = packet("chw", "CHILLED WATER SYSTEM SEQUENCE OF OPERATION", "sequence");
  const hw = packet("hw", "HEATING HOT WATER PLANT POINTS LIST", "points");
  const hwd = packet("hwd", "HOT WATER DDC CONTROL DIAGRAM", "diagram");
  const dhw = packet("dhw", "DOMESTIC HOT WATER - SEQUENCE OF OPERATION", "sequence");
  const units = [
    unit(0, "CH-1", "AIR_COOLED_CHILLER", "AIR-COOLED CHILLER SCHEDULE"),
    unit(1, "B-1", "BOILER", "BOILER SCHEDULE"),
    unit(2, "PCHP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "PRIMARY - CHILLED WATER" }),
    unit(3, "HWP-1", "PUMP", "PUMP SCHEDULE", { SYSTEM: "HOT WATER" }),
    unit(4, "P-3A", "PUMP", "PUMP SCHEDULE", { FLUID: "HWS" }),
    unit(5, "RP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "DOMESTIC HOT WATER RECIRCULATION" }),
    unit(6, "CP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "HEATING HOT WATER - AHU COIL" }),
    unit(7, "CWP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "CONDENSER WATER" }),
    unit(8, "SB-1", "BOILER", "STEAM BOILER SCHEDULE"),
    unit(9, "UH-1", "UNIT_HEATER", "HOT WATER UNIT HEATER SCHEDULE"),
    // A transposed schedule's attribute row read as a unit.
    unit(10, "PUMP FUNCTION", "PUMP", "PUMP SCHEDULE", { DESIGNATION: "PUMP FUNCTION", "CHWP-1 AND CHWP-2": "CHILLED WATER" }),
  ];
  const b = bindPackets([chw, hw, hwd, dhw], units);
  const kinds = (i: number) => (b.get(i) ?? []).map((x) => [x.packet, x.kind, Boolean(x.ambiguous || x.proposal)]);
  assert.deepEqual(kinds(0), [["chw", "system", false]]);
  assert.deepEqual(kinds(1), [["hw", "system", false], ["hwd", "system", false]]);
  assert.deepEqual(kinds(2), [["chw", "system", false]]);
  assert.match(b.get(2)![0].evidence, /the chilled water plant's drawing, and its SERVICE is "PRIMARY - CHILLED WATER"/);
  assert.deepEqual(kinds(3), [["hw", "system", false], ["hwd", "system", false]]);
  assert.deepEqual(kinds(4), [["hw", "system", false], ["hwd", "system", false]], "HWS is heating water supply");
  for (const i of [6, 7, 8, 9, 10]) assert.equal(b.get(i), undefined, `${units[i].tag} is no drawn plant's`);
  // The domestic recirculation pump is no hydronic plant's; the domestic hot
  // water sequence is the system its service names.
  assert.deepEqual(kinds(5), [["dhw", "system", false]]);
  assert.match(b.get(5)![0].evidence, /its SERVICE "DOMESTIC HOT WATER RECIRCULATION" names the whole subject/);
  // A unit with a packet of that kind of its own takes no plant drawing of
  // the kind; two plant drawings of one kind are ambiguous; a title that
  // lists its units is theirs.
  const chillers = [unit(0, "CH-1", "AIR_COOLED_CHILLER", "CHILLER SCHEDULE"), unit(1, "CH-2", "AIR_COOLED_CHILLER", "CHILLER SCHEDULE")];
  const two = bindPackets([packet("s1", "CHILLED WATER SYSTEM CONTROL SEQUENCE:", "sequence"), packet("s2", "SEQUENCE OF OPERATION - CHILLED WATER SYSTEM", "sequence"), packet("t", "CH-1 SEQUENCE OF OPERATION", "sequence")], chillers);
  assert.deepEqual(two.get(0)?.map((x) => x.packet), ["t"]);
  assert.deepEqual(two.get(1)?.map((x) => [x.packet, x.kind, Boolean(x.ambiguous)]), [["s1", "system", true], ["s2", "system", true]]);
  const listed = bindPackets([packet("l", "HEATING WATER SYSTEM CONTROL SEQUENCE (B-1, HWP-1)", "sequence")], [
    unit(0, "B-1", "BOILER", "BOILER SCHEDULE"), unit(1, "B-2", "BOILER", "BOILER SCHEDULE"), unit(2, "HWP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "HOT WATER" }),
  ]);
  assert.deepEqual([0, 1, 2].map((i) => listed.get(i)?.map((x) => x.kind) ?? null), [["list_range"], null, ["list_range"]]);
});

test("what a title says about the drawing is no qualifier (BAS INTERFACE); a heating-and-cooling variant is read from the row's coil columns; a kind that never cools is heating only; 2-PIPE is TWO-PIPE", () => {
  const kinds = (b: Map<number, Array<{ packet: string; kind: string; proposal?: true }>>, i: number) => (b.get(i) ?? []).map((x) => [x.packet, x.kind, Boolean(x.proposal)]);
  // A sequence "& BAS INTERFACE" is the family's, with nothing left to confirm.
  const fcus = [unit(0, "FC-101", "FCU", "FAN COIL UNIT SCHEDULE"), unit(1, "FC-102", "FCU", "FAN COIL UNIT SCHEDULE")];
  const bi = bindPackets([packet("s", "FAN COIL UNITS - SEQUENCE OF OPERATION & BAS INTERFACE", "sequence")], fcus);
  assert.deepEqual([kinds(bi, 0), kinds(bi, 1)], [[["s", "family_detail", false]], [["s", "family_detail", false]]]);
  // "(HEATING AND COOLING)": the row fills both coils' columns; a fan coil
  // whose cooling columns are empty while a peer's are filled is the other
  // variant.
  const coils = (hw: string, chw: string) => ({ "HEATING COIL GPM": hw, "COOLING COIL GPM": chw });
  const hc = [unit(0, "FCU-1", "FCU", "FAN COIL UNIT SCHEDULE", coils("2.0", "4.5")), unit(1, "FCU-2", "FCU", "FAN COIL UNIT SCHEDULE", coils("2.0", "-"))];
  const bhc = bindPackets([packet("d", "FAN COIL UNIT (HEATING AND COOLING) CONTROL SCHEMATIC", "diagram")], hc);
  assert.deepEqual(kinds(bhc, 0), [["d", "family_detail", false]]);
  assert.equal(bhc.get(1), undefined, "FCU-2 has no cooling coil");
  // "(HEATING ONLY)": a unit heater never cools; a fan coil with a cooling
  // coil is not the heating-only variant.
  const uh = bindPackets([packet("u", "UNIT HEATER (HEATING ONLY) CONTROL SCHEMATIC", "diagram")], [unit(0, "CUH-1", "UNIT_HEATER", "UNIT HEATER SCHEDULE", { DESCRIPTION: "CABINET UNIT HEATER" })]);
  assert.deepEqual(kinds(uh, 0), [["u", "family_detail", false]]);
  const fho = bindPackets([packet("f", "FAN COIL UNIT (HEATING ONLY) CONTROL SCHEMATIC", "diagram")], hc);
  assert.equal(fho.get(0), undefined, "FCU-1 cools");
  // A number spelled out is the same number.
  const two = bindPackets([packet("p", "2-PIPE FAN COIL UNIT CONTROL DIAGRAM", "diagram")], [unit(0, "FCU-01", "FCU", "TWO-PIPE FAN COIL UNIT SCHEDULE")]);
  assert.deepEqual(kinds(two, 0), [["p", "family_detail", false]]);
});

test("a bare mark right after SEQUENCE names the sequence, not a unit: a construction phase or a sequence the schedule refers to is no boiler B-1's", () => {
  const sched = ["B-1", "HP-1A", "HP-2A", "AHU-1"].map((t) => tagKey(t)!);
  const tags = (t: string) => titleTags(t, sched).map((x) => `${x.key.prefix}-${x.key.n}${x.key.suffix}`);
  assert.deepEqual(tags('SEQUENCE "B1"'), []);
  assert.deepEqual(tags("SEQUENCE B1:"), []);
  assert.deepEqual(tags("SEQUENCE NO. 3"), []);
  assert.deepEqual(tags("B-1 SEQUENCE OF OPERATION"), ["B-1"]);
  assert.deepEqual(tags("SEQUENCE OF OPERATION: HP-1A, HP-2A"), ["HP-1A", "HP-2A"]);
  assert.deepEqual(tags("SEQUENCE AHU-1"), ["AHU-1"], "a hyphenated tag is still the unit's");
  // A phasing note titled "SEQUENCE B1:" binds no boiler; the heating water
  // sequence that prints the boiler's tag does.
  const phase = packet("ph", "SEQUENCE B1:", "sequence", [sp("SEQUENCE B1: SCOPE OF WORK WILL BE LIMITED TO ALL RENOVATION EFFORTS IN AREAS B1 AND B2.", 0, 20)]);
  const hw = packet("hw", "SEQUENCE OF OPERATIONS HEATING WATER SYSTEM", "sequence", [sp("ONE (1) CONDENSING BOILER (B-1)", 0, 20)]);
  const b = bindPackets([phase, hw], [unit(0, "B-1", "BOILER", "CONDENSING BOILER SCHEDULE")]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind]), [["hw", "tag_body"]]);
});

// ── Binding tier 2 (dev-2 misses, general shapes) ───────────────────────────

test("qualified marks in a drawing: a kind before a group and number is one tag; a designator the schedule prints over its mark column says whose a qualified mark is", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}`);
  // "GWP-A-1" printed as a label is GWP-A-1's, never GWP-B-1's.
  const hr = packet("hr", "PLANT CONTROL DIAGRAM", "diagram", [sp("GWP-A-1", 100, 100), sp("HX - B - 2", 100, 160)]);
  const b = bindPackets([hr], [
    unit(0, "GWP-A-1", "PUMP", "HYDRONIC PUMP SCHEDULE"), unit(1, "GWP-B-1", "PUMP", "HYDRONIC PUMP SCHEDULE"),
    unit(2, "HX-B-2", "HEAT_EXCHANGER", "HEAT EXCHANGER SCHEDULE"), unit(3, "HX-A-2", "HEAT_EXCHANGER", "HEAT EXCHANGER SCHEDULE"),
  ]);
  assert.deepEqual([0, 1, 2, 3].map((i) => kinds(b, i)), [["hr:tag_body"], [], ["hr:tag_body"], []]);
  // Three kinds of unit marked B1: "OAU-B1" is the outdoor air unit's (its
  // schedule prints "OAU ~" over the marks), not the furnace's ("F ~").
  const oa = packet("oa", "OUTSIDE AIR CONTROL DIAGRAM", "diagram", [sp("OAU-B1", 100, 100)]);
  const marks = bindPackets([oa], [
    unit(0, "B1", "OUTDOOR_AIR_UNIT", "OUTDOOR AIR UNIT SCHEDULE", { "OAU ~": "B1" }),
    unit(1, "B1", "FURNACE", "FURNACE SCHEDULE", { "F ~": "B1" }),
    unit(2, "B1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE", { "CU ~": "B1" }),
  ]);
  assert.deepEqual([0, 1, 2].map((i) => kinds(marks, i)), [["oa:tag_body"], [], []]);
});

test("split systems paired from the outdoor unit's row: it adds its indoor unit's packets of the kinds it lacks; a two-subject title is not a condensing unit's that serves another kind", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}`);
  const packets = [
    packet("seq", "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION", "sequence"),
    packet("fd", "FURNACE CONTROL DIAGRAM", "diagram"),
    packet("oa", "OUTSIDE AIR CONTROL DIAGRAM", "diagram", [sp("OAU-B1", 100, 100)]),
  ];
  const b = bindPackets(packets, [
    unit(0, "C1", "FURNACE", "FURNACE SCHEDULE", { "F ~": "C1" }),
    unit(1, "C1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE", { "CU ~": "C1", SERVICE: "F-C1 AND EC-C1" }),
    unit(2, "C1", "ERV", "ENERGY RECOVERY VENTILATOR SCHEDULE", { "ERV ~": "C1" }),
    unit(3, "B1", "OUTDOOR_AIR_UNIT", "OUTDOOR AIR UNIT SCHEDULE", { "OAU ~": "B1" }),
    unit(4, "BO1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE", { "CU ~": "BO1", SERVICE: "OAU-B1" }),
  ]);
  assert.deepEqual(kinds(b, 1), ["seq:family_detail", "fd:component_of"], "the furnace's diagram draws its condensing unit");
  assert.match(b.get(1)![1].evidence, /is the outdoor unit of C1/);
  assert.deepEqual(kinds(b, 4), [], "the outdoor air unit's condensing unit takes no furnace's sequence; with no packet of its own, it takes none through the pairing");
});

test("a label that lists units prints each, in a detail about their kind that names no other kind; never a system's or another unit's detail", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}`);
  const vrf = packet("vrf", "VRF CASSETTE UNIT CONTROLS DIAGRAM", "diagram", [sp("FCU-1&2", 100, 100)]);
  const esd = packet("esd", "EMERGENCY SHUTDOWN - CONTROL DIAGRAM", "diagram", [sp("EF-4 THRU 6", 100, 100)]);
  const b = bindPackets([vrf, esd], [
    unit(0, "FCU-1", "FCU", "FAN COIL UNIT SCHEDULE", { DESCRIPTION: "EXPOSED CEILING CASSETTE" }),
    unit(1, "FCU-2", "FCU", "FAN COIL UNIT SCHEDULE", { DESCRIPTION: "EXPOSED CEILING CASSETTE" }),
    unit(2, "EF-5", "FAN", "EXHAUST FAN SCHEDULE"),
  ]);
  assert.deepEqual([0, 1, 2].map((i) => kinds(b, i)), [["vrf:tag_body"], ["vrf:tag_body"], []]);
});

test("a sibling on the sheet: titles alike once their tag lists are set aside, when the other names no other unit and is no family's typical detail", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}`);
  const packets = [
    packet("lab", "LAB EXHAUST FAN CONTROLS (EF-1, 2, & 3)", "detail"),
    packet("pts", "LAB EXHAUST FANS DDC POINTS LIST", "points"),
    packet("sch", "SCHEDULED EXHAUST FAN CONTROLS (EF-5 &6)", "detail"),
  ];
  const fans = ["EF-1", "EF-2", "EF-3", "EF-5", "EF-6"].map((t, i) => unit(i, t, "FAN", "EXHAUST FAN SCHEDULE"));
  const b = bindPackets(packets, fans);
  assert.deepEqual(kinds(b, 0), ["lab:list_range", "pts:sibling"]);
  assert.deepEqual(kinds(b, 3), ["sch:list_range"]);
  // With a fan no title names, the untagged points list is the family's
  // typical detail: that fan's by family, no named fan's sibling.
  const more = bindPackets(packets, [...fans, unit(5, "EF-7", "FAN", "EXHAUST FAN SCHEDULE")]);
  assert.deepEqual(kinds(more, 0), ["lab:list_range"]);
});

test("a schedule column naming the unit's sequence binds the one packet that prints that sequence's heading, as a section: the unit's other kinds of packet still bind", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}`);
  const seq = packet("ahu", "AIR HANDLING UNIT SEQUENCE OF OPERATION - AHU-1", "sequence", [
    sp("A. CONTROL SEQUENCE A (CONSTANT VOLUME WITH REHEAT):", 100, 100), sp("B. CONTROL SEQUENCE B (VAV WITH REHEAT):", 100, 400),
  ]);
  const diag = packet("tu", "VAV TERMINAL UNIT CONTROL DIAGRAM", "diagram");
  const b = bindPackets([seq, diag], [
    unit(0, "VAV-1", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "B" }),
    unit(1, "VAV-2", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "C" }),
  ]);
  assert.deepEqual(kinds(b, 0), ["ahu:cross_reference", "tu:family_detail"]);
  assert.match(b.get(0)![0].evidence, /CONTROL SEQUENCE "B"/);
  assert.deepEqual(kinds(b, 1), ["tu:family_detail"], "no packet prints SEQUENCE C");
  // Two packets printing the heading: neither is the unit's by it.
  const twice = bindPackets([seq, packet("dup", "SEQUENCES", "sequence", [sp("CONTROL SEQUENCE B (VAV WITH REHEAT):", 100, 100)])], [unit(0, "VAV-1", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "B" })]);
  assert.equal(twice.get(0)?.some((x) => x.kind === "cross_reference") ?? false, false);
});

test("a union of designators names the family one member names; a drawing of the controls' power or wiring stands beside the control diagram, both the unit's", () => {
  assert.equal(familyOf("TERMINAL BOX VAV/CAV/AFCV POWER SUPPLY CONTROL SCHEMATIC"), "VAV");
  assert.equal(familyOf("TERMINAL BOX VAV/FCU/AFCV CONTROL DIAGRAM"), null, "members naming two families: none");
  const b = bindPackets([
    packet("cs", "VAV/CAV TERMINAL BOX CONTROL SCHEMATIC", "diagram"),
    packet("ps", "TERMINAL BOX VAV/CAV/AFCV POWER SUPPLY CONTROL SCHEMATIC", "diagram"),
  ], [unit(0, "VAV-1-1", "VAV", "VAV TERMINAL BOX SCHEDULE")]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind, Boolean(x.proposal || x.ambiguous)]), [["cs", "family_detail", false], ["ps", "family_detail", false]]);
});

test("a chiller plant's drawing that describes its condenser water gear binds the cooling towers and condenser pumps; one that does not, does not", () => {
  const units = [unit(0, "CT-1", "COOLING_TOWER", "COOLING TOWER SCHEDULE"), unit(1, "CWP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "CONDENSER WATER" })];
  const told = bindPackets([packet("chw", "CHILLED WATER SYSTEM SEQUENCE OF OPERATION", "sequence", [sp("THE CONDENSER WATER SYSTEM INCLUDES THE CHILLERS, THREE (3) COOLING TOWERS AND PUMPS.", 0, 20)])], units);
  assert.deepEqual([0, 1].map((i) => told.get(i)?.map((x) => [x.packet, x.kind])), [[["chw", "system"]], [["chw", "system"]]]);
  const silent = bindPackets([packet("chw", "CHILLED WATER SYSTEM SEQUENCE OF OPERATION", "sequence", [sp("THE CHILLERS SHALL BE STAGED TO MAINTAIN SETPOINT.", 0, 20)])], units);
  assert.deepEqual([silent.get(0), silent.get(1)], [undefined, undefined]);
});

test("what a row says it serves, named by a drawing's whole subject, binds that drawing as the system it serves; never one word, nor a plant's drawing the plant rule declines", () => {
  const b = bindPackets([
    packet("hrc", "HEATING RECOVERY CHILLER CONTROL SCHEMATIC", "diagram"),
    packet("hhw", "HEATING HOT WATER SYSTEM SEQUENCE", "sequence"),
    packet("ch", "CHILLER CONTROL", "detail"),
  ], [
    unit(0, "HRCP-1A", "PUMP", "PUMP SCHEDULE", { SYSTEM: "HEAT RECOVERY CHILLER CHILLED WATER SIDE" }),
    unit(1, "CP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "HEATING HOT WATER - AHU COIL" }),
    unit(2, "P-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "CHILLER" }),
  ]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind]), [["hrc", "system"]]);
  assert.match(b.get(0)![0].evidence, /its SYSTEM "HEAT RECOVERY CHILLER CHILLED WATER SIDE" names the whole subject/);
  assert.equal(b.get(1), undefined, "a unit's coil pump is no heating plant's");
  assert.equal(b.get(2), undefined, "one word is not a subject");
});

test("a part its description puts in the set's one air handler takes that unit's packets of the kinds it lacks; with two air handlers, none", () => {
  const packets = [
    packet("sch", "AHU CONTROLS SCHEMATIC", "diagram", [sp("SF-1", 100, 100)]),
    packet("pts", "AHU POINTS LIST", "points", [], { sheet: "c.pdf#2" }),
  ];
  const b = bindPackets(packets, [unit(0, "AHU-A", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "SF-1", "FAN", "EQUIPMENT SCHEDULE", { DESCRIPTION: "AHU SUPPLY FAN" })]);
  assert.deepEqual(b.get(1)?.map((x) => [x.packet, x.kind]), [["sch", "tag_body"], ["pts", "component_of"]]);
  const two = bindPackets(packets, [unit(0, "AHU-A", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(2, "AHU-B", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "SF-1", "FAN", "EQUIPMENT SCHEDULE", { DESCRIPTION: "AHU SUPPLY FAN" })]);
  assert.deepEqual(two.get(1)?.map((x) => [x.packet, x.kind]), [["sch", "tag_body"]]);
});

test("a variable volume terminal unit detail is a VAV unit's; a sequence column naming constant volume picks that drawing; a dual duct box scheduled apart from single duct boxes takes neither but as a proposal", () => {
  const b = bindPackets([
    packet("vv", "VARIABLE VOLUME AIR TERMINAL UNIT CONTROL DIAGRAM", "diagram"),
    packet("cv", "CONSTANT VOLUME AIR TERMINAL UNIT CONTROL DIAGRAM", "diagram"),
  ], [
    unit(0, "TU-1", "VAV", "SINGLE DUCT AIR TERMINAL UNIT SCHEDULE", { "CONTROL TYPE": "VAV", "CONTROL SEQUENCE": "DUAL MAX" }),
    unit(1, "TU-2", "VAV", "SINGLE DUCT AIR TERMINAL UNIT SCHEDULE", { "CONTROL TYPE": "VAV", "CONTROL SEQUENCE": "CONSTANT VOLUME" }),
    unit(2, "DD-1", "VAV", "DUAL DUCT AIR TERMINAL UNIT SCHEDULE", { "COLD DUCT AIRFLOW": "800" }),
  ]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind, Boolean(x.proposal)]), [["vv", "family_detail", false]]);
  assert.deepEqual(b.get(1)?.map((x) => [x.packet, x.kind]), [["cv", "cross_reference"]]);
  assert.match(b.get(1)![0].evidence, /CONTROL SEQUENCE "CONSTANT VOLUME"/);
  assert.ok(b.get(2)?.length && b.get(2)!.every((x) => x.proposal), "the dual duct box: proposals only");
  // The family's own name in another spelling is no qualifier.
  const dh = bindPackets([packet("dh", "DE-HUMIDIFIER SEQUENCE", "sequence")], [unit(0, "DH-1", "DEHUMIDIFIER", "DEHUMIDIFIER SCHEDULE")]);
  assert.deepEqual(dh.get(0)?.map((x) => [x.packet, Boolean(x.proposal)]), [["dh", false]]);
});

test("an air handler detail with minimum outside air is the unit's where its row fills a minimum outdoor airflow; a VAV air handler detail where it serves the set's VAV units", () => {
  const moa = [packet("d", "VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR CONTROL DIAGRAM", "diagram")];
  const filled = bindPackets(moa, [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE", { "AIR FLOW": "VAV", "AIR FLOW SUPPLY CFM": "13500", "AIR FLOW MIN OA CFM": "1920" })]);
  assert.deepEqual(filled.get(0)?.map((x) => [x.packet, Boolean(x.proposal)]), [["d", false]]);
  const none = bindPackets(moa, [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE", { "AIR FLOW": "VAV", "AIR FLOW SUPPLY CFM": "13500", "AIR FLOW MIN OA CFM": "1920" }),
    unit(1, "AHU-2", "AHU", "AIR HANDLING UNIT SCHEDULE", { "AIR FLOW": "VAV", "AIR FLOW SUPPLY CFM": "9000" })]);
  assert.deepEqual(none.get(1)?.map((x) => [x.packet, Boolean(x.proposal)]), [["d", true]], "no minimum outdoor airflow beside a row that fills one");
  // The set's one air handler and its family's one diagram: the family's one
  // detail (CI-58), with MINIMUM and OUTSIDE AIR read as unprinted qualifiers.
  const one = bindPackets(moa, [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE", { "AIR FLOW": "VAV", "AIR FLOW SUPPLY CFM": "13500" })]);
  assert.deepEqual(one.get(0)?.map((x) => [x.packet, Boolean(x.proposal)]), [["d", false]]);
  assert.match(one.get(0)![0].evidence, /does not print "MINIMUM", "OUTSIDE AIR"; the family's one diagram detail, for its one unit$/);
  const vav = [packet("r", "VAV ROOFTOP UNIT CONTROLS DIAGRAM", "diagram")];
  const rtu = (i: number, tag: string) => unit(i, tag, "RTU", "ROOFTOP UNIT SCHEDULE", { "AIRFLOW CFM": "3520" });
  const boxes = [unit(5, "VAV-1", "VAV", "VARIABLE-AIR-VOLUME BOX SCHEDULE"), unit(6, "VAV-2", "VAV", "VARIABLE-AIR-VOLUME BOX SCHEDULE")];
  const only = bindPackets(vav, [rtu(0, "ACU-6"), ...boxes]);
  assert.deepEqual(only.get(0)?.map((x) => [x.packet, Boolean(x.proposal)]), [["r", false]]);
  assert.match(only.get(0)![0].evidence, /set's one air handler, and the set schedules VAV units/);
  const lone = bindPackets(vav, [rtu(0, "ACU-6")]).get(0)!;
  assert.deepEqual(lone.map((x) => Boolean(x.proposal)), [false], "no VAV units: the family's one diagram (CI-58), not a VAV reading");
  assert.doesNotMatch(lone[0].evidence, /VAV units/);
  const cvPeer = bindPackets(vav, [rtu(0, "RTU-1"), unit(1, "RTU-2", "RTU", "ROOFTOP UNIT SCHEDULE", { "AIRFLOW CFM": "3520", TYPE: "CONSTANT VOLUME" })]);
  assert.deepEqual([0, 1].map((i) => cvPeer.get(i)?.map((x) => Boolean(x.proposal))), [[true], [true]], "a constant volume peer speaks against VAV: no VAV units, both proposals");
  const two = bindPackets(vav, [rtu(0, "RTU-1"), rtu(1, "RTU-2"), unit(5, "VAV-1", "VAV", "VAV BOX SCHEDULE", { SYSTEM: "RTU-2" })]);
  assert.deepEqual([0, 1].map((i) => two.get(i)?.map((x) => Boolean(x.proposal))), [[true], [false]]);
});

test("a part takes the packets of the air handler its location names in any spacing; a pump whose system is a water system is no part of the air handler it serves", () => {
  const seq = packet("s", "AIR HANDLING UNIT SEQUENCE OF OPERATION", "sequence");
  const c = bindPackets([seq], [
    unit(0, "WHSE-AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE"),
    unit(1, "WHSE-SF1", "FAN", "FAN SCHEDULE", { LOCATION: "WHSE-AHU1", "AREA AND/OR BLDG SERVED": "WAREHOUSE" }),
    unit(2, "WHSE-P4", "PUMP", "PUMP SCHEDULE", { "AREA AND/OR BLDG SERVED": "WHSE-AHU-1", "SYSTEM AND/OR SERVICE": "PREHEAT WATER" }),
    unit(3, "WHSE-RF1", "FAN", "FAN SCHEDULE", { "AREA AND/OR BLDG SERVED": "WAREHOUSE", "SYSTEM AND/OR SERVICE": "WHSE-AHU-1" }),
  ]);
  assert.deepEqual(c.get(1)?.map((x) => [x.packet, x.kind]), [["s", "component_of"]]);
  assert.equal(c.get(2), undefined, "a preheat water pump is not the air handler's part");
  assert.deepEqual(c.get(3)?.map((x) => [x.packet, x.kind]), [["s", "component_of"]]);
});

test("the new readings stay narrow: a sequence phrase that is the family's own name chooses nothing; DUAL MAXIMUM is no dual duct; a constant volume row or another system keeps the one air handler's VAV detail a proposal; a temperature is no minimum airflow; a panel's cell pairs nothing; a motor's service factor is no system", () => {
  const vavBox = [packet("vav", "VAV BOX CONTROL DIAGRAM", "diagram")];
  const three = bindPackets(vavBox, [
    unit(0, "VAV-1", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "VARIABLE AIR VOLUME" }),
    unit(1, "VAV-2", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "DUAL MAXIMUM" }),
    unit(2, "VAV-3", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "B" }),
  ]);
  assert.deepEqual([0, 1, 2].map((i) => three.get(i)?.map((x) => [x.packet, x.kind])), [[["vav", "family_detail"]], [["vav", "family_detail"]], [["vav", "family_detail"]]]);
  const ducts = bindPackets([packet("sd", "SINGLE DUCT TERMINAL UNIT CONTROL DIAGRAM", "diagram"), packet("dd", "DUAL DUCT TERMINAL UNIT CONTROL DIAGRAM", "diagram")],
    [unit(0, "TU-1", "VAV", "SINGLE DUCT TERMINAL UNIT SCHEDULE", { "CONTROL SEQUENCE": "DUAL MAXIMUM" })]);
  assert.deepEqual(ducts.get(0)?.filter((x) => !x.proposal).map((x) => x.packet), ["sd"]);
  const double = bindPackets([packet("dd", "DOUBLE DUCT TERMINAL UNIT CONTROL DIAGRAM", "diagram")], [unit(0, "DD-1", "VAV", "DOUBLE DUCT TERMINAL UNIT SCHEDULE")]);
  assert.deepEqual(double.get(0)?.map((x) => [x.packet, Boolean(x.proposal)]), [["dd", false]]);
  const ahuVav = [packet("a", "VAV AIR HANDLING UNIT CONTROL DIAGRAM", "diagram")];
  const cv = bindPackets(ahuVav, [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE", { TYPE: "CONSTANT VOLUME" }), unit(5, "VAV-1", "VAV", "VAV BOX SCHEDULE")]);
  assert.deepEqual(cv.get(0)?.map((x) => Boolean(x.proposal)), [true], "its row prints constant volume");
  const other = bindPackets(ahuVav, [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(5, "VAV-1", "VAV", "VAV BOX SCHEDULE", { SYSTEM: "EX-AHU-3" })]);
  assert.deepEqual(other.get(0)?.map((x) => Boolean(x.proposal)), [true], "the VAV units' system is another air handler");
  const moa = [packet("d", "AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR CONTROL DIAGRAM", "diagram")];
  const temps = bindPackets(moa, [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE", { "HEATING COIL MIN OA TEMP F": "0" }), unit(1, "AHU-2", "AHU", "AIR HANDLING UNIT SCHEDULE", { "HEATING COIL MIN OA TEMP F": "-5" })]);
  // A temperature is no minimum airflow: MINIMUM and OUTSIDE AIR stay
  // unprinted qualifiers, and the two units take their family's one diagram
  // as that (CI-58).
  assert.ok([0, 1].every((i) => /does not print "MINIMUM", "OUTSIDE AIR"; the family's one diagram detail, taken by each of its 2 units$/.test(temps.get(i)![0].evidence)));
  const panel = bindPackets([packet("fcs", "FAN COIL UNIT SEQUENCE OF OPERATION", "sequence")], [unit(0, "FCU-1", "FCU", "FAN COIL UNIT SCHEDULE", { MODEL: "FXUQ24", "ELEC PANEL": "HP1" }), unit(1, "HP-1", "HEAT_PUMP", "HEAT PUMP SCHEDULE")]);
  assert.equal(panel.get(1), undefined, "a panel named HP1 is no heat pump");
  const motor = bindPackets([packet("s", "AIR HANDLING UNIT SEQUENCE OF OPERATION", "sequence")], [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "RF-1", "FAN", "FAN SCHEDULE", { "UNIT SERVED": "AHU-1", "MOTOR SERVICE FACTOR": "1.15" }), unit(2, "RF-3", "FAN", "FAN SCHEDULE", { SERVICE: "RETURN AIR", "UNIT SERVED": "AHU-1" })]);
  assert.deepEqual([1, 2].map((i) => motor.get(i)?.map((x) => [x.packet, x.kind])), [[["s", "component_of"]], [["s", "component_of"]]]);
  // A phrase chooses for its own row, never for its schedule's other rows.
  const fans = bindPackets([packet("sw", "SWITCH CONTROLLED EXHAUST FAN DIAGRAM", "diagram"), packet("bas", "BAS CONTROLLED EXHAUST FAN DIAGRAM", "diagram")],
    [unit(0, "EF-1", "FAN", "EXHAUST FAN SCHEDULE", { "CONTROL SEQUENCE": "SWITCH CONTROLLED" }), unit(1, "EF-2", "FAN", "EXHAUST FAN SCHEDULE")]);
  assert.deepEqual(fans.get(0)?.map((x) => [x.packet, x.kind]), [["sw", "cross_reference"]]);
  assert.deepEqual(fans.get(1)?.map((x) => x.packet).sort(), ["bas", "sw"]);
});

test("a family's one detail is its units'; a detail naming another service is not a unit's; a part never inherits its host's controller; a points table of one diagram's devices is that diagram's; a section's packet is the innermost", () => {
  // CI-58: every unit of the family took the detail as its only one of the
  // kind; two details of the kind keep both proposals.
  const erv = (ps: ReturnType<typeof packet>[]) => bindPackets(ps, [unit(0, "ERV-C1", "ERV", "ENERGY RECOVERY VENTILATOR SCHEDULE"), unit(1, "ERV-C2", "ERV", "ENERGY RECOVERY VENTILATOR SCHEDULE")]);
  const c = packet("c", "C-WING ERV CONTROL DIAGRAM", "diagram");
  assert.deepEqual([0, 1].map((i) => erv([c]).get(i)?.map((x) => [x.packet, Boolean(x.proposal)])), [[["c", false]], [["c", false]]]);
  assert.match(erv([c]).get(0)![0].evidence, /the family's one diagram detail, taken by each of its 2 units$/);
  assert.ok([0, 1].every((i) => erv([c, packet("d", "D-WING ERV CONTROL DIAGRAM", "diagram")]).get(i)!.every((x) => x.proposal)));
  // CI-60: a pump or fan whose own schedule names another service.
  const dw = bindPackets([packet("dw", "DOMESTIC WATER BOOSTER PUMP SEQUENCE", "sequence")],
    [unit(0, "CP-1", "PUMP", "CONDENSATE PUMP SCHEDULE"), unit(1, "P-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "HEATING HOT WATER" }), unit(2, "P-2", "PUMP", "PUMP SCHEDULE"),
      unit(3, "P-3", "PUMP", "PUMP SCHEDULE", { SERVICE: "DOMESTIC WATER" })]);
  assert.deepEqual([0, 1, 2, 3].map((i) => dw.get(i)?.map((x) => [x.packet, Boolean(x.proposal)])), [undefined, undefined, [["dw", true]], [["dw", true]]],
    "a condensate pump and a heating water pump take no domestic water booster sequence; a domestic water pump whose row prints no BOOSTER, a proposal");
  const hw = bindPackets([packet("hw", "HEATING WATER PUMP SEQUENCE", "sequence")], [unit(0, "HWP-1", "PUMP", "PUMP SCHEDULE", { SERVICE: "HOT WATER" }), unit(1, "BP-1", "PUMP", "BOILER PUMP SCHEDULE")]);
  assert.deepEqual([0, 1].map((i) => hw.get(i)?.map((x) => x.packet)), [["hw"], ["hw"]], "HOT WATER and a boiler's pump are heating water");
  const cwp = bindPackets([packet("cw", "CONDENSER WATER PUMP SEQUENCE", "sequence")], [unit(0, "CWP-1", "PUMP", "PUMP SCHEDULE")]);
  assert.deepEqual(cwp.get(0)?.map((x) => x.packet), ["cw"], "a tag prefix is no service: CWP is a chilled or a condenser water pump");
  const ex = bindPackets([packet("ex", "EXHAUST FAN POINTS LIST", "points")],
    [unit(0, "SF-1", "FAN", "FAN SCHEDULE", { SERVICE: "SUPPLY AIR" }), unit(1, "EF-1", "FAN", "FAN SCHEDULE", { SERVICE: "TOILET EXHAUST" }), unit(2, "F-3", "FAN", "FAN SCHEDULE")]);
  assert.deepEqual([0, 1, 2].map((i) => ex.get(i)?.map((x) => [x.packet, Boolean(x.proposal)])), [undefined, [["ex", false]], [["ex", true]]]);
  // CI-61: a split system's outdoor unit takes its indoor unit's diagram, not
  // a detail of the indoor unit's own controller; the furnace takes all three.
  const split = bindPackets([packet("soo", "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION", "sequence"), packet("fdia", "FURNACE CONTROL DIAGRAM", "diagram"), packet("fctl", "FURNACE CONTROLLER", "detail")],
    [unit(0, "F-1", "FURNACE", "FURNACE SCHEDULE", { "CONDENSING UNIT": "CU-1" }), unit(1, "CU-1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE")]);
  assert.deepEqual(split.get(0)?.map((x) => [x.packet, x.kind]), [["soo", "family_detail"], ["fdia", "family_detail"], ["fctl", "family_detail"]]);
  assert.deepEqual(split.get(1)?.map((x) => [x.packet, x.kind]), [["soo", "family_detail"], ["fdia", "component_of"]]);
  // CI-59: a points table titled with no subject whose device marks are all
  // printed in one diagram on its sheet, and in no other, is that diagram's.
  const io = (marks: string[]) => bindPackets([
    packet("d1", "AHU-1 CONTROL DIAGRAM", "diagram", [sp("T-7", 100, 100), sp("T-8", 200, 100), sp("VR-1", 300, 100), sp("D-5", 400, 100)], { region: [0, 0, 1000, 500] }),
    packet("d2", "AHU-2 CONTROL DIAGRAM", "diagram", [sp("T-9", 100, 600), sp("VR-2", 300, 600)], { region: [0, 500, 1000, 1000] }),
    packet("io", "INPUT/OUTPUT SUMMARY", "points", marks.map((m, i) => sp(`${m} TEMPERATURE SENSOR`, 1100, 100 + i * 25)), { region: [1050, 0, 1600, 1000] }),
  ], [unit(0, "AHU-1", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "AHU-2", "AHU", "AIR HANDLING UNIT SCHEDULE")]);
  assert.deepEqual([0, 1].map((i) => io(["T-7", "T-8", "VR-1", "D-5"]).get(i)?.map((x) => [x.packet, x.kind])), [[["d1", "tag"], ["io", "sibling"]], [["d2", "tag"]]]);
  assert.deepEqual([0, 1].map((i) => io(["T-7", "T-9"]).get(i)?.map((x) => x.packet)), [["d1"], ["d2"]], "devices of two diagrams: neither's");
  // CI-59: of nested packets printing a sequence's heading, the innermost.
  const heading = sp("B. CONTROL SEQUENCE B (VAV WITH REHEAT)", 120, 300);
  const nested = bindPackets([
    packet("outer", "AIR HANDLING UNIT SEQUENCE OF OPERATION", "sequence", [heading, sp("THE UNIT SHALL START", 120, 330)]),
    packet("inner", "B. CONTROL SEQUENCE B (VAV WITH REHEAT)", "sequence", [heading], { region: [100, 290, 900, 600] }),
  ], [unit(0, "VAV-1", "VAV", "VAV BOX SCHEDULE", { "CONTROL SEQUENCE": "B" })]);
  assert.deepEqual(nested.get(0)?.map((x) => [x.packet, x.kind]), [["inner", "cross_reference"]]);
});

test("a part takes the drawings of a host the set does not schedule, or of its own designation under the set's convention; a title's letters before a spaced mark are its qualifier", () => {
  const acu = [
    packet("a1", "AIR CONDITIONING UNIT (ACU-A-1) - BUILDING 101", "diagram"),
    packet("a2", "AIR CONDITIONING UNIT (ACU-A-2) - BUILDING 101", "diagram"),
    packet("a36", "AIR CONDITIONING UNIT (ACU-A-3, ACU A-4, ACU A-5, AND ACU A-6) - BUILDING 101", "diagram"),
  ];
  // CI-55: a row's SERVICE names a host no schedule carries; a bare "A-1" is
  // a zone or a room as often as a unit.
  const coil = (i: number, tag: string, service: string) => unit(i, tag, "DUCT_MOUNTED_COIL", "HEATING COIL SCHEDULE", { SERVICE: service });
  const host = bindPackets(acu, [coil(0, "HC-A-1", "ACU-A-1"), coil(1, "HC-A-4", "ACU-A-4"), coil(2, "HC-3", "A-1")]);
  assert.deepEqual([0, 1, 2].map((i) => host.get(i)?.map((x) => [x.packet, x.kind, Boolean(x.proposal)])), [[["a1", "component_of", false]], [["a36", "component_of", false]], undefined]);
  assert.match(host.get(0)![0].evidence, /names ACU-A-1 \(SERVICE\), which the set does not schedule/);
  // CI-56: supply fans whose schedule prints no owner take the host of their
  // own designation where every part that names one follows it; one row
  // naming another's host withdraws the convention.
  const parts = [coil(0, "HC-A-1", "ACU-A-1"), coil(1, "HC-A-2", "ACU-A-2"),
    unit(2, "E-A-1", "FAN", "RETURN FAN SCHEDULE", { SERVICE: "ACU-A-1" }), unit(3, "E-A-2", "FAN", "RETURN FAN SCHEDULE", { SERVICE: "ACU-A-2" })];
  const supply = [unit(4, "S-A-1", "FAN", "SUPPLY FAN SCHEDULE", { CFM: "4000" }), unit(5, "S-A-2", "FAN", "SUPPLY FAN SCHEDULE", { CFM: "4000" })];
  const conv = bindPackets(acu, [...parts, ...supply]);
  assert.deepEqual([4, 5].map((i) => conv.get(i)?.map((x) => [x.packet, x.kind])), [[["a1", "component_of"]], [["a2", "component_of"]]]);
  assert.match(conv.get(4)![0].evidence, /the set's 4 parts that name theirs each name the ACU of their own designation/);
  const against = bindPackets(acu, [...parts, unit(6, "E-A-3", "FAN", "RETURN FAN SCHEDULE", { SERVICE: "ACU-A-1" }), ...supply]);
  assert.deepEqual([4, 5].map((i) => against.get(i)), [undefined, undefined]);
  // CI-57: "ACU A-7" is ACU-A-7, never the return fan marked E-A-7; a list's
  // later marks carry the qualifier; a word the set names no kind by
  // qualifies nothing.
  const keys = (t: string, sched: string[], kinds: string[]) => titleTags(t, sched.map((x) => tagKey(x)!), new Set(kinds)).map((x) => `${x.key.qualifier ?? ""}|${x.key.prefix}-${x.key.n}`);
  assert.deepEqual(keys("ACU A-7 CONTROL DIAGRAM", ["E-A-7"], ["ACU", "E"]), ["ACU|A-7"]);
  assert.deepEqual(keys("ACU A-3, A-4 AND A-5 SEQUENCE", ["E-A-4"], ["ACU"]), ["ACU|A-3", "ACU|A-4", "ACU|A-5"]);
  assert.deepEqual(keys("UNIT A-1 CONTROL DIAGRAM", ["A-1"], ["ACU"]), ["|A-1"]);
  const fan = bindPackets([packet("d7", "ACU A-7 CONTROL DIAGRAM", "diagram")], [unit(0, "E-A-7", "FAN", "RETURN FAN SCHEDULE", { SERVICE: "ACU-A-7" })]);
  assert.deepEqual(fan.get(0)?.map((x) => [x.packet, x.kind]), [["d7", "component_of"]], "the return fan takes its host's diagram as a part, not by its own mark");
});

test("a system's title is read without the words that name no subject; a service in either spacing; a designator its text defines; a part's host drawing of a kind it lacks; a schedule titled for its host (CI-72)", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}${x.proposal ? "?" : ""}`);
  // 14_OR: "SPLIT SYSTEMS - SEQUENCE OF OPERATION & BAS INTERFACE" is about
  // what the SPLIT SYSTEM HEAT PUMPS schedule lists (no row prints
  // INTERFACE), and for its fan coil it is more specific than the FAN COIL
  // UNITS sequence, which stays the hydronic fan coils' own.
  const seq = [packet("split", "SPLIT SYSTEMS - SEQUENCE OF OPERATION & BAS INTERFACE", "sequence"), packet("fcu", "FAN COIL UNITS - SEQUENCE OF OPERATION & BAS INTERFACE", "sequence")];
  const split = bindPackets(seq, [unit(0, "FC-01", "FCU", "SPLIT SYSTEM HEAT PUMPS", { SERVING: "MDF" }), unit(1, "HP-01", "CONDENSING_UNIT", "SPLIT SYSTEM HEAT PUMPS", { SERVING: "MDF" }),
    unit(2, "FC-101", "FCU", "FAN COIL UNITS", { SERVING: "CLASSROOM 135" })]);
  assert.deepEqual([0, 1, 2].map((i) => kinds(split, i)), [["split:family_detail"], ["split:family_detail"], ["fcu:family_detail"]]);
  // A service printed run together is the title's subject in two words; a
  // pump serving another system is not its.
  const snow = [packet("sm", "SNOW MELT - SEQUENCE OF OPERATION & BAS INTERFACE", "sequence")];
  const pumps = bindPackets(snow, [unit(0, "SP-1", "PUMP", "HYDRONIC PUMPS", { SERVICE: "SNOWMELT" }), unit(1, "HWP-1", "PUMP", "HYDRONIC PUMPS", { SERVICE: "HEATING WATER" })]);
  assert.deepEqual([0, 1].map((i) => kinds(pumps, i)), [["sm:system"], []]);
  assert.match(pumps.get(0)![0].evidence, /its SERVICE "SNOWMELT" names the whole subject/);
  // A system's sequence that defines a kind's designator ("HEAT EXCHANGER
  // (HX)") names the set's one unit of it, of the kind its words name; two
  // of them, or another kind marked with those letters, take nothing.
  const text = [sp("B. HEAT EXCHANGER (HX) CONTROL VALVE SHALL BE CONTROLLED BY THE BAS.", 120, 300), sp("MAKEUP AIR UNIT (MAU) SHALL BE INTERLOCKED TO THE HOOD.", 120, 330)];
  const sys = [packet("sys", "SNOW MELT - SEQUENCE OF OPERATION & BAS INTERFACE", "sequence", text)];
  const one = bindPackets(sys, [unit(0, "HX-1", "HEAT_EXCHANGER", "HEAT EXCHANGER", { LOCATION: "BOILER" }), unit(1, "MAU-1", "OUTDOOR_AIR_UNIT", "MAKE UP AIR UNITS", { SERVING: "KITCHEN" })]);
  assert.deepEqual([0, 1].map((i) => kinds(one, i)), [["sys:tag_body"], ["sys:tag_body"]]);
  assert.match(one.get(0)![0].evidence, /names its kind by its designator "\(HX\)", and HX-1 is the one HX the set schedules/);
  const two = bindPackets(sys, [unit(0, "HX-1", "HEAT_EXCHANGER", "HEAT EXCHANGER"), unit(1, "HX-2", "HEAT_EXCHANGER", "HEAT EXCHANGER")]);
  assert.deepEqual([0, 1].map((i) => kinds(two, i)), [[], []]);
  const other = bindPackets(sys, [unit(0, "HX-1", "PUMP", "PUMP SCHEDULE")]);
  assert.deepEqual(kinds(other, 0), [], "the letters name a heat exchanger here, not a pump marked HX");
  // 017_MD: a supply fan printed in its air conditioning unit's sequence and
  // points schedule (bound by its own tag) takes that unit's control diagram,
  // the one kind of drawing it has none of; a fan bound by its tag with no
  // host takes nothing more.
  const acu = [packet("d1", "AIR CONDITIONING UNIT (ACU-A-1) - BUILDING 101", "diagram"),
    packet("s1", "ACU A-1 EXISTING TO REMAIN SEQUENCE OF OPERATIONS", "sequence", [sp("SUPPLY FAN S-A-1 SHALL RUN", 120, 300), sp("RETURN FAN E-A-1 SHALL RUN", 120, 330)])];
  const parts = bindPackets(acu, [unit(0, "E-A-1", "FAN", "RETURN FAN SCHEDULE", { SERVICE: "ACU-A-1" }), unit(1, "E-A-2", "FAN", "RETURN FAN SCHEDULE", { SERVICE: "ACU-A-2" }),
    unit(2, "HC-A-1", "DUCT_MOUNTED_COIL", "HEATING COIL SCHEDULE", { SERVICE: "ACU-A-1" }), unit(3, "S-A-1", "FAN", "SUPPLY FAN SCHEDULE", { CFM: "4000" })]);
  assert.deepEqual(kinds(parts, 0), ["s1:tag_body", "d1:component_of"]);
  assert.match(parts.get(0)![1].evidence, /names ACU-A-1 \(SERVICE\), which the set does not schedule, and "AIR CONDITIONING UNIT \(ACU-A-1\) - BUILDING 101" is titled for it; the unit has no diagram of its own/);
  const lone = bindPackets(acu, [unit(0, "S-A-1", "FAN", "SUPPLY FAN SCHEDULE", { CFM: "4000" })]);
  assert.ok(!kinds(lone, 0).some((k) => k.startsWith("d1:")), "no row names a host and no convention holds: no host's diagram");
  // 030_NY: a heat exchanger scheduled under "DOAS HEAT EXCHANGER SCHEDULE"
  // is the set's one DOAS's part; terminal units scheduled "(AHU 2)" are
  // served by that unit, never its parts; with two DOAS units, neither.
  const doas = [packet("ds", "SEQUENCE OF OPERATION FOR DOAS", "sequence"), packet("dd", "DOAS UNIT CONTROL DIAGRAM", "diagram")];
  const hx = bindPackets(doas, [unit(0, "DOAS-1", "DOAS", "DOAS SCHEDULE", { LOCATION: "ROOF" }), unit(1, "DHX-1", "HEAT_EXCHANGER", "DOAS HEAT EXCHANGER SCHEDULE", { "ASSOCIATED EQUIPMENT": "DHX-1" })]);
  assert.deepEqual(kinds(hx, 1), ["ds:component_of", "dd:component_of"]);
  assert.match(hx.get(1)![0].evidence, /its schedule describes it as part of DOAS-1/);
  const twoDoas = bindPackets(doas, [unit(0, "DOAS-1", "DOAS", "DOAS SCHEDULE"), unit(1, "DOAS-2", "DOAS", "DOAS SCHEDULE"), unit(2, "DHX-1", "HEAT_EXCHANGER", "DOAS HEAT EXCHANGER SCHEDULE")]);
  assert.deepEqual(kinds(twoDoas, 2), []);
  const ahu = [packet("as", "AIR HANDLING UNIT SEQUENCE OF OPERATION", "sequence")];
  const atu = bindPackets(ahu, [unit(0, "AHU-2", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "ATU A", "VAV", "AIR TERMINAL UNIT SCHEDULE (AHU 2)")]);
  assert.deepEqual(kinds(atu, 1), [], "a terminal unit an air handler serves is not its part");
});

test("a terminal unit named in words is an air terminal unit to the binder and its readers, never to the finder (CI-73)", () => {
  // 039_TX: the AIR TERMINAL UNIT SCHEDULE's units and the "DUAL DUCT
  // TERMINAL UNIT" drawings. The schedule-title rules (and the finder that
  // reads them) name no family for those words; the control drawings do.
  for (const t of ["DUAL DUCT TERMINAL UNIT CONTROL DIAGRAM", "SINGLE DUCT TERMINAL BOX SEQUENCE", "TERMINAL UNITS POINTS LIST"]) {
    assert.equal(subjectFamily(t), null, t);
    assert.equal(controlFamily(t), "VAV", t);
  }
  assert.equal(controlFamily("PACKAGED TERMINAL UNIT CONTROLS"), null, "a packaged terminal unit is no air terminal unit");
  assert.equal(controlFamily("WATER SOURCE HEAT PUMP TERMINAL UNIT CONTROLS"), subjectFamily("WATER SOURCE HEAT PUMP TERMINAL UNIT CONTROLS"), "another family named in words keeps it");
  const dd = [packet("dg", "DUAL DUCT TERMINAL UNIT CONTROL DIAGRAM", "diagram"), packet("sq", "DUAL DUCT TERMINAL UNIT SEQUENCE OF OPERATION", "sequence")];
  const tu = (i: number, tag: string) => unit(i, tag, "VAV", "BLDG 109 AIR TERMINAL UNIT SCHEDULE", { "CONTROL TYPE": "VAV" }, ["DUAL DUCT TERMINAL UNIT, PRESSURE INDEPENDENT"]);
  const b = bindPackets(dd, [tu(0, "TU-101C"), tu(1, "TU-101H"), unit(2, "FCU-1", "FCU", "FAN COIL UNIT SCHEDULE")]);
  assert.deepEqual([0, 1].map((i) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}${x.proposal ? "?" : ""}`)), [["dg:family_detail", "sq:family_detail"], ["dg:family_detail", "sq:family_detail"]]);
  assert.equal(b.get(2), undefined, "a fan coil takes no terminal unit's drawing");
  // Rows that never say dual duct: the family's one design (CI-58), said so;
  // beside a single duct diagram, the dual duct one stays a proposal.
  const plain = bindPackets(dd, [unit(0, "TU-1", "VAV", "AIR TERMINAL UNIT SCHEDULE", { "CONTROL TYPE": "VAV" }), unit(1, "TU-2", "VAV", "AIR TERMINAL UNIT SCHEDULE", { "CONTROL TYPE": "VAV" })]);
  assert.match(plain.get(0)![0].evidence, /its row does not print "DUAL DUCT"; the family's one diagram detail, taken by each of its 2 units/);
  const two = bindPackets([...dd, packet("sd", "SINGLE DUCT TERMINAL UNIT CONTROL DIAGRAM", "diagram")], [unit(0, "TU-1", "VAV", "AIR TERMINAL UNIT SCHEDULE", { "CONTROL TYPE": "VAV" })]);
  assert.deepEqual((two.get(0) ?? []).filter((x) => x.packet === "dg").map((x) => Boolean(x.proposal)), [true], "two variants of the diagram: the row must say which");
});

test("a mark with a building's number before it is a tag: a title naming its mark, with or without the number, is the unit's; another building's is not", () => {
  // 05_MO: 1-AC-15 and 1-AC-28 each have a points list "(APPLIES TO AC-15)"
  // and a sequence "(1-AC-15)"; the untitled list beside AC-57's sequence is
  // AC-57's, not theirs (CI-63).
  assert.deepEqual(tagKey("1-AC-15"), { prefix: "AC", n: 15, suffix: "", qualifier: "1" });
  const ps = [
    packet("p15", "AHU POINTS LIST (APPLIES TO AC-15)", "points"), packet("s15", "SEQUENCE OF OPERATION FOR VAV AIR HANDLING UNIT", "sequence", [], { subtitle: "(1-AC-15)" }),
    packet("p28", "AHU POINTS LIST (APPLIES TO AC-28)", "points"), packet("p57", "AHU POINTS LIST", "points"),
    packet("s57", "SEQUENCE OF OPERATION FOR VAV AIR HANDLING UNIT", "sequence", [], { subtitle: "(1-AC-57)" }), packet("x", "2-AC-15 CONTROL DIAGRAM", "diagram"),
  ];
  const b = bindPackets(ps, [unit(0, "1-AC-15", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "1-AC-28", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(2, "AC-57", "AHU", "AIR HANDLING UNIT SCHEDULE")]);
  assert.deepEqual(b.get(0)?.map((x) => [x.packet, x.kind]), [["p15", "tag"], ["s15", "tag"]]);
  assert.deepEqual(b.get(1)?.map((x) => [x.packet, x.kind]), [["p28", "tag"]]);
  assert.deepEqual(b.get(2)?.map((x) => x.packet).includes("s57"), true);
  assert.ok(![0, 1, 2].some((i) => b.get(i)?.some((x) => x.packet === "x")), "building 2's AC-15 is none of these");
});

test("a building's number before a mark is read wherever a mark is: a diagram's label, a row naming the other half of a split system; it is never a designator", () => {
  const kinds = (b: ReturnType<typeof bindPackets>, i: number) => (b.get(i) ?? []).map((x) => `${x.packet}:${x.kind}`);
  // A family's diagram labelled with one air handler's mark is that unit's
  // by its label, as "AC-15" would be (CI-63); the other takes it as its
  // family's.
  const d = packet("d", "AIR HANDLING UNIT CONTROL DIAGRAM", "diagram", [sp("1-AC-15", 100, 100)]);
  const labelled = bindPackets([d], [unit(0, "1-AC-15", "AHU", "AIR HANDLING UNIT SCHEDULE"), unit(1, "1-AC-28", "AHU", "AIR HANDLING UNIT SCHEDULE")]);
  assert.deepEqual([0, 1].map((i) => kinds(labelled, i)), [["d:tag_body"], ["d:family_detail"]]);
  // The halves of a split system, paired by a row that names the other with
  // its building's number: the indoor unit's row, or the outdoor unit's
  // SERVICE.
  const fd = packet("fd", "1-F-3 CONTROL DIAGRAM", "diagram");
  const fromIndoor = bindPackets([fd], [
    unit(0, "1-F-3", "FURNACE", "FURNACE SCHEDULE", { "CONDENSING UNIT": "1-CU-3" }), unit(1, "1-CU-3", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE"),
  ]);
  assert.deepEqual(kinds(fromIndoor, 1), ["fd:component_of"]);
  const fromOutdoor = bindPackets([fd], [
    unit(0, "1-F-3", "FURNACE", "FURNACE SCHEDULE"), unit(1, "1-CU-3", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE", { SERVICE: "1-F-3" }),
  ]);
  assert.deepEqual(kinds(fromOutdoor, 1), ["fd:component_of"]);
  // Or a bare mark the halves share, after the building's number
  // ("SERVICE: 1-C1"): the one indoor unit of that mark, whose diagram the
  // outdoor unit bound to its own sequence takes; never a guess between two.
  const pair = [packet("seq", "FURNACE AND CONDENSING UNIT SEQUENCE OF OPERATION", "sequence"), packet("cd", "FURNACE CONTROL DIAGRAM", "diagram")];
  const halves = [unit(0, "C1", "FURNACE", "FURNACE SCHEDULE", { "F ~": "C1" }), unit(1, "C1", "CONDENSING_UNIT", "CONDENSING UNIT SCHEDULE", { "CU ~": "C1", SERVICE: "1-C1" })];
  const shared = bindPackets(pair, halves);
  assert.deepEqual(kinds(shared, 1), ["seq:family_detail", "cd:component_of"]);
  assert.match(shared.get(1)![1].evidence, /is the outdoor unit of C1/);
  assert.deepEqual(kinds(bindPackets(pair, [...halves, unit(2, "C1", "ERV", "ENERGY RECOVERY VENTILATOR SCHEDULE", { "ERV ~": "C1" })]), 1), ["seq:family_detail"]);
  // A number before a mark says where the unit is, never what it is: the
  // furnace B1, whose schedule prints its marks under "F ~", is a title's
  // "1-B1" (a designator it does not print, "OAU-B1", says it is not).
  const b1 = bindPackets([packet("t", "1-B1 CONTROL DIAGRAM", "diagram"), packet("o", "OAU-B1 CONTROL DIAGRAM", "diagram")], [unit(0, "B1", "FURNACE", "FURNACE SCHEDULE", { "F ~": "B1" })]);
  assert.deepEqual(kinds(b1, 0), ["t:tag"]);
});

test("vocabulary: INPUT/OUTPUT lists, P&IDs and a unit's controller name control evidence; a points list needs no subject; lighting is another trade's", () => {
  assert.equal(packetKind("INPUT/OUTPUT SUMMARY"), "points");
  assert.equal(packetKind("BAS INPUT/OUTPUT POINT LIST"), "points");
  assert.equal(packetKind("CONTROLS POINTS LIST"), "points");
  assert.equal(packetKind("HEATING WATER SYSTEM P&ID"), "diagram");
  assert.equal(packetKind("PIPING AND INSTRUMENTATION DIAGRAM - AHU-1"), "diagram");
  assert.equal(packetKind("PIPING DIAGRAM - AHU-1"), null);
  assert.equal(packetKind("FURNACE CONTROLLER"), "detail");
  assert.equal(packetKind("VAV CONTROLLER MOUNTING DETAIL"), null);
  assert.equal(packetKind("LIGHT CONTROLS"), null);
  assert.equal(packetKind("LIGHTING CONTROL DIAGRAM"), null);
  assert.equal(packetKind("LIGHTING AND EXHAUST FAN CONTROL DIAGRAM"), "diagram");
  assert.equal(packetKind("HVAC CONTROLS"), null);
});

test("two titles side by side on one baseline, each run to a second line, are two titles", () => {
  const spans = [
    sp("BUILDING B OUTSIDE AIR SEQUENCE OF", 100, 100, 48), sp("OPERATION", 100, 158, 48),
    sp("ROOFTOP UNIT WITH BAROMETRIC RELIEF", 1190, 100, 48), sp("SEQUENCE OF OPERATION (BID ALTERNATE 1)", 1190, 158, 48),
    ...para(120, 250, 10, "THE OUTSIDE AIR UNIT SHALL START WHEN THE BUILDING IS OCCUPIED"),
    ...para(1210, 250, 10, "THE ROOFTOP UNIT SHALL MODULATE ITS ECONOMIZER TO MAINTAIN SETPOINT"),
  ];
  const titles = findPackets("s.pdf#20", spans).map((p) => p.title);
  assert.ok(titles.includes("BUILDING B OUTSIDE AIR SEQUENCE OF OPERATION"), titles.join(" | "));
  assert.ok(titles.includes("ROOFTOP UNIT WITH BAROMETRIC RELIEF SEQUENCE OF OPERATION (BID ALTERNATE 1)"), titles.join(" | "));
});

test("a points table's title set on two lines, or in two overlapping runs, inside the table the graph extracted, is its title", () => {
  const table = [sp("NAME", 520, 240, 25), sp("DESCRIPTION", 900, 240, 25), sp("BI1", 520, 280, 25), sp("FAN STATUS", 600, 280, 25), sp("BO1", 520, 320, 25), sp("FAN START/STOP", 600, 320, 25)];
  const twoLines = [sp("SCHEDULED EXHAUST FAN", 640, 110, 50), sp("DDC POINTS LIST", 700, 170, 50), ...table, ...para(3000, 100, 12)];
  const a = findPackets("s.pdf#21", twoLines, [{ title: "SCHEDULED EXHAUST FAN DDC POINTS LIST", region: [500, 100, 1400, 400] }]);
  assert.deepEqual(a.map((p) => [p.kind, p.title]), [["points", "SCHEDULED EXHAUST FAN DDC POINTS LIST"]]);
  // "DDC POINTS LIST SUMMARY " ends past where "- CHILLED WATER SYSTEM" starts.
  const w = "DDC POINTS LIST SUMMARY ".length * 0.55 * 28;
  const overlapping = [sp("DDC POINTS LIST SUMMARY ", 600, 110, 28), sp("- CHILLED WATER SYSTEM", 600 + w - 24, 110, 28), ...table, ...para(3000, 100, 12, "THE CHILLER SHALL START ON A CALL FOR COOLING FROM THE BAS")];
  const b = findPackets("s.pdf#22", overlapping, [{ title: "DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM", region: [500, 100, 1400, 400] }]);
  assert.deepEqual(b.map((p) => [p.kind, p.title]), [["points", "DDC POINTS LIST SUMMARY - CHILLED WATER SYSTEM"]]);
});

test("a points table's title centred over its header row heads the table", () => {
  const spans = [
    sp("BAS INPUT/OUTPUT POINT LIST", 3471, 1474, 28), sp("TAG", 3080, 1531, 28), sp("POINT NAME", 3408, 1531, 28), sp("AI", 3838, 1531, 28), sp("AO", 3919, 1531, 28),
    sp("CH-1", 3080, 1571, 28), sp("CHILLER STATUS", 3408, 1571, 28),
    // The page's body text is the title's size: the title is a body-size heading.
    ...Array.from({ length: 12 }, (_, i) => sp("THE CHILLED WATER PLANT SHALL BE ENABLED BY THE BAS SCHEDULE", 300, 300 + i * 34, 28)),
  ];
  const packets = findPackets("s.pdf#23", spans, [{ title: "BAS INPUT/OUTPUT POINT LIST", region: [3054, 1456, 4245, 2570] }]);
  assert.ok(packets.some((p) => p.kind === "points" && p.title === "BAS INPUT/OUTPUT POINT LIST"), packets.map((p) => p.title).join(" | "));
});

test("a points title printed as the first row of the table the graph extracted heads that table, whatever text is printed right above it", () => {
  // 01_NY's first INPUT/OUTPUT SUMMARY, under the air handler's sequence (CI-59).
  const spans = [
    ...Array.from({ length: 8 }, (_, i) => sp("THE AIR HANDLING UNIT SHALL MAINTAIN THE SUPPLY AIR TEMPERATURE SETPOINT", 3060, 1200 + i * 23)),
    sp("INPUT/OUTPUT SUMMARY", 3100, 1392, 25),
    sp("POINT", 3070, 1440), sp("DESCRIPTION", 3200, 1440), sp("AI", 3700, 1440), sp("AO", 3780, 1440),
    ...["T-7 SUPPLY AIR TEMPERATURE", "T-8 MIXED AIR TEMPERATURE", "VR-1 SUPPLY FAN SPEED", "D-5 OUTSIDE AIR DAMPER"].map((r, i) => sp(r, 3070, 1480 + i * 30)),
  ];
  const io = findPackets("s.pdf#87", spans, [{ title: "INPUT/OUTPUT SUMMARY", region: [3050, 1388, 4000, 1650] }]).find((p) => p.title === "INPUT/OUTPUT SUMMARY");
  assert.equal(io?.direction, "below_title");
  assert.ok(io!.region[1] >= 1388 && io!.region[3] >= 1600, `the table's rows, not the sequence above: ${io!.region}`);
});

test("a caption under a sparse diagram lettered at a quarter turn is its caption; on a sheet of control drawings one kind of control content confirms it", () => {
  const spans = [
    sp("CONTROLS SYMBOLS", 549, 442, 38), sp("TEMPERATURE SENSOR", 560, 520, 19),
    sp("RETURN FAN", 3873, 600, 19), sp("TEMPERATURE SENSOR", 3800, 700, 19), sp("PRE FILTER", 3767, 941, 19, 90), sp("FINAL FILTER", 3889, 941, 19, 90),
    sp("AIR CONDITIONING UNIT (ACU-A-1) - BUILDING 101", 3782, 1260, 25),
    sp("RETURN FAN", 3873, 1605, 19), sp("OUTSIDE AIR TEMPERATURE SENSORS (TYP)", 3700, 1700, 19),
    sp("AIR CONDITIONING UNIT (ACU-A-2) - BUILDING 101", 3782, 2674, 25),
    ...para(1000, 600, 10, "PROVIDE NEW CONTROL POINTS FOR THE EXISTING AIR CONDITIONING UNITS AS SHOWN"),
  ];
  const packets = findPackets("s.pdf#24", spans);
  const a1 = packets.find((p) => p.title === "AIR CONDITIONING UNIT (ACU-A-1) - BUILDING 101");
  assert.ok(a1, packets.map((p) => p.title).join(" | "));
  assert.equal(a1!.direction, "above_title");
  assert.ok(a1!.spans.some((s) => s.str === "PRE FILTER"));
});

test("a heading whose subject the line under it repeats heads that block; a sequence about its own subject is never part of another drawing's caption", () => {
  const spans = [
    sp("CHILLED WATER SYSTEM", 3326, 38, 57), sp("CHILLED WATER SYSTEM CONTROL SEQUENCE (CH-1, CHP-1, CHP-2):", 3350, 157, 21),
    ...para(3350, 190, 30, "CHILLED WATER PUMPS OPERATE IN A LEAD / LAG CONFIGURATION WHEN THE SYSTEM IS ON"),
    sp("FAN COIL UNITS", 3326, 1899, 57), sp("FAN COIL UNITS - SEQUENCE OF OPERATION & BAS INTERFACE", 3348, 2022, 21),
    ...para(3348, 2055, 8, "THE FAN COIL UNIT SHALL CYCLE ITS FAN TO MAINTAIN THE SPACE SETPOINT"),
  ];
  const titles = findPackets("s.pdf#25", spans).map((p) => p.title);
  assert.ok(titles.includes("CHILLED WATER SYSTEM CONTROL SEQUENCE (CH-1, CHP-1, CHP-2):"), titles.join(" | "));
  assert.ok(titles.includes("FAN COIL UNITS - SEQUENCE OF OPERATION & BAS INTERFACE"), titles.join(" | "));
  // A body-size sequence heading about another subject in a caption's lane is its own packet.
  const lane = [
    sp("DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE", 356, 1750, 28),
    ...Array.from({ length: 20 }, (_, i) => sp("THE DOAS SHALL START ON A CALL FROM THE BAS AND MODULATE ITS VALVE", 356, 1790 + i * 34, 28)),
    sp("DOAS 3", 900, 2480, 28), sp("SUPPLY AIR TEMPERATURE SENSOR", 1200, 2520, 28), sp("VFD", 1600, 2560, 28),
    sp("DOAS 3 P&ID", 1352, 2683, 50),
  ];
  const lt = findPackets("s.pdf#26", lane).map((p) => p.title);
  assert.ok(lt.includes("DOAS 3 P&ID"), lt.join(" | "));
  assert.ok(lt.includes("DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE"), lt.join(" | "));
});

test("a caption over a schedule the graph extracted is the schedule's title; over a points table, control evidence", () => {
  const sched = [
    // A schedule that prints control words (VFD, BAS) in its cells.
    sp("TAG", 300, 200, 19), sp("CFM", 500, 200, 19), sp("VFD", 700, 200, 19), sp("BAS", 800, 200, 19), sp("EF-1", 300, 240, 19), sp("2400", 500, 240, 19), sp("YES", 700, 240, 19),
    sp("EXHAUST FANS", 400, 400, 41), ...para(2000, 200, 12, "PROVIDE EACH FAN WITH A DISCONNECT SWITCH AND A STATUS CONTACT"),
  ];
  assert.deepEqual(findPackets("s.pdf#27", sched, [{ title: "EXHAUST FANS", region: [280, 180, 900, 280] }]).map((p) => p.title), []);
  const points = [
    sp("POINT", 300, 200, 19), sp("AI", 500, 200, 19), sp("BO", 600, 200, 19), sp("BI", 700, 200, 19), sp("SUPPLY FAN STATUS", 300, 240, 19), sp("SENSOR", 500, 240, 19),
    sp("VARIABLE AIR VOLUME AHU (AHU-1)", 300, 400, 41), ...para(2000, 200, 12, "THE AIR HANDLER SHALL START ON THE OCCUPANCY SCHEDULE AND RUN"),
  ];
  assert.ok(findPackets("s.pdf#28", points, [{ title: "VARIABLE AIR VOLUME AHU (AHU-1)", region: [280, 180, 900, 280] }]).some((p) => p.title === "VARIABLE AIR VOLUME AHU (AHU-1)"));
});
