/**
 * Vector takeoff engine — full L0–L5 stack orchestrator (shared Session+UI+MCP path).
 * Geometry-first; OCR/raster/VLM assist when vector paths alone cannot reach the answer.
 * L4.5 VLM slot is ON — returns null when no backend configured.
 */
import { buildMepGraph } from "./mepconnectivity.ts";
import {
  clipSegsToTile,
  clipSpansToTile,
  slicePageTiles,
  tileLocalToPage,
  type PageTile,
} from "./pageTileGrid.ts";
import { scheduleTableFromOcrRegion, type OcrRegionResult } from "./rasterTableAssist.ts";
import {
  extractScheduleTablesFromLineGrid,
  sheetHasScheduleKeywords,
} from "./scheduleGridFallback.ts";
import { extractScheduleTablesFromStreamGrid } from "./scheduleStreamFallback.ts";
import {
  collapseEquivalentPrimaryTables,
  dedupCrossSourceTables,
  mergeExtractedTable,
  snapAllTableCellBboxes,
  type MergeExtractedStats,
} from "./tableExtractorReconcile.ts";
import {
  syncSheetSchedules,
  type GraphSpan,
  type ScheduleTable,
  type SheetGraph,
  type VectorPipelineReport,
} from "./sheetgraph.ts";

export type { VectorPipelineReport };

export interface VectorSheetContext {
  key: string;
  role: string;
  spans: GraphSpan[];
  segs?: number[];
  width: number;
  height: number;
  pageViewportTransform: number[];
  /** 0..1 embedded raster fraction — triggers L4.5 when tables missing. */
  rasterFrac?: number;
}

export interface VectorPipelineHooks {
  /** L2 ODL pass (OpenDataLoader-PDF). */
  runODL: (g: SheetGraph) => Promise<void>;
  getSheetContexts: () => VectorSheetContext[];
  sheetHasPointsListTitle: (sheetKey: string) => boolean;
  /** L4.5 OCR: render region PNG and OCR words (optional — skip when absent). */
  ocrRegion?: (sheetKey: string, region: [number, number, number, number]) => Promise<OcrRegionResult | null>;
}

function sheetTableCount(g: SheetGraph, sheetKey: string): number {
  return g.tables.filter((t) => t.sheet === sheetKey).length;
}

function isScheduleTarget(ctx: VectorSheetContext, hooks: VectorPipelineHooks): boolean {
  return (
    ctx.role === "schedule"
    || ((ctx.role === "legend" || ctx.role === "unknown") && hooks.sheetHasPointsListTitle(ctx.key))
    || sheetHasScheduleKeywords(ctx.spans)
  );
}

function mergeCandidates(
  g: SheetGraph,
  candidates: ScheduleTable[],
  sheetKey: string,
  stats: MergeExtractedStats,
  touched: Set<string>,
): void {
  for (const built of candidates) mergeExtractedTable(g, built, sheetKey, stats, touched);
}

function runL2FallbacksForSheet(
  g: SheetGraph,
  ctx: VectorSheetContext,
  buildings: Set<string>,
  stats: MergeExtractedStats,
  touched: Set<string>,
  tile?: PageTile,
): void {
  const spans = tile ? clipSpansToTile(ctx.spans, tile) : ctx.spans;
  const segs = tile && ctx.segs ? clipSegsToTile(ctx.segs, tile) : ctx.segs;
  const sheetKey = ctx.key;
  const baseOpts = {
    buildings,
    sourceSpans: ctx.spans,
    pageViewportTransform: ctx.pageViewportTransform,
  };

  const lineCandidates = extractScheduleTablesFromLineGrid(spans, segs, sheetKey, baseOpts);
  for (const t of lineCandidates) {
    if (tile) t.region = tileLocalToPage(t.region, tile);
    mergeCandidates(g, [t], sheetKey, stats, touched);
  }

  if (sheetTableCount(g, sheetKey) === 0 || lineCandidates.length === 0) {
    const streamCandidates = extractScheduleTablesFromStreamGrid(spans, sheetKey, baseOpts);
    for (const t of streamCandidates) {
      if (tile) t.region = tileLocalToPage(t.region, tile);
    }
    mergeCandidates(g, streamCandidates, sheetKey, stats, touched);
  }
}

async function runL45OcrAssist(
  g: SheetGraph,
  ctx: VectorSheetContext,
  hooks: VectorPipelineHooks,
  buildings: Set<string>,
  stats: MergeExtractedStats,
  touched: Set<string>,
  report: VectorPipelineReport,
): Promise<void> {
  if (!hooks.ocrRegion) return;
  if (sheetTableCount(g, ctx.key) > 0) return;
  if (!isScheduleTarget(ctx, hooks)) return;
  const rasterFrac = ctx.rasterFrac ?? 0;
  if (rasterFrac < 0.08 && !sheetHasScheduleKeywords(ctx.spans)) return;

  const region: [number, number, number, number] = [0, 0, ctx.width, ctx.height];
  let ocr: OcrRegionResult | null = null;
  try {
    ocr = await hooks.ocrRegion(ctx.key, region);
  } catch {
    return;
  }
  if (!ocr?.words?.length) return;

  const built = scheduleTableFromOcrRegion(ctx.spans, ctx.key, {
    buildings,
    pageViewportTransform: ctx.pageViewportTransform,
    region,
    ocr,
    force: rasterFrac >= 0.2,
  });
  if (!built) return;
  built.title = built.title ?? { sheet: ctx.key, text: "(OCR-assist)", bbox: built.region };
  mergeExtractedTable(g, built, ctx.key, stats, touched);
  report.ocr_assists++;
  report.notes.push(`${ctx.key}: L4.5 OCR assist recovered a schedule table (${ocr.words.length} words).`);
}

