/**
 * Fast valve-content audit: extract PDF text with pdfjs and scan for schedule
 * / valve signals. Does NOT load Session graphs — answers "does the PDF mention
 * valve schedules?" in minutes, not hours.
 *
 *   node --import tsx scripts/pillarCValvePdfTextScan.mjs
 */
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const census = JSON.parse(readFileSync(resolve(CORPUS, "takeoffs/pillar-c-census.json"), "utf8"));
const valveIds = new Set(census.valve_bearing_names || []);
const printedIds = new Set(census.valve_with_printed_ids || []);

const PATTERNS = [
  { id: "valve_schedule", re: /\bVALVE\s+SCHEDULE\b/i, weight: 3 },
  { id: "chw_control_valve", re: /\bCHW\b.{0,20}\bCONTROL\s+VALVE\b|\bCONTROL\s+VALVE\b.{0,20}\bCHW\b|\bCHW\s+CONTROL\s+VALVE\s+SCHEDULE\b/i, weight: 3 },
  { id: "hhw_control_valve", re: /\bHHW\b.{0,20}\bCONTROL\s+VALVE\b|\bHOT\s+WATER\b.{0,20}\bCONTROL\s+VALVE\b|\bHHW\s+CONTROL\s+VALVE\s+SCHEDULE\b/i, weight: 3 },
  { id: "isolation_valve", re: /\bISOLATION\s+VALVE\b/i, weight: 2 },
  { id: "control_valve_phrase", re: /\bCONTROL\s+VALVE\b/i, weight: 2 },
  { id: "damper_schedule", re: /\bDAMPER\s+SCHEDULE\b|\bCONTROL\s+DAMPER\b|\bMOTORIZED\s+DAMPER\b/i, weight: 2 },
  { id: "valve_mark_col", re: /\bVALVE\s+MARK\b/i, weight: 2 },
  { id: "generic_valve_word", re: /\bVALVE\b/i, weight: 1 },
  { id: "generic_damper_word", re: /\bDAMPER\b/i, weight: 1 },
];

function compileKeys() {
  return readdirSync(CROSS)
    .filter((f) => f.endsWith(".compile.json"))
    .map((f) => JSON.parse(readFileSync(resolve(CROSS, f), "utf8")))
    .filter((k) => valveIds.has(k.set_id));
}

function pdfPath(key) {
  const rel = key.source_file || "";
  const direct = resolve(CORPUS, rel);
  if (existsSync(direct)) return direct;
  const partsDir = key.source_parts_dir ? resolve(CORPUS, key.source_parts_dir) : null;
  if (partsDir && existsSync(partsDir)) {
    const pdfs = readdirSync(partsDir).filter((f) => f.endsWith(".pdf"));
    if (pdfs.length === 1) return resolve(partsDir, pdfs[0]);
    if (pdfs.length > 1) return resolve(partsDir, pdfs[0]);
  }
  return direct;
}

async function extractPdfText(path, maxPages = 0) {
  const data = new Uint8Array(readFileSync(path));
  const doc = await getDocument({ data, useSystemFonts: true, disableFontFace: true }).promise;
  const n = maxPages > 0 ? Math.min(maxPages, doc.numPages) : doc.numPages;
  const pages = [];
  let all = "";
  for (let p = 1; p <= n; p += 1) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join(" ");
    pages.push({ page: p, text });
    all += `\n${text}`;
  }
  await doc.destroy();
  return { pages: n, text: all };
}

function scanText(text) {
  const hits = {};
  let score = 0;
  for (const p of PATTERNS) {
    if (p.re.test(text)) {
      hits[p.id] = true;
      score += p.weight;
    }
  }
  const tier = hits.valve_schedule || hits.chw_control_valve || hits.hhw_control_valve
    ? "tabular_valve_schedule_likely"
    : hits.isolation_valve || hits.control_valve_phrase || hits.damper_schedule || hits.valve_mark_col
      ? "valve_damper_signal"
      : hits.generic_valve_word || hits.generic_damper_word
        ? "generic_valve_damper_mention"
        : "no_valve_text";
  return { hits: Object.keys(hits), score, tier };
}

