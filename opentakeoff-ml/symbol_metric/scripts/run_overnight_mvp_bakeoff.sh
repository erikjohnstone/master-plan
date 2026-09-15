#!/usr/bin/env bash
# Run a finite successive-halving HVAC/BAS symbol-model bakeoff on one GPU pod.
#
# Shared-path decision: NO. This is offline training orchestration. It neither
# imports production code nor changes schedule truth, quantities, citations,
# bbox contracts, VectorGrid, UI, MCP, or model deployment.

set -u -o pipefail

WAIT_PID="${1:-}"
WORKTREE="${WORKTREE:-/workspace/training/symbol-metric-bakeoff}"
DINO_PYTHON="${DINO_PYTHON:-/workspace/training/master-plan/opentakeoff-ml/symbol_metric/.venv-runpod/bin/python}"
RTDETR_PYTHON="${RTDETR_PYTHON:-/workspace/training/rtdetr-finetune/venv/bin/python}"
DATA_ROOT="${DATA_ROOT:-/workspace/training/HVAC_BAS_RTDETR}"
SOURCE_ROOT="${SOURCE_ROOT:-/workspace/training/HVAC_BAS_RTDETR/TRAIN_NOW}"
DINO_HUB_CACHE="${DINO_HUB_CACHE:-/workspace/training/dino-hub-cache}"
DINO_RUN_ROOT="${DINO_RUN_ROOT:-/workspace/training/opentakeoff-symbol-metric-runs}"
RTDETR_ROOT="${RTDETR_ROOT:-/workspace/training/rtdetr-finetune}"
REPORT_ROOT="${REPORT_ROOT:-/workspace/training/overnight-successive-halving-20260915}"

TRAIN_DINO="$WORKTREE/opentakeoff-ml/symbol_metric/scripts/train_metric.py"
EVAL_DINO="$WORKTREE/opentakeoff-ml/symbol_metric/scripts/evaluate_metric.py"
SELECT="$WORKTREE/opentakeoff-ml/symbol_metric/scripts/select_bakeoff_candidates.py"
RANK="$WORKTREE/opentakeoff-ml/symbol_metric/scripts/rank_model_diagnostics.py"
PREPARE_RTDETR="$WORKTREE/opentakeoff-ml/symbol_metric/scripts/prepare_rtdetr_validation_runner.py"
TRAIN_RTDETR="$RTDETR_ROOT/train_rtdetr_pack.py"
RTDETR_SCREEN="$REPORT_ROOT/runtime/rtdetr_validation_only.py"

mkdir -p "$REPORT_ROOT/dino/screen" "$REPORT_ROOT/dino/final" "$REPORT_ROOT/rtdetr/screen" "$REPORT_ROOT/rtdetr/final" "$REPORT_ROOT/runtime"
LOG="$REPORT_ROOT/supervisor.log"
exec >>"$LOG" 2>&1

echo "[$(date --iso-8601=seconds)] successive-halving bakeoff started"
echo "Stage 1: 10 DINO + 8 RT-DETR validation-only screens. Stage 2: three finalists per model."
echo "Held-out tests run only once per Stage-2 finalist. No result can auto-release into OpenTakeoff."

if test -n "$WAIT_PID"; then
  echo "Waiting for the pre-existing training chain PID $WAIT_PID."
  while kill -0 "$WAIT_PID" 2>/dev/null; do sleep 60; done
fi

if ! test -f "$DINO_RUN_ROOT/real-after-synthetic-v2/TRAINING_COMPLETE.txt"; then
  echo "Required synthetic-init -> real training did not complete. Refusing to contend with it."
  exit 2
fi
if ! test -f "$DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt"; then
  echo "Synthetic initialization checkpoint missing. Refusing the DINO matrix."
  exit 2
fi

dino_options() {
  case "$1" in
    warm-extended-proxy015) echo "--augmentation-profile extended --use-weak-proxy-labels --proxy-weight 0.15 --temperature 0.10 --freeze-backbone-epochs 1 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    warm-extended-no-weak) echo "--augmentation-profile extended --temperature 0.10 --freeze-backbone-epochs 1 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    warm-conservative-proxy015) echo "--augmentation-profile conservative --use-weak-proxy-labels --proxy-weight 0.15 --temperature 0.10 --freeze-backbone-epochs 1 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    warm-extended-proxy005) echo "--augmentation-profile extended --use-weak-proxy-labels --proxy-weight 0.05 --temperature 0.10 --freeze-backbone-epochs 1 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    warm-extended-proxy030) echo "--augmentation-profile extended --use-weak-proxy-labels --proxy-weight 0.30 --temperature 0.10 --freeze-backbone-epochs 1 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    warm-extended-temp007) echo "--augmentation-profile extended --use-weak-proxy-labels --proxy-weight 0.15 --temperature 0.07 --freeze-backbone-epochs 1 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    warm-extended-freeze3) echo "--augmentation-profile extended --use-weak-proxy-labels --proxy-weight 0.15 --temperature 0.10 --freeze-backbone-epochs 3 --init-network $DINO_RUN_ROOT/synthetic-pid-research-v2/best.pt" ;;
    real-extended-proxy015) echo "--augmentation-profile extended --use-weak-proxy-labels --proxy-weight 0.15 --temperature 0.10 --freeze-backbone-epochs 1" ;;
    real-conservative-proxy015) echo "--augmentation-profile conservative --use-weak-proxy-labels --proxy-weight 0.15 --temperature 0.10 --freeze-backbone-epochs 1" ;;
    real-extended-no-weak) echo "--augmentation-profile extended --temperature 0.10 --freeze-backbone-epochs 1" ;;
    *) echo "unknown DINO treatment: $1" >&2; return 2 ;;
  esac
}

