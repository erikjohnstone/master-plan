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

# CAPTIONS FOUND ANYWHERE IN A LINE, not only at its end.
#
# Anchoring the keyword at end-of-line was measured against the authored titles
# by `boxfit.py --calibrate` and recovers 112 of 222 — half. It drops every
# caption that carries a qualifier ("AIR HANDLER HEAT PUMP SCHEDULE (WITH
# ELECTRIC HEAT)", "DOOR SCHEDULE PROJECT 4"), and when two schedules sit side
# by side on one band the text engine returns them as ONE line, so
# "INSTRUMENTATION SCHEDULE PUMP SCHEDULE" matches nothing and both are lost.
# That is the same fusion caption_boxes documents and solves with contiguous
# runs.
#
# So: find each KEYWORD in the line and take the words before it as its own
# caption, ending the previous one. A line then yields as many captions as it
# carries, and a trailing qualifier rides along with the keyword it follows.
KEYWORD = re.compile(r"\b(SCHEDULES|SCHEDULE|LEGEND|SUMMARY|MATRIX|INDEX|LIST)\b")
MAX_CAPTION_WORDS = 8   # bounded reach: a caption is a title, not a row
_TAIL = re.compile(r"^(\s*\([A-Z0-9 ,.'&/#\-]{1,44}\))?(\s+[A-Z0-9#\-]{1,12}){0,3}")


def captions_in_line(line: str) -> list[str]:
    """Every schedule caption a single text line carries, left to right."""
    line = line.strip()
    if not line or not line[0].isalnum() or line != line.upper():
        return []
    out, start = [], 0
    for m in KEYWORD.finditer(line):
        tail = _TAIL.match(line, m.end())
        end = tail.end() if tail else m.end()
        cap = line[start:end].strip(" ,.-")
        start = end
        # A CAPTION IS SHORT AND IT IS WORDS. Taking everything back to the
        # previous keyword swallows a whole data row that happens to carry one
        # ("PF-1 MECH. RM. EVAPORATOR LOOP NEPTUNE/VTF-5HP WATER 5 300 37 EX"),
        # and the calibration caught it: recovery rose to 72.5% while invented
        # captions went 52 -> 123. So bound the reach to a caption's own length
        # and refuse anything that reads like data.
        words = cap.split()
        if len(words) > MAX_CAPTION_WORDS:
            words = words[-MAX_CAPTION_WORDS:]
            cap = " ".join(words)
        if len(cap) < 6 or len(words) < 2 or len(cap) > 74:
            continue
        if not re.fullmatch(r"[A-Z0-9 ,.'&/()#\-]+", cap):
            continue
        if sum(1 for w in words if any(c.isdigit() for c in w)) > 1:
            continue                      # a schedule caption is not numbers
        if sum(1 for w in words if w.isalpha()) < 2:
            continue
        out.append(cap)
    return out


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
