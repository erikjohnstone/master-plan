# Goal: one-prompt, evidence-backed BAS takeoff through the real Agent UI

Date started: 2026-09-12  
Branch: `codex/agent-bas-end-to-end`  
Starting point: `origin/main` at `58a9c91f`, plus the completed BAS workflow
branch through `77c47ade`.

## Outcome

An estimator can load an unfamiliar HVAC/BAS drawing set and ask the Agent,
in ordinary language, to run a complete BAS takeoff. One bounded workflow then
performs every supported deterministic stage in the correct order:

1. discover and compile equipment schedules, control-valve/damper schedules,
   BAS point lists, and sequence-of-operations regions;
2. compute source-backed BAS point totals and supported engineering math;
3. reconcile schedule quantities, equipment/template applicability, and
   corroborated plan instances without converting mentions, legends, details,
   or unresolved candidates into installed quantities;
4. connect grounded quantities to equipment, point/SOO, assembly,
   responsibility, engineering, revision, review, and export workflows;
5. return a readable cited result plus a visible exception queue for everything
   that is ambiguous, unsupported, refused, or awaiting human approval.

The Agent must do the deterministic work, not merely explain which buttons a
human should press. Human review remains mandatory for bid release. The product
must never imply that a finite corpus proves perfect accuracy on every future
drawing or that plan evidence proves physical/as-built installation.

## Non-negotiable truth contract

- Schedule/table/quantity/SOO truth is implemented once on the shared
  `Session.graphForPipeline` and shared `web/src/lib` path consumed by both UI
  and MCP. Agent orchestration and presentation may remain surface-specific.
- Preserve VectorGrid text, rows, columns, merged headers, citations, bboxes,
  page identity, and existing table behavior. No VectorGrid change without a
  reproduced extraction defect and a before/after regression gate.
- Do not change authored ground truth, scorers, expected quantities, or
  matching thresholds to create a green result. Do not hardcode corpus IDs,
  filenames, pages, sheet numbers, tags, or answers in production code.
- `scheduled_quantity`, `corroborated_plan_quantity`, `unresolved_quantity`,
  and user-approved scope remain distinct fields. Missing evidence is unknown,
  never zero. A detected candidate is not automatically an installed device.
- Every accepted and rejected plan instance retains page, bbox/geometry,
  source version, match method, score/evidence, exclusion/hold rationale, and
  deterministic replay data.
- BAS math uses printed evidence or explicit reviewed policy inputs. It must
  not invent controller capacity, spare percentages, signal compatibility,
  responsibility, accessories, multipliers, or sequence applicability.
- Agent proposals are not human approvals. Release/readiness remains blocked
  by unresolved material evidence and requires explicit human action.
- No pricing, costing, labor, or product-selection scope.

## Starting defects that must be reproduced

1. The true browser/UI symbol-sweep path passes 36 of 47 authored cases; the
   nominal 47/47 CLI result relies on per-case `affine: false` overrides in
   seven ground-truth fixtures and is not an acceptable product measurement.
2. Dense, repetitive symbol fields can refine multiple candidates toward a
   neighboring/shared attractor, confidently localizing a real-looking match
   at the wrong instance and reducing one-to-one recall.
3. The manual marquee product path has no safe retry/control equivalent to the
   Agent guidance that suggests disabling affine matching.
4. `corpusTakeoff.mjs` contains three literal `quantity: 1` assignments. Each
   must be classified as either intentional row-instance cardinality or an
   incorrect downstream schedule quantity, then renamed or corrected so no
   reconciliation consumer can confuse the meanings.
5. A generic BAS request currently compiles point lists and asks for grounding,
   but does not guarantee a single orchestrated pass through separate SOO
   compilation, BAS math, all applicable reconciliation, workflow inspection,
   result presentation, and export.

## Phase 0 — integrate and freeze the real baseline

- Merge the six completed BAS workflow commits with current `main`; resolve and
  test conflicts in `agentTools`, MCP tools, workflow routing, and canvas wiring.
- Run the exact UI-path 47-case harness with authored overrides ignored and
  record pass/fail, per-instance precision/recall/localization, false additions,
  unresolveds, runtime, and deterministic repeatability.
- Run the CLI path under the same effective options and prove UI/MCP parity.
- Freeze focused dense-grid failures, affine/stretch successes, confusing
  negatives, and at least one multi-page BAS project as regression fixtures.
- Record package/runtime versions and distinguish pre-existing unrelated test
  failures from new regressions.

## Phase 1 — fix symbol spotting on the shared path

- Diagnose failures instance-by-instance. For each authored instance, retain
  its nearest rigid, affine, withheld, and competing candidates and the exact
  one-to-one assignment outcome.
