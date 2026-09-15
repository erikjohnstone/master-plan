// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 7 requirement 8 — "Keep
// stable vector-body crops and reference IDs in the output contract for
// a future DINOv2 metric verifier. The learned model will rerank/verify
// proposed pairs; it will not replace proposal recall, ownership, or
// source proof."
//
// AUDITED BEFORE BUILDING (dedicated Phase 7 investigation, this
// checkpoint): this project already has a real, tested, shared-path
// content-hashing convention — basSequenceReconciliation.ts's own
// `digest(value) = sha256Hex(canonicalBasJson(value))`, built from
// basCanonical.ts's own `canonicalBasJson` (deterministic key-sorted
// JSON) and graphKeys.js's own `sha256Hex` (lowercase-hex SHA-256 via
// WebCrypto). Reused here directly, unmodified, rather than inventing a
// second hash scheme.
//
// STABILITY CONTRACT: a body's own `referenceId` depends ONLY on its
// source sheet identity and its own `primitiveIds` (sorted here, so an
// upstream caller's own collection order never changes the id) — never
// on array position/index in whatever proposal list currently contains
// it, and never on any other proposal's own existence. Re-running the
// SAME extraction on the SAME document reproduces the SAME id for the
// SAME underlying ink every time — exactly what lets a UI, a cache, or
// a future verifier keep referring to "this exact body" across pipeline
// stages and re-runs, without an array-index reference breaking the
// moment ordering changes. This is deliberately NOT a cross-document
// visual fingerprint (comparing two DIFFERENT sheets' own similar-
// looking symbols is exactly the future DINOv2 verifier's own job, per
// the goal's own text) — only a stable identity for one body's own real
// ink, on one real sheet.
//
// "Vector-body crop": in a vector-graphics domain, the crop IS the
// primitive set plus its own bbox — a caller rendering an actual
// raster/image crop for a real DINOv2 model is real further work
// (Phase 8's own concern), not attempted here. This module exposes
// exactly the stable identity plus region data such a future renderer
// would need, nothing more — never a rendering step itself.
import { canonicalBasJson } from "./basCanonical.ts";
import { sha256Hex } from "./graphKeys.js";

export interface VectorBodyCrop {
  referenceId: string;
  sheetKey: string;
  /** sorted ascending — the same underlying set always serializes the
   *  same way regardless of the order a caller happened to collect it. */
  primitiveIds: number[];
  x0: number; y0: number; x1: number; y1: number;
}

/** Computes a stable reference id + crop region for one body's own ink
 *  on one sheet. The only non-pure part is the underlying digest's own
 *  use of WebCrypto; never mutates `primitiveIds` or `bbox`. */
export async function computeVectorBodyCrop(
  sheetKey: string,
  primitiveIds: readonly number[],
  bbox: { x0: number; y0: number; x1: number; y1: number },
): Promise<VectorBodyCrop> {
  const sortedIds = [...primitiveIds].sort((a, b) => a - b);
  const referenceId = await sha256Hex(new TextEncoder().encode(canonicalBasJson({ sheetKey, primitiveIds: sortedIds })));
  return { referenceId, sheetKey, primitiveIds: sortedIds, x0: bbox.x0, y0: bbox.y0, x1: bbox.x1, y1: bbox.y1 };
}
