// Agent tool registry (lib/agentTools.js) — the invariants:
//   - every tool declares a well-formed schema and validateToolArgs enforces it;
//   - an unknown tool or bad args is an { error } RESULT, never a throw;
//   - propose_shapes whitelists evidence (junk keys dropped, strings truncated)
//     and rejects uncited/unmeasurable shapes;
//   - one_click PROBES: it returns the ring and never stages/commits anything;
//   - the scale gate refuses real-world-unit work on an uncalibrated sheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_TOOL_DEFS, executeAgentTool, validateToolArgs, pickAgentEvidence,
  agentScaleGate, EVIDENCE_MAX_CHARS,
} from "../src/lib/agentTools.js";

// A canvas-shaped capability stub. Every mutation is recorded so the tests can
// assert what executed — and, for the probe tools, what did NOT.
function makeCtx(overrides: Record<string, unknown> = {}) {
  const calls: Record<string, unknown[]> = { proposeShapes: [], createCondition: [], oneClick: [] };
  const ctx = {
    listSheets: () => [{ sheet: "plan.pdf", title: "A101", width: 2000, height: 1500, scale_set: true }],
    sheetDims: (k: string) => (k === "plan.pdf" ? { w: 2000, h: 1500 } : null),
    uppFor: (k: string) => (k === "plan.pdf" ? 0.02 : null),
    detectedLabel: () => "",
    readSheetText: async () => [{ text: "RM 204", x: 0.4, y: 0.5 }],
    readSchedule: async () => ({
      source: "region_parse",
      rows: [{ finish_tag: "CPT-1", section: "FLOORING", category: "floor", description: "CARPET", manufacturer: "", style: "", spec_color: "", size: "", suggested: true }],
    }),
    viewRegion: async () => ({ image_data_url: "data:image/png;base64,AAAA", width: 100, height: 80 }),
    classifySymbol: async () => ({ classification: "gate valve", confidence: 0.9, reasoning: "bowtie body with a straight stem" }),
    oneClick: async (sheet: string, x: number, y: number) => {
      calls.oneClick.push([sheet, x, y]);
      return { verts_norm: [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]], area_sf: 200, perimeter_lf: 60, seed_norm: [x, y] };
    },
    getConditions: () => [{ id: "cnd-1", finish_tag: "CPT-1", hatch: "solid", waste_pct: 5 }],
    createCondition: (tag: string) => { calls.createCondition.push(tag); return { id: `cnd-${tag}`, finish_tag: tag }; },
    proposeShapes: (shapes: unknown[]) => { calls.proposeShapes.push(shapes); return { staged: shapes.length }; },
    ...overrides,
  };
  return { ctx, calls };
}

test("registry: every tool has a name, description, and object schema; names are unique", () => {
  assert.ok(AGENT_TOOL_DEFS.length >= 8);
  const names = new Set<string>();
  for (const d of AGENT_TOOL_DEFS) {
    assert.ok(d.name && typeof d.name === "string");
    assert.ok(d.description.length > 20, `${d.name} needs a real description`);
    assert.equal(d.input_schema.type, "object");
    assert.ok(Array.isArray(d.input_schema.required), `${d.name} schema needs required[]`);
    assert.ok(!names.has(d.name), `duplicate tool name ${d.name}`);
    names.add(d.name);
  }
  for (const expected of ["list_sheets", "read_sheet_text", "read_schedule", "view_region", "one_click", "get_conditions", "create_condition", "propose_shapes"]) {
    assert.ok(names.has(expected), `missing tool ${expected}`);
  }
});

test("validateToolArgs: required keys and primitive types enforced", () => {
  const schema = AGENT_TOOL_DEFS.find((d) => d.name === "one_click")!.input_schema;
  assert.equal(validateToolArgs(schema, { sheet: "plan.pdf", x: 0.5, y: 0.5 }), null);
  assert.match(validateToolArgs(schema, { x: 0.5, y: 0.5 })!, /missing required argument: sheet/);
  assert.match(validateToolArgs(schema, { sheet: "plan.pdf", x: "mid", y: 0.5 })!, /x must be a number/);
  assert.match(validateToolArgs(schema, null)!, /must be a JSON object/);
});

