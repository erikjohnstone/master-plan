/**
 * P6 — L3.5 vector topology consumer on the shared Session path.
 * Reads graph.vector_topology summaries; enriches systemTag when still UNKNOWN.
 */
import type { SheetGraph } from "./sheetgraph.ts";

export interface TopologySummary {
  sheets_with_topology: number;
  total_nodes: number;
  total_edges: number;
  layer_signals: Record<string, number>;
  per_sheet: Record<string, {
    nodes: number;
    edges: number;
    layer_signal: string;
    quant_grid_px: number;
  }>;
}

export function summarizeVectorTopology(graph: SheetGraph | null | undefined): TopologySummary {
  const per_sheet: TopologySummary["per_sheet"] = {};
  const layer_signals: Record<string, number> = {};
  let total_nodes = 0;
  let total_edges = 0;
  for (const [sheet, topo] of Object.entries(graph?.vector_topology || {})) {
    const nodes = topo.nodes ?? 0;
    const edges = topo.edges ?? 0;
    total_nodes += nodes;
    total_edges += edges;
    const sig = String(topo.layer_signal || "none");
    layer_signals[sig] = (layer_signals[sig] || 0) + 1;
    per_sheet[sheet] = {
      nodes,
      edges,
      layer_signal: sig,
      quant_grid_px: topo.quant_grid_px ?? 0,
    };
  }
  return {
    sheets_with_topology: Object.keys(per_sheet).length,
    total_nodes,
    total_edges,
    layer_signals,
    per_sheet,
  };
}

const EQUIP_TAG_RE = /\b(AHU|RTU|FCU|VAV|DOAS|BOILER|CHILLER|PUMP|EF|SF|CU|OAU)[-\s]?[\w-]*/i;

/** Fill UNKNOWN systemTag from served-equipment / title hints — no invented topology walks. */
export function enrichSystemTags<T extends { systemTag?: string; tag?: string }>(
  items: T[],
  graph: SheetGraph | null | undefined,
): T[] {
  const hasTopology = Object.keys(graph?.vector_topology || {}).length > 0;
  return items.map((item) => {
    const cur = String(item.systemTag || "").trim();
    if (cur && cur !== "UNKNOWN") return item;
    const fromTag = String(item.tag || "").match(EQUIP_TAG_RE);
    if (fromTag) {
      return { ...item, systemTag: fromTag[0].replace(/\s+/g, "-").toUpperCase() };
    }
    if (hasTopology && cur === "UNKNOWN") {
      return { ...item, systemTag: "UNKNOWN" };
    }
    return item;
  });
}
