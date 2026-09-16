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
import type { Bbox } from "./sheetgraph.ts";
import { extractDuctCenterlines } from "./ductcenterline.ts";
import { detectDashedRuns } from "./dashdetect.ts";
import { hatchFamilies } from "./oneclick.ts";

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
  /** "centerline" when this edge is buildMepGraph's OWN synthesized
   *  double-line-duct centerline (detectDoubleLineDuctCenterlines, Phase
   *  3) rather than a literal sub-piece of one drawn segment — the
   *  original boundary edges stay in the graph unchanged as provenance;
   *  this is additive. Absent for every other edge, including a
   *  centerline's own corner-bridge pieces (ductcenterline.ts's own
   *  `bridged` flag on those folds into this edge's `bridged` above, not
   *  a second `derived` value). */
  derived?: "centerline";
  /** true when this edge's own ORIGINAL segment was part of a detected
   *  dashed run (dashdetect.ts's own detectDashedSegs, Phase 1 item 1 —
   *  this corpus's own real CAD exports never use the PDF setDash
   *  operator, so straight dash cadences must be read geometrically).
   *  Only ever set when detectDashedLines is on; a real, disclosed line-
   *  style signal for a future `relation: "controls"` walk (Phase 5 item
   *  1 — Bessemer's own real T-thermostat-to-baseboard-heater dashed
   *  lines) to prefer or restrict to, never used by traceConnectivity's
   *  own ordinary duct/pipe walk today. */
  dashed?: boolean;
  /** Present only when `dashed` is true — the SAME run id
   *  dashdetect.ts's own detectDashedRuns assigns (see its own doc
   *  comment): two dashed edges sharing a dashRunId are the SAME real
   *  dash run and may be bridged together; two dashed edges with
   *  DIFFERENT dashRunIds are not known to be the same run and must never
   *  be bridged on proximity alone. A real, disclosed prerequisite for a
   *  future `relation: "controls"` gap-bridging walk (Phase 5 item 1) —
   *  the actual bridging mechanism itself is NOT built here, only the run
   *  identity it would need. */
  dashRunId?: number;
}
export interface MepGraph {
  nodes: MepNode[]; edges: MepEdge[]; layerSignal: LayerSignal;
  /** The junction-snap grid (px) noding actually SUCCEEDED at — see the
   *  coarsen-and-retry comment below. Starts at DEFAULT_SNAP_FT * ppf but a
   *  dense real sheet can force a much coarser retry grid to get a graph at
   *  all; every node/edge coordinate in that graph is then only accurate to
   *  within this many px of the sheet's own real drawn ink. traceConnectivity
   *  reads this back as a seed/equipment resolution tolerance FLOOR (see its
   *  own header comment) — a fixed seedTolFt sized for the fine grid would
   *  otherwise falsely refuse a seed sitting exactly on real linework whose
   *  own coordinates the coarse retry grid has since shifted further away
   *  than that fixed tolerance allows. */
  quantGridPx: number;
  /** Diagnostic: how many junction candidates the interior-junction scan
   *  below actually tested. The naive scan tests every junction against
   *  every survivor (survivors x junctions); the spatial index prunes that
   *  to the junctions genuinely near each segment. The perf gate in
   *  mepconnectivity.test.ts asserts on THIS rather than on wall clock —
   *  the elapsed-milliseconds bound it used to carry passed in isolation
   *  and failed under the test runner's own 4-way parallel load, which is
   *  a property of the machine, not of this scan. Counted work is the
   *  thing the fix actually changed, and it is deterministic. */
  junctionTests: number;
  /** Whether this graph was built with requireJunctionMarkForCrossings
   *  on. traceConnectivity reads this back to pick its own default hop
   *  budget (see DEFAULT_MAX_HOPS_GATED's own comment) — a real,
   *  measured effect of the gate on real corpus paths, not a guess. */
  crossingGated: boolean;
}

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

// PLAN_CONNECTIVITY_SERVES.md Phase 1 item 2 / Phase 2 (#22) prep — a real
// drawn junction dot/hatch mark, ported verbatim from controlSchematic.ts's
// own private hasJunctionMark (that module's crossing-vs-junction rule for
// schematic/riser topology). Same fixed px radius that module already
// carries and is already tested against; kept literal rather than
// scale-derived for fidelity to that existing, proven behavior.
const DEFAULT_JUNCTION_MARK_RADIUS_PX = 8;

/** A compact cluster of ≥5 short segments (each no longer than 1.6x the
 *  radius) spread across ≥3 of the 4 quadrants around (x,y) — the drawn
 *  shape of a real junction dot/hatch mark. A pure crossing (two lines
 *  merely passing through the same point, drawn at different real
 *  elevations with no intent to connect) essentially never produces this;
 *  a real T/tee/cross junction often does. `candidates` is the caller's
 *  own pre-filtered nearby-segment index list (never the whole sheet) —
 *  see buildMepGraph's own spatial bucket for the reference caller. */
export function hasJunctionMark(
  segs: Array<{ x1: number; y1: number; x2: number; y2: number }>,
  candidates: number[],
  x: number,
  y: number,
  radiusPx: number = DEFAULT_JUNCTION_MARK_RADIUS_PX,
): boolean {
  const near = candidates.map((i) => segs[i]).filter((seg) => {
    const len = Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
    return len <= radiusPx * 1.6
      && Math.hypot(seg.x1 - x, seg.y1 - y) <= radiusPx
      && Math.hypot(seg.x2 - x, seg.y2 - y) <= radiusPx;
  });
  if (near.length < 5) return false;
  const quadrants = new Set<number>();
  for (const seg of near) {
    const mx = (seg.x1 + seg.x2) / 2 - x, my = (seg.y1 + seg.y2) / 2 - y;
    quadrants.add((mx >= 0 ? 1 : 0) + (my >= 0 ? 2 : 0));
  }
  return quadrants.size >= 3;
}

/** A node's own two short incident edges forming a compact wide-angle
 *  V — the drawn shape of a vector arrowhead — with a third, meaningfully
 *  longer incident edge roughly bisecting that V from the outside: the
 *  arrow's shaft. PLAN_CONNECTIVITY_SERVES.md Phase 1 item 2 / #22 prep,
 *  ported verbatim from controlSchematic.ts's own private per-node loop
 *  inside `topologyFor` (that module's only user of directionality) — a
 *  second, generic (module-shape-agnostic) copy of the exact same
 *  geometry, not a reimplementation. Takes plain node/edge arrays rather
 *  than a MepGraph directly: no current buildMepGraph caller consumes
 *  edge direction (duct/pipe tracing has no drawn arrowhead convention to
 *  read), so this stays a standalone utility until one does, the same way
 *  hasJunctionMark started as one before buildMepGraph's own crossing gate
 *  needed it. Returns one shaft-edge direction per detected arrow rather
 *  than mutating anything — every existing caller's own edge/arrow record
 *  shape differs (MepEdge has no `direction` field; SchematicEdge's is
 *  named differently), so applying the result back onto a caller's own
 *  edges is left to the caller, same as topologyFor's own post-loop
 *  assignment did. */
