# Schedule Row ↔ Drawn Tag Reconciliation — Audit and Production Plan

**Written 2026-09-16 from a read of the code at `b60d0dd`, the corpus docs, the
answer keys, and the last committed eval reports. No pipeline was run for this
audit — the plan's Phase 0 does that, on purpose.** Every claim below carries a
file:line or a report path so it can be checked.

## 0. The goal, stated exactly

**The end state, in product terms.** An estimator loads a set they have never
seen, types **"Run a control valve takeoff"** or **"Run a BAS takeoff"** or
**"Run an HVAC takeoff"**, and the agent runs it. Every row in the resulting
takeoff is grounded: the estimator can click the row and be shown, on the
drawing, where that row's tag is drawn — every place it is drawn — with the
schedule cell and the plan text both highlighted. A row whose tag is drawn
nowhere says so. A tag drawn on the plans that no row lists shows up as its own
line. The point is to be able to show the customer that the row's tag exists on
the drawing. No symbol recognition is involved in getting there; the tag text
on the plan is the evidence.

**The engine goal that delivers it.**

> Two directions, one ledger, text only.
>
> **Tag → row.** Every place a tag is drawn on a plan — `VAV-1`, a valve mark,
> a grille mark, a pump mark — traces back to exactly one schedule row, or is
> disclosed as a tag the schedule does not answer for.
>
> **Row → tag.** Every schedule row lists every place its tag is drawn, or is
> disclosed as a row the plans never draw.
>
> Enterprise production ready: the same answer from the UI, the agent, and MCP;
> measured on documents the code has never seen; refusal-honest; bounded time.

**Explicit non-goals for this plan — no geometry, none.** Symbol counting,
symbol matching, fingerprint sweeps, tag-to-body attachment, evidence grading,
the legend-glyph inventory (`buildLegendTakeoff`), the reference-shape library
(`match_reference_symbol`), and the RT-DETR track (`plans/01-…`) are all out of
scope. This plan does not call, extend, or depend on `symbolsweep.ts` matching,
`taggedVectorGrounding.ts`, or the geometric lane inside `sweepScheduleRow`.
The unit of work is the **drawn tag text occurrence** and the **schedule row**.
The ledger reports a *drawn count* per row as a text fact; whether that count
is a releasable installed quantity is the existing geometry lane's question and
stays exactly where it is, untouched.

---

## 1. Audit — what exists today

### 1.1 The shared path, as built

The engine is genuinely shared. `mcp/src/session.ts` imports the extraction and
matching modules from `web/src/lib/*` directly; the browser reaches the same
`Session` code over an MCP endpoint or a Vite dev bridge (`web/vite.corpusTakeoffApi.js`).
The row↔tag machinery lives in these places:

| Concern | Where | Size |
|---|---|---|
| Schedule tables, rows, row keys, sheet roles | `web/src/lib/sheetgraph.ts` (`buildSheetGraph`, `rowKeyAnswersFor` :4098, `classifySheetRole` :306) | 11,540 lines |
| Row lookup for a tag (identity column, alias, accessory-row narrowing, shadow extracts, drawing-group scope) | inline inside `Session.sweepScheduleRow`, `mcp/src/session.ts:3677–~4000` | ~320 lines, not a callable function |
| Where a tag is drawn on a sheet | `Session.tagOccurrencesOnSheet` :3522 + six recovery helpers in `web/src/lib/symbolsweep.ts` (`compoundTagOcc` :2883, `splitHyphenTagOcc` :2914, `fragmentedTagOcc` :2974, `familyQuorumFragmentedTagOcc` :3019, `deepHyphenChainTagOcc` :3125, `familySuffixTagOcc` :3186) | |
| Tag text ↔ drawn body attachment (evidence grade) — **out of scope here, listed for orientation only** | `web/src/lib/taggedVectorGrounding.ts`, `web/src/lib/symbollabels.ts` (`labelTokens` :398, `labelPlacements` :896) | |
| Row-driven sweep of one tag across the set | `Session.sweepScheduleRow` :3639–5450 | **1,811 lines in one method** |
| Value-annotated census (`S1` over `200`) | `Session.countMarks` :2514 | |
| Whole-set row walk (scored pipeline) | `mcp/src/takeoff.ts` `buildPlanSetTakeoff` :342 | |
| Reconcile rows, status, CSV | `web/src/lib/schedulePlanReconcile.mjs` (`classifyReconcileStatus` :141, `reconcileScheduleFamilyFromGraph` :668, `…WithSweeps` :855) | 1,044 lines |
| Family needles (61 HVAC families) | `web/src/lib/corpusTakeoff.mjs` `HVAC_FAMILY_SPECS` :991 | |
| MCP verbs | `sweep_schedule_row`, `count_marks`, `reconcile_schedule_plan`, `resolve_tag`, `find_schedule`, `query_table` in `mcp/src/tools.ts` | |
| Agent → takeoff lines | `web/src/lib/agentTakeoff.js` :193–300 | |
| UI wiring | `web/src/pages/TakeoffCanvas.jsx` :8358 (reconcile), :8611 (count_marks), :8648 (sweep) | |

