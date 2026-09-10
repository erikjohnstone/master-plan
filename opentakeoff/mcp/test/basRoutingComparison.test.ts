import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareRoutingGraphs, routingComparisonFailed } from '../scripts/basRoutingComparison.mjs';

const table = (x = 0) => ({ sheet: 'test.pdf#1', region: [x, 0, x + 10, 10], title: { text: 'POINT LIST' }, rows: [{ key: '1', cells: {} }] });
const graph = (tables: ReturnType<typeof table>[]) => ({ tables, sheets: [{ key: 'test.pdf#1', schedules: [] }], rooms: [], notes: [], vector_pipeline: {} });

test('comparison is one-to-one, not presence-only', () => {
  const result = compareRoutingGraphs(graph([table(), table()]), graph([table()]));
  assert.equal(result.unchanged_baseline_tables, 1);
  assert.equal(result.missing_or_changed_baseline_tables.length, 1);
});

test('added tables are allowed only between revisions, never replay', () => {
  const a = graph([table()]), b = graph([table(), table(20)]);
  const delta = compareRoutingGraphs(a, b), equal = compareRoutingGraphs(b, b);
  assert.equal(routingComparisonFailed({ delta, replay: equal, cachedReplay: equal }), false);
  assert.equal(routingComparisonFailed({ delta, replay: delta, cachedReplay: equal }), true);
  assert.equal(compareRoutingGraphs(b, graph([...b.tables].reverse())).table_sequence_equal, false);
});

test('metadata and full table values remain in scope; only explicit incidental fields are excluded', () => {
  const a = graph([table()]), changed = structuredClone(a);
  changed.tables[0].rows[0].key = '2';
  assert.equal(compareRoutingGraphs(a, changed).missing_or_changed_baseline_tables.length, 1);
  const notesOnly = { ...a, notes: ['timing changed'], vector_pipeline: { ms: 23 } };
  const compared = compareRoutingGraphs(a, notesOnly);
  assert.equal(compared.table_sequence_equal, true);
  assert.equal(compared.remaining_graph_relationships_equal, true);
  assert.throws(() => compareRoutingGraphs({}, a), /Invalid graph/);
});
