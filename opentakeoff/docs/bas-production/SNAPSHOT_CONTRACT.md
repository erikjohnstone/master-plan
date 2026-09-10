# Source-inclusive scoped snapshots — implementation contract

2026-09-10. This refines workflow E; it does not complete E or replace the
Agent, A/B reconciliation, corpus/holdout or final symbol gates.

## Research and code decisions before implementation

- [MDN transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
  identifies transaction completion, not request success, as the commit boundary.
  [Transaction lifetime](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
  rules require asynchronous Python/hash work before the final IDB transaction.
- [Autodesk approval workflow documentation](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html)
  distinguishes draft workflows from finalized workflows and preserves existing
  reviews when workflow definitions change. These are documentation observations,
  not hands-on competitor testing. Our separate snapshot/working-state distinction
  is a design inference, not a claim to implement Autodesk's approval model.
- Existing `basEvidenceBundle.ts` is a strict stored-ZIP transport; retain its
  v1 unapproved-backup contract and safety checks. Add an explicitly different
  snapshot archive version using the same ZIP implementation, not a second parser.
- Existing annotation autosave/import cannot overwrite an independent snapshot
  record. Store snapshots and their seal journals separately, keyed by project and
  content digest. Do not embed full prior snapshots into `bas_workflow`: that would
  cause recursive payload growth. The snapshot carries the complete pre-seal takeoff
  JSON, while its approval record references that JSON by exact hash and length.
- SHOULD THIS BE ON THE SHARED PATH? Yes for snapshot hashes, explicit approval,
  readiness replay, artifact validation and selective current-state comparison.
  No for IDB/filesystem delivery, browser selection or download. Neither surface
  may replace readiness with a supplied `approved` flag or saved replay receipt.

## Exact contract and unsupported authority

An explicit operator action names the reviewed scope, reviewer, reason, local
timestamp and retry identity. The shared service freezes the exact takeoff input,
recomputes readiness with original bytes and actual Python replay, and refuses
every blocker. Agent-origin approval is rejected; MCP may inspect, replay and
export a human-approved artifact, not impersonate the reviewer.

The hashed snapshot payload includes the takeoff hash/length, workflow hash,
readiness rule and exact canonical readiness (scope/dependency manifest, current
and outside-scope issues, original-source inventory and replay), and reviewer
declaration. A separate content-hashed seal references the snapshot ID. Neither
hash includes itself. The initial seal is an approval; future revoke/supersede
events append rather than rewrite this record. Local reviewer/time are explicitly
self-declared and untrusted, not authenticated signatures or server immutability.

The preparation result is an opaque, owned plan, not an approved persistence
receipt. Mutating a displayed preview must not mutate what gets committed.
Source-inclusive archive verification checks payload/seal/source hashes and
recomputes the complete saved readiness through the current shared verifier.
Unknown rule versions fail explicitly, never silently upgrade historical approval.
An archive's claim is unverified until replay succeeds; a verified historical
snapshot is not automatic approval of a newer working workflow.

## Gates fixed before implementation

1. Controlled positive scope: exact original bytes, independent expected reviewer,
   retained outside-scope issues, unchanged working input, deterministic retry.
2. Missing/wrong bytes, blocked scope, agent origin, malformed/extra fields,
   unknown rules, false replay, cancellation and caller mutation cannot seal.
3. Tampered payload, recomputed hash around false readiness, changed seal and
   foreign source membership fail verification. Hash equality alone is insufficient.
4. Stored-ZIP roundtrip includes complete takeoff, snapshot/seal and all originals;
   unchanged v1 archives still roundtrip. Neither reader accepts the other archive
   purpose accidentally. Existing path/duplicate/CRC/size/inventory gates apply.
5. Fresh shared Python replay is required for saved calculations on preparation
   and reopening. Fake/no-calculation fixtures are not real-PDF evidence.
6. Atomic IDB delivery checks expected annotations and generation after async work;
   failure/quota/cancel leaves no seal. Retry is idempotent; conflicting retry IDs
   refuse. Ordinary saves/closePdf/import cannot delete snapshots or their originals.
7. Existing scope dependency fingerprints drive currentness; unrelated edits do
   not invalidate a claim solely because the whole workflow hash changed. Relevant
   edits/shared pools/coverage withdrawals block currentness, not historical viewing.
8. Actual browser approval/export/reopen and packaged MCP replay/source inspection
   with the real development PDF remain mandatory before E completion. Add readable
   non-commercial results/issue/decision tables and internal Approved snapshots UI;
   no toolbar, nested modal, pricing, or extraction changes.

## Bounds

Reuse existing 256 MiB takeoff payload, 512 MiB individual PDF, 2 GiB-minus-one
archive and 64 KiB streaming chunk bounds. Snapshot JSON is capped at 256 MiB;
its declaration/manifest stays within the existing 16 MiB manifest bound.
No all-originals-in-memory archive requirement. Readiness retains its existing
250,000 work-unit and measured 10-second/512-MiB preview budgets; do not weaken
these to pass. Separate full source hashing/Python/archive timings and memory
from readiness projection time. Measure real retained fixtures and keep failures.

For the first source-backed core roundtrip probe (the retained 3.5 MiB nine-page
development history, original PDF and actual Python), fix 25 seconds each for
preparation and reopened verification, and 512 MiB incremental peak RSS for the
serial run before executing it. The existing projection gate is 10 seconds;
the extra wall-time allowance covers full-history Python and source/archive byte
verification. This is an internal transport probe with controlled applicability
decisions, not the required public human-reviewed approval journey or automatic
coverage evidence. Report setup, preparation, archive and reopening separately.