test("unknown tool → error RESULT, never a throw", async () => {
  const { ctx } = makeCtx();
  const out = await executeAgentTool(ctx, "summon_geometry", {});
  assert.match(out.error, /Unknown tool: summon_geometry/);
  assert.match(out.error, /list_sheets/);   // tells the model what IS available
});

test("bad args → error RESULT naming the problem", async () => {
  const { ctx } = makeCtx();
  const out = await executeAgentTool(ctx, "one_click", { sheet: "plan.pdf" });
  assert.match(out.error, /Invalid arguments for one_click/);
});

test("one_click probes without mutating anything", async () => {
  const { ctx, calls } = makeCtx();
  const out = await executeAgentTool(ctx, "one_click", { sheet: "plan.pdf", x: 0.5, y: 0.5 });
  assert.equal(out.area_sf, 200);
  assert.equal(out.verts_norm.length, 4);
  assert.deepEqual(calls.oneClick, [["plan.pdf", 0.5, 0.5]]);
  assert.equal(calls.proposeShapes.length, 0);     // a probe stages NOTHING
  assert.equal(calls.createCondition.length, 0);
});

test("one_click scale gate: uncalibrated sheet refuses with the shared gate text", async () => {
  const { ctx, calls } = makeCtx({ uppFor: () => null, detectedLabel: () => '1/8" = 1\'-0"' });
  const out = await executeAgentTool(ctx, "one_click", { sheet: "plan.pdf", x: 0.5, y: 0.5 });
  assert.equal(out.error, agentScaleGate("plan.pdf", '1/8" = 1\'-0"'));
  assert.match(out.error, /^Set the scale for plan\.pdf first — /);   // the MCP gate's opening line
  assert.match(out.error, /detected: 1\/8/);
  assert.equal(calls.oneClick.length, 0);          // the engine never even ran
});

// read_schedule (cross-phase fix — the read_schedule/sheetgraph bridge):
// executeAgentTool's own dispatch/shaping layer, exercised against a stubbed
// ctx.readSchedule — the exact discriminated {source,...} shape agentReadSchedule
// (TakeoffCanvas.jsx) produces, without needing a real canvas/pdf.js.
test("read_schedule: region parse non-empty — rows pass through unchanged, source: region_parse", async () => {
  const { ctx } = makeCtx();   // default stub returns source: "region_parse"
  const out = await executeAgentTool(ctx, "read_schedule", { sheet: "plan.pdf", region: { x0: 0, y0: 0, x1: 1, y1: 1 } });
  assert.equal(out.source, "region_parse");
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0].finish_tag, "CPT-1");
  assert.equal(out.table, undefined);
});

test("read_schedule: region parse empty, sheet_graph fallback hits — table metadata present", async () => {
  const { ctx } = makeCtx({
    readSchedule: async () => ({
      source: "sheet_graph",
      table: { sheet: "plan.pdf", kind: "equipment", title: "ELECTRIC BASEBOARD HEATER SCHEDULE", headers: ["ID", "MANUFACTURER"], region_norm: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 }, coverage: 0.94 },
      rows: [{ key: "EBB-6", cells: { MANUFACTURER: "QMARK" } }],
    }),
  });
  const out = await executeAgentTool(ctx, "read_schedule", { sheet: "plan.pdf", region: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } });
  assert.equal(out.source, "sheet_graph");
  assert.equal(out.table.title, "ELECTRIC BASEBOARD HEATER SCHEDULE");
  assert.equal(out.rows[0].key, "EBB-6");
  assert.match(out.note, /whole-set sheet graph/);
});

