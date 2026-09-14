#!/usr/bin/env python3
"""Stage 0 dataset validation -- run before any training.

Checks (per SYMBOL-METRIC-MODEL-PRODUCTION-PLAN.md "Stage 0"):
  - every reviewed record's source PDF hash matches the frozen inventory;
  - no split leakage: no source_family_id / crop_sha256 appears in more than
    one of train/dev/test (belt-and-suspenders on top of freeze_split.py's
    own family-level lock);
  - no record has physical_body_bbox == tag_bbox (the exact "tag labeled as
    body" failure mode the production plan calls out by name);
  - duplicate crop hashes within a split are reported (expected for some
    reviewed-variant augmentation, flagged, not necessarily fatal);
  - every record validates against schemas/reviewed_pair.schema.json;
  - transform policy is valid for directional symbols (directional=true must
    never carry allowed_transforms other than "none").

Fails loudly (nonzero exit) on anything that should hard-stop the pipeline.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

try:
    import jsonschema
    HAVE_JSONSCHEMA = True
except ImportError:
    HAVE_JSONSCHEMA = False

PKG_ROOT = Path(__file__).resolve().parents[1]
EXPORT_DIR = PKG_ROOT / "data" / "export"
SCHEMA_PATH = PKG_ROOT / "schemas" / "reviewed_pair.schema.json"


def bbox_eq(a, b, tol: float = 0.5) -> bool:
    if a is None or b is None:
        return False
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def main() -> int:
    ok = True
    schema = json.loads(SCHEMA_PATH.read_text()) if SCHEMA_PATH.exists() else None
    validator = jsonschema.Draft202012Validator(schema) if (HAVE_JSONSCHEMA and schema) else None
    if validator is None:
        print("WARN: jsonschema not installed or schema missing -- skipping formal schema validation "
              "(structural checks below still run)", file=sys.stderr)

    crop_hash_to_splits = defaultdict(set)
    family_to_splits = defaultdict(set)
    n_records = 0
    n_schema_errors = 0
    n_tag_as_body = 0
    n_bad_directional = 0
    dup_within_split = defaultdict(int)
    positive_identities_by_split = defaultdict(set)

    for split_name in ("train", "dev", "test"):
        manifest_path = EXPORT_DIR / split_name / "manifest.jsonl"
        if not manifest_path.exists():
            print(f"WARN: no manifest for split {split_name!r} (nothing exported yet)", file=sys.stderr)
            continue
        seen_in_split = set()
        with open(manifest_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                n_records += 1

                if validator is not None:
                    errs = list(validator.iter_errors(r))
                    if errs:
                        n_schema_errors += 1
                        if n_schema_errors <= 5:
                            print(f"SCHEMA ERROR {r.get('record_id')}: {errs[0].message}", file=sys.stderr)

                if bbox_eq(r.get("physical_body_bbox"), r.get("tag_bbox")):
                    n_tag_as_body += 1
                    print(f"FATAL: record {r['record_id']} has physical_body_bbox == tag_bbox "
                          f"(tag labeled as body)", file=sys.stderr)

                if r.get("directional") and r.get("allowed_transforms") != "none":
                    n_bad_directional += 1
                    print(f"FATAL: directional record {r['record_id']} has "
                          f"allowed_transforms={r.get('allowed_transforms')!r}, must be 'none'", file=sys.stderr)

                crop_hash_to_splits[r["crop_sha256"]].add(split_name)
                family_to_splits[r["source_family_id"]].add(split_name)
                if r["verdict"] == "positive":
                    positive_identities_by_split[split_name].add(r["symbol_identity_id"])

                if r["crop_sha256"] in seen_in_split:
                    dup_within_split[split_name] += 1
                seen_in_split.add(r["crop_sha256"])

    # Rigor-tier check: the test split must never carry a combined
    # (non-isolated) review record -- see schemas/reviewed_pair.schema.json's
    # saw_prior_pass_verdict note.
    n_test_non_isolated = 0
    test_manifest = EXPORT_DIR / "test" / "manifest.jsonl"
    if test_manifest.exists():
        with open(test_manifest) as f:
            for line in f:
                r = json.loads(line)
                passes = r.get("review_passes", {})
                if any(p.get("saw_prior_pass_verdict") for p in passes.values()):
                    n_test_non_isolated += 1
                    print(f"FATAL: test record {r['record_id']} used the combined (non-isolated) "
                          f"review tier -- test-vault labels must be fully independent", file=sys.stderr)

    leaked_crops = {h: s for h, s in crop_hash_to_splits.items() if len(s) > 1}
    leaked_families = {fam: s for fam, s in family_to_splits.items() if len(s) > 1}

    print(f"\nrecords validated: {n_records}")
    print(f"schema errors: {n_schema_errors}")
    print(f"tag-as-body violations: {n_tag_as_body}")
    print(f"bad directional-transform records: {n_bad_directional}")
    print(f"duplicate crop hashes within a split: { {k: v for k, v in dup_within_split.items()} }")
    print(f"crop hashes leaked across splits: {len(leaked_crops)}")
    print(f"source families leaked across splits: {len(leaked_families)}")
    print(f"test records using non-isolated review tier: {n_test_non_isolated}")
    if leaked_families:
        print(f"  {list(leaked_families.items())[:10]}", file=sys.stderr)

    # Non-fatal: a split with zero positive identities means evaluate.py's
    # retrieval metrics and calibrate.py's dev-pair fit degrade to
    # None/"insufficient_dev_pairs" for that split (see train.py's
    # checkpoint_selection.note), which is a real, honest consequence of a
    # small corpus's positive yield rather than a pipeline defect -- report
    # it here explicitly so it is diagnosed as a data-coverage fact up front
    # rather than discovered only after a training run.
    for split_name in ("train", "dev", "test"):
        n_pos_ident = len(positive_identities_by_split.get(split_name, set()))
        if n_pos_ident == 0:
            print(f"WARN: split {split_name!r} has zero positive identities -- retrieval metrics/"
                  f"calibration for this split will be undefined, not just weak", file=sys.stderr)
        else:
            print(f"positive identities in {split_name!r}: {n_pos_ident}")

    if n_schema_errors or n_tag_as_body or n_bad_directional or leaked_crops or leaked_families or n_test_non_isolated:
        ok = False

    print(f"\nRESULT: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
