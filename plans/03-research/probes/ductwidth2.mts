import { openPdf, textSpans, OPS } from "../../../opentakeoff/mcp/src/pdf.ts";
import { extractVectorGeometry } from "../../../opentakeoff/web/src/lib/oneclick.ts";
const doc = await openPdf(process.argv[2]);
const ph = await doc.page(Number(process.argv[3]));
const geo = extractVectorGeometry(await ph.operatorList(), ph.viewport.transform, OPS);
const spans = textSpans(ph);
const PX_PER_FT = Number(process.argv[4]);
const n = geo.segs.length >> 2;
for (const lab of spans.filter(s => /^\d+"x\d+"$|^\d+"ø$/.test(s.str))) {
  const cx = (lab.x0 + lab.x1) / 2, cy = (lab.y0 + lab.y1) / 2;
  const horiz = !lab.rot;
  const hits: { off: number; len: number; pen: number; i: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x1 = geo.segs[i * 4], y1 = geo.segs[i * 4 + 1], x2 = geo.segs[i * 4 + 2], y2 = geo.segs[i * 4 + 3];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
    if (len < 120) continue;
    if (horiz) { if (Math.abs(dy) > 0.5) continue; if (Math.max(x1, x2) < cx - 40 || Math.min(x1, x2) > cx + 40) continue; if (Math.abs(y1 - cy) > 80) continue; hits.push({ off: +(y1 - cy).toFixed(1), len: +len.toFixed(0), pen: geo.meta[i] >> 4, i }); }
    else { if (Math.abs(dx) > 0.5) continue; if (Math.max(y1, y2) < cy - 40 || Math.min(y1, y2) > cy + 40) continue; if (Math.abs(x1 - cx) > 80) continue; hits.push({ off: +(x1 - cx).toFixed(1), len: +len.toFixed(0), pen: geo.meta[i] >> 4, i }); }
  }
  hits.sort((a, b) => a.off - b.off);
  const offs = [...new Set(hits.map(h => h.off))];
  const nominalIn = Number(lab.str.match(/^(\d+)/)![1]);
  console.log(`${lab.str}${lab.rot ? "@" + lab.rot : ""} at (${cx.toFixed(0)},${cy.toFixed(0)}): nominal ${nominalIn}" = ${(nominalIn / 12 * PX_PER_FT).toFixed(1)} px; parallel long segs at offsets ${offs.join(", ")} (px from label center); pens ${[...new Set(hits.map(h => h.pen))].join(",")}`);
}
