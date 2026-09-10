// Diagnostic only: compare full production output without changing a scorer.
import { isDeepStrictEqual } from "node:util";

export function compareRoutingGraphs(a, b) {
  if (![a.tables, b.tables, a.sheets, b.sheets].every(Array.isArray)) throw new Error("Invalid graph comparison input");
  // A candidate object can preserve only one baseline occurrence. `some`
  // would incorrectly call two identical baseline tables preserved by one.
  const claimed = new Set();
  const missing = [];
  for (const table of a.tables) {
    const index = b.tables.findIndex((other, i) => !claimed.has(i) && isDeepStrictEqual(table, other));
    if (index < 0) missing.push(table);
    else claimed.add(index);
  }
  const summary = t => ({ sheet: t.sheet, title: t.title?.text, region: t.region, rows: t.rows.length });
  const baseRegions = new Set(a.tables.map(t => `${t.sheet}|${t.region.join(",")}`));
  const { tables: _at, vector_pipeline: _av, notes: _an, sheets: as, ...arest } = a;
  const { tables: _bt, vector_pipeline: _bv, notes: _bn, sheets: bs, ...brest } = b;
  const withoutSchedules = sheets => sheets.map(({ schedules: _s, ...rest }) => rest);
  return {
    baseline_tables: a.tables.length, candidate_tables: b.tables.length,
    unchanged_baseline_tables: a.tables.length - missing.length,
    missing_or_changed_baseline_tables: missing.map(summary),
    added_regions: b.tables.filter(t => !baseRegions.has(`${t.sheet}|${t.region.join(",")}`)).map(summary),
    unmatched_candidate_tables: b.tables.filter((_, i) => !claimed.has(i)).map(summary),
    table_sequence_equal: isDeepStrictEqual(a.tables, b.tables),
    sheet_metadata_equal: isDeepStrictEqual(withoutSchedules(as), withoutSchedules(bs)),
    remaining_graph_relationships_equal: isDeepStrictEqual(arest, brest),
  };
}

export function routingComparisonFailed(result) {
  if ([result.delta, result.replay, result.cachedReplay].some(d =>
    d.missing_or_changed_baseline_tables.length || !d.sheet_metadata_equal || !d.remaining_graph_relationships_equal)) return true;
  // A corrected baseline may add tables; a replay must not add, delete or
  // reorder anything. Timing/diagnostic notes are explicitly outside scope.
  return !result.replay.table_sequence_equal || !result.cachedReplay.table_sequence_equal;
}
