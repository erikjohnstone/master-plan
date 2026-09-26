# Attribute eval — dev3

Cold: the normalizer at 5e31198 (dev 3 fully keyed, before the rules its misses taught, ASSEMBLIES_BUG_CATALOGUE AS-29), run on 2026-09-26. The current report is 02-attr-eval-dev3.md.

```
ATTRIBUTE EVAL (instrument 2) — dev3, normalizer: normalize.ts
key instances matched to a compile item: 162/165; out-of-key-scope compile items in keyed tables: 70; unscored values (extensions): 4

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  3371    1377   1150      5    222      0 |  1994   1970     24 |  83.5%   0.4%
  slice: grid                        3083    1089    957      2    130      0 |  1994   1970     24 |  87.9%   0.2%
  slice: reading                      225     225    161      2     62      0 |     0      0      0 |  71.6%   0.9%
  slice: notes                         63      63     32      1     30      0 |     0      0      0 |  50.8%   1.6%

per family
  VAV                                1150     530    510      0     20      0 |   620    620      0 |  96.2%   0.0%
  PUMP                                345     194    192      0      2      0 |   151    138     13 |  99.0%   0.0%
  VRF_INDOOR                          400     120     80      0     40      0 |   280    280      0 |  66.7%   0.0%
  FAN                                 162      99     48      3     48      0 |    63     61      2 |  48.5%   3.0%
  FCU                                 210      80     67      0     13      0 |   130    130      0 |  83.8%   0.0%
  HEAT_PUMP                           240      69     69      0      0      0 |   171    171      0 | 100.0%   0.0%
  UNIT_HEATER                         153      67     48      0     19      0 |    86     86      0 |  71.6%   0.0%
  AIR_COOLED_CHILLER                   84      47     42      2      3      0 |    37     37      0 |  89.4%   4.3%
  DUCT_MOUNTED_COIL                   200      42     32      0     10      0 |   158    152      6 |  76.2%   0.0%
  RTU                                 135      38      0      0     38      0 |    97     97      0 |   0.0%   0.0%
  COOLING_TOWER                        45      27     24      0      3      0 |    18     18      0 |  88.9%   0.0%
  BOILER                               30      18     16      0      2      0 |    12     12      0 |  88.9%   0.0%
  ERV                                  22      12      7      0      5      0 |    10     10      0 |  58.3%   0.0%
  VRF_OUTDOOR                          60      12      3      0      9      0 |    48     48      0 |  25.0%   0.0%
  AHU                                  45       7      5      0      2      0 |    38     36      2 |  71.4%   0.0%
  HEAT_EXCHANGER                       36       6      0      0      6      0 |    30     30      0 |   0.0%   0.0%
  DOAS                                 45       5      4      0      1      0 |    40     40      0 |  80.0%   0.0%
  HUMIDIFIER                            9       4      3      0      1      0 |     5      4      1 |  75.0%   0.0%

per set
  096_IN_Vermillion_County_Jail_Me   1236     596    554      2     40      0 |   640    636      4 |  93.0%   0.3%
  071_ME_BGS_Project_3809_Health_S    611     247    187      0     60      0 |   364    364      0 |  75.7%   0.0%
  012_MO_M2430_01_Chiller_Upgrade_    282     155    149      0      6      0 |   127    114     13 |  96.1%   0.0%
  093_ME_BGS_Project_3845_Jonesbor    460     132     83      0     49      0 |   328    328      0 |  62.9%   0.0%
  25_WA_DouglasCounty_Courthouse_H    305      98     87      2      9      0 |   207    207      0 |  88.8%   2.0%
  017_MD_NIST_Gaithersburg_Buildin    225      82     33      0     49      0 |   143    136      7 |  40.2%   0.0%
  083_MA_Town_Offices_Facilities_H    202      47     38      0      9      0 |   155    155      0 |  80.9%   0.0%
  008_MO_T2331_01_Repair_to_Interi     50      20     19      1      0      0 |    30     30      0 |  95.0%   5.0%

per attribute
  volts                               163     120    108      0     12      0 |    43     43      0 |  90.0%   0.0%
  phase                               163     100     91      0      9      0 |    63     63      0 |  91.0%   0.0%
  area_served                         165      63     40      0     23      0 |   102     96      6 |  63.5%   0.0%
  cfm                                  73      63     57      0      6      0 |    10      8      2 |  90.5%   0.0%
  cfm_heat                             50      50     30      0     20      0 |     0      0      0 |  60.0%   0.0%
  cfm_max                              50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm_min                              50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  heat_type                            50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  inlet_size_in                        50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  heating_mbh                          59      46     40      0      6      0 |    13     13      0 |  87.0%   0.0%
  cooling_mbh                          50      42     36      0      6      0 |     8      8      0 |  85.7%   0.0%
  motor_hp                            144      42     26      0     16      0 |   102    102      0 |  61.9%   0.0%
  hw_ewt_f                            116      38     38      0      0      0 |    78     78      0 | 100.0%   0.0%
  hw_gpm                              116      38     38      0      0      0 |    78     78      0 | 100.0%   0.0%
  hw_lwt_f                            116      38     38      0      0      0 |    78     78      0 | 100.0%   0.0%
  hw_mbh                               62      33     33      0      0      0 |    29     29      0 | 100.0%   0.0%
  hw_rows                              62      33     33      0      0      0 |    29     29      0 | 100.0%   0.0%
  rpm                                  33      32     26      0      6      0 |     1      1      0 |  81.3%   0.0%
  hw_conn_in                           62      30     30      0      0      0 |    32     32      0 | 100.0%   0.0%
  bas_interface                        61      29      5      0     24      0 |    32     32      0 |  17.2%   0.0%
  service                              33      29     23      0      6      0 |     4      4      0 |  79.3%   0.0%
  gpm                                  28      28     28      0      0      0 |     0      0      0 | 100.0%   0.0%
  eh_kw                               119      25     20      0      5      0 |    94     93      1 |  80.0%   0.0%
  head_ft                              23      23     23      0      0      0 |     0      0      0 | 100.0%   0.0%
  vfd                                  41      22     20      1      1      0 |    19      6     13 |  90.9%   4.5%
  conn_in                              88      20     20      0      0      0 |    68     68      0 | 100.0%   0.0%
  terminal_type                        50      20     20      0      0      0 |    30     30      0 | 100.0%   0.0%
  qty                                 115      16      0      0     16      0 |    99     99      0 |   0.0%   0.0%
  chw_ewt_f                            63      13     13      0      0      0 |    50     50      0 | 100.0%   0.0%
  chw_gpm                              63      13     13      0      0      0 |    50     50      0 | 100.0%   0.0%
  chw_lwt_f                            63      13     13      0      0      0 |    50     50      0 | 100.0%   0.0%
  cooling_type                         12      10      7      0      3      0 |     2      1      1 |  70.0%   0.0%
  drive                                10      10      4      0      6      0 |     0      0      0 |  40.0%   0.0%
  esp_in                               10      10     10      0      0      0 |     0      0      0 | 100.0%   0.0%
  glycol_pct                           23      10      8      0      2      0 |    13     13      0 |  80.0%   0.0%
  heating_type                         12      10      3      0      7      0 |     2      2      0 |  30.0%   0.0%
  heating_medium                        9       9      7      0      2      0 |     0      0      0 |  77.8%   0.0%
  tons                                  9       9      1      2      6      0 |     0      0      0 |  11.1%  22.2%
  supply_cfm                            7       7      2      0      5      0 |     0      0      0 |  28.6%   0.0%
  condenser                             6       6      6      0      0      0 |     0      0      0 | 100.0%   0.0%
  ecm                                  67       6      1      1      4      0 |    61     61      0 |  16.7%  16.7%
  ewt_f                                 5       5      5      0      0      0 |     0      0      0 | 100.0%   0.0%
  lwt_f                                 5       5      5      0      0      0 |     0      0      0 | 100.0%   0.0%
  filter_merv                           5       4      1      0      3      0 |     1      1      0 |  25.0%   0.0%
  outdoor_air_pct                       5       4      0      0      4      0 |     1      1      0 |   0.0%   0.0%
  supply_fan_hp                         7       4      1      0      3      0 |     3      3      0 |  25.0%   0.0%
  cells                                 3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  chw_mbh                              12       3      3      0      0      0 |     9      9      0 | 100.0%   0.0%
  chw_rows                             12       3      3      0      0      0 |     9      9      0 | 100.0%   0.0%
  chw_wpd_ft                           12       3      3      0      0      0 |     9      9      0 | 100.0%   0.0%
  control                              10       3      0      1      2      0 |     7      7      0 |   0.0%  33.3%
  exhaust_fan_hp                        7       3      1      0      2      0 |     4      4      0 |  33.3%   0.0%
  fan_hp                                3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  fan_speeds                            7       3      0      0      3      0 |     4      4      0 |   0.0%   0.0%
  floor                               165       3      0      0      3      0 |   162    162      0 |   0.0%   0.0%
  hw_wpd_ft                            62       3      3      0      0      0 |    59     59      0 | 100.0%   0.0%
  exhaust_cfm                           2       2      1      0      1      0 |     0      0      0 |  50.0%   0.0%
  fuel                                  2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  hx_type                               2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  input_mbh                             2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  primary_medium                        2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  secondary_medium                      2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  capacity_lb_hr                        1       1      0      0      1      0 |     0      0      0 |   0.0%   0.0%
  humidifier_type                       1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  motor_watts                          10       1      1      0      0      0 |     9      9      0 | 100.0%   0.0%
  oa_cfm_min                            5       1      1      0      0      0 |     4      4      0 | 100.0%   0.0%
  recovery_type                         2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  building                            165       0      0      0      0      0 |   165    165      0 |    —      —  
  capacity_mbh                          2       0      0      0      0      0 |     2      2      0 |    —      —  
  chw_conn_in                          12       0      0      0      0      0 |    12     12      0 |    —      —  
  chw_glycol_pct                       12       0      0      0      0      0 |    12     12      0 |    —      —  
  cooling_tons                         50       0      0      0      0      0 |    50     50      0 |    —      —  
  dx_stages                             5       0      0      0      0      0 |     5      5      0 |    —      —  
  economizer                            5       0      0      0      0      0 |     5      5      0 |    —      —  
  eh_stages                            50       0      0      0      0      0 |    50     50      0 |    —      —  
  energy_recovery                       5       0      0      0      0      0 |     5      4      1 |    —      —  
  gas_input_mbh                         5       0      0      0      0      0 |     5      5      0 |    —      —  
  humidifier                            5       0      0      0      0      0 |     5      5      0 |    —      —  
  hw_glycol_pct                        62       0      0      0      0      0 |    62     62      0 |    —      —  
  kw_input                              6       0      0      0      0      0 |     6      6      0 |    —      —  
  pipes                                 7       0      0      0      0      0 |     7      7      0 |    —      —  
  primary_conn_in                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_ewt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_gpm                           2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_lwt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_lb_hr                   2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_psig                    2       0      0      0      0      0 |     2      2      0 |    —      —  
  pump_arrangement                     23       0      0      0      0      0 |    23     23      0 |    —      —  
  return_fan_hp                         5       0      0      0      0      0 |     5      5      0 |    —      —  
  secondary_conn_in                     2       0      0      0      0      0 |     2      2      0 |    —      —  
  secondary_ewt_f                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  secondary_gpm                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  secondary_lwt_f                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  steam_lb_hr                          14       0      0      0      0      0 |    14     14      0 |    —      —  
  steam_psig                           14       0      0      0      0      0 |    14     14      0 |    —      —  
  supply_fan_qty                        5       0      0      0      0      0 |     5      5      0 |    —      —  

key instances with no compile item (3):
  071_ME_BGS_Project_3809_Health_Science_Center 071_ME_BGS_Project_3809_Health_Science_Center.pdf#44 "PACKAGED ROOF TOP UNIT SCHEDULE" RTU-G (RTU): no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center 071_ME_BGS_Project_3809_Health_Science_Center.pdf#44 "PACKAGED ROOF TOP UNIT SCHEDULE" RTU-1 (ALT#2) (RTU): no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center 071_ME_BGS_Project_3809_Health_Science_Center.pdf#44 "PACKAGED ROOF TOP UNIT SCHEDULE" RTU-2 (RTU): no compile item with this tag in the keyed table

invented (24):
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CWP-1 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CWP-2 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CWP-3 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | PCHP-1 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | PCHP-2 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | PCHP-3 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | SCHP-1 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | SCHP-2 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | PHWP-1 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | PHWP-2 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | PHWP-3 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | SHWP-1 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | SHWP-2 PUMP.vfd: key "" (not printed) got "yes" from "(table note 1)" = "PROVIDE PUMP WITH VARIABLE FREQUENCY DRIVE RATED MOTOR AND SHAFT GROUNDING RING." [note.vfd]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-1 DUCT_MOUNTED_COIL.area_served: key "" (not printed) got "ACU-A-1" from "SERVICE" = "ACU-A-1" [text.service_as_area]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-2 DUCT_MOUNTED_COIL.area_served: key "" (not printed) got "ACU-A-2" from "SERVICE" = "ACU-A-2" [text.service_as_area]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-3 DUCT_MOUNTED_COIL.area_served: key "" (not printed) got "ACU-A-3" from "SERVICE" = "ACU-A-3" [text.service_as_area]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-4 DUCT_MOUNTED_COIL.area_served: key "" (not printed) got "ACU-A-4" from "SERVICE" = "ACU-A-4" [text.service_as_area]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-5 DUCT_MOUNTED_COIL.area_served: key "" (not printed) got "ACU-A-5" from "SERVICE" = "ACU-A-5" [text.service_as_area]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-6 DUCT_MOUNTED_COIL.area_served: key "" (not printed) got "ACU-A-6" from "SERVICE" = "ACU-A-6" [text.service_as_area]
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | H-A-3 HUMIDIFIER.eh_kw: key "" kW (not printed) got 0.65 from "POWER (KW)" = "0.65" [power.electric_heat]
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | AHU-4 AHU.cooling_type: key "" (not printed) got "dx" from "DX HEAT RECOVERY COIL" = "-" [derived.dx_block]
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | AHU-4 AHU.energy_recovery: key "" (not printed) got "none" from "DX HEAT RECOVERY COIL" = "-" [enum.energy_recovery_none]
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | EG2 FAN.cfm: key "" (no FAN instance printed: none — sheet M603 prints diffuser, grille, VAV terminal, slot diffuser and motorized damper schedules; no row is a fan (the dampers' remark 2 names the exhaust fans they serve, scheduled on M602)) got 1600 from "DIFFUSER / GRILLE REMARKS: 1. BRANCH DUCTWORK TO THE DIFFUSER SHALL BE THE SAME SIZE AS THE NECK UNLESS OTHERWISE NOTED. 2. PROVIDE FRAME STYLE APPROPRIATE FOR CEILING TYPE (I.E. LAY IN, SURFACE MOUNT). 3. PROVIDE FACE OPERABLE DAMPLER IN NECK. 4. PROVIDE WITH 13/16” SQUARE PERFORATIONS 3/16” SPACING. 5. PROVIDE SQUARE TO ROUND TRANSITION FOR 8” ROUND RUN OUTS. 6. PROVIDE SQUARE TO ROUND TRANSITION FOR 10” ROUND RUN OUTS. 7. PROVIDE SQUARE TO ROUND TRANSITION FOR 12” ROUND RUN OUTS. 8. PROVIDE CLIPS TO SECURE DIFFUSER/GRILLE TO CEILING GRID. 9. PROVIDE SLEEVE AND SECURITY BARS. SLEEVE LENGTH AS REQUIRED FOR INSTALLATION. 10. PROVIDE CEILING RADIATION DAMPER TO MEET RATING OF CEILING CONSTRUCTION. 11. TERMINAL BOX DOWNSTREAM DUCT RUNOUT SHALL BE SIZE OF TERMINAL BOX DISCHARGE. COORDINATE WITH FINAL TERMINAL BOX SUBMITTAL. MAX CFM" = "1600" [airflow.unit]
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | EG3 FAN.cfm: key "" (no FAN instance printed: none — sheet M603 prints diffuser, grille, VAV terminal, slot diffuser and motorized damper schedules; no row is a fan (the dampers' remark 2 names the exhaust fans they serve, scheduled on M602)) got 200 from "DIFFUSER / GRILLE REMARKS: 1. BRANCH DUCTWORK TO THE DIFFUSER SHALL BE THE SAME SIZE AS THE NECK UNLESS OTHERWISE NOTED. 2. PROVIDE FRAME STYLE APPROPRIATE FOR CEILING TYPE (I.E. LAY IN, SURFACE MOUNT). 3. PROVIDE FACE OPERABLE DAMPLER IN NECK. 4. PROVIDE WITH 13/16” SQUARE PERFORATIONS 3/16” SPACING. 5. PROVIDE SQUARE TO ROUND TRANSITION FOR 8” ROUND RUN OUTS. 6. PROVIDE SQUARE TO ROUND TRANSITION FOR 10” ROUND RUN OUTS. 7. PROVIDE SQUARE TO ROUND TRANSITION FOR 12” ROUND RUN OUTS. 8. PROVIDE CLIPS TO SECURE DIFFUSER/GRILLE TO CEILING GRID. 9. PROVIDE SLEEVE AND SECURITY BARS. SLEEVE LENGTH AS REQUIRED FOR INSTALLATION. 10. PROVIDE CEILING RADIATION DAMPER TO MEET RATING OF CEILING CONSTRUCTION. 11. TERMINAL BOX DOWNSTREAM DUCT RUNOUT SHALL BE SIZE OF TERMINAL BOX DISCHARGE. COORDINATE WITH FINAL TERMINAL BOX SUBMITTAL. MAX CFM" = "200" [airflow.unit]

wrong (5):
  008_MO_T2331_01_Repair_to_Interior_Exterior_Unheated | EF-1 FAN.control: key "INTEGRAL FAN SPEED CONTROLLER" (NOTE 1, where the row's NOTES cite it: the fan's speed controller) got "INTEGRAL FAN SPEED CONTROLLER AND BIRD SCREEN" from "(table note 1)" = "PROVIDE FACTORY-INSTALLED DISCONNECT SWITCH, INTEGRAL FAN SPEED CONTROLLER AND BIRD SCREEN." [note.control]
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CH-1 AIR_COOLED_CHILLER.tons: key "85" tons (NOMINAL CAPACITY (TON)) got 77 from "DESIGN COOLING CAPACITY (TON)" = "77.0" [capacity.tons]
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CH-2 AIR_COOLED_CHILLER.tons: key "140" tons (NOMINAL CAPACITY (TON)) got 134 from "DESIGN COOLING CAPACITY (TON)" = "134.0" [capacity.tons]
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | REF-1 FAN.ecm: key "no" (REMARKS: the fan's speed control, W/ VFD or W/ ECM (note 1: EC motors or variable frequency drives): an EC motor) got "yes" from "(table note 1)" = "PROVIDE FANS WITH EC MOTORS (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES." [note.ecm]
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | REF-2 FAN.vfd: key "no" (REMARKS: the fan's speed control, W/ VFD or W/ ECM (note 1: EC motors or variable frequency drives): a VFD) got "yes" from "(table note 1)" = "PROVIDE FANS WITH EC MOTORS (MOTOR MOUNTED) OR VARIABLE FREQUENCY DRIVES." [note.vfd]

missed (222):
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CH-1 AIR_COOLED_CHILLER.tons: key "300" tons (NET CAPACITY: tons, the unit the evaporator's design flow carries (598.5 GPM x (56 - 44) F / 24 = 299)) — no printed column answers it
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CH-2 AIR_COOLED_CHILLER.tons: key "300" tons (NET CAPACITY: tons, the unit the evaporator's design flow carries (598.5 GPM x (56 - 44) F / 24 = 299)) — no printed column answers it
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CH-3 AIR_COOLED_CHILLER.tons: key "300" tons (NET CAPACITY: tons, the unit the evaporator's design flow carries (598.5 GPM x (56 - 44) F / 24 = 299)) — no printed column answers it
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CT-1 COOLING_TOWER.tons: key "300" tons (NOMINAL CAPACITY: nominal tons, the unit the tower's 900 GPM gives at 3 GPM per nominal ton (900 / 3 = 300)) — no printed column answers it
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CT-2 COOLING_TOWER.tons: key "300" tons (NOMINAL CAPACITY: nominal tons, the unit the tower's 900 GPM gives at 3 GPM per nominal ton (900 / 3 = 300)) — no printed column answers it
  012_MO_M2430_01_Chiller_Upgrade_Center_for_Behavioral | CT-3 COOLING_TOWER.tons: key "300" tons (NOMINAL CAPACITY: nominal tons, the unit the tower's 900 GPM gives at 3 GPM per nominal ton (900 / 3 = 300)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.qty: key "1" (SUPPLY FAN / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.service: key "ACU-A-1" (SERVICE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.cfm: key "15795" cfm (SUPPLY FAN / AIR FLOW (CFM)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.motor_hp: key "20" hp (MOTOR / MOTOR NAMEPLATE HORSE POWER (MHP)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.rpm: key "1170" rpm (MOTOR / RPM) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.drive: key "direct" (SUPPLY FAN / DRIVE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-1 FAN.volts: key "460" V (MOTOR / VOLTAGE (V)) — cell "20 16.68 460 DIRECT II 1 FAN" is not a standard voltage
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.qty: key "1" (SUPPLY FAN / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.service: key "ACU-A-2" (SERVICE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.cfm: key "19490" cfm (SUPPLY FAN / AIR FLOW (CFM)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.motor_hp: key "20" hp (MOTOR / MOTOR NAMEPLATE HORSE POWER (MHP)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.rpm: key "1170" rpm (MOTOR / RPM) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.drive: key "direct" (SUPPLY FAN / DRIVE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-2 FAN.volts: key "460" V (MOTOR / VOLTAGE (V)) — cell "PLENUM 20 17.34 460 DIRECT II 1 FAN" is not a standard voltage
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.qty: key "1" (SUPPLY FAN / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.service: key "ACU-A-3" (SERVICE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.cfm: key "28030" cfm (SUPPLY FAN / AIR FLOW (CFM)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.motor_hp: key "40" hp (MOTOR / MOTOR NAMEPLATE HORSE POWER (MHP)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.rpm: key "1170" rpm (MOTOR / RPM) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.drive: key "direct" (SUPPLY FAN / DRIVE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-3 FAN.volts: key "460" V (MOTOR / VOLTAGE (V)) — cell "40 31.52 460 DIRECT II 1 FAN" is not a standard voltage
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.qty: key "1" (SUPPLY FAN / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.service: key "ACU-A-4" (SERVICE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.cfm: key "25600" cfm (SUPPLY FAN / AIR FLOW (CFM)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.motor_hp: key "30" hp (MOTOR / MOTOR NAMEPLATE HORSE POWER (MHP)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.rpm: key "1170" rpm (MOTOR / RPM) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.drive: key "direct" (SUPPLY FAN / DRIVE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-4 FAN.volts: key "460" V (MOTOR / VOLTAGE (V)) — cell "30 29.22 460 DIRECT II 1 FAN" is not a standard voltage
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.qty: key "1" (SUPPLY FAN / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.service: key "ACU-A-5" (SERVICE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.cfm: key "29880" cfm (SUPPLY FAN / AIR FLOW (CFM)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.motor_hp: key "40" hp (MOTOR / MOTOR NAMEPLATE HORSE POWER (MHP)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.rpm: key "1170" rpm (MOTOR / RPM) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.drive: key "direct" (SUPPLY FAN / DRIVE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-5 FAN.volts: key "460" V (MOTOR / VOLTAGE (V)) — cell "40 37.08 460 DIRECT II 1 FAN" is not a standard voltage
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.qty: key "1" (SUPPLY FAN / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.service: key "ACU-A-6" (SERVICE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.cfm: key "22770" cfm (SUPPLY FAN / AIR FLOW (CFM)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.motor_hp: key "25" hp (MOTOR / MOTOR NAMEPLATE HORSE POWER (MHP)) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.rpm: key "1170" rpm (MOTOR / RPM) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.drive: key "direct" (SUPPLY FAN / DRIVE) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | S-A-6 FAN.volts: key "460" V (MOTOR / VOLTAGE (V)) — cell "25 23.03 460 DIRECT II 1 FAN" is not a standard voltage
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-1 DUCT_MOUNTED_COIL.qty: key "2" (COIL DATA / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-2 DUCT_MOUNTED_COIL.qty: key "2" (COIL DATA / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-3 DUCT_MOUNTED_COIL.qty: key "2" (COIL DATA / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-4 DUCT_MOUNTED_COIL.qty: key "2" (COIL DATA / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-5 DUCT_MOUNTED_COIL.qty: key "2" (COIL DATA / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | HC-A-6 DUCT_MOUNTED_COIL.qty: key "2" (COIL DATA / QUANTITY) — no printed column answers it
  017_MD_NIST_Gaithersburg_Building_101_HVAC_Cooling | H-A-3 HUMIDIFIER.capacity_lb_hr: key "262" lb/hr (CAPACITY (LB/HR)) — 2 columns answer it differently: "CAPACITY (LB/HR)" = "262", "MAXIMUM CAPACITY (LB/HR)" = "375"
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.floor: key "ROOF" (GENERAL / LOCATION names a level) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.area_served: key "GROUND LEVEL" (GENERAL / SERVICE: the level the unit serves) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.supply_cfm: key "4235" cfm (SUPPLY FAN / SUPPLY AIRFLOW, CFM) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.supply_fan_hp: key "3" hp (SUPPLY FAN / MOTOR HP) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.outdoor_air_pct: key "24" % (SUPPLY FAN / % OA) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.cooling_type: key "dx" (COOLING COIL / FLUID: a refrigerant, a DX coil) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.cooling_mbh: key "128.7" MBH (COOLING COIL / GROSS / NET TOTAL MBH) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.heating_type: key "heat_pump" (PRIMARY HEAT / TYPE) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.heating_mbh: key "105.7" MBH (PRIMARY HEAT / TOTAL CAPACITY, MBH @ 47°F...: the 47 F part) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.eh_kw: key "36" kW (SECONDARY HEAT / KW) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.filter_merv: key "8" (FILTERS (SUPPLY) / TYPE: MERV) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-G RTU.phase: key "3" (ELECTRICAL / VOLTAGE: phase part) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.floor: key "ROOF" (GENERAL / LOCATION names a level) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.area_served: key "FIRST FLOOR" (GENERAL / SERVICE: the level the unit serves) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.supply_cfm: key "7000" cfm (SUPPLY FAN / SUPPLY AIRFLOW, CFM) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.supply_fan_hp: key "7.5" hp (SUPPLY FAN / MOTOR HP) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.exhaust_fan_hp: key "1.5" hp (EXHAUST FAN / HP: each fan's motor ("(2)@1.5": two fans at 1.5 hp)) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.outdoor_air_pct: key "25" % (SUPPLY FAN / % OA) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.cooling_type: key "dx" (COOLING COIL / FLUID: a refrigerant, a DX coil) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.cooling_mbh: key "251.2" MBH (COOLING COIL / GROSS / NET TOTAL MBH) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.heating_type: key "heat_pump" (PRIMARY HEAT / TYPE) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.heating_mbh: key "218" MBH (PRIMARY HEAT / TOTAL CAPACITY, MBH @ 47°F...: the 47 F part) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.eh_kw: key "75" kW (SECONDARY HEAT / KW) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.filter_merv: key "8" (FILTERS (SUPPLY) / TYPE: MERV) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-1 (ALT#2) RTU.phase: key "3" (ELECTRICAL / VOLTAGE: phase part) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.floor: key "ROOF" (GENERAL / LOCATION names a level) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.area_served: key "SECOND FLOOR" (GENERAL / SERVICE: the level the unit serves) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.supply_cfm: key "9400" cfm (SUPPLY FAN / SUPPLY AIRFLOW, CFM) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.supply_fan_hp: key "10" hp (SUPPLY FAN / MOTOR HP) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.exhaust_fan_hp: key "1.5" hp (EXHAUST FAN / HP: each fan's motor ("(2)@1.5": two fans at 1.5 hp)) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.outdoor_air_pct: key "22" % (SUPPLY FAN / % OA) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.cooling_type: key "dx" (COOLING COIL / FLUID: a refrigerant, a DX coil) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.cooling_mbh: key "293.3" MBH (COOLING COIL / GROSS / NET TOTAL MBH) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.heating_type: key "heat_pump" (PRIMARY HEAT / TYPE) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.heating_mbh: key "278" MBH (PRIMARY HEAT / TOTAL CAPACITY, MBH @ 47°F...: the 47 F part) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.eh_kw: key "75" kW (SECONDARY HEAT / KW) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.filter_merv: key "8" (FILTERS (SUPPLY) / TYPE: MERV) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | RTU-2 RTU.phase: key "3" (ELECTRICAL / VOLTAGE: phase part) — no compile item with this tag in the keyed table
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-1 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-2 VAV.cfm_heat: key "300" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-3 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-4 VAV.cfm_heat: key "160" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-5 VAV.cfm_heat: key "160" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-6 VAV.cfm_heat: key "300" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-7 VAV.cfm_heat: key "165" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-8 VAV.cfm_heat: key "360" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-9 VAV.cfm_heat: key "150" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-G-10 VAV.cfm_heat: key "600" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-1 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-2 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-3 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-4 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-5 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-6 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-7 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-8 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-9 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | VAV-2-10 VAV.cfm_heat: key "100" cfm (HEATC FM) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | EF-1 FAN.vfd: key "no" (ELECTRICAL / STARTER / CONTROLLER TYPE) — no printed column answers it
  071_ME_BGS_Project_3809_Health_Science_Center | EF-1 FAN.ecm: key "yes" (ELECTRICAL / MOTOR TYPE) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | FCU-1 FCU.heating_type: key "heat_pump" (TABLE TITLE) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | FCU-2 FCU.heating_type: key "heat_pump" (TABLE TITLE) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | FCU-3 FCU.heating_type: key "heat_pump" (TABLE TITLE) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | FCU-4 FCU.heating_type: key "heat_pump" (TABLE TITLE) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | ERV-2 ERV.recovery_type: key "wheel" (TYPE) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | ERV-2 ERV.supply_cfm: key "1230" cfm (SUPPLY FAN DATA / CFM) — 3 columns answer it differently: "SUPPLY FAN DATA CFM" = "1230", "HEAT RECOVERY SECTION WINTER PERFORMANCE SUPPLY AIR CFM" = "1230", "HEAT RECOVERY SECTION SUMMER PERFORMANCE SUPPLY AIR CFM" = "1100"
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | ERV-2 ERV.exhaust_cfm: key "1230" cfm (EXHAUST FAN DATA / CFM) — 2 columns answer it differently: "HEAT RECOVERY SECTION WINTER PERFORMANCE EXHAUST AIR CFM" = "1230", "HEAT RECOVERY SECTION SUMMER PERFORMANCE EXHAUST AIR CFM" = "1100"
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | ERV-2 ERV.volts: key "220" V (ELECTRICAL DATA / VOLTS) — no printed column answers it
  083_MA_Town_Offices_Facilities_HVAC_System_Upgrades | ERV-2 ERV.phase: key "1" (ELECTRICAL DATA / PHASE) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-1 VRF_INDOOR.area_served: key "OPEN OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-1 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-2 VRF_INDOOR.area_served: key "DMR OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-2 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-3 VRF_INDOOR.area_served: key "DMR OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-3 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-4 VRF_INDOOR.area_served: key "DMR MP OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-4 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-5 VRF_INDOOR.area_served: key "FISHERIES FILES & SEASONAL" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-5 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-6 VRF_INDOOR.area_served: key "FISHERIES OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-6 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-7 VRF_INDOOR.area_served: key "FISHERIES OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-7 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-8 VRF_INDOOR.area_served: key "FISHERIES OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-8 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-9 VRF_INDOOR.area_served: key "DMR SHELLFISH & SEASONAL" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-9 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-10 VRF_INDOOR.area_served: key "WET BAY" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-10 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-11 VRF_INDOOR.area_served: key "BREAK" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-11 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-12 VRF_INDOOR.area_served: key "HALL" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-12 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-13 VRF_INDOOR.area_served: key "WILDLIFE OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-13 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-14 VRF_INDOOR.area_served: key "WILDLIFE OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-14 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-15 VRF_INDOOR.area_served: key "WARDEN SERVICE" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-15 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-16 VRF_INDOOR.area_served: key "WILDLIFE OFF" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-16 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-17 VRF_INDOOR.area_served: key "CONFERENCE RM" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-17 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-18 VRF_INDOOR.area_served: key "CORRIDOR" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-18 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-19 VRF_INDOOR.area_served: key "DRY BAY" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-19 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-20 VRF_INDOOR.area_served: key "BUNKS" (Space: Name: the room the unit serves) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | IU-20 VRF_INDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-1 VRF_OUTDOOR.cooling_mbh: key "42000" BTU/H (COOLING CAPACITY) — 2 columns answer it differently: "COOLING CAPACITY" = "42000.0 Btu/h", "CORRECTED COOLING CAPACITY" = "39768.4 Btu/h"
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-1 VRF_OUTDOOR.heating_mbh: key "48000" BTU/H (HEATING CAPACITY) — 2 columns answer it differently: "HEATING CAPACITY" = "48000.0 Btu/h", "CORRECTED HEATING CAPACITY" = "44620.5 Btu/h"
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-1 VRF_OUTDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-2 VRF_OUTDOOR.cooling_mbh: key "48000" BTU/H (COOLING CAPACITY) — 2 columns answer it differently: "COOLING CAPACITY" = "48000.0 Btu/h", "CORRECTED COOLING CAPACITY" = "46272.8 Btu/h"
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-2 VRF_OUTDOOR.heating_mbh: key "54000" BTU/H (HEATING CAPACITY) — 2 columns answer it differently: "HEATING CAPACITY" = "54000.0 Btu/h", "CORRECTED HEATING CAPACITY" = "51073.1 Btu/h"
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-2 VRF_OUTDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-3 VRF_OUTDOOR.cooling_mbh: key "42000" BTU/H (COOLING CAPACITY) — 2 columns answer it differently: "COOLING CAPACITY" = "42000.0 Btu/h", "CORRECTED COOLING CAPACITY" = "40872.0 Btu/h"
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-3 VRF_OUTDOOR.heating_mbh: key "48000" BTU/H (HEATING CAPACITY) — 2 columns answer it differently: "HEATING CAPACITY" = "48000.0 Btu/h", "CORRECTED HEATING CAPACITY" = "45087.0 Btu/h"
  093_ME_BGS_Project_3845_Jonesboro_Heat_Pump_Upgrades | OU-3 VRF_OUTDOOR.bas_interface: key "CENTRAL AE-200A CONTROLLER" (NOTE 5) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | AHU-4 AHU.outdoor_air_pct: key "25" % (OA %) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | AHU-4 AHU.bas_interface: key "BACKNET" (NOTE 4, where the row's REMARKS cite it: the factory controls' BACnet interface) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CC-1 DUCT_MOUNTED_COIL.qty: key "1" (# OF COILS) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CC-2 DUCT_MOUNTED_COIL.qty: key "1" (# OF COILS) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CC-3 DUCT_MOUNTED_COIL.qty: key "1" (# OF COILS) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CC-4 DUCT_MOUNTED_COIL.qty: key "1" (# OF COILS) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HE-1 HEAT_EXCHANGER.hx_type: key "plate" (TABLE TITLE) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HE-1 HEAT_EXCHANGER.primary_medium: key "other" (TABLE TITLE) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HE-1 HEAT_EXCHANGER.secondary_medium: key "other" (TABLE TITLE) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HE-2 HEAT_EXCHANGER.hx_type: key "plate" (TABLE TITLE) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HE-2 HEAT_EXCHANGER.primary_medium: key "other" (TABLE TITLE) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HE-2 HEAT_EXCHANGER.secondary_medium: key "other" (TABLE TITLE) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | B-1 BOILER.output_mbh: key "3000" MBH (GAS BURNER / DESIGN CAPAPACITY (MBH): the boiler's design output) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | B-2 BOILER.output_mbh: key "3000" MBH (GAS BURNER / DESIGN CAPAPACITY (MBH): the boiler's design output) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HRCP-1A PUMP.glycol_pct: key "30" % (FLUID TYPE: its glycol share (WATER 0, WATER 30%PG 30)) — cell "WATER 30%PG" names no glycol percentage
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | HRCP-2A PUMP.glycol_pct: key "30" % (FLUID TYPE: its glycol share (WATER 0, WATER 30%PG 30)) — cell "WATER 30%PG" names no glycol percentage
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-1 UNIT_HEATER.motor_hp: key "0.05" hp (ELECTRICAL DATA / HP) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-1 UNIT_HEATER.volts: key "115" V (ELECTRICAL DATA / VOLT) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-1 UNIT_HEATER.phase: key "1" (ELECTRICAL DATA / PH) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-2 UNIT_HEATER.motor_hp: key "0.05" hp (ELECTRICAL DATA / HP) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-2 UNIT_HEATER.volts: key "115" V (ELECTRICAL DATA / VOLT) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-2 UNIT_HEATER.phase: key "1" (ELECTRICAL DATA / PH) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-3 UNIT_HEATER.motor_hp: key "0.05" hp (ELECTRICAL DATA / HP) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-3 UNIT_HEATER.volts: key "115" V (ELECTRICAL DATA / VOLT) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-3 UNIT_HEATER.phase: key "1" (ELECTRICAL DATA / PH) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-4 UNIT_HEATER.motor_hp: key "0.05" hp (ELECTRICAL DATA / HP) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-4 UNIT_HEATER.volts: key "115" V (ELECTRICAL DATA / VOLT) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-4 UNIT_HEATER.phase: key "1" (ELECTRICAL DATA / PH) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-5 UNIT_HEATER.motor_hp: key "0.05" hp (ELECTRICAL DATA / HP) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-5 UNIT_HEATER.volts: key "115" V (ELECTRICAL DATA / VOLT) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | CUH-5 UNIT_HEATER.phase: key "1" (ELECTRICAL DATA / PH) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-1 FCU.motor_hp: key "0.25" hp (HP: each motor ("(2) 1/4": two motors at 1/4 hp)) — cell "(2) 1/4" is not one number
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-1 FCU.fan_speeds: key "3" (NOTE 3, where the row's REMARKS cite it: PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER, its speeds) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-1 FCU.ecm: key "yes" (NOTE 3, where the row's REMARKS cite it: PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER, an EC motor) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-2 FCU.motor_hp: key "0.25" hp (HP: each motor ("(2) 1/4": two motors at 1/4 hp)) — cell "(2) 1/4" is not one number
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-2 FCU.fan_speeds: key "3" (NOTE 3, where the row's REMARKS cite it: PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER, its speeds) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-2 FCU.ecm: key "yes" (NOTE 3, where the row's REMARKS cite it: PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER, an EC motor) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-3 FCU.motor_hp: key "0.25" hp (HP: each motor ("(2) 1/4": two motors at 1/4 hp)) — cell "(2) 1/4" is not one number
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-3 FCU.fan_speeds: key "3" (NOTE 3, where the row's REMARKS cite it: PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER, its speeds) — no printed column answers it
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set | FCU-3 FCU.ecm: key "yes" (NOTE 3, where the row's REMARKS cite it: PROVIDE 3-SPEED EC MOTOR W/ POTENTIOMETER, an EC motor) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | DOAS-30 DOAS.supply_cfm: key "200" cfm (CAPACITY: its airflow part ("200 CFM @ 0.5" ESP")) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | EH-20 UNIT_HEATER.heating_medium: key "electric" (TYPE) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | EH-20 UNIT_HEATER.eh_kw: key "2250" W (ELECTRICAL / WATTS) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | EH-30 UNIT_HEATER.heating_medium: key "electric" (TYPE) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | EH-30 UNIT_HEATER.eh_kw: key "2500" W (ELECTRICAL / WATTS) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | REF-1 FAN.motor_hp: key "3" hp (ELECTRICAL / HP) — 2 columns answer it differently: "BRAKE HP" = "2.8", "ELECTRICAL HP" = "3"
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | REF-1 FAN.control: key "DUCT SP" (CONTROL) — no printed column answers it
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | REF-2 FAN.motor_hp: key "0.75" hp (ELECTRICAL / HP) — 2 columns answer it differently: "BRAKE HP" = "0.63", "ELECTRICAL HP" = "0.75"
  25_WA_DouglasCounty_Courthouse_HVAC_DDC | REF-2 FAN.control: key "DUCT SP" (CONTROL) — no printed column answers it

compile items in keyed tables that match no keyed instance:
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" 2.25 (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" 3.5 (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" 24% (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" 60.0 (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" 105.7 (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" COIL FACE VELOCITY FPM (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" COOLING COIL (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" CURB (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" DISCHARGE ORIENTATION (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" EAT °F (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" ELECTRICAL (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" ESP, in.wc. (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" EXHAUST FAN (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" FACE AREA, SQ FT (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" FILTERS (SUPPLY) (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" FINS PER INCH (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" FLA (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" FLUID (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" GROSS (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" HP (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" KW (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" LAT °F (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" LVG. AIR, DB (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" MAX-BHP (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" MFS (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" MOTOR HP (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" NET SENSIBLE MBH (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" NET TOTAL MBH (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" PEAK OUTSIDE AIRFLOW, cfm (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" PRIMARY HEAT (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" ROWS (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" SD INSTALLED IN DUCT BY (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" SD WIRED TO FIRE ALARM BY (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" SD WIRED TO HVAC CONTROLS BY (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" SECONDARY HEAT (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" STAGES (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" SUPPLY FAN (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" UNIT MCA (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" VFD'S FURNISHED BY (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" VOLTAGE (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" WB (RTU), 0 value(s)
  071_ME_BGS_Project_3809_Health_Science_Center "PACKAGED ROOF TOP UNIT SCHEDULE" WEIGHT (LBS) W (RTU), 0 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-25 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-26 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-27 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-28 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-29 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-30 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-2-31 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-1 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-2 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-3 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-4 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-5 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-6 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-7 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-8 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-9 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-10 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-11 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-12 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-13 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-14 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-15 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-16 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-17 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-18 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-19 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-20 (VAV), 11 value(s)
  096_IN_Vermillion_County_Jail_Mechanical_Bid_Set "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE" VAV-4-21 (VAV), 11 value(s)

GATE 2 (dev3): exact 83.5% (need >= 98.0%) FAIL · wrong 0.4% (need <= 0.5%) ok · invented 24 (need = 0) FAIL → FAIL
```
