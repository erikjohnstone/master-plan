#!/usr/bin/env node
/**
 * Eval harness entry — unit tests + corpus scoreboard when out/ exists.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scorePath = resolve(ROOT, "eval/scoreboard.json");
const corpusRoot = resolve(ROOT, "../opentakeoff-corpus");
const outDir = resolve(ROOT, "out");

const webTest = spawnSync(
  "node",
  ["--import", "tsx", "--test",
    "test/gridClassify.test.ts",
    "test/estimatorTakeoffDocument.test.ts",
    "test/pipelineHarness.test.ts",
    "test/scheduleLanguageScan.test.ts",
    "test/pillarGapRecovery.test.ts",
    "test/sequenceExtract.test.ts",
    "test/scheduleTableSidecarAdapter.test.ts",
    "test/vectorTakeoffPipeline.test.ts"],
  { cwd: resolve(ROOT, "web"), stdio: "inherit" },
);
if (webTest.status !== 0) process.exit(webTest.status ?? 1);

if (existsSync(outDir) && existsSync(resolve(outDir, "_emit-summary.json"))) {
  const corpusEval = spawnSync(
    "node",
    ["eval/runCorpusEval.mjs", corpusRoot, "--out", outDir],
    { cwd: ROOT, stdio: "inherit" },
  );
  if (corpusEval.status !== 0) process.exit(corpusEval.status ?? 1);
}

if (!existsSync(scorePath)) {
  console.error("missing eval/scoreboard.json");
  process.exit(1);
}
const board = JSON.parse(readFileSync(scorePath, "utf8"));
console.log(JSON.stringify({ ok: true, scoreboard: board.metrics, acceptance: board.acceptance }, null, 2));
