# BAS production workflow progress

## Shared issue decisions and exact historical replay — 2026-09-10

After **bb2df22c**, implemented the internal `bas_issues_9` journal: exact
observations, acknowledgement/begin-correction, replay-checked no-longer-reported
decisions and withdrawals. Nothing waives a blocker, changes quantities or grants
approval. Old decision/calculation writers, JSON/IndexedDB and source-inclusive
backups retain history. Forged/re-signed observations, stale bases, conflicting
branches and caller metadata mutation are covered. Common verification owns
nested source metadata before awaiting; shared reference checks avoid redundant
copies, and bounded prerequisite reuse retains every engineering check.
No extraction, interpretation rule, Python math, VectorGrid or symbol changes.

**Final 34704 exit 0:** web **2,821 pass / 13 existing skips**, types/lint/bench/
build; MCP **128 BAS + 33 revision + two issue + four packaging + 122 tool tests**,
types and unchanged 51-tool count; Python **452 pass / one explicit packaging
skip**, mypy 20 files, separately enabled packaging one pass. Existing lint,
legacy One-Click and bundle/Agent notices remain. No full corpus or holdout run.

Failed memory candidates are retained. After removing duplicate prerequisite
validation, three serial real-retained-input runs and the integrated gate pass
unchanged budgets: **0.838–1.124 s**, maximum **521,912,320-byte** incremental RSS
(<512 MiB). Controlled 10,000-event lineage: **128.279 ms / 33,325,056 bytes**,
not full historical replay. The Fort Sam capture stays exact; controlled scope
edits change the queue from 456 to 458 findings, retaining dependency warnings.
Contract/proof: `ISSUE_DECISION_CONTRACT.md`, `ISSUE_DECISION_PROOF.md`,
`evidence/issue-journal-shared.json`.

**Next critical path:** public UI/MCP issue actions, exact corrective routing,
safe adoption, actual source/reload/export walkthroughs. Then coverage/applicability
decisions, selective approvals and a positive approved snapshot/export journey.
Remaining A-D and final corpus/holdout gates are still required. Deeper symbol/
installed-plan research is **last**, an addition to the original five workflows.
Goal active; no user blocker. No new models, commercial scope, push, merge, deploy
or publish. Internal issue controls are not yet exposed to users.

## Stable finding identities before issue decisions — 2026-09-10

After **01094715**, reproduced a shared review defect on the retained Fort Sam
workflow: canonical JSON backup changed **236 of 456** finding occurrences only
because raw cell dictionary order changed. Failed-first regression now passes:
**zero changed occurrences**. Shared row evidence follows explicit header order,
retains unlisted cells/blanks/distinct boxes, and preserves narrative span order.
Projection rule is explicitly `saved_bas_findings_2`; old standalone exports are
not rewritten. All 456 original findings/statuses/subjects/text/bbox multisets
match the prior implementation, and the input workflow is unchanged.

**Web 14988 exit 0:** 2,806 pass / 13 existing skips, types/lint/bench/build pass.
Same three lint warnings, four legacy One-Click benchmark failures and
bundle/Agent-key warnings. **MCP 4959 exit 0:** types, 128 BAS + 33 revision +
four packaging tests, unchanged 51 tools; **42355 exit 0:** another 122
staging/safe-write/tool tests, Python 452 pass / one explicit packaging skip,
mypy 20 source files, enabled Python packaging one pass. No Python/math changes.
Serial finding reads **3.059-3.336 s**, **475,693,056-byte** incremental peak RSS,
within the declared 5 s / 512 MiB envelope. No speed improvement claimed.

Actual browser **6465** and canonical-backup browser **72448** both exit 0.
The latter imports sorted JSON through the normal file input, exports all **456
findings** exactly equal to the original-order shared projection, preserves
keyboard/source/domain return state and exact original retention through reload.
**Zero browser errors; 4.241 s first open; 2.133 s original retention.** Both
themes/three viewports checked. Representative queue/detail/original/highlight
screenshots visually inspected; 1280 detail evidence uses internal scrolling.
Proof and reproduction: `FINDING_IDENTITY_PROOF.md`,
`evidence/issue-order-browser-2/checks.json`.

Primary-source issue/approval workflow research refreshed in
`REVIEW_REVISION_CONTRACT.md`; no claim of automatically verified hardware,
authenticated reviewer, complete coverage or approved takeoff.

**Next critical path:** implement the additive issue-decision journal (revision
9, not reusing drawing 7/comparison 8), exact occurrence/head/ownership validation,
append-only acknowledgement/withdrawal and source-preserving corrective routes.
Acknowledge must never remove a blocker or change a count. Then dependency-bound
selective approval and a positive source-inclusive approved snapshot/export
journey, followed by remaining A-D/applicable corpus/holdout gates. The appended
deep symbol/installed-plan research remains **last**, not a replacement for the
original five workflows. Goal active; no blocker. No full corpus run, holdout
opening, VectorGrid/extraction/symbol changes, models, commercial math or external
push/merge/deploy/publish.

## Public pinned comparison workflow — 2026-09-10

After **b942b4f7**, exposed the shared Python-backed revision comparison through
the existing internal Takeoff review workspace and additive `bas_drawing_review`
commands. Explicit pinned versions, one-to-one item correspondence with reasons,
before/after/difference tables, original-source navigation, cancellation, guarded
save, durable reopen, full export and bounded MCP views are integrated. UI pages
long data without truncating full reports. MCP remains **51 tools**, local package
version **0.9.76**, unpublished. No new permanent toolbar or extraction fork.

The real source-derived browser journey passed, then packaged replay discovered
a genuine canonical-backup ordering defect. Added a failed-first regression and
fixed only exact source-reference set ordering on the shared inventory path,
explicitly versioned `bas_revision_inventory_2`. All quantities, original text,
IDs and citation coordinates stay unchanged. Old saved review fingerprints are
not rewritten. A separate failed-first UI regression keeps unresolved quantities
visible in the changes filter even when their declared fields compare equal.

**Final web 83710 exit 0: 2,804 pass / 13 existing skips**, types/lint/bench/build
pass; 26.575 s tests / 5.29 s build. Same three lint warnings, four legacy
One-Click benchmark failures and bundle/Agent warnings remain disclosed.
**MCP 43548 exit 0:** types, **127 existing BAS + 33 revision + four packaging +
122 staging/safe-write/tool tests pass**, unchanged 51-tool check. **Python 86807
exit 0:** 452 pass / one explicit packaging skip in 6.59 s; mypy 20 files; enabled
packaging test passes separately in 0.90 s. No Python source changed.

**Final browser 55766 exit 0**, `evidence/revision-browser-8/proof.json`: 698
comparison rows; actual uploads/import, cancel, explicit pair, stale-preview
rejection, source-return state, keyboard focus/save, actual IndexedDB reload,
shared replay and complete exports. Six layouts and detail/both-source screenshots
visually inspected. Compare/reopen **5.372–5.709 s**, durable save **12.301 s**,
within predeclared 8/15-second limits. **Built MCP 23945 exit 0**,
`evidence/revision-mcp-3/proof.json`: exact browser report, all 31 historical
calculations replayed on restore, both originals verified/opened without activation,
proposal record/retry, complete export and new-process recovery. Final browser 8
and MCP 3 reports are exactly equal, not just matching totals.

Existing serial comparison **3.967–4.065 s**, save/reopen/prepare **4.003–4.322 s**,
incremental RSS 155,287,552 / 219,267,072 bytes; inventory/history/drawing gates
also pass unchanged. These are bounded retained-fixture measurements, not maximum
capacity, p95, fresh extraction or production deployment claims. The revision is
controlled reordered original pages, **not an issued addendum**; declared hardware
inputs remain controlled. Full proof, hashes, commands, failures and research:
`REVISION_PUBLIC_PROOF.md`.

**Original main goal remains active and incomplete.** Next: complete issue
decisions/corrective navigation, selective dependency-bound approvals and positive
approved snapshot/export workflow, then remaining A–D/final corpus and untouched
holdout gates. Only after the original five workflows comes the appended deep
researched symbol/installed-plan phase. No full corpus/holdout score is claimed
for this checkpoint. No VectorGrid/table/symbol algorithm, scorer/key, model,
commercial, push, merge, deploy or external-service changes.

## Durable comparison journal foundation — 2026-09-10

After **b7563f9a**, added shared `bas_revision_8` comparison history. Records pin
the exact source sets, event/calculation selectors, item correspondence, review
reasons, self-declared identity/origin and completed report fingerprint. Save and
reopen run the same Python-backed comparison; exact retries preserve later
history. A changed report is explicitly mismatched, not silently accepted. No
approval, source-byte or authenticated-review guarantee is inferred from a hash.
Wire schemas were extracted without changing the existing import paths or
comparison/inventory algorithms, avoiding a Workflow/schema import cycle.

Verified old revision compatibility, typed selector ownership, missing/reordered/
forked/tampered history, size limits, actual IndexedDB reload and ordinary JSON
import/export. Every existing SOO, equipment, assembly, engineering, calculation
and drawing write preserves the new journal; old pinned comparisons still replay
after relevant applicability edits. Controlled changed-count/SOO tests retain
originals, unknowns and unresolveds. Caller mutation, runtime failures, cancellation
and expired deadlines accept no partial write. Re-signed wrong report identities
are distinguishable from matching replays; foreign item IDs fail replay.

**Web 58287 exit 0: 2,800 pass / 13 existing skips**, 29.620 s tests / 5.34 s build;
types/lint/benchmarks pass with the same three lint warnings and disclosed legacy
One-Click/build warnings. **MCP 10599 exit 0:** types, **127 existing BAS + 26
comparison/journal tests** (19 comparison, seven new journal), and **four packaging
tests pass**. **Python 26010 exit 0:** 452 pass / one explicit packaging skip,
6.31 s; mypy 20 source files; separately enabled packaging test passes in 0.88 s.
The seven new web journal tests are included in the full web total.

First serial retained-source baseline: prepare 4.013–4.093 s, record 4.131–4.190 s,
reopen 4.018–4.248 s; incremental peak RSS 251,494,400 bytes. Subsequent gate fixed
at 6 s per operation / 512 MiB before further evaluation. Final operations
4.062–4.170 s, incremental peak RSS **245,071,872 bytes**. Existing comparison
**4.036 / 3.998 / 3.958 s**, inventory **3.208 / 3.161 / 3.171 s** and history /
201,000-entry drawing gates pass unchanged. This benchmark uses the same retained
Fort Sam basis on both sides (496 rows, 12 matrices, two selected saved records),
with one through three journal entries. It is not an issued addendum, maximum-
size performance claim or fresh PDF extraction. Exact evidence and commands:
`evidence/revision-journal-1/proof.json`; contract: `REVISION_JOURNAL_CONTRACT.md`.

**This is an internal checkpoint, not completion of workflow E or the main goal.**
No new public comparison UI/MCP walkthrough or full corpus/holdout pass is claimed.
No extraction, VectorGrid, symbol, Python math, key/scorer, model, commercial or
external changes. Goal remains active: finish public revision comparison, issue
decisions, dependency-bound selective approvals and approved snapshots, plus A–D
final corpus/holdout gates. The appended researched symbol/installed-plan phase
remains last and does not replace or shorten the original five workflows.

Next public integration uses the existing internal **Review & changes → Drawing
changes** workspace. Trace already confirmed: `BasProjectReviewWorkspace.jsx` →
`BasDrawingWorkspace.jsx`; callbacks flow through `TakeoffDataPanel.jsx` and
`TakeoffCanvas.jsx`. Python-backed browser transport is the existing bounded
`vite.basAssignmentApi.js` / `mcp/scripts/bas-assignment-cli.mts` pattern, while MCP
history-only operations use `Session.basDrawingGuard()`. Extend these surfaces
without recompiling/rebinding original extraction or adding permanent chrome.
Provide explicit pinned-version selection, searchable/paged one-to-one item
pairing with reasons, before/after/difference table, original sources, durable
save/reopen and complete exports. Recompute only a requested comparison, not every
historical report on workspace mount. Preserve existing page-accounting commands.
Actual browser and packaged-MCP journeys are required before calling this public.

## Shared revision-impact comparison — 2026-09-10

After **34aeaffa**, implemented the internal shared comparison service. Both
sides pin exact source/decision/calculation versions; reviewed one-to-one matches,
add/remove decisions, unresolved/outside accounting, original evidence, declared
fields, rules, dependencies and quantity basis remain separate. Python replays
selected saved results, validates retained point observations against original
cells and computes only comparable count deltas. No workflow writes or approval.

Reproduced and fixed different point variables being subtracted after replication;
reused equipment UUIDs hiding changed source bindings; and engineering resource
IDs creating false declared-field changes. Explicit reference handling now covers
all **11 engineering families**. Saved output representation stays separately
visible and unchanged in each original. Unknowns, attributes, missing sides,
changed measures and stale/cross-boundary evidence do not become numeric zeros.

**Web 74271 exit 0: 2,793 pass / 13 existing skips**, types/lint/bench/build pass,
29.955 s tests / 5.42 s build. Existing three lint warnings, legacy One-Click known
failures and bundle/Agent configuration warnings remain. **Python 89332 exit 0:
452 pass / one explicit packaging skip**, 6.86 s; configured mypy **20 files pass**.
**MCP 48744 exit 0:** types, **127 existing BAS + 19 new comparison tests pass**,
build, **four packaging tests**, and the separately enabled **Python packaging
test passes**, including actual new arithmetic execution from the bundled runtime.
The new comparison suite and serial gate run by default after `test:bas`.

Complete retained-project comparison: **496 rows / 175 comparable values / 12
validated point matrices / two selected saved records replayed**, final **4.217 /
4.171 / 4.149 s**, incremental peak RSS **172,523,520 bytes**, report **6,462,912
bytes**. Predeclared post-baseline gates 6 s / 512 MiB pass; not an improvement
claim. Existing history, 201,000-entry drawing journal and inventory budgets pass
unchanged. Exact baseline, failures, corrections and final proof:
`evidence/revision-comparison-1/proof.json`; contract: `REVISION_IMPACT_CONTRACT.md`.

This is **not a public comparison workflow or production-complete milestone**.
Real retained Fort Sam data supplements controlled changed/re-export cases;
no new actual UI/public-MCP comparison, issued-addendum, full corpus or blind
holdout acceptance is claimed. No VectorGrid, symbol, extraction, existing math,
key/scorer, cost/labor, model, push/merge/deploy changes. Original main goal stays
active; the symbol extension remains last, not a substitute.

Next: extract wire schemas from the comparison implementation before adding an
append-only comparison journal (avoid a Workflow/schema import cycle). Persist
explicit pinned correspondence/reasons and deterministic report identity; replay
through the same Python-backed service. Add history-safe public UI/MCP inspection,
paging, source-return context and export. Then issue decisions, selective
dependency-bound approvals/snapshots; remaining A–D corpus/holdout/public gates;
then researched deformation-tolerant symbols and installed-plan reconciliation.

## Pinned revision-side inventory — 2026-09-10

After **c2685089**, implemented the shared read-only basis/inventory foundation
for the remaining revision-impact workflow. Explicit source-set and per-capture
decision/calculation IDs retain original pages, points, SOO clauses/requirements,
equipment rows/assignments, assemblies/responsibilities, engineering inputs and
saved results. Historical references resolve against the events they actually
depended on; a later UUID rebind cannot silently change old evidence. Unknowns,
attributes, scope boundaries, stale/missing dependencies and source rules remain
explicit. Unchanged content identity is not approval or semantic equivalence.

**Web 58915 exit 0: 2,783 pass / 13 existing skips**, including 12 added tests;
typecheck, lint, benchmarks and build pass. **MCP 95875 exit 0:** types, **127 BAS
tests** including new actual Python integration, build and **4 packaging tests**.
Old capture/merge identity algorithm unchanged (existing helper exported/renamed).
No VectorGrid, extraction, symbol, Python math or public navigation changes.

Real retained Fort Sam/controlled-hardware inventory: **496 items / 3,044,819
bytes**, final **2.997 / 3.030 / 2.961 s**, incremental peak RSS **77,725,696
bytes**, under predeclared 5 s / 512 MiB. Existing history gate **3.137 / 2.999 /
2.972 s**; 201,000-entry drawing journal **50.852 / 40.182 / 33.073 ms**, RSS
**123,961,344 bytes**, unchanged gates pass. Initial fixture errors rejected by
existing validators were corrected without changing production interpretation.
Contract, provenance, warnings and exact scope: `REVISION_IMPACT_CONTRACT.md`;
compact results: `evidence/revision-inventory-1/proof.json`.

This is **not** complete revision review or any production-complete claim. No
new public comparison walkthrough, full-corpus/holdout gate or standalone Python
suite in this slice. Next: reviewed item correspondence and structured semantic/
comparable-quantity differences; issue resolution; selective dependency-bound
approvals and snapshot/export; remaining A–D acceptance gates; **then** the
appended researched symbol/installed-plan phase. Goal remains active. No costs,
labor, models, holdout access, push, merge, publish or deployment.

## Public drawing correspondence — 2026-09-10

After **79868930**, the shared page-accounting journal is usable in
**Review & changes → Drawing changes** and the new history-only MCP
`bas_drawing_review`. Explicit source selection, replacement/addendum accounting,
unresolved decisions, exact source viewing, preview invalidation and immutable
history use the same validator. MCP proposals require export, remain unapproved
and cannot overwrite concurrent workflow/restore/plan-load changes. UI drafts
and source-return context remain surface-specific. No extraction change.

Final web **11736 exit 0: 2,771 pass / 13 existing skips**, 25.659 s tests / 5.46 s
build. Three existing lint warnings, legacy One-Click known failures and bundle
warnings remain. Real-history benchmark **3.069 / 2.987 / 2.996 s**, unchanged
5 s gate. Journal **51.757 / 40.825 / 32.441 ms**, incremental peak RSS
**146,309,120 bytes**, unchanged 2 s / 256 MiB gate. MCP final **59493 exit 0**:
types, 51-tool count parity, **126 BAS tests** (43.844 s), **4 packaging/proof
tests**, **107 staging/public-tool tests** (28.754 s). Seven new MCP tests include
exact public restore/export/source viewing, stale/racing/reused requests,
oversized inventory disclosure and old-operation retry after later decisions.

Browser **81444 exit 0**, `evidence/drawing-browser-2`: actual Fort Sam original
plus controlled copied pages 9/8 compiled through the real shared pipeline.
Explicit page 8→2 / 9→1 pairing retains nine pages, all prior captures/engineering
history, source-return draft, reload and ordinary evidence export. Six light/dark
desktop layouts plus source/preview screenshots inspected. No page errors.
Preview→record→durable save baseline **8.423 / 8.446 s**; not a new speed gate.
Initial test failed because reselecting page 1 changed explicit source order;
corrected test asserts order, without weakening comparison. Initial MCP surface
test failed a missing coordinate-description requirement; description corrected,
test unchanged. Fixture-builder worker cleanup was repaired and rerun successfully.

