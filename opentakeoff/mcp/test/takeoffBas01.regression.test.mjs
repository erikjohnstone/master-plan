import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import { compileCorpusTakeoff, takeoffWorkbookSheets } from "../src/corpusTakeoff.mjs";
import { verifyTakeoffGates, loadTruth } from "../src/verifyTakeoffGates.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const TAKEOFF = resolve(CORPUS, "takeoffs/T-BAS-01-navfac-points");

test("T-BAS-01 compiler matches frozen truth quantities and cites", async () => {
  const fixture = JSON.parse(await readFile(resolve(TAKEOFF, "fixture.json"), "utf8"));
  const truth = loadTruth(resolve(TAKEOFF, "truth.json"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source);
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();
  const result = compileCorpusTakeoff(session, graph, "bas_points");

  assert.deepEqual(result.categories.points_lists.totals, {
    rows: 122,
    AI: 43,
    AO: 15,
    BI: 49,
    BO: 15,
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
