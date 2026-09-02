/**
 * Pillar gap recovery unit tests.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sheetNeedsPillarGapRecovery } from "../src/lib/pillarGapRecovery.ts";

describe("pillarGapRecovery", () => {
  it("flags schedule sheets with valve language but no valve-shaped table", () => {
    const g = {
      tables: [{
        sheet: "set.pdf#5",
        kind: "equipment",
        title: { text: "PUMP SCHEDULE" },
        headers: ["TAG", "HP"],
        rows: [{ key: "P-1", cells: { TAG: { text: "P-1" } } }],
      }],
    };
    const ctx = {
      key: "set.pdf#5",
      role: "schedule",
      spans: [{ str: "CHW CONTROL VALVE SCHEDULE", x: 10, y: 20, w: 200, h: 12 }],
      width: 800,
      height: 1200,
      pageViewportTransform: [1, 0, 0, 1, 0, 0],
    };
    assert.equal(sheetNeedsPillarGapRecovery(g, ctx), true);
  });

  it("does not flag when a valve-shaped table already exists", () => {
    const g = {
      tables: [{
        sheet: "set.pdf#5",
        kind: "equipment",
        title: { text: "" },
        headers: ["TAG", "GPM", "SIZE", "SERVED", "MANUFACTURER", "MODEL"],
        rows: [{ key: "CV-7", cells: { TAG: { text: "CV-7" }, GPM: { text: "120" } } }],
      }],
    };
    const ctx = {
      key: "set.pdf#5",
      role: "schedule",
      spans: [{ str: "CONTROL VALVE SCHEDULE", x: 10, y: 20, w: 200, h: 12 }],
      width: 800,
      height: 1200,
      pageViewportTransform: [1, 0, 0, 1, 0, 0],
    };
    assert.equal(sheetNeedsPillarGapRecovery(g, ctx), false);
  });
});
