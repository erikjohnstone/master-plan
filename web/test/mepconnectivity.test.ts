// mepconnectivity.ts (maturity plan Phase 4) — the MEP connectivity graph
// and traceConnectivity's own refusal doctrine. Pure, no PDF/DOM — segments
// in, a graph or a trace result out, exactly like symbolsweep.ts/
// wallnetwork.ts's own tests already work. Every number below was measured
// against the real implementation first (this project's own debug-loop-
// speed practice), not hand-derived and then coded to match.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMepGraph, traceConnectivity, type MepGraph } from "../src/lib/mepconnectivity.ts";
import type { LayerInfo } from "../src/lib/layers.ts";

// ── buildMepGraph ────────────────────────────────────────────────────────

test("buildMepGraph: a T-junction (one line touching another's MIDPOINT) splits correctly into a real 3-way node", () => {
  // a horizontal run (0,0)-(200,0) with a vertical stub touching its
  // midpoint (100,0)-(100,100) — a real mid-edge junction, not two lines
  // that happen to share an endpoint.
  const segs = [0, 0, 200, 0, 100, 0, 100, 100];
  const g = buildMepGraph(segs, {});
  const junction = g.nodes.find((n) => Math.abs(n.x - 100) < 5 && Math.abs(n.y - 0) < 5);
  assert.ok(junction, "a node exists near the real T-junction point");
  assert.equal(junction!.edges.length, 3, "the T-junction is a real 3-way node — one edge each direction plus the stub");
  assert.equal(g.edges.length, 3, "the horizontal run split into 2 edges + 1 stub edge = 3 total");
});

test("buildMepGraph: two lines that never touch stay in separate components", () => {
  const segs = [0, 0, 100, 0, 300, 0, 400, 0];
  const g = buildMepGraph(segs, {});
  assert.equal(g.edges.length, 2);
  // no edge connects a node from the first pair to a node from the second
  const near = (x: number, ref: number) => Math.abs(x - ref) < 5;
  const firstNodes = g.nodes.filter((n) => near(n.x, 0) || near(n.x, 100)).map((n) => g.nodes.indexOf(n));
  const secondNodes = g.nodes.filter((n) => near(n.x, 300) || near(n.x, 400)).map((n) => g.nodes.indexOf(n));
  for (const e of g.edges) {
    const crossesComponents = (firstNodes.includes(e.a) && secondNodes.includes(e.b)) || (firstNodes.includes(e.b) && secondNodes.includes(e.a));
    assert.ok(!crossesComponents, "no edge ever bridges the two genuinely separate runs");
  }
});

test("buildMepGraph: layerSignal is 'none' with no layer data, 'strong' with confident, high-coverage layer data", () => {
  const segs = [0, 0, 100, 0];
  assert.equal(buildMepGraph(segs, {}).layerSignal, "none");
  const layers: LayerInfo[] = [{ id: "1", name: "M-DUCT", role: "unknown", confidence: 0, visible: true, seg_count: 0 }];
  assert.equal(buildMepGraph(segs, { layers, layerOf: [0] }).layerSignal, "strong");
});

test("buildMepGraph: every edge inherits its ORIGINAL segment's own system tag, even after being split at a junction", () => {
  // seg 0 (ductwork) gets split by seg 1 (piping) touching its midpoint —
  // both resulting pieces of seg 0 must still read as ductwork, and the
  // stub must read as piping. This is the real attribution problem this
  // module's own design exists to avoid losing through JTS's noding.
  const segs = [0, 0, 200, 0, 100, 0, 100, 100];
  const layers: LayerInfo[] = [
    { id: "duct", name: "M-DUCT", role: "unknown", confidence: 0, visible: true, seg_count: 0 },
    { id: "pipe", name: "P-PIPE", role: "unknown", confidence: 0, visible: true, seg_count: 0 },
  ];
  const g = buildMepGraph(segs, { layers, layerOf: [0, 1] });
  const ductworkEdges = g.edges.filter((e) => e.system === "ductwork");
  const pipingEdges = g.edges.filter((e) => e.system === "piping");
  assert.equal(ductworkEdges.length, 2, "both halves of the split horizontal run stay ductwork");
  assert.equal(pipingEdges.length, 1, "the stub stays piping");
});

