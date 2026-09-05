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

  const out: ScheduleTable[] = [];
  let skipped = 0, rasters = 0, cells = 0, orphanWords = 0;
  const rejects: string[] = [];
  for (const t of reply.tables) {
    if (t.raster) { rasters++; continue; }
    cells += t.cells.length;
    orphanWords += t.orphan || 0;
    let why = "raster or empty";
    const built = vectorGridTableToScheduleTable(t, page, ctx, scale, (r) => { why = r; });
    if (built) out.push(built);
    else { skipped++; rejects.push(`${t.rows}x${t.cols} at ${t.bbox.map(Math.round).join(",")}: ${why}`); }
  }
  return { tables: out, skipped, rasters, cells, orphanWords, rejects, ms: Date.now() - started };
}

export type { Bbox };
