<!--
Research report for the assemblies goal (plans/04-assemblies-plan.md,
opentakeoff-corpus/goals/ASSEMBLIES.md). Produced 2026-09-23 by a research
agent working for the coordinator; kept verbatim so the goal loop can cite it.

Evidence limits: the session's egress proxy blocked direct fetches of almost
every vendor site. Facts labelled "sum" / "summary" came from search-engine
summaries and must be re-checked before a product decision rests on them;
items labelled "read" / [file] / primary were read directly. Scratch paths
under /tmp mentioned below belonged to the research session and no longer
exist. Scope: US market only.
-->

# What downstream selection tools need from a vendor-neutral HVAC/BAS takeoff (US scope)

I used all 45 web searches; the coordinator's US-only scope is applied throughout. Vendor sites (Siemens, Belimo, Honeywell, Johnson Controls and others) were blocked to direct fetch. So every web fact below comes from a search-engine summary of the cited page, not from reading the page — treat it all as summary-only.

**Labels:**
- **[V]** vendor-authored. "[V, mirror]" means a vendor document hosted on a distributor site.
- **[3P]** third party.
- **[file]** I checked it myself in a read-only scratch copy of the repo's Siemens template, `/home/user/master-plan/opentakeoff/web/public/templates/Valve_Size_Template_US_Global.xlsx`. Nothing in the repo was modified.
- **Inference** is my own reasoning, not a source.

Raw notes are in `/tmp/claude-0/-home-user-master-plan/ea56aded-ac3c-5d57-8b45-280b541c9fd9/scratchpad/assemblies-C/notes.md`.

## Key findings

1. **Likely bug in the existing export: the template's "Consumer Δp" means the coil's pressure drop, not the valve's.** [file]
   - Column H's defined name is `CoilDP`, and its table-column key is `tr:mseColCoilDPInfo`. Column I is `BranchDP`.
   - `/home/user/master-plan/opentakeoff/web/src/lib/valveSizeExport.ts` (`computeConsumerDpPsi`, `mapRow`) fills H with (GPM/Cv)². That is the scheduled valve's own drop.
   - Siemens' guidance takes the flow of the controlled equipment from the coil schedule and targets 25–50% valve authority ([V] https://sid.siemens.com/api/khub/documents/uh7fFaB5ZCPWcoipj8Pkjg/content; [V] https://sid.siemens.com/api/khub/documents/m3P5wV~P6hce6~UZfNsRmQ/content).
   - Inference: HIT uses the coil Δp and branch Δp to choose the valve's Δp and authority. The two numbers only agree when the designer happened to set valve Δp equal to coil Δp.
   - Fix: fill H from the served unit's coil-schedule water pressure drop (WPD, in ft × 0.433 = psi; standard conversion). Move (GPM/Cv)² to a separate, clearly flagged `valve_dp_psi (derived)` field.