Built public MCP proof: `mcp/scripts/verify-bas-drawings.mts` restores the actual
browser export with both exact PDFs, inspects/compares through the shared path,
records a same-original duplicate delivery without adding pages, reopens both
originals, exports and recovers in a fresh process. Actual Python replays all
31 saved calculation records during restoration. Controlled hardware and copied
pages are disclosed; not a real issued addendum or installed-count proof.
Full details and measurements: `DRAWING_CORRESPONDENCE_CONTRACT.md`.

Main goal stays active: next implement semantic/comparable-quantity revision
impact, issue decisions, selective approval dependencies and approved snapshots;
finish remaining A–D corpus/holdout gates, **then** the appended researched symbol/
installed-plan phase. No standalone full Python/corpus/holdout rerun in this slice.
No VectorGrid algorithm/threshold, symbol, table/cite/bbox, Python arithmetic,
key/scorer, cost/labor, push, merge, publication or deployment changes. MCP 0.9.75
is an unpublished development version, not a production release.

## Shared drawing correspondence foundation — 2026-09-10

After **63658a35**, implemented the shared `bas_review_7` source-set and
page-accounting journal. Explicit initial sets, reciprocal replacements,
retention/removal/additions, same-source redundant delivery and unresolved
decisions preserve all old captures, source order and frame ownership. Partial
addendum omissions suggest retention for confirmation; changed-byte pairings are
never silently confirmed. Text/frame comparison does not claim ink/semantic/
quantity equality. Existing edits/import merges preserve or explicitly reject
conflicting new history. No approval or current-count mutation is introduced.

**17 focused pass** (86629). Final web **56770 exit 0: 2,771 pass / 13 existing
skips**, 24.245 s tests / 5.06 s build; existing three lint warnings, legacy
One-Click known failures and bundle warnings remain. Existing real-history
benchmark **3.052 / 2.968 / 2.957 s**, under unchanged 5 s gate. Added predeclared
1,000-page/100-revision journal gate: **50.182 / 43.148 / 33.095 ms**, incremental
peak RSS **149,536,768 < 268,435,456 bytes**. Bounds are explicit and tested.
MCP **38438 exit 0**: types, **119 BAS tests** (59.543 s), **4 packaging/proof
tests**, build. No version/tool change; 0.9.74 / 50 tools.

Retained real Fort Sam/controlled engineering history survives actual IDB and
JSON replay with all original captures and engineering decisions unchanged.
Source accounting fixtures are controlled, not real addendum validation. No new
browser walkthrough, full corpus/holdout or standalone full Python run is claimed.
Contract/evidence: `DRAWING_CORRESPONDENCE_CONTRACT.md` and
`evidence/drawing-shared-1/proof.json`.

Next: public revision editor in Review & changes and dedicated history-safe MCP
entry point (the existing compile-retention gate requires active originals).
Then source/semantic/comparable-quantity changes, issue decisions, selective
dependencies and approved snapshots/export; remaining A–D corpus/holdout gates
and final researched symbols/installed-plan phase remain required. This internal
foundation is not a finished end-user revision capability. Goal remains active.
No VectorGrid/symbol/table/cite/bbox/Python arithmetic/key/cost/labor changes,
push, merge or deployment.

## Coordinated synced evidence restore — 2026-09-10

After **4119b0db**, local and local-first synced restore share a per-annotation-
scope Web Lock with recovery/adopt/push/checkpoint, including other browser tabs.
Adoption payload and remote ancestry commit atomically; generation acknowledgment
cannot cross restore. Durable pending state survives offline/restart. Unknown
ancestry uses existing shared operator-preserving import and retains remote JSON;
history conflicts still block. Closed coordinators do not send later workspace
state. IDB v5 preserves prior records and fences uncoordinated v4 writers.

**12 new tests**; final focused **94 pass** (92818, 7.233 s). Final web **95921
exit 0: 2,754 pass / 13 existing skips**, 18.755 s tests, 5.26 s build; history
benchmark **3.073 / 2.986 / 2.951 s** under unchanged 5 s gate. Existing lint/
One-Click/chunk caveats remain. MCP types and **119 BAS pass** (47.749 s); corrected
VectorGrid packaging invocation **3 pass**. Initial test/typing/command failures
are recorded in `SYNC_RESTORE_CONTRACT.md`, not hidden.

Actual browser **79651 exit 0**, `evidence/sync-restore-browser-2`: actual folder
composite/OPFS + real Fort Sam ZIP + second-tab lease → cancel/no change → retry/
actual Python replay of 31 records → local atomic restore → annotation provider
confirmation → exact original reader → reload. **24.682 s** local including replay
and controlled wait; **27.076 s** through sync. Eight final screenshots inspected;
no page errors. No live cloud/OS-sync, new extraction or real addendum claim.

Large capacity: private contexts failed quota twice; instrumented failure proves
rollback and also exceeded 2 GiB sampled RSS. Do not claim that mode passed.
Same **551,119,404 bytes**, isolated ordinary profile: **90411 exit 0**, restore
**10.249 s**, verify **1.106 s**, sampled RSS **2,109,784,064 < 2,147,483,648**;
narrow headroom, unchanged limits. Chromium RAM-based private quota is documented;
different modes are not a before/after speed improvement. Controlled bytes are
not real-PDF accuracy evidence. See the complete contract/proof for all limits.

Main goal remains active. Next: usable journal recovery, reviewed source/version
correspondence and scoped approval/snapshot journey, remaining A–D corpus/holdout
gates, then appended symbol/installed-plan research and measured hardening.
Full standalone Python/corpus/holdout not rerun; no VectorGrid, symbols, table/
cite/bbox, Python math, keys, costs/labor, push or merge changed.

## BAS history-safe sync reconciliation — 2026-09-10

After **7692b78b**, reproduced a real generic-sync loss: three independently valid
BAS captures became two under whole-object remote-wins, labeled a clean merge.
Shared append-only retention now keeps all three and rejects conflicting review
branches. Actual sync seed, adoption, first push, older/missing snapshots and
crash recovery use shared lineage validation. Invalid/unmerged remote JSON gets
a deduplicated recovery copy when possible and a durable **BAS sync needs review**
notice with exact export/retry; local work is retained. No math/approval is inferred.

Final web **78501 exit 0: 2,742 pass / 13 existing skips**, 23.581 s tests,
5.29 s build. **11 new cases; 85 focused pass**. Five-second history benchmark
initially failed under the full parallel suite; the unchanged budget now runs
serially within `npm run check`: final **3.286 / 3.184 / 3.162 s** for the real
3.5 MB / 31-record retained fixture. MCP **76745 exit 0: 119 BAS + 4 packaging
pass**, types green. Existing warning/One-Click caveats remain. Full standalone
Python and full corpus/holdout were not rerun; no new extraction accuracy claim.

Actual browser **56962 exit 0**, `evidence/sync-history-browser-3`: real Fort Sam
upload + retained history → actual folder composite with origin-private file
transport → controlled competing review → unchanged local/remote histories →
exact recovery download → reload notice → compatible retry. All 31 historical
records and exact active PDF bytes stay intact; no page errors. Six final light/
dark 1280/1440/1920 screenshots visually inspected; dark secondary copy corrected.
This is not a live cloud/OS-sync test or real addendum. See `SYNC_HISTORY_PROOF.md`.

Important research correction: existing Drive/folder providers use app-level
read-then-write revisions, **not atomic server CAS**. Cross-tab in-flight restore
coordination and multi-key adoption bookkeeping remain next; synced ZIP restore
stays gated until those are complete. Continue journal recovery UX, reviewed
drawing correspondence, scoped approvals, A–D corpus/holdout gates, and only then
the appended researched symbol/installed-plan phase. Main goal remains active.
No VectorGrid/symbol/table/cite/bbox/math/key/cost/labor change, push or merge.

## Public MCP archive restoration — 2026-09-10

After **a23054ec**, public MCP now previews and explicitly commits the same shared
restore merge, with mandatory full historical Python replay, retained originals,
previous-state recovery files, exact Session adoption and browser-cargo round-trip.
History-only recovery needs no loaded plan; old sources remain outside active
counting and reopen by exact saved citation. A plain plan load still replaces the
Session; merge-load preserves restored history. MCP **0.9.74 / 50 tools**.

Final built public proof **15192 exit 0**, `evidence/restore-mcp-3`: actual browser
Fort Sam backup → shared preview → commit → exact export → original SOO bbox →
populated-session re-restore → process restart → restore disk-produced ZIP → same
source citation. Each restore replays **3 assembly + 28 engineering** records;
some hardware inputs are disclosed controlled declarations. Final commit times
**15.205 / 19.727 / 15.090 s**; totals with preview/export **24.163 / 30.421 /
23.999 s**. First contended run took 65.446 s; not hidden or compared as a quiet
baseline. Final citation image visually verified, identical to prior inspected PNG.

**12 new MCP tests**, final BAS suite **119 pass** (68306, 43.463 s); broader
Session/conformance/restore **51 pass** (19396, 45.967 s, overlapping). Types,
**4 packaging tests** and tool-count check pass. Full web **19830 exit 0:
2,731 pass / 13 existing skips**, no failures, 19.792 s tests / 5.19 s build;
existing warnings and benchmark caveats unchanged. Standalone full Python and
full corpus/holdout were not rerun in this delivery batch. No new accuracy claim.

Audit found an earlier checkpoint overstatement: folder/Microsoft 365 workspace
composites accidentally inherited local restore by spread, although Drive's
explicit composite did not. That unsafe entry point is now gated; local restore
and original retention remain available. **51 sync/composite/local-restore tests
pass** (15417). This is not completed sync support. Next coordinate in-flight
pushes, deferred adoption and post-adopt metadata before re-exposing restore.

Main A–E goal remains active: synced restore, recovery/journal UX, reviewed
drawing correspondence, scoped approvals and remaining A–D corpus/holdout gates.
The final researched symbol/installed-plan phase remains appended last, not a
replacement. No VectorGrid/table/symbol algorithm, bbox, arithmetic, threshold,
key or costing/labor change. No push, merge or deployment. Details and primary
file-delivery research: `RESTORE_MCP_PROOF.md`.

## Browser-local archive restoration — 2026-09-10

After **01e9b3a4**, actual browser-local restore now uses shared preview/merge and
merged-history Python replay, stages bounded chunks, and atomically publishes
originals + annotations + previous-state journal + new save generation. Exact
filename-bound annotation checks prevent newer-namesake rebinding; historical
PDFs remain outside active counting. The empty plan picker has a recovery entry.
Old retained records still read; ordinary original retention also supports chunks.

**13 new tests; full web 2,730 pass / 13 existing skips / zero failures**, types,
lint, benchmark and build pass (three existing warnings). Real Fort Sam browser
walkthrough **39999 exit 0**, actual 31-record Python replay, restore/cancel/reload/
source reopening, **12.925 s restore**, zero page errors. Controlled 551.1 MB
capacity **21712 exit 0**, **10.953 s restore / 0.960 s verification**, sampled
Chrome RSS **2,052,210,688 bytes**, under unchanged 30 s / 2 GiB budgets with
limited headroom. The earlier single-buffer implementation hit a real Chromium
record-size limit and was replaced, not excused. See `RESTORE_BROWSER_PROOF.md`.
MCP final regression **72865 exit 0**: types, **107 BAS + 4 packaging pass**;
unchanged Python services exercised, full standalone Python suite not rerun.
Final retry audit **74798 exit 0**: full web still **2,730 pass / 13 skips**,
14.399 s tests / 5.35 s build; **40 focused pass** and packaging rerun passes.
Already-applied restore retries now recheck originals instead of trusting the journal.

Main goal stays active: finish public MCP/sync restore and recovery/journal UX,
then reviewed drawing correspondence and scoped approvals; complete remaining A–D
corpus/holdout gates and the final researched symbol/installed-plan extension.
No protected extraction/math change, new corpus result, push, merge or deployment.

## Per-editor save fencing — 2026-09-10

After **4b1c7595**, local annotations now read payload/generation atomically and
refuse writes from an older editor generation. Debounced saves and unmount
flushes capture the original token; unrelated reads/background callbacks cannot
upgrade it. Local-first sync forwards the token and checks expected current
payload before adoption. v4 preserves v3 records and fences old blind-writer
builds. Conflicted editors retain work with explicit export/reload recovery.
This is browser storage delivery, not changed BAS interpretation or arithmetic.

**83 focused tests pass**, including **14 new** generation/migration/sync tests.
Full web **69931 exit 0: 2,717 pass / 13 existing skips / zero failures**,
15.738 s tests, build 5.19 s; final canvas guards **54485** types/lint/build pass,
build 6.69 s. Existing three lint warnings, chunk warnings and One-Click benchmark
caveats remain (16 cross probes / zero disagreements, nine not cross-checked).
MCP **59064 exit 0: 107 BAS pass, 4 packaging pass**, types pass; actual unchanged
Python services exercised. Full Python suite not rerun here. MCP 0.9.73/50 tools.
Final real two-tab browser **83833 exit 0**, zero page errors: actual queued
autosave refusal, second-editor refusal, unsaved JSON export and explicit reload
then successful saves, complete original BAS history/PDF unchanged. Six final
screenshots and proof: `evidence/annotation-generation-browser-5`; full details
and primary storage research: `ANNOTATION_GENERATION_PROOF.md`.

Important boundary: the replacement in that browser proof is a labeled controlled
IDB transaction. **Actual ZIP restoration/generation minting is not wired yet.**
Next implement shared merge/legacy correspondence safety, merged-history Python
replay, operation-owned source staging, one atomic original/state/journal/token
commit and caller hydrate, including in-flight local-first sync coordination,
and actual public UI/MCP restore-to-citation proofs. Ordinary JSON/OTK behavior
is unchanged. Continue E revision/approval and remaining A–D corpus/holdout gates;
symbol deformation/installed-plan work remains appended last. No scope reduction,
new model, VectorGrid/key/scorer change, holdout access, push, merge or deployment.
Historical corpus accuracy/path issues are unchanged, not a new full-corpus pass.

## Exact original-source reopening — 2026-09-10

After **628f047c**, the real UI and built MCP can inspect retained/historical
originals at their exact hash/page/frame without adding old drawings to active
counting. Existing live-source navigation remains unchanged. Same-name replacement,
corruption, frame mismatch, pending-read cancellation, focus return and source-size
bounds have explicit tests. No quantity/history rewrite or approval. Details and
screenshots: `SOURCE_VIEW_PROOF.md`.

Full web **62763: 2,702 pass / 13 existing skips**; final types/lint/build and
**19 focused** source/storage tests **41356** pass. BAS MCP **38175: 107 pass**,
packaging **4 pass**, existing broader MCP **56848: 155 pass**; version **0.9.73**,
50 tools. Python **87696: 443 pass**, configured mypy **19 files**. Built real-source
proof **71644** and unchanged live-citation UI regression **21856** pass. Final
source-reader proof is under `evidence/source-view-browser-4`.

Main goal remains active. Next: actual atomic ZIP restoration, per-editor save
fencing, revision correspondence/review journals and scoped approved snapshots;
remaining A–D and final corpus/holdout acceptance; appended symbol robustness and
installed-plan research last. No model/VectorGrid/threshold/key changes, holdout
access, push, merge or deployment. Historical corpus scores/path failures remain
unchanged, not a new passing corpus gate.

## Full saved-calculation replay — 2026-09-10

After **f20c8e24**, an actual shared Python replay gate now covers every saved
assignment, assembly and engineering result, with exact historical input/head
reconstruction and full-workflow receipts. The browser verified-backup view and
optional MCP archive preflight use it without mutating state. Re-signed wrong
quantities reject even when file hashes and saved-history fingerprints validate.
This closes an E restoration/approval prerequisite, not E itself. Source truth,
VectorGrid, existing calculators and old workflow/JSON semantics are untouched.
Scope, reproducible evidence and current limits: `WORKFLOW_REPLAY_PROOF.md`.

Full web **4580: 2,697 pass / 13 existing skips**, check exit 0; final cosmetic
types/lint/build **19330** passes. Full BAS MCP **9977: 103 pass**, types and
packaging **4 pass**; existing broader MCP **1480: 155 pass**. Full Python with
packaging **62302: 443 pass / 0 skips**, configured mypy **19 source files**.
Final actual Fort Sam UI **53663** passes **3 assembly + 28 engineering** replay,
valid-byte/wrong-math rejection, cancellation and unchanged state; zero page
errors, six theme/size screenshots inspected, 11.492 s whole UI replay. Built
public MCP **81379** produces the same replay receipt and rejects the same
forgery, with no loaded plan needed for preflight and no Session mutation.

Automatic ZIP restoration remains unimplemented. Next close blind annotation
save/queued autosave races, atomically restore required originals and merged
state, reopen exact retained-source citations, then complete correspondence,
review journals and scoped approved snapshots. No checkbox bypasses source/math
integrity. Original A–E and final corpus/holdout acceptance stay first; appended
symbol deformation/installed-plan research remains the last phase, not a
replacement. Historical corpus metrics/23 old-path errors remain unchanged;
no new full-corpus pass or universal-production claim. No push/merge/deploy.

## Source-inclusive unapproved backup — 2026-09-10

After **81e55b2e**, shared `bas_evidence_bundle_v1` archives now include exact
saved takeoff JSON and all historical original PDFs. Browser Original PDFs and
existing MCP export/import tools create and verify this same strict stored-ZIP
format. Digests/lengths/ownership, header consistency and stale/cancelled writes
are checked; missing originals block export. This is an E prerequisite, not
revision/release completion. No extraction, VectorGrid, arithmetic or existing
workflow schema changes. Detailed scope and proof: `EVIDENCE_BUNDLE_PROOF.md`.

Final full web **1355 exit 0: 2,697 pass / 13 existing skips / 0 fail**;
types/lint/bench/build pass (5.75 s build). Full BAS MCP **16081: 95 pass**, plus
types, packaging **4 pass**, all 50 tool names current. Actual Fort Sam browser
**22305 exit 0**: download/verification, exact shared bytes and saved history,
MCP-produced archive verification, cancelled operation, concurrent saved-state
change and corrupt archive refusal; 2.283 s export, zero page errors. Six final
1280/1440/1920 light/dark screenshots inspected. Built public MCP **45611**
also passed source/history parity, inspection without a loaded plan and unchanged
session/ordinary JSON behavior. Full payload IDs differ with legitimate legacy
surface fields; do not misstate complete UI/MCP payload equality.

