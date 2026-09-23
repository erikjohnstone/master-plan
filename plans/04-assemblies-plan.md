# Assemblies (typicals, kits) for the HVAC/BAS takeoff — research synthesis and design

**Status:** research and design, 2026-09-23. Nothing here is built yet. The
executable goal is `opentakeoff-corpus/goals/ASSEMBLIES.md`. The full research
reports, with every citation, are in `plans/04-research/`:

| File | Topic |
|---|---|
| `01-takeoff-tool-assemblies.md` | How PlanSwift, STACK, On-Screen Takeoff/Quick Bid, Bluebeam, Accubid, AutoBid, McCormick, FastEST, QuoteSoft, IntelliBid, Kreo, Togal, Beam and Canaveral model assemblies |
| `02-bas-typicals-open-standards.md` | Vendor-neutral BAS typicals: UFGS/UFC, ASHRAE G36 via LBNL's open-source library, 223P/Haystack/Brick; a proposed data model; a 26-typical starter catalogue |
| `03-selection-tool-inputs-hit-desigo.md` | What Siemens HIT, Desigo Select and other vendors' selection tools need as input |
| `04-mechanical-hookup-assemblies.md` | Mechanical contractors' equipment hook-up assemblies |
| `05-bas-estimating-assemblies-and-kits.md` | How BAS and HVAC estimators use assemblies, typicals and kits |
| `06-spec-and-scope-cost-drivers.md` | Specification clauses and responsibility splits that change controls cost |

**Scope, set by the user on 2026-09-23:**
- US only.
- OpenTakeoff is a free, vendor-neutral takeoff tool that Siemens provides to its
  US HVAC and BAS partners. Assemblies must work for every partner.
- Product matching (model and part numbers) belongs to HIT, Desigo Select, or
  whatever tool the partner uses. OpenTakeoff stops at vendor-neutral roles and
  the parameters those tools need.
- Output is CSV and PDF files, plus the existing HIT valve-sizing workbook. No
  connectors.
- No pricing ships with the tool. Partners may add their own prices and labor.

**How the evidence was gathered:** the session's network proxy blocked direct
reads of almost every vendor site. Vendor facts come from search-result
summaries and are labelled that way in the research files. Primary documents
that were reachable were read in full: the federal UFGS/UFC PDFs, LBNL's
Modelica Buildings Library, the 223P/Haystack/Brick repositories, and the
committed HIT template workbook. The items marked **verified** below were
re-checked by the coordinator against those files.

---

## 0. The answer in one paragraph

An assembly is a saved recipe attached to one kind of countable thing. The
estimator counts the thing — "VAV box with hot-water reheat × 42" — and the
recipe expands each one into everything it implies:
- the BAS points;
- the field devices, as roles such as "discharge-air temperature sensor" or
  "2-way modulating hot-water valve, ¾ in, 3.2 GPM";
- the mechanical hook-up parts;
- labor hours and prices, but only if the partner adds them.

Every US takeoff and estimating tool researched works this way, including the
BAS tools (ICS Concerto, Bidtracer). Siemens HIT's own "applications" are the same idea.

What sets OpenTakeoff apart is that **the drawings drive the recipe**. The
equipment schedule already says what each unit is and what it has. So the tool
proposes the right recipe and variant per unit, cites the schedule cells it
used, and flags what it can't tell. In other tools the estimator picks every
recipe by hand.

This also closes the tool's biggest BAS gap. In the repo's cross-set compile
snapshots:
- 74 of 116 projects have controls-relevant equipment (1,912 units);
- only 5 of 116 yield any points-list rows;
- only 12 of 116 produce any control-valve rows.

Assemblies turn equipment the tool already finds into points, devices and
valves for the other ~69 projects.

## 1. Three meanings, one mechanism

| Meaning | Who uses the word | Example | What it becomes here |
|---|---|---|---|
| Estimating assembly | Every takeoff/estimating tool | "Drywall wall: studs at 16 in., top and bottom track, two layers of board, screws" | The mechanism itself: recipe → lines |
| BAS typical, system or application | Controls estimators; Concerto "systems"; Bidtracer "predefined systems/assemblies"; HIT "applications" | "VAV with hot-water reheat: controller, zone sensor, discharge-air sensor, damper actuator, hot-water valve and actuator, about seven points" | A recipe keyed to an equipment family and its attributes |
| Physical kit | Mechanical contractors and manufacturers | Coil hook-up kit: ball valves, strainer, balancing valve, unions, P/T ports, sometimes the control valve | A component line (or sub-assembly) whose presence changes who furnishes the control valve |

