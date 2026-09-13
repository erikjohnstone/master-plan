import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { loadFixtureGraph } from "./helpers/loadFixtureGraph.mjs";

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
  const truth = JSON.parse(await readFile(resolve(DEMO, "truth.json"), "utf8"));
  const { graph } = await loadFixtureGraph(CORPUS, DEMO);

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
  // Source-page visual review confirms SUITE 100 is the architect's address
  // in the title block, not a schedule row or remark. The old fixture pinned
  // that extraction artifact merely to prove it was excluded from the VAV
  // count; the stronger production invariant is that it never enters the
  // table at all.
  assert.ok(!byKey.has("SUITE100"), "title-block SUITE 100 must not become a schedule row");

  for (const tag of ["VAV-1", "VAV-12", "VAV-30", "VAV-58"]) {
    const row = byKey.get(tag.toUpperCase());
    assert.ok(row, `${tag} must remain on the volume control box schedule`);
    const stem = tag.toLowerCase().replace(/-/g, "_");
    // Preserve the complete authored multi-tier headers. Older cached graphs
    // flattened these to CFM / EAT CFM / GPM; the source table actually says
    // MINIMUM AIR FLOW CFM, MAXIMUM AIR FLOW CFM, and FLOW (GPM).
    assert.equal(Number(cellText(row, /MINIMUM AIR FLOW CFM$/i)), truth.expected[`${stem}_cfm`].value);
    assert.equal(Number(cellText(row, /MAXIMUM AIR FLOW CFM$/i)), truth.expected[`${stem}_eat_cfm`].value);
    assert.ok(Math.abs(Number(cellText(row, /FLOW \(GPM\)$/i)) - truth.expected[`${stem}_gpm`].value) <= 0.05);
    assert.equal(cellText(row, /MANUFACTURER/i).toUpperCase(), truth.expected[`${stem}_manufacturer`].value);
    assert.equal(cellText(row, /^MODEL$/i).toUpperCase(), truth.expected[`${stem}_model`].value);
  }
});
