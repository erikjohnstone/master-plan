// linear/rates.ts — graded rate lookups (#linear-takeoff WP2.1,
// opentakeoff-corpus/goals/LINEAR_TAKEOFF.md). Invariants under test: every
// lookup returns the exact cell the research doc's own tables carry (no
// silent transcription drift); band lookups round to the correct side
// (duct gauge rounds UP in size at a boundary — e.g. exactly 12 in. stays
// 26 ga, 12.01 in. jumps to 24 ga — and pipe joint-hour/hanger lookups round
// UP to the next stocked NPS when the exact size has no row); a cell with
// no data for a requested combination returns null rather than a wrong
// number (grooved joints below 1½", an unrecognized code-table material);
// and GATE 2's own invariant — every table cell carries a grade and a
// source, and nothing is graded "C" without a real source string — holds
// across every table this module loads, checked generically rather than
// per-table so a future table addition is covered for free.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ductGaugeFor, ductWeightPerSf, ductWeightPerLf, ductHangerSpacingFor,
  pipeHangerSpacingFt, ductInsulationRValue, pipeInsulationThicknessIn,
  pipeJointHours, hangerCount, couplingCount, ductLabor, pipeLabor, basDefaults,
  type Grade,
} from "../../src/lib/linear/rates.ts";
import ductGaugeTable from "../../src/lib/linear/tables/ductGauge.json" with { type: "json" };
import ductWeightTable from "../../src/lib/linear/tables/ductWeight.json" with { type: "json" };
import ductHangerTable from "../../src/lib/linear/tables/ductHangerSpacing.json" with { type: "json" };
import pipeHangerTable from "../../src/lib/linear/tables/pipeHangerSpacing.json" with { type: "json" };
import ductInsulationTable from "../../src/lib/linear/tables/ductInsulation.json" with { type: "json" };
import pipeInsulationTable from "../../src/lib/linear/tables/pipeInsulation.json" with { type: "json" };
import pipeJointHoursTable from "../../src/lib/linear/tables/pipeJointHours.json" with { type: "json" };

test("ductGaugeFor: bands match the simplified spec schedule, boundary inclusive", () => {
  assert.equal(ductGaugeFor(12).value, 26);
  assert.equal(ductGaugeFor(12.01).value, 24);
  assert.equal(ductGaugeFor(30).value, 24);
  assert.equal(ductGaugeFor(30.5).value, 22);
  assert.equal(ductGaugeFor(54).value, 22);
  assert.equal(ductGaugeFor(84).value, 20);
  assert.equal(ductGaugeFor(96).value, 18);
  assert.equal(ductGaugeFor(97).value, 16);
  assert.equal(ductGaugeFor(500).value, 16);
  assert.equal(ductGaugeFor(1).grade, "M");
});

test("ductWeightPerSf: exact gauges match the research doc's confirmed cells, unknown gauges fall back", () => {
  assert.equal(ductWeightPerSf(26).value, 0.906);
  assert.equal(ductWeightPerSf(26).grade, "C");
  assert.equal(ductWeightPerSf(24).value, 1.156);
  assert.equal(ductWeightPerSf(20).value, 1.656);
  assert.equal(ductWeightPerSf(30).grade, "V");
  // 19 isn't a stocked gauge in the table — gauge numbering is inverted from
  // thickness, so "nearest stocked gauge at least as heavy" rounds DOWN in
  // gauge number (18, thicker) rather than up (20, thinner).
  assert.equal(ductWeightPerSf(19).value, ductWeightPerSf(18).value);
});

test("ductWeightPerLf: girth x lb/sf x 1.15 seam allowance, rect/round/oval", () => {
  const seam = (ductLabor as { seam_joint_allowance: { value: number } }).seam_joint_allowance.value;
  const lb26 = ductWeightPerSf(26).value;
  assert.equal(ductWeightPerLf({ kind: "rect", w_in: 12, h_in: 6 }, 26), (2 * (12 + 6) / 12) * lb26 * seam);
  assert.equal(ductWeightPerLf({ kind: "round", d_in: 12 }, 26), (Math.PI * 12 / 12) * lb26 * seam);
  assert.ok(ductWeightPerLf({ kind: "oval", major_in: 24, minor_in: 12 }, 26) > 0);
  // "pipe" carries no sheet-metal weight — this formula is duct-only
  assert.equal(ductWeightPerLf({ kind: "pipe", nps_in: 2 }, 26), 0);
});