export interface ArrowDetectNode { at: Point; edges: number[]; }
export interface ArrowDetectEdge { a: number; b: number; length: number; }
export interface DetectedArrow {
  /** The node the arrowhead's own tip sits at. */
  tip: Point;
  /** Index into the `edges` array passed in — the arrow's shaft, now
   *  known to run "toward" this arrow's own tip node. */
  shaftEdge: number;
  /** Which end of the shaft edge the tip is at, in that edge's own (a, b)
   *  terms — the caller's own direction vocabulary maps onto this. */
  tipEnd: "a" | "b";
}
export function detectArrowDirections(
  nodes: ArrowDetectNode[],
  edges: ArrowDetectEdge[],
): DetectedArrow[] {
  const nodeEdges: number[][] = nodes.map((n) => n.edges);
  const arrows: DetectedArrow[] = [];
  const usedShafts = new Set<number>();
  for (let nodeId = 0; nodeId < nodes.length; nodeId++) {
    const node = nodes[nodeId];
    const incident = nodeEdges[nodeId].map((ei) => ({ ei, e: edges[ei] }));
    const short = incident.filter(({ e }) => e.length >= 4 && e.length <= 32);
    for (let i = 0; i < short.length; i++) {
      for (let j = i + 1; j < short.length; j++) {
        const vector = ({ e }: { e: ArrowDetectEdge }): [number, number] => {
          const otherId = e.a === nodeId ? e.b : e.a;
          const other = nodes[otherId].at;
          const len = Math.max(e.length, 1e-9);
          return [(other[0] - node.at[0]) / len, (other[1] - node.at[1]) / len];
        };
        const va = vector(short[i]), vb = vector(short[j]);
        const angle = Math.acos(Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1]))) * 180 / Math.PI;
        if (angle < 25 || angle > 100) continue;
        const bx = va[0] + vb[0], by = va[1] + vb[1];
        const bl = Math.hypot(bx, by);
        if (bl < 0.2) continue;
        const ux = bx / bl, uy = by / bl;
        const shaft = incident
          .filter(({ ei, e }) => ei !== short[i].ei && ei !== short[j].ei && e.length > Math.max(short[i].e.length, short[j].e.length) * 1.4)
          .map((cand) => ({ ...cand, v: vector(cand) }))
          .filter(({ v }) => v[0] * ux + v[1] * uy > 0.9)
          .sort((a, b) => b.e.length - a.e.length)[0];
        if (!shaft || usedShafts.has(shaft.ei)) continue;
        usedShafts.add(shaft.ei);
        arrows.push({ tip: node.at, shaftEdge: shaft.ei, tipEnd: shaft.e.a === nodeId ? "a" : "b" });
      }
    }
  }
  return arrows;
}

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
  /** DEFAULT OFF (undefined/false reproduces today's behavior byte-for-
   *  byte — see the Gate 1 requirement in PLAN_CONNECTIVITY_SERVES.md).
   *  When true, a junction coordinate where NO original segment actually
   *  ENDS (every segment touching it only passes through — a pure
   *  interior-interior crossing) only coalesces into one shared,
   *  cross-segment-connected node when `hasJunctionMark` finds real drawn
   *  junction evidence nearby; otherwise each crossing segment keeps its
   *  own separate node at that coordinate (geometrically coincident, never
   *  topologically connected) — the fix for known-gaps ledger item #22
   *  (real ducts/pipes at different elevations legitimately cross without
   *  connecting). A genuine T/tee/corner (at least one segment's own
   *  endpoint lands there) is NEVER gated by this option — real junction
   *  evidence from the drawing's own topology always wins regardless of
   *  a hatch mark being present or not. */
  requireJunctionMarkForCrossings?: boolean;
  /** Radius (image px) hasJunctionMark searches for corroborating short
   *  segments. Default DEFAULT_JUNCTION_MARK_RADIUS_PX (8px, matching
   *  controlSchematic.ts's own already-tested value). Only meaningful when
   *  requireJunctionMarkForCrossings is true. */
  junctionMarkRadiusPx?: number;
  /** DEFAULT OFF (undefined/false reproduces today's behavior byte-for-
   *  byte, same Gate-1 discipline as requireJunctionMarkForCrossings
   *  above). When true, ductcenterline.ts's own parallel-pair detector
   *  runs over `segs` and any duct-width match gets a NEW, synthesized
   *  `derived: "centerline"` edge added to the graph (system: "ductwork"),
   *  bridged into the rest of the graph at its own open ends — the
   *  original boundary edges are never removed or altered, this is purely
   *  additive. "A corridor is also two parallel lines"
   *  (PLAN_CONNECTIVITY_SERVES.md's own Phase 3 warning) — never flip this
   *  on for an unlayered sheet without deliberately sizing
   *  ductMinWidthFt/ductMaxWidthFt first. */
  detectDoubleLineDuctCenterlines?: boolean;
  /** Plausible duct width floor/ceiling, real feet — forwarded verbatim to
   *  ductcenterline.ts's own findDuctPairs; see that module's own defaults
   *  and disclosed-provisional caveat. Only meaningful when
   *  detectDoubleLineDuctCenterlines is true. */
  ductMinWidthFt?: number;
  ductMaxWidthFt?: number;
  /** DEFAULT OFF (undefined/false reproduces today's behavior byte-for-
   *  byte, same Gate-1 discipline as every other option here). When true,
   *  dashdetect.ts's own detectDashedSegs runs once over `segs` and every
   *  resulting edge inherits `dashed: true` from whichever ORIGINAL
   *  segment it split from — purely a label on existing edges, never a
   *  change to which edges exist or how they connect (unlike
   *  requireJunctionMarkForCrossings/detectDoubleLineDuctCenterlines,
   *  this can't itself create a topology regression), but still gated the
   *  same way as everything else here rather than assumed free — a real,
   *  unmeasured per-sheet cost on top of noding, not yet worth paying by
   *  default until a real consumer (Phase 5's own `relation: "controls"`)
   *  exists.
   *
   *  REAL, DISCLOSED GAP found 2026-09-16 verifying `bridgeDashedGaps`
   *  below against real Bessemer data: this detector flagged 13,216 of
   *  28,998 real sheet edges (45.6%) as "dashed," in runs as large as 502
   *  pieces — sampled geometry shows tight alternating ~5px zigzag
   *  segments, unmistakably a HATCH/CROSSHATCH FILL PATTERN, not a real
   *  dashed line. The SAME chain tolerance that correctly accepts a real
   *  exporter's reversed-path-winding dash pieces (this module's own
   *  tested "reversed-direction" case) also accepts a zigzag hatch fill's
   *  own alternating strokes on real, dense, unlayered CAD data — never
   *  caught before because no prior test ran this detector over a WHOLE
   *  real sheet and checked how much of it gets flagged.
   *
   *  FIXED the same day: whenever `opts.meta` is available, every segment
   *  belonging to a detected `hatchFamilies` (oneclick.ts — the correct
   *  name; an earlier version of this comment mis-cited a nonexistent
   *  `hatchFamilies.ts` file) instance is excluded from dash
   *  classification before it ever runs, mirroring how this module's own
   *  wall-vouching already excludes architectural ink before MEP noding.
   *  Without `meta` (no per-segment pen-width/flag data), no exclusion is
   *  computed — the same disclosed, byte-identical fallback this option's
   *  own `detectDashedLines`/`bridgeDashedGaps` gates already use
   *  elsewhere, not a silent guess. Re-verified against the same real
   *  Bessemer sheet that found the original gap — see
   *  PLAN_CONNECTIVITY_SERVES.md's own Phase 5 section for the measured
   *  before/after flagged-edge count. */
  detectDashedLines?: boolean;
  /** DEFAULT OFF, and only takes effect when `detectDashedLines` is ALSO
   *  on (an edge needs its own `dashRunId` for this to have anything to
   *  bridge). Joins every real drawn GAP between two consecutive dash
   *  pieces of the SAME run (dashdetect.ts's own detectDashedRuns run
   *  identity) with a synthetic edge — the pieces are never
   *  JTS-noding-connected to each other on their own (that gap is
   *  literally what makes a line look dashed), so this is the only way a
   *  future `relation: "controls"` walk can ever cross one at all.
   *  Bridging is gated on SHARING a dashRunId, never on proximity alone —
   *  two DIFFERENT dash runs (even two adjacent, parallel control-wire
   *  home-runs) are never joined just because they sit close together,
   *  the identical real over-connection risk shape
   *  `detectDoubleLineDuctCenterlines`'s own bridging above already found
   *  and fixed once (a radius-search bridge merging a real duct with an
   *  unrelated control line on real Bessemer data) — dashRunId's own
   *  equality check is the safety gate a proximity tolerance can't be. */
  bridgeDashedGaps?: boolean;
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
  if (!survivors.length) return { nodes: [], edges: [], layerSignal, quantGridPx: solvedGrid, junctionTests: 0, crossingGated: !!opts.requireJunctionMarkForCrossings };

  // ── split each ORIGINAL segment at every junction that lies strictly
  //    inside it — never at its own two endpoints, which are already nodes ──
  const nodeIndex = new Map<string, number>();
  const nodes: MepNode[] = [];
  const edges: MepEdge[] = [];
  // keyOverride: when present, coalesce ONLY with other calls sharing the
  // identical override string, never with the plain coordinate — how a
  // gated (un-vouched, non-endpoint) crossing point keeps each segment's
  // own node separate at the same (x,y). Omitted (the default, and always
  // the case when requireJunctionMarkForCrossings is off), this is
  // byte-identical to the original plain coordKey(x,y) lookup.
  const nodeFor = (x: number, y: number, keyOverride?: string): number => {
    const key = keyOverride ?? coordKey(x, y);
    const existing = nodeIndex.get(key);
    if (existing !== undefined) return existing;
    const idx = nodes.length;
    nodes.push({ x, y, edges: [] });
    nodeIndex.set(key, idx);
    return idx;
  };
  // Purely a label on edges that already exist — never changes which
  // edges exist or how they connect, so unlike the crossing gate/
  // centerline options above this can't itself cause a topology
  // regression — but still computed only when asked for (Gate-1
  // discipline held uniformly, not selectively), a real, unmeasured
  // per-sheet cost this project's own performance history (buildMepGraph's
  // own junction-scan fix) says never to assume is free.
  //
  // Hatch-fill exclusion (real, disclosed gap found 2026-09-16 — see
  // detectDashedLines's own doc comment above): only computable when real
  // per-segment `meta` exists, since hatchFamilies (oneclick.ts) needs it
  // to classify stroked hatch ink from everything else. No `meta` at all
  // means no exclusion is computed — byte-identical to before this fix,
  // never a silent guess at which segments are hatch fill.
  const dashHatchExclude = opts.detectDashedLines && opts.meta
    ? (() => {
        const mask = new Uint8Array(n);
        for (const fam of hatchFamilies(segs, opts.meta!)) for (const idx of fam.memberIdx) mask[idx] = 1;
        return mask;
      })()
    : undefined;
  const dashedRuns = opts.detectDashedLines ? detectDashedRuns(segs, opts.meta, { mppf: ppf, excludeSegs: dashHatchExclude }) : null;
  const addEdge = (
    ax: number, ay: number, bx: number, by: number, segIdx: number,
    aKey?: string, bKey?: string,
  ) => {
    if (ax === bx && ay === by) return;
    const { system, confidence } = systemForLayer(layerIdFor(segIdx));
    const a = nodeFor(ax, ay, aKey), b = nodeFor(bx, by, bKey);
    const ei = edges.length;
    const dashed = dashedRuns && dashedRuns.flags[segIdx] === 1;
    edges.push({
      a, b, length: Math.hypot(bx - ax, by - ay), system, systemConfidence: confidence,
      ...(dashed ? { dashed: true as const, dashRunId: dashedRuns!.runIds[segIdx] } : {}),
    });
    nodes[a].edges.push(ei); nodes[b].edges.push(ei);
  };

  // ── crossing gate (default OFF — see BuildMepGraphOpts's own doc) ──────
  // endpointKeys: every coordinate where some ORIGINAL segment actually
  // ends — a real junction there always coalesces exactly as before,
  // regardless of any hatch-mark evidence. crossingVouched: for every
  // OTHER junction coordinate (a pure interior-interior crossing), whether
  // real drawn junction-mark evidence corroborates connecting it — cached,
  // since the same coordinate is tested once per participating segment.
  let endpointKeys: Set<string> | null = null;
  let crossingVouched: ((key: string) => boolean) | null = null;
  if (opts.requireJunctionMarkForCrossings) {
    endpointKeys = new Set<string>();
    for (const s of survivors) {
      endpointKeys.add(coordKey(s.x1, s.y1));
      endpointKeys.add(coordKey(s.x2, s.y2));
    }
    const radiusPx = opts.junctionMarkRadiusPx ?? DEFAULT_JUNCTION_MARK_RADIUS_PX;
    // spatial bucket over survivor MIDPOINTS — the same provable-pruning
    // idea the junction spatial index below already uses for the same
    // reason (never test every segment against every candidate point).
    const markCell = Math.max(radiusPx * 2, 16);
    const segBuckets = new Map<string, number[]>();
    survivors.forEach((s, idx) => {
      const mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
      const k = `${Math.floor(mx / markCell)},${Math.floor(my / markCell)}`;
      let b = segBuckets.get(k);
      if (!b) { b = []; segBuckets.set(k, b); }
      b.push(idx);
    });
    const nearbySegs = (x: number, y: number): number[] => {
      const cx = Math.floor(x / markCell), cy = Math.floor(y / markCell);
      const out: number[] = [];
      for (let bx = cx - 1; bx <= cx + 1; bx++) {
        for (let by = cy - 1; by <= cy + 1; by++) {
          const cand = segBuckets.get(`${bx},${by}`);
          if (cand) out.push(...cand);
        }
      }
      return out;
    };
    const vouchedCache = new Map<string, boolean>();
    crossingVouched = (key: string): boolean => {
      const cached = vouchedCache.get(key);
      if (cached !== undefined) return cached;
      const [jx, jy] = key.split(",").map(Number);
      const v = hasJunctionMark(survivors, nearbySegs(jx, jy), jx, jy, radiusPx);
      vouchedCache.set(key, v);
      return v;
    };
  }
  // The node key a specific (jx,jy) split point on segment segIdx should
  // use — undefined (plain shared coordKey, coalescing across every
  // segment touching that point) unless the gate is on AND this point is
  // a pure, un-vouched crossing, in which case a segment-scoped key keeps
  // this segment's own node separate from any other segment's own node at
  // the identical coordinate.
  const effectiveKey = (jx: number, jy: number, segIdx: number): string | undefined => {
    if (!endpointKeys || !crossingVouched) return undefined;
    const k = coordKey(jx, jy);
    if (endpointKeys.has(k)) return undefined;
    if (crossingVouched(k)) return undefined;
    return `${k}#seg${segIdx}`;
  };

  // Spatial index over the junctions, so the per-segment scan below never
  // has to test every junction against every segment — a real, measured,
  // dominant cost (accuracy-hardening plan, later session): profiled on a
  // real, dense itd-d1-lab sheet, this naive O(survivors × junctions) scan
  // alone cost 128.5s of a real 129.4s total trace (25,843 survivors ×
  // 24,843 junctions = 642M inner iterations), while JTS's own noding —
  // the part that LOOKS like the expensive computational-geometry step —
  // took only 714ms. A junction can only ever lie ON a segment within
  // `solvedGrid` of it, so bucketing junctions by real 2D proximity and
  // only testing a segment against junctions in its OWN nearby buckets is a
  // pure, provably-safe pruning of the identical test below — it never
  // changes which junctions count as interior, only skips ones too far
  // away to ever qualify, the same way `find`'s own spatial candidates work
  // elsewhere in this codebase (e.g. `clusterByProximity` in inlinemotif.ts).
  const junctionPts: [number, number][] = [];
  for (const key of junctions) {
    const [jx, jy] = key.split(",").map(Number);
    junctionPts.push([jx, jy]);
  }
  const cell = Math.max(solvedGrid * 16, 32);
  const jBuckets = new Map<string, number[]>();
  let junctionTests = 0;
  junctionPts.forEach(([jx, jy], idx) => {
    const k = `${Math.floor(jx / cell)},${Math.floor(jy / cell)}`;
    let b = jBuckets.get(k);
    if (!b) { b = []; jBuckets.set(k, b); }
    b.push(idx);
  });

  for (const s of survivors) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    // interior junctions on THIS segment, parametrized 0..1 along it —
    // candidates come only from buckets the segment's own (tolerance-
    // expanded) bounding box actually overlaps.
    const interior: number[] = [];
    const bx0 = Math.floor((Math.min(s.x1, s.x2) - solvedGrid) / cell);
    const bx1 = Math.floor((Math.max(s.x1, s.x2) + solvedGrid) / cell);
    const by0 = Math.floor((Math.min(s.y1, s.y2) - solvedGrid) / cell);
    const by1 = Math.floor((Math.max(s.y1, s.y2) + solvedGrid) / cell);
    for (let bx = bx0; bx <= bx1; bx++) {
      for (let by = by0; by <= by1; by++) {
        const cand = jBuckets.get(`${bx},${by}`);
        if (!cand) continue;
        for (const idx of cand) {
          junctionTests++;
          const [jx, jy] = junctionPts[idx];
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
      }
    }
    interior.sort((a, b) => a - b);
    // prevKey threads each interior split point's own effectiveKey through
    // to the NEXT addEdge call that starts there, so a single point on
    // THIS segment is referenced by the identical key both times it's
    // used (the edge ending there and the edge starting there) — the
    // segment's own internal chain always stays connected to itself; only
    // a DIFFERENT segment's own reference to the same coordinate can end
    // up gated apart. The segment's own true start (undefined here) and
    // true end (undefined in the final call below) are never gated —
    // gating only ever applies to a point STRICTLY INTERIOR to a segment.
    let prevX = s.x1, prevY = s.y1, prevKey: string | undefined;
    for (const t of interior) {
      const jx = q(s.x1 + t * dx, solvedGrid), jy = q(s.y1 + t * dy, solvedGrid);
      const jKey = effectiveKey(jx, jy, s.segIdx);
      addEdge(prevX, prevY, jx, jy, s.segIdx, prevKey, jKey);
      prevX = jx; prevY = jy; prevKey = jKey;
    }
    addEdge(prevX, prevY, s.x2, s.y2, s.segIdx, prevKey, undefined);
  }

  // ── Phase 3 (PLAN_CONNECTIVITY_SERVES.md): double-line duct centerlines,
  //    default OFF (Gate-1 discipline — see this option's own doc). Purely
  //    additive: every boundary node/edge above is untouched; this only
  //    ever ADDS new nodes/edges tagged derived: "centerline".
  //
  //    Requires a REAL, caller-supplied mppf — never the PX_PER_FT_GUESS
  //    fallback `ppf` above silently uses for everything else. Found
  //    live, not a defensive guess: on a real corpus sheet whose scale
  //    hadn't been set, the width gate (meant to be measured in real
  //    feet) became a meaningless-for-that-sheet guessed pixel range,
  //    matching so many segment pairs the candidate scan hit its own
  //    ceiling (ductcenterline.ts's own ledger). "A corridor is also two
  //    parallel lines" already means this gate needs real, deliberate
  //    tuning per PLAN_CONNECTIVITY_SERVES.md's own Phase 3 warning; a
  //    guessed scale makes that gate not just imprecise but meaningless. ─
  if (opts.detectDoubleLineDuctCenterlines && opts.mppf && opts.mppf > 0) {
    // The SAME survivor filtering the rest of this function already
    // applied (excludeSegs, the meta SEG_CLIP bit) — never the raw,
    // unfiltered `segs`. Found live, not a defensive guess: an excluded
    // wall or annotation segment is exactly the kind of ink
    // wallnetwork.ts's own vouching and layers.ts's own role classing
    // already decided is NOT real MEP linework, and without this filter
    // a wall's own double line (this module's header comment already
    // names "a corridor is also two parallel lines") could be matched as
    // a plausible duct boundary on the identical un-vetted footing a real
    // duct gets.
    const centerlineSegs: number[] = [];
    for (const s of survivors) centerlineSegs.push(s.x1, s.y1, s.x2, s.y2);
    const centerlineNet = extractDuctCenterlines(centerlineSegs, opts.mppf, {
      minWidthFt: opts.ductMinWidthFt, maxWidthFt: opts.ductMaxWidthFt,
    });
    if (centerlineNet.edges.length) {
      // A dedicated key namespace (never the plain coordKey) so a
      // centerline node is never accidentally coalesced with a real
      // boundary node landing at the identical coordinate — geometrically
      // near-impossible (a centerline sits at the perpendicular midpoint
      // between two boundaries) but never assumed, only guaranteed.
      const clNodeId = centerlineNet.nodes.map((n) => nodeFor(n.at[0], n.at[1], `centerline#${n.at[0]},${n.at[1]}`));
      for (const e of centerlineNet.edges) {
        const a = clNodeId[e.a], b = clNodeId[e.b];
        if (a === b) continue;
        const ei = edges.length;
        // Synthesized, not drawn ink — a real but lower confidence than an
        // actual traced segment; a corner bridge (interpolated across a
        // real gap, see ductcenterline.ts's own bridgeCornerGaps) is one
        // step further removed again.
        edges.push({
          a, b, length: e.length, system: "ductwork", systemConfidence: e.bridged ? 0.4 : 0.6,
          derived: "centerline", ...(e.bridged ? { bridged: true as const } : {}),
        });
        nodes[a].edges.push(ei); nodes[b].edges.push(ei);
      }
      // Bridge each centerline network's own genuine OPEN end (degree 1
      // within the centerline sub-network alone, i.e. never bridged to
      // another leg by ductcenterline.ts itself) to the EXACT existing
      // boundary node its own DuctPair anchor names — never a radius
      // search over nearby linework. A first version searched every
      // existing node within a duct-width-scaled radius instead, and on a
      // real, dense corpus sheet (Bessemer) that was a real, measured
      // regression, not a hypothetical one: 2,128 real centerline edges
      // produced 56,162 radius-search bridge edges, densely enough to
      // connect what should be separate systems (a duct run and a nearby
      // baseboard-heater control line) into one component — a previously
      // clean `reached`/HP-1 result on that sheet's own SR-1 rows turned
      // into `ambiguous`, and honest `unconnected` refusals elsewhere on
      // the same sheet dropped from 4/6 to 1/6. The anchor IS the specific
      // real segment endpoint (segA's or segB's own) that bounded this
      // exact centerline piece's own overlap range — quantized the same
      // way every other coordinate in this graph is, so it looks up the
      // literal existing node ordinary noding already made for it, not a
      // guess at what's nearby.
      centerlineNet.nodes.forEach((n, i) => {
        if (n.edges.length !== 1 || !n.anchor) return;
        const clId = clNodeId[i];
        // Usually one anchor; a duct whose two boundaries have the
        // identical overlap extent (two same-length parallel lines, the
        // ordinary case) ties at both, and both real endpoints get
        // bridged — see findDuctPairs's own anchor1/anchor2 comment for
        // why this must never be an either/or pick.
        for (const anchor of n.anchor) {
          const ax = q(anchor[0], solvedGrid), ay = q(anchor[1], solvedGrid);
          const anchorNodeId = nodeIndex.get(coordKey(ax, ay));
          if (anchorNodeId == null || anchorNodeId === clId) continue;
          const ei = edges.length;
          edges.push({
            a: clId, b: anchorNodeId, length: Math.hypot(nodes[anchorNodeId].x - n.at[0], nodes[anchorNodeId].y - n.at[1]),
            system: "ductwork", systemConfidence: 0.4, derived: "centerline", bridged: true,
          });
          nodes[clId].edges.push(ei); nodes[anchorNodeId].edges.push(ei);
        }
      });
    }
  }

  // ── dashed-gap bridging (Phase 5 item 1, PLAN_CONNECTIVITY_SERVES.md) ──
  // See BuildMepGraphOpts.bridgeDashedGaps's own doc comment for the full
  // doctrine. Edges sharing a dashRunId are grouped in the SAME order
  // addEdge already created them (buildMepGraph processes survivors
  // strictly in the order detectDashedRuns itself walked them to assign
  // that id) — the exact run order, so consecutive entries in each group
  // are genuinely adjacent dash pieces, not an arbitrary pairing.
  if (opts.bridgeDashedGaps && opts.detectDashedLines) {
    const byRun = new Map<number, number[]>();
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      if (!e.dashed || e.dashRunId == null) continue;
      let list = byRun.get(e.dashRunId);
      if (!list) { list = []; byRun.set(e.dashRunId, list); }
      list.push(i);
    }
    for (const runEdgeIdx of byRun.values()) {
      for (let k = 1; k < runEdgeIdx.length; k++) {
        const prev = edges[runEdgeIdx[k - 1]], cur = edges[runEdgeIdx[k]];
        // The closest pair of endpoints between two consecutive dash
        // pieces is the real gap this exact dash cadence actually draws —
        // the exporter may alternate path winding direction between
        // pieces (dashdetect.ts's own "reversed-direction" case), so all
        // 4 endpoint combinations are checked, never assumed a->a.
        let bestA = -1, bestB = -1, bestD = Infinity;
        for (const pa of [prev.a, prev.b]) {
          for (const pb of [cur.a, cur.b]) {
            if (pa === pb) continue;
            const d = Math.hypot(nodes[pa].x - nodes[pb].x, nodes[pa].y - nodes[pb].y);
            if (d < bestD) { bestD = d; bestA = pa; bestB = pb; }
          }
        }
        if (bestA < 0) continue;
        const ei = edges.length;
        edges.push({
          a: bestA, b: bestB, length: bestD, system: prev.system, systemConfidence: 0.4,
          dashed: true, dashRunId: prev.dashRunId, bridged: true,
        });
        nodes[bestA].edges.push(ei); nodes[bestB].edges.push(ei);
      }
    }
  }

  return { nodes, edges, layerSignal, quantGridPx: solvedGrid, junctionTests, crossingGated: !!opts.requireJunctionMarkForCrossings };
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
  /** Real, already-swept fitting/valve/damper placements — optional.
   *  Enables gap bridging (see bridgeDanglingGaps below): a drawn gap
   *  between two dead-end run-ends is bridged ONLY when one of these sits
   *  in it, never on proximity alone. Omit to disable bridging entirely. */
  fittingSymbols?: Array<{ at: Point }>;
  /** Widest gap (feet) a fitting symbol may bridge. Default DEFAULT_BRIDGE_FT. */
  bridgeFt?: number;
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
// Real, corpus-found (PLAN_CONNECTIVITY_SERVES.md Phase 2, #22): the
// crossing gate (requireJunctionMarkForCrossings) removes false shortcuts
// through un-vouched crossings (e.g. a hatch-fill tick or a different
// duct/pipe run merely passing through) — connections that let BFS jump
// between two nearby, otherwise-unconnected pieces of real linework. On a
// densely hatched real double-line duct, the CORRECT path (verified by
// rendering and following the drawn duct by eye — see
// itd-d1-lab.serves.csv's EQ.19->EF-1 row) can legitimately need
// noticeably more hops once those shortcuts are gone: measured directly on
// that exact real case (itd-d1-lab-mechanical.pdf#4, seed [2173,347] to
// EF-1), the gate-off graph reaches EF-1 in 59 hops, but the SAME real
// topological path in the gated graph needs 80 (confirmed connected, not
// broken, by raising maxHops and re-tracing — the walked node path matches
// the key's own hand-verified duct route point-for-point). DEFAULT_MAX_HOPS
// was never tuned with that inflation in mind, so a gated graph gets its
// own, higher default here rather than either (a) raising the global
// default and silently changing today's shipped gate-off behavior for
// everyone, or (b) leaving gated traces to falsely dead_end on real,
// connected, correctly-longer paths.
//
// Deliberately a SMALL margin over that one measured real need (80), not a
// generous multiplier — a first attempt at 120 was tried and rejected after
// direct evidence it costs more than it fixes: on this same real sheet, a
// second, physically distinct EQ.19 tag (near Janitor 105, its own local
// riser to its own EF-3 unit) sat an honest dead_end under every cap up to
// ~100, but at 118 hops a spurious path opens up crossing into the
// UNRELATED EF-1/Residency-Lab duct system — almost certainly this
// unlayered sheet's own wall linework (layer_signal:none means
// wallnetwork.ts's own wall-vouching, a real but disclosed-imperfect
// heuristic, is this graph's only defense against exactly that, see
// ensureMepGraph's own comment) rather than a real physical duct tie
// between the two zones. Confirmed directly: at maxHops 90 the same
// EQ.19(#2) row goes back to its prior, honest dead_end while the verified
// 80-hop EF-1 case still reaches — false-confident is a strictly worse
// failure than a dead_end (this module's whole refusal doctrine), so once
// real evidence showed a bigger cap trades one for the other, the smaller,
// still-sufficient value is the only defensible choice. Not a universal
// guarantee for every future corpus addition — a future verified case that
// needs more gets the same documented-ceiling treatment as DEFAULT_MAX_HOPS
// itself, re-measured against this exact trade-off, never a silent bump.
const DEFAULT_MAX_HOPS_GATED = 90;
const DEFAULT_SEED_TOL_FT = 1.0;
// Provisional — no real MEP corpus has measured this yet (a named open risk
// in the maturity plan doc), same honesty as buildMepGraph's own
// DEFAULT_SNAP_FT. Wider than DEFAULT_SNAP_FT on purpose: a single-line
// schematic run genuinely draws a real gap at a valve/damper (the fitting's
// own glyph occupies the space), not jitter — but still gated on a real
// symbol sitting in it, never bridged on proximity alone.
const DEFAULT_BRIDGE_FT = 2.0;

