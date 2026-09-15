// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 Lane D — "Build compact
// invariant path/subgraph signatures for fast lookup," continuing the
// node-attribute table candidateBodyLaneD.ts built. FIRST slice: a per-
// body signature over one Lane B candidate body's own member primitives.
//
// Invariances this slice actually delivers, and how:
// - Member ORDER: a body's own primitiveIds have no canonical order (union-
//   find groups them arbitrarily), so entries are bucketed and SORTED
//   before hashing — two bodies with the same members in a different
//   internal order produce the identical signature.
// - Absolute ROTATION on the sheet: each member's orientation is stated
//   RELATIVE to the body's own dominant orientation (the longest member's
//   own orientation — a body's principal axis is best defined by its most
//   prominent stroke), not as an absolute sheet angle. Two placements of
//   the same body at different rotations produce the identical signature.
//
// Invariances NOT yet delivered (disclosed, real further work):
// - Mirroring: `angleDiffMod180` is an UNSIGNED angular distance, so for a
//   2-member body (a corner: two lines meeting at a point) mirroring
//   already falls out for free — an L and its mirror image carry no
//   handedness to lose at that level of representation, and the test suite
//   proves it deliberately rather than assuming it. A 3+-member body with
//   genuine spatial handedness (a Z vs. its mirror S tromino) is NOT
//   proven either way here — untested, and unsigned pairwise angles to one
//   dominant axis likely cannot distinguish that case, since chirality
//   across three or more points needs more than one relative angle to
//   express. A principled fix (if this turns out to matter on real
//   corpus bodies) is real further work, not assumed solved by this slice.
// - Noise tolerance at a bucket boundary: a value just either side of a
//   bucket edge (length or angle) currently hashes to visibly different
//   signatures, with no fuzzy/near-neighbor lookup — "fast lookup" here
//   means an exact-signature match only; approximate/nearest-signature
//   retrieval is not attempted.
// - Any signature scheme for a body with ZERO length spread (every member
//   the same length) or a degenerate one-member body: handled (documented
//   below) but not specially optimized.
import type { CandidateBody } from "./candidateBodyLaneB.ts";
import type { PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";

/** Quantization step for relative orientation, degrees. Coarser than
 *  PARALLEL_ANGLE_TOL_DEG (vectorSceneRelations.ts) on purpose: a
 *  signature bucket has to tolerate real drafting jitter across multiple
 *  DIFFERENT placements of the same symbol, not just decide whether two
 *  specific segments are parallel. */
export const ANGLE_BUCKET_DEG = 10;
/** Quantization step for normalizedLength (candidateBodyLaneD.ts), as a
 *  fraction of the sheet's own reference length. */
export const LENGTH_BUCKET_STEP = 0.25;

export interface SignatureEntry {
  type: number | null;
  curved: boolean;
  closed: boolean;
  lengthBucket: number;
  /** relative to the body's own dominant orientation, mod 180, quantized
   *  to ANGLE_BUCKET_DEG. */
  angleBucket: number;
}

export interface BodySignature {
  bodyId: number;
  memberCount: number;
  dominantOrientationDeg: number;
  /** sorted for order-invariance — see the module header. */
  entries: SignatureEntry[];
  /** stable, deterministic (FNV-1a over the sorted entries) — NOT
   *  cryptographic, and collisions are possible on a large corpus; a real
   *  lookup index would still verify a hash hit against the full entry
   *  list, the same way any hash-bucketed index does. */
  hash: string;
}

function angleDiffMod180(a: number, b: number): number {
  const d = Math.abs(a - b) % 180;
  return d > 90 ? 180 - d : d;
}

// FNV-1a, 32-bit — a small, dependency-free, deterministic string hash.
// Chosen for "compact and fast," not cryptographic strength; see the
// interface doc above on verifying a hit before trusting it.
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Pure: builds a BodySignature for one Lane B candidate body from Lane D's
 *  own per-primitive attributes. `attrById` must carry an entry for every
 *  id in `body.primitiveIds` — a missing one is skipped (defensive, not
 *  expected in normal use since both come from the same VectorSceneIndex). */
export function computeBodySignature(
  body: CandidateBody,
  attrById: ReadonlyMap<number, PrimitiveNodeAttributes>,
): BodySignature | null {
  const members = body.primitiveIds.map((id) => attrById.get(id)).filter((a): a is PrimitiveNodeAttributes => !!a);
  if (members.length === 0) return null;

  // dominant orientation = the longest member's own orientation — a body's
  // principal axis is best defined by its most prominent stroke, not an
  // arbitrary first-in-list member.
  let dominant = members[0];
  for (const m of members) if (m.length > dominant.length) dominant = m;
  const dominantOrientationDeg = dominant.orientationDeg;

  const entries: SignatureEntry[] = members.map((m) => ({
    type: m.type,
    curved: m.curved,
    closed: m.closed,
    lengthBucket: Math.round(m.normalizedLength / LENGTH_BUCKET_STEP),
    angleBucket: Math.round(angleDiffMod180(m.orientationDeg, dominantOrientationDeg) / ANGLE_BUCKET_DEG),
  }));
  entries.sort((a, b) =>
    (a.type ?? -1) - (b.type ?? -1)
    || Number(a.curved) - Number(b.curved)
    || Number(a.closed) - Number(b.closed)
    || a.lengthBucket - b.lengthBucket
    || a.angleBucket - b.angleBucket);

  const hash = fnv1a(JSON.stringify(entries));
  return { bodyId: body.id, memberCount: members.length, dominantOrientationDeg, entries, hash };
}

/** Convenience: computeBodySignature for every body, keyed by bodyId — the
 *  shape a fast-lookup index (grouping bodies by identical hash) would
 *  build from. Bodies that reduce to null (no resolvable members) are
 *  omitted, not padded with a placeholder. */
export function computeBodySignatures(
  bodies: readonly CandidateBody[],
  attributes: readonly PrimitiveNodeAttributes[],
): Map<number, BodySignature> {
  const attrById = new Map(attributes.map((a) => [a.primitiveId, a] as const));
  const out = new Map<number, BodySignature>();
  for (const body of bodies) {
    const sig = computeBodySignature(body, attrById);
    if (sig) out.set(body.id, sig);
  }
  return out;
}
