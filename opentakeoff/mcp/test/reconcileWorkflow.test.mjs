/**
 * WP4 reconcile fixture — schedule scaffold on keyed cross-set compile sets.
 * Full installed sweep is exercised via reconcileSchedulePlan in MCP tools;
 * here we prove schedule-side rows match compile counts without per-set hardcodes.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedSheetGraph } from "../scripts/sheetGraphCache.mjs";
import { Session } from "../src/session.ts";
import { reconcileSchedulePlan } from "../src/takeoff.ts";
import {
  reconcileScheduleFamilyFromGraph,
  reconcileScheduleFamilyWithSweeps,
  familyNeedleFromSpecs,
  summarizeReconcile,
} from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");
const D07 = resolve(CORPUS, "demos/D07-vav-plan-link-fan-refuse");
const D08 = resolve(CORPUS, "demos/D08-fcu-cross-building");

async function graphForPdf(pdfPath, setId) {
  return cachedSheetGraph(pdfPath, {
    identity: [setId, "reconcile-fixture"],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(pdfPath);
      return session.graphForPipeline();
    },
  });
}

test("federal-mech VAV reconcile scaffold matches compile count (schedule side)", async () => {
  const keyPath = resolve(CROSS, "federal-mech.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const graph = await graphForPdf(pdf, key.set_id);
  const compiled = compileCorpusTakeoff(null, graph, "hvac_equipment");
  const vavCompile = compiled.categories?.VAV?.count ?? 0;
  assert.equal(vavCompile, key.categories.VAV, "compile VAV matches key");

  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "VAV", ...HVAC_FAMILY_SPECS.VAV },
  );
  assert.equal(rows.length, vavCompile, "reconcile scaffold row count = compile VAV");
  assert.ok(rows.every((r) => r.scheduled_qty >= 1), "each row has scheduled qty");
  assert.ok(rows.every((r) => r.status === "SCHEDULE_ONLY"), "no sweep → schedule-only");
  const summary = summarizeReconcile(rows);
  assert.equal(summary.schedule_only, rows.length);
});

test("itd-d1-lab reconcile scaffold covers HHW valve schedule rows", async () => {
  const keyPath = resolve(CROSS, "itd-d1-lab.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const graph = await graphForPdf(pdf, key.set_id);
  const valve = compileCorpusTakeoff(null, graph, "control_valves");
  assert.equal(valve.totals.items, key.control_valves.items);

  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "HHW valve", ...HVAC_FAMILY_SPECS.HHW_CONTROL_VALVE },
  );
  assert.ok(rows.length >= 1, "HHW valve rows extracted for reconcile");
  assert.equal(
    rows.filter((r) => r.status === "SCHEDULE_ONLY").length,
    rows.length,
  );
});

test("federal-mech VAV reconcile: sampled plan-drawn tags MATCH (WP1 cross-set)", async () => {
  const keyPath = resolve(CROSS, "federal-mech.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const session = new Session();
  await session.loadPlan(pdf);
  const graph = await session.graphForPipeline();
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const sample = ["VAV-1", "VAV-12", "VAV-30", "VAV-58"];
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    tags: sample,
    evaluationFast: true,
  });
  const byTag = new Map(result.rows.map((r) => [r.tag.toUpperCase(), r]));
  for (const tag of sample) {
    const row = byTag.get(tag);
    assert.ok(row, `${tag} reconcile row`);
    assert.equal(row.status, "MATCH", `${tag} installed reconcile on federal-mech`);
    assert.equal(row.installed_qty, 1);
    assert.ok(row.plan_cites?.length >= 1, `${tag} plan cite`);
  }
  assert.ok(result.summary.match >= sample.length);
});

test("D08 NAVFAC FCU reconcile: swept tags are MATCH (installed reconcile)", async () => {
  const { graph, session } = await loadFixtureSession(CORPUS, D08);
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FCU");
  assert.ok(needle);
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    tags: ["FCU-A1", "FCU-M1A", "FCU-T1"],
    evaluationFast: true,
  });
  const byTag = new Map(result.rows.map((r) => [r.tag.toUpperCase(), r]));
  for (const tag of ["FCU-A1", "FCU-M1A", "FCU-T1"]) {
    const row = byTag.get(tag);
    assert.ok(row, `${tag} reconcile row`);
    assert.equal(row.status, "MATCH", `${tag} installed reconcile`);
    assert.equal(row.installed_qty, 1);
    assert.ok(row.plan_cites?.length >= 1, `${tag} plan cite`);
  }
  assert.ok(result.summary.match >= 3);
});

test("D07 bldg5406 VAV reconcile: plan-drawn tags MATCH, EF-2 SCHEDULE_ONLY", async () => {
  const { graph, session } = await loadFixtureSession(CORPUS, D07);
  const vavNeedle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const vav = await reconcileScheduleFamilyWithSweeps(session, graph, vavNeedle, {
    tags: ["VAV-1", "VAV-5", "VAV-9"],
    evaluationFast: true,
  });
  for (const tag of ["VAV-1", "VAV-5", "VAV-9"]) {
    const row = vav.rows.find((r) => r.tag.toUpperCase() === tag);
    assert.equal(row?.status, "MATCH", tag);
  }

  const fanNeedle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN");
  const fans = await reconcileScheduleFamilyWithSweeps(session, graph, fanNeedle, {
    tags: ["EF-1", "EF-2", "EF-5"],
    evaluationFast: true,
  });
  const ef1 = fans.rows.find((r) => r.tag === "EF-1");
  const ef2 = fans.rows.find((r) => r.tag === "EF-2");
  const ef5 = fans.rows.find((r) => r.tag === "EF-5");
  assert.equal(ef1?.status, "MATCH");
  assert.equal(ef5?.status, "MATCH");
  assert.equal(ef2?.status, "SCHEDULE_ONLY");
});

test("reconcileSchedulePlan scoped API matches reconcileScheduleFamilyWithSweeps", async () => {
  const { session } = await loadFixtureSession(CORPUS, D08);
  const api = await reconcileSchedulePlan(session, {
    family: "FCU",
    tags: ["FCU-A1"],
    evaluationFast: true,
  });
  assert.equal(api.rows.length, 42, "full FCU schedule rows returned");
  const hit = api.rows.find((r) => r.tag === "FCU-A1");
  assert.equal(hit?.status, "MATCH");
  assert.equal(hit?.installed_qty, 1);
});
