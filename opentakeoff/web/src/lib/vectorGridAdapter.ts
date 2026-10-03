/**
 * Vectorgrid → ScheduleTable. The only new coordinate code on this path.
 *
 * THE CONVERSION, AND WHY IT IS A SCALAR
 * --------------------------------------
 * Vectorgrid reports points with a top-left origin, normalised to the page's
 * own corner and with /Rotate applied — the display frame. pdf.js's viewport
 * produces the same frame at RENDER_SCALE. Measured against pdf.js's own
 * transform on both a /Rotate 0 page with a non-origin MediaBox
 * (009_FL#30 → [2,0,0,-2,3024,2160]) and a /Rotate 90 page
 * (009_FL#7 → [0,2,2,0,0,0]), the mapping is exactly
 *
 *     project_px = vectorgrid_pt × scale,    scale = hypot(t[0], t[1])
 *
 * with no offset and no rotation term, because both sides have already
 * removed both. So instead of writing a new projection, a SCALE-ONLY
 * transform is handed to `scheduleTableFromODL`, which maps every bbox
 * through `odlBboxToProjectSpace` for us. That function takes the min/max of
 * the four mapped corners, so a top-left-origin y-down input is fine.
 *
 * THE BUG THIS MUST NOT INHERIT
 * -----------------------------
 * `scheduleTableSidecarAdapter.ts` inverts the viewport transform, hands the
 * result to `scheduleTableFromODL`, which maps it forward through the same
 * matrix — inverse ∘ forward is the identity, so its cells stay in raw
 * pdfplumber points, and `:163` then assigns `built.region = table.bbox`
 * explicitly in points. Production `Bbox` is project px, so those are a
 * consistent 2× error. Its unit test passes an identity transform, where the
 * round trip is also the identity, so the test can never see it.
 *
 * Here there is no matrix to invert and no region assignment: one scalar,
 * derived from the transform actually in force rather than from the
 * RENDER_SCALE constant, and a test that uses a rotated, non-identity
 * transform so a wrong scale cannot pass.
 *
 * THE SPACES ARE CHECKED, NOT ASSUMED
 * -----------------------------------
 * Python reports the page box it measured in. If that box times the scale is
 * not the viewport this sheet was rendered at, the two processes are not
 * describing the same page — a CropBox that differs from the MediaBox would
 * do it — and the sheet is refused with a reason rather than emitting boxes
 * that land silently in the wrong place. `page_origin`'s own docstring is the
 * warning: a constant displacement is invisible inside the process that makes
 * it, and only shows up once a coordinate leaves.
 */
import {
  BAS_POINT_SECTION_HEADING_RE,
  scheduleTableFromODL,
  type Bbox,
  type GraphSpan,
  type ODLParagraph,
  type ODLTable,
  type ODLTableCell,
  type ODLTableRow,
  type ScheduleTable,
} from "./sheetgraph.ts";
import { parseSheetKey } from "./sheetKey.ts";
import {
  extractGridViaSidecar,
  type VectorGridCell,
  type VectorGridTable,
} from "./vectorGridClient.ts";

/** Page-size agreement tolerance, in project px. One px of rounding between
 * pdfplumber's page box and pdf.js's viewport is ordinary; more is a
 * different page box. */
const PAGE_BOX_TOL = 2.0;

export interface VectorGridContext {
  sheetKey: string;
  pdfPath: string;
  spans: GraphSpan[];
  /** pdf.js viewport transform for this page, at the project's render scale. */
  pageViewportTransform: number[];
  /** Viewport size in project px — what the page box is checked against. */
  width: number;
  height: number;
  buildings?: Set<string>;
}

export class VectorGridSpaceError extends Error {}

/** The scale pdf.js's viewport applies, read off the transform itself.
 * A viewport transform is always scale × rotation × flip, so both columns
 * carry the same magnitude; if they don't, this is not a viewport transform
 * and no scalar describes it. */
export function viewportScale(t: number[]): number {
  const sx = Math.hypot(t[0], t[1]);
  const sy = Math.hypot(t[2], t[3]);
  if (!(sx > 0) || Math.abs(sx - sy) > 1e-6 * Math.max(1, sx)) {
    throw new VectorGridSpaceError(
      `viewport transform is not a uniform scale+rotation: [${t.join(", ")}]`,
    );
  }
  return sx;
}

function paragraph(text: string): ODLParagraph {
  return { type: "text", content: text };
}

