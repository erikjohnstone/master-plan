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
    from vectorgrid import find_tables              # noqa: E402

    found = find_tables(pdf_path, page_no)
    pdf = Path(pdf_path)
    out: list = []
    diag = found.get("diagnostics", {})

    for t in found["tables"]:
        bbox = [float(v) for v in t["bbox"]]
        if t.get("raster") and _read_picture(pdf_path, page_no, bbox, diag, out):
            continue
        if t.get("raster") or not t.get("cells"):
            # A picture of a table. It has no faces by construction and its
            # text is pixels — say so rather than presenting an empty grid,
            # which a consumer would merge over a real table.
            out.append({
                "bbox": bbox, "rows": 0, "cols": 0, "cells": [],
                "raster": True, "assigned": 0, "orphan": 0, "straddle": 0,
            })
            continue

        emitted = _emit(pdf, t, page_no)
        if emitted:
            out.append(emitted)

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


# A picture is read in a process of its own, for at most this long (seconds):
# OCR runs native code (OpenCV, ONNX Runtime), and a crash or a hang there must
# cost the picture, never the sidecar and the drawn tables of the same sheet.
# 07_MO's M-601 VAV BOX SCHEDULE, 29 rows by 31 columns, reads in 80 s.
PICTURE_TIMEOUT_S = 600


def _picture_cache_dir() -> Path | None:
    """Where a picture's tables are kept once read: reading one costs a minute
    or more, and a drawing set is opened again and again, so a picture is read
    once per set and per reader. OPENTAKEOFF_PICTURE_CACHE names the folder,
    or turns the cache off with "0"; the default sits beside ODL's
    (~/.cache, or XDG_CACHE_HOME)."""
    import os
    named = os.environ.get("OPENTAKEOFF_PICTURE_CACHE", "")
    if named == "0":
        return None
    if named:
        return Path(named)
    return Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache") / "opentakeoff-picture"


_digests: dict = {}


def _picture_cache_key(pdf_path: str, page_no: int, bbox: list) -> str:
    """The drawing set's bytes, the page, the picture's box and the reader's
    own source: a changed PDF or a changed reader reads the picture again."""
    import hashlib
    import json
    import os
    st = os.stat(pdf_path)
    file_key = (os.path.realpath(pdf_path), st.st_size, st.st_mtime_ns)
    if file_key not in _digests:
        h = hashlib.sha256()
        with open(pdf_path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        _digests[file_key] = h.hexdigest()
    if "code" not in _digests:
        import celltext
        import rastergrid
        import vectorgrid
        h = hashlib.sha256()
        for mod in (rastergrid, vectorgrid, celltext):
            h.update(Path(mod.__file__).read_bytes())
        h.update(Path(__file__).read_bytes())
        try:
            from importlib.metadata import version
            h.update(version("rapidocr_onnxruntime").encode())
        except Exception:  # noqa: BLE001
            pass
        _digests["code"] = h.hexdigest()
    key = json.dumps([_digests[file_key], _digests["code"], page_no, [round(float(v), 2) for v in bbox]])
    return hashlib.sha256(key.encode()).hexdigest()


def _read_picture(pdf_path: str, page_no: int, bbox: list, diag: dict, out: list) -> bool:
    """A picture of a table, read from its pixels (AS-153): its rules become
    strokes and its ink words, and find_tables' own core and slot() read them
    as they read a drawn table (read_picture, in a child process). True when
    the picture gave at least one table (appended to `out`, each marked
    `ocr`); False leaves it a raster region, as before, and so does a machine
    without OCR (rastergrid.available), a crash or a timeout. A finished read
    is kept (_picture_cache_dir) and answers the same picture next time."""
    import json
    import os
    import subprocess
    import rastergrid                                # noqa: E402
    if not rastergrid.available():
        return False
    hit = None
    try:
        cache = _picture_cache_dir()
        hit = cache / f"{_picture_cache_key(pdf_path, page_no, bbox)}.json" if cache else None
    except Exception:  # noqa: BLE001 — no cache is never a failure
        hit = None
    if hit is not None and hit.is_file():
        try:
            tables = json.loads(hit.read_text())
            out.extend(tables)
            return bool(tables)
        except (OSError, ValueError):
            pass
    cmd = [sys.executable, str(Path(__file__).resolve()), "--picture", pdf_path, str(page_no),
           *(repr(float(v)) for v in bbox), repr(float(diag.get("page_w") or 0)), repr(float(diag.get("page_h") or 0))]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=PICTURE_TIMEOUT_S)
    except (subprocess.TimeoutExpired, OSError):
        return False
    if r.returncode != 0 or not r.stdout.strip():
        return False
    try:
        tables = json.loads(r.stdout.strip().splitlines()[-1])
    except ValueError:
        return False
    # Only a finished read is kept (a crash or a timeout is tried again);
    # written whole or not at all.
    if hit is not None:
        try:
            hit.parent.mkdir(parents=True, exist_ok=True)
            part = hit.with_suffix(f".{os.getpid()}.part")
            part.write_text(json.dumps(tables))
            os.replace(part, hit)
        except OSError:
            pass
    out.extend(tables)
    return bool(tables)


