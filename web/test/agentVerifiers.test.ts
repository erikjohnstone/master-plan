// agentVerifiers.js — the generalized per-tool honesty-check registry (see
// the file's own header comment for the real, live-observed reason this
// exists: the connectivity backstop proven live twice, generalized so
// future tools inherit the same guarantee by registering a checker once).
import { test } from "node:test";
import assert from "node:assert/strict";
import { runVerifiers, AGENT_VERIFIERS } from "../src/lib/agentVerifiers.js";

test("runVerifiers: no calls to any registered tool — no notes", () => {
  assert.deepEqual(runVerifiers([]), []);
  assert.deepEqual(runVerifiers([{ id: "1", name: "find_text", args: {}, out: { count: 3 } }]), []);
});

test("trace_connectivity: every call dead_end/refused — a note fires", () => {
  const callLog = [
    { id: "1", name: "trace_connectivity", args: { from_norm: [0.4, 0.3] }, out: { status: "dead_end" } },
    { id: "2", name: "trace_connectivity", args: { from_norm: [0.41, 0.31] }, out: { status: "refused" } },
  ];
  const notes = runVerifiers(callLog);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /every trace_connectivity call in this run returned dead_end or refused/);
});

test("trace_connectivity: a genuine, non-trivial reach — no note", () => {
  const callLog = [
    { id: "1", name: "trace_connectivity", args: { from_norm: [0.4, 0.3] }, out: { status: "dead_end" } },
    {
      id: "2", name: "trace_connectivity", args: { from_norm: [0.4, 0.3] },
      out: { status: "reached", reached_equipment: { id: "EF-1", at: [0.6, 0.5] } }, // real distance from seed
    },
  ];
  assert.deepEqual(runVerifiers(callLog), []);
});

test("trace_connectivity: a TRIVIAL self-reach (target sits right at the seed) still counts as no real connection", () => {
  const callLog = [
    {
      id: "1", name: "trace_connectivity", args: { from_norm: [0.4367, 0.3257] },
      out: { status: "reached", reached_equipment: { id: "HP-1", at: [0.43621, 0.32182] } }, // real observed trivial self-reach shape
    },
  ];
  const notes = runVerifiers(callLog);
  assert.equal(notes.length, 1, "a trivial self-reach must not silently pass as a real connection");
});

test("count_marks: a real count:0 mark — a note fires naming it", () => {
  const callLog = [
    {
      id: "1", name: "count_marks", args: {},
      out: { marks: [{ mark: "RG-1", count: 0, unscheduled: true, occurrences: [], withheld: [{ at: [0.2, 0.5], reason: "bare tag" }] }, { mark: "CD-1", count: 4, occurrences: [1, 2, 3, 4] }] },
    },
  ];
  const notes = runVerifiers(callLog);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /RG-1/);
  assert.ok(!notes[0].includes("CD-1"), "a real, confirmed non-zero count must not be flagged");
});

test("count_marks: every mark has a real confirmed count — no note", () => {
  const callLog = [
    { id: "1", name: "count_marks", args: {}, out: { marks: [{ mark: "EBB-1", count: 4 }] } },
  ];
  assert.deepEqual(runVerifiers(callLog), []);
});

test("both verifiers can fire together in one run, independently", () => {
  const callLog = [
    { id: "1", name: "trace_connectivity", args: { from_norm: [0.1, 0.1] }, out: { status: "dead_end" } },
    { id: "2", name: "count_marks", args: {}, out: { marks: [{ mark: "SR-1", count: 0 }] } },
  ];
  const notes = runVerifiers(callLog);
  assert.equal(notes.length, 2);
});

test("the registry itself declares exactly the tools this session has real evidence for — a deliberate, named list, not a guess", () => {
  assert.deepEqual(AGENT_VERIFIERS.map((v) => v.tool), ["trace_connectivity", "count_marks", "read_schedule"]);
});

// ── read_schedule row-key disclosure ────────────────────────────────────────
// Real, live-observed: asked whether the real AIR COMPRESSOR SCHEDULE
// (exactly one real row, keyed "AC-1") contains a row keyed "SYMBOL" (a real
// COLUMN header on that same table, not a row key), the model answered
// "yes" — conflating the row-key COLUMN's own name with an actual row key.
test("read_schedule: a real table's row keys are always disclosed, distinct from its column headers", () => {
  const callLog = [
    {
      id: "1", name: "read_schedule", args: {},
      out: { table: { headers: ["SYMBOL", "REMARKS"], rows: [{ key: "AC-1", cells: {} }] } },
    },
  ];
  const notes = runVerifiers(callLog);
  assert.equal(notes.length, 1);
  const keyList = notes[0].match(/row keys this run were: ([^.]+)\./)?.[1] ?? "";
  assert.match(keyList, /AC-1/);
  assert.ok(!keyList.includes("SYMBOL"), `the disclosed KEY LIST must never include a column header name as if it were a real row key: ${keyList}`);
});

