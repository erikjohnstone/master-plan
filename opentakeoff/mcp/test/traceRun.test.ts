// classify_strokes + trace_run (#linear-takeoff WP3.7, plan §6.2-§6.8) over
// the real MCP wire — against Bessemer M101 (samples/bessemer-mechanical-
// bidset.pdf#6), the SAME sheet WP3.1's own stroke-classification checkpoint
// and WP3.4's own walker checkpoint validated against.
//
// Not used here, and why: opentakeoff-corpus/ground_truth/linear/
// bessemer-m101.json's own hand-traced "unit103-supply-trunk" verts_norm is
// a CENTERLINE (drawn as a double-line pair on this sheet), and its nearest
// real drawn edge — confirmed by direct segment inspection against the real
// extraction, pen 4, at (1068.7,1021.7)-(1608.5,1021.7) — turns out to be
// EXACTLY the segment WP3.4's own checkpoint already found wall-vouch-
// excluded (networkWallSegs false-positiving on one long, dead-straight
// run — a real, already-accepted limitation this session does not touch;
// see PROGRESS.md's WP3.4 entry). A DIFFERENT real, non-excluded pen-4
// candidate on the same sheet stands in instead — still genuine drawn duct
// ink from the same family classify_strokes reports, just not this one
// named ground-truth run.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../server.ts";
import { Session } from "../src/session.ts";
import { shutdownVectorGrid } from "../../web/src/lib/vectorGridClient.ts";

const PLAN = fileURLToPath(new URL("../../samples/bessemer-mechanical-bidset.pdf", import.meta.url));
const KEY = "bessemer-mechanical-bidset.pdf#6";

// A real, non-excluded pen-4 candidate segment on Bessemer M101 (its own
// midpoint — verified by direct segment inspection: (2295.8,986.9)-
// (2295.8,1022.9), a 36px vertical run reaching a real junction at both
// ends, per the trace below).
const REAL_DUCT_SEED: [number, number] = [2295.8, 1004.9];

async function pair() {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await buildServer(new Session()).connect(st);
  const client = new Client({ name: "trace-run-test", version: "0.0.0" });
  await client.connect(ct);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const res: any = await client.callTool({ name, arguments: args });
  const data = JSON.parse(res.content[0].text);
  assert.equal(!!res.isError, false, `${name} unexpectedly failed: ${data.error}`);
  return data;
}

after(() => shutdownVectorGrid());

test("classify_strokes finds a real, layer-independent duct-pen family on Bessemer M101 (pen 4, per WP3.1's own validated finding)", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  const r = await call(client, "classify_strokes", { sheet: KEY });
  assert.ok(r.candidate_segments > 0);
  assert.ok(r.families.length > 0);
  const pen4 = r.families.find((f: any) => f.pen === 4);
  assert.ok(pen4, `expected a pen-4 family among ${JSON.stringify(r.families.map((f: any) => f.pen))}`);
  assert.ok(pen4.confidence > 0 && pen4.confidence <= 1);
});

test("trace_run walks a real Bessemer duct segment to a real junction — a real length, a disclosed candidate fan, a confidence account naming every factor", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });

  const r = await call(client, "trace_run", { sheet: KEY, from: REAL_DUCT_SEED });
  assert.ok(r.length_px > 0, "a real walk always covers real distance");
  assert.ok(r.length_lf > 0, "the sheet's scale is set, so a px length always resolves to a real one too");
  assert.ok(["dead_end", "equipment", "sheet_edge", "riser", "branch_joins_main", "ambiguous", "family_change", "cap"].includes(r.stops.forward.reason));
  assert.ok(["dead_end", "equipment", "sheet_edge", "riser", "branch_joins_main", "ambiguous", "family_change", "cap"].includes(r.stops.backward.reason));
  assert.ok(r.confidence > 0 && r.confidence <= 1);
  assert.ok(r.factors.length > 0, "at minimum, stroke-family evidence always contributes a factor");
  assert.ok(r.factors.some((f: string) => f.startsWith("stroke-family:")));
  // this exact seed reaches a real junction both directions (verified by
  // direct trace against the real PDF) — Bessemer's own pen-weight-prior
  // grade (no usable CAD layers on this Revit export, per WP3.1), an
  // agent-set scale that set_scale itself never marks confirmed, and no
  // size label within reach of this particular stub.
  assert.equal(r.stops.forward.reason, "ambiguous");
  assert.equal(r.stops.backward.reason, "ambiguous");
  assert.ok(r.candidates?.length > 0, "an ambiguous stop always discloses its own candidate fan");
  assert.deepEqual(r.factors, ["stroke-family:pen-weight-prior", "size_missing", "ambiguous_stop", "layer-unclassified", "scale_unconfirmed"]);
  assert.equal(r.shape_id, undefined, "find-only by default — nothing committed");
});

test("trace_run commit:true mints a real linear shape, origin.method \"traced\", reviewed:false, with the full receipt under origin.trace", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });

  const r = await call(client, "trace_run", { sheet: KEY, from: REAL_DUCT_SEED, condition: "SA-1", commit: true });
  assert.ok(r.shape_id, "commit:true must mint a real shape id");

  // list_shapes is a compact read and deliberately omits the full origin
  // (method/confidence/trace) — export_takeoff round-trips the exact
  // payload, origin included, the same surface linearParity.test.ts's own
  // parity checks read from.
  const exported = await call(client, "export_takeoff");
  const shape = exported.shapes.find((s: any) => s.id === r.shape_id);
  assert.ok(shape, "the committed shape round-trips through export_takeoff, like any other commit");
  assert.equal(shape.origin.method, "traced");
  assert.equal(shape.origin.reviewed, false);
  assert.equal(shape.origin.actor, "agent");
  assert.equal(shape.origin.confidence, r.confidence);
  assert.deepEqual(shape.origin.confidence_factors, r.factors);
  assert.ok(shape.origin.trace, "the full receipt rides on the committed shape, not just the reply");
  assert.deepEqual(shape.origin.trace.factors, r.factors);
  assert.ok(Array.isArray(shape.origin.trace.segs) && shape.origin.trace.segs.length > 0);
});

test("trace_run refuses when the seed point isn't on any drawn linework at all", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  const res: any = await client.callTool({ name: "trace_run", arguments: { sheet: KEY, from: [1, 1] } });
  assert.equal(res.isError, true);
  const data = JSON.parse(res.content[0].text);
  assert.match(data.error, /No routed linework under the cursor/);
});

test("trace_run commit:true without a condition refuses with a named reason, not a silent no-op", async () => {
  const client = await pair();
  await call(client, "load_plan", { path: PLAN });
  await call(client, "set_scale", { sheet: KEY, use_detected: true });
  const res: any = await client.callTool({ name: "trace_run", arguments: { sheet: KEY, from: REAL_DUCT_SEED, commit: true } });
  assert.equal(res.isError, true);
  const data = JSON.parse(res.content[0].text);
  assert.match(data.error, /commit:true needs a condition/);
});
