#!/usr/bin/env python3
"""Small no-network contract test for grouping, crop bounds, and gzip manifests."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from metric_data_common import crop_xyxy, read_jsonl_gz, split_for_group, write_jsonl_gz  # noqa: E402
from symbol_metric_transforms import prepare_symbol_image  # noqa: E402
from PIL import Image  # noqa: E402


class ManifestContractTest(unittest.TestCase):
    def test_crop_is_clipped_and_nonempty(self) -> None:
        self.assertEqual(crop_xyxy([0, 0, 10, 20], 100, 80, 0.25), [0, 0, 15, 25])
        with self.assertRaises(ValueError):
            crop_xyxy([20, 20, 0, 0], 100, 80, 0.25)

    def test_split_is_stable(self) -> None:
        key = "source|filename-family"
        self.assertEqual(split_for_group(key), split_for_group(key))
        self.assertIn(split_for_group(key), {"train", "val", "test"})

    def test_gzip_manifest_round_trip(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "rows.jsonl.gz"
            rows = [{"record_id": "a"}, {"record_id": "b"}]
            self.assertEqual(write_jsonl_gz(path, rows), 2)
            self.assertEqual(read_jsonl_gz(path), rows)

    def test_symbol_preparation_preserves_geometry_without_stretching(self) -> None:
        prepared = prepare_symbol_image(Image.new("RGB", (20, 50), "black"), size=280)
        self.assertEqual(prepared.mode, "RGB")
        self.assertEqual(prepared.size, (280, 280))
        self.assertEqual(prepared.getpixel((0, 0)), (255, 255, 255))


if __name__ == "__main__":
    unittest.main()
