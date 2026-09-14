import test from 'node:test';
import assert from 'node:assert/strict';
import { basCitationBoxes, basCitationFocusBox, basCitationGroupRequest } from '../src/lib/basCitationGroup.ts';

const page = `sha256:${'a'.repeat(64)}:p1`;

test('a clause citation preserves every exact source box and uses its union only for viewport focus', () => {
  const input = [
    { page_id: page, span_id: `${page}:s1`, text: 'FAN SHALL START', bbox_px: [10, 20, 110, 32] },
    { page_id: page, span_id: `${page}:s2`, text: 'WHEN OCCUPIED.', bbox_px: [25, 38, 145, 50] },
  ];
  const request = basCitationGroupRequest(page, input, 'Clause 1.1 · complete source');
  assert.deepEqual(request.source_spans.map(span => span.bbox_px), [[10, 20, 110, 32], [25, 38, 145, 50]]);
  assert.deepEqual(request.bbox_px, [10, 20, 110, 32], 'the painted citation is never replaced by an enclosing box');
  assert.deepEqual(basCitationFocusBox(request.source_spans), [10, 20, 145, 50]);
  assert.notEqual(request.source_spans[0].bbox_px, input[0].bbox_px, 'pending UI requests cannot mutate retained source geometry');
  assert.deepEqual(basCitationBoxes(request), request.source_spans);
});

test('duplicate geometry paints once and malformed or cross-page groups fail closed', () => {
  const exact = { page_id: page, span_id: `${page}:s1`, text: 'EXACT', bbox_px: [1, 2, 3, 4] };
  assert.equal(basCitationGroupRequest(page, [exact, { ...exact, span_id: `${page}:s2` }], 'evidence').source_spans.length, 1);
  assert.throws(() => basCitationGroupRequest(page, [{ ...exact, page_id: `${page.slice(0, -1)}2` }], 'evidence'), /foreign-page/);
  assert.throws(() => basCitationGroupRequest(page, [{ ...exact, bbox_px: [1, 2, 1, 4] }], 'evidence'), /invalid/);
  assert.throws(() => basCitationGroupRequest(page, [], 'evidence'), /unavailable/);
});

test('an explicit but invalid source group never falls back to a plausible single bbox', () => {
  assert.throws(() => basCitationBoxes({ page_id: page, bbox_px: [10, 10, 20, 20], source_spans: [
    { page_id: page, text: 'bad', bbox_px: [0, 0, 0, 1] },
  ] }), /invalid/);
  assert.deepEqual(basCitationBoxes({ page_id: page, bbox_px: [10, 10, 20, 20], value: 'legacy' }), [
    { page_id: page, text: 'legacy', bbox_px: [10, 10, 20, 20] },
  ]);
  assert.deepEqual(basCitationBoxes({ sheet_id: 'plans.pdf#4', bbox_px: [10, 10, 20, 20], value: 'schedule row' }), [
    { page_id: 'plans.pdf#4', text: 'schedule row', bbox_px: [10, 10, 20, 20] },
  ], 'existing non-BAS schedule and plan citations remain supported');
});
