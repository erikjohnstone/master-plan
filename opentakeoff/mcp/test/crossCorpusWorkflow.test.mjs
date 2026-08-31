/**
 * Cross-corpus HVAC/BAS workflow invariants — set-agnostic.
 * Counts differ per drawing; structure and intent routing must not.
 * WP1: keyed schedule-compile acceptance on ≥2 non-NAVFAC sets.
 * Uses the sheet-graph cache so multi-set coverage stays fast when warm.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedSheetGraph } from "../scripts/sheetGraphCache.mjs";
import {
  classifyTakeoffIntent,
  corpusCompileKind,
  valveServiceFromGoal,
} from "../../web/src/lib/takeoffWorkflow.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const SAMPLES = resolve(HERE, "../../samples");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

const SETS = [
  {
    id: "navfac-cherry-point-atc",
    pdf: resolve(CORPUS, "raw/navfac-cherry-point-atc-mechanical.pdf"),
  },
  {
    id: "federal-mech",
    pdf: resolve(CORPUS, "raw/federal-attachment4-mechanical.pdf"),
  },
  {
    id: "bldg5406-hvac-demo",
    pdf: resolve(CORPUS, "raw/bldg5406-hvac-demo-mechanical.pdf"),
  },
  {
    id: "itd-d1-lab",
    pdf: resolve(CORPUS, "raw/itd-d1-lab-mechanical.pdf"),
  },
  {
    id: "baker-county-eoc",
    pdf: resolve(CORPUS, "raw/baker-county-eoc-bidset.pdf"),
  },
  {
    id: "bessemer",
    pdf: resolve(SAMPLES, "bessemer-mechanical-bidset.pdf"),
  },
];

async function graphForPdf(pdfPath, setId) {
  return cachedSheetGraph(pdfPath, {
    identity: [setId, "cross-corpus"],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(pdfPath);
      return session.graphForPipeline();
    },
  });
}

test("phrase-robust corpus intents stay set-agnostic (no drawing names)", () => {
  assert.equal(
    corpusCompileKind("Do a complete HVAC equipment quantity takeoff of this set"),
    "hvac_equipment",
  );
  assert.equal(
    corpusCompileKind("full HVAC equipment takeoff on these drawings"),
    "hvac_equipment",
  );
  assert.equal(
    corpusCompileKind("complete BAS points takeoff of this set"),
    "bas_points",
  );
  assert.equal(
    corpusCompileKind("Run a complete valve takeoff on this blueprint set"),
    "control_valves",
  );
  assert.equal(
    corpusCompileKind("complete control valve takeoff on this blueprint set"),
    "control_valves",
  );
  assert.equal(valveServiceFromGoal("chilled-water control valve takeoff"), "CHW");
  assert.equal(valveServiceFromGoal("hot water valve takeoff"), "HHW");
  assert.equal(
    classifyTakeoffIntent("How many FCUs across buildings on this set?"),
    "fcu_buildings",
  );
});

test("HVAC/BAS/valve compiles succeed structurally on every available corpus PDF", async () => {
  const available = SETS.filter((s) => existsSync(s.pdf));
  assert.ok(available.length >= 3, "need multiple corpus PDFs for cross-set coverage");

  for (const set of available) {
    const graph = await graphForPdf(set.pdf, set.id);
    assert.equal(graph.available, true, `${set.id} graph available`);
    assert.ok((graph.sheets || []).length >= 1, `${set.id} has sheets`);

    const session = null;
    for (const kind of ["hvac_equipment", "bas_points", "control_valves"]) {
      const result = compileCorpusTakeoff(session, graph, kind);
      assert.equal(result.kind, kind === "hvac_equipment" ? "hvac_equipment"
        : kind === "bas_points" ? "bas_points" : "control_valves", `${set.id} ${kind} kind`);
      assert.ok(result.totals && typeof result.totals === "object", `${set.id} ${kind} totals`);
      const n = result.totals.items ?? result.totals.rows ?? 0;
      assert.ok(Number.isFinite(n) && n >= 0, `${set.id} ${kind} non-negative total`);
      assert.ok(result.page_accounting?.sheet_count >= 1, `${set.id} ${kind} page accounting`);
      if (n === 0) {
        assert.ok(
          result.status || result.page_accounting,
          `${set.id} ${kind} empty compile must still disclose accounting`,
        );
      }
    }
  }
});

test("WP1 keyed compile acceptance on ≥2 non-NAVFAC sets", async () => {
  const keys = [
    "bldg5406-hvac-demo.compile.json",
    "federal-mech.compile.json",
    "itd-d1-lab.compile.json",
    // Bulk US vector set — same product compile path a user upload hits.
    "16_NV_CarsonValleyMS_HVAC_Replacement.compile.json",
    "04_NV_VA_LasVegas_CentralUtilityPlant.compile.json",
    "26_CA_TransbayTower_Mechanical_64Sheets.compile.json",
    "21_VA_OrangeCounty_PublicSafetyBldg.compile.json",
    "24_IA_JohnsonCounty_Courthouse.compile.json",
    "09_ME_BGS_KennebecValleyCC_Renovation.compile.json",
    "01_NY_VA_Northport_Dialysis_100CD.compile.json",
    "30_WA_SpokaneTransit_CoolingTower.compile.json",
    "23_GA_MaconBibb_RecreationCenter.compile.json",
    "10_MO_Hawthorn_PsychHospital_HVAC.compile.json",
    "17_FL_SuwanneeHS_Courtyard_100CD.compile.json",
  ];
  let scored = 0;
  for (const file of keys) {
    const keyPath = resolve(CROSS, file);
    assert.ok(existsSync(keyPath), `missing acceptance key ${file}`);
    const key = JSON.parse(readFileSync(keyPath, "utf8"));
    const pdf = resolve(CORPUS, key.source_file);
    if (!existsSync(pdf)) {
      console.log(`skip ${key.set_id} — PDF not present at ${key.source_file}`);
      continue;
    }
    scored += 1;
    const graph = await graphForPdf(pdf, key.set_id);
    const hvac = compileCorpusTakeoff(null, graph, "hvac_equipment");
    const bas = compileCorpusTakeoff(null, graph, "bas_points");
    const valve = compileCorpusTakeoff(null, graph, "control_valves");

    assert.equal(hvac.totals.items, key.totals.items, `${key.set_id} HVAC total`);
    for (const [fam, n] of Object.entries(key.categories)) {
      assert.equal(
        hvac.categories?.[fam]?.count ?? 0,
        n,
        `${key.set_id} ${fam} count`,
      );
    }
    // Families not listed in the key must stay zero (no silent inflation).
    for (const [fam, cat] of Object.entries(hvac.categories || {})) {
      if (key.categories[fam] != null) continue;
      assert.equal(cat.count, 0, `${key.set_id} unexpected family ${fam}=${cat.count}`);
    }

    assert.equal(bas.totals.rows ?? bas.totals.items ?? 0, key.bas_points.rows,
      `${key.set_id} BAS empty/honest disclose`);
    assert.ok(bas.page_accounting?.sheet_count >= 1, `${key.set_id} BAS page accounting`);

    assert.equal(valve.totals.items, key.control_valves.items, `${key.set_id} valve total`);
    for (const [fam, n] of Object.entries(key.control_valves.categories || {})) {
      assert.equal(valve.categories?.[fam]?.count ?? 0, n, `${key.set_id} valve ${fam}`);
    }
  }
  assert.ok(scored >= 2, `need ≥2 non-NAVFAC keyed sets scored, got ${scored}`);
});
