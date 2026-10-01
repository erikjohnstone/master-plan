"""A picture of a schedule, read as a schedule (AS-153).

vectorgrid finds a table pasted into a sheet as a picture (raster_regions)
and, until now, could only say so: its rules are pixels, its text is ink, and
the ruling graph and the text layer both see nothing. 07_MO's M-601 is such a
sheet: its VAV BOX SCHEDULE (29 boxes), EXPANSION & BUFFER TANK SCHEDULE and
AIR DEVICE SCHEDULE are three spreadsheet images, and the takeoff read no unit
from it.

This module turns the picture back into what vectorgrid reads from a drawn
table, so the one table builder reads both:

  RULES FROM THE PIXELS. The region is rendered and every long, thin run of
  ink along a row or a column is a rule: a horizontal (vertical) opening of the
  dark pixels with a kernel longer than any letter's stroke keeps the rules and
  drops the type. Each rule becomes a stroke in page space with its own
  thickness as its weight, the shape segments_from_page gives a drawn rule.

  WORDS FROM THE INK. The same render, with the rules painted out (a rule
  touching a word would join it to its neighbour's), goes through RapidOCR
  (PP-OCR, ONNX), the engine cellocr.py already used as this repository's
  pixel judge. Each string it reads comes back with its box, in page space, in
  the shape page_words gives a typed word.

Nothing here decides what a table is: find_tables' own faces, tables and
guards decide that from these strokes exactly as from drawn ones, and slot()
drops these words into those faces as it drops typed ones.

OCR is optional. Without rapidocr_onnxruntime (bakeoff/requirements.txt) or
OpenCV, `available()` is False and a picture stays what it was: a raster
region with no cells.
"""
from __future__ import annotations

import os

# A rule is at least this long (points). The longest stroke in a letter of
# schedule type (7pt and under) is shorter; the shortest rule a schedule draws
# spans a cell, and no column a word fits in is this narrow.
MIN_RULE_PT = 9.0
# ... and at most this thick (points). A filled band is no rule.
MAX_RULE_PT = 2.5
# Ink is a pixel darker than this (0 black, 255 paper). Thin rules render grey.
INK = 170
# Render the picture at this resolution: enough for 5pt type to read
# (cellocr.py measured OCR losing small type below it), and at most the
# picture's own resolution would carry.
DPI = 200
# A grid's ink spans at least this much (points): two columns across, a
# header and a row down. A letter of any title is smaller.
GRID_W_PT = 30.0
GRID_H_PT = 18.0
# A string read with less confidence than this is not text.
MIN_CONF = 0.5

_engine = None


def available() -> bool:
    if os.environ.get("OPENTAKEOFF_RASTER_OCR", "1") == "0":
        return False
    try:
        import cv2  # noqa: F401
        import numpy  # noqa: F401
        from rapidocr_onnxruntime import RapidOCR  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def _ocr():
    global _engine
    if _engine is None:
        from rapidocr_onnxruntime import RapidOCR
        _engine = RapidOCR()
    return _engine


def _render(pdf_path: str, page_no: int, bbox: tuple):
    """The region as a grey image, and the image-to-page transform."""
    import numpy as np
    import pymupdf
    with pymupdf.open(pdf_path) as doc:
        page = doc[page_no - 1]
        # bbox is in the page's displayed (rotated) space, as raster_regions
        # gives it, and so is get_pixmap's clip: measured on 029_ME's ME601
        # (/Rotate 270), whose boiler schedule rendered transposed and blank
        # through the derotation matrix and whole through its own box.
        pix = page.get_pixmap(clip=pymupdf.Rect(*bbox), dpi=DPI, colorspace=pymupdf.csGRAY)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.stride)[:, :pix.width].copy()
    x0, y0, x1, y1 = bbox
    sx = (x1 - x0) / max(1, img.shape[1])
    sy = (y1 - y0) / max(1, img.shape[0])
    return img, (x0, y0, sx, sy)


def _rules(ink, horizontal: bool, min_px: int, max_px: int) -> tuple:
    """Rules along one axis, [(along0, along1, across_centre, thickness)] in
    px, and the mask of their pixels."""
    import cv2
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (min_px, 1) if horizontal else (1, min_px))
    runs = cv2.morphologyEx(ink, cv2.MORPH_OPEN, k)
    n, _lab, stats, _c = cv2.connectedComponentsWithStats(runs, connectivity=8)
    out = []
    for i in range(1, n):
        x, y, w, h, _a = stats[i]
        along0, along1, across, thick = (x, x + w, y + h / 2, h) if horizontal else (y, y + h, x + w / 2, w)
        if thick > max_px:
            continue
        out.append((along0, along1, across, thick))
    return out, runs


