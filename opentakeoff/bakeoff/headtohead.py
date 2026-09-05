#!/usr/bin/env python3
"""
HEAD TO HEAD — production's schedule extractor and vectorgrid, scored on the
SAME hand-transcribed cells, with the same question asked of both:

    did you put the right text in the right DRAWN cell?

WHY THE DRAWN GRID IS THE FRAME
-------------------------------
The two engines disagree about what a table's columns even are — production
flattens multi-tier headers into one compound label per column and emits only
its data rows, vectorgrid returns every drawn face. Comparing "column 4 of
yours" to "column 4 of mine" would be comparing two different things, and that
is the exact mistake that once scored a PERFECTLY extracted 22-column table
125/175 (see cellscore.py:extracted_rows).

So neither engine's own grid is used. The frame is the grid the sheet actually
draws — recovered from the ruling by vectorgrid and independently verified
against 137 hand-authored boxes (137/137 within 4pt) and 917 hand-transcribed
cells. Every cell either engine emits is placed into that frame BY ITS OWN
COORDINATES: the drawn row is the last row line at or above the cell's top,
the drawn column the last column line at or left of its left edge. A cell's
text is right only if it lands where the human who read the sheet says it
belongs.

That placement rule is deliberately generous to production, whose bboxes are
snapped to the text they contain rather than to the drawn wall — text inset
inside its own cell still lands in that cell.

SCALE IS MEASURED, NOT FITTED
-----------------------------
Production reports bboxes in project image px, vectorgrid in points. The
factor between them is RENDER_SCALE = 2.0 exactly, verified against pdf.js's
own viewport transform on both a /Rotate 0 page with a non-origin MediaBox
(009_FL#30, transform [2,0,0,-2,3024,2160]) and a /Rotate 90 page
(009_FL#7, [0,2,2,0,0,0]).

Fitting the factor from the two regions' widths instead was tried first and
was WRONG: production's `region` is the bounding box of the TEXT it read, not
of the drawn walls, so on 016_NY#18's STATIONARY ROOF VENTILATOR SCHEDULE it
is inset by ~21pt on the left and fits 1.866. That shifted every column and
scored a row production had largely read correctly as 0/9. The lesson is the
one this corpus keeps teaching: a ruler derived from the thing being measured
is not a ruler. The scaled region is now only CHECKED for overlap against the
drawn box, never used to derive the scale.

    python3 headtohead.py            # every keyed sheet
    python3 headtohead.py 016_NY_... # one set
"""
from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from bakeoff import CORPUS, find_pdf, single_page_pdf   # noqa: E402
from celltext import cell_text, slot                    # noqa: E402
from cellscore import norm, truth_cells                 # noqa: E402
from vectorgrid import find_tables                      # noqa: E402

# web/src/lib/sheets.ts:10 — the factor between production's project image px
# and PDF points. Verified against pdf.js's own viewport transform, not assumed.
RENDER_SCALE = 2.0

MCP = Path(__file__).resolve().parent.parent / "mcp"
H2H = Path(os.environ.get("H2H_TMP", "/tmp/h2h"))
TOL = 2.0


def production_graph(pdf: Path) -> dict:
    H2H.mkdir(parents=True, exist_ok=True)
    out = H2H / f"{pdf.stem}.json"
    if not out.exists():
        r = subprocess.run(
            ["node", "--import", "tsx", "scripts/production-graph-cli.mjs",
             "--mode", "graph", "--pdf", str(pdf), "--out", str(out)],
            cwd=MCP, capture_output=True, text=True)
        if not out.exists():
            raise SystemExit(f"production CLI failed on {pdf}:\n{r.stderr[-2000:]}")
    return json.loads(out.read_text())


def axis(vals) -> list:
    out: list = []
    for v in sorted(vals):
        if not out or v - out[-1] > TOL:
            out.append(v)
    return out


def idx(ax: list, v: float) -> int:
    lo, hi = 0, len(ax) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if ax[mid] <= v + TOL:
            lo = mid
        else:
            hi = mid - 1
    return lo


