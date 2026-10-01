# Reconcile keys (dev): adjudication of the independent verify

Each of the 12 dev documents was keyed from its renders and text layer by one agent (plansheets.csv, plantags.csv) and then checked by a second, independent agent that re-read the drawings and reported only evidenced disagreements. Neither saw pipeline output. The coordinator decided each disagreement from the drawings; every change below was applied by one script (line by line: only a changed line is rewritten, each edit asserts it matches exactly one row, a re-run changes nothing), before any keyed score was read against these keys.

Policies the adjudication settled (they also bind the check keys):

- A scheduled unit the prepared instance list omits keeps its schedule row as its id (`<schedule sheet>|<mark as printed>`); "unscheduled" is only a unit tag no schedule row lists. The instance lists were built from a subset of each set's tables (26_CA: its CAV table only), so 14_OR's fan coils and 009_FL's VAV boxes, keyed "unscheduled" with the row named in the note, take their row ids.
- A misprinted tag is keyed by the physical truth when the drawing decides it (level, room, served system, schedule location column, riser), and "ambiguous" naming the candidates when it does not.
- A label at a device serving a unit (thermostat, sensor, drive, disconnect) is not a placement and is not listed, except on a zoning plan, whose zone labels name the unit serving each zone (listed with counts no, view view-repeat: 011_IL MH-100, federal-mech M2.1).
- A generic kind label naming no individual unit (EX. FCU, UH-E, TAB-E) is out of scope (24_IA, 040_IL).

| set | verify disagreements | edits applied |
|---|---:|---:|
| 004_MO_T2504_03_Interior_and_Exterior_Renovation | 1 | 1 |
| 009_FL_USDA_APHIS_Plant_Inspection_Station_Building | 2 | 19 |
| 011_IL_VA_Hines_Finance_Center_Renovation | 3 | 3 |
| 016_NY_Alter_Repair_Building_1624_Irish_Hill_Test | 1 | 0 |
| 028_TX_Renovation_of_Building_615_Final_Design_Plans | 0 | 0 |
| 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile | 5 | 2 |
| 12_MT_MSU_ReidHall_Renovation | 2 | 3 |
| 14_OR_KlamathCC_LearningCtr_Mechanical | 2 | 74 |
| 24_IA_JohnsonCounty_Courthouse | 0 | 0 |
| 26_CA_TransbayTower_Mechanical_64Sheets | 6 | 5 |
| federal-mech | 0 | 0 |
| itd-d1-lab | 0 | 0 |
| total | 22 | 107 |

Disagreements not applied: the 243 26_CA rows, 5 016_NY rows, 14 12_MT rows and 247 040_IL rows whose ids are schedule rows outside the prepared instance list were confirmed correct by their verifiers (the ids stand; see the first policy); 040_IL's generic -E labels (UH-E, EF-E, RF-E, CAB-E, TAB-E, bare TAB) stay out of scope by the fourth policy.

## Edits

### 26_CA_TransbayTower_Mechanical_64Sheets

- 1 change (plantags.csv; verifier): p24's stacked HEX over 35-1 has a leader to an exchanger in the L34 pump / heat exchange room with SHWP 34-1/34-2 and ET 34-1; p9 schedules HEX-34-1 as L34 heating water and HEX-35-1 as L35 chilled water; the p57 riser places HEX 34-1 at level 34. As first keyed, HEX-35-1 was counted twice and HEX-34-1 never. Policy: a misprinted tag is keyed by the physical truth when the drawing decides it.
  - before: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#24,HEX 35-1,26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|HEX-35-1,1,yes,new,scheduled row not in info.json instance list; tag reads HEX 35-1 but sits in the level 34 heat exchange room; likely drafting error for HEX-34-x (L34 heating water)`
  - after: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#24,HEX 35-1,26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|HEX-34-1,1,yes,new,tag misprinted HEX 35-1 on the level 34 plan; the unit is the L34 secondary heating-water heat exchanger (p9 schedule HEX-34-1 L34 / HEATING WATER; p57 riser shows HEX 34-1 at LEVEL 34 beside SHWP 34-1/34-2); HEX-35-1 is tagged and counted on the L35 plan p25`

