import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D08-fcu-cross-building");

function uniqueMarks(tables, titleRe) {
  const keys = new Set();
  for (const table of tables) {
    const title = String(table.title?.text || "");
    if (!titleRe.test(title)) continue;
    for (const row of table.rows || []) {
      const key = String(row.key || "").trim().toUpperCase().replace(/\s+/g, "");
      if (/^FCU[\-A-Z0-9]/i.test(key)) keys.add(key);
    }
  }
  return keys;
}

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

test("D08 production engine preserves cross-building FCU rollup evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(DEMO, "fixture.json"), "utf8"));
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`D08 real fixture is required at ${source}; see ${resolve(DEMO, "fixture.json")}`, {
      cause: error,
    });
  });
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();

  const fcu = uniqueMarks(graph.tables, /FAN\s*COIL\s*UNIT\s*SCHEDULE/i);
  assert.equal(fcu.size, truth.expected.fcu_count.value);
  const fcuA = [...fcu].filter((k) => /-A(?=[A-Z0-9]|$)/i.test(k)).length;
  const fcuM = [...fcu].filter((k) => /-M(?=[A-Z0-9]|$)/i.test(k)).length;
  const fcuT = [...fcu].filter((k) => /-T(?=[A-Z0-9]|$)/i.test(k)).length;
  assert.equal(fcuA, truth.expected.fcu_air_ops_count.value);
  assert.equal(fcuM, truth.expected.fcu_mitracon_count.value);
  assert.equal(fcuT, truth.expected.fcu_atct_count.value);
  assert.ok(fcu.has("FCU-T11"), "FCU-T11 must remain on an ATCT FCU schedule");

  const byKey = new Map();
  for (const table of graph.tables) {
    if (!/FAN\s*COIL\s*UNIT\s*SCHEDULE/i.test(table.title?.text || "")) continue;
    for (const row of table.rows || []) {
      const key = String(row.key || "").toUpperCase().replace(/\s+/g, "");
      if (key && !byKey.has(key)) byKey.set(key, row);
    }
  }
  assert.equal(cellText(byKey.get("FCU-A1"), /^TYPE$/i), truth.expected.fcu_a1_type.value);
  assert.equal(cellText(byKey.get("FCU-A1"), /CFM/i), truth.expected.fcu_a1_cfm.value);
  assert.equal(cellText(byKey.get("FCU-M1A"), /^TYPE$/i), truth.expected.fcu_m1a_type.value);
  assert.equal(cellText(byKey.get("FCU-M1A"), /CFM/i), truth.expected.fcu_m1a_cfm.value);
  assert.equal(cellText(byKey.get("FCU-T1"), /^TYPE$/i), truth.expected.fcu_t1_type.value);
  assert.equal(String(cellText(byKey.get("FCU-T1"), /CFM/i)), String(truth.expected.fcu_t1_cfm.value));
  assert.equal(Number(String(cellText(byKey.get("FCU-T11"), /CFM/i)).match(/\d+/)?.[0]), truth.follow_up.expected.fcu_t11_cfm);
  assert.equal(truth.follow_up.expected.fcu_mitracon_count, 10);
});
