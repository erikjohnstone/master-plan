// The sheet graph (lib/sheetgraph.ts, #87) — scored the way the RFC's finish
// line demands: given a multi-sheet set, the room → finish table with a
// source citation per cell, measured cell-level against a held-out key.
// The invariants:
//   - every edge carries evidence (sheet, text, bbox) — asserted per cell;
//   - a plan room with no schedule row is UNRESOLVED WITH A REASON;
//   - ambiguity (reused room numbers) refuses rather than guesses;
//   - a set with no text layer is unavailable, never half-populated;
//   - schedule sheets never mint phantom room tags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSheetGraph, resolveTag, classifySheetRole, rowKeyAnswersFor, extractTable, extractAllTables, extractAllQuarterTurnedTables, roomTags, detailCallouts, revisionOf, isReferenceCrossTable, isBareAnchorHeader, isQualifiedAnchorHeader, promoteLeadingEngineeringUnits, preferLastOverprintedText, snapCellBboxesToSourceSpans, resolveKeyCollisions, splitMergedRows, isGenericHeaderToken, type GraphSpan, type SheetSpans, type SheetGraph, type TableBound, type ScheduleTable, type TableRow } from "../src/lib/sheetgraph.ts";

// span builder: 8pt-tall text, width ~5px/char — the shape the MCP server serves
const sp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });

test("preferLastOverprintedText keeps the later visible CAD value", () => {
  const spans: GraphSpan[] = [
    { str: "57.1", x: 10, y: 10, w: 20, h: 10 },
    { str: "324.0", x: 9, y: 10, w: 25, h: 10 },
  ];
  assert.equal(preferLastOverprintedText("324.057.1", [0, 0, 40, 30], spans), "324.0");
});

test("preferLastOverprintedText preserves ordinary adjacent cell text", () => {
  const spans: GraphSpan[] = [
    { str: "FIELD", x: 0, y: 10, w: 25, h: 10 },
    { str: "ADJUSTABLE", x: 30, y: 10, w: 50, h: 10 },
  ];
  assert.equal(preferLastOverprintedText("FIELD ADJUSTABLE", [0, 0, 90, 30], spans), "FIELD ADJUSTABLE");
});

test("snapCellBboxesToSourceSpans remaps ODL boxes onto the painted row band", () => {
  const spans: GraphSpan[] = [
    { str: "RTU-1", x: 100, y: 40, w: 40, h: 12 },
    { str: "CARRIER", x: 200, y: 40, w: 50, h: 12 },
    { str: "1650", x: 300, y: 40, w: 30, h: 12 },
    { str: "CARRIER", x: 200, y: 200, w: 50, h: 12 }, // sibling row / other schedule
    { str: "1650", x: 900, y: 400, w: 30, h: 12 }, // off-row distractor
  ];
  const table: ScheduleTable = {
    kind: "equipment",
    sheet: "S#1",
    title: { sheet: "S#1", text: "PACKAGED ROOFTOP", bbox: [0, 0, 10, 200] },
    headers: ["EQUIP NO", "MANUFACTURER", "SUPPLY AIR (CFM)"],
    rows: [{
      key: "RTU-1",
      sheet: "S#1",
      cells: {
        "EQUIP NO": { text: "RTU-1", bbox: [500, 0, 520, 80] },
        MANUFACTURER: { text: "CARRIER", bbox: [500, 80, 520, 160] },
        "SUPPLY AIR (CFM)": { text: "1650", bbox: [500, 160, 520, 240] },
      },
    }],
    region: [490, 0, 530, 250],
  };
  const snapped = snapCellBboxesToSourceSpans(table, spans);
  assert.deepEqual(snapped.rows[0].cells["EQUIP NO"].bbox, [100, 40, 140, 52]);
  assert.deepEqual(snapped.rows[0].cells.MANUFACTURER.bbox, [200, 40, 250, 52]);
  assert.deepEqual(snapped.rows[0].cells["SUPPLY AIR (CFM)"].bbox, [300, 40, 330, 52]);
});

test("promoteLeadingEngineeringUnits moves a stranded pressure unit into its header", () => {
  const rows: TableRow[] = [
    { key: "A-1", sheet: "S", cells: { "WATER MAX PD": { text: "FT. H2O 16.60", bbox: [0, 0, 1, 1] as [number, number, number, number] } } },
    { key: "A-2", sheet: "S", cells: { "WATER MAX PD": { text: "10.00", bbox: [0, 1, 1, 2] as [number, number, number, number] } } },
  ];
  const headers = promoteLeadingEngineeringUnits(["TAG", "WATER MAX PD"], rows);
  assert.deepEqual(headers, ["TAG", "WATER MAX PD FT. H2O"]);
  assert.equal(rows[0].cells["WATER MAX PD FT. H2O"].text, "16.60");
  assert.equal(rows[1].cells["WATER MAX PD FT. H2O"].text, "10.00");
  assert.equal(rows[0].cells["WATER MAX PD"], undefined);
});

test("promoteLeadingEngineeringUnits leaves per-row units and prose untouched", () => {
  const rows: TableRow[] = [
    { key: "A-1", sheet: "S", cells: { PRESSURE: { text: "FT. H2O 16.60", bbox: [0, 0, 1, 1] as [number, number, number, number] } } },
    { key: "A-2", sheet: "S", cells: { PRESSURE: { text: "FT. H2O 10.00", bbox: [0, 1, 1, 2] as [number, number, number, number] } } },
  ];
  assert.deepEqual(promoteLeadingEngineeringUnits(["PRESSURE"], rows), ["PRESSURE"]);
  assert.equal(rows[0].cells.PRESSURE.text, "FT. H2O 16.60");
});

// ── the synthetic set: a plan sheet + a schedule sheet ──────────────────────
const planSheet: SheetSpans = {
  key: "set.pdf#1",
  sheet_number: "A-101",
  spans: [
    sp("FIRST FLOOR FINISH PLAN", 300, 900),
    // room bubbles: name stacked over number
    sp("OFFICE", 100, 100), sp("101", 104, 112),
    sp("WORKROOM", 300, 100), sp("102", 310, 112),
    sp("CORRIDOR", 500, 100), sp("103", 508, 112),
    sp("STORAGE", 700, 100), sp("104", 706, 112),   // ← on the plan, NOT in the schedule
    sp("3/A-601", 620, 400),                        // detail callout
  ],
};
const schedSheet: SheetSpans = {
  key: "set.pdf#2",
  sheet_number: "A-601",
  spans: [
    sp("ROOM FINISH SCHEDULE", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60), sp("REMARKS", 600, 60),
    sp("101", 100, 80), sp("OFFICE", 160, 80), sp("CPT-1", 300, 80), sp("RB-1", 400, 80), sp("P-1", 500, 80),
    sp("102", 100, 100), sp("WORKROOM", 160, 100), sp("LVT-1", 300, 100), sp("RB-1", 400, 100), sp("P-2", 500, 100),
    sp("103", 100, 120), sp("CORRIDOR", 160, 120), sp("CPT-2", 300, 120), sp("RB-1", 400, 120), sp("P-1", 500, 120),
    // a finish/material schedule lower on the same sheet
    sp("MATERIAL SCHEDULE", 100, 300),
    sp("CODE", 100, 320), sp("MATERIAL", 200, 320), sp("MANUFACTURER", 360, 320), sp("COLOR", 520, 320),
    sp("CPT-1", 100, 340), sp("CARPET TILE", 200, 340), sp("VENDOR-A", 360, 340), sp("NIGHTFALL", 520, 340),
    sp("LVT-1", 100, 360), sp("LUXURY VINYL TILE", 200, 360), sp("VENDOR-B", 360, 360), sp("OAK", 520, 360),
    sp("RB-1", 100, 380), sp("RESILIENT BASE", 200, 380), sp("VENDOR-C", 360, 380), sp("SLATE", 520, 380),
  ],
};

// the held-out key: every (room, surface) → code the set states
const KEY: Record<string, Record<string, string>> = {
  "101": { FLOOR: "CPT-1", BASE: "RB-1", WALL: "P-1" },
  "102": { FLOOR: "LVT-1", BASE: "RB-1", WALL: "P-2" },
  "103": { FLOOR: "CPT-2", BASE: "RB-1", WALL: "P-1" },
};

test("sheet roles classify from what the sheet SAYS, with evidence", () => {
  const plan = classifySheetRole(planSheet);
  assert.equal(plan.role, "plan");
  assert.ok(plan.confidence >= 0.8);
  assert.equal(plan.evidence?.text, "FIRST FLOOR FINISH PLAN");
  // titleless sheet falls back to the number convention — stated as weak
  const bare = classifySheetRole({ key: "x", sheet_number: "A-101", spans: [sp("nothing here", 0, 0)] });
  assert.deepEqual({ r: bare.role, weak: bare.confidence < 0.5 }, { r: "plan", weak: true });
  // every discipline draws plans — a mechanical sheet's ductwork plan title
  // must classify plan, not lose to an incidental LEGEND note
  const mech = classifySheetRole({
    key: "m", sheet_number: "M-121A",
    spans: [sp("SECOND FLOOR DUCTWORK PLAN AREA A", 100, 700), sp("WALL RATING LEGEND:", 620, 640)],
  });
  assert.equal(mech.role, "plan");
  assert.ok(mech.confidence >= 0.8);
  // and the number-convention fallback knows discipline prefixes
  const mBare = classifySheetRole({ key: "y", sheet_number: "M-101", spans: [sp("nothing here", 0, 0)] });
  assert.deepEqual({ r: mBare.role, weak: mBare.confidence < 0.5 }, { r: "plan", weak: true });
});

test("sheet roles: a real \"<DISCIPLINE> - LEVEL N PLAN\" title (baker-county-eoc's own real story-numbering convention) classifies plan, not unknown", () => {
  // Real, found live: this firm titles its floor plans "MECHANICAL - LEVEL 1
  // PLAN"/"PLUMBING - LEVEL 1 PLAN"/"ELECTRICAL LIGHTING - LEVEL 1 PLAN" (one
  // combined text run each) — no discipline word sits directly adjacent to
  // "PLAN" the way the base `\s+PLAN` pattern expects, so all 4 real sheets
  // classified `unknown` before this fix.
  const hvac = classifySheetRole({ key: "a", sheet_number: "M401", spans: [sp("MECHANICAL - LEVEL 1 PLAN", 100, 700)] });
  assert.equal(hvac.role, "plan");
  assert.ok(hvac.confidence >= 0.8);
  const elec = classifySheetRole({ key: "b", sheet_number: "E401", spans: [sp("ELECTRICAL LIGHTING - LEVEL 1 PLAN", 100, 700)] });
  assert.equal(elec.role, "plan");
  // a real corpus-wide regression this fix's own FIRST attempt introduced,
  // caught via a before/after role diff, not assumed safe: loosening the
  // base pattern's own required `\s+PLAN` down to `\s*PLAN` also matched a
  // one-word "FLOORPLAN" that has nothing to do with this fix — the real
  // fix is a SEPARATE alternative, and the base case's own required space
  // must stay exactly as strict as it always was.
  const noSpace = classifySheetRole({ key: "c", sheet_number: "A-999", spans: [sp("CENTER FLOORPLAN.", 100, 700)] });
  assert.notEqual(noSpace.role, "plan", "a one-word FLOORPLAN (no space) must not classify as plan via this pattern");
  // and a bare "LEVEL N PLAN" with no discipline word must still correctly
  // fail — the whole point of requiring the discipline word adjacent to the
  // "- LEVEL N" infix, not floating free anywhere in the title
  const bareLevel = classifySheetRole({ key: "d", sheet_number: "A-999", spans: [sp("KEY PLAN", 100, 700), sp("LEVEL 1 PLAN", 200, 700)] });
  assert.notEqual(bareLevel.role, "plan", "no discipline word adjacent to LEVEL N PLAN — must not classify as plan via this pattern");
});

test("sheet roles: an ENLARGED/PARTIAL qualifier between the level number and PLAN still classifies plan (baker-county-eoc's own real sheet #47)", () => {
  // Real, found live: this same set's own sheet #47 (P4.01) titles itself,
  // as one single text run, "PLUMBING - LEVEL 1 ENLARGED PLAN" — the base
  // "- LEVEL N PLAN" pattern above requires PLAN to sit directly after the
  // level digit, so this real plan sheet classified role "unknown" ("no
  // classifiable title text"), silently excluding every equipment tag drawn
  // on it from every sweep_schedule_row count (HB-1, FD-1, MS-1, EWC-1,
  // WH-1, ET-1, ...) — three separately-diagnosed-looking symptoms that were
  // really this one gap. "ENLARGED PLAN"/"PARTIAL PLAN" are standard,
  // generic AEC drafting vocabulary, not this firm's own naming.
  const enlarged = classifySheetRole({ key: "f", sheet_number: "P401", spans: [sp("PLUMBING - LEVEL 1 ENLARGED PLAN", 100, 700)] });
  assert.equal(enlarged.role, "plan");
  assert.ok(enlarged.confidence >= 0.8);
  const partial = classifySheetRole({ key: "g", sheet_number: "M401", spans: [sp("MECHANICAL - LEVEL 2 PARTIAL PLAN", 100, 700)] });
  assert.equal(partial.role, "plan");
  // an unrelated qualifier word must still correctly fail — this widening is
  // two specific, named words, not a generic gap that bridges anything in
  // between the level number and PLAN. ("REFLECTED CEILING PLAN" is not a
  // useful negative control here — it already, correctly, matches the base
  // discipline-word-adjacent-to-PLAN alternative via "CEILING...PLAN", a
  // real, legitimate plan title unrelated to this fix.)
  const other = classifySheetRole({ key: "h", sheet_number: "M401", spans: [sp("MECHANICAL - LEVEL 1 PRELIMINARY PLAN", 100, 700)] });
  assert.notEqual(other.role, "plan", "an unrelated qualifier word must not classify as plan via this widened pattern");
});

test("sheet roles: a real SHEET INDEX cover page is never misattributed as one of the sheet types it lists (ledger, later session)", () => {
  // Real, found live on baker-county-eoc's own sheet #36, discovered
  // immediately after the LEVEL-N-PLAN fix above: a real "MECHANICAL SHEET
  // INDEX" cover page PRINTS every other real sheet's own title as its own
  // table of contents ("MECHANICAL SHEET INDEX / MECHANICAL LEGEND /
  // MECHANICAL - LEVEL 1 PLAN / MECHANICAL - ROOF PLAN / ..." all as real
  // spans on the SAME page) — once "LEVEL N PLAN" started matching too, this
  // page had TWO distinct "plan"-role hits at equal confidence, and the
  // tie-break (first in document order) reported the INDEX page itself as
  // "MECHANICAL - LEVEL 1 PLAN", the wrong sheet's own title. Corpus-wide
  // sweep after the fix found this is a REAL, RECURRING pattern, not a
  // one-off — the same shape hit baker-county-eoc's own general-notes cover
  // (was "demolition"), 3 more of its own per-discipline index pages (were
  // "plan"), and weld-county-permit's own "MECHANICAL DRAWING INDEX" cover
  // (was "plan") — every one of them a real, PRE-EXISTING misclassification
  // (latent even before tonight's LEVEL-N-PLAN fix, just newly exposed by
  // it), not a regression this test's own fix introduces.
  const idx = classifySheetRole({
    key: "e", sheet_number: "M001",
    spans: [
      sp("MECHANICAL SHEET INDEX", 100, 100),
      sp("MECHANICAL LEGEND", 100, 200),
      sp("MECHANICAL - LEVEL 1 PLAN", 100, 300),
      sp("MECHANICAL - ROOF PLAN", 100, 400),
    ],
  });
  assert.notEqual(idx.role, "plan", "an index page listing other sheets' titles must not itself classify as one of them");
  assert.equal(idx.evidence?.text, "MECHANICAL SHEET INDEX", "the index page's own real title is the evidence, not a listed sheet's");
  // a genuine real plan sheet with no index text anywhere is unaffected
  const real = classifySheetRole({ key: "f", sheet_number: "M101", spans: [sp("MECHANICAL - LEVEL 1 PLAN", 100, 700)] });
  assert.equal(real.role, "plan");
});

test("sheet roles: a real ABBREVIATIONS/SYMBOLS/LINE TYPES/VALVES AND FITTINGS legend cover sheet classifies legend, not elevation off a stray callout-legend entry (ledger item 58, later session)", () => {
  // Real, found live on tarrant-county-mechanical.pdf's own real sheet #1
  // (no `#N` suffix — the set's first page, no `sets.json` entry needed):
  // its ABBREVIATIONS/SYMBOLS/LINE TYPES/VALVES AND FITTINGS legend boxes
  // produced NO signal at all under the old signal set, while a small
  // reference-symbol-legend ENTRY on the same sheet ("ELEVATION NUMBER" —
  // the callout label defining what an elevation marker's number means, NOT
  // the sheet's own real content) satisfied the generic `/ELEVATIONS?\b/`
  // signal, so the real sheet reported role "elevation" off a stray
  // legend-entry mention instead of its own real title.
  const legend = classifySheetRole({
    key: "tarrant-county-mechanical.pdf", sheet_number: "1M001",
    spans: [
      sp("MECHANICAL SYMBOLS AND ABBREVIATIONS", 2006, 97),
      sp("ABBREVIATIONS", 1785, 176),
      sp("SYMBOLS", 2844, 947),
      sp("LINE TYPES", 1830, 1400),
      sp("VALVES AND FITTINGS", 2725, 1400),
      // the stray callout-legend entries that used to win
      sp("ELEVATION NUMBER", 2784, 591),
      sp("DRAWING/DETAIL NUMBER", 2735, 303),
      sp("DRAWING/DETAIL REFERENCE", 2652, 176),
    ],
  });
  assert.equal(legend.role, "legend");
  assert.equal(legend.confidence, 0.72, "no dissent — every other real hit on this sheet is a weaker, wrong callout-legend-entry match");
  assert.equal(legend.evidence?.text, "MECHANICAL SYMBOLS AND ABBREVIATIONS", "the sheet's own real title — first among the tied-confidence legend hits in document order");

  // a real ELEVATION-titled sheet's own small "MATERIAL LEGEND"/"KEYNOTE
  // LEGEND" annotation box (common on an ordinary plan/elevation sheet, NOT
  // proof the whole sheet is a legend cover) must not steal the role — a
  // first version of this fix accepted bare "LEGEND" and got this wrong
  // live on baker-county-eoc-bidset.pdf#16, a real 4-view "EXTERIOR
  // ELEVATIONS" sheet, caught via the required corpus-wide sweep.
  const elevation = classifySheetRole({
    key: "baker#16", sheet_number: "A301",
    spans: [
      sp("EXTERIOR ELEVATIONS", 100, 100),
      sp("NORTH BUILDING ELEVATION", 100, 200),
      sp("SOUTH BUILDING ELEVATION", 100, 300),
      sp("MATERIAL LEGEND", 4022, 801),
      sp("KEYNOTE LEGEND", 4022, 900),
    ],
  });
  assert.equal(elevation.role, "elevation", "a small MATERIAL/KEYNOTE LEGEND side box must not turn a real elevation sheet into a legend cover sheet");

  // a real PLAN sheet's own small corner "ABBREVIATIONS" reference box
  // (common — many real plan sheets carry one) must not dissent against the
  // sheet's own strong, correct "plan" title — a first shipped confidence
  // (0.8) for the new legend signal broke exactly this case live in
  // `mcp/test/conformance.test.ts` (`sample-finish-plan.pdf`'s own real
  // AF101 floor plan carries a small "ROOM FINISH LEGEND & ABBREVIATIONS"
  // corner box), caught by the FULL test suite, not the corpus sweep.
  const planWithCornerBox = classifySheetRole({
    key: "af101", sheet_number: "AF101",
    spans: [sp("FIRST FLOOR FINISH PLAN", 300, 900), sp("ABBREVIATIONS", 5135, 299)],
  });
  assert.equal(planWithCornerBox.role, "plan");
  assert.equal(planWithCornerBox.confidence, 0.85, "a lone corner ABBREVIATIONS box must not halve a real plan title's own confidence");
});

test("a compound schedule-row key answers for each of its marks", () => {
  assert.equal(rowKeyAnswersFor("R1/E1", "R1"), true);
  assert.equal(rowKeyAnswersFor("R1/E1", "E1"), true);
  assert.equal(rowKeyAnswersFor("R1/E1", "R1/E1"), true);
  assert.equal(rowKeyAnswersFor("R1 / E1", "E1"), true);
  assert.equal(rowKeyAnswersFor("R1/E1", "E2"), false);
  assert.equal(rowKeyAnswersFor("S1", "S1"), true);
  assert.equal(rowKeyAnswersFor("S1", "S"), false);
  // Comma compounds (Baker AIR HANDLER HEAT PUMP SYMBOL).
  assert.equal(rowKeyAnswersFor("AHU-1, HP-1", "AHU-1"), true);
  assert.equal(rowKeyAnswersFor("AHU-1, HP-1", "HP-1"), true);
  // Glued extraction when separator is lost into row.key.
  assert.equal(rowKeyAnswersFor("AHU-1HP-1", "AHU-1"), true);
  assert.equal(rowKeyAnswersFor("AHU-1HP-1", "HP-1"), true);
  assert.equal(rowKeyAnswersFor("ERU-1HP-4", "ERU-1"), true);
  assert.equal(rowKeyAnswersFor("DFC-1DCU-1", "DCU-1"), true);
  assert.equal(rowKeyAnswersFor("F-1CU-1", "F-1"), true);
  // Digit+letter suffixes must NOT split (CODE_RE AHU-1A).
  assert.equal(rowKeyAnswersFor("AHU-1A", "AHU-1"), false);
  assert.equal(rowKeyAnswersFor("AHU-1A", "AHU-1A"), true);
  // Revision-prefix / glued N+equip row.keys answer for the mark as drawn
  // (Hurlburt schedule NATUK1 ↔ plan "ATU K1").
  assert.equal(rowKeyAnswersFor("NATUK1", "ATUK1"), true);
  assert.equal(rowKeyAnswersFor("NATUK1", "ATU K1"), true);
  assert.equal(rowKeyAnswersFor("NACC-2", "ACC-2"), true);
  assert.equal(rowKeyAnswersFor("(N)ATU K1", "ATU K1"), true);
});

test("table extraction: header anchors, evidence per cell, titles found above", () => {
  const rf = extractTable(schedSheet, "room-finish")!;
  assert.equal(rf.rows.length, 3);
  assert.equal(rf.title?.text, "ROOM FINISH SCHEDULE");
  const r101 = rf.rows.find((r) => r.key === "101")!;
  assert.equal(r101.cells.FLOOR.text, "CPT-1");
  assert.ok(r101.cells.FLOOR.bbox[0] >= 300 && r101.cells.FLOOR.bbox[1] >= 80, "the cell knows where it came from");
  const fin = extractTable(schedSheet, "finish")!;
  assert.equal(fin.rows.length, 3);
  assert.equal(fin.rows.find((r) => r.key === "CPT-1")!.cells.MANUFACTURER.text, "VENDOR-A");
  // a sheet with no such structure yields null, never invented rows
  assert.equal(extractTable(planSheet, "room-finish"), null);
});

test("room-finish: a genuine, real single-row table (small region, real ruled line nearby) is kept", () => {
  // Narrow-scoping proof for the anomalous-region-height refusal below: a
  // real single-row schedule (real, corpus-found precedent: itd-d1-lab-
  // mechanical.pdf#14's own DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE,
  // exactly one row) must never be refused just for being sparse — only a
  // sparse table whose OWN region is also anomalously tall is ever in
  // scope, and this table's header-to-row gap is ordinary.
  const spans: GraphSpan[] = [
    sp("ROOM FINISH SCHEDULE", 100, 20),
    sp("NO", 100, 40), sp("NAME", 160, 40), sp("FLOOR", 300, 40), sp("BASE", 400, 40), sp("WALL", 500, 40),
    sp("101", 100, 60), sp("OFFICE", 160, 60), sp("CPT-1", 300, 60), sp("RB-1", 400, 60), sp("P-1", 500, 60),
  ];
  const sheet: SheetSpans = { key: "single.pdf#1", sheet_number: "A-601", spans };
  const rf = extractTable(sheet, "room-finish");
  assert.ok(rf, "a real single-row table, close-set, is still extracted");
  assert.equal(rf!.rows.length, 1);
  assert.equal(rf!.rows[0].key, "101");
});

test("room-finish: refuses a fabricated table from scattered legend vocabulary with no nearby ruled line (GOAL.md rule 24(a))", () => {
  // Real, corpus-found: 011_IL_VA_Hines_Finance_Center_Renovation.pdf#8's
  // own "ROOM FINISH SCHEDULE" is entirely fabricated — the real schedule
  // lives on sheet AE-102, which this PDF export never includes. The sheet
  // itself only carries the cross-reference sentence "REFERENCE SHEET
  // AE-102 FOR ROOM FINISH SCHEDULE" (title-hunt latches onto its own
  // "ROOM FINISH SCHEDULE" tail) plus a floor-plan's own compass/finish-
  // legend text (BASE/NORTH/EAST/SOUTH/WEST — real ROOM_HEADERS words,
  // scattered, never a real header row) and a stray room-number callout
  // ("7") that happens to sit near "NORTH" far below. Real extracted shape:
  // exactly 1 row, region ~3900px tall for this document's own ~8-14px
  // text height — reproduced here at the same order-of-magnitude ratio.
  const spans: GraphSpan[] = [
    sp("REFERENCE SHEET AE-102 FOR ROOM FINISH SCHEDULE", 100, 20),
    sp("BASE", 100, 60), sp("NORTH", 300, 60), sp("EAST", 500, 60), sp("SOUTH", 700, 60), sp("WEST", 900, 60),
    // the stray room-number plan callout, far below — real gap, not adjacent
    sp("7", 300, 500),
  ];
  const sheet: SheetSpans = {
    key: "legend.pdf#8", sheet_number: "A-108", spans,
    segs: [4000, 4000, 4100, 4000], // present, but nowhere near this table
  };
  assert.equal(extractTable(sheet, "room-finish"), null, "no real ruled border nearby a wildly disproportionate region — refused, not fabricated");
});

test("room-finish: the SAME scattered-legend shape is kept when a real ruled line sits near it", () => {
  // Proves the gate is a real structural corroboration check, not a blanket
  // sparse-table refusal — same fixture as above, but this time with a
  // real ruled line spanning the header row, exactly like extractReferenceTableAt's
  // own already-shipped "positive" counterpart test. The row sits under the
  // table's own KEY anchor (BASE, x=100) rather than near NORTH — isolating
  // rule 24(a)'s own ruled-line/region-height gate from rule 23's separate
  // sparse-table key-column-alignment gate (GOAL.md rule 23; a row that
  // doesn't even align with its own key column is refused by THAT check
  // regardless of ruled-line evidence, same as the real fabricated 011
  // document's own "7" row — this test is about rule 24(a) alone).
  const spans: GraphSpan[] = [
    sp("REFERENCE SHEET AE-102 FOR ROOM FINISH SCHEDULE", 100, 20),
    sp("BASE", 100, 60), sp("NORTH", 300, 60), sp("EAST", 500, 60), sp("SOUTH", 700, 60), sp("WEST", 900, 60),
    sp("7", 100, 500),
  ];
  const sheet: SheetSpans = {
    key: "legend.pdf#9", sheet_number: "A-109", spans,
    segs: [0, 55, 1000, 55], // a real ruled line right under the header row
  };
  const rf = extractTable(sheet, "room-finish");
  assert.ok(rf, "a real nearby ruled line corroborates the table — kept, same as extractReferenceTableAt's own gate");
});

test("equipment: a sparse (1-row) table does not absorb an adjacent table's own key-shaped mark (GOAL.md rule 23)", () => {
  // Real, corpus-found: 009_FL_USDA_APHIS_Plant_Inspection_Station_Building
  // .pdf#18's own real "AIR COOLED CHILLER SCHEDULE" (1 real row, CH-1)
  // absorbed the adjacent FAN SCHEDULE's own real EF-1/EF-2/EF-3/EF-5 marks
  // as 4 fake extra rows — 5 rows reported where there is genuinely 1 real
  // chiller. Root cause: the key-column-alignment guard only runs once a
  // real, DATA-recovered column map (`cols`) exists, which itself needs
  // several real rows to fit one — a table with only 1 real row never gets
  // one, so the guard was silently skipped for exactly the sparsest tables.
  // The table's own [x0,x1] band doesn't catch it either — REMARKS (a
  // WIDE_LAST column) deliberately earns a generous right margin (up to 3x
  // the table's own median column gap) so a real wrapped remark is never
  // truncated, and that same margin reaches straight into the neighbouring
  // table's own key column.
  const spans: GraphSpan[] = [
    sp("AIR COOLED CHILLER SCHEDULE", 0, 0),
    sp("MARK", 0, 40), sp("MANUFACTURER", 150, 40), sp("MODEL", 400, 40), sp("TONS", 650, 40), sp("REMARKS", 900, 40),
    sp("CH-1", 0, 60), sp("TRANE", 150, 60), sp("CGAM-100", 400, 60), sp("100", 650, 60), sp("1,2,3", 900, 60),
    // the adjacent, unrelated FAN SCHEDULE's own real MARK column, far to
    // the right — inside REMARKS' own generous [x0,x1] reach but nowhere
    // near this table's own real key column (x=0)
    sp("EF-1", 1600, 60),
  ];
  const sheet: SheetSpans = { key: "chiller.pdf#18", sheet_number: "M601", spans };
  const tab = extractTable(sheet, "equipment");
  assert.ok(tab, "the real chiller table still extracts");
  assert.deepEqual(tab!.rows.map((r) => r.key), ["CH-1"], "EF-1 never mints a fake extra row");
});

test("room tags pair the stacked name; schedule sheets never mint phantom rooms", () => {
  const tags = roomTags(planSheet);
  assert.deepEqual(tags.map((t) => [t.tag, t.name]).sort(), [["101", "OFFICE"], ["102", "WORKROOM"], ["103", "CORRIDOR"], ["104", "STORAGE"]]);
  const g = buildSheetGraph([planSheet, schedSheet]);
  // 104 is drawn on the plan and absent from the schedule. Where a
  // room-finish schedule EXISTS it is the authority on which numbers are
  // rooms (a keynote legend pairs a number with a description exactly the way
  // a bubble pairs one with a name), so 104 is not counted as an answered
  // room — it is surfaced under its own reason instead, never dropped.
  assert.deepEqual(g.rooms.map((r) => r.tag).sort(), ["101", "102", "103"], "the schedule sheet's NO column contributes rows, not room tags");
  assert.ok(g.rooms.every((r) => r.corroboration), "every room says WHY it is believed to be one");
  assert.deepEqual(g.unmatched_tags.map((u) => u.tag), ["104"]);
  assert.equal(g.unmatched_tags[0].name, "STORAGE");
  assert.match(g.unmatched_tags[0].reason, /no room-finish row answers for it/);
  assert.ok(g.notes.some((n) => /NOT counted as rooms/.test(n)), "the demotion is named in notes");
});

test("detail callouts parse and point at their sheet", () => {
  assert.deepEqual(detailCallouts(planSheet).map((c) => [c.detail, c.target_sheet]), [["3", "A-601"]]);
});