- 1 change (plantags.csv; verifier): p24's stacked HEX over 35-2 has a leader to an exchanger in the L34 pump / heat exchange room with SHWP 34-1/34-2 and ET 34-1; p9 schedules HEX-34-2 as L34 heating water and HEX-35-2 as L35 chilled water; the p57 riser places HEX 34-2 at level 34. As first keyed, HEX-35-2 was counted twice and HEX-34-2 never. Policy: a misprinted tag is keyed by the physical truth when the drawing decides it.
  - before: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#24,HEX 35-2,26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|HEX-35-2,1,yes,new,scheduled row not in info.json instance list; tag reads HEX 35-2 but sits in the level 34 heat exchange room; likely drafting error for HEX-34-x (L34 heating water)`
  - after: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#24,HEX 35-2,26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|HEX-34-2,1,yes,new,tag misprinted HEX 35-2 on the level 34 plan; the unit is the L34 secondary heating-water heat exchanger (p9 schedule HEX-34-2 L34 / HEATING WATER; p57 riser shows HEX 34-2 at LEVEL 34 beside SHWP 34-1/34-2); HEX-35-2 is tagged and counted on the L35 plan p25`

- 2 change (plantags.csv; verifier): p9 prints 'FOR LEVEL 61, TRI-PATH AHU IS BASE DESIGN. OVERHEAD ONLY IS AN ALTERNATE.' (tri-path note 1, repeated as AHU (COOLING) note 6); p34 is the base plan M2.61 and draws the tri-path zoning (zone ducts Z-1..Z-4, thermostats AHU-n-Z-*) like p33 for levels 59-60; the alternate is p35. The drawing decides the row, so ambiguous -> the tri-path row.
  - before: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#34,AHU 61-1,ambiguous,1,yes,new,level 61 base plan: fits tri-path row 26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|AHU-(59-61)-1 (base design per schedule note 1) and row 26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|AHU-61-1 & 2 (overhead-only alternate); both rows not in info.json`
  - after: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#34,AHU 61-1,26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|AHU-(59-61)-1,1,yes,new,"level 61 instance of the tri-path row AHU-(59-61)-1: p9 tri-path note 1 and AHU (COOLING) note 6 make the tri-path AHU the base design for level 61 and the overhead-only AHU-61-1 & 2 an alternate, drawn untagged on p35 M2.61A"`
  - before: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#34,AHU 61-2,ambiguous,1,yes,new,level 61 base plan: fits tri-path row 26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|AHU-(59-61)-2 (base design per schedule note 1) and row 26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|AHU-61-1 & 2 (overhead-only alternate); both rows not in info.json`
  - after: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#34,AHU 61-2,26_CA_TransbayTower_Mechanical_64Sheets.pdf#9|AHU-(59-61)-2,1,yes,new,"level 61 instance of the tri-path row AHU-(59-61)-2: p9 tri-path note 1 and AHU (COOLING) note 6 make the tri-path AHU the base design for level 61 and the overhead-only AHU-61-1 & 2 an alternate, drawn untagged on p35 M2.61A"`

- 1 change (plantags.csv; verifier): The p11 CAV schedule lists exactly two toilet-exhaust rows for the floor (CAV-X-1, CAV-X-2); the misprinted tag is a scheduled terminal, not unscheduled equipment, but the drawing does not decide which: ambiguous.
  - before: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#15,CAV 18-2,unscheduled,1,yes,new,hexagon stacked CAV over 18-2 at level 4 MEN'S toilet exhaust box; no CAV-18-2 row in the set; likely drafting error for CAV-X-1/CAV-X-2`
  - after: `26_CA_TransbayTower_Mechanical_64Sheets.pdf#15,CAV 18-2,ambiguous,1,yes,new,"hexagon CAV over 18-2 (misprinted: no CAV-18-2 row) at the level 4 MEN'S toilet exhaust box; a scheduled unit, 26_CA_TransbayTower_Mechanical_64Sheets.pdf#11|CAV-X-1 or 26_CA_TransbayTower_Mechanical_64Sheets.pdf#11|CAV-X-2 (both scheduled for floors 3-4, 6-34); the other L4 box is tagged CAV X-2, so elimination favours CAV-X-1 but the drawing does not say"`

### 011_IL_VA_Hines_Finance_Center_Renovation