test("read_schedule: neither path finds anything — the note names find_schedule and sheet_graph", async () => {
  const { ctx } = makeCtx({ readSchedule: async () => ({ source: "none", rows: [], sheet_open: true }) });
  const out = await executeAgentTool(ctx, "read_schedule", { sheet: "plan.pdf", region: { x0: 0, y0: 0, x1: 0.01, y1: 0.01 } });
  assert.equal(out.source, "none");
  assert.deepEqual(out.rows, []);
  assert.match(out.note, /find_schedule/);
  assert.match(out.note, /sheet_graph/);
});

test("read_schedule: sheet not open no longer hard-errors — the fallback still runs (Phase 1 parity)", async () => {
  // Before this fix, read_schedule refused up front on !ctx.sheetDims(sheet).
  // Now the gate lives only inside the region-parse path, so a sheet that
  // isn't open still gets a real answer (or a real, honestly-worded miss)
  // from the sheet_graph fallback.
  const { ctx } = makeCtx({
    sheetDims: () => null,   // sheet not open on the canvas
    readSchedule: async () => ({
      source: "sheet_graph",
      table: { sheet: "other.pdf#3", kind: "finish", title: "FAN SCHEDULE", headers: ["ID", "DESCRIPTION"], region_norm: { x0: 0.2, y0: 0.2, x1: 0.3, y1: 0.3 }, coverage: 0.8 },
      rows: [{ key: "EF-1", cells: { DESCRIPTION: "PANASONIC" } }],
    }),
  });
  const out = await executeAgentTool(ctx, "read_schedule", { sheet: "other.pdf#3", region: { x0: 0.2, y0: 0.2, x1: 0.3, y1: 0.3 } });
  assert.equal(out.error, undefined, "no up-front sheetDims gate for read_schedule");
  assert.equal(out.source, "sheet_graph");
  assert.equal(out.rows[0].key, "EF-1");
});

test("read_schedule: neither path finds anything AND the sheet was never open — the note says so", async () => {
  const { ctx } = makeCtx({ readSchedule: async () => ({ source: "none", rows: [], sheet_open: false }) });
  const out = await executeAgentTool(ctx, "read_schedule", { sheet: "plan.pdf", region: { x0: 0, y0: 0, x1: 0.01, y1: 0.01 } });
  assert.match(out.note, /isn't open on the canvas/);
});

// classify_symbol (maturity plan Phase 3, #HVAC-4): dispatch-layer tests
// against a stubbed ctx.classifySymbol — the real prompt/parse plumbing
// (classifySymbolPrompt/parseClassifyResponse) is unit-tested directly in
// ai.test.ts; this only exercises executeAgentTool's own gate/pass-through.
test("classify_symbol: a real classification passes through unchanged", async () => {
  const { ctx } = makeCtx();
  const out = await executeAgentTool(ctx, "classify_symbol", { sheet: "plan.pdf", region: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } });
  assert.deepEqual(out, { classification: "gate valve", confidence: 0.9, reasoning: "bowtie body with a straight stem" });
});

test("classify_symbol: sheet not open on the canvas refuses with a named reason", async () => {
  const { ctx } = makeCtx({ sheetDims: () => null });
  const out = await executeAgentTool(ctx, "classify_symbol", { sheet: "plan.pdf", region: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } });
  assert.match(out.error, /isn't open on the canvas/);
});

test("classify_symbol: no vision model configured — the ctx's own refusal passes through, not swallowed", async () => {
  const { ctx } = makeCtx({ classifySymbol: async () => ({ error: "No vision model configured — open AI settings first." }) });
  const out = await executeAgentTool(ctx, "classify_symbol", { sheet: "plan.pdf", region: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } });
  assert.match(out.error, /No vision model configured/);
});

