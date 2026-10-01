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

# How assemblies work in US HVAC/BAS takeoff and estimating tools (research report A)

**How to read the evidence.** WebFetch and curl were blocked for every vendor help site (PlanSwift/ConstructConnect, STACK, Bluebeam, Trimble, ConEst, McCormick, FastEST, QuoteSoft, Kreo, Togal, Canaveral).
- **"sum"** in the source list means the fact came only from a WebSearch result summary. The search engine paraphrased the page, so wording may be imprecise. Where a summary merged several pages, the page it came from is marked uncertain.
- **"read"** means I read the material directly: official PlanSwift SDK code on GitHub, a Trimble AutoBid PDF on a public S3 bucket, and three third-party GitHub codebases that reverse-engineer how On-Screen Takeoff and Bluebeam store their data.
- **(inferred)** marks my own inferences.
- I used all 45 WebSearch calls. Per your scope note, this covers US products and imperial units only.

---

## 1. PlanSwift (ConstructConnect)

**Terminology and data model**
- Everything is a tree of items: takeoff items (Area, Linear, Segment, Count), Parts, Assemblies and Folders (P6, P9).
- A Part "can be attached to a takeoff to add other properties or values" (P6). An Assembly is "basically a group of parts that can be applied all at once" (P4).
- "Takeoff Assemblies" are a separate concept (P7, title only).
- Every field is a named property that can hold a formula.
  - The official SDK sample reads `Qty` (and its `.Units`), `Price Each`, `Price Total`, `Item #` and `Type`. It tests `IsArea`, `IsLinear`, `IsSegment`, `IsCount` and `IsPart`, and works under the tree path `\Job\Takeoff` (P9, read, 2014).
  - A 2025 third-party script also reads `Cost Each`, `Cost Total`, `Takeoff` (with a Units attribute) and the `Qty` InputUnits attribute. Its child item types are Material, Labor, Part, Other and Subcontract (P10, read).
  - The same script builds an exterior-door Assembly by creating Material and Labor children. On each child it sets `SKU #`, `Cost Each`, `Qty Per Count` and `Description` (P10, read). I could not confirm whether `Qty Per Count` is a built-in property or a custom one.
  - Templates are stored under `\Storages\Local\Templates\…` (P10, read).

**Formula syntax** (P1, P2, P3)
- Properties go in square brackets: `[Length]`, `[Qty]`.
- Parent references:
  - `[..\Qty]` is the parent's Qty.
  - `[..\..\Name]` is the grandparent's Name.
  - `[..]` is the parent's property with the same name.
- `[..\!Units('Takeoff')]` returns the parent's takeoff unit: "SQ FT" for an area, "FT" for a linear.
- `[!sum(Price Total)]` sums a property over all children; it is used on assemblies.
- Conditionals use Pascal-style syntax:
  `If ('[Stud Length]' = '8') then result := '8 foot stud 26PC' Else If ('[Stud Length]' = '10') then result := '10 foot stud 2610' Else Result := 0`
- Numeric comparisons work too:
  `If ('[PropertyName]'<= '8') then result := 8 Else If ('[PropertyName]'>= '10') then result := 10 Else Result := 0`
- The PlanSwift 8 guide lists these functions: Pi, Sqr, Sqrt, Exp, Round, Ceil, Max, Min.

**Variables at apply time** (P4, P5)
- Dragging a part onto a takeoff item opens a window where you change the part's variables.
- The drywall example on a linear takeoff asks for Wall Height, Number of Wall Sides, and Sheet Width and Height.
- The drywall assembly then calculates:
  - top and bottom track in linear feet
  - studs at 16" or 24" spacing
  - 4×8 sheets including waste

**Export** (P8, P8b)
- Reports can go to an Excel workbook, or into a defined region of an existing Excel template.
- Reports can also go to PDF, CSV, XML or HTML.
- "Live Excel Link" updates Excel cells as the takeoff changes.

**Libraries.** I found no documented format for exchanging assemblies. One user wrote a script just to export template Assemblies and Parts to Excel (P10, read). That suggests native assembly export is weak (inferred).

---

## 2. STACK

**Terminology and data model**
- A Takeoff has one measurement type. Items and Assemblies attach to it.
- An item has a Coverage Rate, a Purchase Unit and an Item Formula.
- Waste % and unit cost can be adjusted in the Material & Labor estimate (S1).

