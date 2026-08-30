import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFixtureGraph } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D03-hvac-bas-project-takeoff");

function uniqueMarks(tables, titleRe, { exclude } = {}) {
  const keys = new Set();
  for (const table of tables) {
    const title = String(table.title?.text || "");
    if (!titleRe.test(title)) continue;
    if (exclude && exclude.test(title)) continue;
    for (const row of table.rows || []) {
      const key = String(row.key || "").trim().toUpperCase().replace(/\s+/g, "");
      if (key) keys.add(key);
    }
  }
  return keys;
}

test("D03 production engine preserves pinned HVAC/BAS project-takeoff evidence", async () => {
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const { graph } = await loadFixtureGraph(CORPUS, DEMO);

  const ahu = uniqueMarks(graph.tables, /AIR HANDLING UNIT/i, { exclude: /DEDICATED/i });
  const doahUnit = uniqueMarks(graph.tables, /DEDICATED OUTDOOR AIR UNIT/i, { exclude: /HANDLING/i });
  const doahHandling = uniqueMarks(graph.tables, /DEDICATED OUTDOOR AIR HANDLING/i);
  const fcu = uniqueMarks(graph.tables, /FAN\s*COIL/i);
  const vav = uniqueMarks(graph.tables, /VARIABLE AIR VOLUME|\bVAV\b/i);
  const airCooled = uniqueMarks(graph.tables, /AIR COOLED CHILLER/i, { exclude: /HEAT RECOVERY/i });
  const heatRecovery = uniqueMarks(graph.tables, /HEAT RECOVERY/i);
  const boilers = uniqueMarks(graph.tables, /BOILER/i);

  assert.equal(ahu.size, truth.expected.ahu_count.value);
  assert.equal(doahUnit.size, truth.expected.doah_count.value);
  assert.ok(doahHandling.has("DOAH-T1"), "DOAH-T1 must remain on the HANDLING schedule");
  assert.equal(fcu.size, truth.expected.fcu_count.value);
  assert.equal(vav.size, truth.expected.vav_count.value);
  assert.equal(airCooled.size, truth.expected.air_cooled_chiller_count.value);
  assert.equal(heatRecovery.size, truth.expected.heat_recovery_chiller_count.value);
  assert.equal(boilers.size, truth.expected.boiler_count.value);

  const fcuA = [...fcu].filter((k) => /-A(?=[A-Z0-9]|$)/i.test(k)).length;
  const fcuT = [...fcu].filter((k) => /-T(?=[A-Z0-9]|$)/i.test(k)).length;
  const vavA = [...vav].filter((k) => /-A(?=[A-Z0-9]|$)/i.test(k)).length;
  const vavM = [...vav].filter((k) => /-M(?=[A-Z0-9]|$)/i.test(k)).length;
  assert.equal(fcuA, truth.expected.fcu_air_ops_count.value);
  assert.equal(fcuT, truth.expected.fcu_atct_count.value);
  assert.equal(vavA, truth.expected.vav_air_ops_count.value);
  assert.equal(vavM, truth.expected.vav_mitracon_count.value);
  assert.ok(fcu.has("FCU-T11"), "FCU-T11 must remain on the fan-coil schedule");

  const points = graph.tables.find((candidate) =>
    candidate.sheet.endsWith("#65")
    && /POINTS LIST AHU-T1A/i.test(candidate.title?.text || ""));
  assert.ok(points, "D03 AHU-T1A/TIB points list must remain extractable on MI731");
  assert.equal(points.rows.length, truth.expected.bas_ahu_t1a_tib_points_rows.value);
});
