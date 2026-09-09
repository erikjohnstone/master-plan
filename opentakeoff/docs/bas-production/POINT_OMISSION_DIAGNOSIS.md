# Fort Sam missing point matrices: upstream page-selection omission

Reproduced with the actual production graph CLI on the unchanged PDF SHA-256
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Retained graph: `evidence/fort-sam-current-graph.json`; execution log alongside it.
No extraction/routing code was changed in this investigation.

The graph contains twelve total tables, **four** BAS point matrices / 79 listed
rows. The earlier “12 tables” figure is not twelve BAS matrices. Existing source
truth contains twelve BAS matrices / 193 listed rows. All 114 missing listed
rows are on three pages that never reach the current schedule-table pipeline:

| PDF page | Graph role | Authored BAS matrices / listed rows | Graph tables | Existing points-title detector |
| --- | --- | --- | --- | --- |
| 2 / M-506 | detail | 6 / 55 | 0 | true |
| 3 / M-507 | elevation | 1 / 25 | 0 | true |
| 4 / M-508 | elevation | 1 / 34 | 0 | true |

Listed rows include unpopulated template rows and alarm/software fields. **114
missing listed rows does not mean 114 additional physical points or devices.**

## Exact failing gate

`web/src/lib/vectorTakeoffPipeline.ts:isScheduleTarget` first accepts schedule
roles and explicit schedule captions. It then rejects roles other than legend
or unknown **before** calling `hooks.sheetHasPointsListTitle`. The three pages
have explicit BAS INPUT/OUTPUT POINT LIST titles, not captions ending in
SCHEDULE. The existing title detector returns true for all three, but its result
is never consulted for their detail/elevation roles.

`contexts.filter(isScheduleTarget)` feeds VectorGrid and the ODL fallback.
The runtime report confirms six of nine pages offered to VectorGrid; the three
excluded pages are exactly the pages above. Runtime L4.5 assistance is disabled,
with zero raster/vision assists. This is direct evidence of a routing omission,
not evidence that VectorGrid cannot extract their cells once offered the pages.

## Preservation and evidence limits

The four current BAS tables exactly match all fields present in the prior Python
adapter fixture: sheet, title, headers, region and every row/cell/text/bbox. That
fixture intentionally omits the graph's `kind` field; an initial whole-object
comparison failed on those four extra `kind: reference` properties. The retained
initial log and corrected field-scoped comparison disclose that distinction.
No kind equivalence or full graph/corpus non-regression is claimed from this
projection check.

`evidence/fort-sam-page-gate-final.log` records the actual detector/role results
and field-scoped equality. The previously captured source text and existing
authored point-module keys establish the missing matrix rows.

## Authorization and follow-up

The user subsequently authorized obtaining the missing information while
preserving VectorGrid extraction. The shared routing fix and the newly reproduced
downstream duplicate-removal defect are being verified. See
`POINT_ROUTING_CONTRACT.md` and current `PROGRESS.md`; the original diagnosis and
initial pending-permission checkpoint below are retained as history.

### Original checkpoint

An explicit question was sent asking permission to fix the **shared routing
gate**, without changing VectorGrid's extraction algorithm, under corpus
regression gates. No reply has been received at this checkpoint. Do not preempt
that choice by editing the gate or building a separate BAS-only table extractor.
Continue independent narrative/canonical-record work while that choice is pending.

If approved, begin with a failing routing regression that covers all non-schedule
roles with explicit point-list captions, plus reference-note/diagram negatives;
then run actual extraction on the affected pages. Validate each recovered cell
against the existing independent keys, preserve unaffected table/citation/symbol
outputs, and execute broader corpus gates. The gate fix may expose additional
adapter/geometry problems; none are assumed solved in advance.
