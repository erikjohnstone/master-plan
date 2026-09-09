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

/** Electrical panel-schedule column words (task #79) — real, printed labels
 * ("CIRCUIT BREAKER", "POLE(S)", "FRAME", "NEUTRAL", "WIRE SIZE", "FEEDER",
 * "PANEL", measured live on 15_IA_IowaState_Biorenewables_Lab.pdf#11's own
 * EXISTING PANEL SCHEDULE) that sheetgraph.ts's own ALL_HEADER_WORDS never
 * needed because a panel schedule is almost always pasted in as a raster
 * image rather than read as a real PDF-native table — this is scoped to
 * scheduleTableFromSidecarStructure's own extraHeaderVocab, never added to
 * the shared EQUIPMENT_HEADERS itself (that vocabulary's own single-table-
 * per-sheet slot-competition hazard, see sheetgraph.ts's own comment,
 * demands a full corpus regression sweep before ANY addition there — this
 * caller-scoped path needs none, since no other caller ever sees it). */
const PANEL_SCHEDULE_HEADER_WORDS = ["CIRCUIT", "BREAKER", "POLE", "POLES", "FRAME", "NEUTRAL", "WIRE", "TRIP", "PANEL", "FEEDER", "CKT"];

export interface OcrWord {
  text: string;
  bbox: Bbox;
  confidence: number;
}

export interface SidecarStructureCell {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  text: string;
  bbox: [number, number, number, number];
  confidence: number;
}

/** The shape web/src/lib/tableSidecarClient.ts's own SidecarTable takes —
 * duplicated here rather than imported so this file keeps its "pure, no
 * PDF/DOM, no child-process" convention (tableSidecarClient.ts spawns a
 * process); the two shapes are kept in sync by hand, same as every other
 * cross-boundary type in this codebase that can't share an import. */
export interface SidecarStructureTable {
  source: string;
  score: number;
  page: number;
  rows: number;
  cols: number;
  bbox: [number, number, number, number];
  cells: SidecarStructureCell[];
}

