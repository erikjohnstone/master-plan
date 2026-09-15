// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — "Proposal fusion,"
// goal §8's own closing subsection: "Deduplicate proposals by primitive
// overlap and body identity, not center distance alone. Preserve which
// lanes voted and their evidence. Top-K ordering may use deterministic
// evidence weights, but record ablations for each lane. Include a
// no-body proposal when only a tag exists." FIRST slice: fuses Lane B's
// connected-component bodies with Lane A's Form-XObject-invocation bodies
// — the two lanes whose own output is already CandidateBody-shaped (a
// primitive id set + bbox). Lane C is consulted for the "no-body
// proposal" case; Lane D/E are attribute/reference infrastructure the
// other lanes already consume, not independent body generators, so they
// have nothing of their own shape to fuse here.
//
// Dedup rule, per the goal's own explicit instruction NOT to use center
// distance alone: primitive-SET Jaccard overlap. On a real sheet, the
// same physical symbol's ink can be discovered twice — once by Lane B's
// subpath/junction connectivity, once by Lane A because it happens to sit
// inside a Form XObject invocation — and that is the SAME body proposed
// two ways, not two different bodies that happen to be nearby (two real
// instances of a dense array can sit closer together than one symbol's
// own diagonal, which is exactly why center distance is the wrong test —
// vectorSceneRelations.ts's own junction/shadow-suppression work already
// hit this same lesson from a different angle).
//
// Deliberately NOT attempted in this slice (disclosed, real further
// work):
// - Folding Lane E (legend references) in as a THIRD proposal source —
//   Lane E indexes the LEGEND's own glyphs, not plan-sheet instances; a
//   legend reference informing a plan-side proposal is real further work
//   (Lane E's own item 4, "corroboration," and Phase 6's joint
//   assignment), not attempted here.
// - Weighted/learned evidence scoring — `laneWeight` below is a disclosed,
//   simple deterministic ordering (more voting lanes ranks first, ties
//   broken by primitive count), not a calibrated scoring model.
// - Ablation records per lane (goal's own "record ablations for each
//   lane") — this slice fuses and orders, it does not yet produce the
//   ablation report that instruction calls for.
//
// REAL BUG FOUND AND FIXED (Phase 4 real-sheet validation, tinker-afb-
// iwcs-controls.pdf#13): when ONE Lane A invocation's own primitive set
// is EXHAUSTIVELY PARTITIONED by SEVERAL Lane B bodies (the real,
// structurally-common pattern PROGRESS.md's own Phase 4 entry documents
// — Lane B's own connected components falling entirely inside one
// Form), the ORIGINAL version of this function iterated Lane B bodies
// independently and let EACH one separately "win" a merge with the SAME
// Lane A invocation — since Lane A's own set is a strict superset of
// any one matching Lane B body, EVERY such merge produced the identical
// union (= Lane A's own full set), so two (or more) DISTINCT
// FusedProposals ended up with byte-for-byte IDENTICAL primitiveIds,
// contested against EACH OTHER for no real reason — confirmed on real
// data: tinker-afb-iwcs-controls.pdf#13 produced exactly this shape (two
// proposals, ids 0 and 1, both `votingLanes: ["A","B"]`, both the exact
// same 8 primitives), and `ownershipEligibility.ts`'s own signals could
// never break that self-tie because there was nothing REAL to
// distinguish — one proposal was a pointless duplicate of the other.
//
// FIX: Lane B bodies matching a Lane A invocation above threshold are
// now collected FIRST, grouped by invocation; only the single BEST
// match (highest Jaccard, ties broken by lowest Lane B body id for
// determinism) is fused into the ["A","B"] proposal. Every OTHER Lane B
// body that also matched the same invocation becomes its own
// independent `["B"]`-only proposal — real, distinct Lane B evidence,
// never silently dropped and never duplicated.
import type { CandidateBody } from "./candidateBodyLaneB.ts";
import type { FormInvocationSignature } from "./candidateBodyLaneA.ts";

