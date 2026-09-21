# Linear-Takeoff Engine: Industry Numbers, Standards and Estimating Conventions (Duct / Pipe / BAS)

*Companion research file for `plans/03-linear-takeoff-hvac-bas-plan.md` (§5, Appendix B). Web research on 2026-09-16.*

**Research-method note (read first).** In this session WebFetch and curl were blocked by the network egress proxy for every domain attempted (ICC, SMACNA mirror at law.resource.org, up.codes, ASHRAE, MEP Academy, Wendes, RSMeans, etc.), and the WebSearch budget was exhausted after ~65 queries. Every number below therefore comes from search-result excerpts of the cited pages, not from reading the full documents. Legend used throughout:

- **[C]** = codified value quoted from a code/standard page or its mirror in search results.
- **[V]** = vendor/estimating-firm/textbook value quoted in search results (rule of thumb, not code).
- **[M]** = from training knowledge of the standard; consistent with the confirmed cells but the individual cell was NOT confirmed in this session. Verify against the cited document before shipping.

---

## A. DUCTWORK (sheet metal)

### A1. SMACNA gauge / reinforcement / joints

**Table structure.** SMACNA *HVAC Duct Construction Standards – Metal & Flexible* organizes rectangular duct by pressure class (½, 1, 2, 3, 4, 6, 10 in. w.g.); you enter the column for pressure class and the row for the duct's **longest side**, and the cell gives minimum gauge plus a reinforcement code and spacing (3rd ed. Tables 1-3…1-9; 4th ed. renumbered as Chapter 2 tables). Joint types rated include slip-and-drive, TDC and TDF/Ductmate-type flanges. [C] https://www.plumbingsupplyandmore.com/how-to-read-smacna-duct-construction-tables ; https://hvacprosales.com/hvac-ductwork/smacna-standards/ ; https://brominghvac.com/rectangular-duct-sizing-smacna-guide/ . The 4th edition (ANSI/SMACNA 006-2020) re-rated rectangular/round/oval/flex for ±10 in. w.g., moved schedules to **minimum** (not nominal) thickness, added TDF/TDC ratings for the first time, and updated hanger requirements and flexible-duct hanger spacing. [C] https://webstore.ansi.org/standards/ansi/ansismacna0062020 ; https://www.smacna.org/technical-standards . Full-text public mirror of the 1995 (2nd) edition: https://law.resource.org/pub/us/cfr/ibr/005/smacna.duct.1995.html (blocked here; use it to verify the [M] cells).

**Rectangular duct gauge — 1 in. w.g. shop standard (Hamlin Companies, derived from SMACNA, uses TDC joints + tie rods).** [V] https://www.hamlincos.com/wp-content/uploads/2016/03/Rectangular-Standards-1.pdf

| Longest side (in.) | Gauge | Joint / reinforcement |
|---|---|---|
| 0–12 | 26 | TDC/slip & drive, none |
| 13–26 | 24 | TDC |
| 27–30 | 22 | TDC |
| 31–42 | 22 | TDC + reinforcement |
| 43–54 | 22 | TDC + T-25a |
| 55–60 | 24 | TDC + center tie rods (CTR) + T-25a |

**Rectangular duct gauge — SMACNA "no reinforcement required" column (unreinforced sheet between joints), 1 in. and 2 in. w.g.** [M] — reconstructed from SMACNA 3rd ed. Tables 2-2/2-3; confirm every cell against the standard.

| Longest side (in.) | 1 in. w.g. | 2 in. w.g. |
|---|---|---|
| ≤10 | 26 | 26 |
| 11–12 | 26 | 26 |
| 13–14 | 26 | 24 |
| 15–16 | 24 | 24 |
| 17–18 | 24 | 22 |
| 19–20 | 22 | 22 |
| 21–22 | 22 | 20 |
| 23–24 | 20 | 20 |
| 25–26 | 20 | 18 |
| 27–28 | 18 | 18 |
| 29–30 | 18 | 16 |
| 31–36 | 16 / reinforce | reinforce |
| >36 | reinforced: gauge drops to 26–22 with joint reinforcement at 2.5–5 ft | same |

**Widely used simplified spec schedule** (appears in many project specs, e.g. the MSU 23 31 13 standard family) [M/V]: 26 ga ≤12", 24 ga 13–30", 22 ga 31–54", 20 ga 55–84", 18 ga 85–96", 16 ga >96". Reference spec pattern: https://ipf.msu.edu/sites/default/files/2018-08/CS_TEC_2004_233113_METAL_DUCTS.PDF . Ship this as an **editable default**, not as "SMACNA".

**Round / spiral gauge.** Search-confirmed: 4"–14" round: 28 ga minimum for both spiral and longitudinal seam; spiral seam may stay 26 ga through 16"–24"; longitudinal seam 26 ga only to 18". [V] https://mepacademy.com/round-duct-and-fittings/ . SMACNA 4th ed. Table 3-1 governs G90 spiral duct minimum gauge; flat oval has its own tables. [C] https://sheetguage.info/hvac-ductwork-gauge-guide/ . Typical SMACNA +2 in. w.g. spiral schedule [M]: 3–8" 28 ga; 9–14" 28; 15–26" 26; 27–36" 24; 37–50" 22; 51–60" 20; 61–84" 18. Longitudinal-seam round is one gauge heavier from 9" up; fittings one gauge heavier than spiral duct. Manufacturer dimension sheets: https://www.mcgillairflow.com/pdf/dimperf/SWR_dimensions.pdf ; https://www.easternsheetmetal.com/Portals/6/Documents/SWR040709.pdf .

**Joint spacing / section lengths.** SMACNA hanger and reinforcement spacing options are 4', 5', 8', 10' [V] https://mepacademy.com/sheet-metal-duct-hangers/ . Rectangular TDC/TDF sections are cut from 48"/60" coil so shop sections are nominally 4 ft (48"–59") or 5 ft; spiral duct ships in 10 ft and 20 ft lengths [M]. Engine default: **joint count = ceil(L / 5 ft) for rectangular (user-editable 4 ft), ceil(L / 10 ft) for round ≤ 24" and ceil(L/20 ft) for larger spiral** — flag as editable.

