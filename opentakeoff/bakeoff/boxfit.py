#!/usr/bin/env python3
"""
HOW GOOD ARE THE BOXES, not just how many captions they touch.

bakeoff.py answers "did a region land under this caption". That is recall, and
it is not enough to decide whether a region proposer can be trusted to hand
regions to a downstream extractor: a box clipped to the first two rows of a
twelve-row schedule scores exactly the same as a perfect one, and so does a box
that swallows the table below it. Both would wreck an extractor that trusts
them.

So this measures the three ways a region can be wrong while still "matching":

  MERGED    one region contains two or more keyed captions — it fused tables,
            and any extractor reading it will interleave two schedules
  SPLIT     two or more regions align to the same caption — the table was
            fragmented, so rows are lost unless the pieces are re-joined
  OVERRUN   the region's bottom edge crosses the NEXT caption in its own
            x-band — it is eating into the following table
  SHORT     the region stops above ruled rows that are still part of the table
            — the likeliest silent row-loss

THE EXTENT RULER, AND WHY IT IS NOT CAPTION SPACING
---------------------------------------------------
There is no hand-authored box ground truth in this corpus (the recall keys
record titles, which is what makes them cheap to author). The first version of
this script inferred extent from the captions themselves — a table runs from
its own caption down to the next caption in the same band — and that inference
is WRONG often enough to invert a result. Measured on 061_IA#58: it reported 7
of 13 tables SHORT; rendering the crops showed every one of those regions was
exactly right. HUMIDIFIER SCHEDULE is a caption, two header rows and ONE data
row; what follows is a REMARKS note and 73pt of blank sheet before the next
caption. Optimising a region proposer against that ruler teaches it to swallow
whitespace.

So extent is ruled by CONTENT: a region is SHORT only if a genuinely ruled row
survives below its bottom edge — a horizontal rule spanning at least half the
region's width, with a vertical cell wall running down to meet it. That is a
real row of a real table and nothing else is: a REMARKS underline is a
horizontal rule with no wall, and blank sheet is neither. The rules are read
straight from the content stream by `vectorgrid.segments_from_page`, which is
a pure geometry reader with no table logic in it, so this ruler is independent
of every backend it scores — including vectorgrid itself, which uses the same
segments but nothing about how they are grouped.

    python3 boxfit.py [--backend pdfplumber-lines_strict]
"""
from __future__ import annotations

import argparse
import csv
import sys
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

from bakeoff import BACKENDS, CORPUS, caption_boxes, find_pdf, single_page_pdf  # noqa: E402
from vectorgrid import segments_from_page  # noqa: E402


def page_rules(pdf_path):
    """(horizontals, verticals) for the page, as (a0, a1, coord) triples."""
    import pdfplumber
    with pdfplumber.open(pdf_path) as doc:
        segs = segments_from_page(doc.pages[0])
    hs = [(x0, x1, y0) for x0, y0, x1, y1, _w in segs if y0 == y1]
    vs = [(y0, y1, x0) for x0, y0, x1, y1, _w in segs if x0 == x1]
    return hs, vs


def ruled_row_below(hs, vs, region, limit):
    """Is there a real table row between the region's bottom edge and `limit`?

    Real means: a horizontal rule covering at least half the region's width,
    AND a vertical COLUMN wall — strictly inside the region's x-span, not one of
    its own edges — running from at or above the region's bottom edge down to
    that rule. All three conditions carry weight. The rule alone matches a
    REMARKS underline. Any wall matches a box drawn around notes: on 017_MD#14
    each pasted schedule sits inside a frame that also holds a NOTES block, and
    the frame's own left and right edges reach the rule under the notes, so
    without the interior test every correct region on that sheet reads SHORT.
    Requiring an interior wall means a genuine extra ROW, divided into columns.
    (A single-column table's lost row is invisible to this test; there are none
    in the key set.)
    """
    x0, _top, x1, bot = region
    w = max(x1 - x0, 1.0)
    for hx0, hx1, hy in hs:
        if not (bot + 4 <= hy <= limit - 4):
            continue
        if min(hx1, x1) - max(hx0, x0) < w * 0.5:
            continue
        for vy0, vy1, vx in vs:
            if not (x0 + 2 < vx < x1 - 2):
                continue
            # The wall must CROSS the bottom edge, not merely exist below it.
            # Continuity is the whole point: a column wall straddling the cut is
            # the same table carrying on, while structure that merely starts
            # lower down is the NEXT table and must not count against this one.
            if vy0 <= bot - 2 and vy1 >= bot + 6 and vy1 <= hy + 2:
                return True
    return False


