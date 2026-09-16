// Double-line duct centerline extraction (maturity plan Phase 3,
// PLAN_CONNECTIVITY_SERVES.md) — a duct drawn as two parallel boundary
// lines is, today, two disconnected pieces of wall-shaped ink to
// buildMepGraph: nothing joins them into one walkable run, and nothing
// measures the run's own linear footage. This module finds those
// parallel-pair boundaries at a plausible duct width and, for each
// matched pair, adds the centerline segment directly between them — the
// midpoint of every point on one boundary and its corresponding point on
// the other, over their shared overlap range.
//
// A first attempt built this via JTS's own Polygonizer/VoronoiDiagramBuilder
// (buffer each matched boundary by its own half-width, union into one
// footprint polygon, take a Voronoi-diagram medial axis of the footprint).
// That is the textbook technique for skeletonizing an ARBITRARY polygon,
// but it has a real, well-known failure mode this module's own shape
// doesn't need to pay for: densifying a long straight boundary into many
// site points (needed for a faithful medial axis) makes the Voronoi
// diagram of those points also produce many short "rung" edges between
// ADJACENT points on the SAME side — real Voronoi edges, not skeleton
// noise by any geometric definition, but not the medial axis either, and
// a simple length-based prune does not reliably tell the two apart
// (confirmed directly: a plain 200x60px rectangle produced well over a
// hundred spurious short edges instead of one clean centerline). A duct's
// own boundary is not an arbitrary blob — it is a network of matched
// PAIRS of near-straight segments, and this module already computes
// exactly which segment matches which, and over what shared range, to
// find those pairs in the first place; the centerline between an already-
// known-matched pair is just their midline, no generic skeletonization
// needed. Kept the Voronoi attempt's own doc trail here rather than
// silently swapping techniques, same "prefer an honest documented ceiling
// over an unsafe heuristic" discipline as the rest of this project.
//
// Deliberately NOT run on every sheet by default: "a corridor is also two
// parallel lines" (PLAN_CONNECTIVITY_SERVES.md's own Phase 3 warning) — the
// plausible-duct-width gate is this module's only defense against reading
// architectural double-lines (corridors, wall cavities) as ductwork, so
// callers on an unlayered sheet must size that gate deliberately, never
// widen it to "whatever's convenient."

export type Point = [number, number];

export interface DuctPairOpts {
  /** Plausible duct width floor, real feet. Default 0.2ft (2.4"). */
  minWidthFt?: number;
  /** Plausible duct width ceiling, real feet. Default 5ft (60") — real
   *  HVAC duct schedules run small round branches to large rectangular
   *  trunks; wider than this is architecture (a corridor, a wall cavity),
   *  narrower is a hairline/leader, not a duct boundary. Provisional — no
   *  real MEP corpus has tuned this yet, same disclosed-approximation
   *  discipline as mepconnectivity.ts's own DEFAULT_SNAP_FT. */
  maxWidthFt?: number;
  /** Degrees off exactly-parallel still considered a match. Default 3. */
  angleTolDeg?: number;
  /** Fraction of the SHORTER candidate's own length that must overlap
   *  along the shared run axis to count as a real paired boundary, not a
   *  coincidental alignment. Default 0.5. */
  minOverlapFrac?: number;
  /** Coordinate snap grid (px) for merging two different matched pairs'
   *  own centerline endpoints into one shared node — real corners/branches
   *  where several pairs meet rarely land on the identical float. Default
   *  4px (RENDER_SCALE 2 -> 2pt at the PDF's own scale). */
  snapPx?: number;
}

const DEFAULT_MIN_WIDTH_FT = 0.2;
const DEFAULT_MAX_WIDTH_FT = 5;
const DEFAULT_ANGLE_TOL_DEG = 3;
const DEFAULT_MIN_OVERLAP_FRAC = 0.5;
const DEFAULT_SNAP_PX = 4;
// Real, found live (Bessemer, ~38K real segments, sheet scale unset so
// buildMepGraph's own PX_PER_FT_GUESS fallback made maxWidthPx a
// meaningless-for-this-sheet 60px): without a cap, the candidate-pair scan
// below is unbounded on a dense real sheet and threw outright
// (`RangeError: Set maximum size exceeded`) rather than degrading —
// exactly the failure mode controlSchematic.ts's own
// MAX_INTERSECTION_CANDIDATES ceiling already exists to prevent for the
// identical class of problem (this project's own precedent, matched here
// rather than inventing a different number).
const MAX_CANDIDATE_PAIRS = 2_000_000;

