#!/usr/bin/env python3
"""Build a source-native DINOv2 metric dataset from audited RT-DETR packs.

This builder intentionally produces manifests, not a blind crop duplication.
Records retain enough provenance to reproduce each crop from the immutable
source collection.  It makes no production inference and has no dependency on
OpenTakeoff's shared extraction path.
"""

from __future__ import annotations

import argparse
import collections
import json
import shutil
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageOps

from metric_data_common import (
    ALLOWED_LICENSES,
    MANIFEST_VERSION,
    crop_xyxy,
    json_dump,
    split_for_group,
    stable_hash,
    stable_int,
    write_jsonl_gz,
)


# Selected for discrete HVAC/BAS symbols.  Linework-only and synthetic packs are
# deliberately excluded; their inclusion would teach the metric loss an
# unrelated task or fabricate visual diversity.
DEFAULT_PACKS = (
    "01_hvac_airside",
    "03_vav_and_air_terminals",
    "04_ahu_and_equipment",
    "06_pid_valves_and_instruments",
    "07_pid_valves_and_heat_exchangers",
    "08_pid_valves_and_pump",
    "10_supply_return_terminals",
    "11_diffusers_and_grilles",
    "12_thermostats_and_ceiling_terminals",
    "13_generic_airside_symbols",
    "15_actuator_symbols",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rtdetr-root", type=Path, required=True, help="Existing HVAC_BAS_RTDETR collection root")
    parser.add_argument("--output", type=Path, required=True, help="New, empty output directory")
    parser.add_argument("--packs", nargs="+", default=list(DEFAULT_PACKS), help="TRAIN_NOW pack names")
    parser.add_argument("--context", type=float, default=0.25, help="Fraction of max box side retained around a box")
    parser.add_argument("--max-per-source-class", type=int, default=1500, help="Deterministic cap per source / pack / class")
    parser.add_argument("--min-side", type=float, default=8.0, help="Reject annotations whose short side is smaller")
    parser.add_argument("--replace", action="store_true", help="Replace an existing output made by this builder")
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def output_is_replaceable(path: Path) -> bool:
    return (path / "dataset.json").is_file() and (path / "build_receipt.json").is_file()


def source_licenses(pack_root: Path) -> dict[str, dict[str, str]]:
    rows = load_json(pack_root / "sources_and_licenses.json")
    return {
        str(row["source_id"]): {
            "license": str(row.get("license_as_published", "")),
            "url": str(row.get("url", "")),
            "name": str(row.get("name", "")),
            "notes": str(row.get("notes", "")),
        }
        for row in rows
    }


def source_key(record: dict[str, Any]) -> str:
    source_bbox = record.get("source_bbox") or record["bbox_xywh"]
    bbox_text = ",".join(f"{float(value):.4f}" for value in source_bbox)
    return "|".join(
        [
            record["source_id"],
            record.get("source_pixel_sha256") or record["image_pixel_sha256"],
            record["source_class"],
            bbox_text,
        ]
    )


def choose_records(candidates: list[dict[str, Any]], max_per_source_class: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Remove duplicates/conflicts and cap dense, non-independent repetitions."""
    by_source_box: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in candidates:
        by_source_box[source_key(row)].append(row)

    duplicate_count = 0
    conflict_count = 0
    deduped: list[dict[str, Any]] = []
    for key, rows in by_source_box.items():
        signatures = {(row["class_name"], row["source_class"]) for row in rows}
        if len(signatures) != 1:
            conflict_count += len(rows)
            continue
        rows.sort(key=lambda row: (row["pack_id"], row["image_path"], row["annotation_id"]))
        deduped.append(rows[0])
        duplicate_count += len(rows) - 1

    by_label: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in deduped:
        by_label[f"{row['source_id']}|{row['pack_id']}|{row['class_name']}"].append(row)

    retained: list[dict[str, Any]] = []
    cap_count = 0
    for key, rows in by_label.items():
        rows.sort(key=lambda row: (stable_int(row["record_id"]), row["record_id"]))
        retained.extend(rows[:max_per_source_class])
        cap_count += max(0, len(rows) - max_per_source_class)
    retained.sort(key=lambda row: row["record_id"])
    return retained, {
        "duplicates_removed": duplicate_count,
        "conflicting_duplicate_records_excluded": conflict_count,
        "dense_source_class_records_capped": cap_count,
    }


def make_qa_contact_sheet(records: list[dict[str, Any]], root: Path, output: Path, title: str) -> None:
    """Tiny visual proof that source coordinates resolve; never a label certification."""
    selected = sorted(records, key=lambda row: stable_int(row["record_id"]))[:24]
    if not selected:
        return
    tile_size = 176
    label_height = 28
    canvas = Image.new("RGB", (tile_size * 6, (tile_size + label_height) * 4), "white")
    draw = ImageDraw.Draw(canvas)
    for index, row in enumerate(selected):
        source = root / row["image_path"]
        with Image.open(source) as image:
            crop = image.convert("RGB").crop(tuple(row["crop_xyxy"]))
            crop.thumbnail((tile_size - 8, tile_size - 8))
            tile = Image.new("RGB", (tile_size, tile_size), "white")
            tile.paste(crop, ((tile_size - crop.width) // 2, (tile_size - crop.height) // 2))
        x = (index % 6) * tile_size
        y = (index // 6) * (tile_size + label_height)
        canvas.paste(tile, (x, y))
        draw.text((x + 4, y + tile_size + 4), row["class_name"][:23], fill="black")
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, quality=90)
    output.with_suffix(".txt").write_text(
        f"{title}\n"
        "This is a random deterministic coordinate-resolution sample, not annotation certification.\n",
        encoding="utf-8",
    )


def make_weak_pairs(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build optional weak semantic pairs, never test/release evidence."""
    by_key: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    for row in records:
        if row["split"] == "train":
            by_key[row["weak_semantic_key"]].append(row)
    pairs: list[dict[str, Any]] = []
    for key, rows in by_key.items():
        if len(rows) < 2:
            continue
        rows.sort(key=lambda row: (stable_int(row["record_id"]), row["record_id"]))
        for index, anchor in enumerate(rows):
            partner = next(
                (
                    candidate
                    for offset in range(1, len(rows))
                    for candidate in [rows[(index + offset) % len(rows)]]
                    if candidate["source_group_key"] != anchor["source_group_key"]
                ),
                None,
            )
            if partner is None:
                continue
            pairs.append(
                {
                    "anchor_id": anchor["record_id"],
                    "positive_id": partner["record_id"],
                    "relation": "same_annotated_class_weak",
                    "weak_semantic_key": key,
                    "evidence_tier": "external_semantic_annotation",
                    "release_restriction": "Optional warm-up only. Never use as a production acceptance or retrieval-evaluation label.",
                }
            )
    return pairs


def write_handoff(output: Path) -> None:
    """Make the external dataset folder usable without needing this git checkout."""
    runtime = output / "runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    package = Path(__file__).resolve().parents[1]
    for relative in ("symbol_metric_dataset.py", "symbol_metric_transforms.py", "requirements-data.txt"):
        shutil.copy2(package / relative, runtime / relative)
    shutil.copy2(package / "scripts" / "materialize_crops.py", runtime / "materialize_crops.py")
    shutil.copy2(package / "scripts" / "metric_data_common.py", runtime / "metric_data_common.py")
    shutil.copy2(package / "scripts" / "validate_rtdetr_metric_dataset.py", runtime / "validate_rtdetr_metric_dataset.py")
    (output / "START_HERE.md").write_text(
        "# DINOv2 metric-training handoff\n\n"
        "This folder is a source-native crop manifest. Its image pixels remain in the adjacent audited "
        "`TRAIN_NOW` folder rather than being needlessly copied here. Copy only the folders listed in "
        "`required_input_paths.txt`; the synthetic and linework-only packs are not needed.\n\n"
        "## Required layout on a GPU machine\n\n"
        "```text\n"
        "/workspace/HVAC_BAS_RTDETR/\n"
        "  TRAIN_NOW/                  # original audited RT-DETR images\n"
        "  DINOv2_METRIC_V1/            # this folder\n"
        "```\n\n"
        "## Verify before training\n\n"
        "Run the validator bundled under `runtime/` before training:\n\n"
        "```sh\n"
        "python3 /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1/runtime/validate_rtdetr_metric_dataset.py \\\n"
        "  --dataset /workspace/HVAC_BAS_RTDETR/DINOv2_METRIC_V1 \\\n"
        "  --rtdetr-root /workspace/HVAC_BAS_RTDETR/TRAIN_NOW\n"
        "```\n\n"
        "## Default DINOv2 supervision\n\n"
        "Use `manifests/positive_pairs_train.jsonl.gz`: its two views are augmentations of the **same annotated crop**. "
        "`weak_pairs_train.jsonl.gz` is optional class-level warm-up data only; it is not valid plan-grounding or "
        "installed-quantity test truth.  `runtime/symbol_metric_dataset.py` exposes the source-native images to a "
        "PyTorch training loop.  Use `runtime/symbol_metric_transforms.py` first to preserve aspect ratio, pad to "
        "280x280, and supply grayscale-replicated RGB to DINOv2-S/14.\n\n"
        "Do not use this auxiliary dataset alone to certify OpenTakeoff production accuracy. Final acceptance needs "
        "human-reviewed, held-out legend-to-plan pairs from real drawing sets.\n",
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    collection_root = args.rtdetr_root.resolve()
    packs_root = collection_root / "TRAIN_NOW"
    output = args.output.resolve()
    if not packs_root.is_dir():
        raise SystemExit(f"TRAIN_NOW is missing under {collection_root}")
    if args.context < 0 or args.context > 1:
        raise SystemExit("--context must be between 0 and 1")
    if args.max_per_source_class < 1:
        raise SystemExit("--max-per-source-class must be positive")
    if output.exists() and any(output.iterdir()):
        if not args.replace or not output_is_replaceable(output):
            raise SystemExit(f"Refusing to overwrite non-empty {output}; use a new path.")
        shutil.rmtree(output)
    output.mkdir(parents=True, exist_ok=False)

    candidates: list[dict[str, Any]] = []
    skipped = collections.Counter()
    source_provenance: dict[str, dict[str, str]] = {}
    selected_packs: list[dict[str, Any]] = []
    for pack_id in args.packs:
        pack = packs_root / pack_id
        if not pack.is_dir():
            raise SystemExit(f"Requested pack is missing: {pack}")
        summary = load_json(pack / "summary.json")
        licenses = source_licenses(pack)
        selected_packs.append(
            {
                "pack_id": pack_id,
                "title": summary.get("title"),
                "domain": summary.get("domain"),
                "classes": summary.get("classes", []),
                "source_ids": summary.get("sources", []),
            }
        )
        for split in ("train", "val", "test"):
            annotation_path = pack / "annotations" / f"instances_{split}.json"
            if not annotation_path.is_file():
                continue
            coco = load_json(annotation_path)
            categories = {int(row["id"]): str(row["name"]) for row in coco["categories"]}
            images = {int(row["id"]): row for row in coco["images"]}
            for annotation in coco["annotations"]:
                image = images.get(int(annotation["image_id"]))
                if image is None:
                    skipped["annotation_without_image"] += 1
                    continue
                source_id = str(image.get("source_id", ""))
                provenance = licenses.get(source_id)
                if provenance is None or provenance["license"] not in ALLOWED_LICENSES:
                    skipped["disallowed_or_unknown_license"] += 1
                    continue
                bbox = [float(value) for value in annotation["bbox"]]
                if len(bbox) != 4 or bbox[2] < args.min_side or bbox[3] < args.min_side:
                    skipped["tiny_or_invalid_box"] += 1
                    continue
                try:
                    crop = crop_xyxy(bbox, int(image["width"]), int(image["height"]), args.context)
                except ValueError:
                    skipped["degenerate_crop"] += 1
                    continue
                image_path = f"{pack_id}/{image['file_name']}"
                if not (packs_root / image_path).is_file():
                    skipped["missing_image_file"] += 1
                    continue
                class_name = categories.get(int(annotation["category_id"]))
                if class_name is None:
                    skipped["unknown_category"] += 1
                    continue
                group_id = str(image.get("group_id") or image.get("source_file") or image["id"])
                group_key = f"{source_id}|{group_id}"
                source_class = str(annotation.get("source_class") or class_name)
                seed = "|".join((pack_id, source_id, str(image.get("pixel_sha256", "")), str(annotation["id"]), class_name))
                record = {
                    "schema_version": MANIFEST_VERSION,
                    "record_id": stable_hash(seed)[:24],
                    "split": split_for_group(group_key),
                    "upstream_pack_split": split,
                    "pack_id": pack_id,
                    "pack_domain": str(summary.get("domain", "")),
                    "source_id": source_id,
                    "source_name": provenance["name"],
                    "source_url": provenance["url"],
                    "license_as_published": provenance["license"],
                    "source_notes": provenance["notes"],
                    "source_group_key": group_key,
                    "source_group_id": group_id,
                    "image_path": image_path,
                    "image_width": int(image["width"]),
                    "image_height": int(image["height"]),
                    "image_pixel_sha256": str(image.get("pixel_sha256", "")),
                    "source_pixel_sha256": str(image.get("source_pixel_sha256", "")),
                    "source_file": str(image.get("source_file", "")),
                    "source_crop": image.get("source_crop"),
                    "annotation_id": int(annotation["id"]),
                    "source_annotation_id": annotation.get("source_annotation_id"),
                    "bbox_xywh": bbox,
                    "source_bbox": annotation.get("source_bbox"),
                    "crop_xyxy": crop,
                    "class_name": class_name,
                    "source_class": source_class,
                    "weak_semantic_key": f"{source_id}|{pack_id}|{class_name}",
                    "evidence_tier": "external_semantic_annotation",
                    "default_positive_policy": "same_instance_augmentation",
                    "release_restriction": "Auxiliary visual pretraining only; not a certified legend-to-plan match or installed-quantity truth.",
                }
                candidates.append(record)
                source_provenance[source_id] = provenance

    retained, choices = choose_records(candidates, args.max_per_source_class)
    by_split: dict[str, list[dict[str, Any]]] = {"train": [], "val": [], "test": []}
    for record in retained:
        by_split[record["split"]].append(record)
    for rows in by_split.values():
        rows.sort(key=lambda row: row["record_id"])

    group_splits: dict[str, set[str]] = collections.defaultdict(set)
    for record in retained:
        group_splits[record["source_group_key"]].add(record["split"])
    leaked_groups = [key for key, splits in group_splits.items() if len(splits) != 1]
    if leaked_groups:
        raise RuntimeError(f"split assignment leaked {len(leaked_groups)} groups")

    manifest_dir = output / "manifests"
    record_counts = {
        split: write_jsonl_gz(manifest_dir / f"records_{split}.jsonl.gz", rows)
        for split, rows in by_split.items()
    }
    exact_pairs = [
        {
            "anchor_id": row["record_id"],
            "positive_id": row["record_id"],
            "relation": "same_instance_augmentation",
            "view_a_seed": stable_int(f"a|{row['record_id']}") % (2**31),
            "view_b_seed": stable_int(f"b|{row['record_id']}") % (2**31),
            "evidence_tier": "exact_same_annotation",
            "release_restriction": "Safe default pair for visual pretraining. It does not verify a legend-to-plan relation.",
        }
        for row in by_split["train"]
    ]
    weak_pairs = make_weak_pairs(retained)
    pair_counts = {
        "same_instance_augmentation": write_jsonl_gz(manifest_dir / "positive_pairs_train.jsonl.gz", exact_pairs),
        "same_annotated_class_weak": write_jsonl_gz(manifest_dir / "weak_pairs_train.jsonl.gz", weak_pairs),
    }

    qa_root = output / "qa_samples"
    for split, rows in by_split.items():
        make_qa_contact_sheet(rows, packs_root, qa_root / f"{split}.jpg", f"{split} crop coordinate sample")

    class_counts: dict[str, dict[str, int]] = {}
    for split, rows in by_split.items():
        class_counts[split] = dict(sorted(collections.Counter(row["class_name"] for row in rows).items()))
    report = {
        "schema_version": MANIFEST_VERSION,
        "builder": "build_rtdetr_metric_dataset.py",
        "input_collection": str(collection_root),
        "source_images_root_relative": "TRAIN_NOW",
        "selected_packs": selected_packs,
        "allowed_licenses": sorted(ALLOWED_LICENSES),
        "selection_policy": {
            "max_per_source_pack_class": args.max_per_source_class,
            "minimum_box_side_px": args.min_side,
            "context_fraction": args.context,
            "split": "sha256(source_id|source_group_id), 80/10/10; a group is in one split only",
            "default_positive_policy": "same_instance_augmentation",
            "weak_pair_policy": "same source-local annotated class; optional warm-up only",
        },
        "input_candidate_records": len(candidates),
        "retained_records": len(retained),
        "record_counts": record_counts,
        "pair_counts": pair_counts,
        "class_counts": class_counts,
        "source_count": len(source_provenance),
        "source_provenance": source_provenance,
        "rejections": {**dict(sorted(skipped.items())), **choices},
        "known_limitations": [
            "Source annotation correctness and completeness are not certified by this conversion.",
            "Source group identity is filename/pixel-family based, not verified building or engineering-firm identity.",
            "Weak same-class pairs are source-local semantic labels, not exact legend-to-plan identity truth.",
            "This dataset cannot certify installed quantities, tag ownership, or plan grounding.",
        ],
    }
    json_dump(output / "reports" / "summary.json", report)
    json_dump(output / "reports" / "rejections.json", {**dict(sorted(skipped.items())), **choices})
    json_dump(output / "provenance" / "sources.json", dict(sorted(source_provenance.items())))
    json_dump(
        output / "dataset.json",
        {
            "schema_version": MANIFEST_VERSION,
            "format": "source-native COCO crop manifest",
            "records": {split: f"manifests/records_{split}.jsonl.gz" for split in by_split},
            "default_training_pairs": "manifests/positive_pairs_train.jsonl.gz",
            "optional_weak_pairs": "manifests/weak_pairs_train.jsonl.gz",
            "qa_samples": {split: f"qa_samples/{split}.jpg" for split in by_split if by_split[split]},
            "source_root_requirement": "Pass the original TRAIN_NOW directory as --rtdetr-root to loaders.",
        },
    )
    json_dump(
        output / "build_receipt.json",
        {
            "schema_version": MANIFEST_VERSION,
            "input_collection_path": str(collection_root),
            "input_catalog_sha256": stable_hash((collection_root / "catalog" / "sources.json").read_text(encoding="utf-8")),
            "selected_packs": list(args.packs),
            "retained_records": len(retained),
        },
    )
    (output / "required_input_paths.txt").write_text(
        "# Required relative folders from the original HVAC_BAS_RTDETR collection\n"
        "# Keep these paths below the same TRAIN_NOW root on the GPU volume.\n"
        + "".join(f"TRAIN_NOW/{pack_id}\n" for pack_id in args.packs),
        encoding="utf-8",
    )
    write_handoff(output)
    print(json.dumps({"output": str(output), "retained_records": len(retained), "record_counts": record_counts, "pair_counts": pair_counts}, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"build failed: {error}", file=sys.stderr)
        raise SystemExit(2)
