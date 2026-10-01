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

# What drives controls bid cost and risk beyond the drawing takeoff (research report, Sep 23 2026)

**How I researched this, and the limits.** I read these in full:
- Five DoD guide specs: UFGS 23 09 00, 23 09 13, 23 09 23.02, 23 09 93 and 25 05 11.
- The DoD design criteria UFC 3-410-02.
- One real bid package: Rockford Public Schools (IL) "ESSER HVAC Upgrades Phase 2" by IMEG, bid 23-16. It covers Division 23 (23 05 00, 23 09 00, 23 09 13) and 26 05 00. The pages I read show no issue date.

Most other sites were blocked by the network proxy. The session's shared WebSearch budget (200 calls) also ran out partway through. Items marked **†** come only from search-result summaries, so treat them as paraphrases, not checked quotes. Sections 4 and 5 are thin because of this. I changed no repo files; temporary files are only in the scratchpad.

## Bottom line
1. **The spec book sets much of the controls price, and some spec authors say so outright.** It decides which platforms may bid, conduit versus plenum cable, who powers panels, spare capacity, BTL listing, graphics and trending, software licensing, cybersecurity paperwork, test sampling and retest rules, training hours and warranty scope. UFGS designer notes say "requiring all wiring to be run in raceways will increase the project cost" [2]. They also say a software license "longer than five years... will likely increase the costs significantly" [4].
2. **Specs and the electrical sections contain catch-all clauses.** These move work that isn't drawn onto the controls contractor at no extra cost, which a drawing-only takeoff can't see [7][8].
3. **No AI tool I found extracts controls-specific price drivers.** Existing tools build submittal logs, run generic risk checklists or answer questions over documents. None targets Division 23 09 or Division 25 price drivers or builds a controls responsibility matrix [17–23].
4. **I found no credible public data on hours per BAS bid or hit rates.** Measure it inside the branch.

## 1. Spec requirements that change controls price

| Driver | Evidence (short quote) | Effect on price and risk |
|---|---|---|
| Who may bid (acceptable or sole-source manufacturers) | Rockford lists 10 BACnet platforms, including "Siemens Building Technologies: APOGEE", and says "Extend the existing Tridium FMCS for this project" [7]. TAMU names Siemens or Johnson Controls as acceptable† [9]. Illinois State allows only Siemens, Schneider and Delta, forbids mixing makers in one building, and requires the existing maker in renovations† [10]. OSU's medical center specifies Delta "or approved equivalent"† [11]. UFC 3-410-02 explains why: competitive bidding makes it "extremely difficult if not impossible to procure new DDC systems that are compatible with existing ones" [6]. | Decides whether to bid at all. Specs also use legacy product names (APOGEE), so names need mapping to current products. |
| Niagara openness | Required: "unrestricted interoperability license" with NICS entries such as `accept.station.in="*"` [1 §1.1.3]. | Affects license cost and which vendors qualify. |
| BTL listing and BACnet profiles | Controllers must be BTL-listed as B-BC, B-AAC or B-ASC [7]. A scheduling device must be "BTL Listed as a B-BC and support the SCHED-E-B BIBB" [3]. | Rules out some product lines and gateways. |
| Wiring method | "Wiring external to enclosures must be run in raceways" (the plenum-cable exception is optional), plus the cost note quoted in the bottom line [2 §3.1.15]. "Install IP Network Cabling in conduit" [3]. TAMU: exposed wiring in ¾" conduit, concealed wiring plenum-rated, and a "separate, independent" conduit system† [9]. Analog wiring must be "100 percent shielded pairs" [1 §2.6.3]. | Often the largest single labor swing. It isn't on the mechanical drawings. |
| Panel power | "Provide complete electrical wiring for the Control System, including wiring to transformer primaries" [2]. Rockford: "All power connections to the control panels shall be performed by a licensed electrician at the cost of this Contractor". Controls on emergency power go to the optional standby branch, and there is a conductor-size table [7]. | Adds electrician cost and circuit runs. |
| Enclosures | Outdoors NEMA 3/4; mechanical rooms NEMA 2/4. Designer note: "For retrofit projects in older mechanical rooms… specify Type 4" [1 §2.5]. | Material adders. |
| Spare capacity and network loading | 10% spare "but in no case… less than two spares of each implemented I/O type"† [11]. Rockford requires 10% spare on non-programmable controllers and caps nodes at "no more than 80% of the defined segment" [7]. | More controllers and more trunks. |
| Graphics and trending | "Create a customized graphic for each piece of equipment indicated on the itemized points list", plus floor-plan graphics. Trends must be stored in a relational/SQL database and exported in HTML and XML [7]. The UFGS DDC hardware schedule has fields for BTL, alarming, scheduling and trending on every device [1 §3.3.9]. | Engineering and programming hours. |
| Licensing and front end | "provide and license to the project site all programming software" [3]. "Owner shall be the named license holder" [7]. At least 5-year licenses that include security patches [4 §1.11]. | Software cost, plus ongoing patch work. |
| Third-party and packaged equipment | "Gateways should be used only for the integration of a single piece of equipment" [3]. A boiler or chiller plant gateway needs a formal request [1 §1.9]. For equipment with factory controls, the controls contractor's testing must cover "standard and optional control points… regardless if specified in contract documents or not" [1 §3.7.3.1]. | Integration scope that isn't drawn. |
| Cybersecurity | UFGS 25 05 11 requires a set of documents: STIG/SRG applicability and compliance reports, an encrypted interconnection schedule, a ports/protocols report, data-flow and riser diagrams, encrypted backups, a password report and a contractor-laptop compliance statement [4]. | Engineering and paperwork hours, mainly on federal jobs. |
| Testing and commissioning | Performance verification test sampling: "100-Percent" of primary systems and AHUs; "20-Percent" of identical terminal units. Then "An additional 25-percent after five-percent failure rate of first sample set" and "100-percent after any failures occurring in additional sample set" [1 §3.7.6]. "Lost trend data will require retesting" [1 §3.7.8.2]. For balancing, Rockford requires tools, 4 hours of training for the balancer and a technician "until the first 20 terminal units are balanced" [7]. | Commissioning labor and the risk of paying for retests. |
| Training and warranty | "[32] hours of training at the project site" [1 §3.10]. Rockford: 16 hours for 4 staff, plus "two days minimum instruction". Its warranty includes installing "all FMCS software upgrades" [7]. | Direct labor. |
| Instrument accuracy and meters | Space and duct temperature ±0.5°F; chilled water ±0.8°F. Airflow stations ±5%, and "differential pressure measurement is usually the least expensive" [2]. Texas Tech requires NIST-traceable energy measurement† [13]. | Changes the device class and price. |
| Contractor qualifications | "TCCs are limited to firms regularly employing a minimum of five full-time temperature control technicians within 100 miles" [7]. | Go/no-go. |
| Submittals and coordination | Sequences in the submittal must "match verbatim". The controls contractor "shall obtain approved equipment submittals from other contractors". Valve sizing follows "approved shop drawings" [7]. UFGS: "it is critical that complete Points Schedules are part of the Contract Drawings" [1 §3.3]. | Engineering hours, and sizing risk after award. |

