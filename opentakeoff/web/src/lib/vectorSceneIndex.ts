// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 — "build one shared
// VectorSceneIndex." A pure, additive consumer of extractVectorGeometry's
// output (web/src/lib/oneclick.ts) — it reads a VectorGeometry and restates
// it with stable per-primitive/per-subpath IDs and resolved graphics-state
// facts, so a later phase can propose/verify/assign symbol bodies against
// primitives instead of re-deriving subpath membership, layer resolution,
// and paint flags by hand at every call site. It never mutates its input
// and adds no new facts oneclick.ts does not already compute — this module
// is a RESTATEMENT for consumption, not a second extraction pass.
//
// Explicit, disclosed scope of THIS slice (goal §7's full requirement list
// is much larger — see the `notYetImplemented` field below, and PROGRESS.md
// for the running account): stable primitive/subpath IDs, graphics-state
// passthrough (line width/stroke/fill luminance/dash/cap/join/clip/form
// depth — everything oneclick.ts's SubPath and meta byte already carry),
// layer resolution, a document-hash+page+version cache with deterministic
// invalidation, and a disclosed memory cap (requirement 6). NOT in this
// slice: text spans/exploded-text masks, Form XObject object identity/
// content-signature hashing, junction/collinearity/parallel/perpendicular
// relations, and a real spatial index — each is a distinct, sizeable piece
// of further work and is named rather than silently omitted.
import type { VectorGeometry, SubPath } from "./oneclick.ts";
import { SEG_CURVE, SEG_CLIP, SEG_FILLONLY, SEG_POLYARC } from "./oneclick.ts";

/** Bumped whenever this module's OUTPUT SHAPE changes in a way a cached
 *  index from an older version must not be reused across — the cache key
 *  below bakes this in, so a bump invalidates every previously-cached entry
 *  deterministically (goal §7 requirement 4) without any explicit sweep. */
export const VECTOR_SCENE_INDEX_VERSION = 1;

/** Disclosed, tunable safety cap on primitive count (goal §7 requirement 6:
 *  "Add memory accounting and a safe cap. A cap breach must produce an
 *  incomplete state, not partial silent truth.") Not yet benchmarked against
 *  this goal's own required "largest sheet" measurement (also still open,
 *  see PROGRESS.md) — chosen as a round number comfortably above every real
 *  corpus sheet measured in this repo's own test/benchmark fixtures so far,
 *  low enough that breaching it on a real plan sheet would be surprising
 *  rather than routine. Overridable per call (see BuildOptions) so tests can
 *  exercise the breach path without allocating hundreds of thousands of
 *  segments. */
export const VECTOR_SCENE_INDEX_MAX_PRIMITIVES = 250_000;

/** One flattened segment, restated with resolved graphics-state facts
 *  instead of the raw meta byte / parallel-array lookups a caller would
 *  otherwise have to redo at every use site. */
export interface IndexedPrimitive {
  /** stable within one build: its own position in geo.segs/geo.meta. */
  id: number;
  x0: number; y0: number; x1: number; y1: number;
  /** PRIM_LINE/PRIM_RECT_EDGE/PRIM_BEZIER (oneclick.ts), or null when the
   *  source VectorGeometry did not carry primType (hand-built fixtures
   *  predating that field never gain a fact they didn't state). */
  primType: number | null;
  curved: boolean;     // SEG_CURVE
  clip: boolean;       // SEG_CLIP — invisible ink, never a wall
  fillOnly: boolean;   // SEG_FILLONLY
  polyArc: boolean;    // SEG_POLYARC — SEG_CURVE came from markPolylineArcs, not a bezier op
  /** device line width, meta's high nibble, 0-15. */
  deviceLineWidth: number;
  /** stroke luminance 0-255, or null when the source did not carry `lum`. */
  lum: number | null;
  /** resolved OCG id via layerOf/layerIds, or null when unlayered/unavailable. */
  layerId: string | null;
  /** id into `subpaths` below, or -1 when no subpath's [i0,i1) range covers
   *  this primitive (can happen on a partial hand-built fixture; real
   *  extraction output always covers every segment it emits). */
  subpathId: number;
}

