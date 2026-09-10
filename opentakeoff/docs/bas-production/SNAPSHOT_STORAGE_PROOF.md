# Browser snapshot storage — implementation and verification

2026-09-10, after local checkpoint `b188b6b7`. This implements browser delivery
for the shared snapshot core. Workflow E and the five-workflow goal remain open.
The preceding increment's combined snapshot memory gate still fails; no new
performance or real-corpus score is claimed from these controlled storage tests.

## Research and pre-change boundary

The [IndexedDB transaction specification](https://w3c.github.io/IndexedDB/#transaction-lifecycle)
requires an aborted transaction to undo its changes and a commit to apply all
changes atomically. Requests complete in transaction order. Python and asynchronous
hashing therefore run before publication; final chunk comparisons use the existing
synchronous hash library within request callbacks. A request success is not a
commit receipt. The final receipt resolves on transaction completion.

[Durability hints](https://w3c.github.io/IndexedDB/#transaction-durability-hint)
and [the transaction API](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction)
distinguish persistent-medium checks from relaxed operating-system writes. Use a
strict hint for final approval publication; this is not a guarantee against browser
eviction, storage clearing, device failure or a malicious local user. Originals
and snapshots remain browser-local until exported. Existing cloud sync is unchanged.
[AbortSignal.any](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/any_static)
combines caller cancellation with the lifetime of the active sync workspace.

SHOULD THIS BE ON THE SHARED PATH? **No for this increment's IO.** The new
`basSnapshotStore.js` is browser storage, consumes only shared owned snapshot
plans, and calls shared original/Python/readiness verification on reopen. It cannot
create readiness or accept an arbitrary caller's approval flag. Existing shared
interpretation, quantities, schemas, citations and VectorGrid are unchanged.

## Implemented contract

- Canonical annotation scope is also the snapshot scope: plain local, scoped local,
  Drive composite, and synced-workspace composite use the same underlying project.
  Disposal aborts in-flight snapshot operations. No snapshot push is scheduled.
- Stage exact payload, record and one original at a time under invocation-private
  keys. Existing source encoding remains compatible: old small ArrayBuffers and
  8 MiB chunk records. No existing original is overwritten or silently repaired.
- Final transaction rechecks all staged lengths/digests, compares existing originals,
  and publishes metadata, payload/record chunks, original-source records, separate
  initial seal and retry identity together. Retry IDs cannot identify two snapshots.
- Creation compares exact saved annotations and generation after asynchronous work.
  Historical import uses the shared plan's mode and never replaces current work.
  Neither path modifies annotations or their generation.
- Failure cleanup deletes only successfully staged private keys from that invocation.
  An interrupted process may leave private orphan staging, never a visible approval.
- List returns at most 100 metadata rows plus a cursor, explicitly not replayed or
  current. Load checks chunk lengths, exact UTF-8/hash content, metadata/seal/operation
  consistency and fresh shared original/Python/readiness replay before returning
  an owned historical plan. Currentness, revocation and supersession remain separate.

## Failure and focused test ledger

- **99557 exit 0:** initial production typecheck/lint, three existing canvas warnings.
- **79642 exit 1:** ten pass, one failure. Late cancellation correctly aborted the
  transaction, but a subsequent inactive-transaction error replaced its cancellation
  reason. Preserve the first failure; did not weaken the cancellation assertion.
- **80485 exit 0:** typecheck plus 47 snapshot/restore/sync/composite tests pass,
  4.968 s, including the corrected cancellation case.
- **93938 exit 0:** 14 storage tests pass, 3.273 s. Additional cases cover a Unicode
  code point crossing an 8 MiB chunk, actual active-PDF close, partial staging quota,
  preservation of another invocation's stage, and disposal during final publication.
- Added a fifteenth test for actual Drive and workspace composite scope binding;
  included in the full web gate. Controlled data and no saved calculations are not
  substitutes for real-PDF and actual-Python integration evidence.

- **88334 exit 0:** first full web check, 2,907 pass / 13 existing skips / zero
  failures, 69.144 s; types/lint, all configured benchmarks and build (9.57 s).
  Readiness 1.166–1.302 s / 411,009,024 B incremental peak RSS passes its unchanged
  projection gate; the separate combined source-backed gate remains open.
- After this run, final publication gained a strict durability hint; the storage
  test now asserts the actual transaction's hint. **86046 exit 1:** typecheck and
  15 storage tests passed (3.248 s), then native launch failed because Playwright's
  downloaded headless binary was absent. No storage operation ran in that attempt.
- The installed Chrome 152.0.7977.83 was verified and selected using Playwright's
  [documented branded-browser channel](https://playwright.dev/docs/browsers#google-chrome--microsoft-edge).
  No browser was installed and no existing user browser profile was used.
- **6378 exit 1:** injected raw test imports bypassed Vite's HMR URLs, producing
  two module instances. The owned-plan WeakMap correctly refused storage. Added a
  static test-only import graph; no production ownership bypass or global cache.
- **14632 exit 0:** native Chrome save, page reload, shared historical reopen and
  corrupted-payload rejection passed. Actual publication transaction reports
  strict durability. Controlled small-fixture save 22.6 ms / reopen 26.6 ms;
  not a source-backed performance budget or independent BAS accuracy claim.
  Log: `tmp/bas-snapshot-storage-browser-2.log`; original failing browser attempt:
  `tmp/bas-snapshot-storage-browser.log`.
- Final review added browser storage's explicit 512 MiB/PDF and 10,000-original
  caps by reusing `BAS_BUNDLE_LIMITS`, before any source read/staging write. A
  sixteenth test covers exact boundaries without allocating enormous test PDFs.
  This change landed after the running full web gate's test phase; its tests must
  be rerun, not credited to that earlier result. Full archive preflight (including
  total ZIP/manifest bounds) remains part of public approval integration.

Native Chromium proof script:
`web/scripts/verify-bas-snapshot-storage-browser.mjs http://127.0.0.1:5177`.
It uses a fresh browser context and controlled evidence, not user state or API keys.
It is not the public UI journey.

## Final checkpoint gates

- **67324 exit 0:** full web types/lint/2,907 pass/13 existing skips/zero failures,
  all configured benchmarks and build (8.93 s); MCP types, four packaging tests
  (0.160 s), 17 scope/snapshot tests with actual Python (5.291 s); package-enabled
  Python 453 pass in 12.05 s and mypy 20 files. Web tests preceded the final size
  guard; packaging/scope/Python ran after it. No altered benchmark is credited.
- **57481 exit 0:** after the size guard, reran types, lint, the entire web suite
  (2,908 pass / 13 existing skips / zero failures, 66.637 s), and build (8.74 s).
  Existing three canvas warnings and bundle-size notices remain. Unchanged
  configured benchmarks passed in 67324; this follow-up did not rerun them.
- The same chain reran native Chrome storage/reload/corruption verification on
  final code: strict hint, 25.9 ms controlled save / 25.2 ms controlled reopen.
  Log: `tmp/bas-snapshot-storage-browser-3.log`. All test/browser processes ended;
  the owned isolated Vite remains available. No user browser profile was changed.
- Documentation's existing 31-file relative-link check and staged diff whitespace
  checks pass. That link checker does not recursively validate this BAS doc folder.

No UI was added in this checkpoint and no real-PDF end-to-end approval is claimed.
The current mutation is storage-only; no fresh corpus/holdout/quantity score is
claimed. The combined source-backed snapshot memory failure is still retained in
`REGISTER_VERIFICATION_PROOF.md` and must pass before complete feature acceptance.

## Remaining work

Complete explicit approval, source-inclusive export/import and snapshot reader in
the internal Review & changes workspace. Add selective dependency currentness,
append-only revoke/supersede history and readable non-commercial result tables.
Run actual real-PDF browser and packaged MCP journeys plus the unchanged combined
memory gate before accepting snapshots. Then finish Agent-driven draft automation,
unique-point reconciliation, remaining A–D/corpus/holdout and researched symbol
gates. No push, merge, deployment, publication or production-complete claim.
