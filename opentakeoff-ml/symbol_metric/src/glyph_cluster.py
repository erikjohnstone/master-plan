#!/usr/bin/env python3
"""Connected-component clustering of vector path primitives into glyph-shaped
candidate clusters -- an independent, from-scratch Python re-implementation
of the union-find-over-proximate-segments idea (not a copy of, or dependency
on, the shared production TypeScript pipeline, which this package must not
import per the goal doc's isolation requirement).

Given a PDF page, `cluster_page` groups every vector drawing primitive
(pymupdf's `page.get_drawings()` items) into connected components by
bounding-box proximity, then filters obvious non-symbol clusters (page
border rectangles, full-height gridlines, single dots/periods) by size and
aspect-ratio heuristics. Each surviving cluster is a candidate glyph: it may
be a real HVAC/BAS symbol, a text glyph mistaken for vector art, a table
ruling fragment, or noise -- structural (Pass A) and visual (Pass B) review
decide which, this module only proposes geometry.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import pymupdf  # type: ignore

# Page-space units are PDF points (1/72 in). A typical D-size HVAC sheet is
# ~3400x2200 pt; a real drawn symbol (diffuser hexagon, valve body, actuator)
# is roughly 8-40 pt across. Tune conservatively -- false positives (noise
# clusters) are cheap (Pass B rejects them), false negatives (merging two
# real adjacent symbols, or fragmenting one symbol) are not.
GAP_TOLERANCE_PT = 2.2
MIN_CLUSTER_AREA_PT2 = 30.0       # below this is almost always a tick/leader-stub/decimal fragment
MIN_CLUSTER_DIM_PT = 4.0          # both width and height must clear this (cuts thin ticks/dimension marks)
MAX_CLUSTER_FRAC_OF_PAGE = 0.15   # bigger than this is a border/titleblock/gridline run
MIN_ITEMS_PER_CLUSTER = 1
MAX_ASPECT_RATIO = 40.0           # a 40:1 sliver is almost always a ruling line, not a symbol


@dataclass
class GlyphCluster:
    bbox: tuple           # (x0, y0, x1, y1) in PDF point space, origin top-left
    n_items: int
    n_points: int
    stroke_only: bool
    fill_present: bool
    colors: list = field(default_factory=list)

    @property
    def width(self) -> float:
        return self.bbox[2] - self.bbox[0]

    @property
    def height(self) -> float:
        return self.bbox[3] - self.bbox[1]

    @property
    def area(self) -> float:
        return max(0.0, self.width) * max(0.0, self.height)

    @property
    def aspect_ratio(self) -> float:
        w, h = max(self.width, 1e-6), max(self.height, 1e-6)
        return max(w, h) / min(w, h)

    @property
    def centroid(self) -> tuple:
        return ((self.bbox[0] + self.bbox[2]) / 2, (self.bbox[1] + self.bbox[3]) / 2)


class _UnionFind:
    def __init__(self, n: int):
        self.parent = list(range(n))

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[ra] = rb


def _rects_close(a: tuple, b: tuple, tol: float) -> bool:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    # Expanded-rect overlap test == "within tol of touching".
    return not (
        ax1 + tol < bx0 or bx1 + tol < ax0 or
        ay1 + tol < by0 or by1 + tol < ay0
    )


def _grid_key(rect: tuple, cell: float) -> tuple:
    return (int(rect[0] // cell), int(rect[1] // cell))


def cluster_page(page: "pymupdf.Page", gap_tolerance: float = GAP_TOLERANCE_PT) -> list:
    """Returns a list of GlyphCluster, largest-first excluded, page-border
    excluded, sorted by area ascending (small symbols first -- usually the
    interesting ones on a plan sheet)."""
    drawings = page.get_drawings()
    if not drawings:
        return []

    page_area = page.rect.width * page.rect.height
    items = []
    for d in drawings:
        rect = d.get("rect")
        if rect is None:
            continue
        r = (rect.x0, rect.y0, rect.x1, rect.y1)
        w = r[2] - r[0]
        h = r[3] - r[1]
        if w <= 0 or h <= 0:
            continue
        items.append({
            "rect": r,
            "n_points": sum(len(it) for it in d.get("items", [])),
            "stroke": d.get("stroke") is not None or d.get("color") is not None,
            "fill": d.get("fill") is not None,
            "color": d.get("color"),
        })

    n = len(items)
    if n == 0:
        return []

    # Spatial bucketing so proximity checks are ~O(n) instead of O(n^2) on
    # dense sheets (some real sheets here carry tens of thousands of path
    # primitives).
    cell = max(gap_tolerance * 4, 20.0)
    buckets: dict = {}
    for i, it in enumerate(items):
        gx0, gy0 = _grid_key((it["rect"][0], it["rect"][1]), cell)
        gx1, gy1 = _grid_key((it["rect"][2], it["rect"][3]), cell)
        for gx in range(gx0 - 1, gx1 + 2):
            for gy in range(gy0 - 1, gy1 + 2):
                buckets.setdefault((gx, gy), []).append(i)

    uf = _UnionFind(n)
    seen_pairs = set()
    for key, idxs in buckets.items():
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                i, j = idxs[a], idxs[b]
                pair = (i, j) if i < j else (j, i)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                if _rects_close(items[i]["rect"], items[j]["rect"], gap_tolerance):
                    uf.union(i, j)

    groups: dict = {}
    for i in range(n):
        groups.setdefault(uf.find(i), []).append(i)

    clusters = []
    for members in groups.values():
        xs0 = [items[i]["rect"][0] for i in members]
        ys0 = [items[i]["rect"][1] for i in members]
        xs1 = [items[i]["rect"][2] for i in members]
        ys1 = [items[i]["rect"][3] for i in members]
        bbox = (min(xs0), min(ys0), max(xs1), max(ys1))
        gc = GlyphCluster(
            bbox=bbox,
            n_items=len(members),
            n_points=sum(items[i]["n_points"] for i in members),
            stroke_only=all(items[i]["stroke"] and not items[i]["fill"] for i in members),
            fill_present=any(items[i]["fill"] for i in members),
            colors=[items[i]["color"] for i in members if items[i]["color"]],
        )
        if gc.area < MIN_CLUSTER_AREA_PT2:
            continue
        if gc.width < MIN_CLUSTER_DIM_PT or gc.height < MIN_CLUSTER_DIM_PT:
            continue
        if page_area > 0 and gc.area / page_area > MAX_CLUSTER_FRAC_OF_PAGE:
            continue
        if gc.aspect_ratio > MAX_ASPECT_RATIO:
            continue
        clusters.append(gc)

    clusters.sort(key=lambda c: c.area)
    return clusters


def _iou_vs_any_word(bbox: tuple, words: list, min_overlap_frac: float = 0.4) -> bool:
    """True if bbox is substantially coincident with some text word's own
    bbox -- almost always a vector-drawn glyph stroke, underline, or leader
    stub touching its own caption/tag text rather than an isolated symbol.
    Real legend glyphs and plan symbols sit apart from their caption/tag
    with a visible gap."""
    bx0, by0, bx1, by1 = bbox
    barea = max(0.0, bx1 - bx0) * max(0.0, by1 - by0)
    if barea <= 0:
        return False
    for w in words:
        wx0, wy0, wx1, wy1 = w[0], w[1], w[2], w[3]
        ix0, iy0 = max(bx0, wx0), max(by0, wy0)
        ix1, iy1 = min(bx1, wx1), min(by1, wy1)
        iw, ih = max(0.0, ix1 - ix0), max(0.0, iy1 - iy0)
        inter = iw * ih
        if inter / barea >= min_overlap_frac:
            return True
    return False


def filter_symbol_candidates(clusters: list, words: list) -> list:
    """Drop clusters that are almost certainly vector-drawn text or
    leader/underline stubs touching their own caption, not isolated symbol
    art. Cheap noise reduction before evidence packets get built -- review
    passes still reject anything that slips through."""
    return [c for c in clusters if not _iou_vs_any_word(c.bbox, words)]


def nearest_text_run(bbox: tuple, words: list, max_dist: float = 60.0) -> Optional[dict]:
    """words: pymupdf page.get_text('words') output
    [(x0,y0,x1,y1,text,block,line,word), ...]. Returns the closest word run
    (merged consecutive words on the same line within a small gap) to the
    given bbox, preferring text to the right or below (typical legend-row
    and tag-callout layout), or None if nothing is within max_dist."""
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    best = None
    best_d = max_dist
    for w in words:
        wx0, wy0, wx1, wy1, text = w[0], w[1], w[2], w[3], w[4]
        if not text.strip():
            continue
        wcx, wcy = (wx0 + wx1) / 2, (wy0 + wy1) / 2
        d = ((wcx - cx) ** 2 + (wcy - cy) ** 2) ** 0.5
        # Mild preference for right/below placement (legend rows read
        # glyph-then-caption left to right; plan tags usually sit beside or
        # under their symbol).
        if wx0 < bbox[0] - 5 and wy0 < bbox[1] - 5:
            d *= 1.3
        if d < best_d:
            best_d = d
            best = {"bbox": (wx0, wy0, wx1, wy1), "text": text, "dist": d}
    return best
