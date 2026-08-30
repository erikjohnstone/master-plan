// Mark identity for the count takeoff (#count_marks, sweep_schedule_row).
// Pure — spans in, hits out — so the canvas and the MCP server cannot
// disagree about which drawn tag is which scheduled mark.
//
// Three failure modes this module kills, all measured on real HVAC sets
// before the rule was written:
//
//   1. SHORT-MARK OVERCOUNT. "P1" is a string prefix of "P10" and "P1A".
//      A matcher that starts-with, contains, or unanchored-regexes the
//      want into the have silently bills those longer marks as the short
//      one. Identity here is exact on the canonical key — a longer string
//      that merely starts with the want never answers.
//
//   2. TWIN-ALIAS DOUBLE-COUNT. Drafting writes "P-1" and "P1" (and "P 1")
//      for the same mark; CAD text extraction often emits both spellings
//      a few pixels apart on one device. Hyphen/space are not identity,
//      and two alias hits inside one text-height cluster are one instance.
//
//   3. SHARED BARE MARKS. A letter-only tag ("ET") that several qualified
//      siblings (ET-1, ET-2) could claim is genuinely ambiguous. Auto-
//      resolving it to the first sibling is how two real, separate devices
//      that share a bare mark get billed as one. The span answers for
//      nobody; the caller withholds or refuses. A UNIQUE bare prefix of a
//      single qualified mark may resolve — there is no second candidate.
//
//   4. COMPOUND RUN vs SHEET NUMBER. A plan label "R1 /C-11" is one
//      instance of R1 (the key, then '/' or whitespace, then more text in
//      the same run). A dotted numeric suffix is a sheet number ("S3.1",
//      "P1.01"), not that key. Any other non-alnum remainder is not a
//      compound hit — the separator is '/' or whitespace, nothing else.
//
// No corpus names, no tag literals, no sheet numbers. The rule is the
// shape of the identity, not a list of jobs it was measured on.

export interface MarkBox {
  str: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MarkOcc {
  cx: number;
  cy: number;
  h: number;
  bbox: [number, number, number, number];
  text: string;
}

/** Cluster radius, in units of the hit's own text height. Alias twins of
 * one device sit well inside one lettering; abutting real instances of the
 * same mark sit farther (a second unit a few feet over). 2.2× is the same
 * constant label corroboration measured on true vs impostor pairs. */
export const MARK_CLUSTER_K = 2.2;

/** Canonical mark identity: case, whitespace, and hyphens are drafting
 * variation, not identity. "P-1", "P1", "P 1" collapse to "P1". Digits
 * stay, so "P1" and "P10" stay distinct. */
export function markKey(s: string): string {
  return (s || "").trim().toUpperCase().replace(/[\s-]+/g, "");
}

export function marksEqual(a: string, b: string): boolean {
  const k = markKey(a);
  return k.length > 0 && k === markKey(b);
}

/** A letter-only key — the family name with no instance number. "ET",
 * "P", "US". Qualified marks carry a digit ("ET1", "P1", "US2"). */
const isBare = (k: string): boolean => /^[A-Z]+$/.test(k);

/** Collapse hyphen/space twins, first spelling wins (the schedule's own
 * writing). Empty tokens drop. */
export function dedupeMarks(marks: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of marks) {
    const k = markKey(m);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push((m || "").trim().toUpperCase().replace(/\s+/g, ""));
  }
  return out;
}

/** After a '/' or whitespace delimiter, the remainder must be another
 * short mark (circuit/panel/inverter — "C-11", "INV-2"), not a sentence.
 * A work note that merely mentions the key ("CUH-T1 ON FLOOR 3; …") is
 * not a drawn instance. */
export function compoundRemainderIsLabel(rest: string): boolean {
  if (!/^[\/\s]/.test(rest)) return false;
  const more = rest.replace(/^[\/\s]+/, "");
  if (!more || /^\.\d/.test(more)) return false;
  const first = more.split(/[\s/;,]+/)[0] || "";
  // Circuit/panel/inverter remainders carry a digit or hyphen ("C-11",
  // "INV-2"). A bare English word ("ON", "FOR") is a work note that
  // mentions the key, not a drawn instance.
  return /^[A-Z][A-Z0-9/-]{0,15}$/.test(first) && /[0-9-]/.test(first);
}

/** A compound instance: the scheduled key, then '/' or whitespace, then
 * more text in the SAME run ("R1 /C-11", "R1/C-11", "R1 C-11").
 *
 * A dotted numeric suffix is a sheet number ("S3.1", "P1.01"), not the
 * key. Any other non-alnum remainder is not a compound hit — "P10" and
 * "P1A" stay short-mark overcounts, "S3:1" is punctuation, not a join.
 * Exact equality is not a compound (the exact-alias path handles it). */
export function compoundTagOcc(have: string, want: string): boolean {
  const raw = (have || "").trim().toUpperCase();
  const w = markKey(want);
  if (!w || !raw) return false;
  let i = 0, k = 0;
  while (i < raw.length && k < w.length) {
    const ch = raw[i];
    if (ch === "-" || /\s/.test(ch)) { i++; continue; }
    if (ch !== w[k]) return false;
    i++; k++;
  }
  if (k < w.length) return false;
  while (i < raw.length && raw[i] === "-") i++;
  if (i >= raw.length) return false;
  const rest = raw.slice(i);
  if (/^\.\d/.test(rest)) return false;
  return compoundRemainderIsLabel(rest);
}

