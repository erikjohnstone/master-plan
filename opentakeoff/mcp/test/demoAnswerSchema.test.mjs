// Zod demo-answer schema built from truth.expected (Instructor-style validate).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDemoAnswer, demoAnswerSchema } from "../src/demoAnswerSchema.mjs";

const truth = {
  expected: {
    doah_ti_rows: { type: "integer", citations: [{}] },
    overall_ai: { type: "integer", citations: [{}] },
    note: { type: "string" },
  },
};

test("demoAnswerSchema validates a well-formed answer", () => {
  const ok = validateDemoAnswer({
    status: "done",
    answer: {
      doah_ti_rows: {
        value: 34,
        citations: [{ sheet_id: "M-601", bbox_px: [1, 2, 3, 4], table_title: "POINTS LIST DOAH-TI" }],
      },
      overall_ai: {
        value: 43,
        citations: [{ sheet_id: "M-601", bbox_px: [5, 6, 7, 8] }],
      },
      note: { value: "ok" },
    },
  }, truth);
  assert.equal(ok.ok, true);
});

test("demoAnswerSchema rejects missing citation and wrong types", () => {
  const bad = validateDemoAnswer({
    status: "done",
    answer: {
      doah_ti_rows: { value: "34" },
      overall_ai: { value: 43, citations: [] },
      note: { value: "x" },
    },
  }, truth);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /doah_ti_rows|overall_ai|citations/i.test(e)));
});

test("demoAnswerSchema is a Zod object", () => {
  const schema = demoAnswerSchema(truth);
  assert.equal(typeof schema.safeParse, "function");
});