- 1 change (plansheets.csv; verifier): p26 holds one plan view (new work); the riser diagram and the sequence matrix are not plan views, so the sheet mixes no plan kinds; the key marks other one-plan sheets with non-plan content 'new' (p6, p9).
  - before: `011_IL_VA_Hines_Finance_Center_Renovation.pdf#26,LEVEL 2 - ELECTRICAL DATA AND SECURITY PLAN,E,mixed,yes,EP-103; data/security floor plan plus fire alarm riser diagram and sequence; ACCU2 DISCONNECT (ETR) label only; no HVAC unit tags`
  - after: `011_IL_VA_Hines_Finance_Center_Renovation.pdf#26,LEVEL 2 - ELECTRICAL DATA AND SECURITY PLAN,E,new,yes,"EP-103; data/security floor plan (new work) plus fire alarm riser diagram and sequence-of-operations matrix, which are not plan views; ACCU2 DISCONNECT (ETR) label only; no HVAC unit tags"`

- 1 change (plantags.csv; verifier): MH-100's 14 thermostat labels carry capacities 12x6, 15x3, 24x2, 42x2, 48x1: the 15-row schedule without its only 36 MBH row, renumbered in order, so from 12 on the sheet runs one behind; this label fits two rows and the drawing does not decide.
  - before: `011_IL_VA_Hines_Finance_Center_Renovation.pdf#15,HP 42-13,011_IL_VA_Hines_Finance_Center_Renovation.pdf#16|HP 42-13,1,no,view-repeat,"label under the unit's relocated thermostat (T, keynote M1) in zone 11 Open Office B; duct plan puts HP 42-13 in Conference (zone 14); not at the unit; unit counted on p16"`
  - after: `011_IL_VA_Hines_Finance_Center_Renovation.pdf#15,HP 42-13,ambiguous,1,no,view-repeat,"thermostat label (T, keynote M1) in zone 11 Open Office B, not at a unit; MH-100 numbers its 14 thermostats 1-14 without the schedule's 36 MBH unit, so from 12 on it runs one behind the schedule: fits 011_IL_VA_Hines_Finance_Center_Renovation.pdf#16|HP 42-13 (literal) or 011_IL_VA_Hines_Finance_Center_Renovation.pdf#16|HP 42-14 (this sheet's numbering); MH-101 puts HP 48-15 in zone 11"`

- 1 change (plantags.csv; verifier): The close render puts the thermostat inside zone 14 Conference; the printed capacity 42 rules out HP 36-12; MH-101 draws HP 42-13 in Conference with its scheduled 820 CFM. The drawing decides: HP 42-13.
  - before: `011_IL_VA_Hines_Finance_Center_Renovation.pdf#15,HP 42-12,ambiguous,1,no,view-repeat,thermostat label at col 10 wall by Conference/zone 13-14 matching no schedule row: HP 36-12 (unit no. 12) or HP 42-13 (42 capacity; duct plan unit for Conference)`
  - after: `011_IL_VA_Hines_Finance_Center_Renovation.pdf#15,HP 42-12,011_IL_VA_Hines_Finance_Center_Renovation.pdf#16|HP 42-13,1,no,view-repeat,"thermostat label (T, keynote M1) on the east face of the col 10 wall in zone 14 Conference, not at the unit; MH-100 runs one number behind the schedule from 12 on (no 36 MBH unit on this sheet) and the printed 42 excludes HP 36-12; MH-101 puts HP 42-13 in Conference 200.05 (4 x SD-3 at 205 = 820 CFM, its scheduled airflow); unit counted on p16"`

### 004_MO_T2504_03_Interior_and_Exterior_Renovation

- 1 change (plantags.csv; verifier): Note wording only: the keynote box beside DOAS/1 is 6 (x2123 y2449); keynote 7 is drawn beside RTU 5.
  - before: `004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#37,DOAS 1,004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#39|DOAS - 1,1,yes,new,stacked DOAS over 1 at unit (keyed note 7)`
  - after: `004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#37,DOAS 1,004_MO_T2504_03_Interior_and_Exterior_Renovation.pdf#39|DOAS - 1,1,yes,new,"stacked DOAS over 1 at unit (drawn with keyed note 6; keyed note 7, the DOAS note, sits on RTU 5 instead)"`

### 12_MT_MSU_ReidHall_Renovation

- 1 change (plantags.csv; verifier): Note wording only: the tag lies north of the corridor wall (y~1006), inside the room west of DIRECTOR OFFICE 140.
  - before: `12_MT_MSU_ReidHall_Renovation.pdf#32,VAV 1,12_MT_MSU_ReidHall_Renovation.pdf#28|VAV-1,1,yes,new,"stacked VAV over 1 in hex tag drawn inside the box symbol, north corridor near director office 140"`
  - after: `12_MT_MSU_ReidHall_Renovation.pdf#32,VAV 1,12_MT_MSU_ReidHall_Renovation.pdf#28|VAV-1,1,yes,new,"stacked VAV over 1 in hex tag inside the box symbol, room west of director office 140 (conference 141 on A101)"`

