/**
 * AS-139: a typical-level row's sweeps, one a level's own mark, read as the
 * row's one sweep (mergeTypicalLevelSweeps). 26_CA's AHU-(6-33)-1 is tagged
 * AHU 6-1 on the typical plan for levels 6-16 and AHU 17-1 on level 17's.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeTypicalLevelSweeps } from "../src/session.ts";

const sweep = (mark: string, basis: string, sheets: { sheet: string; found: number; complete?: boolean }[]) => ({
  mark,
  r: {
    tag: mark,
    row: { key: mark, sheet: "M0.09" },
    anchor: { grounding_basis: basis, occurrences: sheets.reduce((n, s) => n + s.found, 0) },
    found: sheets.reduce((n, s) => n + s.found, 0),
    complete: sheets.every((s) => s.complete !== false),
    sheets: sheets.map((s) => ({ ...s, matches: Array.from({ length: s.found }, (_, i) => ({ id: `${mark}@${s.sheet}#${i}` })),
      withheld: [], excluded: [], text_only: [], candidates: { scanned: 10 } })),
    tag_citations: [{ text: mark }],
  },
});

describe("AS-139: a typical-level row's level sweeps read as the row's", () => {
  it("joins the levels' placements under the row's own tag, by sheet", () => {
    const merged = mergeTypicalLevelSweeps("AHU-(6-33)-1", [
      sweep("AHU-6-1", "geometry", [{ sheet: "p17", found: 1 }]),
      sweep("AHU-17-1", "geometry", [{ sheet: "p18", found: 1 }, { sheet: "p17", found: 1 }]),
    ]);
    assert.equal(merged.tag, "AHU-(6-33)-1");
    assert.equal(merged.row.key, "AHU-(6-33)-1");
    assert.equal(merged.found, 3);
    assert.equal(merged.anchor.occurrences, 3);
    assert.deepEqual(merged.sheets.map((s: any) => [s.sheet, s.found, s.matches.length, s.candidates.scanned]), [["p17", 2, 2, 20], ["p18", 1, 1, 10]]);
    assert.equal(merged.tag_citations.length, 2);
    assert.match(merged.note, /swept by its levels' own marks AHU-6-1, AHU-17-1/);
  });

  it("is complete only where every level's sweep was", () => {
    const merged = mergeTypicalLevelSweeps("AHU-(6-33)-1", [
      sweep("AHU-6-1", "geometry", [{ sheet: "p17", found: 1 }]),
      sweep("AHU-17-1", "geometry", [{ sheet: "p17", found: 1, complete: false }]),
    ]);
    assert.equal(merged.complete, false);
    assert.equal(merged.sheets[0].complete, false);
  });

  it("counts a level only its tag text grounds as plan-tag text beside verified levels", () => {
    const merged = mergeTypicalLevelSweeps("AHU-(6-33)-1", [
      sweep("AHU-17-1", "exact_plan_tag", [{ sheet: "p18", found: 1 }]),
      sweep("AHU-6-1", "geometry", [{ sheet: "p17", found: 1 }]),
    ]);
    assert.equal(merged.anchor.grounding_basis, "geometry", "the row keeps its verified basis");
    const bySheet = Object.fromEntries(merged.sheets.map((s: any) => [s.sheet, s.matches]));
    assert.equal(bySheet.p18[0].counted_from, "explicit_label");
    assert.equal(bySheet.p17[0].counted_from, undefined);
  });

  it("names the marks it could not anchor", () => {
    const merged = mergeTypicalLevelSweeps("AHU-(6-33)-1", [sweep("AHU-6-1", "geometry", [{ sheet: "p17", found: 1 }])],
      ["AHU-17-1: drawn on no plan sheet"]);
    assert.match(merged.note, /not anchored: AHU-17-1: drawn on no plan sheet/);
  });
});