function cellToOdl(c: VectorGridCell, id: number, page: number): ODLTableCell {
  return {
    type: "table cell",
    id,
    "page number": page,
    "bounding box": c.bbox,
    "row number": c.row + 1,
    "column number": c.col + 1,
    "row span": Math.max(1, c.rowSpan || 1),
    "column span": Math.max(1, c.colSpan || 1),
    kids: c.text ? [paragraph(c.text)] : [],
  };
}

export function vectorGridTableToOdl(t: VectorGridTable, page: number): ODLTable {
  const byRow = new Map<number, ODLTableCell[]>();
  let id = 1;
  for (const c of t.cells) {
    const list = byRow.get(c.row);
    const cell = cellToOdl(c, id++, page);
    if (list) list.push(cell);
    else byRow.set(c.row, [cell]);
  }
  const rows: ODLTableRow[] = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([r, cells]) => ({
      type: "table row" as const,
      id: r + 1,
      "row number": r + 1,
      cells: cells.sort((a, b) => a["column number"] - b["column number"]),
    }));
  return {
    type: "table",
    id: 1,
    "page number": page,
    "bounding box": t.bbox,
    "number of rows": t.rows,
    "number of columns": t.cols,
    rows,
  };
}

// A schedule's numbered notes printed inside its own grid (AS-155): a row
// whose first cell is the label NOTES, then rows each holding a note number
// and one line of text, the text in one cell spanning the row or alone in
// it. 07_MO's pictured PUMP SCHEDULE prints "NOTE" and then "1 BOLTED
// FLANGE" … "6 ECM MOTOR" under its last pump: read as rows, every note was a
// pump keyed "1" to "6". Only a band that is all notes (or blank rows) to the
// table's end is dropped; one row in it that holds more than a line of text
// keeps the whole band, and the label row itself stays, as before. The
// table's region is unchanged: the notes are still printed inside it, where
// scheduleNotes reads them from the page's text.
const NOTES_LABEL = /^\s*NOTES?\s*:?\s*$/i;
const NOTE_NUMBER = /^\s*\(?\d{1,2}\s*[.)]?\s*$/;

export function dropNumberedNotes(t: VectorGridTable): VectorGridTable {
  const byRow = new Map<number, VectorGridCell[]>();
  for (const c of t.cells) {
    const list = byRow.get(c.row);
    if (list) list.push(c);
    else byRow.set(c.row, [c]);
  }
  const rows = [...byRow.keys()].sort((a, b) => a - b);
  const lead = (r: number) => byRow.get(r)!.reduce((a, c) => (c.col < a.col ? c : a));
  const label = rows.findIndex((r) => r > 0 && lead(r).col === 0 && NOTES_LABEL.test(lead(r).text));
  if (label < 0) return t;
  const band = rows.slice(label + 1);
  let numbered = 0;
  for (const r of band) {
    const cells = byRow.get(r)!;
    if (cells.every((c) => !c.text.trim())) continue;
    const first = lead(r);
    if (first.col !== 0 || !NOTE_NUMBER.test(first.text)) return t;
    if (cells.filter((c) => c !== first && c.text.trim()).length > 1) return t;
    numbered++;
  }
  if (!numbered) return t;
  const keep = rows[label];
  const cells = t.cells.filter((c) => c.row <= keep);
  return { ...t, cells, rows: keep + 1 };
}

// A title and notes printed beside a notes column, not across the table.
// 032_PA's SPLIT SYSTEM OUTDOOR UNIT (CONDENSER) SCHEDULE prints its title
// over columns 6-24 of 25, beside a NOTES column (0-5) whose label and notes
// sit in the two rows under it, above the header. The title spanned too few
// columns for a title rule, the notes joined every column's name, and the
// table's 38 outdoor units reached no family. Before the header (the first
// row with two cells of text), a row whose one text cell, among cells one row
// tall, is the title (row 0, naming a SCHEDULE) or notes (a NOTES label or a
// numbered note): the title is read as one cell spanning every column, as the
// indoor schedule above it prints it, and the notes rows leave the grid. A
// header's group label alone in its row ("ELECTRICAL") is neither.
const PROSE_TITLE = /\bSCHEDULES?\b/i;
const PROSE_NOTES = /^\s*(?:(?:NOTES?|REMARKS?)\s*:|\(\d{1,2}\)\s+\S|\d{1,2}\.\s+[A-Z])/i;

