// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 4 gate — "dense-grid cases
// preserve all real instances and suppress neighbor-borrowed phantoms."
// The prior PROGRESS.md entry's own scope-boundary finding: a dense grid
// of REPEATED RAW-GEOMETRY symbols (no Form XObject at all) generates
// zero Lane A invocations, so it never enters detectOwnershipClusters's
// own view — none of this session's Phase 4 ownership machinery ever
// runs on it. This module is the disclosed "dedicated real-sheet dense-
// grid check" that same entry named as one of two ways forward. It does
// NOT extend conflict detection (a bigger, riskier change to an already-
// shipped module); it instead gives a caller direct visibility into
// whether Lane B is finding the SAME repeated body multiple times, by
// generalizing Lane A's own already-shipped "group by identical
// signature hash" rule (computeFormContentSignatures's own
// repeatedGroups) to raw-geometry Lane B bodies Lane A can never see —
// reusing candidateBodySignature.ts's own computeBodySignatures
// unchanged, not a second signature algorithm.
//
// Deliberately NOT attempted here (disclosed, real further work): this
// module only GROUPS same-signature bodies — it does not judge whether a
// group's own member COUNT is plausible (a real dense diffuser grid
// might legitimately have 30+ repeats; a signature bucket collision
// between two UNRELATED small symbols is also possible and would show up
// as a false "repeated group" here), and it does not check the gate's
// own "suppress neighbor-borrowed phantoms" half at all — that needs
// comparing each group's own real page positions against expected grid
// spacing, not attempted in this slice.
import type { CandidateBody } from "./candidateBodyLaneB.ts";
import type { PrimitiveNodeAttributes } from "./candidateBodyLaneD.ts";
import { computeBodySignatures } from "./candidateBodySignature.ts";

export interface RepeatedGroupsResult {
  /** body ids grouped by identical signature hash — a group of size 1 is
   *  not repeated, only groups of 2+ are included, same convention as
   *  Lane A's own repeatedGroups. */
  repeatedGroups: number[][];
  /** how many bodies produced no signature at all (empty/unresolvable
   *  primitiveIds) — reported so a caller can tell "checked, nothing
   *  repeats" apart from "some bodies couldn't even be checked." */
  unsignedBodyCount: number;
}

/** Pure: groups Lane B candidate bodies by identical structural
 *  signature — the SAME rule candidateBodyLaneA.ts's own
 *  computeFormContentSignatures already applies to Form invocations,
 *  extended here to raw-geometry bodies Lane A can never see. Never
 *  mutates any input. */
export function groupRepeatedLaneBBodies(
  bodies: readonly CandidateBody[],
  attributes: readonly PrimitiveNodeAttributes[],
): RepeatedGroupsResult {
  const signatures = computeBodySignatures(bodies, attributes);
  const unsignedBodyCount = bodies.length - signatures.size;

  const byHash = new Map<string, number[]>();
  for (const [bodyId, sig] of signatures) {
    let arr = byHash.get(sig.hash);
    if (!arr) { arr = []; byHash.set(sig.hash, arr); }
    arr.push(bodyId);
  }
  const repeatedGroups = [...byHash.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.slice().sort((a, b) => a - b));
  return { repeatedGroups, unsignedBodyCount };
}
