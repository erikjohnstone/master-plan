# BAS comparison review history

2026-09-10, after `b7563f9a`. Original workflows A–E remain the goal; the
symbol/installed-plan extension remains last. This work covers the persistence and
public-use part of revision comparison, not approval or release by substitution.

## Research and shared-path boundary

Autodesk's documented [comparison workflow](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Compare_Sheets.html)
separates explicit version/snapshot selection from quantity comparison. Its
[inventory workflow](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Inventory.html)
offers item detail, source location and export. Rechecked 2026-09-10; documentation,
not hands-on competitor testing. Design inference: preserve explicit comparison
inputs, inspectable originals and complete export separately from viewport paging.
Do not import commercial costing or claim competitor authentication guarantees.

**SHOULD THIS BE ON THE SHARED PATH? Yes.** Comparison request ownership,
history/identity, replay, freshness and result binding are one shared service.
Existing Python remains the quantity authority. Wire schemas must not import
Workflow implementation; preserve existing import paths with re-exports. UI
forms/paging/return context remain surface-specific. No extraction changes.

## Persistence and replay contract

- Add an explicit workflow revision and append-only comparison journal. Each
  event records a name, self-declared reviewer, reason, operator/proposal origin,
  exact before/after bases, one-to-one correspondence/add/remove/membership
  decisions, expected report fingerprint, operation ID, previous journal head,
  timestamp and event fingerprint. It is a correspondence record, not approval.
- Pin source sets and actual event/calculation IDs. Never resolve stored bases
  to newer records on reopen. Unresolved items may remain in a saved comparison;
  they remain unresolved and block any later readiness claim as applicable.
- Before append, rerun the complete shared comparison and Python checks against
  caller-owned input; bind its exact report to the preview fingerprint. Reject
  stale head, foreign selectors/items, changed preview, reused operations,
  cancellation and runtime failure without a partial write. An exact retry after
  later events returns its own prior event without duplicating or rebasing it.
- The journal stores decisions and report identity, not a second set of numeric
  results. Original quantities/evidence remain in their pinned captures and
  calculation records. Read-only reopening recomputes the report and explicitly
  distinguishes a match from a changed rule/result. Never relabel a new result as
  the previously reviewed report. Source bytes and engineering certification are
  separate from this replay.
- Workflow structure/hash validation checks journal lineage, unique operations,
  source-set and event/calculation ownership. It is not a comparison replay or
  approval receipt. Restored journal entries stay unapproved; every selected
  comparison must replay before its differences are used. A re-signed foreign
  correspondence or fabricated report fingerprint cannot pass that replay.
- Merge/import/sync and all old edit/calculation paths preserve new history or
  reject a conflicting branch; they never strip it or lower the workflow version.
  No deletion endpoint, authenticated identity, server immutability or signature
  guarantee is invented. Approved snapshots remain a separate required stage.

## Public journey and bounded data

The UI overview pages 25 rows and explicitly previews the first three measures
per row. Selected detail exposes every measure in pages of ten, changed fields
in pages of twenty and original sources in pages of ten. Correspondence choices,
draft decisions and saved history are paged; capture selectors are grouped five
per side. These are presentation bounds, not truncation of reports or exports.
The changes/unresolved filter consumes the shared status: unknown values, stale
dependencies and pending membership decisions remain visible even when source
fields compare equal. Selection focuses the detail heading; original-source
navigation retains the selected item, draft and filter.

Use **Review & changes**, without permanent new chrome. Choose both exact bases,
inspect/search/pair items, view original evidence, compare requirements and
comparable quantities, record reasons, save, reload, reopen and export. Preserve
draft/selection/source-return state. MCP uses the same service and returns bounded
pages; proposal history remains session-only until ordinary export. Full valid
comparison data must survive exports; no silent truncation to the displayed page.

Bounds before implementation: at most 10,000 journal events, 250,000 combined
capture selectors and explicit correspondence decisions, and 64 MiB encoded
journal. Existing comparison limits remain 100,000 items per side / 200,000 rows /
64 MiB report and 1,000-record / 30 MiB Python batches. Invalid/oversized requests
fail explicitly. Establish a first serial real-retained append/reopen baseline
before optimization; keep existing 5-second history/inventory and 6-second
comparison gates unchanged. First serial measurement: prepare 4.013–4.093 s,
record 4.131–4.190 s, reopen 4.018–4.248 s; incremental peak RSS 251,494,400 bytes.
Before further candidate evaluation, require each of these operations below 6 s
(about 41% headroom over the worst baseline) and incremental peak below 512 MiB.
Same retained basis on both sides, growing one to three journal records; this is
not a maximum-schema-size latency claim or an issued-addendum benchmark.

