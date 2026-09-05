#!/usr/bin/env node
/**
 * Run test:workflows with optional TEST_SHARD=i/n (Node --test-shard).
 * Keeps shard flag out of package.json for Windows + npm cross-platform use.
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";

const HERE = dirname(fileURLToPath(import.meta.url));
const MCP_ROOT = resolve(HERE, "..");
const WEB_ROOT = resolve(MCP_ROOT, "..", "web");

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
let status = result.status ?? 1;

// Phase 7 (foundation-cohesion plan): the real end-to-end proof — a live
// Cerebras-backed agent, in a real browser, driving compile → reconcile →
// panel → CSV export on the anchor NAVFAC document, then cross-checked
// against production-graph-cli.mjs's own compile. Key-present guard, not a
// hard requirement: no key configured here (most local/CI runs) skips it
// rather than failing the whole suite on missing credentials, but a shard
// run skips it unconditionally too — sharding doesn't apply to a single
// browser-driven script, and it must never run once per shard.
const hasLiveKey = !!(process.env.CEREBRAS_API_KEY?.trim() || (existsSync("/tmp/cerebras_ui_key.txt") && readFileSync("/tmp/cerebras_ui_key.txt", "utf8").trim()));
if (shard) {
  console.error("test:workflows: TEST_SHARD set — skipping the playwright UI end-to-end proof (does not shard)");
} else if (!hasLiveKey) {
  console.error("test:workflows: no CEREBRAS_API_KEY (env or /tmp/cerebras_ui_key.txt) — skipping the playwright UI end-to-end proof");
} else if (status !== 0) {
  console.error("test:workflows: earlier tests failed — skipping the playwright UI end-to-end proof");
} else {
  console.error("test:workflows: running the playwright UI end-to-end proof (hvac anchor document)");
  const uiResult = spawnSync(process.execPath, [resolve(WEB_ROOT, "scripts/playwright-takeoff-ui-demo.mjs"), "hvac"], {
    cwd: WEB_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  status = uiResult.status ?? 1;
}

process.exit(status);