function sampleSnippets(text, re, limit = 2) {
  const out = [];
  const parts = text.split(/\s{2,}|\n/);
  for (const part of parts) {
    if (re.test(part) && part.trim().length > 8) {
      out.push(part.trim().slice(0, 140));
      if (out.length >= limit) break;
    }
  }
  return out;
}

const keys = compileKeys();
const started = performance.now();
const results = [];
const skipped = [];

for (const key of keys) {
  const path = pdfPath(key);
  if (!existsSync(path)) {
    skipped.push({ set_id: key.set_id, skip: "pdf_missing", path });
    continue;
  }
  try {
    const t0 = performance.now();
    const { pages, text } = await extractPdfText(path);
    const scan = scanText(text);
    const compileItems = key.control_valves?.items ?? 0;
    results.push({
      set_id: key.set_id,
      pdf: path.replace(`${CORPUS}/`, ""),
      pages,
      ms: Math.round(performance.now() - t0),
      compile_items: compileItems,
      compile_empty: compileItems === 0,
      printed_key: printedIds.has(key.set_id),
      ...scan,
      snippets: scan.tier !== "no_valve_text"
        ? sampleSnippets(text, /\bVALVE\b|\bDAMPER\b|\bCONTROL\s+VALVE\b/i)
        : [],
    });
  } catch (err) {
    skipped.push({ set_id: key.set_id, skip: String(err?.message || err), path });
  }
}

const compileEmpty = results.filter((r) => r.compile_empty);
const pdfNoTabular = compileEmpty.filter((r) => r.tier === "no_valve_text" || r.tier === "generic_valve_damper_mention");
const pdfHasScheduleSignal = compileEmpty.filter((r) => r.tier === "tabular_valve_schedule_likely" || r.tier === "valve_damper_signal");
const printedMismatch = results.filter((r) => r.printed_key && r.tier === "no_valve_text");
const extractGap = results.filter((r) => r.compile_empty && (r.tier === "tabular_valve_schedule_likely" || r.tier === "valve_damper_signal"));

const out = {
  as_of: new Date().toISOString(),
  note: "Fast PDF text scan — not vision/OCR; finds printed text layers only",
  ms_total: Math.round(performance.now() - started),
  n: results.length,
  skipped_n: skipped.length,
  compile_printed: results.filter((r) => !r.compile_empty).length,
  compile_empty: compileEmpty.length,
  pdf_tiers: {
    tabular_valve_schedule_likely: results.filter((r) => r.tier === "tabular_valve_schedule_likely").length,
    valve_damper_signal: results.filter((r) => r.tier === "valve_damper_signal").length,
    generic_valve_damper_mention: results.filter((r) => r.tier === "generic_valve_damper_mention").length,
    no_valve_text: results.filter((r) => r.tier === "no_valve_text").length,
  },
  compile_empty_breakdown: {
    pdf_no_tabular_signal: pdfNoTabular.length,
    pdf_has_valve_signal_but_compile_zero: pdfHasScheduleSignal.length,
  },
  likely_extraction_gaps: extractGap.map((r) => ({
    set_id: r.set_id,
    tier: r.tier,
    hits: r.hits,
    snippets: r.snippets,
    notes: compileKeys().find((k) => k.set_id === r.set_id)?.notes?.slice(0, 100),
  })),
  results,
  skipped,
};

const outPath = "/opt/cursor/artifacts/pillar-c-valve-pdf-text-scan-all.json";
writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({
  artifact: outPath,
  ms_total: out.ms_total,
  compile_empty: out.compile_empty,
  compile_empty_pdf_has_signal: out.compile_empty_breakdown.pdf_has_valve_signal_but_compile_zero,
  extraction_gaps: out.likely_extraction_gaps.length,
  tiers: out.pdf_tiers,
}, null, 2));
