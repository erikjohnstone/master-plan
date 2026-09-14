# Model card: HVAC/BAS symbol-metric twin encoder

_Fill in every bracketed field from the actual run's `evaluation.json`,
`calibration.json`, and `preprocessing.json`. Never round a failing gate
into a pass._

## Model

- Backbone: `[dinov2_vits14 | convnext_tiny]` ([Apache-2.0], base weights
  per `LICENSE_PROVENANCE.md`)
- Projection: `[in_dim]` -> 256, L2-normalized
- Input: 280x280, aspect-preserving white pad, grayscale replicated to 3ch
- Similarity: cosine
- Loss: `[proxy_anchor | multi_similarity | supcon | triplet]`
- Seeds trained: `[list]`
- Selected seed for this release: `[seed]` (selection reason: `[best
  untouched-project test recall@10 / dev recall@5]`)

## Task

Project-local one-shot retrieval: given a legend/reference symbol crop, rank
isolated physical-symbol candidates from the *same drawing set*. Not a
whole-page detector, not a semantic equipment classifier, not an OCR engine,
and not authority to create installed quantity on its own.

## Training data

See `DATASET_CARD.md`. Evidence tier breakdown: `[existing_human_reviewed: N,
agent_consensus_reviewed: N]`.

## Metrics (test split, touched exactly once)

| Metric | Value |
|---|---|
| Candidate proposal recall@10 | `[value]` |
| Retrieval top-1 accuracy | `[value]` |
| Retrieval recall@3 / @5 / @10 | `[values]` |
| Automatic-accept precision (dev-calibrated threshold) | `[value]` |
| Precision lower 95% CI (Wilson) | `[value]` |
| False accepts on tag/text/carrier/blank/partial controls | `[value]` |
| p50 / p95 latency | `[values]` |
| Peak GPU/CPU memory, model size | `[values]` |
| Seed variance (min/mean/max across 3 seeds) | `[values]` |
| PyTorch/ONNX parity (min cosine sim, max elementwise diff) | `[values]` |

## Eligibility gate outcome

`[eligible | experimental-only | no-model-winner]` -- see
`select_winner.py` output (`evaluation.json`) for the exact reasons on every
contender/seed that did not pass.

## Deployment contract (if eligible)

Preprocessing and calibration live in `preprocessing.json` /
`calibration.json`, never as a UI-only constant. Integration into the
shared UI/MCP path is out of scope for this package -- see
`opentakeoff/docs/SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md`'s
`SymbolVerificationResult` contract for the intended shape.

## Provenance

- Git commit (this branch): `[sha]`
- Container digest: `[digest]`
- Dependency lock hash: `[sha256 of requirements.txt]`
- Dataset manifest hash: `[sha256]`
- Exact training command: `[command]`
- RunPod runtime / actual cost: `[value, from RunPod console records, not estimated]`
