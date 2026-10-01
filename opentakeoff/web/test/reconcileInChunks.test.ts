// AS-117: past the production run's post-index limit, the canvas reconciles a
// family as several calls of the shared reconcile (MCP's reconcile_schedule_plan
// on the Session), never with canvas-side sweeps of its own; the bridge carries
// a caller's sweep-every-row choice only when one was made. The rows equal the
// one call's on a real fixture in mcp/test/planToolParity.test.mjs; these pin
// the chunking itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { reconcileFamilyInChunks, summarizeReconcile } from "../src/lib/schedulePlanReconcile.mjs";
import { optionalFlag } from "../vite.corpusTakeoffApi.js";

type Row = { row_id: string; tag: string; status: string; swept: boolean };
const TAGS = ["A-1", "B-2", "C-3", "D-4", "E-5"];

// A family reconcile as reconcileSchedulePlan reads its options: every row
// swept unless the caller opts out, only the caller's tags when it names some.
function family(tags = TAGS, rowsOf = (t: string) => [t]) {
  const calls: Array<{ tags?: string[]; familySweepAll?: boolean }> = [];
  const run = async (o: { tags?: string[]; familySweepAll?: boolean } = {}) => {
    calls.push(o);
    const only = o.tags?.length ? new Set(o.tags.map((t) => t.toUpperCase())) : null;
    const sweepAll = !only && o.familySweepAll !== false;
    const rows: Row[] = tags.flatMap((tag) => rowsOf(tag).map((id) => {
      const swept = only ? only.has(tag) : sweepAll;
      return { row_id: id, tag, status: swept ? "MATCH" : "SCHEDULE_ONLY", swept };
    }));
    return { rows, summary: summarizeReconcile(rows), family_filter: "VAV", unscheduled_tags: ["X-9"] };
  };
  return { run, calls };
}

test("AS-117: a family reconciled in tag chunks reads the one call's rows", async () => {
  const { run, calls } = family();
  const one = await run({});
  calls.length = 0;
  const chunked = await reconcileFamilyInChunks(run, { chunkSize: 2 });
  assert.deepEqual(chunked.rows, one.rows);
  assert.deepEqual(chunked.summary, one.summary);
  assert.deepEqual(chunked.unscheduled_tags, ["X-9"]);
  // The family's rows unswept first, then each tag once, at most two a call.
  assert.deepEqual(calls, [{ familySweepAll: false }, { tags: ["A-1", "B-2"] }, { tags: ["C-3", "D-4"] }, { tags: ["E-5"] }]);
});

test("AS-117: a chunk that fails is split; a tag that fails alone is a plan search that did not finish", async () => {
  const { run, calls } = family();
  const limited = async (o: { tags?: string[]; familySweepAll?: boolean }) => {
    if ((o.tags?.length ?? 0) > 1) return { error: "Automatic takeoff exceeded the 180-second post-index limit" };
    if (o.tags?.[0] === "C-3") throw new Error("HTTP 500");
    return run(o);
  };
  const chunked = await reconcileFamilyInChunks(limited, { chunkSize: 4 });
  assert.deepEqual(chunked.rows.map((r: Row) => [r.tag, r.status]),
    [["A-1", "MATCH"], ["B-2", "MATCH"], ["C-3", "AMBIGUOUS"], ["D-4", "MATCH"], ["E-5", "MATCH"]]);
  const c3 = chunked.rows[2];
  assert.equal(c3.swept, false);
  assert.equal(c3.plan_search_complete, false);
  assert.match(c3.reason, /plan search for C-3 did not finish \(HTTP 500\)/);
  assert.equal(chunked.summary.ambiguous, 1);
  assert.equal(chunked.summary.match, 4);
  // Every tag was swept by a call of one tag at the end.
  assert.deepEqual(calls.slice(1).map((c) => c.tags), [["A-1"], ["B-2"], ["D-4"], ["E-5"]]);
});

test("AS-117: a caller's tags and a caller's opt-out read as the one call does", async () => {
  const { run, calls } = family();
  const scoped = await reconcileFamilyInChunks(run, { tags: ["c-3", "A-1", "Z-0"], chunkSize: 1 });
  assert.deepEqual(scoped.rows, (await run({ tags: ["C-3", "A-1"] })).rows);
  calls.length = 0;
  const unswept = await reconcileFamilyInChunks(run, { familySweepAll: false });
  assert.deepEqual(unswept.rows, (await run({ familySweepAll: false })).rows);
  assert.equal(calls.length, 2, "an opt-out reads the scaffold and sweeps nothing");
});

test("AS-117: a mark listed in two tables is swept once and both rows take it", async () => {
  const { run, calls } = family(["A-1", "B-2"], (t) => (t === "A-1" ? ["A-1@M1", "A-1@M2"] : [t]));
  const chunked = await reconcileFamilyInChunks(run, { chunkSize: 1 });
  assert.deepEqual(chunked.rows.map((r: Row) => [r.row_id, r.status]), [["A-1@M1", "MATCH"], ["A-1@M2", "MATCH"], ["B-2", "MATCH"]]);
  assert.deepEqual(calls.slice(1).map((c) => c.tags), [["A-1"], ["B-2"]]);
});

test("AS-117: a scaffold that cannot be read is the answer, not an empty family", async () => {
  const failed = await reconcileFamilyInChunks(async () => ({ error: "No PDF loaded." }));
  assert.deepEqual(failed, { error: "No PDF loaded." });
  const nothing = await reconcileFamilyInChunks(async () => null);
  assert.match(nothing.error, /no rows/);
});

test("AS-117: the production bridge carries a sweep-every-row choice only when one was made", () => {
  assert.equal(optionalFlag("1"), true);
  assert.equal(optionalFlag("true"), true);
  assert.equal(optionalFlag(true), true);
  assert.equal(optionalFlag("0"), false);
  assert.equal(optionalFlag("false"), false);
  assert.equal(optionalFlag(false), false);
  for (const unset of [undefined, null, "", "yes"]) assert.equal(optionalFlag(unset), undefined);
});

// The canvas is a React component no web test can execute (the precedent is
// resolutionInvariance.test.ts's F3 guard); what is checkable is that each of
// its reconcile paths hands the caller's choice to the shared reconcile.
test("AS-117: the canvas's reconcile paths pass the caller's options to the shared reconcile", () => {
  const text = readFileSync(fileURLToPath(new URL("../src/pages/TakeoffCanvas.jsx", import.meta.url)), "utf8");
  const start = text.indexOf("async function agentReconcileSchedulePlan");
  assert.ok(start >= 0, "agentReconcileSchedulePlan not found: re-point this guard");
  const fn = text.slice(start, text.indexOf("\n  }\n", start));
  assert.doesNotMatch(fn, /family_sweep_all:\s*opts\.familySweepAll === true/, "MCP's default is every row");
  assert.match(fn, /typeof opts\.familySweepAll === "boolean" \? \{ family_sweep_all: opts\.familySweepAll \}/);
  assert.match(fn, /reconcileFamilyInChunks\(familyChunk,/, "past the limit: the shared reconcile in chunks");
  assert.doesNotMatch(text, /reconcileScheduleFamilyWithSweeps\(/, "no canvas-side sweep loop");
  const fetcher = text.slice(text.indexOf("async function fetchProductionReconcileSchedulePlan"));
  assert.match(fetcher.slice(0, 600), /typeof opts\.familySweepAll === "boolean"\) fields\.familySweepAll = opts\.familySweepAll \? "1" : "0"/);
});
