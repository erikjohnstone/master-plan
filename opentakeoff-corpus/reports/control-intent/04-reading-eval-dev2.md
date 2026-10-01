# Control intent: reading eval and typical eval (GATE C), dev 2

The binding tier 2's dev documents with typicals keys (typicals tier 2, keyed d12f7ab), read with the recorded runs in `runs/`, replayed (no request changed since 5cc3ae8). The two reconcile check documents in the tier have no typicals key and are not scored. Written by `read-eval` over the same snapshots as the binding reports (see CI-62's disclosure). At 5cc3ae8 this report read: 128 applied, 0 absence decisions applied, R0 right 139 and wrong 6; GATE C 147/202. CI-69 adds 5 absences, applied and right, on 028_TX and 061_IA, and no unit's outcome changes. R0 now reads "absent" where no bound packet mentions a device and one speaks for the unit: right 286, wrong 8. Its two new wrongs are 06_MO's VAV-5 and VAV-6 SCR heat, the key error AS-122 records; both decisions stay the vision runs' proposal, as before. CI-71 changes nothing here: no unit of the tier bound to sequences only sits beside a drawing no unit is bound to.

```
READING EVAL — dev2, replay
                                     applied-right applied-wrong INVENTED proposal-right proposal-wrong unresolved abstained
  ALL decisions                                 133              0         0             104              10           4        319
  absence decisions                               5              0         0              54               0           0          0
  applied 133, applied-wrong 0.00%, uncited applied 0
  r0     right 286  wrong 8  abstained 276  unverified 0  (key undecided 0)
  r1     right 309  wrong 3  abstained 178  unverified 80  (key undecided 0)
  r2a    right 166  wrong 9  abstained 351  unverified 36  (key undecided 0)
  r2b    right 184  wrong 7  abstained 311  unverified 37  (key undecided 23)
per set:
  028_TX_Renovation_of_Building_615_             53              0         0               8               0           2         98
  01_NY_VA_Northport_Dialysis_100CD               4              0         0              54               1           0         93
  16_NV_CarsonValleyMS_HVAC_Replacem             21              0         0              21               2           0         27
  06_MO_NatlGuard_JeffCity_CST_Addit             23              0         0               0               2           0         31
  011_IL_VA_Hines_Finance_Center_Ren             15              0         0               0               0           0         30
  012_MO_M2430_01_Chiller_Upgrade_Ce              6              0         0               4               0           0         25
  009_FL_USDA_APHIS_Plant_Inspection              7              0         0              14               3           2          3
  061_IA_Ames_Laboratory_Harley_Wilh              4              0         0               3               2           0         12
  (2 walled document(s) counted in the totals, never shown)
GATE B2 (dev2, reading part): applied_wrong ok · invented ok · absence_wrong ok · uncited ok

TYPICAL EVAL (GATE C; answers from keys, readings replay) — dev2: exact 147/202 (72.8%); option-wrong 29, typical-wrong 8, unresolved 16, unmatched 2; dishonest 2, undisclosed 13; verdict fail
  model calls: r1.replayed 41, r2.replayed 130; errors 2

not right (open documents):
  028_TX_Renovation_of_Build | DOAS-3 role: unresolved (key in, read null) drawing_read:disagreement — r0:local_control r1:commands(unverified) r2a:commands r2b:commands
  028_TX_Renovation_of_Build | CH-1 role: unresolved (key in, read null) drawing_read:disagreement — r0:local_control r1:commands(unverified) r2a:commands r2b:commands
  009_FL_USDA_APHIS_Plant_In | EF-1 opt.motorized_damper: proposal-wrong (key false, read true) drawing_read:single(r2) — r0:not_shown r1:not_shown r2a:yes r2b:yes
  009_FL_USDA_APHIS_Plant_In | EF-2 opt.motorized_damper: proposal-wrong (key false, read true) drawing_read:single(r2) — r0:not_shown r1:not_shown r2a:yes r2b:yes
  009_FL_USDA_APHIS_Plant_In | EF-3 opt.motorized_damper: proposal-wrong (key false, read true) drawing_read:single(r2) — r0:not_shown r1:not_shown r2a:yes r2b:yes
  009_FL_USDA_APHIS_Plant_In | EF-5 opt.motorized_damper: unresolved (key false, read null) drawing_read:disagreement — r0:absent r1:absent r2a:yes r2b:yes
  009_FL_USDA_APHIS_Plant_In | EF-6 opt.motorized_damper: unresolved (key false, read null) drawing_read:disagreement — r0:absent r1:absent r2a:yes r2b:yes
  16_NV_CarsonValleyMS_HVAC_ | C1 role: proposal-wrong (key in, read out) drawing_read:single(r0) — r0:local_control r1:monitors_only(refuted) r2a:monitors_only r2b:not_shown
  16_NV_CarsonValleyMS_HVAC_ | C2 role: proposal-wrong (key in, read out) drawing_read:single(r0) — r0:local_control r1:monitors_only(refuted) r2a:monitors_only r2b:not_shown
  01_NY_VA_Northport_Dialysi | AHU-1 opt.duct_smoke_detectors: proposal-wrong (key true, read false) drawing_read:single(r0) — r0:no r1:not_shown r2a:not_shown r2b:not_shown
  06_MO_NatlGuard_JeffCity_C | VAV-5 opt.scr_heat: proposal-wrong (key true, read false) drawing_read:single(r2) — r0:absent r1:not_shown r2a:no r2b:no
  06_MO_NatlGuard_JeffCity_C | VAV-6 opt.scr_heat: proposal-wrong (key true, read false) drawing_read:single(r2) — r0:absent r1:not_shown r2a:no r2b:no
  061_IA_Ames_Laboratory_Har | AHU-A opt.relief_damper: proposal-wrong (key false, read true) drawing_read:single(r1) — r0:not_shown r1:yes r2a:not_shown r2b:not_shown
  061_IA_Ames_Laboratory_Har | AHU-A opt.enthalpy_economizer: proposal-wrong (key false, read true) drawing_read:single(r0) — r0:yes r1:yes(unverified) r2a:not_shown r2b:not_shown

typical outcomes not exact (open documents):
  011_IL_VA_Hines_Finance_Ce | HP 12-1 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 12-2 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 12-3 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 12-4 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 12-5 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 12-6 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 15-7 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 15-8 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 15-9 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 24-10 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 24-11 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 36-12 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 42-13 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 42-14 HEAT_PUMP: option_wrong 
  011_IL_VA_Hines_Finance_Ce | HP 48-15 HEAT_PUMP: option_wrong 
  028_TX_Renovation_of_Build | CH-1 AIR_COOLED_CHILLER: option_wrong 
  028_TX_Renovation_of_Build | DOAS-1 DOAS: unresolved 
  028_TX_Renovation_of_Build | DOAS-2 DOAS: unresolved 
  028_TX_Renovation_of_Build | DOAS-3 DOAS: unresolved 
  028_TX_Renovation_of_Build | UH-1 UNIT_HEATER: wrong_typical 
  028_TX_Renovation_of_Build | UH-2 UNIT_HEATER: wrong_typical 
  009_FL_USDA_APHIS_Plant_In | AHU-1 AHU: unresolved 
  009_FL_USDA_APHIS_Plant_In | AHU-2 AHU: unresolved 
  009_FL_USDA_APHIS_Plant_In | CH-1 AIR_COOLED_CHILLER: option_wrong 
  009_FL_USDA_APHIS_Plant_In | EF-1 FAN: unresolved 
  009_FL_USDA_APHIS_Plant_In | EF-2 FAN: unresolved 
  009_FL_USDA_APHIS_Plant_In | EF-3 FAN: unresolved 
  009_FL_USDA_APHIS_Plant_In | EF-5 FAN: unresolved 
  009_FL_USDA_APHIS_Plant_In | EF-6 FAN: unresolved 
  012_MO_M2430_01_Chiller_Up | CH-1 AIR_COOLED_CHILLER: option_wrong 
  012_MO_M2430_01_Chiller_Up | CH-2 AIR_COOLED_CHILLER: option_wrong 
  012_MO_M2430_01_Chiller_Up | CH-3 AIR_COOLED_CHILLER: option_wrong 
  012_MO_M2430_01_Chiller_Up | CT-1 COOLING_TOWER: option_wrong 
  012_MO_M2430_01_Chiller_Up | CT-2 COOLING_TOWER: option_wrong 
  012_MO_M2430_01_Chiller_Up | CT-3 COOLING_TOWER: option_wrong 
  16_NV_CarsonValleyMS_HVAC_ | C1 ERV: option_wrong 
  16_NV_CarsonValleyMS_HVAC_ | C2 ERV: option_wrong 
  16_NV_CarsonValleyMS_HVAC_ | B1 OUTDOOR_AIR_UNIT: unresolved 
  16_NV_CarsonValleyMS_HVAC_ | B2 OUTDOOR_AIR_UNIT: unresolved 
  01_NY_VA_Northport_Dialysi | AHU-1 AHU: unresolved 
  06_MO_NatlGuard_JeffCity_C | ACU-6 RTU: option_wrong 
  06_MO_NatlGuard_JeffCity_C | VAV-5 VAV: wrong_typical 
  06_MO_NatlGuard_JeffCity_C | VAV-6 VAV: wrong_typical 
  06_MO_NatlGuard_JeffCity_C | FCU-1 FCU: unresolved 
  06_MO_NatlGuard_JeffCity_C | FCU-2 FCU: unresolved 
  06_MO_NatlGuard_JeffCity_C | FCU-3 FCU: wrong_typical 
  06_MO_NatlGuard_JeffCity_C | HP-1 HEAT_PUMP: wrong_typical 
  06_MO_NatlGuard_JeffCity_C | HP-2 HEAT_PUMP: wrong_typical 
  061_IA_Ames_Laboratory_Har | AHU-A AHU: option_wrong 
  061_IA_Ames_Laboratory_Har | HX-A-1 HEAT_EXCHANGER: option_wrong 
  061_IA_Ames_Laboratory_Har | HX-A-2 HEAT_EXCHANGER: option_wrong 
  061_IA_Ames_Laboratory_Har | HWP-B-1 PUMP: unresolved 
  061_IA_Ames_Laboratory_Har | EF-2 FAN: unmatched 
  061_IA_Ames_Laboratory_Har | EF-3 FAN: unmatched 
  061_IA_Ames_Laboratory_Har | WWHP-A HEAT_PUMP: wrong_typical 
```
