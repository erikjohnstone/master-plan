#!/usr/bin/env bash
# One-command, resumable DINOv2 symbol-metric training after bootstrap succeeds.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/run_full_training.sh \
    --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 \
    --source-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW \
    --hub-cache /workspace/dino-hub-cache \
    --run-dir /workspace/opentakeoff-symbol-metric-runs/v1

Optional: set EPOCHS=20, BATCH_SIZE=32, WORKERS=4 before this command.
Optional: add --resume /workspace/opentakeoff-symbol-metric-runs/v1/last.pt
EOF
}

DATASET=""
SOURCE_ROOT=""
HUB_CACHE=""
RUN_DIR=""
RESUME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dataset) DATASET="$2"; shift 2 ;;
    --source-root) SOURCE_ROOT="$2"; shift 2 ;;
    --hub-cache) HUB_CACHE="$2"; shift 2 ;;
    --run-dir) RUN_DIR="$2"; shift 2 ;;
    --resume) RESUME="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ -z "$DATASET" || -z "$SOURCE_ROOT" || -z "$HUB_CACHE" || -z "$RUN_DIR" ]]; then
  usage >&2
  exit 2
fi

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-python}"
EPOCHS="${EPOCHS:-20}"
BATCH_SIZE="${BATCH_SIZE:-32}"
WORKERS="${WORKERS:-4}"
mkdir -p "$RUN_DIR"

# Exact same-instance pairs are always present. The extra proxy term is an
# explicit weak-label warm-up; training output labels it as such and its metric
# must never be presented as plan-grounding or takeoff accuracy.
TRAIN_COMMAND=("$PYTHON_BIN" "$PACKAGE_ROOT/scripts/train_metric.py"
  --dataset "$DATASET"
  --source-root "$SOURCE_ROOT"
  --hub-cache "$HUB_CACHE"
  --output "$RUN_DIR"
  --epochs "$EPOCHS"
  --batch-size "$BATCH_SIZE"
  --num-workers "$WORKERS"
  --augmentation-profile extended
  --use-weak-proxy-labels)
if [[ -n "$RESUME" ]]; then
  TRAIN_COMMAND+=(--resume "$RESUME")
fi
"${TRAIN_COMMAND[@]}"

"$PYTHON_BIN" "$PACKAGE_ROOT/scripts/evaluate_metric.py" \
  --dataset "$DATASET" \
  --source-root "$SOURCE_ROOT" \
  --hub-cache "$HUB_CACHE" \
  --checkpoint "$RUN_DIR/best.pt" \
  --output "$RUN_DIR/evaluation_test.json" \
  --split test \
  --batch-size "$BATCH_SIZE" \
  --num-workers "$WORKERS"

"$PYTHON_BIN" "$PACKAGE_ROOT/scripts/export_onnx.py" \
  --checkpoint "$RUN_DIR/best.pt" \
  --hub-cache "$HUB_CACHE" \
  --output "$RUN_DIR/dinov2_vits14_symbol_metric_v1.onnx"

echo "Finished. Download $RUN_DIR/best.pt, $RUN_DIR/evaluation_test.json, and $RUN_DIR/dinov2_vits14_symbol_metric_v1.onnx."
