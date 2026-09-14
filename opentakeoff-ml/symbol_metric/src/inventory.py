#!/usr/bin/env python3
"""Inventory every real PDF this session can actually reach and classify it.

Per CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md: "Resolve the actual paths
and verify rather than forcing these expected counts... Produce
reports/CORPUS_INVENTORY.json and .md with actual hashes, counts, page
counts, drawing types, vector/raster status, legend availability, tags,
symbol families, duplicates, split parts, revisions, and license/provenance
notes."

This session's real, verified corpus differs from the goal doc's expected
paths -- see TASK_SPEC.md. It inventories:
  - opentakeoff-corpus/raw/*.pdf (10 files, git-tracked)
  - opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets/{*.pdf,_rejoined/*.pdf}  (Vol1, 30 families)
  - opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets_Vol2/{*.pdf,_rejoined/*.pdf} (Vol2, up to 83 families)

Never edits/re-labels anything to force a target count -- deviations from the
goal doc's expected numbers are reported plainly.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

import pymupdf  # type: ignore

sys.path.insert(0, str(Path(__file__).resolve().parent))
from corpus_paths import corpus_root, raw_dir, bulk_vol1_dir, bulk_vol2_dir  # noqa: E402

INVENTORY_VERSION = "opentakeoff.symbol_metric.corpus_inventory.v1"
SAMPLE_PAGE_CAP = 12  # mirrors the corpus curator's own verification sampling
LEGEND_RE = re.compile(r"\bLEGEND\b", re.IGNORECASE)
HVAC_TERMS = re.compile(
    r"\b(AHU|VAV|CFM|DUCT|DDC|CHILLED WATER|CHW|HHW|BOILER|CHILLER|DAMPER|"
    r"DIFFUSER|GRILLE|THERMOSTAT|ACTUATOR|VALVE|COIL|FCU|RTU|CONDENSER|"
    r"HUMIDISTAT|SENSOR|BAS|BMS|BACNET|SEQUENCE OF OPERATION)\b",
    re.IGNORECASE,
)


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


@dataclass
class PageSample:
    index: int
    text_chars: int
    vector_paths: int
    image_area_frac: float
    has_hvac_terms: bool
    has_legend_text: bool


@dataclass
class SourceRecord:
    source_family_id: str
    volume: str  # "raw" | "bulk_vol1" | "bulk_vol2"
    canonical_relative_path: str
    canonical_sha256: str
    is_rejoined: bool
    split_part_paths: list = field(default_factory=list)
    page_count: int = 0
    sampled_pages: list = field(default_factory=list)
    vector_page_ratio: float = 0.0
    any_raster_page: bool = False
    legend_pages: list = field(default_factory=list)
    hvac_term_hits: int = 0
    retired: bool = False
    provenance_note: Optional[str] = None
    error: Optional[str] = None


def sample_indices(n_pages: int, cap: int = SAMPLE_PAGE_CAP) -> list:
    if n_pages <= cap:
        return list(range(n_pages))
    step = n_pages / cap
    return sorted({int(i * step) for i in range(cap)})


def classify_pdf(path: Path) -> tuple:
    """Returns (page_count, sampled_pages, vector_page_ratio, any_raster, legend_pages, hvac_hits)."""
    doc = pymupdf.open(path)
    n = doc.page_count
    idxs = sample_indices(n)
    samples = []
    vector_pages = 0
    any_raster = False
    legend_pages = []
    hvac_hits = 0
    for i in idxs:
        page = doc.load_page(i)
        text = page.get_text("text") or ""
        drawings = page.get_drawings()
        n_paths = len(drawings)
        page_area = page.rect.width * page.rect.height
        img_area = 0.0
        try:
            for img in page.get_image_info():
                bbox = img.get("bbox")
                if bbox:
                    w = max(0.0, bbox[2] - bbox[0])
                    h = max(0.0, bbox[3] - bbox[1])
                    img_area += w * h
        except Exception:
            pass
        img_frac = (img_area / page_area) if page_area > 0 else 0.0
        is_vectorish = n_paths >= 150 or len(text) >= 150
        if is_vectorish:
            vector_pages += 1
        if img_frac > 0.55 and n_paths < 150:
            any_raster = True
        has_legend = bool(LEGEND_RE.search(text))
        if has_legend:
            legend_pages.append(i)
        term_hits = len(HVAC_TERMS.findall(text))
        hvac_hits += term_hits
        samples.append(
            PageSample(
                index=i,
                text_chars=len(text),
                vector_paths=n_paths,
                image_area_frac=round(img_frac, 4),
                has_hvac_terms=term_hits > 0,
                has_legend_text=has_legend,
            )
        )
    doc.close()
    ratio = vector_pages / len(idxs) if idxs else 0.0
    return n, samples, ratio, any_raster, legend_pages, hvac_hits


def family_id_for(volume: str, stem: str) -> str:
    return f"{volume}:{stem}"


def scan_raw() -> list:
    records = []
    d = raw_dir()
    if not d.is_dir():
        return records
    for pdf in sorted(d.glob("*.pdf")):
        rec = SourceRecord(
            source_family_id=family_id_for("raw", pdf.stem),
            volume="raw",
            canonical_relative_path=str(pdf.relative_to(corpus_root())),
            canonical_sha256="",
            is_rejoined=False,
        )
        try:
            rec.canonical_sha256 = sha256_of(pdf)
            (rec.page_count, samples, rec.vector_page_ratio, rec.any_raster_page,
             rec.legend_pages, rec.hvac_term_hits) = classify_pdf(pdf)
            rec.sampled_pages = [asdict(s) for s in samples]
        except Exception as e:  # noqa: BLE001
            rec.error = f"{type(e).__name__}: {e}"
        records.append(rec)
    return records


def scan_bulk_volume(volume_key: str, vol_dir: Path) -> list:
    records = []
    if not vol_dir.is_dir():
        return records
    root = corpus_root()
    rejoined_dir = vol_dir / "_rejoined"
    rejoined_stems = set()
    if rejoined_dir.is_dir():
        rejoined_stems = {p.stem for p in rejoined_dir.glob("*.pdf")}

    # Direct top-level single-file families.
    direct_pdfs = sorted(vol_dir.glob("*.pdf"))
    for pdf in direct_pdfs:
        rec = SourceRecord(
            source_family_id=family_id_for(volume_key, pdf.stem),
            volume=volume_key,
            canonical_relative_path=str(pdf.relative_to(root)),
            canonical_sha256="",
            is_rejoined=False,
        )
        try:
            rec.canonical_sha256 = sha256_of(pdf)
            (rec.page_count, samples, rec.vector_page_ratio, rec.any_raster_page,
             rec.legend_pages, rec.hvac_term_hits) = classify_pdf(pdf)
            rec.sampled_pages = [asdict(s) for s in samples]
        except Exception as e:  # noqa: BLE001
            rec.error = f"{type(e).__name__}: {e}"
        records.append(rec)

    # Rejoined split-part families (only the rejoined output is canonical;
    # the raw parts are recorded as split_part_paths for provenance).
    for stem in sorted(rejoined_stems):
        rejoined_pdf = rejoined_dir / f"{stem}.pdf"
        part_dir = vol_dir / stem
        parts = sorted(str(p.relative_to(root)) for p in part_dir.glob("*.pdf")) if part_dir.is_dir() else []
        rec = SourceRecord(
            source_family_id=family_id_for(volume_key, stem),
            volume=volume_key,
            canonical_relative_path=str(rejoined_pdf.relative_to(root)),
            canonical_sha256="",
            is_rejoined=True,
            split_part_paths=parts,
        )
        try:
            rec.canonical_sha256 = sha256_of(rejoined_pdf)
            (rec.page_count, samples, rec.vector_page_ratio, rec.any_raster_page,
             rec.legend_pages, rec.hvac_term_hits) = classify_pdf(rejoined_pdf)
            rec.sampled_pages = [asdict(s) for s in samples]
        except Exception as e:  # noqa: BLE001
            rec.error = f"{type(e).__name__}: {e}"
        records.append(rec)
    return records


def load_sets_json_notes() -> dict:
    p = corpus_root() / "sets.json"
    notes = {}
    if not p.exists():
        return notes
    data = json.loads(p.read_text())
    for entry in data.get("sets", []) + data.get("retired", []):
        for fname in entry.get("files", []):
            stem = Path(fname).stem
            notes[stem] = {
                "provenance": entry.get("provenance"),
                "note": entry.get("note"),
                "retired": entry in data.get("retired", []),
            }
    return notes


def main() -> int:
    root = corpus_root()
    out_dir = Path(__file__).resolve().parents[1] / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"corpus_root = {root}", file=sys.stderr)

    records = []
    records += scan_raw()
    records += scan_bulk_volume("bulk_vol1", bulk_vol1_dir())
    records += scan_bulk_volume("bulk_vol2", bulk_vol2_dir())

    notes = load_sets_json_notes()
    for rec in records:
        stem = Path(rec.canonical_relative_path).stem
        if stem in notes:
            rec.provenance_note = notes[stem].get("provenance")
            rec.retired = bool(notes[stem].get("retired"))

    # Dedup by content hash (guards against the same PDF present under two
    # different logical locations -- e.g. raw/ and bulk/ both shipping a copy).
    by_hash = {}
    for rec in records:
        if rec.error:
            continue
        by_hash.setdefault(rec.canonical_sha256, []).append(rec.source_family_id)
    dup_groups = {h: ids for h, ids in by_hash.items() if len(ids) > 1}

    ok = [r for r in records if not r.error]
    errored = [r for r in records if r.error]
    total_pages = sum(r.page_count for r in ok)
    legend_bearing = [r for r in ok if r.legend_pages]
    raster_flagged = [r for r in ok if r.any_raster_page]

    summary = {
        "schema": INVENTORY_VERSION,
        "corpus_root": str(root),
        "generated_by": "src/inventory.py",
        "totals": {
            "source_families": len(records),
            "ok": len(ok),
            "errored": len(errored),
            "raw_dir_families": sum(1 for r in records if r.volume == "raw"),
            "bulk_vol1_families": sum(1 for r in records if r.volume == "bulk_vol1"),
            "bulk_vol2_families": sum(1 for r in records if r.volume == "bulk_vol2"),
            "total_pages_all_families": total_pages,
            "families_with_legend_text_in_sample": len(legend_bearing),
            "families_with_any_raster_page_in_sample": len(raster_flagged),
            "duplicate_content_hash_groups": len(dup_groups),
        },
        "expected_vs_actual": {
            "goal_doc_expected_HVAC_BAS_Benchmark_Collection": "NOT REACHABLE this session (see TASK_SPEC.md) -- 0 of the expected 47 symbol_sweep identities / 30 legend_learn documents / 14 symbol_grounding cases imported",
            "goal_doc_expected_bulk_source_families": 113,
            "actual_bulk_source_families_recovered": sum(1 for r in records if r.volume in ("bulk_vol1", "bulk_vol2")),
            "recovery_method": "GitHub Releases 'corpus' + 'corpus_2' tags (owner-confirmed), not the gitignored-staging-script's Google Drive path (blocked by session egress policy)",
        },
        "duplicate_content_hash_groups": dup_groups,
        "records": [asdict(r) for r in records],
    }

    json_path = out_dir / "CORPUS_INVENTORY.json"
    json_path.write_text(json.dumps(summary, indent=2))

    md_lines = []
    md_lines.append("# Corpus inventory (real, reconciled)\n")
    md_lines.append(f"Corpus root: `{root}`\n")
    md_lines.append("## Totals\n")
    for k, v in summary["totals"].items():
        md_lines.append(f"- **{k}**: {v}")
    md_lines.append("\n## Expected vs. actual (goal doc reconciliation)\n")
    for k, v in summary["expected_vs_actual"].items():
        md_lines.append(f"- **{k}**: {v}")
    if dup_groups:
        md_lines.append("\n## Duplicate content-hash groups (same PDF bytes under >1 family id)\n")
        for h, ids in dup_groups.items():
            md_lines.append(f"- `{h[:12]}...`: {', '.join(ids)}")
    md_lines.append("\n## Per-family detail\n")
    md_lines.append("| family_id | volume | pages | vector_ratio(sample) | any_raster | legend_pages(sample) | hvac_term_hits(sample) | rejoined | retired |")
    md_lines.append("|---|---|---:|---:|---|---:|---:|---|---|")
    for r in sorted(records, key=lambda r: (r.volume, r.source_family_id)):
        if r.error:
            md_lines.append(f"| {r.source_family_id} | {r.volume} | ERROR: {r.error} | | | | | | |")
            continue
        md_lines.append(
            f"| {r.source_family_id} | {r.volume} | {r.page_count} | "
            f"{r.vector_page_ratio:.2f} | {r.any_raster_page} | {len(r.legend_pages)} | "
            f"{r.hvac_term_hits} | {r.is_rejoined} | {r.retired} |"
        )
    if errored:
        md_lines.append("\n## Errors\n")
        for r in errored:
            md_lines.append(f"- {r.source_family_id}: {r.error}")

    md_path = out_dir / "CORPUS_INVENTORY.md"
    md_path.write_text("\n".join(md_lines) + "\n")

    print(json.dumps(summary["totals"], indent=2))
    print(f"\nwrote {json_path}\nwrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
