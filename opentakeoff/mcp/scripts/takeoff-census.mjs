/**
 * TAKEOFF CENSUS — compile REAL takeoffs across many documents and record
 * every bug signature, so fixing is driven by what breaks at scale instead
 * of by whichever document someone happened to open.
 *
 * Why this exists: the corpus eval scores 7 sets whose ground-truth keys are
 * SCOPED to what the pipeline already finds ("every equipment-kind schedule
 * row sheetGraph() finds in …", bessemer.takeoff.csv's own header). That
 * measures precision on found tables and structurally cannot see a table
 * never found — the exact shape of GOAL.md rule 18, where 16 real rows were
 * dropped with zero disclosure while every eval read 100%. Running the real
 * compiler over many real documents and cataloguing what comes out is the
 * cheapest way to see the failures the eval is blind to.
 *
 *   node --import tsx scripts/takeoff-census.mjs <list.txt> <outDir> [--pages N]
 *
 * <list.txt> is one absolute PDF path per line. Default is a WHOLE-document
 * takeoff — the real thing, exercising cross-sheet plan sweep and symbol
 * matching. --pages N instead page-scores and qpdf-extracts the N most
 * schedule-dense pages first, for documents the ledger records as never
 * finishing whole; results are labelled `scope: "pages"` so a page-scoped
 * run is never silently compared against a whole-document one.
 *
 * Each document is loaded ONCE and all four kinds compile off the SAME
 * graph — building the graph per kind (what the per-kind CLI does) is 4x the
 * work for identical output.
 *
 * Writes incrementally after every document: this corpus contains sets that
 * never finish in a normal session, so a long run WILL be interrupted, and a
 * partial census is still worth everything it collected.
 */
import { openPdf } from "../src/pdf.ts";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

