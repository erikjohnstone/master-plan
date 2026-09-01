# Autonomous corpus-goal execution

The repository-wide mission is defined by `opentakeoff-corpus/GOAL.md`. Read it
before planning work anywhere in this repository. `opentakeoff/AGENTS.md`
continues to govern implementation and verification inside `opentakeoff/`.

## Product positioning — durable authority (not a startup)

**This is not a startup product and must not be planned as one.**

OpenTakeoff is being built as a **Siemens tool** that Siemens gives **for free**
to:

- Siemens estimating teams
- Siemens direct sellers
- mechanical / controls contractors in the Siemens channel

**Phase 1 — takeoff brain.** Deterministic, near-immediate HVAC/BAS/valve
schedule compile + schedule↔plan reconcile on real PDF sets (shared
Session+ODL path). That is the wedge and the current corpus loop.

**Phase 2 — Siemens product matching.** Legitimate matching logic from
takeoff quantities / marks / schedule attributes onto the **Siemens product
set** (spec Siemens, not a generic multi-vendor estimating marketplace).

**Commercial shape:** unpaid / free tool · Siemens-spec bias · speed-to-takeoff
first · catalog match second. Do **not** optimize for competing with paid
horizontal takeoff startups (Togal, Kamai, Rebar, et al.) on CSI-assembly
estimating OS features unless those features directly serve Siemens-channel
takeoff → Siemens-product match.

**Corpus note:** `GOAL.md` still forbids Siemens-supplied drawings as *test*
fixtures (public sets only). That is evaluation hygiene, not product identity.

When strategy conflicts arise (Brick/Haystack, CSI MasterFormat spine, paid
estimating parity, multi-vendor catalogs), prefer decisions that make
**free Siemens-channel takeoff → Siemens product match** more true.

## Shared production path — mandatory pre-change gate

**Before every code addition, removal, or change, ask and answer:**

> **SHOULD THIS BE ON THE SHARED PATH?**
> - **If yes → implement it on the shared path** (one module / Session pipeline
>   both UI and MCP consume). Do **not** add a UI-only or MCP-only fork.
> - **If no → keep it surface-specific** (canvas chrome, tiles, click UX, etc.).
>   Do **not** force unrelated UI interaction code into Session.

**Shared path means:** anything that decides schedule/table truth or answers
“what’s on the schedules / how many / where” — including sheet-graph
construction (`Session.graphForPipeline` = geometric + ODL), `compile_corpus_takeoff`,
`query_table`, `find_schedule`, `resolve_tag`, `sheet_graph`, and (as extracted)
`count_marks` / `sweep_schedule_row`. Entry points may differ (browser vs server);
extraction and query logic must not.

**Not shared:** pan/zoom, tile paint, drawing tools, markup chrome, download UX.

If unsure, default to **shared** for any quantity, cite, schedule title, or
MARK/points-list answer. Document the decision in the PR/commit body when
non-obvious.

## Coordinator policy

When working autonomously toward the corpus goal:

1. Keep implementation, testing, and integration on the coordinator VM as the
   critical path. Do not dispatch cloud workers unless the user explicitly
   re-enables them; repeated cloud-state failures made them negative expected
   value for the current run.
2. If cloud workers are re-enabled, use Composer 2.5 Fast unless the user
   explicitly changes the model. Assign only short, isolated, non-overlapping
   tasks; never make their output a dependency of coordinator progress.
3. While authorized cloud workers are active, maintain a recurring two-minute
   health check against their backend lifecycle state. Immediately account for
   workers in `ERROR`; do not rely only on delayed completion notifications or
   the last progress message visible in the UI.
5. Independently reproduce and verify every worker result before integrating
   it. Require exact before/after metrics, focused regression tests, and
   negative controls. A worker's claim is evidence to check, not proof.
6. Workers must reuse the verified baseline in
   `opentakeoff-corpus/PROGRESS.md`. They run only the affected set to
   reproduce a defect, then the affected sets plus small negative controls
   after implementation. Do not spend worker time rerunning the entire corpus.
   The coordinator runs the full corpus after integrating a batch of changes,
   or when the evaluation infrastructure itself is under test.
7. Never improve a score by changing a key/scorer, hardcoding a corpus
   identifier, weakening a threshold, or collapsing genuinely distinct
   devices. Prefer an honest documented ceiling to an unsafe heuristic.
8. Do not prioritize OCR, raster vision, or learned symbol detection until the
   user explicitly reopens that scope.
9. Keep `opentakeoff-corpus/PROGRESS.md` current with verified baselines,
   active work, accepted changes, rejected approaches, and the next queue.
10. Continue until `GOAL.md` is satisfied or the remaining ceiling has been
   demonstrated with reproducible evidence.