export function widenLeadingProse(t: VectorGridTable): VectorGridTable {
  const byRow = new Map<number, VectorGridCell[]>();
  for (const c of t.cells) {
    const list = byRow.get(c.row);
    if (list) list.push(c);
    else byRow.set(c.row, [c]);
  }
  const widened = new Map<number, VectorGridCell>();
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const cells = byRow.get(r)!;
    const texted = cells.filter((c) => c.text.trim());
    // A title the rules cut into pieces, each across several columns
    // (096_IN's "DIFFUSER / GRILLE" | "SCHEDULE"), is one title.
    const cutTitle = r === 0 && texted.length >= 2 && cells.every((c) => (c.colSpan || 1) > 1 && (c.rowSpan || 1) === 1)
      && PROSE_TITLE.test(texted.map((c) => c.text).join(" "));
    if (texted.length >= 2 && !cutTitle) break;
    if (!texted.length) continue;
    const lone = cutTitle
      ? { ...texted[0], text: texted.slice().sort((a, b) => a.col - b.col).map((c) => c.text.trim()).join(" "), colSpan: 1 }
      : texted[0];
    if (cells.some((c) => (c.rowSpan || 1) > 1)) break;
    if ((lone.colSpan || 1) >= t.cols) continue;
    const prose = r === 0 ? PROSE_TITLE.test(lone.text) : PROSE_NOTES.test(lone.text);
    if (!prose) break;
    const boxes = cells.map((c) => c.bbox);
    widened.set(r, {
      ...lone, col: 0, colSpan: t.cols,
      bbox: [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1])),
        Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))],
    });
  }
  if (!widened.size) return t;
  // Notes rows leave the grid, as dropNumberedNotes leaves a notes band below
  // the units: the region still holds them, where scheduleNotes reads them
  // from the page's text. The rows under them move up.
  const dropped = [...widened.keys()].filter((r) => r > 0).sort((a, b) => a - b);
  const shift = (r: number) => r - dropped.filter((d) => d < r).length;
  const cells = t.cells
    .filter((c) => !widened.has(c.row))
    .concat(widened.has(0) ? [widened.get(0)!] : [])
    .map((c) => (dropped.length ? { ...c, row: shift(c.row) } : c));
  return { ...t, cells, rows: t.rows - dropped.length };
}

/** One vectorgrid region → one ScheduleTable, or null when it is not a
 * schedule shape at all. Everything downstream of the grid — title, header
 * tiers, row keys, kind, building, span snapping — is `scheduleTableFromODL`,
 * unchanged. */
export function vectorGridTableToScheduleTable(
  t: VectorGridTable,
  page: number,
  ctx: VectorGridContext,
  scale: number,
  reject?: (reason: string) => void,
): ScheduleTable | null {
  // A raster region is a picture of a table: no faces, and its text is ink.
  // Presenting it as an empty grid would let it merge over a real read.
  if (t.raster || !t.cells.length) return null;
  const odl = vectorGridTableToOdl(dropNumberedNotes(widenLeadingProse(t)), page);
  const table = scheduleTableFromODL(odl, ctx.sheetKey, [scale, 0, 0, scale, 0, 0], {
    ...(ctx.buildings ? { buildings: ctx.buildings } : {}),
    ...(reject ? { reject } : {}),
    sourceSpans: ctx.spans,
    // B-38: vectorgrid's own row-grid line detection can genuinely emit a
    // header-only candidate for a real table whose leaf tier is unit labels
    // (TONS/GPM/[kW]/...) rather than column names — see
    // scheduleTableFromODL's own unitLabelSubHeader doc. Scoped to this one
    // vectorgrid caller, not every scheduleTableFromODL caller, matching
    // this bug's own found scope.
    unitLabelSubHeader: true,
    // B-19: vectorgrid's own row-grid line detection can genuinely find a
    // real table's data body correctly while its own column-name row prints
    // loose, with no rules of its own, above the ruled grid entirely — see
    // scheduleTableFromODL's own unruledHeaderAbove/
    // synthesizeUnruledHeaderAbove doc. Scoped to this one vectorgrid
    // caller, matching this bug's own found scope (an ODL table sourced
    // through vectorgrid).
    unruledHeaderAbove: true,
  });
  // A picture read by OCR says so on the table (AS-153): sheet_graph,
  // find_schedule and the takeoff's items carry it to whoever reads them.
  if (table && t.ocr) {
    table.read_from_picture = true;
    for (const row of table.rows) {
      const key = String(row.key ?? "");
      const read = pictureMarkDigits(key);
      if (read === key) continue;
      row.key = read;
      for (const cell of Object.values(row.cells || {})) if (cell && cell.text === key) cell.text = read;
    }
  }
  return table;
}

