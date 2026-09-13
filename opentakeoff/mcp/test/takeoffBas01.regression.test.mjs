import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff, takeoffWorkbookSheets } from "../src/corpusTakeoff.mjs";
import { loadTruth } from "../src/verifyTakeoffGates.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const TAKEOFF = resolve(CORPUS, "takeoffs/T-BAS-01-navfac-points");
const FULL_TRUTH = resolve(CORPUS, "ground_truth/bas_points/navfac-cherry-point-full-points-inventory.json");

test("T-BAS-01 preserves the frozen subset and matches the additive full-set points truth", async () => {
  const legacyTruth = loadTruth(resolve(TAKEOFF, "truth.json"));
  const fullTruth = JSON.parse(readFileSync(FULL_TRUTH, "utf8"));
  const { graph, session } = await loadFixtureSession(CORPUS, TAKEOFF);
  const result = compileCorpusTakeoff(session, graph, "bas_points");
  const lists = result.categories.points_lists.lists;

  // The original five-list/122-row authored truth remains an exact subset;
  // broader discovery is locked separately rather than rewriting that file.
  const legacyIds = new Set(legacyTruth.categories.points_lists.lists.map((list) => `${list.sheet_id}\0${list.title}`));
  const legacyLists = lists.filter((list) => legacyIds.has(`${list.sheet_id}\0${list.title}`));
  const legacyTotals = legacyLists.reduce((totals, list) => ({
    rows: totals.rows + list.rows,
    AI: totals.AI + list.AI,
    AO: totals.AO + list.AO,
    BI: totals.BI + list.BI,
    BO: totals.BO + list.BO,
    alarm: totals.alarm + list.alarm,
    trend: totals.trend + list.trend,
  }), { rows: 0, AI: 0, AO: 0, BI: 0, BO: 0, alarm: 0, trend: 0 });
  assert.deepEqual(legacyTotals, {
    rows: 122,
    AI: 43,
    AO: 15,
    BI: 49,
    BO: 15,
    alarm: 44,
    trend: 32,
  });
  assert.equal(legacyLists.length, 5);

  assert.deepEqual(
    Object.fromEntries(["lists", "rows", "AI", "AO", "BI", "BO"].map((field) => [field, result.totals[field]])),
    fullTruth.totals,
  );
  assert.equal(lists.length, fullTruth.lists.length);
  for (const expected of fullTruth.lists) {
    const actual = lists.find((list) => list.sheet_id.endsWith(`#${expected.page}`) && list.title === expected.title);
    assert.ok(actual, `missing full-set points list ${expected.page}/${expected.title}`);
    for (const field of ["rows", "AI", "AO", "BI", "BO"]) {
      assert.equal(actual[field], expected[field], `${expected.title} ${field}`);
    }
    assert.ok(actual.items.every((item) => Array.isArray(item.bbox_px) && item.bbox_px.length === 4));
  }
  assert.equal(result.page_accounting.pages_accounted_for, 75);

  // Retain the old vector-grounding guarantee on two real marks per frozen
  // list. The full additive corpus runner separately checks every item bbox.
  const overlaps = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0])
    && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
  for (const list of legacyLists) {
    for (const item of [list.items[0], list.items.at(-1)]) {
      const hits = session.findText(item.sheet_id, item.tag, { limit: 500 }).hits || [];
      assert.ok(hits.some((hit) => Array.isArray(hit.bbox) && overlaps(hit.bbox, item.bbox_px)),
        `${list.title}/${item.tag} is not vector-grounded under its bbox`);
    }
  }

  const sheets = takeoffWorkbookSheets(result);
  assert.ok(sheets.some((s) => s.name === "ROLLUP"));
  assert.ok(sheets.length >= 6);
});
