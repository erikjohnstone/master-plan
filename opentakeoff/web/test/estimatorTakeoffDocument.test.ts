/**
 * Integrated estimator document — wraps Pillar A/C compile, not a fork.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildEstimatorTakeoffDocument } from "../src/lib/estimatorTakeoffDocument.mjs";

const graph = {
  sheets: [{ key: "set.pdf#5" }],
  tables: [
    {
      sheet: "set.pdf#5",
      kind: "equipment",
      title: { text: "" },
      headers: ["TAG", "GPM", "SIZE", "SERVED"],
      rows: [
        {
          key: "CV-7",
          sheet: "set.pdf#5",
          cells: {
            TAG: { text: "CV-7", bbox: [10, 20, 40, 30] },
            GPM: { text: "120", bbox: [50, 20, 80, 30] },
            SIZE: { text: '2"', bbox: [90, 20, 120, 30] },
            SERVED: { text: "AHU-1", bbox: [130, 20, 170, 30] },
          },
        },
      ],
    },
    {
      sheet: "set.pdf#8",
      kind: "equipment",
      title: { text: "AHU-1 I/O LIST" },
      headers: ["TAG", "AI", "AO", "DESCRIPTION"],
      rows: [
        {
          key: "AI-1",
          sheet: "set.pdf#8",
          cells: { TAG: { text: "AI-1", bbox: [10, 10, 40, 20] } },
        },
      ],
    },
  ],
};

describe("estimatorTakeoffDocument integration", () => {
  it("preserves Pillar A/C compile outputs in pillars.c_estimator", () => {
    const doc = buildEstimatorTakeoffDocument(graph, { file: "set.pdf" });
    assert.ok(doc.pillars?.a_compile?.takeoff_ids?.valve);
    assert.ok(doc.pillars?.c_estimator?.valve);
    assert.ok(doc.pillars?.c_estimator?.bas);
    assert.equal(doc.pillars.c_estimator.valve.estimator_complete, false);
  });

  it("finds real BAS points from the AHU-1 I/O LIST fixture table (basCompile.categories.points_lists.lists, not a top-level basCompile.lists)", () => {
    const doc = buildEstimatorTakeoffDocument(graph, { file: "set.pdf" });
    assert.ok(doc.pillars?.a_compile?.bas_lists > 0, "bas_lists must count the real I/O LIST table, not stay 0");
    assert.ok(doc.points.length > 0, "the fixture's own AHU-1 I/O LIST row (AI-1) must produce a real point");
    assert.ok(doc.points.some((p) => p.name === "AI-1" || p.description === "AI-1"));
    assert.ok(doc.totals.points.AI > 0, "totals.points must reflect the real AI count, not the permanent-zero this bug produced");
  });

  it("includes pipeline harness corroboration", () => {
    const doc = buildEstimatorTakeoffDocument(graph, { file: "set.pdf" });
    assert.ok(doc.pipeline_harness);
    assert.ok(Array.isArray(doc.grid_classifications));
  });

  it("emits grounded valve evidence from compile cells", () => {
    const doc = buildEstimatorTakeoffDocument(graph, { file: "set.pdf" });
    assert.ok(doc.valves.length >= 1);
    const cv = doc.valves.find((v) => v.tag === "CV-7");
    assert.ok(cv);
    assert.ok(cv.evidence.length >= 1);
    assert.ok(cv.evidence[0].bbox[2] > cv.evidence[0].bbox[0]);
  });

  it("embeds Pillar B reconcile rows when provided", () => {
    const doc = buildEstimatorTakeoffDocument(graph, {
      file: "set.pdf",
      reconcileSummary: {
        rows: [{
          tag: "CV-7",
          status: "SCHEDULE_ONLY",
          scheduled_qty: 1,
          installed_qty: 0,
          plan_cites: [],
        }],
        summary: { total: 1, schedule_only: 1, match: 0, plan_only: 0 },
      },
    });
    assert.ok(doc.pillars?.b_reconcile);
    assert.equal(doc.pillars.b_reconcile.rows.length, 1);
    assert.ok(doc.discrepancies.some((d) => d.itemRef === "CV-7"));
  });
});
