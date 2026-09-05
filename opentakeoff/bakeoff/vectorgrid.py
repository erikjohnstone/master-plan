#!/usr/bin/env python3
"""
VECTORGRID — table regions and cells recovered from the DRAWN RULING GRAPH,
not from text positions and not from pixels.

WHY THIS EXISTS
---------------
Five independent literature sweeps converged on one finding: the entire
document-AI table stack exists to recover, from pixels, information that a
born-digital construction drawing already carries exactly. A schedule's cell
walls are drawn. Those strokes form a planar straight-line graph. Its bounded
faces ARE the cells — including spanning cells, which every sequence model
pays 5-16 TEDS points to approximate. Extracting the faces of a plane graph is
solved and optimal: Jiang & Bunke 1993, O(m log m) with a matching lower bound.
GEOS ships it as `polygonize`.

Measured cost of not doing this: Camelot lattice rasterises the page and runs
morphological erosion to re-discover lines that were sitting in the content
stream (~3 min on a LETTER page). Docling resizes an E-size sheet to 1024px
tall, then squashes each table crop to 448x448 with aspect ratio discarded,
then decodes autoregressively with beam 5 x 1024 steps — 174s/page measured
here, on input whose header glyphs were destroyed before inference began.

WHAT THIS DOES DIFFERENTLY FROM pdfplumber / PyMuPDF / tabula
--------------------------------------------------------------
All three are already vector-native and all three share one defect: they
enumerate MINIMAL RECTANGLES and then group cells that share a corner. That
(a) returns None for every spanning cell, and (b) fuses any two tables that
share a ruling line — which is exactly the adjacency failure this corpus is
full of (measured, 122 keyed tables, pdfplumber-lines_strict: 7 merged, 10
fragmented, 5 overrunning, 68.0% clean, 80.3% recall — against 2, 4, 2, 89.3%
and 95.9% here).

Two changes fix both:

  1. Cells are FACES of the arrangement, not minimal rectangles. A spanning
     header cell is one big face; nothing is None.
  2. Tables are split on STROKE WEIGHT. In CAD output the table border is
     drawn on a heavier pen than the interior cell rules — that is what a pen
     table is for. Rasterising destroys line width, which is why no published
     method can use it (tabula-java's source literally reads
     `// TODO: how to implement color filter?`). We have it exactly, so cell
     adjacency is cut wherever the shared wall is a border-weight stroke.

And one thing the ruling graph cannot do anything about: a schedule pasted in
as a PICTURE of a spreadsheet has no strokes at all. Those get their placement
rectangle emitted instead — see raster_regions(). Six of the 122 keyed tables
are of that kind, all on one sheet, which is what caps the vector path at
116/122 before a single OCR call.

    python3 vectorgrid.py <pdf> <page>            # inspect one sheet
    (or import find_tables() — bakeoff.py registers it as a backend)
"""
from __future__ import annotations

import sys
from collections import defaultdict

import pdfplumber
from shapely import node, polygonize_full
from shapely.geometry import MultiLineString

# Quantisation grid, in PDF points. Snapping every endpoint to this lattice
# turns each geometric predicate into an integer comparison and makes noding
# exact — it removes the entire class of robustness bug that CGAL's exact
# predicates exist to work around, at a cost (1/100 pt) far below any real
# drafting tolerance.
Q = 0.01
AXIS_TOL = 0.60      # a stroke this close to axis-aligned is a rule
MIN_LEN = 3.0        # shorter strokes are tick marks, hatching, arrowheads
THIN_RECT = 1.6      # a filled rect thinner than this IS a line (CAD idiom)
MIN_CELL_AREA = 12.0 # below this a face is a rounding artefact, not a cell
MIN_CELL_SIDE = 2.0  # a face thinner than this in EITHER axis is a slot between two
                     # coincident rules, not a cell — and it BRIDGES what it lies between
