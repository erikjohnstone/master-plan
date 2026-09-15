// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 6 — "joint tag, leader,
// legend, schedule, and body assignment." FIRST slice: requirement 1 —
// "Build one evidence graph per sheet/local region: tag tokens,
// candidate bodies, leaders, legend references, schedule identities,
// system/carrier attachments" — plus the minimal CANDIDATE edges needed
// to connect them. SECOND slice, same file: requirement 2's two
// hard-eligibility checks decidable from what a body already discloses
// — "empty-body" (zero primitives) and "conflicting candidate" (a
// caller-disclosed still-contested Phase 4 cluster membership, via the
// new optional `EvidenceBodyLike.contested` field). Per the goal's own
// wording ("may be DISPLAYED but cannot steal a tag"), an ineligible
// body's own tag<->body edges are never removed — only the body's own
// `ineligibleReasons` is populated, for a later assignment step to
// actually enforce. Deliberately NOT the rest of Phase 6 (disclosed,
// not silently skipped):
// - requirement 2's remaining two reasons, "bounds-failed" and
//   "topology-impossible" — real further work: "bounds-failed" most
//   naturally maps to Phase 5's own `verifyIsolatedSupport` returning
//   `insufficient_evidence` against a real reference, which this slice
//   has no natural reference to fit against yet; "topology-impossible"
//   needs its own dedicated definition this slice does not invent.
// - requirement 3's own remaining edge-level scoring beyond tag
//   corroboration (see THIRD slice, below) — no single collapsed
//   confidence exists anywhere in this module, by design.
// - requirement 4 (duplicate-tag resolution within drawing/building/
//   floor/discipline scope).
// - requirements 5-9 (the accepted-installed-quantity state machine:
//   MATCH/SCHEDULE_ONLY/PLAN_ONLY/UNCLASSIFIED_PLAN_SYMBOL/TAG_ONLY).
//
// THIRD slice, same file: `computeTagCorroboration` — requirement 3's
// own "score eligible edges using independently disclosed evidence, do
// not compress all reasoning into a single unexplained confidence."
// Rather than inventing an unvalidated numeric weight for `via`/
// `distancePx` (this project's own established discipline: no
// unvalidated threshold without real corpus grounding — see
// ownershipEligibility.ts's own header on the same point), this slice
// reports which INDEPENDENT evidence sources (body geometry, schedule
// row, legend reference) actually corroborate each tag, and separately
// whether any of its own body edges reach an ELIGIBLE body (requirement
// 2's own concern). A tag corroborated by all three is real, disclosed,
// stronger evidence than one reached by a single source — exactly the
// same "preserve which lanes voted" idea `candidateProposalFusion.ts`'s
// own `votingLanes` already established for bodies, now applied to tags.
//
// AUDITED BEFORE BUILDING (dedicated investigation, this checkpoint):
// every non-body, non-carrier node kind the goal names already has a
// real, tested, shared-path source in this codebase — reused here
// read-only, never modified, never reimplemented:
// - tag tokens + leaders: symbollabels.ts's own `labelTokens` (raw
//   positioned text spans -> real tag-shaped spans) and
//   `leaderTerminalPointsForLabel` (one token's own traced leader
//   endpoints). `labelPlacements` (point-in, PlacementLabel-out,
//   already encoding `via: "adjacent"|"leader"` and `distance_px`) is
//   reused DIRECTLY for the tag<->body candidate edge below, exactly
//   the same primitive `taggedVectorGrounding.ts` already uses for one
//   tag at a time — this module calls it once for every candidate
//   body's own anchor point instead.
// - legend references: legendReferenceBank.ts's own `buildLegendReferenceBank`
//   output (`LegendReferenceEntry`, one per legend row, already carrying
//   a resolved primitive set and BodySignature).
// - schedule identities: sheetgraph.ts's own `TableRow.key` (read-only —
//   this module never touches sheetgraph.ts or schedule reconstruction
//   itself, exactly the goal's own explicit rule).
// - identity matching (tag label <-> schedule key <-> legend caption):
//   markid.ts's own `marksEqual`, the SAME normalization schedule/tag
//   reconciliation already uses elsewhere — never a bespoke string
//   comparison invented here.
// - candidate bodies: this project's own Phase 3/4 output (a fused
//   proposal or a resolved OwnedBody — both already share the same
//   minimal `{ id, primitiveIds, x0,y0,x1,y1 }` shape this module
//   accepts structurally, so either can be passed directly).
// - system/carrier attachments: carrierClassification.ts's own
//   `classifyCarrierPrimitives`, run once per body against that body's
//   own primitive set — modeled here as an ATTRIBUTE on each BodyNode
//   (`carrierAttachment`), not a separate free-standing node type: the
//   goal's own wording ("system/carrier ATTACHMENTS") names a property
//   OF a body's own ink, not an independent entity with its own
//   identity elsewhere in the graph — a disclosed design choice, not an
//   omission.
//
// Every input this module accepts is something a caller ALREADY
// computed elsewhere (Phase 2's VectorSceneIndex, Phase 3/4's own
// bodies, symbollabels.ts/legendReferenceBank.ts/sheetgraph.ts's own
// real outputs) — this module only ASSEMBLES them into one graph and
// draws the minimal real candidate edges; it never re-extracts text,
// re-parses a schedule, or re-detects a legend glyph.
import type { VectorSceneIndex } from "./vectorSceneIndex.ts";
import type { Point } from "./oneclick.ts";
import type { LabelSpan, PlacementLabel } from "./symbollabels.ts";
import { labelTokens, labelPlacements, leaderTerminalPointsForLabel, canonicalLabelFamily } from "./symbollabels.ts";
import { classifyCarrierPrimitives } from "./carrierClassification.ts";
import { marksEqual } from "./markid.ts";

