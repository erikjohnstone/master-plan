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
from shapely.geometry import Point, box                       # noqa: E402
from shapely.strtree import STRtree                           # noqa: E402

from bakeoff import caption_boxes, find_pdf, single_page_pdf, region_owners  # noqa: E402
from boxfit import keyed_sheets                               # noqa: E402
from vectorgrid import find_tables                            # noqa: E402


def slot(pdf: Path, table: dict) -> tuple[dict, int, int, int]:
    """Chars of this table's region, dropped into its faces.

    -> (cell -> [chars], assigned, orphan, straddle)
    """
    from vectorgrid import page_origin
    with pdfplumber.open(pdf) as doc:
        chars = doc.pages[0].chars
        ox, oy = page_origin(doc.pages[0])
    if ox or oy:
        chars = [dict(c, x0=c["x0"] - ox, x1=c["x1"] - ox,
                      top=c["top"] - oy, bottom=c["bottom"] - oy) for c in chars]

    x0, top, x1, bot = table["bbox"]
    inside = [c for c in chars
              if x0 <= (c["x0"] + c["x1"]) / 2 <= x1
              and top <= (c["top"] + c["bottom"]) / 2 <= bot
              and (c.get("text") or "").strip()]
    if not table["cells"]:
        # A raster region has no faces by construction — it is a picture, and
        # its text is pixels. Counting its glyphs as orphans would punish the
        # one honest answer available for it.
        return {}, 0, 0, 0

    faces = [box(*b) for b in table["cells"]]
    tree = STRtree(faces)
    out: dict = defaultdict(list)
    assigned = orphan = straddle = 0
    for c in inside:
        p = Point((c["x0"] + c["x1"]) / 2, (c["top"] + c["bottom"]) / 2)
        hits = [i for i in tree.query(p) if faces[i].covers(p)]
        if not hits:
            orphan += 1
        elif len(hits) > 1:
            straddle += 1
        else:
            assigned += 1
            out[table["cells"][hits[0]]].append(c)
    return out, assigned, orphan, straddle


def cell_text(chars: list) -> str:
    """Reading order within one cell: lines top to bottom, glyphs left to
    right. Cells wrap, and a wrapped value is one value."""
    lines: dict = defaultdict(list)
    for c in chars:
        lines[round(c["top"] / 3)].append(c)
    parts = []
    for k in sorted(lines):
        run, prev = [], None
        for c in sorted(lines[k], key=lambda c: c["x0"]):
            # A PDF carries no spaces — a space is a gap the drawing program
            # left between two glyphs. Rebuild it from the gap, scaled to the
            # type, or every cell comes back as one run-together word.
            if prev is not None and c["x0"] - prev["x1"] > 0.22 * float(prev.get("size") or 8):
                run.append(" ")
            run.append(c["text"])
            prev = c
        parts.append("".join(run))
    return " ".join(p.strip() for p in parts).strip()


def show(set_id: str, page: int) -> int:
    pdf = single_page_pdf(find_pdf(set_id), page)
    titles = next(t for s, p, t in keyed_sheets() if s == set_id and p == page)
    caps = caption_boxes(pdf, titles)
    tables = find_tables(str(pdf), 1)["tables"]
    owners = region_owners([t["bbox"] for t in tables], caps)
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
        owners = region_owners([t["bbox"] for t in tables], caps)
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
