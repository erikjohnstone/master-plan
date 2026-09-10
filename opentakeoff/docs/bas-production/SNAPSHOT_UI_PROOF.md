# Public snapshot workflow — in development

2026-09-10, after `60a77a42`. Workflow E remains incomplete. The prior goal
turn was a status-only response (no implementation progress); the clean local
checkpoint was revalidated before this increment. No push, merge or deployment.

## Research and pre-change acceptance

[Autodesk's approval-workflow documentation](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html)
separates drafts from finalized workflows and preserves old reviews when the
workflow definition changes. This is documentation research, not hands-on use.
Our design inference is to distinguish readiness, explicit approval, and a
verified historical record; this does not import Autodesk's authentication or
cloud guarantees. Existing `SNAPSHOT_CONTRACT.md` remains the authority for
integrity, full archive preflight and the unchanged performance limits.

SHOULD THIS BE ON THE SHARED PATH? The new screen, operation lifetime, browser
endpoint calls and downloads are surface-specific. The existing shared scope,
readiness, snapshot/ZIP and Python verifiers remain the only authority. No new
extraction, quantity calculation, rule, bbox, schema or VectorGrid logic.

Required browser journey for this increment: saved real workflow and exact
original → select reviewed scope → check readiness → inspect included claims,
exclusions/findings/coverage and original citation → explicit reviewer/reason/
confirmation → atomic save → reload → fresh historical reopen → export/import.
The retained evidence is real; added applicability and reviewer declarations in
the proof are controlled test inputs, not independent ground truth or a real
estimator approval. Full automatic Agent-to-takeoff acceptance remains separate.

Require dirty/busy workspace refusal, generation/payload mismatch, mutation and
forged preview refusal, blocked scope, wrong bytes, unavailable Python, false
receipt, cancellation/disposal/project switch, exact retry, and unchanged working
annotations. All lists page at 50 rows. Inspect 1280/1440/1920 in light/dark and
original citation rendering. Do not accept only direct-helper storage tests as
the public workflow proof.

## Implementation

- `basSnapshotBrowser.js` freezes a saved/live matching payload and generation.
  Private preview ownership binds the selected scope; approval performs fresh
  shared readiness and Python replay and full archive preflight before storage.
  Reopen/export/import also replay, and never call annotation restore/apply.
- `BasSnapshotWorkspace` sits inside Review & changes. Only a human-facing form
  can invoke approval; no approval verb was added to Agent. Scope selection,
  reviewer and reason are view drafts, not new source facts.
- `BasSnapshotContents` reads exact shared inventory values and source references.
  It preserves null/unknown values and original status labels, rather than
  inventing installed counts. Original PDFs use the existing isolated reader
  against the snapshot's historical workflow, never today's source substitution.
- Saved metadata is explicitly not replayed. Opened records are labeled verified
  historical scope with current applicability not evaluated. Revocation,
  supersession, selective currentness and readable non-commercial result exports
  remain required; the existing ZIP is a source-inclusive evidence archive.

## Verification ledger

- Initial production types/lint **87635 exit 0**, three unchanged canvas warnings.
- First new test typecheck **6354 exit 2**: transport test-double signature
  required `RequestInit` when real fetch permits it to be omitted. Fixed only
  test typing; no assertions or production behavior weakened.
- **5233 exit 0**: typecheck and 24 browser-client/storage tests pass (4.782 s).
  Eight new browser-client tests use explicitly controlled no-calculation
  transport doubles, not an actual-Python claim.
- **50471 exit 0**, `evidence/snapshot-ui-1/proof.json`: real nine-page original,
  retained source-backed workflow, two included equipment claims and 458 retained
  findings. Actual UI readiness 3.788 s, approve/save 5.353 s, export 3.747 s,
  reopen 4.062 s. Five actual Python requests; no page errors. Save/reload/reopen
  and idempotent public ZIP import pass. 18 light/dark desktop screenshots and
  original citation captured. Visual inspection found an obsolete outer header
  disclaimer; corrected before the final run.
- The UI lifetime is created in an effect, not a memo that React StrictMode would
  dispose permanently during its development remount. Remount/disposed-preview
  and mid-replay edits have explicit new tests. **75262 exit 0**: types/lint and
  26 client/storage tests, 5.167 s, same three existing canvas warnings.
- **63157 exit 0**, `evidence/snapshot-ui-2/proof.json`: second full public run
  adds keyboard activation/focus return, approval-form screenshots and a fresh
  empty browser's import/source rendering. No annotation replacement or active
  counting sheets added. Readiness 3.721 s, approve/save 5.819 s, export 5.168 s,
  reopen 5.191 s. Six journey assertions, five actual Python calls in the first
  context plus fresh-context replay; no browser errors. 24 theme/desktop captures
  plus original-citation/empty-project views. Representative light/dark captures
  visually inspected; source identity/bbox handling reused the PDF reader.
- **18619 exit 0**: full final web check, **2,918 pass / 13 existing skips /
  zero failures** (2,931 total, 91.296 s tests). Types/lint, all configured
  benchmarks and build (12.85 s) pass. Three existing canvas warnings and bundle
  size notices remain. Scoped-readiness benchmark 1.728–2.387 s / 407,764,992 B
  incremental RSS passes its existing limit; the separate combined memory
  failure is not waived. Final MCP/package/Python and remote merge checks remain.

## User-requested wrap-up

The user explicitly requested finishing the current increment, merging the
branch to main after conflict/check verification, and an in-depth user-impact
report, to conserve usage. Do not start the remaining feature phases during this
wrap-up. This does not redefine the full goal as complete. Git fetch confirmed
the branch was 50 commits ahead of `origin/main` and zero behind before this
increment's commit; no divergence to resolve at that check.

## Open goal work

The separate combined source-backed snapshot probe still fails its 512 MiB
incremental-memory gate. Public MCP snapshot operations, currentness/revoke/
supersede, useful Agent-driven draft automation, unique-point reconciliation,
original A–D/corpus/holdout acceptance and the appended researched symbol phase
remain required. This screen is not a production-readiness declaration.
