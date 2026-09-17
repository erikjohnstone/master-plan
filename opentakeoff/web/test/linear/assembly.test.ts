// linear/assembly.ts — resolveLinearAssembly (#linear-takeoff WP2.2,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md plan §8). The golden case is
// plan §8.4's own worked example (Bessemer M101's traced 12x6 -> 16x8
// supply): every line this module CAN compute from WP1's actual vertex/
// segment model is asserted against the plan's own table, cell for cell,
// including the one place a hand-computed illustrative number and this
// module's own precise arithmetic differ by a tenth of a pound (documented
// at that assertion, not hidden). Lines the plan's worked example includes
// but WP1's data model cannot yet represent (diffuser taps, flex runouts,
// the extra near-elbow hanger, fitting-weight-inclusive labor) are NOT
// asserted here — assembly.ts's own header comment lists them as follow-up
// work, and pretending to reproduce them would just be a second, unrelated
// place that comment could go stale.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLinearAssembly } from "../../src/lib/linear/assembly.ts";
import type { AssemblyRecord, ComputedRun, LinearCondition } from "../../src/lib/linear/types.ts";

// plan §8.4: "18.2 ft of 12x6 (probe, §3.5) + transition + 29 ft of 16x8
// (label), one radius elbow" — a straight run (the probe's own chain had
// zero turn at the transition, exactly why sizeChangeEvents() reads
// segments directly rather than vertices[]); the elbow is a SEPARATE turn
// elsewhere on the run, modeled here as an extra zero-length-consequence
// vertex entry (its angle doesn't affect any segment length in this test).
const WORKED_EXAMPLE_RUN: ComputedRun = {
  segments: [
    { i: 0, lf: 18.2, size: { kind: "rect", w_in: 12, h_in: 6 }, size_src: "manual" },
    { i: 1, lf: 29.0, size: { kind: "rect", w_in: 16, h_in: 8 }, size_src: "manual" },
  ],
  vertices: [
    { i: 1, kind: "elbow", angle_deg: 90, angle_class: "square" },
  ],
  totals_by_size: { "rect:12x6": 18.2, "rect:16x8": 29.0 },
};

const DUCT_CONDITION: LinearCondition = { family: "duct_rect" };

function ductAssembly(deductFittings: boolean): AssemblyRecord {
  return {
    id: "asm-test-duct", family: "duct_rect", name: "worked-example assembly",
    provenance: "plan §8.4",
    // plan §8.4's own premise: "simplified gauge -> 26 ga BOTH sizes" — a
    // pinned assembly-level gauge, not what A1's longest-side table alone
    // would give the 16x8 segment (24 ga) — see assembly.ts's own comment
    // on `ductLbRule.gauge`.
    per_ft: [{ item: "duct_lb", gauge: 26 }, { item: "insulation_sf", thickness_in: 1.5, lap_factor: 1.10 }],
    per_vertex: [{ item: "elbow", kind: "elbow", labor_factor: 1.4 }],
    per_run: [],
    deduct_fittings: deductFittings,
  };
}

test("resolveLinearAssembly: plan §8.4 worked example, cell by cell", () => {
  const items = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(false), { pressure_class_in_wg: 2 });
  const by = (item: string, sizeKey?: string) => items.find((i) => i.item === item && (sizeKey === undefined || i.size_key === sizeKey))!;

  // "Duct 12x6 | 18.2 x 2(12+6)/12 x 0.906 x 1.15 | 56.9 lb" — exact.
  assert.equal(by("duct_lb", "rect:12x6").qty, 56.9);
  // "Duct 16x8 | 29.0 x 2(16+8)/12 x 0.906 x 1.15 | 121.0 lb" — the plan's
  // own hand arithmetic rounds to 121.0; this module's unrounded chain
  // (29 x 4 x 0.906 x 1.15 = 120.8604) rounds to 120.9 at one decimal —
  // a tenth-of-a-pound difference from the plan's own intermediate
  // rounding, not a formula disagreement (verified by hand above).
  assert.equal(by("duct_lb", "rect:16x8").qty, 120.9);

  // "Wrap SF | 18.2x2(15+9)/12x1.10 + 29x2(19+11)/12x1.10 | 80.1 + 159.5 = 239.6 SF" — exact, both terms.
  assert.equal(by("insulation_sf", "rect:12x6").qty, 80.1);
  assert.equal(by("insulation_sf", "rect:16x8").qty, 159.5);

  // "Elbow 12x6 R1.5 | 1 x piece weight x 1.40 | 1 ea" — the count; this
  // module doesn't carry a per-piece weight table (WP2.1 never built one),
  // so only the count side of this row is asserted.
  assert.equal(by("elbow").qty, 1);

  // "Transition 12x6->16x8 | 1 | 1 ea" — exact, plus the developed-length
  // formula string (A5's 4 x delta rule, delta = max(|12-16|,|6-8|) = 4 in).
  const transition = by("transition");
  assert.equal(transition.qty, 1);
  assert.match(transition.formula, /4 x 4in/);

  // "Hangers | ceil(18.2/10)+1 + ceil(29/10)+1 + 1 (elbow) | 3 + 4 + 1 = 8 ea"
  // — this module's hanger formula matches the plan's own per-group counts
  // exactly; the "+1 (elbow)" near-fitting hanger bump is the one
  // documented gap (assembly.ts's header comment), so the total here is
  // 3 + 4 = 7, not 8.
  assert.equal(by("hanger", "rect:12x6").qty, 3);
  assert.equal(by("hanger", "rect:16x8").qty, 4);

  // "Joints | ceil(18.2/5) + ceil(29/5) + 2 + 2 + 3 | 4 + 6 + 7 = 17" — the
  // "+3" is the (unimplemented) diffuser taps' own joints; this module's
  // total is 4 + 6 + 2(elbow) + 2(transition) = 14, exactly 3 short of the
  // plan's 17 — the exact size of the documented gap, not a miscount.
  assert.equal(by("joint").qty, 14);

  // "Labor | (56.9 + 121.0 + fittings lb) x 0.023 | ~5.7 hr + fittings" —
  // this module's total EXCLUDES the undefined "fittings lb" term (no
  // per-piece weight table exists), giving (56.9 + 120.9) x 0.023 = 4.09 hr
  // — the plan's own base term before it adds the unresolved fitting
  // increment to reach "~5.7 hr".
  assert.equal(by("labor_hr").qty, 4.09);
});

