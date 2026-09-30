import { test } from "node:test";
import assert from "node:assert/strict";
import { groundExactTagsToVectorGeometry } from "../src/lib/taggedVectorGrounding.ts";

const span = (str: string, x0: number, y0: number, w: number, h: number) => ({
  str, x0, y0, x1: x0 + w, y1: y0 + h,
});

const square = (x0: number, y0: number, size: number): number[] => [
  x0, y0, x0 + size, y0,
  x0 + size, y0, x0 + size, y0 + size,
  x0 + size, y0 + size, x0, y0 + size,
  x0, y0 + size, x0, y0,
];

test("exact tag plus adjacent distinctive vector body is verified", () => {
  const tag = span("P-7", 80, 90, 32, 17);
  const occurrence = { cx: 96, cy: 98.5, h: 17, bbox: [80, 90, 112, 107] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "P-7",
    occurrences: [occurrence],
    spans: [tag],
    segs: square(118, 91, 16),
    width: 300,
    height: 200,
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.text_only.length, 0);
  assert.equal(result.matches[0].label.label, "P-7");
  assert.equal(result.matches[0].label.via, "adjacent");
  assert.deepEqual(result.matches[0].geometry_bbox, [118, 91, 134, 107]);
});

test("exact equipment tag follows its literal leader to distinctive geometry", () => {
  const tag = span("VAV-E-105", 96, 196, 72, 17);
  const occurrence = { cx: 132, cy: 204.5, h: 17, bbox: [96, 196, 168, 213] as [number, number, number, number] };
  const body = square(195, 195, 16);
  const leader = [172, 205, 195, 203];
  const segs = [...body, ...leader];
  const result = groundExactTagsToVectorGeometry({
    tag: "VAV-E-105",
    occurrences: [occurrence],
    spans: [tag],
    segs,
    lum: Uint8Array.from([219, 219, 219, 219, 0]),
    width: 500,
    height: 400,
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].label.via, "leader");
  assert.deepEqual(result.matches[0].label.token_bbox, occurrence.bbox);
});

test("exact equipment tag follows the leader terminal instead of geometry beside an intermediate segment", () => {
  const tag = span("CV-CHW-BP-A", 100, 200, 100, 20);
  const occurrence = { cx: 150, cy: 210, h: 20, bbox: [100, 200, 200, 220] as [number, number, number, number] };
  const incidentalBody = square(180, 176, 16);
  const actualBody = square(180, 108, 28);
  const leader = [
    204, 210, 204, 184,
    204, 184, 204, 148,
    204, 148, 194, 136,
    194, 136, 188, 148,
    194, 136, 204, 141,
  ];
  const segs = [...incidentalBody, ...actualBody, ...leader];
  const result = groundExactTagsToVectorGeometry({
    tag: "CV-CHW-BP-A",
    occurrences: [occurrence],
    spans: [tag],
    segs,
    lum: Uint8Array.from([
      219, 219, 219, 219,
      219, 219, 219, 219,
      0, 0, 0, 0, 0,
    ]),
    width: 500,
    height: 400,
  });

  assert.equal(result.matches.length, 1);
  assert.equal(result.text_only.length, 0);
  assert.deepEqual(result.matches[0].geometry_bbox, [180, 108, 208, 148]);
  assert.deepEqual(result.matches[0].label.leader_terminal_at, [194, 136]);
});

test("bare tag text and an open leader fragment remain text-only", () => {
  const tag = span("CV-1", 80, 90, 36, 17);
  const occurrence = { cx: 98, cy: 98.5, h: 17, bbox: [80, 90, 116, 107] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "CV-1",
    occurrences: [occurrence],
    spans: [tag],
    // Three connected strokes, but no closed body: assertDistinctiveSymbolSeed
    // rejects this as a leader/pipe fragment rather than installed hardware.
    segs: [118, 99, 130, 99, 130, 99, 140, 105, 140, 105, 150, 105],
    width: 300,
    height: 200,
  });
  assert.equal(result.matches.length, 0);
  assert.equal(result.text_only.length, 1);
  assert.equal(result.text_only[0].reason, "no_distinctive_local_geometry");
});

test("a sibling tag cannot verify the requested occurrence", () => {
  const requested = span("CV-1", 80, 90, 36, 17);
  const sibling = span("CV-2", 118, 90, 36, 17);
  const occurrence = { cx: 98, cy: 98.5, h: 17, bbox: [80, 90, 116, 107] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "CV-1",
    occurrences: [occurrence],
    spans: [requested, sibling],
    // The body is deliberately closer to CV-2. Exact label equality and
    // exact source-box ownership must keep CV-1 unverified.
    segs: square(155, 91, 16),
    width: 300,
    height: 200,
  });
  assert.equal(result.matches.length, 0);
  assert.equal(result.text_only.length, 1);
});

