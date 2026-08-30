import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D07-vav-plan-link-fan-refuse");

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

test("D07 production engine preserves VAV plan-link + EF sweep refuse evidence", async () => {
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const { graph, session } = await loadFixtureSession(CORPUS, DEMO);

  const vavSched = graph.tables.find((table) =>
    /AIR TERMINAL BOX SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(vavSched, "AIR TERMINAL BOX SCHEDULE must remain extractable");
  const vavKeys = (vavSched.rows || [])
    .map((row) => String(row.key || "").trim().toUpperCase())
    .filter((k) => /^VAV[\s\-]/i.test(k));
  assert.equal(vavKeys.length, truth.expected.vav_schedule_count.value);

  const byKey = new Map((vavSched.rows || []).map((row) => [
    String(row.key || "").toUpperCase().replace(/\s+/g, ""),
    row,
  ]));
  for (const tag of ["VAV-1", "VAV-5", "VAV-9"]) {
    const row = byKey.get(tag);
    assert.ok(row, `${tag} must remain on the air terminal box schedule`);
    const stem = tag.toLowerCase().replace(/-/g, "_");
    assert.equal(cellText(row, /MANUFACTURER/i), truth.expected[`${stem}_manufacturer`].value);
    assert.equal(Number(cellText(row, /^CFM$/i)), truth.expected[`${stem}_cfm`].value);
    assert.ok(Math.abs(Number(cellText(row, /^MBH$/i)) - truth.expected[`${stem}_mbh`].value) <= 0.05);
    assert.equal(Number(cellText(row, /^KW$/i)), truth.expected[`${stem}_kw`].value);

    const sweep = await session.sweepScheduleRow(tag, { evaluationFast: true });
    assert.equal(sweep.found, 1, `${tag} must remain findable on a plan sheet`);
  }

  const fans = graph.tables.find((table) =>
    /FAN\s*SCHEDULE/i.test(String(table.title?.text || "").replace(/\s+/g, " "))
    || /^FANSCHEDULE$/i.test(String(table.title?.text || "").replace(/\s+/g, "")));
  assert.ok(fans, "FAN SCHEDULE must remain extractable");
  const fanByKey = new Map((fans.rows || []).map((row) => [
    String(row.key || "").toUpperCase().replace(/\s+/g, ""),
    row,
  ]));
  assert.equal(Number(cellText(fanByKey.get("EF-1"), /^CFM$/i)), truth.expected.ef_1_cfm.value);
  assert.equal(Number(cellText(fanByKey.get("EF-2"), /^CFM$/i)), truth.expected.ef_2_cfm.value);
  assert.equal(Number(cellText(fanByKey.get("EF-5"), /^CFM$/i)), truth.expected.ef_5_cfm.value);

  const ef1 = await session.sweepScheduleRow("EF-1", { evaluationFast: true });
  assert.equal(ef1.found, 1, "EF-1 must remain tagged on a plan sheet");
  const ef5 = await session.sweepScheduleRow("EF-5", { evaluationFast: true });
  assert.equal(ef5.found, 1, "EF-5 must remain tagged on a plan sheet");
  let ef2Refused = false;
  try {
    const ef2 = await session.sweepScheduleRow("EF-2", { evaluationFast: true });
    ef2Refused = ef2.found === 0
      || /refus|cannot be geometrically anchored/i.test(JSON.stringify(ef2));
  } catch (error) {
    ef2Refused = /refus|cannot be geometrically anchored/i.test(String(error?.message || error));
  }
  assert.ok(ef2Refused, "EF-2 must honestly refuse plan geometric anchoring when no plan tag exists");
  assert.equal(truth.expected.ef_2_plan_status.value, "refused");
  assert.equal(Number(cellText(fanByKey.get("EF-3"), /^CFM$/i)), truth.follow_up.expected.ef_3_cfm);
  let ef3Refused = false;
  try {
    const ef3 = await session.sweepScheduleRow("EF-3", { evaluationFast: true });
    ef3Refused = ef3.found === 0
      || /refus|cannot be geometrically anchored/i.test(JSON.stringify(ef3));
  } catch (error) {
    ef3Refused = /refus|cannot be geometrically anchored/i.test(String(error?.message || error));
  }
  assert.ok(ef3Refused, "EF-3 follow-up must refuse plan anchoring");
  assert.equal(truth.follow_up.expected.ef_3_plan_status, "refused");
});
