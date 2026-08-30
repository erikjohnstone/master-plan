import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Tesseract from "tesseract.js";
import { Session } from "../src/session.ts";
import { cachedSheetGraph } from "./sheetGraphCache.mjs";
import { createHash } from "node:crypto";

const FAILURE_CLASSES = new Set([
  "RETRIEVAL",
  "PARSE",
  "VALUE",
  "CITE_FORM",
  "CITE_GROUND",
  "LATENCY",
  "REFUSAL",
]);

export function validateBbox(bbox, bounds) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) {
    return "bbox must contain four finite numbers";
  }
  const [x0, y0, x1, y1] = bbox;
  if (!(x1 > x0 && y1 > y0)) return "bbox must be non-degenerate";
  const [bx0, by0, bx1, by1] = bounds;
  if (x0 < bx0 || y0 < by0 || x1 > bx1 || y1 > by1) return "bbox is outside page bounds";
  return null;
}

export function overlapAgainstSmaller(a, b) {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  const intersection = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const area = (box) => Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
  return intersection / Math.max(1, Math.min(area(a), area(b)));
}

export function valueMatches(actual, expected, tolerance) {
  if (typeof expected === "number") {
    if (typeof actual !== "number" || !Number.isFinite(actual)) return false;
    const allowed = Number(tolerance);
    const epsilon = Number.EPSILON * Math.max(1, Math.abs(actual), Math.abs(expected)) * 4;
    return Math.abs(actual - expected) <= allowed + epsilon;
  }
  return typeof actual === "string" && actual === expected;
}

const compact = (value) => String(value)
  .normalize("NFKD")
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, "");

export function ocrGrounds(text, expectedText, { allowConfusables = false } = {}) {
  const haystack = compact(text);
  const needle = compact(expectedText);
  if (needle.length > 0 && haystack.includes(needle)) return true;
  if (!allowConfusables || needle.length < 3) return false;
  const canonical = (value) => value.replace(/[IL1]/g, "1");
  return canonical(haystack).includes(canonical(needle));
}

function citationsFor(spec) {
  if (Array.isArray(spec.citations)) return spec.citations;
  return spec.citation ? [spec.citation] : [];
}

function synthesizeTruthRun(truth) {
  return {
    schema_version: 1,
    demo_id: truth.demo_id,
    status: "done",
    latency_ms: 0,
    answer: Object.fromEntries(Object.entries(truth.expected).map(([name, spec]) => [
      name,
      { value: spec.value, citations: citationsFor(spec) },
    ])),
  };
}

function tableIdentity(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function tableTitleBase(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+\d+\s+OF\s+\d+\s*$/i, "")
    .trim();
}

function tableExists(graph, citation) {
  if (!citation.table_title) return true;
  const want = tableIdentity(citation.table_title);
  const wantBase = tableIdentity(tableTitleBase(citation.table_title));
  return graph.tables.some((table) => {
    if (table.sheet !== citation.sheet_id) return false;
    const title = table.title?.text || "";
    return tableIdentity(title) === want
      || tableIdentity(tableTitleBase(title)) === wantBase;
  });
}

function expectedCitationAt(spec, index) {
  const expected = citationsFor(spec);
  return expected[index] ?? null;
}

