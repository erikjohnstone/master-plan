/**
 * WP5 — Session plan-tool parity on frozen fixtures.
 * reconcileScheduleFamilyWithSweeps and direct sweepScheduleRow must agree
 * on installed qty for sampled tags (shared Session path, not UI fork).
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { reconcileScheduleFamilyWithSweeps, familyNeedleFromSpecs } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";
import { resolveTsxLoader } from "../../web/vite.corpusTakeoffApi.js";
import { reconcileSchedulePlan } from "../src/takeoff.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const D07 = resolve(CORPUS, "demos/D07-vav-plan-link-fan-refuse");
const CLI = resolve(HERE, "../scripts/production-graph-cli.mjs");
const PDF = resolve(CORPUS, "raw/bldg5406-hvac-demo-mechanical.pdf");

test("WP5 parity: reconcile installed_qty matches sweepScheduleRow on D07 VAV tags", async () => {
  const { graph, session } = await loadFixtureSession(CORPUS, D07);
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const tags = ["VAV-1", "VAV-5", "VAV-9"];
  const reconciled = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    tags,
    evaluationFast: true,
  });
  for (const tag of tags) {
    const row = reconciled.rows.find((r) => r.tag.toUpperCase() === tag);
    assert.ok(row, `${tag} reconcile row`);
    const sweep = await session.sweepScheduleRow(tag, { evaluationFast: true });
    const sweepQty = (sweep.found ?? sweep.quantity ?? 0) > 0 ? 1 : 0;
    assert.equal(
      row.installed_qty,
      sweepQty,
      `${tag} reconcile installed_qty must match sweepScheduleRow`,
    );
  }
});

test("WP5 production CLI reconcile matches Session reconcileSchedulePlan on D07 VAV", async () => {
  if (!existsSync(PDF)) {
    test.skip(`PDF missing: ${PDF}`);
    return;
  }
  const { session } = await loadFixtureSession(CORPUS, D07);
  const tsx = resolveTsxLoader();
  const run = spawnSync(process.execPath, [
    "--import", tsx, CLI,
    "--mode", "reconcile",
    "--pdf", PDF,
    "--family", "VAV",
    "--family-sweep-all",
  ], { cwd: resolve(HERE, ".."), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const cliOut = JSON.parse(run.stdout.trim().split("\n").at(-1));
  const apiOut = await reconcileSchedulePlan(session, {
    family: "VAV",
    familySweepAll: true,
    evaluationFast: true,
  });
  assert.ok(cliOut.rows?.length >= 9);
  assert.equal(cliOut.summary?.match, apiOut.summary?.match);
  const vav1Cli = cliOut.rows.find((r) => r.tag === "VAV-1");
  const vav1Api = apiOut.rows.find((r) => r.tag === "VAV-1");
  assert.equal(vav1Cli?.status, vav1Api?.status);
});