test("buildMepGraph: an exact reversed-duplicate segment (a real CAD 'double stroke' artifact) never crashes JTS's noding", () => {
  // Found live against the real Bessemer corpus (38K real segments,
  // page 6): JTS's UnaryUnionOp.union throws `TopologyException: found
  // non-noded intersection` outright if fed two segments that are exact
  // reversals of each other — a common real CAD export artifact this
  // synthetic case reproduces deliberately, not hypothetically.
  const segs = [10, 10, 50, 50, 50, 50, 10, 10];   // the same line, twice, reversed
  const g = buildMepGraph(segs, {});
  assert.equal(g.edges.length, 2, "both duplicate segments still become edges — only the noding step itself was fragile to it");
  assert.equal(g.nodes.length, 2);
});

test("buildMepGraph: an empty sheet (no segments) returns an empty graph, not a throw", () => {
  const g = buildMepGraph([], {});
  assert.deepEqual(g, { nodes: [], edges: [], layerSignal: "none" });
});

test("buildMepGraph: excludeSegs drops exactly the marked segments", () => {
  const segs = [0, 0, 100, 0, 200, 0, 300, 0];
  const excludeSegs = new Uint8Array([0, 1]); // drop the second segment
  const g = buildMepGraph(segs, { excludeSegs });
  assert.equal(g.edges.length, 1);
});

// ── traceConnectivity ────────────────────────────────────────────────────

function graphOf(segs: number[]): MepGraph {
  return buildMepGraph(segs, {});
}

test("traceConnectivity: a straight run reaches its one real equipment placement", () => {
  const g = graphOf([0, 0, 300, 0]);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "AHU-1", at: [300, 0] }] });
  assert.equal(r.status, "reached");
  assert.equal(r.reachedEquipment?.id, "AHU-1");
  assert.ok(r.path && r.path.length >= 2);
});

test("traceConnectivity: a real branching junction reaching two DIFFERENT equipment is ambiguous, never picks one", () => {
  const g = graphOf([0, 0, 100, 0, 100, 0, 100, 100, 100, 0, 200, 0]);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "VAV-1", at: [100, 100] }, { id: "VAV-2", at: [200, 0] }] });
  assert.equal(r.status, "ambiguous");
  assert.equal(r.reachedEquipment, undefined, "never invents a pick among ambiguous candidates");
  const ids = r.branches?.map((b) => b.leads_to).sort();
  assert.deepEqual(ids, ["VAV-1", "VAV-2"]);
  assert.match(r.reason ?? "", /VAV-1/);
  assert.match(r.reason ?? "", /VAV-2/);
});

test("traceConnectivity: a dead end that ran out of connected linework says so, distinct from hitting the hop cap", () => {
  const g = graphOf([0, 0, 100, 0]);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "AHU-1", at: [500, 500] }] });
  assert.equal(r.status, "dead_end");
  assert.match(r.reason ?? "", /ran out of connected linework/i);
});

test("traceConnectivity: hitting max_hops before reaching equipment is named as a distinct dead_end reason", () => {
  const segs: number[] = [];
  for (let i = 0; i < 10; i++) segs.push(i * 10, 0, (i + 1) * 10, 0);
  const g = graphOf(segs);
  const r = traceConnectivity(g, [0, 0], { maxHops: 3, equipmentSymbols: [{ id: "FAR", at: [100, 0] }] });
  assert.equal(r.status, "dead_end");
  assert.match(r.reason ?? "", /3-hop limit/);
});

