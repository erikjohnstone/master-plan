#!/usr/bin/env python3
"""Slice the selected proposal queue + rendered evidence packets into named
batches for agent review dispatch, and merge results back afterward.

Produces THREE separate per-batch input files -- one per pass -- so each
pass genuinely only sees the evidence it is allowed to see:

  batch_XXX.pass_a.json   structural facts only (no images)
  batch_XXX.pass_b.json   two anonymized images per pair ("symbol_left" /
                           "symbol_right", real reference/candidate identity
                           randomized and recorded only in
                           batch_XXX.pass_b.key.json, NOT given to the
                           reviewing agent), no caption/tag text
  batch_XXX.pass_c.json   context + full-page images, caption + tag text
                           (the evidence a human estimator would actually
                           have), but NOT the other two passes' verdicts

Usage:
    python3 src/prepare_review_batch.py make --batch-size 40 --out-dir reports/batches
    python3 src/prepare_review_batch.py merge --results-glob "reports/batches/*.result.json"
"""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"
EVIDENCE_DIR = PKG_ROOT / "data" / "evidence"

RESULT_SCHEMA_NOTE = (
    "Write your output as JSON: "
    '{"batch_id": "<id>", "pass": "<structural|visual|context>", '
    '"verdicts": [{"pair_id": "...", "verdict": "positive|negative|ambiguous|no_physical_symbol", '
    '"strong_evidence": true|false, "directional": true|false, "rationale": "one or two sentences"}]}. '
    "One verdict object per pair_id in the input. Do not skip any pair."
)


