# Attribute eval — dev4

```
ATTRIBUTE EVAL (instrument 2) — dev4, normalizer: normalize.ts
key instances matched to a compile item: 128/154; out-of-key-scope compile items in keyed tables: 1; unscored values (extensions): 0

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  3519    1421   1020      1    400      2 |  2098   2096      0 |  71.8%   0.1%
  slice: grid                        3185    1089    804      0    285      2 |  2096   2094      0 |  73.8%   0.0%
  slice: reading                      287     287    183      1    103      0 |     0      0      0 |  63.8%   0.3%
  slice: notes                         47      45     33      0     12      0 |     2      2      0 |  73.3%   0.0%

per family
  FCU                                1110     559    199      0    360      0 |   551    551      0 |  35.6%   0.0%
  VAV                                 736     332    332      0      0      0 |   404    404      0 | 100.0%   0.0%
  PUMP                                300     111     97      0     14      2 |   189    187      0 |  87.4%   0.0%
  FAN                                 192      83     66      0     17      0 |   109    109      0 |  79.5%   0.0%
  VRF_INDOOR                          240      71     71      0      0      0 |   169    169      0 | 100.0%   0.0%
  DOAS                                225      70     70      0      0      0 |   155    155      0 | 100.0%   0.0%
  HEAT_PUMP                           320      64     64      0      0      0 |   256    256      0 | 100.0%   0.0%
  UNIT_HEATER                         170      56     56      0      0      0 |   114    114      0 | 100.0%   0.0%
  AHU                                  90      34     24      1      9      0 |    56     56      0 |  70.6%   2.9%
  HEAT_EXCHANGER                       36      13     13      0      0      0 |    23     23      0 | 100.0%   0.0%
  CONDENSING_UNIT                      60      10     10      0      0      0 |    50     50      0 | 100.0%   0.0%
  AIR_COOLED_CHILLER                   14       8      8      0      0      0 |     6      6      0 | 100.0%   0.0%
  BOILER                               15       8      8      0      0      0 |     7      7      0 | 100.0%   0.0%
  ERV                                  11       2      2      0      0      0 |     9      9      0 | 100.0%   0.0%

per set
  028_TX_Renovation_of_Building_61    936     487    283      0    204      0 |   449    449      0 |  58.1%   0.0%
  01_NY_VA_Northport_Dialysis_100C    620     320    319      1      0      0 |   300    300      0 |  99.7%   0.3%
  030_NY_VA_EHRM_Infrastructure_Up    688     246     76      0    170      0 |   442    442      0 |  30.9%   0.0%
  089_FL_Airport_Terminal_and_Hang    504     161    144      0     17      0 |   343    343      0 |  89.4%   0.0%
  011_IL_VA_Hines_Finance_Center_R    300      60     60      0      0      0 |   240    240      0 | 100.0%   0.0%
  033_MN_VA_Project_656_18_301_Con    123      56     47      0      9      2 |    67     65      0 |  83.9%   0.0%
  26_CA_TransbayTower_Mechanical_6    161      32     32      0      0      0 |   129    129      0 | 100.0%   0.0%
  22_GA_Valdosta_FireStation8_100C    139      30     30      0      0      0 |   109    109      0 | 100.0%   0.0%
  067_CA_SLAC_LCLS_II_HE_Process_C     48      29     29      0      0      0 |    19     19      0 | 100.0%   0.0%

per attribute
  phase                               152     114     87      0     27      0 |    38     38      0 |  76.3%   0.0%
  volts                               152      91     76      0     15      0 |    61     61      0 |  83.5%   0.0%
  cfm                                  90      85     57      0     28      0 |     5      5      0 |  67.1%   0.0%
  motor_hp                            142      77     49      0     28      0 |    65     65      0 |  63.6%   0.0%
  hw_gpm                              117      51     39      0     12      0 |    66     66      0 |  76.5%   0.0%
  hw_wpd_ft                            76      51     39      0     12      0 |    25     25      0 |  76.5%   0.0%
  hw_ewt_f                            117      48     36      0     12      0 |    69     69      0 |  75.0%   0.0%
  hw_lwt_f                            117      48     36      0     12      0 |    69     69      0 |  75.0%   0.0%
  hw_mbh                               76      48     36      0     12      0 |    28     28      0 |  75.0%   0.0%
  cooling_type                         44      44     19      0     25      0 |     0      0      0 |  43.2%   0.0%
  area_served                         154      42     30      0     12      0 |   112    112      0 |  71.4%   0.0%
  chw_ewt_f                            76      42     17      0     25      0 |    34     34      0 |  40.5%   0.0%
  chw_gpm                              76      42     17      0     25      0 |    34     34      0 |  40.5%   0.0%
  chw_lwt_f                            76      42     17      0     25      0 |    34     34      0 |  40.5%   0.0%
  chw_wpd_ft                           44      41     16      0     25      0 |     3      3      0 |  39.0%   0.0%
  chw_mbh                              44      37     12      0     25      0 |     7      7      0 |  32.4%   0.0%
  pipes                                37      37     12      0     25      0 |     0      0      0 |  32.4%   0.0%
  heating_mbh                          48      35     34      0      1      0 |    13     13      0 |  97.1%   0.0%
  cfm_max                              32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm_min                              32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  inlet_size_in                        32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  terminal_type                        32      32     32      0      0      0 |     0      0      0 | 100.0%   0.0%
  heating_type                         44      30     17      0     13      0 |    14     14      0 |  56.7%   0.0%
  cfm_heat                             32      25     25      0      0      0 |     7      7      0 | 100.0%   0.0%
  heat_type                            32      25     25      0      0      0 |     7      7      0 | 100.0%   0.0%
  hw_conn_in                           76      25     25      0      0      0 |    51     51      0 | 100.0%   0.0%
  cooling_mbh                          38      21     20      0      1      0 |    17     17      0 |  95.2%   0.0%
  gpm                                  21      21     21      0      0      0 |     0      0      0 | 100.0%   0.0%
  head_ft                              20      20      6      0     14      0 |     0      0      0 |  30.0%   0.0%
  rpm                                  32      16     13      0      3      0 |    16     16      0 |  81.3%   0.0%
  fan_speeds                           37      14      1      0     13      0 |    23     23      0 |   7.1%   0.0%
  esp_in                               12      11     11      0      0      0 |     1      1      0 | 100.0%   0.0%
  eh_kw                               118      10     10      0      0      0 |   108    108      0 | 100.0%   0.0%
  heating_medium                       10      10     10      0      0      0 |     0      0      0 | 100.0%   0.0%
  drive                                12       8      6      0      2      0 |     4      4      0 |  75.0%   0.0%
  supply_cfm                            8       8      7      0      1      0 |     0      0      0 |  87.5%   0.0%
  supply_fan_hp                         8       7      6      0      1      0 |     1      1      0 |  85.7%   0.0%
  control                              12       6      3      0      3      0 |     6      6      0 |  50.0%   0.0%
  filter_merv                           7       6      6      0      0      0 |     1      1      0 | 100.0%   0.0%
  vfd                                  39       6      5      0      1      2 |    33     31      0 |  83.3%   0.0%
  bas_interface                        40       5      5      0      0      0 |    35     35      0 | 100.0%   0.0%
  floor                               154       5      5      0      0      0 |   149    149      0 | 100.0%   0.0%
  service                              32       4      4      0      0      0 |    28     28      0 | 100.0%   0.0%
  exhaust_fan_hp                        8       3      3      0      0      0 |     5      5      0 | 100.0%   0.0%
  pump_arrangement                     20       3      3      0      0      0 |    17     17      0 | 100.0%   0.0%
  humidifier                            7       2      2      0      0      0 |     5      5      0 | 100.0%   0.0%
  oa_cfm_min                            7       2      1      1      0      0 |     5      5      0 |  50.0%  50.0%
  primary_medium                        2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_medium                      2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  supply_fan_qty                        7       2      1      0      1      0 |     5      5      0 |  50.0%   0.0%
  capacity_mbh                          2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  condenser                             1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  economizer                            7       1      1      0      0      0 |     6      6      0 | 100.0%   0.0%
  ewt_f                                 1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  exhaust_cfm                           1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  hx_type                               2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  input_mbh                             1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  lwt_f                                 1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  primary_ewt_f                         2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  primary_gpm                           2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  primary_lwt_f                         2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  return_fan_hp                         7       1      0      0      1      0 |     6      6      0 |   0.0%   0.0%
  secondary_ewt_f                       2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  secondary_gpm                         2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  secondary_lwt_f                       2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  steam_lb_hr                          17       1      1      0      0      0 |    16     16      0 | 100.0%   0.0%
  steam_psig                           17       1      1      0      0      0 |    16     16      0 | 100.0%   0.0%
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

GATE 2 (dev4): exact 71.8% (need >= 98.0%) FAIL · wrong 0.1% (need <= 0.5%) ok · invented 0 (need = 0) ok → FAIL
```
