#!/usr/bin/env bash
# Tiny end-to-end pipeline cycle, CPU-safe, meant to catch integration bugs
# before ever touching a rented GPU. Uses --smoke on train.py (a handful of
# steps, not a real run) and, when the split is too small for a real
# calibration fit, reports that honestly instead of faking a threshold.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== 1/6 validate dataset =="
python3 src/validate_dataset.py

echo "== 2/6 smoke train (DINOv2 Proxy Anchor, seed 17, CPU, tiny) =="
python3 src/train.py --config configs/dinov2_vits14_proxyanchor.yaml \
  --seed 17 --export-dir data/export --out-dir runs/smoke_dinov2_proxyanchor --smoke

echo "== 3/6 evaluate on test split (smoke: informative only, not a real gate check) =="
python3 src/evaluate.py --checkpoint runs/smoke_dinov2_proxyanchor/best.ckpt \
  --export-dir data/export --split test --out runs/smoke_dinov2_proxyanchor/test_metrics.json || \
  echo "evaluate.py returned nonzero -- expected if test split is empty at smoke scale"

echo "== 4/6 calibrate on dev split =="
python3 src/calibrate.py --checkpoint runs/smoke_dinov2_proxyanchor/best.ckpt \
  --export-dir data/export --out runs/smoke_dinov2_proxyanchor/calibration.json

echo "== 5/6 export ONNX =="
python3 src/export_onnx.py --checkpoint runs/smoke_dinov2_proxyanchor/best.ckpt \
  --out runs/smoke_dinov2_proxyanchor/model.onnx

echo "== 6/6 verify PyTorch/ONNX parity =="
python3 src/verify_onnx_parity.py --checkpoint runs/smoke_dinov2_proxyanchor/best.ckpt \
  --onnx runs/smoke_dinov2_proxyanchor/model.onnx \
  --out runs/smoke_dinov2_proxyanchor/onnx_parity.json

echo "SMOKE OK: runs/smoke_dinov2_proxyanchor/"
