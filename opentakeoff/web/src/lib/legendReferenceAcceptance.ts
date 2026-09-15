// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 7 requirement 6 — Legend
// Learn integration: "accepted legend row creates a reference candidate,
// not a count. Family binding records caption/schema/tag evidence.
// Multiple symbol variants remain separate. Unsafe/nonseedable rows
// remain unavailable for automatic sweep."
//
// AUDITED BEFORE BUILDING (dedicated Phase 7 investigation, this
// checkpoint): searched directly for an existing "accepted legend row"
// workflow — none exists. `legendlearn.ts`'s own `findLegendGlyphs`
// only DETECTS candidate legend glyphs and discloses `seedable`;
// nothing today persists an explicit human-reviewed "accepted" state.
// This module is genuinely new integration work on top of this
// project's own `legendReferenceBank.ts` (Phase 0-6), not a refactor of
// an existing accept-flow — confirmed, not assumed.
//
// "Not a count": an `AcceptedLegendReference` structurally carries no
// quantity field anywhere — accepting a legend row records IDENTITY
// (which family, which real primitive set, what evidence backs the
// binding), never a number of installed instances. A caller wiring this
// into Phase 6's own `classifyInstalledEvidence` gets family-identity
// evidence for the PLAN_ONLY/MATCH distinction from `tagLegendEdges`
// exactly as already built; this module governs whether a legend entry
// is even ELIGIBLE to back that edge, nothing more.
//
// "Unsafe/nonseedable rows remain unavailable for automatic sweep":
// `acceptLegendReference` REFUSES outright (returns `refusalReason:
// "not-seedable"`, `accepted: null`) for any entry whose own
// `seedable` is false — the caller cannot override this by supplying
// stronger evidence; `legendReferenceBank.ts`'s own `seedable` flag,
// already computed from `legendlearn.ts`'s own real detection, is the
// single source of truth for this gate, never re-decided here.
//
// "Multiple symbol variants remain separate": this module never merges
// or deduplicates entries sharing the same caption — each
// `LegendReferenceEntry` (already its own distinct primitive set/
// signature per `legendReferenceBank.ts`) is accepted independently;
// two real variants of "V-1" become two separate
// `AcceptedLegendReference` entries, confirmed by a dedicated test
// below, never collapsed into one.
import type { LegendReferenceEntry } from "./legendReferenceBank.ts";

export type LegendAcceptanceRefusalReason = "not-seedable";

/** Requirement 6's own "family binding records caption/schema/tag
 *  evidence" — each field independently disclosed, never compressed
 *  into a single confidence (the same discipline evidenceGraph.ts's
 *  own TagCorroboration already established). `null` means that
 *  evidence source was not supplied for this acceptance, not that it
 *  was checked and found absent. */
export interface LegendFamilyBinding {
  caption: string;
  /** e.g. a schedule/table family this legend row's own caption was
   *  cross-checked against, when a caller has one. */
  schemaEvidence: string | null;
  /** e.g. a real drawn tag token confirmed to use this family, when a
   *  caller has one. */
  tagEvidence: string | null;
}

export interface AcceptedLegendReference {
  entry: LegendReferenceEntry;
  familyBinding: LegendFamilyBinding;
}

export interface LegendAcceptanceResult {
  accepted: AcceptedLegendReference | null;
  refusalReason: LegendAcceptanceRefusalReason | null;
}

/** Pure: accepts one legend reference entry as a real reference
 *  candidate, or refuses it outright when `entry.seedable` is false —
 *  never overridable by a caller's own supplied evidence. Never
 *  mutates `entry`. */
export function acceptLegendReference(
  entry: LegendReferenceEntry,
  evidence: { schemaEvidence?: string | null; tagEvidence?: string | null } = {},
): LegendAcceptanceResult {
  if (!entry.seedable) return { accepted: null, refusalReason: "not-seedable" };
  return {
    accepted: {
      entry,
      familyBinding: {
        caption: entry.caption,
        schemaEvidence: evidence.schemaEvidence ?? null,
        tagEvidence: evidence.tagEvidence ?? null,
      },
    },
    refusalReason: null,
  };
}

/** Pure: accepts every entry independently — never merges or dedupes
 *  entries sharing the same caption (multiple real symbol variants of
 *  one family stay separate, by construction: this is a 1:1 map, never
 *  a group-by). `evidenceFor`, when supplied, is called once per entry
 *  so a caller can attach per-entry schema/tag evidence. */
export function acceptLegendReferences(
  entries: readonly LegendReferenceEntry[],
  evidenceFor?: (entry: LegendReferenceEntry) => { schemaEvidence?: string | null; tagEvidence?: string | null },
): LegendAcceptanceResult[] {
  return entries.map((entry) => acceptLegendReference(entry, evidenceFor ? evidenceFor(entry) : {}));
}
