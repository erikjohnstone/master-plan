"""Grid replay, step 2: save the vectorgrid sidecar's reply for each listed page.

Usage: python replay.py OUT_DIR pages.tsv
Run with the sidecar's interpreter (.venv-sidecar). Skips pages already saved,
so two processes may work one list from both ends (pass a reversed copy).
"""
from __future__ import annotations

import glob
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "sidecar"))
sys.path.insert(0, os.path.join(ROOT, "bakeoff"))
import vectorgrid_rpc as V  # noqa: E402

out, listing = sys.argv[1], sys.argv[2]
corpus = os.path.join(ROOT, "..", "opentakeoff-corpus")
pdfs: dict = {}
for p in glob.glob(os.path.join(corpus, "**", "*.pdf"), recursive=True):
    pdfs.setdefault(os.path.basename(p), p)
os.makedirs(out, exist_ok=True)
for line in open(listing):
    if not line.strip():
        continue
    set_id, fname, page = line.rstrip("\n").split("\t")
    dst = os.path.join(out, f"{set_id}__{fname}__p{page}.json")
    if os.path.exists(dst):
        continue
    pdf = pdfs.get(fname)
    if not pdf:
        print("missing", fname, flush=True)
        continue
    t0 = time.time()
    try:
        reply = V.extract_grid(pdf, int(page))
    except Exception as e:  # a failed page is recorded, not retried
        reply = {"error": repr(e)}
    with open(dst, "w") as fh:
        json.dump(reply, fh)
    print(set_id[:24], page, len(reply.get("tables", [])), round(time.time() - t0, 1), flush=True)
print("REPLAYDONE", flush=True)
