import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D05-rtu-mech-to-electrical");

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

test("D05 production engine preserves RTU mech↔elec join evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(DEMO, "fixture.json"), "utf8"));
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`D05 real fixture is required at ${source}; see ${resolve(DEMO, "fixture.json")}`, {
      cause: error,
    });
  });
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();

  const rooftop = graph.tables.find((table) =>
    /PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(rooftop, "packaged rooftop schedule must remain extractable");
  const rtu1 = (rooftop.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "RTU-1");
  assert.ok(rtu1, "RTU-1 must remain on the packaged rooftop schedule");
  assert.equal(cellText(rtu1, /^SERVICE$/i), truth.expected.rtu_1_service.value);
  assert.equal(cellText(rtu1, /^MANUFACTURER$/i), truth.expected.rtu_1_manufacturer.value);
  assert.equal(cellText(rtu1, /^MODEL$/i), truth.expected.rtu_1_model.value);
  assert.equal(Number(cellText(rtu1, /NOMINAL CAP/i)), truth.expected.rtu_1_nominal_tons.value);
  assert.equal(Number(cellText(rtu1, /SUPPLY AIR.*CFM/i)), truth.expected.rtu_1_supply_cfm.value);
  assert.equal(Number(cellText(rtu1, /MIN OUTSIDE AIR/i)), truth.expected.rtu_1_min_oa_cfm.value);

  // Snapped paint boxes must OCR/vector-ground on the horizontal data row.
  const supplyBox = rtu1.cells["SUPPLY AIR (CFM)"]?.bbox;
  assert.ok(Array.isArray(supplyBox) && supplyBox[2] - supplyBox[0] > supplyBox[3] - supplyBox[1],
    "supply CFM cite box should be a horizontal glyph span after ODL snap");

  const connection = graph.tables.find((table) =>
    /MECHANICAL EQUIPMENT CONNECTION SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(connection, "mechanical equipment connection schedule must remain extractable");
  const keys = new Set((connection.rows || []).map((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "")));
  assert.ok(keys.has("RTU-01"), "connection schedule must keep zero-padded RTU-01");
  assert.ok(keys.has("RTU-02"), "connection schedule must keep zero-padded RTU-02");
  assert.ok(!keys.has("RTU-1"), "unpadded RTU-1 must not appear as a connection-schedule key");

  const rtu01 = (connection.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "RTU-01");
  assert.equal(Number(cellText(rtu01, /^VA$/i)), truth.expected.rtu_01_va.value);
  assert.equal(Number(cellText(rtu01, /^MCA$/i)), truth.expected.rtu_01_mca.value);
  assert.equal(cellText(rtu01, /^MOCP$/i), truth.expected.rtu_01_mocp.value);
  assert.equal(Number(cellText(rtu01, /^VOLTAGE$/i)), truth.expected.rtu_01_voltage.value);
  assert.equal(Number(cellText(rtu01, /^PHASES$/i)), truth.expected.rtu_01_phases.value);
  assert.equal(cellText(rtu01, /CIRCUIT/i), truth.expected.rtu_01_circuit.value);

  const planHits = session.findText("baker-county-eoc-bidset.pdf#39", "RTU-1", { limit: 20 });
  assert.ok((planHits?.hits || []).some((hit) => hit.str.trim() === "RTU-1"),
    "roof plan #39 must keep an exact RTU-1 label");
});