**Measurement types and multipliers** (S3, S4)
- There are nine measurement types, including area, linear, arc, pitched, count and volume.
- Most produce a primary and a secondary output. For example, Area gives square feet plus perimeter linear feet.
- Every type also produces "Each", which is the number of measurements times any multipliers.
- A multiplier can be set per measurement or locked for the whole takeoff. It also multiplies the quantities of attached items.

**How child quantities are derived** (S1, S2, S5)
- The Item Formula converts the Takeoff Variable into the item's Purchase Unit. By default it uses the Coverage Rate; you can override it in the Formula Editor (S1).
- Measured variables include `[MeasuredArea]`, `[MeasuredSurfaceArea]`, `[MeasuredHeight]` and `[MeasuredWidth]` (S2).
- Custom Variables such as `[WallHeightInFt]` and `[NumberOfLayers]` belong to one assembly. You enter their values when you add the assembly to a takeoff (S1).
- Excel functions are supported. The documentation's example: `roundup([MeasuredArea],0)` turns 1584.63 into 1585.00 (S2).
- Formulas can convert units, for example tons versus cubic yards (S5).

**Pitfall.** The formula editor throws an error when a variable's spelling doesn't match the Variables list (S1).

**Library.** Users report building a full custom library of items and assemblies in their first week (S6). I did not verify STACK's export details.

---

## 3. On-Screen Takeoff (OST), Quick Bid (QB) and ConstructConnect Takeoff

### OST: the takeoff-only product

**Conditions** (O1, O2, O3)
- There are four condition styles: Linear, Area, Count and Attachment.
- A Linear condition can also give area (length × Height) and volume (length × Height × Thickness).
- An Area condition gives volume through Thickness.
- Attachments are count conditions attached to a parent:
  - to an Area, for things like lights and vents
  - to a Linear, for doors and windows
- Each condition has up to three quantities. Quantities 2 and 3 need a valid Quantity 1.

**Condition fields from a reverse-engineered database schema** (O14, read, commit dated 2026-09-23; not checked against OST itself)
- OST stores bids in `.mdb` (Microsoft Access) files. A third-party viewer's `BidConditions` table has these fields:
  - Name, Type, Width, Height, Spacing, Thickness, Rise, Run, Depth
  - UOM1–3 and Quantity1–3 (codes for which calculation each quantity uses)
  - RoundQuantity and RoundUp
  - Backout, DropRun and DropValue
  - MatAmount, LabAmount, SubAmount
  - DirectQuantity1–3
  - ExcelCell1–3 (links to Excel cells)
  - TypGroupUID, BFperLF, IsTemplate
- Quantity choices by condition type:
  - **Linear:** Length, Segment count, surface area (one side, both sides, top/bottom, ends, "all side/duct"), Volume
  - **Count:** Count, Total Height, Perimeter, surface areas, Volume
  - **Area:** Area, Area ignoring backouts, Area minus attachments, perimeter variants, grid length, tile counts, volume variants
- Units: EA, IN, LF, LY, SQ IN, SF, SY, ROOF, CF, CY.
- Rounding is up to an increment: `ceil(value / increment) * increment`.

**Grouping and export**
- Quantities are organized by Bid Areas, Zones, and Typical Areas/Groups. In the schema, Bid Areas are nested.
- Totals are stored per Page × Zone × Bid Area × Typical Group × Condition, each with Quantity1–3 (O14).
- The Summary tab breaks totals out by Page, Bid Area, Type or Zone. Export is by CSV, printed report, or copy/paste (O4).

**Library.** A "Style" is a condition saved as a template into the Master Styles and Style Sets library (O3b). You can import iSqFt Assemblies to set up Styles quickly (O4).

### Quick Bid: where assemblies and money live

- **Who owns what.** OST owns Conditions, Bid and Typical Areas, Alternates and Change Orders. QB owns Items, Assemblies, Materials, Labor and Markups. The two stay synchronized, and both must be installed on the same machine (O5, O6).
- **Calculations tab.** It converts a Condition Quantity into an Item Quantity (O7, O13). Inputs can be:
  - Condition Quantity 1, 2 or 3
  - Height
  - number of Layers
  - on-center spacing
  - vertical repeats
  - install method

  Waste applies only to the "Standard Formula" and "Quantity x Height" methods. There are also On-Center Exception Factors.
- **Sizing tab.** It turns the item quantity into purchase containers, for example "a box of screws" or "14 studs" (O8).
- **Container rounding.** "Round to Nearest Container" can lower or raise the waste factor so the result is a whole number of containers (O9).
- **Masters.** There are Condition Assemblies, Equipment Assemblies and Other Assemblies. Items can also sit in Mixtures or Chains (O10, O11).
  - Editing a Master Item changes every assembly that uses it.
  - An item in use must be replaced everywhere before it can be deleted.