def read_picture(pdf_path: str, page_no: int, bbox: tuple, page_w: float, page_h: float) -> list:
    """The tables of one picture, each emitted as a drawn table is and marked
    `ocr` (see _read_picture, which runs this in a child process)."""
    from vectorgrid import _snap_grid, tables_from_segments  # noqa: E402
    import rastergrid                                # noqa: E402
    segs, picture = rastergrid.read_region(pdf_path, page_no, tuple(bbox))
    if not segs:
        return []
    x0, y0, x1, y1 = bbox
    found = tables_from_segments(_snap_grid(segs), [], page_w, page_h)
    tables = [t for t in found["tables"] if not t.get("raster") and t.get("cells")
              and x0 - 2 <= (t["bbox"][0] + t["bbox"][2]) / 2 <= x1 + 2
              and y0 - 2 <= (t["bbox"][1] + t["bbox"][3]) / 2 <= y1 + 2]
    # A picture can hold only the rules, its text printed over it as text
    # (01_NY's #59 places the page's ruling as tiles under its own words): a
    # table whose box holds the page's own words, at least one for every
    # three faces, is read from them, as a drawn table is, and is no OCR
    # reading (AS-154).
    from celltext import page_words                  # noqa: E402
    words = page_words(Path(pdf_path), page_no)

    def printed(t: dict) -> bool:
        bx0, by0, bx1, by1 = t["bbox"]
        n = sum(1 for w in words if bx0 <= (w[0] + w[2]) / 2 <= bx1 and by0 <= (w[1] + w[3]) / 2 <= by1)
        return n >= 3 and 3 * n >= len(t["cells"])

    as_text = [t for t in tables if printed(t)]
    to_read = [t for t in tables if not printed(t)]
    # Read only where the rules made a table the page does not print: a
    # picture that makes none costs a render and no OCR.
    picture.read([t["bbox"] for t in to_read])
    out = []
    for t in tables:
        if t in as_text:
            emitted = _emit(Path(pdf_path), t, page_no)
            if emitted:
                out.append(emitted)
            continue
        # A face the whole-picture pass read doubtfully is read again on its
        # own (rastergrid.Picture.refine).
        emitted = _emit(Path(pdf_path), t, page_no, picture.refine(t["cells"]))
        if emitted:
            emitted["ocr"] = True
            out.append(emitted)
    return out


def _emit(pdf: Path, t: dict, page_no: int, words: list | None = None) -> dict | None:
    """One table's faces and their text, in the reply's shape."""
    from celltext import cell_text, slot            # noqa: E402
    bbox = [float(v) for v in t["bbox"]]
    cells, assigned, orphan, straddle = slot(pdf, t, page_no, words)
    if not cells:
        return None

    # A DRAWN CELL THAT IS EMPTY IS STILL PART OF THE GRID. slot() returns
    # only the faces that received words, which is right for scoring text
    # but wrong for describing structure: a data row with one blank cell
    # then looks like it does not cover every column, and a consumer
    # deciding "header tier or data row" by coverage reads the whole row as
    # a header. Measured on 096_IN#19's AHU CHILLED WATER COOLING COIL
    # SCHEDULE — 20 drawn columns, 19 filled in every data row — where that
    # cost all four data rows and the table with them.
    #
    # A face that slot() SPLIT (split_unruled_columns divides a cell whose
    # column of siblings all leave the same gap) must not come back as a
    # third, overlapping cell, so a face is only added when no returned
    # cell's centre lies inside it.
    centres = [((k[0] + k[2]) / 2, (k[1] + k[3]) / 2) for k in cells]
    for face in t["cells"]:
        if face in cells:
            continue
        if any(face[0] <= cx <= face[2] and face[1] <= cy <= face[3]
               for cx, cy in centres):
            continue
        cells[face] = []

    xs = _axis(b[0] for b in cells)
    ys = _axis(b[1] for b in cells)

    emitted: list = []
    for b, ws in cells.items():
        c0 = _index(xs, b[0])
        r0 = _index(ys, b[1])
        emitted.append({
            "row": r0,
            "col": c0,
            "rowSpan": _span(ys, r0, b[3]),
            "colSpan": _span(xs, c0, b[2]),
            "text": cell_text(ws),
            "bbox": [float(b[0]), float(b[1]), float(b[2]), float(b[3])],
        })
    emitted.sort(key=lambda c: (c["row"], c["col"]))
    with_text = sum(1 for c in emitted if c["text"])

    return {
        "bbox": bbox,
        "rows": len(ys),
        "cols": len(xs),
        "cells": emitted,
        "cellsWithText": with_text,
        "raster": False,
        "assigned": assigned,
        "orphan": orphan,
        "straddle": straddle,
    }


def extract_grid_rpc(params: dict) -> dict:
    pdf_path = params.get("pdfPath")
    if not pdf_path:
        raise ValueError("pdfPath required")
    return extract_grid(str(pdf_path), int(params.get("page") or 1))


def main() -> int:
    import json
    if len(sys.argv) > 1 and sys.argv[1] == "--picture":
        pdf, page, x0, y0, x1, y1, pw, ph = sys.argv[2], int(sys.argv[3]), *map(float, sys.argv[4:10])
        print(json.dumps(read_picture(pdf, page, (x0, y0, x1, y1), pw, ph)))
        return 0
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