/** A mark read from a picture with its number's 1 as the letter I (or l, or
 * a bar) and its 0 as O. A CAD single-stroke font draws a 1 as a bare stroke,
 * and OCR reads it as a letter: 08_ME's ink-lettered M102 and P103 came back
 * EF-I, CH-I, ET-I and MV-I beside EF-2 and CH-2, and ET-I was no expansion
 * tank. Only a picture's marks: a mark printed as text says what it says. Of
 * the corpus's picture-read tables, 08_ME's are the only ones with such a mark. */
const PICTURE_MARK_RE = /^([A-Z]{1,5}[\s-])([0-9IOl|]{1,3})$/;
export function pictureMarkDigits(text: string): string {
  const m = PICTURE_MARK_RE.exec(text.trim());
  if (!m || !/[IOl|]/.test(m[2])) return text;
  return m[1] + m[2].replace(/[Il|]/g, "1").replace(/O/g, "0");
}

/** Do the two processes describe the same page? "size" is a different page
 * box (a CropBox that is not the MediaBox would do it); "rotation" is the
 * same page the two sides disagree about the orientation of. Neither may be
 * absorbed: a constant displacement is invisible in the process that makes it
 * and only shows up once a coordinate leaves. */
export function pageBoxAgrees(
  reply: { pageWidth: number; pageHeight: number },
  scale: number,
  viewportWidth: number,
  viewportHeight: number,
): "ok" | "size" | "rotation" {
  const w = reply.pageWidth * scale;
  const h = reply.pageHeight * scale;
  const fits = (a: number, b: number) => Math.abs(a - b) <= PAGE_BOX_TOL;
  if (fits(w, viewportWidth) && fits(h, viewportHeight)) return "ok";
  if (fits(w, viewportHeight) && fits(h, viewportWidth)) return "rotation";
  return "size";
}

export interface VectorGridSheetResult {
  tables: ScheduleTable[];
  /** Regions vectorgrid found that were not schedule shapes, and rasters. */
  skipped: number;
  rasters: number;
  cells: number;
  /** Why each declined region was declined — a region found and refused is a
   * different problem from a region never found. */
  rejects: string[];
  orphanWords: number;
  ms: number;
}

// ── SPLIT-FRAGMENT RECOVERY ─────────────────────────────────────────────────
//
// A single physical schedule is sometimes drawn as several separately-closed
// ruled boxes rather than one continuous rectangle — real, corpus-found:
// 028_TX page 1's "NOISE CONTROL DUCT SILENCER SCHEDULE" is a caption+header
// band, a "FIRST FLOOR" section, and a "SECOND FLOOR" section, each its own
// face in vectorgrid's planar line graph. `find_tables` correctly finds all
// three; each is refused ALONE for a good, narrow reason (a caption/header
// band with no data rows has "no keyed data rows"; a section body whose only
// own row is its divider label has "no header block above the data" — see
// that refusal's own comment in sheetgraph.ts for why it must not guess). The
// rescue is pure geometry, decided here, never inside those refusals: a
// fragment refused for exactly one of those two reasons, sitting directly
// above or below another fragment (built or not) with the same column count
// and outer x-extent, is stacked onto it and the UNCHANGED
// `vectorGridTableToScheduleTable` pipeline is re-run on the combined piece.
// Nothing here re-implements header or row detection.

/** Grid-clustering tolerance for fragment geometry, in raw vectorgrid pt —
 * the same TOL `vectorgrid_rpc.py`'s own docstring cites for column/row
 * clustering, so a real shared column grid always clears it. */
const FRAGMENT_X_TOL = 3;
/** How far a fragment's own edge may sit from its neighbour's, in EITHER
 * direction. Real, measured (028_TX page 1): adjacent faces there overlap by
 * up to ~20pt rather than touching cleanly, because a divider row straddling
 * the split lands partly in each piece's own measured bounds. The other way,
 * a section label printed between two ruled blocks of one list leaves a
 * line's gap: 34pt on 019_FL's M8.5, between its AHU-1 points and its
 * GLOBAL POINTS, and on 009_FL's page 22. Over every saved reply, the gaps
 * between a headerless block and a same-grid block above it run 31-39pt and
 * then 52pt and more. Generous enough for both; tight enough that a
 * genuinely separate table an inch or more down the page never qualifies. */
const FRAGMENT_GAP_TOL = 40;

function sameColumnGrid(a: VectorGridTable, b: VectorGridTable): boolean {
  return a.cols === b.cols
    && Math.abs(a.bbox[0] - b.bbox[0]) <= FRAGMENT_X_TOL
    && Math.abs(a.bbox[2] - b.bbox[2]) <= FRAGMENT_X_TOL;
}

