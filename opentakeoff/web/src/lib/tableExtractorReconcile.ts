/**
 * Shared L2/L4 table reconciliation — one merge bar for geometric, ODL, and
 * fallback extractors on the Session+UI+MCP path.
 */
import {
  snapCellBboxesToSourceSpans,
  tableCompleteness,
  type Bbox,
  type GraphSpan,
  type ScheduleTable,
  type SheetGraph,
} from "./sheetgraph.ts";

export function bboxOverlapRatio(a: Bbox, b: Bbox): number {
  const ix0 = Math.max(a[0], b[0]);
  const iy0 = Math.max(a[1], b[1]);
  const ix1 = Math.min(a[2], b[2]);
  const iy1 = Math.min(a[3], b[3]);
  const inter = Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0);
  if (!inter) return 0;
  const areaA = Math.max(1, (a[2] - a[0]) * (a[3] - a[1]));
  const areaB = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]));
  return inter / Math.min(areaA, areaB);
}

export function matchByRegionOverlap(tables: ScheduleTable[], sheetKey: string, region: Bbox): number {
  let best = -1;
  let bestRatio = 0.4;
  for (let i = 0; i < tables.length; i++) {
    if (tables[i].sheet !== sheetKey) continue;
    const r = bboxOverlapRatio(tables[i].region, region);
    if (r > bestRatio) {
      bestRatio = r;
      best = i;
    }
  }
  return best;
}

export function matchByKeySet(tables: ScheduleTable[], sheetKey: string, built: ScheduleTable): number {
  if (built.kind === "reference" || !built.rows.length) return -1;
  const builtKeys = new Set(built.rows.map((r) => r.key));
  if (builtKeys.size !== built.rows.length) return -1;
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    if (t.sheet !== sheetKey || t.kind === "reference" || t.rows.length !== builtKeys.size) continue;
    const tKeys = new Set(t.rows.map((r) => r.key));
    if (tKeys.size !== builtKeys.size) continue;
    let allMatch = true;
    for (const k of builtKeys) if (!tKeys.has(k)) {
      allMatch = false;
      break;
    }
    if (allMatch) return i;
  }
  return -1;
}

export function duplicateKeyCount(t: ScheduleTable): number {
  const seen = new Map<string, number>();
  for (const r of t.rows) seen.set(r.key, (seen.get(r.key) || 0) + 1);
  let dupes = 0;
  for (const n of seen.values()) if (n > 1) dupes += n - 1;
  return dupes;
}

export function collapseEquivalentPrimaryTables(tables: ScheduleTable[]): number {
  const seen = new Map<string, number>();
  const remove = new Set<number>();
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    if (table.kind === "reference" || !table.title || !table.rows.length) continue;
    const keys = [...new Set(table.rows.map((row) => row.key))].sort();
    if (keys.length !== table.rows.length) continue;
    const title = table.title.text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const identity = `${table.sheet}\0${title}\0${keys.join("\0")}`;
    const prior = seen.get(identity);
    if (prior == null) {
      seen.set(identity, i);
      continue;
    }
    const a = tableCompleteness(tables[prior]);
    const b = tableCompleteness(table);
    if (b.headers > a.headers || (b.headers === a.headers && b.cells > a.cells)) {
      remove.add(prior);
      seen.set(identity, i);
    } else {
      remove.add(i);
    }
  }
  if (!remove.size) return 0;
  const kept = tables.filter((_, index) => !remove.has(index));
  tables.splice(0, tables.length, ...kept);
  return remove.size;
}

export interface MergeExtractedStats {
  recovered: number;
  added: number;
}

/** Merge one newly extracted table into g.tables using the shared evidence bar. */
export function mergeExtractedTable(
  g: SheetGraph,
  built: ScheduleTable,
  sheetKey: string,
  stats: MergeExtractedStats,
  touchedSheets: Set<string>,
): void {
  let existingIdx = matchByRegionOverlap(g.tables, sheetKey, built.region);
  if (existingIdx < 0) existingIdx = matchByKeySet(g.tables, sheetKey, built);
  if (existingIdx >= 0) {
    const existing = g.tables[existingIdx];
    const a = tableCompleteness(existing);
    const b = tableCompleteness(built);
    const aDupes = duplicateKeyCount(existing);
    const bDupes = duplicateKeyCount(built);
    const existingAnonymous = existing.kind === "reference" && !existing.title;
    const candidateIdentified = built.kind !== "reference" || !!built.title;
    const shouldReplace =
      bDupes <= aDupes &&
      (b.headers > a.headers ||
        (b.headers === a.headers && b.cells > a.cells) ||
        (b.headers === a.headers && b.cells === a.cells && existing.kind === "reference" && built.kind !== "reference") ||
        (existingAnonymous && candidateIdentified));
    if (shouldReplace) {
      g.tables[existingIdx] = built;
      touchedSheets.add(sheetKey);
      stats.recovered++;
    }
    return;
  }
  g.tables.push(built);
  touchedSheets.add(sheetKey);
  stats.added++;
}

/** L4 cross-source dedup: drop weaker overlapping primary tables (IoU ≥ τ). */
export function dedupCrossSourceTables(g: SheetGraph, iouThreshold = 0.72): number {
  const drop = new Set<number>();
  for (let i = 0; i < g.tables.length; i++) {
    if (drop.has(i)) continue;
    const a = g.tables[i];
    if (a.kind === "reference" || !a.rows.length) continue;
    for (let j = i + 1; j < g.tables.length; j++) {
      if (drop.has(j)) continue;
      const b = g.tables[j];
      if (b.sheet !== a.sheet || b.kind === "reference" || !b.rows.length) continue;
      if (bboxOverlapRatio(a.region, b.region) < iouThreshold) continue;
      const ca = tableCompleteness(a);
      const cb = tableCompleteness(b);
      const da = duplicateKeyCount(a);
      const db = duplicateKeyCount(b);
      const score = (t: ScheduleTable, c: { headers: number; cells: number }, d: number) =>
        c.headers * 10000 + c.cells * 10 - d * 1000 + (t.title ? 5 : 0) + (t.kind !== "reference" ? 3 : 0);
      const sa = score(a, ca, da);
      const sb = score(b, cb, db);
      if (sb > sa) drop.add(i);
      else drop.add(j);
    }
  }
  if (!drop.size) return 0;
  const kept = g.tables.filter((_, idx) => !drop.has(idx));
  g.tables.splice(0, g.tables.length, ...kept);
  return drop.size;
}

export function snapAllTableCellBboxes(
  g: SheetGraph,
  sourceSpansBySheet: Map<string, GraphSpan[]>,
  touchedSheets: Set<string>,
): number {
  let snapped = 0;
  for (let i = 0; i < g.tables.length; i++) {
    const table = g.tables[i];
    const sourceSpans = sourceSpansBySheet.get(table.sheet);
    if (!sourceSpans?.length) continue;
    const next = snapCellBboxesToSourceSpans(table, sourceSpans);
    if (next !== table) {
      g.tables[i] = next;
      snapped++;
      touchedSheets.add(table.sheet);
    }
  }
  return snapped;
}
