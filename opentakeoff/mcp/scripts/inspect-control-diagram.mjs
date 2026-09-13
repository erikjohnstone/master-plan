#!/usr/bin/env node
/** Inspect the shared control/riser extractor on selected real PDF pages. */
import { resolve } from "node:path";
import { openPdf, textSpans, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { extractControlSchematics } from "../../web/src/lib/controlSchematic.ts";

const args = process.argv.slice(2);
const summaryOnly = args.includes("--summary");
const [pdfArg, ...pageArgs] = args.filter((arg) => arg !== "--summary");
if (!pdfArg || !pageArgs.length) {
  throw new Error("usage: inspect-control-diagram.mjs PDF PAGE [PAGE ...]");
}
const pdfPath = resolve(pdfArg);
const pages = pageArgs.map(Number);
if (pages.some((page) => !Number.isInteger(page) || page < 1)) {
  throw new Error("pages must be positive integers");
}

const doc = await openPdf(pdfPath);
const contexts = [];
try {
  for (const pageNumber of pages) {
    const page = await doc.page(pageNumber);
    const spans = textSpans(page).map((span) => ({
      str: span.str,
      x: span.x0,
      y: span.y0,
      w: span.x1 - span.x0,
      h: span.y1 - span.y0,
      ...(span.rot ? { rot: span.rot } : {}),
    }));
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    contexts.push({
      key: `${pdfPath.split("/").at(-1)}#${pageNumber}`,
      spans,
      segs: geometry.segs,
      width: page.viewport.width,
      height: page.viewport.height,
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

const result = extractControlSchematics(contexts);
console.log(JSON.stringify({
  pdf: pdfPath,
  pages,
  totals: result.totals,
  engineering_readiness: result.engineering_readiness,
  diagram_conflicts: result.diagram_conflicts,
  continuation_links: result.continuation_links,
  candidate_text: summaryOnly ? undefined : contexts.map((context) => ({
    sheet: context.key,
    spans: context.spans
      .filter(({ str }) => /(?:LEVEL|ELEVATION|CONTINUATION|RISER\s+DIAGRAM|WATER\s+RISER|CHWSR|HWSR)/i.test(str))
      .map(({ str, x, y, w, h }) => ({ text: str.replace(/\s+/g, " ").trim(), bbox: [x, y, x + w, y + h] })),
  })),
  schematics: result.schematics.map((item) => ({
    sheet: item.sheet,
    title: item.title,
    equipment: item.equipment.map(({ tag }) => tag),
    points: item.point_totals,
    instruments: item.instruments.map(({ label }) => label),
    explicit_point_details: summaryOnly ? undefined : item.explicit_points,
    instrument_details: summaryOnly ? undefined : item.instruments,
    io_bindings: summaryOnly
      ? item.io_bindings.map(({ instrument_label, point_type }) => ({ instrument_label, point_type }))
      : item.io_bindings,
    sequence_binding_status: item.sequence_binding_status,
    media: item.media_labels.map(({ label }) => label),
    topology: {
      status: item.topology.status,
      nodes: item.topology.nodes.length,
      edges: item.topology.edges.length,
      arrows: item.topology.arrows.length,
      components: item.topology.connected_components,
      unresolved_crossings: item.review.unresolved_crossings,
    },
  })),
  risers: result.risers.map((item) => ({
    sheet: item.sheet,
    title: item.title,
    kind: item.diagram_kind,
    status: item.status,
    semantic_status: item.semantic_status,
    datums: item.datums.map(({ label, y }) => ({ label, y })),
    systems: item.systems,
    service_groups: item.service_groups,
    continuations: item.continuations,
    diagram_tags: item.diagram_tags.map(({ tag, evidence, schedule_refs }) => ({ tag, evidence_count: evidence.length, schedule_refs })),
    device_states: item.device_states,
    network_transports: item.network_transports,
    network_components: item.network_components,
    floor_placements: summaryOnly
      ? Object.entries(item.floor_placements.reduce((out, placement) => {
        const key = `${placement.floor_label}:${placement.subject_kind}`;
        out[key] = (out[key] || 0) + 1;
        return out;
      }, {}))
      : item.floor_placements,
    trace_candidates: summaryOnly ? item.trace_candidates.length : item.trace_candidates,
    topology: {
      status: item.topology.status,
      nodes: item.topology.nodes.length,
      edges: item.topology.edges.length,
      arrows: item.topology.arrows.length,
      components: item.topology.connected_components,
      unresolved_crossings: item.topology.crossings.filter(({ status }) => status === "unresolved_crossing").length,
    },
  })),
}, null, 2));
