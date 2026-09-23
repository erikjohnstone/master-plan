<!--
Research report for the assemblies goal (plans/04-assemblies-plan.md,
opentakeoff-corpus/goals/ASSEMBLIES.md). Produced 2026-09-23 by a research
agent working for the coordinator; kept verbatim so the goal loop can cite it.

Evidence limits: [std] = a public guide spec (UFGS or VA master spec) read in
full from the WBDG S3 bucket; [3P] = a project spec / owner standard read in
full unless marked (S); [V] = vendor material; (S) = search-summary only —
re-check before relying on it; [inf] = the agent's own inference. The
coordinator re-verified from the downloaded file that VA 23 09 23 (03-01-23)
carries the "Responsibility Table" with Furnish / Install / Low Voltage
Wiring / Line Power columns and the rows quoted in §4. Scratch paths under
/tmp mentioned below belonged to the research session and no longer exist.
Scope: US market only.
-->

# Mechanical equipment hook-up assemblies in US practice: contents, variants, estimating software, labor units and responsibility

Most variant choices in a hook-up assembly come from the project spec or the owner's standard, not from the equipment schedule. The schedule gives you size, GPM, pressure drop, service and pump or boiler type. The spec decides the balancing method, whether kits and hoses are allowed, whether 3-way valves are allowed, and who furnishes what. The sources I read disagree on several of these points (see §1.1). The tool therefore needs a per-project "hook-up profile" and an editable responsibility matrix; the VA table in §4 is a good default.

## 0. Method and legend
- **Search budget.** I used all 40 WebSearch calls. WebFetch and curl were blocked for every vendor and estimating-software site I tried. Anything below tagged [V] or on software comes from search-result summaries unless it says otherwise.
- **Read in full (pypdf):**
  - 17 UFGS and 13 VA Master Specification sections from the WBDG S3 bucket.
  - A real IMEG project manual for Rockford Public Schools ESSER HVAC Phase 2, Division 23 and Division 26 (IMEG is a large US MEP design firm).
  - The Nebraska State College System (NSCS) Division 23 design guideline, dated 11/28/2023.
  - The Raypak MVB boiler installation manual.
- **Where the files are.** The PDFs and extracted text are in `/tmp/claude-0/-home-user-master-plan/ea56aded-ac3c-5d57-8b45-280b541c9fd9/scratchpad/assemblies-D/` in the folders `ufgs/`, `va/`, `specs/` and `vendor/`.
- **Labels:**
  - **[std]**: a public guide spec (UFGS or VA), read in full.
  - **[3P]**: a project spec, owner standard or trade press, read in full unless marked (S).
  - **[V]**: vendor material.
  - **(S)**: I only saw a search-result summary.
  - **[inf]**: my own inference.
  - Short keys map to URLs in §7.
- **Scope.** Your US-only note applied: I dropped a metric USACE drawing set from Korea and EU chiller and tower documents. Doc 02 already covers the fitting, hanger and insulation math, so I did not repeat it.

## 1. What each hook-up contains, and what selects the variant

### 1.1 Hydronic coil hook-up (AHU coils, duct and VAV reheat coils, FCUs, unit heaters, cabinet unit heaters, convectors)

| Component role | Typical quantity per coil | Evidence |
|---|---|---|
| Isolation valve on supply and return | 2 | "on each side of each piece of equipment" [std UF-6426 §3.1.5]; [3P NSCS 231000 item 10] |
| Union or flange at the coil and at the control valve | 2 or more | Required except on copper tubing [std UF-6426 §3.1.4.6]. Unions below 2", flanges at 2" and above; unions go downstream of valves [std UF-2113 §3.2.5]. A union at one end of every threaded valve [std VA-2113 §3.1 F]. [3P IMEG-23 23 21 16 §3.1 A.5–6] |
| Strainer (Y-type or basket, same size as the line) with a blowdown valve, hose end and cap | 1, supply side | [std UF-6426 §2.7.1]; [3P IMEG-23 23 21 00 §2.7 E]; strainers go ahead of control valves and equipment [3P NSCS 231000 item 18] |
| Automatic control valve: 2-way, 3-way, 2-position or pressure-independent (PICV) | 0 or 1 | [std UF-0913 §2.5]. None on uncontrolled or fan-cycled units [inf] |
| Balancing device: calibrated manual valve or automatic flow limiter | 0 or 1, return side | [std UF-6426 §2.6.8–2.6.9]. None is needed with a PICV, which has its own regulator and P/T ports [std UF-0913 §2.5.7] |
| Pressure/temperature (P/T) test ports | 2 (in and out) | "adjacent to inlet and outlet of every pump, heat exchanger, chiller, boiler, and coil" [std UF-0593 §3.2.4.1 b]; before and after every terminal coil [3P NSCS 231000 item 31] |
| Manual air vent | 1 | "on all water coils" [std UF-6426 §3.1.6]; at least 1/8" at coils [§2.6.17]; ½" at coil outlets with a hose end [3P NSCS 231000 item 20]; [3P IMEG-23 23 21 16 §2.1 B] |
| Drain at the coil or a low point | 1 | Plugged vent and drain brought through the unit casing [std UF-3000 §2.13.2.2]; low-point drains [std UF-6426 §3.1.7] |
| Reducers at the control valve | 0 to 2 | "Control valves usually require reducers" [std VA-2113 §3.1 F]. Run valves and strainers at line size and reduce only at the control valve or pump [3P IMEG-23 23 21 00 §3.6 G] |
| Thermometers and pressure gauges | AHU coils only: 2 thermometers and 2 gauges | [3P NSCS 231000 items 31–32]; a thermometer at any automatic control device without its own [std UF-6426 §3.1.9] |
| Flexible hoses | 0 to 2, terminal units only, where the spec allows | [std UF-8147 §2.1.1 l]. IMEG forbids them: "coil connections shall be rigid" [3P IMEG-23 23 21 16 §2.8 A] |
| Sensor wells and taps (furnished by the controls contractor) | Per the points list | [std VA-2113 §3.1 J]. In pipes 2½" and smaller, the pipe is enlarged at the well [§3.1 K] |