run_dino_screen() {
  local identifier="$1" output="$DINO_RUN_ROOT/overnight-stage1/$1"
  test -f "$output/TRAINING_COMPLETE.txt" && { echo "DINO screen $identifier already exists."; return 0; }
  echo "[$(date --iso-8601=seconds)] DINO screen $identifier"
  read -r -a options <<< "$(dino_options "$identifier")"
  "$DINO_PYTHON" "$TRAIN_DINO" --dataset "$DATA_ROOT/DINOv2_METRIC_V1" --source-root "$SOURCE_ROOT" --output "$output" --hub-cache "$DINO_HUB_CACHE" --epochs 6 --batch-size 32 --num-workers 4 --lr-head 0.0003 --lr-backbone 0.00001 --weight-decay 0.0001 --seed 20260916 --save-every 1 "${options[@]}"
}

run_dino_final() {
  local identifier="$1" output="$DINO_RUN_ROOT/overnight-stage2/$1" evaluation="$REPORT_ROOT/dino/final/$1.test.json"
  if ! test -f "$output/TRAINING_COMPLETE.txt"; then
    echo "[$(date --iso-8601=seconds)] DINO finalist $identifier"
    read -r -a options <<< "$(dino_options "$identifier")"
    "$DINO_PYTHON" "$TRAIN_DINO" --dataset "$DATA_ROOT/DINOv2_METRIC_V1" --source-root "$SOURCE_ROOT" --output "$output" --hub-cache "$DINO_HUB_CACHE" --epochs 20 --batch-size 32 --num-workers 4 --lr-head 0.0003 --lr-backbone 0.00001 --weight-decay 0.0001 --seed 20260916 --save-every 1 "${options[@]}"
  fi
  if ! test -f "$evaluation"; then
    "$DINO_PYTHON" "$EVAL_DINO" --dataset "$DATA_ROOT/DINOv2_METRIC_V1" --source-root "$SOURCE_ROOT" --checkpoint "$output/best.pt" --hub-cache "$DINO_HUB_CACHE" --output "$evaluation" --split test
  fi
}

dino_ids=(warm-extended-proxy015 warm-extended-no-weak warm-conservative-proxy015 warm-extended-proxy005 warm-extended-proxy030 warm-extended-temp007 warm-extended-freeze3 real-extended-proxy015 real-conservative-proxy015 real-extended-no-weak)
for identifier in "${dino_ids[@]}"; do run_dino_screen "$identifier" || echo "DINO screen $identifier failed; leave it out of the shortlist."; done
dino_selector=(--kind dino --top-k 3 --output "$REPORT_ROOT/dino/stage1-shortlist.json")
for identifier in "${dino_ids[@]}"; do test -f "$DINO_RUN_ROOT/overnight-stage1/$identifier/metrics.jsonl" && dino_selector+=(--candidate "$identifier=$DINO_RUN_ROOT/overnight-stage1/$identifier/metrics.jsonl"); done
"$DINO_PYTHON" "$SELECT" "${dino_selector[@]}"
while IFS= read -r identifier; do run_dino_final "$identifier" || echo "DINO finalist $identifier failed."; done < <("$DINO_PYTHON" -c 'import json,sys; print("\\n".join(json.load(open(sys.argv[1]))["selected_ids"]))' "$REPORT_ROOT/dino/stage1-shortlist.json")

if test -f "$DINO_RUN_ROOT/v1/best.pt" && ! test -f "$REPORT_ROOT/dino/real-only-v1-control.test.json"; then
  "$DINO_PYTHON" "$EVAL_DINO" --dataset "$DATA_ROOT/DINOv2_METRIC_V1" --source-root "$SOURCE_ROOT" --checkpoint "$DINO_RUN_ROOT/v1/best.pt" --hub-cache "$DINO_HUB_CACHE" --output "$REPORT_ROOT/dino/real-only-v1-control.test.json" --split test
fi
dino_rank=(--kind dino --baseline "$REPORT_ROOT/dino/real-only-v1-control.test.json" --output "$REPORT_ROOT/dino/final-ranking.json")
for identifier in "${dino_ids[@]}"; do test -f "$REPORT_ROOT/dino/final/$identifier.test.json" && dino_rank+=(--candidate "$identifier=$REPORT_ROOT/dino/final/$identifier.test.json"); done
test -f "$REPORT_ROOT/dino/real-only-v1-control.test.json" && "$DINO_PYTHON" "$RANK" "${dino_rank[@]}"

