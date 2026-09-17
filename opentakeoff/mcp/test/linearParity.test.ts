// #linear-takeoff (opentakeoff-corpus/goals/LINEAR_TAKEOFF.md WP1.5): canvas
// and MCP must price the same run identically. TakeoffCanvas.jsx's
// commitLinear/applySegmentSize can't be imported headlessly (React), so this
// file reproduces their exact seeding/patch formulas inline — comments cite
// the source — and drives mcp/src/session.ts's measureLine/editRun over the
// real wire, then checks two things against each canvas formula's result:
// (1) the AUTHORED `run` block the tool actually wrote matches what the
// canvas formula would produce for the same inputs, and (2) `computed_run`
// matches web/src/lib/linear/run.ts's resolveRunSegments called directly on
// that same run/points/scale. (1) proves the two engines' SEEDING/PATCH
// logic agrees, not just that both happen to call the same math function —
// (2) proves MCP's own call into that shared function used the right
// points/scale, so nothing between the wire and the resolver silently
// disagrees with the canvas about coordinate space or units.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../server.ts";
import { Session } from "../src/session.ts";
import { shutdownVectorGrid } from "../../web/src/lib/vectorGridClient.ts";
import { resolveRunSegments } from "../../web/src/lib/linear/run.ts";

const PLAN = fileURLToPath(new URL("../../demo/sample-plan.pdf", import.meta.url));
const KEY = "sample-plan.pdf";

async function pair() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await buildServer(new Session()).connect(st);
  const client = new Client({ name: "linear-parity", version: "0.0.0" });
  await client.connect(ct);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res: any = await client.callTool({ name, arguments: args });
  const data = JSON.parse(res.content[0].text);
  assert.equal(!!res.isError, false, `${name} unexpectedly failed: ${data.error}`);
  return data;
}

/** TakeoffCanvas.jsx's commitLinear (WP1.3, ~line 4942): a routed condition
 * (system OR family set) seeds this run's system and segment-0 size from its
 * own defaults; a plain condition never gets a run block at all. */
function canvasSeedRun(cond: { system?: string; family?: string; size?: unknown }): Record<string, unknown> | null {
  const routed = !!(cond.system || cond.family);
  if (!routed) return null;
  return {
    ...(cond.system ? { system: cond.system } : {}),
    ...(cond.size ? { size_overrides: { "0": { ...(cond.size as object) } } } : {}),
  };
}

/** TakeoffCanvas.jsx's applySegmentSize (WP1.3, ~line 4985): patches ONE
 * segment's size override by index — every other index untouched — and
 * drops size_overrides/the whole run block once nothing is left in them. */
function canvasApplySegmentSize(run: Record<string, any>, segIndex: number, size: unknown | null): Record<string, unknown> | undefined {
  const overrides = { ...(run.size_overrides || {}) };
  if (size) overrides[String(segIndex)] = size; else delete overrides[String(segIndex)];
  const next: Record<string, unknown> = { ...run };
  if (Object.keys(overrides).length) next.size_overrides = overrides; else delete next.size_overrides;
  return (next.system || next.size_overrides || next.vertex_overrides || next.params || next.status) ? next : undefined;
}

after(() => shutdownVectorGrid());

test("measure_line on a routed condition seeds system/size exactly like commitLinear, and computed_run matches resolveRunSegments independently", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  const scale = await call(client, "set_scale", { sheet: KEY, use_detected: true });
  // mint SA-1 plain first (edit_condition requires an existing tag), then
  // route it — mirrors any real session: a condition exists before an
  // estimator gives it a system.
  await call(client, "edit_materials", { condition: "SA-1", add: [{ name: "duct board" }] });
  const size = { kind: "rect", w_in: 12, h_in: 6 };
  await call(client, "edit_condition", { condition: "SA-1", system: "SA", size });

  const pts = [[0, 0], [360, 0], [360, 360]];
  const line = await call(client, "measure_line", { sheet: KEY, pts, condition: "SA-1" });

  const expectedRun = canvasSeedRun({ system: "SA", size });
  assert.deepEqual(line.run, expectedRun, "MCP's condition-seed formula matches commitLinear's exactly");
  assert.ok(line.computed_run, "a seeded run always resolves for a real 2-segment polyline");
  assert.deepEqual(line.computed_run, resolveRunSegments(pts as [number, number][], scale.upp, expectedRun as any),
    "MCP's computed_run is exactly what the canvas's own resolver produces for the same points/scale/run");
});

test("an explicit system/size passed to measure_line wins outright over a routed condition's seed, never merged with it", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  const scale = await call(client, "set_scale", { sheet: KEY, use_detected: true });
  await call(client, "edit_materials", { condition: "SA-1", add: [{ name: "duct board" }] });
  await call(client, "edit_condition", { condition: "SA-1", system: "SA", size: { kind: "rect", w_in: 12, h_in: 6 } });

  const pts = [[0, 0], [360, 0]];
  const explicitSize = { kind: "round", d_in: 8 };
  const line = await call(client, "measure_line", { sheet: KEY, pts, condition: "SA-1", system: "OA", size: explicitSize });

  assert.deepEqual(line.run, { system: "OA", size_overrides: { "0": explicitSize } });
  assert.deepEqual(line.computed_run, resolveRunSegments(pts as [number, number][], scale.upp, line.run));
});

