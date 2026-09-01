import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff, takeoffWorkbookSheets, rowsToCsv, HVAC_FAMILY_SPECS } from "../src/corpusTakeoff.mjs";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const TAKEOFF = resolve(CORPUS, "takeoffs/T-HVAC-01-navfac-equipment");

test("T-HVAC-01 compiler matches frozen truth quantities and cites", async () => {
  const truth = loadTruth(resolve(TAKEOFF, "truth.json"));
  const { graph, session } = await loadFixtureSession(CORPUS, TAKEOFF);
  const result = compileCorpusTakeoff(session, graph, "hvac_equipment");

  assert.equal(result.totals.items, 396);
  assert.equal(Object.keys(result.categories).length, Object.keys(HVAC_FAMILY_SPECS).length);
  assert.equal(result.categories.AHU.count, truth.categories.AHU.count);
  assert.equal(result.categories.FCU.count, truth.categories.FCU.count);
  assert.equal(result.categories.VAV.count, truth.categories.VAV.count);
  assert.equal(result.categories.CHW_CONTROL_VALVE.count, truth.categories.CHW_CONTROL_VALVE.count);
  assert.equal(result.page_accounting.pages_accounted_for, 75);

  const gates = await verifyTakeoffGates(truth, result, session, {
    skipInterrogation: true,
    groundSamplePerCategory: 2,
  });
  assert.equal(gates.ok, true, JSON.stringify(gates.failures.slice(0, 5), null, 2));

  const sheets = takeoffWorkbookSheets(result);
  assert.ok(sheets.some((s) => s.name === "ROLLUP"));
  assert.ok(sheets.some((s) => s.name === "AHU"));
  const csv = rowsToCsv(sheets[0].rows);
  assert.match(csv, /category|tag/);
});