test("traceConnectivity: never invents a reached equipment from nearest-as-the-crow-flies — an unconnected placement stays unreached", () => {
  const g = graphOf([0, 0, 100, 0, 200, -50, 200, 50]);   // a second, disconnected line
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "FAR-1", at: [200, 0] }] });
  assert.equal(r.status, "dead_end", "FAR-1 sits close in space but is not walkably connected — never reached");
});

test("traceConnectivity: long trace (>30 hops) discloses the factor and discounts confidence", () => {
  const segs: number[] = [];
  for (let i = 0; i < 40; i++) segs.push(i * 10, 0, (i + 1) * 10, 0);
  const g = graphOf(segs);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "FAR", at: [400, 0] }] });
  assert.equal(r.status, "reached");
  assert.ok(r.factors.some((f) => f.startsWith("long-trace")));
  assert.ok(r.confidence < 1, "a long trace must discount confidence, never stay at a flat 1.0");
});

test("traceConnectivity: an unclassified layer signal discloses the factor and discounts confidence, even on a clean reach", () => {
  const g = graphOf([0, 0, 100, 0]);   // no layer data at all -> layerSignal "none"
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "AHU-1", at: [100, 0] }] });
  assert.equal(r.status, "reached");
  assert.ok(r.factors.includes("layer-unclassified"));
  assert.ok(r.confidence < 1);
});

test("traceConnectivity: refuses (does not silently return dead_end) when no equipment symbols are supplied at all", () => {
  const g = graphOf([0, 0, 100, 0]);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [] });
  assert.equal(r.status, "refused");
  assert.match(r.reason ?? "", /sweep the target family first/);
});

test("traceConnectivity: refuses when the seed point isn't on any traced linework", () => {
  const g = graphOf([0, 0, 100, 0]);
  const r = traceConnectivity(g, [999, 999], { equipmentSymbols: [{ id: "X", at: [100, 0] }] });
  assert.equal(r.status, "refused");
  assert.match(r.reason ?? "", /isn't on any traced linework/);
});

test("traceConnectivity: refuses when the sheet has no vector linework at all", () => {
  const g = graphOf([]);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "X", at: [0, 0] }] });
  assert.equal(r.status, "refused");
  assert.match(r.reason ?? "", /no traced vector linework/);
});

test("traceConnectivity: determinism — the same call twice returns the same result", () => {
  const g = graphOf([0, 0, 300, 0]);
  const opts = { equipmentSymbols: [{ id: "AHU-1", at: [300, 0] as [number, number] }] };
  const r1 = traceConnectivity(g, [0, 0], opts);
  const r2 = traceConnectivity(g, [0, 0], opts);
  assert.deepEqual(r1, r2);
});

// ── junction bridging (MEP_BRIDGE_FT) ───────────────────────────────────
// A real drawn gap between two dead-end run-ends, bridged ONLY when a real
// fitting/valve/damper symbol placement sits in it — never on proximity
// alone (wallnetwork.ts's own never-admit-on-proximity-alone doctrine).
// mppf/bridgeFt are passed explicitly in every case below so these tests
// stay correct regardless of future default-tuning (a named open risk in
// the maturity plan doc), not tied to DEFAULT_BRIDGE_FT's current value.

test("traceConnectivity: a real drawn gap WITH a fitting symbol sitting in it bridges and reaches equipment", () => {
  // two genuinely disconnected runs, 8 real units apart — a real drawn gap,
  // not jitter buildMepGraph's own noding would already have closed.
  const g = graphOf([0, 0, 92, 0, 100, 0, 200, 0]);
  const r = traceConnectivity(g, [0, 0], {
    equipmentSymbols: [{ id: "AHU-1", at: [200, 0] }],
    fittingSymbols: [{ at: [96, 0] }],   // sits right in the middle of the gap
    mppf: 10, bridgeFt: 1,               // bridgePx = 10 — the 8-unit gap fits
  });
  assert.equal(r.status, "reached");
  assert.equal(r.reachedEquipment?.id, "AHU-1");
  assert.ok(r.factors.some((f) => f.startsWith("bridged-gap")), "the bridge is disclosed as a factor, not hidden");
  assert.ok(r.confidence < 1, "a bridged trace must discount confidence, never stay at a flat 1.0");
});

