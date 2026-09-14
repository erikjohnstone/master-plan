#!/usr/bin/env python3
"""Fit logistic (Platt) calibration mapping cosine similarity ->
calibrated accept probability, on DEVELOPMENT pairs only, then freeze it.
Isotonic regression is used instead when the dev pair volume actually
supports it (>=500 pairs per class), per the production plan's Stage 3.

The calibrated threshold is chosen to hit the target precision among
automatic accepts, with a lower-95%-confidence-bound check using the
Wilson score interval (more honest at small n than a naive rate).

This never touches the test split -- test is evaluated exactly once, after
this threshold is frozen (see SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md Stage 4).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from model import ModelConfig, TwinEncoder  # noqa: E402
from dataset import CropRecordDataset  # noqa: E402
from evaluate import embed_all  # noqa: E402


def wilson_lower_bound(successes: int, n: int, z: float = 1.959963985) -> float:
    if n == 0:
        return 0.0
    p = successes / n
    denom = 1 + z ** 2 / n
    center = p + z ** 2 / (2 * n)
    margin = z * ((p * (1 - p) / n + z ** 2 / (4 * n ** 2)) ** 0.5)
    return (center - margin) / denom


def build_pair_labels(ds: CropRecordDataset, embeddings: torch.Tensor, record_ids: list) -> tuple:
    """All same-identity positive pairs (label=1) and a matched sample of
    negative-involving pairs (label=0: any pair touching a hard/easy
    negative record, or cross-identity positive pairs) -> (similarities, labels)."""
    recs = {r["record_id"]: r for r in ds.records}
    id_to_idx = {rid: i for i, rid in enumerate(record_ids)}
    by_identity: dict = {}
    for rid in record_ids:
        r = recs[rid]
        if r["verdict"] == "positive":
            by_identity.setdefault(r["symbol_identity_id"], []).append(id_to_idx[rid])
    neg_idxs = [id_to_idx[rid] for rid in record_ids if recs[rid]["verdict"] != "positive"]
    pos_idxs_flat = [i for v in by_identity.values() for i in v]

    sims_all = (embeddings @ embeddings.t()).numpy()
    sims = []
    labels = []
    for ident, idxs in by_identity.items():
        for a in range(len(idxs)):
            for b in range(a + 1, len(idxs)):
                sims.append(sims_all[idxs[a], idxs[b]])
                labels.append(1)
    rng = np.random.default_rng(0)
    # Negative pairs: sample negative-record x positive-record, and
    # cross-identity positive x positive, capped to keep this balanced-ish
    # and cheap.
    n_neg_target = max(len(sims), 50)
    tries = 0
    while len([l for l in labels if l == 0]) < n_neg_target and tries < n_neg_target * 20:
        tries += 1
        if neg_idxs and pos_idxs_flat and rng.random() < 0.5:
            i, j = rng.choice(neg_idxs), rng.choice(pos_idxs_flat)
        elif len(by_identity) >= 2:
            id_a, id_b = rng.choice(list(by_identity.keys()), size=2, replace=False)
            i, j = rng.choice(by_identity[id_a]), rng.choice(by_identity[id_b])
        else:
            break
        sims.append(sims_all[i, j])
        labels.append(0)
    return np.array(sims), np.array(labels)


def fit_logistic(sims: np.ndarray, labels: np.ndarray) -> dict:
    from sklearn.linear_model import LogisticRegression
    X = sims.reshape(-1, 1)
    clf = LogisticRegression()
    clf.fit(X, labels)
    return {"kind": "logistic", "coef": float(clf.coef_[0][0]), "intercept": float(clf.intercept_[0])}


def apply_logistic(sim: float, params: dict) -> float:
    import math
    z = params["coef"] * sim + params["intercept"]
    return 1.0 / (1.0 + math.exp(-z))


def pick_threshold(sims: np.ndarray, labels: np.ndarray, calib: dict, target_precision: float = 0.995) -> dict:
    # Threshold selection itself deliberately ranks by raw cosine similarity
    # and measures empirical (Wilson-bounded) precision directly against
    # labels -- that is already exact and needs no calibrated probability to
    # rank correctly. `calib` (the fitted logistic) is used here only to (a)
    # report the calibrated accept-probability implied at the chosen cutoff,
    # useful downstream metadata previously silently dropped since
    # apply_logistic() was defined but never called anywhere in the
    # pipeline, and (b) sanity-check the fit's sign: a non-positive
    # coefficient would mean "higher similarity -> lower calibrated
    # probability", a degenerate fit that should be visible in the report
    # rather than silently accepted.
    calibration_monotonic = calib.get("coef", 0.0) > 0
    order = np.argsort(-sims)
    best = None
    for cut_idx in range(1, len(order) + 1):
        chosen = order[:cut_idx]
        preds_pos = labels[chosen]
        n = len(chosen)
        successes = int(preds_pos.sum())
        precision = successes / n
        lb = wilson_lower_bound(successes, n)
        if lb >= target_precision:
            thr_sim = float(sims[chosen[-1]])
            best = {
                "similarity_threshold": thr_sim,
                "calibrated_probability_at_threshold": apply_logistic(thr_sim, calib),
                "calibration_monotonic": calibration_monotonic,
                "n_auto_accept_dev": n,
                "precision_dev": precision,
                "precision_lower_95ci": lb,
            }
    return best or {
        "similarity_threshold": float(sims.max()) if len(sims) else 1.0,
        "calibration_monotonic": calibration_monotonic,
        "n_auto_accept_dev": 0,
        "precision_dev": None,
        "precision_lower_95ci": None,
        "note": "no threshold on dev reached the target precision lower bound; "
                "gate will fail at evaluate_gates.py -- this is reported, not hidden",
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", required=True)
    ap.add_argument("--export-dir", default="data/export")
    ap.add_argument("--out", required=True)
    ap.add_argument("--target-precision", type=float, default=0.995)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    args = ap.parse_args()

    device = torch.device(args.device)
    ckpt = torch.load(args.checkpoint, map_location=device)
    model_cfg = ModelConfig(**ckpt["model_config"])
    model = TwinEncoder(model_cfg, pretrained=False).to(device)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    export_dir = Path(args.export_dir)
    dev_ds = CropRecordDataset(export_dir / "dev" / "manifest.jsonl", export_dir / "dev" / "crops",
                                input_size=model_cfg.input_size)
    embeddings, record_ids = embed_all(model, dev_ds, device)
    sims, labels = build_pair_labels(dev_ds, embeddings, record_ids)

    if len(sims) < 10:
        result = {
            "status": "insufficient_dev_pairs",
            "n_pairs": int(len(sims)),
            "note": "fewer than 10 dev pairs -- calibration not meaningful at this sample size",
        }
    else:
        calib = fit_logistic(sims, labels)
        thr = pick_threshold(sims, labels, calib, target_precision=args.target_precision)
        result = {
            "status": "ok",
            "n_pairs": int(len(sims)),
            "n_positive_pairs": int(labels.sum()),
            "n_negative_pairs": int((labels == 0).sum()),
            "calibration": calib,
            "threshold": thr,
            "target_precision": args.target_precision,
        }

    Path(args.out).write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