function runL35Topology(
  g: SheetGraph,
  ctx: VectorSheetContext,
  report: VectorPipelineReport,
): void {
  if (!ctx.segs?.length) return;
  if (ctx.role !== "plan" && ctx.role !== "demolition" && ctx.role !== "unknown") return;
  try {
    const graph = buildMepGraph(ctx.segs, {});
    if (graph.edges.length >= 2) {
      report.topology_sheets++;
      if (!g.vector_topology) g.vector_topology = {};
      g.vector_topology[ctx.key] = {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        layer_signal: graph.layerSignal,
        quant_grid_px: graph.quantGridPx,
      };
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Run L1.5→L2→L3.5→L4→L4.5 enhancements after buildSheetGraph + ODL.
 * Mutates g.tables and g.notes in place; returns pipeline report for disclosure.
 */
export async function runVectorTakeoffPipeline(
  g: SheetGraph,
  hooks: VectorPipelineHooks,
): Promise<VectorPipelineReport> {
  const report: VectorPipelineReport = {
    layers_run: ["L0:ingest", "L1:spans+segments", "L2:geometric"],
    l45_enabled: true,
    tiles_sliced: 0,
    tables_added: 0,
    tables_replaced: 0,
    topology_sheets: 0,
    ocr_assists: 0,
    notes: [],
  };

  const stats: MergeExtractedStats = { recovered: 0, added: 0 };
  const touched = new Set<string>();
  const buildings = new Set(g.buildings);
  const sourceSpansBySheet = new Map<string, GraphSpan[]>();

  // L2 ODL
  await hooks.runODL(g);
  report.layers_run.push("L2:ODL");

  const contexts = hooks.getSheetContexts();

  // L1.5 + L2 fallbacks
  report.layers_run.push("L1.5:tiling", "L2:line-grid", "L2:stream-grid");
  for (const ctx of contexts) {
    if (!isScheduleTarget(ctx, hooks)) continue;
    sourceSpansBySheet.set(ctx.key, ctx.spans);

    const existing = sheetTableCount(g, ctx.key);
    const tiles = slicePageTiles(ctx.width, ctx.height);
    report.tiles_sliced += tiles.length;

    if (tiles.length && (existing === 0 || sheetHasScheduleKeywords(ctx.spans))) {
      for (const tile of tiles) runL2FallbacksForSheet(g, ctx, buildings, stats, touched, tile);
    }
    if (sheetTableCount(g, ctx.key) === 0) {
      runL2FallbacksForSheet(g, ctx, buildings, stats, touched);
    }
  }

  // L3 — plan symbol inventory runs at query time via sweep_schedule_row (shared path).
  report.layers_run.push("L3:sweep_schedule_row@query");

  // L3.5 topology
  report.layers_run.push("L3.5:topology");
  for (const ctx of contexts) runL35Topology(g, ctx, report);

  // L4 cross-source dedup + equivalent collapse
  report.layers_run.push("L4:reconcile-dedup");
  const collapsed = collapseEquivalentPrimaryTables(g.tables);
  const deduped = dedupCrossSourceTables(g);
  if (collapsed) report.notes.push(`L4: collapsed ${collapsed} equivalent primary table read(s).`);
  if (deduped) report.notes.push(`L4: deduped ${deduped} overlapping weaker table read(s).`);

  // L4.5 OCR / VLM assist
  report.layers_run.push("L4.5:ocr-vlm-assist");
  for (const ctx of contexts) {
    await runL45OcrAssist(g, ctx, hooks, buildings, stats, touched, report);
  }

  // L5 classification runs at compile_corpus_takeoff (header geometry + mark shape).
  report.layers_run.push("L5:classify@compile");

  // Final bbox snap
  for (const ctx of contexts) {
    if (!sourceSpansBySheet.has(ctx.key)) sourceSpansBySheet.set(ctx.key, ctx.spans);
  }
  const snapped = snapAllTableCellBboxes(g, sourceSpansBySheet, touched);
  if (snapped) report.notes.push(`Cell bbox snap: ${snapped} table(s) re-grounded onto source spans.`);

  if (touched.size) syncSheetSchedules(g, touched);

  report.tables_added = stats.added;
  report.tables_replaced = stats.recovered;

  if (stats.added || stats.recovered) {
    g.notes.push(
      `Vector pipeline L2 fallbacks: ${stats.recovered} table(s) replaced, ${stats.added} table(s) added (${touched.size} sheet(s)).`,
    );
  }
  if (report.ocr_assists) {
    g.notes.push(`Vector pipeline L4.5: ${report.ocr_assists} OCR-assist table(s) recovered on raster schedule sheet(s).`);
  }
  if (report.topology_sheets) {
    g.notes.push(`Vector pipeline L3.5: MEP topology graph built on ${report.topology_sheets} plan sheet(s).`);
  }

  g.vector_pipeline = report;
  return report;
}
