/**
 * RECALL-GAP SCAN — a cheap, corpus-wide proxy for "tables the pipeline never
 * found at all", to aim the expensive part (authoring real recall keys by
 * rendering and reading sheets) at the documents that actually have misses.
 *
 * WHY THIS PROXY IS LEGITIMATE, AND WHERE IT IS NOT
 * ------------------------------------------------
 * Every key in this corpus except `*.tables.csv` is scoped to tables the
 * pipeline already found, so `corpus-eval` measures precision and is
 * structurally blind to recall (see TAKEOFF_BUG_CATALOGUE.md's own opening).
 * The recall tier fixes that, but authoring its keys means rendering sheets
 * and reading them by eye — real work, and not something to spend blind.
 *
 * The two real misses measured on bessemer (PLUMBING FIXTURE SCHEDULE on #2,
 * VENTILATION CALCULATION SCHEDULE on #8) share a shape: the table's TITLE is
 * plainly present in the raw text layer, and no extracted table carries it.
 * The failure is in table CONSTRUCTION, downstream of the text. So scanning
 * raw spans for title-shaped "… SCHEDULE / … LIST" text and subtracting the
 * titles buildSheetGraph actually produced finds that shape corpus-wide for
 * the cost of one text pass per page.
 *
 * What it CANNOT see, stated plainly so no one reads the number as complete:
 *   - a schedule whose printed title contains neither SCHEDULE nor LIST
 *   - a schedule with no title at all (bessemer's own graph carries several)
 *   - a table drawn as an image (no text layer)
 * So a candidate count here is a FLOOR on real misses, never a total, and
 * every candidate is a lead to confirm by eye — a "SEE MECHANICAL SCHEDULE"
 * cross-reference and a legend entry both look like this from the text alone.
 *
 *   node --import tsx scripts/recall-gap-scan.mjs <out.json> [--limit N]
 */
import { openPdf, textSpans } from "../src/pdf.ts";
import { buildSheetGraph } from "../../web/src/lib/sheetgraph.ts";
import { writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const outPath = process.argv[2];
if (!outPath) { console.error("usage: recall-gap-scan.mjs <out.json> [--limit N]"); process.exit(2); }
const limIdx = process.argv.indexOf("--limit");
const LIMIT = limIdx >= 0 ? Number(process.argv[limIdx + 1]) : 0;

const CORPUS = "/home/user/master-plan/opentakeoff-corpus";
const DIRS = [join(CORPUS, "bulk/HVAC_BAS_Plan_Sets"), join(CORPUS, "bulk/HVAC_BAS_Plan_Sets_Vol2")];

let pdfs = [];
for (const dir of DIRS) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) if (/\.pdf$/i.test(f)) pdfs.push(join(dir, f));
}
pdfs.sort();
if (LIMIT > 0) pdfs = pdfs.slice(0, LIMIT);

const norm = (s) => String(s || "").toUpperCase().replace(/\s+/g, " ").trim();
// A printed TABLE CAPTION, not a running-text mention. Cross-references are
// the dominant false positive ("SEE ... SCHEDULE", "PER SCHEDULE", "REFER TO"),
// so they are excluded by shape here and the rest are confirmed by eye.
const TITLEISH = /\b(SCHEDULE|LIST|MATRIX)\b/;
const CROSSREF = /\b(SEE|REFER|PER|NOTED|SHOWN|AS INDICATED|COORDINATE)\b/;

const docs = [];
let totals = { pages: 0, extracted: 0, candidates: 0, docsWithGaps: 0 };

for (const pdf of pdfs) {
  const id = basename(pdf).replace(/\.pdf$/i, "");
  const rec = { id, pages: 0, extracted_titles: 0, candidates: [], error: null };
  try {
    const doc = await openPdf(pdf);
    for (let p = 1; ; p++) {
      let ph;
      try { ph = await doc.page(p); } catch { break; }
      if (!ph) break;
      const raw = textSpans(ph);
      rec.pages++;
      if (!raw.length) { ph.cleanup?.(); continue; }
      const spans = raw.map((t) => ({ str: t.str, x: t.x0, y: t.y0, w: t.x1 - t.x0, h: t.y1 - t.y0, ...(t.rot ? { rot: t.rot } : {}) }));
      const heights = spans.map((s) => s.h).sort((a, b) => a - b);
      const medH = heights[heights.length >> 1] || 8;

      const g = buildSheetGraph([{ key: `${id}#${p}`, sheet_number: null, spans }]);
      const found = new Set((g.tables || []).map((t) => norm(t.title?.text)).filter(Boolean));
      rec.extracted_titles += found.size;

      for (const s of spans) {
        const t = norm(s.str);
        if (!TITLEISH.test(t) || CROSSREF.test(t)) continue;
        if (t.split(/\s+/).length > 9) continue;          // a sentence, not a caption
        if (s.h < medH * 1.15) continue;                  // a caption is drawn larger than body text
        if (found.has(t)) continue;                       // the pipeline built this one
        // …and not merely a fragment of a title it did build
        if ([...found].some((f) => f.includes(t) || t.includes(f))) continue;
        rec.candidates.push({ page: p, title: s.str.trim(), h: Math.round(s.h * 10) / 10, medH: Math.round(medH * 10) / 10, x: Math.round(s.x), y: Math.round(s.y) });
      }
      ph.cleanup?.();
    }
  } catch (e) {
    rec.error = String(e?.message || e).slice(0, 200);
  }
  totals.pages += rec.pages;
  totals.extracted += rec.extracted_titles;
  totals.candidates += rec.candidates.length;
  if (rec.candidates.length) totals.docsWithGaps++;
  docs.push(rec);
  console.error(`${id}: pages=${rec.pages} extracted_titles=${rec.extracted_titles} candidate_misses=${rec.candidates.length}${rec.error ? " ERROR " + rec.error : ""}`);
}

docs.sort((a, b) => b.candidates.length - a.candidates.length);
writeFileSync(outPath, JSON.stringify({ generated: new Date().toISOString(), totals, docs }, null, 2));
console.error(`\nTOTALS docs=${docs.length} pages=${totals.pages} extracted_titles=${totals.extracted} candidate_misses=${totals.candidates} docs_with_gaps=${totals.docsWithGaps}`);
console.error(`wrote ${outPath}`);
