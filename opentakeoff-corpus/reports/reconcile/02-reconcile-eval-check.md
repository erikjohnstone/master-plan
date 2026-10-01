# Reconcile eval — check

The check side at AS-109, AS-111, AS-113, AS-114, AS-119 and AS-120: the eight documents of the draw keyed like the
dev ones (`01-check-keys.md`), never tuned on and scored in aggregate only: `scripts/reconcile-eval.mjs --check`
prints the totals and which documents errored, never a document's own numbers, and its report holds no more. The
production lane (full sweep), each document's sheet graph built by that code from its PDF, one document at a time.
The previous revisions: 8d46f5c (AS-102, AS-104 to AS-107) is `02-reconcile-eval-check-8d46f5c.md`, 4d16d7e (AS-91
to AS-101) is `02-reconcile-eval-check-4d16d7e.md`; the base, 6d30120, is `02-reconcile-eval-check-base.md`. The same
scorer scores all four.

```
RECONCILE EVAL — check (production lane: full sweep); 8 documents

ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)
  units keyed 288; no reconcile row 5; listed in two rows 0
  drawn on a plan: found 208, missed 17; not drawn: said not drawn 58, cited anyway 0
  placements: key 243, pipeline 218, agreeing 198 (recall 81.5%, precision 90.8%)
  placements on a keyed view of the unit: 211 (recall 86.8%, precision 96.8%)
  unit count exact 257/283 (90.8%); over 4, under 22
  by its tag, verified or tag text only (AMBIGUOUS): drawn units found 210, missed 15; on a keyed view 213 (recall 87.7%, precision 95.9%)

PLAN -> ROW (each keyed drawn tag on an examined plan sheet)
  a scheduled unit's tag linked to its row on that sheet: 470/602 (78.1%)
  an unscheduled tag named on the review list: 45/72 (62.5%); taken for a row: 0
  review list entries on examined sheets: 2590; an unscheduled unit's tag 45 (1.7%), a scheduled unit's tag 52, no unit tag 2493
  likely-units list: names 9/72 unscheduled tags (12.5%); 26 entries on examined sheets: an unscheduled unit's tag 9 (34.6%), a scheduled unit's tag 8, no unit tag 9

Aggregates only: no document's own numbers are shown.
```
