#!/usr/bin/env node
// Phase 1 annotation aid (GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md) — render a
// real page or region to PNG so ground truth is authored from an actual
// rendered image, never inferred from engine output. Thin wrapper over the
// same Session.viewSheet the browser's view_sheet MCP tool calls — same
// renderer, same coordinate frame as everything else in this codebase.
//
// Usage:
//   node --import tsx scripts/render-region.mjs PDF PAGE OUT.png [X0 Y0 X1 Y1] [--ring X,Y ...]
//
// With no region, renders the whole page. --ring may repeat; each draws a
// violet double-ring reference-point marker (Session.viewSheet's own
// ViewMarks.ring) at that exact image-px point, so a candidate instance's
// claimed center is visible burned into the picture, not just asserted in
// text. Prints the exact meta (sheet px, region, image px, zoom) as JSON so
// coordinates used for annotation are always traceable back to a real render.
import path from "node:path";
import { writeFileSync } from "node:fs";

import { Session } from "../src/session.ts";

const args = process.argv.slice(2);
const rings = [];
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ring") { rings.push(args[++i].split(",").map(Number)); }
  else rest.push(args[i]);
}
const [pdfArg, pageArg, outArg, x0, y0, x1, y1] = rest;
if (!pdfArg || !pageArg || !outArg) {
  console.error("usage: render-region.mjs PDF PAGE OUT.png [X0 Y0 X1 Y1] [--ring X,Y ...]");
  process.exit(2);
}
const page = Number(pageArg);
const region = [x0, y0, x1, y1].every((v) => v !== undefined)
  ? { x0: Number(x0), y0: Number(y0), x1: Number(x1), y1: Number(y1) }
  : undefined;

const session = new Session();
const source = path.resolve(pdfArg);
const loaded = await session.loadPlan(source);
const sheet = loaded.sheets[page - 1];
if (!sheet) throw new Error(`page ${page} is absent (PDF has ${loaded.sheets.length})`);

const marks = rings.length ? { ring: rings } : undefined;
const { png, meta } = await session.viewSheet(sheet.sheet, {
  region,
  px: 1600,
  marks,
});
writeFileSync(path.resolve(outArg), png);
console.log(JSON.stringify({ source, page, sheet: sheet.sheet, out: path.resolve(outArg), ...meta }, null, 2));
