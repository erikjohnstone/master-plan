"""Corpus root resolution shared by every script in this package.

The gitignored bulk PDF archive (opentakeoff-corpus/bulk/) is staged in the
main repo checkout, not inside this isolated worktree (git worktrees do not
share gitignored files). Every script resolves the real corpus root through
this module instead of assuming its own worktree layout, so the same code
runs unmodified in a future session/worktree where the bulk archive lives
alongside the package.
"""
from __future__ import annotations

import os
from pathlib import Path

ENV_VAR = "OPENTAKEOFF_CORPUS_ROOT"

_CANDIDATES = [
    # Explicit override.
    lambda: os.environ.get(ENV_VAR),
    # Sibling to this worktree's own opentakeoff-corpus (normal layout).
    lambda: str(Path(__file__).resolve().parents[3] / "opentakeoff-corpus"),
    # This session's main checkout, where the gitignored bulk/ archive was
    # actually staged (see TASK_SPEC.md).
    lambda: "/home/user/master-plan/opentakeoff-corpus",
]


def corpus_root() -> Path:
    valid = []
    for candidate_fn in _CANDIDATES:
        candidate = candidate_fn()
        if not candidate:
            continue
        p = Path(candidate)
        if p.is_dir() and (p / "sets.json").exists():
            valid.append(p.resolve())
    if valid:
        # Prefer whichever valid candidate actually has the (gitignored,
        # per-checkout) bulk/ archive staged, since that is the materially
        # larger and more complete corpus; fall back to the first valid one.
        for p in valid:
            if (p / "bulk" / "HVAC_BAS_Plan_Sets").is_dir():
                return p
        return valid[0]
    raise FileNotFoundError(
        "Could not locate opentakeoff-corpus/ (looked for sets.json under "
        f"${ENV_VAR}, the worktree sibling, and the main checkout). "
        f"Set {ENV_VAR} explicitly."
    )


def raw_dir() -> Path:
    return corpus_root() / "raw"


def bulk_vol1_dir() -> Path:
    return corpus_root() / "bulk" / "HVAC_BAS_Plan_Sets"


def bulk_vol2_dir() -> Path:
    return corpus_root() / "bulk" / "HVAC_BAS_Plan_Sets_Vol2"


def ground_truth_dir() -> Path:
    return corpus_root() / "ground_truth"
