# Production metric model plan for HVAC/BAS symbol grounding

**Decision date:** 2026-09-14  
**Scope:** project-local legend/reference symbol → physical plan-symbol retrieval  
**Production posture:** human-in-the-loop; an uncertain model must withhold, never invent installed quantity

## The decision

Train a **shared-weight DINOv2-S/14 twin encoder** with a 256-dimensional, L2-normalized metric projection head. The query is a reviewed symbol crop from the project's legend or another trusted reference. The gallery is a set of isolated physical-symbol candidates proposed from that same drawing set. The model ranks candidates by cosine similarity; deterministic tag, leader, envelope, port-count, connectivity, and directional checks decide whether a high-scoring candidate is eligible for automatic acceptance or must be withheld.

Use Meta's base `dinov2_vits14` / `facebook/dinov2-small`, not DINOv2 Cell/XRay derivatives and not an unlicensed checkpoint. The base model is Apache-2.0, has 21 million parameters, a 384-dimensional embedding, and 14-pixel patches; Meta explicitly positions it as a general feature extractor that supports nearest-neighbor retrieval.[^1] A DINOv2 retrieval baseline has also been used in fine-grained sketch retrieval research, which is closer to sparse engineering linework matching than ordinary ImageNet classification.[^2]

The model input is **280×280** because 280 is divisible by DINOv2's 14-pixel patch size. A 384→256 projection head keeps runtime and storage small. Start with grayscale replicated across the three RGB channels so the pretrained input contract remains intact. Text/carrier masks and vector topology remain separate evidence until an ablation proves that changing the image channels improves held-out projects.

This is the recommended first production candidate, not a claim that its first checkpoint will be production-ready. Run **ConvNeXt-Tiny** as a mandatory challenger on the same split and gates. If ConvNeXt wins on untouched projects, latency, and false accepts, ship ConvNeXt. The decision must come from held-out evidence, not architectural preference.

### Why this model and not the tempting alternatives

| Option | Decision | Reason |
|---|---|---|
| DINOv2-S/14 twin encoder | **Primary** | Compact, permissive base license, retrieval-oriented features, enough capacity for drafting variation, and practical on one 24 GB GPU. |
| ConvNeXt-Tiny twin encoder | **Mandatory challenger** | Convolutional inductive bias can be excellent for thin local line patterns; it may quantize or run faster. It needs the same honest bakeoff. |
| Generic MobileNet/ResNet embedding without tuning | Reject as decider | The existing bakeoff found natural-image embeddings compressing sparse linework and assigning unsafe similarity to tag text. It can be a baseline only. |
| CLIP/SigLIP | Reject as primary | Text-image semantics are not the problem. We need exact visual identity and topology, including 2-way versus 3-way look-alikes. |
| Whole-sheet object detector | Not the first model | The set of symbols changes by project and legend. A closed-class detector cannot naturally recognize a new firm's symbol from one legend example. It can be reconsidered if candidate proposal recall is proven inadequate. |
| Sub-center ArcFace | Challenger, not default | It was created to tolerate noisy class labels. Our labels should be reviewed, and the production task is retrieval of unseen project-local identities. Proxy/pair-based losses are the cleaner first experiment. |
| More vector heuristics forever | Reject as sole solution | Vector evidence remains essential, but fragmentation, drafting style, clipping, line weight, rasterization, and stretch create a ceiling that one more tolerance cannot reliably remove. |

## The production architecture

The metric model is one component, not a magical page reader:

1. **Reference acquisition.** Legend Learn or another reviewed source provides the reference symbol bbox and caption.
2. **Candidate proposal.** The shared vector-first pipeline isolates possible physical bodies near tags, leader endpoints, connected carriers, equipment envelopes, and geometry clusters. It may also generate broader candidates when no tag exists.
3. **Metric ranking.** The same DINOv2 encoder embeds the reference crop and every candidate crop. Cosine similarity ranks the top candidates.
4. **Structural verification.** Port count, connectivity, directional consistency, tag association, authored leaders, ownership, and other deterministic contradictions remain hard gates. A neural score cannot turn tag text, a pipe, or the wrong topology into a device.
5. **Calibrated verdict.** The system emits `verified`, `withheld`, or `rejected`, with the model/version, similarity, calibration, evidence, bboxes, and reason.
6. **Human approval.** The estimator sees the tag, proposed physical symbol, legend reference, and schedule evidence. Approved physical objects—not raw scores—may contribute to installed quantity.

