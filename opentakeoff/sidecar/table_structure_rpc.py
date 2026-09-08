#!/usr/bin/env python3
"""
Table-STRUCTURE recognition RPC — `rapid_table`'s slanet_plus engine, run
against a single already-rendered raster crop (a PNG of a schedule region
the Node side has already located — this module does no region detection
of its own; that is a separate concern, see the `models/README.md` note on
`yolo_obj_det`/`yolo_edge_det`/`paddle_cls_det` for the region-detection
trio those files back, not yet wired in here).

Why this exists (task #79): the L4.5 OCR-assist path in `mcp/src/session.ts`
(`ocrScheduleRegion`) fed tesseract.js flat word-soup into a hand-rolled
row/column banding pass with no real notion of a table's own row/column
grid. `rapid_table`'s slanet_plus model reads that grid structurally — the
same real, measured win (82.5 TEDS on OmniDocBench vs. PaddleOCR's own 73.6)
that motivated pulling this in over extending the tesseract path further.

OCR is run OURSELVES via `rapidocr_onnxruntime` (already a project
dependency, models bundled in the pip package — zero download) rather than
through `rapid_table`'s own optional internal OCR engine, which expects the
newer `rapidocr` package name and would otherwise add a second, redundant
OCR dependency this project doesn't need. `rapid_table`'s own `__call__`
accepts pre-computed `ocr_results` for exactly this reason (see its own
`get_ocr_results`) — `use_ocr=True` still has to be set so it doesn't skip
the html/cell text-matching step entirely (`if not self.cfg.use_ocr:
continue` in its own `__call__`), but with `ocr_results` supplied its own
internal engine (which may be `None` if `rapidocr` isn't installed) is never
actually called — confirmed by direct read of `rapid_table/main.py`.

Model file: `models/slanet-plus.onnx.gz`, vendored because modelscope.cn
(rapid_table's own default download source) is blocked by this sandbox's
egress policy — see `models/README.md`. Gunzipped once into a local cache
directory on first use, not on every call.
"""
from __future__ import annotations

import gzip
import shutil
import sys
from pathlib import Path
from typing import Any

MODELS_DIR = Path(__file__).resolve().parent / "models"
CACHE_DIR = Path(__file__).resolve().parent / ".model_cache"

# Lazy singletons — loading rapid_table/rapidocr_onnxruntime and their ONNX
# sessions costs real time and real memory; load at most once per sidecar
# process, same discipline as tables.py's own _GMFT_MODELS.
_OCR_ENGINE: Any = None
_TABLE_ENGINE: Any = None


def _gunzipped(name: str) -> str:
    """Gunzip `models/<name>.gz` into CACHE_DIR once, return the plain path.
    A cache hit (same name, already extracted) is just a stat + return."""
    src = MODELS_DIR / f"{name}.gz"
    if not src.exists():
        raise FileNotFoundError(f"vendored model missing: {src}")
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    dst = CACHE_DIR / name
    if not dst.exists() or dst.stat().st_size == 0:
        with gzip.open(src, "rb") as f_in, open(dst, "wb") as f_out:
            shutil.copyfileobj(f_in, f_out)
    return str(dst)


def _ocr_engine():
    global _OCR_ENGINE
    if _OCR_ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR

        _OCR_ENGINE = RapidOCR()
    return _OCR_ENGINE


def _table_engine():
    global _TABLE_ENGINE
    if _TABLE_ENGINE is None:
        from rapid_table import ModelType, RapidTable, RapidTableInput

        cfg = RapidTableInput(
            model_type=ModelType.SLANETPLUS,
            model_dir_or_path=_gunzipped("slanet-plus.onnx"),
            use_ocr=True,
        )
        _TABLE_ENGINE = RapidTable(cfg)
    return _TABLE_ENGINE


def table_structure_available() -> bool:
    try:
        import rapid_table  # noqa: F401
        import rapidocr_onnxruntime  # noqa: F401

        return (MODELS_DIR / "slanet-plus.onnx.gz").exists()
    except ImportError:
        return False