Controlled capacity tests pass: 165.6 MB single source and 551.1 MB multi-source
Node archives; the same 551.1 MB browser Blob strategy, with measured local
runtime/memory. They do not parse real PDFs or establish installed-count accuracy.
No holdout content/keys accessed. These backups are unencrypted, unsigned and
not Python replay or approval. Automatic full-project ZIP restore, archived-source
reopening, page correspondence, journaled revision decisions, scoped approval and
atomic approved snapshot sealing remain next. Finish original A–E and final
corpus/holdout gates before the appended symbol/installed-plan phase. Historical
corpus scores and 23 old-path errors remain unresolved; no new full-corpus pass.
No push, merge, deployment or new model.

Latest same-size historical lookup regression: full BAS **72396 exit 0,
95 pass / 0 fail/skip**, 12.264 s. Final built MCP **38156 exit 0** repeats
cross-surface archive ownership/state parity, export 3.067 s. One-Click cross
probes remain 16/zero disagreements, IoU floor 0.994/mean 0.999, with nine
single-resolution cases outside the cross-check. These are not full corpus gates.

## Original PDF retention — 2026-09-10

After **3eddc21f**, **Review & changes → Original PDFs** now explicitly retains,
verifies and downloads physical source versions in the current browser project.
Shared ownership/byte validation, project-scoped IDB delivery and exact recovery
are implemented; extraction, VectorGrid, Python arithmetic, old workflow schemas
and default exports remain unchanged. This is an E prerequisite, not completed
revision/release controls. Original five workflows still precede the final
research-gated symbol/installed-plan phase. Proof: `SOURCE_RETENTION_PROOF.md`.

Focused **97188: 40 pass** (including existing storage/composite controls), plus
typecheck. Full first web **56462 exit 0: 2,689 pass / 13 existing skips**, types,
lint, benchmark/build pass. Final layout types/lint/build **65838 exit 0**.
Full existing BAS MCP **76073: 93 pass**, no failures/skips, 23.852 s. Two actual
Fort Sam UI walkthroughs pass with **456 unchanged findings**, original bbox and
history checks, exact PDF downloads, reload and separate ordinary removePdf
transport recovery. Final **31204 exit 0**, 60.676 s, no page errors; all six final
source-view screenshots inspected. Source-view keyboard focus and filter return
are tested. First retention 2.149 s and review first open 5.034 s are single-run
observations, not production speed claims. No new model or Agent key is required.

Availability is verified only for the selected original, at action time. Copies
are not cloud/folder synced, authenticated immutable storage or an approved
source set. Legacy cloud-only mode explicitly lacks this capability. No new MCP
retention command, automatic archived-source citation reopening, combined portable
archive, page correspondence, scoped approval or atomic snapshot seal is claimed.
These remain next in E, with public UI/MCP parity and final full corpus gates.
No holdout access; historical **505/541 takeoff, 99/129 reference, 78/91 cells,
133/138 anchors** and 23 old-path ENOENTs remain, not a new green corpus run.
No push, merge or deployment.

Final full web **67712 exit 0**, `source-retention-web-check-final.log`:
**2,689 pass / 13 existing skips / 0 failures**, 12.168 s test phase,
types/lint/benchmark/build pass; build 5.11 s. Existing One-Click cross probes:
16, zero disagreements, pair-IoU floor 0.994 / mean 0.999; nine single-resolution
cases remain outside that cross check. Not a new full extraction-corpus score.

## Shared project finding queue — 2026-09-10

After **0357cada**, the first read-only E slice is wired through one shared
catalog/projection, the internal **Review & changes** workspace and opt-in public
MCP `bas_project_review`. No extraction, VectorGrid, Python math, existing stored
schema or default compile result changed. This is not E/main-goal completion:
source retention, correspondence, decisions, approvals and release remain.
The five BAS workflows still precede the appended symbol-reconciliation phase.

Proof/limits/reproduction: `PROJECT_REVIEW_PROOF.md`. Final original-PDF browser
**19202 exit 0**, 37.561 s: **456 findings**, exact full export, original page-8
bbox highlight, source/domain return, filters, keyboard and viewport pager checks;
zero page errors. Packaged MCP **6687 exit 0**, 38.951 s: exact browser/shared
projection, structured/text agreement, every existing compile field unchanged,
retained state protected on valid inspection and invalid capture. Five exports
compare identically. Actual-Python tests preserve current failed/excluded checks
and reproduce/fix duplicated capture-wide source coverage after calculation.

Full BAS **38494: 93 pass**. Full web **6893 exit 0: 2,675 pass / 13 existing
skips**, types/lint/bench/build pass. Final layout type/lint **63956** pass.
MCP types/build/tool count/package **30387** pass, including **4 packaging tests**
and byte-identical VectorGrid dependencies. No threshold/key/scorer relaxation.
Failed-first catalog/dedup/browser evidence is retained. Pagination below the
1280/1440 viewport was caught visually and fixed using a review-only flex region.

Performance is not finished: final browser first open **4.740 s**; warm public
compile+inspection **6.063 s** with concurrent verification. Do not call it fast
or production-complete. Isolated profiling/identity-preserving optimization and
broader correction/navigation/cancellation coverage remain required. No new full
corpus metrics or holdout access; historical 505/541 takeoff, 99/129 reference,
78/91 graph cells and 133/138 anchors plus 23 old-path ENOENTs remain disclosed.
No push, merge or deployment. Next: finish the full E contract and remaining
source/corpus gates, then the researched final symbol/installed-plan phase.

## All-family engineering forms verified; revision contract — 2026-09-10

This is a test/research checkpoint after **eb18c7ad**, not completion of the main
BAS goal. No production code, extraction, VectorGrid, Python arithmetic, saved
contract, pricing or labor behavior changed. Shared-path gate: this code is
**test-only**. The existing explicit resource maps/controlled Python cases now
have one reusable fixture provider; all prior ownership/export assertions remain.
The new browser harness uses the actual UI and shared Python service, not injected
responses or React state. No push, merge or deployment.

Verified terminal evidence:

- Focused ownership families **91780 exit 0**, `engineering-forms-fixture-1.log`:
  **11 pass / 0 failures / 0 skips**, 3,945.7795 ms. Full BAS MCP **14338 exit 0**,
  `engineering-forms-bas-1.log`: **90 pass / 0 failures / 0 skips**, 15,954.567375 ms.
  MCP types **20520 exit 0**. Browser script syntax and `git diff --check` pass.
- Original Fort Sam PDF, same source hash as the preceding engineering proof:
  browser **95611 exit 0**, `engineering-families-browser-3/checks.json`,
  **414,038 ms**. All **11 families / 12 check records / 451 field-and-list
  observations / 16 UI-recorded decisions** passed. Every family retains exact
  inputs, prior history, original captures/equipment/assemblies, and exact JSON
  export/reload. Preview does not persist; recording goes through actual Python;
  no page errors. This is harness duration, not interactive response latency.
- Nested power-state edit produces `power.scenario.operating` failure with
  **65 VA known load against 50 VA usable capacity**; correction passes. Duplicate
  serial address produces `serial.addresses_unique`, `duplicate_addresses: 1`;
  correction passes. Both failed events remain in history/export. A separate
  read-only post-run assertion checked those exact failed rule IDs/normalized
  values, the following pass and the overall recorded counts.
- All **12** power/network screenshots inspected: light/dark at 1280, 1440 and
  1920. Visible controls/labels are legible and have no page-level horizontal
  overflow. These are deeply scrolled form views, not full-form overviews; the
  serial screenshots do not show the complete selected-node form at once.
  Field accessibility/value assertions, not screenshots alone, verify traversal.
- Setup failures are retained. Run 1 **76819 exit 1** completed signal then failed
  analog import. Pure shared import reproduced the correct rejection of a
  divergent engineering history: the harness branched from the original baseline
  instead of continuing the saved signal event. Fix: continue the actual saved
  history, not relax importer validation. Run 2 **5883 exit 1** completed signal
  then waited for an absent gallery; its failure screenshot shows the correctly
  restored canvas. Fix: use the existing conditional imported-sheet helper after
  verified graph readiness. No production fix, assertion removal or deadline
  extension was used. Run 3 completed every family.

Coverage boundary: one original development PDF with controlled capability inputs
bound to its reviewed equipment. This tests all-family form fidelity and selected
correction journeys, not UI creation from blank for every family, discovered
hardware ratings, independently new arithmetic truth or eleven real projects.
Broader real-source grounding and final public/corpus/holdout gates remain.

Workflow E research now has a concrete pre-implementation contract in
`REVIEW_REVISION_CONTRACT.md`, with the code/primary-source findings retained in
`REVIEW_REVISION_AUDIT.md`. It specifies issue actions that cannot dismiss a
failed constraint into pass; explicit source-set/page accounting; independent
source/semantic/quantity changes; selective dependency invalidation; atomic
source-retaining snapshots; and honest local identity/storage limits. It is not
implemented. Metadata-only addendum leads do not yet establish real revision
pairs. No holdout bodies/keys opened for this checkpoint.

No fresh full extraction-corpus run for test/docs-only changes. Prior **505/541
takeoff, 99/129 reference, 78/91 graph cells / 133/138 anchors**, including 23
old-path ENOENTs, remain the disclosed baseline, not newly green shipping metrics.
The standard doc-link gate still covers 31 top-level documentation files; new
nested contract references are checked separately. Next: source-backed coverage
and E's shared issue catalog/source-retention implementation, followed by complete
revision/approval UI and MCP journeys. Finish the five workflows before the
appended symbol-engine implementation phase.

## Saved engineering review export — 2026-09-10

The original five BAS workflows remain the priority; the final symbol phase has
not displaced them. This checkpoint completes the bounded saved-engineering
workbook contract, not workflow D's full real-document coverage or workflow E's
approved deliverable. Prior checkpoint is **f5059580**, following **0f8fcd72**.
No push, merge, deployment, extraction algorithm, VectorGrid threshold/bbox,
Python engineering math, pricing or labor change.

Shared-path gate: **yes** for the single saved-review projection, unchanged
engineering labels, lossless text transport and opt-in XLSX formatting consumed
by UI and MCP. **No** for the browser download, cancellation interaction or
atomic filesystem delivery. The existing JSON contract/default XLSX sheet XML
remain unchanged. Workbook history retains original inputs and constraint paths,
decimal strings, null/zero distinctions, exclusions, withdrawn owners, current
versus stale dependencies, source spans and resource-applicability findings.
The workbook is explicitly not an approved release or installed/design proof.
The source archive remains the JSON plus original PDFs.

Verified terminal evidence:

- Full web **74622 exit 0**, `engineering-export-web-check-3.log`: **2,670 pass /
  13 existing skips / 0 failures**, 16,680.478667 ms test phase; types/lint (three
  existing warnings), bench and build pass; build 5.28 s. Earlier full check 1
  passed. Check 2 exposed an ES2020 `replaceAll` typing incompatibility in a new
  presentation label; equivalent regex replacement fixed it without changing
  the project target or interpretation.
- Full BAS MCP **13770 exit 0**, `engineering-export-bas-final-3.log`: **90 pass /
  0 skips / 0 failures**, 12,764.668875 ms. Final MCP types **99073 exit 0** and
  build pass. Three new export tests plus exact input/result projection checks
  across all eleven existing Python engineering families. Actual Python replay,
  excluded failures/unknowns, source/owner history, stale receipts, hostile text,
  atomic file preservation and concurrent in-place Session mutation are tested.
- Real Fort Sam development PDF browser **27124 exit 0**,
  `engineering-export-browser-4/checks.json`: **27,207 ms**, zero page errors.
  Cancelled actual HTTP/Python replay produces no download; draft/history remain
  exact. Retry exports saved values only. A newer ordinary import rejects a late
  response without a stale download. Light/dark 1280 screenshots inspected.
  Earlier browser attempts 1/2 passed cancellation and workbook equality then
  failed harness navigation after import reset the equipment detail view. Import
  does not close Takeoff. Attempt 3 passed after using the existing review entry;
  no production navigation behavior was changed to satisfy the test.
- Packaged public MCP **85326 exit 0**,
  `engineering-export-package-3/checks.json`: **13 XML/ZIP parts exactly equal**
  to the actual browser workbook, **11,917 bytes**, **4,623 ms**. Saved Session
  history and legacy inline JSON stay unchanged; prior XLSX files are protected.
  Initial packaged attempt reproduced missing `fflate`; it is now an explicit
  runtime dependency, the same 0.8.3 already used by web. Standalone lockfile also
  synchronizes the already-declared runtime `tsx` classification, not a new
  version selection. An intermediate optional-esbuild installation failure is
  retained; restoring optional platform dependencies preceded the two full
  successful 90-test runs. No missing assertion was skipped.
- Independent read-only workbook import/inspection **61848 exit 0**,
  `engineering-export-artifact-4/verification.json`: **382 populated cells across
  eight sheets** match the shared projection; no formulas or spreadsheet error
  matches. All eight sheet previews inspected (seven prior-sheet definitions
  explicitly equal to the already inspected artifact-3; new Findings inspected).
  The reader's ISO-date coercion is compared as exact UTC text, not a production
  data change. New Findings retains `scope_partly_unknown`, so numeric success
  cannot hide that limitation. The spreadsheet skill informed this independent
  readback and visual QA; no spreadsheet-calculation library entered production.
- Documentation link gate: 31 files; `git diff --check` passes. Tool count remains
  50; all three package version surfaces remain 0.9.72. No publish requested.

Failures and intermediate evidence remain retained. This is one real-PDF saved
history with controlled counterpart inputs, not automatic hardware discovery,
all-family real-project coverage or a real addendum. No new full extraction
corpus run for this export-only batch: previous **505/541 takeoff, 99/129 reference,
78/91 graph cells and 133/138 anchors**, including 23 old-path ENOENTs, remain the
disclosed baseline, not newly green shipping metrics. Final corpus/holdout gates
remain required. Next: finish the remaining engineering real-document journey,
then coherent review/revision/readiness/approved-snapshot controls using existing
shared capture and decision history. Do not fork those truths into the UI.

## User extension and current priority — 2026-09-09

The user explicitly added a final research-gated phase for deformation-tolerant
symbol extraction and installed-plan reconciliation, then reaffirmed that the
main five workflows must be finished first. The detailed acceptance file
`docs/BAS_PRODUCTION_GOAL.md` now records that sequence and its no-training,
accuracy, speed, evidence and VectorGrid-preservation gates. The original goal
tool's short objective still says five workflows; the referenced detailed goal
and the latest user instruction govern this additive extension. Initial primary
research and code findings are saved in `SYMBOL_RECONCILIATION_RESEARCH.md`;
research is not complete and no symbol/extraction implementation has begun.

Main-goal implementation checkpoint is local commit **0f8fcd72**. The browser
race checks now have two consecutive complete passes. Failed-first evidence:
**97414 exit 1** completed cancelled
preview, cancelled record, and exactly-one-event retry/export/reload checks,
then timed out opening a second workspace. Unchanged rerun **76048 exit 1**
timed out during initial ordinary-import persistence (five full-payload polls
in 30 seconds), with no page errors. Both failed-run evidence directories are
retained. Cause is not established; investigate setup/poll/renderer timing,
without extending deadlines or weakening state-equality assertions. The
delayed response across newer-import case was still unverified at that point.

Adding timing observations only, without changing assertions, deadlines,
production code, or the full-payload polling strategy, produced **94873 exit 0**
(`engineering-browser-races-3/checks.json`, **39,635 ms**) and an unchanged repeat
**74627 exit 0** (`engineering-browser-races-4/checks.json`, **39,353 ms**).
Both verify actual HTTP/Python response delivery after cancellation, exact
preserved history/drafts, exactly one event after explicit retry, rejection of
late recording across an ordinary controlled newer-equipment import, and exact
JSON export/reload. Zero page errors. Both race-3 screenshots were inspected.
Full persisted-workflow reads in race-3 were generally 1–487 ms, with a 2,533 ms
outlier; this does not establish the cause of the two earlier setup timeouts or
prove they are repaired. These are controlled transport/decision scenarios,
not real addenda or all failure modes. The harness passes `node --check`.
Focused shared service/review gates **89363 exit 0**:
`engineering-race-focused-mcp-1.log`, **15 pass / 0 skips / 0 failures**,
8,229.125833 ms. This includes a 1,001-event batch-boundary replay with rejection
of corruption in the final batch. The existing 31-file documentation link gate
and `git diff --check` pass. No full extraction corpus rerun was needed for
this documentation/browser-harness-only checkpoint; baseline metrics above
are not new results.

JSON preserves
engineering history; spreadsheet export completeness and workflow E remain
pending. No push, merge, deploy, pricing/labor or VectorGrid algorithm change.

## Packaged VectorGrid loading and engineering parity — 2026-09-09

This checkpoint supersedes pending/live statements in the preceding entries.
The full five-workflow goal remains incomplete. Nothing was pushed, merged,
published or deployed.

The user explicitly approved **packaging/loading only** after reproduction of
the bundled MCP mismatch. The source-run client resolved `sidecar/tables.py`
correctly; esbuild's bundled `import.meta.url` resolved the same parent traversal
outside the package, where that file did not exist. Packaged MCP therefore
skipped VectorGrid and returned different fallback tables/capture identities.
Consumer rounding, sorting away distinctions or relaxing bbox/history equality
would hide the defect and was not used.

