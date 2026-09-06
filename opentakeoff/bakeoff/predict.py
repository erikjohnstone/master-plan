#!/usr/bin/env python3
"""
PREDICT FIRST, ADJUDICATE SECOND — the protocol that stops back-contamination.

The 905/905 number in this project measures FIT, not skill. The keys were
authored while the extractor was being iterated and their scores were visible
during the work, so the extractor was shaped by them and, in the places where a
key looked wrong, they were shaped by it. Twice a hand-authored box was changed
because the extractor disagreed and the extractor turned out to be right — the
right call each time, and each time another thread tying the truth to the tool.

The only way out is order. Emit the prediction, COMMIT it, and author the truth
afterwards without reading it. A prediction that is already in the history
cannot have been influenced by a truth that did not exist yet, and the git
commit is what makes that checkable by someone who does not trust the claim.

    python3 predict.py <out.json> <pdf> <page> [<pdf> <page> ...]
    python3 predict.py <out.json> --set <pdf> --pages 12,13,14

Then, in this order and no other:

    1. git add <out.json> && git commit      <- prediction is now frozen
    2. author the truth from the RENDERS, never from <out.json>
    3. score

The file records the extractor's git commit and the sha256 of every PDF, so a
prediction can always be tied to the exact code and the exact bytes that made
it. If either has moved, the comparison is not the one that was promised.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from celltext import cell_text, slot          # noqa: E402
from vectorgrid import find_tables            # noqa: E402


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def predict_page(pdf: Path, page: int) -> list:
    out = []
    for t in find_tables(str(pdf), page)["tables"]:
        if not t.get("cells"):
            out.append({"bbox": [round(v, 2) for v in t["bbox"]], "raster": True, "rows": []})
            continue
        cells, assigned, orphan, straddle = slot(pdf, t, page)
        byrow: dict = {}
        for b, ws in cells.items():
            byrow.setdefault(round(b[1]), []).append((b[0], cell_text(ws)))
        rows = [[txt for _x, txt in sorted(v)] for _k, v in sorted(byrow.items())]
        out.append({
            "bbox": [round(v, 2) for v in t["bbox"]],
            "raster": False,
            "n_rows": len(rows),
            "orphan_words": orphan,
            "straddle_words": straddle,
            "rows": rows,
        })
    return out


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    out_path = Path(sys.argv[1])
    args = sys.argv[2:]

    pairs = []
    if "--set" in args:
        pdf = Path(args[args.index("--set") + 1])
        pages = [int(x) for x in args[args.index("--pages") + 1].split(",")]
        pairs = [(pdf, p) for p in pages]
    else:
        for i in range(0, len(args), 2):
            pairs.append((Path(args[i]), int(args[i + 1])))

    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True,
                                text=True, cwd=Path(__file__).parent).stdout.strip()
    except Exception:
        commit = "unknown"

    doc = {
        "protocol": "predict-then-adjudicate",
        "warning": "AUTHOR GROUND TRUTH FROM THE RENDERS, NEVER FROM THIS FILE. "
                   "Reading it first is what the protocol exists to prevent.",
        "extractor_commit": commit,
        "pdfs": {},
        "pages": [],
    }
    for pdf, page in pairs:
        key = pdf.name
        if key not in doc["pdfs"]:
            doc["pdfs"][key] = {"path": str(pdf), "sha256": sha256(pdf)}
        doc["pages"].append({"pdf": key, "page": page, "tables": predict_page(pdf, page)})
        n = len(doc["pages"][-1]["tables"])
        print(f"  {key[:44]:46s} p{page:<4d} {n} table(s)", flush=True)

    out_path.write_text(json.dumps(doc, indent=1, ensure_ascii=False))
    tables = sum(len(p["tables"]) for p in doc["pages"])
    rows = sum(t.get("n_rows", 0) for p in doc["pages"] for t in p["tables"])
    print(f"\nfroze {tables} tables / {rows} rows over {len(doc['pages'])} page(s) -> {out_path}")
    print("COMMIT THIS FILE BEFORE AUTHORING ANY TRUTH FOR THESE PAGES.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
