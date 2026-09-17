// Benchmark scorer — the IoU/aggregate math the corpus gate stands on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { polyIoU, scoreGolden, aggregate, crossAgreement, aggregateCross, polyOverlapPx2, caseCoverage, confidenceGate, checkWallSemantics, goldenVertexCoverage, CONF_GATE, CONF_GATE_EXEMPT, scoreLinearParity, scoreLinearTotals, scoreLinearDeterminism, aggregateLinear, polylineLength, projectOntoPolyline, clipPolyline, discreteFrechet, scoreTraceShapeMatch, scoreTraceRecall, scoreTracePrecision, aggregateTrace, scoreRefusalCorrectness, type ProbeScore, type CrossScore, type TraceRunRow, type RefusalRow } from "../bench/score.ts";
import { KNOWN_WALL_SEMANTICS, WALL_SEMANTICS } from "../bench/corpus.ts";
import type { Point } from "../src/lib/oneclick.ts";

const sq = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

test("polyIoU: identical squares ≈ 1, disjoint = 0, half-overlap ≈ 1/3", () => {
  assert.ok(polyIoU(sq(0, 0, 100, 100), sq(0, 0, 100, 100)) > 0.97);
  assert.equal(polyIoU(sq(0, 0, 10, 10), sq(50, 50, 60, 60)), 0);
  const half = polyIoU(sq(0, 0, 100, 100), sq(50, 0, 150, 100));   // overlap 50 of union 150
  assert.ok(Math.abs(half - 1 / 3) < 0.03, `≈1/3, got ${half}`);
});

test("scoreGolden: refusal, leak, and clean trace classify correctly", () => {
  const golden = sq(0, 0, 100, 100);
  assert.deepEqual(scoreGolden("leak", null, golden), { iou: 0, leak: false, refused: true });
  const ballooned = scoreGolden("ok", sq(-100, -100, 300, 300), golden);   // 16× the golden
  assert.ok(ballooned.leak && ballooned.iou < 0.5, "a ballooned trace is a leak");
  const clean = scoreGolden("ok", sq(1, 1, 99, 99), golden);
  assert.ok(!clean.leak && !clean.refused && clean.iou > 0.9);
});

test("aggregate: known-fail probes are tracked but never gate", () => {
  const scores: ProbeScore[] = [
    { caseName: "a", probeName: "p1", expect: "golden", status: "ok", iou: 0.98, leak: false, refused: false },
    { caseName: "a", probeName: "p2", expect: "golden", status: "ok", iou: 0.94, leak: false, refused: false },
    { caseName: "b", probeName: "r1", expect: "refusal", status: "leak", correctRefusal: true },
    { caseName: "c", probeName: "kf", expect: "refusal", status: "ok", correctRefusal: false, knownFail: true },
  ];
  const agg = aggregate(scores);
  assert.equal(agg.goldenProbes, 2);
  assert.ok(Math.abs(agg.meanIoU - 0.96) < 1e-9);
  assert.equal(agg.floorIoU, 0.94);
  assert.equal(agg.refusalRate, 0);
  assert.equal(agg.leakRate, 0);
  assert.equal(agg.correctRefusalRate, 1, "the known-fail wrong refusal must not drag the gate");
  assert.equal(agg.knownFails, 1);
});

test("crossAgreement: same verdict everywhere agrees; a flip disagrees; rings score pairwise", () => {
  const ring = sq(0, 0, 100, 100);
  const allTraced = crossAgreement([
    { res: 1, status: "ok", ring },
    { res: 0.5, status: "ok", ring: sq(1, 1, 99, 99) },
  ]);
  assert.ok(allTraced.statusAgree);
  assert.ok((allTraced.minPairIoU ?? 0) > 0.9);

  const allRefused = crossAgreement([
    { res: 1, status: "leak", ring: null },
    { res: 0.5, status: "tiny", ring: null },
  ]);
  assert.ok(allRefused.statusAgree, "leak vs tiny is the same verdict: refused");
  assert.equal(allRefused.minPairIoU, undefined);

  const flip = crossAgreement([
    { res: 1, status: "ok", ring },
    { res: 0.5, status: "tiny", ring: null },
  ]);
  assert.ok(!flip.statusAgree, "traced at one resolution, refused at another = disagreement");
});

test("crossAgreement: divergent rings drive minPairIoU down", () => {
  const three = crossAgreement([
    { res: 1, status: "ok", ring: sq(0, 0, 100, 100) },
    { res: 0.75, status: "ok", ring: sq(0, 0, 100, 100) },
    { res: 0.5, status: "ok", ring: sq(0, 0, 100, 50) },   // half the room lost
  ]);
  assert.ok(three.statusAgree);
  assert.ok((three.minPairIoU ?? 1) < 0.6, `worst pair must reflect the loss, got ${three.minPairIoU}`);
});

test("aggregateCross: known-fail excluded from gating; floor is the worst gating pair", () => {
  const scores: CrossScore[] = [
    { caseName: "a", probeName: "p1", expect: "golden", resolutions: [1, 0.5], statuses: ["ok", "ok"], statusAgree: true, minPairIoU: 0.98 },
    { caseName: "a", probeName: "p2", expect: "golden", resolutions: [1, 0.5], statuses: ["ok", "ok"], statusAgree: true, minPairIoU: 0.92 },
    { caseName: "b", probeName: "r1", expect: "refusal", resolutions: [1, 0.5], statuses: ["leak", "leak"], statusAgree: true },
    { caseName: "c", probeName: "kf", expect: "golden", resolutions: [1, 0.5], statuses: ["ok", "tiny"], statusAgree: false, minPairIoU: 0.10, knownFail: true },
  ];
  const x = aggregateCross(scores);
  assert.equal(x.crossProbes, 3);
  assert.equal(x.disagreements, 0, "the known-fail flip must not gate");
  assert.equal(x.crossFloorIoU, 0.92);
  assert.equal(x.knownFails, 1);
});

