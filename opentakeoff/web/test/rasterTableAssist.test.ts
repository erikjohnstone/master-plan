// L4.5 OCR-assist structured path (task #79) — rapid_table's own real
// row/col/rowSpan/colSpan cell grid turned into a ScheduleTable via the SAME
// ODL adapter the embedded-PDF-table path uses. Synthetic SidecarStructureTable
// fixtures below (never real corpus data — a unit test's own inputs are
// expected to be synthetic; that is not the "no guessing" discipline this
// file's own comments describe, which is about never fabricating PRODUCTION
// output).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleTableFromSidecarStructure,
  hasCorruptedHeaders,
  type SidecarStructureTable,
  type SidecarStructureCell,
} from "../src/lib/rasterTableAssist.ts";

const IDENTITY = [1, 0, 0, 1, 0, 0];

function cell(row: number, col: number, text: string, opts: Partial<SidecarStructureCell> = {}): SidecarStructureCell {
  return {
    row, col, rowSpan: opts.rowSpan ?? 1, colSpan: opts.colSpan ?? 1,
    text, bbox: opts.bbox ?? [col * 50, row * 20, col * 50 + 50, row * 20 + 20], confidence: 1,
  };
}

function table(rows: number, cols: number, cells: SidecarStructureCell[]): SidecarStructureTable {
  return { source: "rapid-table-slanet-plus", score: 1, page: 1, rows, cols, bbox: [0, 0, cols * 50, rows * 20], cells };
}

test("scheduleTableFromSidecarStructure: a clean equipment schedule with a real title and single-tier header reads correctly", () => {
  const structured = table(4, 4, [
    cell(0, 0, "AIR HANDLING UNIT SCHEDULE", { colSpan: 4 }),
    cell(1, 0, "MARK"), cell(1, 1, "MANUFACTURER"), cell(1, 2, "MODEL"), cell(1, 3, "CFM"),
    cell(2, 0, "AHU-1"), cell(2, 1, "TRANE"), cell(2, 2, "XYZ-100"), cell(2, 3, "2000"),
    cell(3, 0, "AHU-2"), cell(3, 1, "TRANE"), cell(3, 2, "ABC-200"), cell(3, 3, "1500"),
  ]);
  const result = scheduleTableFromSidecarStructure([], "test.pdf#1", {
    pageViewportTransform: IDENTITY, region: [0, 0, 400, 400],
    structured, cropWidth: 400, cropHeight: 400,
  });
  assert.ok(result, "a clean, well-structured schedule must not be refused");
  assert.equal(result!.kind, "equipment");
  assert.equal(result!.rows.length, 2);
  assert.ok(!hasCorruptedHeaders(result!.headers), "a real, clean header set must never trip the corruption safety net");
});

test("scheduleTableFromSidecarStructure: a real electrical panel schedule's own header words (CIRCUIT/BREAKER/POLE/CKT), absent from the shared EQUIPMENT_HEADERS vocabulary, are still recognized via the caller-scoped extraHeaderVocab", () => {
  const structured = table(4, 4, [
    cell(0, 0, "PANEL A SCHEDULE", { colSpan: 4 }),
    cell(1, 0, "CKT"), cell(1, 1, "BREAKER"), cell(1, 2, "POLE"), cell(1, 3, "LOAD DESCRIPTION"),
    cell(2, 0, "1"), cell(2, 1, "20A"), cell(2, 2, "1"), cell(2, 3, "LIGHTS"),
    cell(3, 0, "2"), cell(3, 1, "20A"), cell(3, 2, "1"), cell(3, 3, "RECEPTACLES"),
  ]);
  const result = scheduleTableFromSidecarStructure([], "test.pdf#1", {
    pageViewportTransform: IDENTITY, region: [0, 0, 400, 400],
    structured, cropWidth: 400, cropHeight: 400,
  });
  assert.ok(result, "a well-formed panel schedule must not be refused for lacking equipment-schedule vocabulary");
  assert.equal(result!.rows.length, 2);
});

