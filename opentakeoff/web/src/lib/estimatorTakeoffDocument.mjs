/**
 * P2 — out/<file>.takeoff.json builder on TOP of existing Pillar A/B/C stack.
 *
 * Does NOT reimplement extraction. Wraps:
 *   - compileCorpusTakeoff (Pillar A/C family specs + estimator_product/status)
 *   - classifyGrid (P2 grid typing, builds on L5 header-geometry)
 *   - pipelineHarnessSnapshot (graph vs compile corroboration)
 *   - takeoffEvidence (grounded EVIDENCE from compile row cells)
 *
 * Pillar B reconcile rows and Pillar D legend sweeps attach when callers pass them.
 */
import { basename } from "node:path";
import {
  compileBasTakeoff,
  compileControlValveTakeoff,
  compileCorpusTakeoff,
  CONTROL_VALVE_FAMILIES,
  normalizeControlValveCells,
} from "./corpusTakeoff.mjs";
import { compareSheetKeys } from "./sheetKey.ts";
import { classifyGrid, classifyAllGrids } from "./gridClassify.mjs";
import { pipelineHarnessSnapshot } from "./pipelineHarness.mjs";
import { cellEvidence, normalizeTakeoffTag } from "./takeoffEvidence.mjs";
import { extractSequencesFromGraph } from "./sequenceExtract.ts";
import { enrichSystemTags, summarizeVectorTopology } from "./topologyConsumer.ts";

export const PIPELINE_VERSION = "takeoff-estimator-v1";
const DAMPER_FAMILIES = new Set(["CONTROL_DAMPER", "FUME_HOOD_DAMPER"]);

/**
 * @param {import("./sheetgraph.ts").SheetGraph} graph
 * @param {object} [opts]
 * @param {string} [opts.file]
 * @param {string} [opts.sha256]
 * @param {object|null} [opts.reconcileSummary] Pillar B — optional reconcile rollup
 * @param {object|null} [opts.legendSummary] Pillar D — optional legend sweep rollup
 */
export function buildEstimatorTakeoffDocument(graph, opts = {}) {
  const file = opts.file || "plan.pdf";
  const valveCompile = compileControlValveTakeoff(null, graph);
  const basCompile = compileBasTakeoff(null, graph);
  const harness = pipelineHarnessSnapshot(graph, valveCompile, basCompile);
  const gridTypes = classifyAllGrids(graph);
  const tableIndex = indexTables(graph);

  const valves = [];
  const dampers = [];
  for (const [family, cat] of Object.entries(valveCompile.categories || {})) {
    if (!CONTROL_VALVE_FAMILIES.includes(family)) continue;
    const isDamper = DAMPER_FAMILIES.has(family);
    const service = family === "CHW_CONTROL_VALVE" ? "CHW"
      : family === "HHW_CONTROL_VALVE" ? "HHW"
      : null;
    for (const item of cat.items || []) {
      const cells = normalizeControlValveCells(item, service);
      const mapped = mapValveOrDamperItem(item, cells, tableIndex, isDamper, family);
      if (isDamper) dampers.push(mapped);
      else valves.push(mapped);
    }
  }

  const { controllers, points } = mapBasCompile(basCompile, tableIndex);
  const sequences = extractSequencesFromGraph(graph);
  const enrichedValves = enrichSystemTags(valves, graph);
  const enrichedDampers = enrichSystemTags(dampers, graph);
  const enrichedPoints = enrichSystemTags(points, graph);
  const systems = inferSystems(enrichedValves, enrichedDampers, enrichedPoints, basCompile);
  const discrepancies = buildDiscrepancies(harness, valveCompile, basCompile, opts.reconcileSummary);

  return {
    doc: {
      file: basename(file),
      sha256: opts.sha256 || null,
      pages: graph?.sheets?.length ?? 0,
      pipelineVersion: PIPELINE_VERSION,
    },
    systems: sortByTag(systems),
    valves: sortByTag(enrichedValves),
    dampers: sortByTag(enrichedDampers),
    controllers: sortByTag(controllers),
    points: sortByName(enrichedPoints),
    sequences,
    totals: buildTotals(valves, dampers, points, controllers),
    discrepancies,
    // Integrated pillar stack — not a fork; eval + GT harness consume these.
    pillars: {
      a_compile: {
        takeoff_ids: { valve: valveCompile.takeoff_id, bas: basCompile.takeoff_id },
        valve_families: Object.keys(valveCompile.categories || {}),
        bas_lists: (basCompile.lists || []).length,
        hvac_available: true,
      },
      b_reconcile: opts.reconcileSummary || null,
      c_estimator: {
        valve: valveCompile.estimator_status,
        valve_product: valveCompile.estimator_product,
        bas: basCompile.estimator_status,
        bas_product: basCompile.estimator_product,
      },
      d_legend: opts.legendSummary || null,
    },
    pipeline_harness: harness,
    pipeline_topology: summarizeVectorTopology(graph),
    grid_classifications: gridTypes,
  };
}

