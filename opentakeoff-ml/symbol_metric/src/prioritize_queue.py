#!/usr/bin/env python3
"""Merge the sharded proposal queues and select a resourced, diversity-first
review subset.

The raw proposal queue is far larger than any session can actually put
through real three-pass agent review (tens of thousands of geometry-only
proposals from a 117-family corpus). Per the goal doc: "Prioritize
drafting/export diversity, not repeated easy examples from one project."
This selects breadth (many distinct families/firms/pages) over depth
(exhausting one family's every row), and applies cheap sanity filters that
would waste real review effort on obvious noise (caption garbage, absurd
per-page row counts that signal a mis-detected page).
"""
from __future__ import annotations

import argparse
import json
import random
import re
from collections import defaultdict
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"

GARBAGE_CAPTION_RE = re.compile(r"^[\d\.\-\s]+$")  # pure numbers/dashes: not a real caption
MAX_ROWS_PER_PAGE = 40  # a page proposing more than this is almost certainly a mis-detected
                          # table/schedule, not a real symbol legend -- cap its contribution
                          # rather than let it dominate the review budget

# Real, observed false-positive captions from title-block boilerplate that
# coincidentally sits on a page containing the word "LEGEND" somewhere else
# (a cover/title sheet's general-notes box, not a real symbol legend list).
# Geometry alone can't tell these apart from a real legend caption; this is
# a cheap pre-filter so review budget isn't spent on obvious boilerplate --
# genuine ambiguous cases still reach real Pass A/B/C review.
BOILERPLATE_PATTERNS = [
    re.compile(p, re.IGNORECASE) for p in [
        r"^(VA|AF|DD|SF|GSA|NAVFAC)\s*FORM\b",
        r"^FOR\s+(ADDITIONAL|MORE)\s+INFORMATION",
        r"^(SEE|REFER\s+TO)\s+(DRAWING|SHEET|SPEC|PROJECT\s+MANUAL)",
        r"^DRAWING\s+(NO|NUMBER)\b",
        r"^SHEET\s+\d+\s+OF\s+\d+",
        r"^(SCALE|DATE|REVISION|CHECKED\s+BY|DRAWN\s+BY)\s*:?",
        r"^\(?C\)?\s*COPYRIGHT",
        r"^ALL\s+RIGHTS\s+RESERVED",
        r"^(THIS\s+DRAWING|THESE\s+DRAWINGS)\s+(IS|ARE)\s+THE\s+PROPERTY",
        r"^PROJECT\s+(NO|NUMBER|TITLE)\b",
        r"^(ISSUED|APPROVED)\s+FOR\b",
    ]
]


def looks_like_boilerplate(caption: str) -> bool:
    c = caption.strip()
    if any(p.match(c) for p in BOILERPLATE_PATTERNS):
        return True
    # A real symbol-legend caption is a short device label, not a sentence:
    # long captions ending in a period, or with >8 words, are almost always
    # a stray general-notes sentence the row-adjacency heuristic latched
    # onto rather than a legend row's own caption.
    words = c.split()
    if len(words) > 8:
        return True
    if c.endswith(".") and len(words) > 3:
        return True
    return False


def load_all_pairs() -> list:
    pairs = []
    for p in sorted(REPORTS.glob("review_queue*.jsonl")):
        if p.name == "review_queue.jsonl" and p.stat().st_size == 0:
            continue
        with open(p) as f:
            for line in f:
                line = line.strip()
                if line:
                    pairs.append(json.loads(line))
    return pairs


def already_reviewed_pair_ids() -> set:
    """pair_ids whose deterministic record_id already exists in the reviewed
    ledger -- skip re-selecting these for a fresh review round (re-proposing
    them would just collide harmlessly at write time, but it wastes review
    budget that a prior round already spent)."""
    import sys as _sys
    _sys.path.insert(0, str(Path(__file__).resolve().parent))
    from record_review import record_id_for, REVIEWED_PATH
    if not REVIEWED_PATH.exists():
        return set()
    existing_record_ids = set()
    with open(REVIEWED_PATH) as f:
        for line in f:
            if line.strip():
                existing_record_ids.add(json.loads(line)["record_id"])
    return existing_record_ids  # compared via record_id_for(pair_id) at filter time


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-family-rows", type=int, default=12,
                     help="max distinct legend rows to keep per family")
    ap.add_argument("--candidates-per-row", type=int, default=2,
                     help="how many ranked candidates per row to carry into review "
                          "(rank 0 = best shape match -> likely positive/hard-negative-adjacent; "
                          "one lower rank -> a genuine hard negative if rejected)")
    ap.add_argument("--seed", type=int, default=20260914)
    ap.add_argument("--exclude-reviewed", action="store_true",
                     help="skip pairs whose record_id is already in the reviewed ledger")
    args = ap.parse_args()

    pairs = load_all_pairs()
    print(f"loaded {len(pairs)} raw proposal pairs")

    if args.exclude_reviewed:
        import sys as _sys
        _sys.path.insert(0, str(Path(__file__).resolve().parent))
        from record_review import record_id_for
        already = already_reviewed_pair_ids()
        before = len(pairs)
        pairs = [p for p in pairs if record_id_for(p["pair_id"]) not in already]
        print(f"excluded {before - len(pairs)} already-reviewed pairs -> {len(pairs)} remaining")

    # Drop garbage captions and rows from pathologically dense pages.
    by_page = defaultdict(list)
    for p in pairs:
        ref = p["reference"]
        by_page[(p["family_id"], ref["page_index"])].append(p)

    kept = []
    for (fam, pg), plist in by_page.items():
        row_ids = {p["reference_row_id"] for p in plist}
        if len(row_ids) > MAX_ROWS_PER_PAGE:
            continue  # whole page discarded: signal that this wasn't a real legend list
        for p in plist:
            cap = p["reference"]["caption"].strip()
            if GARBAGE_CAPTION_RE.match(cap):
                continue
            if len(cap) > 120:  # a "caption" this long is prose that leaked in, not a legend label
                continue
            if looks_like_boilerplate(cap):
                continue
            kept.append(p)
    print(f"after page-sanity + caption filters: {len(kept)}")

    # Group by (family, row) so we can pick rows, then candidates within a row.
    by_family_row = defaultdict(list)
    for p in kept:
        by_family_row[(p["family_id"], p["reference_row_id"])].append(p)

    by_family = defaultdict(list)
    for (fam, row), plist in by_family_row.items():
        by_family[fam].append((row, plist))

    rng = random.Random(args.seed)
    selected = []
    for fam, rows in by_family.items():
        rng.shuffle(rows)
        # Prefer rows with longer, more distinctive captions first (more
        # likely to be a real legend label than a stray fragment), tie-break
        # by shuffle.
        rows.sort(key=lambda rp: -len(rp[0].split("_")[0]) if False else 0)
        rows.sort(key=lambda rp: -len(rp[1][0]["reference"]["caption"]))
        chosen_rows = rows[: args.per_family_rows]
        for row_id, plist in chosen_rows:
            plist.sort(key=lambda p: p["rank"])
            selected.extend(plist[: args.candidates_per_row])

    print(f"selected {len(selected)} pairs across {len(by_family)} families "
          f"(cap {args.per_family_rows} rows/family x {args.candidates_per_row} candidates/row)")

    out_path = REPORTS / "review_queue.selected.jsonl"
    with open(out_path, "w") as f:
        for p in selected:
            f.write(json.dumps(p) + "\n")

    per_split = defaultdict(int)
    for p in selected:
        per_split[p["split"]] += 1
    print("by split:", dict(per_split))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
