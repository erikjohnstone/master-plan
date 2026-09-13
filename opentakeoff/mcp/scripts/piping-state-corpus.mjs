#!/usr/bin/env node
/** Exact real-PDF gate for text-backed diagram valve states and conflicts. */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { openPdf, textSpans, OPS } from "../src/pdf.ts";
import { extractVectorGeometry } from "../../web/src/lib/oneclick.ts";
import { extractControlSchematics } from "../../web/src/lib/controlSchematic.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const benchmark = process.env.OPENTAKEOFF_BENCHMARK;
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/control_schematics/norfolk-condenser-water-diagram-states.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
if (!benchmark) throw new Error("Set OPENTAKEOFF_BENCHMARK to the HVAC BAS Benchmark Collection directory.");
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
const pdfPath = resolve(benchmark, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);
const digest = await new Promise((resolveDigest, reject) => {
  const hash = createHash("sha256");
  const stream = createReadStream(pdfPath);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolveDigest(hash.digest("hex")));
});
if (digest !== truth.source_sha256) throw new Error(`Source PDF sha256 mismatch: expected ${truth.source_sha256}, got ${digest}`);

const doc = await openPdf(pdfPath);
const contexts = [];
try {
  for (const expected of truth.pages) {
    const page = await doc.page(expected.page);
    const spans = textSpans(page).map((span) => ({
      str: span.str, x: span.x0, y: span.y0, w: span.x1 - span.x0, h: span.y1 - span.y0,
      ...(span.rot ? { rot: span.rot } : {}),
    }));
    const geometry = extractVectorGeometry(await page.operatorList(), page.viewport.transform, OPS);
    contexts.push({
      key: `${truth.source_pdf.split("/").at(-1)}#${expected.page}`,
      sheet_number: expected.sheet_number || null,
      spans, segs: geometry.segs, width: page.viewport.width, height: page.viewport.height,
    });
    page.cleanup();
  }
} finally {
  await doc.destroy();
}

const extracted = extractControlSchematics(contexts);
const errors = [];
const pages = [];
const validBbox = (bbox) => Array.isArray(bbox) && bbox.length === 4
  && bbox.every(Number.isFinite) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];

for (const expected of truth.pages) {
  const key = `${truth.source_pdf.split("/").at(-1)}#${expected.page}`;
  const rows = extracted.risers.filter((item) => item.sheet === key);
  if (rows.length !== 1) {
    errors.push(`page ${expected.page}: expected 1 diagram, got ${rows.length}`);
    continue;
  }
  const actual = rows[0];
  if (actual.title !== expected.title) errors.push(`page ${expected.page}: title expected ${JSON.stringify(expected.title)}, got ${JSON.stringify(actual.title)}`);
  if (actual.diagram_kind !== expected.diagram_kind) errors.push(`page ${expected.page}: kind expected ${expected.diagram_kind}, got ${actual.diagram_kind}`);
  if (actual.systems.length !== 1 || actual.systems[0].normalized_system !== expected.normalized_system) {
    errors.push(`page ${expected.page}: expected system ${expected.normalized_system}, got ${actual.systems.map(({ normalized_system }) => normalized_system).join(",")}`);
  }
  if (actual.semantic_status !== "evidence_inventory") errors.push(`page ${expected.page}: unverified graph was promoted to ${actual.semantic_status}`);
  const valves = actual.diagram_tags.map(({ tag }) => tag).filter((tag) => /^V-\d+$/.test(tag)).sort();
  const wantedValves = [...expected.required_valve_tags].sort();
  if (JSON.stringify(valves) !== JSON.stringify(wantedValves)) {
    errors.push(`page ${expected.page}: valve tags expected ${JSON.stringify(wantedValves)}, got ${JSON.stringify(valves)}`);
  }
  const states = Object.fromEntries(actual.device_states.map(({ device_tag, state }) => [device_tag, state]));
  if (JSON.stringify(Object.keys(states).sort()) !== JSON.stringify(Object.keys(expected.explicit_text_states).sort())) {
    errors.push(`page ${expected.page}: state-bearing tags expected ${JSON.stringify(Object.keys(expected.explicit_text_states).sort())}, got ${JSON.stringify(Object.keys(states).sort())}`);
  }
  for (const [tag, state] of Object.entries(expected.explicit_text_states)) {
    if (states[tag] !== state) errors.push(`page ${expected.page}: ${tag} expected ${state}, got ${states[tag] || "missing"}`);
  }
  for (const state of actual.device_states) {
    if (!validBbox(state.tag_evidence?.bbox) || !validBbox(state.state_evidence?.bbox)) {
      errors.push(`page ${expected.page}: ${state.device_tag} state relation lacks both valid citations`);
    }
  }
  pages.push({
    page: expected.page,
    sheet_number: expected.sheet_number,
    title: actual.title,
    valve_tags: valves.length,
    explicit_text_states: states,
    semantic_status: actual.semantic_status,
  });
}

const conflictTags = extracted.diagram_conflicts.map(({ device_tag }) => device_tag).sort();
const expectedConflictTags = [...truth.expected_conflicts].sort();
if (JSON.stringify(conflictTags) !== JSON.stringify(expectedConflictTags)) {
  errors.push(`conflicts expected ${JSON.stringify(expectedConflictTags)}, got ${JSON.stringify(conflictTags)}`);
}
for (const conflict of extracted.diagram_conflicts) {
  if (conflict.status !== "design_clarification_required" || conflict.claims.length !== 2
    || conflict.claims.some((claim) => !validBbox(claim.tag_evidence?.bbox) || !validBbox(claim.state_evidence?.bbox))) {
    errors.push(`conflict ${conflict.device_tag}: invalid status, operand count, or citations`);
  }
}

console.log(JSON.stringify({
  schema: truth.schema,
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  pages,
  conflicts: extracted.diagram_conflicts.map(({ device_tag, status, claims }) => ({
    device_tag, status, claims: claims.map(({ sheet, diagram_title, state }) => ({ sheet, diagram_title, state })),
  })),
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
