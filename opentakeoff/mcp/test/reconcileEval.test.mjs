// The reconcile eval's scorer (scripts/reconcileEval.mjs) on a synthetic key
// and reconcile output: each count it reports, and what it leaves out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRows, parseCsv, PLANSHEET_COLUMNS, PLANTAG_COLUMNS, scoreReconcileSet } from "../scripts/reconcileEval.mjs";

const SHEETS = `# comment
sheet,title,discipline,kind,examined,note
a.pdf#10,FIRST FLOOR PLAN,M,new,yes,
a.pdf#11,ROOF PLAN,M,roof,yes,
a.pdf#12,DEMOLITION PLAN,M,demolition,yes,
a.pdf#20,POWER PLAN,E,new,no,not searched`;
const TAGS = `sheet,drawn,unit,placements,counts,view,note
a.pdf#10,EF-1,a.pdf#5|EF-1,1,yes,new,
a.pdf#11,EF-1,a.pdf#5|EF-1,1,no,view-repeat,"same fan, roof view"
a.pdf#10,VAV-1,a.pdf#5|VAV-1,2,yes,new,two boxes share the mark
a.pdf#12,AHU-1,a.pdf#5|AHU-1,1,no,demolition,
a.pdf#10,AHU-1,a.pdf#5|AHU-1,1,yes,new,
,,a.pdf#5|P-1,0,no,not_drawn,only on the riser
a.pdf#10,(E) FCU-9,unscheduled,1,yes,existing,
a.pdf#10,UH 3,a.pdf#5|UH-3,1,yes,new,stacked`;

const key = { sheets: parseCsv(SHEETS, PLANSHEET_COLUMNS), tags: parseCsv(TAGS, PLANTAG_COLUMNS) };
const row = (tag, plan, extra = {}) => ({ tag, schedule_cite: { sheet: "a.pdf#5", title: "SCHEDULE" }, status: plan.length ? "MATCH" : "SCHEDULE_ONLY", installed_qty: plan.length, plan_cites: plan.map((sheet) => ({ sheet })), ...extra });
const output = {
  rows: [
    row("EF-1", ["a.pdf#10", "a.pdf#11"]), // a roof repeat counted: over by one
    row("VAV-1", ["a.pdf#10"]), // one of two: under by one
    row("AHU-1", ["a.pdf#10", "a.pdf#20"]), // the unexamined power plan is left out
    row("P-1", []), // not drawn, not cited
    // UH-3 has no row: unmatched, never a count of 0
  ],
  unscheduled_tags: [{ sheet: "a.pdf#10", text: "(E)FCU-9" }, { sheet: "a.pdf#10", text: "D" }],
};

test("reconcile eval: row -> plan counts placements on examined sheets only, and keeps unmatched units apart", () => {
  const r = scoreReconcileSet(key, output);
  const s = r.summary;
  assert.equal(s.units, 5);
  assert.equal(s.unmatched, 1, "UH-3 has no reconcile row");
  assert.equal(s.key_placements, 1 + 2 + 1, "EF-1, VAV-1 x2, AHU-1 new; roof repeat and demolition do not count");
  assert.equal(s.pipeline_placements, 2 + 1 + 1, "EF-1 on floor and roof, VAV-1 once, AHU-1 on the floor plan; the unexamined sheet is out");
  assert.equal(s.placement_hits, 1 + 1 + 1);
  assert.deepEqual([s.count_exact, s.count_over, s.count_under], [2, 1, 1], "AHU-1 and P-1 exact, EF-1 over, VAV-1 under");
  assert.deepEqual([s.drawn_tp, s.drawn_fn, s.drawn_fp, s.drawn_tn], [3, 0, 0, 1]);
  const ef = r.units.find((u) => u.unit.endsWith("|EF-1"));
  assert.deepEqual(ef.sheets, [{ sheet: "a.pdf#10", key: 1, pipeline: 1 }, { sheet: "a.pdf#11", key: 0, pipeline: 1 }]);
});

test("reconcile eval: plan -> row links each drawn tag to its unit's row on that sheet, and names unscheduled tags", () => {
  const r = scoreReconcileSet(key, output);
  const s = r.summary;
  // EF-1 floor, EF-1 roof, VAV-1, AHU-1 demolition, AHU-1 floor, UH 3: six drawn scheduled tags.
  assert.equal(s.links, 6);
  assert.equal(s.linked, 4, "EF-1 twice, VAV-1, AHU-1 floor; AHU-1's demolition sheet is not cited and UH-3 has no row");
  assert.equal(s.unscheduled, 1);
  assert.equal(s.unscheduled_listed, 1, "(E) FCU-9 is listed, separators and case aside");
  assert.equal(s.unscheduled_linked_to_a_row, 0);
  const demo = r.links.find((l) => l.sheet === "a.pdf#12");
  assert.equal(demo.linked, false);
});

