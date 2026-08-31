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

test("SDSU EngSciences VAV reconcile: sampled plan-drawn CAV/ECAV tags MATCH (honest SO ceiling)", async () => {
  // evaluationFast: only tags drawable as text MATCH; remainder stay SCHEDULE_ONLY
  // (most CAV/ECAV marks are not plan text under fast sweep). Do not force higher.
  // ECAV floor tags (N1/N2/S*) MATCH; basement NB/SB ECAV stay SCHEDULE_ONLY.
  // Full ECAV census under evaluationFast: 16/25 MATCH · 9 SO (2026-08-31).
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const sampleMatch = [
    "CAV-N2-2", "CAV-S1-1", "CAV-S1-4", "CAV-S1-6", "CAV-S1-7", "CAV-S2-3", "CAV-S3-1", "CAV-S3-3",
    "ECAV-N1-1", "ECAV-N2-1", "ECAV-N2-2", "ECAV-S1-1", "ECAV-S2-1", "ECAV-S3-1",
  ];
  const sampleSo = ["ECAV-NB-1"]; // swept negative control — not plan text
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    tags: [...sampleMatch, ...sampleSo],
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.VAV, "scaffold still returns all VAV rows");
  const byTag = new Map(result.rows.map((r) => [r.tag.toUpperCase(), r]));
  for (const tag of sampleMatch) {
    const row = byTag.get(tag);
    assert.ok(row, `${tag} reconcile row`);
    assert.equal(row.status, "MATCH", `${tag} installed reconcile on SDSU`);
    assert.ok(row.installed_qty >= 1, `${tag} installed`);
    assert.ok(row.plan_cites?.length >= 1, `${tag} plan cite`);
  }
  for (const tag of sampleSo) {
    const row = byTag.get(tag);
    assert.ok(row, `${tag} reconcile row`);
    assert.equal(row.status, "SCHEDULE_ONLY", `${tag} honest SCHEDULE_ONLY after sweep`);
  }
  const match = result.rows.filter((r) => r.status === "MATCH");
  const so = result.rows.filter((r) => r.status === "SCHEDULE_ONLY");
  assert.equal(match.length, sampleMatch.length, "fast sweep MATCH ceiling = sampleMatch");
  assert.equal(so.length, key.categories.VAV - sampleMatch.length, "honest SCHEDULE_ONLY remainder");
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

test("Spokane VFD reconcile: all scheduled tags SCHEDULE_ONLY under evaluationFast (honest)", async () => {
  // VFDs are schedule equipment; tags are not drawn as plan text on this CUP set.
  const keyPath = resolve(CROSS, "30_WA_SpokaneTransit_CoolingTower.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VARIABLE_FREQUENCY_DRIVE");
  assert.ok(needle, "VFD family needle");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.VARIABLE_FREQUENCY_DRIVE);
  assert.ok(result.rows.every((r) => /^VFD-/i.test(r.tag)));
  assert.ok(
    result.rows.every((r) => r.status === "SCHEDULE_ONLY"),
    "Spokane VFD honest SCHEDULE_ONLY (no plan-text anchors)",
  );
});