- **Known pitfall.** A knowledge-base article explains how to account for the first and last studs in a wall condition (O12, title only).

### ConstructConnect Takeoff (cloud)
- It uses "Takeoff Items" and Layers in place of Conditions (O15).
- Takeoff Boost is an AI feature that generates Conditions and takeoff automatically (O17).
- Totals export to Excel, or the project exports to Quick Bid (O16; which page this came from is uncertain).

---

## 4. Bluebeam Revu

**No native assemblies.** The closest equivalent is Tool Chest tool sets plus custom columns in the Markups List.

**Custom columns and formulas** (B1, B2, B3)
- Column types include Number, Formula and Choice.
- A formula column references other columns by name. The `Measurement` column holds the numeric primary measurement without its unit. Order of operations is PEMDAS.
- Supported functions: acos, asin, atan, ceiling, cos, floor, ln, log, round, sin, sqrt, tan.
- `ROUNDUP` is not valid; users are told to use `ceiling`.
- IF is not documented. A community thread asks for it.

**Tool sets and sharing** (B6, B1, B7)
- On a saved tool, "Set Column Defaults" prefills columns such as Cost Code, Assembly, Phase and Unit Price.
- Custom columns can be imported and exported as XML, and saved to the user's Profile.
- A Profile (`.bpx` file) bundles tool sets and columns so a team can share them.

**Where the data lives** (B8, read)
- Markups are stored as PDF annotations:
  - Subject (`Subj`), Label, Author and Layer (`OC`)
  - custom column values in `BSIColumnData`
  - Spaces in `BSISpaces`
  - Depth, slope/pitch, and Rise/Drop values
- So assembly-like data travels inside the PDF itself (inferred).

**A real HVAC example** (B9, read, 2025)
- A mechanical user's Bluebeam CSV has these columns: Subject, Layer, Label, Page Label, Space, Qty, Make, Model, Size, Neck, Face, Mount, Ceiling, Type, Damper, Hand, V-Ph, Duty, SA CFM, EA CFM, CFM, GPM, HP, kW, Material, Phase, Section, System, Unit, Fan, Device, VAV, Trade.
- In other words, equipment-schedule attributes ride along on count markups.

**Export and handoff** (B4, B5, B10)
- The Summary exports to CSV, XML or PDF, filtered and grouped by any column, such as Space or Author (B4, B5).
- Quantity Link feeds live quantities into Excel (B5).
- The CSV is usually cleaned up in Excel before being imported into estimating software (B10; which page said this is uncertain).

---

## 5. Trimble Accubid Classic and Anywhere

- **Database size.** Classic has 40,000+ items and 9,500 assemblies. Anywhere has 42,000 items and 13,000 assemblies (A1, A2).
- **Libraries.** Items are arranged into assemblies and placed in takeoff libraries (A3; attribution uncertain).
- **Quantity basis** (A3)
  - There are six labor columns.
  - An item's "Based On" setting is either Len (length) or Cnt (count).
  - An item inside an assembly can be Based On Len, Cnt or Abs. I infer that means per foot, per each, or a fixed amount per assembly.
- **Breakdowns.**
  - The takeoff screen has five breakdowns: Drawing, Area, Phase, System and Bid Item (A4).
  - A bid can be broken down by floor, system, area, cost code or drawing, and exported to Excel, MS Project or Trimble Construction (A2).
- **LiveCount.** It is a two-way linked takeoff tool with AI-assisted symbol counting (A2).
- **APIs.** Accubid Anywhere got five APIs on 2 April 2025. Four were named in the coverage: Project, Estimate, Final Price, and Extension (bill of materials). All are for getting data out (A5).
- **Pitfall.** Accubid's value depends on disciplined setup. Changing names or organization affects exports (A6).

---

## 6. Trimble AutoBid Mechanical and Estimation MEP

**AutoBid Mechanical** (T1, T2, T3, T4)
- Takeoff is driven by specifications. The estimator enters an item name and a quantity, and the specification supplies the details (T1, T2).
- Swapping specifications compares installation costs (T1, T2).
- Fittings, including branch takeoffs, are generated automatically from the route points you click (T1, T2).
- It has prebuilt assemblies and MCAA/PHCC labor units (T1, T2).
- The installation guide (T3, read, April 2021) describes:
  - substituting materials and specifications for what-if and value-engineering scenarios
  - automatic price updates on 50,000+ items using Trade Service pricing
  - a "data export wizard"
