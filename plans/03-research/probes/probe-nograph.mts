import { openPdf, textSpans, OPS } from "../../../opentakeoff/mcp/src/pdf.ts";
import { extractVectorGeometry } from "../../../opentakeoff/web/src/lib/oneclick.ts";
const buildMepGraph: any = null;
import { detectScale } from "../../../opentakeoff/web/src/lib/sheets.ts";
import { writeFileSync } from "node:fs";

const file = process.argv[2] || "../samples/bessemer-mechanical-bidset.pdf";
const pagesArg = process.argv[3];
const doc = await openPdf(file);
const n = doc.numPages;
const pages = pagesArg ? pagesArg.split(",").map(Number) : Array.from({ length: n }, (_, i) => i + 1);
const RECT = /^\s*\d{1,3}\s*(?:"|”)?\s*[xX×]\s*\d{1,3}\s*(?:"|”)?\s*$/;
const RECT_LOOSE = /\b\d{1,3}\s*(?:"|”)?\s*[xX×]\s*\d{1,3}\b/;
const ROUND = /(?:^|\s)\d{1,3}\s*(?:"|”)?\s*(?:ø|Ø|⌀|DIA\.?|ϕ)(?:\s|$)|(?:^|\s)(?:ø|Ø|⌀)\s*\d{1,3}\b/i;
const PIPE = /^\s*\d{1,2}(?:\s*[-–]?\s*\d\/\d)?\s*(?:"|”)\s*(?:[A-Z]{2,5})?\s*$/;
const SYS = /\b(SA|RA|EA|OA|MA|CHWS|CHWR|HWS|HWR|HHWS|HHWR|CWS|CWR|CW|HW|RL|RS|RD|CD|HPS|LPS|PC|GAS|G)\b/;
const UPDN = /\b(UP|DN|DOWN)\b/;
const FLEX = /\bFLEX\b/i;
console.log(`file=${file} pages=${n}`);
for (const p of pages) {
  const ph = await doc.page(p);
  const spans = textSpans(ph);
  const opList = await ph.operatorList();
  const t0 = performance.now();
  const geo = extractVectorGeometry(opList, ph.viewport.transform, OPS);
  const t1 = performance.now();
  const segN = geo.segs.length >> 2;
  const pen = new Map<number, number>();
  let curve = 0, clip = 0, fillonly = 0;
  for (let i = 0; i < segN; i++) {
    const m = geo.meta[i];
    if (m & 1) curve++; if (m & 2) clip++; if (m & 4) fillonly++;
    const nib = m >> 4; pen.set(nib, (pen.get(nib) || 0) + 1);
  }
  const rect = spans.filter(s => RECT.test(s.str));
  const rectLoose = spans.filter(s => !RECT.test(s.str) && RECT_LOOSE.test(s.str));
  const round = spans.filter(s => ROUND.test(s.str));
  const pipe = spans.filter(s => PIPE.test(s.str));
  const sys = spans.filter(s => SYS.test(s.str));
  const updn = spans.filter(s => UPDN.test(s.str));
  const flex = spans.filter(s => FLEX.test(s.str));
  const rotated = spans.filter(s => s.rot && s.rot !== 0).length;
  const scale = detectScale(ph.textContent as any, ph.viewport as any);
  const title = spans.filter(s => /^[MPE]-?\d{3}[A-Z]?$|^M\d{3}$/i.test(s.str.trim())).map(s => s.str.trim()).slice(0, 3);
  console.log(`\n=== page ${p} sheet≈${JSON.stringify(title)} ${ph.widthPt}x${ph.heightPt}pt spans=${spans.length} rotated=${rotated} segs=${segN} (extract ${(t1 - t0).toFixed(0)}ms) curve=${curve} clip=${clip} fillonly=${fillonly} layers=${(geo.layerIds || []).length} scale=${scale ? `${scale.label} conf=${(scale as any).confidence ?? ""}` : "none"}`);
  console.log(`  pen nibbles: ${[...pen.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ")}`);
  if (geo.layerIds?.length) console.log(`  layerIds: ${geo.layerIds.slice(0, 20).join(", ")}`);
  const show = (name: string, arr: typeof spans, k = 12) => console.log(`  ${name}=${arr.length} ${arr.slice(0, k).map(s => JSON.stringify(s.str.trim()) + (s.rot ? `@${s.rot}` : "")).join(" ")}`);
  show("rectSize", rect); show("rectLoose", rectLoose); show("round", round); show("pipeSize", pipe); show("system", sys, 16); show("updn", updn); show("flex", flex);
  if (buildMepGraph && segN > 200 && segN < 120000 && (rect.length + round.length + pipe.length) > 3) {
    const t2 = performance.now();
    try {
      const g = buildMepGraph(geo.segs, { meta: geo.meta, mppf: scale && (scale as any).upp ? 1 / (scale as any).upp : undefined });
      const t3 = performance.now();
      const deg = new Map<number, number>();
      for (const nd of g.nodes) { const d = nd.edges.length; deg.set(d, (deg.get(d) || 0) + 1); }
      console.log(`  mepGraph: nodes=${g.nodes.length} edges=${g.edges.length} quantGridPx=${g.quantGridPx.toFixed(2)} layerSignal=${g.layerSignal} build=${(t3 - t2).toFixed(0)}ms degrees=${[...deg.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(" ")}`);
    } catch (e) { console.log(`  mepGraph: FAILED ${(e as Error).message.slice(0, 200)}`); }
  }
  ph.cleanup?.();
}