**Rules that select the variant:**
1. **The balancing method depends on the spec, and the specs conflict.**
   - UFGS says automatic flow control valves "must not be used in conjunction with 2-way modulating control valves". Where they are used, UFGS also requires a flushing bypass and a cyclonic separator [std UF-6426 §2.6.9].
   - NSCS requires automatic flow control valves at terminal devices [3P NSCS 231000 item 16].
   - IMEG bans automatic flow control devices inside combination packages [3P IMEG-23 23 21 16 §2.8 A.3].
2. **3-way valves.** Some owners ban them [3P NSCS 231000 item 13]. Where used, the valve should have a linear characteristic with constant total flow [std UF-0913 §2.5.2.2]. The bypass leg needs a balancing valve set to match the coil pressure drop [3P ACHR (S)].
3. **The control valve is usually not line size.**
   - Two-position valves are line size.
   - UFGS sizes modulating valves for 50–100% of the branch pressure drop, typically 3–5 psi [std UF-0913 §2.5 note].
   - IMEG uses 1–4 psi [3P IMEG-23 23 09 00 §2.16 A.1].
   - VA uses the greater of 10 ft or the equipment's own pressure drop [std VA-0923 §2.14].
4. **Unit heaters, radiation and FCUs** get a radiator valve on the inlet and a balancing valve on the outlet [std UF-2113 §3.2.9.2].
5. **FCU piping packages** come in three flavors:
   - UFGS: a package with "thermal connections suitable for connection to the type of control valve supplied" and a manual vent, plus auxiliary drain pans under the package [std UF-3000 §2.15.1.3–.4].
   - VA: "factory furnished with unit by the manufacturer or field-installed … to fit control valves provided by the controls' supplier", with ball stop valves on both pipes and a balancing fitting on the return [std VA-8200 §2.2 H].
   - IMEG adds an auxiliary drain pan in the valve compartment, a condensate level switch, and factory condensate pumps on horizontal FCUs [3P IMEG-23 23 82 00 §2.2 G–I].
6. **Water-source heat pump hose kit** [std UF-8147 §2.1.1 g, l, m]:
   - two 2-ft stainless braided hoses, each with a swivel on one end;
   - a manual flow control valve with test ports;
   - two ball valves with memory stops, one with a test port;
   - a blowdown ball valve and a Y-strainer;
   - hoses rated UL 94 and 300 psi.

   The unit also gets a 2-position valve interlocked with the compressor, and a flushing bypass.
7. **Radiant panels** ship with 12" or 18" stainless braided hoses [std UF-3000 §2.18.1.9].
8. **Glycol systems** must not use automatic air vents unless they are piped to the fill tank [3P IMEG-23 23 21 00 §3.7 D].

### 1.2 Pre-assembled coil kits (all [V] and (S))

| Vendor | Supply side | Return side | Is the control valve in the kit? | Options |
|---|---|---|---|---|
| IMI Flow Design | YC: ball valve, Y-strainer with 20-mesh stainless screen, union, blowdown | Kit A: YR AutoFlow automatic valve plus a UB ball valve. Kit B: UA venturi manual balancing valve with memory stop. Kit AC: AutoFlow with union, ball valve and 2 P/T ports | Not in the standard kits. A distributor lists part SK2A as a "2-WAY Standard Coil Kit": AC valve, UP union with vent and P/T port, and YC [IMI-SK2A] | S2/S3 or H2/H3 fire-rated stainless hoses; ½" to 2"; union rated 400 psig at 250°F |
| Nexus | UltraY: strainer, ball valve, union, P/T port, blowdown/drain | Coil Pak O2Y: manual flow control, ball valve, union and test plugs. Coil Pak PICV: ball valve and union with P/T; Dynamic PICV with 2 P/T ports; union with P/T port and manual vent | Yes, the PICV body | Bodies 600 WOG at 325°F; PICV 360 psig at 250°F; threaded, sweat or press ends |
| Griswold | Isolator S: P/T valve, drain, integral strainer, ball valve | Automizer (automatic flow limiting) or PIC-V, with a universal actuator mounting plate | The PIC-V body, yes. The actuator is "supplied by Griswold or others" | More than 900 standard configurations shipping in 48 hours; as few as 4 field connections |
| Hays | High-flow Y-ball strainer with blowdown, and a ball valve | Mesurflo automatic valve (2–80 psid); ball valve with P/T ports | Not stated | 2 stainless braided hoses |
| B&G | UBY: Y-strainer, shutoff, P/T port, drain, union | AC Circuit Sentry (automatic flow limiting, 2 P/T ports); UA union with P/T port and vent; Circuit Setter Plus as a manual alternative | Not stated | 16 standard kits; hoses optional; runouts ½" to 2" |
| Victaulic Koil-Kit | 78Y strainer with ball valve, or 78T ball valve with union | 78U union port fitting; 78K, 786 or 78BL balancing valve | Series 79V: "ATC valve of your choice" | Hoses, P/T ports and handle extensions optional; Series 79B adds bypass options |
| Siemens | Strainer and union valve | PICV with valve and actuator ordered assembled, or a ball or globe 2-way valve plus a manual balancing valve | Yes | The part number encodes strainer, union and balancing-valve sizes and end types, plus hose diameter and length. Can be selected in HIT |
| Terminal-unit makers (JCI, Enviro-Tec) | Ball isolation valve; optional Y-strainer with blowdown, P/T ports and unions | 2- or 3-way on/off motorized valve, normally closed as standard; optional modulating, fixed-flow or PICV | Yes, supplied by the unit maker | "Shipped loose for field installation and wiring" |