"$DINO_PYTHON" "$PREPARE_RTDETR" --source "$TRAIN_RTDETR" --output "$RTDETR_SCREEN"

rtdetr_options() {
  case "$1" in
    control-seed16|control-seed17|control-seed18) echo "--epochs 6 --head-lr 0.0002 --backbone-lr 0.00002 --weight-decay 0.0001" ;;
    weight-low) echo "--epochs 6 --head-lr 0.0002 --backbone-lr 0.00002 --weight-decay 0.00005" ;;
    weight-high) echo "--epochs 6 --head-lr 0.0002 --backbone-lr 0.00002 --weight-decay 0.0002" ;;
    head-low) echo "--epochs 6 --head-lr 0.0001 --backbone-lr 0.00001 --weight-decay 0.0001" ;;
    head-high) echo "--epochs 6 --head-lr 0.0003 --backbone-lr 0.00003 --weight-decay 0.0001" ;;
    epoch-eight) echo "--epochs 8 --head-lr 0.0002 --backbone-lr 0.00002 --weight-decay 0.0001" ;;
    *) echo "unknown RT-DETR treatment: $1" >&2; return 2 ;;
  esac
}

rtdetr_seed() { case "$1" in control-seed16) echo 20260916 ;; control-seed17) echo 20260917 ;; control-seed18) echo 20260918 ;; *) echo 20260916 ;; esac; }
rtdetr_final_options() { rtdetr_options "$1" | sed 's/--epochs [0-9][0-9]*/--epochs 20/'; }
run_rtdetr_screen() {
  local identifier="$1" output="$RTDETR_ROOT/runs/overnight-stage1-$1"
  test -f "$output/validation_only.json" && { echo "RT-DETR screen $identifier already exists."; return 0; }
  echo "[$(date --iso-8601=seconds)] RT-DETR screen $identifier"
  read -r -a options <<< "$(rtdetr_options "$identifier")"
  "$RTDETR_PYTHON" "$RTDETR_SCREEN" --data-root "$DATA_ROOT" --pack 07_pid_valves_and_heat_exchangers --output "$output" --batch-size 8 --workers 4 --seed "$(rtdetr_seed "$identifier")" --skip-held-out-test "${options[@]}"
}
run_rtdetr_final() {
  local identifier="$1" output="$RTDETR_ROOT/runs/overnight-stage2-$1"
  test -f "$output/held_out_test.json" && { echo "RT-DETR finalist $identifier already evaluated."; return 0; }
  echo "[$(date --iso-8601=seconds)] RT-DETR finalist $identifier"
  read -r -a options <<< "$(rtdetr_final_options "$identifier")"
  "$RTDETR_PYTHON" "$TRAIN_RTDETR" --data-root "$DATA_ROOT" --pack 07_pid_valves_and_heat_exchangers --output "$output" --batch-size 8 --workers 4 --seed "$(rtdetr_seed "$identifier")" "${options[@]}"
}

rtdetr_ids=(control-seed16 control-seed17 control-seed18 weight-low weight-high head-low head-high epoch-eight)
for identifier in "${rtdetr_ids[@]}"; do run_rtdetr_screen "$identifier" || echo "RT-DETR screen $identifier failed; leave it out of the shortlist."; done
rtdetr_selector=(--kind rtdetr --top-k 3 --output "$REPORT_ROOT/rtdetr/stage1-shortlist.json")
for identifier in "${rtdetr_ids[@]}"; do test -f "$RTDETR_ROOT/runs/overnight-stage1-$identifier/best-val/best_validation.json" && rtdetr_selector+=(--candidate "$identifier=$RTDETR_ROOT/runs/overnight-stage1-$identifier/best-val/best_validation.json"); done
"$DINO_PYTHON" "$SELECT" "${rtdetr_selector[@]}"
while IFS= read -r identifier; do run_rtdetr_final "$identifier" || echo "RT-DETR finalist $identifier failed."; done < <("$DINO_PYTHON" -c 'import json,sys; print("\\n".join(json.load(open(sys.argv[1]))["selected_ids"]))' "$REPORT_ROOT/rtdetr/stage1-shortlist.json")

RT_BASELINE="$RTDETR_ROOT/runs/valve-control-rtdetr-r50vd-v3/held_out_test.json"
rtdetr_rank=(--kind rtdetr --baseline "$RT_BASELINE" --output "$REPORT_ROOT/rtdetr/final-ranking.json")
for identifier in "${rtdetr_ids[@]}"; do test -f "$RTDETR_ROOT/runs/overnight-stage2-$identifier/held_out_test.json" && rtdetr_rank+=(--candidate "$identifier=$RTDETR_ROOT/runs/overnight-stage2-$identifier/held_out_test.json"); done
test -f "$RT_BASELINE" && "$DINO_PYTHON" "$RANK" "${rtdetr_rank[@]}"

echo "[$(date --iso-8601=seconds)] bakeoff complete"
echo "Read $REPORT_ROOT/dino/final-ranking.json and $REPORT_ROOT/rtdetr/final-ranking.json. Both are diagnostic-only and must clear the reviewed project-grounding gate before product integration."
