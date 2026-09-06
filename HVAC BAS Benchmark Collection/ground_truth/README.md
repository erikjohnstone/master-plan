# Ground-truth audit of all 30 selected PDFs

Status: in progress. The curation manifest and parser outputs are NOT ground truth.
Scope: every page of all 30 supplied PDFs (1,489 pages), not merely the selected
preview pages. Original PDFs are immutable and identified by SHA-256.

## Required deliverables for every document

1. Project name, location, building type, and engineering firm, grounded in the
   drawing rather than archive filenames.
2. A record for every PDF page: printed sheet number/title, issue and revision
   dates distinguished from plotting timestamps, stated scales, graphic scale
   bars, and any sheet/index discrepancies.
3. Every unique equipment identity, classified and qualified by building/system
   where tags repeat. Preserve every schedule row, its quantity and units,
   critical performance data, accessories and footnotes. Separate populated
   valve/damper/actuator rows from generic legends, examples and details.
4. Every listed BAS point associated with its actual equipment or explicit
   typical-system scope. Preserve printed point type and separately normalize
   AI/DI/AO/DO. Never convert a network/software point into field-wired I/O.
   Preserve alarm/trend/spare/existing/alternate/contractor-scope distinctions.
5. Network protocols and interfaces, written sequence and logic-diagram locations,
   sensor/thermostat counts and zone associations, with unknowns recorded.
6. Page/region evidence, visual review, independent parser corroboration,
   count reconciliation and a source-conflict/absence ledger.

## Evidence and verification rules

- `evidence/<document>/` stores separately captured MuPDF and Poppler evidence.
  Words, coordinates, typography, source hash, versions and warnings are retained.
  Agreement diagnostics are screening measures only; identical text does not
  prove column alignment, physical counts, scope or relationships.
- MuPDF raw text coordinates are unrotated; `bbox` is transformed with the page
  rotation matrix into displayed-page coordinates (points, top-left origin).
  Poppler words are already in displayed-page coordinates, even when its XML
  page dimensions report the unrotated media dimensions. Preserve that reported
  metadata and flag differences, rather than rotating its words a second time.
- Each final assertion must cite page and bounded evidence. Table values need
  their row AND header context. A manual count needs a complete reviewed region
  inventory, not a keyword occurrence count.
- Independent parser corroboration proves text/position only. Human visual
  interpretation remains a separate gate. Vector-outline lettering needs
  explicit visual recovery and independent corroboration; two empty text layers
  are not evidence of absence.
- Use `verified`, `not_present_in_supplied_pdf`, `not_stated`,
  `source_conflict`, `unresolved`, and `not_reviewed` distinctly. An empty list
  or null is never automatically a verified absence. Absence claims require a
  complete page review of the relevant scope.
- Keep schedule-row count, explicit quantity, plan instances and unique physical
  equipment separate. Do not double-count the same object on roof/floor,
  demolition/remodel, mechanical/electrical, or detail views.
- Preserve literal source text and units. Label normalized units, derived values
  and inferred classifications; do not invent tonnage from model nomenclature.
- External specs referenced but not included are unavailable, not assumed.
- Source contradiction is a valid documented result, not permission to silently
  choose one value. Record the conflict even if one is more conservative.

## Completion gates

A document is complete only when every required field and every page has been
reviewed, every schedule and BAS row is captured, counts are reconciled, all
unknowns have an evidence-backed explanation, and the independent verification
ledger passes. Raw parsing or a scaffold does not advance a document to complete.
The full goal remains active until all 30 meet those gates.

## Shared-path pre-change decision

SHOULD THIS BE ON THE SHARED PATH? The production extraction/query/count logic
belongs on the shared Session pipeline. This directory does not implement that
logic. Its tools are offline, read-only PDF evidence capture and validation of
independently authored annotations, not a second schedule-truth implementation.
No production code, existing answer keys or evaluation thresholds are changed.
Corpus-specific facts belong only in authored audit records, never in parser
logic. Any later production fix must follow the repository shared-path gate.

## Layout

- `tools/`: reproducible evidence capture/annotation validation only.
- `evidence/`: immutable-source parser snapshots and diagnostic summaries.
- `records/`: manually reviewed document records (not raw parser predictions).
- Multi-module records embed every authored component, with equipment and
  per-application point indexes. `tools/bundle_record.py` checks source/module/
  render hashes, re-runs both-engine corroboration and validates the authored
  whole-document requirement ledger. It does not infer new drawing facts.
- `reviews/`: retained source-page renders used for visual verification.
- `STATUS.md`: honest all-30 completion ledger and next work.
