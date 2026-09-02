/**
 * Pillar C — BAS served_equipment → plan paint (shared sweep path).
 * Uses estimator_product plan_paint targets + sweepBasServedMark preferTitle/sheet.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { sweepBasServedMark } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { loadCachedKeySession } from "./helpers/loadKeySession.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

/** Keyed BAS sets with measured served plan-paint floors. */
const BAS_SERVED_PLAN_PAINT_KEYS = [
  {
    file: "001_NC_FY20_P_228_ATC_Tower_and_Air_Operations.compile.json",
    minMatch: 100,
    maxAmbiguous: 0,
    maxError: 0,
  },
  {
    file: "015_VA_P_095_Replace_Submarine_Pier_3_Utility.compile.json",
    minMatch: 15,
    maxAmbiguous: 0,
    maxError: 0,
  },
  {
    file: "096_IN_Vermillion_County_Jail_Mechanical_Bid_Set.compile.json",
    minMatch: 50,
    maxAmbiguous: 0,
    maxError: 0,
  },
  {
    file: "27_WA_ColvilleTribes_Hatchery_Lab.compile.json",
    minMatch: 30,
    maxAmbiguous: 0,
    maxError: 0,
  },
  {
    file: "021_XX_Laboratory_building_mechanical_drawings_lab.compile.json",
    minMatch: 0,
    maxAmbiguous: 0,
    maxError: 0,
    allScheduleOnly: true,
  },
];

function tally(rows) {
  const t = { MATCH: 0, SCHEDULE_ONLY: 0, AMBIGUOUS: 0, ERROR: 0 };
  for (const r of rows) t[r.status] = (t[r.status] ?? 0) + 1;
  return t;
}

for (const spec of BAS_SERVED_PLAN_PAINT_KEYS) {
  test(`Pillar C BAS served plan paint: ${spec.file}`, async (t) => {
    const keyPath = resolve(CROSS, spec.file);
    if (!existsSync(keyPath)) {
      t.skip(`missing key ${spec.file}`);
      return;
    }
    const key = JSON.parse(readFileSync(keyPath, "utf8"));
    if (!key.bas_points?.rows) {
      t.skip(`${key.set_id} has no bas_points rows`);
      return;
    }
    const loaded = await loadCachedKeySession(CORPUS, key, "bas-served-plan-paint");
    if (!loaded) {
      t.skip(`${key.set_id} — no rejoined PDF / parts`);
      return;
    }
    const { session, graph } = loaded;
    const bas = compileCorpusTakeoff(null, graph, "bas_points");
    assert.equal(
      bas.totals.rows ?? bas.totals.items ?? 0,
      key.bas_points.rows,
      `${key.set_id} bas rows`,
    );
    const targets = bas.estimator_product?.plan_paint?.targets || [];
    assert.ok(targets.length >= 1, `${key.set_id} plan_paint targets`);

    const outcomes = [];
    for (const target of targets) {
      outcomes.push(await sweepBasServedMark(session, target.tag, {
        evaluationFast: true,
        preferTitle: target.prefer_schedule_title || null,
        preferSheet: target.prefer_schedule_sheet || null,
      }));
    }
    const tallies = tally(outcomes);
    assert.ok(
      tallies.MATCH >= spec.minMatch,
      `${key.set_id}: need ≥${spec.minMatch} MATCH, got ${tallies.MATCH}`,
    );
    assert.ok(
      tallies.AMBIGUOUS <= spec.maxAmbiguous,
      `${key.set_id}: AMBIGUOUS ${tallies.AMBIGUOUS} > ${spec.maxAmbiguous}`,
    );
    assert.ok(
      tallies.ERROR <= spec.maxError,
      `${key.set_id}: ERROR ${tallies.ERROR} > ${spec.maxError}`,
    );
    if (spec.minScheduleOnly != null) {
      assert.ok(
        tallies.SCHEDULE_ONLY >= spec.minScheduleOnly,
        `${key.set_id}: honest SCHEDULE_ONLY floor ${tallies.SCHEDULE_ONLY}`,
      );
    }
    if (spec.allScheduleOnly) {
      assert.equal(tallies.MATCH, 0, `${key.set_id}: honest zero MATCH ceiling`);
      assert.equal(
        tallies.SCHEDULE_ONLY + tallies.MATCH,
        targets.length,
        `${key.set_id}: every served target honestly classified`,
      );
    }
  });
}
