# Control intent: question eval (dev)

projects 11; questions shown 27 (most in one project 4, cap 6); zero-effect shown 0; past the cap 0
pre-fills 9: right 8, wrong 0, moot 1 (100.0% right where the key answers)
oracle (the key's answers against none): 41 instances fixed, 0 broken

| set | shown | pre-fills (right/wrong/moot) | oracle fixed | broken |
|---|---|---:|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | PQ1 (407L/14R), PQ2 (118L/8R), PQ4 (18L/3R), PQ5 (0L/1R) | 0/0/1 | 14 | 0 |
| 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | PQ1 (78L/12R), PQ3 (20L/2R), PQ2 (6L/2R), PQ4 (6L/1R) | 2/0/0 | 2 | 0 |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | PQ1 (130L/14R) | 1/0/0 | 0 | 0 |
| 069_ID_ITD_District_2_Laboratory_Heating_Upgrades | PQ1 (24L/9R), PQ4 (24L/4R), PQ3 (10L/3R) | 1/0/0 | 5 | 0 |
| 074_CA_West_Valley_College_STEM_Classroom_HVAC | PQ1 (19L/1R) | 0/0/0 | 0 | 0 |
| 094_FL_Orange_County_Regional_History_Center_HVAC | PQ1 (213L/7R), PQ2 (78L/6R) | 0/0/0 | 0 | 0 |
| 12_MT_MSU_ReidHall_Renovation | PQ1 (132L/6R) | 0/0/0 | 0 | 0 |
| baker-county-eoc | PQ1 (131L/6R), PQ2 (26L/2R) | 0/0/0 | 6 | 0 |
| bldg5406-hvac-demo | PQ1 (332L/18R), PQ4 (36L/6R), PQ2 (23L/2R) | 0/0/0 | 2 | 0 |
| federal-mech | PQ1 (2105L/86R), PQ4 (42L/7R), PQ2 (32L/6R), PQ5 (0L/6R) | 3/0/0 | 11 | 0 |
| itd-d1-lab | PQ1 (138L/23R), PQ4 (48L/8R) | 1/0/0 | 1 | 0 |

GATE A (dev): zero-effect shown 0 = 0 ✓; at most 6 per project ✓; pre-fill right 100.0% ≥ 90.0% ✓; oracle broken 0 = 0 ✓ → PASS
