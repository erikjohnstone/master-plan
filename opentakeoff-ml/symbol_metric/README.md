# OpenTakeoff DINOv2 symbol-metric data

This package turns the audited RT-DETR image collection into a **source-native
metric-learning dataset** for the DINOv2-S/14 twin encoder.  It does not alter
the extraction engine, browser, MCP server, quantities, citations, or bounding
boxes.

## What this is for

The training task is *not* "recognise every HVAC symbol universally."  The
production task is narrower and safer: after OpenTakeoff has found a legend
reference and candidate regions on one drawing set, rank the candidates that
look most like that reference.  This bundle is useful for visual pretraining
and supervised metric warm-up.  It is **not** a certified legend-to-plan
benchmark and must never, by itself, release an installed quantity.

## What the builder accepts

The builder reads the previous RT-DETR `TRAIN_NOW` packs.  It accepts only
published `CC BY 4.0`, `Public Domain`, or `MIT` source records and excludes:

- the quarantined synthetic P&ID pack;
- packs whose main purpose is long duct/pipe linework rather than symbols;
- records from ambiguous or missing-license sources;
- conflicting duplicate source annotations; and
- invalid, tiny, or missing image crops.

The selected packs are mechanical airside/equipment/terminal symbols plus
valves, instruments, and actuators.  The source images are **not copied** by
default.  A source-native manifest is the correct local format: it avoids
duplicating several gigabytes of pixels and retains every source path,
annotation, license, and crop coordinate.  Use `materialize_crops.py` after
copying the source collection to a GPU machine if a portable crop cache is
wanted.

## Build a training bundle

```sh
python3 scripts/build_rtdetr_metric_dataset.py \
  --rtdetr-root /absolute/path/to/HVAC_BAS_RTDETR \
  --output /absolute/path/to/HVAC_BAS_RTDETR/DINOv2_METRIC_V1

python3 scripts/validate_rtdetr_metric_dataset.py \
  --dataset /absolute/path/to/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 \
  --rtdetr-root /absolute/path/to/HVAC_BAS_RTDETR/TRAIN_NOW
```

The output is deliberately small: `manifests/records_{train,val,test}.jsonl.gz`
contains every retained crop and `manifests/positive_pairs_train.jsonl.gz`
contains two kinds of pair, explicitly labelled:

| Pair type | Meaning | Safe use |
| --- | --- | --- |
| `same_instance_augmentation` | Two deterministic views of the same annotated crop | Default DINO-style self-supervised pair |
| `same_annotated_class_weak` | Different source instances share one source-local semantic label | Optional metric warm-up only; not test truth |

Each record has an `evidence_tier` and `release_restriction`.  The loader
defaults to the first, exact-positive mode.  Any later use of weak pairs must
be reported separately and cannot be used to claim plan-grounding accuracy.

## Train-machine crop cache

After the RT-DETR collection and this bundle are on a RunPod volume:

```sh
python3 scripts/materialize_crops.py \
  --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 \
  --rtdetr-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW \
  --output /workspace/dino-crops-v1
```

The data loader in `symbol_metric_dataset.py` can read either the original
source images or that cache.  It yields two independently transformed views of
the **same physical annotation** by default, and preserves the source-local
class as an optional proxy label for supervised warm-up.

Use `symbol_metric_transforms.py` as the fixed final input transform: it retains
aspect ratio, pads to 280×280, converts the drawing crop to grayscale, then
replicates it to three channels for DINOv2-S/14. The RunPod trainer applies
carefully bounded crop augmentation before that canonical preparation: it never
rotates or mirrors symbols; its extended profile permits small anisotropic
stretch only where the source class is not directional or asymmetric.

## Run the actual model training on RunPod

Read [`RUNPOD_ELI5.md`](RUNPOD_ELI5.md) from top to bottom. It begins with
opening RunPod and gives copy-paste commands for transfer, GPU checks,
backbone download, smoke training, real training, evaluation, and ONNX export.
The only required tools are the scripts in this folder:

| Script | What it does |
| --- | --- |
| `scripts/upload_data_to_runpod.sh` | Mac-side source-native upload of only the required packs |
| `scripts/bootstrap_runpod.sh` | Installs runtime packages; verifies GPU + all 38,140 image paths; downloads pinned DINOv2 |
| `scripts/smoke_train.sh` | Two-batch wiring test before paid training |
| `scripts/run_full_training.sh` | Trains, evaluates, and writes ONNX in one command |
| `scripts/train_metric.py` | The actual resumable PyTorch metric-learning trainer |
| `scripts/evaluate_metric.py` | Clearly limited held-out pretraining diagnostics |
| `scripts/export_onnx.py` | Exports the candidate-ranking encoder only |

## Non-negotiable release boundary

This is auxiliary visual training data.  Production acceptance still requires
human-reviewed, project-held-out legend-to-plan pairs from real OpenTakeoff
drawings, and the final application must require a visible citation and
human decision.  The metric model may rank candidates; it may not invent a
symbol, tag, quantity, or schedule-to-plan reconciliation.
