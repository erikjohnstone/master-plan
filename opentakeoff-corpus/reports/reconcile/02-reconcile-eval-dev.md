# Reconcile eval — dev

The reconcile of the code this report was committed with (AS-91 to AS-107, AS-103 measured and not adopted), the
production lane (full sweep), run on each document's cached sheet graph: its tables are identical to a fresh build's
(the table guard), and its sheet roles were recomputed by this code's classifier. Scored with
`scripts/reconcile-eval.mjs --runs <dir> --score-only --report` against the dev reconcile keys
(`01-key-adjudication.md`). The base, 0ed8b41, is `02-reconcile-eval-dev-base.md`. At 4d16d7e (AS-91 to AS-101) this
report read: drawn units found 278, missed 149; placements recall 54.6%, precision 86.6%, on a keyed view 62.4% and
99.0%; unit counts exact 310/462 (67.1%), over 1, under 151; by its tag 414 found, 13 missed, on a keyed view 449
(94.7%, 89.8%); links 959/1215. ASSEMBLIES_BUG_CATALOGUE AS-102 and AS-104 to AS-107 read every change since.

```
RECONCILE EVAL — dev (production lane: full sweep); 12 documents

ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)
  units keyed 534; no reconcile row 72; listed in two rows 8
  drawn on a plan: found 407, missed 20; not drawn: said not drawn 35, cited anyway 0
  placements: key 474, pipeline 440, agreeing 401 (recall 84.6%, precision 91.1%)
  placements on a keyed view of the unit: 431 (recall 90.9%, precision 98.0%)
  unit count exact 439/462 (95.0%); over 1, under 22
  by its tag, verified or tag text only (AMBIGUOUS): drawn units found 414, missed 13; on a keyed view 443 (recall 93.5%, precision 96.1%)

PLAN -> ROW (each keyed drawn tag on an examined plan sheet)
  a scheduled unit's tag linked to its row on that sheet: 983/1215 (80.9%)
  an unscheduled tag named on the review list: 33/47 (70.2%); taken for a row: 1
  review list entries on examined sheets: 3210; an unscheduled unit's tag 33 (1.0%), a scheduled unit's tag 64, no unit tag 3113
  likely-units list: names 23/47 unscheduled tags (48.9%); 42 entries on examined sheets: an unscheduled unit's tag 23 (54.8%), a scheduled unit's tag 16, no unit tag 3

| set | units | unmatched | drawn found/missed | by its tag | cited not drawn | placements key/pipe/agree | count exact | links | unscheduled listed | review list unit/all |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | 14 | 0 | 13/0 | 13/13 | 0 | 13/13/11 | 14/14 | 35/42 | 2/9 | 2/355 |
| itd-d1-lab | 37 | 0 | 33/4 | 36/37 | 0 | 37/33/33 | 33/37 | 54/55 | 0/0 | 0/78 |
| 011_IL_VA_Hines_Finance_Center_Renovation | 15 | 0 | 15/0 | 15/15 | 0 | 15/15/15 | 15/15 | 81/81 | 0/0 | 0/78 |
| 26_CA_TransbayTower_Mechanical_64Sheets | 193 | 71 | 120/2 | 121/122 | 0 | 158/149/142 | 118/122 | 153/280 | 0/0 | 0/729 |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 22 | 0 | 22/0 | 22/22 | 0 | 22/22/22 | 22/22 | 66/69 | 4/4 | 4/120 |
| 14_OR_KlamathCC_LearningCtr_Mechanical | 43 | 0 | 40/2 | 40/42 | 0 | 42/40/19 | 41/43 | 109/114 | 0/0 | 0/219 |
| federal-mech | 96 | 0 | 95/1 | 96/96 | 0 | 96/95/93 | 95/96 | 177/243 | 0/0 | 0/181 |
| 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | 10 | 0 | 9/1 | 10/10 | 0 | 16/10/7 | 9/10 | 22/22 | 0/0 | 0/112 |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | 33 | 0 | 0/0 | 0/0 | 0 | 0/0/0 | 33/33 | 0/0 | 0/0 | 0/0 |
| 12_MT_MSU_ReidHall_Renovation | 17 | 0 | 10/7 | 10/17 | 0 | 17/10/10 | 10/17 | 12/24 | 0/0 | 0/108 |
| 24_IA_JohnsonCounty_Courthouse | 5 | 0 | 2/3 | 3/5 | 0 | 7/2/2 | 1/5 | 6/9 | 0/0 | 0/460 |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | 49 | 1 | 48/0 | 48/48 | 0 | 51/51/47 | 48/48 | 268/276 | 27/34 | 27/770 |
```
