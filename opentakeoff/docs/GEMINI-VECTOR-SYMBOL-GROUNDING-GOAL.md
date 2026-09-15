# Goal: production-grade vector symbol grounding and installed-quantity evidence

**Status:** executable engineering goal, researched 2026-09-14  
**Intended executor:** Gemini in a clean worktree  
**Base:** current origin/main  
**Scope:** deterministic/vector-first symbol proposal, physical-body isolation, tag/leader/legend association, schedule-to-plan grounding, shared UI/MCP behavior, corpus evaluation, and performance  
**Not in scope:** pricing, labor, model training, replacement of VectorGrid/table extraction, or changes to table/citation/bbox data contracts

## 0. Objective

Make OpenTakeoff's vector path trustworthy enough to support a human-reviewed BAS/HVAC takeoff:

1. Find candidate physical symbol instances at very high recall, including dense repeated arrays, rotation, mirroring, bounded stretch, inline symbols, and symbols attached to carrier linework.
2. Prove which physical vector primitives belong to each candidate instead of placing a guessed box near a tag.
3. Associate schedule identity, exact printed tag, leader evidence, legend reference, physical symbol body, and system connectivity without allowing one instance to steal a neighbor's geometry.
4. Auto-accept only when independent evidence agrees. Put every uncertain or contradictory case into an explicit review state with reasons and source bboxes.
5. Run one shared implementation through the browser, MCP, Agent, corpus runner, reconciliation, and export paths.
6. Keep post-index whole-set automated takeoff within the existing product requirement: p95 under three minutes on the largest supported corpus set, with visible stage progress.

The goal is not to promise perfect recognition. Production safety means extremely high measured precision for auto-accepted installed quantities, high proposal recall, exact source evidence, and aggressive abstention when the drawing does not prove an answer.

## 1. Non-negotiable product and repository contracts

Read these completely before changing code:

- Repository mission: opentakeoff-corpus/GOAL.md
- Implementation rules: opentakeoff/AGENTS.md
- Current affine history: opentakeoff/docs/SYMBOL-SWEEP-AFFINE-GOAL.md
- Current clean-corpus history: opentakeoff/docs/SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md
- Existing vector research: opentakeoff-corpus/takeoffs/VECTOR_TAKEOFF_ENGINE_RESEARCH.md
- Symbol truth schema: HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/README.md
- Legend truth schema: HVAC BAS Benchmark Collection/ground_truth/legend_learn/

The last two paths are intentionally absent from main because the 30-document
benchmark is stored with Git LFS on branch
codex/symbol-sweep-corpus-accuracy. Stage that ignored corpus before attempting
to read or run it; exact retrieval instructions appear in Phase 1.

Before every change, answer in the commit body:

> SHOULD THIS BE ON THE SHARED PATH?

Anything deciding what symbol exists, what tag owns it, where it is, whether it counts, or how a schedule row reconciles belongs on the shared path. Implement it once in web/src/lib and have both Session/MCP and browser/UI call it. Canvas paint, interaction chrome, and presentation-only review controls remain surface-specific.

Hard rules:

1. Do not alter VectorGrid/table extraction algorithms, thresholds, cell reconstruction, citations, bbox semantics, or schedule data contracts. Symbol work may consume schedule and legend output; it must not rewrite that output.
2. Do not improve a score by changing a key, scorer, expected answer, source hash, tolerance, or corpus identifier.
3. Do not add file-, page-, coordinate-, project-, tag-, family-, or sheet-specific production logic.
4. Do not count a per-case evaluation option as a production fix.
5. Do not silently discard candidates. Every proposal must end as accepted, review/withheld, rejected, or incomplete because a disclosed work cap was reached.
6. A printed tag is identity evidence, not proof of a physical installed symbol. A legend example is class evidence, not proof of an occurrence.
7. A physical symbol body may not be claimed by two installed instances. A unique equipment tag may not own two installed instances unless the drawing explicitly uses a documented multi-instance designation.
8. Keep rigid and affine evidence separate. Affine refinement may run only after candidate support is isolated; it may never borrow arbitrary nearby geometry.
9. Learned metric verification is a later reranker. Build stable candidate/body/reference contracts now, but do not train or require a model in this goal.
10. Work in small, reviewable commits. Run affected tests before each commit. Update opentakeoff-corpus/PROGRESS.md with measurements, accepted changes, rejected approaches, and remaining ceilings.
11. Do not merge to main. Push the execution branch and provide the user a phase-by-phase report and final diff for explicit merge approval.

## 2. Current codebase diagnosis

The current engine is not empty or primitive. Preserve its good parts:

