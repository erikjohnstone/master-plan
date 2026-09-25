# Control intent: binding eval (dev)

packets found: 124; keyed pairs: 323; key packets not found: 1; unmatched instances: 0
pair recall 92.9% (300/323; without semantic 97.9%; with proposals 94.1%; hits inside 0, containing 0)
precision 93.2% over 340 confirmed bindings (with proposals 92.0% over 349); proposals 9; ambiguous 4; units keyed "none" but bound 1
unit recall 91.9% (210 instances with a governing packet)

| key kind | pairs | hit | recall |
|---|---:|---:|---:|
| list_range | 21 | 21 | 100.0% |
| tag | 57 | 57 | 100.0% |
| semantic | 42 | 25 | 59.5% |
| family_detail | 187 | 181 | 96.8% |
| cross_reference | 16 | 16 | 100.0% |

| binding kind | bindings | correct | proposals |
|---|---:|---:|---:|
| list_range | 41 | 41 | 0 |
| tag | 32 | 31 | 0 |
| family_detail | 166 | 160 | 9 |
| component_of | 25 | 24 | 0 |
| cross_reference | 12 | 10 | 0 |
| tag_body | 43 | 30 | 0 |
| sibling | 30 | 25 | 0 |

| set | packets | pairs | recall | bindings | precision |
|---|---:|---:|---:|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | 5 | 11 | 81.8% | 9 | 100.0% |
| 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | 9 | 28 | 50.0% | 14 | 100.0% |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | 23 | 16 | 100.0% | 16 | 100.0% |
| 069_ID_ITD_District_2_Laboratory_Heating_Upgrades | 4 | 18 | 100.0% | 18 | 100.0% |
| 074_CA_West_Valley_College_STEM_Classroom_HVAC | 8 | 1 | 0.0% | 1 | 0.0% |
| 094_FL_Orange_County_Regional_History_Center_HVAC | 3 | 5 | 100.0% | 5 | 100.0% |
| 12_MT_MSU_ReidHall_Renovation | 3 | 4 | 100.0% | 4 | 100.0% |
| baker-county-eoc | 3 | 2 | 100.0% | 2 | 100.0% |
| bldg5406-hvac-demo | 13 | 18 | 100.0% | 35 | 100.0% |
| federal-mech | 27 | 163 | 100.0% | 170 | 95.9% |
| itd-d1-lab | 26 | 57 | 89.5% | 66 | 77.3% |

GATE B1 (dev): recall 92.9% ≥ 95.0% ✗; precision 93.2% ≥ 98.0% ✗; unit recall 91.9% ≥ 95.0% ✗

