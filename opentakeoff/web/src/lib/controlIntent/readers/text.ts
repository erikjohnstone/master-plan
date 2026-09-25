// CONTROL INTENT goal, WP3 (goals/CONTROL_INTENT.md decisions C7, CI2): the
// text of a control packet as the readers see it.
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. R0 matches its terms on these
// clauses, R1 reads these paragraphs, and every quote or label a reader
// returns is checked against them. The UI, MCP and the evals share one
// reading, so a quote verifies (or not) the same way everywhere.
//
// Reading order is structural, not the order spans were drawn in:
//   · a packet's lines are cut recursively at GUTTERS (vertical gaps no line
//     of the block crosses), so a sequence set in two or three columns reads
//     one column at a time; a line crossing a gutter only the shorter lines
//     leave open (a full-width heading) separates bands, read top to bottom;
//   · a lone list marker ("1.", "a.", "2)") is read just before the text it
//     marks on its baseline, never as a column of its own;
//   · a PARAGRAPH is a run of consecutive lines of one flow, each under the
//     last (a line gap), overlapping it and of its size: a sentence wrapped
//     over lines, or a label stacked over two ("MOTORIZED" over "DAMPER");
//   · a CLAUSE is a paragraph cut at its sentence ends (". ", ":", ";").
import type { Box, NoteSpan } from "../../assemblies/scheduleNotes";
import type { Packet } from "../evidence";
import { pageLines, repairSpacing, type Line } from "../evidence";
import WORDS from "./words.json" with { type: "json" };

export const TEXT_VERSION = "control_text_v1";

export interface PacketLine {
  /** `L<n>` in reading order, unique in the packet. */
  id: string;
  /** The line as printed (whitespace collapsed). */
  text: string;
  /** For matching: upper case, stray letter spaces closed up, one kind of
   * dash and quote. */
  norm: string;
  /** Quarter turn of the text (0, 90, 180, 270). */
  rot: number;
  /** Device-space box. */
  box: Box;
  h: number;
  /** The flow it belongs to (a column of a band): lines of one flow read on
   * from one another. */
  flow: number;
  spans: NoteSpan[];
}

export interface Paragraph {
  /** `P<n>` in reading order. */
  id: string;
  text: string;
  norm: string;
  lines: string[];
}

export interface Clause {
  text: string;
  norm: string;
  /** The paragraph it is part of. */
  paragraph: string;
  /** The lines it was read from. */
  lines: string[];
}

export interface PacketText {
  packet: string;
  lines: PacketLine[];
  paragraphs: Paragraph[];
  clauses: Clause[];
}

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

/** The words letter-spaced text is closed up to (words.json: UFGS/UFC
 * vocabulary and the library's own words). */
const DICTIONARY: ReadonlySet<string> = new Set((WORDS as { words: string[] }).words);
const isWord = (w: string) => DICTIONARY.has(w) || w === "A" || w === "I" || /^[^A-Z]*$/.test(w);

/** A line's stray spaces inside words closed up: two to four pieces join
 * when together they spell a dictionary word and one of them is no word on
 * its own ("M O DULATE" → "MODULATE", "CONTRO L" → "CONTROL", "IS OLATION"
 * → "ISOLATION"; "IN TO" stays two words). Punctuation after the last piece
 * stays after the word. */
export function closeLetterSpacing(text: string): string {
  const toks = text.split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    let joined = false;
    for (let k = Math.min(4, toks.length - i); k >= 2; k--) {
      const pieces = toks.slice(i, i + k);
      if (pieces.slice(0, -1).some((p) => !/^[A-Z]+$/.test(p))) continue;
      const last = pieces[k - 1].match(/^([A-Z]+)([^A-Z]*)$/);
      if (!last) continue;
      const cores = [...pieces.slice(0, -1), last[1]];
      const word = cores.join("");
      if (word.length < 3 || !DICTIONARY.has(word) || cores.every(isWord)) continue;
      out.push(word + last[2]);
      i += k - 1;
      joined = true;
      break;
    }
    if (!joined) out.push(toks[i]);
  }
  return out.join(" ");
}

/** The matching form of printed text: upper case, one kind of dash, quote
 * and space; letter-spaced words closed up. */
export function normText(s: unknown): string {
  // Degree-like glyphs are one glyph ("80ºF" and "80°F": NFKC would read º as O).
  const t = clean(s).replace(/[º˚]/g, "°").normalize("NFKC").toUpperCase()
    .replace(/[‐-―−﹘﹣－]/g, "-")
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"');
  return closeLetterSpacing(repairSpacing(t));
}

/** Text as its letters and digits alone: what a quote is checked against,
 * so a letter-spaced print ("CONTRO L VALVE") or another dash, quote or
 * degree glyph still verifies a quote of it. */
export const squeeze = (s: unknown): string => normText(s).replace(/[^A-Z0-9]+/g, "");