export interface OcrRegionResult {
  words: OcrWord[];
  fullText: string;
  /** Real row/col/span structure from rapid_table's slanet_plus engine
   * (task #79), when the sidecar is available and table_region's own gate
   * confirmed the crop actually contains a table-shaped region — see
   * scheduleTableFromSidecarStructure, which this feeds in PREFERENCE to
   * the flat-word-banding path below. `bbox` on each cell is in the
   * RENDERED CROP'S OWN PIXEL SPACE (the same space ocrScheduleRegion's PNG
   * was rendered in), not page space — scheduleTableFromSidecarStructure
   * does that projection, exactly mirroring how `words`' own bboxes are
   * projected via ocrWordsToSpans. */
  structured?: SidecarStructureTable;
  /** Pixel dimensions of the rendered crop `structured`'s own cell bboxes
   * are expressed in — required to project them back to page space
   * (projectCropBboxToRegion); absent/ignored when `structured` is absent. */
  cropWidth?: number;
  cropHeight?: number;
  /** The ACTUAL page-space region `structured`'s crop was rendered from —
   * NOT necessarily the region the caller originally asked for. Real,
   * corpus-found reason this exists (task #81, 2026-09-08): when the
   * caller's own region is an extreme aspect ratio, ocrScheduleRegion tiles
   * it into bands and table_structure runs on whichever band table_region
   * actually confirmed — that band's own bbox, not the original whole
   * region, is what cropWidth/cropHeight's scale factors are relative to.
   * Callers MUST use this in place of their own original region when
   * projecting `structured`'s cell bboxes (scheduleTableFromSidecarStructure's
   * own `opts.region`) — using the original region with a band's own crop
   * dimensions silently scales every cell bbox wrong. Absent/ignored when
   * `structured` is absent, or equal to the caller's own region when no
   * tiling happened (the common case). */
  region?: [number, number, number, number];
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

/** Project a rendered-crop PIXEL bbox into page/viewport space, exactly the
 * scaling ocrScheduleRegion already applies to tesseract word boxes
 * (`x0 + w.bbox.x0*sx`, …) — the sidecar's cell bboxes are in that SAME
 * crop-pixel space (it OCR'd and structure-read the identical PNG). */
function projectCropBboxToRegion(b: [number, number, number, number], region: Bbox, cropWidth: number, cropHeight: number): Bbox {
  const [rx0, ry0, rx1, ry1] = region;
  const sx = (rx1 - rx0) / Math.max(1, cropWidth);
  const sy = (ry1 - ry0) / Math.max(1, cropHeight);
  return [rx0 + b[0] * sx, ry0 + b[1] * sy, rx0 + b[2] * sx, ry0 + b[3] * sy];
}

/** True when a ScheduleTable's own headers show the specific corruption
 * shape scheduleTableFromODL's header/data boundary produces when its
 * vocabulary bar (ALL_HEADER_WORDS — see sheetgraph.ts) doesn't cover the
 * table's own real domain: a genuine per-column header is short and never
 * repeats across columns, but a boundary that swallowed real data rows
 * into "still header" concatenates every one of those rows' own text into
 * EVERY later column's compound label — so several "headers" end up
 * sharing one long, identical leading substring (the shared rows' own
 * text), which no real distinct column header ever does. Real, measured
 * trigger (task #79, 2026-09-08): 15_IA_IowaState_Biorenewables_Lab.pdf#11's
 * EXISTING PANEL SCHEDULE (electrical panel-schedule vocabulary — CIRCUIT/
 * BREAKER/POLE/FRAME/NEUTRAL/WIRE — genuinely absent from ALL_HEADER_WORDS,
 * a separate, disclosed gap, not something this function fixes) came back
 * with 6 of 9 headers sharing an identical 20+-character prefix ("WRE: 4
 * B-SWB-0115 EXISTING…", a title-block caption row, not a real column name,
 * repeated because it never should have counted as a header row at all).
 * Refusing here is strictly safer than shipping it: this table's own row
 * KEYS were real per-item circuit marks (A/B/BC/…) misassigned under
 * garbled column names, exactly the "genuinely wrong, not just refused"
 * shape production must never surface silently. */
export function hasCorruptedHeaders(headers: string[]): boolean {
  const seen = new Map<string, number>();
  const PREFIX_LEN = 20;
  for (const h of headers) {
    if (h.length < PREFIX_LEN) continue;
    const key = h.slice(0, PREFIX_LEN);
    seen.set(key, (seen.get(key) || 0) + 1);
  }
  for (const count of seen.values()) if (count >= 2) return true;
  return false;
}

/**
 * L4.5 OCR assist, structured path (task #79): turn rapid_table's own real
 * row/col/rowSpan/colSpan cell grid into a ScheduleTable via the SAME ODL
 * adapter the real embedded-PDF-table path already uses — reusing its
 * already-correct kind classification, header labeling, and row-keying
 * rather than inventing a second implementation of any of that. This is
 * PREFERRED over scheduleTableFromOcrRegion's own flat-word "one column per
 * token, one row per line" placeholder (explicitly marked "last resort" in
 * that function's own comment) whenever the sidecar actually produced real
 * structure — real cell spans mean real multi-tier headers and merged
 * cells survive, which the naive per-line grid can never represent.
 */
export function scheduleTableFromSidecarStructure(
  spans: GraphSpan[],
  sheetKey: string,
  opts: {
    buildings?: Set<string>;
    pageViewportTransform: number[];
    region: Bbox;
    structured: SidecarStructureTable;
    cropWidth: number;
    cropHeight: number;
  },
): ScheduleTable | null {
  const { structured } = opts;
  if (!structured.cells.length) return null;
  const inv = invertViewportTransform(opts.pageViewportTransform);
  const byRow = new Map<number, ODLTableCell[]>();
  let nextId = 1;
  for (const cell of structured.cells) {
    const regionBbox = projectCropBboxToRegion(cell.bbox, opts.region, opts.cropWidth, opts.cropHeight);
    const odlCell: ODLTableCell = {
      type: "table cell",
      id: nextId++,
      "page number": 1,
      "bounding box": projectBboxToOdl(regionBbox, inv),
      "row number": cell.row + 1,
      "column number": cell.col + 1,
      "row span": Math.max(1, cell.rowSpan),
      "column span": Math.max(1, cell.colSpan),
      kids: cell.text.trim() ? [paragraph(cell.text.trim())] : [],
    };
    const rowNum = odlCell["row number"];
    const list = byRow.get(rowNum);
    if (list) list.push(odlCell); else byRow.set(rowNum, [odlCell]);
  }
  const rows: ODLTableRow[] = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rowNumber, cells]) => ({ type: "table row" as const, "row number": rowNumber, id: rowNumber, cells }));
  if (rows.length < 2) return null;
  const odl: ODLTable = {
    type: "table",
    id: 1,
    "page number": 1,
    "bounding box": projectBboxToOdl(opts.region, inv),
    "number of rows": structured.rows,
    "number of columns": structured.cols,
    rows,
  };
  // Cell text is real OCR output, not the PDF's own vector glyphs, so there
  // is no exact pdf.js span to snap bboxes to — sourceSpans is the existing
  // sheet spans only (title-hunt context for scheduleTableFromODL), never
  // the OCR'd cells themselves.
  const table = scheduleTableFromODL(odl, sheetKey, opts.pageViewportTransform, {
    buildings: opts.buildings,
    sourceSpans: spans,
    // Real column words off ELECTRICAL PANEL SCHEDULEs (task #79, measured
    // live on 15_IA_IowaState_Biorenewables_Lab.pdf#11's EXISTING PANEL
    // SCHEDULE) that ALL_HEADER_WORDS genuinely has no equivalent for —
    // scoped to THIS caller only (see scheduleTableFromODL's own doc on
    // extraHeaderVocab): never widens EQUIPMENT_HEADERS/kind-classification
    // or the vector/geometric extractor's own unrelated vocabulary checks.
    extraHeaderVocab: PANEL_SCHEDULE_HEADER_WORDS,
    // Real, printed CAD convention (task #79, same EXISTING PANEL SCHEDULE):
    // several low-text-density spec rows (voltage/phase/wire, room/fed-from,
    // surface/feeder-size) sit between the title and the real per-column
    // header row — each individually fails scheduleTableFromODL's vocab
    // bar on its own, and the reader's original one-shot design has no
    // reason to look past the first such failure. 6 covers every real
    // pre-header row measured in that table's own EXISTING and REVISED
    // PANEL SCHEDULEs with margin, without scanning deep enough to risk
    // treating a real early data row as a rescue candidate.
    headerLookahead: 6,
    // Real, measured (same EXISTING PANEL SCHEDULE): its own per-column
    // header row states 8 of the table's 9 real columns — rapid_table's
    // structural read just never produced a distinct cell for the header's
    // own WIRE SIZE position on that one row, though several data rows do
    // carry a value there. See scheduleTableFromODL's own doc on
    // fullCoverageSlack for why 1 is the right, minimal forgiveness.
    fullCoverageSlack: 1,
  });
  if (table && hasCorruptedHeaders(table.headers)) return null;
  return table;
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
