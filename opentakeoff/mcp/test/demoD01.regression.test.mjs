import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D01-chiller-plan-to-controls");

test("D01 production engine preserves the pinned CH-A1 plan-to-controls evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(DEMO, "fixture.json"), "utf8"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`D01 real fixture is required at ${source}; see ${resolve(DEMO, "fixture.json")}`, {
      cause: error,
    });
  });
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();
  const table = (title) => graph.tables.find((candidate) =>
    candidate.sheet.endsWith("#44") && candidate.title?.text === title);
  const chiller = table("AIR COOLED CHILLER SCHEDULE");
  const valves = table("CHW CONTROL VALVE SCHEDULE");
  assert.ok(chiller, "D01 chiller schedule must remain extractable on M-603");
  assert.ok(valves, "D01 CHW valve schedule must remain extractable on M-603");

  const chillerRow = chiller.rows.find((row) => row.key === "CH-A1");
  assert.ok(chillerRow, "CH-A1 row must remain queryable");
  assert.deepEqual(Object.fromEntries([
    "CAPACITY (TONS)",
    "EWT (°F)",
    "LWT (°F)",
    "GPM",
  ].map((header) => [header, chillerRow.cells[header]?.text])), {
    "CAPACITY (TONS)": "56.0",
    "EWT (°F)": "55.4",
    "LWT (°F)": "45",
    "GPM": "128.5",
  });

  const valveRow = valves.rows.find((row) => row.key === "CV-CH-A1");
  assert.ok(valveRow, "CV-CH-A1 row must remain queryable");
  assert.deepEqual(Object.fromEntries([
    "VALVE MARK",
    "FLOWRATE (GPM)",
    "VALVE SIZE (IN)",
    "CONFIGURATION",
    "CV",
  ].map((header) => [header, valveRow.cells[header]?.text])), {
    "VALVE MARK": "CV-CH-A1",
    "FLOWRATE (GPM)": "128.0",
    "VALVE SIZE (IN)": "4",
    "CONFIGURATION": "2-WAY",
    "CV": "324.0",
  });

  const sweep = await session.sweepScheduleRow("CH-A1", { evaluationFast: true });
  assert.equal(sweep.search_scope, "tagged_only");
  assert.equal(sweep.found, 1);
  assert.deepEqual(sweep.tag_citations, [{
    sheet: "navfac-cherry-point-atc-mechanical.pdf#3",
    bbox: { x0: 2531.8, y0: 2498.5, x1: 2591.9, y1: 2523.6 },
  }]);
});
