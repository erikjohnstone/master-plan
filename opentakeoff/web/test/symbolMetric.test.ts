import assert from "node:assert/strict";
import test from "node:test";
import {
  SYMBOL_METRIC_EMBEDDING_DIMENSION,
  SYMBOL_METRIC_INPUT_SIZE,
  buildSahiTiles,
  prepareSymbolMetricInput,
  rankSymbolMetricCandidates,
  sahiPageBboxToLocal,
  sahiTileForPageBbox,
  sahiLocalBboxToPage,
} from "../src/lib/symbolMetric.ts";

function image(width: number, height: number, blackAt?: [number, number]): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  if (blackAt) {
    const index = (blackAt[1] * width + blackAt[0]) * 4;
    data[index] = 0; data[index + 1] = 0; data[index + 2] = 0;
  }
  return { width, height, data };
}

test("symbol metric preparation is aspect-preserving, white-padded, and NCHW", () => {
  const input = prepareSymbolMetricInput(image(20, 40, [10, 20]));
  assert.equal(input.length, 3 * SYMBOL_METRIC_INPUT_SIZE * SYMBOL_METRIC_INPUT_SIZE);
  const pixel = SYMBOL_METRIC_INPUT_SIZE * SYMBOL_METRIC_INPUT_SIZE;
  assert.ok(Math.abs(input[0] - ((1 - 0.485) / 0.229)) < 1e-6);
  assert.ok(Math.abs(input[pixel] - ((1 - 0.456) / 0.224)) < 1e-6);
  assert.ok(Math.abs(input[pixel * 2] - ((1 - 0.406) / 0.225)) < 1e-6);
});

test("SAHI windows overlap, cover the right/bottom boundary, and retain page coordinates", () => {
  const tiles = buildSahiTiles(1500, 1000, { tile_sizes: [640], overlap_ratio: 0.2 });
  assert.ok(tiles.length > 1);
  assert.ok(tiles.some(tile => tile.bbox_px[2] === 1500 && tile.bbox_px[3] === 1000));
  const first = tiles[0];
  assert.deepEqual(sahiLocalBboxToPage(first, [10, 20, 30, 50]), [10, 20, 30, 50]);
  const candidate = [1100, 720, 1180, 800] as const;
  const owner = sahiTileForPageBbox(tiles, candidate);
  if (!owner) throw new Error("a fully-overlapped candidate needs one deterministic tile owner");
  const localCandidate = sahiPageBboxToLocal(owner, candidate);
  if (!localCandidate) throw new Error("the chosen tile must fully contain the candidate");
  assert.deepEqual(localCandidate.map((value, index) => value + owner.bbox_px[index % 2]), candidate);
  assert.equal(sahiPageBboxToLocal(first, candidate), null, "a clipped candidate is never sent to DINO");
});

test("model rankings are deterministic review evidence and do not expose an accept state", () => {
  const reference = new Float32Array(SYMBOL_METRIC_EMBEDDING_DIMENSION); reference[0] = 1;
  const close = new Float32Array(SYMBOL_METRIC_EMBEDDING_DIMENSION); close[0] = 0.9; close[1] = 0.1;
  const distant = new Float32Array(SYMBOL_METRIC_EMBEDDING_DIMENSION); distant[1] = 1;
  const ranked = rankSymbolMetricCandidates(reference, [
    { id: "distant", embedding: distant, value: "distant" },
    { id: "close", embedding: close, value: "close" },
  ]);
  assert.deepEqual(ranked.map(row => row.id), ["close", "distant"]);
  assert.ok(ranked.every(row => row.decision === "ranked_review"));
});
