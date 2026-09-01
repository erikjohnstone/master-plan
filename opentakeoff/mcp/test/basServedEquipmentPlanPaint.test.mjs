/**
 * Pillar C — BAS served_equipment → plan paint (shared sweep path).
 * Estimator points takeoff is incomplete without grounding served units on plan
 * (MATCH with cites) or honest miss when tags are not plan-text.
 *
 * Skips when rejoined PDF / parts are absent (same pattern as reconcileWorkflow).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileCorpusTakeoff } from "../src/corpusTakeoff.mjs";
import { Session } from "../src/session.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

/** Sets with nonzero bas_points + equipment that often appears on plans. */
const BAS_PLAN_PAINT_KEYS = [
  "001_NC_FY20_P_228_ATC_Tower_and_Air_Operations.compile.json",
  "015_VA_P_095_Replace_Submarine_Pier_3_Utility.compile.json",
  "096_IN_Vermillion_County_Jail_Mechanical_Bid_Set.compile.json",
];

async function loadKeySession(key) {
  const primary = resolve(CORPUS, key.source_file);
  if (existsSync(primary)) {
    const session = new Session();
    await session.loadPlan(primary);
    return session;
  }
  const partsDir = key.source_parts_dir
    ? resolve(CORPUS, key.source_parts_dir)
    : null;
  if (!partsDir || !existsSync(partsDir)) return null;
  const parts = readdirSync(partsDir)
    .filter((f) => f.endsWith(".pdf"))
    .sort();
  if (!parts.length) return null;
  const session = new Session();
  await session.loadPlan(resolve(partsDir, parts[0]));
  for (let i = 1; i < parts.length; i++) {
    await session.loadPlan(resolve(partsDir, parts[i]), { merge: true });
  }
  return session;
}

function uniqueServedEquipment(bas, { limit = 8 } = {}) {
  const seen = new Set();
  const out = [];
  for (const list of bas.categories?.points_lists?.lists || []) {
    for (const item of list.items || []) {
      const eq = String(item.served_equipment || "").trim();
      if (!eq || seen.has(eq.toUpperCase())) continue;
      // Prefer unit-like marks (AHU-1 / DOAH-TI / HWP-1), skip prose.
      if (!/^[A-Z]{1,8}[\s\-]?\d/i.test(eq) && !/^[A-Z]{2,8}-[A-Z0-9]/i.test(eq)) continue;
      seen.add(eq.toUpperCase());
      out.push(eq);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

for (const file of BAS_PLAN_PAINT_KEYS) {
  test(`Pillar C BAS served_equipment plan paint: ${file}`, async (t) => {
    const keyPath = resolve(CROSS, file);
    if (!existsSync(keyPath)) {
      t.skip(`missing key ${file}`);
      return;
    }
    const key = JSON.parse(readFileSync(keyPath, "utf8"));
    if (!key.bas_points?.rows) {
      t.skip(`${key.set_id} has no bas_points rows`);
      return;
    }
    const session = await loadKeySession(key);
    if (!session) {
      t.skip(`${key.set_id} — no rejoined PDF / parts`);
      return;
    }
    const graph = await session.graphForPipeline();
    const bas = compileCorpusTakeoff(null, graph, "bas_points");
    assert.equal(
      bas.totals.rows ?? bas.totals.items ?? 0,
      key.bas_points.rows,
      `${key.set_id} bas rows`,
    );
    const served = uniqueServedEquipment(bas, { limit: 6 });
    assert.ok(
      served.length >= 1,
      `${key.set_id} expected ≥1 served_equipment join from BAS compile`,
    );

    let grounded = 0;
    for (const tag of served) {
      let r;
      try {
        r = await session.sweepScheduleRow(tag, {
          commit: false,
          evaluationFast: true,
        });
      } catch {
        // Tag not on a schedule / not drawable — honest skip for this mark.
        continue;
      }
      const found = r.found ?? 0;
      const cites = (r.sheets || []).flatMap((ps) => ps.matches || []);
      if (found >= 1 && cites.length >= 1) grounded += 1;
    }
    // At least one served unit must paint on plan for this proof set.
    // If a set is schedule-only for all sampled tags, fix with measured
    // SCHEDULE_ONLY counts — do not invent MATCH.
    assert.ok(
      grounded >= 1,
      `${key.set_id}: need ≥1 served_equipment plan MATCH among ${served.join(", ")} (got ${grounded})`,
    );
  });
}