test("SCORED: room → finish → citation, cell-level precision/recall against the held-out key", () => {
  const g = buildSheetGraph([planSheet, schedSheet]);
  assert.equal(g.available, true);
  let tp = 0, fp = 0;
  const expected = Object.values(KEY).reduce((n, v) => n + Object.keys(v).length, 0);
  for (const tag of Object.keys(KEY)) {
    const res = resolveTag(g, tag);
    assert.equal(res.status, "resolved", tag);
    if (res.status !== "resolved") continue;
    for (const f of res.finishes) {
      assert.ok(f.source.sheet && f.source.bbox, `every cell carries a citation: ${tag}/${f.surface}`);
      if (KEY[tag][f.surface] === f.code) tp++; else fp++;
    }
    // resolution chains to the finish definition where one exists
    const floor = res.finishes.find((f) => f.surface === "FLOOR")!;
    if (tag === "101") assert.equal(floor.definition?.cells.MANUFACTURER, "VENDOR-A");
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / expected;
  console.log(`  sheetgraph cell-level: precision ${precision.toFixed(3)} recall ${recall.toFixed(3)} (${tp}/${expected})`);
  assert.ok(precision >= 0.99, `precision ${precision}`);
  assert.ok(recall >= 0.99, `recall ${recall}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 2 (#87): continuation sheets, rotated headers, multi-building keys.
// Same doctrine, three new ways a real set breaks the naive reading:
//   - a schedule that CONTINUES across sheets is ONE table — rows resolve
//     regardless of which sheet carries them, and each row cites its own sheet;
//   - column headers written at 90° still anchor the table;
//   - a room number reused across buildings is ambiguous UNTIL the tag is
//     qualified — the refusal lists the candidates, never the first match.
// ═════════════════════════════════════════════════════════════════════════════

// a vertical (quarter-turn) span: narrow box, text runs downward in y
const vsp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: 8, h: str.length * 5, rot: 90 });

// ── continuation set: plan + schedule + "— CONT'D" schedule (header repeated) ─
const contPlan: SheetSpans = {
  key: "cont.pdf#1",
  sheet_number: "A-102",
  spans: [
    sp("SECOND FLOOR FINISH PLAN", 300, 900),
    sp("OFFICE", 100, 100), sp("201", 104, 112),
    sp("CONFERENCE", 300, 100), sp("202", 310, 112),
    sp("BREAK RM", 500, 100), sp("203", 508, 112),
    sp("COPY RM", 700, 100), sp("204", 706, 112),
    sp("STORAGE", 100, 300), sp("205", 104, 312),
  ],
};
const contSchedBase: SheetSpans = {
  key: "cont.pdf#2",
  sheet_number: "A-601",
  spans: [
    sp("ROOM FINISH SCHEDULE", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
    sp("201", 100, 80), sp("OFFICE", 160, 80), sp("CPT-5", 300, 80), sp("RB-5", 400, 80), sp("P-5", 500, 80),
    sp("202", 100, 100), sp("CONFERENCE", 160, 100), sp("CPT-5", 300, 100), sp("RB-5", 400, 100), sp("P-5", 500, 100),
    sp("203", 100, 120), sp("BREAK RM", 160, 120), sp("LVT-5", 300, 120), sp("RB-5", 400, 120), sp("P-6", 500, 120),
  ],
};
const contSchedContd: SheetSpans = {
  key: "cont.pdf#3",
  sheet_number: "A-602",
  spans: [
    sp("ROOM FINISH SCHEDULE - CONT'D", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
    sp("204", 100, 80), sp("COPY RM", 160, 80), sp("LVT-5", 300, 80), sp("RB-5", 400, 80), sp("P-5", 500, 80),
    sp("205", 100, 100), sp("STORAGE", 160, 100), sp("VCT-5", 300, 100), sp("RB-5", 400, 100), sp("P-6", 500, 100),
  ],
};
// header NOT repeated: the title alone, rows aligned to the base's columns
const contSchedHeaderless: SheetSpans = {
  key: "cont.pdf#3",
  sheet_number: "A-602",
  spans: [
    sp("ROOM FINISH SCHEDULE (CONT'D)", 100, 40),
    sp("204", 100, 80), sp("COPY RM", 160, 80), sp("LVT-5", 300, 80), sp("RB-5", 400, 80), sp("P-5", 500, 80),
    sp("205", 100, 100), sp("STORAGE", 160, 100), sp("VCT-5", 300, 100), sp("RB-5", 400, 100), sp("P-6", 500, 100),
  ],
};
// header NOT repeated AND columns shifted — adoption must refuse, not guess
const contSchedMisaligned: SheetSpans = {
  key: "cont.pdf#3",
  sheet_number: "A-602",
  spans: [
    sp("ROOM FINISH SCHEDULE (CONT'D)", 100, 40),
    sp("204", 560, 80), sp("COPY RM", 620, 80), sp("LVT-5", 760, 80),
  ],
};

const CONT_KEY: Record<string, Record<string, string>> = {
  "201": { FLOOR: "CPT-5", BASE: "RB-5", WALL: "P-5" },
  "202": { FLOOR: "CPT-5", BASE: "RB-5", WALL: "P-5" },
  "203": { FLOOR: "LVT-5", BASE: "RB-5", WALL: "P-6" },
  "204": { FLOOR: "LVT-5", BASE: "RB-5", WALL: "P-5" },
  "205": { FLOOR: "VCT-5", BASE: "RB-5", WALL: "P-6" },
};

test("continuation sheets: '— CONT'D' fragments merge into ONE logical table, rows citing their own sheet", () => {
  const g = buildSheetGraph([contPlan, contSchedBase, contSchedContd]);
  const roomFinish = g.tables.filter((t) => t.kind === "room-finish");
  assert.equal(roomFinish.length, 1, "one LOGICAL table, not two schedules");
  const tab = roomFinish[0];
  assert.equal(tab.rows.length, 5);
  assert.deepEqual(tab.parts?.map((p) => [p.sheet, p.rows]), [["cont.pdf#2", 3], ["cont.pdf#3", 2]]);
  // per-sheet view: the continuation sheet's fragment names its base
  const contSheet = g.sheets.find((s) => s.key === "cont.pdf#3")!;
  assert.equal(contSheet.schedules[0].continues, "cont.pdf#2");
  assert.equal(g.sheets.find((s) => s.key === "cont.pdf#2")!.schedules[0].continues, undefined);
  // a row carried by the continuation resolves — and cites the CONTINUATION sheet
  const res = resolveTag(g, "205");
  assert.equal(res.status, "resolved");
  if (res.status !== "resolved") return;
  assert.equal(res.finishes.find((f) => f.surface === "FLOOR")!.code, "VCT-5");
  assert.ok(res.finishes.every((f) => f.source.sheet === "cont.pdf#3"), "evidence points at the ink, not the base sheet");
  assert.ok(res.sources.some((s) => s.sheet === "cont.pdf#3"));
  // a base-sheet row still resolves against the base
  const base = resolveTag(g, "202");
  assert.equal(base.status, "resolved");
  if (base.status === "resolved") assert.ok(base.finishes.every((f) => f.source.sheet === "cont.pdf#2"));
});

test("continuation sheets: a title-only continuation adopts the base's columns — gated on alignment", () => {
  // aligned columns: rows adopt, the table reads as one
  const g = buildSheetGraph([contPlan, contSchedBase, contSchedHeaderless]);
  const tab = g.tables.find((t) => t.kind === "room-finish")!;
  assert.equal(tab.rows.length, 5, "title-only continuation rows are indexed");
  const res = resolveTag(g, "204");
  assert.equal(res.status, "resolved");
  if (res.status === "resolved") {
    assert.equal(res.finishes.find((f) => f.surface === "FLOOR")!.code, "LVT-5");
    assert.equal(res.finishes[0].source.sheet, "cont.pdf#3");
  }
  // misaligned columns: refusal, and the gap is NAMED — never silently dropped
  const g2 = buildSheetGraph([contPlan, contSchedBase, contSchedMisaligned]);
  assert.equal(g2.tables.find((t) => t.kind === "room-finish")!.rows.length, 3);
  assert.ok(g2.notes.some((n) => /cont\.pdf#3/.test(n) && /NOT indexed/.test(n)), `the gap is named: ${g2.notes.join(" | ")}`);
  const miss = resolveTag(g2, "204");
  assert.equal(miss.status, "unresolved");
  assert.match((miss as { reason: string }).reason, /no schedule row for 204/);
});

// ── rotated headers: column labels at a quarter-turn ────────────────────────
const rotPlan: SheetSpans = {
  key: "rot.pdf#1",
  sheet_number: "A-103",
  spans: [
    sp("THIRD FLOOR FINISH PLAN", 300, 900),
    sp("CONF RM", 100, 100), sp("301", 104, 112),
    sp("TRAINING", 300, 100), sp("302", 308, 112),
  ],
};
const rotSched: SheetSpans = {
  key: "rot.pdf#2",
  sheet_number: "A-603",
  spans: [
    sp("ROOM FINISH SCHEDULE", 100, 20),
    // the header band: vertical spans — "FLOOR" deliberately carries NO rot
    // (h ≫ w decides), the rest are explicit quarter-turns
    vsp("NO", 100, 40), vsp("NAME", 160, 40),
    { str: "FLOOR", x: 300, y: 40, w: 8, h: 25 },
    vsp("BASE", 400, 40), vsp("WALL", 500, 40),
    sp("301", 100, 80), sp("CONF RM", 160, 80), sp("CPT-9", 300, 80), sp("RB-9", 400, 80), sp("P-9", 500, 80),
    sp("302", 100, 100), sp("TRAINING", 160, 100), sp("LVT-9", 300, 100), sp("RB-9", 400, 100), sp("P-9", 500, 100),
    // a material schedule below, horizontal headers — same sheet, both found
    sp("MATERIAL SCHEDULE", 100, 300),
    sp("CODE", 100, 320), sp("MATERIAL", 200, 320), sp("MANUFACTURER", 360, 320),
    sp("CPT-9", 100, 340), sp("CARPET TILE", 200, 340), sp("EXAMPLECO", 360, 340),
  ],
};

const ROT_KEY: Record<string, Record<string, string>> = {
  "301": { FLOOR: "CPT-9", BASE: "RB-9", WALL: "P-9" },
  "302": { FLOOR: "LVT-9", BASE: "RB-9", WALL: "P-9" },
};

test("rotated headers: a quarter-turn header band still anchors the table", () => {
  const tab = extractTable(rotSched, "room-finish")!;
  assert.ok(tab, "the rotated header band is found");
  assert.equal(tab.rotated_headers, true);
  assert.equal(tab.title?.text, "ROOM FINISH SCHEDULE");
  assert.deepEqual(tab.headers, ["NO", "NAME", "FLOOR", "BASE", "WALL"]);
  assert.equal(tab.rows.length, 2);
  assert.equal(tab.rows[0].cells.FLOOR.text, "CPT-9");
  // full graph: resolution chains through the rotated table to the definition
  const g = buildSheetGraph([rotPlan, rotSched]);
  const sched = g.sheets.find((s) => s.key === "rot.pdf#2")!;
  assert.equal(sched.schedules.find((x) => x.kind === "room-finish")!.rotated_headers, true);
  assert.equal(sched.schedules.find((x) => x.kind === "finish")!.rotated_headers, undefined, "the horizontal table is not mislabeled rotated");
  const res = resolveTag(g, "301");
  assert.equal(res.status, "resolved");
  if (res.status === "resolved") {
    assert.equal(res.finishes.find((f) => f.surface === "FLOOR")!.definition?.cells.MANUFACTURER, "EXAMPLECO");
  }
});

test("an entire quarter-turned equipment schedule is normalized and mapped back", () => {
  const vertical = (str: string, rowX: number, columnY: number): GraphSpan =>
    ({ str, x: rowX, y: columnY, w: 8, h: Math.max(12, str.length * 5), rot: 90 });
  const sheet: SheetSpans = {
    key: "quarter-turned.pdf#1",
    spans: [
      vertical("AIR TERMINAL BOX SCHEDULE", 340, 20),
      vertical("TAG", 300, 20), vertical("MODEL", 300, 160),
      vertical("VOLTAGE", 300, 260), vertical("GPM", 300, 340),
      vertical("VAV-1", 280, 20), vertical("VCEF", 280, 160),
      vertical("120", 280, 260), vertical("10", 280, 340),
      vertical("VAV-2", 260, 20), vertical("VCEF", 260, 160),
      vertical("120", 260, 260), vertical("20", 260, 340),
    ],
  };
  const table = extractAllQuarterTurnedTables(sheet)[0];
  assert.ok(table);
  assert.equal(table.title?.text, "AIR TERMINAL BOX SCHEDULE");
  assert.deepEqual(table.rows.map((row) => row.key), ["VAV-1", "VAV-2"]);
  assert.equal(table.rows[1].cells.GPM.text, "20");
  assert.ok(table.rows[0].cells.MODEL.bbox[0] < table.rows[0].cells.MODEL.bbox[2],
    "restored evidence is a valid source-space box");
});

// ── multi-building keys: room 134 in Building A ≠ 134 in Building B ─────────
const bldgPlanA: SheetSpans = {
  key: "mb.pdf#1",
  sheet_number: "A-101",
  spans: [
    sp("BUILDING A - FIRST FLOOR FINISH PLAN", 300, 900),
    sp("OFFICE", 100, 100), sp("134", 104, 112),
    sp("LAB", 300, 100), sp("135", 302, 112),
  ],
};
const bldgPlanB: SheetSpans = {
  key: "mb.pdf#2",
  sheet_number: "A-201",
  spans: [
    sp("BUILDING B - FIRST FLOOR FINISH PLAN", 300, 900),
    sp("STORAGE", 100, 100), sp("134", 104, 112),
    sp("OFFICE", 300, 100), sp("201", 304, 112),
  ],
};
const bldgSchedA: SheetSpans = {
  key: "mb.pdf#3",
  sheet_number: "A-601",
  spans: [
    sp("ROOM FINISH SCHEDULE - BUILDING A", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
    sp("134", 100, 80), sp("OFFICE", 160, 80), sp("CPT-1", 300, 80), sp("RB-1", 400, 80), sp("P-1", 500, 80),
    sp("135", 100, 100), sp("LAB", 160, 100), sp("LVT-1", 300, 100), sp("RB-1", 400, 100), sp("P-1", 500, 100),
  ],
};
const bldgSchedB: SheetSpans = {
  key: "mb.pdf#4",
  sheet_number: "A-602",
  spans: [
    sp("ROOM FINISH SCHEDULE - BUILDING B", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
    sp("134", 100, 80), sp("STORAGE", 160, 80), sp("VCT-2", 300, 80), sp("RB-2", 400, 80), sp("P-2", 500, 80),
    sp("201", 100, 100), sp("OFFICE", 160, 100), sp("CPT-2", 300, 100), sp("RB-2", 400, 100), sp("P-2", 500, 100),
  ],
};

const MB_KEY: Record<string, Record<string, string>> = {
  "A-134": { FLOOR: "CPT-1", BASE: "RB-1", WALL: "P-1" },
  "A-135": { FLOOR: "LVT-1", BASE: "RB-1", WALL: "P-1" },
  "B-134": { FLOOR: "VCT-2", BASE: "RB-2", WALL: "P-2" },
  "B-201": { FLOOR: "CPT-2", BASE: "RB-2", WALL: "P-2" },
};

test("multi-building: an unqualified reused number REFUSES and lists the candidates — never first-match", () => {
  const g = buildSheetGraph([bldgPlanA, bldgPlanB, bldgSchedA, bldgSchedB]);
  assert.deepEqual(g.buildings, ["A", "B"]);
  assert.equal(g.sheets.find((s) => s.key === "mb.pdf#1")!.building, "A");
  assert.equal(g.rooms.find((r) => r.tag === "134" && r.sheet === "mb.pdf#2")!.building, "B");

  const dup = resolveTag(g, "134");
  assert.equal(dup.status, "unresolved");
  if (dup.status !== "unresolved") return;
  assert.match(dup.reason, /ambiguous: room 134 appears in 2 buildings/);
  assert.match(dup.reason, /qualify the tag/);
  assert.equal(dup.room, null, "citing one building's plan tag would be quietly wrong");
  assert.deepEqual(dup.candidates?.map((c) => [c.building, c.sheet]).sort(), [["A", "mb.pdf#3"], ["B", "mb.pdf#4"]]);
});

test("multi-building: qualified tags resolve honestly; unknown buildings refuse by name", () => {
  const g = buildSheetGraph([bldgPlanA, bldgPlanB, bldgSchedA, bldgSchedB]);
  const a = resolveTag(g, "A-134");
  assert.equal(a.status, "resolved");
  if (a.status === "resolved") {
    assert.equal(a.building, "A");
    assert.equal(a.finishes.find((f) => f.surface === "FLOOR")!.code, "CPT-1");
    assert.equal(a.room?.name, "OFFICE", "the room cited is BUILDING A's 134, not B's");
    assert.equal(a.room?.sheet, "mb.pdf#1");
  }
  const b = resolveTag(g, "B-134");
  assert.equal(b.status, "resolved");
  if (b.status === "resolved") assert.equal(b.finishes.find((f) => f.surface === "FLOOR")!.code, "VCT-2");
  // unqualified but unique across the set: resolves, and names its building
  const unique = resolveTag(g, "201");
  assert.equal(unique.status, "resolved");
  if (unique.status === "resolved") assert.equal(unique.building, "B");
  // a building the set never names refuses by name — with the candidates
  const c = resolveTag(g, "C-134");
  assert.equal(c.status, "unresolved");
  if (c.status === "unresolved") {
    assert.match(c.reason, /names no building "C"/);
    assert.equal(c.candidates?.length, 2);
  }
});

test("multi-building: qualified ROW keys ('A-134') carry their building; sheet numbers never mint rooms", () => {
  const qPlanA: SheetSpans = {
    key: "q.pdf#1",
    sheet_number: "A-101",
    spans: [
      sp("BUILDING A - FIRST FLOOR FINISH PLAN", 300, 900),
      sp("OFFICE", 100, 100), sp("A-134", 100, 112),
      sp("A-601", 600, 50), // a sheet-number reference — NOT a room
    ],
  };
  const qPlanB: SheetSpans = {
    key: "q.pdf#2",
    sheet_number: "A-201",
    spans: [
      sp("BUILDING B - FIRST FLOOR FINISH PLAN", 300, 900),
      sp("STORAGE", 100, 100), sp("B-134", 100, 112),
    ],
  };
  const qSched: SheetSpans = {
    key: "q.pdf#3",
    sheet_number: "A-601",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 40),
      sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
      sp("A-134", 100, 80), sp("OFFICE", 160, 80), sp("CPT-1", 300, 80), sp("RB-1", 400, 80), sp("P-1", 500, 80),
      sp("B-134", 100, 100), sp("STORAGE", 160, 100), sp("VCT-2", 300, 100), sp("RB-2", 400, 100), sp("P-2", 500, 100),
    ],
  };
  const g = buildSheetGraph([qPlanA, qPlanB, qSched]);
  assert.deepEqual(g.rooms.map((r) => [r.tag, r.building]).sort(), [["A-134", "A"], ["B-134", "B"]]);
  assert.ok(!g.rooms.some((r) => r.tag === "A-601"), "the title-block sheet number never mints a room");
  const a = resolveTag(g, "A-134");
  assert.equal(a.status, "resolved");
  if (a.status === "resolved") {
    assert.equal(a.finishes.find((f) => f.surface === "FLOOR")!.code, "CPT-1");
    assert.equal(a.room?.name, "OFFICE");
  }
  const dup = resolveTag(g, "134");
  assert.equal(dup.status, "unresolved");
  if (dup.status === "unresolved") assert.match(dup.reason, /ambiguous: room 134 appears in 2 buildings/);
});

// ── phase-2 SCORED: the three lanes together, cell-level P/R pinned ─────────
test("SCORED phase 2: continuation + rotated + multi-building, precision/recall against the held-out keys", () => {
  const graphs: Array<[SheetGraph, Record<string, Record<string, string>>]> = [
    [buildSheetGraph([contPlan, contSchedBase, contSchedContd]), CONT_KEY],
    [buildSheetGraph([rotPlan, rotSched]), ROT_KEY],
    [buildSheetGraph([bldgPlanA, bldgPlanB, bldgSchedA, bldgSchedB]), MB_KEY],
  ];
  let tp = 0, fp = 0, expected = 0;
  for (const [g, key] of graphs) {
    expected += Object.values(key).reduce((n, v) => n + Object.keys(v).length, 0);
    for (const tag of Object.keys(key)) {
      const res = resolveTag(g, tag);
      assert.equal(res.status, "resolved", tag);
      if (res.status !== "resolved") continue;
      for (const f of res.finishes) {
        assert.ok(f.source.sheet && f.source.bbox, `every cell carries a citation: ${tag}/${f.surface}`);
        if (key[tag][f.surface] === f.code) tp++; else fp++;
      }
    }
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / expected;
  console.log(`  sheetgraph phase-2 cell-level: precision ${precision.toFixed(3)} recall ${recall.toFixed(3)} (${tp}/${expected})`);
  assert.ok(precision >= 0.99, `precision ${precision}`);
  assert.ok(recall >= 0.99, `recall ${recall}`);
});

test("the failure modes REFUSE with reasons — never silent omission", () => {
  const g = buildSheetGraph([planSheet, schedSheet]);
  // on the plan, not in the schedule — THE lost-bid case
  const missing = resolveTag(g, "104");
  assert.equal(missing.status, "unresolved");
  assert.match((missing as { reason: string }).reason, /no schedule row for 104/);
  assert.equal(missing.room?.name, "STORAGE", "the plan bubble is STILL cited even though 104 is uncorroborated — that ink is the evidence the schedule may have missed a room");
  assert.equal(missing.room?.sheet, "set.pdf#1");
  // reused room numbers across buildings — ambiguity refuses
  const dupSheet: SheetSpans = { ...schedSheet, key: "set.pdf#3", spans: schedSheet.spans.map((s) => ({ ...s })) };
  const g2 = buildSheetGraph([planSheet, schedSheet, dupSheet]);
  const dup = resolveTag(g2, "101");
  assert.equal(dup.status, "unresolved");
  assert.match((dup as { reason: string }).reason, /ambiguous: 2 schedule rows/);
  // no room-finish table at all
  const g3 = buildSheetGraph([planSheet]);
  assert.match((resolveTag(g3, "101") as { reason: string }).reason, /no room-finish schedule found/);
  // a scanned set (no text layer) is unavailable, cleanly
  const scanned = buildSheetGraph([{ key: "scan.pdf#1", spans: [] }]);
  assert.equal(scanned.available, false);
  assert.deepEqual(scanned.rooms, []);
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 3 (#87): revision markers, and banding precision on very wide REMARKS
// gaps. Same doctrine, two more ways a real set produces a confident wrong
// number:
//   - a delta triangle beside a schedule row is drafting's flag that the ink
//     CHANGED — reading the row without surfacing the delta prices a revision
//     silently, and a delta left of the key column used to strip to its digit
//     and MINT a room;
//   - a wide REMARKS column wraps and baseline-shifts its text — the fragment
//     rows used to drop silently, and a left-aligned remark could band into
//     the WALL column on a left-x tie.
// ═════════════════════════════════════════════════════════════════════════════

// a small-font span (a remark cell's 6pt text): the baseline-offset shape
const rsp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 6 });

test("revisionOf: whole-span markers only — a bare number or running text never matches", () => {
  assert.equal(revisionOf("Δ2"), "2");
  assert.equal(revisionOf("∆ 3"), "3");
  assert.equal(revisionOf("2▲"), "2");
  assert.equal(revisionOf("REV 2"), "2");
  assert.equal(revisionOf("REVISION 12"), "12");
  assert.equal(revisionOf("rev. #4"), "4");
  assert.equal(revisionOf("2"), null, "a bare number is never a marker");
  assert.equal(revisionOf("102"), null);
  assert.equal(revisionOf("SEE REV 2 NOTES"), null, "running text never matches");
  assert.equal(revisionOf("REVISED PER ADDENDUM"), null);
});

// ── revision fixture: a delta on a schedule row, a delta on a plan bubble ───
const revPlan: SheetSpans = {
  key: "rev.pdf#1",
  sheet_number: "A-104",
  spans: [
    sp("FOURTH FLOOR FINISH PLAN", 300, 900),
    sp("OFFICE", 100, 100), sp("401", 104, 112),
    sp("LAB", 300, 100), sp("402", 310, 112), sp("Δ2", 330, 108), // delta ON the bubble
    sp("STOR", 500, 100), sp("403", 508, 112),
  ],
};
const revSched: SheetSpans = {
  key: "rev.pdf#2",
  sheet_number: "A-604",
  spans: [
    sp("ROOM FINISH SCHEDULE", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
    sp("401", 100, 80), sp("OFFICE", 160, 80), sp("CPT-4", 300, 80), sp("RB-4", 400, 80), sp("P-4", 500, 80),
    // the delta sits LEFT of the key column, in the margin — the classic spot
    sp("Δ2", 70, 100),
    sp("402", 100, 100), sp("LAB", 160, 100), sp("EPX-1", 300, 100), sp("RB-4", 400, 100), sp("P-4", 500, 100),
    sp("REV 3", 62, 120),
    sp("403", 100, 120), sp("STOR", 160, 120), sp("VCT-4", 300, 120), sp("RB-4", 400, 120), sp("P-4", 500, 120),
  ],
};
const REV_KEY: Record<string, Record<string, string>> = {
  "401": { FLOOR: "CPT-4", BASE: "RB-4", WALL: "P-4" },
  "402": { FLOOR: "EPX-1", BASE: "RB-4", WALL: "P-4" },
  "403": { FLOOR: "VCT-4", BASE: "RB-4", WALL: "P-4" },
};

test("revision markers: a delta never mints a room key, and never corrupts a cell", () => {
  const tab = extractTable(revSched, "room-finish")!;
  assert.ok(!tab.rows.some((r) => r.key === "2"), "'Δ2' left of the key column must not strip to row key '2'");
  assert.ok(!tab.rows.some((r) => r.key === "3"), "'REV 3' must not mint a row either");
  assert.deepEqual(tab.rows.map((r) => r.key), ["401", "402", "403"]);
  const r402 = tab.rows.find((r) => r.key === "402")!;
  assert.equal(r402.cells.NO.text, "402", "the marker stayed out of the key cell");
  assert.equal(r402.cells.FLOOR.text, "EPX-1");
  // the marker attached as the row's revision, with evidence at the ink
  assert.equal(r402.revision?.rev, "2");
  assert.equal(r402.revision?.source.text, "Δ2");
  assert.ok(r402.revision!.source.bbox[0] < 100, "the evidence bbox points at the margin delta");
  assert.equal(tab.rows.find((r) => r.key === "403")!.revision?.rev, "3", "REV-style tags attach too");
  assert.equal(tab.rows.find((r) => r.key === "401")!.revision, undefined, "unrevised rows carry nothing");
});

test("revision markers: they ride the graph, the plan bubble, and every resolution", () => {
  const g = buildSheetGraph([revPlan, revSched]);
  assert.equal(g.revisions.length, 3, "every marker the set carries is listed");
  assert.deepEqual([...new Set(g.revisions.map((r) => r.rev))].sort(), ["2", "3"]);
  // the plan bubble's delta attaches to room 402, not its neighbours
  assert.equal(g.rooms.find((r) => r.tag === "402")!.revision?.rev, "2");
  assert.equal(g.rooms.find((r) => r.tag === "401")!.revision, undefined);
  assert.equal(g.rooms.find((r) => r.tag === "403")!.revision, undefined);
  // resolution surfaces the delta — the codes are the POST-revision answer,
  // and the consumer is told the ink changed (row + bubble dedupe to one)
  const res = resolveTag(g, "402");
  assert.equal(res.status, "resolved");
  if (res.status === "resolved") {
    assert.equal(res.finishes.find((f) => f.surface === "FLOOR")!.code, "EPX-1");
    assert.equal(res.revisions?.length, 1);
    assert.equal(res.revisions![0].rev, "2");
    assert.ok(res.revisions![0].source.sheet, "the revision carries evidence like every other edge");
  }
  const clean = resolveTag(g, "401");
  assert.equal(clean.status, "resolved");
  if (clean.status === "resolved") assert.equal(clean.revisions, undefined, "no marker, no revisions field");
});

// ── wide-REMARKS fixture: wrapped + baseline-offset remark, wide column gap ─
const widePlan: SheetSpans = {
  key: "wide.pdf#1",
  sheet_number: "A-105",
  spans: [
    sp("FIFTH FLOOR FINISH PLAN", 300, 900),
    sp("OFFICE", 100, 100), sp("501", 104, 112),
    sp("LAB", 300, 100), sp("502", 310, 112),
    sp("STOR", 500, 100), sp("503", 508, 112),
  ],
};
const wideSched: SheetSpans = {
  key: "wide.pdf#2",
  sheet_number: "A-605",
  spans: [
    sp("ROOM FINISH SCHEDULE", 100, 40),
    // REMARKS sits far right — a very wide column, header centered over it
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60), sp("REMARKS", 900, 60),
    sp("501", 100, 80), sp("OFFICE", 160, 80), sp("CPT-8", 300, 80), sp("RB-8", 400, 80), sp("P-8", 500, 80),
    // the remark: smaller font, baseline-offset, left-aligned at the wide
    // column's far-left edge — and WRAPPED onto a second line
    rsp("SEE FINISH PLAN FOR", 700, 84),
    rsp("EXTENT OF CPT-8", 700, 94),
    sp("502", 100, 110), sp("LAB", 160, 110), sp("EPX-2", 300, 110), sp("RB-8", 400, 110), sp("P-8", 500, 110),
    sp("503", 100, 140), sp("STOR", 160, 140), sp("VCT-8", 300, 140), sp("RB-8", 400, 140), sp("P-8", 500, 140), sp("ATTIC STOCK", 905, 140),
    // a notes block BELOW the table — near-ish, but beyond the repair radius
    sp("GENERAL NOTES:", 100, 200),
    sp("ALL FINISHES PER SPEC SECTION 09", 100, 212),
  ],
};
const WIDE_KEY: Record<string, Record<string, string>> = {
  "501": { FLOOR: "CPT-8", BASE: "RB-8", WALL: "P-8" },
  "502": { FLOOR: "EPX-2", BASE: "RB-8", WALL: "P-8" },
  "503": { FLOOR: "VCT-8", BASE: "RB-8", WALL: "P-8" },
};

test("wide REMARKS: wrapped and baseline-offset remark lines merge into their row — in order, cited", () => {
  const tab = extractTable(wideSched, "room-finish")!;
  assert.deepEqual(tab.rows.map((r) => r.key), ["501", "502", "503"], "notes below the table mint nothing");
  const r501 = tab.rows.find((r) => r.key === "501")!;
  // the left-aligned wide-column remark bands to REMARKS, not WALL — and the
  // wrapped second line rides along in reading order
  assert.equal(r501.cells.REMARKS?.text, "SEE FINISH PLAN FOR EXTENT OF CPT-8");
  assert.equal(r501.cells.WALL.text, "P-8", "the wall finish is not polluted by the remark");
  assert.ok(r501.cells.REMARKS!.bbox[3] >= 94, "the cell's evidence bbox spans both lines");
  assert.equal(tab.rows.find((r) => r.key === "503")!.cells.REMARKS?.text, "ATTIC STOCK");
  assert.equal(tab.rows.find((r) => r.key === "502")!.cells.REMARKS, undefined, "no remark, no invented cell");
  // the notes block stayed OUT — beyond the repair radius
  for (const r of tab.rows) for (const c of Object.values(r.cells)) assert.ok(!/GENERAL NOTES|PER SPEC/.test(c.text), `notes leaked into ${r.key}`);
});

// ── phase-3 SCORED: both lanes, cell-level P/R pinned like every phase ──────
test("SCORED phase 3: revisions + wide REMARKS, precision/recall against the held-out keys", () => {
  const graphs: Array<[SheetGraph, Record<string, Record<string, string>>]> = [
    [buildSheetGraph([revPlan, revSched]), REV_KEY],
    [buildSheetGraph([widePlan, wideSched]), WIDE_KEY],
  ];
  let tp = 0, fp = 0, expected = 0;
  for (const [g, key] of graphs) {
    expected += Object.values(key).reduce((n, v) => n + Object.keys(v).length, 0);
    for (const tag of Object.keys(key)) {
      const res = resolveTag(g, tag);
      assert.equal(res.status, "resolved", tag);
      if (res.status !== "resolved") continue;
      for (const f of res.finishes) {
        assert.ok(f.source.sheet && f.source.bbox, `every cell carries a citation: ${tag}/${f.surface}`);
        if (key[tag][f.surface] === f.code) tp++; else fp++;
      }
    }
  }
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / expected;
  console.log(`  sheetgraph phase-3 cell-level: precision ${precision.toFixed(3)} recall ${recall.toFixed(3)} (${tp}/${expected})`);
  assert.ok(precision >= 0.99, `precision ${precision}`);
  assert.ok(recall >= 0.99, `recall ${recall}`);
});

// ── drawn deltas: geometry proves what the text layer can't say ─────────────
// Real CAD sets rarely emit "Δ2" as text — the convention is a DRAWN triangle
// with a bare digit inside, and the text layer carries just "2" (which the
// text pass rightly refuses: a bare number can't be a marker). The geometric
// lane accepts exactly that shape, and nothing else.
import { drawnDeltaMarkers } from "../src/lib/sheetgraph.ts";

const tri = (a: [number, number], b: [number, number], c: [number, number]): number[] =>
  [a[0], a[1], b[0], b[1], b[0], b[1], c[0], c[1], c[0], c[1], a[0], a[1]];

test("drawn deltas: a bare digit inside a digit-scale triangle — circles, roofs, and open shapes are not", () => {
  const digit = sp("2", 100, 100); // bbox [100,100,105,108], center (102.5, 104)
  // a closed digit-scale triangle around the digit → marker
  const hit = drawnDeltaMarkers([digit], tri([90, 96], [115, 96], [102, 122]));
  assert.equal(hit.length, 1);
  assert.equal(hit[0].span, digit);
  assert.ok(hit[0].tri[0] <= 90 && hit[0].tri[3] >= 122, "the triangle bbox is reported");
  // an OPEN shape (third side missing) is not a marker
  assert.equal(drawnDeltaMarkers([digit], tri([90, 96], [115, 96], [102, 122]).slice(0, 8)).length, 0);
  // a roof-scale triangle around the digit is not a marker (side ≫ digit scale)
  assert.equal(drawnDeltaMarkers([digit], tri([0, 0], [300, 0], [150, 260])).length, 0);
  // a circle (many short chords) is not a marker — grid bubbles stay out
  const circle: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * 2 * Math.PI, a1 = ((i + 1) / 12) * 2 * Math.PI;
    circle.push(102.5 + 12 * Math.cos(a0), 104 + 12 * Math.sin(a0), 102.5 + 12 * Math.cos(a1), 104 + 12 * Math.sin(a1));
  }
  assert.equal(drawnDeltaMarkers([digit], circle).length, 0);
  // a triangle beside (not around) the digit is not this digit's marker
  assert.equal(drawnDeltaMarkers([digit], tri([140, 96], [165, 96], [152, 122])).length, 0);
  // three or more digits are never delta digits
  assert.equal(drawnDeltaMarkers([sp("102", 100, 100)], tri([90, 96], [125, 96], [107, 126])).length, 0);
});

test("drawn deltas ride the graph: attach to the row and the bubble, mint nothing, and say drawn", () => {
  const dPlan: SheetSpans = {
    key: "dd.pdf#1",
    sheet_number: "A-106",
    spans: [
      sp("SIXTH FLOOR FINISH PLAN", 300, 900),
      sp("OFFICE", 100, 100), sp("601", 104, 112),
      sp("LAB", 300, 100), sp("602", 310, 112), sp("1", 332, 110),
    ],
    segs: tri([326, 104], [346, 104], [336, 124]),
  };
  const dSched: SheetSpans = {
    key: "dd.pdf#2",
    sheet_number: "A-606",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 40),
      sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
      sp("601", 100, 80), sp("OFFICE", 160, 80), sp("CPT-6", 300, 80), sp("RB-6", 400, 80), sp("P-6", 500, 80),
      sp("1", 66, 100),
      sp("602", 100, 100), sp("LAB", 160, 100), sp("EPX-6", 300, 100), sp("RB-6", 400, 100), sp("P-6", 500, 100),
    ],
    segs: tri([60, 94], [80, 94], [70, 114]),
  };
  const g = buildSheetGraph([dPlan, dSched]);
  // the graph lists both drawn markers, flagged, bbox spanning the triangle
  assert.equal(g.revisions.length, 2);
  assert.ok(g.revisions.every((r) => r.drawn === true && r.rev === "1"));
  // the bare digit minted neither a room nor a schedule row
  assert.ok(!g.rooms.some((r) => r.tag === "1"), "the delta digit is not a room");
  const tab = g.tables.find((t) => t.kind === "room-finish")!;
  assert.deepEqual(tab.rows.map((r) => r.key), ["601", "602"]);
  // attachment: the schedule row and the plan bubble, both flagged drawn
  assert.equal(tab.rows.find((r) => r.key === "602")!.revision?.drawn, true);
  assert.equal(g.rooms.find((r) => r.tag === "602")!.revision?.drawn, true);
  assert.equal(g.rooms.find((r) => r.tag === "601")!.revision, undefined);
  // resolution surfaces it once (row + bubble dedupe by rev), evidence literal
  const res = resolveTag(g, "602");
  assert.equal(res.status, "resolved");
  if (res.status === "resolved") {
    assert.equal(res.finishes.find((f) => f.surface === "FLOOR")!.code, "EPX-6");
    assert.equal(res.revisions?.length, 1);
    assert.equal(res.revisions![0].drawn, true);
    assert.equal(res.revisions![0].source.text, "1", "evidence text is the literal ink");
    assert.ok(res.revisions![0].source.bbox[2] - res.revisions![0].source.bbox[0] >= 20, "evidence bbox spans the triangle");
  }
});

// ── side-by-side tables: field-found on a real gym set ──────────────────────
// A ROOM SCHEDULE whose LAST column is a code column (CEILING), with the
// finish legend sitting a few hundred px to its right, sharing the y band.
// The generous right band edge — correct for a wide REMARKS column — swallowed
// the legend: every CEILING cell grew legend ink ("SC-1 TL-3 CERAMIC TILE").
// The edge is wide ONLY when the last column is prose-shaped.
const sideSched: SheetSpans = {
  key: "side.pdf#1",
  sheet_number: "A-607",
  spans: [
    sp("ROOM SCHEDULE", 100, 40),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("CEILING", 500, 60),
    sp("701", 100, 80), sp("GYM", 160, 80), sp("RF-1", 300, 80), sp("VWB-1", 400, 80), sp("EXP-1", 500, 80),
    sp("702", 100, 100), sp("OFFICE", 160, 100), sp("TL-1", 300, 100), sp("VWB-1", 400, 100), sp("SC-1", 500, 100),
    // the legend to the RIGHT, rows sharing the y band with the schedule's
    sp("FINISH LEGEND", 700, 40),
    sp("RF-1", 700, 80), sp("RUBBER FLOORING", 760, 80),
    sp("TL-1", 700, 100), sp("CERAMIC TILE", 760, 100),
  ],
};

test("side-by-side tables: a code-column right edge hugs the table — the legend next door stays out", () => {
  const tab = extractTable(sideSched, "room-finish")!;
  assert.equal(tab.rows.length, 2);
  const r701 = tab.rows.find((r) => r.key === "701")!;
  assert.equal(r701.cells.CEILING.text, "EXP-1", "the legend did not bleed into CEILING");
  assert.equal(tab.rows.find((r) => r.key === "702")!.cells.CEILING.text, "SC-1");
  for (const r of tab.rows) for (const c of Object.values(r.cells)) {
    assert.ok(!/RUBBER FLOORING|CERAMIC TILE|LEGEND/.test(c.text), `legend ink leaked into row ${r.key}: "${c.text}"`);
  }
});

// ── WIDE_LAST title-block bleed: field-found on two real mechanical sets ────
// federal-attachment4-mechanical.pdf#16 (VOLUME CONTROL BOX SCHEDULE) and
// itd-d1-lab-mechanical.pdf#12 (EXHAUST FAN SCHEDULE) both draw a sheet-
// corner title block (firm name / address / phone) to the right of the
// table's own ruled border. bandLimits' generous rightMargin (needed so a
// genuinely wide REMARKS value still bands) reaches far enough to sweep the
// title block's own column in on whichever row's y happens to land near one
// of its text lines — measured real gaps: 617px (federal-attachment4, REMARKS
// "SDV" vs. "EGLIN AIR FORCE BASE") and 293px (itd-d1-lab), both 15–33× the
// row's own text height. A genuine wrapped continuation never presents that
// shape (it starts at the SAME left edge as the first line, never further
// right of it), so a same-row second token that lands implausibly far right
// of the cell's own accumulated text is refused rather than merged in.
const titleBlockSched: SheetSpans = {
  key: "tblk.pdf#1",
  sheet_number: "A-610",
  spans: [
    sp("ROOM SCHEDULE", 100, 20),
    sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60), sp("REMARKS", 900, 60),
    // row 601: a clean, narrow real REMARKS value ("SDV" ~ federal-attachment4's own)
    sp("601", 100, 80), sp("OFFICE", 160, 80), sp("CPT-1", 300, 80), sp("RB-1", 400, 80), sp("P-1", 500, 80), sp("SDV", 700, 80),
    // the title block, sharing this row's own y — 685px right of "SDV"'s own
    // end (700 + 3*5 = 715), 30+ text-heights past this fixture's h=8 gate
    sp("SmithGroup", 1400, 80),
    // row 602: a genuine two-span remark ("SEE" + "NOTE", split the way a
    // font-run change can split one printed value into two spans) — the gap
    // between them is ordinary word-spacing, nowhere near the bleed shape
    sp("602", 100, 100), sp("LAB", 160, 100), sp("EPX-1", 300, 100), sp("RB-1", 400, 100), sp("P-1", 500, 100),
    sp("SEE", 700, 100), sp("NOTE", 730, 100),
  ],
};

test("WIDE_LAST title-block bleed: a far-off second token in the same row is refused, not merged", () => {
  const tab = extractTable(titleBlockSched, "room-finish")!;
  assert.equal(tab.rows.length, 2);
  const r601 = tab.rows.find((r) => r.key === "601")!;
  assert.equal(r601.cells.REMARKS?.text, "SDV", "the title block did not bleed into REMARKS");
  assert.ok(!/SmithGroup/.test(r601.cells.REMARKS!.text), "title-block firm name stays out");
});

test("WIDE_LAST title-block bleed, negative case: two close spans of the same real value still merge", () => {
  const tab = extractTable(titleBlockSched, "room-finish")!;
  const r602 = tab.rows.find((r) => r.key === "602")!;
  assert.equal(r602.cells.REMARKS?.text, "SEE NOTE", "an ordinary word-spacing gap still merges into one cell");
});

test("finish tables headed SYMBOL extract and chain — the INTERIOR FINISH SCHEDULE shape", () => {
  // field-found: a real set's finish table is headed SYMBOL | MATERIAL
  // DESCRIPTION | MANUFACTURER | PRODUCT — no CODE/MARK anywhere, so the
  // definitions never chained and every resolution lost its manufacturer
  const symSched: SheetSpans = {
    key: "sym.pdf#1",
    sheet_number: "A-608",
    spans: [
      sp("INTERIOR FINISH SCHEDULE", 100, 40),
      sp("SYMBOL", 100, 60), sp("MATERIAL DESCRIPTION", 200, 60), sp("MANUFACTURER", 420, 60), sp("PRODUCT", 600, 60),
      sp("TL-9", 100, 80), sp("CERAMIC TILE", 200, 80), sp("VENDOR-D", 420, 80), sp("CW9763651PR", 600, 80),
      sp("RF-9", 100, 100), sp("RUBBER", 200, 100), sp("VENDOR-E", 420, 100), sp("PERFORMANCE RUBBER", 600, 100),
    ],
  };
  const fin = extractTable(symSched, "finish")!;
  assert.ok(fin, "SYMBOL anchors the finish table");
  assert.equal(fin.rows.length, 2);
  assert.equal(fin.rows.find((r) => r.key === "TL-9")!.cells.MANUFACTURER.text, "VENDOR-D");
});

// ── two-tier headers: a merged parent over N/E/S/W sub-columns ──────────────
// The real shape, field-found: a WALLS parent spanning four direction columns
// whose labels are single letters — not vocabulary words. Before the sub-tier
// hunt, N and E banded into BASE and S and W into CEILING, so BASE read
// "VWB-1 FRP-1 PT" instead of "VWB-1". A polluted base column is a wrong
// number in the bid.
const twoTierSched: SheetSpans = {
  key: "tier.pdf#1",
  sheet_number: "A-609",
  spans: [
    sp("ROOM SCHEDULE", 100, 20),
    // tier 1: the merged parent, centered over the wall block
    sp('WALLS (PLAN DIRECTION: N = "PLAN NORTH")', 480, 45),
    // tier 2: the real header row
    sp("NUMBER", 100, 65), sp("ROOM NAME", 200, 65), sp("FLOOR", 330, 65), sp("BASE", 400, 65),
    sp("N", 480, 65), sp("E", 560, 65), sp("S", 640, 65), sp("W", 720, 65), sp("CEILING", 790, 65),
    sp("801", 100, 90), sp("GYM", 200, 90), sp("RF-1", 330, 90), sp("VWB-1", 400, 90),
    sp("FRP-1", 480, 90), sp("FRP-2", 560, 90), sp("PT-1", 640, 90), sp("PT-2", 720, 90), sp("EXP-1", 790, 90),
    sp("802", 100, 115), sp("LOBBY", 200, 115), sp("TL-1", 330, 115), sp("VWB-1", 400, 115),
    sp("PT-1", 480, 115), sp("PT-1", 560, 115), sp("PT-1", 640, 115), sp("PT-1", 720, 115), sp("SC-1", 790, 115),
  ],
};

test("two-tier headers: N/E/S/W sub-columns anchor under their parent — BASE and CEILING stay clean", () => {
  const tab = extractTable(twoTierSched, "room-finish")!;
  assert.ok(tab.headers.includes("WALLS N"), `sub-columns are named by parent+sub: ${tab.headers.join(" | ")}`);
  assert.deepEqual(tab.headers.filter((h) => h.startsWith("WALLS ")), ["WALLS N", "WALLS E", "WALLS S", "WALLS W"]);
  const r801 = tab.rows.find((r) => r.key === "801")!;
  assert.equal(r801.cells.BASE.text, "VWB-1", "the north wall no longer smears into BASE");
  assert.equal(r801.cells.CEILING.text, "EXP-1", "the south and west walls no longer smear into CEILING");
  assert.equal(r801.cells["WALLS N"].text, "FRP-1");
  assert.equal(r801.cells["WALLS E"].text, "FRP-2");
  assert.equal(r801.cells["WALLS S"].text, "PT-1");
  assert.equal(r801.cells["WALLS W"].text, "PT-2");
  // the schedule alone still answers — it just cites no plan tag
  const solo = resolveTag(buildSheetGraph([twoTierSched]), "801");
  assert.equal(solo.status, "resolved");
  assert.equal(solo.room, null, "no plan sheet in the set, so no bubble to cite");
  // resolution surfaces every wall face separately, FLOOR still first
  const tierPlan: SheetSpans = {
    key: "tier.pdf#0", sheet_number: "A-107",
    spans: [sp("SEVENTH FLOOR FINISH PLAN", 300, 900), sp("GYM", 100, 300), sp("801", 104, 312)],
  };
  const g2 = buildSheetGraph([tierPlan, twoTierSched]);
  const r = resolveTag(g2, "801");
  assert.equal(r.status, "resolved");
  if (r.status !== "resolved") return;
  assert.equal(r.finishes[0].surface, "FLOOR", "FLOOR still leads the list");
  assert.equal(r.finishes.find((f) => f.surface === "BASE")!.code, "VWB-1");
  assert.deepEqual(
    r.finishes.filter((f) => f.surface.startsWith("WALLS ")).map((f) => [f.surface, f.code]),
    [["WALLS E", "FRP-2"], ["WALLS N", "FRP-1"], ["WALLS S", "PT-1"], ["WALLS W", "PT-2"]],
  );
  assert.equal(r.finishes.find((f) => f.surface === "CEILING")!.code, "EXP-1");
});

test("a lone unexplained token never mints a column — the sub-tier needs a parent above it", () => {
  const noParent: SheetSpans = {
    key: "np.pdf#1", sheet_number: "A-610",
    spans: [
      sp("ROOM SCHEDULE", 100, 20),
      sp("NO", 100, 65), sp("NAME", 200, 65), sp("FLOOR", 330, 65), sp("BASE", 400, 65),
      sp("X", 480, 65), sp("Y", 560, 65), sp("CEILING", 790, 65),   // no parent span above
      sp("901", 100, 90), sp("GYM", 200, 90), sp("RF-1", 330, 90), sp("VWB-1", 400, 90), sp("EXP-1", 790, 90),
    ],
  };
  const tab = extractTable(noParent, "room-finish")!;
  assert.ok(!tab.headers.some((h) => / [XY]$/.test(h)), `no phantom sub-columns: ${tab.headers.join(" | ")}`);
});

// ── other schedule families: a DOOR schedule is not a finish schedule ───────
// Field-found on a real grocery set: DOOR SCHEDULE (MARK | DESCRIPTION |
// MATERIAL | COMMENTS) extracted as 54 "finish" rows, so a finish code
// colliding with a door mark would chain to a DOOR — a confidently wrong
// product in the bid. Refused by title, and the drop is named.
import { isMepEquipmentSchedule, isNonFinishSchedule, isReferenceOrSpecTable } from "../src/lib/sheetgraph.ts";

test("isNonFinishSchedule: other families refuse, anything naming FINISH or MATERIAL is kept", () => {
  for (const t of ["DOOR SCHEDULE", "DOOR AND WINDOW SCHEDULE", "PARTITION SCHEDULE", "EQUIPMENT SCHEDULE", "LIGHTING SCHEDULE"]) {
    assert.equal(isNonFinishSchedule(t), true, t);
  }
  for (const t of ["INTERIOR FINISH SCHEDULE", "MATERIAL SCHEDULE", "ROOM FINISH SCHEDULE", "DOOR FINISH SCHEDULE", "FINISH LEGEND"]) {
    assert.equal(isNonFinishSchedule(t), false, `${t} must be kept — when in doubt, keep and let the caller look`);
  }
});

test("isNonFinishSchedule: real MEP-equipment families refuse too (ledger item 28) — but FAN is deliberately excluded", () => {
  // BOILER/HUMIDIFIER/COIL/CHILLER/PUMP/AHU/VAV: real, found live on
  // itd-d1-lab's own "CONDENSING HOT WATER BOILER SCHEDULE" — a genuine MEP
  // equipment table whose header also independently clears FINISH_HEADERS'
  // own vocabulary. "FAN" is a REAL, CAUGHT near-miss, not a hypothetical
  // one: adding it here broke this project's own committed regression test
  // the moment it was tried — the real Bessemer sample's own "FAN SCHEDULE"
  // is a legitimate finish-kind table (diffuser/grille/register), not an
  // HVAC fan-equipment one, and the word alone can't tell the two apart.
  for (const t of ["CONDENSING HOT WATER BOILER SCHEDULE", "HUMIDIFIER SCHEDULE", "HOT WATER REHEAT COIL SCHEDULE", "CHILLER SCHEDULE", "CONDENSATE PUMP SCHEDULE", "AHU SCHEDULE", "VAV SCHEDULE", "EXPANSION AND COMPRESSION TANK SCHEDULE"]) {
    assert.equal(isNonFinishSchedule(t), true, t);
  }
  assert.equal(isNonFinishSchedule("FAN SCHEDULE"), false, "FAN stays out of the guard on purpose — see this test's own comment");
});

test("tank schedule classification survives a concatenated extracted title", () => {
  assert.equal(isMepEquipmentSchedule("EXPANSION AND COMPRESSION TANK SCHEDULE"), true);
  assert.equal(isMepEquipmentSchedule("EPANSIONANDCOPRESSIONTANKSCHEDULE"), true);
  assert.equal(isNonFinishSchedule("EPANSIONANDCOPRESSIONTANKSCHEDULE"), true);
  assert.equal(isMepEquipmentSchedule("TANK MATERIAL SCHEDULE"), true, "equipment-family classification is independent of finish/material exclusion");
  assert.equal(isNonFinishSchedule("TANK MATERIAL SCHEDULE"), false, "an explicit MATERIAL title remains protected");
});

test("finish→equipment reclassification keeps a sparse tank schedule in the graph", () => {
  const sched: SheetSpans = {
    key: "tank.pdf#1",
    sheet_number: "M-602",
    spans: [
      sp("EXPANSION AND COMPRESSION TANK SCHEDULE", 100, 20),
      sp("MARK", 100, 50), sp("SERVICE", 220, 50), sp("MANUFACTURER", 380, 50), sp("MODEL", 540, 50), sp("REMARKS", 680, 50),
      sp("ET-1", 100, 75), sp("CHILLED WATER", 220, 75), sp("WESSELS", 380, 75), sp("NLA-35", 540, 75), sp("1,2", 680, 75),
    ],
  };
  const graph = buildSheetGraph([sched]);
  const tank = graph.tables.find((table) => table.rows.some((row) => row.key === "ET-1"));
  assert.ok(tank, "ET-1 row survives finish-family exclusion");
  assert.equal(tank.kind, "equipment");
  assert.ok(graph.notes.some((note) => /EXPANSION AND COMPRESSION TANK SCHEDULE/.test(note) && /reclassified as equipment-kind/.test(note)));
});

test("a DOOR SCHEDULE never becomes a finish table — and the drop is NAMED", () => {
  const doorSheet: SheetSpans = {
    key: "door.pdf#1",
    sheet_number: "A-611",
    spans: [
      sp("DOOR SCHEDULE", 100, 20),
      sp("MARK", 100, 60), sp("DESCRIPTION", 200, 60), sp("MATERIAL", 400, 60), sp("COMMENTS", 560, 60),
      // a door mark that genuinely COLLIDES with room 101's floor code
      sp("CPT-1", 100, 80), sp("HOLLOW METAL DOOR", 200, 80), sp("HM", 400, 80), sp("PAIR", 560, 80),
      sp("D-2", 100, 100), sp("WOOD DOOR", 200, 100), sp("WD", 400, 100), sp("SINGLE", 560, 100),
    ],
  };
  // extractTable is the raw reader — it still sees any MARK table's shape
  assert.equal(extractTable(doorSheet, "finish")!.rows.length, 2);
  // the door sheet is loaded FIRST, so an ungated graph would chain to it
  const g = buildSheetGraph([doorSheet, planSheet, schedSheet]);
  assert.ok(!g.tables.some((t) => t.title?.text === "DOOR SCHEDULE"), "no door schedule among the indexed tables");
  assert.ok(g.notes.some((n) => /DOOR SCHEDULE/.test(n) && /NOT indexed/.test(n)), `the drop is named: ${g.notes.join(" | ")}`);
  // room 101's FLOOR chains to the MATERIAL schedule's CPT-1, never the door's
  const res = resolveTag(g, "101");
  assert.equal(res.status, "resolved");
  if (res.status !== "resolved") return;
  const floor = res.finishes.find((f) => f.surface === "FLOOR")!;
  assert.equal(floor.code, "CPT-1");
  assert.equal(floor.definition?.cells.MATERIAL, "CARPET TILE", "chained to the material schedule, never to the door schedule");
  assert.equal(floor.definition?.cells.MANUFACTURER, "VENDOR-A");
});

// ── reference / cross-ref / spec tables: not instance schedules ────────────
// Same MARK|DESCRIPTION|MATERIAL shape as a finish table. Indexing one as
// finish made sweep_schedule_row count every lookup row as installed work,
// and a numbered cell on a plan sheet minted a second instance tag for a
// bubble the sheet already carried.
test("isReferenceOrSpecTable: lookup tables refuse, finish/material specs and instance schedules are kept", () => {
  for (const title of [
    "EQUIPMENT CROSS REFERENCE",
    "CROSS-REFERENCE TABLE",
    "SPECIFICATION INDEX",
    "SPECIFICATIONS",
    "POINTS LIST",
    "DDC POINTS SCHEDULE",
    "BAS POINTS LIST",
    "REFERENCE TABLE",
  ]) {
    assert.equal(isReferenceOrSpecTable(title), true, title);
  }
  for (const title of [
    "ROOM FINISH SCHEDULE",
    "MATERIAL SCHEDULE",
    "FINISH SPECIFICATION",
    "MATERIAL SPECIFICATION",
    "AIR-COOLED CONDENSING UNIT SCHEDULE",
    "UNIT HEATER SCHEDULE (HOT WATER)",
    "REFER TO SPECIFICATIONS",
    "SEE SPEC SECTION 233723",
  ]) {
    assert.equal(isReferenceOrSpecTable(title), false, `${title} must be kept — instance/product tables and running-text notes are not lookup captions`);
  }
});

test("a CROSS-REFERENCE / SPECIFICATION table never becomes a finish table — and does not mint instance tags", () => {
  const xref: SheetSpans = {
    key: "xref.pdf#0",
    sheet_number: "M-701",
    spans: [
      sp("EQUIPMENT CROSS REFERENCE", 100, 20),
      sp("MARK", 100, 60), sp("DESCRIPTION", 220, 60), sp("MATERIAL", 420, 60), sp("COMMENTS", 580, 60),
      sp("CU-1", 100, 80), sp("CONDENSING UNIT", 220, 80), sp("DX", 420, 80), sp("ROOF", 580, 80),
      sp("EV-1", 100, 100), sp("DX FAN COIL", 220, 100), sp("DX", 420, 100), sp("ELEC 350", 580, 100),
      sp("UH-1", 100, 120), sp("UNIT HEATER", 220, 120), sp("HW", 420, 120), sp("VESTIBULE", 580, 120),
    ],
  };
  const plan: SheetSpans = {
    key: "xref.pdf#1",
    sheet_number: "M-101",
    spans: [
      sp("FIRST FLOOR HVAC PLAN", 300, 900),
      sp("SPECIFICATION INDEX", 100, 20),
      sp("NO", 100, 60), sp("NAME", 180, 60), sp("FLOOR", 320, 60), sp("BASE", 420, 60), sp("WALL", 520, 60),
      sp("201", 100, 80), sp("SEE SPEC", 180, 80), sp("N/A", 320, 80), sp("N/A", 420, 80), sp("N/A", 520, 80),
      sp("202", 100, 100), sp("SEE SPEC", 180, 100), sp("N/A", 320, 100), sp("N/A", 420, 100), sp("N/A", 520, 100),
      sp("MECH ROOM", 10, 500), sp("201", 14, 512),
    ],
  };
  const sched: SheetSpans = {
    key: "xref.pdf#2",
    sheet_number: "A-601",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 40),
      sp("NO", 100, 60), sp("NAME", 160, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("WALL", 500, 60),
      sp("201", 100, 80), sp("MECH ROOM", 160, 80), sp("SC-1", 300, 80), sp("RB-1", 400, 80), sp("P-1", 500, 80),
    ],
  };
  const rawFin = extractTable(xref, "finish")!;
  assert.deepEqual(rawFin.rows.map((r) => r.key).sort(), ["CU-1", "EV-1", "UH-1"]);
  assert.equal(rawFin.title?.text, "EQUIPMENT CROSS REFERENCE");
  const rawIdx = extractTable(plan, "room-finish")!;
  assert.ok(rawIdx.rows.some((r) => r.key === "201"), "raw reader still sees the spec-index 201 row");
  assert.equal(rawIdx.title?.text, "SPECIFICATION INDEX");
  const g = buildSheetGraph([xref, plan, sched]);
  assert.ok(!g.tables.some((tab) => /CROSS\s*REF/i.test(tab.title?.text || "")), "no cross-reference among the indexed tables");
  assert.ok(!g.tables.some((tab) => /SPECIFICATION INDEX/i.test(tab.title?.text || "")), "no specification index among the indexed tables");
  assert.ok(!g.tables.some((tab) => tab.kind === "finish" && tab.rows.some((r) => /^(CU|EV|UH)-/.test(r.key))), "lookup marks are not finish-table instance keys");
  assert.ok(g.notes.some((n) => /CROSS REFERENCE/.test(n) && /NOT indexed/.test(n)), `cross-ref drop is named: ${g.notes.join(" | ")}`);
  assert.ok(g.notes.some((n) => /SPECIFICATION INDEX/.test(n) && /NOT indexed/.test(n)), `spec-index drop is named: ${g.notes.join(" | ")}`);
  assert.deepEqual(g.rooms.map((r) => r.tag).sort(), ["201"]);
  assert.equal(g.rooms.filter((r) => r.tag === "201").length, 1, "the spec-index 201 cell is not a second instance tag");
  assert.equal(g.rooms[0].bbox[1] >= 500, true, "the surviving 201 is the plan bubble, not the table cell");
  const res = resolveTag(g, "201");
  assert.equal(res.status, "resolved");
  if (res.status !== "resolved") return;
  const fl = res.finishes.find((f) => f.surface === "FLOOR")!;
  assert.equal(fl.code, "SC-1", "room 201 chains to the finish schedule, never the lookup row");
});

// ═════════════════════════════════════════════════════════════════════════════
// Phase 4 (#87): what a SCORED run against real bid sets forced. Each of these
// reproduces a failure measured on an actual planset, not an imagined one.
// ═════════════════════════════════════════════════════════════════════════════

test("columns come from where the DATA starts, not where the header sits", () => {
  // Field-found: headers centred, cells left-aligned. "PT-1" and
  // "SEE INT. ELEVATIONS" share a left edge but their centres differ by 120px,
  // so centre-banding put the short one in BASE and the long one in WALL.
  const sched: SheetSpans = {
    key: "align.pdf#1", sheet_number: "A-620",
    spans: [
      sp("ROOM SCHEDULE", 100, 20),
      // header cells are WIDE and centred over their columns
      { str: "NO.", x: 100, y: 60, w: 30, h: 8 },
      { str: "NAME", x: 200, y: 60, w: 90, h: 8 },
      { str: "FLOOR FINISH", x: 360, y: 60, w: 150, h: 8 },
      { str: "BASE FINISH", x: 560, y: 60, w: 140, h: 8 },
      { str: "WALL FINISH", x: 800, y: 60, w: 140, h: 8 },
      // data is LEFT-ALIGNED at each column's own start
      sp("601", 100, 85), sp("LOBBY", 200, 85), sp("CT-1", 355, 85), sp("VB-1", 545, 85), sp("SEE INT. ELEVATIONS", 745, 85),
      sp("602", 100, 105), sp("STORAGE", 200, 105), sp("SC-1", 355, 105), sp("VB-1", 545, 105), sp("PT-1", 745, 105),
      sp("603", 100, 125), sp("OFFICE", 200, 125), sp("SC-1", 355, 125), sp("VB-1", 545, 125), sp("PT-1", 745, 125),
    ],
  };
  const tab = extractTable(sched, "room-finish")!;
  for (const key of ["601", "602", "603"]) {
    const r = tab.rows.find((x) => x.key === key)!;
    assert.equal(r.cells.BASE.text, "VB-1", `${key}: BASE keeps its own cell`);
  }
  assert.equal(tab.rows.find((r) => r.key === "602")!.cells.WALL.text, "PT-1", "a SHORT wall cell lands in WALL, not BASE");
  assert.equal(tab.rows.find((r) => r.key === "601")!.cells.WALL.text, "SEE INT. ELEVATIONS");
});

test("three-tier headers: the LOWEST tier defines the columns, the tiers above NAME them", () => {
  // Field-found: ROOM | FLOOR | WALLS | CEILING over
  // MARK | LOCATION | FINISH | BASE | NORTH | … | FINISH | HEIGHT.
  // The parent row carries enough vocabulary to look like the header; taking
  // it read every sub-header as data. Two columns are both headed FINISH, so
  // each takes its parent's name.
  const sched: SheetSpans = {
    key: "tier3.pdf#1", sheet_number: "A-621",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 20),
      // tier 1 — parents, centred over their groups
      { str: "ROOM", x: 130, y: 45, w: 60, h: 8 },
      { str: "FLOOR", x: 330, y: 45, w: 70, h: 8 },
      { str: "CEILING", x: 660, y: 45, w: 90, h: 8 },
      // a column that spans BOTH tiers, on its own row between them
      { str: "REMARKS", x: 860, y: 58, w: 90, h: 8 },
      // tier 2 — the real columns
      sp("MARK", 100, 70), sp("LOCATION", 180, 70), sp("FINISH", 300, 70), sp("BASE", 400, 70),
      sp("FINISH", 640, 70), sp("HEIGHT", 740, 70),
      sp("701", 100, 95), sp("LOBBY", 180, 95), sp("PT-1", 300, 95), sp("WB-1", 400, 95), sp("ACT-1", 640, 95), sp("9'-0\"", 740, 95),
      sp("702", 100, 115), sp("OFFICE", 180, 115), sp("RT-1", 300, 115), sp("WB-2", 400, 115), sp("ACT-2", 640, 115), sp("13'-0\"", 740, 115),
    ],
  };
  const tab = extractTable(sched, "room-finish")!;
  assert.ok(tab.headers.includes("FLOOR FINISH"), `floor column takes its parent's name: ${tab.headers.join(" | ")}`);
  assert.ok(tab.headers.includes("CEILING FINISH"), "the second FINISH is named by ITS parent, not dropped as a duplicate");
  assert.ok(tab.headers.includes("BASE"), "BASE is its own surface and is never renamed 'FLOOR BASE'");
  const r = tab.rows.find((x) => x.key === "701")!;
  assert.equal(r.cells["FLOOR FINISH"].text, "PT-1");
  assert.equal(r.cells.BASE.text, "WB-1");
  assert.equal(r.cells["CEILING FINISH"].text, "ACT-1");
  // resolution ranks by the LEADING word, so the parent-named columns still
  // read as their surfaces, FLOOR first
  const plan: SheetSpans = {
    key: "tier3.pdf#0", sheet_number: "A-108",
    spans: [sp("EIGHTH FLOOR FINISH PLAN", 300, 900), sp("LOBBY", 100, 300), sp("701", 104, 312)],
  };
  const res = resolveTag(buildSheetGraph([plan, sched]), "701");
  assert.equal(res.status, "resolved");
  if (res.status !== "resolved") return;
  assert.equal(res.finishes[0].surface, "FLOOR FINISH");
  assert.equal(res.finishes[0].code, "PT-1");
  assert.equal(res.finishes.find((f) => f.surface === "BASE")!.code, "WB-1");
});

test("three-tier headers: a direction column drawn as ONE combined span (\"FINISH - EAST\") still resolves to EAST, not a generic parent-tier label", () => {
  // Real, found live on Baker County EOC's own real "ROOM FINISH SCHEDULE"
  // (ledger item 10): NORTH/SOUTH/WEST each split their own tier-3 label
  // across TWO spans ("FINISH -" then the bare direction word) — but EAST
  // alone draws them as ONE combined run, "FINISH - EAST". headerHits' own
  // first-vocab-word-per-span pick surfaces only "FINISH" for that one
  // span, and since "FINISH" repeats (a real second FINISH sits under
  // CEILING too, same as the FLOOR FINISH/CEILING FINISH case above), the
  // ambiguous-label path used to walk up to an unrelated, too-generic
  // parent-tier label ("WALLS") that happens to sit centred over EAST's
  // own x-position — real, measured: every one of 13 real rows had its own
  // real EAST value mislabeled under "WALLS FINISH" before this fix.
  const sched: SheetSpans = {
    key: "eastcombined.pdf#1", sheet_number: "A-627",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 20),
      // tier 1 — WALLS sits centred over EAST's own column, same real shape
      { str: "WALLS", x: 620, y: 45, w: 60, h: 8 },
      { str: "CEILING", x: 840, y: 45, w: 70, h: 8 },
      // tier 2 — NORTH/SOUTH each get their own separate "FINISH -" parent;
      // EAST gets none, because its own tier-3 span already carries it
      sp("FINISH -", 520, 58), sp("FINISH -", 720, 58),
      // tier 3 — the real columns (FLOOR/BASE are required to qualify this
      // as a room-finish table at all, same as every other real key here).
      // NORTH/SOUTH are bare direction words; EAST is the one real,
      // combined "FINISH - EAST" run.
      sp("NUMBER", 100, 70), sp("FLOOR", 250, 70), sp("BASE", 380, 70),
      sp("NORTH", 520, 70), sp("FINISH - EAST", 620, 70), sp("SOUTH", 720, 70), sp("FINISH", 840, 70),
      sp("100", 100, 95), sp("RF-1", 250, 95), sp("WB-1", 380, 95),
      sp("P-1", 520, 95), sp("P-2", 620, 95), sp("P-3", 720, 95), sp("GYP-1", 840, 95),
    ],
  };
  const tab = extractTable(sched, "room-finish")!;
  assert.ok(tab, "the table extracts at all");
  assert.ok(tab.headers.includes("EAST"), `EAST must resolve on its own, not fold into a generic parent label: ${tab.headers.join(" | ")}`);
  assert.ok(!tab.headers.includes("WALLS FINISH"), "the real bug this pins: EAST must never be silently renamed to its unrelated parent tier's own generic label");
  const r = tab.rows[0];
  assert.equal(r.cells.NORTH.text, "P-1");
  assert.equal(r.cells.EAST.text, "P-2", "EAST's own real value lands in its own real column");
  assert.equal(r.cells.SOUTH.text, "P-3");
});

