import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFixtureSession } from "./helpers/loadFixtureGraph.mjs";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D06-control-valve-takeoff");

function cellText(row, headerRe) {
  for (const [header, cell] of Object.entries(row.cells || {})) {
    if (headerRe.test(header)) return String(cell?.text || "").trim();
  }
  return "";
}

test("D06 production engine preserves CV/BCV schedule + tagged plan sweep evidence", async () => {
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const { graph, session } = await loadFixtureSession(CORPUS, DEMO);

  const cv = graph.tables.find((table) =>
    /CONTROL VALVE SCHEDULE/i.test(table.title?.text || "")
    && !/BYPASS/i.test(table.title?.text || ""));
  assert.ok(cv, "CONTROL VALVE SCHEDULE must remain extractable");
  assert.equal((cv.rows || []).length, truth.expected.cv_schedule_count.value);

  const cv1 = (cv.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "CV-1");
  assert.ok(cv1, "CV-1 must remain on the control valve schedule");
  assert.equal(Number(cellText(cv1, /FLOW|GPM/i)), truth.expected.cv_1_gpm.value);
  const normSize = (s) => String(s || "").replace(/["″]/g, '"').trim();
  assert.equal(normSize(cellText(cv1, /^SIZE$/i) || cellText(cv1, /SIZE/i)),
    normSize(truth.expected.cv_1_size.value));
  const coil1 = Object.values(cv1.cells || {}).map((c) => c?.text || "").join(" ");
  assert.match(coil1, /HC-1/i);

  const cv5 = (cv.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "CV-5");
  assert.equal(Number(cellText(cv5, /FLOW|GPM/i)), truth.expected.cv_5_gpm.value);

  const cv9 = (cv.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "CV-9");
  assert.equal(Number(cellText(cv9, /FLOW|GPM/i)), truth.expected.cv_9_gpm.value);

  const bcv = graph.tables.find((table) =>
    /BYPASS CONTROL VALVE SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(bcv, "BYPASS CONTROL VALVE SCHEDULE must remain extractable");
  assert.equal((bcv.rows || []).length, truth.expected.bcv_schedule_count.value);
  const bcv1 = (bcv.rows || []).find((row) =>
    String(row.key || "").toUpperCase().replace(/\s+/g, "") === "BCV-1");
  assert.ok(bcv1, "BCV-1 must remain on the bypass schedule");
  assert.equal(Number(cellText(bcv1, /FLOW|GPM/i)), truth.expected.bcv_1_gpm.value);

  for (const tag of ["CV-1", "CV-5", "CV-9", "BCV-1"]) {
    const sweep = await session.sweepScheduleRow(tag, { commit: false, evaluationFast: true });
    assert.equal(sweep.found, 1, `${tag} tagged plan sweep must find exactly one install`);
    assert.ok(Array.isArray(sweep.tag_citations) && sweep.tag_citations.length === 1,
      `${tag} must expose one tag_citation`);
  }
});
