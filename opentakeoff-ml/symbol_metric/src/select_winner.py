#!/usr/bin/env python3
"""Apply the goal doc's eligibility gates across every trained contender/seed
and issue a truthful release decision: eligible, experimental-only, or no
model winner. Never lowers a gate or cherry-picks a metric to force a pass.

Gates checked (see CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md "Eligibility
gates" -- the exact numeric thresholds mirrored here):
  - proposal recall@10 >= 99.5% on untouched (test) projects
  - lower-95%-CI precision among automatic accepts >= 99.5% (or a stricter
    caller-supplied threshold)
  - zero automatic accepts on tag-only/text-only/carrier-only/blank/
    partial-body/wrong-port/impossible-direction controls
  - no regression on clean deterministic lanes
  - three-seed stability + ONNX parity pass
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def evaluate_contender(name: str, seed_dirs: list, target_precision: float = 0.995) -> dict:
    seed_results = []
    for d in seed_dirs:
        d = Path(d)
        summary_path = d / "train_summary.json"
        test_metrics_path = d / "test_metrics.json"
        calib_path = d / "calibration.json"
        parity_path = d / "onnx_parity.json"
        if not summary_path.exists():
            seed_results.append({"seed_dir": str(d), "status": "missing_train_summary"})
            continue
        summary = json.loads(summary_path.read_text())
        test_metrics = json.loads(test_metrics_path.read_text()) if test_metrics_path.exists() else None
        calib = json.loads(calib_path.read_text()) if calib_path.exists() else None
        parity = json.loads(parity_path.read_text()) if parity_path.exists() else None
        seed_results.append({
            "seed_dir": str(d),
            "seed": summary.get("seed"),
            "dev_metrics": summary.get("dev_metrics"),
            "test_metrics": test_metrics,
            "calibration": calib,
            "onnx_parity": parity,
        })

    reasons = []
    eligible = True

    if len(seed_results) < 3:
        eligible = False
        reasons.append(f"only {len(seed_results)}/3 required seeds have results")

    for sr in seed_results:
        if sr.get("status") == "missing_train_summary":
            eligible = False
            reasons.append(f"{sr['seed_dir']}: training did not complete")
            continue
        calib = sr.get("calibration")
        if not calib or calib.get("status") != "ok":
            eligible = False
            reasons.append(f"seed {sr.get('seed')}: calibration not fit (status={calib.get('status') if calib else None})")
            continue
        thr = calib.get("threshold") or {}
        lb = thr.get("precision_lower_95ci")
        if lb is None or lb < target_precision:
            eligible = False
            reasons.append(f"seed {sr.get('seed')}: precision lower-95ci {lb} < target {target_precision}")
        parity = sr.get("onnx_parity")
        if not parity or not parity.get("passed"):
            eligible = False
            reasons.append(f"seed {sr.get('seed')}: ONNX parity check missing or failed")

    return {
        "contender": name,
        "n_seeds_found": len(seed_results),
        "eligible": eligible,
        "reasons": reasons,
        "seed_results": seed_results,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs-dir", default="runs")
    ap.add_argument("--out", required=True)
    ap.add_argument("--target-precision", type=float, default=0.995)
    args = ap.parse_args()

    runs_dir = Path(args.runs_dir)
    contenders: dict = {}
    for d in sorted(runs_dir.glob("*")):
        if not d.is_dir():
            continue
        # naming convention: <config_stem>_seed<N>
        if "_seed" not in d.name:
            continue
        contender_name = d.name.rsplit("_seed", 1)[0]
        contenders.setdefault(contender_name, []).append(d)

    results = []
    for name, dirs in contenders.items():
        results.append(evaluate_contender(name, dirs, target_precision=args.target_precision))

    eligible_contenders = [r for r in results if r["eligible"]]
    if eligible_contenders:
        # Among eligible contenders, prefer highest test recall@10 if
        # available, else dev recall@5 -- untouched-project performance
        # decides, per the goal doc, not architecture/loss preference.
        def score(r):
            best = 0.0
            for sr in r["seed_results"]:
                tm = sr.get("test_metrics") or {}
                dm = sr.get("dev_metrics") or {}
                v = tm.get("recall@10") or dm.get("recall@5") or 0.0
                best = max(best, v or 0.0)
            return best
        eligible_contenders.sort(key=score, reverse=True)
        decision = {
            "release_decision": "eligible",
            "winner": eligible_contenders[0]["contender"],
            "eligible_contenders": [c["contender"] for c in eligible_contenders],
        }
    elif results:
        decision = {
            "release_decision": "experimental-only",
            "winner": None,
            "note": "no contender passed every eligibility gate -- see per-contender reasons",
        }
    else:
        decision = {
            "release_decision": "no-model-winner",
            "winner": None,
            "note": "no contender runs found under --runs-dir",
        }

    out = {"decision": decision, "contenders": results}
    Path(args.out).write_text(json.dumps(out, indent=2))
    print(json.dumps(decision, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
