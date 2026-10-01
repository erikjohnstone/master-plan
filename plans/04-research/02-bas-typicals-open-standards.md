<!--
Research report for the assemblies goal (plans/04-assemblies-plan.md,
opentakeoff-corpus/goals/ASSEMBLIES.md). Produced 2026-09-23 by a research
agent working for the coordinator; kept verbatim so the goal loop can cite it.

Evidence limits: [P] = read in the primary document or cloned open-source
repo; [S] = search-summary only (re-check before relying on it); [I] = the
agent's own inference. The coordinator re-verified, from the downloaded
files: UFC 3-410-01 (28 Jul 2025) "APPROVED FOR PUBLIC RELEASE; DISTRIBUTION
UNLIMITED" and its Table 3-1 "DDC Minimum Points List"; the Modelica
Buildings Library v14.0.0 G36 TerminalUnits/Reheat/Controller.mo connector
list; the 223P TTL's Apache-2.0 dcterms:license; the Haystack defs/Xeto
AFL-3.0 LICENSE files. Scratch paths under /tmp mentioned below belonged to
the research session and no longer exist. Scope: US market only.
-->

# BAS typicals: vendor-neutral sources, how estimating tools structure them, a proposed data model and a starter catalogue

**How to read the tags.** [P] means I read it in the primary document or cloned repo, with the section or file cited. [S] means it comes only from a web-search summary. [I] means it is my own inference. No files in /home/user/master-plan were changed. All scratch material (PDF text, clones, parsers) is in `/tmp/claude-0/-home-user-master-plan/ea56aded-ac3c-5d57-8b45-280b541c9fd9/scratchpad/assemblies-B/`. I applied the US-only scope: IP units and CSI MasterFormat.

## Bottom line
- **Shippable backbone:**
  - **Federal documents (US Government works):** UFGS 23 09 00, 23 09 13, 23 09 93 and 23 09 23.02, UFC 3-410-02, and **UFC 3-410-01 (2025) Table 3-1 "DDC Minimum Points List"**, which I found during this work. Both UFCs are marked "APPROVED FOR PUBLIC RELEASE; DISTRIBUTION UNLIMITED" [P]. A search summary says UFC/UFGS are public domain and not copyrighted [S].
  - **LBNL Modelica Buildings Library G36 blocks** (BSD-3-Clause-LBNL [P]) give the exact G36 inputs and outputs for each variant.
  - **Vocabularies:** ASHRAE 223P (the ontology file is Apache-2.0, © ASHRAE [P]) for device roles, and Haystack Xeto `ph.points` (AFL-3.0 [P]) for point-function names.
- **No public source packages "typical = points + devices + responsibility + labor".** Only the commercial estimating tools do, and their libraries are proprietary [S]. The closest open analogues:
  - Haystack Xeto `ashrae.g36` defines 5 G36 VAV point-set templates [P].
  - 223P's G36 extension uses SHACL shapes to state minimum points [P].
- **Gaps:**
  - UFGS 23 09 93 is from 2015 and written in LonWorks SNVT terms. It says itself that its sequences "are being updated" [P]. It has no chiller, cooling-tower, exhaust-fan, networked RTU, VRF, ERV or lab sequences.
  - The Modelica library's G36 package (v14.0.0) has no boiler plant [P].
  - The WBDG sample Points Schedule drawings could not be retrieved: the S3 listing returned 403 and the file names are unknown.

## 1. Vendor-neutral standard content

### 1a. UFGS 23 09 00 (Aug 2024, Chg 1 08/25) [P]
- **Point definition (§1.4.59):** "Physical inputs and outputs, and virtual values read from or written to a controller over the network."
- **Points Schedule (§3.3.10):** one per HVAC system. Each row is a hardware, network or configuration point. Required columns:
  - Point Name, using the naming convention
  - Description
  - DDC Hardware Identifier
  - Settings: setpoints and configuration parameters, with units
  - Range, with units
  - **I/O Type:** AI, AO, BI, BO, PULSE, NET-IN or NET-OUT. NET-IN/OUT are used only when a value is exchanged as part of a sequence or schedule, not for trending, alarms or display (§3.3.10.6).
  - Object type/instance, plus the property if it is not Present_Value
  - Niagara Station ID
  - Gets Data From / Sends Data To
  - Override: commandable, or a separate override object
  - Trend object: local or remote, type and instance
  - Alarm: generation type, Event Enrollment object, Notification Class object
  - Configuration: Operator Configurable or Configurable, and whether writable always or only when Out_Of_Service
  - Entries the contractor must supply are shown as `<___>`.
- **DDC Hardware Schedule (§3.3.9, one per project):** per device: DDC hardware ID, HVAC system name, device object ID, network number, MAC, BTL listing and profile, proprietary services, alarming (intrinsic, local or remote algorithmic), scheduling, trending, Niagara station.
- **Devices are kept separate from points.** Each device type has its own schedule:
  - Thermostat & Occupancy Sensor (§3.3.3)
  - **Valve (§3.3.4):** size, Cv, ΔP at flow, spring range, positioner range, actuator size, close-off pressure/torque, dimensions, clearance
  - **Damper (§3.3.5):** opposed/parallel, nominal and actual size, axis and frame orientation, rotation, actuator size and spring range, operation rate, positioner, actuator and end-switch location, multi-section arrangement, linkage, AMCA 511 leakage at operating ΔP
  - Project Summary and per-system Equipment Schedules (§3.3.6–3.3.7): manufacturer, model and part. These are contractor submittal fields, so **the tool should leave them to downstream selection** [I].
  - UFC 3-410-02 §5-5.1 [P] ties the two together: every device and signal on the schematic appears in the Points Schedule, except valves, dampers, fans and pumps, whose details go in their own schedules.
