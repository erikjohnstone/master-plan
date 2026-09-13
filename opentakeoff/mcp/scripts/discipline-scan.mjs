/**
 * DISCIPLINE SCAN — which trade-schedule vocabulary appears in each
 * document's own text layer, text spans only (pdf.js, no graph build) —
 * same speed class as tables-found-census.mjs, built for the same reason:
 * findsheets.py (pdfplumber) measured at 6-12 SECONDS PER PAGE on this
 * corpus's own CAD-dense pages, infeasible across the real 113-document
 * population. Feeds bakeoff/draw_heldout.py's own stratification —
 * goal VECTORGRID_TABLE_BOXES.md's held-out split must be stratified by
 * discipline, and this is where that per-document signal comes from.
 *
 *   node --import tsx scripts/discipline-scan.mjs <doc-list.txt> > out.json
 *
 * <doc-list.txt>: one PDF path per line, relative to opentakeoff-corpus/
 * (reports/REAL_DOCUMENT_LIST-2026-09-13.txt is the real, deduplicated
 * population this was run against — see that file's own header for why
 * it is not a naive `find *.pdf`).
 */
import { openPdf, textSpans } from "../src/pdf.ts";
import { readFileSync } from "node:fs";

const CORPUS = "/home/user/master-plan/opentakeoff-corpus";
const list = readFileSync(process.argv[2], "utf8").split(/\r?\n/).map(l => l.trim()).filter(Boolean);

const SIGNALS = {
  hvac_mech: /\b(HVAC|MECHANICAL|AIR HANDL|BOILER|CHILLER|PUMP|FAN|DUCT|DIFFUSER|GRILLE|VAV|AHU|RTU|CONDENS|REFRIGERANT|DAMPER|LOUVER|RADIAT)\b/,
  bas_controls: /\b(BAS |BMS |DDC|POINTS? LIST|CONTROLS? (NARRATIVE|SEQUENCE)|SEQUENCE OF OPERATION|I\/O LIST)\b/,
  electrical: /\b(ELECTRICAL|PANEL SCHEDULE|PANELBOARD|LIGHTING|CIRCUIT|LOAD SCHEDULE|TRANSFORMER|SWITCHGEAR|CIRCUIT BREAKER)\b/,
  plumbing: /\b(PLUMBING|FIXTURE SCHEDULE|WATER HEATER SCHEDULE|SANITARY|DOMESTIC WATER|BACKFLOW|GREASE (TRAP|INTERCEPTOR))\b/,
  structural: /\b(STRUCTURAL|FRAMING|FOUNDATION|BEAM SCHEDULE|COLUMN SCHEDULE|FOOTING SCHEDULE|REBAR)\b/,
  architectural: /\b(DOOR SCHEDULE|WINDOW SCHEDULE|FINISH SCHEDULE|ROOM FINISH|PARTITION TYPE|HARDWARE SCHEDULE)\b/,
};

const out = [];
for (const rel of list) {
  const pdf = `${CORPUS}/${rel}`;
  const id = rel.split("/").pop().replace(/\.pdf$/i, "");
  const hits = Object.fromEntries(Object.keys(SIGNALS).map(k => [k, 0]));
  try {
    const doc = await openPdf(pdf);
    for (let p = 1; p <= doc.numPages; p++) {
      const ph = await doc.page(p);
      const spans = textSpans(ph);
      for (const sp of spans) {
        const t = (sp.str || "").toUpperCase();
        if (t.length < 6 || t.length > 100) continue;
        for (const [k, re] of Object.entries(SIGNALS)) if (re.test(t)) hits[k]++;
      }
      ph.cleanup();
    }
    await doc.destroy();
  } catch (e) {
    console.error(`  !! ${id}: ${e.message}`);
  }
  out.push({ id, rel, ...hits });
  console.error(`${id.slice(0,50).padEnd(50)} ${JSON.stringify(hits)}`);
}
console.log(JSON.stringify(out, null, 2));
