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

test("Orange County bulk VAV reconcile scaffold matches compile (DESIGNATION column)", async () => {
  const keyPath = resolve(CROSS, "21_VA_OrangeCounty_PublicSafetyBldg.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const graph = await graphForPdf(pdf, key.set_id);
  const compiled = compileCorpusTakeoff(null, graph, "hvac_equipment");
  assert.equal(compiled.categories?.VAV?.count ?? 0, key.categories.VAV);

  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV"),
  );
  assert.equal(rows.length, key.categories.VAV, "reconcile scaffold row count = compile VAV");
  assert.ok(rows.every((r) => r.scheduled_qty >= 1));
  assert.ok(rows.every((r) => r.status === "SCHEDULE_ONLY"), "no sweep → schedule-only");
  assert.ok(rows.some((r) => /^VAV-1-01$/i.test(r.tag)), "DESIGNATION-keyed VAV tag");
});

test("Orange County bulk VAV reconcile: all 32 scheduled tags MATCH (WP1 cross-set)", async () => {
  const keyPath = resolve(CROSS, "21_VA_OrangeCounty_PublicSafetyBldg.compile.json");
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
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.VAV, "reconcile rows = compile VAV count");
  const match = result.rows.filter((r) => r.status === "MATCH");
  assert.equal(match.length, key.categories.VAV, "every Orange County VAV is plan-drawn MATCH");
  for (const row of match) {
    assert.ok(row.installed_qty >= 1, `${row.tag} installed qty`);
    assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
  }
  // Digit+letter suffix unit also MATCH (VAV-1-21A / VAV-1-21B).
  assert.ok(match.some((r) => /^VAV-1-21A$/i.test(r.tag)));
  assert.ok(match.some((r) => /^VAV-1-21B$/i.test(r.tag)));
});

test("Orange County booster pump BP-1 reconcile MATCH", async () => {
  const keyPath = resolve(CROSS, "21_VA_OrangeCounty_PublicSafetyBldg.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "PUMP");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.PUMP);
  assert.ok(result.rows.every((r) => r.status === "MATCH"));
  assert.ok(result.rows.some((r) => /^BP-1$/i.test(r.tag)));
});

test("Hawthorn bulk AHU+CU reconcile: all scheduled tags MATCH (WP1 cross-set)", async () => {
  const keyPath = resolve(CROSS, "10_MO_Hawthorn_PsychHospital_HVAC.compile.json");
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

  for (const family of ["AHU", "CONDENSING_UNIT"]) {
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
    assert.ok(needle, `${family} needle`);
    const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
      evaluationFast: true,
    });
    const expect = key.categories[family];
    assert.equal(result.rows.length, expect, `${family} reconcile rows = compile`);
    assert.ok(result.rows.every((r) => r.status === "MATCH"), `${family} all MATCH`);
    for (const row of result.rows) {
      assert.ok(row.installed_qty >= 1, `${row.tag} installed`);
      assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
    }
  }
});

test("Jeff City CST bulk VAV+FCU reconcile: all scheduled tags MATCH (WP1 cross-set)", async () => {
  const keyPath = resolve(CROSS, "06_MO_NatlGuard_JeffCity_CST_Addition.compile.json");
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
  for (const family of ["VAV", "FCU"]) {
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
    assert.ok(needle, `${family} needle`);
    const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
      evaluationFast: true,
    });
    const expect = key.categories[family];
    assert.equal(result.rows.length, expect, `${family} reconcile rows = compile`);
    assert.ok(result.rows.every((r) => r.status === "MATCH"), `${family} all MATCH`);
    for (const row of result.rows) {
      assert.ok(row.installed_qty >= 1, `${row.tag} installed`);
      assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
    }
  }
});

test("SDSU EngSciences AHU reconcile: all scheduled tags MATCH (dup-table collapse)", async () => {
  const keyPath = resolve(CROSS, "11_CA_SDSU_EngSciences_Complex_100SD.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "AHU");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.AHU);
  assert.ok(result.rows.every((r) => r.status === "MATCH"), "SDSU AHU all MATCH after schedule-stem collapse");
  for (const row of result.rows) {
    assert.ok(row.installed_qty >= 1, `${row.tag} installed`);
    assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
  }
});

test("Douglas County DOAS reconcile: misc-schedule DOAS-30 MATCH", async () => {
  const keyPath = resolve(CROSS, "25_WA_DouglasCounty_Courthouse_HVAC_DDC.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "DOAS");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.DOAS);
  assert.ok(result.rows.every((r) => r.status === "MATCH"));
  assert.ok(result.rows.some((r) => /^DOAS-30$/i.test(r.tag)));
});

test("St Louis bulk VAV reconcile: all 12 ATU tags MATCH (WP1 cross-set)", async () => {
  const keyPath = resolve(CROSS, "05_MO_VA_StLouis_AHU_VAV_Replacement.compile.json");
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
  assert.ok(needle, "VAV needle");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.VAV, "reconcile rows = compile VAV");
  assert.equal(
    result.rows.filter((r) => r.status === "MATCH").length,
    key.categories.VAV,
    "every St Louis ATU is plan-drawn MATCH",
  );
  for (const row of result.rows) {
    assert.ok(/^ATU-/i.test(row.tag), `${row.tag} is ATU mark`);
    assert.ok(row.installed_qty >= 1, `${row.tag} installed qty`);
    assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
  }
});

test("Valdosta + St Louis GRD reconcile scaffold matches compile (reference-kind parity)", async () => {
  for (const file of [
    "22_GA_Valdosta_FireStation8_100CD.compile.json",
    "05_MO_VA_StLouis_AHU_VAV_Replacement.compile.json",
  ]) {
    const keyPath = resolve(CROSS, file);
    assert.ok(existsSync(keyPath));
    const key = JSON.parse(readFileSync(keyPath, "utf8"));
    const pdf = resolve(CORPUS, key.source_file);
    if (!existsSync(pdf)) {
      test.skip(`PDF missing: ${key.source_file}`);
      return;
    }
    const graph = await graphForPdf(pdf, key.set_id);
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "GRD");
    const rows = reconcileScheduleFamilyFromGraph(graph, needle);
    assert.equal(rows.length, key.categories.GRD, `${key.set_id} GRD scaffold = compile`);
  }
});

test("Hurlburt bulk AHU+FAN reconcile: all scheduled tags MATCH (WP1 cross-set)", async () => {
  const keyPath = resolve(CROSS, "03_FL_HurlburtField_ChildDevCenter.compile.json");
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
  for (const family of ["AHU", "FAN"]) {
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
    const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
      evaluationFast: true,
    });
    assert.equal(result.rows.length, key.categories[family], `${family} rows = compile`);
    assert.ok(result.rows.every((r) => r.status === "MATCH"), `${family} all MATCH`);
    for (const row of result.rows) {
      assert.ok(row.installed_qty >= 1, `${row.tag} installed`);
      assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
    }
  }
});

test("blank-title FAN tables join reconcile scaffold via keyRe (Macon Bibb shape)", async () => {
  const keyPath = resolve(CROSS, "23_GA_MaconBibb_RecreationCenter.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const graph = await graphForPdf(pdf, key.set_id);
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN");
  const rows = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.equal(rows.length, key.categories.FAN, "blank-title EF rows reach reconcile");
  assert.ok(rows.every((r) => /^EF-/i.test(r.tag)));
  assert.ok(rows.every((r) => r.status === "SCHEDULE_ONLY"));
});