const listFile = process.argv[2];
const outDir = process.argv[3];
const pagesIdx = process.argv.indexOf("--pages");
const MAX_PAGES = pagesIdx >= 0 ? Number(process.argv[pagesIdx + 1]) : 0;
if (!listFile || !outDir) {
  console.error("usage: takeoff-census.mjs <list.txt> <outDir> [--pages N]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const tmp = join(outDir, "_extracts");
mkdirSync(tmp, { recursive: true });
const rawDir = join(outDir, "raw");
mkdirSync(rawDir, { recursive: true });
const graphDir = join(outDir, "graphs");
mkdirSync(graphDir, { recursive: true });

const KINDS = ["hvac_equipment", "control_valves", "bas_points", "sequences"];
const pdfs = readFileSync(listFile, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);

/** Every item a compiled takeoff emitted, flattened out of whichever shape
 * that kind uses (categories[].items for equipment/valves, lines/items for
 * the others) — the detectors below all ask questions about ITEMS. */
function itemsOf(t) {
  const out = [];
  for (const [cat, v] of Object.entries(t?.categories || {})) {
    for (const i of v?.items || []) out.push({ ...i, _cat: cat });
  }
  for (const l of t?.lines || []) out.push(l);
  for (const l of t?.items || []) out.push(l);
  for (const L of t?.lists || []) for (const r of L?.rows || L?.items || []) out.push(r);
  return out;
}

const JUNK_TAG_RE = /^(TOTAL|TOTALS|NOTES?|REMARKS?|TYPE|SIZE|QTY\.?|QUANTITY|N\/?A|NONE|-{1,3}|—)$/i;

/** Structural bug signatures. Each returns a finding or null. Deliberately
 * shape-based (what does an emitted item LOOK like) rather than tied to any
 * document, tag or corpus id — a detector that fires on one named PDF would
 * be worthless for the goal these are collected for. */
const DETECTORS = [
  ["P1_ALL_QTY_1", (t, items) => {
    const qs = items.map((i) => i.quantity).filter((q) => q != null);
    return qs.length >= 2 && qs.every((q) => q === 1)
      ? `${qs.length} item(s), every quantity===1 — a printed QTY column, if present, was not read`
      : null;
  }],
  ["P2_NUMERIC_TAG", (t, items) => {
    const n = items.filter((i) => /^\d{1,3}$/.test(String(i.tag ?? "").trim()));
    return n.length ? `${n.length} item(s) keyed by a bare number — row key fell back to a count column: ${JSON.stringify([...new Set(n.map((i) => i.tag))].slice(0, 8))}` : null;
  }],
  ["JUNK_TAG", (t, items) => {
    const j = items.filter((i) => JUNK_TAG_RE.test(String(i.tag ?? "").trim()));
    return j.length ? `${j.length} item(s) keyed by a column label or filler: ${JSON.stringify([...new Set(j.map((i) => i.tag))].slice(0, 8))}` : null;
  }],
  ["TITLE_AS_TAG", (t, items) => {
    const j = items.filter((i) => /\bSCHEDULE\b/i.test(String(i.tag ?? "")));
    return j.length ? `${j.length} item(s) whose tag contains "SCHEDULE" — a table title read as a row: ${JSON.stringify(j.map((i) => i.tag).slice(0, 4))}` : null;
  }],
  ["PROSE_AS_TAG", (t, items) => {
    const j = items.filter((i) => String(i.tag ?? "").trim().length > 40);
    return j.length ? `${j.length} item(s) with a >40-char tag — prose banded into a key column: ${JSON.stringify(j.map((i) => String(i.tag).slice(0, 60)).slice(0, 3))}` : null;
  }],
  ["UNGROUNDED_ITEM", (t, items) => {
    const j = items.filter((i) => !i.bbox_px && !i.bbox && !i.evidence);
    return j.length ? `${j.length}/${items.length} item(s) carry no bbox/evidence — GOAL.md requires every takeoff be cite-backed to sheet+bbox` : null;
  }],
  ["SCHEDULES_BUT_NO_ITEMS", (t, items) => {
    // Only a title PLAUSIBLY in this kind's scope counts. A control-valve
    // takeoff emitting nothing against DOOR AND FRAME / Window / ROOM FINISH
    // schedules is behaving CORRECTLY — counting that as a bug buries the real
    // ones in noise (observed on this census's own first 5 documents).
    const RELEVANT = {
      hvac_equipment: /(AHU|RTU|VAV|FAN|PUMP|BOILER|CHILLER|HEATER|COIL|SPLIT|CONDENS|HANDL|EQUIPMENT|SILENCER|LOUVER|GRILLE|REGISTER|DIFFUSER|TERMINAL|RECOVERY|TOWER|EXCHANGER)/i,
      control_valves: /(VALVE|DAMPER|ACTUATOR)/i,
      bas_points: /(POINT|DDC|BAS|BMS)/i,
      sequences: /(SEQUENCE|OPERATION)/i,
    };
    const re = RELEVANT[t && t.kind] || null;
    const titles = (t?.page_accounting?.pages || []).flatMap((p) => p.titles || []);
    const relevant = re ? titles.filter((x) => re.test(String(x))) : titles;
    return relevant.length && !items.length
      ? relevant.length + " title(s) IN THIS KIND'S SCOPE accounted for, 0 takeoff items: " + JSON.stringify(relevant.slice(0, 5)) : null;
  }],
  ["PROSE_AS_TITLE", (t) => {
    // A "schedule title" that is really a sentence fragment. Real, found on
    // this census's own first 5 documents: page_accounting recorded
    // "CONSTRUCTION DOCUMENTS AND THE SITE CONDITIONS." and "AND A ..." as
    // schedule titles. Same family as the title misreads in GOAL.md rule 18.
    const titles = [...new Set((t?.page_accounting?.pages || []).flatMap((p) => p.titles || []))];
    const prose = titles.filter((x) => {
      const s2 = String(x).trim();
      return /\.$/.test(s2) || /^(AND|OR|THE|OF|WITH|FOR|TO|IN|A)\b/i.test(s2) || s2.split(/\s+/).length > 9;
    });
    return prose.length ? prose.length + ' accounted "schedule title(s)" are prose fragments: ' + JSON.stringify(prose.slice(0, 4)) : null;
  }],
  ["DUP_TAG_ACROSS_CATEGORIES", (t, items) => {
    const seen = new Map();
    for (const i of items) {
      const k = String(i.tag ?? "").trim();
      if (!k || !i._cat) continue;
      if (!seen.has(k)) seen.set(k, new Set());
      seen.get(k).add(i._cat);
    }
    const dup = [...seen].filter(([, c]) => c.size > 1);
    return dup.length ? `${dup.length} tag(s) counted under 2+ categories: ${JSON.stringify(dup.slice(0, 5).map(([k, c]) => `${k}:${[...c].join("/")}`))}` : null;
  }],
  ["DUP_TAG_WITHIN_CATEGORY", (t, items) => {
    const cnt = new Map();
    for (const i of items) {
      const k = `${i._cat ?? ""}|${String(i.tag ?? "").trim()}`;
      if (!String(i.tag ?? "").trim()) continue;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
    const dup = [...cnt].filter(([, n]) => n > 1);
    return dup.length ? `${dup.length} tag(s) emitted more than once inside one category: ${JSON.stringify(dup.slice(0, 5))}` : null;
  }],
  ["COUNT_ITEMS_MISMATCH", (t, items) => {
    const bad = Object.entries(t?.categories || {})
      .filter(([, v]) => (v?.count ?? 0) !== (v?.items || []).length);
    return bad.length ? `${bad.length} category(ies) whose count disagrees with its own items[]: ${JSON.stringify(bad.slice(0, 5).map(([k, v]) => `${k}: count=${v.count} items=${(v.items || []).length}`))}` : null;
  }],
];

const census = [];
const findings = [];

for (const pdf of pdfs) {
  const name = basename(pdf).replace(/\.pdf$/i, "");
  const rec = { pdf: name, path: pdf, scope: MAX_PAGES ? "pages" : "whole", pages: null, ms: {}, kinds: {}, error: null };
  const t0 = Date.now();
  try {
    let target = pdf;
    if (MAX_PAGES) {
      const doc = await openPdf(pdf);
      const scored = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const pg = await doc.page(p);
        const txt = (pg.textContent?.items || []).map((i) => i.str || "").join(" ");
        const n = (txt.match(/\bSCHEDULE\b/gi) || []).length;
        if (n) scored.push({ p, n });
        pg.cleanup?.();
      }
      await doc.destroy();
      scored.sort((a, b) => b.n - a.n || a.p - b.p);
      const hits = scored.slice(0, MAX_PAGES).map((s) => s.p).sort((a, b) => a - b);
      if (!hits.length) { rec.error = "no schedule pages"; census.push(rec); continue; }
      rec.pages = hits;
      target = `${tmp}/${name}__pages.pdf`;
      if (existsSync(target)) rmSync(target);
      execFileSync("qpdf", [pdf, "--pages", ".", hits.join(","), "--", target]);
    }

    const session = new Session();
    await session.loadPlan(target);
    const graph = await session.graphForPipeline();
    rec.ms.graph = Date.now() - t0;
    rec.sheet_count = graph?.sheets?.length ?? 0;
    rec.table_count = graph?.tables?.length ?? 0;
    rec.table_titles = (graph?.tables || []).map((x) => (typeof x.title === "object" && x.title ? x.title.text : x.title) ?? null);
    // Persist the SHEET GRAPH itself — the compiler's real input. compileCorpusTakeoff
    // runs from a graph alone (sheetRecords' own "no Session present" path), so a
    // committed graph per document lets an agent with NO access to the PDFs — the
    // bulk corpus exists on exactly one machine — compile and census all 90
    // documents anyway. Graphs are 10-140KB; the whole corpus is a few MB. Any
    // graph is a pipeline OUTPUT and is never ground truth; it is a fixture for
    // testing what the compiler does with what extraction produced.
    writeFileSync(join(graphDir, name + ".graph.json"), JSON.stringify(graph));

    for (const kind of KINDS) {
      const k0 = Date.now();
      try {
        const t = compileCorpusTakeoff(session, graph, kind);
        const items = itemsOf(t);
        // Persist the WHOLE compiled takeoff. Detectors get better as the
        // catalogue grows (the first pass already produced one false-positive
        // class and missed a real one), and recompiling 90 documents just to
        // re-ask a question is not affordable — re-analysis has to be offline.
        writeFileSync(join(rawDir, name + "__" + kind + ".json"), JSON.stringify(t));
        rec.kinds[kind] = {
          ok: true, items: items.length, totals: t?.totals ?? null,
          categories_nonzero: Object.entries(t?.categories || {}).filter(([, v]) => (v?.count ?? 0) > 0).map(([k2, v]) => `${k2}=${v.count}`),
          sample: items.slice(0, 5).map((i) => ({ tag: i.tag ?? null, qty: i.quantity ?? null, cat: i._cat ?? null })),
        };
        for (const [code, fn] of DETECTORS) {
          let detail = null;
          try { detail = fn(t, items); } catch (e) { detail = `detector threw: ${String(e?.message || e)}`; }
          if (detail) findings.push({ code, pdf: name, kind, scope: rec.scope, detail });
        }
      } catch (e) {
        rec.kinds[kind] = { ok: false, error: String(e?.message || e).slice(0, 400) };
        findings.push({ code: "COMPILE_THREW", pdf: name, kind, scope: rec.scope, detail: String(e?.message || e).slice(0, 400) });
      }
      rec.ms[kind] = Date.now() - k0;
    }
    if (!rec.table_count) findings.push({ code: "NO_TABLES_AT_ALL", pdf: name, kind: "-", scope: rec.scope, detail: `graph built ${rec.sheet_count} sheet(s) and found zero tables` });
  } catch (e) {
    rec.error = String(e?.message || e).slice(0, 400);
    findings.push({ code: "DOCUMENT_FAILED", pdf: name, kind: "-", scope: rec.scope, detail: rec.error });
  }
  rec.ms.total = Date.now() - t0;
  census.push(rec);
  writeFileSync(join(outDir, "census.json"), JSON.stringify(census, null, 2));
  writeFileSync(join(outDir, "findings.json"), JSON.stringify(findings, null, 2));
  const codes = [...new Set(findings.filter((f) => f.pdf === name).map((f) => f.code))];
  console.error(`done ${name}: ${rec.table_count ?? "?"} tables, ${Math.round(rec.ms.total / 1000)}s${codes.length ? " | " + codes.join(",") : ""}${rec.error ? " ERR:" + rec.error : ""}`);
}
console.error(`\ncensus: ${census.length} document(s), ${findings.length} finding(s) -> ${outDir}`);