**Sequences.** UFGS 23 09 93 is a full sequence library and does not cite Guideline 36 [5]. Secondary sources say Guideline 36 cuts programming and commissioning time [29]†. Whether a spec invokes G36 is worth extracting.

**Numbering.** Many owner standards put the BAS in Division 25 rather than 23 09: Texas State 25 51 00 (rev. Aug 2024), WSU 25 50 00, Northwestern 25 0000, FIU, and University of Houston Division 25† [15]. The tool must read both numbering schemes. Commentary on Division 25 says the more trades that touch it, "the higher the cost of classification errors"† [16].

## 2. Existing AI spec tools
- **Autodesk AutoSpecs (formerly Pype)** reads the spec book to build submittal logs. It suggests missing submittals from historical data and compares versions across design iterations† [17].
- **Procore** has an AI Submittal Builder that builds the submittal register and finds requirements in places "such as 'Warranty'". It also has Assist (Q&A over specs and RFIs) and Agent Builder, an open beta announced at Groundbreak 2025† [20].
- **Document Crunch** launched "CrunchAI for Specifications" on Aug 14, 2025. Its 18-item checklist flags "proprietary products with no alternates" and "coordination clauses that shift scope between trades", with citations to section and page† [18]. Trimble announced it would acquire Document Crunch on Apr 2, 2026 (400+ customers, $350B+ in construction volume)† [19]. It is the closest analog to what you need, but it is trade-agnostic.
- **Provision, Downtobid and Quotr** are aimed at general contractors or general preconstruction. They read specs, drawings and addenda for scope gaps or drafting proposals. Quotr's own framing leaves "scope, exclusions… and final pricing judgment" to the estimator† [21].
- **Parspec** extracts product requirements for MEP distributors and reps and matches them to a catalog of about 6M items† [22].
- **BAS estimating tools** (PataBid Assemble, ConEst, South Coast, Bidtracer) are assembly databases. I saw no spec reading† [23].
- **Siemens patent US9741002B2**, "Sales estimating tool for building control system" (inventor D. A. Egbers, assignee Siemens Industry per Justia), builds estimates from areas multiplied by "typical subsystems"† [24].

**The gap:** none of these turns controls spec clauses into estimate adders or produces a responsibility matrix.