## Missed pairs
- 004_MO_T2504_03_Interior_and_Exterior_Renovation DOAS - 1 (DOAS) → #40 "KITCHEN HOOD SEQUENCE OF OPERATIONS:" [semantic; key title]
- 004_MO_T2504_03_Interior_and_Exterior_Renovation GEF - 1 (FAN) → #40 "KITCHEN HOOD SEQUENCE OF OPERATIONS:" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-AHU-1 (AHU) → #69 "SEQUENCE OF OPERATION FOR VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR" [family_detail; key title; proposal only]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-AHU-1 (AHU) → #69 "POINTS LIST FOR VAV AIR HANDLING UNIT" [family_detail; key title; proposal only]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-SF1 (FAN) → #69 "SEQUENCE OF OPERATION FOR VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-SF1 (FAN) → #69 "POINTS LIST FOR VAV AIR HANDLING UNIT" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-RF1 (FAN) → #69 "SEQUENCE OF OPERATION FOR VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-RF1 (FAN) → #69 "POINTS LIST FOR VAV AIR HANDLING UNIT" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-HX1 (HEAT_EXCHANGER) → #68 "DUAL HEAT EXCHANGER CONTROLS (HEATING SYSTEM)" [family_detail; key title; proposal only]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-HX2 (HEAT_EXCHANGER) → #68 "DUAL HEAT EXCHANGER CONTROLS (HEATING SYSTEM)" [family_detail; key title; proposal only]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-P2 (PUMP) → #68 "DUAL HEAT EXCHANGER CONTROLS (HEATING SYSTEM)" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-P3 (PUMP) → #68 "DUAL HEAT EXCHANGER CONTROLS (HEATING SYSTEM)" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-CC-1 (DUCT_MOUNTED_COIL) → #69 "SEQUENCE OF OPERATION FOR VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-CC-1 (DUCT_MOUNTED_COIL) → #69 "POINTS LIST FOR VAV AIR HANDLING UNIT" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-PHC1 (DUCT_MOUNTED_COIL) → #69 "SEQUENCE OF OPERATION FOR VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR" [semantic; key title]
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-PHC1 (DUCT_MOUNTED_COIL) → #69 "POINTS LIST FOR VAV AIR HANDLING UNIT" [semantic; key title]
- 074_CA_West_Valley_College_STEM_Classroom_HVAC ERV-A-15 (ERV) → #29 "ERV CONTROL" [family_detail; key not_found]
- itd-d1-lab EF-6 (FAN) → #16 "HEAT RELIEF FAN SEQUENCE OF OPERATION" [family_detail; key title]
- itd-d1-lab HC-2 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM CONTROL SCHEMATIC" [semantic; key title]
- itd-d1-lab HC-4 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM CONTROL SCHEMATIC" [semantic; key title]
- itd-d1-lab HC-5 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM CONTROL SCHEMATIC" [semantic; key title]
- itd-d1-lab HC-6 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM CONTROL SCHEMATIC" [semantic; key title]
- itd-d1-lab HC-8 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM CONTROL SCHEMATIC" [semantic; key title]

