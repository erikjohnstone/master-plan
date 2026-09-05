#!/usr/bin/env python3
"""
ARE THE CELLS RIGHT? — positional, not "does this string appear somewhere".

celltext.py measures GLYPH CONTAINMENT: does every glyph land in exactly one
face. 99.4% of them do. That proves the faces TILE the text and says nothing
about whether the cells are right, which is the claim a takeoff depends on —
08_ME#1's drawing list scored 100% containment while returning
"G 000 CODE INFORMATION AND ASSEMBLIES" as a single cell.

THE SCORING RULE, AND THE WAY THE FIRST VERSION LIED
----------------------------------------------------
The first version of this matched each transcribed cell's text ANYWHERE in the
table. That inflates and had to go. A value that lands in the wrong cell is a
wrong extraction; on a schedule full of repeated values ("12\"", "X",
"SEE PLANS") an anywhere-match is nearly free; and a table returning all the
right strings in a scrambled order would have scored 100%.

A transcribed cell (row r, col c, text) is CORRECT only when the c-th cell,
left to right, of extracted row a+r holds exactly that text. One anchor `a` for
the whole table, chosen as the offset matching the most cells and then PRINTED,
so a table that only looks good under three different alignments cannot hide.
Cells to the RIGHT of the transcribed columns are ignored (nobody transcribed
them); a gap or a reordering within the transcribed span is not.

Truth files declare `# coverage: <TITLE> complete|partial`, and the two are
totalled separately: a partial transcription averaged with a full one is not a
number, it is a blend of two different questions.

Text is compared after collapsing whitespace, upper-casing, and normalising
typographic quotes — a curly apostrophe is a typeface, not content.

    python3 cellscore.py [--set <id> --page N]
    python3 cellscore.py --selftest      # prove the scorer can actually fail
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

from bakeoff import detail_captions, CORPUS, caption_boxes, find_pdf, region_owners, single_page_pdf  # noqa: E402
from boxfit import keyed_sheets                                    # noqa: E402
from celltext import cell_text, slot                               # noqa: E402
from vectorgrid import find_tables                                 # noqa: E402


def norm(s: str) -> str:
    s = (s or "").replace("“", '"').replace("”", '"')
    s = s.replace("‘", "'").replace("’", "'").replace("–", "-")
    return re.sub(r"\s+", " ", s.upper()).strip()


def truth_cells(set_id: str, page: int) -> tuple[dict, dict]:
    kp = CORPUS / "keys" / f"{set_id}.cells.csv"
    if not kp.exists():
        return {}, {}
    want_sheet = f"{set_id}.pdf" if page == 1 else f"{set_id}.pdf#{page}"
    text = kp.read_text()
    cover = {m.group(1).strip().upper(): m.group(2).lower()
             for m in re.finditer(r"#\s*coverage:\s*(.+?)\s*\|\s*(complete|partial)",
                                  text, re.I)}
    out: dict = defaultdict(dict)
    for row in csv.reader(text.splitlines()):
        if not row or row[0] in ("sheet",) or row[0] != want_sheet:
            continue
        out[row[1]][(int(row[2]), int(row[3]))] = row[4]
    return out, cover


def extracted_rows(pdf, table) -> list:
    """[[text, ...], ...] — rows top to bottom, cells left to right."""
    cells, _a, _o, _s = slot(pdf, table)
    rows: dict = defaultdict(list)
    for b, cs in cells.items():
        rows[round(b[1])].append((b[0], cell_text(cs)))
    return [[norm(t) for _x, t in sorted(rows[k])] for k in sorted(rows)]


def _row_score(wrow: dict, grow: list) -> int:
    return sum(1 for c, txt in wrow.items() if c < len(grow) and grow[c] == txt)


def score_table(want: dict, got: list) -> tuple:
    """-> (correct, total, skipped_truth_rows, rows_fully_correct)

    Rows are aligned by MONOTONIC dynamic programming, not by a fixed offset.
    A fixed offset punishes one defect many times: 08_ME#1 drops a single drawn
    header row, and index-anchoring then misaligned all eight rows under it and
    scored 7/27 for what is really one missing row and 24 correct cells.

    Monotonic is the constraint that keeps it honest. A row may be skipped on
    either side — the extractor missed a drawn row, or invented one — and each
    skipped transcribed row scores zero for every cell in it. What alignment
    cannot do is reorder: rows returned out of order cannot all be matched, so
    a swap can never score full marks. Cells are then compared BY POSITION
    inside each aligned row, so a value in the wrong column is still wrong.
    """
    byrow: dict = defaultdict(dict)
    for (r, c), txt in want.items():
        byrow[r][c] = norm(txt)
    wrows = [byrow[r] for r in sorted(byrow)]
    n, m = len(wrows), len(got)

    # dp[i][j] = best cells correct using first i truth rows and first j got rows
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            best = max(dp[i - 1][j], dp[i][j - 1])          # skip a row on either side
            best = max(best, dp[i - 1][j - 1] + _row_score(wrows[i - 1], got[j - 1]))
            dp[i][j] = best

    # walk back to count fully-correct rows and how many truth rows went unmatched
    i, j, rows_ok, matched = n, m, 0, 0
    while i > 0 and j > 0:
        sc = _row_score(wrows[i - 1], got[j - 1])
        if dp[i][j] == dp[i - 1][j - 1] + sc and sc > 0:
            matched += 1
            rows_ok += int(sc == len(wrows[i - 1]))
            i -= 1; j -= 1
        elif dp[i][j] == dp[i - 1][j]:
            i -= 1
        else:
            j -= 1
    return dp[n][m], len(want), n - matched, rows_ok


def selftest() -> int:
    want = {(0, 0): "A", (0, 1): "B", (1, 0): "C", (1, 1): "D"}
    cases = (("identical", [["A", "B"], ["C", "D"]], 4),
             ("columns swapped", [["B", "A"], ["C", "D"]], 2),
             ("a cell dropped", [["A"], ["C", "D"]], 3),
             # A swap cannot score full marks under a monotonic alignment: one of
             # the two rows can be matched in order, the other cannot. 2/4, not
             # 0 and not 4 — stated here rather than quietly chosen.
             ("rows swapped", [["C", "D"], ["A", "B"]], 2),
             ("right strings, wrong table", [["D", "C"], ["B", "A"]], 0),
             ("extra column on the right", [["A", "B", "Z"], ["C", "D", "Z"]], 4),
             ("shifted down by one", [["X", "X"], ["A", "B"], ["C", "D"]], 4),
             ("a whole row missing", [["C", "D"]], 2),
             ("junk row inserted between", [["A", "B"], ["Q", "Q"], ["C", "D"]], 4))
    bad = 0
    for name, got, expect in cases:
        n, t, _skipped, _r = score_table(want, got)
        ok = n == expect
        bad += not ok
        print(f"  {'ok ' if ok else 'BAD'} {name:28s} {n}/{t}   expected {expect}")
    print("\nA scorer that cannot lose points for a swap, a drop or a reorder is not")
    print("measuring anything. If any line above says BAD, no number it prints is real.")
    return 1 if bad else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--set")
    ap.add_argument("--page", type=int)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()

    full = dict(tables=0, cells=0, ok=0, rows=0, rows_ok=0)
    part = dict(tables=0, cells=0, ok=0, rows=0, rows_ok=0)
    print(f"{'table':46s} {'cov':>8s} {'cells':>6s} {'correct':>9s} {'rows':>8s} {'lost':>7s}")
    print("-" * 94)

    for set_id, page, titles in keyed_sheets():
        if a.set and (set_id != a.set or (a.page and page != a.page)):
            continue
        truth, cover = truth_cells(set_id, page)
        if not truth:
            continue
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        tables = find_tables(str(pdf), 1)["tables"]
        owners = region_owners([t["bbox"] for t in tables], caps, detail_captions(pdf, caps))

        for t in tables:
            title = owners.get(t["bbox"])
            if title not in truth:
                continue
            want = truth[title]
            ok, tot_c, skipped, rows_ok = score_table(want, extracted_rows(pdf, t))
            nrows = len({r for r, _c in want})
            cov = cover.get(title.upper(), "partial")
            b = full if cov == "complete" else part
            b["tables"] += 1; b["cells"] += tot_c; b["ok"] += ok
            b["rows"] += nrows; b["rows_ok"] += rows_ok
            print(f"{(set_id[:18] + ' ' + title[:26]):46s} {cov:>8s} {tot_c:6d} "
                  f"{str(ok) + '/' + str(tot_c):>9s} {str(rows_ok) + '/' + str(nrows):>8s} {skipped:7d}")

    print("\n" + "=" * 94)
    for name, b in (("COMPLETE truth", full), ("PARTIAL truth", part)):
        if not b["tables"]:
            continue
        print(f"{name}: {b['tables']} tables, {b['cells']} transcribed cells")
        print(f"   CELL ACCURACY  right text in the right position  "
              f"{b['ok']}/{b['cells']}  ({100.0 * b['ok'] / max(b['cells'], 1):.1f}%)")
        print(f"   ROWS entirely correct                           "
              f"{b['rows_ok']}/{b['rows']}  ({100.0 * b['rows_ok'] / max(b['rows'], 1):.1f}%)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