function indexTables(graph) {
  const tables = [...(graph?.tables || [])].sort((a, b) =>
    compareSheetKeys(a.sheet, b.sheet) || String(a.title?.text || "").localeCompare(String(b.title?.text || "")),
  );
  const bySheet = new Map();
  tables.forEach((table, id) => {
    if (!bySheet.has(table.sheet)) bySheet.set(table.sheet, []);
    bySheet.get(table.sheet).push({ table, id });
  });
  return { tables, bySheet };
}

function tableIdFor(tableIndex, sheetId, tableTitle) {
  const hits = tableIndex.bySheet.get(sheetId) || [];
  if (!hits.length) return 0;
  if (!tableTitle) return hits[0].id;
  const exact = hits.find((h) => String(h.table.title?.text || "").trim() === String(tableTitle).trim());
  return exact?.id ?? hits[0].id;
}

function mapValveOrDamperItem(item, cells, tableIndex, isDamper, family) {
  const tag = String(item.tag || item.mark || "").trim();
  const tableId = tableIdFor(tableIndex, item.sheet_id, item.table_title);
  const evidence = collectEvidence(item.sheet_id, tableId, tag, cells, item);
  const systemTag = cells["Unit Mark"]?.text || cells["Served equipment"]?.text || "UNKNOWN";
  const actuator = {
    power: /PNEUM/i.test(cells.Actuator?.text || "") ? "pneumatic" : "UNKNOWN",
    springReturn: /SPRING/i.test(cells.Actuator?.text || ""),
    control: /MODULAT/i.test(cells.Actuator?.text || "") ? "modulating" : "UNKNOWN",
    signal: cells["Control signal"]?.text || "",
    qty: 1,
    torqueInLb: null,
  };
  if (isDamper) {
    return {
      tag,
      systemTag,
      damperType: family === "FUME_HOOD_DAMPER" ? "control" : "control",
      bladeType: "UNKNOWN",
      sizeIn: parseSizePair(cells.Size?.text),
      failPosition: parseFail(cells["Fail position"]?.text) || "UNKNOWN",
      actuator,
      quantity: 1,
      confidence: evidence.length ? 0.86 : 0.55,
      evidence,
      sources: ["schedule"],
      _family: family,
    };
  }
  return {
    tag,
    systemTag,
    service: cells.Service?.text || "UNKNOWN",
    bodyType: "UNKNOWN",
    sizeIn: parseSizeIn(cells.Size?.text),
    cv: parseNumber(cells.Cv?.text),
    pressureClass: "",
    failPosition: parseFail(cells["Fail position"]?.text) || "UNKNOWN",
    actuator,
    quantity: 1,
    confidence: evidence.length ? 0.88 : 0.55,
    evidence,
    sources: ["schedule"],
    _family: family,
  };
}

function mapBasCompile(basCompile, tableIndex) {
  const controllers = [];
  const points = [];
  for (const list of basCompile.lists || []) {
    const tableId = tableIdFor(tableIndex, list.sheet_id, list.title);
    const ctrlTag = inferControllerTag(list.title);
    controllers.push({
      tag: ctrlTag,
      systemTag: inferSystemFromTitle(list.title),
      kind: "DDC",
      io: { AI: list.AI || 0, AO: list.AO || 0, DI: list.BI || 0, DO: list.BO || 0 },
      evidence: list.items?.[0]
        ? [cellEvidence({
          sheetKey: list.sheet_id,
          tableId,
          rowKey: list.items[0].tag,
          colKey: "TAG",
          cell: { text: list.items[0].tag, bbox: list.items[0].bbox_px },
        })]
        : [],
    });
    for (const item of list.items || []) {
      const name = String(item.tag || "").trim();
      if (!name) continue;
      const evidence = [];
      for (const [col, cell] of Object.entries(item.cells || {})) {
        if (!cell?.text && !cell?.bbox) continue;
        evidence.push(cellEvidence({
          sheetKey: item.sheet_id || list.sheet_id,
          tableId,
          rowKey: name,
          colKey: col,
          cell: { text: cell.text || cell, bbox: cell.bbox || item.bbox_px },
        }));
      }
      points.push({
        name,
        description: item.description || "",
        systemTag: item.served_equipment || inferSystemFromTitle(list.title),
        controllerTag: ctrlTag,
        type: inferPointType(name),
        hardware: item.wiring !== "soft",
        signal: "",
        device: "UNKNOWN",
        alarm: Boolean(item.alarm),
        trend: Boolean(item.trend),
        confidence: evidence.length ? 0.87 : 0.5,
        evidence,
        sources: ["points"],
      });
    }
  }
  return { controllers, points };
}

