// Equipment / device tags as drawn on mechanical (and similar) plans.
// PURE — spans in, tags out — so the canvas, the sheet graph, the schedule
// importer, and the MCP census all share one classifier. No corpus names:
// the class is a hyphenated token shape, not a list of pumps.

/** A positioned text run. Matches MCP TextSpan / label span boxes. */
export interface TagBox {
  str: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rot?: number;
}

const MAX_SEGS = 5;
const MAX_SEG_LEN = 8;
const MAX_TAG_LEN = 20;
// CAD glyph splits sit at ~0 gap; a word space is ~0.25–0.5 em. Stay inside
// a space so "CUH" and a distant "T1" across a room never glue.
export const EQUIP_JOIN_GAP_K = 0.35;
const EQUIP_JOIN_ROW_K = 0.4;
const EQUIP_JOIN_MAX_FRAGS = 11;

const canon = (s: string) => (s || "").trim().toUpperCase().replace(/[–—−]/g, "-").replace(/\s+/g, "");

/**
 * Multi-hyphen equipment tags: letter-led, hyphen-separated alphanumeric
 * segments — PCHWP-MT1, CUH-T1, CV-CHW-BP-T, AHU-1.
 *
 * A two-segment tag must contain a digit so hyphenated English
 * ("FIRST-FLOOR", "SEE-NOTE") never reads as a tag. Three or more short
 * segments are abbreviation-stacks and are accepted without a digit.
 */
export function isEquipTag(raw: string): boolean {
  const t = canon(raw);
  if (t.length < 3 || t.length > MAX_TAG_LEN) return false;
  if (!t.includes("-")) return false;
  const parts = t.split("-");
  if (parts.length < 2 || parts.length > MAX_SEGS) return false;
  if (!/^[A-Z]{1,8}$/.test(parts[0])) return false;
  for (let i = 1; i < parts.length; i++) {
    if (!parts[i] || parts[i].length > MAX_SEG_LEN || !/^[A-Z0-9]+$/.test(parts[i])) return false;
  }
  if (parts.length === 2 && !/\d/.test(t)) return false;
  return true;
}

function similarH(a: TagBox, b: TagBox): boolean {
  const ha = Math.max(a.y1 - a.y0, 1), hb = Math.max(b.y1 - b.y0, 1);
  return Math.max(ha, hb) <= 2 * Math.min(ha, hb);
}

function sameRow(a: TagBox, b: TagBox): boolean {
  const ha = Math.max(a.y1 - a.y0, 1);
  const hb = Math.max(b.y1 - b.y0, 1);
  const cyA = (a.y0 + a.y1) / 2, cyB = (b.y0 + b.y1) / 2;
  return Math.abs(cyA - cyB) <= Math.max(ha, hb) * EQUIP_JOIN_ROW_K;
}

function closeGap(prev: TagBox, next: TagBox): boolean {
  const h = Math.max(prev.y1 - prev.y0, next.y1 - next.y0, 1);
  return next.x0 - prev.x1 <= h * EQUIP_JOIN_GAP_K;
}

function piece(s: TagBox): string {
  return (s.str || "").replace(/[–—−]/g, "-").replace(/\s+/g, "");
}

function mergeBoxes<T extends TagBox>(run: T[]): T {
  const first = run[0];
  return {
    ...first,
    str: run.map(piece).join(""),
    x0: Math.min(...run.map((s) => s.x0)),
    y0: Math.min(...run.map((s) => s.y0)),
    x1: Math.max(...run.map((s) => s.x1)),
    y1: Math.max(...run.map((s) => s.y1)),
  };
}

/** True when the run is off the +X axis enough that same-row / +X-gap
 * joining cannot see its own next glyph. 0° (and near-0 title-block drift)
 * keeps the original left-to-right walk; 90/180/270 use the along-run walk. */
function isRotatedRun(rot?: number): boolean {
  const r = (((rot || 0) % 360) + 360) % 360;
  return r >= 45 && r < 315;
}