## False bindings
- 031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for WHSE-AHU-1 (AHU) → #69 "VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR CONTROL DIAGRAM" [family_detail, proposal] "VARIABLE AIR VOLUME AIR HANDLING UNIT WITH MINIMUM OUTSIDE AIR CONTROL DIAGRAM" is a detail for its family (AHU); its row does not print "MINIMUM", "OUTSIDE AIR"
- 074_CA_West_Valley_College_STEM_Classroom_HVAC ERV-A-15 (ERV) → #29 "ENERGY RECOVERY VENTILATOR" [family_detail] "ENERGY RECOVERY VENTILATOR" is a detail for its family (ERV)
- federal-mech EF-1 (FAN) → #24 "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" [tag_body] EF-1 is printed inside "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" as a label
- federal-mech EF-1 (FAN) → #24 "EMERGENCY SHUTDOWN - CONTROL DIAGRAM" [tag_body] EF-1 is printed inside "EMERGENCY SHUTDOWN - CONTROL DIAGRAM" as a label
- federal-mech EF-2 (FAN) → #24 "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" [cross_reference] the points schedule "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" lists EF-2 under "1. EF-1,2,3"
- federal-mech EF-3 (FAN) → #24 "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" [cross_reference] the points schedule "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" lists EF-3 under "1. EF-1,2,3"
- federal-mech EF-4 (FAN) → #24 "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" [tag_body] EF-4 is printed inside "HVAC CONTROLS - BMS POINT FUNCTION SCHEDULE - MISCELLANEOUS" as a label
- federal-mech EF-4 (FAN) → #24 "EMERGENCY SHUTDOWN - CONTROL DIAGRAM" [tag_body] EF-4 is printed inside "EMERGENCY SHUTDOWN - CONTROL DIAGRAM" as a label
- federal-mech HWRP-1 (PUMP) → #22 "AHU - 1 SEQUENCE OF OPERATIONS" [component_of] its row names as what it serves AHU-1, whose packet it is (tag: its title "AHU - 1 SEQUENCE OF OPERATIONS" names AHU-1)
- itd-d1-lab EF-4 (FAN) → #16 "HEAT RELIEF FAN SEQUENCE OF OPERATION" [family_detail, proposal, ambiguous, key none] "HEAT RELIEF FAN SEQUENCE OF OPERATION" is a detail for its family (FAN); its row does not print "HEAT", "RELIEF"
- itd-d1-lab EF-4 (FAN) → #21 "GENERAL EXHAUST FAN SEQUENCE OF OPERATION" [family_detail, proposal, ambiguous, key none] "GENERAL EXHAUST FAN SEQUENCE OF OPERATION" is a detail for its family (FAN); its row does not print "GENERAL"
- itd-d1-lab EF-4 (FAN) → #16 "HEAT RELIEF FAN CONTROL SCHEMATIC" [family_detail, proposal, ambiguous, key none] "HEAT RELIEF FAN CONTROL SCHEMATIC" is a detail for its family (FAN); its row does not print "HEAT", "RELIEF"
- itd-d1-lab EF-4 (FAN) → #21 "GENERAL EXHAUST FAN CONTROL SCHEMATIC" [family_detail, proposal, ambiguous, key none] "GENERAL EXHAUST FAN CONTROL SCHEMATIC" is a detail for its family (FAN); its row does not print "GENERAL"
- itd-d1-lab EF-6 (FAN) → #16 "HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION" [tag] its title "HEAT RELIEF FAN W/ LOUVER SEQUENCE OF OPERATION (EF-6/L-1 & EF-7/L-2)" names EF-6
- itd-d1-lab HC-1 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-1 is printed inside "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-2 (DUCT_MOUNTED_COIL) → #21 "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-2 is printed inside "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-2 (DUCT_MOUNTED_COIL) → #21 "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM CONTROL SCHEMATIC" [sibling] "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM CONTROL SCHEMATIC" is about the same subject as "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" on the same sheet
- itd-d1-lab HC-3 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-3 is printed inside "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-4 (DUCT_MOUNTED_COIL) → #21 "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-4 is printed inside "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-4 (DUCT_MOUNTED_COIL) → #21 "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM CONTROL SCHEMATIC" [sibling] "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM CONTROL SCHEMATIC" is about the same subject as "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" on the same sheet
- itd-d1-lab HC-5 (DUCT_MOUNTED_COIL) → #21 "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-5 is printed inside "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-5 (DUCT_MOUNTED_COIL) → #21 "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM CONTROL SCHEMATIC" [sibling] "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM CONTROL SCHEMATIC" is about the same subject as "LAB VENTILATION WITH GENERAL EXHAUST SYSTEM SEQUENCE OF OPERATION" on the same sheet
- itd-d1-lab HC-6 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH SNORKEL HOOD SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-6 is printed inside "LAB VENTILATION WITH SNORKEL HOOD SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-6 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH SNORKEL HOODS SYSTEM CONTROL SCHEMATIC" [sibling] "LAB VENTILATION WITH SNORKEL HOODS SYSTEM CONTROL SCHEMATIC" is about the same subject as "LAB VENTILATION WITH SNORKEL HOOD SYSTEM SEQUENCE OF OPERATION" on the same sheet
- itd-d1-lab HC-7 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-7 is printed inside "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-8 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH SNORKEL HOOD SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-8 is printed inside "LAB VENTILATION WITH SNORKEL HOOD SYSTEM SEQUENCE OF OPERATION" as a label
- itd-d1-lab HC-8 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH SNORKEL HOODS SYSTEM CONTROL SCHEMATIC" [sibling] "LAB VENTILATION WITH SNORKEL HOODS SYSTEM CONTROL SCHEMATIC" is about the same subject as "LAB VENTILATION WITH SNORKEL HOOD SYSTEM SEQUENCE OF OPERATION" on the same sheet
- itd-d1-lab HC-9 (DUCT_MOUNTED_COIL) → #20 "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" [tag_body] HC-9 is printed inside "LAB VENTILATION WITH MULTIPLE HOODS SYSTEM SEQUENCE OF OPERATION" as a label

## Key packets not found
- 074_CA_West_Valley_College_STEM_Classroom_HVAC #29|ERV CONTROL (1 pairs)