test("resolveLinearAssembly: deduct_fittings shifts the transition's developed length off the upstream segment's own LF, never silently", () => {
  const off = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(false), {});
  const on = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(true), {});
  const lb12x6Off = off.find((i) => i.item === "duct_lb" && i.size_key === "rect:12x6")!.qty;
  const lb12x6On = on.find((i) => i.item === "duct_lb" && i.size_key === "rect:12x6")!.qty;
  assert.ok(lb12x6On < lb12x6Off, "deduct_fittings on must reduce the upstream segment's straight-LF weight");
  // The transition line item itself is unaffected — it is disclosed either way.
  assert.equal(off.find((i) => i.item === "transition")!.qty, on.find((i) => i.item === "transition")!.qty);
});

test("§8.5 invariant: waste and rounding are never applied inside resolveLinearAssembly (report-only, per plan §8's steps 6-7)", () => {
  const items = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(false), {});
  // No line item's formula mentions waste or a purchase-unit rounding —
  // those belong to whatever renders the Report's order column, never to
  // this function's own live numbers.
  for (const it of items) assert.doesNotMatch(it.formula, /waste|purchase|carton|roll/i);
});

test("§8.5 invariant: resolution is deterministic and pure — identical inputs, identical output, every call", () => {
  const a = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(false), { pressure_class_in_wg: 2 });
  const b = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(false), { pressure_class_in_wg: 2 });
  assert.deepEqual(a, b);
  // ...and the input ComputedRun is never mutated (deduct_fittings works on
  // a private copy of the per-size groups, per assembly.ts's own comment).
  assert.deepEqual(WORKED_EXAMPLE_RUN.segments[0].lf, 18.2);
});

test("§8.5 invariant: the condition multiplier applies to every live qty, last, and never to the formula's own math", () => {
  const base = resolveLinearAssembly(WORKED_EXAMPLE_RUN, DUCT_CONDITION, ductAssembly(false), {});
  const doubled = resolveLinearAssembly(WORKED_EXAMPLE_RUN, { ...DUCT_CONDITION, multiplier: 2 }, ductAssembly(false), {});
  for (let i = 0; i < base.length; i++) assert.equal(doubled[i].qty, +(base[i].qty * 2).toFixed(4));
});

test("pipe family: per-foot LF/coupling/insulation/labor and per-run hangers resolve from the pipe rate tables", () => {
  const run: ComputedRun = {
    segments: [{ i: 0, lf: 40, size: { kind: "pipe", nps_in: 1 }, size_src: "manual" }],
    vertices: [],
    totals_by_size: { "pipe:1": 40 },
  };
  const assembly: AssemblyRecord = { id: "asm-pipe", family: "pipe", name: "test pipe", per_ft: [], per_vertex: [], per_run: [] };
  const items = resolveLinearAssembly(run, { family: "pipe" }, assembly, {}, { pipeService: "hw_dhw_105_140f", pipeHangerMaterial: "copper", pipeHangerService: "mechanical" });
  const by = (item: string) => items.find((i) => i.item === item)!;
  assert.equal(by("pipe_lf").qty, 40);
  assert.equal(by("coupling").qty, 1); // ceil(40/20) - 1 = 1
  assert.equal(by("insulation_lf").qty, 40);
  assert.equal(by("hanger").qty, hangerCountFor(40, 6)); // MSS SP-58 copper-water @ 1" NPS = 6 ft
});

function hangerCountFor(lengthFt: number, spacingFt: number): number {
  return Math.max(2, Math.ceil(lengthFt / spacingFt) + 1);
}
