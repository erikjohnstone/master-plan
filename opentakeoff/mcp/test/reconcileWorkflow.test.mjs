/**
 * WP4 reconcile fixture — schedule scaffold on keyed cross-set compile sets.
 * Full installed sweep is exercised via reconcileSchedulePlan in MCP tools;
 * here we prove schedule-side rows match compile counts without per-set hardcodes.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

/** Prefer rejoined PDF; else merge Vol2 multipart parts (same as crossCorpusWorkflow). */
async function loadKeySession(key) {
  const primary = resolve(CORPUS, key.source_file);
  if (existsSync(primary)) {
    const session = new Session();
    await session.loadPlan(primary);
    return session;
  }
  const partsDir = key.source_parts_dir
    ? resolve(CORPUS, key.source_parts_dir)
    : null;
  if (!partsDir || !existsSync(partsDir)) return null;
  const parts = readdirSync(partsDir)
    .filter((f) => f.endsWith(".pdf"))
    .sort();
  if (!parts.length) return null;
  const session = new Session();
  await session.loadPlan(resolve(partsDir, parts[0]));
  for (let i = 1; i < parts.length; i++) {
    await session.loadPlan(resolve(partsDir, parts[i]), { merge: true });
  }
  return session;
}

async function assertFamilyAllMatch(session, graph, key, family) {
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
  assert.ok(needle, `${family} needle`);
  const expect = key.categories[family];
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, expect, `${key.set_id} ${family} reconcile rows`);
  const match = result.rows.filter((r) => r.status === "MATCH");
  assert.equal(match.length, expect, `${key.set_id} ${family} all MATCH`);
  for (const row of match) {
    assert.ok(row.installed_qty >= 1, `${row.tag} installed qty`);
    assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
  }
}

async function assertFamilyStatusCounts(session, graph, key, family, counts, { rows: rowExpect } = {}) {
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
  assert.ok(needle, `${family} needle`);
  const expect = rowExpect ?? key.categories[family];
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, expect, `${key.set_id} ${family} reconcile rows`);
  const sum = summarizeReconcile(result.rows);
  for (const [status, n] of Object.entries(counts)) {
    assert.equal(sum[status] ?? 0, n, `${key.set_id} ${family} ${status}`);
  }
}

