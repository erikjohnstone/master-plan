import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cachedEvalResult } from "../scripts/evalCache.mjs";

test("eval cache invalidates only the changed set identity or input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "opentakeoff-eval-cache-test-"));
  try {
    const input = join(dir, "set-a.key.csv");
    const unrelated = join(dir, "set-b.key.csv");
    await writeFile(input, "tag,expected\nA,1\n");
    await writeFile(unrelated, "tag,expected\nB,1\n");
    const namespace = `test:${randomUUID()}`;
    let computes = 0;
    const compute = async () => ({ generation: ++computes });

    assert.deepEqual(await cachedEvalResult(namespace, [input], ["set-a"], compute), { generation: 1 });
    assert.deepEqual(await cachedEvalResult(namespace, [input], ["set-a"], compute), { generation: 1 });

    await writeFile(unrelated, "tag,expected\nB,2\n");
    assert.deepEqual(
      await cachedEvalResult(namespace, [input], ["set-a"], compute),
      { generation: 1 },
      "adding or changing another set does not invalidate this set",
    );

    assert.deepEqual(await cachedEvalResult(namespace, [input], ["set-a-v2"], compute), { generation: 2 });
    await writeFile(input, "tag,expected\nA,2\n");
    assert.deepEqual(await cachedEvalResult(namespace, [input], ["set-a"], compute), { generation: 3 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