// ── SF error + case coverage (round-8 metric additions) ─────────────────────

test("scoreGolden: SF error is the relative area difference", () => {
  const golden: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];      // 10,000
  const traced: [number, number][] = [[0, 0], [98, 0], [98, 100], [0, 100]];        // 9,800
  const s = scoreGolden("ok", traced, golden);
  assert.ok(Math.abs((s.sfErr ?? 0) - 0.02) < 1e-9, `2% SF error, got ${s.sfErr}`);
});

test("polyOverlapPx2: disjoint rooms cost nothing; a known overlap measures", () => {
  const a: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const b: [number, number][] = [[200, 0], [300, 0], [300, 100], [200, 100]];
  assert.equal(polyOverlapPx2(a, b), 0, "disjoint");
  const c: [number, number][] = [[80, 0], [180, 0], [180, 100], [80, 100]];         // 20×100 overlap
  const ov = polyOverlapPx2(a, c, 1);
  assert.ok(Math.abs(ov - 2000) / 2000 < 0.05, `≈2000 px², got ${ov}`);
});

test("caseCoverage: totals, ratio, overlap, refused-room penalty, deducts", () => {
  const sq = (x0: number, y0: number, s: number): [number, number][] => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];
  // two 10×10 ft rooms at 10 px/ft; engine returns one exact, one 2% small
  const cv = caseCoverage("t", [
    { golden: sq(0, 0, 100), ring: sq(0, 0, 100) },
    { golden: sq(200, 0, 100), ring: [[200, 0], [298, 0], [298, 100], [200, 100]] },
  ], 10, true);
  assert.equal(cv.sumGoldenSF, 200);
  assert.ok(Math.abs(cv.sumEngineSF - 198) < 1e-9);
  assert.ok(Math.abs(cv.ratio - 0.99) < 1e-9);
  assert.equal(cv.overlapSF, 0);
  assert.ok(Math.abs(cv.maxSfErr - 0.02) < 1e-9);
  // a refused room counts as 100% error — missing floor can't hide in the mean
  const refused = caseCoverage("t2", [{ golden: sq(0, 0, 100), ring: null }], 10, true);
  assert.equal(refused.maxSfErr, 1);
  assert.equal(refused.sumEngineSF, 0);
  assert.equal(refused.maxSfAbs, 100, "...and 100% of its square footage, absolutely");
  // deducts reduce the golden total (human deducted a column; engine floods around it)
  const ded = caseCoverage("t3", [{ golden: sq(0, 0, 100), ring: sq(0, 0, 100) }], 10, true, 2);
  assert.equal(ded.sumGoldenSF, 98);
});

test("F6: caseCoverage reports ABSOLUTE worst-room SF, which a relative band cannot see", () => {
  // The blind spot, to scale: one 1,743 SF room (cloud-corridor) and one 20 SF
  // room (the annotation band). A 2% relative band lets the big room move 35 SF
  // and the small one 0.4 SF, so a relative trigger is ~90× looser on the room
  // that carries the case. The absolute figure is what run.mts gates on.
  const box = (x0: number, y0: number, w: number, h: number): [number, number][] => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
  const cv = caseCoverage("scale", [
    // 1,000 SF golden at 10 px/ft, engine 2% small = 20 SF gone
    { name: "big-room", golden: box(0, 0, 1000, 100), ring: box(0, 0, 980, 100) },
    // 10 SF golden, engine 2% small = 0.2 SF gone
    { name: "small-room", golden: box(0, 500, 100, 10), ring: box(0, 500, 98, 10) },
  ], 10, false);
  assert.ok(Math.abs(cv.maxSfErr - 0.02) < 1e-9, "relative: both rooms read the SAME 2%");
  assert.ok(Math.abs(cv.maxSfAbs - 20) < 1e-9, `absolute: 20 SF, got ${cv.maxSfAbs}`);
  assert.equal(cv.maxSfAbsProbe, "big-room", "the failure message has to name the room that moved");
});

// ── F5: the wall-semantics declaration is CHECKED, not stamped ──────────────
// `bench/run.mts` used to hold `c.wallSemantics !== WALL_SEMANTICS`, comparing
// the corpus JSON's string against the very constant every writer of that field
// stamped it from — a tautology that passed for three months while the value it
// certified ("centerline") was false on 60% of the corpus's square footage.
// These pin the three things that can now fail, each with a distinct message.

const SEM = { engine: WALL_SEMANTICS, known: KNOWN_WALL_SEMANTICS, tolPx: 7, minCoverage: 0.60 };
/** a 4-corner golden and the drawn vertices it does or does not sit on */
const box = (x0: number, y0: number, s: number): Point[] => [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]];

test("F5: a case declaring the engine's measurand, with goldens ON drawn vertices, passes", () => {
  const golden = box(0, 0, 100);
  const r = checkWallSemantics({ ...SEM, caseName: "ok", declared: WALL_SEMANTICS, probes: [{ name: "p", golden }], points: [...golden, [500, 500]] });
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.coverage, [{ caseName: "ok", probeName: "p", onVertex: 4, verts: 4, cov: 1 }]);
  // within tolerance, not just exactly on: the snap has a 7 px reach
  assert.deepEqual(checkWallSemantics({ ...SEM, caseName: "ok", declared: WALL_SEMANTICS, probes: [{ name: "p", golden }], points: golden.map(([x, y]) => [x + 6, y] as Point) }).failures, []);
});

