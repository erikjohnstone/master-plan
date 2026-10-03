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

    glance = _glance_at_ink_only_page(pdf_path, page_no)
    if glance is not None:
        return glance

    found = find_tables(pdf_path, page_no)
    pdf = Path(pdf_path)
    out: list = []
    diag = found.get("diagnostics", {})

    lettering = _InkLettering(pdf_path, page_no)
    for t in found["tables"]:
        bbox = [float(v) for v in t["bbox"]]
        if t.get("raster") and _read_picture(pdf_path, page_no, bbox, diag, out):
            continue
        # A DRAWN TABLE LETTERED IN INK reads as a picture of one. A CAD export
        # can keep the rules and the title block as text and plot every other
        # letter as strokes or filled outlines: 29_TX's M9.01 prints its
        # WATER COOLED CHILLER SCHEDULE and COOLING COIL SCHEDULE that way,
        # ruled, with no word of either in the text layer, and the takeoff read
        # nothing from the set. A grid the page's own words do not fill, whose
        # box holds the small paths letters are drawn with, is read from its
        # pixels as a pasted picture is (AS-153).
        if t.get("cells") and lettering.unprinted(t) and _read_picture(pdf_path, page_no, bbox, diag, out):
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


class _InkLettering:
    """Whether a drawn table is lettered in ink rather than in text: the
    page's words in its box (celltext.page_words, as read_picture's own
    `printed` test counts them) are fewer than one for every three faces,
    and the paths inside it no bigger than a letter number at least
    INK_LETTERS_PER_FACE for every face. Both are read once per page, and
    only when a table asks.

    Only a grid shaped like a schedule asks (_schedule_shaped): a sheet
    lettered in ink letters its details, plans and keynote boxes in ink
    too, and every ruled box there is a grid its words do not fill.
    07_MO's 25 drawing sheets offered 262 such boxes, and reading each
    from its pixels cost 900 s of a 962 s graph build for no table kept
    (one framing detail's linework, 105 faces, took 111 s)."""

    def __init__(self, pdf_path: str, page_no: int):
        self.pdf_path, self.page_no = pdf_path, page_no
        self._words = None
        self._ink = None

    def _load(self) -> None:
        from celltext import page_words              # noqa: E402
        import pymupdf
        self._words = [((w[0] + w[2]) / 2, (w[1] + w[3]) / 2) for w in page_words(Path(self.pdf_path), self.page_no)]
        ink = []
        with pymupdf.open(self.pdf_path) as doc:
            page = doc[self.page_no - 1]
            rot = page.rotation_matrix
            for d in page.get_drawings():
                r = d["rect"] * rot          # drawings come back pre-rotation, like image rects
                w, h = r.x1 - r.x0, r.y1 - r.y0
                if 0 < max(w, h) <= INK_LETTER_PT:
                    ink.append(((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2))
        self._ink = ink

    def unprinted(self, t: dict) -> bool:
        if not _schedule_shaped(t["cells"]):
            return False
        if self._words is None:
            self._load()
        x0, y0, x1, y1 = t["bbox"]
        inside = lambda pts: sum(1 for cx, cy in pts if x0 <= cx <= x1 and y0 <= cy <= y1)  # noqa: E731
        faces = max(1, len(t["cells"]))
        if 3 * inside(self._words) >= faces:
            return False
        return inside(self._ink) >= INK_LETTERS_PER_FACE * faces


def _glance_at_ink_only_page(pdf_path: str, page_no: int) -> dict | None:
    """A PAGE WITH NO WORDS AT ALL can give a table only two ways: a pasted
    picture, or a ruled grid lettered in ink (_InkLettering), because every
    other grid is read by the words that fall in its faces and it has none.
    Such a page is a whole sheet plotted with its letters as strokes, and
    pdfplumber spends seconds on those strokes before the grid finder sees a
    rule: 056_NY's ink-only plan sheet carries 455,901 path items, 10.8 s of
    parsing for no table. So a page with no words and no picture is first
    looked at through MuPDF's path list, without its letters (paths no bigger
    than a letter, INK_LETTER_PT, that are no rule), by the grid finder and
    the same two tests the full read applies (_schedule_shaped, unprinted).
    A grid that passes reads the page as before; none, and the reply is the
    one the full read gives (no tables) in a fraction of the time.

    Measured over the 96 ink-only pages of the 12 keyed sets holding any:
    the glance finds every grid the full read offers the picture reader.
    Returns None whenever the full read must run.

    The verdict is kept beside the picture reader's (_picture_cache_dir, keyed
    by the set's bytes, the page and the readers' own source), so a drawing
    set opened again is not glanced at again: 22_GA's 41 ink-only pages cost
    the glance about 3 s each on every open."""
    import json
    from celltext import page_words                  # noqa: E402

    if page_words(Path(pdf_path), page_no):
        return None
    hit = None
    try:
        cache = _picture_cache_dir()
        hit = cache / f"glance-{_picture_cache_key(pdf_path, page_no, [-1, -1, -1, -1])}.json" if cache else None
    except Exception:  # noqa: BLE001 — no cache is never a failure
        hit = None
    if hit is not None and hit.is_file():
        try:
            kept = json.loads(hit.read_text())
            return kept or None
        except (OSError, ValueError):
            pass
    reply = _glance(pdf_path, page_no)
    if hit is not None:
        try:
            hit.parent.mkdir(parents=True, exist_ok=True)
            tmp = hit.with_suffix(".tmp")
            tmp.write_text(json.dumps(reply or {}))
            tmp.replace(hit)
        except OSError:
            pass
    return reply


def _glance(pdf_path: str, page_no: int) -> dict | None:
    """_glance_at_ink_only_page's own look, on a page that has no words."""
    import pdfplumber
    import pymupdf
    from vectorgrid import (                         # noqa: E402
        _effective_box, _snap_grid, raster_regions, tables_from_segments,
    )

    if raster_regions(pdf_path, page_no):
        return None
    with pymupdf.open(pdf_path) as doc:
        segs = _snap_grid(_ink_page_rules(doc[page_no - 1]))
    # The box only: pdfplumber reads a page's content stream lazily, on the
    # first object asked for, and its box is what the full read reports.
    with pdfplumber.open(pdf_path) as doc:
        x0, y0, x1, y1 = _effective_box(doc.pages[page_no - 1])
    page_w, page_h = x1 - x0, y1 - y0
    found = tables_from_segments(segs, [], page_w, page_h)
    lettering = _InkLettering(pdf_path, page_no)
    if any(t.get("cells") and lettering.unprinted(t) for t in found["tables"]):
        return None
    return {
        "space": "pdf-points-topleft",
        "page": page_no,
        "pageWidth": page_w,
        "pageHeight": page_h,
        "tables": [],
        "diagnostics": {"segments": len(segs), "page_w": page_w, "page_h": page_h, "ink_only_glance": True},
    }


def _ink_page_rules(page) -> list:
    """The rules of a page lettered in ink, as segments_from_page gives them
    (x0, y0, x1, y1, width), read from MuPDF's path list: a thin path is a
    rule along its length (the CAD sliver idiom), a stroked rect or quad its
    four walls, a line itself; a path too small to hold a rule (MIN_LEN) or
    no bigger than a letter is skipped whole. Coordinates are MuPDF's, with
    the page's rotation applied, as _InkLettering reads the ink."""
    from vectorgrid import AXIS_TOL, MIN_LEN, THIN_RECT, _q    # noqa: E402

    segs: list = []
    rot = page.rotation_matrix

    def add(x0, y0, x1, y1, w):
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        if dx <= AXIS_TOL and dy >= MIN_LEN:
            x = _q((x0 + x1) / 2)
            segs.append((x, _q(min(y0, y1)), x, _q(max(y0, y1)), w))
        elif dy <= AXIS_TOL and dx >= MIN_LEN:
            y = _q((y0 + y1) / 2)
            segs.append((_q(min(x0, x1)), y, _q(max(x0, x1)), y, w))

    for d in page.get_drawings():
        r = d["rect"] * rot
        w = float(d.get("width") or 0.0)
        cw, ch = r.x1 - r.x0, r.y1 - r.y0
        if ch <= THIN_RECT and cw >= MIN_LEN:
            add(r.x0, (r.y0 + r.y1) / 2, r.x1, (r.y0 + r.y1) / 2, max(w, ch))
            continue
        if cw <= THIN_RECT and ch >= MIN_LEN:
            add((r.x0 + r.x1) / 2, r.y0, (r.x0 + r.x1) / 2, r.y1, max(w, cw))
            continue
        stroked = d.get("type") in ("s", "fs")
        if max(cw, ch) <= INK_LETTER_PT and (not stroked or any(it[0] == "c" for it in d["items"])):
            continue
        for it in d["items"]:
            if it[0] == "l":
                a, b = it[1] * rot, it[2] * rot
                add(a.x, a.y, b.x, b.y, w)
            elif it[0] == "re" and stroked:
                q = it[1] * rot
                add(q.x0, q.y0, q.x1, q.y0, w); add(q.x0, q.y1, q.x1, q.y1, w)
                add(q.x0, q.y0, q.x0, q.y1, w); add(q.x1, q.y0, q.x1, q.y1, w)
            elif it[0] == "qu" and stroked:
                qd = it[1]
                pts = [p * rot for p in (qd.ul, qd.ur, qd.lr, qd.ll)]
                for a, b in zip(pts, pts[1:] + pts[:1]):
                    add(a.x, a.y, b.x, b.y, w)
    return segs


def _schedule_shaped(faces: list) -> bool:
    """A grid with the rows and columns of a schedule: at least
    INK_TABLE_MIN_FACES faces in at least INK_TABLE_MIN_COLS columns and two
    rows (a heading and a unit), filling at least INK_TABLE_MIN_FILL of the
    lattice its rules make (distinct column edges x distinct row edges). A
    schedule's rules cross the whole table, so nearly every position of that
    lattice is a face, and merged header cells cost it little: 020_MO's
    widest, 26 columns under spanned heads, fills 0.39, its others
    0.54-0.96, and its smallest, one unit under its heading, has 20 faces.
    A drawing's lines meet where its parts do, so its faces leave most of
    the lattice empty (07_MO's framing detail fills 0.17, an enlarged plan
    0.20), and a keynote box, a callout or a title strip is a few faces or
    one row. Of 07_MO's 262 boxes lettered in ink, one is shaped like a
    schedule: its EQUIPMENT DATA SCHEDULE (525 faces, 0.92).

    A grid as wide as a schedule's columns (INK_WIDE_TABLE_PT) needs fewer
    faces: a one-unit schedule under a two-tier header has 17 (08_ME's
    ELECTRIC WATER HEATER and ELECTRIC HEAT TRACE schedules, 671 and 864pt
    wide; its two-louver LOUVER SCHEDULE 19). Of the 135 ink-only pages of
    the corpus, the grids lettered in ink with 17 to 19 faces at that width
    are those three, 11_CA's separation-distance table and 22_GA's footing
    schedule; every drawing with as few faces is at most 107pt wide, and the
    one wide drawing with fewer (11_CA's riser diagram) has 16."""
    xs = {round(float(f[0]), 0) for f in faces} | {round(float(f[2]), 0) for f in faces}
    wide = max(xs, default=0) - min(xs, default=0) >= INK_WIDE_TABLE_PT
    if len(faces) < (INK_WIDE_TABLE_MIN_FACES if wide else INK_TABLE_MIN_FACES):
        return False
    ys = {round(float(f[1]), 0) for f in faces} | {round(float(f[3]), 0) for f in faces}
    cols, rows = len(xs) - 1, len(ys) - 1
    if cols < INK_TABLE_MIN_COLS or rows < 2:
        return False
    return len(faces) >= INK_TABLE_MIN_FILL * cols * rows


INK_TABLE_MIN_FACES = 20
INK_WIDE_TABLE_MIN_FACES = 17
INK_WIDE_TABLE_PT = 300.0
INK_TABLE_MIN_COLS = 3
INK_TABLE_MIN_FILL = 0.3


# A letter drawn as ink is a path no bigger than this (points): schedule type
# runs 3-7pt, and a cell's own rules and the grid's frame are longer.
INK_LETTER_PT = 12.0
# ... and a lettered table has at least this many of them per face: a cell's
# few letters, numbers or a dash. An empty form (a blank title block grid, a
# ruled box left for a stamp) has none.
INK_LETTERS_PER_FACE = 2


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
    # A runtime without the reader reads no picture, as a machine without OCR
    # does: the packaged runtime shipped without rastergrid.py, and every page
    # holding a picture died here with ModuleNotFoundError, its drawn tables
    # with it.
    try:
        import rastergrid                            # noqa: E402
    except ImportError:
        return False
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
    # OCR's readings are kept beside the pictures' (#323): this cache is keyed
    # by the table code's source too, so a change to it reads every picture
    # again, and the readings let that skip the OCR (rastergrid.OCR_CACHE).
    cache = _picture_cache_dir()
    rastergrid.OCR_CACHE = cache / "ocr" if cache else None
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
