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
full of (measured: 7 merged regions, 27 truncated, 10 fragmented out of 122
keyed tables for pdfplumber-lines_strict, 45.9% clean).

Two changes fix both:

  1. Cells are FACES of the arrangement, not minimal rectangles. A spanning
     header cell is one big face; nothing is None.
  2. Tables are split on STROKE WEIGHT. In CAD output the table border is
     drawn on a heavier pen than the interior cell rules — that is what a pen
     table is for. Rasterising destroys line width, which is why no published
     method can use it (tabula-java's source literally reads
     `// TODO: how to implement color filter?`). We have it exactly, so cell
     adjacency is cut wherever the shared wall is a border-weight stroke.

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
        lw = float(cv.get("linewidth") or 0.0)
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            add(ax, ay, bx, by, lw)

    return segs


def _weight_index(segs: list[tuple]) -> dict:
    """Stroke weight looked up by quantised (axis, position) — so a polygon
    edge can be traced back to the pen that drew it."""
    idx: dict = {}
    for x0, y0, x1, y1, w in segs:
        key = ("v", _q(x0)) if x0 == x1 else ("h", _q(y0))
        idx[key] = max(idx.get(key, 0.0), w)
    return idx


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

    if not segs:
        return {"tables": [], "diagnostics": {"segments": 0}}

    widx = _weight_index(segs)
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

    cells = [g for g in polys.geoms if g.area >= MIN_CELL_AREA]
    if not cells:
        return {"tables": [], "diagnostics": {"segments": len(segs), "cells": 0}}

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

    tables = []
    for members in groups.values():
        if len(members) < 4:              # a real schedule is a grid, not a box
            continue
        xs0, ys0, xs1, ys1 = zip(*(cells[i].bounds for i in members))
        tables.append({
            "bbox": (min(xs0), min(ys0), max(xs1), max(ys1)),
            "cells": [cells[i].bounds for i in members],
            "n_cells": len(members),
        })
    tables.sort(key=lambda t: (t["bbox"][1], t["bbox"][0]))

    return {
        "tables": tables,
        "diagnostics": {
            "segments": len(segs), "cells": len(cells), "chars": len(chars),
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
