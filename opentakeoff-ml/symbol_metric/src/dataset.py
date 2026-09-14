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

import torch
from PIL import Image
from torch.utils.data import Dataset, Sampler

from render_crops import to_model_input, MODEL_INPUT_SIZE


class CropRecordDataset(Dataset):
    def __init__(self, manifest_path: Path, crops_dir: Path, input_size: int = MODEL_INPUT_SIZE):
        self.records = [json.loads(l) for l in open(manifest_path) if l.strip()]
        self.crops_dir = Path(crops_dir)
        self.input_size = input_size
        # Only positives get a real identity label; negatives get a
        # sentinel id unique per record (never grouped with anything).
        identities = sorted({r["symbol_identity_id"] for r in self.records if r["verdict"] == "positive"})
        self.identity_to_label = {sid: i for i, sid in enumerate(identities)}
        self.num_positive_identities = len(identities)

    def __len__(self) -> int:
        return len(self.records)

    def label_for(self, idx: int) -> int:
        r = self.records[idx]
        if r["verdict"] == "positive":
            return self.identity_to_label[r["symbol_identity_id"]]
        return -1  # negatives never share a positive label id

    def __getitem__(self, idx: int):
        r = self.records[idx]
        img_path = self.crops_dir / r["crop_relative_path"]
        with open(img_path, "rb") as f:
            png_bytes = f.read()
        img = to_model_input(png_bytes, size=self.input_size)
        import numpy as np
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
        return max(1, len(self.identities) // max(1, self.p))


def collate_batch(items):
    imgs = torch.stack([it[0] for it in items])
    labels = torch.tensor([it[1] for it in items], dtype=torch.long)
    ids = [it[2] for it in items]
    return imgs, labels, ids
