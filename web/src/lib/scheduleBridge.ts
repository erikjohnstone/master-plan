// The read_schedule -> sheetgraph bridge (cross-phase fix, surfaced during
// the HVAC/BAS maturity plan's Phase 5 live-testing). `read_schedule`'s own
// parser (`scheduleParse.ts`) needs a literal CODE header plus a preceding
// flooring section header — structurally unable to read an MEP equipment
// schedule under ANY region, since M601's key column is `ID`, not `CODE`,
// and it has no flooring section rows at all. This module is the fallback:
// reconcile an agent's normalized 0..1 region against the whole-set sheet
// graph's own pixel-space tables (`sheetgraph.ts`'s `buildSheetGraph`),
// which already reads these tables correctly (see EQUIPMENT_HEADERS).
//
// Pure and Node-testable — no React, no pdf.js. Named for the one thing it
// does: reconcile normalized agent regions against pixel-space graph tables.
// Not a rewrite of scheduleParse (that stays untouched — it's load-bearing
// for the flooring "Import from schedule" dialog) and not a mapping of
// TableRow into scheduleParse's fixed ScheduleRow shape (that would silently
// drop VOLTAGE/WATTS/PHASE/AMPS/LENGTH — exactly the columns a real MEP
// lookup asks for).

import type { ScheduleTable, TableRow } from "./sheetgraph";

export interface NormRegion { x0: number; y0: number; x1: number; y1: number }
export interface BridgeHit { table: ScheduleTable; coverage: number; region_norm: NormRegion }

const DEFAULT_MIN_COVERAGE = 0.25;
const DEFAULT_LIMIT = 3;

function normRegionOf(bbox: readonly [number, number, number, number], dims: { w: number; h: number }): NormRegion {
  const [x0, y0, x1, y1] = bbox;
  return {
    x0: +(x0 / dims.w).toFixed(4), y0: +(y0 / dims.h).toFixed(4),
    x1: +(x1 / dims.w).toFixed(4), y1: +(y1 / dims.h).toFixed(4),
  };
}

/** Tables on `sheet` whose region overlaps `region`, best coverage first.
 *
 * Overlap rule (deliberate, not "area > 0"): score by intersection area AS A
 * FRACTION OF THE TABLE'S OWN AREA — "how much of this table did the
 * agent's region actually cover" — and require coverage >= minCoverage
 * (default 0.25). A sloppy-but-honest region drawn around a table scores
 * high; a whole-sheet region legitimately covers several tables (all
 * returned, best first, capped at `limit`); a stray sliver clipping a
 * table's corner scores low and is rejected rather than answering with a
 * table the agent never meant. Returns a LIST, not a single best match — a
 * real sheet (M601) genuinely carries two same-titled tables
 * ("DUCTWORK INSULATION SCHEDULE" x2), so collapsing to one match would
 * silently pick a winner the agent never asked for. */
export function tablesOverlappingRegion(
  tables: ScheduleTable[], sheet: string, region: NormRegion,
  dims: { w: number; h: number }, opts: { minCoverage?: number; limit?: number } = {},
): BridgeHit[] {
  const minCoverage = opts.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const rx0 = region.x0 * dims.w, ry0 = region.y0 * dims.h, rx1 = region.x1 * dims.w, ry1 = region.y1 * dims.h;
  const hits: BridgeHit[] = [];
  for (const t of tables) {
    if (t.sheet !== sheet) continue;
    const [tx0, ty0, tx1, ty1] = t.region;
    const ix0 = Math.max(rx0, tx0), iy0 = Math.max(ry0, ty0);
    const ix1 = Math.min(rx1, tx1), iy1 = Math.min(ry1, ty1);
    const iw = Math.max(0, ix1 - ix0), ih = Math.max(0, iy1 - iy0);
    const inter = iw * ih;
    if (inter <= 0) continue;
    const tableArea = Math.max(1, (tx1 - tx0) * (ty1 - ty0));
    const coverage = inter / tableArea;
    if (coverage < minCoverage) continue;
    hits.push({ table: t, coverage, region_norm: normRegionOf(t.region, dims) });
  }
  hits.sort((a, b) => b.coverage - a.coverage);
  return hits.slice(0, limit);
}

const DEFAULT_MAX_ROWS = 60;
const DEFAULT_MAX_CHARS = 200;

/** TableRow[] -> flat, wire-safe rows: {key, cells: Record<string,string>}.
 * Bboxes are dropped deliberately — the model can't act on them here, and
 * carrying them would triple the token cost for no gain; sheet_graph/
 * find_schedule still carry full cell bboxes for callers that need them. */
export function bridgeRows(
  table: ScheduleTable, opts: { maxRows?: number; maxChars?: number } = {},
): Array<{ key: string; cells: Record<string, string> }> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const trunc = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars)}…` : s);
  return table.rows.slice(0, maxRows).map((r: TableRow) => ({
    key: r.key,
    cells: Object.fromEntries(Object.entries(r.cells).map(([k, c]) => [k, trunc(c.text)])),
  }));
}
