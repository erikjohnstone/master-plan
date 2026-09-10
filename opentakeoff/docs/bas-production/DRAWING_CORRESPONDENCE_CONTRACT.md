# Drawing correspondence — implementation slice

2026-09-10. Part of workflow E, not its completion or an approval feature.
The full `REVIEW_REVISION_CONTRACT.md` remains authoritative.

Shared source-set and page-accounting truth goes in `web/src/lib`. Browser
interaction and persistence transport remain surface-specific. No changes to
VectorGrid, symbol matching, existing capture fingerprints, or Python arithmetic.

## Inputs and guarantees

- Add `drawing_events` under additive workflow revision `bas_review_7`.
  Existing journals retain their meanings and all lower-level writes/imports
  preserve the extension. Invalid/unknown fields and divergent histories fail.
- Requests carry a UUID, global expected drawing head, exact dependency digest,
  reason and self-declared reviewer. Origins are supplied by the entry point.
  Initial source sets select owned `(capture_id, page_id)` pairs in explicit
  source order. Never include the same physical source page twice.
- A revision names an existing complete source set, incoming retained capture,
  and replacement-set or partial-addendum mode. Every baseline and incoming
  page is explicitly accounted for. Replacements are reciprocal one-to-one.
  Same-byte redundant uploads must reference the identical retained physical
  page. They do not replace its old interpretation capture silently.
- Exact-source pairing may be suggested; changed-byte pairings require a
  recorded decision. Partial-addendum omissions are suggested retained, subject
  to confirmation. Replacement-set omissions remain unresolved. Suggestions
  are not events, approvals, or published source sets.
- Unresolved accounting can be saved as review history, but produces no complete
  source set. A later decision appends another full accounting event. Existing
  sets/events remain unchanged. Split/combined pages require explicit removals
  and additions; downstream item correspondence is still unassessed.
- Complete sets derive from the event digest, retain baseline page order, replace
  in place, then append additions in incoming source order. Old capture selection
  and old bboxes remain intact. They establish page accounting only, never
  interpretation coverage, quantity completeness, source-byte availability or
  approval. An Agent proposal is labeled as such, not operator approval.
- Comparison reports physical source identity and exact available retained
  text/frame/geometry separately. Empty/missing text is unavailable, not equal
  drawing content. Available text equality is not full-PDF ink equivalence.
  Semantic, quantity and approval-impact comparison are subsequent required
  integrations, not fabricated zero deltas in this slice.

## Limits and predeclared verification

Each source set/capture inventory is limited to 25,000 pages; a drawing journal
retains at most 10,000 events and 250,000 explicit page-accounting entries across
its events. These are explicit refusal limits, not silent truncation. Source PDF
bytes are still retained through the existing history/vault paths.

Before declaring the slice integrated, test positive initial/replacement/addendum
journeys; duplicate/renamed uploads; changed-byte unchanged-text re-export;
reordering/renumbering; duplicate numbers across documents; split/remove/add;
unresolved entries; reciprocal/foreign/duplicate reference attacks; digest/head/
operation conflicts; all six older revision round trips; IDB and JSON retention;
public UI and MCP, plus source-link restoration. Controlled cases are labeled.
No blind corpus bodies are opened for journal development.

The existing 5-second real-history validation benchmark remains unchanged.
For added journal work, the initial gate is 1,000 pages and 100 revision events
(201,000 page references including the initial set), with synchronous replay
under 2,000 ms and incremental process RSS under 256 MiB on the current Node 24
coordinator. Measure three runs, report all runs. This measures journal validation
only, not extraction, source rendering, or end-to-end approval. Browser rendering
and end-to-end budgets require their own measured baseline before optimization.

Work remains incomplete until public delivery and the broader E gates pass.

## Shared implementation checkpoint

The shared contract, journal replay/append service, exact retained-text comparison
and version-preserving workflow merge are implemented. No caller changes an
existing capture, active takeoff selection, extracted table or quantity. Pending
requests own their parsed content before awaiting workflow verification.

Seventeen focused tests cover source-set creation, duplicate/renamed originals,
new interpretation capture with old physical bytes, replacement/addendum/split
accounting, reordering, malicious ownership/pairing/head/digest/operation edits,
strict and aggregate limits, all six prior revisions, and old equipment/assembly
edits. A retained real Fort Sam/controlled-hardware history survives actual IDB
save/load and JSON round trip with all original captures and engineering records
unchanged. Its whole-workflow replay receipt identity changes; historical
calculation-record identities do not. This is a persistence proof using retained
real-PDF evidence, not a new PDF extraction or actual revision-pair walkthrough.

Public integration must follow. The existing MCP `Session.retainBasWorkflow`
requires the active loaded PDF set; it cannot deliver a history-only revision
editor correctly. Use a dedicated, exact-state-guarded review entry point over
retained history, not a recompile workaround or fabricated loaded originals.
The UI should expose this inside the existing Review & changes workspace,
persist drafts/return state, retain source-version links, and use the same
append/preview service. No public revision UI or new MCP verb is claimed yet.

Verified final candidate: focused **86629 exit 0**, 17 pass, 12.388 s. Full web
**56770 exit 0**, 2,771 pass / 13 existing skips, 24.245 s tests, 5.06 s build.
Typecheck/lint pass with three existing warnings; legacy One-Click known failure
cases and large-chunk warnings remain, not new corpus accuracy claims. Existing
real-history gate is **3.052 / 2.968 / 2.957 s**, unchanged 5 s budget.

New journal replay: **50.182 / 43.148 / 33.095 ms**, 201,000 page entries,
**149,536,768 bytes incremental peak RSS** against the predeclared 2,000 ms /
268,435,456-byte limits. Initial standalone run: 51.218 / 40.970 / 31.960 ms,
145,866,752-byte increment; first full check: 56.179 / 44.819 / 34.103 ms,
137,003,008-byte increment. No limits changed after measurements.

MCP **38438 exit 0**: typecheck, **119 BAS tests** (59.543 s), build and
**four packaging/proof tests** (96.884 ms). Public verb count/version remain
50 / 0.9.74. This regression pass is not a new public revision walkthrough.
Full standalone Python, full corpus and blind holdout were not rerun.
Compact committed report: `evidence/drawing-shared-1/proof.json`; raw local logs
are `tmp/bas-drawing-{shared-tests-final,web-final,mcp-packaging,bench}.log`.
