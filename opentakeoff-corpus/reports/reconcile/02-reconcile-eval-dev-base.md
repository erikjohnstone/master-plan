# Reconcile eval — dev, base (0ed8b41)

The reconcile at 0ed8b41, before AS-91 to AS-101: the production lane (full sweep), run on each document's cached sheet
graph (tables identical to a fresh build's; roles by that code's classifier), scored by the same scorer as
`02-reconcile-eval-dev.md`.

```
RECONCILE EVAL — dev (production lane: full sweep); 12 documents

ROW -> PLAN (keyed units a reconcile row carries; examined plan sheets only)
  units keyed 534; no reconcile row 87; listed in two rows 8
  drawn on a plan: found 198, missed 216; not drawn: said not drawn 33, cited anyway 0
  placements: key 461, pipeline 248, agreeing 119 (recall 25.8%, precision 48.0%)
  placements on a keyed view of the unit: 200 (recall 43.4%, precision 80.6%)
  unit count exact 193/447 (43.2%); over 37, under 217
  by its tag, verified or tag text only (AMBIGUOUS): drawn units found 198, missed 216; on a keyed view 200 (recall 43.4%, precision 80.6%)

PLAN -> ROW (each keyed drawn tag on an examined plan sheet)
  a scheduled unit's tag linked to its row on that sheet: 226/1215 (18.6%)
  an unscheduled tag named on the review list: 33/47 (70.2%); taken for a row: 1
  review list entries on examined sheets: 3210; an unscheduled unit's tag 33 (1.0%), a scheduled unit's tag 64, no unit tag 3113
  likely-units list: names 0/47 unscheduled tags (0.0%); 0 entries on examined sheets: an unscheduled unit's tag 0 (n/a), a scheduled unit's tag 0, no unit tag 0

| set | units | unmatched | drawn found/missed | by its tag | cited not drawn | placements key/pipe/agree | count exact | links | unscheduled listed | review list unit/all |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | 14 | 0 | 8/5 | 8/13 | 0 | 13/8/0 | 9/14 | 7/42 | 2/9 | 2/355 |
| itd-d1-lab | 37 | 4 | 28/5 | 28/33 | 0 | 33/36/28 | 20/33 | 36/55 | 0/0 | 0/78 |
| 011_IL_VA_Hines_Finance_Center_Renovation | 15 | 0 | 0/15 | 0/15 | 0 | 15/0/0 | 0/15 | 0/81 | 0/0 | 0/78 |
| 26_CA_TransbayTower_Mechanical_64Sheets | 193 | 71 | 0/122 | 0/122 | 0 | 158/0/0 | 0/122 | 0/280 | 0/0 | 0/729 |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 22 | 0 | 22/0 | 22/22 | 0 | 22/28/22 | 17/22 | 23/69 | 4/4 | 4/120 |
| 14_OR_KlamathCC_LearningCtr_Mechanical | 43 | 0 | 0/42 | 0/42 | 0 | 42/0/0 | 1/43 | 0/114 | 0/0 | 0/219 |
| federal-mech | 96 | 0 | 94/2 | 94/96 | 0 | 96/94/24 | 94/96 | 104/243 | 0/0 | 0/181 |
| 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | 10 | 2 | 7/1 | 7/8 | 0 | 14/8/7 | 7/8 | 7/22 | 0/0 | 0/112 |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | 33 | 2 | 0/0 | 0/0 | 0 | 0/0/0 | 31/31 | 0/0 | 0/0 | 0/0 |
| 12_MT_MSU_ReidHall_Renovation | 17 | 7 | 0/10 | 0/10 | 0 | 10/0/0 | 0/10 | 0/24 | 0/0 | 0/108 |
| 24_IA_JohnsonCounty_Courthouse | 5 | 0 | 2/3 | 2/5 | 0 | 7/3/2 | 2/5 | 3/9 | 0/0 | 0/460 |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | 49 | 1 | 37/11 | 37/48 | 0 | 51/71/36 | 12/48 | 46/276 | 27/34 | 27/770 |
```
