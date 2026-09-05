#!/usr/bin/env python3
"""
CONTENT AT CORPUS SCALE — a second engine's opinion of every cell.

cellscore.py is the honest cell metric and it costs a hand transcription per
table. Four tables have one. Scaling that to 122 is six thousand cells of
typing, and to "all blueprints" it never scales at all.

So this asks a different question that needs no transcription and still cannot
be self-satisfied: DOES AN INDEPENDENT PDF TEXT ENGINE READ THE SAME STRING IN
THE SAME RECTANGLE?

  our cell text   pdfminer glyphs (via pdfplumber), assigned to faces by
                  centre-point containment, spaces rebuilt in celltext
  the oracle      MuPDF's own extractor, clipped to the same rectangle

They share no code. MuPDF has its own glyph decoding, its own word assembly and
its own space heuristics, and it knows nothing about our faces. So agreement is
real evidence that a cell's content is right, and every disagreement is a
concrete cell to look at — which is how this scales: the eyes go only where the
two engines differ.

WHAT AGREEMENT DOES NOT PROVE. Both engines read the same content stream, so
neither can catch a glyph the PDF itself encodes wrongly, and agreement says
nothing about whether the cell BOUNDARY is right — two columns welded into one
cell will be read identically by both. That is what cellscore.py and the
transcribed keys are for. This is the wide net; that is the deep one.

    python3 cellaudit.py [--set <id> --page N] [--show 40]
"""
from __future__ import annotations

import argparse
import re
import sys
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import pymupdf                                                     # noqa: E402

from bakeoff import caption_boxes, find_pdf, region_owners, single_page_pdf  # noqa: E402
from boxfit import keyed_sheets                                    # noqa: E402
from celltext import cell_text, slot                               # noqa: E402
from vectorgrid import find_tables                                 # noqa: E402


def norm(s: str) -> str:
    s = (s or "").replace("“", '"').replace("”", '"')
    s = s.replace("‘", "'").replace("’", "'").replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", s.upper()).strip()


def mupdf_words(pdf: Path) -> list:
    """(x0, top, x1, bottom, text) in the SAME space our cells use.

    MuPDF normalises the MediaBox to (0,0,W,H) and reports words in the
    unrotated space, so a rotated page needs the page's own rotation matrix
    applied — the same correction raster_regions() makes. Without it every
    comparison on the five rotated sheets in the key set would be nonsense.
    """
    with pymupdf.open(pdf) as doc:
        page = doc[0]
        rot = page.rotation_matrix
        out = []
        for x0, y0, x1, y1, w, *_rest in page.get_text("words"):
            r = pymupdf.Rect(x0, y0, x1, y1) * rot
            out.append((min(r.x0, r.x1), min(r.y0, r.y1),
                        max(r.x0, r.x1), max(r.y0, r.y1), w))
    return out


def text_in(words: list, bbox: tuple) -> str:
    """MuPDF words whose centre falls in the rectangle, in reading order."""
    x0, top, x1, bot = bbox
    got = [(wy0, wx0, t) for wx0, wy0, wx1, wy1, t in words
           if x0 <= (wx0 + wx1) / 2 <= x1 and top <= (wy0 + wy1) / 2 <= bot]
    got.sort(key=lambda g: (round(g[0] / 3), g[1]))
    return " ".join(t for _y, _x, t in got)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set")
    ap.add_argument("--page", type=int)
    ap.add_argument("--show", type=int, default=30, help="how many disagreements to print")
    a = ap.parse_args()

    tot = dict(tables=0, cells=0, agree=0, empty=0)
    diffs = []
    print(f"{'sheet':44s} {'tables':>7s} {'cells':>7s} {'agree':>7s} {'rate':>7s}")
    print("-" * 78)

    for set_id, page, titles in keyed_sheets():
        if a.set and (set_id != a.set or (a.page and page != a.page)):
            continue
        pdf = single_page_pdf(find_pdf(set_id), page)
        words = mupdf_words(pdf)
        caps = caption_boxes(pdf, titles)
        tables = find_tables(str(pdf), 1)["tables"]
        owners = region_owners([t["bbox"] for t in tables], caps)

        s_cells = s_agree = s_tables = 0
        for t in tables:
            title = owners.get(t["bbox"])
            if not title or not t["cells"]:
                continue
            s_tables += 1
            cells, _a, _o, _s = slot(pdf, t)
            for b, cs in cells.items():
                ours = norm(cell_text(cs))
                if not ours:
                    tot["empty"] += 1
                    continue
                theirs = norm(text_in(words, b))
                s_cells += 1
                if ours == theirs:
                    s_agree += 1
                else:
                    diffs.append((set_id, page, title, b, ours, theirs))

        tot["tables"] += s_tables; tot["cells"] += s_cells; tot["agree"] += s_agree
        if s_cells:
            print(f"{(set_id[:30] + ' p' + str(page)):44s} {s_tables:7d} {s_cells:7d} "
                  f"{s_agree:7d} {100.0 * s_agree / s_cells:6.2f}%")

    n = max(tot["cells"], 1)
    print("\n" + "=" * 78)
    print(f"keyed tables audited      {tot['tables']}")
    print(f"non-empty cells           {tot['cells']}")
    print(f"AGREE with MuPDF          {tot['agree']}/{tot['cells']}  ({100.0 * tot['agree'] / n:.2f}%)")
    print(f"DISAGREE                  {len(diffs)}")

    if diffs:
        print(f"\nfirst {min(a.show, len(diffs))} disagreements — each is a cell to look at:")
        by_sheet: dict = defaultdict(int)
        for sid, pg, _t, _b, _o, _th in diffs:
            by_sheet[f"{sid[:28]} p{pg}"] += 1
        for sid, n_ in sorted(by_sheet.items(), key=lambda kv: -kv[1])[:12]:
            print(f"   {n_:5d}  {sid}")
        print()
        for sid, pg, title, b, ours, theirs in diffs[: a.show]:
            print(f"  {sid[:22]} p{pg} {title[:26]}  ({b[0]:.0f},{b[1]:.0f})")
            print(f"      ours   {ours[:96]!r}")
            print(f"      mupdf  {theirs[:96]!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