async function loadKeySessionOrSkip(t, keyPath) {
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const session = await loadKeySession(key);
  if (!session) {
    t.skip(`PDF/parts missing for ${key.set_id}`);
    return null;
  }
  const graph = await session.graphForPipeline();
  return { key, session, graph };
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

test("Vermillion County Jail bulk VAV reconcile scaffold matches compile", async () => {
  const keyPath = resolve(CROSS, "096_IN_Vermillion_County_Jail_Mechanical_Bid_Set.compile.json");
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
  assert.ok(rows.some((r) => /^VAV-1-1$/i.test(r.tag)), "VAV-1-* schedule tags");
});

test("Vermillion County Jail bulk VAV reconcile: all 58 scheduled tags MATCH (Vol2 WP1)", async () => {
  const keyPath = resolve(CROSS, "096_IN_Vermillion_County_Jail_Mechanical_Bid_Set.compile.json");
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
  assert.equal(match.length, key.categories.VAV, "every Vermillion VAV is plan-drawn MATCH");
  for (const row of match) {
    assert.ok(row.installed_qty >= 1, `${row.tag} installed qty`);
    assert.ok(row.plan_cites?.length >= 1, `${row.tag} plan cite`);
  }
});

test("Vol2 chiller upgrade 012: ACC + PUMP + VFD all MATCH (multipart rejoin)", async () => {
  const keyPath = resolve(CROSS, "012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const session = await loadKeySession(key);
  if (!session) {
    test.skip(`PDF/parts missing for ${key.set_id}`);
    return;
  }
  const graph = await session.graphForPipeline();
  for (const family of ["AIR_COOLED_CHILLER", "PUMP", "VARIABLE_FREQUENCY_DRIVE"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 FL airport 089: DOAS + FCU families with plan-drawn MATCH (multipart rejoin)", async () => {
  const keyPath = resolve(CROSS, "089_FL_Airport_Terminal_and_Hangar_Development.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const session = await loadKeySession(key);
  if (!session) {
    test.skip(`PDF/parts missing for ${key.set_id}`);
    return;
  }
  const graph = await session.graphForPipeline();
  for (const family of ["DOAS", "HEAT_PUMP", "PUMP", "WATER_HEATER", "FAN"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Phoenix Sky Harbor 088: plan-drawn plant + terminal families MATCH", async () => {
  const keyPath = resolve(CROSS, "088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const session = await loadKeySession(key);
  if (!session) {
    test.skip(`PDF/parts missing for ${key.set_id}`);
    return;
  }
  const graph = await session.graphForPipeline();
  for (const family of [
    "AHU", "FCU", "CONDENSING_UNIT", "PUMP", "FAN", "CEILING_FAN", "UNIT_HEATER",
  ]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Eglin AFB 019: dense VAV set — all scheduled families MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of Object.keys(key.categories)) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Jonesboro 093: VRF indoor/outdoor + WH all MATCH (multipart rejoin)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["VRF_INDOOR", "VRF_OUTDOOR", "WATER_HEATER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Health Science 071: VAV + FAN all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "071_ME_BGS_Project_3809_Health_Science_Center.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["VAV", "FAN"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Miller dining 077: WSHP + GRD all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "077_MT_Miller_Dining_Auxiliaries_Offices_HVAC.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["HEAT_PUMP", "GRD"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 ITD D1 lab 062: plan-drawn HVAC families MATCH (Vol2 bulk)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "062_ID_ITD_District_1_Laboratory_Building_Mechanical.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  const allMatchFamilies = Object.keys(key.categories).filter((f) => f !== "FAN");
  for (const family of allMatchFamilies) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 ITD D1 lab 062: one FAN tag honest SCHEDULE_ONLY under evaluationFast", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "062_ID_ITD_District_1_Laboratory_Building_Mechanical.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "FAN", {
    match: 6,
    schedule_only: 1,
  });
});

test("Vol2 pier utility 015: plan-drawn FCU/pump/fan plant MATCH (louver/grd SO)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "015_VA_P_095_Replace_Submarine_Pier_3_Utility.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of [
    "FCU", "CONDENSING_UNIT", "HEAT_PUMP", "PUMP", "FAN", "AIR_SEPARATOR", "EXPANSION_TANK",
  ]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 chiller 012: cooling towers honest SCHEDULE_ONLY (plant not plan-drawn)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "COOLING_TOWER", {
    schedule_only: key.categories.COOLING_TOWER,
  });
});

test("Vol2 FL airport 089: FCU honest SCHEDULE_ONLY (tags not plan text)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "089_FL_Airport_Terminal_and_Hangar_Development.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "FCU", {
    schedule_only: key.categories.FCU,
  });
});

test("Vol2 PHX 088: VFD honest partial — 2 MATCH · 9 SCHEDULE_ONLY", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "VARIABLE_FREQUENCY_DRIVE", {
    match: 2,
    schedule_only: 9,
  });
  assert.equal(key.categories.VARIABLE_FREQUENCY_DRIVE, 11);
});

test("Vol2 MO renovation 004: RTU + DOAS + plant aux all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "004_MO_T2504_03_Interior_and_Exterior_Renovation.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["RTU", "DOAS", "PUMP", "WATER_SOFTENER", "UNIT_HEATER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 NC VRF chiller 047: plant + VRF families all MATCH (GRD SO)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of [
    "VRF_INDOOR", "VRF_OUTDOOR", "AIR_COOLED_CHILLER", "HEAT_RECOVERY_CHILLER",
    "PUMP", "EXPANSION_TANK", "BUFFER_TANK", "GLYCOL_MAKEUP",
  ]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Ames Harley Wilhelm 061: AHU/FCU/fan/HX MATCH; pump 6/7", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["FAN", "AHU", "FCU", "HEAT_EXCHANGER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
  await assertFamilyStatusCounts(session, graph, key, "PUMP", {
    match: 6,
    schedule_only: 1,
  });
});

test("Vol2 Orange County History 094: AHU + chiller plant all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "094_FL_Orange_County_Regional_History_Center_HVAC.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["AHU", "AIR_COOLED_CHILLER", "COOLING_TOWER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 IL sterile expand 040: GRD + fan + louver MATCH (UH/pump SO)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["GRD", "FAN", "LOUVER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Missoula Fire Sciences 014: UH/fan/AHU/boiler/ET all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "014_MT_USDA_Forest_Service_Missoula_Fire_Sciences.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["UNIT_HEATER", "FAN", "AHU", "BOILER", "EXPANSION_TANK"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 ATC tower 001: VAV + FCU + GRD all MATCH (federal MEAT)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "001_NC_FY20_P_228_ATC_Tower_and_Air_Operations.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["VAV", "FCU", "GRD"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Klamath Vol1 FCU/DOAS/HP: honest SCHEDULE_ONLY (tags not plan text)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "14_OR_KlamathCC_LearningCtr_Mechanical.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["FCU", "DOAS", "HEAT_PUMP"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
});

test("Vol2 poultry research 018: all scheduled families MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "018_GA_USDA_ARS_U_S_National_Poultry_Research_Center.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of Object.keys(key.categories)) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Town Offices 083: FCU + HP MATCH; ERV partial; GRD honest SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "083_MA_Town_Offices_Facilities_HVAC_System_Upgrades.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["FCU", "HEAT_PUMP"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
  await assertFamilyStatusCounts(session, graph, key, "ERV", {
    match: 1,
    schedule_only: 1,
  });
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    schedule_only: key.categories.GRD,
  });
});