test("a table ends where its rows stop — a legend far below is not extra rows", () => {
  const sched: SheetSpans = {
    key: "end.pdf#1", sheet_number: "A-622",
    spans: [
      sp("ROOM SCHEDULE", 100, 20),
      sp("NO", 100, 60), sp("NAME", 200, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("CEILING", 500, 60),
      sp("801", 100, 80), sp("LOBBY", 200, 80), sp("CT-1", 300, 80), sp("VB-1", 400, 80), sp("ACT-1", 500, 80),
      sp("802", 100, 100), sp("OFFICE", 200, 100), sp("CT-1", 300, 100), sp("VB-1", 400, 100), sp("ACT-1", 500, 100),
      sp("803", 100, 120), sp("STORAGE", 200, 120), sp("SC-1", 300, 120), sp("VB-1", 400, 120), sp("ACT-2", 500, 120),
      // far below: a keyed-looking row from something else entirely
      sp("801", 100, 900), sp("DUPLICATE", 200, 900), sp("XX-9", 300, 900), sp("XX-9", 400, 900), sp("XX-9", 500, 900),
    ],
  };
  const tab = extractTable(sched, "room-finish")!;
  assert.deepEqual(tab.rows.map((r) => r.key), ["801", "802", "803"], "the far-below row is not part of this table");
  assert.equal(tab.rows.find((r) => r.key === "801")!.cells.FLOOR.text, "CT-1");
});

test("corroboration: a keynote legend row never becomes a room, and the reason says so", () => {
  const plan: SheetSpans = {
    key: "kn.pdf#1", sheet_number: "A-109",
    spans: [
      sp("NINTH FLOOR FINISH PLAN", 300, 900),
      sp("LOBBY", 100, 100), sp("901", 104, 112),
      // a keynote legend: a number paired with a description, exactly the way
      // a bubble pairs one with a name
      sp("LOCKER ROOM ACCESSORY", 600, 300), sp("10", 604, 312),
      sp("MIRROR", 600, 340), sp("13", 604, 352),
    ],
  };
  const sched: SheetSpans = {
    key: "kn.pdf#2", sheet_number: "A-623",
    spans: [
      sp("ROOM SCHEDULE", 100, 20),
      sp("NO", 100, 60), sp("NAME", 200, 60), sp("FLOOR", 300, 60), sp("BASE", 400, 60), sp("CEILING", 500, 60),
      sp("901", 100, 80), sp("LOBBY", 200, 80), sp("CT-1", 300, 80), sp("VB-1", 400, 80), sp("ACT-1", 500, 80),
      sp("902", 100, 100), sp("OFFICE", 200, 100), sp("CT-1", 300, 100), sp("VB-1", 400, 100), sp("ACT-1", 500, 100),
    ],
  };
  const g = buildSheetGraph([plan, sched]);
  assert.deepEqual(g.rooms.map((r) => r.tag), ["901"], "the legend numbers are not rooms");
  assert.equal(g.rooms[0].corroboration, "name+schedule");
  assert.deepEqual(g.unmatched_tags.map((u) => u.tag).sort(), ["10", "13"]);
  for (const u of g.unmatched_tags) assert.match(u.reason, /keynote\/legend row|keynote, detail marker/);
  // and the disclosure still cites the ink, so a genuinely omitted room is findable
  assert.ok(g.unmatched_tags.every((u) => u.sheet && u.bbox));
});

test("cell alignment is READ, not assumed: a schedule that CENTRES its cells bands correctly", () => {
  // Field-found on a municipal set drawn in a hand-lettered CAD font: cells
  // are centred, not left-aligned, so a long value ("PNT-1, FRP-1") starts
  // far left of a short one ("PNT-1") in the same column and left-edge
  // banding pushed it into the column before it.
  const centred: SheetSpans = {
    key: "ctr.pdf#1", sheet_number: "A-624",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 20),
      { str: "ROOM #", x: 96, y: 60, w: 60, h: 8 },
      { str: "ROOM NAME", x: 200, y: 60, w: 90, h: 8 },
      { str: "FLOOR", x: 380, y: 60, w: 60, h: 8 },
      { str: "BASE", x: 540, y: 60, w: 50, h: 8 },
      { str: "WALL", x: 700, y: 60, w: 50, h: 8 },
      // every cell CENTRED on its column: 126 / 245 / 410 / 565 / 725
      { str: "100", x: 111, y: 85, w: 30, h: 8 }, { str: "CHEM FEED", x: 200, y: 85, w: 90, h: 8 },
      { str: "SC-1", x: 390, y: 85, w: 40, h: 8 }, { str: "RB-1", x: 545, y: 85, w: 40, h: 8 },
      { str: "PNT-1", x: 700, y: 85, w: 50, h: 8 },
      { str: "102", x: 111, y: 105, w: 30, h: 8 }, { str: "MECH./JAN.", x: 197, y: 105, w: 96, h: 8 },
      { str: "SC-1", x: 390, y: 105, w: 40, h: 8 }, { str: "RB-1", x: 545, y: 105, w: 40, h: 8 },
      // the long one: centred, so it STARTS left of the short values above
      { str: "PNT-1, FRP-1", x: 665, y: 105, w: 120, h: 8 },
      { str: "104", x: 111, y: 125, w: 30, h: 8 }, { str: "TLT/SHWR", x: 202, y: 125, w: 86, h: 8 },
      { str: "HTF-1", x: 387, y: 125, w: 46, h: 8 }, { str: "HTB-1", x: 542, y: 125, w: 46, h: 8 },
      { str: "PNT-1", x: 700, y: 125, w: 50, h: 8 },
    ],
  };
  const tab = extractTable(centred, "room-finish")!;
  assert.deepEqual(tab.rows.map((r) => r.key), ["100", "102", "104"]);
  const r102 = tab.rows.find((r) => r.key === "102")!;
  assert.equal(r102.cells.BASE.text, "RB-1", "the long wall value did not spill into BASE");
  assert.equal(r102.cells.WALL.text, "PNT-1, FRP-1");
  assert.equal(tab.rows.find((r) => r.key === "104")!.cells.FLOOR.text, "HTF-1");
});

