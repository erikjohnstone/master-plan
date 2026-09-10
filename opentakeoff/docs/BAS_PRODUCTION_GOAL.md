# Production BAS takeoff workflow — deterministic, evidence-backed, non-commercial

## Objective

Research, design, implement, and verify five complete BAS takeoff workflows:
1. Point-list and sequence-of-operations (SOO) coverage.
2. Control-template assignment to actual equipment.
3. Assemblies and responsibility tracking.
4. Engineering compatibility.
5. Review, drawing revisions, and takeoff issue controls.

After those five workflows, complete the research-gated final phase below for deformation-tolerant symbol extraction, plan reconciliation, and evidence-backed installed quantities, explicitly added by the user on 2026-09-09. This extension does not replace or shorten the five workflows.

Deliver an integrated, enterprise-quality workflow in the existing platform, supported by the available PDF corpus and independently checked evidence. This is not a pricing, labor, model-training, or broad platform-redesign project. The current BAS math engine is a foundation, not proof of complete project interpretation.

## Non-negotiable boundaries

- No costs, prices, quotations, monetary totals, labor hours, productivity rates, commercial estimating, or supplier/product catalogs. Do not change existing commercial functionality either.
- No new model training, metric models, learned detection, OCR, raster vision, or model-generated interpretations in these new workflows. Use available PDF text/vector data, deterministic algorithms, and explicitly recorded user inputs. Do not disable the existing Agent; its conversation may invoke the same deterministic tools but cannot become the authority for quantities.
- Specification-book ingestion is not selected for this goal. Drawing notes, legends, schedules, SOO, and relevant text inside the supplied drawing sets are in scope.
- During the first five workflows, reuse and investigate existing tag/sweep/legend evidence rather than launching a separate symbol-recognition rewrite. The user-authorized final phase below permits researched, measured hardening of the existing shared symbol engine. Do not lower matching thresholds or turn unresolved symbol candidates into installed counts.
- Preserve existing UI/MCP contracts and source citations/bounding boxes. Use additive, validated schema extensions and explicit migrations if persistence must evolve. Never silently reinterpret an existing field.
- All source interpretation, quantities, equipment joins, rules, engineering checks, and readiness decisions belong on one shared production path consumed by UI and MCP. UI layout and interactions remain surface-specific. Reuse the shared BAS Python engine for engineering math; no competing browser implementation.
- Work coordinator-only, on an isolated feature branch. Preserve user changes. Verify actual repository state and the earlier BAS commit/branch rather than assuming it landed on main. Do not merge, deploy, publish, or provision external services without a new explicit request.
- These task limits supersede broader historical corpus instructions authorizing vision, models, or unrelated expansion.

## Definition of “fully implemented”

Before coding each workflow, define its input contract, supported evidence patterns, complete user journey, unsupported conditions, and falsifiable acceptance tests. A completed feature must work from real input through durable state, source inspection, review, and export; no placeholder panels, demo-only data, hidden feature stubs, or transient-only implementations.

Support explicit, auditable uncertainty. Missing evidence is not zero, and “unsupported” is not “complete.” A useful unsupported-input diagnostic is necessary but does not by itself satisfy a feature's acceptance criteria. Do not declare success by turning every difficult case into a refusal. Track actual coverage and correct automatic results separately from refusals.

If research shows that a requested capability cannot be completed within these constraints, identify the precise boundary and ask the user before replacing it with a partial feature, materially reducing scope, or introducing prohibited technology. Do not claim arbitrary SOO comprehension, universal installed counting, engineering certification, or perfect future-document accuracy.

## Phase 1 — mandatory web and codebase research before implementation

