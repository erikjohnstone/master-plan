/**
 * L2 stream-mode fallback — borderless schedule grids via column alignment +
 * span midpoint fill (pdfplumber stream flavor). Emits through scheduleTableFromODL.
 */
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
import { sheetHasScheduleKeywords } from "./scheduleGridFallback.ts";

const HEADER_WORDS =
  /\b(TAG|MARK|ID|SYMBOL|GPM|CV|SERVED|MANUFACTURER|MODEL|SIZE|QTY|AI|AO|BI|BO|DESCRIPTION|TYPE|LOCATION)\b/i;

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

function clusterRows(spans: GraphSpan[]): GraphSpan[][] {
  const toks = spans.filter((s) => s.str?.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: GraphSpan[][] = [];
  let cur: GraphSpan[] = [];
  let cy = 0;
  for (const t of toks) {
    const tol = Math.max((t.h || 8) * 0.35, 3);
    if (cur.length && Math.abs(t.y - cy) > tol) {
      rows.push(cur);
      cur = [];
    }
    cur.push(t);
    cy = cur.reduce((s, w) => s + w.y, 0) / cur.length;
  }
  if (cur.length) rows.push(cur);
  return rows;
}

function clusterColumns(row: GraphSpan[], tol = 18): number[] {
  const xs = row.map((s) => s.x + s.w / 2).sort((a, b) => a - b);
  const cols: number[] = [];
  for (const x of xs) {
    const near = cols.find((c) => Math.abs(c - x) <= tol);
    if (near != null) cols[cols.indexOf(near)] = (near + x) / 2;
    else cols.push(x);
  }
  return cols.sort((a, b) => a - b);
}

function assignRowToColumns(row: GraphSpan[], colXs: number[], tol = 24): string[] {
  const texts = new Array(colXs.length).fill("");
  for (const sp of row) {
    const mid = sp.x + sp.w / 2;
    let best = -1;
    let bestD = tol;
    for (let i = 0; i < colXs.length; i++) {
      const d = Math.abs(mid - colXs[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) texts[best] = texts[best] ? `${texts[best]} ${sp.str.trim()}` : sp.str.trim();
  }
  return texts;
}

function paragraph(text: string): ODLParagraph {
  return { type: "text", content: text };
}

function streamGridToOdl(
  headerTexts: string[],
  dataRows: string[][],
  region: Bbox,
  inv: number[],
): ODLTable | null {
  const cols = headerTexts.length;
  const rows = 1 + dataRows.length;
  if (cols < 2 || dataRows.length < 1) return null;
  const colW = (region[2] - region[0]) / cols;
  const rowH = (region[3] - region[1]) / rows;
  let nextId = 1;
  const odlRows: ODLTableRow[] = [];
  const allRows = [headerTexts, ...dataRows];
  for (let r = 0; r < rows; r++) {
    const cells: ODLTableCell[] = [];
    for (let c = 0; c < cols; c++) {
      const bbox: Bbox = [
        region[0] + c * colW,
        region[1] + r * rowH,
        region[0] + (c + 1) * colW,
        region[1] + (r + 1) * rowH,
      ];
      cells.push({
        type: "table cell",
        id: nextId++,
        "page number": 1,
        "bounding box": projectBboxToOdl(bbox, inv),
        "row number": r + 1,
        "column number": c + 1,
        "row span": 1,
        "column span": 1,
        kids: allRows[r][c] ? [paragraph(allRows[r][c])] : [],
      });
    }
    odlRows.push({ type: "table row", "row number": r + 1, id: r + 1, cells });
  }
  return {
    type: "table",
    id: 1,
    "page number": 1,
    "bounding box": projectBboxToOdl(region, inv),
    "number of rows": rows,
    "number of columns": cols,
    rows: odlRows,
  };
}

export interface StreamGridExtractOpts {
  buildings?: Set<string>;
  sourceSpans?: GraphSpan[];
  pageViewportTransform: number[];
  force?: boolean;
}

/** Borderless schedule table via aligned columns (L2 stream fallback). */
export function extractScheduleTablesFromStreamGrid(
  spans: GraphSpan[],
  sheetKey: string,
  opts: StreamGridExtractOpts,
): ScheduleTable[] {
  if (!opts.force && !sheetHasScheduleKeywords(spans)) return [];
  const rows = clusterRows(spans.filter((s) => !s.rot));
  if (rows.length < 3) return [];

  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 12); i++) {
    const blob = rows[i].map((s) => s.str).join(" ");
    const hits = (blob.match(new RegExp(HEADER_WORDS.source, "gi")) || []).length;
    if (hits >= 3) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  const headerRow = rows[headerIdx];
  const colXs = clusterColumns(headerRow);
  if (colXs.length < 2) return [];

  const headerTexts = assignRowToColumns(headerRow, colXs);
  const dataRows: string[][] = [];
  let y0 = Math.min(...headerRow.map((s) => s.y));
  let y1 = Math.max(...headerRow.map((s) => s.y + s.h));
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const texts = assignRowToColumns(rows[i], colXs);
    if (texts.filter(Boolean).length < 2) continue;
    if (texts.every((t) => !t.trim())) continue;
    dataRows.push(texts);
    y1 = Math.max(y1, ...rows[i].map((s) => s.y + s.h));
    y0 = Math.min(y0, ...rows[i].map((s) => s.y));
    if (dataRows.length >= 80) break;
  }
  if (!dataRows.length) return [];

  const x0 = Math.min(...headerRow.map((s) => s.x));
  const x1 = Math.max(...headerRow.map((s) => s.x + s.w));
  const region: Bbox = [x0 - 4, y0 - 4, x1 + 4, y1 + 4];
  const inv = invertViewportTransform(opts.pageViewportTransform);
  const odl = streamGridToOdl(headerTexts, dataRows, region, inv);
  if (!odl) return [];
  const built = scheduleTableFromODL(odl, sheetKey, opts.pageViewportTransform, {
    buildings: opts.buildings,
    sourceSpans: opts.sourceSpans ?? spans,
  });
  return built ? [built] : [];
}
