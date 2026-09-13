import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSequenceNarratives } from "../src/lib/sequenceNarrative.ts";

const span = (str: string, x: number, y: number, w = 260, h = 14) => ({ str, x, y, w, h });

describe("free-form sequence narratives", () => {
  it("extracts a construction narrative printed above its detail title", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#17",
      spans: [
        span("GENERAL:", 80, 80, 90),
        span("THE SYSTEM SHALL START WHEN OCCUPANCY IS ENABLED.", 80, 105, 360),
        span("1. ENABLE THE SUPPLY FAN AND PROVE STATUS.", 80, 135, 330),
        span("2. MODULATE THE COOLING VALVE TO MAINTAIN SETPOINT.", 80, 165, 390),
        span("AHU-1 SEQUENCE OF OPERATION", 140, 410, 310, 24),
        span("ALARM", 200, 570, 70),
        span("AHU-1 CONTROL SYSTEM SCHEMATIC", 140, 650, 330, 24),
        span("M6.3", 940, 760, 45, 18),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].direction, "above_title");
    assert.equal(blocks[0].status, "extracted");
    assert.match(blocks[0].sections.map((section) => section.body).join(" "), /PROVE STATUS/);
    assert.deepEqual(blocks[0].sections.flatMap((section) => section.evidence)[0].bbox, [80, 80, 170, 94]);
  });

  it("extracts specification-style prose below a heading", () => {
    const blocks = extractSequenceNarratives([{
      key: "spec.pdf#2",
      spans: [
        span("AIR HANDLING UNIT SEQUENCE OF OPERATION", 80, 60, 420, 24),
        span("OCCUPIED MODE:", 80, 110, 160),
        span("THE CONTROLLER SHALL ENABLE THE SUPPLY FAN.", 80, 140, 360),
        span("SAFETIES:", 80, 190, 100),
        span("A FREEZE STAT TRIP SHALL DISABLE THE FAN.", 80, 220, 350),
      ],
    }]);
    assert.equal(blocks[0].direction, "below_title");
    assert.equal(blocks[0].sections.length, 2);
    assert.deepEqual(blocks[0].sections.map((section) => section.heading), ["OCCUPIED MODE", "SAFETIES"]);
  });

  it("keeps neighboring side-by-side sequences from stealing each other's prose", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#20",
      spans: [
        span("ENABLE LEFT SUPPLY VALVE WHEN OCCUPIED.", 70, 100, 360),
        span("MODULATE LEFT REHEAT CONTROL VALVE.", 70, 130, 340),
        span("ENABLE RIGHT EXHAUST VALVE WHEN OCCUPIED.", 580, 100, 370),
        span("MODULATE RIGHT AIRFLOW CONTROL VALVE.", 580, 130, 360),
        span("LEFT SYSTEM SEQUENCE OF OPERATION", 100, 420, 360, 24),
        span("RIGHT SYSTEM SEQUENCE OF OPERATION", 610, 420, 370, 24),
      ],
    }]);
    assert.equal(blocks.length, 2);
    const left = blocks.find((block) => block.title.startsWith("LEFT"))!;
    const right = blocks.find((block) => block.title.startsWith("RIGHT"))!;
    assert.match(left.sections.map((section) => section.body).join(" "), /LEFT REHEAT/);
    assert.doesNotMatch(left.sections.map((section) => section.body).join(" "), /RIGHT AIRFLOW/);
    assert.match(right.sections.map((section) => section.body).join(" "), /RIGHT AIRFLOW/);
    assert.doesNotMatch(right.sections.map((section) => section.body).join(" "), /LEFT REHEAT/);
  });

  it("joins equipment names split from the sequence phrase on the same drawn line", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#24",
      spans: [
        span("TOILET EXHAUST FANS", 80, 100, 185, 18),
        span("-", 270, 100, 6, 18),
        span("SEQUENCE OF OPERATION:", 282, 100, 225, 18),
        span("THE BMS SHALL INTERLOCK THE EXHAUST FANS WITH THE AIR HANDLING UNIT.", 80, 135, 520),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].title, "TOILET EXHAUST FANS - SEQUENCE OF OPERATION:");
    assert.match(blocks[0].sections[0].body, /INTERLOCK/);
  });

  it("retains punctuation-split control tags in a narrative line with exact fragment evidence", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#53",
      spans: [
        span("A. DOAH SUPPLY FAN STATUS (DOAHSF", 80, 100, 286, 18),
        span("-", 366, 100, 6, 18),
        span("S)", 372, 100, 16, 18),
        span("DOAH SEQUENCE OF OPERATION", 80, 400, 420, 28),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].sections[0].body, "DOAH SUPPLY FAN STATUS (DOAHSF-S)");
    assert.deepEqual(blocks[0].sections[0].evidence.map((item) => item.text), [
      "A. DOAH SUPPLY FAN STATUS (DOAHSF", "-", "S)",
    ]);
    assert.deepEqual(blocks[0].sections[0].evidence.map((item) => item.bbox), [
      [80, 100, 366, 118], [366, 100, 372, 118], [372, 100, 388, 118],
    ]);
  });

  it("retains normal font-run gaps and one-word wrapped sentence completions", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#16",
      spans: [
        span("GENERAL:", 80, 90, 90, 16),
        span("THE DUCTLESS SPLIT SYSTEM SHALL BE", 80, 120, 310, 16),
        span("ENABLED.", 80, 140, 75, 16),
        span("THE CONTRACTOR SHALL PROVIDE A NEW DDC", 80, 170, 300, 16),
        span("CONTROL PACKAGE.", 392, 170, 150, 16),
        span("UNIT SEQUENCE OF OPERATION", 80, 300, 360, 28),
      ],
    }]);
    const body = blocks[0].sections.map((section) => section.body).join(" ");
    assert.match(body, /DUCTLESS SPLIT SYSTEM SHALL BE ENABLED\./);
    assert.match(body, /NEW DDC CONTROL PACKAGE\./);
    assert.deepEqual(blocks[0].sections.flatMap((section) => section.evidence).map((item) => item.text), [
      "GENERAL:", "THE DUCTLESS SPLIT SYSTEM SHALL BE", "ENABLED.",
      "THE CONTRACTOR SHALL PROVIDE A NEW DDC", "CONTROL PACKAGE.",
    ]);
  });

  it("keeps hierarchical clause numbers while ordinary heating sentences remain prose", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#64",
      spans: [
        span("DOAH-T1 SEQUENCE OF OPERATION", 80, 60, 390, 24),
        span("3.2.3.3.1 PROOFS", 80, 100, 180, 16),
        span("A. SUPPLY FAN STATUS SHALL BE MONITORED.", 80, 125, 360, 16),
        span("3.2.3.3.2 SAFETIES", 80, 160, 200, 16),
        span("A. FREEZESTAT SHALL DISABLE THE FAN.", 80, 185, 330, 16),
        span("HEATING VALVE AT ANY BOX IS OPEN 10% OR MORE AND SHALL REMAIN AVAILABLE.", 80, 210, 590, 16),
      ],
    }]);
    assert.deepEqual(blocks[0].sections.map((section) => section.heading), [
      "3.2.3.3.1", "A.", "3.2.3.3.2", "A.",
    ]);
    assert.match(blocks[0].sections.at(-1)!.body, /HEATING VALVE AT ANY BOX/);
  });

  it("does not join same-baseline narrative fragments across a column-sized gap", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#53",
      spans: [
        span("A. THE FAN SHALL ENABLE.", 80, 100, 190, 18),
        span("B. THE VALVE SHALL CLOSE.", 420, 100, 200, 18),
        span("FAN SEQUENCE OF OPERATION", 80, 400, 360, 28),
      ],
    }]);
    const bodies = blocks[0].sections.map((section) => section.body);
    assert.deepEqual(bodies, ["THE FAN SHALL ENABLE.", "THE VALVE SHALL CLOSE."]);
    assert.equal(blocks[0].sections.flatMap((section) => section.evidence).length, 2);
  });

  it("retains a compact authored system tag printed after an under-detail SOO title", () => {
    const blocks = extractSequenceNarratives([{
      key: "lift-station.pdf#26",
      spans: [
        span("PUMP CONTROL", 80, 100, 150),
        span("1. PUMP TO BE PROGRAMMED FOR LEAD / LAG CONTROL.", 80, 130, 410),
        span("2. ROTATE LEAD WHEN BOTH PUMPS OFF.", 80, 160, 330),
        span("02 BUILDING 214 SEQUENCE OF OPERATIONS IW-LS-3", 80, 410, 520, 24),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].title, "02 BUILDING 214 SEQUENCE OF OPERATIONS IW-LS-3");
    assert.equal(blocks[0].direction, "above_title");
    assert.match(blocks[0].sections.map((section) => section.body).join(" "), /LEAD \/ LAG CONTROL/);
  });

  it("uses the matching upstream detail caption to exclude schematic labels", () => {
    const blocks = extractSequenceNarratives([{
      key: "lift-station.pdf#26",
      spans: [
        span("MS1 RUN AUTO SW", 80, 60, 160),
        span("PANEL TEMP", 80, 90, 120),
        span("01 BUILDING 214 LIFT STATION DETAIL IW-LS-3", 80, 240, 470, 22),
        span("PUMP CONTROL", 80, 290, 150),
        span("1. PUMP TO BE PROGRAMMED FOR LEAD / LAG CONTROL.", 80, 320, 410),
        span("2. ROTATE LEAD WHEN BOTH PUMPS OFF.", 80, 350, 330),
        span("PUMP START / STOP", 350, 290, 150),
        span("1. MEASURE SUMP LEVEL.", 350, 320, 150),
        span("STATION VAULT", 700, 330, 120),
        span("02 BUILDING 214 SEQUENCE OF OPERATIONS IW-LS-3", 80, 410, 520, 24),
      ],
    }]);
    const body = blocks[0].sections.map((section) => section.body).join(" ");
    assert.match(body, /LEAD \/ LAG CONTROL/);
    assert.doesNotMatch(body, /MS1 RUN|LIFT STATION DETAIL|STATION VAULT/);
  });

  it("still rejects an instruction that mentions a tagged sequence", () => {
    const blocks = extractSequenceNarratives([{
      key: "notes.pdf#1",
      spans: [
        span("VERIFY THE SEQUENCE OF OPERATIONS IW-LS-3.", 80, 100, 420),
      ],
    }]);
    assert.deepEqual(blocks, []);
  });

  it("rejects requirements that merely mention sequence of operation", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#1",
      spans: [
        span("INSTALL DDC HARDWARE TO PERFORM THIS SEQUENCE OF OPERATION AND PROVIDE ALL INPUTS.", 80, 100, 650),
        span("VERIFY THE ACCURACY AND ADEQUACY OF THE SEQUENCE OF CONTROL.", 80, 140, 520),
        span("SEE FIRE PROTECTION DRAWINGS FOR CONTROL SEQUENCES.", 80, 180, 480),
        span("SYSTEM THAT WILL ACCOMPLISH THE SEQUENCE OF OPERATIONS.", 80, 220, 520),
      ],
    }]);
    assert.deepEqual(blocks, []);
  });

  it("rejects an SOO abbreviation legend and a wrapped bullet continuation", () => {
    const blocks = extractSequenceNarratives([{
      key: "legend.pdf#1",
      spans: [
        span("SOO", 80, 80, 40, 18),
        span("SEQUENCE OF OPERATION", 180, 80, 230, 18),
        span("3. PROVIDE WIRING DIAGRAMS, SCHEMATICS, AND", 80, 150, 430, 18),
        span("CONTROL SEQUENCES.", 92, 172, 190, 18),
      ],
    }]);
    assert.deepEqual(blocks, []);
  });

  it("does not turn a drawing scale caption into sequence prose", () => {
    const blocks = extractSequenceNarratives([{
      key: "details.pdf#3",
      spans: [
        span("CHILLER SEQUENCE OF OPERATION", 80, 100, 420, 24),
        span("NOT DRAWN TO SCALE", 80, 138, 180, 14),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].status, "title_only");
    assert.deepEqual(blocks[0].sections, []);
  });

  it("ignores a rotated title-block copy and deduplicates repeated horizontal detail titles", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#53",
      spans: [
        span("DOAH SEQUENCE OF OPERATION", 80, 80, 310, 18),
        span("THE UNIT SHALL ENABLE IN OCCUPIED MODE.", 80, 115, 360),
        span("DOAH SEQUENCE OF OPERATION", 80, 400, 420, 28),
        { ...span("DOAH SEQUENCE OF OPERATION", 980, 100, 20, 420), rot: 90 },
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].title_evidence.bbox[1], 400, "larger authored detail title is the retained cite");
  });

  it("joins one sequence bracketed by a small heading and a scaled detail caption", () => {
    const blocks = extractSequenceNarratives([{
      key: "details.pdf#40",
      spans: [
        span("RTU - SEQUENCE OF OPERATIONS", 700, 200, 269, 19),
        span("GENERAL:", 700, 238, 90, 19),
        span("THE UNIT SHALL ENABLE OR DISABLE FROM THE OCCUPANCY SCHEDULE.", 700, 270, 560, 19),
        span("OCCUPIED MODE:", 700, 430, 150, 19),
        span("THE UNIT SHALL MODULATE THE OUTSIDE AIR DAMPER TO MAINTAIN SETPOINT.", 700, 462, 620, 19),
        span("UNOCCUPIED MODE:", 700, 720, 170, 19),
        span("IF THE FIRE ALARM SIGNALS A GENERAL ALARM, THE UNIT SHALL STOP.", 700, 752, 580, 19),
        span("5", 650, 900, 30, 50),
        span("RTU - SEQUENCE OF OPERATIONS", 700, 900, 428, 25),
        span("SCALE: NTS", 700, 934, 95, 16),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].direction, "above_title");
    assert.equal(blocks[0].title_evidence.bbox[1], 900);
    assert.match(blocks[0].sections.map((section) => section.body).join(" "), /OCCUPANCY SCHEDULE/);
    assert.match(blocks[0].sections.map((section) => section.body).join(" "), /FIRE ALARM SIGNALS/);
  });

  it("keeps equal-sized repeated titles as distinct physical sequence regions", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#54",
      spans: [
        span("CONTROL SEQUENCE", 80, 60, 220, 20),
        span("1. THE LEFT CONTROLLER SHALL ENABLE THE FAN.", 80, 95, 390, 16),
        span("CONTROL SEQUENCE", 580, 60, 220, 20),
        span("1. THE RIGHT CONTROLLER SHALL MODULATE THE VALVE.", 580, 95, 420, 16),
      ],
    }]);
    assert.equal(blocks.length, 2);
    assert.match(blocks[0].sections.map((section) => section.body).join(" "), /LEFT CONTROLLER/);
    assert.match(blocks[1].sections.map((section) => section.body).join(" "), /RIGHT CONTROLLER/);
  });

  it("does not compile a control-curve chart as prose but keeps a real bare control-sequence heading", () => {
    const chart = extractSequenceNarratives([{
      key: "controls.pdf#23",
      spans: [
        span("CONTROL SEQUENCE", 400, 60, 220, 24),
        span("ROOM TEMPERATURE", 300, 95, 150),
        span("HEATING", 450, 95, 70),
        span("ZONE SET POINT", 540, 95, 130),
        span("COOLING", 690, 95, 70),
        span("VALVE OPEN", 300, 130, 100),
        span("CONTROL DAMPER", 300, 165, 130),
        span("DAMPER UNOCCUPIED POSITION", 300, 200, 230),
        span("VALVE CLOSED", 690, 200, 110),
        span("DEADBAND", 500, 235, 90),
      ],
    }]);
    assert.deepEqual(chart, []);

    const prose = extractSequenceNarratives([{
      key: "controls.pdf#24",
      spans: [
        span("CONTROL SEQUENCE", 80, 60, 220, 24),
        span("THE BAS SHALL ENABLE THE FAN WHEN THE SPACE IS OCCUPIED.", 80, 105, 500),
      ],
    }]);
    assert.equal(prose.length, 1);
    assert.equal(prose[0].status, "extracted");
  });

  it("keeps a smaller mode/cross-reference heading subordinate to the primary detail title", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#55",
      spans: [
        span("AHU PROOFS AND SAFETIES SHALL BE MONITORED.", 80, 100, 430),
        span("MODE SEQUENCE OF OPERATION.", 80, 180, 260, 18),
        span("POWERED VAV BOX CONTROL SEQUENCE.", 80, 260, 410, 18),
        span("THE SUPPLY FAN SHALL ENABLE ON OCCUPANCY.", 80, 300, 420),
        span("AHU-1 SEQUENCE OF OPERATION", 80, 520, 620, 30),
      ],
    }]);
    assert.deepEqual(blocks.map((block) => block.title), ["AHU-1 SEQUENCE OF OPERATION"]);
    assert.equal(blocks[0].status, "extracted");
  });

  it("uses an immediate numbered section below a heading instead of stealing dense prose above", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#22",
      spans: [
        span("AN UNRELATED PRECEDING SEQUENCE HAS MANY WORDS AND SHALL KEEP MODULATING.", 80, 80, 550),
        span("ANOTHER LONG PRECEDING REQUIREMENT SHALL CONTINUE DURING OCCUPANCY.", 80, 110, 530),
        span("LEED IAQ PRE-OCCUPANCY FLUSH-OUT - SEQUENCE OF OPERATION", 80, 200, 620),
        span("1. PRIOR TO OCCUPANCY, THE AHU SHALL RUN AT 100% OUTSIDE AIR.", 80, 240, 540),
        span("2. ALL EXHAUST FANS SHALL BE COMMANDED OFF.", 80, 270, 440),
      ],
    }]);
    assert.equal(blocks[0].direction, "below_title");
    assert.match(blocks[0].sections.map((section) => section.body).join(" "), /100% OUTSIDE AIR/);
    assert.doesNotMatch(blocks[0].sections.map((section) => section.body).join(" "), /UNRELATED PRECEDING/);
  });

  it("stops a numbered sequence at its matching control-diagram caption", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#24",
      spans: [
        span("TOILET EXHAUST FANS - SEQUENCE OF OPERATION:", 80, 100, 440, 20),
        span("1.", 80, 140, 18, 14),
        span("THE BMS SHALL INTERLOCK THE EXHAUST FANS WITH THE AIR HANDLING UNIT.", 105, 140, 560),
        span("ISSUED FOR", 600, 220, 90),
        span("TOILET EXHAUST FANS - CONTROL DIAGRAM", 80, 260, 430, 24),
        span("AN UNRELATED LOWER DETAIL SHALL NOT BECOME PART OF THIS SEQUENCE.", 80, 500, 540),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].direction, "below_title");
    const body = blocks[0].sections.map((section) => section.body).join(" ");
    assert.match(body, /INTERLOCK THE EXHAUST FANS/);
    assert.doesNotMatch(body, /ISSUED FOR/);
    assert.doesNotMatch(body, /UNRELATED LOWER DETAIL/);
    assert.ok(blocks[0].region[3] <= 260);
  });

  it("uses a neighboring points-schedule heading as a lane boundary", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#19",
      spans: [
        span("CHILLED WATER SYSTEM - SEQUENCE OF OPERATION", 100, 100, 420, 22),
        span("1. THE BMS SHALL ENABLE THE CHILLED WATER PLANT ON DEMAND.", 100, 145, 570),
        span("HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE", 820, 90, 400, 20),
        span("CHILLER POWER CONSUMPTION", 760, 145, 310, 20),
        span("PUMP SPEED CONTROL", 760, 175, 230, 20),
        { ...span("PLOT DATE", 20, 150, 20, 140), rot: 90 },
      ],
    }]);
    assert.equal(blocks.length, 1);
    const body = blocks[0].sections.map((section) => section.body).join(" ");
    assert.match(body, /ENABLE THE CHILLED WATER PLANT/);
    assert.doesNotMatch(body, /POWER CONSUMPTION|PUMP SPEED CONTROL|PLOT DATE/);
  });

  it("keeps a point-list table above an under-detail caption out of the sequence body", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#68",
      spans: [
        span("SERIES FAN BOXES SHALL RUN WHEN OCCUPIED.", 600, 100, 390, 18),
        span("THE DAMPER SHALL MODULATE TO MAINTAIN AIRFLOW.", 600, 140, 430, 18),
        span("SFPVAV DDC POINTS LIST", 760, 400, 250, 20),
        span("MARK", 600, 440, 60, 16),
        span("DESCRIPTION", 700, 440, 140, 16),
        span("ALARM", 860, 440, 70, 16),
        span("ANALOG INPUT", 600, 480, 140, 16),
        span("SPACE TEMPERATURE", 700, 510, 190, 16),
        span("BINARY OUTPUT", 600, 540, 150, 16),
        span("FAN START/STOP", 700, 570, 160, 16),
        span("SERIES-FAN POWERED VAV BOX SEQUENCE OF OPERATION", 600, 700, 520, 28),
      ],
    }]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].direction, "above_title");
    const body = blocks[0].sections.map((section) => section.body).join(" ");
    assert.match(body, /DAMPER SHALL MODULATE/);
    assert.doesNotMatch(body, /POINTS LIST|ANALOG INPUT|SPACE TEMPERATURE|FAN START\/STOP/);
    assert.ok(blocks[0].region[3] <= 400);
  });

  it("recovers wrapped bottom-caption titles and starts at the nearest authored narrative cluster", () => {
    const blocks = extractSequenceNarratives([{
      key: "controls.pdf#16",
      spans: [
        span("CONTROLS LEGEND", 80, 60, 300, 28),
        span("ANALOG INPUT", 80, 105, 120, 16),
        span("CONTROL SYSTEM ARCHITECTURE", 600, 80, 300, 28),
        span("GLOBAL CONTROLLER", 600, 125, 170, 16),
        span("GENERAL:", 80, 360, 90, 16),
        span("THE RELIEF FAN SHALL ENABLE WHEN THE SPACE IS WARM.", 80, 388, 430, 16),
        span("THE DAMPER SHALL OPEN AND PROVE POSITION.", 80, 416, 370, 16),
        span("GENERAL:", 600, 360, 90, 16),
        span("THE OUTSIDE AIR SENSOR SHALL BE INSTALLED ON THE NORTH WALL.", 600, 388, 460, 16),
        span("THE CONTROLLER SHALL PROVIDE A CONTINUOUS TEMPERATURE READING.", 600, 416, 480, 16),
        span("HEAT RELIEF FAN W/ LOUVER", 80, 520, 330, 28),
        span("SEQUENCE OF OPERATION", 80, 552, 270, 28),
        span("OUTSIDE AIR", 600, 520, 150, 28),
        span("TEMPERATURE SEQUENCE OF OPERATION", 600, 552, 400, 28),
      ],
    }]);
    assert.deepEqual(blocks.map((block) => block.title), [
      "HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION",
      "OUTSIDE AIR TEMPERATURE SEQUENCE OF OPERATION",
    ]);
    const relief = blocks[0].sections.map((section) => section.body).join(" ");
    const outside = blocks[1].sections.map((section) => section.body).join(" ");
    assert.match(relief, /RELIEF FAN SHALL ENABLE/);
    assert.doesNotMatch(relief, /CONTROLS LEGEND|ANALOG INPUT|OUTSIDE AIR SENSOR/);
    assert.match(outside, /CONTINUOUS TEMPERATURE READING/);
    assert.doesNotMatch(outside, /CONTROL SYSTEM ARCHITECTURE|GLOBAL CONTROLLER|RELIEF FAN/);
  });
});
