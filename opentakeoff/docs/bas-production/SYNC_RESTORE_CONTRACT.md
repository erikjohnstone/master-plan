# Browser sync / evidence-restore coordination

Pre-implementation contract, 2026-09-10, baseline `4119b0db`.

## Shared-path decision

History retention, restore merge, original identity and Python replay stay on
their existing shared UI/MCP path. This change coordinates browser IDB and
transport delivery only; it must not change extraction, quantities or approvals.

## Supported journey and guarantees

Local and local-first synced projects use one exclusive Web Lock per canonical
IDB annotation scope (anonymous workspace or exact Drive project), not per
transport folder. Recovery, seed, pull/adopt, push/ack and ZIP restore participate.
Normal local saves never await the network; existing generation and payload CAS
protect an adoption from intervening ordinary edits. Restore acquires the lock,
then rechecks its existing preview/replay/original/CAS requirements.

Adoption payload and sync ancestor/revision commit in one IDB transaction.
Confirmed push bookkeeping commits under the generation that was actually sent.
The restore generation is durable pending-sync intent: a generation not yet
acknowledged by this transport cannot be seeded over or certified by an older
push-recovery marker. After restart it retries, preserving known BAS history.
When pending restore has no usable ancestor, reuse the shared operator-preserving
import merge and preserve the exact remote in a recovery snapshot before adoption;
do not silently fall back to remote-wins over the restored operator state.

Successful restore means locally committed, not remotely backed up or approved.
Original PDFs remain in the browser's verified vault; annotation sync does not
upload those originals. An unavailable provider leaves local recovery usable.
Cancel while queued or before commit changes no canonical state. Retrying the
same already-committed operation retains existing restore idempotence.

## Boundaries from primary-source research

