# Reconcile eval — dev

The reconcile of the code this report was committed with (AS-91 to AS-120; AS-103 and AS-112 measured and not
adopted), the production lane (full sweep), run on each document's cached sheet graph: its tables are identical to a
fresh build's (the table guard), and its sheet roles were recomputed by this code's classifier. Scored with
`scripts/reconcile-eval.mjs --runs <dir> --score-only --report` against the dev reconcile keys
(`01-key-adjudication.md`). The base, 0ed8b41, is `02-reconcile-eval-dev-base.md`. At 8d46f5c (AS-91 to AS-107) this
report read: drawn units found 407, missed 20; placements agreeing 401 (recall 84.6%, precision 91.1%), on a keyed
view 431 (90.9%, 98.0%); unit counts exact 439/462 (95.0%), over 1, under 22; by its tag 414 found, 13 missed, on a
keyed view 443 (93.5%, 96.1%); links 983/1215 (80.9%); review list entries 3210, a scheduled unit's tag 64 of them;
likely-units list 42 entries, an unscheduled unit's tag 23 of them (54.8%). At 4d16d7e (AS-91 to AS-101): links
959/1215. ASSEMBLIES_BUG_CATALOGUE AS-109, AS-111, AS-113, AS-114, AS-119 and AS-120 (measured together, AS-126)
read every change since.

```
RECONCILE EVAL — dev (production lane: full sweep); 12 documents

ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)
  units keyed 534; no reconcile row 71; listed in two rows 8
  drawn on a plan: found 408, missed 20; not drawn: said not drawn 35, cited anyway 0
  placements: key 475, pipeline 441, agreeing 402 (recall 84.6%, precision 91.2%)
  placements on a keyed view of the unit: 432 (recall 90.9%, precision 98.0%)
  unit count exact 440/463 (95.0%); over 1, under 22
  by its tag, verified or tag text only (AMBIGUOUS): drawn units found 415, missed 13; on a keyed view 444 (recall 93.5%, precision 96.1%)

PLAN -> ROW (each keyed drawn tag on an examined plan sheet)
  a scheduled unit's tag linked to its row on that sheet: 1053/1215 (86.7%)
  an unscheduled tag named on the review list: 33/47 (70.2%); taken for a row: 1
  review list entries on examined sheets: 3192; an unscheduled unit's tag 33 (1.0%), a scheduled unit's tag 49, no unit tag 3110
  likely-units list: names 23/47 unscheduled tags (48.9%); 27 entries on examined sheets: an unscheduled unit's tag 23 (85.2%), a scheduled unit's tag 1, no unit tag 3

| set | units | unmatched | drawn found/missed | by its tag | cited not drawn | placements key/pipe/agree | count exact | links | unscheduled listed | review list unit/all |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | 14 | 0 | 13/0 | 13/13 | 0 | 13/13/11 | 14/14 | 35/42 | 2/9 | 2/355 |
| itd-d1-lab | 37 | 0 | 33/4 | 36/37 | 0 | 37/33/33 | 33/37 | 54/55 | 0/0 | 0/70 |
| 011_IL_VA_Hines_Finance_Center_Renovation | 15 | 0 | 15/0 | 15/15 | 0 | 15/15/15 | 15/15 | 81/81 | 0/0 | 0/78 |
| 26_CA_TransbayTower_Mechanical_64Sheets | 193 | 71 | 120/2 | 121/122 | 0 | 158/149/142 | 118/122 | 155/280 | 0/0 | 0/726 |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 22 | 0 | 22/0 | 22/22 | 0 | 22/22/22 | 22/22 | 68/69 | 4/4 | 4/117 |
| 14_OR_KlamathCC_LearningCtr_Mechanical | 43 | 0 | 40/2 | 40/42 | 0 | 42/40/19 | 41/43 | 109/114 | 0/0 | 0/215 |
| federal-mech | 96 | 0 | 95/1 | 96/96 | 0 | 96/95/93 | 95/96 | 237/243 | 0/0 | 0/181 |
| 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | 10 | 0 | 9/1 | 10/10 | 0 | 16/10/7 | 9/10 | 22/22 | 0/0 | 0/112 |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | 33 | 0 | 0/0 | 0/0 | 0 | 0/0/0 | 33/33 | 0/0 | 0/0 | 0/0 |
| 12_MT_MSU_ReidHall_Renovation | 17 | 0 | 10/7 | 10/17 | 0 | 17/10/10 | 10/17 | 12/24 | 0/0 | 0/108 |
| 24_IA_JohnsonCounty_Courthouse | 5 | 0 | 2/3 | 3/5 | 0 | 7/2/2 | 1/5 | 6/9 | 0/0 | 0/460 |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | 49 | 0 | 49/0 | 49/49 | 0 | 52/52/48 | 49/49 | 274/276 | 27/34 | 27/770 |
```
