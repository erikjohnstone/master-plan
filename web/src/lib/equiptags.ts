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

/**
 * CAD exports often split one drawn tag into glyph runs — "PCHWP-MT1" arrives
 * as "PCHWP" + "-" + "MT1". Join adjacent fragments on the same baseline
 * whose concatenation IS an equipment tag. A join that is not a tag is never
 * emitted, so joining can only add candidates, never hide a real span.
 */
export function joinHyphenatedTags<T extends TagBox>(spans: T[]): T[] {
  const items = spans.filter((s) => piece(s));
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
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
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