test("classify_symbol: a malformed model reply refuses rather than guessing, and surfaces the raw text", async () => {
  const { ctx } = makeCtx({ classifySymbol: async () => ({ error: "The vision model's reply wasn't in the required shape.", raw: "not json" }) });
  const out = await executeAgentTool(ctx, "classify_symbol", { sheet: "plan.pdf", region: { x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 } });
  assert.match(out.error, /wasn't in the required shape/);
  assert.equal(out.raw, "not json");
});

test("propose_shapes: evidence whitelist — junk keys dropped, strings truncated, uncited rejected", async () => {
  const { ctx, calls } = makeCtx();
  const long = "X".repeat(500);
  const ring = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]];
  const out = await executeAgentTool(ctx, "propose_shapes", {
    shapes: [
      { sheet: "plan.pdf", verts_norm: ring, condition_id: "cnd-1", measure_role: "floor_area",
        evidence: { schedule_row_tag: "CPT-1", matched_text: long, seed_norm: [0.5, 0.5], prompt_text: "sneaky", room_transcript: long } },
      { sheet: "plan.pdf", verts_norm: ring, condition_id: "cnd-1", measure_role: "floor_area",
        evidence: { prompt_text: "junk only — nothing whitelisted survives" } },
    ],
  });
  assert.equal(out.staged, 1);
  assert.equal(out.rejected.length, 1);
  assert.match(out.rejected[0], /must cite evidence/);
  const staged = (calls.proposeShapes[0] as Record<string, any>[])[0];
  assert.deepEqual(Object.keys(staged.evidence).sort(), ["matched_text", "schedule_row_tag", "seed_norm"]);
  assert.equal(staged.evidence.matched_text.length, EVIDENCE_MAX_CHARS);   // truncated, hard line
  assert.equal(staged.evidence.schedule_row_tag, "CPT-1");
});

test("propose_shapes: unknown condition, bad role, degenerate ring, and unscaled sheet all reject", async () => {
  const { ctx, calls } = makeCtx({ uppFor: (k: string) => (k === "plan.pdf" ? 0.02 : null), sheetDims: (k: string) => (k === "plan.pdf" || k === "scan.pdf" ? { w: 2000, h: 1500 } : null) });
  const ev = { schedule_row_tag: "CPT-1" };
  const ring = [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3]];
  const out = await executeAgentTool(ctx, "propose_shapes", {
    shapes: [
      { sheet: "plan.pdf", verts_norm: ring, condition_id: "cnd-404", measure_role: "floor_area", evidence: ev },
      { sheet: "plan.pdf", verts_norm: ring, condition_id: "cnd-1", measure_role: "linear", evidence: ev },
      { sheet: "plan.pdf", verts_norm: [[0.1, 0.1], [0.2, 0.2]], condition_id: "cnd-1", measure_role: "floor_area", evidence: ev },
      { sheet: "scan.pdf", verts_norm: ring, condition_id: "cnd-1", measure_role: "floor_area", evidence: ev },   // no scale
      { sheet: "ghost.pdf", verts_norm: ring, condition_id: "cnd-1", measure_role: "floor_area", evidence: ev },  // not open
    ],
  });
  assert.equal(out.staged, 0);
  assert.equal(out.rejected.length, 5);
  assert.equal(calls.proposeShapes.length, 0);   // nothing valid → the canvas is never touched
  assert.match(out.rejected[3], /^Set the scale for scan\.pdf first/);
});

test("create_condition dedupes by tag instead of minting twins", async () => {
  const { ctx, calls } = makeCtx();
  const dup = await executeAgentTool(ctx, "create_condition", { finish_tag: "cpt-1" });
  assert.equal(dup.condition_id, "cnd-1");
  assert.equal(dup.note, "already existed");
  assert.equal(calls.createCondition.length, 0);
  const fresh = await executeAgentTool(ctx, "create_condition", { finish_tag: "LVT-2" });
  assert.equal(fresh.condition_id, "cnd-LVT-2");
  assert.deepEqual(calls.createCondition, ["LVT-2"]);
});

test("a capability throw becomes an error result (the loop must never crash)", async () => {
  const { ctx } = makeCtx({ readSheetText: async () => { throw new Error("text layer exploded"); } });
  const out = await executeAgentTool(ctx, "read_sheet_text", { sheet: "plan.pdf" });
  assert.match(out.error, /read_sheet_text failed: text layer exploded/);
});

