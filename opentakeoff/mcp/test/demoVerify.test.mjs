import assert from "node:assert/strict";
import test from "node:test";
import {
  ocrGrounds,
  overlapAgainstSmaller,
  validateBbox,
  valueMatches,
  verifyDemoRun,
} from "../scripts/verify-demo.mjs";

test("demo verifier primitives enforce exact values and valid source boxes", () => {
  assert.equal(valueMatches(56, 56, 0), true);
  assert.equal(valueMatches(56.1, 56, 0), false);
  assert.equal(valueMatches(56.1, 56, 0.1), true);
  assert.equal(valueMatches("CH-A1", "CH-A1", "exact"), true);
  assert.equal(valueMatches("ch-a1", "CH-A1", "exact"), false);

  assert.equal(validateBbox([1, 2, 10, 20], [0, 0, 100, 100]), null);
  assert.match(validateBbox([1, 2, 1, 20], [0, 0, 100, 100]), /non-degenerate/);
  assert.match(validateBbox([-1, 2, 10, 20], [0, 0, 100, 100]), /outside/);
  assert.equal(overlapAgainstSmaller([0, 0, 10, 10], [1, 1, 9, 9]), 1);
  assert.equal(ocrGrounds("CV—CH A1", "CV-CH-A1"), true);
  assert.equal(ocrGrounds("Al10", "AI10"), false, "strict matching remains the default");
  assert.equal(ocrGrounds("Al10", "AI10", { allowConfusables: true }), true);
  assert.equal(ocrGrounds("A", "AI10", { allowConfusables: true }), false);
});

const truth = {
  expected: {
    capacity_tons: {
      type: "number",
      value: 56,
      tolerance: 0,
      citation: {
        sheet_id: "set.pdf#2",
        table_title: "CHILLER SCHEDULE",
        row_key: "CH-A1",
        column: "CAPACITY",
        bbox_px: [10, 20, 30, 40],
        grounding_text: "56.0",
      },
    },
  },
};

function fakeSession() {
  return {
    async graphForPipeline() {
      return {
        tables: [{
          sheet: "set.pdf#2",
          title: { text: "CHILLER SCHEDULE" },
        }],
      };
    },
    sheetList() {
      return [{ key: "set.pdf#2", widthPx: 100, heightPx: 100 }];
    },
    async viewSheet() {
      return { png: Buffer.from("crop") };
    },
  };
}

test("demo verifier passes value, resolvability, and OCR grounding together", async () => {
  const run = {
    status: "done",
    latency_ms: 1200,
    answer: {
      capacity_tons: {
        value: 56,
        citations: [{
          sheet_id: "set.pdf#2",
          table_title: "CHILLER SCHEDULE",
          row_key: "CH-A1",
          column: "CAPACITY",
          bbox_px: [10, 20, 30, 40],
        }],
      },
    },
  };
  const result = await verifyDemoRun({
    truth,
    run,
    session: fakeSession(),
    recognize: async () => "56.0",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((check) => check.assertion), [
    "VALUE",
    "CITE_RESOLVABLE",
    "CITE_GROUNDED",
  ]);
});

test("demo verifier classifies plausible-but-wrong source boxes as CITE_GROUND", async () => {
  const run = {
    status: "done",
    latency_ms: 1200,
    answer: {
      capacity_tons: {
        value: 56,
        citations: [{
          sheet_id: "set.pdf#2",
          table_title: "CHILLER SCHEDULE",
          row_key: "CH-A1",
          column: "CAPACITY",
          bbox_px: [60, 60, 80, 80],
        }],
      },
    },
  };
  const result = await verifyDemoRun({
    truth,
    run,
    session: fakeSession(),
    recognize: async () => "56.0",
  });
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].classification, "CITE_GROUND");
});
