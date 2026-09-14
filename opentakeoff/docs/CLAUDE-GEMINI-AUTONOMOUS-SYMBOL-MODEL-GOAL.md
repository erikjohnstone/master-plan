# One-prompt autonomous symbol-model goal for Claude or Gemini

This goal supersedes the owner-operated annotation workflow. Paste the entire block into Claude Code or Gemini CLI while it is opened at the repository root. The agent, not the repository owner, is responsible for inspecting and adjudicating the training examples.

```text
/goal Autonomously build, agent-review, train, and validate the production candidate metric model for OpenTakeoff HVAC/BAS legend-to-plan physical-symbol grounding. Use the PDFs and existing ground truth already present in this workspace. Do not ask the owner to label, crop, sort, approve, or adjudicate examples. Your job is to do that work from the source drawings, preserve evidence for every decision, discard anything you cannot prove, train the model on RunPod when credentials are available, and return a complete dataset/model/evaluation bundle.

Work persistently until the evidence-backed ceiling of the available corpus is reached. Checkpoint progress so the task can resume after interruption. Do not stop after building scaffolding, a tiny proof of concept, or one successful project.

## Read before acting

Read these required files completely:

- root `AGENTS.md`
- `opentakeoff/AGENTS.md`
- `opentakeoff-corpus/GOAL.md`
- `opentakeoff/docs/SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md`

If present, also read these background documents; their absence must not block execution because this goal and the production plan are self-contained:

- `opentakeoff/docs/SYMBOL-GROUNDING-DEEP-RESEARCH-REPORT.md`
- `opentakeoff/docs/SYMBOL-GROUNDING-PHASES-1-3-GOAL.md`

Use current primary-source web research for DINOv2, ConvNeXt, metric learning, ONNX Runtime, and RunPod before pinning dependencies or cloud configuration. Record URLs and access dates in the model card.

## Branch and safety

Create a new isolated worktree and branch named `agent/autonomous-symbol-metric-v1` from the current `origin/main`. Do not modify the owner’s dirty worktree. Before switching your working context, copy this authoritative goal and `SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md` into the new worktree as task documentation so they survive context compaction and are available there even though they began as untracked local files. Do not merge to main.

This task may create only:

- an isolated dataset/review/training package under `opentakeoff-ml/symbol_metric/`;
- immutable agent-reviewed annotations under that package;
- reports and evidence galleries under that package;
- RunPod scripts/configuration and downloaded model artifacts.

Do not change VectorGrid, table or schedule extraction, bbox/citation contracts, Symbol Sweep, Legend Learn, Agent behavior, UI, MCP, quantity semantics, existing ground truth, or production thresholds. The future model must eventually live on the shared UI/MCP path, but production integration is outside this goal.

## Owner-interaction policy

Do not ask the owner to review examples or make ordinary technical choices. Inspect the source PDF yourself and make evidence-backed decisions.

The only permitted blocking requests are:

1. a missing RunPod credential/payment configuration after every local task is complete; or
2. a genuinely unreadable/corrupt/missing source that cannot be recovered locally.

If RunPod credentials are absent, finish the entire local dataset, review, smoke-training, evaluation-package, and upload bundle first. Then ask once for `RUNPOD_API_KEY` to be placed in an environment variable or owner-designated local secret file. Never ask the owner to paste a secret into chat and never print it.

## Model to build

Primary model:

- shared-weight twin encoder;
- Meta DINOv2-S/14 (`dinov2_vits14` / `facebook/dinov2-small`, Apache-2.0 base weights);
- 280×280 input, aspect-preserving white padding;
- grayscale replicated to three channels for the baseline;
- 384→256 projection head;
- final L2 normalization;
- cosine similarity;
- Proxy Anchor primary loss.

Mandatory contenders:

- DINOv2-S/14 with Multi-Similarity loss;
- DINOv2-S/14 with supervised contrastive or triplet retrieval loss;
- ConvNeXt-Tiny with the same dataset, splits, calibration, and gates.

Do not choose a winner by architecture preference or training loss. Untouched-project performance, false accepts, coverage, runtime, and export parity decide.

The model’s task is project-local one-shot retrieval: given a legend/reference symbol crop, rank isolated physical-symbol candidates from the same drawing set. It is not a whole-page detector, semantic equipment classifier, OCR engine, or authority to create installed quantity.

## Inventory the available evidence

Resolve the actual paths and verify rather than forcing these expected counts:

- `HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/cases.json`
  - expected: 47 identities, 47 seed crops, 283 reviewed non-seed instances, 330 total positive motif crops, 213 tagged non-seed instances;
- `HVAC BAS Benchmark Collection/ground_truth/legend_learn/manifest.json`
  - expected: 30 documents, 77 cases, 59 complete cases, 2,496 reviewed rows, 1,572 `seedable: true` rows;
- `opentakeoff-corpus/ground_truth/symbol_grounding/manifest.json`
  - expected: 14 reviewed cases across four projects, one legend-symbol case, two refusal/negative cases;
- `HVAC BAS Benchmark Collection/pdf/`
  - expected: 30 selected PDFs;
- `opentakeoff-corpus/bulk/focus-group-2026-09-04/sources/`
  - expected: 190 PDF files and 113 analysis/source-plan identities, with split parts and revisions requiring family grouping.

Produce `reports/CORPUS_INVENTORY.json` and `reports/CORPUS_INVENTORY.md` with actual hashes, counts, page counts, drawing types, vector/raster status, legend availability, tags, symbol families, duplicates, split parts, revisions, and license/provenance notes.

## Remote/cloud corpus bootstrap — mandatory before accepting a reduced ceiling

If the bulk corpus is not already mounted, do not accept the 10-PDF repository subset as the corpus ceiling and do not retry Google Drive. The owner already published the two source archives as public GitHub release assets. Download them from GitHub, whose access is already required to fetch this specification:

```bash
CORPUS_DL="$PWD/.corpus-downloads"
mkdir -p "$CORPUS_DL/vol1" "$CORPUS_DL/vol2"
curl --fail --location --retry 5 --retry-all-errors \
  'https://github.com/erikjohnstone/master-plan/releases/download/corpus/HVAC_BAS_Plan_Sets.zip' \
  --output "$CORPUS_DL/HVAC_BAS_Plan_Sets.zip"
