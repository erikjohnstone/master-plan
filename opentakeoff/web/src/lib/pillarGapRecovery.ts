/**
 * Pillar A–D gap recovery on the shared vector pipeline.
 * When PDF text carries valve/BAS schedule language but graph.tables lacks
 * matching grids, force title-anchored L2 stream + sidecar recovery.
 */
import { classifyGrid } from "./gridClassify.mjs";
import {
  filterSpansToRegion,
  scanPillarGapLanguage,
  sheetHasScheduleLanguage,
  titleAnchorRegion,
  type PillarGapKind,
} from "./scheduleLanguageScan.ts";
import { extractScheduleTablesFromStreamGrid } from "./scheduleStreamFallback.ts";
import { extractScheduleTablesFromSidecar } from "./scheduleTableSidecarAdapter.ts";
import type { GraphSpan, ScheduleTable, SheetGraph } from "./sheetgraph.ts";
import type { MergeExtractedStats } from "./tableExtractorReconcile.ts";

export interface GapRecoverySheetContext {
  key: string;
  role: string;
  spans: GraphSpan[];
  segs?: number[];
  width: number;
  height: number;
  pageViewportTransform: number[];
  pdfPath?: string;
}

const TARGET_TYPES = new Set(["VALVE_SCHEDULE", "DAMPER_SCHEDULE", "ACTUATOR_SCHEDULE", "POINTS_LIST"]);

function tablesOnSheet(g: SheetGraph, sheetKey: string): ScheduleTable[] {
  return (g.tables || []).filter((t) => t.sheet === sheetKey);
}

function sheetHasTargetTable(g: SheetGraph, sheetKey: string, kind: PillarGapKind): boolean {
  const tables = tablesOnSheet(g, sheetKey);
  if (!tables.length) return false;
  for (const table of tables) {
    const cls = classifyGrid(table);
    if (TARGET_TYPES.has(cls.type)) {
      if (kind === "valve" && (cls.type === "VALVE_SCHEDULE" || cls.type === "DAMPER_SCHEDULE" || cls.type === "ACTUATOR_SCHEDULE")) {
        return true;
      }
      if (kind === "bas" && cls.type === "POINTS_LIST") return true;
      if (kind === "both" || kind === "generic") return true;
    }
  }
  return false;
}

function dominantGapKind(hits: ReturnType<typeof scanPillarGapLanguage>): PillarGapKind {
  let valve = 0;
  let bas = 0;
  for (const h of hits) {
    if (h.kind === "valve" || h.kind === "both") valve += 1;
    if (h.kind === "bas" || h.kind === "both") bas += 1;
  }
  if (valve && bas) return "both";
  if (valve) return "valve";
  if (bas) return "bas";
  return "generic";
}

export interface PillarGapRecoveryReport {
  sheets_scanned: number;
  sheets_with_language: number;
  sheets_recovered: number;
  tables_added: number;
  notes: string[];
}

/** True when printed language exists but no valve/BAS-shaped table on this sheet. */
export function sheetNeedsPillarGapRecovery(
  g: SheetGraph,
  ctx: GapRecoverySheetContext,
): boolean {
  if (!sheetHasScheduleLanguage(ctx.spans)) return false;
  const hits = scanPillarGapLanguage(ctx.spans);
  const kind = hits.length ? dominantGapKind(hits) : "generic";
  if (sheetHasTargetTable(g, ctx.key, kind)) return false;
  // Schedule-role sheets with zero tables always qualify.
  if (ctx.role === "schedule" && tablesOnSheet(g, ctx.key).length === 0) return true;
  // Legend/unknown with POINTS LIST titles (Pillar C near-miss path).
  if ((ctx.role === "legend" || ctx.role === "unknown") && hits.some((h) => h.kind === "bas" || h.kind === "both")) {
    return true;
  }
  // Any sheet with valve language but no valve-shaped table.
  if (hits.some((h) => h.kind === "valve" || h.kind === "both") && !sheetHasTargetTable(g, ctx.key, "valve")) {
    return true;
  }
  // BAS language without points list table.
  if (hits.some((h) => h.kind === "bas" || h.kind === "both") && !sheetHasTargetTable(g, ctx.key, "bas")) {
    return true;
  }
  return false;
}

export async function runPillarGapRecoveryForSheet(
  g: SheetGraph,
  ctx: GapRecoverySheetContext,
  buildings: Set<string>,
  stats: MergeExtractedStats,
  touched: Set<string>,
  mergeFn: (candidates: ScheduleTable[]) => void,
): Promise<number> {
  const hits = scanPillarGapLanguage(ctx.spans);
  if (!hits.length && !sheetHasScheduleLanguage(ctx.spans)) return 0;

  const anchors = hits.length ? hits : [{
    kind: "generic" as const,
    text: "(schedule language)",
    x: 0,
    y: 0,
    w: ctx.width,
    h: 20,
  }];

  let added = 0;
  const baseOpts = {
    buildings,
    sourceSpans: ctx.spans,
    pageViewportTransform: ctx.pageViewportTransform,
    force: true,
  };

  for (const hit of anchors.slice(0, 3)) {
    const region = titleAnchorRegion(hit, ctx.width, ctx.height);
    const bandSpans = filterSpansToRegion(ctx.spans, region);
    if (bandSpans.length < 12) continue;
    const streamCandidates = extractScheduleTablesFromStreamGrid(bandSpans, ctx.key, baseOpts);
    if (streamCandidates.length) {
      mergeFn(streamCandidates);
      added += streamCandidates.length;
    }
  }

  if (added === 0 && ctx.pdfPath) {
    const sidecarCandidates = await extractScheduleTablesFromSidecar({
      pdfPath: ctx.pdfPath,
      sheetKey: ctx.key,
      spans: ctx.spans,
      segs: ctx.segs,
      pageViewportTransform: ctx.pageViewportTransform,
      buildings,
    });
    if (sidecarCandidates.length) {
      mergeFn(sidecarCandidates);
      added += sidecarCandidates.length;
    }
  }

  return added;
}

export function summarizePillarGapRecovery(
  g: SheetGraph,
  contexts: GapRecoverySheetContext[],
): { language_sheets: string[]; missing_target: string[] } {
  const language_sheets: string[] = [];
  const missing_target: string[] = [];
  for (const ctx of contexts) {
    if (!sheetHasScheduleLanguage(ctx.spans)) continue;
    language_sheets.push(ctx.key);
    if (sheetNeedsPillarGapRecovery(g, ctx)) missing_target.push(ctx.key);
  }
  return { language_sheets, missing_target };
}