def table_structure_rpc(params: dict[str, Any]) -> dict[str, Any]:
    """params: { imagePath: str (absolute PNG path) }
    Returns a SidecarTable-shaped reply (see tableSidecarClient.ts's own
    SidecarTable/SidecarCell types — this mirrors that shape exactly so the
    same TS consumer code paths this project already has can read it)."""
    import numpy as np

    image_path = params.get("imagePath")
    if not image_path:
        raise ValueError("table_structure requires imagePath")
    if not Path(image_path).exists():
        raise FileNotFoundError(f"image not found: {image_path}")

    ocr = _ocr_engine()
    ocr_res, _elapse = ocr(image_path)
    if not ocr_res:
        return {"source": "rapid-table-slanet-plus", "score": 0.0, "page": 1,
                "rows": 0, "cols": 0, "bbox": [0.0, 0.0, 0.0, 0.0], "cells": []}

    boxes = np.array([r[0] for r in ocr_res], dtype=np.float32)
    texts = tuple(r[1] for r in ocr_res)
    scores = tuple(float(r[2]) for r in ocr_res)

    engine = _table_engine()
    result = engine(image_path, ocr_results=[(boxes, texts, scores)])

    if not result.logic_points or result.logic_points[0] is None or len(result.logic_points[0]) == 0:
        return {"source": "rapid-table-slanet-plus", "score": 0.0, "page": 1,
                "rows": 0, "cols": 0, "bbox": [0.0, 0.0, 0.0, 0.0], "cells": []}

    logic_points = result.logic_points[0]  # Nx4: [row_start, row_end, col_start, col_end]
    cell_bboxes = result.cell_bboxes[0]    # Nx4 or Nx8 (poly) per cell
    pred_html = result.pred_htmls[0] if result.pred_htmls else ""

    # rapid_table's own table_matcher already assigned OCR text per cell into
    # pred_html; recovering per-cell TEXT (not just structure) here without
    # re-parsing that HTML means re-deriving the same OCR-box-to-cell-box
    # containment match table_matcher performs internally. Simpler and just
    # as correct: match each OCR box's center against the cell polygons
    # ourselves, since we already have both in hand.
    def _bbox4(poly) -> list[float]:
        pts = np.array(poly).reshape(-1, 2)
        return [float(pts[:, 0].min()), float(pts[:, 1].min()), float(pts[:, 0].max()), float(pts[:, 1].max())]

    cell_boxes_xyxy = [_bbox4(cb) for cb in cell_bboxes]
    ocr_boxes_xyxy = [_bbox4(r[0]) for r in ocr_res]

    def _center(b: list[float]) -> tuple[float, float]:
        return ((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)

    def _area(b: list[float]) -> float:
        return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])

    # Assign each OCR detection to exactly ONE cell, never several — this
    # matters because slanet_plus's own predicted cell boxes are not always
    # disjoint. Real, measured live on this fixture's own CEILINGS table
    # (sample-finish-plan.pdf#2): the MATERIAL column's box (x 191-1023) and
    # the MANUFACTURER column's box (x 789-1439) overlap by 234px, and a
    # naive "every cell whose box contains this OCR center" match put "USG"
    # into BOTH columns. Nearest-centroid assignment (ties broken by the
    # smaller, more specific cell) picks one winner regardless of overlap.
    ocr_centers = [_center(ob) for ob in ocr_boxes_xyxy]
    cell_centers = [_center(cb) for cb in cell_boxes_xyxy]
    assigned: dict[int, list[int]] = {}
    for j, (ocx, ocy) in enumerate(ocr_centers):
        best_i, best_key = None, None
        for i, (ccx, ccy) in enumerate(cell_centers):
            cb = cell_boxes_xyxy[i]
            contains = cb[0] - 2 <= ocx <= cb[2] + 2 and cb[1] - 2 <= ocy <= cb[3] + 2
            dist = (ocx - ccx) ** 2 + (ocy - ccy) ** 2
            # (not contained, distance, area) — containment always beats a
            # miss; among containing cells the smaller (more specific) one
            # wins; ties fall back to nearest center.
            key = (0 if contains else 1, _area(cb) if contains else dist, dist)
            if best_key is None or key < best_key:
                best_key, best_i = key, i
        if best_i is not None:
            assigned.setdefault(best_i, []).append(j)

    cells: list[dict[str, Any]] = []
    max_row = 0
    max_col = 0
    full_bbox = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for i, lp in enumerate(logic_points):
        row_start, row_end, col_start, col_end = (int(v) for v in lp)
        cb = cell_boxes_xyxy[i] if i < len(cell_boxes_xyxy) else [0.0, 0.0, 0.0, 0.0]
        cx0, cy0, cx1, cy1 = cb
        full_bbox[0] = min(full_bbox[0], cx0)
        full_bbox[1] = min(full_bbox[1], cy0)
        full_bbox[2] = max(full_bbox[2], cx1)
        full_bbox[3] = max(full_bbox[3], cy1)
        max_row = max(max_row, row_end)
        max_col = max(max_col, col_end)

        # This cell's own assigned OCR detections, in reading order (top-to-
        # bottom, then left-to-right) — a cell can legitimately hold several
        # (wrapped text), each assigned to exactly one cell above.
        matched = [(ocr_boxes_xyxy[j][1], ocr_boxes_xyxy[j][0], texts[j]) for j in assigned.get(i, [])]
        matched.sort(key=lambda t: (t[0], t[1]))
        text = " ".join(t[2] for t in matched).strip()

        cells.append({
            "row": row_start,
            "col": col_start,
            "rowSpan": max(1, row_end - row_start + 1),
            "colSpan": max(1, col_end - col_start + 1),
            "text": text,
            "bbox": [cx0, cy0, cx1, cy1],
            "confidence": 1.0,
        })

    if full_bbox[0] == float("inf"):
        full_bbox = [0.0, 0.0, 0.0, 0.0]

    return {
        "source": "rapid-table-slanet-plus",
        "score": 1.0 if pred_html else 0.5,
        "page": 1,
        "rows": max_row + 1,
        "cols": max_col + 1,
        "bbox": full_bbox,
        "cells": cells,
    }


def main() -> None:
    # Standalone smoke-test entry point: `python3 table_structure_rpc.py <png>`
    if len(sys.argv) < 2:
        print("usage: table_structure_rpc.py <image.png>", file=sys.stderr)
        sys.exit(1)
    import json

    print(json.dumps(table_structure_rpc({"imagePath": sys.argv[1]}), indent=2))


if __name__ == "__main__":
    main()
