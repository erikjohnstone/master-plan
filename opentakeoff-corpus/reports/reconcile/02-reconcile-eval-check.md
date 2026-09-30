# Reconcile eval — check

The check side at AS-102 and AS-104 to AS-107: the eight documents of the draw keyed like the dev ones
(`01-check-keys.md`), never tuned on and scored in aggregate only: `scripts/reconcile-eval.mjs --check` prints the
totals and which documents errored, never a document's own numbers, and its report holds no more. The production lane
(full sweep), each document's sheet graph built by that code from its PDF, one document at a time. The previous
revision, 4d16d7e (AS-91 to AS-101), is `02-reconcile-eval-check-4d16d7e.md`; the base, 6d30120, is
`02-reconcile-eval-check-base.md`. The same scorer scores all three.

```
RECONCILE EVAL — check (production lane: full sweep); 8 documents

ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)
  units keyed 288; no reconcile row 6; listed in two rows 0
  drawn on a plan: found 208, missed 16; not drawn: said not drawn 58, cited anyway 0
  placements: key 242, pipeline 218, agreeing 198 (recall 81.8%, precision 90.8%)
  placements on a keyed view of the unit: 211 (recall 87.2%, precision 96.8%)
  unit count exact 257/282 (91.1%); over 4, under 21
  by its tag, verified or tag text only (AMBIGUOUS): drawn units found 209, missed 15; on a keyed view 212 (recall 87.6%, precision 96.8%)

PLAN -> ROW (each keyed drawn tag on an examined plan sheet)
  a scheduled unit's tag linked to its row on that sheet: 466/602 (77.4%)
  an unscheduled tag named on the review list: 45/72 (62.5%); taken for a row: 0
  review list entries on examined sheets: 2590; an unscheduled unit's tag 45 (1.7%), a scheduled unit's tag 52, no unit tag 2493
  likely-units list: names 9/72 unscheduled tags (12.5%); 26 entries on examined sheets: an unscheduled unit's tag 9 (34.6%), a scheduled unit's tag 8, no unit tag 9

Aggregates only: no document's own numbers are shown.
```
