import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import Tesseract from "tesseract.js";
import { Session } from "../src/session.ts";

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

function tableExists(graph, citation) {
  if (!citation.table_title) return true;
  return graph.tables.some((table) =>
    table.sheet === citation.sheet_id
    && tableIdentity(table.title?.text) === tableIdentity(citation.table_title));
}

function expectedCitationAt(spec, index) {
  const expected = citationsFor(spec);
  return expected[index] ?? null;
}

export async function verifyDemoRun({ truth, run, session, recognize }) {
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
    fail("LATENCY", null, "latency_ms must be a non-negative finite number");
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
        if (citation.sheet_id !== expectedCitation.sheet_id) {
          fail("RETRIEVAL", field, `expected sheet ${expectedCitation.sheet_id}, got ${citation.sheet_id}`);
          continue;
        }
        for (const key of ["table_title", "row_key", "column"]) {
          if (expectedCitation[key] && tableIdentity(citation[key]) !== tableIdentity(expectedCitation[key])) {
            fail("RETRIEVAL", field, `expected ${key} ${JSON.stringify(expectedCitation[key])}, got ${JSON.stringify(citation[key])}`);
          }
        }
        if (overlapAgainstSmaller(citation.bbox_px, expectedCitation.bbox_px) < 0.8) {
          fail("CITE_GROUND", field, "returned bbox does not overlap the independently authored source region");
          continue;
        }
      }

      checks.push({ assertion: "CITE_RESOLVABLE", field, citation: index, ok: true });
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
      for (const px of tryPx) {
        const pad = Math.max(1, Math.min(8, Math.round(Math.min(x1 - x0, y1 - y0) * 0.05)));
        const rendered = await session.viewSheet(citation.sheet_id, {
          region: {
            x0: Math.max(0, x0 - pad),
            y0: Math.max(0, y0 - pad),
            x1: x1 + pad,
            y1: y1 + pad,
          },
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
  const runPath = args.filter((arg) => !arg.startsWith("--"))[1];
  if (!truthPath || (!truthOnly && !runPath)) {
    console.error("usage: node --import tsx scripts/verify-demo.mjs <truth.json> <run.json> [--corpus <dir>]");
    console.error("   or: node --import tsx scripts/verify-demo.mjs <truth.json> --truth-only [--corpus <dir>]");
    process.exit(2);
  }
  const corpusIndex = args.indexOf("--corpus");
  const corpusDir = resolve(corpusIndex >= 0 ? args[corpusIndex + 1] : dirname(dirname(dirname(resolve(truthPath)))));
  const truth = JSON.parse(readFileSync(resolve(truthPath), "utf8"));
  const run = truthOnly
    ? synthesizeTruthRun(truth)
    : JSON.parse(readFileSync(resolve(runPath), "utf8"));
  const session = new Session();
  await session.loadPlan(resolve(corpusDir, "raw", truth.source_file));

  const worker = await Tesseract.createWorker("eng", Tesseract.OEM.LSTM_ONLY, {
    cachePath: resolve(tmpdir(), "opentakeoff-tesseract"),
  });
  const recognize = async (png, mode) => {
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
  try {
    const result = await verifyDemoRun({ truth, run, session, recognize });
    console.log(JSON.stringify({
      demo_id: truth.demo_id,
      mode: truthOnly ? "truth-only" : "run",
      ...result,
    }, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally {
    await worker.terminate();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
