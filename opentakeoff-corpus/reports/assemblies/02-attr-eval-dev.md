# Attribute eval — dev

```
ATTRIBUTE EVAL (instrument 2) — dev, normalizer: normalize.ts
key instances matched to a compile item: 244/244; out-of-key-scope compile items in keyed tables: 0; unscored values (extensions): 20

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  5280    2053   1967      2     84      0 |  3227   3227      0 |  95.8%   0.1%
  slice: grid                        4881    1677   1629      2     46      0 |  3204   3204      0 |  97.1%   0.1%
  slice: reading                      316     316    278      0     38      0 |     0      0      0 |  88.0%   0.0%
  slice: notes                         83      60     60      0      0      0 |    23     23      0 | 100.0%   0.0%

per family
  VAV                                1633     663    618      0     45      0 |   970    970      0 |  93.2%   0.0%
  FAN                                 480     287    272      0     15      0 |   193    193      0 |  94.8%   0.0%
  PUMP                                450     239    231      2      6      0 |   211    211      0 |  96.7%   0.8%
  DUCT_MOUNTED_COIL                   480     159    159      0      0      0 |   321    321      0 | 100.0%   0.0%
  UNIT_HEATER                         340     158    158      0      0      0 |   182    182      0 | 100.0%   0.0%
  AHU                                 450     147    135      0     12      0 |   303    303      0 |  91.8%   0.0%
  RTU                                 405     111    111      0      0      0 |   294    294      0 | 100.0%   0.0%
  FCU                                 360      63     63      0      0      0 |   297    297      0 | 100.0%   0.0%
  CONDENSING_UNIT                     220      54     54      0      0      0 |   166    166      0 | 100.0%   0.0%
  BOILER                               90      44     44      0      0      0 |    46     46      0 | 100.0%   0.0%
  FIN_TUBE_RADIATION                  160      32     32      0      0      0 |   128    128      0 | 100.0%   0.0%
  AIR_COOLED_CHILLER                   42      25     23      0      2      0 |    17     17      0 |  92.0%   0.0%
  HEAT_EXCHANGER                       36      18     18      0      0      0 |    18     18      0 | 100.0%   0.0%
  CABINET_UNIT_HEATER                  34      16     12      0      4      0 |    18     18      0 |  75.0%   0.0%
  ERV                                  22      13     13      0      0      0 |     9      9      0 | 100.0%   0.0%
  DOAS                                 45       9      9      0      0      0 |    36     36      0 | 100.0%   0.0%
  COOLING_TOWER                        15       8      8      0      0      0 |     7      7      0 | 100.0%   0.0%
  HUMIDIFIER                           18       7      7      0      0      0 |    11     11      0 | 100.0%   0.0%

per set
  federal-mech                       2096     841    841      0      0      0 |  1255   1255      0 | 100.0%   0.0%
  itd-d1-lab                          689     283    281      2      0      0 |   406    406      0 |  99.3%   0.7%
  031_MO_VA_Project_589A4_20_158_R    548     200    200      0      0      0 |   348    348      0 | 100.0%   0.0%
  bldg5406-hvac-demo                  411     145     65      0     80      0 |   266    266      0 |  44.8%   0.0%
  040_IL_VA_Solicitation_36C77623B    228     144    144      0      0      0 |    84     84      0 | 100.0%   0.0%
  004_MO_T2504_03_Interior_and_Ext    455     126    126      0      0      0 |   329    329      0 | 100.0%   0.0%
  094_FL_Orange_County_Regional_Hi    254      98     98      0      0      0 |   156    156      0 | 100.0%   0.0%
  069_ID_ITD_District_2_Laboratory    165      87     87      0      0      0 |    78     78      0 | 100.0%   0.0%
  baker-county-eoc                    217      72     72      0      0      0 |   145    145      0 | 100.0%   0.0%
  12_MT_MSU_ReidHall_Renovation       206      52     48      0      4      0 |   154    154      0 |  92.3%   0.0%
  074_CA_West_Valley_College_STEM_     11       5      5      0      0      0 |     6      6      0 | 100.0%   0.0%

per attribute
  volts                               242     135    119      0     16      0 |   107    107      0 |  88.1%   0.0%
  phase                               242     133    117      0     16      0 |   109    109      0 |  88.0%   0.0%
  hw_ewt_f                            168     101     99      0      2      0 |    67     67      0 |  98.0%   0.0%
  hw_gpm                              168     101    101      0      0      0 |    67     67      0 | 100.0%   0.0%
  hw_lwt_f                            168     101     99      0      2      0 |    67     67      0 |  98.0%   0.0%
  area_served                         244      98     95      2      1      0 |   146    146      0 |  96.9%   2.0%
  cfm                                 107      91     91      0      0      0 |    16     16      0 | 100.0%   0.0%
  motor_hp                            208      79     74      0      5      0 |   129    129      0 |  93.7%   0.0%
  cfm_max                              71      71     62      0      9      0 |     0      0      0 |  87.3%   0.0%
  cfm_min                              71      71     62      0      9      0 |     0      0      0 |  87.3%   0.0%
  inlet_size_in                        71      71     62      0      9      0 |     0      0      0 |  87.3%   0.0%
  heat_type                            71      67     67      0      0      0 |     4      4      0 | 100.0%   0.0%
  hw_wpd_ft                           103      60     60      0      0      0 |    43     43      0 | 100.0%   0.0%
  heating_mbh                          85      58     58      0      0      0 |    27     27      0 | 100.0%   0.0%
  hw_conn_in                          103      58     58      0      0      0 |    45     45      0 | 100.0%   0.0%
  hw_mbh                              103      58     58      0      0      0 |    45     45      0 | 100.0%   0.0%
  rpm                                  60      56     56      0      0      0 |     4      4      0 | 100.0%   0.0%
  vfd                                  81      40     40      0      0      0 |    41     41      0 | 100.0%   0.0%
  gpm                                  37      36     35      0      1      0 |     1      1      0 |  97.2%   0.0%
  cooling_type                         32      30     29      0      1      0 |     2      2      0 |  96.7%   0.0%
  esp_in                               30      28     28      0      0      0 |     2      2      0 | 100.0%   0.0%
  drive                                30      26     26      0      0      0 |     4      4      0 | 100.0%   0.0%
  service                              60      26     25      0      1      0 |    34     34      0 |  96.2%   0.0%
  control                              30      23     23      0      0      0 |     7      7      0 | 100.0%   0.0%
  head_ft                              30      23     22      0      1      0 |     7      7      0 |  95.7%   0.0%
  cooling_mbh                          63      22     21      0      1      0 |    41     41      0 |  95.5%   0.0%
  heating_medium                       22      22     22      0      0      0 |     0      0      0 | 100.0%   0.0%
  supply_cfm                           22      22     21      0      1      0 |     0      0      0 |  95.5%   0.0%
  eh_kw                               176      20     20      0      0      0 |   156    156      0 | 100.0%   0.0%
  floor                               244      19     19      0      0      0 |   225    225      0 | 100.0%   0.0%
  glycol_pct                           30      19     19      0      0      0 |    11     11      0 | 100.0%   0.0%
  oa_cfm_min                           20      19     18      0      1      0 |     1      1      0 |  94.7%   0.0%
  supply_fan_hp                        22      19     19      0      0      0 |     3      3      0 | 100.0%   0.0%
  conn_in                             105      18     18      0      0      0 |    87     87      0 | 100.0%   0.0%
  filter_merv                          20      18     18      0      0      0 |     2      2      0 | 100.0%   0.0%
  heating_type                         32      15     15      0      0      0 |    17     17      0 | 100.0%   0.0%
  bas_interface                        73      13     13      0      0      0 |    60     60      0 | 100.0%   0.0%
  chw_ewt_f                            78      11      9      0      2      0 |    67     67      0 |  81.8%   0.0%
  chw_lwt_f                            78      11      9      0      2      0 |    67     67      0 |  81.8%   0.0%
  qty                                 173      11     11      0      0      0 |   162    162      0 | 100.0%   0.0%
  chw_gpm                              78      10      9      0      1      0 |    68     68      0 |  90.0%   0.0%
  cooling_tons                         63      10     10      0      0      0 |    53     53      0 | 100.0%   0.0%
  ecm                                 113       8      8      0      0      0 |   105    105      0 | 100.0%   0.0%
  economizer                           20       8      8      0      0      0 |    12     12      0 | 100.0%   0.0%
  humidifier                           20       8      8      0      0      0 |    12     12      0 | 100.0%   0.0%
  chw_wpd_ft                           32       7      6      0      1      0 |    25     25      0 |  85.7%   0.0%
  ewt_f                                 7       7      7      0      0      0 |     0      0      0 | 100.0%   0.0%
  lwt_f                                 7       7      7      0      0      0 |     0      0      0 | 100.0%   0.0%
  motor_watts                          30       7      6      0      1      0 |    23     23      0 |  85.7%   0.0%
  chw_rows                             32       6      5      0      1      0 |    26     26      0 |  83.3%   0.0%
  fan_speeds                           12       6      6      0      0      0 |     6      6      0 | 100.0%   0.0%
  fuel                                  6       6      6      0      0      0 |     0      0      0 | 100.0%   0.0%
  input_mbh                             6       6      6      0      0      0 |     0      0      0 | 100.0%   0.0%
  supply_fan_qty                       20       5      5      0      0      0 |    15     15      0 | 100.0%   0.0%
  cfm_heat                             71       4      4      0      0      0 |    67     67      0 | 100.0%   0.0%
  gas_input_mbh                        20       4      4      0      0      0 |    16     16      0 | 100.0%   0.0%
  output_mbh                            6       4      4      0      0      0 |     2      2      0 | 100.0%   0.0%
  terminal_type                        71       4      4      0      0      0 |    67     67      0 | 100.0%   0.0%
  condenser                             3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  tons                                  4       3      3      0      0      0 |     1      1      0 | 100.0%   0.0%
  capacity_lb_hr                        2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  energy_recovery                      20       2      2      0      0      0 |    18     18      0 | 100.0%   0.0%
  humidifier_type                       2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  hx_type                               2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  kw_input                              3       2      2      0      0      0 |     1      1      0 | 100.0%   0.0%
  primary_medium                        2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  primary_steam_psig                    2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  pump_arrangement                     30       2      2      0      0      0 |    28     28      0 | 100.0%   0.0%
  secondary_ewt_f                       2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_gpm                         2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_lwt_f                       2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_medium                      2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  cells                                 1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  chw_glycol_pct                       32       1      1      0      0      0 |    31     31      0 | 100.0%   0.0%
  exhaust_cfm                           2       1      1      0      0      0 |     1      1      0 | 100.0%   0.0%
  exhaust_fan_hp                       22       1      1      0      0      0 |    21     21      0 | 100.0%   0.0%
  fan_hp                                1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  hw_glycol_pct                       103       1      1      0      0      0 |   102    102      0 | 100.0%   0.0%
  building                            244       0      0      0      0      0 |   244    244      0 |    —      —  
  capacity_mbh                          2       0      0      0      0      0 |     2      2      0 |    —      —  
  chw_conn_in                          32       0      0      0      0      0 |    32     32      0 |    —      —  
  chw_mbh                              32       0      0      0      0      0 |    32     32      0 |    —      —  
  dx_stages                            20       0      0      0      0      0 |    20     20      0 |    —      —  
  eh_stages                            71       0      0      0      0      0 |    71     71      0 |    —      —  
  hw_rows                             103       0      0      0      0      0 |   103    103      0 |    —      —  
  outdoor_air_pct                      20       0      0      0      0      0 |    20     20      0 |    —      —  
  pipes                                12       0      0      0      0      0 |    12     12      0 |    —      —  
  primary_conn_in                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_ewt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_gpm                           2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_lwt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_lb_hr                   2       0      0      0      0      0 |     2      2      0 |    —      —  
  recovery_type                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  return_fan_hp                        20       0      0      0      0      0 |    20     20      0 |    —      —  
  secondary_conn_in                     2       0      0      0      0      0 |     2      2      0 |    —      —  
  steam_lb_hr                          42       0      0      0      0      0 |    42     42      0 |    —      —  
  steam_psig                           42       0      0      0      0      0 |    42     42      0 |    —      —  

GATE 2 (dev): exact 95.8% (need >= 98.0%) FAIL · wrong 0.1% (need <= 0.5%) ok · invented 0 (need = 0) ok → FAIL
```
