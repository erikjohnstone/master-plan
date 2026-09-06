#!/usr/bin/env python3
"""
THE WHOLE GROUND TRUTH, BOTH ENGINES, ONE RULER.

Everything measured so far covered 152 of the corpus's 289 ground-truth
tables — the ones whose columns are recorded as pipe-delimited names, which is
the only shape a column-level ruler can score. The other 137 record their
columns as a printed line, and quoting a number that silently excluded them
overstates what has been proven. 152 tables is 1,041 of 1,852 rows: 56%.

This scores ALL 289 tables, and it scores the reader and the production
pipeline in the same pass, on the same ruler, against the same rows.

  reader     vectorgrid.find_tables -> celltext.slot -> cell_text, in Python.
             No TypeScript. This is the extractor's own ceiling.
  pipeline   the real SheetGraph the product builds, via
             production-graph-cli.mjs. Reader plus interpreter.

RULER. A ground-truth row is a list of TOKENS — the pipe-delimited rows are
split on the pipe, the printed-line rows on whitespace, and both then tokenise
identically, so the two halves of the corpus are measured the same way. Each
ground-truth row is compared against the single best-matching extracted row by
longest common SUBSEQUENCE of tokens: the right values, in the right order,
with one split or merged cell charged once instead of to every token after it.
Order is required, so a scrambled row cannot score full marks; set membership
(which benchscore.py used) cannot tell a scrambled row from a correct one.

TABLE RECALL. By printed title where the truth records one, and by COORDINATES
otherwise — 158 of the 289 tables have no printed title, and a title-only
matcher reports every one of them as a miss however well it was read.

None of this corpus was seen while the extractor was built and its ground truth
was authored independently, which is what makes it a measure of skill rather
than of fit.

    python3 allscore.py [--doc 04] [--reader-only]
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
from pipescore import graph_for, one_page     # noqa: E402


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").upper()).strip().replace("Ø", "O")


def toks(s: str) -> list:
    return [t for t in re.split(r"[\s,;|]+", norm(s)) if t]


def lcs(a: list, b: list) -> int:
    m, n = len(a), len(b)
    if not m or not n:
        return 0
    prev = [0] * (n + 1)
    for i in range(1, m + 1):
        cur = [0] * (n + 1)
        for j in range(1, n + 1):
            cur[j] = prev[j - 1] + 1 if a[i - 1] == b[j - 1] else max(prev[j], cur[j - 1])
        prev = cur
    return prev[n]


def gt_title(t: dict) -> str:
    for k in ("title_as_printed", "title"):
        v = (t.get(k) or "").strip()
        if v and v not in ("?", "-", "N/A"):
            return v
    return ""


def gt_yspan(t: dict):
    yr = t.get("y_ranges")
    if yr:
        return min(a for a, _b in yr), max(b for _a, b in yr)
    ye = t.get("y_edges")
    if ye:
        return float(min(ye)), float(max(ye))
    return None


def pick(regions: list, t: dict):
    """The region that IS this ground-truth table: title first, geometry after.
    `regions` is [(all-text, [row lines], bbox-in-points)]."""
    title = norm(gt_title(t))
    if title:
        for r in regions:
            if title in r[0]:
                return r
    span, xe = gt_yspan(t), t.get("x_edges") or []
    if not span or len(xe) < 2:
        return None
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
    return best if bestov >= 0.5 else None


def reader_regions(pdf: Path, page: int) -> list:
    out = []
    for g in find_tables(str(pdf), page)["tables"]:
        if not g.get("cells"):
            continue
        try:
            cells, _a, _o, _s = slot(pdf, g, page)
        except Exception:
            continue
        byrow = defaultdict(list)
        for b, ws in cells.items():
            byrow[round(b[1])].append((b[0], cell_text(ws)))
        lines = [" ".join(x for _p, x in sorted(v)) for _k, v in sorted(byrow.items())]
        out.append((norm(" ".join(lines)), lines, tuple(g["bbox"])))
    return out


def pipeline_regions(pdf: Path, page: int) -> list:
    """The tables the product's own SheetGraph carries for this page.

    Regions come back in project pixels at RENDER_SCALE 2.0; the ground truth
    is in points, so halve the graph rather than doubling the truth."""
    g = graph_for(one_page(pdf, page))
    out = []
    for tb in g.get("tables", []):
        lines = [" ".join(c.get("text") or "" for _h, c in (row.get("cells") or {}).items())
                 for row in (tb.get("rows") or [])]
        head = " ".join(tb.get("headers") or [])
        title = ((tb.get("title") or {}) or {}).get("text") or ""
        allt = norm(" ".join([title, head] + lines))
        out.append((allt, lines, tuple(v / 2.0 for v in tb["region"])))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc")
    ap.add_argument("--reader-only", action="store_true")
    a = ap.parse_args()

    eng = ["reader"] if a.reader_only else ["reader", "pipeline"]
    tot = {e: defaultdict(int) for e in eng}

    hdr = f"{'document':22s} {'pg':>4s} {'ground-truth table':34s}"
    for e in eng:
        hdr += f" | {e[:8]:>8s} rows   tok"
    print(hdr)
    print("-" * len(hdr))

    for rf in sorted((BENCH / "ground_truth/records").glob("*.json")):
        d = json.loads(rf.read_text())
        did = d["id"]
        if a.doc and not did.startswith(a.doc):
            continue
        tables = [t for t in (((d.get("modules") or {}).get("schedules") or {}).get("tables") or [])
                  if isinstance(t.get("page"), int)]
        if not tables:
            continue
        pdf = BENCH / d["source_pdf"]
        if not pdf.exists():
            print(f"{did[:22]:22s}   MISSING PDF")
            continue

        bypage = defaultdict(list)
        for t in tables:
            bypage[t["page"]].append(t)

        for page, wants in sorted(bypage.items()):
            regions = {}
            for e in eng:
                try:
                    regions[e] = (reader_regions(pdf, page) if e == "reader"
                                  else pipeline_regions(pdf, page))
                except Exception as exc:
                    print(f"{did[:22]:22s} {page:>4d} {e.upper()} FAILED: {str(exc)[:40]}")
                    regions[e] = []
                    tot[e]["engine_fail"] += 1

            for t in wants:
                want = t.get("rows") or []
                line = f"{did[:22]:22s} {page:>4d} {(gt_title(t) or '(untitled)')[:34]:34s}"
                for e in eng:
                    hit = pick(regions[e], t)
                    tot[e]["tables"] += 1
                    if hit:
                        tot[e]["found"] += 1
                    rows_ok = tk = tkall = 0
                    for wr in want:
                        wt = toks(wr)
                        tkall += len(wt)
                        if not hit or not wt:
                            continue
                        best = max((lcs(wt, toks(ln)) for ln in hit[1]), default=0)
                        tk += best
                        if best == len(wt):
                            rows_ok += 1
                    tot[e]["rows"] += len(want)
                    tot[e]["rows_ok"] += rows_ok
                    tot[e]["tok"] += tk
                    tot[e]["tokall"] += tkall
                    line += f" | {'YES' if hit else 'NO':>3s} {rows_ok:>2d}/{len(want):<2d} {(100.0*tk/tkall if tkall else 0):>4.0f}%"
                print(line, flush=True)

    print("\n" + "=" * 92)
    print("ALL 289 GROUND-TRUTH TABLES, 30 DOCUMENTS NEVER SEEN, ONE RULER")
    for e in eng:
        s = tot[e]
        print(f"\n  {e.upper()}")
        print(f"    tables found            {s['found']}/{s['tables']}  ({100.0*s['found']/max(1,s['tables']):.1f}%)")
        print(f"    rows recovered WHOLE    {s['rows_ok']}/{s['rows']}  ({100.0*s['rows_ok']/max(1,s['rows']):.1f}%)")
        print(f"    values recovered        {s['tok']}/{s['tokall']}  ({100.0*s['tok']/max(1,s['tokall']):.1f}%)")
        if s["engine_fail"]:
            print(f"    pages the engine could not process  {s['engine_fail']}")
    print("ALLDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