[Web Locks](https://w3c.github.io/web-locks/) coordinate cooperating contexts in
one storage bucket. The callback's promise owns the lease; cancellation only
removes a queued request, so restore must also check its signal during work.
Never steal a lock or use an expiring lease that lets an earlier writer continue.
Termination releases locks: it cannot recall a network request already sent.
No claim of distributed locking, authentication or transactional cloud writes.
Existing providers still use read-then-write revisions, not server CAS.
Browsers without Web Locks cannot safely perform this coordinated workflow.
IDB writer version advances to fence older builds that do not honor the lease.

## Acceptance before implementation

- Controlled held push, adoption, recovery and queued restore; same scope across
  instances versus independent projects; cancellation/retry without deadlocks.
- Metadata transaction abort rolls back every associated field and adoption.
  Old-generation completion cannot acknowledge a newer restore.
- Restore pending intent survives construction/reload/offline; remote history
  is preserved or explicitly blocked, never silently lost. Existing scalar and
  geometry sync tests remain green outside pending restore.
- Actual browser folder-composite journey with real Fort Sam PDF, real backup,
  actual Python replay, restore, local/transport persistence and exact source
  inspection. Controlled OPFS transport is not a live cloud/addendum claim.
- Existing local restore, sync, web checks and MCP BAS/packaging gates pass.
  No corpus/holdout interpretation changes in this delivery batch.
- Existing large restore budget remains 30 s / 2 GiB sampled browser RSS;
  do not loosen it. Lock coordination tests use explicit handshakes, not sleeps.
  A queued restore may wait for network completion; expose cancellation rather
  than claiming bounded provider latency. Real history benchmark stays 5 s.

This is a delivery prerequisite of workflow E, not completion of revisions,
scoped approvals, A–D corpus acceptance or the final symbol phase.

## Implemented and verified

The coordinated entry point is exposed by both local-first composites, including
Drive's project-scoped journal/source methods. A closed coordinator cannot queue
new sends of a later local workspace. In-flight work keeps the lease through its
checkpoint; no nested locking is used inside reconciliation. No provider or
VectorGrid/Python algorithm, shared import rule, source schema or bbox changed.

`web/test/basSyncRestore.test.ts` adds 11 controlled cases; the v4-to-v5 retained
journal/ancestor migration adds one more. Final focused run **92818 exit 0**:
**94 pass**, 7.233 s. Final `web/npm run check` **95921 exit 0**: **2,754 pass /
13 existing skips / 0 failures**, 18.755 s tests, 5.26 s build. The three existing
lint warnings and build chunk warnings remain. Real retained-history benchmark
**3.073 / 2.986 / 2.951 s**, below the unchanged 5 s budget. One-Click reports
16 cross probes, zero disagreements, pair-IoU floor .994 / mean .999; nine probes
are not cross-checked. This is not a new full-corpus accuracy evaluation.

MCP typecheck and **119 BAS tests pass**, 47.749 s, using the unchanged actual
Python service paths. A mistakenly named packaging command failed to find its
test file; the corrected `test/vectorGridPackaging.test.mjs` gives **3 pass**,
82 ms. No MCP protocol or version change. Full standalone Python and corpus/
blind holdout suites were not rerun in this browser-delivery batch.

Initial focused run: **80 pass / 2 fail**. Both failures were older tests requiring
remote seeding of a newly restored generation. They now assert reconciliation or
preservation instead, with the token and no-write assertions retained. An initial
typecheck caught the previously missing restore `signal` option annotation;
corrected in the production JSDoc. Neither failure is reported as a green run.

### Actual browser proof

Final **79651 exit 0**, [proof JSON](evidence/sync-restore-browser-2/proof.json).
The existing actual-UI Fort Sam backup is restored through the real folder gate,
composite, IDB and OPFS annotation-file provider. The second real browser tab holds
the same canonical lease: restore waits after actual Python replay, visible Cancel
leaves state unchanged, and retry commits after release. All **3 assembly + 28
engineering** calculation records replay, exact original bytes remain available,
the prior-state journal is intact, and the annotation file confirms the restored
generation. Original reader and reload succeed. No page errors.

- Source SHA-256: `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
- Backup SHA-256: `1b2c6729d4622ddd85f3ff1bdd53487dec0048a2a2ecdc80d0ce65bb0f2c5e75`.
- Final local restore including Python replay and controlled lock wait: **24.682 s**;
  through annotation-sync confirmation: **27.076 s**. First run: 25.251 / 27.827 s.
- Six final light/dark 1280/1440/1920 screenshots, waiting state and original reader
  visually inspected. An initial static “pending” notice conflicted with later
  confirmed status; corrected to direct the user to the live status below.
- Some historical engineering inputs are disclosed controlled declarations. OPFS
  and the held lease are controlled fixtures, not live Drive/365/OS sync or a real
  drawing addendum. The proof opens the original page, not a new citation-accuracy
  or whole-project completeness claim.

Reproduce from `web/` with `OT_BROWSER_PATH` set to Chrome, then:

```sh
node scripts/playwright-bas-sync-restore.mjs ../docs/bas-production/evidence/restore-browser-6/real-pdf-backup.otbas.zip ../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json /new/proof/directory
```

### Capacity and quota boundary — do not omit failed runs

The unchanged **551,119,404-byte / four-source** fixture failed twice in private
contexts with `QuotaExceededError` (**72067**, **22473**, exit 1). Instrumented
[failure/rollback proof](evidence/sync-restore-capacity-2/proof.json) confirms empty
annotations, no journal, zero published originals and unchanged estimated usage.
It also sampled **2,208,399,360 bytes RSS**, above the 2 GiB limit. This is a failed
capacity run, not a passing performance result.

This host has **8 GiB RAM**. Chromium's [incognito quota implementation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/storage/browser/quota/quota_settings.cc)
uses a randomized RAM-based pool, divided among storage keys; this is consistent
with variability near this fixture size. An advertised storage estimate is not
an assurance every allocation will succeed. Do not infer the precise internal
limit from that estimate, or attribute the failure solely to low disk space.

An explicitly separate **ordinary isolated persistent profile** passes the same
fixture with unchanged limits: **90411 exit 0**, [capacity proof](evidence/sync-restore-capacity-persistent-1/proof.json),
Chrome **152.0.7977.83**, restore **10.249 s**, verify **1.106 s**, sampled summed
Chrome RSS **2,109,784,064 bytes < 2,147,483,648**. Headroom is narrow. All four
originals verify and no active counting sheet is added. The temporary profile is
retained at the path recorded in the proof; it contains only controlled test data.

The test harness now records failures/rollback and offers
`OT_CAPACITY_PERSISTENT=1`; it does not alter quotas, fixture sizes, memory limits
or production storage. Profile modes differ, so these timings are not a measured
before/after improvement. Controlled repeated-byte arrays test transport/memory,
not PDF parsing, realistic compression or corpus accuracy. Sampling at 100 ms
does not establish an exact instantaneous peak. Private-context 551 MB capacity
is **not freshly verified**; browser quotas can refuse any large restoration.

### Remaining main-goal work

Continue readable journal recovery controls, reviewed drawing correspondence,
dependency-aware scoped approvals/snapshots and the end-to-end revision/release
journey; then A–D corpus/holdout acceptance and the appended researched symbol /
installed-plan phase. No merge, push, deployment, corpus-key change or claim that
workflow E/the overall goal is production complete.
