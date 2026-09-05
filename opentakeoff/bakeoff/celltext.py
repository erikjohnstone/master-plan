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
    # Keep SPACE glyphs. A PDF may or may not emit them; when it does, using
    # them beats guessing from inter-glyph gaps, and dropping them was
    # producing "HELICALPIER SCHEDULE" and "COLUMNSCHEDULE" on 073_MT#21 —
    # content errors invisible to a containment metric, which only ever asked
    # which face a glyph fell in. They are excluded from the containment counts
    # below, because a space is not content.
    inside = [c for c in chars
              if x0 <= (c["x0"] + c["x1"]) / 2 <= x1
              and top <= (c["top"] + c["bottom"]) / 2 <= bot
              and (c.get("text") or "")]
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
        ink = bool((c.get("text") or "").strip())
        if not hits:
            orphan += ink
        elif len(hits) > 1:
            straddle += ink
        else:
            assigned += ink
            out[table["cells"][hits[0]]].append(c)
    return split_unruled_columns(out), assigned, orphan, straddle


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
        ink = []
        for b in boxes:
            for c in cells[b]:
                if (c.get("text") or "").strip():
                    ink.append((c["x0"], c["x1"]))
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
                part = [c for c in cells[b] if lo <= (c["x0"] + c["x1"]) / 2 <= hi]
                if part:
                    out[(lo, b[1], hi, b[3])] = part
    return out


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
            if prev is not None and not (c["text"] or " ").isspace() \
                    and not (prev["text"] or " ").isspace() \
                    and c["x0"] - prev["x1"] > 0.22 * float(prev.get("size") or 8):
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
