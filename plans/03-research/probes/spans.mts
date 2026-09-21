import { openPdf, textSpans } from "../../../opentakeoff/mcp/src/pdf.ts";
const doc = await openPdf(process.argv[2]);
const p = Number(process.argv[3]);
const ph = await doc.page(p);
const spans = textSpans(ph);
const filt = process.argv[4] ? new RegExp(process.argv[4], "i") : null;
for (const s of spans) if (!filt || filt.test(s.str)) console.log(`${s.x0},${s.y0}-${s.x1},${s.y1}${s.rot ? "@" + s.rot : ""}\t${JSON.stringify(s.str)}`);
console.log(`total=${spans.length}`);