**What already works, verified by others and recorded.** Row-driven reconcile
produces per-row `schedule_cite`, `plan_cites` (geometry-grounded), `plan_tag_cites`
(text only), `plan_candidate_cites` (withheld), an evidence grade, and a status.
`TakeoffItem` carries the same three location lists (`mcp/src/takeoff.ts:73–150`).
The row-to-symbol key (`keys/*.rowsym.csv`) sits at 133/138 across the seven
scored sets (`reports/EVAL-2026-09-13_0024.txt`). The project-level takeoff
scored 95.2% exact on 541 tags (`reports/TAKEOFF-EVAL-2026-09-07_0629.txt`).
Roughly 90 corpus-driven reconcile tests exist (`mcp/test/reconcileWorkflow.test.mjs`).
The trace from a *row* to its *drawn instances* exists and is cited.

### 1.2 The five findings that decide the plan

**F1. The system is row-driven, not occurrence-driven. The goal is occurrence-driven.**
Every producer starts from schedule rows and asks "where is this row's tag drawn?"
(`buildPlanSetTakeoff` walks `graph.tables`; `reconcileScheduleFamilyFromGraph`
walks `graph.tables`; `countMarks` derives its vocabulary from row keys). Nothing
enumerates the tags drawn on the plans and asks "which row answers for this?"
Consequences:
- A tag drawn on a plan with **no schedule row** is never surfaced. `PLAN_ONLY`
  exists in `classifyReconcileStatus` (:190) but is only reachable from a row
  with `scheduled_qty === 0`; rows come only from schedules, so the status is
  effectively dead. `sheet_graph.unmatched_tags` is rooms-only (`roomTags`).
- Tags on sheets the role classifier calls `unknown` are skipped with a note and
  never counted (`session.ts:4002` and `:2556`). The fallback regex accepts only
  `^(A|M|E|P|S|FP)-?1\d\d` (`sheetgraph.ts:316`), so a second-floor plan numbered
  `M2.01`/`M-201` with no classifiable title text is `unknown`. Every tag on it
  is invisible to reconcile. **Hypothesis to measure in Phase 0, not asserted.**
- There is no inverse index and no per-occurrence classification (row label /
  plan instance / note mention / legend entry / detail callout / title-block).

**F2. Four tag grammars and two occurrence finders coexist; the best identity module is dead code.**

| Grammar | Where | Shape |
|---|---|---|
| `isEquipTag` | `equiptags.ts:35` | letter-led, hyphenated, 2–5 segments, ≤20 chars; applied to every MCP span at `mcp/src/pdf.ts:279` |
| `LABEL_TOKEN_RE` | `symbollabels.ts:231` | `^[A-Z]{1,4}-?\d{1,3}[A-Z]?$`, ≤6 chars, plus digitless set |
| `MARK_RE` | `session.ts:2521` (countMarks) | `^[A-Z]{1,3}-?\d{1,3}[A-Z]?$` |
| `markKey`/`spanAnswersFor`/`pickMarkHits` | `markid.ts` | hyphen/space-insensitive identity, short-mark overcount guard, bare-mark ambiguity, twin-alias clustering |

`web/src/lib/markid.ts` has **zero importers** in `web/src` or `mcp/src`
(grep, this audit). Its header documents four real failure modes measured on
HVAC sets; production does not use it. `countMarks` uses its own `canon` and
exact string equality (:2586); `tagOccurrencesOnSheet` uses
`sp.str.trim().toUpperCase() === key` (:3533) where `key` has whitespace
stripped but hyphens kept. A schedule row `VAV-1` drawn as `VAV1` or `VAV 1`
(one run) matches neither the exact pass nor `fragmentedTagOcc` (which
requires a starting span *shorter* than the key). **Hypothesis to measure.**

**F3. The occurrence finder's fallback ladder is first-non-empty, not union.**
`tagOccurrencesOnSheet` (:3549–3555) returns exact+compound+authored-count hits
if any exist; otherwise splitHyphen; otherwise fragmented; otherwise deepHyphen;
otherwise familySuffix. A sheet where the CAD export split *some* `EF-1` tags
into `EF`/`1` and left others whole returns only the whole ones. Rotated text is
carried on spans (`rot`, `pdf.ts:271`) but the finder and every fragment chain
assume horizontal same-row/next-line geometry. **Hypotheses to measure.**