## 3. Scope gaps: where controls bids lose money
- **"Anywhere in the documents" clauses.** From the same Rockford package:
  - "Any scope of work described at any location on the contract document shall be sufficient for including said requirement… In no case shall the project be assessed an additional cost for scope that is described on the contract documents on bid day." Division of work is left to the prime contractor [8 §1.6].
  - "All labor, material, equipment and software not specifically referred to herein or on the plans… shall be provided without additional cost" [7 §1.8].
  - "Drawings of the TCS and FMCS network are diagrammatic only" [7 §3.1].
  - UFGS: "The Government will not indicate all offsets, fittings, and accessories… on the drawings" [1 §1.1.6].
- **Boundaries with Division 26 (electrical):**
  - "All wiring required for the Control System, but not shown on the electrical drawings, is the responsibility of the Temperature Control Contractor" [8].
  - The electrical contractor furnishes starters and disconnects and wires the fire-alarm shutdown relays. It installs and wires controls devices only "when so noted on the Electrical Drawings" [8].
  - The spec admits "exact wiring requirements… cannot be determined until the systems have been selected and submittals reviewed" [7 23 05 00].
  - The mechanical contractor "Assumes all responsibility for Temperature Control wiring, if the [TCC] is a Subcontractor" [8].
  - VFD interface details are left to the controls contractor: "Verify output signal… with the EC", a separate status relay when the drive has a bypass, and low limits hardwired [7].
  - Some specs embed a furnish/install/wire matrix for dampers, actuators, valves, current switches and relays, e.g. Georgia Tech's FMS spec (Johnson Controls-edited)† [14].
- **Factory-packaged equipment.** Testing covers factory points "regardless if specified" [1 §3.7.3.1].
- **Retrofits:**
  - UFGS requires an existing-conditions survey with "estimated costs to correct". Reused devices must be brought to "proper working order". Downtime needs written approval [1 §3.1].
  - Rockford: "Beginning of installation means installer accepts existing conditions". Old device locations must be patched, sanded and painted. Work in mechanical rooms while school is in session is overtime. Airflow station "Size adjustments… at no additional cost" [7].
- **Industry context.** Arcadis's 2025 disputes report ranks "errors or omissions in contract documents" as the top cause of disputes for the third year running (as cited by Document Crunch)† [18].

## 4. Bid workflow and proposals (limited evidence)
- **Bid-form rules** [8 §1.16]:
  - "Voluntary add or deduct prices… will not be used in determining the low bidder."
  - "All material substitutions requested after the final addendum must be listed as voluntary changes."
  - Unnamed manufacturers need approval "via addendum".
- **Before pricing**, contractors must report document deficiencies. The documents are "a two-dimensional representation… subject to human interpretation" [7 §1.7].
- **After award**, the schedule of values must break down any line over $5,000 by equipment tag, with material and labor shown separately [7 §1.9]. That makes the proposal structure visible to whoever levels bids.
- **Pricing heuristics vary widely, which makes leveling hard.** Forum users cite $1,200 per point as a sell-price rule of thumb, while one owner reports paying about $500 per point. They note conduit, point type and graphics swing the figure, and one startup bid about 50% under the market† [25]. A 2003 AutomatedBuildings article cites "10% of the… HVAC system" and per-device pricing that ignores overhead† [26].
- **Not found:** sources on how controls subs typically format inclusions, exclusions and clarifications, or how general contractors level controls bids. Validate this with the branch's estimators.

## 5. Estimator time and hit rates
- No public data found on hours per BAS bid or on how time splits between takeoff, spec review, pricing and proposal writing.
- Vendor claims only: Document Crunch says customer Ben Hur Construction cut contract and scope review time "by roughly 80 percent"† [18]. Submittal-review tools claim 3–4 hours down to 20–40 minutes† [28].
- An Automated Logic practitioner lists the written specification as a required input for any complete controls estimate† [27].
- **Recommendation:** run a 2-week time study at the branch and pull hit rates from its bid log (CRM). If public benchmarks matter, a follow-up search with a higher search budget should look for FMI, ConstructConnect or Dodge surveys.

## 6. What this suggests for the next capability
Build a controls spec reader over 23 09 xx, 25 xx, 23 05 00 and 26 05 00 that outputs:
1. A cited checklist of price drivers (the table above) mapped to estimate adders.
2. A normalized furnish/install/wire responsibility matrix, reconciled against the electrical drawings.
3. Alerts on catch-all clauses and go/no-go conditions: named platform, "extend existing Tridium", open NICS, the local-technician radius.
4. Differences between addenda.
5. Draft clarifications and exclusions tied to specific clauses.

