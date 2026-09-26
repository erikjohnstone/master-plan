# Attribute eval — dev3

```
ATTRIBUTE EVAL (instrument 2) — dev3, normalizer: normalize.ts
key instances matched to a compile item: 162/165; out-of-key-scope compile items in keyed tables: 70; unscored values (extensions): 4

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  3371    1377   1269      3    105     13 |  1994   1979      2 |  92.2%   0.2%
  slice: grid                        3083    1089   1002      2     85     13 |  1994   1979      2 |  92.0%   0.2%
  slice: reading                      225     225    205      0     20      0 |     0      0      0 |  91.1%   0.0%
  slice: notes                         63      63     62      1      0      0 |     0      0      0 |  98.4%   1.6%

per family
  VAV                                1150     530    530      0      0      0 |   620    620      0 | 100.0%   0.0%
  PUMP                                345     194    194      0      0     13 |   151    138      0 | 100.0%   0.0%
  VRF_INDOOR                          400     120    120      0      0      0 |   280    280      0 | 100.0%   0.0%
  FAN                                 162      99     57      0     42      0 |    63     61      2 |  57.6%   0.0%
  FCU                                 210      80     80      0      0      0 |   130    130      0 | 100.0%   0.0%
  HEAT_PUMP                           240      69     69      0      0      0 |   171    171      0 | 100.0%   0.0%
  UNIT_HEATER                         153      67     52      0     15      0 |    86     86      0 |  77.6%   0.0%
  AIR_COOLED_CHILLER                   84      47     45      2      0      0 |    37     37      0 |  95.7%   4.3%
  DUCT_MOUNTED_COIL                   200      42     42      0      0      0 |   158    158      0 | 100.0%   0.0%
  RTU                                 135      38      0      0     38      0 |    97     97      0 |   0.0%   0.0%
  COOLING_TOWER                        45      27     27      0      0      0 |    18     18      0 | 100.0%   0.0%
  BOILER                               30      18     18      0      0      0 |    12     12      0 | 100.0%   0.0%
  ERV                                  22      12      8      0      4      0 |    10     10      0 |  66.7%   0.0%
  VRF_OUTDOOR                          60      12      6      0      6      0 |    48     48      0 |  50.0%   0.0%
  AHU                                  45       7      6      1      0      0 |    38     38      0 |  85.7%  14.3%
  HEAT_EXCHANGER                       36       6      6      0      0      0 |    30     30      0 | 100.0%   0.0%
  DOAS                                 45       5      5      0      0      0 |    40     40      0 | 100.0%   0.0%
  HUMIDIFIER                            9       4      4      0      0      0 |     5      5      0 | 100.0%   0.0%

per set
  096_IN_Vermillion_County_Jail_Me   1236     596    578      3     15      0 |   640    638      2 |  97.0%   0.5%
  071_ME_BGS_Project_3809_Health_S    611     247    209      0     38      0 |   364    364      0 |  84.6%   0.0%
  012_MO_M2430_01_Chiller_Upgrade_    282     155    155      0      0     13 |   127    114      0 | 100.0%   0.0%
  093_ME_BGS_Project_3845_Jonesbor    460     132    126      0      6      0 |   328    328      0 |  95.5%   0.0%
  25_WA_DouglasCounty_Courthouse_H    305      98     98      0      0      0 |   207    207      0 | 100.0%   0.0%
  017_MD_NIST_Gaithersburg_Buildin    225      82     40      0     42      0 |   143    143      0 |  48.8%   0.0%
  083_MA_Town_Offices_Facilities_H    202      47     43      0      4      0 |   155    155      0 |  91.5%   0.0%
  008_MO_T2331_01_Repair_to_Interi     50      20     20      0      0      0 |    30     30      0 | 100.0%   0.0%

per attribute
  volts                               163     120    108      0     12      0 |    43     43      0 |  90.0%   0.0%
  phase                               163     100     91      0      9      0 |    63     63      0 |  91.0%   0.0%
  area_served                         165      63     60      0      3      0 |   102    102      0 |  95.2%   0.0%
  cfm                                  73      63     57      0      6      0 |    10      8      2 |  90.5%   0.0%
  cfm_heat                             50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm_max                              50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  cfm_min                              50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  heat_type                            50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  inlet_size_in                        50      50     50      0      0      0 |     0      0      0 | 100.0%   0.0%
  heating_mbh                          59      46     40      0      6      0 |    13     13      0 |  87.0%   0.0%
  cooling_mbh                          50      42     36      0      6      0 |     8      8      0 |  85.7%   0.0%
  motor_hp                            144      42     31      0     11      0 |   102    102      0 |  73.8%   0.0%
  hw_ewt_f                            116      38     38      0      0      0 |    78     78      0 | 100.0%   0.0%
  hw_gpm                              116      38     38      0      0      0 |    78     78      0 | 100.0%   0.0%
  hw_lwt_f                            116      38     38      0      0      0 |    78     78      0 | 100.0%   0.0%
  hw_mbh                               62      33     33      0      0      0 |    29     29      0 | 100.0%   0.0%
  hw_rows                              62      33     33      0      0      0 |    29     29      0 | 100.0%   0.0%
  rpm                                  33      32     26      0      6      0 |     1      1      0 |  81.3%   0.0%
  hw_conn_in                           62      30     30      0      0      0 |    32     32      0 | 100.0%   0.0%
  bas_interface                        61      29     28      1      0      0 |    32     32      0 |  96.6%   3.4%
  service                              33      29     23      0      6      0 |     4      4      0 |  79.3%   0.0%
  gpm                                  28      28     28      0      0      0 |     0      0      0 | 100.0%   0.0%
  eh_kw                               119      25     22      0      3      0 |    94     94      0 |  88.0%   0.0%
  head_ft                              23      23     23      0      0      0 |     0      0      0 | 100.0%   0.0%
  vfd                                  41      22     22      0      0     13 |    19      6      0 | 100.0%   0.0%
  conn_in                              88      20     20      0      0      0 |    68     68      0 | 100.0%   0.0%
  terminal_type                        50      20     20      0      0      0 |    30     30      0 | 100.0%   0.0%
  qty                                 115      16     10      0      6      0 |    99     99      0 |  62.5%   0.0%
  chw_ewt_f                            63      13     13      0      0      0 |    50     50      0 | 100.0%   0.0%
  chw_gpm                              63      13     13      0      0      0 |    50     50      0 | 100.0%   0.0%
  chw_lwt_f                            63      13     13      0      0      0 |    50     50      0 | 100.0%   0.0%
  cooling_type                         12      10      7      0      3      0 |     2      2      0 |  70.0%   0.0%
  drive                                10      10      4      0      6      0 |     0      0      0 |  40.0%   0.0%
  esp_in                               10      10     10      0      0      0 |     0      0      0 | 100.0%   0.0%
  glycol_pct                           23      10     10      0      0      0 |    13     13      0 | 100.0%   0.0%
  heating_type                         12      10      7      0      3      0 |     2      2      0 |  70.0%   0.0%
  heating_medium                        9       9      9      0      0      0 |     0      0      0 | 100.0%   0.0%
  tons                                  9       9      7      2      0      0 |     0      0      0 |  77.8%  22.2%
  supply_cfm                            7       7      4      0      3      0 |     0      0      0 |  57.1%   0.0%
  condenser                             6       6      6      0      0      0 |     0      0      0 | 100.0%   0.0%
  ecm                                  67       6      6      0      0      0 |    61     61      0 | 100.0%   0.0%
  ewt_f                                 5       5      5      0      0      0 |     0      0      0 | 100.0%   0.0%
  lwt_f                                 5       5      5      0      0      0 |     0      0      0 | 100.0%   0.0%
  filter_merv                           5       4      1      0      3      0 |     1      1      0 |  25.0%   0.0%
  outdoor_air_pct                       5       4      1      0      3      0 |     1      1      0 |  25.0%   0.0%
  supply_fan_hp                         7       4      1      0      3      0 |     3      3      0 |  25.0%   0.0%
  cells                                 3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  chw_mbh                              12       3      3      0      0      0 |     9      9      0 | 100.0%   0.0%
  chw_rows                             12       3      3      0      0      0 |     9      9      0 | 100.0%   0.0%
  chw_wpd_ft                           12       3      3      0      0      0 |     9      9      0 | 100.0%   0.0%
  control                              10       3      3      0      0      0 |     7      7      0 | 100.0%   0.0%
  exhaust_fan_hp                        7       3      1      0      2      0 |     4      4      0 |  33.3%   0.0%
  fan_hp                                3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  fan_speeds                            7       3      3      0      0      0 |     4      4      0 | 100.0%   0.0%
  floor                               165       3      0      0      3      0 |   162    162      0 |   0.0%   0.0%
  hw_wpd_ft                            62       3      3      0      0      0 |    59     59      0 | 100.0%   0.0%
  exhaust_cfm                           2       2      1      0      1      0 |     0      0      0 |  50.0%   0.0%
  fuel                                  2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  hx_type                               2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  input_mbh                             2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  primary_medium                        2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_medium                      2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  capacity_lb_hr                        1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
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
  energy_recovery                       5       0      0      0      0      0 |     5      5      0 |    —      —  
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

GATE 2 (dev3): exact 92.2% (need >= 98.0%) FAIL · wrong 0.2% (need <= 0.5%) ok · invented 2 (need = 0) FAIL → FAIL
```
