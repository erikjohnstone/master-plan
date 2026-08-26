// One-off corpus-prep tool (maturity plan Phase 1, step 2's raster/no-vector
// requirement) — NOT a test-fixture generator (its output is real 3rd-party
// content and stays OUTSIDE the repo, in the external corpus directory,
// never in test/fixtures). Mirrors make-scan-fixture.mjs's exact technique
// (rasterize a real page, re-wrap as an image-only PDF with the same
// MediaBox so image-px coordinates carry over 1:1) but applied to a REAL
// page from a REAL sourced MEP set instead of the generic demo plan — so the
// honest vector-linework-absent fallback path (sheet_info.has_vector_linework)
// gets exercised against genuine HVAC drafting density, not a simple floor
// plan.
//
//   node scripts/make-corpus-raster-variant.mjs <src.pdf> <pageNum> <out.pdf>
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as pdfjs from "pdfjs-dist";
import { createCanvas, Path2D, DOMMatrix, ImageData } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";

const [SRC, pageArg, OUT] = process.argv.slice(2);
const PAGE = Number(pageArg);
if (!SRC || !PAGE || !OUT) {
  console.error("usage: node scripts/make-corpus-raster-variant.mjs <src.pdf> <pageNum> <out.pdf>");
  process.exit(2);
}
const SCALE = 2;   // image-px resolution (pt × 2) — a ~144 DPI scan

globalThis.Path2D ??= Path2D;
globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;

const requireHere = createRequire(import.meta.url);
const PDFJS_ROOT = path.dirname(requireHere.resolve("pdfjs-dist/package.json"));

const bytes = await readFile(SRC);
const doc = await pdfjs.getDocument({
  data: new Uint8Array(bytes),
  verbosity: 0,
  standardFontDataUrl: path.join(PDFJS_ROOT, "standard_fonts") + path.sep,
  isEvalSupported: false,
}).promise;
const page = await doc.getPage(PAGE);
const vp1 = page.getViewport({ scale: 1 });
const vp = page.getViewport({ scale: SCALE });
const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, background: "#ffffff" }).promise;
const png = canvas.toBuffer("image/png");
await doc.destroy();

const out = await PDFDocument.create({ updateMetadata: false });
const img = await out.embedPng(png);
const sheet = out.addPage([vp1.width, vp1.height]);
sheet.drawImage(img, { x: 0, y: 0, width: vp1.width, height: vp1.height });
const saved = await out.save();

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, saved);
console.log(`wrote ${OUT} (${saved.length} bytes, image ${canvas.width}×${canvas.height})`);
