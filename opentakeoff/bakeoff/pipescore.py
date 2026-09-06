#!/usr/bin/env python3
"""
WHAT THE PLATFORM ACTUALLY DELIVERS — the pipeline, not the extractor.

benchscore.py and colscore.py call find_tables directly. That measures
vectorgrid's CEILING: the best the reader can do. It is not what a user gets.
Between the extractor and the answer sit scheduleTableFromODL's classifier
(which refuses a shape it does not recognise — electrical panelboards and
ROOM NO.-keyed tables are both known refusals), the merge bar, cross-source
dedup and cell-bbox snapping. Every one of them can drop a table the extractor
read perfectly.

So this runs the REAL production path — production-graph-cli.mjs, the same
entry the UI and the MCP tools use — over the pages the benchmark has ground
truth for, and scores the graph it returns. The gap between this and
colscore.py is exactly what the pipeline costs.

Pages are sliced to single-page PDFs first (qpdf) so that a 75-page document
does not have to go through the whole stack to score one schedule.

    python3 pipescore.py [--doc 04] [--limit N]
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

BENCH = Path("/home/user/master-plan/HVAC BAS Benchmark Collection")
MCP = Path(__file__).resolve().parent.parent / "mcp"
SCRATCH = Path(os.environ.get("PIPESCORE_TMP", "/tmp/pipescore"))

N = lambda s: re.sub(r"\s+", " ", (s or "").upper()).strip().replace("Ø", "O")


def lcs(a: list, b: list) -> int:
    """Longest common SUBSEQUENCE, not a position-by-position comparison.

    Strict position punishes one defect many times over. Measured on
    03__vol1__27 page 15's INSTRUMENTATION SCHEDULE: the sheet rules a division
    inside the connection column, so the pipeline returns 1/4" and MNPT as two
    values where the human transcriber recorded 1/4" MNPT as one. Every value
    after it then sits one place to the left, and a row that is otherwise
    perfect scores near zero — 0 of 17 rows on a table read correctly.

    A subsequence match still requires the right values in the right ORDER, so
    a swap, a drop or a scrambled row cannot score full marks; it simply stops
    charging a single split or merge to every column that follows it. The
    reason the earlier token-set metric was not good enough was that it ignored
    order entirely, which is a different and much weaker thing.
    """
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


def one_page(pdf: Path, page: int) -> Path:
    SCRATCH.mkdir(parents=True, exist_ok=True)
    dst = SCRATCH / f"{pdf.stem[:40]}-p{page}.pdf"
    if not dst.exists():
        rc = os.system(f'qpdf "{pdf}" --pages . {page} -- "{dst}" 2>/dev/null')
        if rc != 0 or not dst.exists():
            raise RuntimeError(f"qpdf failed on {pdf.name} p{page}")
    return dst


def graph_for(one: Path) -> dict:
    out = SCRATCH / f"{one.stem}.graph.json"
    if not out.exists():
        r = subprocess.run(
            ["node", "--import", "tsx", "scripts/production-graph-cli.mjs",
             "--mode", "graph", "--pdf", str(one), "--out", str(out)],
            cwd=MCP, capture_output=True, text=True)
        if not out.exists():
            raise RuntimeError(f"pipeline failed: {r.stderr[-400:]}")
    return json.loads(out.read_text())


def why_not_found(g: dict, ymid: float, gx0: float, gx1: float) -> list:
    """What the pipeline says about the place the ground truth points at.

    A table the truth records and the graph does not carry is one of two very
    different things, and the counts alone cannot tell them apart:

      * the reader never found a region there  -> a vectorgrid problem
      * the reader found it and the schedule classifier then declined it
        -> an interpreter problem, and the refusal reason names which rule

    `declined_regions` keeps each refusal with its own coordinates, in the same
    PDF points the ground truth uses, so a refusal can be matched to the region
    the truth is asking about instead of guessed at from a binned tally.
    """
    vg = ((g.get("vector_pipeline") or {}).get("vectorgrid") or {})
    out = []
    for line in vg.get("declined_regions") or []:
        m = re.search(r"(\d+)x(\d+) at (-?\d+),(-?\d+),(-?\d+),(-?\d+): (.*)$", line)
        if not m:
            continue
        rows, cols = m.group(1), m.group(2)
        x0, y0, x1, y1 = (float(m.group(i)) for i in (3, 4, 5, 6))
        if not (y0 <= ymid <= y1):
            continue
        if max(0.0, min(x1, gx1) - max(x0, gx0)) / max(1.0, gx1 - gx0) <= 0.5:
            continue
        out.append(f"REFUSED {rows}x{cols} at {x0:.0f},{y0:.0f},{x1:.0f},{y1:.0f} -> {m.group(7)}")
    if not out:
        reasons = vg.get("declined_reasons") or {}
        out.append("no refusal recorded at this region — the READER found nothing here"
                   + (f" (sheet refused {sum(reasons.values())} other regions)" if reasons else ""))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--doc")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--why", action="store_true",
                    help="for every table that is refused or read imperfectly, print WHY: "
                         "the classifier's own refusal reason for the region the ground "
                         "truth says is there, or an aligned GT-vs-GOT row diff. This is "
                         "what separates a reader defect from an interpreter defect, and "
                         "the two need opposite fixes.")
    a = ap.parse_args()

    tot = defaultdict(int)
    print(f"{'document':22s} {'pg':>4s} {'table':34s} {'found':>5s} {'rows ok':>9s} {'values':>12s}")
    print("-" * 96)

    for rf in sorted((BENCH / "ground_truth/records").glob("*.json")):
        d = json.loads(rf.read_text())
        if a.doc and not d["id"].startswith(a.doc):
            continue
        tables = [t for t in (((d.get("modules") or {}).get("schedules") or {}).get("tables") or [])
                  if isinstance(t.get("columns"), str) and "|" in t["columns"]
                  and isinstance(t.get("page"), int)]
        if not tables:
            continue
        pdf = BENCH / d["source_pdf"]
        for t in tables:
            if a.limit and tot["tables"] >= a.limit:
                break
            tot["tables"] += 1
            try:
                g = graph_for(one_page(pdf, t["page"]))
            except Exception as e:
                print(f"{d['id'][:22]:22s} {t['page']:>4d} PIPELINE FAILED: {str(e)[:50]}")
                tot["pipeline_fail"] += 1
                continue
            span = t.get("y_ranges") or t.get("y_edges")
            xe = t.get("x_edges") or []
            if not span or len(xe) < 2:
                continue
            ymid = ((min(x for x, _y in span) + max(y for _x, y in span)) / 2
                    if isinstance(span[0], list) else (min(span) + max(span)) / 2)
            gx0, gx1 = min(xe), max(xe)
            # production Bbox is project px at RENDER_SCALE 2.0; the ground
            # truth is points. Halve production rather than doubling the truth.
            hit = None
            for tb in g.get("tables", []):
                b = [v / 2.0 for v in tb["region"]]
                if b[1] <= ymid <= b[3] and max(0.0, min(b[2], gx1) - max(b[0], gx0)) / max(1.0, gx1 - gx0) > 0.5:
                    hit = tb
                    break
            title = N(t.get("title") or t.get("title_as_printed") or "")
            if hit is None and title:
                hit = next((tb for tb in g.get("tables", [])
                            if N((tb.get("title") or {}).get("text") or "") == title), None)
            if hit is None:
                print(f"{d['id'][:22]:22s} {t['page']:>4d} {(title or '(untitled)')[:34]:34s} {'NO':>5s}")
                if a.why:
                    for line in why_not_found(g, ymid, gx0, gx1):
                        print(f"      {line}")
                tot["rows"] += len(t.get("rows") or [])
                tot["values"] += sum(len([v for v in r.split('|') if v.strip()]) for r in (t.get("rows") or []))
                continue
            tot["found"] += 1
            got = [[N(c.get("text") or "") for _h, c in row.get("cells", {}).items()] for row in hit.get("rows", [])]
            ok_rows = vals = right = 0
            for gt_row in (t.get("rows") or []):
                nz = [N(x) for x in gt_row.split("|") if x.strip()]
                if not nz:
                    continue
                best = 0
                for gr in got:
                    seq = [x for x in gr if x]
                    best = max(best, lcs(nz, seq))
                # THE SAME COMPARISON, BLIND TO SPACES INSIDE A VALUE.
                # A large part of the residual is neither engine being wrong
                # about what the sheet says: the drawing prints "GREENHECK /
                # SQ-95-VG" or wraps "B950A-VFD-" onto the line above
                # "PCWP-1001", and the human transcriber wrote the value the
                # way a person says it. No takeoff decision turns on that
                # space, so scoring it as a miss overstates the gap. This is
                # reported ALONGSIDE the strict number, never instead of it —
                # the strict number stays the headline so the ruler cannot be
                # quietly loosened to flatter the result.
                loose = 0
                nzs = [x.replace(" ", "") for x in nz]
                for gr in got:
                    seq = [x.replace(" ", "") for x in gr if x]
                    loose = max(loose, lcs(nzs, seq))
                tot["values_right_nospace"] += max(best, loose)
                vals += len(nz)
                right += best
                if best == len(nz):
                    ok_rows += 1
            tot["rows"] += len(t.get("rows") or [])
            tot["rows_ok"] += ok_rows
            tot["values"] += vals
            tot["values_right"] += right
            print(f"{d['id'][:22]:22s} {t['page']:>4d} {(title or '(untitled)')[:34]:34s} {'YES':>5s} "
                  f"{ok_rows:>4d}/{len(t.get('rows') or []):<4d} {right:>5d}/{vals:<6d}", flush=True)
            if a.why and right < vals:
                shown = 0
                for gt_row in (t.get("rows") or []):
                    nz = [N(x) for x in gt_row.split("|") if x.strip()]
                    if not nz:
                        continue
                    best, seq = 0, []
                    for gr in got:
                        cand = [x for x in gr if x]
                        sc = lcs(nz, cand)
                        if sc > best:
                            best, seq = sc, cand
                    if best == len(nz) or shown >= 3:
                        continue
                    shown += 1
                    print(f"      GT : {nz[:9]}")
                    print(f"      GOT: {seq[:9]}")

    print("\n" + "=" * 96)
    print("THE PRODUCTION PIPELINE, on ground truth it has never seen")
    print(f"  ground-truth tables            {tot['tables']}")
    print(f"  found                          {tot['found']}  ({100.0*tot['found']/max(1,tot['tables']):.1f}%)")
    print(f"  rows correct in EVERY column   {tot['rows_ok']}/{tot['rows']}  ({100.0*tot['rows_ok']/max(1,tot['rows']):.1f}%)")
    print(f"  values in the right column     {tot['values_right']}/{tot['values']}  ({100.0*tot['values_right']/max(1,tot['values']):.1f}%)")
    print(f"  ... ignoring spaces INSIDE a value {tot['values_right_nospace']}/{tot['values']}  "
          f"({100.0*tot['values_right_nospace']/max(1,tot['values']):.1f}%)  "
          f"— {tot['values_right_nospace']-tot['values_right']} of the misses are a space, not a wrong value")
    if tot["pipeline_fail"]:
        print(f"  pipeline failures              {tot['pipeline_fail']}")
    print("PIPEDONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
