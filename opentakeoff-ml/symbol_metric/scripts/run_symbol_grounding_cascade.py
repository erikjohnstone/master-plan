#!/usr/bin/env python3
"""Emit auditable tiled RT-DETR -> DINO proposals for real-PDF renders.

Offline evaluation only: this script neither resolves a vector tag/leader,
binds a schedule row, calculates a quantity, nor approves a takeoff. A caller
provides an independently owned legend/anchor crop. RT-DETR proposes every
candidate over high-resolution tiles, DINO scores every merged proposal, and a
frozen threshold may create a proposal for human review. Defaults withhold all
automatic selections.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

from PIL import Image

PACKAGE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PACKAGE_ROOT))

from symbol_metric_transforms import prepare_symbol_image


REQUEST_SCHEMA = "opentakeoff.symbol_grounding_request.v1"
PREDICTION_SCHEMA = "opentakeoff.project_grounding_prediction.v1"


@dataclass(frozen=True)
class Tile:
    x0: int
    y0: int
    x1: int
    y1: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--requests", type=Path, required=True, help="JSONL of page renders and independently owned anchor bboxes")
    parser.add_argument("--source-root", type=Path, required=True, help="Root of immutable real-PDF page render images")
    parser.add_argument("--rtdetr-checkpoint", type=Path, required=True, help="Selected RT-DETR HF checkpoint directory")
    parser.add_argument("--dino-checkpoint", type=Path, required=True, help="OpenTakeoff DINO metric checkpoint")
    parser.add_argument("--dino-hub-cache", type=Path, required=True, help="Pinned DINOv2 hub cache")
    parser.add_argument("--output", type=Path, required=True, help="New prediction JSONL; never overwrite")
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--tile-size-px", type=int, default=1024)
    parser.add_argument("--tile-overlap-fraction", type=float, default=0.20)
    parser.add_argument("--detector-score-threshold", type=float, default=0.05)
    parser.add_argument("--global-nms-iou", type=float, default=0.50)
    parser.add_argument("--candidate-padding-fraction", type=float, default=0.10)
    parser.add_argument("--auto-select-min-similarity", type=float, default=1.1, help="Default 1.1 intentionally withholds every selection")
    parser.add_argument("--auto-select-min-detector-score", type=float, default=1.1, help="Default 1.1 intentionally withholds every selection")
    args = parser.parse_args()
    if args.tile_size_px < 128:
        parser.error("--tile-size-px must be >= 128")
    for name in ("tile_overlap_fraction", "global_nms_iou", "candidate_padding_fraction"):
        value = float(getattr(args, name))
        if not 0 <= value < 1:
            parser.error(f"--{name.replace('_', '-')} must be in [0, 1)")
    for name in ("detector_score_threshold", "auto_select_min_similarity", "auto_select_min_detector_score"):
        if not math.isfinite(float(getattr(args, name))):
            parser.error(f"--{name.replace('_', '-')} must be finite")
    if args.output.exists():
        parser.error(f"Refusing to overwrite existing manifest: {args.output}")
    return args


def is_bbox(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 4
        and all(not isinstance(item, bool) and isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value)
        and float(value[2]) > float(value[0])
        and float(value[3]) > float(value[1])
    )


def iou(left: list[float], right: list[float]) -> float:
    x0, y0, x1, y1 = max(left[0], right[0]), max(left[1], right[1]), min(left[2], right[2]), min(left[3], right[3])
    overlap = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    if not overlap:
        return 0.0
    return overlap / ((left[2] - left[0]) * (left[3] - left[1]) + (right[2] - right[0]) * (right[3] - right[1]) - overlap)


def tile_windows(width: int, height: int, tile_size: int, overlap: float) -> list[Tile]:
    if width < 1 or height < 1 or tile_size < 1 or not 0 <= overlap < 1:
        raise ValueError("Invalid page or tile configuration")
    stride = max(1, round(tile_size * (1 - overlap)))

    def starts(length: int) -> list[int]:
        if length <= tile_size:
            return [0]
        result = list(range(0, length - tile_size + 1, stride))
        if result[-1] != length - tile_size:
            result.append(length - tile_size)
        return result

    return [Tile(x, y, min(width, x + tile_size), min(height, y + tile_size)) for y in starts(height) for x in starts(width)]


def global_class_aware_nms(candidates: Iterable[dict[str, Any]], overlap_threshold: float) -> list[dict[str, Any]]:
    """Global, same-class-only suppression after tile bboxes become page bboxes."""
    if not 0 <= overlap_threshold <= 1:
        raise ValueError("NMS threshold must be in [0, 1]")
    by_class: dict[str, list[dict[str, Any]]] = {}
    for candidate in candidates:
        by_class.setdefault(str(candidate["detector_label"]), []).append(candidate)
    kept: list[dict[str, Any]] = []
    for label in sorted(by_class):
        class_kept: list[dict[str, Any]] = []
        for candidate in sorted(by_class[label], key=lambda item: (-float(item["detector_score"]), item["bbox_image_px"])):
            if all(iou(candidate["bbox_image_px"], existing["bbox_image_px"]) < overlap_threshold for existing in class_kept):
                class_kept.append(candidate)
        kept.extend(class_kept)
    return sorted(kept, key=lambda item: (-float(item["detector_score"]), str(item["detector_label"]), item["bbox_image_px"]))


def padded_crop(image: Image.Image, bbox: list[float], fraction: float) -> Image.Image:
    side = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    pad = side * fraction
    rect = (max(0, math.floor(bbox[0] - pad)), max(0, math.floor(bbox[1] - pad)), min(image.width, math.ceil(bbox[2] + pad)), min(image.height, math.ceil(bbox[3] + pad)))
    if rect[2] <= rect[0] or rect[3] <= rect[1]:
        raise ValueError("Empty candidate crop")
    return image.crop(rect)


def choose_candidate(candidates: list[dict[str, Any]], min_similarity: float, min_detector_score: float, tag_bbox: list[float] | None) -> str | None:
    eligible = [
        candidate for candidate in candidates
        if float(candidate["dino_similarity"]) >= min_similarity and float(candidate["detector_score"]) >= min_detector_score
        and (tag_bbox is None or iou(candidate["bbox_image_px"], tag_bbox) < 0.50)
    ]
    if not eligible:
        return None
    return max(eligible, key=lambda item: (float(item["dino_similarity"]), float(item["detector_score"]), item["candidate_id"]))["candidate_id"]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def artifact_provenance(path: Path) -> dict[str, Any]:
    """Hash exactly what was loaded, once, before any request is evaluated.

    A HF directory's config alone is not a model identity: a different set of
    weights can share that config.  Record per-file digests and an ordered
    aggregate instead.  Symlinks are refused so an evidence manifest cannot
    silently report a path outside the declared artifact.
    """
    root = path.resolve()
    if root.is_file():
        return {
            "kind": "file",
            "name": root.name,
            "bytes": root.stat().st_size,
            "sha256": sha256_file(root),
        }
    if not root.is_dir():
        raise ValueError(f"Model artifact is unavailable: {path}")
    files = sorted(item for item in root.rglob("*") if item.is_file())
    if not files:
        raise ValueError(f"Model artifact directory has no files: {path}")
    aggregate = hashlib.sha256()
    entries: list[dict[str, Any]] = []
    for item in files:
        if item.is_symlink():
            raise ValueError(f"Model artifact may not contain symlinked files: {item}")
        relative = item.relative_to(root).as_posix()
        digest = sha256_file(item)
        aggregate.update(relative.encode("utf-8"))
        aggregate.update(b"\0")
        aggregate.update(digest.encode("ascii"))
        aggregate.update(b"\0")
        entries.append({"relative_path": relative, "bytes": item.stat().st_size, "sha256": digest})
    return {"kind": "directory", "content_sha256": aggregate.hexdigest(), "files": entries}


def read_requests(path: Path, source_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        if not isinstance(row, dict) or row.get("schema") != REQUEST_SCHEMA:
            raise ValueError(f"Invalid request schema at {path}:{number}")
        if not isinstance(row.get("case_id"), str) or not isinstance(row.get("source_image_path"), str) or not row["case_id"] or not row["source_image_path"]:
            raise ValueError(f"Request at {path}:{number} needs case_id and source_image_path")
        if row["case_id"] in seen:
            raise ValueError(f"Duplicate case_id: {row['case_id']}")
        seen.add(row["case_id"])
        if not is_bbox(row.get("anchor_bbox_image_px")):
            raise ValueError(f"Request {row['case_id']} needs anchor_bbox_image_px")
        if "tag_bbox_image_px" in row and not is_bbox(row["tag_bbox_image_px"]):
            raise ValueError(f"Request {row['case_id']} has malformed tag bbox")
        source = (source_root / row["source_image_path"]).resolve()
        if source_root not in source.parents or not source.is_file():
            raise ValueError(f"Request {row['case_id']} source image unavailable or outside source root")
        rows.append(row)
    if not rows:
        raise ValueError("No requests")
    return rows


def lazy_load_models(args: argparse.Namespace) -> tuple[Any, Any, Any, Any, Any]:
    import torch
    from transformers import AutoImageProcessor, RTDetrForObjectDetection
    from training_runtime import TwinMetricNet, load_dinov2_backbone

    device = torch.device(args.device)
    if device.type == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA requested but unavailable")
    processor = AutoImageProcessor.from_pretrained(args.rtdetr_checkpoint)
    detector = RTDetrForObjectDetection.from_pretrained(args.rtdetr_checkpoint).to(device).eval()
    saved = torch.load(args.dino_checkpoint, map_location=device, weights_only=False)
    if saved.get("format") != "opentakeoff-symbol-metric-checkpoint-v1":
        raise ValueError("Unsupported DINO checkpoint")
    verifier = TwinMetricNet(load_dinov2_backbone(args.dino_hub_cache)).to(device).eval()
    verifier.load_state_dict(saved["network"])
    return torch, device, processor, detector, verifier


def detector_candidates(image: Image.Image, args: argparse.Namespace, torch: Any, device: Any, processor: Any, detector: Any) -> list[dict[str, Any]]:
    raw: list[dict[str, Any]] = []
    labels = {int(key): str(value) for key, value in detector.config.id2label.items()}
    for tile_number, tile in enumerate(tile_windows(image.width, image.height, args.tile_size_px, args.tile_overlap_fraction)):
        encoded = processor(images=image.crop((tile.x0, tile.y0, tile.x1, tile.y1)), return_tensors="pt")
        with torch.inference_mode():
            output = detector(**{key: value.to(device) for key, value in encoded.items()})
        target_sizes = torch.tensor([[tile.y1 - tile.y0, tile.x1 - tile.x0]], device=device)
        found = processor.post_process_object_detection(output, target_sizes=target_sizes, threshold=args.detector_score_threshold)[0]
        for ordinal, (score, label, box) in enumerate(zip(found["scores"], found["labels"], found["boxes"]), start=1):
            x0, y0, x1, y1 = [float(item) for item in box.tolist()]
            x0, y0, x1, y1 = max(0, x0), max(0, y0), min(tile.x1 - tile.x0, x1), min(tile.y1 - tile.y0, y1)
            if x1 <= x0 or y1 <= y0:
                continue
            label_id = int(label.item())
            raw.append({"candidate_id": f"tile{tile_number}-raw{ordinal}", "bbox_image_px": [x0 + tile.x0, y0 + tile.y0, x1 + tile.x0, y1 + tile.y0], "detector_score": float(score.item()), "detector_label": labels.get(label_id, str(label_id)), "detector_label_id": label_id, "tile_index": tile_number})
    merged = global_class_aware_nms(raw, args.global_nms_iou)
    for number, candidate in enumerate(merged, start=1):
        candidate["candidate_id"] = f"candidate-{number:05d}"
    return merged


def dino_scores(image: Image.Image, anchor_bbox: list[float], candidates: list[dict[str, Any]], padding: float, torch: Any, device: Any, verifier: Any) -> None:
    from training_runtime import tensor_from_pil

    anchor = tensor_from_pil(prepare_symbol_image(padded_crop(image, anchor_bbox, padding))).unsqueeze(0).to(device)
    with torch.inference_mode():
        anchor_embedding = verifier(anchor)
        for candidate in candidates:
            item = tensor_from_pil(prepare_symbol_image(padded_crop(image, candidate["bbox_image_px"], padding))).unsqueeze(0).to(device)
            candidate["dino_similarity"] = float((anchor_embedding * verifier(item)).sum(dim=1).item())


def prediction_for_request(
    request: dict[str, Any],
    source_root: Path,
    args: argparse.Namespace,
    models: tuple[Any, Any, Any, Any, Any],
    model_provenance: dict[str, Any],
) -> dict[str, Any]:
    torch, device, processor, detector, verifier = models
    with Image.open(source_root / request["source_image_path"]) as raw:
        image = raw.convert("RGB")
    started = time.perf_counter()
    candidates = detector_candidates(image, args, torch, device, processor, detector)
    dino_scores(image, request["anchor_bbox_image_px"], candidates, args.candidate_padding_fraction, torch, device, verifier)
    selected = choose_candidate(candidates, args.auto_select_min_similarity, args.auto_select_min_detector_score, request.get("tag_bbox_image_px"))
    candidate_fields = ("candidate_id", "bbox_image_px", "detector_score", "dino_similarity", "detector_label", "detector_label_id", "tile_index")
    return {
        "schema": PREDICTION_SCHEMA,
        "case_id": request["case_id"],
        "pipeline": {
            "detector": "RT-DETR",
            "verifier": "DINOv2-S/14 twin encoder",
            "tiled": True,
            "tile_size_px": args.tile_size_px,
            "tile_overlap_fraction": args.tile_overlap_fraction,
            "merge_method": "class_aware_global_nms",
            "global_nms_iou": args.global_nms_iou,
            "model_provenance": model_provenance,
            "selection_policy": {
                "min_dino_similarity": args.auto_select_min_similarity,
                "min_detector_score": args.auto_select_min_detector_score,
                "tag_overlap_withhold_iou": 0.50,
            },
        },
        "latency_ms": (time.perf_counter() - started) * 1000,
        "candidates": [{key: candidate[key] for key in candidate_fields} for candidate in candidates],
        "auto_selected_candidate_id": selected,
        "warning": "Visual proposals only; never a verified symbol, schedule binding, quantity, citation, or release decision.",
    }


def main() -> int:
    args = parse_args()
    root = args.source_root.resolve()
    requests = read_requests(args.requests, root)
    model_provenance = {
        "rtdetr_checkpoint": artifact_provenance(args.rtdetr_checkpoint),
        "dino_checkpoint": artifact_provenance(args.dino_checkpoint),
    }
    models = lazy_load_models(args)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as stream:
        for request in requests:
            stream.write(json.dumps(prediction_for_request(request, root, args, models, model_provenance), sort_keys=True) + "\n")
    print(json.dumps({"requests": len(requests), "output": str(args.output), "mode": "offline_visual_proposals_only"}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
