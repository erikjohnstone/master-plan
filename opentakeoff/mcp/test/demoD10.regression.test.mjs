import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D10-bas-points-takeoff");

function pointTypeCounts(rows) {
  const counts = { AI: 0, AO: 0, BI: 0, BO: 0 };
  for (const row of rows || []) {
    const tag = String(row.key || row.identity?.text || "").toUpperCase();
    const m = tag.match(/^(AI|AO|BI|BO)\d/i);
    if (m) counts[m[1].toUpperCase()] += 1;
  }
  return counts;
}

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

function findPointsList(tables, titleRe, sheetSuffix) {
  return tables.find((table) =>
    titleRe.test(table.title?.text || "")
    && (!sheetSuffix || String(table.sheet || "").endsWith(sheetSuffix)));
}

test("D10 production engine preserves five-list BAS points takeoff evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(DEMO, "fixture.json"), "utf8"));
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`D10 real fixture is required at ${source}; see ${resolve(DEMO, "fixture.json")}`, {
      cause: error,
    });
  });
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();

  const doah = findPointsList(graph.tables, /POINTS LIST DOAH-TI/i, "#64");
  const ahu = findPointsList(graph.tables, /POINTS LIST AHU-T1A/i, "#65");
  const fcuCool = findPointsList(graph.tables, /FCU WITH COOLING COILS DDC POINTS LIST/i, "#67");
  const fcuHc = findPointsList(graph.tables, /FCU WITH HEATING AND COOLING COILS DDC POINTS LIST/i, "#67");
  const uh = findPointsList(graph.tables, /UNIT HEATER DDC POINTS LIST/i, "#67");
  assert.ok(doah && ahu && fcuCool && fcuHc && uh, "all five extractable points/DDC lists must remain present");

  assert.equal(doah.rows.length, truth.expected.doah_rows.value);
  assert.deepEqual(pointTypeCounts(doah.rows), {
    AI: truth.expected.doah_ai.value,
    AO: truth.expected.doah_ao.value,
    BI: truth.expected.doah_bi.value,
    BO: truth.expected.doah_bo.value,
  });

  assert.equal(ahu.rows.length, truth.expected.ahu_rows.value);
  assert.deepEqual(pointTypeCounts(ahu.rows), {
    AI: truth.expected.ahu_ai.value,
    AO: truth.expected.ahu_ao.value,
    BI: truth.expected.ahu_bi.value,
    BO: truth.expected.ahu_bo.value,
  });

  assert.equal(fcuCool.rows.length, truth.expected.fcu_cool_rows.value);
  assert.deepEqual(pointTypeCounts(fcuCool.rows), {
    AI: truth.expected.fcu_cool_ai.value,
    AO: truth.expected.fcu_cool_ao.value,
    BI: truth.expected.fcu_cool_bi.value,
    BO: truth.expected.fcu_cool_bo.value,
  });

  assert.equal(fcuHc.rows.length, truth.expected.fcu_hc_rows.value);
  assert.deepEqual(pointTypeCounts(fcuHc.rows), {
    AI: truth.expected.fcu_hc_ai.value,
    AO: truth.expected.fcu_hc_ao.value,
    BI: truth.expected.fcu_hc_bi.value,
    BO: truth.expected.fcu_hc_bo.value,
  });

  assert.equal(uh.rows.length, truth.expected.uh_rows.value);
  assert.deepEqual(pointTypeCounts(uh.rows), {
    AI: truth.expected.uh_ai.value,
    AO: truth.expected.uh_ao.value,
    BI: truth.expected.uh_bi.value,
    BO: truth.expected.uh_bo.value,
  });

  const totalRows = doah.rows.length + ahu.rows.length + fcuCool.rows.length + fcuHc.rows.length + uh.rows.length;
  assert.equal(totalRows, truth.expected.total_rows.value);
  const totals = [doah, ahu, fcuCool, fcuHc, uh].reduce((acc, table) => {
    const c = pointTypeCounts(table.rows);
    for (const k of Object.keys(acc)) acc[k] += c[k];
    return acc;
  }, { AI: 0, AO: 0, BI: 0, BO: 0 });
  assert.equal(totals.AI, truth.expected.total_ai.value);
  assert.equal(totals.AO, truth.expected.total_ao.value);
  assert.equal(totals.BI, truth.expected.total_bi.value);
  assert.equal(totals.BO, truth.expected.total_bo.value);

  const ahuByKey = new Map((ahu.rows || []).map((row) => [
    String(row.key || "").toUpperCase().replace(/\s+/g, ""),
    row,
  ]));
  const ai10 = ahuByKey.get("AI10");
  assert.ok(ai10, "AI10 must remain on POINTS LIST AHU-T1A/TIB");
  assert.equal(cellText(ai10, /DESCRIPTION/i), truth.follow_up.expected.ai10_description);
  assert.equal(cellText(ai10, /^ALARM$/i), truth.follow_up.expected.ai10_alarm);
  assert.equal(cellText(ai10, /^TREND$/i), truth.follow_up.expected.ai10_trend);

  let onlyA = 0;
  let onlyB = 0;
  let neither = 0;
  for (const row of ahu.rows || []) {
    const desc = cellText(row, /DESCRIPTION/i);
    const hasA = /AHU-T1A/i.test(desc);
    const hasB = /AHU-T1B/i.test(desc);
    if (hasA && !hasB) onlyA += 1;
    else if (hasB && !hasA) onlyB += 1;
    else neither += 1;
  }
  assert.equal(onlyA, truth.follow_up.expected.ahu_t1a_named);
  assert.equal(onlyB, truth.follow_up.expected.ahu_t1b_named);
  assert.equal(neither, truth.follow_up.expected.ahu_shared);

  assert.ok((doah.rows || []).some((row) => String(row.key || "").toUpperCase() === "AI07"));
  assert.ok((fcuCool.rows || []).some((row) => String(row.key || "").toUpperCase() === "AO01"));
  assert.ok((uh.rows || []).some((row) => String(row.key || "").toUpperCase() === "BI02"));
});
