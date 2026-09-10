# Restoration and complete saved-calculation replay — 2026-09-10

Pre-change contract, extending workflow E, not a new completion target. The
unapproved ZIP already checks container/source/history integrity. Ordinary JSON
import intentionally retains its old semantics. Neither proves all saved math:
assignment/assembly browser validators check source and selection parity;
engineering has an actual Python replay service but only for that domain.

Before restoration can claim verified calculations, reconstruct every historical
assignment and assembly input from its exact retained capture and decision head,
and replay every engineering result against its retained declared inputs. Use
the existing Python calculators unchanged. Compare complete typed results,
including unknowns, exclusions, messages and totals—not just summary numbers.
Do not substitute active registers for old heads or skip withdrawn/superseded
records. Validate ownership/fingerprints before requesting arithmetic replay.

Shared-path gate: **yes** for replay-plan construction, receipt identity and
source/result validation; actual arithmetic stays in the one Python engine.
**No** for HTTP/process/file/IDB transactions and browser navigation. Add a bounded
batch replay command; do not change any calculation algorithm or old command.
Receipt names the exact workflow digest and all checked record IDs/counts. No
receipt is a persistent approval, current-dependency repair, complete-discovery
claim, verified installed quantity or authentication. Empty history must explicitly
report no saved calculations, not silently imply a complete calculation audit.

Each subprocess batch is limited to 1,000 records / 30 MiB encoded bytes under
one 30-second end-to-end service deadline; cancellation aborts owned processes.
No partial success receipt. Unknown revisions/rules, mismatched arithmetic,
oversized records, missing runtime, timeout and stale caller state fail closed.
The normal browser-safe history verifier remains useful without Python; it must
not be relabeled arithmetic verification. Existing JSON and backup-only preflight
behavior remain unchanged. Restoration and approval will require the new replay
gate, not a checkbox that can bypass it.

Subsequent restoration journey: inspect the exact bundle, preview the existing
takeoff merge without mutating state, replay the resulting history, stage every
required original, then explicitly commit retained sources and merged saved state
atomically against the expected current workspace. No filename-based replacement
of originals. Reopen citations by source hash at their original page/frame. Preserve
legacy unknown-file disclosure; ambiguous filename-bound annotation provenance is
not repaired by guessing. Failed/cancelled/stale operations preserve previous
data. Approved-snapshot restoration additionally follows the seal/journal rules
in `REVIEW_REVISION_CONTRACT.md`; an unapproved backup never creates a seal.

Tests: positive B/C/D historical replay through actual Python; recomputed-fingerprint
forgeries that pass structural validation but have wrong numbers; missing or
altered per-record results; old/current heads, duplicates, empty histories,
unsupported/mixed envelopes; byte/count limits; cancellation/runtime failure;
UI/MCP parity and untouched source/history. Real retained Fort Sam history must
replay without rewriting it. Restore tests must cover actual source reopening,
existing-state preservation, same-name different originals, project scope,
quota/abort and concurrent saves before E can be considered complete.

Primary storage research: [MDN IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
documents task-bound transaction activity, abort rollback and completion/durability
limits. [Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
supports keeping hashing/network/Python awaits outside the final database
transaction. The staging and expected-state design above is our inference;
browser transaction completion is not authenticated or guaranteed permanent storage.

## Next restoration hazards traced in the existing code

`web/src/lib/store.js` currently persists ordinary annotation payloads with a
blind put. `TakeoffCanvas.jsx` captures a payload before its 700 ms autosave timer
and can also flush on unmount. A final restore transaction's expected-state check
alone does not prevent an older queued save from subsequently replacing it.
Closing that race requires a per-editor expected generation/journal contract,
including project switching and other-tab writers—not just a mutable adapter-wide
"last read" token. Source staging must remain unpublished until the complete
merged workflow and required originals pass validation/replay and the final
transaction commits. Failed/quota/cancelled restores must preserve old sources.

Ordinary JSON and `.otk` import are not an atomic source-inclusive restore and
must not be relabeled as one. Citation navigation currently resolves loaded
documents; restore must add exact retained-source reopening without binding an
old bbox to a newer same-named file. These hazards remain open, not implemented
by the replay checkpoint. Primary MDN transaction/quota documentation was checked
again on 2026-09-10; staged verification and write fencing are design inferences,
not browser durability or authentication guarantees.

Update after `628f047c`: isolated exact-source reopening is implemented in UI
and MCP; see `SOURCE_VIEW_PROOF.md`. Existing live-sheet citations remain intact.
No historical original enters the active drawing set merely for inspection.
Atomic archive restoration and the blind/queued-save hazards above remain open.