This distinction matters: a metric model can rank only candidates it receives. If the real symbol never enters the top-K proposal set, model accuracy is irrelevant. The evaluation therefore keeps **proposal recall@K** separate from **metric ranking accuracy**.

## What training data already exists

I inspected the current local corpus rather than assuming the earlier headline numbers.

| Reviewed source | Current verified inventory | What it provides | What it does not provide |
|---|---:|---|---|
| `ground_truth/symbol_sweep/cases.json` | 47 symbol identities; 47 seeds; 283 reviewed non-seed instances; **330 positive motif crops** total; 213 non-seed instances have tag evidence | The strongest immediate positive pairs and real drafting variation | Broad identity/project coverage, systematic hard negatives, and complete physical-body bboxes for every training record |
| `ground_truth/legend_learn/manifest.json` | 30 documents; 77 cases; 59 complete; 2,496 reviewed rows; **1,572 seedable symbol rows** | A large queue of trusted project-local reference queries | It does not prove where each reference appears on plan sheets |
| `ground_truth/symbol_grounding/manifest.json` | **14 reviewed cases across four projects**; one legend-symbol case; two explicit unresolved/refusal negatives | Direct tag/reference-to-body truth and refusal examples | Enough variety or volume for a production metric model |
| Focus collection | 30 PDFs | Curated HVAC/BAS depth and the best place to finish annotation mechanics | Enough independent drafting firms for final generalization by itself |
| Bulk source archive | 190 PDF files, approximately **113 source plan sets** after accounting for split parts/revisions | Enough raw projects to build a credible project-held-out dataset | Reviewed legend-to-plan links; redistribution/training rights must still be tracked per source |

**Blunt answer:** the corpus contains enough material to build the dataset and run a smoke fine-tune today. It does **not** yet contain enough reviewed legend→physical-body pairs to truthfully train and certify a production model. The 1,572 legend entries are potential queries, not 1,572 positive matches. Claude must propose candidate links; a human must approve or correct them.

## The exact record we need to create

Each training identity should be scoped as `source-family + reviewed reference row`, not merely a semantic name such as “control valve.” Two firms may draw the same semantic device differently, and two visually similar glyphs can mean different things. The production task is: “Does this candidate match this project's reference?”

For every reviewed reference identity, retain:

- source PDF SHA-256, project/family ID, page, sheet, renderer version, and original coordinate space;
- legend/reference bbox and caption;
- physical-body bbox and optional tag bbox;
- association evidence: authored leader, equipment-envelope ownership, inline connection, legend similarity, or human-only;
- verdict: positive, hard negative, easy negative, ambiguous, no physical symbol, or not countable;
- transform policy: none, 180°, 90°, or full dihedral symmetry; directional flag; reviewed stretch limits;
- crop SHA-256 and immutable parent annotation ID;
- review identity, timestamp, status, and notes.

The body bbox and tag bbox must be different fields. The current failure mode—highlighting a tag fragment or empty space while calling it a physical symbol—must become a labeled negative, not training noise.

### Positive pairs

- legend crop → approved plan-body crop;
- plan-body crop → another approved occurrence of the same project-local identity;
- the same approved body rendered at different DPI/resampling settings;
- reviewed variants of the same legend row when the legend explicitly groups them.

### Hard negatives

- the printed tag itself;
- tag-adjacent blank space;
- leader line or carrier-only crop;
- partial device body;
- table borders and line intersections;
- the closest sibling subtype, especially 2-way versus 3-way valves, supply versus return devices, or visually similar damper/actuator states;
- nearby equipment, architecture, and furniture;
- candidates from other legend rows on the same sheet;
- a plausible symbol whose topology, port count, or direction conflicts with the reference.

Every approved positive should initially contribute at least five hard negatives. Hard-negative volume matters more than generating tens of thousands of easy white-background crops.

## How to turn the corpus into training data

### Phase 1 — freeze provenance and splits

1. Hash every PDF and assign a `source_family_id` that groups split parts, revisions, and duplicate plan sets.
2. Select train, development, and test by whole source family **before** candidate generation.
3. Never let a page, revision, crop derivative, or firm's duplicate issue cross splits.
4. Freeze at least 20 diverse projects as a test vault. Do not open test results during model/loss/threshold tuning.
5. Create a license/provenance ledger. Keep raw PDFs local unless their use and transfer rights are confirmed.

