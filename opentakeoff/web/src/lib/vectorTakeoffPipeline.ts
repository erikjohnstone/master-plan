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
import { extractScheduleTablesFromSidecar } from "./scheduleTableSidecarAdapter.ts";
import {
  VectorGridSpaceError,
  extractScheduleTablesFromVectorGrid,
} from "./vectorGridAdapter.ts";
import { vectorGridAvailable, vectorGridMode } from "./vectorGridClient.ts";
import {
  runPillarGapRecoveryForSheet,
  sheetNeedsPillarGapRecovery,
} from "./pillarGapRecovery.ts";
import { sheetHasPointsListTitleSpans, sheetHasScheduleLanguage } from "./scheduleLanguageScan.ts";
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
  /** Absolute PDF path for L2 Python sidecar. */
  pdfPath?: string;
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

const OCR_ENV = typeof process !== "undefined" && process.env?.OPENTAKEOFF_PIPELINE_OCR === "1";
const MAX_TILES_PER_SHEET = 4;

function scheduleKeywordRegion(
  spans: GraphSpan[],
  width: number,
  height: number,
): [number, number, number, number] | null {
  const hits = spans.filter((sp) => {
    const t = String(sp.str || "").replace(/\s+/g, " ").trim();
    return t.length >= 6 && t.length <= 120 && sheetHasScheduleKeywords([sp]);
  });
  if (!hits.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const h of hits) {
    x0 = Math.min(x0, h.x);
    y0 = Math.min(y0, h.y);
    x1 = Math.max(x1, h.x + h.w);
    y1 = Math.max(y1, h.y + h.h);
  }
  const padX = 48;
  const padY = 32;
  const bandH = Math.min(1200, height - y0);
  return [
    Math.max(0, x0 - padX),
    Math.max(0, y0 - padY),
    Math.min(width, x1 + padX),
    Math.min(height, y1 + bandH),
  ];
}

function sheetTableCount(g: SheetGraph, sheetKey: string): number {
  return g.tables.filter((t) => t.sheet === sheetKey).length;
}

function isScheduleTarget(ctx: VectorSheetContext, hooks: VectorPipelineHooks): boolean {
  if (ctx.role === "schedule") return true;
  // Plan/demolition sheets embed equipment terms everywhere — keyword scan is not schedule signal there.
  if (ctx.role !== "legend" && ctx.role !== "unknown") return false;
  if (hooks.sheetHasPointsListTitle(ctx.key)) return true;
  return sheetHasScheduleLanguage(ctx.spans);
}

/** Which stage a table came from, so retiring one is a measurement and not an
 * argument. Running vectorgrid first already SUPPRESSES the stages below on
 * every sheet it wins (each returns early once the sheet has tables), so what
 * they still contribute here IS their residual reach — the only number that
 * can justify keeping them. */
let mergeStage = "unattributed";

function withStage<T>(stage: string, fn: () => T): T {
  const prev = mergeStage;
  mergeStage = stage;
  try {
    return fn();
  } finally {
    mergeStage = prev;
  }
}

function mergeCandidates(
  g: SheetGraph,
  candidates: ScheduleTable[],
  sheetKey: string,
  stats: MergeExtractedStats,
  touched: Set<string>,
  report?: VectorPipelineReport,
): void {
  for (const built of candidates) {
    const before = stats.added + stats.recovered;
    mergeExtractedTable(g, built, sheetKey, stats, touched);
    if (report && stats.added + stats.recovered > before) {
      const ledger = report.stage_contributions ?? (report.stage_contributions = {});
      ledger[mergeStage] = (ledger[mergeStage] ?? 0) + 1;
    }
  }
}

