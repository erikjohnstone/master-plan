// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 3 — "multi-lane candidate-
// body proposal," Lane A: PDF reusable-object identity. FIRST slice:
// requirement 1, "group Form XObject/content-signature invocations by
// normalized local content."
//
// Confirmed in Phase 2 slice 3 (oneclick.ts's own SubPath.formDepth doc):
// paintFormXObjectBegin exposes only [matrix, bbox|null] — no object id or
// name — so per-invocation IDENTITY needs the goal document's own named
// fallback: "compute a stable normalized content signature from the
// nested operation sequence and local coordinates." This slice does
// exactly that, built on two things this session already has:
// - oneclick.ts's new formInvocationId/formInvocations (this same commit)
//   — which primitives belong to which Do call, and that call's own
//   page-space placement transform.
// - candidateBodySignature.ts's own computeBodySignature (Phase 3 Lane D)
//   — reused UNCHANGED on inverse-transformed (local) coordinates, never a
//   second signature algorithm.
//
// Why local coordinates need no separate length normalization here,
// unlike Lane D's own per-sheet median normalization: two invocations of
// the identical Form XObject share the literal same content stream, so
// their LOCAL coordinates (before either invocation's own placement
// transform is applied) are already identical by construction — there is
// no cross-scale comparison to normalize away. Raw local length is used
// as `normalizedLength` directly.
//
// Deliberately NOT attempted in this slice (disclosed, real further
// work):
// - Requirement 2: treating an invocation's transform/local bounding
//   support as a high-priority body PROPOSAL (fusion with Lane B/C/D
//   proposals) — this slice groups and signs invocations, it does not
//   yet emit them as CandidateBody-shaped proposals.
// - Requirement 3: excluding forms whose content is mostly text/page
//   furniture/title blocks/borders/repeated non-countable stuff — no
//   FORM-level content-type filtering is applied; every invocation with
//   at least one resolvable VISIBLE primitive gets a signature. (A
//   narrower, primitive-LEVEL filter was added below after real-sheet
//   ground-truth checking — see next paragraph — but that is not the
//   same thing as this requirement's own form-level classification,
//   which remains undone.)
// - Requirement 4's own corroboration step (legend/tag/schedule) — this
//   slice states structural evidence only, never a family name.
//
// INVISIBLE-INK FIX (added after real-sheet visual ground-truth checking
// — see invisibleInk.ts's own header and PROGRESS.md for the full Cherry
// Point #12 finding): a Form invocation's own `primitiveIds` — and
// therefore its signature and local bbox — now EXCLUDES primitives
// `isLikelyInvisibleInk` flags (white-on-white masking ink, a real,
// common CAD/Revit export technique with no visible presence). Before
// this fix, a Form's own "content" and downstream FusedProposal bbox
// (candidateProposalFusion.ts consumes `primitiveIds` directly) could be
// — and on a real corpus sheet, was — 91%-97% invisible masking geometry,
// corrupting every eligibility/carrier signal computed from it. This
// changes what `primitiveIds` MEANS: from "every primitive this Do call
// touched" to "every VISIBLE primitive this Do call touched" — a real,
// intentional, disclosed change to this module's own output.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { FormInvocation } from "./oneclick.ts";
import type { PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";
import type { BodySignature } from "./candidateBodySignature.ts";
import { computeBodySignature } from "./candidateBodySignature.ts";
import { isLikelyInvisibleInk, type InvisibleInkOptions } from "./invisibleInk.ts";

export const LANE_A_MAX_PRIMITIVES = 250_000;

export interface FormInvocationSignature {
  invocationId: number;
  depth: number;
  /** VISIBLE primitive ids only — see the module header's own INVISIBLE-
   *  INK FIX for why this excludes `isLikelyInvisibleInk`-flagged
   *  primitives, and `excludedInvisibleCount` below for how many were
   *  dropped. */
  primitiveIds: number[];
  /** how many of this invocation's own primitives were excluded as
   *  invisible ink — reported explicitly so a caller can see when a
   *  Form's real content was mostly (or entirely) masking geometry,
   *  rather than that fact silently disappearing into a smaller
   *  `primitiveIds` count with no explanation. */
  excludedInvisibleCount: number;
  signature: BodySignature | null;
}

export interface LaneAResult {
  invocations: FormInvocationSignature[];
  /** invocation ids grouped by identical signature hash — "a repeated
   *  form is structural evidence" (goal's own requirement 4 wording):
   *  each group here is candidate evidence that those invocations placed
   *  the SAME reusable Form XObject, before any legend/tag/schedule
   *  corroboration. A group of size 1 is not repeated — only groups of 2+
   *  are included. */
  repeatedGroups: number[][];
  incomplete: boolean;
  incompleteReason: string | null;
}

/** Inverts a page-space point through a placement transform [a,b,c,d,e,f]
 *  (x' = a*x + c*y + e, y' = b*x + d*y + f) back to local coordinates.
 *  Returns null on a degenerate (non-invertible) transform rather than
 *  dividing by zero. */
function invertPoint(t: readonly number[], px: number, py: number): [number, number] | null {
  const [a, b, c, d, e, f] = t;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-12) return null;
  const x = (d * (px - e) - c * (py - f)) / det;
  const y = (-b * (px - e) + a * (py - f)) / det;
  return [x, y];
}