Specs allow kits in place of loose parts, within limits:
- VA accepts "combination assemblies containing ball type shut-off valves, unions, flow regulators, strainers with blowdown valves and pressure temperature ports" [std VA-2113 §2.8 H.3].
- IMEG allows them only at unitary equipment with 1" or smaller connections. It lists FDI (Flow Design), Griswold, Hays, HCI, Nexus, NIBCO and Victaulic as acceptable makers [3P IMEG-23 23 21 16 §2.8].

### 1.3 Steam coil hook-up

**Supply side:** isolation valve, strainer, control valve, union and vacuum breaker.
- Vacuum breaker requirements:
  - UFGS requires one on every coil, "field or factory installed" [std UF-3000 §2.13.2.3].
  - NSCS requires one on the inlet of every steam coil and steam heat exchanger [3P NSCS 231000 item 26].
  - IMEG specifies spring-loaded, opening at no more than 11" w.g. [3P IMEG-23 23 22 18 §2.3].
  - Vendors place it between the control valve and the coil inlet [V/3P STEAMV (S)].
- Control valve rules:
  - IMEG: modulating valves use a "modified linear" characteristic. Pressure drop is 80% of inlet pressure when inlet is 15 psig or less. At least 2 psig must remain after the valve (5 psig for integral face-and-bypass coils). Parallel valves are split 1/3 and 2/3 [3P IMEG-23 23 09 00 §2.17].
  - VA limits pressure drop to 20% of inlet for 2-position valves and 80% for modulating valves [std VA-0923 §2.14].

**Condensate side:**
- A dirt pocket of at least 14" at the coil's return connection size [3P IMEG-23 23 22 18 §3.1 A.6]. UFGS requires a dirt pocket and strainer ahead of the trap, except for thermostatic traps on radiators and convectors [std UF-2226 §3.1.1.9].
- Shutoff valve and strainer at the trap inlet, check valve and shutoff valve at the discharge, and unions at both ends [3P IMEG-23 23 22 18 §3.1 A.4–5].
- Traps sized for 2.5 times the maximum condensate load, minimum ¾" [3P IMEG-23 23 22 18 §3.1 A.2–3].
- Float-and-thermostatic (F&T) traps on modulating loads [3P NSCS 231000 item 23]. For equipment with a modulating valve, size the trap at ¼ psig with a 12" condensate leg [std VA-2213 §2.10 H.1.a].
- A check valve after the trap when it lifts condensate, faces back pressure or discharges into a common return. None is needed after thermodynamic traps [std UF-2226 §3.1.1.9].
- A 3-valve bypass where the equipment must stay in service during trap work, and a ½" globe test valve on medium- and high-pressure traps when specified [std UF-2226 §3.1.1.9].
- A factory-packaged trap station is an accepted alternative [std VA-2213 §2.10 I].

**What selects the variant:** steam pressure class, modulating or 2-position control, condensate load in lb/h, whether condensate is lifted after the trap, and whether it is a preheat (non-freeze) coil.

### 1.4 Pump hook-up

**Suction side:**
- A line-size shutoff valve and a strainer with blowdown. A suction diffuser is allowed as the contractor's option [std VA-2123 §2.1 B.12].
- IMEG puts suction diffusers on base-mounted pumps, with a 16-mesh startup strainer, an adjustable support foot, and no more than 3 psi pressure drop [3P IMEG-23 23 21 16 §2.6].
- UFGS uses a suction diffuser where the pump maker's inlet conditions are not met [std UF-2123 §2.7.4]. It gets a blowdown, a magnetic insert and a startup strainer [std UF-6426 §2.7.3].

**Discharge side:**
- A check valve on each pump in a packaged pump system [std UF-2123 §2.6.2]. A check valve "incorporating a balancing feature may be used" [std VA-2113 §2.8].
- A triple-duty valve combines shutoff, check and throttling in one body [V TDV (S)].