export async function verifyDemoRun({ truth, run, session, recognize, skipOcr = false }) {
  const failures = [];
  const checks = [];
  const fail = (classification, field, message) => {
    if (!FAILURE_CLASSES.has(classification)) throw new Error(`Unknown failure class ${classification}`);
    failures.push({ classification, field, message });
  };

  if (run.status !== "done") {
    fail("REFUSAL", null, `run status was ${JSON.stringify(run.status)}`);
    return { ok: false, checks, failures };
  }
  if (!Number.isFinite(run.latency_ms) || run.latency_ms < 0) {
    // Slim goldens may omit latency — only enforce when present on full runs.
    if (run.latency_ms !== undefined) {
      fail("LATENCY", null, "latency_ms must be a non-negative finite number");
    }
  }

  const graph = await session.graphForPipeline();
  const sheets = new Map(session.sheetList().map((sheet) => [sheet.key, sheet]));

  for (const [field, spec] of Object.entries(truth.expected)) {
    const answer = run.answer?.[field];
    if (!answer) {
      fail("VALUE", field, "answer field is missing");
      continue;
    }
    if (!valueMatches(answer.value, spec.value, spec.tolerance)) {
      fail("VALUE", field, `expected ${JSON.stringify(spec.value)}, got ${JSON.stringify(answer.value)}`);
    } else {
      checks.push({ assertion: "VALUE", field, ok: true });
    }

    const citations = Array.isArray(answer.citations)
      ? answer.citations
      : answer.citation ? [answer.citation] : [];
    const expectedCitations = citationsFor(spec);
    if (citations.length !== expectedCitations.length) {
      fail("CITE_FORM", field, `expected ${expectedCitations.length} citation(s), got ${citations.length}`);
    }

    for (let index = 0; index < citations.length; index++) {
      const citation = citations[index];
      const expectedCitation = expectedCitationAt(spec, index);
      const sheet = sheets.get(citation?.sheet_id);
      if (!sheet) {
        fail("RETRIEVAL", field, `unknown cited sheet ${JSON.stringify(citation?.sheet_id)}`);
        continue;
      }
      const bboxError = validateBbox(citation.bbox_px, [0, 0, sheet.widthPx, sheet.heightPx]);
      if (bboxError) {
        fail("CITE_FORM", field, bboxError);
        continue;
      }
      if (!tableExists(graph, citation)) {
        fail("RETRIEVAL", field, `table ${JSON.stringify(citation.table_title)} does not exist on ${citation.sheet_id}`);
        continue;
      }
      if (expectedCitation) {
        if (citation.sheet_id !== expectedCitation.sheet_id && !expectedCitation.sheet_flexible) {
          fail("RETRIEVAL", field, `expected sheet ${expectedCitation.sheet_id}, got ${citation.sheet_id}`);
          continue;
        }
        for (const key of ["table_title", "row_key", "column"]) {
          if (expectedCitation[key] && tableIdentity(citation[key]) !== tableIdentity(expectedCitation[key])) {
            if (key === "table_title"
              && tableIdentity(tableTitleBase(citation[key])) === tableIdentity(tableTitleBase(expectedCitation[key]))) {
              continue;
            }
            fail("RETRIEVAL", field, `expected ${key} ${JSON.stringify(expectedCitation[key])}, got ${JSON.stringify(citation[key])}`);
          }
        }
        if (!expectedCitation.bbox_flexible
          && overlapAgainstSmaller(citation.bbox_px, expectedCitation.bbox_px) < 0.8) {
          fail("CITE_GROUND", field, "returned bbox does not overlap the independently authored source region");
          continue;
        }
      }

      checks.push({ assertion: "CITE_RESOLVABLE", field, citation: index, ok: true });
      if (skipOcr) {
        checks.push({ assertion: "CITE_GROUNDED", field, citation: index, ok: true, skipped: "ocr" });
        continue;
      }
      const [x0, y0, x1, y1] = citation.bbox_px;
      const expectedText = citation.grounding_text
        ?? expectedCitation?.grounding_text
        ?? String(spec.value);
      const allowConfusables = citation.ocr_confusables ?? expectedCitation?.ocr_confusables ?? false;
      const ocrMode = citation.ocr_mode ?? expectedCitation?.ocr_mode;
      const basePx = citation.ocr_px ?? expectedCitation?.ocr_px ?? 1200;
      const tryPx = [...new Set([basePx, Math.min(2000, Math.max(basePx, 1600)), 2000])];
      let ocrText = "";
      let grounded = false;
      const modes = [...new Set([ocrMode, "single_line", "sparse_text", "single_word"].filter(Boolean))];
      /** Expand tiny glyph boxes (e.g. a single "5") so Tesseract has enough pixels. */
      const ocrRegion = (box) => {
        const [bx0, by0, bx1, by1] = box;
        const w = bx1 - bx0;
        const h = by1 - by0;
        const pad = Math.max(4, Math.min(12, Math.round(Math.min(w, h) * 0.2) || 4));
        let x0 = bx0 - pad;
        let y0 = by0 - pad;
        let x1 = bx1 + pad;
        let y1 = by1 + pad;
        const minW = 36;
        const minH = 28;
        if (x1 - x0 < minW) {
          const mid = (x0 + x1) / 2;
          x0 = mid - minW / 2;
          x1 = mid + minW / 2;
        }
        if (y1 - y0 < minH) {
          const mid = (y0 + y1) / 2;
          y0 = mid - minH / 2;
          y1 = mid + minH / 2;
        }
        return { x0: Math.max(0, x0), y0: Math.max(0, y0), x1, y1 };
      };
      for (const px of tryPx) {
        const rendered = await session.viewSheet(citation.sheet_id, {
          region: ocrRegion([x0, y0, x1, y1]),
          px,
        });
        for (const mode of modes) {
          ocrText = await recognize(rendered.png, mode);
          if (ocrGrounds(ocrText, expectedText, { allowConfusables })) {
            grounded = true;
            break;
          }
        }
        if (grounded) break;
      }
      if (!grounded) {
        // When the returned bbox overlaps the authored region but OCR on that
        // crop is blank/noisy (wide schedule cells), also try the independently
        // authored evidence crop before failing CITE_GROUND.
        if (expectedCitation?.bbox_px && overlapAgainstSmaller(citation.bbox_px, expectedCitation.bbox_px) >= 0.8) {
          const [ex0, ey0, ex1, ey1] = expectedCitation.bbox_px;
          for (const px of tryPx) {
            const rendered = await session.viewSheet(citation.sheet_id, {
              region: ocrRegion([ex0, ey0, ex1, ey1]),
              px,
            });
            for (const mode of modes) {
              ocrText = await recognize(rendered.png, mode);
              if (ocrGrounds(ocrText, expectedText, { allowConfusables })) {
                grounded = true;
                break;
              }
            }
            if (grounded) break;
          }
        }
      }
      if (!grounded && typeof session.findText === "function") {
        // Vector-text grounding: when raster OCR misreads a tiny glyph (5→0,
        // 48FE→43FE) but pdf.js already has the exact string under the cite
        // box, accept that as CITE_GROUND — same evidence the tools read.
        try {
          const found = session.findText(citation.sheet_id, String(expectedText), { limit: 200 });
          for (const hit of found?.hits || []) {
            if (!Array.isArray(hit?.bbox) || hit.bbox.length !== 4) continue;
            if (!ocrGrounds(hit.str, expectedText, { allowConfusables: false })) continue;
            const overlap = Math.max(
              overlapAgainstSmaller(citation.bbox_px, hit.bbox),
              overlapAgainstSmaller(hit.bbox, citation.bbox_px),
            );
            if (overlap >= 0.5) {
              grounded = true;
              ocrText = hit.str;
              break;
            }
          }
        } catch {
          // findText unavailable for this session shape — keep OCR failure
        }
      }
      if (!grounded && typeof session.sheet === "function") {
        // Fragmented plan tags (separate "CV" + "1" runs) never match find_text
        // for "CV-1". Join pdf.js spans whose centers fall in the cite box.
        try {
          const state = session.sheet(citation.sheet_id);
          if (state && !state.spans) {
            const { textSpans } = await import("../src/pdf.ts");
            state.spans = textSpans(state.page);
          }
          const [cx0, cy0, cx1, cy1] = citation.bbox_px;
          const parts = (state?.spans || [])
            .filter((span) => {
              const x0 = span.x0 ?? span.x;
              const y0 = span.y0 ?? span.y;
              const x1 = span.x1 ?? (x0 + (span.w || 0));
              const y1 = span.y1 ?? (y0 + (span.h || 0));
              const mx = (x0 + x1) / 2;
              const my = (y0 + y1) / 2;
              return mx >= cx0 - 2 && mx <= cx1 + 2 && my >= cy0 - 2 && my <= cy1 + 2;
            })
            .sort((a, b) => (a.y0 ?? a.y) - (b.y0 ?? b.y) || (a.x0 ?? a.x) - (b.x0 ?? b.x))
            .map((span) => span.str)
            .filter(Boolean);
          const joined = parts.join("");
          if (parts.length && ocrGrounds(joined, expectedText, { allowConfusables })) {
            grounded = true;
            ocrText = parts.join(" ");
          }
        } catch {
          // span cache unavailable — keep prior failure
        }
      }
      if (!grounded) {
        fail("CITE_GROUND", field, `OCR ${JSON.stringify(ocrText.trim())} does not contain ${JSON.stringify(expectedText)}`);
      } else {
        checks.push({
          assertion: "CITE_GROUNDED",
          field,
          citation: index,
          expected_text: expectedText,
          ocr_text: ocrText.trim(),
          ok: true,
        });
      }
    }
  }

  return { ok: failures.length === 0, checks, failures };
}

