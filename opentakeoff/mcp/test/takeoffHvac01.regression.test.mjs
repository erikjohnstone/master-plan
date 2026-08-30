import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff, takeoffWorkbookSheets, rowsToCsv } from "../src/corpusTakeoff.mjs";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const TAKEOFF = resolve(CORPUS, "takeoffs/T-HVAC-01-navfac-equipment");

test("T-HVAC-01 compiler matches frozen truth quantities and cites", async () => {
  const fixture = JSON.parse(await readFile(resolve(TAKEOFF, "fixture.json"), "utf8"));
  const truth = loadTruth(resolve(TAKEOFF, "truth.json"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source);
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();
  const result = compileCorpusTakeoff(session, graph, "hvac_equipment");

  assert.equal(result.totals.items, 396);
  assert.equal(Object.keys(result.categories).length, 22);
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
