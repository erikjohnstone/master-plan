#!/usr/bin/env node
/**
 * Run test:workflows with optional TEST_SHARD=i/n (Node --test-shard).
 * Keeps shard flag out of package.json for Windows + npm cross-platform use.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(HERE, "..");

const TEST_FILES = [
  "test/crossCorpusWorkflow.test.mjs",
  "test/reconcileWorkflow.test.mjs",
  "test/reconcileGolden.test.mjs",
  "test/rowsymBessemer.regression.test.mjs",
  "test/planToolParity.test.mjs",
  "test/prewarmGraphSmoke.test.mjs",
  "test/sheetGraphCache.test.mjs",
  "test/demoD01.regression.test.mjs",
  "test/demoD08.regression.test.mjs",
  "test/demoD10.regression.test.mjs",
  "test/takeoffHvac01.regression.test.mjs",
  "test/takeoffBas01.regression.test.mjs",
  "test/takeoffValve01.regression.test.mjs",
];

const args = ["--import", "tsx", "--test"];
const shard = process.env.TEST_SHARD?.trim();
if (shard) args.push(`--test-shard=${shard}`);
args.push(...TEST_FILES.map((f) => resolve(MCP_ROOT, f)));

const result = spawnSync(process.execPath, args, {
  cwd: MCP_ROOT,
  stdio: "inherit",
  env: process.env,
});
process.exit(result.status ?? 1);