async function main() {
  const args = process.argv.slice(2);
  const truthPath = args.find((arg) => !arg.startsWith("--"));
  const truthOnly = args.includes("--truth-only");
  const skipOcr = args.includes("--fast") || args.includes("--skip-ocr");
  const runPath = args.filter((arg) => !arg.startsWith("--"))[1];
  if (!truthPath || (!truthOnly && !runPath)) {
    console.error("usage: node --import tsx scripts/verify-demo.mjs <truth.json> <run.json> [--corpus <dir>] [--fast]");
    console.error("   or: node --import tsx scripts/verify-demo.mjs <truth.json> --truth-only [--corpus <dir>] [--fast]");
    process.exit(2);
  }
  const corpusIndex = args.indexOf("--corpus");
  const corpusDir = resolve(corpusIndex >= 0 ? args[corpusIndex + 1] : dirname(dirname(dirname(resolve(truthPath)))));
  const truth = JSON.parse(readFileSync(resolve(truthPath), "utf8"));
  const run = truthOnly
    ? synthesizeTruthRun(truth)
    : JSON.parse(readFileSync(resolve(runPath), "utf8"));
  const pdfPath = resolve(corpusDir, "raw", truth.source_file);
  const session = new Session();
  await session.loadPlan(pdfPath);
  // Warm sheet-graph cache (same PDF shared by most demos) — still loadPlan
  // for sheet dims / findText, but skip ~11s ensureGraph rebuild on hits.
  try {
    const pdfBytes = readFileSync(pdfPath);
    const sha = createHash("sha256").update(pdfBytes).digest("hex");
    const graph = await cachedSheetGraph(pdfPath, {
      expectedSha256: sha,
      identity: [truth.set_id || "", "graphForPipeline"],
      compute: async () => session.graphForPipeline(),
    });
    session.seedPipelineGraph(graph);
  } catch {
    /* cold path: ensureGraph on first verifyDemoRun call */
  }

  let worker = null;
  let recognize = async () => {
    throw new Error("OCR recognize called while --fast/--skip-ocr is set");
  };
  if (!skipOcr) {
    worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
      cachePath: resolve(tmpdir(), "opentakeoff-tesseract"),
    });
    recognize = async (png, mode) => {
      await worker.setParameters({
        tessedit_pageseg_mode: mode === "sparse_text"
          ? Tesseract.PSM.SPARSE_TEXT
          : mode === "single_line"
            ? Tesseract.PSM.SINGLE_LINE
            : Tesseract.PSM.SINGLE_WORD,
        preserve_interword_spaces: "1",
      });
      const result = await worker.recognize(png);
      return result.data.text;
    };
  }
  try {
    const result = await verifyDemoRun({ truth, run, session, recognize, skipOcr });
    console.log(JSON.stringify({
      demo_id: truth.demo_id,
      mode: truthOnly ? "truth-only" : "run",
      skip_ocr: skipOcr,
      ...result,
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    if (worker) await worker.terminate();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
