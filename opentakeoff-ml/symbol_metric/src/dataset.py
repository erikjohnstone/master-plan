#!/usr/bin/env python3
"""Dataset + balanced P x K identity sampler over the exported crop shards.

Reads data/export/{split}/manifest.jsonl (written by export_dataset.py) --
one row per accepted training record (positive or hard/easy negative), each
pointing at a PNG crop under data/export/{split}/crops/. Only verdict ==
"positive" records carry symbol_identity_id groupings usable for P x K
metric-learning batches; negatives are folded in per-batch as extra
same-batch dissimilar samples (in-batch negatives), not their own identity
class, matching standard deep-metric-learning batch construction.
"""
from __future__ import annotations

import json
import random
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageEnhance
from torch.utils.data import Dataset, Sampler

from render_crops import to_model_input, MODEL_INPUT_SIZE

# Symbols reviewed as directional (allowed_transforms == "none") must never
# be geometrically perturbed -- flipping/rotating a check-valve body or a
# flow arrow changes its physical meaning. Non-directional symbols
# (allowed_transforms == "dihedral") are safe under the full 8-element
# dihedral group (0/90/180/270 rotation x optional mirror): a diffuser
# hexagon or a generic device outline reads the same either way. This is
# also the only source of sample diversity for identities with fewer than K
# real crops -- BalancedPKSampler otherwise repeats the same PNG bytes
# verbatim, which several metric-learning miners mine zero pairs from (see
# TASK_SPEC.md's training-pipeline review notes).
_DIHEDRAL_OPS = [
    lambda im: im,
    lambda im: im.transpose(Image.ROTATE_90),
    lambda im: im.transpose(Image.ROTATE_180),
    lambda im: im.transpose(Image.ROTATE_270),
    lambda im: im.transpose(Image.FLIP_LEFT_RIGHT),
    lambda im: im.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.ROTATE_90),
    lambda im: im.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.ROTATE_180),
    lambda im: im.transpose(Image.FLIP_LEFT_RIGHT).transpose(Image.ROTATE_270),
]


def _augment(img: "Image.Image", allowed_transforms: str, rng: random.Random) -> "Image.Image":
    if allowed_transforms == "dihedral":
        img = _DIHEDRAL_OPS[rng.randrange(len(_DIHEDRAL_OPS))](img)
    # Photometric jitter is always safe (never changes symbol identity or
    # orientation), so it applies even to directional ("none") symbols.
    img = ImageEnhance.Brightness(img).enhance(rng.uniform(0.85, 1.15))
    img = ImageEnhance.Contrast(img).enhance(rng.uniform(0.85, 1.15))
    return img


class CropRecordDataset(Dataset):
    def __init__(self, manifest_path: Path, crops_dir: Path, input_size: int = MODEL_INPUT_SIZE,
                 augment: bool = False, augment_seed: int = 0):
        self.records = [json.loads(l) for l in open(manifest_path) if l.strip()]
        self.crops_dir = Path(crops_dir)
        self.input_size = input_size
        self.augment = augment
        self._aug_rng = random.Random(augment_seed)
        # Only positives get a real identity label; negatives each get their
        # own unique singleton id past the positive range. Metric-learning
        # losses/miners treat equal labels as same-class positive pairs, so
        # a single shared sentinel (the previous behavior) would wrongly
        # teach the model that any two unrelated negative crops are the same
        # symbol; unique-per-record ids keep every negative a true negative
        # against everything else while still serving as an in-batch
        # negative for every real identity's proxy/anchor.
        identities = sorted({r["symbol_identity_id"] for r in self.records if r["verdict"] == "positive"})
        self.identity_to_label = {sid: i for i, sid in enumerate(identities)}
        self.num_positive_identities = len(identities)

    def __len__(self) -> int:
        return len(self.records)

    def label_for(self, idx: int) -> int:
        r = self.records[idx]
        if r["verdict"] == "positive":
            return self.identity_to_label[r["symbol_identity_id"]]
        return self.num_positive_identities + idx

    def __getitem__(self, idx: int):
        r = self.records[idx]
        img_path = self.crops_dir / r["crop_relative_path"]
        with open(img_path, "rb") as f:
            png_bytes = f.read()
        img = to_model_input(png_bytes, size=self.input_size)
        if self.augment:
            img = _augment(img, r.get("allowed_transforms", "none"), self._aug_rng)
        arr = torch.from_numpy(np.array(img)).permute(2, 0, 1).float() / 255.0
        label = self.label_for(idx)
        return arr, label, r["record_id"]


class BalancedPKSampler(Sampler):
    """~P identities x K samples per batch. Falls back gracefully when an
    identity has fewer than K real (unaugmented) positives available --
    real HVAC/BAS symbol identities in a small corpus often do."""

    def __init__(self, dataset: CropRecordDataset, p_identities: int = 16, k_samples: int = 4, seed: int = 0):
        self.dataset = dataset
        self.p = p_identities
        self.k = k_samples
        self.rng = random.Random(seed)
        self.by_identity: dict = {}
        for idx, r in enumerate(dataset.records):
            if r["verdict"] != "positive":
                continue
            self.by_identity.setdefault(r["symbol_identity_id"], []).append(idx)
        self.identities = list(self.by_identity.keys())
        self.neg_indices = [i for i, r in enumerate(dataset.records) if r["verdict"] != "positive"]

    def __iter__(self):
        ids = list(self.identities)
        self.rng.shuffle(ids)
        batches = []
        for i in range(0, len(ids), self.p):
            chunk = ids[i:i + self.p]
            batch = []
            for sid in chunk:
                pool = self.by_identity[sid]
                if len(pool) >= self.k:
                    batch += self.rng.sample(pool, self.k)
                else:
                    batch += [self.rng.choice(pool) for _ in range(self.k)]
            if self.neg_indices:
                n_neg = min(len(self.neg_indices), max(2, len(batch) // 4))
                batch += self.rng.sample(self.neg_indices, n_neg)
            self.rng.shuffle(batch)
            batches.append(batch)
        self.rng.shuffle(batches)
        for b in batches:
            yield b

    def __len__(self) -> int:
        if not self.identities:
            return 0  # __iter__ yields zero batches too -- let callers fail loudly, not silently
        return -(-len(self.identities) // max(1, self.p))  # ceiling division, matching __iter__


def collate_batch(items):
    imgs = torch.stack([it[0] for it in items])
    labels = torch.tensor([it[1] for it in items], dtype=torch.long)
    ids = [it[2] for it in items]
    return imgs, labels, ids
