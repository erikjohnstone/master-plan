#!/usr/bin/env python3
"""Select a fixed shortlist using validation diagnostics only.

This tool is deliberately unable to read a held-out test report. The caller
uses it after a broad, short screening phase, then evaluates each selected
full-length candidate exactly once on its untouched test split.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kind", choices=("dino", "rtdetr"), required=True)
    parser.add_argument("--candidate", action="append", default=[], metavar="ID=PATH", help="Repeat: a DINO metrics.jsonl or RT-DETR best_validation.json")
    parser.add_argument("--top-k", type=int, default=3)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.top_k < 1:
        parser.error("--top-k must be positive")
    if not args.candidate:
        parser.error("at least one --candidate is required")
    return args


def candidate_argument(value: str) -> tuple[str, Path]:
    identifier, separator, location = value.partition("=")
    if not separator or not identifier or not location:
        raise ValueError("--candidate must be ID=PATH")
    return identifier, Path(location)


def dino_record(path: Path) -> dict[str, Any]:
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not rows:
        raise ValueError(f"No metrics in {path}")
    return min(
        rows,
        key=lambda row: (
            float(row["validation"]["loss"]),
            -float(row["validation"]["same_crop_recall_at_1"]),
            int(row["epoch"]),
        ),
    )


def rtdetr_record(path: Path) -> dict[str, Any]:
    row = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(row, dict):
        raise ValueError(f"Expected object in {path}")
    return row


def score(kind: str, record: dict[str, Any]) -> tuple[float, ...]:
    if kind == "dino":
        validation = record["validation"]
        # Lower loss is the predeclared screening signal. Recall is only a
        # deterministic tiebreaker because it is same-crop health, not plan
        # grounding accuracy.
        return (-float(validation["loss"]), float(validation["same_crop_recall_at_1"]))
    return (float(record["val_map"]), float(record["val_map50"]))


def select(kind: str, candidates: list[tuple[str, Path]], top_k: int) -> dict[str, Any]:
    ranked: list[dict[str, Any]] = []
    for identifier, path in candidates:
        record = dino_record(path) if kind == "dino" else rtdetr_record(path)
        ranked.append({"id": identifier, "validation_path": str(path), "score": score(kind, record), "record": record})
    ranked.sort(key=lambda row: tuple(row["score"]), reverse=True)
    return {
        "schema": "opentakeoff.validation_only_model_shortlist.v1",
        "kind": kind,
        "selection_metric": (
            ["lowest_validation_loss", "same_crop_recall_at_1_tiebreak"]
            if kind == "dino" else ["validation_coco_map", "validation_coco_map50_tiebreak"]
        ),
        "ranked": ranked,
        "selected_ids": [row["id"] for row in ranked[:top_k]],
        "decision": "validation_shortlist_only",
        "warning": "No held-out test artifact was read. This only chooses candidates for a single later test evaluation; it does not establish production accuracy.",
    }


def main() -> int:
    args = parse_args()
    candidates = [candidate_argument(value) for value in args.candidate]
    result = select(args.kind, candidates, args.top_k)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
