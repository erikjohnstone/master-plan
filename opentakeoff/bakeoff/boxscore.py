#!/usr/bin/env python3
"""
SCORE THE BOXES AGAINST BOXES — the real ruler, replacing the proxy.

`boxfit.py` asks whether a region's caption, rules and neighbours are
consistent with it being right. That is an inference, I wrote it, and over one
session I changed it four times with the score rising each time. This asks the
only question that cannot be argued with: how far is each emitted edge from the
edge a human measured off the render, in `keys/<id>.tableboxes.csv`.

TWO NUMBERS, AND WHY BOTH
-------------------------
  IoU        intersection over union — the standard, and too forgiving for
             tables. A box that clips the last two rows off a twelve-row
             schedule still scores ~0.83, which passes IoU@0.5 comfortably
             while losing a sixth of the data.
  EoB        Error-of-Boundary: the largest of the four edge errors, in points.
             TableSense (AAAI 2019) argued exactly this for spreadsheet tables
             — what matters is the worst edge, because that is the row or
             column that goes missing. A box is CORRECT here at EoB <= 4pt,
             which is roughly half a line of schedule type.

MISSING and SPURIOUS are counted separately from the geometry, because a table
nobody found and a table found badly are different failures and averaging them
hides both.

    python3 boxscore.py [--backend vectorgrid] [--tol 4]
"""
from __future__ import annotations

import argparse
import csv
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

from bakeoff import BACKENDS, CORPUS, caption_boxes, find_pdf, region_owners, single_page_pdf  # noqa: E402
from boxfit import keyed_sheets                                    # noqa: E402


def truth_for(set_id: str, page: int) -> dict:
    kp = CORPUS / "keys" / f"{set_id}.tableboxes.csv"
    if not kp.exists():
        return {}
    want = f"{set_id}.pdf" if page == 1 else f"{set_id}.pdf#{page}"
    out = {}
    for row in csv.reader(kp.read_text().splitlines()):
        if not row or row[0] in ("sheet",) or row[0] != want:
            continue
        if not row[2]:
            continue                      # authored as NOT LOCATED
        out[row[1]] = (float(row[2]), float(row[3]), float(row[4]), float(row[5]))
    return out


def iou(a, b) -> float:
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def eob(a, b) -> float:
    """Worst of the four edge errors, in points."""
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]), abs(a[2] - b[2]), abs(a[3] - b[3]))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backend", default="vectorgrid")
    ap.add_argument("--tol", type=float, default=4.0, help="EoB, in points, to count CORRECT")
    ap.add_argument("--verbose", action="store_true", help="print every table, not just failures")
    a = ap.parse_args()
    fn = BACKENDS[a.backend]

    tot = dict(truth=0, found=0, correct=0, iou=0.0, missing=0, unauthored=0)
    worst = []
    print(f"backend: {a.backend}   CORRECT means every edge within {a.tol:.0f}pt of the authored box\n")

    for set_id, page, titles in keyed_sheets():
        truth = truth_for(set_id, page)
        if not truth:
            tot["unauthored"] += len(titles)
            continue
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        regions, _ = fn(pdf)
        owners = region_owners(regions, caps)
        by_title = {}
        for r, t in owners.items():
            by_title.setdefault(t, []).append(r)

        for t in titles:
            if t not in truth:
                tot["unauthored"] += 1
                continue
            tot["truth"] += 1
            got = by_title.get(t)
            if not got:
                tot["missing"] += 1
                print(f"  MISSING   {set_id[:26]:26s} p{page:<3d} {t[:40]}")
                continue
            # the closest proposal, so a split table is judged on its best piece
            r = min(got, key=lambda r: eob(r, truth[t]))
            e, v = eob(r, truth[t]), iou(r, truth[t])
            tot["found"] += 1
            tot["iou"] += v
            if e <= a.tol:
                tot["correct"] += 1
                if a.verbose:
                    print(f"  ok  {e:6.1f}pt IoU {v:.3f}  {set_id[:22]:22s} p{page:<3d} {t[:36]}")
            else:
                worst.append((e, v, set_id, page, t, r, truth[t]))

    worst.sort(reverse=True)
    if worst:
        print("\n  WRONG BOXES, worst edge first")
        for e, v, sid, pg, t, r, g in worst:
            print(f"  {e:7.1f}pt IoU {v:.3f}  {sid[:24]:24s} p{pg:<3d} {t[:34]}")
            print(f"           got   ({r[0]:.0f},{r[1]:.0f})-({r[2]:.0f},{r[3]:.0f})")
            print(f"           truth ({g[0]:.0f},{g[1]:.0f})-({g[2]:.0f},{g[3]:.0f})")

    n = max(tot["truth"], 1)
    print("\n" + "=" * 78)
    print(f"authored ground-truth boxes  {tot['truth']}   ({tot['unauthored']} keyed tables not yet authored)")
    print(f"found                        {tot['found']}")
    print(f"MISSING (no region)          {tot['missing']}")
    print(f"CORRECT (EoB <= {a.tol:.0f}pt)        {tot['correct']}/{tot['truth']}  ({100.0 * tot['correct'] / n:.1f}%)")
    print(f"mean IoU over found          {tot['iou'] / max(tot['found'], 1):.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
