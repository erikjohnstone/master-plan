// #308 — label corroboration, pure layer. The numbers in the adjacency tests
// are the measured ones from the mixed-use renovation proof: true
// beside-the-symbol pairs at ~24 px with 17 px lettering, the nearest
// impostor (a same-shaped valve circle one fixture over) at 45 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalLabelFamily, labelTokens, labelPlacements, LABEL_ADJACENT_K, reconcileSweepLabels } from "../src/lib/symbollabels.ts";

const span = (str: string, x0: number, y0: number, w = 32, h = 17) => ({ str, x0, y0, x1: x0 + w, y1: y0 + h });

test("labelTokens: fixture tags in, prose and bare numbers out", () => {
  const kept = labelTokens([
    span("P-7", 0, 0), span("P-6A", 0, 0), span("FD1", 0, 0), span("CO", 0, 0),
    span("WC1", 0, 0), span("WH-1", 0, 0), span("T1", 0, 0),
    span("2", 0, 0),                        // keynote number — no letter, never a tag
    span("APPR", 0, 0),                     // ordinary drawing abbreviation
    span("VAV", 0, 0),                      // equipment word without an instance id
    span("D", 0, 0),                        // isolated note fragment
    span("M12", 0, 0),                      // mechanical detail/note reference
    span("PROVIDE", 0, 0),                  // prose word
    span("CONNECT NEW STORM", 0, 0),        // a sentence containing "CO"
    span('3/4"', 0, 0),                     // a dimension
  ]).map((s) => s.str);
  assert.deepEqual(kept, ["P-7", "P-6A", "FD1", "CO", "WC1", "WH-1", "T1"]);
});

