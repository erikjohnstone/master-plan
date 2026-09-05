/**
 * TABLES-FOUND CENSUS — a cheap, bounded before/after instrument for changes
 * to the text-layer table extractor.
 *
 * The full takeoff census (takeoff-census.mjs) runs the whole Session/ODL/
 * vector stack per document — minutes to hours each, so a 117-document
 * before/after is not a thing you run twice in a session. But the extraction
 * changes this measures live entirely in buildSheetGraph's own text-layer
 * path, so the expensive layers are not needed to see their effect: pull each
 * page's text spans once (a single pdf.js pass) and run buildSheetGraph over
 * them directly.
 *
 * Reports, per document: pages, tables found, titled tables, total rows —
 * plus the corpus totals. Run it on the pre-fix tree and the post-fix tree and
 * diff the JSON to get a real delta rather than a claim.
 *
 *   node --import tsx scripts/tables-found-census.mjs <out.json> [--limit N] [--pdf-list file]
 */
import { openPdf, textSpans } from "../src/pdf.ts";
import { buildSheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const outPath = process.argv[2];
if (!outPath) { console.error("usage: tables-found-census.mjs <out.json> [--limit N] [--pdf-list file]"); process.exit(2); }
const limIdx = process.argv.indexOf("--limit");
const LIMIT = limIdx >= 0 ? Number(process.argv[limIdx + 1]) : 0;
const listIdx = process.argv.indexOf("--pdf-list");

const CORPUS = "/home/user/master-plan/opentakeoff-corpus";
const BULK = [
  join(CORPUS, "bulk/HVAC_BAS_Plan_Sets"),
  join(CORPUS, "bulk/HVAC_BAS_Plan_Sets_Vol2"),
];

let pdfs;
if (listIdx >= 0) {
  pdfs = readFileSync(process.argv[listIdx + 1], "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
} else {
  pdfs = [];
  for (const dir of BULK) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) if (/\.pdf$/i.test(f)) pdfs.push(join(dir, f));
  }
  pdfs.sort();
}
if (LIMIT > 0) pdfs = pdfs.slice(0, LIMIT);

const docs = [];
let totals = { pages: 0, tables: 0, titled: 0, rows: 0, failed: 0 };
for (const pdf of pdfs) {
  const id = basename(pdf).replace(/\.pdf$/i, "");
  const rec = { id, pages: 0, tables: 0, titled: 0, rows: 0, error: null };
  try {
    const doc = await openPdf(pdf);
    for (let p = 1; ; p++) {
      let ph;
      try { ph = await doc.page(p); } catch { break; }
      if (!ph) break;
      const spans = textSpans(ph).map((t) => ({ str: t.str, x: t.x0, y: t.y0, w: t.x1 - t.x0, h: t.y1 - t.y0, ...(t.rot ? { rot: t.rot } : {}) }));
      rec.pages++;
      if (!spans.length) continue;
      const g = buildSheetGraph([{ key: `${id}#${p}`, sheet_number: null, spans }]);
      for (const t of g.tables || []) {
        rec.tables++;
        if (String(t.title?.text || "").trim()) rec.titled++;
        rec.rows += (t.rows || []).length;
      }
      ph.cleanup?.();
    }
  } catch (e) {
    rec.error = String(e?.message || e).slice(0, 200);
    totals.failed++;
  }
  docs.push(rec);
  totals.pages += rec.pages; totals.tables += rec.tables; totals.titled += rec.titled; totals.rows += rec.rows;
  console.error(`${id}: pages=${rec.pages} tables=${rec.tables} titled=${rec.titled} rows=${rec.rows}${rec.error ? " ERROR " + rec.error : ""}`);
}

writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), doc_count: docs.length, totals, docs }, null, 2));
console.error(`\nTOTALS  docs=${docs.length} pages=${totals.pages} tables=${totals.tables} titled=${totals.titled} rows=${totals.rows} failed=${totals.failed}`);
console.error(`wrote ${outPath}`);
