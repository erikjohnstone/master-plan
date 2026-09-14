#!/usr/bin/env python3
"""Build the agent review queue: candidate legend/reference rows, candidate
plan-page physical-body proposals, and a same-family shape-similarity
pairing between them.

This is deterministic geometry + text proximity only -- an independent,
from-scratch Python implementation (this package must not import the shared
production TypeScript pipeline). Nothing here is trusted as truth: every
proposal is tagged verdict="proposal" and must pass Pass A/B/C review before
it can become a training record, exactly as the goal doc requires
("These signals may prioritize the queue but cannot approve themselves").

Usage:
    python3 src/build_review_queue.py [--families train,dev,test] [--limit-per-family N]
"""
from __future__ import annotations

import argparse
import gc
import json
import re
import resource
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Optional

import pymupdf  # type: ignore

# Hard per-process memory ceiling. This sandbox has 15GB total across up to
# 4 parallel shards; a real corpus family (dense federal/hospital sets) has
# already been observed here climbing past 7GB RSS in one process and
# forcing a manual kill to avoid taking down sibling shards via the OS OOM
# killer. Capping RLIMIT_AS turns that into a clean, catchable MemoryError
# in THIS process instead of an uncontrolled kill of any process on the box.
_MEM_CAP_BYTES = 3 * 1024 * 1024 * 1024
try:
    resource.setrlimit(resource.RLIMIT_AS, (_MEM_CAP_BYTES, _MEM_CAP_BYTES))
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent))
from corpus_paths import corpus_root  # noqa: E402
from glyph_cluster import (  # noqa: E402
    GlyphCluster, cluster_page, filter_symbol_candidates,
)

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"
MANIFESTS = PKG_ROOT / "data" / "manifests"

LEGEND_RE = re.compile(r"\bLEGEND\b", re.IGNORECASE)
TAG_LIKE_RE = re.compile(r"^\(?[A-Z]{1,6}-?\d{1,3}[A-Za-z]?\)?$")
LEGEND_ROW_MAX_GAP_PT = 130.0
MAX_CANDIDATE_PAGES_PER_FAMILY = 20  # bounded runtime; sampled across the doc, not just the head
TOP_K_PER_LEGEND_ROW = 5

# Root-caused from real round-2 review evidence (dozens of independent agents,
# spanning many unrelated families, all reporting the same failure mode):
# is_legend_page is a PAGE-level flag ("the word LEGEND appears somewhere on
# this page"), so once tripped, every glyph-shaped cluster ANYWHERE on that
# page -- a title-block PE stamp, a street address, a sheet-index entry, a
# north-arrow, a DSA permit stamp -- was being proposed as a "legend row" as
# long as it had any text sitting near it. A real legend/schedule list is a
# COLUMN of entries sharing a left edge; an isolated logo/stamp/divider
# elsewhere on a page that merely contains the word "LEGEND" (a cover sheet
# referencing "see symbol legend on E-001", a general-notes page, a drawing
# index) will not have that column structure. Requiring column membership is
# a direct, geometry-only fix for the dominant false-reference-row problem
# observed across round 2 (see reports/CORPUS_INVENTORY.md round-2 note).
LEGEND_COLUMN_X_TOL_PT = 3.0
MIN_LEGEND_COLUMN_SIZE = 3


def group_words_into_lines(words: list) -> list:
    lines: dict = {}
    for w in words:
        x0, y0, x1, y1, text, block_no, line_no, _word_no = w
        key = (block_no, line_no)
        lines.setdefault(key, []).append((x0, y0, x1, y1, text))
    out = []
    for key, ws in lines.items():
        ws.sort(key=lambda t: t[0])
        x0 = min(t[0] for t in ws)
        y0 = min(t[1] for t in ws)
        x1 = max(t[2] for t in ws)
        y1 = max(t[3] for t in ws)
        text = " ".join(t[4] for t in ws)
        out.append({"bbox": (x0, y0, x1, y1), "text": text})
    return out


