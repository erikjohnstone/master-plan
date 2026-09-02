/**
 * L2 ScheduleTable fallback — ruled-grid spatial join (pdfplumber/Camelot lattice
 * equivalent on the shared Session path). Detects table grids from vector line
 * segments, assigns pdf.js span midpoints to cells when vector text exists,
 * and emits through the same scheduleTableFromODL adapter slot as OpenDataLoader-PDF.
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

const MIN_LINE_LEN = 24;
const LINE_AXIS_TOL = 2.5;
const GRID_CLUSTER_TOL = 4;
const MIN_GRID_ROWS = 3;
const MIN_GRID_COLS = 2;
/** Skip ruled-grid on dense plan linework; stream fallback may still run on spans. */
export const MAX_LINE_GRID_SEGMENTS = 8000;
/** Cap axis lines before O(n^4) grid search — plan tiles can yield hundreds of rules. */
const MAX_AXIS_LINES = 48;

/** Schedule-bearing language — gate fallback to sheets that plausibly carry tables. */
const SCHEDULE_KEYWORD_RE =
  /\b(SCHEDULE|SCHEDULES|POINTS?\s+LIST|DDC\s+POINTS?|CONTROL\s+VALVE|CHW|HHW|VAV|AHU|BOILER|PUMP|FAN|DIFFUSER|DAMPER)\b/i;

export function sheetHasScheduleKeywords(spans: GraphSpan[]): boolean {
  for (const sp of spans) {
    const t = String(sp.str || "").replace(/\s+/g, " ").trim();
    if (t.length < 6 || t.length > 120) continue;
    if (SCHEDULE_KEYWORD_RE.test(t)) return true;
  }
  return false;
}

function invertViewportTransform(t: number[]): number[] {
  const [a, b, c, d, e, f] = t;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-9) return [1, 0, 0, 1, 0, 0];
  const invDet = 1 / det;
  const ia = d * invDet;
  const ib = -b * invDet;
  const ic = -c * invDet;
  const id = a * invDet;
  const ie = -(ia * e + ic * f);
  const iff = -(ib * e + id * f);
  return [ia, ib, ic, id, ie, iff];
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

interface AxisLine {
  pos: number;
  start: number;
  end: number;
}

function extractAxisLines(segs: number[]): { h: AxisLine[]; v: AxisLine[] } {
  const hRaw: AxisLine[] = [];
  const vRaw: AxisLine[] = [];
  for (let i = 0; i + 3 < segs.length; i += 4) {
    const x0 = segs[i];
    const y0 = segs[i + 1];
    const x1 = segs[i + 2];
    const y1 = segs[i + 3];
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    if (dy <= LINE_AXIS_TOL && dx >= MIN_LINE_LEN) {
      hRaw.push({ pos: (y0 + y1) / 2, start: Math.min(x0, x1), end: Math.max(x0, x1) });
    } else if (dx <= LINE_AXIS_TOL && dy >= MIN_LINE_LEN) {
      vRaw.push({ pos: (x0 + x1) / 2, start: Math.min(y0, y1), end: Math.max(y0, y1) });
    }
  }
  return { h: clusterAxisLines(hRaw, "h"), v: clusterAxisLines(vRaw, "v") };
}

function capAxisLines(lines: AxisLine[]): AxisLine[] {
  if (lines.length <= MAX_AXIS_LINES) return lines;
  return lines
    .slice()
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))
    .slice(0, MAX_AXIS_LINES)
    .sort((a, b) => a.pos - b.pos);
}

function clusterAxisLines(lines: AxisLine[], axis: "h" | "v"): AxisLine[] {
  if (!lines.length) return [];
  const sorted = lines.slice().sort((a, b) => a.pos - b.pos);
  const out: AxisLine[] = [];
  let cur = { ...sorted[0] };
  for (let i = 1; i < sorted.length; i++) {
    const ln = sorted[i];
    if (Math.abs(ln.pos - cur.pos) <= GRID_CLUSTER_TOL) {
      cur.pos = (cur.pos + ln.pos) / 2;
      cur.start = Math.min(cur.start, ln.start);
      cur.end = Math.max(cur.end, ln.end);
    } else {
      out.push(cur);
      cur = { ...ln };
    }
  }
  out.push(cur);
  // Drop lines that barely span — table rules should cross most of a band.
  return out.filter((ln) => (ln.end - ln.start) >= MIN_LINE_LEN);
}

