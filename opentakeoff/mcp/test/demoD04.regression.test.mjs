import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Session } from "../src/session.ts";

const CORPUS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../opentakeoff-corpus");
const DEMO = resolve(CORPUS, "demos/D04-vav-scope-rollup");

function uniqueFamilyKeys(tables, titleRe, keyRe) {
  const keys = new Set();
  for (const table of tables) {
    const title = String(table.title?.text || "");
    if (!titleRe.test(title)) continue;
    for (const row of table.rows || []) {
      const key = String(row.key || "").trim();
      if (!keyRe.test(key)) continue;
      keys.add(key.toUpperCase().replace(/\s+/g, ""));
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

test("D04 production engine preserves pinned VAV scope-rollup evidence", async () => {
  const fixture = JSON.parse(await readFile(resolve(DEMO, "fixture.json"), "utf8"));
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const source = resolve(CORPUS, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`D04 real fixture is required at ${source}; see ${resolve(DEMO, "fixture.json")}`, {
      cause: error,
    });
  });
  assert.equal(createHash("sha256").update(pdf).digest("hex"), fixture.sha256);

  const session = new Session();
  await session.loadPlan(source);
  const graph = await session.graphForPipeline();

  const vavs = uniqueFamilyKeys(
    graph.tables,
    /VOLUME CONTROL BOX|VARIABLE AIR VOLUME/i,
    /^VAV[\s\-]/i,
  );
  assert.equal(vavs.size, truth.expected.vav_count.value);
  assert.ok(![...vavs].some((k) => /SUITE/.test(k)), "SUITE100 must stay excluded from VAV family keys");

  const schedule = graph.tables.find((table) =>
    /VOLUME CONTROL BOX SCHEDULE/i.test(table.title?.text || ""));
  assert.ok(schedule, "VOLUME CONTROL BOX SCHEDULE must remain extractable");

  const byKey = new Map((schedule.rows || []).map((row) => [
    String(row.key || "").toUpperCase().replace(/\s+/g, ""),
    row,
  ]));
  const suite = byKey.get("SUITE100");
  assert.ok(suite, "SUITE100 junk remarks row must still exist on the schedule table");
  assert.ok(!/^VAV[\s\-]/i.test(String(suite.key || "")), "SUITE100 must not match the VAV family pattern");

  for (const tag of ["VAV-1", "VAV-12", "VAV-30", "VAV-58"]) {
    const row = byKey.get(tag.toUpperCase());
    assert.ok(row, `${tag} must remain on the volume control box schedule`);
    const stem = tag.toLowerCase().replace(/-/g, "_");
    assert.equal(Number(cellText(row, /^CFM$/i)), truth.expected[`${stem}_cfm`].value);
    assert.equal(Number(cellText(row, /^EAT\s*CFM$/i)), truth.expected[`${stem}_eat_cfm`].value);
    assert.ok(Math.abs(Number(cellText(row, /^GPM$/i)) - truth.expected[`${stem}_gpm`].value) <= 0.05);
    assert.equal(cellText(row, /MANUFACTURER/i).toUpperCase(), truth.expected[`${stem}_manufacturer`].value);
    assert.equal(cellText(row, /^MODEL$/i).toUpperCase(), truth.expected[`${stem}_model`].value);
  }
});
