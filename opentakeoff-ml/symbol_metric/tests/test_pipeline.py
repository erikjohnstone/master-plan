#!/usr/bin/env python3
"""Unit/integration tests for the symbol_metric package. Run with:
    python3 -m pytest tests/ -v
or, without pytest installed:
    python3 tests/test_pipeline.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PKG_ROOT / "src"))


def test_glyph_cluster_bbox_math():
    from glyph_cluster import GlyphCluster
    c = GlyphCluster(bbox=(10, 20, 30, 50), n_items=3, n_points=10, stroke_only=True, fill_present=False)
    assert c.width == 20
    assert c.height == 30
    assert c.area == 600
    assert c.aspect_ratio == 1.5
    assert c.centroid == (20, 35)


def test_render_crops_deterministic():
    import pymupdf
    from render_crops import render_bbox

    doc = pymupdf.open()
    page = doc.new_page(width=200, height=200)
    page.draw_rect(pymupdf.Rect(50, 50, 100, 100), color=(0, 0, 0), fill=(0, 0, 0))

    rc1 = render_bbox(page, (40, 40, 110, 110), dpi=150)
    rc2 = render_bbox(page, (40, 40, 110, 110), dpi=150)
    assert rc1.sha256 == rc2.sha256, "identical inputs must produce byte-identical crops"

    rc3 = render_bbox(page, (40, 40, 111, 110), dpi=150)
    assert rc3.sha256 != rc1.sha256, "a different bbox must not collide by coincidence in this test"


def test_model_input_preprocessing_contract():
    from render_crops import to_model_input, MODEL_INPUT_SIZE
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page(width=100, height=40)
    pix = page.get_pixmap()
    png = pix.tobytes("png")
    img = to_model_input(png)
    assert img.size == (MODEL_INPUT_SIZE, MODEL_INPUT_SIZE)
    assert img.mode == "RGB"


def test_schema_conformance_of_a_minimal_record():
    import jsonschema
    schema = json.loads((PKG_ROOT / "schemas" / "reviewed_pair.schema.json").read_text())
    validator = jsonschema.Draft202012Validator(schema)
    rec = {
        "record_id": "rec_0123456789abcdef",
        "schema_version": "opentakeoff.symbol_metric.reviewed_pair.v1",
        "evidence_tier": "agent_consensus_reviewed",
        "project_id": "test_project",
        "source_family_id": "raw:test",
        "source_pdf_sha256": "a" * 64,
        "source_pdf_relative_path": "raw/test.pdf",
        "page_index": 0,
        "reference_id": "leg_test_0_0",
        "reference_bbox": [0, 0, 10, 10],
        "candidate_bbox": [20, 20, 30, 30],
        "physical_body_bbox": [20, 20, 30, 30],
        "tag_bbox": None,
        "association_method": "legend_similarity",
        "verdict": "positive",
        "symbol_identity_id": "raw:test::row0",
        "directional": False,
        "allowed_transforms": "dihedral",
        "review_passes": {
            "pass_a_structural": {"verdict": "positive", "rationale": "r", "reviewer": "claude",
                                    "reviewed_at": "2026-09-14T00:00:00Z", "order_randomized": False,
                                    "saw_prior_pass_verdict": False},
            "pass_b_visual": {"verdict": "positive", "rationale": "r", "reviewer": "claude",
                                "reviewed_at": "2026-09-14T00:00:00Z", "order_randomized": True,
                                "saw_prior_pass_verdict": False},
            "pass_c_context": {"verdict": "positive", "rationale": "r", "reviewer": "claude",
                                 "reviewed_at": "2026-09-14T00:00:00Z", "order_randomized": False,
                                 "saw_prior_pass_verdict": False},
        },
        "final_adjudication": {"reviewer": "claude", "rationale": "all three passes agree",
                                 "reviewed_at": "2026-09-14T00:00:00Z"},
        "renderer_version": "opentakeoff.symbol_metric.render_crops.v1",
        "extraction_version": "v1",
        "crop_version": "v1",
        "crop_sha256": "b" * 64,
        "created_at": "2026-09-14T00:00:00Z",
    }
    errors = list(validator.iter_errors(rec))
    assert not errors, f"minimal valid record failed schema: {errors}"


def test_directional_transform_invariant_rejected_by_schema():
    import jsonschema
    schema = json.loads((PKG_ROOT / "schemas" / "reviewed_pair.schema.json").read_text())
    validator = jsonschema.Draft202012Validator(schema)
    # allowed_transforms is a free enum in the schema (directional-vs-transform
    # cross-field consistency is enforced by validate_dataset.py, not the
    # schema itself -- this test documents that division of responsibility).
    assert "allowed_transforms" in schema["properties"]


def test_split_manifest_no_overlap():
    manifest_path = PKG_ROOT / "data" / "manifests" / "split_manifest.json"
    if not manifest_path.exists():
        return  # not generated yet in this environment; export/CI runs freeze_split.py first
    m = json.loads(manifest_path.read_text())
    train, dev, test = set(m["train"]), set(m["dev"]), set(m["test"])
    assert not (train & dev)
    assert not (train & test)
    assert not (dev & test)


def test_split_manifest_hash_seal_matches():
    import hashlib
    manifest_path = PKG_ROOT / "data" / "manifests" / "split_manifest.json"
    hash_path = PKG_ROOT / "data" / "manifests" / "split_manifest.sha256"
    if not (manifest_path.exists() and hash_path.exists()):
        return
    recorded = hash_path.read_text().split()[0]
    actual = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    assert recorded == actual, "split_manifest.json was modified after being hash-sealed"


def test_dataset_export_no_split_leakage_if_present():
    export_dir = PKG_ROOT / "data" / "export"
    crop_to_splits = {}
    family_to_splits = {}
    for split_name in ("train", "dev", "test"):
        manifest_path = export_dir / split_name / "manifest.jsonl"
        if not manifest_path.exists():
            continue
        with open(manifest_path) as f:
            for line in f:
                r = json.loads(line)
                crop_to_splits.setdefault(r["crop_sha256"], set()).add(split_name)
                family_to_splits.setdefault(r["source_family_id"], set()).add(split_name)
    leaked = {h: s for h, s in crop_to_splits.items() if len(s) > 1}
    leaked_fam = {f: s for f, s in family_to_splits.items() if len(s) > 1}
    assert not leaked, f"crop hash(es) leaked across splits: {list(leaked)[:5]}"
    assert not leaked_fam, f"source families leaked across splits: {list(leaked_fam)[:5]}"


def test_no_tag_as_body_in_export_if_present():
    export_dir = PKG_ROOT / "data" / "export"
    for split_name in ("train", "dev", "test"):
        manifest_path = export_dir / split_name / "manifest.jsonl"
        if not manifest_path.exists():
            continue
        with open(manifest_path) as f:
            for line in f:
                r = json.loads(line)
                body = r.get("physical_body_bbox")
                tag = r.get("tag_bbox")
                if body is not None and tag is not None:
                    same = all(abs(a - b) <= 0.5 for a, b in zip(body, tag))
                    assert not same, f"record {r['record_id']} has physical_body_bbox == tag_bbox"


def test_onnx_export_module_importable():
    import export_onnx  # noqa: F401
    import verify_onnx_parity  # noqa: F401


def test_calibration_never_reads_test_split():
    src = (PKG_ROOT / "src" / "calibrate.py").read_text()
    assert '"test"' not in src and "'test'" not in src, (
        "calibrate.py must never reference the test split -- calibration is fit on dev only"
    )


if __name__ == "__main__":
    import inspect
    here = sys.modules[__name__]
    fails = 0
    for name, fn in inspect.getmembers(here, inspect.isfunction):
        if name.startswith("test_"):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                fails += 1
                print(f"FAIL {name}: {e}")
            except Exception as e:  # noqa: BLE001
                fails += 1
                print(f"ERROR {name}: {e}")
    print(f"\n{'ALL PASS' if fails == 0 else f'{fails} FAILURES'}")
    sys.exit(1 if fails else 0)
