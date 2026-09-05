#!/usr/bin/env python3
"""
CAN THE FACES ACTUALLY HOLD THE TEXT? — the tier after region proposal.

boxfit says the boxes are right. That is worth nothing on its own: what a
takeoff needs is the CELLS, and a region proposer that draws a perfect
rectangle around a schedule has done none of that work. This measures the
step that turns one into the other.

WHY THIS CAN BE MEASURED WITHOUT NEW GROUND TRUTH
-------------------------------------------------
Authoring cell-level keys for 122 tables is weeks of work. But a correct cell
decomposition has a property that can be checked against the document itself:
EVERY GLYPH INSIDE A TABLE BELONGS TO EXACTLY ONE CELL. That is not a
convention, it is what a ruled table is — a partition of its own area. So:

  ASSIGNED    the glyph's centre falls inside exactly one face
  ORPHAN      inside none — the faces do not tile the region, so a row or a
              column is missing and its text has nowhere to go
  STRADDLE    inside two or more — the faces overlap, which a planar
              arrangement's bounded faces cannot legitimately do

An orphan rate near zero is the strongest available evidence that the cell
structure is real, and every orphan is a glyph a downstream extractor would
drop. Nothing here is scored against the recall keys, so it cannot be gamed by
proposing more regions: it only ever asks whether the faces of the regions
already proposed tile the text they contain.

    python3 celltext.py                       # corpus-wide rate
    python3 celltext.py --show <set-id> <page>  # print the recovered grid
"""
from __future__ import annotations

import argparse
import sys
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import pdfplumber                                             # noqa: E402
import pymupdf                                                # noqa: E402
from shapely.geometry import Point, box                       # noqa: E402
from shapely.strtree import STRtree                           # noqa: E402

from bakeoff import detail_captions, caption_boxes, find_pdf, single_page_pdf, region_owners  # noqa: E402
from boxfit import keyed_sheets                               # noqa: E402
from vectorgrid import find_tables                            # noqa: E402


def page_words(pdf: Path, page_no: int = 1) -> list:
    """Words in our coordinate space, in the document's own reading order.

    THE TEXT ENGINE IS MuPDF, NOT PDFMINER, and the reason is measured. Judging
    our pdfminer-derived cell text against MuPDF over 9,603 cells found 169
    disagreements, and reading them showed pdfminer wrong in two systematic
    ways that a takeoff cannot survive:

      GLYPHS SILENTLY MISSING. 016_NY#18 reports the chars "1" and "3" with no
      separator between them, where the drawing says "1/3". Same for "208/3"
      -> "2083" (a voltage/phase becoming a four-digit number), "3/4" -> "34",
      "4-1/4 X 4-1/4" -> "4-14 X 4-14". pdfminer drops the glyph; MuPDF reads
      it. Nothing downstream could ever have noticed.

      ROTATED TEXT READ BACKWARDS, one character at a time. Vertical column
      headers are ordinary on a wide schedule, and 061_IA#58 returned
      "Y T I T N A U Q" for QUANTITY and "E P Y T R O T O M" for MOTOR TYPE —
      97 cells on that sheet alone.

    MuPDF assembles words itself, in reading order, with rotation handled, so
    both classes go away by using it. pdfminer stays as the JUDGE in
    cellaudit.py: two engines that disagree still mean a cell worth looking at,
    whichever one is wrong.

    Geometry still comes from pdfplumber — vectorgrid reads lines, rects and
    curves there — so this changes the text source only.
    """
    with pymupdf.open(pdf) as doc:
        page = doc[page_no - 1]
        rot = page.rotation_matrix
        out = []
        for x0, y0, x1, y1, w, blk, ln, wn in page.get_text("words"):
            r = pymupdf.Rect(x0, y0, x1, y1) * rot
            out.append((min(r.x0, r.x1), min(r.y0, r.y1),
                        max(r.x0, r.x1), max(r.y0, r.y1), w, blk, ln, wn))
    return out