- Trimble offers training on overriding assembly labor (T4).
- Reports are Excel-based, and breakdowns export to accounting or scheduling software (T2).

**Estimation MEP** (T5, T6)
- 8,000+ out-of-the-box assemblies.
- A "My Assemblies" builder for custom count-based assemblies, saved to a personal library.
- Items and assemblies can be edited inside an estimate.

---

## 7. McCormick (now Foundation Software)

- 40,000+ plumbing and mechanical items, and thousands of pre-built assemblies you can customize (M1, M2).
- On-screen digitizer takeoff pushes quantities into the estimate alongside assemblies. Prices can be updated from Excel (M1, M2).
- Electrical: 55,000 items and 25,000 assemblies. When a revision swaps one assembly for another, the labor comes with it (M3).
- Bids are structured as a base bid, add/deduct alternates, and change orders (M3).
- Foundation Software acquired McCormick (M4).
- I found no formula or variable details. The training manual PDF was blocked (M5).

---

## 8. FastEST (FastPIPE / FastDUCT)

- **FastPIPE** (F1, F3)
  - Hundreds of built-in HVAC and plumbing assemblies: gas connections, boilers, chillers, coils, pumps, VRF. They are copied into a job and then modified.
  - Calculates linear feet, diameter-inches, weight, surface area, volume, material cost and labor hours.
  - 150,000-item catalog with MCAA/PHCC labor.
- **FastDUCT** (F2)
  - Calculates pounds, square feet, and shop and field labor hours.
  - FastPIPE and FastDUCT combine into a single Excel quote.

---

## 9. QuoteSoft (now sold by ConstructConnect)

- QuoteSoft Pipe and QuoteSoft Duct are licensed separately.
- Hundreds of assemblies, all modifiable.
- Labor and material takeoff exports to an Excel bid summary.
- Export modules produce CSV, "DATABASE" and XML formats (Q1, Q2, Q3).

---

## 10. ConEst IntelliBid

- 140,000+ items and 500,000+ pre-built, NEC-compliant assemblies (I1).
- **Options live inside one assembly** rather than in copies (I2). A single wiring-device assembly offers:
  - 5 plate types
  - 8 plaster-ring depths
  - 8 EMT fitting options
  - several support options
  - an optional ground wire

  The estimator picks options during input, or presets them before takeoff.
- A "Temporary Assembly" can be made on the fly from selected items (I2).
- "Auto Labor Factoring" adjusts labor for installation height, floors, length, quantities and multiple runs (I3).

---

## 11. AI tools (brief)

- **Kreo** (K1–K3)
  - Three levels: property → item → assembly. A property can store any parameter, such as thickness, classification code or number of layers.
  - A Formula property can be changed when it is added to an item or assembly, and again when applied to a measurement or folder.
  - Formulas support + − × ÷ and brackets only.
- **Togal** (G1, G2)
  - An Assemblies module links studs, drywall and insulation to one quantity, such as wall linear feet.
  - Each component has a unit cost and a waste factor. Prebuilt wall types are included.
  - Exports carry formula columns and cost codes, grouped by material and stud height.
  - Drywall only so far.
- **Beam AI** (BM1, BM2)
  - A service that returns an Excel workbook organized by trade across tabs, with "assemblies grouped where applicable" (for example, sewer line plus fittings, collars and manholes).
  - It also returns a PDF and a view-only link.
- **Canaveral** (C1, C2)
  - An AI-native mechanical estimating tool.
  - "SymbolSight" detects equipment symbols and schedules. Fittings are inserted automatically. It includes SMACNA weight tables.
  - Its parts database "resolves automatically during takeoff" through a "conditions engine", and you can "map to an assembly".
  - Labor adjusts for building height, system complexity and crew conditions.
  - Reports have configurable columns and grouping.

---

## 12. BAS and controls note

- Controls estimating is driven by points. An estimate is built from a points list, controller selection, labor and materials (X2).
- Per-point cost factors are used as rules of thumb (X1).
- Controls tools such as Bidtracer use templates and "saved systems" (X3).
- None of the mainstream takeoff tools above documents a points-list assembly (inferred from absence).

---

## 13. Synthesis

### Minimal common data model (inferred from where the tools overlap)