test("traceConnectivity: the identical gap with NO fitting symbol supplied stays a real dead_end — never bridged on proximity alone", () => {
  const g = graphOf([0, 0, 92, 0, 100, 0, 200, 0]);
  const r = traceConnectivity(g, [0, 0], {
    equipmentSymbols: [{ id: "AHU-1", at: [200, 0] }],
    mppf: 10, bridgeFt: 1,
    // no fittingSymbols at all
  });
  assert.equal(r.status, "dead_end", "no fitting symbol in the gap means no bridge, regardless of how close the two ends are");
});

test("traceConnectivity: a gap too WIDE to bridge stays dead_end even with a fitting symbol sitting exactly in it", () => {
  // gap is 50 real units; bridgePx below is only 10 — a real fitting symbol
  // in the middle of an overly wide gap must not be bridged just because
  // it's present; the gap itself has to be plausibly the fitting's own size.
  const g = graphOf([0, 0, 50, 0, 100, 0, 200, 0]);
  const r = traceConnectivity(g, [0, 0], {
    equipmentSymbols: [{ id: "AHU-1", at: [200, 0] }],
    fittingSymbols: [{ at: [75, 0] }],
    mppf: 10, bridgeFt: 1,
  });
  assert.equal(r.status, "dead_end");
});

// A real gap found live against the real Bessemer corpus, not a synthetic
// hunch: every fixture case above happens to seed exactly AT a drawn
// segment's own endpoint (that is how these tests were authored), so an
// earlier version of traceConnectivity that only matched EXISTING nodes
// passed every one of them and still refused almost every real seed — an
// estimator (or an agent) clicking partway along a real duct run, the
// ordinary realistic gesture, does not click on a vertex. Pinned here so it
// can never silently regress.
test("traceConnectivity: a seed clicked partway along a run (not at either endpoint) resolves and reaches equipment", () => {
  const g = graphOf([0, 0, 300, 0]);
  const r = traceConnectivity(g, [150, 0], { equipmentSymbols: [{ id: "AHU-1", at: [300, 0] }] });
  assert.equal(r.status, "reached");
  assert.equal(r.reachedEquipment?.id, "AHU-1");
});

test("traceConnectivity: an equipment placement that sits mid-edge (not at a drawn endpoint) is still reachable", () => {
  const g = graphOf([0, 0, 300, 0]);
  const r = traceConnectivity(g, [0, 0], { equipmentSymbols: [{ id: "AHU-1", at: [150, 0] }] });
  assert.equal(r.status, "reached");
  assert.equal(r.reachedEquipment?.id, "AHU-1");
});

test("traceConnectivity: a seed a few px off the run's own centerline (within seed_tol_ft) still resolves, not just exact hits", () => {
  const g = graphOf([0, 0, 300, 0]);
  const r = traceConnectivity(g, [150, 3], { equipmentSymbols: [{ id: "AHU-1", at: [300, 0] }] });
  assert.equal(r.status, "reached");
});

test("traceConnectivity: a fitting symbol sitting well OFF the gap's own line never bridges two unrelated dangling ends", () => {
  // the symbol is 50 units off to the side of the gap — nowhere near the
  // drawn linework itself, only spatially "close" in the loose sense
  // wallnetwork.ts's own doctrine already refuses to trust.
  const g = graphOf([0, 0, 92, 0, 100, 0, 200, 0]);
  const r = traceConnectivity(g, [0, 0], {
    equipmentSymbols: [{ id: "AHU-1", at: [200, 0] }],
    fittingSymbols: [{ at: [96, 50] }],
    mppf: 10, bridgeFt: 1,
  });
  assert.equal(r.status, "dead_end");
});