test("ductHangerSpacingFor: spacing is ALWAYS the IMC 603.10 code floor, hardware varies by size band", () => {
  const small = ductHangerSpacingFor({ kind: "rect", w_in: 12, h_in: 6 });
  const large = ductHangerSpacingFor({ kind: "rect", w_in: 100, h_in: 92 });
  assert.equal(small.max_spacing_ft.value, 10);
  assert.equal(small.max_spacing_ft.grade, "C");
  assert.equal(large.max_spacing_ft.value, 10); // never widened past the code floor
  assert.notEqual(small.hardware.value, large.hardware.value);
  assert.equal(small.hardware.grade, "M");
  const round = ductHangerSpacingFor({ kind: "round", d_in: 10 });
  assert.equal(round.max_spacing_ft.value, 10);
  assert.match(round.hardware.value, /wire|strap/);
});

test("pipeHangerSpacingFt: MSS SP-58 by material column, code tables by material key, unknown material is null", () => {
  assert.equal(pipeHangerSpacingFt("mechanical", 2, "steel")!.value, 10);
  assert.equal(pipeHangerSpacingFt("mechanical", 2, "copper")!.value, 8);
  assert.equal(pipeHangerSpacingFt("mechanical", 2, "copper")!.grade, "V"); // bold-confirmed cell
  assert.equal(pipeHangerSpacingFt("mechanical", 1.25, "steel")!.value, 7);
  assert.equal(pipeHangerSpacingFt("mechanical", 100, "steel")!.value, 23); // rounds up to the largest row (NPS 12)
  assert.equal(pipeHangerSpacingFt("plumbing", 1, "copper_tubing_le_1_25in")!.value, 6);
  assert.equal(pipeHangerSpacingFt("plumbing", 1, "copper_tubing_le_1_25in")!.grade, "C");
  assert.equal(pipeHangerSpacingFt("plumbing", 2, "nonexistent_material"), null);
  assert.equal(pipeHangerSpacingFt("plumbing", 4, "lead"), null); // horizontal_ft is null (continuous support only)
  // selectable adopted code
  const upc = pipeHangerSpacingFt("plumbing", 1, "copper_tube_le_1_5in", "upc313_3");
  assert.equal(upc!.value, 6);
  const imc = pipeHangerSpacingFt("mechanical", 1, "copper_tubing", "imc305_4");
  assert.equal(imc!.value, 8);
});

test("ductInsulationRValue: location lookup matches IECC C403.12.1", () => {
  assert.equal(ductInsulationRValue("unconditioned_space").value, 6);
  assert.equal(ductInsulationRValue("unconditioned_space").grade, "C");
  assert.equal(ductInsulationRValue("outside_building_cz0_4").value, 8);
  assert.equal(ductInsulationRValue("outside_building_cz5_8").value, 12);
  assert.throws(() => ductInsulationRValue("nowhere" as never));
});

test("pipeInsulationThicknessIn: NPS band lookup, confirmed cells graded C", () => {
  assert.equal(pipeInsulationThicknessIn("chilled_40_60f", 0.75).value, 0.5);
  assert.equal(pipeInsulationThicknessIn("chilled_40_60f", 0.75).grade, "C");
  assert.equal(pipeInsulationThicknessIn("chilled_40_60f", 2).value, 1.0);
  assert.equal(pipeInsulationThicknessIn("chilled_40_60f", 2).grade, "C");
  assert.equal(pipeInsulationThicknessIn("chilled_40_60f", 1.25).value, 0.5); // "1 to <1.5" band, not confirmed
  assert.equal(pipeInsulationThicknessIn("chilled_40_60f", 1.25).grade, "M");
  assert.equal(pipeInsulationThicknessIn("steam_gt350f", 10).value, 5.0);
  assert.equal(pipeInsulationThicknessIn("steam_gt350f", 10).grade, "C");
  assert.equal(pipeInsulationThicknessIn("hw_heating_141_200f", 0.5).value, 1.5);
});

