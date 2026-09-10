import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProofEqual } from '../scripts/helpers/proofEquality.ts';

test('large evidence mismatch remains a failed exact assertion with bounded diagnostics', () => {
  const expected = { captures: Array.from({ length: 1000 }, (_, i) => ({ id: i, text: 'original source '.repeat(100) })) };
  const actual = structuredClone(expected);
  assertProofEqual(actual, expected);
  actual.captures[999].text = 'different';
  assert.throws(() => assertProofEqual(actual, expected, 'retained history'), error => {
    assert.ok(error instanceof Error); assert.match(error.message, /retained history.*captures.999.text/);
    assert.ok(error.message.length < 1024); assert.doesNotMatch(error.message, /original source/); return true;
  });
  for (const [a, b] of [[0, -0], [null, undefined], [{ a: 1 }, { b: 1 }], [[1, 2], [2, 1]], [new Date(0), new Date(1)]]) {
    assert.throws(() => assertProofEqual(a, b), /strict equality failed/);
  }
  assertProofEqual({ a: 1, b: 2 }, { b: 2, a: 1 });
});