function verticallyAdjacent(a: VectorGridTable, b: VectorGridTable): boolean {
  return Math.abs(b.bbox[1] - a.bbox[3]) <= FRAGMENT_GAP_TOL
    || Math.abs(a.bbox[1] - b.bbox[3]) <= FRAGMENT_GAP_TOL;
}

// exported for tests
function isFragmentAdjacent(a: VectorGridTable, b: VectorGridTable): boolean {
  return sameColumnGrid(a, b) && verticallyAdjacent(a, b);
}

/** Is this refusal reason a STRUCTURAL fragment shape (a caption/header band
 * with no data rows of its own, or a lone section-divider row with a little
 * data under it) rather than a genuinely separate table that simply failed
 * to key? Restricted narrowly — one exact refusal string, and the other
 * confined to a small piece — so an unrelated real table that legitimately
 * has no usable key column is never swept into a merge by accident. */
function isMergeEligibleFragment(t: VectorGridTable, why: string): boolean {
  if (why.startsWith("no header block above the data")) return true;
  if (why.startsWith("no keyed data rows") && t.rows <= 3) return true;
  return false;
}

/** Every cell of one row, as a position-and-text signature independent of
 * cell identity — used only to detect a row captured twice (see
 * `concatFragments`'s own comment). Empty string for a row with no cells at
 * all, which never counts as a match below. */
function rowSignature(t: VectorGridTable, row: number): string {
  const cells = t.cells.filter((c) => c.row === row);
  if (!cells.length) return "";
  return cells
    .slice()
    .sort((x, y) => x.col - y.col)
    .map((c) => `${c.col}:${(c.text || "").trim()}`)
    .join("|");
}

/** Concatenate two fragments' own raw cells top-to-bottom by each one's own
 * measured top edge (never call-site order), row numbers shifted so the
 * bottom fragment's rows continue past the top's.
 *
 * ONE ROW OF OVERLAP IS DROPPED HERE, NOT LATER. Real, measured (028_TX
 * page 1): vectorgrid's own adjacent faces for a split schedule overlap by
 * up to ~20pt at the seam (see FRAGMENT_GAP_TOL's own comment), and the row
 * straddling that overlap is captured WHOLE by both faces — the bottom
 * fragment's own row 0 is then not a new row at all, but the same text as
 * the top fragment's own last row, read twice. Concatenating both verbatim
 * would silently double that one row and, worse, break
 * findEvidencedKeyColumn's own uniqueness requirement on the combined table
 * (two rows with an identical key is exactly what it exists to refuse) —
 * measured live: this exact duplicate is what made a 028_TX FIRST-FLOOR +
 * SECOND-FLOOR merge attempt fail with "no keyed data rows" even after every
 * real divider row had already been stripped. The two rows are dropped to
 * one only on an EXACT text match (position and content, not "close"), so a
 * loose gap-tolerance false-positive on `isFragmentAdjacent` still cannot
 * silently eat a real row it shouldn't. */
function concatFragments(a: VectorGridTable, b: VectorGridTable): VectorGridTable {
  const [top, bottom] = a.bbox[1] <= b.bbox[1] ? [a, b] : [b, a];
  const topLast = rowSignature(top, top.rows - 1);
  const bottomFirst = rowSignature(bottom, 0);
  const duplicateSeamRow = topLast !== "" && topLast === bottomFirst;
  const bottomCells = duplicateSeamRow
    ? bottom.cells.filter((c) => c.row !== 0).map((c) => ({ ...c, row: c.row - 1 }))
    : bottom.cells;
  const bottomRows = bottom.rows - (duplicateSeamRow ? 1 : 0);
  const rowOffset = top.rows;
  return {
    bbox: [
      Math.min(top.bbox[0], bottom.bbox[0]),
      Math.min(top.bbox[1], bottom.bbox[1]),
      Math.max(top.bbox[2], bottom.bbox[2]),
      Math.max(top.bbox[3], bottom.bbox[3]),
    ],
    rows: top.rows + bottomRows,
    cols: top.cols,
    raster: false,
    // Either fragment read from a picture makes the table one (AS-153).
    ...(top.ocr || bottom.ocr ? { ocr: true } : {}),
    cells: [
      ...top.cells,
      ...bottomCells.map((c) => ({ ...c, row: c.row + rowOffset })),
    ],
    assigned: (top.assigned || 0) + (bottom.assigned || 0),
    orphan: (top.orphan || 0) + (bottom.orphan || 0),
    straddle: (top.straddle || 0) + (bottom.straddle || 0),
  };
}