test("reconcile eval: a key sheet not examined is no evidence either way", () => {
  const k2 = { sheets: key.sheets.map((s) => ({ ...s, examined: "no" })), tags: key.tags };
  const s = scoreReconcileSet(k2, output).summary;
  assert.equal(s.key_placements, 0);
  assert.equal(s.pipeline_placements, 0);
  assert.equal(s.links, 0);
  assert.equal(s.unscheduled, 0);
});

test("reconcile eval: the review list is scored on examined sheets by what the key draws there", () => {
  const out2 = { ...output, unscheduled_tags: [
    { sheet: "a.pdf#10", text: "(E)FCU-9" }, // a keyed unscheduled unit
    { sheet: "a.pdf#10", text: "VAV 1" }, // a scheduled unit's tag, listed as unscheduled
    { sheet: "a.pdf#10", text: "ROOM-101" }, // no unit tag
    { sheet: "a.pdf#20", text: "PP-1" }, // an unexamined sheet: left out
  ] };
  const s = scoreReconcileSet(key, out2).summary;
  assert.deepEqual([s.review_listed, s.review_unscheduled, s.review_scheduled, s.review_not_a_unit], [3, 1, 1, 1]);
});

test("reconcile eval: a placement on the unit's repeat view is located on the unit, not counted as agreeing", () => {
  // EF-1 is counted on #10 and drawn again on the roof view #11 (counts no): the
  // row's cites on both are located (capped at the unit's one counted placement)
  const r = scoreReconcileSet(key, output);
  const ef = r.units.find((u) => u.unit.endsWith("|EF-1"));
  assert.equal(ef.located, 1);
  const out2 = { ...output, rows: output.rows.map((row) => row.tag === "EF-1" ? { ...row, plan_cites: [{ sheet: "a.pdf#11" }] } : row) };
  const ef2 = scoreReconcileSet(key, out2).units.find((u) => u.unit.endsWith("|EF-1"));
  assert.deepEqual([ef2.key, ef2.pipeline, ef2.located], [1, 1, 1], "counted on the roof view instead: located, though no per-sheet hit");
  assert.equal(scoreReconcileSet(key, out2).summary.placement_hits, 2, "VAV-1 and AHU-1 only");
});

test("reconcile eval: a unit the key names by a range, a list or a pair is the rows of its marks together, where no row reads as the whole name (AS-98, AS-99)", () => {
  const units = ["a.pdf#5|SF-1 THRU 3", "a.pdf#5|SS-1/SSCU-1", "a.pdf#5|EF-1 & 2", "a.pdf#5|AHU-9"];
  const rows = [
    row("SF-1", ["a.pdf#10"]), row("SF-2", ["a.pdf#10"]), row("SF-3", []),
    // a split system's indoor and outdoor units, the takeoff's split of the pair
    row("SS-1", ["a.pdf#10"]), row("SSCU-1", ["a.pdf#11"]),
    // a run holding one row for the whole name matches it exactly, as before
    row("EF-1 & 2", ["a.pdf#10"]),
    row("SF-4", ["a.pdf#10"], { schedule_cite: { sheet: "a.pdf#6", title: "OTHER" } }),
  ];
  const m = matchRows(units, rows);
  const [sf] = m.get("a.pdf#5|SF-1 THRU 3");
  assert.deepEqual([sf.tag, sf.merged_rows, sf.status, sf.installed_qty, sf.plan_cites.length], ["SF-1 + SF-2 + SF-3", 3, "MIXED", 2, 2]);
  const [ss] = m.get("a.pdf#5|SS-1/SSCU-1");
  assert.deepEqual([ss.tag, ss.merged_rows, ss.status, ss.installed_qty, ss.plan_cites.map((c) => c.sheet)], ["SS-1 + SSCU-1", 2, "MATCH", 2, ["a.pdf#10", "a.pdf#11"]]);
  const ef = m.get("a.pdf#5|EF-1 & 2");
  assert.equal(ef.length, 1);
  assert.equal(ef[0].merged_rows, undefined);
  assert.deepEqual(m.get("a.pdf#5|AHU-9"), [], "no row, no merge: unmatched");
});