curl --fail --location --retry 5 --retry-all-errors \
  'https://github.com/erikjohnstone/master-plan/releases/download/corpus_2/HVAC_BAS_Plan_Sets_Vol2.zip' \
  --output "$CORPUS_DL/HVAC_BAS_Plan_Sets_Vol2.zip"
printf '%s  %s\n' \
  '3de3d2f3802abac15b0482174e699a7b971aa81f6d02beb4f465d8fb738cf612' "$CORPUS_DL/HVAC_BAS_Plan_Sets.zip" \
  'a0bea0c36e2f916cd94f28fd00dee1202f673ba121f94f7fbe31e4143b5590cc' "$CORPUS_DL/HVAC_BAS_Plan_Sets_Vol2.zip" \
  | sha256sum --check
unzip -q "$CORPUS_DL/HVAC_BAS_Plan_Sets.zip" -d "$CORPUS_DL/vol1"
unzip -q "$CORPUS_DL/HVAC_BAS_Plan_Sets_Vol2.zip" -d "$CORPUS_DL/vol2"
```

Release provenance:

- tag `corpus`, asset `HVAC_BAS_Plan_Sets.zip`, 552,425,946 bytes;
- tag `corpus_2`, asset `HVAC_BAS_Plan_Sets_Vol2.zip`, 1,109,306,456 bytes.

This specification branch also contains the small source manifests and reviewed symbol annotations at their expected paths:

- `HVAC BAS Benchmark Collection/manifest.json`
- `HVAC BAS Benchmark Collection/all_113_sets.csv`
- `HVAC BAS Benchmark Collection/focus_30_coverage.csv`
- `HVAC BAS Benchmark Collection/ground_truth/symbol_sweep/`
- `HVAC BAS Benchmark Collection/ground_truth/legend_learn/`
- `opentakeoff-corpus/ground_truth/symbol_grounding/`

Use `manifest.json` and the source hashes to map the 30 focus documents to the released archive members. Reassemble split parts only according to the recorded `source_parts` order and verify the resulting SHA-256 against each focus entry. Do not silently substitute a different revision.

If the shell lacks `curl` or `unzip`, install the ordinary package or use Python's standard library. If GitHub release asset download is also blocked, record the exact failed URL/status after one retry sequence and continue all code work against the available subset, but do not claim the reduced data is the available corpus or production-ready.

## Freeze the split before labeling

1. Hash every PDF.
2. Group split PDFs, revisions, duplicates, and derivatives into one `source_family_id`.
3. Freeze train, development, and test by whole source family before generating labels or training.
4. Reserve at least 20 diverse source families as a test vault when the corpus supports it.
5. Never expose test projects to model selection, threshold tuning, pseudo-labeling, hard-negative mining from model outputs, or training.
6. Create test evidence labels from source drawings before training. Once frozen, write a hash-sealed test manifest and do not modify it.

## Agent-only review protocol

Existing human-reviewed records remain a distinct `existing_human_reviewed` tier. New records created by this task must be labeled `agent_consensus_reviewed`, never falsely described as human ground truth.

For every proposed legend/reference → physical-body pair, create an evidence packet containing:

- reference/legend crop at multiple resolutions;
- candidate physical-body crop at multiple resolutions;
- full-page and local-context renders;
- tag bbox separately from body bbox;
- leader/arrow geometry when present;
- equipment-envelope ownership when present;
- vector primitives and connection/port topology when available;
- neighboring candidate crops, including sibling look-alikes;
- source hash, page, sheet, coordinate system, and exact bboxes.

Review every record with three independent passes. Store each pass before performing the next. Do not show a later pass the earlier verdict.

### Pass A — structural evidence

Judge only from authored tag, leader, envelope ownership, inline carrier connection, port count, topology, and vector containment. Record the evidence and verdict without seeing visual-similarity scores.

### Pass B — visual identity

Using high-resolution renders, compare only the physical symbol body with the legend/reference. Ignore the tag text. Examine internal strokes, enclosure, port geometry, asymmetry, line weight, clipping, rotation, and anisotropic scaling. Present candidates in randomized order and do not expose Pass A’s verdict.

### Pass C — drawing-context adjudication

Read the legend caption, surrounding callouts, schedule/equipment identity, diagram type, and local mechanical context. Verify that the proposed body is the object the drawing actually associates with the tag/reference. Do not accept a nearby object merely because the semantic equipment name sounds plausible.

### Acceptance policy

Accept a positive into training only when:

- all three passes identify the same physical body; or
- an exact authored tag/leader or uniquely owned equipment envelope proves the body, the visual pass agrees, and no topology/direction contradiction exists.

Reject as a hard negative when the proposal is tag text, blank space, a leader/carrier, a partial body, the wrong sibling subtype, an unrelated nearby object, or a topology/direction contradiction.

If passes disagree:

1. render at four scales and two raster DPIs;
2. inspect vector primitives and all neighboring candidates;
3. re-run an anonymized adjudication with candidate order reversed;
4. accept only if the source drawing now provides a single defensible answer;
5. otherwise label `ambiguous` or `no_physical_symbol` and exclude it from positive training.

No owner review is required. Ambiguity is handled by abstention, not a question to the owner.

## Blind consistency audit

After finishing a batch, randomly select at least 10% of accepted positives and 10% of hard negatives. Rebuild anonymized evidence packets with new IDs, reversed candidate order, and no prior verdict. Review them again after a context separation. Any disagreement invalidates the record and triggers review of its identity family.

Run a separate 100% re-review for:

- test-vault labels;
- directional symbols;
- 2-way/3-way and other sibling subtypes;
- cases without authored leaders;
- dense repeated symbols;
- heavily stretched, clipped, fragmented, or rasterized candidates;
- any label generated using a preliminary model proposal.

## Training-record schema

Create a versioned JSON Schema. Every record must include:

- immutable record ID and schema version;
- evidence tier (`existing_human_reviewed` or `agent_consensus_reviewed`);
- project and source-family IDs;
- source PDF SHA-256 and relative path;
- page index and sheet number;
- legend/reference ID, caption, bbox, and crop hash;
- candidate bbox;
- physical-body bbox or explicit null;
- tag bbox or explicit null;
- association method;
- verdict (`positive`, `hard_negative`, `easy_negative`, `ambiguous`, `no_physical_symbol`, `not_countable`);
- project-local symbol identity ID;
- semantic family when source-supported;
- directional flag;
- permitted rotations/reflections and reviewed stretch limits;
- all three review-pass verdicts/rationales;
- final adjudication rationale;
- renderer, extraction, and crop versions;
- timestamps and hashes for every evidence image.

Never write model predictions back into the existing ground-truth files.

## Autonomous corpus processing order

1. Reproduce and import all existing human-reviewed Symbol Sweep and symbol-grounding records.
2. Complete exhaustive evidence packets for the 30 focus PDFs.
3. Link the 1,572 seedable legend rows to physical plan occurrences wherever the source supports a defensible link.
4. Build hard negatives from tag strokes, blank space, leader/carrier lines, partial devices, table borders, neighboring objects, other legend rows, and visually similar sibling subtypes.
5. Expand through the remaining source families in the 113-set archive.
6. Prioritize drafting/export diversity, not repeated easy examples from one project.
7. Checkpoint manifests, evidence, and progress every 25 adjudicated identities.
8. Continue until all usable projects have been processed or the evidence-backed collection target is reached.

Initial planning target:

- 60–75 training projects;
- 15–18 development projects;
- at least 20 untouched test projects;
- approximately 1,000 reviewed project-local identities;
- at least 5,000 accepted physical-body positives;
- at least 25,000 evidence-bound negatives, emphasizing hard negatives.

Do not pad these counts with augmentations, duplicate renderings, model predictions, or unsupported guesses. Report the exact achieved counts. If the corpus cannot support the target, finish the maximum defensible dataset and document the ceiling.

## Augmentation

Augment only accepted real examples. Synthetic variants are not independent evidence.

Include deterministic, recorded variation in:

- raster DPI and resampling;
- crop jitter and white padding;
- line weight;
- small vector fragmentation/gaps;
- clipping and partial occlusion;
- reviewed anisotropic stretch;
- only the rotations/reflections permitted by that identity.

Never apply unrestricted rotation/reflection to directional flow arrows, check valves, actuators, or other asymmetric symbols. Reject any augmentation that changes port count, connectivity, direction, or class.

## Dataset quality outputs

Produce:

- immutable train/development/test manifests and SHA-256 hashes;
- WebDataset or PNG/JSONL shards;
- a dataset card and provenance/license ledger;
- class/project/family counts and imbalance report;
- duplicate/leakage report;
- evidence-tier breakdown;
- accepted/rejected/ambiguous visual galleries;
- a contact-sheet audit for every test identity;
- separate metrics for existing human-reviewed and agent-consensus-reviewed records.

Do not upload raw PDFs to RunPod by default. Package rendered crops, masks, annotations, and source hashes unless rights and sensitivity are explicitly confirmed. Keep the original PDFs local.

## Preliminary model use and pseudo-labeling

After the initial seed dataset passes validation, a preliminary model may rank additional **training/development** proposals to reduce search time. It may not approve its own proposal. Every such proposal still requires Pass A, Pass B, Pass C, and consistency audit.

Never use preliminary model outputs to create or revise test-vault truth.

## Training implementation

Create an isolated, fully pinned package at `opentakeoff-ml/symbol_metric/` containing at least:

- `README.md`
- `DATASET_CARD.md`
- `MODEL_CARD_TEMPLATE.md`
- `LICENSE_PROVENANCE.md`
- JSON schemas
- inventory, packet-generation, review, dataset-export, validation, training, evaluation, calibration, ONNX export, and parity code
- DINOv2 Proxy Anchor, Multi-Similarity, supervised-contrastive/triplet configs
- ConvNeXt-Tiny challenger config
- `Dockerfile` and dependency lock
- `scripts/run_smoke.sh`
- `scripts/package_for_runpod.sh`
- `scripts/run_full_pipeline.sh`
- tests for coordinates, crop parity, split leakage, duplicate hashes, review independence, truth immutability, deterministic generation, calibration isolation, and ONNX parity.

Training procedure:

1. Validate and hash the complete dataset.
2. Phase 1: freeze the backbone and train the 384→256 projection head.
3. Phase 2: unfreeze only the last four DINOv2 blocks with a lower backbone learning rate.
4. Use AdamW, warmup + cosine decay, bf16/fp16, balanced P×K identity sampling, hard-negative mining, and gradient accumulation as needed.
5. Train at least three deterministic seeds per contender.
6. Select hyperparameters on development projects only.
7. Fit logistic/temperature calibration on development pairs; use isotonic only if sample volume supports it.
8. Freeze architecture, preprocessing, augmentation, and thresholds.
9. Evaluate the test vault once.
10. Export only eligible contenders to ONNX and verify PyTorch/ONNX embedding, ranking, probability, and verdict parity.

## RunPod execution

Use a RunPod Secure Cloud Pod, one available NVIDIA GPU with at least 24 GB VRAM such as an RTX 4090, and a network volume mounted at `/workspace`. Check current pricing in the RunPod console; do not hardcode an old price.

If `RUNPOD_API_KEY` is already configured:

1. create/reuse the network volume;
2. create the Pod using the pinned environment;
3. upload the crop-only training bundle;
4. verify hashes on the Pod;
5. run `scripts/run_smoke.sh`;
6. run `scripts/run_full_pipeline.sh` in a persistent session;
7. monitor logs, GPU utilization, storage, checkpoints, and failures;
8. resume from checkpoints when necessary;
9. download and verify the release/evaluation bundle locally;
10. stop the Pod after artifacts are safe and report incurred runtime/cost from actual RunPod records.

Do not expose credentials in logs, commits, reports, or chat.

## Measurements

Report overall and per project/family/density/evidence tier:

- proposal recall@1/3/5/10;
- top-1 accuracy and retrieval recall@3/5/10;
- body localization IoU and center error;
- precision, recall, false-accept, false-reject, abstention, and coverage;
- sibling-subtype confusion;
- tag/text/carrier/blank/partial/wrong-topology negative performance;
- p50/p95 proposal and metric latency;
- peak GPU/CPU memory and model size;
- results and variance across seeds;
- PyTorch/ONNX parity;
- visual examples for every error.

Measure candidate proposal separately from metric ranking. Do not credit the model for candidates it never received or hide proposal misses inside an aggregate.

## Eligibility gates

A model is not an eligible production candidate unless:

- proposal recall@10 is at least 99.5% on untouched projects;
- the lower 95% confidence bound for precision among automatically accepted matches is at least 99.5%, or a stricter owner-defined business threshold;
- there are zero automatic accepts on dedicated tag-only, text-only, carrier-only, blank, partial-body, wrong-port-count, and impossible-direction controls;
- no clean authored-leader or uniquely owned equipment-envelope deterministic lane regresses;
- failures are explicit withholds, not fabricated matches or quantities;
- results remain acceptable separately on existing human-reviewed records;
- test labels were frozen before training and never model-authored;
- three-seed stability and ONNX parity pass;
- every artifact has source, dataset, code, dependency, container, preprocessing, calibration, and model hashes.

If no contender passes, return the best honest checkpoint as experimental, mark it ineligible, explain exact failure modes, and preserve the dataset/evidence so the next collection round is targeted. Never lower gates or rewrite labels to declare success.

## Final deliverables

Return one local release directory and one compressed archive containing:

- immutable dataset manifests and shards;
- evidence packets and visual audit galleries;
- review-pass and adjudication logs;
- exact counts by evidence tier, split, project, identity, positive, negative, and ambiguous;
- all seed summaries and checkpoints;
- `model.onnx` for every eligible contender;
- `calibration.json` and `preprocessing.json`;
- `evaluation.json`, CSV, and a readable report;
- `model_card.md` and `dataset_card.md`;
- `checksums.txt`;
- exact git SHA, container digest, dependency hash, commands, RunPod runtime, and actual cost;
- a blunt release decision: eligible, experimental-only, or no model winner.

Also commit the isolated work on `agent/autonomous-symbol-metric-v1` and report the commit SHA. Do not merge it and do not change production code.

## Completion condition

Complete only after all usable corpus sources have been inventoried, the maximum defensible agent-consensus dataset has been created, blind consistency audits pass, all contenders have been trained and evaluated when RunPod is available, artifacts are downloaded and verified, and a truthful release decision has been issued. The owner must not be asked to label or adjudicate anything.
```
