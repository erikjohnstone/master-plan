# Public issue review — verification record

2026-09-10, after `f70eda16`. This implements the public issue-action portion
of workflow E, not selective approval or approved snapshots. The five original
BAS workflows remain first; the appended researched symbol phase remains last.

## Design and safety

The predeclared acceptance contract is `ISSUE_DECISION_CONTRACT.md`. Official
Autodesk issue and approval documentation was refreshed during this work; its
source-linked activity history and separately initiated approval reviews support
this separation as a design inference, not a BAS engineering rule:
[issue workflow](https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/Issues_Create.html),
[approval workflow](https://help.autodesk.com/cloudhelp/ENU/Docs-Reviews/files/getting-started-reviews/Reviews_Create_Edit.html).

**Shared path:** all findings, decision validation, pinned-history reconstruction
and persistence semantics reuse `basIssueReview`. The browser adoption guard,
exact-ID editor navigation and MCP bounded delivery are surface-specific. No
VectorGrid, table/symbol extraction, bbox semantics or Python arithmetic changed.

The UI adds contextual actions and Decision history inside Review & changes,
without new permanent navigation. It retains drafts, original source links and
domain return context. MCP `bas_issue_review` has strict commands, one bounded
completed view, 15-minute expiry/state invalidation, full result export and guarded
Session-only adoption. Full project evidence export persists the journal; a result
JSON alone is not a project backup. The local unpublished package is 0.9.77, with
52 registered/staged/documented tools.

Scope, assignment, equipment, source-row, component, check/resource and direct
point-row routes use retained IDs rather than labels. Scope/assignment targets
offer their existing editor, preserving another draft if one exists. General SOO
coverage navigation still opens the existing sequence workspace; this checkpoint
does not claim every clause/comparison has a complete exact editor route.

## Detected and corrected defects

- A new browser adoption guard initially retained its caller's context object.
  The mutation/epoch/storage race test failed. Copying the context fields before
  awaiting fixes the defect; workflow identity, nested JSON, epoch, source
  signature, adapter and cancellation are checked before adoption.
- First actual browser walkthrough failed its exact label lookup after source
  return. The failure screenshot shows the draft was retained. Explicit accessible
  labels fix the reopened textarea lookup; the same value-preservation assertion
  passes afterward. This was not lost domain history or an extraction failure.
- Visual inspection found native textarea styling inconsistent with the theme.
  The form now uses existing color/spacing/type tokens and a content-sized action.
- First packaged walkthrough passed historical replay, then its source request
  was correctly rejected: the harness supplied a bbox array instead of the public
  `region:{x0,y0,x1,y1}` object. Corrected the harness only; coordinate values and
  production source contracts were not changed.

## Verification status

All commands ran serially on Apple M2, Node 24.13.1 and Python 3.14.3:

- Web `npm run check`, session 23076 exit 0: **2,823 pass / 13 pre-existing
  skips / zero failures**, types/lint/bench/build pass. Tests 26.562 s; build
  5.37 s. Three existing canvas lint warnings, four legacy One-Click known-fails
  (excluded by their existing gates) and bundle/Agent notices remain unchanged.
- MCP session 94858 exit 0: types; **128 BAS + 33 revision + six issue + four
  packaging + 122 staging/safe-write/tool tests** pass. Tool-count check reports
  **52**, zero stale markers. The six issue tests include four new transport
  tests. Two browser guard/navigation tests are included in the web total.
- Python session 66866 exit 0, with `OT_BAS_VERIFY_PACKAGE=1`: **453 pass**,
  including the normally skipped packaging check, in 7.14 s; mypy passes all
  20 source files. No Python source was changed.
- Existing shared issue benchmark: **0.884–1.159 s** per operation;
  **523,632,640-byte** incremental peak RSS, below the unchanged 512 MiB budget.
  Controlled 10,000-event lineage: **128.669 ms / 33,030,144-byte** incremental
  RSS. This is structural validation, not 10,000 historical replays.

Final browser session **53197 exit 0**, `evidence/issue-public-browser-3/proof.json`:
real upload/import, exact original source bbox, draft return, keyboard selection,
both themes at 1280/1440/1920, exact scope correction, recorded absence,
reappearance, withdrawal, actual UI project/replay exports and IndexedDB reload.
**Zero browser errors; 2.117/2.964/2.807 s** for the three issue actions, under the
predeclared 10 s limit. All six form screenshots and the historical detail were
visually inspected. Long source tables use internal scrolling, not clipping or
hidden data. Findings move **456 → 458 → 459** because dependent-staleness warnings
are retained. Hardware and scope inputs are controlled declarations, not automatic
extraction or installed-design verification. Earlier browser runs 1 and 2 remain
local as the failed-label and pre-final-styling evidence; run 3 is authoritative.

Packaged MCP session **62351 exit 0**, `evidence/issue-public-mcp-2/proof.json`:
actual stdio tool, ordinary real-PDF/browser-archive import, bounded reads, full
replay export, original-PDF byte/frame-verified source view, proposal recording,
retry/stale rejection, full project export and recovery in a new server process.
Inspect/replay/record/reopen: **1.054/1.381/1.036/1.032 s**. The MCP result exactly
matches the shared result at its current inputs. Its original finding and pinned
absence inputs exactly match the earlier browser export; current findings differ
legitimately because that browser export preceded the controlled reappearance.
The original-source image was inspected: M-601 / PDF page 9, DOAS-1 schedule cell,
with its original blue bbox and display padding. No old PDF is newly activated by
source inspection. The failed MCP run 1 remains local; run 2 is authoritative.

Original PDF SHA-256:
`c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
Input archive: `evidence/engineering-families-browser-3/ip-reviewed.takeoff.json`,
SHA-256 `afa01b4ab892d3e0c112c9b6d8137e4c90afba8013b0ffd184c6c25e4bda15f5`.
Reproduce with `web/scripts/playwright-bas-issue-review.mjs` (PDF, input archive,
fresh output directory), then `mcp/scripts/verify-bas-issue-review.mts` (PDF, final
browser `reviewed.takeoff.json`, `absence-replay.json`, fresh output directory).
Use the checkout's Vite port 5177 and Chrome via `OT_BROWSER_PATH`; build MCP first.
Logs are `tmp/bas-issue-public-{web,mcp-types,mcp-bas,pack,tools,count,python,mypy}.log`.

Remaining main-goal work includes coverage/applicability and deliverable exclusion
decisions, selective dependency-bound approvals, a positive approved snapshot and
source-inclusive release/recovery journey, unfinished A–D acceptance gates and
the final applicable corpus/untouched-holdout gates. No full corpus/holdout result,
complete BAS-production status, push, merge, deployment or publication is claimed.