**F4. Ground truth cannot see the thing this goal is about.**
- `*.takeoff.csv` scores a **count per tag**; `*.rowsym.csv` scores
  **resolved/refused per tag**; neither records where on which sheet each
  occurrence sits, nor whether a drawn tag is a plan instance or a note.
- Key *scope* is "every row `sheetGraph()` finds" (`PRODUCTION_AUDIT.md §0.2`),
  so a table never found never enters a key; bessemer's `SR-1/SR-2/TG-1/TG-2/EF-1`
  score as "FALSELY ADDED" although the integration plan (`plans/02`) confirmed
  them drawn on pages 6–7 — the key, not the pipeline, is short.
- `takeoff-eval.mjs:57` runs **tagged-only** by default
  (`OPENTAKEOFF_EVAL_FULL_SWEEP` unset), so unlabeled-geometry disclosure is
  never scored.
- Coverage: 7 scored sets of 117 compile keys; `bulk/` (81 documents) is absent
  from this checkout (`ls bulk` → 0), so ~90 `reconcileWorkflow` tests skip on
  missing PDFs (`mcp/test/reconcileWorkflow.test.mjs:78`). The reconcile
  regression suite is not executable in CI or in a fresh clone.
- The one occurrence-shaped truth that exists is `ground_truth/hvac/*.json`
  (tag-spelling corrections) and `takeoffs/T-HVAC-01-navfac-equipment/truth.json`
  (unique scheduled tags per family, no plan locations).

**F5. Production reachability and cost are unproven for the deployed UI.**
The browser's `sweep_schedule_row`, `count_marks`, and `reconcile_schedule_plan`
call an MCP endpoint from `localStorage` or `/__ot/*` on the Vite dev server
(`vite.corpusTakeoffApi.js:567 configureServer`). The Netlify static build has
neither; the UI then returns "Production … unavailable" (`TakeoffCanvas.jsx:8629`, `:8705`).
On the 75-sheet NAVFAC set an exhaustive one-row sweep ran past ten minutes and
was killed (`PROGRESS.md`, 2026-09-13) — that cost is geometry, not text. The
text-only work (find every tag occurrence, resolve each to a row) has never been
timed on its own because it has never existed as a separable step; it is wired
inside the geometric sweep. It has also never been budgeted for a full set end
to end through the UI.

**F6. Today the agent grounds rows only through the geometric sweep, and only when told to.**
The agent's takeoff contract (`web/src/lib/agentLoop.js:2029`) says: compile
first, then `reconcile_schedule_plan`, then `sweep_schedule_row` per mark "so
plan locations paint," then `highlight_citation`. The compile itself
(`compileProductionTakeoff`, `mcp/src/productionTakeoff.ts`) does no grounding;
its lines carry `installed_qty: null`. Grounding arrives only if the model
follows through, one geometric sweep per row, and the panel
(`web/src/components/TakeoffDataPanel.jsx:764`, `onOpenCitation`) can then
open a schedule or plan cite. So "show me this row's tag on the drawing"
exists, but it is optional, model-driven, geometry-priced, and absent from the
compiled line itself. The end state needs it to be part of the compile,
text-priced, and on every line without the model having to ask.

### 1.3 Smaller findings worth carrying into the plan

- **Row lookup is duplicated by hand.** `reconcileScheduleFamilyFromGraph`
  carries eleven "parity with compile uniqueFamily" comments; `corpusTakeoff.mjs`
  `uniqueFamily` (:750) is a second copy; `sweepScheduleRow`'s inline lookup is a
  third with logic (accessory narrowing, shadow collapse, trailing-digit alias)
  the other two lack. `buildPlanSetTakeoff` re-implements the alias retry
  (`takeoff.ts:481–495`).
- **`resolve_tag` resolves rooms only** (`sheetgraph.ts:9144` filters
  `kind === "room-finish"`). There is no cheap "which row is `VAV-1`?" verb; an
  agent must run a geometric sweep to learn a row's identity.
- **Text-counted promotions exist and are mode-dependent.** Under luminaire
  quorum ≥10, air-device quorum ≥10, roof `RD/HB` quorum ≥4, and
  individually-marked single occurrence, `sweepScheduleRow` counts text as a
  match with `text_counted: true` (`session.ts:5057–5147`), only when
  `verifyTaggedGeometry` is false. Reconcile and the scored pipeline pass `true`,
  MCP `sweep_schedule_row` defaults to `false`. Same tool, two answers by caller.
- **Evidence grading is a separate lane and is not touched.** `tag_text_only`
  reconciles to `AMBIGUOUS` for installed quantity; only geometry or an explicit
  note releases one (`schedulePlanReconcile.mjs:167–170`, `takeoff.ts:539–545`).
  This plan leaves that doctrine and that code alone. The ledger's `drawn_count`
  is a new, separate column; it never feeds `installed_qty`.