/** Pure: groups a VectorSceneIndex's own Form XObject invocations by a
 *  content signature computed from their LOCAL (placement-inverted)
 *  geometry. Never mutates `idx` or `formInvocations`. */
export function computeFormContentSignatures(
  idx: VectorSceneIndex,
  formInvocations: readonly FormInvocation[],
  opts: { maxPrimitives?: number } & InvisibleInkOptions = {},
): LaneAResult {
  const cap = opts.maxPrimitives ?? LANE_A_MAX_PRIMITIVES;
  const n = idx.primitives.length;
  if (n > cap) {
    return {
      invocations: [], repeatedGroups: [], incomplete: true,
      incompleteReason: `primitive count ${n} exceeds the ${cap}-primitive Lane A cap; no signatures were computed`,
    };
  }
  if (formInvocations.length === 0) return { invocations: [], repeatedGroups: [], incomplete: false, incompleteReason: null };

  const transformById = new Map(formInvocations.map((inv) => [inv.id, inv] as const));
  const byInvocation = new Map<number, number[]>();
  const excludedByInvocation = new Map<number, number>();
  for (const sp of idx.subpaths) {
    if (sp.formInvocationId === 0) continue; // page-level ink, not a Form XObject invocation
    let arr = byInvocation.get(sp.formInvocationId);
    if (!arr) { arr = []; byInvocation.set(sp.formInvocationId, arr); }
    for (const pid of sp.primitiveIds) {
      if (isLikelyInvisibleInk(idx.primitives[pid], opts)) {
        excludedByInvocation.set(sp.formInvocationId, (excludedByInvocation.get(sp.formInvocationId) ?? 0) + 1);
        continue;
      }
      arr.push(pid);
    }
  }

  const results: FormInvocationSignature[] = [];
  for (const inv of formInvocations) {
    const primitiveIds = byInvocation.get(inv.id) ?? [];
    const excludedInvisibleCount = excludedByInvocation.get(inv.id) ?? 0;
    if (primitiveIds.length === 0) { results.push({ invocationId: inv.id, depth: inv.depth, primitiveIds: [], excludedInvisibleCount, signature: null }); continue; }

    const attrById = new Map<number, PrimitiveNodeAttributes>();
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    let degenerate = false;
    for (const pid of primitiveIds) {
      const p = idx.primitives[pid];
      const local0 = invertPoint(inv.transform, p.x0, p.y0);
      const local1 = invertPoint(inv.transform, p.x1, p.y1);
      if (!local0 || !local1) { degenerate = true; break; }
      const [lx0, ly0] = local0, [lx1, ly1] = local1;
      const length = Math.hypot(lx1 - lx0, ly1 - ly0);
      const orientationDeg = ((Math.atan2(ly1 - ly0, lx1 - lx0) * 180) / Math.PI % 180 + 180) % 180;
      const sp = p.subpathId >= 0 ? idx.subpaths[p.subpathId] : null;
      attrById.set(pid, {
        primitiveId: pid, type: p.primType, length, normalizedLength: length,
        orientationDeg, deviceLineWidth: p.deviceLineWidth,
        dashed: sp?.dashed ?? false, lineCap: sp?.lineCap ?? 0, lineJoin: sp?.lineJoin ?? 0,
        closed: sp?.closed ?? false, degreeA: 1, degreeB: 1, curved: p.curved,
      });
      if (lx0 < bx0) bx0 = lx0; if (lx0 > bx1) bx1 = lx0; if (lx1 < bx0) bx0 = lx1; if (lx1 > bx1) bx1 = lx1;
      if (ly0 < by0) by0 = ly0; if (ly0 > by1) by1 = ly0; if (ly1 < by0) by0 = ly1; if (ly1 > by1) by1 = ly1;
    }

    if (degenerate) { results.push({ invocationId: inv.id, depth: inv.depth, primitiveIds, excludedInvisibleCount, signature: null }); continue; }
    const body = { id: inv.id, primitiveIds, x0: bx0, y0: by0, x1: bx1, y1: by1 };
    const signature = computeBodySignature(body, attrById);
    results.push({ invocationId: inv.id, depth: inv.depth, primitiveIds, excludedInvisibleCount, signature });
  }

  const byHash = new Map<string, number[]>();
  for (const r of results) {
    if (!r.signature) continue;
    let arr = byHash.get(r.signature.hash);
    if (!arr) { arr = []; byHash.set(r.signature.hash, arr); }
    arr.push(r.invocationId);
  }
  const repeatedGroups = [...byHash.values()].filter((g) => g.length > 1);

  return { invocations: results, repeatedGroups, incomplete: false, incompleteReason: null };
}
