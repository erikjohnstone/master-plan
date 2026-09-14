import assert from "node:assert/strict";
import { test } from "node:test";
import { completeBasEstimatorOverview, completeBasHeaderCoverage, completeBasJourneyStages, takeoffAccessAvailable, takeoffNavigationBadge } from "../src/lib/completeBasPresentation.js";

test("complete BAS header preserves separate domain cardinalities and has no mixed aggregate EA field", () => {
  const coverage = completeBasHeaderCoverage({
    equipment_items: 396, point_lists: 21, point_rows: 546, point_type_review_rows: 3,
    sequences: 8, sequence_sections: 54, soo_point_candidates: 26, control_valve_items: 163,
    embedded_coil_gaps: 6, control_schematics: 9, riser_diagrams: 1,
    reconcile_rows: 293, reconcile_match: 141, reconcile_schedule_only: 152,
  });
  assert.deepEqual(coverage, {
    equipmentRecords: 396, pointLists: 21, pointRows: 546, pointTypeReviewRows: 3,
    sequences: 8, sequenceSections: 54, sooPointCandidates: 26, valveRecords: 163, coilGaps: 6,
    schematics: 9, risers: 1, reconcileRows: 293, reconcileMatches: 141,
    reconcileScheduleOnly: 152, reconcilePlanOnly: 0, reconcileAmbiguous: 0, reconcileRefused: 0,
    reconcileExceptions: 152,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(coverage, "ea"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(coverage, "quantity"), false);
});

test("complete BAS header stays renderable during intermediate null presentation state", () => {
  assert.deepEqual(completeBasHeaderCoverage(null), {
    equipmentRecords: 0, pointLists: 0, pointRows: 0, pointTypeReviewRows: 0, sequences: 0, sequenceSections: 0, sooPointCandidates: 0,
    valveRecords: 0, coilGaps: 0, schematics: 0, risers: 0,
    reconcileRows: 0, reconcileMatches: 0, reconcileScheduleOnly: 0, reconcilePlanOnly: 0,
    reconcileAmbiguous: 0, reconcileRefused: 0, reconcileExceptions: 0,
  });
});

test("estimator overview separates scope, grounding and typed I/O while producing a short review queue", () => {
  const overview = completeBasEstimatorOverview({
    coverage: {
      equipment_items: 396, point_lists: 21, point_rows: 546, point_type_review_rows: 3,
      sequences: 8, sequence_sections: 149, soo_point_candidates: 26, control_valve_items: 163,
      embedded_coil_gaps: 6, control_schematics: 9, riser_diagrams: 1,
      reconcile_rows: 293, reconcile_match: 141, reconcile_schedule_only: 148,
      reconcile_plan_only: 1, reconcile_ambiguous: 2, reconcile_refused: 1,
    },
    bas_math: {
      status: "review_required", source_coverage: "point_list_only",
      physical_total: { AI: 210, AO: 66, DI: 187, DO: 80 },
      diagnostics: [{ code: "ONE" }, { code: "TWO" }],
    },
  });
  assert.equal(overview.primaryMessage, "141 of 293 scheduled items have a grounded plan match.");
  assert.equal(overview.planCoveragePercent, 48);
  assert.equal(overview.typedPointTotal, 543);
  assert.deepEqual(overview.physical, { AI: 210, AO: 66, DI: 187, DO: 80 });
  assert.equal(overview.mathIssueCount, 2);
  assert.deepEqual(overview.reviewTasks.map(task => task.id), [
    "grounding", "coil-gaps", "point-types", "soo-candidates", "diagrams",
  ]);
  assert.equal(overview.reviewTasks[0].count, 152);
  assert.equal(Object.prototype.hasOwnProperty.call(overview, "ea"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(overview, "quantity"), false);
});

test("complete BAS navigation says ready instead of exposing a mixed record count", () => {
  assert.equal(takeoffNavigationBadge({ kind: "complete_bas_takeoff" }, 942, true), "ready");
  assert.equal(takeoffNavigationBadge({ kind: "hvac_equipment" }, 37, true), "37");
  assert.equal(takeoffNavigationBadge(null, 0, true), "data");
  assert.equal(takeoffNavigationBadge({ kind: "complete_bas_takeoff" }, 0, false), null);
  assert.equal(takeoffAccessAvailable(0, "ready"), true, "SOO-only complete BAS result remains openable");
  assert.equal(takeoffAccessAvailable(0, null), false);
  assert.equal(takeoffAccessAvailable(4, null), true);
});

test("guided BAS journey separates evidence readiness from explicit scoped approval", () => {
  const corpusMeta = { coverage: {
    equipment_items: 12, control_valve_items: 4, point_lists: 2, point_rows: 18,
    point_type_review_rows: 1, sequences: 3, sequence_sections: 14, soo_point_candidates: 2,
    control_schematics: 2, riser_diagrams: 1, reconcile_rows: 10, reconcile_match: 8,
    reconcile_schedule_only: 2,
  } };
  const pending = completeBasJourneyStages(corpusMeta);
  assert.deepEqual(pending.map(stage => stage.id), [
    "scope", "equipment", "grounding", "points", "controls", "exceptions", "release",
  ]);
  assert.equal(pending.find(stage => stage.id === "grounding")?.state, "attention");
  assert.equal(pending.find(stage => stage.id === "release")?.state, "blocked");
  assert.match(pending.find(stage => stage.id === "release")?.detail || "", /approval required/i);
  assert.match(pending.find(stage => stage.id === "grounding")?.instruction || "", /tag by itself is not an installed match/i);
  assert.match(pending.find(stage => stage.id === "scope")?.doneWhen || "", /saved as a reviewed scope/i);
  const approved = completeBasJourneyStages(corpusMeta, { approved: true });
  assert.equal(approved.find(stage => stage.id === "release")?.state, "verified");
  assert.match(approved.find(stage => stage.id === "release")?.detail || "", /snapshot verified/i);
});