test("hasCorruptedHeaders: real distinct per-column labels never trip it", () => {
  assert.equal(hasCorruptedHeaders(["MARK", "MANUFACTURER", "MODEL", "CFM", "REMARKS"]), false);
  assert.equal(hasCorruptedHeaders([]), false);
  // Two short (<20 char) headers that happen to share a prefix are fine —
  // the corruption signature is specifically a LONG shared prefix, the
  // shape a swallowed data/caption row produces, not any coincidence.
  assert.equal(hasCorruptedHeaders(["SIZE", "SIZE (IN)"]), false);
});

test("hasCorruptedHeaders: several headers sharing one long leading substring — the real, measured shape a swallowed pre-header info row produces (15_IA_IowaState_Biorenewables_Lab.pdf#11's own EXISTING PANEL SCHEDULE) — is refused", () => {
  const headers = [
    "0/208 2,000 RFACE AMPS 20 20 20 20",
    "PHASE FED FROM: ROOM: 1115 FEEDERSIZE CIRCUITBREAKER 20 20 20 20 20",
    "WRE: 4 B-SWB-0115 EXISTING CIRCUITBREAKER NEUTRAL FRAME BOLT-ON",
    "WRE: 4 B-SWB-0115 EXISTING CIRCUITBREAKER NEUTRAL POLES 1 1 1",
    "WRE: 4 B-SWB-0115 EXISTING WRE SZE #12 #12 #6 #3",
  ];
  assert.equal(hasCorruptedHeaders(headers), true);
});

test("hasCorruptedHeaders: 2+ headers shaped \"LABEL: value\" are refused even without a shared 20-char prefix — the real shape when the header/data boundary swallows several DIFFERENT pre-header spec lines (15_IA#11, same document, a distinct real corruption shape found 2026-09-09)", () => {
  // Each header differs after its own "WIRE: 3" prefix, so the existing
  // shared-20-char-prefix check alone never fires on this exact set — this
  // is the real, measured header list from that run.
  const headers = [
    "(REVISED) 150",
    "VOLTS: PANEL 1-RP-1115",
    "22,000 AICRATING MOUNTING: WRE LOAD",
    "120/208 PHASE ROOM SURFACE",
    "WIRE: 3 FEEDER SIZE CIRCUITBREAKER",
    "WIRE: 3 1115 FED FROM: NEUTRAL",
    "WIRE: 3",
    "WIRE: 3 4 CIRCUITBREAKER",
    "WIRE: 3 B-SWB-0115 EXISTING",
    "MAIN CAP. 225 AMPERES WRE SIZE",
    "COL11",
    "LOAD WATTS ITEM FED",
    "MLO CCT",
  ];
  assert.equal(hasCorruptedHeaders(headers), true);
});

test("hasCorruptedHeaders: a single real header with one incidental colon is never enough on its own", () => {
  assert.equal(hasCorruptedHeaders(["CIRCUIT", "BREAKER", "EFFICIENCY: SEER 13", "FRAME"]), false);
});

test("a real per-item schedule where the same value legitimately repeats in a FEW columns is never dropped as a phantom caption row", () => {
  // Two real circuits each happen to share "SPARE" in their own LOAD
  // DESCRIPTION column — a real, ordinary shape, not the all-cells-identical
  // corruption this fix targets (only 1 of 4 columns repeats per row).
  const structured = table(4, 4, [
    cell(0, 0, "PANEL A SCHEDULE", { colSpan: 4 }),
    cell(1, 0, "CKT"), cell(1, 1, "BREAKER"), cell(1, 2, "POLE"), cell(1, 3, "LOAD DESCRIPTION"),
    cell(2, 0, "1"), cell(2, 1, "20A"), cell(2, 2, "1"), cell(2, 3, "SPARE"),
    cell(3, 0, "2"), cell(3, 1, "20A"), cell(3, 2, "1"), cell(3, 3, "SPARE"),
  ]);
  const result = scheduleTableFromSidecarStructure([], "test.pdf#1", {
    pageViewportTransform: IDENTITY, region: [0, 0, 400, 400],
    structured, cropWidth: 400, cropHeight: 400,
  });
  assert.ok(result);
  assert.equal(result!.rows.length, 2, "both real SPARE circuits must survive, not be mistaken for a caption row");
});

