#!/usr/bin/env python3
"""Validate the manifest contract and source crop coordinates for metric data."""

from __future__ import annotations

import argparse
import collections
import json
import sys
from pathlib import Path

from PIL import Image

from metric_data_common import MANIFEST_VERSION, json_dump, read_jsonl_gz


REQUIRED = {
    "schema_version", "record_id", "split", "pack_id", "source_id", "license_as_published",
    "source_group_key", "image_path", "image_width", "image_height", "bbox_xywh", "crop_xyxy",
    "class_name", "evidence_tier", "default_positive_policy", "release_restriction",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--rtdetr-root", type=Path, required=True, help="Original TRAIN_NOW directory")
    parser.add_argument("--decode-all", action="store_true", help="Decode every referenced source image instead of a deterministic sample")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    dataset = args.dataset.resolve()
    source_root = args.rtdetr_root.resolve()
    meta = json.loads((dataset / "dataset.json").read_text(encoding="utf-8"))
    rows: list[dict] = []
    errors: list[str] = []
    for split, relative in meta["records"].items():
        records = read_jsonl_gz(dataset / relative)
        for record in records:
            missing = REQUIRED - record.keys()
            if missing:
                errors.append(f"{split}/{record.get('record_id', '?')}: missing {sorted(missing)}")
                continue
            if record["schema_version"] != MANIFEST_VERSION or record["split"] != split:
                errors.append(f"{split}/{record['record_id']}: schema or split mismatch")
            if len(record["crop_xyxy"]) != 4 or len(record["bbox_xywh"]) != 4:
                errors.append(f"{split}/{record['record_id']}: invalid coordinate length")
            else:
                left, top, right, bottom = record["crop_xyxy"]
                if not (0 <= left < right <= record["image_width"] and 0 <= top < bottom <= record["image_height"]):
                    errors.append(f"{split}/{record['record_id']}: crop outside image")
            if not (source_root / record["image_path"]).is_file():
                errors.append(f"{split}/{record['record_id']}: missing source image")
        rows.extend(records)
    ids = [row["record_id"] for row in rows]
    if len(ids) != len(set(ids)):
        errors.append("duplicate record ids")
    group_splits: dict[str, set[str]] = collections.defaultdict(set)
    for row in rows:
        group_splits[row["source_group_key"]].add(row["split"])
    leaking = [key for key, splits in group_splits.items() if len(splits) > 1]
    if leaking:
        errors.append(f"{len(leaking)} source groups cross splits")
    sample = rows if args.decode_all else sorted(rows, key=lambda row: row["record_id"])[::max(1, len(rows) // 96)][:96]
    decode_errors = 0
    for row in sample:
        try:
            with Image.open(source_root / row["image_path"]) as image:
                if image.size != (row["image_width"], row["image_height"]):
                    errors.append(f"{row['record_id']}: image dimensions changed")
                image.crop(tuple(row["crop_xyxy"])).load()
        except OSError as error:
            decode_errors += 1
            errors.append(f"{row['record_id']}: cannot decode crop: {error}")
    report = {
        "status": "pass" if not errors else "fail",
        "records_checked": len(rows),
        "images_decoded": len(sample),
        "decode_errors": decode_errors,
        "splits": dict(collections.Counter(row["split"] for row in rows)),
        "classes": dict(sorted(collections.Counter(row["class_name"] for row in rows).items())),
        "errors": errors[:200],
    }
    json_dump(dataset / "reports" / "validation.json", report)
    print(json.dumps(report, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"validation failed: {error}", file=sys.stderr)
        raise SystemExit(2)