**Assembly**
- id and name
- driver measure type: count, linear, area, volume, or each
- driver unit
- variables, each with a name, unit, default and prompt
- lines
- default grouping codes

**Line**
- item description, plus optional part, catalog or SKU number
- purchase unit
- quantity rule: either a ratio per driver unit, a fixed amount, or a formula
- waste %
- rounding: none, up to an increment, or to whole containers
- optional condition
- attributes
- optional cost and labor fields, left for partners to fill in

**Apply record**
- which takeoff objects it covers
- the variable values used
- breakdown keys: page, area or floor, zone, system, phase, bid item or alternate, typical group

**Output**
- one row per line × breakdown
- base quantity, then quantity with waste, then rounded quantity, with its unit

**Where each part comes from**

| Concept | Where the tools show it |
|---|---|
| Ratio per driver unit | Accubid Len/Cnt/Abs; PlanSwift Qty Per Count; STACK coverage rate; QB Standard Formula |
| Formula | PlanSwift, STACK, Bluebeam, Kreo |
| Waste | PlanSwift, STACK, QB, Togal |
| Rounding | OST increment, QB container, STACK roundup, Bluebeam ceiling |
| Variables | STACK custom variables; PlanSwift apply dialog; OST Height, Thickness, Spacing; QB Layers and on-center |
| Options within one assembly | IntelliBid; AutoBid specifications |
| Breakdowns | Accubid's five; OST page/area/zone/typical; Bluebeam page label, space, layer |

### Common to every tool
- A parent measurement drives child quantities.
- Waste % and units of measure.
- Prebuilt libraries plus user-built ones.
- Grouping and breakdowns.
- Excel or CSV export.

### What sets tools apart
- **Formula power varies widely:** PlanSwift has Pascal-style IF, STACK has Excel functions, Bluebeam has only basic math with no IF or ROUNDUP, and Kreo has arithmetic only.
- **Rounding to purchase containers** (QB).
- **Generation from specifications and automatic fittings** (AutoBid, Canaveral).
- **Many options inside one assembly** (IntelliBid).
- **Labor factoring** by height, floors and conditions (IntelliBid, Canaveral).
- **Live links to Excel** (PlanSwift Live Excel Link, OST ExcelCell fields, Bluebeam Quantity Link).
- **Two-way links between takeoff and estimating** (OST↔QB, LiveCount↔Accubid).

### How handoff actually works
- I found no shared standard for exchanging assemblies or takeoffs.
- Handoffs use either proprietary pairs (OST→QB, LiveCount→Accubid) or Excel/CSV. Examples: PlanSwift and Bluebeam export to Excel; QuoteSoft exports CSV and XML.
- Accubid's 2025 APIs only move data out.
- A Sage Estimating integration guide for OST exists (O18, Dec 2020, title only), which shows these links are built pair by pair (inferred).

### Documented pitfalls
- **Misspelled variables** break STACK formulas (S1).
- **Rounding changes waste:** QB's container rounding silently adjusts the waste factor (O9).
- **Edits spread everywhere:** changing a master item changes every assembly that uses it (O11).
- **End studs** get miscounted in wall conditions (O12).
- **Bluebeam lacks IF and ROUNDUP** (B2, B3).
- **Setup discipline:** Accubid's exports depend on consistent naming (A6).
- **Double counting** is a recognized problem; one tool's selling point is shading to prevent it (E1). OST has several area variants (ignoring backouts versus minus attachments), so choosing the wrong one can double-count (inferred).
- **User complaint:** a reviewer said PlanSwift's "estimating portion was terrible" (S6).
- **Too many assembly variants:** libraries of 9,500–25,000 assemblies, and 500,000 in IntelliBid, show how variants multiply. IntelliBid's options-inside-one-assembly pattern is one way to limit it (inferred).

### What this means for a takeoff-only, no-price, vendor-neutral tool (inferred)
- **Model assemblies as driver plus lines.** Apply ratio or formula, then waste, then rounding, in that fixed order, and show each stage in the export. Tools order and combine these differently; for example, QB changes waste when it rounds to containers.
- **Include blank cost and labor columns** so partners can add their own, as OST does with MatAmount/LabAmount and Bluebeam does with custom columns.
- **Export a flat CSV** with one row per line × breakdown and stable keys: assembly, line, part number, unit, source tag, page label, area or floor, zone, system, and citation. This matches OST's totals table and Accubid's breakdowns.
- **Use an Excel-like formula subset** (arithmetic, ceiling/floor/round, min/max, IF, named variables). US estimators already know it from STACK, and Bluebeam users keep asking for IF and ROUNDUP.
- **Carry schedule attributes** such as CFM, GPM, HP and voltage/phase on each line, as the HVAC Bluebeam user did.
- **Use options and variables instead of copying assemblies** to avoid the variant explosion.

