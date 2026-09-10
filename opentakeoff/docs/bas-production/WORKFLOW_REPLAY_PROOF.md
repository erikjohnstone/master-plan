# Complete saved-calculation replay checkpoint — 2026-09-10

After `f20c8e24`, workflow E now has a shared arithmetic audit of all saved
assignment, assembly and engineering results. This is a prerequisite for safe
restoration/approval, **not completed restoration or review/release**.

Shared-path decision: yes for historical input reconstruction, workflow/record
identity, equality validation and the Python calculators. No for file, HTTP,
subprocess and button delivery. Existing calculators, VectorGrid algorithms,
table/quantity/citation interpretation and old workflow revisions are unchanged.
The additive Python command delegates to existing functions without new math.
The default JSON import and default byte-only ZIP inspection are unchanged.

## What is implemented

`prepareBasWorkflowReplay` first validates retained evidence and history, then
reconstructs every B/C input from the **exact saved decision head and capture**.
It includes superseded historical results, not just current registers. Engineering
results replay their original declared inputs. Python compares the full typed
result, including unknowns, exclusions, messages and totals. Re-signed wrong
numbers that satisfy structural history validation still fail actual replay.

One shared Node service partitions the history into at most 1,000 records and
30 MiB per complete encoded subprocess envelope, under a 30-second service
deadline. The normal Python transport retains its 32 MiB input/output cap.
Cancellation, unsupported data, mismatches and runtime failure return no complete
receipt. An empty history explicitly reports `no_saved_calculations`; it is not
an audit of project calculation coverage. Receipts bind the exact workflow digest
and every checked record ID; `project_complete` remains false.

The browser **Original PDFs** workspace offers **Replay saved calculations**
after verifying a selected backup. It rechecks the archive/originals, calls the
shared HTTP/Python service, verifies the receipt and reports counts without
writing annotations. The browser request limit is 32 MiB; a configured local
Python service is required. Static environments without the service cannot claim
replay. MCP `import_takeoff` adds opt-in `replay_calculations: true` only alongside
`verify_evidence_bundle: true`. SDK cancellation propagates to the replay service.
No loaded plan is required for this read-only preflight.

## Reproduced checks

- Full web **4580 exit 0**: **2,697 passed / 13 existing skips / 0 failed**,
  types/lint/benchmark/build pass. Existing three lint warnings, chunk warnings
  and known One-Click benchmark limitations remain. Final cosmetic-only spacing
  types/lint/build **19330 exit 0**, build 5.31 s.
- Full BAS MCP **9977 exit 0**: **103 passed / 0 failed / 0 skipped**, 50.282 s,
  plus typecheck and **4 packaging tests**. The package copies unchanged
  VectorGrid dependencies byte-for-byte. Tool count remains 50/current.
  An initial empty-session test used `exportPayload` before loading a plan;
  that test setup was corrected to inspect the unmodified empty Session instead.
- Additional existing MCP tool/session/staging/safe-write/transition gates
  **1480 exit 0**: **155 passed**, 35.829 s, including real wire-level symbol,
  legend, schedule and count controls. These are not full-corpus scores.
- Full Python with packaged-runtime gate enabled **62302 exit 0**:
  **443 passed / 0 skipped**, 7.83 s; configured mypy passes **19 source files**.
  Earlier default Python run had 442 pass/one opt-in packaging skip. An initial
  *unconfigured* mypy command incorrectly traversed build copies and omitted the
  Pydantic plugin; it failed. The documented configured gate passes without
  editing existing calculation code.
- Controlled B assignment test replays two historical heads with expected AI
  subtotals **6 then 4**, rejects a re-signed 7 and preserves the workflow.
  Python tests separately reject wrong B/C/D results. Exact byte-boundary and
  1,001-record tests partition into **1,000 + 1**; actual Python checks every
  record ID. Transport-only padding and no-op engineering batches are controlled
  fixtures, not large-project interpretation evidence.
- Actual Fort Sam UI **53663 exit 0**, zero page errors: upload PDF, ordinary
  saved-history import, archive download, byte verification and actual Python
  replay of **3 assembly + 28 engineering** historical records. The existing
  history uses controlled explicit hardware declarations; it is not new automatic
  rating discovery. A valid archive with a re-signed wrong assembly quantity
  passes file checks but fails replay. Actual cancel, controlled pending HTTP,
  concurrent storage, corrupt bytes and unchanged saved state are checked.
  Final export **2.311 s**, whole UI replay **11.492 s**; observations from one
  local run, not p95 production guarantees. Six final light/dark screenshots at
  1280/1440/1920 and the refusal screenshot were visually inspected.
- Built public MCP **81379 exit 0** checks that same browser archive without a
  loaded plan, exact history/source parity after ordinary JSON import, exact
  shared output bytes, identical B/C/D replay receipt across UI/MCP archives,
  rejected re-signed wrong quantity and unchanged Session. Export **3.994 s**;
  inspection/replay plus receipt check **9.082 s**. Legitimate legacy UI fields
  mean whole archive IDs can differ; the BAS workflow/receipt match exactly.
- Documentation-link check: **31 files pass**, plus **13 relative targets** in
  the replay/engine-specific documents. No holdout bodies/keys accessed,
  no corpus scorer/threshold edits, no new full-corpus pass claimed.

Artifacts: [UI proof](evidence/workflow-replay-browser-2/proof.json),
[MCP proof](evidence/workflow-replay-mcp-1/proof.json),
[1280 light](evidence/workflow-replay-browser-2/backup-light-1280.png),
[1920 dark](evidence/workflow-replay-browser-2/backup-dark-1920.png),
[rejected calculation](evidence/workflow-replay-browser-2/replay-refused.png).
Reproduce with the commands in the two updated evidence-bundle walkthrough
scripts; use fresh output directories and the retained Fort Sam history.

## What this does not finish

Replay does not establish current source-set coverage, update old inputs, verify
an installed count, authenticate a reviewer or approve/restore anything. Next:
atomic restoration with retained originals and autosave concurrency protection;
original-version citation reopening; reviewed correspondence and revision journal;
scoped issue resolution/readiness and immutable-through-app approved snapshots.
The real positive approval/export/restore journey, remaining A–D corpus/holdout
gates and final research-gated symbol/installed-plan phase remain mandatory.

Historical corpus **505/541 takeoff, 99/129 reference, 78/91 grounded cells,
133/138 anchors** and 23 old-path errors are not superseded by these checks.
No merge, push, deployment, new model, pricing or labor work occurred.