test("read_schedule: multiple calls/tables merge their real row keys, deduplicated", () => {
  const callLog = [
    { id: "1", name: "read_schedule", args: {}, out: { table: { headers: [], rows: [{ key: "EF-1" }, { key: "EF-2" }] } } },
    { id: "2", name: "read_schedule", args: {}, out: { table: { headers: [], rows: [{ key: "EF-1" }] } } },
  ];
  const notes = runVerifiers(callLog);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /EF-1/);
  assert.match(notes[0], /EF-2/);
  assert.equal((notes[0].match(/EF-1/g) || []).length, 1, "a repeated real key is listed once, not duplicated");
});

test("read_schedule: no rows array on the result (a refusal/no-match shape) — no note, nothing safe to disclose", () => {
  const callLog = [{ id: "1", name: "read_schedule", args: {}, out: { note: "sheet not open" } }];
  assert.deepEqual(runVerifiers(callLog), []);
});

// ── aggregate-completeness gate ─────────────────────────────────────────────
// Real, live-observed: asked for "the total installed cooling capacity for
// the entire building", the model checked exactly ONE piece of equipment
// (correctly grounded, correctly cited) but presented that single value AS
// the building-wide total, with no disclosure it hadn't verified there
// weren't others on any of the set's other real schedule sheets.
const sheetGraphCall = (scheduleSheetKeys: string[]) => ({
  id: "g1", name: "sheet_graph", args: {},
  out: { available: true, sheets: scheduleSheetKeys.map((sheet) => ({ sheet, role: "schedule" })) },
});

test("aggregate completeness: a real 'total for the building' goal, only one of several real schedule sheets checked — a note fires", () => {
  const callLog = [
    sheetGraphCall(["set.pdf#8", "set.pdf#14", "set.pdf#20"]),
    { id: "r1", name: "read_schedule", args: { sheet: "set.pdf#8" }, out: { table: { sheet: "set.pdf#8" } } },
  ];
  const notes = runVerifiers(callLog, "What is the total installed cooling capacity for the entire building?");
  assert.equal(notes.length, 1);
  assert.match(notes[0], /3 real schedule sheets/);
  assert.match(notes[0], /only 1 was queried/);
});

test("aggregate completeness: the same goal, but two+ real schedule sheets genuinely checked — no note", () => {
  const callLog = [
    sheetGraphCall(["set.pdf#8", "set.pdf#14"]),
    { id: "r1", name: "read_schedule", args: { sheet: "set.pdf#8" }, out: {} },
    { id: "r2", name: "read_schedule", args: { sheet: "set.pdf#14" }, out: {} },
  ];
  assert.deepEqual(runVerifiers(callLog, "What is the total cooling capacity for the entire building?"), []);
});

test("aggregate completeness: a non-aggregate goal never triggers the gate, even with a sparse check", () => {
  const callLog = [
    sheetGraphCall(["set.pdf#8", "set.pdf#14", "set.pdf#20"]),
    { id: "r1", name: "read_schedule", args: { sheet: "set.pdf#8" }, out: {} },
  ];
  assert.deepEqual(runVerifiers(callLog, "What is HP-1's real cooling capacity, from the schedule?"), []);
});

test("aggregate completeness: an aggregate goal but sheet_graph was never called — no note (nothing safe to compare against)", () => {
  const callLog = [{ id: "r1", name: "read_schedule", args: { sheet: "set.pdf#8" }, out: {} }];
  assert.deepEqual(runVerifiers(callLog, "What is the total cooling capacity for the entire building?"), []);
});

test("aggregate completeness: only one real schedule sheet exists in the whole set — nothing to miss, no note even with one checked", () => {
  const callLog = [
    sheetGraphCall(["set.pdf#8"]),
    { id: "r1", name: "read_schedule", args: { sheet: "set.pdf#8" }, out: {} },
  ];
  assert.deepEqual(runVerifiers(callLog, "What is the total cooling capacity for the entire building?"), []);
});
