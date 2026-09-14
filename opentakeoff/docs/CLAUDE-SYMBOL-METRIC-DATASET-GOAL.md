# Paste-ready Claude goal: build the symbol-metric dataset and RunPod package

Paste everything from `/goal` through the end into Claude Code while it is opened at the repository root.

```text
/goal Build a production-auditable, human-reviewed HVAC/BAS legend-to-plan symbol metric-learning dataset and a reproducible RunPod training package. This is a dataset and ML-infrastructure task, not permission to change production extraction, VectorGrid, table/schedule contracts, installed-quantity semantics, Agent behavior, ground-truth scorers, or UI/MCP wiring.

Read, in full, before acting:
- root AGENTS.md
- opentakeoff/AGENTS.md
- opentakeoff-corpus/GOAL.md
- opentakeoff/docs/SYMBOL-GROUNDING-DEEP-RESEARCH-REPORT.md
- opentakeoff/docs/SYMBOL-GROUNDING-PHASES-1-3-GOAL.md
- opentakeoff/docs/SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md

Create and work only on a new branch named `claude/symbol-metric-dataset-v1`. Do not merge it. Do not modify any currently dirty production file. If the working tree is dirty, create a separate git worktree from current `origin/main` and copy only explicitly approved ground-truth inputs into the worktree by source hash. Report the worktree path and branch before changing files.

Before every implementation decision, answer the repository gate: SHOULD THIS BE ON THE SHARED PATH? The future verifier must eventually be shared by UI and MCP, but this goal creates an isolated training/evaluation package only. It must not integrate a model into either surface.

## Primary outcome

Create an isolated package at `opentakeoff-ml/symbol_metric/` that can:

1. Inventory the real PDF corpus and existing reviewed annotations without changing them.
2. Generate review proposals and exact crops from source coordinates.
3. Let a human accept, reject, correct, or mark “no physical symbol present.”
4. Export an immutable, source-hashed, project-held-out metric-learning dataset.
5. Train, evaluate, calibrate, and export a shared-weight DINOv2-S/14 twin encoder on RunPod.
6. Run a mandatory ConvNeXt-Tiny challenger with the same data and gates.
7. Produce machine-readable evidence showing whether either model is safe enough to integrate later.

The model task is project-local one-shot retrieval: given a legend/reference symbol crop, rank isolated physical-symbol candidates from that same plan set. The model is not an equipment classifier, not a whole-page detector, not an OCR system, and not authority to infer installed quantity by itself.

## Data sources to inventory

Resolve paths from the current machine rather than assuming one spelling or symlink. The known sources are:

- `HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/cases.json`
  - Expected current inventory: 47 symbol identities, 47 seed crops, 283 reviewed non-seed instances, 330 total positive motif crops, and 213 tagged non-seed instances.
- `HVAC BAS Benchmark Collection/ground_truth/legend_learn/manifest.json`
  - Expected current inventory: 30 documents, 77 cases, 59 complete cases, 2,496 reviewed rows in complete cases, and 1,572 rows marked `seedable: true`.
- `opentakeoff-corpus/ground_truth/symbol_grounding/manifest.json`
  - Expected current inventory: 14 reviewed cases across four projects, including only one legend-symbol case and two refusal/negative cases.
- `HVAC BAS Benchmark Collection/pdf/`
  - Expected current inventory: 30 selected vector PDFs.
- `opentakeoff-corpus/bulk/focus-group-2026-09-04/sources/`
  - Expected current inventory: 190 PDF files representing approximately 113 distinct source plan sets because some large sets are split into parts/revisions.

Fail loudly if these counts differ. Report the actual counts and explain the difference; never edit labels or filters to force the expected counts.

## Non-negotiable truth policy

- Existing reviewed files are read-only inputs. Never rewrite them from detector output.
- A proposed match is not ground truth until a human explicitly approves or corrects it.
- Synthetic transforms are augmentations of a reviewed example, not additional independent ground-truth examples and not additional held-out evidence.
- Never use the current engine’s prediction as the answer key.
- Never use a document, revision, split part, or derivative crop in more than one of train, development, and test.
- Split by source project/family before generating crops. Hash and deduplicate PDFs and page renderings. Treat revisions and split volumes of the same project as one leakage group.
- Preserve “no match,” “ambiguous,” “tag only,” “carrier only,” “partial symbol,” and “not countable” as first-class labels.
- Preserve exact source provenance: PDF SHA-256, page index, sheet number, original coordinate space, reference bbox, candidate bbox, physical-body bbox, tag bbox, leader/association evidence, review identity/time, renderer version, crop SHA-256, and parent annotation ID.
- Do not upload or redistribute any raw corpus PDF until the repository owner confirms the rights and sensitivity policy for that source. The packaging script must support local-only crop generation and a `--no-raw-pdf` export mode.

## Required annotation schema

Define and version a JSON Schema for one reviewed training record. At minimum it must contain:

- `record_id`
- `schema_version`
- `project_id`
- `source_family_id`
- `source_pdf_sha256`
- `source_pdf_relative_path`
- `page_index`
- `sheet_number`
- `reference_id`
- `reference_caption`
- `reference_bbox`
- `candidate_bbox`
- `physical_body_bbox` or explicit null
- `tag_bbox` or explicit null
- `association_method` (`authored_leader`, `envelope_ownership`, `inline_topology`, `legend_similarity`, `human_only`, or `none`)
- `verdict` (`positive`, `hard_negative`, `easy_negative`, `ambiguous`, `no_physical_symbol`, `not_countable`)
- `symbol_identity_id`, scoped as project/source-family plus reviewed legend/reference identity
- `semantic_family` when known, without pretending semantic labels define visual identity
- `allowed_transforms` (`none`, `rotate180`, `rotate90`, `dihedral`) and reviewed anisotropic scale limits
- `directional`
- `review_status`
- `reviewer`
- `reviewed_at`
- `notes`
- `renderer_version`
- `crop_sha256`

Directional devices such as check valves, flow arrows, and actuator orientation must never receive unrestricted rotation/reflection augmentation.

## Human review workflow

Build a local review queue and a small, isolated review UI or static HTML review application. It must not import production Agent/UI code. The reviewer sees:

- the legend/reference crop and caption;
- the full source page context;
- ranked candidate body crops with tag, leader, envelope, and topology overlays shown separately;
- controls for accept, reject, correct bbox, ambiguous, no physical symbol, not countable, and skip;
- a permanent audit trail—no silent replacement of prior reviews.

Bootstrap review proposals from existing deterministic candidate isolation, tags, authored leaders, complete equipment envelopes, legend rows, and symbol-sweep instances. These signals may prioritize the queue but cannot approve themselves.

Prioritize the queue in this order:

1. Existing 47 symbol-sweep identities and their 283 plan instances.
2. The 1,572 seedable reviewed legend rows, starting with rows that have tagged plan occurrences.
3. Same-sheet look-alikes and neighboring tag/text/carrier-only hard negatives.
4. Different drafting firms, equipment families, rotations, scales, line weights, split tags, dense grids, inline pipe/duct devices, fragmented vectors, and rasterized appearances.
5. Projects outside the 30-document focus group, while preserving a permanently untouched test split.

Create a progress report that distinguishes raw proposals, human-reviewed positives, reviewed negatives, ambiguous examples, identities, projects, and independent held-out projects. Never report augmented images as added reviewed evidence.

## Dataset target and stopping rule

The exact target is evidence-driven, not a promise that a fixed count guarantees production. Start with this planning target:

- 60–75 training projects;
- 15–18 development projects;
- at least 20 strictly held-out test projects;
- at least 1,000 reviewed project-local symbol identities;
- at least 5,000 reviewed physical-body positives;
- at least 25,000 reviewed/provenance-bound negatives, emphasizing hard negatives.

Continue collecting until project-held-out learning curves plateau and the acceptance gates below are statistically supported. The current 330 positive crops are enough for a smoke test and pipeline validation, not a production model.

## Crop and augmentation requirements

- Render reference and candidate crops from the original PDF coordinate space at multiple deterministic raster resolutions.
- Use a fixed 280×280 model input, preserving aspect ratio with white padding. Record all transforms.
- Keep the physical body as the target. Do not train on a tag bbox while calling it a symbol.
- Produce a text mask and carrier/connection mask when vector text/topology is available. Initially retain these as metadata/auxiliary inputs; do not silently alter the pretrained RGB channel contract without an ablation.
- Provide deterministic crop jitter, DPI/resampling variation, controlled line-weight changes, small gaps/fragmentation, clipping, partial occlusion, permitted rotations/reflections, and reviewed anisotropic stretching.
- Reject any augmentation that changes connectivity, port count, directional meaning, or symbol class.
- Include hard negatives: tag strokes, text, blank space, carrier-only lines, table borders, adjacent equipment, partial symbols, wrong sibling subtype, nearby furniture/architecture, and other legend rows.

## Model package

Implement a reproducible shared-weight twin encoder with:

- Primary backbone: Meta `dinov2_vits14` / `facebook/dinov2-small`, Apache-2.0.
- Input: 280×280, grayscale replicated to three channels for the baseline.
- Projection head: 384 → 256, normalization, nonlinearity/dropout only if validated, final L2 normalization.
- Similarity: cosine similarity.
- Primary loss: Proxy Anchor.
- Mandatory challengers: Multi-Similarity and supervised contrastive/triplet-style retrieval loss; report all results instead of selecting by training loss.
- Sampler: balanced P×K identities with in-batch and mined hard negatives.
- Phase 1: frozen backbone, train projection head.
- Phase 2: unfreeze only the last four transformer blocks with a lower backbone learning rate.
- Optimizer: AdamW; warmup plus cosine decay; bf16/fp16 where supported; gradient accumulation as needed.
- At least three deterministic seeds.
- Mandatory architecture challenger: ConvNeXt-Tiny using the same split, crops, losses, calibration, and acceptance gates.

Do not use one global hand-picked cosine threshold. Fit calibration on the development split, freeze it, and evaluate once on the untouched test split. Support separate predeclared evidence lanes if necessary, but never per-document threshold hacks.

## Required files

Create at least:

- `README.md`
- `DATASET_CARD.md`
- `MODEL_CARD_TEMPLATE.md`
- `LICENSE_PROVENANCE.md`
- `schemas/reviewed_pair.schema.json`
- `configs/dinov2_vits14_proxyanchor.yaml`
- `configs/dinov2_vits14_multisimilarity.yaml`
- `configs/dinov2_vits14_supcon.yaml`
- `configs/convnext_tiny_proxyanchor.yaml`
- `src/inventory.py`
- `src/build_review_queue.py`
- `src/review_app.py` or an equivalent isolated review UI
- `src/export_dataset.py`
- `src/validate_dataset.py`
- `src/train.py`
- `src/evaluate.py`
- `src/calibrate.py`
- `src/export_onnx.py`
- `src/verify_onnx_parity.py`
- `scripts/bootstrap_local.sh`
- `scripts/run_smoke.sh`
- `scripts/run_full_pipeline.sh`
- `scripts/package_for_runpod.sh`
- `scripts/download_artifacts.md`
- `Dockerfile`
- a fully pinned dependency lockfile
- unit and integration tests

`scripts/run_full_pipeline.sh` must be the one production training command on RunPod. It must validate the dataset, train three seeds for every configured contender, evaluate, calibrate, export the winning eligible model to ONNX, verify PyTorch/ONNX parity, create checksums, and refuse to label a winner if no model passes all gates.

## Evaluation and release gates

Measure and report, overall and per project/family/density stratum:

- candidate-proposal recall@1/3/5/10;
- model top-1 accuracy and recall@3/5/10;
- physical-body localization IoU and center error;
- precision, recall, false-accept rate, false-reject rate, abstention/coverage;
- confusion among sibling visual subtypes;
- performance on tag/text/carrier/blank/partial-symbol negatives;
- p50/p95 latency, peak memory, model size;
- variance across three seeds;
- PyTorch versus ONNX embedding and verdict parity.

Suggested production gates, to be treated as requirements to verify rather than results to assume:

- candidate proposal recall@10 at least 99.5% on untouched projects;
- automatically accepted matches have a lower 95% confidence bound on precision of at least 99.5%, or a stricter owner-approved threshold based on estimating-loss tolerance;
- zero acceptance of the dedicated tag-text, carrier-only, blank, and wrong-port-count controls;
- no regression to the current clean authored-leader and uniquely-owned-envelope deterministic lanes;
- every non-accepted case is explicitly withheld for human review;
- no cross-project or revision leakage;
- bitwise-reproducible dataset manifests and repeatable decisions within documented numeric tolerance;
- ONNX parity passes before an artifact is eligible for future integration.

The model may rank only candidates that the proposal stage actually produced. Report proposal recall separately. Do not hide a proposal miss inside model accuracy.

## RunPod deliverable

The package must run on one 24 GB NVIDIA GPU such as an RTX 4090. Produce a numbered, beginner-safe RunPod guide that assumes the owner is not a software engineer. Use a RunPod Secure Cloud Pod, an official/current PyTorch-compatible base or the supplied pinned container, and a network volume mounted at `/workspace`. Do not hardcode an hourly price; direct the owner to the current RunPod console price.

The final artifact directory must contain:

- best checkpoint and all seed summaries;
- `model.onnx`;
- `calibration.json`;
- `preprocessing.json`;
- `dataset_manifest.json` plus SHA-256;
- `evaluation.json` and an HTML/Markdown report;
- `model_card.md`;
- `checksums.txt`;
- exact git commit, container digest, dependency lock hash, and command line.

## Safety and scope exclusions

- Do not change VectorGrid, table/schedule extraction, bboxes/citations, sequence-of-operations logic, reconciled quantities, Symbol Sweep, Legend Learn, Agent orchestration, UI, MCP, or existing scorer semantics.
- Do not claim the model identifies equipment from language. It compares visual identities.
- Do not let the neural score override deterministic contradictions such as the wrong number of ports, a tag-only region, impossible connectivity, or a known directional mismatch.
- Do not derive installed quantity from the metric score. Only a reviewed/accepted physical-body association may feed a future quantity path.
- Do not merge into main. Commit the isolated package and report the branch, SHA, exact inventory, review deficit, smoke-test results, and whether the data is sufficient for full training.

## Completion definition

This goal is complete only when:

1. The existing sources have been inventoried and their actual counts reported.
2. The review queue and human approval workflow work on real PDFs.
3. Dataset export is immutable, hashed, leakage-free, and reproducible.
4. The current data completes a local smoke train/evaluate/export/parity cycle.
5. The RunPod package can execute with one documented command.
6. The held-out evaluation cannot be run accidentally during tuning.
7. No production extraction file or existing ground-truth file changed.
8. The final report is blunt about whether the reviewed data volume is sufficient. If it is not, stop at a working annotation/training pipeline and list the exact remaining review queue. Do not manufacture readiness.
```
