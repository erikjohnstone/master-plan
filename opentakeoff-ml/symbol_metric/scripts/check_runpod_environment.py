#!/usr/bin/env python3
"""Fail fast before paying for a GPU training run."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

import torch
from training_runtime import DINO_ENTRYPOINT, DINO_REPOSITORY, DINO_REVISION, load_records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--source-root", type=Path, required=True)
    args = parser.parse_args()
    details = {
        "python": sys.version.split()[0],
        "torch": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
        "cuda_version": torch.version.cuda,
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "backbone": f"{DINO_REPOSITORY}:{DINO_REVISION}/{DINO_ENTRYPOINT}",
        "records": {},
        "missing_images": 0,
    }
    for split in ("train", "val", "test"):
        rows = load_records(args.dataset, split)
        details["records"][split] = len(rows)
        for row in rows:
            details["missing_images"] += int(not (args.source_root / row["image_path"]).is_file())
    print(json.dumps(details, indent=2))
    if not details["cuda_available"]:
        print("CUDA is unavailable. Select a RunPod PyTorch GPU template; do not run a CPU training job.", file=sys.stderr)
        return 2
    if details["missing_images"]:
        print("Required source image pack(s) are missing.", file=sys.stderr)
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
