# Unattended controlled model bakeoffs

`scripts/run_controlled_bakeoff.py` allows a RunPod to execute a declared,
finite model experiment matrix after the supervising agent is gone. It is not a
random parameter sweep and it cannot silently promote a model into OpenTakeoff.

**Shared-path decision: no.** The runner is isolated experiment orchestration.
It never imports or changes the shared schedule/table/citation/quantity path.

## Required matrix discipline

Every experiment has exactly one stated causal hypothesis. Keep the following
constant within a bakeoff family:

- the real project-held-out cases and their source hashes;
- PDF rendering DPI, tile size/overlap and duplicate merge evaluation;
- taxonomy, score threshold, and false-accept definition; and
- the baseline checkpoint and evaluation report.

Legitimate DINO hypotheses include whether a real-only checkpoint benefits
from synthetic initialization, from bounded anisotropic stretch, or from weak
class-level warm-up. Legitimate detector hypotheses include training on the
same tiled crop distribution used at inference, rotation treatment, and class
balancing. Do not mix several changes into one result.

## Configuration

The runner accepts JSON rather than executable code. Its control evaluation and
every experiment evaluation must use the same project-grounding evaluator.

```json
{
  "schema": "opentakeoff.controlled_metric_bakeoff.v1",
  "control": {
    "id": "real-only-rtdetr-v1",
    "evaluation_json": "control/project_grounding_eval.json"
  },
  "comparison_gates": [
    {"metric": "metrics.detector_recall_at_strict_iou", "direction": "higher", "minimum_delta": 0},
    {"metric": "metrics.dino_top1_among_detector_candidates", "direction": "higher", "minimum_delta": 0},
    {"metric": "metrics.selected_precision", "direction": "higher", "minimum_delta": 0},
    {"metric": "metrics.false_accepts", "direction": "lower", "minimum_delta": 0},
    {"metric": "metrics.latency_ms_p95", "direction": "lower", "minimum_delta": 0}
  ],
  "experiments": [{
    "id": "synthetic-init-then-real-v1",
    "hypothesis": "Synthetic initialization improves real held-out grounding without adding false accepts.",
    "command": ["bash", "{config_dir}/run_synthetic_init_then_real.sh"],
    "evaluation_json": "synthetic-init-then-real-v1/project_grounding_eval.json"
  }]
}
```

Run it unattended on the pod:

```sh
nohup python3 scripts/run_controlled_bakeoff.py \
  --config /workspace/bakeoff/matrix.json \
  --output /workspace/bakeoff/report.json \
  --resume > /workspace/bakeoff/runner.log 2>&1 &
```

The report records commands, stdout/stderr tails, evaluation JSON, metric
deltas, and a decision. If the benchmark says
`production_evidence_eligible: false`, the only possible favorable outcome is
`diagnostic_only_not_promotable`; a result cannot escape into the application.

## Current honest limit

The initial 14 real tag-to-body cases are useful to catch catastrophic
regressions but do not meet the 200-case / 10-project project-grounding
coverage floor. Until that reviewer-owned benchmark exists, unattended runs
may compare pretraining diagnostics but cannot establish a production model.
