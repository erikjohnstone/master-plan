#!/usr/bin/env python3
"""
THE STRICT RULER — is each value in the RIGHT COLUMN, on documents never seen.

benchscore.py asks whether the right text was read in the right ROW. That is
worth knowing and it is not enough: token-set matching per row scores a fused
cell and a scrambled row at 100%, which was proved rather than assumed —

    correct              9/9 = 100%
    columns FUSED        9/9 = 100%
    columns SCRAMBLED    9/9 = 100%

Column fusion is the exact failure this project criticised the old pipeline
for ("5 55.4 149" in one cell where the sheet draws three), so a ruler blind to
it cannot be the one that clears the extractor.

This scores position. 152 of the 289 ground-truth tables record their columns
as real pipe-delimited names rather than a printed line, so for those the truth
knows which value belongs in which column. Each extracted row is put on the
table's own column grid — distinct left edges clustered at 2pt, the same rule
cellscore.py uses — and compared value by value, IN ORDER, against the
ground-truth row's non-empty values.

None of this corpus was seen while the extractor was built. Its ground truth
was authored independently, which is what makes it the only number here that
measures skill rather than fit.

    python3 colscore.py

Result at the time of writing: 152/152 tables found, 986/1041 rows correct in
EVERY column (94.7%), 13,034/13,305 values in the right column (98.0%). The
residual is two things — occasionally two values landing in one cell, and a
space appearing inside a tag that wraps across lines ("HHWC-DOAH-T1- HHW").
"""
import json, glob, re, sys
sys.path.insert(0, '/home/user/master-plan/opentakeoff/bakeoff')
from pathlib import Path
from celltext import cell_text, slot
from vectorgrid import find_tables
BENCH = Path("/home/user/master-plan/HVAC BAS Benchmark Collection")
def N(s): return re.sub(r"\s+"," ",(s or "").upper()).strip().replace("Ø","O")

tot = dict(tables=0, found=0, rows=0, rows_exact=0, cells=0, cells_right=0, wrong=[])
for f in sorted(glob.glob(str(BENCH/'ground_truth/records/*.json'))):
    d = json.load(open(f))
    for t in ((d.get('modules') or {}).get('schedules') or {}).get('tables') or []:
        col = t.get('columns')
        if not (isinstance(col, str) and '|' in col): continue
        names = col.split('|'); tot['tables'] += 1
        pdf = BENCH/d['source_pdf']; page = t['page']
        try: regs = find_tables(str(pdf), page)['tables']
        except Exception: continue
        span = t.get('y_ranges') or t.get('y_edges'); xe = t.get('x_edges') or []
        if not span or len(xe) < 2: continue
        ymid = ((min(a for a,_ in span)+max(b for _,b in span))/2) if isinstance(span[0], list) else (min(span)+max(span))/2
        gx0, gx1 = min(xe), max(xe); best = None
        for g in regs:
            b = g['bbox']
            if b[1] <= ymid <= b[3] and max(0,min(b[2],gx1)-max(b[0],gx0))/max(1,gx1-gx0) > 0.5:
                best = g; break
        if not best or not best.get('cells'): continue
        tot['found'] += 1
        cells,_a,_o,_s = slot(pdf, best, page)
        byrow = {}
        for bb, ws in cells.items(): byrow.setdefault(round(bb[1]), []).append((bb[0], cell_text(ws)))
        # COLUMN GRID from the table's own distinct left edges, the same rule
        # cellscore.py uses; each extracted row becomes {col_index: text}.
        xs = sorted({round(bb[0],1) for bb in cells})
        grid = []
        for _k, v in sorted(byrow.items()):
            row = {}
            for x, txt in v:
                idx = max(i for i, gx in enumerate(xs) if gx <= x + 2.0)
                row[idx] = N(txt)
            grid.append(row)
        for gt_row in (t.get('rows') or []):
            vals = [N(x) for x in gt_row.split('|')]
            if not any(vals): continue
            tot['rows'] += 1
            # the extracted row that best matches this GT row, then compare
            # value-by-value IN ORDER against its non-empty columns.
            def score(row):
                seq = [row.get(i,"") for i in range(max(row)+1)] if row else []
                seq = [x for x in seq if x]
                nz = [v for v in vals if v]
                return sum(1 for a,b in zip(nz, seq) if a==b)
            if not grid: continue
            picked = max(grid, key=score)
            seq = [picked.get(i,"") for i in range(max(picked)+1)] if picked else []
            seq = [x for x in seq if x]
            nz = [v for v in vals if v]
            hit = sum(1 for a,b in zip(nz, seq) if a == b)
            tot['cells'] += len(nz); tot['cells_right'] += hit
            if hit == len(nz): tot['rows_exact'] += 1
            elif len(tot['wrong']) < 6:
                tot['wrong'].append((d['id'], t.get('title') or t.get('title_as_printed'), nz[:6], seq[:6]))

print(f"\nCOLUMN-LEVEL SCORE — value in the RIGHT COLUMN, order preserved")
print(f"  tables with real column structure   {tot['tables']}")
print(f"  found by the extractor              {tot['found']}")
print(f"  ground-truth rows                   {tot['rows']}")
print(f"  rows correct in EVERY column        {tot['rows_exact']}  ({100*tot['rows_exact']/max(1,tot['rows']):.1f}%)")
print(f"  values in the right column          {tot['cells_right']}/{tot['cells']}  ({100*tot['cells_right']/max(1,tot['cells']):.1f}%)")
for w in tot['wrong']:
    print(f"\n  MISMATCH {w[0]} {str(w[1])[:40]}\n    GT : {w[2]}\n    GOT: {w[3]}")