function runL2FallbacksForSheet(
  g: SheetGraph,
  ctx: VectorSheetContext,
  buildings: Set<string>,
  stats: MergeExtractedStats,
  touched: Set<string>,
  report: VectorPipelineReport,
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
    withStage(tile ? "line-grid(tiled)" : "line-grid",
      () => mergeCandidates(g, [t], sheetKey, stats, touched, report));
  }

  if (sheetTableCount(g, sheetKey) === 0 || lineCandidates.length === 0) {
    const streamCandidates = extractScheduleTablesFromStreamGrid(spans, sheetKey, baseOpts);
    for (const t of streamCandidates) {
      if (tile) t.region = tileLocalToPage(t.region, tile);
    }
    withStage(tile ? "stream-grid(tiled)" : "stream-grid",
      () => mergeCandidates(g, streamCandidates, sheetKey, stats, touched, report));
  }
}

/**
 * L1.8 — the vectorgrid engine, ahead of every other table extractor.
 *
 * It runs FIRST because it is the best one measured: 137/137 hand-authored
 * boxes within 4pt, 917/917 hand-transcribed cells, and 16,067 cells confirmed
 * by an independent pixel-OCR pass against production's 7,077 on the same 33
 * sheets. Running first is also what retires the others without deleting
 * anything: every stage below already returns early when the sheet has tables
 * (`sheetTableCount(g, key) === 0`), so on a sheet vectorgrid wins they simply
 * do not run, and whatever they still reach is the measurable residual that
 * has to justify each one's existence.
 *
 * Nothing here decides what a table is. Candidates go through the same
 * `mergeCandidates` bar as every other engine, so `duplicateKeyCount` still
 * protects symbol sweep from a denser read that would introduce a duplicate
 * row key — which is a hard AMBIGUOUS refusal downstream, not a cosmetic
 * problem.
 *
 * In `shadow` the work is done and reported and NOT merged. That is what makes
 * an A/B honest: the same process, the same sheets, one run, and `g.tables`
 * provably identical to a run with the engine off.
 */
async function runL2VectorGridForSheet(
  g: SheetGraph,
  ctx: VectorSheetContext,
  buildings: Set<string>,
  stats: MergeExtractedStats,
  touched: Set<string>,
  report: VectorPipelineReport,
  mode: "shadow" | "on",
): Promise<void> {
  if (!ctx.pdfPath) return;
  const rec = report.vectorgrid ?? (report.vectorgrid = {
    mode, sheets: 0, tables: 0, cells: 0, declined: 0, rasters: 0, refused: 0, ms: 0,
  });
  let res;
  try {
    res = await extractScheduleTablesFromVectorGrid({
      sheetKey: ctx.key,
      pdfPath: ctx.pdfPath,
      spans: ctx.spans,
      pageViewportTransform: ctx.pageViewportTransform,
      width: ctx.width,
      height: ctx.height,
      buildings,
    });
  } catch (e) {
    // An engine that could not run is NOT a sheet with no schedules. Say so
    // and leave the sheet to the stages below rather than letting a Python
    // failure read as an empty drawing.
    rec.refused++;
    const why = e instanceof VectorGridSpaceError ? String(e.message) : `${(e as Error)?.message || e}`;
    report.notes.push(`${ctx.key}: L2 vectorgrid did not run — ${why}`);
    return;
  }
  rec.sheets++;
  rec.ms += res.ms;
  rec.tables += res.tables.length;
  rec.cells += res.cells;
  rec.declined += res.skipped;
  rec.rasters += res.rasters;
  if (mode === "shadow" || !res.tables.length) return;
  withStage("vectorgrid", () => mergeCandidates(g, res.tables, ctx.key, stats, touched, report));
}

