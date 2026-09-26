# Attribute eval — dev4

```
ATTRIBUTE EVAL (instrument 2) — dev4, normalizer: normalize.ts
key instances matched to a compile item: 128/154; out-of-key-scope compile items in keyed tables: 1; unscored values (extensions): 0

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  3519    1421    934     13    474      2 |  2098   2093      3 |  65.7%   0.9%
  slice: grid                        3185    1089    781      4    304      2 |  2096   2091      3 |  71.7%   0.4%
  slice: reading                      287     287    138      9    140      0 |     0      0      0 |  48.1%   3.1%
  slice: notes                         47      45     15      0     30      0 |     2      2      0 |  33.3%   0.0%

per family
  FCU                                1110     559    175      0    384      0 |   551    551      0 |  31.3%   0.0%
  VAV                                 736     332    321      7      4      0 |   404    404      0 |  96.7%   2.1%
  PUMP                                300     111     90      0     21      2 |   189    187      0 |  81.1%   0.0%
  FAN                                 192      83     62      2     19      0 |   109    109      0 |  74.7%   2.4%
  VRF_INDOOR                          240      71     68      2      1      0 |   169    169      0 |  95.8%   2.8%
  DOAS                                225      70     62      1      7      0 |   155    154      1 |  88.6%   1.4%
  HEAT_PUMP                           320      64     62      0      2      0 |   256    256      0 |  96.9%   0.0%
  UNIT_HEATER                         170      56     54      0      2      0 |   114    114      0 |  96.4%   0.0%
  AHU                                  90      34     17      1     16      0 |    56     54      2 |  50.0%   2.9%
  HEAT_EXCHANGER                       36      13      1      0     12      0 |    23     23      0 |   7.7%   0.0%
  CONDENSING_UNIT                      60      10      6      0      4      0 |    50     50      0 |  60.0%   0.0%
  AIR_COOLED_CHILLER                   14       8      8      0      0      0 |     6      6      0 | 100.0%   0.0%
  BOILER                               15       8      6      0      2      0 |     7      7      0 |  75.0%   0.0%
  ERV                                  11       2      2      0      0      0 |     9      9      0 | 100.0%   0.0%

per set
  028_TX_Renovation_of_Building_61    936     487    254      0    233      0 |   449    449      0 |  52.2%   0.0%
  01_NY_VA_Northport_Dialysis_100C    620     320    312      1      7      0 |   300    300      0 |  97.5%   0.3%
  030_NY_VA_EHRM_Infrastructure_Up    688     246     70      0    176      0 |   442    442      0 |  28.5%   0.0%
  089_FL_Airport_Terminal_and_Hang    504     161    132      5     24      0 |   343    342      1 |  82.0%   3.1%
  011_IL_VA_Hines_Finance_Center_R    300      60     60      0      0      0 |   240    240      0 | 100.0%   0.0%
  033_MN_VA_Project_656_18_301_Con    123      56     46      0     10      2 |    67     63      2 |  82.1%   0.0%
  26_CA_TransbayTower_Mechanical_6    161      32     21      7      4      0 |   129    129      0 |  65.6%  21.9%
  22_GA_Valdosta_FireStation8_100C    139      30     26      0      4      0 |   109    109      0 |  86.7%   0.0%
  067_CA_SLAC_LCLS_II_HE_Process_C     48      29     13      0     16      0 |    19     19      0 |  44.8%   0.0%

per attribute
  phase                               152     114     72      1     41      0 |    38     38      0 |  63.2%   0.9%
  volts                               152      91     72      1     18      0 |    61     61      0 |  79.1%   1.1%
  cfm                                  90      85     55      0     30      0 |     5      5      0 |  64.7%   0.0%
  motor_hp                            142      77     49      0     28      0 |    65     65      0 |  63.6%   0.0%
  hw_gpm                              117      51     39      0     12      0 |    66     66      0 |  76.5%   0.0%
  hw_wpd_ft                            76      51     39      0     12      0 |    25     25      0 |  76.5%   0.0%
  hw_ewt_f                            117      48     36      0     12      0 |    69     69      0 |  75.0%   0.0%
  hw_lwt_f                            117      48     36      0     12      0 |    69     69      0 |  75.0%   0.0%
  hw_mbh                               76      48     36      0     12      0 |    28     28      0 |  75.0%   0.0%
  cooling_type                         44      44     18      0     26      0 |     0      0      0 |  40.9%   0.0%
  area_served                         154      42     30      0     12      0 |   112    112      0 |  71.4%   0.0%
  chw_ewt_f                            76      42     17      0     25      0 |    34     34      0 |  40.5%   0.0%
  chw_gpm                              76      42     17      0     25      0 |    34     34      0 |  40.5%   0.0%
  chw_lwt_f                            76      42     17      0     25      0 |    34     34      0 |  40.5%   0.0%
  chw_wpd_ft                           44      41     16      0     25      0 |     3      3      0 |  39.0%   0.0%
  chw_mbh                              44      37     12      0     25      0 |     7      7      0 |  32.4%   0.0%
  pipes                                37      37      0      0     37      0 |     0      0      0 |   0.0%   0.0%
  heating_mbh                          48      35     31      0      4      0 |    13     13      0 |  88.6%   0.0%
  cfm_max                              32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm_min                              32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  inlet_size_in                        32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  terminal_type                        32      32     25      7      0      0 |     0      0      0 |  78.1%  21.9%
  heating_type                         44      30     12      1     17      0 |    14     14      0 |  40.0%   3.3%
  cfm_heat                             32      25     25      0      0      0 |     7      7      0 | 100.0%   0.0%
  heat_type                            32      25     25      0      0      0 |     7      7      0 | 100.0%   0.0%
  hw_conn_in                           76      25     25      0      0      0 |    51     51      0 | 100.0%   0.0%
  cooling_mbh                          38      21     18      0      3      0 |    17     17      0 |  85.7%   0.0%
  gpm                                  21      21     19      0      2      0 |     0      0      0 |  90.5%   0.0%
  head_ft                              20      20      4      0     16      0 |     0      0      0 |  20.0%   0.0%
  rpm                                  32      16     13      0      3      0 |    16     16      0 |  81.3%   0.0%
  fan_speeds                           37      14      0      0     14      0 |    23     23      0 |   0.0%   0.0%
  esp_in                               12      11     11      0      0      0 |     1      1      0 | 100.0%   0.0%
  eh_kw                               118      10      9      0      1      0 |   108    108      0 |  90.0%   0.0%
  heating_medium                       10      10      8      0      2      0 |     0      0      0 |  80.0%   0.0%
  drive                                12       8      6      0      2      0 |     4      4      0 |  75.0%   0.0%
  supply_cfm                            8       8      6      0      2      0 |     0      0      0 |  75.0%   0.0%
  supply_fan_hp                         8       7      4      0      3      0 |     1      1      0 |  57.1%   0.0%
  control                              12       6      3      2      1      0 |     6      6      0 |  50.0%  33.3%
  filter_merv                           7       6      5      0      1      0 |     1      1      0 |  83.3%   0.0%
  vfd                                  39       6      5      0      1      2 |    33     31      0 |  83.3%   0.0%
  bas_interface                        40       5      5      0      0      0 |    35     35      0 | 100.0%   0.0%
  floor                               154       5      1      0      4      0 |   149    149      0 |  20.0%   0.0%
  service                              32       4      4      0      0      0 |    28     28      0 | 100.0%   0.0%
  exhaust_fan_hp                        8       3      3      0      0      0 |     5      5      0 | 100.0%   0.0%
  pump_arrangement                     20       3      0      0      3      0 |    17     17      0 |   0.0%   0.0%
  humidifier                            7       2      1      0      1      0 |     5      5      0 |  50.0%   0.0%
  oa_cfm_min                            7       2      1      1      0      0 |     5      4      1 |  50.0%  50.0%
  primary_medium                        2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  secondary_medium                      2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  supply_fan_qty                        7       2      0      0      2      0 |     5      5      0 |   0.0%   0.0%
  capacity_mbh                          2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  condenser                             1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  economizer                            7       1      1      0      0      0 |     6      6      0 | 100.0%   0.0%
  ewt_f                                 1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  exhaust_cfm                           1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  hx_type                               2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  input_mbh                             1       1      0      0      1      0 |     0      0      0 |   0.0%   0.0%
  lwt_f                                 1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            1       1      0      0      1      0 |     0      0      0 |   0.0%   0.0%
  primary_ewt_f                         2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  primary_gpm                           2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  primary_lwt_f                         2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  return_fan_hp                         7       1      0      0      1      0 |     6      6      0 |   0.0%   0.0%
  secondary_ewt_f                       2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  secondary_gpm                         2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  secondary_lwt_f                       2       1      0      0      1      0 |     1      1      0 |   0.0%   0.0%
  steam_lb_hr                          17       1      1      0      0      0 |    16     15      1 | 100.0%   0.0%
  steam_psig                           17       1      1      0      0      0 |    16     15      1 | 100.0%   0.0%
  tons                                  1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  building                            154       0      0      0      0      0 |   154    154      0 |    —      —  
  chw_conn_in                          44       0      0      0      0      0 |    44     44      0 |    —      —  
  chw_glycol_pct                       44       0      0      0      0      0 |    44     44      0 |    —      —  
  chw_rows                             44       0      0      0      0      0 |    44     44      0 |    —      —  
  conn_in                              63       0      0      0      0      0 |    63     63      0 |    —      —  
  cooling_tons                         38       0      0      0      0      0 |    38     38      0 |    —      —  
  dx_stages                             7       0      0      0      0      0 |     7      7      0 |    —      —  
  ecm                                  81       0      0      0      0      0 |    81     81      0 |    —      —  
  eh_stages                            32       0      0      0      0      0 |    32     32      0 |    —      —  
  energy_recovery                       7       0      0      0      0      0 |     7      7      0 |    —      —  
  fuel                                  1       0      0      0      0      0 |     1      1      0 |    —      —  
  gas_input_mbh                         7       0      0      0      0      0 |     7      7      0 |    —      —  
  glycol_pct                           20       0      0      0      0      0 |    20     20      0 |    —      —  
  hw_glycol_pct                        76       0      0      0      0      0 |    76     76      0 |    —      —  
  hw_rows                              76       0      0      0      0      0 |    76     76      0 |    —      —  
  kw_input                              1       0      0      0      0      0 |     1      1      0 |    —      —  
  motor_watts                          12       0      0      0      0      0 |    12     12      0 |    —      —  
  outdoor_air_pct                       7       0      0      0      0      0 |     7      7      0 |    —      —  
  primary_conn_in                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_lb_hr                   2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_psig                    2       0      0      0      0      0 |     2      2      0 |    —      —  
  qty                                 122       0      0      0      0      0 |   122    122      0 |    —      —  
  recovery_type                         1       0      0      0      0      0 |     1      1      0 |    —      —  
  secondary_conn_in                     2       0      0      0      0      0 |     2      2      0 |    —      —  

key instances with no compile item (26):
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 1-1 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 1-2 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-2 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-3 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-4 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-5 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-6 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-7 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-9 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-10 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-11 (FCU): no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans 028_TX_Renovation_of_Building_615_Final_Design_Plans.pdf#9 "CHILLED WATER FAN COIL UNIT SCHEDULE" FCC 2-12 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-01-CG06A (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-02-C106A (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-04-C203 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-05-C303 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-06-C403A (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-07-C507 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-08-C607 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-09-DC6 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-10-DC7 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-11-C703 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-12-C808 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 001-FCU-13-C907 (FCU): no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction 030_NY_VA_EHRM_Infrastructure_Upgrades_Construction.pdf#84 "TWO-PIPE FAN COIL UNIT SCHEDULE" 002-FCU-01-BT03 (FCU): no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development 089_FL_Airport_Terminal_and_Hangar_Development.pdf#136 "FAN SCHEDULE" IF-1 (FAN): no compile item with this tag in the keyed table

invented (3):
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.steam_psig: key "" psig (not printed) got 5 from "STEAM HUMIDIFIER BASIS OF DESIGN STEAM PRESSURE (PSI)" = "5" [steam.pressure]
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.steam_lb_hr: key "" lb/hr (not printed) got 65.6 from "STEAM HUMIDIFIER BASIS OF DESIGN FLOW (LBS/HR)" = "65.6" [steam.flow]
  089_FL_Airport_Terminal_and_Hangar_Development | DOAS-1 DOAS.oa_cfm_min: key "" cfm (not printed) got 1010 from "TOTAL OUTSIDE AIR (CFM)" = "1,010" [airflow.outdoor_air]

wrong (13):
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.oa_cfm_min: key "2185" cfm (OA CFM: the normal-mode row (4), the unit's minimum outside air) got 5465 from "OA CFM" = "5465" [airflow.outdoor_air]
  089_FL_Airport_Terminal_and_Hangar_Development | DOAS-1 DOAS.heating_type: key "heat_pump" (HEATING CAPACITY / MAX MBH AT 47°F) got "gas" from "HEATING CAPACITY HOT GAS REHEAT COIL / TYPE" = "YES / MOD." [derived.gas_heating_block]
  089_FL_Airport_Terminal_and_Hangar_Development | AC-1 VRF_INDOOR.volts: key "208" V (AIR HANDLER / VOLTS) got 460 from "HEAT PUMP UNIT VOLTS" = "460" [electrical.volts]
  089_FL_Airport_Terminal_and_Hangar_Development | AC-1 VRF_INDOOR.phase: key "1" (AIR HANDLER / PH) got 3 from "HEAT PUMP UNIT PH" = "3" [electrical.phase]
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.control: key "INTERLOCK WITH DOAS-1" (CONTROLS) got "ACCESSORIES: 1) BACKDRAFT DAMPER 2) THERMOSTAT 3) BIRDSCREEN; LINE VOLTAGE THERMOSTAT AND SUMMER/WINTER BUILT-IN FAN SWITCH" from "(table note 1)" = "MODEL NUMBERS AND FAN SELECTION ARE BASED ON GREENHECK. ACCESSORIES: 1) BACKDRAFT DAMPER 2) THERMOSTAT 3) BIRDSCREEN | PROVIDE LINE VOLTAGE THERMOSTAT AND SUMMER/WINTER BUILT-IN FAN SWITCH. FURNISH STEP-DOWN TRANSFORMER AS NECESSARY." [note.control]
  089_FL_Airport_Terminal_and_Hangar_Development | EF-2 FAN.control: key "THERMOSTAT" (CONTROLS) got "ACCESSORIES: 1) BACKDRAFT DAMPER 2) THERMOSTAT 3) BIRDSCREEN; LINE VOLTAGE THERMOSTAT AND SUMMER/WINTER BUILT-IN FAN SWITCH" from "(table note 1)" = "MODEL NUMBERS AND FAN SELECTION ARE BASED ON GREENHECK. ACCESSORIES: 1) BACKDRAFT DAMPER 2) THERMOSTAT 3) BIRDSCREEN | PROVIDE LINE VOLTAGE THERMOSTAT AND SUMMER/WINTER BUILT-IN FAN SWITCH. FURNISH STEP-DOWN TRANSFORMER AS NECESSARY." [note.control]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-2-1 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-2-2 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-2-3 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-5-1 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-X-1 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-X-2 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-X-3 VAV.terminal_type: key "exhaust" (TABLE TITLE) got "single_duct" from "(table title)" = "SINGLE DUCT CAV EXHAUST TERMINAL" [derived.title_names_terminal_type]

out_of_scope (2):
  033_MN_VA_Project_656_18_301_Construct_Replace | P-12 PUMP.vfd: key "" (not printed) got "yes" from "EQUIPMENT SERVED" = "P-12" [cross.drive_schedule_load]
  033_MN_VA_Project_656_18_301_Construct_Replace | P-13 PUMP.vfd: key "" (not printed) got "yes" from "EQUIPMENT SERVED" = "P-13" [cross.drive_schedule_load]

missed (474):
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.supply_fan_hp: key "5" hp (SUPPLY FAN DATA (NOTE 2) / HP (BHP): its HP part, 5 in both rows) — no printed column answers it
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.supply_fan_qty: key "2" (NOTE 2) — no printed column answers it
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.heating_type: key "steam" (INTEGRAL FACE AND BYPASS STEAM PREHEAT COIL) — no printed column answers it
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.humidifier: key "yes" (NOTE 1) — no printed column answers it
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.filter_merv: key "14" (FILTERS / AFTER FILTER / TYPE: the final filter's MERV) — no printed column answers it
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.volts: key "460" V (NOTE 6) — no printed column answers it
  01_NY_VA_Northport_Dialysis_100CD | AHU-1 AHU.phase: key "3" (NOTE 6) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.area_served: key "LIBRARY 101" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.hw_mbh: key "29.3" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-1 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.area_served: key "LIBRARY 101" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 1-2 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-3 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-3 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-4 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-4 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-5 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-5 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-6 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-6 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-7 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-7 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-8 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-8 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-9 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 1-9 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-1 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-1 FCU.phase: key "3" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.area_served: key "OPEN OFFICE 216" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-2 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.area_served: key "OPEN OFFICE 216" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.hw_lwt_f: key "161" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-3 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.area_served: key "OPEN OFFICE 216" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.hw_lwt_f: key "162" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-4 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.area_served: key "OPEN OFFICE 216" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.cfm: key "700" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.chw_gpm: key "6.1" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.chw_wpd_ft: key "12.93" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.chw_mbh: key "28" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.hw_gpm: key "4.9" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.hw_wpd_ft: key "6.93" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.hw_mbh: key "46.6" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-5 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.area_served: key "ROCK REHERSAL 218" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.cfm: key "700" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.chw_gpm: key "6.1" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.chw_wpd_ft: key "12.93" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.chw_mbh: key "28" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.hw_gpm: key "4.9" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.hw_wpd_ft: key "6.93" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.hw_mbh: key "46.6" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-6 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.area_served: key "ROCK REHERSAL 218" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.cfm: key "700" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.chw_gpm: key "6.1" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.chw_wpd_ft: key "12.93" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.chw_mbh: key "28" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.hw_gpm: key "4.9" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.hw_wpd_ft: key "6.93" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.hw_mbh: key "46.6" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-7 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-8 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-8 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.area_served: key "BREAK/CONFERENCE 203" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-9 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.area_served: key "BREAK/CONFERENCE 203" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-10 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.area_served: key "BREAK/CONFERENCE 203" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-11 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.area_served: key "BREAK/CONFERENCE 203" (ROOM: the rooms the unit serves) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.pipes: key "4" (NOTE 3) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.cfm: key "630" cfm (SUPPLY FAN MAX. CFM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.motor_hp: key "0.125" hp (ELECTRICAL / HP) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.cooling_type: key "chw" (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.chw_gpm: key "4.9" gpm (COOLING COIL / CHILLED WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.chw_ewt_f: key "44" F (COOLING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.chw_lwt_f: key "56" F (COOLING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.chw_wpd_ft: key "7.16" ft (COOLING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.chw_mbh: key "18.4" MBH (COOLING COIL / TOT. MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.heating_type: key "hw" (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.hw_gpm: key "3.1" gpm (HEATING COIL / HOT WATER GPM) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.hw_ewt_f: key "180" F (HEATING COIL / EWT/LWT (F): EWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.hw_lwt_f: key "160" F (HEATING COIL / EWT/LWT (F): LWT part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.hw_wpd_ft: key "5.54" ft (HEATING COIL / WATER SIDE PRESS. DROP (FT W.G.)) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.hw_mbh: key "13" MBH (HEATING COIL / TOTAL MBH) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCC 2-12 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no compile item with this tag in the keyed table
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-13 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-13 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-14 FCU.pipes: key "4" (NOTE 3) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | FCU 2-14 FCU.phase: key "1" (ELECTRICAL / VOLT-PH: phase part) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | DOAS-1 DOAS.heating_type: key "hw" (HEATING COIL / FLOW RATE (GPM)) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | DOAS-2 DOAS.heating_type: key "hw" (HEATING COIL / FLOW RATE (GPM)) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | DOAS-3 DOAS.heating_type: key "hw" (HEATING COIL / FLOW RATE (GPM)) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | B-1 BOILER.input_mbh: key "160" MBH (INPUT MBH / MAX.) — 2 columns answer it differently: "INPUT MBH MIN." = "60", "INPUT MBH MAX." = "160"
  028_TX_Renovation_of_Building_615_Final_Design_Plans | B-1 BOILER.output_mbh: key "146" MBH (OUTPUT MBH / MAX.) — 2 columns answer it differently: "OUTPUT MBH MIN." = "55", "OUTPUT MBH MAX." = "146"
  028_TX_Renovation_of_Building_615_Final_Design_Plans | UH-1 UNIT_HEATER.heating_medium: key "gas" (GAS TYPE) — no printed column answers it
  028_TX_Renovation_of_Building_615_Final_Design_Plans | UH-2 UNIT_HEATER.heating_medium: key "gas" (GAS TYPE) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-01-CG06A FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-02-C106A FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-04-C203 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-05-C303 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-06-C403A FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-07-C507 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-08-C607 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-09-DC6 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-10-DC7 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-11-C703 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.cfm: key "900" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.motor_hp: key "0.25" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.chw_lwt_f: key "60" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.chw_wpd_ft: key "3.54" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.chw_mbh: key "21000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-12-C808 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.cfm: key "1200" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.motor_hp: key "0.5" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.chw_lwt_f: key "65.4" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.chw_wpd_ft: key "4.3" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.chw_mbh: key "30000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCU-13-C907 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.pipes: key "2" (TABLE TITLE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.cfm: key "900" cfm (FAN AIR FLOW (CFM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.motor_hp: key "0.25" hp (ELECTRICAL DATA / POWER (HP)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.cooling_type: key "chw" (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.chw_gpm: key "3.5" gpm (COOLING REQUIREMENTS / FLOW (GPM)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.chw_ewt_f: key "48" F (COOLING REQUIREMENTS / EWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.chw_lwt_f: key "60" F (COOLING REQUIREMENTS / LWT (°F)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.chw_wpd_ft: key "3.54" ft (COOLING REQUIREMENTS / WPD (FT)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.chw_mbh: key "21000" BTU/H (COOLING REQUIREMENTS / MIN TOTAL CAPACITY (BTUH)) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.volts: key "115" V (ELECTRICAL DATA / VOLT) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCU-01-BT03 FCU.phase: key "1" (ELECTRICAL DATA / PHASE) — no compile item with this tag in the keyed table
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | ROME-FCU-01-G120 FCU.pipes: key "2" (TABLE TITLE) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | ROME-FCU-01-G120 FCU.fan_speeds: key "3" (ELECTRICAL DATA / SPEED CONTROL: 3-STAGE, three fan speeds) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-CU-01-ROOF CONDENSING_UNIT.cfm: key "22000" cfm (COOLING CAPACITY / AIRFLOW (CFM)) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-CU-02-ROOF CONDENSING_UNIT.cfm: key "22000" cfm (COOLING CAPACITY / AIRFLOW (CFM)) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-01-CG06A PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-02-C106A PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-04-C203 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-05-C303 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-06-C403A PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-07-C507 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-08-C607 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-09-DC6 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-10-DC7 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-11-C703 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-12-C808 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-FCP-13-C907 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 002-FCP-01-BT03 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | ROME-FCP-01-G120 PUMP.head_ft: key "10" ft (OPERATING POINT @10' WC (GPM): the head the flow is rated at) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-DHX-01 HEAT_EXCHANGER.primary_medium: key "other" (TABLE TITLE) — no printed column answers it
  030_NY_VA_EHRM_Infrastructure_Upgrades_Construction | 001-DHX-01 HEAT_EXCHANGER.secondary_medium: key "other" (TABLE TITLE) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.supply_cfm: key "6200" cfm (SUPPLY FAN / SUPPLY CFM) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.supply_fan_hp: key "10" hp (SUPPLY FAN / MOTOR / HP: each motor ("(2) @ 10": two motors at 10 hp)) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.supply_fan_qty: key "2" (SUPPLY FAN / NUMBER OF FANS) — 3 columns answer it differently: "SUPPLY FAN NUMBER OF FANS" = "2", "SUPPLY FAN NUMBER OF FANS 4" = "3.0", "SUPPLY FAN NUMBER OF FANS 9" = "3"
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.return_fan_hp: key "5" hp (RETURN FAN / MOTOR / HP) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.cooling_mbh: key "254" MBH (DX COIL (GEOTHERMAL HEAT PUMP) / TOTAL COOLING (MBH)) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.heating_type: key "heat_pump" (DX COIL (GEOTHERMAL HEAT PUMP)) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.heating_mbh: key "161.8" MBH (DX COIL (GEOTHERMAL HEAT PUMP) / TOTAL HEATING (MBH)) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.volts: key "208" V (ELECTRICAL / VOLTAGE) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | AHU-6 AHU.phase: key "3" (ELECTRICAL / PHASE) — no printed column answers it
  033_MN_VA_Project_656_18_301_Construct_Replace | P-13 PUMP.pump_arrangement: key "standby" (NOTE 2, where the row's NOTES cite it: STANDBY PUMP) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-PCWP-1001 PUMP.gpm: key "581.9" gpm (DESIGN FLOW (GPM)) — 3 columns answer it differently: "DESIGN FLOW (GPM)" = "581.9", "SELECTION FLOW (GPM)" = "650", "MAX FLOW (GPM)" = "677"
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-PCWP-1001 PUMP.head_ft: key "277" ft (DESIGN HEAD (FT WG/PSI): its feet of water part) — cell "277/120" is not one number
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-PCWP-1001 PUMP.pump_arrangement: key "duty_standby" (NOTE 1) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-PCWP-1002 PUMP.gpm: key "581.9" gpm (DESIGN FLOW (GPM)) — 3 columns answer it differently: "DESIGN FLOW (GPM)" = "581.9", "SELECTION FLOW (GPM)" = "650", "MAX FLOW (GPM)" = "677"
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-PCWP-1002 PUMP.head_ft: key "277" ft (DESIGN HEAD (FT WG/PSI): its feet of water part) — cell "277/120" is not one number
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-PCWP-1002 PUMP.pump_arrangement: key "duty_standby" (NOTE 1) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.hx_type: key "plate" (DESIGN PLATES (QTY): a plate exchanger) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.primary_medium: key "chw" (LOW TEMP WATER SIDE / FLUID: the source side's medium) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.secondary_medium: key "other" (HIGH TEMP WATER SIDE / FLUID: the load side's medium) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.primary_gpm: key "349.12" gpm (LOW TEMP WATER SIDE / DESIGN GPM: the source side) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.primary_ewt_f: key "45" F (LOW TEMP WATER SIDE / EWT(F): the source side) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.primary_lwt_f: key "65" F (LOW TEMP WATER SIDE / LWT(F): the source side) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.secondary_gpm: key "581.9" gpm (HIGH TEMP WATER SIDE / DESIGN GPM: the load side) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.secondary_ewt_f: key "74" F (HIGH TEMP WATER SIDE / EWT(F): the load side) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.secondary_lwt_f: key "62" F (HIGH TEMP WATER SIDE / LWT(F): the load side) — no printed column answers it
  067_CA_SLAC_LCLS_II_HE_Process_Cooling_Water_Skid | B950A-HX-PCWP-1001 HEAT_EXCHANGER.capacity_mbh: key "3462" MBH (DESIGN CAPACITY (MBH)) — 2 columns answer it differently: "DESIGN CAPACITY (MBH)" = "3462", "MAX CAPACITY (MBH)" = "3905"
  089_FL_Airport_Terminal_and_Hangar_Development | DOAS-1 DOAS.supply_cfm: key "1010" cfm (TOTAL OUTSIDE AIR (CFM): a dedicated outdoor air unit's supply airflow, all outside air) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | DOAS-1 DOAS.eh_kw: key "13" kW (HEATING CAPACITY / AUX ELEC. HTNG COIL / KW / STEPS: kW part) — cell "13 / 1" is not one number
  089_FL_Airport_Terminal_and_Hangar_Development | HP-2 HEAT_PUMP.cooling_mbh: key "90" MBH (CLNG CAP. MBH) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | HP-2 HEAT_PUMP.heating_mbh: key "78.6" MBH (HTNG CAP. MBH) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | AC-1 VRF_INDOOR.heating_mbh: key "6.4" MBH (AIR HANDLER / HEATING COIL SECTION / HEATING CAP. (MBH)) — 2 columns answer it differently: "AIR HANDLER HEATING COIL SECTION HEATING CAP. (MBH)" = "6.4", "HEAT PUMP UNIT HEATING CAP. (MBH)" = "171.9"
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.cfm: key "740" cfm (CFM) — cell "/ 10" is not one number
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.motor_hp: key "0.75" hp (MOTOR / HP) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.rpm: key "1035" rpm (FAN RPM) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.drive: key "direct" (DRIVE TYPE) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.volts: key "115" V (VOLT/ PHASE: volts part) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-1 FAN.phase: key "1" (VOLT/ PHASE: phase part) — cell "115/1" is not a phase (1 or 3)
  089_FL_Airport_Terminal_and_Hangar_Development | EF-2 FAN.cfm: key "20000" cfm (CFM) — cell "/" is not one number
  089_FL_Airport_Terminal_and_Hangar_Development | EF-2 FAN.motor_hp: key "5" hp (MOTOR / HP) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-2 FAN.rpm: key "1056" rpm (FAN RPM) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-2 FAN.volts: key "208" V (VOLT/ PHASE: volts part) — no printed column answers it
  089_FL_Airport_Terminal_and_Hangar_Development | EF-2 FAN.phase: key "3" (VOLT/ PHASE: phase part) — cell "208/3" is not a phase (1 or 3)
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.cfm: key "197667" cfm (CFM) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.motor_hp: key "2" hp (MOTOR / HP) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.rpm: key "51" rpm (FAN RPM) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.drive: key "direct" (DRIVE TYPE) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.vfd: key "yes" (CONTROLS: a VFD controller) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.control: key "MFR VFD CONTROLLER" (CONTROLS) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.volts: key "208" V (VOLT/ PHASE: volts part) — no compile item with this tag in the keyed table
  089_FL_Airport_Terminal_and_Hangar_Development | IF-1 FAN.phase: key "3" (VOLT/ PHASE: phase part) — no compile item with this tag in the keyed table
  22_GA_Valdosta_FireStation8_100CD | DOAS-1 DOAS.supply_fan_hp: key "2" hp (MOTOR HP: each motor ("2x2": two motors at 2 hp)) — cell "2x2" is not one number
  22_GA_Valdosta_FireStation8_100CD | DOAS-1 DOAS.cooling_type: key "dx" (HGRH) — no printed column answers it
  22_GA_Valdosta_FireStation8_100CD | VRHP-1 CONDENSING_UNIT.cooling_mbh: key "120" MBH (OUTDOOR UNIT / COOLING MIN. TMBH) — no printed column answers it
  22_GA_Valdosta_FireStation8_100CD | VRHP-1 CONDENSING_UNIT.heating_mbh: key "135" MBH (OUTDOOR UNIT / HEATING MIN. TMBH) — no printed column answers it
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-2-1 VAV.floor: key "LEVEL 2" (TYPICAL FLOORS: names one level) — no printed column answers it
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-2-2 VAV.floor: key "LEVEL 2" (TYPICAL FLOORS: names one level) — no printed column answers it
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-2-3 VAV.floor: key "LEVEL 2" (TYPICAL FLOORS: names one level) — no printed column answers it
  26_CA_TransbayTower_Mechanical_64Sheets | CAV-5-1 VAV.floor: key "LEVEL 5" (TYPICAL FLOORS: names one level) — no printed column answers it

compile items in keyed tables that match no keyed instance:
  089_FL_Airport_Terminal_and_Hangar_Development "OUTDOOR AIR-COOLED HEAT PUMP OR CONDENSING UNIT SCHEDULE" HP-2 (CONDENSING_UNIT), 2 value(s)

GATE 2 (dev4): exact 65.7% (need >= 98.0%) FAIL · wrong 0.9% (need <= 0.5%) FAIL · invented 3 (need = 0) FAIL → FAIL
```
