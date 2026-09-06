// citeMatch — link what the answer SAYS to the evidence that was painted.
//
// The agent already cites properly: every highlight_citation carries the sheet,
// the bbox, and (via enrichHighlightCitationArgs) the row key, column and value
// it came from. All of that was rendered as SourceCards in a drawer that is
// COLLAPSED BY DEFAULT and sits below the whole thread. So the answer said
// "VAV-1 is 350 CFM" as unadorned prose, and the proof that it came off the
// drawing was three clicks away.
//
// This is the matching half: given the answer text and the run's citations,
// find the equipment marks in the prose that we hold evidence for.
//
// It links MARKS ONLY, never bare values. `55` appears in a dozen columns of
// any mechanical schedule; "VAV-1" is an identity. The rules below mirror the
// ones agentLoop's evidence gate already uses on the raw answer
// (canonicalization at agentLoop.js:468, the MARK pattern at :939) — the gate
// decides whether an answer is grounded, this decides where to put the link,
// and they must not disagree about what counts as a mark.

/** A MARK has a letter part and MUST contain a digit — otherwise ordinary prose
 *  ("HVAC", "AIR-COOLED") reads as equipment. Same shape as the goal-side tag
 *  extractor in agentLoop.js:939. */
const MARK_RE = /\b[A-Z][A-Z0-9]{0,7}-[A-Z0-9]*\d[A-Z0-9]*\b|\b(?:AI|AO|BI|BO)\d+[A-Z]?\b/g;

/** Compare marks the way the drawing does not: case, spaces, and punctuation
 *  are noise. "VAV‑1", "vav 1" and "VAV-1" are one mark. */
export function canon(s) {
  return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Index the run's citations by the mark they cite.
 *
 *  A mark cited many times (once per column) keeps the RICHEST citation — the
 *  one that names a column and a value — so the chip's tooltip says something
 *  useful rather than whichever paint happened to land first.
 */
export function buildCiteIndex(citations) {
  const index = new Map();
  for (const c of Array.isArray(citations) ? citations : []) {
    const key = canon(c?.row_key);
    if (!key) continue;
    if (!Array.isArray(c?.bbox_px) || c.bbox_px.length !== 4) continue;
    if (!(c?.sheet || c?.sheet_id)) continue;
    const prev = index.get(key);
    const rank = (x) => (x?.column ? 2 : 0) + (x?.value ? 1 : 0);
    if (!prev || rank(c) > rank(prev)) index.set(key, c);
  }
  return index;
}

/** Split one run of plain text into segments, marking the spans we can cite.
 *
 *  Returns [{ text }] and [{ text, citation }] in source order — never
 *  overlapping, always reassembling to the input exactly. The caller decides
 *  how to render; this function knows nothing about React.
 */
export function linkMarks(text, index) {
  const s = String(text ?? "");
  if (!s || !(index instanceof Map) || index.size === 0) return [{ text: s }];
  const out = [];
  let last = 0;
  MARK_RE.lastIndex = 0;
  let m;
  while ((m = MARK_RE.exec(s))) {
    const citation = index.get(canon(m[0]));
    if (!citation) continue;
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ text: m[0], citation });
    last = m.index + m[0].length;
  }
  if (!out.length) return [{ text: s }];
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** What the chip's tooltip should say: the most specific thing we know about
 *  where this number came from. */
export function citeTitle(c) {
  if (!c) return "";
  const bits = [];
  if (c.table_title) bits.push(String(c.table_title));
  if (c.column) bits.push(`${c.column}${c.value ? ` = ${c.value}` : ""}`);
  else if (c.value) bits.push(String(c.value));
  if (c.sheetLabel) bits.push(String(c.sheetLabel));
  return bits.length
    ? `${bits.join(" · ")} — click to show it on the drawing`
    : "Click to show this on the drawing";
}
