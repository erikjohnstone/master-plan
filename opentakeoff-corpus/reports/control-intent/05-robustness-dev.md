# Robustness suite (GATE D) — dev

```
ROBUSTNESS SUITE (GATE D) — dev, live model calls where not recorded (the re-run: afresh)

── negative controls: with PQ1 = no, every unit's controls record is none
  004_MO_T2504_03_Interior_and_Exterior_Re packets 5; units read 9; option decisions applied 12, proposals 47; PQ1 = no: 26 unit records, 0 not none; the project's own open: building-meters
      applied RTU - 2 opt.relief_damper = true [drawing_read:agree(r0,r1)] "THE BAROMETRIC RELIEF DAMPERS SHALL OPEN WITH INCREASED BUILDING PRESSURE."
      applied RTU - 2 opt.economizer = true [drawing_read:agree(r0,r1)] "F (ADJ.) THE SUPPLY FAN THE OUTSIDE AIR DAMPER SHALL OPEN IF ECONOMIZING IS ENABLED AND REMAIN CLOSE"
      applied RTU -1 opt.relief_damper = true [drawing_read:agree(r0,r1)] "THE BAROMETRIC RELIEF DAMPERS SHALL OPEN WITH INCREASED BUILDING PRESSURE."
      applied RTU -1 opt.economizer = true [drawing_read:agree(r0,r1)] "F (ADJ.) THE SUPPLY FAN THE OUTSIDE AIR DAMPER SHALL OPEN IF ECONOMIZING IS ENABLED AND REMAIN CLOSE"
      applied RTU -3 opt.relief_damper = true [drawing_read:agree(r0,r1)] "THE BAROMETRIC RELIEF DAMPERS SHALL OPEN WITH INCREASED BUILDING PRESSURE."
      applied RTU -3 opt.economizer = true [drawing_read:agree(r0,r1)] "F (ADJ.) THE SUPPLY FAN THE OUTSIDE AIR DAMPER SHALL OPEN IF ECONOMIZING IS ENABLED AND REMAIN CLOSE"
      applied RTU -4 opt.relief_damper = true [drawing_read:agree(r0,r1)] "THE BAROMETRIC RELIEF DAMPERS SHALL OPEN WITH INCREASED BUILDING PRESSURE."
      applied RTU -4 opt.economizer = true [drawing_read:agree(r0,r1)] "F (ADJ.) THE SUPPLY FAN THE OUTSIDE AIR DAMPER SHALL OPEN IF ECONOMIZING IS ENABLED AND REMAIN CLOSE"
      applied RTU -6 opt.relief_damper = true [drawing_read:agree(r0,r1)] "THE BAROMETRIC RELIEF DAMPERS SHALL OPEN WITH INCREASED BUILDING PRESSURE."
      applied RTU -6 opt.economizer = true [drawing_read:agree(r0,r1)] "F (ADJ.) THE SUPPLY FAN THE OUTSIDE AIR DAMPER SHALL OPEN IF ECONOMIZING IS ENABLED AND REMAIN CLOSE"
      applied RTU -7 opt.relief_damper = true [drawing_read:agree(r0,r1)] "THE BAROMETRIC RELIEF DAMPERS SHALL OPEN WITH INCREASED BUILDING PRESSURE."
      applied RTU -7 opt.economizer = true [drawing_read:agree(r0,r1)] "F (ADJ.) THE SUPPLY FAN THE OUTSIDE AIR DAMPER SHALL OPEN IF ECONOMIZING IS ENABLED AND REMAIN CLOSE"
  baker-county-eoc                         packets 3; units read 2; option decisions applied 2, proposals 0; PQ1 = no: 15 unit records, 0 not none; the project's own open: building-meters
      applied RTU-1 opt.co2_sensor = true [drawing_read:agree(r0,r1)] "THE RTU UNIT SHALL ADJUST ITS FRESH AIR FLOW BASED ON THE CO2 READING FROM TEH ROOM MOUNTED CO2 SENS"
      applied RTU-2 opt.co2_sensor = true [drawing_read:agree(r0,r1)] "THE RTU UNIT SHALL ADJUST ITS FRESH AIR FLOW BASED ON THE CO2 READING FROM TEH ROOM MOUNTED CO2 SENS"
  negative controls: PASS (no unit is in scope with PQ1 = no); the premise, no control packets, does not hold: the option decisions above are what their packets print

── adversarial swap: readings through a packet rebound to another unit must not apply (≥ 99%)
  another family: 89 packets rebound to 84 units asked 510 questions; decisions resting on the swap 0: applied 0, proposal 0, unresolved 0 → none read through them PASS
      reader answers citing a swapped packet 62: 62 unverified (100.0%); decided elsewhere (the zone plan) 2, applied 2; live calls 0
  another tag, same family: 19 packets rebound to 17 units asked 69 questions; decisions resting on the swap 0: applied 0, proposal 0, unresolved 0 → none read through them PASS
      reader answers citing a swapped packet 20: 20 unverified (100.0%); decided elsewhere (the zone plan) 0, applied 0; live calls 0

── model-off: R0 alone, 0 applied-wrong
  R0 alone: applied 19, applied-wrong 0, INVENTED 0; absences applied 0, left as proposals 75 → PASS

── replay: the recorded readings, applied twice, byte-identical
  11 of 11 documents byte-identical (223 runs replayed, 0 not recorded) → PASS

── re-run: the models read the dev documents again (afresh, now) against the recorded replay: ≤ 2% of decisions change
  36 of 631 decisions changed (5.7%) → FAIL
      004_MO_T2504_03_ RTU - 2 opt.differential_economizer: none → proposal true  [- → r0:not_shown r1:yes]
      004_MO_T2504_03_ RTU -1 opt.differential_economizer: none → proposal true  [- → r0:not_shown r1:yes]
      004_MO_T2504_03_ RTU -3 opt.differential_economizer: none → proposal true  [- → r0:not_shown r1:yes]
      004_MO_T2504_03_ RTU -4 opt.differential_economizer: none → proposal true  [- → r0:not_shown r1:yes]
      004_MO_T2504_03_ RTU -6 opt.differential_economizer: none → proposal true  [- → r0:not_shown r1:yes]
      004_MO_T2504_03_ RTU -7 opt.differential_economizer: none → proposal true  [- → r0:not_shown r1:yes]
      031_MO_VA_Projec WHSE-AHU-1 opt.duct_smoke_detectors: unresolved null → proposal false  [r0:no r1:yes r2a:not_shown r2b:not_shown → r0:no r1:not_shown r2a:not_shown r2b:not_shown]
      040_IL_VA_Solici TAB-102 opt.setpoint_adjust: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-102 opt.reheat_water_temps: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-104 opt.setpoint_adjust: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-104 opt.reheat_water_temps: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-105 opt.setpoint_adjust: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-105 opt.reheat_water_temps: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-106 opt.setpoint_adjust: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-106 opt.reheat_water_temps: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-107 opt.setpoint_adjust: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      040_IL_VA_Solici TAB-107 opt.reheat_water_temps: proposal false → applied false  [r0:absent r1:absent r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      069_ID_ITD_Distr CWP-1 role: applied "in" → proposal "in"  [r0:commands r1:commands r2a:commands(unverified) r2b:commands(unverified) → r0:commands r1:commands(unverified) r2a:commands(unverified) r2b:commands(unverified)]
      069_ID_ITD_Distr CWP-2 role: applied "in" → proposal "in"  [r0:commands r1:commands r2a:commands(unverified) r2b:commands(unverified) → r0:commands r1:commands(unverified) r2a:commands(unverified) r2b:commands(unverified)]
      094_FL_Orange_Co AHU-04 opt.relief_damper: proposal false → applied false  [r0:absent r1:not_shown r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      094_FL_Orange_Co AHU-05 opt.relief_damper: proposal false → applied false  [r0:absent r1:not_shown r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      094_FL_Orange_Co AHU-06 opt.duct_smoke_detectors: proposal false → applied false  [r0:absent r1:absent r2a:absent r2b:not_shown → r0:absent r1:absent r2a:absent r2b:absent]
      094_FL_Orange_Co AHU-08 opt.relief_damper: proposal false → applied false  [r0:absent r1:not_shown r2a:not_shown r2b:absent → r0:absent r1:absent r2a:absent r2b:absent]
      bldg5406-hvac-de AHU-1 opt.occupancy_sensor: proposal false → applied false  [r0:absent r1:absent r2a:absent r2b:not_shown → r0:absent r1:absent r2a:absent r2b:absent]
      federal-mech AHU-1 opt.freezestat_to_bas: proposal false → applied false  [r0:no r1:not_shown r2a:no r2b:no(unverified) → r0:no r1:no r2a:not_shown r2b:no(unverified)]
      federal-mech AHU-1 opt.duct_smoke_detectors: proposal true → applied true  [r0:yes r1:not_shown r2a:not_shown r2b:not_shown → r0:yes r1:yes r2a:not_shown r2b:not_shown]
      federal-mech AHU-1 opt.economizer: proposal true → applied true  [r0:yes r1:yes(unverified) r2a:not_shown r2b:yes → r0:yes r1:yes(unverified) r2a:yes r2b:yes]
      federal-mech B-1 role: unresolved null → applied "in"  [r0:commands r1:commands r2a:monitors_only(unverified) r2b:commands → r0:commands r1:commands r2a:not_shown r2b:commands]
      federal-mech B-2 role: unresolved null → applied "in"  [r0:commands r1:commands r2a:monitors_only(unverified) r2b:commands → r0:commands r1:commands r2a:not_shown r2b:commands]
      federal-mech CWP-1 role: proposal "in" → applied "in"  [r0:not_shown r1:not_shown r2a:commands r2b:commands → r0:not_shown r1:commands r2a:commands r2b:commands]
      federal-mech CWP-2 role: proposal "in" → applied "in"  [r0:not_shown r1:not_shown r2a:commands r2b:commands → r0:not_shown r1:commands r2a:commands r2b:commands]
      federal-mech HWP-1 role: proposal "in" → none  [r0:not_shown r1:commands(unverified) r2a:commands r2b:commands → -]
      federal-mech HWP-2 role: proposal "in" → none  [r0:not_shown r1:commands(unverified) r2a:commands r2b:commands → -]
      federal-mech EF-1 opt.motorized_damper: unresolved null → proposal true  [r0:yes r1:no r2a:yes r2b:yes → r0:yes r1:not_shown r2a:yes r2b:yes(unverified)]
      federal-mech EF-4 opt.motorized_damper: applied true → proposal true  [r0:yes r1:not_shown r2a:yes r2b:yes → r0:yes r1:not_shown r2a:yes r2b:yes(unverified)]
      federal-mech AHU-1 role: none → proposal "in"  [- → r0:not_shown(a local controller runs the unit, yet the BAS commands it too) r1:commands(unverified) r2a:commands r2b:commands]
  cost (the live re-run just now): 221 model calls, 1492367 tokens; wall per document at most 118 s, 392 s in all → PASS (≤ 300 s)
      004_MO_T2504_03_Interior_and_Exterior_Re    4 calls    16279 tokens    1 s; 6/66 changed
      031_MO_VA_Project_589A4_20_158_Renovate_   17 calls   128187 tokens   37 s; 1/18 changed
      040_IL_VA_Solicitation_36C77623B0051_Exp   29 calls   177046 tokens   26 s; 10/97 changed
      069_ID_ITD_District_2_Laboratory_Heating   12 calls    70527 tokens   12 s; 2/4 changed
      074_CA_West_Valley_College_STEM_Classroo    9 calls    35194 tokens    7 s; 0/45 changed
      094_FL_Orange_County_Regional_History_Ce    9 calls    65606 tokens   16 s; 4/60 changed
      12_MT_MSU_ReidHall_Renovation               2 calls     6400 tokens    1 s; 0/9 changed
      baker-county-eoc                            1 calls     5227 tokens    1 s; 0/2 changed
      bldg5406-hvac-demo                         34 calls   271537 tokens   93 s; 1/97 changed
      federal-mech                               63 calls   468109 tokens  118 s; 12/180 changed
      itd-d1-lab                                 41 calls   248255 tokens   80 s; 0/53 changed

── raster: a dev document's image-only rendition applies nothing its vector document does not
  itd-d1-lab-raster: 0 items, 0 control packets, 0 applied (the vector document: 38); not the vector document's: 0
  raster: PASS

GATE D (dev): negative ok · swap (family) ok · swap (tag) ok · model-off ok · replay ok · re-run FAIL · cost ok · raster ok
```