### Phase 2 — bootstrap the review queue

1. Import the 47 Symbol Sweep identities and 283 reviewed plan instances first.
2. Render one clean reference crop and one clean physical-body crop per reviewed instance, with context thumbnails.
3. Generate negative candidates from nearby tags, carriers, partial bodies, and sibling symbols.
4. Import the 1,572 seedable Legend Learn rows as **unlinked queries**.
5. Use the existing vector/tag/leader/envelope pipeline to rank possible plan instances, but label every result `proposal`.
6. Present those proposals in a review application: reference on the left; page context and candidates on the right; accept, reject, correct bbox, ambiguous, no occurrence, not countable.
7. Keep every correction and superseded review in an append-only audit trail.

### Phase 3 — expand by information value

Prioritize projects and examples that change the learning problem:

- different engineering firms/export pipelines;
- inline valves and dampers, equipment envelopes, sensors, diffusers/grilles, control bubbles, and schematic/riser symbols;
- dense repeated arrays versus sparse mechanical rooms;
- split/stacked tags and no-tag occurrences;
- permitted rotations and asymmetric directional devices;
- line-weight changes, vector fragmentation, clipping, rasterized/outlined text, and nonuniform stretch;
- siblings that humans distinguish by one port, blade, arrow, or internal mark.

Do not count augmented images as independent reviewed evidence. They improve robustness after a real example has been reviewed; they do not increase the number of independent projects.

### Planning target, not a guarantee

Use the following as the first collection target:

- 60–75 training projects;
- 15–18 development projects;
- at least 20 untouched test projects;
- roughly 1,000 reviewed project-local identities;
- at least 5,000 reviewed physical-body positives;
- at least 25,000 provenance-bound negatives, mostly hard negatives.

These counts do not certify production. Continue until held-out project learning curves plateau and the statistical release gates are met. Conversely, if excellent performance is reached earlier with tight confidence bounds across all strata, the evidence—not an arbitrary quota—should decide.

Two execution modes are documented:

- [CLAUDE-SYMBOL-METRIC-DATASET-GOAL.md](./CLAUDE-SYMBOL-METRIC-DATASET-GOAL.md) builds an owner-operated human review queue.
- [CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md](./CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md) delegates source inspection, three-pass evidence review, adjudication, dataset creation, training, RunPod operation, and final evaluation to Claude or Gemini. New labels are accurately described as `agent_consensus_reviewed`, kept separate from existing human-reviewed truth, and ambiguous cases are discarded rather than sent to the owner.

## Training recipe

### Baseline configuration

| Setting | Starting value |
|---|---|
| Backbone | `dinov2_vits14` / `facebook/dinov2-small` |
| Input | 280×280, preserve aspect ratio, white pad, replicated grayscale |
| Projection | Linear 384→256, optional LayerNorm/GELU/dropout only by ablation, final L2 normalization |
| Similarity | Cosine |
| Primary loss | Proxy Anchor |
| Challengers | Multi-Similarity; supervised contrastive/triplet retrieval; ConvNeXt-Tiny backbone |
| Sampler | Balanced P×K identities; start near 16 identities × 4 samples, use gradient accumulation if necessary |
| Optimizer | AdamW |
| Phase 1 LR | Head around `1e-4`; frozen backbone |
| Phase 2 LR | Head around `1e-4`, last four backbone blocks around `1e-5` |
| Schedule | Warmup plus cosine decay |
| Precision | bf16 where supported, otherwise fp16 |
| Seeds | At least three |
| Early stopping | Development retrieval/FAR/coverage plateau, never training loss alone |

Proxy Anchor is a strong first loss because it combines pair relationships with learnable class proxies and was designed for faster convergence in deep metric learning.[^3] Multi-Similarity and supervised contrastive/triplet losses are mandatory challengers; the PyTorch Metric Learning project implements these losses, miners, cross-batch memory, and reference-embedding workflows.[^4] Do not simply accept a recommendation for Sub-center ArcFace: it was motivated by noisy labels, while this release should train only on reviewed truth.[^5]

### Stage 0 — dataset validation