## Sources
1. UFGS 23 09 00 (Aug 2024, Chg 1 08/25): https://www.wbdg.org/dod/ufgs/ufgs-23-09-00 (read via https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFGS/UFGS%2023%2009%2000.pdf)
2. UFGS 23 09 13 (Nov 2015, Chg 2 05/21): https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFGS/UFGS%2023%2009%2013.pdf
3. UFGS 23 09 23.02 (Aug 2024): https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFGS/UFGS%2023%2009%2023.02.pdf
4. UFGS 25 05 11 (Aug 2024): https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFGS/UFGS%2025%2005%2011.pdf
5. UFGS 23 09 93 (Nov 2015): https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFGS/UFGS%2023%2009%2093.pdf
6. UFC 3-410-02 (2018, Chg 2 Apr 2021): https://nibs-s3-wbdg3-production.s3.us-east-1.amazonaws.com/FFC/DOD/UFC/ufc_3_410_02_2018_c2.pdf
7. Rockford PS ESSER HVAC Ph 2 (IMEG), bid 23-16, Pt 4 (Div 23): https://core-docs.s3.us-east-1.amazonaws.com/documents/asset/uploaded_file/4629/rps/4072865/23-16_Bid_Pt._Four.pdf
8. Same package, Pt 5 (26 05 00): https://core-docs.s3.us-east-1.amazonaws.com/documents/asset/uploaded_file/4629/rps/4072863/23-16_Bid_Pt._Five.pdf
9. † TAMU BAS standard: https://facilities.tamu.edu/_files/_documents/design-standards/building-automation-systems.pdf
10. † Illinois State 2024 Exhibit FS-23.3: https://facilities.illinoisstate.edu/downloads/reference/2024%20Exhibit%20FS-23_3%20ISU%20BAS.pdf
11. † OSU Appendix A-WMC: https://fod.osu.edu/sites/default/files/app_a-wmc.pdf
12. † Brown 23 09 00 (11-6-25): https://facilities.brown.edu/sites/default/files/standards/23%2009%2000%20-%20Building%20Automation%20Systems%20Design%20&%20Construction%20Criteria%2011-6-25.pdf
13. † Texas Tech 25 3001 (Oct 15 2025): https://www.depts.ttu.edu/operations/Documents/docs/ConstructionStandards/253001_BuildingAutomationSystems.pdf
14. † Georgia Tech 230900 FMS (JCI 2015 edit): https://facilities.gatech.edu/sites/default/files/section_15900-230900-jci_2015_edit.doc
15. † Division 25 owner standards: https://docs.gato.txst.edu/700541/25_51_00-Integrated-Automation-Facility-Controls.pdf ; https://facilities.wsu.edu/documents/2020/09/25-50-00-integrated-automation-facility-controls-3.pdf/ ; https://www.northwestern.edu/facilities/docs/contractor-docs/nu_25-0000-2019.1---integrated-automation.pdf ; https://www.uh.edu/facilities-planning-construction/vendor-resources/owners-design-criteria/master-specs/jan-2017/division25jan2017.pdf
16. † Division 25 commentary: https://www.csemag.com/your-questions-answered-how-to-specify-integrated-automation-and-connected-buildings-using-masterformat-division-25-specifications/ ; https://www.optigo.net/blog/how-spec-division-25/ ; https://theconstructionstandard.com/masterformat-division-25-integrated-automation-csi-standards-construction-documents
17. † https://construction.autodesk.com/tools/autospecs-construction-submittal-log/
18. † https://www.documentcrunch.com/news/crunch-ai-for-specifications (Aug 14 2025)
19. † https://news.trimble.com/2026-04-02-Trimble-to-Acquire-Document-Crunch-to-Add-AI-Powered-Risk-Management-and-Document-Compliance-to-Trimble-Construction-One-Project-Delivery-Ecosystem
20. † https://www.procore.com/whats-new/ai-powered-submittal-builder ; https://www.procore.com/press/procore-advances-the-future-of-construction-with-new-ai-innovations
21. † https://provision.com/blog/best-ai-tools-for-construction-and-general-contractors-in-2026 ; https://downtobid.com/blog/ai-construction-bidding ; https://quotr.ai/blog/ai-bidding-software-construction/
22. † https://aidirectory.aecmag.com/entry/parspec/
23. † https://www.patabid.com/building-automation-estimating-software ; https://bidtracer.com/controlsestimatingsoftware.aspx
24. † https://patents.google.com/patent/US9741002 ; https://patents.justia.com/inventor/david-a-egbers
25. † https://hvac-talk.com/vbb/threads/137974-Estimate-control-jobs ; https://hvac-talk.com/vbb/threads/75098-per-point
26. † https://www.automatedbuildings.com/news/aug03/articles/cmcg/cmcg.htm (Aug 2003)
27. † https://automatedbuildings.com/news/may08/columns/080421114633calabrese.htm (May 2008)
28. † https://www.speclens.ai/blog/submittal-review-software-comparison
29. † https://sustainable-eng.com/ashrae-36-overview/ ; https://www.ashrae.org/professional-development/all-instructor-led-training/catalog-of-instructor-led-training/guideline-36-best-in-class-hvac-control-sequences