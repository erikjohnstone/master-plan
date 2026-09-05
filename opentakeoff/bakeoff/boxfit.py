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
  SHORT     the region stops well above the next caption, leaving a gap where
            real rows almost certainly live — the likeliest silent row-loss

There is no hand-authored box ground truth in this corpus (the recall keys
record titles, which is what makes them cheap to author), so "correct extent"
is inferred from the captions themselves: a table runs from its own caption
down to the next caption in the same column band. That is an approximation and
is stated as one — it is a good approximation on schedule sheets, where
captions are exactly what separates stacked tables.

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
            if nxt is not None:
                if bot > nxt + 10:
                    overrun += 1
                elif nxt - bot > (nxt - cp[3]) * 0.35:   # stops >35% short of the gap
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
    print(f"  of which SHORT         {tot['short']}   (box stops well above the next caption)")
    print(f"MERGED regions           {tot['merged']}   (one box holding 2+ captioned tables)")
    clean = tot["matched"] - tot["split"] - tot["overrun"] - tot["short"]
    print(f"\nCLEAN boxes              {clean}/{n}  ({100*clean/n:.1f}%)  <- usable as-is by a downstream extractor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