When estimators say "assemblies/kits are a big deal", they most likely mean the
first two. The third matters as a scope flag.

## 2. How real tools model assemblies

Details and sources are in `04-research/01`.

**The model every tool shares:**
- **Assembly:** a name; a driver measurement (count, length, area, volume or
  "each"); variables (name, unit, default, prompt); lines; grouping codes.
- **Line:** an item; a unit; a quantity rule (a ratio per driver unit, a fixed
  amount, or a formula); waste; rounding; an optional condition; attributes;
  optional cost and labor.
- **Apply record:** which takeoff items it covers, the variable values used, and
  the breakdown keys (page, floor or area, zone, system, phase, alternate).
- **Output:** one row per line × breakdown, going base quantity → with waste →
  rounded.

**Conventions worth adopting:**
- `[Variable]` references and Excel-like functions, as in STACK and PlanSwift.
- `IF`, which PlanSwift has and Bluebeam users keep asking for.
- **Options inside one assembly** (IntelliBid, AutoBid "specifications")
  instead of copied variants.
- Blank cost and labor columns the user fills in (OST `MatAmount`/`LabAmount`,
  Bluebeam custom columns).
- A flat CSV with stable keys.
- Schedule attributes riding on each line. A real HVAC Bluebeam export carries
  CFM, GPM, HP, V-Ph, kW and similar columns on its count markups.

**Documented pitfalls, and the design response to each:**

| Pitfall | Source | Response |
|---|---|---|
| A misspelled variable silently breaks a formula | STACK | Validate every reference when the library loads and on every edit; reject unknown references |
| Rounding silently changes the waste factor | Quick Bid | Fixed order: quantity → waste → rounding. Export every stage |
| Editing a master item changes every assembly that uses it | Quick Bid | Projects pin a library version. Updates are explicit and shown as a diff |
| Double counting | Several | One driver per instance. A nested sub-assembly counts once. Conservation tests |
| Variant explosion (9,500–500,000 assemblies per library) | Accubid, IntelliBid | Selectors and options, not copies |
| No interchange standard | All | Publish our own CSV/JSON schema |

## 3. BAS typicals

Details, sources and the full catalogue are in `04-research/02` and `05`.

**How controls estimators use typicals.** Job postings describe a BAS estimate
as "a point list, controller selection, labor, and materials estimate." Across
the controls tools:
- A typical is a bill of parts, each part carrying an I/O signature, plus labor
  by category and documents.
- Controllers are chosen from the rolled-up point counts.
- Integration is counted as network points.
- Estimators price in one of three ways: dollars per point, per device, or task
  hours per system.

The tool must therefore emit **points, devices and labor-task hooks**, so that
all three pricing methods work.

**Devices and points stay separate.** UFGS 23 09 00 §3.3 gives valves and
dampers their own schedules, and points reference devices. UFC 3-410-02 §5-5.1
says the same. The repo's BAS doctrine already agrees: "An I/O observation is
not a device."

**Sources the tool can ship:**

| Source | What it gives | License / status |
|---|---|---|
| **UFC 3-410-01 (28 Jul 2025) Table 3-1, "DDC Minimum Points List"** (verified) | Minimum points for hot-water heating, VAV, chilled-water and air-distribution systems | US Government; "approved for public release; distribution unlimited" (verified) |
| UFGS 23 09 93 (2015) | Sequences, and therefore points and devices, by system type (§3.2–3.4) | US Government work |
| UFGS 23 09 00 (2024) | Points Schedule columns; device vs. point schedules; test-sampling and trend rules | US Government work |
| UFGS 23 09 13 (2021) | Device-role taxonomy with parameters: valves, dampers, actuators, sensors | US Government work |
| UFC 3-410-02 | Points Schedule columns; W-X-Y-Z point naming (Appendix E) | US Government |
| LBNL Modelica Buildings Library v14 G36 blocks (reheat-VAV connectors verified) | Exact G36 I/O for each variant: ten VAV terminal types, multizone and single-zone AHU, FCU, chiller plant. No boiler plant | BSD-3-Clause-LBNL |
| ASHRAE 223P ontology file | Classes for device roles | Apache-2.0 (verified), © ASHRAE |
| Project Haystack defs / Xeto `ph.points` and `ashrae.g36` | Point-function names; G36 VAV point-set templates | AFL-3.0 (verified) |
| Brick | Point classes, used as alternate IDs | BSD-3 |

**Reference only; do not copy their text:** ASHRAE G36, Guideline 13 and
Standard 223 (© ASHRAE); owner standards (JBLM, FSU and others); commercial
estimating libraries.

