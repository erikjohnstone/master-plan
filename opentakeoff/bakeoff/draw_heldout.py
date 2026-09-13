#!/usr/bin/env python3
"""
DRAW THE HELD-OUT SPLIT — a documented, reproducible random process, run
once and never re-run to "improve" the sample (goal VECTORGRID_TABLE_BOXES.md,
"The held-out split is declared first, and frozen").

Population: the 113 real (deduplicated) bulk-corpus documents measured by
this same goal's own "Volume floor" work
(reports/VOLUME_FLOOR_CENSUS-2026-09-13.json, reports/REAL_DOCUMENT_LIST-
2026-09-13.txt) — never the naive "224 PDFs" file count, which double-counts
every document that was split into part01/part02/... files alongside its own
reassembled _rejoined copy.

Stratification: this corpus is NOT evenly spread across the six disciplines
the goal document names (HVAC, BAS, electrical, plumbing, structural,
architectural) — measured directly (reports/DISCIPLINE_SCAN-2026-09-13.json,
a text-layer keyword scan, same speed class as the volume-floor census): 101
of 113 documents are HVAC/mechanical-PRIMARY (2,156 of 2,341 tables, 92.1% of
N), with BAS/controls vocabulary present as a SECONDARY component in 94 of
113 documents but never the single dominant vocabulary of a whole document,
and only a small tail (7 electrical-primary, 4 structural-primary, 1
plumbing-primary, 0 architectural-primary) where another trade dominates.
Forcing an even six-way split would not reflect the real corpus; instead this
draw stratifies on the two axes that ARE real and measured — Vol1 vs Vol2,
and "HVAC/mechanical-primary" vs "another trade is this document's own
dominant vocabulary" — each stratum drawn to (at least) 25% of ITS OWN table
count, so the tail disciplines are not diluted away to zero by the corpus's
own HVAC-heavy composition.

Usage: python3 draw_heldout.py [--seed 20260913]
Output: keys/HELDOUT.txt (one document id per line, plus a header recording
the seed, the population source, and the per-stratum counts reached).
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

CORPUS = Path("/home/user/master-plan/opentakeoff-corpus")
CENSUS = CORPUS / "reports/VOLUME_FLOOR_CENSUS-2026-09-13.json"
DOC_LIST = CORPUS / "reports/REAL_DOCUMENT_LIST-2026-09-13.txt"
DISCIPLINE = CORPUS / "reports/DISCIPLINE_SCAN-2026-09-13.json"
OUT = CORPUS / "keys/HELDOUT.txt"

KEYS = ["hvac_mech", "bas_controls", "electrical", "plumbing", "structural", "architectural"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=20260913, help="frozen once chosen — never re-drawn to change the sample")
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

    strata: dict[str, list[tuple[str, int]]] = {}
    for d in discipline:
        doc_id = d["id"]
        hits = {k: d[k] for k in KEYS}
        primary = max(hits, key=hits.get)
        bucket = "hvac_primary" if primary == "hvac_mech" else "other_primary"
        stratum = f"{vol_by_id[doc_id]}_{bucket}"
        strata.setdefault(stratum, []).append((doc_id, tables_by_id.get(doc_id, 0)))

    total_N = sum(tables_by_id.values())
    rng = random.Random(a.seed)
    selected: list[str] = []
    report_lines = []
    for stratum in sorted(strata):
        docs = strata[stratum][:]
        rng.shuffle(docs)
        stratum_total = sum(t for _, t in docs)
        target = round(0.25 * stratum_total)
        picked: list[str] = []
        picked_tables = 0
        for doc_id, n in docs:
            if picked_tables >= target:
                break
            picked.append(doc_id)
            picked_tables += n
        selected.extend(picked)
        report_lines.append(
            f"# {stratum}: {len(picked)}/{len(docs)} documents, {picked_tables}/{stratum_total} tables "
            f"({100 * picked_tables / stratum_total:.1f}% of stratum, target was 25%)"
        )

    selected_tables = sum(tables_by_id.get(d, 0) for d in selected)
    header = [
        "# keys/HELDOUT.txt -- the frozen held-out document split.",
        "# Drawn once by bakeoff/draw_heldout.py, goal VECTORGRID_TABLE_BOXES.md's own",
        "# \"declared first, and frozen\" rule: NEVER used to change vectorgrid, and never",
        "# re-drawn to improve a score. If a held-out failure is worth fixing, the fix is",
        "# made against the tuning half (every document NOT in this list) and this split",
        "# is re-run untouched -- this file itself must not change once graded.",
        f"# seed={a.seed}  population=113 real documents (reports/REAL_DOCUMENT_LIST-2026-09-13.txt)",
        f"# N={total_N} real tables (reports/VOLUME_FLOOR_CENSUS-2026-09-13.json)",
        f"# selected: {len(selected)} documents, {selected_tables} tables ({100 * selected_tables / total_N:.1f}% of N, floor was 25%)",
        *report_lines,
        "#",
    ]
    OUT.write_text("\n".join(header) + "\n" + "\n".join(sorted(selected)) + "\n")
    print(f"wrote {OUT} -- {len(selected)} documents, {selected_tables}/{total_N} tables ({100 * selected_tables / total_N:.1f}%)", file=sys.stderr)
    for line in report_lines:
        print(line, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
