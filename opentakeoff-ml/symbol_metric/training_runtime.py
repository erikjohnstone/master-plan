"""Runtime pieces for the isolated DINOv2 symbol-metric training package.

This package is intentionally offline-only.  It does not import OpenTakeoff
production code or write into a takeoff.  The caller owns whether a checkpoint
has enough held-out, human-reviewed evidence to ever be integrated later.
"""

from __future__ import annotations

import gzip
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter
import torch
from torch import Tensor, nn
from torch.nn import functional as F
from torch.utils.data import Dataset

from symbol_metric_transforms import prepare_symbol_image


DINO_REPOSITORY = "facebookresearch/dinov2"
# Frozen after a live check on 2026-09-14.  This avoids silently consuming a
# later upstream revision during a resume or reproduction run.
DINO_REVISION = "7764ea0f912e53c92e82eb78a2a1631e92725fc8"
DINO_ENTRYPOINT = "dinov2_vits14"
INPUT_SIZE = 280
IMAGE_MEAN = (0.485, 0.456, 0.406)
IMAGE_STD = (0.229, 0.224, 0.225)

# Anisotropic stretch is deliberately small for this external, weakly-labelled
# pretraining set.  No rotation or reflection is permitted: those can change a
# check valve, actuator, flow-arrow, or other directional symbol's meaning.
DIRECTIONAL_OR_ASYMMETRIC = frozenset(
    {
        "actuator_diaphragm",
        "actuator_motor",
        "actuator_piston",
        "actuator_solenoid",
        "damper_fire",
        "damper_generic",
        "instrument_discrete_auxiliary",
        "instrument_discrete_field",
        "instrument_discrete_primary",
        "instrument_shared_primary",
        "valve_3_way_generic",
        "valve_ball",
        "valve_butterfly",
        "valve_block_generic",
        "valve_check",
        "valve_control_generic",
        "valve_gate",
        "valve_globe",
    }
)


