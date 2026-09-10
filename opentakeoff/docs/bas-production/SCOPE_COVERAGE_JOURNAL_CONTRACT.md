# Durable scope and source-coverage review

2026-09-10. Continuation of `DELIVERABLE_SCOPE_CONTRACT.md` and the original
five-workflow goal. Human-in-the-loop is the intended production workflow, not
a reason to defer production indefinitely. Existing primary-source research on
project-tailored sequences and retained approval inputs still applies. No new
interpretation rule, arithmetic, VectorGrid or symbol change is proposed here.

**Shared-path gate: yes.** Specification ownership, coverage decisions, immutable
history, replay and dependency currentness belong in shared `web/src/lib`.
Storage/transport and UI interaction remain surface-specific.

## Actions

Add `scope_events` at additive workflow revision `bas_scope_10`, preserving every
older revision and every earlier journal. All events carry an operation UUID,
expected journal head, source-assigned origin, self-declared reviewer, reason,
timestamp and canonical event digest. There is no authenticated signature or
approval. Bound history at 10,000 events / 32 MiB; reject, never truncate.

- Save scope: exact validated scope specification and explicit predecessor for
  that scope UUID. Compile the existing shared preview before saving its digest.
  Require current selectors for the named source set, not silently floating IDs.
- Withdraw scope: identify its current save event. Preserve it and all coverage
  history; withdrawal grants nothing and never deletes source evidence.
- Record coverage: identify a saved active scope, one included claim, an exact
  original page and optionally an explicit nonempty subset of its source spans.
  Name the current basis being reviewed. Whole-page review is available so users
  do not have to classify thousands of individual text fragments.
- Withdraw coverage: identify the current decision for that exact scope/claim/
  source-unit slot. Append withdrawal; do not resurrect older assessments.

Coverage assessments are `applicable_mapped`, `not_applicable`, or `unresolved`.
Applicable mapping requires exact owned inventory targets within the claim's
dependency closure. Other assessments cannot carry misleading mappings. Record
an explicit source-inspection attestation, but label it self-declared: the app
does not prove that someone read or correctly understood the page. All raw
discovery omissions and existing findings remain intact. Agent-origin decisions
remain proposals, not human acceptance or approval.

`not_applicable` is specific to the named claim and exact source unit. It cannot
waive arithmetic, incompatible ratings, missing member identity or other rule
failures. Mapping a paragraph to an item does not prove its interpretation is
complete. Unavailable text stays unavailable even when a person records review.
Overlapping whole-page/span decisions remain separate and conflicting assessments
must be disclosed, not silently resolved by timestamp. Release readiness will
consume these alongside the original issue rules, never as a generic green flag.

## Replay and currentness

Retain selectors and raw source IDs; derive exact text/bboxes from the verified
capture, never accept supplied quotes. The saved review digest binds the selected
source unit, one claim's dependency fingerprint, assessment and mapped item
content. Inspecting a saved decision replays these inputs and checks the digest.
Structural/hash validation during generic workflow loading is explicitly lineage
only; it must not be presented as source/Python/decision replay.

Source-unit and claim-specific dependencies determine currentness. Saving another
scope version or editing an unrelated equipment record must not automatically
invalidate an unchanged decision. A removed claim/unit, withdrawn scope, changed
relevant dependency, mapping or source makes it stale/unavailable. Existing coarse
calculation staleness remains visible. Historical evidence never rebinds to a
newer namesake or bbox. Withdrawal/history remains readable.

## Acceptance and delivery

Predeclared performance gate (before running the journal benchmark): reuse the
3,511,836-byte retained Fort Sam / controlled engineering fixture from the scope
compiler proof. Measure save, whole-page coverage record, and historical/current
decision read three times, each under 5 seconds and the process under 512 MiB
incremental peak RSS. The verified scope compiler baseline is approximately
0.83 seconds; a decision read may need two scoped projections. The 5-second
ceiling includes headroom for validation and hashing, not permission to hide
unbounded replay. This measures internal shared operations, not public UI speed,
PDF-byte checks, fresh Python replay, or arbitrary project-size performance.

Require positive save/read/replay/withdraw, exact evidence, source-unit ownership,
claim/mapping ownership, malformed input, missing/foreign heads, divergent
branches, operation-ID reuse, exact retry, request mutation during awaits,
cancellation, canonical restore and old/new workflow merge preservation tests.
Check relevant versus unrelated edits and overlapping contradictory assessments.
Verify all earlier journal types survive ordinary editors/imports and that the
existing shared inventory/issue/revision gates still pass.

Before public completion, connect these actions to the existing Review & changes
workspace and MCP; verify durable storage adoption, draft/source-return behavior,
late responses, actual original-PDF review, export/reopen and both themes/sizes.
This journal alone does not complete public coverage review, readiness, approvals
or approved snapshots. Those remain required next work, not optional additions.
