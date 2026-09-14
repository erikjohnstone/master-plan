#!/usr/bin/env python3
"""Loss wrappers over pytorch-metric-learning, per
SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md's cited training recipe: Proxy Anchor
(primary), Multi-Similarity and supervised-contrastive/triplet (mandatory
challengers). PML implements the losses/miners/samplers this recipe calls
for -- reused, not reimplemented, exactly as the production plan directs.
"""
from __future__ import annotations

from typing import Literal

import torch
import torch.nn as nn


def build_loss(name: Literal["proxy_anchor", "multi_similarity", "supcon", "triplet"],
                num_classes: int, embedding_dim: int):
    from pytorch_metric_learning import losses, miners, distances

    cosine = distances.CosineSimilarity()

    if name == "proxy_anchor":
        loss_fn = losses.ProxyAnchorLoss(
            num_classes=num_classes, embedding_size=embedding_dim,
            margin=0.1, alpha=32,
        )
        miner = None
    elif name == "multi_similarity":
        loss_fn = losses.MultiSimilarityLoss(alpha=2, beta=50, base=0.5, distance=cosine)
        miner = miners.MultiSimilarityMiner(epsilon=0.1, distance=cosine)
    elif name == "supcon":
        loss_fn = losses.SupConLoss(temperature=0.1, distance=cosine)
        miner = None
    elif name == "triplet":
        loss_fn = losses.TripletMarginLoss(margin=0.2, distance=cosine)
        miner = miners.TripletMarginMiner(margin=0.2, type_of_triplets="semihard", distance=cosine)
    else:
        raise ValueError(f"unknown loss {name!r}")
    return loss_fn, miner


class LossWithOptionalMiner(nn.Module):
    """Bundles a PML loss (some need a learnable nn.Module -- ProxyAnchorLoss
    owns the proxies -- so this must be registered as a submodule to get its
    parameters into the optimizer) with its optional miner."""

    def __init__(self, name: str, num_classes: int, embedding_dim: int):
        super().__init__()
        self.name = name
        self.loss_fn, self.miner = build_loss(name, num_classes, embedding_dim)
        if isinstance(self.loss_fn, nn.Module):
            self.add_module("loss_fn_module", self.loss_fn)

    def loss_parameters(self):
        if isinstance(self.loss_fn, nn.Module):
            return list(self.loss_fn.parameters())
        return []

    def forward(self, embeddings: torch.Tensor, labels: torch.Tensor) -> torch.Tensor:
        if self.miner is not None:
            pairs = self.miner(embeddings, labels)
            return self.loss_fn(embeddings, labels, pairs)
        return self.loss_fn(embeddings, labels)