/** The minimal shape a candidate body needs — structurally satisfied by
 *  a Phase 3 `FusedProposal`, a Phase 4 `OwnedBody`, or any equivalent
 *  caller-built body, passed straight through with no copying required
 *  beyond what this module itself adds. `contested`, when the caller
 *  can supply it (Phase 4's own `detectOwnershipClusters` split — a
 *  body that came from a still-unresolved cluster rather than an
 *  uncontested proposal or an already-resolved OwnedBody), feeds
 *  requirement 2's own "conflicting candidate" hard-eligibility check
 *  below; omitted (not every caller has this yet) defaults to
 *  uncontested, never guessed as contested. */
export interface EvidenceBodyLike {
  id: number;
  primitiveIds: readonly number[];
  x0: number; y0: number; x1: number; y1: number;
  contested?: boolean;
}

/** The minimal shape a schedule row needs — structurally satisfied by
 *  sheetgraph.ts's own `TableRow` (never imported directly: this module
 *  must not couple to that file's own full surface, only the two
 *  fields it actually reads). */
export interface EvidenceScheduleRowLike {
  key: string;
  sheet: string;
  cells: Readonly<Record<string, { text: string }>>;
}

/** The minimal shape a legend reference needs — structurally satisfied
 *  by legendReferenceBank.ts's own `LegendReferenceEntry`. */
export interface EvidenceLegendEntryLike {
  caption: string;
  primitiveIds: readonly number[];
  rect: readonly [Point, Point];
}

export interface TagNode {
  id: number;
  label: string;
  canonicalFamily: string;
  tokenBbox: [number, number, number, number];
  /** every real traced leader endpoint from this token, via
   *  leaderTerminalPointsForLabel — empty when the token has no drawn
   *  leader at all (an adjacent-only tag, the common case). */
  leaderTerminals: Point[];
}

/** Requirement 2's own two named hard-eligibility failures this slice
 *  can actually decide from what a body already discloses (see this
 *  module's own header for "bounds-failed"/"topology-impossible" — real
 *  further work, not guessed at here). */
export type IneligibilityReason = "empty-body" | "conflicting-candidate";

