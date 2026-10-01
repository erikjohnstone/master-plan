# Control intent: binding eval (dev2)

packets found: 123; keyed pairs: 629; key packets not found: 2; unmatched instances: 2
pair recall 95.7% (602/629; without semantic 95.7%; with proposals 95.7%; hits inside 45, containing 21)
precision 96.9% over 551 confirmed bindings (with proposals 96.9% over 551); proposals 0; ambiguous 0; units keyed "none" but bound 9
unit recall 96.4% (252 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| family_detail | 495 | 482 | 97.4% |
| list_range | 15 | 13 | 86.7% |
| tag | 73 | 62 | 84.9% |
| cross_reference | 25 | 25 | 100.0% |
| semantic | 21 | 20 | 95.2% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| family_detail | 326 | 311 | 0 |
| list_range | 7 | 7 | 0 |
| tag | 12 | 12 | 0 |
| tag_body | 56 | 56 | 0 |
| system | 31 | 31 | 0 |
| sibling | 43 | 43 | 0 |
| component_of | 51 | 49 | 0 |
| cross_reference | 25 | 25 | 0 |

| missed pairs, why | pairs |
|---|---:|
| bound to packets of other kinds only | 6 |
| key packet not found by the finder | 5 |
| no binding at all (tag read) | 5 |
| bound to another packet of that kind | 4 |
| instance not matched to a schedule row | 4 |
| no binding at all (tag not read) | 3 |

| set | packets | pairs | recall | bindings | precision |
|---|---:|---:|---:|---:|---:|
| 011_IL_VA_Hines_Finance_Center_Renovation | 4 | 30 | 100.0% | 30 | 100.0% |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | 19 | 93 | 95.7% | 34 | 100.0% |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 18 | 45 | 95.6% | 38 | 100.0% |
| 012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | 5 | 42 | 100.0% | 42 | 100.0% |
| 16_NV_CarsonValleyMS_HVAC_Replacement | 12 | 129 | 96.9% | 123 | 100.0% |
| 01_NY_VA_Northport_Dialysis_100CD | 14 | 78 | 100.0% | 78 | 100.0% |
| 06_MO_NatlGuard_JeffCity_CST_Addition | 13 | 43 | 100.0% | 27 | 100.0% |
| 061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building | 11 | 50 | 72.0% | 36 | 100.0% |

2 walled document(s) (reconcile check documents) are counted in the totals and never shown.

GATE B1 (dev2): recall 95.7% ≥ 95.0% ✓; precision 96.9% ≥ 98.0% ✗; unit recall 96.4% ≥ 95.0% ✓

Sheet graphs read from a warm cache built at 0ed8b41 (its plan-sweep lookups older than 0ed8b41's; the sheet graph code has changed since, in the reconcile's plan work); compile, finder and binder at this commit (CI-62).
