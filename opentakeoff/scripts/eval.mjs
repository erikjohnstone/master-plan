#!/usr/bin/env node
/**
 * Eval harness entry — runs unit tests + scoreboard placeholder until gold is populated.
 * Full corpus scoring lands in eval/runCorpusEval.mjs (P2+).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scorePath = resolve(ROOT, "eval/scoreboard.json");

const webTest = spawnSync(
  "node",
  ["--import", "tsx", "--test", "test/scheduleTableSidecarAdapter.test.ts", "test/vectorTakeoffPipeline.test.ts"],
  { cwd: resolve(ROOT, "web"), stdio: "inherit" },
);
if (webTest.status !== 0) process.exit(webTest.status ?? 1);

if (!existsSync(scorePath)) {
  console.error("missing eval/scoreboard.json");
  process.exit(1);
}
const board = JSON.parse(readFileSync(scorePath, "utf8"));
console.log(JSON.stringify({ ok: true, scoreboard: board.metrics, acceptance: board.acceptance }, null, 2));