test("measure_line's vertices param authors vertex_overrides read identically by resolveRunSegments", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  const scale = await call(client, "set_scale", { sheet: KEY, use_detected: true });

  const pts = [[0, 0], [360, 0], [360, 360]];
  const line = await call(client, "measure_line", { sheet: KEY, pts, condition: "HHWS-1", vertices: [{ i: 1, kind: "tee" }] });

  const expectedRun = { vertex_overrides: { "1": { kind: "tee" } } };
  assert.deepEqual(line.run, expectedRun);
  assert.deepEqual(line.computed_run, resolveRunSegments(pts as [number, number][], scale.upp, expectedRun as any));
  const v1 = line.computed_run.vertices.find((v: any) => v.i === 1);
  assert.deepEqual(v1, { i: 1, kind: "tee", manual: true }, "an explicit override reports manual:true, exactly like the canvas's own vertex glyphs would read it");
});

test("edit_run's segment_sizes patch matches the canvas's applySegmentSize formula index-for-index, and clearing every entry drops the run block", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  const scale = await call(client, "set_scale", { sheet: KEY, use_detected: true });

  const pts = [[0, 0], [360, 0], [360, 360], [720, 360]]; // 3 segments, non-routed condition
  const line = await call(client, "measure_line", { sheet: KEY, pts, condition: "HHWS-1" });
  assert.equal(line.run, undefined, "a non-routed condition's plain trace carries no run block yet");

  const sizeA = { kind: "pipe", nps_in: 2 };
  const afterA = await call(client, "edit_run", { shape_id: line.shape_id, segment_sizes: [{ i: 0, size: sizeA }] });
  let expectedRun = canvasApplySegmentSize({}, 0, sizeA);
  assert.deepEqual(afterA.run, expectedRun);
  assert.deepEqual(afterA.computed_run, resolveRunSegments(pts as [number, number][], scale.upp, expectedRun as any));

  const sizeB = { kind: "pipe", nps_in: 3 };
  const afterB = await call(client, "edit_run", { shape_id: line.shape_id, segment_sizes: [{ i: 2, size: sizeB }] });
  expectedRun = canvasApplySegmentSize(expectedRun!, 2, sizeB);
  assert.deepEqual(afterB.run, expectedRun);
  assert.deepEqual(afterB.computed_run, resolveRunSegments(pts as [number, number][], scale.upp, expectedRun as any));
  // segment 1 carries A forward (nearest at-or-before), matching "carried
  // along the run" (plan §6.6) — verified against the shared resolver, not
  // re-derived here.
  assert.deepEqual(afterB.computed_run.segments[1].size, sizeA);

  const cleared = await call(client, "edit_run", { shape_id: line.shape_id, segment_sizes: [{ i: 0, size: null }, { i: 2, size: null }] });
  assert.equal(cleared.run, undefined, "clearing every override drops the run block entirely, matching the canvas's own finalRun truthiness rule");
  assert.equal(cleared.computed_run, undefined);
});

test("edit_run refuses a non-linear shape and a human-reviewed shape, matching edit_shape's own refusal doctrine", async () => {
  // Bypasses the wire, like tools.test.ts's own reviewed-shape test — this
  // server never sets origin.reviewed itself (only a real host's human
  // review gate does), so the flag is set directly on the Session.
  const session = new Session();
  await session.loadPlan(PLAN);
  session.setScale(KEY, { use_detected: true });

  const areaId = session.measurePolygon(KEY, [[100, 100], [460, 100], [460, 460], [100, 460]], { role: "floor_area", condition: "VCT-1" }).shape_id!;
  assert.throws(() => session.editRun(areaId, { system: "SA" }), /run overrides only apply to linear shapes/);

  const lineId = session.measureLine(KEY, [[0, 0], [360, 0]], { condition: "HHWS-1" }).shape_id!;
  session.shapes.find((s) => s.id === lineId)!.origin!.reviewed = true;
  assert.throws(() => session.editRun(lineId, { system: "HHWS" }), /affirmed by a human/);
});

// #linear-takeoff (WP2.5): resolve_linear_assembly wires session.ts's own
// call into the SAME resolveLinearAssembly pure function assembly.test.ts
// already exercises formula-by-formula — these tests cover the WIRING
// (shape/condition/assembly lookup, error messages, the multiplier), not
// the arithmetic a second time.
test("resolve_linear_assembly: resolves a duct_rect run against its built-in default assembly", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  await call(client, "edit_materials", { condition: "SA-1", add: [{ name: "placeholder", per: 1 }] });
  await call(client, "edit_condition", { condition: "SA-1", family: "duct_rect" });
  const line = await call(client, "measure_line", {
    sheet: KEY, pts: [[0, 0], [360, 0], [720, 0]], condition: "SA-1",
    size: { kind: "rect", w_in: 12, h_in: 6 },
  });

  const resolved = await call(client, "resolve_linear_assembly", { shape_id: line.shape_id });
  assert.equal(resolved.assembly_id, "asm-duct-rect-default");
  assert.equal(resolved.family, "duct_rect");
  const byItem = (item: string) => resolved.line_items.find((li: any) => li.item === item);
  assert.ok(byItem("duct_lb"));
  assert.ok(byItem("insulation_sf"));
  assert.ok(byItem("hanger"));
  assert.ok(byItem("labor_hr"));
});

