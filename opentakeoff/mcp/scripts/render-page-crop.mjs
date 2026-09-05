/**
 * RENDER-PAGE-CROP — look at one page (or one region of one page) of any PDF
 * on disk, with no Session and no set registration.
 *
 * `graph-render.mjs` is the right tool when you want the pipeline's own view
 * of a set (it crops to the tables the graph found). This is the opposite
 * tool, and the recall tier needs it: to author `keys/<id>.tables.csv` you
 * must read the sheet INDEPENDENTLY of what the pipeline found, so cropping
 * to the pipeline's own regions would defeat the measurement. It also runs a
 * single page at a time, which matters in this container — a whole-document
 * Session next to another running job OOMs.
 *
 *   node --import tsx scripts/render-page-crop.mjs <pdf> <page> <out.png> [--scale S]
 *        [--crop x,y,w,h]   region in PDF-POINT space (same space as textSpans)
 */
import { openPdf } from "../src/pdf.ts";
import { writeFileSync } from "node:fs";

const [pdf, pageArg, out] = process.argv.slice(2);
if (!pdf || !pageArg || !out) {
  console.error("usage: render-page-crop.mjs <pdf> <page> <out.png> [--scale S] [--crop x,y,w,h]");
  process.exit(2);
}
const sIdx = process.argv.indexOf("--scale");
const SCALE = sIdx >= 0 ? Number(process.argv[sIdx + 1]) : 2;
const cIdx = process.argv.indexOf("--crop");
const CROP = cIdx >= 0 ? process.argv[cIdx + 1].split(",").map(Number) : null;

const doc = await openPdf(pdf);
const ph = await doc.page(Number(pageArg));
console.error(`page ${pageArg}: ${Math.round(ph.widthPt)}x${Math.round(ph.heightPt)}pt rotate=${ph.rotate}`);

if (!CROP) {
  writeFileSync(out, await ph.renderPng(SCALE));
} else {
  // Crop in point space: render the whole page at SCALE, then copy the pixel
  // rectangle out. Rendering only the sub-rect would need a viewport offset
  // that rotation makes easy to get subtly wrong — and wrong crops are how a
  // recall key ends up recording a table that is not there.
  const napi = await import("@napi-rs/canvas");
  const png = await ph.renderPng(SCALE);
  const img = await napi.loadImage(Buffer.from(png));
  const [x, y, w, h] = CROP;
  const cw = Math.max(1, Math.round(w * SCALE));
  const chh = Math.max(1, Math.round(h * SCALE));
  const c = napi.createCanvas(cw, chh);
  c.getContext("2d").drawImage(img, Math.round(x * SCALE), Math.round(y * SCALE), cw, chh, 0, 0, cw, chh);
  writeFileSync(out, c.toBuffer("image/png"));
}
ph.cleanup?.();
console.error(`wrote ${out}`);
process.exit(0);