test("F5 branch 1: a value outside the vocabulary fails as a value, not as a measurand", () => {
  for (const bad of ["centreline", "face-to-face", "", undefined, null, 7]) {
    const r = checkWallSemantics({ ...SEM, caseName: "typo", declared: bad, probes: [{ name: "p", golden: box(0, 0, 100) }], points: box(0, 0, 100) });
    assert.equal(r.failures.length, 1, `${JSON.stringify(bad)} must fail`);
    assert.match(r.failures[0], /not one of/);
    assert.deepEqual(r.coverage, [], "an unreadable case is not measured, it is rejected");
  }
});

test("F5 branch 2: a DIFFERENT real measurand fails — the SF gates would compare two tapes", () => {
  for (const other of KNOWN_WALL_SEMANTICS.filter((v) => v !== WALL_SEMANTICS)) {
    const golden = box(0, 0, 100);
    const r = checkWallSemantics({ ...SEM, caseName: "human", declared: other, probes: [{ name: "p", golden }], points: golden });
    assert.equal(r.failures.length, 1);
    assert.match(r.failures[0], /two different measurands/);
    assert.match(r.failures[0], new RegExp(other));
  }
});

test("F5 branch 3: the declaration must be EARNED by the goldens — this is the one with teeth", () => {
  const golden = box(0, 0, 100);
  // goldens re-pinned onto something that is not the drawn linework: every
  // corner 30 px off the nearest path vertex. Nothing about the string changed.
  const drifted = golden.map(([x, y]) => [x + 30, y + 30] as Point);
  const bad = checkWallSemantics({ ...SEM, caseName: "unearned", declared: WALL_SEMANTICS, probes: [{ name: "p", golden: drifted }], points: golden });
  assert.equal(bad.failures.length, 1, bad.failures.join("; "));
  assert.match(bad.failures[0], /unearned\/p: only 0\/4 golden vertices \(0%\)/);
  assert.match(bad.failures[0], /does not measure to one \(floor 60%\)/);
  assert.equal(bad.coverage[0].cov, 0, "reported as well as failed");
  // the floor is a floor, not an all-or-nothing: 3 of 4 (the sample plan's real
  // figure, where the partition CROSS is not a path vertex) passes at 75%…
  const three = [...golden.slice(0, 3), [130, 130] as Point];
  assert.deepEqual(checkWallSemantics({ ...SEM, caseName: "cross", declared: WALL_SEMANTICS, probes: [{ name: "p", golden: three }], points: golden }).failures, []);
  assert.equal(goldenVertexCoverage(three, golden, 7), 0.75);
  // …and 2 of 4 = 50% does not
  const two = [...golden.slice(0, 2), [130, 130] as Point, [140, 140] as Point];
  assert.equal(goldenVertexCoverage(two, golden, 7), 0.5);
  assert.equal(checkWallSemantics({ ...SEM, caseName: "half", declared: WALL_SEMANTICS, probes: [{ name: "p", golden: two }], points: golden }).failures.length, 1);
});

// ── audit A2: the anti-correlation gate ─────────────────────────────────────
// RFC item D shipped a confidence score anti-correlated with error. These pin
// the gate that keeps it fixed. Note every fixture below carries knownFail on
// the badly-calibrated probes ON PURPOSE: three of the four real offenders are
// flagged that way in the corpus, and `aggregate`/`aggregateCross` both open
// with `filter(s => !s.knownFail)`. A gate routed through either could not fire.

const gp = (probe: string, sfErr: number, confidence: number, knownFail = false): ProbeScore => {
  const [caseName, probeName] = probe.split("/");
  return { caseName, probeName, expect: "golden", status: "ok", iou: 0.9, sfErr, leak: false, refused: false, confidence, knownFail };
};

test("A2 gate: an inaccurate probe may not report high confidence — known-fail included", () => {
  const bad = confidenceGate([gp("acc/a", 0.000, 1.00), gp("acc/b", 0.001, 0.95), gp("wrong/x", 3.842, 0.95, true)]);
  assert.equal(bad.inaccurate.length, 1, "the known-fail probe is IN the population, not filtered out");
  assert.ok(bad.failures.some((f) => /wrong\/x/.test(f) && /anti-correlated/.test(f)), bad.failures.join("; "));
  const good = confidenceGate([gp("acc/a", 0.000, 1.00), gp("acc/b", 0.001, 0.95), gp("wrong/x", 3.842, 0.85, true)]);
  assert.deepEqual(good.failures, []);
});

test("A2 gate: it keys on SF ERROR, not IoU — the 4.3%-at-1.00 probe is caught", () => {
  // two-doorways/center: IoU 0.957 (invisible to any IoU threshold) but 4.33%
  // SF off — the number a bid is actually written from.
  const s = [gp("acc/a", 0.000, 1.00), gp("acc/b", 0.002, 0.95), gp("two-doorways/center", 0.0433, 1.00)];
  s[2].iou = 0.957;
  assert.ok(confidenceGate(s).failures.some((f) => /two-doorways/.test(f)));
});

test("A2 gate: a refusal probe that TRACES fails the ceiling whatever its confidence", () => {
  const refusalTraced = (conf?: number): ProbeScore =>
    ({ caseName: "va-finish-plan", probeName: "open-margin", expect: "refusal", status: "ok", correctRefusal: false, confidence: conf, knownFail: true });
  const base = [gp("acc/a", 0.000, 1.00), gp("acc/b", 0.001, 0.95)];
  assert.ok(confidenceGate([...base, refusalTraced(0.97)]).failures.some((f) => /open-margin/.test(f) && /refuse/.test(f)));
  // ...and reporting NO confidence is itself a failure: that is precisely how
  // open-margin sat outside the gate before A2.
  assert.ok(confidenceGate([...base, refusalTraced(undefined)]).failures.some((f) => /open-margin/.test(f) && /NO confidence/.test(f)));
  assert.deepEqual(confidenceGate([...base, refusalTraced(0.65)]).failures, []);
  // a refusal probe that correctly refuses is not in any population
  assert.deepEqual(confidenceGate([...base, { caseName: "c", probeName: "r", expect: "refusal", status: "leak", correctRefusal: true }]).failures, []);
});