export interface BodyNode {
  id: number;
  primitiveIds: readonly number[];
  x0: number; y0: number; x1: number; y1: number;
  /** null when this body has only one distinct subpath — nothing to
   *  compare against, honestly reported rather than guessed (the same
   *  contract classifyCarrierPrimitives itself already discloses). */
  carrierAttachment: { hasCarrierLikeInk: boolean; carrierPrimitiveIds: number[] } | null;
  /** requirement 2: "Bounds-failed, topology-impossible, empty-body, or
   *  conflicting candidates may be DISPLAYED but cannot steal a tag" —
   *  so an ineligible body's own tag<->body edges are NOT removed from
   *  `tagBodyEdges` above (still inspectable), only marked here for a
   *  later assignment step to actually enforce. Empty when eligible. */
  ineligibleReasons: IneligibilityReason[];
}

export interface LegendNode {
  id: number;
  caption: string;
  primitiveIds: readonly number[];
  rect: readonly [Point, Point];
}

export interface ScheduleNode {
  id: number;
  key: string;
  sheet: string;
  cells: Readonly<Record<string, { text: string }>>;
}

/** A tag<->body candidate edge: real underlying evidence (via, distance,
 *  the actual traced token), never a single collapsed confidence
 *  (requirement 3's own concern — deliberately left for later scoring). */
export interface TagBodyEdge {
  tagId: number;
  bodyId: number;
  via: "adjacent" | "leader";
  distancePx: number;
}

export interface TagScheduleEdge {
  tagId: number;
  scheduleId: number;
}

export interface TagLegendEdge {
  tagId: number;
  legendId: number;
}

export interface EvidenceGraph {
  tags: TagNode[];
  bodies: BodyNode[];
  legends: LegendNode[];
  schedules: ScheduleNode[];
  tagBodyEdges: TagBodyEdge[];
  tagScheduleEdges: TagScheduleEdge[];
  tagLegendEdges: TagLegendEdge[];
}

export type EvidenceSource = "body" | "schedule" | "legend";

export interface TagCorroboration {
  tagId: number;
  /** every independent evidence source that actually reaches this tag —
   *  never a single collapsed number (requirement 3's own concern). */
  sources: EvidenceSource[];
  /** true only when at least one of this tag's own body edges reaches a
   *  body with an EMPTY `ineligibleReasons` — a tag reaching only
   *  ineligible bodies still gets "body" in `sources` above (the goal's
   *  own "may be displayed"), but this field is what a later assignment
   *  step should actually check before accepting the pairing. */
  hasEligibleBodyEdge: boolean;
}

/** Pure: for every tag in `graph`, reports which independent evidence
 *  sources corroborate it and whether any reaches an eligible body.
 *  Never mutates `graph`. Operates on an already-built EvidenceGraph, so
 *  it composes with `buildSheetEvidenceGraph` rather than folding into
 *  it. */
export function computeTagCorroboration(graph: EvidenceGraph): TagCorroboration[] {
  const bodyById = new Map(graph.bodies.map((b) => [b.id, b] as const));
  return graph.tags.map((tag) => {
    const bodyEdges = graph.tagBodyEdges.filter((e) => e.tagId === tag.id);
    const sources: EvidenceSource[] = [];
    if (bodyEdges.length > 0) sources.push("body");
    if (graph.tagScheduleEdges.some((e) => e.tagId === tag.id)) sources.push("schedule");
    if (graph.tagLegendEdges.some((e) => e.tagId === tag.id)) sources.push("legend");
    const hasEligibleBodyEdge = bodyEdges.some((e) => (bodyById.get(e.bodyId)?.ineligibleReasons.length ?? 1) === 0);
    return { tagId: tag.id, sources, hasEligibleBodyEdge };
  });
}

function bodyAnchor(b: EvidenceBodyLike): Point {
  return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
}

/** Pure: assembles one evidence graph for a sheet/local region from
 *  already-computed inputs. Never mutates any input, never re-derives
 *  anything an existing module already owns. `segs`/`lum` are the raw
 *  VectorGeometry arrays `labelPlacements`/`leaderTerminalPointsForLabel`
 *  need for leader tracing — read-only, same arrays a caller already
 *  extracted for `idx`. */