1. Read applicable AGENTS.md, corpus GOAL/progress, BAS math research/proof, current contracts, and current tests. Trace actual production paths from PDF/index to table and narrative extraction, equipment/symbol evidence, compile, Python math, UI, MCP, persistence, and exports.
2. Reproduce and locate known omissions, including missing narrative SOO and point-list rows. Distinguish PDF text availability, region discovery, table extraction, semantic interpretation, classification, joins, and UI exposure. Do not assume every omission is a VectorGrid defect.
3. Research current primary sources for BAS controls documentation, points schedules, SOO, equipment/assembly responsibilities, electrical/signal compatibility, commissioning documentation, and drawing revision workflows. Distinguish examples and owner-specific guide options from project requirements. Cite sources, dates, assumptions, and applicability.
4. Research official competitor documentation and visible workflows for takeoff evidence review, equipment detail, issue queues, and revision comparison. Inspect the actual running platform at representative desktop sizes, both themes, and long/dense corpus results. Separate observed behavior from design inference; do not claim hands-on testing of products only viewed in documentation.
5. Produce a concise cited research report, code/contract map, feasibility matrix for the five workflows, UI information architecture, and implementation/test plan. Define acceptance gates before implementation, not after seeing scores.
6. Inventory the available corpus and match PDFs to manifests/ground truths by content identity. Include the existing 30-document focus group and all applicable BAS-bearing documents in the available corpus; cross-trade documents serve as regression controls. Disclose missing files. Reserve a genuinely untouched holdout subset before developing new interpretation rules; if used for debugging, cease calling that subset blind.
7. Establish reproducible current baselines. Historical “100%” notes are not a substitute for executing current tests. Reproduce/document existing failures separately; do not silently fix unrelated extraction defects or claim an incomplete test run is green.

## Phase 2 — UI architecture, without adding clutter

Keep existing navigation, visual identity, and drawing workspace recognizable. Do not add a top-level tab, floating rail, or permanently visible panel for each new capability.

The starting design hypothesis, to validate through research and real UI walkthroughs:
- Takeoff remains the main structured workspace, with its table as the primary view.
- A selected equipment/item detail view contains its control template, points, assembly components, responsibilities, engineering checks, and evidence.
- Show compact issue/readiness indicators at the relevant row and one project-level review entry, not repeated warning walls.
- “Review & changes” opens an internal full-width Takeoff workspace for unresolved issues, drawing-version comparison, and issue history. Keep revision controls contextual and history out of the everyday toolbar.
- Deep comparison and source review use available workspace width; do not squeeze dense tables into narrow drawers or stack nested modals.
- Preserve filter, selection, scroll, draft, and return-to-drawing context. Source navigation must still target the original evidence.
- Provide keyboard operation, visible focus, accessible status text, responsive behavior, sensible empty/error/loading states, large-data performance, and consistent design tokens.
- Demonstrate the researched layout in the running app before completing the rest of the UI. UI state must never independently decide a quantity or readiness.

## Phase 3 — implement the five workflows

### A. Point-list and SOO coverage

Discover and retain relevant narrative text independently of table-only extraction. Preserve headings, reading order, continuation relationships, equipment references, and source locations. Recover applicable point-list table/header structures without flattening meanings or confusing graphical/alarm flags with copper I/O.

Build source accounting that distinguishes discovered, interpreted, unresolved, and unavailable regions, and discloses the limits of discovery itself. Absence of a detected heading does not prove absence of SOO.

Parse explicit, supported SOO requirements with scoped deterministic rules, negation/condition handling, and traceable provenance. Keep incompatible or ambiguous interpretations unresolved. Do not derive points merely because a paragraph mentions a device or alarm. Reconcile normalized identities before aggregation; the max envelope is not an automatic resolution of contractual or physical-device conflicts.

### B. Templates to actual equipment

Create stable, source-backed equipment and template identities scoped by document version, building, level, system, and phase where available. Resolve explicit tag lists/ranges, applicability statements, exceptions, and multipliers. Detect ambiguity rather than joining on a generic label or proximity alone.

Separate scheduled quantities, corroborated plan instances, explicit typical multipliers, existing/reused equipment, demolition, and unresolved occurrences. Do not multiply a whole-project matrix as though it were a per-unit template. Do not count details, legends, repeated views, or tag mentions as additional installed equipment. Do not collapse distinct devices because their tags repeat across buildings.

Provide auditable reconciliation and explicit user correction/assignment without mutating original extracted evidence. No claim of verified installed quantity without adequate supporting evidence.

### C. Assemblies and responsibility tracking

Represent each equipment item's controls assembly using traceable component requirements and versioned rules. Distinguish physical devices, I/O channels, software variables, and accessories; they are not interchangeable units.

Track furnish, install, connect/wire, program, and test responsibilities separately, including factory-provided, existing, by-others, and unknown scope. An assignment must come from applicable drawing evidence or a disclosed user decision, not a universal contractor assumption.

Include complete component drilldown, quantity derivation, duplicate detection, exclusions, edits with reasons, durable storage, and non-commercial exports. Conditional accessories require established predicates; do not create arbitrary default kits.

### D. Engineering compatibility

