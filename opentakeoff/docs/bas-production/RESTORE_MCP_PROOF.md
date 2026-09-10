# MCP source-inclusive restore — acceptance and evidence

Pre-change contract, 2026-09-10. This completes another delivery surface of
workflow E; it does not complete revisions, approval, sync, or the five workflows.

Shared-path gate: **yes** for merge, source ownership, legacy drawing binding,
and complete calculation replay. Reuse `basRestore.ts` and the Python replay
service without alternate math or weakened checks. **No** for local file delivery,
MCP preview handles, and Session hydration. Preserve every merged payload field,
including browser-only cargo that ordinary MCP exports do not represent.

Public journey: `import_takeoff` previews a ZIP against the current Session, then
an explicit commit of that preview reopens the same bundle, replays the full
merged history and retains every required original in a new operation-owned
directory under an explicit existing parent. No loaded plan is required for
history-only restoration. Legacy filename-bound geometry requires the exact
original already active under that name; old evidence never becomes active
counting input merely because it was restored. Ordinary JSON import and read-only
ZIP verification retain their existing contracts.

Write all owned files with exclusive creation and flush them before publication.
A final synchronous commit-marker link and synchronous Session adoption occur
after the last exact-state guard, with no intervening asynchronous operation.
The archive, merged JSON, previous state, replay receipt and original PDFs remain
on disk for recovery. Do not claim an operating-system/filesystem plus memory
distributed transaction, authenticated identity, power-loss permanence, or
approval. A process crash before the marker can leave an incomplete owned
directory; consumers must not interpret it as a completed operation. Never
overwrite a caller's existing file or recursively delete a user directory.

Acceptance: actual public preview/commit and re-export; exact shared merge
parity; loaded and empty sessions; source reopen by saved page ID; complete
historical Python replay; ordinary import regression; browser-only cargo; wrong
namesake/ambiguous source refusal; cancellation, missing source, changed bundle,
concurrent Session edits/load, filesystem failure and retry; journal and restored
source corruption detection. Packaged MCP must run the real retained PDF history,
not a mock response. Measured evidence is appended only after execution.

Primary research: [Node file-system documentation](https://nodejs.org/api/fs.html)
describes asynchronous ordering, exclusive creation/link operations, rename's
overwrite behavior and OS/device-specific flush guarantees. The private-directory
and commit-marker protocol above is our design inference, not a Node-provided
transaction or durability guarantee.

## Implemented and verified

MCP 0.9.74, still 50 tools. `restore_evidence_bundle` is an additive alternative
on `import_takeoff`; it does not alter ordinary JSON import or read-only ZIP
verification. Shared `basRestore.ts` owns the merge/preview/replay plan. Node owns
file delivery and Session hydration. Preview additionally checks that present
drawing fields can round-trip through MCP's existing field validators; malformed
cargo is refused before writing, never stripped. History-only backups can omit
native drawing fields. Previously loaded, unrestored exports retain their exact
existing shape, covered by conformance/Session tests.

Session owns exact browser cargo plus a native baseline. Later native edits
overlay that baseline without discarding unrelated fields. Existing correction
rule history also survives later updates. Ordinary `load_plan` still replaces
the Session; `merge:true` can add active plans to restored history without erasing
it. The restore guard covers native state, rules, withheld records, undo history,
pending mutations and a load/restore lifecycle version. It catches identical
reloads as well as ordinary/in-place edits. Repeated guards compare native state
directly rather than repeatedly cloning the whole historical payload.

Exclusive-created, flushed files land in a generated operation directory under
the caller's existing parent. `COMMITTED.json` is published by a synchronous,
no-overwrite hard link immediately before synchronous Session adoption. On
failure, cleanup targets only files this operation created, never a recursive
user directory. Retried committed operations recheck exact payload, prior state,
receipt, marker, every PDF and the recovery ZIP; a remembered journal is not
proof of intact storage. Previous undo data is retained, but restore begins a new
live undo boundary; no claim of completed rollback UI.

Final built-server proof: `evidence/restore-mcp-3/proof.json`, process **15192,
exit 0**. Input was the actual browser-exported Fort Sam archive from
`restore-browser-6`, not an injected MCP response. The public preview/commit/
export/source-view tools preserve every merged field, replay **3 assembly + 28
engineering** historical records through Python and retain the exact page-8
SOO citation/frame. No historical source enters the active drawing set. A second
restore into the populated Session passes. After terminating the process, a new
server restores its disk-produced ZIP and opens the same citation without the
original input path or an active PDF. The rendered citation was visually reviewed;
its PNG hash matches the earlier inspected proof image exactly.

| Final real-PDF operation | Preview | Commit | Total including export assertion |
| --- | ---: | ---: | ---: |
| Empty Session | 8.808 s | 15.205 s | 24.163 s |
| Populated Session | 10.546 s | 19.727 s | 30.421 s |
| New process, disk recovery | 8.758 s | 15.090 s | 23.999 s |

The first proof ran concurrently with heavy suites and took **65.446 s** for
preview/commit/export together; it passed correctness but is not hidden or used
as a quiet performance baseline. Proof 2 repeated quietly at 23.829 / 30.341 /
23.819 s. These are observations on one retained real history, not p95 guarantees
or evidence of large-corpus installed-count accuracy. Some hardware inputs in
that history are explicitly controlled operator declarations.

Final BAS suite **68306 exit 0: 119 pass**, including **12 new MCP restore tests**,
43.463 s. Broader Session/conformance/restore run **19396 exit 0: 51 pass**,
45.967 s; these overlap and must not be summed as unique tests. Typecheck and
**4 packaging tests** pass. Tool count check reports 50 names, zero stale markers.
Tests cover missing originals, wrong active namesakes, malformed cargo, altered
archives, foreign handles, stale/in-flight/identical loads, cancellation before
and during staging, existing-state preservation, retained corruption, source
reopening, actual Python rejection of re-signed wrong arithmetic, and later edits.
No standalone full Python suite or new full-corpus/holdout accuracy gate was run
in this delivery batch; existing Python services were exercised directly.

## Sync audit correction and remaining work

The earlier browser checkpoint incorrectly generalized that every synced
composite lacked restore. Drive's explicit composite did not expose it, but
folder/Microsoft 365's workspace composite inherited the local method by spread.
That accidental entry point is now removed until coordinator-aware restoration
is implemented; local restore and source retention remain available. The targeted
sync/composite/local-restore suite passes **51 tests** (15417, 1.297 s). This is a
safety gate, not completed synced restoration, and the main goal is not shortened.

Final full web **19830 exit 0: 2,731 pass / 13 existing skips / zero failures**,
19.792 s tests, typecheck/lint/benchmark/build pass (5.19 s build). Three existing
lint warnings and bundle-size warnings remain. One-Click cross probes retain
zero disagreements on 16 probes, pair-IoU floor 0.994/mean 0.999; nine remain
uncross-checked. These regression results are not a new corpus accuracy score.

Next: coordinate in-flight sync pushes, deferred adoption and post-adopt metadata
before exposing synced restore; finish user-facing journal recovery, reviewed
drawing correspondence, scoped approvals and the remaining A–D corpus/holdout
acceptance. The researched symbol/installed-plan phase remains appended last.
No VectorGrid/table/symbol algorithm, threshold, key, bbox, quantity arithmetic,
costing or labor change. No push, merge, deployment or publication.
