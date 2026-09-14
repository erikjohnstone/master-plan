# Final report template

_Filled in at the end of the run with real numbers pulled from
CORPUS_INVENTORY.json, split_manifest.json, the reviewed-records ledger,
EXPORT_SUMMARY.json, and (if RunPod ran) evaluation.json. Never round a
number to hit a target._

1. Corpus: reachable vs. expected (goal doc paths vs. actual)
2. Split: train/dev/test family counts, test diversity
3. Review: pairs proposed -> selected -> reviewed -> verdict breakdown, by tier
4. Blind audit: resample agreement rate, 100%-re-review coverage
5. Export: final train/dev/test record + identity counts
6. Local smoke test: pass/fail per stage
7. RunPod: ran? runtime, cost, per-contender/seed results
8. Eligibility gate outcome per contender
9. Release decision: eligible / experimental-only / no-model-winner
10. Git SHA, branch, worktree path
11. Known limitations and honest gaps
