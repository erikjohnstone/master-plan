/**
 * Vector takeoff engine — full L0–L5 stack orchestrator (shared Session+UI+MCP path).
 * Geometry-first; OCR/raster/VLM assist when vector paths alone cannot reach the answer.
 * L4.5 VLM slot is ON — returns null when no backend configured.
 */
import { buildMepGraph } from "./mepconnectivity.ts";
import { scheduleTableFromOcrRegion, type OcrRegionResult } from "./rasterTableAssist.ts";
import { sheetHasScheduleKeywords } from "./scheduleGridFallback.ts";
import {
  VectorGridSpaceError,
  extractScheduleTablesFromVectorGrid,
} from "./vectorGridAdapter.ts";
import { vectorGridAvailable, vectorGridMode } from "./vectorGridClient.ts";
import { sheetHasPointsListTitleSpans, sheetHasScheduleCaption, sheetHasScheduleLanguage } from "./scheduleLanguageScan.ts";
import {
  adoptVectorGridTables,
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
  /** A cover/index sheet's own DRAWING LIST / SHEET INDEX table (optional —
   * absent hook means "no", same as every other optional hook here). */
  sheetHasDrawingIndexTitle?: (sheetKey: string) => boolean;
  /** L4.5 OCR: render region PNG and OCR words (optional — skip when absent). */
  ocrRegion?: (sheetKey: string, region: [number, number, number, number]) => Promise<OcrRegionResult | null>;
}

