#!/usr/bin/env python3
"""Shared-weight twin encoder: DINOv2-S/14 (primary) or ConvNeXt-Tiny
(mandatory challenger) backbone -> linear projection -> L2 normalize.

Both query (reference crop) and gallery (candidate crop) pass through the
SAME weights (a true twin/Siamese encoder, not two separate towers) --
cosine similarity between the two embeddings is the ranking signal.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import torch
import torch.nn as nn


@dataclass
class ModelConfig:
    backbone: Literal["dinov2_vits14", "convnext_tiny"] = "dinov2_vits14"
    projection_dim: int = 256
    input_size: int = 280
    freeze_backbone: bool = True
    unfreeze_last_n_blocks: int = 4
    dropout: float = 0.0


class ProjectionHead(nn.Module):
    def __init__(self, in_dim: int, out_dim: int, dropout: float = 0.0):
        super().__init__()
        layers = [nn.Linear(in_dim, out_dim)]
        if dropout > 0:
            layers.append(nn.Dropout(dropout))
        self.net = nn.Sequential(*layers)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.net(x)
        return nn.functional.normalize(x, p=2, dim=-1)


class DinoV2Backbone(nn.Module):
    """facebook/dinov2-small via transformers. Apache-2.0 base weights."""

    HF_ID = "facebook/dinov2-small"
    EMBED_DIM = 384

    def __init__(self, pretrained: bool = True):
        super().__init__()
        from transformers import AutoModel
        if pretrained:
            self.backbone = AutoModel.from_pretrained(self.HF_ID)
        else:
            from transformers import AutoConfig
            cfg = AutoConfig.from_pretrained(self.HF_ID)
            self.backbone = AutoModel.from_config(cfg)
        self.embed_dim = self.EMBED_DIM

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        out = self.backbone(pixel_values=pixel_values)
        # CLS token pooled output is DINOv2's own recommended global feature
        # for retrieval (see MODEL_CARD.md cited in the production plan).
        return out.pooler_output if out.pooler_output is not None else out.last_hidden_state[:, 0]

    def set_trainable_last_n_blocks(self, n: int) -> None:
        for p in self.backbone.parameters():
            p.requires_grad_(False)
        blocks = self.backbone.encoder.layer
        for blk in list(blocks)[-n:]:
            for p in blk.parameters():
                p.requires_grad_(True)
        # Also unfreeze the final layernorm, if present, for stable output scale.
        if hasattr(self.backbone, "layernorm"):
            for p in self.backbone.layernorm.parameters():
                p.requires_grad_(True)


class ConvNextTinyBackbone(nn.Module):
    """timm convnext_tiny -- mandatory architecture challenger."""

    EMBED_DIM = 768

    def __init__(self, pretrained: bool = True):
        super().__init__()
        import timm
        self.backbone = timm.create_model(
            "convnext_tiny", pretrained=pretrained, num_classes=0, global_pool="avg"
        )
        self.embed_dim = self.EMBED_DIM

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        return self.backbone(pixel_values)

    def set_trainable_last_n_blocks(self, n: int) -> None:
        for p in self.backbone.parameters():
            p.requires_grad_(False)
        # Flatten every stage's blocks into one ordered list and unfreeze the
        # last n of THOSE (mirroring DinoV2Backbone's "last n of 12
        # transformer blocks" semantics exactly). The previous `stages[-(n
        # // 2):]` unfroze whole ConvNeXt stages -- with unfreeze_last_n_blocks=4
        # (every config's value) that was `stages[-2:]`, i.e. 12 of
        # convnext_tiny's 18 total blocks (depths 3,3,9,3), vs DINOv2's 4 of
        # 12 -- a much larger fraction of the network, breaking the
        # apples-to-apples backbone comparison select_winner.py relies on.
        all_blocks = [blk for stage in self.backbone.stages for blk in stage.blocks]
        for blk in all_blocks[-n:]:
            for p in blk.parameters():
                p.requires_grad_(True)
        if hasattr(self.backbone, "norm_pre"):
            for p in self.backbone.norm_pre.parameters():
                p.requires_grad_(True)


def build_backbone(name: str, pretrained: bool = True) -> nn.Module:
    if name == "dinov2_vits14":
        return DinoV2Backbone(pretrained=pretrained)
    if name == "convnext_tiny":
        return ConvNextTinyBackbone(pretrained=pretrained)
    raise ValueError(f"unknown backbone {name!r}")


class TwinEncoder(nn.Module):
    def __init__(self, cfg: ModelConfig, pretrained: bool = True):
        super().__init__()
        self.cfg = cfg
        self.backbone = build_backbone(cfg.backbone, pretrained=pretrained)
        self.head = ProjectionHead(self.backbone.embed_dim, cfg.projection_dim, dropout=cfg.dropout)
        if cfg.freeze_backbone:
            for p in self.backbone.parameters():
                p.requires_grad_(False)

    def set_phase(self, phase: int) -> None:
        """phase 1: frozen backbone, train head only.
        phase 2: unfreeze last N backbone blocks at a lower LR (set by the
        optimizer param groups in train.py, not here)."""
        if phase == 1:
            for p in self.backbone.parameters():
                p.requires_grad_(False)
        elif phase == 2:
            self.backbone.set_trainable_last_n_blocks(self.cfg.unfreeze_last_n_blocks)
        else:
            raise ValueError(phase)

    def forward(self, pixel_values: torch.Tensor) -> torch.Tensor:
        feat = self.backbone(pixel_values)
        return self.head(feat)

    def embed(self, pixel_values: torch.Tensor) -> torch.Tensor:
        with torch.no_grad():
            return self.forward(pixel_values)


def cosine_similarity_matrix(a: torch.Tensor, b: torch.Tensor) -> torch.Tensor:
    # a, b already L2-normalized by the projection head; matmul == cosine sim.
    return a @ b.t()