MAX_CELL_FRAC = 0.02  # above this share of the page a face is furniture, not a cell
MAX_CELL_HFRAC = 0.10 # a face taller than this share of the page is blank sheet, not a row
MIN_FILL_RATIO = 0.20 # n_cells vs rows*cols — a table tessellates, a plan does not

# A schedule pasted in as a PICTURE OF A SPREADSHEET has no strokes to read, so
# no vector method can see it — but the placement rectangle of the image is
# exact, and that rectangle IS the table region. Emitting it is the honest
# answer: it tells a downstream extractor precisely where to run OCR instead of
# silently returning nothing. Qualifying as one needs both tests, because
# either alone matches ordinary page art:
RASTER_MIN_AREA = 100_000.0  # pt^2 — roughly 5 x 4 inches placed; smaller is a logo
RASTER_MIN_PPP = 4.0         # source pixels per placed point. A screenshot of a
                             # spreadsheet is downsampled hard on placement (8-10
                             # measured); a photo or a rendering sits near 1.


def _q(v: float) -> float:
    return round(round(float(v) / Q) * Q, 2)


def segments_from_page(page) -> list[tuple]:
    """Axis-aligned rules as (x0, y0, x1, y1, width), top-left origin.

    Rects matter as much as lines: CAD exporters routinely emit a cell wall as
    a filled rectangle a few hundredths of a point wide rather than as a
    stroke. PyMuPDF's table finder collapses those to centrelines and so do we
    — skipping it loses most of the grid on some sheets.
    """
    segs: list[tuple] = []

    def add(x0, y0, x1, y1, w):
        x0, y0, x1, y1 = _q(x0), _q(y0), _q(x1), _q(y1)
        dx, dy = abs(x1 - x0), abs(y1 - y0)
        if dx <= AXIS_TOL and dy >= MIN_LEN:            # vertical
            x = _q((x0 + x1) / 2)
            segs.append((x, min(y0, y1), x, max(y0, y1), w))
        elif dy <= AXIS_TOL and dx >= MIN_LEN:          # horizontal
            y = _q((y0 + y1) / 2)
            segs.append((min(x0, x1), y, max(x0, x1), y, w))

    for ln in page.lines:
        add(ln["x0"], ln["top"], ln["x1"], ln["bottom"], float(ln.get("linewidth") or 0.0))

    for r in page.rects:
        x0, x1, t, b = r["x0"], r["x1"], r["top"], r["bottom"]
        w, h = abs(x1 - x0), abs(b - t)
        lw = float(r.get("linewidth") or 0.0)
        if w <= THIN_RECT and h >= MIN_LEN:             # thin rect used as a vertical rule
            add((x0 + x1) / 2, t, (x0 + x1) / 2, b, max(lw, w))
        elif h <= THIN_RECT and w >= MIN_LEN:           # ... as a horizontal rule
            add(x0, (t + b) / 2, x1, (t + b) / 2, max(lw, h))
        else:                                           # a real box: all four walls
            add(x0, t, x1, t, lw); add(x0, b, x1, b, lw)
            add(x0, t, x0, b, lw); add(x1, t, x1, b, lw)

    # Curves are NOT optional, and skipping them is the single biggest way to
    # get this wrong. pdfminer types a path as LTLine only for 2 points and
    # LTRect only for a closed axis-aligned 4 — EVERY other polyline, including
    # a whole table border drawn as one 40-segment run, is collapsed into one
    # LTCurve. Measured on 27_WA…#15: 1300 lines, ZERO rects, 7235 curves. Read
    # lines and rects only and you recover 143 segments and one table on a
    # sheet that draws six; decompose the curves and the grid appears.
    for cv in page.curves:
        pts = cv.get("pts") or []
        if len(pts) < 2:
            continue
        lw = float(cv.get("linewidth") or 0.0)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        cw, ch = max(xs) - min(xs), max(ys) - min(ys)

        # A THIN FILLED POLYGON IS A RULE, not a shape. CAD exporters emit a
        # cell wall as a filled sliver quad — e.g. on 017_MD…#14,
        # (1918,97)-(1918,98)-(2791,97): one unit tall across 873 wide,
        # linewidth 0. Decomposed edge-by-edge that reads as 0.07 degrees off
        # horizontal and every axis test rejects it, so the wall disappears.
        # Collapse to a centreline exactly as thin rects are, and take the
        # sliver's own thickness as its pen weight. This is how most grids in
        # this corpus are actually drawn: 4145 of 27_WA…#15's 7235 curves are
        # such slivers, 540 of 09_ME…#7's, 365 of 078_US…#23's.
        if ch <= THIN_RECT and cw >= MIN_LEN:
            add(min(xs), (min(ys) + max(ys)) / 2, max(xs), (min(ys) + max(ys)) / 2, max(lw, ch))
            continue
        if cw <= THIN_RECT and ch >= MIN_LEN:
            add((min(xs) + max(xs)) / 2, min(ys), (min(xs) + max(xs)) / 2, max(ys), max(lw, cw))
            continue

        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            add(ax, ay, bx, by, lw)

    return segs


