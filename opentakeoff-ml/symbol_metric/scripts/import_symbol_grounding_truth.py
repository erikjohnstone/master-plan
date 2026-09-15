#!/usr/bin/env python3
"""Convert reviewer-owned OpenTakeoff tag-to-body truth into benchmark JSONL.

This importer makes no visual judgement.  It only transports independently
reviewed truth from ``opentakeoff.symbol_grounding_ground_truth.v1/v2`` into
the line-oriented project-grounding benchmark schema.  It intentionally marks
full-sheet negative coverage false: a case-level prohibited box is not proof
that every full-sheet wrong candidate has been reviewed.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from project_grounding_benchmark import CASE_SCHEMA, REVIEW_STATUS


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--truth-dir", type=Path, required=True, help="Directory containing manifest.json and tag-to-body JSON")
    parser.add_argument("--output", type=Path, required=True, help="New benchmark JSONL file")
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"Invalid JSON at {path}: {error.msg}") from error
    if not isinstance(result, dict):
        raise ValueError(f"Expected object in {path}")
    return result


def import_truth(truth_dir: Path) -> list[dict[str, Any]]:
    manifest_path = truth_dir / "manifest.json"
    manifest = read_json(manifest_path)
    documents = manifest.get("documents")
    if not isinstance(documents, list) or not documents:
        raise ValueError(f"{manifest_path} needs a non-empty documents list")
    output: list[dict[str, Any]] = []
    case_ids: set[str] = set()
    for document_entry in documents:
        if not isinstance(document_entry, dict):
            raise ValueError("Grounding manifest has a malformed document entry")
        truth_file = document_entry.get("truth_file")
        project_id = document_entry.get("project_id")
        split = document_entry.get("split")
        if not isinstance(truth_file, str) or not truth_file or not isinstance(project_id, str) or not project_id:
            raise ValueError("Each grounding manifest document needs truth_file and project_id")
        document = read_json(truth_dir / truth_file)
        if document.get("schema") not in {
            "opentakeoff.symbol_grounding_ground_truth.v1",
            "opentakeoff.symbol_grounding_ground_truth.v2",
        }:
            raise ValueError(f"{truth_file} has unsupported ground truth schema")
        if document.get("coordinate_space") != "session_render_image_px":
            raise ValueError(f"{truth_file} has an unsupported coordinate space")
        source_hash = document.get("source_sha256")
        cases = document.get("cases")
        review = document.get("review")
        if not isinstance(source_hash, str) or not isinstance(cases, list) or not isinstance(review, dict):
            raise ValueError(f"{truth_file} is missing source hash, cases, or review")
        if review.get("status") != REVIEW_STATUS:
            raise ValueError(f"{truth_file} is not marked as independently reviewed")
        for index, source_case in enumerate(cases):
            if not isinstance(source_case, dict):
                raise ValueError(f"{truth_file} contains a malformed case")
            outcome = source_case.get("expected_outcome", "grounded")
            tag = source_case.get("tag")
            if not isinstance(tag, str) or not tag:
                raise ValueError(f"{truth_file} case {index} lacks tag")
            page = source_case.get("pdf_page", "no-page")
            case_id = f"{project_id}:{page}:{tag}:{index + 1}"
            if case_id in case_ids:
                raise ValueError(f"Duplicate imported benchmark case ID: {case_id}")
            case_ids.add(case_id)
            converted: dict[str, Any] = {
                "schema": CASE_SCHEMA,
                "case_id": case_id,
                "project_id": project_id,
                "split": split,
                "source_pdf_sha256": source_hash,
                "review_status": REVIEW_STATUS,
                "coordinate_space": "session_render_image_px",
                "equipment_family": source_case.get("equipment_family", "UNSPECIFIED"),
                "tag": tag,
                "expected_outcome": outcome,
                "prohibited_false_symbol_bboxes_image_px": source_case.get("prohibited_false_symbol_bboxes_image_px", []),
                "coverage": {"full_sheet_negative_reviewed": False},
                "source_truth_file": truth_file,
                "source_truth_case_index": index,
                "review_note": source_case.get("review_note", ""),
            }
            for key in (
                "sheet",
                "pdf_page",
                "prefer_schedule_title",
                "expected_semantic_method",
                "tag_bbox_image_px",
                "expected_symbol_bbox_image_px",
            ):
                if key in source_case:
                    converted[key] = source_case[key]
            output.append(converted)
    return output


def main() -> int:
    args = parse_args()
    rows = import_truth(args.truth_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row, sort_keys=True) + "\n")
    print(json.dumps({"imported_cases": len(rows), "output": str(args.output)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