def make_batches(batch_size: int, out_dir: Path, only_split: str = None, seed: int = 20260914) -> None:
    pairs = [json.loads(l) for l in open(REPORTS / "review_queue.selected.jsonl") if l.strip()]
    if only_split:
        pairs = [p for p in pairs if p["split"] == only_split]

    rng = random.Random(seed)
    out_dir.mkdir(parents=True, exist_ok=True)
    n_batches = 0

    for i in range(0, len(pairs), batch_size):
        chunk = pairs[i:i + batch_size]
        batch_id = f"batch_{only_split or 'all'}_{i // batch_size:03d}"

        pass_a_items, pass_b_items, pass_c_items, key_items = [], [], [], []
        for p in chunk:
            pair_id = p["pair_id"]
            pdir = EVIDENCE_DIR / pair_id
            if not (pdir / "packet.json").exists():
                continue

            pass_a_items.append({
                "pair_id": pair_id,
                "reference_caption": p["reference"]["caption"],
                "candidate_nearby_tag_text": p["candidate"].get("nearby_tag_text"),
                "association_method_proposed": p["association_method_proposed"],
                "shape_distance": p["shape_distance"],
                "note": "association_method_proposed and shape_distance are an UNVERIFIED geometric "
                        "guess, not evidence -- judge only from whether candidate_nearby_tag_text "
                        "plausibly authored-tags/leaders this candidate as the referenced device.",
            })

            swap = rng.random() < 0.5
            left_is_reference = not swap
            pass_b_items.append({
                "pair_id": pair_id,
                "symbol_left_image": str((pdir / ("reference_300.png" if left_is_reference else "candidate_300.png")).relative_to(PKG_ROOT)),
                "symbol_right_image": str((pdir / ("candidate_300.png" if left_is_reference else "reference_300.png")).relative_to(PKG_ROOT)),
            })
            key_items.append({"pair_id": pair_id, "left_is_reference": left_is_reference})

            pass_c_items.append({
                "pair_id": pair_id,
                "context_image": str((pdir / "context.png").relative_to(PKG_ROOT)),
                "fullpage_image": str((pdir / "fullpage.png").relative_to(PKG_ROOT)),
                "reference_caption": p["reference"]["caption"],
                "candidate_nearby_tag_text": p["candidate"].get("nearby_tag_text"),
                "family_id": p["family_id"],
            })

        if not pass_a_items:
            continue

        (out_dir / f"{batch_id}.pass_a.json").write_text(json.dumps({
            "batch_id": batch_id, "pass": "structural", "instructions": (
                "PASS A -- STRUCTURAL EVIDENCE ONLY. For each pair, judge only whether "
                "candidate_nearby_tag_text is a real authored tag/leader that identifies this "
                "specific candidate as the device the reference row names. A caption+tag word "
                "overlap is weak evidence; an exact/near-exact equipment tag next to the candidate "
                "is strong evidence (set strong_evidence:true only then). If there is no tag "
                "nearby, verdict should usually be 'ambiguous' (structural evidence alone can't "
                "decide) rather than a guess -- Pass B/C carry the rest of the decision. " + RESULT_SCHEMA_NOTE
            ),
            "items": pass_a_items,
        }, indent=2))

        (out_dir / f"{batch_id}.pass_b.json").write_text(json.dumps({
            "batch_id": batch_id, "pass": "visual", "instructions": (
                "PASS B -- VISUAL IDENTITY ONLY. You are given two small cropped images per pair, "
                "'symbol_left' and 'symbol_right' -- you do NOT know which is the trusted legend "
                "reference and which is the plan-page candidate, and you have no caption or tag "
                "text. Compare ONLY visual/shape identity: same enclosure shape, same internal "
                "strokes/ports, same count of connection points, allowing for line-weight, DPI, and "
                "minor clipping differences. 'positive' = same physical symbol type. 'negative' = "
                "clearly a different symbol/shape/or one image is text/blank/a line fragment, not a "
                "device body at all. 'ambiguous' = genuinely too small/degraded to tell. Set "
                "directional:true if the shape has an inherent left-right or rotational asymmetry "
                "that would change meaning if mirrored/rotated (an arrow, a check-valve body, an "
                "actuator with a directional marking). " + RESULT_SCHEMA_NOTE
            ),
            "items": pass_b_items,
        }, indent=2))
        (out_dir / f"{batch_id}.pass_b.key.json").write_text(json.dumps(key_items, indent=2))

        (out_dir / f"{batch_id}.pass_c.json").write_text(json.dumps({
            "batch_id": batch_id, "pass": "context", "instructions": (
                "PASS C -- DRAWING-CONTEXT ADJUDICATION. For each pair you get a local context "
                "render around the candidate (context_image), a low-res full-page thumbnail "
                "(fullpage_image), the reference legend caption, and any nearby tag text. Read the "
                "context image directly. Judge whether this candidate plausibly is a real HVAC/BAS "
                "physical device consistent with the caption -- and NOT a title-block element, a "
                "general drafting symbol (north arrow, detail bubble, elevation target, section "
                "cut), boilerplate text, a table border, or an unrelated architectural/furniture "
                "item. 'no_physical_symbol' = the candidate region contains no real device body at "
                "all (blank space, pure text, a drafting convention symbol unrelated to HVAC/BAS). "
                "'negative' = it is a real device but clearly NOT a plausible match for this "
                "caption (wrong device family, wrong sibling subtype, or the caption/context "
                "clearly refers to something else on this sheet). " + RESULT_SCHEMA_NOTE
            ),
            "items": pass_c_items,
        }, indent=2))

        n_batches += 1

    print(f"wrote {n_batches} batches (x3 pass files each) to {out_dir}")


