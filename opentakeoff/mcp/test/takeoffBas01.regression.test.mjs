import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff, takeoffWorkbookSheets } from "../src/corpusTakeoff.mjs";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const TAKEOFF = resolve(CORPUS, "takeoffs/T-BAS-01-navfac-points");

test("T-BAS-01 compiler matches frozen truth quantities and cites", async () => {
  const truth = loadTruth(resolve(TAKEOFF, "truth.json"));
  const { graph, session } = await loadFixtureSession(CORPUS, TAKEOFF);
  const result = compileCorpusTakeoff(session, graph, "bas_points");

  // Frozen AI/AO/BI/BO + WP8 affirmative ALARM/TREND rollups (Yes only; No/- ignored).
  assert.deepEqual(result.categories.points_lists.totals, {
    rows: 122,
    AI: 43,
    AO: 15,
    BI: 49,
    BO: 15,
    alarm: 44,
    trend: 32,
    hardwired: 0,
    soft: 0,
  });
  assert.equal(result.categories.points_lists.lists.length, 5);
  assert.equal(result.page_accounting.pages_accounted_for, 75);

  const gates = await verifyTakeoffGates(truth, result, session, {
    skipInterrogation: true,
    groundSamplePerCategory: 2,
  });
  assert.equal(gates.ok, true, JSON.stringify(gates.failures.slice(0, 5), null, 2));

  const sheets = takeoffWorkbookSheets(result);
  assert.ok(sheets.some((s) => s.name === "ROLLUP"));
  assert.ok(sheets.length >= 6);
});