/** Drop any row OTHER than row 0 that is a single cell spanning nearly the
 * whole table width — a mid-table section-divider/group-label row, not real
 * data (the same shape sheetgraph.ts's own row-builder already treats as a
 * section-header inside a table it accepted whole; here it must be stripped
 * BEFORE that point, because leaving its text in raw column-0 derails
 * findEvidencedKeyColumn, which runs earlier over every raw row — measured
 * live, 028_TX page 1: keyColIdx was never found with the divider row left
 * in). Row 0 is exempt: a genuine title band has the identical raw shape
 * (one cell spanning every column) and must survive — it is the table's own
 * real caption, and dropping it here would trade one real defect for
 * another. */
function stripInteriorDividerRows(t: VectorGridTable): VectorGridTable {
  const dividerRows = new Set<number>();
  for (const c of t.cells) {
    if (c.row > 0 && t.cols > 1 && (c.colSpan || 1) >= t.cols - 1) dividerRows.add(c.row);
  }
  if (!dividerRows.size) return t;
  const kept = t.cells.filter((c) => !dividerRows.has(c.row));
  const survivingRows = [...new Set(kept.map((c) => c.row))].sort((a, b) => a - b);
  const renumber = new Map<number, number>(survivingRows.map((r, i) => [r, i]));
  return {
    ...t,
    rows: survivingRows.length,
    cells: kept.map((c) => ({ ...c, row: renumber.get(c.row)! })),
  };
}

// exported for tests
function stackFragments(a: VectorGridTable, b: VectorGridTable): VectorGridTable {
  return stripInteriorDividerRows(concatFragments(a, b));
}

// A HEADER BAND RULED WITH ONE COLUMN FEWER THAN ITS DATA. 019_FL's AHU-1
// point list (M8.5) numbers its points in a narrow first column. The header
// band above draws that column's rule too, but vectorgrid returns the band
// with the number and name columns as one, 29 columns over the data's 30,
// and the rescue above stacks only fragments of one column grid: the band
// and the 62 points under it were each refused alone, and the list was never
// read (M8.3's and M8.4's lists, whose bands come back with 30 columns,
// are). A band of labels refused for having no data rows, directly above a
// headerless data fragment, whose every column edge is one of the data's, is
// put on the data's columns before it is stacked: a cell keeps the data
// columns between its edges, and a label alone in a band column that covers
// several data columns takes the one under its centre, as a column's label is
// printed over it (POINT NAME over the names, not the numbers).
/** A fragment's column edges left to right, read off its own cells; null
 * when a column has no cell to say where it starts or ends. */
function columnEdges(t: VectorGridTable): number[] | null {
  const edges: Array<number | undefined> = new Array(t.cols + 1).fill(undefined);
  for (const c of t.cells) {
    const end = c.col + (c.colSpan || 1);
    if (edges[c.col] === undefined) edges[c.col] = c.bbox[0];
    if (edges[end] === undefined) edges[end] = c.bbox[2];
  }
  return edges.every((e) => e !== undefined) ? (edges as number[]) : null;
}

// exported for tests
function regridHeaderBand(band: VectorGridTable, data: VectorGridTable): VectorGridTable | null {
  if (band.cols >= data.cols) return null;
  const bandEdges = columnEdges(band), dataEdges = columnEdges(data);
  if (!bandEdges || !dataEdges) return null;
  // Each band edge on a data edge, in order, the outer two on the data's own.
  const at = bandEdges.map((x) => dataEdges.findIndex((y) => Math.abs(x - y) <= FRAGMENT_X_TOL));
  if (at[0] !== 0 || at[at.length - 1] !== data.cols || at.some((k, i) => i > 0 && k <= at[i - 1])) return null;
  const cells = band.cells.map((c): VectorGridCell => {
    const span = c.colSpan || 1;
    const from = at[c.col], to = at[c.col + span];
    if (span > 1 || to - from === 1 || span >= band.cols) return { ...c, col: from, colSpan: to - from };
    const centre = (c.bbox[0] + c.bbox[2]) / 2;
    let col = from;
    while (col < to - 1 && dataEdges[col + 1] <= centre) col++;
    return { ...c, col, colSpan: 1, bbox: [dataEdges[col], c.bbox[1], dataEdges[col + 1], c.bbox[3]] };
  });
  return { ...band, cols: data.cols, cells };
}

