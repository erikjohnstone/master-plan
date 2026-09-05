/**
 * B-11 and B-12 — the two whole-table misses the RECALL tier found.
 *
 * Every other key in this corpus is scoped to tables the pipeline already
 * extracted, so a table it never constructs at all cannot appear in any of
 * them: both of these bugs were invisible to a 94.8%-exact scoreboard and
 * only surfaced once `keys/*.tables.csv` recorded what a human sees on the
 * rendered sheet. These tests pin them at the extractor.
 *
 * Fixtures are REAL captured spans and REAL captured linework from the two
 * cited sheets — no PDF bytes, same idiom as m601-spans.json, so they run
 * without the gitignored bulk corpus. The linework is reduced to
 * axis-aligned segments of length >= 20: both gates that read `segs`
 * (hasNearbyRuledLine, singleRowSitsInDrawnGrid) respond only to axis-aligned
 * rules spanning 60% of a table band or a whole row height, so every dropped
 * segment is provably inert for them — and the capture script asserted that
 * the full and reduced inputs produce byte-identical graph output before
 * writing each file (619,670 segments down to 842 on 016_NY#18, unchanged
 * result).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { buildSheetGraph, type GraphSpan } from "../src/lib/sheetgraph.ts";

type Fixture = { key: string; sheet_number: string | null; spans: GraphSpan[]; segs: number[] };
const load = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

const titlesOf = (fx: Fixture): string[] => {
  const g = buildSheetGraph([{ key: fx.key, sheet_number: fx.sheet_number, spans: fx.spans, segs: fx.segs }]);
  return (g.tables || []).map((t) => (t.title?.text || "").toUpperCase().replace(/\s+/g, " ").trim());
};

test("B-11: a block the finish pass never claims is not silently skipped for it", () => {
  // 13_MI…#28 (E-002 SCHEDULES) draws six schedule tables. Five print
  // SYMBOL|DESCRIPTION|MANUFACTURER|CATALOG NO.|REMARKS, which clears
  // FINISH_REQUIRED — so the generic reader stood down for the finish-kind
  // pass, whose own measured answer on this sheet is ZERO tables. Before the
  // fix exactly one table (LUMINAIRE SCHEDULE, via the equipment pass)
  // reached the graph.
  const titles = titlesOf(load("b11-13mi-p28.spans.json"));
  assert.ok(titles.includes("LUMINAIRE SCHEDULE"),
    `the equipment-kind read must be untouched: ${JSON.stringify(titles)}`);
  assert.ok(titles.includes("DATA DEVICE SCHEDULE"),
    `a table no kind pass actually claims must reach the graph: ${JSON.stringify(titles)}`);
  assert.ok(titles.length >= 2,
    `pre-fix this sheet yielded exactly one table; got ${titles.length}: ${JSON.stringify(titles)}`);
});

test("B-12: single-data-row schedules drawn in a real grid are extracted", () => {
  // 016_NY…#18 (M-601 SCHEDULES) draws eleven schedule tables; SEVEN of them
  // carry exactly one data row, which is ordinary drafting (one unit, one
  // row) and not the control-schematic coincidence the `< 2` guard was
  // written against. Pre-fix the sheet yielded 4 tables, 3 correctly titled.
  const titles = titlesOf(load("b12-016ny-p18.spans.json"));
  const oneRow = [
    "AIR HANDLING UNIT SCHEDULE",       // AHU-1
    "AIR COOLED CONDENSING UNIT SCHEDULE", // ACCU-1
    "STATIONARY ROOF VENTILATOR SCHEDULE", // SRV-1
  ];
  for (const want of oneRow) {
    assert.ok(titles.includes(want), `${want} is one real row of real equipment: ${JSON.stringify(titles)}`);
  }
  // …and the multi-row tables that already worked still do.
  assert.ok(titles.includes("DIFFUSER, REGISTER AND GRILLE SCHEDULE"), JSON.stringify(titles));
  assert.ok(titles.includes("PUMP SCHEDULE"), JSON.stringify(titles));
  assert.ok(titles.length >= 9, `pre-fix this sheet yielded 4 tables; got ${titles.length}`);
});

test("B-12: the guard still refuses a one-row candidate with no linework to judge", () => {
  // singleRowSitsInDrawnGrid is deliberately stricter than hasNearbyRuledLine,
  // which fails OPEN on a sheet that supplied no segs. With the linework
  // removed the same sheet's one-row tables must go back to being refused —
  // an unanswerable question is not a yes.
  const fx = load("b12-016ny-p18.spans.json");
  const g = buildSheetGraph([{ key: fx.key, sheet_number: fx.sheet_number, spans: fx.spans }]);
  const titles = (g.tables || []).map((t) => (t.title?.text || "").toUpperCase().replace(/\s+/g, " ").trim());
  assert.ok(!titles.includes("STATIONARY ROOF VENTILATOR SCHEDULE"),
    `with no segs the one-row grid test cannot pass: ${JSON.stringify(titles)}`);
});
