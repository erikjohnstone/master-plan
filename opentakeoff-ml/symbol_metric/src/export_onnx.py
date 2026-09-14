#!/usr/bin/env python3
"""Export a frozen checkpoint to ONNX (fixed 280x280x3 input -> 256-d
L2-normalized embedding output). Fixed preprocessing lives in
preprocessing.json alongside the export, not baked as a UI-only constant.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model import ModelConfig, TwinEncoder  # noqa: E402
from render_crops import MODEL_INPUT_SIZE  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    model_cfg = ModelConfig(**ckpt["model_config"])
    model = TwinEncoder(model_cfg, pretrained=False)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    dummy = torch.randn(1, 3, model_cfg.input_size, model_cfg.input_size)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    torch.onnx.export(
        model, dummy, str(out_path),
        input_names=["pixel_values"], output_names=["embedding"],
        dynamic_axes={"pixel_values": {0: "batch"}, "embedding": {0: "batch"}},
        opset_version=17,
    )

    onnx_hash = hashlib.sha256(out_path.read_bytes()).hexdigest()
    preprocessing = {
        "input_size": model_cfg.input_size,
        "channels": 3,
        "grayscale_replicated": True,
        "aspect_preserving_pad": "white",
        "pixel_range": [0.0, 1.0],
        "normalize_mean": None,
        "normalize_std": None,
        "renderer_version": "opentakeoff.symbol_metric.render_crops.v1",
    }
    preprocessing_path = out_path.parent / "preprocessing.json"
    preprocessing_path.write_text(json.dumps(preprocessing, indent=2))

    meta = {
        "onnx_path": str(out_path),
        "onnx_sha256": onnx_hash,
        "model_config": model_cfg.__dict__,
        "source_checkpoint": args.checkpoint,
    }
    (out_path.parent / "export_meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