**Both sides:**
- Flexible connectors where the pump sits on isolators or pedestals [std UF-3000 §3.2.2]; flexible couplings on packaged skids [std UF-2123 §2.6.3].
- Pressure gauges with a 4.5" dial and a needle valve or snubber [std UF-6426 §2.7.5]; gauges before and after every pump [3P NSCS 231000 item 32]; P/T ports [std UF-0593 §3.2.4.1 b].
- Seal and base drains piped to a floor drain [std VA-2123 §3.1 C].

**What selects the variant (from the pump schedule):**
- Pump type:
  - Inline pumps need 5 pipe diameters of straight pipe on both sides [3P IMEG-23 23 21 23 §3.1 B.1].
  - Base-mounted pumps need a pad, grouting, alignment and 18" of clearance to remove the suction diffuser [§3.1 A.2, C].
- Arrangement: single, duty/standby or parallel.
- Suction and discharge connection sizes.

### 1.5 Central plant and per-system items

**Hot-water boiler:**
- Isolation valves on both sides [std UF-6426 §3.1.5].
- Relief valve piped down to a floor drain [std UF-2113 §3.2.9.3; V RAYPAK "Relief Valve Piping"].
- A temperature and pressure gauge within 12" of the outlet [V RAYPAK "Temperature & Pressure Gauge"].
- A factory flow switch as standard [V RAYPAK "Flow Switch"].
- A low-water cutoff if the boiler sits above the radiation it serves [V RAYPAK "Piping"].
- A fill regulator set to at least 12 psi, with a check valve or backflow preventer and a manual shutoff [V RAYPAK "Feedwater Regulator"].
- Gas connection: sediment trap, manual shutoff outside the jacket, union, and a regulator if supply pressure exceeds 10.5" w.c. [V RAYPAK "Gas Supply"].
- Thermometers on the inlet and outlet [3P NSCS 231000 item 31].
- Low-water cutoffs for steam boilers are covered in [std UF-5200 §2.4.7.1].

**Chiller:**
- The evaporator ("water cooler") has factory-installed flow switches and flanged or grooved water connections [std UF-6410 §2.6.9].
- Thermometers at the condenser inlet and outlet and at each heat exchanger [std UF-6426 §3.1.9].
- P/T ports [std UF-0593 §3.2.4.1 b] and isolation valves on both sides [std UF-6426 §3.1.5].
- Chiller installation manuals call for a field-supplied evaporator inlet strainer with gauge taps (S). I could not confirm this in a US-specific source.

**Cooling tower:**
- Each basin needs overflow and drain connections, a float makeup valve (electronic level control is an option), and a screened outlet for each sump [std UF-6500 §2.5.4.11].
- Optional basin-sweeping skid with pre-strainer, gauges and isolation valves [std UF-6500 §2.9.4].
- Equalizer pipes between cells, with isolation valves [3P CT-EQ (S)].
- Tower bypass valve with a pressure drop of 2 psi or less [3P IMEG-23 23 09 00 §2.16 A.1].

**Steam-to-water heat exchanger** [3P IMEG-23 23 57 00 §3.2]:
- Shell: gauge tapping with pigtail siphon, and a vacuum breaker.
- Water inlet: thermometer well, gauge tapping and valved drain.
- Water outlet: well for the temperature regulator's sensor, ASME relief valve, thermometer well and gauge tappings.

UFGS adds a vacuum relief valve on each shell-and-U-tube steam heat exchanger [std UF-5710 §2.12.4] and relief valves [§2.12.5]. It also adds a steam air vent with an isolation valve on the shell [§3.13.4.2].

**Once per closed water system:**
- Expansion tank with drain, fill, air-charging valve and system connections [std UF-6426 §2.9].
- Air separator with blowdown and automatic vent [std UF-6426 §2.10], or a coalescing air and dirt separator [3P NSCS 231000 item 17].
- Shot feeder with vent, gauge glass, funnel and valves [std UF-6426 §2.11.5].
- One bypass (pot) feeder per system with inlet, outlet and drain valves [3P IMEG-23 23 25 00 §2.2 A].
- A makeup water meter with a pulse output to the building automation system (BAS) [same].
- A coupon rack [same].

### 1.6 Air-side terminals and duct accessories (counted per item)

**VAV boxes:**
- UFGS makes the inlet flow sensor accurate to ±5% with 1.5 duct diameters of straight duct upstream. That clause is in the fan-powered terminal subsection [std UF-3000 §2.15.2.5.3]. VA just says to leave a straight inlet run [std VA-3600 §3.1 E].
- Where flex duct connects directly to the box, VA calls for an "octopus" outlet plenum with balancing dampers [§2.2 D.4].
- An access door on the upstream side of the reheat coil [3P IMEG-23 23 36 00 §2.2 F].

**Air devices:**
- Flex runouts no longer than 5 ft [std UF-3000 §2.12.1.2; 3P NSCS 233113 item 5].
- A manual volume damper at every air device [3P NSCS 233113 item 4]. UFGS: "Show all manual volume dampers on the drawings. Do not rely upon diffuser and register volume dampers" [std UF-3000 §2.12.4].
- Manual dampers at branch take-offs, with remote operators where the ceiling is not accessible [3P IMEG-23 23 33 00 §3.1 B].
- QuoteSoft links the spin-in tap, damper, flex duct and diffuser so they are taken off together at the same diameter and quantity [V QS (S)].