- verify every source hash and bbox;
- render a visual contact sheet for a random sample and every schema edge case;
- detect empty crops, tag-as-body labels, duplicate crop hashes, split leakage, and invalid transform policies;
- calculate identity/project/family/positive/negative counts by split;
- fail the run if any reviewed record references a missing or changed source.

### Stage 1 — projection-head training

Freeze DINOv2. Train only the projection head until development retrieval stops improving. This cheaply determines whether the base representation already separates the domain.

### Stage 2 — limited backbone adaptation

Unfreeze only the last four transformer blocks. Use the smaller backbone learning rate, balanced identity batches, and hard-negative mining. Full-backbone fine-tuning is a later ablation, not the default with this data volume.

### Stage 3 — calibration

Fit a calibration layer on development pairs only—logistic/temperature calibration first, isotonic only if there is enough data. Select the automatic-accept threshold to meet the required precision/FAR, then freeze it. Allow predeclared evidence lanes if necessary, such as “leader + topology + metric” versus “metric only,” but never per-document thresholds.

### Stage 4 — one-time held-out evaluation

After architecture, augmentation, loss, and threshold choices are frozen, evaluate the untouched test projects once. Report every project and stratum, not only one aggregate.

## Required measurements and production gates

### Candidate proposal

- recall@1/3/5/10 of the real body in the proposal list;
- proposal count and p50/p95 proposal latency;
- failures by tag/leader/envelope/no-tag lane;
- body-box IoU and center error.

**Suggested gate:** proposal recall@10 ≥99.5% across untouched projects, with no important family hidden by an aggregate. If this fails, improve proposal/isolation first; retraining the metric head cannot recover missing candidates.

### Metric verifier

- top-1 accuracy and recall@3/5/10;
- precision, recall, false-accept rate, false-reject rate, and abstention/coverage;
- sibling-subtype confusion;
- false accepts on tag/text/carrier/blank/partial/wrong-port controls;
- performance by project, firm/style, density, symbol family, rotation/stretch, and vector/raster condition;
- p50/p95 latency, peak memory, and model size;
- mean and range across at least three training seeds.

**Suggested gate:** the lower 95% confidence bound for precision among automatically accepted matches is at least 99.5%, or stricter if the business sets a lower estimating-loss tolerance. Dedicated tag-only, carrier-only, blank, and impossible-topology controls must have zero automatic accepts. A zero-error sample must still be large enough to mean something: with zero observed errors, the rough 95% “rule of three” upper bound is `3 / n`, so 600 independent negatives support only a <0.5% error upper bound and 3,000 support <0.1%.

### System release

- no regression to clean authored-leader and uniquely-owned-envelope deterministic lanes;
- every nonaccepted case is visible as withheld, never silently dropped or counted;
- PyTorch/ONNX embedding and verdict parity passes;
- model, preprocessing, calibration, dataset, code commit, container, and dependencies are all hashed/versioned;
- the estimator can inspect reference, tag, physical body, schedule row, and reason before approval;
- no model score directly creates installed quantity.

## RunPod: the beginner-safe, exact sequence

Do **not** rent a GPU until Claude has completed the task above and `scripts/run_smoke.sh` passes locally. The completed package is deliberately designed so the Pod work becomes one main command rather than an improvised notebook.

### 1. Create the training bundle locally

In the Claude worktree, after human review and dataset export:

```bash
cd opentakeoff-ml/symbol_metric
./scripts/run_smoke.sh
./scripts/package_for_runpod.sh
```

The second command must produce one archive such as:

```text
dist/opentakeoff-symbol-metric-v1.tar.zst
```

It should contain code, pinned dependencies, the crop/annotation dataset, manifests, and hashes—**not raw PDFs**, unless rights and sensitivity have been explicitly approved.

### 2. Create the Pod

In the RunPod console:

1. Enable account security/2FA and add only the amount of credit you intend to use.
2. Create a network volume large enough for the dataset, checkpoints, and multiple runs; 100 GB is a comfortable initial size for crops and artifacts.
3. Deploy a **Secure Cloud** Pod in the same region as the network volume. RunPod describes Secure Cloud as the production/sensitive-data option and network volumes as persistent across Pod deletion.[^6]
4. Choose one NVIDIA RTX 4090 with 24 GB VRAM, or an equivalent available 24 GB GPU. RunPod's guidance lists computer vision as an 8–16 GB workload; 24 GB gives room for balanced batches and three-seed runs.[^7]
5. Use the current official PyTorch template or the pinned container produced by Claude. Mount the network volume at `/workspace`.
6. Check the current displayed GPU price. RunPod says the console is the source of the latest rate and bills Pods by the second; do not rely on an old dollar estimate.[^8]
7. Open the Pod's web terminal/JupyterLab. RunPod supports SSH, JupyterLab, and VS Code, but the web terminal is the least setup for a one-off training run.[^6]