def slot(pdf: Path, table: dict, page_no: int = 1) -> tuple[dict, int, int, int]:
    """Words of this table's region, dropped into its faces.

    -> (cell -> [words], assigned, orphan, straddle)

    The unit is a WORD, not a glyph. A word is what the document itself says
    belongs together, and using it removes a whole failure mode: 016_NY#18 was
    putting the final T of REFRIGERANT into the cell next door, which then read
    "TOTAL HEAT T REJECTION". A glyph can fall on the wrong side of a wall; a
    word is placed by its own centre, once.
    """
    words = page_words(pdf, page_no)
    x0, top, x1, bot = table["bbox"]
    inside = [w for w in words
              if x0 <= (w[0] + w[2]) / 2 <= x1
              and top <= (w[1] + w[3]) / 2 <= bot
              and (w[4] or "").strip()]
    if not table["cells"]:
        # A raster region has no faces by construction — it is a picture, and
        # its text is pixels. Counting its words as orphans would punish the
        # one honest answer available for it.
        return {}, 0, 0, 0

    faces = [box(*b) for b in table["cells"]]
    tree = STRtree(faces)
    out: dict = defaultdict(list)
    loose: list = []
    assigned = orphan = straddle = 0
    for w in inside:
        p = Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
        hits = [i for i in tree.query(p) if faces[i].covers(p)]
        if not hits:
            orphan += 1
            loose.append(w)
        elif len(hits) > 1:
            straddle += 1
        else:
            assigned += 1
            out[table["cells"][hits[0]]].append(w)
    out = split_unruled_columns(out)
    out = place_loose_text(out, loose, table["bbox"])
    return out, assigned, orphan, straddle


def place_loose_text(cells: dict, loose: list, bbox: tuple) -> dict:
    """Text inside the region that fell in no face is still the table's text.

    A schedule's header band is often ruled on its sides and not across, so its
    faces never close and its text lands nowhere: 08_ME#1's SHEET NUMBER /
    SHEET NAME / SCALE row is exactly that, and the row simply did not appear
    in the extraction. Corpus-wide that is 507 glyphs an extractor reading
    these cells would silently drop, which is the worst kind of loss because
    nothing signals it.

    They are placed on the column structure the REST of the region already
    establishes — never on a structure invented for them — so this can only put
    loose text into columns the drawing itself defines. If the region has no
    columns yet, the text is left alone rather than guessed at.
    """
    # Rotated glyphs are not row text. A drawing sets its issue-date column
    # sideways, and placing those characters as cells produces rows reading
    # "5", "2", "0".
    ink = [w for w in loose if (w[4] or "").strip()]
    if not ink or not cells:
        return cells
    edges = sorted({round(b[0], 1) for b in cells} | {round(b[2], 1) for b in cells})
    if len(edges) < 2:
        return cells

    lines: dict = defaultdict(list)
    for w in ink:
        lines[round(((w[1] + w[3]) / 2) / 6)].append(w)

    # A header that WRAPS is still one row. "SHEET NUMBER" set on two lines was
    # coming back as a row reading "SHEET" and another reading
    # "NUMBER | SHEET NAME | SCALE". Merge consecutive bands whose gap is less
    # than the leading — that is one block of text, not two rows.
    bands, cur = [], None
    for k in sorted(lines):
        b = lines[k]
        top, bot = min(w[1] for w in b), max(w[3] for w in b)
        h = max(bot - top, 1.0)
        if cur is not None and top - cur[1] < h * 0.7:
            cur[0] = min(cur[0], top); cur[1] = max(cur[1], bot); cur[2] += b
        else:
            if cur is not None:
                bands.append(cur)
            cur = [top, bot, list(b)]
    if cur is not None:
        bands.append(cur)

    for _t, _b, band in bands:
        top = min(w[1] for w in band)
        bot = max(w[3] for w in band)
        # THE COLUMN GRID MAY NOT CUT A WORD. This is what separates a header
        # row from the table's own caption: SHEET NUMBER / SHEET NAME / SCALE
        # falls in three columns with the edges landing in the gaps between
        # them, while "DRAWING LIST" centred over the table straddles an edge
        # and came back as "DRAW" | "ING LIST". If an edge lands inside a run
        # of ink, this band is not laid out on these columns and is left alone.
        runs = []
        for w in sorted(band, key=lambda w: w[0]):
            if runs and w[0] <= runs[-1][1] + 2.0:
                runs[-1][1] = max(runs[-1][1], w[2])
            else:
                runs.append([w[0], w[2]])
        if any(a + 0.5 < e < z - 0.5 for a, z in runs for e in edges):
            continue
        for lo, hi in zip(edges, edges[1:]):
            part = [w for w in band if lo <= (w[0] + w[2]) / 2 <= hi]
            if part:
                cells[(lo, top, hi, bot)] = part
    return cells