test("a header cell naming two vocabulary words gives up the second: ROOM # | ROOM NAME", () => {
  // Both cells lead with ROOM. Deduping on the leading word alone left the
  // NAME column with no anchor, and the room name merged into FLOOR.
  const sched: SheetSpans = {
    key: "rn.pdf#1", sheet_number: "A-625",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 20),
      sp("ROOM #", 100, 60), sp("ROOM NAME", 200, 60), sp("FLOOR", 400, 60), sp("BASE", 520, 60), sp("WALL", 640, 60),
      sp("100", 100, 85), sp("CHEM FEED", 200, 85), sp("SC-1", 400, 85), sp("RB-1", 520, 85), sp("PNT-1", 640, 85),
      sp("101", 100, 105), sp("LAB", 200, 105), sp("SC-1", 400, 105), sp("RB-1", 520, 105), sp("PNT-1", 640, 105),
      sp("102", 100, 125), sp("CONTROL RM", 200, 125), sp("HTF-1", 400, 125), sp("HTB-1", 520, 125), sp("PNT-1", 640, 125),
    ],
  };
  const tab = extractTable(sched, "room-finish")!;
  assert.ok(tab.headers.includes("NAME"), `the name column keeps an anchor: ${tab.headers.join(" | ")}`);
  for (const r of tab.rows) {
    assert.ok(!/CHEM FEED|LAB|CONTROL RM/.test(r.cells.FLOOR.text), `room name leaked into FLOOR on ${r.key}: "${r.cells.FLOOR.text}"`);
  }
  assert.equal(tab.rows.find((r) => r.key === "100")!.cells.FLOOR.text, "SC-1");
  assert.equal(tab.rows.find((r) => r.key === "102")!.cells.BASE.text, "HTB-1");
});

// ── multi-table-per-sheet (maturity plan Phase 0, #HVAC-boundary) ──────────
// A dense MEP sheet routinely stacks several schedules in the SAME column
// grid — a real, common drafting convention, not a one-off. Before this fix,
// extractTable found at most ONE "finish" table per sheet (the first header
// row to clear the vocabulary bar); a same-evening attempt to widen the
// vocabulary so a second table could qualify caused a real regression
// instead (a manufacturer name from one table misread as a row key of
// another) — proof the fix had to be a real table BOUNDARY, not a broader
// net. m601-spans.json is the real, live-captured text (295 spans, at the
// browser's actual RENDER_SCALE=2.0) off page 8 ("MECHANICAL SCHEDULES") of
// the real Bessemer sample PDF this project has been testing against all
// session — not a hand-typed approximation.
const m601 = JSON.parse(
  readFileSync(new URL("./fixtures/m601-spans.json", import.meta.url), "utf8"),
) as SheetSpans;

test("multi-table extraction: two real MEP schedules on the same sheet, same column grid, both found", () => {
  const tables = extractAllTables(m601, "finish");
  const titles = tables.map((t) => t.title?.text);
  assert.ok(titles.includes("DIFFUSER, GRILLE, REGISTER SCHEDULE"), `titles found: ${titles.join(" | ")}`);
  assert.ok(titles.includes("FAN SCHEDULE"), `titles found: ${titles.join(" | ")}`);
  // extractAllTables was called for kind "finish" specifically here, so
  // every result is "finish" by construction — the real equipment-kind
  // tables this same sheet ALSO carries (Electric Wall/Baseboard Heater
  // Schedule, Phase 5) live in their own test block below, extracted via
  // kind "equipment" against the same fixture.
  assert.ok(tables.every((t) => t.kind === "finish"));
});

test("multi-table extraction: the real regression case — Diffuser/Grille/Register extracts clean", () => {
  // This is the exact tag lookup that was broken live earlier tonight
  // (find_schedule/sweep_schedule_row on "SR-1") and the exact regression
  // (a later table's stray text shifting this table's own column starts)
  // caught and reverted before it shipped.
  const diffuser = extractAllTables(m601, "finish").find((t) => t.title?.text === "DIFFUSER, GRILLE, REGISTER SCHEDULE")!;
  assert.ok(diffuser, "Diffuser/Grille/Register Schedule is found");
  // THROW (real, standalone, single-line — "3-WAY" on SR-1, a genuine
  // diffuser throw-pattern spec) is now recovered too (subTierAnchors'
  // degenerate-2-token-run fallback: a run member with no genuine parent
  // ABOVE it, and no continuation directly below it either, mints itself
  // rather than vanishing — same fix PENTHOUSE SCHEDULE's own TYPE/FINISH
  // needed). MODEL (whose real continuation, "NUMBER", wraps onto the row
  // BELOW the header row — a shape this fallback deliberately refuses to
  // guess at, see its own comment) stays exactly as invisible as before.
  assert.deepEqual(diffuser.headers, ["ID", "DESCRIPTION", "MANUFACTURER", "SIZE", "THROW", "MATERIAL"]);
  assert.deepEqual(diffuser.rows.map((r) => r.key), ["SR-1", "SR-2", "TG-1", "TG-2"]);
  assert.equal(diffuser.rows.find((r) => r.key === "SR-1")!.cells.MANUFACTURER.text, "HART AND COOLEY");
  assert.equal(diffuser.rows.find((r) => r.key === "SR-1")!.cells.THROW.text, "3-WAY");
});

test("multi-table extraction: zero cross-contamination between the two tables (the regression, as a standing negative test)", () => {
  const tables = extractAllTables(m601, "finish");
  const diffuser = tables.find((t) => t.title?.text === "DIFFUSER, GRILLE, REGISTER SCHEDULE")!;
  const fan = tables.find((t) => t.title?.text === "FAN SCHEDULE")!;
  // The manufacturer name that bled across tables in the reverted MODEL
  // regression — must never appear as a ROW KEY of the wrong table again.
  assert.ok(!diffuser.rows.some((r) => r.key === "QMARK"), "no stray manufacturer-name row in Diffuser");
  assert.ok(!fan.rows.some((r) => r.key === "QMARK"), "no stray manufacturer-name row in Fan");
  // No row of one table carries the other table's real tag.
  assert.ok(!diffuser.rows.some((r) => r.key === "EF-1"), "Fan's tag did not bleed into Diffuser");
  assert.ok(!fan.rows.some((r) => ["SR-1", "SR-2", "TG-1", "TG-2"].includes(r.key)), "Diffuser's tags did not bleed into Fan");
  // The subtler form of the same bug: a shifted (not just a wrong-row)
  // column start. Diffuser's own MANUFACTURER cell for SR-1 must be its own
  // real value, not something pulled from Fan's differently-positioned
  // columns two schedules below.
  assert.equal(diffuser.rows.find((r) => r.key === "SR-1")!.cells.MANUFACTURER.text, "HART AND COOLEY");
});

test("multi-table extraction: Fan Schedule's real EF-1 row is present, with no fake 'NUMBER' row from the wrapped sub-header (#HVAC-subheader)", () => {
  // Fan Schedule has a real 3-tier header ("MODEL" / "NUMBER", "AIR FLOW" /
  // "(CFM)", "DUCT" / "CONNECTION" / "(IN)") whose middle and bottom tiers
  // carry ZERO vocabulary words, so findHeaderRow's descent logic (which only
  // skips a sub-header row it can independently recognize as a header) never
  // sees them as part of the header. Before the fix, the first of those two
  // wrapped lines was treated as the first DATA row instead, and its leading
  // token "NUMBER" passed rowKeyOf's generic code pattern (CODE_RE has no
  // digit requirement — "CW" and other real MEP tags without digits are
  // legitimate), minting a false "NUMBER" row. The fix recognizes a wrapped
  // continuation line by SHAPE instead of vocabulary — tight line-height gap
  // below the row above, zero vocabulary hits, and no digit anywhere in the
  // row — and skips it as non-data without needing it to independently
  // qualify as a header.
  const fan = extractAllTables(m601, "finish").find((t) => t.title?.text === "FAN SCHEDULE")!;
  assert.ok(fan, "Fan Schedule is found");
  // Only 3 of Fan Schedule's real columns (ID/DESCRIPTION/MANUFACTURER) are
  // in today's flooring-shaped vocabulary — MODEL/AIR FLOW/RPM/DUCT/
  // ELECTRICAL aren't yet. MANUFACTURER's own gap to DESCRIPTION (its only
  // real neighbour) is anomalously wide relative to the table's own
  // baseline column pitch — the real, un-modeled MODEL/AIR FLOW columns are
  // hiding in it — so anchorRadii (ledger item 57) now refuses to credit
  // their real model-number/CFM data to MANUFACTURER rather than crediting
  // it: no more silent cross-column corruption, but also no real
  // manufacturer value survives for this row (this fixture's own MANUFACTURER
  // header cell has no separate data token of its own at all — the source
  // PDF merges "PANASONIC" straight into the wide DESCRIPTION span instead,
  // confirmed by this fixture's own spans). Fixed by a dedicated equipment
  // vocabulary remains the real fix for recovering MODEL/AIR FLOW as their
  // own columns — Phase 5's own scope, unchanged by this.
  const ef1 = fan.rows.find((r) => r.key === "EF-1")!;
  assert.ok(ef1, "the real EF-1 row is present");
  assert.match(ef1.cells.DESCRIPTION.text, /PANASONIC/);
  assert.equal(ef1.cells.MANUFACTURER, undefined, "withheld, not guessed — MODEL/AIR FLOW's real data no longer corrupts MANUFACTURER");
  assert.ok(!fan.rows.some((r) => r.key === "NUMBER"), "the wrapped 'MODEL NUMBER' sub-header line must not mint a fake 'NUMBER' row");
  assert.deepEqual(fan.rows.map((r) => r.key), ["EF-1"], "Fan Schedule has exactly its one real row, nothing minted from the wrapped header");
});

test("multi-table extraction: the graph carries a row from the SECOND table found on the sheet, not just the first", () => {
  // sheet_graph/find_schedule/sweep_schedule_row all depend on
  // buildSheetGraph seeing every table, not just whichever wins a single
  // slot — this is the actual live-tested capability the maturity plan's
  // Phase 0 exists for (e.g. resolving "EBB-6" via sweep_schedule_row,
  // blocked before this fix). resolveTag is the wrong tool to prove this
  // with directly — it only chains a ROOM tag through a room-finish
  // schedule (M601 has none), never a bare equipment tag — so this checks
  // the graph the way sweep_schedule_row's own row lookup actually does:
  // rowKeyAnswersFor against every "finish" table's rows.
  const g = buildSheetGraph([m601]);
  const finishTables = g.tables.filter((t) => t.kind === "finish");
  const hit = finishTables.flatMap((t) => t.rows).find((r) => rowKeyAnswersFor(r.key, "EF-1"));
  assert.ok(hit, `EF-1 (Fan Schedule, the second table found) is in the graph: ${finishTables.map((t) => t.title?.text).join(" | ")}`);
});

// ── Phase 5 (maturity plan): a real "equipment" TableKind, not a
// FINISH_HEADERS patch. Same real fixture (m601-spans.json) — this sheet's
// Electric Wall Heater and Electric Baseboard Heater schedules were the
// exact, real, previously-unreachable targets: EBB-6 specifically was named
// in Phase 0's own write-up as a case that would stay unresolvable "until
// Phase 5's equipment vocabulary ships."
test("equipment extraction: Electric Wall Heater and Electric Baseboard Heater schedules, both found, correctly keyed", () => {
  const tables = extractAllTables(m601, "equipment");
  const titles = tables.map((t) => t.title?.text);
  assert.ok(titles.includes("ELECTRIC WALL HEATER SCHEDULE"), `titles found: ${titles.join(" | ")}`);
  assert.ok(titles.includes("ELECTRIC BASEBOARD HEATER SCHEDULE"), `titles found: ${titles.join(" | ")}`);
  assert.ok(tables.every((t) => t.kind === "equipment"));

  const wall = tables.find((t) => t.title?.text === "ELECTRIC WALL HEATER SCHEDULE")!;
  assert.deepEqual(wall.rows.map((r) => r.key), ["EWH-1"]);
  assert.equal(wall.rows[0].cells.MANUFACTURER.text, "QMARK");
  assert.equal(wall.rows[0].cells.VOLTAGE.text, "120");

  const baseboard = tables.find((t) => t.title?.text === "ELECTRIC BASEBOARD HEATER SCHEDULE")!;
  // EBB-6 specifically: the real, previously-unreachable target this phase
  // exists for (Phase 0's own write-up named it).
  assert.deepEqual(baseboard.rows.map((r) => r.key), ["EBB-1", "EBB-2", "EBB-3", "EBB-4", "EBB-5", "EBB-6", "EBB-7", "EBB-8"]);
  assert.equal(baseboard.rows.find((r) => r.key === "EBB-6")!.cells.MANUFACTURER.text, "QMARK");
  // Accuracy-hardening plan Phase 3, ledger item 4: EBB-6's own VOLTAGE cell
  // used to read `"4'-0\" 240"`, not a clean `"240"` — LENGTH wasn't in
  // EQUIPMENT_HEADERS' vocabulary, so its data (the real 4'-0" fixture
  // length) had nowhere to anchor and bled into the nearest column instead.
  // Every EBB row's own LENGTH now gets its own real column.
  assert.equal(baseboard.rows.find((r) => r.key === "EBB-6")!.cells.VOLTAGE.text, "240", "LENGTH's own anchor stops the fixture length from bleeding into VOLTAGE");
  assert.equal(baseboard.rows.find((r) => r.key === "EBB-6")!.cells.LENGTH.text, "4'-0\"");
});

test("equipment extraction: zero cross-contamination with the real finish-kind tables on the same sheet", () => {
  // The exact regression class this whole design exists to prevent, as a
  // standing negative test: Fan Schedule and Diffuser/Grille/Register both
  // carry some of EQUIPMENT_HEADERS' generic vocabulary (ID/MANUFACTURER/
  // MODEL/DESCRIPTION) and Fan's own header carries a bare "(CFM)" — none of
  // that may pull either table into the equipment pass, and no equipment
  // row's tag may leak into finish's tables either.
  const g = buildSheetGraph([m601]);
  const equipmentTables = g.tables.filter((t) => t.kind === "equipment");
  const finishTables = g.tables.filter((t) => t.kind === "finish");
  // 3, not 2: Electric Wall Heater, Electric Baseboard Heater, and (since the
  // VRF backward-merge fix) VARIABLE REFRIGERANT PACKAGED HEAT PUMP — see the
  // dedicated test below for that table's own extraction.
  assert.equal(equipmentTables.length, 3, `equipment tables found: ${equipmentTables.map((t) => t.title?.text).join(" | ")}`);
  assert.ok(!equipmentTables.some((t) => t.rows.some((r) => ["EF-1", "SR-1", "SR-2", "TG-1", "TG-2"].includes(r.key))), "no finish-kind tag leaked into an equipment table");
  assert.ok(!finishTables.some((t) => t.rows.some((r) => /^EWH-1$|^EBB-\d$/.test(r.key))), "no equipment-kind tag leaked into a finish table");
  // Fan Schedule (bare "(CFM)" hit, deliberately kept out of `required` —
  // see EQUIPMENT_HEADERS' own comment) stays sole "finish", never doubled.
  const fanHits = g.tables.filter((t) => t.title?.text === "FAN SCHEDULE");
  assert.equal(fanHits.length, 1, "Fan Schedule extracted exactly once, not once per kind");
  assert.equal(fanHits[0].kind, "finish");
});

test("equipment extraction: find_schedule's own row-answer path resolves EBB-6 (sweep_schedule_row's real lookup, not a resolveTag detour)", () => {
  // Mirrors the Phase 0 test right above it: resolveTag only chains a ROOM
  // tag through a room-finish schedule (M601 has none) — this exercises the
  // actual mechanism sweep_schedule_row/find_schedule use, across ALL kinds
  // at once, the way buildSheetGraph really presents them.
  const g = buildSheetGraph([m601]);
  const hit = g.tables.flatMap((t) => t.rows).find((r) => rowKeyAnswersFor(r.key, "EBB-6"));
  assert.ok(hit, "EBB-6 answers for a row somewhere in the graph");
});

test("equipment extraction: the VRF Heat Pump's split co-equal-tier header merges, and HP-1 extracts with its real values", () => {
  // "VARIABLE REFRIGERANT PACKAGED HEAT PUMP" is real, on this same sheet,
  // and genuinely carries HP-1's electrical/mechanical spec row — but its
  // header splits across two tiers (a bare ID / "MANUFACTURER MODEL NUMBER"
  // row above a bare CFM/ESP/VOLTAGE/PHASE/AMPS/MOCP row) that neither
  // independently qualifies, so findHeaderRow's downward tier-descent (which
  // only ever looks DOWN) used to anchor on the lower tier alone, with no
  // usable key column — refused outright (this test used to assert exactly
  // that refusal). The backward co-equal-tier merge (mergeBackwardCoEqualTier)
  // now reaches up, merges the two tiers, splits the merged
  // "MANUFACTURER MODEL NUMBER" cell into its own MANUFACTURER and MODEL
  // anchors, and anchors the parenthesized "(MBH)"/"(WATTS)" unit-fragment
  // tiers below the header block — all measured against this real fixture,
  // not invented.
  const g = buildSheetGraph([m601]);
  const vrf = g.tables.find((t) => t.title?.text === "VARIABLE REFRIGERANT PACKAGED HEAT PUMP");
  assert.ok(vrf, `VRF/Heat Pump table extracted: ${g.tables.filter((t) => t.kind === "equipment").map((t) => t.title?.text).join(" | ")}`);
  assert.equal(vrf!.kind, "equipment");
  assert.deepEqual(vrf!.rows.map((r) => r.key), ["HP-1"], "exactly one real row — no 'IN' artifact, no notes-block row");
  const cells = Object.fromEntries(Object.entries(vrf!.rows[0].cells).map(([k, v]) => [k, v.text]));
  assert.deepEqual(cells, {
    ID: "HP-1",
    MANUFACTURER: "FRIEDRICH",
    MODEL: "VRP24K75FRBLAA",
    CFM: "635",
    ESP: "0.2",
    "HEATING MBH": "21",
    "COOLING MBH": "23.4",
    WATTS: "6888",
    VOLTAGE: "230",
    PHASE: "1",
    AMPS: "40.3",
    MOCP: "45",
  });
});

test("equipment extraction: Fan Schedule does not double-extract as equipment via a bare RPM hit (Finding 1)", () => {
  // Fan Schedule's own header (ID/DESCRIPTION/MANUFACTURER/MODEL/RPM) hits 5
  // EQUIPMENT_HEADERS words including a bare RPM — before RPM was pulled out
  // of `required` (following the exact CFM precedent), this qualified Fan
  // Schedule as "equipment" too, and it was only ever masked by an accident
  // of loop-halt ordering: extractTableAt returned null on the (then-refused)
  // VRF candidate, which stopped extractAllTables' loop before it ever
  // reached Fan's header. Now that the VRF candidate succeeds (the test
  // above), that accidental mask is gone — this is a real, standing
  // regression test, not a restatement of the old behavior.
  const g = buildSheetGraph([m601]);
  const equipmentTables = g.tables.filter((t) => t.kind === "equipment");
  assert.equal(equipmentTables.length, 3, `equipment tables found: ${equipmentTables.map((t) => t.title?.text).join(" | ")}`);
  assert.ok(!equipmentTables.some((t) => t.title?.text === "FAN SCHEDULE"), "Fan Schedule was not re-extracted under equipment");
  const fanHits = g.tables.filter((t) => t.title?.text === "FAN SCHEDULE");
  assert.equal(fanHits.length, 1, "Fan Schedule extracted exactly once across the whole graph");
  assert.equal(fanHits[0].kind, "finish");
  assert.deepEqual(fanHits[0].rows.map((r) => r.key), ["EF-1"]);
});

test("equipment extraction: no equipment table is minted from Fan Schedule's own header region", () => {
  // The general form of Finding 1's regression, as a standing negative test:
  // no equipment-kind table's region may overlap Fan Schedule's header
  // y-band, and none may carry its title.
  const g = buildSheetGraph([m601]);
  const fan = g.tables.find((t) => t.title?.text === "FAN SCHEDULE")!;
  const fanTop = fan.region[1];
  const equipmentTables = g.tables.filter((t) => t.kind === "equipment");
  assert.ok(!equipmentTables.some((t) => t.title?.text === "FAN SCHEDULE"), "no equipment table titled FAN SCHEDULE");
  assert.ok(
    !equipmentTables.some((t) => t.region[1] <= fanTop && t.region[3] >= fanTop),
    "no equipment table's region spans Fan Schedule's own header y-band",
  );
});