- **Redundant-view dedup is real and load-bearing** (`dedupeCrossDisciplineRoomViews`,
  `dedupeAlignedSameSheetViews`; 25 tests). The 09-07 over-counts on itd-d1-lab
  (`TP-2` 12→23, `TD-1` 2→8, `US-1` 1→7) are plumbing fixtures redrawn across
  views — occurrence classification, not symbol matching, is the fix surface.
- **Known open misses today:** bldg5406 `EF-1/EF-4/EF-5/CH-1/AS-1` rowsym;
  baker-county 5 tags whose table is never extracted (`CU-1..`, table recall,
  out of scope here but must be disclosed, not zeroed).

---

## 2. Definition of done

A tag ledger exists for every loaded set and, on a held-out document never
used to fix anything, all of the following measure true. D1–D3 are the
tag → row direction; D4 is row → tag; the rest are production properties.

| # | Criterion | Measured by |
|---|---|---|
| D1 | Every tag-shaped text occurrence on every sheet appears in the ledger exactly once with sheet, bbox, text as drawn, rotation, and `recovered_via` | ledger-eval occurrence recall/precision vs Phase 0 keys |
| D2 | Every occurrence carries one class: `ROW_LABEL`, `PLAN_INSTANCE`, `NOTE_MENTION`, `LEGEND_ENTRY`, `DETAIL_CALLOUT`, `TITLE_BLOCK`, `UNCLASSIFIED` | class accuracy vs keys |
| D3 | Every `PLAN_INSTANCE` resolves to exactly one row (`row_id`, cell citation) or to `UNSCHEDULED` / `AMBIGUOUS(candidates)` — never silently dropped | row-resolution accuracy vs keys; zero occurrences absent from output |
| D4 | Every schedule row lists every occurrence that resolved to it (`instances[]`, `drawn_count`, per-sheet breakdown); rows with none are `SCHEDULE_ONLY`; `PLAN_ONLY` rows are minted from `UNSCHEDULED` occurrences | row→tag recall/precision vs keys (inverse of D3, checked independently) |
| D5 | One grammar, one occurrence finder, one row resolver — used by MCP, UI, agent, compile, reconcile | parity tests; grep shows one implementation |
| D6 | No filename, sheet number, tag literal, or corpus id in production logic | review + held-out gate |
| D7 | Whole-set ledger for a 75-sheet set completes inside a stated budget through the deployed UI, with no geometry call on the path | timed run, Playwright, call-graph assertion |
| D8 | Sheets skipped for role are disclosed with the count of tag-shaped text they carry | ledger `skipped[]` |
| D9 | `drawn_count` is never written into `installed_qty`, `quantity`, or any EA total | unit test on the reconcile/compile producers |
| D10 | The literal prompts "Run a control valve takeoff", "Run a BAS takeoff", "Run an HVAC takeoff" through the unmocked browser Agent produce a takeoff whose every line carries its drawn instances (or a named disclosure), and clicking any line opens the sheet at the tag's bbox with the schedule cell highlighted alongside | Playwright on the keyed sets and two held-out sets; DOM + export assertions |

---

## 3. The plan

Each phase ends at a gate. No phase starts before the previous gate is
measured, except where marked parallel.

### Phase 0 — Ground truth first (the plan executes this; the audit did not)

**Purpose.** Learn whether we already do this well, partially, or not at all —
per failure class, with numbers — before touching code. The audit's hypotheses
(H1–H8 below) become measurements here.

**0.1 Re-establish baselines.**
```
cd opentakeoff/web && npm ci && npm run check
cd ../mcp && npm ci && npm test
node --import tsx scripts/corpus-eval.mjs ../../opentakeoff-corpus --report
OPENTAKEOFF_EVAL_FULL_SWEEP=1 node --import tsx scripts/takeoff-eval.mjs ../../opentakeoff-corpus bessemer bldg5406-hvac-demo
```
Record both tagged-only and full-sweep numbers side by side. Stage `bulk/`
(`scripts/stage-bulk-corpus.sh`) and run `npm run test:shared-path` so the
~90 reconcile tests actually execute; record skip count before/after.

**0.2 Author the occurrence-level key.** New key type `keys/<set>.tagocc.csv`:

