// MEP connectivity tracing (maturity plan Phase 4) — which valve belongs to
// which equipment, traced through the sheet's own drawn linework. The one
// piece this codebase has already named as deliberately deferred work in
// its own comments (oneclick.ts/confidence.ts's "RFC item A" — vector-
// native topology for connectivity). No existing consumer of vector
// segments traces a PATH through connected geometry; every one does either
// flood-fill room boundaries (oneclick.ts), isolated repeated-symbol
// matching (symbolsweep.ts), or hatch-family/wall detection (wallnetwork.ts).
//
// Reuses this project's own already-vendored JTS port (jsts) for the
// genuinely hard sub-problem — robust noding of real, messy CAD linework
// (duplicated collinear segments, near-coincident parallels, mid-edge
// T-junctions) — via the EXACT pattern polyarr.ts (room-detection) already
// uses and has already proven against real plans: GeometryFactory +
// snap-quantize + UnaryUnionOp.union. Found by re-checking OSS specifically
// for this phase, not assumed; graphology remains correctly rejected (see
// the maturity plan doc) — the point was never "no library helps," it was
// "no GENERIC GRAPH library helps with the genuinely hard part," and a
// TOPOLOGY library already in this project's own dependency tree does.
//
// A real attribution problem JTS's own noding doesn't solve for free: its
// noded output is bare geometry with no memory of which ORIGINAL segment
// (and therefore which MEP system / which layer) a given output sub-edge
// came from. Rather than lean on JTS's own output as the graph's edges
// (and lose that provenance), this module uses JTS ONLY to find WHERE the
// real junctions are (every coordinate appearing in the noded output), then
// SPLITS the original segments itself at those points — so every resulting
// edge is a literal sub-piece of exactly one original segment and inherits
// its system tag losslessly, no recovery/matching heuristic needed.

import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import Coordinate from "jsts/org/locationtech/jts/geom/Coordinate.js";
import UnaryUnionOp from "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js";
import { classifyMepLayerName, mepLayerSignal, type MepSystemRole } from "./mepsystems.ts";
import type { LayerInfo } from "./layers.ts";

export type LayerSignal = "none" | "weak" | "strong";
export type Point = [number, number];

export interface MepNode { x: number; y: number; edges: number[]; }
export interface MepEdge {
  a: number; b: number;
  length: number;
  system: MepSystemRole;
  systemConfidence: number;
  /** true when this edge bridges a real drawn gap through a recognized
   *  symbol placement (traceConnectivity's own doing, added after the base
   *  graph is built) — never set by buildMepGraph itself. */
  bridged?: boolean;
}
export interface MepGraph { nodes: MepNode[]; edges: MepEdge[]; layerSignal: LayerSignal; }

// Mirrors wallnetwork.ts's own SEG_CLIP bit exactly — invisible ink is
// never a real run there and isn't one here either. Kept as a literal
// (not imported) since wallnetwork.ts doesn't export it; both modules read
// the identical bit position from the same segMeta convention.
const SEG_CLIP_BIT = 2;

// Provisional — no real MEP corpus has tuned this yet (a named open risk in
// the maturity plan doc). ~2 inches at whatever scale mppf states; falls
// back to a px-per-foot guess when the sheet's own scale is unknown,
// mirroring wallnetwork.ts's identical fallback discipline (a known,
// disclosed approximation, not silently assumed to be exact).
const DEFAULT_SNAP_FT = 0.15;
const PX_PER_FT_GUESS = 12;

export interface BuildMepGraphOpts {
  /** Image-px -> world/mask px factor. Default 1 (already in world space). */
  ws?: number;
  /** Mask px per real foot; 0/undefined = sheet scale unknown (falls back
   *  to PX_PER_FT_GUESS, same discipline as wallnetwork.ts). */
  mppf?: number;
  /** Per-segment metadata byte (SEG_CLIP bit) — optional; omit if the
   *  caller has already filtered invisible ink out of `segs`. */
  meta?: Uint8Array;
  /** Per-segment declared-layer index, for MEP system classification. */
  layerOf?: Int32Array | number[];
  /** The sheet's own declared layers (id/name/role/...). */
  layers?: LayerInfo[];
  /** A general pre-computed exclusion mask, one entry per segment — the
   *  CALLER's own combination of "annotation/finish-pattern layer" (via
   *  layers.ts's segRoles) and/or "already vouched as wall"
   *  (wallnetwork.ts's networkWallSegs output). This module does not
   *  re-derive LayerRole itself — that classification already exists one
   *  layer up and re-deriving it here would risk the two disagreeing. */
  excludeSegs?: Uint8Array;
  /** Junction-coincidence tolerance in feet. Default DEFAULT_SNAP_FT. */
  snapFt?: number;
}