**Gaps the starter library must disclose:**
- UFGS 23 09 93 dates from 2015 and uses LonWorks-era terms.
- It has no chiller, cooling-tower, exhaust-fan, networked-RTU, VRF, ERV or lab
  sequences.
- The Modelica library has no boiler plant.

Those typicals rest on UFC Table 3-1, the UFGS 23 09 00 §3.7 trend lists and
inference. They are marked for partner review.

**Starter catalogue (26 typicals; full contents in `02` §3b):**
- **Terminal units:** VAV cooling-only; VAV hot-water reheat; VAV electric
  reheat; series fan-powered; parallel fan-powered; dual-duct.
- **Air handlers and packaged units:** single-zone VAV AHU / hardwired RTU;
  multizone VAV AHU; constant-volume AHU / unit ventilator; DOAS with energy
  recovery; RTU on network integration; split DX / VRF.
- **Zone units:** FCU 2- and 4-pipe; unit heater / cabinet unit heater.
- **Pumps and fans:** pump constant-speed; pump VFD; fan constant-speed; fan
  VFD/ECM.
- **Plant and other:** boiler + hot-water system; chiller + chilled-water
  system; cooling tower / condenser water; heat exchanger; humidifier; ERV/HRV;
  lab airflow (needs partner validation); building level / meters.

## 4. Mechanical hook-up assemblies

Details and sources are in `04-research/04`. Most of it was read in full from
public guide specs (UFGS; VA master specs) and a real IMEG project manual.

**The finding that shapes the design:** most hook-up variants are chosen by the
**project spec or the owner's standard**, not by the schedule, and the sources
disagree with each other.
- The schedule supplies connection or runout size, GPM, coil pressure drop,
  service, and pump or boiler type.
- The spec decides:
  - the balancing method. UFGS says automatic flow limiters must not be paired
    with 2-way modulating valves; NSCS requires them at terminals; IMEG bans
    them inside kits.
  - whether kits and hoses are allowed. IMEG allows kits only at 1 in. and
    smaller and forbids hoses on coil connections.
  - whether 3-way valves are allowed. Some owners ban them.
  - the P/T-port and thermometer policy.
  - the size at which unions give way to flanges (2 in.).

So hook-ups need a **per-project "hook-up profile"** of editable switches, plus
an editable **responsibility matrix** on every component role.

**Catalogue.** Component roles only, never products. An asterisk (*) marks a
conditional item.

| Assembly | Driver | Component roles (default quantity) | Chosen by |
|---|---|---|---|
| Hydronic coil (2-way / 3-way / PICV) | 1 per coil circuit: a 4-pipe FCU has 2; an AHU with preheat + cooling + heating has 3 | isolation valve 2, union 2, strainer + blowdown 1, control valve 1, balancing valve 1 (0 with a PICV), P/T port 2, air vent 1, drain 1, reducer 0–2, hose 0–2. 3-way adds a bypass balancing valve. AHU coils add thermometer 2 and pressure gauge 2 | Schedule: size, GPM, coil Δp, service, glycol. Controls: function, fail position. Profile: balancing, kits, hoses, 3-way |
| Terminal heating unit (UH, CUH, convector) | 1 per unit | inlet stop valve 1, outlet balancing valve 1, union 2, vent 1, control valve 0–1 | Same as above |
| Water-source heat pump hose kit | 1 per unit | hoses 2, isolation valve 2, flow valve 1, strainer + blowdown 1, 2-position valve 1, flushing bypass | GPM |
| Steam coil | 1 per coil | Supply: isolation valve, strainer, control valve, union, vacuum breaker. Condensate: dirt pocket, isolation valve, strainer, trap, union 2, check valve*, isolation valve, test valve*, 3-valve bypass* | Steam pressure, condensate lb/h, modulating vs 2-position, lift |
| Pump | 1 per pump | isolation valve, strainer or suction diffuser, flex connector 2, check or triple-duty valve, isolation/balancing valve, gauges 2 or P/T 2 | Pump type (inline vs base-mounted), arrangement, connection sizes |
| Boiler, chiller barrel, tower cell, HX side | 1 each | Per `04` §1.5 (relief, flow switch, gauges, fill, gas train, overflow/makeup, vacuum breaker…) | Type, sizes, fuel, steam or water |
| System specialties | 1 per closed loop | air separator, expansion tank, fill station, pot feeder, coupon rack, makeup water meter | The list of systems |
| Air side: VAV, air devices, AHU drain, duct accessories | Per box, device, pan or symbol | Straight inlet run, octopus plenum, access door, flex runout (≤5 ft), manual volume damper, trap seal, flexible connector, access doors, fire / fire-smoke / smoke dampers | Inlet or neck size, fan static pressure, plan symbols, rated penetrations |