test("pipeJointHours: exact NPS matches, rounds up to the next stocked size, missing cells are null", () => {
  assert.equal(pipeJointHours(2, "solder_copper")!.value, 0.45);
  assert.equal(pipeJointHours(2, "solder_copper")!.grade, "M"); // order-of-magnitude, never licensed
  assert.equal(pipeJointHours(1.25, "grooved")!.value, 0.35); // rounds up to the 1.5" row
  assert.equal(pipeJointHours(0.75, "grooved"), null); // no grooved cell below 1.5"
  assert.equal(pipeJointHours(6, "threaded_steel"), null); // no threaded-steel cell at 6"
  assert.equal(pipeJointHours(0.5, "threaded_steel")!.value, 0.30); // below the smallest row uses it
});

test("hangerCount / couplingCount: D1's rounding rules, minimum floors, zero-length is zero", () => {
  assert.equal(hangerCount(0, 10), 0);
  assert.equal(hangerCount(5, 10), 2); // ceil(5/10)+1=2, floor is 2 anyway
  assert.equal(hangerCount(31.69, 10), 5); // ceil(3.169)=4, +1=5
  assert.equal(couplingCount(0, 21), 0);
  assert.equal(couplingCount(21, 21), 0); // exactly one stick needs no coupling
  assert.equal(couplingCount(22, 21), 1);
  assert.equal(couplingCount(60, 21), 2);
});

test("basDefaults / pipeLabor / ductLabor: re-exported tables carry the researched defaults", () => {
  assert.equal((basDefaults as { ft_per_point: { home_run: { value: number } } }).ft_per_point.home_run.value, 75);
  assert.equal((pipeLabor as { waste_pct: { copper: number } }).waste_pct.copper, 7.5);
  assert.equal((ductLabor as { fitting_weight_factor: { value: number } }).fitting_weight_factor.value, 1.40);
});

// ── GATE 2 invariant, checked generically ────────────────────────────────
// "every table cell carries a grade and a source; a [M] cell cannot be
// marked C without a source URL in the same commit." Walks every JSON table
// this module loads and asserts: (1) every object with a `grade` field uses
// one of the three legal letters; (2) every `grade: "C"` sits beside (on the
// same object, or inherits from the enclosing table's own `table_grade`/
// `table_source`) a `source` string that looks like a citation, not empty;
// (3) no orphaned grade without a source anywhere in the tree.
const ALL_TABLES: Record<string, unknown> = {
  ductGauge: ductGaugeTable, ductWeight: ductWeightTable, ductHanger: ductHangerTable,
  pipeHanger: pipeHangerTable, ductInsulation: ductInsulationTable, pipeInsulation: pipeInsulationTable,
  pipeJointHours: pipeJointHoursTable,
};

function walk(node: unknown, path: string, inheritedSource: string | undefined, issues: string[]) {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`, inheritedSource, issues)); return; }
  const obj = node as Record<string, unknown>;
  const ownSource = typeof obj.source === "string" ? obj.source : typeof obj.table_source === "string" ? obj.table_source : inheritedSource;
  if ("grade" in obj && obj.grade !== null) {
    // pipeInsulation.json's per-row `grade` is an array of per-band overrides
    // (Grade | null), aligned with that row's `thickness_in` array — not a
    // single Grade string like everywhere else. Validate each entry the
    // same way rather than treating the array itself as one illegal value.
    const grades = Array.isArray(obj.grade) ? (obj.grade as (Grade | null)[]) : [obj.grade as Grade];
    for (const g of grades) {
      if (g === null) continue;
      if (!["C", "V", "M"].includes(g)) issues.push(`${path}: illegal grade ${JSON.stringify(g)}`);
      if (!ownSource || ownSource.trim().length < 8) issues.push(`${path}: grade ${g} with no usable source`);
    }
  }
  if ("table_grade" in obj) {
    const g = obj.table_grade as Grade;
    if (!["C", "V", "M"].includes(g)) issues.push(`${path}: illegal table_grade ${JSON.stringify(g)}`);
    if (!ownSource || ownSource.trim().length < 8) issues.push(`${path}: table_grade ${g} with no usable table_source`);
  }
  for (const [k, v] of Object.entries(obj)) if (k !== "source" && k !== "table_source") walk(v, `${path}.${k}`, ownSource, issues);
}

test("GATE 2: every graded cell across every rates table carries a grade in {C,V,M} and a real source", () => {
  const issues: string[] = [];
  for (const [name, table] of Object.entries(ALL_TABLES)) walk(table, name, undefined, issues);
  assert.deepEqual(issues, []);
});
