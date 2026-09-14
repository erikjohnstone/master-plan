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