// A POINT LIST'S LATER I/O SECTION DRAWN AS ITS OWN FACE. 015_VA's points
// lists (AM703-AM706) rule each section apart: vectorgrid returns the title
// band, the header with the ANALOG INPUT points, then "ANALOG OUTPUT" and its
// points, then "BINARY OUTPUT" and its points, each a face of its own, a
// face sometimes carrying the section above's last point again at the seam.
// Read alone, such a face is no refusal the rescue above takes: it takes its
// heading for a title and its first point for a header, so AO-1 and BO-1 were
// lost and the rest made tables titled ANALOG OUTPUT that no points list
// claimed (75 of 117 points read). A face whose lone I/O heading is followed
// by points is stacked onto the same-grid list directly above it, the seam's
// repeated row dropped and the heading stripped as a divider, as the rescue
// stacks a section of any schedule.
/** A point's mark: its type letters and number (AI-1, BO-17, AI1). */
const POINT_MARK_RE = /^(?:[ABDU][IO]|[AB]V)[\s\-]?\d{1,3}[A-Z]?$/;

function textedCells(t: VectorGridTable, row: number): VectorGridCell[] {
  return t.cells.filter((c) => c.row === row && (c.text || "").trim());
}

function isPointSectionHeadingRow(t: VectorGridTable, row: number): boolean {
  const cells = textedCells(t, row);
  return cells.length === 1 && (cells[0].colSpan || 1) >= t.cols - 1
    && BAS_POINT_SECTION_HEADING_RE.test(cells[0].text.replace(/\s+/g, " ").trim().toUpperCase());
}

function leadsWithPointMark(t: VectorGridTable, row: number): boolean {
  const lead = t.cells.find((c) => c.row === row && c.col === 0);
  return Boolean(lead) && POINT_MARK_RE.test((lead!.text || "").replace(/\s+/g, " ").trim().toUpperCase());
}

// exported for tests
function isPointSectionFragment(t: VectorGridTable): boolean {
  if (t.cols < 2) return false;
  const heading = isPointSectionHeadingRow(t, 0) ? 0
    : leadsWithPointMark(t, 0) && isPointSectionHeadingRow(t, 1) ? 1 : -1;
  return heading >= 0 && leadsWithPointMark(t, heading + 1);
}

// A POINTS MATRIX'S ALARM SECTION DRAWN AS ITS OWN FACE. 033_MN's PUMP
// CONTROL POINTS (M702) prints its alarms under an ALARM label ruled across
// the matrix, and vectorgrid returns the label and the six alarms as a face
// of their own. Read alone, it took the label for a title and the first alarm
// for a header: a table titled ALARM that no points list claimed (11 of 17
// points read). The label names no I/O type and the alarms print names, not
// marks, so the I/O section rule above does not take it. The list it
// continues is the same-grid points matrix directly above, whose label row
// prints its type columns (AI, AO, BI, BO); a face of names under an ALARM
// label beside anything else is not stacked.
const POINT_ALARM_SECTION_HEADING_RE = /^ALARMS?(?: POINTS?)?$/;
/** A points matrix's type column label (DI and DO for BI and BO; AV, BV). */
const POINT_TYPE_COLUMN_RE = /^(?:[ABD][IO]|[AB]V)$/;

// exported for tests
function isPointAlarmSectionFragment(t: VectorGridTable): boolean {
  if (t.cols < 2 || t.rows < 2) return false;
  const heading = textedCells(t, 0);
  if (heading.length !== 1 || (heading[0].colSpan || 1) < t.cols - 1) return false;
  if (!POINT_ALARM_SECTION_HEADING_RE.test(heading[0].text.replace(/\s+/g, " ").trim().toUpperCase())) return false;
  const lead = t.cells.find((c) => c.row === 1 && c.col === 0);
  return Boolean(lead && (lead.text || "").trim());
}

/** A row of the face prints three or more distinct point type columns. */
function printsPointTypeColumns(t: VectorGridTable): boolean {
  for (let row = 0; row < t.rows; row++) {
    const types = new Set(textedCells(t, row)
      .map((c) => c.text.replace(/\s+/g, " ").trim().toUpperCase())
      .filter((text) => POINT_TYPE_COLUMN_RE.test(text)));
    if (types.size >= 3) return true;
  }
  return false;
}

/** Run vectorgrid for one sheet. Throws on an engine failure or a coordinate
 * disagreement — never returns an empty list to mean "it did not run". */
export async function extractScheduleTablesFromVectorGrid(
  ctx: VectorGridContext,
): Promise<VectorGridSheetResult> {
  const started = Date.now();
  const scale = viewportScale(ctx.pageViewportTransform);
  const { page } = parseSheetKey(ctx.sheetKey);
  const reply = await extractGridViaSidecar(ctx.pdfPath, page);

  const verdict = pageBoxAgrees(reply, scale, ctx.width, ctx.height);
  if (verdict !== "ok") {
    throw new VectorGridSpaceError(
      `${ctx.sheetKey}: vectorgrid measured ${reply.pageWidth}x${reply.pageHeight}pt `
      + `(x${scale} = ${reply.pageWidth * scale}x${reply.pageHeight * scale}) but the `
      + `viewport is ${ctx.width}x${ctx.height}`
      + (verdict === "rotation" ? " — the two disagree about page rotation" : ""),
    );
  }

  return { ...scheduleTablesFromVectorGridReply(reply.tables, page, ctx, scale), ms: Date.now() - started };
}

