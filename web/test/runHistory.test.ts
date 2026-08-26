// Persistent Agent run history (maturity plan Phase 2, #HVAC-runhistory):
// runHistory.js's own record shape/persistence primitives, plus
// metaListPrefix (store.js) — the read-side mirror of metaDeletePrefix this
// module needed and didn't have. Runs on fake-indexeddb, same isolation
// discipline as store.test.ts: a fresh database per test.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { metaPut, metaListPrefix } from "../src/lib/store.js";
import { newRun, newRunId, saveRun, loadRun, listRuns, sanitizeToolResult } from "../src/lib/runHistory.js";

beforeEach(() => {
  (globalThis as any).indexedDB = new IDBFactory();
});

test("metaListPrefix: returns every key/value starting with the prefix, and only those", async () => {
  await metaPut("run:v1:a", { n: 1 });
  await metaPut("run:v1:b", { n: 2 });
  await metaPut("thumb:v2:run:v1:not-a-run", { n: 99 }); // a DIFFERENT namespace that happens to CONTAIN the string — must not match
  await metaPut("other:key", { n: 3 });

  const rows = await metaListPrefix("run:v1:");
  assert.equal(rows.length, 2);
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  assert.deepEqual(byKey["run:v1:a"], { n: 1 });
  assert.deepEqual(byKey["run:v1:b"], { n: 2 });
});

test("metaListPrefix: empty prefix and no-match prefix both return []", async () => {
  await metaPut("run:v1:a", { n: 1 });
  assert.deepEqual(await metaListPrefix(""), []);
  assert.deepEqual(await metaListPrefix("nope:"), []);
});

test("newRun: fresh shape — running status, empty tool_calls, distinct ids across calls", () => {
  const a = newRun("count the diffusers");
  const b = newRun("count the diffusers");
  assert.equal(a.goal_text, "count the diffusers");
  assert.equal(a.status, "running");
  assert.equal(a.finished_at, null);
  assert.deepEqual(a.tool_calls, []);
  assert.notEqual(a.id, b.id, "two runs never share an id");
  assert.notEqual(newRunId(), newRunId());
});

test("saveRun/loadRun: round-trips a run record verbatim, including a mutated tool_calls array", async () => {
  const run = newRun("find all the valves");
  run.tool_calls.push({ type: "tool_start", name: "sheet_graph", args: {}, ts: 1000 });
  run.tool_calls.push({ type: "tool_end", name: "sheet_graph", result: { available: true }, ts: 1050 });
  run.status = "done";
  run.finished_at = 2000;
  run.outcome_summary = "Done — review the dashed proposals.";
  await saveRun(run);

  const loaded = await loadRun(run.id);
  assert.deepEqual(loaded, run);
});

test("loadRun: a never-saved id reads back null, not undefined or a throw", async () => {
  assert.equal(await loadRun("nonexistent-id"), null);
});

test("listRuns: most-recent-first, across multiple saved runs", async () => {
  const older = newRun("older goal");
  older.started_at = 1000;
  const newer = newRun("newer goal");
  newer.started_at = 2000;
  const newest = newRun("newest goal");
  newest.started_at = 3000;
  // save out of order — listRuns must sort by started_at, not insertion order
  await saveRun(newer);
  await saveRun(newest);
  await saveRun(older);

  const list = await listRuns();
  assert.deepEqual(list.map((r) => r.goal_text), ["newest goal", "newer goal", "older goal"]);
});

test("listRuns: no persisted runs reads back [], not a throw", async () => {
  assert.deepEqual(await listRuns(), []);
});

test("sanitizeToolResult: strips image_data_url, keeps every other field at full fidelity", () => {
  const withImage = { width: 512, height: 384, image_data_url: "data:image/png;base64,AAAA...", note: "a real region" };
  const cleaned = sanitizeToolResult(withImage);
  assert.deepEqual(cleaned, { width: 512, height: 384, note: "a real region" });
  assert.ok(!("image_data_url" in cleaned));

  // no image_data_url field at all — passed through unchanged (same object,
  // not defensively cloned — callers rely on this for cheap no-op results)
  const noImage = { matches: [1, 2, 3], complete: true };
  assert.equal(sanitizeToolResult(noImage), noImage);

  // non-object results (a bare error string, null) pass through untouched
  assert.equal(sanitizeToolResult(null), null);
  assert.equal(sanitizeToolResult("plain string"), "plain string");
});
