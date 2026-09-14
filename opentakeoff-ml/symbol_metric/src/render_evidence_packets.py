#!/usr/bin/env python3
"""Render real evidence packets (images + metadata JSON) for a batch of
proposal pairs, for actual Pass A/B/C review.

For each pair, writes to data/evidence/<pair_id>/:
  reference_150.png, reference_300.png   -- the legend/reference glyph crop
  candidate_150.png, candidate_300.png    -- the plan-page candidate glyph crop
  context.png                              -- wider local region around the candidate
                                               (leader lines, tag, neighbors visible)
  fullpage.png                              -- low-res whole-page thumbnail
  packet.json                               -- all bboxes/hashes/text/family metadata

Pass B visual review MUST see reference and candidate crops with NO caption
text burned in and in randomized left/right order -- packet.json records
which physical file is which; the reviewer prompt (not this script) is
responsible for not leaking the proposed caption/verdict into Pass B.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pymupdf  # type: ignore

sys.path.insert(0, str(Path(__file__).resolve().parent))
from corpus_paths import corpus_root  # noqa: E402
from render_crops import render_bbox, render_full_page, save_png  # noqa: E402

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"
EVIDENCE_DIR = PKG_ROOT / "data" / "evidence"


def expand_bbox(bbox: tuple, margin: float) -> tuple:
    x0, y0, x1, y1 = bbox
    return (x0 - margin, y0 - margin, x1 + margin, y1 + margin)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--queue", default="reports/review_queue.selected.jsonl")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out-index", default="reports/evidence_index.jsonl")
    args = ap.parse_args()

    root = corpus_root()
    pairs = [json.loads(l) for l in open(PKG_ROOT / args.queue) if l.strip()]
    if args.limit:
        pairs = pairs[: args.limit]

    open_docs: dict = {}

    def get_doc(rel_path: str):
        if rel_path not in open_docs:
            open_docs[rel_path] = pymupdf.open(root / rel_path)
        return open_docs[rel_path]

    index_lines = []
    for i, pair in enumerate(pairs):
        pair_id = pair["pair_id"]
        out_dir = EVIDENCE_DIR / pair_id
        out_dir.mkdir(parents=True, exist_ok=True)

        rel_path = pair["source_pdf_relative_path"]
        try:
            doc = get_doc(rel_path)
        except Exception as e:  # noqa: BLE001
            print(f"WARN cannot open {rel_path}: {e}", file=sys.stderr)
            continue

        ref = pair["reference"]
        cand = pair["candidate"]

        try:
            ref_page = doc.load_page(ref["page_index"])
            cand_page = doc.load_page(cand["page_index"])

            for dpi in (150, 300):
                rc = render_bbox(ref_page, tuple(ref["glyph_bbox"]), dpi=dpi, pad_frac=0.2)
                save_png(rc, out_dir / f"reference_{dpi}.png")
            for dpi in (150, 300):
                rc = render_bbox(cand_page, tuple(cand["glyph_bbox"]), dpi=dpi, pad_frac=0.2)
                save_png(rc, out_dir / f"candidate_{dpi}.png")

            ctx_bbox = expand_bbox(tuple(cand["glyph_bbox"]), margin=120.0)
            rc_ctx = render_bbox(cand_page, ctx_bbox, dpi=150, pad_frac=0.0)
            save_png(rc_ctx, out_dir / "context.png")

            rc_full = render_full_page(cand_page, dpi=60)
            save_png(rc_full, out_dir / "fullpage.png")
        except Exception as e:  # noqa: BLE001
            print(f"WARN render failed for {pair_id}: {e}", file=sys.stderr)
            import shutil
            shutil.rmtree(out_dir, ignore_errors=True)
            continue

        packet = {
            "pair_id": pair_id,
            "family_id": pair["family_id"],
            "split": pair["split"],
            "source_pdf_relative_path": rel_path,
            "source_pdf_sha256": pair["source_pdf_sha256"],
            "reference": ref,
            "candidate": cand,
            "shape_distance": pair["shape_distance"],
            "association_method_proposed": pair["association_method_proposed"],
            "rank": pair["rank"],
        }
        (out_dir / "packet.json").write_text(json.dumps(packet, indent=2))
        index_lines.append({"pair_id": pair_id, "dir": str(out_dir.relative_to(PKG_ROOT)),
                             "family_id": pair["family_id"], "split": pair["split"]})
        if (i + 1) % 50 == 0:
            print(f"rendered {i + 1}/{len(pairs)}", file=sys.stderr)

    for doc in open_docs.values():
        doc.close()

    with open(PKG_ROOT / args.out_index, "w") as f:
        for line in index_lines:
            f.write(json.dumps(line) + "\n")

    print(f"rendered {len(index_lines)} evidence packets -> {EVIDENCE_DIR}")
    print(f"index -> {args.out_index}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