def vg_tables(pdf: Path, page_no: int) -> list:
    """-> [(bbox, xs, ys, {(r,c): text})]"""
    out = []
    for t in find_tables(str(pdf), page_no)["tables"]:
        if not t.get("cells"):
            continue
        cells, _a, _o, _s = slot(pdf, t, page_no)
        if not cells:
            continue
        xs = axis(b[0] for b in cells)
        ys = axis(b[1] for b in cells)
        grid = {(idx(ys, b[1]), idx(xs, b[0])): norm(cell_text(w))
                for b, w in cells.items()}
        out.append((t["bbox"], xs, ys, grid))
    return out


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else None
    keys = sorted((CORPUS / "keys").glob("*.cells.csv"))
    if only:
        keys = [k for k in keys if only in k.name]

    tot = defaultdict(int)
    rows_out = []

    for kp in keys:
        sid = kp.name[: -len(".cells.csv")]
        pages: dict = defaultdict(set)
        for row in csv.reader(kp.read_text().splitlines()):
            if not row or row[0].startswith("#") or row[0] == "sheet":
                continue
            sh = row[0]
            pages[int(sh.split("#")[1]) if "#" in sh else 1].add(row[1])

        src = find_pdf(sid)
        for page_no, titles in sorted(pages.items()):
            one = single_page_pdf(src, page_no)
            want, _cover = truth_cells(sid, page_no)
            vgs = vg_tables(one, 1)
            graph = production_graph(one)

            for title in sorted(titles):
                truth = {(r, c): norm(t) for (r, c), t in want.get(title, {}).items()}
                if not truth:
                    continue
                nt = norm(title)

                # The drawn frame: the vectorgrid region that carries this
                # title in its own cells.
                frame = next((v for v in vgs if nt in v[3].values()), None)
                if frame is None:
                    rows_out.append((sid, page_no, title, len(truth), None, None, "NO-FRAME"))
                    tot["noframe_cells"] += len(truth)
                    continue
                bbox, xs, ys, vgrid = frame

                vg_hit = sum(1 for k, v in truth.items() if vgrid.get(k) == v)

                # Production's table for the same title, on the same sheet.
                pt = next((t for t in graph["tables"]
                           if norm((t.get("title") or {}).get("text") or "") == nt), None)
                if pt is None:
                    # Fairness: production may have found the same rectangle
                    # under a different (or no) title. Take the table whose
                    # region overlaps the drawn box most, so a title
                    # disagreement is never scored as a missed table.
                    best, bestov = None, 0.0
                    for t in graph["tables"]:
                        r = [v / RENDER_SCALE for v in t["region"]]
                        ov = (max(0.0, min(r[2], bbox[2]) - max(r[0], bbox[0]))
                              * max(0.0, min(r[3], bbox[3]) - max(r[1], bbox[1])))
                        if ov > bestov:
                            best, bestov = t, ov
                    area = max(1.0, (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))
                    if bestov > 0.30 * area:
                        pt = best
                        tot["matched_by_region"] += 1
                if pt is None:
                    rows_out.append((sid, page_no, title, len(truth), vg_hit, 0, "PROD-MISSED"))
                    tot["truth"] += len(truth); tot["vg"] += vg_hit
                    tot["prod_missed_tables"] += 1
                    tot["prod_missed_cells"] += len(truth)
                    continue

                scale = RENDER_SCALE
                # Sanity only: the two engines must be describing the same
                # rectangle. Production's region is its text's box, so it sits
                # INSIDE the drawn one; require it to overlap, not to match.
                pr = [v / scale for v in pt["region"]]
                if not (pr[0] < bbox[2] and pr[2] > bbox[0]
                        and pr[1] < bbox[3] and pr[3] > bbox[1]):
                    rows_out.append((sid, page_no, title, len(truth), vg_hit, None,
                                     "REGIONS DISJOINT"))
                    tot["truth"] += len(truth); tot["vg"] += vg_hit
                    tot["scale_cells"] += len(truth)
                    continue

                pgrid: dict = {}
                data_rows: set = set()
                for r in pt["rows"]:
                    for _h, cell in (r.get("cells") or {}).items():
                        b = cell.get("bbox")
                        if not b:
                            continue
                        key = (idx(ys, b[1] / scale), idx(xs, b[0] / scale))
                        pgrid.setdefault(key, norm(cell.get("text") or ""))
                        data_rows.add(key[0])
                ttl = pt.get("title") or {}
                if ttl.get("bbox"):
                    b = ttl["bbox"]
                    pgrid.setdefault((idx(ys, b[1] / scale), idx(xs, b[0] / scale)),
                                     norm(ttl.get("text") or ""))

                pr_hit = sum(1 for k, v in truth.items() if pgrid.get(k) == v)

                # Data rows only: from the first drawn row production itself
                # emits a data cell in. Header tiers it deliberately flattens
                # are not counted against it.
                first = min(data_rows, default=None)
                dat = {k: v for k, v in truth.items() if first is not None and k[0] >= first}
                tot["dtruth"] += len(dat)
                tot["dvg"] += sum(1 for k, v in dat.items() if vgrid.get(k) == v)
                tot["dprod"] += sum(1 for k, v in dat.items() if pgrid.get(k) == v)
                tot["pemit"] += len(pgrid)
                tot["pemit_right"] += sum(1 for k, v in pgrid.items() if truth.get(k) == v)

                tot["truth"] += len(truth); tot["vg"] += vg_hit; tot["prod"] += pr_hit
                rows_out.append((sid, page_no, title, len(truth), vg_hit, pr_hit,
                                 f"prod {len(pt['rows'])}r/{len(pt['headers'])}h"))

    print(f"{'set':30s} {'pg':>3s} {'table':42s} {'cells':>5s} {'VG':>6s} {'PROD':>6s}  note")
    print("-" * 122)
    for sid, pg, title, n, vg, pr, note in rows_out:
        vgs_ = f"{vg}" if vg is not None else "-"
        prs_ = f"{pr}" if pr is not None else "-"
        print(f"{sid[:30]:30s} {pg:>3d} {title[:42]:42s} {n:>5d} {vgs_:>6s} {prs_:>6s}  {note}")

    t = tot["truth"]
    print("\n" + "=" * 122)
    print(f"transcribed cells scored                 {t}")
    print(f"  vectorgrid right text, right cell      {tot['vg']:5d}  ({100*tot['vg']/max(1,t):.2f}%)")
    print(f"  production right text, right cell      {tot['prod']:5d}  ({100*tot['prod']/max(1,t):.2f}%)")
    if tot["prod_missed_tables"]:
        print(f"    of which production never found the table: "
              f"{tot['prod_missed_cells']} cells in {tot['prod_missed_tables']} tables")
    d = tot["dtruth"]
    print(f"\nDATA ROWS ONLY (from where production's own data starts)   {d}")
    print(f"  vectorgrid                             {tot['dvg']:5d}  ({100*tot['dvg']/max(1,d):.2f}%)")
    print(f"  production                             {tot['dprod']:5d}  ({100*tot['dprod']/max(1,d):.2f}%)")
    print(f"\nPRECISION — of what production emitted into a transcribed cell")
    print(f"  emitted {tot['pemit']}, right {tot['pemit_right']} "
          f"({100*tot['pemit_right']/max(1,tot['pemit']):.2f}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
