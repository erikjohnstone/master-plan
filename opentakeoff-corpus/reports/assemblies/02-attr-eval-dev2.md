# Attribute eval — dev2

```
ATTRIBUTE EVAL (instrument 2) — dev2, normalizer: normalize.ts
key instances matched to a compile item: 167/189; out-of-key-scope compile items in keyed tables: 56; unscored values (extensions): 9

                                    lines printed  exact  wrong missed    oos | empty c-unkn invent | exact%  wrong%
ALL                                  4010    1451   1259      0    192      2 |  2559   2557      0 |  86.8%   0.0%
  slice: grid                        3540     988    815      0    173      2 |  2552   2550      0 |  82.5%   0.0%
  slice: reading                      404     404    396      0      8      0 |     0      0      0 |  98.0%   0.0%
  slice: notes                         66      59     48      0     11      0 |     7      7      0 |  81.4%   0.0%

per family
  VAV                                1081     447    294      0    153      0 |   634    634      0 |  65.8%   0.0%
  FAN                                 256     151    147      0      4      0 |   105    105      0 |  97.4%   0.0%
  PUMP                                285     148    147      0      1      2 |   137    135      0 |  99.3%   0.0%
  CONDENSING_UNIT                     660     127    121      0      6      0 |   533    533      0 |  95.3%   0.0%
  FURNACE                             420     105    105      0      0      0 |   315    315      0 | 100.0%   0.0%
  DOAS                                180      96     96      0      0      0 |    84     84      0 | 100.0%   0.0%
  AHU                                 135      60     60      0      0      0 |    75     75      0 | 100.0%   0.0%
  UNIT_HEATER                         119      50     50      0      0      0 |    69     69      0 | 100.0%   0.0%
  AIR_COOLED_CHILLER                   84      49     41      0      8      0 |    35     35      0 |  83.7%   0.0%
  BOILER                              105      49     49      0      0      0 |    56     56      0 | 100.0%   0.0%
  OUTDOOR_AIR_UNIT                    135      29     23      0      6      0 |   106    106      0 |  79.3%   0.0%
  FCU                                 120      28     28      0      0      0 |    92     92      0 | 100.0%   0.0%
  COOLING_TOWER                        45      24     16      0      8      0 |    21     21      0 |  66.7%   0.0%
  HEAT_EXCHANGER                       54      24     18      0      6      0 |    30     30      0 |  75.0%   0.0%
  HEAT_PUMP                            60      19     19      0      0      0 |    41     41      0 | 100.0%   0.0%
  RTU                                 180      16     16      0      0      0 |   164    164      0 | 100.0%   0.0%
  ERV                                  22      12     12      0      0      0 |    10     10      0 | 100.0%   0.0%
  VRF_INDOOR                           40      10     10      0      0      0 |    30     30      0 | 100.0%   0.0%
  HUMIDIFIER                            9       4      4      0      0      0 |     5      5      0 | 100.0%   0.0%
  VRF_OUTDOOR                          20       3      3      0      0      0 |    17     17      0 | 100.0%   0.0%

per set
  21_VA_OrangeCounty_PublicSafetyB    745     306    300      0      6      0 |   439    439      0 |  98.0%   0.0%
  03_FL_HurlburtField_ChildDevCent    559     250    109      0    141      0 |   309    309      0 |  43.6%   0.0%
  16_NV_CarsonValleyMS_HVAC_Replac   1172     243    237      0      6      0 |   929    929      0 |  97.5%   0.0%
  14_OR_KlamathCC_LearningCtr_Mech    558     242    239      0      3      0 |   316    316      0 |  98.8%   0.0%
  044_NY_VA_Project_528A8_17_805_R    309     163    159      0      4      0 |   146    146      0 |  97.5%   0.0%
  088_AZ_Phoenix_Sky_Harbor_Intern    403     147    131      0     16      2 |   256    254      0 |  89.1%   0.0%
  047_NC_VA_Project_558_22_172_Rep    133      61     61      0      0      0 |    72     72      0 | 100.0%   0.0%
  063_MT_Harrison_Hall_Extruder_La     62      16      0      0     16      0 |    46     46      0 |   0.0%   0.0%
  066_MT_Barnard_Hall_111_Lithogra     29      13     13      0      0      0 |    16     16      0 | 100.0%   0.0%
  036_LA_VA_Project_502_21_222_EHR     40      10     10      0      0      0 |    30     30      0 | 100.0%   0.0%

per attribute
  phase                               186     143    131      0     12      0 |    43     43      0 |  91.6%   0.0%
  volts                               186     143    132      0     11      0 |    43     43      0 |  92.3%   0.0%
  area_served                         189      83     78      0      5      0 |   106    106      0 |  94.0%   0.0%
  cfm                                  87      50     49      0      1      0 |    37     37      0 |  98.0%   0.0%
  hw_ewt_f                            132      50     35      0     15      0 |    82     82      0 |  70.0%   0.0%
  hw_gpm                              132      50     35      0     15      0 |    82     82      0 |  70.0%   0.0%
  cooling_mbh                          74      48     46      0      2      0 |    26     26      0 |  95.8%   0.0%
  cfm_max                              47      47     30      0     17      0 |     0      0      0 |  63.8%   0.0%
  cfm_min                              47      47     30      0     17      0 |     0      0      0 |  63.8%   0.0%
  heat_type                            47      47     30      0     17      0 |     0      0      0 |  63.8%   0.0%
  cfm_heat                             47      46     29      0     17      0 |     1      1      0 |  63.0%   0.0%
  hw_mbh                               65      44     29      0     15      0 |    21     21      0 |  65.9%   0.0%
  inlet_size_in                        47      39     30      0      9      0 |     8      8      0 |  76.9%   0.0%
  heating_mbh                          81      38     38      0      0      0 |    43     43      0 | 100.0%   0.0%
  motor_hp                            153      37     37      0      0      0 |   116    116      0 | 100.0%   0.0%
  hw_rows                              65      35     35      0      0      0 |    30     30      0 | 100.0%   0.0%
  hw_wpd_ft                            65      35     35      0      0      0 |    30     30      0 | 100.0%   0.0%
  rpm                                  35      33     33      0      0      0 |     2      2      0 | 100.0%   0.0%
  vfd                                  52      25     24      0      1      2 |    27     25      0 |  96.0%   0.0%
  gpm                                  29      22     21      0      1      0 |     7      7      0 |  95.5%   0.0%
  hw_lwt_f                            132      21      6      0     15      0 |   111    111      0 |  28.6%   0.0%
  service                              35      21     21      0      0      0 |    14     14      0 | 100.0%   0.0%
  cooling_type                         18      18     16      0      2      0 |     0      0      0 |  88.9%   0.0%
  drive                                16      16     15      0      1      0 |     0      0      0 |  93.8%   0.0%
  esp_in                               16      16     15      0      1      0 |     0      0      0 |  93.8%   0.0%
  chw_ewt_f                            84      15     14      0      1      0 |    69     69      0 |  93.3%   0.0%
  chw_gpm                              84      15     14      0      1      0 |    69     69      0 |  93.3%   0.0%
  chw_lwt_f                            84      15     14      0      1      0 |    69     69      0 |  93.3%   0.0%
  control                              16      15     15      0      0      0 |     1      1      0 | 100.0%   0.0%
  head_ft                              19      15     15      0      0      0 |     4      4      0 | 100.0%   0.0%
  heating_type                         18      15     15      0      0      0 |     3      3      0 | 100.0%   0.0%
  supply_cfm                           16      12     12      0      0      0 |     4      4      0 | 100.0%   0.0%
  supply_fan_hp                        16      12     12      0      0      0 |     4      4      0 | 100.0%   0.0%
  floor                               189      10     10      0      0      0 |   179    179      0 | 100.0%   0.0%
  bas_interface                        90       9      8      0      1      0 |    81     81      0 |  88.9%   0.0%
  chw_wpd_ft                           18       9      9      0      0      0 |     9      9      0 | 100.0%   0.0%
  glycol_pct                           19       9      9      0      0      0 |    10     10      0 | 100.0%   0.0%
  tons                                  9       9      7      0      2      0 |     0      0      0 |  77.8%   0.0%
  fuel                                  7       7      7      0      0      0 |     0      0      0 | 100.0%   0.0%
  heating_medium                        7       7      7      0      0      0 |     0      0      0 | 100.0%   0.0%
  input_mbh                             7       7      7      0      0      0 |     0      0      0 | 100.0%   0.0%
  output_mbh                            7       7      7      0      0      0 |     0      0      0 | 100.0%   0.0%
  chw_rows                             18       6      6      0      0      0 |    12     12      0 | 100.0%   0.0%
  condenser                             6       6      5      0      1      0 |     0      0      0 |  83.3%   0.0%
  ewt_f                                10       6      5      0      1      0 |     4      4      0 |  83.3%   0.0%
  exhaust_fan_hp                       16       6      6      0      0      0 |    10     10      0 | 100.0%   0.0%
  lwt_f                                10       6      5      0      1      0 |     4      4      0 |  83.3%   0.0%
  conn_in                             102       5      5      0      0      0 |    97     97      0 | 100.0%   0.0%
  cooling_tons                         74       5      5      0      0      0 |    69     69      0 | 100.0%   0.0%
  eh_kw                               140       5      5      0      0      0 |   135    135      0 | 100.0%   0.0%
  filter_merv                          14       5      3      0      2      0 |     9      9      0 |  60.0%   0.0%
  energy_recovery                      14       4      4      0      0      0 |    10     10      0 | 100.0%   0.0%
  outdoor_air_pct                      14       4      4      0      0      0 |    10     10      0 | 100.0%   0.0%
  fan_hp                                3       3      2      0      1      0 |     0      0      0 |  66.7%   0.0%
  oa_cfm_min                           14       3      3      0      0      0 |    11     11      0 | 100.0%   0.0%
  primary_medium                        3       3      2      0      1      0 |     0      0      0 |  66.7%   0.0%
  secondary_ewt_f                       3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_gpm                         3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_lwt_f                       3       3      3      0      0      0 |     0      0      0 | 100.0%   0.0%
  secondary_medium                      3       3      2      0      1      0 |     0      0      0 |  66.7%   0.0%
  steam_lb_hr                          21       3      3      0      0      0 |    18     18      0 | 100.0%   0.0%
  steam_psig                           21       3      3      0      0      0 |    18     18      0 | 100.0%   0.0%
  supply_fan_qty                       14       3      3      0      0      0 |    11     11      0 | 100.0%   0.0%
  capacity_mbh                          3       2      2      0      0      0 |     1      1      0 | 100.0%   0.0%
  chw_mbh                              18       2      2      0      0      0 |    16     16      0 | 100.0%   0.0%
  exhaust_cfm                           2       2      2      0      0      0 |     0      0      0 | 100.0%   0.0%
  kw_input                              6       2      2      0      0      0 |     4      4      0 | 100.0%   0.0%
  primary_conn_in                       3       2      0      0      2      0 |     1      1      0 |   0.0%   0.0%
  pump_arrangement                     19       2      2      0      0      0 |    17     17      0 | 100.0%   0.0%
  secondary_conn_in                     3       2      0      0      2      0 |     1      1      0 |   0.0%   0.0%
  capacity_lb_hr                        1       1      1      0      0      0 |     0      0      0 | 100.0%   0.0%
  economizer                           14       1      1      0      0      0 |    13     13      0 | 100.0%   0.0%
  gas_input_mbh                        14       1      1      0      0      0 |    13     13      0 | 100.0%   0.0%
  primary_ewt_f                         3       1      1      0      0      0 |     2      2      0 | 100.0%   0.0%
  primary_gpm                           3       1      1      0      0      0 |     2      2      0 | 100.0%   0.0%
  primary_lwt_f                         3       1      1      0      0      0 |     2      2      0 | 100.0%   0.0%
  return_fan_hp                        14       1      1      0      0      0 |    13     13      0 | 100.0%   0.0%
  building                            189       0      0      0      0      0 |   189    189      0 |    —      —  
  cells                                 3       0      0      0      0      0 |     3      3      0 |    —      —  
  chw_conn_in                          18       0      0      0      0      0 |    18     18      0 |    —      —  
  chw_glycol_pct                       18       0      0      0      0      0 |    18     18      0 |    —      —  
  dx_stages                            14       0      0      0      0      0 |    14     14      0 |    —      —  
  ecm                                  67       0      0      0      0      0 |    67     67      0 |    —      —  
  eh_stages                            47       0      0      0      0      0 |    47     47      0 |    —      —  
  fan_speeds                            4       0      0      0      0      0 |     4      4      0 |    —      —  
  humidifier                           14       0      0      0      0      0 |    14     14      0 |    —      —  
  humidifier_type                       1       0      0      0      0      0 |     1      1      0 |    —      —  
  hw_conn_in                           65       0      0      0      0      0 |    65     65      0 |    —      —  
  hw_glycol_pct                        65       0      0      0      0      0 |    65     65      0 |    —      —  
  hx_type                               3       0      0      0      0      0 |     3      3      0 |    —      —  
  motor_watts                          16       0      0      0      0      0 |    16     16      0 |    —      —  
  pipes                                 4       0      0      0      0      0 |     4      4      0 |    —      —  
  primary_steam_lb_hr                   3       0      0      0      0      0 |     3      3      0 |    —      —  
  primary_steam_psig                    3       0      0      0      0      0 |     3      3      0 |    —      —  
  qty                                 142       0      0      0      0      0 |   142    142      0 |    —      —  
  recovery_type                         2       0      0      0      0      0 |     2      2      0 |    —      —  
  terminal_type                        47       0      0      0      0      0 |    47     47      0 |    —      —  

key instances with no compile item (22):
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU A (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU B (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU C (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU D (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU E (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU F (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU G (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (E)ATU H (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU I (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU J (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU K1 (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU K2 (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU L (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU M (VAV): no compile item with this tag in the keyed table
  03_FL_HurlburtField_ChildDevCenter 03_FL_HurlburtField_ChildDevCenter.pdf#64 "AIR TERMINAL UNIT SCHEDULE (AHU 2)" (N)ATU N (VAV): no compile item with this tag in the keyed table
  063_MT_Harrison_Hall_Extruder_Lab_132_Renovation 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.pdf#9 "EXISTING VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE - EXTRUDER LAB" (E) VAV-105 (VAV): no compile item with this tag in the keyed table
  063_MT_Harrison_Hall_Extruder_Lab_132_Renovation 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.pdf#9 "EXISTING VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE - EXTRUDER LAB" (E) VAV-106 (VAV): no compile item with this tag in the keyed table
  063_MT_Harrison_Hall_Extruder_Lab_132_Renovation 063_MT_Harrison_Hall_Extruder_Lab_132_Renovation.pdf#9 "EXHAUST FAN SCHEDULE - EXTRUDER LAB" (E) EF- 4 (FAN): no compile item with this tag in the keyed table
  088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#246 "WATER COOLED CENTRIFUGAL CHILLER SCHEDULE" (E) CH-3 (AIR_COOLED_CHILLER): no compile item with this tag in the keyed table
  088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX 088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX.pdf#246 "COOLING TOWER SCHEDULE" (E) CT-1 (COOLING_TOWER): no compile item with this tag in the keyed table
  21_VA_OrangeCounty_PublicSafetyBldg 21_VA_OrangeCounty_PublicSafetyBldg.pdf#51 "AIR COOLED CONDENSING UNIT SCHEDULE" ACCU-1 (CONDENSING_UNIT): no compile item with this tag in the keyed table
  21_VA_OrangeCounty_PublicSafetyBldg 21_VA_OrangeCounty_PublicSafetyBldg.pdf#51 "AIR COOLED CONDENSING UNIT SCHEDULE" ACCU-2 (CONDENSING_UNIT): no compile item with this tag in the keyed table

GATE 2 (dev2): exact 86.8% (need >= 98.0%) FAIL · wrong 0.0% (need <= 0.5%) ok · invented 0 (need = 0) ok → FAIL
```