**Labor.** Labor units (MCAA, PHCC) are keyed on **item × size × material ×
joining method**. Setting the equipment is a separate line, and difficulty is
a job-level factor. So every component line must export its **size and end
type**, not just a count of assemblies. That lets a partner's own units apply.

**Responsibility (verified default).** VA 23 09 23 (03-01-23) has a
"Responsibility Table" with four columns: **Furnish / Install / Low-Voltage
Wiring / Line Power**. Some rows:

| Item | Furnish | Install | Low-voltage wiring | Line power |
|---|---|---|---|---|
| Automatic valves | 23 09 23 | 23 | 23 09 23 | 23 09 23 |
| Thermowells | 23 09 23 | 23 | – | – |
| Terminal-unit controllers | 23 09 23 | 23 | 23 09 23 | "16" |
| VFDs | 23 | 26 | 23 09 23 | 26 |

Here 23 is the mechanical trade, 23 09 23 the controls contractor, 26 electrical
and "16" an old division number. This is the default matrix. Every cell is
editable per partner and per project.

**Coil kits and the control valve.** Four real patterns decide who furnishes
the control valve:
1. The controls contractor furnishes it and the mechanical contractor installs
   it.
2. The controls contractor ships it to the kit or unit maker for factory
   mounting.
3. The kit includes the PICV body, and the actuator comes from the controls
   contractor.
4. The kit or unit maker supplies both valve and actuator.

This is the classic source of missed or double-counted scope. It is a
responsibility choice, not a different assembly.

## 5. The boundary with HIT, Desigo Select and other selection tools

**The rule:** the takeoff stops at the role plus its parameters. Choosing the
model or part number, the sizing decisions (which Cv, which actuator torque)
and prices all happen downstream.

**Per-role fields and where each comes from.** Source codes: **D** = drawings,
**S** = specification, **E** = an engineering decision made at selection time
(export it blank and flagged), **T** = computed by the takeoff (flag it as
derived). Condensed from `03` §4a.

| Role | Fields |
|---|---|
| Control valve | service/medium (D), glycol % (S), 2-way / 3-way mixing / 3-way diverting (D), body type globe/ball/butterfly/PICV (S/D/E), line size (D), design GPM from the **coil or equipment schedule** (D), coil water pressure drop (D), scheduled Cv and valve Δp (D, or T = (GPM/Cv)²), branch Δp and tolerance (E), close-off (S + pump head D), fail position (D/S), signal and voltage (S/D), pressure class (S), entering water temperature (D) |
| Damper actuator | service (D; flag smoke and fire/smoke), W × H and number of sections (D), area (T), blade type, seals and leakage (D/S), CFM → fpm (D/T), static pressure (D/S), modulating vs 2-position (D), fail position and type (D/S), signal, voltage, end switches (S/D); torque, safety factor, actuators per section and model (E) |
| Sensor | measured variable (D), medium and mounting (D/S), range and accuracy (S/E), signal or element (S/E), accessories such as a thermowell (S/D/E) |
| Current switch / relay | served load, HP, VFD vs starter (D); function (D); trip type, core and output (S/E) |
| Controller I/O | AI/AO/BI/BO counts plus software points (D from a printed points list, or T from device roles); integration points by protocol (D/S); UL 864 flag (S); grouping into cabinets (E) |

**The HIT valve mass-sizing template (verified from the committed workbook).**
- Named range `MassSizing_US_GlobeValves`.
- Column H, labelled "Consumer Δp", has the **defined name `CoilDP`**. Column I
  is `BranchDP`.
- Tolerance is validated against the list 10/20/30/40/50 %.
- Allowed values:
  - System: PCHW, SCHW, PHHW, SHHW, STEAM.
  - Ports: 2-Way Normally closed, 2-Way Normally open, 3-Way Mixing.
  - PN class: ANSI 125 or ANSI 250.
  - Signal: 0...10 Vdc or Floating.
  - Voltage: 24 VAC.

**Three problems in today's `web/src/lib/valveSizeExport.ts`:**
1. "Consumer Δp" (H, `CoilDP`) is filled with the **valve's own** drop,
   (GPM/Cv)². The defined name says it is the coil's (the consumer's) drop. It
   should come from the served coil's water pressure drop (ft × 0.433 → psi),
   and the valve's Δp should go in our own CSV as a separate, flagged field. The
   defined name is hard evidence; exactly how HIT uses it is an inference, so
   confirm with the HIT owners.
