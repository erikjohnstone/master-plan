# Scoped readiness — pre-implementation contract

2026-09-10, baseline `6192c488`. This is the next implementation within workflow
E, not a reduction of the five workflows or a production-completion statement.
The approval journal, atomic source-inclusive snapshot and both public journeys
remain required after this shared readiness service.

## Research and existing paths

Official Autodesk documentation separates draft workflows from finalized review
workflows and preserves the workflow definition used by an earlier review:
[Autodesk approval workflows](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html).
Our inference: readiness is a computed prerequisite, not an approval event; later
edits must not silently rewrite an old decision. This is not a claim of hands-on
competitor testing or BAS engineering authority. Source rechecked 2026-09-10.

[MDN transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
requires waiting for the transaction to commit. Therefore the future seal must
atomically store sources/snapshot/history after verification, not after an
individual IndexedDB request succeeds. Readiness alone does not persist a seal.
The BAS evidence/rule rationale remains in `REVIEW_REVISION_CONTRACT.md` and the
existing A–D research; this increment changes no engineering rule or arithmetic.

Reuse `basScopeReview`, `basDeliverableScope`, `basProjectReview`,
`basSourceRetention` and `basWorkflowReplay`. The existing Python service checks
saved results; its receipt is not proof that those results use current inputs.
Keep freshness and arithmetic replay as independent gates. No VectorGrid,
symbol, quantity, bbox, extraction or Python arithmetic change is needed.

## Shared boundary and supported journey

**SHOULD THIS BE ON THE SHARED PATH? Yes.** One shared service takes the owned
workflow and exact saved scope event, replays scope/coverage, derives current
dependencies/issues, verifies original bytes through the shared hash verifier,
and checks the receipt from the trusted existing Node/Python transport. Public
requests cannot submit an issue list, ready flag, verified-source boolean or
calculation receipt as an authority. Source loading and invocation of the
existing Python transport remain surface-specific adapters, not alternative
readiness engines. Adapter receipts are checked against the exact workflow.

An operation verifies/copies its inputs before asynchronous work. Replay and
source adapters cannot mutate the evaluated workflow. Cancellation/errors yield
no partial ready result or state adoption. No workflow, journal, file or approval
is written by this service. Invalid hashes/history/re-signed false projections
throw; missing source availability or missing replay capability is an explicit
blocker. No cached receipt carries forward to a different workflow.

Compute `blocked` or `ready_for_explicit_approval`, always `approved: false`,
`project_complete: false`, `installed_quantity: null`. The future seal is a
separate explicit human action. Agent proposals cannot supply human review.
Reviewer labels remain self-declared, not authenticated identities.

## Coverage and selective validity

- Require an active operator-authored saved scope. Replay its original projection;
  compare each included claim's current dependency fingerprint, not just the
  complete workflow/head hash. An unrelated edit must not invalidate unchanged
  claim review. Relevant changes require renewed review; stale calculations and
  missing/pinned/foreign dependencies remain blockers even if old math replays.
- Account for every selected original page in each claim's capture. A current
  human whole-page review accounts for that page; otherwise require the union of
  all original span IDs, with no automatic empty-page success. Original PDF
  inspection is still required for pages with no extracted text. This is explicit
  bounded human applicability accounting, never automatic discovery completeness.
- Unresolved, withdrawn, stale or agent-only decisions do not provide coverage.
  Contradictory overlapping active assessments block; they are not last-write-wins.
  Use one operation-local replay context, not a whole-workflow recompile per row.
- Every source reference used by an included dependency must be in a current
  applicable mapping to that exact dependency. Table-cell references without a
  narrative span require a whole-page mapping; do not invent span equivalence.
  A page marked irrelevant cannot simultaneously substantiate an included value.
- Explicit operator scope metadata may have no source spans if its validated
  register provides the auditable decision. This does not waive a missing source
  cell, unknown scope field, missing source binding, unknown rating or quantity.
- No automatic replication, interpretation, assignment or exclusion is introduced.
  Catalog/preparation can preselect exact-reference candidates, but never silently
  assert applicability or human inspection. Measure remaining review effort in
  the required final real-corpus journeys.

## Issues and calculations

Retain every original derived issue for the selected captures, including issues
outside the included dependency closure. Attach effects to exact claim/dependency
identities, not bare tags or bounding-box proximity. Preserve source references,
original finding, code, severity and disposition. Unknown codes fail closed.
Issue acknowledgement cannot change readiness.

Source-byte inventory findings are satisfied only by verified bytes. Discovery
and unhandled-text accounting findings can be accounted for by complete current
human coverage of their original page/spans for the selected claim; report this
as reviewed applicability, not repaired extraction. Domain defects (unresolved
point cells, missing quantities, identity conflicts, responsibility unknowns,
failed/not-evaluable engineering constraints) require the existing corrective
workflow or a genuinely outside-scope claim. Unclassified affected relationships
remain blocking rather than being silently excluded. Shared prerequisites stay
inside the dependency closure even when their report claim is excluded.

Replay all retained calculation records through the existing Python verifier
before readiness, so an archive does not bless corrupt historical calculations.
Keep the receipt separate from per-claim dependency freshness. No saved result,
even a passing one, is accepted solely because it has a hash. An included check
whose target is explicitly excluded cannot become an approved compatibility
claim. Empty/missing required calculation output is not a positive result.

## Acceptance and predeclared budgets

Tests must include a positive fully accounted, source-verified scoped equipment
claim; all five claim kinds; source/callback mutation; missing/wrong bytes; false,
missing or stale replay receipts; actual Python positive/fail/unknown replay;
proposal/withdrawal/conflict/stale coverage; incomplete span/page accounting;
exact mapping ownership; unknown issue codes; inside/outside defects; unchanged
unrelated edits, changed relevant inputs and shared prerequisites. Source text,
bboxes, original findings/results and caller workflow must remain unchanged.

Use retained real-PDF workflow `scope-browser-7/reviewed.takeoff.json` for a
reproducible performance/blocked-state check, not as a positive approval fixture:
its coverage was intentionally withdrawn. Public UI and packaged MCP positive
approval/export/reopen remain mandatory in the subsequent integrated E gate.

Baseline public scope operations were 0.944–4.262 s; scope projection/journal
budgets are 5 s / 512 MiB incremental RSS. Predeclare a 10 s / 512 MiB incremental
RSS bound for the aggregate shared readiness projection on that retained fixture,
excluding original-file IO and actual Python execution. The existing 30 s Python
verification deadline remains unchanged. Bound page/claim pairs and source-
mapping checks at 250,000 each, fail explicitly instead of truncating, and check
cancellation during loops. Do not weaken existing accuracy or performance gates.