**Condensate traps:**
- The trap seal is 2" plus the unit's total static pressure in inches of water, built from 2 tees and a U-bend. Room FCUs may be exempted [std UF-3000 §3.2.1].
- The unit base must be tall enough for the trap [std VA-7300 §2.1 B].

**Duct accessories counted one per item:**
- A flexible duct connector, about 6" long, at each fan connection [std UF-3000 §2.12.1.3].
- Access doors at fire dampers, smoke dampers, motorized dampers, coils, airflow measuring stations (AFMS), filters and humidifiers, and every 20 ft in return duct [3P IMEG-23 23 33 00 §2.7 B–C]. UFGS also wants doors upstream and downstream of coils and AFMS [std UF-3000 §2.12.2].
- Fire, fire/smoke and smoke dampers at rated wall and floor penetrations [3P IMEG-23 23 33 00 §3.1 C].
- Automatic balancing dampers [std UF-3000 §2.12.5].

## 2. How mechanical estimating software models hook-ups

| Tool | What comes built in | How assemblies vary |
|---|---|---|
| Trimble AutoBid Mechanical [V AUTOBID (S)] | "Mechanical hookup assemblies, equipment and pumps" out of the box; custom libraries; quick takeoff of "equipment locations, hookups and piping mains" | "Specification driven" takeoffs set material and pipe schedule. Hangers are placed by pipe size. Several labor books are available, and it shows how each spec, price and labor unit was resolved |
| FastEST FastPIPE [V FASTPIPE (S)] | "Hundreds of built-in" assemblies for gas connections, boilers, chillers, coils, pumps and VRF; a catalog of more than 150,000 items | Assemblies are copied into a job and edited. One estimating firm standardizes boiler, chiller, FCU and pump hook-ups as "custom groups" [3P HIGHVIEW (S)] |
| QuoteSoft [V QS (S)] | Hundreds of assemblies | "Flexible assemblies that can be used for any size or material type". Users change the items, quantities or size. Some assemblies are named for the equipment, for example "RTU 7.5 Ton". Items of variable size round up to the nearest priced size. Labor is adjusted "by Zone and Assembly breakout" |
| McCormick [V MCC (S)] | Standard assemblies for gas connections, boilers, chillers, coils, pumps and VRF | National-average labor units, with MCAA or PHCC units as add-ons |

**How schedule data would map to a hook-up size [inf]:**
- The hook-up size is the runout or line size. Specs keep valves and strainers at line size and reduce only at the control valve [3P IMEG-23 23 21 00 §3.6 G; std VA-2113 §3.1 F].
- The control valve size comes from its flow coefficient (Cv), which needs the design GPM and the allowed pressure drop (§1.1, rule 3).
- If the plan shows no runout size, a fallback is to size from GPM. The ASHRAE rule of thumb is at most 4 ft/s for pipe 2" and smaller, and at most 4 ft of head loss per 100 ft above 2" [3P ASHRAE-PS (S)].
- I computed the resulting maximum GPM at 4 ft/s myself (Type L copper / Schedule 40 steel):

| Pipe size | Type L copper (GPM) | Schedule 40 steel (GPM) |
|---|---|---|
| ½" | 2.9 | 3.8 |
| ¾" | 6.0 | 6.6 |
| 1" | 10.3 | 10.8 |
| 1¼" | 15.7 | 18.6 |
| 1½" | 22.2 | 25.4 |
| 2" | 38.6 | 41.8 |

## 3. How labor units are structured (structure only, no values)
- **MCAA WebLEM** [WEBLEM (S)]:
  - A labor unit is the man-hours "to install a unit of material (a foot of pipe), an individual item (fitting or valve), or perform a specific task (welding a joint)".
  - The Component Method prices items (pipe, fittings, valves, flanges, branch connections). Each unit covers joining, handling, testing and installing.
  - The Work Activity Method prices activities instead (making joints, cutting and beveling, handling).
  - The joint method counts joints and adds labor for items and assemblies based on equivalent length.
  - Units come with stated assumptions and correction factors for abnormal conditions such as hazards, weather and working height.
- **What units are keyed on:** item type × size × material × joining method. Doc 02 §B3 has an example: 3" Type K copper joints at 0.11 hours pressed, 0.15 silver-soldered and 0.13 grooved.
- **PHCC** has more than 13,000 national-average installation times. They cover pipe, valves, fittings and some equipment, and are delivered through CINX or as add-ons to estimating software [PHCC (S)].
- **Equipment** is labored by size or weight; "manufacturers model numbers are of no use" for labor [3P MEPA (S)].
- **Implication for the export [inf]:** hook-up labor adds up component units by size and end type, plus joints. Setting the equipment is a separate line, and difficulty is a job-level factor. So the export should list each component role with its size and end type, not just a count of assemblies.

## 4. Who furnishes, installs and wires what

