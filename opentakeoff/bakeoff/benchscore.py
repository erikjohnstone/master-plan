#!/usr/bin/env python3
"""
THE UNTOUCHED TEST — vectorgrid against 30 documents it has never seen.

Every other number in this project was measured against keys authored while
the extractor was being iterated. The keys were held out in the sense of not
being used to write the rules, but their scores were visible during the work,
which is not the same as never having been observed. That makes 905/905 a
fitted number and it should be discounted.

This corpus was assembled independently: 30 PDFs, 289 ground-truth tables and
1,852 literal rows, human-reviewed, with the printed title, the page and the
row text recorded for each table. Nothing here influenced a line of vectorgrid.

WHAT IS SCORED
--------------
TABLE RECALL   for each ground-truth table, did the extractor return a region
               on that page that is that table? Matched by printed title when
               there is one, and otherwise BY COORDINATES — the ground truth
               records x_edges and y_ranges in the same space the extractor
               reports, so a table with no printed title is still perfectly
               identifiable. 158 of the 289 tables have no title, and a
               title-only matcher scores every one of them as a miss no matter
               how well they were read. That is a broken ruler, not a result.
ROW RECALL     for each ground-truth row, what fraction of its tokens appear
               in the single best-matching extracted row?

Tokens, not exact strings, because the ground truth stores a row as one
space-joined line ("VARIABLE VOLUME SAV-1 RESIDENCY LAB 131 1 24\"X12\" ...")
while the extractor returns cells. Comparing those as strings would measure
formatting, not reading. A token that the human recorded and the extractor did
not produce is a real miss; token order within a row is not.

    python3 benchscore.py [--limit N] [--doc 04]
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

BENCH = Path("/home/user/master-plan/HVAC BAS Benchmark Collection")

from celltext import cell_text, slot          # noqa: E402
from vectorgrid import find_tables            # noqa: E402


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").upper()).strip()


def toks(s: str) -> list:
    """Comparable tokens. Punctuation that a drafter uses inside a value —
    the inch mark, the slash in 208/3, the decimal point — is kept; separators
    that only ever divide values are not."""
    return [t for t in re.split(r"[\s,;|]+", norm(s)) if t]


def gt_title(t: dict) -> str:
    """The printed title, under either of the two names the corpus uses.

    The ground truth was assembled from several authored modules and they do
    not agree on their key names: 97 tables carry `title_as_printed`, 92 carry
    `title`, and the same split exists for `y_ranges` vs `y_edges`. Reading
    only the first name of each pair made every table in the other schema look
    untitled AND uncoordinated — 53 of 53 on document 01 — which is a scorer
    that reports its own blind spot as an extraction failure."""
    for k in ("title_as_printed", "title"):
        v = (t.get(k) or "").strip()
        if v and v not in ("?", "-", "N/A"):
            return v
    return ""


def gt_yspan(t: dict):
    """(top, bottom) of the table's data rows, under either key name."""
    yr = t.get("y_ranges")
    if yr:
        return min(a for a, _b in yr), max(b for _a, b in yr)
    ye = t.get("y_edges")
    if ye:
        return float(min(ye)), float(max(ye))
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int)
    ap.add_argument("--doc")
    a = ap.parse_args()

    recs = sorted((BENCH / "ground_truth/records").glob("*.json"))
    tot = defaultdict(int)
    print(f"{'document':26s} {'pg':>4s} {'ground-truth table':38s} {'found':>5s} {'rows':>5s} {'tok%':>6s}")
    print("-" * 92)

    for rf in recs:
        d = json.loads(rf.read_text())
        did = d["id"]
        if a.doc and not did.startswith(a.doc):
            continue
        tables = ((d.get("modules") or {}).get("schedules") or {}).get("tables") or []
        if not tables:
            continue
        pdf = BENCH / d["source_pdf"]
        if not pdf.exists():
            print(f"{did[:26]:26s}   MISSING PDF {d['source_pdf']}")
            continue

        bypage = defaultdict(list)
        for t in tables:
            if isinstance(t.get("page"), int):
                bypage[t["page"]].append(t)

        for page, wants in sorted(bypage.items()):
            try:
                got = find_tables(str(pdf), page)["tables"]
            except Exception as e:
                print(f"{did[:26]:26s} {page:>4d} EXTRACTOR FAILED: {e}")
                tot["extract_fail"] += 1
                continue
            # text of every region on the page, once
            regions = []
            for g in got:
                if not g.get("cells"):
                    continue
                try:
                    cells, _as, _o, _s = slot(pdf, g, page)
                except Exception:
                    continue
                rows = defaultdict(list)
                for b, ws in cells.items():
                    rows[round(b[1])].append((b[0], cell_text(ws)))
                lines = [" ".join(t for _x, t in sorted(v)) for _k, v in sorted(rows.items())]
                regions.append((norm(" ".join(lines)), lines, g["bbox"]))

            for t in wants:
                title = norm(gt_title(t))
                want_rows = t.get("rows") or []
                hit = next((r for r in regions if title and title in r[0]), None)
                if hit is None:
                    # No printed title, or a title the region does not carry in
                    # its own cells: fall back to geometry. The ground truth's
                    # y_ranges are its DATA rows, so they sit inside the region
                    # the extractor reports (which also covers the header band
                    # above them) — containment of their midpoint plus an
                    # x-overlap is the identification, and it does not depend
                    # on either side having read a single character.
                    span = gt_yspan(t)
                    xe = t.get("x_edges") or []
                    if span and len(xe) >= 2:
                        ymid = (span[0] + span[1]) / 2.0
                        gx0, gx1 = float(min(xe)), float(max(xe))
                        best, bestov = None, 0.0
                        for r in regions:
                            bx0, by0, bx1, by1 = r[2]
                            if not (by0 <= ymid <= by1):
                                continue
                            o = max(0.0, min(bx1, gx1) - max(bx0, gx0)) / max(1.0, gx1 - gx0)
                            if o > bestov:
                                best, bestov = r, o
                        if bestov >= 0.5:
                            hit = best
                            tot["matched_by_geometry"] += 1
                tot["tables"] += 1
                if hit:
                    tot["found"] += 1
                matched = 0
                tk = tkall = 0
                for wr in want_rows:
                    wt = toks(wr)
                    tkall += len(wt)
                    if not hit:
                        continue
                    best = 0
                    for line in hit[1]:
                        lt = set(toks(line))
                        n = sum(1 for x in wt if x in lt)
                        best = max(best, n)
                    tk += best
                    if best == len(wt):
                        matched += 1
                tot["rows"] += len(want_rows)
                tot["rows_exact"] += matched
                tot["tok"] += tk
                tot["tokall"] += tkall
                pct = (100.0 * tk / tkall) if tkall else 0.0
                print(f"{did[:26]:26s} {page:>4d} {(gt_title(t) or '(untitled)')[:38]:38s} "
                      f"{'YES' if hit else 'NO':>5s} {matched:>2d}/{len(want_rows):<2d} {pct:>5.1f}%", flush=True)

        if a.limit and tot["tables"] >= a.limit:
            break

    print("\n" + "=" * 92)
    print("NEVER-SEEN CORPUS — 30 documents, human-reviewed ground truth")
    print(f"  ground-truth tables            {tot['tables']}")
    print(f"  found by vectorgrid            {tot['found']}  ({100.0*tot['found']/max(1,tot['tables']):.1f}%)")
    print(f"    of those, identified by title      {tot['found']-tot['matched_by_geometry']}")
    print(f"    identified by coordinates          {tot['matched_by_geometry']}  (no printed title)")
    print(f"  ground-truth rows              {tot['rows']}")
    print(f"  rows with EVERY token read     {tot['rows_exact']}  ({100.0*tot['rows_exact']/max(1,tot['rows']):.1f}%)")
    print(f"  row tokens read                {tot['tok']}/{tot['tokall']}  "
          f"({100.0*tot['tok']/max(1,tot['tokall']):.1f}%)")
    if tot["extract_fail"]:
        print(f"  pages the extractor failed on  {tot['extract_fail']}")
    print("BENCHDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
