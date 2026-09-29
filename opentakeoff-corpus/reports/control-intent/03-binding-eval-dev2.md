# Control intent: binding eval (dev2)

packets found: 95; keyed pairs: 629; key packets not found: 16; unmatched instances: 2
pair recall 79.7% (501/629; without semantic 79.1%; with proposals 82.7%; hits inside 0, containing 0)
precision 95.3% over 448 confirmed bindings (with proposals 93.0% over 474); proposals 26; ambiguous 8; units keyed "none" but bound 9
unit recall 91.7% (252 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| family_detail | 495 | 394 | 79.6% |
| list_range | 15 | 11 | 73.3% |
| tag | 73 | 51 | 69.9% |
| cross_reference | 25 | 25 | 100.0% |
| semantic | 21 | 20 | 95.2% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| family_detail | 296 | 269 | 26 |
| list_range | 7 | 7 | 0 |
| tag | 10 | 10 | 0 |
| system | 30 | 30 | 0 |
| tag_body | 50 | 46 | 0 |
| sibling | 5 | 5 | 0 |
| component_of | 51 | 49 | 0 |
| cross_reference | 25 | 25 | 0 |

| missed pairs, why | pairs |
|---|---:|
| key packet not found by the finder | 88 |
| bound as a proposal only | 19 |
| bound to packets of other kinds only | 5 |
| no binding at all (tag read) | 5 |
| bound to another packet of that kind | 4 |
| instance not matched to a schedule row | 4 |
| no binding at all (tag not read) | 3 |

| set | packets | pairs | recall | bindings | precision |
|---|---:|---:|---:|---:|---:|
| 011_IL_VA_Hines_Finance_Center_Renovation | 4 | 30 | 100.0% | 30 | 100.0% |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | 9 | 93 | 84.9% | 29 | 100.0% |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 13 | 45 | 80.0% | 24 | 100.0% |
| 012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | 4 | 42 | 66.7% | 28 | 100.0% |
| 16_NV_CarsonValleyMS_HVAC_Replacement | 9 | 129 | 66.7% | 86 | 100.0% |
| 01_NY_VA_Northport_Dialysis_100CD | 10 | 78 | 66.7% | 52 | 100.0% |
| 06_MO_NatlGuard_JeffCity_CST_Addition | 11 | 43 | 88.4% | 16 | 100.0% |
| 083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | 2 | 9 | 66.7% | 7 | 85.7% |
| 096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | 24 | 110 | 100.0% | 136 | 88.2% |
| 061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building | 9 | 50 | 72.0% | 40 | 90.0% |

GATE B1 (dev2): recall 79.7% ≥ 95.0% ✗; precision 95.3% ≥ 98.0% ✗; unit recall 91.7% ≥ 95.0% ✗