def nearest_line_right_or_below(bbox: tuple, lines: list, max_gap: float) -> Optional[dict]:
    cx0, cy0, cx1, cy1 = bbox
    cy_mid = (cy0 + cy1) / 2
    best = None
    best_score = None
    for ln in lines:
        lx0, ly0, lx1, ly1 = ln["bbox"]
        ly_mid = (ly0 + ly1) / 2
        if not ln["text"].strip():
            continue
        # vertical alignment: caption roughly on the same text row as the glyph.
        # Tightened after real review evidence (multiple independent Pass C
        # reports) showed the looser tolerance regularly grabbing an adjacent
        # legend row's caption instead of the glyph's own -- e.g. "Heat
        # Detector" attributed to the glyph that is actually "Smoke Detector"
        # one row up/down. A real legend row's own line height is the best
        # local estimate of row pitch; allow well under one row's worth of
        # slop, not two.
        v_gap = abs(ly_mid - cy_mid)
        if v_gap > (cy1 - cy0) * 0.9 + 6:
            continue
        if lx0 >= cx1 - 2:  # to the right
            h_gap = lx0 - cx1
        elif ly0 >= cy1 - 2:  # directly below
            h_gap = 0.0
            v_gap += (ly0 - cy1)
        else:
            continue
        gap = h_gap + v_gap
        if gap > max_gap:
            continue
        score = gap
        if best_score is None or score < best_score:
            best_score = score
            best = {"bbox": (lx0, ly0, lx1, ly1), "text": ln["text"].strip(), "gap": gap}
    return best


def shape_descriptor(c: GlyphCluster) -> tuple:
    import math
    ar = c.aspect_ratio
    return (
        math.log10(max(c.area, 1.0)),
        math.log10(max(c.n_items, 1)),
        min(ar, 20.0) / 20.0,
        1.0 if c.fill_present else 0.0,
    )


def descriptor_distance(a: tuple, b: tuple) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


@dataclass
class LegendRow:
    row_id: str
    family_id: str
    page_index: int
    glyph_bbox: tuple
    caption: str
    caption_bbox: tuple


@dataclass
class PlanCandidate:
    cand_id: str
    family_id: str
    page_index: int
    glyph_bbox: tuple
    nearby_tag_text: Optional[str]
    nearby_tag_bbox: Optional[tuple]


MAX_DRAWINGS_PER_PAGE = 6000  # extreme-density pages (large federal/hospital sets) OOM'd the
                                # 4-core/15GB sandbox during a real run; skip clustering on
                                # these specific pages rather than risk taking the shard down.


def legend_column_members(clusters: list, x_tol: float = LEGEND_COLUMN_X_TOL_PT,
                            min_size: int = MIN_LEGEND_COLUMN_SIZE) -> set:
    """Indices into `clusters` that belong to a left-edge-aligned column of
    >= min_size clusters (self included) on this page -- the geometric
    signature of an actual legend/schedule list. O(n^2) but n is the
    post-filter_symbol_candidates cluster count for one page (small)."""
    n = len(clusters)
    x0s = [c.bbox[0] for c in clusters]
    keep = set()
    for i in range(n):
        count = 1 + sum(
            1 for j in range(n) if j != i and abs(x0s[i] - x0s[j]) <= x_tol
        )
        if count >= min_size:
            keep.add(i)
    return keep


