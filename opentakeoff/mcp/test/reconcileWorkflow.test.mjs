/**
 * WP4 reconcile fixture — schedule scaffold on keyed cross-set compile sets.
 * Full installed sweep is exercised via reconcileSchedulePlan in MCP tools;
 * here we prove schedule-side rows match compile counts without per-set hardcodes.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { cachedSheetGraph } from "../scripts/sheetGraphCache.mjs";
import { Session } from "../src/session.ts";
import {
  reconcileScheduleFamilyFromGraph,
  summarizeReconcile,
} from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

async function graphForPdf(pdfPath, setId) {
  return cachedSheetGraph(pdfPath, {
    identity: [setId, "reconcile-fixture"],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(pdfPath);
      return session.graphForPipeline();
    },
  });
}

test("federal-mech VAV reconcile scaffold matches compile count (schedule side)", async () => {
  const keyPath = resolve(CROSS, "federal-mech.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const graph = await graphForPdf(pdf, key.set_id);
  const compiled = compileCorpusTakeoff(null, graph, "hvac_equipment");
  const vavCompile = compiled.categories?.VAV?.count ?? 0;
  assert.equal(vavCompile, key.categories.VAV, "compile VAV matches key");

  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "VAV", ...HVAC_FAMILY_SPECS.VAV },
  );
  assert.equal(rows.length, vavCompile, "reconcile scaffold row count = compile VAV");
  assert.ok(rows.every((r) => r.scheduled_qty >= 1), "each row has scheduled qty");
  assert.ok(rows.every((r) => r.status === "SCHEDULE_ONLY"), "no sweep → schedule-only");
  const summary = summarizeReconcile(rows);
  assert.equal(summary.schedule_only, rows.length);
});

test("itd-d1-lab reconcile scaffold covers HHW valve schedule rows", async () => {
  const keyPath = resolve(CROSS, "itd-d1-lab.compile.json");
  assert.ok(existsSync(keyPath));
  const key = JSON.parse(readFileSync(keyPath, "utf8"));
  const pdf = resolve(CORPUS, key.source_file);
  if (!existsSync(pdf)) {
    test.skip(`PDF missing: ${key.source_file}`);
    return;
  }
  const graph = await graphForPdf(pdf, key.set_id);
  const valve = compileCorpusTakeoff(null, graph, "control_valves");
  assert.equal(valve.totals.items, key.control_valves.items);

  const rows = reconcileScheduleFamilyFromGraph(
    graph,
    { label: "HHW valve", ...HVAC_FAMILY_SPECS.HHW_CONTROL_VALVE },
  );
  assert.ok(rows.length >= 1, "HHW valve rows extracted for reconcile");
  assert.equal(
    rows.filter((r) => r.status === "SCHEDULE_ONLY").length,
    rows.length,
  );
});
