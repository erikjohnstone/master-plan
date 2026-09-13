import assert from "node:assert/strict";
import { test } from "node:test";
import { completeBasHeaderCoverage, takeoffAccessAvailable, takeoffNavigationBadge } from "../src/lib/completeBasPresentation.js";

test("complete BAS header preserves separate domain cardinalities and has no mixed aggregate EA field", () => {
  const coverage = completeBasHeaderCoverage({
    equipment_items: 396, point_lists: 21, point_rows: 546, point_type_review_rows: 3,
    sequences: 8, sequence_sections: 54, soo_point_candidates: 26, control_valve_items: 163,
    embedded_coil_gaps: 6, control_schematics: 9, riser_diagrams: 1,
    reconcile_rows: 293, reconcile_match: 141,
  });
  assert.deepEqual(coverage, {
    equipmentRecords: 396, pointLists: 21, pointRows: 546, pointTypeReviewRows: 3,
    sequences: 8, sequenceSections: 54, sooPointCandidates: 26, valveRecords: 163, coilGaps: 6,
    schematics: 9, risers: 1, reconcileRows: 293, reconcileMatches: 141,
    reconcileExceptions: 152,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(coverage, "ea"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(coverage, "quantity"), false);
});

test("complete BAS header stays renderable during intermediate null presentation state", () => {
  assert.deepEqual(completeBasHeaderCoverage(null), {
    equipmentRecords: 0, pointLists: 0, pointRows: 0, pointTypeReviewRows: 0, sequences: 0, sequenceSections: 0, sooPointCandidates: 0,
    valveRecords: 0, coilGaps: 0, schematics: 0, risers: 0,
    reconcileRows: 0, reconcileMatches: 0, reconcileExceptions: 0,
  });
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