/** Does the drawn text `have` uniquely answer for scheduled mark `want`,
 * given the rest of the mark vocabulary?
 *
 * Exact alias (hyphen/space-insensitive) always answers — unless `have`
 * is a BARE family name and the vocab carries qualified siblings of it
 * (shared bare mark: never auto-resolve). A compound run of the key
 * ("R1 /C-11") answers. A longer string that merely starts with `want`
 * never answers (short-mark overcount). A bare prefix of `want` answers
 * only when no other vocab mark shares that prefix. */
export function spanAnswersFor(have: string, want: string, vocab: readonly string[]): boolean {
  const h = markKey(have);
  const w = markKey(want);
  if (!h || !w) return false;

  if (h === w) {
    if (isBare(h) && vocab.some((v) => {
      const k = markKey(v);
      return k !== h && k.startsWith(h);
    })) return false;
    return true;
  }

  if (compoundTagOcc(have, want)) return true;

  // short-mark overcount: "P10" / "P1A" must not answer for "P1"
  if (h.startsWith(w)) return false;

  // bare prefix of want: "ET" → "ET1" only when that extension is unique
  if (w.startsWith(h) && isBare(h)) {
    const conflict = vocab.some((v) => {
      const k = markKey(v);
      return k !== w && (k === h || k.startsWith(h));
    });
    return !conflict;
  }
  return false;
}

/** Every drawn occurrence of `want` on the sheet, after alias clustering.
 * Twin spellings of the same mark sitting on one device collapse to one
 * hit (the longer original text wins). Far-apart alias spellings stay
 * two instances — two devices, two counts. */
export function pickMarkHits(
  spans: readonly MarkBox[],
  want: string,
  vocab: readonly string[],
): MarkOcc[] {
  const raw: MarkOcc[] = [];
  for (const sp of spans) {
    if (!spanAnswersFor(sp.str, want, vocab)) continue;
    const cx = (sp.x0 + sp.x1) / 2;
    const cy = (sp.y0 + sp.y1) / 2;
    const h = Math.max(sp.y1 - sp.y0, 6);
    raw.push({
      cx, cy, h,
      bbox: [sp.x0, sp.y0, sp.x1, sp.y1],
      text: (sp.str || "").trim(),
    });
  }
  raw.sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  const kept: MarkOcc[] = [];
  const used = new Set<number>();
  for (let i = 0; i < raw.length; i++) {
    if (used.has(i)) continue;
    let best = raw[i];
    const ri = MARK_CLUSTER_K * best.h;
    for (let j = i + 1; j < raw.length; j++) {
      if (used.has(j)) continue;
      const d = Math.hypot(raw[j].cx - best.cx, raw[j].cy - best.cy);
      const rj = MARK_CLUSTER_K * raw[j].h;
      if (d > Math.max(ri, rj)) continue;
      used.add(j);
      // prefer the longer original spelling ("P-1" over "P1") — more of
      // the drawn identity, same canonical key
      if (raw[j].text.replace(/\s/g, "").length > best.text.replace(/\s/g, "").length) {
        best = raw[j];
      }
    }
    kept.push(best);
  }
  return kept;
}

/** Destination/source callout language. A scheduled tag sitting next to
 * one of these is named as where a duct/pipe run goes, not as a drawn
 * device. Whole-span match so "UP TO 200 CFM" and "TO BUILDING AUTOMATION"
 * never fire. No project, sheet, or tag names. */
export function isRoutingPhrase(str: string): boolean {
  const t = (str || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return false;
  if (/\b(?:DUCT|PIPE|MAIN|RISER|DROP|RUN)\b/.test(t) && /\bTO\.?$/.test(t)) return true;
  if (/^(?:DOWN|UP|OVER|BACK)\s+TO\.?$/.test(t)) return true;
  if (/^(?:RETURN|SUPPLY|EXHAUST|RELIEF)\s+TO\.?$/.test(t)) return true;
  if (/^FROM\.?$/.test(t)) return true;
  return false;
}

/** Cluster radius, in units of the tag's own text height, for a routing
 * phrase to attach to that occurrence. 4× covers a stacked callout
 * ("36X16 RETURN" over "DUCT DOWN TO" over the tag) without reaching a
 * second unit a room away. */
export const ROUTING_LABEL_RADIUS_K = 4;

/** True when a destination/source phrase sits next to this occurrence. */
export function isRoutingLabelOcc(
  spans: readonly MarkBox[],
  occ: { cx: number; cy: number; h: number },
): boolean {
  const R = ROUTING_LABEL_RADIUS_K * Math.max(occ.h, 6);
  for (const sp of spans) {
    if (!isRoutingPhrase(sp.str)) continue;
    const cx = (sp.x0 + sp.x1) / 2, cy = (sp.y0 + sp.y1) / 2;
    if (Math.hypot(cx - occ.cx, cy - occ.cy) <= R) return true;
  }
  return false;
}
