#!/usr/bin/env python3
"""
DRAW THE DEMO CORPUS — the "walk-out proof" set, frozen before any grading
(goal VECTORGRID_TABLE_BOXES.md, "The Demo Corpus" section).

Unlike keys/HELDOUT.txt's own seeded random draw, this uses the goal
document's own suggested example method verbatim: "every Nth document from
a sorted manifest, stratified by discipline" — systematic, not random, so
the selection needs no seed to reproduce and nobody can wonder whether a
draw was re-rolled until it looked good.

Same real-population and real-stratification inputs as draw_heldout.py:
- reports/REAL_DOCUMENT_LIST-2026-09-13.txt (113 real, deduplicated
  documents — see that file's own header for why this is not "224 PDFs").
- reports/DISCIPLINE_SCAN-2026-09-13.json + Vol1/Vol2 membership, giving
  the same 4 real strata draw_heldout.py measured (this corpus is HVAC-
  primary in 101 of 113 documents; forcing an even six-way split across
  HVAC/BAS/electrical/plumbing/structural/architectural would not reflect
  the real corpus, so this draw stratifies on Vol1/Vol2 x HVAC-primary/
  another-trade-primary, same as the held-out split).

Per stratum: sort documents by id, take every Nth starting at a fixed
offset, where N is chosen so the stratum contributes its own proportional
share of the >=30 total (rounded, floored at 1 so the small tail strata are
never diluted to zero).

May overlap keys/HELDOUT.txt -- the goal document says so explicitly. It is
not hand-picked for how well vectorgrid already does on any one document.

Usage: python3 draw_demo_corpus.py [--min-total 30]
Output: keys/DEMO_CORPUS.txt
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

CORPUS = Path("/home/user/master-plan/opentakeoff-corpus")
CENSUS = CORPUS / "reports/VOLUME_FLOOR_CENSUS-2026-09-13.json"
DOC_LIST = CORPUS / "reports/REAL_DOCUMENT_LIST-2026-09-13.txt"
DISCIPLINE = CORPUS / "reports/DISCIPLINE_SCAN-2026-09-13.json"
OUT = CORPUS / "keys/DEMO_CORPUS.txt"

KEYS = ["hvac_mech", "bas_controls", "electrical", "plumbing", "structural", "architectural"]


def every_nth(sorted_ids: list[str], want: int) -> list[str]:
    """Every Nth id from a sorted list, N chosen so ~`want` are picked,
    starting at index 0 so the pick is fully determined by (list, want)."""
    n = len(sorted_ids)
    if want >= n:
        return sorted_ids[:]
    step = n / want
    picked = []
    i = 0.0
    while len(picked) < want and int(i) < n:
        picked.append(sorted_ids[int(i)])
        i += step
    return picked


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--min-total", type=int, default=30)
    a = ap.parse_args()

    census = json.loads(CENSUS.read_text())
    tables_by_id = {d["id"]: d["tables"] for d in census["docs"]}

    vol_by_id: dict[str, str] = {}
    for line in DOC_LIST.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        doc_id = Path(line).stem
        vol_by_id[doc_id] = "Vol2" if "HVAC_BAS_Plan_Sets_Vol2" in line else "Vol1"

    discipline = json.loads(DISCIPLINE.read_text())

    strata: dict[str, list[str]] = {}
    for d in discipline:
        doc_id = d["id"]
        hits = {k: d[k] for k in KEYS}
        primary = max(hits, key=hits.get)
        bucket = "hvac_primary" if primary == "hvac_mech" else "other_primary"
        stratum = f"{vol_by_id[doc_id]}_{bucket}"
        strata.setdefault(stratum, []).append(doc_id)

    total_docs = sum(len(v) for v in strata.values())
    selected: list[str] = []
    report_lines = []
    for stratum in sorted(strata):
        ids = sorted(strata[stratum])
        share = len(ids) / total_docs
        want = max(1, math.ceil(share * a.min_total))
        picked = every_nth(ids, want)
        selected.extend(picked)
        report_lines.append(f"# {stratum}: {len(picked)}/{len(ids)} documents (every ~{len(ids)/max(len(picked),1):.1f}th, proportional share of {a.min_total})")

    selected = sorted(set(selected))
    selected_tables = sum(tables_by_id.get(d, 0) for d in selected)
    header = [
        "# keys/DEMO_CORPUS.txt -- the frozen \"walk-out proof\" document set.",
        "# Selected by bakeoff/draw_demo_corpus.py using the goal document's own",
        "# suggested method verbatim: \"every Nth document from a sorted manifest,",
        "# stratified by discipline\" -- systematic, not random, reproducible with no",
        "# seed. Frozen before grading starts, same discipline as keys/HELDOUT.txt:",
        "# no swapping a document out because it embarrassed the score. May overlap",
        "# HELDOUT.txt -- the goal document says so explicitly.",
        "#",
        "# GRADING STATUS: NOT YET GRADED. Every table on every document below still",
        "# needs, per the goal document's own bar: self-supervised MISSED=0 hand-",
        "# confirmed by rendering the sheet; every box hand-graded blind (EoB<=4pt,",
        "# auto-accept does NOT apply here); every cell hand-transcribed off the",
        "# render and exact-matched (no cellocr.py cross-check substituting for",
        "# transcription here). This file names the set; it does not itself claim",
        "# any of that work is done.",
        f"# population=113 real documents (reports/REAL_DOCUMENT_LIST-2026-09-13.txt)",
        f"# selected: {len(selected)} documents, {selected_tables} tables (real, not yet graded)",
        *report_lines,
        "#",
    ]
    OUT.write_text("\n".join(header) + "\n" + "\n".join(selected) + "\n")
    print(f"wrote {OUT} -- {len(selected)} documents, {selected_tables} tables", file=sys.stderr)
    for line in report_lines:
        print(line, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
