#!/usr/bin/env python3
"""Rank controlled DINO or RT-DETR diagnostic artifacts without release claims."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("dino", "rtdetr"), required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--candidate", action="append", default=[], metavar="ID=PATH", help="Repeat for each successful candidate")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"Expected an object in {path}")
    return value


def number_at(row: dict[str, Any], *keys: str) -> float:
    value: Any = row
    for key in keys:
        value = value[key]
    if not isinstance(value, (int, float)):
        raise ValueError(f"Expected numeric {'.'.join(keys)}")
    return float(value)


def candidate_argument(value: str) -> tuple[str, Path]:
    identifier, separator, location = value.partition("=")
    if not separator or not identifier or not location:
        raise ValueError("--candidate must be ID=PATH")
    return identifier, Path(location)


def score(kind: str, row: dict[str, Any]) -> tuple[float, ...]:
    if kind == "dino":
        return (
            number_at(row, "weak_source_label_recall_at_1"),
            number_at(row, "weak_source_label_recall_at_5"),
            number_at(row, "mean_two_view_cosine"),
        )
    return (number_at(row, "test", "map"), number_at(row, "test", "map50"))


def compare(kind: str, baseline: dict[str, Any], candidates: list[tuple[str, dict[str, Any]]]) -> dict[str, Any]:
    baseline_score = score(kind, baseline)
    rows = [{"id": "baseline", "score": baseline_score, "source": "frozen_control"}]
    for identifier, record in candidates:
        rows.append({"id": identifier, "score": score(kind, record), "source": "candidate"})
    ordered = sorted(rows, key=lambda row: tuple(row["score"]), reverse=True)
    winner = ordered[0]
    return {
        "schema": "opentakeoff.model_diagnostic_ranking.v1",
        "kind": kind,
        "ranking_metric": (
            ["weak_source_label_recall_at_1", "weak_source_label_recall_at_5", "mean_two_view_cosine"]
            if kind == "dino" else ["held_out_coco_map", "held_out_coco_map50"]
        ),
        "frozen_control_score": baseline_score,
        "ranked": ordered,
        "winner": winner["id"],
        "decision": "diagnostic_best_not_promotable",
        "warning": (
            "The ranking uses weak source-label retrieval / augmentation consistency and does not establish real plan grounding."
            if kind == "dino" else
            "The ranking uses one narrow held-out COCO pack and does not establish full-sheet HVAC/BAS grounding, count accuracy, or project-level generalization."
        ),
    }


def main() -> int:
    args = parse_args()
    baseline = read_json(args.baseline)
    candidates = [(identifier, read_json(path)) for identifier, path in (candidate_argument(value) for value in args.candidate)]
    result = compare(args.kind, baseline, candidates)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