export type LaneVote = "A" | "B";

export interface FusedProposal {
  id: number;
  primitiveIds: number[];
  x0: number; y0: number; x1: number; y1: number;
  /** which lanes proposed a body that overlapped enough to merge into
   *  this one — sorted, so two fusions of the same underlying lanes
   *  compare equal. */
  votingLanes: LaneVote[];
  /** per-lane evidence preserved rather than collapsed into a boolean —
   *  goal's own "preserve which lanes voted and their evidence." */
  evidence: {
    laneB?: { bodyId: number; primitiveCount: number };
    laneA?: { invocationId: number; depth: number; hasSignature: boolean };
  };
}

/** goal's own "no-body proposal when only a tag exists" — the sentinel a
 *  Lane C `findAdjacentBody` miss (`nearestBodyId: null`) becomes once
 *  fusion is asked about that tag. Never fabricates a body. */
export interface NoBodyProposal {
  kind: "no-body";
  tagBbox: readonly [number, number, number, number];
}

export const DEFAULT_OVERLAP_THRESHOLD = 0.5;

function bbox(idx: { primitives: { x0: number; y0: number; x1: number; y1: number }[] }, ids: readonly number[]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) {
    const p = idx.primitives[id];
    const px0 = Math.min(p.x0, p.x1), px1 = Math.max(p.x0, p.x1);
    const py0 = Math.min(p.y0, p.y1), py1 = Math.max(p.y0, p.y1);
    if (px0 < x0) x0 = px0; if (px1 > x1) x1 = px1;
    if (py0 < y0) y0 = py0; if (py1 > y1) y1 = py1;
  }
  return { x0, y0, x1, y1 };
}

function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Pure: fuses Lane B candidate bodies with Lane A invocation bodies
 *  (those carrying at least one primitive) by primitive-set Jaccard
 *  overlap. Never mutates either input. Requires an object exposing
 *  `primitives` (a built VectorSceneIndex) purely to compute a fused
 *  bbox — it never reads any other field. */
