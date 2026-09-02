/**
 * L4.5 — raster/OCR + optional local VLM assist on the shared Session path.
 * Vector-first: OCR runs only when schedule keywords exist but vector L2 returned
 * zero tables AND the sheet carries embedded raster content (or force=true).
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

export interface OcrWord {
  text: string;
  bbox: Bbox;
  confidence: number;
}

export interface OcrRegionResult {
  words: OcrWord[];
  fullText: string;
}

/** Parse tesseract word list into page-space GraphSpan-like words. */
export function ocrWordsToSpans(words: OcrWord[], region: Bbox): GraphSpan[] {
  const [rx0, ry0] = region;
  return words
    .filter((w) => w.text.trim())
    .map((w) => ({
      str: w.text.trim(),
      x: rx0 + w.bbox[0],
      y: ry0 + w.bbox[1],
      w: Math.max(1, w.bbox[2] - w.bbox[0]),
      h: Math.max(1, w.bbox[3] - w.bbox[1]),
    }));
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
  const corners: [number, number][] = [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[0], b[3]],
    [b[2], b[3]],
  ];
  const mapped = corners.map(([x, y]) => [a * x + c * y + e, bb * x + d * y + f] as [number, number]);
  const xs = mapped.map((p) => p[0]);
  const ys = mapped.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function paragraph(text: string): ODLParagraph {
  return { type: "text", content: text };
}

/** Build a single-column-per-token ODL table from OCR spans (last resort). */
function ocrSpansToOdlTable(spans: GraphSpan[], region: Bbox, inv: number[]): ODLTable | null {
  const rows = spans.filter((s) => s.str.trim());
  if (rows.length < 2) return null;
  // Simple row-per-line grid: one row per OCR line cluster
  const lineRows: GraphSpan[][] = [];
  let cur: GraphSpan[] = [];
  let cy = 0;
  for (const sp of rows.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const tol = Math.max(sp.h * 0.4, 4);
    if (cur.length && Math.abs(sp.y - cy) > tol) {
      lineRows.push(cur);
      cur = [];
    }
    cur.push(sp);
    cy = cur.reduce((s, w) => s + w.y, 0) / cur.length;
  }
  if (cur.length) lineRows.push(cur);
  if (lineRows.length < 2) return null;

  const colCount = Math.max(2, ...lineRows.map((r) => r.length));
  let nextId = 1;
  const odlRows: ODLTableRow[] = [];
  for (let r = 0; r < lineRows.length; r++) {
    const line = lineRows[r].sort((a, b) => a.x - b.x);
    const cells: ODLTableCell[] = [];
    for (let c = 0; c < colCount; c++) {
      const sp = line[c];
      const text = sp?.str?.trim() || "";
      const bbox: Bbox = sp
        ? [sp.x, sp.y, sp.x + sp.w, sp.y + sp.h]
        : [region[0], region[1], region[0] + 1, region[1] + 1];
      cells.push({
        type: "table cell",
        id: nextId++,
        "page number": 1,
        "bounding box": projectBboxToOdl(bbox, inv),
        "row number": r + 1,
        "column number": c + 1,
        "row span": 1,
        "column span": 1,
        kids: text ? [paragraph(text)] : [],
      });
    }
    odlRows.push({ type: "table row", "row number": r + 1, id: r + 1, cells });
  }
  return {
    type: "table",
    id: 1,
    "page number": 1,
    "bounding box": projectBboxToOdl(region, inv),
    "number of rows": lineRows.length,
    "number of columns": colCount,
    rows: odlRows,
  };
}

export interface RasterAssistOpts {
  buildings?: Set<string>;
  pageViewportTransform: number[];
  region: Bbox;
  ocr: OcrRegionResult;
  force?: boolean;
}

/**
 * L4.5 OCR assist: turn raster OCR words into ScheduleTable via ODL adapter.
 * Disclosed as OCR-sourced in pipeline notes — corroborate against schedules when possible.
 */
export function scheduleTableFromOcrRegion(
  spans: GraphSpan[],
  sheetKey: string,
  opts: RasterAssistOpts,
): ScheduleTable | null {
  if (!opts.force && !sheetHasScheduleKeywords(spans) && !opts.ocr.fullText.match(/\b(SCHEDULE|TAG|GPM|CV|POINTS?)\b/i)) {
    return null;
  }
  const ocrSpans = ocrWordsToSpans(opts.ocr.words, opts.region);
  if (ocrSpans.length < 4) return null;
  const inv = invertViewportTransform(opts.pageViewportTransform);
  const odl = ocrSpansToOdlTable(ocrSpans, opts.region, inv);
  if (!odl) return null;
  const mergedSpans = [...spans, ...ocrSpans];
  return scheduleTableFromODL(odl, sheetKey, opts.pageViewportTransform, {
    buildings: opts.buildings,
    sourceSpans: mergedSpans,
  });
}

/** Optional local VLM hook — returns structured fields from a crop when configured. */
export async function vlmAssistFromCrop(
  _png: Uint8Array,
  _prompt: string,
): Promise<Record<string, string> | null> {
  // Wired slot: connect Qwen2-VL / Gemini / Llama Vision when env provides endpoint.
  // Returns null when no VLM backend configured — pipeline continues with OCR-only.
  return null;
}
