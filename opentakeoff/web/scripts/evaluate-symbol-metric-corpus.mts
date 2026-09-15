#!/usr/bin/env node
/**
 * Frozen real-plan evaluation for the DINOv2 symbol-metric verifier.
 *
 * SHOULD THIS BE ON THE SHARED PATH? No. This is an offline evaluator only;
 * it neither changes the candidate generator nor makes a quantity decision.
 * It invokes the shared Session symbol sweep with production defaults, then
 * asks whether the learned model ranks the same emitted candidates correctly.
 *
 * The metric is intentionally constrained:
 * - reference and candidate crops are from original PDF renders at 144 DPI;
 * - the 47-case / 283-instance manifest is frozen ground truth;
 * - a DINO score is never converted to an acceptance threshold here;
 * - top-N is an *oracle review metric* (N is the known answer-key count),
 *   not a production claim that the application knows the installed count.
 *
 * Run from web/:
 *   node --import tsx scripts/evaluate-symbol-metric-corpus.mts \
 *     --corpus "/path/to/HVAC BAS Benchmark Collection"
 */
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import sharp from "sharp";
import * as ort from "onnxruntime-web";
import { Session } from "../../mcp/src/session.ts";
import {
  SYMBOL_METRIC_EMBEDDING_DIMENSION,
  SYMBOL_METRIC_INPUT_SIZE,
  normalizeSymbolMetricEmbedding,
  prepareSymbolMetricInput,
  symbolMetricCosine,
  type SymbolMetricRgbaImage,
} from "../src/lib/symbolMetric.ts";

const execFile = promisify(execFileCallback);
const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const defaultModel = path.join(webRoot, "public/models/dinov2-symbol-metric-v1/dinov2_vits14_symbol_metric_v1.onnx");

type Point = [number, number];
type ManifestInstance = { id: string; at: Point; tolerance_px: number; page?: number };
type ManifestCase = {
  id: string;
  source_pdf: string;
  source_sha256: string;
  page: number;
  page_size_px: [number, number];
  scope?: "sheet" | "set";
  seed_rect: [Point, Point];
  seed: { at: Point };
  instances: ManifestInstance[];
};
type Candidate = { at: Point; page: number; source: "match" | "withheld"; vector_score: number };
type RankedCandidate = Candidate & { score: number };

function parseArgs(argv: string[]) {
  let corpus = "";
  let model = defaultModel;
  const only = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--corpus") corpus = argv[++index] ?? "";
    else if (value === "--model") model = argv[++index] ?? "";
    else if (value === "--case") only.add(argv[++index] ?? "");
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!corpus) throw new Error("Pass --corpus /absolute/path/to/HVAC BAS Benchmark Collection.");
  return { corpus: path.resolve(corpus), model: path.resolve(model), only };
}

const distance = (left: Point, right: Point) => Math.hypot(left[0] - right[0], left[1] - right[1]);
const instancePage = (c: ManifestCase, instance: ManifestInstance) => instance.page ?? c.page;

/** Exact deterministic one-to-one attribution, reused for vector and ranked outputs. */
function assign(expected: ManifestInstance[], c: ManifestCase, candidates: readonly Candidate[]) {
  const owner = new Array(candidates.length).fill(-1);
  const choices = expected.map((instance) => candidates
    .map((candidate, index) => ({ index, distance: candidate.page === instancePage(c, instance) ? distance(candidate.at, instance.at) : Infinity }))
    .filter(candidate => candidate.distance <= instance.tolerance_px)
    .sort((a, b) => a.distance - b.distance || a.index - b.index));
  const visit = (expectedIndex: number, seen: Set<number>): boolean => {
    for (const option of choices[expectedIndex]) {
      if (seen.has(option.index)) continue;
      seen.add(option.index);
      if (owner[option.index] < 0 || visit(owner[option.index], seen)) {
        owner[option.index] = expectedIndex;
        return true;
      }
    }
    return false;
  };
  for (let index = 0; index < expected.length; index += 1) visit(index, new Set());
  return { matched: owner.filter(index => index >= 0).length, owner };
}