// match_reference_symbol (accuracy-hardening plan Phase 0) — executeAgentTool's
// own dispatch/shaping layer only; matchAgainstLibrary's own logic is covered
// directly by mcp/test/tools.test.ts's real end-to-end tests.
test("match_reference_symbol: sheet not open on the canvas refuses with a named reason", async () => {
  const { ctx } = makeCtx();
  const out = await executeAgentTool(ctx, "match_reference_symbol", { sheet: "other.pdf" });
  assert.match(out.error, /isn't open on the canvas/);
});

test("match_reference_symbol: a valid call passes names through and returns the ctx's own result unchanged", async () => {
  const calls: unknown[] = [];
  const { ctx } = makeCtx({
    matchReferenceSymbol: async (sheet: string, opts: unknown) => { calls.push([sheet, opts]); return { shapes: [{ name: "gate valve", found: 2, matches: [], withheld: [], complete: true }] }; },
  });
  const out = await executeAgentTool(ctx, "match_reference_symbol", { sheet: "plan.pdf", names: ["gate valve"] });
  assert.equal(out.shapes[0].name, "gate valve");
  assert.deepEqual(calls[0], ["plan.pdf", { names: ["gate valve"] }]);
});

// trace_connectivity (maturity plan Phase 4) — executeAgentTool's own
// dispatch/shaping layer only; buildMepGraph/traceConnectivity's own logic
// is covered directly by web/test/mepconnectivity.test.ts.
test("trace_connectivity: sheet not open on the canvas refuses with a named reason", async () => {
  const { ctx } = makeCtx();
  const out = await executeAgentTool(ctx, "trace_connectivity", {
    sheet: "other.pdf", from_norm: [0.1, 0.1], equipment: [{ id: "AHU-1", at_norm: [0.5, 0.5] }],
  });
  assert.match(out.error, /isn't open on the canvas/);
});

test("trace_connectivity: a malformed from_norm is a named error, not a crash", async () => {
  const { ctx } = makeCtx();
  const out = await executeAgentTool(ctx, "trace_connectivity", {
    sheet: "plan.pdf", from_norm: [0.1], equipment: [{ id: "AHU-1", at_norm: [0.5, 0.5] }],
  });
  assert.match(out.error, /from_norm/);
});

test("trace_connectivity: a valid call reshapes at_norm → at and passes through to the canvas's own tracer unchanged", async () => {
  const calls: unknown[] = [];
  const { ctx } = makeCtx({
    traceConnectivity: async (sheet: string, opts: unknown) => { calls.push([sheet, opts]); return { status: "reached", reached_equipment: { id: "AHU-1", at: [0.5, 0.5] }, layer_signal: "none", confidence: 0.85, factors: ["layer-unclassified"] }; },
  });
  const out = await executeAgentTool(ctx, "trace_connectivity", {
    sheet: "plan.pdf", from_norm: [0.1, 0.2],
    equipment: [{ id: "AHU-1", at_norm: [0.5, 0.5] }],
    fittings: [{ at_norm: [0.3, 0.3] }],
    bridge_ft: 3,
  });
  assert.equal(out.status, "reached");
  assert.deepEqual(calls[0], ["plan.pdf", {
    from: [0.1, 0.2],
    equipment: [{ id: "AHU-1", at: [0.5, 0.5], label: undefined }],
    fittings: [{ at: [0.3, 0.3] }],
    maxHops: undefined, seedTolFt: undefined, bridgeFt: 3,
  }]);
});

test("pickAgentEvidence: null-safe, array-safe, whitelist-only", () => {
  assert.equal(pickAgentEvidence(null), null);
  assert.equal(pickAgentEvidence([1, 2]), null);
  assert.equal(pickAgentEvidence({ junk: 1 }), null);
  assert.deepEqual(pickAgentEvidence({ matched_text: "RM 204", junk: 1 }), { matched_text: "RM 204" });
});
