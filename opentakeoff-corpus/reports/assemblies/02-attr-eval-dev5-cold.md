# Attribute eval — dev5

```
ATTRIBUTE EVAL (instrument 2) — dev5, normalizer: normalize.ts
key instances matched to a compile item: 78/86; out-of-key-scope compile items in keyed tables: 4; unscored values (extensions): 2

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  1759     561    412      1    148      0 |  1198   1196      2 |  73.4%   0.2%
  slice: grid                        1603     406    327      0     79      0 |  1197   1195      2 |  80.5%   0.0%
  slice: reading                      138     138     76      1     61      0 |     0      0      0 |  55.1%   0.7%
  slice: notes                         18      17      9      0      8      0 |     1      1      0 |  52.9%   0.0%

per family
  PUMP                                300     141    103      0     38      0 |   159    159      0 |  73.0%   0.0%
  FAN                                 320      95     70      0     25      0 |   225    225      0 |  73.7%   0.0%
  AHU                                 270      75     63      1     11      0 |   195    194      1 |  84.0%   1.3%
  FCU                                 210      73     53      0     20      0 |   137    137      0 |  72.6%   0.0%
  VAV                                 207      61     30      0     31      0 |   146    146      0 |  49.2%   0.0%
  UNIT_HEATER                         136      34     31      0      3      0 |   102    102      0 |  91.2%   0.0%
  HEAT_EXCHANGER                       36      18      6      0     12      0 |    18     18      0 |  33.3%   0.0%
  HEAT_PUMP                            80      17     16      0      1      0 |    63     62      1 |  94.1%   0.0%
  BOILER                               30      12     12      0      0      0 |    18     18      0 | 100.0%   0.0%
  CONDENSING_UNIT                      60      10     10      0      0      0 |    50     50      0 | 100.0%   0.0%
  RTU                                  45      10      6      0      4      0 |    35     35      0 |  60.0%   0.0%
  AIR_COOLED_CHILLER                   14       5      5      0      0      0 |     9      9      0 | 100.0%   0.0%
  ERV                                  11       4      4      0      0      0 |     7      7      0 | 100.0%   0.0%
  FIN_TUBE_RADIATION                   20       3      3      0      0      0 |    17     17      0 | 100.0%   0.0%
  RADIANT_CEILING_PANEL                20       3      0      0      3      0 |    17     17      0 |   0.0%   0.0%

per set
  061_IA_Ames_Laboratory_Harley_Wi    428     177    133      1     43      0 |   251    250      1 |  75.1%   0.6%
  06_MO_NatlGuard_JeffCity_CST_Add    430     105     61      0     44      0 |   325    325      0 |  58.1%   0.0%
  009_FL_USDA_APHIS_Plant_Inspecti    299      64     59      0      5      0 |   235    235      0 |  92.2%   0.0%
  24_IA_JohnsonCounty_Courthouse      106      55     47      0      8      0 |    51     51      0 |  85.5%   0.0%
  016_NY_Alter_Repair_Building_162    145      48     47      0      1      0 |    97     97      0 |  97.9%   0.0%
  28_WA_KCHA_PublicHousing_HVAC        67      33     27      0      6      0 |    34     33      1 |  81.8%   0.0%
  10_MO_Hawthorn_PsychHospital_HVA    130      26     26      0      0      0 |   104    104      0 | 100.0%   0.0%
  032_PA_Construct_EHRM_Infrastruc     30      16      0      0     16      0 |    14     14      0 |   0.0%   0.0%
  043_FL_VA_Project_673_21_151_Rep     60      16      0      0     16      0 |    44     44      0 |   0.0%   0.0%
  097_UT_JVWTP_Chemical_Buildings_     34      14     12      0      2      0 |    20     20      0 |  85.7%   0.0%
  23_GA_MaconBibb_RecreationCenter     30       7      0      0      7      0 |    23     23      0 |   0.0%   0.0%

per attribute
  volts                                84      68     55      1     12      0 |    16     16      0 |  80.9%   1.5%
  phase                                84      67     57      0     10      0 |    17     17      0 |  85.1%   0.0%
  motor_hp                             73      40     31      0      9      0 |    33     33      0 |  77.5%   0.0%
  vfd                                  47      27      7      0     20      0 |    20     20      0 |  25.9%   0.0%
  cfm                                  44      21     20      0      1      0 |    23     23      0 |  95.2%   0.0%
  eh_kw                                42      18     14      0      4      0 |    24     24      0 |  77.8%   0.0%
  gpm                                  22      18     16      0      2      0 |     4      4      0 |  88.9%   0.0%
  rpm                                  40      17     15      0      2      0 |    23     23      0 |  88.2%   0.0%
  head_ft                              20      16     13      0      3      0 |     4      4      0 |  81.3%   0.0%
  cooling_type                         14      14      7      0      7      0 |     0      0      0 |  50.0%   0.0%
  service                              40      12     10      0      2      0 |    28     28      0 |  83.3%   0.0%
  glycol_pct                           20      11      6      0      5      0 |     9      9      0 |  54.5%   0.0%
  heating_type                         14      11      6      0      5      0 |     3      3      0 |  54.5%   0.0%
  cooling_mbh                          16      10     10      0      0      0 |     6      6      0 | 100.0%   0.0%
  heating_mbh                          24      10     10      0      0      0 |    14     14      0 | 100.0%   0.0%
  cfm_max                               9       9      0      0      9      0 |     0      0      0 |   0.0%   0.0%
  conn_in                              40       9      9      0      0      0 |    31     30      1 | 100.0%   0.0%
  heat_type                             9       9      7      0      2      0 |     0      0      0 |  77.8%   0.0%
  inlet_size_in                         9       9      0      0      9      0 |     0      0      0 |   0.0%   0.0%
  terminal_type                         9       9      0      0      9      0 |     0      0      0 |   0.0%   0.0%
  esp_in                               20       8      8      0      0      0 |    12     12      0 | 100.0%   0.0%
  heating_medium                        8       8      8      0      0      0 |     0      0      0 | 100.0%   0.0%
  supply_cfm                            8       8      6      0      2      0 |     0      0      0 |  75.0%   0.0%
  chw_gpm                              24       7      7      0      0      0 |    17     17      0 | 100.0%   0.0%
  oa_cfm_min                            7       7      5      0      2      0 |     0      0      0 |  71.4%   0.0%
  area_served                          86       6      4      0      2      0 |    80     80      0 |  66.7%   0.0%
  ecm                                  36       6      0      0      6      0 |    30     30      0 |   0.0%   0.0%
  supply_fan_hp                         8       6      5      0      1      0 |     2      2      0 |  83.3%   0.0%
  chw_ewt_f                            24       5      4      0      1      0 |    19     19      0 |  80.0%   0.0%
  chw_lwt_f                            24       5      5      0      0      0 |    19     19      0 | 100.0%   0.0%
  hw_ewt_f                             40       5      5      0      0      0 |    35     35      0 | 100.0%   0.0%
  hw_lwt_f                             40       5      5      0      0      0 |    35     35      0 | 100.0%   0.0%
  chw_glycol_pct                       14       4      4      0      0      0 |    10     10      0 | 100.0%   0.0%
  chw_wpd_ft                           14       4      4      0      0      0 |    10     10      0 | 100.0%   0.0%
  hw_gpm                               40       4      4      0      0      0 |    36     36      0 | 100.0%   0.0%
  hw_wpd_ft                            23       4      4      0      0      0 |    19     19      0 | 100.0%   0.0%
  chw_mbh                              14       3      3      0      0      0 |    11     11      0 | 100.0%   0.0%
  chw_rows                             14       3      3      0      0      0 |    11     11      0 | 100.0%   0.0%
  drive                                20       3      3      0      0      0 |    17     17      0 | 100.0%   0.0%
  hw_glycol_pct                        23       3      3      0      0      0 |    20     20      0 | 100.0%   0.0%
  hw_rows                              23       3      3      0      0      0 |    20     20      0 | 100.0%   0.0%
  capacity_mbh                          2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  chw_conn_in                          14       2      0      0      2      0 |    12     12      0 |   0.0%   0.0%
  control                              20       2      0      0      2      0 |    18     18      0 |   0.0%   0.0%
  cooling_tons                         16       2      2      0      0      0 |    14     14      0 | 100.0%   0.0%
  economizer                            7       2      1      0      1      0 |     5      5      0 |  50.0%   0.0%
  fuel                                  2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  gas_input_mbh                         7       2      2      0      0      0 |     5      5      0 | 100.0%   0.0%
  hw_conn_in                           23       2      0      0      2      0 |    21     21      0 |   0.0%   0.0%
  hw_mbh                               23       2      2      0      0      0 |    21     21      0 | 100.0%   0.0%
  hx_type                               2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  input_mbh                             2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  primary_medium                        2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  primary_steam_lb_hr                   2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  primary_steam_psig                    2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  return_fan_hp                         7       2      2      0      0      0 |     5      5      0 | 100.0%   0.0%
  secondary_ewt_f                       2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  secondary_gpm                         2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  secondary_lwt_f                       2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  secondary_medium                      2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  bas_interface                        19       1      1      0      0      0 |    18     18      0 | 100.0%   0.0%
  condenser                             1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  energy_recovery                       7       1      0      0      1      0 |     6      6      0 |   0.0%   0.0%
  exhaust_cfm                           1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  filter_merv                           7       1      0      0      1      0 |     6      6      0 |   0.0%   0.0%
  humidifier                            7       1      0      0      1      0 |     6      6      0 |   0.0%   0.0%
  qty                                  77       1      1      0      0      0 |    76     75      1 | 100.0%   0.0%
  supply_fan_qty                        7       1      0      0      1      0 |     6      6      0 |   0.0%   0.0%
  tons                                  1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  building                             86       0      0      0      0      0 |    86     86      0 |    —      —  
  cfm_heat                              9       0      0      0      0      0 |     9      9      0 |    —      —  
  cfm_min                               9       0      0      0      0      0 |     9      9      0 |    —      —  
  dx_stages                             7       0      0      0      0      0 |     7      7      0 |    —      —  
  eh_stages                             9       0      0      0      0      0 |     9      9      0 |    —      —  
  ewt_f                                 2       0      0      0      0      0 |     2      2      0 |    —      —  
  exhaust_fan_hp                        8       0      0      0      0      0 |     8      8      0 |    —      —  
  fan_speeds                            7       0      0      0      0      0 |     7      7      0 |    —      —  
  floor                                86       0      0      0      0      0 |    86     86      0 |    —      —  
  kw_input                              1       0      0      0      0      0 |     1      1      0 |    —      —  
  lwt_f                                 2       0      0      0      0      0 |     2      2      0 |    —      —  
  motor_watts                          20       0      0      0      0      0 |    20     20      0 |    —      —  
  outdoor_air_pct                       7       0      0      0      0      0 |     7      7      0 |    —      —  
  pipes                                 7       0      0      0      0      0 |     7      7      0 |    —      —  
  primary_conn_in                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_ewt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_gpm                           2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_lwt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  pump_arrangement                     20       0      0      0      0      0 |    20     20      0 |    —      —  
  recovery_type                         1       0      0      0      0      0 |     1      1      0 |    —      —  
  secondary_conn_in                     2       0      0      0      0      0 |     2      2      0 |    —      —  
  steam_lb_hr                          15       0      0      0      0      0 |    15     15      0 |    —      —  
  steam_psig                           15       0      0      0      0      0 |    15     15      0 |    —      —  

key instances with no compile item (8):
  032_PA_Construct_EHRM_Infrastructure_Upgrades 032_PA_Construct_EHRM_Infrastructure_Upgrades.pdf#3 "MECHANICAL - PUMP SCHEDULE" P-A (PUMP): no compile item with this tag in the keyed table
  032_PA_Construct_EHRM_Infrastructure_Upgrades 032_PA_Construct_EHRM_Infrastructure_Upgrades.pdf#3 "MECHANICAL - PUMP SCHEDULE" P-B (PUMP): no compile item with this tag in the keyed table
  043_FL_VA_Project_673_21_151_Replace_Air_Handling 043_FL_VA_Project_673_21_151_Replace_Air_Handling.pdf#23 "MECHANICAL EQUIPMENT SCHEDULE" HWP-1 (PUMP): no compile item with this tag in the keyed table
  043_FL_VA_Project_673_21_151_Replace_Air_Handling 043_FL_VA_Project_673_21_151_Replace_Air_Handling.pdf#23 "MECHANICAL EQUIPMENT SCHEDULE" HWP-2 (PUMP): no compile item with this tag in the keyed table
  043_FL_VA_Project_673_21_151_Replace_Air_Handling 043_FL_VA_Project_673_21_151_Replace_Air_Handling.pdf#23 "MECHANICAL EQUIPMENT SCHEDULE" CWP-9 (PUMP): no compile item with this tag in the keyed table
  043_FL_VA_Project_673_21_151_Replace_Air_Handling 043_FL_VA_Project_673_21_151_Replace_Air_Handling.pdf#23 "MECHANICAL EQUIPMENT SCHEDULE" CWP-10 (PUMP): no compile item with this tag in the keyed table
  061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building 061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building.pdf#71 "EQUIPMENT SCHEDULE" EF-2 (FAN): no compile item with this tag in the keyed table
  061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building 061_IA_Ames_Laboratory_Harley_Wilhelm_Hall_Building.pdf#71 "EQUIPMENT SCHEDULE" EF-3 (FAN): no compile item with this tag in the keyed table

GATE 2 (dev5): exact 73.4% (need >= 98.0%) FAIL · wrong 0.2% (need <= 0.5%) ok · invented 2 (need = 0) FAIL → FAIL
```