test("Vol2 warehouse 031: GRD partial 12 MATCH · 47 SCHEDULE_ONLY", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    match: 12,
    schedule_only: 47,
  });
  assert.equal(key.categories.GRD, 59);
});

test("Vol2 VA ER 053: HHW valves honest SCHEDULE_ONLY; GRD 2/5 MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "053_VA_Renovate_Expand_Emergency_Room_System_VA.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "HHW_CONTROL_VALVE", {
    schedule_only: key.categories.HHW_CONTROL_VALVE,
  });
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    match: 2,
    schedule_only: 4,
  }, { rows: 6 });
});

test("Vol2 Salinity Lab 023: chiller plant honest SCHEDULE_ONLY", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["AIR_COOLED_CHILLER", "PUMP", "BUFFER_TANK"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
});

test("Vol2 main boilers 044: plant schedules honest SCHEDULE_ONLY", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["BOILER", "FAN", "HEAT_EXCHANGER", "UNIT_HEATER", "LOUVER", "CONDENSING_UNIT"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
  // Reconcile scaffold omits one pump row vs compile (8/9) — honest SO on rows found.
  await assertFamilyStatusCounts(session, graph, key, "PUMP", {
    schedule_only: 8,
  }, { rows: 8 });
});

test("Vol2 APHIS plant 009: AHU/ACC/pump/fan MATCH; UH 4/5", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "009_FL_USDA_APHIS_Plant_Inspection_Station_Building.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["AHU", "AIR_COOLED_CHILLER", "PUMP", "FAN"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
  await assertFamilyStatusCounts(session, graph, key, "UNIT_HEATER", {
    match: 4,
    schedule_only: 1,
  });
});

test("Vol2 NIST 017: fan + humidifier MATCH; duct coils honest SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["FAN", "HUMIDIFIER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
  await assertFamilyStatusCounts(session, graph, key, "DUCT_MOUNTED_COIL", {
    schedule_only: key.categories.DUCT_MOUNTED_COIL,
  });
});

test("Vol2 MO steam units 024: all RTU MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "RTU");
});

test("Vol2 Patriot Cafe 042: GRD all MATCH; FAN honest SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "042_VA_Renovate_VCS_Patriot_Cafe_VA_project_546_17.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "GRD");
  await assertFamilyStatusCounts(session, graph, key, "FAN", {
    schedule_only: key.categories.FAN,
  });
});

test("Vol2 LAMBDA 060: duct coils MATCH; GRD 6/10", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "060_XX_ASC_Open_Mechanical_Competition_LAMBDA_Project.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "DUCT_MOUNTED_COIL");
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    match: 6,
    schedule_only: 4,
  });
});

test("Vol2 West Valley Science 072: FAN 10/11 + ERV MATCH; GRD SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "072_CA_CA07_2627_West_Valley_College_Science_Math.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "ERV");
  await assertFamilyStatusCounts(session, graph, key, "FAN", {
    match: 10,
    schedule_only: 1,
  });
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    schedule_only: key.categories.GRD,
  });
});

