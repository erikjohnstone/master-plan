/**
 * L2 sidecar → ScheduleTable adapter (shared Session path).
 * Converts Python sidecar grids to ODL → scheduleTableFromODL with span grounding.
 */
import { parseSheetKey } from "./sheetKey.ts";
import {
  scheduleTableFromODL,
  type Bbox,
  type GraphSpan,
  type ODLParagraph,
  type ODLTable,
  type ODLTableCell,
  type ODLTableRow,
  type ScheduleTable,
} from "./sheetgraph.ts";
import type { SidecarCell, SidecarExplicitLines, SidecarTable } from "./tableSidecarClient.ts";
import { extractTablesViaSidecar, sidecarEnabled } from "./tableSidecarClient.ts";

const SANITY_MIN_ROWS = 2;
const SANITY_MIN_COLS = 2;
const SANITY_MIN_FILL = 0.6;

export interface SidecarExtractContext {
  pdfPath: string;
  sheetKey: string;
  spans: GraphSpan[];
  segs?: number[];
  pageViewportTransform: number[];
  buildings?: Set<string>;
  bboxHint?: Bbox;
}

function invertViewportTransform(t: number[]): number[] {
  const [a, b, c, d, e, f] = t;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return [1, 0, 0, 1, 0, 0];
  const invDet = 1 / det;
  return [
    d * invDet,
    -b * invDet,
    -c * invDet,
    a * invDet,
    -(d * invDet * e + -c * invDet * f),
    -(-b * invDet * e + a * invDet * f),
  ];
}

function projectBboxToOdl(b: Bbox, inv: number[]): number[] {
  const [a, bb, c, d, e, f] = inv;
  const pts: [number, number][] = [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[0], b[3]],
    [b[2], b[3]],
  ];
  const mapped = pts.map(([x, y]) => [a * x + c * y + e, bb * x + d * y + f] as [number, number]);
  const xs = mapped.map((p) => p[0]);
  const ys = mapped.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function spanIdsForBbox(spans: GraphSpan[], bbox: Bbox): string[] {
  const [x0, y0, x1, y1] = bbox;
  const ids: string[] = [];
  for (let i = 0; i < spans.length; i++) {
    const sp = spans[i];
    const cx = sp.x + sp.w / 2;
    const cy = sp.y + sp.h / 2;
    if (cx >= x0 && cx < x1 && cy >= y0 && cy < y1) ids.push(`span:${i}`);
  }
  return ids;
}

function paragraph(text: string): ODLParagraph {
  return { type: "text", content: text };
}

function sidecarPassesSanity(table: SidecarTable): boolean {
  if (table.rows < SANITY_MIN_ROWS || table.cols < SANITY_MIN_COLS) return false;
  if (!table.cells?.length) return false;
  const nonEmpty = table.cells.filter((c) => c.text?.trim()).length;
  if (nonEmpty / table.cells.length < SANITY_MIN_FILL) return false;
  const tb = table.bbox;
  for (const c of table.cells) {
    const cb = c.bbox;
    if (cb[2] <= cb[0] || cb[3] <= cb[1]) continue;
    if (cb[0] < tb[0] - 2 || cb[1] < tb[1] - 2 || cb[2] > tb[2] + 2 || cb[3] > tb[3] + 2) return false;
  }
  const header = table.cells.filter((c) => c.row === 0);
  if (!header.some((c) => c.text?.trim())) return false;
  return true;
}

function segsToExplicitLines(segs: number[]): SidecarExplicitLines {
  const horizontal: [number, number, number, number][] = [];
  const vertical: [number, number, number, number][] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const x0 = segs[i];
    const y0 = segs[i + 1];
    const x1 = segs[i + 2];
    const y1 = segs[i + 3];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (dy <= 2.5 && dx >= 24) horizontal.push([x0, y0, x1, y1]);
    else if (dx <= 2.5 && dy >= 24) vertical.push([x0, y0, x1, y1]);
  }
  return { horizontal, vertical };
}

function sidecarCellToOdl(
  cell: SidecarCell,
  id: number,
  inv: number[],
): ODLTableCell {
  return {
    type: "table cell",
    id,
    "page number": 1,
    "bounding box": projectBboxToOdl(cell.bbox, inv),
    "row number": cell.row + 1,
    "column number": cell.col + 1,
    "row span": cell.rowSpan || 1,
    "column span": cell.colSpan || 1,
    kids: cell.text ? [paragraph(cell.text)] : [],
  };
}

function sidecarTableToOdl(table: SidecarTable, inv: number[]): ODLTable {
  const rows: ODLTableRow[] = [];
  let cellId = 1;
  for (let r = 0; r < table.rows; r++) {
    const rowCells = table.cells.filter((c) => c.row === r).sort((a, b) => a.col - b.col);
    rows.push({
      type: "table row",
      "row number": r + 1,
      cells: rowCells.map((c) => sidecarCellToOdl(c, cellId++, inv)),
    });
  }
  return {
    type: "table",
    "page number": table.page,
    "bounding box": projectBboxToOdl(table.bbox, inv),
    "number of rows": table.rows,
    "number of columns": table.cols,
    rows,
  };
}

export function sidecarTableToScheduleTable(
  table: SidecarTable,
  ctx: SidecarExtractContext,
): ScheduleTable | null {
  if (!sidecarPassesSanity(table)) return null;
  const inv = invertViewportTransform(ctx.pageViewportTransform);
  const odl = sidecarTableToOdl(table, inv);
  const built = scheduleTableFromODL(odl, ctx.sheetKey, ctx.pageViewportTransform, {
    buildings: ctx.buildings,
    sourceSpans: ctx.spans,
  });
  if (!built) return null;
  built.region = table.bbox;
  for (const row of built.rows) {
    for (const [col, cell] of Object.entries(row.cells)) {
      const ids = spanIdsForBbox(ctx.spans, cell.bbox);
      if (ids.length) (cell as { spanIds?: string[] }).spanIds = ids;
    }
  }
  return built;
}

/** Run Python sidecar backends for one sheet; returns ScheduleTable candidates. */
export async function extractScheduleTablesFromSidecar(
  ctx: SidecarExtractContext,
): Promise<ScheduleTable[]> {
  if (!sidecarEnabled()) return [];
  const { page } = parseSheetKey(ctx.sheetKey);
  const explicitLines = ctx.segs?.length ? segsToExplicitLines(ctx.segs) : undefined;
  const sidecarTables = await extractTablesViaSidecar({
    pdfPath: ctx.pdfPath,
    page,
    ...(ctx.bboxHint ? { bboxHint: ctx.bboxHint } : {}),
    ...(explicitLines ? { explicitLines } : {}),
  });
  const out: ScheduleTable[] = [];
  for (const t of sidecarTables) {
    const built = sidecarTableToScheduleTable(t, ctx);
    if (built) out.push(built);
  }
  return out;
}

export { sidecarPassesSanity, segsToExplicitLines, spanIdsForBbox };