test("Baker MS reconcile: GRD+outdoor HP MATCH; AHU/indoor HP SCHEDULE_ONLY (comma-split parity)", async () => {
  // Shared-path fix: SYMBOL "AHU-1, HP-1" must split after normalize (not before).
  const keyPath = resolve(CROSS, "18_OR_BakerMS_HVAC_Electrical_FullSet.compile.json");
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

  const hpNeedle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HEAT_PUMP");
  const hpScaffold = reconcileScheduleFamilyFromGraph(graph, hpNeedle);
  assert.equal(hpScaffold.length, key.categories.HEAT_PUMP, "HP scaffold = compile (incl. AHU-pair halves)");
  assert.deepEqual(
    hpScaffold.map((r) => r.tag).sort(),
    ["HP-1", "HP-2", "HP-3", "HP-5", "HP-6"],
  );

  const ahuNeedle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "AHU");
  const ahuScaffold = reconcileScheduleFamilyFromGraph(graph, ahuNeedle);
  assert.equal(ahuScaffold.length, key.categories.AHU);
  assert.deepEqual(ahuScaffold.map((r) => r.tag).sort(), ["AHU-1", "AHU-2", "AHU-3"]);

  const grd = await reconcileScheduleFamilyWithSweeps(session, graph, familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "GRD"), {
    evaluationFast: true,
  });
  assert.equal(grd.rows.length, key.categories.GRD);
  assert.ok(grd.rows.every((r) => r.status === "MATCH"), "Baker GRD all MATCH");

  const hp = await reconcileScheduleFamilyWithSweeps(session, graph, hpNeedle, {
    tags: ["HP-5", "HP-6", "HP-1"],
    evaluationFast: true,
  });
  const byHp = new Map(hp.rows.map((r) => [r.tag, r]));
  assert.equal(byHp.get("HP-5")?.status, "MATCH");
  assert.equal(byHp.get("HP-6")?.status, "MATCH");
  assert.equal(byHp.get("HP-1")?.status, "SCHEDULE_ONLY", "indoor HP half not plan text");

  const ahu = await reconcileScheduleFamilyWithSweeps(session, graph, ahuNeedle, {
    evaluationFast: true,
  });
  assert.ok(ahu.rows.every((r) => r.status === "SCHEDULE_ONLY"), "Baker AHU honest SCHEDULE_ONLY");
});

test("Douglas HEAT_PUMP reconcile: VRF indoor + HP-30 MATCH; HP-10 SCHEDULE_ONLY", async () => {
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "HEAT_PUMP");
  const sampleMatch = ["CC-8-1", "CC-15-2", "AH-30-8", "HP-30"];
  const sampleSo = ["HP-10"];
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    tags: [...sampleMatch, ...sampleSo],
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.HEAT_PUMP);
  const byTag = new Map(result.rows.map((r) => [r.tag, r]));
  for (const tag of sampleMatch) {
    assert.equal(byTag.get(tag)?.status, "MATCH", `${tag} MATCH`);
    assert.ok((byTag.get(tag)?.installed_qty || 0) >= 1);
  }
  assert.equal(byTag.get("HP-10")?.status, "SCHEDULE_ONLY");
});

test("Baker UNIT_HEATER reconcile: shadow extract collapse — no AMBIGUOUS EH-*", async () => {
  // Thin "DUCTLESS MULTI-SPLIT…HEAT PUMP" fragment lists EH-* beside the real
  // ELECTRIC HEATER SCHEDULE on the same sheet; value-covered shadow collapse
  // keeps the denser heater row (shared Session.sweepScheduleRow path).
  const keyPath = resolve(CROSS, "18_OR_BakerMS_HVAC_Electrical_FullSet.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "UNIT_HEATER");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.UNIT_HEATER);
  assert.ok(result.rows.every((r) => /^EH-/i.test(r.tag)));
  assert.ok(
    result.rows.every((r) => r.status !== "AMBIGUOUS"),
    "Baker EH must not stay AMBIGUOUS after same-sheet shadow collapse",
  );
  assert.ok(
    result.rows.every((r) => r.status === "SCHEDULE_ONLY" || r.status === "MATCH"),
    "Baker EH honest SCHEDULE_ONLY or MATCH",
  );
});

test("Klamath PUMP reconcile: untitled thin extract collapsed — no AMBIGUOUS", async () => {
  // Untitled 6-col pump summary beside titled HYDRONIC PUMPS (same keys/values).
  const keyPath = resolve(CROSS, "14_OR_KlamathCC_LearningCtr_Mechanical.compile.json");
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
  assert.ok(
    result.rows.every((r) => r.status !== "AMBIGUOUS"),
    "Klamath pumps must not stay AMBIGUOUS after shadow collapse",
  );
  assert.ok(
    result.rows.every((r) => r.status === "SCHEDULE_ONLY" || r.status === "MATCH"),
  );
});