2. Tolerance accepts any number, but the template only allows 10–50.
3. `mapPositioningSignal` turns any "modulating" actuator text, or any "x–y V"
   pattern, into "0...10 Vdc". That is an unflagged default; the real signal
   could be 2–10 V or 4–20 mA.

**Desigo Select** is configured by **counts**, not device records:
- room automation: field equipment types counted per building part and floor;
- plant automation: I/O per cabinet;
- Desigo CC licensing: point counts.

No import format is documented, so the right export is a **hand-entry
worksheet** (CSV + PDF) laid out the way Desigo Select asks for input. PXC
controller limits are Siemens product data, so they stay out of the core.

**Other vendors** (Belimo, JCI, Honeywell, Schneider, KMC, Kele, Bidtracer):
- All are hand-entry tools that ask for the same small set of inputs.
- None documents an import. JCI's Selection Navigator CSV import is for its
  Simplex fire-alarm tool.

So one generic CSV per device family — units in the headers, a `*_source`
column beside each engineering field — serves all of them. HIT is the one thin
adapter.

## 6. Who has to be able to use it (US partners)

Siemens' partner tiers (siemens.com, search summary):
- **Advanced Partners:** large system integrators.
- **Solution Partners:** mid-size integrators. Talon is sold through them.
- **Approved Partners:** distributors or sales companies serving mechanical
  and electrical installers.

Mechanical contractors also buy Siemens valves and actuators through
distribution.

| Persona | Scope | Needs from assemblies | Main exports |
|---|---|---|---|
| BAS integrator | Controls (23 09 / Div 25) | Points per unit, even when no points list is printed; devices; controller I/O tallies; labor-task hooks for their own hours; responsibility | points, devices, Desigo Select worksheet, HIT, PDF |
| Mechanical contractor | Div 23 installation | Equipment; coil and pump hook-ups; the valves and dampers they install; who furnishes what | lines (mechanical scope), valves/HIT, PDF |
| Distributor / Approved Partner | Quoting products to installers | Device schedules with selection parameters | valves, dampers, sensors, HIT |

What differs between partners, and how the design absorbs it:

| Variation | Handled by |
|---|---|
| Their own standards (typicals) | An editable, clonable library in their profile; CSV/JSON import and export |
| Their scope | Responsibility on every line; a scope filter |
| Their estimating style | Lines include points, devices and labor hooks, so per-point, per-device and task-hour pricing all work |
| Their downstream tools | Generic CSVs, plus thin adapters (HIT) |
| Their prices and labor | Optional partner-owned fields; never shipped |
| Project specifics (spec choices) | Project variables: wiring method, valve body, signal, fail-safe policy, CO2 control, spare %; plus the **hook-up profile**: balancing method, kits/hoses allowed and maximum kit size, 3-way allowed, P/T and thermometer policy, union→flange size |
| Division of work | A **responsibility matrix** (furnish / install / low-voltage wiring / line power / program / test), defaulting to VA 23 09 23 and editable per partner and per project |

## 7. What the repo already has (audit, 2026-09-23)

**Compile items.** `web/src/lib/corpusTakeoff.mjs`:
- `uniqueFamily` emits one item per schedule row, with fields: `tag`,
  `scheduled_qty` (plus its basis and source), `installed_qty` (null until
  reconcile), unit `EA`, sheet/table/bboxes, `description`, `building` and
  `cells` (raw header → {text, bbox}).
- `HVAC_FAMILY_SPECS` defines 63 families.
- **There are no normalized attributes, only raw header cells**
  (`scheduleAttrs`).

**Structural precedents:**
- `extractEmbeddedCoils` groups coil columns by a shared header prefix and
  requires numeric cells. Its comments already note real reheat-type checkbox
  columns ("EWT HW | EWT ELEC | EWT NONE").
- `normalizeControlValveCells` normalizes valve rows.
- `compileEmbeddedCoilGaps` finds coils with no scheduled valve.

**Quantity semantics.** `schedulePlanReconcile.mjs` separates individually
marked equipment (one tag = one asset) from repeatable type marks such as
diffusers. The installed quantity comes only from reconcile.

**Flooring-era condition materials.**
- `totals.js` `conditionTotals` computes qty = basis ÷ coverage, rounded up,
  with `hours_per_unit`.
- The material library in `materials.js` copies an entry when it is attached
  and tracks per-field overrides (amber tint, push-to-linked, per-field
  revert). That UX pattern is worth reusing.

