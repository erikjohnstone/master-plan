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
  another family: 81 packets rebound to 78 units asked 463 questions; decisions resting on the swap 0: applied 0, proposal 0, unresolved 0 → none read through them PASS
      reader answers citing a swapped packet 55: 55 unverified (100.0%); decided elsewhere (the zone plan) 2, applied 2; live calls 19
  another tag, same family: 19 packets rebound to 18 units asked 72 questions; decisions resting on the swap 0: applied 0, proposal 0, unresolved 0 → none read through them PASS
      reader answers citing a swapped packet 26: 26 unverified (100.0%); decided elsewhere (the zone plan) 0, applied 0; live calls 0

── model-off: R0 alone, 0 applied-wrong
  R0 alone: applied 19, applied-wrong 0, INVENTED 0; absences applied 0, left as proposals 75 → PASS

── replay: the recorded readings, applied twice, byte-identical
  11 of 11 documents byte-identical (209 runs replayed, 0 not recorded) → PASS

── re-run: the models read the dev documents again (afresh, now) against the recorded replay: ≤ 2% of decisions change
  23 of 564 decisions changed (4.1%) → FAIL
      040_IL_VA_Solici UH-1 role: applied "in" → unresolved null  [r0:commands r1:not_shown r2a:commands r2b:commands → r0:commands r1:monitors_only r2a:commands r2b:commands]
      040_IL_VA_Solici UH-2 role: applied "in" → unresolved null  [r0:commands r1:not_shown r2a:commands r2b:commands → r0:commands r1:monitors_only r2a:commands r2b:commands]
      040_IL_VA_Solici UH-3 role: applied "in" → unresolved null  [r0:commands r1:not_shown r2a:commands r2b:commands → r0:commands r1:monitors_only r2a:commands r2b:commands]
      040_IL_VA_Solici UH-4 role: applied "in" → unresolved null  [r0:commands r1:not_shown r2a:commands r2b:commands → r0:commands r1:monitors_only r2a:commands r2b:commands]
      040_IL_VA_Solici UH-5 role: applied "in" → unresolved null  [r0:commands r1:not_shown r2a:commands r2b:commands → r0:commands r1:monitors_only r2a:commands r2b:commands]
      040_IL_VA_Solici UH-6 role: applied "in" → unresolved null  [r0:commands r1:not_shown r2a:commands r2b:commands → r0:commands r1:monitors_only r2a:commands r2b:commands]
      bldg5406-hvac-de AHU-1 opt.freezestat_to_bas: applied true → proposal true  [r0:not_shown r1:yes r2a:yes r2b:yes → r0:not_shown r1:not_shown r2a:yes r2b:yes]
      federal-mech AHU-1 opt.dedicated_min_oa: applied true → proposal true  [r0:yes r1:yes r2a:yes r2b:yes → r0:yes r2a:yes(unverified) r2b:yes]
      federal-mech AHU-1 opt.relief_damper: proposal true → none  [r0:not_shown r1:yes r2a:not_shown r2b:not_shown → -]
      federal-mech AHU-1 opt.enthalpy_economizer: applied true → proposal true  [r0:yes r1:yes r2a:not_shown r2b:not_shown → r0:yes r2a:not_shown r2b:not_shown]
      federal-mech AHU-1 opt.duct_smoke_detectors: proposal true → unresolved null  [r0:yes r1:not_shown r2a:not_shown r2b:not_shown → r0:yes r2a:no(unverified) r2b:not_shown]
      federal-mech AHU-1 opt.economizer: proposal true → applied true  [r0:yes r1:yes(unverified) r2a:not_shown r2b:yes → r0:yes r2a:yes r2b:yes]
      federal-mech CH-1 role: unresolved null → proposal "out"  [r0:not_shown(a local controller runs the unit, yet the BAS commands it too) r1:monitors_only(unverified) r2a:commands r2b:commands → r0:not_shown(a local controller runs the unit, yet the BAS commands it too) r1:monitors_only r2a:commands r2b:not_shown]
      federal-mech B-1 role: unresolved null → applied "in"  [r0:commands r1:commands r2a:monitors_only(unverified) r2b:commands → r0:commands r1:commands r2a:commands r2b:not_shown]
      federal-mech B-2 role: unresolved null → applied "in"  [r0:commands r1:commands r2a:monitors_only(unverified) r2b:commands → r0:commands r1:commands r2a:commands r2b:not_shown]
      federal-mech HWP-1 role: proposal "in" → none  [r0:not_shown r1:commands(unverified) r2a:commands r2b:commands → -]
      federal-mech HWP-2 role: proposal "in" → none  [r0:not_shown r1:commands(unverified) r2a:commands r2b:commands → -]
      federal-mech EF-1 opt.motorized_damper: unresolved null → applied true  [r0:yes r1:no r2a:yes r2b:yes → r0:yes r1:not_shown r2a:yes r2b:yes]
      itd-d1-lab EH-1 opt.fan_status: applied true → proposal true  [r0:yes r1:yes r2a:yes r2b:not_shown → r0:yes r1:not_shown r2a:yes r2b:not_shown]
      itd-d1-lab EH-2 opt.fan_status: applied true → proposal true  [r0:yes r1:yes r2a:yes r2b:not_shown → r0:yes r1:not_shown r2a:yes r2b:not_shown]
      itd-d1-lab EH-3 opt.fan_status: applied true → proposal true  [r0:yes r1:yes r2a:yes r2b:not_shown → r0:yes r1:not_shown r2a:yes r2b:not_shown]
      itd-d1-lab EH-4 opt.fan_status: applied true → proposal true  [r0:yes r1:yes r2a:yes r2b:not_shown → r0:yes r1:not_shown r2a:yes r2b:not_shown]
      itd-d1-lab EH-6 opt.fan_status: applied true → proposal true  [r0:yes r1:yes r2a:yes r2b:not_shown → r0:yes r1:not_shown r2a:yes r2b:not_shown]
  cost (the live re-run just now): 209 model calls, 1640497 tokens; wall per document at most 126 s, 492 s in all → PASS (≤ 300 s)
      004_MO_T2504_03_Interior_and_Exterior_Re    4 calls    16525 tokens    1 s; 0/60 changed
      031_MO_VA_Project_589A4_20_158_Renovate_   18 calls   151769 tokens   36 s; 0/18 changed
      040_IL_VA_Solicitation_36C77623B0051_Exp   19 calls   176614 tokens   59 s; 6/39 changed
      069_ID_ITD_District_2_Laboratory_Heating   12 calls   106746 tokens   23 s; 0/4 changed
      074_CA_West_Valley_College_STEM_Classroo   11 calls    45521 tokens   11 s; 0/45 changed
      094_FL_Orange_County_Regional_History_Ce    9 calls    89652 tokens   27 s; 0/60 changed
      12_MT_MSU_ReidHall_Renovation               1 calls     3204 tokens    1 s; 0/4 changed
      baker-county-eoc                            1 calls     4960 tokens    1 s; 0/2 changed
      bldg5406-hvac-demo                         35 calls   302392 tokens  113 s; 1/97 changed
      federal-mech                               62 calls   462737 tokens  126 s; 11/179 changed
      itd-d1-lab                                 37 calls   280377 tokens   94 s; 5/56 changed

── raster: a dev document's image-only rendition applies nothing its vector document does not
  itd-d1-lab-raster: 0 items, 0 control packets, 0 applied (the vector document: 38); not the vector document's: 0
  raster: PASS

GATE D (dev): negative ok · swap (family) ok · swap (tag) ok · model-off ok · replay ok · re-run FAIL · cost ok · raster ok
```
