import { openPdf } from "../../../opentakeoff/mcp/src/pdf.ts";
import { writeFileSync } from "node:fs";
const [file, pageS, out, mode, ...rest] = process.argv.slice(2);
const doc = await openPdf(file);
const ph = await doc.page(Number(pageS));
if (mode === "full") {
  const png = await ph.renderPng(Number(rest[0] || 0.5));
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes) page=${ph.widthPt}x${ph.heightPt}pt viewport=${ph.viewport.width}x${ph.viewport.height}`);
} else {
  const [x0, y0, x1, y1, longEdge] = rest.map(Number);
  const r = await ph.renderRegionPng({ x0, y0, x1, y1 }, longEdge || 1600);
  writeFileSync(out, r.png);
  console.log(`wrote ${out} ${r.width}x${r.height} zoom=${r.zoom}`);
}
