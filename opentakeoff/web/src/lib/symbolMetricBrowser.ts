/** Browser-only ONNX adapter. It produces review rankings; shared policy stays
 * in symbolMetric.ts and no result here can create an installed quantity. */
import {
  SYMBOL_METRIC_INPUT_SIZE,
  SYMBOL_METRIC_EMBEDDING_DIMENSION,
  SYMBOL_METRIC_MODEL_URL,
  normalizeSymbolMetricEmbedding,
  prepareSymbolMetricInput,
  rankSymbolMetricCandidates,
  sahiPageBboxToLocal,
  type BboxPx,
  type SahiTile,
  type SymbolMetricCandidate,
  type SymbolMetricRankedCandidate,
  type SymbolMetricRgbaImage,
} from "./symbolMetric.ts";
// SHOULD THIS BE ON THE SHARED PATH? No. These are browser-build asset URLs;
// the shared ranking contract remains in symbolMetric.ts. Explicit URLs keep
// Vite from serving its HTML fallback where ONNX Runtime expects WASM bytes.
import wasmRuntimeUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import wasmWebGpuRuntimeUrl from "onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm?url";

type OrtModule = typeof import("onnxruntime-web/wasm");

interface BrowserMetricSession {
  ort: OrtModule;
  session: import("onnxruntime-web").InferenceSession;
  execution_provider: "webgpu" | "wasm";
}

let sessionPromise: Promise<BrowserMetricSession> | null = null;

function configureWasmAsset(ort: OrtModule, wasmUrl: string): void {
  // The source application is not cross-origin isolated, so a single thread
  // is the reliable baseline. A missing or mismatched worker must never
  // silently turn visual evidence into an apparent model failure.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: wasmUrl };
}

async function createSession(): Promise<BrowserMetricSession> {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    try {
      const ort = await import("onnxruntime-web/webgpu") as OrtModule;
      configureWasmAsset(ort, wasmWebGpuRuntimeUrl);
      const session = await ort.InferenceSession.create(SYMBOL_METRIC_MODEL_URL, {
        executionProviders: ["webgpu"],
      });
      return { ort, session, execution_provider: "webgpu" };
    } catch {
      // Browser or operator support can be incomplete. WASM is the disclosed,
      // compatible fallback; do not silently switch scoring semantics.
    }
  }
  const ort = await import("onnxruntime-web/wasm");
  configureWasmAsset(ort, wasmRuntimeUrl);
  const session = await ort.InferenceSession.create(SYMBOL_METRIC_MODEL_URL, {
    executionProviders: ["wasm"],
  });
  return { ort, session, execution_provider: "wasm" };
}

export function loadSymbolMetricBrowserSession(): Promise<BrowserMetricSession> {
  sessionPromise ??= createSession();
  return sessionPromise;
}

export function resetSymbolMetricBrowserSessionForTests(): void {
  sessionPromise = null;
}

export interface SymbolMetricEmbeddingResult {
  embedding: Float32Array;
  execution_provider: "webgpu" | "wasm";
}

async function embedSymbolMetricImages(images: readonly SymbolMetricRgbaImage[]): Promise<SymbolMetricEmbeddingResult[]> {
  if (!images.length) return [];
  const runtime = await loadSymbolMetricBrowserSession();
  const oneImageSize = 3 * SYMBOL_METRIC_INPUT_SIZE * SYMBOL_METRIC_INPUT_SIZE;
  const batch = new Float32Array(images.length * oneImageSize);
  for (let index = 0; index < images.length; index += 1) {
    batch.set(prepareSymbolMetricInput(images[index]), index * oneImageSize);
  }
  const input = new runtime.ort.Tensor("float32", batch, [images.length, 3, SYMBOL_METRIC_INPUT_SIZE, SYMBOL_METRIC_INPUT_SIZE]);
  const inputName = runtime.session.inputNames[0];
  const outputName = runtime.session.outputNames[0];
  if (!inputName || !outputName) throw new Error("Symbol metric model did not declare an input and output.");
  const result = await runtime.session.run({ [inputName]: input });
  const outputData = result[outputName]?.data;
  if (!(outputData instanceof Float32Array)) {
    throw new Error("Symbol metric model returned a non-float embedding.");
  }
  const expected = images.length * SYMBOL_METRIC_EMBEDDING_DIMENSION;
  if (outputData.length !== expected) {
    throw new Error(`Symbol metric model returned ${outputData.length} values for ${images.length} images; expected ${expected}.`);
  }
  return images.map((_, index) => ({
    embedding: normalizeSymbolMetricEmbedding(outputData.subarray(
      index * SYMBOL_METRIC_EMBEDDING_DIMENSION,
      (index + 1) * SYMBOL_METRIC_EMBEDDING_DIMENSION,
    )),
    execution_provider: runtime.execution_provider,
  }));
}

