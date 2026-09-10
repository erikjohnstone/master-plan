# Persisted sequence evidence and association review

Pre-implementation contract. Shared: source validation, capture identity,
association event replay, concurrency/idempotency, comparison and export data.
Surface-specific: reading layout, selection, search, form fields and source clicks.
The five complete workflows remain the goal; this integrates the existing
bounded semantic kernel, not a replacement for broader SOO/equipment support.

## Evidence and migration

Extend `bas_workflow_v1` to revision `bas_evidence_2`. Old point-only captures
retain their exact fingerprints and remain readable/exportable. New captures
retain the complete validated `bas_sources_v1` PDF-text snapshot, in addition
to unchanged point matrices. Original text, span/page IDs and image coordinates
remain immutable. This is retained PDF text, not a historical PDF-byte archive.
The capture records the narrative/interpretation rule version. Current rules
must not silently recompute an old-rule capture as if it were unchanged.

Do not omit difficult pages, truncate narrative sources or claim an absent
heading means no SOO. Complete source snapshots can be large: measure actual
payload/runtime/memory, enforce explicit validation limits and address transport
batching before claiming large-corpus completion. Never convert a size failure
into a successful empty record. Failure preserves existing saved state.

## Associations as separate events

Associations do not mutate captures. A validated event targets one capture and
its expected prior review head. Actions upsert one sequence/matrix association
or remove it with a reason. Scope/reference inputs are source-bound, not
verified installed-equipment instances. No point multiplication, approved
snapshot or engineering pass is created by association.

An operation ID makes exact retries idempotent. Reusing it for a different
request, stale-head updates, unknown targets, invalid evidence and conflicting
import branches fail before mutation. Event fingerprints cover parent, input,
origin and timestamp. These are local tamper checks, not authenticated reviewers
or server-enforced immutability. UI events say `operator_input`; MCP requests
say `agent_proposal`. Neither mints an approved takeoff.

Import unions captures and compatible event history. Divergent review chains
require explicit resolution; never silently choose a winner. A new capture
does not inherit old associations. Replaying a saved capture uses the same
shared module in UI and MCP. Export includes original evidence and every event.

## Complete journey for this increment

Real PDF → shared BAS compile retains points and source text → Takeoff reader
shows original SOO paragraphs and bounded monitoring requirements → operator
selects a sequence, a point matrix and literal equipment-reference evidence,
records scope/reason → shared event + comparison → inspect both source sides →
reload/export/import → exact event/comparison parity → revise/remove association
without changing source evidence. No new permanent canvas navigation.

MCP uses optional `bas_review` on the existing BAS compile tool; it invokes the
same event service with proposal origin and the expected capture/head. UI uses
that shared service against its validated retained capture, without another
extraction call. Invalid review requests cannot discard prior review history.

Acceptance: legacy capture/exports unchanged; new captures preserve all original
text/frame/IDs; six original-PDF monitoring controls and five/one comparison
result; timestamped source-preserving edit/remove history; stale-write and
retry/forgery/fork controls; actual browser and MCP create/reload/import/export;
both themes, keyboard form operation, dense original prose, source-return state,
visible unsupported clauses and errors. Full equipment assignment/replication,
broader requirement coverage, assemblies, compatibility, revisions/approvals and
full corpus/holdout gates remain required after this increment.