- **Per-system requirements (Navy tailoring option, §3.7):**
  - Minimum trended points for: air-cooled chiller CHW system, HHW with boiler, HHW with steam heat exchanger, AHU with relief fan, DOAS with energy-recovery wheel, and series fan-powered terminals (§3.7.8.5).
  - Trend intervals: 1 min for air/water temperatures, flows, command/status of dampers and valves, speeds and pressures; 15 min for zones and equipment status (§3.7.8.4).
  - PVT sampling: 100% of primary plants, AHUs and DOAS; 20% of repeating identical-sequence sets (terminal units, exhaust fans, FCUs, unit heaters) (§3.7.6).
  - For equipment with factory-packaged controls, PVT is split between the controls contractor and the equipment supplier (§3.7.3).
- **Activity list for labor hooks:** Table II (§1.5) plus §3.3–3.10 give: design drawings, product data, QC checklists, install, start-up (inspection, two-point calibration, actuator range check), PVT and endurance test, as-builts, program submittals, O&M, and training (default 32 h).
- **UFGS 23 09 23.02 (Aug 2024) [P]:**
  - A gateway may serve only one packaged unit, with ≤10 ft of non-BACnet wiring, and may not be used for built-up units or scheduling (§3.1.5.1).
  - I/O types are AI, AO, BI, BO and pulse (§2.3.2).
  - Expansion modules are allowed (§2.3.4).
  - H-O-A switches go on the points schedule (§3.1.3.5).
  - Proprietary-network exceptions: simple split DX, multi-split/VRF, and co-located chiller or boiler plants (23 09 00 §1.1.2; UFC 3-410-02 §2-4).

### 1b. UFGS 23 09 93 (Nov 2015) [P]
- Distribution: the PDF prints no distribution statement. It is a US Government work [I].
- The sequences are templates to be copied onto drawings. All modulating loops are PI. Safeties are hardwired to the starter or VFD and also monitored, with a manual reset button (RST-BUT) or a network reset. The fire alarm panel signal overrides.
- Points by sequence (mnemonics were cross-checked by script):
  - **§3.2.1 Small package unitary:** ZN-T, ZN-T-SP (occupied and unoccupied), fan ON/AUTO, HEAT-OFF-COOL[-EMERG]; outputs are fan, heat and cool stages; safeties are the manufacturer's.
  - **§3.2.2 H&V / unit ventilator:** SF-SS, SF-S, HTG-DA-T-LL freezestat, SA-SMK, [RA-SMK], RST-BUT, ZN-T, SYS-OCC, ZN-OCC, heating valve, OA/RA/relief dampers (modulating or 2-position), OA-D-MIN. Starter with HOA, fire alarm input and emergency shutoff.
  - **§3.2.3 Single zone, heating + [DX] cooling:** adds BLDG-T and BLDG-T-LL (night low limit), ECO-HL-SP and ECO-LL-SP (OA dry-bulb economizer), 2-position min-OA damper, heating valve, and DX stages or a cooling valve.
  - **§3.2.4 Dual-temperature coil:** DT-DA-T-LL, a pipe DT-supply temperature for changeover, one valve.
  - **§3.2.5 Return-air bypass:** bypass and supply dampers, 2-position CHW valve.
  - **§3.2.6 Humidity control:** PH-DA-T, -SP, -LL; ZN-RH and ZN-RH-SP; SA-RH high limit (humidifier throttles from 80% to fully closed at 90%); valves for preheat, cooling/dehumidification, reheat and humidifier.
  - **§3.2.7 Multizone / dual-duct [return fan VFD]:** RF-S, MA-T, -SP, -LL, HD-T and -SP (reset from OAT or coldest zone), CD-T and -SP, hot/cold deck damper pair per zone.
  - **§3.2.8 Hot-deck bypass multizone:** SA-T, -SP; per zone a bypass/cold-deck damper and a heating valve; airflow proof before electric heat.
  - **§3.2.9 VAV AHU [return fan]:** SF VFD with HOA, fire alarm and emergency inputs; SA-P and SA-P-SP; SA-P-HL; PH-DA-T-LL or CLG-DA-T-LL; MINOA-F and -SP with a modulating min-OA damper; F-DIFF-SP with supply and return AFMAs; MA-T and -SP; SA-T and -SP; preheat loop.
  - **§3.3.1 Cooling-only VAV:** ZN-T, ZN-T-SP (configured or occupant-adjustable), ZN-OCC, SYS-OCC, VAV-SA-F from a multipoint inlet sensor, damper.
  - **§3.3.2 VAV reheat:** adds a heating valve or staged electric heat with airflow proof.
  - **§3.3.3 Fan-powered VAV (series or parallel):** adds fan start/stop. The series fan runs whenever the AHU runs.
  - **§3.3.4 Perimeter radiation:** heating valve.
  - **§3.3.5 UH/CUH:** OFF-AUTO, heating valve, multi-speed fan, manufacturer safeties.
  - **§3.3.6 Gas infrared heater:** ON-OFF-AUTO, heater enable.
  - **§3.3.7 Dual-temperature FCU:** changeover pipe sensor, dual-temp valve (2- or 3-way), multi-speed fan.
  - **§3.4.1 HW from steam/HTHW converter:** HW-PMP-SS and -S, HWS-T and -SP (OAT reset), steam/HTHW valve.
  - **§3.4.2 Single-building boiler:** pump S/S with proof, boiler on/off, 3-way mixing valve, HWS-T reset.
  - **§3.4.3 Dual-temperature with heat exchanger + CHW:** DTW-PMP-SS, HEATING/COOLING switch, switchover valve, DTWR-T, -HL and -LL, HX-P-LL hardwired to the valve, chiller enable.
  - **§3.4.4 Secondary variable-speed pump:** VFD, differential-pressure tap and sensor.