interface Seg { x1: number; y1: number; x2: number; y2: number; }

const segLen = (s: Seg): number => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
// Undirected angle 0..180 — a line and its own reverse read identically,
// the same convention buildMepGraph's own segment handling assumes.
const segAngle = (s: Seg): number => {
  let a = Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
};
const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
};

export interface DuctPair {
  /** The two ORIGINAL segment indices this centerline piece was matched from. */
  segA: number; segB: number;
  /** The centerline segment itself — the midline between the two matched
   *  boundaries over their shared overlap range. */
  at1: Point; at2: Point;
  /** The REAL, literal boundary-segment endpoint (segA's or segB's own,
   *  whichever bounded the overlap at that end) nearest to at1/at2 — the
   *  exact coordinate ordinary noding already turns into a graph node,
   *  used to bridge a centerline's own open end back into the boundary
   *  graph WITHOUT a radius search over unrelated nearby linework. */
  anchor1: Point[]; anchor2: Point[];
  /** The measured perpendicular gap between the two boundaries (px) —
   *  callers wiring this into a graph edge can use this as the duct's own
   *  measured width. */
  widthPx: number;
}

/** Every plausible duct-width parallel PAIR of boundary segments, each with
 *  its own centerline piece already computed. Spatially bucketed (never
 *  O(segments^2)) — the exact lesson mepconnectivity.ts's own junction-scan
 *  performance fix already learned the hard way (see buildMepGraph's own
 *  header comment on that). A single long real boundary line matching
 *  several different opposite partners along its own length (common when a
 *  CAD export splits one physical duct run into multiple vector segments)
 *  produces several separate DuctPair entries whose centerline pieces
 *  chain together end to end once snapped by coordinate, not one entry —
 *  callers build the actual connected network from the full list. */
