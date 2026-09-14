#!/usr/bin/env python3
"""Two-phase twin-encoder training.

Phase 1: freeze the backbone, train only the 384(or 768)->256 projection
          head, until dev retrieval stops improving.
Phase 2: unfreeze the last N backbone blocks at a lower LR, continue with
          balanced P x K sampling and (for Multi-Similarity/triplet) online
          hard-pair mining.

Usage:
    python3 src/train.py --config configs/dinov2_vits14_proxyanchor.yaml \
        --seed 17 --export-dir data/export --out-dir runs/dinov2_proxyanchor_seed17
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import yaml
from torch.utils.data import DataLoader

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model import ModelConfig, TwinEncoder  # noqa: E402
from losses import LossWithOptionalMiner  # noqa: E402
from dataset import CropRecordDataset, BalancedPKSampler, collate_batch  # noqa: E402
from evaluate import evaluate_retrieval  # noqa: E402


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


def warmup_cosine_lr(step: int, warmup_steps: int, total_steps: int, base_lr: float) -> float:
    if step < warmup_steps:
        return base_lr * (step + 1) / max(1, warmup_steps)
    progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
    return base_lr * 0.5 * (1 + math.cos(math.pi * min(1.0, progress)))


def build_optimizer(model: TwinEncoder, loss_mod: LossWithOptionalMiner, head_lr: float,
                     backbone_lr: float, weight_decay: float):
    groups = [{"params": list(model.head.parameters()), "lr": head_lr, "weight_decay": weight_decay}]
    bb_params = [p for p in model.backbone.parameters() if p.requires_grad]
    if bb_params:
        groups.append({"params": bb_params, "lr": backbone_lr, "weight_decay": weight_decay})
    loss_params = loss_mod.loss_parameters()
    if loss_params:
        groups.append({"params": loss_params, "lr": head_lr, "weight_decay": 0.0})
    return torch.optim.AdamW(groups)


def run_phase(model, loss_mod, loader, device, phase_cfg, weight_decay, max_steps_override=None):
    head_lr = phase_cfg["head_lr"]
    backbone_lr = phase_cfg.get("backbone_lr", 0.0)
    epochs = phase_cfg["epochs"]
    warmup_steps = phase_cfg["warmup_steps"]
    opt = build_optimizer(model, loss_mod, head_lr, backbone_lr, weight_decay)

    steps_per_epoch = max(1, len(loader))
    total_steps = steps_per_epoch * epochs
    if max_steps_override:
        total_steps = min(total_steps, max_steps_override)

    step = 0
    model.train()
    losses = []
    t0 = time.time()
    for epoch in range(epochs):
        for imgs, labels, _ids in loader:
            if step >= total_steps:
                break
            imgs = imgs.to(device)
            labels = labels.to(device)
            mask = labels >= 0
            lr_head = warmup_cosine_lr(step, warmup_steps, total_steps, head_lr)
            for i, g in enumerate(opt.param_groups):
                g["lr"] = lr_head if i == 0 else (
                    warmup_cosine_lr(step, warmup_steps, total_steps, backbone_lr) if i == 1 and backbone_lr > 0 else g["lr"]
                )
            opt.zero_grad()
            embeddings = model(imgs)
            if mask.sum() < 2:
                step += 1
                continue
            loss = loss_mod(embeddings[mask], labels[mask])
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                [p for g in opt.param_groups for p in g["params"]], max_norm=5.0
            )
            opt.step()
            losses.append(float(loss.detach().cpu()))
            step += 1
        if step >= total_steps:
            break
    elapsed = time.time() - t0
    return {
        "steps": step,
        "epochs_run": epoch + 1 if losses else 0,
        "mean_loss": sum(losses) / len(losses) if losses else None,
        "final_loss": losses[-1] if losses else None,
        "elapsed_sec": round(elapsed, 2),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--export-dir", default="data/export")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--smoke", action="store_true",
                     help="tiny run: caps steps per phase, small P x K, for local CPU validation only")
    ap.add_argument("--pretrained", action="store_true", default=True)
    ap.add_argument("--no-pretrained", dest="pretrained", action="store_false")
    args = ap.parse_args()

    cfg = yaml.safe_load(Path(args.config).read_text())
    set_seed(args.seed)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    export_dir = Path(args.export_dir)
    train_ds = CropRecordDataset(export_dir / "train" / "manifest.jsonl", export_dir / "train" / "crops",
                                  input_size=cfg["model"]["input_size"])
    dev_ds = CropRecordDataset(export_dir / "dev" / "manifest.jsonl", export_dir / "dev" / "crops",
                                input_size=cfg["model"]["input_size"])

    p = cfg["sampler"]["p_identities"] if not args.smoke else min(4, max(1, train_ds.num_positive_identities))
    k = cfg["sampler"]["k_samples"] if not args.smoke else 2
    sampler = BalancedPKSampler(train_ds, p_identities=p, k_samples=k, seed=args.seed)
    train_loader = DataLoader(train_ds, batch_sampler=sampler, collate_fn=collate_batch, num_workers=0)

    model_cfg = ModelConfig(
        backbone=cfg["model"]["backbone"],
        projection_dim=cfg["model"]["projection_dim"],
        input_size=cfg["model"]["input_size"],
        dropout=cfg["model"].get("dropout", 0.0),
        unfreeze_last_n_blocks=cfg["optim"]["phase2"].get("unfreeze_last_n_blocks", 4),
    )
    device = torch.device(args.device)
    model = TwinEncoder(model_cfg, pretrained=args.pretrained).to(device)

    num_classes = max(1, train_ds.num_positive_identities)
    loss_mod = LossWithOptionalMiner(cfg["loss"]["name"], num_classes, model_cfg.projection_dim).to(device)

    weight_decay = cfg["optim"].get("weight_decay", 0.05)
    max_steps = 6 if args.smoke else None

    model.set_phase(1)
    phase1_stats = run_phase(model, loss_mod, train_loader, device, cfg["optim"]["phase1"],
                              weight_decay, max_steps_override=max_steps)
    print("phase1:", phase1_stats)

    model.set_phase(2)
    phase2_stats = run_phase(model, loss_mod, train_loader, device, cfg["optim"]["phase2"],
                              weight_decay, max_steps_override=max_steps)
    print("phase2:", phase2_stats)

    model.eval()
    dev_metrics = evaluate_retrieval(model, dev_ds, device, batch_size=8 if not args.smoke else 4)
    print("dev metrics:", dev_metrics)

    ckpt_path = out_dir / "best.ckpt"
    torch.save({
        "model_state_dict": model.state_dict(),
        "model_config": model_cfg.__dict__,
        "config_path": str(args.config),
        "seed": args.seed,
    }, ckpt_path)

    summary = {
        "config": args.config,
        "seed": args.seed,
        "device": str(device),
        "smoke": args.smoke,
        "pretrained": args.pretrained,
        "num_train_identities": train_ds.num_positive_identities,
        "num_train_records": len(train_ds),
        "num_dev_records": len(dev_ds),
        "phase1": phase1_stats,
        "phase2": phase2_stats,
        "dev_metrics": dev_metrics,
        "checkpoint": str(ckpt_path),
    }
    (out_dir / "train_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
