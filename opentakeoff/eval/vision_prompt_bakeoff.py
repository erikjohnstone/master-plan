#!/usr/bin/env python3
"""Offline symbol-location bakeoff for a trusted visual reference crop.

This program is deliberately outside OpenTakeoff's production path.  It does
not read or write schedules, tables, takeoff quantities, citations, bboxes, or
browser/session state.  It answers one constrained research question only:

    Given a *trusted visual reference* (normally a legend body crop), can a
    raster method propose locations of visually similar marks on a drawing?

The frozen symbol-sweep manifest is used only after inference to score the
proposals.  It is never passed to OWLv2, SIFT/FLANN, or fusion.  The manifest's
seed rectangle stands in for a separately supplied legend crop during this
offline evaluation; its own location is excluded so the query cannot count
itself as a result.

Methods:
  owl       OWLv2 image-guided detection, tiled, then global NMS.
  sift      SIFT + FLANN + iterative similarity-RANSAC hypotheses.
  fusion    only OWLv2 proposals corroborated by a compatible SIFT proposal.

No method's output is an installed quantity.  Results are review candidates,
and the report distinguishes exact frozen-ground-truth hits from a broader
visual-review radius.  This script has no dependency on VectorGrid.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence

import cv2
import numpy as np
from PIL import Image, ImageDraw


@dataclass
class Candidate:
    method: str
    bbox: list[float]  # x1, y1, x2, y2 in the frozen manifest's image space
    score: float
    verified_by_sift: bool = False
    # Present only for a diagnostic that maps the frozen source anchor through
    # a SIFT transform. It never changes a box, ranks a candidate, or creates
    # a candidate; it explains an offset between a crop's visual centre and a
    # corpus annotation anchor.
    projected_reference_anchor: list[float] | None = None
    # Full-outline agreement is measured after SIFT/RANSAC has proposed a
    # location. It is intentionally diagnostic first; no threshold is enabled
    # until it has been measured on held-out projects.
    edge_mean_distance_px: float | None = None
    edge_overlap_fraction: float | None = None

    @property
    def center(self) -> tuple[float, float]:
        return ((self.bbox[0] + self.bbox[2]) / 2, (self.bbox[1] + self.bbox[3]) / 2)

    @property
    def projected_anchor(self) -> tuple[float, float]:
        if self.projected_reference_anchor is not None:
            return tuple(self.projected_reference_anchor)
        return self.center


def require(module: str, package: str) -> None:
    try:
        __import__(module)
    except ImportError as error:
        raise SystemExit(
            f"Missing {package}. Install opentakeoff/eval/vision_prompt_requirements.txt "
            "in an isolated Python environment."
        ) from error


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--corpus-root", type=Path, required=True)
    parser.add_argument("--case", dest="case_ids", action="append", required=True,
                        help="Frozen case id; repeat for more than one case.")
    parser.add_argument("--method", choices=("owl", "sift", "fusion", "all"), default="all")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model", default="google/owlv2-base-patch16-ensemble")
    parser.add_argument("--device", default="cuda" if os.environ.get("CUDA_VISIBLE_DEVICES", "") != "" else "cpu")
    parser.add_argument("--tile-size", type=int, default=1024)
    parser.add_argument("--tile-overlap", type=float, default=0.25)
    parser.add_argument("--owl-threshold", type=float, default=0.10,
                        help="Fixed, pre-declared OWLv2 postprocess score threshold.")
    parser.add_argument("--nms-iou", type=float, default=0.50)
    parser.add_argument("--sift-ratio", type=float, default=0.72)
    parser.add_argument("--sift-min-inliers", type=int, default=4)
    parser.add_argument("--max-sift-hypotheses", type=int, default=30)
    parser.add_argument("--skip-render", action="store_true",
                        help="Use a pre-rendered PNG in --output-dir/<case-id>/page.png.")
    return parser.parse_args()


def load_case(manifest_path: Path, case_id: str) -> dict:
    payload = json.loads(manifest_path.read_text())
    for case in payload["cases"]:
        if case["id"] == case_id:
            return case
    raise SystemExit(f"Frozen case not found: {case_id}")


def render_page(case: dict, corpus_root: Path, output_path: Path) -> Image.Image:
    """Render at 144 dpi, the coordinate system used by the frozen manifest."""
    pdf = corpus_root / case["source_pdf"]
    if not pdf.is_file():
        raise SystemExit(f"Missing corpus PDF: {pdf}")
    if shutil.which("pdftoppm") is None:
        raise SystemExit("pdftoppm is required to render an evaluation page.")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    prefix = output_path.with_suffix("")
    command = [
        "pdftoppm", "-f", str(case["page"]), "-l", str(case["page"]), "-r", "144",
        "-png", "-singlefile", str(pdf), str(prefix),
    ]
    subprocess.run(command, check=True, capture_output=True, text=True)
    return Image.open(output_path).convert("RGB")


def scale_for(case: dict, image: Image.Image) -> tuple[float, float]:
    expected_w, expected_h = case["page_size_px"]
    return image.width / expected_w, image.height / expected_h


def project_rect(rect: Sequence[Sequence[float]], sx: float, sy: float) -> tuple[int, int, int, int]:
    (x1, y1), (x2, y2) = rect
    return (round(x1 * sx), round(y1 * sy), round(x2 * sx), round(y2 * sy))


def unproject_bbox(bbox: Sequence[float], sx: float, sy: float) -> list[float]:
    return [bbox[0] / sx, bbox[1] / sy, bbox[2] / sx, bbox[3] / sy]


def unproject_point(point: Sequence[float], sx: float, sy: float) -> list[float]:
    return [point[0] / sx, point[1] / sy]


def tile_positions(length: int, tile_size: int, overlap: float) -> list[int]:
    if tile_size <= 0 or not (0 <= overlap < 1):
        raise ValueError("tile_size must be positive and tile_overlap must be in [0, 1).")
    if length <= tile_size:
        return [0]
    step = max(1, round(tile_size * (1 - overlap)))
    positions = list(range(0, max(1, length - tile_size + 1), step))
    terminal = length - tile_size
    if positions[-1] != terminal:
        positions.append(terminal)
    return positions


def iter_tiles(image: Image.Image, tile_size: int, overlap: float) -> Iterable[tuple[int, int, Image.Image]]:
    for top in tile_positions(image.height, tile_size, overlap):
        for left in tile_positions(image.width, tile_size, overlap):
            yield left, top, image.crop((left, top, min(left + tile_size, image.width), min(top + tile_size, image.height)))


def iou(a: Sequence[float], b: Sequence[float]) -> float:
    left, top = max(a[0], b[0]), max(a[1], b[1])
    right, bottom = min(a[2], b[2]), min(a[3], b[3])
    intersection = max(0.0, right - left) * max(0.0, bottom - top)
    if intersection <= 0:
        return 0.0
    a_area = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    b_area = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    return intersection / max(1e-9, a_area + b_area - intersection)


def non_max_suppress(candidates: list[Candidate], threshold: float) -> list[Candidate]:
    kept: list[Candidate] = []
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        if all(iou(candidate.bbox, other.bbox) < threshold for other in kept):
            kept.append(candidate)
    return kept


def overlaps_seed(candidate: Candidate, seed: Sequence[Sequence[float]]) -> bool:
    seed_bbox = [seed[0][0], seed[0][1], seed[1][0], seed[1][1]]
    return iou(candidate.bbox, seed_bbox) >= 0.10


def owl_candidates(
    image: Image.Image,
    query: Image.Image,
    case: dict,
    args: argparse.Namespace,
) -> list[Candidate]:
    require("torch", "PyTorch")
    require("transformers", "Transformers with OWLv2 support")
    import torch
    from transformers import Owlv2ForObjectDetection, Owlv2Processor

    device = args.device
    if device.startswith("cuda") and not torch.cuda.is_available():
        raise SystemExit("--device cuda requested but CUDA is unavailable.")
    processor = Owlv2Processor.from_pretrained(args.model)
    model = Owlv2ForObjectDetection.from_pretrained(args.model).to(device).eval()
    raw: list[Candidate] = []
    for left, top, tile in iter_tiles(image, args.tile_size, args.tile_overlap):
        inputs = processor(images=tile, query_images=query, return_tensors="pt").to(device)
        with torch.inference_mode():
            outputs = model.image_guided_detection(**inputs)
        target_sizes = torch.tensor([tile.size[::-1]], device=device)
        result = processor.post_process_image_guided_detection(
            outputs=outputs, target_sizes=target_sizes, threshold=args.owl_threshold
        )[0]
        boxes = result["boxes"].detach().float().cpu().tolist()
        scores = result["scores"].detach().float().cpu().tolist()
        for box, score in zip(boxes, scores):
            raw.append(Candidate("owl", [box[0] + left, box[1] + top, box[2] + left, box[3] + top], float(score)))
    sx, sy = scale_for(case, image)
    candidates = [Candidate("owl", unproject_bbox(item.bbox, sx, sy), item.score) for item in raw]
    return [item for item in non_max_suppress(candidates, args.nms_iou) if not overlaps_seed(item, case["seed_rect"])]


def sift_tile_candidates(
    tile_rgb: np.ndarray,
    ref_gray: np.ndarray,
    left: int,
    top: int,
    reference_size: tuple[int, int],
    reference_anchor: tuple[float, float],
    ratio: float,
    min_inliers: int,
    max_hypotheses: int,
) -> list[Candidate]:
    """Find multiple similarity transforms, peeling one RANSAC explanation at a time."""
    gray = cv2.cvtColor(tile_rgb, cv2.COLOR_RGB2GRAY)
    sift = cv2.SIFT_create(nfeatures=5000, contrastThreshold=0.012, edgeThreshold=8)
    ref_points, ref_descriptors = sift.detectAndCompute(ref_gray, None)
    target_points, target_descriptors = sift.detectAndCompute(gray, None)
    if ref_descriptors is None or target_descriptors is None or len(ref_points) < min_inliers:
        return []
    reference_edges = cv2.Canny(ref_gray, 50, 150)
    target_edges = cv2.Canny(gray, 50, 150)
    matcher = cv2.FlannBasedMatcher(dict(algorithm=1, trees=5), dict(checks=64))
    pairs = matcher.knnMatch(target_descriptors, ref_descriptors, k=2)
    correspondences: list[tuple[int, int, float]] = []
    for pair in pairs:
        if len(pair) == 2 and pair[0].distance < ratio * pair[1].distance:
            correspondences.append((pair[0].queryIdx, pair[0].trainIdx, float(pair[0].distance)))
    if len(correspondences) < min_inliers:
        return []
    proposals: list[Candidate] = []
    remaining = correspondences
    source_corners = np.float32([[0, 0], [reference_size[0], 0], [reference_size[0], reference_size[1]], [0, reference_size[1]]]).reshape(-1, 1, 2)
    for _ in range(max_hypotheses):
        if len(remaining) < min_inliers:
            break
        target_xy = np.float32([target_points[target].pt for target, _, _ in remaining])
        source_xy = np.float32([ref_points[source].pt for _, source, _ in remaining])
        transform, inlier_mask = cv2.estimateAffinePartial2D(
            source_xy, target_xy, method=cv2.RANSAC, ransacReprojThreshold=3.0,
            maxIters=3000, confidence=0.995, refineIters=10,
        )
        if transform is None or inlier_mask is None:
            break
        inlier_indexes = np.flatnonzero(inlier_mask.ravel())
        if len(inlier_indexes) < min_inliers:
            break
        # A true copied mark may rotate/scale, but an arbitrary projective warp is
        # deliberately disallowed.  Keep only plausible similarity scale.
        scale = math.sqrt(transform[0, 0] ** 2 + transform[1, 0] ** 2)
        if not 0.35 <= scale <= 3.0:
            remaining = [match for index, match in enumerate(remaining) if index not in set(inlier_indexes.tolist())]
            continue
        transformed = cv2.transform(source_corners, transform).reshape(-1, 2)
        transformed_anchor = cv2.transform(
            np.float32([[reference_anchor]]).reshape(-1, 1, 2), transform
        ).reshape(-1, 2)[0]
        x1, y1 = transformed.min(axis=0)
        x2, y2 = transformed.max(axis=0)
        if x2 <= 0 or y2 <= 0 or x1 >= gray.shape[1] or y1 >= gray.shape[0]:
            remaining = [match for index, match in enumerate(remaining) if index not in set(inlier_indexes.tolist())]
            continue
        # Lower descriptor distance and more inliers raise score.  It is a rank
        # only, never a calibrated installed-quantity confidence.
        mean_distance = float(np.mean([remaining[index][2] for index in inlier_indexes]))
        score = len(inlier_indexes) / (1.0 + mean_distance)
        edge_mean_distance, edge_overlap = transformed_outline_agreement(
            reference_edges, target_edges, transform
        )
        proposals.append(Candidate(
            "sift", [float(x1 + left), float(y1 + top), float(x2 + left), float(y2 + top)], score,
            projected_reference_anchor=[float(transformed_anchor[0] + left), float(transformed_anchor[1] + top)],
            edge_mean_distance_px=edge_mean_distance,
            edge_overlap_fraction=edge_overlap,
        ))
        inlier_set = set(inlier_indexes.tolist())
        remaining = [match for index, match in enumerate(remaining) if index not in inlier_set]
    return proposals


def transformed_outline_agreement(
    reference_edges: np.ndarray, target_edges: np.ndarray, transform: np.ndarray
) -> tuple[float | None, float | None]:
    """Measure whether the *whole* reference outline agrees with the target.

    SIFT has only to explain several local keypoints. This diagnostic maps every
    reference edge through its already-found similarity transform, then asks how
    close those edges land to a target edge. It does not use labels or frozen
    ground truth and, until a project-held-out calibration exists, never rejects
    a candidate.
    """
    y_coords, x_coords = np.nonzero(reference_edges)
    if len(x_coords) == 0:
        return None, None
    reference_points = np.column_stack((x_coords, y_coords)).astype(np.float32).reshape(-1, 1, 2)
    transformed = cv2.transform(reference_points, transform).reshape(-1, 2)
    x_coords = np.rint(transformed[:, 0]).astype(int)
    y_coords = np.rint(transformed[:, 1]).astype(int)
    valid = (
        (x_coords >= 0) & (x_coords < target_edges.shape[1]) &
        (y_coords >= 0) & (y_coords < target_edges.shape[0])
    )
    if not np.any(valid):
        return None, None
    # distanceTransform measures distance to a zero pixel, therefore target
    # edges are zeros and background is one.
    distances = cv2.distanceTransform((target_edges == 0).astype(np.uint8), cv2.DIST_L2, 3)
    measured = distances[y_coords[valid], x_coords[valid]]
    return float(np.mean(measured)), float(np.mean(measured <= 1.5))


def sift_candidates(image: Image.Image, case: dict, args: argparse.Namespace) -> list[Candidate]:
    sx, sy = scale_for(case, image)
    query_rect = project_rect(case["seed_rect"], sx, sy)
    query = image.crop(query_rect)
    # The seed rectangle is an image crop, not necessarily centred on the
    # corpus's logical mark anchor. This is only emitted as a diagnostic after
    # a candidate exists. It is not used to generate, select, score, or rank a
    # visual proposal in the production sense.
    reference_anchor = (
        case["seed"]["at"][0] * sx - query_rect[0],
        case["seed"]["at"][1] * sy - query_rect[1],
    )
    ref_gray = cv2.cvtColor(np.asarray(query), cv2.COLOR_RGB2GRAY)
    raw: list[Candidate] = []
    for left, top, tile in iter_tiles(image, args.tile_size, args.tile_overlap):
        raw.extend(sift_tile_candidates(
            np.asarray(tile), ref_gray, left, top, query.size, reference_anchor, args.sift_ratio,
            args.sift_min_inliers, args.max_sift_hypotheses,
        ))
    candidates = [Candidate(
        "sift", unproject_bbox(item.bbox, sx, sy), item.score,
        projected_reference_anchor=unproject_point(item.projected_reference_anchor, sx, sy)
        if item.projected_reference_anchor is not None else None,
    ) for item in raw]
    return [item for item in non_max_suppress(candidates, args.nms_iou) if not overlaps_seed(item, case["seed_rect"])]


def compatible(a: Candidate, b: Candidate) -> bool:
    if iou(a.bbox, b.bbox) >= 0.10:
        return True
    ax, ay = a.center
    bx, by = b.center
    a_diag = math.hypot(a.bbox[2] - a.bbox[0], a.bbox[3] - a.bbox[1])
    b_diag = math.hypot(b.bbox[2] - b.bbox[0], b.bbox[3] - b.bbox[1])
    return math.dist((ax, ay), (bx, by)) <= 0.40 * max(a_diag, b_diag, 1.0)


def fusion_candidates(owl: list[Candidate], sift: list[Candidate]) -> list[Candidate]:
    results: list[Candidate] = []
    for proposal in owl:
        corroborators = [other for other in sift if compatible(proposal, other)]
        if not corroborators:
            continue
        best = max(corroborators, key=lambda item: item.score)
        results.append(Candidate("fusion", proposal.bbox, proposal.score + min(1.0, best.score / 10.0), True))
    return results


def evaluate(candidates: list[Candidate], instances: list[dict], radius: float, use_projected_anchor: bool = False) -> dict:
    """Greedy one-to-one matching. Scores cannot be inflated by duplicate boxes."""
    unmatched = set(range(len(instances)))
    hits: list[dict] = []
    false_positives: list[dict] = []
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        cx, cy = candidate.projected_anchor if use_projected_anchor else candidate.center
        nearby = [
            (math.dist((cx, cy), tuple(instances[index]["at"])), index)
            for index in unmatched
            if math.dist((cx, cy), tuple(instances[index]["at"])) <= radius
        ]
        if not nearby:
            false_positives.append(asdict(candidate))
            continue
        distance, instance_index = min(nearby)
        unmatched.remove(instance_index)
        hits.append({"candidate": asdict(candidate), "instance_id": instances[instance_index]["id"], "distance_px": distance})
    precision = len(hits) / len(candidates) if candidates else 0.0
    recall = len(hits) / len(instances) if instances else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "hits": len(hits), "expected": len(instances), "false_positives": len(false_positives),
        "precision": precision, "recall": recall, "f1": f1,
        "unmatched_instance_ids": [instances[index]["id"] for index in sorted(unmatched)],
        "matched": hits, "false_positive_candidates": false_positives,
    }


def draw_overlay(image: Image.Image, case: dict, method: str, candidates: list[Candidate], output: Path) -> None:
    sx, sy = scale_for(case, image)
    drawing = ImageDraw.Draw(image.copy())
    colors = {"owl": "#845ef7", "sift": "#0b7285", "fusion": "#2f9e44"}
    color = colors[method]
    seed = project_rect(case["seed_rect"], sx, sy)
    drawing.rectangle(seed, outline="#f08c00", width=5)
    for candidate in candidates:
        x1, y1, x2, y2 = candidate.bbox
        drawing.rectangle((round(x1 * sx), round(y1 * sy), round(x2 * sx), round(y2 * sy)), outline=color, width=4)
    image.copy().save(output)  # preserve source in separate output below
    canvas = image.copy()
    drawing = ImageDraw.Draw(canvas)
    drawing.rectangle(seed, outline="#f08c00", width=5)
    for candidate in candidates:
        x1, y1, x2, y2 = candidate.bbox
        drawing.rectangle((round(x1 * sx), round(y1 * sy), round(x2 * sx), round(y2 * sy)), outline=color, width=4)
    canvas.save(output)


def run_case(case: dict, args: argparse.Namespace) -> dict:
    case_dir = args.output_dir / case["id"]
    case_dir.mkdir(parents=True, exist_ok=True)
    page_path = case_dir / "page.png"
    if args.skip_render:
        if not page_path.is_file():
            raise SystemExit(f"--skip-render needs {page_path}")
        image = Image.open(page_path).convert("RGB")
    else:
        image = render_page(case, args.corpus_root, page_path)
    sx, sy = scale_for(case, image)
    query = image.crop(project_rect(case["seed_rect"], sx, sy))
    query.save(case_dir / "trusted-reference.png")
    methods = ("owl", "sift", "fusion") if args.method == "all" else (args.method,)
    results: dict[str, list[Candidate]] = {}
    if "owl" in methods or "fusion" in methods:
        results["owl"] = owl_candidates(image, query, case, args)
    if "sift" in methods or "fusion" in methods:
        results["sift"] = sift_candidates(image, case, args)
    if "fusion" in methods:
        results["fusion"] = fusion_candidates(results["owl"], results["sift"])
    expected = case["instances"]
    seed_width = case["seed_rect"][1][0] - case["seed_rect"][0][0]
    seed_height = case["seed_rect"][1][1] - case["seed_rect"][0][1]
    review_radius = math.hypot(seed_width, seed_height) / 2
    report: dict[str, object] = {
        "case_id": case["id"], "source_pdf": case["source_pdf"], "page": case["page"],
        "image_size": list(image.size), "expected_instances": len(expected),
        "reference": {"source": "frozen seed_rect (offline legend surrogate)", "rect": case["seed_rect"], "image": "trusted-reference.png"},
        "parameters": {
            "owl_threshold": args.owl_threshold, "nms_iou": args.nms_iou, "tile_size": args.tile_size,
            "tile_overlap": args.tile_overlap, "sift_ratio": args.sift_ratio,
            "sift_min_inliers": args.sift_min_inliers,
        },
        "disclosure": "Candidate locations only. No result is a count, tag match, schedule conclusion, or installed quantity.",
        "methods": {},
    }
    for method, candidates in results.items():
        strict_radius = max(float(item.get("tolerance_px", 0)) for item in expected)
        # The primary strict metric is the frozen spatial tolerance. For mixed
        # tolerance cases the scorer below reruns per-instance matching at the
        # maximum only as a diagnostics measure; per-instance exact matches are
        # recorded separately in `frozen_exact`.
        frozen_exact = evaluate_per_instance_tolerance(candidates, expected)
        anchor_diagnostic = evaluate_per_instance_tolerance(candidates, expected, use_projected_anchor=True)
        report["methods"][method] = {
            "candidate_count": len(candidates),
            "frozen_exact": frozen_exact,
            "reference_anchor_diagnostic": {
                "disclosure": "Diagnostic only: projects the frozen source anchor through a SIFT transform after proposal generation. It is not a model output and is never a takeoff/count metric.",
                **anchor_diagnostic,
            },
            "visual_review_radius_px": review_radius,
            "visual_review": evaluate(candidates, expected, review_radius),
            "outline_verification": outline_verification_summary(candidates),
            "candidates": [asdict(candidate) for candidate in candidates],
        }
        draw_overlay(image, case, method, candidates, case_dir / f"{method}-overlay.png")
    (case_dir / "result.json").write_text(json.dumps(report, indent=2))
    return report


def outline_verification_summary(candidates: list[Candidate]) -> dict:
    """Report, do not filter: calibration must use held-out projects."""
    distances = [item.edge_mean_distance_px for item in candidates if item.edge_mean_distance_px is not None]
    overlaps = [item.edge_overlap_fraction for item in candidates if item.edge_overlap_fraction is not None]
    return {
        "disclosure": "Measured after SIFT proposal generation. No outline threshold filters candidates in this bakeoff run.",
        "candidates_measured": len(distances),
        "mean_edge_distance_px": float(np.mean(distances)) if distances else None,
        "mean_edge_overlap_fraction": float(np.mean(overlaps)) if overlaps else None,
    }


def evaluate_per_instance_tolerance(candidates: list[Candidate], instances: list[dict], use_projected_anchor: bool = False) -> dict:
    unmatched = set(range(len(instances)))
    hits: list[dict] = []
    false_positives: list[dict] = []
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        cx, cy = candidate.projected_anchor if use_projected_anchor else candidate.center
        nearby = [
            (math.dist((cx, cy), tuple(instances[index]["at"])), index)
            for index in unmatched
            if math.dist((cx, cy), tuple(instances[index]["at"])) <= float(instances[index]["tolerance_px"])
        ]
        if not nearby:
            false_positives.append(asdict(candidate))
            continue
        distance, instance_index = min(nearby)
        unmatched.remove(instance_index)
        hits.append({"candidate": asdict(candidate), "instance_id": instances[instance_index]["id"], "distance_px": distance})
    precision = len(hits) / len(candidates) if candidates else 0.0
    recall = len(hits) / len(instances) if instances else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "hits": len(hits), "expected": len(instances), "false_positives": len(false_positives),
        "precision": precision, "recall": recall, "f1": f1,
        "unmatched_instance_ids": [instances[index]["id"] for index in sorted(unmatched)],
        "matched": hits, "false_positive_candidates": false_positives,
    }


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    summary: list[dict] = []
    for case_id in args.case_ids:
        print(f"Running visual-reference bakeoff: {case_id}", flush=True)
        report = run_case(load_case(args.manifest, case_id), args)
        summary.append(report)
        for method, result in report["methods"].items():
            exact = result["frozen_exact"]
            review = result["visual_review"]
            print(
                f"  {method}: {exact['hits']}/{exact['expected']} frozen-exact; "
                f"{review['hits']}/{review['expected']} visual-review; {result['candidate_count']} proposals",
                flush=True,
            )
    (args.output_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
