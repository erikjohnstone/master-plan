# opentakeoff-ml/symbol_metric

An isolated dataset + training package for a project-local, one-shot
HVAC/BAS symbol retrieval metric model: given a legend/reference symbol crop
from one project's own drawing set, rank isolated physical-symbol candidates
from that same set by visual identity.

**This package does not touch, import, or depend on the shared production
path** (VectorGrid, table/schedule extraction, bbox/citation contracts,
Symbol Sweep, Legend Learn, Agent behavior, UI, or MCP). It is a standalone
training/evaluation artifact; integrating any resulting model into the
shared path is explicitly out of scope here (see
`opentakeoff/docs/SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md`).

Read `TASK_SPEC.md` first -- it documents exactly which goal document this
package executes, the branch/worktree decisions made and why, and how this
session's real available corpus differs from the goal document's expected
paths.

## Layout

```
schemas/            reviewed_pair.schema.json -- the training-record contract
configs/             one YAML per contender: DINOv2-S/14 x {Proxy Anchor,
                     Multi-Similarity, SupCon} + ConvNeXt-Tiny x Proxy Anchor
src/
  corpus_paths.py     resolves the real corpus root on this machine
  inventory.py        hashes/classifies every reachable source PDF
  freeze_split.py      hash-seals train/dev/test by source family, before labeling
  glyph_cluster.py     from-scratch vector-path connected-component clustering
  build_review_queue.py  deterministic legend-row + candidate-body proposals
  prioritize_queue.py    diversity-first selection of what actually gets reviewed
  render_crops.py        deterministic, versioned crop rendering
  export_dataset.py      reviewed records -> immutable crop shards + manifests
  validate_dataset.py    Stage 0 checks: leakage, tag-as-body, schema, directional-transform
  model.py                twin-encoder (DINOv2-S/14 or ConvNeXt-Tiny) + projection head
  losses.py                Proxy Anchor / Multi-Similarity / SupCon / triplet via pytorch-metric-learning
  dataset.py               balanced P x K identity sampler
  train.py                 two-phase training (frozen backbone -> last-4-blocks unfreeze)
  evaluate.py               retrieval recall@K, false-accept probe
  calibrate.py               dev-only logistic calibration + Wilson-bound threshold
  export_onnx.py             fixed 280x280x3 -> 256-d ONNX export
  verify_onnx_parity.py      PyTorch/ONNX embedding + ranking parity check
  select_winner.py            applies every eligibility gate, issues the release decision
scripts/
  bootstrap_local.sh     verify a freshly unpacked bundle
  run_smoke.sh            tiny CPU-safe end-to-end cycle
  run_full_pipeline.sh     the one RunPod training command
  package_for_runpod.sh    build the crop-only (no raw PDF) upload archive
  download_artifacts.md    how to retrieve the release bundle from a Pod
tests/                unit/integration tests
data/                 manifests, export (crops+records), reviewed records -- all gitignored except schemas/reports
reports/              CORPUS_INVENTORY.{json,md}, review queue summaries, evaluation reports
```

## Quickstart (local, CPU)

```bash
python3 src/inventory.py
python3 src/freeze_split.py
python3 src/build_review_queue.py            # geometry-only proposals, no review yet
python3 src/prioritize_queue.py              # pick the reviewable subset
# ... run the actual 3-pass agent review to produce data/reviewed/reviewed_records.jsonl ...
python3 src/export_dataset.py
./scripts/run_smoke.sh
```

## RunPod

```bash
./scripts/package_for_runpod.sh
# transfer dist/opentakeoff-symbol-metric-v1.tar.zst to the Pod (runpodctl send/receive)
# on the Pod: ./scripts/bootstrap_local.sh && ./scripts/run_full_pipeline.sh
```

See `scripts/download_artifacts.md` for retrieving the finished release
bundle, and `opentakeoff/docs/SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md` for
the full beginner-safe walkthrough (Pod sizing, pricing note, transfer
mechanics).
