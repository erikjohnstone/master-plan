# Point-matrix routing and source-preserving recovery

## Authority and boundaries

On 2026-09-09 the user authorized obtaining the missing information while
protecting VectorGrid table extraction, then reiterated that all workflows must
meet production quality. This supersedes the pending routing-permission question.
The previous implementation goal turn made progress (shared narrative discovery
and a reproduced omission); the intervening clarification response did not change
code. This batch changes authoritative shared routing/reconciliation state.

**Should this be on the shared path? Yes.** Page admission and duplicate-table
decisions change returned evidence. Both changes are in the shared Session
pipeline used by browser compile and MCP. No UI-only or BAS-only extractor was
introduced. VectorGrid's Python reader, client, adapter, table parser, thresholds,
cell text, header construction and coordinate conversion are unchanged. No runtime
vision, model, costing, pricing or labor changes.

## Supported routing and preservation

- Existing schedule-caption and schedule/legend/unknown admission remains intact.
- A spatially joined, uppercase printed POINT LIST / POINTS LIST / POINTLIST /
  POINTSLIST / I/O LIST
  caption can additionally admit a detail, elevation, plan or other drawing role.
  This is an opportunity to inspect structure, never proof that a table exists.
- Cross-reference prefixes, prose, diagram labels and spatially unrelated words
  do not expand admission. Split `SEE` + `POINTS LIST` is tested as one reference,
  not a caption in the second text run alone.
- New caption-bearing pages are forwarded to the existing ODL fallback only
  when VectorGrid leaves them uncovered. Legacy ODL targets retain their existing
  behavior. No sheet role is changed.
- The Session fallback's existing same-title/key duplicate check now requires
  intersecting regions. Separate local-numbered matrices remain separate even
  with identical generic titles and all the same local row keys. Actual duplicate
  reads still collapse; multiple independent regions in one title/key bucket
  retain their own comparison candidates.

Discovery is not complete for arbitrary drafting. This initial strict admission
does not claim wrapped/rotated captions, unlabeled matrices or all prose variants.
Glued `POINTLIST` and `POINTSLIST` captions now have their own fail-before/pass-
after admission test, including an otherwise excluded sheet with no spaced
caption. `SEE POINTLIST` and `CHECKPOINTLIST` remain negative controls. The
preflight token check avoids joining every page's lines when no terminal LIST
token or glued point-list token is present.

## Real-input evidence

Source: Fort Sam nine-page excerpt, original SHA-256
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
The original authored key modules are read-only. Full source pages 2, 3 and 4
were visually rechecked using their Poppler renders.

The first routing-only candidate exposed a second defect: VectorGrid read the
gas-meter matrix, but Session's ODL reconciliation deleted it by title/key
identity despite its separate region. `evidence/point-routing-drop-trace.log`
records six page-2 matrices before that callback and five afterward. The new
independent-region unit test fails before the fix and passes afterward.

Final current candidate:

| Check | Starting graph | Candidate |
| --- | ---: | ---: |
| Source BAS matrices present | 4 / 12 | 12 / 12 |
| Authored listed rows matched | 79 / 193 | 193 / 193 |
| Authored cell values matched | 610 / 1,603 | 1,603 / 1,603 |
| All original table objects unchanged | 12 | 12 / 12 |

`mcp/scripts/audit-bas-point-matrices.mjs` compares every authored cell including
blank flags, terminal header positions and nonempty cell-box centers against
the independent key regions (PDF points multiplied by the explicit image scale).
Text comparison uses Unicode NFKC, whitespace removal and uppercase. It does not
fuzzily compare numeric values or words. Every expected nonempty cell must have
a finite, ordered box; absent/invalid boxes fail, not skip grounding. The audit
validates the original source hash before reading results.
It separately reports four retained child-header rows in the meter/global tables;
it does not mutate the graph or count those headers as point rows.

Full report: `evidence/point-matrix-audit.json`. All original table fields,
including kinds, titles, headers, every row/cell and all boxes, compare exactly.
This is stronger than the previous fixture projection, but is still this PDF's
table-preservation check, not a full-corpus non-regression claim.

**193 listed rows are not 193 physical points or installed devices.** The meter
tables distinguish hardware/software/graphic/alarm columns, some global rows
are empty, and chiller/boiler asterisks explicitly qualify integrated points.
Preserve those distinctions in the remaining interpretation work. The existing
Python adapter now handles the reviewed nested HARDWARE/SOFTWARE headings;
`POINT_HEADER_CONTRACT.md` records the independent assertions. Source-bound
controller qualifiers are covered by `POINT_REVIEW_CONTRACT.md`. Neither
recovery nor those interpretations complete equipment assignment or installed
quantity verification.

## Reproduction

From `opentakeoff/mcp`, generate the candidate with the real production graph
CLI, then run the read-only audit:

```sh
node --import tsx scripts/production-graph-cli.mjs --mode graph \
  --pdf "$BAS_SOURCE_PDF" --out "$BAS_CANDIDATE_GRAPH"
node scripts/audit-bas-point-matrices.mjs "$BAS_AUTHORED_MODULE_DIR" \
  "$BAS_SOURCE_PDF" "$BAS_STARTING_GRAPH" "$BAS_CANDIDATE_GRAPH" 2 "$BAS_AUDIT_OUTPUT"
```

Exact retained graphs are `evidence/fort-sam-current-graph.json` (starting),
`evidence/fort-sam-routing-candidate-graph.json` (routing-only), and
`evidence/fort-sam-routing-final-graph.json` (routing plus reconciliation).
Logs include runtime and RSS. Broader corpus comparison, cold/warm performance,
final gate completion and any failures must be recorded in `PROGRESS.md` before
calling the batch verified. All five end-to-end workflows remain required.
