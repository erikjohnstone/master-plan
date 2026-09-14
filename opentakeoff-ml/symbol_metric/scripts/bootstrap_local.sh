#!/usr/bin/env bash
# Verify the unpacked bundle before doing anything else on a fresh Pod.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== checksums =="
if [[ -f checksums.txt ]]; then
  sha256sum -c checksums.txt
else
  echo "no checksums.txt at bundle root (ok for a fresh local checkout, required for a RunPod bundle)"
fi

echo "== python/cuda =="
python3 --version
python3 -c "import torch; print('torch', torch.__version__, 'cuda available:', torch.cuda.is_available()); \
  print('device:', torch.cuda.get_device_name(0)) if torch.cuda.is_available() else None"

echo "== dataset presence =="
for split in train dev test; do
  m="data/export/$split/manifest.jsonl"
  if [[ -f "$m" ]]; then
    echo "$split: $(wc -l < "$m") records"
  else
    echo "$split: MISSING ($m)"
  fi
done

echo "bootstrap_local.sh OK"
