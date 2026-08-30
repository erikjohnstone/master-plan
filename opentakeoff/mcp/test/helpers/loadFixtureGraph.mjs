/**
 * Load a demo/takeoff fixture's SheetGraph via content-addressed cache.
 * Verifies PDF sha256 against fixture.json, then returns the production
 * graph (Session + ODL) — cached across demos that share the same PDF.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Session } from "../../src/session.ts";
import { cachedSheetGraph } from "../../scripts/sheetGraphCache.mjs";

async function readFixture(corpusRoot, fixtureDir) {
  const fixture = JSON.parse(await readFile(resolve(fixtureDir, "fixture.json"), "utf8"));
  const source = resolve(corpusRoot, fixture.source_file);
  const pdf = await readFile(source).catch((error) => {
    throw new Error(`Fixture PDF required at ${source}; see ${resolve(fixtureDir, "fixture.json")}`, {
      cause: error,
    });
  });
  const sha = createHash("sha256").update(pdf).digest("hex");
  assert.equal(sha, fixture.sha256, `PDF sha256 mismatch for ${fixture.source_file}`);
  return { fixture, source };
}

async function computeGraph(source, fixture) {
  return cachedSheetGraph(source, {
    expectedSha256: fixture.sha256,
    identity: [fixture.set_id || "", "graphForPipeline"],
    compute: async () => {
      const session = new Session();
      await session.loadPlan(source);
      return session.graphForPipeline();
    },
  });
}

/**
 * @param {string} corpusRoot
 * @param {string} fixtureDir absolute path to demos/Dxx-… or takeoffs/T-…
 */
export async function loadFixtureGraph(corpusRoot, fixtureDir) {
  const { fixture, source } = await readFixture(corpusRoot, fixtureDir);
  const graph = await computeGraph(source, fixture);
  return { fixture, source, graph };
}

/** Graph + Session with seeded pipeline graph (for gate verification). */
export async function loadFixtureSession(corpusRoot, fixtureDir) {
  const { fixture, source, graph } = await loadFixtureGraph(corpusRoot, fixtureDir);
  const session = new Session();
  await session.loadPlan(source);
  session.seedPipelineGraph(graph);
  return { fixture, source, graph, session };
}
