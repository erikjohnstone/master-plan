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

## Overnight MVP candidate queue

`scripts/run_overnight_mvp_bakeoff.sh` is a finite, predeclared **successive-
halving** RunPod queue. It waits for the in-progress DINO synthetic-init
experiment, then runs ten DINO and eight RT-DETR treatments through a short,
validation-only screen. It retains six candidates per family for an
intermediate validation-only retrain, then retains three finalists per family
for full training and one evaluation on each untouched test split. It never
changes the dataset, class taxonomy, score threshold, or product.

The broad screen deliberately cannot open test annotations or images. For
RT-DETR the queue creates a checksum-recorded, validation-only copy of the
existing validated harness; the original harness stays untouched and is used
only for each finalist's one full test evaluation. DINO selection uses its
declared validation loss with same-crop recall solely as a tie-breaker. These
are useful scheduling signals, not proof of plan grounding.

The declared DINO screen varies only synthetic warm start, conservative versus
extended bounded augmentation, auxiliary weak-proxy weight, temperature, and
brief backbone freeze; real-only controls are included. The detector screen
uses three fixed-control seeds plus one-at-a-time learning-rate, weight-decay,
and short-duration variations. It never enables horizontal flips because that
would invent directional HVAC/BAS symbol semantics. Failed or incomplete runs
are not selected on resume.

On one GPU, start it once in a detached process, passing the PID of the
already-running DINO supervisor so it cannot contend for the same GPU:

```sh
nohup /workspace/training/symbol-metric-bakeoff/opentakeoff-ml/symbol_metric/scripts/run_overnight_mvp_bakeoff.sh \
  7297 > /workspace/training/overnight-mvp-launch.log 2>&1 &
```

The ranking files intentionally say `diagnostic_best_not_promotable`. They
select the checkpoint to carry into the real grounding benchmark; they do not
authorize software integration or installed quantity decisions.

### Parallel-pod roles

When independent pods share the immutable data volume, the predeclared queue
can use three isolated roles without opening a held-out split early. Each role
must use the same `REPORT_ROOT`; each writes its own role-named supervisor log.

1. `BAKEOFF_ROLE=dino-screen` runs only the ten validation-only DINO screens,
   writes the frozen stage-one shortlist, and exits.
2. `BAKEOFF_ROLE=dino-final` waits for that shortlist, then performs the six
   intermediate DINO runs, three full DINO finalists, and their one-time tests.
3. `BAKEOFF_ROLE=rtdetr` runs the detector's complete independent successive-
   halving queue. Its validation-only wrapper never opens the test split until
   each stage-three finalist.

This is parallel **experimentation**, not concurrent training on one GPU. Give
each process a distinct GPU pod and do not launch the legacy `sequential` role
at the same time, or the shared run directories would contend.