/** Resolve a real-world seed/equipment point against the graph — an
 *  existing NODE when one is close enough, or (a real, corpus-found gap —
 *  see below) a point strictly INSIDE an edge, spliced into a new node on a
 *  freshly-returned graph copy. Found live against the real Bessemer sample:
 *  every synthetic fixture case this module was first tested against
 *  happened to seed exactly AT a drawn segment's own endpoint, so an
 *  earlier version that only matched existing nodes passed every test and
 *  still refused almost every real seed — an estimator clicking partway
 *  along a real duct run (the ordinary, realistic gesture, same as
 *  one_click's own "click inside a room" doctrine) does not click on a
 *  vertex. Never mutates the input graph; a caller resolving several points
 *  in sequence must thread the returned graph into the next call, since a
 *  second point landing on the same edge must see the first splice. */
/** The real seed/equipment resolution tolerance (px) for this graph — never
 *  narrower than the grid quantizeSurvivors actually snapped this graph's
 *  own coordinates to (graph.quantGridPx), whatever seedTolFt the caller
 *  asked for. Extracted from traceConnectivity's own tolPx line (Phase 5,
 *  PLAN_CONNECTIVITY_SERVES.md item 2) so every new read-only operator
 *  built on the same resolveOnGraph seed-snapping shares this doctrine
 *  (see traceConnectivity's own header comment for the full history)
 *  instead of reimplementing it a second way — zero behavior change where
 *  traceConnectivity already computed this inline. */