test("Vol2 West Valley STEM 074: FAN 10/11 + ERV MATCH; GRD SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "074_CA_West_Valley_College_STEM_Classroom_HVAC.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "ERV");
  await assertFamilyStatusCounts(session, graph, key, "FAN", {
    match: 10,
    schedule_only: 1,
  });
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    schedule_only: key.categories.GRD,
  });
});

test("Vol2 lab mech 021: HVAC families honest SCHEDULE_ONLY (BAS-keyed set)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "021_XX_Laboratory_building_mechanical_drawings_lab.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["AHU", "FCU", "PUMP", "FAN", "BOILER", "GRD"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
});

test("Vol2 Bldg 615 reno 028: plant families honest SCHEDULE_ONLY", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "028_TX_Renovation_of_Building_615_Final_Design_Plans.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["DOAS", "AIR_COOLED_CHILLER", "BOILER", "FAN", "UNIT_HEATER"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
});

test("Vol2 Renne Library 075: AHU/HP/ERV/coil MATCH; GRD honest SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "075_MT_Renne_Library_Innovation_Learning_Studio.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["AHU", "HEAT_PUMP", "ERV", "DUCT_MOUNTED_COIL"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    schedule_only: key.categories.GRD,
  });
});

test("Vol2 JVWTP chemical 097: OAU + UH + GRD all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "097_UT_JVWTP_Chemical_Buildings_HVAC_Upgrades_Project.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of Object.keys(key.categories)) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Bruneau shed 098: FCU + fan + UH all MATCH (rejoin)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["FCU", "FAN", "UNIT_HEATER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 Harrison extruder 063: GRD MATCH; VAV honest SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "GRD");
  await assertFamilyStatusCounts(session, graph, key, "VAV", {
    schedule_only: key.categories.VAV,
  });
});

test("Vol2 Antelope Valley 068: boiler MATCH; pumps/AS/ET partial-or-SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "068_US_Antelope_Valley_College_Applied_Arts_Math.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "BOILER");
  await assertFamilyStatusCounts(session, graph, key, "PUMP", {
    schedule_only: key.categories.PUMP,
  });
  await assertFamilyStatusCounts(session, graph, key, "AIR_SEPARATOR", {
    match: 1,
    schedule_only: 2,
  });
  await assertFamilyStatusCounts(session, graph, key, "EXPANSION_TANK", {
    schedule_only: key.categories.EXPANSION_TANK,
  });
});

test("Vol2 NY EHRM 030: pumps 14 MATCH · 1 SO (scaffold 15 rows)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyStatusCounts(session, graph, key, "PUMP", {
    match: 14,
    schedule_only: 1,
  }, { rows: 15 });
  await assertFamilyStatusCounts(session, graph, key, "GRD", {
    schedule_only: key.categories.GRD,
  });
});

test("Vol2 Irish Hill 016: single AHU MATCH (honest WEAK)", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "016_NY_Alter_Repair_Building_1624_Irish_Hill_Test.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "AHU");
});

test("Vol1 Las Vegas CUP 04: cooling towers MATCH; pumps 11/12", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "04_NV_VA_LasVegas_CentralUtilityPlant.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "COOLING_TOWER");
  await assertFamilyStatusCounts(session, graph, key, "PUMP", {
    match: 11,
    schedule_only: 1,
  });
});

test("Vol2 unheated repair 008: UH + louver all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["UNIT_HEATER", "LOUVER"]) {
    await assertFamilyAllMatch(session, graph, key, family);
  }
});

test("Vol2 NC EHRM 034: pumps all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "034_NC_VA_Project_637_22_700_EHRM_Infrastructure.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "PUMP");
});

test("Vol2 sterile expand 049: air compressors all MATCH", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "049_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "AIR_COMPRESSOR");
});

test("Vol2 sterile 041: GRD MATCH; FCU/pump honest SO", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "041_IL_VA_Project_537_17_115_Sterile_Processing.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "GRD");
  for (const family of ["FCU", "PUMP"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
});

test("Vol2 ITD D2 lab 069: plant families honest SCHEDULE_ONLY", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "069_ID_ITD_District_2_Laboratory_Heating_Upgrades.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  for (const family of ["AHU", "BOILER", "PUMP", "VARIABLE_FREQUENCY_DRIVE"]) {
    await assertFamilyStatusCounts(session, graph, key, family, {
      schedule_only: key.categories[family],
    });
  }
});