/** A list marker printed apart from its text: "1.", "A.", "a)", "(2)", "1)". */
const MARKER = /^\(?(?:\d{1,2}|[A-Z]|[IVX]{1,4})[.)]\)?$/i;
/** A line that starts with one ("1. SEND AN ENABLE COMMAND …"). */
const ITEM_START = /^\(?(?:\d{1,2}|[A-Z]|[IVX]{1,4})[.)]\)?\s+\S/i;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

interface Item { line: Line; marker: boolean; chain?: Line[] }

/** Merged coverage intervals of boxes along u. */
function coverage(items: readonly Item[]): Array<[number, number]> {
  const iv = items.map((it) => [it.line.box[0], it.line.box[2]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [a, b] of iv) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** The gutters of a block: gaps between coverage intervals at least `min` wide. */
function gutters(items: readonly Item[], min: number): Array<[number, number]> {
  const cov = coverage(items);
  const out: Array<[number, number]> = [];
  for (let i = 1; i < cov.length; i++) if (cov[i][0] - cov[i - 1][1] >= min) out.push([cov[i - 1][1], cov[i][0]]);
  return out;
}

const byV = (a: Item, b: Item) => a.line.box[1] - b.line.box[1] || a.line.box[0] - b.line.box[0];

/** One block's items in reading order, as flows (each a list read top to
 * bottom). Recursion: cut at the gutters no line crosses; else at the
 * gutters only lines longer than half the block cross, those lines
 * separating bands; else one flow. */
function order(items: Item[], hb: number, depth = 0): Item[][] {
  if (items.length <= 1 || depth > 4) return [items.slice().sort(byV)];
  const min = 1.5 * hb;
  const u0 = Math.min(...items.map((it) => it.line.box[0]));
  const u1 = Math.max(...items.map((it) => it.line.box[2]));
  const columnsAt = (cuts: Array<[number, number]>, members: Item[]) => {
    const cols: Item[][] = cuts.map(() => []);
    cols.push([]);
    for (const it of members) {
      const c = (it.line.box[0] + it.line.box[2]) / 2;
      let k = 0;
      while (k < cuts.length && c > (cuts[k][0] + cuts[k][1]) / 2) k++;
      cols[k].push(it);
    }
    return cols.filter((c) => c.length);
  };
  const clear = gutters(items, min);
  if (clear.length) return columnsAt(clear, items).flatMap((col) => order(col, hb, depth + 1));
  // A line longer than half the block, or set larger than its body text (a
  // title centred under two columns), may cross a gutter the others leave.
  const long = (it: Item) => it.line.box[2] - it.line.box[0] > 0.5 * (u1 - u0) || it.line.h > 1.35 * hb;
  const short = items.filter((it) => !long(it));
  const cuts = short.length >= 2 ? gutters(short, min) : [];
  if (!cuts.length) return [items.slice().sort(byV)];
  // Lines crossing a gutter separate bands; read band by band, and each
  // band column by column.
  const crosses = (it: Item) => cuts.some(([a, b]) => it.line.box[0] < b && it.line.box[2] > a);
  const spanning = items.filter(crosses).sort(byV);
  const rest = items.filter((it) => !crosses(it));
  const flows: Item[][] = [];
  let prev = -Infinity;
  for (const s of [...spanning, null]) {
    const top = s ? (s.line.box[1] + s.line.box[3]) / 2 : Infinity;
    const band = rest.filter((it) => {
      const c = (it.line.box[1] + it.line.box[3]) / 2;
      return c > prev && c <= top;
    });
    if (band.length) flows.push(...columnsAt(cuts, band).flatMap((col) => order(col, hb, depth + 1)));
    if (s) flows.push([s]);
    prev = top;
  }
  return flows;
}

/** A packet's text in reading order: lines, paragraphs and clauses. */
export function packetText(p: Packet): PacketText {
  const all = pageLines(p.spans);
  // The packet's own reading frame first (its most common rotation), then
  // text at other turns (a rotated label), each read in its own frame.
  const count = (r: number) => all.filter((l) => l.rot === r).length;
  const rots = [...new Set(all.map((l) => l.rot))].sort((a, b) => count(b) - count(a) || a - b);
  const lines: PacketLine[] = [];
  const paragraphs: Paragraph[] = [];
  let flowNo = 0;
  for (const rot of rots) {
    const ls = all.filter((l) => l.rot === rot);
    const hb = median(ls.map((l) => l.h)) || 8;
    // A list marker is read just before the text to its right on its baseline.
    const isMarker = (l: Line) => MARKER.test(clean(l.text));
    const body = ls.filter((l) => !isMarker(l));
    const prefix = new Map<Line, Line[]>();
    for (const m of ls.filter(isMarker)) {
      const mv = (m.box[1] + m.box[3]) / 2;
      const target = body
        .filter((b) => b.box[0] >= m.box[2] - 0.2 * m.h && b.box[0] - m.box[2] <= 4 * Math.max(m.h, b.h)
          && Math.abs((b.box[1] + b.box[3]) / 2 - mv) <= 0.6 * Math.max(m.h, b.h))
        .sort((a, b) => a.box[0] - b.box[0])[0];
      if (target) (prefix.get(target) ?? prefix.set(target, []).get(target)!).push(m);
      else body.push(m);
    }
    // Chain each line to the one it continues: directly above it (a line
    // gap), overlapping it along the text and of its size. Columns never
    // overlap, so a wrapped sentence never continues in the next column.
    const sorted = body.slice().sort((a, b) => a.box[1] - b.box[1] || a.box[0] - b.box[0]);
    const next = new Map<Line, Line>();
    const hasPrev = new Set<Line>();
    for (const l of sorted) {
      // A line a list marker starts begins its own paragraph.
      if (prefix.has(l) || ITEM_START.test(clean(l.text))) continue;
      let best: Line | null = null;
      let bestKey = [Infinity, Infinity];
      for (const a of sorted) {
        if (a === l || next.has(a) || a.box[1] >= l.box[1]) continue;
        const lo = Math.min(a.h, l.h), hi = Math.max(a.h, l.h);
        if (hi / lo > 1.35) continue;
        const gap = l.box[1] - a.box[3];
        if (gap < -0.3 * lo || gap > 0.9 * hi) continue;
        const ov = Math.min(a.box[2], l.box[2]) - Math.max(a.box[0], l.box[0]);
        if (ov <= 0.25 * Math.min(a.box[2] - a.box[0], l.box[2] - l.box[0])) continue;
        const key = [Math.abs(a.box[0] - l.box[0]), gap];
        if (key[0] < bestKey[0] - 0.5 * lo || (Math.abs(key[0] - bestKey[0]) <= 0.5 * lo && key[1] < bestKey[1])) { best = a; bestKey = key; }
      }
      if (best) { next.set(best, l); hasPrev.add(l); }
    }
    const chains: Line[][] = [];
    for (const l of sorted) {
      if (hasPrev.has(l)) continue;
      const chain = [l];
      for (let c = next.get(l); c; c = next.get(c)) chain.push(c);
      chains.push(chain);
    }
    // Paragraphs in reading order: the column cut over their boxes.
    const boxOf = (ch: Line[]): Box => [Math.min(...ch.map((l) => l.box[0])), Math.min(...ch.map((l) => l.box[1])), Math.max(...ch.map((l) => l.box[2])), Math.max(...ch.map((l) => l.box[3]))];
    const items: Item[] = chains.map((ch) => ({ line: { ...ch[0], box: boxOf(ch), h: median(ch.map((l) => l.h)) }, marker: false, chain: ch }));
    for (const flow of order(items, hb)) {
      const f = flowNo++;
      for (const it of flow) {
        const ids: string[] = [];
        for (const l of it.chain!) {
          for (const m of (prefix.get(l) ?? []).sort((a, b) => a.box[0] - b.box[0])) {
            lines.push({ id: `L${lines.length + 1}`, text: clean(m.text), norm: normText(m.text), rot, box: m.dev, h: m.h, flow: f, spans: m.spans });
            ids.push(lines[lines.length - 1].id);
          }
          lines.push({ id: `L${lines.length + 1}`, text: clean(l.text), norm: normText(l.text), rot, box: l.dev, h: l.h, flow: f, spans: l.spans });
          ids.push(lines[lines.length - 1].id);
        }
        const text = ids.map((id) => lines[Number(id.slice(1)) - 1].text).join(" ");
        paragraphs.push({ id: `P${paragraphs.length + 1}`, text, norm: normText(text), lines: ids });
      }
    }
  }

  // Clauses: paragraphs cut at sentence ends. A cut is kept on the lines it
  // came from: each clause cites the lines its text overlaps.
  const clauses: Clause[] = [];
  const byId = new Map(lines.map((l) => [l.id, l]));
  for (const pg of paragraphs) {
    // Character offsets of each line inside the paragraph text.
    const offs: Array<{ id: string; a: number; b: number }> = [];
    let at = 0;
    for (const id of pg.lines) {
      const t = byId.get(id)!.text;
      offs.push({ id, a: at, b: at + t.length });
      at += t.length + 1;
    }
    const cuts: number[] = [0];
    const re = /[.:;](?=\s|$)/g;
    for (let m = re.exec(pg.text); m; m = re.exec(pg.text)) {
      // "5°F (ADJ.)" and "N.C." are not sentence ends: a cut needs a word of
      // two letters or more before it, or a closing parenthesis after one.
      const head = pg.text.slice(Math.max(0, m.index - 12), m.index);
      if (m[0] === "." && !/[A-Z]{2,}\)?$|\d{2,}\)?$/i.test(head)) continue;
      cuts.push(m.index + 1);
    }
    cuts.push(pg.text.length);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      const text = clean(pg.text.slice(a, b));
      if (!text) continue;
      const ids = offs.filter((o) => o.b > a && o.a < b).map((o) => o.id);
      clauses.push({ text, norm: normText(text), paragraph: pg.id, lines: ids });
    }
  }
  return { packet: p.id, lines, paragraphs, clauses };
}

/** Whether `quote` is printed in `text`: the same characters in the same
 * order, spacing aside (both in matching form). */
export const printedIn = (quote: string, text: string): boolean => {
  const q = squeeze(quote);
  return q.length > 0 && squeeze(text).includes(q);
};