def read_region(pdf_path: str, page_no: int, bbox: tuple):
    """-> (segments, picture) for the picture at bbox, in page space.

    segments: (x0, y0, x1, y1, weight) as segments_from_page gives them.
    Nothing is read yet: picture.read(boxes) reads the words inside the
    tables the segments make (see Picture), so a picture that makes no table
    (a cover sheet's photograph, 96 s of OCR for nothing) costs a render.
    """
    import numpy as np
    img, (ox, oy, sx, sy) = _render(pdf_path, page_no, bbox)
    ink = (img < INK).astype(np.uint8)
    px_per_pt = 1.0 / max(sx, 1e-9)
    min_px = max(8, int(round(MIN_RULE_PT * px_per_pt)))
    max_px = max(2, int(round(MAX_RULE_PT * px_per_pt)))
    # RULES ARE THE GRID'S INK. A title's bold letters have strokes as long and
    # as thick as a rule (07_MO's VAV BOX SCHEDULE title, 14pt bold, lost its
    # letters' stems and bars to the rule mask and read "BOX SOHED"); what no
    # letter is, is part of a piece of ink spanning a grid. Rules are read only
    # from pieces of ink at least GRID_W_PT wide and GRID_H_PT tall: any closed
    # cell is one, and so is every rule that meets the table's walls.
    import cv2
    n, lab, stats, _c = cv2.connectedComponentsWithStats(ink, connectivity=8)
    big = np.zeros(n, dtype=bool)
    big[1:] = (stats[1:, cv2.CC_STAT_WIDTH] >= GRID_W_PT * px_per_pt) & (stats[1:, cv2.CC_STAT_HEIGHT] >= GRID_H_PT * px_per_pt)
    grid = big[lab].astype(np.uint8)
    hr, hmask = _rules(grid, True, min_px, max_px)
    vr, vmask = _rules(grid, False, min_px, max_px)

    # A rule's pixels stop where its neighbour's begin, a pixel or two short of
    # the other rule's centre line; the ruling graph needs them to cross.
    reach = max_px
    segs = []
    for a0, a1, c, t in hr:
        y = oy + c * sy
        segs.append((ox + (a0 - reach) * sx, y, ox + (a1 + reach) * sx, y, t * sy))
    for a0, a1, c, t in vr:
        x = ox + c * sx
        segs.append((x, oy + (a0 - reach) * sy, x, oy + (a1 + reach) * sy, t * sx))

    clean = img.copy()
    clean[(hmask | vmask) > 0] = 255
    _erase_outlines(clean)
    return segs, Picture(clean, (ox, oy, sx, sy))


def _same_place(a, b) -> bool:
    """Two word boxes over one another: their overlap is most of each."""
    ix = min(a[2], b[2]) - max(a[0], b[0])
    iy = min(a[3], b[3]) - max(a[1], b[1])
    if ix <= 0 or iy <= 0:
        return False
    inter = ix * iy
    return inter >= 0.6 * (a[2] - a[0]) * (a[3] - a[1]) and inter >= 0.6 * (b[2] - b[0]) * (b[3] - b[1])