```
sheet,page,text_as_drawn,x0,y0,x1,y1,rot,class,row_table,row_key,note
```
- `class` ∈ ROW_LABEL | PLAN_INSTANCE | NOTE_MENTION | LEGEND_ENTRY | DETAIL_CALLOUT | TITLE_BLOCK | OTHER
- `row_table`/`row_key` filled for ROW_LABEL and PLAN_INSTANCE; `UNSCHEDULED` when the plan draws a tag no schedule lists
- No geometry column. What a human reads off the render is the tag text, its position, what kind of text it is, and which row it names. Nothing about bodies, leaders, or bubbles.
- The same key yields the row → tag truth by inversion: for every `row_table`/`row_key`, the set of occurrences that name it.
- Authored **from renders** (`mcp/scripts/render-page-hires.mjs`), scope written
  before any pipeline output is looked at, never edited to pass. Same discipline
  as `keys/HELDOUT.txt`.

Sets, chosen to hit every hypothesis:

| Set | Why |
|---|---|
| bessemer (in repo) | split-run tags `SR`/`-`/`1`; the "falsely added" five |
| itd-d1-lab | stacked hexagon bubbles `EF` over `1`; cross-view over-counts; two plan scales |
| bldg5406-hvac-demo | 5 known rowsym misses; compound `AC-1/ACCU-1` |
| baker-county-eoc | compound luminaire `R1 /C-11`; `RTU-01` vs `RTU-1` spelling |
| navfac-cherry-point-atc | multi-hyphen valve marks `CV-CHW-BP-A`; 75 sheets; performance |
| federal-mech | dense VAV set |
| 3–5 held-out bulk documents | one with `M2xx` sheet numbering, one with rotated tags, one with tags on `unknown`-role sheets, one plumbing-heavy set |

Budget: ~2 sheets/hour by hand for dense plans. Author plan sheets fully; author
schedule sheets for ROW_LABEL occurrences only.

**0.3 Build the ruler.** `mcp/scripts/tag-ledger-eval.mjs`: bbox-IoU match
(≥0.5) between key occurrences and pipeline occurrences; report per set and per
class, in both directions:
- tag → row: occurrence recall, precision, class accuracy, row-resolution accuracy;
- row → tag: for every key row, the pipeline's `instances[]` vs the key's inverted set (recall, precision, `drawn_count` exact);
- binned misses (`missed-occurrence`, `wrong-class`, `wrong-row`, `unresolved-should-resolve`, `phantom`, `row-missing-instances`, `row-extra-instances`).

Deliberately dumb; never tuned to a score. Until Phase 3 exists, the baseline
"pipeline occurrences" are the text facts the current code already computes
before any geometry runs: `Session.tagOccurrencesOnSheet` for every row key on
every sheet plus the inline row lookup at `session.ts:3677`, exposed through a
small read-only script (no matching, no fingerprints). A `--producer` flag
selects the source so Phase 3's ledger is compared on identical keys.

**0.4 Measure the hypotheses.** Each gets a number and a one-line verdict in
`opentakeoff-corpus/TAG_LEDGER_BASELINE.md`:

| # | Hypothesis from audit | Measurement |
|---|---|---|
| H1 | Tags on `unknown`-role sheets are never counted | count of key PLAN_INSTANCE rows on sheets the graph calls non-plan |
| H2 | `VAV1`/`VAV 1` drawn vs `VAV-1` scheduled is a miss | missed-occurrence bin filtered to hyphen/space-variant text |
| H3 | First-non-empty ladder drops mixed split/whole tags on one sheet | missed-occurrence bin where a sibling exact hit exists on the same sheet |
| H4 | Rotated tags are missed | missed bin with `rot ≠ 0` |
| H5 | Orphan tags (no row) are invisible | count of key `UNSCHEDULED` rows vs any pipeline output mentioning them |
| H6 | Over-counts are cross-view redraws (class problem, not geometry) | itd-d1-lab `TP-2`/`TD-1`/`US-1` occurrences by view |
| H7 | Note mentions and legend entries leak into counts | wrong-class bin PLAN_INSTANCE←NOTE/LEGEND |
| H8 | Row lookup disagrees across the three copies | for every key PLAN_INSTANCE, compare `sweepScheduleRow` row vs `uniqueFamily` row vs `reconcileScheduleFamilyFromGraph` row |

**0.5 Cost baseline.** Time the text-only work in isolation on navfac
(75 sheets): occurrence enumeration for every row key on every sheet, plus row
lookup for every occurrence, via the 0.3 script. Record wall time and peak RSS
post-index. Separately record whether the deployed static build can reach the
Session path at all. Do not time the geometric sweep; it is not on this plan's
path.

**Gate 0.** Keys for ≥9 sets committed; ruler committed with its own unit tests;
baseline table filled; each hypothesis has a verdict (confirmed / refuted /
partial with size). Only then decide which of Phases 1–4 are needed and in what
order — the sequence below is the expected one, and Phase 0 may reorder it.

### Phase 1 — One grammar, one occurrence finder (shared module)