// ── set-002 CV-1..9 bug: a header row can qualify with its own REQUIRED word
// sitting on a separate, thin, parenthesized-unit tier just below it ────────
test("equipment extraction: a header row with enough distinct vocabulary carries its own REQUIRED rating word on a thin parenthesized-unit tier just below it, not co-occurring on the same line (real regression, itd-d1-lab-mechanical.pdf#13's CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS))", () => {
  // Real, traced root cause: this table's own header line (SYMBOL/AREA
  // SERVED/VALVE TYPE/OPERATION/FLUID/MANUFACTURER AND MODEL/REMARKS) clears
  // EQUIPMENT_HEADERS' minHits bar on its own — 4 distinct hits (SYMBOL,
  // TYPE, MANUFACTURER, REMARKS) — but carries NONE of EQUIPMENT_REQUIRED's
  // words. The table's only real EQUIPMENT_REQUIRED word, GPM, sits two
  // tiers down as a bare "(GPM)" unit fragment with nothing else in
  // EQUIPMENT_HEADERS' vocabulary beside it. Under the OLD single-row
  // qualify() gate this candidate row never qualified at all, so
  // findHeaderRow never even started its own multi-tier descent for this
  // table under "equipment" — it only ever extracted under FINISH_HEADERS
  // (whose required list is satisfied by the bare SYMBOL alone), where
  // isNonFinishSchedule then correctly discarded it (title says "COILS"),
  // losing the table completely. NOT a continuation/title-collision bug —
  // isContinuationTitle requires a literal CONT'D/CONTINUATION/CONTINUED
  // suffix, and this table's title has none.
  const sched: SheetSpans = {
    key: "cv.pdf#1", sheet_number: "M13",
    spans: [
      sp("CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)", 100, 10),
      sp("SYMBOL", 0, 40), sp("VALVE TYPE", 200, 40), sp("MANUFACTURER", 400, 40), sp("REMARKS", 600, 40),
      sp("(GPM)", 200, 52),
      sp("CV-1", 0, 90), sp("2-WAY", 200, 90), sp("ACME", 400, 90), sp("1,2", 600, 90),
      sp("CV-2", 0, 110), sp("2-WAY", 200, 110), sp("ACME", 400, 110), sp("1,2", 600, 110),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  assert.equal(tables.length, 1, `exactly one equipment table extracted, found: ${tables.map((t) => t.title?.text).join(" | ")}`);
  assert.equal(tables[0].title?.text, "CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)");
  assert.deepEqual(tables[0].rows.map((r) => r.key), ["CV-1", "CV-2"]);

  // The SAME title, run through the finish-kind vocabulary alone (its own
  // real bare SYMBOL/MANUFACTURER/REMARKS clear FINISH_HEADERS' bar): a real
  // sibling table in this exact bug's own corpus regression sweep
  // (CONDENSING HOT WATER BOILER SCHEDULE) is titled with a word
  // isNonFinishSchedule refuses, so buildSheetGraph must keep the
  // EQUIPMENT extraction as the table's only surviving copy, not silently
  // lose it to that refusal the way it did before this fix.
  const g = buildSheetGraph([sched]);
  const hit = g.tables.find((t) => t.rows.some((r) => r.key === "CV-1"));
  assert.ok(hit, "CV-1 survives buildSheetGraph's own finish/equipment passes");
  assert.equal(hit!.kind, "equipment");
});

test("equipment extraction: a bare vocabulary hit on the very next row reads as a NEW header, never borrowed as a nearby required-word source (negative control, the real Fan/Diffuser adjacency shape, Finding 1)", () => {
  // The exact real shape that broke on a first version of this fix: a loose
  // pixel-radius test credited FAN SCHEDULE's own bare ID/DESCRIPTION/
  // MANUFACTURER/MODEL/RPM header row with a REQUIRED word (VOLTAGE/AMPS/…)
  // that actually belonged to a genuinely different, adjacent table right
  // next to it on the same dense sheet. The fix mirrors
  // skipSubHeaderContinuation's own real continuation test instead: a BARE
  // vocabulary hit on the next row reads as that row's OWN new header, not
  // a wrapped unit tier of the row above — stopping the borrow immediately.
  const sched: SheetSpans = {
    key: "fan2.pdf#1", sheet_number: "M14",
    spans: [
      sp("FAN SCHEDULE", 100, 10),
      sp("ID", 0, 40), sp("DESCRIPTION", 100, 40), sp("MANUFACTURER", 300, 40), sp("MODEL", 500, 40), sp("RPM", 650, 40),
      // a genuinely different, adjacent table's own bare header sits right
      // below, tight gap, no data row between — must not be credited as
      // FAN SCHEDULE's own nearby required word
      sp("VOLTAGE PHASE SCHEDULE", 100, 60),
      sp("VOLTAGE", 0, 80), sp("PHASE", 200, 80),
      sp("208", 0, 100), sp("1", 200, 100),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  assert.ok(!tables.some((t) => t.title?.text === "FAN SCHEDULE"), "Fan Schedule not pulled into equipment kind by a neighboring table's own bare required word");
});

test("equipment extraction: data starts after every consumed deep header tier", () => {
  const sched: SheetSpans = {
    key: "deep-chiller.pdf#1", sheet_number: "M7.1",
    spans: [
      sp("CHILLER SCHEDULE (ELECTRIC AIR-COOLED)", 100, 10),
      sp("TAG", 0, 40), sp("TYPE", 180, 40), sp("GPM", 260, 40), sp("MANUFACTURER", 360, 40), sp("REMARKS", 760, 40),
      sp("MINIMUM", 100, 50), sp("DESIGN", 260, 50), sp("STARTER", 500, 50), sp("MAXIMUM", 640, 50),
      sp("NET", 100, 60), sp("WATER", 260, 60), sp("TYPE", 500, 60), sp("KW", 640, 60),
      sp("COOLING", 100, 70), sp("FLOW", 260, 70), sp("VOLTAGE", 500, 70), sp("PHASE", 640, 70),
      sp("TONS", 100, 80), sp("GPM", 260, 80),
      sp("CH-1", 0, 110), sp("AIR COOLED", 180, 110), sp("128.5", 260, 110), sp("ACME", 360, 110), sp("460", 500, 110), sp("3", 640, 110), sp("1", 760, 110),
    ],
  };
  const table = extractAllTables(sched, "equipment").find((candidate) => candidate.rows.some((row) => row.key === "CH-1"));
  assert.ok(table, "the real keyed row is reached after five deep sub-header lines");
  assert.equal(table!.title?.text, "CHILLER SCHEDULE (ELECTRIC AIR-COOLED)");
  assert.deepEqual(table!.rows.map((row) => row.key), ["CH-1"]);
});

// ── accuracy-hardening plan Phase 3 (ledger items 6/7) ──────────────────────
test("headerLabels: a real dotted abbreviation (\"E.S.P\") resolves to its vocabulary word, not three lone letters", () => {
  // Found live on the real federal-mech AHU Unit Schedule's own header —
  // splitting on every non-letter character used to shatter "E.S.P" into
  // "E"/"S"/"P", never the vocabulary word "ESP", so a real AHU/RTU schedule
  // whose only rating-list hit is its own E.S.P column could never qualify.
  const sched: SheetSpans = {
    key: "esp.pdf#1", sheet_number: "M7.1",
    spans: [
      sp("AIR HANDLING UNIT SCHEDULE", 100, 20),
      sp("ID", 100, 50), sp("MANUFACTURER", 200, 50), sp("MODEL", 350, 50), sp("E.S.P", 450, 50), sp("REMARKS", 550, 50),
      sp("AHU-1", 100, 75), sp("DAIKIN", 200, 75), sp("CACICAH", 350, 75), sp("5.00", 450, 75), sp("NOTE", 550, 75),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the table qualifies once E.S.P resolves to ESP");
  assert.ok(tab!.headers.includes("ESP"), `headers: ${tab!.headers.join(" | ")}`);
  assert.equal(tab!.rows[0].cells.ESP.text, "5.00");
});

test("headerLabels: an ordinary trailing abbreviation period (\"NO.\") is left alone, never merged into its neighbor", () => {
  // The acronym-dot strip is deliberately narrow — only a dot strictly
  // between two LONE letters collapses. "NO." (O preceded by N, not its own
  // isolated letter) must still tokenize as NO, exactly as before.
  const sched: SheetSpans = {
    key: "noperiod.pdf#1", sheet_number: "M7.1",
    spans: [
      sp("SCHEDULE", 100, 20),
      sp("ID", 100, 50), sp("MODEL NO.", 250, 50), sp("MANUFACTURER", 450, 50), sp("VOLTAGE", 600, 50),
      sp("A-1", 100, 75), sp("2544", 250, 75), sp("QMARK", 450, 75), sp("120", 600, 75),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "MODEL NO. still resolves to MODEL, unaffected by the acronym-dot fix");
  assert.equal(tab!.rows[0].cells.MODEL.text, "2544");
});

test("headerLabels: a real drafting typo (\"CEILIING FINISH\", a doubled I) still resolves to CEILING, not a silent anchor collision with NORTH", () => {
  // Found live on the real Baker County EOC corpus set's own "ROOM FINISH
  // SCHEDULE" (sheet #27): the drafter's own header literally reads
  // "CEILIING FINISH". Before this fix, "CEILIING" matched no vocabulary
  // word at all, so that column's own real anchor was never introduced —
  // its cells silently landed under the nearest OTHER already-used anchor
  // (measured directly: a real, wrong "NORTH" re-use, since NORTH's own
  // anchor sits at a similar column position two ticks over). All 13 real
  // rows on that sheet had their own real CEILING FINISH value (GYP-1/
  // ACT-1) mislabeled as if it were a second "NORTH" reading.
  const sched: SheetSpans = {
    key: "typo.pdf#1", sheet_number: "A-601",
    spans: [
      sp("ROOM FINISH SCHEDULE", 100, 20),
      sp("NUMBER", 100, 50), sp("ROOM", 200, 50), sp("FLOOR", 350, 50), sp("BASE", 450, 50), sp("NORTH", 550, 50), sp("CEILIING FINISH", 700, 50),
      sp("100", 100, 75), sp("VESTIBULE", 200, 75), sp("RF-1", 350, 75), sp("WB-1", 450, 75), sp("P-2", 550, 75), sp("GYP-1", 700, 75),
    ],
  };
  const tab = extractTable(sched, "room-finish")!;
  assert.ok(tab.headers.includes("CEILING"), `the typo'd header must still resolve to CEILING: ${tab.headers.join(" | ")}`);
  assert.equal(tab.rows[0].cells.CEILING.text, "GYP-1", "the real ceiling value lands in its own real column, not merged into NORTH");
  assert.equal(tab.rows[0].cells.NORTH.text, "P-2", "NORTH keeps its own real value, never overwritten by the ceiling reading");
});

test("columnMapFor: a losing true-nearest collision falls back to its own 'at or right' pick when it carries full support (real baker-county-eoc#27 ROOM FINISH SCHEDULE)", () => {
  // Real bug, found live on baker-county-eoc-bidset.pdf#27: ROOM's own
  // header sits centered well right of ROOM's own left-aligned data (long
  // room-name values, "SECURE VESTIBULE" and similar) — far enough that
  // ROOM's real data-start measures NEARER to NUMBER's own header than to
  // ROOM's own. columnMapFor's true-nearest anchor logic (added for the
  // AREA SERVED/SAV-1 fix) reassigned ROOM's entire, fully-populated
  // column to NUMBER, colliding with NUMBER's own already-claimed cluster
  // — the losing cluster was silently dropped, and ROOM never appears in
  // ANY row's cells at all (not merely a wrong value: entirely missing).
  const hdrY = 20;
  const header = [
    sp("ROOM FINISH SCHEDULE", 100, 0),
    sp("NUMBER", 120, hdrY), sp("ROOM", 550, hdrY), sp("FLOOR", 720, hdrY), sp("BASE", 870, hdrY),
  ];
  const rows = [
    { key: "100", room: "SECURE VESTIBULE", floor: "RF-1", base: "WB-1" },
    { key: "101", room: "OFFICE", floor: "CPT-1", base: "WB-1" },
    { key: "102", room: "CORRIDOR", floor: "CPT-1", base: "WB-1" },
  ];
  const dataSpans = rows.flatMap((r, i) => {
    const y = hdrY + 30 * (i + 1);
    return [sp(r.key, 100, y), sp(r.room, 300, y), sp(r.floor, 700, y), sp(r.base, 850, y)];
  });
  const sheet: SheetSpans = { key: "roomcollision.pdf#1", sheet_number: "A-601", spans: [...header, ...dataSpans] };
  const tab = extractTable(sheet, "room-finish")!;
  assert.ok(tab, "the table still extracts");
  for (const r of rows) {
    const row = tab.rows.find((x) => x.key === r.key)!;
    assert.ok(row, `row ${r.key} extracts`);
    assert.equal(row.cells.ROOM?.text, r.room, `row ${r.key}'s ROOM column recovers, not silently dropped`);
    assert.equal(row.cells.NUMBER?.text, r.key, `row ${r.key}'s own NUMBER is unaffected by the rescue`);
  }
});

test("bandDataRows: a single DATA token straddling two real columns splits at the boundary (real baker-county-eoc#27 room 100, STOREFRONT/P-1)", () => {
  // Real bug, found live on baker-county-eoc-bidset.pdf#27's own ROOM
  // FINISH SCHEDULE: room 100's SOUTH and WEST finish codes, "STOREFRONT"
  // and "P-1", are ONE PDF text run (the drafter's own long glazing-type
  // name, "STOREFRONT", ran right through WEST's own column before the
  // row's next real value even starts) — SOUTH read "STOREFRONT P-1" and
  // WEST came up entirely empty.
  const hdrY = 20;
  const header = [
    sp("ROOM FINISH SCHEDULE", 100, 0),
    sp("NUMBER", 120, hdrY), sp("FLOOR", 270, hdrY), sp("SOUTH", 420, hdrY), sp("WEST", 480, hdrY),
  ];
  const rows: Array<{ key: string; floor: string; merged?: string; south?: string; west?: string }> = [
    { key: "100", floor: "RF-1", merged: "STOREFRONT P-1" },
    { key: "101", floor: "CPT-1", south: "P-1", west: "P-1" },
    { key: "102", floor: "CPT-1", south: "P-1", west: "P-2" },
  ];
  const dataSpans = rows.flatMap((r, i) => {
    const y = hdrY + 30 * (i + 1);
    const out = [sp(r.key, 100, y), sp(r.floor, 250, y)];
    if (r.merged) out.push(sp(r.merged, 400, y));
    else { out.push(sp(r.south!, 400, y)); out.push(sp(r.west!, 460, y)); }
    return out;
  });
  const sheet: SheetSpans = { key: "overflow.pdf#1", sheet_number: "A-601", spans: [...header, ...dataSpans] };
  const tab = extractTable(sheet, "room-finish")!;
  assert.ok(tab, "the table still extracts");
  const r100 = tab.rows.find((r) => r.key === "100")!;
  assert.equal(r100.cells.SOUTH?.text, "STOREFRONT", "SOUTH keeps only its own real word, not the merged run");
  assert.equal(r100.cells.WEST?.text, "P-1", "WEST recovers its own real word, not left empty");
  // ordinary, genuinely separate rows must be unaffected by the split logic
  const r101 = tab.rows.find((r) => r.key === "101")!;
  assert.equal(r101.cells.SOUTH?.text, "P-1");
  assert.equal(r101.cells.WEST?.text, "P-1");
});

test("EQUIPMENT_HEADERS: AIRFLOW/VELOCITY carry real qualifying weight (not just vocabulary), the way a Canopy Hood Schedule needs", () => {
  // Real, found live on itd-d1-lab's own Canopy Hood Schedule: its header's
  // ONLY required-list hits are AIRFLOW and VELOCITY — every other word
  // (SYMBOL/LOCATION/SERVES/EQUIPMENT/REMARKS) is vocabulary but not
  // `required`, exactly like CFM. Unlike CFM (deliberately excluded,
  // too generic), AIRFLOW/VELOCITY/FPM are specific enough to carry the
  // rating bar themselves.
  const sched: SheetSpans = {
    key: "canopy.pdf#1", sheet_number: "M6.1",
    spans: [
      sp("CANOPY HOOD SCHEDULE", 100, 20),
      sp("SYMBOL", 100, 50), sp("LOCATION", 200, 50), sp("AIRFLOW", 440, 50), sp("VELOCITY", 560, 50), sp("EQUIPMENT", 680, 50), sp("REMARKS", 820, 50),
      sp("CH-1", 100, 75), sp("LAB 131", 200, 75), sp("1800", 440, 75), sp("100", 560, 75), sp("HOOD-1", 680, 75), sp("NOTE", 820, 75),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "AIRFLOW/VELOCITY alone are enough to clear the rating bar");
  assert.equal(tab!.rows[0].key, "CH-1");
  assert.equal(tab!.rows[0].cells.AIRFLOW.text, "1800");
  assert.equal(tab!.rows[0].cells.VELOCITY.text, "100");
});

test("tier-descent: a leaf tier diluted by parenthesized unit fragments still descends into when it introduces the table's own catalog anchor (ledger item 6, VOLUME CONTROL BOX SCHEDULE)", () => {
  // Real shape, measured against the real federal-mech corpus: a parent
  // tier (EAT/LAT/EWT/LWT) independently qualifies, and a real leaf tier
  // below it ALSO independently qualifies (TAG/GPM/MANUFACTURER/MODEL/
  // REMARKS) and carries the table's only catalog anchor (TAG) — but the
  // leaf's own ratio (5 hits out of 11 tokens, diluted by real
  // parenthesized unit fragments like "(°F)"/"(NC)"/"(BTU/HR)") falls under
  // the ordinary 0.6 descent bar. Before this fix, the scan settled on the
  // PARENT tier alone, found no catalog anchor there, and the equipment-
  // only hard gate discarded the whole table. After it: the leaf's own
  // independent qualification + its new catalog anchor is accepted as
  // stronger evidence than the ratio, AND the parent tier's own EAT/LAT/
  // EWT/LWT anchors are correctly recovered (not silently dropped as
  // "already covered" merely for sitting inside the leaf anchors' overall
  // x-envelope) since none of them sit close to an actual leaf anchor.
  const sched: SheetSpans = {
    key: "vav.pdf#1", sheet_number: "M7.2",
    spans: [
      sp("VOLUME CONTROL BOX SCHEDULE", 100, 20),
      // parent tier — independently qualifies (EAT is required)
      sp("EAT", 200, 45), sp("LAT", 260, 45), sp("EWT", 320, 45), sp("LWT", 380, 45),
      // leaf tier — independently qualifies too (GPM is required), diluted
      // by real bare unit fragments at the SAME x as their parent label
      sp("TAG", 100, 60),
      sp("(°F)", 200, 60), sp("(°F)", 260, 60), sp("(°F)", 320, 60), sp("(°F)", 380, 60),
      sp("(GPM)", 440, 60), sp("(BTU/HR)", 500, 60),
      sp("MANUFACTURER", 560, 60), sp("MODEL", 660, 60), sp("REMARKS", 760, 60),
      // one real data row
      sp("VAV-1", 100, 85),
      sp("55", 200, 85), sp("95", 260, 85), sp("140", 320, 85), sp("110", 380, 85),
      sp("1.1", 440, 85), sp("15400", 500, 85),
      sp("PRICE", 560, 85), sp("SDV", 660, 85), sp("NOTE", 760, 85),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the leaf tier's own catalog anchor (TAG) is enough to accept the table despite the low ratio");
  assert.deepEqual(tab!.rows.map((r) => r.key), ["VAV-1"]);
  const cells = tab!.rows[0].cells;
  assert.equal(cells.TAG.text, "VAV-1", "TAG's own column bands its own value, not glued to a neighbor");
  assert.equal(cells.EAT.text, "55", "the parent tier's EAT anchor is recovered, not dropped as merely inside the leaf's x-envelope");
  assert.equal(cells.LAT.text, "95");
  assert.equal(cells.EWT.text, "140");
  assert.equal(cells.LWT.text, "110");
  assert.equal(cells.MANUFACTURER.text, "PRICE");
  assert.equal(cells.MODEL.text, "SDV");
});

test("equipment extraction: a lone digit-free footnote/legend word never mints a garbage row, but an equally sparse real tag row survives (ledger item 29)", () => {
  // Real shape, measured against the real itd-d1-lab corpus (Exhaust Fan/
  // Electric Heater/Bypass Control Valve/AC schedules): a schedule's own
  // trailing "REMARKS:" footnote-legend label survives as its OWN
  // one-populated-cell garbage row (row key "REMARKS", the same shape a
  // stray sub-header word or a title-block/revision-log fragment also
  // takes there). But a real tag can be JUST as sparse in its own right —
  // found live as "PH-1", a real portable-heater tag bled in from some
  // OTHER, unrecognized schedule, landing as a lone orphan with no other
  // cell data of its own — and must never be discarded the same way. The
  // fix keys off whether the row's OWN key carries a digit, not cell count
  // alone, so a real digit-bearing tag survives no matter how sparse it is.
  const sched: SheetSpans = {
    key: "efan.pdf#1", sheet_number: "M6.2",
    spans: [
      sp("EXHAUST FAN SCHEDULE", 100, 20),
      sp("SYMBOL", 100, 50), sp("CFM", 200, 50), sp("ESP", 300, 50), sp("MANUFACTURER", 400, 50), sp("REMARKS", 600, 50),
      sp("EF-1", 100, 125), sp("245", 200, 125), sp("0.375", 300, 125), sp("COOK", 400, 125), sp("1,2", 600, 125),
      sp("EF-2", 100, 150), sp("245", 200, 150), sp("0.375", 300, 150), sp("COOK", 400, 150), sp("1,2", 600, 150),
      // the schedule's own trailing footnote/legend header — digit-free,
      // exactly one cell of its own
      sp("REMARKS:", 100, 200),
      // a real, digit-bearing tag, just as sparse (also exactly one cell)
      sp("PH-1", 100, 225),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the real EF rows are enough to clear the bar");
  const keys = tab!.rows.map((r) => r.key);
  assert.ok(!keys.includes("REMARKS"), `the trailing digit-free "REMARKS:" footnote label must not mint a row: ${keys.join(",")}`);
  assert.ok(keys.includes("EF-1") && keys.includes("EF-2"), "the real EF rows are untouched");
  assert.ok(keys.includes("PH-1"), "a real, digit-bearing tag is kept even when just as sparse as the noise around it");
});

test("EQUIPMENT_REQUIRED: a real equipment schedule whose rating spec sits in free text, not its own column header, still qualifies as equipment (real MECHANICAL SPECIALTY EQUIPMENT SCHEDULE, AS-1/ET-1/FM-1/PF-1)", () => {
  // Real, found live on itd-d1-lab-mechanical.pdf#14: this table's own real
  // headers are SYMBOL/EQUIPMENT DESCRIPTION/SYSTEM SERVED/DESCRIPTION/
  // MANUFACTURER AND MODEL — no VOLTAGE/GPM/HP/etc. column exists at all;
  // the real rating numbers ("DESIGN FLOW IS 80 GPM WITH A DESIGN PD OF 1.0
  // FT-H2O.") sit inside the free-text DESCRIPTION cell's own paragraph,
  // never heading a column of their own. Before "EQUIPMENT" joined
  // `required`, this table's only path to qualifying as equipment-kind was
  // a rating-word COLUMN HEADER that this table structurally never has, so
  // it fell back to finish-kind (SYMBOL/DESCRIPTION/MANUFACTURER also
  // clears FINISH_REQUIRED) and was silently skipped by buildPlanSetTakeoff
  // (kind !== "equipment"). The fix: "EQUIPMENT" itself, already vocabulary,
  // promoted to `required` — the table's own "EQUIPMENT DESCRIPTION" column
  // is real, self-describing evidence of an equipment schedule that
  // generalizes past this one corpus (see EQUIPMENT_REQUIRED's own comment
  // for the corpus-wide check that no real finish-kind table anywhere in
  // this project's evidence base carries the word).
  const sched: SheetSpans = {
    key: "msc.pdf#1", sheet_number: "M6.2",
    spans: [
      sp("MECHANICAL SPECIALTY EQUIPMENT SCHEDULE", 100, 20),
      sp("SYMBOL", 100, 50), sp("EQUIPMENT DESCRIPTION", 220, 50), sp("SYSTEM SERVED", 420, 50), sp("DESCRIPTION", 600, 50), sp("MANUFACTURER AND MODEL", 900, 50),
      sp("AS-1", 100, 75), sp("AIR SEDIMENT SEPARATOR", 220, 75), sp("HOT WATER LOOP", 420, 75), sp("DESIGN FLOW IS 80 GPM WITH A DESIGN PD OF 1.0 FT-H2O.", 600, 75), sp("B & G MODEL SRS-3F", 900, 75),
      sp("ET-1", 100, 100), sp("EXPANSION TANK", 220, 100), sp("HOT WATER LOOP", 420, 100), sp("7.8 GALLON CAPACITY, ACCEPTANCE 6.3 GALLONS.", 600, 100), sp("B & G MODEL D-15", 900, 100),
      sp("FM-1", 100, 125), sp("FLOW METER", 220, 125), sp("HOT WATER LOOP", 420, 125), sp("HYDRONIC FLOW METER", 600, 125), sp("ONICON MODEL F-3500", 900, 125),
      sp("PF-1", 100, 150), sp("POT FEEDER", 220, 150), sp("HOT WATER LOOP", 420, 150), sp("CHEMICAL POT FEEDER", 600, 150), sp("AXIOM MODEL CPF-5", 900, 150),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "a sparse SYMBOL/EQUIPMENT DESCRIPTION/.../MANUFACTURER header, with EQUIPMENT itself as a real column word, is enough to clear the equipment bar");
  assert.deepEqual(tab!.rows.map((r) => r.key), ["AS-1", "ET-1", "FM-1", "PF-1"]);
  assert.ok(tab!.headers.includes("EQUIPMENT"), `EQUIPMENT itself is a real, anchored column: ${tab!.headers.join(", ")}`);

  // The whole-graph builder must resolve the resulting cross-kind collision
  // (this same sparse header also clears FINISH_REQUIRED's own bar) in
  // favor of the richer equipment-kind read — not silently keep both, and
  // not silently keep only the poorer finish-kind one.
  const graph = buildSheetGraph([sched]);
  assert.equal(graph.tables.length, 1, "the cross-kind collision collapses to ONE logical table");
  assert.equal(graph.tables[0].kind, "equipment", "equipment-kind (4 real headers) wins over finish-kind (3) as the richer read");
});

test("EQUIPMENT_REQUIRED: a real finish/material table with the SAME sparse SYMBOL/MANUFACTURER/REMARKS shape stays finish-kind — EQUIPMENT alone never flips it (negative control)", () => {
  // The direct negative control for the fix above: a genuinely non-
  // equipment schedule (real itd-d1-lab-mechanical.pdf#14's own SOUND
  // ATTENUATOR SCHEDULE — the exact sparse SYMBOL/MANUFACTURER/REMARKS
  // shape a real finish/material schedule and a real sparse equipment
  // schedule can both legitimately have) whose title and header never
  // mention "EQUIPMENT" at all must NOT be pulled over the equipment bar
  // just because it independently carries 3+ FINISH/EQUIPMENT_HEADERS-
  // shared vocabulary words (SYMBOL/MANUFACTURER/REMARKS, all real words
  // both vocabularies recognize). The fix is scoped to the literal word
  // "EQUIPMENT" appearing as its own real column — a table that never
  // carries that word has no path through the new `required` entry.
  const sched: SheetSpans = {
    key: "attenuator.pdf#1", sheet_number: "M6.3",
    spans: [
      sp("SOUND ATTENUATOR SCHEDULE", 100, 20),
      sp("SYMBOL", 100, 50), sp("MANUFACTURER", 220, 50), sp("REMARKS", 400, 50),
      sp("SA-1", 100, 75), sp("VIBRO-ACOUSTICS SILENCER", 220, 75), sp("1,2", 400, 75),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.equal(tab, null, "no bare EQUIPMENT column, no CATALOG_ANCHOR_WORDS rating word — a real sound attenuator schedule never qualifies as equipment-kind");
  const tabF = extractTable(sched, "finish");
  assert.ok(tabF, "the same real table still reads correctly as finish-kind");
  assert.deepEqual(tabF!.rows.map((r) => r.key), ["SA-1"]);

  const graph = buildSheetGraph([sched]);
  assert.equal(graph.tables.length, 1);
  assert.equal(graph.tables[0].kind, "finish", "stays finish-kind — EQUIPMENT's own promotion to `required` never flips an unrelated sparse table");
});

test("twin-column tiers: two same-shaped sub-columns under DIFFERENT non-vocabulary parents stay separate, not merged into one corrupted column (ledger item 29, real HUMIDIFIER SCHEDULE)", () => {
  // Real shape, measured against the real itd-d1-lab-mechanical.pdf#13
  // "HUMIDIFIER SCHEDULE": two leaf sub-columns both read "TEMP." — one
  // under "OUTSIDE AIR", one under "ENTERING (AIR)" — real parent phrases
  // that name nothing in EQUIPMENT_HEADERS' own vocabulary. Before this
  // fix, subTierAnchors' only signal for "these belong to one merged
  // parent" was gap distance between adjacent loose tokens — indistinguish-
  // able from "these are two independent columns that just happen to sit
  // near each other on the page" when there are only two of them (a single
  // gap sample can never be bigger than 3× itself). The combined-interval
  // parent search then found no COVERING vocabulary word for the whole
  // span and gave up on both, so real AMPS data ("2.7") ended up sharing a
  // cell with 68 and 74 — someone reading "AMPS: 2.7 68 74" cannot tell
  // which number is really the amperage.
  const sched: SheetSpans = {
    key: "humid.pdf#1", sheet_number: "M13",
    spans: [
      sp("HUMIDIFIER SCHEDULE", 100, 20),
      // parent tier: two real, non-vocabulary phrases naming the two
      // sub-columns below — not a single merged parent over both
      sp("OUTSIDE AIR", 480, 50), sp("ENTERING", 600, 50),
      // leaf tier: real vocabulary anchors (SYMBOL/CFM/MBH/AMPS) plus the
      // two ambiguous, identically-labelled, non-vocabulary sub-columns
      sp("SYMBOL", 100, 70), sp("CFM", 200, 70), sp("MBH", 300, 70), sp("AMPS", 400, 70),
      sp("TEMP.", 480, 70), sp("TEMP.", 600, 70), sp("MANUFACTURER", 750, 70),
      sp("HUM-1", 100, 95), sp("500", 200, 95), sp("30", 300, 95), sp("2.7", 400, 95),
      sp("68", 480, 95), sp("74", 600, 95), sp("CAREL", 750, 95),
    ],
  };
  const tab = extractTable(sched, "equipment")!;
  assert.ok(tab, "the real vocabulary anchors are enough to clear the bar");
  assert.ok(tab.headers.includes("OUTSIDE AIR TEMP."), `each sub-column keeps its own real parent: ${tab.headers.join(" | ")}`);
  assert.ok(tab.headers.includes("ENTERING TEMP."), `each sub-column keeps its own real parent: ${tab.headers.join(" | ")}`);
  const row = tab.rows.find((r) => r.key === "HUM-1")!;
  assert.equal(row.cells.AMPS.text, "2.7", "the real amperage is never shared with a neighbouring sub-column's own value");
  assert.equal(row.cells["OUTSIDE AIR TEMP."].text, "68");
  assert.equal(row.cells["ENTERING TEMP."].text, "74");
});

test("anchorRadii: an anomalously wide anchor gap refuses a real un-modeled neighbour's data instead of crediting it (ledger item 57, real BYPASS CONTROL VALVE SCHEDULE)", () => {
  // Real shape, measured against the real itd-d1-lab-mechanical.pdf#13
  // "BYPASS CONTROL VALVE SCHEDULE": 5 of its 13 real leaf columns (SERVES,
  // VALVE TYPE, OPERATION, FLUID, FLOW RANGE (GPM)) have no representative
  // in EQUIPMENT_HEADERS, so their real data bled into whichever recognized
  // anchor sat nearest — real, measured, BCV-1's own GPM cell read "100%
  // WATER 25 19-110 2.7 INDEPENDENT MODULATING" (six real values from five
  // different real columns). Gap ratios below mirror the real table's own
  // (SYMBOL→GPM 854px, GPM→SIZE 504px, SIZE→MANUFACTURER 431px,
  // MANUFACTURER→REMARKS 225px — the last pair the table's own real
  // "nothing un-modeled here" baseline), scaled down for a readable fixture.
  const sched: SheetSpans = {
    key: "bcv.pdf#1", sheet_number: "M13",
    spans: [
      sp("BYPASS CONTROL VALVE SCHEDULE", 100, 20),
      sp("SYMBOL", 0, 50), sp("GPM", 340, 50), sp("SIZE", 540, 50), sp("MANUFACTURER", 730, 50), sp("REMARKS", 830, 50),
      // the real row: SYMBOL and GPM's own real value sit AT their anchors;
      // SERVES/VALVE TYPE/FLUID/FLOW RANGE have no anchor of their own and
      // sit in the wide, un-modeled gaps between SYMBOL/GPM/SIZE
      sp("BCV-1", 0, 80),
      sp("HEATING-SYS", 110, 80), sp("PRESS-IND", 200, 80), sp("WATER", 280, 80),
      sp("25", 340, 80),
      sp("19-110", 420, 80),
      sp("2.0", 540, 80),
      sp("ACME", 730, 80),
      sp("1,2,3", 830, 80),
    ],
  };
  const tab = extractTable(sched, "equipment")!;
  assert.ok(tab, "the real vocabulary anchors are enough to clear the bar");
  const row = tab.rows.find((r) => r.key === "BCV-1")!;
  assert.equal(row.cells.SYMBOL.text, "BCV-1", "SYMBOL keeps its own value, not SERVES' bled-in text");
  assert.equal(row.cells.GPM.text, "25", "GPM keeps its own real value, not FLUID/FLOW RANGE's bled-in text");
  assert.equal(row.cells.SIZE.text, "2.0", "SIZE keeps its own real value, un-polluted");
  assert.equal(row.cells.MANUFACTURER.text, "ACME");
  assert.equal(row.cells.REMARKS.text, "1,2,3");
  // the un-modeled columns' own real data is withheld, not silently dropped
  // from evidence AND not corrupting a neighbour — it simply names no cell
  for (const c of Object.values(row.cells)) {
    assert.ok(!/HEATING-SYS|PRESS-IND|WATER|19-110/.test(c.text), `no un-modeled column's data bled into ${JSON.stringify(c.text)}`);
  }
});

test("buildSheetGraph: a table qualifying under BOTH finish and equipment vocabularies extracts once, not twice (real regression, itd-d1-lab-mechanical.pdf#13's BYPASS CONTROL VALVE SCHEDULE)", () => {
  // Real, found live running the new project-level takeoff pipeline: this
  // exact table's real headers (SYMBOL/SIZE/MANUFACTURER/REMARKS) clear
  // FINISH_HEADERS' own bar on their own, while the FULLER real header set
  // (those plus GPM) separately clears EQUIPMENT_HEADERS' — so buildSheetGraph's
  // own pass-1 per-kind loop extracted the SAME physical table twice, once
  // under each kind, both with the same real BCV-1 row. Nothing downstream
  // expected two fragments for one table: sweep_schedule_row's row-key
  // lookup threw a genuine "ambiguous: 2 rows carry this key" for a table
  // that only has ONE real row. Same fixture as the anchorRadii test above
  // (same real gap ratios), run through buildSheetGraph (not extractTable
  // directly) so the cross-kind duplication actually reproduces.
  const sched: SheetSpans = {
    key: "bcv.pdf#1", sheet_number: "M13",
    spans: [
      sp("BYPASS CONTROL VALVE SCHEDULE", 100, 20),
      sp("SYMBOL", 0, 50), sp("GPM", 340, 50), sp("SIZE", 540, 50), sp("MANUFACTURER", 730, 50), sp("REMARKS", 830, 50),
      sp("BCV-1", 0, 80),
      sp("HEATING-SYS", 110, 80), sp("PRESS-IND", 200, 80), sp("WATER", 280, 80),
      sp("25", 340, 80),
      sp("19-110", 420, 80),
      sp("2.0", 540, 80),
      sp("ACME", 730, 80),
      sp("1,2,3", 830, 80),
    ],
  };
  const g = buildSheetGraph([sched]);
  const hits = g.tables.filter((t) => t.rows.some((r) => r.key === "BCV-1"));
  assert.equal(hits.length, 1, `exactly one table should carry BCV-1, found ${hits.length} (${hits.map((t) => t.kind).join(", ")}) — a real row-key collision, not a legitimate second table`);
  assert.equal(hits[0].kind, "equipment", "the richer (more headers, more populated cells) extraction wins, not whichever kind happened to run first");
  const row = hits[0].rows.find((r) => r.key === "BCV-1")!;
  assert.equal(row.cells.GPM.text, "25", "the richer equipment-kind row's own real GPM value survives the collapse");
});

test("anchorRadii: REMARKS/DESCRIPTION/NAME keep their own deliberately wide reach — never capped by this mechanism (real regression, wide REMARKS test)", () => {
  // The exact real shape that broke on a first version of this fix: a
  // genuinely wide gap to a WIDE_LAST column (REMARKS/DESCRIPTION/NOTES) or
  // a NAME key column is deliberate, existing behavior (bandLimits' own
  // rightMargin/leftMargin) — not a hidden un-modeled column. This must
  // never be capped by anchorRadii; the dedicated "wide REMARKS" test above
  // in this file already pins the full real shape end to end — this is a
  // narrower, minimal repro of just the anchorRadii interaction.
  const sched: SheetSpans = {
    key: "wide2.pdf#1", sheet_number: "M14",
    spans: [
      sp("SOME SCHEDULE", 100, 10),
      sp("SYMBOL", 0, 40), sp("SIZE", 60, 40), sp("REMARKS", 500, 40),
      sp("EF-1", 0, 70), sp("10IN", 60, 70),
      rsp("A LONG WRAPPED REMARK THAT SITS FAR RIGHT OF THE OTHER COLUMNS", 500, 74),
    ],
  };
  const tab = extractTable(sched, "finish")!;
  assert.ok(tab, "the table is found");
  const row = tab.rows.find((r) => r.key === "EF-1")!;
  assert.match(row.cells.REMARKS.text, /LONG WRAPPED REMARK/, "REMARKS' own deliberately wide gap is never capped");
});

test("bandLimits: a genuine median for an even gap count, not always the upper-middle one (real itd-d1-lab-mechanical.pdf#14 SOUND ATTENUATOR SCHEDULE — SA-1 keyed SILENCER)", () => {
  // Real shape, measured against the real itd-d1-lab-mechanical.pdf#14
  // "SOUND ATTENUATOR SCHEDULE": only 3 of its 21 real leaf columns clear
  // FINISH_HEADERS (SYMBOL/MANUFACTURER/REMARKS), so the two anchor gaps
  // are hugely lopsided — SYMBOL→MANUFACTURER spans 18 real, un-modeled
  // columns (1740px), MANUFACTURER→REMARKS spans none (278px, the table's
  // own real "nothing un-modeled here" baseline). `bandLimits`' old
  // `gaps[gaps.length >> 1]` picked index 1 of the 2-element sorted gap
  // array — the LARGER gap — as "medGap" every time a table has exactly 2
  // gaps (3 anchors), never a real median. That inflated `leftMargin`
  // (`medGap / 2`) enough that the table's own x0 boundary reached past a
  // NEIGHBOURING table's unrelated column (the Electric Heater Schedule's
  // own REMARKS "1 , 3 , 5", sitting at a coincidentally near-identical y)
  // and let it into this table's row band. Landing left of the real SA-1
  // tag in x-order, it became the row's leading token; since it isn't
  // key-shaped, the WHOLE real row read as an orphan and re-merged under
  // the table's own "DUCT" row (this fixture's stand-in for the real
  // table's own wrapped-TYPE-cell "SILENCER" — a stray CODE_RE-shaped
  // word from an unrecognized neighbour column), corrupting BOTH the row's
  // key and its SYMBOL cell. Scaled-down gaps below mirror the real
  // table's own ratio (~6.3:1) exactly.
  const sched: SheetSpans = {
    key: "sa.pdf#1", sheet_number: "M14",
    spans: [
      sp("SOUND ATTENUATOR SCHEDULE", 100, 10),
      sp("SYMBOL", 0, 40), sp("MANUFACTURER", 700, 40), sp("REMARKS", 820, 40),
      // the table's own wrapped, unrecognized TYPE cell — a stray
      // CODE_RE-shaped word close enough to SYMBOL to be credited to it
      // (real stand-in: "SILENCER", the 2nd line of "DUCT SILENCER")
      sp("DUCT", 50, 70),
      // a NEIGHBOURING table's own unrelated column value, sitting at the
      // real data row's own y — real stand-in: the Electric Heater
      // Schedule's own REMARKS "1 , 3 , 5", which independently fails
      // rowKeyOf (spaces/commas) and so cannot mint its own row
      sp("1 , 3 , 5", -150, 80),
      // the real data row: SA-1's own tag, sitting well within a properly
      // (not anomalously) sized left margin of SYMBOL
      sp("SA-1", 0, 80), sp("ACOUSTICO", 700, 80), sp("1,2", 820, 80),
    ],
  };
  const tab = extractTable(sched, "finish")!;
  assert.ok(tab, "the real vocabulary anchors are enough to clear the bar");
  const keys = tab.rows.map((r) => r.key);
  assert.ok(keys.includes("SA-1"), `SA-1 keys its own row rather than being swallowed as an orphan: ${keys.join(",")}`);
  assert.ok(!keys.includes("SILENCER") && keys.every((k) => !/SA-1/.test(k) || k === "SA-1"), `no row is keyed by the neighbouring table's stray token or a merge of it with SA-1: ${keys.join(",")}`);
  const row = tab.rows.find((r) => r.key === "SA-1")!;
  assert.equal(row.cells.SYMBOL.text, "SA-1", "SYMBOL holds only SA-1's own tag, not the wrapped TYPE cell's word merged onto it");
  assert.equal(row.cells.MANUFACTURER.text, "ACOUSTICO");
  assert.equal(row.cells.REMARKS.text, "1,2");
  // the table's own wrapped TYPE-cell noise still mints its own row (a
  // separate, disclosed, pre-existing limitation — finish-kind tables get
  // no digit-free garbage-row filter) but must stay UNMERGED with SA-1's
  const ductRow = tab.rows.find((r) => r.key === "DUCT");
  if (ductRow) assert.equal(ductRow.cells.SYMBOL?.text, "DUCT", "the stray TYPE-wrap word is never joined with SA-1's own real data");
});

test("extractAllTables: a real table whose own header/boundary is found but every row filters as garbage does not stop the scan of the REST of the sheet (real itd-d1-lab-mechanical.pdf#13 regression)", () => {
  // Real, found live through the Agent UI, same demo-loop session as the
  // twin-column-tier fix above: on the real itd-d1-lab-mechanical.pdf#13,
  // a genuine header/boundary was found for a "LAB EXHAUST FAN SCHEDULE"
  // candidate whose only two real "rows" are both digit-free noise (keyed
  // "FAN"/"REMARKS", no real device). The digit-free garbage-row filter
  // (ledger item 29/53) correctly empties that candidate down to zero real
  // rows — but `extractTableAt` used to signal that with a bare `null`,
  // indistinguishable from "no header exists here at all", so
  // `extractAllTables`'s own loop (`if (!found) break`) stopped scanning
  // the ENTIRE REST of the sheet, silently dropping the real "BYPASS
  // CONTROL VALVE SCHEDULE" that sat right after it. Real, measured
  // corpus-wide effect of the fix: itd-d1-lab-mechanical.pdf alone went
  // from 10 real tables/35 rows to 16 tables/70 rows — three whole real
  // schedules (DIFFUSER, SOUND ATTENUATOR, PENTHOUSE) were being silently
  // dropped this same way elsewhere on the same set. Every OTHER real
  // corpus set (bessemer, federal-mech, weld-county, tarrant-county,
  // baker-county-eoc) measured byte-for-byte unchanged (checked directly
  // via `git stash`, not assumed).
  const sched: SheetSpans = {
    key: "gap.pdf#1", sheet_number: "M13",
    spans: [
      // table 1 — real, findable (ESP is a real qualifying/`required` word;
      // CFM alone would not independently qualify this header at all)
      sp("EXHAUST FAN SCHEDULE", 100, 20),
      sp("SYMBOL", 100, 50), sp("CFM", 200, 50), sp("ESP", 300, 50), sp("MANUFACTURER", 400, 50), sp("REMARKS", 550, 50),
      sp("EF-1", 100, 75), sp("245", 200, 75), sp("0.375", 300, 75), sp("COOK", 400, 75), sp("1,2", 550, 75),
      // table 2 — a genuine header/boundary, but BOTH candidate rows are
      // digit-free noise (mirrors the real "FAN"/"REMARKS" shape exactly):
      // this must empty to zero rows, not swallow the rest of the sheet
      sp("BYPASS CONTROL VALVE SCHEDULE", 100, 130),
      sp("SYMBOL", 100, 160), sp("GPM", 200, 160), sp("SIZE", 300, 160), sp("REMARKS", 500, 160),
      sp("FAN", 100, 185),
      sp("REMARKS:", 100, 210),
      // table 3 — real, must still be found even though table 2 emptied out
      sp("AIR COMPRESSOR SCHEDULE", 100, 260),
      sp("SYMBOL", 100, 290), sp("GPM", 200, 290), sp("SIZE", 300, 290), sp("REMARKS", 500, 290),
      sp("AC-1", 100, 315), sp("500", 200, 315), sp("6\"", 300, 315), sp("1", 500, 315),
    ],
  };
  const tabs = extractAllTables(sched, "equipment");
  const titles = tabs.map((t) => t.title?.text);
  assert.ok(titles.includes("EXHAUST FAN SCHEDULE"), `table 1 survives: ${titles.join(" | ")}`);
  assert.ok(titles.includes("AIR COMPRESSOR SCHEDULE"), `table 3, AFTER the all-garbage table 2, must still be found — this is the real regression: ${titles.join(" | ")}`);
  assert.ok(!titles.includes("BYPASS CONTROL VALVE SCHEDULE"), "table 2's own all-garbage candidate correctly produces NO table, not a fake empty one");
  const ac1 = tabs.find((t) => t.title?.text === "AIR COMPRESSOR SCHEDULE")!.rows.find((r) => r.key === "AC-1");
  assert.equal(ac1?.cells.GPM.text, "500");
});

test("equipment extraction: a digit-free garbage row with MORE than one populated cell is still dropped (ledger item 29, real AIR COMPRESSOR SCHEDULE)", () => {
  // Real shape, found live on itd-d1-lab-mechanical.pdf#28: the original
  // fix for this ledger item only ever dropped a 1-cell digit-free garbage
  // row. On the real corpus, a completely unrelated content block on the
  // same sheet (a plumbing-calculations summary, a gas-sizing chart) bled
  // in as its OWN 2-4-cell garbage rows keyed "REMARKS"/"SYMBOL"/"TOTAL" —
  // digit-free exactly like the already-known garbage shape, but with
  // enough stray cells to sail past the old 1-cell floor. The real AC-1
  // row (7 of 9 real columns populated below) must survive regardless.
  const sched: SheetSpans = {
    key: "aircomp.pdf#1", sheet_number: "P6.0",
    spans: [
      sp("AIR COMPRESSOR SCHEDULE", 100, 20),
      sp("SYMBOL", 100, 50), sp("HP", 200, 50), sp("RPM", 300, 50), sp("MANUFACTURER", 400, 50), sp("MODEL", 550, 50), sp("REMARKS", 700, 50),
      // the real row: 6 of 6 real columns populated
      sp("AC-1", 100, 75), sp("7.5", 200, 75), sp("3530", 300, 75), sp("GARDNER DENVER", 400, 75), sp("BENVS15D-Q", 550, 75), sp("1,2", 700, 75),
      // three real garbage rows bled in from an unrelated block on the same
      // sheet — digit-free keys, 2 cells each (under half of this fixture's
      // own 6 real columns, mirroring the real corpus's under-half ratio),
      // all well past the old 1-cell-only floor
      sp("REMARKS:", 100, 110), sp("APPROVED ALTERNATE MANUFACTURERS", 200, 110),
      sp("SYMBOL", 100, 135), sp("PLUMBING CALCULATIONS", 400, 135),
      sp("TOTAL", 100, 160), sp("2,262.5", 200, 160),
    ],
  };
  const tab = extractTable(sched, "equipment")!;
  assert.ok(tab, "the real AC-1 row alone is enough to clear the bar");
  const keys = tab!.rows.map((r) => r.key);
  assert.deepEqual(keys, ["AC-1"], `every digit-free multi-cell garbage row must be dropped, real row kept: ${keys.join(",")}`);
  assert.equal(tab.rows[0].cells.MANUFACTURER.text, "GARDNER DENVER");
});

test("title-hunt: a real title survives a neighboring table's own unrelated rows sharing its y-band (ledger item 5)", () => {
  // Real bug, found live on itd-d1-lab-mechanical.pdf#13: the real
  // "HUMIDIFIER SCHEDULE" title sits well above its own header, but a
  // SEPARATE "CONDENSING HOT WATER BOILER SCHEDULE" table sits to the LEFT
  // on the same sheet, and its own sub-header/data rows land at nearly the
  // same y-values, purely by coincidence — each becomes its own row index in
  // the sheet-wide `rows` array. A raw row-INDEX lookback cap burns its
  // whole budget on those unrelated LEFT-side rows and never reaches the
  // real title. Mirrors the real shape: 6 unrelated rows (a different
  // table's own header/unit/data fragments, all at x=100, well outside this
  // table's own column band) sit between the real title and this table's
  // own header — enough to exhaust the old 5-row raw cap, but every one of
  // them has nothing in this table's own x-band, so the fixed, content-aware
  // budget skips them for free and still reaches the real title.
  const sched: SheetSpans = {
    key: "humidifier.pdf#1", sheet_number: "M6.2",
    spans: [
      sp("HUMIDIFIER SCHEDULE", 600, 10),
      // the unrelated LEFT table's own rows, sharing y-bands with nothing of
      // this table's own — each a distinct row, none in [x0,x1] below
      sp("STEAM", 100, 20), sp("GAS", 100, 30), sp("ELECTRIC", 100, 40),
      sp("(°F)", 100, 50), sp("CAPACITY", 100, 60), sp("B-1", 100, 70),
      sp("SYMBOL", 600, 100), sp("MBH", 700, 100), sp("AMPS", 800, 100), sp("CFM", 900, 100), sp("MANUFACTURER", 1000, 100), sp("MODEL", 1150, 100), sp("REMARKS", 1300, 100),
      sp("HUM-1", 600, 125), sp("30", 700, 125), sp("5", 800, 125), sp("200", 900, 125), sp("AAON", 1000, 125), sp("XYZ", 1150, 125), sp("1,2", 1300, 125),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the real header still qualifies");
  assert.equal(tab!.title?.text, "HUMIDIFIER SCHEDULE", `title-hunt must not settle for one of the unrelated LEFT table's own row fragments: got ${JSON.stringify(tab!.title)}`);
});

test("a free-text FINISH LEGEND never mints a phantom finish table (real baker-county-eoc#27)", () => {
  // Real bug, found live on baker-county-eoc-bidset.pdf#27: a real ROOM
  // FINISH SCHEDULE sits beside the sheet's own free-text finish LEGEND
  // (ACCESSORIES/BASE & TRIM/CEILING/FLOORING/WALLS — per-material spec
  // prose like "STYLE: LVT", "COLLECTION: iD LATITUDE STONE & CONCRETE",
  // "MANUFACTURER: ALTRO TEGULIS"). That legend's own field-label prose uses
  // the SAME words FINISH_HEADERS needs to recognize a real schedule column
  // (STYLE/MANUFACTURER/ID/COLOR/...), and row-clustering glommed several
  // unrelated legend entries sharing a y-band into one row — `qualifies()`
  // fired on it as a real header, extracting a 5-row garbage "finish" table
  // with a blank title (there never was a real title — this was never a
  // table) whose cells bled the real ROOM FINISH SCHEDULE's own text in from
  // next door. Mirrors the exact real shape: a legend "row" fusing a bare
  // "STYLE:" label with two "label: value" prose spans and an unrelated
  // trailing sentence, at a y untouched by the real room-finish table.
  const sheet: SheetSpans = {
    key: "legend.pdf#1", sheet_number: "A631",
    spans: [
      sp("ROOM FINISH SCHEDULE", 1000, 10),
      sp("NO", 1000, 40), sp("NAME", 1100, 40), sp("FLOOR", 1200, 40), sp("BASE", 1300, 40),
      sp("100", 1000, 60), sp("OFFICE", 1100, 60), sp("CPT-1", 1200, 60), sp("RB-1", 1300, 60),
      // the free-text finish legend, unrelated material entries glommed onto one row by y-coincidence
      sp("STYLE:", 100, 200),
      sp("COLLECTION: iD LATITUDE STONE & CONCRETE", 200, 200),
      sp("MANUFACTURER: ALTRO TEGULIS", 500, 200),
      sp("HARDBOARD, PARTICLEBOARD, FIBER REINFORCED GYPSUM, FIBER", 800, 200),
      // a second legend "row" below it — a bare section label, real prose,
      // not schedule data, but pre-fix its digit-free word alone passes
      // rowKeyOf's CODE_RE and mints a phantom keyed row (real, measured:
      // this exact word — "CEILING" — was one of the real garbage keys)
      sp("CEILING", 100, 220),
    ],
  };
  assert.equal(extractTable(sheet, "finish"), null, "the legend prose must never qualify as a finish table header");
  const rf = extractTable(sheet, "room-finish");
  assert.ok(rf, "the real, unrelated room-finish table is untouched by the fix");
  assert.equal(rf!.rows.length, 1);
  assert.equal(rf!.rows[0].cells.FLOOR?.text, "CPT-1");
});

// ── ledger item 63: a real LUMINAIRE SCHEDULE, TYPE-keyed ───────────────────
test("a real LUMINAIRE SCHEDULE (TYPE-keyed, no ID/MARK/CODE/SYMBOL/TAG column) extracts deterministically, no cross-row bleed (ledger item 63, real baker-county-eoc#59)", () => {
  // Real bug, found live on baker-county-eoc-bidset.pdf#59: a genuine 13-
  // column electrical/lighting schedule (TYPE/DESCRIPTION/MOUNTING/CCT-CRI/
  // WATTS/DELIVERED LUMENS/DRIVER/DIMMING/VOLTAGE/LENS-RELECTOR-BEAM/FINISH/
  // MANUFACTURER SERIES/NOTES) had NO deterministic find_schedule/
  // read_schedule support at all — no ID/MARK/CODE/SYMBOL/TAG column exists
  // on this table; every real row keys under "TYPE" instead (E1, E2, P1,
  // R1-R3, S1, S3, V1, X1), a real, standard MEP row-key convention this
  // vocabulary had no representative for. A live agent fell back to
  // manually assembling the table from raw text and got ONE cell wrong this
  // way: V1's own MANUFACTURER SERIES misread as X1's ("LITHONIA LIGHTING -
  // EDGR SERIES" instead of V1's own real "EUREKA - MOONRISE SERIES") —
  // confirmed by direct render. Mirrors the real shape at reduced scale:
  // same 13 headers, same 10 real row keys in sheet order, V1 and X1
  // adjacent (the exact real cross-row-bleed shape) with DIFFERENT real
  // MANUFACTURER SERIES values, plus a "SHEET NOTES" side panel (a lettered
  // paragraph block, real prose, not this table's data) sitting close right
  // of the table — the real title-block-adjacent shape that motivated
  // excluding "NOTES" from WIDE_LAST for this table.
  const hdrY = 20;
  const cols: Array<[string, number]> = [
    ["TYPE", 100], ["DESCRIPTION", 250], ["MOUNTING", 550], ["CCT / CRI", 700],
    ["WATTS", 830], ["DELIVERED LUMENS", 930], ["DRIVER", 1100], ["DIMMING", 1260],
    ["VOLTAGE", 1400], ["LENS / RELECTOR / BEAM", 1520], ["FINISH", 1780],
    ["MANUFACTURER SERIES", 1900], ["NOTES", 2150],
  ];
  const header = [sp("LUMINAIRE SCHEDULE", 1000, 0), ...cols.map(([label, x]) => sp(label, x, hdrY))];
  type Row = { key: string; desc: string; mounting: string; mfr: string };
  const rows: Row[] = [
    { key: "E1", desc: "IP65 ARCHITECTURAL WEDGE WALL PACK LED LUMINAIRE", mounting: "WALL", mfr: "LITHONIA LIGHTING - WDGE2 SERIES" },
    { key: "E2", desc: "IP65 4 IN ROUND DOWNLIGHT LED LUMINAIRE", mounting: "RECESSED", mfr: "GOTHAM - IVO SERIES" },
    { key: "P1", desc: "8 FT DIRECT INDIRECT LINEAR LED LUMINAIRE", mounting: "PENDANT AIRCRAFT CABLE", mfr: "FLUXWERX - PROFILE SERIES" },
    { key: "R1", desc: "2X4 EDGE LIT TROFFER LED LUMINAIRE", mounting: "RECESSED", mfr: "FLUXWERX - INBOX 2X4 SERIES" },
    { key: "R2", desc: "4 IN ROUND DOWNLIGHT LED LUMINAIRE", mounting: "RECESSED", mfr: "GOTHAM - EVO SERIES" },
    { key: "R3", desc: "DEADFRONT RATED 4 IN ROUND DOWNLIGHT LED LUMINAIRE", mounting: "RECESSED", mfr: "GOTHAM - EVO SERIES" },
    { key: "S1", desc: "LENGHTS PER DRAWINGS LED STRIP LIGHT", mounting: "SURFACE", mfr: "LITHONIA LIGHTING - ZL1D SERIES" },
    { key: "S3", desc: "4 FT EDGE LIT LINEAR LED LUMINAIRE", mounting: "SURFACE", mfr: "FLUXWERX - PROFILE SERIES" },
    // V1 then X1, adjacent — the exact real shape the cross-row bleed was
    // found on, each with its OWN, DIFFERENT real MANUFACTURER SERIES value
    { key: "V1", desc: "NOMINAL 24 IN LINEAR VANITY LIGHT LED LUMINAIRE", mounting: "WALL", mfr: "EUREKA - MOONRISE SERIES" },
    { key: "X1", desc: "SINGLE FACE EXIT SIGN", mounting: "RECESSED", mfr: "LITHONIA LIGHTING - EDGR SERIES" },
  ];
  const dataSpans = rows.flatMap((r, i) => {
    const y = hdrY + 25 * (i + 1);
    return [
      sp(r.key, 100, y), sp(r.desc, 250, y), sp(r.mounting, 550, y), sp("3500K LED, 80+ CRI", 700, y),
      sp("10W", 830, y), sp("2900 LM", 930, y), sp("INTEGRAL ELECTRONIC", 1100, y), sp("0-10V TO 10%", 1260, y),
      sp("UNV", 1400, y), sp("FROSTED LENS", 1520, y), sp("STANDARD PER ARCHITECT", 1780, y), sp(r.mfr, 1900, y),
    ];
  });
  // the real "SHEET NOTES" side panel: a lettered paragraph block sitting
  // close right of the table's own NOTES column, real prose, never this
  // table's data — spans the whole row range the way the real one does
  const sheetNotes = rows.flatMap((_, i) => {
    const y = hdrY + 25 * (i + 1);
    return [sp(`${String.fromCharCode(65 + i)}.`, 2450, y), sp("PROVIDE INFRASTRUCTURE AS REQUIRED FOR EMERGENCY POWER COMPATIBILITY", 2480, y)];
  });
  const sheet: SheetSpans = { key: "luminaire.pdf#59", sheet_number: "E6.01", spans: [...header, ...dataSpans, ...sheetNotes] };

  const tab = extractTable(sheet, "equipment");
  assert.ok(tab, "the real LUMINAIRE SCHEDULE qualifies as an equipment table once TYPE anchors its key column");
  assert.equal(tab!.title?.text, "LUMINAIRE SCHEDULE");
  assert.equal(tab!.headers[0], "TYPE", "TYPE is the table's own leftmost, key column");
  assert.equal(tab!.rows.length, 10, `all 10 real rows extract: ${tab!.rows.map((r) => r.key).join(", ")}`);
  assert.deepEqual(tab!.rows.map((r) => r.key), rows.map((r) => r.key), "every row keys under its own real TYPE code, in sheet order");
  // the core regression: V1 and X1 sit ADJACENT and must each answer for
  // their OWN real MANUFACTURER SERIES value, never each other's
  const v1 = tab!.rows.find((r) => r.key === "V1")!;
  const x1 = tab!.rows.find((r) => r.key === "X1")!;
  assert.equal(v1.cells.MANUFACTURER.text, "EUREKA - MOONRISE SERIES", "V1 answers for its OWN manufacturer series, not X1's");
  assert.equal(x1.cells.MANUFACTURER.text, "LITHONIA LIGHTING - EDGR SERIES", "X1 answers for its OWN manufacturer series, not V1's");
  // the SHEET NOTES side panel must never bleed into the row nearest it —
  // if it did, MANUFACTURER (the column just left of NOTES) would be the
  // first casualty of a mis-bounded right edge
  for (const r of tab!.rows) {
    assert.ok(!r.cells.MANUFACTURER.text.includes("PROVIDE INFRASTRUCTURE"), `${r.key}'s MANUFACTURER cell must stay clean of the sheet-notes panel: ${r.cells.MANUFACTURER.text}`);
  }
});

test("a \"FAN TYPE\" qualifier column never masquerades as a table's own key column (ledger item 63 regression guard, real federal-attachment4#14)", () => {
  // A first attempt at the LUMINAIRE SCHEDULE fix put "TYPE" directly in
  // CATALOG_ANCHOR_WORDS — and broke a real, already-working table:
  // federal-attachment4-mechanical.pdf#14's own "AIR HANDLING UNIT FAN
  // SCHEDULE" carries a real "FAN TYPE" column (a QUALIFIER on the fan;
  // TAG is its real key column) that anchors as bare "TYPE" once TYPE joins
  // EQUIPMENT_HEADERS' own vocabulary — with TYPE also in CATALOG_ANCHOR_
  // WORDS, mergeBackwardCoEqualTier read that qualifier as "this row
  // already has its own key column" and the real table was lost outright.
  // Mirrors the real shape: TAG-keyed, a "FAN TYPE" column sitting to the
  // RIGHT of TAG (never leading it) — the real table must still extract,
  // keyed under TAG, with its own real TYPE column correctly anchored too.
  const sheet: SheetSpans = {
    key: "fan.pdf#14", sheet_number: "M7.1",
    spans: [
      sp("AIR HANDLING UNIT FAN SCHEDULE", 100, 0),
      sp("TAG", 100, 30), sp("FAN TYPE", 300, 30), sp("RPM", 500, 30), sp("VOLTAGE", 650, 30), sp("PHASE", 800, 30), sp("REMARKS", 950, 30),
      sp("RF-1", 100, 55), sp("CENTRIFUGAL PLENUM", 300, 55), sp("1750", 500, 55), sp("460", 650, 55), sp("3", 800, 55), sp("ROOF", 950, 55),
      sp("RF-2", 100, 80), sp("CENTRIFUGAL PLENUM", 300, 80), sp("1750", 500, 80), sp("460", 650, 80), sp("3", 800, 80), sp("ROOF", 950, 80),
    ],
  };
  const tab = extractTable(sheet, "equipment");
  assert.ok(tab, "the real TAG-keyed table must still extract with a FAN TYPE qualifier column present");
  assert.equal(tab!.headers[0], "TAG", "TAG stays the table's own leftmost, key column — TYPE is a qualifier, never the key");
  assert.equal(tab!.rows.length, 2);
  assert.equal(tab!.rows[0].key, "RF-1");
  assert.equal(tab!.rows[0].cells.TYPE?.text, "CENTRIFUGAL PLENUM", "the qualifier's own column still anchors and reads correctly");
});

// ── the structural "reference" kind (full-coverage-standard work) ──────────
// Real-corpus-derived: every span below is bessemer-mechanical-bidset.pdf#8's
// own real DUCTWORK INSULATION SCHEDULE (x, y, str, and per-token width all
// taken directly from a real pdf.js text-span dump of the real PDF, shifted
// by a constant offset for readable coordinates — never invented proportions)
// — the exact real table this session's own reconnaissance named as the
// concrete, measured gap: a 3-column, 5-physical-line-wrapped-header table
// keyed by SYSTEM TYPE, with no per-instance drawn-symbol tag and none of
// ROOM_HEADERS'/FINISH_HEADERS'/EQUIPMENT_HEADERS' vocabulary words. `rh`
// mirrors this file's own `sp()` convention but with an explicit height (19px
// — this real table's own measured span height, not the default 8px other
// fixtures use) and explicit width (also real, measured) so the h-scaled
// thresholds throughout this pass (expandGenericHeaderBlock's tier-gap cap,
// clusterGenericColumns' column tolerance, bandGenericDataRows' orphan-fold
// radius and new-row gap floor) are exercised at their real, intended scale.
const rh = (str: string, x: number, y: number, w: number): GraphSpan => ({ str, x, y, w, h: 19 });
const REF_TABLE_SPANS: GraphSpan[] = [
  rh("DUCTWORK INSULATION SCHEDULE", 153, 41, 342),
  rh("INSULATION OR", 815, 76, 148),
  rh("INSULATION", 665, 87, 115),
  rh("SYSTEM TYPE", 153, 98, 132), rh("LINER", 861, 98, 57),
  rh("TYPE", 698, 109, 49),
  rh("THICKNESS", 835, 120, 109),
  rh("SUPPLY DUCTS (EXTERNALLY INSULATED)", 153, 173, 393), rh("D-1, D-2, D-6", 666, 173, 112), rh("1-1/2\"", 864, 173, 49),
  rh("EXHAUST DUCTS WITHIN 10 FEET OF EXTERIOR", 153, 199, 441),
  rh("D-1, D-2", 687, 210, 70), rh("1\"", 880, 210, 17),
  rh("OPENINGS", 153, 220, 99),
];
// A ruled horizontal rule right under the header block, spanning well past
// 60% of the table's own column width — the real, measured "genuinely
// boxed" signal (see hasNearbyRuledLine's own comment); every real table
// this pass targets in the corpus is drawn boxed.
const REF_TABLE_RULE = [150, 140, 1030, 140];

test("reference kind: a real, vocabulary-free schedule table extracts correctly (real bessemer M601 coordinates)", () => {
  const sheet: SheetSpans = {
    key: "ref.pdf#1", sheet_number: "M601",
    spans: REF_TABLE_SPANS,
    segs: REF_TABLE_RULE,
  };
  const g = buildSheetGraph([sheet]);
  assert.equal(classifySheetRole(sheet).role, "schedule", "the table's own title reads as a real schedule-sheet title");
  const tab = g.tables.find((t) => t.kind === "reference");
  assert.ok(tab, "a real, wrapped, vocabulary-free header must extract as a reference table");
  assert.deepEqual(tab!.headers, ["SYSTEM TYPE", "INSULATION TYPE", "INSULATION OR LINER THICKNESS"],
    "a multi-tier wrapped header's own fragments join into the real printed column names");
  assert.equal(tab!.rows.length, 2);
  const [r1, r2] = tab!.rows;
  assert.equal(r1.key, "SUPPLY DUCTS (EXTERNALLY INSULATED)");
  assert.equal(r1.cells["INSULATION TYPE"]?.text, "D-1, D-2, D-6");
  assert.equal(r1.cells["INSULATION OR LINER THICKNESS"]?.text, "1-1/2\"");
  // the real, hard case this table exists to prove: the row's own KEY
  // column wraps to a 2nd physical line ("OPENINGS") that lands back at the
  // SAME x as any genuine new row's own leading token would — correctly
  // read as this row's own continuation, not a phantom 3rd row, and in the
  // real reading order (not fold order).
  assert.equal(r2.key, "EXHAUST DUCTS WITHIN 10 FEET OF EXTERIOR");
  assert.equal(r2.cells["SYSTEM TYPE"]?.text, "EXHAUST DUCTS WITHIN 10 FEET OF EXTERIOR OPENINGS");
  assert.equal(r2.cells["INSULATION TYPE"]?.text, "D-1, D-2");
  assert.equal(r2.cells["INSULATION OR LINER THICKNESS"]?.text, "1\"");
});

test("reference kind: a bare \"&\" header-phrase connector no longer kills the whole row (real bug: 028_TX_Renovation_of_Building_615's own NOISE CONTROL DUCT SILENCER SCHEDULE)", () => {
  // Real, found-live gap (2026-09-03), traced with a temporary debug probe
  // against a synthetic reproduction, not guessed: 028_TX's own real
  // "LOCATION & SERVES" column header draws "&" as its own separate span.
  // isGenericHeaderToken required at least one A-Z letter in EVERY token —
  // "&" has none — and isGenericHeaderRow requires EVERY token in the row
  // to qualify, so one connector symbol failed the WHOLE header row. The
  // real table (real quantities: duct silencer counts, sizes, locations)
  // was never extracted under ANY kind and never even disclosed as a
  // dropped/refused table — a silent, total loss of real quantity data.
  // Same real bessemer fixture as the test above, with ONLY "SYSTEM TYPE"
  // split into "SYSTEM" / "&" / "TYPE" as three real separate spans (the
  // same real shape "LOCATION" / "&" / "SERVES" takes) — everything else
  // (segs, other tiers, data rows) is untouched, proven-working geometry,
  // isolating the "&" token as the only variable.
  const sheet: SheetSpans = {
    key: "ref-amp.pdf#1", sheet_number: "M601",
    spans: [
      rh("DUCTWORK INSULATION SCHEDULE", 153, 41, 342),
      rh("INSULATION OR", 815, 76, 148),
      rh("INSULATION", 665, 87, 115),
      rh("SYSTEM", 153, 98, 62), rh("&", 220, 98, 15), rh("TYPE", 240, 98, 45), rh("LINER", 861, 98, 57),
      rh("TYPE", 698, 109, 49),
      rh("THICKNESS", 835, 120, 109),
      rh("SUPPLY DUCTS (EXTERNALLY INSULATED)", 153, 173, 393), rh("D-1, D-2, D-6", 666, 173, 112), rh("1-1/2\"", 864, 173, 49),
      rh("EXHAUST DUCTS WITHIN 10 FEET OF EXTERIOR", 153, 199, 441),
      rh("D-1, D-2", 687, 210, 70), rh("1\"", 880, 210, 17),
      rh("OPENINGS", 153, 220, 99),
    ],
    segs: REF_TABLE_RULE,
  };
  const g = buildSheetGraph([sheet]);
  const tab = g.tables.find((t) => t.kind === "reference");
  assert.ok(tab, "a real header row containing a bare \"&\" connector must still extract, not vanish entirely");
  assert.ok(tab!.headers.some((h) => /SYSTEM/.test(h)), `the SYSTEM column must survive: ${tab?.headers?.join(" | ")}`);
  assert.equal(tab!.rows.length, 2, "both real data rows must still be present");
});

test("reference kind: button subrows do not corrupt their spanning control-station row", () => {
  const spans: GraphSpan[] = [
    rh("ELECTRICAL SCHEDULES", 900, -60, 220),
    rh("LIGHTING CONTROL STATIONS", 0, 0, 280),
    rh("CONTROL STATION", 0, 35, 150), rh("ZONES", 250, 35, 60), rh("BUTTON", 480, 35, 70),
    rh("DESIGNATION", 20, 55, 110), rh("CONTROLLED", 230, 55, 100), rh("NUMBER", 480, 55, 75),
    rh("FUNCTION", 710, 55, 100), rh("LABEL", 950, 55, 60), rh("NOTES", 1080, 55, 60),
    rh("$OS", 0, 90, 35), rh("ALL", 250, 90, 35), rh("1", 500, 90, 10),
    // Deliberately starts well left of the centered FUNCTION header, exactly
    // like the real wide, left-aligned column.
    rh("ALL ON", 555, 90, 90), rh("ON", 950, 90, 30),
    // The merged designation cell spans this second physical button row.
    rh("2", 500, 115, 10), rh("ALL OFF", 555, 115, 100), rh("OFF", 950, 115, 35),
    rh("$OSD", 0, 145, 45), rh("ALL", 250, 145, 35), rh("1", 500, 145, 10),
    rh("ALL ON/HOLD DIM UP", 555, 145, 220), rh("UP", 950, 145, 30),
  ];
  const sheet: SheetSpans = {
    key: "controls.pdf#1", sheet_number: "E601", spans,
    segs: [0, 75, 1140, 75],
  };
  const tab = buildSheetGraph([sheet]).tables.find((t) => t.title?.text === "LIGHTING CONTROL STATIONS");
  assert.ok(tab);
  const os = tab!.rows.find((row) => row.key === "$OS");
  assert.equal(os?.cells["BUTTON NUMBER"]?.text, "1");
  assert.equal(os?.cells.FUNCTION?.text, "ALL ON");
});

test("reference kind: scoped to schedule-role sheets — the identical real table on a PLAN sheet is not extracted", () => {
  // Same real spans, but the sheet's own title now reads as a plan, not a
  // schedule — a real, disclosed scope limit (see the design comment above
  // extractAllTables), not an oversight: false-positive risk concentrates
  // on plan sheets (title blocks, dimension strings, general-notes lists),
  // and no real corpus example of this table shape drawn on a plan sheet
  // was found.
  const spans = [rh("MECHANICAL - LEVEL 1 PLAN", 153, 0, 300), ...REF_TABLE_SPANS.slice(1)];
  const sheet: SheetSpans = { key: "ref.pdf#2", sheet_number: "M101", spans, segs: REF_TABLE_RULE };
  assert.equal(classifySheetRole(sheet).role, "plan");
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"), "a plan-role sheet is out of this pass's own declared scope");
});

test("reference kind: refuses without a real nearby ruled border (segs supplied, none present)", () => {
  // The identical real header+data shape, but the sheet's own vector
  // segments carry nothing near the table at all — real, found live: this
  // was NOT the shape's own DEFAULT — segs are what this table actually
  // has (see the positive test above); this asserts the gate is genuinely
  // load-bearing (removed here) rather than a no-op that always passes.
  const sheet: SheetSpans = {
    key: "ref.pdf#3", sheet_number: "M601",
    spans: REF_TABLE_SPANS,
    segs: [4000, 4000, 4100, 4000], // present, but nowhere near this table
  };
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"), "no real ruled border nearby — refused, not guessed");
});

test("reference kind: skips a header block that already qualifies under an existing vocabulary", () => {
  // Real, corpus-found bug this guards against (see the design comment
  // above extractAllTables): a genuine EQUIPMENT_HEADERS-vocabulary table
  // (ID/MANUFACTURER/MODEL/VOLTAGE/PHASE/WATTS/AMPS) is ALSO short/caps/
  // columnar, so this pass's own structural signals alone would happily
  // re-find it — risking a cross-kind-dedup coin-flip silently replacing
  // the working equipment-kind extraction. Real bessemer coordinates
  // (ELECTRIC WALL HEATER SCHEDULE) — this table must extract ONLY as
  // "equipment", never additionally as "reference".
  const spans: GraphSpan[] = [
    rh("ELECTRIC WALL HEATER SCHEDULE", 0, 0, 345),
    rh("ID", 0, 35, 20), rh("MANUFACTURER", 143, 35, 160), rh("MODEL", 319, 35, 68), rh("VOLTAGE", 486, 35, 91), rh("PHASE", 643, 35, 65), rh("WATTS", 785, 35, 67), rh("AMPS", 936, 35, 54),
    rh("EWH-1", 0, 87, 60), rh("QMARK", 143, 87, 69), rh("CZ15112T", 319, 87, 89), rh("120", 486, 87, 32), rh("1", 643, 87, 10), rh("750", 785, 87, 31), rh("6.3", 936, 87, 26),
  ];
  const sheet: SheetSpans = { key: "ref.pdf#4", sheet_number: "M601", spans, segs: [0, 30, 1000, 30] };
  const g = buildSheetGraph([sheet]);
  const kinds = g.tables.filter((t) => t.title?.text === "ELECTRIC WALL HEATER SCHEDULE").map((t) => t.kind);
  assert.deepEqual(kinds, ["equipment"], "a vocabulary already explains this table — never re-extracted as \"reference\" too");
});

test("reference kind negative control: a drawing's own title-block/approval-stamp is not a real reference table (GOAL.md rule 26)", () => {
  // Real, corpus-found across 3 independent real documents (011, 016, 019):
  // a title block is a boxed, ruled, repeating LABEL:VALUE grid — the same
  // structural shape as a genuine reference table, with nothing structural
  // telling them apart. Reproduces the confirmed real shape ("Rome Research
  // Site"'s own DRAWING NO:/SHEET:/FACILITY NO:/DATE: rows): a digit-free
  // 2-token caption line seeds the header block (this exact table's own
  // real title/caption is misread the same way the real bug's own "Rome
  // Research Site" text was — a project-info caption, not a schedule
  // title), and SHEET/FACILITY NO/DATE — each with a real, digit-bearing
  // value, so none of them gets absorbed back into the header block — are
  // its own real administrative rows underneath, real title-block
  // vocabulary this file's own TITLE_BLOCK_ROW_LABELS was built from,
  // never a real schedule's own row keys. Verified this fixture DOES
  // reproduce the real bug with the fix disabled (3 fake rows extracted)
  // before confirming the fix refuses it — not merely asserted blind.
  const spans: GraphSpan[] = [
    rh("PROJECT", 153, 41, 100), rh("INFORMATION", 500, 41, 150),
    rh("SHEET", 153, 62, 66), rh("M-601", 500, 62, 66),
    rh("FACILITY NO", 153, 83, 132), rh("SITE-1", 500, 83, 100),
    rh("DATE", 153, 104, 55), rh("01-15-2024", 500, 104, 130),
  ];
  const sheet: SheetSpans = {
    key: "titleblock.pdf#4", sheet_number: "M601",
    spans,
    segs: [150, 30, 1030, 30], // a real ruled border, exactly like a genuine title-block box
  };
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"),
    "the title block's own administrative rows never become a fake reference table");
});

test("reference kind: a real table carrying ONE administrative-looking row alongside real data rows is still kept", () => {
  // Narrow-scoping proof for the title-block refusal above: isTitleBlockTable
  // only ever refuses a candidate whose ENTIRE row set is title-block
  // vocabulary — a real reference table that happens to carry a genuine
  // "DATE" spec line alongside its own real data must never be swept up
  // with it. Same real bessemer-derived header/rule shape as this file's
  // own positive reference-kind test, with a 3rd row ("DATE") standing in
  // for that legitimate case.
  const spans: GraphSpan[] = [
    ...REF_TABLE_SPANS,
    rh("DATE", 153, 240, 55), rh("12/15/2023", 666, 240, 100),
  ];
  const sheet: SheetSpans = { key: "ref.pdf#10", sheet_number: "M601", spans, segs: REF_TABLE_RULE };
  const g = buildSheetGraph([sheet]);
  const tab = g.tables.find((t) => t.kind === "reference");
  assert.ok(tab, "a real table with one administrative-looking row is still extracted");
  assert.equal(tab!.rows.length, 3);
  assert.ok(tab!.rows.some((r) => r.key === "DATE"), "the real DATE row survives alongside the real data rows");
});

test("reference kind negative control: an ABBREVIATIONS-style list of independent rows is not mistaken for one wrapped header", () => {
  // The real, adversarial failure mode this pass's own design has to
  // defend against without a word list to lean on (see
  // MAX_GENERIC_COLUMN_DEPTH's own comment): a real legend/abbreviations
  // block — one short CODE + one short DEFINITION per physical line, SEVEN+
  // independent rows sharing the same two x-positions — is structurally
  // indistinguishable, line by line, from a real wrapped multi-tier header
  // (every row: 2 short, ALL-CAPS, digit-free cells). No ruled border
  // nearby either (a real, common convention for this kind of side list).
  const rows = [
    ["AFF", "ABOVE FINISHED FLOOR"], ["CFM", "CUBIC FEET PER MINUTE"], ["DIA", "DIAMETER"],
    ["EA", "EACH"], ["FT", "FEET"], ["GPM", "GALLONS PER MINUTE"], ["MAX", "MAXIMUM"],
    ["MIN", "MINIMUM"], ["TYP", "TYPICAL"],
  ];
  // Titled to read as role "schedule" (not "legend" — a bare "ABBREVIATIONS"
  // title alone matches this file's OWN legend-cover-sheet signal instead,
  // which would exclude it from this pass by role-scoping alone and weaken
  // the point: this negative control exists to prove the STRUCTURAL defense
  // (MAX_GENERIC_COLUMN_DEPTH) works even on a schedule-role sheet, not to
  // lean on role-scoping doing the job instead).
  const spans: GraphSpan[] = [rh("ABBREVIATIONS SCHEDULE", 0, 0, 260)];
  rows.forEach(([code, def], i) => {
    spans.push(rh(code, 0, 30 + i * 20, code.length * 8), rh(def, 120, 30 + i * 20, def.length * 8));
  });
  const sheet: SheetSpans = { key: "ref.pdf#5", sheet_number: "M601", spans };
  assert.equal(classifySheetRole(sheet).role, "schedule", "titled to read as a real schedule-role sheet");
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"), "a real list of independent rows is never mistaken for one wrapped header");
});

test("reference kind negative control: ordinary numbered notes prose is never mistaken for a table", () => {
  // Real drafting convention (confirmed live, bessemer sheet #6's own
  // GENERAL NOTES/KEYNOTES): a numbered note is a bullet marker span PLUS
  // one long sentence span — never 2+ short, columnar cells — so this
  // pass's own shape test (isGenericHeaderRow's 2+-short-cell floor)
  // already refuses it on its own; asserted directly so a future change to
  // that shape test is caught here, not just inferred from the corpus
  // sweep passing.
  const spans: GraphSpan[] = [
    rh("GENERAL NOTES", 0, 0, 200),
    rh("1.", 0, 30, 15), rh("COORDINATE INSTALLATION WITH ELECTRICAL CONTRACTOR.", 25, 30, 520),
    rh("2.", 0, 55, 15), rh("PROVIDE WITH LINE VOLTAGE THERMOSTAT LOCATED ABOVE HEATER.", 25, 55, 560),
    rh("3.", 0, 80, 15), rh("INSTALL PER MANUFACTURER'S REQUIREMENTS.", 25, 80, 410),
  ];
  const sheet: SheetSpans = { key: "ref.pdf#6", sheet_number: "M601", spans: [rh("FAN SCHEDULE", 0, -40, 200), ...spans] };
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"), "ordinary note prose never qualifies as a header row");
});

test("isGenericHeaderToken: a single-span real TABLE TITLE never qualifies as a header cell (real bug: 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers's own dense 2-column page 24)", () => {
  // Real, found-live gap (2026-09-03), traced with a direct debug probe
  // against the real document, not guessed: page 24 of this real set stacks
  // TWO independent schedules side by side — "BOILER PLANT · ISOLATION
  // VALVE SCHEDULE" (left column, 27 real GV-* rows) and "BOILER PLANT ·
  // FUEL OIL METER SCHEDULE" (right column) — and their own titles print at
  // the exact same physical row height. clusterRows is Y-only, so it merges
  // both single-span titles into ONE 2-token row; isGenericHeaderRow's own
  // "2+ shape-qualified, digit-free tokens = a real header row" test (built
  // assuming 2+ tokens means 2+ real COLUMNS of one table) read that merged
  // title pair as a genuine header anchor, confirmed live via a temporary
  // debug probe: before this fix, `isGenericHeaderRow` returned true for
  // that exact merged row on the real document; after, false. This pass
  // (extractReferenceTableAt) is reached because the real Isolation Valve
  // Schedule's own header (MARK/LOCATION/SYSTEM AND/OR SERVICE/TYPE/
  // REPLACE-NEW/PIPE SIZE/VALVE SIZE/TEMP. TYPE/REMARKS) clears none of
  // EQUIPMENT_REQUIRED's own vocabulary (no voltage/amps/gpm/hp/mbh/…), so
  // equipment-kind refuses it — the vocabulary-free structural reference
  // pass is the only one that would ever independently find it.
  //
  // Every real title measured across this corpus's own evidence this
  // session ends in "SCHEDULE"; zero hits for that word across
  // EQUIPMENT_HEADERS/FINISH_HEADERS/ROOM_HEADERS' combined vocabulary — no
  // real column header ever uses it — so excluding it from
  // isGenericHeaderToken is safe on that account. (This narrow fix does NOT
  // fully recover the real table: the deeper mechanism — bandedSheets'
  // own column-seam detector never validating a seam for this specific
  // real page, so the reference-kind pass still runs on the whole,
  // unsplit sheet where both tables' real 2+-token HEADER rows — not just
  // their titles — also land at the same height and merge — is tracked
  // separately, not started, in GOAL.md.)
  assert.equal(isGenericHeaderToken("BOILER PLANT · ISOLATION VALVE SCHEDULE"), false,
    "a real single-span table TITLE is never mistaken for a header cell");
  assert.equal(isGenericHeaderToken("BOILER PLANT · FUEL OIL METER SCHEDULE"), false,
    "the same real shape from the OTHER side of the same page");
  assert.equal(isGenericHeaderToken("AIR HANDLING UNIT SCHEDULE"), false,
    "any real title ending in SCHEDULE, not just this specific real pair");
  // Negative controls — real, short column-label tokens (none contain the
  // word SCHEDULE) still qualify exactly as before this fix.
  for (const label of ["MARK", "LOCATION", "SYSTEM AND/OR SERVICE", "TYPE", "REMARKS", "VALVE SIZE IN."]) {
    assert.equal(isGenericHeaderToken(label), true, `an ordinary real header label must still qualify: ${label}`);
  }
});

test("reference kind negative control: a single real data row never qualifies — a real table's own grid must repeat", () => {
  // Real, corpus-found bug (itd-d1-lab-mechanical.pdf#21, confirmed by
  // direct render — see sheetgraph.ts's own comment above the
  // `banded.out.length < 2` gate): none of the earlier structural signals
  // (header shape, nearby ruled line, per-row population floor) actually
  // test that the candidate's grid REPEATS — only that it looks table-
  // shaped for exactly one line. Same real header+rule as the positive test
  // above, but with only the FIRST of its two real data rows present: a
  // genuine table minus one row is still exactly the shape a coincidental
  // one-off (a control-schematic's scattered instrument callouts happening
  // to align under a header-shaped line) can produce — this is the
  // structural line the fix draws, tested directly against the same real
  // fixture the positive 2-row test above uses.
  const oneRowSpans = REF_TABLE_SPANS.filter((s) => !/^(D-1, D-2$|1"$|EXHAUST DUCTS|OPENINGS)/.test(s.str));
  const sheet: SheetSpans = {
    key: "ref.pdf#7", sheet_number: "M601",
    spans: oneRowSpans,
    segs: REF_TABLE_RULE,
  };
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"), "one real data row proves no repeating grid — refused, not guessed");
});

test("reference kind negative control: a control-schematic's scattered instrument callouts are not a table (itd-d1-lab-mechanical.pdf#21 bug shape)", () => {
  // The real bug's own shape, reproduced with invented text/coordinates
  // (itd-d1-lab-mechanical.pdf is an external, redistribution-uncertain
  // corpus file per opentakeoff-corpus/sets.json — never embedded verbatim
  // in a committed test, same discipline as the column-band fixture below).
  // A control schematic draws several short, ALL-CAPS, digit-free
  // instrument/point callout labels (bubble tags, leader labels) scattered
  // around its own linework — by coincidence, one line of them
  // (isGenericHeaderRow's own 2+-short-cell shape test) sits above one more
  // line of equally scattered labels/values that happen to key-column-align
  // and populate a majority of the "columns" (bandGenericDataRows' own
  // minCells floor), and the schematic's own dense duct/pipe/box linework
  // happens to supply a nearby wide rule (hasNearbyRuledLine) purely by
  // proximity — every earlier gate passes for this ONE coincidental line,
  // exactly like the real corpus find.
  const spans: GraphSpan[] = [
    rh("CONTROL SCHEMATIC NOTES", 0, -40, 300),
    rh("TT H", 0, 0, 60), rh("SUPPLY AIR VALVE", 200, 0, 160), rh("EXHAUST AIR VALVE", 500, 0, 170), rh("DI", 800, 0, 20),
    rh("C AIR", 0, 40, 55), rh("CONTROLLER", 200, 40, 95), rh("SNORKEL", 500, 40, 70),
  ];
  const sheet: SheetSpans = {
    key: "ref.pdf#8", sheet_number: "M6.5",
    spans,
    // Dense, incidental schematic linework near the "header" — a duct/pipe
    // run spanning well past 60% of the candidate block's own width, the
    // same real shape a genuine table's own ruled border has.
    segs: [0, -10, 900, -10],
  };
  const g = buildSheetGraph([sheet]);
  assert.ok(!g.tables.some((t) => t.kind === "reference"),
    "one line of scattered schematic callouts, however table-shaped, is never a real table without a repeating grid");
});

// ── column bands: a real 2-column sheet layout defeats table discovery ─────
// clusterRows is Y-only — it has no idea a sheet can be drafted as two
// SEPARATE physical column strips of tables side by side (real, common,
// field-found on itd-d1-lab-mechanical.pdf's own sheets #12/#13/#14: a LEFT
// stack of tables and a RIGHT stack, each with its own titles/headers/data,
// at completely different x-ranges). When two such tables' rows happen to
// land within a few px of each other in y — measured live, a real data row
// on one side 2px from a real header tier on the other — they glue into ONE
// clusterRows row spanning both tables' x-ranges, and a real multi-tier
// header's own tier-merge (the "almost entirely header words" ratio gate)
// reads that inflated row and refuses to merge, leaving the table stuck on
// a partial, wrong anchor set (or, on itd-d1-lab's own real sheets, losing
// the table's kind/key entirely). `bandedSheets` pre-partitions a proven
// 2-up sheet's spans by x BEFORE clusterRows ever sees them, so each table's
// own rows cluster in isolation — this fixture mirrors that exact shape
// with invented tags/text (itd-d1-lab-mechanical.pdf is an external,
// redistribution-uncertain corpus file per opentakeoff-corpus/sets.json —
// never embedded verbatim in a committed test).
const bandSp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });

function twoColumnEquipmentFixture(): SheetSpans {
  // LEFT column: an unrelated descriptive equipment list, many rows (real
  // 2-up sheets are dense — MIN_ROWS guards against firing on a sparse one).
  const left: GraphSpan[] = [
    bandSp("LAB EQUIPMENT LIST", 50, 20),
    bandSp("ITEM", 0, 60), bandSp("DESCRIPTION", 100, 60), bandSp("VENTS TO", 350, 60),
  ];
  const skipY = new Set([250, 270]); // stays clear of the RIGHT table's own header tiers
  let y = 90;
  for (let i = 0; i < 12; i++) {
    while (skipY.has(y)) y += 20;
    left.push(bandSp(`E-${i + 1}`, 0, y), bandSp(`SOME BENCH DEVICE ${i}`, 100, y), bandSp("ROOM " + (100 + i), 350, y));
    y += 20;
  }
  // Contamination: a LEFT-column data row lands within clusterRows' own
  // tolerance (0.35·h ≈ 3px at h=8) of the RIGHT table's own lower header
  // tier (y=270) — the real shape found live (a left-column row 2px from a
  // right-column header tier on itd-d1-lab-mechanical.pdf#13).
  left.push(bandSp("BENCH SCALE", 0, 271), bandSp("WEIGHING UNIT", 100, 271), bandSp("SMALL ITEM", 250, 271), bandSp("BENCHTOP UNIT", 350, 271));

  // RIGHT column: a real equipment schedule shape — a 2-tier header (a
  // narrower upper tier, SYMBOL/VELOCITY/MANUFACTURER, sitting above the
  // real fuller tier that also carries TYPE/AREA SERVED/REMARKS) — the same
  // family of shape as SAV's own real header on itd-d1-lab-mechanical.pdf,
  // needing tier-descent to read as one table.
  const right: GraphSpan[] = [
    bandSp("SUPPLY AIR VALVE SCHEDULE", 900, 200),
    bandSp("SYMBOL", 900, 250), bandSp("VELOCITY", 990, 250), bandSp("MANUFACTURER", 1080, 250),
    bandSp("SYMBOL", 900, 270), bandSp("AREA SERVED", 985, 270), bandSp("TYPE", 1090, 270), bandSp("VELOCITY", 1160, 270), bandSp("MANUFACTURER", 1250, 270), bandSp("REMARKS", 1360, 270),
  ];
  for (let i = 0; i < 6; i++) {
    const ry = 300 + i * 15;
    right.push(bandSp(`SAV-${i + 1}`, 900, ry), bandSp("LAB " + (100 + i), 985, ry), bandSp("VAV", 1090, ry), bandSp("500", 1160, ry), bandSp("ACME", 1250, ry), bandSp("1,2", 1360, ry));
  }
  return { key: "2col.pdf#1", sheet_number: "M-12", spans: [...left, ...right] };
}

test("2-column sheet layout: two genuinely separate side-by-side tables both extract cleanly", () => {
  const sheet = twoColumnEquipmentFixture();
  const g = buildSheetGraph([sheet]);
  const sav = g.tables.find((t) => t.rows.some((r) => r.key === "SAV-1"));
  assert.ok(sav, `SAV-1's table extracted: ${g.tables.map((t) => `${t.kind}:${t.title?.text || ""}`).join(" | ")}`);
  assert.equal(sav!.kind, "equipment");
  assert.equal(sav!.title?.text, "SUPPLY AIR VALVE SCHEDULE", "the real title, not a garbled data-cell guess");
  assert.deepEqual(sav!.rows.map((r) => r.key), ["SAV-1", "SAV-2", "SAV-3", "SAV-4", "SAV-5", "SAV-6"], "exactly the real rows — no spurious 'SYMBOL' row from a misread header tier");
  // SERVED joined EQUIPMENT_HEADERS (full-coverage audit of itd-d1-lab-
  // mechanical.pdf's own real HOT WATER REHEAT COIL/CONTROL VALVE/EXHAUST
  // FAN/ELECTRIC HEATER schedules — every one of them was silently dropping
  // its own real "AREA SERVED" column outright) — this fixture's lower tier
  // deliberately includes AREA SERVED to exercise a real 6-anchor header, not
  // the 5 it used to fall back to when that column had no vocabulary at all.
  assert.deepEqual([...sav!.headers].sort(), ["MANUFACTURER", "REMARKS", "SERVED", "SYMBOL", "TYPE", "VELOCITY"], "the full merged 2-tier header (6 real anchors, AREA SERVED included) — not just the narrower upper tier (3)");
  const row1 = sav!.rows[0];
  assert.equal(row1.cells.REMARKS?.text, "1,2", "the lower tier's own REMARKS column survives the merge");
  assert.equal(row1.cells.SERVED?.text, "LAB 100", "AREA SERVED's own real data lands under SERVED, not lost or bled into a neighbor");

  // the LEFT table's real rows are untouched by the split
  const leftHits = g.tables.filter((t) => t.rows.some((r) => r.key === "E-1"));
  assert.ok(leftHits.length >= 1, "the left-column table still extracts too");
});

test("2-column sheet layout negative control: a real single wide table (NUMBER/NAME far from FLOOR/BASE) is never split", () => {
  // The real shape a naive x-aware fix broke (field-found on demo/sample-
  // finish-plan.pdf's own real ROOM FINISH SCHEDULE): ONE logical table
  // whose identity columns (NUMBER/NAME) sit at a modest x and whose finish
  // columns (FLOOR/BASE/WALL/CEILING) start well to the right — a genuine,
  // wide, but ordinary intra-table gap, not a seam between two tables. A
  // second, real, separate MATERIAL SCHEDULE sits further right still on
  // the same sheet (also real on sample-finish-plan.pdf#2), giving the
  // sheet real 2-up-shaped density without this table itself being 2-up.
  const spans: GraphSpan[] = [
    bandSp("ROOM FINISH SCHEDULE", 100, 20),
    bandSp("NUMBER", 0, 60), bandSp("NAME", 120, 60), bandSp("FLOOR", 500, 60), bandSp("BASE", 620, 60), bandSp("WALL", 740, 60), bandSp("CEILING", 860, 60),
  ];
  for (let i = 0; i < 12; i++) {
    const y = 90 + i * 20;
    spans.push(
      bandSp(String(100 + i), 0, y), bandSp("ROOM " + i, 120, y),
      bandSp("VCT-1", 500, y), bandSp("RB-1", 620, y), bandSp("P-1", 740, y), bandSp("ACT-1", 860, y),
    );
  }
  spans.push(bandSp("MATERIAL SCHEDULE", 1300, 20), bandSp("CODE", 1300, 60), bandSp("MATERIAL", 1400, 60), bandSp("MANUFACTURER", 1550, 60), bandSp("COLOR", 1750, 60));
  for (let i = 0; i < 10; i++) {
    const y = 90 + i * 20;
    spans.push(bandSp(`M-${i + 1}`, 1300, y), bandSp("PAINT", 1400, y), bandSp("SHERWIN", 1550, y), bandSp("WHITE", 1750, y));
  }

  const g = buildSheetGraph([{ key: "wide.pdf#1", sheet_number: "A-101", spans }]);
  const rf = g.tables.find((t) => t.kind === "room-finish");
  assert.ok(rf, `room-finish table extracted: ${g.tables.map((t) => t.kind).join(", ")}`);
  assert.equal(rf!.rows.length, 12, "every real room row present — NUMBER/NAME was never severed from FLOOR/BASE/WALL/CEILING");
  assert.deepEqual([...rf!.headers].sort(), ["BASE", "CEILING", "FLOOR", "NAME", "NUMBER", "WALL"], "all 6 real columns on one table, not split into a NUMBER/NAME fragment and a FLOOR/BASE fragment");
  const row0 = rf!.rows.find((r) => r.key === "100")!;
  assert.equal(row0.cells.FLOOR?.text, "VCT-1");
  assert.equal(row0.cells.CEILING?.text, "ACT-1");

  const mat = g.tables.find((t) => t.kind === "finish" && t.title?.text === "MATERIAL SCHEDULE");
  assert.ok(mat, "the real, separate MATERIAL SCHEDULE also extracts, on its own");
  assert.equal(mat!.rows.length, 10);
});

test("isReferenceCrossTable: OUTSIDE AIR flow-rate calc demotes without MODEL/MANUFACTURER, genuine OA unit catalog does not", () => {
  const oaHeaders = ["ROOM NUMBER", "ROOM NAME", "CFM PER PERSON", "SCHEDULED OUTDOOR AIRFLOW (CFM)"];
  assert.equal(isReferenceCrossTable("REQUIRED OUTSIDE AIR FLOW RATE", oaHeaders), true,
    "a ventilation calc with no catalog identity is a cross-reference");
  assert.equal(isReferenceCrossTable("MECHANICAL EQUIPMENT CONNECTION SCHEDULE", ["NO.", "LOCATION", "VA", "MCA"]), true);
  assert.equal(isReferenceCrossTable("NATURAL GAS CALCULATION", ["TAG", "DESCRIPTION", "TOTAL MBH"]), true);
  assert.equal(isReferenceCrossTable("OUTSIDE AIR UNIT SCHEDULE", ["EQUIP NO", "MANUFACTURER", "MODEL", "CFM"]), false,
    "a genuine outdoor-air unit catalog states MODEL/MANUFACTURER and stays equipment");
  assert.equal(isReferenceCrossTable("FAN SCHEDULE", oaHeaders), false,
    "a title that does not name CONNECTION/CALCULATION/ISOLATION/OUTSIDE AIR is untouched");
});

test("UNIT TAG header is own-identity equipment anchor, not a qualified cross-reference (WP1.4)", () => {
  assert.equal(isBareAnchorHeader("UNIT TAG"), true);
  assert.equal(isQualifiedAnchorHeader("UNIT TAG"), false);
  assert.equal(isBareAnchorHeader("UNIT NO"), true);
  assert.equal(isQualifiedAnchorHeader("UNIT MARK"), true);
  assert.equal(isBareAnchorHeader("DESIGNATION"), true);
  assert.equal(isBareAnchorHeader("EQUIP. TAG"), true);
  assert.equal(isQualifiedAnchorHeader("EQUIP. TAG"), false);
  assert.equal(isBareAnchorHeader("EQUIP TAG"), true);
});

test("WP1.4 CODE_RE accepts digit+letter unit suffixes (AHU-1A / CU-1B)", () => {
  const sp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });
  const sched: SheetSpans = {
    key: "ahu-suffix.pdf#1",
    sheet_number: "M9",
    spans: [
      sp("AIR HANDLING UNIT SCHEDULE", 100, 10),
      sp("EQUIP. TAG", 0, 40), sp("TYPE", 180, 40), sp("GPM", 260, 40), sp("MANUFACTURER", 360, 40), sp("REMARKS", 760, 40),
      sp("AHU-1A", 0, 70), sp("DX", 180, 70), sp("10", 260, 70), sp("ACME", 360, 70), sp("1", 760, 70),
      sp("AHU-1B", 0, 90), sp("DX", 180, 90), sp("10", 260, 90), sp("ACME", 360, 90), sp("1", 760, 90),
      sp("CU-1A", 0, 110), sp("DX", 180, 110), sp("12", 260, 110), sp("ACME", 360, 110), sp("1", 760, 110),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  assert.equal(tables.length, 1, `expected one AHU table, got ${tables.map((t) => t.title?.text).join(" | ")}`);
  assert.deepEqual(tables[0].rows.map((r) => r.key), ["AHU-1A", "AHU-1B", "CU-1A"]);
});

test("CODE_RE accepts a letter+digit prefix before the hyphen (real bug: 021_XX's own VVR2-8/VVR2-10 riser-numbered terminal units)", () => {
  // Real, found-live gap (2026-09-02), traced with a temporary debug probe
  // against the real corpus, not guessed: 021_XX_Laboratory_building's own
  // AIR TERMINAL UNIT SCHEDULE tags its rows "VVR2 - 8", "VVR2 - 10" etc —
  // a real riser/zone-numbered terminal-unit convention. rowKeyOf's own
  // punctuation strip normalizes the spacing fine ("VVR2-8"), but CODE_RE's
  // compound-tag prefix (`[A-Z]{1,6}`) is letters-only and rejects "VVR2"
  // outright because of its own trailing digit — every one of these rows
  // came back unkeyed, became an orphan, and got glued onto whichever
  // nearby row sat closest by y-position. That's the true source of two
  // real, already-shipped downstream symptoms found and worked around in
  // corpusTakeoff.mjs this same session (a wrong tag pulled from a
  // different row's own text; two real rows' numeric values merged into
  // one) — this is the fix at the actual source, not another workaround.
  const sp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });
  const sched: SheetSpans = {
    key: "vvr-riser.pdf#1",
    sheet_number: "M40",
    spans: [
      sp("SINGLE DUCT AIR TERMINAL UNIT SCHEDULE", 100, 10),
      sp("EQUIP. TAG", 0, 40), sp("TYPE", 180, 40), sp("GPM", 260, 40), sp("MANUFACTURER", 360, 40), sp("REMARKS", 760, 40),
      sp("VVR1 - 5", 0, 70), sp("VAV", 180, 70), sp("0.18", 260, 70), sp("TITUS", 360, 70), sp("1", 760, 70),
      sp("VVR2 - 8", 0, 90), sp("VAV", 180, 90), sp("0.3", 260, 90), sp("TITUS", 360, 90), sp("1", 760, 90),
      sp("VVR2 - 10", 0, 110), sp("VAV", 180, 110), sp("0.32", 260, 110), sp("TITUS", 360, 110), sp("1", 760, 110),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  assert.equal(tables.length, 1, `expected one terminal-unit table, got ${tables.map((t) => t.title?.text).join(" | ")}`);
  assert.deepEqual(tables[0].rows.map((r) => r.key), ["VVR1-5", "VVR2-8", "VVR2-10"], "every riser-numbered tag must key its own row, none unkeyed/orphaned");
  const byKey = Object.fromEntries(tables[0].rows.map((r) => [r.key, r.cells]));
  assert.equal(byKey["VVR2-8"].GPM.text, "0.3", "VVR2-8's own real value, not merged with a neighbor's");
  assert.equal(byKey["VVR2-10"].GPM.text, "0.32");
});

test("findHeaderRow's ambiguous-duplicate-column path resolves a duplicate leaf label by a non-vocabulary parent PHRASE, not just a vocabulary word (real bug: St Louis VA's own STEAM HEATING COIL SCHEDULE)", () => {
  // Real, found-live gap (2026-09-03): a table with two separate columns
  // both literally labeled "MARK" — the row's own equipment tag, and a
  // second "STEAM TRAP MARK" sitting under a real parent phrase, "STEAM
  // TRAP", one tier above it. findHeaderRow's own duplicate-label handling
  // (dup.has(h.label) path) disambiguates by looking for a parent — but it
  // called parentLabelOver, which only recognizes a VOCABULARY word as a
  // parent. "STEAM TRAP" names no word in EQUIPMENT_HEADERS, so the lookup
  // returned null, the second MARK collided with the first, and its whole
  // column silently dropped. parentPhraseOver (already used elsewhere in
  // this file for exactly this "a real parent isn't always vocabulary"
  // shape) is vocabulary-first, phrase-second — switched to it here.
  //
  // Row keys here are deliberately letter-first (RH-1, not St Louis's own
  // real building-prefixed 1-RH-1) — isolating THIS fix from the separate,
  // still-open building-prefix gap this same investigation found (CODE_RE
  // rejects a leading digit outright; see this rule's own GOAL.md entry).
  // That gap is real but is not what this test covers.
  const sp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 6, h: 8 });
  const sched: SheetSpans = {
    key: "steam-coil.pdf#1",
    sheet_number: "MP101",
    spans: [
      sp("STEAM HEATING COIL SCHEDULE", 100, 10),
      // a real phrase parent, non-vocabulary — sits one tier above the
      // SECOND "MARK" only, exactly the real shape found live
      sp("STEAM", 500, 40), sp("TRAP", 540, 40),
      // leaf row: two columns both hit vocabulary word "MARK"
      sp("MARK", 0, 70), sp("TYPE", 120, 70), sp("GPM", 240, 70), sp("MANUFACTURER", 360, 70), sp("MARK", 500, 70),
      sp("RH-1", 0, 95), sp("DUCT", 120, 95), sp("2.5", 240, 95), sp("TRANE", 360, 95), sp("TP28-1", 500, 95),
      sp("RH-2", 0, 115), sp("DUCT", 120, 115), sp("3.1", 240, 115), sp("TRANE", 360, 115), sp("TP28-2", 500, 115),
      sp("RH-3", 0, 135), sp("DUCT", 120, 135), sp("2.9", 240, 135), sp("TRANE", 360, 135), sp("TP28-3", 500, 135),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  assert.equal(tables.length, 1, `expected one steam coil table, got ${tables.map((t) => t.title?.text).join(" | ")}`);
  assert.ok(tables[0].headers.includes("MARK"), `the row's own bare MARK must survive: ${tables[0].headers.join(" | ")}`);
  assert.ok(tables[0].headers.includes("STEAM TRAP MARK"), `the second MARK must take its real, non-vocabulary parent's name, not vanish: ${tables[0].headers.join(" | ")}`);
  const r1 = tables[0].rows.find((r) => r.key === "RH-1")!;
  assert.ok(r1, "the row's own real MARK must still key its own row");
  assert.equal(r1.cells["STEAM TRAP MARK"].text, "TP28-1", "the second MARK column's own real data must not be dropped or misrouted");
});

test("rowKeyOf splits a real '&'-joined twin-unit mark into two answerable keys (real bug: 023_US_Chiller_Replacement's own CH-1&2/CHWP1&2)", () => {
  // Real, found-live gap (2026-09-03): "&" fails the general character
  // allow-list, so a real twin-unit row like "CH-1&2" (two identical
  // chillers sharing one schedule row) collapsed into one glued,
  // unsplittable key "CH-12" — never answering for the real "CH-1" or
  // "CH-2" tags drawn on the actual plan. Both real shapes covered: with
  // a hyphen (CH-1&2) and without one (CHWP1&2, confirmed against the
  // real page's own word coordinates — genuinely no hyphen in the source).
  const sched: SheetSpans = {
    key: "amp.pdf#1", sheet_number: "M601",
    spans: [
      sp("AIR COOLED CHILLER SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("MANUFACTURER", 180, 40), sp("TYPE", 360, 40), sp("TONS", 500, 40),
      sp("CH-1&2", 0, 70), sp("TRANE", 180, 70), sp("SCROLL", 360, 70), sp("132", 500, 70),
    ],
  };
  const tab = extractTable(sched, "equipment")!;
  assert.ok(tab, "the real vocabulary anchors are enough to clear the bar");
  assert.equal(tab.rows.length, 1, "one real physical row, both marks answerable from it");
  const row = tab.rows[0];
  assert.equal(row.key, "CH-1/CH-2", "both real marks are kept, hyphen preserved exactly as drawn");
  assert.ok(rowKeyAnswersFor(row.key, "CH-1"), "CH-1 must be answerable from this row");
  assert.ok(rowKeyAnswersFor(row.key, "CH-2"), "CH-2 must be answerable from this row");

  const schedNoHyphen: SheetSpans = {
    key: "amp2.pdf#1", sheet_number: "M601",
    spans: [
      sp("PUMP SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("MANUFACTURER", 180, 40), sp("TYPE", 360, 40), sp("GPM", 500, 40),
      sp("CHWP1&2", 0, 70), sp("TACO", 180, 70), sp("END-SUCTION", 360, 70), sp("530", 500, 70),
    ],
  };
  const tab2 = extractTable(schedNoHyphen, "equipment")!;
  assert.ok(tab2, "the real vocabulary anchors are enough to clear the bar");
  const row2 = tab2.rows[0];
  assert.equal(row2.key, "CHWP1/CHWP2", "the no-hyphen real shape is kept exactly as drawn, not invented");
  assert.ok(rowKeyAnswersFor(row2.key, "CHWP1"));
  assert.ok(rowKeyAnswersFor(row2.key, "CHWP2"));
});

test("rowKeyOf accepts a real VA/GSA numbered-building prefix before an equipment mark, when the sheet's own text confirms the building (real bug: St Louis VA's own 1-RH-1/1-AC-15/1-SHC-28 tags)", () => {
  // Real, found-live gap (2026-09-03), traced empirically (byte-identical
  // pipeline output before/after a different fix proved this was the real
  // blocker, not guessed): CODE_RE is letter-first by design — every
  // alternative starts `[A-Z]` — so a real VA/GSA numbered-building prefix
  // ("1-RH-1", "1-AC-15", "1-SHC-28") fails outright, table-wide, on EVERY
  // row of a schedule using this real, common convention. Confirmed live:
  // St Louis VA's own real AIR HANDLING UNIT SCHEDULE keyed only 1 of its
  // real rows ("AC-57", no prefix) — every "1-AC-*" row silently dropped.
  // Building "1" is confirmed real via buildingMentions (158 "BUILDING 1"
  // hits across the real document) — the same discipline the room-finish
  // branch already uses for its own mirror-image shape (a LETTER building
  // before a digit room number) is extended here for a DIGIT building
  // before a letter-starting equipment/finish code. The FULL printed mark
  // (prefix included) is kept as the row's real key.
  const sp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });
  const sched: SheetSpans = {
    key: "bldg-prefix.pdf#1",
    sheet_number: "MP101",
    spans: [
      sp("BUILDING 1 REHEAT COIL SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("TYPE", 180, 40), sp("GPM", 260, 40), sp("MANUFACTURER", 360, 40), sp("REMARKS", 760, 40),
      sp("1-RH-1", 0, 70), sp("DUCT", 180, 70), sp("2.5", 260, 70), sp("TRANE", 360, 70), sp("1", 760, 70),
      sp("1-RH-2", 0, 90), sp("DUCT", 180, 90), sp("3.1", 260, 90), sp("TRANE", 360, 90), sp("1", 760, 90),
      sp("1-RH-3", 0, 110), sp("DUCT", 180, 110), sp("2.9", 260, 110), sp("TRANE", 360, 110), sp("1", 760, 110),
    ],
  };
  const buildings = new Set(["1"]);
  const withBuilding = extractAllTables(sched, "equipment", { buildings });
  assert.equal(withBuilding.length, 1, `expected one table once building "1" is known: ${withBuilding.map((t) => t.title?.text).join(" | ")}`);
  assert.deepEqual(withBuilding[0].rows.map((r) => r.key), ["1-RH-1", "1-RH-2", "1-RH-3"], "every building-prefixed mark must key its own row, full mark kept (prefix included)");
  assert.equal(withBuilding[0].rows.find((r) => r.key === "1-RH-2")!.cells.GPM.text, "3.1");

  // Without a confirmed building, the same digit prefix must NOT be
  // guessed at — a bare leading digit is otherwise indistinguishable from
  // a stray dimension/callout number, and this table's title alone must
  // never be read as proof (the real discriminator is buildingMentions,
  // not this).
  const withoutBuilding = extractAllTables(sched, "equipment", {});
  assert.equal(withoutBuilding.length, 0, "an unconfirmed digit prefix must not be guessed at — real refusal, not a fabricated key");
});

test("rowKeyOf accepts a real floor+area+room mark (digit before the letter) alongside its letter-first siblings (real bug: 038_NC_VA_Project_637_22_700's own MECHANICAL EQUIPMENT SCHEDULE)", () => {
  // Real, found-live gap (2026-09-03), confirmed against real page
  // coordinates: 16 of 51 real rows on this one real table (47-IDU-1A137,
  // 47-ODU-2B212, 47-IDU-2E202A, ...) never became rows at all, while
  // their siblings on the SAME table (47-IDU-A301, 47-IDU-BC118A, ...)
  // keyed fine — both shapes sit in the same real column, same building
  // prefix "47", confirmed via real word coordinates (same x, continuous
  // y order, not a second table). The real difference is a DIGIT
  // immediately before the letter in the mark's own hyphen segment
  // ("1A137" — floor "1", area "A", room "137") — a shape CODE_RE's own
  // two hyphen-segment alternatives both reject (one requires a letter
  // first, the other requires only letters after the digits, never a
  // digit again). Fixture mirrors the real shape: both a floor+area+room
  // mark ("47-IDU-1A137") and a letter-first sibling ("47-IDU-A301") in
  // the same real table, same building prefix, exactly as drawn.
  const sp = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });
  const sched: SheetSpans = {
    key: "floor-area-room.pdf#1",
    sheet_number: "E501",
    spans: [
      sp("MECHANICAL EQUIPMENT SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("MANUFACTURER", 200, 40), sp("VOLTAGE", 500, 40), sp("MCA", 600, 40),
      sp("47-IDU-1A137", 0, 70), sp("MITSUBISHI", 200, 70), sp("208", 500, 70), sp("4", 600, 70),
      sp("47-IDU-A301", 0, 90), sp("MITSUBISHI", 200, 90), sp("208", 500, 90), sp("4", 600, 90),
    ],
  };
  const buildings = new Set(["47"]);
  const table = extractTable(sched, "equipment", { buildings })!;
  assert.ok(table, "the real vocabulary anchors are enough to clear the bar");
  assert.deepEqual(
    table.rows.map((r) => r.key).sort(),
    ["47-IDU-1A137", "47-IDU-A301"],
    "both the floor+area+room mark and its letter-first sibling must key their own real rows, full mark kept",
  );

  // The real "2X4"/"1X4" LUMINAIRE SIZE callout this file's own LED
  // LUMINAIRE SCHEDULE test uses (a description value, never a real key)
  // must keep failing CODE_RE — this new shape requires 2-4 room digits
  // after the letter, one more than "2X4"'s single trailing digit, so a
  // dimension callout in the KEY column's own position must not be
  // mistaken for a floor+area+room mark. Placed directly in the MARK
  // column (not just as a description value elsewhere) to prove the
  // refusal, not assume it.
  const sizeCallout: SheetSpans = {
    key: "size-callout.pdf#1",
    sheet_number: "E501",
    spans: [
      sp("LED LUMINAIRE SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("MANUFACTURER", 200, 40), sp("VOLTAGE", 500, 40), sp("MCA", 600, 40),
      sp("R1", 0, 70), sp("FLUXWERX", 200, 70), sp("120", 500, 70), sp("2", 600, 70),
      sp("2X4", 0, 90), sp("FLUXWERX", 200, 90), sp("120", 500, 90), sp("2", 600, 90),
    ],
  };
  const calloutTable = extractTable(sizeCallout, "equipment", { buildings: new Set(["47"]) })!;
  assert.ok(calloutTable, "the real vocabulary anchors are enough to clear the bar");
  assert.deepEqual(calloutTable.rows.map((r) => r.key), ["R1"], "a real dimension/size callout ('2X4') in the key column must not become a false key or row");
});

test("bandDataRows: a trailing 'NOTES:' caption is refused as a phantom row, not real data (real bug: 017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling's own HEATING COIL SCHEDULE)", () => {
  // Real, found-live gap (2026-09-03): "NOTES" passes CODE_RE's own generic
  // 1-4-letters-plus-more-alnum shape, so a trailing "NOTES:" section
  // caption below a real table reads as a plausible new row's own key —
  // and every column ends up crediting that same literal "NOTES:" text.
  // Real, corpus-found: three separate real tables on this one real sheet
  // (HEATING COIL, STEAM TRAP-style, HUMIDIFIER schedules) each ended with
  // this exact phantom row. Fixture mirrors the real shape: 2 genuine rows
  // with real, DIFFERENT per-column data, then a trailing "NOTES:" token
  // repeated under every column exactly the way the real page draws it.
  const sched: SheetSpans = {
    key: "notes-cap.pdf#1", sheet_number: "M12",
    spans: [
      sp("HEATING COIL SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("CFM", 150, 40), sp("MBH", 300, 40), sp("EAT", 450, 40),
      sp("HC-A-1", 0, 70), sp("15,795", 150, 70), sp("912", 300, 70), sp("0", 450, 70),
      sp("HC-A-2", 0, 90), sp("19,490", 150, 90), sp("1,119", 300, 90), sp("0", 450, 90),
      sp("NOTES:", 0, 120), sp("NOTES:", 150, 120), sp("NOTES:", 300, 120), sp("NOTES:", 450, 120),
    ],
  };
  const tab = extractTable(sched, "equipment")!;
  assert.ok(tab, "the real table itself must still extract");
  assert.deepEqual(tab.rows.map((r) => r.key), ["HC-A-1", "HC-A-2"], `the trailing NOTES: caption must never appear as a row: ${tab.rows.map((r) => r.key).join(", ")}`);

  // A real row that legitimately repeats a short, non-caption value (e.g.
  // "N/A") across several columns must NOT be caught by this — real
  // regression this exact scoping (colon-suffixed labels only) fixes.
  const naSched: SheetSpans = {
    key: "na-repeat.pdf#1", sheet_number: "M13",
    spans: [
      sp("SPECIFICATION INDEX", 100, 10),
      sp("NO", 0, 40), sp("NAME", 150, 40), sp("FLOOR", 300, 40), sp("BASE", 450, 40), sp("WALL", 600, 40),
      sp("201", 0, 70), sp("SEE SPEC", 150, 70), sp("N/A", 300, 70), sp("N/A", 450, 70), sp("N/A", 600, 70),
    ],
  };
  const naTab = extractTable(naSched, "room-finish")!;
  assert.ok(naTab, "a real row repeating a legitimate short value must still extract");
  assert.equal(naTab.rows.length, 1, "the real N/A row must not be dropped");
});

test("bandDataRows: a trailing BARE 'NOTES' caption (no colon) is also refused as a phantom row (real bug: 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers's own FAN SCHEDULE, GENERATOR FUEL OIL PUMP SCHEDULE, and PACKAGED DEAERATOR TANK SCHEDULE)", () => {
  // Real, found-live gap (2026-09-03): the colon-only guard above catches a
  // real "NOTES:" caption, but this real document draws its own section
  // heading as a BARE "NOTES" — no trailing colon — immediately below the
  // last real data row, with the numbered note list starting on the NEXT
  // line. Confirmed via a real cell-by-cell dump against the live document:
  // FAN SCHEDULE's real 7th row (SF-1) was followed by an 8th "row" whose
  // every cell read the literal text "NOTES"; the same shape ended
  // GENERATOR FUEL OIL PUMP SCHEDULE (1 real row + this phantom) and
  // PACKAGED DEAERATOR TANK SCHEDULE (1 real row + this phantom).
  const sched: SheetSpans = {
    key: "bare-notes-cap.pdf#1", sheet_number: "M21",
    spans: [
      sp("FAN SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("CFM", 150, 40), sp("MBH", 300, 40), sp("EAT", 450, 40),
      sp("EF-1", 0, 70), sp("5000", 150, 70), sp("912", 300, 70), sp("0", 450, 70),
      sp("EF-2", 0, 90), sp("5000", 150, 90), sp("1119", 300, 90), sp("0", 450, 90),
      sp("NOTES", 0, 120), sp("NOTES", 150, 120), sp("NOTES", 300, 120), sp("NOTES", 450, 120),
    ],
  };
  const tab = extractTable(sched, "equipment")!;
  assert.ok(tab, "the real table itself must still extract");
  assert.deepEqual(tab.rows.map((r) => r.key), ["EF-1", "EF-2"], `the trailing bare NOTES caption must never appear as a row: ${tab.rows.map((r) => r.key).join(", ")}`);

  // A real row that legitimately repeats a short, non-caption value must
  // still NOT be caught — same negative control as the colon-suffixed case
  // above, confirming "NOTES" is matched as a whole word, not a substring.
  const naSched: SheetSpans = {
    key: "na-repeat-2.pdf#1", sheet_number: "M22",
    spans: [
      sp("SPECIFICATION INDEX", 100, 10),
      sp("NO", 0, 40), sp("NAME", 150, 40), sp("FLOOR", 300, 40), sp("BASE", 450, 40), sp("WALL", 600, 40),
      sp("201", 0, 70), sp("SEE SPEC", 150, 70), sp("N/A", 300, 70), sp("N/A", 450, 70), sp("N/A", 600, 70),
    ],
  };
  const naTab = extractTable(naSched, "room-finish")!;
  assert.ok(naTab, "a real row repeating a legitimate short value must still extract");
  assert.equal(naTab.rows.length, 1, "the real N/A row must not be dropped");
});

test("resolveKeyCollisions composes a real split TYPE+NUMBER tag into an answerable key (real bug: 032_PA_Construct_EHRM_Infrastructure's own SPLIT SYSTEM INDOOR/OUTDOOR UNIT SCHEDULEs, 6 more real equipment tables on the same document)", () => {
  // Real, found-live gap (2026-09-03): this real document splits its own
  // equipment tag across TWO columns (TYPE="AC", a short prefix shared by
  // every row; EQUIPMENT NUMBER="1-A001D"/"1-A154A", the real per-row
  // differentiator) instead of drawing it as one glued mark. The key
  // column is always this file's own leftmost real column (TYPE here) —
  // every one of 38 real, distinct units collided onto the identical
  // literal key "AC". Confirmed live (2026-09-03) that the real bug comes
  // through the ODL path (`scheduleTableFromODL`), not the geometric one
  // (`bandDataRows`) — a debug rebuild of the real document showed the
  // geometric-path fix had zero effect — so `resolveKeyCollisions` is
  // tested directly here, decoupled from either path's own header-
  // qualification machinery, with real corpus verification (both paths
  // now call this same function) covering the end-to-end integration.
  const cell = (text: string): { text: string; bbox: [number, number, number, number] } => ({ text, bbox: [0, 0, 0, 0] });
  const row = (key: string, cells: Record<string, string>): TableRow => ({
    key, sheet: "set.pdf#2", cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, cell(v)])),
  });
  const rows: TableRow[] = [
    row("AC", { TYPE: "AC", "EQUIPMENT NUMBER": "1-A001D", MANUFACTURER: "LIEBERT" }),
    row("AC", { TYPE: "AC", "EQUIPMENT NUMBER": "1-A154A", MANUFACTURER: "LIEBERT" }),
  ];
  const resolved = resolveKeyCollisions(rows);
  assert.deepEqual(
    resolved.map((r) => r.key),
    ["AC 1-A001D", "AC 1-A154A"],
    "each real, distinct unit must key its own row, not collide on the shared TYPE prefix",
  );
  assert.ok(rowKeyAnswersFor(resolved[0].key, "AC 1-A001D"));
  assert.ok(rowKeyAnswersFor(resolved[1].key, "AC 1-A154A"));

  // The real dual-row-per-unit convention (031_MO_VA's own FAN SCHEDULE:
  // the SAME real fan legitimately gets two rows, "SELECTION CRITERIA" /
  // "OPERATING CONDITION", the SAME key on purpose) must NOT be split —
  // its own per-row differentiator sits in REMARKS/a numeric column, never
  // a header actually naming an identifier, so this fix must leave it
  // alone.
  const dualRows: TableRow[] = [
    row("WHSE-SF1", { MARK: "WHSE-SF1", MANUFACTURER: "TRANE", CFM: "13500", REMARKS: "SELECTION CRITERIA" }),
    row("WHSE-SF1", { MARK: "WHSE-SF1", MANUFACTURER: "TRANE", CFM: "11250", REMARKS: "OPERATING CONDITION" }),
  ];
  const dualResolved = resolveKeyCollisions(dualRows);
  assert.deepEqual(
    dualResolved.map((r) => r.key),
    ["WHSE-SF1", "WHSE-SF1"],
    "a real dual-row-per-unit convention must keep its own shared key, not be split apart",
  );

  // A collision with no differentiator column at all (neither the real
  // shape above nor the dual-row-per-unit one) must be left untouched,
  // not thrown or guessed at.
  const noCandidate: TableRow[] = [
    row("X", { MARK: "X", MANUFACTURER: "TRANE" }),
    row("X", { MARK: "X", MANUFACTURER: "CARRIER" }),
  ];
  assert.deepEqual(resolveKeyCollisions(noCandidate).map((r) => r.key), ["X", "X"], "no identifier-named column to differentiate on — left alone, never guessed at");
});

test("splitMergedRows unwinds two real rows clustered into one, and rowKeyOf accepts a real 3-level building-floor-equipment tag (real bug: 036_LA_VA_Project_502_21_222's own VRV- INDOOR UNIT SCHEDULE and DUCTLESS SPLIT SYSTEM SCHEDULE)", () => {
  // Real, found-live gap (2026-09-03): a dense real page clustered TWO
  // real physical rows into one `clusterRows` Y-band — every cell's own
  // text then concatenated both real rows' values, space-joined
  // ("07-B-EU-1 07-1-EU-1", "TR 017 TR 1A-184A", "27,335 27,335"). Real
  // ground truth: 15 real distinct VRV indoor units on this one table;
  // only 1 merged row ever appeared before this fix.
  const cell = (text: string): { text: string; bbox: [number, number, number, number] } => ({ text, bbox: [0, 0, 0, 0] });
  const row = (key: string, cells: Record<string, string>): TableRow => ({
    key, sheet: "set.pdf#63", cells: Object.fromEntries(Object.entries(cells).map(([k, v]) => [k, cell(v)])),
  });
  const buildings = new Set(["07"]);
  const merged: TableRow[] = [
    row("07-B-EU-1", {
      TAG: "07-B-EU-1 07-1-EU-1",
      ROOM: "TR 017 TR 1A-184A",
      TYPE: "Wall Mounted Unit Wall Mounted Unit",
      "HEATING CAPACITY TOTAL": "27,335 27,335",
      AMPS: "0.6 0.6",
    }),
  ];
  const split = splitMergedRows(merged, "equipment", buildings, false);
  assert.deepEqual(split.map((r) => r.key), ["07-B-EU-1", "07-1-EU-1"], "two real, distinct rows must be recovered, not left glued together");
  assert.equal(split[0].cells.ROOM.text, "TR 017", "each recovered row's own cells must carry only its own real value");
  assert.equal(split[1].cells.ROOM.text, "TR 1A-184A");
  assert.equal(split[0].cells.AMPS.text, "0.6");
  assert.equal(split[1].cells.AMPS.text, "0.6");

  // An ordinary, unmerged row (any real single-mark row) must never be
  // split — the double-agreement bar (every word-group independently
  // answers rowKeyOf AND every other cell divides evenly by the same
  // count) is specific enough that a real MANUFACTURER/REMARKS cell with
  // an unrelated even word count must not trip it.
  const ordinary: TableRow[] = [
    row("EF-1", { TAG: "EF-1", MANUFACTURER: "GREENHECK MODEL", CFM: "1200" }),
  ];
  assert.deepEqual(splitMergedRows(ordinary, "equipment", buildings, false).map((r) => r.key), ["EF-1"], "an ordinary single-mark row must never be split");

  // A row whose OTHER cells don't divide evenly by the same count found
  // in the identity cell must be left completely untouched — never a
  // partial/guessed split.
  const uneven: TableRow[] = [
    row("07-B-EU-1", { TAG: "07-B-EU-1 07-1-EU-1", REMARKS: "ONE SHARED NOTE" }),
  ];
  assert.deepEqual(splitMergedRows(uneven, "equipment", buildings, false).map((r) => r.key), ["07-B-EU-1"], "an uneven cell (REMARKS: 3 words, not divisible by 2) must refuse the whole split");

  // rowKeyOf's own real 3-level building-floor-equipment gap this fix
  // also closes: 036's own DUCTLESS SPLIT SYSTEM SCHEDULE uses the same
  // shape ("07-1-DAC-1" — building 07, floor 1, equipment DAC-1) via
  // extractTable directly, confirming the whole pipeline recovers it.
  const sched: SheetSpans = {
    key: "floor-tag.pdf#1", sheet_number: "M602",
    spans: [
      sp("DUCTLESS SPLIT SYSTEM SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("MANUFACTURER", 150, 40), sp("VOLTAGE", 350, 40), sp("PHASE", 500, 40),
      sp("07-1-DAC-1", 0, 70), sp("SAMSUNG", 150, 70), sp("208", 350, 70), sp("1", 500, 70),
      sp("07-1-DAC-2", 0, 90), sp("SAMSUNG", 150, 90), sp("208", 350, 90), sp("1", 500, 90),
    ],
  };
  const tab = extractTable(sched, "equipment", { buildings })!;
  assert.ok(tab, "the real vocabulary anchors are enough to clear the bar");
  assert.deepEqual(tab.rows.map((r) => r.key), ["07-1-DAC-1", "07-1-DAC-2"], "the real 3-level building-floor-equipment tag must key its own row");

  // The real "BUILDING 9" (not "09") drawing-index wording this fix also
  // accepts — a confirmed building recorded either zero-padded or not
  // must both resolve the same real, zero-padded per-unit tag.
  const unpaddedBuildings = new Set(["9"]);
  const paddedSched: SheetSpans = {
    key: "floor-tag2.pdf#1", sheet_number: "M602",
    spans: [
      sp("DUCTLESS SPLIT SYSTEM SCHEDULE", 100, 10),
      sp("MARK", 0, 40), sp("MANUFACTURER", 150, 40), sp("VOLTAGE", 350, 40), sp("PHASE", 500, 40),
      sp("09-1-DAC-1", 0, 70), sp("SAMSUNG", 150, 70), sp("208", 350, 70), sp("1", 500, 70),
      sp("09-2-DAC-1", 0, 90), sp("SAMSUNG", 150, 90), sp("208", 350, 90), sp("1", 500, 90),
    ],
  };
  const paddedTab = extractTable(paddedSched, "equipment", { buildings: unpaddedBuildings })!;
  assert.ok(paddedTab, "the real vocabulary anchors are enough to clear the bar");
  assert.deepEqual(paddedTab.rows.map((r) => r.key), ["09-1-DAC-1", "09-2-DAC-1"], "a zero-padded tag must resolve against an unpadded confirmed building");
});

test("WP1.4 title hunt: SCHEDULED note prose must not steal the real title (Northport AIR INLETS shape)", () => {
  const sp = (str: string, x: number, y: number, h = 8): GraphSpan => ({ str, x, y, w: str.length * 5, h });
  const sched: SheetSpans = {
    key: "inlets.pdf#1",
    sheet_number: "M88",
    spans: [
      sp("AIR INLETS & OUTLETS", 100, 10, 14),
      sp("10. AIRFLOWS SCHEDULED ARE FINAL BALANCING VALUES", 400, 28, 8),
      sp("TAG", 0, 50), sp("SIZE", 100, 50), sp("CFM", 200, 50), sp("MCA", 300, 50), sp("MOCP", 400, 50), sp("VOLTAGE", 500, 50), sp("PHASE", 600, 50),
      sp("D-1", 0, 80), sp("6", 100, 80), sp("60", 200, 80), sp("10", 300, 80), sp("15", 400, 80), sp("120", 500, 80), sp("1", 600, 80),
      sp("R-1", 0, 100), sp("8", 100, 100), sp("80", 200, 100), sp("10", 300, 100), sp("15", 400, 100), sp("120", 500, 100), sp("1", 600, 100),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  assert.ok(tables.length >= 1, "equipment table extracted");
  const hit = tables.find((t) => (t.rows || []).some((r) => r.key === "D-1"));
  assert.ok(hit, "D-1 row present");
  assert.match(String(hit!.title?.text || ""), /AIR INLETS/i);
  assert.ok(!/AIRFLOWS SCHEDULED/i.test(String(hit!.title?.text || "")), "numbered SCHEDULED note must not be the title");
});

test("title hunt: a genuine 2-word BIG-FONT title (no \"SCHEDULE\" word) is now correctly kept (GOAL.md rule 17, fixed 2026-09-04)", () => {
  // Real, found-live gap (2026-09-03), root-caused against the actual
  // rendered page, not guessed: 013_MO_T2523_01_Replace_Boilers_Phase_2's
  // own "CONTROL VALVES" table title never qualified as a title candidate
  // at all — it names no "SCHEDULE" word, and the STAGE 1 big-font
  // fallback's own word-count floor required 3+ words. Confirmed against
  // real page coordinates: CONTROL/VALVES render at height 25 vs the
  // header row's own 12.5 (ratio 2.0, comfortably clearing
  // BIG_FONT_RATIO2=1.6) — a real, big-font, genuine title, just short.
  //
  // A fix (loosening this one branch's floor from 3 words to 2) was tried
  // and REVERTED same day — real regression, verified against the actual
  // rebuilt pipeline output, not theoretical: on the SAME real sheet, a
  // separate "FLOW METER DEVICES" table (also real, also big-font, and
  // ALREADY 3+ words) had its own correct, closer title stolen by
  // "CONTROL VALVES" instead.
  //
  // RE-APPLIED 2026-09-04 after a real debug trace (not a retry of the
  // same guess): instrumented the live STAGE 1 loop against the real
  // rebuilt 013_MO_T2523_01 document and confirmed both tables' own title
  // hunts now correctly find their OWN nearest single-span title, on 4
  // separate real fragments of each table — the theft did not reproduce.
  // Most likely fixed as a side effect of this session's own rules
  // 16/23/24(a)/26 (all touched the same header/row-banding paths this
  // title hunt walks). Re-confirmed against BOTH real sets rule 17 named
  // (013_MO_T2523_01 and 004_MO_T2504_03) — neither shows the theft. See
  // GOAL.md rule 17 for the full writeup.
  const sp = (str: string, x: number, y: number, h = 8): GraphSpan => ({ str, x, y, w: str.length * 5, h });
  const sched: SheetSpans = {
    key: "cv.pdf#1",
    sheet_number: "M20",
    spans: [
      sp("CONTROL VALVES", 100, 10, 25),
      sp("TAG", 0, 60, 12.5), sp("MANUFACTURER", 100, 60, 12.5), sp("MODEL", 300, 60, 12.5), sp("GPM", 450, 60, 12.5),
      sp("CV-1", 0, 90, 12.5), sp("BELIMO", 100, 90, 12.5), sp("B-100", 300, 90, 12.5), sp("2.5", 450, 90, 12.5),
      sp("CV-2", 0, 110, 12.5), sp("BELIMO", 100, 110, 12.5), sp("B-100", 300, 110, 12.5), sp("2.5", 450, 110, 12.5),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  const hit = tables.find((t) => (t.rows || []).some((r) => r.key === "CV-1"));
  assert.ok(hit, "CV-1 row present");
  assert.equal(hit!.title?.text, "CONTROL VALVES", `a genuine 2-word big-font title must now be kept: got ${JSON.stringify(hit!.title?.text)}`);
});

test("title hunt: an ordinary-font 2-word phrase is still correctly refused (GOAL.md rule 17 — the font gate, not word count alone, keeps this safe)", () => {
  const sp = (str: string, x: number, y: number, h = 8): GraphSpan => ({ str, x, y, w: str.length * 5, h });
  const sched: SheetSpans = {
    key: "cv2.pdf#1",
    sheet_number: "M21",
    spans: [
      sp("SEE NOTES", 100, 10, 12.5), // same size as the header row — no big-font signal
      sp("TAG", 0, 60, 12.5), sp("MANUFACTURER", 100, 60, 12.5), sp("MODEL", 300, 60, 12.5), sp("GPM", 450, 60, 12.5),
      sp("CV-1", 0, 90, 12.5), sp("BELIMO", 100, 90, 12.5), sp("B-100", 300, 90, 12.5), sp("2.5", 450, 90, 12.5),
      sp("CV-2", 0, 110, 12.5), sp("BELIMO", 100, 110, 12.5), sp("B-100", 300, 110, 12.5), sp("2.5", 450, 110, 12.5),
    ],
  };
  const tables = extractAllTables(sched, "equipment");
  const hit = tables.find((t) => (t.rows || []).some((r) => r.key === "CV-1"));
  assert.ok(hit, "CV-1 row present");
  assert.equal(hit!.title, null, `an ordinary-font 2-word phrase must not become a title: got ${JSON.stringify(hit!.title?.text)}`);
});

test("a table's own big-font TITLE never becomes a leaf column's parent, however close it lands (GOAL.md rule 20(c), fixed 2026-09-04)", () => {
  // Real bug, found doing genuinely verified per-set work on
  // 004_MO_T2504_03_Interior_and_Exterior_Renovation's own real "GAS WATER
  // HEATER SCHEDULE" table: extracted headers came back
  // ["MARK","MANUFACTURER","MODEL","GAS WATER HEATER SCHEDULE MBH","REMARKS"]
  // — the table's own title text glued onto a real column. Confirmed by a
  // real live debug trace (not guessed): TANK and HEAT SOURCE — the table's
  // own real columns with zero vocabulary representation (GOAL.md rule
  // 20(a)) — cluster into a "loose" 2-token run right beside the real
  // vocabulary-recognized columns, and `genuineParentOver`, called to
  // resolve that run's own group parent, found no qualifying nearby
  // vocabulary or phrase and fell through to its own geometric-overlap
  // phrase search — which a real title, spanning the table's ENTIRE width,
  // satisfies for almost any column beneath it (its own `boxGap` check has
  // no notion of the CANDIDATE's own font size, only raw horizontal
  // distance), so the title text — at ~2x the header row's own font height
  // (confirmed live: real title 19px vs the real header row's own 9.5px) —
  // won over the correct "no real parent here" answer, close enough (34.6px,
  // confirmed live) to clear this function's own `near` reach. Real,
  // corpus-found (rule 20's own count): six of this set's fourteen tables
  // show some version of this pattern.
  //
  // Fixed the same way rule 17's own title hunt already is: any candidate at
  // or above BIG_FONT_RATIO-scale of the header row's own font is refused as
  // a parent outright, before the geometric-overlap/phrase-shape checks ever
  // run — a genuine parent tier renders at roughly the same size as the leaf
  // tier it labels; the table's own title never does. This fixture mirrors
  // the real page's own real proportions (font heights, row gaps) directly —
  // verified to actually reproduce the bug with the fix disabled before this
  // test was written, per this session's own fixture-verification discipline.
  const sp = (str: string, x: number, y: number, h = 8): GraphSpan => ({ str, x, y, w: str.length * 5, h });
  const sched: SheetSpans = {
    key: "gwh.pdf#31",
    sheet_number: "M601",
    spans: [
      sp("GAS WATER HEATER SCHEDULE", 400, 0, 19),
      sp("MARK", 0, 34.6, 9.5), sp("MANUFACTURER", 100, 34.6, 9.5), sp("MODEL", 300, 34.6, 9.5),
      sp("TANK", 450, 34.6, 9.5), sp("SOURCE", 550, 34.6, 9.5),
      sp("MBH", 650, 34.6, 9.5), sp("REMARKS", 900, 34.6, 9.5),
      sp("GWH-1", 0, 66, 9.5), sp("LOCHINVAR", 100, 66, 9.5), sp("AWN286PM", 300, 66, 9.5),
      sp("ST-1", 450, 66, 9.5), sp("GAS", 550, 66, 9.5),
      sp("285", 650, 66, 9.5), sp("ALL", 900, 66, 9.5),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the real GWH-1 row alone is enough to clear the bar");
  assert.ok(!tab!.headers.some((h) => /SCHEDULE/.test(h)), `no header may carry the table's own title text: got ${JSON.stringify(tab!.headers)}`);
  assert.ok(tab!.headers.includes("MBH"), `MBH must survive as its own plain column: got ${JSON.stringify(tab!.headers)}`);
});

test("a table's own big-font TITLE never becomes a duplicate column's parent either, same bug as rule 20(c) but a sibling function (GOAL.md rule 20(c), extended, fixed 2026-09-04)", () => {
  // Real bug, found running the actual UI path against a real corpus PDF
  // (this session's own explicit UI-path verification pass, not a unit
  // test) — a second, sibling instance of rule 20(c)'s exact bug that its
  // original fix never covered. `genuineParentOver` (rule 20(c)'s own fix
  // target) resolves a parent for a "loose run" of zero-vocabulary tokens;
  // `parentPhraseOver` is a SEPARATE function, called instead when an
  // already-vocabulary-matched header LABEL is ambiguous (two "SIZE"
  // columns, resolved via the "…takes its parent's name" path a few lines
  // above this file's own `dup.has(h.label)` branch) — same missing-guard
  // shape, same real symptom, different call site rule 20(c)'s own fix
  // never touched.
  //
  // Confirmed live (not guessed): a real, unmodified rebuild of
  // 004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf via the actual
  // production CLI (same Session+ODL path the UI and MCP both use), with
  // temporary DEBUG_R20C tracing in parentPhraseOver's own phrase-fallback
  // loop, showed SIX real tables on this one document each having their
  // own title text glued onto a real column this same way — GREASE
  // INTERCEPTOR SCHEDULE, EXPANSION TANK SCHEDULE, THERMOSTATIC MIXING
  // VALVE SCHEDULE, HOT WATER RETURN PUMP SCHEDULE, AIR DEVICE SCHEDULE
  // (real real-document header seen: ["MARK","MATERIAL","SIZE","AIR DEVICE
  // SCHEDULE SIZE","REMARKS"] — its own SECOND "SIZE" column mislabeled),
  // ROOFTOP UNIT SCHEDULE — every wrongly-grabbed run measured ~2x that
  // row's own real header height, the exact ratio genuineParentOver's own
  // GENUINE_PARENT_BIG_FONT_RATIO guard already exists to reject.
  //
  // Fixed the identical way, reusing the SAME already-tested constant: a
  // phrase-run candidate at or above GENUINE_PARENT_BIG_FONT_RATIO-scale of
  // the header row's own font is refused before it can ever become the
  // fallback "nearest phrase" answer. This fixture mirrors the real
  // AIR DEVICE SCHEDULE page's own real proportions (title ~2x the header
  // row's font, positioned to horizontally overlap the SECOND, duplicate
  // SIZE column exactly the way the real title does) — verified to
  // actually reproduce the bug with the fix disabled before this test was
  // written, per this session's own fixture-verification discipline.
  const sp3 = (str: string, x: number, y: number, h = 9.5): GraphSpan => ({ str, x, y, w: str.length * 5, h });
  const sched: SheetSpans = {
    key: "ads.pdf#39",
    sheet_number: "M602",
    spans: [
      sp3("AIR DEVICE SCHEDULE", 560, 0, 19),
      sp3("MARK", 0, 34.6), sp3("MANUFACTURER", 100, 34.6), sp3("MODEL", 300, 34.6),
      sp3("SIZE", 450, 34.6), sp3("SIZE", 600, 34.6), sp3("MBH", 750, 34.6), sp3("REMARKS", 900, 34.6),
      sp3("ADS-1", 0, 66), sp3("TITUS", 100, 66), sp3("300RL", 300, 66),
      sp3("24X24", 450, 66), sp3("12X12", 600, 66), sp3("400", 750, 66), sp3("ALL", 900, 66),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the real ADS-1 row alone is enough to clear the bar");
  assert.ok(!tab!.headers.some((h) => /SCHEDULE/.test(h)), `no header may carry the table's own title text: got ${JSON.stringify(tab!.headers)}`);
  assert.equal(tab!.headers.filter((h) => h === "SIZE").length, 1, `exactly one real "SIZE" column survives (the confusable duplicate is honestly dropped, never mislabeled): got ${JSON.stringify(tab!.headers)}`);
});

test("a side-by-side neighbour table's own printed line never mints columns for this one (GOAL.md rule 29, fixed 2026-09-04)", () => {
  // Real, HIGH SEVERITY, corpus-found and live-traced on
  // 012_MO_M2430_01_Chiller_Upgrade#27's own real VFD SCHEDULE. Geometry
  // below mirrors the real page's own measured coordinates exactly:
  //
  //   real VFD header line   y=314.70, h=18.2, x 1943..2958
  //     TAG NO / MANUFACTURER / MODEL / NOTES
  //   unrelated PANELBOARD   y=309.50, h=18.2, x 3076..3489
  //     "120/208 VOLTAGE 3 PHASE 4 WIRE ..."  (a descriptive sentence,
  //     belonging to a DIFFERENT real schedule laid out beside this one)
  //
  // The two lines are 5.2px apart, which is INSIDE clusterRows' own merge
  // tolerance for this text height (max(0.35*18.2, 3) = 6.37px), so they
  // arrive as ONE row. Before this fix every vocabulary hit in that welded
  // row minted a column for whichever table settled there, so the panelboard
  // sentence's own "VOLTAGE" and "PHASE" became VFD columns — and ordinary,
  // correctly-working same-row cell attribution then filled them with the
  // neighbour's real text ("PUMP", "150 1176 1920"), reporting panelboard
  // wiring as this VFD's real electrical specs. Confirmed live before the
  // fix, on the real page, via a debug trace of the anchor-mint site.
  //
  // The guard needs BOTH halves of the real geometry (a distinct printed
  // line AND an x-extent disjoint from this table's own), so the asserts
  // below cover both directions: the neighbour is refused, and a genuinely
  // multi-tier header that OVERLAPS in x is left completely alone.
  const sp4 = (str: string, x: number, y: number, h = 18.2): GraphSpan => ({ str, x, y, w: str.length * 9, h });
  const sched: SheetSpans = {
    key: "vfd.pdf#27",
    sheet_number: "M-601",
    spans: [
      sp4("VFD SCHEDULE", 1943, 270, 30),
      // this table's own real header line
      sp4("TAG NO", 1943, 314.7), sp4("MANUFACTURER", 2075, 314.7),
      sp4("MODEL", 2273, 314.7), sp4("HP", 2500, 314.7), sp4("NOTES", 2895, 314.7),
      // the NEIGHBOUR schedule's own descriptive line, 5.2px above and
      // horizontally clear of this table entirely
      sp4("120/208", 3076, 309.5), sp4("VOLTAGE", 3152, 309.5),
      sp4("3", 3395, 309.5), sp4("PHASE", 3439, 309.5),
      // real VFD data
      sp4("VFD-CWP-1", 1943, 350), sp4("SCHNEIDER", 2075, 350),
      sp4("SFD212", 2273, 350), sp4("30", 2500, 350), sp4("1-5", 2895, 350),
      sp4("VFD-CWP-2", 1943, 385), sp4("SCHNEIDER", 2075, 385),
      sp4("SFD212", 2273, 385), sp4("30", 2500, 385), sp4("1-5", 2895, 385),
      // the neighbour's own real data, in its own x-band
      sp4("CORRIDOR RECEPTS", 3076, 350), sp4("1920", 3439, 350),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "the real VFD rows are enough to clear the bar");
  assert.ok(!tab!.headers.includes("VOLTAGE"),
    `the neighbour's VOLTAGE must never become a column here: got ${JSON.stringify(tab!.headers)}`);
  assert.ok(!tab!.headers.includes("PHASE"),
    `the neighbour's PHASE must never become a column here: got ${JSON.stringify(tab!.headers)}`);
  const blob = JSON.stringify(tab!.rows);
  assert.ok(!/CORRIDOR RECEPTS/.test(blob),
    `no neighbour text may reach this table's cells: got ${blob}`);
  assert.ok(tab!.headers.includes("MANUFACTURER") && tab!.headers.includes("MODEL"),
    `this table's own real columns must survive untouched: got ${JSON.stringify(tab!.headers)}`);
});

test("an OVERLAPPING second header tier is left alone — the rule 29 guard is not a blanket same-row filter", () => {
  // The other half of the discriminator, asserted directly so a future
  // change can't quietly widen the guard into "drop anything not on the
  // majority line". Here the upper tier sits 5px above (a distinct printed
  // line, exactly like the neighbour above) but its x-extent OVERLAPS the
  // leaf tier's — the real shape of a genuine two-tier header — so every
  // one of its labels must still be available to the table.
  const sp5 = (str: string, x: number, y: number, h = 18.2): GraphSpan => ({ str, x, y, w: str.length * 9, h });
  const sched: SheetSpans = {
    key: "twotier.pdf#1",
    sheet_number: "M-602",
    spans: [
      sp5("PUMP SCHEDULE", 100, 40, 30),
      // parent tier, 5px above the leaf tier and INSIDE its x-range
      sp5("VOLTAGE", 500, 95),
      sp5("TAG", 100, 100), sp5("MANUFACTURER", 250, 100), sp5("PHASE", 700, 100),
      sp5("P-1", 100, 140), sp5("BELL", 250, 140), sp5("208", 500, 140), sp5("3", 700, 140),
      sp5("P-2", 100, 175), sp5("BELL", 250, 175), sp5("208", 500, 175), sp5("3", 700, 175),
    ],
  };
  const tab = extractTable(sched, "equipment");
  assert.ok(tab, "a real two-tier pump schedule still extracts");
  assert.ok(tab!.headers.includes("VOLTAGE"),
    `an overlapping real parent tier must NOT be filtered: got ${JSON.stringify(tab!.headers)}`);
});

test("room-finish: a bare letter-only room key is kept when the row is genuinely populated, refused when it isn't (GOAL.md rule 22, fixed 2026-09-04)", () => {
  // Real, HIGH SEVERITY bug: 008_MO_T2331_01_Repair_to_Interior_Exterior_
  // Unheated's own real ROOM FINISH SCHEDULE lists room 101 (numbered)
  // plus rooms A through K (11 real "STORAGE SPACE" rooms in this metal
  // building — no numbered rooms in that wing at all). `ROW_KEY_RE`
  // requires a leading digit, so all 11 letter-keyed rooms silently
  // vanished — 92% real row loss, no disclosure.
  //
  // Fixed narrowly, per this rule's own ARCHITECTURE TRACE: a bare 1-2
  // letter key is accepted ONLY alongside real corroboration that the row
  // is actually populated like this table's own data (at least half its
  // real columns filled) — never on the shape alone, which collides
  // easily with a stray callout/revision bubble elsewhere on a dense
  // sheet. The corroboration signal (in-band token count vs. this
  // table's own anchor count) was already available at every row-
  // acceptance site via the row's own already-banded tokens — no reorder
  // of the column-binning pipeline needed, contrary to this rule's own
  // earlier (2026-09-04) architecture-trace worry.
  const sp2 = (str: string, x: number, y: number): GraphSpan => ({ str, x, y, w: str.length * 5, h: 8 });
  const sheet: SheetSpans = {
    key: "rfs.pdf#16",
    sheet_number: "A601",
    spans: [
      sp2("ROOM FINISH SCHEDULE", 100, 40),
      sp2("NO", 100, 60), sp2("NAME", 160, 60), sp2("FLOOR", 300, 60), sp2("BASE", 400, 60), sp2("WALL", 500, 60),
      sp2("101", 100, 80), sp2("HALLWAY", 160, 80), sp2("CPT-1", 300, 80), sp2("RB-1", 400, 80), sp2("P-1", 500, 80),
      sp2("A", 100, 100), sp2("STORAGE SPACE", 160, 100), sp2("SC", 300, 100), sp2("—", 400, 100), sp2("P-2", 500, 100),
      sp2("B", 100, 120), sp2("STORAGE SPACE", 160, 120), sp2("SC", 300, 120), sp2("—", 400, 120), sp2("P-2", 500, 120),
      // room I: NOT USED, still a real, fully-disclosed dashed row
      sp2("I", 100, 140), sp2("STORAGE SPACE", 160, 140), sp2("—", 300, 140), sp2("—", 400, 140), sp2("—", 500, 140),
      // a stray single-letter callout bubble sitting alone in this table's
      // own x-band, nothing else on its own row — must NOT be kept
      sp2("X", 100, 160),
      sp2("C", 100, 180), sp2("STORAGE SPACE", 160, 180), sp2("SC", 300, 180), sp2("—", 400, 180), sp2("P-2", 500, 180),
    ],
  };
  const rf = extractTable(sheet, "room-finish")!;
  const keys = rf.rows.map((r) => r.key).sort();
  assert.deepEqual(keys, ["101", "A", "B", "C", "I"], `real letter-keyed rooms must survive, the bare callout "X" must not: got ${JSON.stringify(keys)}`);
  assert.equal(rf.rows.find((r) => r.key === "A")!.cells.NAME.text, "STORAGE SPACE");
  assert.equal(rf.rows.find((r) => r.key === "I")!.cells.FLOOR.text, "—", "the NOT USED room stays a real, disclosed dashed row");
});

// ── B-7 (034_NC_VA_Project_637_22_700_EHRM_Infrastructure p42) ─────────────
// The catalogue recorded B-7 as NOT root-caused, with a "sheet-margin grid
// labels stretch the x-band" hypothesis. Tracing the real extractor on the
// real page found TWO stacked causes, and the recorded hypothesis was only
// the second: the page produced ZERO tables, and the margin tokens were
// never what blocked it — removing them changed nothing, the block still
// refused earlier, at clusterGenericColumnsOnce's own depth cap.
//
// Real captured spans (no PDF bytes), same idiom as m601-spans.json, so this
// runs without the gitignored bulk corpus.
const B7_P42 = JSON.parse(
  readFileSync(new URL("./fixtures/b7-034nc-p42.spans.json", import.meta.url), "utf8"),
) as { key: string; sheet_number: string; spans: GraphSpan[] };

test("B-7: 034_NC p42 extracts its two real schedules (was ZERO tables)", () => {
  // PRIMARY cause: the ROOM FINISH SCHEDULE's four-tier header repeats its
  // leaf labels — MATL at six distinct x, FIN at five. Their measured column
  // gutter (min 47px = 1.84 x h) sits UNDER clusterGenericColumnsOnce's own
  // tol (medH 25.6 * GENERIC_COLUMN_GAP_FACTOR 5 = 128), so plain
  // single-linkage chained 7 tokens — four of them on ONE tier — into a
  // single "column", tripped MAX_GENERIC_COLUMN_DEPTH, returned null, and
  // the whole page refused. A column is a VERTICAL STACK: two tokens on one
  // tier are two columns, unless separated by only a word space.
  const g = buildSheetGraph([{ key: B7_P42.key, sheet_number: B7_P42.sheet_number, spans: B7_P42.spans }]);
  const titles = g.tables.map((t) => t.title?.text || "");
  const door = g.tables.find((t) => /DOOR SCHEDULE/.test(t.title?.text || ""));
  const rfs = g.tables.find((t) => /ROOM FINISH SCHEDULE/.test(t.title?.text || ""));
  assert.ok(door, `DOOR SCHEDULE must extract: got [${titles.join(" | ")}]`);
  assert.ok(rfs, `ROOM FINISH SCHEDULE must extract: got [${titles.join(" | ")}]`);
  assert.ok(door!.rows.length >= 15, `DOOR SCHEDULE's real rows: got ${door!.rows.length}`);
  assert.ok(rfs!.rows.length >= 15, `ROOM FINISH SCHEDULE's real rows: got ${rfs!.rows.length}`);
  assert.ok(door!.rows.some((r) => r.key === "BC131A"), "a real door mark must key its own row");
});

test("B-7: sheet-margin grid locators never enter a header or stretch the band", () => {
  // SECONDARY cause, real but masked behind the refusal above: "A".."F" at
  // x=188 and x=5968 down BOTH page edges at a 608px pitch (page x-extent
  // 188..5986). Each pair is 2 single uppercase tokens, so it clears
  // isGenericHeaderToken and isGenericHeaderRow's 2-cell floor outright. The
  // "D" pair at y=2265 lands inside the RFS header band (2184..2334);
  // absorbed, it contributed anchors at x=188/5968 so bandLimits reported
  // the FULL PAGE WIDTH. Measured before the fix: headers came back carrying
  // "D" and "D (2)", region x 188..5986, and 15 real rows collapsed into 3
  // that swept in the sheet's own title block.
  const g = buildSheetGraph([{ key: B7_P42.key, sheet_number: B7_P42.sheet_number, spans: B7_P42.spans }]);
  const rfs = g.tables.find((t) => /ROOM FINISH SCHEDULE/.test(t.title?.text || ""))!;
  assert.ok(rfs, "the table must extract");
  assert.ok(!rfs.headers.some((h) => /^[A-F]( \(\d+\))?$/.test(h.trim())),
    `a bare grid letter must never become a column: ${rfs.headers.join(" | ")}`);
  assert.ok(rfs.region[0] > 1000, `band must not reach the left page edge: x0=${rfs.region[0]}`);
  assert.ok(rfs.region[2] < 5900, `band must not reach the right page edge: x1=${rfs.region[2]}`);
  assert.ok(!rfs.rows.some((r) => /Revisions:|ARCHITECT\/ENGINEER/.test(r.key)),
    "the sheet title block must never be swept in as a data row");
});