/** One drawn figure, restated with a stable id and its member primitive ids
 *  spelled out — a consumer never has to know the [i0,i1) range convention
 *  oneclick.ts's own SubPath uses internally. */
export interface IndexedSubpath {
  id: number;
  x0: number; y0: number; x1: number; y1: number;
  closed: boolean;
  fillLum: number;
  dashed: boolean;
  formDepth: number;
  /** GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane A — which Form
   *  XObject INVOCATION this subpath belongs to (0 = page level). Unlike
   *  `formDepth`, this is unique per `Do` call, never reused, so two
   *  subpaths from separate same-depth invocations are distinguishable —
   *  see oneclick.ts's own `SubPath.formInvocationId` doc for why. */
  formInvocationId: number;
  lineCap: number;
  lineJoin: number;
  /** this subpath's own segment ids, in original order; clipped to what was
   *  actually indexed if a memory-cap breach truncated the build (see
   *  `incomplete` below) — never silently include an unindexed id. */
  primitiveIds: number[];
}

export interface VectorSceneIndex {
  version: number;
  primitives: IndexedPrimitive[];
  subpaths: IndexedSubpath[];
  layerIds: string[];
  imageArea: number;
  maxImageArea: number;
  /** true only when VECTOR_SCENE_INDEX_MAX_PRIMITIVES (or an override) was
   *  breached and the build stopped short — requirement 6's "incomplete
   *  state, not partial silent truth." False on every ordinary sheet. */
  incomplete: boolean;
  incompleteReason: string | null;
  /** Names of goal §7 requirements this BUILD does not populate, ever,
   *  regardless of what the sheet actually contains — this is a statement
   *  about this module's current implementation, not a sheet-level fact.
   *  Once a requirement below is implemented, its name is removed from this
   *  list; only then does an empty array on the corresponding field mean
   *  "this sheet genuinely has none." Check this list before treating any
   *  of textSpans/formIdentity/intersections/spatialIndex as ground truth. */
  notYetImplemented: readonly string[];
  textSpans: unknown[];
  formIdentity: unknown[];
  intersections: unknown[];
  spatialIndex: null;
}

const NOT_YET_IMPLEMENTED = Object.freeze([
  "textSpans",
  "formIdentity",
  "intersections",
  "spatialIndex",
]);

export interface BuildOptions {
  /** override for VECTOR_SCENE_INDEX_MAX_PRIMITIVES, so a test can exercise
   *  the cap-breach path without allocating hundreds of thousands of
   *  segments. Production callers should never need this. */
  maxPrimitives?: number;
}

/** Pure: same VectorGeometry in ⇒ byte-identical VectorSceneIndex out (up to
 *  object identity of the arrays it copies from). Never mutates `geo`. */