### A2. Duct weight math

**Galvanized sheet, lb/ft² by gauge** [C/V] — confirmed in search results at https://mepacademy.com/toolbox/hvac/galvanized-sheet-metal-weight-chart-by-gauge-lb-ft%C2%B2-kg-m%C2%B2/ , https://www.engineeringtoolbox.com/gauge-sheet-d_915.html , https://pittsburghairsystems.com/wp-content/uploads/2023/05/Gauge-and-Weight-Chart-for-Sheet-Steel.pdf , https://cdn2.hubspot.net/hub/297063/file-472101174-pdf/docs/continental-steel-gauge-and-weight-chart-tabloid.pdf

| Gauge | lb/ft² (galvanized) | Nominal thickness (in.) [M] |
|---|---|---|
| 30 | 0.656 | 0.0157 |
| 28 | 0.781 | 0.0187 |
| 26 | 0.906 | 0.0217 |
| 24 | 1.156 | 0.0276 |
| 22 | 1.406 | 0.0336 |
| 20 | 1.656 | 0.0396 |
| 18 | 2.156 | 0.0516 |
| 16 | 2.656 | 0.0635 |

The values 26 = 0.906, 24 = 1.156, 22 = 1.406, 20 = 1.656, 18 = 2.156 are **verified**.

**Formulas** (vendor calculators, consistent with SMACNA weight tables):
- Rectangular: `lb/LF = 2(W+H)/12 × lb/ft² × (1 + allowance)`; round: `lb/LF = π·D/12 × lb/ft² × (1 + allowance)`. The calcformula tool states "duct weight per foot = surface area per foot × sheet weight per sq ft × **1.15** (SMACNA seam/flange/reinforcement allowance)" and "SMACNA recommends a waste/seam allowance of **15–20%**." [V] https://calcformula.com/duct-weight-calculator/ ; https://closecrew.ai/tools/hvac/duct-weight-calculator ; https://vastcalc.com/calculators/construction/duct-weight . (It could not be confirmed that SMACNA itself publishes an estimating allowance; treat "SMACNA recommends" as the vendor's attribution.)
- Worked example: 12×24 duct: (12+24+12+24)/12 = 6 ft perimeter → 6 ft²/LF. [V] same sources.
- Round vs rectangular: "in galvanized 26 ga, round duct is about 2.7 lb/ft versus 3.1 lb/ft for rectangular, about 15 percent lighter" (equal-area comparison; reported in results for SMACNA TRB 01-21 / MEP Academy) [V] https://www.smacna.org/docs/default-source/resource-documents/trb-01-21-rooftop-ductwork-round-or-rectangular.pdf?sfvrsn=2c49bce8_1
- Waste/scrap: "A factor of **10 percent** is the most commonly applied standard and covers typical fabrication scrap and joint material for rectangular ductwork. Field-fabricated duct, complex fittings, or acoustically lined sections can justify **15 percent or more**." [V] https://hvacestimatingservices.org/ductwork-estimating-services/ ; https://www.steelfloai.com/blog/waste-factors-in-steel-fabrication . The Wendes *Mechanical Estimating Manual* adds **20%** to duct surface area "to cover hangers, cleats, hardware, waste and seams." [V] https://www.academia.edu/16343690/Mechanical_Estimating_Manual ; PDF mirror https://www.iqytechnicalcollege.com/BAE%20690-Mechanical%20Estimating.pdf . Coil-fed lines run 2–3% scrap; punched/laser 15%+ [V] https://www.linkedin.com/pulse/sheet-metal-working-where-159-raw-material-being-wasted-andrea-dallan
- **Fitting weight factor**: fittings are heavier per equivalent LF; example "694 lb straight duct × **1.40** (40% fitting factor, standard office building) = 972 lb." [V] https://thevirtualestimation.com/blog/hvac-estimating-explained-ductwork-equipment-controls-commissioning/ ; https://hvacestimatingservices.org/blog/ductwork-cost-per-square-foot/
- **Pricing basis**: RSMeans: "Rectangular duct is taken off by the linear foot for each size, but its cost is usually estimated by the pound." [V] https://www.rsmeans.com/resources/estimating-best-practices-rsmeans-data . Wendes describes the per-pound method as a blended $/lb over a mix of gauges, straight and fittings, versus the per-piece method. [V] https://www.wendes.com/blog/hvac-ductwork-estimating-by-per-piece-or-per-pound-method/

### A3. Duct hanger spacing and hardware

- **IMC 2021 §603.10**: "Ducts shall be supported with approved hangers at intervals not exceeding **10 feet** (3048 mm) or by other approved duct support systems designed in accordance with the International Building Code. Flexible and other factory-made ducts shall be supported in accordance with the manufacturer's installation instructions." [C] https://codes.iccsafe.org/s/IMC2021P1/chapter-6-duct-systems/IMC2021P1-Ch06-Sec603.10 ; forum quote https://www.thebuildingcodeforum.com/forum/threads/duct-hanging-question.9978/
- **IRC M1601.4.4.1 (residential, cited as "603.10.1" on UpCodes)**: metal straps ≥1 in. wide (some state versions ½ in. × 18 ga strap or 12 ga wire) at intervals not exceeding 10 ft; a state-amended version reported "maximum 64-inch intervals." [C, wording varies by edition/state] https://up.codes/s/metal-duct-minimal-support ; MN rule https://www.revisor.mn.gov/rules/pdf/1346.0603/2015-01-28%2011:30:35+00:00
- **SMACNA**: spacing options 4', 5', 8', 10'; rectangular Table 5-1, round Table 5-2 (4th ed.; 4-1/4-2 in older eds.). "Most rectangular ducts use 8–10 ft spacing… round ducts 10–12 ft." Hangers required within **2 ft of each elbow** and within **4 ft of each intersection**. [V] https://mepacademy.com/sheet-metal-duct-hangers/ ; https://www.plumbingsupplyandmore.com/duct-support-spacing-requirements-imc-smacna-round-rectangular ; https://eracore.com/duct-hanger-spacing/ ; https://sbkjduct.com/insights/hvac-duct-hangers-supports-guide.html . Table 5-2 permits a 12-ft span for 36" 24 ga round. [V] https://industrialmonitordirect.com/blogs/knowledgebase/hvac-duct-support-spacing-extending-span-beyond-smacna-standards . 1" × 22 ga strap rated 260 lb; rod ≥3/8" for duct to 48", 1/2" larger. [V] same sbkj/MEP sources. Tech brief with span tables: https://li-hvac.com/wp-content/uploads/2021/11/2013-01-Ductwork-Support-Spacing1-1.pdf

