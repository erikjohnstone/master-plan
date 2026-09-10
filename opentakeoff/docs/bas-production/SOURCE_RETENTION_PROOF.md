# Original PDF retention — development checkpoint

2026-09-10, after `3eddc21f`. This implements a prerequisite of workflow E,
not the completed review/revision/release workflow or main goal. The five BAS
workflows still precede the appended symbol/installed-plan phase.

## Contract and boundaries

The governing pre-change contract is `REVIEW_REVISION_CONTRACT.md`, especially
source-by-hash storage, project isolation and transaction completion. This step
retains **one original PDF**, not an approval or a batch manifest. Partial progress
across separate user actions creates no approved status. A future snapshot/seal
must still atomically validate all dependencies and preserve the journal.

Shared-path decision: **yes** for source inventory, source ownership, conflicting
physical metadata, exact byte length and SHA-256 verification. Those live once
in `web/src/lib/basSourceRetention.ts`; no second extraction implementation exists.
**No** for browser lookup, IDB transactions, UI/focus and downloads. No MCP tool
or response changed in this checkpoint; the source-inclusive shared artifact
and its public MCP/browser transport remain required work, not implemented claims.

The inventory covers all historical physical documents referenced by saved
captures, not the reviewed current drawing set. Same-byte aliases deduplicate;
different bytes under one name remain different versions. Hash identity does not
prove page interpretation, requirement completeness or calculation correctness.
Existing workflow schemas, canonical evidence, source bboxes, Python arithmetic,
VectorGrid algorithms, thresholds, keys/scorers and default exports are unchanged.

`retainBasSource` freezes caller bytes/history before any await, verifies the
shared workflow/source, then compares its canonical value with persisted history
inside the write transaction. No annotation is overwritten. Content-addressed
records use project-scoped array keys in the existing version-3 meta store;
ordinary filename/revision deletion cannot remove them. Retry is idempotent;
conflicting stored bytes are refused, not silently overwritten. Success waits
for transaction completion. Read/download rehashes the stored bytes.

The UI is **Takeoff → Review & changes → Original PDFs**. One-at-a-time retention
avoids holding the entire corpus in memory. Lookup considers original aliases,
renamed loaded documents and available local revisions, but only matching bytes
can succeed. Back restores keyboard focus and existing finding filters. UI work
does not dismiss the queue's source-verification finding or create an approval.

Limitations are explicit: browser-local storage is not authenticated immutable
storage or a synced backup; legacy cloud-only mode has no such capability.
Download originals and keep the takeoff JSON separately. Automatic citation
reopening from retained originals, portable source-inclusive bundles, atomic
approved snapshots, cleanup with dependency warnings, revision pairing and final
all-corpus gates remain. Same-byte manual reopening is already supported by the
existing citation resolver. No old bbox is rebound to a newer namesake.

## Primary-source research

Rechecked 2026-09-10: [MDN IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
distinguishes request success from transaction completion. This motivates the
abort-after-request-success test and keeping hashes outside the transaction.
[MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
documents quota failures and eviction: this motivates explicit local-only copy,
external backup and no automatic deletion of prior evidence. These are engineering
constraints, not a claim that browser storage is permanent.

## Verified evidence

- Focused storage/shared/browser-lookup/composite checks: terminal **97188**,
  **40 pass / 0 failures / 0 skips**, 262.370792 ms; typecheck also passed.
  Includes controlled byte fixtures, not synthetic PDF interpretation claims.
  Covers historical versions and aliases, corrupt/foreign workflows, conflicting
  physical metadata, subarray hashing, caller mutation, same-name replacement,
  ordinary removal, project isolation, stale/concurrent saves, retry, wrong bytes,
  quota failure, abort after request success, changed browser context, failed reads
  and project-scoped local-first composite wiring. Existing storage tests retained.
- First full web check **56462 exit 0**, `evidence/source-retention-web-check-1.log`:
  **2,689 pass / 13 existing skips / 0 failures**, test phase 17,864.017125 ms;
  typecheck, lint (three existing warnings), benchmark and build pass; build 5.16 s.
  Final focus/layout follow-up checks and walkthrough are recorded below.
- First actual browser run **63362 exit 0**,
  `evidence/source-retention-browser-1/checks.json`, **56,641 ms**, zero page errors.
  Original Fort Sam PDF SHA-256
  `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`,
  **924,578 bytes / 9 pages**, ordinary saved engineering archive import. All
  **456 findings** exactly match the unchanged shared queue; existing source bbox,
  domain/filter/focus return and saved history checks still pass. Actual UI
  retain/verify/download/reload succeeds. Downloads before and after a separately
  labeled ordinary `removePdf` transport call have the exact original digest.
  The transport removal is not represented as an actual canvas Close-button test.
- Browser first open **4,620 ms**; first original retention **2,222 ms**. These are
  one-run observations under concurrent verification, not p95 or production-speed
  claims. Large-file/corpus latency, peak memory and optimization remain unverified.
  The test keeps original/recovered PDFs locally; they duplicate the corpus and
  are not additional independent source evidence.
- Final source-layout/focus browser **31204 exit 0**,
  `evidence/source-retention-browser-2/checks.json`: **60,676 ms**, zero page errors,
  first open **5,034 ms**, retention **2,149 ms**. It also asserts source-view
  heading focus, keyboard return to its trigger and unchanged finding filters.
  All six final Original PDFs screenshots were visually inspected (light/dark,
  1280×800, 1440×900, 1920×1080); controls and statuses remain visible without
  horizontal overflow. The initial right-aligned source header was corrected
  with a source-specific style before this final run.
- Final focused types/lint/build **65838 exit 0**, build **6.77 s**; three existing
  lint warnings remain. Build also reports mixed static/dynamic BAS imports and
  existing large chunks; no code-splitting or performance improvement is claimed.
- Full existing BAS MCP suite **76073 exit 0**, **93 pass / 0 skips / 0 failures**,
  **23,852.198792 ms**, `evidence/source-retention-bas-check-1.log`. This checks
  existing shared BAS/Python paths, not a new public MCP retention command.
- `node scripts/check-doc-links.mjs`: all 31 covered docs pass. `git diff --check`
  passes. Source retention proof references and evidence remain local development
  artifacts; no PDF/source data was sent to a new service.
- Final full web **67712 exit 0**, `evidence/source-retention-web-check-final.log`:
  **2,689 pass / 13 existing skips / 0 failures**, test phase **12,168.083084 ms**;
  types/lint/benchmark/build pass; build **5.11 s**. Existing One-Click cross gate:
  **16 probes, 0 disagreements, pair-IoU floor 0.994 / mean 0.999**, with nine
  single-gated-resolution cases not cross-checked. This is not the separate full
  schedule/quantity/graph corpus evaluation.

No holdout bodies or keys opened; no fresh whole extraction-corpus run is claimed.
Historical takeoff **505/541**, reference **99/129**, graph cells **78/91** and
anchors **133/138**, plus **23 old-path ENOENTs**, remain disclosed baseline issues.
No push, merge, deployment, costing or labor change.