---

## Sources
Label key: V = vendor; 3P = third party; sum = search summary only; read = read directly; title = page title only.

**PlanSwift**
- P1 [V, sum] https://constructconnect-help.atlassian.net/wiki/spaces/PSUPPORT/pages/48431425/Useful+Formulas+for+PlanSwift
- P2 [V, sum] https://help.constructconnect.com/15-writing-and-using-formulas-189/planswift-15-07-advanced-if-then-else-statement-pascal-expression-2672
- P3 [3P host of PlanSwift 8 guide, sum] https://www.scribd.com/document/172761641/Planswift-Formula-Writing
- P4 [V, sum] https://www.planswift.com/blog/use-parts-assemblies/
- P5 [V, sum] https://www.planswift.com/estimating/drywall/ (the drywall variables came from P4 or P5; which one is uncertain)
- P6 [V, sum] https://help.constructconnect.com/07-a-detailed-look-at-the-planswift-estimating-tab-fine-tuning-your-estimate-180/planswift-07-03-estimating-tab-new-item-takeoff-item-assembly-or-part-1772
- P7 [V, title] https://www.planswift.com/blog/use-takeoff-assemblies/
- P8 [V, sum] https://help.constructconnect.com/11-a-detailed-look-at-the-planswift-reports-tab-184/planswift-11-13-export-a-report-to-excel-template-1872
- P8b [V, sum] https://www.planswift.com/features/
- P9 [V, read, 2014] https://github.com/PlanSwift/sdk-examples-2010
- P10 [3P, read, commit 2025-09-10] https://github.com/elias-bldr/Millwork-Estimating-Suite (src/plugins/planswift/scripts/)

**STACK**
- S1 [V, sum] https://help-preconstruction.stackct.com/docs/working-with-assembly-formulas
- S2 [V, sum] https://help.stackct.com/en/articles/5257235-excel-functions-in-formulas
- S3 [V, sum] https://help-preconstruction.stackct.com/docs/takeoff-measurement-types
- S4 [V, sum] https://support.stackct.com/hc/en-us/articles/47345160306579-Apply-a-Multiplier-to-Measurements
- S5 [V, sum; attribution uncertain] https://www.stackct.com/blog/mastering-stack-takeoff-estimating-expert-tips-for-using-items-and-assemblies-to-streamline-bids/
- S6 [3P, sum] https://www.capterra.com/p/147181/STACK-Takeoff/reviews/