GUTTER_MIN = 6.0     # points of ink-free column inside a cell before it counts
GUTTER_ROWS = 3      # ... and this many rows must share it


def split_unruled_columns(cells: dict) -> dict:
    """Divide a cell whose column of siblings all leave the same gap.

    A drawing does not always rule every column it means. 08_ME#1's drawing
    list separates SHEET NUMBER from SHEET NAME with white space alone, so the
    ruling graph — correctly, on the evidence it has — returns one cell holding
    "G 000 CODE INFORMATION AND ASSEMBLIES". Geometric fidelity and useful
    extraction come apart there, and a takeoff needs the two apart. Measured:
    cell recall on that table is 25.9% while glyph containment says 100%.

    The evidence for the missing rule is in the text, not the ruling, so this
    lives here and not in vectorgrid: that module stays a reader of what was
    drawn. This is the projection profile every text-based extractor uses to
    find columns, with two constraints that stop it inventing structure — it
    may only act INSIDE one already-drawn cell, and the gutter must be free of
    ink in EVERY cell of that column, across at least three rows. One row's
    coincidental alignment cannot split anything.
    """
    bycol: dict = defaultdict(list)
    for b in cells:
        bycol[(round(b[0]), round(b[2]))].append(b)

    out: dict = {}
    for key, boxes in bycol.items():
        if len(boxes) < GUTTER_ROWS:
            out.update({b: cells[b] for b in boxes})
            continue
        x0, x1 = float(key[0]), float(key[1])
        ink = [(w[0], w[2]) for b in boxes for w in cells[b] if (w[4] or "").strip()]
        if not ink:
            out.update({b: cells[b] for b in boxes})
            continue
        ink.sort()
        merged = [list(ink[0])]
        for a, z in ink[1:]:
            if a <= merged[-1][1] + 0.5:
                merged[-1][1] = max(merged[-1][1], z)
            else:
                merged.append([a, z])
        cuts = [(m[1] + n[0]) / 2 for m, n in zip(merged, merged[1:])
                if n[0] - m[1] >= GUTTER_MIN]
        cuts = [c for c in cuts if x0 + 2 < c < x1 - 2]
        if not cuts:
            out.update({b: cells[b] for b in boxes})
            continue
        edges = [x0] + cuts + [x1]
        for b in boxes:
            for lo, hi in zip(edges, edges[1:]):
                part = [w for w in cells[b] if lo <= (w[0] + w[2]) / 2 <= hi]
                if part:
                    out[(lo, b[1], hi, b[3])] = part
    return out


