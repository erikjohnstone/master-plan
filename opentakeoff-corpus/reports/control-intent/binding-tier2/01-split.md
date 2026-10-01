# Control intent: binding tier 2 (the draw)

Seed 181. Population: the 40 tier-2..5 dev documents; 28 print HVAC control drawings (00-eligibility.json).
Held-out (every eligible document the control-intent work has not read; aggregates only): 9 documents, 78 instances.
Dev (the first 10 of the 19 eligible exposed documents in the seeded shuffle): 272 instances.

| side | document | instances | exposure |
|---|---|---:|---|
| dev | 011_IL_VA_Hines_Finance_Center_Renovation | 15 | tier 2's examined list: CONTROL_INTENT_BUG_CATALOGUE CI-21 and CI-28 cite its 15 heat pumps and their DDC clause; CONTROL_INTENT_BUG_CATALOGUE.md cites it 2 times |
| dev | 028_TX_Renovation_of_Building_615_Final_Design_Plans | 33 | tier 2's examined list: the unseen audit checked its 25 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 7 times |
| dev | 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 15 | tier 2's examined list: the unseen audit checked its 20 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 5 times |
| dev | 012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | 19 | tier 2's examined list: the unseen audit checked its 6 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 4 times |
| dev | 16_NV_CarsonValleyMS_HVAC_Replacement | 52 | tier 2's examined list: the unseen audit checked its 33 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 8 times |
| dev | 01_NY_VA_Northport_Dialysis_100CD | 27 | CONTROL_INTENT_BUG_CATALOGUE.md cites it 1 time |
| dev | 06_MO_NatlGuard_JeffCity_CST_Addition | 18 | tier 2's examined list: the unseen audit checked its 16 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 1 time |
| dev | 083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | 9 | tier 2's examined list: the unseen audit checked its 3 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 2 times |
| dev | 096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | 60 | tier 2's examined list: the unseen audit checked its 79 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 11 times |
| dev | 061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building | 24 | tier 2's examined list: the unseen audit checked its 4 applied control-intent decisions against their cites and the drawings (06-unseen-audit.json); CONTROL_INTENT_BUG_CATALOGUE.md cites it 8 times |
| held-out | 032_PA_Construct_EHRM_Infrastructure_Upgrades | 2 | none |
| held-out | 033_MN_VA_Project_656_18_301_Construct_Replace | 6 | none |
| held-out | 036_LA_VA_Project_502_21_222_EHRM_Infrastructure | 2 | none |
| held-out | 047_NC_VA_Project_558_22_172_Replace_Chillers_in_AHU | 10 | none |
| held-out | 067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | 3 | none |
| held-out | 089_FL_Airport_Terminal_and_Hangar_Development | 26 | none |
| held-out | 093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | 23 | none |
| held-out | 097_UT_JVWTP_Chemical_Buildings_HVAC_Upgrades_Project | 2 | none |
| held-out | 10_MO_Hawthorn_PsychHospital_HVAC | 4 | none |

Not drawn (eligible, exposed): 044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers, 21_VA_OrangeCounty_PublicSafetyBldg, 14_OR_KlamathCC_LearningCtr_Mechanical, 017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling, 008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated, 03_FL_HurlburtField_ChildDevCenter, 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX, 043_FL_VA_Project_673_21_151_Replace_Air_Handling, 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.