Shared-path decision: **yes** for the runtime locator used by the existing
shared client and its graph-build cache dependency. **No** for package copying,
verification diagnostics and CI wiring. The six existing Python runtime files
are copied byte-for-byte, with no extraction, threshold, coordinate, symbol,
Python engineering arithmetic or optional vision-sidecar change. Package and
source layouts are explicit; missing package assets do not fall back into an
unrelated parent checkout. CI/prepublish now run the packaging regression gate.
Primary references rechecked: [esbuild bundling](https://esbuild.github.io/api/#bundle)
and [Node module URL](https://nodejs.org/api/esm.html#importmetaurl).

Verified terminal evidence:
- Full web **60382 exit 0**, `engineering-provenance-web-check-1.log`:
  **2,665 pass / 13 existing skips / 0 failures**, test phase 35,187.059542 ms;
  types/lint (three existing warnings), bench and build pass; build 10.84 s.
  Earlier web run 80830 also reached successful bench/build in its retained log.
- Full Python **13837 exit 0**, `engineering-ui-python-check-2.log`:
  **438 pass**, 10.00 s; mypy **18 files**. The preceding unchanged child-timeout
  failure and focused successful retry remain disclosed below.
- Provenance/editor tests: **8 pass**, with own-property-safe exact nested input
  reads and 10,001-result pagination retaining the last failure. UI labels
  distinguish explicit inputs, manual drawing transcriptions, recorded inputs
  and unknowns; no declaration is relabeled automatic extraction.
- Browser **2640 exit 0**, `engineering-browser-4/checks.json`: **81,087 ms**,
  both themes at 1280/1440/1920, no page errors; exact saved-input source jump
  and return, ordinary export/import in a fresh context, controlled equipment
  withdrawal and retained/stale engineering access. Prior evidence remains
  unchanged. Counterpart inputs are controlled, not discovered hardware.
- Packaged proof 2 terminated unsuccessfully; proof 3/4 exposed the exact
  2-versus-1 capture mismatch after replacing enormous assertion formatting
  with bounded diagnostics. Equality still uses Node's strict deep comparison;
  keys, scorers, expected evidence and thresholds were not weakened.
- Packaging **77470 exit 0**, `vectorgrid-package-tests-1.log`: first three
  packaging/diagnostic tests and MCP typecheck pass. The added negative missing-
  asset test, CI wiring and standalone actual-Python gate are pending rerun.
- **6174 exit 0**, `engineering-public-mcp-5/checks.json`: packaged public MCP
  **64,698 ms** (whole command 68.49 s), ordinary browser-4 evidence import,
  exact initial capture/workflow retention, Python replay, Agent proposal with
  exact UI result, history preservation, legacy-output equality, idempotent
  retry, atomic foreign-source rejection and export/reset/import/replay all pass.
  `/usr/bin/time -l` max RSS **921,124,864 bytes**; one-second sampled parent
  **537,024 KiB**, server **885,696 KiB** (not simultaneous/exact peak totals).
  This is one real source-note case with controlled counterpart ratings, not
  all rule families, design certification or production completion.
- Final loading gates: **54929 exit 0**, four packaging/diagnostic tests,
  two cache tests and MCP types. **5594 exit 0**, 30 existing adapter/pipeline
  tests and web types; real sidecar-error disclosure still passes. **63255
  exit 0**, four packaging tests plus packaged stdio smoke. The npm dry run
  first exposed generated bytecode from the public walkthrough; build now
  recreates only `dist/python/vectorgrid`. The final dry run lists exactly six
  byte-identical `.py` files, no stale bytecode or unrelated assets. This removed
  generated copies only; all originals remain available to rebuild.
- **21737 exit 0**, `vectorgrid-runtime-parity-1/checks.json`: standalone Python
  outside the checkout, 6 selected pages, **29 tables / 2,390 cells**; exact full
  source/package replies and first/repeated requests agree, including bboxes,
  cell text, rows/columns/spans and diagnostics. Missing PDF input remains an
  RPC error in every process. Cases: two Fort Sam development pages, dense
  Vermillion page 19, bundled finish-plan control, raster-schedule and symbol-
  only fixtures (both return 0 vector tables). This is parity, not new ground
  truth or a blind holdout claim. Runtime **92.11 s**, max RSS **461,783,040
  bytes**. The finish control was slower (source first/repeated 16.262/17.544 s,
  package 22.216/16.795 s); these are observations, not a latency equivalence
  claim. No extraction performance heuristic or timeout was altered.
- Final BAS MCP rerun **41918 exit 0**, `engineering-loading-mcp-check-1.log`:
  **87 pass / 0 skips / 0 failures**, 33,175.028541 ms; types and 50-tool-count
  checks pass. All six browser-4 theme/width screenshots have now been visually
  inspected; long original-input details scroll inside the existing workspace.

Legacy corpus **77284 is terminal**, 5,460.9 s, with unchanged starting metrics:
takeoff **505/541** exact (applicable installed **470/499**); honest refusals
**7/14**, raster **28/28**, abs delta **74**, missing **18**, key-unlisted **53**
(not all independently verified false additions). Reference **99/129** with
30 ITD misses. Graph **78/91 cells** (0 wrong, 13 missed) and **133/138 anchors**
(0 unexpected, 5 missed). Table discovery: Bessemer **6/11**, 5 missing,
3 key-unlisted; six other core sets unkeyed; **23 historical-path ENOENTs**.
This matches the documented baseline, not a clean corpus pass. Source imports
changed while it ran, so it is not a final fixed-commit engineering gate.
Missing mappings remain unmodified, with unique hash matches already audited.

Next: coherent local checkpoint; then remaining dense/all-family UI,
cancellation/late response, non-commercial
workbook exports, additional real-source coverage and A/B/C/E/revision/holdout
acceptance. No algorithm change is authorized by the packaging approval.

## Engineering UI/public integration — active verification, 2026-09-09

The intervening research/journey explanations were status-only, not new
implementation. The integration continuation made concrete changes; this entry
records current evidence without claiming workflow D or the full goal complete.

Shared-path decision: **yes** for review/inspection contracts, response binding,
source/resource ownership and public compile integration; **no** for field forms,
pagination, draft/disclosure state and download interaction. Shared Python math,
VectorGrid, extraction, symbols and legacy quantity algorithms are unchanged.

Implemented on the isolated branch (uncommitted pending final gates):
- Selected-equipment Engineering workspace covering all eleven strict check
  shapes, nullable ratings, declared equipment-owned resources, exact drawing
  text selection and existing bbox navigation. Nested required scenario ratings
  use the same source picker as nullable ratings. New declarations do not pick
  numeric ratings/modes. Arrays use one-entry editing and reference searches are
  bounded; multiple related check/resource repairs can be staged before save.
- Shared HTTP/CLI `review` and read-only `inspect`, plus public BAS compile
  `bas_engineering_review` / `bas_engineering_inspect`. Browser acceptance binds
  request, response, loaded-PDF signature and workspace epoch before saving.
  Preview never persists. Calculation replay remains separate from dependency
  freshness; the receipt is transient view state, not an approval in exported JSON.
- Saved register/event summaries do not silently label changed staged inputs
  with an old result. Histories and exclusions remain retained. UI source
  disclosures survive citation return. Editing no longer repeats the empty
  check table above the active form. Existing design tokens are reused.
- Development documentation and version surfaces are synchronized at 0.9.72;
  tool count remains 50. Nothing was pushed, published, merged or deployed.

Verified evidence:
- `engineering-editor-tests-1.log`: **5 pass**; all eleven nested schemas,
  nonnullable rating rendering, exact immutable staging, preview invalidation
  and 10,000-entry windows. This is controlled editor coverage, not PDF truth.
- `engineering-integration-tests-2.log`, **97947 exit 0**: **3 pass**, 15,255.98 ms;
  actual HTTP/CLI/Python review/replay, changed/malformed/foreign requests,
  production compile legacy equality, Agent origin, idempotent retry and
  concurrent/replaced Session rejection. Typechecks pass after correcting only
  new test typings; the first typing failures remain in the preceding logs.
- `engineering-ui-mcp-check-1.log`, **40205 exit 0**: **87 BAS MCP tests pass**,
  zero skips/failures, 126,436.595 ms; types, 50-tool count and package build pass.
- `engineering-ui-legacy-stdio-1.log`, **71814 exit 0**: packaged legacy BAS
  SOO/hardware/license/serial/IP and typed/text parity still pass.
- Browser run 1 failed on an ambiguous test field locator. Explicit accessible
  field names resolve it. **85658 exit 0**, `engineering-browser-2/checks.json`:
  61,044 ms, actual original Fort Sam upload plus ordinary prior-review import,
  two explicitly controlled ports, unknown/no-save preview, note-10 citation
  navigation/draft return, controlled signal pass/save, retained earlier
  histories, exact JSON export, reload and shared Python replay; no page errors.
- **11367 exit 0**, `engineering-browser-3/checks.json`: repeat after layout,
  disclosure and transient receipt fixes, **255,840 ms**, both themes at
  1280/1440/1920, zero page errors. The slower concurrent run is retained, not
  substituted with the faster timing. Screenshots include the original note's
  actual bbox paint. This checks direction/mode only, not the full 0–10 V range
  or waveform, all engineering families, automatic capabilities or installation.
- Full web **80830 remains live** at this checkpoint: **2,662 pass / 13 existing
  skips / 0 failures**, test phase 131,765.09 ms; types/lint pass (three existing
  warnings). Bench/build have not yet completed. Do not call the full check green.
- Python **30892 exit 1**: **437 pass / 1 fail**, 79.23 s. The `power` actual
  child-process parity case exceeded its unchanged 10-second timeout. Focused
  rerun **92007 exit 0**, same assertions/timeout: **1 pass**, call 0.82 s,
  total 1.50 s. No Python code, threshold or timeout changed; full rerun remains.
- Packaged real-PDF public-MCP proof **12601 exit 137**, during initial compile
  after load/import. Parent and child confirmed terminal. No successful
  engineering public-PDF result yet; SIGKILL cause is not established by that
  exit code. Retry only with measured resources and without competing gates.

Same legacy corpus **77284** remains live and has moved beyond NAVFAC into
remaining sets. Graph stays **78/91 cells / 133/138 anchors**, zero wrong or
unexpected; full takeoff/reference finals remain pending. The 23 missing table
paths are still untouched. No new corpus/holdout key or scorer changes.

Next: finish active gates; repeat full Python unchanged; measure/retry packaged
public-PDF MCP; verify dense/all-field form interaction, cancellation and late
response UI handling; make retained engineering accessible after equipment
withdrawal; complete non-commercial engineering workbook exports, additional
real-source rule-family coverage and remaining A/B/C/E/revision/holdout gates.
Restore only isolated missing input mappings after 77284 is terminal, using the
existing hash-matched audit. Keep the full five-workflow goal active.

## Engineering ownership, history and replay checkpoint — 2026-09-09

The preceding research-status reply was **no progress** on implementation.
This continuation revalidated the worktree and the same live corpus handle,
then implemented and tested the shared review dependency. The complete five
workflows remain the goal; public engineering/UI and remaining A/B/C/E gates
are not complete.

Shared-path decision: **yes** for declared resource/source ownership, review
history, dependency freshness, response/request binding and Python replay. No
new browser arithmetic, extraction/VectorGrid/graph/symbol change, product/model,
installed-count inference, public tool, deployment or external infrastructure.

New `basEngineeringRegister.ts` binds every check to selected declared resources
and registered equipment/scopes, optionally to owned assembly components. Exact
selected source-span wording, IDs and bboxes remain retained. All eleven Python
families have explicit ownership coverage; exclusions and unknown conditions
remain issues without removing the check or its outcome. Explicit inputs and
manual transcriptions remain disclosed decisions, not automated source truth.

Workflow `bas_engineering_6` retains append-only events containing the register
and actual Python result together, pinned to capture, equipment, assembly and
SOO review heads. The internal shared service validates, calculates, retries
idempotently and preserves older history. Browser-safe integrity validation
reports `requires_python_replay`; the Node service recomputes complete histories
before `verified_shared_python_replay`. Re-hashing a forged result is not enough.
Replay batches are count/byte bounded; identical inputs compute once per batch,
but every saved result is compared in full. Local hashes are not authentication.

Two reproduced defects were corrected on this new path:
- Opening an unreviewed engineering view after equipment withdrawal attempted
  to validate a stale assembly against the new empty equipment register. It now
  discloses the stale dependency without rebasing or crashing.
- Response acceptance originally checked retained-history equality but did not
  bind to the exact submitted request. The browser-safe shared assertion now
  checks request and origin as well as preservation; substituted responses reject.

Focused evidence:
- **29235 / 86040 exit 0**: initial web/MCP typechecks.
- Ownership unit tests: **4 pass**, `engineering-ownership-tests-1.log`.
- Python replay **45553 exit 0**: **8 pass / mypy 18 files**. Initial test
  incorrectly reused one mutable object 100 times; fixed the fixture to use
  independent records without weakening the expected last-record rejection.
- Initial service run **27440 exit 1**: 8 pass and the reproduced stale-assembly
  failure. Follow-up **70130 exit 0**: 20 pass plus MCP typecheck.
- Boundary test **86743 exit 1** reproduced response/request acceptance failure.
  The SOO fixture also lacked a required equipment reference; corrected the
  controlled fixture, not production association validation. Its deliberately
  empty matrix tests history invalidation, not point extraction coverage.
- **8925 exit 0**: **23 ownership/service tests pass**, zero skips/failures,
  **28,120.14 ms**, MCP typecheck/build pass. Includes all eleven families,
  source/owner/role negatives, SOO creation/correction/removal, stale equipment
  and assembly state, capture switching, fork/import/retry, source preservation,
  actual IndexedDB round trips, response substitution and forged math.
- Controlled dense history: **1,001 events / 5,363,092 serialized bytes**,
  successful full-history replay **2,312.3 ms** in the focused run. A re-hashed
  corruption in the final batch rejects the entire history. This is a bounded
  synthetic history test, not real addendum or production peak-memory proof.

Full gates:
- **76181 exit 0**: **438 Python tests pass**, zero skips/failures, **33.49 s**,
  explicit `OT_BAS_VERIFY_PACKAGE=1`; mypy passes **18 source files**.
- **69564 exit 0**: **84 BAS MCP tests pass**, zero skips/failures,
  **38,372.90 ms**. New tests are registered in normal `test:bas`.
- **44497 exit 0**: rebuilt packaged legacy real-stdio smoke passes for SOO,
  hardware/license, serial/IP and wire parity.
- Full web **56704 exit 0**: types/lint and **2,657 tests pass / 13 existing skips /
  0 failures**, **51,371.80 ms** test phase. Existing three lint warnings.
  All existing benchmarks pass; build passes in **9.83 s**, existing chunk-size
  warning. This verifies the internal dependency, not a new real-browser journey.
  The first web attempt failed on a new test-fixture property typo (`sources`
  instead of `documents`), corrected before this passing test phase.
  One test title was subsequently clarified from source-version switching to
  **capture switching**, because it does not claim real addendum validation;
  its unchanged assertion passes in `engineering-review-capture-switch-1.log`.

Same **77284** corpus run remains live, with the NAVFAC child confirmed using
CPU. No restart or path-manifest modification. Graph **78/91 cells / 133/138
anchors**, zero wrong/unexpected, matches documented starting misses; table
phase remains incomplete due to 23 historical-path failures. Takeoff/reference
finals remain pending. This running legacy component-list regression is not a
fixed-commit final gate for the new complete engineering workflow.

Next: complete selected-equipment engineering editing, exact response/live-state
acceptance, public UI/MCP service entry points and retained non-commercial
exports; actual original-PDF journeys across the rule families and themes; then
remaining coverage, review/revision/release, applicable full corpus and untouched
holdout acceptance. Restore isolated missing input mappings only after **77284**
is terminal, using the existing 23/23 hash-matched audit. No success criterion,
source key or threshold has been changed. No push, merge or deployment.

## Shared engineering transport checkpoint — 2026-09-09

Network dependency committed locally as **516476ea**. This continuation also
implemented strict shared TypeScript shapes for all eleven Python check kinds,
original evidence/decimal/null retention, response lineage/status guards and the
internal `runBasEngineering` wrapper over the existing bounded `basMath.ts`
process. No arithmetic was duplicated in JS. Python still validates dimensions,
relationships and numeric constraints; a JS shape parse is explicitly not a
source-ownership or save-authorization gate. No public MCP verb or UI action.

The new controlled cross-language tests reuse Python fixture builders only for
transport parity, not independent source truth. All eleven families round-trip
through actual Python with exact original/result equality. Negatives cover
missing/failed characteristics, wrong dimensions and duplicate checks, substituted
input reasons or network identities, omitted/reordered checks, missing constraints, invented
passing summaries and unavailable/cancelled/timed-out runtimes. A first test
expected detailed dimensional error wording; Python correctly returned its
sanitized error. Fixed the expectation, not error handling. Strengthened malformed
number tests to require direct schema rejection (including trailing CR/LF), not
just a later runtime rejection: **32428 exit 0**, one focused test pass.

Gates:
- **24538 exit 0**: **61 BAS MCP tests pass**, zero failures/skips, **51,371.66 ms**;
  MCP typecheck and build pass. New 17 tests are in normal `npm run test:bas`.
- **16522 exit 0**: standalone web typecheck pass.
- **44122 exit 0**: full web check, **2,653 pass / 13 existing skips / 0 failures**,
  **109,132.64 ms** test phase; types, lint, existing benchmarks and build pass.
  Build **18.96 s**, existing large-chunk warning. Build reports Agent API key
  unavailable; no model/Agent invocation was needed or claimed in these gates.
- **77535 exit 0**: rebuilt packaged MCP real-stdio legacy smoke preserves
  SOO-only, hardware/license, serial/IP and text/structured response parity.
- Previous Python checkpoint remains **430 pass / mypy 17 files**, including
  packaged-byte verification. No Python change after that gate.

The unchanged legacy regression **77284** is still live. New transport imports
and test registration were added while it ran; the calculators are not invoked
by the legacy scored extraction path. This run is the existing component-list
regression, not a fixed-commit final gate for the new complete engineering
workflow. Final full-scope regression after integration remains mandatory.
Graph is **78/91 cells, 133/138 anchors**, zero wrong/unexpected; takeoff/reference
remain pending. Table phase is incomplete with the 23 missing historical paths.

Read-only recovery audit found **23/23 unique archived files** with bytes matching
the retained corpus inventory SHA-256 values. See
`evidence/corpus-path-audit-before-repair.json`. No manifest/PDF/key was edited,
and no holdout interpretation was performed (file identity only). Once **77284**
terminates, use these verified paths to repair only isolated input mappings.
Do not claim identity with unavailable historical bytes beyond what the retained
inventory proves; keep existing baseline errors and future per-document deltas.

Next is actual source/asset ownership and durable engineering review: bind every
check to registered equipment/scopes and selected assembly components, pin capture
and dependency heads, retain original source wording and reasoned corrections,
and require Python validation before saving. Imported calculations need shared
Python replay before being accepted as current—not merely a locally reproducible
hash. Then complete the selected-equipment UI and public MCP journey, and all
remaining A/B/C/E, real-PDF, corpus and untouched-holdout gates. No reduction of
the five-workflow goal, new infrastructure, push, merge or deployment.

## Declared network dependency verified — 2026-09-09

The preceding research-status answer was **no progress** on implementation. This
continuation re-read the full goal/instructions, revalidated the actual worktree
and the same live **77284** handle, and completed the unfinished shared Python
network dependency. No VectorGrid, extraction, graph, symbol, legacy network
solver, web or MCP source changes were made in this checkpoint.

Serial/IP constraints retain physical port/scope/settings/address declarations,
explicit budgets and partial route data. Existing `serial_partition` and
`ip_switches` supply their unchanged results/diagnostics. Known failures survive
missing inputs; duplicate cross-check ports and canonical IP addresses reject
allocation; separate explicit address domains remain independent. An IP literal
check is not subnet, routing, BBMD/SC or protocol-address-family certification.

Three new tests reproduced erroneous selected-capacity outcomes: unknown port
kind counted as definite demand (serial and IP), and a serial software variable
receiving a passing device-capacity row. Corrected the shared dependency to use
known physical demand, preserve unknown prerequisites and fail nonphysical
consumers. The unchanged legacy calculators were not patched.

Verified evidence:
- **3265** focused pytest: **123 pass in 3.48 s**. Its following mypy invocation
  omitted the required config and traversed build artifacts; that failed log is
  retained. Correct invocation **40560 exit 0**, mypy **17 source files**, uses
  `--config-file bas_engine/pyproject.toml`.
- MCP build succeeded. **46556** then failed pytest collection because it ran
  from `mcp/`; the failed log is retained, no production fix made for that error.
- Correct application-root run **65649 exit 0**,
  `engineering-network-python-2.log`: **430 pass, zero failures/skips, 36.33 s**,
  `OT_BAS_VERIFY_PACKAGE=1`. Includes current packaged-source bytes/import and
  actual Python process parity, all earlier cases, and network scenarios.
- **35735 exit 0**, `engineering-network-mcp-1.log`: all existing **44 BAS MCP
  tests pass**, zero skips/failures, 35,786.48 ms.
- Dense 1,000-address controlled case accounts for missing addresses once,
  retains 6,002 constraints and stays under 4 MB serialized; this is a bounded
  output test, not yet a full UI or production peak-memory benchmark.

Legacy run **77284** remains live, not restarted. Graph finished in **1517.5 s**:
**78/91 cells**, zero wrong cells; **133/138 symbol anchors**, zero unexpected
matches. The 13 Baker ceiling misses and five Bldg5406 misses match the documented
starting baseline. Takeoff/reference are still pending (active NAVFAC child).
Table discovery is still incomplete: Bessemer **6/11**, five misses/three
key-unlisted additions, six unkeyed core sets and **23 historical-path ENOENTs**.
Repair only isolated input-location mappings by verified content identity once
this run terminates; never edit ground truths to fit output.

Next: shared source/equipment/component ownership, typed transport, register and
append-only history; then actual UI/MCP review/reload/export journeys, remaining
A/B/C/E acceptance and full applicable corpus/holdout. The numeric/network
dependency alone does **not** complete D. No new UI/MCP action, merge or push.

## Engineering calculator dependency — 2026-09-09

The preceding “What's after this?” answer was status-only: **no progress**.
This continuation revalidated the isolated `codex/bas-math-engine` checkout,
read the full goal/instructions, and polled the same **77284** regression handle
live. No duplicate corpus run was launched. Original PDFs/keys and holdout remain
untouched. New code is entirely in the shared Python engineering dependency and
its exclusive process envelope; no web/MCP source, VectorGrid, graph or symbol
logic changed.

Implemented `engineering_units.py`, `engineering_contracts.py`, `engineering.py`:
source-retaining typed ratings; exact decimal/rational dimensional comparisons;
signal direction/mode, analog ranges/excitation, declared series/parallel/effective
resistive loading, contact/pulse characteristics, explicit operating/startup/off
power scenarios, torque/close-off/fail/environment checks, physical-terminal
allocation and expansion constraints. W/VA conversion requires that scenario's
explicit power factor. Unknown ratings never default to zero or a passing result;
known failures survive other missing inputs. Cross-check endpoint mode/direction
conflicts and terminal/endpoint reuse cannot pass as independent rows. A supply
cannot be split into separate partial-load checks. Expansion power references
the same-base/pool power calculation covering every module. Extreme exact
rational complexity rejects explicitly, never rounds to a passing boundary.

Primary-source research continued during implementation: UFGS interface/expansion
and actuator distinctions; NIST exact force/length/unit definitions; DOE real vs
apparent power. The next network dependency was researched against official
BACnet addendum ce, Modbus serial V1.02 and TI RS-485 references, recorded in the
compatibility contract. Reference examples are not project defaults. The real
M-601 independent key supplies only the signal requirement; its calculator test
retains original wording and source IDs and treats missing counterpart ratings
as unknown. This fixture-backed test is **not** a new live source/UI walkthrough.

Verified:

- Final **62381 exit 0**, `engineering-kernel-python-final.log`: **307 pass,
  zero failures/skips, 20.98 s**, with `OT_BAS_VERIFY_PACKAGE=1` after MCP build.
  Includes the prior 174 Python cases, new negative/boundary/identity cases,
  exhaustive small declared load/topology scenarios, nine real Python process
  comparisons, malformed/oversized payloads and actual packaged-source parity.
  Original request and repeat/JSON replay are checked. No installed count or
  full D-workflow coverage is inferred from these test counts.
- Final mypy: **16 source files**, no issues. An earlier pass had 306 pytest
  successes but four mypy errors from one reused loop variable; renamed that
  variable without changing behavior. The failing log remains retained.
- **30221 exit 0**: existing shared BAS MCP tests **44 pass**, types and build
  pass. Actual packaged legacy MCP→Python smoke **21870 exit 0** preserves old
  math/serial/IP/response parity. Final rebuilt Python sources match checkout
  byte-for-byte; packaged process import location and response are checked, not
  inferred from build success. Packaging is an explicit opt-in test gate and
  was enabled for the final full Python run.
- No browser code changed; the prior complete web/browser evidence remains
  recorded below. No new engineering browser journey is claimed.

The ongoing legacy regression **77284** still has active CPU-consuming takeoff
and graph children. Its completed table-recall phase reports Bessemer **6/11
(54.5%)**, five misses and three key-unlisted additions; six core sets have no
table keys, and **23 manifest PDFs fail with historical Desktop-path ENOENT**.
This is not a complete table-corpus pass. Takeoff/reference/graph finals remain
pending. Do not call those path failures an extraction regression or silently
change keys. After the run terminates, inspect content identities and repair only
isolated input-location mappings before the required complete evaluation.

Next remains the full contract: network constraints around the existing solvers,
shared source/equipment ownership and register/event persistence, UI/MCP service,
real development PDF journeys, and remaining A/B/C/E/corpus/holdout gates.
The numeric dependency **does not complete workflow D**. No new engineering
UI/MCP action exists yet; selected-check `pass` is not project completeness.
No push, merge, deployment, model, vision or pricing/labor work.

## Explicit list-rule verification and engineering handoff — 2026-09-09

Committed locally: **5b4d82cf** is the verified v2 list/UI increment;
**8a214255** retains the complete pre-implementation engineering contract and
independent source key. Tracked worktree was clean afterward. No push/merge.
Full existing scored corpus regression now runs as **77284**, log
`component-list-v2-corpus-regression-1.log`, at those source versions. Command:
`OPENTAKEOFF_EVAL_CONCURRENCY=1 npm run eval:corpus -- <isolated>/opentakeoff-corpus`
from `mcp/`; no `--report`, no keys/scorers changed. Takeoff+reference, graph
and table-recall are separate outputs. The job was re-polled live after launch;
do not restart it because a model turn ends. Final results are not yet known.
This legacy regression is not the frozen new-workflow holdout evaluation.

The preceding answer to “What's after this?” was status-only: **no progress**.
This continuation re-read the detailed goal/instructions and inspected actual
worktree state. Prior assembly work is committed locally as **6a3d6c13**.
V2 handles **37515**, **19727**, **77794**, **50477** were polled and are all
terminal **exit 0**; no duplicate jobs were started on an observation timeout.

The new explicit component-list rule preserves v1's exact interpretation
fingerprint and history. The independently reviewed M-511 paragraph now supplies
four distinct source requirements: terminal controller, occupancy sensor,
static-pressure sensor and supply-air damper. No actuator/channel/owner/installed
count is added. Full-register reasoned rule transitions are shared UI/MCP;
new roles cannot be silently collapsed by physical kind. Python quantity math
is unchanged, and results retain their input rule pin.

Verified evidence:

- Original-PDF public MCP `component-list-v2-public-mcp-1`: **63,664 ms**,
  main-process peak RSS **1,149,255,680 bytes**, heap limit **2,348,810,240**,
  workflow **1,140,592 bytes**. Typed/text parity, source keys, v1 retention,
  explicit upgrade, retry/stale/forgery, Python result equality, export/reset/
  import, exceptions and withdrawal pass. Graph, legacy compile/math and points
  remain exact. Four new candidates, **zero newly assigned components**.
- Original-PDF browser `component-list-v2-browser-1`: pass in **42,138 ms**.
  Visual inspection exposed repeated evidence making the four-row list too
  tall. Source wording and individual citations now use a native disclosure;
  only UI state/layout changed. No source spans or returned results are removed.
- Revised actual browser **93245 exit 0**, `component-list-v2-browser-2`:
  **41,868 ms**, keyboard Enter/Space, disclosure/filter/draft return, explicit
  upgrade and old history, Python, reload/fresh import/export all pass. At
  1280/1440/1920 in both themes, all four rows fit in **343 px**, zero internal
  vertical overflow, zero page overflow/JS errors. Dark-1280 and light-1920
  screenshots visually inspected. This is rule-transition proof, not VAV
  registration/applicability or installed-count proof.
- Prior complete v1 assembly UI journey rerun after presentation changes:
  **36291 exit 0**, `assembly-browser-7`, **212,960 ms**, **1,145,741 bytes**.
  Original upload/compile, actual DOAS members, three declarations, independent
  responsibilities/conflict resolution, Python 2/2/2, source return, themes,
  save/reload/import, withdrawal and atomic repair/history all pass.
- Python **174 pass / mypy 13 files**; focused web **27 pass** with types/lint.
  Final MCP **79848 exit 0**: **44 BAS tests**, types/build and 50-tool count
  pass. All public metadata/locks now agree at **0.9.71**.
- Full web **29362 exit 0**: types/lint, **2,653 pass / 13 skips / zero failures**,
  unchanged benchmarks and build pass; test phase **91,455.92 ms**, build
  **14.17 s**. The benchmark was verified live before finishing, not restarted.
  Existing optional Agent-key/bundle warnings remain. No live model call claimed.
  Log `component-list-v2-web-final-1.log`.

Pre-implementation `ENGINEERING_COMPATIBILITY_CONTRACT.md` now covers all required
D rule families, source/decision/persistence/UI/MCP contracts and acceptance.
The original full M-601 page was inspected. Note 10 establishes a 0–10 VDC
actuator signal for referenced DOAS schedule rows, **not** actuator supply/load
or torque. The independent new `bas-compatibility-source-cases.json` matches
retained text span 972, original bbox and frame exactly. Existing capacity and
network solvers are reusable but do not implement electrical compatibility.
No D production implementation or D-completion claim yet.

Next: observe the same running corpus job and implement the complete
engineering service and persistence/UI
journey, while retaining outstanding A/B/C/E and full corpus/holdout gates.
Prior measured corpus remains **not green** (505/541 takeoff, 99/129 reference,
78/91 graph cells, 133/138 row-symbol); no new completed corpus result is claimed.
No VectorGrid/extraction/symbol/legacy-math, original corpus or holdout edits.
No push, merge, deployment, models, pricing/labor or scope reduction.

## Verified assembly checkpoint and resumed work — 2026-09-09

The preceding status-only answer was **no progress**. On resumption, full web
handle **16633** was re-polled and is terminal **exit 0**: **2,647 pass / 13
skips**, types/lint/bench/build (build 9.96 s). The missing contrast handle
**79146** was checked against its actual log and retained measurements: terminal
assertion failure, five dark-theme shell labels at **3.4004836217764134:1**.
No process was restarted merely on an observation timeout.

Real browser **21023**, `assembly-browser-6/checks.json`, passed: original
nine-page PDF upload/production compile, independently keyed schedule members,
three separate source declarations, factory furnishing only, conflict and
source-preserving resolution, keyboard operation, source paint/return, shared
Python quantities/retry/staleness, both themes at 1280/1920, autosave/reload and
fresh import. Removing a member leaves saved assemblies readable; staged
multi-component repair and reasoned withdrawal save atomically, preserve
history, and recalculate the remaining contributions to 1/1. **172,730 ms**,
workflow **1,145,741 bytes**, zero browser JS errors. Controlled applicability
and correction decisions are not automatic scope inference or a real addendum.

Final Python logs confirm **172 pass in 21.42 s**, mypy **13 files**. Existing
public MCP proof and 42-test/type/build gates below remain valid. No installed
quantity or complete-workflow-C claim is made from these bounded cases.

Surface-only Takeoff shell labels/inactive tabs now use the existing secondary
text token. Actual PDF upload + ordinary import **66002 exit 0** passes the
same unrelaxed 4.5:1 test, with all 44 sampled elements at both widths: light
minimum **6.508938359990188:1**, dark **7.707796035708494:1**. Source state and
both retained assembly calculations compare exactly; no page overflow or JS
errors. Before/after screenshots inspected. Evidence:
`assembly-contrast-{before,after}`. This is not app-wide accessibility proof.
Full web **1691 exit 0** verifies this final cosmetic change, log
`assembly-final-web-2.log`: **2,647 pass / 13 skips / zero failures**, types,
lint, bench and build pass (test phase 39,957.75 ms; build 14.00 s). Existing
optional Agent-key and bundle-size warnings remain; no live LLM call is claimed.

All five workflows remain required. Next: coherent local assembly checkpoint,
broader source/identity/duplicate and dense-state coverage, engineering
compatibility, review/revisions, and remaining goal-wide verification. No
VectorGrid, symbol, original corpus, holdout, push, merge or deployment changes.

## Resumed assembly integration — 2026-09-09

Browser attempt 5 also failed the conflict selector: waiting did not fix it.
The earlier timing-only diagnosis was insufficient. The actual basis cell
contains the conflict status **and** retained source/user claims, so an exact
whole-text locator for just `conflict` cannot match. The diagnostic now reads the
specific furnish row's basis cell and requires conflict plus both factory and
by-others claims. No UI logic, evidence or assertion outcome was weakened.

Actual public MCP **93829 exit 0**, `assembly-mcp-2/checks.json`, now passes on
the original nine-page Fort Sam source: independently keyed p9 member spans and
p8 declarations; separate supply/exhaust drives and one onboard-controller
declaration per reviewed member; factory furnishing only; Python contributions
2/2/2; retry/replay/forgery/stale rejection; export/reset/import; controlled
exception 1/2/2; equipment withdrawal with readable retained assemblies. Graph,
legacy compile, point observations and original math are exact. **89,623 ms**,
main-process peak RSS **1,082,261,504 bytes**, Node heap limit **2,348,810,240**,
workflow **1,130,971 bytes**. Explicit 600-second diagnostic tool deadline;
not a general default-resource or installed-quantity claim.

Full web **63073 exit 0**: **2,647 pass / 13 skips**, types/lint/bench/build.
Subsequent accessible-name changes pass targeted lint/types **85732 exit 0**.
Version metadata synchronized at **0.9.70** (including pre-existing root-lock
version drift); new assembly tests are now in `test:bas`/normal MCP pretest.
Final MCP **74835 exit 0**: **42 BAS tests**, types/tool count/build pass.

Actual browser attempt 3 reached the assembly form and exposed ambiguous select
labels; explicit accessible names were added. Attempt 4 saved all three source
components and produced the expected conflict, but its immediate `isVisible`
assertion raced asynchronous validation (failure screenshot shows the conflict).
The diagnostic now waits for the rendered result. Both failures are retained;
actual browser **34809**, attempt 5, remains under verification. No unit-only or
MCP-only assertion is being substituted for the required actual UI journey.

Latest superseding checkpoint: public assembly compile/HTTP/concurrent-Session
tests now pass; all **42 MCP BAS tests**, types/build pass (`4545` exit 0).
Earlier integration tests passed 17 but exposed nine new test typing errors;
added explicit property guards and strict response parsing, no assertion relaxed.
Three surface draft-lifecycle tests plus fourteen assembly register/history tests
pass; editor lint/types pass. Multi-component staging, explicit withdrawal with
saved reasons, stale-batch rejection and retained-assembly entry after equipment
removal are now implemented. Staging is not shared validation or partial saving.
Full web `63073` has **2,647 pass / 13 skips**, bench/build still pending at this
checkpoint. It must reach terminal success before a full-green claim.

Real UI attempt 1 failed before launch because the Playwright bundled browser
is not installed; attempt 2 used installed Chrome, uploaded/compiled the original
nine-page Fort Sam PDF and reached equipment registration. It failed a diagnostic
assumption of exactly one source row for DOAS-1: the actual source has two p1 fan
ESP rows and one p9 equipment-schedule row. Original M-601 visually rechecked;
the script now selects the independently keyed p9 row and asserts containment of
its exact keyed text span. No production rule, corpus key or extraction changed.
The same assumption failed actual MCP attempt 1; both failures remain retained.
UI retry `48449` and public MCP retry are now running. No completed assembly
walkthrough claim yet.

Starting four-set baseline **78297 is terminal exit 0**, not live. Takeoff exact:
Federal 102/102, Navfac 209/217, Bldg5406 17/28, raster 28/28. Combined 356/375,
absolute delta 38, missing 11, 37 key-flagged additions; installed 322/339,
refusals 6/8. Reference cells 62/62 (no applicable cells for Bldg/raster).
These match candidate per-set metrics; detailed mismatch lines were compared
without normalization of facts. All seven core sets now have starting-revision
comparison evidence. This does not make the corpus green: overall candidate
takeoff 505/541, reference 99/129, graph cells 78/91, row-symbol 133/138.

The immediately preceding status-only answer was **no progress**. This resumption
revalidated actual processes and source before continuing. Assignment checkpoint
**31d4a793** is committed locally; no push/merge/deployment. The five-workflow
goal remains intact and incomplete.

New assembly work after that commit is uncommitted. Shared register/history
tests: **14 new web tests**, 36 including equipment/workflow/component controls;
Python **172 pass**, mypy **13 files** (53 new assembly tests). Shared MCP/Python
service **14 pass** (five assembly, nine assignment/history controls). Full web
`70787` exited 0: **2,644 pass / 13 skips**, types/lint/bench/build pass. This
full run preceded the new public MCP options, HTTP route and UI wiring, so does
not prove those newer changes. Public integration MCP typecheck/build `95344`
is now confirmed terminal exit 0. HTTP route registration has three passing tests.

Retained failures fixed during this increment: test fixture missing sheet,
three test callback types, test-only browser dependency resolution, Python field
name shadowing, middleware syntax and synchronous route-dispatch mismatch.
Editor lint `47391`/`88585` both exited 1: a missing JSX conditional brace at the
source-reference disclosure; corrected on resumption, rerun required. The chained
editor typecheck had not run. No thresholds/assertions weakened. Actual assembly
upload/UI/public-MCP walkthroughs remain required, not replaced by helper tests.

Baseline handle **78297** was polled and confirmed live again: parent PID 66280,
Navfac child 66378 at elapsed 1:04:50, 100% CPU, RSS 264,208 KiB. No aggregate
result yet; no restart. The owned Vite PID 26358 remains live on port 5177.

Next: finish assembly UI validation, multi-component rebase and orphan-history
access; prove public MCP/HTTP parity; actual original-PDF workflow, persistence,
source navigation, both themes and dense-state tests; docs/version/full gates.
Then broader reconciliation, engineering, review/revisions and all goal gates.
VectorGrid, symbols, original corpus and holdout remain untouched.

Local equipment/source editor checkpoint **5d072f59** and component-source
kernel **a0b58e8a** are committed. No push, merge or deployment. The current
shared Python assigned-observation increment now has passing actual browser and
public MCP walkthroughs, in addition to focused and full web gates. It is not a
unique physical requirement total, installed count or full-goal completion.
All five agreed workflows remain required. This continuation made progress in
real verification, a measured readability fix, and source-backed assembly review.

### Current verification and live handles — 2026-09-09

- Final shared response-acceptance guard rejects otherwise valid responses that
  drop history, alter source/capture state, or return a mismatched result copy.
  `59506`: MCP types/build/tool count and **33 BAS tests pass** (eight new
  assignment tests); packaged Python includes the sparse-header fix. Python
  **119 pass**, mypy **12 files pass**. Earlier 32-test count below is superseded.
- Full web **17541**, `assignment-component-web-check.log`, is **terminal exit 0**:
  **2,630 pass / 13 existing skips / zero failures**, typecheck/lint/bench/build
  pass, including the response guard, contrast fix and seven component-source
  tests. This supersedes the earlier full run's two unchanged hatch/grid timing
  failures; both failures/logs and original thresholds remain retained. It does
  not yet cover the newer assembly-register module. Existing bundle/optional
  Agent configuration warnings remain; no asserted cause for timing variation.
- Actual browser **95677**, `assignment-demand-browser-3/checks.json`, **passes**:
  original 29-page Behavioral upload/compile; 14 independently keyed members;
  five source applicability references; system-once factor 1 rather than 14;
  original source observations unchanged and attributes unmultiplied; keyboard
  calculate/source paint/return; retry; controlled member exception/recalculation;
  both themes at 1280/1920; autosave/reload/export/fresh import; withdrawal retains
  all old calculations and shows staleness. No JS errors. Workflow 2,131,535
  bytes; compile export 5,696,632 bytes. Earlier indexing-timeout/browser-close
  runs remain failures, not erased by this successful retry.
- Actual public MCP **27726**, `assignment-demand-mcp-2/checks.json`, **exit 0**:
  original graph, legacy compile/point/math and replay exact; assignment and
  calculation retries, stale/foreign rejection, export/reset/import and
  withdrawal with retained history pass. Workflow 1,951,665 bytes;
  **518,035 ms**, main-process peak RSS **1,610,399,744 bytes**. This used explicit
  4-GiB/600-second compile diagnostic allowances, not default-resource proof.
  Earlier MCP attempt timed out in the post-import graph rebuild and is retained.
- Real-PDF ordinary-import readability check reproduced dark table contrast
  **3.4004836:1**, 361 of 411 text elements failing the 4.5:1 threshold. Surface-
  only existing color-token/inheritance fixes now pass all 411 elements in both
  themes at both sizes: light minimum **6.5089384:1**, dark **7.7077960:1**, no
  page overflow or workflow mutation. Before/after JSON and screenshots retained
  under `assignment-reader-contrast-{before,after}`; after process **39299 exit 0**.
  Actual source-paint/light/dark screenshots visually inspected. This is scoped
  readability QA, not blanket accessibility certification.
- Baseline comparison **78297**, PID 66280 and Navfac child 66378, remains
  authoritatively live. Federal finished, Bldg5406 and raster have begun; no aggregate
  result is claimed. Do not restart.
- Read-only cache diagnosis: sheetGraphCache hashes all MCP source files, so
  downstream BAS edits can invalidate graph caches despite the comment that
  downstream BAS changes should not. No cache rule was weakened or changed.

Component source checkpoint **a0b58e8a**: original Fort Sam M-511/M-512/M-601
inspected visually and keyed independently. Seven tests/types and full web gate
pass for explicit distinct fan-drive pairs and factory-furnished onboard
controller declarations, full provenance, partial-clause disclosure and negative
controls. No monitoring reference becomes another controller; no AO point row
becomes another drive. VAV source case is keyed, not yet supported by the parser.

New uncommitted `ASSEMBLY_REVIEW_CONTRACT.md` / shared register implements source-
owned physical component records, explicit scope/members/exceptions/conditions,
lifecycle, separate activity claims/conflicts/reasoned resolutions, duplicate
source consumption checks and preserved upstream equipment issues. Nine tests
pass in `assembly-register-tests-2.log`; a subsequent typecheck found three
implicit-any callbacks in the controlled test adapter. Explicit span typing
and upstream-issue retention pass all nine tests and typecheck in **13475 exit 0**
(`assembly-register-tests-3.log`, `assembly-register-typecheck-2.log`); no assertion
relaxed. This controlled source-derived
adapter is not a real graph/UI/MCP workflow proof. Durable assembly transactions,
Python quantities, UI/MCP integration and all other full-goal gates remain next.
Holdout, VectorGrid, symbols and legacy math untouched.

Historical checkpoint details (superseded by the results above):

- New MCP BAS suite: **32 pass**, typecheck/build/tool count pass before the final
  sparse-header fix (Python copies must be rebuilt). Seven new tests include
  source parity/corruption, exact retries, unknowns, alias preservation, HTTP
  parity, cancellation, stale heads and concurrent Session updates. Import
  order cannot make an older result appear current. No competing browser math.
- Web check `24018`: **2,623 pass / 13 existing skips / zero failures**;
  typecheck/lint/bench pass, build still running at this checkpoint. The previous
  check had two route-registration failures; the single shared middleware was
  fixed, retaining all prior assertions. Three route tests pass. Logs retained.
- Actual new browser `6062` / `assignment-demand-browser-1` is **terminal failure**:
  600-second indexing timeout before calculation UI was reached. No browser JS
  errors; failure screenshot inspected. Vite reloaded during this run (observed
  warming → null → warming); concurrent heavy load was also present. Do not
  claim a passed calculation walkthrough or assume either observation fully
  explains the timeout. Previous equipment-only walkthrough remains separately
  valid. Do not rerun until the existing graph jobs and code are stable.
- Actual new MCP `22070` / `assignment-demand-mcp-1.log` remains live, PID 66036,
  in graph construction. Keep it; no restart on an observation timeout. Uses
  explicit 4-GiB / 600-second compile diagnostic allowances, not default-runtime
  proof. Baseline comparison `78297` / `assignment-starting-remaining-corpus.log`
  is live, PID 66280 with Federal/Navfac children. No result yet.

### Completed legacy core gate — not green

`21748` is **terminal**, not live. `sequence-workflow-core-corpus.log` completed
in **4,601.6 seconds** under concurrent work, not a frozen performance A/B:

- Takeoff **505/541 exact**: installed **470/499**, honest refusals **7/14**,
  raster-unavailable **28/28**; absolute quantity delta **74**, missing **18**,
  key-flagged additions **53**. Additions require investigation, not assumed
  key gaps or proven false installations.
- Reference **99/129 exact**, all 30 misses in ITD.
- Graph **78/91 cells**, zero wrong and 13 missing Baker CEILING cells;
  row-symbol **133/138**, five missing Bldg5406 anchors, zero false resolutions.
  No `tables.csv` keys: table recall is unscored, not 100%.

Per-set takeoff exact / quantity delta / missing / additions:
Bessemer 10/10 / 0 / 0 / 5; ITD 104/116 / 35 / 2 / 11;
Federal 102/102 / 0 / 0 / 16; Navfac 209/217 / 14 / 0 / 21;
Bldg5406 17/28 / 24 / 11 / 0; Baker 35/40 / 1 / 5 / 0;
raster 28/28 / 0 / 0 / 0.

All graph misses and the Bessemer/ITD/Baker takeoff/reference discrepancies match
the retained starting-revision **08dffc79** runs (including failure details).
Remaining four-set baseline comparison is still live. Earlier journal paragraphs
below that call `21748` live are historical. Do not rewrite keys/scorers, count a
zero process exit as a passing corpus, or attribute the pending deltas yet.

Next: complete new calculation end-to-end evidence and final gates, checkpoint
locally, then explicit physical-requirement identity/quantity reconciliation,
broader SOO/applicability coverage and the remaining three workflows. All five
bounded workflows and corpus/holdout/resource gates remain required.

## Verified equipment editor checkpoint — 2026-09-09

This continuation made **progress**. Shared source-backed equipment and explicit
template assignment now have an actual editing/persistence/source/export journey
in Takeoff and public MCP. This is still not all five complete BAS workflows.
No extraction, symbol threshold, costing, push, merge or deployment change.

- Final full web `61719` completed: **2,623 pass / 13 existing skips / zero
  failures**, typecheck/lint/bench/build pass. Existing bundle and optional Agent
  key warnings remain. Focused empty-preview regression tests (2), editor lint
  and typecheck passed; TypeScript files are checked by tsc (ESLint's existing
  configuration does not cover the small `.ts` UI lifecycle helper).
- Actual original 29-page Behavioral browser `41432` / `equipment-browser-7`
  passed: explicit scope; all 14 independently keyed scheduled members; matrix
  once; five independently keyed original applicability spans attached to scope
  and assignment; saved reference opens M701; keyboard preview/save; edits
  invalidate preview; explicit test exception preserves equipment inventory;
  source paint/return/draft; both themes at 1280/1920; autosave/reload/export;
  fresh-context import; withdrawal retains original evidence and prior events.
  No browser JS errors. Retained workflow **1,804,644 bytes**; actual compile JSON
  download **5,696,632 bytes** (not wire-size measurement). CH-3 exception is
  clearly a controlled operator decision, not printed-source truth. Earlier
  complete browser `10346` also passed without attached applicability spans.
- Light-1280 and dark-1920 equipment screenshots visually inspected, plus M701
  source paint and original M601 member paint. No overlapping UI controls or
  page-level horizontal overflow. Source painting uses the current canvas zoom;
  the small original printed text may still require the normal zoom interaction.
  A future contextual citation zoom can improve that without altering bboxes.
- Actual public MCP `34698` passed with original graph/point/math exact and full
  retry/recompile/reset/import/withdrawal checks: 14 members, 7 equipment tables,
  workflow **1,788,448 bytes**. Explicit 4-GiB heap / 600-second compile deadline;
  **633,067 ms** for the entire diagnostic and main-process peak RSS
  **1,493,106,688 bytes** under concurrent work. This does not solve the independently
  reproduced default-memory/deadline limits or establish isolated performance.
- Earlier new shared tests 45 pass, MCP focused/production tests and 132-contract
  subset pass (details below); Python production is unchanged. The shared
  three-way comparator is covered by controlled production-boundary tests;
  the actual Behavioral equipment key does not claim full SOO interpretation.

Failures were retained and corrected honestly: two inspector-body capture
failures (actual JSON download now used); one closed browser target; a genuine
null-preview UI crash (two regression tests); and an exact accessible-name
failure (Applicability explicitly labeled). No key, original assertion,
threshold, source data or scorer was weakened.

Core corpus job `21748` remains live (Navfac PID 57494 last confirmed). **Takeoff
and reference pending**; graph: **78 correct / 0 wrong / 13 missed cells**, row
symbols **133 expected / 5 missed / 0 false**. All current graph misses reproduced
on the starting revision; absent table keys remain unscored. No all-metric
completion claim. Keep the live job; do not restart after an observation timeout.

Next required implementation: shared Python assignment-demand adapter (contract
now spelled out), installed/phase/multi-view evidence reconciliation, manual and
aggregate quantity bases, broader supported applicability and independent keys.
Broader SOO coverage, assemblies/responsibilities, engineering compatibility,
source archives/revisions/approved releases, corpus/holdout gates remain required.
The full objective is unchanged. The code and selected proofs below are ready
for a local verified checkpoint; detailed earlier run records follow.

## Equipment editing and inspectable evidence — 2026-09-09, in progress

Browser editor update: attempt `12576` (`equipment-browser-4`) reached the real
editor and reproduced an empty-preview crash (`undefined === undefined` admitted
a null preview). Fixed with a surface-specific guarded preview lifecycle; two
new regression tests pass. Attempt `86616` (`equipment-browser-5`) then recorded
the scope and all 14 source members without JS errors, but stopped at a missing
exact accessible name for Applicability. Added its explicit accessible label;
no decision semantics changed. Both failure screenshots inspected. Current
actual browser run `10346` writes `equipment-browser-6.log`. Full final web gate
`61719` has passed 2,623 tests / 13 existing skips and is in benchmarks/build.
Focused final editor typecheck/lint `9000` pending terminal poll; preceding
`85724` passed. No successful equipment UI walkthrough is claimed yet.

Latest verification update: actual Behavioral MCP `34698` **passes** all checks:
14 independently keyed members, system-once assignment, original graph/point/math
equality, stale/foreign/non-BAS refusals, retry/recompile, export/reset/import,
withdrawal retaining history. Seven raw equipment tables retained. Workflow
1,788,448 bytes; full diagnostic 633,067 ms; main-process peak RSS 1,493,106,688
bytes under concurrent load (not whole-tree/isolated peak). The 4-GiB and 600-s
compile allowances are explicit; default resource safety remains unproven.
Evidence: `equipment-workflow-mcp-complete/checks.json` and matching log.

Browser attempts `45576` and `70783` completed original PDF indexing/compile
without JS errors but failed retrieving the streaming response from Chrome's
inspector cache. Enlarged diagnostic buffers did not fix that. The diagnostic
now captures the actual application's compile JSON download instead, preserving
all domain assertions; it measures exported bytes rather than claiming wire size.
Attempt `19181` then terminated because its browser target closed during upload;
no editor pass claimed. Its processes were absent before retry. Current run uses
browser-process diagnostic logging and `equipment-browser-4.log`; preserve all
three failed attempts and screenshots. Focused final UI lint/typecheck `85724`
must be polled; no new extraction or math edits.

Previous status-only goal turn: **no progress**. This continuation makes
**progress**: an internal Equipment source/register table, scoped member editing,
selected-equipment assignment/exception/withdrawal forms, shared validated preview
and ordinary autosave integration. All five goal workflows remain required and
incomplete. No push, merge, deployment, costing or extraction changes.

The UI uses `validateBasEquipmentRegister` for previews and
`applyBasEquipmentReview` for commits, matching MCP. Original cells can be read
as a digital row or opened on the original drawing; saved scope/assignment and
interpreted requirement references are directly inspectable. Matched points open
the retained original matrix. Manual decisions remain disclosed, with reasons;
missing supporting references do not become extracted applicability facts.
Equipment detail and its draft survive citation return through existing canvas
state. Any input change invalidates the preview; stale heads/captures reject.
No new permanent toolbar/rail. Assignment-driven Python demand is not implemented.

The prior final shared-engine web check completed: **2,621 pass, 13 existing
skips, zero fail**, typecheck/lint/bench/build pass. New UI focused typecheck/lint
passed (one new hook warning corrected; unrelated canvas warnings retained).
Editor full check `76242` also completed: typecheck/lint, the same 2,621 tests,
benchmarks and build pass. Additional source-inspection UI edits were made while
the suite ran; focused check `7848` and actual browser verification remain the
latest-source gates. Do not treat unit checks as equipment UI walkthrough proof.

Large actual MCP `89172` **failed** at the final post-import compile with the
120-second client deadline. Graph had completed at 275.0 seconds, so the reset
causes a new cold graph longer than that diagnostic allowance. Export/import and
intermediate assignments were reached but this is not a complete pass. Failure
log/export retained. The new explicit-4-GiB/600-second-compile diagnostic `34698`
(PID 61004, `equipment-workflow-mcp-complete.log`) is live and reached the
post-import compile. This changes only the diagnostic allowance, not production
memory/timeout settings, and cannot establish default resource safety.

Real browser `45576` (PID 61053, `equipment-browser.log`) is live on the original
29-page Behavioral PDF. Its actual Vite graph child PID 61091 was independently
confirmed alive; no timeout was treated as completion. Browser editor assertions
have not yet run. Subsequent diagnostic phase/heartbeat logging was added to the
script for future runs; the current invocation predates it. Keep the active job,
do not start a duplicate. Core seven-set takeoff/reference `21748` remains live
with Navfac PID 57494; its earlier graph results/starting-baseline reproductions
are recorded below. Default-memory failure, timeouts and missing corpus table
keys remain explicit limitations, not passing scores.

Next: finish current browser/MCP/web/corpus checks; inspect captured screenshots;
repair any reproduced UI defects; commit coherent verified work. Then implement
the shared Python assignment-demand adapter and the remaining full workflows,
including additional independent development keys and the reserved holdout gates.

## Source-backed equipment and three-way assignment — 2026-09-09, active verification

The preceding status-answer turn was **no progress**. This continuation made
**progress**: shared equipment evidence, explicit scoped identities and durable
template assignments, plus reuse of the existing SOO/point comparator against
those assigned equipment. All five complete workflows remain open; no blocker
or production-completion claim. Current changes are not yet committed.

- New `basEquipmentMembership.ts` parses bounded complete tags/lists/ranges and
  explicit exclusions atomically. Strict printed counts preserve zero and reject
  decimal/prefix parsing. Initial typecheck found unsupported `replaceAll`; fixed
  with a compatible replacement, without changing the accepted grammar.
- `basEquipmentEvidence.ts` retains original equipment-classified graph tables,
  including opaque metadata, cells and continuation ownership. Stable version-
  bound occurrence IDs ignore only filename navigation aliases. Repeated source
  tables/labels stay separate; no row-key shortcut, component-count substitution,
  implicit one, installed count or automatic scope. Existing merged VFD cell in
  Behavioral stays unresolved rather than trusting its tempting row key.
- All 14 independently keyed Behavioral system members resolve to their original
  schedule row/page in the retained real graph. Heating-water pumps remain in
  the candidate inventory, not implicitly included in the CHW system assignment.
  No new PDF truth was manufactured from implementation output; holdouts unopened.
- `bas_equipment_3` capture extension retains raw equipment sources without
  changing old point/SOO capture fingerprints. Shared register/review service
  uses explicit scope/equipment UUIDs, exact source-member bindings, reasons,
  per-equipment/system-once applicability, exceptions and hash-linked history.
  Stale/foreign/duplicate decisions reject, exact retries are idempotent, and
  withdrawal retains earlier evidence/events. Origins remain operator input or
  Agent proposal, not authenticated approval. No new demand arithmetic yet.
- Equipment assignments can explicitly reference body-bearing SOO regions. They
  reuse the exact existing source-name comparator, now factored once, and retain
  requirement/source/row IDs plus included equipment scope. Listed/omitted/
  ambiguous/unavailable outcomes never create signal types or installed counts.
  A controlled production-boundary test verifies this complete three-way reply,
  schema parity, persistence and recompile; it is not independent real-PDF truth.
- Existing compile tool adds `bas_equipment` candidate/register/comparison index
  and optional `bas_equipment_review` transaction. Equipment-capture failure is
  isolated as `bas_equipment_error`, preserving valid point/SOO capture; attempted
  equipment writes refuse before changing prior Session state. Metadata versions
  agree at 0.9.68; still 50 tools. Dedicated equipment UI remains unimplemented.
- Focused shared tests **45 pass**, including all nine prior sequence comparison
  tests and actual IndexedDB/import replay. MCP initial BAS subset **20 pass**,
  typecheck/build pass; subsequent **12 point/production tests pass** including
  failure isolation and three-way reply, with another clean typecheck. Initial
  legacy-equality test required explicitly separating/validating the new additive
  index; every original field assertion remains exact. A later typecheck required
  asserting valid evidence actually has its capture before destructuring.
- First full web check **2,620 pass / 13 existing skips / zero fail**;
  typecheck/lint/bench/build pass. A final run after factoring the comparator is
  live. MCP contract/parity subset **132 pass**. Python production unchanged.
- Real browser regression passes: original Fort Sam upload, exact old fields,
  new index/capture agreement, source/keyboard form, both themes/two widths,
  autosave/reload/export, fresh import and removal history. 18 selected clauses,
  two listed/one not-listed requirement; no JS errors. Retained workflow
  1,111,944 bytes, response 1,630,992 bytes. Light-1280 and dark-1920 screenshots
  visually inspected. This exercises the existing SOO UI, not an equipment UI.

**Large-PDF verification is NOT green:** actual Behavioral public-MCP diagnostic
`85399` terminated with V8 2-GiB heap exhaustion (log
`equipment-workflow-mcp.log`). Retained prior baseline independently documents
the same default-heap OOM and an equal-4-GiB successful graph A/B. The phase-logged
default retry `10490` reached `graph:start`; it was deliberately stopped (143)
after that baseline evidence was recovered, not mistaken for a timeout. Its
owned processes 59510/59533 were terminated and confirmed absent before the
4-GiB retry. `89172` is the live explicit-4-GiB retry, log
`equipment-workflow-mcp-4g.log`. Do not claim default-memory production safety
or an equipment MCP walkthrough pass until its actual checks finish.

**Legacy corpus:** seven-set job `21748` remains live (PID 56233; takeoff child
56250, active Navfac child 57494). Graph stage finished: **78 correct / 0 wrong /
13 missed cells; 133 expected row-symbol outcomes / 5 missed / 0 false outcomes**.
Baker's 13 misses were previously reproduced on the starting revision. Fresh
starting checkout `08dffc79` reproduction `97520` confirms all five Bldg5406
misses exactly: EF-1/EF-4/EF-5/CH-1/AS-1, 11/16 outcomes. Takeoff and reference
stages remain pending; no all-metric gate claimed. Table recall remains unscored
without authored table keys. These are correctness checks under concurrent work,
not frozen cache/runtime/memory A/B measurements.

**Live:** final web `56619`; equipment MCP/4-GiB `89172`; core corpus `21748`.
Terminal pass: first web `55152`, browser `88615`, MCP contract `24786`, focused
shared/typecheck `60831`, MCP focused/build `15140`, added three-way/typecheck
`65973`, failure-isolation/build `60905`, prior MCP contract `72013`. Preserve
earlier diagnostic failures (`16119`, `94803`, `85399`) and cancelled `10490`.
Do not restart live jobs because a polling observation expires.

**Next:** finish these gates; equipment-centered editing/source journey; exact
Python assignment demand adapter; actual installed-evidence reconciliation;
manual/aggregate quantity bases and broader explicit applicability patterns;
additional independent development keys. SOO breadth, assemblies/responsibility,
engineering compatibility, source archives/revisions/release and full corpus/
holdout gates remain required. No costing, vision, VectorGrid, symbol-threshold,
commercial math, push, merge or deployment change.

Evidence: `equipment-capture-sequence-browser/`, `equipment-workflow-*.log`,
`equipment-starting-bldg5406-graph.log`, and the unchanged independent equipment
key. Full raw diagnostic exports/failures are retained locally, not counted green.

## Retained SOO comparison workflow — 2026-09-09, verification checkpoint

Implementation, diagnostic scripts, selected verified screenshots/checks and the
next independent source key are committed locally as `4d480688` (not pushed).
Full diagnostic wire/export/failure artifacts remain in the evidence directories
locally; the complete legacy corpus and MCP contract subset below are still live.

The preceding status-answer turn was **no progress**. This continuation made
**progress**: real browser/MCP integration, durable sequence source and review
events, negative controls, a reproduced/repaired recompile-history bug, and
independently reviewed source cases for actual-equipment assignment. All five
complete workflows remain required; no blocker or completion claim.

- New `bas_evidence_2` captures retain complete positioned PDF text alongside
  unchanged point evidence. Old point-only capture fingerprints remain exact.
  Original source data is immutable; separate hash-linked review events retain
  explicit links, reasons, origins, edits/removals and expected prior heads.
  Exact retries are idempotent; stale/foreign evidence, changed requests and
  divergent imports reject. This is local integrity, not authenticated approval.
- Actual Takeoff **Point lists → Sequences & links** opens original prose,
  bounded monitoring interpretations, source-reference association controls and
  comparisons without a new canvas rail. UI and MCP invoke the same validation,
  history and comparison service. `bas_review` is an optional existing-tool input,
  with `agent_proposal` origin; it is not read-only when provided. Version 0.9.67
  agrees on all three manifest surfaces; no new MCP verb (50 tools unchanged).
- Real browser PDF upload/production compile: old browser compile fields exactly
  unchanged excluding additive capture; 12 matrices/193 rows and all nine pages
  retained. Original selected sequence has 18 blocks. An invalid equipment
  reference cannot create an event; valid keyboard submission produces two listed
  rows/one selected-matrix omission. Source paint/return retains sequence, draft
  and prose scroll. Both themes at 1280/1920, actual autosave, reload/export,
  fresh-context import and reasoned removal retaining prior evidence/history pass.
  No browser JS errors; light-1280 and dark-1920 comparisons visually inspected.
  Workflow payload 1,004,719 bytes; response 1,492,966 bytes. This nine-page
  result does not establish large-corpus transport/performance safety.
- Browser diagnostic failures retained: initial compared content-hashed browser
  filenames with original-named CLI; second missed the existing outer display
  alias mapping; third attempted to edit a collapsed post-save form. Corrected
  only diagnostic setup/expected transport distinctions; no source keys or
  production extraction altered. Final `sequence-workflow-browser-4` passes.
- Actual MCP create/retry/recompile/export/reset/import/remove passes. It
  reproduced a genuine new-integration defect: ordinary recompile omitted saved
  review events from its response although Session retained them. Shared compile
  now returns merged retained history, protected by real MCP proof and a focused
  production-boundary regression test. Invalid/stale/non-BAS requests preserve
  Session state. Original legacy compile fields and full source snapshot remain
  exact. 65,219 ms for the whole multi-call proof; main-process peak RSS
  755,302,400 bytes under concurrent checks, not whole-tree or isolated A/B.
- Focused web workflow/review/comparison tests **24 pass**. Full web check:
  **2,600 pass / 13 existing skips / zero fail**, typecheck/lint/bench/build pass.
  Existing bundle-size and missing optional Agent-key warnings remain. MCP
  typecheck, **23 BAS tests**, build and tool-count gate pass. Python production
  unchanged from prior 97-pass/mypy checkpoint; not rerun this increment.

Evidence: `evidence/sequence-workflow-browser-4/`,
`evidence/sequence-workflow-mcp-verified/`, corresponding `.log` files,
`sequence-workflow-focused.log`, `sequence-workflow-web-check.log`.
Full original/rejected diagnostic outputs remain local; never count them green.
Contracts: `SEQUENCE_WORKFLOW_CONTRACT.md`, `EQUIPMENT_ASSIGNMENT_CONTRACT.md`.

**Next equipment evidence:** original Behavioral Medicine M601/M701 (development
rank 22) visually reviewed using the PDF skill. Five explicit equipment lists
resolve to 14 named scheduled members; the system matrix already covers them
once. The sequence's two-chiller simultaneous-operation limit is not its three
scheduled chillers. Heating-water pumps elsewhere on M601 are not automatically
members of this CHW matrix. Refrigerant monitoring is not a named device count.
New independent `bas-equipment-system-cases.json` has one passing source-key
integrity test and a subsequent clean web typecheck; this is not a passing
equipment interpreter. The six reserved holdouts remain unopened. Temporary
rendered review pages: `/tmp/bas-equipment-source-review.yMtoqm/`.

**Live checks at this checkpoint:** complete seven-set legacy corpus gate
`21748` (PID 56233), log `sequence-workflow-core-corpus.log`; MCP contract/parity
subset `72013`, log `sequence-workflow-mcp-contract-check.log`. Revalidate/poll
these handles rather than restarting. Corpus table-recall has no authored keys
and is unscored; takeoff/reference/graph remain pending. Prior three-set baseline
failures remain disclosed below; no new full-corpus non-regression claim.
Terminal: browser `29825` pass; real MCP `71402` pass; full web `12930` pass;
MCP BAS/typecheck `36632` pass; new source-key/typecheck `47712` pass. Earlier
diagnostic handles `72397`, `23940`, `17540`, `2669` are terminal failures as
explained above. Old MCP `82785` was missing on revalidation; checks reran.

**Remaining:** broader SOO conditions/continuations and supported requirements;
canonical actual-equipment/template assignment and exact demand derivation;
assemblies/responsibilities; compatibility; archived source versions,
revision pairing/approval invalidation/release; large-source batching; full
applicable corpus/holdout and five-workflow end-to-end gates. Reference links
are not actual installations. VectorGrid/table extraction/symbols unchanged.
No push, merge, deployment or external provisioning.

## First shared SOO–points comparison — integration pending

This continuation made **progress**, not a completion claim. The durable point
workspace checkpoint below is committed locally as `0c0e9563` (not pushed).
The next substantive implementation is now present in shared
`web/src/lib/basSequenceReconciliation.ts`, with its pre-code contract and
independently authored original-PDF controls in `SOO_RECONCILIATION_CONTRACT.md`
and `web/test/fixtures/bas-soo-monitor-cases.json`.

- Original Fort Sam M-511/M-512 pages were visually reviewed through the PDF
  skill. Both same-title DOAS sequences retain different unoccupied behavior.
  Six explicit controller monitoring clauses retain local mode, modulation,
  target and full source spans; every other paragraph/inset remains accounted
  for and uninterpreted. Parent/general applicability still requires review.
- Explicit source-review fixture associations produce **five listed matches /
  one requirement not listed in the selected matrix**. The M-512 sequence calls
  for duct-static-pressure monitoring but its selected matrix lacks that label.
  M-511's printed pressure input remains **DI**, not silently changed to AI.
  This is not complete SOO coverage or a project-wide missing-device finding.
- Source-reference IDs retain explicit scope and original spans. No association
  is inferred from title/proximity; identical tags in different explicit scopes
  stay distinct. References never multiply points or establish installed units.
  Matching labels do not mean satisfied, field-wired, approved or typed by SOO.
- Nine focused tests cover six keyed source requirements, exact point matches,
  selected-matrix omission, duplicate-row ambiguity, unresolved name evidence,
  wrong-column impersonation, negative/conditional/compound/oversized clauses,
  stale/foreign/spliced references, distinct scopes, replay and non-mutation.
  First diagnostic failed before tests because its fixture selector expected
  `TEMPERATURE` on page 8, which actually prints `TEMP.`. Corrected only the
  test selector; original failure retained. No source key or extraction changed.
- Real Session PDF → graph → unchanged Python point interpreter → new shared
  comparison passes all six independent checks. Entire previous point result,
  graph and source snapshot unchanged; deterministic replay passes. Final
  diagnostic: **14,178 ms**, main-process peak RSS **438,550,528 bytes**, under
  concurrent web checks; not whole-tree or performance A/B evidence.
- MCP typecheck passes. Final full web run has **2,593 pass / 13 existing skips /
  zero fail**, typecheck/lint/benchmark/build pass. Web `74403` and real diagnostic/
  typecheck `41060` are terminal pass. Older `20653`, `11217`, `78361`, `24930`
  are terminal; do not restart them. No verification jobs remain active.

Evidence: `evidence/soo-reconciliation-verified/{checks,comparison}.json`,
`soo-reconciliation-verified.log`, `soo-reconciliation-web-verified.log`.
Earlier failed/initial checks remain retained. This is a bounded shared kernel,
**not yet an output of the production compile tool, persisted SOO record, or UI
assignment workflow**. No new public MCP verb or duplicated browser logic.
VectorGrid, existing point/Python interpretation, symbols and legacy compile
are untouched. Prior core-corpus failures remain disclosed below; no new full
corpus/holdout result. Six held-out documents remain unopened.

**Next:** extend canonical durable BAS state with source-preserving sequence
records, scoped equipment/template identities and reviewed associations; connect
that shared state to production compile and a contextual Takeoff comparison/
assignment journey. Broaden explicit clause/condition/continuation support and
independent development keys while keeping unsupported source content visible.
Do not call reference-only equipment records verified installed quantities.
Assemblies/responsibilities, compatibility, source archives, revisions, approvals,
full corpus/holdout and complete end-to-end five-workflow gates remain required.

## Durable point-matrix workspace checkpoint — 2026-09-09

The preceding question/status reply was **no progress**. Implementation and
this continuation made **progress**: shared evidence captures, durable browser
and Session state, import/export validation, a source-linked digital matrix
reader, and real browser/MCP verification. No VectorGrid/table extraction,
Python interpretation, symbol thresholds, commercial code, push or deployment.

- Shared `bas_workflow_v1` / `point_captures_1` uses content-addressed point
  captures. Repeat imports are idempotent; different captures remain separate.
  Alias changes preserve identity. Corrupt/foreign evidence is rejected. This
  is evidence transport, not approval or authenticated provenance.
- Fresh real CLI compile preserves **every previous result field exactly**
  except the additive capture. Real MCP compile/export/reset/import matches the
  CLI (including typed export): 12 matrices, capture
  `1d3432c6802d814de9f5e0f4ffb6f4af8d406890e9c92fdfb77cd326fa9861b3`.
  MCP proof took 43,173 ms, main-process peak RSS 501,940,224 bytes. Not a frozen
  performance A/B or whole-process-tree measurement.
- Real Chrome / actual Fort Sam upload / production compile: **12 matrices /
  193 listed rows**, all raw columns/header rows, keyboard selection, negative
  filtering, source paint/return selection, autosave/reload/export exact parity,
  and import into a fresh browser context pass. Different real PDF bytes under
  the same filename correctly refuse source navigation without closing evidence.
  This is a **controlled safety fixture**, not a real addendum. Six theme/width
  screenshots plus details/source/refusal retained; dark matrix/details and light
  refusal visually inspected. No page-level overflow or browser JS errors.
- Earlier UI failure was a diagnostic race: installed Playwright treated an
  async `waitForFunction` Promise as truthy. Four waits now use awaited Node-side
  polling. Three tests prove retries, false-condition timeout and propagation of
  errors. Original failure retained; no production persistence change for it.
- Full web check **2,581 pass / 13 existing skips**, typecheck/lint/bench/build
  pass. Three subsequent diagnostic tests pass separately; typecheck reran green.
  Final MCP typecheck, **22 BAS tests**, build pass. Python unchanged from 97 pass /
  mypy 11 files. All jobs terminal; do not restart 75607, 75039, 4890, 46710,
  52504 or 80833.

Evidence: `evidence/point-workspace-persistence-verified/`,
`evidence/point-workspace-mcp-parity/`, `evidence/point-workspace-compile.json`,
`point-workspace-web-check.log`, `point-workspace-persistence-verified.log`.
Contract: `WORKFLOW_CAPTURE_CONTRACT.md`. Earlier failed diagnostics remain
retained, not counted as product passes. Prior core corpus/A-B results below
remain baseline; this batch is **not** an all-corpus/holdout result. Six reserved
holdouts remain unopened.

**Next substantive milestone:** shared source-scoped SOO requirement/point-list/
equipment reconciliation, with independent source keys and explicit assignment
rules before implementation. Not cosmetic polish. No SOO semantic join or
installed-equipment proof is implemented by the capture layer. Source-PDF
archiving, canonical equipment/decision history, assemblies/responsibilities,
compatibility and approved revision snapshots remain required. All five full
workflows remain incomplete. No blocker/completion claim.

### Final verification for the point-record checkpoint

All handles listed in the checkpoint below are now terminal; **do not restart
them**. Web `78183` completed the entire check: 2,573 pass / 13 existing skips,
typecheck, lint, benchmark and build pass. Final MCP `1624` completed typecheck,
**20 tests** (including diagnostic negative controls) and build. Python remains
97 pass / mypy 11 source files. `git diff --check` passes.

Baseline takeoff/reference `59931` completed: all three per-set metric lines and
every reported takeoff/reference failure detail are identical to candidate.
The seven missing items, 16 key-flagged additions and 30 missing ITD reference
cells are therefore reproduced on the starting revision, not newly introduced
by this batch. These are unresolved baseline failures, not correctness passes.
Graph A/B `81547` completed for all three documents: baseline tables preserved
12/12 Fort Sam, 9/9 Behavioral Medicine and 1/1 JVWTP; only Fort Sam has added
regions (eight, independently keyed). Replay table sequences and remaining
relationships match. Timing/cache limitations below remain; this is not a
frozen final performance gate or a full-corpus result.

The newly authored matrix audit had a false-pass hole: a missing nonempty-cell
box was skipped. A controlled checksum fixture reproduced it; missing, inverted
or out-of-region boxes now fail. The original PDF/key audit reran with this
stricter diagnostic and still passes all 1,603 values, every expected nonempty
box check, 193 rows and 12 preserved original tables. No historical scorer or
key changed. Report normalization now accurately states NFKC/case/whitespace,
not the earlier inaccurate “whitespace-only” description. Logs:
`point-audit-box-before.log`, `point-matrix-audit-final.log`,
`point-production-mcp-verified.log`, `point-production-web-verified.log`.

This is a local implementation checkpoint, not production completion. No active
verification jobs remain. Keep the detached baseline checkout for later frozen
performance/coverage checks. Next substantive implementation remains canonical
durable BAS/equipment workflow state and actual Takeoff presentation, then the
remaining required SOO/assignment/assembly/compatibility/revision journeys.

## Source-bound point records on production path — 2026-09-09

The preceding user-question turn was **no progress** (status clarification).
This continuation is **progress**: shared Python point interpretation, strict
source/result contracts, independent negative controls, production orchestration,
MCP schema exposure and source-preserving browser adaptation. No VectorGrid
reader/parser/threshold change, no agents, no push/merge/deploy.

- Shared `bas_point_lists_v1` retains all matrix rows/cells and supported literal
  controller notes. Source byte/page identity is separate from navigation names.
  Hardware declarations, software values and attribute flags remain distinct;
  the new record deliberately has no installed-device or field-wiring total.
- Fort Sam fresh production CLI: 12 matrices / 193 retained listed rows / 246
  observations, six actual footnote spans, 16 reviewed chiller/boiler row bindings.
  Every legacy and `bas_math` field equals the prior compile exactly. The original
  zero-row legacy compiler result is still disclosed; it is not silently repaired
  by substituting these observations into its old contract.
- Real MCP `load_plan` + `compile_corpus_takeoff` verified against that CLI result,
  including raw rows, source IDs, all note text/boxes and structured/text parity.
  MCP's existing `path:null`/`export_path:null` envelope is checked explicitly.
  An initial diagnostic failed because it had not accounted for those two
  existing transport fields; the failure log is retained. Corrected parity:
  `evidence/fort-sam-point-production-parity.json`, 28,905 ms, main-process peak
  RSS 407,207,936 bytes. This is not a whole-process-tree or performance A/B claim.
- Python: **97 pass**; mypy **11 source files pass**. MCP shared BAS suite:
  **16 pass**, typecheck and build pass. Browser adapter: four tests pass,
  including the real retained point result. Final full web rerun is live after
  replacing unsupported ES2022 `Object.hasOwn` with the existing target's
  `hasOwnProperty.call`; no TypeScript target or lint gate was relaxed.
- New negative cases reject BAS-keyword-only/reference captions, invalid raw
  boxes (including unknown columns), malformed source identities, orphaned or
  altered output evidence, omitted rows, status conflicts, and ambiguously owned
  notes. Missing/rotated/out-of-region footnotes do not become integration facts.
- Sparse graph cells are an intentional existing contract. New
  `unobserved_columns` lists absent cells without manufacturing zero/box evidence;
  `uninterpreted_columns` separately retains supplied unknown content. The first
  missing-cell test draft failed on a fixture KeyError, not an engine defect;
  corrected before/after evidence is retained and documented in the contract.
- Core candidate gate completed: takeoff 89.8% exact / seven missing / 16 keyed
  false-add flags; applicable installed 148/160, expected refusals 1/6; reference
  37/67; graph 78 correct / zero wrong / 13 missing CEILING cells; symbols 66/66.
  Starting-revision Baker graph independently reproduces the same 13 misses.
  Baseline takeoff/reference comparison remains live, so its other misses are
  not yet labeled pre-existing. No table-recall keys exist for these three sets.
- Equal 4-GiB-heap graph A/B retry completed Behavioral Medicine: all nine tables,
  sheet metadata and remaining relationships unchanged; no additions. The first
  default-heap baseline OOM remains retained. Fort Sam preserves all 12 previous
  tables and adds the independently keyed eight regions. JVWTP comparison remains
  live. Cache repeats overlapped non-extraction MCP source changes, which are in
  the cache digest: do **not** interpret their warm labels as verified cache hits
  or call these a frozen full-code performance gate. A final frozen warm check
  remains required; no extraction code changed during those comparisons.

Current live handles at this checkpoint: baseline takeoff/reference `59931`;
graph A/B `81547` (JVWTP candidate); final web `78183`. Terminal: fresh CLI
`81751` pass, first MCP diagnostic `79619` fail (envelope described above),
corrected MCP parity `83377` pass, MCP gates `31180` pass, Python `6463` pass.

**Remaining end state:** all five complete workflows remain required. Point
records are now in shared compile JSON and carried by browser metadata, but
dedicated UI presentation, canonical durable state, reviewed corrections,
equipment/template joins and complete export are not implemented. Next move is
canonical persisted BAS workflow/equipment records and actual Takeoff presentation,
alongside SOO requirement interpretation—not more observer-only completion claims.
Large-source batching (current 32-MiB transport), source version retention,
assemblies/responsibilities, compatibility, revisions/approvals, full corpus and
holdout/UI gates remain open. Holdouts have not been opened.

Contract: `POINT_REVIEW_CONTRACT.md`. Graph/routing contract separately updated
with fail-before/pass-after glued POINTLIST admission, not inferred from the
mixed-caption Fort Sam page. No completion or genuine blocker claim.

## Point-header interpretation and regression checkpoint — 2026-09-09

The previous user-question turn was a status clarification (no implementation
progress). This continuation made concrete progress: reproduced six header
interpretation failures, fixed the shared Python consumer, verified all 73
Python tests, mypy on nine source files, seven transport tests, MCP typecheck
and build. No VectorGrid reader/geometry/parser change. No push/merge/deploy.

- Nested HARDWARE POINTS / SOFTWARE POINTS parent headings now expose the
  existing directional/value children. Four M-506 matrices independently
  verify four positive AI rows and fifteen AV rows; trend/alarm/display flags
  add neither terminals nor software values. Explicit conflicting scope is
  unresolved, not resolved by precedence. Full source tables remain untouched.
- Fresh real production CLI compile: original legacy result excluding
  `bas_math` is exactly unchanged. Four formerly untyped matrices now contribute
  19 typed rows. The result remains `review_required`, `project_complete=false`.
  **Not installed demand:** controller integration qualifiers and applicability
  still need their source-bound workflow. Retained result:
  `evidence/fort-sam-point-header-compile.json`.
- A/B Python invocation at baseline `08dffc79` and current consumer preserves
  the entire EngineResult exactly for both earlier Fort Sam and Behavioral
  fixtures, not just totals. Command used the same `.venv-bas/bin/python` with
  each checkout as cwd, `python -m bas_engine`, and each fixture's tables as
  BlueprintInput. Existing 61 tests plus 12 new cases pass.
- Final previous web `npm run check` did complete: 2,570 pass / 13 existing
  skips / zero failures, typecheck/lint/bench/build pass. Current Python and
  diagnostic-only edits do not change that web build; no new UI work this turn.
- Completed real Fort Sam graph A/B: all 12 original full table objects and
  remaining graph relationships unchanged; eight new independently keyed
  regions. Candidate cold and both normal cache reads have identical table
  sequences. Cold baseline 19,760 ms / RSS 413,990,912 bytes; cold candidate
  22,567 ms / RSS 443,924,480 bytes; candidate warm 1,701 ms. One observation
  under concurrent evaluation load, not a statistical speedup or whole-process-
  tree peak measurement. Baseline warm timing still pending.
- Tightened the **new diagnostic comparator**, not any existing scorer: match
  table occurrences one-to-one and reject additions/reordering on replay.
  Three adversarial tests pass; rerunning it on saved Fort Sam graphs passes.
  `evidence/point-routing-comparator-fort-sam.log` retains the stronger check.
- Focused core graph scorer completed in 711.4 s: 78 correct / zero wrong /
  13 missing keyed cells (all Baker County CEILING); 66/66 expected row-symbol
  anchors. No positive room-tag key cases in this selected set. This is **not
  a clean graph baseline claim**: starting-revision Baker reproduction is live.
  Takeoff/reference stages still running. All three sets lack table-recall
  keys, so table recall was **not scored**.
- Broader A/B stopped with a terminal V8 heap-limit failure on **baseline**
  Behavioral Medicine (22), before running its candidate or document 21.
  Default 2 GiB JS heap exhausted; retained log shows 250.13 s and maximum RSS
  1,631,633,408 bytes. This is not a comparison pass. Original failed logs
  preserved. Retry both revisions under the same explicit heap cap after
  memory headroom is available; do not restart still-running core jobs.

Current live handles: core takeoff/reference `66455`; starting-revision Baker
graph reproduction `40164`. Terminal: A/B `38653` (failed as above), Python
`28931` (pass), MCP `31779` (pass), comparator/typecheck `30627` (pass), production
compile `17383` (pass). Graph/routing candidate remains frozen while core child
processes run. Python consumer is not used by those graph/scorer entry points.

Next: finish/classify pending baseline comparisons, retry remaining A/B cases
with sufficient equal memory caps, cover glued-caption admission separately,
then commit the verified routing/header batch. Continue source-bound controller
qualifiers and complete point/SOO interpretation into canonical persisted BAS
records. All five end-to-end workflows, full corpus gates, holdout and UI
persistence/review/export remain required. No completion or blocking claim.

Contracts: `POINT_HEADER_CONTRACT.md`, `POINT_ROUTING_CONTRACT.md`.

## Point-list routing recovery — active verification, 2026-09-09

User approved obtaining the missing information while preserving VectorGrid and
reiterated production-quality completion. Previous implementation turn was
progress; intervening clarification only explained the pending choice. Current
batch implements shared page admission and fixes a reproduced downstream
duplicate-removal error. No VectorGrid reader/adapter/parser changes.

- Regression tests reproduced both defects before their fixes.
- Real source audit: 12/12 BAS matrices, 193/193 listed rows and 1,603/1,603
  cell values match existing independently authored keys, including blank flags
  and nonempty-cell source-region checks. Baseline was four matrices/79 rows/610
  cell values. All twelve original complete table objects are exactly unchanged.
- First routing-only candidate recovered seven tables; trace proved the fallback
  reconciliation removed the gas-meter matrix after VectorGrid read it. Separate
  regions no longer collapse merely because their title/local row keys match.
- MCP typecheck, 29 Session/BAS tests and build pass. Web final check: 2,570 pass,
  13 existing skips, zero fail; benchmark/build completed successfully.
- Printed recovery is NOT physical I/O, installed count or semantic completeness.
  HARDWARE/SOFTWARE nested headings and integration qualifiers remain next-work
  items. No partial implementation is declared production complete.

Contract, evidence and limitations: `POINT_ROUTING_CONTRACT.md`.
Current verification handles: web check `63436`; focused core-corpus gate `66455`
(bessemer, itd-d1-lab, baker-county-eoc); real compile `23623`. Poll live handles
before doing anything with them. Terminal: MCP `57962`, Fort Sam graph `53244`.
Temporary detached baseline checkout, created for A/B checks only:
`/tmp/opentakeoff-routing-baseline.k9rAWG/checkout` at `08dffc79`; dependency
symlinks only, no source modifications. Preserve until comparisons finish.
Candidate code is frozen during the running corpus gate; do not mix revisions
between its child processes. Broad corpus/holdout gates remain incomplete.

## Narrative discovery and omission diagnosis — 2026-09-09

Previous brief goal/status turn was no progress. This continuation added shared
`basNarratives.ts` plus `Session.basNarrativesForPipeline()` and source-backed
tests. This remains an internal building block, not a completed persisted/UI
workflow. VectorGrid, graph routing, legacy compilers, Python math and UI code
are unchanged. No external push/merge/deploy.

- Ten new focused narrative tests pass. Nine exact source regions across Fort
  Sam and Behavioral Medicine are independently checked, including two embedded
  reset tables and all twelve Behavioral SOO sections. Source text/coordinates
  are preserved, and equal titles with different behavior remain distinct.
- Final real Session audit: all 24 development PDFs / 1,253 pages / 563,248 spans
  pass exhaustive disjoint accounting and deterministic replay. Nine authored
  region checks pass. Holdouts remain unopened. Observed 54 bodies / 62 heading
  candidates / one segmentation conflict are **not** corpus accuracy results.
- Discovery summed 637 ms; full load/validation/replay diagnostic 54,715 ms;
  cumulative peak RSS 1,062,305,792 bytes. No whole-takeoff performance claim.
- Final web check passed: 2,567 pass, 13 existing skips, zero failures, bench
  and build pass. MCP typecheck/build and nine BAS tests pass. Full legacy
  quantity/reference/graph gates have not been repeated for this source-only
  batch; remain pending, with existing baseline failures still disclosed.
- Final negative testing reproduced and fixed accepting a four-word scale
  caption as narrative. The final repeat retained all nine reviewed regions
  and changed one rank-25 candidate to heading-only. Exact logs and source
  results are in `evidence/narrative-discovery-release/` and the corresponding
  `narrative-release-*` logs. No source/table quantity was changed.
- Reproduced Fort Sam's missing 114 listed rows: three pages (detail/elevation
  roles) are excluded **before** the existing positive points-title check.
  The graph's twelve tables include only four BAS matrices, not twelve.
  This identifies an upstream shared routing defect, not yet a VectorGrid
  extraction defect. Exact diagnosis and preservation limits:
  `POINT_OMISSION_DIAGNOSIS.md`.
- Asked permission to fix that routing gate under regression tests; no reply
  at this checkpoint. No gate edit made. Other goal work can continue.

Contract, limitations and evidence: `NARRATIVE_CONTRACT.md`. Next: broaden
source-bound narrative interpretation and canonical equipment/template/decision
records with durable state; resolve the routing permission before touching that
gate. All five complete workflows and final corpus/UI/MCP gates remain required.

## Shared source foundation — 2026-09-09

Research/acceptance baseline committed locally as `333c5bac`. The first code
step adds loaded-byte SHA-256 identity and `Session.basSourcesForPipeline()`;
shared schema/alias validation lives in `web/src/lib/basSources.ts`. This is
the source adapter for upcoming workflow consumers, not completed SOO discovery
or a newly exposed UI/MCP workflow. Existing graph, table, symbol, legacy compile
and BAS math code are unchanged. No pricing/costing/labor or runtime vision.

Verified final candidate:

- Four shared-contract unit tests pass; two real-PDF Session tests plus the
  existing seven BAS transport tests pass. Default MCP `npm test` now runs this
  BAS gate via its pretest hook; this does not imply the remaining legacy suite
  is green.
- MCP typecheck and build pass. Full web check passes on the final candidate:
  2,557 pass, 13 pre-existing skips, zero failures, benchmarks and build pass.
- Final source parity run: 24 development PDFs, 1,253 pages, 563,248 spans,
  every source hash/text/bbox/page frame/replay check passed. Two textless pages
  are retained as unavailable text, not interpreted as empty BAS scope.
  Six holdout records/bodies remain unopened.
- The diagnostic took 89,830 ms summed across documents and peaked at
  1,088,503,808 RSS bytes. It includes two PDF reads plus validation and replay;
  this is not a cold/warm takeoff-pipeline performance claim.
- Source contract and exact test semantics: `SOURCE_CONTRACT.md`. Eight
  explicitly titled, independently source-reviewed primary SOO bodies and
  negative controls for the next step: `NARRATIVE_CASES.md`.

Next: shared narrative region discovery and complete coverage accounting,
beginning with independently reviewed multi-column/mixed-table source layouts.
Then equipment/template joins and durable BAS records, following the full
implementation plan. None of the five end-to-end workflows is declared complete.

## Checkpoint — 2026-09-09

Goal: `../BAS_PRODUCTION_GOAL.md`. Active, incomplete. Coordinator-only.
Branch: `codex/bas-math-engine`; production baseline `161583a4aeabd5de08b092d0c154aa880bd02b24`.
Original corpus root is read-only. No production behavior changed in this research checkpoint. No push/merge/deploy.

### Completed evidence

- Read goal, repository instructions and BAS architecture. Primary-source/competitor research and code map: `RESEARCH.md`.
- Pre-implementation contracts, five complete journeys, UI placement and acceptance gates: `IMPLEMENTATION_PLAN.md`.
- Content-identity inventory: 30/30 focus PDF hashes match, 190/190 source PDF hashes match, 113 logical source sets. Inventory script is offline metadata only.
- New-workflow holdout reserved before body/key inspection: ranks 5, 8, 15, 19, 24, 27 plus matching source sets/hashes. Historical exposure is disclosed, not called never-seen generalization.
- Revalidated all 24 development records. Initial bundle-only validator passed 23 and rejected schema-1 record 21; its existing dispatcher/schema-1 validator then passed 242 assertions. No key/scorer changes. Raw logs preserve the initial failure and correct follow-up.
- Full `web/npm run check` exited zero: 2,553 pass, 13 skip, zero fail; benchmarks and build pass. Build warns about bundle sizes and unconfigured Agent key; deterministic workflow tests need no key.
- Python pytest: 61 pass. Configured mypy (`--config-file bas_engine/pyproject.toml ... --exclude tests`): nine source files pass. A bare unconfigured mypy invocation traversed build copies and failed; not the configured gate and not fixed by changing production code.
- Node BAS transport tests: seven pass. Current MCP typecheck exited zero.
- Real Fort Sam UI upload → production compile → shared Python → source navigation/export: existing eight-check harness passes. Totals [15,11,7,21], not installed project quantity.
- New UI baseline: six screenshots, 1920/1440/1280 widths in light/dark. Source is a real upload; no injected result. No page errors. BAS metadata present before reload and absent afterward.
- Text-only capture from production PDF adapter: nine Fort Sam pages / 3,995 spans. M-509 sequence headings/bodies present. Source page visually inspected: two separate sequence columns. Existing table-centered sequence compiler remains zero on the retained Fort Sam/Behavioral graphs.

### Confirmed gaps driving next work

1. Narrative prose is available but omitted by table-centered sequence extraction. Add shared text/region path; do not force prose through VectorGrid.
2. Fort Sam current typed matrices cover 79 of 193 independently reviewed source rows. Diagnose the other 114 by discovery/extraction/interpretation; no implied waiver.
3. BAS state is transient; stable source/equipment identities and durable decisions are required before revisions can be reliable.
4. Existing PDF revision store deletes revision bytes on file removal. Referenced approved BAS sources need retention and portable export.
5. Existing revision comparison is flooring/condition-quantity oriented; reuse storage conventions but do not alter its commercial math or call it BAS review.
6. Current BAS UI spends most of the first 1280×800 screen on headings, navigation, copy and summaries. Use one equipment-centered table with contextual details and Review & changes.

### Baseline limitations

Full MCP is not green by claim. Same-baseline prior proof records WP1 failures (bldg5406 32 vs 14; federal 103 vs 128; ITD 93 vs 97) reproduced with unchanged legacy compiler outputs. Existing main-compiler comparison used the same saved production graph, not a second forced-cold extraction. Re-run applicable gates before integration; never hide these failures.

Ground-truth validators corroborate authored assertions and source/render integrity, not automatic completeness for new workflows or fresh independent symbol counts. New feature expectations and full corpus metrics remain to be built and executed. Metadata BAS screening is not a complete new applicability judgment.

### Next

Add the tested shared source-version/text-only seam, then source accounting and narrative discovery. Preserve existing contracts/outputs. Connect durable BAS state before expanding UI functionality. Follow the complete implementation sequence and gates in `IMPLEMENTATION_PLAN.md`.
