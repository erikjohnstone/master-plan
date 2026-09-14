#!/usr/bin/env python3
"""Export only the embedding network to ONNX; never export a quantity decision."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

import torch

from training_runtime import INPUT_SIZE, TwinMetricNet, load_dinov2_backbone


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--hub-cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    saved = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    if saved.get("format") != "opentakeoff-symbol-metric-checkpoint-v1":
        raise ValueError("Checkpoint is not an OpenTakeoff symbol-metric v1 checkpoint")
    network = TwinMetricNet(load_dinov2_backbone(args.hub_cache)).cpu().eval()
    network.load_state_dict(saved["network"])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    example = torch.zeros(1, 3, INPUT_SIZE, INPUT_SIZE)
    # Legacy exporter is intentional: it keeps this portable across current
    # PyTorch RunPod templates and does not rely on a changing dynamo exporter.
    torch.onnx.export(
        network,
        example,
        args.output,
        input_names=["image"],
        output_names=["embedding"],
        dynamic_axes={"image": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )
    with torch.inference_mode():
        output = network(example)
    receipt = {
        "format": "opentakeoff-symbol-metric-onnx-v1",
        "path": str(args.output),
        "input": ["batch", 3, INPUT_SIZE, INPUT_SIZE],
        "output": ["batch", int(output.shape[1])],
        "checkpoint": str(args.checkpoint),
        "warning": "This ONNX artifact ranks visual candidates only. It cannot establish a symbol, tag, quantity, or citation by itself.",
    }
    args.output.with_suffix(args.output.suffix + ".json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
