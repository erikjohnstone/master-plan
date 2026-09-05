#!/usr/bin/env python3
"""
A THIRD JUDGE THAT CANNOT SHARE OUR BLINDNESS — it never reads the text layer.

cellaudit.py checks our cell text against pdfminer. That is a real check and it
has caught real bugs, but both engines parse the SAME content stream with the
same idea of what a glyph is, so a fault in the stream itself — a bad ToUnicode
map, a symbol font, a glyph the encoding does not name — is invisible to both.
They agree, confidently, and are both wrong. Nothing in a two-text-engine audit
can see that, which is exactly the objection this file answers.

So the judge here reads PIXELS. Each table is rendered and put through RapidOCR
(PP-OCR ONNX), every detected string is dropped into the cell its centre lands
in, and the result is compared with what we read out of the content stream. The
two paths share nothing downstream of the PDF itself: one decodes glyph codes,
the other looks at ink. Where they agree, the cell is confirmed by two
independent modalities. Where they differ, one of them is wrong and the cell is
worth a human's eye — which is what this prints.

WHAT A DISAGREEMENT MEANS, AND WHAT IT DOES NOT
-----------------------------------------------
OCR is not truth. Schedule type is small, and on a 1/16" fraction or a stacked
unit it will lose. So a disagreement is a CANDIDATE, ranked for review, not a
verdict against us — and the agreement rate is a floor on our correctness, not
a ceiling on theirs. The useful signal is the shape of the disagreements: if
they cluster on thin glyphs and fractions, that is OCR; if they cluster on one
document or one font, that is us.

    python3 cellocr.py [--set <id>] [--page N] [--zoom 4] [--show 40]
"""
from __future__ import annotations

import argparse
import re
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np                                              # noqa: E402
import pymupdf                                                  # noqa: E402

from bakeoff import (caption_boxes, detail_captions, find_pdf,   # noqa: E402
                     region_owners, single_page_pdf)
from boxfit import keyed_sheets                                  # noqa: E402
from celltext import cell_text, slot                             # noqa: E402
from vectorgrid import find_tables                               # noqa: E402

_ENGINE = None


def engine():
    global _ENGINE
    if _ENGINE is None:
        from rapidocr_onnxruntime import RapidOCR
        _ENGINE = RapidOCR()
    return _ENGINE


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").upper().replace(" ", " ")).strip()


def squash(s: str) -> str:
    """Same string with every space removed.

    OCR decides for itself where words end — measured on 073_MT#21 it returns
    '#4 BARS @ 12" OC EA WAYT&B' and 'T.O.FTG ELEV' for cells we read correctly.
    Counting those as disagreements would bury the disagreements that matter, so
    spacing is reported as its own tier rather than mixed in with character
    errors. It is the character stream that a takeoff depends on.
    """
    return re.sub(r"\s+", "", s or "")


def ocr_cells(pdf: Path, table: dict, zoom: float) -> dict:
    """cell bbox -> the text OCR reads inside it, from the rendered page."""
    x0, top, x1, bot = table["bbox"]
    with pymupdf.open(pdf) as doc:
        pix = doc[0].get_pixmap(matrix=pymupdf.Matrix(zoom, zoom),
                                clip=pymupdf.Rect(x0, top, x1, bot))
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        img = img[:, :, :3]
    elif pix.n == 1:
        img = np.repeat(img, 3, axis=2)
    res, _ = engine()(img)
    out: dict = {}
    if not res:
        return out
    # Each detection carries a quadrilateral; place it by its centre, the same
    # rule slot() uses for words, so a string straddling a wall is not counted
    # twice on one side.
    for quad, text, _score in res:
        xs = [p[0] for p in quad]; ys = [p[1] for p in quad]
        cx = x0 + (sum(xs) / len(xs)) / zoom
        cy = top + (sum(ys) / len(ys)) / zoom
        for b in table["cells"]:
            if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
                out.setdefault(b, []).append((cy, cx, text))
                break
    return {b: " ".join(t for _y, _x, t in sorted(v)) for b, v in out.items()}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set")
    ap.add_argument("--page", type=int)
    ap.add_argument("--zoom", type=float, default=4.0)
    ap.add_argument("--show", type=int, default=40)
    ap.add_argument("--dump", help="write every disagreement to this TSV for triage")
    a = ap.parse_args()

    tot = dict(tables=0, cells=0, agree=0, spacing=0, ocr_blank=0)
    diffs = []
    print(f"{'sheet':44s} {'tables':>7s} {'cells':>7s} {'agree':>7s} {'rate':>7s}")
    print("-" * 78)

    for set_id, page, titles in keyed_sheets():
        if a.set and (set_id != a.set or (a.page and page != a.page)):
            continue
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        tables = find_tables(str(pdf), 1)["tables"]
        owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))

        s_cells = s_agree = s_tables = 0
        for t in tables:
            title = owners.get(t["bbox"])
            if not title or not t["cells"]:
                continue
            s_tables += 1
            ours_by_cell, _a, _o, _s = slot(pdf, t)
            theirs = ocr_cells(pdf, t, a.zoom)
            for b, cs in ours_by_cell.items():
                ours = norm(cell_text(cs))
                if not ours:
                    continue                      # we read nothing; nothing to confirm
                s_cells += 1
                got = norm(theirs.get(b, ""))
                if not got:
                    tot["ocr_blank"] += 1
                    diffs.append((set_id, page, title, b, ours, "<OCR READ NOTHING>"))
                elif got == ours:
                    s_agree += 1
                elif squash(got) == squash(ours):
                    s_agree += 1
                    tot["spacing"] += 1
                else:
                    diffs.append((set_id, page, title, b, ours, got))

        tot["tables"] += s_tables; tot["cells"] += s_cells; tot["agree"] += s_agree
        if s_cells:
            print(f"{(set_id[:30] + ' p' + str(page)):44s} {s_tables:7d} {s_cells:7d} "
                  f"{s_agree:7d} {100.0 * s_agree / s_cells:6.2f}%", flush=True)

    n = max(tot["cells"], 1)
    print("\n" + "=" * 78)
    print(f"tables judged                {tot['tables']}")
    print(f"cells we read text in        {tot['cells']}")
    print(f"confirmed by OCR of pixels   {tot['agree']}  ({100.0 * tot['agree'] / n:.2f}%)")
    print(f"  of those, identical but for spacing     {tot['spacing']}")
    print(f"  of the rest, OCR read nothing at all in {tot['ocr_blank']}")
    if a.dump:
        with open(a.dump, "w") as fh:
            for sid, pg, title, b, ours, got in diffs:
                fh.write(f"{sid}\t{pg}\t{title}\t{b[0]:.0f},{b[1]:.0f}\t{ours}\t{got}\n")
        print(f"\n  wrote {len(diffs)} disagreements to {a.dump}")
    if diffs:
        print(f"\n  DISAGREEMENTS (first {a.show} of {len(diffs)}) — ours | OCR")
        for sid, pg, title, b, ours, got in diffs[:a.show]:
            print(f"  {sid[:20]:20s} p{pg:<3d} {title[:24]:24s} ({b[0]:.0f},{b[1]:.0f})")
            print(f"      ours {ours[:60]!r}")
            print(f"      ocr  {got[:60]!r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