**VA 23 09 23 §1.1 "Responsibility Table"** [std VA-0923]. Columns give the spec section responsible. 23 is the mechanical/piping trade, 23 09 23 is the controls contractor, 26 is electrical and 28 31 00 is fire alarm.

| Item | Furnish | Install | Low-voltage wiring | Line power |
|---|---|---|---|---|
| Automatic (control) valves | 23 09 23 | 23 | 23 09 23 | 23 09 23 |
| Automatic dampers not supplied with equipment | 23 09 23 | 23 | – | – |
| Damper actuators | 23 09 23 | 23 09 23 | 23 09 23 | 23 09 23 |
| Thermowells | 23 09 23 | 23 | – | – |
| Pipe insertion devices, taps, flow and pressure stations; manual valves | 23 | 23 | – | – |
| Terminal units | 23 | 23 | – | 26 |
| Terminal-unit controllers | 23 09 23 | 23 | 23 09 23 | "16" (an old division number) |
| Fire dampers | 23 | 23 | – | – |
| Smoke and fire/smoke dampers | 23 | 23 | 28 31 00 | 28 31 00 |
| Chiller and boiler flow switches | 23 | 23 | 23 | – |
| Variable frequency drives (VFDs) | 23 | 26 | 23 09 23 | 26 |
| Cooling tower vibration, level and makeup devices | 23 | 23 | 23 09 23 | 23 09 23 |

- **VA contradicts itself on flow switches.** Its list of items "furnished but not installed" by the controls contractor includes control valves, flow switches, flow meters, sensor wells and terminal-unit controllers [VA-0923 §1.1]. The table row above says chiller and boiler flow switches are furnished by 23.
- **VA piping section:** the piping trade installs "control valve bodies, flow switches, pressure taps with valve, and wells for sensors" furnished by others [std VA-2113 §3.1 J].
- **UFGS:** thermometers and gauges are "typically provided by the Mechanical Contractor" [std UF-0913 §2.8 note].
- **IMEG project:**
  - The controls contractor furnishes, but does not install, control valves, flow switches, sensor sockets, gauge taps, automatic dampers and flow meters [3P IMEG-23 23 09 00 §1.5].
  - Devices meant to be factory-mounted are shipped to the unit manufacturer [3P IMEG-23 23 09 00 §1.4 B].
  - VAV damper operators and controllers are "provided and installed by the manufacturer", but the hot-water valve is "by the TCC" [3P IMEG-23 23 36 00 §2.2 D–F].
  - The mechanical contractor wires the fire/smoke damper actuators [3P IMEG-23 23 33 00 §2.3 C].
  - The electrical section defines "temperature control wiring" (motorized dampers and valves). It makes the mechanical contractor responsible for any mechanical wiring not shown on the electrical drawings [3P IMEG-26 26 05 00 §1.6].
- **Division 25 variant:** wet taps, wells, flow switches and meters are "installed under the applicable piping section under the direction of the BMS Provider" [3P DIV25 (S)]. I could not tell which of the two DIV25 URLs this came from.
- **Airflow measuring stations** are specified in the controls section [std UF-0913 §2.7.7.1] and need access doors [std UF-3000 §2.12.2]. No source said who installs them; it is probably the sheet-metal trade [inf].

**How coil kits change who furnishes the control valve.** I found four patterns:
1. The controls contractor furnishes the valve and the mechanical contractor installs it (the VA table).
2. The controls contractor ships the valve to the kit or unit maker for factory mounting [3P IMEG-23 23 09 00 §1.4 B; std VA-3600 §2.2 H; V VIC Series 79V (S)].
3. The kit includes the PICV body, and the actuator comes from the controls contractor or the vendor [V GRISWOLD, NEXUS (S)].
4. The kit or unit maker supplies both valve and actuator [V SIEM, JCI (S); std VA-8200 §2.2 H option].

## 5. Synthesis: a vendor-neutral catalog of hook-up assemblies

Abbreviations for component roles:
- **ISO** isolation valve, **STR** strainer, **BD** blowdown valve, **CV** control valve, **BAL** balancing valve, **PT** P/T port, **VENT** air vent, **DRN** drain, **RED** reducer, **TH** thermometer, **PG** pressure gauge.
- **CHK** check valve, **TDV** triple-duty valve, **SD** suction diffuser, **FLEX** flexible connector, **VB** vacuum breaker, **BYP** bypass, **DIRT** dirt pocket, **TEST** trap test valve.
- An asterisk (*) marks a conditional item.

