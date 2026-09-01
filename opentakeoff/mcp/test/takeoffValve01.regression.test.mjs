import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff, takeoffWorkbookSheets, rowsToCsv } from "../src/corpusTakeoff.mjs";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const TAKEOFF = resolve(CORPUS, "takeoffs/T-VALVE-01-navfac-control-valves");

test("T-VALVE-01 compiler matches frozen truth quantities and cites", async () => {
  const truth = loadTruth(resolve(TAKEOFF, "truth.json"));
  const { graph, session } = await loadFixtureSession(CORPUS, TAKEOFF);
  const result = compileCorpusTakeoff(session, graph, "control_valves");

  assert.equal(result.takeoff_id, "T-VALVE-01");
  assert.equal(result.kind, "control_valves");
  assert.equal(result.totals.items, 163);
  assert.equal(result.categories.CHW_CONTROL_VALVE.count, truth.categories.CHW_CONTROL_VALVE.count);
  assert.equal(result.categories.HHW_CONTROL_VALVE.count, truth.categories.HHW_CONTROL_VALVE.count);
  assert.equal(result.categories.CHW_CONTROL_VALVE.count, 64);
  assert.equal(result.categories.HHW_CONTROL_VALVE.count, 99);

  const gates = await verifyTakeoffGates(truth, result, session, {
    skipInterrogation: true,
    groundSamplePerCategory: 2,
  });
  assert.equal(gates.ok, true, JSON.stringify(gates.failures.slice(0, 5), null, 2));

  const sheets = takeoffWorkbookSheets(result);
  assert.ok(sheets.some((s) => s.name === "ROLLUP"));
  assert.ok(sheets.some((s) => /CHW/i.test(s.name)));
  const csv = rowsToCsv(sheets[0].rows);
  assert.match(csv, /category|tag/i);
});