async function runL2SidecarForSheet(
  g: SheetGraph,
  ctx: VectorSheetContext,
  buildings: Set<string>,
  stats: MergeExtractedStats,
  touched: Set<string>,
  report: VectorPipelineReport,
): Promise<void> {
  if (sheetTableCount(g, ctx.key) > 0) return;
  if (!ctx.pdfPath) return;
  const candidates = await extractScheduleTablesFromSidecar({
    pdfPath: ctx.pdfPath,
    sheetKey: ctx.key,
    spans: ctx.spans,
    segs: ctx.segs,
    pageViewportTransform: ctx.pageViewportTransform,
    buildings,
  });
  if (!candidates.length) return;
  withStage("python-sidecar", () => mergeCandidates(g, candidates, ctx.key, stats, touched, report));
  report.notes.push(`${ctx.key}: L2 sidecar recovered ${candidates.length} table(s) via Python backends.`);
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
  if (!OCR_ENV) return;
  if (sheetTableCount(g, ctx.key) > 0) return;
  if (!isScheduleTarget(ctx, hooks)) return;
  const rasterFrac = ctx.rasterFrac ?? 0;
  if (rasterFrac < 0.12) return;

  const region = scheduleKeywordRegion(ctx.spans, ctx.width, ctx.height)
    ?? [0, 0, ctx.width, Math.min(ctx.height, 1400)];
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
    l45_enabled: OCR_ENV,
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

  // L1.8 vectorgrid — after ODL, before every other fallback.
  //
  // AFTER ODL, deliberately: ODL is the only engine that reads a table with no
  // drawn ruling at all, and running vectorgrid second means its tables have to
  // WIN on the existing merge bar (more headers, then more cells, never more
  // duplicate keys) rather than simply pre-empting. A table ODL read better
  // keeps its place. Demoting ODL to a fallback is a retirement decision that
  // belongs after the A/B, not before it.
  //
  // BEFORE the rest, because every stage below returns early once a sheet has
  // tables — so on the sheets vectorgrid wins, tiling, the line grid, the
  // stream grid and the Python sidecar stop running on their own.
  const vgMode = vectorGridMode();
  if (vgMode !== "off" && vectorGridAvailable()) {
    report.layers_run.push(`L1.8:vectorgrid(${vgMode})`);
    for (const ctx of contexts) {
      if (!isScheduleTarget(ctx, hooks)) continue;
      await runL2VectorGridForSheet(g, ctx, buildings, stats, touched, report, vgMode);
    }
  }

  // L1.5 + L2 fallbacks
  report.layers_run.push("L1.5:tiling", "L2:line-grid", "L2:stream-grid", "L2:sidecar");
  for (const ctx of contexts) {
    if (!isScheduleTarget(ctx, hooks)) continue;
    sourceSpansBySheet.set(ctx.key, ctx.spans);

    const existing = sheetTableCount(g, ctx.key);
    const tiles = existing === 0 ? slicePageTiles(ctx.width, ctx.height) : [];
    report.tiles_sliced += tiles.length;

    if (tiles.length) {
      for (const tile of tiles.slice(0, MAX_TILES_PER_SHEET)) {
        runL2FallbacksForSheet(g, ctx, buildings, stats, touched, report, tile);
      }
    }
    if (existing === 0) {
      runL2FallbacksForSheet(g, ctx, buildings, stats, touched, report);
    }
    await runL2SidecarForSheet(g, ctx, buildings, stats, touched, report);
  }

  // L2.5 — recover tables Pillars A–D missed when schedule language exists in vector text.
  report.layers_run.push("L2.5:pillar-gap-recovery");
  let gapTables = 0;
  for (const ctx of contexts) {
    if (!sheetNeedsPillarGapRecovery(g, ctx)) continue;
    const mergeFn = (candidates: ScheduleTable[]) =>
      withStage("pillar-gap", () => mergeCandidates(g, candidates, ctx.key, stats, touched, report));
    const n = await runPillarGapRecoveryForSheet(g, ctx, buildings, stats, touched, mergeFn);
    if (n > 0) {
      gapTables += n;
      report.notes.push(`${ctx.key}: L2.5 pillar-gap recovery added ${n} table(s) from schedule/BAS/valve language.`);
    }
  }
  if (gapTables) {
    report.notes.push(`L2.5 pillar-gap recovery: ${gapTables} table(s) on shared vector path.`);
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
