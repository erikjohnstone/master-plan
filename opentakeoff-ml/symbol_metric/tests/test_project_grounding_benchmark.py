#!/usr/bin/env python3
"""Contract tests for project-grounding evaluation, with no GPU or network."""

from __future__ import annotations

import sys
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from project_grounding_benchmark import CASE_SCHEMA, PREDICTION_SCHEMA, iou, score  # noqa: E402
from import_symbol_grounding_truth import import_truth  # noqa: E402
from run_controlled_bakeoff import SCHEMA as BAKEOFF_SCHEMA, gate_decision, run  # noqa: E402
from build_grounding_review_queue import PROPOSAL_SCHEMA, build_queue  # noqa: E402


PDF_HASH = "a" * 64


def grounded_case(case_id: str = "case-1") -> dict:
    return {
        "schema": CASE_SCHEMA,
        "case_id": case_id,
        "project_id": "project-a",
        "split": "held_out",
        "source_pdf_sha256": PDF_HASH,
        "review_status": "human_reviewed_positive_and_negative_controls",
        "coordinate_space": "session_render_image_px",
        "equipment_family": "FAN COIL UNIT",
        "tag": "FCU-1",
        "tag_bbox_image_px": [0, 0, 10, 10],
        "expected_outcome": "grounded",
        "expected_symbol_bbox_image_px": [20, 20, 40, 40],
        "prohibited_false_symbol_bboxes_image_px": [[0, 0, 10, 10], [45, 20, 65, 40]],
        "coverage": {"full_sheet_negative_reviewed": True},
    }


def prediction(case_id: str = "case-1", selected: str | None = "positive") -> dict:
    return {
        "schema": PREDICTION_SCHEMA,
        "case_id": case_id,
        "pipeline": {
            "detector": "rtdetr-test",
            "verifier": "dinov2-test",
            "tiled": True,
            "tile_size_px": 1024,
            "tile_overlap_fraction": 0.2,
            "merge_method": "class_aware_global_nmm",
        },
        "latency_ms": 123.0,
        "candidates": [
            {"candidate_id": "positive", "bbox_image_px": [20, 20, 40, 40], "detector_score": 0.8, "dino_similarity": 0.9},
            {"candidate_id": "wrong", "bbox_image_px": [45, 20, 65, 40], "detector_score": 0.7, "dino_similarity": 0.2},
        ],
        "auto_selected_candidate_id": selected,
    }


