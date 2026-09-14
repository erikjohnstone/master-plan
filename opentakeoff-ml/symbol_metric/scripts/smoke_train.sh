#!/usr/bin/env bash
# Fast on-GPU check. It proves wiring, not model quality.
set -euo pipefail

if [[ $# -ne 4 ]]; then
  echo "Usage: bash scripts/smoke_train.sh DATASET SOURCE_ROOT HUB_CACHE OUTPUT_DIR" >&2
  exit 2
fi
PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -x "$PACKAGE_ROOT/.venv-runpod/bin/python" ]]; then
  PYTHON_BIN="${PYTHON_BIN:-$PACKAGE_ROOT/.venv-runpod/bin/python}"
else
  PYTHON_BIN="${PYTHON_BIN:-python}"
fi
"$PYTHON_BIN" "$PACKAGE_ROOT/scripts/train_metric.py" \
  --dataset "$1" --source-root "$2" --hub-cache "$3" --output "$4" \
  --epochs 1 --batch-size 4 --num-workers 0 --max-train-batches 2 --max-validation-batches 2
test -f "$4/last.pt"
echo "Smoke training passed. Delete this smoke folder only after you have inspected it; it is not a trained model."
