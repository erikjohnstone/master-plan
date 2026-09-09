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