test("labelTokens: bare instrument functions are tags, generic equipment words remain prose", () => {
  const kept = labelTokens([
    span("DPT", 0, 0), span("DPS", 0, 0), span("TT", 0, 0),
    span("T", 0, 0),
    span("VAV", 0, 0), span("AHU", 0, 0), span("APPR", 0, 0),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["DPT", "DPS", "TT"]);
  assert.deepEqual(kept.map((s) => s.family), ["DPT", "DPS", "TT"]);
});

test("labelTokens: repeated short control functions establish a bare instrument convention", () => {
  const kept = labelTokens([
    span("T", 0, 0), span("T", 100, 0),
    span("CS", 0, 100), span("CS", 100, 100),
    span("SS", 0, 200), span("SS", 100, 200),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["T", "T", "CS", "CS", "SS", "SS"]);
  assert.deepEqual(kept.map((s) => s.family), ["T", "T", "CS", "CS", "SS", "SS"]);
});

test("labelTokens: repeated bare BAS I/O functions establish an embedded point convention", () => {
  const kept = labelTokens([
    span("AI", 0, 0), span("AI", 100, 0),
    span("AO", 0, 100), span("AO", 100, 100),
    span("DI", 0, 200),
    span("DO", 0, 300),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["AI", "AI", "AO", "AO"]);
  assert.deepEqual(kept.map((s) => s.family), ["AI", "AI", "AO", "AO"]);
});

test("labelTokens: repeated building-controller classes and VFD are complete device marks", () => {
  const kept = labelTokens([
    span("B-ASC", 0, 0), span("B-ASC", 100, 0),
    span("B-GW", 200, 0),
    span("ASC", 0, 100), span("VFD", 100, 100),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["B-ASC", "B-ASC", "ASC", "VFD"]);
});

test("labelTokens: a reconstructed instrument ID consumes its bare prefix run", () => {
  const kept = labelTokens([
    span("TT", 100, 100, 18, 16), span("4", 106, 119, 6, 16),
    span("TT", 200, 100, 18, 16), span("5", 206, 119, 6, 16),
    span("ZS", 100, 200, 18, 16), span("3", 106, 219, 6, 16),
    span("ZS", 200, 200, 18, 16), span("4", 206, 219, 6, 16),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["TT-4", "TT-5", "ZS-3", "ZS-4"]);
});

test("labelTokens: a controls sentence ending in an equipment tag is prose, not an asset ID", () => {
  const kept = labelTokens([
    span("R1", 0, 0),
    span("AHU-1", 0, 0),
    span("RUN EXH-1", 0, 0),
    span("AND MAU-1", 0, 0),
    span("TO EF-2", 0, 0),
  ]).map((s) => s.str);
  assert.deepEqual(kept, ["R1", "AHU-1"]);
});

test("labelTokens: floor-prefixed equipment instances are tags, duct dimensions are not", () => {
  const kept = labelTokens([
    span("1-VAV-2", 0, 0), span("12-VAV-104A", 0, 0),
    span("20-8-SA", 0, 0), span("12-10-RA", 0, 0),
  ]).map((s) => s.str);
  assert.deepEqual(kept, ["1-VAV-2", "12-VAV-104A"]);
});

test("labelTokens: split inline type-airflow callouts retain the device family and exact type box", () => {
  const ss15 = span("SS15-", 100, 100, 40, 17);
  const kept = labelTokens([
    ss15, span("65", 142, 100, 16, 17),
    span("SS16-", 200, 100, 40, 17), span("115", 242, 100, 24, 17),
    span("AHU1-", 300, 100, 40, 17), span("2", 342, 100, 8, 17),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["SS15", "SS16"]);
  assert.deepEqual([kept[0].x0, kept[0].y0, kept[0].x1, kept[0].y1], [ss15.x0, ss15.y0, ss15.x1, ss15.y1]);
});

test("labelTokens: a PDF single-run type-airflow callout retains the family", () => {
  const kept = labelTokens([
    span("SS15- 65", 100, 100, 66, 17),
    span("SS16- 115", 200, 100, 75, 17),
    span("AHU1- 2", 300, 100, 60, 17),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["SS15", "SS16"]);
  assert.deepEqual([kept[0].x0, kept[0].y0, kept[0].x1, kept[0].y1], [100, 100, 166, 117]);
});

test("labelTokens: a divided control-element tag reassembles its stacked equipment identity", () => {
  const kept = labelTokens([
    span("BP", 100, 100, 20, 10), span("2", 107, 114, 6, 10),
    span("BP", 140, 100, 20, 10), span("1", 147, 114, 6, 10),
    span("PH", 200, 100, 20, 10), span("1", 207, 114, 6, 10),
    span("NOTE", 260, 100, 30, 10), span("1", 272, 130, 6, 10),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["BP-2", "BP-1"]);
  assert.deepEqual(kept.map((s) => s.family), ["BP", "BP"]);
  assert.deepEqual([kept[0].x0, kept[0].y0, kept[0].x1, kept[0].y1], [100, 100, 120, 124]);
});

test("labelTokens: stacked equipment suffixes may carry a building/wing prefix", () => {
  const kept = labelTokens([
    span("CU", 100, 100, 20, 10), span("B1", 104, 114, 12, 10),
    span("CU", 140, 100, 20, 10), span("B2", 144, 114, 12, 10),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["CU-B1", "CU-B2"]);
  assert.deepEqual(kept.map((s) => s.family), ["CU", "CU"]);
});

test("labelTokens: an isolated stacked room name and number is not equipment", () => {
  const kept = labelTokens([
    span("BATH", 100, 100, 44, 25), span("21C", 108, 132, 28, 25),
    span("BATH", 200, 100, 44, 25), span("21D", 208, 132, 28, 25),
  ]);
  assert.deepEqual(kept, []);
});

test("labelTokens: an explicit family tag corroborates one stacked instance", () => {
  const kept = labelTokens([
    span("VFD", 100, 100, 36, 20), span("2", 114, 124, 8, 20),
    span("VFD-1", 300, 100, 54, 20),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["VFD-2", "VFD-1"]);
  assert.equal(kept[0].family, "VFD");
});

test("labelTokens: divided BAS point bubbles reconstruct number over I/O type", () => {
  const kept = labelTokens([
    span("13", 100, 100, 18, 16), span("AI", 100, 119, 18, 16),
    span("10", 140, 100, 18, 16), span("AI", 140, 119, 18, 16),
    span("7", 220, 100, 9, 16), span("DI", 260, 119, 18, 16),
  ]);
  assert.deepEqual(kept.map((s) => s.str), ["AI-13", "AI-10"]);
  assert.deepEqual(kept.map((s) => s.family), ["AI", "AI"]);
  assert.deepEqual([kept[0].x0, kept[0].y0, kept[0].x1, kept[0].y1], [100, 100, 118, 135]);
});

test("adjacency: a stacked BAS point identity attaches inside its divided bubble", () => {
  const labels = labelPlacements(
    [[109, 117], [149, 117]],
    [
      span("13", 100, 100, 18, 16), span("AI", 100, 119, 18, 16),
      span("10", 140, 100, 18, 16), span("AI", 140, 119, 18, 16),
    ],
    [], undefined,
  );
  assert.deepEqual(labels.map((label) => label?.label), ["AI-13", "AI-10"]);
  assert.deepEqual(labels.map((label) => label?.family), ["AI", "AI"]);
});

test("adjacency: repeated stacked instrument IDs attach inside their own divided bubbles", () => {
  const labels = labelPlacements(
    [[109, 117], [209, 117]],
    [
      span("TT", 100, 100, 18, 16), span("4", 106, 119, 6, 16),
      span("TT", 200, 100, 18, 16), span("5", 206, 119, 6, 16),
      // Nearby sibling instruments establish the same drafting convention
      // but must not steal either temperature-transmitter placement.
      span("IT", 130, 100, 18, 16), span("2", 136, 119, 6, 16),
      span("IT", 230, 100, 18, 16), span("1", 236, 119, 6, 16),
    ],
    [], undefined,
  );
  assert.deepEqual(labels.map((label) => label?.label), ["TT-4", "TT-5"]);
  assert.deepEqual(labels.map((label) => label?.via), ["adjacent", "adjacent"]);
  assert.deepEqual(labels.map((label) => label?.family), ["TT", "TT"]);
  assert.deepEqual(labels[0]?.token_bbox, [100, 100, 118, 135]);
  assert.deepEqual(labels[1]?.token_bbox, [200, 100, 218, 135]);
});

test("adjacency: stacked position-switch IDs attach inside their own end-switch bubbles", () => {
  const labels = labelPlacements(
    [[109, 117], [209, 117]],
    [
      span("ZS", 100, 100, 18, 16), span("3", 106, 119, 6, 16),
      span("ZS", 200, 100, 18, 16), span("4", 206, 119, 6, 16),
    ],
    [], undefined,
  );
  assert.deepEqual(labels.map((label) => label?.label), ["ZS-3", "ZS-4"]);
  assert.deepEqual(labels.map((label) => label?.family), ["ZS", "ZS"]);
  assert.deepEqual(labels.map((label) => label?.via), ["adjacent", "adjacent"]);
});

test("adjacency: an embedded end-switch ID cannot reach outward and rename a neighboring damper", () => {
  const labels = labelPlacements(
    [[109, 117], [109, 190]],
    [
      span("ZS", 100, 100, 18, 16), span("3", 106, 119, 6, 16),
      span("ZS", 200, 100, 18, 16), span("4", 206, 119, 6, 16),
    ],
    [], undefined,
  );
  assert.equal(labels[0]?.label, "ZS-3", "the point function owns its enclosing bubble");
  assert.equal(labels[1], null, "the same tall token block cannot label a nearby actuator outside its footprint");
});

test("adjacency: an embedded end-switch owns its bubble centerline just beyond the text union", () => {
  const [label] = labelPlacements(
    [[120.3, 117]],
    [
      span("ZS", 100, 100, 18, 16), span("2", 106, 119, 6, 16),
      span("ZS", 200, 100, 18, 16), span("1", 206, 119, 6, 16),
    ],
    [], undefined,
  );
  assert.equal(label?.label, "ZS-2");
});

test("label corroboration treats stacked instrument IDs as repeatable point functions, not unique equipment", () => {
  const seed = { label: "TT-1", family: "TT", via: "adjacent" as const, distance_px: 1, token_bbox: [0, 0, 20, 40] as [number, number, number, number] };
  const repeated = [
    { label: "TT-2", family: "TT", via: "adjacent" as const, distance_px: 1, token_bbox: [100, 0, 120, 40] as [number, number, number, number] },
    { label: "TT-2", family: "TT", via: "adjacent" as const, distance_px: 1, token_bbox: [200, 0, 220, 40] as [number, number, number, number] },
  ];
  const rows = [
    { at: [110, 20] as [number, number], score: 1, rotation: 0, mirrored: false },
    { at: [210, 20] as [number, number], score: 0.99, rotation: 0, mirrored: false },
  ];
  const result = reconcileSweepLabels(seed, rows, repeated, [], []);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matchLabels.map((label) => label?.label), ["TT-2", "TT-2"]);
});

test("adjacency: stacked control-element tags name both physical instances and retain their structural family", () => {
  const labels = labelPlacements(
    [[150, 112], [350, 112]],
    [
      span("BP", 100, 100, 20, 10), span("2", 107, 114, 6, 10),
      span("BP", 300, 100, 20, 10), span("1", 307, 114, 6, 10),
    ],
    [], undefined,
  );
  assert.deepEqual(labels.map((label) => label?.label), ["BP-2", "BP-1"]);
  assert.deepEqual(labels.map((label) => label?.family), ["BP", "BP"]);
  assert.deepEqual(labels[0]?.token_bbox, [100, 100, 120, 124]);
  assert.deepEqual(labels[1]?.token_bbox, [300, 100, 320, 124]);
});

test("adjacency: inline type-airflow family attaches to its own air-device body", () => {
  const r = labelPlacements(
    [[120, 136]],
    [span("SS15-", 100, 100, 40, 17), span("65", 142, 100, 16, 17)],
    [], undefined,
  );
  assert.equal(r[0]?.label, "SS15");
  assert.deepEqual(r[0]?.token_bbox, [100, 100, 140, 117]);
});

test("adjacency: the text-height radius takes the true pair and refuses the impostor", () => {
  // one FD1 token, 17 px lettering — radius is 2.2 × 17 ≈ 37 px
  const tokens = [span("FD1", 1616, 1465)];
  const [truePair, impostor] = labelPlacements(
    [[1652, 1488], [1677, 1469]],           // measured: 24 px and 45 px from token center
    tokens, [], undefined,
  );
  assert.equal(truePair?.label, "FD1");
  assert.equal(truePair?.via, "adjacent");
  assert.ok(truePair!.distance_px <= LABEL_ADJACENT_K * 17 + 1);
  assert.equal(impostor, null, "the 45 px valve circle is NOT named — no label reached it");
});

test("adjacency: nearest token wins when two are in range", () => {
  const r = labelPlacements([[100, 100]], [span("FD", 52, 92, 24), span("CO", 108, 92, 24)], [], undefined);
  // FD center (64, 100.5) is 36 px away; CO center (120, 100.5) is 20 px away
  assert.equal(r[0]?.label, "CO", "the closer token names the placement");
});

test("adjacency: a vertically stacked type / airflow / symbol callout reaches past the value line", () => {
  // Cherry Point MH111: CD-1 type at y≈307, 130 CFM beneath it, symbol at
  // y≈394. The type is 3.5 text heights away but horizontally aligned.
  const r = labelPlacements([[2927, 394]], [span("CD-1", 2910, 294, 47, 25), span("130 CFM", 2900, 325, 70, 25)], [], undefined);
  assert.equal(r[0]?.label, "CD-1");
  assert.equal(r[0]?.via, "adjacent");
});

test("adjacency: the stacked extension is directional, not a wider neighbor radius", () => {
  const r = labelPlacements([[3000, 307]], [span("CD-1", 2910, 294, 47, 25)], [], undefined);
  assert.equal(r[0], null, "without a paired airflow value, a horizontal neighbor stays unnamed");
});

test("adjacency: a structured type/CFM callout beats a fractionally closer generic drawing token", () => {
  const r = labelPlacements(
    [[2303, 1825]],
    [span("CD-1", 2341, 1784, 47, 25), span("110 CFM", 2334, 1810, 70, 25), span("M110", 2260, 1790, 30, 31)],
    [], undefined,
  );
  assert.equal(r[0]?.label, "CD-1");
});

test("adjacency: one token names at most one placement", () => {
  const r = labelPlacements([[98, 130], [104, 130]], [span("FD1", 90, 92, 12)], [], undefined);
  assert.equal(r.filter(Boolean).length, 1, "one drawn tag cannot be cloned across two symbol candidates");
  assert.equal(r[0]?.label, "FD1", "the closer placement owns the token");
  assert.equal(r[1], null);
});

test("adjacency: a BAS point identifier may live inside its callout capsule", () => {
  const point = labelPlacements([[100, 100]], [span("RT-AI-01", 55, 88, 90, 24)], [], undefined);
  assert.equal(point[0]?.label, "RT-AI-01");
  assert.equal(point[0]?.via, "adjacent");
  assert.deepEqual(point[0]?.token_bbox, [55, 88, 145, 112]);

  const fixture = labelPlacements([[100, 100]], [span("P-7", 84, 92, 32, 17)], [], undefined);
  assert.equal(fixture[0], null, "ordinary fixture text inside a candidate remains an outlined-text decoy");
});

test("adjacency: global assignment preserves two real pairs instead of greedily stranding one", () => {
  // P0 can reach both tags and is fractionally closer to FD1. P1 can reach
  // only FD1. A placement-by-placement greedy walk gives P0 FD1 and leaves P1
  // blank; the maximum-cardinality assignment gives both a unique tag.
  const r = labelPlacements(
    [[100, 100], [75, 100]],
    [span("FD1", 78, 92, 12), span("CO1", 112, 92, 12)],
    [], undefined,
  );
  assert.equal(r[0]?.label, "CO1");
  assert.equal(r[1]?.label, "FD1");
});

test("a labeled sweep prefers the seed family over a nearer sibling tag", () => {
  const r = labelPlacements(
    [[100, 100]],
    [span("CD-1", 50, 84, 30, 17), span("RG-1", 76, 84, 30, 17)],
    [], undefined, { preferredLabel: "CD-1" },
  );
  assert.equal(r[0]?.label, "CD-1");
});

test("multi-part equipment instance tags share a stable symbol family", () => {
  assert.equal(canonicalLabelFamily("VAV-E-101"), "VAV-E");
  assert.equal(canonicalLabelFamily("VAV-E-105"), "VAV-E");
  assert.equal(canonicalLabelFamily("VAV-F-102"), "VAV-F");
  assert.equal(canonicalLabelFamily("CD-A13"), "CD-A");
  assert.equal(canonicalLabelFamily("CD-A17"), "CD-A");
  assert.equal(canonicalLabelFamily("1-VAV-2"), "1-VAV");
  assert.equal(canonicalLabelFamily("1-VAV-18"), "1-VAV");
  assert.equal(canonicalLabelFamily("HWP-1"), "HWP");
  assert.equal(canonicalLabelFamily("HWP-2"), "HWP");
  assert.equal(canonicalLabelFamily("BCP-1"), "BCP");
  assert.equal(canonicalLabelFamily("AHU-12A"), "AHU");
  assert.equal(canonicalLabelFamily("CD-1"), "CD-1", "two-part schedule marks remain exact");
  assert.equal(canonicalLabelFamily("P-6A"), "P-6A", "digit-led schedule variants remain exact");
});

test("adjacency: a floor-prefixed VAV tag gets equipment-instance reach", () => {
  const r = labelPlacements([[2646, 1388]], [span("1-VAV-2", 2628, 1332, 72, 18)], [], undefined);
  assert.equal(r[0]?.label, "1-VAV-2");
});

test("adjacency: a multi-part equipment instance reaches its large symbol without widening fixture tags", () => {
  const equipment = labelPlacements([[1985, 2399]], [span("VAV-E-105", 1851, 2425, 95, 19)], [], undefined);
  assert.equal(equipment[0]?.label, "VAV-E-105");
  const fixture = labelPlacements([[1985, 2399]], [span("P-7", 1851, 2425, 95, 19)], [], undefined);
  assert.equal(fixture[0], null);
});

test("adjacency: a quarter-turned equipment tag scales reach by letter height, not word length", () => {
  const verticalTag = { ...span("CC-A-1", 100, 100, 19, 54), rot: 90 };
  const [local, neighboringComponent] = labelPlacements(
    [[180, 127], [300, 127]],
    [verticalTag],
    [], undefined,
    { scores: [1, 1], symbolInkLengthPx: 300 },
  );
  assert.equal(local?.label, "CC-A-1", "the local component remains inside the calibrated equipment reach");
  assert.equal(neighboringComponent, null, "the vertical word length cannot inflate reach onto the next component");
});

test("equipment tags cannot rename a tiny remote point glyph through broad reach", () => {
  const token = span("FCU-5", 140, 140, 35, 44);
  const [point] = labelPlacements(
    [[100, 100]], [token], [], undefined,
    { scores: [1], symbolInkLengthPx: 63.6 },
  );
  assert.equal(point, null, "a small thermostat fingerprint is not FCU-scale geometry");

  const [equipment] = labelPlacements(
    [[100, 100]], [token], [], undefined,
    { scores: [1], symbolInkLengthPx: 400 },
  );
  assert.equal(equipment?.label, "FCU-5", "the same local tag still reaches a real equipment-scale fingerprint");
});

test("adjacency: a compact control-damper instance reaches its assembly", () => {
  const r = labelPlacements([[2695, 672]], [span("CD-A13", 2690, 722, 66, 17)], [], undefined);
  assert.equal(r[0]?.label, "CD-A13");
});

test("adjacency: a BAS sensor tag gets point reach without widening ordinary fixture tags", () => {
  // Orange County M-201: TS-1 sits roughly 3.2 text heights from the center
  // of its square/AI assembly. That is a normal controls-schematic layout,
  // while the same gap is too broad for a generic P-7 fixture callout.
  const sensor = labelPlacements([[100, 100]], [span("TS-1", 45, 67, 30, 17)], [], undefined);
  assert.equal(sensor[0]?.label, "TS-1");
  const valve = labelPlacements([[100, 100]], [span("CV-1", 45, 67, 30, 17)], [], undefined);
  assert.equal(valve[0]?.label, "CV-1", "control-valve tags use the same schematic spacing convention");
  const fixture = labelPlacements([[100, 100]], [span("P-7", 45, 67, 30, 17)], [], undefined);
  assert.equal(fixture[0], null);
});

test("adjacency: repeatable controller classes reach their module bodies without becoming unique assets", () => {
  const labels = labelPlacements(
    [[100, 100], [300, 100], [500, 100]],
    [span("B-ASC", 78, 24, 44, 16), span("B-ASC", 278, 24, 44, 16), span("VFD", 486, 24, 28, 16)],
    [], undefined, { preferredLabel: "B-ASC", scores: [1, 1, 1] },
  );
  assert.deepEqual(labels.map((label) => label?.label), ["B-ASC", "B-ASC", "VFD"]);
  const rows = [
    { at: [300, 100] as [number, number], score: 1, rotation: 0, mirrored: false },
    { at: [500, 100] as [number, number], score: 1, rotation: 0, mirrored: false },
  ];
  const result = reconcileSweepLabels(labels[0], rows, labels.slice(1), [], []);
  assert.deepEqual(result.matches, [rows[0]]);
  assert.equal(result.withheld[0].at[0], 500);
  assert.equal(result.withheldLabels[0]?.label, "VFD");
});

test("within one tag family, stronger symbol geometry beats a nearby text-shaped decoy", () => {
  const r = labelPlacements(
    [[100, 100], [100, 170]],
    [span("CD-1", 84, 92, 32, 17), span("130 CFM", 70, 114, 60, 17)],
    [], undefined, { preferredLabel: "CD-1", scores: [0.48, 0.93] },
  );
  assert.equal(r[0], null, "the token cannot label the candidate sitting inside its own glyph box");
  assert.equal(r[1]?.label, "CD-1");
});

test("a committed tag-bearing glyph may own the compact token drawn inside it", () => {
  const [label] = labelPlacements(
    [[100, 100]],
    [span("T1", 92, 92, 16, 16)],
    [], undefined, { scores: [0.97] },
  );
  assert.equal(label?.label, "T1");
  assert.equal(label?.via, "adjacent");
});

test("a bare BAS instrument function may name only its own committed bubble", () => {
  const labels = labelPlacements(
    [[100, 100], [200, 100]],
    [span("DPT", 84, 92, 32, 16), span("DPS", 184, 92, 32, 16)],
    [], undefined, { preferredLabel: "DPT", scores: [0.98, 0.98] },
  );
  assert.equal(labels[0]?.label, "DPT");
  assert.equal(labels[0]?.family, "DPT");
  assert.equal(labels[1]?.label, "DPS");
  assert.equal(labels[1]?.family, "DPS");
});

test("within one tag family, geometry beats an offset hypothesis that only wins on text distance", () => {
  // One physical diffuser can cast several partial-transform hypotheses. The
  // label is slightly closer to the offset reading, but the stronger vector
  // peak is the correct marker location.
  const r = labelPlacements(
    [[100, 152], [84, 166]],
    [span("CD-1", 76, 88, 48, 25), span("130 CFM", 66, 116, 68, 25)],
    [], undefined, { preferredLabel: "CD-1", scores: [0.76, 0.90] },
  );
  assert.equal(r[0], null);
  assert.equal(r[1]?.label, "CD-1");
});

test("a structured callout chases its own leader to the strong symbol past a weak nearby decoy", () => {
  // Cherry Point MH111's ninth CD-1 is 7.41 lettering heights from its
  // diffuser. A dark leader begins just outside the combined CD-1 / 120 CFM
  // block and ends at the symbol; grey work elsewhere arms multi-pen chase.
  const segs = [176, 122, 250, 168, 800, 800, 1200, 800];
  const lum = Uint8Array.from([0, 219]);
  const r = labelPlacements(
    [[160, 110], [260, 170]],
    [
      span("CD-1", 100, 100, 40, 20),
      span("110 CFM", 130, 50, 64, 20), // previous fixture's value: not part of this block
      span("120 CFM", 92, 123, 64, 20),
    ],
    segs, lum, { preferredLabel: "CD-1", scores: [0.47, 0.91] },
  );
  assert.equal(r[0], null);
  assert.equal(r[1]?.label, "CD-1");
});

test("leader: on a multi-pen sheet the chase follows the dark leader to the symbol", () => {
  // grey work (lum 219): a symbol at (400, 200) and one at (400, 500);
  // black leader (lum 0) from beside the token to the first symbol only.
  const segs = [
    400, 190, 410, 210,                     // grey symbol ink near placement 1
    400, 490, 410, 510,                     // grey symbol ink near placement 2
    132, 205, 260, 203,                     // leader tail: starts 4 px right of token edge
    260, 203, 385, 202,                     // leader second hop, ends at the symbol
  ];
  const lum = Uint8Array.from([219, 219, 0, 0]);
  const tokens = [span("P-7", 96, 196)];    // token right edge at x=128, mid-height ~204
  const [led, unled] = labelPlacements([[400, 200], [400, 500]], tokens, segs, lum);
  assert.equal(led?.label, "P-7");
  assert.equal(led?.via, "leader");
  assert.equal(unled, null, "no leader reaches the second symbol");
});

test("leader: after the text pickup, it cannot jump a gap into unrelated linework", () => {
  const segs = [
    132, 205, 220, 205,   // real leader segment from the token
    230, 205, 385, 202,   // unrelated line 10 px away: old 14 px every-hop walk bridged it
    800, 800, 1200, 800,  // grey ink makes the sheet multi-pen
  ];
  const lum = Uint8Array.from([0, 0, 219]);
  const r = labelPlacements([[400, 200]], [span("P-7", 96, 196)], segs, lum);
  assert.equal(r[0], null);
});

test("leader: a one-pen sheet never chases — a wall is not a leader", () => {
  // identical geometry, but EVERYTHING is dark: the 'leader' could as well be
  // a wall, so the chase must stay disarmed and the placement unnamed.
  const segs = [
    400, 190, 410, 210,
    132, 205, 260, 203,
    260, 203, 385, 202,
  ];
  const lum = Uint8Array.from([0, 0, 0]);
  const r = labelPlacements([[400, 200]], [span("P-7", 96, 196)], segs, lum);
  assert.equal(r[0], null, "single-pen sheet: adjacency only, and this token is not adjacent");
});

test("leader: a one-pen sheet may chase a short, multi-part equipment-instance callout", () => {
  const segs = [
    172, 205, 260, 203,
    260, 203, 385, 202,
  ];
  const lum = Uint8Array.from([0, 0]);
  const r = labelPlacements([[400, 200]], [span("VAV-E-105", 96, 196, 72)], segs, lum);
  assert.equal(r[0]?.label, "VAV-E-105");
  assert.equal(r[0]?.via, "leader");
});

test("leader: a quarter-turned inline equipment mark cannot chase connected system linework", () => {
  // H-A-3 is printed vertically inside a heating-coil rectangle on an HVAC
  // airflow diagram. The rectangle joins the duct leading to a supply fan;
  // that physical connection is not an annotation leader for the coil tag.
  const segs = [
    108, 200, 385, 200,
    800, 800, 1200, 800,
  ];
  const lum = Uint8Array.from([0, 219]);
  const token = { ...span("H-A-3", 96, 144, 17, 56), rot: 90 };
  const [fan] = labelPlacements([[400, 200]], [token], segs, lum, { symbolInkLengthPx: 300 });
  assert.equal(fan, null);
});

test("leader: an equipment route cannot turn a tiny inline sensor into the remote asset", () => {
  const segs = [172, 205, 260, 203, 260, 203, 385, 202];
  const lum = Uint8Array.from([0, 0]);
  const [point] = labelPlacements(
    [[400, 200]], [span("FCU-5", 96, 196, 72, 44)], segs, lum,
    { scores: [1], symbolInkLengthPx: 63.6 },
  );
  assert.equal(point, null);
});

test("leader: a multi-part equipment callout may begin at a tag-box corner", () => {
  const segs = [
    182, 225, 270, 215,
    270, 215, 385, 202,
  ];
  const lum = Uint8Array.from([0, 0]);
  const r = labelPlacements([[400, 200]], [span("VAV-E-105", 96, 196, 72)], segs, lum);
  assert.equal(r[0]?.label, "VAV-E-105");
  assert.equal(r[0]?.via, "leader");
});

test("leader: a literal equipment route beats a neighboring instance inside the wide adjacency gate", () => {
  const segs = [
    172, 205, 260, 203,
    260, 203, 385, 202,
  ];
  const lum = Uint8Array.from([0, 0]);
  const [near, led] = labelPlacements(
    [[155, 205], [400, 200]],
    [span("VAV-E-105", 96, 196, 72)],
    segs, lum,
  );
  assert.equal(near, null, "broad equipment adjacency cannot steal a tag with a literal route");
  assert.equal(led?.label, "VAV-E-105");
  assert.equal(led?.via, "leader");
});

test("leader: equipment evidence lands on the strongest peak of the same physical symbol", () => {
  // A compound thermostat/keynote marker can cast an offset partial peak.
  // Its literal equipment leader ends at that edge, while the stronger peak
  // 14 px away is the canonical center of the same ink. The leader should
  // identify the occurrence without degrading the reported geometry.
  const segs = [172, 205, 260, 203, 260, 203, 385, 202];
  const lum = Uint8Array.from([0, 0]);
  const [edgePeak, canonicalPeak] = labelPlacements(
    [[400, 200], [414, 200]],
    [span("1-VAV-7", 96, 196, 72, 13)],
    segs, lum, { scores: [0.741, 0.756] },
  );
  assert.equal(edgePeak, null, "the weaker offset transform cannot own the equipment tag");
  assert.equal(canonicalPeak?.label, "1-VAV-7");
  assert.equal(canonicalPeak?.via, "leader");
});

test("an incidental equipment leader cannot displace a stronger broad-adjacent peak", () => {
  // One equipment token can sit near its real thermostat while a short dark
  // run from the tag happens to reach a weaker keynote/linework hypothesis.
  // Seed-family preference resolves competition BETWEEN tags; it must not
  // distort this token's own choice of physical geometry.
  const segs = [172, 205, 195, 205];
  const lum = Uint8Array.from([0]);
  const [weakLeader, realAdjacent] = labelPlacements(
    [[210, 205], [180, 250]],
    [span("1-VAV-13", 96, 196, 72, 17)],
    segs, lum, { preferredLabel: "1-VAV-2", scores: [0.527, 0.659] },
  );
  assert.equal(weakLeader, null);
  assert.equal(realAdjacent?.label, "1-VAV-13");
  assert.equal(realAdjacent?.via, "adjacent");
});

test("adjacent beats leader when both could name a placement", () => {
  const segs = [132, 205, 385, 202];        // dark leader straight to the symbol
  const lum = Uint8Array.from([0]);
  // make the sheet multi-pen by adding grey ink elsewhere
  const segs2 = [...segs, 800, 800, 1200, 800];
  const lum2 = Uint8Array.from([0, 219]);
  const tokens = [span("P-7", 96, 196), span("FD", 384, 214, 24)]; // FD written right at the symbol
  const r = labelPlacements([[400, 200]], tokens, segs2, lum2);
  assert.equal(r[0]?.via, "adjacent");
  assert.equal(r[0]?.label, "FD");
});

test("no tokens, no work: every placement comes back null", () => {
  const r = labelPlacements([[1, 1], [2, 2]], [span("PROVIDE", 0, 0)], [], undefined);
  assert.deepEqual(r, [null, null]);
});

test("label corroboration promotes same-tag near-matches and demotes different-tag matches", () => {
  const seed = { label: "CD-1", via: "leader" as const, distance_px: 2 };
  const same = { label: "CD-1", via: "leader" as const, distance_px: 3 };
  const sibling = { label: "RG-1", via: "adjacent" as const, distance_px: 8 };
  const rawMatch = { at: [40, 20] as [number, number], score: 0.96, rotation: 0, mirrored: false };
  const rawWithheld = { at: [20, 20] as [number, number], score: 0.84, rotation: 0, mirrored: false, reason: "near" };
  const r = reconcileSweepLabels(seed, [rawMatch], [sibling], [rawWithheld], [same]);
  assert.equal(r.promoted, 1);
  assert.equal(r.demoted, 1);
  assert.deepEqual(r.matches.map((m) => m.at), [[20, 20]]);
  assert.equal(r.matchLabels[0]?.label, "CD-1");
  assert.deepEqual(r.withheld.map((m) => m.at), [[40, 20]]);
  assert.equal(r.withheldLabels[0]?.label, "RG-1");
  assert.match(r.withheld[0].reason, /outside the seed family/);
});

test("preferred family cannot steal a weak candidate through broad equipment adjacency", () => {
  const [label] = labelPlacements(
    [[500, 28]],
    [span("EP-1", 250, 0, 24, 56), span("CHW-1", 400, 0, 42, 56)],
    [], undefined, { preferredLabel: "EP-2", scores: [0.455] },
  );
  assert.equal(label?.label, "CHW-1", "the much closer physical label wins over a far preferred-family edge");
});

test("label corroboration retains a different instance in the same multi-part equipment family", () => {
  const seed = { label: "VAV-E-101", via: "adjacent" as const, distance_px: 12 };
  const sibling = { label: "VAV-E-105", via: "adjacent" as const, distance_px: 10 };
  const otherFamily = { label: "VAV-F-102", via: "adjacent" as const, distance_px: 10 };
  const a = { at: [20, 20] as [number, number], score: 0.96, rotation: 0, mirrored: false };
  const b = { at: [40, 20] as [number, number], score: 0.96, rotation: 0, mirrored: false };
  const r = reconcileSweepLabels(seed, [a, b], [sibling, otherFamily], [], []);
  assert.deepEqual(r.matches.map((m) => m.at), [[20, 20]]);
  assert.equal(r.matchLabels[0]?.label, "VAV-E-105", "the exact nearby instance tag is retained");
  assert.deepEqual(r.withheld.map((m) => m.at), [[40, 20]]);
});

test("label corroboration retains different instances from one stacked control-element family", () => {
  const seed = { label: "BP-2", family: "BP", via: "leader" as const, distance_px: 8, token_bbox: [0, 0, 20, 24] as [number, number, number, number] };
  const sibling = { label: "BP-1", family: "BP", via: "leader" as const, distance_px: 7, token_bbox: [100, 0, 120, 24] as [number, number, number, number] };
  const row = { at: [120, 20] as [number, number], score: 1, rotation: 0, mirrored: false };
  const result = reconcileSweepLabels(seed, [row], [sibling], [], []);
  assert.deepEqual(result.matches, [row]);
  assert.equal(result.matchLabels[0]?.label, "BP-1");
  assert.equal(result.demoted, 0);
});

test("label corroboration compares stacked-tag lettering height, not suffix width", () => {
  const seed = {
    label: "CU-B1", family: "CU", via: "leader" as const, distance_px: 8,
    token_bbox: [0, 0, 26, 43] as [number, number, number, number], text_height_px: 19,
  };
  const widerSuffix = {
    label: "CU-BO1", family: "CU", via: "leader" as const, distance_px: 8,
    token_bbox: [100, 0, 137, 43] as [number, number, number, number], text_height_px: 19,
  };
  const row = { at: [120, 80] as [number, number], score: 0.93, rotation: 0, mirrored: false };
  const result = reconcileSweepLabels(seed, [row], [widerSuffix], [], []);
  assert.deepEqual(result.matches, [row]);
  assert.equal(result.demoted, 0);
});

test("label corroboration treats numbered relay coils as one controls-symbol family", () => {
  const seed = { label: "R1", via: "adjacent" as const, distance_px: 12 };
  const rows = [
    { at: [20, 20] as [number, number], score: 1, rotation: 0, mirrored: false },
    { at: [40, 20] as [number, number], score: 1, rotation: 0, mirrored: false },
  ];
  const result = reconcileSweepLabels(seed, rows, [
    { label: "R2", via: "adjacent", distance_px: 10 },
    { label: "EF-3", via: "adjacent", distance_px: 10 },
  ], [], []);
  assert.deepEqual(result.matches, [rows[0]], "a differently numbered relay is the same drawn device family");
  assert.equal(result.matchLabels[0]?.label, "R2");
  assert.deepEqual(result.withheld.map((row) => row.at), [[40, 20]], "a fan/contactor coil remains a different device");
});

test("label corroboration collapses transform peaks inside one claimed instrument tag footprint", () => {
  const seed = {
    label: "DPT", family: "DPT", via: "adjacent" as const, distance_px: 1,
    token_bbox: [90, 90, 110, 110] as [number, number, number, number],
  };
  const dpt = {
    label: "DPT", family: "DPT", via: "adjacent" as const, distance_px: 1,
    token_bbox: [190, 90, 210, 110] as [number, number, number, number],
  };
  const dps = {
    label: "DPS", family: "DPS", via: "adjacent" as const, distance_px: 1,
    token_bbox: [290, 90, 310, 110] as [number, number, number, number],
  };
  const rows = [
    { at: [200, 100] as [number, number], score: 1, rotation: 0, mirrored: false },
    { at: [206, 100] as [number, number], score: 0.95, rotation: 90, mirrored: false },
    { at: [300, 100] as [number, number], score: 1, rotation: 0, mirrored: false },
    { at: [306, 100] as [number, number], score: 0.95, rotation: 90, mirrored: false },
  ];
  const result = reconcileSweepLabels(seed, rows, [dpt, null, dps, null], [], []);
  assert.deepEqual(result.matches, [rows[0]], "the DPT mate counts exactly once");
  assert.equal(result.withheld.length, 3, "the DPS sibling and both duplicate transform readings are review rows");
  assert.equal(result.demoted, 3);
  assert.match(result.withheld.map((row) => row.reason).join(" "), /one physical symbol occurrence/);
});

test("label corroboration keeps floor-prefixed equipment in the seeded annotation context", () => {
  const seed = { label: "1-VAV-2", via: "adjacent" as const, distance_px: 12, token_bbox: [0, 0, 40, 13] as [number, number, number, number] };
  const thermostat = { label: "1-VAV-3", via: "adjacent" as const, distance_px: 10, token_bbox: [50, 0, 90, 13] as [number, number, number, number] };
  const terminal = { label: "1-VAV-4", via: "leader" as const, distance_px: 10, token_bbox: [100, 0, 172, 19] as [number, number, number, number] };
  const a = { at: [20, 20] as [number, number], score: 0.80, rotation: 0, mirrored: false };
  const b = { at: [40, 20] as [number, number], score: 0.95, rotation: 0, mirrored: false };
  const r = reconcileSweepLabels(seed, [a, b], [thermostat, terminal], [], []);
  assert.deepEqual(r.matches.map((m) => m.at), [[20, 20]]);
  assert.match(r.withheld[0].reason, /different equipment annotation context/);
});

test("label corroboration gives one physical placement to each unique equipment instance ID", () => {
  const box = [0, 0, 40, 13] as [number, number, number, number];
  const seed = { label: "1-VAV-2", via: "adjacent" as const, distance_px: 2, token_bbox: box };
  const repeatedSeed = { label: "1-VAV-2", via: "leader" as const, distance_px: 4, token_bbox: box };
  const weak = { label: "1-VAV-3", via: "adjacent" as const, distance_px: 3, token_bbox: box };
  const strong = { label: "1-VAV-3", via: "leader" as const, distance_px: 9, token_bbox: box };
  const rows = [
    { at: [20, 20] as [number, number], score: 0.99, rotation: 0, mirrored: false },
    { at: [40, 20] as [number, number], score: 0.76, rotation: 0, mirrored: false },
    { at: [60, 20] as [number, number], score: 0.94, rotation: 0, mirrored: false },
  ];
  const r = reconcileSweepLabels(seed, rows, [repeatedSeed, weak, strong], [], []);
  assert.deepEqual(r.matches.map((m) => m.at), [[60, 20]]);
  assert.equal(r.demoted, 2);
  assert.match(r.withheld[0].reason + r.withheld[1].reason, /seeded asset/);
  assert.match(r.withheld[0].reason + r.withheld[1].reason, /multiple geometric claimants/);
});

test("label corroboration preserves a repeated equipment type proven by distinct drawn tag blocks", () => {
  const seed = {
    label: "FCU-5", family: "FCU", via: "adjacent" as const, distance_px: 20,
    token_bbox: [0, 0, 36, 44] as [number, number, number, number],
  };
  const labels = [
    { ...seed, token_bbox: [100, 0, 136, 44] as [number, number, number, number] },
    { ...seed, token_bbox: [200, 0, 236, 44] as [number, number, number, number] },
  ];
  const rows = [
    { at: [118, 80] as [number, number], score: 0.93, rotation: 0, mirrored: false },
    { at: [218, 80] as [number, number], score: 0.88, rotation: 0, mirrored: false },
  ];
  const r = reconcileSweepLabels(seed, rows, labels, [], []);
  assert.deepEqual(r.matches, rows, "three independent FCU-5 tag boxes prove a repeated schedule type");
  assert.equal(r.demoted, 0);
});

test("label corroboration does not collapse repeated BAS point templates as unique equipment", () => {
  const box = [0, 0, 30, 17] as [number, number, number, number];
  const seed = { label: "DPS-1", via: "adjacent" as const, distance_px: 20, token_bbox: box };
  const labels = [
    { ...seed, token_bbox: [100, 0, 130, 17] as [number, number, number, number] },
    { ...seed, token_bbox: [200, 0, 230, 17] as [number, number, number, number] },
  ];
  const rows = [
    { at: [115, 70] as [number, number], score: 0.93, rotation: 0, mirrored: false },
    { at: [215, 70] as [number, number], score: 0.91, rotation: 0, mirrored: false },
  ];
  const r = reconcileSweepLabels(seed, rows, labels, [], []);
  assert.deepEqual(r.matches, rows);
  assert.equal(r.demoted, 0);
});

test("label corroboration never changes unlabeled geometry or invents text-only placements", () => {
  const seed = { label: "CD-1", via: "leader" as const, distance_px: 2 };
  const match = { at: [20, 20] as [number, number], score: 0.96, rotation: 0, mirrored: false };
  const withheld = { at: [40, 20] as [number, number], score: 0.84, rotation: 0, mirrored: false, reason: "near" };
  const r = reconcileSweepLabels(seed, [match], [null], [withheld], [null]);
  assert.deepEqual(r.matches, [match]);
  assert.deepEqual(r.withheld, [withheld]);
  assert.equal(r.promoted, 0);
  assert.equal(r.demoted, 0);
});

test("set-wide label corroboration withholds geometry that has no family tag", () => {
  const seed = { label: "VAV-9", via: "leader" as const, distance_px: 2 };
  const tagged = { label: "VAV-12", via: "leader" as const, distance_px: 4 };
  const unlabeled = { at: [20, 20] as [number, number], score: 0.97, rotation: 0, mirrored: false };
  const sibling = { at: [80, 20] as [number, number], score: 0.61, rotation: 0, mirrored: false, reason: "near" };
  const r = reconcileSweepLabels(seed, [unlabeled], [null], [sibling], [tagged], { requireLabel: true });
  assert.deepEqual(r.matches.map((row) => row.at), [[80, 20]], "a tagged same-family near-match is promoted");
  assert.deepEqual(r.withheld.map((row) => row.at), [[20, 20]], "an unlabeled cross-sheet lookalike cannot count");
  assert.match(r.withheld[0].reason, /set-wide placement has no VAV-9-family drawing tag/);
  assert.equal(r.promoted, 1);
  assert.equal(r.demoted, 1);
});

// docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md §2 C1 / Phase B — a held withheld
// row (out-of-bounds or density-suspect: a fit that cleared the score bar
// for a reason unrelated to score) is disclosed geometry, never a
// corroboration candidate. Measured on the real corpus: case 05's real D10
// air devices scored ~0.59 and were correctly promoted via their drawn tag
// at baseline, but a `scale_x: 0, scale_y: 0, score: 1.0` degenerate fit
// nearby beat them for that same tag once affine widened the candidate pool.

test("eligible:false excludes a placement from the tag competition entirely — the genuine, farther, lower-score instance keeps its own tag uncontested", () => {
  const token = span("D10", 20, 88, 40, 25); // center (40, 100.5)
  const genuine: [number, number] = [0, 100];   // distance ~40 from the token
  const held: [number, number] = [35, 100];     // distance ~5.5 — would win on distance AND score alone

  // Without eligibility, the closer/higher-score placement wins the token.
  const contested = labelPlacements([genuine, held], [token], [], undefined, { scores: [0.59, 1.0] });
  assert.equal(contested[0], null, "sanity: uncontested, the held row's own distance+score would normally win");
  assert.equal(contested[1]?.label, "D10");

  // With it marked ineligible, it proposes NO edge at all.
  const r = labelPlacements([genuine, held], [token], [], undefined, { scores: [0.59, 1.0], eligible: [true, false] });
  assert.equal(r[1], null, "the held placement must propose no edge, regardless of its own distance or score");
  assert.equal(r[0]?.label, "D10", "the genuine instance keeps the tag once the held phantom is excluded from the competition");
});

test("label corroboration never promotes a HELD withheld row, even with the seed's own tag adjacent", () => {
  const seed = { label: "CD-1", via: "leader" as const, distance_px: 2 };
  const same = { label: "CD-1", via: "leader" as const, distance_px: 3 };
  const rawWithheld = { at: [20, 20] as [number, number], score: 0.99, rotation: 0, mirrored: false, reason: "matches under a 0x/0x fit", hold: "bounds" as const };
  const r = reconcileSweepLabels(seed, [], [], [rawWithheld], [same]);
  assert.equal(r.promoted, 0, "a held row must never be promoted, no matter how good its own tag match looks");
  assert.deepEqual(r.matches, []);
  assert.equal(r.withheld.length, 1);
  assert.equal(r.withheld[0].hold, "bounds", "the row stays held, its own reason and hold untouched");
});

test("labelPlacements: a placement can lose its own nearest tag to a closer competing placement in a shared assignment — callers reporting a placement's OWN identity must look it up uncontested, not read it off the shared result", () => {
  const token = span("D10", 20, 88, 40, 25); // center (40, 100.5)
  const seedPoint: [number, number] = [0, 100];     // distance ~40 from the token
  const competitor: [number, number] = [35, 100];   // distance ~5.5 — wins the shared assignment

  const uncontested = labelPlacements([seedPoint], [token], [], undefined, { scores: [1] });
  assert.equal(uncontested[0]?.label, "D10", "looked up alone, the seed correctly finds its own nearby tag");

  const contested = labelPlacements([seedPoint, competitor], [token], [], undefined, { scores: [1, 1] });
  assert.equal(contested[0], null, "in a shared assignment, the seed can lose its own tag to a closer competing placement");
  assert.equal(contested[1]?.label, "D10");
});
