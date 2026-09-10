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

## Browser delivery implementation map

The current store has one canonical annotation scope and generation token;
`basRestoreStore.js` already demonstrates private source staging followed by a
single publishing transaction. The BAS original-source store uses content hashes
and 8 MiB chunks. Its records survive ordinary annotation saves and PDF closing.
Reuse those encodings, but do not call restore to save an approval: restore changes
annotations and their generation, whereas snapshot creation must preserve them.

- Put delivery in a separate browser-only module. Keep WebCrypto/Python awaits
  before the final IDB transaction; use the existing lazy synchronous hash library
  inside request callbacks. Resolve only on transaction completion.
- Use separate project-scoped content-addressed snapshot metadata, chunked exact
  takeoff/record data, initial seal and operation identity. Do not use the legacy
  `snapshots` store, whose user-facing rollback lifecycle can remove records.
- Stage one verified original at a time under invocation-private keys. Final
  delivery checks existing originals byte-for-byte and publishes all missing
  originals plus snapshot/seal together. Never overwrite a conflicting original.
- A new approval requires the exact prepared payload and expected annotation
  generation still to match after asynchronous work. The source/capture/head
  checks in shared readiness remain authoritative; IDB cannot invent readiness.
- A verified imported historical snapshot does not approve or replace the current
  annotations. Shared plan mode distinguishes creation from historical reopening;
  a caller-supplied origin/status flag must not grant that authority.
- Local/scoped/Drive/workspace-composite adapters must use the same canonical
  project scope and active-workspace guard. Snapshots/originals remain explicitly
  browser-local until exported; do not silently introduce a cloud sync contract.
- List metadata is not fresh verification. Reading stored content must check
  chunk lengths/digests and then use shared original-byte/Python replay before
  presenting verified historical approval. Currentness/revocation remains separate.

Test actual fake-IDB atomic delivery, late cancellation, quota/abort, staged
corruption, unchanged annotations, stale generation/payload, idempotent versus
conflicting retries, project isolation, multi-chunk originals and payloads,
ordinary import/save/PDF-close retention, and disposed sync adapters. These do not
replace real browser/source-backed and packaged MCP acceptance.

## Public browser integration map

The next UI delivery uses existing `BasProjectReviewWorkspace` and the
`restoreContext.current.read()` seam already passed through `TakeoffDataPanel`.
That seam reads the live payload, generation, pending save and canvas-busy state.
Do not call its `apply()` method for a snapshot: that method restores annotations.

- Keep snapshot navigation internal to Review & changes. A spacious reader shows
  the reviewed scope, included result rows, exclusions, original references and
  review declaration. No new permanent rail, toolbar or modal stack.
- Use shared `catalogBasScope` for saved scope choices and `buildBasReadiness`
  for preview. The UI must not derive readiness from local counts or hide blockers.
- A browser-only client freezes current payload/generation and checks pending
  saves, active adapter and live payload around asynchronous work. Obtain exact
  originals through existing `findBasOriginal`; invoke the existing shared-Python
  replay endpoint, then verify its receipt on the shared path.
- Explicit approval uses `prepareBasSnapshotApproval(..., 'operator_input')`
  and `adapter.saveBasSnapshot`. The Agent gets no approval-origin input or verb.
  Persist only after the operator reviews scope and provides a name and reason.
  Preflight `prepareBasSnapshotBundle` before publication so the exact payload,
  record, source inventory and total archive fit all existing export bounds;
  individual-PDF/source-count storage limits alone do not prove ZIP exportability.
- `listBasSnapshots` is bounded metadata, not current/verified approval.
  `loadBasSnapshot` returns a freshly replayed historical owned plan. Shared
  `prepareBasSnapshotBundle` and the existing streaming Blob transport provide
  source-inclusive export; `openBasSnapshotBundle` verifies an imported archive
  before `saveBasSnapshot` retains it historically. None changes working annotations.
- Use static Vite imports for owned-plan consumers. Hot-reload invalidation must
  discard and reprepare previews; do not move ownership authority onto a global
  object to keep stale plans alive.
- Integrate selective dependency currentness and append-only revoke/supersede
  state before the complete feature acceptance. A historical approval is never
  labeled current solely because it reopened or still has a saved seal.

UI tests must cover a genuine human-action path, no-save/dirty-state guards,
source-service failure, cancellation, switching projects, reload, import/export,
keyboard focus return, both themes and dense source-backed data. Controlled
native-storage checks do not replace that real public journey.
