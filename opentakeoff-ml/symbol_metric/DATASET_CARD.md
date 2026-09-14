# Dataset card: HVAC/BAS symbol-metric training set (agent-consensus v1)

**This section is regenerated with real numbers by the review/export
pipeline; do not hand-edit the counts below without re-running
`src/export_dataset.py` and pasting its `reports/EXPORT_SUMMARY.json`
output.** See the end of this file for the actual achieved counts from this
session.

## What this dataset is

Project-local legend/reference-symbol -> physical-plan-symbol association
pairs for training a one-shot retrieval metric model, built from real US
HVAC/BAS construction drawing sets (see `LICENSE_PROVENANCE.md`).

## Evidence tiers

- `existing_human_reviewed`: imported from a pre-existing, independently
  human-reviewed source. **None imported this session** -- the expected
  source (`HVAC BAS Benchmark Collection`, 47 Symbol Sweep identities / 30
  Legend Learn documents / 14 symbol_grounding cases) was not reachable from
  this session; see `TASK_SPEC.md`.
- `agent_consensus_reviewed`: created this session via the three
  independent review passes (structural / visual / drawing-context) defined
  in `CLAUDE-GEMINI-AUTONOMOUS-SYMBOL-MODEL-GOAL.md`, adjudicated, and
  blind-audited on a resampled subset. Never described as human ground
  truth.

## How records were produced

1. `src/inventory.py` hashed and classified every reachable source PDF.
2. `src/freeze_split.py` hash-sealed train/dev/test at the source-family
   level *before* any candidate generation, with >=20 held-out test
   families never touched by tuning.
3. `src/build_review_queue.py` proposed candidate legend rows and
   plan-page physical-body clusters from vector geometry alone (no learned
   model in the loop) -- proposals only, verdict is never trusted from this
   stage.
4. `src/prioritize_queue.py` selected a diversity-first subset for real
   review (breadth across families over exhaustive depth in one family).
5. Three independent review passes were performed per candidate pair
   (structural evidence blind to visual similarity; visual identity blind
   to the structural verdict and in randomized order; drawing-context
   adjudication) and stored before the next pass ran, per record.
6. A blind consistency audit resampled >=10% of accepted positives/hard
   negatives with new IDs and reversed order; 100% re-review was applied to
   test-vault labels, directional symbols, sibling subtypes, no-leader
   cases, and heavily transformed candidates.
7. `src/export_dataset.py` rendered final crops only for adjudicated
   `positive` / `hard_negative` / `easy_negative` verdicts into immutable,
   hashed per-split manifests.

## Splits

Frozen by whole source family (`data/manifests/split_manifest.json`,
hash-sealed in `split_manifest.sha256`). No PDF, split part, revision, or
duplicate-hash sibling crosses a split boundary (`src/validate_dataset.py`
checks this on every export, not just at split-freeze time).

## Known limitations (report honestly, do not paper over)

- The corpus actually reachable this session (123 real PDFs / 117 distinct
  source families after dedup) is far smaller than the goal document's
  expected combined corpus (which assumed access to a separate,
  unreachable `HVAC BAS Benchmark Collection`).
- Candidate proposal is a from-scratch, deterministic vector-clustering
  heuristic (`src/glyph_cluster.py`), not the shared production symbol
  pipeline (this package must not import it). Proposal recall on this
  corpus is measured, not assumed -- see `reports/EXPORT_SUMMARY.json` and
  the evaluation report for the real number.

---

## Achieved counts (this session, filled in after export)

_See `reports/EXPORT_SUMMARY.json` and `reports/FINAL_REPORT.md` for the
exact, reconciled figures reported at the end of this run._