def keyed_sheets():
    out = []
    for kp in sorted((CORPUS / "keys").glob("*.tables.csv")):
        set_id = kp.name[: -len(".tables.csv")]
        try:
            find_pdf(set_id)
        except SystemExit:
            continue
        by_page = defaultdict(list)
        for line in kp.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            row = next(csv.reader([line]))
            if row[0] == "sheet":
                continue
            page = int(row[0].split("#")[1]) if "#" in row[0] else 1
            by_page[page].append(row[1])
        for page, titles in sorted(by_page.items()):
            out.append((set_id, page, titles))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default="pdfplumber-lines_strict")
    a = ap.parse_args()
    fn = BACKENDS[a.backend]

    tot = dict(tables=0, located=0, matched=0, merged=0, split=0, overrun=0, short=0, regions=0)
    print(f"backend: {a.backend}\n")
    print(f"{'sheet':50s} {'n':>3s} {'hit':>4s} {'mrg':>4s} {'spl':>4s} {'ovr':>4s} {'sht':>4s}")
    print("-" * 78)

    for set_id, page, titles in keyed_sheets():
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        hs, vs = page_rules(pdf)
        regions, _ = fn(pdf)
        tot["tables"] += len(titles)
        tot["regions"] += len(regions)
        tot["located"] += sum(1 for v in caps.values() if v)

        # caption -> regions whose TOP this caption sits at
        match = defaultdict(list)
        for t, cp in caps.items():
            if not cp:
                continue
            cx0, ctop, cx1, cbot = cp
            cw = max(cx1 - cx0, 1)
            cmid = (ctop + cbot) / 2
            for r in regions:
                x0, top, x1, bot = r
                if cmid < top - 60 or cmid > top + 140:
                    continue
                if min(x1, cx1) - max(x0, cx0) >= cw * 0.5:
                    match[t].append(r)

        hit = sum(1 for t in match if match[t])
        split = sum(1 for t in match if len(match[t]) > 1)

        # a region holding two or more captions has fused tables
        merged = 0
        for r in regions:
            x0, top, x1, bot = r
            inside = [t for t, cp in caps.items() if cp
                      and top - 5 <= (cp[1] + cp[3]) / 2 <= bot + 5
                      and min(x1, cp[2]) - max(x0, cp[0]) >= max(cp[2] - cp[0], 1) * 0.5]
            if len(inside) > 1:
                merged += 1

        # vertical extent vs the next caption in the same band
        overrun = short = 0
        for t, rs in match.items():
            if not rs:
                continue
            cp = caps[t]
            nxt = None
            for t2, cp2 in caps.items():
                if t2 == t or not cp2 or cp2[1] <= cp[3]:
                    continue
                if min(cp[2], cp2[2]) - max(cp[0], cp2[0]) < max(cp[2] - cp[0], 1) * 0.3:
                    continue
                if nxt is None or cp2[1] < nxt:
                    nxt = cp2[1]
            bot = max(r[3] for r in rs)
            widest = max(rs, key=lambda r: r[2] - r[0])
            region = (widest[0], widest[1], widest[2], bot)
            if nxt is not None and bot > nxt + 10:
                overrun += 1
            # A row still ruled below the box is a row the extractor will not
            # read. Look as far as the next caption, or 400pt when this is the
            # last table in its band — far enough to catch a truncated schedule,
            # short enough not to reach the next unrelated block of linework.
            elif ruled_row_below(hs, vs, region, nxt if nxt is not None else region[3] + 400):
                short += 1

        tot["matched"] += hit; tot["merged"] += merged
        tot["split"] += split; tot["overrun"] += overrun; tot["short"] += short
        print(f"{(set_id[:36]+' p'+str(page)):50s} {len(titles):3d} {hit:4d} {merged:4d} {split:4d} {overrun:4d} {short:4d}")

    n = tot["tables"]
    print("\n" + "=" * 78)
    print(f"ground-truth tables      {n}")
    print(f"captions in text layer   {tot['located']}  ({100*tot['located']/n:.1f}%)")
    print(f"regions emitted          {tot['regions']}")
    print(f"MATCHED (recall)         {tot['matched']}/{n}  ({100*tot['matched']/n:.1f}%)")
    print(f"  of which SPLIT         {tot['split']}   (table fragmented across regions)")
    print(f"  of which OVERRUN       {tot['overrun']}   (box eats into the next table)")
    print(f"  of which SHORT         {tot['short']}   (a ruled row still stands below the box)")
    print(f"MERGED regions           {tot['merged']}   (one box holding 2+ captioned tables)")
    clean = tot["matched"] - tot["split"] - tot["overrun"] - tot["short"]
    print(f"\nCLEAN boxes              {clean}/{n}  ({100*clean/n:.1f}%)  <- usable as-is by a downstream extractor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
