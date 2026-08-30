// Production compile spawn must resolve tsx without bare package name + mcp cwd.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolveTsxLoader } from "../vite.corpusTakeoffApi.js";
import { requiredEvidenceCorrection } from "../src/lib/agentLoop.js";

test("resolveTsxLoader returns an existing tsx loader file", () => {
  const loader = resolveTsxLoader();
  assert.ok(loader, "loader path");
  assert.ok(existsSync(loader), `missing ${loader}`);
  assert.match(loader, /tsx/i);
});

test("requiredEvidenceCorrection fatals after compile_corpus_takeoff error (no 80-step loop)", () => {
  const goal = "Run a complete valve takeoff on this blueprint set";
  const first = requiredEvidenceCorrection([], goal, "");
  assert.match(first || "", /compile_corpus_takeoff/);
  assert.ok(!first.startsWith("__FATAL__:"));

  const afterFail = requiredEvidenceCorrection([{
    name: "compile_corpus_takeoff",
    out: { error: "Cannot find package 'tsx'" },
  }], goal, "");
  assert.ok(afterFail.startsWith("__FATAL__:"), afterFail);
  assert.match(afterFail, /tsx|Install|failed/i);
});
