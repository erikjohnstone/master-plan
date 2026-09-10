# Public requirements and quantities comparison

2026-09-10, after `b942b4f7`. Development branch only. This completes the public
comparison journey, **not workflow E, the original five-workflow goal, approval,
installed counting or deployment**. The symbol extension remains last.

## Scope and shared path

The internal Takeoff route is **Review & changes → Drawing changes → Compare
requirements & quantities**. Select retained source sets and exact review /
calculation versions; compare, inspect originals, record explicit item pairs or
add/remove decisions with reasons, compare again, save, reload, reopen and export.
Unknown quantities are not zero. The full report and original records remain
available; the reader pages long rows, fields, measures, sources and decisions.
No permanent toolbar or additional nested modal was added.

Shared-path gate: operation validation, request/report ownership, evidence
ordering and Python-backed comparison are shared. The browser HTTP bridge and
existing `bas_drawing_review` tool invoke `runBasRevisionOperation`. No second
quantity implementation exists. UI focus/filter/paging and MCP bounded delivery
are surface-specific. The inventory rule is explicitly versioned as
`bas_revision_inventory_2`; no extraction or Python arithmetic changed.

The MCP tool count stays **51**. Its additive `revision` command supports inspect,
run, read and export. One completed result per Session is retained for 15 minutes,
at most 128 MiB encoded JSON. Pages expose at most 50 entries and bounded exact
UTF-16 string slices. Reads of that view are **not** fresh Python replays.
Workflow changes invalidate the view. A record request validates output size and
requested page before adopting any workflow change. Cancellation, stale state,
bad paths and capacity errors do not save a partial review. File export is atomic
and does not overwrite by default; durable project backup is still separate.

Browser transport accepts/returns up to 128 MiB for revisions only; existing
assignment/assembly/engineering limits remain 32 MiB. Existing 45-second HTTP
and 30-second comparison deadlines remain. This is the existing local companion
route, not proof of static-host or remote deployment. Saved reviews persist;
unsaved form drafts survive source navigation, not page reload.

## Real source, controlled revision

- Original Fort Sam Houston Building 615 Controls Excerpt, nine pages, SHA-256
  `c62b086bc4b947bc7b87e237c415df1417ec4ebd5a3bf6b15bc7328890859d4d`.
- Controlled source-derived file reorders original pages 9 and 8 into pages 1
  and 2, SHA-256 `03398b9ba57fb5492c5ada6e38ef606df4e2b0cae766f84f2afa386f6e484053`.
  Existing reviewed accounting retains original pages 1–7. **Not an issued addendum.**
- Input `evidence/drawing-browser-2/reviewed.takeoff.json`, 4,487,724 bytes,
  SHA-256 `8d6ec2abb827e7fa1080cf0ca7c6e8c67880cc13c3f7ccf65c0a3eb3c7f23aa1`.
  Hardware capabilities are disclosed controlled inputs, not discovered ratings.

The actual browser uploads both PDFs and uses the ordinary evidence import.
No React state or calculation response is injected. It checks cancellation,
explicit point-row correspondence, stale preview rejection, original before /
after citations, retained draft/filter, keyboard save, actual IndexedDB reload,
Python replay, full comparison download and ordinary workflow export. The report
contains **698 rows**, including unresolved and outside-set items; this is not a
698-correct-items accuracy score. Six desktop layouts use both themes at widths
1280, 1440 and 1920. Sources are original page 8 and controlled page 2; their
content is intentionally identical while their retained source identities differ.

Final browser `evidence/revision-browser-8/proof.json`, session 55766 exit 0:
initial compare **5.395 s**, paired compare **5.372 s**, save through durable
autosave **12.301 s**, reopen **5.709 s**, zero page errors. All satisfy the
predeclared 8-second compare/reopen and 15-second durable-save budgets. All six
list layouts, selected detail and both source screenshots were visually inspected.
Long tables/detail continue below the first viewport and remain scrollable; this
is not a claim that every control or row fits simultaneously at 1280×800.
The new 10,000-measure renderer fixture proves bounded rendered measures, not
maximum-project end-to-end performance. Four rendering tests cover exact unknowns,
escaping, paging/clamping, final-value access and the unresolved filter.

