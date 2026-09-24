# bldg5406-hvac-demo — the sheet graph's rotated schedules (AS-16 evidence)

The dev attribute eval (`02-attr-eval-dev.md`) misses 80 of bldg5406's 145
printed values; the other ten dev documents miss 4 of 1,908. Every one of the
80 sits in a table whose sheet graph lost the key's column: dropped outright,
merged with its neighbours into one cell, or its header shorn of the words
that say which quantity it is. The normalizer reads the graph's columns only
(the shared path's table truth), so no normalizer rule can recover them
without inventing an assignment the graph does not hold (LAW L4).

Per keyed table: the headers the key cites (read from the renders), the
headers the sheet graph holds, and a graph row. Reproduce with
`node --import tsx scripts/assemblies-attr-eval.mjs ../../opentakeoff-corpus bldg5406-hvac-demo --detail`
from `opentakeoff/mcp` (dev only; the graph comes from the content-addressed
cache or is built).

What the graph did, table by table:
- **AIR HANDLING UNIT SCHEDULE:** SUPPLY FAN CFM, MIN. O.A. and AREA
  SERVICED merged into one "CFM" cell ("5100 1290 BUILDING 5406"); the
  cooling coil's TOTAL MBH, GPM, EWT/LWT, W.P.D. and ROWS lost their COOLING
  COIL group; the filters and ELECTRICAL V/PH/HZ merged ("MERV 8 460 / 3 /
  60").
- **AIR TERMINAL BOX SCHEDULE:** INLET DIA. (INCHES) and VOLTS / PH / HZ are
  gone; REGULATOR SET CFM is a bare "CFM"; MIN. CFM carries the table's title
  instead of MIN ("AIR TERMINAL BOX SCHEDULE CFM").
- **FAN SCHEDULE:** the ELECTRICAL group's HP, VOLTS, Ø and HZ are one cell,
  its values in varying order ("1/4 115 1 60", "1/4 115 60 1").
- **PACKAGED AIR COOLED CHILLER SCHEDULE:** EWT / LWT (°F) reads
  "(°F) LWT / EWT" (the rotated text's order), so the physics check refuses
  "56 / 44".
- **The pump schedule on page 18** has no title in the graph, and keeps only
  MARK, MANUFACTURER, GPM ("4 40", GPM and head merged) and REMARKS.

### AIR HANDLING UNIT SCHEDULE (bldg5406-hvac-demo-mechanical.pdf#6)
- printed values: 15; exact 3; missed 12 (area_served 1, supply_cfm 1, oa_cfm_min 1, cooling_type 1, cooling_mbh 1, chw_gpm 1, chw_ewt_f 1, chw_lwt_f 1, chw_wpd_ft 1, chw_rows 1, volts 1, phase 1)
- key's printed headers: `AREA SERVICED`, `SUPPLY FAN / CFM`, `SUPPLY FAN / MIN. O.A.`, `SUPPLY FAN / HP`, `NOTE 8`, `COOLING COIL`, `COOLING COIL / TOTAL MBH`, `COOLING COIL / GPM`, `COOLING COIL / EWT/LWT (°F)`, `COOLING COIL / MAX. W.P.D. (FT. W.G.)`, `COOLING COIL / NO. OF ROWS`, `FILTERS / FINAL FILTER`, `ELECTRICAL V / PH / HZ`
- sheet graph's headers: `MARK`, `MANUFACTURER`, `CFM`, `ESP`, `SUPPLY FAN T.S.P.`, `RPM`, `HP`, `MBH`, `SUPPLY FAN MBH`, `EAT`, `LAT`, `VELOCITY`, `EWT`, `GPM`, `ELECTRICAL PRE`, `FILTERS FINAL`, `REMARKS`
- graph row `AHU-1`: MARK="AHU-1" · CFM="5100 1290 BUILDING 5406" · ESP="2.0" · SUPPLY FAN T.S.P.="5.7" · RPM="2530" · HP="10" · MBH="176.3" · SUPPLY FAN MBH="176.3" · VELOCITY="525" · GPM="29.0" · ELECTRICAL PRE="MERV 8 460 / 3 / 60" · FILTERS FINAL="MERV 13" · REMARKS="1795 SEE NOTES" · MANUFACTURER="TRANE / UCCAB10C0" · EAT="83.8 / 61.5" · LAT="52.2 / 48.9" · EWT="44.0 / 56.1"

### AIR TERMINAL BOX SCHEDULE (bldg5406-hvac-demo-mechanical.pdf#6)
- printed values: 63; exact 18; missed 45 (inlet_size_in 9, cfm_max 9, cfm_min 9, volts 9, phase 9)
- key's printed headers: `INLET DIA. (INCHES)`, `REGULATOR SET CFM`, `MIN. CFM`, `ELECTRIC HEATER KW`, `VOLTS / PH / HZ`
- sheet graph's headers: `MARK`, `MANUFACTURER`, `CFM`, `AIR TERMINAL BOX SCHEDULE CFM`, `MBH`, `KW`, `REMARKS`
- graph row `VAV-1`: MARK="VAV-1" · MANUFACTURER="TRANE / VCEF" · CFM="2170" · AIR TERMINAL BOX SCHEDULE CFM="870" · MBH="41.0" · KW="12" · REMARKS="SEE NOTES"
- graph row `VAV-2`: MARK="VAV-2" · MANUFACTURER="TRANE / VCEF" · CFM="820" · AIR TERMINAL BOX SCHEDULE CFM="290" · MBH="13.7" · KW="4" · REMARKS="SEE NOTES"

### FAN SCHEDULE (bldg5406-hvac-demo-mechanical.pdf#6)
- printed values: 48; exact 33; missed 15 (motor_hp 4, volts 5, phase 5, motor_watts 1)
- key's printed headers: `QTY.`, `SERVICE`, `CFM`, `S.P. (IN. W.C.)`, `ELECTRICAL / HP`, `MOTOR RPM`, `DRIVE`, `NOTES 2, 3, 5, 6 as the row's REMARKS cite them`, `ELECTRICAL / VOLTS`, `ELECTRICAL / Ø`
- sheet graph's headers: `MARK`, `QTY.`, `MANUFACTURER / MODEL`, `CFM`, `S.P. (IN. W.C.)`, `MOTOR RPM`, `ELECTRICAL`, `TYPE`, `DRIVE`, `SERVICE`, `REMARKS`
- graph row `EF-1`: MARK="EF-1" · QTY.="1" · MANUFACTURER / MODEL="GREENHECK / CW-080-VG" · CFM="165" · S.P. (IN. W.C.)="0.5" · MOTOR RPM="1725" · ELECTRICAL="HP VOLTS Ø HZ. 1/10 115 60 1" · TYPE="CENTRIFUGAL SIDEWALL" · DRIVE="DIRECT" · SERVICE="RESTROOMS" · REMARKS="SEE NOTES 1, 2, 3"
- graph row `EF-2`: MARK="EF-2" · QTY.="1" · MANUFACTURER / MODEL="GREENHECK / CWB-099-4" · CFM="400" · S.P. (IN. W.C.)="0.5" · MOTOR RPM="1725" · ELECTRICAL="1/4 115 1 60" · TYPE="CENTRIFUGAL SIDEWALL" · DRIVE="BELT" · SERVICE="SPECTROMETRIC OIL ANALYSIS" · REMARKS="SEE NOTES 1, 2, 4"

### PACKAGED AIR COOLED CHILLER SCHEDULE (bldg5406-hvac-demo-mechanical.pdf#6)
- printed values: 8; exact 6; missed 2 (chw_ewt_f 1, chw_lwt_f 1)
- key's printed headers: `TABLE TITLE`, `NOMINAL CAPACITY (TONS)`, `OPERATING WATER FLOW (GPM)`, `EWT / LWT (°F)`, `ELECTRICAL / TOTAL KW`, `ELECTRICAL / VOLTS`, `ELECTRICAL / Ø`
- sheet graph's headers: `MARK`, `MODEL / MANUFACTURER`, `(TONS) CAPACITY NOMINAL`, `(GPM) FLOW WATER OPERATING`, `(GPM) RATE FLOW MINIMUM`, `(°F) LWT / EWT`, `NPLV IPLV/`, `(FT) P.D. EVAP. MAX.`, `ELECTRICAL VOLTS`, `ELECTRICAL Ø`, `ELECTRICAL HZ.`, `ELECTRICAL KW TOTAL`, `REMARKS`
- graph row `CH-1`: MARK="CH-1" · MODEL / MANUFACTURER="TRANE / CGAM 20" · (TONS) CAPACITY NOMINAL="20" · (GPM) FLOW WATER OPERATING="35.6" · (GPM) RATE FLOW MINIMUM="4.0" · (°F) LWT / EWT="56 / 44" · NPLV IPLV/="17.72 / 14.16" · (FT) P.D. EVAP. MAX.="8.35" · ELECTRICAL VOLTS="480" · ELECTRICAL Ø="3" · ELECTRICAL HZ.="60" · ELECTRICAL KW TOTAL="25.9" · REMARKS="NOTES SEE"

### SPLIT SYSTEM AIR CONDITIONING UNITS (bldg5406-hvac-demo-mechanical.pdf#6)
- printed values: 5; exact 5; missed 0
- key's printed headers: `CFM`, `TABLE TITLE`, `COOLING / MBH`, `ELECTRICAL (V / φ / HZ)`
- sheet graph's headers: `MARK`, `TYPE UNIT INDOOR`, `TYPE REFRIGERANT`, `CFM`, `COOLING MBH`, `(V / / ELECTRICAL HZ)`, `OUTDOOR) / (INDOOR (AMPS) MCA`, `OUTDOOR) / (INDOOR (LBS) WEIGHT`
- graph row `ACCU-1/AC-1`: MARK="ACCU-1 / AC-1" · TYPE UNIT INDOOR="MOUNTED WALL" · TYPE REFRIGERANT="R410A" · CFM="530" · COOLING MBH="24" · (V / / ELECTRICAL HZ)="208 / 1 / 60" · OUTDOOR) / (INDOOR (AMPS) MCA="1 / 18" · OUTDOOR) / (INDOOR (LBS) WEIGHT="53 / 163"

###  (bldg5406-hvac-demo-mechanical.pdf#18)
- printed values: 6; exact 0; missed 6 (service 1, gpm 1, head_ft 1, motor_hp 1, volts 1, phase 1)
- key's printed headers: `SERVING`, `GPM`, `TD HEAD IN FT.`, `ELECTRICAL / HP`, `ELECTRICAL / V`, `ELECTRICAL / φ`
- sheet graph's headers: `MARK`, `MANUFACTURER`, `GPM`, `REMARKS`
- graph row `CP-1`: MARK="CP-1" · GPM="4 40" · REMARKS="MECH. RM STAINLESS STEEL HOUSING AND BMS CONTROLS" · MANUFACTURER="MAGNA3 32-60 F (N)"