export async function embedSymbolMetricImage(image: SymbolMetricRgbaImage): Promise<SymbolMetricEmbeddingResult> {
  const [result] = await embedSymbolMetricImages([image]);
  if (!result) throw new Error("Symbol metric model did not return an embedding.");
  return result;
}

export async function rankSymbolMetricImages<T>(
  reference: SymbolMetricRgbaImage,
  candidates: readonly { id: string; image: SymbolMetricRgbaImage; value: T }[],
): Promise<{ execution_provider: "webgpu" | "wasm"; ranked: SymbolMetricRankedCandidate<T>[] }> {
  const embeddings = await embedSymbolMetricImages([reference, ...candidates.map(candidate => candidate.image)]);
  const referenceResult = embeddings[0];
  if (!referenceResult) throw new Error("Symbol metric model did not return a reference embedding.");
  const embedded: SymbolMetricCandidate<T>[] = candidates.map((candidate, index) => {
    const result = embeddings[index + 1];
    if (!result) throw new Error(`Symbol metric model did not return candidate ${index + 1}.`);
    return { id: candidate.id, embedding: result.embedding, value: candidate.value };
  });
  return { execution_provider: referenceResult.execution_provider, ranked: rankSymbolMetricCandidates(referenceResult.embedding, embedded) };
}

/** The minimal PDF.js surface used for a source-page tile. A caller supplies
 * the already-established page render scale, so the tile's coordinates stay
 * in the platform's existing image-pixel / citation coordinate system. */
export interface SymbolMetricPdfPage {
  getViewport(options: { scale: number; offsetX?: number; offsetY?: number }): unknown;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: unknown; background?: string }): { promise: Promise<unknown> };
}

export interface RenderedSahiTile {
  tile: SahiTile;
  image: SymbolMetricRgbaImage;
}

/** Render one source-page window at its original usable resolution. This is
 * the SAHI-style scanner stage: it never resizes an entire drawing down to
 * 280px, and it never treats a tile itself as a discovered object. */
export async function renderSahiPdfTile(
  page: SymbolMetricPdfPage,
  tile: SahiTile,
  renderScale: number,
): Promise<RenderedSahiTile> {
  if (!Number.isFinite(renderScale) || renderScale <= 0) throw new Error("renderScale must be a positive finite number.");
  const [x0, y0, x1, y1] = tile.bbox_px;
  const width = Math.round(x1 - x0);
  const height = Math.round(y1 - y0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Symbol metric tile canvas is unavailable.");
  const viewport = page.getViewport({
    scale: renderScale,
    offsetX: -x0,
    offsetY: -y0,
  });
  await page.render({ canvasContext: context, viewport, background: "#ffffff" }).promise;
  return { tile, image: context.getImageData(0, 0, width, height) };
}

/** Extract only a complete, pre-proposed physical body from an overlapping
 * tile. Proposal ownership remains vector/tag/leader/topology evidence; this
 * copy supplies DINO a tight visual crop for a review ranking. */
export function cropSahiCandidate(
  rendered: RenderedSahiTile,
  pageBbox: BboxPx,
): SymbolMetricRgbaImage {
  const local = sahiPageBboxToLocal(rendered.tile, pageBbox);
  if (!local) throw new Error("Candidate is clipped by this SAHI tile and cannot be embedded.");
  const [x0, y0, x1, y1] = local.map(value => Math.round(value)) as [number, number, number, number];
  const width = x1 - x0;
  const height = y1 - y0;
  if (width <= 0 || height <= 0) throw new Error("Candidate crop is empty after pixel alignment.");
  const source = rendered.image;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceOffset = ((y0 + y) * source.width + x0) * 4;
    const targetOffset = y * width * 4;
    for (let channel = 0; channel < width * 4; channel += 1) {
      data[targetOffset + channel] = Number(source.data[sourceOffset + channel] ?? 255);
    }
  }
  return { width, height, data };
}