**Duct hanger spacing table (engine defaults)**

| Duct | Max spacing | Hanger (min) | Basis |
|---|---|---|---|
| Any duct (code floor) | 10 ft | approved hangers | IMC 603.10 [C] |
| Rect., half-perimeter P/2 ≤ 30" | 10 ft | 1"×22 ga strap or 10 ga wire | SMACNA Tbl 5-1 [M] |
| Rect., P/2 31–72" | 10 ft | 1"×22 ga strap or 1/4" rod | [M] |
| Rect., P/2 73–96" | 10 ft (8 ft common) | 1"×20 ga strap or 1/4"–3/8" rod | [M] |
| Rect., P/2 97–120" | 8 ft | 1"×18 ga strap or 3/8" rod | [M] |
| Rect., P/2 121–192" | 8 ft | 1½"×16 ga strap or 3/8"–1/2" rod, trapeze | [M] |
| Round ≤ 18" | 12 ft | 1"×22 ga strap or 12 ga wire | SMACNA Tbl 5-2 [M], 12 ft [V] |
| Round 19–36" | 12 ft | 1"×20 ga strap or 1/4" rod | [M] |
| Round 37–60" | 12 ft (10 ft common) | 1"×18/20 ga strap or 3/8" rod | [M] |
| Round 61–84" | 12 ft | 1"×16 ga strap or 3/8" rod | [M] |
| Flex duct | ≤ 4 ft (spec) / 4–6 ft | 1½" strap/saddle | [V] spec clauses below |