function collectEvidence(sheetKey, tableId, tag, cells, item) {
  const ev = [];
  for (const [label, cell] of Object.entries(cells)) {
    if (!cell?.text) continue;
    ev.push(cellEvidence({
      sheetKey,
      tableId,
      rowKey: tag,
      colKey: label,
      cell,
      layer: "L5",
    }));
  }
  if (!ev.length && item.bbox_px) {
    ev.push(cellEvidence({
      sheetKey,
      tableId,
      rowKey: tag,
      colKey: "TAG",
      cell: { text: tag, bbox: item.bbox_px },
      layer: "L5",
    }));
  }
  return ev;
}

function buildDiscrepancies(harness, valveCompile, basCompile, reconcileSummary) {
  const out = [];
  if (harness.valve_graph_without_compile) {
    out.push({
      kind: "valve-schedule-vs-plan",
      systemTag: "",
      itemRef: "",
      counts: { graph_valve_rows: harness.graph_valve?.rows ?? 0 },
      note: "Graph has valve-shaped rows but compile returned zero — L2/L5 gap",
      evidence: [],
    });
  }
  if (harness.bas_graph_without_compile) {
    out.push({
      kind: "point-in-sequence-not-listed",
      systemTag: "",
      itemRef: "",
      counts: { graph_bas_rows: harness.graph_bas?.rows ?? 0 },
      note: "Graph has BAS-shaped rows but compile returned zero",
      evidence: [],
    });
  }
  for (const gate of valveCompile.estimator_status?.gates || []) {
    if (gate.status === "refuse_not_done") {
      out.push({
        kind: "valve-schedule-vs-plan",
        systemTag: "",
        itemRef: gate.gate,
        counts: {},
        note: gate.note || "",
        evidence: [],
      });
    }
  }
  for (const gate of basCompile.estimator_status?.gates || []) {
    if (gate.status === "refuse_not_done") {
      out.push({
        kind: "point-listed-not-in-sequence",
        systemTag: "",
        itemRef: gate.gate,
        counts: {},
        note: gate.note || "",
        evidence: [],
      });
    }
  }
  if (reconcileSummary?.rows) {
    for (const row of reconcileSummary.rows) {
      if (row.status === "SCHEDULE_ONLY" || row.status === "PLAN_ONLY") {
        const scheduled = row.scheduledQty ?? row.scheduled_qty ?? 0;
        const installed = row.installedQty ?? row.installed_qty ?? 0;
        out.push({
          kind: row.status === "PLAN_ONLY" ? "valve-in-sequence-not-scheduled" : "valve-schedule-vs-plan",
          systemTag: row.systemTag || row.system_tag || "",
          itemRef: row.tag || "",
          counts: { scheduled, installed },
          note: `Pillar B reconcile: ${row.status}`,
          evidence: row.cites || row.plan_cites || [],
        });
      }
    }
  }
  return out;
}

function inferSystems(valves, dampers, points, basCompile) {
  const tags = new Map();
  const add = (raw, kind, evidence) => {
    const n = normalizeTakeoffTag(raw);
    if (!n || tags.has(n)) return;
    tags.set(n, { tag: String(raw).trim(), kind, evidence: evidence ? [evidence] : [] });
  };
  for (const v of valves) add(v.systemTag, inferSystemKind(v.systemTag), null);
  for (const d of dampers) add(d.systemTag, inferSystemKind(d.systemTag), null);
  for (const list of basCompile.lists || []) {
    for (const item of list.items || []) {
      if (item.served_equipment) add(item.served_equipment, inferSystemKind(item.served_equipment), null);
    }
  }
  return [...tags.values()];
}