function overlap1d(a0: number, a1: number, b0: number, b1: number): number {
  const lo = Math.max(a0, b0);
  const hi = Math.min(a1, b1);
  return Math.max(0, hi - lo);
}

interface GridCandidate {
  xBounds: number[];
  yBounds: number[];
  region: Bbox;
}

function findRuledGrids(hLines: AxisLine[], vLines: AxisLine[]): GridCandidate[] {
  const out: GridCandidate[] = [];
  if (hLines.length < MIN_GRID_ROWS || vLines.length < MIN_GRID_COLS) return out;

  const ys = hLines.map((l) => l.pos);
  const xs = vLines.map((l) => l.pos);

  for (let r0 = 0; r0 <= ys.length - MIN_GRID_ROWS; r0++) {
    for (let r1 = r0 + MIN_GRID_ROWS - 1; r1 < ys.length; r1++) {
      const yBand = [ys[r0], ys[r1]];
      const hBand = hLines.filter((l) => l.pos >= yBand[0] - GRID_CLUSTER_TOL && l.pos <= yBand[1] + GRID_CLUSTER_TOL);
      if (hBand.length < MIN_GRID_ROWS) continue;

      for (let c0 = 0; c0 <= xs.length - MIN_GRID_COLS; c0++) {
        for (let c1 = c0 + MIN_GRID_COLS - 1; c1 < xs.length; c1++) {
          const xBand = [xs[c0], xs[c1]];
          const vBand = vLines.filter((l) => l.pos >= xBand[0] - GRID_CLUSTER_TOL && l.pos <= xBand[1] + GRID_CLUSTER_TOL);
          if (vBand.length < MIN_GRID_COLS) continue;

          const xSpan = xBand[1] - xBand[0];
          const ySpan = yBand[1] - yBand[0];
          if (xSpan < 80 || ySpan < 40) continue;

          // Require ruling lines to actually cross the candidate region.
          let crossH = 0;
          for (const ln of hBand) {
            if (overlap1d(ln.start, ln.end, xBand[0], xBand[1]) >= xSpan * 0.55) crossH++;
          }
          let crossV = 0;
          for (const ln of vBand) {
            if (overlap1d(ln.start, ln.end, yBand[0], yBand[1]) >= ySpan * 0.55) crossV++;
          }
          if (crossH < MIN_GRID_ROWS || crossV < MIN_GRID_COLS) continue;

          const yBounds = hBand.map((l) => l.pos).sort((a, b) => a - b);
          const xBounds = vBand.map((l) => l.pos).sort((a, b) => a - b);
          if (yBounds.length < MIN_GRID_ROWS || xBounds.length < MIN_GRID_COLS) continue;

          out.push({
            xBounds,
            yBounds,
            region: [xBounds[0], yBounds[0], xBounds[xBounds.length - 1], yBounds[yBounds.length - 1]],
          });
        }
      }
    }
  }

  // Prefer larger, denser grids; drop near-duplicates.
  out.sort((a, b) => {
    const areaA = (a.region[2] - a.region[0]) * (a.region[3] - a.region[1]);
    const areaB = (b.region[2] - b.region[0]) * (b.region[3] - b.region[1]);
    return areaB - areaA;
  });
  const kept: GridCandidate[] = [];
  for (const cand of out) {
    if (kept.some((k) => bboxOverlapRatio(k.region, cand.region) >= 0.7)) continue;
    kept.push(cand);
  }
  return kept;
}