New `web/src/lib/tagOccurrences.ts` (pure; spans in, occurrences out), used by
`Session.tagOccurrencesOnSheet`, `Session.countMarks`, `symbollabels.labelTokens`,
and the UI.
- Canonical identity = `markid.markKey` (hyphen/space-insensitive; digits
  identity). Retire `MARK_RE`, fold `LABEL_TOKEN_RE` and `isEquipTag` into one
  documented grammar with named classes (`hyphenated_equipment`, `short_mark`,
  `digitless_device`, `compound_label`, `count_prefixed`).
- Recovery strategies run as a **union** with dedupe by bbox, each hit tagged
  `recovered_via` (exact | compound | authored_count | split_hyphen | fragmented
  | deep_chain | family_suffix | stacked | rotated). Precision guards stay
  (token boundary, short-mark overcount, sheet-number suffix).
- Rotated runs: rotate the fragment-chain text-box positions by the span's own `rot`.
- Stacked `VAV` over `1` handled by `stackedEquipmentTagTokens`, moved here.
- Every hit records the vocabulary check from `spanAnswersFor` (shared bare
  marks stay unresolved with candidates).

Gate 1: tag-ledger-eval occurrence recall ≥ Phase 0 baseline + the size of
H2/H3/H4 combined, precision not below baseline on any set; takeoff-eval and
rowsym not below baseline; `markid.ts` has production importers or is deleted.

### Phase 2 — One row resolver (shared module) and a real `resolve_tag` for equipment

Extract `resolveScheduleRow(graph, tag, opts)` from `sweepScheduleRow`
(`session.ts:3677–~4000`) into `web/src/lib/scheduleRowResolve.ts`, returning
`{status: resolved|ambiguous|none, row, table, candidates[], notes[]}` with the
existing rules intact (identity column precedence from `rowIdentityTag`,
trailing-digit alias, accessory-row narrowing, shadow-extract collapse,
drawing-group scope, compound keys).
- Callers: `sweepScheduleRow`, `countMarks`, `buildPlanSetTakeoff` (drop the
  duplicated alias retry), `reconcileScheduleFamilyFromGraph`, and
  `corpusTakeoff.uniqueFamily` (delete the "parity with compile" copies; one
  implementation, two consumers).
- MCP: extend `resolve_tag` to equipment marks (room path unchanged) or add
  `resolve_mark`; update the four doc surfaces and `TOOL_STAGES` per
  `opentakeoff/AGENTS.md`.

Gate 2: H8 disagreement count = 0 on all keyed sets; `planToolParity` and
`reconcileWorkflow` green with `bulk/` staged; row-resolution accuracy on the
ledger ≥ baseline.

### Phase 3 — The Tag Ledger (occurrence-first product)

Shared `buildTagLedger(session, graph)` on the Session path, then MCP
`tag_ledger`, UI panel, and CSV/XLSX export.
- Enumerate occurrences on **every** sheet (Phase 1 finder), classify each
  (D2) using: inside a table region → ROW_LABEL; legend-role sheet or legend
  band → LEGEND_ENTRY; detail-callout shape (`detailCallouts`) → DETAIL_CALLOUT;
  title-block band → TITLE_BLOCK; prose neighbourhood (sentence-length run on
  the same baseline) → NOTE_MENTION; else PLAN_INSTANCE.
- Resolve each PLAN_INSTANCE with Phase 2; orphans → `UNSCHEDULED`; shared bare
  marks → `AMBIGUOUS` with candidates.
- **No geometry on this path.** No fingerprint, no body attachment, no
  luminance, no `symbolsweep` matching call. A call-graph test asserts it.
- Cross-view dedup (`dedupeCrossDisciplineRoomViews`, `dedupeAlignedSameSheetViews`)
  is text-and-position logic already; it becomes an occurrence attribute
  (`redundant_view_of`), never a deletion, so `drawn_count` and
  `distinct_count` are both reported.
- Row → tag: every row gets `instances[]` (sheet, bbox, text as drawn,
  `recovered_via`, `redundant_view_of`), `drawn_count`, `distinct_count`, and a
  per-sheet breakdown; rows with none are `SCHEDULE_ONLY` with the sheets that
  were searched named.
- Reconcile consumes the ledger for the text columns: `PLAN_ONLY` from
  `UNSCHEDULED`; `tagged_plan_qty` and `plan_tag_cites` from `instances[]`.
  `installed_qty` and the geometry cites keep coming from where they come from
  today; this plan does not route around or into that lane.
- `sweep_schedule_row`'s own row lookup and occurrence discovery become calls
  into the Phase 1–2 modules; its geometric matching is left as is.