test("A2 gate: the floor is RELATIVE with a margin — a constant-score stub cannot pass it", () => {
  // "replacing traceConfidence with () => ({score: 0.5, factors: []})" — the
  // stated anti-gaming case. It satisfies every ceiling and any non-strict
  // floor; the margin is what refuses it.
  const stub = [gp("acc/a", 0.000, 0.5), gp("acc/b", 0.001, 0.5), gp("wrong/x", 3.842, 0.5, true), gp("wrong/y", 0.974, 0.5, true)];
  const r = confidenceGate(stub);
  assert.deepEqual(r.inaccurate.map((p) => p.confidence), [0.5, 0.5]);
  assert.ok(r.failures.length >= 2, `a constant score must FAIL the floor: ${JSON.stringify(r.failures)}`);
  assert.ok(r.failures.every((f) => /median-of-inaccurate|absolute floor/.test(f)));
});

test("A2 gate: an accurate probe below the inaccurate median + margin fails", () => {
  const s = [gp("acc/low", 0.000, 0.86), gp("acc/hi", 0.001, 0.99), gp("wrong/x", 3.842, 0.85, true)];
  assert.ok(confidenceGate(s).failures.some((f) => /acc\/low/.test(f) && /median-of-inaccurate/.test(f)));
  const ok = [gp("acc/low", 0.000, 0.89), gp("acc/hi", 0.001, 0.99), gp("wrong/x", 3.842, 0.85, true)];
  assert.deepEqual(confidenceGate(ok).failures, []);
});

test("A2 gate: empty populations do something, not nothing", () => {
  // no accurate probe at all ⇒ the gate is NOT satisfied. Otherwise deleting
  // the accurate probes would silently disable the floor.
  const noAcc = confidenceGate([gp("wrong/x", 3.842, 0.85, true)]);
  assert.ok(noAcc.failures.some((f) => /the floor cannot be evaluated/.test(f)), noAcc.failures.join("; "));
  // no inaccurate probe ⇒ no median to compare to, so the CALIBRATED ABSOLUTE
  // floor applies instead — the check is not skipped.
  assert.deepEqual(confidenceGate([gp("acc/a", 0.000, 0.99)]).failures, []);
  const low = confidenceGate([gp("acc/a", 0.000, CONF_GATE.floorAbs - 0.01)]);
  assert.ok(low.failures.some((f) => /ABSOLUTE floor/.test(f)), low.failures.join("; "));
  // probes in the dead zone between the two thresholds join neither population
  const dead = confidenceGate([gp("acc/a", 0.000, 0.99), gp("mid/m", 0.02, 0.10)]);
  assert.deepEqual(dead.inaccurate, []);
  assert.equal(dead.accurate.length, 1);
});

test("A2 gate: the POPULATED-case absolute floor fires where the relative floor passes", () => {
  // W4/W5/W6 review finding: `confidenceGate`'s absolute floor inside the
  // else-branch — the one that applies when BOTH populations exist — had no
  // test. Only the empty-inaccurate fallback (line ~390) was covered, so the
  // calibrated floor could have been deleted from the populated path and every
  // test would still pass. This is the reviewer's fixture: an inaccurate
  // population with median 0.60 and an accurate probe at 0.70. The RELATIVE
  // floor is 0.60 + margin 0.03 = 0.63, which 0.70 clears; the ABSOLUTE floor is
  // CONF_GATE.floorAbs = 0.88, which it does not.
  const s = [gp("acc/a", 0.000, 0.70), gp("wrong/x", 3.842, 0.60, true), gp("wrong/y", 0.974, 0.60, true)];
  const r = confidenceGate(s);
  assert.equal(r.medianInaccurate, 0.60);
  assert.equal(r.minAccurate, 0.70);
  assert.ok(0.70 >= r.medianInaccurate! + CONF_GATE.floorMargin, "fixture precondition: the relative floor is CLEARED");
  assert.ok(!r.failures.some((f) => /median-of-inaccurate/.test(f)), `the relative floor must not fire: ${r.failures.join("; ")}`);
  assert.equal(r.failures.length, 1, `exactly one failure, the absolute one: ${JSON.stringify(r.failures)}`);
  assert.match(r.failures[0], /calibrated absolute floor/);
  assert.ok(!/no inaccurate probes/.test(r.failures[0]), "this is the POPULATED path, not the empty-median fallback");
  // and it is the FLOOR that fires, not the ceiling: 0.60 is under ceilConf
  assert.ok(r.inaccurate.every((p) => p.confidence <= CONF_GATE.ceilConf));
  // …raise the accurate probe to the floor and the gate is satisfied, so the
  // assertion above is about the floor's VALUE, not about the fixture being
  // unsatisfiable
  assert.deepEqual(confidenceGate([gp("acc/a", 0.000, CONF_GATE.floorAbs), gp("wrong/x", 3.842, 0.60, true), gp("wrong/y", 0.974, 0.60, true)]).failures, []);
});