def raster_regions(pdf_path: str, page_no: int = 1) -> list[tuple]:
    """Placement rects of embedded images that are pictures of tables.

    Measured on 017_MD…#14: all six VENTILATION SCHEDULEs on that sheet are
    Excel screenshots (the render still shows their "Add Rows" / "Delete Row"
    form buttons and the red cell-comment triangles). pdfplumber sees 15
    segments inside an 873x570 table box — the outer border and two dividers —
    and PyMuPDF's own path list agrees, because the grid is not in the content
    stream at all. Those six were six of vectorgrid's eleven corpus misses, and
    no amount of work on the ruling graph could ever have found them; scanning
    all 24 keyed sheets, they are also the ONLY six of the 122 keyed tables that
    are raster, which puts the vector path's true ceiling on this corpus at
    116/122.

    Uses PyMuPDF because pdfplumber does not expose image placement rects.
    """
    try:
        import pymupdf
    except ImportError:
        return []
    out = []
    with pymupdf.open(pdf_path) as doc:
        page = doc[page_no - 1]
        rot = page.rotation_matrix
        for im in page.get_images(full=True):
            px_w, px_h = im[2], im[3]
            for r in page.get_image_rects(im[0]):
                rr = r * rot            # image rects come back pre-rotation
                w, h = rr.x1 - rr.x0, rr.y1 - rr.y0
                if w <= 0 or h <= 0 or w * h < RASTER_MIN_AREA:
                    continue
                if (px_w / w + px_h / h) / 2 < RASTER_MIN_PPP:
                    continue
                out.append((rr.x0, rr.y0, rr.x1, rr.y1))
    return out


def _weight_index(segs: list[tuple]) -> dict:
    """Stroke weight looked up by quantised (axis, position) — so a polygon
    edge can be traced back to the pen that drew it."""
    idx: dict = {}
    for x0, y0, x1, y1, w in segs:
        key = ("v", _q(x0)) if x0 == x1 else ("h", _q(y0))
        idx[key] = max(idx.get(key, 0.0), w)
    return idx


def _h_index(segs: list[tuple]) -> dict:
    """Horizontal rules bucketed by rounded y, for the row-span widening."""
    idx: dict = defaultdict(list)
    for x0, y0, x1, y1, _w in segs:
        if y0 == y1:
            idx[round(y0)].append((x0, x1))
    return idx