### 3. Transfer the archive

On the Mac, install/use `runpodctl` and send the archive:

```bash
cd /path/to/claude-worktree/opentakeoff-ml/symbol_metric
runpodctl send dist/opentakeoff-symbol-metric-v1.tar.zst
```

The command prints a one-time receive code. In the Pod terminal, run:

```bash
cd /workspace
runpodctl receive THE-CODE-PRINTED-ON-YOUR-MAC
```

RunPod documents `runpodctl` as its simplest one-off transfer method; use SCP or cloud sync instead for a substantially larger dataset.[^9]

### 4. Unpack and verify

In the Pod terminal:

```bash
cd /workspace
tar --use-compress-program=unzstd -xf opentakeoff-symbol-metric-v1.tar.zst
cd opentakeoff-symbol-metric-v1
sha256sum -c checksums.txt
./scripts/bootstrap_local.sh
./scripts/run_smoke.sh
```

Do not proceed if hashes, CUDA detection, dataset validation, crop visualization, or the smoke train/export/parity cycle fails.

### 5. Run the complete experiment

Start a persistent terminal session:

```bash
tmux new -s symbol-metric
```

Then run the single pipeline command Claude was required to provide:

```bash
cd /workspace/opentakeoff-symbol-metric-v1
./scripts/run_full_pipeline.sh 2>&1 | tee /workspace/symbol-metric-full.log
```

Detach without stopping it by pressing `Ctrl-B`, then `D`. Reopen later with:

```bash
tmux attach -t symbol-metric
```

The command must validate the data, train three seeds of DINOv2 configurations and the ConvNeXt challenger, evaluate, calibrate, select only an eligible winner, export ONNX, verify parity, and write the final model/evidence bundle. If nothing passes, its correct output is **no production winner**.

### 6. Retrieve artifacts

The expected final folder is:

```text
/workspace/opentakeoff-symbol-metric-v1/artifacts/release-candidate/
```

It must contain at least:

- `model.onnx`
- `best.ckpt`
- `calibration.json`
- `preprocessing.json`
- `dataset_manifest.json` and hash
- `evaluation.json`
- a readable evaluation report
- `model_card.md`
- `checksums.txt`
- git commit, container digest, dependency-lock hash, and exact command

Archive it on the Pod:

```bash
cd /workspace/opentakeoff-symbol-metric-v1/artifacts
tar -I 'zstd -19' -cf symbol-metric-release-candidate.tar.zst release-candidate
runpodctl send symbol-metric-release-candidate.tar.zst
```

On the Mac, use the printed one-time code:

```bash
runpodctl receive THE-CODE-PRINTED-BY-THE-POD
```

Verify `checksums.txt` locally, back the bundle up outside RunPod, then stop/delete compute you no longer need. RunPod explicitly says it is not long-term backup storage.[^8]

## Deployment after the model passes

Export a fixed-preprocessing ONNX model and verify that PyTorch and ONNX embeddings, rankings, calibration, and verdicts agree within a documented tolerance. ONNX Runtime supports several execution providers, including web/browser paths; quantization must be measured, not assumed.[^10] Start with FP16/WebGPU where available and a WASM fallback. Try INT8 only after held-out parity and accuracy pass. ONNX Runtime recommends dynamic quantization primarily for transformer models and static quantization primarily for CNNs, which is another reason to evaluate DINOv2 and ConvNeXt separately.[^11]

Integration is a later shared-path change. One module must serve both UI and MCP. The deployed contract should include:

```ts
type SymbolVerificationResult = {
  referenceId: string;
  candidateId: string;
  physicalObjectId: string;
  verdict: "verified" | "withheld" | "rejected";
  similarity: number;
  calibratedProbability: number;
  modelVersion: string;
  preprocessingVersion: string;
  referenceBBox: [number, number, number, number];
  physicalBodyBBox: [number, number, number, number] | null;
  tagBBox: [number, number, number, number] | null;
  evidence: {
    proposalLane: string;
    topologyConsistent: boolean;
    leaderConsistent: boolean | null;
    envelopeConsistent: boolean | null;
    directionalConsistent: boolean | null;
  };
  reason: string;
};
```

