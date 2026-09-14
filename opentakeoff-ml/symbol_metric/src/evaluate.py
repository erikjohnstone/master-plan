#!/usr/bin/env python3
"""Retrieval evaluation: given the dev/test set's positive records grouped
by symbol_identity_id, treat each identity's crops as a gallery and measure
whether same-identity crops rank near each other under cosine similarity of
the model's embeddings (top-1 accuracy, recall@3/5/10) -- this is the
project-local one-shot retrieval task the model is actually built for, not
closed-set classification.

Also reports false-accept behavior on hard negatives (any negative embedding
that lands above a naive top-similarity threshold against some identity's
gallery) and localization is out of scope here (the model ranks candidate
crops it is given; it does not localize on its own -- IoU/center-error
belongs to the deterministic candidate-proposal stage, not this module).
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from dataset import CropRecordDataset, collate_batch


@torch.no_grad()
def embed_all(model, ds: CropRecordDataset, device, batch_size: int = 32):
    loader = DataLoader(ds, batch_size=batch_size, shuffle=False, collate_fn=collate_batch)
    all_embeddings = []
    all_record_ids = []
    model.eval()
    for imgs, _labels, ids in loader:
        imgs = imgs.to(device)
        emb = model(imgs)
        all_embeddings.append(emb.cpu())
        all_record_ids.extend(ids)
    if not all_embeddings:
        return torch.zeros(0, model.cfg.projection_dim), []
    return torch.cat(all_embeddings, dim=0), all_record_ids


def evaluate_retrieval(model, ds: CropRecordDataset, device, batch_size: int = 32) -> dict:
    embeddings, record_ids = embed_all(model, ds, device, batch_size=batch_size)
    if len(record_ids) == 0:
        return {"n_records": 0, "note": "empty split"}

    id_to_idx = {rid: i for i, rid in enumerate(record_ids)}
    recs = {r["record_id"]: r for r in ds.records}

    by_identity = defaultdict(list)
    for rid in record_ids:
        r = recs[rid]
        if r["verdict"] == "positive":
            by_identity[r["symbol_identity_id"]].append(id_to_idx[rid])

    negative_idxs = [id_to_idx[rid] for rid in record_ids if recs[rid]["verdict"] != "positive"]

    sims = embeddings @ embeddings.t()  # already L2-normalized -> cosine sim
    n = sims.shape[0]
    sims.fill_diagonal_(-1e9)

    ks = [1, 3, 5, 10]
    hits = {k: 0 for k in ks}
    n_queries = 0
    for identity, idxs in by_identity.items():
        if len(idxs) < 2:
            continue  # need at least one other same-identity crop to retrieve
        for qi in idxs:
            gallery_mask = torch.ones(n, dtype=torch.bool)
            gallery_mask[qi] = False
            row = sims[qi].clone()
            row[~gallery_mask] = -1e9
            order = torch.argsort(row, descending=True)
            positive_set = set(idxs) - {qi}
            for k in ks:
                topk = set(order[:k].tolist())
                if topk & positive_set:
                    hits[k] += 1
            n_queries += 1

    recall_at_k = {f"recall@{k}": (hits[k] / n_queries if n_queries else None) for k in ks}
    top1_accuracy = recall_at_k.get("recall@1")

    # False-accept probe: for each negative, its single best similarity
    # against ANY positive embedding. A well-behaved model should keep this
    # low; this is a coarse proxy, not the calibrated verdict pipeline
    # (see calibrate.py for the real threshold fit on dev pairs).
    fa_scores = []
    if negative_idxs and any(by_identity.values()):
        pos_idxs_all = [i for idxs in by_identity.values() for i in idxs]
        for ni in negative_idxs:
            best = sims[ni, pos_idxs_all].max().item() if pos_idxs_all else None
            if best is not None:
                fa_scores.append(best)

    return {
        "n_records": n,
        "n_positive_identities_with_ge2_examples": sum(1 for v in by_identity.values() if len(v) >= 2),
        "n_retrieval_queries": n_queries,
        **recall_at_k,
        "top1_accuracy": top1_accuracy,
        "n_negatives_probed": len(fa_scores),
        "negative_similarity_mean": (sum(fa_scores) / len(fa_scores)) if fa_scores else None,
        "negative_similarity_max": max(fa_scores) if fa_scores else None,
    }


def main() -> int:
    import argparse
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from model import ModelConfig, TwinEncoder

    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--export-dir", default="data/export")
    ap.add_argument("--split", default="test")
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    device = torch.device(args.device)
    ckpt = torch.load(args.checkpoint, map_location=device)
    model_cfg = ModelConfig(**ckpt["model_config"])
    model = TwinEncoder(model_cfg, pretrained=False).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    export_dir = Path(args.export_dir)
    ds = CropRecordDataset(export_dir / args.split / "manifest.jsonl", export_dir / args.split / "crops",
                            input_size=model_cfg.input_size)
    metrics = evaluate_retrieval(model, ds, device)
    metrics["split"] = args.split
    metrics["checkpoint"] = args.checkpoint
    print(json.dumps(metrics, indent=2))
    if args.out:
        Path(args.out).write_text(json.dumps(metrics, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
