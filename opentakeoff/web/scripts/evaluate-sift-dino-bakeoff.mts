#!/usr/bin/env node
/**
 * Offline experiment: can the trained DINO metric rank SIFT-proposed visual
 * candidates without turning either score into a count or an acceptance?
 *
 * SHOULD THIS BE ON THE SHARED PATH? No. This reads saved, offline SIFT
 * bakeoff results and frozen corpus PDFs. It neither calls Session nor alters
 * tables, schedules, citations, bboxes, production candidates, or quantities.
 * The `top_expected_count` column is an oracle diagnostic using known frozen
 * ground-truth count, never a production selection rule.
 */
import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import * as ort from "onnxruntime-web";
import sharp from "sharp";
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

type Bbox = [number, number, number, number];
type Point = [number, number];
type Candidate = { bbox: Bbox; score: number; projected_reference_anchor?: Point | null };
type Result = {
  case_id: string;
  source_pdf: string;
  page: number;
  expected_instances: number;
  reference: { rect: [Point, Point] };
  methods: {
    sift: {
      candidates: Candidate[];
      reference_anchor_diagnostic: { matched: { candidate: Candidate }[] };
    };
  };
};

function parseArgs(argv: string[]) {
  let results = "";
  let corpus = "";
  let output = "";
  let model = defaultModel;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--sift-results") results = argv[++index] ?? "";
    else if (value === "--corpus") corpus = argv[++index] ?? "";
    else if (value === "--output") output = argv[++index] ?? "";
    else if (value === "--model") model = argv[++index] ?? "";
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!results || !corpus || !output) {
    throw new Error("Usage: --sift-results <dir> --corpus <dir> --output <json> [--model <onnx>]");
  }
  return { results: path.resolve(results), corpus: path.resolve(corpus), output: path.resolve(output), model: path.resolve(model) };
}

type Page = { width: number; height: number; data: Uint8Array };

async function renderPage(source: string, page: number): Promise<Page> {
  const { stdout } = await execFile(
    "pdftocairo",
    ["-f", String(page), "-l", String(page), "-r", "144", "-singlefile", "-png", source, "-"],
    { encoding: "buffer", maxBuffer: 128 * 1024 * 1024 },
  );
  const rendered = await sharp(stdout).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: rendered.info.width, height: rendered.info.height, data: rendered.data };
}

function crop(page: Page, bbox: readonly number[]): SymbolMetricRgbaImage {
  const x0 = Math.max(0, Math.floor(bbox[0]));
  const y0 = Math.max(0, Math.floor(bbox[1]));
  const x1 = Math.min(page.width, Math.ceil(bbox[2]));
  const y1 = Math.min(page.height, Math.ceil(bbox[3]));
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) throw new Error(`Invalid crop ${bbox.join(", ")}`);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((y0 + y) * page.width + x0) * 4;
    data.set(page.data.subarray(sourceOffset, sourceOffset + width * 4), y * width * 4);
  }
  return { width, height, data };
}

async function embed(session: ort.InferenceSession, images: readonly SymbolMetricRgbaImage[]): Promise<Float32Array[]> {
  const perImage = 3 * SYMBOL_METRIC_INPUT_SIZE * SYMBOL_METRIC_INPUT_SIZE;
  const batch = new Float32Array(images.length * perImage);
  images.forEach((image, index) => batch.set(prepareSymbolMetricInput(image), index * perImage));
  const input = new ort.Tensor("float32", batch, [images.length, 3, SYMBOL_METRIC_INPUT_SIZE, SYMBOL_METRIC_INPUT_SIZE]);
  const output = await session.run({ [session.inputNames[0]!]: input });
  const values = output[session.outputNames[0]!]?.data;
  if (!(values instanceof Float32Array) || values.length !== images.length * SYMBOL_METRIC_EMBEDDING_DIMENSION) {
    throw new Error("DINO model returned an unexpected embedding shape.");
  }
  return images.map((_, index) => normalizeSymbolMetricEmbedding(values.subarray(
    index * SYMBOL_METRIC_EMBEDDING_DIMENSION,
    (index + 1) * SYMBOL_METRIC_EMBEDDING_DIMENSION,
  )));
}

function key(candidate: Candidate): string {
  return candidate.bbox.map(value => value.toFixed(3)).join(":");
}

function metrics(ranked: { candidate: Candidate; dino_score: number }[], expected: number, positives: Set<string>) {
  let seen = 0;
  let sumPrecision = 0;
  for (let index = 0; index < ranked.length; index += 1) {
    if (positives.has(key(ranked[index]!.candidate))) {
      seen += 1;
      sumPrecision += seen / (index + 1);
    }
  }
  const top = ranked.slice(0, expected);
  const topMatches = top.filter(item => positives.has(key(item.candidate))).length;
  return {
    candidates: ranked.length,
    expected,
    matched_anywhere: seen,
    average_precision: expected ? sumPrecision / expected : null,
    top_expected_count: {
      matches: topMatches,
      precision: top.length ? topMatches / top.length : null,
      recall: expected ? topMatches / expected : null,
      disclosure: "Oracle diagnostic only: expected is frozen ground truth, never known by a production run.",
    },
  };
}

async function resultFiles(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name, "result.json"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const session = await ort.InferenceSession.create(args.model, { executionProviders: ["cpu"] });
  const report: any[] = [];
  for (const filename of await resultFiles(args.results)) {
    const result = JSON.parse(await readFile(filename, "utf8")) as Result;
    const source = path.join(args.corpus, result.source_pdf);
    const page = await renderPage(source, result.page);
    const reference = crop(page, [result.reference.rect[0][0], result.reference.rect[0][1], result.reference.rect[1][0], result.reference.rect[1][1]]);
    const candidates = result.methods.sift.candidates;
    const [referenceVector] = await embed(session, [reference]);
    if (!referenceVector) throw new Error("DINO did not embed reference crop.");
    const ranked: { candidate: Candidate; dino_score: number }[] = [];
    for (let start = 0; start < candidates.length; start += 24) {
      const group = candidates.slice(start, start + 24);
      const vectors = await embed(session, group.map(candidate => crop(page, candidate.bbox)));
      group.forEach((candidate, index) => ranked.push({ candidate, dino_score: symbolMetricCosine(referenceVector, vectors[index]!) }));
    }
    ranked.sort((left, right) => right.dino_score - left.dino_score || key(left.candidate).localeCompare(key(right.candidate)));
    const positives = new Set(result.methods.sift.reference_anchor_diagnostic.matched.map(item => key(item.candidate)));
    const row = { case_id: result.case_id, ...metrics(ranked, result.expected_instances, positives), ranked };
    report.push(row);
    console.log(JSON.stringify({ case_id: row.case_id, ...metrics(ranked, result.expected_instances, positives) }));
  }
  await writeFile(args.output, JSON.stringify({
    disclosure: "Offline DINO ranking over offline SIFT candidates. It makes no production match, count, tag, or schedule decision.",
    model: args.model,
    rows: report,
  }, null, 2));
}

await main();
