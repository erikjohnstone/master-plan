/**
 * Diff two `corpus-regression-sweep.mjs` outputs — the other half of the
 * gate GOAL.md's platform mandate requires.
 *
 * The mandate is explicit that the corpus is the PROVING GROUND, not the
 * finish line: "a fix that only works because it recognizes a specific PDF,
 * tag, or corpus id is a regression against this goal even if it raises a
 * score." A single sweep over the documents a fix was DEVELOPED against
 * cannot show that — it can only show the fix didn't break them. So the
 * gate has two tiers, and both run before a sheetgraph change ships:
 *
 *   1. REGRESSION — sweep the documents already used for this work
 *      (scripts/…/sweeplist). Any LOST or CHANGED table must be explained.
 *   2. GENERALIZATION — sweep documents NOT used to find or tune the fix
 *      (everything else in the corpus: the rest of Vol2, all of Vol1,
 *      raw/). This is the tier that catches a fix which only worked
 *      because it was measured on the one document that motivated it.
 *      A GAINED table here is real evidence of generality; a LOST one is
 *      the fix failing the mandate.
 *
 * Run the sweep once on clean code and once with the change applied, then:
 *
 *   node --import tsx scripts/corpus-sweep-diff.mjs <base.json> <after.json>
 *
 * A table's identity is (sheet, title). Row keys compare as MULTISETS, so a
 * pure reordering is not reported as a change — only a real gain/loss of
 * rows is. `pages` mismatches are flagged loudly and make that document's
 * tables incomparable: the sweep's own page-scoring picked different pages
 * on the two runs (keep MAX_PAGES identical across runs).
 */
import { readFileSync } from "node:fs";

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error("usage: node --import tsx scripts/corpus-sweep-diff.mjs <base.json> <after.json>");
  process.exit(2);
}
const base = JSON.parse(readFileSync(a, "utf8"));
const after = JSON.parse(readFileSync(b, "utf8"));
const byPdf = (arr) => new Map(arr.map((r) => [r.pdf, r]));
const B = byPdf(base), A = byPdf(after);
const key = (t) => `${t.sheet}|${t.title ?? "(no title)"}`;
const bag = (xs) => { const m = new Map(); for (const x of xs) m.set(x, (m.get(x) || 0) + 1); return m; };
const bagEq = (x, y) => {
  const p = bag(x), q = bag(y);
  if (p.size !== q.size) return false;
  for (const [k, v] of p) if (q.get(k) !== v) return false;
  return true;
};

let gained = 0, lost = 0, changed = 0, docsTouched = 0, incomparable = 0;
for (const pdf of [...new Set([...B.keys(), ...A.keys()])].sort()) {
  const rb = B.get(pdf), ra = A.get(pdf);
  const lines = [];
  if ((rb?.error ?? null) !== (ra?.error ?? null)) {
    lines.push(`  ERROR   base=${JSON.stringify(rb?.error ?? null)} after=${JSON.stringify(ra?.error ?? null)}`);
  }
  if ((rb?.pages || []).join(",") !== (ra?.pages || []).join(",")) {
    lines.push(`  PAGES   base=${JSON.stringify(rb?.pages)} after=${JSON.stringify(ra?.pages)} — NOT COMPARABLE`);
    incomparable++;
  }
  const mb = new Map((rb?.tables || []).map((t) => [key(t), t]));
  const ma = new Map((ra?.tables || []).map((t) => [key(t), t]));
  for (const [k, t] of ma) {
    if (mb.has(k)) continue;
    lines.push(`  GAINED  ${k}  rows=${t.rowKeys.length}  hdr=${JSON.stringify(t.headers.slice(0, 6))}`);
    gained++;
  }
  for (const [k, t] of mb) {
    if (ma.has(k)) continue;
    lines.push(`  LOST    ${k}  rows=${t.rowKeys.length}  hdr=${JSON.stringify(t.headers.slice(0, 6))}`);
    lost++;
  }
  for (const [k, t] of ma) {
    const o = mb.get(k);
    if (!o) continue;
    const hdrSame = JSON.stringify(o.headers) === JSON.stringify(t.headers);
    const rowSame = bagEq(o.rowKeys, t.rowKeys);
    if (hdrSame && rowSame) continue;
    changed++;
    lines.push(`  CHANGED ${k}  rows ${o.rowKeys.length} -> ${t.rowKeys.length}`);
    if (!hdrSame) {
      lines.push(`      hdr-  ${JSON.stringify(o.headers)}`);
      lines.push(`      hdr+  ${JSON.stringify(t.headers)}`);
    }
    if (!rowSame) {
      const pb = bag(o.rowKeys), pa = bag(t.rowKeys);
      const only = (p, q) => [...p].filter(([k2, v]) => (q.get(k2) || 0) < v).map(([k2]) => k2);
      lines.push(`      rows- ${JSON.stringify(only(pb, pa).slice(0, 12))}`);
      lines.push(`      rows+ ${JSON.stringify(only(pa, pb).slice(0, 12))}`);
    }
  }
  if (lines.length) { docsTouched++; console.log(`\n### ${pdf}`); for (const l of lines) console.log(l); }
}
console.log(
  `\n==== ${docsTouched} document(s) differ — ${gained} gained, ${lost} lost, ${changed} changed` +
  `${incomparable ? `, ${incomparable} incomparable (page-selection drift)` : ""} ====`,
);