Browser 7, final browser 8 and packaged MCP 3 reports compare exactly equal with
`assert.deepEqual`. Final browser workflow is 4,491,143 bytes, SHA-256
`bf1f8e48ec4938f47506d6c681f37173d7234af5b803b90720687795209f3fc9`;
comparison export is 9,419,914 bytes, SHA-256
`9208be19a448f8e8ee5426a7c47eb9af8dcde21741e6108fc81e15e18c9275bd`.
The packaged full response is 7,419,227 bytes, SHA-256
`a3a80ae518fd7d55a366991738ecbbc1c48caeddf6732a590462ce2d70e34280`.
Different envelopes/formatting account for different file hashes; the reports
inside them are identical, not merely similar totals.

The built MCP stdio process restores a source-inclusive browser backup, replays
all **31** saved calculations, exactly reproduces the browser comparison, pages
the result, exports full JSON, opens both historical originals without activating
them, records an agent-proposal comparison, retries it, exports a full backup,
starts a new process and recovers/replays both reviews. Results remain unapproved.

Public built proof: `evidence/revision-mcp-3/proof.json` (session 23945, exit 0).
Browser report equality, source-byte verification, proposal origin, exact retry,
fresh-process recovery and unchanged source/older history all pass. Timings:
restore 24.270 s; pinned reopen 4.448 s; cached quantity page 0.189 s; prepare
4.498 s; record 4.542 s; fresh-process restore 24.152 s. Restore replays all 31
historical records; comparison replays its selected dependencies. These are
single measured operations, not p95 or maximum-schema performance claims.

## Regression and performance gates

Final full web check **83710 exit 0**, `tmp/bas-revision-web-check-final-2.log`:
**2,804 pass / 13 existing skips / zero failures**, 26.575 s test phase; types,
lint, benchmarks and build pass, build 5.29 s. The same three TakeoffCanvas lint
warnings, four disclosed legacy One-Click benchmark failures and build size /
Agent-configuration warnings remain; none was hidden or changed. First full
check 7372 passed 2,803 before adding the unresolved-filter regression; the final
repeat includes all four new renderer tests and the final UI code.

Final unchanged history gate **3.048 / 3.034 / 2.916 s**; 201,000-entry drawing
gate **50.774 / 40.232 / 32.974 ms**, incremental peak RSS **127,598,592 bytes**;
inventory **3.096 / 3.081 / 3.098 s**, incremental peak RSS **84,705,280 bytes**.
All satisfy their existing budgets without threshold changes.

MCP session **43548 exit 0**: typecheck, **127 existing BAS tests** (44.817 s),
**33 comparison/journal/transport tests** (18.752 s), **four packaging tests**
(85.234 ms), unchanged **51-tool** count, and **122 staging/safe-write/tool tests**
(28.733 s) pass. The 33 comprise 19 comparison, eight journal, two actual HTTP /
transport-boundary and four bounded/public transport tests. The extra journal
case is the failed-first canonical-property-order replay regression.

Serial comparison gate: **4.065 / 4.017 / 3.967 s**, incremental peak RSS
**155,287,552 bytes**. Prepare/record/reopen gate: **4.003–4.322 s**, incremental
peak RSS **219,267,072 bytes**. Existing 6-second / 512-MiB budgets pass; same
retained 496-row basis, 175 comparable values, two saved records and 12 point
matrices. This is not a speedup, extraction, source-byte or full-project claim.
Logs: `tmp/bas-revision-mcp-check-final.log`, `bas-revision-packaging-final.log`,
`bas-revision-mcp-tools-final.log`.

Python session **86807 exit 0**: **452 pass / one explicit packaging skip** in
6.59 s; configured mypy **20 source files pass**; separately enabled packaging
test **one pass in 0.90 s**. No Python source changed. Logs:
`tmp/bas-revision-pytest-final.log`, `bas-revision-mypy-final.log`,
`bas-revision-python-pack-final.log`.

Full extraction-corpus and blind-holdout gates remain pending. Do not replace
those with the real Fort Sam walkthrough or claim new per-document symbol scores.

## Failures retained, not scored away

1. Browser attempts 1–5 exposed ambiguous implicit labels and ambiguous test
   selection between same-label inside/outside items. Explicit accessible labels
   and source filename/page/scope were added to choices. The harness identifies
   exact selected IDs and correspondence rather than assuming a label is unique.
   A source-return textarea lookup failed, but the actual draft was not lost.
