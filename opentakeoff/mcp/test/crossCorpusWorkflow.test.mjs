/**
 * Cross-corpus HVAC/BAS workflow invariants — set-agnostic.
 * Counts differ per drawing; structure and intent routing must not.
 * WP1: keyed schedule-compile acceptance on ≥2 non-NAVFAC sets.
 * Uses sheet-graph + compile triplet caches so multi-set coverage stays fast when warm.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import {
  assertWp1CompileAcceptance,
  cachedCompileTriplet,
} from "../scripts/compileAcceptanceCache.mjs";
import {
  classifyTakeoffIntent,
  corpusCompileKind,
  valveServiceFromGoal,
} from "../../web/src/lib/takeoffWorkflow.js";
import { cachedGraphForKey, cachedGraphForPdf } from "./helpers/loadKeySession.mjs";
import { WP1_ACCEPTANCE_KEY_FILES } from "./helpers/wp1AcceptanceKeys.mjs";

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
  return cachedGraphForPdf(CORPUS, pdfPath, setId, "cross-corpus");
}

async function graphForKey(key) {
  return cachedGraphForKey(CORPUS, key, "cross-corpus");
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

test("WP1 keyed compile acceptance on ≥2 non-NAVFAC sets", async (t) => {
  let scored = 0;
  await Promise.all(WP1_ACCEPTANCE_KEY_FILES.map((file) =>
    t.test(file, { concurrency: 4 }, async (st) => {
      const keyPath = resolve(CROSS, file);
      assert.ok(existsSync(keyPath), `missing acceptance key ${file}`);
      const key = JSON.parse(readFileSync(keyPath, "utf8"));
      const graph = await graphForKey(key);
      if (!graph) {
        st.skip(
          `no rejoined PDF at ${key.source_file}` +
            (key.source_parts_dir ? ` and no parts at ${key.source_parts_dir}` : ""),
        );
        return;
      }
      scored += 1;
      const triplet = await cachedCompileTriplet(CORPUS, key, keyPath, graph);
      assertWp1CompileAcceptance(key, triplet);
    }),
  ));
  assert.ok(scored >= 2, `need ≥2 non-NAVFAC keyed sets scored, got ${scored}`);
});