**OST, Quick Bid, ConstructConnect Takeoff**
- O1 [V, sum] https://help.constructconnect.com/05-creating-conditions-and-layers-72/on-screen-takeoff-05-01-what-are-conditions-686
- O2 [V, sum] https://help.constructconnect.com/05-creating-conditions-and-layers-72/on-screen-takeoff-05-07-creating-attachment-conditions-697
- O3 [V, sum] https://help.constructconnect.com/05-creating-conditions-and-layers-72/on-screen-takeoff-05-03-create-a-condition-from-scratch-general-condition-properties-what-are-you-measuring-690
- O3b [V, sum] https://help.constructconnect.com/05-creating-conditions-and-layers-72/on-screen-takeoff-05-11-creating-a-style-from-the-conditions-window-saving-a-condition-as-a-template-for-future-use-or-to-share-701
- O4 [V, sum] https://help.constructconnect.com/16-importing-and-exporting-bids-takeoff-and-reports-83/on-screen-takeoff-16-01-importing-and-exporting-overview-825
- O5 [V, sum] https://help.constructconnect.com/takeoff-and-estimating-frequently-asked-questions-244/best-practices-for-using-on-screen-takeoff-quick-bid-and-digital-production-control-22
- O6 [V, sum] https://help.constructconnect.com/06-creating-and-managing-bids-alternates-and-change-orders-127/quick-bid-06-03-02-synchronizing-information-between-on-screen-takeoff-and-quick-bid-471
- O7 [V, sum] https://help.constructconnect.com/05-items-the-building-blocks-of-quick-bid-estimating-126/quick-bid-05-07-01-the-item-details-calculations-tab-calculation-method-441
- O8 [V, sum] https://help.constructconnect.com/05-items-the-building-blocks-of-quick-bid-estimating-126/quick-bid-05-08-01-the-item-detail-sizing-tab-selecting-a-sizing-method-447
- O9 [V, sum] https://help.constructconnect.com/09-adjusting-materials-and-using-equotes-130/quick-bid-09-04-rounding-quantities-to-whole-container-on-the-materials-tab-520
- O10 [V, title/sum] https://kbase.oncenter.com/article/AA-03883/0/Quick-Bid-04.14-Masters:-What-Are-Assemblies-Condition-Equipment-and-Other-Templates-QB.html
- O11 [V, sum] https://help.constructconnect.com/04-masters-saved-reusable-records-and-lists-125/quick-bid-04-03-02-master-items-list-controls-and-context-menu-415 and https://help.constructconnect.com/04-masters-saved-reusable-records-and-lists-125/quick-bid-04-01-finding-and-replacing-in-use-records-so-you-can-delete-a-master-record-407
- O12 [V, title] https://kbase.oncenter.com/article/AA-04878/0/How-to-account-for-the-first-and-last-studs-when-building-out-a-Wall-Condition-in-Quick-Bid-QB.html
- O13 [V, title] https://kbase.oncenter.com/article/AA-03901/0/Quick-Bid-05.07.05-The-Item-Details-Calculations-Tab:-On-Center-Exception-Factors-QB.html
- O14 [3P, read, commit 2026-09-23; reverse-engineered] https://github.com/Fabianhad/OSTVisualizer-Win (ost_visualizer/infrastructure/mdb/database_creator.py, ost_visualizer/domain/services/uom_service.py)
- O15 [V, sum] https://help.constructconnect.com/06-creating-takeoff-items-and-layers-163/constructconnect-takeoff-06-01-takeoff-items-and-layers-2201
- O16 [V, sum; attribution uncertain] https://help.constructconnect.com/01-introduction-to-constructconnect-takeoff-26/01-04-the-very-basics-of-constructconnect-takeoff-where-to-begin-2307
- O17 [V, sum] https://help.constructconnect.com/getting-started-with-on-screen-takeoff-112/run-your-first-automated-takeoff-with-takeoff-boost-and-get-real-results-in-less-than-a-minute-2764
- O18 [V, title, Dec 2020] https://docs.sage.com/docs/en/customer/estimating/20_1SQL/open/SageEstimatingOSTIntegrationGuide.pdf

**Bluebeam**
- B1 [V, sum; Revu 21 help] https://support.bluebeam.com/online-help/revu21/Content/RevuHelp/Menus/Window/Panels/Markups/Custom-Columns--MT.htm
- B2 [V community, sum] https://community.bluebeam.com/discussion/855/roundup-in-custom-columns/p1
- B3 [V community, title/sum] https://community.bluebeam.com/discussion/4940/if-then-formulas-for-custom-columns
- B4 [V, sum] https://support.bluebeam.com/user-manual/menus/window/markups-list-summary.html
- B5 [3P, sum] https://novedge.com/blogs/design-news/bluebeam-tip-export-revu-markups-list-to-csv-for-excel-and-power-bi
- B6 [3P, sum] https://novedge.com/blogs/design-news/bluebeam-tip-standardize-measurement-templates-in-bluebeam-revu-for-faster-consistent-takeoffs
- B7 [V, sum] https://support.bluebeam.com/revu/how-to/create-shareable-profiles.html
- B8 [3P, read, commit 2026-02-16] https://github.com/psolin/pymkup (pymkup/column_data.py)
- B9 [3P, read, © 2025] https://github.com/Heureux13/NavaTools (lib/constants/bluebeam_map.py)
- B10 [V, sum; attribution uncertain] https://unbound.bluebeam.com/session/quantity-takeoff-workflow/

**Accubid**
- A1 [V, sum] https://www.trimble.com/en/products/trimble-accubid-anywhere
- A2 [V, sum] https://www.trimble.com/en/products/trimble-accubid-classic
- A3 [3P training excerpts, sum; one of these two PDFs] https://www.electricalestimating101.com/wp-content/uploads/2020/09/Volume-2-pages-14-20.pdf and https://electricalestimating101.com/wp-content/uploads/2020/09/Volume-4-pages-46-52.pdf
- A4 [V doc hosted by a third party, sum] https://lorisweb.com/CMGT352/TRIMBLE/Accubid%20Classic%20v12/Classic%20Estimating.pdf
- A5 [V, 2025-04-02] https://news.trimble.com/2025-04-02-Trimble-Adds-New-API-Capabilities-to-Accubid-Anywhere-Estimating-Application
- A6 [3P, sum] https://softwareconnect.com/roundups/best-electrical-estimating-software/