export function buildSheetEvidenceGraph(
  idx: VectorSceneIndex,
  bodies: readonly EvidenceBodyLike[],
  labelSpans: readonly LabelSpan[],
  segs: readonly number[],
  lum: Uint8Array | undefined,
  legendEntries: readonly EvidenceLegendEntryLike[],
  scheduleRows: readonly EvidenceScheduleRowLike[],
): EvidenceGraph {
  const spans = labelSpans as LabelSpan[];
  const tokens = labelTokens(spans);
  const tags: TagNode[] = tokens.map((token, i) => ({
    id: i,
    label: token.str,
    canonicalFamily: canonicalLabelFamily(token.str),
    tokenBbox: [token.x0, token.y0, token.x1, token.y1],
    leaderTerminals: leaderTerminalPointsForLabel(token, spans, segs as number[], lum),
  }));

  const bodyNodes: BodyNode[] = bodies.map((b) => {
    const classes = classifyCarrierPrimitives(b.primitiveIds, idx);
    const carrierAttachment = classes.length === 0 || classes.every((c) => c.extentRatio === null)
      ? null
      : { hasCarrierLikeInk: classes.some((c) => c.isCarrierLike), carrierPrimitiveIds: classes.filter((c) => c.isCarrierLike).map((c) => c.primitiveId) };
    const ineligibleReasons: IneligibilityReason[] = [];
    if (b.primitiveIds.length === 0) ineligibleReasons.push("empty-body");
    if (b.contested) ineligibleReasons.push("conflicting-candidate");
    return { id: b.id, primitiveIds: b.primitiveIds, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, carrierAttachment, ineligibleReasons };
  });

  const legends: LegendNode[] = legendEntries.map((e, i) => ({ id: i, caption: e.caption, primitiveIds: e.primitiveIds, rect: e.rect }));
  const schedules: ScheduleNode[] = scheduleRows.map((r, i) => ({ id: i, key: r.key, sheet: r.sheet, cells: r.cells }));

  // tag<->body: reuse labelPlacements DIRECTLY (the same adjacency/leader
  // primitive taggedVectorGrounding.ts already relies on for one tag at a
  // time), called once for every body's own anchor point.
  const anchors = bodies.map(bodyAnchor);
  const placements: (PlacementLabel | null)[] = labelPlacements(anchors, spans, segs as number[], lum);
  const tagByTokenBbox = new Map<string, number>();
  tags.forEach((t) => tagByTokenBbox.set(t.tokenBbox.join(","), t.id));
  const tagBodyEdges: TagBodyEdge[] = [];
  placements.forEach((placement, bodyIdx) => {
    if (!placement || !placement.token_bbox) return;
    const tagId = tagByTokenBbox.get(placement.token_bbox.join(","));
    if (tagId === undefined) return; // defensive: labelPlacements' own internal labelTokens call is idempotent/cached, so this should always resolve
    tagBodyEdges.push({ tagId, bodyId: bodyNodes[bodyIdx].id, via: placement.via, distancePx: placement.distance_px });
  });

  // tag<->schedule and tag<->legend: identity match via markid.ts's own
  // marksEqual, the same normalization already used for schedule/tag
  // reconciliation elsewhere — never a bespoke comparison here.
  const tagScheduleEdges: TagScheduleEdge[] = [];
  for (const tag of tags) {
    for (const sched of schedules) {
      if (marksEqual(tag.label, sched.key)) tagScheduleEdges.push({ tagId: tag.id, scheduleId: sched.id });
    }
  }
  const tagLegendEdges: TagLegendEdge[] = [];
  for (const tag of tags) {
    for (const legend of legends) {
      if (marksEqual(tag.label, legend.caption)) tagLegendEdges.push({ tagId: tag.id, legendId: legend.id });
    }
  }

  return { tags, bodies: bodyNodes, legends, schedules, tagBodyEdges, tagScheduleEdges, tagLegendEdges };
}
