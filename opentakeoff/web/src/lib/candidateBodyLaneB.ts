// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — "multi-lane candidate-
// body proposal," Lane B: subpath and connected-component identity.
//
// FIRST slice, explicitly scoped: builds initial body components by
// unioning (1) every primitive within one subpath (a figure's own ink is
// always one component — trivially true, since a subpath IS a contiguous
// drawn figure) and (2) primitives joined at a LOW-degree junction
// (dangling/pass-through/corner — computeVectorSceneJunctions,
// vectorSceneRelations.ts), while explicitly NOT unioning across a
// high-degree junction (t/x/multi). That is requirement 2's "split
// components at high-degree junctions" half.
//
// Deliberately NOT done in this slice (disclosed, not silently skipped —
// see PROGRESS.md for the running account):
// - Per-pair splitting within one junction: a junction is treated ATOMICALLY
//   as either "continues through" or "split point" for ALL of its members
//   at once. A real T-junction where a carrier runs straight through and
//   only a third segment branches off (the classic inline-tee shape) is
//   classified "t" (degree 3) and therefore splits into three SEPARATE
//   singleton components here, even though the two collinear through-arms
//   could, in principle, still be recognized as one continuing run with
//   only the branch peeling off. That finer, angle-aware distinction is
//   further work, not attempted in this first slice.
// - Requirement 2's OTHER half, "split at long carrier runs": a duct/pipe
//   run can chain through many degree-2 (pass-through) junctions for a
//   very long real-world distance without ever crossing a high-degree
//   junction, and this module has no scale (ft/px) to judge "long" against
//   — that judgment already exists in web/src/lib/mepconnectivity.ts (per
//   the goal document's own diagnosis of the current codebase) and must be
//   REUSED there, not reimplemented here, per "audit before you build."
// - Requirement 3: representing carrier attachment ports separately from
//   body primitives for an inline symbol.
// - Requirement 4: keeping alternative segmentations when a split is
//   ambiguous — this slice always produces exactly one partition.
// Every candidate this slice proposes is therefore an UPPER BOUND on the
// real symbol body when a carrier run is attached without a high-degree
// junction in between (e.g. a valve inline on an otherwise-straight duct
// run drawn as one continuous subpath) — a known, disclosed limitation,
// not a silent inaccuracy.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { Junction } from "./vectorSceneRelations.ts";

/** Same disclosed-cap ethos as every other VectorSceneIndex-family module. */
export const LANE_B_MAX_PRIMITIVES = 250_000;

export interface CandidateBody {
  id: number;
  /** every primitive id belonging to this component, ascending. */
  primitiveIds: number[];
  x0: number; y0: number; x1: number; y1: number;
}

export interface LaneBResult {
  bodies: CandidateBody[];
  incomplete: boolean;
  incompleteReason: string | null;
}

/** Junction kinds that are NOT a split point — the component continues
 *  through them. Only t/x/multi (degree ≥ 3) are split points: a real
 *  branch, not a continuation of one figure or one straight/cornered run. */
const CONTINUES_THROUGH: ReadonlySet<Junction["kind"]> = new Set(["dangling", "pass-through", "corner"]);

/** Pure: proposes initial candidate bodies from a built VectorSceneIndex and
 *  its own computeVectorSceneJunctions result. Never mutates either input. */
export function proposeCandidateBodiesLaneB(
  idx: VectorSceneIndex,
  junctions: Junction[],
  opts: { maxPrimitives?: number } = {},
): LaneBResult {
  const cap = opts.maxPrimitives ?? LANE_B_MAX_PRIMITIVES;
  const n = idx.primitives.length;
  if (n > cap) {
    return {
      bodies: [],
      incomplete: true,
      incompleteReason: `primitive count ${n} exceeds the ${cap}-primitive Lane B cap; no bodies were proposed`,
    };
  }
  if (n === 0) return { bodies: [], incomplete: false, incompleteReason: null };

  // Union-find over primitive ids, path-compressed, union by attachment
  // (no explicit rank — component sizes here are bounded by one sheet's
  // primitive count, not large enough to need it for this slice).
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  // (1) one subpath's own ink is always one component.
  for (const sp of idx.subpaths) {
    for (let k = 1; k < sp.primitiveIds.length; k++) union(sp.primitiveIds[0], sp.primitiveIds[k]);
  }
  // (2) union across every junction EXCEPT a high-degree split point.
  for (const j of junctions) {
    if (!CONTINUES_THROUGH.has(j.kind)) continue;
    for (let k = 1; k < j.members.length; k++) union(j.members[0].primitiveId, j.members[k].primitiveId);
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let arr = groups.get(r);
    if (!arr) { arr = []; groups.set(r, arr); }
    arr.push(i);
  }

  const bodies: CandidateBody[] = [];
  let id = 0;
  for (const primitiveIds of groups.values()) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pid of primitiveIds) {
      const p = idx.primitives[pid];
      const px0 = Math.min(p.x0, p.x1), px1 = Math.max(p.x0, p.x1);
      const py0 = Math.min(p.y0, p.y1), py1 = Math.max(p.y0, p.y1);
      if (px0 < x0) x0 = px0; if (px1 > x1) x1 = px1;
      if (py0 < y0) y0 = py0; if (py1 > y1) y1 = py1;
    }
    bodies.push({ id: id++, primitiveIds: primitiveIds.slice().sort((a, b) => a - b), x0, y0, x1, y1 });
  }
  return { bodies, incomplete: false, incompleteReason: null };
}