const OCR_ENV = typeof process !== "undefined" && process.env?.OPENTAKEOFF_PIPELINE_OCR === "1";

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
  // A SCHEDULE ON A DRAWING SHEET IS STILL A SCHEDULE, and this gate was
  // losing them all. A plan sheet that PRINTS a schedule caption carries one:
  // 13_MI#10 is "FIRST FLOOR PLAN - AREA A" with an EQUIPMENT SCHEDULE in the
  // corner, and because its role is `plan` vectorgrid was never offered the
  // sheet at all. What reached the estimator was the geometric extractor's
  // older read — 3 of the table's 7 columns, box truncated at MODEL — while
  // vectorgrid on that same page returns all 7 columns, 57 cells, 0 orphans.
  // Same story on 009_FL#30, where five real panel schedules sit on a `plan`
  // sheet and the app finds nothing at all.
  //
  // The keyword scan below genuinely is useless here — equipment words are
  // everywhere on a floor plan, which is why the role check existed — so the
  // test for a non-schedule sheet is a printed CAPTION, not vocabulary.
  if (sheetHasScheduleCaption(ctx.spans)) return true;
  if (ctx.role !== "legend" && ctx.role !== "unknown") return false;
  if (hooks.sheetHasPointsListTitle(ctx.key)) return true;
  if (hooks.sheetHasDrawingIndexTitle?.(ctx.key)) return true;
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
      // Name the table too, not just the count. "Six tables come from the old
      // extractors" is not a fact anyone can act on; "these six, on these
      // sheets, with these headers" is — and deciding whether they are real
      // tables the new engine missed or junk it correctly declined is the
      // whole of the retirement decision.
      (report.stage_tables ?? (report.stage_tables = [])).push({
        stage: mergeStage,
        sheet: sheetKey,
        title: built.title?.text ?? null,
        kind: built.kind,
        headers: built.headers.length,
        rows: built.rows.length,
        region: built.region,
      });
    }
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
    rec.first_error ??= why;
    report.notes.push(`${ctx.key}: L2 vectorgrid did not run — ${why}`);
    return;
  }
  rec.sheets++;
  rec.ms += res.ms;
  rec.tables += res.tables.length;
  rec.cells += res.cells;
  rec.declined += res.skipped;
  // WHY it declined, not just how many. A region the reader got right and the
  // classifier then refused is a different problem from a region never found,
  // and the reasons are what say which refusal is worth changing.
  for (const why of res.rejects) {
    // Keep the raw string too. The binned key below deliberately strips the
    // region's coordinates so the counts group, but that also makes it
    // impossible to say WHICH region was refused — and a scorer comparing the
    // pipeline against independent ground truth needs exactly that, to tell a
    // table the reader never found from one it found and the classifier then
    // declined. 64 is well past any real sheet's refusal count.
    if ((rec.declined_regions ?? (rec.declined_regions = [])).length < 64) {
      rec.declined_regions.push(`${ctx.key}: ${why}`);
    }
    const reasons = rec.declined_reasons ?? (rec.declined_reasons = {});
    const key = why.replace(/^\d+x\d+ at [-\d,]+: /, "")
      .replace(/\(kind [a-z-]+, key column [^)]*\)/, "(kind/key)")
      .replace(/: .*$/, "")
      .slice(0, 60);
    reasons[key] = (reasons[key] ?? 0) + 1;
  }
  rec.rasters += res.rasters;
  if (mode === "shadow" || !res.tables.length) return;
  // Not mergeCandidates: vectorgrid is not one candidate among peers on a
  // sheet it read, it is the reading. See adoptVectorGridTables.
  const { adopted, displaced } = adoptVectorGridTables(g, res.tables, ctx.key, touched);
  stats.added += adopted;
  if (report) {
    const ledger = report.stage_contributions ?? (report.stage_contributions = {});
    ledger.vectorgrid = (ledger.vectorgrid ?? 0) + adopted;
    if (displaced) {
      ledger["displaced-by-vectorgrid"] = (ledger["displaced-by-vectorgrid"] ?? 0) + displaced;
    }
    for (const t of res.tables) {
      (report.stage_tables ?? (report.stage_tables = [])).push({
        stage: "vectorgrid", sheet: ctx.key, title: t.title?.text ?? null,
        kind: t.kind, headers: t.headers.length, rows: t.rows.length, region: t.region,
      });
    }
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

/** True when this sheet is one L3.5 would look at at all. */
function topologyEligible(ctx: VectorSheetContext): boolean {
  if (!ctx.segs?.length) return false;
  return ctx.role === "plan" || ctx.role === "demolition" || ctx.role === "unknown";
}

/** Runs topology for one sheet and returns the milliseconds it cost. */
function runL35Topology(
  g: SheetGraph,
  ctx: VectorSheetContext,
  report: VectorPipelineReport,
): number {
  const segs = ctx.segs;
  if (!segs?.length || !topologyEligible(ctx)) return 0;
  const t0 = Date.now();
  try {
    const graph = buildMepGraph(segs, {});
    if (process.env.OPENTAKEOFF_GRAPH_TRACE) {
      process.stderr.write(
        `GRAPH_TRACE topology sheet=${ctx.key.split("#").pop()} role=${ctx.role}`
        + ` segs=${segs.length / 4} ms=${Date.now() - t0}\n`,
      );
    }
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
  return Date.now() - t0;
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

  // Time every stage. See VectorPipelineReport.stage_ms for why.
  const stageMs: Record<string, number> = (report.stage_ms = {});
  const timed = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
    const t0 = Date.now();
    try { return await fn(); }
    finally { stageMs[label] = (stageMs[label] ?? 0) + (Date.now() - t0); }
  };

  const stats: MergeExtractedStats = { recovered: 0, added: 0 };
  const touched = new Set<string>();
  const buildings = new Set(g.buildings);
  const sourceSpansBySheet = new Map<string, GraphSpan[]>();

  const contexts = hooks.getSheetContexts();

  // L1.8 VECTORGRID RUNS FIRST, AND ODL ONLY WHERE IT CAME BACK EMPTY.
  //
  // The order used to be the other way round, so that vectorgrid's tables had
  // to WIN on the merge bar rather than pre-empt. That was the cautious choice
  // while nothing had been measured. It has been measured now: against the 905
  // hand-transcribed cells, with vectorgrid on, ODL on and ODL off give
  // identical results to the cell — 537/905, 522/527 data cells, the same
  // tables. On a ruled schedule ODL is not adding anything; it is spawning a
  // JVM to arrive at an answer vectorgrid already has.
  //
  // What ODL can still do is read a table with NO DRAWN RULING, which
  // vectorgrid structurally cannot: no lines means no faces means no cells.
  // That is a real capability and it is why ODL is a fallback rather than
  // deleted. A fallback is what it should have been from the start — it now
  // runs only for the sheets vectorgrid left without tables, which is exactly
  // the set where an unruled table would be hiding.
  //
    const vgMode = vectorGridMode();
  const contexts0 = contexts.filter((ctx) => isScheduleTarget(ctx, hooks));
  if (vgMode !== "off" && vectorGridAvailable()) {
    report.layers_run.push(`L1.8:vectorgrid(${vgMode})`);
    await timed("L1.8:vectorgrid", async () => {
      for (const ctx of contexts0) {
        await runL2VectorGridForSheet(g, ctx, buildings, stats, touched, report, vgMode);
      }
    });
  }

  // L2 ODL — the fallback. Skipped entirely when every schedule-target sheet
  // already has tables, because then there is nothing for it to recover and a
  // JVM spawn buys nothing. `shadow` merges nothing, so it must not suppress
  // ODL either — a shadow run has to leave the graph exactly as `off` does.
  const odlOff = (process.env.OPENTAKEOFF_ODL || "").toLowerCase() === "off";
  const uncovered = vgMode === "on"
    ? contexts0.filter((ctx) => sheetTableCount(g, ctx.key) === 0)
    : contexts0;
  if (odlOff) {
    report.layers_run.push("L2:ODL(off)");
  } else if (!uncovered.length) {
    report.layers_run.push("L2:ODL(not needed)");
  } else {
    // ODL is the one stage that does NOT go through mergeCandidates — it pushes
    // straight into g.tables — so withStage cannot see it and every table it
    // recovered used to land in the ledger as nothing at all. A box scorer that
    // reports per-stage then has an unattributable column, which is the column
    // a regression hides in. Diff the table list around the call instead: the
    // identity is the object, so this cannot mistake a mutated incumbent for a
    // new table.
    // BY CONTENT, NOT BY OBJECT IDENTITY. runODL rebuilds g.tables rather than
    // appending to it, so an identity diff calls EVERY table new and attributes
    // the whole graph to ODL. Measured, and badly: on 001_NC that reported 90
    // vectorgrid tables and 90 ODL tables for a 90-table graph, and the scorer
    // reading it concluded ODL was doing the work vectorgrid was doing. A
    // reporting bug that inverts the conclusion is worse than no reporting.
    const keyOfTable = (t: ScheduleTable) =>
      `${t.sheet}|${t.title?.text ?? ""}|${(t.region || []).map((v) => Math.round(v)).join(",")}`;
    const beforeOdl = new Set(g.tables.map(keyOfTable));
    await timed("L2:ODL", () => hooks.runODL(g));
    if (report) {
      for (const t of g.tables) {
        if (beforeOdl.has(keyOfTable(t))) continue;
        (report.stage_tables ?? (report.stage_tables = [])).push({
          stage: "odl", sheet: t.sheet, title: t.title?.text ?? null,
          kind: t.kind, headers: t.headers.length, rows: t.rows.length, region: t.region,
        });
      }
    }
    report.layers_run.push(`L2:ODL(fallback on ${uncovered.length}/${contexts0.length} sheets)`);
  }

  // L1.5 TILING, L2 LINE-GRID, L2 STREAM-GRID, L2 SIDECAR AND L2.5 PILLAR-GAP
  // ARE RETIRED. See src/lib/attic/README.md — they are unwired, not deleted.
  //
  // They were kept until there was a measurement rather than a hunch. The
  // stage ledger over 30 keyed corpus sheets, engine on: vectorgrid 65 tables,
  // stream-grid(tiled) 2, pillar-gap 2, line-grid(tiled) 1, stream-grid 1,
  // python-sidecar 0. Then the six were READ, and not one was a real table
  // vectorgrid had missed:
  //
  //   014_MT#4   pillar-gap returns two tables that DUPLICATE vectorgrid's
  //              own, with fewer headers — same keys HWCH-A1..HWCH-B1, 6
  //              headers against 18. A row key in two tables is the hard
  //              AMBIGUOUS refusal at session.ts:3541. That is not clutter,
  //              it is a live hazard, and it was firing.
  //   072_CA#25  stream-grid, keys SYMBOL|FD|M — the header row read as data.
  //   074_CA#24  line-grid keyed SYMBOL; stream-grid keyed D|I|QJ|II, one
  //              region spanning nearly the whole sheet.
  //
  // Retiring them removes a bug rather than a capability. ODL still runs (the
  // only engine that reads an unruled table) and so does the L4.5 OCR assist
  // for genuinely rastered sheets, which vectorgrid reports and cannot read.
  for (const ctx of contexts) {
    if (!isScheduleTarget(ctx, hooks)) continue;
    sourceSpansBySheet.set(ctx.key, ctx.spans);
  }

  // L3.5 topology
  // L3.5 TOPOLOGY IS BOUNDED. It was not, and that was the whole of the wait.
  //
  // Measured on 05__vol2__009 (31 sheets) uploaded cold through the UI: 45+
  // minutes before a question could be asked, of which PDF parsing, vector
  // extraction and the sheet graph are 47 SECONDS, vectorgrid about 2 minutes,
  // and ODL near zero (OPENTAKEOFF_ODL=off took just as long). The rest is
  // here. Per-sheet, traced:
  //
  //     segs=  2,854  ms=   482
  //     segs= 42,311  ms=  2032
  //     segs= 49,017  ms= 22814     <- 11x sheet 8 for a similar segment count
  //     segs=?                ms= 17 MINUTES AND STILL RUNNING
  //
  // buildMepGraph's cost tracks JUNCTIONS, and junctions grow quadratically
  // with crossing linework — measured directly on synthetic grids, 360
  // segments 2.9s against 720 segments 18.0s. A dense mechanical or electrical
  // sheet (this set has two above 350,000 segments) is unbounded work.
  //
  // What that work BUYS is one summary: `pipeline_topology` in the estimator
  // document, a per-sheet node/edge count. Its only other reader,
  // enrichSystemTags, uses it in a single branch that returns
  // `{...item, systemTag: "UNKNOWN"}` when the tag is already "UNKNOWN" — a
  // no-op. So this is a reporting nicety, and it must never be the reason an
  // estimator waits 45 minutes to ask their first question.
  //
  // Bounded two ways, both deterministic and both recorded: a per-sheet
  // segment ceiling that skips the pathological sheets outright, and a
  // cumulative budget that stops the stage once it has spent its time. Sheets
  // that are skipped are NAMED in the report rather than silently dropped —
  // the same discipline the drawn-delta vector budget already uses.
  report.layers_run.push("L3.5:topology");
  await timed("L3.5:topology", () => {
    const maxSegs = Number(process.env.OPENTAKEOFF_TOPOLOGY_MAX_SEGMENTS || 150_000);
    const budgetMs = Number(process.env.OPENTAKEOFF_TOPOLOGY_BUDGET_MS || 30_000);
    let spent = 0;
    const skipped: string[] = [];
    for (const ctx of contexts) {
      if (!topologyEligible(ctx)) continue;
      const segCount = (ctx.segs?.length ?? 0) / 4;
      if (segCount > maxSegs) { skipped.push(`${ctx.key} (${Math.round(segCount)} segments)`); continue; }
      if (spent >= budgetMs) { skipped.push(`${ctx.key} (topology budget spent)`); continue; }
      spent += runL35Topology(g, ctx, report);
    }
    if (skipped.length) {
      report.notes.push(
        `L3.5: topology skipped on ${skipped.length} sheet(s) — linework too dense or the `
        + `stage's time budget was spent. Tables, rows and every takeoff number are `
        + `unaffected; only the pipeline_topology summary omits these sheets. `
        + skipped.slice(0, 6).join(", ") + (skipped.length > 6 ? ", …" : ""),
      );
    }
  });

  // L4 cross-source dedup + equivalent collapse
  report.layers_run.push("L4:reconcile-dedup");
  const collapsed = await timed("L4:reconcile-dedup", () => collapseEquivalentPrimaryTables(g.tables));
  const deduped = await timed("L4:reconcile-dedup", () => dedupCrossSourceTables(g));
  if (collapsed) report.notes.push(`L4: collapsed ${collapsed} equivalent primary table read(s).`);
  if (deduped) report.notes.push(`L4: deduped ${deduped} overlapping weaker table read(s).`);

  // L4.5 OCR / VLM assist
  report.layers_run.push("L4.5:ocr-vlm-assist");
  await timed("L4.5:ocr-vlm-assist", async () => {
    for (const ctx of contexts) {
      await runL45OcrAssist(g, ctx, hooks, buildings, stats, touched, report);
    }
  });

  // L5 classification runs at compile_corpus_takeoff (header geometry + mark shape).
  report.layers_run.push("L5:classify@compile");

  // Final bbox snap
  for (const ctx of contexts) {
    if (!sourceSpansBySheet.has(ctx.key)) sourceSpansBySheet.set(ctx.key, ctx.spans);
  }
  const snapped = snapAllTableCellBboxes(g, sourceSpansBySheet, touched);
  if (snapped) report.notes.push(`Cell bbox snap: ${snapped} table(s) re-grounded onto source spans.`);

  // A region with a negative coordinate, or one that runs past the sheet's
  // own known width/height, is never a real table position — every genuine
  // extraction anchors inside the sheet it was read from. Real, corpus-found
  // (25_WA_DouglasCounty_Courthouse#4): vectorgrid's read of a transposed
  // HEAT PUMP SCHEDULE (per-unit identifier columns printed as rotated text
  // atop horizontal spec rows) put a handful of cells thousands of px from
  // the rest of their own row, unioning into a region reaching y0=-1114.92 —
  // duplicating a second, geometrically sane sheetgraph reading of the SAME
  // table already in `g.tables`.
  //
  // The negative-coordinate half of this catches that case, but not its
  // sibling: 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.pdf#21's own
  // STEAM UNIT HEATER SCHEDULE (short, narrow-CELLED MARK values like "UH-3"
  // whose bbox is merely taller than wide from row height, not real rotated
  // text) tripped isVertical's own shape fallback, sent the table through
  // extractAllQuarterTurnedTables' pivot-and-restore, and came back with every
  // cell stacked along the WRONG axis — a region of y0=3134, y1=5701 on a
  // sheet only 4320px tall, all coordinates positive so the guard above never
  // fired. agentHighlightCitation refuses it at click time ("bbox_px is
  // degenerate or outside the cited sheet"), which is the right call for a
  // click but leaves a schedule the reader actually found sitting in the
  // graph as a table nothing can ever show — worse than an honest miss.
  // Bound-check against each sheet's own real width/height (from `contexts`,
  // the one place every sheet's dimensions are already known here) and drop
  // a table that cannot possibly fit, exactly as the negative-coordinate
  // case already does — a dropped table is a disclosed gap; a table sitting
  // off its own sheet is a citation nobody can ever paint.
  const sheetDims = new Map(contexts.map((ctx) => [ctx.key, { w: ctx.width, h: ctx.height }]));
  for (let i = g.tables.length - 1; i >= 0; i--) {
    const table = g.tables[i];
    const r = table.region;
    if (!Array.isArray(r)) continue;
    const dims = sheetDims.get(table.sheet);
    const outOfBounds = r[0] < 0 || r[1] < 0 || (dims != null && (r[2] > dims.w || r[3] > dims.h));
    if (outOfBounds) {
      touched.add(table.sheet);
      g.tables.splice(i, 1);
    }
  }

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
  // A REFUSED ENGINE MUST SAY SO WHERE SOMEONE WILL SEE IT, not just where a
  // developer holding the pipeline report might look. `runL2VectorGridForSheet`
  // already gets this right per-sheet — refusing is not "no schedules here",
  // and it records exactly why in `report.notes` — but that array only ever
  // reaches `g.vector_pipeline`, which nothing in the UI reads. Every OTHER
  // note pushed to `g.notes` above fires only on genuine WORK (tables added,
  // OCR recovered, topology built), so a document where vectorgrid failed on
  // every sheet — a missing Python dependency, most commonly — produces every
  // one of those as zero and stays completely silent while quietly reading
  // every schedule with the weaker geometric fallback instead. Real, found
  // live: `shapely` (a hard vectorgrid dependency, listed in no requirements
  // file at all) missing on a fresh `git pull && npm i` checkout production
  // the exact same wrong, narrower boxes this session spent hours chasing as
  // a caching bug, on a machine that never printed a single error anywhere a
  // person would look.
  const vg = report.vectorgrid;
  if (vg && vg.refused > 0) {
    const total = vg.sheets + vg.refused;
    g.notes.push(
      vg.sheets === 0
        ? `Vector pipeline L2: vectorgrid could not run on any sheet (${vg.refused}/${total}) — every schedule below came from the weaker fallback reader. ${vg.first_error || ""}`
        : `Vector pipeline L2: vectorgrid did not run on ${vg.refused} of ${total} sheet(s) — those sheets used the weaker fallback reader. ${vg.first_error || ""}`,
    );
  }

  g.vector_pipeline = report;
  return report;
}
