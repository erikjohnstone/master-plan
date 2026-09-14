/**
 * Shared contracts for the DINOv2 symbol-metric verifier.
 *
 * SHOULD THIS BE ON THE SHARED PATH? Yes. Candidate ranking affects which
 * physical-body hypotheses an estimator reviews, so its image preparation,
 * slice coordinates, score calculation, and abstention contract live here.
 * This module deliberately does not accept a quantity or change a citation.
 */

export const SYMBOL_METRIC_INPUT_SIZE = 280;
export const SYMBOL_METRIC_MODEL_URL = "/models/dinov2-symbol-metric-v1/dinov2_vits14_symbol_metric_v1.onnx";
export const SYMBOL_METRIC_MODEL_SHA256 = "7911c2fae8fa9d63082416619d1224c9b2f6edb93b78bf306327ba08d44499f8";
export const SYMBOL_METRIC_EMBEDDING_DIMENSION = 256;

const IMAGE_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGE_STD = [0.229, 0.224, 0.225] as const;

export type BboxPx = readonly [number, number, number, number];

/** A browser ImageData-compatible, tightly-packed RGBA image. */
export interface SymbolMetricRgbaImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface SymbolMetricCandidate<T = unknown> {
  id: string;
  embedding: ArrayLike<number>;
  value: T;
}

export interface SymbolMetricRankedCandidate<T = unknown> extends SymbolMetricCandidate<T> {
  cosine_similarity: number;
  /** A model score is review evidence, never an installed-quantity decision. */
  decision: "ranked_review";
}

export interface SahiTile {
  id: string;
  level: number;
  bbox_px: [number, number, number, number];
}

export interface SahiTileOptions {
  /** Tile widths/heights in rendered page pixels; largest context is last. */
  tile_sizes?: readonly number[];
  /** Fractional overlap, required to keep boundary symbols visible in a peer tile. */
  overlap_ratio?: number;
}

/** A page-space physical-body candidate proposed by vector/legend/topology code.
 * This does not originate from raster inference and is intentionally independent
 * of the browser runtime so UI and MCP can preserve the same identity. */
export interface SymbolMetricPageCandidate<T = unknown> {
  id: string;
  bbox_px: [number, number, number, number];
  value: T;
}

function finitePositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number.`);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function grayscalePixels(image: SymbolMetricRgbaImage): Float32Array {
  const grayscale = new Float32Array(image.width * image.height);
  for (let index = 0; index < grayscale.length; index += 1) {
    const at = index * 4;
    const r = Number(image.data[at] ?? 255);
    const g = Number(image.data[at + 1] ?? 255);
    const b = Number(image.data[at + 2] ?? 255);
    // PIL ImageOps.grayscale uses the same ITU-R 601 luma weights.
    grayscale[index] = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  return grayscale;
}

function grayscaleAt(pixels: Float32Array, width: number, height: number, x: number, y: number): number {
  const px = clamp(Math.floor(x), 0, width - 1);
  const py = clamp(Math.floor(y), 0, height - 1);
  return pixels[py * width + px];
}

/** PIL's training transform uses the Lanczos resampler. Keeping the same
 * filter at inference avoids a quiet train/serve mismatch for fine CAD ink. */
function lanczosWeight(distance: number, radius = 3): number {
  const absolute = Math.abs(distance);
  if (absolute < Number.EPSILON) return 1;
  if (absolute >= radius) return 0;
  const scaled = Math.PI * absolute;
  return (Math.sin(scaled) / scaled) * (Math.sin(scaled / radius) / (scaled / radius));
}

interface ResampleContributor {
  positions: number[];
  weights: number[];
}

function lanczosContributors(sourceLength: number, targetLength: number): ResampleContributor[] {
  return Array.from({ length: targetLength }, (_, target) => {
    const sourceCoordinate = ((target + 0.5) * sourceLength) / targetLength - 0.5;
    const center = Math.floor(sourceCoordinate);
    const positions: number[] = [], weights: number[] = [];
    let total = 0;
    for (let source = center - 2; source <= center + 3; source += 1) {
      const weight = lanczosWeight(sourceCoordinate - source);
      if (!weight) continue;
      positions.push(clamp(source, 0, sourceLength - 1));
      weights.push(weight);
      total += weight;
    }
    return { positions, weights: weights.map(weight => weight / total) };
  });
}

/** Separable six-tap Lanczos avoids doing 36 source lookups per output
 * pixel. Full-page scans invoke this for many candidates, so the speed is a
 * correctness requirement too: visual review may not turn into a hidden
 * multi-minute blocking stage. */
function lanczosResizeGray(image: SymbolMetricRgbaImage, targetWidth: number, targetHeight: number): Float32Array {
  const source = grayscalePixels(image);
  const xContributors = lanczosContributors(image.width, targetWidth);
  const yContributors = lanczosContributors(image.height, targetHeight);
  const horizontal = new Float32Array(image.height * targetWidth);
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      const contributor = xContributors[x];
      let value = 0;
      for (let index = 0; index < contributor.positions.length; index += 1) {
        value += source[y * image.width + contributor.positions[index]] * contributor.weights[index];
      }
      horizontal[y * targetWidth + x] = value;
    }
  }
  const output = new Float32Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y += 1) {
    const contributor = yContributors[y];
    for (let x = 0; x < targetWidth; x += 1) {
      let value = 0;
      for (let index = 0; index < contributor.positions.length; index += 1) {
        value += horizontal[contributor.positions[index] * targetWidth + x] * contributor.weights[index];
      }
      output[y * targetWidth + x] = clamp(value, 0, 1);
    }
  }
  return output;
}

/**
 * Exact input contract used by the RunPod training job: aspect-preserving
 * grayscale image on a white 280px canvas, replicated to RGB then ImageNet
 * normalized in NCHW order. We do not stretch, rotate, or mirror at inference.
 */
export function prepareSymbolMetricInput(image: SymbolMetricRgbaImage): Float32Array {
  finitePositive(image.width, "image width");
  finitePositive(image.height, "image height");
  if (image.data.length < image.width * image.height * 4) throw new Error("Image data is shorter than width × height × 4.");

  const size = SYMBOL_METRIC_INPUT_SIZE;
  const scale = Math.min(size / image.width, size / image.height);
  const fittedWidth = Math.max(1, Math.min(size, Math.round(image.width * scale)));
  const fittedHeight = Math.max(1, Math.min(size, Math.round(image.height * scale)));
  const left = Math.floor((size - fittedWidth) / 2);
  const top = Math.floor((size - fittedHeight) / 2);
  const canvas = new Float32Array(size * size).fill(1);
  const fitted = lanczosResizeGray(image, fittedWidth, fittedHeight);
  for (let y = 0; y < fittedHeight; y += 1) {
    canvas.set(fitted.subarray(y * fittedWidth, (y + 1) * fittedWidth), (top + y) * size + left);
  }

  const output = new Float32Array(3 * size * size);
  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * size * size;
    for (let index = 0; index < canvas.length; index += 1) {
      output[start + index] = (canvas[index] - IMAGE_MEAN[channel]) / IMAGE_STD[channel];
    }
  }
  return output;
}

export function normalizeSymbolMetricEmbedding(embedding: ArrayLike<number>): Float32Array {
  if (embedding.length !== SYMBOL_METRIC_EMBEDDING_DIMENSION) {
    throw new Error(`Expected ${SYMBOL_METRIC_EMBEDDING_DIMENSION} embedding values, received ${embedding.length}.`);
  }
  let sumSquares = 0;
  for (let index = 0; index < embedding.length; index += 1) {
    const value = Number(embedding[index]);
    if (!Number.isFinite(value)) throw new Error("Embedding contains a non-finite value.");
    sumSquares += value * value;
  }
  if (sumSquares <= Number.EPSILON) throw new Error("Embedding is zero-length and cannot be ranked.");
  const scale = 1 / Math.sqrt(sumSquares);
  return Float32Array.from(embedding, value => Number(value) * scale);
}

export function symbolMetricCosine(left: ArrayLike<number>, right: ArrayLike<number>): number {
  const a = normalizeSymbolMetricEmbedding(left);
  const b = normalizeSymbolMetricEmbedding(right);
  let total = 0;
  for (let index = 0; index < a.length; index += 1) total += a[index] * b[index];
  return clamp(total, -1, 1);
}

/** Rank candidate bodies for review. There is intentionally no accept threshold here. */
export function rankSymbolMetricCandidates<T>(
  referenceEmbedding: ArrayLike<number>,
  candidates: readonly SymbolMetricCandidate<T>[],
): SymbolMetricRankedCandidate<T>[] {
  return candidates.map(candidate => ({
    ...candidate,
    cosine_similarity: symbolMetricCosine(referenceEmbedding, candidate.embedding),
    decision: "ranked_review" as const,
  })).sort((left, right) => right.cosine_similarity - left.cosine_similarity || left.id.localeCompare(right.id));
}

function startsForAxis(extent: number, tileSize: number, overlapRatio: number): number[] {
  if (extent <= tileSize) return [0];
  const step = Math.max(1, Math.round(tileSize * (1 - overlapRatio)));
  const finalStart = extent - tileSize;
  const starts: number[] = [];
  for (let start = 0; start < finalStart; start += step) starts.push(start);
  if (starts.at(-1) !== finalStart) starts.push(finalStart);
  return starts;
}

/**
 * SAHI-style overlapping source-page windows. They preserve original page
 * coordinates; the caller must still find a candidate body inside each window.
 * A window itself is never treated as a symbol bounding box.
 */
export function buildSahiTiles(
  pageWidth: number,
  pageHeight: number,
  options: SahiTileOptions = {},
): SahiTile[] {
  finitePositive(pageWidth, "page width");
  finitePositive(pageHeight, "page height");
  const overlap = options.overlap_ratio ?? 0.2;
  if (!Number.isFinite(overlap) || overlap < 0 || overlap >= 1) throw new Error("overlap_ratio must be in [0, 1).");
  const sizes = options.tile_sizes ?? [640, 1024, 1536];
  if (!sizes.length) throw new Error("At least one SAHI tile size is required.");

  const tiles: SahiTile[] = [];
  for (let level = 0; level < sizes.length; level += 1) {
    const requested = sizes[level];
    finitePositive(requested, "tile size");
    const width = Math.min(Math.round(requested), Math.round(pageWidth));
    const height = Math.min(Math.round(requested), Math.round(pageHeight));
    for (const y of startsForAxis(Math.round(pageHeight), height, overlap)) {
      for (const x of startsForAxis(Math.round(pageWidth), width, overlap)) {
        tiles.push({ id: `sahi-${level}-${x}-${y}`, level, bbox_px: [x, y, x + width, y + height] });
      }
    }
  }
  return tiles;
}

/** Convert a local candidate body in one tile back to immutable page-space coordinates. */
export function sahiLocalBboxToPage(tile: SahiTile, localBbox: BboxPx): [number, number, number, number] {
  const [x0, y0, x1, y1] = localBbox;
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) throw new Error("Candidate bbox must be finite and non-empty.");
  const [tileX0, tileY0, tileX1, tileY1] = tile.bbox_px;
  if (x0 < 0 || y0 < 0 || x1 > tileX1 - tileX0 || y1 > tileY1 - tileY0) {
    throw new Error("Candidate bbox must stay inside its SAHI tile.");
  }
  return [tileX0 + x0, tileY0 + y0, tileX0 + x1, tileY0 + y1];
}

/** Return the candidate body in a tile's local pixels, or null when that tile
 * only clips it. Clipped bodies are never embedded: a cut-off valve/actuator
 * is not valid model evidence. */
export function sahiPageBboxToLocal(tile: SahiTile, pageBbox: BboxPx): [number, number, number, number] | null {
  const [x0, y0, x1, y1] = pageBbox;
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) {
    throw new Error("Candidate bbox must be finite and non-empty.");
  }
  const [tileX0, tileY0, tileX1, tileY1] = tile.bbox_px;
  if (x0 < tileX0 || y0 < tileY0 || x1 > tileX1 || y1 > tileY1) return null;
  return [x0 - tileX0, y0 - tileY0, x1 - tileX0, y1 - tileY0];
}

/** Pick the smallest complete overlapping tile for a known page-space body.
 * The same body may appear in several overlap tiles; this makes its selected
 * crop deterministic and prevents duplicate visual evidence. */
export function sahiTileForPageBbox(tiles: readonly SahiTile[], pageBbox: BboxPx): SahiTile | null {
  const candidates = tiles
    .filter(tile => sahiPageBboxToLocal(tile, pageBbox) !== null)
    .sort((left, right) => {
      const leftArea = (left.bbox_px[2] - left.bbox_px[0]) * (left.bbox_px[3] - left.bbox_px[1]);
      const rightArea = (right.bbox_px[2] - right.bbox_px[0]) * (right.bbox_px[3] - right.bbox_px[1]);
      return leftArea - rightArea || left.id.localeCompare(right.id);
    });
  return candidates[0] ?? null;
}
