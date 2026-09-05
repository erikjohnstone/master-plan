#!/usr/bin/env python3
"""
Run the bake-off over EVERY sheet the recall keys cover and total it.

One sheet is an anecdote. 061_IA#58 alone made third-party extractors look
untouchable (13/13 for pdfplumber against our 0/13), but that sheet is a pure
schedule page — the corpus also holds cover sheets, plan sheets with one table
in a corner, and panel-schedule pages, and a region proposer that shines on
one shape can easily collapse on another. This totals across all of them.

Defaults to the cheap backends so it can run beside a Session-based eval
without competing for memory; pass --backends to include docling (~174s/page,
so ~70 min over the full key set).

    python3 bakeoff_all.py
    python3 bakeoff_all.py --backends docling
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
import warnings
from collections import defaultdict
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

from bakeoff import BACKENDS, CORPUS, caption_boxes, find_pdf, score, single_page_pdf  # noqa: E402

FAST = "pdfplumber-lines,pdfplumber-lines_strict,camelot-stream,camelot-lattice,img2table"


def keyed_sheets() -> list[tuple[str, int, list[str]]]:
    """(set_id, page, titles) for every sheet any key covers."""
    out = []
    for kp in sorted((CORPUS / "keys").glob("*.tables.csv")):
        set_id = kp.name[: -len(".tables.csv")]
        try:
            find_pdf(set_id)
        except SystemExit:
            continue  # bessemer lives outside bulk/ — skipped, not scored
        by_page: dict[int, list[str]] = defaultdict(list)
        for line in kp.read_text().splitlines():
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            row = next(csv.reader([line]))
            if row[0] == "sheet":
                continue
            page = int(row[0].split("#")[1]) if "#" in row[0] else 1
            by_page[page].append(row[1])
        for page, titles in sorted(by_page.items()):
            out.append((set_id, page, titles))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--backends", default=FAST)
    a = ap.parse_args()
    names = [b.strip() for b in a.backends.split(",") if b.strip()]

    sheets = keyed_sheets()
    total_tables = sum(len(t) for _, _, t in sheets)
    print(f"{len(sheets)} keyed sheets, {total_tables} ground-truth tables\n")

    agg = {n: {"hits": 0, "regions": 0, "secs": 0.0, "fails": 0} for n in names}
    for set_id, page, titles in sheets:
        pdf = single_page_pdf(find_pdf(set_id), page)
        caps = caption_boxes(pdf, titles)
        located = sum(1 for v in caps.values() if v)
        line = f"{set_id[:44]:44s} p{page:<4d} n={len(titles):2d} cap={located:2d}"
        for n in names:
            t0 = time.time()
            try:
                regions, _ = BACKENDS[n](pdf)
                h = len(score(regions, caps))
                agg[n]["hits"] += h
                agg[n]["regions"] += len(regions)
                line += f"  {n.split('-')[0][:4]}={h}/{len(titles)}"
            except Exception:
                agg[n]["fails"] += 1
                line += f"  {n.split('-')[0][:4]}=ERR"
            agg[n]["secs"] += time.time() - t0
        print(line, flush=True)

    print(f"\n{'backend':26s} {'recall':>12s} {'regions':>8s} {'precision':>10s} {'time':>8s}  fails")
    print("-" * 78)
    for n in names:
        s = agg[n]
        pct = 100.0 * s["hits"] / total_tables if total_tables else 0.0
        prec = 100.0 * s["hits"] / s["regions"] if s["regions"] else 0.0
        print(f"{n:26s} {s['hits']:5d}/{total_tables:<4d} {pct:4.1f}% {s['regions']:8d} {prec:9.1f}% {s['secs']:7.0f}s  {s['fails']}")
    print("\nrecall counts a table found when a keyed caption sits at the top of a")
    print("region; precision is hits/regions — a backend that emits many boxes buys")
    print("recall it did not earn, so the two must be read together.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
