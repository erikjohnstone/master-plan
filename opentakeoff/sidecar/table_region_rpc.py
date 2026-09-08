#!/usr/bin/env python3
"""
Table-REGION detection RPC — `rapid_table_det`'s yolo_obj_det/yolo_edge_det/
paddle_cls_det trio, gating whether an image actually contains a table-
shaped region at all before spending OCR + structure-recognition compute
on it (table_structure_rpc.py).

Why this exists: `Session.rasterScheduleNotes`'s own "single large embedded
picture" signal (mcp/src/session.ts) is a coarse area-fraction heuristic —
real, corpus-found (2026-09-08 corpus scan): it fires identically on a
company logo/title-block graphic repeated on 20+ sheets of the SAME
document (13_MI_MSU_LifeSciences_LabRenovation.pdf, every sheet at an
identical 2%), on a repeated elevation rendering (08_ME_BGS_Augusta_East
Campus_Renovation.pdf, three sheets at an identical 26%), and on genuine
scanned schedule tables (15_IA_IowaState_Biorenewables_Lab.pdf#11, 59%,
role: schedule) — with no way to tell those apart by area fraction alone.
This module is the actual discriminator: does the image contain a real
table-shaped region (ruled grid, not a photo/logo/rendering)?

Two model files are pinned as the trio's own defaults (obj_model_type=
"yolo_obj_det", edge_model_type="yolo_edge_det", cls_model_type=
"paddle_cls_det" — confirmed directly against rapid_table_det/inference.py's
own TableDetector.__init__ defaults), vendored the same way as
table_structure_rpc.py's slanet-plus.onnx (modelscope.cn, their shared
default download source, is blocked by this sandbox's egress policy — see
models/README.md).

`YoloDet.img_postprocess` (rapid_table_det's own object-detector stage)
returns a genuinely empty list when nothing clears the confidence
threshold — confirmed by direct read, not assumed — so "zero detections"
is a real, trustworthy negative, not a default-to-whole-image fallback
(that fallback only applies when `use_obj_det=False`, which this module
never sets).
"""
from __future__ import annotations

import gzip
import shutil
from pathlib import Path
from typing import Any

MODELS_DIR = Path(__file__).resolve().parent / "models"
CACHE_DIR = Path(__file__).resolve().parent / ".model_cache"

_DETECTOR: Any = None


def _gunzipped(name: str) -> str:
    """Same cache-once discipline as table_structure_rpc.py's own helper."""
    src = MODELS_DIR / f"{name}.gz"
    if not src.exists():
        raise FileNotFoundError(f"vendored model missing: {src}")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dst = CACHE_DIR / name
    if not dst.exists() or dst.stat().st_size == 0:
        with gzip.open(src, "rb") as f_in, open(dst, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    return str(dst)


def _detector():
    global _DETECTOR
    if _DETECTOR is None:
        from rapid_table_det.inference import TableDetector

        _DETECTOR = TableDetector(
            obj_model_path=_gunzipped("yolo_obj_det.onnx"),
            edge_model_path=_gunzipped("yolo_edge_det.onnx"),
            cls_model_path=_gunzipped("paddle_cls_det.onnx"),
        )
    return _DETECTOR


def table_region_available() -> bool:
    try:
        import rapid_table_det  # noqa: F401

        return all((MODELS_DIR / f"{n}.onnx.gz").exists()
                   for n in ("yolo_obj_det", "yolo_edge_det", "paddle_cls_det"))
    except ImportError:
        return False


def table_region_rpc(params: dict[str, Any]) -> dict[str, Any]:
    """params: { imagePath: str, detAccuracy?: float (default 0.6) }
    Returns { hasTable: bool, regions: [{ box: [x0,y0,x1,y1], corners: {lt,rt,rb,lb} }] }
    — box is the axis-aligned detection; corners are the (possibly rotated/
    skewed) real table corners rapid_table_det's own edge/cls stages refine
    it to, useful for a de-skewed crop before structure recognition runs."""
    image_path = params.get("imagePath")
    if not image_path:
        raise ValueError("table_region requires imagePath")
    if not Path(image_path).exists():
        raise FileNotFoundError(f"image not found: {image_path}")
    det_accuracy = float(params.get("detAccuracy", 0.6))

    detector = _detector()
    result, _elapse = detector(image_path, det_accuracy=det_accuracy)

    regions = [{
        "box": [float(v) for v in r["box"]],
        "corners": {k: [float(v) for v in r[k]] for k in ("lt", "rt", "rb", "lb")},
    } for r in result]

    return {"hasTable": len(regions) > 0, "regions": regions}


def main() -> None:
    import json
    import sys

    if len(sys.argv) < 2:
        print("usage: table_region_rpc.py <image.png> [det_accuracy]", file=sys.stderr)
        sys.exit(1)
    params = {"imagePath": sys.argv[1]}
    if len(sys.argv) > 2:
        params["detAccuracy"] = float(sys.argv[2])
    print(json.dumps(table_region_rpc(params), indent=2))


if __name__ == "__main__":
    main()
