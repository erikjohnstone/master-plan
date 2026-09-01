/**
 * Shared pipeline GT harness metrics — graph extraction vs compile on Session path.
 */
import {
  isBasPointsListTable,
  isBasPointsListTitle,
  isControlValveHeaderShape,
} from "./corpusTakeoff.mjs";

const VALVE_MARK_RE = /^(CV|IV|MD|FD|VAV|DMP|BD)-[\dA-Z/]+$/i;

export function graphTableKindCounts(graph) {
  const counts = { equipment: 0, finish: 0, reference: 0, "room-finish": 0, unknown: 0 };
  for (const t of graph?.tables || []) {
    const k = t.kind || "unknown";
    counts[k] = (counts[k] || 0) + 1;
  }
  return counts;
}

export function graphValveTableStats(graph) {
  let tables = 0;
  let rows = 0;
  let valveMarks = 0;
  const tableTitles = [];
  for (const t of graph?.tables || []) {
    const title = t.title?.text || "";
    const headerValve = isControlValveHeaderShape(t);
    const titleValve = /\b(VALVE|DAMPER|ACTUATOR)\b/i.test(title);
    const rowMarks = (t.rows || []).filter((r) => VALVE_MARK_RE.test(String(r.key || "").trim()));
    if (!headerValve && !titleValve && !rowMarks.length) continue;
    tables += 1;
    rows += t.rows?.length || 0;
    valveMarks += rowMarks.length;
    tableTitles.push(title || "(untitled valve-shaped grid)");
  }
  return { tables, rows, valve_marks: valveMarks, table_titles: tableTitles.slice(0, 8) };
}

export function graphBasTableStats(graph) {
  let tables = 0;
  let rows = 0;
  const tableTitles = [];
  for (const t of graph?.tables || []) {
    const title = t.title?.text || "";
    if (!isBasPointsListTitle(title) && !isBasPointsListTable(t)) continue;
    tables += 1;
    rows += t.rows?.length || 0;
    tableTitles.push(title || inferBasTitle(t));
  }
  return { tables, rows, table_titles: tableTitles.slice(0, 8) };
}

function inferBasTitle(t) {
  const blob = (t.headers || []).join(" ");
  if (/AI|AO|BI|BO|POINTS/i.test(blob)) return "(header-inferred BAS grid)";
  return "(untitled)";
}

/** Compare compile output to graph extraction for GT harness corroboration. */
export function pipelineHarnessSnapshot(graph, compileValve, compileBas) {
  const valveGraph = graphValveTableStats(graph);
  const basGraph = graphBasTableStats(graph);
  const compileValveItems = compileValve?.totals?.items ?? 0;
  const compileBasRows = compileBas?.totals?.rows ?? 0;
  return {
    graph_tables_total: graph?.tables?.length ?? 0,
    graph_table_kinds: graphTableKindCounts(graph),
    graph_valve: valveGraph,
    graph_bas: basGraph,
    compile_valve_items: compileValveItems,
    compile_bas_rows: compileBasRows,
    compile_valve_families: Object.keys(compileValve?.categories || {}),
    valve_graph_without_compile: valveGraph.rows > 0 && compileValveItems === 0,
    bas_graph_without_compile: basGraph.rows > 0 && compileBasRows === 0,
    compile_without_graph_valve: compileValveItems > 0 && valveGraph.rows === 0,
    vector_pipeline: graph?.vector_pipeline ?? null,
    pipeline_notes: (graph?.notes || []).filter((n) =>
      /vector pipeline|OpenDataLoader|OCR assist|topology|fallback/i.test(String(n)),
    ).slice(0, 12),
  };
}