The exact threshold belongs in `calibration.json`, never a UI-only constant. Cache reference embeddings once per legend row and candidate embeddings once per crop. The model reranks top-K candidates; it does not scan every pixel of every 75-page set serially.

## What “production-ready” means here

It does not mean “the loss went down,” “one NAVFAC symbol looks right,” or “47/47 cases pass with exceptions.” It means:

- the dataset is independently reviewed, immutable, source-bound, and leakage-free;
- candidate proposal and model ranking are scored separately;
- the test set contains unseen projects and drafting styles;
- hard negatives include the exact failures that embarrassed the current UI;
- acceptance is calibrated to a business-grade false-accept tolerance;
- the system withholds intelligently and shows the estimator why;
- runtime and deployment parity are measured;
- every accepted installed observation points to the actual physical body, not merely nearby text;
- the model improves the existing vector-first path without weakening deterministic evidence or table extraction.

There is no responsible one-command shortcut from today's 330 positive crops to that standard. There is, however, a straightforward path: build the review pipeline, convert the corpus into thousands of honest pairs, train the DINOv2 twin encoder and challenger, freeze calibration, and let untouched projects decide.

## Sources

[^1]: Meta AI, [DINOv2 model card](https://github.com/facebookresearch/dinov2/blob/main/MODEL_CARD.md) (Apache-2.0; ViT-S/14 dimensions, patch size, retrieval use, and parameter count).
[^2]: Koley et al., [“You'll Never Walk Alone: A Sketch and Text Duet for Fine-Grained Image Retrieval,” CVPR 2024](https://openaccess.thecvf.com/content/CVPR2024/html/Koley_Youll_Never_Walk_Alone_A_Sketch_and_Text_Duet_for_CVPR_2024_paper.html) (DINOv2-based triplet sketch retrieval baseline).
[^3]: Kim et al., [“Proxy Anchor Loss for Deep Metric Learning,” CVPR 2020](https://openaccess.thecvf.com/content_CVPR_2020/html/Kim_Proxy_Anchor_Loss_for_Deep_Metric_Learning_CVPR_2020_paper.html).
[^4]: [PyTorch Metric Learning loss documentation](https://kevinmusgrave.github.io/pytorch-metric-learning/losses/) and [miner documentation](https://kevinmusgrave.github.io/pytorch-metric-learning/miners/).
[^5]: Deng et al., [“Sub-center ArcFace: Boosting Face Recognition by Large-scale Noisy Web Faces,” ECCV 2020](https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123560715.pdf).
[^6]: RunPod, [Pods overview](https://docs.runpod.io/pods/overview) and [Choose a Pod](https://docs.runpod.io/pods/choose-a-pod).
[^7]: RunPod, [Choose a Pod: workload and VRAM guidance](https://docs.runpod.io/pods/choose-a-pod).
[^8]: RunPod, [Pod pricing and storage guidance](https://docs.runpod.io/pods/pricing).
[^9]: RunPod, [Transfer files](https://docs.runpod.io/pods/storage/transfer-files).
[^10]: ONNX Runtime, [Execution Providers](https://onnxruntime.ai/docs/execution-providers/) and [WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).
[^11]: ONNX Runtime, [Model quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html).
[^12]: FloorPlanCAD, [dataset and license](https://floorplancad.github.io/) (15,663 CAD drawings; annotations are CC BY-NC 4.0 and drawing copyright is not owned by the authors).
[^13]: DLR, [PID2Graph dataset](https://zenodo.org/records/14803338) (P&ID graph/bbox data with cited CC BY-SA sources).

### External data caution

FloorPlanCAD is useful research evidence for vector symbol spotting, but its annotation license is noncommercial and the authors state they do not own the drawing copyrights; do not mix it into a commercial training set without separate legal clearance.[^12] PID2Graph is a useful topology/P&ID research corpus but is not an HVAC/BAS plan substitute and carries share-alike/source-specific licensing that needs review.[^13] The safest production dataset is the company's own provenance-reviewed corpus, with counsel/owner approval for every source family.
