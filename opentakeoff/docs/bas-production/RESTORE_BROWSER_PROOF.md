# Browser-local evidence restoration — 2026-09-10

This is a completed browser-local restore slice of workflow E, not completion of
E, A–D corpus acceptance, or the appended symbol/installed-plan phase. No approval,
current-dependency repair, installed quantity, engineering certification or sync
guarantee is created. No extraction, VectorGrid, symbol, legend or Python
calculation algorithm was changed.

## Implemented journey

**Verify evidence bundle → Preview restore → Restore reviewed merge** uses the
existing operator-preserving import merge. Shared `basRestore.ts` owns exact
before/after payloads, original inventory, filename-bound annotation gates and
complete merged-history replay. UI and future MCP delivery must consume this same
plan. A private preview handle cannot be fabricated from an archive receipt.
Production UI invokes the actual shared Python HTTP service; a user checkbox or
archive-supplied receipt cannot substitute for it.

The browser stages operation-owned 8 MiB chunks, then atomically publishes every
required original, merged annotations, previous-state journal and new editor
generation. The final transaction rechecks persisted payload/generation, staged
digests, existing retained originals and any annotation-bound active PDFs. Sources
already retained are compared, not overwritten. Old single-buffer source records
remain readable; new chunk records preserve identical bytes. Old originals stay
out of the active drawing set. Successful hydration adopts only the committed
generation and suppresses its autosave echo; obsolete editors retain their work
and fail their guarded saves.

Legacy first-page IDs use a bare filename; later pages use `filename#page`.
Changed annotation-bearing branches need one unambiguous archived original and
its exact bytes already loaded under that name. Ambiguous versions, foreign
references, out-of-range pages and newly imported prefix correction rules refuse
without silently dropping data. Existing unrelated operator annotations remain
unchanged. View tabs are not annotation evidence; CSS colors are not page IDs.
Ordinary JSON/OTK import behavior is unchanged.

The empty plan picker now has **Restore BAS evidence backup**. Recovery therefore
does not require loading archived PDFs into current extraction merely to reach
Takeoff. Restored originals reopen in the existing isolated reader.

## Evidence

- `web/test/basRestore.test.ts`: **13 new tests**, including exact merge/replay,
  foreign handles/receipts, cancellation, quota rollback, stale previews/saves,
  idempotent retry, project scoping, corrupt staged/retained bytes, annotation
  version mismatch, old storage and multi-chunk retention/reopening.
- Full web check: **2,730 pass / 13 existing skips / zero failures**, 2,743 total,
  14.399 s tests, build 5.35 s in the final retry-audit run. Types/lint/benchmark/build pass. Three existing lint
  warnings and chunk-size warnings remain. One-Click cross-resolution gate:
  16 probes, zero disagreements, pair IoU floor .994 / mean .999; nine probes
  not cross-checked. Log: `tmp/bas-restore-shipping-web-check.log`. Focused restore,
  source-retention and generation gates: **40 pass**, 1.172 s. An idempotent retry
  rechecks retained bytes; a previous success journal cannot hide later corruption.
- MCP types, **107 BAS tests** (42.203 s) and **4 packaging tests** pass after the
  chunked storage change. Actual unchanged Python services were exercised; the
  complete standalone Python suite was not rerun. MCP remains 0.9.73 / 50 tools.
  Logs: `tmp/bas-restore-chunks-mcp-check.log` and final four-test packaging rerun
  `tmp/bas-restore-shipping-packaging.log`. This is regression verification,
  not a claim that public MCP restoration is implemented.
- Actual browser `playwright-bas-restore.mjs`,
  [proof](evidence/restore-browser-6/proof.json): real Fort Sam source
  `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`,
  924,578 bytes / nine pages. UI export, empty-project inspection/preview/discard,
  controlled delayed-request cancellation through the actual UI, real HTTP/Python
  replay of **3 assembly + 28 engineering historical calculations**, atomic
  restore, original source view and reload all pass. Restore took **12.925 s**;
  no page errors, exact history/bytes retained, zero active counting sheets.
  The PDF is real; some saved hardware inputs are controlled operator declarations,
  not automatically inferred ratings. Six light/dark desktop screenshots, preview
  and original-reader screenshot accompany the proof.
- [Capacity proof](evidence/restore-capacity-5/proof.json): the existing controlled
  four-source **551,119,404-byte** fixture, actual Python empty-history replay and
  IDB restore. Restore **10.953 s**, retained verification **0.960 s**, all four
  originals/journal references and zero active sheets. Sampled summed Chrome RSS
  **2,052,210,688 bytes** meets the pre-existing 30 s / 2 GiB limits, but leaves
  limited memory headroom. Sampling is 100 ms, not an exact instantaneous peak;
  this is not a loaded 30-document canvas or PDF-accuracy proof.

## Failures found, not hidden

The first capacity run exposed Chromium's individual serialized record limit:
165,590,452 bytes exceeded 133,169,152 bytes. The transaction rejected without
publishing sources/state. Chunked storage fixes that failure; the budget was not
weakened. Initial UI runs exposed missing empty-project recovery access and the
numeric-color/page-reference collision; both were fixed. Other interrupted runs
were test navigation or development-server dependency/HMR reloads and are not
counted as passes. Capacity tests now import the app's actual module URL, since
private handles must not cross separately instantiated HMR modules.

Installing the pinned hash dependency disturbed local optional binary installs.
The missing esbuild, Rollup and canvas binaries were repaired; no unrelated lock
version changes or platform metadata removal was retained. An earlier web run
passed tests but failed its build and is not called a full pass.

## Research and limits

[MDN IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
documents task-bound transaction activity, rollback and completion/durability
limits. Hashing/network/Python awaits stay outside the final transaction;
incremental synchronous hashing is interleaved with bounded chunk requests inside
it. This transaction design is our engineering inference, not a browser promise
of permanent storage or authenticated history.

[Noble Hashes](https://github.com/paulmillr/noble-hashes) supplies the maintained,
MIT-licensed SHA implementation. Web dependency **2.0.1** is pinned and loaded only
inside browser restore delivery. Packaged MCP imports must not acquire a top-level
dependency on this unused IDB transport. WebCrypto still verifies delivered bytes;
neither hash implementation changes PDF interpretation.

Unfinished: public MCP restoration, safe sync push/adoption coordination, reviewed
revision correspondence and selective approval/sealed snapshots; remaining A–D
corpus/holdout acceptance; the final researched symbol phase. Legacy ambiguous
correspondence is not resolved by this slice. No new full-corpus/holdout claim.
Originals and journals remain local, unsigned and evictable. A process crash can
leave private unpublished staging chunks; automatic cross-operation cleanup is
deliberately absent pending an explicit safe recovery flow. The journal currently
has a storage reader but not a complete user-facing rollback/history workspace.
No merge, push, deployment or publication was performed.