export function buildVectorSceneIndex(geo: VectorGeometry, opts: BuildOptions = {}): VectorSceneIndex {
  const cap = opts.maxPrimitives ?? VECTOR_SCENE_INDEX_MAX_PRIMITIVES;
  const total = geo.meta.length;   // one byte per segment — the authoritative count
  const breach = total > cap;
  const n = breach ? cap : total;

  const subpathOf = new Int32Array(n).fill(-1);
  const geoSubpaths: SubPath[] = geo.subpaths ?? [];
  geoSubpaths.forEach((sp, idx) => {
    const hi = Math.min(sp.i1, n);
    for (let i = sp.i0; i < hi; i++) subpathOf[i] = idx;
  });

  const primitives: IndexedPrimitive[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const byte = geo.meta[i];
    const x0 = geo.segs[i * 4], y0 = geo.segs[i * 4 + 1], x1 = geo.segs[i * 4 + 2], y1 = geo.segs[i * 4 + 3];
    const layerIdx = geo.layerOf ? geo.layerOf[i] : -1;
    primitives[i] = {
      id: i,
      x0, y0, x1, y1,
      primType: geo.primType ? geo.primType[i] : null,
      curved: !!(byte & SEG_CURVE),
      clip: !!(byte & SEG_CLIP),
      fillOnly: !!(byte & SEG_FILLONLY),
      polyArc: !!(byte & SEG_POLYARC),
      deviceLineWidth: byte >> 4,
      lum: geo.lum ? geo.lum[i] : null,
      layerId: layerIdx >= 0 && geo.layerIds ? geo.layerIds[layerIdx] ?? null : null,
      subpathId: subpathOf[i],
    };
  }

  const subpaths: IndexedSubpath[] = geoSubpaths.map((sp, idx) => {
    const hi = Math.min(sp.i1, n);
    const primitiveIds: number[] = [];
    for (let i = sp.i0; i < hi; i++) primitiveIds.push(i);
    return {
      id: idx,
      x0: sp.x0, y0: sp.y0, x1: sp.x1, y1: sp.y1,
      closed: sp.closed,
      fillLum: sp.fillLum,
      dashed: sp.dashed,
      formDepth: sp.formDepth,
      formInvocationId: sp.formInvocationId,
      lineCap: sp.lineCap,
      lineJoin: sp.lineJoin,
      primitiveIds,
    };
  });

  return {
    version: VECTOR_SCENE_INDEX_VERSION,
    primitives,
    subpaths,
    layerIds: geo.layerIds ? geo.layerIds.slice() : [],
    imageArea: geo.imageArea,
    maxImageArea: geo.maxImageArea,
    incomplete: breach,
    incompleteReason: breach
      ? `segment count ${total} exceeds the ${cap}-primitive safety cap; primitives/subpaths beyond id ${cap - 1} were not indexed`
      : null,
    notYetImplemented: NOT_YET_IMPLEMENTED,
    textSpans: [],
    formIdentity: [],
    intersections: [],
    spatialIndex: null,
  };
}

/** goal §7 requirement 4: "Cache the scene index by document hash + page +
 *  parser/index version. Invalidate deterministically." The version is part
 *  of the key, so bumping VECTOR_SCENE_INDEX_VERSION invalidates every
 *  previously-cached entry by construction — no explicit sweep needed. */
export function vectorSceneIndexCacheKey(docHash: string, page: number): string {
  return `${docHash}::${page}::v${VECTOR_SCENE_INDEX_VERSION}`;
}

const cache = new Map<string, VectorSceneIndex>();

/** Cached build keyed by (docHash, page, this module's own version). A hit
 *  returns the SAME object a prior call produced (never a fresh copy), so a
 *  caller may rely on reference equality to skip re-processing downstream.
 *  goal §7 requirement 5 ("Browser and Session/MCP must serialize or
 *  consume the same shared index contract") is satisfied by this module
 *  living on the one shared path (web/src/lib) both sides already import
 *  oneclick.ts from — wiring it INTO the live browser/Session pipelines is
 *  further work, deliberately not done in this slice (see PROGRESS.md): the
 *  goal's own §7 note is "deliver one commit for extraction/index contracts
 *  and parity; do not change final count decisions yet." */
export function getOrBuildVectorSceneIndex(docHash: string, page: number, geo: VectorGeometry, opts: BuildOptions = {}): VectorSceneIndex {
  const key = vectorSceneIndexCacheKey(docHash, page);
  const hit = cache.get(key);
  if (hit) return hit;
  const built = buildVectorSceneIndex(geo, opts);
  cache.set(key, built);
  return built;
}

/** Test-only escape hatch — production code never needs to evict by hand;
 *  a document-hash/page/version change already produces a distinct key. */
export function clearVectorSceneIndexCache(): void {
  cache.clear();
}
