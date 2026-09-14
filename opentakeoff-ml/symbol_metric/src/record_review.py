#!/usr/bin/env python3
"""Append-only helper for writing adjudicated review records.

Enforces the goal doc's immutability rule at the point of writing: an
existing record_id is never overwritten in place. A correction must be
written as a NEW record with `supersedes_record_id` pointing at the old one;
this module refuses a duplicate record_id outright rather than silently
allowing a second definition.

Used interactively (imported) while performing real Pass A/B/C review, and
by scripts/ingest_batch_review.py when merging a delegated subagent's
batch-review output.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import jsonschema
except ImportError:
    jsonschema = None

PKG_ROOT = Path(__file__).resolve().parents[1]
REVIEWED_DIR = PKG_ROOT / "data" / "reviewed"
REVIEWED_PATH = REVIEWED_DIR / "reviewed_records.jsonl"
SCHEMA_PATH = PKG_ROOT / "schemas" / "reviewed_pair.schema.json"

_validator = None
if jsonschema is not None and SCHEMA_PATH.exists():
    _schema = json.loads(SCHEMA_PATH.read_text())
    _validator = jsonschema.Draft202012Validator(_schema)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def record_id_for(pair_id: str) -> str:
    h = hashlib.sha256(pair_id.encode()).hexdigest()[:16]
    return f"rec_{h}"


def _existing_ids() -> set:
    if not REVIEWED_PATH.exists():
        return set()
    ids = set()
    with open(REVIEWED_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                ids.add(json.loads(line)["record_id"])
    return ids


def append_record(record: dict, allow_supersede: bool = True) -> None:
    REVIEWED_DIR.mkdir(parents=True, exist_ok=True)
    existing = _existing_ids()
    rid = record["record_id"]
    if rid in existing:
        if not (allow_supersede and record.get("supersedes_record_id")):
            raise ValueError(
                f"record_id {rid!r} already exists and this write does not set "
                f"supersedes_record_id -- immutability violation refused"
            )
    if _validator is not None:
        errors = list(_validator.iter_errors(record))
        if errors:
            raise ValueError(f"record {rid!r} fails schema: {errors[0].message}")
    with open(REVIEWED_PATH, "a") as f:
        f.write(json.dumps(record) + "\n")


def build_record(
    *,
    pair_id: str,
    packet: dict,
    evidence_tier: str,
    verdict: str,
    symbol_identity_id: str,
    directional: bool,
    allowed_transforms: str,
    association_method: str,
    pass_a: dict,
    pass_b: dict,
    pass_c: dict,
    final_rationale: str,
    reviewer: str = "claude",
    physical_body_bbox=None,
    tag_bbox=None,
    coordinate_frame: str = "pdf_points_origin_top_left",
) -> dict:
    ts = now_iso()
    cand = packet["candidate"]
    ref = packet["reference"]
    return {
        "record_id": record_id_for(pair_id),
        "schema_version": "opentakeoff.symbol_metric.reviewed_pair.v1",
        "evidence_tier": evidence_tier,
        "project_id": packet["family_id"],
        "source_family_id": packet["family_id"],
        "source_pdf_sha256": packet["source_pdf_sha256"],
        "source_pdf_relative_path": packet["source_pdf_relative_path"],
        "page_index": cand["page_index"],
        "sheet_number": None,
        "coordinate_frame": coordinate_frame,
        "reference_id": ref["row_id"],
        "reference_caption": ref["caption"],
        "reference_bbox": list(ref["glyph_bbox"]),
        "candidate_bbox": list(cand["glyph_bbox"]),
        "physical_body_bbox": list(physical_body_bbox) if physical_body_bbox else (
            list(cand["glyph_bbox"]) if verdict == "positive" else None
        ),
        "tag_bbox": list(tag_bbox) if tag_bbox else (
            list(cand["nearby_tag_bbox"]) if cand.get("nearby_tag_bbox") else None
        ),
        "association_method": association_method,
        "verdict": verdict,
        "symbol_identity_id": symbol_identity_id,
        "semantic_family": None,
        "directional": directional,
        "allowed_transforms": allowed_transforms,
        "reviewed_stretch_limit": None,
        "review_passes": {
            "pass_a_structural": pass_a,
            "pass_b_visual": pass_b,
            "pass_c_context": pass_c,
        },
        "blind_audit": None,
        "final_adjudication": {
            "reviewer": reviewer,
            "rationale": final_rationale,
            "reviewed_at": ts,
            "escalated": pass_a["verdict"] != pass_b["verdict"] or pass_b["verdict"] != pass_c["verdict"],
        },
        "renderer_version": "opentakeoff.symbol_metric.render_crops.v1",
        "extraction_version": "opentakeoff.symbol_metric.build_review_queue.v1",
        "crop_version": "v1",
        "crop_sha256": "0" * 64,  # filled in for real by export_dataset.py at render time
        "parent_annotation_id": None,
        "supersedes_record_id": None,
        "notes": None,
        "created_at": ts,
    }