- Disclosure: `skipped_sheets[{sheet, role, tag_shaped_text_count}]` so a
  skipped `M2.01` with 40 tag-shaped runs is loud.

**3.1 Wire the ledger into the compiled takeoff line.** Every line emitted by
`compileCorpusTakeoff` / `compileProductionTakeoff` for `hvac_equipment`,
`control_valves`, and the served-equipment / device tags of `bas_points`
carries `plan_instances[]` (sheet, bbox, text as drawn, `recovered_via`,
`redundant_view_of`), `drawn_count`, `distinct_count`, and
`grounding_status` ∈ `DRAWN` | `NOT_DRAWN` | `AMBIGUOUS`. This happens inside
the compile on the shared Session path — not as a follow-up tool the model may
or may not call. The existing `installed_qty: null` stays null.

**3.2 The agent contract.** `agentLoop.js`'s takeoff instructions change from
"compile, then reconcile, then sweep so it paints" to "compile; every line is
already grounded; report `grounding_status` per line and list `UNSCHEDULED`
tags." `sweep_schedule_row` remains available as the optional geometric lane
and is no longer on the required path. The four MCP doc surfaces and
`TOOL_STAGES` follow.

**3.3 The panel.** Every takeoff line gets a "show on drawing" action that opens
the plan sheet at the first instance's bbox with the schedule cell highlighted
in the schedule sheet, and a per-instance list to step through the rest
(`TakeoffDataPanel.jsx` `onOpenCitation` already opens one cite; this extends it
to the instance list). `UNSCHEDULED` tags render as their own lines with the
same action, pointing at the plan only.

**3.4 Export.** CSV/XLSX carry `drawn_count`, `distinct_count`,
`grounding_status`, and one instance-row sheet (`tag, sheet, page, bbox, text_as_drawn`).

Gate 3: D1–D5, D9, and D10 measured on the keyed sets. The three literal prompts
run through the real Agent UI on itd-d1-lab, navfac, and bldg5406; every line
shows `DRAWN` with openable instances, `NOT_DRAWN` with the searched sheets
named, or `AMBIGUOUS` with candidates. Screenshots and receipts land under
`opentakeoff/docs/bas-production/evidence/` the way the existing Agent proofs do.

### Phase 4 — Sheet coverage and role hardening

Driven by H1 and the Phase 3 `skipped_sheets` counts: extend `classifySheetRole`
so plan-role evidence includes sheet-number families beyond `1xx`, enlarged
plans, and roof/site plans; keep demolition excluded but disclosed with counts;
handle match-line continuations as one plan. Structure first, regex confirms
(GOAL.md rule 1).

**Not lower-priority than it looks.** Phase 0's federal-mech finding
(`opentakeoff-corpus/TAG_LEDGER_BASELINE.md`) quantified this on a real
document: 3 of the first 5 sheets misclassified away from `role: "plan"`,
including the two carrying the building's entire 58+-tag ground-floor VAV
population, confirmed by direct `tagOccurrencesForKey` calls to be
perfectly text-findable on those sheets — the occurrence ladder is not the
bottleneck, `sweep_schedule_row`'s plan-role gate (`session.ts:3639`,
`session.ts:4003-4009`) is. A flawless Phase 1–3 occurrence/row engine
still produces near-total silence on a document shaped like this one. Two
concrete, evidence-backed requirements from that finding, not just the
general hardening above:

`classifySheetRole` (`web/src/lib/sheetgraph.ts`) has no concept of
title-block position at all — it scores every span on the sheet as a flat
bag against `ROLE_SIGNALS` and the strongest hit wins, so "prioritize the
title block" is not a mechanism this classifier has; the real gaps,
verified directly against the live regex, are narrower and more specific
than that:

1. **Two real title shapes this classifier's plan regex cannot recognize
   under any tier**, found on federal-mech's own sheets #3 and #4 (word
   order confirmed against the live regex, not just inferred from the
   evidence field): a device/terminal-type title with no literal "PLAN"
   word at all ("GROUND FLOOR AIR TERMINALS" — `planBase.test(...)` is
   `false`), and a non-enlarged "<discipline> <drawing-type noun> PLAN"
   word order ("GROUND FLOOR DUCT PLAN" — "DUCT" sits between "FLOOR" and
   "PLAN", the same shape the enlarged-plan widening already fixed for
   "MECHANICAL ROOM ENLARGED DUCT PLAN" but this title isn't "enlarged").
   With no competing plan hit, whatever else matches on the sheet
   (a stray note containing "DETAILS", a small embedded "Room Schedule"
   table) wins outright, no dissent-halving even applies. Any widening
   must be checked against the same document's sheet #1 ("MECHANICAL
   FLOOR PLAN SYMBOLS" — a legend, not a plan — already a confirmed
   real false positive for the existing "FLOOR PLAN" shape) before being
   accepted, per this file's own "generalizes across ≥2 real documents"
   bar for touching this regex.
