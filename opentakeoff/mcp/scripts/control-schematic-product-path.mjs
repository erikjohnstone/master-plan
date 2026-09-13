#!/usr/bin/env node
/** Real Session-path regression for diagram geometry and schedule binding. */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = process.env.OPENTAKEOFF_CORPUS || resolve(here, "../../../opentakeoff-corpus");
const truthPath = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(corpus, "ground_truth/control_schematics/itd-d1-lab-mechanical.m6.json");
if (!existsSync(truthPath)) throw new Error(`Ground truth not found: ${truthPath}`);
const truth = JSON.parse(readFileSync(truthPath, "utf8"));
const pdfPath = resolve(corpus, truth.source_pdf);
if (!existsSync(pdfPath)) throw new Error(`Source PDF not found: ${pdfPath}`);

const expectedPage = truth.pages.find(({ sheet_number }) => sheet_number === "M6.3");
const expectedDiagram = expectedPage?.diagrams?.find(({ expected_schedule_bindings }) => expected_schedule_bindings?.length);
if (!expectedPage || !expectedDiagram) throw new Error("Ground truth lacks the reviewed M6.3 production-path expectations.");

const started = performance.now();
const session = new Session();
await session.loadPlan(pdfPath);
const graph = await session.graphForPipeline();
const elapsedMs = Math.round(performance.now() - started);
const controls = graph.control_schematics;
const errors = [];
const sheetKey = `${truth.source_pdf.split("/").at(-1)}#${expectedPage.page}`;
const diagrams = (controls?.schematics || []).filter((item) => item.sheet === sheetKey && item.title === expectedDiagram.title);
if (diagrams.length !== 1) errors.push(`expected exactly one ${JSON.stringify(expectedDiagram.title)} on ${sheetKey}, got ${diagrams.length}`);
const diagram = diagrams[0];
const validBbox = (bbox) => Array.isArray(bbox) && bbox.length === 4
  && bbox.every(Number.isFinite) && bbox[2] >= bbox[0] && bbox[3] >= bbox[1];

if (diagram) {
  const actualBindings = new Map();
  for (const binding of diagram.io_bindings || []) {
    const key = `${binding.instrument_label}:${binding.point_type}`;
    actualBindings.set(key, (actualBindings.get(key) || 0) + 1);
    if (!validBbox(binding.point_evidence?.bbox)
      || !validBbox(binding.instrument_evidence?.bbox)
      || !validBbox(binding.tether_evidence?.bbox)) {
      errors.push(`${key} lacks point, instrument, or tether evidence in the Session path`);
    }
  }
  for (const expected of expectedDiagram.expected_io_bindings || []) {
    const key = `${expected.instrument_label}:${expected.point_type}`;
    if ((actualBindings.get(key) || 0) !== expected.count) {
      errors.push(`${key}: expected ${expected.count}, got ${actualBindings.get(key) || 0}`);
    }
  }
  if ([...actualBindings.values()].reduce((sum, count) => sum + count, 0)
    !== (expectedDiagram.expected_io_bindings || []).reduce((sum, item) => sum + item.count, 0)) {
    errors.push("Session path returned additional unreviewed I/O bindings on M6.3");
  }

  for (const expected of expectedDiagram.expected_schedule_bindings || []) {
    const matches = diagram.equipment.filter(({ tag }) => tag === expected.tag);
    if (matches.length !== 1) {
      errors.push(`${expected.tag}: expected one diagram occurrence, got ${matches.length}`);
      continue;
    }
    const actual = matches[0];
    if (actual.schedule_binding_status !== expected.status) {
      errors.push(`${expected.tag}: expected status ${expected.status}, got ${actual.schedule_binding_status}`);
    }
    if (expected.schedule_title) {
      const refs = actual.schedule_refs.filter(({ title }) => title === expected.schedule_title);
      if (refs.length !== 1 || !validBbox(refs[0].bbox)) {
        errors.push(`${expected.tag}: expected one cited ${expected.schedule_title} row, got ${refs.length}`);
      }
    }
    if (expected.rejected_schedule_title) {
      const refs = actual.rejected_schedule_refs.filter(({ title }) => title === expected.rejected_schedule_title);
      if (refs.length !== 1 || !validBbox(refs[0].bbox)) {
        errors.push(`${expected.tag}: expected one cited rejected ${expected.rejected_schedule_title} row, got ${refs.length}`);
      }
    }
  }
}

console.log(JSON.stringify({
  schema: "opentakeoff.control_schematic_product_path.v1",
  ok: errors.length === 0,
  source_pdf: truth.source_pdf,
  elapsed_ms: elapsedMs,
  graph_sheets: graph.sheets?.length || 0,
  graph_tables: graph.tables?.length || 0,
  diagram: diagram ? {
    sheet: diagram.sheet,
    title: diagram.title,
    io_bindings: diagram.io_bindings.map(({ instrument_label, point_type }) => ({ instrument_label, point_type })),
    equipment_schedule_bindings: diagram.equipment.map((item) => ({
      tag: item.tag,
      status: item.schedule_binding_status,
      schedule_titles: item.schedule_refs.map(({ title }) => title),
      rejected_schedule_titles: item.rejected_schedule_refs.map(({ title }) => title),
    })),
  } : null,
  errors,
}, null, 2));
if (errors.length) process.exitCode = 1;