- Preserve a correct rigid localization when affine refinement does not provide
  a demonstrably better, uniquely supported correspondence. Refinement may
  improve deformation tolerance; it may not move an already-good candidate to
  a neighboring repeated instance.
- Replace local winner-takes-all/shared-attractor behavior with deterministic
  candidate competition that enforces one-to-one localization across a repeated
  field where the evidence supports it. Measure assignment methods against both
  real dense grids and similar-symbol negatives before adoption.
- Treat transform plausibility, correspondence uniqueness, base-tolerance
  support, label evidence, neighborhood spacing, and unmatched geometry as
  separate evidence—not a single forgiving score. Keep every non-winning high
  candidate disclosed as held/rejected with a reason.
- Expose a safe Agent and manual-review fallback for ambiguity. Never silently
  switch affine off to claim success; the selected mode and reason must be in
  the result.
- Accept an engine change only when it improves actual UI-path recall with zero
  new false additions, zero regression on previously correct localizations,
  and bounded latency/memory.

## Phase 2 — make quantity semantics unambiguous

- Trace the three literal-one assignments from schedule extraction through
  compiled takeoff, reconciliation, BAS assignment demand, exports, snapshots,
  and Agent summaries.
- Define and enforce typed quantity provenance: printed scheduled quantity,
  number of unique schedule rows/tags, explicit typical multiplier,
  corroborated plan instances, candidate instances, and approved scope.
- Reconciliation must compare like with like and state the operands. It must
  not compare a row-cardinality placeholder to a detected installed count.
- Add tests for printed QTY greater than one, repeated tags across buildings,
  typical/template rows, existing/demolition scope, schedule-only rows,
  plan-only rows, and unknown plan coverage.

## Phase 3 — one deterministic Agent BAS orchestration

- Add one explicit workflow/intent for prompts such as “run a complete BAS
  takeoff.” It must build and execute a deterministic plan rather than rely on
  the language model to remember a sequence of independent tools.
- Required stages: project/sheet survey; HVAC equipment compile; BAS points
  compile; SOO compile; control-valve/damper compile plus embedded-coil gaps;
  supported BAS math; equipment/template applicability; schedule-plan
  reconciliation; workflow/issue inspection; cited result/export.
- Stages declare `complete`, `partial`, `refused`, `not_applicable`, or `failed`
  independently. One missing stage must not erase valid work from the others or
  permit the overall result to claim completeness.
- Resume/retry must be idempotent and reuse source-versioned results. Cancellation
  and failures must leave inspectable partial output, not corrupt project state.
- The final Agent response starts with estimator-readable totals and coverage,
  then exceptions and next human decisions. Raw tool payloads stay in the
  results workspace, not dumped into chat.
- UI and packaged MCP execute the same takeoff operations and return parity on
  quantities, statuses, citations, and refusals.

## Phase 4 — production verification

- Unit and adversarial tests for symbol correspondence, quantity provenance,
  orchestration state, retries, malformed inputs, migrations, and exports.
- Actual 47-case UI-path symbol gate with no per-case production overrides.
  Target: 47/47 exact counts and authored one-to-one localization, zero false
  additions, two identical consecutive runs. Any honest unreachable case is
  reported as an unresolved ceiling, never converted to a pass.
- Re-run all existing symbol, legend, schedule/table, takeoff, reference,
  graph/rowsym, citation/bbox, BAS workflow, snapshot/revision, UI/MCP parity,
  typecheck, lint, build, and Python gates.
- Run at least five diverse real multi-page BAS projects through the actual
  Agent UI, including dense repeated equipment, explicit point lists, narrative
  SOO, valves/dampers, typical templates, and an evidence-poor negative set.
- On a reserved holdout not used to design the fixes, report per-document
  precision, recall, false additions, misses, unresolveds, quantity deltas,
  runtime, memory, and every incomplete stage. Do not publish only an aggregate.
- Capture and inspect the complete browser journey: prompt, progress, cited
  result table, plan highlights, SOO evidence, exceptions, review, and export.

## Completion gate

This goal is complete only when:

1. one ordinary Agent prompt executes the complete deterministic BAS workflow
   without requiring the user to issue separate point/SOO/reconcile commands;
2. every reported quantity and BAS calculation has explicit provenance and
   source citations, with installed-plan counts kept separate from schedules;
3. the actual product symbol paths meet the stated 47-case gate without
   fixture-only overrides or hidden retries, or the remaining reproducible
   ceiling and required next technology are documented honestly;
4. the real multi-page and holdout journeys pass their predeclared gates with
   no regression to VectorGrid or existing extraction behavior;
5. the implementation, tests, method ledger, screenshots, and user walkthrough
   are committed, pushed, reviewed through a green PR, and merged to `main`.

“Perfect” means exact on the declared and independently reviewed production
gates with visible uncertainty handling. It never means claiming certainty on
unseen documents or unsupported evidence.
