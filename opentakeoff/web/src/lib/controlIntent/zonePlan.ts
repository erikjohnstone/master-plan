// CONTROL INTENT: the HVAC zone plan — the zone each scheduled unit's tag
// labels, and the device symbols drawn inside it.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. What a zone plan says about a unit
// (a CO2 sensor in its zone) is a reading the takeoff applies; the UI, MCP
// and the evals read it with this one module. Only fetching a page's
// operator list is the surface's (pdf.js in the browser, pdf.ts in MCP);
// pageRegions() turns it into regions the same way on both.
//
// A zone plan ("HVAC ZONE LEGEND", "HVAC ZONING PLAN") draws each zone as a
// closed region (a hatched fill, or the clipping path its hatch is drawn
// through) and labels it with the tag of the unit that serves it ("VAV-35",
// boxed); a sensor serving the zone is a symbol inside it ("T", "CO2"),
// usually against a wall. The reading is deterministic:
//   · the page's sheet title names zones;
//   · a scheduled unit's tag printed alone labels the smallest region that
//     holds the label's centre and is many times the label's own box (never
//     the box printed behind a label); a region two tags label is no one's;
//   · the page is a zone plan only when at least three tags label a zone of
//     their own and they are most of the scheduled tags printed on it;
//   · a symbol (a short span that is no scheduled unit's tag: "CO2", "T")
//     is in the smallest labelled zone that holds its centre.
// Nothing here decides an option: record.ts asks each unit's zone about its
// questions (a symbol the term list names as the option's device).
import type { Box, NoteSpan } from "../assemblies/scheduleNotes";
import type { OpList, OpsTable } from "../oneclick";
import { tagKey } from "./binding";
import { sheetTitleOf } from "./evidence";

export const ZONES_VERSION = "control_zones_v1";

type Pt = [number, number];

/** A closed region a page draws (a filled or clipping path), span space. */
export interface PageRegion {
  rings: Pt[][];
  bbox: Box;
}

export interface ZoneSymbol { text: string; box: Box }

/** One zone a scheduled unit's tag labels, and the symbols inside it. */
export interface Zone {
  /** The tag as printed. */
  tag: string;
  label: Box;
  /** The zone's region (its box: the ring itself is not kept). */
  bbox: Box;
  symbols: ZoneSymbol[];
}

export interface ZonePlan {
  sheet: string;
  title: string;
  zones: Zone[];
}

/** A title that names zones. */
const ZONE_TITLE = /\bZON(?:E|ES|ING)\b/;
/** How many times its own label's box a region must be to be a zone. */
const ZONE_OVER_LABEL = 25;
/** The longest span read as a symbol. */
const SYMBOL_CHARS = 4;
const CURVE_STEPS = 8;

/** The closed regions a page draws: each path that is filled or clips, in
 * the span space of `transform` (the viewport's). Regions smaller than
 * `minArea` (px²) are dropped. */
export function pageRegions(opList: OpList, transform: readonly number[], OPS: OpsTable, minArea = 400): PageRegion[] {
  const fns = opList.fnArray, A = opList.argsArray;
  let m = transform.slice();
  const stack: number[][] = [];
  const mul = (a: number[], b: number[]): number[] => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const closes = new Set([OPS.clip, OPS.eoClip, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter((x) => typeof x === "number"));
  const out: PageRegion[] = [];
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i], args = A[i];
    if (fn === OPS.save) stack.push(m.slice());
    else if (fn === OPS.restore) m = stack.pop() ?? m;
    else if (fn === OPS.transform) m = mul(m, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(m.slice()); if (args?.[0]) m = mul(m, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) m = stack.pop() ?? m;
    else if (fn === OPS.constructPath && closes.has(fns[i + 1])) {
      const tx = (x: number, y: number): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
      const ops: number[] = args?.[0] ?? [], co: number[] = args?.[1] ?? [];
      const rings: Pt[][] = [];
      let ring: Pt[] | null = null, cur: Pt | null = null, c = 0;
      for (const op of ops) {
        if (op === OPS.moveTo) { cur = tx(co[c], co[c + 1]); c += 2; ring = [cur]; rings.push(ring); }
        else if (op === OPS.lineTo) { cur = tx(co[c], co[c + 1]); c += 2; ring?.push(cur); }
        else if (op === OPS.curveTo || op === OPS.curveTo2 || op === OPS.curveTo3) {
          let p1: Pt, p2: Pt, p3: Pt;
          if (op === OPS.curveTo) { p1 = tx(co[c], co[c + 1]); p2 = tx(co[c + 2], co[c + 3]); p3 = tx(co[c + 4], co[c + 5]); c += 6; }
          else if (op === OPS.curveTo2) { p1 = cur ?? tx(co[c], co[c + 1]); p2 = tx(co[c], co[c + 1]); p3 = tx(co[c + 2], co[c + 3]); c += 4; }
          else { p1 = tx(co[c], co[c + 1]); p2 = p3 = tx(co[c + 2], co[c + 3]); c += 4; }
          const p0 = cur ?? p1;
          for (let k = 1; k <= CURVE_STEPS; k++) {
            const t = k / CURVE_STEPS, u = 1 - t;
            ring?.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]);
          }
          cur = p3;
        }
        else if (op === OPS.rectangle) {
          const x = co[c], y = co[c + 1], w = co[c + 2], h = co[c + 3]; c += 4;
          rings.push([tx(x, y), tx(x + w, y), tx(x + w, y + h), tx(x, y + h)]);
          ring = null;
        }
      }
      const pts = rings.filter((r) => r.length >= 3).flat();
      if (!pts.length) continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if ((x1 - x0) * (y1 - y0) < minArea) continue;
      out.push({ rings: rings.filter((r) => r.length >= 3), bbox: [x0, y0, x1, y1] });
    }
  }
  return out;
}

