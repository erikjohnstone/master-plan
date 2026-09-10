import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { boundedCanonicalCandidate } from './helpers/basCanonicalCandidate.ts';

test('bounded serialization experiment preserves exact historical bytes and rejections', () => {
  const sparse = Array(4); sparse[1] = 'present';
  const values = [null, true, false, 0, -0, 1e-7, 1e30, '\ud800\u0000\n雪', [], {}, sparse,
    { 10: 'ten', 2: 'two', a: [0, null, ''], Z: 'case', 'é': 'Unicode', '😀': 'pair' },
    Array.from({ length: 2000 }, (_, n) => ({ [`key-${n}`]: '\n雪'.repeat(n % 50), value: [n, n % 2 === 0, null] }))];
  for (const v of values) assert.equal(boundedCanonicalCandidate(v), canonicalBasJson(v));
  let seed = 1729;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const make = (depth: number): unknown => {
    const n = Math.floor(random() * 7);
    if (depth === 0) return [null, random() * 1000, '雪\n', false][n % 4];
    if (n < 3) return Array.from({ length: n }, () => make(depth - 1));
    return Object.fromEntries(Array.from({ length: n }, (_, i) => [`key-${Math.floor(random() * 100)}-${i}`, make(depth - 1)]));
  };
  for (let n = 0; n < 100; n++) { const v = make(4); assert.equal(boundedCanonicalCandidate(v), canonicalBasJson(v)); }
  for (const v of [undefined, NaN, Infinity, -Infinity, new Date(), 1n, Object.create(null), { nested: undefined }, [undefined]]) {
    assert.throws(() => canonicalBasJson(v), /finite JSON/); assert.throws(() => boundedCanonicalCandidate(v), /finite JSON/);
  }
});