test("repeated exact tags each own one local vector body", () => {
  const left = span("RG-6", 50, 50, 36, 17);
  const right = span("RG-6", 250, 50, 36, 17);
  const occurrences = [
    { cx: 68, cy: 58.5, h: 17, bbox: [50, 50, 86, 67] as [number, number, number, number] },
    { cx: 268, cy: 58.5, h: 17, bbox: [250, 50, 286, 67] as [number, number, number, number] },
  ];
  const result = groundExactTagsToVectorGeometry({
    tag: "RG-6",
    occurrences,
    spans: [left, right],
    segs: [...square(92, 51, 16), ...square(292, 51, 16)],
    width: 500,
    height: 200,
  });
  assert.equal(result.matches.length, 2);
  assert.equal(result.text_only.length, 0);
  assert.deepEqual(result.matches.map((match) => match.label.token_bbox), occurrences.map((entry) => entry.bbox));
});

// AS-102: the sweep's tag reader reads a mark the shared labeler offers no
// token for, and the occurrence itself is then the source token.
test("a mark printed with a word space follows its literal leader (AS-102)", () => {
  // 011_IL prints each heat pump's mark in a hexagon as "HP 12-1", the
  // leader's arrow on the unit; the labeler reads no token with a space.
  const tag = span("HP 12-1", 96, 196, 56, 17);
  const occurrence = { cx: 124, cy: 204.5, h: 17, bbox: [96, 196, 152, 213] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "HP 12-1",
    occurrences: [occurrence],
    spans: [tag],
    segs: [...square(195, 195, 16), 156, 205, 195, 203],
    lum: Uint8Array.from([219, 219, 219, 219, 0]),
    width: 500,
    height: 400,
    occurrenceTokens: true,
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.text_only.length, 0);
  assert.equal(result.matches[0].label.via, "leader");
  assert.deepEqual(result.matches[0].label.token_bbox, occurrence.bbox);
  assert.deepEqual(result.matches[0].geometry_bbox, [195, 195, 211, 211]);
});

test("a family stacked over its number follows its literal leader (AS-102)", () => {
  // 26_CA prints each fan-powered box's mark as FPB over 3-11; one such
  // block is no repeated stacked convention, and the labeler reads none.
  const top = span("FPB", 100, 180, 30, 17);
  const bottom = span("3-11", 98, 200, 34, 17);
  const occurrence = { cx: 115, cy: 198.5, h: 37, bbox: [98, 180, 132, 217] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "FPB-3-11",
    occurrences: [occurrence],
    spans: [top, bottom],
    // The body's ink clears the equipment floor of twice the block's height.
    segs: [...square(215, 184, 28), 136, 198, 215, 197],
    lum: Uint8Array.from([219, 219, 219, 219, 0]),
    width: 500,
    height: 400,
    occurrenceTokens: true,
  });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].label.via, "leader");
  assert.deepEqual(result.matches[0].label.token_bbox, occurrence.bbox);
  assert.deepEqual(result.matches[0].geometry_bbox, [215, 184, 243, 212]);
});

test("a spaced mark with no distinctive body stays text-only (AS-102)", () => {
  const tag = span("HP 12-1", 80, 90, 56, 17);
  const occurrence = { cx: 108, cy: 98.5, h: 17, bbox: [80, 90, 136, 107] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "HP 12-1",
    occurrences: [occurrence],
    spans: [tag],
    segs: [140, 99, 150, 99, 150, 99, 160, 105, 160, 105, 170, 105],
    width: 300,
    height: 200,
    occurrenceTokens: true,
  });
  assert.equal(result.matches.length, 0);
  assert.equal(result.text_only.length, 1);
});

test("a spaced mark takes the labeler's own instance reading, its space read as the separator (AS-102)", () => {
  // A body 58 px from the text: inside an equipment instance's reach, past a
  // type mark's. "AHU 1" reads as AHU-1, an instance; "CD 1" as CD-1, a
  // repeatable type mark, and gains no reach for its space.
  const run = (mark: string) => groundExactTagsToVectorGeometry({
    tag: mark,
    occurrences: [{ cx: 115, cy: 108.5, h: 17, bbox: [100, 100, 130, 117] }],
    spans: [span(mark, 100, 100, 30, 17)],
    segs: square(165, 100, 16),
    width: 400,
    height: 300,
    occurrenceTokens: true,
  });
  assert.equal(run("AHU 1").matches.length, 1);
  assert.equal(run("CD 1").matches.length, 0);
});

