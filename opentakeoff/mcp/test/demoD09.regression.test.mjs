import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFixtureGraph } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D09-room-hvac-coordination");

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

test("D09 production engine preserves room HVAC coordination evidence", async () => {
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const { graph } = await loadFixtureGraph(CORPUS, DEMO);

  const finish = graph.tables.find((table) =>
    /ROOM FINISH SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(finish, "ROOM FINISH SCHEDULE must remain extractable");
  const room105 = (finish.rows || []).find((row) =>
    String(row.key || "").trim() === "105");
  assert.ok(room105, "room 105 must remain on the finish schedule");
  assert.equal(cellText(room105, /^ROOM$/i), truth.expected.room_105_name.value);
  assert.equal(cellText(room105, /^FLOOR$/i), truth.expected.room_105_floor.value);
  assert.equal(cellText(room105, /^NUMBER$/i), truth.expected.room_105_number.value);

  const room101 = (finish.rows || []).find((row) =>
    String(row.key || "").trim() === "101");
  assert.ok(room101, "room 101 must remain for follow-up");
  assert.equal(cellText(room101, /^ROOM$/i), truth.follow_up.expected.room_101_name);

  const grille = graph.tables.find((table) =>
    /DIFFUSER-GRILLE SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(grille, "DIFFUSER-GRILLE SCHEDULE must remain extractable");
  const byKey = new Map((grille.rows || []).map((row) => [
    String(row.key || "").toUpperCase().replace(/\s+/g, ""),
    row,
  ]));
  for (const tag of ["CD-1", "RG-1", "EG-1"]) {
    const row = byKey.get(tag);
    assert.ok(row, `${tag} must remain on the diffuser-grille schedule`);
    const stem = tag.toLowerCase().replace(/-/g, "_");
    assert.equal(cellText(row, /^SERVICE$/i), truth.expected[`${stem}_service`].value);
    assert.equal(cellText(row, /MANUFACTURER/i), truth.expected[`${stem}_manufacturer`].value);
    assert.equal(cellText(row, /^MODEL$/i), truth.expected[`${stem}_model`].value);
  }

  const rooftop = graph.tables.find((table) =>
    /PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(rooftop, "packaged rooftop schedule must remain extractable");
  const rtu1 = (rooftop.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "RTU-1");
  assert.ok(rtu1, "RTU-1 must remain on the packaged rooftop schedule");
  assert.equal(cellText(rtu1, /^SERVICE$/i), truth.expected.rtu_1_service.value);
  assert.equal(Number(cellText(rtu1, /SUPPLY AIR.*CFM/i)), truth.expected.rtu_1_cfm.value);

  const rtu2 = (rooftop.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "RTU-2");
  assert.ok(rtu2, "RTU-2 must remain for BUILDING SOUTH follow-up");
  assert.match(cellText(rtu2, /^SERVICE$/i), /BUILDING SOUTH/i);
  assert.equal(Number(cellText(rtu2, /SUPPLY AIR.*CFM/i)), truth.follow_up.expected.rtu_2_cfm);
});