export function fuseProposals(
  idx: { primitives: { x0: number; y0: number; x1: number; y1: number }[] },
  laneBBodies: readonly CandidateBody[],
  laneAInvocations: readonly FormInvocationSignature[],
  opts: { overlapThreshold?: number } = {},
): FusedProposal[] {
  const threshold = opts.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
  const laneASets = laneAInvocations
    .filter((inv) => inv.primitiveIds.length > 0)
    .map((inv) => ({ inv, set: new Set(inv.primitiveIds) }));

  // reverse index: primitive id -> Lane A entries touching it, so only
  // Lane B bodies that actually SHARE a primitive with a Lane A
  // invocation are ever compared — never an all-pairs scan.
  const laneAByPrimitive = new Map<number, typeof laneASets[number][]>();
  for (const entry of laneASets) {
    for (const pid of entry.set) {
      let arr = laneAByPrimitive.get(pid);
      if (!arr) { arr = []; laneAByPrimitive.set(pid, arr); }
      arr.push(entry);
    }
  }

  const usedLaneA = new Set<number>(); // by invocationId
  const fused: FusedProposal[] = [];
  let nextId = 0;

  // PASS 1: for every Lane B body, find its own best Lane A match (if
  // any clears the threshold) — collected, not yet committed. See the
  // module header's own REAL BUG FOUND AND FIXED note for why this is
  // now a two-pass design: committing a merge immediately, body by
  // body, let several bodies independently "win" the SAME Lane A
  // invocation and each receive an identical duplicate proposal.
  interface Match { body: CandidateBody; entry: (typeof laneASets)[number]; score: number; }
  const matchesByInvocation = new Map<number, Match[]>();
  const unmatchedBodies: CandidateBody[] = [];
  for (const body of laneBBodies) {
    const bodySet = new Set(body.primitiveIds);
    const candidates = new Map<number, typeof laneASets[number]>();
    for (const pid of body.primitiveIds) {
      for (const entry of laneAByPrimitive.get(pid) ?? []) candidates.set(entry.inv.invocationId, entry);
    }
    let bestMatch: typeof laneASets[number] | null = null;
    let bestScore = 0;
    for (const entry of candidates.values()) {
      const score = jaccard(bodySet, entry.set);
      if (score > bestScore) { bestScore = score; bestMatch = entry; }
    }

    if (bestMatch && bestScore >= threshold) {
      let arr = matchesByInvocation.get(bestMatch.inv.invocationId);
      if (!arr) { arr = []; matchesByInvocation.set(bestMatch.inv.invocationId, arr); }
      arr.push({ body, entry: bestMatch, score: bestScore });
    } else {
      unmatchedBodies.push(body);
    }
  }

  // PASS 2: for each Lane A invocation with 1+ matching Lane B bodies,
  // merge with exactly the BEST one (highest Jaccard; ties broken by
  // lowest Lane B body id, for a deterministic, reproducible choice).
  // Every OTHER matching body becomes its own independent Lane-B-only
  // proposal — real, distinct evidence, never silently dropped, never
  // duplicated.
  for (const [invocationId, matches] of matchesByInvocation) {
    matches.sort((a, b) => b.score - a.score || a.body.id - b.body.id);
    const [best, ...rest] = matches;
    usedLaneA.add(invocationId);
    const unionIds = [...new Set([...best.body.primitiveIds, ...best.entry.inv.primitiveIds])].sort((a, b) => a - b);
    const { x0, y0, x1, y1 } = bbox(idx, unionIds);
    fused.push({
      id: nextId++, primitiveIds: unionIds, x0, y0, x1, y1,
      votingLanes: ["A", "B"],
      evidence: {
        laneB: { bodyId: best.body.id, primitiveCount: best.body.primitiveIds.length },
        laneA: { invocationId, depth: best.entry.inv.depth, hasSignature: !!best.entry.inv.signature },
      },
    });
    for (const m of rest) {
      fused.push({
        id: nextId++, primitiveIds: m.body.primitiveIds.slice(), x0: m.body.x0, y0: m.body.y0, x1: m.body.x1, y1: m.body.y1,
        votingLanes: ["B"],
        evidence: { laneB: { bodyId: m.body.id, primitiveCount: m.body.primitiveIds.length } },
      });
    }
  }

  for (const body of unmatchedBodies) {
    fused.push({
      id: nextId++, primitiveIds: body.primitiveIds.slice(), x0: body.x0, y0: body.y0, x1: body.x1, y1: body.y1,
      votingLanes: ["B"],
      evidence: { laneB: { bodyId: body.id, primitiveCount: body.primitiveIds.length } },
    });
  }

  // Lane A invocations no Lane B body claimed — still a real proposal,
  // Lane A's alone.
  for (const entry of laneASets) {
    if (usedLaneA.has(entry.inv.invocationId)) continue;
    const ids = entry.inv.primitiveIds.slice().sort((a, b) => a - b);
    const { x0, y0, x1, y1 } = bbox(idx, ids);
    fused.push({
      id: nextId++, primitiveIds: ids, x0, y0, x1, y1,
      votingLanes: ["A"],
      evidence: { laneA: { invocationId: entry.inv.invocationId, depth: entry.inv.depth, hasSignature: !!entry.inv.signature } },
    });
  }

  // Deterministic ordering (disclosed, not a calibrated score): more
  // voting lanes first, ties broken by primitive count — a real body
  // corroborated two independent ways outranks one seen only once.
  fused.sort((a, b) =>
    b.votingLanes.length - a.votingLanes.length
    || b.primitiveIds.length - a.primitiveIds.length
    || a.id - b.id);
  fused.forEach((f, i) => { f.id = i; });

  return fused;
}