### 1c. UFC 3-410-02 (2018, Chg 2 2021) [P]
- **Required drawing set (§5-1):** index, legend, Points Schedule instructions, and per system: control schematic, ladder diagram, optional control logic diagram, sequence, points schedule, thermostat & occupancy-sensor schedule, occupancy schedule, damper schedule, valve schedule. Sample drawings are on the WBDG "Forms, Graphics and Tables" page (§5-2); I did not fetch them.
- **Appendix D, Points Schedule columns:**
  - Function, Point Name, Description, DDC HW ID, Setting, Range (sensor range or actuator stroke direction), I/O Type (e.g. "AI / NET-OUT")
  - HOA Required (Y); Config Type (H = hardware, C = configurable, O = operator-configurable)
  - M&C View/Override and LDP View/Override (V, O or VO); Trend Required
  - Alarm condition, priority (INFO or CRIT), and routing group
  - Protocol-specific columns
  - Bracket conventions: `[ ]` is for the designer, `< >` for the contractor, `~` means null, N/A means impossible.
  - Each column states who is responsible for it: designer, building controls contractor or UMCS contractor (§5-4.2). This is a responsibility model for documentation, separate from physical responsibility.
- **Appendix E naming convention:** W-X-Y-Z-##, i.e. descriptor (SA, MA, MINOA, CHWS, CT, EF…), variable or device (T, P, F, RH, CO2, D, V, PMP, FLT, SMK), and modifiers (C, SS, S, ENA, HL, LL, SP, ALM, 2P, OCC…). Table E-4 lists the full point set for a VAV AHU with return fan.
- **Other rules:**
  - §3-8.3: the contractor may split a sequence across several controllers.
  - §4-5.4: a networked VFD or smart sensor counts as DDC hardware.
  - §4-5.5: prefer overrides to H-O-A switches.
- **UFC 3-410-01 (28 Jul 2025) [P]:**
  - §3-2.3.4 (IMC 309.1) requires Table 3-1 minimum points, including for packaged units. The table has four lists: HW heating system, VAV system, CHW system, air distribution system, plus building meters and the HVAC shutdown-switch status.
  - Army and Air Force projects prohibit CO2 ventilation control without approval (401.1).
  - VRF requires owner approval and open controls (§2-15).

