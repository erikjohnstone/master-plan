# BAS production workflow progress

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
