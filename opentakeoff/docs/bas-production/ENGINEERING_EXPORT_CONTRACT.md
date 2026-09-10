# Engineering review workbook

Implementation gate, 2026-09-09. This completes the readable, non-commercial
engineering export in workflow D. It does not substitute for workflow E's
approved deliverable, issue management or revision correspondence.

## Input and meaning

Accept an integrity-verified saved BAS workflow and, optionally, an exactly
bound response from the existing shared Python inspection service. No draft is
an export input. UI and MCP use one shared projection and workbook writer.
Neither the workbook nor JavaScript recomputes engineering mathematics. A
Python replay verifies saved calculations, not source interpretation, installed
quantity, project coverage, approval or reviewer identity.

Include the current checks first, every earlier engineering review, every
original input (including null, empty lists and decimal strings), every saved
constraint/normalized comparison/network result, exclusions, pinned decision
heads and the referenced source locations. Resolve resource owners against
each review's pinned equipment/assembly, including withdrawn equipment.
Distinguish superseded history, historical captures and stale dependencies.
Unknown is not zero; an excluded failed check remains a failed check.
Include the shared source/resource applicability findings so a successful
numeric comparison cannot hide partly unknown scope or excluded components.

The existing evidence-and-decisions JSON remains the canonical reimportable
archive. The workbook is a readable saved review, not a live calculator or
approved release. It contains no PDF bytes. Source coordinates remain in the
original image-pixel frame with document digest, page, dimensions and rotation.

## Safety and layout

Use a compact review summary, filterable check/constraint/input/resource/history
tables, and source locations. Freeze headers and identifying columns, use
readable widths and wrapped descriptions. Do not change default legacy XLSX
output. Decimal strings remain exact text, including more than 15 significant
digits. Text starting with `=`, `+`, `-` or `@` is inert inline text, never a
formula. Do not introduce spreadsheet arithmetic alongside shared Python.

Excel permits 32,767 characters per cell, 253 line feeds, 1,048,576 rows and
16,384 columns, and numeric precision is 15 digits. See Microsoft's
[Excel specifications](https://support.microsoft.com/en-us/excel/excel-specifications-and-limits)
and [SpreadsheetML formulas](https://learn.microsoft.com/en-us/office/open-xml/spreadsheet/working-with-formulas).
Oversized text or text not round-trippable through XML must use an explicit
full-text reference and ordered ASCII-escaped JSON parts. Concatenating those
parts and JSON-parsing must recover the exact original string. Never strip
characters, truncate or omit records silently. Reject an oversized worksheet
before producing an artifact, with its name and limit. The JSON archive remains
available; rejection is not an empty or successful export.

MCP adds an optional engineering workbook path to `export_takeoff`; its existing
inline annotation payload and default JSON path behavior remain unchanged.
Only one output file per call avoids a partially written two-file export.
Existing XLSX files require explicit overwrite; do not guess ownership from a
ZIP signature. Validate/build before writing and preserve session state. Stage
and sync complete bytes beside the destination, check that the frozen source
snapshot is still current, then atomically publish one file. Failed preparation
or cancellation leaves any existing deliverable unchanged.

The packaged MCP runtime explicitly declares `fflate` 0.8.3, the same ZIP
writer dependency already used by the browser. The original package's
[documentation and MIT license](https://github.com/101arrowz/fflate) support both
browser and Node entry points. No spreadsheet calculator dependency is added.

## Falsifiable acceptance

- Exact row/field assertions for all eleven engineering families, original
  decimal strings, null versus zero/empty, source bases and constraint paths.
- Actual Python pass/fail/not-evaluable histories, exclusions, supersession,
  withdrawn owners and stale dependencies. Tampered histories/foreign replay
  responses reject. No mutation of input, persisted state or original tables.
- Hostile strings, long text, control characters, Unicode, literal escape
  sequences, worksheet limits and no emitted formulas. Legacy sheet XML and
  commercial workbook projections remain identical when formatting is absent.
- UI export through the real inspection service; cancellation, stale response,
  draft preservation and failure do not download a misleading current result.
- Public MCP export, safe-write failure and ordinary JSON export unchanged.
- Reopen actual workbook bytes with an independent reader and visually inspect
  the saved artifact. Include a real development-PDF history; controlled tests
  are not counted as independent real-project evidence.

Status, 2026-09-10: bounded export acceptance verified. Full web 2,670 pass / 13
existing skips; BAS MCP 90 pass; actual browser replay/cancellation/stale-import
checks; packaged UI/MCP equality; independent readback of 382 cells/eight sheets
and inspected previews. See `PROGRESS.md` for exact runs and failed-first
evidence. This does not complete all engineering real-document coverage or
workflow E's review/revision/approved-deliverable acceptance.
