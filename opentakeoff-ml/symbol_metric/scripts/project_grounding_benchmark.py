#!/usr/bin/env python3
"""Evaluate the *cascade* on human-reviewed, project-held-out grounding cases.

This is deliberately an offline acceptance harness.  It reads a reviewer-owned
manifest and a model-output manifest.  It neither calls OpenTakeoff's shared
pipeline nor writes a takeoff.  A prediction is only a proposal until a human
approves it in the product.

The evaluator measures a narrow but essential question that generic detector
mAP cannot answer: given a schedule/tag/legend context and detector proposals,
did the cascade select the independently reviewed physical body rather than a
tag box, a nearby device, a clearance envelope, or an intentionally unresolved
row?  It is intentionally strict about source-project splits and review
provenance, and intentionally refuses to call a partially annotated benchmark
"production ready".

Input format (one JSON object per line)
------------------------------------------

``cases.jsonl`` is authored by a reviewer, never by the model:

    {
      "schema": "opentakeoff.project_grounding_case.v1",
      "case_id": "baker:EF-1",
      "project_id": "baker-county-eoc",
      "split": "held_out",
      "source_pdf_sha256": "...64 hex chars...",
      "review_status": "human_reviewed_positive_and_negative_controls",
      "coordinate_space": "session_render_image_px",
      "equipment_family": "EXHAUST FAN",
      "tag": "EF-1",
      "tag_bbox_image_px": [x0, y0, x1, y1],
      "expected_outcome": "grounded",
      "expected_symbol_bbox_image_px": [x0, y0, x1, y1],
      "prohibited_false_symbol_bboxes_image_px": [[...]],
      "coverage": {"full_sheet_negative_reviewed": false}
    }

``predictions.jsonl`` is emitted by the proposed RT-DETR -> DINO cascade for
the same case IDs:

    {
      "schema": "opentakeoff.project_grounding_prediction.v1",
      "case_id": "baker:EF-1",
      "pipeline": {"detector": "rtdetr", "verifier": "dinov2", "tiled": true,
                   "tile_size_px": 1024, "tile_overlap_fraction": 0.2,
                   "merge_method": "class_aware_global_nmm"},
      "latency_ms": 123.4,
      "candidates": [
        {"candidate_id": "a", "bbox_image_px": [...], "detector_score": 0.9,
         "dino_similarity": 0.7}
      ],
      "auto_selected_candidate_id": "a"
    }

The candidate list must contain *all* candidates considered for that reviewed
case; otherwise the DINO rank and duplicate metrics are meaningless.  A model
may leave ``auto_selected_candidate_id`` null.  The evaluator never fills it
in or turns a detection into an accepted installed quantity.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable


CASE_SCHEMA = "opentakeoff.project_grounding_case.v1"
PREDICTION_SCHEMA = "opentakeoff.project_grounding_prediction.v1"
VALID_SPLITS = frozenset({"development", "held_out"})
VALID_OUTCOMES = frozenset({"grounded", "unresolved", "tag_absent"})
REVIEW_STATUS = "human_reviewed_positive_and_negative_controls"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cases", type=Path, required=True, help="Reviewer-owned JSONL manifest")
    parser.add_argument("--predictions", type=Path, required=True, help="Cascade JSONL output")
    parser.add_argument("--output", type=Path, required=True, help="Result JSON path")
    parser.add_argument("--min-cases", type=int, default=200, help="Minimum reviewed real-PDF cases for eligibility")
    parser.add_argument("--min-projects", type=int, default=10, help="Minimum independently held-out projects")
    parser.add_argument("--positive-iou", type=float, default=0.50, help="IoU required to call a detector candidate positive")
    parser.add_argument("--strict-iou", type=float, default=0.75, help="Strict localization IoU")
    parser.add_argument("--selection-threshold", type=float, default=0.0, help="DINO score below this must not auto-select")
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        raise ValueError(f"Missing JSONL file: {path}")
    rows: list[dict[str, Any]] = []
    with path.open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, start=1):
            if not line.strip():
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"Invalid JSON at {path}:{line_number}: {error.msg}") from error
            if not isinstance(value, dict):
                raise ValueError(f"Expected object at {path}:{line_number}")
            rows.append(value)
    if not rows:
        raise ValueError(f"No records in {path}")
    return rows


def is_bbox(value: Any) -> bool:
    if not isinstance(value, list) or len(value) != 4:
        return False
    if not all(isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value):
        return False
    return float(value[2]) > float(value[0]) and float(value[3]) > float(value[1])


def iou(left: list[float] | list[int], right: list[float] | list[int]) -> float:
    """Intersection over union in one explicitly shared image coordinate system."""
    x0 = max(float(left[0]), float(right[0]))
    y0 = max(float(left[1]), float(right[1]))
    x1 = min(float(left[2]), float(right[2]))
    y1 = min(float(left[3]), float(right[3]))
    intersection = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    if intersection <= 0:
        return 0.0
    left_area = (float(left[2]) - float(left[0])) * (float(left[3]) - float(left[1]))
    right_area = (float(right[2]) - float(right[0])) * (float(right[3]) - float(right[1]))
    return intersection / (left_area + right_area - intersection)


def _require_text(row: dict[str, Any], key: str, label: str) -> None:
    if not isinstance(row.get(key), str) or not row[key].strip():
        raise ValueError(f"{label} requires non-empty {key}")


def validate_case(row: dict[str, Any]) -> None:
    if row.get("schema") != CASE_SCHEMA:
        raise ValueError(f"Case {row.get('case_id', '<unknown>')} has unsupported schema")
    for key in ("case_id", "project_id", "source_pdf_sha256", "equipment_family", "tag"):
        _require_text(row, key, f"Case {row.get('case_id', '<unknown>')}")
    if row.get("split") not in VALID_SPLITS:
        raise ValueError(f"Case {row['case_id']} has invalid split")
    if len(row["source_pdf_sha256"]) != 64 or any(char not in "0123456789abcdef" for char in row["source_pdf_sha256"]):
        raise ValueError(f"Case {row['case_id']} must carry a lowercase source PDF SHA-256")
    if row.get("review_status") != REVIEW_STATUS:
        raise ValueError(f"Case {row['case_id']} is not independently human reviewed")
    if row.get("coordinate_space") != "session_render_image_px":
        raise ValueError(f"Case {row['case_id']} has an unsupported coordinate space")
    if row.get("expected_outcome") not in VALID_OUTCOMES:
        raise ValueError(f"Case {row['case_id']} has invalid expected_outcome")
    outcome = row["expected_outcome"]
    if outcome == "grounded":
        if not is_bbox(row.get("tag_bbox_image_px")) or not is_bbox(row.get("expected_symbol_bbox_image_px")):
            raise ValueError(f"Grounded case {row['case_id']} needs tag and physical-symbol bboxes")
        if row["tag_bbox_image_px"] == row["expected_symbol_bbox_image_px"]:
            raise ValueError(f"Grounded case {row['case_id']} illegally uses its tag box as its physical symbol")
    elif "expected_symbol_bbox_image_px" in row:
        raise ValueError(f"Refusal case {row['case_id']} must not include an accepted physical-symbol bbox")
    prohibited = row.get("prohibited_false_symbol_bboxes_image_px", [])
    if not isinstance(prohibited, list) or not all(is_bbox(box) for box in prohibited):
        raise ValueError(f"Case {row['case_id']} has malformed prohibited false-symbol bboxes")
    coverage = row.get("coverage", {})
    if not isinstance(coverage, dict) or not isinstance(coverage.get("full_sheet_negative_reviewed", False), bool):
        raise ValueError(f"Case {row['case_id']} has malformed coverage")


def validate_prediction(row: dict[str, Any]) -> None:
    if row.get("schema") != PREDICTION_SCHEMA:
        raise ValueError(f"Prediction {row.get('case_id', '<unknown>')} has unsupported schema")
    _require_text(row, "case_id", "Prediction")
    if not isinstance(row.get("pipeline"), dict):
        raise ValueError(f"Prediction {row['case_id']} lacks pipeline metadata")
    pipeline = row["pipeline"]
    for key in ("detector", "verifier", "merge_method"):
        _require_text(pipeline, key, f"Prediction {row['case_id']} pipeline")
    if pipeline.get("tiled") is not True:
        raise ValueError(f"Prediction {row['case_id']} is not explicitly tiled")
    if not isinstance(pipeline.get("tile_size_px"), int) or pipeline["tile_size_px"] < 128:
        raise ValueError(f"Prediction {row['case_id']} has invalid tile size")
    overlap = pipeline.get("tile_overlap_fraction")
    if not isinstance(overlap, (int, float)) or not 0 < float(overlap) < 1:
        raise ValueError(f"Prediction {row['case_id']} has invalid tile overlap")
    if not isinstance(row.get("latency_ms"), (int, float)) or float(row["latency_ms"]) < 0:
        raise ValueError(f"Prediction {row['case_id']} has invalid latency")
    candidates = row.get("candidates")
    if not isinstance(candidates, list):
        raise ValueError(f"Prediction {row['case_id']} lacks a complete candidate list")
    seen: set[str] = set()
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise ValueError(f"Prediction {row['case_id']} has a non-object candidate")
        _require_text(candidate, "candidate_id", f"Prediction {row['case_id']} candidate")
        if candidate["candidate_id"] in seen:
            raise ValueError(f"Prediction {row['case_id']} repeats candidate {candidate['candidate_id']}")
        seen.add(candidate["candidate_id"])
        if not is_bbox(candidate.get("bbox_image_px")):
            raise ValueError(f"Prediction {row['case_id']} candidate {candidate['candidate_id']} has invalid bbox")
        for score_key in ("detector_score", "dino_similarity"):
            score = candidate.get(score_key)
            if not isinstance(score, (int, float)) or not math.isfinite(float(score)):
                raise ValueError(f"Prediction {row['case_id']} candidate {candidate['candidate_id']} lacks {score_key}")
    selected = row.get("auto_selected_candidate_id")
    if selected is not None and selected not in seen:
        raise ValueError(f"Prediction {row['case_id']} selects a candidate that was not evaluated")


def _rate(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1))
    return ordered[index]


def score(cases: Iterable[dict[str, Any]], predictions: Iterable[dict[str, Any]], positive_iou: float, strict_iou: float, selection_threshold: float, min_cases: int, min_projects: int) -> dict[str, Any]:
    if not 0 < positive_iou <= strict_iou <= 1:
        raise ValueError("IoU thresholds must satisfy 0 < positive_iou <= strict_iou <= 1")
    if not math.isfinite(selection_threshold):
        raise ValueError("selection threshold must be finite")

    cases_by_id: dict[str, dict[str, Any]] = {}
    hash_splits: dict[str, set[str]] = defaultdict(set)
    for case in cases:
        validate_case(case)
        case_id = case["case_id"]
        if case_id in cases_by_id:
            raise ValueError(f"Duplicate reviewed case ID: {case_id}")
        cases_by_id[case_id] = case
        hash_splits[case["source_pdf_sha256"]].add(case["split"])
    leaked_hashes = sorted(source_hash for source_hash, splits in hash_splits.items() if len(splits) != 1)
    if leaked_hashes:
        raise ValueError("The same source PDF appears in both development and held-out splits")

    predictions_by_id: dict[str, dict[str, Any]] = {}
    for prediction in predictions:
        validate_prediction(prediction)
        case_id = prediction["case_id"]
        if case_id not in cases_by_id:
            raise ValueError(f"Prediction references unknown review case: {case_id}")
        if case_id in predictions_by_id:
            raise ValueError(f"Duplicate prediction case ID: {case_id}")
        predictions_by_id[case_id] = prediction
    missing_predictions = sorted(set(cases_by_id) - set(predictions_by_id))
    if missing_predictions:
        raise ValueError(f"Missing predictions for {len(missing_predictions)} review cases")

    held_out = [case for case in cases_by_id.values() if case["split"] == "held_out"]
    positive_cases = [case for case in held_out if case["expected_outcome"] == "grounded"]
    refusal_cases = [case for case in held_out if case["expected_outcome"] != "grounded"]
    counters: Counter[str] = Counter()
    families: dict[str, Counter[str]] = defaultdict(Counter)
    latencies: list[float] = []
    failures: list[dict[str, Any]] = []

    for case in held_out:
        prediction = predictions_by_id[case["case_id"]]
        candidates = prediction["candidates"]
        latencies.append(float(prediction["latency_ms"]))
        selected_id = prediction.get("auto_selected_candidate_id")
        selected = next((candidate for candidate in candidates if candidate["candidate_id"] == selected_id), None)
        family = families[case["equipment_family"]]
        if case["expected_outcome"] == "grounded":
            expected = case["expected_symbol_bbox_image_px"]
            positive_candidates = [candidate for candidate in candidates if iou(candidate["bbox_image_px"], expected) >= positive_iou]
            strict_candidates = [candidate for candidate in candidates if iou(candidate["bbox_image_px"], expected) >= strict_iou]
            counters["grounded_cases"] += 1
            counters["detector_recall_at_positive_iou_hits"] += int(bool(positive_candidates))
            counters["detector_recall_at_strict_iou_hits"] += int(bool(strict_candidates))
            counters["duplicate_positive_candidates"] += max(0, len(positive_candidates) - 1)
            family["grounded_cases"] += 1
            family["detector_recall_at_positive_iou_hits"] += int(bool(positive_candidates))
            family["detector_recall_at_strict_iou_hits"] += int(bool(strict_candidates))
            top_dino = max(candidates, key=lambda candidate: float(candidate["dino_similarity"]), default=None)
            top_is_positive = bool(top_dino and iou(top_dino["bbox_image_px"], expected) >= positive_iou)
            counters["dino_top1_hits"] += int(top_is_positive)
            family["dino_top1_hits"] += int(top_is_positive)
            selected_is_positive = bool(selected and float(selected["dino_similarity"]) >= selection_threshold and iou(selected["bbox_image_px"], expected) >= positive_iou)
            counters["selected_total"] += int(selected is not None)
            counters["selected_correct"] += int(selected_is_positive)
            family["selected_total"] += int(selected is not None)
            family["selected_correct"] += int(selected_is_positive)
            if selected is not None and not selected_is_positive:
                counters["false_accepts"] += 1
                failures.append({"case_id": case["case_id"], "kind": "wrong_selected_body", "selected_candidate_id": selected_id})
            if not positive_candidates:
                failures.append({"case_id": case["case_id"], "kind": "detector_miss"})
            if not top_is_positive:
                failures.append({"case_id": case["case_id"], "kind": "dino_ranking_error"})
        else:
            counters["refusal_cases"] += 1
            if selected is not None:
                counters["selected_total"] += 1
                counters["false_accepts"] += 1
                failures.append({"case_id": case["case_id"], "kind": "false_accept_on_refusal", "selected_candidate_id": selected_id})
            else:
                counters["correct_refusals"] += 1

        if selected is not None and is_bbox(case.get("tag_bbox_image_px")) and iou(selected["bbox_image_px"], case["tag_bbox_image_px"]) >= positive_iou:
            counters["tag_box_self_verifications"] += 1
            failures.append({"case_id": case["case_id"], "kind": "selected_tag_box"})
        if selected is not None:
            for prohibited in case.get("prohibited_false_symbol_bboxes_image_px", []):
                if iou(selected["bbox_image_px"], prohibited) >= positive_iou:
                    counters["prohibited_body_false_accepts"] += 1
                    failures.append({"case_id": case["case_id"], "kind": "selected_prohibited_body", "selected_candidate_id": selected_id})
                    break

    full_sheet_reviewed = sum(bool(case.get("coverage", {}).get("full_sheet_negative_reviewed")) for case in held_out)
    held_out_projects = sorted({case["project_id"] for case in held_out})
    reviewed_projects = sorted({case["project_id"] for case in cases_by_id.values()})
    per_family = {
        family: {
            "grounded_cases": values["grounded_cases"],
            "detector_recall_at_positive_iou": _rate(values["detector_recall_at_positive_iou_hits"], values["grounded_cases"]),
            "detector_recall_at_strict_iou": _rate(values["detector_recall_at_strict_iou_hits"], values["grounded_cases"]),
            "dino_top1": _rate(values["dino_top1_hits"], values["grounded_cases"]),
            "selected_precision": _rate(values["selected_correct"], values["selected_total"]),
        }
        for family, values in sorted(families.items())
    }
    eligible = (
        len(cases_by_id) >= min_cases
        and len(reviewed_projects) >= min_projects
        and len(held_out_projects) >= min_projects
        and full_sheet_reviewed == len(held_out)
    )
    result = {
        "schema": "opentakeoff.project_grounding_evaluation.v1",
        "scope": "human-reviewed, project-held-out grounding cases only",
        "settings": {
            "positive_iou": positive_iou,
            "strict_iou": strict_iou,
            "selection_threshold": selection_threshold,
            "min_cases": min_cases,
            "min_projects": min_projects,
        },
        "coverage": {
            "reviewed_cases": len(cases_by_id),
            "reviewed_projects": len(reviewed_projects),
            "held_out_cases": len(held_out),
            "held_out_projects": len(held_out_projects),
            "full_sheet_negative_reviewed_cases": full_sheet_reviewed,
            "project_held_out": True,
        },
        "metrics": {
            "detector_recall_at_positive_iou": _rate(counters["detector_recall_at_positive_iou_hits"], counters["grounded_cases"]),
            "detector_recall_at_strict_iou": _rate(counters["detector_recall_at_strict_iou_hits"], counters["grounded_cases"]),
            "dino_top1_among_detector_candidates": _rate(counters["dino_top1_hits"], counters["grounded_cases"]),
            "selected_precision": _rate(counters["selected_correct"], counters["selected_total"]),
            "selected_count_error": counters["false_accepts"] + (counters["grounded_cases"] - counters["selected_correct"]),
            "duplicate_positive_candidates": counters["duplicate_positive_candidates"],
            "false_accepts": counters["false_accepts"],
            "prohibited_body_false_accepts": counters["prohibited_body_false_accepts"],
            "tag_box_self_verifications": counters["tag_box_self_verifications"],
            "refusal_recall": _rate(counters["correct_refusals"], counters["refusal_cases"]),
            "latency_ms_median": statistics.median(latencies) if latencies else None,
            "latency_ms_p95": _percentile(latencies, 0.95),
        },
        "per_equipment_family": per_family,
        "production_evidence_eligible": eligible,
        "production_evidence_blockers": [
            *([f"Only {len(cases_by_id)} reviewed real-PDF cases; minimum is {min_cases}."] if len(cases_by_id) < min_cases else []),
            *([f"Only {len(reviewed_projects)} reviewed projects; minimum is {min_projects}."] if len(reviewed_projects) < min_projects else []),
            *([f"Only {len(held_out_projects)} held-out projects; minimum is {min_projects}."] if len(held_out_projects) < min_projects else []),
            *(["Not every held-out case has a full-sheet negative review; false-positive rate and count error are not fully measured."] if full_sheet_reviewed != len(held_out) else []),
        ],
        "failures": failures,
        "warning": "This harness never certifies a model from mAP alone. A true production decision also requires source-hash audit, complete per-sheet negative review, a fixed cascade threshold, and human approval in the product.",
    }
    return result


def main() -> int:
    args = parse_args()
    result = score(
        read_jsonl(args.cases),
        read_jsonl(args.predictions),
        positive_iou=args.positive_iou,
        strict_iou=args.strict_iou,
        selection_threshold=args.selection_threshold,
        min_cases=args.min_cases,
        min_projects=args.min_projects,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