class Picture:
    """A picture's ink, rules painted out: its tables read once whole
    (read), and each face again on its own where that reading is doubtful
    (refine). words: (x0, y0, x1, y1, text, block, line, word) as page_words
    gives them."""

    # A face is read again when the whole-picture pass read it with less
    # confidence than this, or left this share of its ink outside every word.
    SURE = 0.92
    INK_READ = 0.85

    def __init__(self, clean, xf):
        self.clean, self.xf, self.words, self.conf = clean, xf, [], []

    def read(self, boxes) -> None:
        """OCR the picture inside each box (a table's bbox, page space), in
        tiles cut on blank lines (_tiles)."""
        import numpy as np
        ox, oy, sx, sy = self.xf
        done: list = []
        for box in boxes:
            # Only where this box overlaps one already read can a word repeat.
            again = any(min(box[2], d[2]) > max(box[0], d[0]) and min(box[3], d[3]) > max(box[1], d[1]) for d in done)
            done.append(box)
            c0, r0, c1, r1 = self._px(box)
            region = self.clean[r0:r1, c0:c1]
            for ty0, ty1, tx0, tx1 in _tiles(region):
                tile = region[ty0:ty1, tx0:tx1]
                if tile.size == 0 or tile.min() >= INK:
                    continue
                res, _elapse = _ocr()(np.stack([tile] * 3, axis=-1))
                for quad, text, conf in res or []:
                    text = (text or "").strip()
                    if not text or float(conf) < MIN_CONF:
                        continue
                    qx = [c0 + tx0 + p[0] for p in quad]
                    qy = [r0 + ty0 + p[1] for p in quad]
                    word = (ox + min(qx) * sx, oy + min(qy) * sy, ox + max(qx) * sx, oy + max(qy) * sy)
                    # Two tables' boxes can overlap (082_OR's M002: a notes
                    # band under one table and the next table's header), so
                    # the overlap is read twice: a word read again where it
                    # was read is the same word.
                    if again and any(_same_place(word, w) for w in self.words):
                        continue
                    self.words.append((*word, text, 0, 0, len(self.words)))
                    self.conf.append(float(conf))

    def _px(self, box):
        ox, oy, sx, sy = self.xf
        x0, y0, x1, y1 = box
        return (max(0, int((x0 - ox) / sx)), max(0, int((y0 - oy) / sy)),
                min(self.clean.shape[1], int((x1 - ox) / sx) + 1), min(self.clean.shape[0], int((y1 - oy) / sy) + 1))

    def _ink_read(self, face, ws) -> float:
        """The share of the face's ink inside its words' boxes."""
        import numpy as np
        c0, r0, c1, r1 = self._px(face)
        ink = self.clean[r0:r1, c0:c1] < INK
        total = int(ink.sum())
        if not total:
            return 1.0
        cover = np.zeros_like(ink)
        for w in ws:
            a0, b0, a1, b1 = self._px(w[:4])
            cover[max(0, b0 - r0 - 2):max(0, b1 - r0 + 2), max(0, a0 - c0 - 2):max(0, a1 - c0 + 2)] = True
        return float((ink & cover).sum()) / total

    def refine(self, faces) -> list:
        """The words, with each doubtful face's words read again on their own
        and kept when that reading is surer: a face with ink and no words, a
        word read with little confidence, or ink no word covers."""
        inside = {}
        for i, w in enumerate(self.words):
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            for f in faces:
                if f[0] <= cx <= f[2] and f[1] <= cy <= f[3]:
                    inside.setdefault(f, []).append(i)
                    break
        drop, add = set(), []
        for f in faces:
            idx = inside.get(f, [])
            ws = [self.words[i] for i in idx]
            sure = min((self.conf[i] for i in idx), default=0.0)
            if ws and sure >= self.SURE and self._ink_read(f, ws) >= self.INK_READ:
                continue
            again, conf = _read_box(self.clean, self.xf, f)
            if not again:
                continue
            mean_again = sum(conf) / len(conf)
            mean_first = sum(self.conf[i] for i in idx) / len(idx) if idx else 0.0
            ink_again, ink_first = self._ink_read(f, again), self._ink_read(f, ws)
            # Kept when it reads clearly more of the face's ink ("VAV" over
            # "6", where the whole pass read only "6"), or as much with more
            # confidence ("VAV 8" for "VAL 8").
            if not ws or ink_again > ink_first + 0.05 or (ink_again >= ink_first - 0.02 and mean_again >= mean_first):
                drop.update(idx)
                add.extend(again)
        return [w for i, w in enumerate(self.words) if i not in drop] + add


def _read_box(clean, xf: tuple, face: tuple) -> list:
    """One face's words, read from its own crop. The detector reads a whole
    picture at its own scale and misses type set lighter and smaller than the
    rest (07_MO's VAV marks: "VAV" over "5" in a hairline font, read on their
    own and lost in the whole); a crop this small it enlarges first. Only for
    a face that holds ink and got no words."""
    import numpy as np
    ox, oy, sx, sy = xf
    x0, y0, x1, y1 = face
    # Inside the face's walls, which the rule mask has already painted out.
    c0 = max(0, int((x0 - ox) / sx) + 1)
    r0 = max(0, int((y0 - oy) / sy) + 1)
    c1 = min(clean.shape[1], int((x1 - ox) / sx))
    r1 = min(clean.shape[0], int((y1 - oy) / sy))
    crop = clean[r0:r1, c0:c1]
    if crop.size == 0 or (crop < INK).sum() < 12:
        return [], []
    res, _elapse = _ocr()(np.stack([crop] * 3, axis=-1))
    out, confs = [], []
    for quad, text, conf in res or []:
        text = (text or "").strip().strip("/\\|")
        if not text or float(conf) < MIN_CONF:
            continue
        qx = [c0 + p[0] for p in quad]
        qy = [r0 + p[1] for p in quad]
        out.append((ox + min(qx) * sx, oy + min(qy) * sy, ox + max(qx) * sx, oy + max(qy) * sy,
                    text, 0, 0, 0))
        confs.append(float(conf))
    return out, confs


