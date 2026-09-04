/**
 * Corpus regression sweep — the before/after harness GOAL.md's own mandate
 * calls for before touching shared, high-blast-radius extraction code
 * (`sheetgraph.ts`'s header/anchor/row-banding spine), where this file
 * already records a real precedent of a locally-correct fix silently
 * breaking a different real table elsewhere in the corpus.
 *
 * Why it is fast enough to actually run: several of this corpus's real sets
 * take many minutes to cold-build whole, and some never finish in a normal
 * session (VERIFICATION_LEDGER.md records two such sets) — which is exactly
 * why the highest-severity rules sat unconfirmed for multiple sessions. So
 * this does NOT build whole documents. It scores each page by schedule-word
 * DENSITY (a cover/index page names "SCHEDULE" once; a real schedule sheet
 * repeats it per table), takes that document's top pages, extracts only
 * those with qpdf, and builds the REAL production Session + ODL graph on the
 * small extract. Verified faithful on a real set: 004_MO_T2504_03's own
 * page-extract yields the same 14 tables, same titles, as its full-document
 * build — seconds instead of minutes.
 *
 * Emits a normalized per-table summary (sheet, title, headers, row keys),
 * sorted for stable diffing. Run it once on clean code, once with the change
 * applied, and diff the two JSON files: every real difference is either the
 * intended fix or a regression that has to be explained before shipping.
 *
 *   node --import tsx scripts/corpus-regression-sweep.mjs <list.txt> <out.json>
 *
 * <list.txt> is one absolute PDF path per line. MAX_PAGES (default 4) caps
 * pages per document — keep it identical across both runs or the diff is
 * meaningless.
 */
import { openPdf } from "../src/pdf.ts";
import { Session } from "../src/session.ts";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { basename } from "node:path";

const listFile = process.argv[2];
const outFile = process.argv[3];
const MAX_PAGES = Number(process.env.MAX_PAGES || 4);
const pdfs = (await import("node:fs")).readFileSync(listFile, "utf8").split("\n").map(s => s.trim()).filter(Boolean);

const tmp = "/tmp/r29-sweep";
mkdirSync(tmp, { recursive: true });

const results = [];
for (const pdf of pdfs) {
  const name = basename(pdf).replace(/\.pdf$/i, "");
  const rec = { pdf: name, pages: [], tables: [], error: null };
  try {
    // cheap text scan: which pages actually carry a schedule?
    const doc = await openPdf(pdf);
    const scored = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const pg = await doc.page(p);
      const txt = (pg.textContent?.items || []).map(i => i.str || "").join(" ");
      const n = (txt.match(/\bSCHEDULE\b/gi) || []).length;
      if (n) scored.push({ p, n });
      pg.cleanup?.();
    }
    scored.sort((a, b) => b.n - a.n || a.p - b.p);
    const hits = scored.slice(0, MAX_PAGES).map(s => s.p).sort((a, b) => a - b);
    await doc.destroy();
    if (!hits.length) { rec.error = "no schedule pages"; results.push(rec); continue; }
    rec.pages = hits;

    const ex = `${tmp}/${name}__pages.pdf`;
    if (existsSync(ex)) rmSync(ex);
    execFileSync("qpdf", [pdf, "--pages", ".", hits.join(","), "--", ex]);

    const session = new Session();
    await session.loadPlan(ex);
    const graph = await session.graphForPipeline();
    for (const t of graph?.tables || []) {
      const title = typeof t.title === "object" && t.title ? t.title.text : t.title;
      rec.tables.push({
        sheet: t.sheet, title: title ?? null,
        headers: t.headers || [],
        rowKeys: (t.rows || []).map(r => r.key),
      });
    }
    rec.tables.sort((a, b) => `${a.sheet}|${a.title}`.localeCompare(`${b.sheet}|${b.title}`));
  } catch (e) {
    rec.error = String(e?.message || e).slice(0, 300);
  }
  results.push(rec);
  console.error(`done ${name}: ${rec.tables.length} tables${rec.error ? " ERR:" + rec.error : ""}`);
}
writeFileSync(outFile, JSON.stringify(results, null, 2));
console.error(`wrote ${outFile}`);
