# Typical eval — dev

```
TYPICAL EVAL (instrument 3) — dev, project settings: none (the auto-proposal alone)
exact includes 73 instance(s) where a drawing-decided option matched through the library default

                                    inst  exact opt-wr typ-wr unres unmat | exact%  dishon undiscl
ALL                                  244    116     44     21    63     0 |  47.5%      1       0
  key: a typical                     142     73     44      0    25     0 |  51.4%      1       0
  key: none                          102     43      0     21    38     0 |  42.2%      0       0

per set
  federal-mech                        96     53     23      2    18     0 |  55.2%      0       0
  itd-d1-lab                          37     15      3      9    10     0 |  40.5%      0       0
  031_MO_VA_Project_589A4_20_158_R    29     21      0      2     6     0 |  72.4%      0       0
  bldg5406-hvac-demo                  19     10      1      0     8     0 |  52.6%      1       0
  004_MO_T2504_03_Interior_and_Ext    14      0      0      2    12     0 |   0.0%      0       0
  040_IL_VA_Solicitation_36C77623B    14      2     12      0     0     0 |  14.3%      0       0
  12_MT_MSU_ReidHall_Renovation       10      8      2      0     0     0 |  80.0%      0       0
  069_ID_ITD_District_2_Laboratory     9      2      0      2     5     0 |  22.2%      0       0
  baker-county-eoc                     8      2      0      4     2     0 |  25.0%      0       0
  094_FL_Orange_County_Regional_Hi     7      2      3      0     2     0 |  28.6%      0       0
  074_CA_West_Valley_College_STEM_     1      1      0      0     0     0 | 100.0%      0       0

per family
  VAV                                 71     56     15      0     0     0 |  78.9%      0       0
  FAN                                 30      0      7      2    21     0 |   0.0%      0       0
  PUMP                                30      9      4      0    17     0 |  30.0%      0       0
  DUCT_MOUNTED_COIL                   24     24      0      0     0     0 | 100.0%      0       0
  UNIT_HEATER                         20      0      6     14     0     0 |   0.0%      0       0
  FCU                                 12      0      1      0    11     0 |   0.0%      0       0
  CONDENSING_UNIT                     11     11      0      0     0     0 | 100.0%      0       0
  AHU                                 10      0      4      0     6     0 |   0.0%      1       0
  RTU                                  9      0      0      2     7     0 |   0.0%      0       0
  FIN_TUBE_RADIATION                   8      8      0      0     0     0 | 100.0%      0       0
  BOILER                               6      2      2      2     0     0 |  33.3%      0       0
  AIR_COOLED_CHILLER                   3      1      2      0     0     0 |  33.3%      0       0
  CABINET_UNIT_HEATER                  2      0      2      0     0     0 |   0.0%      0       0
  ERV                                  2      1      0      1     0     0 |  50.0%      0       0
  HEAT_EXCHANGER                       2      2      0      0     0     0 | 100.0%      0       0
  HUMIDIFIER                           2      1      1      0     0     0 |  50.0%      0       0
  COOLING_TOWER                        1      1      0      0     0     0 | 100.0%      0       0
  DOAS                                 1      0      0      0     1     0 |   0.0%      0       0

per key typical
  none                               102     43      0     21    38     0 |  42.2%      0       0
  vav-reheat-hw                       58     43     15      0     0     0 |  74.1%      0       0
  fan-constant                        17      0      4      0    13     0 |   0.0%      0       0
  pump-vfd                            12      8      4      0     0     0 |  66.7%      0       0
  vav-reheat-electric                  9      9      0      0     0     0 | 100.0%      0       0
  unit-heater                          8      0      8      0     0     0 |   0.0%      0       0
  pump-constant                        5      1      0      0     4     0 |  20.0%      0       0
  boiler                               4      2      2      0     0     0 |  50.0%      0       0
  fan-variable                         4      0      3      0     1     0 |   0.0%      0       0
  vav-dual-duct                        4      4      0      0     0     0 | 100.0%      0       0
  ahu-multizone-vav                    3      0      1      0     2     0 |   0.0%      1       0
  ahu-single-zone                      3      0      3      0     0     0 |   0.0%      0       0
  chiller                              3      1      2      0     0     0 |  33.3%      0       0
  doas                                 2      0      0      0     2     0 |   0.0%      0       0
  fcu                                  2      0      0      0     2     0 |   0.0%      0       0
  heat-exchanger                       2      2      0      0     0     0 | 100.0%      0       0
  humidifier                           2      1      1      0     0     0 |  50.0%      0       0
  ahu-constant-volume                  1      0      0      0     1     0 |   0.0%      0       0
  cooling-tower                        1      1      0      0     0     0 | 100.0%      0       0
  erv                                  1      1      0      0     0     0 | 100.0%      0       0
  split-dx-indoor                      1      0      1      0     0     0 |   0.0%      0       0

wrong_typical (21):
  004_MO_T2504_03_Interior_and_Exterior_Renovation | GEF - 1 (FAN): key none, got ok fan-variable — fan-variable@1: attr.vfd = 'yes' (rank 20)
  004_MO_T2504_03_Interior_and_Exterior_Renovation | GUH - 1 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-EUH-1 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-EUH-2 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | B-1(E) (BOILER): key none, got ok boiler — boiler@1: (every unit of the family) (rank 10)
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | B-2(E) (BOILER): key none, got ok boiler — boiler@1: (every unit of the family) (rank 10)
  baker-county-eoc | RTU-1 (RTU): key none, got ok ahu-constant-volume — ahu-constant-volume@1: attr.vfd = 'no' (rank 20)
  baker-county-eoc | RTU-2 (RTU): key none, got ok ahu-constant-volume — ahu-constant-volume@1: attr.vfd = 'no' (rank 20)
  baker-county-eoc | ERV-01 (ERV): key none, got ok erv — erv@1: (every unit of the family) (rank 10)
  baker-county-eoc | EF-1 (FAN): key none, got ok fan-constant — fan-constant@1: attr.vfd = 'no' (rank 20)
  federal-mech | UH-1 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  federal-mech | UH-2 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-1 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-2 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-3 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-4 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-5 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-6 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-7 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-8 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)
  itd-d1-lab | EH-9 (UNIT_HEATER): key none, got ok unit-heater — unit-heater@1: (every unit of the family) (rank 10)

option_wrong (44):
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | UH-1 (UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | UH-2 (UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | UH-3 (UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | UH-4 (UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | UH-5 (UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | UH-6 (UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | EF-1A (FAN): key fan-variable, got ok fan-variable — motorized_damper: key true, got false (starter_default); pressure_control: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | EF-1B (FAN): key fan-variable, got ok fan-variable — motorized_damper: key true, got false (starter_default); pressure_control: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | EF-2A (FAN): key fan-constant, got ok fan-constant — motorized_damper: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | EF-2B (FAN): key fan-constant, got ok fan-constant — motorized_damper: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | EF-3A (FAN): key fan-constant, got ok fan-constant — motorized_damper: key true, got false (starter_default)
  040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | EF-3B (FAN): key fan-constant, got ok fan-constant — motorized_damper: key true, got false (starter_default)
  094_FL_Orange_County_Regional_History_Center_HVAC | AHU-04 (AHU): key ahu-single-zone, got ok ahu-single-zone — setpoint_adjust: key false, got true (starter_default); freezestat_to_bas: key false, got true (starter_default); duct_smoke_detectors: key false, got true (starter_default)
  094_FL_Orange_County_Regional_History_Center_HVAC | AHU-05 (AHU): key ahu-single-zone, got ok ahu-single-zone — setpoint_adjust: key false, got true (starter_default); freezestat_to_bas: key false, got true (starter_default); duct_smoke_detectors: key false, got true (starter_default)
  094_FL_Orange_County_Regional_History_Center_HVAC | AHU-08 (AHU): key ahu-single-zone, got ok ahu-single-zone — setpoint_adjust: key false, got true (starter_default); freezestat_to_bas: key false, got true (starter_default); duct_smoke_detectors: key false, got true (starter_default)
  12_MT_MSU_ReidHall_Renovation | CUH-1 (CABINET_UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  12_MT_MSU_ReidHall_Renovation | CUH-2 (CABINET_UNIT_HEATER): key unit-heater, got ok unit-heater — modulating_valve: key true, got false (starter_default)
  bldg5406-hvac-demo | CH-1 (AIR_COOLED_CHILLER): key chiller, got ok chiller — chw_isolation_valve: key false, got true (starter_default); ufc_minimum_points: key true, got false (starter_default)
  federal-mech | AHU-1 (AHU): key ahu-multizone-vav, got ok ahu-multizone-vav — return_fan: key true, got false (starter_default); enthalpy_economizer: key true, got false (starter_default); differential_economizer: key true, got false (starter_default); freezestat_to_bas: key false, got true (starter_default); ufc_minimum_points: key true, got false (starter_default)
  federal-mech | B-1 (BOILER): key boiler, got ok boiler — isolation_valve: key true, got false (starter_default)
  federal-mech | B-2 (BOILER): key boiler, got ok boiler — isolation_valve: key true, got false (starter_default)
  federal-mech | CH-1 (AIR_COOLED_CHILLER): key chiller, got ok chiller — chw_isolation_valve: key false, got true (starter_default); ufc_minimum_points: key true, got false (starter_default)
  federal-mech | CWP-1 (PUMP): key pump-vfd, got ok pump-vfd — ufc_minimum_points: key true, got false (starter_default)
  federal-mech | CWP-2 (PUMP): key pump-vfd, got ok pump-vfd — ufc_minimum_points: key true, got false (starter_default)
  federal-mech | HWP-1 (PUMP): key pump-vfd, got ok pump-vfd — ufc_minimum_points: key true, got false (starter_default)
  federal-mech | HWP-2 (PUMP): key pump-vfd, got ok pump-vfd — ufc_minimum_points: key true, got false (starter_default)
  federal-mech | VAV-1 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-13 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-16 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-18 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-2 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-21 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-22 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-28 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-31 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-35 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-37 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-38 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-44 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-46 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  federal-mech | VAV-55 (VAV): key vav-reheat-hw, got ok vav-reheat-hw — co2_sensor: key true, got false (starter_default)
  itd-d1-lab | HUM-1 (HUMIDIFIER): key humidifier, got ok humidifier — space_humidity: key true, got false (starter_default)
  itd-d1-lab | LEF-1 (FAN): key fan-variable, got ok fan-variable — motorized_damper: key true, got false (starter_default); pressure_control: key true, got false (starter_default)
  itd-d1-lab | F-1 (FCU→FURNACE): key split-dx-indoor, got ok split-dx-indoor — fan_status: key true, got false (starter_default)

unresolved (63):
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU -1 (RTU): key none, got unresolved ahu-single-zone — waits for attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU - 2 (RTU): key none, got unresolved ahu-single-zone — waits for attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU -3 (RTU): key none, got unresolved ahu-single-zone — waits for attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU -4 (RTU): key none, got unresolved ahu-single-zone — waits for attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU -6 (RTU): key none, got unresolved ahu-single-zone — waits for attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU -7 (RTU): key none, got unresolved ahu-single-zone — waits for attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | RTU -5 (RTU→DOAS): key none, got unresolved doas — waits for attr.energy_recovery [honest], attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | DOAS - 1 (DOAS): key none, got unresolved doas — waits for attr.energy_recovery [honest], attr.dx_stages [honest]
  004_MO_T2504_03_Interior_and_Exterior_Renovation | EF - 1 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  004_MO_T2504_03_Interior_and_Exterior_Renovation | EF - 2 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  004_MO_T2504_03_Interior_and_Exterior_Renovation | SP - 1 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  004_MO_T2504_03_Interior_and_Exterior_Renovation | HWRP - 1 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-AHU-1 (AHU): key ahu-multizone-vav, got unresolved — waits for attr.vfd [honest], attr.terminals_served [derived]; candidates ahu-constant-volume@1, ahu-multizone-vav@1, ahu-single-zone@1
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-SF1 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-RF1 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-EF1 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-EF2 (FAN): key fan-variable, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for | WHSE-P1 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | BP-1 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | BP-2 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | CWP-1 (PUMP): key pump-constant, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | CWP-2 (PUMP): key pump-constant, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  069_ID_ITD_District_2_Laboratory_Heating_Upgrades | AHU-1(E) (AHU): key none, got unresolved — waits for attr.vfd [honest]; candidates ahu-constant-volume@1, ahu-single-zone@1
  094_FL_Orange_County_Regional_History_Center_HVAC | AHU-06 (AHU): key ahu-constant-volume, got unresolved ahu-constant-volume — waits for attr.economizer [honest]
  094_FL_Orange_County_Regional_History_Center_HVAC | AHU-07 (AHU→DOAS): key doas, got unresolved doas — waits for attr.energy_recovery [honest]
  baker-county-eoc | FCU-1 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  baker-county-eoc | FCU-2 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  bldg5406-hvac-demo | AHU-1 (AHU): key ahu-multizone-vav, got unresolved ahu-multizone-vav — waits for attr.cooling_type [dishonest key "chw"], attr.dx_stages [honest]
  bldg5406-hvac-demo | EF-1 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  bldg5406-hvac-demo | EF-2 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  bldg5406-hvac-demo | EF-3 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  bldg5406-hvac-demo | EF-4 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  bldg5406-hvac-demo | EF-5 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  bldg5406-hvac-demo | AC-1 (FCU): key fcu, got unresolved fcu — waits for attr.ecm [honest]
  bldg5406-hvac-demo | CP-1 (PUMP): key pump-constant, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | CP-1 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | CP-2 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | CP-3 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | CP-4 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | CP-5 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | CP-6 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | EF-1 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  federal-mech | EF-2 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  federal-mech | EF-3 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  federal-mech | EF-4 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  federal-mech | HWRP-1 (PUMP): key pump-constant, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  federal-mech | EV-1 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  federal-mech | EV-2 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  federal-mech | EV-3 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  federal-mech | EV-4 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  federal-mech | EV-5 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  federal-mech | EV-6 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  federal-mech | FCU-1 (FCU): key fcu, got unresolved fcu — waits for attr.ecm [honest]
  itd-d1-lab | BP-1 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  itd-d1-lab | BP-2 (PUMP): key none, got unresolved — waits for attr.vfd [honest]; candidates pump-constant@1, pump-vfd@1
  itd-d1-lab | EF-1 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  itd-d1-lab | EF-2 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  itd-d1-lab | EF-3 (FAN): key none, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  itd-d1-lab | EF-4 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  itd-d1-lab | EF-5 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  itd-d1-lab | EF-6 (FAN): key fan-constant, got unresolved — waits for attr.vfd [honest]; candidates fan-constant@1, fan-variable@1
  itd-d1-lab | DFC-1 (FCU): key none, got unresolved fcu — waits for attr.ecm [honest]
  itd-d1-lab | AHU-1 (AHU): key doas, got unresolved — waits for attr.vfd [honest], attr.terminals_served [derived]; candidates ahu-constant-volume@1, ahu-multizone-vav@1, ahu-single-zone@1

GATE 5 (dev): exact 47.5% (need >= 98.0%) FAIL · undisclosed 0 (need = 0) ok → FAIL
```
