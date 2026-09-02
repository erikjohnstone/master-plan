#!/usr/bin/env node
/**
 * Audit Pillar A–D extraction gaps vs vector-stack recovery on shared path.
 *
 *   node --import tsx scripts/pillarGapAudit.mjs [/path/to/opentakeoff-corpus] [setId ...]
 */
import { writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { loadCachedKeySession } from "../test/helpers/loadKeySession.mjs";
import { summarizePillarGapRecovery } from "../../web/src/lib/pillarGapRecovery.ts";
import { scanPillarGapLanguage } from "../../web/src/lib/scheduleLanguageScan.ts";
import { pipelineHarnessSnapshot } from "../../web/src/lib/pipelineHarness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const corpusRoot = resolve(process.argv[2] || "../../../opentakeoff-corpus");
const filterIds = new Set(process.argv.slice(3));
const crossDir = resolve(corpusRoot, "takeoffs/cross-set-compile");
const CACHE_ID = "pillar-gap-audit-v1";

const keys = readdirSync(crossDir)
  .filter((f) => f.endsWith(".compile.json"))
  .map((f) => JSON.parse(readFileSync(resolve(crossDir, f), "utf8")))
  .filter((k) => !filterIds.size || filterIds.has(k.set_id));

function buildContexts(session, graph) {
  return (graph.sheets || []).map((sh) => {
    const state = session.sheets.get(sh.key);
    const spans = (state?.spans ?? []).map((span) => ({
      str: span.str,
      x: span.x0,
      y: span.y0,
      w: span.x1 - span.x0,
      h: span.y1 - span.y0,
      ...(span.rot ? { rot: span.rot } : {}),
    }));
    return {
      key: sh.key,
      role: sh.role,
      spans,
      width: state?.widthPx ?? 1000,
      height: state?.heightPx ?? 1400,
      pageViewportTransform: [1, 0, 0, 1, 0, 0],
      pdfPath: session.pdfPathFor?.(sh.key) ?? undefined,
    };
  });
}

async function auditOne(key) {
  const started = performance.now();
  const loaded = await loadCachedKeySession(corpusRoot, key, CACHE_ID);
  if (!loaded) return { set_id: key.set_id, skip: "pdf_or_parts_missing" };
  const { session, graph } = loaded;
  const contexts = buildContexts(session, graph);
  const gap = summarizePillarGapRecovery(graph, contexts);
  const languageHits = contexts.reduce((n, ctx) => n + scanPillarGapLanguage(ctx.spans).length, 0);
  const valves = compileCorpusTakeoff(null, graph, "control_valves");
  const bas = compileCorpusTakeoff(null, graph, "bas_points");
  const harness = pipelineHarnessSnapshot(graph, valves, bas);
  const l25Notes = (graph.notes || []).filter((n) => /L2\.5 pillar-gap recovery/i.test(String(n))).length;

  return {
    set_id: key.set_id,
    ms: Math.round(performance.now() - started),
    compile_valve_items: key.control_valves?.items ?? 0,
    compile_bas_rows: key.bas_points?.rows ?? 0,
    actual_valve_items: valves.totals?.items ?? 0,
    actual_bas_rows: bas.totals?.rows ?? 0,
    graph_valve_rows: harness.graph_valve?.rows ?? 0,
    graph_bas_rows: harness.graph_bas?.rows ?? 0,
    valve_graph_without_compile: harness.valve_graph_without_compile,
    bas_graph_without_compile: harness.bas_graph_without_compile,
    language_hits: languageHits,
    missing_target_sheets: gap.missing_target.length,
    l25_recovery_notes: l25Notes,
    vector_pipeline: graph.vector_pipeline ?? null,
  };
}

const results = [];
const skipped = [];
for (const key of keys) {
  try {
    const row = await auditOne(key);
    if (row.skip) skipped.push(row);
    else results.push(row);
    if (results.length % 10 === 0 && results.length) {
      console.error(`audit progress ${results.length}/${keys.length} …`);
    }
  } catch (e) {
    skipped.push({ set_id: key.set_id, skip: "error", detail: String(e?.message || e).slice(0, 160) });
  }
}

const valveZero = results.filter((r) => r.compile_valve_items === 0);
const basZero = results.filter((r) => r.compile_bas_rows === 0);

const summary = {
  sets: results.length,
  skipped: skipped.length,
  valve_compile_zero: valveZero.length,
  valve_zero_with_graph_rows: valveZero.filter((r) => r.graph_valve_rows > 0).length,
  valve_zero_with_actual_compile: valveZero.filter((r) => r.actual_valve_items > 0).length,
  valve_graph_without_compile: results.filter((r) => r.valve_graph_without_compile).length,
  bas_compile_zero: basZero.length,
  bas_zero_with_graph_rows: basZero.filter((r) => r.graph_bas_rows > 0).length,
  bas_zero_with_actual_compile: basZero.filter((r) => r.actual_bas_rows > 0).length,
  bas_graph_without_compile: results.filter((r) => r.bas_graph_without_compile).length,
  sets_with_missing_target_sheets: results.filter((r) => r.missing_target_sheets > 0).length,
  sets_with_l25_recovery: results.filter((r) => r.l25_recovery_notes > 0).length,
};

const out = { as_of: new Date().toISOString(), cache_identity: CACHE_ID, summary, results, skipped };
const outPath = process.env.PILLAR_GAP_ARTIFACT || "/opt/cursor/artifacts/pillar-gap-audit.json";
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, artifact: outPath }, null, 2));
