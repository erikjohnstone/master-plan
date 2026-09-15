"""Pure safety and geometry tests for the offline tiled symbol cascade."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from run_symbol_grounding_cascade import artifact_provenance, choose_candidate, global_class_aware_nms, tile_windows  # noqa: E402


class SymbolGroundingCascadeTest(unittest.TestCase):
    def test_tiles_cover_edges_and_have_overlap(self) -> None:
        tiles = tile_windows(2500, 1800, 1024, 0.20)
        self.assertEqual((tiles[0].x0, tiles[0].y0), (0, 0))
        self.assertTrue(any(tile.x1 == 2500 for tile in tiles))
        self.assertTrue(any(tile.y1 == 1800 for tile in tiles))
        self.assertTrue(any(left.x1 > right.x0 for left in tiles for right in tiles if left.y0 == right.y0 and left.x0 < right.x0))

    def test_global_nms_never_suppresses_a_different_detector_class(self) -> None:
        candidates = [
            {"candidate_id": "a", "bbox_image_px": [0.0, 0.0, 10.0, 10.0], "detector_score": 0.9, "detector_label": "valve"},
            {"candidate_id": "b", "bbox_image_px": [1.0, 1.0, 11.0, 11.0], "detector_score": 0.8, "detector_label": "valve"},
            {"candidate_id": "c", "bbox_image_px": [1.0, 1.0, 11.0, 11.0], "detector_score": 0.7, "detector_label": "actuator"},
        ]
        result = global_class_aware_nms(candidates, 0.5)
        self.assertEqual([item["candidate_id"] for item in result], ["a", "c"])

    def test_selection_withholds_tag_box_and_low_confidence_candidates(self) -> None:
        candidates = [
            {"candidate_id": "tag", "bbox_image_px": [0.0, 0.0, 10.0, 10.0], "detector_score": 0.99, "dino_similarity": 0.99},
            {"candidate_id": "symbol", "bbox_image_px": [30.0, 30.0, 50.0, 50.0], "detector_score": 0.8, "dino_similarity": 0.8},
        ]
        self.assertEqual(choose_candidate(candidates, 0.7, 0.7, [0.0, 0.0, 10.0, 10.0]), "symbol")
        self.assertIsNone(choose_candidate(candidates, 0.9, 0.7, [0.0, 0.0, 10.0, 10.0]))
        self.assertIsNone(choose_candidate(candidates, 1.1, 1.1, None))

    def test_artifact_provenance_hashes_weights_not_just_config(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "config.json").write_text('{"architecture":"rtdetr"}', encoding="utf-8")
            (root / "model.safetensors").write_bytes(b"first weights")
            first = artifact_provenance(root)
            (root / "model.safetensors").write_bytes(b"different weights")
            second = artifact_provenance(root)
        self.assertNotEqual(first["content_sha256"], second["content_sha256"])
        self.assertEqual([entry["relative_path"] for entry in first["files"]], ["config.json", "model.safetensors"])


if __name__ == "__main__":
    unittest.main()
