# Completed goal: deterministic corpus accuracy

Completed on 2026-08-29 at commit `2cd532b`.

## Durable objective

Keep the deterministic, non-LLM HVAC/BAS pipeline correct as the corpus grows.
Every added set must remain queryable through the production API for arbitrary
extracted table cells and complete project takeoffs. Answers must include source
locations, and structurally unavailable evidence must produce an explicit,
typed refusal rather than a fabricated quantity.

The full history, methodology, known ceilings, and per-set evidence remain in
[`../GOAL.md`](../GOAL.md). Verified implementation history remains in
[`../PROGRESS.md`](../PROGRESS.md).

## Preserved completion gate

The completion baseline was:

- takeoff outcomes: 541/541 exact
- applicable installed rows: 499/499 exact
- expected honest refusals: 14/14 correct
- intentional raster-unavailable rows: 28/28 correct
- quantity delta, missing rows, and false additions: zero
- reference cells: 129/129 exact
- graph cells: 91/91 exact
- graph row-symbol outcomes: 138/138 exact

Run the reusable forced-cold gate from `opentakeoff/mcp`:

```bash
OPENTAKEOFF_EVAL_NO_CACHE=1 npm run eval:corpus -- ../../opentakeoff-corpus
```

Every future corpus expansion must report takeoff, applicable installed rows,
honest refusals, intentional unavailable rows, quantity delta, missing rows,
false additions, reference cells, graph cells, and row-symbol outcomes
together. Do not weaken keys, tolerances, refusal semantics, or production
search behavior to preserve a score.