test("A2 gate: the exemption list is BOUNDED, reasoned, and xfailed WITH A DIRECTION", () => {
  // (b) the bound — an exemption list that can grow is `knownFail` again.
  // A5b took it from 1 to 3: measuring the product's SNAPPED ring moved the
  // nine synthetic probes out of the gate's dead zone and into the accurate
  // population for the first time, where two of them fail the floor for
  // reasons that are findings, not miscalibrations. See CONF_GATE_EXEMPT.
  assert.deepEqual(Object.keys(CONF_GATE_EXEMPT).sort(),
    ["annotation-ring-room/center", "tile-grid-room/in-cell", "two-doorways/center"],
    "adding another needs its own argument, not a bigger list");
  // (c) EVERY entry records the signal set it was evaluated against — not just
  // "known limit" — and (a) EVERY entry carries at least one xfail DIRECTION,
  // so the day the situation improves the gate fails instead of absorbing it.
  for (const [probe, e] of Object.entries(CONF_GATE_EXEMPT)) {
    for (const signal of ["raster", "hatchFiltered", "wedges", "wedgeGrowth", "curveFrac", "minPassDelta", "areaSF", "mppf"])
      assert.match(e.reason, new RegExp(signal), `${probe}: the exemption must name ${signal} among the signals it was evaluated against`);
    assert.match(e.reason, /XFAIL DIRECTION/, `${probe}: the reason must state its xfail direction in prose too`);
    assert.ok(e.xfailAbove != null || e.xfailAtMost != null || e.xfailEquals != null,
      `${probe}: an exemption with no direction is \`knownFail\` under a new name`);
  }
  const { reason, xfailAbove } = CONF_GATE_EXEMPT["annotation-ring-room/center"];
  for (const signal of ["sealedPx", "virtualFrac"]) assert.match(reason, new RegExp(signal));
  assert.equal(xfailAbove, 0.90);
  // the two A5b entries assert in the OTHER direction: they say a deduction
  // that cannot yet discriminate still cannot.
  assert.equal(CONF_GATE_EXEMPT["two-doorways/center"].xfailAtMost, 0.87);
  assert.ok(CONF_GATE_EXEMPT["two-doorways/center"].xfailAtMost! < CONF_GATE.floorAbs,
    "the ceiling it is held under must sit BELOW the floor it is excused from, or the exemption excuses nothing");
  // F6/W6: an `xfailAtMost` alone tolerates COLLAPSE — 0.10 also satisfies
  // "still ≤ 0.87". Every upper-bounded exemption must be BANDED.
  for (const [probe, e] of Object.entries(CONF_GATE_EXEMPT)) {
    if (e.xfailAtMost == null) continue;
    assert.ok(e.xfailAtLeast != null, `${probe}: xfailAtMost without xfailAtLeast tolerates the score collapsing to zero`);
    assert.ok(e.xfailAtLeast! < e.xfailAtMost!, `${probe}: the band must be non-empty`);
  }
  assert.equal(CONF_GATE_EXEMPT["two-doorways/center"].xfailAtLeast, 0.80);
  assert.equal(CONF_GATE_EXEMPT["tile-grid-room/in-cell"].xfailEquals, "partition-bank-15in/mid-bay");
  const exempt = (conf?: number): ProbeScore =>
    ({ caseName: "annotation-ring-room", probeName: "center", expect: "golden", status: "ok", iou: 0.65, sfErr: 0.35, leak: false, refused: false, confidence: conf, knownFail: true });
  const base = [gp("acc/a", 0.000, 1.00), gp("acc/b", 0.001, 0.95), gp("wrong/x", 3.842, 0.85, true)];
  assert.deepEqual(confidenceGate([...base, exempt(1.00)]).failures, [], "today it scores 1.00 and is exempt");
  const flipped = confidenceGate([...base, exempt(0.88)]);
  assert.ok(flipped.failures.some((f) => /XFAIL FLIPPED/.test(f)), flipped.failures.join("; "));
  assert.ok(confidenceGate([...base, exempt(undefined)]).failures.some((f) => /no confidence at all/.test(f)));
  // exempt probes are in neither gating population
  assert.equal(confidenceGate([...base, exempt(1.00)]).inaccurate.length, 1);
});

test("A2/A5b gate: the xfailAtMost and xfailEquals directions flip the same way round", () => {
  const base = [gp("acc/a", 0.000, 1.00), gp("acc/b", 0.001, 0.95), gp("wrong/x", 3.842, 0.85, true)];
  // xfailAtMost — two-doorways/center. Today 0.85 ≤ 0.87 and it is excused;
  // the day the engine can justify withholding the deduction it rises and this
  // fires instead of quietly absorbing the improvement.
  const twoDoor = (conf: number): ProbeScore =>
    ({ caseName: "two-doorways", probeName: "center", expect: "golden", status: "ok", iou: 1, sfErr: 0, leak: false, refused: false, confidence: conf });
  assert.deepEqual(confidenceGate([...base, twoDoor(0.85)]).failures, []);
  assert.ok(confidenceGate([...base, twoDoor(0.92)]).failures.some((f) => /two-doorways/.test(f) && /XFAIL FLIPPED/.test(f)));
  // …and DOWNWARD (F6/W6). The one-sided bound excused any score at all below
  // 0.87, so a confidence model that piled three more deductions onto this
  // fixture — or returned 0.10 — passed the gate through the exemption. The
  // band is 0.80–0.87; both edges are live and the inside is quiet.
  assert.deepEqual(confidenceGate([...base, twoDoor(0.80)]).failures, [], "the lower edge is inclusive");
  assert.deepEqual(confidenceGate([...base, twoDoor(0.87)]).failures, [], "so is the upper edge");
  const collapsed = confidenceGate([...base, twoDoor(0.79)]);
  assert.ok(collapsed.failures.some((f) => /two-doorways/.test(f) && /XFAIL FLIPPED DOWNWARD/.test(f)), collapsed.failures.join("; "));
  assert.ok(confidenceGate([...base, twoDoor(0.10)]).failures.some((f) => /two-doorways/.test(f) && /XFAIL FLIPPED DOWNWARD/.test(f)),
    "a collapse to 0.10 used to satisfy `still ≤ 0.87` and pass");

  // xfailEquals — tile-grid-room/in-cell is excused only for as long as its
  // score is IDENTICAL to partition-bank-15in/mid-bay's, which is the finding.
  const tile = (conf: number): ProbeScore =>
    ({ caseName: "tile-grid-room", probeName: "in-cell", expect: "golden", status: "ok", iou: 1, sfErr: 0, leak: false, refused: false, confidence: conf });
  const bank = (conf: number): ProbeScore =>
    ({ caseName: "partition-bank-15in", probeName: "mid-bay", expect: "golden", status: "ok", iou: 0.2, sfErr: 4.0, leak: true, refused: false, confidence: conf, knownFail: true });
  assert.deepEqual(confidenceGate([...base, tile(0.85), bank(0.85)]).failures, []);
  const split = confidenceGate([...base, tile(0.95), bank(0.85)]);
  assert.ok(split.failures.some((f) => /tile-grid-room/.test(f) && /no longer equals/.test(f)), split.failures.join("; "));
  // …and if the probe it is compared against leaves the corpus, the assertion
  // is UNCHECKABLE, which is a failure rather than a silent pass
  const orphan = confidenceGate([...base, tile(0.85)]);
  assert.ok(orphan.failures.some((f) => /XFAIL UNCHECKABLE/.test(f)), orphan.failures.join("; "));
});