### 1d. UFGS 23 09 13 (Nov 2015, Chg 2 05/21) as a device-role taxonomy [P]
- **Valves (§2.5):**
  - Service: liquid ≤150°F, >150°F, steam, HTHW ≥250°F (the last must be normally closed).
  - Body: globe, ball, butterfly (≥4"), or PICV (±5% flow, ≤5 psid minimum, P/T ports, flow tag).
  - 2-way or 3-way; modulating, or 2-position at full line size.
  - Cv. Characteristic: equal-percentage for liquid, linear for steam and 3-way.
  - Close-off: 150% of pump dead-head (2-way) or 200% of valve ΔP (3-way) (§2.9.1.1).
  - Fail position NO, NC or FILP; FCI 70-2 leakage class III/IV (butterfly VI); pressure class 150% of design; glycol compatibility.
- **Dampers (§2.6):** flow-control parallel or opposed blade; AMCA 511 class 1A/1/2 (class 3 for mechanical-room ventilation); ≤0.04 in. w.c. at 1000 fpm; rated ≥2000 fpm. Smoke and fire/smoke dampers per UL 555/555S.
- **Actuators (§2.9.1):**
  - Electric or pneumatic; NO/NC spring-return or FILP; position feedback on primary equipment; ≤90 s stroke.
  - Signal 4–20 mA, 0–10 V, or floating (non-failsafe only).
  - Torque ≥6 in-lb/ft² (opposed blade) or 9 in-lb/ft² (parallel blade).
  - Fail-safe rules (§3.1.12.1, §3.1.13.1): spring return where freeze or force protection applies; OA, makeup and relief dampers fail closed; terminal units may be non-spring-return.
- **Temperature sensors, by medium:**
  - Space ±0.5°F; duct ±0.5°F; OA ±1°F (30–130°F); CHW ±0.8°F (35–65°F); HW, DTW and CW ±2°F; HTHW ±3.6°F; drift ≤0.25°F/yr.
  - Form factors: room, duct probe, averaging (1 ft per ft², minimum 5 ft), immersion with well, OA with shield.
- **Other sensors:**
  - RH ±2 or 3%; bulk-polymer element for duct high-limit.
  - CO2 NDIR, 0–2000 ppm, ±50 ppm.
  - DP sensor: range ≤150% of the schedule's high value, ±1% FS. DP switch: setpoint within 25–75% of range.
  - AFMA pitot or thermal, ±5%. Liquid flow meters: orifice, venturi, turbine, vortex, ultrasonic, magnetic, paddle. Flow switch.
  - CT (±0.5/2%) and CSR (split-core, VFD-rated). Watt/kWh transducers, revenue meter, steam meter, BTU meter.
  - Occupancy sensors (PIR, ultrasonic, dual-tech; 15-minute delay).
  - Freezestat (manual reset, 1 ft per ft², two contacts), aquastat, damper end switch, vibration switch, water-quality analyzers.
- **Outputs and user devices:** relays, EP/EPS, user input devices; multifunction CSR command switch; space sensor module (temperature plus any of setpoint adjust, occupancy button, HEAT-COOL-OFF, AUTO-ON, fan speed).
- **Installation rules that affect roles:**
  - Duct static tap at 75% of the distance along the duct (§3.1.9).
  - Duct RH sensor ≥10 ft downstream of the humidifier (§3.1.10).
  - Safeties must act in both HAND and AUTO (§3.1.6.2).

### 1e. ASHRAE G36 in LBNL's Modelica Buildings Library [P]
- **Version and license:** lbl-srg/modelica-buildings v14.0.0, commit a3cfdde (2026-09-16). `Buildings/legal.html` is a revised 3-clause BSD with an "Enhancements" clause (BSD-3-Clause-LBNL).
- **Parsed controllers:** `Buildings/Controls/OBC/ASHRAE/G36/...`: TerminalUnits {CoolingOnly (27 connectors), Reheat (35), ParallelFanCVF (40), ParallelFanVVF (41), SeriesFanCVF (39), SeriesFanVVF (40), DualDuctSnapActing (40), DualDuctMixConInletSensor (37), DualDuctMixConDischargeSensor (34), DualDuctColdDuctMin (37)}; AHUs/MultiZone/VAV (50); AHUs/SingleZone/VAV (55); FanCoilUnits (29); Plants/Chillers (59). **There is no boiler plant.**
- **How I mapped connectors to I/O [I]:**
  - Measured Real inputs → AI.
  - Field Boolean status → BI.
  - `y*` Real outputs → AO; `y1*` Boolean outputs → BO.
  - Integer modes, trim-and-respond requests, alarms and override indices, and all upstream/downstream values → NET or soft.
- **Terminal units:**
  - **Every VAV:** AI TZon, TDis and VDis_flow (the discharge-air temperature is present even on cooling-only); AO yDam.
  - **Options (each a parameter):** u1Win BI (`have_winSen`), u1Occ BI (`have_occSen`), ppmCO2 AI (`have_CO2Sen`).
  - **Network:** in: TSup, TSupSet, u1Fan (AHU fan status), uOpeMod, oveFloSet, oveDamPos. Out: VSet_flow, SAT and static-pressure reset requests, ventilation sums, and alarms for low flow, flow-sensor calibration and leaking damper.
  - **Reheat:** adds AO yVal (hot water, or modulating electric via `have_hotWatCoi`), u1HotPla, yHeaValResReq, yHotWatPlaReq, and alarms for leaking valve and low DAT.
  - **Fan-powered:** adds BO y1Fan and BI u1TerFan (terminal fan status), a fan-status alarm, and AO VFan_flow_Set on the VVF variants. The parallel-fan airflow AI exists only when a CO2 sensor is configured.
  - **Dual duct:** AO yCooDam and yHeaDam; cold- and hot-duct flow AIs (inlet-sensor variants) or one discharge flow AI; NET-IN cold/hot duct supply temperature and AHU status.
  - Zone setpoints come from `ThermalZones/Setpoints.mo`, with AI setAdj/cooSetAdj/heaSetAdj from the wall module, plus u1Occ and u1Win.
- **Multizone VAV AHU variants** (`Types/*.mo`):
  - `minOADes` {DedicatedDampersAirflow, DedicatedDampersPressure, SingleDamper}
  - `buiPreCon` {BarometricRelief, ReliefDamper, ReliefFan, ReturnFanMeasuredAir, ReturnFanDp}
  - `ecoHigLimCon` {Fixed/Differential dry-bulb, combined, Fixed/Differential enthalpy + fixed dry-bulb}
  - `cooCoi` {None, WaterBased, DXCoil}; `heaCoi` {None, WaterBased, Electric}
  - `freSta` {No_freeze_stat, Hardwired_to_equipment, Hardwired_to_BAS}
- **Multizone AHU I/O:**
  - AI: dpDuc, TOut, TAirSup, TAirMix, VAirOut_flow or dpMinOutDam, TAirRet, hAirOut/hAirRet (enthalpy, so T+RH sensors), dpBui, VAirSup_flow/VAirRet_flow.
  - BI: u1SupFan, u1FreSta, u1RelFan.
  - AO: ySupFan, yRetFan, yRelFan, yOutDam, yRetDam, yRelDam, yMinOutDam, yCooCoi, yHeaCoi.
  - BO: y1SupFan, y1RetFan, y1RelFan, y1RelDam, y1MinOutDam, y1EneCHWPum.
  - NET: CHW/HW reset and plant requests, TAirSupSet, yAla.
- **Single-zone AHU:** adds space inputs (setpoint adjust, occupancy, window, CO2), actual-speed and valve-position feedback AIs, and BO y1ExhDam.
- **FCU:** AI TZon and TSup; BI u1Fan; BO y1Fan; AO yFan, yCooCoi, yHeaCoi. Coils are CHW or DX for cooling, HW or electric for heating.
- **Chiller plant:**
  - Per chiller: BO yChi, BI uChi, TChiWatSupSet, CHW and CW isolation valves (BO/AO, with end-switch BI or position AI), and chiller-provided uChiWatReq/uHeaPreCon (network).
  - Pumps: enable/status arrays and speed AO.
  - Plant: min-flow bypass AO, dp local/remote AI, VChiWat_flow, TChiWatSup/Ent. yChiDem is written "through BACnet or similar".
  - Towers: yTowCel/uTowSta per cell, yTowFanSpe, isolation valves with end switches, watLev AI, yMakUp BO.
  - Waterside economizer: temperatures, HX pump and bypass valve.
  - Variant flags: nChi, have_airCoo, have_parChi, have_WSE, have_fixSpeConWatPum, have_heaConWatPum, chiIsoValTyp, closeCoupledPlant, tower valve flags.
- **Buildings.Templates component enums (BSD):** valve {2/3-way × modulating/2-position}, damper {modulating, pressure-independent, 2-position} × blades, fan {SingleConstant, SingleVariable, ArrayVariable}, pump {Single, Multiple} × {Dedicated, Headered}, sensor types incl. temperature {Standard, Averaging, InWell} and flow {AFMS, FlowCross, FlowMeter}, heat recovery {FlatPlate, EnthalpyWheel, RunAroundCoil}.
- **ctrl-flow** (lbl-srg/ctrl-flow-dev @9063e34, BSD-3-style © 2023 UC/LBNL, Taylor Engineers et al.):
  - Today it exports only the edited G36 sequence as .docx.
  - "Points List" (pdf), "Equipment Schedules" (csv) and "CDL" (json) are commented out in `client/src/components/modal/DownloadModal.tsx`.
  - `specification/source/requirements.rst` says point-list generation will be done by an LBL module that is "ongoing development".
  - Coverage per the lbl-srg/ctrl-flow README: multizone AHU, cooling-only VAV, reheat VAV.
- **modelica-json** (BSD-LBNL @5460add) can output `-o semantic`, `cxf` (ASHRAE 231P) and `doc+` (sequence plus the list of all variables). The G36 blocks carry no semantic annotations.

### 1f. Brick, Haystack, 223P [P]
- **Brick v1.5.0** (BSD-3, @fb456a6):
  - Sensor, Setpoint, Command, Status, Alarm and Parameter are all subclasses of **Point** (`generate_brick.py:904-909`). A sensor in Brick is data, not a device.
  - Valves, dampers, VFDs (Fan_VFD, Pump_VFD), controllers, thermostats and VAV/FCU types are Equipment. Relations: hasPoint, feeds, hasPart, hasQuantity (QUDT).
  - `extensions/` carries 223P mappings.
  - Verdict: good for point-function IDs, weak for device roles.
- **Haystack:**
  - defs (AFL-3.0) define `equip`, `point` and `device`, where `device` means microprocessor hardware only. `pointFunction` is **sensor** ("AI/BI"), **cmd** ("AO/BO") or **sp** (setpoint or soft point) (`src/phIoT/lib/point.trio`). Actuators are equips with cmd and sensor child points (`actuator.trio`).
  - **Xeto** (AFL-3.0, 2026-09-23): `ph.points` has 183 specs (e.g. `DischargeAirTempSensor` via `DuctAirTempSensor`, `WaterValveModulatingCmd`, `FanRunCmd`, `FanSpeedModulatingCmd`, `DamperOpenSensor`).
  - **`src/xeto/ashrae.g36/vavs.xeto`** defines G36 VAV templates as point sets. The base `G36Vav` has ZoneAirTempSensor, ZoneAirTempEffectiveSp, ZoneOccupiedSensor and ZoneCo2Sensor; the reheat, cooling-only, fan-powered and two dual-duct templates extend it.
- **223P** (`open223/open223.info` repo is BSD-3; the header of `223p.ttl` says Apache-2.0, "Copyright 2026 ASHRAE", "v1.0.0-2026"):
  - Equipment classes include **Sensor** {Temperature, Pressure, Flow, Humidity, Concentration, Occupancy, ElectricCurrent, Voltage…}, Actuator, Controller, Damper, Valve {TwoWay, ThreeWay}, Fan, Pump, Coil, TerminalUnit {SingleDuct, FanPowered, DualDuct}, AHU, FCU, Boiler, Chiller, CoolingTower, Humidifier, FumeHood.
  - Properties are Observable, Actuatable or Enumerable. Relations: observes, actuates, hasObservationLocation, hasRole (Role-Supply, Return, Relief, Exhaust, OutdoorAirIntake, Economizer, HeatRecovery…), and hasExternalReference/BACnetExternalReference.
  - A G36 extension defines SHACL rules: a Fan needs a start/stop command; a FanWithVFD needs a speed command; a Damper needs an analog command or two binary ones; a HotWaterCoil must be connected to a HotWaterValve.
  - `open223/models.open223.info` has G36-2021 Figures A-1…A-4, A-7…A-9, A-11 and A-12 as models listing physical devices. For example, A-2 (VAV reheat) has a damper with actuator, discharge flow sensor, DAT sensor, reheat valve with actuator, and reheat supply/return water temperature sensors. I saw no LICENSE file in that repo.
  - I could not confirm via search whether 223 has been finally published as an ANSI standard [S].
- **Recommendation [I]:**
  - Device-role class = 223P.
  - Point function = Xeto `ph.points` name (Brick class as an alternate ID).
  - Display name = UFC Appendix E mnemonic.
  - All three licenses are permissive; ship them with NOTICE/attribution files (not legal advice).
  - The text of G36, Guideline 13 and 223 themselves is © ASHRAE. Do not copy their prose.

### 1g. Owner standards [S]
- **JBLM/YTC "DDC Systems' Minimum Points Required":** covers AHUs, DOAS, heat-recovery units and VAV; ATFP/emergency-shutdown status must appear on every graphic. It is derived from UFC 3-410-01 Table D-1, which is now Table 3-1 [P].
- **FSU "2011 Control Standards" IC-16** (single-duct VAV with HW or electric reheat, "minimum requirements", rev 1.0, 22 Jul 2011) and IC-15 (cooling-only).
- Kutztown "Recommended BAS I/O Control Points by Equipment", Harvard Medical School Div 25, UConn Appendix V, TAMU and Illinois State follow the same per-equipment pattern: I/O type, tag, alarm, trend, graphic.
- Treat these as reference patterns only; their licensing is unclear [I].

## 2. How BAS estimating tools structure a typical [S]
- **ICS Concerto:** "80+ pre-built systems, each with labor, material, schematics, sequences, PDF cutsheets, point lists". I/O point data is attached to parts to produce point counts, populate schedules and select controllers. Labor categories are customizable. Cost templates cover rates, overhead and margin per office, labor group and job type. Labor factors export to MS Project.
- **Bidtracer:** drag-and-drop "predefined systems/assemblies" with versions, custom cost codes and labor groups, BOM, a valve-schedule tool, and a web engineering tool (stencils and kits producing wiring, flow and sequence).
- **PataBid Quantify:** pre-built assemblies for DDC controllers, sensors, actuators, valves, wiring and panel building, with labor units. Its takeoff "typicals" auto-count instrumentation and panels.
- **McCormick ABS:** 55,000+ items and 25,000 prebuilt assemblies; labor units populate during takeoff.
- **D-Tools SI:** packages, allowances and "Solutions" (bundles of products, labor items and packages). Labor types and phases default to Rough-In, Trim, Finish and Programming, with multiple labor types per item. Totals roll up by system, room or equipment.
- **Common pattern [I]:**
  - A typical is a bill of parts, each part carrying an I/O signature, plus labor by category, plus documents.
  - Controller choice and spare capacity come from rolled-up point counts per panel.
  - Integration is counted as network points and devices.
  - Variants are clone-and-edit copies, not rule-selected. None of this content is open.

## 3a. Proposed data model, `bas_typical_v1` [I]
This belongs on the **shared path** under AGENTS.md: expanding a typical produces quantities and point answers. It lines up with the existing engine:
- `opentakeoff/bas_engine/assemblies.py` has `AssemblyComponent.component_kind`, `Quantity(basis=per_equipment)`, and `ResponsibilityClaim` with activity furnish/install/wire/program/test and assignment factory_furnished/field_installed/named_party/by_others/unknown.
- `models.py` has `PointRequirement` (an AI/AO/DI/DO `IOVector` plus soft variables), `SparePolicy` and `HardwareProfile`.
- `hardware.py` already does the controller roll-up.
- Map BI→DI and BO→DO. Rows expanded from a typical must be `origin: explicit_decision` with a provenance reference, never `source_declaration`, so they stay distinguishable from printed points lists.

**Typical fields:**
- `typical_id`, `version`, `title`.
- `equipment_class`: the tool's class, plus 223P, Brick and Haystack IDs.
- `selector`: a predicate over schedule attributes (e.g. `heating_coil.medium=="HW" && terminal_fan==null`), with a specificity rank.
- `options[]`: `{id, label, default, auto_selector?, adds[], removes[], policy_note}`. Example: CO2 defaults off on DoD Army/AF jobs.
- `device_roles[]`:
  - `role_id`, `s223_class`, `component_kind`, `medium`, `location_role` (223P Role-*), `fail_position`, `qty_rule` (per equipment, per stage, per cell, per chiller).
  - `params`: each value is a literal default, `from_schedule:attr` (gpm, cfm, hp, V/ph, kW, EWT), or `"<contractor>"` (the UFC bracket). Parameter sets follow §1d.
  - `responsibility{furnish, install, wire, program, test}` → {party: controls (23 09), mechanical (23), electrical (26), fire alarm (28), factory, owner, TBD}.
  - `lifecycle`.
  - **No manufacturer, model, part or price fields.**
- `points[]`:
  - `point_id`, `function` (Xeto spec), `brick_class`, `display` (UFC W-X-Y-Z), `description`.
  - `io` ∈ {AI, AO, BI, BO, PULSE, NET-IN, NET-OUT, SOFT}; `signal` (4–20 mA, 0–10 V, dry contact, triac, floating, network).
  - `qty_rule`, `device_role_ref`, `option_ref`.
  - Supervisory columns (Appendix D): `hoa`, `config H/C/O`, `mc V/O/VO`, `ldp`, `trend{interval_class}`, `alarm{condition, INFO|CRIT}`.
  - `range` and `setting` default to `"<contractor>"`.
- `integration?`: `{interface: BACnet IP / MS/TP / gateway, exposed_points[], rule: UFC 2-4 or 23 09 23.02 §3.1.5}`.
- `controller_rollup`: `{class: application-specific / programmable / packaged-onboard / gateway, allocation: dedicated or shared_panel, spare_policy_ref, ldp, enclosure by location (NEMA 1/2/3/4)}`.
- `labor_hooks[]`: `{task, driver, phase}`, with no rates or hours.
  - Tasks: PM; shop drawings (schematic, points schedule, DDC HW / valve / damper schedules, riser, wiring); submittals; programming per sequence and per point; graphics; device install per role; termination per hardwired point and per network drop; start-up (two-point calibration per AI, range check per actuator); PVT (100% primaries, 20% repeating typicals); endurance trending; TAB support; training; as-builts and O&M; integration per gateway and per mapped point.
  - Drivers: `per_typical`, `per_role:X`, `per_hw_point`, `per_net_point`, `per_system`.
- `provenance[]`: `{source, edition, locator (section / connector path), license SPDX, derivation: verbatim / paraphrase / inferred, reviewer, date}`.
- `status`: public_default, partner_edited or partner_imported.

**Schedule attributes that select variants [I]:**
- VAV: coil medium (HW gpm/EWT vs electric kW/stages), fan (series/parallel, ECM), dual inlets.
- AHU/RTU: zones served (one vs VAV boxes tagged to the AHU), supply-fan VFD, return/relief fan tagged to the AHU, economizer / max OA, OA station, coils (CHW, DX tons/stages, HW, steam, electric, gas), humidifier, heat-recovery type, 100% OA.
- FCU: coil count and changeover, electric kW, ECM.
- Pumps: VFD, quantity, duty/standby.
- Fans: drive type, "interlock with…" or "by BAS".
- Chillers: air- vs water-cooled, count.
- Towers: cells, VFD.
- Boilers: count, "BACnet interface / plant manager".
- UH/CUH: medium.
- VRF: central controller or gateway.
- Humidifier: type and lb/hr.
- HX: steam-to-HW or plate.
- Lab: venturi valve and fume-hood monitor.

## 3b. Starter catalogue [I, built from the cited P sources]
Codes: AI/AO/BI/BO/NET; "opt" means an option.

1. **VAV cooling-only**
   - Selected by: no coil, no fan.
   - Points: ZN-T AI; DA-T AI; SA-F AI; damper AO (or floating 2×BO); opt setpoint-adjust AI, ZN-OCC BI, CO2 AI, window BI; NET-IN AHU SA-T, AHU fan status, mode/schedule; NET-OUT flow setpoint, SAT and static requests, ventilation sums, 3 alarms.
   - Roles: terminal controller; damper actuator (non-spring-return allowed); inlet flow sensor with DP transducer; duct DAT probe; space sensor module; opt occupancy/CO2 sensor; 24 VAC transformer.
   - Sources: MBL TerminalUnits/CoolingOnly; UFGS 23 09 93 §3.3.1; UFC 3-410-01 T3-1; Xeto `G36CoolingOnlyVav`; 223P A-1.
2. **VAV reheat, HW**
   - Adds: HW valve AO (2-way modulating, Cv from schedule); NET plant status and requests; alarms for low DAT and leaking valve; opt reheat supply/return water temperature AIs.
   - Sources: MBL Reheat; 23 09 93 §3.3.2; 223P A-2; FSU IC-16 [S].
3. **VAV reheat, electric**
   - Adds: stage BOs or an SCR AO; heat status; airflow-proof interlock (factory).
   - Power wiring is Div 26.
4. **Series fan-powered** (CVF or VVF, HW or electric heat)
   - Adds: fan S/S BO; fan status BI (CSR); VVF/ECM speed AO.
   - Sources: MBL SeriesFanCVF/VVF; 23 09 00 §3.7.8.5.6; UFC T3-1.
5. **Parallel fan-powered:** same as 4, but the fan runs in heating. Parallel-fan flow AI only when CO2 ventilation control is used. Source: MBL ParallelFan*.
6. **Dual-duct terminal** (snap-acting, mixing with inlet or discharge sensor, cold-duct-min)
   - Points: 2 damper AOs; 1–2 flow AIs; DA-T AI; NET hot/cold supply temperatures.
   - Source: MBL DualDuct*.
7. **Single-zone VAV AHU / hardwired RTU**
   - Points: SF S/S BO, status BI, speed AO, speed feedback AI; OA-T, SA-T, MA-T (HW coil), RA-T (differential dry-bulb), OA/RA RH (enthalpy); ZN-T, setpoint adjust, occupancy, CO2; OA/RA/relief damper AOs; CLG valve AO or DX stage BOs; HTG valve AO with feedback AI; freezestat BI (hardwired); SA-SMK and RA-SMK BI; filter DP AI (opt); shutdown-switch status BI.
   - Sources: MBL SingleZone/VAV; 23 09 93 §3.2.3–3.2.6; UFC T3-1.
8. **Multizone VAV AHU**
   - Points as in §1e, switched by `minOADes`, `buiPreCon` and `ecoHigLimCon`. Plus SA-P-HL BI hardwired, PH-/CLG-DA-T-LL, duct-static tap role, and SA dewpoint (UFC T3-1).
   - Sources: MBL MultiZone/VAV; 23 09 93 §3.2.9; UFC Table E-4; 223P A-9; 23 09 00 §3.7.8.5.4.
9. **Constant-volume AHU and unit ventilator:** from 23 09 93 §3.2.2–3.2.8 (list in §1b).
10. **DOAS with energy recovery**
    - Points: OA T/RH; OA isolation damper command + end switch; OA flow; wheel command/status/speed; bypass dampers (OA and EA) command/status; defrost command/status; wheel leaving T/RH on both streams; preheat, cooling and reheat valves and LATs; SF speed; static; facility pressure; RA T/RH; EF speed; EA isolation damper.
    - Source: 23 09 00 §3.7.8.5.5.
11. **FCU 4-pipe / 2-pipe**
    - Points: ZN-T AI; SA-T AI; fan S/S BO; fan status BI; ECM speed AO or 3 speed BOs; CHW and HW valve AOs (2-pipe: one valve plus a changeover pipe sensor or NET); opt electric heat, occupancy, setpoint adjust, window.
    - Roles: controller; unit- or wall-mounted sensor; valves and actuators (non-spring-return allowed).
    - Sources: MBL FanCoilUnits; 23 09 93 §3.3.7.
12. **UH / CUH**
    - Points: space temperature AI; fan S/S BO (multi-speed); HW valve AO, 2-position BO, or electric/gas enable BO; OFF-AUTO; opt fan status.
    - Source: 23 09 93 §3.3.5. Gas infrared heater: §3.3.6. Perimeter radiation: §3.3.4.
13. **RTU with network integration**
    - Roles: factory controller with BACnet interface or single-unit gateway (≤10 ft); packaged per 23 09 00 §1.4.54.
    - Exposed NET points: occupancy/enable command, setpoints, SAT, OAT, zone temperature, fan status, cooling/heating stage status, economizer position, alarms. Hardwired extras: smoke detector, shutdown switch.
    - The exposed-point list is [I]; the rules are 23 09 23.02 §3.1.5.
14. **Split DX / VRF**
    - Open interface plus a points schedule at the interface (UFC 3-410-02 §2-4.1/2-4.2). VRF: gateway, one manufacturer, factory program not field-programmed, owner approval (UFC 3-410-01 §2-15).
    - Per indoor unit NET: on/off, mode, setpoint, room temperature, fan speed, filter, fault. Per outdoor unit NET: status, alarm [I].
15. **Pump, constant speed**
    - Per pump: S/S BO; status BI (CSR, DP or flow switch); HOA.
    - Duty/standby: per-pump points plus rotation/failover logic [I]; G36 pump arrays.
16. **Pump, VFD**
    - Adds: speed AO; speed/fault via NET or AI/BI; system DP AI (remote tap); min-flow bypass AO (CHW).
    - Sources: 23 09 93 §3.4.4; UFC T3-1; MBL chiller plant.
17. **Fan (EF/SF/RF), constant:** status BI (UFC T3-1), S/S BO [I], damper interlock with end switch (23 09 13 §2.7.21).
18. **Fan, VFD/ECM:** adds speed AO, feedback and fault; pressure/CO sensor when the fan is pressure- or CO-controlled [I].
19. **Boiler(s) + HW system**
    - Per boiler: enable BO, status BI, alarm BI, isolation valve command/status. Plant: HWS/HWR AI, flow AI, pump DP, min-flow bypass AO, OA-T, mixing valve AO, condensate pump status, pumps (15/16).
    - Flame safeguard and limits remain factory controls. Plant-manager gateway only under UFC §2-4.3.
    - Sources: 23 09 93 §3.4.2; 23 09 00 §3.7.8.5.2; UFC T3-1.
20. **Chiller(s) + CHW system**
    - Per chiller: enable BO, status BI, alarm BI, CHWS setpoint (AO/NET), demand limit NET, CHW/CW isolation valves with end switches, EWT/LWT and flow per chiller.
    - Plant: CHWS/CHWR, common-pipe temperature, DP, secondary flow, bypass AO.
    - Integration: requests and head-pressure signal via NET.
    - Sources: MBL Plants/Chillers; 23 09 00 §3.7.8.5.1; UFC T3-1.
21. **Cooling tower / CW:** per cell enable BO, status BI (2 of each for two-speed), speed AO, VFD alarm, inlet/outlet isolation valves with end switches, CWS/CWR AI, bypass AO, basin level AI, makeup BO; opt vibration switch, basin heater [I].
22. **Heat exchanger (steam/HTHW→HW or plate)**
    - Points: steam valve AO (globe, linear, normally closed / spring return); HWS-T AI and setpoint; both-side inlet/outlet AIs; isolation valve command/status; HX-P-LL hardwired; condensate pump status.
    - Sources: 23 09 93 §3.4.1/3.4.3; 23 09 00 §3.7.8.5.3; UFC T3-1.
23. **Humidifier**
    - Points: modulating AO; enable BO; alarm BI; space/RA RH AI; SA-RH high-limit AI (≥10 ft downstream); airflow-proof interlock.
    - Sources: 23 09 93 §3.2.6; 23 09 13 §3.1.10.
24. **ERV/HRV** (wheel, plate or run-around)
    - Points: wheel S/S BO; rotation status BI; speed AO; bypass damper AO/BO; frost control; four-stream T (RH on wheels); run-around pump plus 3-way valve. Packaged ERV → NET variant.
    - Sources: 23 09 00 §3.7.8.4.1/§3.7.8.5.5; UFC T3-1; MBL Templates HeatRecovery.
25. **Lab airflow**
    - **No primary source read.** [I]: supply/exhaust valve flow AI and command AO, fume-hood sash/face-velocity alarm, room offset/pressure AI, usually network-integrated from the lab-controls package. 223P and Brick have FumeHood.
    - Needs partner validation.
26. **Building-level / meters:** OA-T/RH/dewpoint, scheduler, electric/water/gas/steam meters (pulse or NET), BTU meters, HVAC shutdown-switch status. Sources: UFC T3-1; 23 09 13 §2.7.8; 23 09 93 §3.1.

**Default responsibility (editable).** Controls contractor (23 09 / 25) furnishes, installs, wires, programs and tests BAS devices. The following come from university specifications found in searches [S]:
- VFDs: furnished by Div 23, installed by Div 26.
- Duct smoke detectors: furnished and wired by fire alarm (Div 28), installed by mechanical.
- Power wiring: Div 26.

The following are my inference [I]:
- VAV flow sensors are factory; the box controller and actuator are often factory-mounted but furnished by the controls contractor.
- Packaged-unit controls are factory furnished.

**Licensing summary**
- **Ship as-is (with attribution):** UFGS and UFC text (US Government); BSD-3-Clause-LBNL (MBL, ctrl-flow, modelica-json); BSD-3 (Brick, open223 site); AFL-3.0 (Haystack defs and Xeto); Apache-2.0 (223P TTL, © ASHRAE).
- **Reference only, do not ship:** G36, Guideline 13 and 223 standard text (© ASHRAE); owner standards; estimating-tool libraries.

**Follow-ups**
- Get the WBDG sample Points Schedules (PDF/DWG/XLSX) from https://www.wbdg.org/dod/ufgs/ufgs-forms-graphics-tables. They are per-system tabular point sets.
- The JBLM and FSU PDFs were blocked by the proxy (403).

Sources [S]: https://www.ics-controls.com/ent-features · https://bidtracer.com/buildingautomationcontrolsestimatingsoftware.html · https://www.patabid.com/building-automation-estimating-software · https://www.mccormicksys.com/industries/automated-building-systems/ · https://docs.d-tools.com/en/articles/9216152-solutions · https://support.d-tools.com/01_SI_Documentation_(v20)/Knowledge_Base/Phases_and_Labor_Types_in_v20 · https://www.jblmdesignstandards.army.mil/Portals/109/DocumentRepositoryForDSLinks/Div-23/DDC%20Minimum%20Points%20List%20Required.pdf · https://www.facilities.fsu.edu/depts/designConstr/2011%20Control%20Standards/Controls/IC-16/IC-16%20VAV%20Box%20With%20Reheat.pdf · https://www.kutztown.edu/Departments-Offices/M-R/ProjectServices/Documents/400Appendices/416RecommendedControl%20Points.pdf · https://hms.harvard.edu/sites/default/files/Campus%20Planning%20and%20Facilities/Division%2025.pdf · https://www.wbdg.org/dod/ufgs · https://www.wbdg.org/dod/ufgs/ufgs-forms-graphics-tables · https://facilities.gatech.edu/sites/default/files/section_15900-230900-jci_2015_edit.doc · https://www.ashrae.org/technical-resources/bookstore/ashrae-guideline-13-specifying-building-automation-systems · https://docs.open223.info/