const boxArea = (b: Box) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);

/** Whether a point is inside a region (even-odd over its rings). */
function inside(r: PageRegion, [x, y]: Pt): boolean {
  if (x < r.bbox[0] || x > r.bbox[2] || y < r.bbox[1] || y > r.bbox[3]) return false;
  let n = 0;
  for (const ring of r.rings) {
    for (let a = 0, b = ring.length - 1; a < ring.length; b = a++) {
      const [xa, ya] = ring[a], [xb, yb] = ring[b];
      if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) n++;
    }
  }
  return n % 2 === 1;
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const centre = (s: NoteSpan): Pt => [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
const boxOf = (s: NoteSpan): Box => [s.x0, s.y0, s.x1, s.y1];
const keyOf = (tag: string) => { const k = tagKey(tag); return k ? `${k.prefix}-${k.n}${k.suffix}` : null; };

/** Whether a page's sheet title names zones (the only pages whose regions
 * are read). */
export function namesZones(spans: readonly NoteSpan[]): boolean {
  const title = sheetTitleOf(spans);
  return Boolean(title && ZONE_TITLE.test(title.toUpperCase()));
}

/** A page's zone plan, or null when it is not one (see the header). */
export function readZonePlan(sheet: string, spans: readonly NoteSpan[], regions: readonly PageRegion[], scheduledTags: Iterable<string>): ZonePlan | null {
  const title = sheetTitleOf(spans);
  if (!title || !namesZones(spans)) return null;
  const scheduled = new Set([...scheduledTags].map(keyOf).filter((k): k is string => Boolean(k)));
  const labels = spans.filter((s) => { const k = keyOf(clean(s.str)); return k !== null && scheduled.has(k) && /\d/.test(s.str); });
  if (!labels.length) return null;
  // Each label's zone: the smallest region around it many times its box.
  const labelled = new Map<PageRegion, Set<string>>();
  const zoneOfLabel = new Map<NoteSpan, PageRegion>();
  for (const l of labels) {
    const min = ZONE_OVER_LABEL * boxArea(boxOf(l));
    const zs = regions.filter((r) => boxArea(r.bbox) >= min && inside(r, centre(l))).sort((a, b) => boxArea(a.bbox) - boxArea(b.bbox));
    if (!zs.length) continue;
    zoneOfLabel.set(l, zs[0]);
    (labelled.get(zs[0]) ?? labelled.set(zs[0], new Set()).get(zs[0])!).add(keyOf(clean(l.str))!);
  }
  // A region two tags label is no one's zone.
  const own = new Map([...zoneOfLabel].filter(([, r]) => labelled.get(r)!.size === 1));
  const tagsWithZone = new Set([...own.keys()].map((l) => keyOf(clean(l.str))!));
  const tagsPrinted = new Set(labels.map((l) => keyOf(clean(l.str))!));
  if (tagsWithZone.size < 3 || tagsWithZone.size * 2 < tagsPrinted.size) return null;
  const zoneRegions = [...new Set(own.values())];
  // Symbols: short spans that are not tags, each in the smallest zone around it.
  const symbols = spans.filter((s) => { const t = clean(s.str); const k = keyOf(t); return t.length > 0 && t.length <= SYMBOL_CHARS && /[A-Z]/i.test(t) && !(k && scheduled.has(k)); });
  const inZone = new Map<PageRegion, ZoneSymbol[]>();
  for (const s of symbols) {
    const z = zoneRegions.filter((r) => inside(r, centre(s))).sort((a, b) => boxArea(a.bbox) - boxArea(b.bbox))[0];
    if (z) (inZone.get(z) ?? inZone.set(z, []).get(z)!).push({ text: clean(s.str), box: boxOf(s) });
  }
  const zones: Zone[] = [...own].map(([l, r]) => ({ tag: clean(l.str), label: boxOf(l), bbox: r.bbox, symbols: inZone.get(r) ?? [] }));
  zones.sort((a, b) => a.label[1] - b.label[1] || a.label[0] - b.label[0]);
  return { sheet, title, zones };
}
