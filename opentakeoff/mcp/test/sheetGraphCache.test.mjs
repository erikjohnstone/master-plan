import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cachedSheetGraph } from "../scripts/sheetGraphCache.mjs";

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
