# Annotation save fencing — 2026-09-10

Workflow E prerequisite after `4b1c7595`, not completed archive restoration.
The original five BAS workflows remain first; appended symbol/installed-plan
research stays last. No extraction, VectorGrid, rules, quantities, source boxes,
Python calculators, holdout keys or installed-count assertions changed.

## Research and design

[MDN IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)
documents transaction ordering, request-callback activity, rollback and the limits
of completion/durability. [Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
documents version changes and conflicting older connections. Rechecked 2026-09-10.
Our design inference is a single-transaction version check before saving, plus a
database version increase to exclude older code that ignores the check. This is
not an authenticated journal, permanent storage guarantee or cloud transaction.

Shared-path gate: **no** for editor tokens, IndexedDB, sync delivery and recovery
chrome; these are browser storage mechanics. **Yes**, still unchanged, for BAS
source ownership, replay, quantity and future restore-merge semantics. No UI-only
interpretation or alternative calculator was introduced.

The per-project generation uses a separate array key in `meta`; no saved JSON
field is added. Reads return the exact payload plus a non-enumerable token. The
canvas captures that token with a debounced/unmount save. A different persisted
generation rejects the transaction, and a fresh unrelated read cannot authorize
the older editor. Sync adoption also uses an expected-payload check, with remote
responses bound to their request-start generation. Stale callbacks/readbacks do
not upgrade the editor. Conflict recovery preserves unsaved work and provides
explicit export/reload. The v3→v4 upgrade preserves records and makes v3 opens
fail; existing versionchange/blocked handling remains in place.

## Verified checks

- 14 dedicated tests: legacy wire parity; non-enumerable tokens; v3 migration and
  old-build refusal; queued/untokened/unmount-style saves; fresh and successive
  generations; project scope; corrupt metadata; expected-state CAS; input ownership;
  transaction abort/retry; sync token forwarding/no stale push; delayed seed;
  busy-deferred remote adoption; replacement during backup; fresh callback token.
- These plus existing store, sync and BAS source-retention tests: **83 pass**.
- Full web check **69931 exit 0**: **2,717 pass, 13 existing skips, zero failures**,
  2,730 total; tests 15.738 s. Types/lint, existing One-Click bench and build pass.
  Final canvas-only callback guards receive an additional types/lint/build and
  real-browser pass (**54485**, build 6.69 s; **83833** browser). Existing
  lint/chunk/bench caveats remain.
- MCP **59064 exit 0**: types, **107 BAS tests pass** (51.704 s), **4 packaging
  tests pass**. Actual Python services remain exercised by these tests; the full
  unchanged Python suite was not rerun in this checkpoint. MCP remains 0.9.73,
  50 tools; no public MCP behavior change.

Real Fort Sam source SHA-256:
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Saved engineering history is the existing `engineering-families-browser-3` fixture
(real drawing evidence, controlled declared hardware; not inferred ratings).
The actual browser imports both normally, opens two editors, holds the actual
debounced save, applies a **controlled atomic IDB replacement**, then resumes the
save. Both older editors refuse; editor data remains exportable; explicit reload
permits fresh saves. Complete BAS history and original PDF hash stay unchanged.
Six 1280/1440/1920 light/dark screenshots check readable recovery actions and
keyboard focus. There are zero page errors in the passing run.

Proof script:

```sh
OT_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node --import tsx scripts/playwright-annotation-generation.mjs \
  '<Fort Sam PDF>' \
  '../docs/bas-production/evidence/engineering-families-browser-3/ip-reviewed.takeoff.json' \
  '<new output directory>'
```

Run from `web/`; `OT_UI_URL` defaults to `http://127.0.0.1:5177`. Evidence is in
`evidence/annotation-generation-browser-5`. Initial run passed; the second run
stopped on a test locator that became ambiguous when the reload button was added.
It was corrected to select the explicit export action, without weakening the
focus assertion; subsequent run passed. Recovery chrome was moved below the
drawing so it does not obscure the page navigation.
Final screenshots disable CSS animations/transitions during capture; an earlier
dark-theme screenshot caught button colors mid-transition. No theme behavior or
contrast token was changed to alter the proof.

## Not yet implemented by this checkpoint

No production operation yet mints a non-null generation. The controlled database
replacement is a fault/race test, **not ZIP restore**, source staging, replay,
revision pairing, approval or a new corpus-accuracy result. Ordinary JSON/OTK
imports are unchanged. The legacy cloud-only adapter is unchanged; local-first
sync forwards the guard but is not an atomic cloud restore protocol.

Next: shared restore preview/merge with explicit legacy correspondence safety;
actual complete merged-history Python replay; required-original staging; one
atomic source/payload/previous-state journal/generation commit; successful caller
hydrate; in-flight sync/push coordination; equivalent MCP integration; actual
ZIP-to-original-citation walkthroughs. Then remaining revision/review/approval,
A–D corpus/holdout gates, and the appended symbol phase. No push/merge/deploy.
