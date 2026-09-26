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

# Assemblies and kits in HVAC and BAS estimating

## Read first: how this was sourced
- **Nothing was read in full.** The sandbox egress proxy blocked every page fetch. WebFetch returned EGRESS_BLOCKED for every domain I tried, including automatedbuildings.com, hit.sbt.siemens.com, uspto.gov, smartbuildingsacademy.com and wikipedia. curl got a 403.
  - Everything below comes from search-engine summaries of the linked pages.
  - Quotes are as the search tool returned them and may be slightly trimmed.
  - Check anything that will drive a product decision against the page itself.
- **Search budget ran out.** The session's 200-search budget was used up, so a few lines of inquiry stop early.
- **No Reddit results.** No query returned any Reddit content, including `site:reddit.com` searches. Practitioner views come from the HVAC-Talk and Mike Holt forums instead, and their post dates were not visible.
- **Your repo's PRs are publicly indexed.** Searches for HIT valve templates returned this project's own GitHub PRs ([#101](https://github.com/erikjohnstone/master-plan/pull/101), [#102](https://github.com/erikjohnstone/master-plan/pull/102)). They name the Siemens file `Valve_Size_Template_US_Global.xlsx`. I did not use them as evidence. If the repo or template is meant to be internal, check its visibility.

## 1. Bottom line
1. **An "assembly" is a saved bundle tied to one countable thing.** It is also called a kit, typical, system or application. It holds the parts, their quantity formulas and the labor units for that one item. The estimator counts something like "VAV w/ HW reheat × 142", and the software expands it into a bill of materials (BOM) and labor hours. Every mainstream takeoff, mechanical and electrical estimating tool I checked works this way (§2, §4).
2. **In BAS the same idea is called typicals, systems or applications.**
   - ICS Concerto advertises "80+ pre-built systems, with each system containing labor, material, schematics, sequences of operation, PDF cutsheets, point lists and more" ([ICS](https://www.ics-controls.com/ent-features)).
   - Siemens HIT has "over 400 preconfigured HVAC applications". Each comes with "plant diagram, list of material, technical documentation for each device, as well as pricing" ([Siemens](https://www.siemens.com/global/en/products/buildings/support/hit-portal.html)).
3. **In mechanical work, "kits" also means physical factory-assembled products.** These are coil hook-up kits, coil paks and piping packages, bought as one tagged item per coil. Some include the temperature control valve. That changes who furnishes the control valve, which is a classic source of missed scope (§2.4).
4. **What this means for your tool.** It already finds what to count. Assemblies are the step that turns counts into dollars: equipment tag → type and attributes → assembly variant → BOM plus hours by labor category → price. Without that step the output is a takeoff, not an estimate.

## 2. What the terms mean

### 2.1 In general takeoff tools
- **PlanSwift**
  - "Assemblies are basically a group of parts that can be applied all at once" ([PlanSwift](https://www.planswift.com/blog/use-parts-assemblies/)).
  - An assembly is "a pre-built bundle of materials, labor, and equipment associated with a single measurement."
  - Applying one asks for variables that feed all its parts, e.g., height, spacing and waste % ([PlanSwift](https://www.planswift.com/blog/use-takeoff-assemblies/)).
- **STACK**
  - "Items are reusable components" that generate "material quantities, labor hours, equipment needs, and costs."
  - "Assemblies are bundles of Items that work together… complete with custom formulas and options."
  - Costs are stored by cost type: Equipment, Labor, Material or Custom ([STACK](https://www.stackct.com/blog/mastering-stack-takeoff-estimating-expert-tips-for-using-items-and-assemblies-to-streamline-bids/)).
  - "Typicals" let you measure a repeating layout once and place it wherever it repeats. STACK then multiplies the quantities ([STACK](https://www.stackct.com/blog/typicals/)).
  - ConstructConnect Takeoff has a similar "Typical Areas" feature ([help](https://help.constructconnect.com/09-advanced-takeoff-multi-condition-and-typical-takeoff-166/constructconnect-takeoff-09-06-typical-areas-overview-and-examples-2457)).
- **On-Screen Takeoff + Quick Bid**
  - Quantities flow into "the naming, phasing, and assemblies you already use" ([Quick Bid](https://www.oncenter.com/products/quick-bid/)).
  - Once the two are linked, "conditions" (takeoff categories) are created only in OST, and their quantities can't be edited in Quick Bid ([help](https://help.constructconnect.com/06-creating-and-managing-bids-alternates-and-change-orders-127/quick-bid-06-03-01-overview-and-rules-of-interactivity-with-on-screen-takeoff-dos-and-don-ts-469)).
- **Bluebeam Revu** has no real assemblies. The usual workaround ([Novedge](https://novedge.com/blogs/design-news/bluebeam-tip-standardize-measurement-templates-in-bluebeam-revu-for-faster-consistent-takeoffs), [Bluebeam](https://support.bluebeam.com/revu/how-to/tips-and-tricks/boost-takeoff-workflows-with-count-tool.html)):
  - save Count tools in a Tool Set for each trade
  - use "Set Column Defaults" to prefill custom columns such as "Cost Code, Assembly, Phase, Unit Price"
  - export the Markups Summary to CSV or Excel.

### 2.2 In mechanical estimating
- **Trimble AutoBid Mechanical**
  - "Pre-built Assemblies are accessible with just the click of a button."
  - MCAA and PHCC labor units are built in, and material prices update through a live pricing link ([Trimble](https://www.trimble.com/en/products/trimble-autobid-mechanical), [datasheet](https://mep.trimble.com/en/resources/product-trimble-autobid/trimble-autobid-mechanical-datasheet)).
  - Trimble runs training on "Using the New MCAA Labor Book in AutoBid Mechanical" ([video](https://videos.trimble.com/library/watch/j8SjEhefwTe3sxbMaekyra)).
- **FastEST FastPIPE**
  - "hundreds of 'built-in' HVAC and plumbing assemblies". They cover "gas connections, boilers, chillers, coils, pumps, VRF systems" and can be copied into a job and modified.
  - MCAA and PHCC labor units, and a catalog of more than 150,000 items ([FastEST](https://fastest-inc.com/FastPIPE)).
- **QuoteSoft**
  - "hundreds of industry-specific assemblies" ([piping](https://quotesoft.com/products/plumbing-and-piping/)).
  - HVAC equipment files for "rooftop units, VAV boxes, terminal units, exhaust fans…", plus "unlimited assemblies files" ([HVAC](https://quotesoft.com/products/hvac-sheetmetal/)).
- **Trimble Estimation Desktop HVAC** also advertises pre-built assemblies ([Trimble](https://www.trimble.com/resources/construction/en-US/video/5-reasons-hvac-contractors-use-trimble-estimation-desktop-hvac)).

### 2.3 In BAS/controls estimating
- **Concerto (ICS, a BAS-only software vendor since 1990)**
  - It has the pre-built systems quoted in §1 and can generate "Valve, Point and Damper Schedules."
  - Its cost templates hold "hourly labor, expenses, travel, subcontracting, overhead, taxes, default margins" ([features](https://www.ics-controls.com/ent-features), [ICS](https://www.ics-controls.com/ent-welcome), [IronPros](https://www.ironpros.com/product-categories/technology-and-software/business-financial-tools/bidding-estimating-tools/product/22899438/ics-concerto-enterprise)).
- **Bidtracer**
  - Users can "build predefined systems/assemblies, custom cost codes, and custom labor groups."
  - They can "reuse systems creating more versions" ([Bidtracer](https://bidtracer.com/buildingautomationcontrolsestimatingsoftware.html)).
- **Honeywell** (per the search listing) holds "sales estimating tool" patents built on the same premise.
  - The background notes that a BAS "can include several different subsystems, many subsystems can be similar."
  - The UI has project view, details, preview, library and cost summary boxes ([US 9,087,309](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9087309), [US 9,741,002](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9741002)).
- **Owner standards act as typicals too.**
  - FSU's "IC-16 VAV Box With Reheat" is a "basic guideline of minimum requirements for typical VAV air terminal units", meant to be included in contract drawings ([FSU](https://www.facilities.fsu.edu/depts/designConstr/2011%20Control%20Standards/Controls/IC-16/IC-16%20VAV%20Box%20With%20Reheat.pdf)).
  - Joint Base Lewis-McChord (JBLM) publishes minimum DDC points for AHU, DOAS, HRU, VAV and FCU systems ([JBLM](https://www.jblmdesignstandards.army.mil/Portals/109/DocumentRepositoryForDSLinks/Div-23/DDC%20Minimum%20Points%20List%20Required.pdf)).

### 2.4 Physical kits: coil hook-ups and piping packages
- **IMI Flow Design (formerly Flow Design Inc.)** coil hook-up modules ([IMI](https://www.imiflowdesign.com/coil-hook-up/), [standard kits PDF, Nov 2018](https://www.imiflowdesign.com/wp-content/uploads/2018/11/IMI-Standard-Kits-3.pdf)):
  - ½″–2″ ball valves
  - a Y-strainer and union with a 20-mesh stainless screen
  - unions with MPT, FPT or sweat ends
  - integrated balancing valves, leak-tested at the factory.
- **Nexus Coil Pak** ([Nexus](https://nexusvalve.com/products/coil-paks), [A2Y](https://nexusvalve.com/product/coil-pak-a2y)):
  - Return side: an UltraMatic automatic flow control / ball valve / union with pressure-temperature (P/T) test plugs, plus a union with a manual air vent.
  - Supply side: a ball valve / union with a P/T plug. On "Y" models it is a strainer / ball valve / union with a blowdown drain.
- **Hays**
  - Pre-assembled, leak-tested 2- and 3-way packages, hard-piped or flexible.
  - They carry Mesurflo automatic or manual balancing valves, strainers and ball valves.
  - Hose kits run ½″–2″ and 0.2–100 GPM ([Hays](https://www.haysfluidcontrols.com/piping-packages), [hose kits](https://www.haysfluidcontrols.com/hose-kits)).
- **Griswold** ([Griswold](https://griswoldcontrols.com/hvac-valves/coil-piping-packages-hose-kits/)):
  - Packages connect "with as few as 4 connections."
  - "Components for each coil kit are shrink wrapped together and tagged for location, with flow rates and connections sized for each coil."
  - Options include "temperature control valves."
- **Bell & Gossett** also sells coil kits ([Xylem](https://www.xylem.com/en-us/products--services/heating-ventilation-air-conditioning-hvac-plumbing/flow-balancing-products2/coil-kit-hook-ups/coil-hook-up-kits/)).
- **Scope trap: who furnishes, sizes and installs.**
  - One Division 23 spec in my search results says: "All automatic control valves shall be installed by the mechanical trade. All control valves shall be sized by the control vendor."
  - That search returned several specs, including [UMD Div 23 standards (Apr 2024)](https://facilities.umd.edu/sites/default/files/2024-04/Contractor-SpecsDivision_23.pdf). I couldn't confirm which spec contains that sentence.
  - VAV controls can be factory-mounted by the box manufacturer ([JCI VAV doc](https://docs.johnsoncontrols.com/bas/api/khub/documents/HTr9g6enct~0QrQtcqWvWw/content)).
  - Assembly lines therefore need furnished-by, installed-by and wired-by flags.

### 2.5 Example BAS typicals
These are illustrative, assembled from the cited sources. Real contents come from each branch's standards and the job specification.

| Typical | Contents | Variants that change the BOM |
|---|---|---|
| VAV box, hot-water reheat | DDC controller (temperature and airflow inputs; outputs to damper and hot-water valve), zone sensor, supply/discharge air sensor downstream of the reheat coil, reheat valve and actuator, 24 VAC transformer, cable, factory-mount coordination ([MEP Academy](https://mepacademy.com/how-vav-box-ddc-controllers-work/), [HVACProSales](https://hvacprosales.com/hvac-how-to/how-to-program-a-vav-box-controller/), [PNNL](https://www.pnnl.gov/projects/om-best-practices/variable-air-volume-systems), [FSU](https://www.facilities.fsu.edu/depts/designConstr/2011%20Control%20Standards/Controls/IC-16/IC-16%20VAV%20Box%20With%20Reheat.pdf)) | cooling only; electric reheat; fan-powered; CO2/occupancy; valve size and Cv from the valve schedule |
| AHU | Supply, mixed, return and outdoor air temperatures plus outdoor humidity; filter differential pressure; freezestat and duct smoke detectors monitored for safety; VFD controlled to duct static setpoint; heating and cooling valves ([MEP Academy](https://mepacademy.com/ddc-control-of-an-air-handler/)); outdoor, return and exhaust economizer damper actuators ([Siemens OpenAir](https://hit.sbt.siemens.com/RWD/app.aspx?MODULE=Catalog&ACTION=ShowGroup&KEY=OPC_375746)) | economizer or not; VFD hardwired or BACnet; who furnishes smoke detectors; energy recovery; humidifier |
| FCU | Unitary controller, space sensor, fan start/status, one valve and actuator per coil (the valve may come in a coil kit) | 2-pipe or 4-pipe; electric heat |
| Pump, exhaust fan | Start/stop, status, VFD speed and fault (illustrative only) | VFD or constant speed |
| Chiller, boiler, RTU | Mostly network integration plus hardwired enable and alarm points. Siemens' configurator puts "large integrated datapoint counts… on a dedicated PXC5.E003 system controller" ([Desigo Select](https://sid.siemens.com/v/u/A6V13900039)) | factory controls or field controls |
| Control panel | Enclosure, controller and I/O, power supply, relays, terminals, panel-build labor ([PataBid](https://www.patabid.com/building-automation-estimating-software) has "labor units for… panel building"). A [Mike Holt thread](https://forums.mikeholt.com/threads/building-control-panels-pricing.60423/) suggests charging per termination | point count |

### 2.6 How an assembly is built and used
**Structure.** Across the tools above, an assembly has these parts:
- a trigger: a count, a length or an area
- child items, each with a quantity formula: per unit, per point or per foot, plus waste
- labor units per item or per task, split by labor type
- options or variants chosen when the assembly is applied (PlanSwift), or saved system versions (Bidtracer)
- cost codes and phases.

**Estimator workflow.**
1. Count equipment by type from the schedules and plans.
2. Assign each tag to an assembly variant.
3. The tool multiplies out the BOM and the labor hours by category.
4. Apply labor rates, travel, subcontracts, overhead and margin (Concerto's cost templates).
5. Add project-level items that no typical carries: front end, network, graphics, project management and closeout.

## 3. How controls contractors estimate

### 3.1 Methods
- **Price per point.** One method "counts the number of control points and multiplies that number times $1200 to determine the sell price." The price per point has fallen as competition increased ([AutomatedBuildings, Aug 2003](https://www.automatedbuildings.com/news/aug03/articles/cmcg/cmcg.htm)).
- **Price per device.** For example, "a fan coil unit at $350." The same article says:
  - this approach usually leaves out overhead, travel, subcontracts and profit
  - cost-per-device spreadsheets are "too simplistic"
  - estimates need to land within 2–5%, consistently.
- **Systems with task hours** ([HVAC-Talk](https://www.hvac-talk.com/threads/estimate-control-jobs.137974/)):
  - "break the job down into specific systems (retail heat pumps, 2nd floor office VAVs, Cooling tower #1)"
  - allocate installation, programming and design time to each part
  - add a cost per foot of wire and conduit
  - apply a difficulty multiplier
  - estimate in hours rather than dollars, so a change in the journeyman/apprentice mix reprices automatically.
- **The case against pricing by points**
  - Phil Zito (Smart Buildings Academy): "the worst thing, in my opinion, you can do is go by points… points aren't equal."
  - He prices labor by rate type: Technician, Designer, Programmer and PM. PM is about 10–20% of technical time, and he says there is no standard rule for the rest ([SBA](https://blog.smartbuildingsacademy.com/schedule-labor-common-tasks)).
  - In process control, sequences, interlocks and platform can "swing the $-per-point factor by as much as an order of magnitude" ([Chemical Processing](https://www.chemicalprocessing.com/automation/control-systems/article/11312700/control-system-rule-out-a-rule-of-thumb-chemical-processing)).

### 3.2 Labor and material categories
- **Engineering, programming and graphics.** A BMS "Post-Sales Estimation Engineer" posting (employer not shown) estimates "hardware engineering, programming and graphics" ([job](https://builtin.com/job/sr-application-engineer-ii-bms-hardware/4585305)). The role:
  - reviews MEP drawings "to identify HVAC equipment, dampers, sensors and valves"
  - reads the control specification and sequences of operation
  - raises RFIs.
- **Engineering and field hours.** ModernControls estimators build "digital takeoffs composed of a point list, controller selection, labor, and materials estimate", including "engineering and field hours" ([PDF, May 2021](https://www.moderncontrols.com/wp-content/uploads/2021/05/BAS-Project-Estimator.pdf)).
- **Electrical subcontract.** JCI's BAS estimator role includes "electrical subcontractor RFP generation." It works from "Selection Navigator" files, materials lists and subcontractor bids ([JCI](https://jobs.johnsoncontrols.com/job/WD30263901)).
- **Travel, subcontracts, overhead and margin** appear as Concerto cost-template items.
- **Training and warranty** did not appear as separate line items in anything I could reach.
- **Material categories** implied by the tools:
  - controllers and I/O modules, software licensing and controller cabinets ([Desigo Select](https://sid.siemens.com/v/u/A6V13900039))
  - valves and actuators, and damper actuators ([HIT](https://hit.sbt.siemens.com/RWD/app.aspx?RC=US&lang=en&MODULE=Catalog&ACTION=ShowGroup&KEY=OPC_376464))
  - sensors and panels ([PataBid](https://www.patabid.com/building-automation-estimating-software))
  - wire and conduit, priced per foot (HVAC-Talk above). Posters there point to RSMeans for conduit, wire and device units ([thread](https://hvac-talk.com/vbb/threads/1732321-Estimating-installation-manhours)).

### 3.3 Rules of thumb found (none of these is a standard)
| Figure | Type | Source |
|---|---|---|
| $1,200 per point, sell price | article, 2003 | [AutomatedBuildings](https://www.automatedbuildings.com/news/aug03/articles/cmcg/cmcg.htm) |
| "$1.2K to $1.5K per point", US DDC work | forum | [HVAC-Talk](https://hvac-talk.com/vbb/threads/1732321-Estimating-installation-manhours) |
| $1,000–1,500 per data point; programming and testing up to 25% of cost | NREL (Trenbath et al. 2022), as cited in a later paper | [T&F](https://www.tandfonline.com/doi/full/10.1080/23744731.2024.2444819) |
| Labor is 50–75% of BAS cost | secondary summary of NREL 2022 | [FractionalBAS](https://fractionalbas.com/guides/bas-cost-breakdown/) |
| $2.50–$7.50 per sq ft | contractor blog | [MACC](https://info.midatlanticcontrols.com/blog/how-much-does-a-building-automation-system-cost) |
| $200 per VAV, $350 per RTU; 2 h per VAV "from an integration standpoint"; AHU rooms and boiler plants about 40 h | forum | [Mike Holt](https://forums.mikeholt.com/goto/post?id=1104387) |
| Retrofit VAV: 4–5 h if existing wiring is reused; quotes of $750–1,200 per unit | forum | [Mike Holt](https://forums.mikeholt.com/threads/vav-control-install-unit-price.131619/) |
| 1.5–2.0 technician hours per point for checkout, startup, programming and graphics, "assuming all the hardware is in place"; 1.5–3.0 h per point for wiring (50 ft average run) | search summary of HVAC-Talk threads; **attribution unconfirmed** | [HVAC-Talk](https://hvac-talk.com/vbb/threads/1732321-Estimating-installation-manhours) |
| Industrial PLC, not BAS: 0.75 h per digital point, 1.5 h per analog point, 6 h per HMI screen | blog | [Industrial Monitor Direct](https://industrialmonitordirect.com/blogs/knowledgebase/plc-programming-time-estimation-methods-for-industrial-engineers) |

**No public BAS labor-unit manual turned up.**
- Mechanical tools ship MCAA and PHCC units ([FastEST](https://fastest-inc.com/FastPIPE)).
- Electrical tools ship NECA units ([McCormick](https://www.mccormicksys.com/industries/electrical/)).
- I found nothing comparable for BAS work. Its labor units appear to live in company spreadsheets or vendor tools. Concerto claims to contain "all the necessary labor hours" ([ICS](https://www.ics-controls.com/ent-welcome)).

### 3.4 Integration points
I found no published labor units for BACnet, Modbus or LON integration. The only evidence I found:
- Siemens sizes controllers around integrated datapoint counts (Desigo Select, above).
- One forum poster budgets 2 h per VAV for integration.

My own inference, not sourced: integration is usually priced as a per-device allowance plus a per-mapped-point factor, kept separate from hardwired I/O. The per-device allowance would cover the driver or license, point mapping and testing. Confirm this with the Siemens estimators.

## 4. Software landscape
- **Siemens.** Public material covers only HIT and Desigo Select (§5). I found nothing public about a branch-level internal estimating tool.
- **JCI**
  - A mobile-first version of Solution Navigator was announced [Apr 12, 2022](https://www.johnsoncontrols.com/media-center/news/press-releases/2022/04/12/mobile-first-solution-navigator-platform). It lets users "select, price, quote, order."
  - Third-party design tools can export "a .CSV file… that can be uploaded to Selection Navigator for rapid pricing" ([JCI](https://www.johnsoncontrols.com/services-and-support/product-selection-tools)).
  - JCI estimator postings ask for "Procore, McCormick, and Bluebeam" plus takeoffs and "BOM development" ([posting](https://workopia.io/jobs/091125497ec49e58783201be988b6ae9)).
- **Honeywell.** Besides the patents above, a customer "estimating tools" page lists a GFD field-device selection tool ([Honeywell](https://customer.honeywell.com/en-US/support/commercial/estimatingtools/Pages/default.aspx)).
- **Independent BAS tools**
  - Concerto and Bidtracer (above).
  - PataBid, which automatically counts "sensors, and panels" from drawings.
  - McCormick's building-automation edition, with prebuilt assemblies and an "Auto Home Run" cable-run feature ([McCormick](https://www.mccormicksys.com/industries/automated-building-systems/)).
  - [D-Tools](https://www.d-tools.com/hvac-controls-industry).
  - ControlsHub web tools: an AHU point estimator and a VAV point template that exports to CSV ([ControlsHub](https://controlshub.tech/en/tools/)).
  - Excel remains common: "Most small mom and pop shops just use an Excel sheet" ([HVAC-Talk](https://hvac-talk.com/vbb/threads/578512-Controls-estimating-software)).
- **Electrical tools used for controls wiring and conduit**
  - ConEst IntelliBid: "140,000+ items and 500,000+ pre-built… assemblies" ([ConEst](https://conest.com/)).
  - McCormick: 55,000 items, 25,000 assemblies and three levels of NECA labor units ([McCormick](https://www.mccormicksys.com/industries/electrical/)).
  - Accubid: 42,000 items and 13,000 assemblies, with "project-specific assemblies on-the-fly" ([Trimble](https://www.trimble.com/en/products/trimble-accubid-classic)).

## 5. Siemens HIT (HVAC Integrated Tool)
- **Origin**
  - ORISA built HIT for Siemens in 2008 and redesigned it for responsive web in 2014. It reports more than 50,000 users ([ORISA](https://www.orisa.de/en/references/siemens-hit-hvac-systems)).
  - The 2008 description: 300 preconfigured, modifiable applications across heating, ventilation/climate, refrigeration and room control, each yielding a system diagram and material list.
  - It also describes a project module for copying and modifying systems, plus proposal texts generated in Word and product lists in Excel ([aecweb.de 2008](http://www.aecweb.de/news/2008/0106.php4)).
- **Today**
  - "over 400 preconfigured HVAC applications", each with plant diagram, material list, device documentation and pricing.
  - Products can be ordered through Siemens Industry Mall ([Siemens](https://www.siemens.com/global/en/products/buildings/support/hit-portal.html)).
- **Functions** (per a Siemens rep's post, Apr 8, 2020) ([HVAC RepCo](https://www.hvacrepco.com/2020/04/08/siemens-hit-hvac-integrated-tool/)):
  - Selection, using filters and calculators
  - Replacement, cross-referencing other brands and discontinued parts
  - Projects: "create project schedules and gather submittal documents for faster bidding"
  - Ordering, through a cart connected to iMall.
- **Valves and dampers**
  - It sizes and selects valves, including pressure-independent control valves (PICVs). The HIT App "calculates the maximum volumetric flow and presetting, checks the commissioning settings" ([Acvatix brochure](https://assets.new.siemens.com/siemens/assets/api/uuid:414aa9cc-eecb-461b-8368-5ca3a123fd36/acvatix.pdf), [demo video](https://www.youtube.com/watch?v=Z8lKS7JLSvE), [sizing guide](https://sid.siemens.com/api/khub/documents/m3P5wV~P6hce6~UZfNsRmQ/content)).
  - The earlier desktop valve tool was SimpleSelect, released in 2012 ([automation.com](https://www.automation.com/en-us/articles/2012-1/siemens-releases-simpleselect-valve-selection-tool)).
  - Damper actuators have their own catalog and selection guide ([guide](https://assets.new.siemens.com/siemens/assets/api/uuid:58cb9df1-0c4b-4951-a5d5-356c5946560c/damper-actuator-selection-for-hvac-systems-appliction-guide.pdf)).
- **Desigo Select** runs inside HIT. It produces "Desigo CC licensing solutions, plant automation for controller cabinet solutions, and room automation controller solutions configured in Building Parts and Floors" ([SID](https://sid.siemens.com/v/u/A6V13900039)).
- **December 2023 additions:** scanning product DMC codes with a phone, and a compare view in the replacement guide ([LinkedIn](https://www.linkedin.com/posts/james-clayton-6909a299_siemens-hit-tool-take-a-look-at-some-of-activity-7141128499246927873-HTBL)).
- **Takeaway:** HIT is Siemens' own application/assembly engine. I found no public documentation of its bulk valve-import template.

## 6. Pain points
- **Accuracy:** estimates must land within 2–5%, and simple per-device pricing leaves out overhead, travel, subcontracts and profit ([AutomatedBuildings](https://www.automatedbuildings.com/news/aug03/articles/cmcg/cmcg.htm)).
- **Complexity:** points aren't equal. Sequences and interlocks drive labor ([SBA](https://blog.smartbuildingsacademy.com/schedule-labor-common-tasks), [Chemical Processing](https://www.chemicalprocessing.com/automation/control-systems/article/11312700/control-system-rule-out-a-rule-of-thumb-chemical-processing)).
- **Custom work and skills shortage**
  - NREL interviewed 28 experts in 21 interviews. The main barriers were "complex and confusing systems, lack of user skills, and financial concerns" ([OSTI](https://www.osti.gov/biblio/1880546)).
  - A later paper citing NREL blames high cost on "custom implementations carried out on a building-by-building basis" and on workforce shortages ([T&F](https://www.tandfonline.com/doi/full/10.1080/23744731.2024.2444819)).
- **Where estimator time goes** (inferred from job posts and vendor pitches): picking out equipment, dampers, sensors and valves from MEP drawings; reading specs and sequences; writing RFIs. Automatic counting is the main thing vendors sell (PataBid).
- **Missed-scope hotspots** (sources above; the grouping is mine):
  - who furnishes, sizes and installs control valves
  - factory-mounted VAV controls
  - the electrical subcontract
  - integration point counts
  - whether existing wiring can be reused on retrofits.
- **Gap:** I found no Reddit threads and no direct quotes on how estimators feel about templates. The indirect evidence is heavy Excel use (HVAC-Talk) and every BAS vendor selling reusable systems.

## 7. What this suggests for the product (my synthesis)
1. **Build an assembly library keyed by equipment type and attributes.** Attributes come from the schedules: VAV subtype, reheat type, valve size and Cv, and fail-safe position from the sequences. Each typical has options and variants.
2. **Let each branch import and edit its own typicals** (items, quantity formulas, hours by labor category) rather than hardcoding them.
3. **Output a BOM plus hours** by Engineering, Programming, Graphics, Install/Wire, Checkout and PM. Export to Excel, the HIT valve template and CSV (the JCI-style pricing import).
4. **Flag every line furnished-by, installed-by and wired-by**, and add a scope-gap checklist.
5. **Check points and integration:** reconcile the points each typical generates against the extracted points list, and count integration points separately.
6. **Ask whoever said "kits are a big deal" which meaning they had:**
   - estimating assemblies or typicals
   - physical coil hook-up kits and piping packages
   - OEM accessory kits such as economizer kits or BACnet cards. This third one is my guess and was not researched.