function bboxOverlapRatio(a: Bbox, b: Bbox): number {
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

function spanMidInCell(sp: GraphSpan, x0: number, x1: number, y0: number, y1: number): boolean {
  const hMid = sp.x + sp.w / 2;
  const vMid = sp.y + sp.h / 2;
  return hMid >= x0 && hMid < x1 && vMid >= y0 && vMid < y1;
}

function cellText(spans: GraphSpan[], x0: number, x1: number, y0: number, y1: number): string {
  const hits = spans
    .filter((sp) => sp.str?.trim() && spanMidInCell(sp, x0, x1, y0, y1))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((sp) => sp.str.trim());
  return hits.join(" ").replace(/\s+/g, " ").trim();
}

function paragraph(text: string): ODLParagraph {
  return { type: "text", content: text };
}

function makeOdlCell(
  id: number,
  row: number,
  col: number,
  text: string,
  bboxProject: Bbox,
  invTransform: number[],
): ODLTableCell {
  return {
    type: "table cell",
    id,
    "page number": 1,
    "bounding box": projectBboxToOdl(bboxProject, invTransform),
    "row number": row,
    "column number": col,
    "row span": 1,
    "column span": 1,
    kids: text ? [paragraph(text)] : [],
  };
}

function gridToOdlTable(
  grid: GridCandidate,
  spans: GraphSpan[],
  invTransform: number[],
): ODLTable | null {
  const { xBounds, yBounds } = grid;
  const rows = yBounds.length - 1;
  const cols = xBounds.length - 1;
  if (rows < MIN_GRID_ROWS || cols < MIN_GRID_COLS) return null;

  const texts: string[][] = Array.from({ length: rows }, () => new Array(cols).fill(""));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      texts[r][c] = cellText(spans, xBounds[c], xBounds[c + 1], yBounds[r], yBounds[r + 1]);
    }
  }

  const nonEmptyRows = texts.filter((row) => row.some((cell) => cell.trim())).length;
  if (nonEmptyRows < 2) return null;

  let nextId = 1;
  const odlRows: ODLTableRow[] = [];
  for (let r = 0; r < rows; r++) {
    const cells: ODLTableCell[] = [];
    for (let c = 0; c < cols; c++) {
      const bbox: Bbox = [xBounds[c], yBounds[r], xBounds[c + 1], yBounds[r + 1]];
      cells.push(makeOdlCell(nextId++, r + 1, c + 1, texts[r][c], bbox, invTransform));
    }
    odlRows.push({ type: "table row", "row number": r + 1, id: r + 1, cells });
  }

  return {
    type: "table",
    id: 1,
    "page number": 1,
    "bounding box": projectBboxToOdl(grid.region, invTransform),
    "number of rows": rows,
    "number of columns": cols,
    rows: odlRows,
  };
}

export interface LineGridExtractOpts {
  buildings?: Set<string>;
  sourceSpans?: GraphSpan[];
  pageViewportTransform: number[];
  /** When true, run even if schedule keywords are absent (unit tests). */
  force?: boolean;
}

/**
 * L2 ruled-grid fallback: line segments → cell grid → span midpoint fill → ODL adapter.
 * Returns zero or more ScheduleTable candidates for one sheet.
 */
export function extractScheduleTablesFromLineGrid(
  spans: GraphSpan[],
  segs: number[] | undefined,
  sheetKey: string,
  opts: LineGridExtractOpts,
): ScheduleTable[] {
  if (!segs?.length) return [];
  if (segs.length / 4 > MAX_LINE_GRID_SEGMENTS) return [];
  if (!opts.force && !sheetHasScheduleKeywords(spans)) return [];

  const { h, v } = extractAxisLines(segs);
  const grids = findRuledGrids(capAxisLines(h), capAxisLines(v));
  if (!grids.length) return [];

  const inv = invertViewportTransform(opts.pageViewportTransform);
  const out: ScheduleTable[] = [];
  for (const grid of grids) {
    const odl = gridToOdlTable(grid, spans, inv);
    if (!odl) continue;
    const built = scheduleTableFromODL(odl, sheetKey, opts.pageViewportTransform, {
      buildings: opts.buildings,
      sourceSpans: opts.sourceSpans ?? spans,
    });
    if (built) out.push(built);
  }
  return out;
}
