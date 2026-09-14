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

## Phase 4 — autonomous schematic, control-flow, and riser extraction

This frontier is topological, not metric. It must not reuse floor-plan scale,
distance, or unconstrained planar symbol-count assumptions as a substitute for
connectivity. It is implemented on the shared graph path so Agent UI and MCP
cannot disagree about devices, connections, flow, or counts.

**Principal-engineer acceptance bar.** A detected title, a bag of labels, or an
untyped vector graph is not an understood diagram. The production takeoff path
may describe a schematic/riser as understood only when it can reconstruct, with
per-claim evidence, the system and medium; equipment, ports, inline and tethered
devices; branch/junction/crossing semantics; authored flow direction; floor and
off-page continuation; normal/fail/control state where printed; and the
applicable schedule, points-list, and sequence requirements. It must explain
what each reconciled component does in this authored system and surface design
conflicts the way a principal mechanical/BAS engineer would, while preserving
unknowns wherever the documents do not prove an answer. Generic engineering
expectations may identify a review question but may never become project truth
without cited project evidence.

- Research and declare the supported diagram grammar before implementation:
  duct/pipe/process media, solid/dashed/signal line styles, arrows, junctions,
  crossings without connection, off-page connectors, equipment envelopes,
  instrument bubbles, inline devices, callouts, floor datums, and risers.
  Standards-derived mappings are versioned and cited; project legends and
  explicit drawing annotations override generic conventions.
- Construct an evidence-preserving multilayer graph from native PDF vectors and
  text. Nodes represent equipment ports, devices, instruments, junctions,
  connectors, and floor crossings; edges retain medium, line style, direction,
  page/bbox/vector provenance, and confidence. Ambiguous crossings or arrowless
  segments remain unresolved rather than receiving invented direction.
- Recover equipment envelopes and ordered flow paths only when supported by
  connected geometry, arrow evidence, labels, and port adjacency. Report
  branches, bypasses, parallel trains, recirculation loops, and disconnected
  fragments without forcing them into a single linear chain.
- Detect circular, hexagonal, and project-specific instrument/tag containers,
  plus tethered and inline control devices. Parse their authored tokens, bind
  them to the project legend or a cited maintained mapping, and infer AI/AO/DI/DO
  only when signal type, controlled device behavior, or explicit point-list/SOO
  evidence supports it. A mnemonic such as `D`, `M`, `V`, or `DP` alone is not
  sufficient to invent I/O type or modulation.
- Bind schematic titles, equipment tags, typical/template applicability, and
  explicit references to schedule rows and SOO sections. Reconcile coil/device/
  instrument capabilities in both directions and emit cited missing, extra,
  ambiguous, and conflicting-scope findings.
- Detect named floor datum lines and trace vertical risers across them, including
  off-page continuation. Count isolation/balance/control valves, meters,
  sensors, and other inline/tethered devices only from one-to-one cited graph
  instances; distinguish a repeated typical diagram from installed multiplicity.
- Keep topology separate from floor-plan installed-quantity evidence. A device
  shown in a schematic proves design intent and connectivity, not automatically
  one installed plan instance. Reconciliation exposes both operands and the
  rule or reviewed multiplier connecting them.
- Add authored ground truth for complete graphs, edge direction, connectivity,
  crossings, instrument tokens/classes, equipment binding, floor assignment,
  per-device counts, conflicts, and unresolveds. Include dense negatives,
  arrowless diagrams, dashed-line ambiguity, repeated typicals, multi-page
  continuations, and project-specific legends.
- Gate adoption on exact per-instance citation/localization plus graph metrics,
  not count alone: node/device precision and recall, edge precision and recall,
  direction accuracy, connected-component integrity, schedule/SOO binding
  accuracy, floor attribution, engineering-role/state accuracy, explanation
  faithfulness, deterministic repeatability, runtime, and memory. The real-PDF
  gate must include at least one air-system control schematic, one hydronic
  piping/control diagram, one multi-floor mechanical riser, and one BAS network
  riser from different projects; synthetic geometry is only a unit test.

## Phase 5 — production verification

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
5. schematic/riser extraction meets its authored node, edge, direction,
   binding, citation, and quantity gates on diverse real projects, while every
   unsupported topology remains visibly unresolved;
6. the implementation, tests, method ledger, screenshots, and user walkthrough
   are committed, pushed, reviewed through a green PR, and merged to `main`.

“Perfect” means exact on the declared and independently reviewed production
gates with visible uncertainty handling. It never means claiming certainty on
unseen documents or unsupported evidence.

## Verification checkpoint — 2026-09-13

The shared symbol path now runs rigid and bounded-affine recognition as nested
competitors and resolves labeled placements by exact source tag bbox. This
removes the earlier eval-only affine-off escape hatch: the current 47-case
manifest contains zero `affine:false` overrides, and a fresh uninterrupted
Session-product run passes **47/47** exact counts and authored one-to-one
localizations. The Agent/MCP output declares `transform_competition` and
`label_corroboration`; schema round-trip tests prove neither explanation is
stripped before it reaches the Agent. The browser fallback now preserves the
same rotation, mirror, affine and schedule-disambiguation options through the
production CLI into Session. VectorGrid, table rows, citations and bbox
semantics were not changed.

This is a symbol-path checkpoint, not completion of the larger BAS goal. The
fresh-server 47-case browser gate and the remaining multi-project schematic,
riser, full-Agent and holdout gates are still required.
