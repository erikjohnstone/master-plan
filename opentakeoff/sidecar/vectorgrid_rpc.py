#!/usr/bin/env python3
"""
Vectorgrid JSON-RPC method — the production door onto the measured extractor.

`bakeoff/vectorgrid.py` finds a table by extracting the FACES of the planar
straight-line graph its rules form (shapely node() + polygonize_full): a face
IS a cell, so the box and the cells come out of one construction rather than
two. `bakeoff/celltext.py` drops each MuPDF word into the face that contains
its centre. Measured against hand-authored ground truth:

    137/137 table boxes within 4pt (mean IoU 0.9993)
    222/222 keyed tables with no SHORT / OVERRUN / MERGED / SPLIT
    917/917 hand-transcribed cells, 102/102 rows whole
    18,189 cells judged by an independent pixel-OCR pass: 0 failures ours

This module adds NOTHING to that. It only turns the extractor's output — a
bbox and a bag of cell rectangles — into the (row, col, rowSpan, colSpan) grid
that `scheduleTableFromODL` on the Node side needs, using the same rule
`bakeoff/cellscore.py:extracted_rows` scores against: the column grid is the
table's own distinct LEFT edges clustered at 2pt, the row grid its distinct
TOP edges. Spans fall out of where a cell's right/bottom edge lands on those
same grids, and spans are what let the Node side recognise a title band (one
cell spanning every column) and a multi-tier header.

COORDINATES. Everything here is PDF POINTS with a TOP-LEFT origin, already
normalised to the MediaBox corner (`vectorgrid.page_origin`) and with /Rotate
applied — the same space a renderer uses, NOT raw pdfplumber MediaBox
coordinates. The reply says so in its own `space` field, because the one bug
this integration must not inherit is a consumer that treats points as project
pixels.
"""
from __future__ import annotations

import sys
from pathlib import Path

BAKEOFF = Path(__file__).resolve().parent.parent / "bakeoff"
if str(BAKEOFF) not in sys.path:
    sys.path.insert(0, str(BAKEOFF))

# Column/row grid clustering tolerance, in points. Same value cellscore.py
# scores against — CAD exporters disagree in the 2nd decimal on what is
# visibly one wall, and 2pt is comfortably below the narrowest real column in
# the corpus while comfortably above that noise.
TOL = 2.0


def _axis(values, tol: float = TOL) -> list:
    """Sorted cluster representatives — one entry per distinct grid line."""
    out: list = []
    for v in sorted(values):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


def _index(axis: list, v: float, tol: float = TOL) -> int:
    """The grid index a coordinate starts in."""
    lo, hi = 0, len(axis) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if axis[mid] <= v + tol:
            lo = mid
        else:
            hi = mid - 1
    return lo


def _span(axis: list, start: int, end_val: float, tol: float = TOL) -> int:
    """How many grid slots a cell occupies, from `start` to `end_val`.

    A spanning cell crosses the grid lines of the columns it swallows, so the
    count is simply how many of them lie strictly inside it.
    """
    n = 1
    for i in range(start + 1, len(axis)):
        if axis[i] <= end_val - tol:
            n += 1
        else:
            break
    return n


def extract_grid(pdf_path: str, page_no: int = 1) -> dict:
    """-> {space, page, tables: [{bbox, rows, cols, cells, raster, ...}]}"""
    from celltext import cell_text, slot            # noqa: E402
    from vectorgrid import find_tables              # noqa: E402

    found = find_tables(pdf_path, page_no)
    pdf = Path(pdf_path)
    out: list = []

    for t in found["tables"]:
        bbox = [float(v) for v in t["bbox"]]
        if t.get("raster") or not t.get("cells"):
            # A picture of a table. It has no faces by construction and its
            # text is pixels — say so rather than presenting an empty grid,
            # which a consumer would merge over a real table.
            out.append({
                "bbox": bbox, "rows": 0, "cols": 0, "cells": [],
                "raster": True, "assigned": 0, "orphan": 0, "straddle": 0,
            })
            continue

        cells, assigned, orphan, straddle = slot(pdf, t, page_no)
        if not cells:
            continue

        xs = _axis(b[0] for b in cells)
        ys = _axis(b[1] for b in cells)

        emitted: list = []
        for b, words in cells.items():
            c0 = _index(xs, b[0])
            r0 = _index(ys, b[1])
            emitted.append({
                "row": r0,
                "col": c0,
                "rowSpan": _span(ys, r0, b[3]),
                "colSpan": _span(xs, c0, b[2]),
                "text": cell_text(words),
                "bbox": [float(b[0]), float(b[1]), float(b[2]), float(b[3])],
            })
        emitted.sort(key=lambda c: (c["row"], c["col"]))

        out.append({
            "bbox": bbox,
            "rows": len(ys),
            "cols": len(xs),
            "cells": emitted,
            "raster": False,
            "assigned": assigned,
            "orphan": orphan,
            "straddle": straddle,
        })

    diag = found.get("diagnostics", {})
    return {
        "space": "pdf-points-topleft",
        "page": page_no,
        # The page box every coordinate above is measured in, so a consumer in
        # another process can check our space against its own instead of
        # assuming it. A CropBox that differs from the MediaBox, or a renderer
        # that normalises to a different corner, shows up here as a size
        # disagreement rather than as silently displaced boxes.
        "pageWidth": diag.get("page_w"),
        "pageHeight": diag.get("page_h"),
        "tables": out,
        "diagnostics": diag,
    }


def extract_grid_rpc(params: dict) -> dict:
    pdf_path = params.get("pdfPath")
    if not pdf_path:
        raise ValueError("pdfPath required")
    return extract_grid(str(pdf_path), int(params.get("page") or 1))


def main() -> int:
    import json
    pdf, page = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1
    res = extract_grid(pdf, page)
    n_cells = sum(len(t["cells"]) for t in res["tables"])
    print(f"tables={len(res['tables'])} cells={n_cells} space={res['space']}")
    for i, t in enumerate(res["tables"]):
        x0, y0, x1, y1 = t["bbox"]
        print(f"  [{i:2d}] x{x0:7.1f},{y0:7.1f} -> {x1:7.1f},{y1:7.1f}  "
              f"{t['rows']}r x {t['cols']}c  cells={len(t['cells'])}"
              f"{'  RASTER' if t['raster'] else ''}")
    if "--json" in sys.argv:
        print(json.dumps(res)[:4000])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
