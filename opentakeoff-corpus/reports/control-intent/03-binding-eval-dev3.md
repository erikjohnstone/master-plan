# Control intent: binding eval (dev3)

packets found: 135; keyed pairs: 310; key packets not found: 15; unmatched instances: 21
pair recall 40.0% (124/310; without semantic 54.4%; with proposals 50.6%; hits inside 0, containing 0)
precision 79.9% over 154 confirmed bindings (with proposals 73.6% over 212); proposals 58; ambiguous 54; units keyed "none" but bound 18
unit recall 56.2% (146 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| family_detail | 187 | 104 | 55.6% |
| list_range | 19 | 8 | 42.1% |
| semantic | 93 | 6 | 6.5% |
| tag | 11 | 6 | 54.5% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| family_detail | 156 | 112 | 32 |
| tag_body | 22 | 10 | 0 |
| list_range | 24 | 24 | 18 |
| tag | 8 | 8 | 8 |
| system | 2 | 2 | 0 |

| missed pairs, why | pairs |
|---|---:|
| key packet not found by the finder | 68 |
| instance not matched to a schedule row | 44 |
| bound as a proposal only | 33 |
| bound to another packet of that kind | 21 |
| no binding at all (tag read) | 11 |
| bound to packets of other kinds only | 7 |
| no binding at all (tag not read) | 2 |

| set | packets | pairs | recall | bindings | precision |
|---|---:|---:|---:|---:|---:|
| 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers | 13 | 71 | 16.9% | 20 | 60.0% |
| 21_VA_OrangeCounty_PublicSafetyBldg | 30 | 61 | 98.4% | 60 | 100.0% |
| 14_OR_KlamathCC_LearningCtr_Mechanical | 14 | 24 | 54.2% | 34 | 38.2% |
| 017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | 8 | 39 | 0.0% | 0 | n/a |
| 008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated | 1 | 1 | 0.0% | 0 | n/a |
| 03_FL_HurlburtField_ChildDevCenter | 18 | 47 | 36.2% | 16 | 100.0% |
| 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX | 21 | 21 | 28.6% | 6 | 100.0% |
| 043_FL_VA_Project_673_21_151_Replace_Air_Handling | 7 | 12 | 0.0% | 0 | n/a |
| 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 23 | 34 | 47.1% | 18 | 88.9% |

GATE B1 (dev3): recall 40.0% ≥ 95.0% ✗; precision 79.9% ≥ 98.0% ✗; unit recall 56.2% ≥ 95.0% ✗