- 1 change (plantags.csv; verifier): Note wording only: the tag lies south of the offices' north wall (y~2316), inside office 120.
  - before: `12_MT_MSU_ReidHall_Renovation.pdf#32,VAV 4,12_MT_MSU_ReidHall_Renovation.pdf#28|VAV-4,1,yes,new,"stacked VAV over 4 in hex tag inside the box symbol, south corridor near office 120"`
  - after: `12_MT_MSU_ReidHall_Renovation.pdf#32,VAV 4,12_MT_MSU_ReidHall_Renovation.pdf#28|VAV-4,1,yes,new,"stacked VAV over 4 in hex tag inside the box symbol, office 120 ceiling"`

- 1 change (plansheets.csv; verifier): Note wording only: p40 also carries FC/HP labels (keyed as discipline repeats).
  - before: `12_MT_MSU_ReidHall_Renovation.pdf#32,LEVEL 1 MECHANICAL REMODEL PLANS,M,new,yes,"FIRST FLOOR MECHANICAL REMODEL PLAN; the only plan view with HVAC unit tags (VAV, FT, CUH, FC, HP)"`
  - after: `12_MT_MSU_ReidHall_Renovation.pdf#32,LEVEL 1 MECHANICAL REMODEL PLANS,M,new,yes,"FIRST FLOOR MECHANICAL REMODEL PLAN; the only plan view with counted HVAC unit tags (VAV, FT, CUH, FC, HP); E2.0 p40 repeats FC/HP as electrical labels"`

### 040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile

- 1 change (plantags.csv; verifier): Note wording only: EF-33 is drawn solid with no 'REMOVE EXISTING EXHAUST FAN' leader (EF-25, EF-14, EF-13 are dashed and carry it); counts and view unchanged.
  - before: `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#11,EF-33,unscheduled,1,no,demolition,existing roof exhaust fan to be removed; no schedule row`
  - after: `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#11,EF-33,unscheduled,1,no,demolition,"existing roof exhaust fan to remain (drawn solid, no removal note); only drawn on this demolition plan; no schedule row"`

- 1 change (plantags.csv; verifier): Note wording only: EF-26 is drawn solid with no 'REMOVE EXISTING EXHAUST FAN' leader (EF-25, EF-14, EF-13 are dashed and carry it); counts and view unchanged.
  - before: `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#11,EF-26,unscheduled,1,no,demolition,existing roof exhaust fan to be removed; no schedule row`
  - after: `040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile.pdf#11,EF-26,unscheduled,1,no,demolition,"existing roof exhaust fan to remain (drawn solid, no removal note); only drawn on this demolition plan; no schedule row"`

### 14_OR_KlamathCC_LearningCtr_Mechanical

- 70 change (plantags.csv; verifier (format)): p2 (M002) prints a FAN COIL UNITS table whose MARK column lists FC-101..FC-109, FC-201..FC-204 and FC-206..FC-210 (checked: 18 spans at x353); the key's own notes name the row. 'unscheduled' means no schedule row lists the tag, which is false; the instance list prepared for the author omitted the table. Placements, counts and views unchanged.
  - before: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#5,FC-101,unscheduled,1,yes,new,FAN COIL UNITS schedule row on p2 (14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|FC-101) that info.json's instance list omits; counted here`
  - after: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#5,FC-101,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|FC-101,1,yes,new,row of the FAN COIL UNITS schedule on p2; counted here`
  - before: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#5,FC-102,unscheduled,1,yes,new,FAN COIL UNITS schedule row on p2 (14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|FC-102) that info.json's instance list omits; counted here`
  - after: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#5,FC-102,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|FC-102,1,yes,new,row of the FAN COIL UNITS schedule on p2; counted here`
  - before: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#5,FC-103,unscheduled,1,yes,new,FAN COIL UNITS schedule row on p2 (14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|FC-103) that info.json's instance list omits; counted here`
  - after: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#5,FC-103,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|FC-103,1,yes,new,row of the FAN COIL UNITS schedule on p2; counted here`
  - ... and 67 more rows of the same edit