## Required verification

Public replay defect reproduced on 2026-09-10: the source-inclusive backup sorts
JSON object keys. `Object.values(raw.cells)` had made revision source-reference
lists depend on those insertion orders. Browser/MCP reports differed on 341 of
698 rows, exclusively `source_refs` order and its `content_fingerprint`; quantities,
locations and original values did not change. The canonical-property-order
regression fails before the fix (`tmp/bas-revision-order-before.log`).

Shared-path decision: this is revision evidence projection, not extraction.
Inventory rule `bas_revision_inventory_2` orders deduplicated source references
by exact canonical JSON keys, with no locale collation. No source values, boxes,
item identities, comparison rules or Python arithmetic are altered. Existing
saved reviews remain immutable: an old fingerprint can report a mismatch and
requires a new explicit review, never a silent rewrite. Reverify full public
browser → backup → packaged MCP replay with fresh rule-2 reviews; keep the failed
rule-1 artifacts as evidence rather than replacing their expected fingerprints.

Public transport boundary (declared before public candidate evaluation): the
revision-only HTTP route accepts and returns at most 128 MiB of UTF-8 JSON,
including the retained workflow plus operation/report envelope. Existing BAS
HTTP routes stay at 32 MiB. This is a transport ceiling, not a promise that the
sum of all independently valid maximum-size fields fits one request. Over-limit
requests/results fail explicitly; no data is silently truncated. The existing
45-second HTTP deadline and 30-second comparison deadline remain unchanged.
Public UI timing includes serialization, transport, response validation and
autosave in addition to the independently gated shared comparison service.
Measure that complete journey before claiming an interactive speed improvement.

First passing public browser baseline (`revision-browser-6`, exact original plus
controlled reordered pages, 698 comparison rows): initial comparison 5.321 s,
explicit-pair comparison 5.157 s, save through durable autosave 12.239 s, reopened
comparison 5.452 s. This is an end-to-end observation, not a reduction in shared
service latency. Before subsequent candidate evaluation, set UI comparison/reopen
limits at 8 s and save-through-autosave at 15 s (about 47% and 23% headroom over
the observed worst respective baseline); retain the existing 6-second service
gate. These are this retained fixture's interaction limits, not maximum-history
or universal hardware guarantees. No new latency optimization is justified by
this single observation. Keep original timing and failed walkthrough evidence.

MCP delivery uses the existing `bas_drawing_review` tool with an additive
`revision` command; old page commands retain their behavior. `inspect` discovers
retained source sets and selectable review IDs; `run` invokes the same four
revision operations as HTTP. A bounded read projection exposes up to 50 entries
at a time, explicit container lengths, scalar previews (256 UTF-16 code units),
and complete string slices (up to 16,384 UTF-16 units). Previews are identified,
not represented as complete source text. Every original field is reachable by
an own-property path. The full unchanged result is exportable as JSON.

Retain at most one completed response per Session, for 15 minutes and at most
128 MiB encoded JSON; opaque view IDs are not approval or persistence. Paging
does not rerun Python and explicitly describes itself as reading a completed
replay. Any workflow/load/restore mutation invalidates the view, including a
load that returns to identical bytes. A new run replaces it. Record only after
all service/schema/size/response checks pass and the exact-state guard still
holds; cache the post-record state. Export uses existing atomic artifact writing
with a final state/cancellation guard. Never silently rebase a stale view.
This cache and file delivery are surface-specific, not a second truth engine.

Positive save/reopen and changed requirements/quantities; incomplete correspondence;
old pinned heads after unrelated and relevant edits; exact retry after later
records; changed request/origin/preview; cross-journal duplicate IDs; forked,
missing, reordered and re-signed history; absent/foreign sources and calculations;
unavailable Python and cancellation; malformed/oversized input; all old workflow
revisions and all old write paths; actual IndexedDB and export/reimport; source
aliases without source rewriting; independently checked count/result binding.

Use retained real Fort Sam sources and labeled controlled revision fixtures;
do not open the blind holdout during implementation. Before public completion,
exercise actual UI and packaged MCP, source inspection, dense lists, both themes,
desktop sizes, keyboard operation, loading/error/cancel states and portable
recovery. Green internal tests alone do not finish this journey or the BAS goal.