// ── #linear-takeoff (WP1.6) — parity/totals/determinism scoring ────────────
test("scoreLinearParity: identical ComputedRuns are OK; any difference names the mismatch", () => {
  const run = { segments: [{ i: 0, lf: 10, size_src: "manual" as const }], vertices: [], totals_by_size: {} };
  assert.deepEqual(scoreLinearParity("c1", run, structuredClone(run)), { caseName: "c1", ok: true });
  const different = { ...structuredClone(run), segments: [{ i: 0, lf: 11, size_src: "manual" as const }] };
  const r = scoreLinearParity("c1", run, different);
  assert.equal(r.ok, false);
  assert.match(r.mismatch!, /canvas computed_run !== MCP computed_run/);
});

test("scoreLinearParity: one side null and the other resolved is a mismatch; both null is OK", () => {
  const run = { segments: [], vertices: [], totals_by_size: {} };
  assert.deepEqual(scoreLinearParity("c1", null, null), { caseName: "c1", ok: true });
  const half = scoreLinearParity("c1", run, null);
  assert.equal(half.ok, false);
  assert.match(half.mismatch!, /one side resolved a run and the other didn't/);
});

test("scoreLinearTotals: exact match has zero error; a mismatch reports both absolute and percent error", () => {
  assert.deepEqual(scoreLinearTotals("c1", 50, 50), { caseName: "c1", expectedLf: 50, actualLf: 50, errFt: 0, errPct: 0 });
  const off = scoreLinearTotals("c1", 50, 51);
  assert.equal(off.errFt, 1);
  assert.ok(Math.abs(off.errPct - 0.02) < 1e-9);
});

test("scoreLinearTotals: a zero-length expected run reports 0% error rather than dividing by zero", () => {
  assert.deepEqual(scoreLinearTotals("c1", 0, 0), { caseName: "c1", expectedLf: 0, actualLf: 0, errFt: 0, errPct: 0 });
});

test("scoreLinearDeterminism: reports the transform name and the raw error", () => {
  assert.deepEqual(scoreLinearDeterminism("c1", "rotate90", 20, 20), { caseName: "c1", transform: "rotate90", expectedLf: 20, actualLf: 20, errFt: 0 });
  const scaled = scoreLinearDeterminism("c1", "scale2x", 40, 40.02);
  assert.ok(Math.abs(scaled.errFt - 0.02) < 1e-9, `expected ~0.02, got ${scaled.errFt}`);
});

test("aggregateLinear: rolls up parity failures and the worst totals/determinism error across cases", () => {
  const parity = [{ ok: true }, { ok: false }, { ok: true }];
  const totals = [scoreLinearTotals("a", 10, 10), scoreLinearTotals("b", 10, 10.03)];
  const determinism = [scoreLinearDeterminism("a", "rotate90", 10, 10), scoreLinearDeterminism("a", "scale2x", 20, 19.98)];
  const agg = aggregateLinear(parity, totals, determinism);
  assert.equal(agg.cases, 2);
  assert.equal(agg.parityFailures, 1);
  assert.ok(Math.abs(agg.maxTotalsErrFt - 0.03) < 1e-9);
  assert.ok(Math.abs(agg.maxDeterminismErrFt - 0.02) < 1e-9);
});

test("aggregateLinear: empty inputs report zero, not NaN or a thrown error", () => {
  assert.deepEqual(aggregateLinear([], [], []), { cases: 0, parityFailures: 0, maxTotalsErrFt: 0, maxTotalsErrPct: 0, maxDeterminismErrFt: 0 });
});

// ── #linear-takeoff WP3+ trace-engine scoring ───────────────────────────────

test("polylineLength: sums a multi-segment chain, including a 3-4-5 leg", () => {
  assert.equal(polylineLength([[0, 0], [3, 4]]), 5);
  assert.equal(polylineLength([[0, 0], [3, 4], [3, 4]]), 5, "a zero-length trailing leg adds nothing");
  assert.equal(polylineLength([[0, 0]]), 0, "a single point has no length");
});

test("projectOntoPolyline: a point exactly on a vertex reports that vertex's own arc-length, zero distance", () => {
  const poly: Point[] = [[0, 0], [100, 0], [100, 100]];
  const hit = projectOntoPolyline([100, 0], poly);
  assert.equal(hit.arcLen, 100);
  assert.equal(hit.dist, 0);
  assert.deepEqual(hit.at, [100, 0]);
});

test("projectOntoPolyline: a point off to the side projects perpendicularly onto the nearest segment", () => {
  const poly: Point[] = [[0, 0], [100, 0]];
  const hit = projectOntoPolyline([40, 10], poly);
  assert.equal(hit.arcLen, 40);
  assert.equal(hit.dist, 10);
  assert.deepEqual(hit.at, [40, 0]);
});

test("projectOntoPolyline: a point beyond either end clamps to that endpoint, not extrapolating past it", () => {
  const poly: Point[] = [[0, 0], [100, 0]];
  assert.deepEqual(projectOntoPolyline([-50, 0], poly).at, [0, 0]);
  assert.deepEqual(projectOntoPolyline([500, 0], poly).at, [100, 0]);
});

test("clipPolyline: clips a straight line's middle span to exact arc-length endpoints", () => {
  const poly: Point[] = [[0, 0], [100, 0]];
  assert.deepEqual(clipPolyline(poly, 20, 80), [[20, 0], [80, 0]]);
});

test("clipPolyline: a clip spanning an interior vertex keeps that vertex — the elbow's own shape survives", () => {
  const poly: Point[] = [[0, 0], [50, 0], [50, 50]];   // elbow at (50,0), arc-length 50
  const clipped = clipPolyline(poly, 20, 70);
  assert.deepEqual(clipped, [[20, 0], [50, 0], [50, 20]]);
});

test("discreteFrechet: identical polylines are zero distance apart", () => {
  const poly: Point[] = [[0, 0], [50, 0], [50, 50]];
  assert.equal(discreteFrechet(poly, poly), 0);
});

test("discreteFrechet: two parallel lines offset by a constant distance report exactly that distance", () => {
  const a: Point[] = [[0, 0], [100, 0]];
  const b: Point[] = [[0, 10], [100, 10]];
  assert.equal(discreteFrechet(a, b), 10);
});

test("discreteFrechet: a single spike far from an otherwise-matching path drives the whole distance up (it's a MAX, not an average)", () => {
  const a: Point[] = [[0, 0], [50, 0], [100, 0]];
  const b: Point[] = [[0, 0], [50, 1000], [100, 0]];
  assert.equal(discreteFrechet(a, b), 1000);
});

test("scoreTraceShapeMatch: an exact-match trace over the golden's own span scores zero Fréchet distance and full overlap", () => {
  const golden: Point[] = [[0, 0], [100, 0], [100, 100]];
  const m = scoreTraceShapeMatch("c1", golden, golden, 1 / 18);
  assert.equal(m.frechetPx, 0);
  assert.equal(m.lengthOverlapPct, 1);
  assert.equal(m.clippedLenFt, m.goldenLenFt);
});

test("scoreTraceShapeMatch: an over-traced polyline (extends well past the golden on both ends) is CLIPPED to the golden's own span first — over-trace is invisible here by design", () => {
  const golden: Point[] = [[0, 0], [100, 0]];
  const overTraced: Point[] = [[-500, 0], [0, 0], [100, 0], [600, 0]];   // same line, way longer
  const m = scoreTraceShapeMatch("c1", golden, overTraced, 1 / 18);
  assert.equal(m.frechetPx, 0);
  assert.equal(m.lengthOverlapPct, 1);
  assert.equal(m.clippedLenFt, m.goldenLenFt, "clipped to the golden's own 100px span, not the full 1100px trace");
});

test("scoreTraceShapeMatch: a trace that stops SHORT of the golden's own end reports partial overlap, not a false 100%", () => {
  const golden: Point[] = [[0, 0], [100, 0]];
  const shortTrace: Point[] = [[0, 0], [40, 0]];   // dead-ended 60% short of the golden's own end
  const m = scoreTraceShapeMatch("c1", golden, shortTrace, 1 / 18);
  assert.ok(m.lengthOverlapPct < 0.6, `expected well under 60% overlap, got ${m.lengthOverlapPct}`);
});

test("scoreTraceShapeMatch: the trace's own walk direction relative to the golden's is arbitrary — a REVERSED trace still matches cleanly", () => {
  const golden: Point[] = [[0, 0], [100, 0], [100, 100]];
  const reversedTrace: Point[] = [[100, 100], [100, 0], [0, 0]];
  const m = scoreTraceShapeMatch("c1", golden, reversedTrace, 1 / 18);
  assert.equal(m.frechetPx, 0);
  assert.equal(m.lengthOverlapPct, 1);
});

function traceRow(over: Partial<TraceRunRow> & { caseName: string }): TraceRunRow {
  return { status: "reached", goldenLf: 10, tracedLf: 10, lenErrPct: 0, overTracePct: 0, goldenSizeKey: null, tracedSizeKey: null, sizeMatch: null, ...over };
}

test("scoreTraceRecall: a hit needs BOTH Fréchet under the tolerance AND overlap at/above the minimum — either one failing is a miss", () => {
  const goodShape = { caseName: "c1", frechetPx: 1, lengthOverlapPct: 0.9, clippedLenFt: 10, goldenLenFt: 10 };
  const badFrechet = { ...goodShape, frechetPx: 5 };
  const badOverlap = { ...goodShape, lengthOverlapPct: 0.5 };
  const rows = [
    traceRow({ caseName: "hit", shape: goodShape }),
    traceRow({ caseName: "miss-frechet", shape: badFrechet }),
    traceRow({ caseName: "miss-overlap", shape: badOverlap }),
    traceRow({ caseName: "miss-refused", status: "refused", tracedLf: null, shape: goodShape }),
  ];
  const r = scoreTraceRecall(rows, 2, 0.8);
  assert.equal(r.hits, 1);
  assert.equal(r.total, 4);
  assert.equal(r.recall, 0.25);
  assert.deepEqual(r.misses.map((m) => m.caseName), ["miss-frechet", "miss-overlap", "miss-refused"]);
});

test("scoreTraceRecall: empty input reports zero recall, not NaN", () => {
  assert.equal(scoreTraceRecall([], 2, 0.8).recall, 0);
});

test("scoreTracePrecision: an exact-length trace scores 1.0; an over-traced one is diluted by its own excess length", () => {
  const exact = scoreTracePrecision([traceRow({ caseName: "c1", goldenLf: 10, tracedLf: 10 })]);
  assert.equal(exact, 1);
  const overTraced = scoreTracePrecision([traceRow({ caseName: "c1", goldenLf: 10, tracedLf: 20 })]);
  assert.equal(overTraced, 0.5, "10 correct ft out of 20 walked ft");
});

test("scoreTracePrecision: an under-traced (short) run is NOT penalized here — under-trace is a recall problem, not a precision one", () => {
  const short = scoreTracePrecision([traceRow({ caseName: "c1", goldenLf: 10, tracedLf: 4 })]);
  assert.equal(short, 1, "min(10,4)/4 = 1.0 — everything walked was correct, it just wasn't enough of it");
});

test("scoreTracePrecision: length-weighted across cases — a small case's own noise doesn't swing the aggregate as hard as a large case's real drift", () => {
  const rows = [
    traceRow({ caseName: "small", goldenLf: 2, tracedLf: 4 }),     // 50% precision, tiny weight
    traceRow({ caseName: "large", goldenLf: 100, tracedLf: 100 }),  // 100% precision, huge weight
  ];
  const p = scoreTracePrecision(rows);
  assert.ok(p > 0.9, `expected the large exact case to dominate, got ${p}`);
});

test("scoreTracePrecision: refused/unreached rows are excluded, not scored as zero", () => {
  const rows = [traceRow({ caseName: "refused", status: "refused", tracedLf: null })];
  assert.equal(scoreTracePrecision(rows), 0, "no reached rows at all — reports 0, not a crash");
});

test("aggregateTrace: rolls up recall, precision, worst length/over-trace error and length-weighted size accuracy", () => {
  const shape = { caseName: "c", frechetPx: 0, lengthOverlapPct: 1, clippedLenFt: 10, goldenLenFt: 10 };
  const rows: TraceRunRow[] = [
    traceRow({ caseName: "a", goldenLf: 10, tracedLf: 10, lenErrPct: 0, overTracePct: 0, goldenSizeKey: "pipe:1", tracedSizeKey: "pipe:1", sizeMatch: true, shape }),
    traceRow({ caseName: "b", goldenLf: 20, tracedLf: 22, lenErrPct: 0.1, overTracePct: 0.1, goldenSizeKey: "pipe:2", tracedSizeKey: "pipe:1", sizeMatch: false, shape }),
  ];
  const agg = aggregateTrace(rows, 2, 0.8);
  assert.equal(agg.cases, 2);
  assert.equal(agg.recall, 1, "both cases have a qualifying shape match");
  assert.ok(Math.abs(agg.maxLenErrPct - 0.1) < 1e-9);
  assert.ok(Math.abs(agg.maxOverTracePct - 0.1) < 1e-9);
  assert.ok(Math.abs(agg.sizeAccuracyPct! - 10 / 30) < 1e-9, "length-weighted: only the 10 ft case's size matched, out of 30 ft total");
});

test("aggregateTrace: no case carries a golden size — sizeAccuracyPct is null, never a fabricated number", () => {
  const agg = aggregateTrace([traceRow({ caseName: "a" })], 2, 0.8);
  assert.equal(agg.sizeAccuracyPct, null);
});

test("aggregateTrace: empty input reports zeros/nulls, not NaN or a thrown error", () => {
  const agg = aggregateTrace([], 2, 0.8);
  assert.deepEqual(agg, { cases: 0, recall: 0, precision: 0, maxLenErrPct: 0, meanLenErrPct: 0, maxOverTracePct: 0, sizeAccuracyPct: null, maxColdBuildMs: null, maxWarmQueryMs: null });
});

// ── refusal correctness — a labeled negative corpus, distinct from recall/precision above ──

function refusalRow(over: Partial<RefusalRow> & { caseName: string }): RefusalRow {
  return { correct: true, gotStatus: "refused", ...over };
}

test("scoreRefusalCorrectness: all-correct reports rate 1.0 with no misses", () => {
  const rows = [refusalRow({ caseName: "a" }), refusalRow({ caseName: "b" })];
  const r = scoreRefusalCorrectness(rows);
  assert.equal(r.correct, 2);
  assert.equal(r.total, 2);
  assert.equal(r.rate, 1);
  assert.deepEqual(r.misses, []);
});

test("scoreRefusalCorrectness: a seed that confidently REACHED instead of refusing is a miss, named", () => {
  const rows = [refusalRow({ caseName: "a" }), refusalRow({ caseName: "b", correct: false, gotStatus: "reached" })];
  const r = scoreRefusalCorrectness(rows);
  assert.equal(r.correct, 1);
  assert.equal(r.rate, 0.5);
  assert.deepEqual(r.misses.map((m) => m.caseName), ["b"]);
});

test("scoreRefusalCorrectness: empty input reports rate 0, not NaN", () => {
  assert.equal(scoreRefusalCorrectness([]).rate, 0);
});