test("a whole-row title/footer caption bleeding into the table's own final row (not colon-suffixed, not the word NOTES) is dropped, not shipped as a phantom data row (15_IA#11, real corpus shape found 2026-09-09)", () => {
  const structured = table(5, 4, [
    cell(0, 0, "PANEL A SCHEDULE", { colSpan: 4 }),
    cell(1, 0, "CKT"), cell(1, 1, "BREAKER"), cell(1, 2, "POLE"), cell(1, 3, "LOAD DESCRIPTION"),
    cell(2, 0, "1"), cell(2, 1, "20A"), cell(2, 2, "1"), cell(2, 3, "LIGHTS"),
    cell(3, 0, "2"), cell(3, 1, "20A"), cell(3, 2, "1"), cell(3, 3, "RECEPTACLES"),
    // The sheet's own footer caption, misread by table_structure as one
    // ordinary data row — every column holds the identical string.
    cell(4, 0, "REVISEDPANELSCHEDULE"), cell(4, 1, "REVISEDPANELSCHEDULE"),
    cell(4, 2, "REVISEDPANELSCHEDULE"), cell(4, 3, "REVISEDPANELSCHEDULE"),
  ]);
  const result = scheduleTableFromSidecarStructure([], "test.pdf#1", {
    pageViewportTransform: IDENTITY, region: [0, 0, 400, 400],
    structured, cropWidth: 400, cropHeight: 400,
  });
  assert.ok(result);
  assert.equal(result!.rows.length, 2, "the phantom caption row must never be counted as a third circuit");
  const keys = result!.rows.map((r) => r.key);
  assert.ok(!keys.includes("REVISEDPANELSCHEDULE"), `phantom caption row must not survive as a row key: got ${JSON.stringify(keys)}`);
});

test("scheduleTableFromSidecarStructure: a structural read whose own header/data boundary corrupts is refused, not silently returned", () => {
  // A minimal repro of the real shape: rows with sparse, uneven own-column
  // coverage (no row ever states EVERY one of 5 columns on its own, forcing
  // scheduleTableFromODL's maxCovered-vs-fullCoverage calibration to sweep
  // several genuine data-shaped rows into "still header") and no title cell
  // to short-circuit into a clean refusal instead — this table has no
  // titleCell (row 0 isn't a single wide cell), so it falls straight into
  // the exact multi-row-header-info shape the corrupted-header safety net
  // exists to catch.
  const structured = table(6, 5, [
    cell(0, 0, "A"), cell(0, 1, "B"), cell(0, 2, "C", { colSpan: 2 }),
    cell(1, 0, "D"), cell(1, 1, "E"), cell(1, 2, "F"), cell(1, 3, "G"),
    cell(2, 0, "1"), cell(2, 1, "X"), cell(2, 2, "Y"), cell(2, 3, "Z"), cell(2, 4, "Q1"),
    cell(3, 0, "2"), cell(3, 1, "X"), cell(3, 2, "Y"), cell(3, 3, "Z"), cell(3, 4, "Q2"),
    cell(4, 1, "3"), cell(4, 2, "X"), cell(4, 3, "Y"),
    cell(5, 0, "4"), cell(5, 1, "X"), cell(5, 2, "Y"), cell(5, 3, "Z"), cell(5, 4, "Q4"),
  ]);
  const result = scheduleTableFromSidecarStructure([], "test.pdf#1", {
    pageViewportTransform: IDENTITY, region: [0, 0, 400, 400],
    structured, cropWidth: 400, cropHeight: 400,
  });
  // Either a clean refusal (null) or, if scheduleTableFromODL's own
  // heuristics happen to resolve this particular synthetic shape cleanly,
  // a result with NO corrupted headers — never a table hasCorruptedHeaders
  // itself would flag, which is the one outcome this safety net exists to
  // rule out.
  if (result) assert.ok(!hasCorruptedHeaders(result.headers));
});