const q = (v: number, grid: number) => Math.round(v / grid) * grid;
const coordKey = (x: number, y: number) => `${x},${y}`;

/** Every quantized coordinate that appears anywhere in a noded MultiLineString
 *  — a junction wherever 2+ ORIGINAL lines crossed or touched, per JTS's own
 *  robust noding (see this module's header comment for why we read junction
 *  POSITIONS from it but never its edges directly). */
function collectJunctionCoords(noded: { getNumGeometries(): number; getGeometryN(i: number): { getCoordinates(): Array<{ x: number; y: number }> } }, grid: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < noded.getNumGeometries(); i++) {
    for (const c of noded.getGeometryN(i).getCoordinates()) out.add(coordKey(q(c.x, grid), q(c.y, grid)));
  }
  return out;
}

/** Build the connectivity graph from a sheet's own vector segments. Pure —
 *  no PDF/DOM. Segments are [x1,y1,x2,y2, ...] flat, the same shape
 *  symbolsweep.ts/wallnetwork.ts already use. */
export function buildMepGraph(segs: number[], opts: BuildMepGraphOpts = {}): MepGraph {
  const layerSignal = mepLayerSignal(opts.layers, opts.layerOf);
  const n = segs.length >> 2;
  const ws = opts.ws ?? 1;
  const ppf = opts.mppf && opts.mppf > 0 ? opts.mppf : PX_PER_FT_GUESS;
  const grid = (opts.snapFt ?? DEFAULT_SNAP_FT) * ppf;

  // A per-segment system tag, computed once — from the segment's own
  // declared layer under a real layerSignal, "unknown" (never guessed)
  // otherwise. classifyMepLayerName is deliberately NOT called per-segment
  // repeatedly for the same layer id; cached by layer id.
  const systemCache = new Map<string, { system: MepSystemRole; confidence: number }>();
  const systemForLayer = (layerId: string | undefined): { system: MepSystemRole; confidence: number } => {
    if (layerSignal === "none" || layerId === undefined) return { system: "unknown", confidence: 0 };
    const cached = systemCache.get(layerId);
    if (cached) return cached;
    const info = opts.layers?.find((l) => l.id === layerId);
    const r = info ? classifyMepLayerName(info.name) : { system: "unknown" as MepSystemRole, confidence: 0 };
    systemCache.set(layerId, r);
    return r;
  };
  const layerIdFor = (segIdx: number): string | undefined => {
    if (!opts.layerOf || !opts.layers) return undefined;
    const li = opts.layerOf[segIdx];
    if (li == null || li < 0) return undefined;
    return opts.layers[li]?.id;
  };

  type Seg = { x1: number; y1: number; x2: number; y2: number; segIdx: number };

  // ── exclusion + quantize pass, at a given grid size ─────────────────────
  function quantizeSurvivors(gridPx: number): Seg[] {
    const out: Seg[] = [];
    for (let i = 0; i < n; i++) {
      if (opts.excludeSegs && opts.excludeSegs[i]) continue;
      if (opts.meta && (opts.meta[i] & SEG_CLIP_BIT)) continue;
      const x1 = q(segs[i * 4] * ws, gridPx), y1 = q(segs[i * 4 + 1] * ws, gridPx);
      const x2 = q(segs[i * 4 + 2] * ws, gridPx), y2 = q(segs[i * 4 + 3] * ws, gridPx);
      if (x1 === x2 && y1 === y2) continue;   // degenerate after quantizing
      out.push({ x1, y1, x2, y2, segIdx: i });
    }
    return out;
  }

  // ── JTS noding: find every real junction, exact input coordinates preserved ──
  // Real CAD exports routinely carry an exact-duplicate "double stroke" of
  // the same line, sometimes drawn in the OPPOSITE direction — measured,
  // not hypothetical: found on this project's own real Bessemer sample
  // (38K real segments) and confirmed to throw JTS's noding validator
  // outright (`TopologyException: found non-noded intersection`) if fed
  // through un-deduped. polyarr.ts (room-detection) already carries this
  // exact fix for the exact same reason — mirrored here, not reinvented.
  // Deliberately only de-dups what's fed to JTS for junction-finding; the
  // ORIGINAL survivors list (used to build edges below) keeps every
  // duplicate, since a harmless duplicate edge afterward costs nothing —
  // only the noding step itself is fragile to it.
  function nodeAt(gridPx: number): { survivors: Seg[]; junctions: Set<string> } {
    const survivors = quantizeSurvivors(gridPx);
    const seenKey = new Set<string>();
    const forNoding: Seg[] = [];
    for (const s of survivors) {
      const key = s.x1 < s.x2 || (s.x1 === s.x2 && s.y1 < s.y2)
        ? `${s.x1},${s.y1},${s.x2},${s.y2}` : `${s.x2},${s.y2},${s.x1},${s.y1}`;
      if (seenKey.has(key)) continue;
      seenKey.add(key);
      forNoding.push(s);
    }
    const gf = new GeometryFactory();
    const lines = forNoding.map((s) => gf.createLineString([new Coordinate(s.x1, s.y1), new Coordinate(s.x2, s.y2)]));
    const noded = UnaryUnionOp.union(gf.createMultiLineString(lines));
    return { survivors, junctions: collectJunctionCoords(noded, gridPx) };
  }

  // A SEPARATE, real robustness issue from the duplicate-stroke one above,
  // also only found by actually running this against real, dense corpus
  // data (Bessemer page 6, 38K real segments) — not hypothetical: JTS's own
  // internal noding/snap-rounding can throw `TopologyException` on some
  // real, densely-packed linework even after de-duplication, computing an
  // internal coordinate that differs from a legitimate input by float noise
  // far too small to be a real second grid cell (confirmed by hand: this
  // project's own quantize function is provably deterministic for the
  // exact inputs that triggered it — the failure is inside JTS's own
  // overlay/snap machinery, not this module's). The honest, pragmatic fix:
  // retry at a coarser grid (a real junction still resolves, just with a
  // looser tolerance) rather than let one pathological sheet crash tracing
  // outright; if every retry still fails, refuse loudly rather than return
  // a silently-degraded graph the caller has no way to know is degraded.
  let survivors: Seg[] = [], junctions: Set<string> = new Set();
  let solvedGrid = grid;
  const gridAttempts = [grid, grid * 3, grid * 9, grid * 27];
  let lastErr: unknown;
  let solved = false;
  for (const g of gridAttempts) {
    try {
      const r = nodeAt(g);
      survivors = r.survivors; junctions = r.junctions; solvedGrid = g;
      solved = true;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!solved) {
    throw new Error(`This sheet's linework could not be reliably noded for connectivity tracing (JTS noding failed at every retry grid up to ${gridAttempts[gridAttempts.length - 1].toFixed(2)}px) — the underlying error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
  }
  if (!survivors.length) return { nodes: [], edges: [], layerSignal };

  // ── split each ORIGINAL segment at every junction that lies strictly
  //    inside it — never at its own two endpoints, which are already nodes ──
  const nodeIndex = new Map<string, number>();
  const nodes: MepNode[] = [];
  const edges: MepEdge[] = [];
  const nodeFor = (x: number, y: number): number => {
    const key = coordKey(x, y);
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = nodes.length;
    nodes.push({ x, y, edges: [] });
    nodeIndex.set(key, idx);
    return idx;
  };
  const addEdge = (ax: number, ay: number, bx: number, by: number, segIdx: number) => {
    if (ax === bx && ay === by) return;
    const { system, confidence } = systemForLayer(layerIdFor(segIdx));
    const a = nodeFor(ax, ay), b = nodeFor(bx, by);
    const ei = edges.length;
    edges.push({ a, b, length: Math.hypot(bx - ax, by - ay), system, systemConfidence: confidence });
    nodes[a].edges.push(ei); nodes[b].edges.push(ei);
  };

  for (const s of survivors) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    // interior junctions on THIS segment, parametrized 0..1 along it
    const interior: number[] = [];
    for (const key of junctions) {
      const [jx, jy] = key.split(",").map(Number);
      if ((jx === s.x1 && jy === s.y1) || (jx === s.x2 && jy === s.y2)) continue;
      const t = ((jx - s.x1) * dx + (jy - s.y1) * dy) / len2;
      if (t <= 0 || t >= 1) continue;
      // collinearity: perpendicular distance from (jx,jy) to the segment's
      // own line must be within the grid the noding attempt actually
      // succeeded at — a real junction on this run, not an unrelated crossing.
      const px = s.x1 + t * dx, py = s.y1 + t * dy;
      if (Math.hypot(jx - px, jy - py) > solvedGrid + 1e-6) continue;
      interior.push(t);
    }
    interior.sort((a, b) => a - b);
    let prevX = s.x1, prevY = s.y1;
    for (const t of interior) {
      const jx = q(s.x1 + t * dx, solvedGrid), jy = q(s.y1 + t * dy, solvedGrid);
      addEdge(prevX, prevY, jx, jy, s.segIdx);
      prevX = jx; prevY = jy;
    }
    addEdge(prevX, prevY, s.x2, s.y2, s.segIdx);
  }

  return { nodes, edges, layerSignal };
}

// ── the tracing query ────────────────────────────────────────────────────
// Refusal doctrine matches sweep_schedule_row/resolve_tag exactly — a
// hard-won discipline already tested there, not reinvented loosely here.

export type TraceStatus = "reached" | "ambiguous" | "dead_end" | "refused";

export interface TraceOptions {
  /** How many edge-hops to walk before giving up. Default DEFAULT_MAX_HOPS. */
  maxHops?: number;
  /** Real feet per graph-space unit; falls back to PX_PER_FT_GUESS when the
   *  sheet's own scale is unknown, same discipline as buildMepGraph. */
  mppf?: number;
  /** How close (feet) a seed or equipment point must sit to a graph node to
   *  be considered "on" it. Default DEFAULT_SEED_TOL_FT. */
  seedTolFt?: number;
  /** Real, already-swept equipment placements (symbol_sweep/
   *  sweep_schedule_row's own output shape) — required. No symbols
   *  supplied is a named refusal, not a silent "found nothing." */
  equipmentSymbols: Array<{ id: string; at: Point; label?: string }>;
}

export interface TraceBranch { at: Point; leads_to: string | null; reason?: string }

export interface TraceResult {
  status: TraceStatus;
  path?: Point[];
  reachedEquipment?: { id: string; at: Point };
  branches?: TraceBranch[];
  layer_signal: LayerSignal;
  system?: MepSystemRole;
  confidence: number;
  factors: string[];
  reason?: string;
}

const DEFAULT_MAX_HOPS = 60;
const DEFAULT_SEED_TOL_FT = 1.0;

function nearestNodeWithin(graph: MepGraph, pt: Point, tolPx: number): number | null {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const d = Math.hypot(n.x - pt[0], n.y - pt[1]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best >= 0 && bestD <= tolPx ? best : null;
}

/** Walk the graph from `from`, looking for exactly one reachable equipment
 *  symbol. Never invents a `reachedEquipment` from nearest-as-the-crow-flies
 *  — an equipment id only counts when a real, walked path of connected
 *  edges reaches the node its own placement snapped to. */
export function traceConnectivity(graph: MepGraph, from: Point, opts: TraceOptions): TraceResult {
  const layer_signal = graph.layerSignal;
  const factors: string[] = [];
  if (layer_signal === "none") factors.push("layer-unclassified");

  if (!opts.equipmentSymbols || !opts.equipmentSymbols.length) {
    return { status: "refused", layer_signal, confidence: 0, factors: [], reason: "No equipment symbols supplied — sweep the target family first (symbol_sweep or sweep_schedule_row), then pass their placements here." };
  }
  if (!graph.nodes.length) {
    return { status: "refused", layer_signal, confidence: 0, factors: [], reason: "This sheet has no traced vector linework to walk — check sheet_info.has_vector_linework before tracing." };
  }
  const ppf = opts.mppf && opts.mppf > 0 ? opts.mppf : PX_PER_FT_GUESS;
  const tolPx = (opts.seedTolFt ?? DEFAULT_SEED_TOL_FT) * ppf;
  const seed = nearestNodeWithin(graph, from, tolPx);
  if (seed == null) {
    return { status: "refused", layer_signal, confidence: 0, factors: [], reason: "The seed point isn't on any traced linework — click directly on a drawn pipe/duct/conduit line." };
  }

  // equipment placements -> their nearest graph node, within the same
  // tolerance. An equipment whose placement sits too far from any node
  // simply never appears as reachable — correctly excluded, not an error.
  const equipAtNode = new Map<number, { id: string; at: Point }>();
  for (const eq of opts.equipmentSymbols) {
    const ni = nearestNodeWithin(graph, eq.at, tolPx);
    if (ni != null && !equipAtNode.has(ni)) equipAtNode.set(ni, eq);
  }

  const maxHops = opts.maxHops ?? DEFAULT_MAX_HOPS;
  const parent = new Map<number, number>();
  const depth = new Map<number, number>([[seed, 0]]);
  const visited = new Set<number>([seed]);
  const queue: number[] = [seed];
  const reached: Array<{ node: number; id: string; at: Point }> = [];
  let hitCap = false;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const d = depth.get(cur)!;
    const eq = equipAtNode.get(cur);
    if (eq && cur !== seed) reached.push({ node: cur, ...eq });
    if (d >= maxHops) { hitCap = true; continue; }
    for (const ei of graph.nodes[cur].edges) {
      const e = graph.edges[ei];
      const next = e.a === cur ? e.b : e.a;
      if (visited.has(next)) continue;
      visited.add(next); parent.set(next, cur); depth.set(next, d + 1);
      queue.push(next);
    }
  }

  const nodePathTo = (node: number): number[] => {
    const out: number[] = [];
    let cur: number | undefined = node;
    while (cur !== undefined) { out.push(cur); cur = parent.get(cur); }
    return out.reverse();
  };
  const pointsOf = (nodePath: number[]): Point[] => nodePath.map((i) => [graph.nodes[i].x, graph.nodes[i].y]);
  const edgeBetween = (a: number, b: number): MepEdge | undefined =>
    graph.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

  const distinctIds = [...new Set(reached.map((r) => r.id))];

  if (distinctIds.length >= 2) {
    // The last node common to every reached equipment's own path from the
    // seed — the real junction where the trace's outcome actually forked.
    // One representative branch (the shallowest divergence), not every
    // individual fork in a denser tree — a real, disclosed v1 scope limit.
    const paths = reached.filter((r, i) => reached.findIndex((x) => x.id === r.id) === i).map((r) => ({ id: r.id, at: r.at, nodePath: nodePathTo(r.node) }));
    // the longest shared prefix (by NODE, not by coordinate) across every
    // reached equipment's own path from the seed — the node right before it
    // diverges is the real junction where the trace's outcome actually forked.
    let common = 0;
    for (; ; common++) {
      const node = paths[0].nodePath[common];
      if (node === undefined) break;
      if (paths.some((p) => p.nodePath[common] !== node)) break;
    }
    const branchNode = paths[0].nodePath[Math.max(0, common - 1)];
    const branchAt: Point = [graph.nodes[branchNode].x, graph.nodes[branchNode].y];
    return {
      status: "ambiguous", layer_signal, confidence: 0, factors,
      branches: paths.map((p) => ({ at: branchAt, leads_to: p.id })),
      reason: `${distinctIds.length} different equipment placements (${distinctIds.join(", ")}) are all reachable within ${maxHops} hops from a junction near (${branchAt[0].toFixed(1)}, ${branchAt[1].toFixed(1)}) — a real branch, not picked from; view_sheet there to see which run this device actually follows.`,
    };
  }

  if (distinctIds.length === 1) {
    const hit = reached[0];
    const nodePath = nodePathTo(hit.node);
    const path = pointsOf(nodePath);
    const hops = nodePath.length - 1;
    if (hops > 30) factors.push(`long-trace(${hops} hops)`);
    const systems = new Set<MepSystemRole>();
    for (let i = 1; i < nodePath.length; i++) {
      const e = edgeBetween(nodePath[i - 1], nodePath[i]);
      if (e) systems.add(e.system);
    }
    const system = systems.size === 1 ? [...systems][0] : undefined;
    let confidence = 1;
    if (factors.includes("layer-unclassified")) confidence *= 0.85;
    if (hops > 30) confidence *= 0.9;
    return {
      status: "reached", layer_signal, confidence, factors,
      path, reachedEquipment: { id: hit.id, at: hit.at },
      ...(system ? { system } : {}),
    };
  }

  return {
    status: "dead_end", layer_signal, confidence: 0, factors,
    reason: hitCap
      ? `Hit the ${maxHops}-hop limit without reaching any known equipment placement — raise max_hops and retry, or the target may genuinely be unconnected within this many hops.`
      : "Ran out of connected linework without reaching any known equipment placement — a genuine dead end, or the run may continue off-sheet at a match line this tracer has no cross-sheet awareness of.",
  };
}