test("Vol1 Colville hatchery 27: fans MATCH; pumps 13/14", async (t) => {
  const ctx = await loadKeySessionOrSkip(
    t,
    resolve(CROSS, "27_WA_ColvilleTribes_Hatchery_Lab.compile.json"),
  );
  if (!ctx) return;
  const { key, session, graph } = ctx;
  await assertFamilyAllMatch(session, graph, key, "FAN");
  await assertFamilyStatusCounts(session, graph, key, "PUMP", {
    match: 13,
    schedule_only: 1,
  });
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

test("Baker MS reconcile: GRD+AHU+HP MATCH (glued row.key + comma-split parity)", async () => {
  // SYMBOL "AHU-1, HP-1" → compile halves; row.key may be glued "AHU-1HP-1".
  // rowKeyAnswersFor must answer for each half so sweep/reconcile can MATCH.
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
    ["HP-1", "HP-2", "HP-3", "HP-4", "HP-5", "HP-6"],
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
    evaluationFast: true,
  });
  assert.equal(hp.rows.length, key.categories.HEAT_PUMP);
  assert.ok(
    hp.rows.every((r) => r.status === "MATCH"),
    "Baker outdoor + indoor HP halves + ERV-paired HP-4 MATCH",
  );

  const erv = await reconcileScheduleFamilyWithSweeps(
    session,
    graph,
    familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "ERV"),
    { evaluationFast: true },
  );
  assert.equal(erv.rows.length, key.categories.ERV);
  assert.deepEqual(erv.rows.map((r) => r.tag), ["ERU-1"]);
  assert.equal(erv.rows[0].status, "MATCH");

  const ahu = await reconcileScheduleFamilyWithSweeps(session, graph, ahuNeedle, {
    evaluationFast: true,
  });
  assert.ok(ahu.rows.every((r) => r.status === "MATCH"), "Baker AHU MATCH after glued rowKeyAnswersFor");
  assert.ok(ahu.rows.every((r) => (r.installed_qty || 0) >= 1));
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

test("Baker UNIT_HEATER reconcile: shadow extract collapse — EH-* MATCH", async () => {
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
    result.rows.every((r) => r.status === "MATCH"),
    "Baker EH all MATCH after same-sheet shadow collapse",
  );
  assert.ok(result.rows.every((r) => (r.installed_qty || 0) >= 1));
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

test("Klamath FAN reconcile: blank-title KEF-1 SCHEDULE_ONLY under evaluationFast", async () => {
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.FAN);
  assert.deepEqual(result.rows.map((r) => r.tag), ["KEF-1"]);
  assert.equal(result.rows[0].status, "SCHEDULE_ONLY");
});

test("SDSU VACUUM_PUMP + WATER_SOFTENER MATCH; BRINE/FLASH SCHEDULE_ONLY", async () => {
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

  const vacuum = await reconcileScheduleFamilyWithSweeps(
    session,
    graph,
    familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VACUUM_PUMP"),
    { evaluationFast: true },
  );
  assert.equal(vacuum.rows.length, key.categories.VACUUM_PUMP);
  assert.deepEqual(vacuum.rows.map((r) => r.tag), ["V-1"]);
  assert.equal(vacuum.rows[0].status, "MATCH");
  assert.ok((vacuum.rows[0].installed_qty || 0) >= 1);

  const soft = await reconcileScheduleFamilyWithSweeps(
    session,
    graph,
    familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "WATER_SOFTENER"),
    { evaluationFast: true },
  );
  assert.equal(soft.rows.length, key.categories.WATER_SOFTENER);
  assert.equal(soft.rows[0].status, "MATCH");

  const brine = await reconcileScheduleFamilyWithSweeps(
    session,
    graph,
    familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "BRINE_TANK"),
    { evaluationFast: true },
  );
  assert.equal(brine.rows.length, key.categories.BRINE_TANK);
  assert.deepEqual(brine.rows.map((r) => r.tag), ["BT-1"]);
  assert.equal(brine.rows[0].status, "SCHEDULE_ONLY");

  const flash = await reconcileScheduleFamilyWithSweeps(
    session,
    graph,
    familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FLASH_TANK"),
    { evaluationFast: true },
  );
  assert.equal(flash.rows.length, key.categories.FLASH_TANK);
  assert.equal(flash.rows[0].status, "SCHEDULE_ONLY");
});