| Assembly | How many per equipment | Component roles (default quantity) | What selects the variant |
|---|---|---|---|
| Hydronic coil: 2-way, 3-way or PICV | 1 per coil circuit. A 4-pipe FCU has 2; an AHU with preheat, cooling and heating coils has 3 [inf] | ISO 2, UNION 2, STR and BD 1, CV 1, BAL 1 (0 with a PICV), PT 2, VENT 1, DRN 1, RED 0–2, HOSE 0–2. A 3-way valve adds a bypass balancing valve. AHU coils add TH 2 and PG 2 | From the schedule: coil connection or runout size, GPM, coil pressure drop, service and glycol. From the controls drawings: valve function and fail position. From the project profile: balancing method, kits allowed and maximum kit size, hoses allowed, 3-way allowed |
| Terminal heating unit (unit heater, cabinet unit heater, convector) | 1 per unit | Inlet stop valve 1, outlet BAL 1, UNION 2, VENT 1, CV 0–1 | Same as above |
| Heat pump hose kit | 1 per unit | HOSE 2, ISO 2, flow valve 1, STR 1, BD 1, 2-position valve 1, flushing bypass | GPM |
| Steam coil | 1 per coil | Supply: ISO, STR, CV, UNION, VB. Condensate: DIRT, ISO, STR, TRAP, UNION 2, CHK*, ISO, TEST*, 3-valve BYP* | Steam pressure, condensate lb/h, control type, lift |
| Pump | 1 per pump | ISO, STR or SD, FLEX 2, CHK or TDV, ISO or BAL, PG 2 or PT 2 | Pump type, arrangement, connection sizes |
| Boiler, chiller, cooling tower, heat exchanger | 1 per boiler, chiller barrel, tower cell or heat-exchanger side | As listed in §1.5 | Type, sizes, fuel, steam or water |
| System specialties | 1 per closed water loop | Air separator, expansion tank, fill station, pot feeder, coupon rack | The list of systems |
| VAV air side, air devices, AHU drain, duct accessories | 1 per box, air device, drain pan or plan symbol | As listed in §1.6 | Inlet or neck size, fan static pressure, plan symbols, rated penetrations |

**Fields a downstream valve-selection tool needs from each instance:**
- Equipment tag and the coil it serves.
- Medium and glycol percentage.
- Design flow: GPM for water, or lb/h and inlet psig for steam.
- Coil pressure drop, and entering and leaving water temperatures.
- Line size and end type: threaded, sweat, flare, press or flanged [std UF-0913 §2.5.8].
- Valve function: 2-way, 3-way, 2-position or PICV.
- Allowed pressure drop or target Cv.
- Close-off pressure: pump dead-head, at least 50 psig for valves under 4" [std VA-0923 §2.14].
- Body rating of at least 150% of system pressure [std UF-0913 §2.5].
- Fail position (normally open, normally closed or fail in place), and spring return where freeze protection applies [std UF-0913 §2.5, §3.1.13.1].
- Flow characteristic [§2.5.2] and leakage class (Class III is typical).
- Actuator signal type, taken from the BAS points list [inf].
- Kit option: component sizes and ends, and hose diameter and length [V SIEM (S)].
- Responsibility: who furnishes, who installs, and whether the valve ships to a kit or unit vendor.

These match the IMEG valve-schedule columns [3P IMEG-23 23 09 00 §1.3 B.10]. For dampers, the IMEG schedule [§1.3 B.9] adds damper size, duct size, arrangement, blade type, velocity, pressure drop, fail position and actuator.

