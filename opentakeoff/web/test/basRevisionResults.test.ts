import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import test from 'node:test';
import BasRevisionResults from '../src/components/BasRevisionResults.jsx';

// Controlled rendering-only data; shared schema/math and public PDF journeys
// are tested separately. This does not stand in for a source-backed report.
function fixture(count = 101) {
  const item = { item_id: 'item', label: '<img onerror="bad()">', kind: 'point_row', origin: 'operator_input',
    source_scope: 'inside', dependency_status: 'current', source_refs: [], original_json: '{}', content_fingerprint: 'fixed' };
  const row = { row_id: 'row', before: item, after: item, disposition: 'paired', correspondence: 'explicit_decision',
    reason: 'Controlled renderer fixture', declared_fields_equal: false, rules_equal: true, retained_evidence: 'equal', issues: [],
    field_changes: Array.from({ length: 101 }, (_, i) => ({ field: `field_${i}`, before: { present: true, json: 'null' }, after: { present: true, json: 'false' } })),
    quantities: Array.from({ length: count }, (_, i) => ({ metric_key: `metric-${i}`, before: { dimension: `measure_${i}`, value: i === 0 ? null : i },
      after: { dimension: `measure_${i}`, value: 0 }, delta: null, status: 'membership_review_required' })) };
  return { rows: [row] };
}
function render(report: ReturnType<typeof fixture>, state: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(BasRevisionResults, { report, state, onChange() {}, onSource() {}, onMembershipReview() {}, editable: true }));
}

test('Revision overview limits each row to three exact measures with an explicit full-reader entry', () => {
  const report = fixture(10000), before = JSON.stringify(report), html = render(report);
  assert.equal((html.match(/class="bas-revision-measure"/g) || []).length, 9);
  assert.match(html, /Explore all 10000 measures/); assert.match(html, /First 3 of 10000 measures/);
  assert.match(html, /Unknown/); assert.match(html, /&lt;img onerror=/); assert.doesNotMatch(html, /<img/);
  assert.equal(JSON.stringify(report), before);
});

test('Selected revision detail pages measures, membership decisions and fields without losing the final value', () => {
  const report = fixture(), html = render(report, { selectedId: 'row' });
  assert.equal((html.match(/Confirm comparable membership/g) || []).length, 10);
  assert.match(html, /Next measures/); assert.match(html, /Next changed fields/);
  assert.match(html, /1–10 of 101 measures/); assert.match(html, /1–20 of 101 changed fields/);
  const last = render(report, { selectedId: 'row', quantityPage: 10, fieldPage: 5 });
  assert.match(last, /measure 100/); assert.match(last, /field 100/);
  assert.equal((last.match(/Confirm comparable membership/g) || []).length, 1);
  assert.match(last, /101–101 of 101 measures/); assert.match(last, /101–101 of 101 changed fields/);
  assert.equal(render(report, { selectedId: 'row', quantityPage: 999, fieldPage: 999 }), last, 'Stale page state clamps to the retained last page');
});

test('Revision row paging keeps last and empty pages accessible without a complete-coverage claim', () => {
  const report = fixture(1); report.rows = Array.from({ length: 101 }, (_, i) => ({ ...report.rows[0], row_id: `row-${i}` }));
  const first = render(report), last = render(report, { page: 4 }), empty = render(report, { filter: 'absent' });
  assert.equal((first.match(/data-selected="false"/g) || []).length, 25);
  assert.equal((last.match(/data-selected="false"/g) || []).length, 1);
  assert.match(last, /101–101 of 101/); assert.match(empty, /does not prove complete coverage/);
});

test('Changes and unresolved filter keeps shared unknown and pending membership statuses visible', () => {
  const report = fixture(1); report.rows[0].declared_fields_equal = true; report.rows[0].field_changes = [];
  for (const status of ['unknown_value', 'stale_dependency', 'source_scope_unresolved', 'membership_review_required', 'different_measure']) {
    report.rows[0].quantities[0].status = status;
    assert.match(render(report, { changedOnly: true }), /data-selected="false"/, `${status} must remain visible even with equal fields and evidence`);
  }
  report.rows[0].quantities[0].status = 'calculated';
  Object.assign(report.rows[0].quantities[0], { delta: 0 });
  assert.doesNotMatch(render(report, { changedOnly: true }), /data-selected="false"/, 'An unchanged, resolved row may be filtered');
});