2. **Tolerance only accepts 10, 20, 30, 40 or 50 (%).** [file] Cells J6 downward are validated against `Constants!F2:F6`. `toleranceOverridePct` currently accepts any number. I found no public definition of what the tolerance means.
3. **The file is HIT's own US globe-valve mass-sizing template.** [file]
   - Named range `MassSizing_US_GlobeValves`, even though the title reads "Global Valves".
   - Author "ORISA Software GmbH", created 2022-09-08, modified 2025-07-11. The embedded source path is `…\Siemens\HIT\src\Input\NoneStepData\en\UI\VAAMassSizingTemplates\`.
   - ORISA built HIT for Siemens in 2008 ([3P] https://www.orisa.de/en/references/siemens-hit-hvac-systems). The folder name is plural, so other mass-sizing templates probably exist (inference).
   - Row 5 lets the user switch units: flow m³/h, l/s, l/min, l/h, USgpm or GBgpm; pressure Pa, kPa, bar, psi, inH2O or mWC. It ships as in / USgpm / psi.
4. **No other documented bulk import exists** for HIT (dampers, sensors, projects) or Desigo Select. Searches for the template only turned up this repo's own PRs (erikjohnstone/master-plan #101/#102).
5. **Desigo Select takes counts** (field equipment per building part and floor, per cabinet, license points), not device-level data.
6. **Every vendor tool asks for the same small set of inputs.**
   - Valves: flow, Δp or Cv, medium and glycol, close-off, fail position, signal and voltage.
   - Dampers: size, blade type, seals, velocity or pressure, and fail-safe.
   - Choosing the model number is always the tool's job.

## 1. Siemens HIT (US)

The portal offers Applications Selection, Product Selection, Browse in Catalog, Replacement Guide and Manage your Projects ([V] https://hit.sbt.siemens.com/RWD/app.aspx). A Siemens rep firm's article (2020-04-08) describes sizing filters and calculators, a replacement guide covering other brands and discontinued parts, and project schedules with submittal documents ([3P] https://www.hvacrepco.com/2020/04/08/siemens-hit-hvac-integrated-tool/). US content uses region code `RC=US` (e.g. https://hit.sbt.siemens.com/RWD/app.aspx?rc=US&lang=en&module=Catalog&action=ShowProduct&key=599-03000+-+03284).

Modules seen in HIT URLs [V]:
- "Select valves by application": https://hit.sbt.siemens.com/RWD/app.aspx?RC=HQEU&lang=en&MODULE=Product&ACTION=ShowGroup&KEY=HIT_Prod_Grp_52799&VALUE=HoV
- "Direct selection": https://hit.sbt.siemens.com/RWD/App/Main?RC=HQEU&lang=en&MODULE=Product&ACTION=ShowGroup&KEY=HIT_Pseudo_Grp_0
- PDF Catalog editor: https://hit.sbt.siemens.com/RWD/app.aspx?RC=HQEU&lang=en&MODULE=PDFCatalog&ACTION=OpenProject
- Replacement guide (`Old2New`): https://hit.sbt.siemens.com/RWD/app.aspx?MODULE=Old2New&ACTION=ShowGroup

**1a. Control valves**
- **US sizing method.** Find the design flow (GPM) against the pressure drop (psi) on the water-capacity graph to get size and Cv. Then choose the actuator from the close-off graph using valve action (normally open or closed), actuator power source and line size; the graph gives maximum close-off for ANSI Class IV shutoff ([V] TB 155-772, https://cache.industry.siemens.com/dl/files/155/109788155/att_1044909/v2/A6V10305769.pdf).
- Powermite globe valves cover Cv 0.4–10; Flowrite covers Cv 1–400 ([V, mirror] https://www.mmcontrol.com/siemens/pdfs/08-Valves-MM.pdf).
- **Glycol:** sizing needs the mixture's specific gravity and specific heat ([V] application guide above).
- **Pressure-independent valves (PICV):** a built-in Δp regulator holds the flow you preset; a dial table maps GPM to the setting ([V] 155-522 https://support.industry.siemens.com/cs/attachments/109789530/A6V10391438.pdf; [V] A6V14296430, 2024-10-02, https://cache.industry.siemens.com/dl/files/849/109824849/att_1156326/v3/A6V14296430.pdf). Inference: a PICV needs design GPM and available Δp, not Cv.
- **Mass-sizing template columns** [file], sheet `ValveTable`:

  | Col | Field | Allowed values / units |
  |---|---|---|
  | A | Unit No. | free text |
  | B | Location | free text |
  | C | System | PCHW, SCHW, PHHW, SHHW, STEAM |
  | D | Ports | 2-Way Normally closed, 2-Way Normally open, 3-Way Mixing |
  | E | PN class | ANSI 125, ANSI 250 |
  | F | Line Size | in |
  | G | Design flow V100 | USgpm |
  | H | Consumer Δp | psi |
  | I | Branch Δp | psi |
  | J | Tolerance | 10–50 % |
  | K | Positioning Signal | 0...10 Vdc, Floating control |
  | L | Operating Voltage | 24 VAC |

  The dropdowns on D, K and L stop working after row 200.
- **What the template cannot represent** (inference): 3-way diverting, 2-position, 4–20 mA and 120 V valves. STEAM is offered as a System, but there is no lb/hr or inlet-pressure field.
- **Guessed default in the existing code:** `mapPositioningSignal` turns any "MODULAT…" actuator text into "0...10 Vdc". That is an assumed default (the valve could be 4–20 mA or 2–10 V), so tag it as a default or leave the cell blank.
- **Other bulk formats:** none found. Industry Mall carts can be saved locally as product lists and uploaded again ([V] https://mall.industry.siemens.com/help/ww/en/03_Orders/03_08_Locally_save_shopping_cart.htm). Those contain part numbers after selection, so they sit past our boundary.

**1b. Damper actuators.** Siemens' US damper guide calls HIT "an intuitive online selection tool with torque calculation and enhanced filters" ([V] https://assets.new.siemens.com/siemens/assets/api/uuid:58cb9df1-0c4b-4951-a5d5-356c5946560c/damper-actuator-selection-for-hvac-systems-appliction-guide.pdf). From the same guide:
- Total torque = damper torque rating (lb-in/ft²) × damper area, with a 0.80 safety factor.
- Worked example: a 36×36 in opposed-blade damper with seals at 2,000 fpm.
- A section wider than 96 in needs two actuators, one on each side.
- It explains spring-return versus non-spring-return fail behavior.

Product attributes include spring return to zero and two independently adjustable auxiliary switches ([V] GCA data sheet, 2025-08-29, https://hit.sbt.siemens.com/RWD/AssetsByProduct.aspx?prodId=BPZ:GCA121.1E&asset_type=Data+Sheet+for+Product&RC=NO&lang=en). I could not confirm exactly which fields HIT's damper form asks for; a demo video exists at https://www.youtube.com/watch?v=P9j5xJbIkgY.

**1c. Sensors.**
- The temperature range covers room, duct, immersion, strap-on and outdoor mounting, with active or passive elements and standard BAS outputs ([V] https://www.siemens.com/en-us/products/hvac/sensors/).
- Outputs are 0–5 V, 0–10 V or 4–20 mA depending on type ([V] QFM21 data sheet, 2023-04-20, https://sid.siemens.com/api/khub/documents/ZjTecRUaa9BmOJqWOwvL2g/content).
- HIT product pages list the sensing element (LG-Ni1000, 10K NTC, Pt1000), probe length (100/150 mm; 6 in in the US) and the protection pocket, i.e. thermowell ([V] https://hit.sbt.siemens.com/RWD/app.aspx?rc=US&lang=en&module=Catalog&action=ShowProduct&key=QAE203..; https://hit.sbt.siemens.com/RWD/app.aspx?rc=HQEU&lang=en&module=Catalog&action=ShowProduct&key=S55720-S516).
- There is a US sensor selection guide ([V, mirror] http://s3.supplyhouse.com/product_files/QAD2030U-brochure.pdf).
- HIT's sensor filter fields were not found. They look like catalog filters rather than a calculator (inference).

**1d. Other devices.** HIT has catalog groups for:
- VAV controllers: https://hit.sbt.siemens.com/RWD/app.aspx?RC=HQEU&lang=en&MODULE=Catalog&ACTION=ShowGroup&KEY=OPC_375754
- Air-velocity sensors (QVM62.1): https://hit.sbt.siemens.com/RWD/app.aspx?module=Catalog&action=ShowProduct&key=BPZ%3AQVM62.1
- Meters ([V] https://www.siemens.com/en-us/products/hvac/meters/)
- DXR2 compact room controllers with built-in I/O ([V] https://www.siemens.com/en-us/products/desigo/dxr/)

I found no VAV or meter sizing calculator.

**1e. Applications.**
- A search summary reports "more than 300 preconfigured applications" covering heat and cold production, distribution (including ventilation and air conditioning), usage (lighting, openings) and remote management. I could not tie this to one page; the likely source is https://buildingtechnologies.siemens.com/bt/global/en/support/tools/Pages/hit.aspx.
- Siemens says HIT uses its library of preconfigured Synco applications to generate "a comprehensive specification, including plant diagram, list of material and technical documentation for each device as well as pricing" ([V] https://buildingtechnologies.siemens.com/bt/global/en/buildingautomation-hvac/building-automation/building-automation-for-small-applications-synco/pages/sizing-and-selection.aspx).
- The Acvatix brochure describes designing the whole application step by step and getting plant diagrams and material lists ([V] https://assets.new.siemens.com/siemens/assets/api/uuid:414aa9cc-eecb-461b-8368-5ca3a123fd36/acvatix.pdf).
- Inference: Synco is marketed mainly outside North America, so the US version of HIT may not offer this library. Either way, it produces design output rather than taking takeoff input.

**1f. Projects.**
- In HIT you "put together products for your construction project with just a few clicks", with documentation attached ([V] https://www.siemens.com/en-us/building-automation-planning/). The rep article above adds project schedules and submittal packages.
- Ordering goes through Industry Mall (search summary; unclear which page it came from — https://www.siemens.com/en-us/content/building-automation-control-systems/). There is a demo video: https://www.youtube.com/watch?v=rq_ZrTfai3M.
- **Not found:** how a project is structured (building, plant, location), Excel/Word/PDF export formats, or any project import other than this template.

## 2. Desigo Select

It is a HIT module ([V] https://hit.sbt.siemens.com/RWD/app.aspx?RC=HQEU&lang=en&MODULE=DesigoSelect&ACTION=OpenProject). According to the page summary, it has three parts:
- **Desigo CC** (the management station): produces "a Desigo CC licensing solution along with products configured at the project level". You pick a Feature Set and Options.
- **Plant automation:** "controller cabinet solutions, configured at each cabinet".
- **Room automation:** "configured in Building Parts and Floors, where you enter counts of field equipment types". Using QMX room devices with PXC4/5/7 controllers changes the Desigo CC license point count, and you can add extra license points.

Controller point limits that matter for a point tally ([V] A6V13202299, https://cache.industry.siemens.com/dl/files/085/109986085/att_1319865/v5/A6V13202299.pdf):

| Controller | Onboard I/O | Expansion I/O (TXIO) | Total incl. Modbus/M-Bus points |
|---|---|---|---|
| PXC4 | 16 | 40 | 80 |
| PXC5 | 24 | 80 | 120 |
| PXC7 | – | 400 physical | 600 |

Integration over KNX and BACnet does not count toward these limits.

Desigo CC licenses the field data points physically connected to the server, tracked as Required, Assigned and Remaining ([V help, hosted by a third party] https://kn-desigo.lrakn.de/DesigoCC_WEBApplikationen/Help/EngineeringHelp/en-US/13438527243.html). Licenses come as feature sets that bundle clients, points and options ([V] https://sid.siemens.com/api/khub/documents/FA94T7Xz~PIoTrgybJPPGw/content).

**Imports: none found.** ABT Site, the engineering tool, can export and re-import CSV files of BACnet object names and instances, and can export EDE files ([V] A6V10801454, https://sid.siemens.com/v/u/A6V10801454). That happens after selection, during engineering. Desigo Select's output format is not publicly documented.

## 3. Other vendors (all summary-only)

| Tool | Inputs and features | Import / export |
|---|---|---|
| Belimo SelectPro and Flow Capacity tool [V] | Valves, actuators, sensors and replacements. Pressure-dependent valves: Cv and ΔP. Pressure-independent valves: GPM (https://www.belimo.com/us/en_US/support-am/sizing-and-selection-tools/sizing-selection-tools; https://www.belimo.com/us/shop/en_US/sizing-and-selection). Dampers: area (ft²) × torque loading (in-lb/ft²) (https://www.belimo.com/mam/americas/technical_documents/Support%20material/how_to_size_a_damper_actuator.pdf). Fail-safe models 22–1,400 in-lb; electronic fail-safe position selectable 0–100% (https://www.belimo.com/us/shop/en_US/Damper-Actuators/Fail-Safe-Actuators/c/17704-17643) | "Export builder", "quote generator" and downloads of "your entire schedule". No import found. Nothing found on "Belimo Assistant" as a selection tool |
| JCI Selection Navigator [V] | Products and System Selectors; also estimates UL 864 controllers (Dec 2019, https://www.autocall.com/?ACT=72&ID=L3VwbG9hZHMvcmVzb3VyY2VzL0F1dG9jYWxsX1NlbGVjdGlvbl9OYXZpZ2F0b3JfVXBkYXRlX0Fubm91bmNlbWVudF8tX0RlY18yMDE5LnBkZg%3D%3D&EID=MTI5NQ%3D%3D) | Accepts a .CSV exported from Simplex FQQ, JCI's own fire-alarm takeoff tool, "for rapid pricing". FQQ maps columns and has a Third Party Items tab (https://www.simplexfire.com/fqq-sales-and-design-tool; May 2024 update: https://www.simplexfire.com/-/media/project/jci-global/fire-detection/simplex/united-states-simplex/files/simplex-fqq--idnac-p2p-update-announcement-may-2024.pdf). **No column spec is published, and nothing HVAC-controls-specific was found** |
| Honeywell GFD Tool [V] | Guided selection, comparison and cross-reference for thermostats, economizers, VFDs, sensors, wall modules, valves, E-Mon meters and actuators (https://buildings.honeywell.com/us/en/brands/our-brands/bms/resources/gfd-tool). Selection guide 67-7382-05, Oct 2021 (https://buildings.honeywell.com/content/dam/hbtbt/en/documents/downloads/BMS-BR-ValveSelectionGuide-67-7382-05Oct2021-Digital.pdf) | None found |
| Schneider Actuator & Valve Selection Tool [V, partner extranet] | Customer profiles; hydronic schedules via "Valve Assembly selection"; damper schedules (https://ecobuilding.schneider-electric.com/tools; https://ecoxpert.se.com/field-devices/valves) | Downloads schedules as Excel, PDF or BOM. No import found |
| KMC online tools [V] | Valves: GPM, max ΔP (psi) and specific gravity give Cv. Dampers: type, duct size, blade type and fpm give torque (http://www.kmccontrols.com.hk/products/productTools.html; https://www.kmccontrols.com/product-category/accessories/tools/) | None found |
| Distech [V] | xpressgfxPoints, an Excel add-in for points lists in their programming tool (https://www.distech-controls.com/products/detail/947824/distech-controls/xpressgfx-points) | Engineering only. **No estimating or selection tool found** |
| Kele [3P] | Damper actuator sizing from velocity and torque-loading factors (https://www.kele.com/templates/content.aspx?id=6442462341) | None found |
| Bidtracer [3P] | Controls estimating and engineering, product and valve selection, submittal builder (https://www.bidtracer.com/building-automation-controls-estimating-software.html) | Imports manufacturer price lists from Excel; exports estimates to Excel (https://www.selecthub.com/p/construction-bidding-software/bidtracer/). No takeoff import found |

## 4. Synthesis (recommendations — inference built on the sources above)

**4a/4b. Minimal fields for each device role, and where each comes from.**

Source codes:
- **D** = the drawings
- **S** = the specification
- **E** = an engineering decision made at selection time; export it blank and flagged
- **T** = computed by the takeoff; flag it as derived

Every row also carries:
- project, building, floor and room
- served unit, device tag, role and quantity
- furnished-by (BAS contractor or equipment manufacturer)
- provenance: sheet, table and row, marked printed, derived, spec or default

**Control valve**
- Service and medium: D (valve or coil schedule). Glycol %: S.
- Primary vs secondary loop (HIT only): D (flow diagram), otherwise E.
- 2-way, 3-way mixing or 3-way diverting: D.
- Body type (globe, ball, butterfly, PICV): S or D, otherwise E.
- Line size (in): D. Using pipe size instead must be flagged.
- Design GPM: D, taken primarily from the **coil or equipment schedule**. Steam: lb/hr and inlet psig from the coil or heat-exchanger schedule.
- Coil Δp: D (coil WPD, converted to psi).
- Scheduled Cv and valve Δp: D, or T as (GPM/Cv)².
- Branch Δp and tolerance: E.
- Close-off: S ("against pump shutoff head"), with the pump head from D.
- Fail position (normally open, normally closed, last position): D or S.
- Signal (0–10 V, 2–10 V, 4–20 mA, floating, 2-position) and voltage: S or D.
- Pressure class (ANSI 125/250) and leakage class: S.
- Entering water temperature (°F): D.

**Damper actuator**
- Service (outside, return, exhaust, relief, zone, bypass, isolation air); flag smoke and fire/smoke dampers: D.
- Width × height (in) and number of sections: D. Area (ft²): T.
- Blade type (opposed or parallel), seals and leakage class: D or S.
- CFM converted to fpm: D/T. Static pressure: D or S.
- Modulating or 2-position: D (points list or sequence).
- Fail position and fail-safe type (spring or electronic): D or S.
- Signal, voltage, end switches and feedback: S or D.
- Torque loading, safety factor, actuators per section, linkage and model: E.

**Sensors (by measured variable)**
- Variable (temperature, RH, dewpoint, CO2, differential or static pressure, airflow, water flow, energy, occupancy): D (points list, diagrams, sequence).
- Medium and mounting (room, duct, averaging, immersion, strap-on, outdoor): D or S.
- Range, accuracy and display or setpoint adjustment: S, otherwise E.
- Signal or sensing element (depends on the controller): S, otherwise E.
- Accessories (thermowell, averaging length, guard, pipe size for flow meters): S or D, otherwise E.

**Current switch / relay**
- Served load, HP/FLA, VFD or across-the-line starter: D (equipment schedule).
- Function (status, belt-loss, analog amps): D.
- Trip type, split or solid core, contact or 4–20 mA output, relay coil and contact rating: S or E. These options exist on the market, but the sources are weak ([3P] https://www.amazon.com/Veris-H608-Adjustable-Current-Switch/dp/B00AAMGLXS; https://www.scribd.com/document/56123097/Current-Switch).

**Controller I/O**
- Counts of analog/binary inputs and outputs (AI, AO, BI, BO) plus software points: D (points list) or T (tallied from device roles). ASHRAE Guideline 13 point-list columns are name, type, trend, alarm, reports and notes ([3P] https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/g13_2007_g_h_i_final_07092013.pdf; G13-2024 exists: https://www.ashrae.org/technical-resources/bookstore/ashrae-guideline-13-specifying-building-automation-systems).
- Integration points by protocol (Modbus/M-Bus vs BACnet/KNX), because PXC limits treat them differently: D or S.
- Network and UL 864 smoke-control flag: S.
- Grouping into cabinets: E.

**4c. Export shapes**
1. **Main export: one CSV per device family**, all sharing the common key block.
   - Families: valves, damper actuators, sensors, status/relays, points.
   - Units go in the column headers (e.g. `flow_gpm`, `coil_dp_psi`, `area_ft2`), with closed vocabularies.
   - Each engineering field gets a sibling `*_source` column.
   - A PDF carries the same tables, citations and a list of flagged blanks.
   - This covers Belimo, KMC, Schneider, Honeywell and Bidtracer, since all of them are hand-entry tools.
2. **Thin vendor adapters.** Only the HIT valve template has a documented format. Keep it, with these fixes:
   - Fill H from coil Δp (`CoilDP`).
   - Restrict tolerance to 10–50.
   - Leave cells blank for signals or port types the template can't represent.
3. **Desigo Select worksheet (CSV + PDF), for hand entry**, laid out like Desigo Select's own input:
   - Room automation: counts by building part → floor → room or terminal type.
   - Plant automation: I/O by type for each plant or proposed cabinet, with integration points split by protocol.
   - Desigo CC: an estimate of connected field points, with clients and options left blank.
   - No PXC model or cabinet selection; that stays with the tool.

## 5. Questions for Siemens (HIT and Desigo Select product owners, ORISA)

1. What exactly do Consumer Δp (`CoilDP`), Branch Δp and Tolerance mean, and how does HIT use them?
2. What else is in `VAAMassSizingTemplates` (ball valves, PICV/Combi valves, steam, dampers)? And is "Global" meant to be "Globe"?
3. How are STEAM rows sized with a USgpm column? Can the vocabularies be extended (4–20 mA, 2–10 V, 2-position, 120 VAC, diverting)?
4. Does HIT accept partial rows, more than 200 rows, or changed units? Does Unit No./Location map into the project? Is there an upload error report? Is the template versioned?
5. Is there any HIT project import, what is the project hierarchy, and what export formats exist?
6. Is the applications library available in the US version of HIT?
7. For Desigo Select: does it accept any import? What is the list of field equipment types? What is the output format? How are license points calculated? Does it handle US UL 864 requirements?
8. For JCI: what is the Selection Navigator CSV column spec, and does it accept CSVs from tools other than FQQ?