def _widen_along_row_rules(hmap, gx0, gy0, gx1, gy1, rows) -> tuple:
    """Widen a block to the true span of the row rules its cells sit on.

    A table whose rows are ruled all the way across but whose VERTICALS stop
    partway is not a rare shape — it is the standard drawing list. Measured on
    08_ME…#1: 49 rows of SHEET NUMBER / SHEET NAME / SCALE / a checkbox block,
    with the row rules spanning the whole 656pt table and the only verticals in
    the 197pt checkbox strip at the right. polygonize closes faces only inside
    that strip (49 x 5, fill 1.000 — a perfect little grid), and throws the rest
    of every row rule away as a dangle. The region then sits 340pt to the right
    of its own caption and matches nothing.

    The dangles are the missing information. A row rule spans its table, so the
    rules the block already sits on say how wide the table really is. Only rules
    that themselves reach into the block's x-span count — no transitive chaining
    along touching linework — and a majority of rows must agree before the edge
    moves, so one long stray rule crossing a table cannot drag it open.
    """
    lo_votes, hi_votes = [], []
    for ry in rows:
        lo, hi = gx0, gx1
        for k in (ry - 1, ry, ry + 1):
            for a, b in hmap.get(k, ()):
                if b >= gx0 - 2 and a <= gx1 + 2:      # touches the block
                    lo = min(lo, a); hi = max(hi, b)
        lo_votes.append(lo); hi_votes.append(hi)

    n = max(1, len(rows))
    ext = [v for v in lo_votes if v < gx0 - 4]
    if len(ext) >= n * 0.6:
        gx0 = sorted(ext)[len(ext) // 2]
    ext = [v for v in hi_votes if v > gx1 + 4]
    if len(ext) >= n * 0.6:
        gx1 = sorted(ext)[len(ext) // 2]
    return (gx0, gy0, gx1, gy1)


def _v_index(segs: list[tuple]) -> dict:
    """Vertical rules bucketed by rounded x, for the column-span widening."""
    idx: dict = defaultdict(list)
    for x0, y0, x1, y1, _w in segs:
        if x0 == x1:
            idx[round(x0)].append((y0, y1))
    return idx


def _widen_along_col_rules(vmap, hmap, gx0, gy0, gx1, gy1, cols) -> tuple:
    """The same argument as _widen_along_row_rules, turned ninety degrees.

    A column wall spans its table, so when the header band is ruled vertically
    but not horizontally its faces never close and the block starts below its
    own header. On 08_ME…#1 all six checkbox walls begin at y=403.7, directly
    under the DRAWING LIST caption, while the first closed row is at 617.9 —
    212pt lower, far enough that the caption no longer sits at the top of the
    region and the table matches nothing.

    Extending vertically is more dangerous than extending horizontally, because
    stacked schedules routinely share one continuous column wall and following
    it would fuse them. So the extension stops at the first rule that spans the
    block: a full-width horizontal between here and there is another table's
    border, and nothing may cross it.
    """
    w = max(gx1 - gx0, 1.0)

    def blocked(a, b):
        """Is there a block-spanning horizontal strictly inside (a, b)?"""
        for k in range(int(a) - 1, int(b) + 2):
            for hx0, hx1 in hmap.get(k, ()):
                y = k
                if a + 2 < y < b - 2 and min(hx1, gx1) - max(hx0, gx0) >= w * 0.6:
                    return True
        return False

    top_votes, bot_votes = [], []
    for cx in cols:
        top, bot = gy0, gy1
        for k in (cx - 1, cx, cx + 1):
            for a, b in vmap.get(k, ()):
                if b >= gy0 - 2 and a <= gy1 + 2:      # touches the block
                    top = min(top, a); bot = max(bot, b)
        top_votes.append(top); bot_votes.append(bot)

    n = max(1, len(cols))
    ext = [v for v in top_votes if v < gy0 - 4]
    if len(ext) >= n * 0.6:
        cand = sorted(ext)[len(ext) // 2]
        if not blocked(cand, gy0):
            gy0 = cand
    ext = [v for v in bot_votes if v > gy1 + 4]
    if len(ext) >= n * 0.6:
        cand = sorted(ext)[len(ext) // 2]
        if not blocked(gy1, cand):
            gy1 = cand
    return (gx0, gy0, gx1, gy1)


def _border_weight(segs: list[tuple]) -> float | None:
    """The pen that draws table borders, if this sheet uses more than one.

    Refuses rather than guesses when the drawing is single-weight: splitting on
    a threshold that does not exist would fragment good tables, which is worse
    than the merge it was meant to prevent.
    """
    ws = sorted({round(w, 2) for *_r, w in segs if w > 0})
    if len(ws) < 2:
        return None
    heavy = ws[-1]
    return heavy if heavy >= ws[0] * 1.6 else None


def find_tables(pdf_path: str, page_no: int = 1) -> dict:
    """-> {tables: [{bbox, cells:[bbox], n_cells}], diagnostics: {...}}"""
    with pdfplumber.open(pdf_path) as doc:
        page = doc.pages[page_no - 1]
        segs = segments_from_page(page)
        chars = page.chars
        page_w, page_h = float(page.width), float(page.height)

    rasters = [{"bbox": b, "cells": [], "n_cells": 0, "raster": True}
               for b in raster_regions(pdf_path, page_no)]

    if not segs:
        return {"tables": rasters, "diagnostics": {"segments": 0, "rasters": len(rasters)}}

    widx = _weight_index(segs)
    hmap = _h_index(segs)
    vmap = _v_index(segs)
    bw = _border_weight(segs)

    # Faces of the arrangement. node() splits every stroke at every crossing —
    # without it GEOS silently fails to close polygons at unnoded intersections,
    # which is the single most common way this approach is got wrong.
    lines = MultiLineString([((x0, y0), (x1, y1)) for x0, y0, x1, y1, _ in segs])
    noded = node(lines)
    # polygonize_full takes a SEQUENCE of geometries; node() hands back a single
    # MultiLineString, so hand over its parts rather than the collection itself.
    parts = list(noded.geoms) if hasattr(noded, "geoms") else [noded]
    polys, cuts, dangles, invalid = polygonize_full(parts)

    # A face larger than this is page furniture — the sheet border, a viewport,
    # a detail frame — not a table cell. Leaving them in is not a cosmetic
    # problem: measured on 073_MT…#21, the drawing frame forms one 2176x1637
    # face that unions with everything inside it, swallowing all three margin
    # schedules and scoring 0/3 on a sheet whose tables are perfectly drawn.
    #
    # A SLIVER FACE IS A WELD, and it is the reason a perfectly drawn schedule
    # can vanish. When a table's own border is drawn 0.5pt inside the sheet
    # margin — routine, because the schedule block and the border come from
    # different CAD layers — the gap between the two rules polygonises into a
    # face 0.5 x 30, area 15, which clears MIN_CELL_AREA and then unions the
    # table to the drawing frame. Measured on 073_MT…#21: three margin
    # schedules, faces all present and exact, chained through two such slivers
    # at x 2356.4-2356.9 into a 65-face frame group spanning (180,46)-(2356,1683)
    # that the tessellation test then correctly rejects — 0/3 on a sheet whose
    # tables are drawn better than most. No cell holding text is 2pt across.
    page_area = max(1.0, float(page_w) * float(page_h))
    cells = []
    for g in polys.geoms:
        if not (MIN_CELL_AREA <= g.area <= page_area * MAX_CELL_FRAC):
            continue
        gx0, gy0, gx1, gy1 = g.bounds
        if min(gx1 - gx0, gy1 - gy0) < MIN_CELL_SIDE:
            continue
        # ... and neither is a tall blank. A cell's height is bounded by the
        # text it holds: even a merged multi-line header is a few line-heights.
        # The blank sheet BETWEEN two stacked blocks is not, and it welds them
        # exactly as a sliver does — on 073_MT…#21 the 270x341 gap between the
        # title block and the first schedule chained both into one region.
        if gy1 - gy0 > page_h * MAX_CELL_HFRAC:
            continue
        cells.append(g)
    if not cells:
        return {"tables": rasters,
                "diagnostics": {"segments": len(segs), "cells": 0, "rasters": len(rasters)}}

    # Adjacency, CUT at border-weight walls. Two schedules stacked on a shared
    # rule stay separate because that shared rule is drawn heavy.
    n = len(cells)
    parent = list(range(n))

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    # Bucket by row/column band so this is not O(n^2) over every cell pair.
    buckets: dict = defaultdict(list)
    for i, c in enumerate(cells):
        x0, y0, x1, y1 = c.bounds
        buckets[round(y0)].append(i)
        buckets[round(y1)].append(i)
        buckets[round(x0) + 100000].append(i)
        buckets[round(x1) + 100000].append(i)

    for group in buckets.values():
        for a in range(len(group)):
            for b in range(a + 1, len(group)):
                i, j = group[a], group[b]
                if find(i) == find(j):
                    continue
                ci, cj = cells[i], cells[j]
                shared = ci.intersection(cj)
                if shared.is_empty or shared.length < MIN_LEN:
                    continue
                sx0, sy0, sx1, sy1 = shared.bounds
                if bw is not None:
                    key = ("v", _q(sx0)) if abs(sx1 - sx0) < AXIS_TOL else ("h", _q(sy0))
                    if widx.get(key, 0.0) >= bw:
                        continue          # a border wall — do not merge across it
                union(i, j)

    groups: dict = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    # Merge back over-eager weight cuts, using column divergence as the test.
    #
    # A heavy stroke means "boundary", but not every boundary is a table
    # boundary — the rule under a header band is drawn just as heavy as the
    # table's own outer border, so cutting on weight alone shears headers off
    # their bodies (measured: SPLIT 14 -> 17 once curve decomposition raised
    # segment recall). Hu, Kashi, Lopresti & Wilfong (SPIE DRR VII, 2000)
    # framed table partitioning as an optimal cut maximising a table-quality
    # measure; the geometric form of that measure is column-set stability. Two
    # vertically adjacent blocks sharing most of their column x-positions are
    # one table split at an internal rule; genuinely separate schedules have
    # divergent column sets, which is exactly what the guillotine-admissibility
    # test in Jandhyala et al. (2009) formalises.
    def cols_of(members) -> set:
        cs = set()
        for i in members:
            x0, _y0, x1, _y1 = cells[i].bounds
            cs.add(round(x0)); cs.add(round(x1))
        return cs

    def vbounds(members):
        bs = [cells[i].bounds for i in members]
        return min(b[0] for b in bs), min(b[1] for b in bs), max(b[2] for b in bs), max(b[3] for b in bs)

    merged = True
    while merged:
        merged = False
        keys = list(groups)
        for a in range(len(keys)):
            for b in range(a + 1, len(keys)):
                ka, kb = keys[a], keys[b]
                if ka not in groups or kb not in groups:
                    continue
                ax0, ay0, ax1, ay1 = vbounds(groups[ka])
                bx0, by0, bx1, by1 = vbounds(groups[kb])
                # vertically stacked and nearly touching
                gap = by0 - ay1 if by0 >= ay1 else ay0 - by1
                if gap > 14:
                    continue
                overlap = min(ax1, bx1) - max(ax0, bx0)
                if overlap < min(ax1 - ax0, bx1 - bx0) * 0.6:
                    continue
                ca, cb = cols_of(groups[ka]), cols_of(groups[kb])
                inter = len({c for c in ca if any(abs(c - d) <= 2 for d in cb)})
                jacc = inter / max(1, min(len(ca), len(cb)))
                if jacc >= 0.6:                      # same columns => one table
                    groups[ka].extend(groups.pop(kb))
                    merged = True
                    break
            if merged:
                break

    import os as _os
    _dbg = _os.environ.get("VG_DEBUG")
    tables = []
    for members in groups.values():
        if _dbg:
            _b = [cells[i].bounds for i in members]
            _rs = {round(x[1]) for x in _b}; _cs = {round(x[0]) for x in _b}
            print(f"GROUP n={len(members):4d} rows={len(_rs):3d} cols={len(_cs):3d} "
                  f"fill={len(members)/max(1,len(_rs)*len(_cs)):.3f} "
                  f"bbox=({min(x[0] for x in _b):.0f},{min(x[1] for x in _b):.0f})->"
                  f"({max(x[2] for x in _b):.0f},{max(x[3] for x in _b):.0f})", file=sys.stderr)
        if len(members) < 4:              # a real schedule is a grid, not a box
            continue
        # GRID-NESS. A table divides in BOTH axes. A single column-strip is a
        # sliver of one, and emitting it both costs precision and blocks the
        # real table from matching its caption — measured on 08_ME…#1, where
        # the only region recovered for DRAWING LIST was a 197pt-wide
        # right-hand checkbox column. Kasar (ICDAR 2013) classifies candidate
        # ruled regions on exactly this kind of cheap geometric feature.
        colset = {round(cells[i].bounds[0]) for i in members}
        rowset = {round(cells[i].bounds[1]) for i in members}
        if len(colset) < 2 or len(rowset) < 2:
            continue
        # REGULARITY. A table TESSELLATES: its cells sit on a small number of
        # shared row and column coordinates, so n_cells is close to
        # n_rows x n_cols. Scattered plan linework produces almost as many
        # distinct coordinates as it does faces, so the same ratio collapses.
        # This is the computable form of Jandhyala et al.'s (2009) admissible
        # tessellation, and it is what separates a schedule from the drawing it
        # sits next to — measured on 073_MT#21, where 65 faces spread across
        # the whole framing plan chained into one region and buried all three
        # margin schedules.
        if len(members) < len(rowset) * len(colset) * MIN_FILL_RATIO:
            continue
        xs0, ys0, xs1, ys1 = zip(*(cells[i].bounds for i in members))
        bbox = _widen_along_row_rules(hmap, min(xs0), min(ys0), max(xs1), max(ys1),
                                      sorted({round(cells[i].bounds[1]) for i in members} |
                                             {round(cells[i].bounds[3]) for i in members}))
        bbox = _widen_along_col_rules(vmap, hmap, *bbox,
                                      sorted({round(cells[i].bounds[0]) for i in members} |
                                             {round(cells[i].bounds[2]) for i in members}))
        tables.append({
            "bbox": bbox,
            "cells": [cells[i].bounds for i in members],
            "n_cells": len(members),
        })
    # A raster region never overlaps a ruled one on the same table (there are no
    # rules inside a picture), but a picture pasted OVER linework can. Keep the
    # ruled region when one already covers the same ground.
    for r in rasters:
        rx0, ry0, rx1, ry1 = r["bbox"]
        area = max(1.0, (rx1 - rx0) * (ry1 - ry0))
        if any(max(0.0, min(t["bbox"][2], rx1) - max(t["bbox"][0], rx0))
               * max(0.0, min(t["bbox"][3], ry1) - max(t["bbox"][1], ry0)) > area * 0.5
               for t in tables):
            continue
        tables.append(r)
    tables.sort(key=lambda t: (t["bbox"][1], t["bbox"][0]))

    return {
        "tables": tables,
        "diagnostics": {
            "segments": len(segs), "cells": len(cells), "chars": len(chars),
            "rasters": len(rasters),
            "border_weight": bw, "weights": sorted({round(w, 2) for *_r, w in segs})[:8],
            "dangles": len(dangles.geoms), "cut_edges": len(cuts.geoms),
            "invalid_rings": len(invalid.geoms),
        },
    }


def main() -> int:
    pdf, page_no = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1
    out = find_tables(pdf, page_no)
    d = out["diagnostics"]
    print(f"segments={d.get('segments')} cells={d.get('cells')} "
          f"border_weight={d.get('border_weight')} weights={d.get('weights')}")
    print(f"dangles={d.get('dangles')} cut_edges={d.get('cut_edges')} "
          f"invalid_rings={d.get('invalid_rings')}   (CAD overshoots, free from polygonize_full)")
    print(f"\ntables found: {len(out['tables'])}")
    for i, t in enumerate(out["tables"]):
        x0, y0, x1, y1 = t["bbox"]
        print(f"  [{i:2d}] x{x0:7.0f},{y0:7.0f} -> {x1:7.0f},{y1:7.0f}  cells={t['n_cells']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
