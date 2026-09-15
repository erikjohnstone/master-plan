# Autonomous corpus-goal execution

The repository-wide mission is defined by `opentakeoff-corpus/GOAL.md`. Read it
before planning work anywhere in this repository. `opentakeoff/AGENTS.md`
continues to govern implementation and verification inside `opentakeoff/`.

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

**Subagents allowed.** The user has explicitly re-enabled delegation. The
coordinator may dispatch `Task`/`Agent` subagents and cloud workers for
corpus-goal work, subject to the same discipline as coordinator-only work:
narrow, well-scoped tasks with a clear owner, no worker holding the critical
path hostage, and every worker result independently reproduced and verified
before it is trusted (see 5 below).

1. Keep final implementation, testing, and integration decisions on the
   coordinator as the critical path. Delegated work (subagents or cloud
   workers) is welcome, but the coordinator remains responsible for
   verifying and integrating it — never merge a worker's claim unchecked.
2. When dispatching cloud workers, use Composer 2.5 Fast unless the user
   explicitly changes the model. Assign only short, isolated, non-overlapping
   tasks; never make their output a dependency of coordinator progress without
   independent verification first.
3. While cloud workers are active, maintain a recurring two-minute
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
8. Use OCR, raster vision, learned symbol detection, and local VLM/AI on
   the shared vector pipeline (`Session.graphForPipeline` / `vectorTakeoffPipeline.ts`)
   when vector extraction alone cannot reach the answer — disclosed, cite-backed,
   corroborated against schedule/plan evidence when possible. Vector-first always.
9. Keep `opentakeoff-corpus/PROGRESS.md` current with verified baselines,
   active work, accepted changes, rejected approaches, and the next queue.
10. Continue until `GOAL.md` is satisfied or the remaining ceiling has been
   demonstrated with reproducible evidence.
