/**
 * P3 sequence extraction — builds on SOO detectors, never invents points.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractSequencesFromGraph, compileSequencesTakeoff } from "../src/lib/sequenceExtract.ts";

describe("sequenceExtract", () => {
  it("extracts tabular sections from SOO-titled tables", () => {
    const graph = {
      tables: [{
        sheet: "set.pdf#20",
        kind: "reference",
        title: { text: "AHU-1 SEQUENCE OF OPERATION", bbox: [0, 0, 100, 20] },
        headers: ["STEP", "DESCRIPTION"],
        rows: [
          {
            key: "1.",
            cells: {
              STEP: { text: "1.", bbox: [10, 30, 20, 40] },
              DESCRIPTION: { text: "Enable supply fan when occupied.", bbox: [30, 30, 200, 40] },
            },
          },
          {
            key: "2.",
            cells: {
              STEP: { text: "2.", bbox: [10, 50, 20, 60] },
              DESCRIPTION: { text: "Modulate chilled water valve.", bbox: [30, 50, 200, 60] },
            },
          },
        ],
      }],
    };
    const seqs = extractSequencesFromGraph(graph);
    assert.equal(seqs.length, 1);
    assert.equal(seqs[0].status, "extracted");
    assert.equal(seqs[0].sections.length, 2);
    assert.deepEqual(seqs[0].impliedPoints, []);
    assert.ok(seqs[0].sections[0].evidence.length >= 1);
  });

  it("discloses narrative-only SOO without inventing points", () => {
    const graph = {
      tables: [{
        sheet: "set.pdf#20",
        kind: "reference",
        title: { text: "LAB VENTILATION SYSTEM SEQUENCE OF OPERATION", bbox: [0, 0, 80, 10] },
        headers: [],
        rows: [],
      }],
    };
    const seqs = extractSequencesFromGraph(graph);
    assert.ok(seqs.length >= 1);
    assert.equal(seqs[0].status, "narrative_only");
    assert.deepEqual(seqs[0].impliedPoints, []);
  });

  it("compileSequencesTakeoff produces the same envelope shape as the other T-* compiles, never invents points", () => {
    const graph = {
      sheets: [{ key: "set.pdf#20", sheetNumber: "M6.1" }, { key: "set.pdf#21", sheetNumber: "M6.2" }],
      tables: [{
        sheet: "set.pdf#20",
        kind: "reference",
        title: { text: "AHU-1 SEQUENCE OF OPERATION", bbox: [0, 0, 100, 20] },
        headers: ["STEP", "DESCRIPTION"],
        rows: [
          {
            key: "1.",
            cells: {
              STEP: { text: "1.", bbox: [10, 30, 20, 40] },
              DESCRIPTION: { text: "Enable supply fan when occupied.", bbox: [30, 30, 200, 40] },
            },
          },
          {
            key: "2.",
            cells: {
              STEP: { text: "2.", bbox: [10, 50, 20, 60] },
              DESCRIPTION: { text: "Modulate chilled water valve.", bbox: [30, 50, 200, 60] },
            },
          },
        ],
      }],
    };
    const compiled = compileSequencesTakeoff(null, graph);
    assert.equal(compiled.kind, "sequences");
    assert.equal(compiled.takeoff_id, "T-SOO-01");
    assert.equal(compiled.sheet_count, 2);
    const list = compiled.categories.sequences.list;
    assert.equal(list.length, 1);
    assert.equal(list[0].status, "extracted");
    assert.equal(list[0].section_count, 2);
    assert.equal(compiled.categories.sequences.totals.sequences, 1);
    assert.equal(compiled.categories.sequences.totals.sections, 2);
    assert.equal(compiled.page_accounting.sheet_count, 2);
    assert.equal(compiled.page_accounting.empty_pages, 1);
    assert.equal(compiled.page_accounting.pages.find((p) => p.sheet_id === "set.pdf#21").status, "empty_for_sequences");
    assert.ok(compiled.exclusions.some((e) => /impliedPoints is always empty/.test(e)));
  });
});
