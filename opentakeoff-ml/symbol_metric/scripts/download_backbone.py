#!/usr/bin/env python3
"""Download and smoke-test the exact pinned DINOv2-S/14 backbone."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

import torch
from training_runtime import DINO_ENTRYPOINT, DINO_REPOSITORY, DINO_REVISION, INPUT_SIZE, load_dinov2_backbone


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, required=True)
    args = parser.parse_args()
    model = load_dinov2_backbone(args.cache_dir).eval()
    with torch.inference_mode():
        output = model(torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE))
    if isinstance(output, dict):
        output = output["x_norm_clstoken"]
    if isinstance(output, tuple):
        output = output[0]
    if tuple(output.shape) != (1, 384):
        raise RuntimeError(f"Unexpected DINOv2 feature shape: {tuple(output.shape)}")
    digest = hashlib.sha256()
    for tensor in model.state_dict().values():
        digest.update(tensor.detach().cpu().numpy().tobytes())
    receipt = {
        "repository": DINO_REPOSITORY,
        "revision": DINO_REVISION,
        "entrypoint": DINO_ENTRYPOINT,
        "feature_shape": list(output.shape),
        "parameter_sha256": digest.hexdigest(),
        "warning": "Downloaded pretrained backbone only; no OpenTakeoff claim is implied.",
    }
    args.cache_dir.mkdir(parents=True, exist_ok=True)
    (args.cache_dir / "opentakeoff_dinov2_vits14_receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
