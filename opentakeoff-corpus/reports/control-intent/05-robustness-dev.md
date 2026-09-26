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
  baker-county-eoc                         packets 3; units read 2; option decisions applied 2, proposals 0; PQ1 = no: 13 unit records, 0 not none; the project's own open: building-meters
      applied RTU-1 opt.co2_sensor = true [drawing_read:agree(r0,r1)] "THE RTU UNIT SHALL ADJUST ITS FRESH AIR FLOW BASED ON THE CO2 READING FROM TEH ROOM MOUNTED CO2 SENS"
      applied RTU-2 opt.co2_sensor = true [drawing_read:agree(r0,r1)] "THE RTU UNIT SHALL ADJUST ITS FRESH AIR FLOW BASED ON THE CO2 READING FROM TEH ROOM MOUNTED CO2 SENS"
  negative controls: PASS (no unit is in scope with PQ1 = no); the premise, no control packets, does not hold: the option decisions above are what their packets print

── adversarial swap: readings through a packet rebound to another unit must not apply (≥ 99%)
  another family: 74 packets rebound to 71 units asked 402 questions; decisions resting on the swap 0: applied 0, proposal 0, unresolved 0 → none read through them PASS
      reader answers citing a swapped packet 56: 56 unverified (100.0%); decided elsewhere (the zone plan) 2, applied 2; live calls 10
  another tag, same family: 19 packets rebound to 18 units asked 72 questions; decisions resting on the swap 0: applied 0, proposal 0, unresolved 0 → none read through them PASS
      reader answers citing a swapped packet 26: 26 unverified (100.0%); decided elsewhere (the zone plan) 0, applied 0; live calls 0

── model-off: R0 alone, 0 applied-wrong
  R0 alone: applied 19, applied-wrong 0, INVENTED 0; absences applied 0, left as proposals 75 → PASS

── replay: the recorded readings, applied twice, byte-identical
  11 of 11 documents byte-identical (190 runs replayed, 0 not recorded) → PASS

── re-run: the models read the dev documents again (afresh, now) against the recorded replay: ≤ 2% of decisions change
  14 of 493 decisions changed (2.8%) → FAIL
      federal-mech AHU-1 opt.relief_damper: proposal true → none  [r0:not_shown r1:yes r2a:not_shown r2b:not_shown → -]
      federal-mech AHU-1 opt.enthalpy_economizer: applied true → proposal true  [r0:yes r1:yes r2a:not_shown r2b:not_shown → r0:yes r1:not_shown r2a:not_shown r2b:not_shown]
      federal-mech AHU-1 opt.freezestat_to_bas: proposal false → applied false  [r0:no r1:not_shown r2a:no r2b:no(unverified) → r0:no r1:no r2a:no(unverified) r2b:no]
      federal-mech AHU-1 opt.duct_smoke_detectors: proposal true → unresolved null  [r0:yes r1:not_shown r2a:not_shown r2b:not_shown → r0:yes r1:not_shown r2a:no r2b:no]
      federal-mech AHU-1 opt.economizer: proposal true → applied true  [r0:yes r1:yes(unverified) r2a:not_shown r2b:yes → r0:yes r1:yes(unverified) r2a:yes r2b:yes]
      federal-mech B-1 role: unresolved null → applied "in"  [r0:commands r1:commands r2a:monitors_only(unverified) r2b:commands → r0:commands r1:commands r2a:not_shown r2b:not_shown]
      federal-mech B-2 role: unresolved null → applied "in"  [r0:commands r1:commands r2a:monitors_only(unverified) r2b:commands → r0:commands r1:commands r2a:not_shown r2b:not_shown]
      federal-mech HWP-1 role: proposal "in" → none  [r0:not_shown r1:commands(unverified) r2a:commands r2b:commands → -]
      federal-mech HWP-2 role: proposal "in" → none  [r0:not_shown r1:commands(unverified) r2a:commands r2b:commands → -]
      federal-mech EF-1 opt.motorized_damper: unresolved null → applied true  [r0:yes r1:no r2a:yes r2b:yes → r0:yes r1:not_shown r2a:yes r2b:yes]
      federal-mech EF-4 opt.motorized_damper: applied true → unresolved null  [r0:yes r1:not_shown r2a:yes r2b:yes → r0:yes r1:no r2a:yes r2b:yes]
      federal-mech UH-1 opt.setpoint_adjust: applied true → proposal true  [r0:not_shown r1:yes r2a:yes r2b:yes → r0:not_shown r1:yes(unverified) r2a:yes r2b:yes]
      federal-mech UH-2 opt.setpoint_adjust: applied true → proposal true  [r0:not_shown r1:yes r2a:yes r2b:yes → r0:not_shown r1:yes(unverified) r2a:yes r2b:yes]
      federal-mech AHU-1 role: none → proposal "in"  [- → r0:not_shown(a local controller runs the unit, yet the BAS commands it too) r1:commands(unverified) r2a:commands r2b:commands]
  cost (the live re-run just now): 188 model calls, 1404957 tokens; wall per document at most 102 s, 411 s in all → PASS (≤ 300 s)
      004_MO_T2504_03_Interior_and_Exterior_Re    4 calls    16544 tokens    2 s; 0/60 changed
      031_MO_VA_Project_589A4_20_158_Renovate_   12 calls   106174 tokens   45 s; 0/5 changed
      040_IL_VA_Solicitation_36C77623B0051_Exp   14 calls    85723 tokens   19 s; 0/26 changed
      069_ID_ITD_District_2_Laboratory_Heating   12 calls    90951 tokens   24 s; 0/4 changed
      074_CA_West_Valley_College_STEM_Classroo    3 calls     9648 tokens    4 s; 0/1 changed
      094_FL_Orange_County_Regional_History_Ce    9 calls    89095 tokens   26 s; 0/60 changed
      12_MT_MSU_ReidHall_Renovation               1 calls     3831 tokens    1 s; 0/4 changed
      baker-county-eoc                            1 calls     4911 tokens    1 s; 0/2 changed
      bldg5406-hvac-demo                         35 calls   299980 tokens  102 s; 0/97 changed
      federal-mech                               61 calls   441982 tokens  102 s; 14/180 changed
      itd-d1-lab                                 36 calls   256118 tokens   85 s; 0/54 changed

── raster: a dev document's image-only rendition applies nothing its vector document does not
  itd-d1-lab-raster: 0 items, 0 control packets, 0 applied (the vector document: 38); not the vector document's: 0
  raster: PASS

GATE D (dev): negative ok · swap (family) ok · swap (tag) ok · model-off ok · replay ok · re-run FAIL · cost ok · raster ok
```
