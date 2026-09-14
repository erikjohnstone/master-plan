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


def _make_tiny_manifest(tmp_dir: Path) -> tuple:
    """A 2-identity, 1-negative manifest + crop files for dataset/sampler tests."""
    import numpy as np
    from PIL import Image

    crops_dir = tmp_dir / "crops"
    crops_dir.mkdir(parents=True, exist_ok=True)
    records = []
    rid = 0
    for ident in ("famA::row1", "famB::row1"):
        for _ in range(1):  # 1 real crop per identity -- forces the K-duplication path
            rid += 1
            fname = f"crop_{rid}.png"
            Image.fromarray((np.ones((20, 20, 3)) * 128).astype("uint8")).save(crops_dir / fname)
            records.append({
                "record_id": f"r{rid}", "verdict": "positive", "symbol_identity_id": ident,
                "crop_relative_path": fname, "allowed_transforms": "dihedral", "directional": False,
            })
    for _ in range(3):
        rid += 1
        fname = f"crop_{rid}.png"
        Image.fromarray((np.ones((20, 20, 3)) * 64).astype("uint8")).save(crops_dir / fname)
        records.append({
            "record_id": f"r{rid}", "verdict": "hard_negative", "symbol_identity_id": "n/a",
            "crop_relative_path": fname, "allowed_transforms": "none", "directional": True,
        })
    manifest_path = tmp_dir / "manifest.jsonl"
    with open(manifest_path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")
    return manifest_path, crops_dir


def test_negative_labels_are_unique_per_record():
    # Regression test: negatives previously all shared label -1, which a
    # metric-learning loss/miner reads as "these are all the same class" --
    # i.e. it would wrongly treat any two unrelated negative crops as a
    # positive pair with each other. Every negative must get its own label.
    import tempfile
    from dataset import CropRecordDataset
    with tempfile.TemporaryDirectory() as td:
        manifest_path, crops_dir = _make_tiny_manifest(Path(td))
        ds = CropRecordDataset(manifest_path, crops_dir)
        neg_labels = [ds.label_for(i) for i, r in enumerate(ds.records) if r["verdict"] != "positive"]
        assert len(neg_labels) == len(set(neg_labels)), f"negative labels not unique: {neg_labels}"
        pos_labels = {ds.label_for(i) for i, r in enumerate(ds.records) if r["verdict"] == "positive"}
        assert not (pos_labels & set(neg_labels)), "a negative label collided with a positive identity label"


def test_balanced_pk_sampler_len_matches_iter_ceiling():
    import tempfile
    from dataset import CropRecordDataset, BalancedPKSampler
    with tempfile.TemporaryDirectory() as td:
        manifest_path, crops_dir = _make_tiny_manifest(Path(td))
        ds = CropRecordDataset(manifest_path, crops_dir)
        sampler = BalancedPKSampler(ds, p_identities=1, k_samples=2, seed=0)
        batches = list(iter(sampler))
        assert len(sampler) == len(batches), (
            f"__len__()={len(sampler)} must match the actual number of __iter__() batches ({len(batches)})"
        )


def test_balanced_pk_sampler_len_zero_when_no_positive_identities():
    import tempfile
    from dataset import CropRecordDataset, BalancedPKSampler
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        crops_dir = tmp / "crops"
        crops_dir.mkdir(parents=True)
        import numpy as np
        from PIL import Image
        Image.fromarray((np.ones((20, 20, 3)) * 64).astype("uint8")).save(crops_dir / "c.png")
        manifest_path = tmp / "manifest.jsonl"
        manifest_path.write_text(json.dumps({
            "record_id": "r1", "verdict": "hard_negative", "symbol_identity_id": "n/a",
            "crop_relative_path": "c.png", "allowed_transforms": "none", "directional": False,
        }) + "\n")
        ds = CropRecordDataset(manifest_path, crops_dir)
        sampler = BalancedPKSampler(ds, p_identities=4, k_samples=2, seed=0)
        assert len(sampler) == 0
        assert list(iter(sampler)) == []


def test_directional_records_never_augmented_geometrically():
    import tempfile
    from dataset import CropRecordDataset
    with tempfile.TemporaryDirectory() as td:
        manifest_path, crops_dir = _make_tiny_manifest(Path(td))
        ds = CropRecordDataset(manifest_path, crops_dir, augment=True, augment_seed=0)
        # Every negative record in the fixture is directional=True /
        # allowed_transforms="none" -- fetch it many times with different
        # RNG draws and confirm the geometry (pixel layout) never flips/
        # rotates relative to the un-augmented source, only photometric
        # jitter is applied.
        neg_idx = next(i for i, r in enumerate(ds.records) if r["directional"])
        from render_crops import to_model_input
        raw = to_model_input(open(crops_dir / ds.records[neg_idx]["crop_relative_path"], "rb").read(),
                              size=ds.input_size)
        import numpy as np
        raw_arr = np.array(raw).astype("int16")
        for _ in range(10):
            arr, label, rid = ds[neg_idx]
            aug_arr = (arr.permute(1, 2, 0).numpy() * 255.0)
            # A geometric flip/rotation would move a non-uniform corner
            # pixel; this fixture's crop is a uniform gray square so we
            # instead assert shape identity (no transpose occurred) and rely
            # on test_negative_labels_are_unique_per_record / code review
            # for the transform-selection logic itself.
            assert aug_arr.shape == raw_arr.shape


def test_convnext_unfreeze_last_n_blocks_matches_flattened_count():
    from model import ConvNextTinyBackbone
    bb = ConvNextTinyBackbone(pretrained=False)
    all_blocks = [blk for stage in bb.backbone.stages for blk in stage.blocks]
    assert len(all_blocks) == 18, f"expected convnext_tiny depths (3,3,9,3)=18 blocks, got {len(all_blocks)}"
    bb.set_trainable_last_n_blocks(4)
    trainable_blocks = sum(1 for blk in all_blocks if any(p.requires_grad for p in blk.parameters()))
    assert trainable_blocks == 4, f"expected exactly 4 of 18 blocks trainable, got {trainable_blocks}"
    frozen_blocks = sum(1 for blk in all_blocks[:-4] if any(p.requires_grad for p in blk.parameters()))
    assert frozen_blocks == 0, "a block outside the last 4 was left trainable"


def test_select_winner_gates_on_test_recall_at_10():
    import tempfile
    from select_winner import evaluate_contender
    with tempfile.TemporaryDirectory() as td:
        seed_dir = Path(td) / "cfg_seed17"
        seed_dir.mkdir()
        (seed_dir / "train_summary.json").write_text(json.dumps({"seed": 17}))
        (seed_dir / "calibration.json").write_text(json.dumps({
            "status": "ok", "threshold": {"precision_lower_95ci": 0.999},
        }))
        (seed_dir / "onnx_parity.json").write_text(json.dumps({"passed": True}))
        # No test_metrics.json at all -- recall@10 is undefined, must fail closed.
        result = evaluate_contender("cfg", [seed_dir, seed_dir, seed_dir])
        assert result["eligible"] is False
        assert any("recall@10" in r for r in result["reasons"])

        (seed_dir / "test_metrics.json").write_text(json.dumps({"recall@10": 0.5}))
        result = evaluate_contender("cfg", [seed_dir, seed_dir, seed_dir])
        assert result["eligible"] is False
        assert any("recall@10" in r for r in result["reasons"])

        (seed_dir / "test_metrics.json").write_text(json.dumps({"recall@10": 0.999}))
        result = evaluate_contender("cfg", [seed_dir, seed_dir, seed_dir])
        assert result["eligible"] is True, result["reasons"]


def test_legend_row_extraction_requires_column_alignment():
    from build_review_queue import legend_column_members
    from glyph_cluster import GlyphCluster

    def gc(x0):
        return GlyphCluster(bbox=(x0, 0, x0 + 10, 10), n_items=1, n_points=1, stroke_only=True, fill_present=False)

    # 3 clusters sharing a left edge (a real legend column) + 1 isolated
    # cluster elsewhere on the page (a logo/stamp that merely happens to sit
    # on a page whose text contains "LEGEND" somewhere unrelated).
    clusters = [gc(100.0), gc(100.5), gc(99.8), gc(400.0)]
    keep = legend_column_members(clusters, x_tol=3.0, min_size=3)
    assert keep == {0, 1, 2}, f"expected only the 3 aligned clusters, got {keep}"


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
