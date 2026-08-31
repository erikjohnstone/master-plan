# Volume 2 intake rubric — HVAC/BAS Plan Sets Vol2

**Source:** Google Drive archive `HVAC_BAS_Plan_Sets_Vol2` (82 verified vector
sets · HVAC **and** BAS/controls proven · no Vol1 repeats).  
**On disk:** `opentakeoff-corpus/bulk/HVAC_BAS_Plan_Sets_Vol2/` (gitignored,
same as Vol1 bulk). INDEX: `INDEX.md` / `INDEX.csv`.  
**Authority:** `GOAL.md` §8 · `NEXT_GOAL_LOOP.md` Pillar A — corpus is a
*ruler*, not a score farm.

## Scope (full volume)

**All 82 INDEX sets are in-scope** for Pillar A stress and set-agnostic
compile/BAS deepen. That is the product goal — not a pilot sample.

| Delivery (INDEX) | Count | How we use it |
|---|---:|---|
| Single file | 69 | Probe / key / fix directly |
| Split multipart folders | 13 | In-scope; rejoin via `REJOIN_full_sets.sh` / originals when whole-set compile is needed |

Batching (probe → key → shared-path fix → negatives) is **operational
cadence only**. It does **not** shrink scope to “first 5–10.” Prefer
diverse geo/building types early so title/`keyRe`/BAS gaps generalize
faster, then continue until the volume is covered or remaining ceilings
are documented with honest ZERO/WEAK evidence.

## Rules (set-agnostic only)

1. **Entire Vol2 is in goal scope** (see `GOAL.md` §8). Do not treat
   unkeyed sets as out of scope.
2. Prefer single-file deliveries first for speed; do not skip multipart
   sets permanently — rejoin when they block coverage.
3. **Honest ZERO/WEAK** is correct when no extractable HVAC schedule
   tables (or BAS points lists) exist — lock `0` / WEAK, do not inflate.
4. **Fixes must be shared-path** (`corpusTakeoff` / `Session` / reconcile)
   — no Vol2 hardcodes, no per-set IDs in product code.
5. After each batch: focused compile + reconcile probes, negatives on
   existing MEAT locks, update `PROGRESS.md`.
6. Keys land under `takeoffs/cross-set-compile/` only after verified
   compile totals.

## Batch 1 (started — not a scope cap)

Chosen for diversity among INDEX `single file` deliveries (see probe log).
Continue through remaining single-file sets, then multipart rejoins, until
Vol2 coverage is complete or ceilings are documented.
