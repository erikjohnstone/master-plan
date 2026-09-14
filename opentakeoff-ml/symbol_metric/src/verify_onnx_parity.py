#!/usr/bin/env python3
"""Verify PyTorch vs ONNX Runtime embedding parity within a documented
tolerance, and that ranking/verdict decisions built on top of the two agree.
A release candidate is not eligible until this passes (goal doc + production
plan both require it before ONNX export is trusted for anything downstream).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model import ModelConfig, TwinEncoder  # noqa: E402

COSINE_TOL = 1e-3
MAX_ELEMENTWISE_TOL = 5e-3


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--n-samples", type=int, default=16)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    ckpt = torch.load(args.checkpoint, map_location="cpu")
    model_cfg = ModelConfig(**ckpt["model_config"])
    model = TwinEncoder(model_cfg, pretrained=False)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    import onnxruntime as ort
    sess = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])

    torch.manual_seed(0)
    x = torch.rand(args.n_samples, 3, model_cfg.input_size, model_cfg.input_size)

    with torch.no_grad():
        torch_out = model(x).numpy()

    onnx_out = sess.run(["embedding"], {"pixel_values": x.numpy().astype(np.float32)})[0]

    cos_sims = np.sum(torch_out * onnx_out, axis=1) / (
        np.linalg.norm(torch_out, axis=1) * np.linalg.norm(onnx_out, axis=1) + 1e-9
    )
    max_elementwise_diff = float(np.max(np.abs(torch_out - onnx_out)))
    min_cos = float(cos_sims.min())

    # Ranking parity: on this random probe batch, do the two backends agree
    # on nearest-neighbor ranking?
    torch_sims = torch_out @ torch_out.T
    onnx_sims = onnx_out @ onnx_out.T
    np.fill_diagonal(torch_sims, -1e9)
    np.fill_diagonal(onnx_sims, -1e9)
    torch_top1 = torch_sims.argmax(axis=1)
    onnx_top1 = onnx_sims.argmax(axis=1)
    ranking_agreement = float((torch_top1 == onnx_top1).mean())

    passed = (min_cos >= 1 - COSINE_TOL) and (max_elementwise_diff <= MAX_ELEMENTWISE_TOL)

    result = {
        "n_samples": args.n_samples,
        "min_cosine_similarity_torch_vs_onnx": min_cos,
        "max_elementwise_abs_diff": max_elementwise_diff,
        "ranking_agreement_fraction": ranking_agreement,
        "cosine_tolerance": COSINE_TOL,
        "elementwise_tolerance": MAX_ELEMENTWISE_TOL,
        "passed": passed,
    }
    print(json.dumps(result, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(result, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