function inferSystemKind(tag) {
  const u = String(tag).toUpperCase();
  if (/\bAHU\b/.test(u)) return "AHU";
  if (/\bRTU\b/.test(u)) return "RTU";
  if (/\bFCU\b/.test(u)) return "FCU";
  if (/\bVAV\b/.test(u)) return "VAV";
  if (/\bPUMP\b/.test(u)) return "PUMP";
  if (/\bBOILER\b/.test(u)) return "BOILER";
  if (/\bCHILLER\b/.test(u)) return "CHILLER";
  return "OTHER";
}

function inferControllerTag(title) {
  const m = String(title || "").match(/\b(DDC|VAV|FCU|AHU)[-\s]?[\w-]+/i);
  return m ? m[0].replace(/\s+/g, "-").toUpperCase() : "DDC-UNKNOWN";
}

function inferSystemFromTitle(title) {
  const m = String(title || "").match(/\b(AHU|RTU|FCU|VAV|PUMP|BOILER|CHILLER)[-\s]?[\w-]*/i);
  return m ? m[0].replace(/\s+/g, "-").toUpperCase() : "UNKNOWN";
}

function inferPointType(name) {
  const u = String(name).toUpperCase();
  if (/^AI[\s\-]?\d/.test(u)) return "AI";
  if (/^AO[\s\-]?\d/.test(u)) return "AO";
  if (/^BI[\s\-]?\d/.test(u)) return "DI";
  if (/^BO[\s\-]?\d/.test(u)) return "DO";
  return "DI";
}

function parseSizeIn(t) {
  const m = String(t || "").match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseSizePair(t) {
  const nums = String(t || "").match(/[\d.]+/g);
  if (!nums?.length) return null;
  if (nums.length >= 2) return [Number(nums[0]), Number(nums[1])];
  return [Number(nums[0]), Number(nums[0])];
}

function parseNumber(t) {
  const m = String(t || "").match(/[\d.]+/);
  return m ? Number(m[0]) : null;
}

function parseFail(t) {
  if (/N\.?\s*O\.?|NORMALLY\s+OPEN/i.test(t || "")) return "NO";
  if (/N\.?\s*C\.?|NORMALLY\s+CLOSE/i.test(t || "")) return "NC";
  if (/LAST/i.test(t || "")) return "LAST";
  return null;
}

function buildTotals(valves, dampers, points, controllers) {
  const byService = {};
  const bySize = {};
  const byBody = {};
  for (const v of valves) {
    byService[v.service] = (byService[v.service] || 0) + 1;
    if (v.sizeIn != null) bySize[String(v.sizeIn)] = (bySize[String(v.sizeIn)] || 0) + 1;
    byBody[v.bodyType] = (byBody[v.bodyType] || 0) + 1;
  }
  const byDamperType = {};
  for (const d of dampers) {
    byDamperType[d.damperType] = (byDamperType[d.damperType] || 0) + 1;
  }
  const pt = { AI: 0, AO: 0, DI: 0, DO: 0, software: 0 };
  for (const p of points) {
    if (p.type === "AI") pt.AI += 1;
    else if (p.type === "AO") pt.AO += 1;
    else if (p.type === "DI") pt.DI += 1;
    else if (p.type === "DO") pt.DO += 1;
    if (!p.hardware) pt.software += 1;
  }
  const byKind = {};
  for (const c of controllers) byKind[c.kind] = (byKind[c.kind] || 0) + 1;
  return {
    valves: { byService, bySize, byBodyType: byBody },
    valveActuators: { byPower: {}, byControl: {} },
    dampers: { byType: byDamperType },
    damperActuators: { byPower: {}, byControl: {} },
    points: pt,
    controllers: { byKind },
  };
}

function sortByTag(arr) {
  return [...arr].sort((a, b) => String(a.tag).localeCompare(String(b.tag)));
}

function sortByName(arr) {
  return [...arr].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/** Convenience: compile + document in one call (shared path entry). */
export function compileEstimatorDocument(session, graph, opts = {}) {
  return buildEstimatorTakeoffDocument(graph, opts);
}

export { compileCorpusTakeoff } from "./corpusTakeoff.mjs";
export { classifyAllGrids } from "./gridClassify.mjs";
