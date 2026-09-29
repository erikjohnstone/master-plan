# Control intent: binding eval (dev)

packets found: 123; keyed pairs: 323; key packets not found: 1; unmatched instances: 0
pair recall 96.9% (313/323; without semantic 99.3%; with proposals 96.9%; hits inside 0, containing 0)
precision 91.4% over 360 confirmed bindings (with proposals 90.9% over 362); proposals 2; ambiguous 0; units keyed "none" but bound 2
unit recall 95.7% (210 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| list_range | 21 | 21 | 100.0% |
| tag | 57 | 57 | 100.0% |
| semantic | 42 | 34 | 81.0% |
| family_detail | 187 | 185 | 98.9% |
| cross_reference | 16 | 16 | 100.0% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| list_range | 41 | 41 | 0 |
| tag | 31 | 30 | 0 |
| family_detail | 162 | 158 | 2 |
| component_of | 37 | 31 | 0 |
| tag_body | 48 | 33 | 0 |
| cross_reference | 12 | 10 | 0 |
| sibling | 31 | 26 | 0 |

| missed pairs, why | pairs |
|---|---:|
| bound to another packet of that kind | 6 |
| no binding at all (tag read) | 3 |
| key packet not found by the finder | 1 |

| set | packets | pairs | recall | bindings | precision |
|---|---:|---:|---:|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | 5 | 11 | 81.8% | 9 | 100.0% |
| 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | 9 | 28 | 96.4% | 33 | 81.8% |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | 23 | 16 | 100.0% | 16 | 100.0% |
| 069_ID_ITD_District_2_Laboratory_Heating_Upgrades | 4 | 18 | 100.0% | 18 | 100.0% |
| 074_CA_West_Valley_College_STEM_Classroom_HVAC | 8 | 1 | 0.0% | 2 | 0.0% |
| 094_FL_Orange_County_Regional_History_Center_HVAC | 3 | 5 | 100.0% | 5 | 100.0% |
| 12_MT_MSU_ReidHall_Renovation | 3 | 4 | 100.0% | 4 | 100.0% |
| baker-county-eoc | 3 | 2 | 100.0% | 2 | 100.0% |
| bldg5406-hvac-demo | 12 | 18 | 100.0% | 33 | 100.0% |
| federal-mech | 27 | 163 | 100.0% | 172 | 95.3% |
| itd-d1-lab | 26 | 57 | 89.5% | 66 | 77.3% |

GATE B1 (dev): recall 96.9% ≥ 95.0% ✓; precision 91.4% ≥ 98.0% ✗; unit recall 95.7% ≥ 95.0% ✓
