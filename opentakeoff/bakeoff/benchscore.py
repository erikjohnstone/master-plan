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
               on that page carrying the printed title in its own cells?
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
                regions.append((norm(" ".join(lines)), lines))

            for t in wants:
                title = norm(t.get("title_as_printed") or "")
                want_rows = t.get("rows") or []
                hit = next((r for r in regions if title and title in r[0]), None)
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
                print(f"{did[:26]:26s} {page:>4d} {(t.get('title_as_printed') or '?')[:38]:38s} "
                      f"{'YES' if hit else 'NO':>5s} {matched:>2d}/{len(want_rows):<2d} {pct:>5.1f}%", flush=True)

        if a.limit and tot["tables"] >= a.limit:
            break

    print("\n" + "=" * 92)
    print("NEVER-SEEN CORPUS — 30 documents, human-reviewed ground truth")
    print(f"  ground-truth tables            {tot['tables']}")
    print(f"  found by vectorgrid            {tot['found']}  ({100.0*tot['found']/max(1,tot['tables']):.1f}%)")
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
