/**
 * Pillar C — control-valve reconcile must key VALVE MARK, not UNIT MARK.
 * NAVFAC HHW schedules list served equipment in UNIT MARK and CV-* in VALVE MARK.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";
import {
  familyNeedleFromSpecs,
  reconcileScheduleFamilyFromGraph,
} from "../../web/src/lib/schedulePlanReconcile.mjs";

test("HHW_CONTROL_VALVE reconcile keys VALVE MARK over UNIT MARK", () => {
  const graph = {
    tables: [
      {
        sheet: "set.pdf#10",
        kind: "equipment",
        title: { text: "HHW CONTROL VALVE SCHEDULE" },
        rows: [
          {
            key: "CUH-A1",
            cells: {
              "UNIT MARK": { text: "CUH-A1" },
              "VALVE MARK": { text: "CV-CUH-A1-HHW" },
            },
          },
          {
            key: "FCU-A2",
            cells: {
              "UNIT MARK": { text: "FCU-A2" },
              "VALVE MARK": { text: "CV-FCU-A2-HHW" },
            },
          },
        ],
      },
    ],
  };
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HHW_CONTROL_VALVE");
  assert.ok(needle?.identityHeaderRe);
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.deepEqual(
    rows.map((r) => r.tag).sort(),
    ["CV-CUH-A1-HHW", "CV-FCU-A2-HHW"].sort(),
  );
  assert.ok(rows.every((r) => /^CV-/i.test(r.tag)));
});

test("CHW_CONTROL_VALVE reconcile keys VALVE MARK over UNIT MARK", () => {
  const graph = {
    tables: [
      {
        sheet: "set.pdf#11",
        kind: "equipment",
        title: { text: "CHW CONTROL VALVE SCHEDULE" },
        rows: [
          {
            key: "AHU-M1",
            cells: {
              "UNIT MARK": { text: "AHU-M1" },
              "VALVE MARK": { text: "CV-AHU-M1-CHW" },
            },
          },
        ],
      },
    ],
  };
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "CHW_CONTROL_VALVE");
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.deepEqual(rows.map((r) => r.tag), ["CV-AHU-M1-CHW"]);
});
