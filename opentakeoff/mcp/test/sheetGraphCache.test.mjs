import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cachedSheetGraph, engineFailedOnSomeSheet } from "../scripts/sheetGraphCache.mjs";

test("sheet graph cache hits on unchanged PDF identity; misses on sha change", async () => {
  const prev = process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
  delete process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
  const dir = await mkdtemp(join(tmpdir(), "ot-graph-cache-"));
  try {
    const pdf = join(dir, "plan.pdf");
    await writeFile(pdf, "%PDF-fake-a");
    const shaA = createHash("sha256").update("%PDF-fake-a").digest("hex");
    let computes = 0;
    const compute = async () => ({ generation: ++computes, tables: [] });

    const a1 = await cachedSheetGraph(pdf, { expectedSha256: shaA, identity: ["t"], compute });
    const a2 = await cachedSheetGraph(pdf, { expectedSha256: shaA, identity: ["t"], compute });
    assert.deepEqual(a1, { generation: 1, tables: [] });
    assert.deepEqual(a2, { generation: 1, tables: [] });

    const shaB = createHash("sha256").update("%PDF-fake-b").digest("hex");
    const b = await cachedSheetGraph(pdf, { expectedSha256: shaB, identity: ["t"], compute });
    assert.deepEqual(b, { generation: 2, tables: [] });
  } finally {
    if (prev === undefined) delete process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
    else process.env.OPENTAKEOFF_GRAPH_NO_CACHE = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

test("SAME BYTES UNDER A DIFFERENT NAME GET THEIR OWN GRAPH", async () => {
  // Every sheet key in a SheetGraph is `<basename>#<page>`, so a graph built
  // from one name describes sheets that exist only under that name. The key
  // was bytes-only, so a second name for the same bytes was served the first
  // name's graph — and then agentHighlightCitation refused every citation on
  // it with "Sheet ... not found" and the Schedules panel went dead with no
  // error anywhere. Found live: the benchmark collection's
  // 05__vol2__009__….pdf and the corpus's 009_FL_USDA_APHIS_….pdf are
  // byte-identical, and a corpus eval run poisoned the browser's own entry.
  const prev = process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
  delete process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
  const dir = await mkdtemp(join(tmpdir(), "ot-graph-cache-name-"));
  try {
    const bytes = "%PDF-same-bytes-two-names";
    const sha = createHash("sha256").update(bytes).digest("hex");
    const a = join(dir, "05__vol2__009.pdf");
    const b = join(dir, "009_FL_USDA_APHIS.pdf");
    await writeFile(a, bytes);
    await writeFile(b, bytes);

    const graphFor = (p) => async () => ({ sheets: [{ key: `${p.split("/").pop()}#1` }] });
    const ga = await cachedSheetGraph(a, { expectedSha256: sha, compute: graphFor(a) });
    const gb = await cachedSheetGraph(b, { expectedSha256: sha, compute: graphFor(b) });
    assert.equal(ga.sheets[0].key, "05__vol2__009.pdf#1");
    assert.equal(gb.sheets[0].key, "009_FL_USDA_APHIS.pdf#1", "the second name must NOT be served the first name's sheet keys");

    // and each name still caches for itself
    let extra = 0;
    const again = await cachedSheetGraph(a, { expectedSha256: sha, compute: async () => { extra++; return { sheets: [] }; } });
    assert.equal(extra, 0, "the first name is still a cache hit");
    assert.equal(again.sheets[0].key, "05__vol2__009.pdf#1");

    // a merged set's OTHER files name sheets too, so they are part of the key
    let merged = 0;
    const m1 = await cachedSheetGraph(a, { expectedSha256: sha, identity: ["x"], names: ["vol2.pdf"], compute: async () => { merged++; return { tag: "vol2" }; } });
    const m2 = await cachedSheetGraph(a, { expectedSha256: sha, identity: ["x"], names: ["vol3.pdf"], compute: async () => { merged++; return { tag: "vol3" }; } });
    assert.equal(m1.tag, "vol2");
    assert.equal(m2.tag, "vol3");
    assert.equal(merged, 2);
  } finally {
    if (prev === undefined) delete process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
    else process.env.OPENTAKEOFF_GRAPH_NO_CACHE = prev;
    await rm(dir, { recursive: true, force: true });
  }
});

test("A GRAPH BUILT WHERE THE TABLE ENGINE COULD NOT RUN NEVER ANSWERS A RUN WHERE IT CAN", async () => {
  // Found live: a test run without the sidecar's interpreter (the engine fell
  // back to the system python3, which lacks its modules) cached 015_VA's graph
  // with its guard-booth schedule read by the weaker fallback, under the same
  // key a run with the engine's interpreter would look up.
  const saved = {
    noCache: process.env.OPENTAKEOFF_GRAPH_NO_CACHE,
    vg: process.env.OPENTAKEOFF_VECTORGRID_PYTHON,
    side: process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON,
  };
  delete process.env.OPENTAKEOFF_GRAPH_NO_CACHE;
  delete process.env.OPENTAKEOFF_VECTORGRID_PYTHON;
  delete process.env.OPENTAKEOFF_TABLE_SIDECAR_PYTHON;
  const dir = await mkdtemp(join(tmpdir(), "ot-graph-cache-engine-"));
  const restore = (name, value) => (value === undefined ? delete process.env[name] : (process.env[name] = value));
  try {
    const pdf = join(dir, "plan.pdf");
    const bytes = `%PDF-engine-${Date.now()}`;
    await writeFile(pdf, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const failed = (why) => ({
      vector_pipeline: { vectorgrid: { mode: "on", sheets: 0, refused: 1 }, notes: [`plan.pdf#1: L2 vectorgrid did not run — ${why}`] },
    });
    let computes = 0;
    const engineMissing = async () => ({ ...failed("No module named 'pdfplumber'"), run: ++computes });

    // Unconfigured: the system interpreter's fallback graph is kept under its own key.
    const a = await cachedSheetGraph(pdf, { expectedSha256: sha, compute: engineMissing });
    const b = await cachedSheetGraph(pdf, { expectedSha256: sha, compute: engineMissing });
    assert.equal(a.run, 1);
    assert.equal(b.run, 1, "the default interpreter's graph is served again");

    // Configured: a different key, and a graph whose engine failed is not kept.
    process.env.OPENTAKEOFF_VECTORGRID_PYTHON = "/opt/engine/bin/python";
    const c = await cachedSheetGraph(pdf, { expectedSha256: sha, compute: engineMissing });
    assert.equal(c.run, 2, "the configured interpreter does not see the fallback graph");
    const d = await cachedSheetGraph(pdf, { expectedSha256: sha, compute: engineMissing });
    assert.equal(d.run, 3, "an engine failure is retried, not served from the cache");

    // A refusal that is the page's own is the same on every run, and is kept.
    const geometry = async () => ({ ...failed("viewport transform is not a uniform scale+rotation: [1, 0, 0, 2, 0, 0]"), run: ++computes });
    process.env.OPENTAKEOFF_VECTORGRID_PYTHON = "/opt/engine2/bin/python";
    const e = await cachedSheetGraph(pdf, { expectedSha256: sha, compute: geometry });
    const f = await cachedSheetGraph(pdf, { expectedSha256: sha, compute: geometry });
    assert.equal(f.run, e.run, "a geometry refusal is cached");
    assert.equal(engineFailedOnSomeSheet(failed("vectorgrid sidecar exited (1)")), true);
    assert.equal(engineFailedOnSomeSheet({ vector_pipeline: { vectorgrid: { sheets: 3, refused: 0 }, notes: [] } }), false);
  } finally {
    restore("OPENTAKEOFF_GRAPH_NO_CACHE", saved.noCache);
    restore("OPENTAKEOFF_VECTORGRID_PYTHON", saved.vg);
    restore("OPENTAKEOFF_TABLE_SIDECAR_PYTHON", saved.side);
    await rm(dir, { recursive: true, force: true });
  }
});
