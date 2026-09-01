/**
 * WP4 reconcile golden — D07 VAV family contractor CSV + status bar.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  reconcileScheduleFamilyWithSweeps,
  reconcileRowsToCsv,
  familyNeedleFromSpecs,
  summarizeReconcile,
} from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const D07 = resolve(CORPUS, "demos/D07-vav-plan-link-fan-refuse");

test("WP4 golden: D07 VAV reconcile CSV has contractor columns and MATCH/refuse mix", async () => {
  const truthPath = resolve(D07, "truth.json");
  assert.ok(existsSync(truthPath));
  const truth = JSON.parse(readFileSync(truthPath, "utf8"));
  const { graph, session } = await loadFixtureSession(CORPUS, D07);
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    evaluationFast: true,
  });
  const csv = reconcileRowsToCsv(result.rows);
  assert.match(csv, /^Tag,Family,Scheduled qty,Installed qty,Status,/);
  assert.ok(result.rows.length >= 9, "VAV schedule rows");
  const summary = summarizeReconcile(result.rows);
  assert.ok(summary.match >= 3, "plan-drawn VAV tags MATCH");
  const vav1 = result.rows.find((r) => r.tag === "VAV-1");
  assert.equal(vav1?.status, "MATCH");
  assert.ok(vav1?.plan_cites?.length >= 1);
  // Honest refuse path still present on fan family (separate sweep in truth).
  const fanNeedle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "FAN");
  const fans = await reconcileScheduleFamilyWithSweeps(session, graph, fanNeedle, {
    tags: ["EF-2"],
    evaluationFast: true,
  });
  const ef2 = fans.rows.find((r) => r.tag === "EF-2");
  assert.equal(ef2?.status, "SCHEDULE_ONLY");
  assert.ok(truth?.expected, "D07 truth fixture present");
});
