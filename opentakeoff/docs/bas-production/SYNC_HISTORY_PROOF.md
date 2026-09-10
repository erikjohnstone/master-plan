# BAS history preservation during local-first sync — 2026-09-10

This is a prerequisite within workflow E, not completion of synced ZIP restore,
reviewed drawing correspondence, scoped approval, or the original A–E goal.

## Reproduced loss and accepted change

At `7692b78b`, a three-way sync merge treated `bas_workflow` as an ordinary
last-writer-wins object. The controlled regression constructed a common capture
and independent local/remote captures using the actual shared capture function.
Expected: three retained captures. Before: **two**, reported as a clean merge.
The failing test is recorded in `tmp/bas-sync-history-before.log`; the test process
failed even though the shell command's subsequent `tail` returned exit 0.

Shared-path decision: **yes** for retaining BAS evidence/event history. The new
`retainBasWorkflowHistory` composes existing `mergeBasWorkflows` and preserves
the selected version's navigation, including an explicitly null selection.
It does not pick a winning review branch, recalculate quantities, or change
source identities. Existing schema/lineage rules still reject divergent chains.
`verifyBasWorkflow` precedes sync adoption/use. This verifies history integrity,
not Python arithmetic, evidence completeness, or an approval.

Browser-only sync delivery applies those shared rules to three-way, same-rev,
no-ancestor, regressed/rev-less, first-push, mount-seed and crashed-push recovery
paths. Known historical evidence cannot disappear merely because an older local
or remote snapshot omits it. Missing history is saved canonically before any
repush. The captured payload, generation and expected-current checks protect
against replacing it with different bytes during verification. A first push now
requires a successful remote read; local autosave still does not wait for network.
Known BAS pushes also wait for a successful read instead of overwriting blind.

An incompatible/invalid history stops that adoption/push. Local work remains;
the unmerged remote JSON is saved through the existing snapshot layer when
possible. A durable scoped notice records the remote digest and recovery-copy ID.
Repeated checks of the same remote reuse that copy. If the copy cannot be saved,
the notice says so; the failure does not authorize an overwrite. The ordinary
shape merge rules remain unchanged; matched-rev recovery retains local drawing
edits as well as BAS history rather than replacing them with remote drawing data.

## User journey

The existing canvas shows **BAS sync needs review** only for a current sync issue.
**Export remote recovery copy** downloads the exact saved remote JSON without
importing or approving it. The copy may be invalid, includes no original PDFs,
and must be treated as project-confidential data. **Check sync again** retries
the normal reconciler; it is not a force-overwrite button. A valid compatible
remote clears the notice. A conflicting review branch still needs explicit
decision recovery, not a fabricated linear history. Full branch-resolution UI
remains part of the main review/revision work.

## Verification and measurement

- Eleven new controlled persistence tests include missing/older snapshots,
  independent captures, first push with remote-only BAS, deleted remote file,
  bad fingerprints, unavailable backups/network, deduplicated recovery, seed,
  and same-rev crash recovery without losing local shape/project edits.
- The existing real Fort Sam history is **3,511,836 bytes**, with **3 assembly
  calculations and 28 engineering events**. A prefix merge retains it exactly;
  an independently valid but competing controlled engineering-review branch is
  refused. Some historical hardware inputs are explicitly controlled declarations.
  This is a persistence/lineage fixture, not new extraction ground truth.
- Focused final transport/merge/composite/generation gate: **85 pass**, 7.161 s
  (`26988`). Final full web check **78501 exit 0: 2,742 pass / 13 existing skips**,
  23.581 s tests / 5.29 s build. The preceding check (`71283`) also passed,
  at 17.686 s tests / 6.91 s build.
- The first parallel full suite passed 2,741 cases and failed the new five-second
  timing assertion under shared CPU load (8.060 s). This failure is not hidden.
  The **unchanged 5,000 ms budget** now runs as `bench:bas-sync`, serially after
  correctness tests and before existing benchmarks in `npm run check`. It checks
  three complete retained-history merges/verifications, each under that budget.
  Recorded times: **3,060.838 / 3,000.603 / 2,992.207 ms**. This is not a latency
  guarantee for larger histories, cloud reads, full restore, or Python replay.
  Final check repeated at **3,285.962 / 3,183.640 / 3,161.880 ms**, all passing.
- MCP typecheck, **119 BAS tests** (49.493 s) and **4 packaging tests** (107 ms)
  pass (`76745`). Actual existing Python replay paths are exercised; no Python
  arithmetic changed and the standalone full Python suite was not rerun.
- The full web check retains three existing lint warnings and existing chunk
  warnings. One-Click: 16 cross probes, zero disagreements, pair-IoU floor .994,
  mean .999; nine probes not cross-checked. These caveats are not a new corpus pass.

Actual browser proof script: `web/scripts/playwright-bas-sync-history.mjs`.
It uploads the real nine-page Fort Sam PDF, imports the retained history, then
reopens through the **actual FolderGate, folder composite and filesystem
providers**. Its directory is real browser origin-private storage in an isolated
Chrome context; no provider responses are mocked. The competing review event and
remote file versions are controlled test writes, **not a live Drive/365/OS-sync
service or a real drawing addendum**. Proof `sync-history-browser-2` (`49541`)
passed conflict preservation, exact recovery download, reload, explicit retry,
and unchanged original PDF SHA-256. Six screenshots cover light/dark at
1280/1440/1920, including keyboard focus and overflow checks; no page errors.
Visual review identified low-contrast secondary text in dark mode; it was changed
to the existing `--ink-soft` token. Final complete proof **56962 exit 0**,
`evidence/sync-history-browser-3`, passes again with no page errors. All six final
screenshots were visually inspected: readable text/focus, no clipped controls or
notice overflow. The first attempted proof failed because its dynamic import
referenced a second Vite store-module instance, not the installed composite;
the script now captures the actual app module URL after each navigation.

## Research and remaining guarantees

Official sources read on 2026-09-10:

- [MDN Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
  documents same-origin coordination between browser contexts, not locking
  between independent computers. The [request API](https://developer.mozilla.org/en-US/docs/Web/API/LockManager/request)
  allows cancellation of queued requests. A future restore coordinator must not
  steal an in-flight lease or nest requests into a deadlock.
- [MDN writable file streams](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable)
  documents publication on close and different writer modes. This protects a
  file write from partial exposure; it does **not** make the application's prior
  revision read and later write an atomic compare-and-swap across devices.
- [MDN origin-private storage](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
  describes browser-origin-private file storage. It is suitable for the isolated
  transport walkthrough but is not evidence of a live cloud integration.

The actual Drive/folder provider code uses **read-then-write app revision checks**,
not a server-enforced ETag/CAS transaction. Earlier assumptions that those checks
provided atomic remote exclusion were incorrect. This batch preserves histories
the coordinator actually reads; it cannot promise protection from an unseen
concurrent remote writer. It also does not make the existing multi-key sync
bookkeeping atomic with browser restore. **Synced ZIP restoration stays gated
until in-flight writes, cross-tab coordination, adoption metadata and crash
recovery are implemented and tested.** Original-PDF retention remains local.

Next: finish that sync coordination and journal recovery UX, then source/drawing
correspondence and approved scoped snapshots; complete remaining A–D corpus and
untouched-holdout gates. The researched symbol deformation/installed-plan phase
stays appended **after** the five workflows. No model, VectorGrid, symbol matcher,
table/citation/bbox, key/scorer, cost/labor, push, merge or deployment change.
