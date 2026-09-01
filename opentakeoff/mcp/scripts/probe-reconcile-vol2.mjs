/**
 * Probe reconcile MATCH/SO rates per family on keyed Vol2 compile sets.
 * Usage: node --import tsx scripts/probe-reconcile-vol2.mjs 030 093 019 ...
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";
import {
  reconcileScheduleFamilyWithSweeps,
  familyNeedleFromSpecs,
  summarizeReconcile,
} from "../../web/src/lib/schedulePlanReconcile.mjs";
import { HVAC_FAMILY_SPECS } from "../../web/src/lib/corpusTakeoff.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../opentakeoff-corpus");
const CROSS = resolve(CORPUS, "takeoffs/cross-set-compile");

async function loadKeySession(key) {
  const primary = resolve(CORPUS, key.source_file);
  if (existsSync(primary)) {
    const session = new Session();
    await session.loadPlan(primary);
    return session;
  }
  const partsDir = key.source_parts_dir ? resolve(CORPUS, key.source_parts_dir) : null;
  if (!partsDir || !existsSync(partsDir)) return null;
  const parts = readdirSync(partsDir).filter((f) => f.endsWith(".pdf")).sort();
  if (!parts.length) return null;
  const session = new Session();
  await session.loadPlan(resolve(partsDir, parts[0]));
  for (let i = 1; i < parts.length; i++) {
    await session.loadPlan(resolve(partsDir, parts[i]), { merge: true });
  }
  return session;
}

const prefixes = process.argv.slice(2).map((p) => String(p).padStart(3, "0"));
const keys = readdirSync(CROSS)
  .filter((f) => f.endsWith(".compile.json"))
  .filter((f) => prefixes.some((p) => f.startsWith(p + "_")))
  .map((f) => JSON.parse(readFileSync(resolve(CROSS, f), "utf8")));

for (const key of keys) {
  const session = await loadKeySession(key);
  if (!session) {
    console.log(JSON.stringify({ set: key.set_id, error: "no PDF" }));
    continue;
  }
  const graph = await session.graphForPipeline();
  const families = Object.entries(key.categories || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const out = { set: key.set_id.slice(0, 48), families: {} };
  for (const [family, expect] of families) {
    const needle = familyNeedleFromSpecs(HVAC_FAMILY_SPECS, family);
    if (!needle) {
      out.families[family] = { expect, error: "no needle" };
      continue;
    }
    const result = await reconcileScheduleFamilyWithSweeps(session, graph, needle, {
      evaluationFast: true,
    });
    const sum = summarizeReconcile(result.rows);
    out.families[family] = {
      expect,
      rows: result.rows.length,
      ...sum,
      allMatch: sum.MATCH === expect && result.rows.length === expect,
    };
  }
  console.log(JSON.stringify(out));
}
