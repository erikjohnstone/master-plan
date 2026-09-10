# Review, drawing revisions and approved takeoff contract

2026-09-10. **Pre-implementation acceptance contract for workflow E**, not a
completion report. Extends `IMPLEMENTATION_PLAN.md`; source audit is
`REVIEW_REVISION_AUDIT.md`. The original five workflows remain first. No symbol
matcher, VectorGrid, Python arithmetic or commercial takeoff behavior changes
are authorized by this contract.

## Evidence behind the design

Bluebeam documents separate comparison outputs, preserved originals and explicit
alignment; Procore documents individual/set comparisons and drawing-area context.
These support a reviewable correspondence step, not a claim that a visual
difference is a quantity difference. This is our design inference from official
documentation, not hands-on competitor testing. Sources:
[Bluebeam comparison](https://support.bluebeam.com/revu/features/compare-documents-vs-overlay-pages.html),
[Procore revision upload](https://en-gb.support.procore.com/products/online/user-guide/project-level/drawings/tutorials/upload-drawing-revisions),
[Procore comparison](https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/compare-drawing-revisions).

Browser storage can fail for quota and can be evicted. Estimates do not guarantee
capacity. IndexedDB request success is not transaction completion; transactions
must leave a consistent state if aborted. Therefore source retention and the
approved snapshot must commit together, and external backup remains necessary.
These are implementation constraints, not guarantees of authenticated or permanent
storage. Sources rechecked 2026-09-10:
[MDN transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB),
[MDN quota and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Shared path and migration

**SHOULD THIS BE ON THE SHARED PATH? Yes** for issue aggregation, scope validation,
correspondence, change classification, dependency closure, approval validity,
snapshot contents and export projection. One implementation in `web/src/lib/`
is consumed by browser and MCP. Actual calculation/replay remains in the existing
Node/Python service; a browser hash is not arithmetic verification.

**No** for workspace routes, focus/scroll, IndexedDB transactions, filesystem
delivery and downloads. Those transports accept the same validated content and
must not decide readiness themselves.

Use the next additive `bas_workflow_v1` revision, `bas_review_7`. Preserve all six
existing revisions and meanings. Introduce separate project-review, revision and
release event collections; do not repurpose SOO `review_events`, paper approval
seals or generic mutable snapshots. Older records have no project approval, not
an implicit approval. Every older edit/import path must preserve revision 7.
Unknown future revisions/fields fail explicitly rather than being stripped.

Each new request includes a UUID operation ID, expected journal head, exact
capture/source-set identity, relevant dependency fingerprint and reason. Events
also retain origin, self-declared reviewer label, timestamp and canonical digest.
Reuse `canonicalBasJson`; do not hash UI order/filter/scroll into domain identity.
Idempotent retry returns the original event; changed payload with the same
operation ID, divergent histories, foreign references and stale heads fail.
All strings/arrays/numbers are bounded and finite; identity references require
ownership validation, not a prefix-only check. Explicit source order and sequence
order remain meaningful. No timestamp is treated as trusted authentication.

## One issue queue, not another calculation engine

Derived issues retain their original domain code/status and evidence. Each has:

- `issue_key`: domain + rule + typed subject identity, stable within its scope;
- `occurrence_id`: canonical digest of key, rule version and relevant inputs;
- domain, severity (`blocker`, `warning`, `information`), readable explanation;
- affected equipment/scope/assignment/component/check/page IDs, where established;
- source references in their original version/frame, including conflicting ones;
- current dependency fingerprint, original finding, available corrective route;
- derived state (`open`, `acknowledged`, `resolved`, `excluded_from_scope`, `stale`)
  plus retained decision history. No fabricated bbox for an unlocated finding.

Repeated compile must not duplicate identical occurrences. A changed dependency
creates a new occurrence under the same key; the old decision is history, not an
automatic resolution of the new occurrence. Shared findings repeated in equipment,
assembly and engineering summaries appear once with all affected subjects. New
or unknown codes default to a visible blocker until explicitly classified in a
tested, versioned catalog. A missing module result is not an empty issue list.

Required adapters and initial resolution policies:

| Domain / actual finding | Release effect and permitted resolution |
| --- | --- |
| Source bytes missing, wrong digest, unowned evidence, corrupt history, failed replay | Non-waivable integrity blocker. Restore/verify originals or correct the history; no acknowledgement or exclusion can make a referenced invalid input valid. |
| `SOURCE_DISCOVERY_COVERAGE_UNVERIFIED`; narrative unassigned/unsupported spans, heading-only/conflicted regions, unavailable page text | Coverage blocker for a completeness claim. Require an explicit bounded page/scope review and accounting of applicable unresolved material. Keep automatic discovery incomplete; never relabel an operator review as automated discovery. |
| Point matrix/row issues, ambiguous observations, sparse/uninterpreted columns and unavailable labels/regions | Preserve exact matrix, row, column and source. Correct the supported input/interpretation or explicitly remove the dependent deliverable claim from scope. An arbitrary dismiss action cannot invent a count or ground a cell. |
| SOO unpaired requirements/rows, ambiguous listed rows, unavailable labels, uninterpreted clauses | Show which selected matrix/region was compared. Absence in that matrix is not proof of omission from the whole project. Resolve applicability or source-backed requirement mapping; retain unhandled behavior. |
| Equipment membership/count conflicts, unowned/duplicate tables, building mismatch, unknown scope, multiple-template identity risk | Resolve source-bound equipment/assignment decisions. A bare repeated tag or numeric count cannot establish same-device identity. Keep scheduled and installed quantities separate. |
| Assembly quantity/condition/lifecycle unknown, duplicate component risk, responsibility unknown/conflict | Correct the relevant component or activity claim/resolution, or explicitly exclude the relevant deliverable scope. Furnish/install/wire/program/test remain separate. |
| Engineering constraint `fail` / `not_evaluable`, unknown ratings, stale dependencies, selected component inapplicability | Blocking for that included compatibility claim. Correct inputs/selection and rerun actual Python. An excluded check retains its failed/unknown result and exclusion reason; it never becomes a pass. |
| Explicit source corrections, unused engineering resources, already-excluded members/checks | Visible audit findings; warn when consequential. Do not treat a documented exclusion as an unexplained calculation failure or hide it from the export. |
| Revision pairing unresolved, unaccounted baseline page, contradictory/split pairing, unreviewed changed dependency | Block affected current approval until correspondence/impact is reviewed. Omission from a partial addendum is not deletion. |

Before implementing the catalog, enumerate every emitted code from the source
modules and Python point lists in a checked fixture. Test unknown-code behavior
and prove every catalog adapter is consumed by UI and MCP. Classification may
depend on the included claim and subject, not a blanket severity allowlist.

Allowed actions are explicit and distinct:

1. **Acknowledge** records awareness; no effect on a blocker or numeric outcome.
2. **Correct** opens the existing domain editor. Resolution is derived only after
   the underlying finding disappears on shared recomputation. Save the prior
   occurrence and correction-event reference, even when the issue reappears later.
3. **Review evidence** records a source-bound coverage/applicability decision
   where that rule explicitly permits human review. It cannot override arithmetic,
   corrupted provenance, conflicting identity or missing required data.
4. **Exclude from deliverable scope** names the subject/claim, reason, sources and
   consequence. Recompute all dependent totals/claims; do not just hide its row.
   Shared prerequisites and ambiguous scope stay blocking for included consumers.
5. **Reopen/withdraw decision** appends history and recomputes; no event deletion.

## Sources, correspondence and change semantics

Define a reviewed **source set** independently from filenames and active tabs:
content-addressed original document versions plus selected page references. Keep
the full PDF bytes even when only a subset of its pages is applicable. A revision
event names a baseline source set, incoming capture, mode (`replacement_set` or
`partial_addendum`) and explicitly reviewed page accounting.

Page records use existing source/page IDs. Each baseline page is exactly one of
retained, replaced, explicitly removed or unresolved; each incoming page is
exactly one of replacement, addition, redundant upload or unresolved. References
must belong to those inventories. Replacements are one-to-one. A split/combined
sheet can be represented as explicit removal/additions with pending item-level
correspondence, but must not pretend to be a proven one-to-one match. No hidden
page loss or many-to-one pairing; duplicate page numbers across documents remain
distinct. A partial addendum retains omitted baseline pages by default and shows
that retention for confirmation. An undeclared revision mode is unresolved.

Pairing order:

1. Exact document hash + original page number is exact identity, independent of
   filename/alias. Duplicate uploads create no new equipment or quantity.
2. A saved, source-owned operator correspondence is replayable for that exact
   version pair only. A third version needs a new correspondence decision.
3. Unique contextual sheet identity, title/text layout and existing geometric
   evidence can suggest candidates. Bare filenames, local sheet keys, page index
   or identical text alone cannot silently confirm changed-byte page identity.
4. All ambiguous/unmatched cases remain reviewable candidates. Explicit pairing
   permits source/semantic comparison but does not assert identical ink or carry
   old approvals to new source dependencies.

Keep these independent outputs for each reviewed pair:

- **Byte/source identity:** same original or a different document version.
- **Evidence content:** exact retained text/geometry equal, changed or unavailable.
  Available text equality is labeled as such; it is not a full-PDF ink comparison.
- **Semantic changes:** supported requirements, applicability, components,
  responsibility claims and engineering inputs, with before/after source links.
- **Quantity changes:** only comparable shared-engine quantities of the same
  dimension and basis. Unknown is null, not zero. Expose basis changes instead of
  subtracting scheduled devices from channels or candidate symbols.
- **Approval impact:** which exact dependencies changed or remain unresolved.

Cross-version item matching needs a saved explicit correspondence or unique
proven scoped identity. A tag repeated across buildings never suffices. Pairing
does not mutate an old capture, transfer its bboxes or silently rebind an old
decision. Changed-source re-exports may show zero supported quantity delta while
still requiring provenance review. Renumbering/reordering likewise does not
invent additions/removals. Unresolved matching must not be reported as exact zero.

## Selective approval and readiness

A scope explicitly names the source-set ID, included equipment/subjects and
deliverable claims: scheduled equipment, assigned points, assembly components,
responsibilities and/or declared engineering compatibility. Unreviewed discoveries
and exclusions remain visible in the project queue/export. Installed/as-built
quantity and complete design certification are not claims this phase may create.

Compute each included subject's dependency closure from exact source spans/cells,
scope/identity/bindings, referenced templates/SOO/component conditions, applicable
responsibility claims, relevant check resources/inputs/results and rule versions.
Include shared constraints: a power-pool or system-once assignment depends on all
participating members, not just the selected equipment row. Adding a member can
invalidate a pool result without changing the old member's own record.

Do not use a whole-workflow hash as the only per-item invalidation key. An unrelated
item edit leaves an unaffected review current. A changed/new/removed relevant
dependency, rule, source or correspondence marks that review stale. Existing
coarse engineering/assembly freshness remains disclosed; selective review cannot
claim a stale saved calculation was revalidated. Reuse actual Python replay or
explicit recomputation before approval. Historical snapshots remain valid records
of their past inputs, but are not automatically current for the working source set.

Readiness is `blocked`, `ready_for_explicit_approval`, or `approved_for_scope`.
It requires complete accounting of the declared scope, verified source availability,
current required calculations, resolved blocking issues and current explicit review.
A preview never approves. Zero findings from an empty capture is not readiness.
Project-wide readiness additionally requires the whole declared source universe
and applicable discovered/uninterpreted material to be accounted for; a scoped
approval must never be labeled project-complete. Preserve all existing
`project_complete: false` meanings unchanged.

## Durable release and non-commercial export

Approval seals an immutable-through-app snapshot, with ID from its canonical
payload. The payload includes the selected source set, workflow/evidence prefix,
exact rule/engine versions, reviewed scope and dependency manifest, original
inputs/results, current and outside-scope issues, exclusions, decisions and
self-declared reviewer identity. Define the hashed payload without its own digest
or sealing event to avoid a self-reference. A separate append-only seal event
references the snapshot ID; revocation/supersession never edits the snapshot.

Browser delivery uses source-by-hash and snapshot-by-hash records scoped to the
current local project. Verify byte hashes/lengths before the transaction; then
compare the expected persisted workflow/head and atomically retain the required
bytes, snapshot and seal. Await transaction completion, not individual request
success. Hashing/network/Python awaits must not leave an inactive transaction.
On quota, abort, mismatch or cancellation there is no approved flag, partial
snapshot or source deletion. Do not delete older evidence to make room silently.
Retry is idempotent. Source retention must survive ordinary close/removePdf;
cleanup is a separate explicit action with dependency warnings, never implicit.

MCP uses the same payload/replay gates and safely staged local artifact delivery.
Do not overwrite an existing archive by default. UI/MCP must reject stale working
state after asynchronous verification. Persisted workflow writes cannot discard
a newly sealed snapshot/journal on a concurrent autosave or ordinary import.
Project scoping must be tested; do not leak one project's sources into another.

An export bundle contains a versioned manifest, exact snapshot JSON, seal/history,
the referenced original PDFs addressed by digest, and readable non-commercial
tables for issues, decisions, changes and included results. Existing engineering
workbook/input paths are reused. Bundle verification checks every referenced
object/byte hash and reruns required shared calculations before restoration.
Reject path traversal, duplicate/conflicting entries, missing originals, excessive
declared size and corrupted digests. Incomplete evidence may be inspected with
an explicit unavailable status, never restored as verified approval.

An app can make its records append-only and detect accidental tampering; a local
user can still clear/edit storage and fabricate a new unsigned history. No claim
of trusted timestamp, verified reviewer, ACL, server immutability or regulatory
signature. Display this boundary and offer archive backup. New cloud/auth
infrastructure requires a separate user decision.

## Complete UI journey and acceptance gates

Use one **Review & changes** entry inside Takeoff, with Issues, Drawing changes
and Approved snapshots as internal views, not permanent canvas rails. Source
comparison uses the available width and original-version navigation. Existing
equipment editor routes fix issues; filters, selection, draft, scroll and return
context survive navigation. Keyboard/focus and non-color status work in both
themes at 1280×800, 1440×900 and 1920×1080. Show unknowns/exclusions without warning
walls; dense tables scroll internally. No nested modal stack.

Before calling E complete, the following must pass with independently authored
expectations, actual public UI and packaged MCP evidence, not injected outcomes:

1. A real-PDF scoped takeoff proceeds through issue inspection, correction,
   current shared recomputation, explicit approval, source-inclusive export and
   reopened source citation. A positive approval path is mandatory, not all refusals.
2. Every emitted issue code is covered; repeated compile is idempotent; unknown
   codes stay visible/blocking; failed constraints and unresolved source coverage
   cannot disappear by acknowledgement. Outside-scope issues remain in artifacts.
3. Same-byte duplicate/rename; changed-byte unchanged-value re-export; reordered
   pages; sheet renumbering; same-tag changed quantity; removal/replacement;
   partial addendum with retained pages; duplicate numbers/pages; ambiguous and
   split correspondence. No accidental deletion, doubling or unknown-to-zero.
4. Relevant source/rule/input changes stale the affected approval; unrelated item
   edits do not. Shared-pool membership and applicability changes invalidate all
   dependent consumers. No silent rebase of old bboxes, results or signatures.
5. Preview/cancel creates no approval; retry creates one seal; competing saves,
   imports and late responses preserve history or fail explicitly. Migrations
   from all six revisions preserve prior values and new fields in both surfaces.
6. Wrong/missing bytes, quota/abort, tab reload/close, closePdf, project switching,
   malicious bundle entries and restoration failures preserve the last good
   snapshot. Source citations resolve archived originals, never a newer namesake.
7. Live UI screenshots are visually inspected across both themes/sizes; test long
   issue/change lists with bounded rendering and unchanged exports. Freeze timing
   and memory budgets from the reproduced pre-change baseline before optimizing.
8. Real revision pairs are required where available. Title metadata identifies
   candidate addenda only, not an original/revision pair. Source-derived controlled
   changes supplement missing cases and are labeled as such. Holdout bodies/keys
   remain untouched until the final gate; do not silently replace all real review
   with synthetic tests.
9. Focused schema/replay/persistence/negative tests, full relevant web/MCP/Python
   gates, then corpus/holdout gates from the goal. Report quantity/reference/graph
   metrics separately and preserve all failures. No key/threshold relaxation.

Implementation can proceed in coherent slices (queue, source retention,
correspondence, approval/export), but no slice is a substitute completion target.
Each must be wired through shared truth, public surfaces and durable state before
being presented as a finished capability. Remaining A–D source/corpus gates and
the appended evidence-gated symbol phase remain part of the active goal.
