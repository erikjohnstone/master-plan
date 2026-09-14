#!/usr/bin/env python3
"""Turn adjudicated reviewed records (data/reviewed/reviewed_records.jsonl,
each conforming to schemas/reviewed_pair.schema.json) into the immutable
train/dev/test export: crops + manifest.jsonl per split, hashed.

Only verdict in {"positive", "hard_negative", "easy_negative"} enters the
exported dataset -- "ambiguous"/"no_physical_symbol"/"not_countable" records
are preserved in the reviewed-records ledger (audit trail) but excluded from
training, exactly as the goal doc's acceptance policy requires.
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from corpus_paths import corpus_root  # noqa: E402
from render_crops import render_bbox, RENDERER_VERSION  # noqa: E402
import pymupdf  # type: ignore  # noqa: E402

PKG_ROOT = Path(__file__).resolve().parents[1]
REVIEWED_PATH = PKG_ROOT / "data" / "reviewed" / "reviewed_records.jsonl"
MANIFESTS = PKG_ROOT / "data" / "manifests"
EXPORT_DIR = PKG_ROOT / "data" / "export"
TRAINABLE_VERDICTS = {"positive", "hard_negative", "easy_negative"}


def load_reviewed() -> list:
    if not REVIEWED_PATH.exists():
        return []
    out = []
    with open(REVIEWED_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def main() -> int:
    records = load_reviewed()
    print(f"loaded {len(records)} reviewed records")
    split_manifest = json.loads((MANIFESTS / "split_manifest.json").read_text())
    root = corpus_root()

    by_split = defaultdict(list)
    tier_counts = defaultdict(int)
    verdict_counts = defaultdict(int)
    for r in records:
        verdict_counts[r["verdict"]] += 1
        tier_counts[r["evidence_tier"]] += 1
        if r["verdict"] not in TRAINABLE_VERDICTS:
            continue
        family = r["source_family_id"]
        split_name = None
        for sp in ("train", "dev", "test"):
            if family in split_manifest[sp]:
                split_name = sp
                break
        if split_name is None:
            print(f"WARN record {r['record_id']} has unknown family {family!r} -- skipped", file=sys.stderr)
            continue
        by_split[split_name].append(r)

    print("verdict counts (all reviewed, incl. non-trainable):", dict(verdict_counts))
    print("evidence tier counts:", dict(tier_counts))

    # Cache open pdf docs by relative path within this run.
    open_docs: dict = {}

    def get_doc(rel_path: str):
        if rel_path not in open_docs:
            open_docs[rel_path] = pymupdf.open(root / rel_path)
        return open_docs[rel_path]

    manifest_hashes = {}
    for split_name, recs in by_split.items():
        crops_dir = EXPORT_DIR / split_name / "crops"
        crops_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = EXPORT_DIR / split_name / "manifest.jsonl"
        seen_crop_hashes = set()
        dup_crop_count = 0
        with open(manifest_path, "w") as mf:
            for r in recs:
                bbox = r.get("physical_body_bbox") or r["candidate_bbox"]
                try:
                    doc = get_doc(r["source_pdf_relative_path"])
                    page = doc.load_page(r["page_index"])
                    rc = render_bbox(page, tuple(bbox), dpi=300)
                except Exception as e:  # noqa: BLE001
                    print(f"WARN render failed for {r['record_id']}: {e}", file=sys.stderr)
                    continue
                if rc.sha256 in seen_crop_hashes:
                    dup_crop_count += 1
                seen_crop_hashes.add(rc.sha256)
                crop_rel = f"{rc.sha256[:2]}/{rc.sha256}.png"
                crop_path = crops_dir / crop_rel
                if not crop_path.exists():
                    crop_path.parent.mkdir(parents=True, exist_ok=True)
                    crop_path.write_bytes(rc.png_bytes)
                out_rec = dict(r)
                out_rec["crop_relative_path"] = crop_rel
                out_rec["crop_sha256"] = rc.sha256
                out_rec["renderer_version"] = RENDERER_VERSION
                mf.write(json.dumps(out_rec) + "\n")
        h = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
        manifest_hashes[split_name] = h
        (EXPORT_DIR / split_name / "manifest.sha256").write_text(f"{h}  manifest.jsonl\n")
        print(f"{split_name}: {len(recs)} records exported, "
              f"{len(seen_crop_hashes)} unique crops, {dup_crop_count} duplicate-crop hits, "
              f"manifest sha256={h[:16]}...")

    for doc in open_docs.values():
        doc.close()

    summary = {
        "verdict_counts_all_reviewed": dict(verdict_counts),
        "evidence_tier_counts_all_reviewed": dict(tier_counts),
        "exported_counts_by_split": {k: len(v) for k, v in by_split.items()},
        "manifest_hashes": manifest_hashes,
    }
    (PKG_ROOT / "reports" / "EXPORT_SUMMARY.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