/** One sheet's vectorgrid tables as schedule tables: each read alone, then
 * the split fragments of one schedule stacked and read again (the rescue
 * above). The sidecar's reply in, no process: the grid replay reads saved
 * replies through it as the pipeline does. */
export function scheduleTablesFromVectorGridReply(
  tables: VectorGridTable[],
  page: number,
  ctx: Parameters<typeof vectorGridTableToScheduleTable>[2],
  scale: number,
): Omit<VectorGridSheetResult, "ms"> {
  interface Attempt { raw: VectorGridTable; built: ScheduleTable | null; why: string }

  let rasters = 0;
  const attempts: Attempt[] = [];
  for (const t of tables) {
    if (t.raster) { rasters++; continue; }
    let why = "raster or empty";
    const built = vectorGridTableToScheduleTable(t, page, ctx, scale, (r) => { why = r; });
    attempts.push({ raw: t, built, why });
  }

  // Repeatedly stack one merge-eligible fragment onto a directly-adjacent
  // neighbour (built or not) until nothing more merges: a still-unbuilt
  // fragment the rescue takes, or a point list's I/O section (built alone or
  // not) onto the list above it. Each merge removes one attempt, so the
  // round count bounds the work; it guards against any unforeseen cycle.
  // A point-list page needs one merge per section (015_VA's AM704: ten).
  const rounds = attempts.length;
  for (let round = 0; round < rounds; round++) {
    let mergedThisRound = false;
    outer: for (let i = 0; i < attempts.length; i++) {
      const cand = attempts[i];
      const alarms = isPointAlarmSectionFragment(cand.raw);
      const section = alarms || isPointSectionFragment(cand.raw);
      if (!section && (cand.built || !isMergeEligibleFragment(cand.raw, cand.why))) continue;
      for (let j = 0; j < attempts.length; j++) {
        if (j === i) continue;
        const other = attempts[j];
        let candRaw = cand.raw, otherRaw = other.raw;
        if (!isFragmentAdjacent(cand.raw, other.raw)) {
          // A header band ruled with one column fewer than its data, put on
          // the data's columns (above).
          const [upper, lower] = cand.raw.bbox[1] <= other.raw.bbox[1] ? [cand, other] : [other, cand];
          const band = !section && !upper.built && upper.why.startsWith("no keyed data rows")
            && !lower.built && lower.why.startsWith("no header block above the data")
            && verticallyAdjacent(upper.raw, lower.raw) ? regridHeaderBand(upper.raw, lower.raw) : null;
          if (!band) continue;
          if (upper === other) otherRaw = band;
          else candRaw = band;
        }
        // A section continues the list above it, never one below, nor
        // another section that has not yet found its list. Alarms continue
        // only a matrix that prints its point types.
        if (section && (other.raw.bbox[1] >= cand.raw.bbox[1] || isPointSectionFragment(other.raw)
          || isPointAlarmSectionFragment(other.raw))) continue;
        if (alarms && !printsPointTypeColumns(other.raw)) continue;
        const mergedRaw = stackFragments(otherRaw, candRaw);
        const rebuilt = vectorGridTableToScheduleTable(mergedRaw, page, ctx, scale);
        if (rebuilt) {
          attempts[j] = { raw: mergedRaw, built: rebuilt, why: "" };
          attempts.splice(i, 1);
          mergedThisRound = true;
          break outer;
        }
      }
    }
    if (!mergedThisRound) break;
  }

  const out: ScheduleTable[] = [];
  let skipped = 0, cells = 0, orphanWords = 0;
  const rejects: string[] = [];
  for (const a of attempts) {
    cells += a.raw.cells.length;
    orphanWords += a.raw.orphan || 0;
    if (a.built) out.push(a.built);
    else { skipped++; rejects.push(`${a.raw.rows}x${a.raw.cols} at ${a.raw.bbox.map(Math.round).join(",")}: ${a.why}`); }
  }
  return { tables: out, skipped, rasters, cells, orphanWords, rejects };
}

export type { Bbox };
export { isFragmentAdjacent, isPointAlarmSectionFragment, isPointSectionFragment, regridHeaderBand, stackFragments };
