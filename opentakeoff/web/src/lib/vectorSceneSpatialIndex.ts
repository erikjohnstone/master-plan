// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 2 §7 — "spatial index
// entries", the goal's own named requirement that `VectorSceneIndex.
// spatialIndex` (vectorSceneIndex.ts) stubs out as `null`. A uniform grid
// over primitive bounding boxes: the standard, simplest-that-works broad
// phase — a caller queries a rectangle and gets back CANDIDATE primitive
// ids whose bbox overlaps it, then does its own exact test (segment-
// segment, point-in-shape, whatever it actually needs). This module never
// does that exact test itself; a broad phase that tried to be exact would
// just be a slower, more complicated broad phase.
//
// This is also the piece true mid-segment intersection detection (goal
// §7's one remaining unimplemented named relation — see PROGRESS.md) needs
// to stay near-linear instead of an O(n²) all-pairs scan: bucket by bbox,
// only test pairs whose cells actually overlap. Building that on top of
// this index is a further slice, deliberately not attempted here.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";

/** Same disclosed-cap ethos as every other Phase 2 module. */
export const SPATIAL_INDEX_MAX_PRIMITIVES = 250_000;

/** Default grid cell size, image px. Not tuned against real sheets yet —
 *  a reasonable middle ground between "too fine" (most primitives span
 *  many cells, bloating memory) and "too coarse" (every query returns
 *  most of the sheet). Overridable per build. */
export const DEFAULT_SPATIAL_CELL_SIZE = 32;

export interface SpatialIndex {
  cellSize: number;
  /** primitive ids per cell, keyed by "cx,cy" (device/image-space grid
   *  coordinates) — exposed read-only for inspection/testing; callers
   *  should go through queryRect rather than walking this by hand. */
  cells: ReadonlyMap<string, readonly number[]>;
  bounds: { x0: number; y0: number; x1: number; y1: number } | null;
  incomplete: boolean;
  incompleteReason: string | null;
}

function cellKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

/** Pure: builds a uniform-grid spatial index over a VectorSceneIndex's own
 *  primitives. Never mutates its input. */
export function buildSpatialIndex(
  idx: VectorSceneIndex,
  opts: { cellSize?: number; maxPrimitives?: number } = {},
): SpatialIndex {
  const cellSize = opts.cellSize ?? DEFAULT_SPATIAL_CELL_SIZE;
  const cap = opts.maxPrimitives ?? SPATIAL_INDEX_MAX_PRIMITIVES;
  const n = idx.primitives.length;
  if (n > cap) {
    return {
      cellSize, cells: new Map(), bounds: null,
      incomplete: true,
      incompleteReason: `primitive count ${n} exceeds the ${cap}-primitive spatial-index cap; no cells were built`,
    };
  }

  const cells = new Map<string, number[]>();
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;

  for (const p of idx.primitives) {
    const x0 = Math.min(p.x0, p.x1), x1 = Math.max(p.x0, p.x1);
    const y0 = Math.min(p.y0, p.y1), y1 = Math.max(p.y0, p.y1);
    if (x0 < bx0) bx0 = x0; if (x1 > bx1) bx1 = x1;
    if (y0 < by0) by0 = y0; if (y1 > by1) by1 = y1;
    const cx0 = Math.floor(x0 / cellSize), cx1 = Math.floor(x1 / cellSize);
    const cy0 = Math.floor(y0 / cellSize), cy1 = Math.floor(y1 / cellSize);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cellKey(cx, cy);
        let arr = cells.get(k);
        if (!arr) { arr = []; cells.set(k, arr); }
        arr.push(p.id);
      }
    }
  }

  return {
    cellSize,
    cells,
    bounds: n > 0 ? { x0: bx0, y0: by0, x1: bx1, y1: by1 } : null,
    incomplete: false,
    incompleteReason: null,
  };
}

/** Candidate primitive ids whose bbox overlaps the query rectangle — a
 *  BROAD-phase result: it never returns false negatives (every primitive
 *  that truly overlaps is included), but may include primitives whose bbox
 *  overlaps without the primitive itself doing so (e.g. two segments whose
 *  boxes touch at a corner but never actually cross). Deduplicated and
 *  returned in ascending id order. */
export function querySpatialIndex(index: SpatialIndex, x0: number, y0: number, x1: number, y1: number): number[] {
  if (index.incomplete) return [];
  const qx0 = Math.min(x0, x1), qx1 = Math.max(x0, x1);
  const qy0 = Math.min(y0, y1), qy1 = Math.max(y0, y1);
  const cx0 = Math.floor(qx0 / index.cellSize), cx1 = Math.floor(qx1 / index.cellSize);
  const cy0 = Math.floor(qy0 / index.cellSize), cy1 = Math.floor(qy1 / index.cellSize);
  const found = new Set<number>();
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const arr = index.cells.get(cellKey(cx, cy));
      if (!arr) continue;
      for (const id of arr) found.add(id);
    }
  }
  return [...found].sort((a, b) => a - b);
}
