#!/usr/bin/env python3
"""
The pixel judge, pointed at PRODUCTION — the same third judge, same sheets.

cellocr.py renders each table and asks RapidOCR what the ink says, then
compares that with what we read out of the content stream. 18,189 vectorgrid
cells went through it: 16,067 confirmed, 0 failures traced to us. This runs the
identical judge over production's own extracted cells on the identical 33
keyed sheets, so "how many cells did each engine get right" has an answer at
scale rather than only on the 905 hand-transcribed ones.

WHAT THIS MEASURES, AND WHAT IT DOES NOT
----------------------------------------
The question the pixel judge asks is "is this the text inside this box". It is
therefore GENEROUS to a fused cell: where production merges three drawn columns
and reads "5 55.4 149", OCR reads the same three numbers inside the same box
and CONFIRMS it. The value is unusable to an estimator — nothing says which
number is the pressure drop — but it is not a text error, and this judge is not
the one that catches it. headtohead.py is; it scores against the drawn grid and
fails every fused cell.

So read the two together: this is how much text each engine reads correctly,
headtohead.py is how much of it lands where a human says it belongs.

    python3 prodocr.py [--zoom 4] [--set <id>]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from bakeoff import find_pdf, single_page_pdf      # noqa: E402
from boxfit import keyed_sheets                    # noqa: E402
from cellocr import norm, ocr_cells, squash        # noqa: E402
from headtohead import RENDER_SCALE, production_graph  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set")
    ap.add_argument("--zoom", type=float, default=4.0)
    a = ap.parse_args()

    tot = dict(tables=0, cells=0, agree=0, spacing=0, blank=0, headers=0, notitle=0)
    print(f"{'sheet':44s} {'tables':>7s} {'cells':>7s} {'agree':>7s} {'rate':>7s}")
    print("-" * 78)

    for set_id, page, _titles in keyed_sheets():
        if a.set and set_id != a.set:
            continue
        pdf = single_page_pdf(find_pdf(set_id), page)
        graph = production_graph(pdf)

        s_tables = s_cells = s_agree = 0
        for t in graph["tables"]:
            # Production's cells in points, keyed by bbox the way ocr_cells
            # expects. Headers carry no geometry at all — counted separately,
            # never OCR-judged, because there is no box to look inside.
            tot["headers"] += len(t.get("headers") or [])
            if not (t.get("title") or {}).get("text"):
                tot["notitle"] += 1
            ours: dict = {}
            for r in t.get("rows") or []:
                for _h, c in (r.get("cells") or {}).items():
                    b = c.get("bbox")
                    txt = norm(c.get("text") or "")
                    if not b or not txt:
                        continue
                    ours[tuple(v / RENDER_SCALE for v in b)] = txt
            ttl = t.get("title") or {}
            if ttl.get("bbox") and norm(ttl.get("text") or ""):
                ours[tuple(v / RENDER_SCALE for v in ttl["bbox"])] = norm(ttl["text"])
            if not ours:
                continue

            boxes = list(ours)
            region = (min(b[0] for b in boxes) - 2, min(b[1] for b in boxes) - 2,
                      max(b[2] for b in boxes) + 2, max(b[3] for b in boxes) + 2)
            theirs = ocr_cells(pdf, {"bbox": region, "cells": boxes}, a.zoom)

            s_tables += 1
            for b, mine in ours.items():
                s_cells += 1
                got = norm(theirs.get(b, ""))
                if not got:
                    tot["blank"] += 1
                elif got == mine:
                    s_agree += 1
                elif squash(got) == squash(mine):
                    s_agree += 1
                    tot["spacing"] += 1

        tot["tables"] += s_tables; tot["cells"] += s_cells; tot["agree"] += s_agree
        if s_cells:
            print(f"{(set_id[:30] + ' p' + str(page)):44s} {s_tables:7d} {s_cells:7d} "
                  f"{s_agree:7d} {100.0 * s_agree / s_cells:6.2f}%", flush=True)

    n = max(tot["cells"], 1)
    print("\n" + "=" * 78)
    print(f"PRODUCTION, judged by the pixels, on the same 33 keyed sheets")
    print(f"tables judged                {tot['tables']}")
    print(f"cells with text AND geometry {tot['cells']}")
    print(f"confirmed by OCR of pixels   {tot['agree']}  ({100.0 * tot['agree'] / n:.2f}%)")
    print(f"  identical but for spacing               {tot['spacing']}")
    print(f"  OCR read nothing there                  {tot['blank']}")
    print(f"header labels carrying no geometry (not judged)  {tot['headers']}")
    print(f"tables production gave no title                  {tot['notitle']}")
    print("ALLDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
