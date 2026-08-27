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
  assert.deepEqual(AGENT_VERIFIERS.map((v) => v.tool), ["trace_connectivity", "count_marks"]);
});