**What this means for the tool's design [inf]:**
- Keep a per-project "hook-up profile" with switches for:
  - balancing method;
  - whether kits and hoses are allowed;
  - whether 3-way valves are allowed;
  - the P/T port and thermometer policy;
  - the size where unions give way to flanges (2").

  The sources disagree on all of these, so defaults must be editable.
- Carry an editable responsibility matrix on each component role, with furnish, install, low-voltage wiring and line-power columns. Default it to the VA table.

## 6. Not verified
- All vendor kit details, software features and labor-manual structure are from search summaries (S).
- I did not find how IMI builds its 3-way kits.
- The chiller strainer rule comes only from non-US installation manuals.
- No source said who installs airflow measuring stations.
- The VA table contradicts itself on flow switches (see §4).

## 7. Sources
- **UF-xxxx:** `https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFGS/UFGS%2023%20xx%20xx.pdf`, spaces encoded as %20.
  - 6426 = 23 64 26 (11/25)
  - 2123 = 23 21 23 (05/25)
  - 2113 = 23 21 13.00 20
  - 2226 = 23 22 26.00 20
  - 3000 = 23 30 00 (02/25)
  - 0913 = 23 09 13
  - 0593 = 23 05 93 (05/25)
  - 8147 = 23 81 47 (02/25)
  - 5710 = 23 57 10.00 10
  - 6410 = 23 64 10
  - 6500 = 23 65 00
  - 5200 = 23 52 00
- **VA-xxxx:** `https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/VA/VAASC/VA%2023%20xx%20xx.pdf` for 23 09 23, 23 21 13, 23 21 23, 23 22 13, 23 36 00, 23 82 00 and 23 73 00.
- **IMEG-23:** https://core-docs.s3.us-east-1.amazonaws.com/documents/asset/uploaded_file/4629/rps/4072865/23-16_Bid_Pt._Four.pdf
- **IMEG-26:** https://core-docs.s3.us-east-1.amazonaws.com/documents/asset/uploaded_file/4629/rps/4072863/23-16_Bid_Pt._Five.pdf
- **NSCS:** https://www-nscs-edu.s3.amazonaws.com/e6a8-49830177-Div23-HVAC.pdf
- **RAYPAK:** https://s3.amazonaws.com/AWSProd/sites/raypakcom/documents/241512.pdf
- **IMI:**
  - https://www.imiflowdesign.com/products-solutions/kit-a/
  - https://www.imiflowdesign.com/kit-b/
  - https://www.imiflowdesign.com/products-solutions/kit-ac/
  - https://www.imiflowdesign.com/wp-content/uploads/2020/06/F171.21-YC-Submittal_6.3.20.pdf
- **IMI-SK2A:** https://www.easternfirst.com/Product/IMI-FLOW-DESIGN-SK2A-3-1-2-WAY-Standard-Coil-Kit-models-AC-autoflow-balancing-valve-UP-union-with-air-vent-And-P-T-port-and-YC-Strainer-with-blowdown-830854
- **NEXUS:**
  - https://nexusvalve.com/product/coil-pak-o2y
  - https://nexusvalve.com/main/wp-content/uploads/2020/12/coil-pak-picv-specification_DZR.pdf
- **GRISWOLD:** https://griswoldcontrols.com/hvac-valves/coil-piping-packages-hose-kits/
- **HAYS:** https://www.haysfluidcontrols.com/hose-kits
- **BG:**
  - https://www.xylem.com/en-us/products--services/heating-ventilation-air-conditioning-hvac-plumbing/flow-balancing-products2/coil-kit-hook-ups/coil-hook-up-kits/
  - https://documentlibrary.xylemappliedwater.com/wp-content/blogs.dir/22/files/2016/12/A-616.15.pdf
- **VIC:** https://assets.victaulic.com/assets/uploads/literature/08.30.pdf
- **SIEM:**
  - https://sid.siemens.com/api/khub/documents/ZQ2eDD4aWrgegcXY7CgUgA/content
  - https://sid.siemens.com/api/khub/documents/fYjKFFjwgolMZbr3qTWNMA/content
  - https://www.youtube.com/watch?v=G94l4Hh8CLI (HIT piping packages demo)
- **JCI:**
  - https://webselect.johnsoncontrols.com/pdf/catalog/ET50.35-TD1.pdf
  - https://www.enviro-tec.com/products-and-solutions/fan-coil-units/piping_packages_ad/valve-piping-packages
- **TDV:**
  - https://www.xylem.com/siteassets/brand/bell-amp-gossett/resources/submittal/b-830g.pdf
  - https://libertysupply.com/blogs/atoms-and-bits/what-is-a-triple-duty-valve
- **STEAMV:**
  - https://forum.heatinghelp.com/discussion/170235/steam-coil-turn-down-vacuum-pressure-needed
  - https://www.spiraxsarco.com/learn-about-steam/steam-traps-and-steam-trapping/selecting-steam-traps---space-heating-equipment?sc_lang=en-GB
  - https://www.instrumart.com/assets/AandAIManual.pdf
- **Chiller installation manuals (S):**
  - https://www.generalairproducts.com/wp-content/uploads/2021/09/accchilleriom.pdf
  - https://gdchillers.com/wp-content/uploads/2021/07/VA-Chiller-Manual-2022c.pdf
- **CT-EQ:**
  - https://hvac-eng.com/cooling-tower-equalization-engineering-fundamentals-and-best-practices/
  - https://chemaqua.com/en-us/blog/2025/12/04/balancing-the-hidden-risks-in-cooling-tower-equalizer-lines
- **ACHR:** https://www.achrnews.com/articles/163236-the-bypass-pipes-balancing-valve-part-i-the-fundamentals
- **ASHRAE-PS:**
  - https://takyifwasalama.com/wp-content/uploads/2020/07/ASHRAE-Pipe-Sizing.pdf
  - https://energy-models.com/pipe-sizing-charts-tables
- **AUTOBID:**
  - https://www.trimble.com/en/resources/construction/docs/trimble-autobid-mechanical-datasheet
  - https://mep.trimble.com/plumbing-solutions/estimating-and-takeoff/trimble-autobid-mechanical
- **FASTPIPE:** https://fastest-inc.com/FastPIPE
- **HIGHVIEW:** https://highviewconsultingllc.com/guides/how-we-use-fastpipe-for-hvac-estimating/
- **QS:**
  - https://quotesoft.com/products/plumbing-and-piping/
  - https://constructconnect-help.atlassian.net/wiki/spaces/TRAIN/pages/535331605/06.+Appendix
  - https://constructconnect-help.atlassian.net/wiki/spaces/TRAIN/pages/535331407/10.+Calculations+Tab
- **MCC:**
  - https://www.mccormicksys.com/industries/plumbing-mechanical/
  - https://www.mccormicksys.com/software/
- **WEBLEM:**
  - https://www.weblem.org/SiteContentFile/Get/100
  - https://mca-ab.com/wp-content/uploads/2019/09/2018-WebLEM_Brochure.pdf
  - https://www.scribd.com/document/984296917/Mcaa-Assumptions-Full
- **PHCC:**
  - https://www.phccweb.org/tools-resources/phcc-labor-unit-database/
  - https://www.pmmag.com/articles/100734-phcc-labor-unit-database
- **MEPA:** https://mepacademy.com/hvac-equipment-labor/
- **DIV25 (S):**
  - https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/25-1100-bms-basic-materials-device-interfaces-and-sensors-05.20202.pdf
  - https://cpm.umn.edu/sites/cpm.umn.edu/files/2024-06/division23_00_00.pdf