**AutoBid and Estimation MEP**
- T1 [V, sum] https://www.trimble.com/en/products/trimble-autobid-mechanical
- T2 [V brochure hosted by a third party, sum] https://pdf.archiexpo.com/pdf/trimble-mep-france/trimble-autobid-mechanical/148989-280770.html
- T3 [V, read, April 2021] https://s3.amazonaws.com/mepdownloads-na.trimble.com/client-downloads/Autobid/Downloads/AutoBid+2021/ABMC+Installation+Instructions.pdf
- T4 [V, title] https://www.youtube.com/watch?v=cbOnY9gA8do
- T5 [V, sum] https://www.trimble.com/en/products/estimation-mep
- T6 [V, sum] https://www.trimble.com/en/blog/construction/article/estimation-mep-the-estimating-tool-for-small-mep-contractors

**McCormick**
- M1 [V, sum] https://www.mccormicksys.com/
- M2 [3P, sum] https://www.softwareadvice.com/construction/mccormick-mech-profile/
- M3 [V, sum] https://www.mccormicksys.com/blog/the-best-electrical-estimating-software-2026-guide/ and https://www.mccormicksys.com/blog/items-and-assemblies-for-your-jobs/
- M4 [3P, title] https://www.prnewswire.com/news-releases/foundation-software-announces-acquisition-of-mccormick-systems-estimating--digital-takeoff-301285964.html
- M5 [V, title] https://mccormicksys.com/wp-content/uploads/2016/05/WO-Standard-Training-Manual.pdf

**FastEST**
- F1 [V, sum] https://fastest-inc.com/FastPIPE
- F2 [V, sum] https://fastest-inc.com/FastDUCT
- F3 [3P, sum] https://softwareconnect.com/reviews/fastest-estimating-software/

**QuoteSoft**
- Q1 [V, sum] https://quotesoft.com/products/plumbing-and-piping/
- Q2 [V, sum] https://www.constructconnect.com/products/quotesoft
- Q3 [3P, written by competitor McCormick, sum] https://www.mccormicksys.com/blog/quotesoft-review-for-plumbing-mechanical-estimating-pros-cons-alternatives/

**IntelliBid**
- I1 [V, sum] https://conest.com/electrical-takeoff-software/
- I2 [V, sum] https://conest.com/from-the-field-intellibid-assemblies/
- I3 [V, sum] https://conest.com/products/intellibid-electrical-estimating-software/

**AI tools**
- K1 [V, sum] https://help-takeoff.kreo.net/en/articles/6158615-what-is-assemblies-database
- K2 [V, sum] https://help-takeoff.kreo.net/en/articles/6204588-how-to-create-the-formula-property
- K3 [V, sum] https://help-takeoff.kreo.net/en/articles/5488015-rules-for-working-with-formulas-and-functions
- G1 [V, sum] https://help.togal.ai/assemblies-overview
- G2 [V, sum] https://www.togal.ai/blog/drywall-assemblies
- BM1 [V, sum] https://www.ibeam.ai/subcontractors/hvac
- BM2 [V, sum] https://www.ibeam.ai/blog/takeoff-software-features-capabilities
- C1 [V, sum] https://canaveral.ai/hvac-takeoff
- C2 [V, sum] https://canaveral.ai/mechanical-estimating-software

**BAS and controls**
- X1 [3P, sum, 2008] https://automatedbuildings.com/news/may08/columns/080421114633calabrese.htm
- X2 [3P, sum, 2021] https://www.moderncontrols.com/wp-content/uploads/2021/05/BAS-Project-Estimator.pdf
- X3 [V, sum] https://www.bidtracer.com/building-automation-controls-estimating-software.html

**Pitfalls**
- E1 [3P, sum] https://www.g2.com/products/etakeoff/reviews

---

**Local copies for checking the "read" items.** They are in /tmp/claude-0/-home-user-master-plan/ea56aded-ac3c-5d57-8b45-280b541c9fd9/scratchpad/assemblies-A/:
- OSTVisualizer-Win/ (OST schema)
- pymkup/ and NavaTools/ (Bluebeam)
- sdk-examples-2010/ and Millwork-Estimating-Suite/ (PlanSwift)
- abmc_install.pdf and abmc_install.txt (AutoBid)

Nothing in /home/user/master-plan was modified.