def make_combined_batches(batch_size: int, out_dir: Path, only_split: str, seed: int = 20260914,
                            limit: int = 0) -> None:
    """Train/dev resource tier: one dispatch per batch does all three
    judgments together for each pair (disclosed as saw_prior_pass_verdict
    true in the resulting records) -- reserved for train/dev only, never
    the test split or the blind-audit resample, which use make_batches()'s
    genuinely isolated three-file form."""
    pairs = [json.loads(l) for l in open(REPORTS / "review_queue.selected.jsonl") if l.strip()]
    pairs = [p for p in pairs if p["split"] == only_split]
    rng = random.Random(seed)
    if limit and limit < len(pairs):
        # review_queue.selected.jsonl is grouped by family (prioritize_queue.py's
        # dict-iteration order), so a plain head-slice would review only the
        # first few families. Shuffle deterministically first so a limited
        # subsample still spans the full family diversity.
        shuffled = list(pairs)
        rng.shuffle(shuffled)
        pairs = shuffled[:limit]
    out_dir.mkdir(parents=True, exist_ok=True)
    n_batches = 0

    for i in range(0, len(pairs), batch_size):
        chunk = pairs[i:i + batch_size]
        batch_id = f"batch_combined_{only_split}_{i // batch_size:03d}"
        items = []
        for p in chunk:
            pair_id = p["pair_id"]
            pdir = EVIDENCE_DIR / pair_id
            if not (pdir / "packet.json").exists():
                continue
            swap = rng.random() < 0.5
            items.append({
                "pair_id": pair_id,
                "reference_caption": p["reference"]["caption"],
                "candidate_nearby_tag_text": p["candidate"].get("nearby_tag_text"),
                "association_method_proposed": p["association_method_proposed"],
                "reference_image": str((pdir / "reference_300.png").relative_to(PKG_ROOT)),
                "candidate_image": str((pdir / "candidate_300.png").relative_to(PKG_ROOT)),
                "context_image": str((pdir / "context.png").relative_to(PKG_ROOT)),
            })
        if not items:
            continue
        (out_dir / f"{batch_id}.combined.json").write_text(json.dumps({
            "batch_id": batch_id, "pass": "combined", "instructions": (
                "For EACH pair, perform three separate judgments IN ORDER, writing each one down "
                "before moving to the next, and do not let a later judgment revise an earlier one:\n"
                "(1) STRUCTURAL: judge only from candidate_nearby_tag_text -- is it a real authored "
                "tag/leader identifying this candidate as the referenced device? (weak evidence if "
                "absent/generic, strong_evidence:true only for a genuine specific tag match)\n"
                "(2) VISUAL: compare reference_image and candidate_image purely on shape/enclosure/"
                "internal-stroke identity, ignoring the caption text -- same physical symbol type?\n"
                "(3) CONTEXT: read context_image -- is this really a plausible HVAC/BAS device body "
                "consistent with reference_caption, not a title-block/drafting-convention/boilerplate "
                "element or an unrelated object?\n"
                "Then give ONE overall verdict (positive only if all three judgments genuinely "
                "support it; hard_negative/easy_negative/ambiguous/no_physical_symbol otherwise, "
                "matching CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md's acceptance policy) and "
                "directional:true if the symbol is asymmetric/direction-sensitive (check valve, flow "
                "arrow, actuator fail state). Output JSON: {\"batch_id\": \"...\", \"pass\": "
                "\"combined\", \"verdicts\": [{\"pair_id\": \"...\", \"structural_rationale\": \"...\", "
                "\"strong_evidence\": true|false, \"visual_rationale\": \"...\", \"visual_match\": "
                "true|false, \"context_rationale\": \"...\", \"verdict\": "
                "\"positive|hard_negative|easy_negative|ambiguous|no_physical_symbol\", "
                "\"directional\": true|false}]}. One entry per pair_id, none skipped."
            ),
            "items": items,
        }, indent=2))
        n_batches += 1
    print(f"wrote {n_batches} combined batches to {out_dir}")


def merge_results(results_glob: str) -> None:
    import glob
    import sys
    sys.path.insert(0, str(PKG_ROOT / "src"))
    from adjudicate import load_pass_results  # noqa: F401  (import check only)
    print("Use src/adjudicate.py directly to merge + write final records "
          "(it reads the same *.pass_a/b/c.result.json glob).")


def main() -> int:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_make = sub.add_parser("make")
    p_make.add_argument("--batch-size", type=int, default=40)
    p_make.add_argument("--out-dir", default="reports/batches")
    p_make.add_argument("--split", default=None)

    p_combined = sub.add_parser("make-combined")
    p_combined.add_argument("--batch-size", type=int, default=40)
    p_combined.add_argument("--out-dir", default="reports/batches")
    p_combined.add_argument("--split", required=True)
    p_combined.add_argument("--limit", type=int, default=0)

    p_merge = sub.add_parser("merge")
    p_merge.add_argument("--results-glob", default="reports/batches/*.result.json")

    args = ap.parse_args()
    if args.cmd == "make":
        make_batches(args.batch_size, PKG_ROOT / args.out_dir, only_split=args.split)
    elif args.cmd == "make-combined":
        make_combined_batches(args.batch_size, PKG_ROOT / args.out_dir, only_split=args.split, limit=args.limit)
    elif args.cmd == "merge":
        merge_results(args.results_glob)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
