#!/usr/bin/env python3
"""Pull every real, already-computed number together into one honest final
report. Never invents a number; every field either comes from a file this
pipeline already wrote or is explicitly marked missing/not-run.
"""
from __future__ import annotations

import json
import subprocess
from collections import defaultdict
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"


def load_json(path: Path):
    return json.loads(path.read_text()) if path.exists() else None


def git_sha() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=PKG_ROOT, text=True
        ).strip()
    except Exception:
        return "unknown"


def reviewed_record_counts() -> dict:
    path = PKG_ROOT / "data" / "reviewed" / "reviewed_records.jsonl"
    if not path.exists():
        return {}
    by_verdict = defaultdict(int)
    by_tier = defaultdict(int)
    by_split_verdict = defaultdict(lambda: defaultdict(int))
    split_manifest = load_json(PKG_ROOT / "data" / "manifests" / "split_manifest.json") or {}
    fam_to_split = {}
    for sp in ("train", "dev", "test"):
        for g in split_manifest.get(sp, []):
            fam_to_split[g] = sp

    n_isolated_test = 0
    n_records = 0
    with open(path) as f:
        for line in f:
            r = json.loads(line)
            n_records += 1
            by_verdict[r["verdict"]] += 1
            by_tier[r["evidence_tier"]] += 1
            sp = fam_to_split.get(r["source_family_id"], "unknown")
            by_split_verdict[sp][r["verdict"]] += 1
            if sp == "test":
                passes = r.get("review_passes", {})
                if not any(p.get("saw_prior_pass_verdict") for p in passes.values()):
                    n_isolated_test += 1
    return {
        "total_reviewed_records": n_records,
        "by_verdict": dict(by_verdict),
        "by_evidence_tier": dict(by_tier),
        "by_split_verdict": {k: dict(v) for k, v in by_split_verdict.items()},
        "test_records_with_full_isolation": n_isolated_test,
    }


def main() -> int:
    inv = load_json(REPORTS / "CORPUS_INVENTORY.json")
    split_manifest = load_json(PKG_ROOT / "data" / "manifests" / "split_manifest.json")
    review_summary = load_json(REPORTS / "review_queue_summary.json")
    export_summary = load_json(REPORTS / "EXPORT_SUMMARY.json")
    reviewed = reviewed_record_counts()

    report = {
        "git_sha": git_sha(),
        "branch": "agent/autonomous-symbol-metric-v1",
        "worktree": str(PKG_ROOT.parents[1]),
        "corpus": {
            "total_source_families_found": inv["totals"]["source_families"] if inv else None,
            "raw_dir_families": inv["totals"]["raw_dir_families"] if inv else None,
            "bulk_vol1_families": inv["totals"]["bulk_vol1_families"] if inv else None,
            "bulk_vol2_families": inv["totals"]["bulk_vol2_families"] if inv else None,
            "total_pages": inv["totals"]["total_pages_all_families"] if inv else None,
            "expected_vs_actual": inv["expected_vs_actual"] if inv else None,
        },
        "split": {
            "train_families": len(split_manifest["train"]) if split_manifest else None,
            "dev_families": len(split_manifest["dev"]) if split_manifest else None,
            "test_families": len(split_manifest["test"]) if split_manifest else None,
            "test_state_diversity": split_manifest.get("test_state_diversity") if split_manifest else None,
        },
        "review_queue": review_summary and {
            "families_processed": review_summary.get("families_processed"),
            "legend_rows_total": review_summary.get("legend_rows_total"),
            "plan_candidates_total": review_summary.get("plan_candidates_total"),
            "proposal_pairs_total": review_summary.get("proposal_pairs_total"),
        },
        "reviewed_records": reviewed,
        "export_summary": export_summary,
    }

    out_path = REPORTS / "FINAL_REPORT.json"
    out_path.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))
    print(f"\nwrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
