# Reconcile eval — check (base)

The check side: the eight documents of the draw keyed like the dev ones (`01-check-keys.md`), never tuned on and
scored in aggregate only: `scripts/reconcile-eval.mjs --check` prints the totals and which documents errored, never a
document's own numbers, and its report holds no more. The base, 6d30120 (the code of 0ed8b41), in the production
lane (full sweep), each document's sheet graph built by that code from its PDF. The same scorer scores both sides.

```
RECONCILE EVAL — check (production lane: full sweep); 8 documents

ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)
  units keyed 288; no reconcile row 9; listed in two rows 0
  drawn on a plan: found 185, missed 39; not drawn: said not drawn 55, cited anyway 0
  placements: key 242, pipeline 198, agreeing 172 (recall 71.1%, precision 86.9%)
  placements on a keyed view of the unit: 188 (recall 77.7%, precision 94.9%)
  unit count exact 230/279 (82.4%); over 5, under 44
  by its tag, verified or tag text only (AMBIGUOUS): drawn units found 185, missed 39; on a keyed view 188 (recall 77.7%, precision 94.9%)

PLAN -> ROW (each keyed drawn tag on an examined plan sheet)
  a scheduled unit's tag linked to its row on that sheet: 204/602 (33.9%)
  an unscheduled tag named on the review list: 45/72 (62.5%); taken for a row: 0
  review list entries on examined sheets: 2590; an unscheduled unit's tag 45 (1.7%), a scheduled unit's tag 52, no unit tag 2493
  likely-units list: names 0/72 unscheduled tags (0.0%); 0 entries on examined sheets: an unscheduled unit's tag 0 (n/a), a scheduled unit's tag 0, no unit tag 0

Aggregates only: no document's own numbers are shown.
```
