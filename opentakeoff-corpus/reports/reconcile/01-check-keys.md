# Reconcile keys (check side): how they were made

The eight check documents of the draw (`01-split.md`) were keyed the way the dev keys were (`01-key-adjudication.md`,
whose policies bind them):
- One agent per document authored `plansheets.csv` and `plantags.csv` from its renders and text layer, never from
  pipeline output.
- A second, independent agent re-read the drawings and reported only evidenced disagreements.
- An adjudication step decided each disagreement from the drawings.

The coordinator saw only the counts below: no row, placement, sheet or score of a check document. The check side is
scored in aggregate only (`scripts/reconcile-eval.mjs --check`), and no rule is taken from it.

| | total over the 8 documents |
|---|---:|
| plan sheets / examined | 233 / 230 |
| key rows | 732 |
| scheduled units keyed | 288 |
| drawn on an examined plan sheet / drawn nowhere | 230 / 58 |
| rows for unscheduled units | 72 |
| entries the keyer marked uncertain (each decided) | 50 |
| verify disagreements / accepted | 1 / 1 (one row changed) |

The verifiers found fewer disagreements here than on the dev side (1 over 8 documents, against 22 over 12). The
keys are committed before any reconcile run is scored against them, and a key that looks wrong later is catalogued,
never edited.