export function findDuctPairs(
  segs: number[],
  ppf: number,
  opts: DuctPairOpts = {},
): DuctPair[] {
  const minWidthPx = (opts.minWidthFt ?? DEFAULT_MIN_WIDTH_FT) * ppf;
  const maxWidthPx = (opts.maxWidthFt ?? DEFAULT_MAX_WIDTH_FT) * ppf;
  const angleTol = opts.angleTolDeg ?? DEFAULT_ANGLE_TOL_DEG;
  const minOverlapFrac = opts.minOverlapFrac ?? DEFAULT_MIN_OVERLAP_FRAC;
  const n = segs.length >> 2;
  const all: Seg[] = [];
  for (let i = 0; i < n; i++) all.push({ x1: segs[i * 4], y1: segs[i * 4 + 1], x2: segs[i * 4 + 2], y2: segs[i * 4 + 3] });

  const cell = Math.max(maxWidthPx * 2, 8);
  const buckets = new Map<string, number[]>();
  const bucketsFor = (s: Seg): string[] => {
    const x0 = Math.floor((Math.min(s.x1, s.x2) - maxWidthPx) / cell), x1 = Math.floor((Math.max(s.x1, s.x2) + maxWidthPx) / cell);
    const y0 = Math.floor((Math.min(s.y1, s.y2) - maxWidthPx) / cell), y1 = Math.floor((Math.max(s.y1, s.y2) + maxWidthPx) / cell);
    const out: string[] = [];
    for (let bx = x0; bx <= x1; bx++) for (let by = y0; by <= y1; by++) out.push(`${bx},${by}`);
    return out;
  };
  all.forEach((s, i) => { for (const k of bucketsFor(s)) { let b = buckets.get(k); if (!b) { b = []; buckets.set(k, b); } b.push(i); } });

  const pairs: DuctPair[] = [];
  const tested = new Set<number>();
  outer:
  for (let i = 0; i < n; i++) {
    const a = all[i];
    const la = segLen(a);
    if (la < 1e-6) continue;
    const angA = segAngle(a);
    const midA: Point = [(a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2];
    const dirA: Point = [(a.x2 - a.x1) / la, (a.y2 - a.y1) / la];
    const candidates = new Set<number>();
    for (const k of bucketsFor(a)) for (const j of buckets.get(k) || []) if (j !== i) candidates.add(j);
    for (const j of candidates) {
      const pairKey = i < j ? i * n + j : j * n + i;
      if (tested.has(pairKey)) continue;
      // A dense real sheet (thousands of segments all within maxWidthPx of
      // each other — measured live on a real corpus sheet whose scale
      // hadn't been set, making maxWidthPx an oversized guess rather than
      // a real per-sheet measurement) can make this candidate set grow
      // past what a Set can even hold, let alone what's worth computing.
      // Stops cleanly with whatever real pairs were already found, the
      // same "an honest, bounded partial result over an unbounded crash"
      // discipline controlSchematic.ts's own MAX_INTERSECTION_CANDIDATES
      // ceiling already established for the identical class of problem.
      if (tested.size >= MAX_CANDIDATE_PAIRS) break outer;
      tested.add(pairKey);
      const b = all[j];
      const lb = segLen(b);
      if (lb < 1e-6) continue;
      if (angleDiff(angA, segAngle(b)) > angleTol) continue;
      // perpendicular offset: project b's own midpoint onto a's infinite line
      const midB: Point = [(b.x1 + b.x2) / 2, (b.y1 + b.y2) / 2];
      const nx = -dirA[1], ny = dirA[0]; // unit normal to a
      const signedOffset = (midB[0] - midA[0]) * nx + (midB[1] - midA[1]) * ny;
      const offset = Math.abs(signedOffset);
      if (offset < minWidthPx || offset > maxWidthPx) continue;
      // overlap along the shared axis (a's own direction), parametrized
      // from midA so both segments' own endpoints project onto one line
      const proj = (p: Point): number => (p[0] - midA[0]) * dirA[0] + (p[1] - midA[1]) * dirA[1];
      const aLo = -la / 2, aHi = la / 2;
      const b1 = proj([b.x1, b.y1]), b2 = proj([b.x2, b.y2]);
      const bLo = Math.min(b1, b2), bHi = Math.max(b1, b2);
      const lo = Math.max(aLo, bLo), hi = Math.min(aHi, bHi);
      const overlap = hi - lo;
      const shorter = Math.min(la, lb);
      if (overlap < minOverlapFrac * shorter) continue;
      // midline point at parameter t (along a's own axis, from midA): the
      // average of a's own point at t and b's corresponding point at t —
      // b's points are affine in its own parameter, so a linear map from
      // a's t to b's own t (via the shared overlap range) gives the
      // correct corresponding point even when a and b have different
      // lengths or slightly different endpoints.
      const aAt = (t: number): Point => [midA[0] + t * dirA[0], midA[1] + t * dirA[1]];
      const bAt = (t: number): Point => {
        const bt = b1 === b2 ? 0 : (t - b1) / (b2 - b1);
        return [b.x1 + bt * (b.x2 - b.x1), b.y1 + bt * (b.y2 - b.y1)];
      };
      const midline = (t: number): Point => {
        const pa = aAt(t), pb = bAt(t);
        return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
      };
      // The REAL boundary endpoint that constrains each end of the shared
      // overlap range — whichever of A/B is the shorter-reaching one at
      // that end (t === aLo/aHi means A's own real endpoint stopped the
      // overlap there; otherwise B's did) is, by construction, one of that
      // segment's own two literal endpoints — a coordinate ordinary
      // JTS noding already turns into a real graph node. Exact float
      // equality is safe here: lo/hi are `Math.max`/`Math.min` of aLo/aHi/
      // bLo/bHi directly, never a further computed value.
      // Checked independently, not either/or — a duct whose two
      // boundaries have the identical overlap extent (the ordinary case:
      // two same-length parallel lines) ties at BOTH ends, and an
      // either/or pick silently bridges only one side, every time, on
      // exactly the common symmetric case (confirmed directly: a plain
      // straight duct left its own second boundary line completely
      // unbridged, unreachable from the centerline).
      const anchor1: Point[] = [];
      if (lo === aLo) anchor1.push(aAt(lo));
      if (lo === bLo) anchor1.push(bAt(lo));
      const anchor2: Point[] = [];
      if (hi === aHi) anchor2.push(aAt(hi));
      if (hi === bHi) anchor2.push(bAt(hi));
      pairs.push({ segA: i, segB: j, at1: midline(lo), at2: midline(hi), widthPx: offset, anchor1, anchor2 });
    }
  }
  return pairs;
}

export interface CenterlineNode {
  at: Point; edges: number[];
  /** The real boundary-segment endpoint nearest this node, when this node
   *  came from exactly one DuctPair's own end (see DuctPair's own anchor1/
   *  anchor2 comment). Only ever meaningful for a genuine degree-1 open
   *  end — a node several pairs share (a real corner or a chained run)
   *  has no single answer and this is not consulted there. */
  anchor?: Point[];
}
export interface CenterlineEdge {
  a: number; b: number; length: number; widthPx: number;
  /** true when this edge bridges a real corner gap (bridgeCornerGaps's own
   *  doing) rather than being drawn ink measured directly between two
   *  matched boundaries. */
  bridged?: boolean;
}
export interface CenterlineNetwork { nodes: CenterlineNode[]; edges: CenterlineEdge[]; }

/** Assemble the full list of matched-pair centerline pieces into a single
 *  connected-graph network, snapping coincident (within snapPx) endpoints
 *  from DIFFERENT pairs into one shared node — the real mechanism by which
 *  several short, per-pair centerline pieces along one long physical run
 *  (or meeting at a real corner/branch) join into one walkable network. */
export function assembleCenterlineNetwork(pairs: DuctPair[], snapPx: number = DEFAULT_SNAP_PX): CenterlineNetwork {
  const grid = Math.max(snapPx, 1e-6);
  const dq = (v: number) => Math.round(v / grid) * grid;
  const nodeIndex = new Map<string, number>();
  const nodes: CenterlineNode[] = [];
  const nodeFor = (p: Point, anchor: Point[]): number => {
    const key = `${dq(p[0])},${dq(p[1])}`;
    const existing = nodeIndex.get(key);
    if (existing != null) return existing;
    const idx = nodes.length;
    nodes.push({ at: [dq(p[0]), dq(p[1])], edges: [], anchor });
    nodeIndex.set(key, idx);
    return idx;
  };
  const edges: CenterlineEdge[] = [];
  const edgeKeys = new Set<string>();
  for (const p of pairs) {
    if (Math.hypot(p.at2[0] - p.at1[0], p.at2[1] - p.at1[1]) < 1e-6) continue;
    const a = nodeFor(p.at1, p.anchor1), b = nodeFor(p.at2, p.anchor2);
    if (a === b) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    const ei = edges.length;
    edges.push({ a, b, length: Math.hypot(nodes[b].at[0] - nodes[a].at[0], nodes[b].at[1] - nodes[a].at[1]), widthPx: p.widthPx });
    nodes[a].edges.push(ei); nodes[b].edges.push(ei);
  }
  return { nodes, edges };
}

/** A real elbow's own two centerline pieces (one per straight leg) do NOT
 *  meet at a shared point, even though the physical duct is one
 *  continuous run — each pair's own midline is bounded by the SHORTER of
 *  its two matched boundaries, and a real mitered/cut inner corner ends
 *  short of where the outer corner does, on both legs, leaving a real
 *  geometric gap between the two legs' own centerline ends (confirmed
 *  directly: a clean 90-degree, 60px-wide elbow left a 45px gap — on the
 *  order of width*sqrt(2)/2, the size of the corner's own cut triangle,
 *  and genuinely scaled to the LOCAL duct's own width, not a sheet-wide
 *  constant — confirmed the same way: a first attempt using a single
 *  sheet-wide ceiling (the plausible-duct-width gate's own max) also
 *  wrongly bridged the run's two real OPEN ends across an unrelated
 *  288px gap, since that ceiling has no relationship to any actual corner
 *  on the sheet). Tolerance for a given dangling pair is instead derived
 *  from the width of whichever of the two candidates' own single incident
 *  edge is wider — real, local evidence a corner could plausibly be that
 *  size, not an arbitrary global bound. Bridges the nearest MUTUAL pair
 *  of dangling (degree-1) centerline ends within that pair's own
 *  tolerance, the same "only ever admit a nearest mutual match, never
 *  merely a nearby one" discipline bridgeDanglingGaps in
 *  mepconnectivity.ts already uses for the same reason (a dangler with
 *  several plausible partners nearby is exactly the case a greedy
 *  nearest-neighbor-only pass gets wrong). Also refuses to bridge a pair
 *  already connected in the network as it stands (Union-Find over the
 *  existing edges) — confirmed directly this matters, not just defensive:
 *  a short duct STUB (both real ends dangling, close enough together to
 *  sit inside their own width-based tolerance) otherwise "bridged" to
 *  itself, a meaningless parallel self-loop. Bridge edges are marked
 *  `bridged: true`, same convention as MepEdge's own — synthesized, not
 *  drawn ink, so a caller computing confidence can weigh it accordingly. */
function bridgeCornerGaps(net: CenterlineNetwork, toleranceMult: number = 1.5): CenterlineNetwork {
  const nodes = net.nodes.map((n) => ({ at: n.at, edges: n.edges.slice(), anchor: n.anchor }));
  const edges = net.edges.map((e) => ({ ...e }));
  const danglers = nodes.map((n, i) => ({ n, i })).filter((x) => x.n.edges.length === 1);
  const widthAt = (nodeIdx: number): number => edges[nodes[nodeIdx].edges[0]].widthPx;
  const tolFor = (a: number, b: number): number => Math.max(widthAt(a), widthAt(b)) * toleranceMult;
  // Union-Find over the network AS IT STANDS (before any bridge) — a
  // short duct's own two ends are both dangling and can sit well within
  // any reasonable width-based tolerance of EACH OTHER (confirmed
  // directly: a 50px-long, 60px-wide stub's own two real ends "bridged"
  // to themselves, a meaningless self-loop). Two danglers already
  // connected by the run's own drawn ink are never a real corner gap —
  // bridging them adds nothing and risks exactly that kind of nonsense
  // parallel edge, so any pair already in the same component is refused
  // regardless of distance.
  const parent = nodes.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  edges.forEach((e) => { const ra = find(e.a), rb = find(e.b); if (ra !== rb) parent[ra] = rb; });
  const used = new Set<number>();
  for (let a = 0; a < danglers.length; a++) {
    if (used.has(danglers[a].i)) continue;
    let best = -1, bestD = Infinity;
    for (let b = 0; b < danglers.length; b++) {
      if (a === b || used.has(danglers[b].i)) continue;
      if (find(danglers[a].i) === find(danglers[b].i)) continue;
      const A = danglers[a].n, B = danglers[b].n;
      const d = Math.hypot(A.at[0] - B.at[0], A.at[1] - B.at[1]);
      if (d > 0 && d <= tolFor(danglers[a].i, danglers[b].i) && d < bestD) { bestD = d; best = b; }
    }
    if (best < 0) continue;
    // mutual: best's own nearest-within-tolerance dangler must be `a` too
    let mutualBest = -1, mutualD = Infinity;
    for (let c = 0; c < danglers.length; c++) {
      if (c === best || used.has(danglers[c].i)) continue;
      if (find(danglers[best].i) === find(danglers[c].i)) continue;
      const B = danglers[best].n, C = danglers[c].n;
      const d = Math.hypot(B.at[0] - C.at[0], B.at[1] - C.at[1]);
      if (d > 0 && d <= tolFor(danglers[best].i, danglers[c].i) && d < mutualD) { mutualD = d; mutualBest = c; }
    }
    if (mutualBest !== a) continue;
    used.add(danglers[a].i); used.add(danglers[best].i);
    const ai = danglers[a].i, bi = danglers[best].i;
    const ei = edges.length;
    edges.push({ a: ai, b: bi, length: bestD, widthPx: 0, bridged: true });
    nodes[ai].edges.push(ei); nodes[bi].edges.push(ei);
    const ra = find(ai), rb = find(bi); if (ra !== rb) parent[ra] = rb;
  }
  return { nodes, edges };
}

/** The full pipeline: find duct-width parallel boundary pairs, assemble
 *  them into one connected centerline network, and bridge real corner
 *  gaps between adjacent legs. Pure geometry — no graph-splicing here;
 *  the caller (buildMepGraph's own opt-in flag) owns turning this into
 *  MepEdge/MepNode entries and bridging them into the rest of the graph. */
export function extractDuctCenterlines(
  segs: number[],
  ppf: number,
  opts: DuctPairOpts = {},
): CenterlineNetwork {
  const pairs = findDuctPairs(segs, ppf, opts);
  const net = assembleCenterlineNetwork(pairs, opts.snapPx ?? DEFAULT_SNAP_PX);
  return bridgeCornerGaps(net);
}