def load_records(dataset_root: Path, split: str) -> list[dict[str, Any]]:
    metadata = json.loads((dataset_root / "dataset.json").read_text(encoding="utf-8"))
    if split not in metadata["records"]:
        raise ValueError(f"Unknown split: {split}")
    with gzip.open(dataset_root / metadata["records"][split], "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def tensor_from_pil(image: Image.Image) -> Tensor:
    array = np.asarray(image, dtype=np.float32) / 255.0
    tensor = torch.from_numpy(array).permute(2, 0, 1)
    mean = torch.tensor(IMAGE_MEAN, dtype=tensor.dtype).view(3, 1, 1)
    std = torch.tensor(IMAGE_STD, dtype=tensor.dtype).view(3, 1, 1)
    return (tensor - mean) / std


def _fit_to_canvas(image: Image.Image, scale_x: float, scale_y: float, shift_x: int, shift_y: int) -> Image.Image:
    """Stretch within a white canvas, clipping instead of changing final geometry."""
    width, height = image.size
    resized = image.resize(
        (max(1, round(width * scale_x)), max(1, round(height * scale_y))),
        Image.Resampling.LANCZOS,
    )
    canvas = Image.new("RGB", (width, height), "white")
    left = (width - resized.width) // 2 + shift_x
    top = (height - resized.height) // 2 + shift_y
    canvas.paste(resized, (left, top))
    return canvas


@dataclass(frozen=True)
class SymbolAugmentation:
    profile: str = "conservative"

    def __post_init__(self) -> None:
        if self.profile not in {"none", "conservative", "extended"}:
            raise ValueError("profile must be none, conservative, or extended")

    def __call__(self, image: Image.Image, class_name: str, seed: int) -> Tensor:
        rng = random.Random(seed)
        base = image.convert("RGB")
        if self.profile != "none":
            if self.profile == "extended" and class_name not in DIRECTIONAL_OR_ASYMMETRIC:
                low, high = 0.86, 1.14
            else:
                low, high = 0.94, 1.06
            # This is deliberately anisotropic. It makes stretched export
            # variants familiar while preserving orientation and port order.
            scale_x = rng.uniform(low, high)
            scale_y = rng.uniform(low, high)
            shift_x = round(rng.uniform(-0.04, 0.04) * base.width)
            shift_y = round(rng.uniform(-0.04, 0.04) * base.height)
            base = _fit_to_canvas(base, scale_x, scale_y, shift_x, shift_y)
            if rng.random() < 0.45:
                base = ImageEnhance.Contrast(base).enhance(rng.uniform(0.82, 1.18))
            if rng.random() < 0.15:
                base = base.filter(ImageFilter.GaussianBlur(radius=rng.uniform(0.05, 0.35)))
            if rng.random() < 0.30:
                # Down/up sampling approximates export DPI loss without
                # inventing new strokes or changing topology.
                factor = rng.uniform(0.70, 0.95)
                smaller = (max(8, round(base.width * factor)), max(8, round(base.height * factor)))
                base = base.resize(smaller, Image.Resampling.BILINEAR).resize(base.size, Image.Resampling.BILINEAR)
        return tensor_from_pil(prepare_symbol_image(base, size=INPUT_SIZE))


class SymbolPairDataset(Dataset):
    """Exact two-view pairs with optional, explicitly weak source class labels."""

    def __init__(
        self,
        dataset_root: Path,
        source_root: Path,
        split: str,
        augmentation_profile: str,
        seed: int,
    ) -> None:
        self.records = load_records(dataset_root, split)
        if not self.records:
            raise ValueError(f"No records in {split}")
        self.source_root = source_root
        self.augmentation = SymbolAugmentation(augmentation_profile)
        self.seed = seed
        self.epoch = 0
        self.labels = {key: index for index, key in enumerate(sorted({row["weak_semantic_key"] for row in self.records}))}

    def set_epoch(self, epoch: int) -> None:
        self.epoch = epoch

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict[str, Any]:
        row = self.records[index]
        with Image.open(self.source_root / row["image_path"]) as source:
            crop = source.convert("RGB").crop(tuple(row["crop_xyxy"]))
        first_seed = self.seed + self.epoch * 1_000_003 + index * 2
        second_seed = first_seed + 1
        return {
            "view_a": self.augmentation(crop, row["class_name"], first_seed),
            "view_b": self.augmentation(crop, row["class_name"], second_seed),
            "proxy_label": self.labels[row["weak_semantic_key"]],
            "record_id": row["record_id"],
        }


def load_dinov2_backbone(cache_dir: Path) -> nn.Module:
    cache_dir.mkdir(parents=True, exist_ok=True)
    torch.hub.set_dir(str(cache_dir))
    return torch.hub.load(
        f"{DINO_REPOSITORY}:{DINO_REVISION}",
        DINO_ENTRYPOINT,
        trust_repo=True,
        verbose=False,
    )


class TwinMetricNet(nn.Module):
    def __init__(self, backbone: nn.Module, embedding_dim: int = 256) -> None:
        super().__init__()
        self.backbone = backbone
        self.projection = nn.Sequential(
            nn.LayerNorm(384),
            nn.Linear(384, 384),
            nn.GELU(),
            nn.Linear(384, embedding_dim),
        )

    def forward(self, images: Tensor) -> Tensor:
        features = self.backbone(images)
        if isinstance(features, dict):
            features = features["x_norm_clstoken"]
        if isinstance(features, tuple):
            features = features[0]
        return F.normalize(self.projection(features), dim=1)


class ProxyAnchorLoss(nn.Module):
    """Proxy Anchor metric loss for explicitly opted-in weak source labels."""

    def __init__(self, class_count: int, embedding_dim: int = 256, alpha: float = 32.0, margin: float = 0.1) -> None:
        super().__init__()
        self.proxies = nn.Parameter(torch.empty(class_count, embedding_dim))
        nn.init.kaiming_normal_(self.proxies, mode="fan_out")
        self.alpha = alpha
        self.margin = margin

    def forward(self, embeddings: Tensor, labels: Tensor) -> Tensor:
        proxies = F.normalize(self.proxies, dim=1)
        scores = embeddings @ proxies.t()
        positive = F.one_hot(labels, num_classes=proxies.size(0)).bool()
        negative = ~positive
        positive_term = torch.log1p((torch.exp(-self.alpha * (scores - self.margin)) * positive).sum(dim=0)).mean()
        negative_term = torch.log1p((torch.exp(self.alpha * (scores + self.margin)) * negative).sum(dim=0)).mean()
        return positive_term + negative_term


def nt_xent_loss(first: Tensor, second: Tensor, temperature: float = 0.10) -> Tensor:
    count = first.size(0)
    if count < 2:
        raise ValueError("NT-Xent needs batch size >= 2")
    features = torch.cat((first, second), dim=0)
    logits = (features @ features.t()) / temperature
    logits.fill_diagonal_(float("-inf"))
    targets = torch.cat((torch.arange(count, device=first.device) + count, torch.arange(count, device=first.device)))
    return F.cross_entropy(logits, targets)


def set_backbone_trainability(network: TwinMetricNet, freeze: bool) -> None:
    for parameter in network.backbone.parameters():
        parameter.requires_grad = not freeze


def checkpoint_payload(
    network: TwinMetricNet,
    optimizer: torch.optim.Optimizer,
    proxy_loss: ProxyAnchorLoss | None,
    epoch: int,
    arguments: dict[str, Any],
    labels: dict[str, int],
    best_validation_loss: float,
) -> dict[str, Any]:
    return {
        "format": "opentakeoff-symbol-metric-checkpoint-v1",
        "backbone": {"repository": DINO_REPOSITORY, "revision": DINO_REVISION, "entrypoint": DINO_ENTRYPOINT},
        "network": network.state_dict(),
        "optimizer": optimizer.state_dict(),
        "proxy_loss": proxy_loss.state_dict() if proxy_loss is not None else None,
        "epoch": epoch,
        "arguments": arguments,
        "proxy_label_map": labels,
        "best_validation_loss": best_validation_loss,
        "warning": "Auxiliary visual pretraining checkpoint. It is not production acceptance evidence.",
    }