**Linear assemblies.**
- `linear/types.ts` defines `AssemblyRecord` (`per_ft`, `per_vertex`,
  `per_run`, `allowances`) and `LineItem` (`qty`, `unit`, `basis`, `formula`,
  `provenance`, `disclosed`).
- The library lives in the estimator profile (`.otprofile`, `profile.js`) as
  `assembly_library`, seeded with three defaults.
- MCP cannot read a browser-profile library yet (`mcp/src/session.ts`).

**BAS equipment register** (`basEquipmentRegister.ts`):
- scopes with building, level, system and phase;
- equipment bound to printed schedule members;
- assignments of *printed* point matrices, either per equipment or once per
  system.

**BAS assembly register** (`basAssemblyRegister.ts`, `bas_engine/assemblies.py`):
- Components the drawings declare, in 12 kinds (VFD, onboard controller, TEC,
  controller, sensor, valve, damper actuator, damper, relay, power supply,
  accessory, other).
- Each has a quantity per equipment, a lifecycle and conditions.
- Responsibility claims cover furnish/install/wire/program/test, each assigned
  as factory_furnished, field_installed, named_party, by_others or unknown.
- Automatic interpretation covers only two sentence grammars.

**Other building blocks:**
- `bas_engine`: I/O vectors, spares and abstract hardware capacity; no
  products.
- `estimatorTakeoffDocument.mjs`: scaffold device records (valve body/size/Cv/
  fail position/actuator; damper blade type; point device "UNKNOWN"). Used by
  scripts only.

**Exports differ by surface:**
- The UI uses `agentTakeoff.js`: CSV/XLSX/PDF of the finished lines, grouped by
  family.
- MCP uses `takeoffWorkbookSheets`: a ROLLUP sheet plus one CSV per category.
- Both produce the HIT workbook.

**Doctrine this goal must amend** (the owner opens it explicitly):
- `opentakeoff/docs/BAS_PRODUCTION_GOAL.md:22`: "No costs, prices, quotations,
  monetary totals, labor hours, productivity rates, commercial estimating, or
  supplier/product catalogs."
- `docs/bas-production/ASSEMBLY_REVIEW_CONTRACT.md`: "No default assemblies,
  manufacturer selection, cost…"
- `docs/bas-production/COMPONENT_LIST_RULE_CONTRACT.md`
- `bas_engine/README.md`: "No product catalog…"

**The amendment:**
- Typical-derived points and devices become allowed, clearly labelled as coming
  from an explicit recipe.
- Partner-entered prices and hours become allowed, as opaque partner data.
- Product catalogs, product selection, and prices or rates shipped with the
  tool **stay forbidden**.

## 8. Design

### 8.1 Principles

- **A1 Vendor-neutral core.** Roles and parameters only. Shipped data never
  names a product, model or part number. Vendor specifics live only in export
  adapters.
- **A2 No shipped prices, rates or labor hours.** Partner-entered values are
  optional, opaque, and stay with the partner.
- **A3 Evidence precedence.** From strongest to weakest:
  1. a printed points list, or components the drawing declares;
  2. schedule attributes;
  3. partner project variables;
  4. partner library defaults;
  5. starter defaults.

  A typical never overwrites drawing evidence.
- **A4 Unknown stays unknown.** When an attribute is missing, the option or
  line that depends on it is `unresolved`. It is not treated as false or
  quietly defaulted, unless the partner set a default, in which case the output
  says so.
- **A5 Every expanded line cites two things:** the drawing evidence (cells and
  bboxes) and the rule that produced it (assembly id@version, line id).
- **A6 Library edits never silently change a saved project.** Projects embed the
  assemblies they used and pin their versions.
- **A7 One implementation on the shared path.** UI and MCP call the same code;
  exports are thin wrappers.
- **A8 Structure, not regex, classifies** (GOAL L1). Attribute normalization
  works from header structure and cell validation; regex may only confirm.

### 8.2 Data model (sketch; the goal's WP3 fixes the schema)