**Hardware per trapeze hanger** (assemblies sold as kits: 13/16" or 1-5/8" strut + two 3/8" all-thread rods + spring nuts + saddle washers): [V] https://www.gonefco.com/buy/product/Trapeze-Assembly-20-Using-20-of-13-16-x-1-5-8-12GA-Strut-24-Lengths-of-3-8-Threaded-Rod/747294 ; https://www.eaton.com/ca/en-gb/catalog/support-systems/4dimension-trapeze-hangers.html ; https://ductmate.com/wp-content/uploads/2019/01/TrapezeDuctHangerSpec.pdf ; https://strutinstallation.com/trapeze-pipe-hanger-guide-design-support-and-installation/ . Engine default BOM per trapeze: 1 strut/angle (W + 4"), 2 rods (L = ceiling-to-BOD + 6"), 2 anchors/inserts or beam clamps, 4 nuts, 4 washers [M — standard practice]. Strap hanger: 2 straps, 2 anchors, 4 sheet-metal screws [M].

### A4. Duct insulation and liner

- **Surface area**: `SF = perimeter(ft) × L`; for wrap, insulation adds 2t to each dimension. Worked: 24×12 with 1.5" wrap → 27×15 → 7 SF/LF; 80 LF → 560 SF; **+10% laps and waste** → 616 SF. [V] https://www.ruh.ai/industrial/construction/glossary/duct-insulation ; https://guptapipeinsulation.com/blog/duct-insulation-calculator-how-to-estimate-materials-and-cost . Fittings: "add **20%** of the straight-run total to cover all fittings, or take off each fitting separately"; "round up to the nearest full roll and add one extra roll per 500 sq ft." [V] https://askhvac.ca/duct-design/duct-surface-area-calculator.html ; https://calcbee.com/calculators/construction/insulation/duct-insulation-calculator/
- **Roll sizes**: 2" × 24" × 15 ft R-6.9 FSK = 30 SF; 4' × 50' R-8 = 200 SF; a 1.5" wrap roll ≈ 40 SF [V] https://superarbor.io/products/1616001-r-6-9-duct-wrap-fsk-faced-fiberglass-insulation-roll-2-x-24-x-15-30-sf ; https://www.ecofoil.com/products/r-8-hvac-duct-wrap-insulation
- **Liner**: taken off by internal SF (perimeter of *inside* duct dimensions × L); JM notes liner weight must be added to duct load. [V] https://www.jm.com/en/blog/2023/october/Dont-forget-to-calculate-duct-liner-weight/
- **ASHRAE 90.1 Table 6.8.2 / IECC 2021 C403.12.1 R-values** [C]: supply & return ducts/plenums in unconditioned space **R-6**; outside the building **R-8** (CZ 0/1–4) and **R-12** (CZ 5–8); within an envelope assembly separated from exterior by R-8 (CZ 1–4)/R-12 (CZ 5–8). https://up.codes/s/duct-insulation-tables ; https://learnmetrics.com/duct-insulation-r-value/ ; https://www.jm.com/en/blog/2018/july/r-12-the-new-duct-insulation-standard/ ; https://up.codes/s/duct-and-plenum-insulation-and-sealing ; https://www.eng-tips.com/threads/iecc-2021-duct-insulation-requirements.507325/
- Specification location: duct insulation is in Division 23 07 13 (HVAC duct insulation); pipe insulation 23 07 19; ducts 23 31 13. [M; MasterFormat numbering, see Dartmouth 23 31 13: https://www.dartmouth.edu/fom/docs/2023_construction_guidelines/23_31_13_ductwork.pdf ]

### A5. Duct labor and fitting inventory

- **Per-pound**: "low pressure galvanized ductwork productivity is at a rate of **44 lb per hour** … 1/44 = **0.023 hr/lb**" fabricated or installed. Methods: hours/piece (most accurate), hours/lb, hours/SF (specialty). [V] https://www.wendes.com/blog/methods-for-calculating-ductwork-labor/ ; https://www.wendes.com/blog/methods-for-calculating-ductwork-labor-and-materials/
- **Per-LF field productivity**: rectangular **20 LF/man-day**, round **40 LF/man-day** (adjusted values in MEP Academy's field labor study); units used: LF/MD, LF/HR, LBS/HR, HRS/PC. [V] https://mepacademy.com/sheet-metal-field-labor-productivity/ ; https://mepacademy.com/sheet-metal-material-and-labor-summary/
- **Fittings**: use the 40% fitting weight factor (A2) with the per-lb rate, or per-piece hours. No public SMACNA labor-unit table was retrievable; the Wendes manual (links above) contains per-piece tables by size band — treat as the source to license. Rule of thumb in spec circles: an elbow ≈ 2–3× the labor of an equal-length straight section [M, unverified].
- **Flex runouts**: IMC limits *flexible air connectors* to **14 ft**; listed flexible air ducts have no code limit. [C] https://www.ncosfm.gov/mechanical/06036-clarification-flexible-air-duct-and-flexible-air-connector/open . Spec clauses: "maximum length 5 feet"; "not less than 4' nor exceed 8' for any runout"; "supported … no greater than four feet." [V] https://lawinsider.com/clause/flexible-duct ; https://www.lawinsider.com/clause/flexible-ductwork ; good practice <6 ft https://www.eng-tips.com/threads/flexible-air-duct-%E2%80%93-maximum-length.413230/ . **Default: 6 ft flex per diffuser + 1 spin-in (or conical tap) + 2 clamps + damper** (editable 5/6/8 ft).
- Fitting inventory to model per vertex: radius elbow (R/W = 1.5 default; 1.0 minimum), mitered elbow with turning vanes (≥ 2 in. w.g. or where specified), concentric/eccentric transition (default slope 15–30°), 45° lateral/wye, conical or straight tap, spin-in with damper, offset (2 elbows), end cap, access door (at each fire/smoke damper and coil), fire damper at rated-wall crossings (count = rated-wall crossings on the run). Fitting dimension conventions per manufacturer sheets: https://www.mcgillairflow.com/pdf/dimperf/SWrect_dimensions.pdf [V].

### A6. Reading duct off 2D plans

- **Size notation**: "a duct dimension of 24 x 12 in the plan view means W = 24 inches and H = 12 inches … width is the dimension seen and the depth is the dimension unseen (refer to elevation details)." [V] https://www.mcgillairflow.com/pdf/dimperf/SWrect_dimensions.pdf . Round: "12ø" / "12"Ø"; flat oval "FO 24x12" (major×minor) [M].
- **Line conventions** [V/M]: double-line for duct ≥ ~12" or on shop drawings, single-line schematic on small runs; supply solid, return dashed/hidden, exhaust dash-dot, per project legend; "UP"/"DN" with diagonal cross-hatch (rise) or plain (drop); "BOD" bottom of duct, "TOD" top; "SA/RA/EA/OA" supply/return/exhaust/outside air. Legends: https://helonic.com/knowledge-base/hvac-plan-symbols ; https://ingener.by/project-delivery-methods/construction-drawings-documentation/legend-symbol-conventions/ ; abbreviations https://www.engineeringtoolbox.com/piping-hvac-abbreviations-d_1694.html .
- Insulation is specified by system in the duct-insulation schedule (spec 23 07 13), not on the plan; the engine should map system tag → wrap/liner thickness from a user table.

---

## B. PIPING

### B1. Pipe hanger spacing and hardware

**MSS SP-58 Table 4 (max horizontal spacing, water-filled basis).** Confirmed cells: steel 2" = 10 ft, 4" = 14 ft, 6" = 17 ft; copper 2" = 8 ft, 4" = 12 ft; "spacing is read from a table, not calculated from load; it exists to limit sag and bending stress." [C via] https://industrialmonitordirect.com/blogs/knowledgebase/pipe-support-design-standards-mss-sp-58-sp-69-sp-89-reference ; https://calcengineer.com/blog/pipe-hanger-load-mss-sp58/ ; 2025 edition https://blog.ansi.org/ansi/ansi-mss-sp-58-2025-pipe-hangers-supports/ ; preview https://webstore.ansi.org/preview-pages/MSS/preview_MSS+SP-58-2009.pdf

| NPS | Steel, water [M] | Steel, vapor [M] | Copper tube, water [M] | Rod dia. [M] |
|---|---|---|---|---|
| ½ | 7 | 8 | 5 | 3/8 |
| ¾ | 7 | 9 | 5 | 3/8 |
| 1 | 7 | 9 | 6 | 3/8 |
| 1¼ | 7 | 9 | 7 | 3/8 |
| 1½ | 9 | 12 | 8 | 3/8 |
| 2 | **10** | 13 | **8** | 3/8 |
| 2½ | 11 | 14 | 9 | 1/2 |
| 3 | 12 | 15 | 10 | 1/2 |
| 3½ | 13 | 16 | 11 | 1/2 |
| 4 | **14** | 17 | **12** | 5/8 |
| 5 | 16 | 19 | 13 | 5/8 |
| 6 | **17** | 21 | 14 | 3/4 |
| 8 | 19 | 24 | 16 | 7/8 |
| 10 | 22 | 26 | 18 | 7/8 |
| 12 | 23 | 30 | 19 | 7/8 |

Bold = confirmed this session. Rod diameters mirror UPC Table 313.6 https://up.codes/s/hanger-rod-sizes [C, cells M].

**IPC 2018/2021 Table 308.5** [C] https://codes.iccsafe.org/s/IPC2018/chapter-3-general-regulations/IPC2018-Ch03-Sec308.5 ; handout https://www.mcpcity.com/DocumentCenter/View/1067/Hanger-Spacing-Handout ; https://facilitymanagement.com/plumbing-pipe-supports/ ; https://www.plumbermag.com/online_exclusives/2022/07/a-guide-to-plumbing-pipe-supports

| Material | Horizontal (ft) | Vertical (ft) |
|---|---|---|
| ABS pipe | 4 | 10 |
| Cast-iron pipe | 5 | 15 |
| Copper/copper-alloy pipe | 12 | 10 |
| Copper tubing ≤ 1¼" | 6 | 10 |
| Copper tubing ≥ 1½" | 10 | 10 |
| CPVC ≤ 1" | 3 | 10 |
| CPVC ≥ 1¼" | 4 | 10 |
| Steel pipe | 12 | 15 |
| PEX ≤ 1" | 2.67 (32 in.) | 10 |
| PE pipe | 2.67 | 10 |
| PVC pipe | 4 | 10 |
| Polypropylene ≤1" / ≥1¼" | 2.67 / 4 | 10 |
| Stainless drainage | 10 | 10 |
| Lead pipe | continuous | 4 |

Plus: mid-story guide required for ≤ 2" vertical. Cells for steel/copper/CPVC/PEX/PVC/CI confirmed in search; others [M].

**IMC 2021 Table 305.4** (mechanical piping) [C] https://codes.iccsafe.org/s/IMC2021P1/chapter-3-general-regulations/IMC2021P1-Ch03-Sec305.4 ; hearing notes https://www.asa.net/Portals/0/Documents/Advocacy/Codes-Standards/ICC%20Mechanical%20Systems.pdf : ABS 4/10; cast iron 5/15; copper pipe 12/10; **copper tubing 8/10** (note: IMC does not split at 1¼"); CPVC ≤1" 3/10, ≥1¼" 4/10; PEX 2.67/10; PVC 4/10; steel 12/15 [M for steel].

**UPC 2021 Table 313.3** [C] https://up.codes/s/suspended-piping ; https://www.contractormag.com/piping/article/55238454/how-pipe-supports-can-help-mitigate-piping-thermal-expansion-and-contraction : copper tube ≤1½" **6 ft**, ≥2" **10 ft**, vertical each floor ≤10 ft; steel ≤¾" **10 ft**, ≥1" **12 ft**, vertical every other floor ≤25 ft; PVC/ABS 4 ft (expansion joint every 30 ft, mid-story guide); CPVC ≤1" 3 ft, ≥1¼" 4 ft; PEX ≤1" 32 in.

**Hanger assembly BOM** (clevis type, per hanger) [M — standard MSS SP-69 practice]: 1 clevis (MSS Type 1), 1 rod (dia. per table, L = structure-to-pipe + 6"), 1 beam clamp or concrete insert/anchor, 2 hex nuts, 1 washer; for insulated pipe add 1 insulation shield (MSS Type 40, 12" long for ≤ 4", 18–24" for larger) or pre-insulated saddle. Field guide: https://anvilfield.com/field-guides/plumbing/pipe-hangers-supports-seismic-bracing/ [V]. Trapeze for multiple parallel pipes: strut + 2 rods + 2 anchors + 4 nuts + clamps per pipe (A3 sources).

### B2. Pipe insulation (ASHRAE 90.1 / IECC)

Table 6.8.3-1 (heating/hot water) and 6.8.3-2 (cooling) give thickness by fluid temperature and NPS; 90.1-2010 raised thicknesses and later editions carried them forward. [C] https://up.codes/s/piping-insulation-tables ; https://up.codes/s/amendment-to-table-6-8-3-1-minimum-piping-insulation-thickness-heating-and-hot-w ; https://insulation.org/io/articles/ashrae-standard-90-1-2010-increases-minimum-pipe-insulation-thicknesses/ ; https://www.armacell.com/sites/default/files/2025/06/20/TB07_EnergyStandardsCodesMechanicalInsulationCommercialBuildings_EN-US.pdf ; addendum aq https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/90_1_2019_aq_20220729.pdf . Confirmed cells: steam >350°F, >1 NPS → **5.0 in.**; chilled 40–60°F <1 NPS → **0.5 in.**, chilled 40–60°F larger sizes → **1.0 in.** [C via] https://buckaroos.com/blog/ashrae-pipe-insulation-requirements ; https://browardinsulation.com/commercial-pipe-insulation/ . IECC 2021 Table C403.12.3 mirrors it.

| Fluid temp (°F) | <1 | 1 to <1½ | 1½ to <4 | 4 to <8 | ≥8 |
|---|---|---|---|---|---|
| >350 (steam) | 4.5 | 5.0 | 5.0 | 5.0 | **5.0** |
| 251–350 | 3.0 | 4.0 | 4.5 | 4.5 | 4.5 |
| 201–250 | 2.5 | 2.5 | 2.5 | 3.0 | 3.0 |
| **141–200 (HW heating)** | 1.5 | 1.5 | 2.0 | 2.0 | 2.0 |
| **105–140 (HW / DHW)** | 1.0 | 1.0 | 1.5 | 1.5 | 1.5 |
| **40–60 (chilled water)** | **0.5** | 0.5 | **1.0** | 1.0 | 1.0 |
| <40 (brine/refrigerant) | 0.5 | 1.0 | 1.0 | 1.0 | 1.5 |

Non-bold cells [M]. Quantification convention: LF by pipe size × thickness; **fitting covers counted per fitting** (PVC fitting covers or mitered sections); jacketing (ASJ standard; PVC/aluminum outdoors) as LF or SF add-on; hanger shields per hanger (B1). [M/V — Armacell TB07 above].

### B3. Pipe labor units

- **MCAA Labor Estimating Manual / WebLEM**: a labor unit is "man-hours to install a unit of material (a foot of pipe), an individual item (fitting or valve), or perform a task (welding a joint)." [C] https://www.weblem.org/SiteContentFile/Get/100 . Example values: joining **3" Type K copper: 0.11 hr press, 0.15 hr silver solder, 0.13 hr grooved** [V] https://www.pmmag.com/articles/94139-use-of-copper-connections-presses-forward . Assumptions doc: https://www.scribd.com/document/984296917/Mcaa-Assumptions-Full ; service guide https://www.mcaa.org/resource/labor-estimating-guide-for-service-version-2-0/ . Other public per-joint data: 3" butt weld std wt **2.0 MH**, XH **2.5 MH** [V] https://www.scribd.com/document/255774580/Estimate-Piping-Labour ; *Estimator's Piping Man-Hour Manual* (Page) https://azaranstore.com/download/articles/396%20Estimator's%20Piping%20Man%20Hour%20Manual%205E.pdf .
- **Per-foot rules**: 1" copper **0.15 hr/LF**; 4" no-hub cast iron **0.35 hr/LF** [V] https://www.theprojectestimate.com/pipe-installation-man-hours/ ; https://pilars.ai/trades/plumbing/cost-estimating . Craftsman: https://craftsman-book.com/plumbing-hvac-manhour-estimates ; https://craftsman-book.com/media/static/previews/2020_NPH_book_preview.pdf (per-LF manhours by material/size, includes hangers and fittings allowance).
- **Approximate MCAA-style joint hours (ship as editable defaults, [M] — order of magnitude, not licensed values):**

| NPS | Threaded steel | Solder copper | Press copper | Grooved | Butt weld |
|---|---|---|---|---|---|
| ½–¾ | 0.30 | 0.20 | 0.10 | — | — |
| 1 | 0.35 | 0.25 | 0.10 | — | — |
| 1½ | 0.45 | 0.35 | 0.12 | 0.35 | 0.90 |
| 2 | 0.55 | 0.45 | 0.13 | 0.40 | 1.10 |
| 3 | 0.85 | 0.65 (0.15 braze, MCAA [V]) | 0.11 (MCAA [V]) | 0.13 (MCAA [V]) / 0.55 | 2.0 (std wt [V]) |
| 4 | 1.10 | 0.85 | 0.20 | 0.65 | 2.6 |
| 6 | — | 1.20 | 0.35 | 0.90 | 3.8 |

- **Method**: joint-count = Σ(fittings × joints/fitting) + one coupling joint per stick (20/21 ft); versus per-foot with fittings as a % of pipe. Software (QuoteSoft, Trimble AutoBid Mechanical/TRA-SER, FastPIPE, McCormick) builds "assemblies": pipe LF + couplings per stick + hangers by spacing + insulation + labor/ft. [V] https://www.constructconnect.com/products/quotesoft ; https://www.contravault.com/blog/10-best-mechanical-estimating-software-in-2026 ; Wendes piping process (takeoff per system/material/joint/diameter; fittings per piece) https://www.wendes.com/blog/basic-process-for-calculating-piping-labor-and-materials ; "hanger sets based on footage and spacing" https://www.buildvisionai.com/construction-estimating/mechanical

### B4. Fittings, size changes, allowances

- Elbows 90/45 LR/SR; tees straight/reducing; reducers concentric/eccentric (eccentric flat-on-top in steam/air-vent lines); unions at equipment; flanges ≥ 2½" (or grooved per spec); caps. A plan shows a size change by a size callout change — insert a reducer at that vertex; a branch = tee (or wye for DWV); risers "UP/DN" with a circle/half-circle. [M]
- Allowance rules: "**add 50 percent of the developed length** to allow for fittings and valves" (this is the classic *pressure-drop* equivalent-length rule, not a quantity rule) [V] https://forum.heatinghelp.com/discussion/90543/pipe-math ; quantity rules: "**2 fittings per 20 feet** of pipe" [V] https://www.buildvisionai.com/construction-estimating/mechanical ; "**0.05 fittings per foot**" from similar installs [V] https://www.eng-tips.com/threads/piping-cost-estimation.474089/ ; fittings ≈ **35–50%** of pipe LF cost on residential rough-in [V] https://pilars.ai/trades/plumbing/cost-estimating . Fitting make-up (center-to-end) allowances https://forum.heatinghelp.com/discussion/91798/formulas-for-measuring-pipe-fittings ; https://rogerwakefield.com/how-to-measure-fitting-takeoff-advanced-plumbing/ .

### B5. Per-run items

- Sleeves/firestopping counted **per penetration** (type, rated assembly, annular space, UL system); sleeves Sch 10 steel ≤16" or EMT ≤6". [V] https://www.smacna.org/docs/default-source/resource-documents/guidelines-through-penetration-firestopping.pdf?sfvrsn=6c6e3fa2_1 ; https://firestop.org/wp-content/uploads/2025/07/Firestop_basics_penetrations_PEN2-.pdf ; takeoff template https://simplysub.com/resources/templates/material-takeoff/plumbing-material-takeoff-template . Engine: penetration count = wall/floor crossings of the polyline (rated vs non-rated from a wall layer).
- Pressure test / flush: no public hours-per-system figure surfaced; Craftsman/MCAA carry testing as a % of piping labor or per-test items. **Default (editable, [M]): 4–8 hr per system + 0.5 hr per 100 LF hydrostatic; flushing/cleaning 2–4 hr per system**. Valves per zone: 2 isolation + 1 balancing (return) + 1 strainer per coil/zone; count from equipment connections, not the run [M].

### B6. Piping drafting conventions

Single-line piping; size callouts 2", 2½", DN50; abbreviations CHWS/CHWR, HWS/HWR, CWS/CWR (condenser), RL/RS/RD (refrigerant liquid/suction/discharge), CD (condensate drain), HPS/MPS/LPS (steam), PC (pumped condensate); CHWS/R shown as solid line with labels/arrows, other services dashed/chained per legend; flow arrows at each segment. [V] https://www.engineeringtoolbox.com/piping-hvac-abbreviations-d_1694.html ; https://cdn.portofportland.com/eng-specs-gdline/2365_piping_symbols.pdf ; https://helonic.com/knowledge-base/hvac-plan-symbols . The "piping material schedule" (service → material/joint/pressure class, e.g. copper Type L solder/press ≤2", steel Sch 40 grooved/welded ≥2½") lives in spec 23 21 13 / 22 11 16; engine needs a user-editable service→material table [M].

---

## C. BAS / CONTROLS LINEAR

### C1. How BAS estimators quantify wiring

- **Per-point cost**: ≈ **$450/point** (excluding programming, conduit existing) [V] https://control.com/forums/threads/cost-of-wiring.9427/ ; installed BAS **$2.50–$7.00/ft²** [V] https://info.midatlanticcontrols.com/blog/how-much-does-a-building-automation-system-cost ; https://fractionalbas.com/guides/bas-cost-breakdown/ ; labor = **50–75%** of installed cost (NREL), hardware 25–50% [V] https://fractionalbas.com/data/building-monitoring-cost-data/ ; **wiring labor 15–25%** of total installed cost of a hardwired BAS [V] https://www.automatedbuildings.com/news/oct08/articles/sinopoli/080930100202sinopoli.htm ; cabling **$150–$500 per device** [V] https://ready.one/building-automation-per-square-foot/ ; 16 AWG TP ≈ **$0.47/ft**, 16 AWG 2-wire 24 VDC ≈ **$0.35/ft** [V] https://industrialmonitordirect.com/blogs/knowledgebase/control-panel-wiring-labor-time-estimation-methods ; VAV integration **4–8 tech-hours** each [V] https://www.rasmech.com/blog/bas-upgrade-guide/ ; process-controls rule of thumb ≈ **5 hr per analog point, 3 hr per discrete point** (excl. tuning) [V] https://www.chemicalprocessing.com/automation/control-systems/article/11312700/control-system-rule-out-a-rule-of-thumb-chemical-processing . Estimating-101 column: https://automatedbuildings.com/news/may08/columns/080421114633calabrese.htm . **No published "feet of cable per point" figure surfaced**; engine default (editable, [M]): **75 ft per hardwired I/O point** home-run to nearest controller, **150 ft per point** for sensors on large AHUs, and trunk cable = polyline length of the daisy chain.
- **MS/TP trunk**: shielded twisted pair 22 AWG, daisy-chain only (no stars), ≤ **4,000 ft** per segment (some OEMs 2,000 ft), ≤ **32 devices** per segment, repeaters beyond. [V] https://elibrary.tranetechnologies.com/public/commercial-hvac/Literature/Installation%20Operation%20and%20Maintenance/BAS-SVX51N-EN_04242024.pdf ; https://www.neptronic.com/controls/PDF/EVC/BACnetModbus/BACnet%20MSTP%20Overview%20Manual-160405.pdf ; https://www.aaon.com/resources/troubleshooting-bacnet-ms/tp-communications ; http://www.cypressenvirosystems.com/wp-content/uploads/MSTP-Networking-and-Wiring.pdf ; cable https://windycitywire.com/products/temperature-control/shielded/plenum
- **Conduit vs plenum cable**: UFGS 23 09 00 / 23 09 23.02 require IP network cabling in conduit; low-voltage in plenum-rated cable in accessible ceilings, conduit in mechanical rooms/exposed/below 8 ft (typical spec language). [C/V] https://www.wbdg.org/dod/ufgs/ufgs-23-09-00 ; https://www.wbdg.org/FFC/DOD/UFGS/UFGS%2023%2009%2023.02.pdf ; https://www.jblmdesignstandards.army.mil/23-09-00-BACnet-DIRECT-DIGITAL-CONTROL-FOR-HVAC-AND-OTHER-BUILDING-CONTROL-SYSTEMS/ . Default conduit share: 25% of cable LF in ¾" EMT (editable) [M].
- **NECA labor units**: **¾" EMT ≈ 5.0 hr/100 LF** (normal); Difficult/Very Difficult columns step ≈ **+25%** each [V] https://www.ecmweb.com/construction/estimating/article/20903843/understanding-labor ; **#12 THHN 4.25 hr/1000 ft**, #1 cable 19 hr/1000 ft [V] https://forums.mikeholt.com/threads/neca-manual-of-labor-units-question.77005/ ; https://forums.mikeholt.com/threads/wire-pull.2578482/post-2889823 ; manual https://www.necanet.org/education/publications/neca-manual-of-labor-units-(mlu) ; chart https://www.field-pm.com/charts/electrical-labor-units . Default for 18/2–22/2 plenum control cable: **8–10 hr/1000 ft** open-ceiling pull (≈ 2× THHN in conduit) [M]. Pneumatic ¼" poly tubing: same per-foot as cable, plus fittings per device [M]; 120 V power to controllers: 1 circuit per panel, #12 in ¾" EMT [M].

### C2. Published BAS rules of thumb

Points-list-driven estimating is the norm ("a controls audit and a scope tied to a real points list — not a rule-of-thumb guess") [V] fractionalbas above. Estimating tools: https://www.moderncontrols.com/wp-content/uploads/2021/05/BAS-Project-Estimator.pdf ; https://www.patabid.com/building-automation-estimating-software ; https://www.mccormicksys.com/industries/automated-building-systems/ ; structured-cable comparison https://www.smartdigitaltech.net/network-cabling-guide .

---

## D. GENERAL

### D1. Waste and rounding
- Pipe waste: copper **5–10%**, cast iron **5–7%**, PVC/CPVC **3–5%**, PEX **5–10%**, hangers/small items **10–15%** [V] https://www.simplywise.com/blog/how-to-estimate-plumbing-job/ ; generic 10% https://calcformula.com/pipe-bedding-calculator/ ; round to supplier units/stock lengths https://optimarprecon.com/what-is-quantity-takeoff-in-construction/ . Duct 10% (15%+ lined/field) (A2). Sticks: 21 ft steel, 20 ft copper hard/PVC; couplings = ceil(L/stick) − 1 (or per stick, RSMeans-style) [M]. Hangers: ceil(L/spacing) + 1, min 2 per run; add 1 at each elbow/tee within 2 ft (duct) [V/M]. Insulation rounded to carton/roll; +1 roll per 500 SF (A4).

### D2. 2D vs 3D accuracy
No survey with a specific under-measurement percentage was found. BIM-based QTO is "faster and more reliable" than 2D; error sources are omissions and misinterpretation. [V] https://www.sciencedirect.com/science/article/abs/pii/S0926580518311944 ; https://www.sciencedirect.com/science/article/abs/pii/S0926580523004156 ; https://techture.global/blog/bim-cost-estimation-guide . Engine default (editable, [M]): add vertical length explicitly at every UP/DN symbol (floor-to-floor or BOD-to-equipment), and apply **+5–10%** "offsets/rise-drop" allowance to horizontal LF where elevations aren't drawn; do not apply if a 3D model supplied the length.

### D3. RSMeans assembly composition
2026 Mechanical Costs: >18,000 line items, 1,200 assemblies; pipe unit lines include **couplings and hangers at 10 ft O.C.** with published deducts to remove them (buried pipe/trapeze), duct priced per lb by gauge/pressure class, separate lines for wrap/liner insulation, fittings per each, hangers per each. [V] https://www.rsmeans.com/2026-mechanical-costs-book ; https://www.rsmeans.com/resources/estimating-best-practices-rsmeans-data ; TOC https://www.rsmeans.com/media/wysiwyg/product_pdf/2025-Mechanical-TOCs.pdf

---

## Defensible defaults (ship these; all editable)

**Duct run** (per segment: W,H or D, L, pressure class, system):
1. gauge = lookup(pressure_class, max(W,H)) — default table A1 "simplified spec" with 4th-ed override; round via A1 spiral table.
2. lb/LF = (2(W+H)/12 or πD/12) × lb_ft²[gauge] × 1.15 (seams/joints) [calcformula]; fittings weight = per-piece perimeter × 1.4 fitting factor [thevirtualestimation]; scrap +10% [hvacestimatingservices].
3. hangers = ceil(L / S) + 1, S = 10 ft rect (8 ft if P/2 > 96"), 12 ft round, 4 ft flex [IMC 603.10, SMACNA 5-1/5-2 per MEP Academy]; BOM per trapeze 1 strut, 2 rods, 2 anchors, 4 nuts, 4 washers.
4. joints = ceil(L / 5 ft) rect, ceil(L / 10 ft) round; joint type TDF ≤ 2 in. w.g., slip & drive ≤ 24" 1 in. w.g.
5. insulation SF = (2(W+H+4t)/12 or π(D+2t)/12) × L × 1.10 laps [ruh.ai]; fittings +20% [askhvac]; R-value by location per 90.1 6.8.2 / IECC C403.12.1 (R-6 / R-8 / R-12).
6. labor = lb × 0.023 hr/lb (44 lb/hr) [Wendes] or LF/20 per man-day rect, LF/40 round [MEP Academy]; fitting labor via weight factor.
7. per vertex: elbow (radius R/W 1.5; mitered w/ vanes ≥ 2" w.g.), transition (length = 4 × Δdimension, 15–30°), tee/tap, offset = 2 elbows; per diffuser: 6 ft flex + spin-in + 2 clamps [lawinsider/eng-tips]; fire damper per rated crossing.

**Pipe run** (per segment: NPS, material, service, L):
1. hangers = ceil(L / S[material, NPS]) + 1 with S from MSS SP-58 Table 4 (steel/copper) or IPC 308.5 / IMC 305.4 / UPC 313.3 (plastics); rod dia. per UPC 313.6; add shield per hanger if insulated.
2. couplings = ceil(L / 21 ft) − 1 (steel) or ceil(L/20) − 1 (copper/PVC); waste = 5% copper/steel, 4% PVC, 10% hangers [simplywise].
3. insulation LF by NPS with thickness from 90.1 Table 6.8.3 (HW 141–200 °F: 1.5"/1.5"/2"/2"/2"; CHW 40–60 °F: 0.5"/0.5"/1"/1"/1"); fitting covers per fitting; jacket per LF outdoors.
4. labor = Σ joints × hr/joint (MCAA-style, table B3) + hangers × 0.25–0.5 hr [M] + insulation × 0.05–0.1 hr/LF [M]; or per-LF fallback 0.15 hr/LF at 1" copper [theprojectestimate].
5. per vertex: 90/45 elbow (2 joints), tee (3), reducer at size change (2), union at equipment, flange pair ≥ 2½"; un-drawn fittings allowance 2 per 20 ft (≈0.1/ft) if plan is schematic [buildvision]; offsets +5–10%.
6. per run: sleeves/firestop = wall/floor crossings; hydro test 4–8 hr/system + 0.5 hr/100 LF; flush 2–4 hr/system [M]; valves per zone from equipment list.

**BAS run**: cable LF = polyline length (trunk) or 75 ft/point home-run [M]; conduit share 25% in ¾" EMT at 5.0 hr/100 ft [ECM/NECA]; cable pull 4.25 hr/1000 ft in conduit [NECA via Mike Holt], ~8–10 hr/1000 ft open plenum [M]; MS/TP segments ≤ 4,000 ft / 32 devices [Trane/Neptronic]; per point 3–5 hr (process rule) or $450/point install [control.com] as sanity check.

**Must be user-editable (vary by spec/region):** gauge schedule and pressure class per system; joint type and section length; hanger spacing (code adopted: IMC vs IPC vs UPC; MSS vs code), rod size, trapeze vs clevis BOM; insulation R/thickness by service and climate zone, lap and fitting %, roll size; flex runout length; fitting factor (40%), scrap (10–20%), lb/hr (44) and LF/man-day; pipe stick length (20/21 ft), waste %, joint hours (MCAA licensed), hydro-test hours, sleeve/firestop unit; BAS ft/point, conduit share, cable labor units; 2D vertical/offset allowance; RSMeans-style hangers-per-10-ft option.

**Items not verified online in this session that must be checked against the source document before release:** every [M] cell in the SMACNA rectangular unreinforced table, SMACNA Tables 5-1/5-2 strap/rod columns, full MSS SP-58 Table 4 and rod-diameter rows other than the bolded cells, the non-bold cells of ASHRAE 90.1 Table 6.8.3, the MCAA-style joint-hour grid (order-of-magnitude only), and all per-run hour defaults (hydro test, flush, BAS ft/point).