Extend the existing shared engine only with fully specified, testable, manufacturer-independent constraints supported by evidence or explicit inputs. Research and implement the applicable checks for signal modes/ranges, channel compatibility, power/loading, expansion/pool boundaries, and equipment/panel allocation. Preserve independent physical I/O and software variables.

Validate declared network/device/location constraints where inputs exist; do not infer hidden cable routes or promise a complete network design from point totals.

Every check reports pass, fail, or not evaluable with its inputs, governing rule, and source. Distinguish capacity sufficiency from actual electrical compatibility. Unknown ratings do not become passing results. Keep manufacturer products, pricing, and speculative design outside scope.

### E. Review, drawing revisions, and takeoff issue controls

Provide one coherent issue workflow with severity, affected equipment, conflicting evidence, resolution reason, and deterministic recomputation. Unsupported/infeasible requirements cannot disappear into a generic green status.

Track immutable source-document versions and takeoff snapshots, stable correspondence, and added/removed/changed requirements and quantities. Preserve previous evidence and user decisions. Changes to relevant evidence or rules invalidate dependent approvals; never carry approval silently across altered inputs.

Handle sheet renumbering, replaced pages, duplicate uploads, partial addenda, ambiguous sheet pairing, and unchanged re-exports without treating every file change as a quantity change. Provide explicit correspondence review when automatic pairing is uncertain.

“Release” here means an explicitly approved, versioned takeoff deliverable, not code deployment or engineering certification. Define readiness from coverage and outstanding blockers. Snapshot/export includes source versions, rule/engine version, results, exclusions, unresolved items, and review decisions. Do not fabricate authenticated reviewer identity, access controls, or server-backed immutability if the platform does not have them; disclose actual guarantees and ask before expanding infrastructure.

## VectorGrid and extraction preservation gate

Prefer consuming existing text/vector output and correcting downstream interpretation when that is the true defect. For narrative SOO, do not force prose into tables.

Before any proposed VectorGrid edit, document the reproduced defect, why a consumer-side fix is insufficient, the exact shared-path change, and the baseline/acceptance set; ask for explicit approval if the earlier VectorGrid permission remains unresolved. Its production quality must not fall below the verified starting baseline.

Require zero measured regressions across unaffected cell text, row/column relationships, merged/nested headers, table identity/classification, citations/bboxes, equipment counts, symbol verification, and UI/MCP parity. Corrected outputs must match independently checked source truth, not merely differ from baseline. Include dense non-BAS tables and false-positive controls. Measure runtime, memory, failures, and cold/warm behavior as well as accuracy.

Never weaken a key, scorer, threshold, or evidence requirement; never hardcode PDF names, page numbers, corpus IDs, or expected answers into production. Reject any candidate that improves selected BAS sheets by breaking other supported documents. No claim that a finite corpus proves universal non-regression.

## Verification and completion

- Independent source review and versioned ground truths; reuse valid keys without rewriting them to match output.
- Focused unit, integration, schema, persistence/migration, malformed-input, and adversarial/negative tests for each change; Python pytest/mypy and web/MCP checks as appropriate.
- End-to-end real PDF workflows through the actual UI and MCP, not only direct helper calls or injected response fixtures.
- Corpus-wide regression gates after verified batches and before handoff. Report takeoff, reference/table, and graph/grounding metrics separately, plus new workflow coverage, false additions, unresolved cases, and failures. Track per-document deltas, not a flattering combined score.
- Test repeated extraction, reload/reopen, deterministic replay, edits, version changes, stale approvals, cancellation/retry where relevant, export/reimport, and large multi-page sets.
- Use real revision pairs where available. Clearly label controlled source-derived revision fixtures and their limits; never portray them as real addendum validation.
- Capture and visually inspect screenshots/walkthroughs of point/SOO coverage, equipment mapping, assembly responsibilities, engineering checks, review, and revision comparison. No clipping, overlapping controls, hidden critical actions, or unreadable tables.
- Keep a durable progress record with exact baseline, commits, accepted/rejected approaches, measured results, known boundaries, and next steps.
- Commit coherent, tested work on the feature branch. No automatic main merge, deployment, or publication.
- Finish only when all five agreed bounded workflows pass their acceptance gates end-to-end, the added final phase has reached its evidence-gated implementation or documented infeasibility outcome, source/contract safety is demonstrated, documentation and non-commercial exports agree with the UI, and the report accurately states remaining limitations. If an essential capability requires unavailable inputs or prohibited technology, report the precise decision needed rather than declaring a partial implementation production complete.

