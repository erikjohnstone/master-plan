// Trace engine worker (#linear-takeoff WP3.2) — stroke classification
// (strokes.ts, WP3.1) and spatial-index building (index.ts) run together
// here, off the main thread, matching plan §6.10's own performance-budget
// grouping ("stroke classification + R-tree + endpoint hash | worker, once
// per sheet"). One message type only: there is no per-click "query"
// message the way `netroom.worker.js` has a `room` message — the built
// index is TRANSFERRED to the main thread (`serializeSegmentIndex`'s
// buffers) and reconstructed there via `deserializeSegmentIndex`, so every
// actual query (`nearestSegment`, `segmentsInBox`, `endpointsNear`) runs
// synchronously on the main thread, per §6.10's own "click → seed → walk:
// main thread (pure, synchronous), < 10 ms" budget — a worker that only
// ever answered queries by postMessage round trip could not meet that.
//
// Same protocol shape as `netroom.worker.js`, deliberately: one
// `self.onmessage`, a `req` the caller injects and this worker echoes back
// for correlation, one try/catch wrapping the whole handler, and an error
// reply reusing the request's own message type plus an `error` string
// rather than a rejected promise (workers have no promise boundary to
// reject across).
import { classifyStrokes, type StrokeExclusionInput } from "./strokes.ts";
import { buildSegmentIndex, serializeSegmentIndex } from "./index.ts";
import type { SubPath, TextMark } from "../oneclick.ts";
import type { LayerInfo } from "../layers.ts";

interface BuildMessage extends StrokeExclusionInput {
  type: "build";
  key: string;
  req: number;
  dash?: Uint8Array | null;
  lum?: Uint8Array | null;
  strokeRgb?: Uint8Array | null;
  layerOf?: Int32Array | null;
  layerIds?: string[] | null;
  layers?: LayerInfo[] | null;
  subpaths?: SubPath[] | null;
  texts?: TextMark[] | null;
}

// tsconfig's `lib` is DOM-only (no "webworker" — see pdfTile.worker.ts's own
// comment on this exact cast, the first worker in the repo to transfer).
const post = self.postMessage as (message: unknown, transfer?: Transferable[]) => void;

self.onmessage = (ev: MessageEvent<BuildMessage>) => {
  const m = ev.data;
  try {
    if (m.type === "build") {
      const t0 = performance.now();
      const classes = classifyStrokes(m);
      const index = buildSegmentIndex(m.segs, m.meta, classes);
      const { payload, transfer } = serializeSegmentIndex(index);
      const familyBuffer = classes.family.buffer as ArrayBuffer;
      post({
        type: "built", key: m.key, req: m.req,
        ms: Math.round(performance.now() - t0),
        families: classes.families,
        family: familyBuffer,
        ...payload,
      }, [...transfer, familyBuffer]);
    }
  } catch (err) {
    post({ type: "built", key: m.key, req: m.req, error: String((err as Error)?.message || err) });
  }
};