test("a shorthand the tag reader accepted is never an exact token (AS-102)", () => {
  // federal-mech's abbreviation list prints "AHU" (AIR HANDLING UNIT); the
  // sweep's reader may take it for AHU-1 on a sheet drawing AHU-1 no other
  // way, but exact-tag verification verifies only the whole printed mark.
  const tag = span("AHU", 96, 196, 30, 17);
  const occurrence = { cx: 111, cy: 204.5, h: 17, bbox: [96, 196, 126, 213] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "AHU-1",
    occurrences: [occurrence],
    spans: [tag],
    segs: [...square(195, 195, 16), 130, 205, 195, 203],
    lum: Uint8Array.from([219, 219, 219, 219, 0]),
    width: 500,
    height: 400,
    occurrenceTokens: true,
  });
  assert.equal(result.matches.length, 0);
  assert.equal(result.text_only.length, 1);
});

test("a row naming no one unit per mark keeps the labeler's reading alone (AS-102)", () => {
  // 016_NY's FT-A (a fin tube type) also labels four thermostat control
  // lines: without occurrenceTokens an unread mark stays text, as before.
  const tag = span("HP 12-1", 96, 196, 56, 17);
  const occurrence = { cx: 124, cy: 204.5, h: 17, bbox: [96, 196, 152, 213] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "HP 12-1",
    occurrences: [occurrence],
    spans: [tag],
    segs: [...square(195, 195, 16), 156, 205, 195, 203],
    lum: Uint8Array.from([219, 219, 219, 219, 0]),
    width: 500,
    height: 400,
  });
  assert.equal(result.matches.length, 0);
  assert.equal(result.text_only.length, 1);
});

test("a mark printed without its hyphen is never an exact token (AS-102)", () => {
  // federal-mech's column grid bubble "B2" is read by the sweep as boiler
  // B-2 (a mark read however its separator is printed); verifying it would
  // count the boiler at a grid line.
  const tag = span("B2", 96, 196, 20, 17);
  const occurrence = { cx: 106, cy: 204.5, h: 17, bbox: [96, 196, 116, 213] as [number, number, number, number] };
  const result = groundExactTagsToVectorGeometry({
    tag: "B-2",
    occurrences: [occurrence],
    spans: [tag],
    segs: [...square(125, 195, 16)],
    width: 500,
    height: 400,
    occurrenceTokens: true,
  });
  assert.equal(result.matches.length, 0);
  assert.equal(result.text_only.length, 1);
});

// A thermostat's circled T lettered with the unit it serves (004_MO's p36
// floor plans: "RTU-3" beside a T, the rooftop unit itself on the roof plan).
const ring = (cx: number, cy: number, r: number): number[] => Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * 2 * Math.PI, b = ((i + 1) / 16) * 2 * Math.PI;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b)];
}).flat();
const sensorLabelCase = (extra: { spans?: ReturnType<typeof span>[]; segs?: number[] }) => {
  const tag = span("RTU-3", 96, 196, 40, 17);
  const occurrence = { cx: 116, cy: 204.5, h: 17, bbox: [96, 196, 136, 213] as [number, number, number, number] };
  const body = square(195, 195, 16);
  const leader = [140, 205, 195, 203];
  const segs = [...body, ...leader, ...(extra.segs ?? [])];
  return groundExactTagsToVectorGeometry({
    tag: "RTU-3",
    occurrences: [occurrence],
    spans: [tag, ...(extra.spans ?? [])],
    segs,
    lum: Uint8Array.from([219, 219, 219, 219, 0, ...Array.from({ length: (extra.segs?.length ?? 0) / 4 }, () => 0)]),
    width: 500,
    height: 400,
    occurrenceTokens: true,
  });
};

test("a mark touching a thermostat's ring still verifies, flagged as that sensor's label (AS-105)", () => {
  const result = sensorLabelCase({ spans: [span("T", 80, 208, 8, 17)], segs: ring(84, 216.5, 11) });
  assert.equal(result.matches.length, 1);
  assert.deepEqual(result.matches[0].label.token_bbox, [96, 196, 136, 213]);
  assert.equal(result.matches[0].sensor_label, true);
});

test("only a room sensor's ring the mark touches flags it (AS-105)", () => {
  // no sensor beside the mark, a bare T, a thermostat half a letter height
  // off (040_IL's unit heaters, tagged beside their own thermostats), one out
  // of reach, a keyed note's ringed number
  for (const extra of [
    {},
    { spans: [span("T", 80, 208, 8, 17)] },
    { spans: [span("T", 70, 208, 8, 17)], segs: ring(74, 216.5, 11) },
    { spans: [span("T", 20, 262, 8, 17)], segs: ring(24, 270.5, 11) },
    { spans: [span("3", 80, 208, 8, 17)], segs: ring(84, 216.5, 11) },
  ]) {
    const result = sensorLabelCase(extra);
    assert.equal(result.matches.length, 1, JSON.stringify(extra.spans ?? []));
    assert.equal(result.matches[0].sensor_label, undefined, JSON.stringify(extra.spans ?? []));
  }
});
