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
full of. Measured on the same 122 hand-keyed tables, same ruler:

                            CLEAN         recall        mrg  spl  ovr  sht
    vectorgrid           121/122 99.2%  121/122 99.2%    0    0    0    0
    pdfplumber-lines      99/122 81.1%  114/122 93.4%   10   10    5    0
    pdfplumber-strict     89/122 73.0%  100/122 82.0%    7    7    4    0

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
are of that kind, all on one sheet: the ruling graph alone tops out at 116/122
and the placement rectangles carry the rest, before a single OCR call.

    python3 vectorgrid.py <pdf> <page>            # inspect one sheet
    (or import find_tables() — bakeoff.py registers it as a backend)
"""
from __future__ import annotations

import sys
from collections import defaultdict

import pdfplumber
import pymupdf
from bisect import bisect_left
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
MAX_CELL_HFRAC = 0.10 # a face taller than this share of the page is blank sheet, not a row
MAX_CELL_FRAC = 0.04  # ... and this share of its AREA is page furniture. Both are
                      # needed and the threshold is measured, not guessed: at the
                      # 0.02 it started at, it cut the TITLE BAND off every wide
                      # table (09_ME#7's is 2043 x 49.5 = 101,128pt^2 = 2.26% of
                      # the page, so both schedules there lost their title row and
                      # began 50pt low). Removing it altogether let 067_CA#8's
                      # title-block strip through — 3313 x 196, 96% of the page
                      # wide and 7.2% of its area — as a table. 0.04 sits above
                      # the largest real title band in the corpus and below the
                      # smallest piece of furniture.
MIN_FILL_RATIO = 0.20 # n_cells vs rows*cols — a table tessellates, a plan does not
MAX_REGION_WFRAC = 0.92 # a REGION this wide is the sheet's own furniture, not a
                      # schedule. A drawing has a border and margins, so nothing
                      # is drawn edge to edge: the widest real table in the key
                      # set is 85% of its page (016_NY#18's AHU schedule), while
                      # 067_CA#8's title-block strip is 96% and was being handed
                      # back as a table. Faces alone cannot catch this — the
                      # strip is a GROUP of ordinary-sized faces.

# A schedule pasted in as a PICTURE OF A SPREADSHEET has no strokes to read, so
# no vector method can see it — but the placement rectangle of the image is
# exact, and that rectangle IS the table region. Emitting it is the honest
# answer: it tells a downstream extractor precisely where to run OCR instead of
# silently returning nothing. Qualifying as one needs both tests, because
# either alone matches ordinary page art:
RASTER_MIN_AREA = 100_000.0  # pt^2 — roughly 5 x 4 inches placed; smaller is a logo
RASTER_WHITE = 0.62          # a pasted table is mostly paper
RASTER_RULES = 3             # ... crossed by at least this many full-width dark rules


def _q(v: float) -> float:
    return round(round(float(v) / Q) * Q, 2)


def page_origin(page) -> tuple:
    """The MediaBox corner pdfplumber measures everything from.

    A PDF page's MediaBox does not have to start at (0,0), and on real CAD
    output it often does not: 009_FL…#30 and 078_US…#23 are
    (-1512, 1080, 1512, 3240). pdfplumber reports raw MediaBox coordinates, so
    every char, line and rect on those sheets comes back shifted by
    (+1512, -1080) from where the page actually is. PyMuPDF and every renderer
    normalise to (0,0,W,H), so the two disagree by a constant.

    Nothing internal notices, which is exactly what makes it dangerous: the
    captions are shifted by the same amount as the regions, so the extractor
    matches them to each other happily and scores a clean 5/5 while every
    coordinate it emits is 1512pt off the page. It only shows up the moment a
    coordinate leaves this process — to crop a render, to highlight a cell in
    the UI, to hand a region to OCR. 32 of the 122 keyed tables sit on pages
    whose space is not the page's own.
    """
    mb = page.mediabox
    return float(mb[0]), float(mb[1])


def segments_from_page(page) -> list[tuple]:
    """Axis-aligned rules as (x0, y0, x1, y1, width), top-left origin.

    Rects matter as much as lines: CAD exporters routinely emit a cell wall as
    a filled rectangle a few hundredths of a point wide rather than as a
    stroke. PyMuPDF's table finder collapses those to centrelines and so do we
    — skipping it loses most of the grid on some sheets.
    """
    segs: list[tuple] = []
    ox, oy = page_origin(page)

    def add(x0, y0, x1, y1, w):
        x0, y0 = _q(x0 - ox), _q(y0 - oy)
        x1, y1 = _q(x1 - ox), _q(y1 - oy)
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
        elif r.get("stroke", True):                     # a real box: all four walls
            add(x0, t, x1, t, lw); add(x0, b, x1, b, lw)
            add(x0, t, x0, b, lw); add(x1, t, x1, b, lw)
        # A FILLED, UNSTROKED, NON-THIN RECT IS A SHAPE, NOT FOUR WALLS.
        # CAD masks the linework under a label with a white knockout box, and
        # those boxes outnumber the real rules: 233 of the 241 rects on
        # 001_NC…#49 are knockouts (stroke=False, fill=True, colour 1.0), each
        # exactly the size of the text it hides — e.g. 1707.7-1764.2 x
        # 339.6-353.6 behind the words "2109 COMM". Reading their four sides as
        # rules polygonises a spurious face around every label, NESTED inside
        # the real cell, so each glyph lands in two faces at once and any
        # extractor reading the cells double-counts the value. All 250 straddle
        # glyphs measured across the key set are this. A filled sliver is still
        # a rule (that is the CAD line idiom, handled above); a filled BOX is
        # not.

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
            for r in page.get_image_rects(im[0]):
                rr = r * rot            # image rects come back pre-rotation
                w, h = rr.x1 - rr.x0, rr.y1 - rr.y0
                if w <= 0 or h <= 0 or w * h < RASTER_MIN_AREA:
                    continue
                if not _image_is_a_table(doc, im[0]):
                    continue
                out.append((rr.x0, rr.y0, rr.x1, rr.y1))

    # ONE SCREENSHOT CAN BE PLACED AS SEVERAL IMAGES. 017_MD…#14 pastes
    # ACU-A-5 as two 437x874 rects side by side at x 1016-1454 and 1453-1891,
    # and ACU-A-3 likewise — so matching a caption to one rect claims half the
    # table and silently drops half the schedule. Merge rects that abut and
    # share their other extent: that is one picture, cut for placement.
    merged = True
    while merged:
        merged = False
        for i in range(len(out)):
            for j in range(i + 1, len(out)):
                a, b = out[i], out[j]
                same_rows = abs(a[1] - b[1]) <= 2 and abs(a[3] - b[3]) <= 2
                same_cols = abs(a[0] - b[0]) <= 2 and abs(a[2] - b[2]) <= 2
                touch_x = min(a[2], b[2]) >= max(a[0], b[0]) - 3
                touch_y = min(a[3], b[3]) >= max(a[1], b[1]) - 3
                if (same_rows and touch_x) or (same_cols and touch_y):
                    out[i] = (min(a[0], b[0]), min(a[1], b[1]),
                              max(a[2], b[2]), max(a[3], b[3]))
                    out.pop(j)
                    merged = True
                    break
            if merged:
                break
    return out


def _image_is_a_table(doc, xref: int) -> bool:
    """Does this embedded image LOOK like a table? Decide from its pixels.

    The first version of this used source-pixels-per-placed-point as a proxy —
    a spreadsheet screenshot is downsampled hard on placement (8-10 measured on
    017_MD#14) while a photo sits near 1. That proxy is wrong, and 067_CA#8
    proves it: its PCW RISER DIAGRAM SCHEDULE is a 645x659 image placed over
    740x757 points, 0.87 px/pt, and it is unmistakably a ruled table. The
    threshold was rejecting a real table for being low-resolution.

    Pixels are the evidence, so read the pixels. A pasted table is mostly paper
    and is crossed by long dark rules; a photograph or a rendered perspective is
    neither. Cheap — these images are a few hundred pixels square — and it
    generalises to any drawing instead of to one publisher's export settings.
    """
    try:
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n > 1:
            pix = pymupdf.Pixmap(pymupdf.csGRAY, pix)
        w, h = pix.width, pix.height
        if w < 40 or h < 40:
            return False
        # EVERY ROW, sampled columns. Sampling rows too was the bug: a rule three
        # pixels thick in a 3,636-pixel image is invisible at one row in
        # twenty-two, and 017_MD#14's spreadsheets — plainly ruled tables —
        # scored 1 to 4 rules and were rejected. Rows are cheap read straight
        # from the pixel buffer; it is columns that need thinning.
        buf = pix.samples
        stride = pix.stride
        xs = list(range(0, w, max(1, w // 200)))
        samples = dark = rules = 0
        for y in range(h):
            base = y * stride
            run = 0
            for x in xs:
                if buf[base + x] < 128:
                    run += 1
            dark += run
            samples += len(xs)
            if run >= len(xs) * 0.6:
                rules += 1
        white = 1.0 - (dark / max(samples, 1))
        return white >= RASTER_WHITE and rules >= RASTER_RULES
    except Exception:
        return False


SNAP_TOL = 0.30      # coordinates this close are the same rule, drawn twice
SNAP_OVERLAP = 1.0   # ... unless they run alongside each other, which makes them two


def _snap_grid(segs: list[tuple], tol: float = SNAP_TOL) -> list[tuple]:
    """Close the hairline gaps that stop a drawn table from polygonising.

    A face is a cell only if its four walls actually MEET. CAD exporters
    routinely emit a schedule as one little stroked rectangle per cell rather
    than as full-width rules, and the rectangles do not agree with each other
    to the last decimal: measured on 096_IN#19, the row rule under the MOTOR
    columns is drawn at y 579.48 for the HP/KW cell, y 579.47 for the RPM cell
    beside it and y 579.48 again for the next — one hundredth of a point apart.
    node() dutifully keeps them as three distinct lines, so the RPM cell has no
    closed boundary, no face is made for it, and the column is simply absent
    from the arrangement. The consequence is not one lost cell: the hole
    disconnects the faces to its left from the faces to its right, the table
    arrives as three side-by-side blocks, and the caption can only be owned by
    one of them. That page emitted 22 regions for 8 schedules; snapping brings
    it to 10, and every schedule to its caption.

    TWO RULES THAT RUN ALONGSIDE EACH OTHER ARE TWO RULES, however close. This
    is the whole difficulty, and getting it wrong is worse than not snapping at
    all. On 073_MT#21 the sheet frame runs down x 2356.44 for the full height
    of the page, and the schedules in the right margin draw their own right
    border at x 2356.32 and x 2356.56 — a tenth of a point either side of it.
    Merging those three coordinates hands every margin block a wall in common
    with the frame, faces close along it, and FOUNDATION FRAMING PLAN KEYNOTES
    welds onto HELICAL PIER SCHEDULE below it (measured: the box grew 120pt
    upward and two of the 122 keyed boxes went wrong). The distinction is not
    distance, it is OVERLAP: rules drawn per cell TILE — their spans along the
    other axis meet end to end and never lie side by side — whereas a border
    drawn just inside a frame runs beside it for hundreds of points. So a
    coordinate joins a cluster only when nothing at that coordinate overlaps
    anything already in it by more than SNAP_OVERLAP.

    Clustering against the cluster HEAD, not the previous value, stops a ladder
    of coordinates tol apart from chaining into one. The tolerance is far below
    anything a table can mean — MIN_CELL_SIDE is 2.0pt — so a seam this closes
    was never a cell.

    Endpoints are snapped to the rule coordinates too, without a vote of their
    own: the same rounding crosses axes, and on 096_IN#19 the wall sits at
    x 2058.36 while the row rule beside it starts at x 2058.37.
    """
    def heads(rules: dict) -> dict:
        """rules: coordinate -> list of (lo, hi) spans on the other axis."""
        out: dict = {}
        acc: dict = {}                       # head -> spans accumulated
        for v in sorted(rules):
            for h in sorted(acc, key=lambda h: abs(h - v)):
                if abs(v - h) > tol:
                    continue
                if any(min(a1, b1) - max(a0, b0) > SNAP_OVERLAP
                       for a0, a1 in rules[v] for b0, b1 in acc[h]):
                    continue                 # runs alongside: a separate rule
                out[v] = h
                acc[h].extend(rules[v])
                break
            else:
                out[v] = v
                acc[v] = list(rules[v])
        return out

    vr: dict = {}
    hr: dict = {}
    for x0, y0, x1, y1, _w in segs:
        if abs(x1 - x0) < abs(y1 - y0):
            vr.setdefault(x0, []).append((min(y0, y1), max(y0, y1)))
        else:
            hr.setdefault(y0, []).append((min(x0, x1), max(x0, x1)))
    mx, my = heads(vr), heads(hr)

    hx, hy = sorted(set(mx.values())), sorted(set(my.values()))

    def to(m: dict, hs: list, v: float) -> float:
        if v in m:
            return m[v]
        i = bisect_left(hs, v)
        best = None
        for j in (i - 1, i):
            if 0 <= j < len(hs):
                dd = abs(hs[j] - v)
                if dd <= tol and (best is None or dd < best[0]):
                    best = (dd, hs[j])
        return best[1] if best else v

    out = []
    for x0, y0, x1, y1, w in segs:
        a, b, c, d = to(mx, hx, x0), to(my, hy, y0), to(mx, hx, x1), to(my, hy, y1)
        if a == c and b == d:
            continue                         # snapped away to a point
        out.append((a, b, c, d, w))
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


def _split_at_title_bands(members, cells) -> list[list]:
    """Break a block wherever a SECOND title band begins.

    A schedule opens with an undivided full-width row — the band its title is
    printed in — and then divides into columns. So an undivided full-width row
    part-way down a block is a second table's title, and the block is two
    schedules that the stroke-weight cut failed to separate. This needs no text
    and no font size: it is the shape of the ruling alone.

    Measured on the two blocks that were still fusing tables:

      008_MO#16  (1857,469)-(2308,666), rows undivided at 469-483 and 573-587,
                 with 9-cell and 7-cell data rows between and after
      073_MT#21  (2087,511)-(2356,676), HELICAL PIER over FOOTING, both drawn
                 on the same 0.48 pen so no weight threshold can part them

    A RUN of undivided rows is one title stack, not several — a title over a
    spanning sub-header is routine — so only the first row of a run cuts.
    """
    if len(members) < 8:
        return [members]
    b = [cells[i].bounds for i in members]
    width = max(max(x[2] for x in b) - min(x[0] for x in b), 1.0)
    rows: dict = defaultdict(list)
    for i in members:
        rows[round(cells[i].bounds[1])].append(i)
    keys = sorted(rows)

    def undivided(k):
        ms = rows[k]
        if len(ms) != 1:
            return False
        x0, _y0, x1, _y1 = cells[ms[0]].bounds
        return x1 - x0 >= width * 0.9

    full = {k: undivided(k) for k in keys}
    cuts = [k for idx, k in enumerate(keys)
            if idx > 0 and full[k] and not full[keys[idx - 1]]]
    if not cuts:
        return [members]

    pieces, edges = [], [keys[0]] + cuts + [float("inf")]
    for lo, hi in zip(edges, edges[1:]):
        pieces.append([i for i in members if lo <= round(cells[i].bounds[1]) < hi])
    # Refuse the split unless every piece is still a table on its own — one
    # stray undivided row must not shave two cells off a good block.
    if any(len(p) < 4 or len({round(cells[i].bounds[1]) for i in p}) < 2 for p in pieces):
        return [members]
    return pieces


def _implied_edge_cells(bounds, bbox) -> list[tuple]:
    """Cells for the parts of a row that lie outside the closed faces.

    Widening a block to its row rules fixes the BOX but not the CELLS, and the
    cells are the point. 08_ME…#1's drawing list rules every row across its
    full 784pt but draws verticals only in the 197pt checkbox strip, so the
    faces cover a quarter of the table and 1088 of its 1434 glyphs — every
    sheet number, every sheet name — land in no cell at all.

    A row rule bounds a row for its whole length. So the stretch of a divided
    row between the block edge and its first face, or between its last face and
    the block edge, IS a cell: the drawing simply did not rule its sides. Only
    those two EDGE stretches are filled, never a gap between two faces — an
    interior gap means faces are missing from the middle of a row, which is a
    different fault and must not be papered over.
    """
    rows: dict = defaultdict(list)
    for b in bounds:
        rows[(round(b[1]), round(b[3]))].append(b)
    gx0, _gy0, gx1, _gy1 = bbox
    extra = []
    for bs in rows.values():
        if len(bs) < 2:                  # not a divided row — nothing to extend
            continue
        y0 = min(b[1] for b in bs); y1 = max(b[3] for b in bs)
        lo = min(b[0] for b in bs); hi = max(b[2] for b in bs)
        if lo - gx0 > MIN_LEN:
            extra.append((gx0, y0, lo, y1))
        if gx1 - hi > MIN_LEN:
            extra.append((hi, y0, gx1, y1))
    return extra


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
        segs = _snap_grid(segments_from_page(page))
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
    cells = []
    for g in polys.geoms:
        if not (MIN_CELL_AREA <= g.area <= page_w * page_h * MAX_CELL_FRAC):
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
                # Vertically stacked and nearly touching.
                #
                # A CONTINUATION IS ALLOWED A WIDER GAP, and only a
                # continuation. 034_NC#2 sets a 200-row sheet index in three
                # columns and breaks its ruled row groups with UNRULED section
                # labels — BLDG 47, 01 - GENERAL, 07-STRUCTURAL — that leave a
                # consistent 17pt of clear paper, three points past the flat
                # threshold, so a human's one table arrives as thirteen blocks
                # and the caption owns none of them.
                #
                # Simply raising the threshold in proportion to row height is
                # what NOT to do: measured, it took the keyed set from 122/122
                # to 119 and the held-out set from 89 to 86, because a gap of
                # about a row separates plenty of things that are not one table.
                # What makes this case safe is that the pieces are the SAME
                # COLUMN of the sheet resumed — identical left edge, identical
                # right edge, and effectively the same column set. Two different
                # schedules that happen to sit one above the other in a margin
                # agree on none of those. So the wider allowance is granted only
                # to a piece that is the one above it continued, and is capped
                # at four row heights; a genuine title band between two blocks is
                # cut back out by _split_at_title_bands below, which reads type
                # size and so knows a title when the geometry cannot.
                gap = by0 - ay1 if by0 >= ay1 else ay0 - by1
                if gap > 14:
                    if abs(ax0 - bx0) > 2 or abs(ax1 - bx1) > 2:
                        continue
                    hs = sorted(cells[i].bounds[3] - cells[i].bounds[1]
                                for i in groups[ka] + groups[kb])
                    if gap > 4.0 * hs[len(hs) // 2]:
                        continue
                    ca_, cb_ = cols_of(groups[ka]), cols_of(groups[kb])
                    same = len({c for c in ca_ if any(abs(c - d) <= 2 for d in cb_)})
                    if same < 0.9 * max(len(ca_), len(cb_)):
                        continue
                overlap = min(ax1, bx1) - max(ax0, bx0)
                if overlap < min(ax1 - ax0, bx1 - bx0) * 0.6:
                    continue
                ca, cb = cols_of(groups[ka]), cols_of(groups[kb])
                inter = len({c for c in ca if any(abs(c - d) <= 2 for d in cb)})
                jacc = inter / max(1, min(len(ca), len(cb)))
                if jacc < 0.6:                       # divergent columns => two tables
                    continue
                # A MERGE MUST NOT MAKE THE BLOCK LESS TABLE-SHAPED. Reuniting a
                # table that was sheared at its header band leaves it
                # tessellating; anything that drops the combined block below the
                # regularity gate was never the same table. Measured on
                # 001_NC#49: OUTDOOR AIR SCHEDULE tessellates on its own (50
                # faces, fill 0.278) and the merge dragged it to fill 0.186,
                # under the gate — so the sheet's only clean recovery of that
                # schedule was thrown away by the step meant to repair splits.
                both = groups[ka] + groups[kb]
                rs = {round(cells[i].bounds[1]) for i in both}
                cs = {round(cells[i].bounds[0]) for i in both}
                if len(both) < len(rs) * len(cs) * MIN_FILL_RATIO:
                    continue
                groups[ka] = both
                groups.pop(kb)
                merged = True
                break
            if merged:
                break

    import os as _os
    _dbg = _os.environ.get("VG_DEBUG")
    tables = []
    blocks = [p for m in groups.values() for p in _split_at_title_bands(m, cells)]
    for members in blocks:
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
        if max(xs1) - min(xs0) > page_w * MAX_REGION_WFRAC:
            continue
        bbox = _widen_along_row_rules(hmap, min(xs0), min(ys0), max(xs1), max(ys1),
                                      sorted({round(cells[i].bounds[1]) for i in members} |
                                             {round(cells[i].bounds[3]) for i in members}))
        bbox = _widen_along_col_rules(vmap, hmap, *bbox,
                                      sorted({round(cells[i].bounds[0]) for i in members} |
                                             {round(cells[i].bounds[2]) for i in members}))
        face_bounds = [cells[i].bounds for i in members]
        # Only when the box was actually widened along the row rules: that is
        # the one situation where a row is known to continue past its faces.
        if bbox[0] < min(xs0) - 1 or bbox[2] > max(xs1) + 1:
            face_bounds += _implied_edge_cells(face_bounds, bbox)
        tables.append({
            "bbox": bbox,
            "cells": face_bounds,
            "n_cells": len(face_bounds),
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
