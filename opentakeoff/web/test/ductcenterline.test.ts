// ductcenterline.ts (PLAN_CONNECTIVITY_SERVES.md Phase 3) — double-line
// duct centerline extraction. Pure, no PDF/DOM. Every fixture is a
// hand-built, exactly-known geometry (a straight strip, a right-angle
// elbow, a short stub) so the expected centerline can be derived by hand
// first and checked against the real output, the same discipline this
// project's own dashdetect.test.ts and mepconnectivity.test.ts already use.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findDuctPairs, assembleCenterlineNetwork, extractDuctCenterlines,
} from "../src/lib/ductcenterline.ts";

const PPF = 100; // 100 image-px per real foot, a convenient round number

test("findDuctPairs: a straight 60px-wide, 200px-long duct matches its two boundaries with the correct centerline", () => {
  const segs = [0, 0, 200, 0, 0, 60, 200, 60];
  const pairs = findDuctPairs(segs, PPF);
  assert.equal(pairs.length, 1);
  assert.deepEqual(pairs[0].at1, [0, 30]);
  assert.deepEqual(pairs[0].at2, [200, 30]);
  assert.equal(pairs[0].widthPx, 60);
});

test("findDuctPairs: two lines wider than the plausible-duct-width ceiling are never paired (a corridor, not a duct)", () => {
  // 5ft default ceiling * 100ppf = 500px; 600px is a plausible corridor width, not a duct
  const segs = [0, 0, 200, 0, 0, 600, 200, 600];
  assert.equal(findDuctPairs(segs, PPF).length, 0);
});

test("findDuctPairs: two lines narrower than the plausible-duct-width floor are never paired (a hairline/leader, not a duct)", () => {
  // 0.2ft default floor * 100ppf = 20px; 10px is a leader/hairline gap, not a duct
  const segs = [0, 0, 200, 0, 0, 10, 200, 10];
  assert.equal(findDuctPairs(segs, PPF).length, 0);
});

test("findDuctPairs: lines that don't overlap enough along the run axis are never paired (coincidental alignment, not a real boundary pair)", () => {
  // same infinite line and plausible width, but barely touching ranges
  const segs = [0, 0, 100, 0, 90, 60, 190, 60];
  assert.equal(findDuctPairs(segs, PPF).length, 0, "only 10/100px of overlap, well under the 50% floor");
});

test("findDuctPairs: two lines off-parallel beyond the angle tolerance are never paired", () => {
  const segs = [0, 0, 200, 0, 0, 60, 200, 90]; // second line visibly not parallel
  assert.equal(findDuctPairs(segs, PPF).length, 0);
});

test("assembleCenterlineNetwork: a single pair becomes one two-node edge", () => {
  const segs = [0, 0, 200, 0, 0, 60, 200, 60];
  const pairs = findDuctPairs(segs, PPF);
  const net = assembleCenterlineNetwork(pairs);
  assert.equal(net.nodes.length, 2);
  assert.equal(net.edges.length, 1);
  assert.equal(net.edges[0].widthPx, 60);
});

test("extractDuctCenterlines: a real right-angle elbow bridges its own corner gap, never joins the run's two genuinely open ends", () => {
  // outer boundary (0,0)->(200,0)->(200,-200); inner boundary offset 60px
  // "inward", cut short at the real inner corner: (0,60)->(140,60) and
  // (140,60)->(140,-200) — exactly the shape a real mitered double-line
  // elbow draws, and exactly where a naive "meet at a point" assumption
  // breaks (the two legs' own midlines do NOT meet — measured directly,
  // a real ~45px gap on a 60px-wide duct).
  const segs = [
    0, 0, 200, 0,
    0, 60, 140, 60,
    200, 0, 200, -200,
    140, 60, 140, -200,
  ];
  const net = extractDuctCenterlines(segs, PPF);
  // 4 real nodes (2 per leg) + exactly 1 synthesized corner bridge
  assert.equal(net.nodes.length, 4);
  assert.equal(net.edges.length, 3);
  const bridged = net.edges.filter((e) => e.bridged);
  assert.equal(bridged.length, 1, "exactly one corner bridge — the real elbow joint");
  assert.ok(bridged[0].length < 60, "the bridge spans the real, small corner gap, not a long unrelated distance");
  // the network is now ONE connected component, walkable end to end
  const visited = new Set([0]);
  const queue = [0];
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    for (const ei of net.nodes[cur].edges) {
      const e = net.edges[ei];
      const next = e.a === cur ? e.b : e.a;
      if (!visited.has(next)) { visited.add(next); queue.push(next); }
    }
  }
  assert.equal(visited.size, 4, "both legs are reachable from either end through the bridged corner");
  // the run's two genuine open ends (the outer edge of the horizontal leg
  // and the far end of the vertical leg) must stay dangling, never bridged
  // to each other — real, measured regression: an earlier version used a
  // sheet-wide tolerance and wrongly joined these two unrelated open ends
  // across a 289px gap.
  const openEnds = net.nodes.filter((n) => n.edges.length === 1);
  assert.equal(openEnds.length, 2);
});

test("extractDuctCenterlines: a short duct stub's own two real ends are never bridged to each other", () => {
  // 50px long, 60px wide — the stub's own two ends sit within what would
  // otherwise be a plausible corner-bridge tolerance for this width.
  // Real, measured regression: an earlier version bridged a stub's own
  // two ends to themselves, a meaningless parallel self-loop.
  const segs = [0, 0, 50, 0, 0, 60, 50, 60];
  const net = extractDuctCenterlines(segs, PPF);
  assert.equal(net.edges.length, 1, "no spurious self-bridge — just the one real centerline edge");
  assert.equal(net.edges.filter((e) => e.bridged).length, 0);
});

test("extractDuctCenterlines: two unrelated, well-separated straight ducts stay two separate networks", () => {
  const near = [0, 0, 200, 0, 0, 60, 200, 60];
  const far = [0, 2000, 200, 2000, 0, 2060, 200, 2060];
  const net = extractDuctCenterlines([...near, ...far], PPF);
  assert.equal(net.edges.filter((e) => !e.bridged).length, 2, "both real ducts are found");
  assert.equal(net.edges.filter((e) => e.bridged).length, 0, "distant, unrelated ducts are never bridged together");
});
