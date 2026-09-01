/**
 * WP5 — production graph prewarm smoke (Session+ODL CLI path UI prewarm uses).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveTsxLoader } from "../../web/vite.corpusTakeoffApi.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CLI = resolve(HERE, "../scripts/production-graph-cli.mjs");
const PDF = resolve(CORPUS, "raw/bldg5406-hvac-demo-mechanical.pdf");

test("WP5 prewarm smoke: production graph CLI returns tables for fixture PDF", () => {
  if (!existsSync(PDF)) {
    test.skip(`PDF missing: ${PDF}`);
    return;
  }
  const tsx = resolveTsxLoader();
  const run = spawnSync(process.execPath, [
    "--import", tsx, CLI,
    "--mode", "graph",
    "--pdf", PDF,
  ], { cwd: resolve(HERE, ".."), encoding: "utf8", maxBuffer: 30 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const out = JSON.parse(run.stdout.trim().split("\n").at(-1));
  assert.equal(out.available, true);
  assert.ok(out.tables?.length >= 1, "graph has schedule tables");
  assert.ok(out.sheets?.length >= 1, "graph has sheets");
});
