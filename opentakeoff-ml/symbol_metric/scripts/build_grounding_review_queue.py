#!/usr/bin/env python3
"""Materialize a reviewer-owned queue for real plan-symbol grounding labels.

This script intentionally creates *questions*, not ground truth. Candidate
regions may have come from a detector, a vector tag/leader search, or a manual
discovery pass, but no candidate is marked correct. A reviewer must inspect the
rendered source, select a physical body or refuse, and record their decision in
the output queue before it can be converted to a benchmark case.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw


PROPOSAL_SCHEMA = "opentakeoff.grounding_review_proposal.v1"
QUEUE_SCHEMA = "opentakeoff.grounding_review_queue.v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proposals", type=Path, required=True, help="Discovery JSONL; never reviewer ground truth")
    parser.add_argument("--source-root", type=Path, required=True, help="Root holding immutable rendered source-page PNGs")
    parser.add_argument("--output", type=Path, required=True, help="New queue directory")
    parser.add_argument("--max-per-project", type=int, default=30, help="Deterministic cap to force broad project coverage")
    parser.add_argument("--context-padding", type=float, default=2.0, help="Context crop pad in max relevant bbox sides")
    return parser.parse_args()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
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
        raise ValueError(f"No proposals in {path}")
    return rows


def is_bbox(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 4
        and all(isinstance(item, (int, float)) and math.isfinite(float(item)) for item in value)
        and float(value[2]) > float(value[0])
        and float(value[3]) > float(value[1])
    )


def validate_proposal(row: dict[str, Any], source_root: Path) -> None:
    if row.get("schema") != PROPOSAL_SCHEMA:
        raise ValueError(f"Proposal {row.get('proposal_id', '<unknown>')} has unsupported schema")
    for key in ("proposal_id", "project_id", "source_pdf_sha256", "source_image_path", "equipment_family", "tag"):
        if not isinstance(row.get(key), str) or not row[key].strip():
            raise ValueError(f"Proposal {row.get('proposal_id', '<unknown>')} needs non-empty {key}")
    source_hash = row["source_pdf_sha256"]
    if len(source_hash) != 64 or any(char not in "0123456789abcdef" for char in source_hash):
        raise ValueError(f"Proposal {row['proposal_id']} needs lowercase source PDF SHA-256")
    if not is_bbox(row.get("tag_bbox_image_px")):
        raise ValueError(f"Proposal {row['proposal_id']} needs an exact printed tag bbox")
    candidates = row.get("candidate_regions")
    if not isinstance(candidates, list):
        raise ValueError(f"Proposal {row['proposal_id']} needs candidate_regions (may be empty)")
    candidate_ids: set[str] = set()
    for candidate in candidates:
        if not isinstance(candidate, dict) or not isinstance(candidate.get("candidate_id"), str) or not candidate["candidate_id"]:
            raise ValueError(f"Proposal {row['proposal_id']} has malformed candidate")
        if candidate["candidate_id"] in candidate_ids:
            raise ValueError(f"Proposal {row['proposal_id']} repeats candidate {candidate['candidate_id']}")
        candidate_ids.add(candidate["candidate_id"])
        if not is_bbox(candidate.get("bbox_image_px")):
            raise ValueError(f"Proposal {row['proposal_id']} candidate {candidate['candidate_id']} has invalid bbox")
    path = (source_root / row["source_image_path"]).resolve()
    if source_root.resolve() not in path.parents or not path.is_file():
        raise ValueError(f"Proposal {row['proposal_id']} source image is missing or outside source root")


def stable_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def union_bbox(boxes: list[list[float] | list[int]]) -> list[float]:
    return [min(float(box[0]) for box in boxes), min(float(box[1]) for box in boxes), max(float(box[2]) for box in boxes), max(float(box[3]) for box in boxes)]


def padded_crop(bbox: list[float], width: int, height: int, multiplier: float) -> list[int]:
    side = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
    padding = side * multiplier
    return [
        max(0, math.floor(bbox[0] - padding)),
        max(0, math.floor(bbox[1] - padding)),
        min(width, math.ceil(bbox[2] + padding)),
        min(height, math.ceil(bbox[3] + padding)),
    ]


def _relative(box: list[float] | list[int], crop: list[int]) -> tuple[int, int, int, int]:
    # A crop has one x/y origin.  Both x coordinates subtract crop[0] and
    # both y coordinates subtract crop[1]; subtracting crop's right/bottom
    # edge would invert otherwise valid review rectangles.
    return (
        round(float(box[0]) - crop[0]),
        round(float(box[1]) - crop[1]),
        round(float(box[2]) - crop[0]),
        round(float(box[3]) - crop[1]),
    )


def render_packet(source_path: Path, tag_bbox: list[float] | list[int], candidates: list[dict[str, Any]], output_path: Path, padding: float) -> tuple[list[int], list[int]]:
    with Image.open(source_path) as raw:
        source = raw.convert("RGB")
    all_boxes = [tag_bbox, *[candidate["bbox_image_px"] for candidate in candidates]]
    crop = padded_crop(union_bbox(all_boxes), source.width, source.height, padding)
    image = source.crop(tuple(crop))
    draw = ImageDraw.Draw(image)
    tag = _relative(tag_bbox, crop)
    draw.rectangle(tag, outline="#d97706", width=max(2, round(min(image.size) / 250)))
    draw.text((tag[0], max(0, tag[1] - 18)), "TAG", fill="#d97706", stroke_width=1, stroke_fill="white")
    for index, candidate in enumerate(candidates, start=1):
        box = _relative(candidate["bbox_image_px"], crop)
        draw.rectangle(box, outline="#1d4ed8", width=max(2, round(min(image.size) / 250)))
        draw.text((box[0], max(0, box[1] - 18)), str(index), fill="#1d4ed8", stroke_width=1, stroke_fill="white")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, quality=95)
    return crop, list(image.size)


def build_queue(proposals: list[dict[str, Any]], source_root: Path, output: Path, max_per_project: int, padding: float) -> list[dict[str, Any]]:
    if max_per_project < 1:
        raise ValueError("--max-per-project must be positive")
    if padding < 0:
        raise ValueError("--context-padding must be non-negative")
    if output.exists() and any(output.iterdir()):
        raise ValueError(f"Refusing to overwrite non-empty queue output {output}")
    for proposal in proposals:
        validate_proposal(proposal, source_root)
    by_project: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for proposal in proposals:
        by_project[proposal["project_id"]].append(proposal)
    selected: list[dict[str, Any]] = []
    for project_id, rows in sorted(by_project.items()):
        selected.extend(sorted(rows, key=lambda row: stable_key(row["proposal_id"]))[:max_per_project])
    output.mkdir(parents=True, exist_ok=False)
    queue: list[dict[str, Any]] = []
    seen: set[str] = set()
    for proposal in sorted(selected, key=lambda row: (row["project_id"], stable_key(row["proposal_id"]))):
        if proposal["proposal_id"] in seen:
            raise ValueError(f"Duplicate proposal ID: {proposal['proposal_id']}")
        seen.add(proposal["proposal_id"])
        png_path = output / "packets" / f"{proposal['proposal_id']}.png"
        crop, packet_size = render_packet(
            source_root / proposal["source_image_path"],
            proposal["tag_bbox_image_px"],
            proposal["candidate_regions"],
            png_path,
            padding,
        )
        queue.append({
            "schema": QUEUE_SCHEMA,
            "proposal_id": proposal["proposal_id"],
            "project_id": proposal["project_id"],
            "source_pdf_sha256": proposal["source_pdf_sha256"],
            "source_image_path": proposal["source_image_path"],
            "equipment_family": proposal["equipment_family"],
            "tag": proposal["tag"],
            "tag_bbox_image_px": proposal["tag_bbox_image_px"],
            "candidate_regions": proposal["candidate_regions"],
            "packet_image_path": str(png_path.relative_to(output)),
            "packet_source_crop_image_px": crop,
            "packet_size_px": packet_size,
            "review_status": "needs_independent_human_review",
            "review_decision": {
                "expected_outcome": None,
                "accepted_candidate_id": None,
                "accepted_physical_symbol_bbox_image_px": None,
                "prohibited_candidate_ids": [],
                "reviewer_id": None,
                "reviewed_at": None,
                "review_note": None,
            },
            "warning": "Candidate numbering is for inspection only. No candidate is labeled correct; this record is not benchmark ground truth until independently reviewed.",
        })
    with (output / "review_queue.jsonl").open("w", encoding="utf-8") as stream:
        for row in queue:
            stream.write(json.dumps(row, sort_keys=True) + "\n")
    (output / "REVIEW_INSTRUCTIONS.md").write_text(
        "# Independent grounding review\n\n"
        "Each numbered blue box is a candidate, not an answer. The orange rectangle is the exact printed tag, not physical equipment. "
        "Open the complete rendered source page before deciding. Select the full physical body only when the drawing establishes its ownership; otherwise record `unresolved` or `tag_absent`. "
        "Record nearby plausible wrong bodies as prohibited candidates. Do not use the model's score as evidence.\n",
        encoding="utf-8",
    )
    return queue


def main() -> int:
    args = parse_args()
    queue = build_queue(read_jsonl(args.proposals), args.source_root.resolve(), args.output.resolve(), args.max_per_project, args.context_padding)
    print(json.dumps({"queued_cases": len(queue), "projects": sorted({row['project_id'] for row in queue}), "output": str(args.output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
