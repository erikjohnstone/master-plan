#!/usr/bin/env bash
# Prepare a RunPod *official PyTorch GPU template* for this package.
# Torch itself is intentionally supplied by the template so its CUDA binary
# matches the GPU driver on the Pod.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/bootstrap_runpod.sh \
    --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 \
    --source-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW \
    --hub-cache /workspace/dino-hub-cache
EOF
}

DATASET=""
SOURCE_ROOT=""
HUB_CACHE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dataset) DATASET="$2"; shift 2 ;;
    --source-root) SOURCE_ROOT="$2"; shift 2 ;;
    --hub-cache) HUB_CACHE="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done
if [[ -z "$DATASET" || -z "$SOURCE_ROOT" || -z "$HUB_CACHE" ]]; then
  usage >&2
  exit 2
fi

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# RunPod's current PyTorch images expose their CUDA-enabled environment as
# `python`; `/usr/bin/python3` is a separately managed system interpreter.
# Build an isolated venv that retains that template's torch/CUDA packages,
# rather than weakening its PEP 668 system-package protection.
BASE_PYTHON="${PYTHON_BIN:-python}"
VENV_DIR="${VENV_DIR:-$PACKAGE_ROOT/.venv-runpod}"
if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  "$BASE_PYTHON" -m venv --system-site-packages "$VENV_DIR"
fi
PYTHON_BIN="$VENV_DIR/bin/python"
"$PYTHON_BIN" -m pip install --upgrade pip
"$PYTHON_BIN" -m pip install --requirement "$PACKAGE_ROOT/requirements-runpod.txt"
"$PYTHON_BIN" "$PACKAGE_ROOT/scripts/check_runpod_environment.py" --dataset "$DATASET" --source-root "$SOURCE_ROOT"
"$PYTHON_BIN" "$PACKAGE_ROOT/scripts/download_backbone.py" --cache-dir "$HUB_CACHE"
echo "RunPod environment is ready. The receipt is in $HUB_CACHE/opentakeoff_dinov2_vits14_receipt.json"
