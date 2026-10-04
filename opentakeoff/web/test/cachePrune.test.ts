// The server's upload spool kept every PDF ever uploaded (#333): one nobody
// has sent for a month goes; a recent one, and any other file, stays.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneUploadSpool } from "../vite.corpusTakeoffApi.js";

test("uploads nobody has sent for a month leave the spool; recent ones and other files stay", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ot-spool-"));
  try {
    const stale = `${"a".repeat(64)}.pdf`;
    const recent = `${"b".repeat(64)}.pdf`;
    const other = "notes.txt";
    await writeFile(join(dir, stale), "x".repeat(1000));
    await writeFile(join(dir, recent), "y".repeat(10));
    await writeFile(join(dir, other), "z");
    const longAgo = new Date(Date.now() - 40 * 86_400_000);
    await utimes(join(dir, stale), longAgo, longAgo);
    await utimes(join(dir, other), longAgo, longAgo);
    assert.deepEqual(await pruneUploadSpool({ dir }), { removed: 1, freedBytes: 1000 });
    assert.deepEqual((await readdir(dir)).sort(), [recent, other].sort());
    // Nothing more to drop on a second pass.
    assert.deepEqual(await pruneUploadSpool({ dir }), { removed: 0, freedBytes: 0 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
