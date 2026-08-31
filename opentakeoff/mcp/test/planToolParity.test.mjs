/**
 * WP5 — Session plan-tool parity on frozen fixtures.
 * reconcileScheduleFamilyWithSweeps and direct sweepScheduleRow must agree
 * on installed qty for sampled tags (shared Session path, not UI fork).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { reconcileScheduleFamilyWithSweeps, familyNeedleFromSpecs } from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const D07 = resolve(CORPUS, "demos/D07-vav-plan-link-fan-refuse");

test("WP5 parity: reconcile installed_qty matches sweepScheduleRow on D07 VAV tags", async () => {
  const { graph, session } = await loadFixtureSession(CORPUS, D07);
  const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, "VAV");
  const tags = ["VAV-1", "VAV-5", "VAV-9"];
  const reconciled = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
    tags,
    evaluationFast: true,
  });
  for (const tag of tags) {
    const row = reconciled.rows.find((r) => r.tag.toUpperCase() === tag);
    assert.ok(row, `${tag} reconcile row`);
    const sweep = await session.sweepScheduleRow(tag, { evaluationFast: true });
    const sweepQty = (sweep.found ?? sweep.quantity ?? 0) > 0 ? 1 : 0;
    assert.equal(
      row.installed_qty,
      sweepQty,
      `${tag} reconcile installed_qty must match sweepScheduleRow`,
    );
  }
});