- web/src/lib/oneclick.ts, extractVectorGeometry, already emits flattened segments, stroke/fill metadata, luminance, optional-content layer identity, and subpath membership from the pdf.js operator list.
- web/src/lib/symbolsweep.ts already has rare-length geometric anchors, junction anchors, spatial hashing, rigid symmetries, bounded affine refinement, text masking, luminance checks, negative examples, richer-variant handling, withheld/rejected states, and disclosed work caps.
- web/src/lib/symbolAffine.ts already performs bounded least-squares affine fitting and refuses rank-degenerate fits.
- web/src/lib/symbollabels.ts already parses many HVAC/BAS tag forms, follows selected leaders, globally assigns text tokens to placements, arbitrates rigid/affine populations, and prevents repeated tag boxes from multiplying counts.
- web/src/lib/legendlearn.ts already extracts many legend rows and marks whether a glyph is safe to seed.
- web/src/lib/mepconnectivity.ts already builds a noded line graph, applies disciplined gap bridging, classifies some system evidence, and traces from symbol locations.
- web/src/lib/vectorTakeoffPipeline.ts is the shared orchestration seam.

The central defect is representation and ownership:

1. extractVectorGeometry observes paintFormXObjectBegin/End but only pushes/pops the transform. It does not expose reusable Form XObject identity, nesting, or a stable content signature to symbol matching.
2. Curves are flattened to chords, and important graphics-state attributes such as dash pattern, line cap, line join, curve type, and source primitive identity are not available to Symbol Sweep.
3. Symbol Sweep chiefly sees one flat segment array. Its candidate centers are local votes, not isolated physical bodies.
4. Affine fitting and scoring may therefore use nearby repeated geometry. In dense arrays, one candidate can borrow a neighbor's primitives, move to a confident wrong position, and suppress or steal the real instance.
5. Tag and leader association occurs after geometric proposals. It can arbitrate among proposals, but it cannot manufacture reliable physical-body ownership if proposals did not isolate bodies.
6. Legend Learn provides references, but there is no unified project-local reference bank carrying a legend glyph's vector graph, source provenance, permitted variants, and schedule-family association into the shared matcher.
7. MEP connectivity is currently summarized more than consumed. It is useful corroboration, but it is not yet a robust symbol-body segmentation mechanism and has no proven cross-sheet matchline model.

The next vector milestone is therefore:

> Build a reusable vector scene index, generate high-recall candidate bodies through several independent lanes, assign primitives/tags/leaders/legend references globally, and only then run rigid or affine verification on the isolated support.

