# Control intent: binding eval (dev3)

packets found: 137; keyed pairs: 310; key packets not found: 10; unmatched instances: 21
pair recall 58.7% (182/310; without semantic 59.9%; with proposals 60.6%; hits inside 0, containing 0)
precision 96.3% over 188 confirmed bindings (with proposals 91.2% over 205); proposals 17; ambiguous 18; units keyed "none" but bound 4
unit recall 74.7% (146 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| family_detail | 187 | 109 | 58.3% |
| list_range | 19 | 11 | 57.9% |
| semantic | 93 | 52 | 55.9% |
| tag | 11 | 10 | 90.9% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| tag_body | 53 | 50 | 0 |
| family_detail | 131 | 116 | 17 |
| list_range | 9 | 9 | 0 |
| system | 4 | 4 | 0 |
| component_of | 8 | 8 | 0 |

| missed pairs, why | pairs |
|---|---:|
| key packet not found by the finder | 48 |
| instance not matched to a schedule row | 44 |
| bound to another packet of that kind | 16 |
| no binding at all (tag read) | 8 |
| bound as a proposal only | 6 |
| bound to packets of other kinds only | 6 |

| set | packets | pairs | recall | bindings | precision |
|---|---:|---:|---:|---:|---:|
| 21_VA_OrangeCounty_PublicSafetyBldg | 31 | 61 | 98.4% | 60 | 100.0% |
| 14_OR_KlamathCC_LearningCtr_Mechanical | 11 | 24 | 100.0% | 24 | 100.0% |
| 017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | 11 | 39 | 100.0% | 39 | 100.0% |
| 008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated | 1 | 1 | 100.0% | 1 | 100.0% |
| 03_FL_HurlburtField_ChildDevCenter | 18 | 47 | 36.2% | 16 | 100.0% |
| 043_FL_VA_Project_673_21_151_Replace_Air_Handling | 7 | 12 | 0.0% | 0 | n/a |
| 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 23 | 34 | 52.9% | 18 | 100.0% |

2 walled document(s) (reconcile check documents) are counted in the totals and never shown.

GATE B1 (dev3): recall 58.7% ≥ 95.0% ✗; precision 96.3% ≥ 98.0% ✗; unit recall 74.7% ≥ 95.0% ✗

Sheet graphs read from a warm cache built at 0ed8b41 (its plan-sweep lookups older than 0ed8b41's; the sheet graph code has changed since, in the reconcile's plan work); compile, finder and binder at this commit (CI-62).
