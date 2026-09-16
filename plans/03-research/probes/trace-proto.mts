// Throwaway feasibility probe: follow a double-line duct edge on filtered pen strokes
// with exact coordinates and tolerance-based endpoint joins (no global noding).
import { openPdf, textSpans, OPS } from "../../../opentakeoff/mcp/src/pdf.ts";
import { extractVectorGeometry, SEG_CURVE, SEG_CLIP } from "../../../opentakeoff/web/src/lib/oneclick.ts";
const [file, pageS, penS, pxPerFtS, labelRe, tolS] = process.argv.slice(2);
const doc = await openPdf(file);
const ph = await doc.page(Number(pageS));
const t0 = performance.now();
const geo = extractVectorGeometry(await ph.operatorList(), ph.viewport.transform, OPS);
const PEN = Number(penS), PX_PER_FT = Number(pxPerFtS), TOL = Number(tolS || 1.0);
const n = geo.segs.length >> 2;
type S = { i: number; x1: number; y1: number; x2: number; y2: number; len: number; curve: boolean };
const segs: S[] = [];
for (let i = 0; i < n; i++) {
  const m = geo.meta[i]; if (m & SEG_CLIP) continue; if ((m >> 4) !== PEN) continue;
  const x1 = geo.segs[i*4], y1 = geo.segs[i*4+1], x2 = geo.segs[i*4+2], y2 = geo.segs[i*4+3];
  const len = Math.hypot(x2-x1, y2-y1); if (len < 0.05) continue;
  segs.push({ i, x1, y1, x2, y2, len, curve: !!(m & SEG_CURVE) });
}
// endpoint bucket index
const cell = Math.max(TOL * 4, 2);
const buckets = new Map<string, number[]>();
const key = (x: number, y: number) => `${Math.floor(x/cell)},${Math.floor(y/cell)}`;
segs.forEach((s, k) => { for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) { const kk = key(x, y); let b = buckets.get(kk); if (!b) buckets.set(kk, b = []); b.push(k); } });
const near = (x: number, y: number): number[] => { const out: number[] = []; const cx = Math.floor(x/cell), cy = Math.floor(y/cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of buckets.get(`${cx+a},${cy+b}`) || []) { const s = segs[k]; if (Math.hypot(s.x1-x, s.y1-y) <= TOL || Math.hypot(s.x2-x, s.y2-y) <= TOL) out.push(k); } return [...new Set(out)]; };
const t1 = performance.now();
console.log(`pen ${PEN}: ${segs.length} of ${n} segs; index built in ${(t1 - t0).toFixed(0)}ms (extract incl.)`);
const spans = textSpans(ph);
const lab = spans.find(s => new RegExp(labelRe).test(s.str));
if (!lab) { console.log("label not found"); process.exit(0); }
const cx = (lab.x0 + lab.x1) / 2, cy = (lab.y0 + lab.y1) / 2;
// seed: nearest pen segment to the label center by perpendicular distance
let best = -1, bestD = Infinity;
segs.forEach((s, k) => { const dx = s.x2 - s.x1, dy = s.y2 - s.y1; const t = Math.max(0, Math.min(1, ((cx - s.x1) * dx + (cy - s.y1) * dy) / (s.len * s.len))); const d = Math.hypot(s.x1 + t*dx - cx, s.y1 + t*dy - cy); if (d < bestD && s.len > 20) { bestD = d; best = k; } });
console.log(`label ${JSON.stringify(lab.str)} at (${cx.toFixed(0)},${cy.toFixed(0)}); seed seg #${best} len=${segs[best].len.toFixed(1)} dist=${bestD.toFixed(1)}px`);
function follow(k0: number, fromEnd: 2 | 1) {
  // walk from segment k0 leaving via endpoint (x2,y2) if fromEnd===2 else (x1,y1)
  const used = new Set<number>([k0]);
  let k = k0; let end = fromEnd;
  const pts: [number, number][] = end === 2 ? [[segs[k].x1, segs[k].y1], [segs[k].x2, segs[k].y2]] : [[segs[k].x2, segs[k].y2], [segs[k].x1, segs[k].y1]];
  const events: string[] = [];
  let hops = 0, curveRun = 0;
  while (hops++ < 2000) {
    const s = segs[k]; const [ex, ey] = end === 2 ? [s.x2, s.y2] : [s.x1, s.y1];
    const [sx, sy] = end === 2 ? [s.x1, s.y1] : [s.x2, s.y2];
    const dirx = (ex - sx) / s.len, diry = (ey - sy) / s.len;
    const cands = near(ex, ey).filter(c => !used.has(c));
    if (!cands.length) { events.push(`dead_end at (${ex.toFixed(0)},${ey.toFixed(0)}) after ${hops} hops`); break; }
    // score by angle deviation; a candidate leaves the junction via whichever of its ends is NOT at (ex,ey)
    let pick = -1, pickDev = Infinity, pickEnd: 1 | 2 = 2;
    const devs: number[] = [];
    for (const c of cands) { const t = segs[c]; const atStart = Math.hypot(t.x1 - ex, t.y1 - ey) <= TOL; const [ox, oy] = atStart ? [t.x2, t.y2] : [t.x1, t.y1]; const dx = (ox - ex) / t.len, dy = (oy - ey) / t.len; const dev = Math.acos(Math.max(-1, Math.min(1, dirx*dx + diry*dy))) * 180 / Math.PI; devs.push(dev); if (dev < pickDev) { pickDev = dev; pick = c; pickEnd = atStart ? 2 : 1; } }
    if (cands.length >= 2) events.push(`junction deg=${cands.length + 1} at (${ex.toFixed(0)},${ey.toFixed(0)}) devs=${devs.map(d => d.toFixed(0)).join("/")}`);
    if (pickDev > 60 && !segs[pick].curve) { events.push(`stop: turn ${pickDev.toFixed(0)}° at (${ex.toFixed(0)},${ey.toFixed(0)}) (${cands.length} cands)`); break; }
    if (segs[pick].curve) curveRun++; else if (curveRun) { events.push(`elbow: ${curveRun} curve chords ending near (${ex.toFixed(0)},${ey.toFixed(0)})`); curveRun = 0; }
    used.add(pick); k = pick; end = pickEnd;
    pts.push(end === 2 ? [segs[k].x2, segs[k].y2] : [segs[k].x1, segs[k].y1]);
  }
  let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]);
  return { pts, L, events, hops };
}
const t2 = performance.now();
const fwd = follow(best, 2), back = follow(best, 1);
const t3 = performance.now();
const total = fwd.L + back.L - segs[best].len;
console.log(`walk: ${(t3 - t2).toFixed(1)}ms; fwd ${fwd.hops} hops ${(fwd.L/PX_PER_FT).toFixed(1)} ft; back ${back.hops} hops ${(back.L/PX_PER_FT).toFixed(1)} ft; TOTAL chain ${(total/PX_PER_FT).toFixed(1)} ft (${total.toFixed(0)} px)`);
console.log(`fwd events: ${fwd.events.join(" | ")}`);
console.log(`back events: ${back.events.join(" | ")}`);
const bb = [...fwd.pts, ...back.pts]; const xs = bb.map(p => p[0]), ys = bb.map(p => p[1]);
console.log(`chain bbox x ${Math.min(...xs).toFixed(0)}-${Math.max(...xs).toFixed(0)} y ${Math.min(...ys).toFixed(0)}-${Math.max(...ys).toFixed(0)}`);
