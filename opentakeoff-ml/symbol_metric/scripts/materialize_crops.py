#!/usr/bin/env python3
"""Optionally turn source-native manifests into a portable crop cache on a GPU disk."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

from metric_data_common import read_jsonl_gz


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--rtdetr-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--splits", nargs="+", default=["train", "val", "test"])
    parser.add_argument("--quality", type=int, default=95)
    args = parser.parse_args()
    meta = json.loads((args.dataset / "dataset.json").read_text(encoding="utf-8"))
    if args.output.exists() and any(args.output.iterdir()):
        raise SystemExit(f"Refusing to overwrite non-empty {args.output}")
    args.output.mkdir(parents=True, exist_ok=False)
    count = 0
    for split in args.splits:
        rows = read_jsonl_gz(args.dataset / meta["records"][split])
        for row in rows:
            target = args.output / split / f"{row['record_id']}.jpg"
            target.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(args.rtdetr_root / row["image_path"]) as image:
                image.convert("RGB").crop(tuple(row["crop_xyxy"])).save(target, quality=args.quality, optimize=True)
            count += 1
    (args.output / "README.txt").write_text(
        "Portable crop cache generated from OpenTakeoff source-native metric manifests.\n"
        "Use the source manifests for labels/provenance; do not treat this cache as new ground truth.\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(args.output), "crops": count}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
