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
import { reconcileScheduleFamilyWithSweeps, familyNeedleFromSpecs, reconcileFamilyInChunks } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";
import { resolveTsxLoader } from "../../web/vite.corpusTakeoffApi.js";
import { reconcileSchedulePlan } from "../src/takeoff.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const D07 = resolve(CORPUS, "demos/D07-vav-plan-link-fan-refuse");
const CLI = resolve(HERE, "../scripts/production-graph-cli.mjs");
const PDF = resolve(CORPUS, "raw/bldg5406-hvac-demo-mechanical.pdf");
const SYMBOL_PLAN = resolve(HERE, "fixtures/symbol-plan.pdf");

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
    "--evaluation-fast",
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

// AS-117: past the production run's post-index limit the canvas runs the same
// family reconcile in tag chunks. Each chunk is MCP's reconcileSchedulePlan on
// the Session, so the rows must be the one call's, row for row.
test("AS-117: a family reconciled in tag chunks reads MCP's one call's rows on D07 VAV", async () => {
  const { session } = await loadFixtureSession(CORPUS, D07);
  const one = await reconcileSchedulePlan(session, { family: "VAV" });
  assert.ok(one.rows.length >= 9 && one.summary.match >= 3, "the one call sweeps every row of the family");
  const calls = [];
  const run = (o) => { calls.push(o); return reconcileSchedulePlan(session, { family: "VAV", ...o }); };
  const chunked = await reconcileFamilyInChunks(run, { chunkSize: 4 });
  assert.deepEqual(chunked.rows, one.rows);
  assert.deepEqual(chunked.summary, one.summary);
  assert.deepEqual(chunked.unscheduled_units, one.unscheduled_units);
  assert.deepEqual(calls[0], { familySweepAll: false });
  assert.ok(calls.length > 2 && calls.slice(1).every((c) => c.tags.length <= 4));
  // A chunk that fails is split; a tag that fails alone keeps its row as a
  // plan search that did not finish, and every other row is the one call's.
  const limited = (o) => ((o.tags?.length ?? 0) > 1 || o.tags?.[0] === "VAV-5"
    ? Promise.reject(new Error("post-index limit")) : run(o));
  const split = await reconcileFamilyInChunks(limited, { chunkSize: 4 });
  for (const [i, row] of split.rows.entries()) {
    if (row.tag !== "VAV-5") { assert.deepEqual(row, one.rows[i]); continue; }
    assert.equal(row.status, "AMBIGUOUS");
    assert.equal(row.plan_search_complete, false);
    assert.equal(row.installed_qty, null);
  }
  // A caller's tags and a caller's opt-out read as the one call does.
  const tags = ["VAV-1", "VAV-9"];
  assert.deepEqual((await reconcileFamilyInChunks(run, { tags, chunkSize: 1 })).rows,
    (await reconcileSchedulePlan(session, { family: "VAV", tags })).rows);
  assert.deepEqual((await reconcileFamilyInChunks(run, { familySweepAll: false })).rows,
    (await reconcileSchedulePlan(session, { family: "VAV", familySweepAll: false })).rows);
});

// AS-117: the canvas's production call for { family } left the CLI's
// --family-sweep-all off, so every row came back unswept as SCHEDULE_ONLY where
// MCP's tool sweeps every row. Unset is MCP's default; --no-family-sweep-all
// is the caller's opt-out.
test("AS-117: the production CLI sweeps every row of a family unless told not to, as MCP's tool does", async () => {
  if (!existsSync(PDF)) {
    test.skip(`PDF missing: ${PDF}`);
    return;
  }
  const { session } = await loadFixtureSession(CORPUS, D07);
  const tsx = resolveTsxLoader();
  const cli = (...extra) => {
    const run = spawnSync(process.execPath, [
      "--import", tsx, CLI, "--mode", "reconcile", "--pdf", PDF, "--family", "VAV", "--evaluation-fast", ...extra,
    ], { cwd: resolve(HERE, ".."), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    return JSON.parse(run.stdout.trim().split("\n").at(-1));
  };
  const api = await reconcileSchedulePlan(session, { family: "VAV", evaluationFast: true });
  assert.ok(api.summary.match >= 3);
  const unset = cli();
  assert.equal(unset.summary.match, api.summary.match);
  assert.deepEqual(unset.rows.map((r) => [r.tag, r.status]), api.rows.map((r) => [r.tag, r.status]));
  const optOut = cli("--no-family-sweep-all");
  const unswept = await reconcileSchedulePlan(session, { family: "VAV", evaluationFast: true, familySweepAll: false });
  assert.equal(optOut.summary.match, 0);
  assert.deepEqual(optOut.rows.map((r) => [r.tag, r.status]), unswept.rows.map((r) => [r.tag, r.status]));
});

test("WP5 production sweep bridge preserves explicit rigid-only options", async () => {
  if (!existsSync(PDF)) {
    test.skip(`PDF missing: ${PDF}`);
    return;
  }
  const { session } = await loadFixtureSession(CORPUS, D07);
  const expected = await session.sweepScheduleRow("VAV-1", {
    evaluationFast: true,
    rotations: false,
    mirror: false,
    affine: { enabled: false },
  });
  const tsx = resolveTsxLoader();
  const run = spawnSync(process.execPath, [
    "--import", tsx, CLI,
    "--mode", "sweep",
    "--pdf", PDF,
    "--tag", "VAV-1",
    "--evaluation-fast",
    "--sweep-options", JSON.stringify({ rotations: false, mirror: false, affine: { enabled: false } }),
  ], { cwd: resolve(HERE, ".."), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const bridged = JSON.parse(run.stdout.trim().split("\n").at(-1));
  assert.equal(bridged.found, expected.found);
  assert.equal(bridged.tag, expected.tag);
  assert.ok(bridged.sheets.every((sheet) => sheet.model_arbitration == null),
    "rigid-only transport must not silently run the affine competitor");
});

test("production symbol-sweep bridge uses Session's canonical bare key for page 1", async () => {
  const tsx = resolveTsxLoader();
  const run = spawnSync(process.execPath, [
    "--import", tsx, CLI,
    "--mode", "symbol_sweep",
    "--pdf", SYMBOL_PLAN,
    "--symbol-pdf-index", "0",
    "--symbol-page", "1",
    "--symbol-seed-rect", JSON.stringify([[196, 980], [272, 1028]]),
    "--symbol-scope", "sheet",
    "--symbol-options", JSON.stringify({ rotations: true, mirror: true, affine: { enabled: false } }),
  ], { cwd: resolve(HERE, ".."), encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const bridged = JSON.parse(run.stdout.trim().split("\n").at(-1));
  assert.equal(bridged.seed?.sheet, "symbol-plan.pdf");
  assert.equal(bridged.found, 5);
  assert.equal(bridged.matches.length, 5);
});
