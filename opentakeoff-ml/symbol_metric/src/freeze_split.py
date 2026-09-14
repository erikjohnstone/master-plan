#!/usr/bin/env python3
"""Freeze train/development/test by whole source family, before any labeling.

Per the goal doc's "Freeze the split before labeling" section:
  1. Hash every PDF.                                   (done: inventory.py)
  2. Group split PDFs, revisions, duplicates, derivatives into one
     source_family_id.
  3. Freeze train/dev/test by whole source family before generating labels.
  4. Reserve >=20 diverse source families as a test vault.
  5. Never expose test projects to model selection, threshold tuning,
     pseudo-labeling, hard-negative mining from model outputs, or training.
  6. Write a hash-sealed test manifest and do not modify it once frozen.

This script is idempotent and re-running it after the manifest exists is a
no-op that verifies the existing assignment still matches the current
inventory (a changed corpus after freezing is a hard error, not a silent
reshuffle).
"""
from __future__ import annotations

import hashlib
import json
import random
import re
import sys
from pathlib import Path

PKG_ROOT = Path(__file__).resolve().parents[1]
REPORTS = PKG_ROOT / "reports"
MANIFESTS = PKG_ROOT / "data" / "manifests"
SPLIT_SEED = 20260914  # frozen; never change once a split manifest exists

# Known duplicate-content-hash groups from CORPUS_INVENTORY.json, plus one
# hand-derived lineage (a synthetic raster flatten of a real vector source)
# that is NOT byte-identical so the hash-based dedup can't catch it alone.
MANUAL_LINEAGE_EXTRA = {
    "raw:itd-d1-lab-mechanical": ["raw:itd-d1-lab-raster"],
}

STATE_RE = re.compile(r"^(?:D_)?\d{2,3}_([A-Z]{2})_")


def family_group_key(inv_json: dict) -> dict:
    """Map every source_family_id -> a canonical group id, collapsing
    duplicate-hash groups and the manual lineage extras into one group."""
    parent = {}

    def find(x):
        while parent.get(x, x) != x:
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    ids = [r["source_family_id"] for r in inv_json["records"]]
    for i in ids:
        parent.setdefault(i, i)

    for _h, group in inv_json["duplicate_content_hash_groups"].items():
        for a, b in zip(group, group[1:]):
            union(a, b)
    for a, extras in MANUAL_LINEAGE_EXTRA.items():
        for b in extras:
            if a in parent and b in parent:
                union(a, b)

    return {i: find(i) for i in ids}


def state_of(family_id: str) -> str:
    stem = family_id.split(":", 1)[-1]
    m = STATE_RE.match(stem)
    return m.group(1) if m else "XX"


def main() -> int:
    inv_path = REPORTS / "CORPUS_INVENTORY.json"
    if not inv_path.exists():
        print("run src/inventory.py first", file=sys.stderr)
        return 1
    inv = json.loads(inv_path.read_text())
    records = {r["source_family_id"]: r for r in inv["records"] if not r.get("error")}

    groups_of = family_group_key(inv)
    canonical_members: dict = {}
    for fam_id, group_id in groups_of.items():
        canonical_members.setdefault(group_id, []).append(fam_id)

    # One representative record per group (prefer the raw/ copy when present,
    # since it carries the richer sets.json provenance note; else the one
    # with the most pages).
    group_repr = {}
    for group_id, members in canonical_members.items():
        member_recs = [records[m] for m in members if m in records]
        if not member_recs:
            continue
        member_recs.sort(key=lambda r: (r["volume"] != "raw", -r["page_count"]))
        group_repr[group_id] = member_recs[0]

    group_ids = sorted(group_repr.keys())
    n = len(group_ids)

    MANIFESTS.mkdir(parents=True, exist_ok=True)
    manifest_path = MANIFESTS / "split_manifest.json"

    if manifest_path.exists():
        existing = json.loads(manifest_path.read_text())
        existing_groups = set(existing["train"]) | set(existing["dev"]) | set(existing["test"])
        current_groups = set(group_ids)
        if existing_groups != current_groups:
            missing = existing_groups - current_groups
            new = current_groups - existing_groups
            print("FATAL: corpus changed since split was frozen.", file=sys.stderr)
            print(f"  missing from current inventory: {sorted(missing)}", file=sys.stderr)
            print(f"  new since freeze: {sorted(new)}", file=sys.stderr)
            print("A frozen split manifest must not be silently regenerated.", file=sys.stderr)
            return 2
        print(f"split_manifest.json already frozen and consistent with current inventory "
              f"({len(existing['train'])} train / {len(existing['dev'])} dev / {len(existing['test'])} test groups).")
        return 0

    # Stratify lightly by state code so the test vault isn't accidentally
    # one region's drafting convention; reserve the state-diverse tail for
    # test.
    by_state: dict = {}
    for gid in group_ids:
        st = state_of(group_repr[gid]["source_family_id"])
        by_state.setdefault(st, []).append(gid)

    rng = random.Random(SPLIT_SEED)
    for st in by_state:
        rng.shuffle(by_state[st])

    states_sorted = sorted(by_state.keys(), key=lambda s: -len(by_state[s]))

    test_target = max(20, round(n * 0.17))
    dev_target = round(n * 0.15)

    test_ids: list = []
    dev_ids: list = []
    train_ids: list = []

    # Round-robin across states so test/dev pull from as many distinct
    # states/firms as the corpus actually has, rather than draining one
    # state's whole bucket first.
    pools = {st: list(ids) for st, ids in by_state.items()}
    order = list(states_sorted)
    idx = 0
    while len(test_ids) < test_target and any(pools.values()):
        st = order[idx % len(order)]
        idx += 1
        if pools.get(st):
            test_ids.append(pools[st].pop())
    idx = 0
    while len(dev_ids) < dev_target and any(pools.values()):
        st = order[idx % len(order)]
        idx += 1
        if pools.get(st):
            dev_ids.append(pools[st].pop())
    for st in order:
        train_ids.extend(pools.get(st, []))

    assert set(test_ids) | set(dev_ids) | set(train_ids) == set(group_ids)
    assert not (set(test_ids) & set(dev_ids) & set(train_ids))
    assert not (set(test_ids) & set(dev_ids))
    assert not (set(test_ids) & set(train_ids))
    assert not (set(dev_ids) & set(train_ids))

    manifest = {
        "schema": "opentakeoff.symbol_metric.split_manifest.v1",
        "seed": SPLIT_SEED,
        "frozen_at": "generation-time; see git commit for the actual freeze timestamp",
        "n_groups_total": n,
        "group_members": canonical_members,  # group_id -> [source_family_id, ...]
        "train": sorted(train_ids),
        "dev": sorted(dev_ids),
        "test": sorted(test_ids),
        "test_state_diversity": sorted({state_of(group_repr[g]["source_family_id"]) for g in test_ids}),
        "dev_state_diversity": sorted({state_of(group_repr[g]["source_family_id"]) for g in dev_ids}),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))

    # Hash-seal.
    h = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
    (MANIFESTS / "split_manifest.sha256").write_text(f"{h}  split_manifest.json\n")

    print(f"FROZEN split: {len(train_ids)} train / {len(dev_ids)} dev / {len(test_ids)} test "
          f"groups out of {n} total.")
    print(f"test state diversity: {manifest['test_state_diversity']}")
    print(f"sha256: {h}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
