#!/usr/bin/env python3
"""Train the pinned DINOv2-S/14 twin encoder on exact symbol-crop pairs.

This is deliberately an offline training tool.  Its validation numbers measure
augmentation consistency and (when selected) source-local weak-label retrieval;
they are not production plan-grounding accuracy.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

import numpy as np
import torch
from torch import Tensor
from torch.utils.data import DataLoader

from training_runtime import (
    ProxyAnchorLoss,
    SymbolPairDataset,
    TwinMetricNet,
    checkpoint_payload,
    load_dinov2_backbone,
    nt_xent_loss,
    set_backbone_trainability,
)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True, help="DINOv2_METRIC_V1 folder")
    parser.add_argument("--source-root", type=Path, required=True, help="RT-DETR TRAIN_NOW folder")
    parser.add_argument("--output", type=Path, required=True, help="Folder for checkpoints and metrics")
    parser.add_argument("--hub-cache", type=Path, required=True, help="Persistent torch hub cache folder")
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--num-workers", type=int, default=4)
    parser.add_argument("--lr-head", type=float, default=3e-4)
    parser.add_argument("--lr-backbone", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--temperature", type=float, default=0.10)
    parser.add_argument("--freeze-backbone-epochs", type=int, default=1)
    parser.add_argument("--augmentation-profile", choices=("none", "conservative", "extended"), default="extended")
    parser.add_argument("--use-weak-proxy-labels", action="store_true", help="Opt in to source-local weak labels as an auxiliary loss")
    parser.add_argument("--proxy-weight", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=20260914)
    parser.add_argument("--save-every", type=int, default=1)
    parser.add_argument("--max-train-batches", type=int, default=0, help="Nonzero only for a smoke run")
    parser.add_argument("--max-validation-batches", type=int, default=0, help="Nonzero only for a smoke run")
    parser.add_argument("--resume", type=Path, help="Checkpoint to resume")
    args = parser.parse_args()
    if args.epochs < 1 or args.batch_size < 2 or args.num_workers < 0:
        parser.error("epochs must be >= 1, batch-size >= 2, and num-workers >= 0")
    if not 0.0 <= args.proxy_weight <= 1.0:
        parser.error("proxy-weight must be between 0 and 1")
    return args


def seed_everything(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    # Reproducible enough for training diagnostics without forcing slow,
    # unsupported deterministic kernels on every RunPod GPU image.
    torch.backends.cudnn.benchmark = True


def data_loader(dataset: SymbolPairDataset, batch_size: int, workers: int, shuffle: bool) -> DataLoader:
    return DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=shuffle,
        num_workers=workers,
        pin_memory=True,
        drop_last=shuffle,
        persistent_workers=False,
    )


def batch_recall_at_one(first: Tensor, second: Tensor) -> float:
    """Same-crop retrieval inside one batch; a health metric, not test accuracy."""
    scores = first @ second.t()
    return float((scores.argmax(dim=1) == torch.arange(first.size(0), device=first.device)).float().mean().item())


def run_epoch(
    network: TwinMetricNet,
    loader: DataLoader,
    optimizer: torch.optim.Optimizer | None,
    proxy_loss: ProxyAnchorLoss | None,
    args: argparse.Namespace,
    device: torch.device,
    batch_limit: int,
) -> dict[str, float]:
    training = optimizer is not None
    network.train(training)
    if proxy_loss is not None:
        proxy_loss.train(training)
    totals = {"loss": 0.0, "pair_loss": 0.0, "proxy_loss": 0.0, "same_crop_recall_at_1": 0.0, "batches": 0.0}
    scaler = torch.cuda.amp.GradScaler(enabled=training)
    for batch_index, batch in enumerate(loader):
        if batch_limit and batch_index >= batch_limit:
            break
        first = batch["view_a"].to(device, non_blocking=True)
        second = batch["view_b"].to(device, non_blocking=True)
        labels = batch["proxy_label"].to(device, non_blocking=True)
        if training:
            optimizer.zero_grad(set_to_none=True)
        with torch.set_grad_enabled(training), torch.autocast(device_type="cuda", dtype=torch.float16, enabled=True):
            first_embedding = network(first)
            second_embedding = network(second)
            pair_loss = nt_xent_loss(first_embedding, second_embedding, args.temperature)
            weak_loss = torch.zeros((), device=device)
            if proxy_loss is not None:
                weak_loss = proxy_loss((first_embedding + second_embedding) / 2, labels)
            loss = pair_loss + args.proxy_weight * weak_loss
        if training:
            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(network.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
        totals["loss"] += float(loss.detach().item())
        totals["pair_loss"] += float(pair_loss.detach().item())
        totals["proxy_loss"] += float(weak_loss.detach().item())
        totals["same_crop_recall_at_1"] += batch_recall_at_one(first_embedding.detach(), second_embedding.detach())
        totals["batches"] += 1
    if not totals["batches"]:
        raise RuntimeError("No batches ran. Check batch size and source image paths.")
    return {key: value / totals["batches"] for key, value in totals.items() if key != "batches"} | {"batches": totals["batches"]}


def atomic_torch_save(payload: dict[str, Any], target: Path) -> None:
    temporary = target.with_suffix(target.suffix + ".tmp")
    torch.save(payload, temporary)
    temporary.replace(target)


def main() -> int:
    args = parse_arguments()
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required. Stop and choose a RunPod PyTorch GPU Pod instead of training on CPU.")
    seed_everything(args.seed)
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "run_config.json").write_text(
        json.dumps({**vars(args), "warning": "Auxiliary pretraining only; no production accuracy claim."}, default=str, indent=2) + "\n",
        encoding="utf-8",
    )
    train_data = SymbolPairDataset(args.dataset, args.source_root, "train", args.augmentation_profile, args.seed)
    # Validation uses the conservative profile even when train uses extended
    # stretch. It tests whether the learned embedding remains stable under
    # realistic export variation without silently scoring against clean copies.
    validation_data = SymbolPairDataset(args.dataset, args.source_root, "val", "conservative", args.seed + 7)
    device = torch.device("cuda")
    network = TwinMetricNet(load_dinov2_backbone(args.hub_cache)).to(device)
    proxy_loss = ProxyAnchorLoss(len(train_data.labels)).to(device) if args.use_weak_proxy_labels else None
    parameter_groups: list[dict[str, Any]] = [
        {"params": network.backbone.parameters(), "lr": args.lr_backbone},
        {"params": network.projection.parameters(), "lr": args.lr_head},
    ]
    if proxy_loss is not None:
        parameter_groups.append({"params": proxy_loss.parameters(), "lr": args.lr_head})
    optimizer = torch.optim.AdamW(parameter_groups, weight_decay=args.weight_decay)
    start_epoch = 0
    best_validation_loss = float("inf")
    if args.resume:
        saved = torch.load(args.resume, map_location=device, weights_only=False)
        if saved.get("format") != "opentakeoff-symbol-metric-checkpoint-v1":
            raise ValueError("Resume checkpoint is not an OpenTakeoff symbol-metric v1 checkpoint")
        network.load_state_dict(saved["network"])
        if bool(saved.get("proxy_loss")) != bool(proxy_loss):
            raise ValueError("Resume checkpoint weak-proxy setting differs from this command")
        if proxy_loss is not None:
            proxy_loss.load_state_dict(saved["proxy_loss"])
        if saved.get("proxy_label_map") != train_data.labels:
            raise ValueError("Resume checkpoint label map differs from this dataset")
        optimizer.load_state_dict(saved["optimizer"])
        start_epoch = int(saved["epoch"]) + 1
        best_validation_loss = float(saved.get("best_validation_loss", best_validation_loss))
    metrics_path = args.output / "metrics.jsonl"
    for epoch in range(start_epoch, args.epochs):
        train_data.set_epoch(epoch)
        validation_data.set_epoch(epoch)
        set_backbone_trainability(network, freeze=epoch < args.freeze_backbone_epochs)
        train_metrics = run_epoch(
            network,
            data_loader(train_data, args.batch_size, args.num_workers, shuffle=True),
            optimizer,
            proxy_loss,
            args,
            device,
            args.max_train_batches,
        )
        with torch.inference_mode():
            validation_metrics = run_epoch(
                network,
                data_loader(validation_data, args.batch_size, args.num_workers, shuffle=False),
                None,
                None,
                args,
                device,
                args.max_validation_batches,
            )
        record = {
            "epoch": epoch,
            "train": train_metrics,
            "validation": validation_metrics,
            "backbone_frozen": epoch < args.freeze_backbone_epochs,
            "weak_proxy_labels_enabled": bool(proxy_loss),
            "warning": "Validation is augmentation consistency, not plan-grounding accuracy.",
        }
        with metrics_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record, sort_keys=True) + "\n")
        payload = checkpoint_payload(
            network,
            optimizer,
            proxy_loss,
            epoch,
            vars(args),
            train_data.labels,
            best_validation_loss=min(best_validation_loss, validation_metrics["loss"]),
        )
        atomic_torch_save(payload, args.output / "last.pt")
        if validation_metrics["loss"] < best_validation_loss:
            best_validation_loss = validation_metrics["loss"]
            payload["best_validation_loss"] = best_validation_loss
            atomic_torch_save(payload, args.output / "best.pt")
        print(json.dumps(record, sort_keys=True), flush=True)
    (args.output / "TRAINING_COMPLETE.txt").write_text(
        "Training completed. This checkpoint remains auxiliary visual pretraining; evaluate held-out reviewed project pairs before any product use.\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
