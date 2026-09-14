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
  const odl = vectorGridTableToOdl(t, page);
  return scheduleTableFromODL(odl, ctx.sheetKey, [scale, 0, 0, scale, 0, 0], {
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
  });
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
 * the split lands partly in each piece's own measured bounds. Generous
 * enough for that; tight enough that a genuinely separate table an inch or
 * more down the page never qualifies. */
const FRAGMENT_GAP_TOL = 30;

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

  interface Attempt { raw: VectorGridTable; built: ScheduleTable | null; why: string }

  let rasters = 0;
  const attempts: Attempt[] = [];
  for (const t of reply.tables) {
    if (t.raster) { rasters++; continue; }
    let why = "raster or empty";
    const built = vectorGridTableToScheduleTable(t, page, ctx, scale, (r) => { why = r; });
    attempts.push({ raw: t, built, why });
  }

  // Repeatedly stack one merge-eligible, still-unbuilt fragment onto a
  // directly-adjacent neighbour (built or not) until nothing more merges.
  // Bounded round count guards against any unforeseen cycle; every real
  // fragment chain found in the corpus so far is 2-3 deep.
  for (let round = 0; round < 6; round++) {
    let mergedThisRound = false;
    outer: for (let i = 0; i < attempts.length; i++) {
      const cand = attempts[i];
      if (cand.built || !isMergeEligibleFragment(cand.raw, cand.why)) continue;
      for (let j = 0; j < attempts.length; j++) {
        if (j === i) continue;
        const other = attempts[j];
        if (!isFragmentAdjacent(cand.raw, other.raw)) continue;
        const mergedRaw = stackFragments(other.raw, cand.raw);
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
  return { tables: out, skipped, rasters, cells, orphanWords, rejects, ms: Date.now() - started };
}

export type { Bbox };
export { isFragmentAdjacent, stackFragments };