export function seedTolPx(graph: MepGraph, mppf: number | undefined, seedTolFt?: number): number {
  const ppf = mppf && mppf > 0 ? mppf : PX_PER_FT_GUESS;
  return Math.max((seedTolFt ?? DEFAULT_SEED_TOL_FT) * ppf, graph.quantGridPx);
}

function resolveOnGraph(graph: MepGraph, pt: Point, tolPx: number): { graph: MepGraph; node: number | null } {
  let bestNode = -1, bestNodeD = Infinity;
  for (let i = 0; i < graph.nodes.length; i++) {
    const n = graph.nodes[i];
    const d = Math.hypot(n.x - pt[0], n.y - pt[1]);
    if (d < bestNodeD) { bestNodeD = d; bestNode = i; }
  }
  // Pass 1: the single closest edge overall — the common, unambiguous case
  // (one real duct nearby, nothing to prefer between).
  let bestEdge = -1, bestEdgeD = Infinity, bestT = 0, bestAt: Point = [0, 0];
  for (let i = 0; i < graph.edges.length; i++) {
    const e = graph.edges[i];
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    let t = ((pt[0] - a.x) * dx + (pt[1] - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a.x + t * dx, py = a.y + t * dy;
    const d = Math.hypot(pt[0] - px, pt[1] - py);
    if (d < bestEdgeD) { bestEdgeD = d; bestEdge = i; bestT = t; bestAt = [px, py]; }
  }
  // Pass 2 — ONLY when this graph was built with requireJunctionMarkForCrossings
  // (graph.crossingGated): default/off behavior above is untouched byte-for-
  // byte, same discipline as buildMepGraph's own flag (Gate 1,
  // PLAN_CONNECTIVITY_SERVES.md). Real, corpus-found (Phase 2 investigation,
  // itd-d1-lab-mechanical.pdf#4, seed [2328,448]): once the gate splits an
  // un-vouched crossing apart, the sheet's own double-line duct boundary can
  // leave a short RUN of the "other" boundary line stranded as its own tiny
  // isolated component — and that stranded fragment can sit measurably
  // CLOSER to a seed than the real, richly-connected duct network (measured:
  // d=3.4px to a 4-node/72px-long isolated fragment vs d=10.2px to the real
  // network, both well inside the seed's own tolPx tolerance). Fragment
  // length is no help distinguishing them (the isolated fragment here was
  // even the LONGER of the two edges) — component size is: a real duct
  // network is large, a gate-created stranded fragment is small. Among every
  // edge within the seed's own tolPx (not the fine quantGridPx grid — this
  // is a real placement-tolerance question, not a noding-precision one),
  // prefer the one whose endpoint belongs to the larger connected component
  // (capped, so this never costs a full graph traversal per candidate);
  // ties broken by distance, then by edge length, for full determinism.
  if (graph.crossingGated && bestEdge >= 0) {
    const CAP = 200;
    const componentSizeCapped = (start: number): number => {
      const visited = new Set<number>([start]);
      const queue = [start];
      for (let qi = 0; qi < queue.length && visited.size < CAP; qi++) {
        const cur = queue[qi];
        for (const ei of graph.nodes[cur].edges) {
          const e = graph.edges[ei];
          const next = e.a === cur ? e.b : e.a;
          if (visited.has(next)) continue;
          visited.add(next); queue.push(next);
          if (visited.size >= CAP) break;
        }
      }
      return visited.size;
    };
    let bestCompSize = componentSizeCapped(graph.edges[bestEdge].a);
    let bestLen = graph.edges[bestEdge].length;
    for (let i = 0; i < graph.edges.length; i++) {
      if (i === bestEdge) continue;
      const e = graph.edges[i];
      const a = graph.nodes[e.a], b = graph.nodes[e.b];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 === 0) continue;
      let t = ((pt[0] - a.x) * dx + (pt[1] - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + t * dx, py = a.y + t * dy;
      const d = Math.hypot(pt[0] - px, pt[1] - py);
      if (d > tolPx || d > bestEdgeD + tolPx) continue;
      const compSize = componentSizeCapped(e.a);
      const better = compSize > bestCompSize
        || (compSize === bestCompSize && (d < bestEdgeD - 1e-9
          || (Math.abs(d - bestEdgeD) <= 1e-9 && e.length > bestLen)));
      if (better) {
        bestCompSize = compSize; bestLen = e.length;
        bestEdge = i; bestEdgeD = d; bestT = t; bestAt = [px, py];
      }
    }
  }
  // an existing node wins ties (never splice a redundant near-duplicate)
  if (bestNode >= 0 && bestNodeD <= tolPx && bestNodeD <= bestEdgeD + 1e-9) return { graph, node: bestNode };
  if (bestEdge < 0 || bestEdgeD > tolPx) return { graph, node: null };
  const e = graph.edges[bestEdge];
  if (bestT <= 1e-6) return { graph, node: e.a };
  if (bestT >= 1 - 1e-6) return { graph, node: e.b };
  // splice: the old edge is left in place but unreferenced by any node's
  // own edges[] (a cheap tombstone) — BFS only ever walks node.edges, so a
  // dead edge is simply never reached, with no index to renumber elsewhere.
  const nodes = graph.nodes.map((n) => ({ ...n, edges: n.edges.slice() }));
  const edges = graph.edges.map((x) => ({ ...x }));
  const a = nodes[e.a], b = nodes[e.b];
  const newIdx = nodes.length;
  nodes.push({ x: bestAt[0], y: bestAt[1], edges: [] });
  a.edges = a.edges.filter((ei) => ei !== bestEdge);
  b.edges = b.edges.filter((ei) => ei !== bestEdge);
  const ei1 = edges.length;
  edges.push({ a: e.a, b: newIdx, length: Math.hypot(bestAt[0] - a.x, bestAt[1] - a.y), system: e.system, systemConfidence: e.systemConfidence, ...(e.bridged ? { bridged: true } : {}) });
  a.edges.push(ei1); nodes[newIdx].edges.push(ei1);
  const ei2 = edges.length;
  edges.push({ a: newIdx, b: e.b, length: Math.hypot(b.x - bestAt[0], b.y - bestAt[1]), system: e.system, systemConfidence: e.systemConfidence, ...(e.bridged ? { bridged: true } : {}) });
  nodes[newIdx].edges.push(ei2); b.edges.push(ei2);
  return { graph: { nodes, edges, layerSignal: graph.layerSignal, quantGridPx: graph.quantGridPx, junctionTests: graph.junctionTests, crossingGated: graph.crossingGated }, node: newIdx };
}

/** Bridge a real drawn gap between two dead-end (degree-1) node endpoints —
 *  ONLY when a recognized fitting/equipment symbol placement sits in it,
 *  never on proximity alone (wallnetwork.ts's own never-admit-on-proximity-
 *  alone discipline, carried over here). Returns a NEW graph — the input is
 *  never mutated — with synthetic `bridged: true` edges added; system is
 *  copied from whichever of the two dangling edges is more confidently
 *  classified (a bridged gap has no linework of its own to classify from).
 *  A dangling end already at a real junction (degree > 1) is never a
 *  bridge candidate — only genuine dead ends are. */
function bridgeDanglingGaps(graph: MepGraph, symbols: Point[], bridgePx: number): MepGraph {
  if (!symbols.length) return graph;
  const danglers = graph.nodes.map((n, i) => ({ n, i })).filter((x) => x.n.edges.length === 1);
  if (danglers.length < 2) return graph;
  const nodes = graph.nodes.map((n) => ({ x: n.x, y: n.y, edges: n.edges.slice() }));
  const edges = graph.edges.map((e) => ({ ...e }));
  const edgeSystemOf = (nodeIdx: number): { system: MepSystemRole; confidence: number } => {
    const ei = graph.nodes[nodeIdx].edges[0];
    const e = graph.edges[ei];
    return { system: e.system, confidence: e.systemConfidence };
  };
  for (let a = 0; a < danglers.length; a++) {
    for (let b = a + 1; b < danglers.length; b++) {
      const A = danglers[a].n, B = danglers[b].n;
      const gapLen = Math.hypot(B.x - A.x, B.y - A.y);
      if (gapLen <= 0 || gapLen > bridgePx) continue;
      // a fitting symbol must sit ON the gap (within a generous perpendicular
      // band, but bounded to between the two endpoints, not just "nearby")
      const onGap = symbols.some((s) => {
        const t = ((s[0] - A.x) * (B.x - A.x) + (s[1] - A.y) * (B.y - A.y)) / (gapLen * gapLen);
        if (t < -0.1 || t > 1.1) return false;
        const px = A.x + t * (B.x - A.x), py = A.y + t * (B.y - A.y);
        return Math.hypot(s[0] - px, s[1] - py) <= bridgePx * 0.5;
      });
      if (!onGap) continue;
      const sa = edgeSystemOf(danglers[a].i), sb = edgeSystemOf(danglers[b].i);
      const better = sa.confidence >= sb.confidence ? sa : sb;
      const ei = edges.length;
      edges.push({ a: danglers[a].i, b: danglers[b].i, length: gapLen, system: better.system, systemConfidence: better.confidence, bridged: true });
      nodes[danglers[a].i].edges.push(ei);
      nodes[danglers[b].i].edges.push(ei);
    }
  }
  return { nodes, edges, layerSignal: graph.layerSignal, quantGridPx: graph.quantGridPx, junctionTests: graph.junctionTests, crossingGated: graph.crossingGated };
}

/** Walk the graph from `from`, looking for exactly one reachable equipment
 *  symbol. Never invents a `reachedEquipment` from nearest-as-the-crow-flies
 *  — an equipment id only counts when a real, walked path of connected
 *  edges reaches the node its own placement snapped to. */
export function traceConnectivity(graph: MepGraph, from: Point, opts: TraceOptions): TraceResult {
  const layer_signal = graph.layerSignal;
  const factors: string[] = [];
  // "layer-unclassified" means more than "the pipe/duct SYSTEM type is
  // unknown" — found via real corpus testing (known-gaps ledger item 24):
  // with no PDF layers to exclude by, buildMepGraph on its own has no way to
  // separate wall/architectural ink from real MEP linework. Measured on real
  // Bessemer page 6 before the fix: a seed on a bathroom exhaust fan's own
  // duct riser "reached" a heat pump 52 hops away — almost certainly walking
  // through wall linework, not a real duct run. Both real callers
  // (mcp/src/session.ts's ensureMepGraph, TakeoffCanvas.jsx's
  // agentTraceConnectivity) now fold wallnetwork.ts's own geometric
  // (layer-independent) wall-vouching into excludeSegs whenever layerSignal
  // isn't "strong" (accuracy-hardening plan Phase 2), which is the real fix
  // for that failure mode — the 0.6 multiplier below stays anyway, since
  // this module has no way to see from `graph` alone whether a given caller
  // actually wired that exclusion in, and the vouching itself is a
  // real-but-imperfect heuristic (not every wall face carries the junction
  // evidence it needs to be vouched), so "layer-unclassified" still means a
  // measurably less certain trace, not a solved one.
  if (layer_signal === "none") factors.push("layer-unclassified");

  if (!opts.equipmentSymbols || !opts.equipmentSymbols.length) {
    return { status: "refused", layer_signal, confidence: 0, factors: [], reason: "No equipment symbols supplied — sweep the target family first (symbol_sweep or sweep_schedule_row), then pass their placements here." };
  }
  if (!graph.nodes.length) {
    return { status: "refused", layer_signal, confidence: 0, factors: [], reason: "This sheet has no traced vector linework to walk — check sheet_info.has_vector_linework before tracing." };
  }
  const ppf = opts.mppf && opts.mppf > 0 ? opts.mppf : PX_PER_FT_GUESS;
  // Real, corpus-found (itd-d1-lab-mechanical.pdf#7, a boiler-room hydronic
  // schematic): buildMepGraph's own coarsen-and-retry (see its header
  // comment) succeeded only at its coarsest retry grid (48.6px here, 27x the
  // fine 1.8px grid every synthetic fixture and every other real sheet
  // tested so far happened to node at) — every node/edge coordinate in the
  // resulting graph is then only accurate to within that many px of the
  // sheet's own real drawn ink, since quantizeSurvivors rounds every
  // endpoint to the nearest multiple of it. A fixed seedTolFt (12px at the
  // PX_PER_FT_GUESS fallback) sized for the fine grid is provably too tight
  // once the grid itself has coarsened past it: measured directly, a seed
  // placed exactly on this sheet's own drawn HWR main (image px [700,
  // 1688.9]) refused "isn't on any traced linework" even though the real
  // line is there — buildMepGraph quantized it away to (777.6, 1701), 12.4px
  // beyond the fixed tolerance. The graph's own quantGridPx is the correct,
  // measured floor: a point can legitimately be off by up to that amount
  // from ordinary quantization alone, independent of whatever seedTolFt the
  // caller asked for, so the tolerance actually used is never allowed
  // narrower than the grid that produced the graph being searched.
  const tolPx = seedTolPx(graph, opts.mppf, opts.seedTolFt);

  // Gap bridging (only when fittingSymbols was supplied) — a NEW graph, the
  // one actually walked below; the caller's own graph is never mutated.
  const bridgePx = (opts.bridgeFt ?? DEFAULT_BRIDGE_FT) * ppf;
  const fittingPts = (opts.fittingSymbols ?? []).map((f) => f.at);
  let walked = fittingPts.length ? bridgeDanglingGaps(graph, fittingPts, bridgePx) : graph;

  // Seed and every equipment placement resolve against the graph in
  // sequence, each threading the (possibly just-spliced) graph into the
  // next lookup — see resolveOnGraph's own comment for why this snaps to a
  // point mid-edge, not only to existing nodes.
  const seedR = resolveOnGraph(walked, from, tolPx);
  walked = seedR.graph;
  const seed = seedR.node;
  // Set OPENTAKEOFF_TRACE_DEBUG=1 to see exactly which node/edge a seed or
  // equipment placement resolved to — real diagnostic that earned its
  // keep during the Phase 2 crossing-gate investigation (see
  // PLAN_CONNECTIVITY_SERVES.md): "which edge did resolveOnGraph actually
  // pick" is the first question any future seed-resolution bug needs
  // answered, same discipline vectorTakeoffPipeline.ts's own
  // OPENTAKEOFF_GRAPH_TRACE already carries. Off by default, zero cost.
  if ((typeof process !== "undefined" && process.env?.OPENTAKEOFF_TRACE_DEBUG)) {
    console.error(`TRACE_DEBUG seed resolved to node ${seed} at (${seed != null ? walked.nodes[seed].x : "?"},${seed != null ? walked.nodes[seed].y : "?"}) tolPx=${tolPx}`);
  }
  if (seed == null) {
    return { status: "refused", layer_signal, confidence: 0, factors: [], reason: "The seed point isn't on any traced linework — click directly on a drawn pipe/duct/conduit line." };
  }

  // equipment placements -> their nearest graph node (or a spliced point
  // along an edge), within the same tolerance. An equipment whose placement
  // sits too far from any linework simply never appears as reachable —
  // correctly excluded, not an error.
  const equipAtNode = new Map<number, { id: string; at: Point }>();
  for (const eq of opts.equipmentSymbols) {
    const r = resolveOnGraph(walked, eq.at, tolPx);
    walked = r.graph;
    if ((typeof process !== "undefined" && process.env?.OPENTAKEOFF_TRACE_DEBUG)) {
      console.error(`TRACE_DEBUG equipment ${eq.id} resolved to node ${r.node} at (${r.node != null ? walked.nodes[r.node].x : "?"},${r.node != null ? walked.nodes[r.node].y : "?"})`);
    }
    if (r.node != null && !equipAtNode.has(r.node)) equipAtNode.set(r.node, eq);
  }

  const maxHops = opts.maxHops ?? (graph.crossingGated ? DEFAULT_MAX_HOPS_GATED : DEFAULT_MAX_HOPS);
  // Phase 4 item 2's own layer-boundary refusal: under a strong, confident
  // layer signal, a walk must never cross from one recognized MEP system
  // into a genuinely DIFFERENT one (e.g. a ductwork trunk continuing onto
  // a piping run it merely touches at a real junction) — refusing the
  // CROSSING itself, not the whole trace's status, the same "exclude the
  // connection, let dead_end/an alternate route fall out naturally"
  // doctrine requireJunctionMarkForCrossings already uses at graph-build
  // time (this is necessarily a WALK-time check instead: which system
  // counts as "established" is relative to where THIS walk started, not a
  // global graph property). A REAL, DISCLOSED narrower version of this
  // item's own "supply run into a return body" example:  MepSystemRole
  // has no supply/return sub-distinction today (mepsystems.ts's own token
  // tables fold SUPP/SUPPLY/RET/RETURN/SA/RA all into one "ductwork" role)
  // — building that finer distinction is real, separate, larger work this
  // session correctly declines to invent unilaterally, same discipline
  // already applied to the leader-chase migration and full UI reconcile
  // parity elsewhere in this plan. What ships here is the coarser, still
  // real cross-SYSTEM (ductwork/piping/electrical/controls) boundary
  // refusal — "unknown" never refuses, since it carries no real evidence
  // either way.
  const refuseSystemBoundary = layer_signal === "strong";
  const arrivingSystem = new Map<number, MepSystemRole>();
  let systemBoundaryRefused = false;
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
    for (const ei of walked.nodes[cur].edges) {
      const e = walked.edges[ei];
      const next = e.a === cur ? e.b : e.a;
      if (visited.has(next)) continue;
      if (refuseSystemBoundary) {
        const priorSystem = arrivingSystem.get(cur);
        if (priorSystem && e.system !== "unknown" && e.system !== priorSystem) { systemBoundaryRefused = true; continue; }
      }
      visited.add(next); parent.set(next, cur); depth.set(next, d + 1);
      if (refuseSystemBoundary) {
        arrivingSystem.set(next, e.system !== "unknown" ? e.system : (arrivingSystem.get(cur) ?? "unknown"));
      }
      queue.push(next);
    }
  }
  // Disclosed only when it's relevant to the OUTCOME actually returned (the
  // ambiguous/dead_end branches below) — never on a clean single "reached",
  // where the successful path by construction never crossed a refused
  // boundary and a refusal elsewhere in the wider reachability graph would
  // be noise, not signal, about THIS result.
  // Same OPENTAKEOFF_TRACE_DEBUG flag as the seed/equipment resolution
  // logging above — this is what actually found the DEFAULT_MAX_HOPS_GATED
  // fix: printing the real BFS's own visited set and hitCap directly
  // (against the ACTUAL walked graph, not an external reimplementation)
  // showed a gated trace hitting the hop cap with an equipment node it
  // never got to visit, one call site instead of a symptom guessed at from
  // outside. Kept for the same reason the two blocks above were.
  if ((typeof process !== "undefined" && process.env?.OPENTAKEOFF_TRACE_DEBUG)) {
    console.error(`TRACE_DEBUG BFS from seed=${seed}: visited=${visited.size}/${walked.nodes.length} nodes, hitCap=${hitCap}`);
    for (const [node, eq] of equipAtNode) {
      console.error(`TRACE_DEBUG equipment ${eq.id} node=${node} inVisited=${visited.has(node)}`);
    }
  }

  const nodePathTo = (node: number): number[] => {
    const out: number[] = [];
    let cur: number | undefined = node;
    while (cur !== undefined) { out.push(cur); cur = parent.get(cur); }
    return out.reverse();
  };
  const pointsOf = (nodePath: number[]): Point[] => nodePath.map((i) => [walked.nodes[i].x, walked.nodes[i].y]);
  const edgeBetween = (a: number, b: number): MepEdge | undefined =>
    walked.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

  // PLAN_CONNECTIVITY_SERVES.md Phase 4 item 2's own "shared trunk is one
  // component, not ambiguity" rule: a reached equipment whose OWN path from
  // the seed already passes through a DIFFERENT equipment's node is a
  // pass-through hit, not a real fork — the trunk simply continues past an
  // equipment body it already fed (or through it) to reach another one
  // further downstream on the exact SAME physical run. "serves(device):
  // walk from each port outward; stop at the first equipment body reached"
  // means that downstream equipment is never this device's own answer; the
  // nearer ancestor equipment is. A genuine fork (two different branches
  // off a real junction) can never have this ancestor relationship, since
  // neither branch's path is ever a prefix of the other's — only a real
  // shared-trunk pass-through produces one BFS path fully containing
  // another. `equipAtNode` already holds every equipment placement's own
  // resolved node regardless of BFS order, so this checks the true parent
  // chain, not just what happened to be pushed to `reached` earlier.
  const isPassThroughHit = (node: number, id: string): boolean => {
    for (let cur = parent.get(node); cur !== undefined; cur = parent.get(cur)) {
      const ancestor = equipAtNode.get(cur);
      if (ancestor && ancestor.id !== id) return true;
    }
    return false;
  };
  const unshadowed = reached.filter((r) => !isPassThroughHit(r.node, r.id));
  const distinctIds = [...new Set(unshadowed.map((r) => r.id))];

  if (distinctIds.length >= 2) {
    // The last node common to every reached equipment's own path from the
    // seed — the real junction where the trace's outcome actually forked.
    // One representative branch (the shallowest divergence), not every
    // individual fork in a denser tree — a real, disclosed v1 scope limit.
    const paths = unshadowed.filter((r, i) => unshadowed.findIndex((x) => x.id === r.id) === i).map((r) => ({ id: r.id, at: r.at, nodePath: nodePathTo(r.node) }));
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
    const branchAt: Point = [walked.nodes[branchNode].x, walked.nodes[branchNode].y];
    if (systemBoundaryRefused) factors.push("system-boundary-refused");
    return {
      status: "ambiguous", layer_signal, confidence: 0, factors,
      branches: paths.map((p) => ({ at: branchAt, leads_to: p.id })),
      reason: `${distinctIds.length} different equipment placements (${distinctIds.join(", ")}) are all reachable within ${maxHops} hops from a junction near (${branchAt[0].toFixed(1)}, ${branchAt[1].toFixed(1)}) — a real branch, not picked from; view_sheet there to see which run this device actually follows.`,
    };
  }

  if (distinctIds.length === 1) {
    const hit = unshadowed[0];
    const nodePath = nodePathTo(hit.node);
    const path = pointsOf(nodePath);
    const hops = nodePath.length - 1;
    if (hops > 30) factors.push(`long-trace(${hops} hops)`);
    const systems = new Set<MepSystemRole>();
    let bridgedHops = 0;
    for (let i = 1; i < nodePath.length; i++) {
      const e = edgeBetween(nodePath[i - 1], nodePath[i]);
      if (e) systems.add(e.system);
      if (e?.bridged) bridgedHops++;
    }
    if (bridgedHops > 0) factors.push(`bridged-gap(${bridgedHops})`);
    const system = systems.size === 1 ? [...systems][0] : undefined;
    let confidence = 1;
    if (factors.includes("layer-unclassified")) confidence *= 0.6;
    if (hops > 30) confidence *= 0.9;
    if (bridgedHops > 0) confidence *= Math.pow(0.9, bridgedHops);
    return {
      status: "reached", layer_signal, confidence, factors,
      path, reachedEquipment: { id: hit.id, at: hit.at },
      ...(system ? { system } : {}),
    };
  }

  if (systemBoundaryRefused) factors.push("system-boundary-refused");
  return {
    status: "dead_end", layer_signal, confidence: 0, factors,
    reason: hitCap
      ? `Hit the ${maxHops}-hop limit without reaching any known equipment placement — raise max_hops and retry, or the target may genuinely be unconnected within this many hops.`
      : "Ran out of connected linework without reaching any known equipment placement — a genuine dead end, or the run may continue off-sheet at a match line this tracer has no cross-sheet awareness of.",
  };
}

// ── ports, not clicks (maturity plan Phase 4) ───────────────────────────
// PLAN_CONNECTIVITY_SERVES.md Phase 4 item 1 — the first, self-contained
// primitive: WHERE a device placement's own graph connections actually
// enter its drawn footprint, not an assumed centroid seed. The rest of
// Phase 4 (serves(): walk from each port to the first EQUIPMENT BODY
// reached, treating a shared trunk as one component rather than
// ambiguity; moving symbollabels.ts's own leader chase onto this same
// graph) is real, larger, separate work — a new device-to-graph binding
// model spanning multiple existing modules, not a quick follow-on to this
// one primitive, same "its own dedicated increment" discipline Phase 1
// item 2's own topologyFor merge and Phase 3's own seed-resolution
// follow-up are already held to. Not attempted here.

/** Every point where a graph EDGE crosses a device placement's own bbox
 *  boundary (expanded by `inkPad`, the symbol's own drawn ink margin) —
 *  never the placement's centroid. A device with zero ports has no drawn
 *  connection to trace from at all; `traceConnectivity`'s own callers
 *  (today, exclusively hand-seeded points) can use this to decide "refuse
 *  as unconnected" instead of guessing a seed. An edge with BOTH ends
 *  inside the box (interior wiring — the symbol's own drawn leg/leader)
 *  or BOTH ends outside (unrelated linework merely passing nearby) is
 *  never a port; only a genuine boundary crossing is. Ports are returned
 *  in graph-edge order, deduplicated only by exact coordinate — two
 *  edges crossing at visibly the same point but not exactly the same
 *  float is a real, disclosed v1 scope limit, not silently merged. */
export function computePorts(graph: MepGraph, bbox: Bbox, inkPad: number = 0): Point[] {
  const x0 = bbox[0] - inkPad, y0 = bbox[1] - inkPad, x1 = bbox[2] + inkPad, y1 = bbox[3] + inkPad;
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const seen = new Set<string>();
  const ports: Point[] = [];
  for (const e of graph.edges) {
    const a = graph.nodes[e.a], b = graph.nodes[e.b];
    const aIn = inside(a.x, a.y), bIn = inside(b.x, b.y);
    if (aIn === bIn) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    // A straight segment with exactly one endpoint inside a convex
    // rectangle crosses its boundary exactly once — find that single
    // valid crossing among the (at most 4) candidate boundary-line
    // intersections, rather than assuming which side it is.
    const candidates: number[] = [];
    if (dx !== 0) candidates.push((x0 - a.x) / dx, (x1 - a.x) / dx);
    if (dy !== 0) candidates.push((y0 - a.y) / dy, (y1 - a.y) / dy);
    for (const t of candidates) {
      if (t < -1e-9 || t > 1 + 1e-9) continue;
      const px = a.x + t * dx, py = a.y + t * dy;
      if (px < x0 - 1e-6 || px > x1 + 1e-6 || py < y0 - 1e-6 || py > y1 + 1e-6) continue;
      const key = `${px.toFixed(3)},${py.toFixed(3)}`;
      if (seen.has(key)) break;
      seen.add(key);
      ports.push([px, py]);
      break;
    }
  }
  return ports;
}

// ── body-aware target expansion (Phase 4 item 2, first increment) ───────
// PLAN_CONNECTIVITY_SERVES.md Phase 4 item 2 names "serves()'s own
// walk-to-equipment-BODY semantics" as real, separate, larger work
// (a new device-to-graph binding model spanning symbol_sweep/
// sweep_schedule_row/count_marks/legend sweep) — NOT attempted here. This
// is the one safe, small, purely-additive slice of it a 2026-09-16
// diagnosis (the Bessemer SR-1->HP-1 Gate 3 gap) directly motivated and
// verified in isolation: a target's own bbox, when the caller already has
// one (e.g. sweep_schedule_row's own geometry_bbox/tag_at, or a legend
// glyph's own rect — this function does not discover a bbox, only uses
// one it's given), lets resolution walk onto whatever REAL linework
// enters that bbox's own boundary (via computePorts, Phase 4 item 1)
// instead of a single raw point — which can land on the target's OWN
// drawn glyph ink when that glyph happens to form its own small, isolated
// graph component (the exact, corpus-verified Gate 3 failure shape: a
// device's own symbol can sit closer to a naive seed than the real duct
// passing beside it). Byte-identical to today's point-only behavior when
// no bbox is supplied, or when the supplied bbox yields zero ports —
// this only ever adds a candidate, never removes or changes the existing
// point-based one.
export interface BodyAwareCandidate { id: string; at: Point; label?: string; bbox?: Bbox }

export function expandBodyAwareTarget(
  graph: MepGraph,
  candidate: BodyAwareCandidate,
  inkPad: number = 0,
): Array<{ id: string; at: Point; label?: string }> {
  const point = { id: candidate.id, at: candidate.at, ...(candidate.label ? { label: candidate.label } : {}) };
  if (!candidate.bbox) return [point];
  const ports = computePorts(graph, candidate.bbox, inkPad);
  if (!ports.length) return [point];
  return ports.map((at) => ({ id: candidate.id, at, ...(candidate.label ? { label: candidate.label } : {}) }));
}

// ── component_of (Phase 5 item 2, PLAN_CONNECTIVITY_SERVES.md) ──────────
// A point's own local connected component — "is this drawn line connected
// to anything at all, and how much" without needing a second target to
// walk toward, the read-only counterpart to a full traceConnectivity walk.
// Reuses resolveOnGraph's own seed-snapping unchanged (same tolerance
// doctrine as traceConnectivity's seed, via the shared seedTolPx above) —
// never a second heuristic for "is this point on the graph."

export interface ComponentInfo {
  /** The point actually resolved to on the graph (a node, or a point
   *  spliced mid-edge) — never the raw input point once it snapped. */
  at: Point;
  nodeCount: number;
  edgeCount: number;
  bbox: Bbox;
  /** Every distinct MEP system role among this component's own edges —
   *  more than one is a real, disclosed signal (a shared trunk drawn on
   *  one uncoded layer, or two genuinely different systems noded
   *  together), never collapsed to a single guess. */
  systems: MepSystemRole[];
  /** This component's own degree-1 nodes (dead ends / open drawn ends),
   *  capped at COMPONENT_OPEN_ENDS_CAP; `openEndsTruncated` discloses when
   *  more exist rather than silently dropping them (no-silent-caps
   *  doctrine, PLAN_CONNECTIVITY_SERVES.md "What not to do"). */
  openEnds: Point[];
  openEndsTruncated: boolean;
}

const COMPONENT_OPEN_ENDS_CAP = 50;

/** Resolve `pt` onto the graph and describe its WHOLE connected component —
 *  an exact, uncapped BFS (unlike resolveOnGraph's own capped tie-break
 *  scan above, this IS the deliverable, not a heuristic), bounded only by
 *  the graph's own real size. Returns null when `pt` isn't on any traced
 *  linework within `tolPx`, the same refusal condition traceConnectivity's
 *  own seed resolution already uses. */
export function describeComponent(graph: MepGraph, pt: Point, tolPx: number): ComponentInfo | null {
  const { graph: walked, node } = resolveOnGraph(graph, pt, tolPx);
  if (node == null) return null;
  const visited = new Set<number>([node]);
  const queue = [node];
  const edgeIds = new Set<number>();
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const ei of walked.nodes[cur].edges) {
      edgeIds.add(ei);
      const e = walked.edges[ei];
      const next = e.a === cur ? e.b : e.a;
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const systems = new Set<MepSystemRole>();
  for (const ei of edgeIds) systems.add(walked.edges[ei].system);
  const openEndsAll: Point[] = [];
  for (const n of visited) {
    const nd = walked.nodes[n];
    if (nd.x < x0) x0 = nd.x;
    if (nd.x > x1) x1 = nd.x;
    if (nd.y < y0) y0 = nd.y;
    if (nd.y > y1) y1 = nd.y;
    if (nd.edges.length === 1) openEndsAll.push([nd.x, nd.y]);
  }
  return {
    at: [walked.nodes[node].x, walked.nodes[node].y],
    nodeCount: visited.size,
    edgeCount: edgeIds.size,
    bbox: [x0, y0, x1, y1],
    systems: [...systems],
    openEnds: openEndsAll.slice(0, COMPONENT_OPEN_ENDS_CAP),
    openEndsTruncated: openEndsAll.length > COMPONENT_OPEN_ENDS_CAP,
  };
}