def process_family(family_id: str, pdf_path: Path, limit_pages: int = MAX_CANDIDATE_PAGES_PER_FAMILY) -> dict:
    doc = pymupdf.open(pdf_path)
    n = doc.page_count
    legend_rows: list = []
    plan_candidates: list = []
    skipped_dense_pages = 0

    # Large documents (40+ sheets -- e.g. the corpus's own documented
    # Northport Dialysis OOM case) get a tighter sample so total work per
    # family stays roughly bounded regardless of document size.
    effective_limit = limit_pages if n <= 40 else max(6, limit_pages // 3)
    pages_to_scan = range(n) if n <= effective_limit else range(0, n, max(1, n // effective_limit))

    for pno in pages_to_scan:
        try:
            page = doc.load_page(pno)
            text = page.get_text("text") or ""
            words = page.get_text("words")
            lines = group_words_into_lines(words)
            is_legend_page = bool(LEGEND_RE.search(text))

            n_drawings_probe = len(page.get_drawings())
            if n_drawings_probe > MAX_DRAWINGS_PER_PAGE:
                skipped_dense_pages += 1
                page = None
                continue

            clusters = cluster_page(page)
        except MemoryError:
            skipped_dense_pages += 1
            page = None
            gc.collect()
            continue
        except Exception:
            page = None
            continue
        clusters = filter_symbol_candidates(clusters, words)

        if is_legend_page:
            column_members = legend_column_members(clusters)
            for i, c in enumerate(clusters):
                if i not in column_members:
                    continue
                nl = nearest_line_right_or_below(c.bbox, lines, LEGEND_ROW_MAX_GAP_PT)
                if nl is None:
                    continue
                caption = nl["text"]
                if len(caption) < 3 or LEGEND_RE.match(caption):
                    continue
                row_id = f"leg_{family_id}_{pno}_{i}"
                legend_rows.append(LegendRow(
                    row_id=row_id, family_id=family_id, page_index=pno,
                    glyph_bbox=c.bbox, caption=caption, caption_bbox=nl["bbox"],
                ))

        # Every page (legend or plan) also contributes plan-candidate
        # proposals -- a symbol can legitimately recur on a legend sheet's
        # own riser/detail inset, and restricting candidates to
        # "non-legend pages" would silently exclude that.
        for i, c in enumerate(clusters):
            nl = nearest_line_right_or_below(c.bbox, lines, 40.0)
            tag_text = None
            tag_bbox = None
            if nl and TAG_LIKE_RE.match(nl["text"].strip()):
                tag_text = nl["text"].strip()
                tag_bbox = nl["bbox"]
            cand_id = f"cand_{family_id}_{pno}_{i}"
            plan_candidates.append(PlanCandidate(
                cand_id=cand_id, family_id=family_id, page_index=pno,
                glyph_bbox=c.bbox, nearby_tag_text=tag_text, nearby_tag_bbox=tag_bbox,
            ))
        page = None  # release pymupdf page resources before the next iteration
        gc.collect()

    doc.close()
    gc.collect()
    return {
        "legend_rows": legend_rows,
        "plan_candidates": plan_candidates,
        "skipped_dense_pages": skipped_dense_pages,
        "pages_scanned": len(list(pages_to_scan)) if not isinstance(pages_to_scan, range) else len(pages_to_scan),
    }


def build_pairs(legend_rows: list, plan_candidates: list, top_k: int = TOP_K_PER_LEGEND_ROW) -> list:
    # Precompute descriptors; naive O(rows*candidates) is fine at this corpus
    # scale (a few hundred rows x a few thousand candidates per family, done
    # family-by-family so the product stays small).
    pairs = []
    if not legend_rows or not plan_candidates:
        return pairs
    cand_desc = []
    for cand in plan_candidates:
        gc = GlyphCluster(bbox=cand.glyph_bbox, n_items=1, n_points=1, stroke_only=True, fill_present=False)
        cand_desc.append(None)  # placeholder; descriptors recomputed from real cluster where available below

    for row in legend_rows:
        row_gc = GlyphCluster(bbox=row.glyph_bbox, n_items=1, n_points=1, stroke_only=True, fill_present=False)
        row_desc = shape_descriptor(row_gc)
        scored = []
        for cand in plan_candidates:
            if cand.page_index == row.page_index and cand.family_id == row.family_id:
                # trivially skip candidates that are the legend row's own glyph re-detected
                if abs(cand.glyph_bbox[0] - row.glyph_bbox[0]) < 1 and abs(cand.glyph_bbox[1] - row.glyph_bbox[1]) < 1:
                    continue
            cgc = GlyphCluster(bbox=cand.glyph_bbox, n_items=1, n_points=1, stroke_only=True, fill_present=False)
            d = descriptor_distance(row_desc, shape_descriptor(cgc))
            scored.append((d, cand))
        # Real review evidence (round 1) found essentially zero positives
        # among pure shape-distance top-K: the true match, when present, was
        # regularly ranked well outside the top 5 among thousands of
        # candidates. A candidate that sits near a real authored tag/leader
        # is structurally far more likely to be a genuine device than one
        # that merely resembles the reference's silhouette, so tag-bearing
        # candidates are surfaced first regardless of shape rank, then
        # backfilled with the best shape matches.
        scored.sort(key=lambda t: (t[1].nearby_tag_text is None, t[0]))
        for rank, (d, cand) in enumerate(scored[:top_k]):
            assoc = "legend_similarity"
            if cand.nearby_tag_text:
                assoc = "authored_leader"  # proposal only -- Pass A confirms/denies against the real leader/tag geometry
            pairs.append({
                "pair_id": f"pair_{row.row_id}_{cand.cand_id}",
                "family_id": row.family_id,
                "reference_row_id": row.row_id,
                "candidate_id": cand.cand_id,
                "rank": rank,
                "shape_distance": round(d, 4),
                "association_method_proposed": assoc,
                "reference": asdict(row),
                "candidate": asdict(cand),
            })
    return pairs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--splits", default="train,dev,test")
    ap.add_argument("--limit-families", type=int, default=0, help="0 = no limit")
    ap.add_argument("--shard", type=int, default=0)
    ap.add_argument("--num-shards", type=int, default=1)
    ap.add_argument("--out-suffix", default="")
    ap.add_argument("--skip-families", default="",
                     help="comma-separated source_family_id values to skip (known-hung/pathological)")
    ap.add_argument("--only-families", default="",
                     help="comma-separated source_family_id values to process (overrides split selection)")
    args = ap.parse_args()

    split_manifest = json.loads((MANIFESTS / "split_manifest.json").read_text())
    inv = json.loads((REPORTS / "CORPUS_INVENTORY.json").read_text())
    records_by_id = {r["source_family_id"]: r for r in inv["records"]}

    wanted_splits = args.splits.split(",")
    target_groups = []
    for sp in wanted_splits:
        target_groups += split_manifest[sp]
    target_groups = sorted(target_groups)

    if args.num_shards > 1:
        target_groups = [g for i, g in enumerate(target_groups) if i % args.num_shards == args.shard]

    if args.only_families:
        wanted = set(args.only_families.split(","))
        target_groups = [g for g in target_groups if g in wanted]

    if args.skip_families:
        skip = set(args.skip_families.split(","))
        target_groups = [g for g in target_groups if g not in skip]

    if args.limit_families:
        target_groups = target_groups[: args.limit_families]

    root = corpus_root()
    suffix = args.out_suffix or (f".shard{args.shard}" if args.num_shards > 1 else "")
    out_path = REPORTS / f"review_queue{suffix}.jsonl"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    n_families_done = 0
    n_rows_total = 0
    n_cands_total = 0
    n_pairs_total = 0
    family_stats = {}

    with open(out_path, "w") as fh:
        for group_id in target_groups:
            members = split_manifest["group_members"][group_id]
            # representative record: prefer raw volume, else most pages
            member_recs = [records_by_id[m] for m in members if m in records_by_id]
            member_recs.sort(key=lambda r: (r["volume"] != "raw", -r["page_count"]))
            if not member_recs:
                continue
            rep = member_recs[0]
            pdf_path = root / rep["canonical_relative_path"]
            if not pdf_path.exists():
                print(f"WARN missing pdf for {group_id}: {pdf_path}", file=sys.stderr)
                continue
            split_name = next(sp for sp in ("train", "dev", "test") if group_id in split_manifest[sp])
            try:
                result = process_family(group_id, pdf_path)
            except Exception as e:  # noqa: BLE001
                print(f"WARN {group_id} failed: {e}", file=sys.stderr)
                continue
            pairs = build_pairs(result["legend_rows"], result["plan_candidates"])
            for p in pairs:
                p["split"] = split_name
                p["source_pdf_relative_path"] = rep["canonical_relative_path"]
                p["source_pdf_sha256"] = rep["canonical_sha256"]
                fh.write(json.dumps(p) + "\n")
            n_families_done += 1
            n_rows_total += len(result["legend_rows"])
            n_cands_total += len(result["plan_candidates"])
            n_pairs_total += len(pairs)
            family_stats[group_id] = {
                "split": split_name,
                "legend_rows": len(result["legend_rows"]),
                "plan_candidates": len(result["plan_candidates"]),
                "pairs": len(pairs),
            }
            print(f"[{n_families_done}/{len(target_groups)}] {group_id}: "
                  f"{len(result['legend_rows'])} legend rows, "
                  f"{len(result['plan_candidates'])} plan candidates, "
                  f"{len(pairs)} proposal pairs", file=sys.stderr)

    summary = {
        "families_processed": n_families_done,
        "legend_rows_total": n_rows_total,
        "plan_candidates_total": n_cands_total,
        "proposal_pairs_total": n_pairs_total,
        "per_family": family_stats,
    }
    (REPORTS / f"review_queue_summary{suffix}.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps({k: v for k, v in summary.items() if k != "per_family"}, indent=2))
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
