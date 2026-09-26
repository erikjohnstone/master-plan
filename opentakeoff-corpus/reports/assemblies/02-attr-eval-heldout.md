# Attribute eval — heldout

```
ATTRIBUTE EVAL (instrument 2) — heldout, normalizer: normalize.ts
key instances matched to a compile item: 91/91; out-of-key-scope compile items in keyed tables: 0; unscored values (extensions): 33

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  2068    1008    893      0    115      0 |  1060   1058      2 |  88.6%   0.0%
  slice: grid                        1787     728    664      0     64      0 |  1059   1057      2 |  91.2%   0.0%
  slice: reading                      216     216    176      0     40      0 |     0      0      0 |  81.5%   0.0%
  slice: notes                         65      64     53      0     11      0 |     1      1      0 |  82.8%   0.0%

per family
  VAV                                 621     378    351      0     27      0 |   243    243      0 |  92.9%   0.0%
  FCU                                 300     148    138      0     10      0 |   152    150      2 |  93.2%   0.0%
  PUMP                                240     128    116      0     12      0 |   112    112      0 |  90.6%   0.0%
  RTU                                 180      68     56      0     12      0 |   112    112      0 |  82.4%   0.0%
  DOAH_UNIT                            90      44     30      0     14      0 |    46     46      0 |  68.2%   0.0%
  FAN                                  80      39     33      0      6      0 |    41     41      0 |  84.6%   0.0%
  AHU                                  90      28     24      0      4      0 |    62     62      0 |  85.7%   0.0%
  BOILER                               45      24     23      0      1      0 |    21     21      0 |  95.8%   0.0%
  HEAT_RECOVERY_CHILLER                34      22     14      0      8      0 |    12     12      0 |  63.6%   0.0%
  CABINET_UNIT_HEATER                  34      20     18      0      2      0 |    14     14      0 |  90.0%   0.0%
  DOAH_HANDLING                        45      19     13      0      6      0 |    26     26      0 |  68.4%   0.0%
  CRAH                                 40      18     14      0      4      0 |    22     22      0 |  77.8%   0.0%
  AIR_COOLED_CHILLER                   28      14     14      0      0      0 |    14     14      0 | 100.0%   0.0%
  HEAT_PUMP                            40      13      7      0      6      0 |    27     27      0 |  53.8%   0.0%
  DEHUMIDIFIER                        120      12     12      0      0      0 |   108    108      0 | 100.0%   0.0%
  COOLING_TOWER                        15      10      8      0      2      0 |     5      5      0 |  80.0%   0.0%
  UNIT_HEATER                          17      10      9      0      1      0 |     7      7      0 |  90.0%   0.0%
  CONDENSING_UNIT                      40       8      8      0      0      0 |    32     32      0 | 100.0%   0.0%
  HUMIDIFIER                            9       5      5      0      0      0 |     4      4      0 | 100.0%   0.0%

per set
  navfac-cherry-point-atc            1671     835    753      0     82      0 |   836    834      2 |  90.2%   0.0%
  024_MO_E2508_01_Replace_Steam_He    180      68     56      0     12      0 |   112    112      0 |  82.4%   0.0%
  30_WA_SpokaneTransit_CoolingTowe     75      47     39      0      8      0 |    28     28      0 |  83.0%   0.0%
  060_XX_ASC_Open_Mechanical_Compe     70      30     26      0      4      0 |    40     40      0 |  86.7%   0.0%
  018_GA_USDA_ARS_U_S_National_Pou     36      15     11      0      4      0 |    21     21      0 |  73.3%   0.0%
  bessemer                             36      13      8      0      5      0 |    23     23      0 |  61.5%   0.0%

per attribute
  volts                                91      90     86      0      4      0 |     1      1      0 |  95.6%   0.0%
  phase                                91      89     86      0      3      0 |     2      2      0 |  96.6%   0.0%
  motor_hp                             73      61     59      0      2      0 |    12     10      2 |  96.7%   0.0%
  hw_ewt_f                             63      39     37      0      2      0 |    24     24      0 |  94.9%   0.0%
  hw_gpm                               63      39     36      0      3      0 |    24     24      0 |  92.3%   0.0%
  ecm                                  42      37     37      0      0      0 |     5      5      0 | 100.0%   0.0%
  hw_wpd_ft                            46      34     33      0      1      0 |    12     12      0 |  97.1%   0.0%
  hw_conn_in                           46      31      4      0     27      0 |    15     15      0 |  12.9%   0.0%
  hw_mbh                               46      31     31      0      0      0 |    15     15      0 | 100.0%   0.0%
  cfm_max                              27      27     27      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm_min                              27      27     27      0      0      0 |     0      0      0 | 100.0%   0.0%
  heat_type                            27      27     27      0      0      0 |     0      0      0 | 100.0%   0.0%
  inlet_size_in                        27      27     27      0      0      0 |     0      0      0 | 100.0%   0.0%
  terminal_type                        27      27     27      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm                                  30      21     11      0     10      0 |     9      9      0 |  52.4%   0.0%
  chw_ewt_f                            35      21     21      0      0      0 |    14     14      0 | 100.0%   0.0%
  chw_gpm                              35      21     21      0      0      0 |    14     14      0 | 100.0%   0.0%
  vfd                                  31      21     16      0      5      0 |    10     10      0 |  76.2%   0.0%
  gpm                                  20      20     19      0      1      0 |     0      0      0 |  95.0%   0.0%
  service                              21      20     19      0      1      0 |     1      1      0 |  95.0%   0.0%
  chw_lwt_f                            35      19     19      0      0      0 |    16     16      0 | 100.0%   0.0%
  cooling_type                         19      19     19      0      0      0 |     0      0      0 | 100.0%   0.0%
  heating_type                         19      17     17      0      0      0 |     2      2      0 | 100.0%   0.0%
  head_ft                              16      16     16      0      0      0 |     0      0      0 | 100.0%   0.0%
  chw_wpd_ft                           19      15     15      0      0      0 |     4      4      0 | 100.0%   0.0%
  cooling_mbh                          21      15     12      0      3      0 |     6      6      0 |  80.0%   0.0%
  heating_mbh                          24      14     11      0      3      0 |    10     10      0 |  78.6%   0.0%
  chw_conn_in                          19      10     10      0      0      0 |     9      9      0 | 100.0%   0.0%
  chw_mbh                              19      10     10      0      0      0 |     9      9      0 | 100.0%   0.0%
  rpm                                  21      10     10      0      0      0 |    11     11      0 | 100.0%   0.0%
  filter_merv                           9       9      7      0      2      0 |     0      0      0 |  77.8%   0.0%
  oa_cfm_min                            9       9      3      0      6      0 |     0      0      0 |  33.3%   0.0%
  supply_fan_hp                         9       9      4      0      5      0 |     0      0      0 |  44.4%   0.0%
  supply_fan_qty                        9       9      0      0      9      0 |     0      0      0 |   0.0%   0.0%
  conn_in                              39       8      5      0      3      0 |    31     31      0 |  62.5%   0.0%
  hw_lwt_f                             63       8      6      0      2      0 |    55     55      0 |  75.0%   0.0%
  supply_cfm                            9       8      8      0      0      0 |     1      1      0 | 100.0%   0.0%
  area_served                          91       7      7      0      0      0 |    84     84      0 | 100.0%   0.0%
  esp_in                                5       5      5      0      0      0 |     0      0      0 | 100.0%   0.0%
  glycol_pct                           16       5      0      0      5      0 |    11     11      0 |   0.0%   0.0%
  bas_interface                        29       4      4      0      0      0 |    25     25      0 | 100.0%   0.0%
  condenser                             4       4      4      0      0      0 |     0      0      0 | 100.0%   0.0%
  cooling_tons                         21       4      4      0      0      0 |    17     17      0 | 100.0%   0.0%
  drive                                 5       4      1      0      3      0 |     1      1      0 |  25.0%   0.0%
  dx_stages                             9       4      0      0      4      0 |     5      5      0 |   0.0%   0.0%
  economizer                            9       4      4      0      0      0 |     5      5      0 | 100.0%   0.0%
  ewt_f                                 4       4      4      0      0      0 |     0      0      0 | 100.0%   0.0%
  gas_input_mbh                         9       4      4      0      0      0 |     5      5      0 | 100.0%   0.0%
  lwt_f                                 4       4      4      0      0      0 |     0      0      0 | 100.0%   0.0%
  pump_arrangement                     16       4      0      0      4      0 |    12     12      0 |   0.0%   0.0%
  tons                                  5       4      4      0      0      0 |     1      1      0 | 100.0%   0.0%
  chw_rows                             19       3      3      0      0      0 |    16     16      0 | 100.0%   0.0%
  fuel                                  3       3      2      0      1      0 |     0      0      0 |  66.7%   0.0%
  heating_medium                        3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  input_mbh                             3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  control                               5       2      0      0      2      0 |     3      3      0 |   0.0%   0.0%
  eh_kw                                65       2      1      0      1      0 |    63     63      0 |  50.0%   0.0%
  energy_recovery                       9       2      2      0      0      0 |     7      7      0 | 100.0%   0.0%
  exhaust_fan_hp                        9       2      2      0      0      0 |     7      7      0 | 100.0%   0.0%
  floor                                91       2      2      0      0      0 |    89     89      0 | 100.0%   0.0%
  kw_input                              4       2      0      0      2      0 |     2      2      0 |   0.0%   0.0%
  capacity_lb_hr                        1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  fan_hp                                1       1      0      0      1      0 |     0      0      0 |   0.0%   0.0%
  humidifier_type                       1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  hw_rows                              46       1      1      0      0      0 |    45     45      0 | 100.0%   0.0%
  motor_watts                           5       1      1      0      0      0 |     4      4      0 | 100.0%   0.0%
  building                             91       0      0      0      0      0 |    91     91      0 |    —      —  
  cells                                 1       0      0      0      0      0 |     1      1      0 |    —      —  
  cfm_heat                             27       0      0      0      0      0 |    27     27      0 |    —      —  
  chw_glycol_pct                       19       0      0      0      0      0 |    19     19      0 |    —      —  
  eh_stages                            27       0      0      0      0      0 |    27     27      0 |    —      —  
  fan_speeds                           10       0      0      0      0      0 |    10     10      0 |    —      —  
  humidifier                            9       0      0      0      0      0 |     9      9      0 |    —      —  
  hw_glycol_pct                        46       0      0      0      0      0 |    46     46      0 |    —      —  
  outdoor_air_pct                       9       0      0      0      0      0 |     9      9      0 |    —      —  
  pipes                                10       0      0      0      0      0 |    10     10      0 |    —      —  
  qty                                  64       0      0      0      0      0 |    64     64      0 |    —      —  
  return_fan_hp                         9       0      0      0      0      0 |     9      9      0 |    —      —  
  steam_lb_hr                          12       0      0      0      0      0 |    12     12      0 |    —      —  
  steam_psig                           12       0      0      0      0      0 |    12     12      0 |    —      —  

GATE 2 (heldout): exact 88.6% (need >= 95.0%) FAIL · wrong 0.0% (need <= 1.0%) ok · invented 2 (need = 0) FAIL → FAIL
```
