import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D02-ahu-bas-point-to-location");

test("D02 production engine preserves the pinned AHU BAS point-to-location evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(DEMO, "fixture.json"), "utf8"));
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`D02 real fixture is required at ${source}; see ${resolve(DEMO, "fixture.json")}`, {
      cause: error,
    });
  });
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();

  const points = graph.tables.find((candidate) =>
    candidate.sheet.endsWith("#65")
    && candidate.title?.text === "POINTS LIST AHU-T1A/TIB");
  const ahu = graph.tables.find((candidate) =>
    candidate.sheet.endsWith("#48")
    && candidate.title?.text === "AIR HANDLING UNIT SCHEDULE");
  assert.ok(points, "D02 AHU points list must remain extractable on MI731");
  assert.ok(ahu, "D02 air-handling schedule must remain extractable on M-621");

  const ai10 = points.rows.find((row) => row.key === "AI10");
  assert.ok(ai10, "AI10 row must remain queryable");
  assert.equal(
    ai10.cells["DESCRIPTION ANALOG INPUT"]?.text
      || ai10.cells["DESCRIPTION"]?.text,
    "AHU-T1A HW VALVE POSITION (FEEDBACK)",
  );
  assert.equal(ai10.cells.ALARM?.text, "No");
  assert.equal(ai10.cells.TREND?.text, "No");

  const ahuRow = ahu.rows.find((row) => row.key === "AHU-T1A");
  assert.ok(ahuRow, "AHU-T1A row must remain queryable");
  assert.equal(ahuRow.cells.LOCATION?.text, "11TH FLOOR MECHANICAL");
  assert.equal(ahuRow.cells["FAN DATA S.A. CFM (MAX)"]?.text, "3850");

  const section = session.findText("navfac-cherry-point-atc-mechanical.pdf#28", "AHU-T1A / AHU-T1B SECTION");
  assert.equal(section.count, 1);
  assert.deepEqual(section.hits[0].bbox, truth.expected.physical_section.citation.bbox_px);

  const narrative = session.findText("navfac-cherry-point-atc-mechanical.pdf#2", "control cab");
  assert.ok(narrative.count >= 1);
  assert.ok(narrative.hits.some((hit) => hit.str.includes(truth.expected.serves.value)));
});