2. **Content-based promotion, independent of stated title.** Federal-
   mech's page #2 is a genuine ambiguity regex widening cannot fix: a
   real, to-scale, 58-VAV-tag floor plan whose own title block reads
   "HVAC ZONE LEGEND" (it also carries a hatch-legend key, so the title is
   accurate to *part* of the sheet's purpose). A sheet whose title says
   legend/schedule/other but which has substantial to-scale linework plus
   a high density of distinct equipment-family tags must be detectable
   and promoted into the plan search space regardless of its stated
   title.

Full detail, including the exact regex tested and its confirmed
false-positive direction: `opentakeoff-corpus/TAG_LEDGER_BASELINE.md`,
"federal-mech — sheet-role misclassification breaks `sweep_schedule_row`
almost completely." Not attempted in that session: `classifySheetRole` is
shared, corpus-wide, and far larger-blast-radius than the two occurrence-
ladder functions fixed in the same session — a change here needs the full
corpus eval re-run clean afterward, which is exactly this phase's own
gate, not something to rush ahead of it.

Gate 4: zero key PLAN_INSTANCE occurrences on sheets the graph skips, across
keyed sets and the held-out documents. Add federal-mech's page `#2`
(58 `VAV-N` tags, title "HVAC ZONE LEGEND") and page `#4` (title "GROUND
FLOOR DUCT PLAN") as named regression fixtures for this gate specifically —
both must classify `role: "plan"` (or otherwise enter the search space) once
this phase is done.

### Phase 5 — Production reachability and budget (parallel with 3–4)

- Decide and build one production path for the browser: a hosted Session
  service behind the same MCP contract, or the Session engine in a worker. The
  Vite bridge stays dev-only. Documented in `docs/DEPLOYMENT.md`.
- Budget: full-set ledger on the 75-sheet navfac set within a stated wall time
  (target under 30 s post-index — text only, from Phase 0.5 numbers);
  occurrence cache per sheet (`tagOccurrenceCache` already exists, :3520)
  persisted with the graph cache; deterministic output.
- Playwright: real documents, the three literal prompts, DOM + export equal to
  CLI, every line's "show on drawing" action verified to land on the tag text.

Gate 5: D7 timed and green in the deployed build.

### Phase 6 — Held-out gate and stop condition

Run tag-ledger-eval on the frozen `keys/HELDOUT.txt` documents that have Phase 0
keys and on two documents added after the last fix. Stop when a verification
pass on a new document turns up nothing the existing rules don't already
handle (GOAL.md §8 redundancy criterion), with D1–D8 measured true.

---

## 4. Laws (inherited, restated for this work)

- Structure classifies, regex confirms. No document, sheet number, tag literal,
  or corpus id in production logic.
- Keys are read-only once authored; a wrong key is corrected with a rendered
  proof and a changelog line, never edited to pass.
- The ledger reports drawn counts, never installed quantity. Text proves a tag
  was printed and which row it names; nothing in this plan claims more, and
  nothing in this plan changes how installed quantity is decided.
- No geometry on the ledger path. If a classification or resolution question
  seems to need a drawn body to answer, it is disclosed as `UNCLASSIFIED` or
  `AMBIGUOUS`, not solved with a sweep.
- Shared path for anything that decides "which row / how many / where"
  (`AGENTS.md`). Surface-specific only for chrome.
- Every miss is either fixed or disclosed by name in the output. Silence is a
  bug.
- Full suite before every push; focused affected sets first, cached full corpus
  after; forced-cold only at milestone gates.

## 5. Risks and unknowns

- **Phase 0 authoring is the bottleneck** and needs eyes on renders. Estimate
  60–120 sheet-hours across nine sets. Do not shortcut it with pipeline output.
- **`bulk/` is unbacked and absent here.** Phase 0.1 must stage it; if egress
  fails, Phase 0 keys still cover the seven in-repo sets and the plan proceeds
  with a smaller held-out tier, stated as such.
- **`sweepScheduleRow` is 1,811 lines.** Phases 1–2 extract its text parts
  (row lookup, occurrence discovery) into shared modules and call back into
  them; every geometric line in it is left exactly where it is.
- **Classification of NOTE_MENTION vs PLAN_INSTANCE** is the likely hardest
  precision problem once recall rises; Phase 0's wrong-class bin sizes it
  before we commit to a method.
- **Table recall** (the baker-county `CU-*` class) is out of scope and remains
  the ceiling on D3 for those rows; the ledger discloses them as
  `UNSCHEDULED` rather than dropping them, which is the honest outcome.
