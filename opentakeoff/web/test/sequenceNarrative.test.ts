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
});
