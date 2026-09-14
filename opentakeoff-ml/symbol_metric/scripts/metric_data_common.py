#!/usr/bin/env python3
"""Shared, dependency-light helpers for source-native symbol metric data."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
from pathlib import Path
from typing import Any, Iterable


ALLOWED_LICENSES = {"CC BY 4.0", "Public Domain", "MIT"}
MANIFEST_VERSION = "opentakeoff-symbol-metric-v1"


def stable_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def stable_int(value: str) -> int:
    return int(stable_hash(value)[:16], 16)


def json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_jsonl_gz(path: Path, rows: Iterable[dict[str, Any]]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    # gzip.open records the current time in its header; fixed metadata makes
    # manifests bit-for-bit reproducible when the immutable source is unchanged.
    with path.open("wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8") as stream:
                for row in rows:
                    stream.write(json.dumps(row, sort_keys=True, separators=(",", ":")) + "\n")
                    count += 1
    return count


def read_jsonl_gz(path: Path) -> list[dict[str, Any]]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        return [json.loads(line) for line in stream if line.strip()]


def crop_xyxy(bbox_xywh: list[float], width: int, height: int, context: float) -> list[int]:
    """Return a clipped context crop around a COCO xywh box."""
    x, y, box_w, box_h = (float(v) for v in bbox_xywh)
    pad = max(box_w, box_h) * context
    left = max(0, int(round(x - pad)))
    top = max(0, int(round(y - pad)))
    right = min(width, int(round(x + box_w + pad)))
    bottom = min(height, int(round(y + box_h + pad)))
    if right <= left or bottom <= top:
        raise ValueError("degenerate crop")
    return [left, top, right, bottom]


def split_for_group(group_key: str) -> str:
    """Stable 80/10/10 assignment. A source group can appear in one split only."""
    bucket = stable_int(group_key) % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "val"
    return "test"
