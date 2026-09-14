#!/usr/bin/env python3
"""Merge three independent pass results (structural / visual / context) per
pair and apply the goal doc's acceptance policy, producing final
reviewed_pair.schema.json records via record_review.build_record.

Acceptance policy (verbatim intent from CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md):
  - all three passes agree "positive" -> positive
  - OR: pass_a found strong structural evidence (authored tag/leader or a
    uniquely owned equipment envelope) AND pass_b agrees AND no topology/
    direction contradiction from any pass -> positive
  - explicit negative from any pass citing tag/blank/leader/partial-body/
    wrong-sibling/unrelated-object/topology-contradiction -> hard_negative
    (if the rejection reason is a *plausible-looking* near-miss) or
    easy_negative (if trivially unrelated: blank space, obviously different
    object class)
  - otherwise (real disagreement, no clean resolution) -> ambiguous,
    excluded from positive training, never silently dropped from the ledger
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"

sys.path.insert(0, str(PKG_ROOT / "src"))
from record_review import append_record, build_record, record_id_for, now_iso  # noqa: E402


def load_pass_results(glob_pattern: str) -> dict:
    """pair_id -> {"structural": {...}, "visual": {...}, "context": {...}}"""
    merged: dict = {}
    for fpath in sorted(glob.glob(str(PKG_ROOT / glob_pattern))):
        data = json.loads(Path(fpath).read_text())
        pass_name = data["pass"]
        for v in data["verdicts"]:
            merged.setdefault(v["pair_id"], {})[pass_name] = v
    return merged


def load_packets() -> dict:
    packets = {}
    evidence_dir = PKG_ROOT / "data" / "evidence"
    for pdir in evidence_dir.glob("*/packet.json"):
        p = json.loads(pdir.read_text())
        packets[p["pair_id"]] = p
    return packets


NEGATIVE_EASY_HINTS = ("blank", "empty", "no symbol", "unrelated object", "different device family",
                        "text only", "tag only", "boilerplate", "title block", "north arrow",
                        "detail frame", "drafting symbol")
NEGATIVE_HARD_HINTS = ("sibling", "wrong port", "wrong topology", "partial", "leader", "carrier",
                        "similar but", "near miss", "direction")


def classify_negative(rationales: list) -> str:
    text = " ".join(r.lower() for r in rationales if r)
    if any(h in text for h in NEGATIVE_EASY_HINTS):
        return "easy_negative"
    return "hard_negative"


def adjudicate_pair(pair_id: str, passes: dict, packet: dict) -> dict:
    a = passes.get("structural")
    b = passes.get("visual")
    c = passes.get("context")
    if not (a and b and c):
        return None  # incomplete -- not all three passes ran for this pair

    verdicts = [a["verdict"], b["verdict"], c["verdict"]]
    rationales = [a.get("rationale", ""), b.get("rationale", ""), c.get("rationale", "")]

    all_positive = all(v == "positive" for v in verdicts)
    strong_structural = a["verdict"] == "positive" and a.get("strong_evidence") is True
    no_contradiction = not any("contradict" in r.lower() or "wrong topology" in r.lower()
                                 or "wrong port" in r.lower() for r in rationales)

    if all_positive:
        verdict = "positive"
        assoc = packet["association_method_proposed"]
        rationale = "All three independent passes (structural/visual/context) identified the same physical body."
    elif strong_structural and b["verdict"] == "positive" and no_contradiction:
        verdict = "positive"
        assoc = "authored_leader"
        rationale = ("Strong structural evidence (authored tag/leader or uniquely owned envelope) "
                     "confirmed by an independent visual match, no topology/direction contradiction.")
    elif any(v == "negative" for v in verdicts):
        neg_class = classify_negative(rationales)
        verdict = neg_class
        assoc = "none"
        rationale = f"At least one independent pass rejected the proposal: {' | '.join(rationales)[:400]}"
    elif any(v == "no_physical_symbol" for v in verdicts):
        verdict = "no_physical_symbol"
        assoc = "none"
        rationale = f"A pass found no physical symbol present: {' | '.join(rationales)[:400]}"
    else:
        verdict = "ambiguous"
        assoc = "none"
        rationale = (f"Passes disagreed without a clean resolution (structural={a['verdict']}, "
                      f"visual={b['verdict']}, context={c['verdict']}); excluded from training per "
                      f"the goal doc's abstention policy.")

    directional = bool(c.get("directional") or b.get("directional") or a.get("directional"))
    allowed_transforms = "none" if directional else "dihedral"

    return {
        "verdict": verdict,
        "association_method": assoc,
        "directional": directional,
        "allowed_transforms": allowed_transforms,
        "final_rationale": rationale,
        "pass_a": {
            "verdict": a["verdict"] if a["verdict"] in ("positive", "negative", "ambiguous", "no_physical_symbol") else "ambiguous",
            "rationale": a.get("rationale", ""), "reviewer": a.get("reviewer", "claude-pass-a"),
            "reviewed_at": a.get("reviewed_at", now_iso()), "order_randomized": False,
            "saw_prior_pass_verdict": False,
        },
        "pass_b": {
            "verdict": b["verdict"] if b["verdict"] in ("positive", "negative", "ambiguous", "no_physical_symbol") else "ambiguous",
            "rationale": b.get("rationale", ""), "reviewer": b.get("reviewer", "claude-pass-b"),
            "reviewed_at": b.get("reviewed_at", now_iso()), "order_randomized": True,
            "saw_prior_pass_verdict": False,
        },
        "pass_c": {
            "verdict": c["verdict"] if c["verdict"] in ("positive", "negative", "ambiguous", "no_physical_symbol") else "ambiguous",
            "rationale": c.get("rationale", ""), "reviewer": c.get("reviewer", "claude-pass-c"),
            "reviewed_at": c.get("reviewed_at", now_iso()), "order_randomized": False,
            "saw_prior_pass_verdict": False,
        },
    }


_VERDICT_PRIORITY = {
    "positive": 0, "hard_negative": 1, "easy_negative": 2, "ambiguous": 3, "no_physical_symbol": 4,
}


def _dedupe_by_pair_id(all_verdicts: list) -> list:
    """The same pair_id can legitimately appear more than once across
    batches/items (prioritize_queue.py can select the same legend-row x
    candidate pair from more than one shard, and a reviewing agent can reach
    a different verdict on the two independent look-ins). Picking whichever
    happened to be appended to the ledger first silently discards a real
    'positive' finding whenever a duplicate's other occurrence was reviewed
    (correctly or not) as something weaker -- so pick the most informative
    verdict deterministically instead of by write order."""
    best: dict = {}
    for v in all_verdicts:
        pid = v["pair_id"]
        cur = best.get(pid)
        if cur is None or _VERDICT_PRIORITY.get(v["verdict"], 9) < _VERDICT_PRIORITY.get(cur["verdict"], 9):
            best[pid] = v
    return list(best.values())


def adjudicate_combined_batches(glob_pattern: str, evidence_tier: str) -> dict:
    """Merge the train/dev combined-review tier: one verdict object per pair
    already carries all three judgments (saw_prior_pass_verdict=True, honestly
    recorded -- see schemas/reviewed_pair.schema.json)."""
    packets = load_packets()
    counts = {"positive": 0, "hard_negative": 0, "easy_negative": 0, "ambiguous": 0,
              "no_physical_symbol": 0}
    ts = now_iso()

    all_verdicts = []
    for fpath in sorted(glob.glob(str(PKG_ROOT / glob_pattern))):
        data = json.loads(Path(fpath).read_text())
        all_verdicts.extend(data["verdicts"])

    for v in _dedupe_by_pair_id(all_verdicts):
            pair_id = v["pair_id"]
            packet = packets.get(pair_id)
            if packet is None:
                continue
            verdict = v["verdict"]
            if verdict not in ("positive", "hard_negative", "easy_negative", "ambiguous", "no_physical_symbol"):
                verdict = "ambiguous"
            directional = bool(v.get("directional"))
            allowed_transforms = "none" if directional else "dihedral"
            assoc = packet["association_method_proposed"] if verdict == "positive" else "none"

            shared_pass = {
                "reviewer": "claude-combined", "reviewed_at": ts,
                "order_randomized": False, "saw_prior_pass_verdict": True,
            }
            pass_a = {"verdict": "positive" if v.get("strong_evidence") else "ambiguous",
                       "rationale": v.get("structural_rationale", ""), **shared_pass}
            pass_b = {"verdict": "positive" if v.get("visual_match") else "negative",
                       "rationale": v.get("visual_rationale", ""), **shared_pass}
            pass_c = {"verdict": verdict if verdict in ("positive", "negative", "ambiguous", "no_physical_symbol") else "negative",
                       "rationale": v.get("context_rationale", ""), **shared_pass}

            family_id = packet["family_id"]
            symbol_identity_id = f"{family_id}::{packet['reference']['row_id']}"
            record = build_record(
                pair_id=pair_id, packet=packet, evidence_tier=evidence_tier,
                verdict=verdict, symbol_identity_id=symbol_identity_id,
                directional=directional, allowed_transforms=allowed_transforms,
                association_method=assoc,
                pass_a=pass_a, pass_b=pass_b, pass_c=pass_c,
                final_rationale=(f"Combined-tier review (train/dev resource tier, not fully "
                                   f"call-isolated -- see schema note): {v.get('context_rationale', '')[:300]}"),
            )
            try:
                append_record(record)
                counts[verdict] = counts.get(verdict, 0) + 1
            except ValueError as e:
                print(f"WARN {pair_id}: {e}", file=sys.stderr)
    return counts


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pass-results-glob", default="reports/batches/*.pass*.json")
    ap.add_argument("--combined-results-glob", default=None)
    ap.add_argument("--evidence-tier", default="agent_consensus_reviewed")
    args = ap.parse_args()

    if args.combined_results_glob:
        counts = adjudicate_combined_batches(args.combined_results_glob, args.evidence_tier)
        print(json.dumps(counts, indent=2))
        return 0

    merged = load_pass_results(args.pass_results_glob)
    packets = load_packets()

    counts = {"positive": 0, "hard_negative": 0, "easy_negative": 0, "ambiguous": 0,
              "no_physical_symbol": 0, "incomplete": 0}

    for pair_id, passes in merged.items():
        packet = packets.get(pair_id)
        if packet is None:
            continue
        adj = adjudicate_pair(pair_id, passes, packet)
        if adj is None:
            counts["incomplete"] += 1
            continue

        family_id = packet["family_id"]
        ref_row_id = packet["reference"]["row_id"]
        symbol_identity_id = f"{family_id}::{ref_row_id}"

        record = build_record(
            pair_id=pair_id,
            packet=packet,
            evidence_tier=args.evidence_tier,
            verdict=adj["verdict"],
            symbol_identity_id=symbol_identity_id,
            directional=adj["directional"],
            allowed_transforms=adj["allowed_transforms"],
            association_method=adj["association_method"],
            pass_a=adj["pass_a"], pass_b=adj["pass_b"], pass_c=adj["pass_c"],
            final_rationale=adj["final_rationale"],
        )
        try:
            append_record(record)
            counts[adj["verdict"]] = counts.get(adj["verdict"], 0) + 1
        except ValueError as e:
            print(f"WARN {pair_id}: {e}", file=sys.stderr)

    print(json.dumps(counts, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
