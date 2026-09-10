# Source-bound point-list interpretation record

## Contract before implementation (2026-09-09)

**Should this be on the shared path? Yes.** One Python interpreter consumes
the existing Session source context and indexed tables. It reuses the existing
column/count grammar. No second UI parser, VectorGrid change, physical-device
inference or change to legacy math fields.

The additive `bas_point_lists_v1` result is an intermediate record for the
canonical BAS workflow, not a completed reviewed takeoff. It retains all listed
rows, original cells, source versions/pages, column scope, child-header evidence,
and supported explicit footnote qualifiers. Stable IDs use source byte identity,
page and original table/row geometry, not filenames or UI array order. Raw
evidence is never edited by interpretation. Duplicated row identity remains an
issue; no row is silently deleted to make a unique-key set.

Supported now: directional/value column matrices with point-name/description
identity; existing retained nested hardware/software headers; printed X/count
semantics; separate alarm/trend/graphic/adjustable flags; numbered blank slots;
literal trailing asterisks with a uniquely associated explicit note. The two
initial note grammars are `* INDICATES POINT PULLED FROM <subject> CONTROLLER`
and `NOTE: "*" INDICATES A POINT THAT IS LON-INTEGRATED WITH DRIVE.` Both occur
in real development source. A note must match both the explicit marker grammar
and a unique same-page table region: its center lies across that table, below
the last data row and no more than four source text heights below its boundary.
No joining on generic equipment vocabulary or proximity alone.

Footnote binding requires a unique note for the starred row's matrix. Conflicting
or multiple candidates, missing notes, rotated/wrapped/unsupported note grammar,
or a missing source page remain explicit review conditions. A controller-provided
qualifier does not establish BACnet, a physical terminal, a new software object,
or the installed quantity of its equipment. Original AI/AO/DI/DO marks remain
visible as declared source marks. Notes without a corresponding marker create
no point or integration requirement. Global references remain labeled source
text, not automatically merged or replicated requirements.

Output totals in this record are accounting only: matrices, retained rows and
row statuses. There is no project installed/copper total or readiness approval.
Header/row/cell omissions remain visible; source recovery and source completeness
are distinct from successful interpretation of a discovered cell.

The existing graph deliberately stores sparse cells. `unobserved_columns`
records header positions with no supplied cell, without fabricating text, a box,
or a zero observation. An explicitly supplied blank is separately interpreted
by the existing printed-flag grammar. `interpreted` describes retained positive
observations, not proof that every blank cell or the entire matrix was extracted
completely. This is separate from `uninterpreted_columns` (supplied nonempty
cells whose meaning is not recognized). A first negative-test draft incorrectly
assumed dense graph rows and failed on a fixture KeyError; its corrected test
removes a real positive DI cell, checks unobserved accounting, and contrasts an
explicit blank. Both logs are retained; the initial fixture error is not counted
as a reproduced engine defect.

Acceptance before wiring: real Fort Sam 12 matrices/193 rows, three blank slots,
all four nested header rows treated as headers; chiller starred rows
1,3,4,6,7,18,20 and boiler starred rows 1,2,3,4,5,6,7,26,28 bind only their own
controller note; all original cells and boxes unchanged. Positive typed/value
observations and attribute flags remain separate. Test missing/conflicting notes,
adjacent matrices, reused local row numbers, renamed source aliases, arbitrary
input order, malformed source identity/coordinates, and deterministic replay.

## Production integration checkpoint

The shared `compileProductionTakeoff` now returns additive `bas_point_lists`
for BAS calls with a real Session. The UI's existing production CLI and MCP
consume the same function and bounded Python transport. Math-policy failure
cannot suppress valid point evidence; source failure cannot discard valid math
or legacy results. Runtime/source/contract failures return explicit unavailable
records. Internal legacy callers without a source provider retain their old
shape. No existing `bas_math` field is redefined.

Strict Python input validation covers source identities and raw-cell coordinates,
including uninterpreted cells. The shared output validator checks row occurrence
accounting, evidence ownership, cell text/box equality, sparse-column accounting,
retained qualifier references, unique IDs and status consistency. This is
structural validation, not cryptographic proof of an arbitrary imported JSON's
PDF provenance; complete revision import must validate source bytes/dependencies
and recompute interpretation.

The browser adapter only remaps navigation aliases. Source/page/matrix/row IDs,
raw row keys, source text and boxes remain unchanged. The record is carried in
Takeoff metadata and full compile JSON; the existing engineering-only export
and row workbook are not silently repurposed to include it. The subsequent
`WORKFLOW_CAPTURE_CONTRACT.md` checkpoint adds durable browser/MCP captures and
a digital-matrix reader with full point JSON export/import. Reviewed corrections,
SOO/equipment mapping and final release controls remain required.

The transport has explicit 32 MiB limits and a 30-second timeout. Large-source
batching, source-version retention and the remaining corpus checks are still
required before production completion; an unavailable large input is not a
coverage pass. Reproduction uses `mcp/scripts/verify-bas-point-production.mjs`
with a source PDF, earlier compile, fresh CLI compile and report destination.

End-to-end delivery still requires reviewed corrections, SOO/equipment mapping,
historical source retention and the complete review/release UI/export journey.
Do not declare workflow A complete when only these internal checks pass.