test("Carson prefer-schedule: shared B*/C* marks MATCH (unscoped stays AMBIGUOUS)", async () => {
  const keyPath = resolve(CROSS, "16_NV_CarsonValleyMS_HVAC_Replacement.compile.json");
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

  // Negative: bare sweep without a preferred schedule must still refuse
  // cross-family building-letter collisions.
  await assert.rejects(
    () => session.sweepScheduleRow("B1", { evaluationFast: true }),
    /ambiguous:.*schedule rows carry the key/i,
  );

  for (const fam of [
    "CONTROL_DAMPER",
    "OUTDOOR_AIR_UNIT",
    "RTU",
    "ERV",
    "FURNACE",
    "CONDENSING_UNIT",
    "RANGE_HOOD",
  ]) {
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, fam);
    assert.ok(needle, `${fam} needle`);
    const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
      evaluationFast: true,
    });
    assert.equal(result.rows.length, key.categories[fam], `${fam} scaffold = compile`);
    assert.ok(
      result.rows.every((r) => r.status === "MATCH"),
      `${fam} all MATCH after prefer-schedule (got ${[...new Set(result.rows.map((r) => r.status))].join(",")})`,
    );
    assert.ok(
      result.rows.every((r) => (r.installed_qty || 0) >= 1),
      `${fam} installed ≥ 1`,
    );
  }
});

test("Colville ERV: titled-first cite → ERV-1 MATCH (not blank seismic AMBIGUOUS)", async () => {
  const keyPath = resolve(CROSS, "27_WA_ColvilleTribes_Hatchery_Lab.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "ERV");
  const scaffold = reconcileScheduleFamilyFromGraph(graph, needle);
  assert.equal(scaffold.length, key.categories.ERV);
  assert.equal(scaffold[0].tag, "ERV-1");
  assert.match(
    String(scaffold[0].schedule_cite?.title || ""),
    /ENERGY\s+RECOVERY\s+VENTILATOR/i,
    "scaffold must cite titled ERV schedule, not blank seismic summary",
  );
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows[0].status, "MATCH");
  assert.ok((result.rows[0].installed_qty || 0) >= 1);
});

test("Hurlburt VAV: NATUK1 schedule ↔ plan ATU K1/K2 MATCH", async () => {
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.VAV);
  assert.deepEqual(result.rows.map((r) => r.tag).sort(), ["ATU K1", "ATU K2"]);
  assert.ok(
    result.rows.every((r) => r.status === "MATCH"),
    `Hurlburt ATU all MATCH (got ${result.rows.map((r) => r.tag + ":" + r.status).join(",")})`,
  );
  assert.ok(result.rows.every((r) => (r.installed_qty || 0) >= 1));
});

test("SDSU EngSciences FAN reconcile: all scheduled tags MATCH (lab EF + TEF/GX)", async () => {
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.FAN);
  assert.ok(
    result.rows.every((r) => r.status === "MATCH"),
    `SDSU FAN all MATCH (got ${result.rows.map((r) => r.tag + ":" + r.status).join(",")})`,
  );
  assert.ok(result.rows.every((r) => (r.installed_qty || 0) >= 1));
  assert.ok(result.rows.every((r) => (r.plan_cites?.length || 0) >= 1));
});

test("Northport FAN reconcile: RF-1/RF-2 honest SCHEDULE_ONLY (no plan text)", async () => {
  const keyPath = resolve(CROSS, "01_NY_VA_Northport_Dialysis_100CD.compile.json");
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
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  assert.equal(result.rows.length, key.categories.FAN);
  assert.deepEqual(result.rows.map((r) => r.tag).sort(), ["RF-1", "RF-2"]);
  assert.ok(
    result.rows.every((r) => r.status === "SCHEDULE_ONLY"),
    `Northport RF honest SCHEDULE_ONLY (got ${result.rows.map((r) => r.tag + ":" + r.status).join(",")})`,
  );
  assert.ok(result.rows.every((r) => (r.installed_qty || 0) === 0));
});