class ProjectGroundingBenchmarkTest(unittest.TestCase):
    def test_iou(self) -> None:
        self.assertEqual(iou([0, 0, 10, 10], [20, 20, 30, 30]), 0)
        self.assertEqual(iou([0, 0, 10, 10], [0, 0, 10, 10]), 1)
        self.assertAlmostEqual(iou([0, 0, 10, 10], [5, 5, 15, 15]), 25 / 175)

    def test_positive_case_scores_detector_and_verifier(self) -> None:
        result = score([grounded_case()], [prediction()], 0.5, 0.75, 0.0, 1, 1)
        self.assertTrue(result["production_evidence_eligible"])
        self.assertEqual(result["metrics"]["detector_recall_at_positive_iou"], 1)
        self.assertEqual(result["metrics"]["detector_recall_at_strict_iou"], 1)
        self.assertEqual(result["metrics"]["dino_top1_among_detector_candidates"], 1)
        self.assertEqual(result["metrics"]["selected_precision"], 1)
        self.assertEqual(result["metrics"]["false_accepts"], 0)

    def test_refusal_selection_is_a_false_accept(self) -> None:
        case = grounded_case()
        case["expected_outcome"] = "tag_absent"
        del case["expected_symbol_bbox_image_px"]
        del case["tag_bbox_image_px"]
        result = score([case], [prediction()], 0.5, 0.75, 0.0, 1, 1)
        self.assertEqual(result["metrics"]["refusal_recall"], 0)
        self.assertEqual(result["metrics"]["false_accepts"], 1)

    def test_tag_box_selection_is_exposed(self) -> None:
        selected = prediction(selected="tag")
        selected["candidates"].append({"candidate_id": "tag", "bbox_image_px": [0, 0, 10, 10], "detector_score": 0.95, "dino_similarity": 0.95})
        result = score([grounded_case()], [selected], 0.5, 0.75, 0.0, 1, 1)
        self.assertEqual(result["metrics"]["tag_box_self_verifications"], 1)
        self.assertEqual(result["metrics"]["false_accepts"], 1)

    def test_source_hash_cannot_cross_splits(self) -> None:
        development = grounded_case("dev")
        development["split"] = "development"
        with self.assertRaisesRegex(ValueError, "same source PDF"):
            score([grounded_case(), development], [prediction(), prediction("dev")], 0.5, 0.75, 0.0, 1, 1)

    def test_importer_transports_reviewed_truth_without_upgrading_coverage(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "manifest.json").write_text(json.dumps({
                "documents": [{"truth_file": "truth.json", "project_id": "example", "split": "held_out"}],
            }), encoding="utf-8")
            (root / "truth.json").write_text(json.dumps({
                "schema": "opentakeoff.symbol_grounding_ground_truth.v1",
                "source_sha256": PDF_HASH,
                "coordinate_space": "session_render_image_px",
                "cases": [{
                    "pdf_page": 4,
                    "tag": "AHU-1",
                    "equipment_family": "AIR HANDLING UNIT",
                    "tag_bbox_image_px": [0, 0, 10, 10],
                    "expected_symbol_bbox_image_px": [20, 20, 40, 40],
                    "prohibited_false_symbol_bboxes_image_px": [],
                }],
                "review": {"status": "human_reviewed_positive_and_negative_controls"},
            }), encoding="utf-8")
            imported = import_truth(root)
        self.assertEqual(len(imported), 1)
        self.assertEqual(imported[0]["expected_outcome"], "grounded")
        self.assertFalse(imported[0]["coverage"]["full_sheet_negative_reviewed"])

    def test_bakeoff_cannot_promote_ineligible_evidence(self) -> None:
        control = {"production_evidence_eligible": False, "metrics": {"selected_precision": 0.8}}
        experiment = {"production_evidence_eligible": False, "metrics": {"selected_precision": 1.0}}
        decision, checks = gate_decision(control, experiment, [{"metric": "metrics.selected_precision", "direction": "higher", "minimum_delta": 0}])
        self.assertEqual(decision, "diagnostic_only_not_promotable")
        self.assertTrue(checks[0]["passed"])

    def test_bakeoff_executes_declared_command_and_writes_audit_report(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            control = {
                "production_evidence_eligible": False,
                "metrics": {"selected_precision": 0.8},
            }
            candidate = {
                "production_evidence_eligible": False,
                "metrics": {"selected_precision": 0.9},
            }
            (root / "control.json").write_text(json.dumps(control), encoding="utf-8")
            write_candidate = "import json; from pathlib import Path; Path('candidate.json').write_text(json.dumps(" + repr(candidate) + "))"
            config = {
                "schema": BAKEOFF_SCHEMA,
                "control": {"id": "control", "evaluation_json": "control.json"},
                "comparison_gates": [{"metric": "metrics.selected_precision", "direction": "higher", "minimum_delta": 0}],
                "experiments": [{
                    "id": "candidate",
                    "hypothesis": "This test proves the runner executes only its declared command.",
                    "command": [sys.executable, "-c", write_candidate],
                    "evaluation_json": "candidate.json",
                }],
            }
            output = root / "report.json"
            report = run(config, root, output, dry_run=False, resume=False, max_experiments=None)
            persisted = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(report["experiments"][0]["status"], "completed")
        self.assertEqual(report["experiments"][0]["decision"], "diagnostic_only_not_promotable")
        self.assertEqual(persisted["experiments"][0]["id"], "candidate")

    def test_review_queue_renders_questions_without_self_labeling(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source_root = root / "source"
            source_root.mkdir()
            Image.new("RGB", (100, 100), "white").save(source_root / "page.png")
            proposal = {
                "schema": PROPOSAL_SCHEMA,
                "proposal_id": "p1",
                "project_id": "project-a",
                "source_pdf_sha256": PDF_HASH,
                "source_image_path": "page.png",
                "equipment_family": "FAN COIL UNIT",
                "tag": "FCU-1",
                "tag_bbox_image_px": [10, 10, 20, 20],
                "candidate_regions": [{"candidate_id": "candidate-1", "bbox_image_px": [30, 30, 60, 60]}],
            }
            queue = build_queue([proposal], source_root, root / "queue", 30, 2.0)
            output_root = root / "queue"
            persisted = json.loads((output_root / "review_queue.jsonl").read_text().strip())
            self.assertEqual(queue[0]["review_status"], "needs_independent_human_review")
            self.assertIsNone(queue[0]["review_decision"]["accepted_candidate_id"])
            self.assertNotIn("expected_symbol_bbox_image_px", queue[0])
            self.assertTrue((output_root / persisted["packet_image_path"]).is_file())


if __name__ == "__main__":
    unittest.main()
