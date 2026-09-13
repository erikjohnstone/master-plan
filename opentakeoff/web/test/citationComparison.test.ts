import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citationPreviewRegion } from '../src/lib/citationComparison.js';

test('citation preview gives a tiny plan marker enough surrounding context', () => {
  assert.deepEqual(citationPreviewRegion([990, 490, 1010, 510], 3000, 2000), {
    x0: 740, y0: 330, x1: 1260, y1: 670,
  });
});

test('citation preview keeps a long schedule row and vertical context inside the page', () => {
  assert.deepEqual(citationPreviewRegion([2050, 320, 5100, 350], 5500, 3600, { kind: 'schedule' }), {
    x0: 1930, y0: 165, x1: 3130, y1: 505,
  });
});

test('citation preview rejects a mismatched or degenerate bbox', () => {
  assert.throws(() => citationPreviewRegion([0, 0, 1300, 20], 1200, 900), /outside/);
  assert.throws(() => citationPreviewRegion([10, 10, 10, 20], 1200, 900), /outside/);
});