```
AssemblyDefinition                 // library record in assembly_library (.otprofile)
  id, version, title
  kind: "equipment" | "project" | (absent = existing linear_run record, unchanged)
  applies_to: { family, selector?: Expr, rank }        // most specific true selector wins
  options:   [{ id, label, auto?: Expr, default?: bool, note }]
  variables: [{ id, unit?, from?: "attr.<path>" | "project.<id>", default?, prompt }]
  lines: [{
    id, kind: "point" | "device" | "component" | "labor" | "note",
    when?: Expr,                                       // option / attribute condition
    qty: Expr,                                         // per instance
    unit, waste_pct?, round?: "none" | "ceil" | { increment },
    role: { vocab: "s223" | "xeto" | "ot", id },       // device role / point function / component
    io?: "AI" | "AO" | "BI" | "BO" | "PULSE" | "NET-IN" | "NET-OUT" | "SOFT",
    device_role_ref?,                                  // a point names the device it belongs to
    params: { <name>: Expr | literal | "<selection>" },   // "<selection>" = decided downstream
                                                       // component lines carry size + end_type
                                                       // so partner labor units (item × size ×
                                                       // material × joint) can apply
    responsibility: { furnish, install, wire_lv, power, program, test } -> party,
                                                       // default = VA 23 09 23 table; the BAS
                                                       // register's five activities + line power
    trade: "controls" | "mechanical" | "electrical" | "fire_alarm" | "factory" | "owner",
    profile_switch?: <hook-up profile key>,            // e.g. line exists only if kits allowed
    labor_task?: { task, driver },                     // a hook only; hours are partner data
    partner?: { part_no?, unit_cost?, hours?, labor_category? },  // opaque; never shipped
    export?: { category?, cost_code? },
    source: { ref, license, derivation }
  }]
  provenance: [{ source, edition, locator, license, derivation, reviewer, date }]
  status: "starter" | "partner_edited" | "partner_imported"

ApplicationRecord                  // per project, saved with the takeoff
  instance: { tag, family, scope: { building, floor, system }, evidence cites }
  assembly: { id, version }, selected_by: "rule" | "user", reason
  options / variables: { value, source: attr | project | partner_default | starter_default | user }
  status: ok | unresolved[...] | overridden | excluded(reason)

ExpandedLine                       // output
  instance tag, rule cite (assembly id@version:line id), kind, role, io,
  qty_base, qty_with_waste, qty_order, unit,
  params (each value with its source), responsibility, trade, status, drawing cites
```

**Expressions.** A small, safe expression language, parsed and never run
through `eval`:
- values: numbers, strings, `attr.x.y`, `var.x`, `opt.x`;
- operators: arithmetic, comparison, and/or/not;
- functions: `if(c,a,b)`, `min`, `max`, `ceil`, `floor`, `round`, `known(x)`.

Every reference is validated when a library loads and on every edit (this
answers the STACK pitfall). `known(x)` lets a line say "only if the attribute
was actually read."

### 8.3 Selection and precedence

For each equipment instance:
1. Normalize its attributes.
2. Find candidate assemblies for its family:
   - A selector that evaluates true makes the assembly a candidate. The highest
     rank wins.
   - A selector that depends on an unknown attribute makes it *possible* only.
3. Decide the outcome:
   - No true selector but some possible ones: `unresolved`, with the candidates
     listed.
   - No candidates at all: listed as "no assembly".
4. Evaluate the options the same way.
5. Apply drawing evidence on top:
   - **Printed points list** for the instance: it becomes that instance's
     points source, and the typical's points become a comparison only.
   - **Components the drawing declares** (BAS assembly register): they replace
     device lines with the same role.

The user can override any choice per instance or per group, with a reason.

### 8.4 Quantity pipeline

**Instance multiplier.** It follows the existing quantity semantics:
- Individually marked equipment counts 1 per unique tag, or the printed QTY when
  a type-marked schedule row says QTY > 1.
- Repeatable type marks use the installed quantity when reconcile trusts it.

The basis is always disclosed.

**Per line:** `qty_base = eval(qty) × multiplier` → waste → rounding.
- Rounding applies at roll-up, since it is an order quantity, the same rule the
  linear goal uses (live vs. order quantity).
- Every stage is exported.
- Roll-ups sum by building, floor, system and family.
- A conservation test holds: the per-instance lines sum exactly to the roll-up.

### 8.5 Attribute normalization (the foundation)

Each family gets a canonical attribute schema with units and enums. For
example:

| Family | Attributes |
|---|---|
| VAV | terminal type; fan type; inlet size; CFM max/min; `heat_type` (hw / electric / none); hot-water coil {gpm, ewt, lwt, wpd_ft, rows, conn_in}; electric heat {kW, stages, volts, phase} |
| AHU | fans (supply / return / relief / exhaust) {cfm, hp, vfd}; economizer; minimum OA; coils {service, medium, gpm, wpd, ewt, lwt, mbh, tons, kw}; humidifier; energy recovery {type}; filters |
| FCU | 2- or 4-pipe; coils; fan {hp, speeds, ecm}; electric heat |
| Pumps | gpm; head; hp; VFD; duty/standby |
| Fans | cfm; hp; VFD/ECM; drive |
| Boilers, chillers, towers | capacity; count; controls interface |
| UH/CUH | medium; gpm or kW |
| HX | primary and secondary medium |
| Humidifier | type; lb/hr |
| ERV | type |
| Location (all) | building; floor; area served (floor comes from schedule columns or from the plan sheet a tag is drawn on) |