# OCR reads a tile at most this many pixels on a side. RapidOCR shrinks a
# larger image to 2,000 before detecting text, which halves a schedule's
# 200 dpi type and loses its header row (measured on 07_MO M-601's VAV BOX
# SCHEDULE: MARK, SUPPLY, SERVES ... read at 1,645 px, gone at 3,870).
TILE_PX = 1800


def _cuts(ink_along, n: int) -> list:
    """Where to cut an axis of n pixels into pieces of at most TILE_PX: on a
    line of pixels with no ink across the band (no word is cut), the last
    one in the piece's final two-thirds; a band with none is cut at the limit.
    `ink_along[i]` is the ink on line i (the rules are already painted out)."""
    cuts, start = [0], 0
    while n - start > TILE_PX:
        lim = start + TILE_PX
        blank = [k for k in range(lim, start + TILE_PX // 3, -1) if ink_along[k] == 0]
        start = blank[0] if blank else lim
        cuts.append(start)
    cuts.append(n)
    return cuts


def _tiles(clean):
    """Tiles of the cleaned picture: bands cut on blank rows, each band cut
    on columns blank across that band."""
    import numpy as np
    ink = clean < INK
    h, w = ink.shape
    ys = _cuts(ink.sum(axis=1), h)
    for y0, y1 in zip(ys, ys[1:]):
        xs = _cuts(ink[y0:y1].sum(axis=0), w)
        for x0, x1 in zip(xs, xs[1:]):
            yield y0, y1, x0, x1


def _erase_outlines(img) -> None:
    """Paint out ink that is a drawn outline, not type: a hexagon or circle
    around a mark ("VAV 1" in a hexagon read "NAV 1" and "/VAV 11/", its
    slanted sides taken for letters). An outline is a connected piece of ink
    much taller AND much wider than the type around it and mostly hollow; a
    letter, even of a title, is neither. Only its ring is painted out (the
    band along its convex hull): type set tight inside it touches the ring,
    joins its piece of ink, and must stay."""
    import cv2
    import numpy as np
    ink = (img < INK).astype(np.uint8)
    n, lab, stats, _c = cv2.connectedComponentsWithStats(ink, connectivity=8)
    if n < 3:
        return
    hs = stats[1:, cv2.CC_STAT_HEIGHT]
    hs = hs[hs >= 3]
    if not len(hs):
        return
    th = float(np.median(hs))
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if h > 1.3 * th and _slanted_stroke(lab[y:y + h, x:x + w] == i, th):
            img[y:y + h, x:x + w][lab[y:y + h, x:x + w] == i] = 255
            continue
        if not (h > 2.2 * th and w > 2.2 * th and area < 0.25 * w * h):
            continue
        piece = (lab[y:y + h, x:x + w] == i).astype(np.uint8)
        pts = cv2.findNonZero(piece)
        hull = cv2.convexHull(pts)
        # The band is the outline's own stroke (its ink over the hull's
        # perimeter) and a little: a letter set against the outline keeps
        # all but the pixels it shares with it ("/AV" for "VAV" with a band
        # a third of the type tall).
        stroke = area / max(1.0, cv2.arcLength(hull, True))
        ring = np.zeros_like(piece)
        cv2.polylines(ring, [hull], True, 1, thickness=max(2, int(round(2.5 * stroke))))
        sub = img[y:y + h, x:x + w]
        sub[(piece & ring) > 0] = 255


def _slanted_stroke(piece, th: float) -> bool:
    """A thin straight stroke at a slant, longer than the type is tall: a side
    of a hexagon or diamond drawn around a mark (07_MO's VAV tags are four such
    strokes, read as "/" and "N"). A slash in type is no taller than a capital;
    a stroke at 15 to 75 degrees this long is no letter's."""
    import numpy as np
    ys, xs = np.nonzero(piece)
    if len(xs) < 8:
        return False
    cov = np.cov(np.vstack([xs, ys]).astype(float))
    vals, vecs = np.linalg.eigh(cov)
    if vals[0] <= 0:
        vals[0] = 1e-6
    if vals[1] / vals[0] < 25:          # elongation 5:1 or more
        return False
    length = (12 * vals[1]) ** 0.5
    if length < 1.4 * th:
        return False
    vx, vy = vecs[:, 1]
    ang = abs(np.degrees(np.arctan2(vy, vx))) % 180
    ang = min(ang, 180 - ang)
    return 15 <= ang <= 75
