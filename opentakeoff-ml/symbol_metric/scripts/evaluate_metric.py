#!/usr/bin/env python3
"""Evaluate a saved symbol-metric checkpoint without overstating what it proves."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

import torch
from torch.utils.data import DataLoader

from training_runtime import SymbolPairDataset, TwinMetricNet, load_dinov2_backbone


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--hub-cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--split", choices=("val", "test"), default="test")
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--num-workers", type=int, default=4)
    return parser.parse_args()


def recall_at_k(embeddings: torch.Tensor, labels: torch.Tensor, k: int) -> tuple[float | None, int]:
    scores = embeddings @ embeddings.t()
    scores.fill_diagonal_(float("-inf"))
    best = scores.topk(min(k, embeddings.size(0) - 1), dim=1).indices
    comparable = 0
    correct = 0
    for index in range(embeddings.size(0)):
        same_class = (labels == labels[index]).sum().item() - 1
        if same_class < 1:
            continue
        comparable += 1
        correct += int((labels[best[index]] == labels[index]).any().item())
    return ((correct / comparable) if comparable else None, comparable)


def main() -> int:
    args = parse_arguments()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for the standard evaluation path.")
    device = torch.device("cuda")
    saved = torch.load(args.checkpoint, map_location=device, weights_only=False)
    if saved.get("format") != "opentakeoff-symbol-metric-checkpoint-v1":
        raise ValueError("Checkpoint is not an OpenTakeoff symbol-metric v1 checkpoint")
    network = TwinMetricNet(load_dinov2_backbone(args.hub_cache)).to(device).eval()
    network.load_state_dict(saved["network"])
    data = SymbolPairDataset(args.dataset, args.source_root, args.split, "conservative", seed=20260914)
    loader = DataLoader(data, batch_size=args.batch_size, shuffle=False, num_workers=args.num_workers, pin_memory=True)
    embeddings: list[torch.Tensor] = []
    labels: list[torch.Tensor] = []
    similarities: list[torch.Tensor] = []
    started = time.perf_counter()
    with torch.inference_mode():
        for batch in loader:
            first = batch["view_a"].to(device, non_blocking=True)
            second = batch["view_b"].to(device, non_blocking=True)
            first_embedding = network(first)
            second_embedding = network(second)
            embeddings.append(first_embedding.cpu())
            labels.append(batch["proxy_label"].cpu())
            similarities.append((first_embedding * second_embedding).sum(dim=1).cpu())
    all_embeddings = torch.cat(embeddings)
    all_labels = torch.cat(labels)
    recall_1, comparable = recall_at_k(all_embeddings, all_labels, 1)
    recall_5, _ = recall_at_k(all_embeddings, all_labels, 5)
    result = {
        "format": "opentakeoff-symbol-metric-evaluation-v1",
        "checkpoint": str(args.checkpoint),
        "split": args.split,
        "records": int(all_embeddings.size(0)),
        "mean_two_view_cosine": float(torch.cat(similarities).mean().item()),
        "weak_source_label_recall_at_1": recall_1,
        "weak_source_label_recall_at_5": recall_5,
        "weak_label_comparable_queries": comparable,
        "elapsed_seconds": time.perf_counter() - started,
        "warning": "Weak source-label retrieval and two-view cosine are pretraining diagnostics, not project-held-out legend-to-plan or installed-quantity accuracy.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