- 1 add (plantags.csv; verifier (missing instance)): p2's EXHAUST FANS table lists KEF-1 (x337 y2878), a scheduled unit the prepared instance list omitted; its tag is on no page p1-p17 except that row and the p16 sequence text (checked), so it is keyed not_drawn.
  - added: `,,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|KEF-1,0,no,not_drawn,only on the EXHAUST FANS schedule p2 and named KEF-01 in the p16 kitchen hood sequence; the roof plan M231 in the p1 sheet index is not in this set`

- 3 change (plantags.csv; verifier): p13 (M401) holds two enlarged plan views (ENLARGED GAS, ENLARGED GAS SECTOR B, 1/4" = 1'-0"); the key's own plansheets row says enlarged and it labels the matching p12 repeats enlarged-repeat. Label only; counts stay no.
  - before: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#13,MAU-1,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3|MAU-1,1,no,view-repeat,enlarged gas piping plan; same unit as on M211 p5`
  - after: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#13,MAU-1,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#3|MAU-1,1,no,enlarged-repeat,enlarged gas plan; same unit as on M211 p5`
  - before: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#13,B-1,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|B-1,1,no,view-repeat,enlarged gas piping plan; same unit as on M320 p12`
  - after: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#13,B-1,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|B-1,1,no,enlarged-repeat,enlarged gas plan; same unit as on M320 p12`
  - before: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#13,B-2,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|B-2,1,no,view-repeat,enlarged gas piping plan; same unit as on M320 p12`
  - after: `14_OR_KlamathCC_LearningCtr_Mechanical.pdf#13,B-2,14_OR_KlamathCC_LearningCtr_Mechanical.pdf#2|B-2,1,no,enlarged-repeat,enlarged gas plan; same unit as on M320 p12`

### 009_FL_USDA_APHIS_Plant_Inspection_Station_Building

- 16 change (plantags.csv; verifier (format)): p18 (M-601) prints a VAV TERMINAL SCHEDULE with rows VAV-1-1..VAV-1-7 (note 1: existing units, information for balancing); the key's own notes name it. 'unscheduled' is false; the prepared instance list omitted the table. Placements, counts and views unchanged: each VAV keeps one counted placement, on p15.
  - before: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#14,VAV-1-3,unscheduled,1,no,demolition,attic demo plan C1; existing VAV. VAV-1-1..VAV-1-7 are listed in the VAV TERMINAL SCHEDULE on p18 but that table is not in info.json's instance list`
  - after: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#14,VAV-1-3,009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18|VAV-1-3,1,no,demolition,attic demo plan C1; existing VAV; row of the VAV TERMINAL SCHEDULE on p18`
  - before: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#14,VAV-1-1,unscheduled,1,no,demolition,"level one demo plan A1; existing VAV (in p18 VAV TERMINAL SCHEDULE, absent from info.json instances)"`
  - after: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#14,VAV-1-1,009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18|VAV-1-1,1,no,demolition,level one demo plan A1; existing VAV (row of the p18 VAV TERMINAL SCHEDULE)`
  - before: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#14,VAV-1-2,unscheduled,1,no,demolition,"level one demo plan A1; existing VAV (in p18 VAV TERMINAL SCHEDULE, absent from info.json instances)"`
  - after: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#14,VAV-1-2,009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18|VAV-1-2,1,no,demolition,level one demo plan A1; existing VAV (row of the p18 VAV TERMINAL SCHEDULE)`
  - ... and 13 more rows of the same edit

- 3 delete (plantags.csv; verifier): On p30 (enlarged power plan A4) the EF-1/2/3 spans sit under a boxed 'VFD' header and label three drive boxes on the MECHANICAL 122 wall (p29 keynote 2: 'NEW VFDS IN MECHANICAL ROOM 122'); the fans stand on the roof (MH102 p16). A label that marks a unit's drive, not the unit, is not a placement, as the key already rules for the thermostat labels on p15. Counts unaffected.
  - deleted: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#30,EF-1,009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18|EF-1,1,no,discipline-repeat,"enlarged power plan A4; label at the fan's VFD in mechanical room 122 (the fan itself is on the roof, MH102 p16)"`
  - deleted: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#30,EF-2,009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18|EF-2,1,no,discipline-repeat,"enlarged power plan A4; label at the fan's VFD in mechanical room 122 (the fan itself is on the roof, MH102 p16)"`
  - deleted: `009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#30,EF-3,009_FL_USDA_APHIS_Plant_Inspection_Station_Building.pdf#18|EF-3,1,no,discipline-repeat,"enlarged power plan A4; label at the fan's VFD in mechanical room 122 (the fan itself is on the roof, MH102 p16)"`
