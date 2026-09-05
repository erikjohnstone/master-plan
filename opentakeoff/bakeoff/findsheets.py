#!/usr/bin/env python3
"""
FIND THE NEXT SHEETS TO KEY — so the 122 can become a real corpus number.

122 tables across 24 sheets is enough to find bugs and far too few to claim a
rate. This ranks every page of every bulk document by how many SCHEDULE-shaped
titles its text layer carries, so authoring effort goes where the tables are
instead of into cover sheets and plan views.

It reads ONLY the text layer — never the extractor's output — because the
sheets it picks are the ones whose ground truth will be authored, and a
selection made from what the extractor already found would quietly exclude
every table the extractor cannot see.

    python3 findsheets.py [--min 4] [--limit 80] [--skip-keyed]
"""
from __future__ import annotations

import argparse
import re
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import pdfplumber                                               # noqa: E402

from bakeoff import BULK, CORPUS                                # noqa: E402

# A schedule title is a short, upper-case, standalone line ending in one of
# these words. Deliberately narrow: this picks WHERE to look, and a page that
# scores 0 here is not thereby declared table-free — it is just not first.
TITLE = re.compile(
    r"^[A-Z0-9][A-Z0-9 ,.'&/()#\-]{4,70}"
    r"(SCHEDULE|SCHEDULES|LIST|LEGEND|SUMMARY|MATRIX|INDEX)$")


def keyed() -> set:
    out = set()
    for kp in (CORPUS / "keys").glob("*.tables.csv"):
        out.add(kp.name[: -len(".tables.csv")])
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min", type=int, default=4, help="minimum titles on a page")
    ap.add_argument("--limit", type=int, default=80)
    ap.add_argument("--skip-keyed", action="store_true", help="ignore documents already keyed")
    a = ap.parse_args()

    have = keyed()
    rows = []
    pdfs = sorted(p for d in BULK for p in d.glob("*.pdf"))
    print(f"scanning {len(pdfs)} bulk documents", file=sys.stderr)
    for i, pdf in enumerate(pdfs):
        if a.skip_keyed and pdf.stem in have:
            continue
        try:
            with pdfplumber.open(pdf) as doc:
                for pno, page in enumerate(doc.pages, 1):
                    txt = page.extract_text() or ""
                    titles = [ln.strip() for ln in txt.splitlines()
                              if TITLE.match(ln.strip())]
                    titles = [t for t in titles if len(t.split()) >= 2]
                    if len(titles) >= a.min:
                        rows.append((len(titles), pdf.stem, pno, titles))
        except Exception as e:                                  # a corrupt page must not stop the sweep
            print(f"  !! {pdf.stem}: {type(e).__name__}", file=sys.stderr)
        if (i + 1) % 20 == 0:
            print(f"  {i + 1}/{len(pdfs)}", file=sys.stderr)

    rows.sort(reverse=True)
    print(f"{'titles':>6s}  {'document':52s} page")
    for n, stem, pno, titles in rows[: a.limit]:
        print(f"{n:6d}  {stem[:52]:52s} {pno}")
        for t in titles[:12]:
            print(f"          {t[:76]}")
    print(f"\n{len(rows)} pages carry {a.min}+ schedule-shaped titles; showing {min(len(rows), a.limit)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
