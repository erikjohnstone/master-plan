import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBasSourceContext } from '../src/lib/basSources.ts';

const source = (name = 'drawing.pdf') => ({ name, sha256: 'a'.repeat(64), byte_length: 100, page_count: 1,
  pages: [{ page_number: 1, sheet_key: name, width_px: 100, height_px: 80, rotation: 0,
    spans: [{ str: '  Pump ΔP: 4–20 mA  ', x0: 2, y0: 3, x1: 40, y1: 10, rot: 0 }] }] });

test('BAS source contract preserves exact text/geometry and isolates returned state', () => {
  const input = source();
  const before = structuredClone(input);
  const result = buildBasSourceContext([input]);
  assert.equal(result.scope, 'available_pdf_text_only');
  assert.equal(result.pages[0].spans[0].text, input.pages[0].spans[0].str);
  assert.deepEqual(result.pages[0].spans[0].bbox_px, [2, 3, 40, 10]);
  result.pages[0].spans[0].bbox_px[0] = 99;
  result.documents[0].names.push('mutation');
  assert.deepEqual(input, before);
  assert.deepEqual(buildBasSourceContext([input]), buildBasSourceContext([before]));
});

test('renamed identical sources coalesce by bytes, while same-tag different versions stay separate', () => {
  const a = source('a.pdf'), b = source('b.pdf');
  const merged = buildBasSourceContext([a, b]);
  assert.equal(merged.documents.length, 1);
  assert.equal(merged.pages.length, 1);
  assert.deepEqual(merged.documents[0].names, ['a.pdf', 'b.pdf']);
  assert.deepEqual(merged.pages[0].sheet_keys, ['a.pdf', 'b.pdf']);
  assert.deepEqual(merged, buildBasSourceContext([b, a]));
  assert.equal(buildBasSourceContext([a]).pages[0].spans[0].span_id,
    buildBasSourceContext([b]).pages[0].spans[0].span_id);
  b.sha256 = 'b'.repeat(64);
  assert.equal(buildBasSourceContext([a, b]).pages.length, 2);
});

test('no text is not evidence of no BAS; every page is represented without truncation', () => {
  const d = source();
  d.pages[0].spans = [];
  const result = buildBasSourceContext([d]);
  assert.equal(result.pages[0].text_status, 'no_text');
  assert.deepEqual(result.pages[0].spans, []);
  assert.equal('complete' in result, false);
  assert.equal('quantity' in result, false);
  assert.equal(buildBasSourceContext([]).pages.length, 0);
  assert.throws(() => buildBasSourceContext([{ ...d, page_count: 2 }]), /Every loaded page/);
  assert.throws(() => buildBasSourceContext([{ ...d, page_count: 2, pages: [d.pages[0], d.pages[0]] }]), /Every loaded page/);
});

test('invalid numbers, bboxes, hashes and ambiguous identities fail instead of dropping evidence', () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    const d = source(); d.pages[0].spans[0].x0 = value;
    assert.throws(() => buildBasSourceContext([d]));
  }
  const unordered = source(); unordered.pages[0].spans[0].x0 = 50;
  assert.throws(() => buildBasSourceContext([unordered]), /Unordered/);
  assert.throws(() => buildBasSourceContext([{ ...source(), sha256: 'not-a-hash' }]));
  assert.throws(() => buildBasSourceContext([{ ...source(), byte_length: true }]));
  assert.throws(() => buildBasSourceContext([source(), { ...source(), sha256: 'b'.repeat(64) }]), /filename/);
  assert.throws(() => buildBasSourceContext([source(), { ...source('other.pdf'), byte_length: 101 }]), /metadata/);
  const mismatch = source('other.pdf'); mismatch.pages[0].spans[0].str = 'different';
  assert.throws(() => buildBasSourceContext([source(), mismatch]), /Conflicting text/);
  const duplicateSheet = source('other.pdf'); duplicateSheet.sha256 = 'b'.repeat(64);
  duplicateSheet.pages[0].sheet_key = 'drawing.pdf';
  assert.throws(() => buildBasSourceContext([source(), duplicateSheet]), /sheet key/);
});
