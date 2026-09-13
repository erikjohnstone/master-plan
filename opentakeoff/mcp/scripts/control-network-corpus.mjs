#!/usr/bin/env node
/** Real-PDF positive + negative gate for BAS network/riser classification. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, textSpans, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { extractControlSchematics } from "../../web/src/lib/controlSchematic.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/control_schematics/navfac-cherry-point-ddc-network.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
const pdfPath = resolve(corpus, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);

const doc = await openPdf(pdfPath);
const loaded = new Map();
try {
  for (const pageNumber of [truth.positive.page, truth.negative.page]) {
    const page = await doc.page(pageNumber);
    const raw = textSpans(page);
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    const spans = raw.map((span) => ({
      str: span.str,
      x: span.x0,
      y: span.y0,
      w: span.x1 - span.x0,
      h: span.y1 - span.y0,
      ...(span.rot ? { rot: span.rot } : {}),
    }));
    loaded.set(pageNumber, {
      raw: raw.map((span) => String(span.str || "").replace(/\s+/g, " ").trim()),
      result: extractControlSchematics([{
        key: `${truth.source_pdf.split("/").at(-1)}#${pageNumber}`,
        sheet_number: pageNumber === truth.positive.page
          ? truth.positive.sheet_number
          : truth.negative.sheet_number || null,
        spans,
        segs: geometry.segs,
        width: page.viewport.width,
        height: page.viewport.height,
      }]),
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

const errors = [];
const positive = loaded.get(truth.positive.page);
const diagrams = positive?.result.risers || [];
const exact = diagrams.filter((item) => item.title === truth.positive.title);
if (exact.length !== 1) errors.push(`positive page: expected exactly one ${JSON.stringify(truth.positive.title)}, got ${exact.length}`);
if (diagrams.length !== 1) errors.push(`positive page: expected one extracted network/riser artifact, got ${diagrams.length}`);
const diagram = exact[0];
if (diagram) {
  if (diagram.diagram_kind !== truth.positive.diagram_kind) errors.push(`positive page: kind expected ${truth.positive.diagram_kind}, got ${diagram.diagram_kind}`);
  if (diagram.status !== truth.positive.semantic_status) errors.push(`positive page: status expected ${truth.positive.semantic_status}, got ${diagram.status}`);
  if (diagram.semantic_status !== truth.positive.semantic_status) errors.push(`positive page: semantic status expected ${truth.positive.semantic_status}, got ${diagram.semantic_status}`);
  if (diagram.topology.status !== "computed") errors.push(`positive page: raw topology expected computed, got ${diagram.topology.status}`);
  if (diagram.topology.nodes.length < truth.positive.minimum_topology_nodes) errors.push(`positive page: topology has only ${diagram.topology.nodes.length} nodes`);
  if (diagram.topology.edges.length < truth.positive.minimum_topology_edges) errors.push(`positive page: topology has only ${diagram.topology.edges.length} edges`);
  if (!Array.isArray(diagram.title_evidence?.bbox) || diagram.title_evidence.bbox.length !== 4) errors.push("positive page: title lacks exact bbox evidence");
}
for (const label of truth.positive.required_authored_labels || []) {
  if (!positive?.raw.includes(label)) errors.push(`positive page: authored label missing ${JSON.stringify(label)}`);
}

const negative = loaded.get(truth.negative.page);
if ((negative?.result.risers || []).length !== truth.negative.expected_diagrams) {
  errors.push(`negative page: expected ${truth.negative.expected_diagrams} diagrams, got ${(negative?.result.risers || []).length}`);
}
for (const phrase of truth.negative.excluded_phrases || []) {
  if (!negative?.raw.includes(phrase)) errors.push(`negative page: reviewed exclusion phrase absent ${JSON.stringify(phrase)}`);
}

const report = {
  schema: truth.schema,
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  positive: diagram ? {
    page: truth.positive.page,
    sheet_number: truth.positive.sheet_number,
    title: diagram.title,
    diagram_kind: diagram.diagram_kind,
    status: diagram.status,
    semantic_status: diagram.semantic_status,
    title_bbox: diagram.title_evidence.bbox,
    topology: {
      nodes: diagram.topology.nodes.length,
      edges: diagram.topology.edges.length,
      connected_components: diagram.topology.connected_components,
      unresolved_crossings: diagram.topology.crossings.filter((item) => item.status === "unresolved_crossing").length,
    },
  } : null,
  negative: {
    page: truth.negative.page,
    extracted_diagrams: negative?.result.risers.length || 0,
  },
  errors,
};
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exitCode = 1;
