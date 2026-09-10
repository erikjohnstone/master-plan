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