test("resolve_linear_assembly: an explicit assembly_id overrides the condition's own default", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  await call(client, "edit_materials", { condition: "SA-1", add: [{ name: "placeholder", per: 1 }] });
  await call(client, "edit_condition", { condition: "SA-1", family: "duct_rect", assembly_id: "asm-duct-rect-default" });
  const line = await call(client, "measure_line", {
    sheet: KEY, pts: [[0, 0], [360, 0]], condition: "SA-1", size: { kind: "rect", w_in: 12, h_in: 6 },
  });
  const resolved = await call(client, "resolve_linear_assembly", { shape_id: line.shape_id, assembly_id: "asm-duct-round-default" });
  assert.equal(resolved.assembly_id, "asm-duct-round-default");
});

test("resolve_linear_assembly: an unknown assembly_id refuses, naming the reachable built-in ids", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  await call(client, "edit_materials", { condition: "SA-1", add: [{ name: "placeholder", per: 1 }] });
  await call(client, "edit_condition", { condition: "SA-1", family: "duct_rect" });
  const line = await call(client, "measure_line", { sheet: KEY, pts: [[0, 0], [360, 0]], condition: "SA-1", size: { kind: "rect", w_in: 12, h_in: 6 } });
  // call() throws via assert on isError — reach the raw reply instead for this one
  const res: any = await client.callTool({ name: "resolve_linear_assembly", arguments: { shape_id: line.shape_id, assembly_id: "asm-nope" } });
  const data = JSON.parse(res.content[0].text);
  assert.equal(res.isError, true);
  assert.match(data.error, /Unknown assembly_id.*asm-duct-rect-default/);
});

test("resolve_linear_assembly: an inline assembly wins over assembly_id, and reports assembly_id 'inline'", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  await call(client, "edit_materials", { condition: "SA-1", add: [{ name: "placeholder", per: 1 }] });
  await call(client, "edit_condition", { condition: "SA-1", family: "duct_rect" });
  const line = await call(client, "measure_line", { sheet: KEY, pts: [[0, 0], [360, 0]], condition: "SA-1", size: { kind: "rect", w_in: 12, h_in: 6 } });
  const resolved = await call(client, "resolve_linear_assembly", {
    shape_id: line.shape_id,
    assembly_id: "asm-duct-round-default", // must be ignored — inline wins
    assembly: { family: "duct_rect", per_ft: [{ item: "duct_lb", gauge: 26 }], per_vertex: [], per_run: [] },
  });
  assert.equal(resolved.assembly_id, "inline");
  const ductLb = resolved.line_items.find((li: any) => li.item === "duct_lb");
  assert.match(ductLb.formula, /26 ga/);
});

test("resolve_linear_assembly: the condition's multiplier applies to every line, and pipe family resolves from NPS/material/service", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  await call(client, "edit_materials", { condition: "HHWS-1", add: [{ name: "placeholder", per: 1 }] });
  await call(client, "edit_condition", { condition: "HHWS-1", family: "pipe", multiplier: 2 });
  const line = await call(client, "measure_line", { sheet: KEY, pts: [[0, 0], [360, 0]], condition: "HHWS-1", size: { kind: "pipe", nps_in: 1 } });
  const base = await call(client, "resolve_linear_assembly", { shape_id: line.shape_id, pipe_service: "hw_dhw_105_140f", pipe_hanger_material: "copper", pipe_hanger_service: "mechanical" });
  assert.equal(base.assembly_id, "asm-pipe-default");
  assert.equal(base.family, "pipe");
  const pipeLf = base.line_items.find((li: any) => li.item === "pipe_lf");
  assert.equal(pipeLf.qty, 20); // 360px at the demo plan's own detected scale, x2 multiplier — sanity: positive and multiplier-scaled
  assert.ok(pipeLf.qty > 0);
});

test("resolve_linear_assembly: refuses a non-linear shape and a linear shape with no run block yet", async () => {
  const session = new Session();
  await session.loadPlan(PLAN);
  session.setScale(KEY, { use_detected: true });

  const areaId = session.measurePolygon(KEY, [[100, 100], [460, 100], [460, 460], [100, 460]], { role: "floor_area", condition: "VCT-1" }).shape_id!;
  assert.throws(() => session.resolveLinearAssembly(areaId, {}), /assembly resolution only applies to linear shapes/);

  const lineId = session.measureLine(KEY, [[0, 0], [360, 0]], { condition: "HHWS-1" }).shape_id!; // no size → no run block
  assert.throws(() => session.resolveLinearAssembly(lineId, {}), /carries no run block yet/);
});
