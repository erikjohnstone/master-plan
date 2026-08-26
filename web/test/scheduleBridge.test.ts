// scheduleBridge.ts (cross-phase fix: read_schedule -> sheetgraph bridge) —
// the pure overlap + row-mapping logic that lets read_schedule fall back to
// the whole-set sheet graph's own tables when its region-based CODE/MATERIAL
// parse (scheduleParse.ts) finds nothing, exactly the case for an MEP
// equipment schedule (keyed ID, not CODE; no flooring section header).
// Real, live-captured fixture (m601-spans.json, 295 spans) — no hand-typed
// approximation, same discipline as sheetgraph.test.ts's own multi-table
// block.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSheetGraph, type SheetSpans, type ScheduleTable } from "../src/lib/sheetgraph.ts";
import { tablesOverlappingRegion, bridgeRows, type NormRegion } from "../src/lib/scheduleBridge.ts";

const m601 = JSON.parse(
  readFileSync(new URL("./fixtures/m601-spans.json", import.meta.url), "utf8"),
) as SheetSpans;
const SHEET = m601.key;   // "bessemer-mechanical-bidset.pdf#8"
// Generous, round dims comfortably containing the real content (max real
// span extent measures ~5981x3390 at this fixture's RENDER_SCALE=2.0) — the
// exact page size doesn't matter to the overlap math, only that regions
// normalize/denormalize consistently against it.
const DIMS = { w: 6120, h: 3960 };

const graph = buildSheetGraph([m601]);
const allTables = graph.tables;
const ebb = allTables.find((t) => t.title?.text === "ELECTRIC BASEBOARD HEATER SCHEDULE")!;

test("a region drawn around the real EBB table selects it, not Wall Heater above or Diffuser/Fan below", () => {
  // Wall Heater sits directly above (y 1026-1098), Diffuser well below (y
  // 1965+) — a sloppy-but-honest region around EBB's own real bbox
  // (x 3392-4527, y 1300-1553) must select EBB alone.
  const region: NormRegion = { x0: 3350 / DIMS.w, y0: 1280 / DIMS.h, x1: 4550 / DIMS.w, y1: 1580 / DIMS.h };
  const hits = tablesOverlappingRegion(allTables, SHEET, region, DIMS);
  assert.equal(hits.length, 1, `expected exactly EBB, got: ${hits.map((h) => h.table.title?.text).join(" | ")}`);
  assert.equal(hits[0].table.title?.text, "ELECTRIC BASEBOARD HEATER SCHEDULE");
  assert.ok(hits[0].coverage > 0.9, `coverage should be near-total for a region containing the whole table: ${hits[0].coverage}`);
});

test("bridgeRows on the EBB table yields EBB-6 with MANUFACTURER and a VOLTAGE cell carrying 240 — the live goal, honestly", () => {
  // MANUFACTURER is clean. VOLTAGE is NOT — this table's real LENGTH column
  // ("4'-0\"") isn't in EQUIPMENT_HEADERS' vocabulary, so it has no anchor of
  // its own and its text bleeds into the nearest anchored column (VOLTAGE),
  // a PRE-EXISTING sheetgraph.ts gap (confirmed identical against the
  // pre-bridge code, not introduced by this bridge or the VRF merge fix).
  // bridgeRows passes cells through verbatim — it doesn't invent a clean
  // reading sheetgraph.ts itself doesn't have. The live goal ("manufacturer
  // and voltage for EBB-6") is still answerable from this text (240 V is
  // legible inside it), just not from a clean isolated field.
  const rows = bridgeRows(ebb);
  const ebb6 = rows.find((r) => r.key === "EBB-6");
  assert.ok(ebb6, `EBB-6 present: ${rows.map((r) => r.key).join(", ")}`);
  assert.equal(ebb6!.cells.MANUFACTURER, "QMARK");
  assert.match(ebb6!.cells.VOLTAGE, /240/, "the real 240V value must still be present in the (unclean) VOLTAGE cell");
});

test("a whole-sheet region returns multiple tables, best coverage first, capped at the default limit", () => {
  const region: NormRegion = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const hits = tablesOverlappingRegion(allTables, SHEET, region, DIMS);
  assert.ok(allTables.length > 3, "the fixture must genuinely carry more than the default cap for this test to mean anything");
  assert.equal(hits.length, 3, "capped at the default limit of 3");
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i - 1].coverage >= hits[i].coverage, "best coverage first");
});

test("a sliver region clipping one corner of a table is rejected, not answered with the wrong table", () => {
  // Just the EBB table's top-left corner (~58x20px against a ~1134x253px
  // table) — well under the default 0.25 coverage floor.
  const region: NormRegion = { x0: 3392 / DIMS.w, y0: 1300 / DIMS.h, x1: 3450 / DIMS.w, y1: 1320 / DIMS.h };
  const hits = tablesOverlappingRegion(allTables, SHEET, region, DIMS);
  assert.deepEqual(hits, [], "a corner-clipping sliver must not answer with the table it barely touches");
});

test("a region over an empty part of the sheet returns nothing", () => {
  const region: NormRegion = { x0: 0.01, y0: 0.01, x1: 0.05, y1: 0.05 };
  const hits = tablesOverlappingRegion(allTables, SHEET, region, DIMS);
  assert.deepEqual(hits, []);
});

test("sheet filtering: a table on another sheet key never matches, even with an identical region", () => {
  const otherSheetTable: ScheduleTable = { ...ebb, sheet: "other-file.pdf#1" };
  const region: NormRegion = { x0: 3350 / DIMS.w, y0: 1280 / DIMS.h, x1: 4550 / DIMS.w, y1: 1580 / DIMS.h };
  const hits = tablesOverlappingRegion([otherSheetTable], SHEET, region, DIMS);
  assert.deepEqual(hits, [], "a table on a different sheet key must never match, regardless of region overlap");
});

test("truncation/cap behavior on rows and cell text", () => {
  const capped = bridgeRows(ebb, { maxRows: 3 });
  assert.equal(capped.length, 3, `EBB has 8 real rows; maxRows:3 must cap the list, got ${capped.length}`);
  const tinyChars = bridgeRows(ebb, { maxChars: 2 });
  const anyTruncated = tinyChars.some((r) => Object.values(r.cells).some((c) => c.endsWith("…") && c.length === 3));
  assert.ok(anyTruncated, "at least one real cell value must be longer than 2 chars and get truncated with an ellipsis");
});
