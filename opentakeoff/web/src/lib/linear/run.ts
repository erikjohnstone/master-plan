// The derived read of a linear run's per-segment/per-vertex geometry (WP1.1,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md). Pure: no React, no DOM, no
// pdf.js — takes real points (already scaled to image px, same convention
// `computeShapeMetrics` already uses) and real feet-per-px, returns exactly
// what `computed.run` carries. Called from `shapeMetrics.js` on BOTH the
// canvas and MCP (mcp/src/session.ts imports `web/src/lib/*` directly —
// "canvas and MCP cannot disagree").
//
// WP1 scope only: vertex KIND is inferred from turn angle alone (elbow at a
// real turn, "end" is never emitted here — the run's own two ends are not
// interior vertices) or from an explicit `vertex_overrides` entry; size is
// whatever `size_overrides` states, carried forward until the next
// override. Nothing here reads a drawn label, follows linework, or infers a
// tee/riser/crossing from anything but an explicit override — that is WP3+
// (the trace engine). A manual run with no `run` block at all never calls
// this (see shapeMetrics.js): the shape prices exactly as it did before
// this file existed.
import type { AuthoredRun, ComputedRun, RunSegment, RunSize, RunVertex } from "./types.ts";

export type { AuthoredRun, ComputedRun, RunSegment, RunSize, RunVertex } from "./types.ts";

/** A stable, canonical string key for a size — the totals_by_size grouping
 *  key, and the natural per-size report row key later (plan §7.2/§10.2). */
export function runSizeKey(size: RunSize): string {
  switch (size.kind) {
    case "rect": return `rect:${size.w_in}x${size.h_in}`;
    case "round": return `round:${size.d_in}`;
    case "oval": return `oval:${size.major_in}x${size.minor_in}`;
    case "pipe": return `pipe:${size.nps_in}`;
  }
}

const ANGLE_SQUARE_TOL = 6;   // degrees either side of 90 (plan §6.3)
const ANGLE_45_TOL = 6;       // degrees either side of 45

function classifyAngle(deg: number): "square" | "45" | "custom" {
  if (Math.abs(deg - 90) <= ANGLE_SQUARE_TOL) return "square";
  if (Math.abs(deg - 45) <= ANGLE_45_TOL) return "45";
  return "custom";
}

/** The turn angle at an interior vertex — the angle BETWEEN the incoming
 *  and outgoing direction vectors, 0-180°: 0° is dead straight (no turn at
 *  all — never emitted as a vertex, see below), 90° a square corner (the
 *  ordinary "90° elbow"), 180° the path doubling fully back on itself. This
 *  is the domain convention directly — SMACNA/plumbing name a fitting by
 *  how far it turns the run FROM its incoming direction, which is exactly
 *  this angle, not its complement. */
function turnAngleDeg(prev: [number, number], at: [number, number], next: [number, number]): number {
  const v1x = at[0] - prev[0], v1y = at[1] - prev[1];
  const v2x = next[0] - at[0], v2y = next[1] - at[1];
  const n1 = Math.hypot(v1x, v1y), n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return 0;   // a zero-length edge carries no real direction — read as straight, not a corner
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (n1 * n2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Nearest-at-or-before size override for segment `i` — "carried along the
 *  run" (plan §6.6), driven by explicit indices rather than a read label. */
function sizeForSegment(overrides: Record<string, RunSize> | undefined, i: number): RunSize | undefined {
  if (!overrides) return undefined;
  let best: RunSize | undefined, bestIdx = -1;
  for (const key of Object.keys(overrides)) {
    const idx = Number(key);
    if (!Number.isInteger(idx) || idx < 0 || idx > i) continue;
    if (idx > bestIdx) { bestIdx = idx; best = overrides[key]; }
  }
  return best;
}

/**
 * Resolve one open polyline's per-segment/per-vertex `computed.run`.
 * `pts` are real points in the SAME space `openLen` already consumes
 * (image px, pre-scaled by the sheet's dims — see shapeMetrics.js); `upp`
 * is real feet per that same px unit. Returns `null` for anything that
 * cannot be resolved as a run (fewer than 2 points) rather than a
 * zero-length placeholder.
 */
export function resolveRunSegments(pts: Array<[number, number]>, upp: number, run: AuthoredRun | undefined): ComputedRun | null {
  if (!Array.isArray(pts) || pts.length < 2) return null;
  const u = upp || 0;
  const overrides = run?.size_overrides;
  const vOverrides = run?.vertex_overrides;

  const segments: RunSegment[] = [];
  const totals: Record<string, number> = {};
  for (let i = 0; i < pts.length - 1; i++) {
    const lf = +(Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) * u).toFixed(2);
    const size = sizeForSegment(overrides, i);
    segments.push({ i, lf, ...(size ? { size } : {}), size_src: size ? "manual" : "withheld" });
    if (size) {
      const key = runSizeKey(size);
      totals[key] = +((totals[key] || 0) + lf).toFixed(2);
    }
  }

  const vertices: RunVertex[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const manualKey = String(i);
    const manual = vOverrides?.[manualKey];
    if (manual) {
      vertices.push({ i, kind: manual.kind, ...(manual.dir ? { dir: manual.dir } : {}), manual: true });
      continue;
    }
    const turn = turnAngleDeg(pts[i - 1], pts[i], pts[i + 1]);
    if (turn < 1e-6) continue;  // a genuinely straight run has no vertex to report here
    vertices.push({ i, kind: "elbow", angle_deg: +turn.toFixed(1), angle_class: classifyAngle(turn) });
  }

  return { segments, vertices, totals_by_size: totals };
}
