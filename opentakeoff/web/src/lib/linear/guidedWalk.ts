// Guided multi-hop continuation — a bench-only complement to WP3.4's own
// single-call walker (walk.ts), not a change to it. Plan §6.3's own design
// intent for an "ambiguous" stop is to "offer the candidate fan, not block
// on it" — a human or agent picks a branch and the walk continues from
// there. `trace_run`'s own single call can never do that itself (it has no
// ground truth to pick with); this module answers a narrower, scoreable
// question instead: GIVEN a golden's own known-correct path, does the
// candidate fan `trace_run` offers at an ambiguous stop actually CONTAIN
// the golden's own real continuation? If so, which one?
//
// This is deliberately separate from the walker's own tee/elbow/crossing
// auto-continuation (walk.ts's own `frontier()`-driven rules): those cases
// are NOT ambiguous to the engine at all — a tee always continues onto its
// own "main" pair by a fixed, confident rule, never onto the branch, no
// matter what a specific golden's own path needs. A guided continuation
// only ever applies where the engine itself already reports `ambiguous`
// (graph.ts's own `frontier()` fallback: a real fork with no clean
// collinear/elbow/tee/crossing pattern — e.g. a true 3-way wye with no
// two legs near-collinear) — genuinely uncertain to the engine, not just
// uncertain to this scoring code.
//
// Pure: no Session, no pdf.js, no I/O. `bench/linear.mts` drives the
// actual multi-call loop (it owns the Session); this module only answers
// "which candidate, if any, matches the golden's own next step."

export interface AngleCandidate {
  at: [number, number];
  angle_deg: number;
}

function angleOf(from: [number, number], to: [number, number]): number {
  let a = Math.atan2(to[1] - from[1], to[0] - from[0]) * 180 / Math.PI;
  if (a < 0) a += 360;
  return a;
}

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export const GUIDED_ANGLE_TOL_DEG = 30;

/** Given the point a walk just stopped `ambiguous` at, the golden's own
 *  next vertex beyond that point (the direction a correct continuation
 *  must head), and the candidate fan `trace_run` offered there, pick the
 *  candidate whose own direction (`Continuation.angleDeg` — "away from the
 *  node," the exact convention `trace_run`'s own `candidates[].angle_deg`
 *  already carries) most closely matches the golden's own real direction.
 *  Returns `null` when no candidate is within `GUIDED_ANGLE_TOL_DEG` — a
 *  genuine miss (the fan didn't offer the right branch), reported as such,
 *  never silently forced onto the nearest wrong one. `goldenNext` may
 *  equal `stopAt` itself (a zero-length step) only if the golden's own
 *  polyline carries a duplicate vertex — callers should de-duplicate
 *  their own golden points before calling this, same discipline
 *  `simplifyPolyline` already applies to golden/traced points elsewhere. */
export function pickGuidedContinuation(
  stopAt: [number, number],
  goldenNext: [number, number],
  candidates: AngleCandidate[],
  angleTolDeg = GUIDED_ANGLE_TOL_DEG,
): AngleCandidate | null {
  if (!candidates.length) return null;
  if (stopAt[0] === goldenNext[0] && stopAt[1] === goldenNext[1]) return null;
  const goldenDeg = angleOf(stopAt, goldenNext);
  let best: AngleCandidate | null = null;
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = angleDiff(goldenDeg, c.angle_deg);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  return best && bestDiff <= angleTolDeg ? best : null;
}

/** Walk a golden's own polyline (already de-duplicated, `verts_norm` in
 *  real px) and find the first vertex STRICTLY beyond `pastPoint`'s own
 *  arc-length position along it — the "golden's own next vertex" a guided
 *  continuation needs, without assuming `pastPoint` is itself one of the
 *  golden's own listed vertices (a real `trace_run` stop lands wherever
 *  the walked geometry actually ends, which is not necessarily an exact
 *  golden vertex — it is compared by nearest projection instead, the same
 *  "project each endpoint onto the golden" idea `scoreTraceShapeMatch`
 *  already uses for clipping). Returns `null` once `pastPoint` is at or
 *  beyond the golden's own final vertex (nothing left to guide toward). */
// A live trace_run point is `round1`'d (session.ts) and reaches that
// coordinate through a completely separate float pipeline than the
// golden's own authored points — sub-pixel disagreement (measured: ~0.2px
// on a real synthetic case, confirmed before picking this constant, not
// guessed) between "the walk's own real last point" and "the golden's own
// literal final vertex" is ORDINARY rounding noise, not more golden left
// to cover. An exact t===1 check (this function's own first version)
// mistook every one of these for "one more tiny vertex to reach," which
// would poison the guided-hop driver into an endless finish-line chase
// that never scores as done. `simplifyPolyline`'s own 0.5px tolerance is
// the established scale for "this is noise, not real geometry" elsewhere
// in this same scorer; this reuses that same order of magnitude.
const FINAL_VERTEX_TOL_PX = 1;

export function nextGoldenVertex(golden: [number, number][], pastPoint: [number, number]): [number, number] | null {
  if (golden.length < 2) return null;
  const final = golden[golden.length - 1];
  if (Math.hypot(pastPoint[0] - final[0], pastPoint[1] - final[1]) <= FINAL_VERTEX_TOL_PX) return null;
  let bestSeg = -1, bestT = -1, bestDist = Infinity;
  for (let i = 0; i < golden.length - 1; i++) {
    const [x1, y1] = golden[i], [x2, y2] = golden[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-9) continue;
    let t = ((pastPoint[0] - x1) * dx + (pastPoint[1] - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx, py = y1 + t * dy;
    const dist = Math.hypot(pastPoint[0] - px, pastPoint[1] - py);
    // <= (not <): a point sitting exactly at a shared vertex between two
    // consecutive spans ties at distance 0 on both — preferring the LATER
    // span means it's read as "the start of the next span," so its own
    // next vertex is genuinely the one further along, not itself.
    if (dist <= bestDist) { bestDist = dist; bestSeg = i; bestT = t; }
  }
  if (bestSeg < 0) return null;
  if (bestT >= 1 - 1e-9 && bestSeg === golden.length - 2) return null;   // already at (or past) the golden's own final vertex
  return golden[bestSeg + 1];
}