This is supported by the literature. Architectural symbol spotting is limited by the segmentation/recognition paradox and ROI quality; graphs preserve structural relationships but exact subgraph matching is expensive and sensitive to noise, so fast proposal generation followed by stronger local verification is the practical architecture ([Rezvanifar et al., 2019](https://link.springer.com/article/10.1186/s41074-019-0055-1)). Vectorial-signature work uses attributed relations such as parallelism, right angles, junctions, relative length, and distance to retrieve likely regions before recognition ([Rusiñol et al.](https://marcalr.github.io/pdfs/GREC06.pdf)). Graph-path hashing combines substructure descriptors, approximate lookup, and spatial voting for noise/distortion tolerance ([Dutta et al., DOI 10.1109/ICDAR.2011.199](https://www.researchgate.net/publication/224265575_Symbol_Spotting_in_Line_Drawings_Through_Graph_Paths_Hashing)).

Modern CAD spotting research reinforces the same instance-first conclusion: a symbol is a connected subgraph of vector primitives, and instance prediction is an adjacency/ownership problem, not merely a center box ([GAT-CADNet, CVPR 2022](https://openaccess.thecvf.com/content/CVPR2022/html/Zheng_GAT-CADNet_Graph_Attention_Network_for_Panoptic_Symbol_Spotting_in_CAD_CVPR_2022_paper.html)). CADTransformer specifically notes that bounding boxes are unreliable when symbols touch surrounding structures and instead groups primitives toward instance centroids ([CADTransformer, CVPR 2022](https://openaccess.thecvf.com/content/CVPR2022/html/Fan_CADTransformer_Panoptic_Symbol_Spotting_Transformer_for_CAD_Drawings_CVPR_2022_paper.html)). These papers use learning, but their representation and evaluation lessons apply to a deterministic vector implementation.

PDF itself offers an additional high-confidence lane. ISO 32000 states that a Form XObject is reusable self-contained graphical content and explicitly names standard CAD components as a use case ([PDF 32000-1:2008, section 8.10](https://opensource.adobe.com/dc-acrobat-sdk-docs/standards/pdfstandards/pdf/PDF32000_2008.pdf)). Where an exporter preserved repeated Form XObjects, OpenTakeoff should exploit that author-supplied identity before approximate matching.

## 3. Baseline truth that Gemini must reproduce

Do not accept the numbers below as the new baseline without rerunning them. They are known evidence that defines what must be measured.

- The frozen Symbol Sweep corpus contains 47 cases across 30 real documents.
- Current main's manifest has no affine or variant-guard per-case options.
- A later remote evaluation branch, codex/symbol-sweep-corpus-accuracy, contains 8 cases with affine disabled and 2 cases with variant_guard enabled. A 47/47 report using those switches is not proof that the default production engine is 47/47.
- The last recorded full browser/UI-path run in SYMBOL-SWEEP-CLEAN-CORPUS-GOAL.md reported 36/47 clean. Seven dense/repetitive cases exposed geometry borrowing; other failures included evaluation-only behavior not reaching production and one browser timeout.
- Several scalar post-hoc fixes using score, extra ink, affine anisotropy, shear, RMS, drift, or simple rigid/affine unions were corpus-tested and reverted because they either failed to separate real from false candidates or regressed valid matches.

This history makes two approaches forbidden unless new evidence overturns it:

1. Do not add another global scalar threshold as the main fix.
2. Do not union rigid and affine centers without explicit instance ownership.

## 4. Required evaluation redesign: measure proposal, ownership, identity, and count separately

The existing center-only test cannot diagnose where the pipeline failed. Extend the schema additively; do not rewrite existing truth.

For every newly reviewed instance, store:

- document hash, PDF page, printed sheet number, drawing/building/area context
- family and exact printed tag, including duplicate-tag scope
- reference source: manual seed, accepted legend row, reusable PDF object, or schedule-led query
- reference bbox and vector primitive IDs
- exact tag token bbox
- physical symbol body bbox and owned primitive IDs; allow a reviewed polygon/mask when a bbox includes unrelated carriers
- leader polyline and terminal endpoint when a real leader exists
- association type: enclosed, adjacent, leader, inline, shared callout, schedule-only, or unlabelled
- carrier/system attachment points when applicable
- countable or non-countable and the reason
- expected transform family: rigid, mirrored, uniform scale, bounded affine, redrawn variant
- hard-negative relationships: similar sibling, richer/poorer variant, text-only tag, note bubble, network junction, hatch, arrowhead, schedule/legend occurrence
- review screenshot or retained rendered crop

Add metrics for four distinct stages:

1. **Proposal recall:** Is the correct body among the top K proposed bodies at K = 1, 3, 5, 10?
2. **Ownership/localization:** Does the proposal own the reviewed physical primitives without swallowing neighbor or carrier geometry? Report primitive precision/recall/F1 plus center/bbox error.
3. **Identity/assignment:** Is the right tag, family, legend reference, leader, and schedule row associated one-to-one?
4. **Final count:** Are accepted, review, rejected, schedule-only, and plan-only quantities correct?

Split evaluation by whole project, never random crops from the same sheet:

- development projects for iteration
- validation projects for phase gates
- untouched holdout projects for final claims

Every report must include:

- raw case count and project count
- any per-case option or override count
- full default result
- forced-rigid result
- forced-affine result
- browser manual path
- in-app Agent path
- MCP/Session path
- exact failures with candidate rank, owned primitives, tag/leader assignment, transform, and timing
- runtime distribution, work-cap drops, and incomplete states

## 5. Phase 0 — freeze honest baselines before engine changes

Deliver one commit containing evaluation/reporting only.

1. Add a runner mode that explicitly reports effective options for every case.
2. Add a force-default mode that bypasses manifest options and invokes the same defaults a real user gets.
3. Add a force-rigid and force-affine ablation.
4. Make CLI, browser-manual, browser-Agent, and MCP reports use the same output schema.
5. Record result artifacts under an ignored results directory; commit only compact summaries and the commands needed to reproduce them.
6. Reproduce all 47 cases on current main through the CLI and UI paths.
7. Profile at least the known dense/repetitive cases and one affine-positive case.
8. Confirm whether the current browser and MCP actually call identical shared functions with identical effective options.

Gate:

- Baseline is reproducible twice with no unexplained drift.
- Reports clearly separate default, overridden, rigid, affine, manual UI, Agent, and MCP.
- A fixture option can no longer hide behind a single pass count.

## 6. Phase 1 — create the vector ownership benchmark

Deliver one commit containing schema, annotations, fixtures, and scorer changes only.

1. Add the fields from section 4 to a v2 additive schema.
2. Review and annotate every failure/edge case in the 47-case set with physical-body ownership, tag bbox, and association type.
3. Add at least 150 additional real symbol instances across at least 12 documents before tuning the new engine. Cover:
   - dense VAV/diffuser/thermostat grids
   - equipment bodies whose tags are adjacent with no leaders
   - literal leaders with zero, one, and multiple bends
   - leaders crossing unrelated linework
   - inline valves, dampers, sensors, fans, and fittings
   - symbols embedded in duct/pipe carriers
   - rotated, mirrored, uniformly scaled, and stretched instances
   - richer/poorer look-alike variants
   - duplicated tags in different buildings, phases, floors, or disciplines
   - legend symbols, schedule symbols, note bubbles, arrowheads, hatches, text boxes, and empty regions as negatives
   - reusable Form XObject cases when present
4. Select annotations from real drawings, not generated fixtures. Synthetic tests may isolate mechanics but cannot satisfy corpus gates.
5. Preserve independent review evidence. Never derive truth from current engine output.

Gate:

- Each required stratum has reviewed positives and hard negatives.
- The scorer can distinguish proposal miss, ownership failure, identity failure, localization failure, and count failure.
- Holdout project identities are frozen before implementation begins.

If the local checkout does not contain enough PDFs, retrieve the already-published corpus assets. Do not scrape Google Drive repeatedly and do not silently shrink the goal to the available local subset.

The verified repository sources as of 2026-09-14 are:

- The 30-document Symbol Sweep + Legend Learn benchmark is Git LFS content on
  origin/codex/symbol-sweep-corpus-accuracy. Materialize it in an auxiliary
  detached worktree, then copy or symlink its ignored
  HVAC BAS Benchmark Collection directory into the execution worktree. Do not
  stage those large files onto the execution branch.
- GitHub Release tag corpus, asset HVAC_BAS_Plan_Sets.zip
  (552,425,946 bytes):
  https://github.com/erikjohnstone/master-plan/releases/download/corpus/HVAC_BAS_Plan_Sets.zip
- GitHub Release tag corpus_2, asset HVAC_BAS_Plan_Sets_Vol2.zip
  (1,109,306,456 bytes):
  https://github.com/erikjohnstone/master-plan/releases/download/corpus_2/HVAC_BAS_Plan_Sets_Vol2.zip
- scripts/stage-bulk-corpus.sh documents the expected extracted directories
  and multipart-rejoin step, but currently downloads from Drive. When Drive is
  blocked, download the two release assets with gh release download, extract
  them under opentakeoff-corpus/bulk with the same top-level directory names,
  then run the existing rejoin scripts and SHA/source-manifest checks.

Before annotating, prove that all referenced source PDFs resolve and that their
SHA-256 values match frozen truth. Corpus availability is an infrastructure
precondition, not an accuracy result.

## 7. Phase 2 — build one shared VectorSceneIndex

Deliver one commit for extraction/index contracts and parity; do not change final count decisions yet.

Create web/src/lib/vectorSceneIndex.ts or an equivalently focused shared module. Build it once per sheet from the existing graphForPipeline inputs.

The index must retain stable IDs and page-space geometry for:

- original primitives and flattened segments
- primitive type: line, rectangle edge, Bezier/curve approximation, circle/ellipse approximation when recoverable
- subpath membership and closed/open state
- graphics-state attributes available from pdf.js: CTM, line width, stroke/fill, luminance, dash pattern, cap, join, clip state
- optional-content/layer ID
- Form XObject nesting, object identity where exposed, invocation identity, local-to-page transform, and content signature
- text spans and exploded-text masks
- intersections, T-junctions, X-junctions, endpoints, collinearity, near-parallel and near-perpendicular relations
- spatial index entries

Requirements:

1. Extend extractVectorGeometry additively. Existing points, segs, meta, lum, layerOf, layerIds, and subpaths remain compatible.
2. Investigate the actual pdf.js operator-list payload in the locked version. Do not assume paintFormXObjectBegin exposes a name if it only exposes a matrix. If object identity is unavailable, compute a stable normalized content signature from the nested operation sequence and local coordinates.
3. Preserve curves better than a single chord when the source operator provides controls. A deterministic polyline approximation is acceptable if it has a documented tolerance and retains source-primitive ownership.
4. Cache the scene index by document hash + page + parser/index version. Invalidate deterministically.
5. Browser and Session/MCP must serialize or consume the same shared index contract.
6. Add memory accounting and a safe cap. A cap breach must produce an incomplete state, not partial silent truth.

Gate:

- Unit fixtures prove transforms, nested forms, curves, dash/cap/join where available, subpaths, layers, and primitive IDs.
- At least five real PDFs show browser/MCP parity.
- No schedule/table extraction result changes on the VectorGrid regression suite.
- Index build time and memory are measured on small, median, and largest sheets.

## 8. Phase 3 — multi-lane candidate-body proposal

Deliver each proposal lane in its own commit with proposal-recall measurements. Do not let any lane auto-accept merely because it proposed a body.

### Lane A: PDF reusable-object identity

1. Group Form XObject/content-signature invocations by normalized local content.
2. Treat each invocation transform and local bounding support as a high-priority body proposal.
3. Exclude forms whose content is mostly text, page furniture, title blocks, borders, or repeated non-countable stuff.
4. A repeated form is structural evidence, not semantic identity; it still needs legend/tag/schedule corroboration to name the family.

### Lane B: subpath and connected-component identity

1. Use source subpaths, closed cycles, and short-gap adjacency to form initial body components.
2. Split components at high-degree junctions and long carrier runs.
3. Preserve inline symbol lobes/marks attached to carriers by representing body primitives and carrier attachment ports separately.
4. Keep alternative segmentations when a split is ambiguous.

### Lane C: tag/leader-led regions

1. Generate local search regions from exact tag token boxes.
2. Follow only structurally coherent leaders: start near the tag block, use consistent stroke style, allow bounded bends/gaps, terminate near a candidate body, and stop before entering a long duct/pipe/network carrier.
3. Support no-leader adjacency as a separate evidence type.
4. Never report the tag bbox or arbitrary leader endpoint as the physical symbol body.

### Lane D: attributed graph/path hashing

1. Represent candidate/reference bodies as attributed primitive graphs.
2. Node/primitive attributes: type, normalized length, orientation modulo symmetry, width/style, closed-cycle membership, local degree, curvature.
3. Edge/relation attributes: touching, gap distance, crossing, T-junction, parallel, perpendicular, concentric, collinear, relative angle, relative length, and normalized displacement.
4. Build compact invariant path/subgraph signatures for fast lookup.
5. Use rare/distinctive signatures and spatial voting to propose centers and support sets.
6. Keep the existing rare-length and junction anchors as one proposal source, not the sole source.

### Lane E: legend-reference retrieval

1. Build a project-local reference bank from Legend Learn rows that are explicitly seedable.
2. Store multiple legitimate variants per family instead of collapsing them to one canonical shape.
3. Carry legend source bbox, caption, family candidates, graph signature, content signature, and reference primitive set.
4. Use caption/tag/schedule schema to narrow eligible families. Do not count from caption semantics alone.

Proposal fusion:

- Deduplicate proposals by primitive overlap and body identity, not center distance alone.
- Preserve which lanes voted and their evidence.
- Top-K ordering may use deterministic evidence weights, but record ablations for each lane.
- Include a no-body proposal when only a tag exists.

Gate:

- On validation projects, correct-body proposal recall is at least 99.5% at K=10 overall and at least 98% in every required stratum.
- Every known dense-grid instance is proposed without borrowing primitives already owned by its neighbor.
- No lane manufactures a count before verification.
- Proposal generation stays sub-quadratic in ordinary use through indexes/hashes; report observed scaling.

## 9. Phase 4 — explicit body isolation and exclusive primitive ownership

This is the load-bearing fix for dense repeated arrays.

1. For every local cluster of overlapping proposals, construct a primitive-to-instance ownership problem.
2. Score primitive eligibility using:
   - direct Form/subpath membership
   - connectivity inside the proposed body
   - graph/path signature agreement
   - transform-consistent residual
   - style/layer agreement
   - carrier versus body classification
   - mutual reference-to-candidate and candidate-to-reference coverage
3. Require injective or mutual correspondences for distinctive reference primitives. Many seed endpoints may not all collapse onto one target segment/vertex.
4. Add an explicit unowned/background state so walls, ducts, pipes, leaders, hatch, and neighbors need not be forced into a symbol.
5. Add an explicit unassigned candidate state so ambiguity can abstain.
6. Solve small overlapping clusters globally. A minimum-cost bipartite/rectangular assignment is appropriate for tag-to-body and schedule-to-body matching; the formulation must include dummy review/unassigned choices rather than forcing every row to match. The standard assignment objective is documented in [SciPy's linear_sum_assignment reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html), but implement a tested TypeScript solver or reuse an already-approved compatible dependency.
7. For primitive ownership, use deterministic branch-and-bound, min-cost flow, or another exact/controlled method for small clusters. For large repeated grids, use a documented approximation followed by conflict repair; disclose incomplete results if work caps hit.
8. Produce an owned body bbox/polygon from owned primitives. This is the blue physical-symbol evidence shown to users. Keep tag evidence separately orange.

Gate:

- No primitive can support two accepted physical instances.
- No accepted instance's body bbox may be an empty patch, pure tag region, or leader-only region.
- Dense-grid cases preserve all real instances and suppress neighbor-borrowed phantoms.
- Ownership precision/recall/F1 is reported separately; auto-accepted instances require at least 0.95 primitive F1 against reviewed bodies, unless a Form/subpath identity provides exact ownership.

## 10. Phase 5 — robust rigid/affine verification on isolated support

Only begin after Phase 4.

1. Fit transformations using isolated candidate primitives.
2. Keep current rigid symmetries as the first verifier.
3. Run bounded affine refinement only when rigid evidence is insufficient and the candidate lane supports deformation.
4. Use robust, mutual correspondences:
   - reference-to-candidate coverage
   - candidate-to-reference coverage
   - distinctive primitive coverage
   - junction/cycle/port consistency
   - robust residual and inlier count
   - transform bounds
5. Prevent many-to-one collapse through injective/mutual-nearest correspondence checks on distinctive primitives.
6. Penalize or reject topology contradictions: missing required cycle, wrong port count, body disconnected from claimed leader endpoint, or impossible carrier attachment.
7. Keep richer/poorer variants distinct. An accepted larger reference may suppress a contained smaller one only when body ownership and family evidence support that decision.
8. Return calibrated evidence states, not one opaque score:
   - exact_vector_identity
   - verified_rigid
   - verified_affine
   - tag_corroborated_review
   - legend_corroborated_review
   - text_only
   - ambiguous_variant
   - ownership_conflict
   - incomplete
9. Log ablations showing what rigid, affine, reverse coverage, topology, and ownership each contribute.

Gate:

- The 47-case default gate is green without per-case production-behavior overrides.
- The browser manual, browser Agent, and MCP paths agree exactly on accepted/review/rejected placements and bboxes.
- Rigid-only cases do not regress.
- Affine-positive heldouts improve without dense-grid false accepts.
- Hard-negative auto-accept count is zero.

## 11. Phase 6 — joint tag, leader, legend, schedule, and body assignment

1. Build one evidence graph per sheet/local region:
   - tag tokens
   - candidate bodies
   - leaders
   - legend references
   - schedule identities
   - system/carrier attachments
2. Apply hard eligibility before global assignment. Bounds-failed, topology-impossible, empty-body, or conflicting candidates may be displayed but cannot steal a tag.
3. Score eligible edges using independently disclosed evidence. Do not compress all reasoning into a single unexplained confidence.
4. Resolve duplicate tags within drawing/building/floor/discipline scope. Never merge same text across different scopes automatically.
5. An accepted installed quantity requires:
   - a physical body with owned primitives
   - source sheet and body bbox/polygon
   - family identity from exact vector reference or agreeing tag + legend/schedule evidence
   - no ownership conflict
   - no stronger contradictory candidate
6. If a schedule row exists but no qualifying body exists, return SCHEDULE_ONLY.
7. If a body exists with no schedule row, return PLAN_ONLY only when family identity is sufficiently proven; otherwise return UNCLASSIFIED_PLAN_SYMBOL for review.
8. If only an exact printed tag is found, return TAG_ONLY/REVIEW, never installed.
9. Expose both physical and textual evidence in compare:
   - blue = owned physical symbol body
   - orange = exact printed tag
   - neutral/gray = leader or carrier context
   - schedule row remains separately cited

Gate:

- Every accepted installed count has inspectable blue physical-body evidence and orange tag evidence when a tag exists.
- The bbox in the UI and export is the same page-space bbox the shared engine produced.
- Cases without arrows/leaders work through adjacency, object identity, graph structure, and legend reference rather than a leader-only shortcut.

## 12. Phase 7 — integrate with reconciliation and Legend Learn

1. Add the VectorSceneIndex and project-local legend reference bank to Session.graphForPipeline or the documented shared pipeline object.
2. Refactor symbol_sweep and sweep_schedule_row to consume the same candidate/ownership/verifier modules.
3. Batch all schedule families per sheet index. Do not rerun whole-sheet geometry once per schedule row.
4. Reconciliation must compare explicit scheduled quantity with explicit accepted installed observations. Remove or refuse any downstream hardcoded quantity=1 semantics that are used as real quantities; a one-row schedule may imply one scheduled asset only when the schedule contract proves that.
5. Preserve existing MATCH, SCHEDULE_ONLY, PLAN_ONLY, REFUSED, and AMBIGUOUS semantics; add evidence states additively.
6. Legend Learn integration:
   - accepted legend row creates a reference candidate, not a count
   - family binding records caption/schema/tag evidence
   - multiple symbol variants remain separate
   - unsafe/nonseedable rows remain unavailable for automatic sweep
7. MEP connectivity may corroborate an inline symbol and name its system only when traced linework supports it. It must not create a physical symbol or quantity by proximity alone.
8. Keep stable vector-body crops and reference IDs in the output contract for a future DINOv2 metric verifier. The learned model will rerank/verify proposed pairs; it will not replace proposal recall, ownership, or source proof.

Gate:

- One schedule row can be opened beside its exact tag, physical body, legend reference when used, and schedule cells.
- Browser and MCP serialize identical counts and evidence.
- Existing table, point-list, SOO, and citation regressions remain green.

## 13. Phase 8 — performance engineering

Performance is part of correctness because users cannot wait hours for an exhaustive takeoff.

1. Build each sheet's scene index once after document indexing.
2. Batch descriptor hashing, reusable-object grouping, and text/tag tokenization once per sheet.
3. Query all reference families against the shared index; do not execute tags × sheets × all segments.
4. Cache:
   - sheet spatial index
   - primitive graph and components
   - Form/content signatures
   - graph/path hashes
   - project-local legend references
   - proposal bodies
5. Use coarse-to-fine search:
   - object/subpath exact lane
   - descriptor/hash lookup
   - local graph/body proposal
   - robust rigid/affine verification only on top candidates
6. Add granular progress:
   - indexing
   - reference preparation
   - candidate proposal
   - ownership/verification
   - reconciliation
   - export preparation
7. Record per-stage time, candidate count, cache hit rate, memory, and work-cap status.

Gate:

- Post-index whole-set automated takeoff p95 is under three minutes on the largest supported corpus plan set on the documented test machine.
- No single unreported stage appears as a frozen spinner.
- Candidate/verification accuracy is unchanged from the accuracy-first run.
- Performance is demonstrated by profiling and algorithmic reuse, never by lowering recall, skipping pages silently, or reducing verification.

## 14. Final production gates

Do not call this production-grade until all gates are measured on untouched whole-project holdouts.

### Accuracy and abstention

- Correct-body proposal recall at K=10: at least 99.5% overall and at least 98% for every required stratum.
- Auto-accepted installed-quantity precision: one-sided 95% lower confidence bound at least 99.5%. If the corpus is too small to support that statistical claim, state the ceiling and do not use the production-grade label.
- Final accepted count: exact on every frozen 47-case baseline and every validated holdout family.
- Hard negatives: zero auto-accepted tags-only, blank regions, leader-only regions, carriers, legend/schedule occurrences, hatches, arrowheads, and known look-alike variants.
- Localization: every auto-accepted physical-body bbox contains the reviewed symbol body; no accepted empty box or unrelated neighboring body.
- Ownership: no primitive/body double claims.
- Uncertainty: every ambiguous, missing, incomplete, or contradictory case is visible and source-linked.

### Generality

- At least 12 development/validation projects plus untouched holdout projects.
- Whole-project split prevents same-sheet leakage.
- Coverage includes HVAC equipment, BAS instruments, valves, dampers, terminals/diffusers, fans/pumps, inline and freestanding symbols, schematic symbols, and dense repeated arrays.
- No corpus-name, project-name, sheet-number, tag, coordinate, or family exception in production code.

### Shared-path parity

- Browser manual, in-app Agent, MCP tool, reconciliation, and export agree exactly.
- Every accepted quantity has sheet, page-space bbox/polygon, tag bbox when present, reference source, decision state, and evidence provenance.
- VectorGrid/table extraction and existing data contracts remain unchanged.

### Performance

- p95 under three minutes post-index on the largest supported set.
- No silent candidate drops or hidden work-cap truncation.
- Repeated run uses deterministic caches and produces identical results.

### Human workflow

- The human can inspect accepted items quickly rather than recreate the takeoff.
- The human can approve, reject, or reclassify each uncertain item.
- Approval changes downstream reconciliation/export state without mutating original evidence.
- The release/export view distinguishes machine-observed, human-approved, schedule-only, plan-only, ambiguous, and refused quantities.

## 15. Required implementation discipline

For every phase:

1. Reproduce the defect or baseline first.
2. Add a focused failing test.
3. Implement the smallest shared-path change.
4. Run focused unit tests.
5. Run affected real-document cases plus at least three negative-control projects.
6. Compare proposal, ownership, identity, count, runtime, and incomplete-state metrics.
7. Revert an approach that improves one case by regressing another or whose signal does not separate true and false populations.
8. Commit code + tests + measured PROGRESS.md update together.
9. Push the branch after every stable phase.

Keep a rejected-approaches table with:

- hypothesis
- exact code/commit or patch
- cases measured
- before/after metrics
- why rejected
- whether any reusable finding remains

No long full-corpus run is needed after every line edit. Use focused cases while iterating, then the full CLI/UI/MCP corpus after a coherent phase.

## 16. Final deliverables

1. Shared VectorSceneIndex and typed contracts.
2. Reusable Form/content-signature lane.
3. Attributed primitive graph and graph/path descriptor index.
4. Multi-lane body proposal with top-K metrics.
5. Exclusive primitive ownership and tag/body/schedule assignment.
6. Rigid/affine verifier operating only on isolated support.
7. Project-local Legend Learn reference bank.
8. Shared integration in Symbol Sweep, schedule-row sweep, reconciliation, Agent, UI, MCP, and export.
9. Additive evidence states and source bboxes/polygons.
10. Extended real-document ground truth and holdout split.
11. Focused unit tests, UI-path tests, parity tests, corpus reports, performance profiles, and negative controls.
12. Updated PROGRESS.md and a final production-readiness report that clearly separates proven capability from remaining ceiling.
13. A short user walkthrough with screenshots showing schedule row, exact orange tag, blue owned physical body, legend reference when used, decision state, and export effect.

## 17. Stop conditions

Continue autonomously until one of these is true:

1. Every final gate passes and the execution branch is pushed for review.
2. A remaining ceiling is demonstrated with reproducible evidence after at least three materially different principled approaches, each tested across positives and negative controls.
3. Required corpus assets are unavailable after checking repository releases and manifests; document the exact missing assets and commands attempted.
4. A change would require modifying VectorGrid/table extraction or existing data contracts; stop that change, document why, and ask the user before proceeding.

Do not stop because the work is slow, one hypothesis failed, or a full run is inconvenient. Do not claim success from screenshots, a few NAVFAC examples, or a corpus score that uses case-specific behavior.

## 18. Sources

Primary and authoritative sources used to select this architecture:

1. Rezvanifar, Cote, and Branzan Albu, “Symbol spotting for architectural drawings: state-of-the-art and new industry-driven developments,” 2019. Segmentation/recognition paradox; ROI quality; geometric hashing, geometric matching, and graph methods; real-world clutter and precision problems.  
   https://link.springer.com/article/10.1186/s41074-019-0055-1
2. Rusiñol et al., “Symbol Spotting in Technical Drawings Using Vectorial Signatures.” Attributed segment relations and hierarchical structural signatures for fast ROI retrieval.  
   https://marcalr.github.io/pdfs/GREC06.pdf
3. Dutta, Lladós, and Pal, “Symbol Spotting in Line Drawings Through Graph Paths Hashing,” ICDAR 2011, DOI 10.1109/ICDAR.2011.199. Graph-path descriptors, locality-sensitive lookup, and spatial voting under noise/distortion.  
   https://www.researchgate.net/publication/224265575_Symbol_Spotting_in_Line_Drawings_Through_Graph_Paths_Hashing
4. Fan et al., “FloorPlanCAD: A Large-Scale CAD Drawing Dataset for Panoptic Symbol Spotting,” ICCV 2021. Vector primitive annotations and combined geometric/visual representation.  
   https://openaccess.thecvf.com/content/ICCV2021/html/Fan_FloorPlanCAD_A_Large-Scale_CAD_Drawing_Dataset_for_Panoptic_Symbol_Spotting_ICCV_2021_paper.html
5. Zheng et al., “GAT-CADNet: Graph Attention Network for Panoptic Symbol Spotting in CAD Drawings,” CVPR 2022. Treats countable symbol instances as connected subgraphs and predicts primitive adjacency/instance ownership.  
   https://openaccess.thecvf.com/content/CVPR2022/html/Zheng_GAT-CADNet_Graph_Attention_Network_for_Panoptic_Symbol_Spotting_in_CAD_CVPR_2022_paper.html
6. Fan et al., “CADTransformer: Panoptic Symbol Spotting Transformer for CAD Drawings,” CVPR 2022. Explains why boxes fail when symbols touch surrounding structure and models instance grouping at primitive level.  
   https://openaccess.thecvf.com/content/CVPR2022/html/Fan_CADTransformer_Panoptic_Symbol_Spotting_Transformer_for_CAD_Drawings_CVPR_2022_paper.html
7. ISO 32000-1:2008, PDF, section 8.10. Form XObjects are reusable self-contained graphics; standard CAD components are an explicit use case.  
   https://opensource.adobe.com/dc-acrobat-sdk-docs/standards/pdfstandards/pdf/PDF32000_2008.pdf
8. SciPy reference, linear_sum_assignment. Formal rectangular minimum-cost bipartite assignment contract; cited for algorithm formulation, not as a required runtime dependency.  
   https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.linear_sum_assignment.html

Research inference: the exact OpenTakeoff architecture in this goal is not copied from one paper. It combines the repository's existing deterministic vector engine with repeated-object identity from the PDF standard, high-recall ROI proposal from symbol-spotting literature, primitive-level instance ownership from CAD spotting research, and explicit one-to-one assignment with abstention. The proposed gates and evidence states are product safety requirements derived from the corpus failures and human-in-the-loop BAS takeoff use case.
