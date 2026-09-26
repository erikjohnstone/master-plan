# Attribute eval — heldout2

```
ATTRIBUTE EVAL (instrument 2) — heldout2, normalizer: normalize.ts
key instances matched to a compile item: 79/81; out-of-key-scope compile items in keyed tables: 12; unscored values (extensions): 3

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  2052     472    266      1    205      0 |  1580   1578      2 |  56.4%   0.2%
  slice: grid                        1874     306    195      1    110      0 |  1568   1568      0 |  63.7%   0.3%
  slice: reading                      132     132     69      0     63      0 |     0      0      0 |  52.3%   0.0%
  slice: notes                         46      34      2      0     32      0 |    12     10      2 |   5.9%   0.0%

per family
  FCU                                 960     256    163      0     93      0 |   704    704      0 |  63.7%   0.0%
  VAV                                 690      90     30      1     59      0 |   600    600      0 |  33.3%   1.1%
  PUMP                                 90      40     28      0     12      0 |    50     50      0 |  70.0%   0.0%
  AHU                                 135      31     20      0     11      0 |   104    102      2 |  64.5%   0.0%
  FAN                                  32      18      0      0     18      0 |    14     14      0 |   0.0%   0.0%
  HEAT_EXCHANGER                       36      16     10      0      6      0 |    20     20      0 |  62.5%   0.0%
  CONDENSING_UNIT                      60      15      9      0      6      0 |    45     45      0 |  60.0%   0.0%
  HUMIDIFIER                            9       4      4      0      0      0 |     5      5      0 | 100.0%   0.0%
  DUCT_MOUNTED_COIL                    40       2      2      0      0      0 |    38     38      0 | 100.0%   0.0%

per set
  11_CA_SDSU_EngSciences_Complex_1   1572     326    166      1    159      0 |  1246   1244      2 |  50.9%   0.3%
  092_IL_Guaranteed_Rate_Field_HVA    210      83     64      0     19      0 |   127    127      0 |  77.1%   0.0%
  045_FL_VA_Project_516_21_107_EHR    270      63     36      0     27      0 |   207    207      0 |  57.1%   0.0%

per attribute
  area_served                          81      40      8      0     32      0 |    41     41      0 |  20.0%   0.0%
  phase                                79      38     36      0      2      0 |    41     41      0 |  94.7%   0.0%
  volts                                79      38     36      0      2      0 |    41     41      0 |  94.7%   0.0%
  cfm                                  39      36     34      0      2      0 |     3      3      0 |  94.4%   0.0%
  cooling_type                         35      33      5      0     28      0 |     2      2      0 |  15.2%   0.0%
  cfm_max                              30      30     30      0      0      0 |     0      0      0 | 100.0%   0.0%
  heat_type                            30      30      0      1     29      0 |     0      0      0 |   0.0%   3.3%
  floor                                81      29      5      0     24      0 |    52     52      0 |  17.2%   0.0%
  pipes                                32      23      0      0     23      0 |     9      9      0 |   0.0%   0.0%
  ecm                                  64      18     18      0      0      0 |    46     46      0 | 100.0%   0.0%
  chw_ewt_f                            40      14      5      0      9      0 |    26     26      0 |  35.7%   0.0%
  chw_gpm                              40      14     14      0      0      0 |    26     26      0 | 100.0%   0.0%
  chw_mbh                              35      14     14      0      0      0 |    21     21      0 | 100.0%   0.0%
  chw_rows                             35      14      5      0      9      0 |    21     21      0 |  35.7%   0.0%
  chw_wpd_ft                           35      14     14      0      0      0 |    21     21      0 | 100.0%   0.0%
  motor_hp                             75       8      6      0      2      0 |    67     67      0 |  75.0%   0.0%
  qty                                  51       7      5      0      2      0 |    44     44      0 |  71.4%   0.0%
  vfd                                  11       7      5      0      2      0 |     4      2      2 |  71.4%   0.0%
  gpm                                   6       6      6      0      0      0 |     0      0      0 | 100.0%   0.0%
  pump_arrangement                      6       6      0      0      6      0 |     0      0      0 |   0.0%   0.0%
  service                               8       6      0      0      6      0 |     2      2      0 |   0.0%   0.0%
  chw_glycol_pct                       35       5      0      0      5      0 |    30     30      0 |   0.0%   0.0%
  cooling_mbh                           8       3      0      0      3      0 |     5      5      0 |   0.0%   0.0%
  filter_merv                           3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  oa_cfm_min                            3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  return_fan_hp                         3       3      0      0      3      0 |     0      0      0 |   0.0%   0.0%
  supply_cfm                            3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  supply_fan_hp                         3       3      0      0      3      0 |     0      0      0 |   0.0%   0.0%
  supply_fan_qty                        3       3      0      0      3      0 |     0      0      0 |   0.0%   0.0%
  drive                                 2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  heating_type                         35       2      0      0      2      0 |    33     33      0 |   0.0%   0.0%
  hx_type                               2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  primary_ewt_f                         2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  primary_medium                        2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  secondary_ewt_f                       2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_gpm                         2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_lwt_f                       2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_medium                      2       2      0      0      2      0 |     0      0      0 |   0.0%   0.0%
  capacity_lb_hr                        1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  economizer                            3       1      1      0      0      0 |     2      2      0 | 100.0%   0.0%
  eh_kw                                71       1      1      0      0      0 |    70     70      0 | 100.0%   0.0%
  bas_interface                         8       0      0      0      0      0 |     8      8      0 |    —      —  
  building                             81       0      0      0      0      0 |    81     81      0 |    —      —  
  capacity_mbh                          2       0      0      0      0      0 |     2      2      0 |    —      —  
  cfm_heat                             30       0      0      0      0      0 |    30     30      0 |    —      —  
  cfm_min                              30       0      0      0      0      0 |    30     30      0 |    —      —  
  chw_conn_in                          35       0      0      0      0      0 |    35     35      0 |    —      —  
  chw_lwt_f                            40       0      0      0      0      0 |    40     40      0 |    —      —  
  conn_in                              11       0      0      0      0      0 |    11     11      0 |    —      —  
  control                               2       0      0      0      0      0 |     2      2      0 |    —      —  
  cooling_tons                          8       0      0      0      0      0 |     8      8      0 |    —      —  
  dx_stages                             3       0      0      0      0      0 |     3      3      0 |    —      —  
  eh_stages                            30       0      0      0      0      0 |    30     30      0 |    —      —  
  energy_recovery                       3       0      0      0      0      0 |     3      3      0 |    —      —  
  esp_in                                2       0      0      0      0      0 |     2      2      0 |    —      —  
  exhaust_fan_hp                        3       0      0      0      0      0 |     3      3      0 |    —      —  
  fan_speeds                           32       0      0      0      0      0 |    32     32      0 |    —      —  
  gas_input_mbh                         3       0      0      0      0      0 |     3      3      0 |    —      —  
  glycol_pct                            6       0      0      0      0      0 |     6      6      0 |    —      —  
  head_ft                               6       0      0      0      0      0 |     6      6      0 |    —      —  
  heating_mbh                           8       0      0      0      0      0 |     8      8      0 |    —      —  
  humidifier                            3       0      0      0      0      0 |     3      3      0 |    —      —  
  humidifier_type                       1       0      0      0      0      0 |     1      1      0 |    —      —  
  hw_conn_in                           65       0      0      0      0      0 |    65     65      0 |    —      —  
  hw_ewt_f                             70       0      0      0      0      0 |    70     70      0 |    —      —  
  hw_glycol_pct                        65       0      0      0      0      0 |    65     65      0 |    —      —  
  hw_gpm                               70       0      0      0      0      0 |    70     70      0 |    —      —  
  hw_lwt_f                             70       0      0      0      0      0 |    70     70      0 |    —      —  
  hw_mbh                               65       0      0      0      0      0 |    65     65      0 |    —      —  
  hw_rows                              65       0      0      0      0      0 |    65     65      0 |    —      —  
  hw_wpd_ft                            65       0      0      0      0      0 |    65     65      0 |    —      —  
  inlet_size_in                        30       0      0      0      0      0 |    30     30      0 |    —      —  
  motor_watts                           2       0      0      0      0      0 |     2      2      0 |    —      —  
  outdoor_air_pct                       3       0      0      0      0      0 |     3      3      0 |    —      —  
  primary_conn_in                       2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_gpm                           2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_lwt_f                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_lb_hr                   2       0      0      0      0      0 |     2      2      0 |    —      —  
  primary_steam_psig                    2       0      0      0      0      0 |     2      2      0 |    —      —  
  rpm                                   8       0      0      0      0      0 |     8      8      0 |    —      —  
  secondary_conn_in                     2       0      0      0      0      0 |     2      2      0 |    —      —  
  steam_lb_hr                           3       0      0      0      0      0 |     3      3      0 |    —      —  
  steam_psig                            3       0      0      0      0      0 |     3      3      0 |    —      —  
  terminal_type                        30       0      0      0      0      0 |    30     30      0 |    —      —  

key instances with no compile item (2)

GATE 2 (heldout2): exact 56.4% (need >= 95.0%) FAIL · wrong 0.2% (need <= 1.0%) ok · invented 2 (need = 0) FAIL → FAIL
```