2. Browser 6 passed; packaged MCP attempts 1 and 2 then found a **real replay
   mismatch** after canonical backup reordered JSON object keys. The 341 affected
   rows differed only in `source_refs` ordering and its content fingerprint.
   A canonical-property-order regression failed first, then passed after sorting
   exact deduplicated references on the shared inventory path. No evidence was
   discarded or rewritten. Existing rule-1 reviews stay immutable and disclose
   mismatch rather than acquiring a rewritten fingerprint.
3. An additional renderer test reproduced an unresolved quantity disappearing
   from the changes/unresolved filter when source fields were equal. The filter
   now consumes all shared unresolved statuses and preserves changed saved-output
   and issue flags. Before test failed; after tests pass. No domain status changed.
4. Type checking found an ES2022-only `Object.hasOwn` call and an unsafe inferred
   empty-list assertion in the shared delivery reader. Replaced with compatible
   own-property calls and explicit typed collection initialization. No compiler
   target, assertion, threshold or test was weakened.

Raw attempts remain under `evidence/revision-browser-1` through `-8`,
`revision-mcp-1` through `-3`, and `tmp/bas-revision-*`. Generated full archives
and reports may be untracked; reproducible scripts and selected evidence are
retained with the checkpoint. Earlier reports are not silently overwritten.

## Reproduce

Use Node 24.13.1, the existing `.venv-bas`, and the task's local app on port 5177.
Chrome used here is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
Run heavyweight gates and walkthrough timings serially.

```sh
# From opentakeoff/web; use a fresh output directory on every run.
OT_BROWSER_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node --import tsx scripts/playwright-bas-revisions.mjs /path/to/original.pdf ../tmp/pdfs/bas-drawing-revision-2/controlled-reordered-source-pages.pdf ../docs/bas-production/evidence/drawing-browser-2/reviewed.takeoff.json ../docs/bas-production/evidence/revision-browser-N

# From opentakeoff/mcp, after the browser proof.
npm run build
node --import tsx scripts/verify-bas-revisions.mts ../docs/bas-production/evidence/revision-browser-N/reviewed.takeoff.json ../docs/bas-production/evidence/revision-browser-N/comparison.json /path/to/original.pdf ../tmp/pdfs/bas-drawing-revision-2/controlled-reordered-source-pages.pdf ../docs/bas-production/evidence/revision-mcp-N

# Standard gates, from the indicated package directories.
# web:
npm run check
# mcp:
npm run typecheck
npm run test:bas
npm run test:packaging
npm run check:tool-count
```

## Research and remaining main-goal work

Official [Autodesk comparison](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Files/files/Compare_Sheets.html)
and [inventory](https://help.autodesk.com/cloudhelp/ENU/Takeoff-Takeoff/files/Inventory.html)
documentation informed separate source/version inspection and tabular quantities.
[Procore revision comparison](https://support.procore.com/products/online/user-guide/project-level/drawings/tutorials/compare-drawing-revisions)
distinguishes individual and drawing-set comparison. These are documented
workflow references, not hands-on competitor testing or BAS correctness evidence.

For the next E work, official [Autodesk issue creation](https://help.autodesk.com/cloudhelp/ENU/Build-Issues/files/Issues_Create.html)
documents issue status and [approval workflows](https://help.autodesk.com/view/BUILD/ENU/?guid=Reviews_Create_Edit&p=DOCS)
separately define file approval outcomes; later workflow edits apply to later
reviews. Our inference is to keep acknowledgement, correction and approval
distinct and retain the rules used for past reviews. [MDN IndexedDB guidance](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)
supports waiting for transaction completion and disclosing storage durability
limits. All were rechecked 2026-09-10; no new authenticated approval claim follows.

Next: issue decisions and corrective navigation; scoped dependencies and explicit
positive approval; immutable-through-app takeoff snapshots and source-inclusive
release export; remaining A–D corpus/holdout and cross-trade gates. Finish the
five workflows before the appended researched symbol/installed-plan phase.
No blanket completeness, source-discovery, installed, as-built, engineering
certification, authenticated identity or maximum-volume claim is made here.