function uniqueCandidates(candidates: Candidate[]): Candidate[] {
  const byLocation = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${candidate.page}:${Math.round(candidate.at[0] * 10)}:${Math.round(candidate.at[1] * 10)}`;
    const existing = byLocation.get(key);
    // A committed vector match is the production decision; preserve that
    // identity when a duplicate also appears in withheld output.
    if (!existing || (candidate.source === "match" && existing.source !== "match")) byLocation.set(key, candidate);
  }
  return [...byLocation.values()];
}

function candidatesFromSweep(result: any, loaded: any, c: ManifestCase): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (rows: any[], source: Candidate["source"], page: number) => {
    for (const row of rows ?? []) {
      if (!Array.isArray(row.at) || row.at.length !== 2) continue;
      candidates.push({ at: [Number(row.at[0]), Number(row.at[1])], page, source, vector_score: Number(row.score ?? 0) });
    }
  };
  if ((c.scope ?? "sheet") === "set") {
    for (const sheet of result.sheets ?? []) {
      const index = loaded.sheets.findIndex((candidate: any) => candidate.sheet === sheet.sheet);
      if (index < 0) throw new Error(`${c.id}: result named unknown sheet ${sheet.sheet}`);
      add(sheet.matches, "match", index + 1);
      add(sheet.withheld, "withheld", index + 1);
    }
  } else {
    add(result.matches, "match", c.page);
    add(result.withheld, "withheld", c.page);
  }
  return uniqueCandidates(candidates);
}

interface RenderedPage { width: number; height: number; data: Uint8Array; }

async function renderPage(source: string, page: number): Promise<RenderedPage> {
  // SHOULD THIS BE ON THE SHARED PATH? No. This is the offline evaluator's
  // rendering transport only; it does not alter coordinates, candidates,
  // model inputs, or any production extraction output. Streaming removes a
  // disposable full-page PNG write per case while preserving Poppler pixels.
  const { stdout } = await execFile(
    "pdftocairo",
    ["-f", String(page), "-l", String(page), "-r", "144", "-singlefile", "-png", source, "-"],
    { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 },
  );
  const rendered = await sharp(stdout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: rendered.info.width, height: rendered.info.height, data: rendered.data };
}

function crop(page: RenderedPage, bbox: readonly number[]): SymbolMetricRgbaImage {
  const x0 = Math.max(0, Math.floor(bbox[0]));
  const y0 = Math.max(0, Math.floor(bbox[1]));
  const x1 = Math.min(page.width, Math.ceil(bbox[2]));
  const y1 = Math.min(page.height, Math.ceil(bbox[3]));
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) throw new Error(`Crop ${bbox.join(", ")} falls outside rendered page ${page.width}x${page.height}.`);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((y + y0) * page.width + x0) * 4;
    data.set(page.data.subarray(sourceOffset, sourceOffset + width * 4), y * width * 4);
  }
  return { width, height, data };
}

function candidateBbox(c: ManifestCase, candidate: Candidate): [number, number, number, number] {
  const [topLeft, bottomRight] = c.seed_rect;
  const [seedX, seedY] = c.seed.at;
  return [
    candidate.at[0] + topLeft[0] - seedX,
    candidate.at[1] + topLeft[1] - seedY,
    candidate.at[0] + bottomRight[0] - seedX,
    candidate.at[1] + bottomRight[1] - seedY,
  ];
}

async function embeddings(session: ort.InferenceSession, images: readonly SymbolMetricRgbaImage[]): Promise<Float32Array[]> {
  const oneImage = 3 * SYMBOL_METRIC_INPUT_SIZE * SYMBOL_METRIC_INPUT_SIZE;
  const batch = new Float32Array(images.length * oneImage);
  for (let index = 0; index < images.length; index += 1) batch.set(prepareSymbolMetricInput(images[index]), index * oneImage);
  const input = new ort.Tensor("float32", batch, [images.length, 3, SYMBOL_METRIC_INPUT_SIZE, SYMBOL_METRIC_INPUT_SIZE]);
  const output = await session.run({ [session.inputNames[0]]: input });
  const values = output[session.outputNames[0]]?.data;
  if (!(values instanceof Float32Array) || values.length !== images.length * SYMBOL_METRIC_EMBEDDING_DIMENSION) {
    throw new Error(`Unexpected model output for ${images.length} crop(s).`);
  }
  return images.map((_, index) => normalizeSymbolMetricEmbedding(values.subarray(
    index * SYMBOL_METRIC_EMBEDDING_DIMENSION,
    (index + 1) * SYMBOL_METRIC_EMBEDDING_DIMENSION,
  )));
}

function averagePrecision(ranked: readonly RankedCandidate[], expected: ManifestInstance[], c: ManifestCase): number | null {
  if (!ranked.length || !expected.length) return null;
  const seen = new Set<number>();
  let hits = 0;
  let sum = 0;
  ranked.forEach((candidate, index) => {
    const choices = expected
      .map((instance, expectedIndex) => ({ expectedIndex, distance: candidate.page === instancePage(c, instance) ? distance(candidate.at, instance.at) : Infinity }))
      .filter(choice => choice.distance <= expected[choice.expectedIndex].tolerance_px && !seen.has(choice.expectedIndex))
      .sort((a, b) => a.distance - b.distance || a.expectedIndex - b.expectedIndex);
    const choice = choices[0];
    if (choice) {
      seen.add(choice.expectedIndex);
      hits += 1;
      sum += hits / (index + 1);
    }
  });
  return sum / expected.length;
}

function compactMetric(matched: number, selected: number, expected: number) {
  return {
    matched,
    expected,
    recall: expected ? matched / expected : null,
    precision: selected ? matched / selected : null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(path.join(args.corpus, "ground_truth/symbol_sweep/cases.json"), "utf8"));
  if (manifest.schema !== "opentakeoff.symbol_sweep_ground_truth.v1") throw new Error(`Unsupported manifest schema: ${manifest.schema}`);
  const cases: ManifestCase[] = args.only.size
    ? manifest.cases.filter((c: ManifestCase) => args.only.has(c.id))
    : manifest.cases;
  if (!cases.length) throw new Error("No benchmark case matched the requested selection.");
  for (const id of args.only) if (!cases.some(c => c.id === id)) throw new Error(`Unknown case: ${id}`);

  const session = await ort.InferenceSession.create(args.model, { executionProviders: ["cpu"] });
  const pageCache = new Map<string, RenderedPage>();
  const report: any[] = [];
  for (const c of cases) {
      const source = path.join(args.corpus, c.source_pdf);
      const takeoff = new Session();
      const loaded = await takeoff.loadPlan(source);
      const seedSheet = loaded.sheets[c.page - 1];
      if (!seedSheet) throw new Error(`${c.id}: source page ${c.page} does not exist.`);
      const result = await takeoff.symbolSweep(seedSheet.sheet, { seedRect: c.seed_rect, scope: c.scope ?? "sheet" });
      const candidates = candidatesFromSweep(result, loaded, c);
      const raw = assign(c.instances, c, candidates);
      const baseline = assign(c.instances, c, candidates.filter(candidate => candidate.source === "match"));

      const pageFor = async (page: number) => {
        const key = `${source}:${page}`;
        let rendered = pageCache.get(key);
        if (!rendered) {
          rendered = await renderPage(source, page);
          const expectedSize = page === c.page ? c.page_size_px : null;
          if (expectedSize && (rendered.width !== expectedSize[0] || rendered.height !== expectedSize[1])) {
            throw new Error(`${c.id}: Poppler render ${rendered.width}x${rendered.height} does not match frozen ${expectedSize.join("x")}.`);
          }
          pageCache.set(key, rendered);
        }
        return rendered;
      };
      const reference = crop(await pageFor(c.page), [c.seed_rect[0][0], c.seed_rect[0][1], c.seed_rect[1][0], c.seed_rect[1][1]]);
      const referenceEmbedding = (await embeddings(session, [reference]))[0];
      const scored: RankedCandidate[] = [];
      const chunkSize = 24;
      for (let offset = 0; offset < candidates.length; offset += chunkSize) {
        const chunk = candidates.slice(offset, offset + chunkSize);
        const images = await Promise.all(chunk.map(async candidate => crop(await pageFor(candidate.page), candidateBbox(c, candidate))));
        const vectors = await embeddings(session, images);
        for (let index = 0; index < chunk.length; index += 1) {
          scored.push({ ...chunk[index], score: symbolMetricCosine(referenceEmbedding, vectors[index]) });
        }
      }
      const ranked = scored.sort((left, right) => right.score - left.score || left.page - right.page || left.at[0] - right.at[0] || left.at[1] - right.at[1]);
      const topN = ranked.slice(0, c.instances.length);
      const metric = {
        id: c.id,
        expected: c.instances.length,
        candidates: candidates.length,
        vector_matches: candidates.filter(candidate => candidate.source === "match").length,
        vector_withheld: candidates.filter(candidate => candidate.source === "withheld").length,
        raw_candidate_coverage: compactMetric(raw.matched, candidates.length, c.instances.length),
        vector_committed: compactMetric(baseline.matched, candidates.filter(candidate => candidate.source === "match").length, c.instances.length),
        dino_oracle_top_n: compactMetric(assign(c.instances, c, topN).matched, topN.length, c.instances.length),
        dino_average_precision: averagePrecision(ranked, c.instances, c),
      };
      report.push(metric);
      console.log(JSON.stringify(metric));
  }

  const sum = (key: "raw_candidate_coverage" | "vector_committed" | "dino_oracle_top_n", field: "matched" | "expected") =>
    report.reduce((total, row) => total + row[key][field], 0);
  const summary = {
    benchmark: { cases: report.length, instances: sum("raw_candidate_coverage", "expected"), source: "frozen real-plan symbol-sweep corpus" },
    raw_candidate_coverage: compactMetric(sum("raw_candidate_coverage", "matched"), report.reduce((n, row) => n + row.candidates, 0), sum("raw_candidate_coverage", "expected")),
    vector_committed: compactMetric(sum("vector_committed", "matched"), report.reduce((n, row) => n + row.vector_matches, 0), sum("vector_committed", "expected")),
    dino_oracle_top_n: compactMetric(sum("dino_oracle_top_n", "matched"), sum("dino_oracle_top_n", "expected"), sum("dino_oracle_top_n", "expected")),
    mean_average_precision: report.reduce((total, row) => total + (row.dino_average_precision ?? 0), 0) / report.length,
    caveat: "DINO is evaluated only as a review ranking over the exact vector candidates. Oracle top-N uses the answer-key count and is not a production acceptance rule or installed-quantity claim.",
  };
  console.log(`SUMMARY ${JSON.stringify(summary)}`);
}

await main();