How values are extracted and recorded:
- Extraction follows `extractEmbeddedCoils`: group columns by header structure
  (coil blocks, fan blocks, electrical blocks), parse units, and require the
  cell to validate.
- Every value cites its cell and records which rule produced it.
- A wrong value is worse than an unknown one, and the metrics count them
  separately.

### 8.6 Library, profile and versioning

- **Where it lives.** `assembly_library` in the `.otprofile` gains a `kind`
  field. Existing linear records have no `kind` and keep resolving
  byte-identically.
- **The starter library** ships as read-only data, e.g.
  `web/src/lib/assemblies/starter/us-typicals-v1.json`, with a NOTICE file of
  attributions. A partner **clones** it to edit, and the clone uses the
  materials-library link/override pattern: per-field override tracking, push,
  revert, and "update to latest" shown as a diff.
- **Import and export.**
  - JSON, lossless.
  - CSV, one row per line, so partners can edit in Excel.
  - Both run through the same sanitize/validate gate as the profile load.
- **Projects** embed a copy of every assembly version they used, so a project
  opens identically on a machine without that profile.
- **MCP** reads a library from a file path, which closes the "MCP can't see the
  browser library" gap.

### 8.7 Exports (CSV + PDF, plus the HIT adapter)

**CSV files.** Units go in the headers and each engineering field has a
`*_source` column.

| File | Contents |
|---|---|
| `equipment.csv` | Instance → assembly, options and status |
| `lines.csv` | Flat bill of materials: line × instance, or rolled up by breakdown; params; responsibility; trade; provenance; partner columns blank unless filled |
| `points.csv` | Per unit: point, function, I/O, signal, device role, source |
| `valves.csv` | Valve roles with selection fields |
| `damper_actuators.csv` | Damper-actuator roles with selection fields |
| `sensors.csv` | Sensor roles with selection fields |
| `desigo_select_worksheet.csv` | Counts per building / floor / terminal type; I/O per plant; integration points by protocol |

**Other outputs:**
- **PDF:** an assemblies section in the takeoff report — summary,
  per-family tables, the exceptions list, citations.
- **HIT adapter:** also takes coil-derived valves, and gets the three fixes in
  §5.

### 8.8 Shared path and surfaces

- **Shared path.** A new module, `web/src/lib/assemblies/` (pure TypeScript,
  zod schemas), holds normalization, selection, expansion, roll-up and export
  content. SHOULD THIS BE ON THE SHARED PATH? **Yes** — it answers "how many,
  what, where".
- **MCP.** An apply/expand operation, plus library import/export by path.
- **UI.** An Assemblies view in the Takeoff panel, with the exceptions list,
  and an Assemblies library tab beside Materials. Both are surface-specific.

### 8.9 Deliberately out of scope

- Product or model selection.
- Shipped prices or labor.
- Connectors and APIs.
- Reading the spec book. That is the next goal, and it will feed project
  variables.
- Symbol detection.
- Non-US conventions.

## 9. Open questions

**For the user:**
- Confirm the doctrine amendment (§7).
- Should the optional partner price/labor fields be in v1?
- Pick 2–3 real partner jobs. We need the drawings plus what the partner
  actually entered into HIT, Desigo Select or their estimate.
- Name at least one controls integrator and one mechanical contractor to review
  the starter library.

**For the HIT owners** (full list in `03` §5):
- What exactly do Consumer Δp (`CoilDP`), Branch Δp and Tolerance mean?
- Which other mass-sizing templates exist (ball valves, PICV, steam, dampers)?
- Can the vocabularies be extended (4–20 mA, 2–10 V, 2-position, 120 VAC,
  diverting)?
- What are the row limits?
- Is there any project import?

**For the Desigo Select owners:**
- Does it accept any import?
- What is the field-equipment type list?
- What is the output format?
- How are license points counted?

**For partners:**
- Which typicals do they use most?
- What labor categories do they use?
- Which CSV layout do they want?
- Are the hook-up-profile defaults right?
- Is the VA 23 09 23 responsibility matrix the right starting default?
- Which of the four coil-kit control-valve patterns (§4) do they see most
  often?
