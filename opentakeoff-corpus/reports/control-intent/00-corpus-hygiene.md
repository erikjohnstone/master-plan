# Corpus hygiene: sets that are not independent of the dev / held-out split

`opentakeoff/mcp/scripts/corpus-hygiene.py` over 121 corpus sets (input PDFs only; no pipeline output).

- **Held-out twin (never read):** `001_NC_FY20_P_228_ATC_Tower_and_Air_Operations`
- **Held-out drafter (never tuned on):** `015_VA_P_095_Replace_Submarine_Pier_3_Utility`, `021_XX_Laboratory_building_mechanical_drawings_lab`, `023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory`, `034_NC_VA_Project_637_22_700_EHRM_Infrastructure`, `038_NC_VA_Project_637_22_700_EHRM_Infrastructure`, `075_MT_Renne_Library_Innovation_Learning_Studio`, `27_WA_ColvilleTribes_Hatchery_Lab`
- **Dev twin or near copy (counts as dev, never as unseen):** `019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04`, `049_IL_VA_Solicitation_36C77623B0051_Expand_Sterile`, `055_US_VA_Project_673_20_107_EHRM_Infrastructure`, `056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces`, `062_ID_ITD_District_1_Laboratory_Building_Mechanical`, `068_US_Antelope_Valley_College_Applied_Arts_Math`, `072_CA_CA07_2627_West_Valley_College_Science_Math`, `098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade`, `18_OR_BakerMS_HVAC_Electrical_FullSet`, `itd-d1-lab-raster`
- **Copy of another unseen set (the original counts, once):** `010_US_WWYK240146_Design_Implement_Monitoring_Control`
- **Dev and held-out documents sharing printed text (>= 15%):** none

| Set | Relation | Of | Side | Share / pages |
|---|---|---|---|---|
| `itd-d1-lab-raster` | derived | `itd-d1-lab` | dev | drafters.json |
| `049_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | near | `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | dev | 0.24 |
| `055_US_VA_Project_673_20_107_EHRM_Infrastructure` | near | `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | dev | 0.19 |
| `055_US_VA_Project_673_20_107_EHRM_Infrastructure` | near | `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile` | dev | 0.17 |
| `056_NY_VA_Project_632_19_106_Renovate_Pharmacy_Spaces` | near | `031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for` | dev | 0.31 |
| `062_ID_ITD_District_1_Laboratory_Building_Mechanical` | near | `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | dev | 0.26 |
| `068_US_Antelope_Valley_College_Applied_Arts_Math` | near | `074_CA_West_Valley_College_STEM_Classroom_HVAC` | dev | 0.17 |
| `072_CA_CA07_2627_West_Valley_College_Science_Math` | near | `074_CA_West_Valley_College_STEM_Classroom_HVAC` | dev | 0.7 |
| `098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade` | near | `itd-d1-lab` | dev | 0.22 |
| `098_ID_ITD_D3_Bruneau_Maintenance_Shed_HVAC_Upgrade` | near | `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | dev | 0.37 |
| `18_OR_BakerMS_HVAC_Electrical_FullSet` | near | `069_ID_ITD_District_2_Laboratory_Heating_Upgrades` | dev | 0.4 |
| `019_FL_Eglin_AFB_Building_XX_Contract_Documents_01_04` | twin | `federal-mech` | dev | 1.0 |
| `062_ID_ITD_District_1_Laboratory_Building_Mechanical` | twin | `itd-d1-lab` | dev | 1.0 |
| `015_VA_P_095_Replace_Submarine_Pier_3_Utility` | drafter | `burns-mcdonnell` | heldout | drafters.json |
| `021_XX_Laboratory_building_mechanical_drawings_lab` | drafter | `usda-ars-southeast-area` | heldout | drafters.json |
| `023_US_Chiller_Replacement_at_U_S_Salinity_Laboratory` | drafter | `usda-ars-southeast-area` | heldout | drafters.json |
| `034_NC_VA_Project_637_22_700_EHRM_Infrastructure` | drafter | `coffman-engineers` | heldout | 36 |
| `038_NC_VA_Project_637_22_700_EHRM_Infrastructure` | drafter | `coffman-engineers` | heldout | 54 |
| `075_MT_Renne_Library_Innovation_Learning_Studio` | drafter | `coffman-engineers` | heldout | 3 |
| `27_WA_ColvilleTribes_Hatchery_Lab` | drafter | `coffman-engineers` | heldout | 38 |
| `001_NC_FY20_P_228_ATC_Tower_and_Air_Operations` | twin | `navfac-cherry-point-atc` | heldout | 1.0 |
| `010_US_WWYK240146_Design_Implement_Monitoring_Control` | duplicate | `tinker-afb-iwcs-controls` | unseen | drafters.json |