## Final phase — researched symbol robustness and installed-plan reconciliation

Added by explicit user request on 2026-09-09. Execute after the five BAS workflows; research and baseline planning may begin earlier. The user specifically requires deep web research, fast execution, and no forced implementation if defensible research and experiments do not support a viable approach.

1. Research original papers, official algorithm documentation, and relevant symbol-spotting evaluations. Compare geometric hashing, rotation/scale/affine normalization, anisotropic stretch, local primitive/topology descriptors, partial matching, robust registration, distance-based verification, coarse-to-fine candidate retrieval, spatial indexing, caching, and multi-sheet correspondence. Distinguish mathematics that accepts vector coordinates from image-only or trained methods. Record assumptions, runtime complexity, deformation limits, confusing-symbol controls, licensing/dependency implications, and applicability to this engine. Do not infer production performance from a paper's unrelated dataset.
2. Map the actual legend-learning, symbol-sweep, candidate generation/verification, plan scoping, deduplication, citation, and installed-quantity production paths before proposing changes. Quantities and match decisions belong on the shared UI/MCP path. Keep VectorGrid table algorithms, output structure, and bbox semantics protected by the existing preservation gate; this extension is not blanket permission to alter table extraction.
3. Freeze reproducible accuracy and speed baselines before changing production code. Use the 30-PDF focus group, applicable additional corpus PDFs, independently inspected natural deformations, known confusing negatives, and held-out projects/symbol families. Reserve the existing blind holdout until final evaluation. Controlled rotations, mirroring, stretch, shear, stroke fragmentation, extra connections, and partial occlusion supplement real drawings; label them synthetic and never count them as independent real-project evidence. Record exact fixture hashes, machine/runtime, cold/warm costs, page complexity, candidate counts, p50/p95/worst latency, memory, and cancellation behavior. Set numeric budgets before candidate evaluation, justified by measured baseline and the interactive workflow, not retrospectively to bless a result.
4. Prototype only technically justified, bounded methods with no new training, learned detection, OCR, raster vision, or external model services. Preserve precise matching as the fast first tier; evaluate an additional bounded verification tier only where evidence supports it. Do not make symbols indistinguishable through excessive normalization. Prove negative controls for geometrically similar but different valves, dampers, sensors, equipment, text, line crossings, and schedule/legend glyphs. Reject changes that buy recall through unacceptable false additions, latency, memory, or existing-match regressions.
5. Reconcile scheduled equipment with source-backed plan instances. Distinguish new work, existing/reused, demolition, alternate/phase scope, typical diagrams, details, legends, repeated/enlarged views, and textual mentions. Match repeated views only with defensible spatial/source correspondence; repeated tags across buildings or systems must not collapse distinct devices. Keep scheduled quantity, detected candidates, verified plan instances, and unresolved coverage separate. Missing search coverage is not zero; a detected drawing instance is not proof of a physically installed device or as-built verification.
6. Every included or excluded instance must be inspectable at its original document version, page, bbox/primitive evidence, applicable scope, and match/decision rationale. Preserve auditable user corrections, ambiguity, duplicate decisions, source/rule invalidation, deterministic replay, and export/reimport. Connect accepted installed-plan quantities to the existing equipment, template, points/SOO, assembly, review, and snapshot workflows without inventing quantities or silently overwriting source truth. Use existing spacious workspaces, not additional permanent toolbar clutter.
7. Verify focused cases and adversarial negatives, then all applicable existing symbol/legend/table/quantity/citation regression gates. Report per-document precision, recall, false additions, misses, unresolveds, exact quantities, and runtime separately. Test actual public UI and packaged MCP paths on complex multi-page projects, not only direct helpers. No corpus IDs, expected-answer hardcoding, key/scorer edits, threshold relaxation, or selective exclusion of failures. Finite-corpus success is not universal accuracy.
8. Keep a method/experiment ledger with accepted and rejected approaches and exact evidence. Integrate only improvements meeting the predeclared correctness and performance gates. If no tested in-scope approach is viable, stop that implementation path, document reproducible counterexamples, measured ceilings, and what additional inputs or technology would be required. A bounded negative result is acceptable for this final phase under the user's instruction; it is not proof that no algorithm can ever work and not permission to label unresolved takeoffs production-complete.
