/**
 * render-page-hires.mjs — render one or more PDF pages to PNG at a given
 * scale, for the box-tier deterministic ruled-line detection method
 * described in opentakeoff-corpus/keys/DEMO_CORPUS_GRADING.md (2026-09-13
 * entries for 028_TX / 060_XX).
 *
 * Usage:
 *   node --import tsx scripts/render-page-hires.mjs \
 *     --pdf /abs/plan.pdf --page 9 --scale 8.0 --out /tmp/out.png
 *
 * --page may repeat; when it does, --out must be a directory and files are
 * named page<N>.png inside it.
 */
import { openPdf } from "../src/pdf.ts";
import { writeFile, mkdir } from "fs/promises";
import path from "node:path";

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
function args(name) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === name) out.push(process.argv[++i]);
  }
  return out;
}

const pdfPath = arg("--pdf");
const pages = args("--page").map(Number);
const scale = Number(arg("--scale", "8.0"));
const out = arg("--out");
if (!pdfPath || pages.length === 0 || !out) {
  console.error("usage: render-page-hires.mjs --pdf <path> --page <n> [--page <n> ...] --scale <s> --out <path-or-dir>");
  process.exit(2);
}

const doc = await openPdf(pdfPath);
if (pages.length === 1) {
  const ph = await doc.page(pages[0]);
  const png = await ph.renderPng(scale);
  await writeFile(out, png);
  console.log(JSON.stringify({ page: pages[0], scale, out }));
} else {
  await mkdir(out, { recursive: true });
  for (const p of pages) {
    const ph = await doc.page(p);
    const png = await ph.renderPng(scale);
    const fp = path.join(out, `page${p}.png`);
    await writeFile(fp, png);
    console.log(JSON.stringify({ page: p, scale, out: fp }));
    ph.cleanup();
  }
}
process.exit(0);
