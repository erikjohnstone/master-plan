#!/usr/bin/env bash
# The one production training command on RunPod. Validates the dataset,
# trains three seeds for every configured contender (DINOv2 x {Proxy
# Anchor, Multi-Similarity, SupCon} + ConvNeXt-Tiny x Proxy Anchor),
# evaluates, calibrates each on dev, exports ONNX for every seed, verifies
# PyTorch/ONNX parity, then applies the eligibility gates once and writes a
# truthful release decision -- "no eligible winner" is a valid, correct
# output, not a failure of this script.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CONFIGS=(
  "configs/dinov2_vits14_proxyanchor.yaml"
  "configs/dinov2_vits14_multisimilarity.yaml"
  "configs/dinov2_vits14_supcon.yaml"
  "configs/convnext_tiny_proxyanchor.yaml"
)
SEEDS=(17 42 1337)

echo "== validate dataset =="
python3 src/validate_dataset.py

mkdir -p runs artifacts/release-candidate

for cfg in "${CONFIGS[@]}"; do
  stem="$(basename "$cfg" .yaml)"
  for seed in "${SEEDS[@]}"; do
    out_dir="runs/${stem}_seed${seed}"
    echo "== train ${stem} seed ${seed} -> ${out_dir} =="
    python3 src/train.py --config "$cfg" --seed "$seed" \
      --export-dir data/export --out-dir "$out_dir"

    echo "== evaluate ${stem} seed ${seed} on test (single touch) =="
    python3 src/evaluate.py --checkpoint "${out_dir}/best.ckpt" \
      --export-dir data/export --split test --out "${out_dir}/test_metrics.json"

    echo "== calibrate ${stem} seed ${seed} on dev =="
    python3 src/calibrate.py --checkpoint "${out_dir}/best.ckpt" \
      --export-dir data/export --out "${out_dir}/calibration.json"

    echo "== export ONNX + verify parity: ${stem} seed ${seed} =="
    python3 src/export_onnx.py --checkpoint "${out_dir}/best.ckpt" --out "${out_dir}/model.onnx"
    python3 src/verify_onnx_parity.py --checkpoint "${out_dir}/best.ckpt" \
      --onnx "${out_dir}/model.onnx" --out "${out_dir}/onnx_parity.json"
  done
done

echo "== select winner across all contenders/seeds (eligibility gates) =="
python3 src/select_winner.py --runs-dir runs --out artifacts/release-candidate/evaluation.json

WINNER=$(python3 -c "import json; print(json.load(open('artifacts/release-candidate/evaluation.json'))['decision'].get('winner') or '')")

if [[ -n "$WINNER" ]]; then
  echo "== eligible winner: ${WINNER} -- assembling release bundle =="
  # copy the winning contender's best (highest scoring) seed's artifacts
  best_seed_dir=$(python3 - "$WINNER" <<'PY'
import json, sys
name = sys.argv[1]
d = json.load(open('artifacts/release-candidate/evaluation.json'))
for c in d['contenders']:
    if c['contender'] == name:
        print(c['seed_results'][0]['seed_dir'])
        break
PY
)
  cp "${best_seed_dir}/model.onnx" artifacts/release-candidate/model.onnx
  cp "${best_seed_dir}/best.ckpt" artifacts/release-candidate/best.ckpt
  cp "${best_seed_dir}/calibration.json" artifacts/release-candidate/calibration.json
  cp "${best_seed_dir}/../../runs/${WINNER}"*/preprocessing.json artifacts/release-candidate/preprocessing.json 2>/dev/null || true
else
  echo "== no eligible winner -- release bundle carries evaluation.json only, per the goal doc's"
  echo "   explicit requirement that this is a valid, honest outcome, not a script failure =="
fi

python3 - <<'PY'
import hashlib, json
from pathlib import Path
rc = Path("artifacts/release-candidate")
lines = []
for p in sorted(rc.rglob("*")):
    if p.is_file() and p.name != "checksums.txt":
        h = hashlib.sha256(p.read_bytes()).hexdigest()
        lines.append(f"{h}  {p.relative_to(rc)}")
(rc / "checksums.txt").write_text("\n".join(lines) + "\n")
PY

echo "DONE. See artifacts/release-candidate/"