def cell_text(words: list) -> str:
    """A cell's text in the order a reader sees it, whatever way it is set.

    ORIENTATION IS TAKEN FROM THE WORD'S OWN BOX, not from MuPDF's reported
    line direction, because that direction is wrong on exactly the sheets that
    need it: 061_IA#58's vertical column headers are reported dir=(1,0) while
    their boxes are 10pt wide and 65pt tall. Geometry cannot lie about which
    way a word runs.

    A word taller than it is wide is vertical type. Schedule headers set that
    way read BOTTOM TO TOP — the near-universal drafting convention, and what
    the words themselves say here: "OPERATING" sits below "WEIGHT(LBS)" and the
    header is OPERATING WEIGHT(LBS); "TOTAL" below "AIRFLOW" below "(CFM)" and
    the header is TOTAL AIRFLOW (CFM). So vertical cells are read up the
    column and across; horizontal cells along the line and down. Getting this
    wrong returned "Y T I T N A U Q" under one scheme and "WEIGHT(LBS)
    OPERATING" under the next.
    """
    if not words:
        return ""

    def vertical(w):
        return (w[3] - w[1]) > (w[2] - w[0]) * 1.3 and len((w[4] or "")) > 1

    tall = sum(1 for w in words if vertical(w))
    if tall * 2 > len(words):                      # a vertical cell
        h = max((w[2] - w[0] for w in words), default=8.0) or 8.0
        lines: dict = defaultdict(list)
        for w in words:
            lines[round(((w[0] + w[2]) / 2) / max(h * 0.6, 1.0))].append(w)
        return " ".join(
            " ".join(x[4] for x in sorted(lines[k], key=lambda x: -(x[1] + x[3])))
            for k in sorted(lines)).strip()

    h = max((w[3] - w[1] for w in words), default=8.0) or 8.0
    blocks = _side_by_side_blocks(words, h)
    if len(blocks) > 1:
        return " ".join(cell_text(b) for b in blocks).strip()

    lines = defaultdict(list)
    for w in words:
        lines[round(((w[1] + w[3]) / 2) / max(h * 0.6, 1.0))].append(w)
    return " ".join(
        " ".join(x[4] for x in sorted(lines[k], key=lambda x: x[0]))
        for k in sorted(lines)).strip()


def _side_by_side_blocks(words: list, h: float) -> list:
    """Split a cell's words where two COLUMNS OF PROSE stand next to each other.

    One cell often holds two independent blocks of notes, set side by side with
    nothing but white space between them, and reading such a cell line by line
    splices one into the other. Measured on 014_MT#4's PUMP SCHEDULE, where the
    cell holds a REMARKS list on the left and an ELECTRICAL DATA note on the
    right, that produces

        REMARKS: 1. PROVIDE 4" CONCRETE HOUSEKEEPING PAD UNDER EACH PUMP
        ELECTRICAL DATA: 2. PROVIDE VFD BY T.C. CONTRACTOR, TYP. ...

    — the second block spliced into the middle of the first list. 25 of the 175
    multi-line cells in this corpus (14.3%) are set this way, among them
    16_NV#3 where FOUR headings (GENERAL NOTES, UNIT FEATURES, AIR FILTER DATA,
    UNIT OPTIONS) run together before any of their contents. A takeoff quoting
    such a cell quotes nonsense.

    This is the reading-order half of what split_unruled_columns does for
    structure, and it is deliberately conservative, because most cells that
    merely wrap must NOT be split: a gap only counts when at least three
    distinct text lines stand on BOTH sides of it, so a heading that happens to
    be short, or one wrapped line that stops early, cannot cut a cell. The gap
    itself is measured against the type — 1.6 line heights — rather than a flat
    number of points, so it holds on a sheet drawn at any scale.
    """
    if len(words) < 8:
        return [words]
    gut = max(h * 1.6, 6.0)
    iv = sorted((w[0], w[2]) for w in words if (w[4] or "").strip())
    if not iv:
        return [words]
    merged = [list(iv[0])]
    for a, z in iv[1:]:
        if a <= merged[-1][1] + 0.5:
            merged[-1][1] = max(merged[-1][1], z)
        else:
            merged.append([a, z])
    band = max(h * 0.6, 1.0)
    cuts = []
    for m, n in zip(merged, merged[1:]):
        if n[0] - m[1] < gut:
            continue
        c = (m[1] + n[0]) / 2
        left = {round(((w[1] + w[3]) / 2) / band) for w in words if (w[0] + w[2]) / 2 < c}
        right = {round(((w[1] + w[3]) / 2) / band) for w in words if (w[0] + w[2]) / 2 > c}
        if len(left) < 3 or len(right) < 3:
            continue
        # A LABEL/VALUE FORM IS NOT TWO BLOCKS, and reading it by block breaks
        # it. 060_XX#75's panelboard header sets BUS ENTRY | B, FDR. BREAKER |
        # 600, DATE INST. | 1970, LAST PM DATE: | 2015 — four labels down the
        # left and their four values down the right. Line by line that pairs
        # each label with its value; block by block it emits all four labels and
        # then all four values, which is worse than what it replaced. Measured:
        # splitting it cost 4 cells of agreement with the pixel judge.
        #
        # What separates the two is that a form's columns RUN TOGETHER — one
        # line on the left for every line on the right — while two independent
        # blocks of prose do not: 014_MT#4's REMARKS list is seven lines beside
        # a three-line ELECTRICAL DATA note. So the split only stands where the
        # line counts differ materially, which errs toward leaving a cell alone.
        if min(len(left), len(right)) >= 0.8 * max(len(left), len(right)):
            continue
        cuts.append(c)
    if not cuts:
        return [words]
    edges = [float("-inf")] + cuts + [float("inf")]
    out = []
    for lo, hi in zip(edges, edges[1:]):
        part = [w for w in words if lo <= (w[0] + w[2]) / 2 < hi]
        if part:
            out.append(part)
    return out


