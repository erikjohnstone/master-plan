"""Minimal source-native dataset for a DINOv2 twin encoder training loop.

This module deliberately does not choose a loss, model, or acceptance metric.
It yields exact two-view pairs by default and carries weak proxy labels only as
optional metadata.  Install torch/Pillow on the GPU machine before importing it.
"""

from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Callable

from PIL import Image


class SourceNativeSymbolMetricDataset:
    def __init__(
        self,
        dataset_root: str | Path,
        rtdetr_root: str | Path,
        split: str = "train",
        transform: Callable | None = None,
        transform_second_view: Callable | None = None,
    ) -> None:
        self.dataset_root = Path(dataset_root)
        self.rtdetr_root = Path(rtdetr_root)
        meta = json.loads((self.dataset_root / "dataset.json").read_text(encoding="utf-8"))
        if split not in meta["records"]:
            raise ValueError(f"Unknown split {split!r}")
        with gzip.open(self.dataset_root / meta["records"][split], "rt", encoding="utf-8") as stream:
            self.records = [json.loads(line) for line in stream if line.strip()]
        self.transform = transform or (lambda image: image.copy())
        self.transform_second_view = transform_second_view or self.transform
        self.class_to_index = {name: index for index, name in enumerate(sorted({row["weak_semantic_key"] for row in self.records}))}

    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: int) -> dict:
        row = self.records[index]
        with Image.open(self.rtdetr_root / row["image_path"]) as image:
            crop = image.convert("RGB").crop(tuple(row["crop_xyxy"]))
        return {
            "view_a": self.transform(crop.copy()),
            "view_b": self.transform_second_view(crop.copy()),
            "proxy_label": self.class_to_index[row["weak_semantic_key"]],
            "record_id": row["record_id"],
            "evidence_tier": row["evidence_tier"],
            "release_restriction": row["release_restriction"],
        }