function fontPx(s: TagBox): number {
  const r = (((s.rot || 0) % 360) + 360) % 360;
  const w = Math.max(s.x1 - s.x0, 1);
  const h = Math.max(s.y1 - s.y0, 1);
  // Perpendicular to the run = em size. 90/270: AA width; 0/180: AA height.
  return (r >= 45 && r < 135) || (r >= 225 && r < 315) ? w : h;
}

function runVec(rot?: number): [number, number] {
  const r = ((((rot || 0) % 360) + 360) % 360) * Math.PI / 180;
  return [Math.cos(r), Math.sin(r)];
}

function alongSpan(s: TagBox, rdx: number, rdy: number): { lo: number; hi: number } {
  const xs = [s.x0, s.x1, s.x0, s.x1];
  const ys = [s.y0, s.y0, s.y1, s.y1];
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 4; i++) {
    const p = xs[i] * rdx + ys[i] * rdy;
    if (p < lo) lo = p;
    if (p > hi) hi = p;
  }
  return { lo, hi };
}

function sameBaselineRot(a: TagBox, b: TagBox): boolean {
  const f = Math.max(fontPx(a), fontPx(b));
  const r = (((a.rot || 0) % 360) + 360) % 360;
  const vertical = (r >= 45 && r < 135) || (r >= 225 && r < 315);
  const d = vertical
    ? Math.abs((a.x0 + a.x1) / 2 - (b.x0 + b.x1) / 2)
    : Math.abs((a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2);
  return d <= f * EQUIP_JOIN_ROW_K;
}

function similarFont(a: TagBox, b: TagBox): boolean {
  const fa = fontPx(a), fb = fontPx(b);
  return Math.max(fa, fb) <= 2 * Math.min(fa, fb);
}

/** Unrotated (+X) walk — the original algorithm, kept byte-identical so a
 * 270° neighbor sitting between two +X fragments in y-order cannot reshuffle
 * a case that already joined. */
function joinAlongX<T extends TagBox>(items: T[]): T[] {
  if (items.length < 2) return items;
  const ordered = [...items].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out: T[] = [];
  const used = new Set<number>();
  for (let i = 0; i < ordered.length; i++) {
    if (used.has(i)) continue;
    let bestJ = -1;
    let concat = piece(ordered[i]);
    for (let j = i + 1; j < ordered.length && j - i < EQUIP_JOIN_MAX_FRAGS; j++) {
      if (used.has(j)) break;
      const prev = ordered[j - 1], next = ordered[j];
      if ((prev.rot || 0) !== (next.rot || 0)) break;
      if (!sameRow(prev, next) || !similarH(prev, next) || !closeGap(prev, next)) break;
      const nxt = piece(next);
      // The hyphen is the connector. Do not glue two already-complete tokens
      // (P-7 beside FD1) just because they sit close — only extend across a
      // hyphen fragment or a hyphen-led/hyphen-tailed piece.
      if (!(concat.endsWith("-") || nxt.startsWith("-"))) break;
      concat += nxt;
      if (isEquipTag(concat)) bestJ = j;
    }
    if (bestJ >= 0) {
      const run = ordered.slice(i, bestJ + 1);
      out.push(mergeBoxes(run));
      for (let k = i; k <= bestJ; k++) used.add(k);
    } else {
      out.push(ordered[i]);
      used.add(i);
    }
  }
  return out;
}

/** Rotated walk: same hyphen-connector + isEquipTag gate, but neighbor
 * picking is along the run (90/180/270) and same-baseline is perpendicular
 * to it. Letter-led starts first so a hyphen fragment visited earlier
 * cannot steal the connector from its own prefix. Adjacent columns of the
 * same rotated tag family stay split — baseline distance is the em, not
 * the (much longer) AA height of the word. */
function alongLo(s: TagBox): number {
  const [rdx, rdy] = runVec(s.rot);
  return alongSpan(s, rdx, rdy).lo;
}

function joinAlongRun<T extends TagBox>(items: T[]): T[] {
  if (items.length < 2) return items;
  const used = new Set<number>();
  const out: T[] = [];
  // Letter-led first so a hyphen never opens a chain; then reading order
  // (smallest along-run projection) so the prefix is tried before a
  // letter-led suffix ("M1", "T") that cannot grow in +run.
  const starts = items.map((_, i) => i).sort((a, b) => {
    const la = /^[A-Za-z]/.test(piece(items[a])) ? 0 : 1;
    const lb = /^[A-Za-z]/.test(piece(items[b])) ? 0 : 1;
    if (la !== lb) return la - lb;
    return alongLo(items[a]) - alongLo(items[b]);
  });
  for (const i of starts) {
    if (used.has(i)) continue;
    const chain = [i];
    let concat = piece(items[i]);
    let bestAt = 0;
    for (let hop = 0; hop < EQUIP_JOIN_MAX_FRAGS; hop++) {
      const prev = items[chain[chain.length - 1]];
      const rot = prev.rot || 0;
      const [rdx, rdy] = runVec(rot);
      const prevA = alongSpan(prev, rdx, rdy);
      const f = fontPx(prev);
      let pick = -1, pickGap = Infinity;
      for (let j = 0; j < items.length; j++) {
        if (used.has(j) || chain.includes(j)) continue;
        const next = items[j];
        if ((next.rot || 0) !== rot) continue;
        if (!sameBaselineRot(prev, next) || !similarFont(prev, next)) continue;
        const nxt = piece(next);
        if (!(concat.endsWith("-") || nxt.startsWith("-"))) continue;
        const nextA = alongSpan(next, rdx, rdy);
        const gap = nextA.lo - prevA.hi;
        if (gap > f * EQUIP_JOIN_GAP_K || gap < -f * 0.25) continue;
        if (gap < pickGap) { pickGap = gap; pick = j; }
      }
      if (pick < 0) break;
      concat += piece(items[pick]);
      chain.push(pick);
      if (isEquipTag(concat)) bestAt = chain.length - 1;
    }
    if (bestAt > 0) {
      out.push(mergeBoxes(chain.slice(0, bestAt + 1).map((k) => items[k])));
      for (const k of chain.slice(0, bestAt + 1)) used.add(k);
    }
    // A failed start is not consumed — it may be a letter-led suffix
    // ("M1") that the real prefix still needs to claim.
  }
  for (let i = 0; i < items.length; i++) {
    if (!used.has(i)) out.push(items[i]);
  }
  return out;
}

/**
 * CAD exports often split one drawn tag into glyph runs — "PCHWP-MT1" arrives
 * as "PCHWP" + "-" + "MT1", and a 270° stack arrives as the same pieces
 * along the run instead of +X. Join adjacent fragments on the same baseline
 * whose concatenation IS an equipment tag. A join that is not a tag is never
 * emitted, so joining can only add candidates, never hide a real span.
 */
export function joinHyphenatedTags<T extends TagBox>(spans: T[]): T[] {
  const items = spans.filter((s) => piece(s));
  if (items.length < 2) return items;
  const axis: T[] = [];
  const rotated: T[] = [];
  for (const s of items) (isRotatedRun(s.rot) ? rotated : axis).push(s);
  return [...joinAlongX(axis), ...joinAlongRun(rotated)].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/** GraphSpan-shaped cousin (x/y/w/h) — same join, same class.
 * Unmerged spans keep their original object identity so DeltaIndex (a
 * Map keyed by span reference) still finds drawn markers after a join
 * pass — cloning every box would drop a row sitting next to a triangle-digit. */
export function joinGraphSpans<T extends { str: string; x: number; y: number; w: number; h: number; rot?: number }>(spans: T[]): T[] {
  const origin = new Map<object, T>();
  const boxes = spans.map((s) => {
    const b = { ...s, x0: s.x, y0: s.y, x1: s.x + (s.w || 0), y1: s.y + (s.h || 0) };
    origin.set(b, s);
    return b;
  });
  return joinHyphenatedTags(boxes).map((b) => {
    const orig = origin.get(b);
    if (orig) return orig;
    const { x0, y0, x1, y1, ...rest } = b;
    return { ...rest, x: x0, y: y0, w: x1 - x0, h: y1 - y0 } as unknown as T;
  });
}