def show(set_id: str, page: int) -> int:
    pdf = single_page_pdf(find_pdf(set_id), page)
    titles = next(t for s, p, t in keyed_sheets() if s == set_id and p == page)
    caps = caption_boxes(pdf, titles)
    tables = find_tables(str(pdf), 1)["tables"]
    owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))
    for t in tables:
        title = owners.get(t["bbox"])
        if not title:
            continue
        cells, a, o, s = slot(pdf, t)
        print(f"\n=== {title}   {a} assigned, {o} orphan, {s} straddle")
        rows: dict = defaultdict(list)
        for b, cs in cells.items():
            rows[round(b[1])].append((b[0], cell_text(cs)))
        for k in sorted(rows):
            line = " | ".join(txt for _x, txt in sorted(rows[k]))
            print(f"  {line[:150]}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", nargs=2, metavar=("SET_ID", "PAGE"))
    a = ap.parse_args()
    if a.show:
        return show(a.show[0], int(a.show[1]))

    tot = dict(tables=0, raster=0, assigned=0, orphan=0, straddle=0, cells=0, filled=0)
    print(f"{'sheet':46s} {'tbl':>4s} {'assigned':>9s} {'orphan':>7s} {'strad':>6s} {'rate':>7s}")
    print("-" * 84)
    for set_id, page, titles in keyed_sheets():
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        tables = find_tables(str(pdf), 1)["tables"]
        owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))
        sa = so = ss = n = 0
        for t in tables:
            if t["bbox"] not in owners:
                continue          # only score the regions that ARE keyed tables
            n += 1
            tot["tables"] += 1
            if not t["cells"]:
                tot["raster"] += 1
                continue
            cells, x, y, z = slot(pdf, t)
            sa += x; so += y; ss += z
            tot["cells"] += len(t["cells"])
            tot["filled"] += len(cells)
        tot["assigned"] += sa; tot["orphan"] += so; tot["straddle"] += ss
        d = sa + so + ss
        print(f"{(set_id[:32] + ' p' + str(page)):46s} {n:4d} {sa:9d} {so:7d} {ss:6d} "
              f"{(100.0 * sa / d if d else 0):6.1f}%")

    d = tot["assigned"] + tot["orphan"] + tot["straddle"]
    print("\n" + "=" * 84)
    print(f"keyed tables scored      {tot['tables']}  ({tot['raster']} raster, no faces to score)")
    print(f"glyphs in those regions  {d}")
    print(f"  ASSIGNED to one cell   {tot['assigned']}  ({100.0 * tot['assigned'] / max(d,1):.2f}%)")
    print(f"  ORPHAN (no cell)       {tot['orphan']}  ({100.0 * tot['orphan'] / max(d,1):.2f}%)")
    print(f"  STRADDLE (two cells)   {tot['straddle']}  ({100.0 * tot['straddle'] / max(d,1):.2f}%)")
    print(f"cells proposed           {tot['cells']}, of which {tot['filled']} hold text")
    print("\nORPHAN is the number that matters: every one is a glyph an extractor")
    print("reading these cells would silently drop.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
