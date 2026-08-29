// A real, hand-authored HVAC/BAS component taxonomy (maturity plan Phase 2)
// — names, real tag-prefix conventions, and which schedule-table kind/columns
// each component typically rides under. NOT scraped from any dataset or
// symbol library: every entry here is either (a) directly observed on this
// project's own real corpus (see docs/SHEET-GRAPH-EVAL.md and the external
// corpus's README for provenance — Bessemer's apartment-building set,
// Miller Stauffer/Musgrove's D-1 Testing Laboratory set, SmithGroup's Eglin
// AFB set), or (b) cross-checked against a published secondary HVAC
// abbreviations reference (Helonic's mechanical-abbreviations guide — a free
// reference chart, not ASHRAE 134 itself, which is a paid standard this
// project does not redistribute). Anywhere the two disagree, BOTH are kept,
// named as real observed variants — see this project's own prior research:
// there is no single national HVAC symbol/tag standard (ASHRAE 134 and
// SMACNA both publish recommendations; most firms keep a project-specific
// legend). A model or a matcher trained to expect ONE convention misfires on
// the next firm's drawings; an agent reasoning from this taxonomy should
// treat every prefix here as a HYPOTHESIS to corroborate against the
// sheet's own schedule/tag evidence (sheetgraph.ts's rowKeyOf, resolve_tag,
// sweep_schedule_row), never asserted from the tag text alone.
//
// This module is pure REFERENCE DATA — it does not itself classify, extract,
// or match anything. Nothing here changes sheetgraph.ts's extraction
// behavior; it exists to be read (by a human, by an agent via a tool
// description, or by a future reference-fingerprint matcher) alongside what
// sheetgraph.ts and symbolsweep.ts already do.

/** A component family this taxonomy documents. */
export type HvacCategory = "valve" | "actuator" | "damper" | "air_terminal" | "air_device" | "major_equipment" | "sensor" | "control_component";

export interface HvacComponent {
  category: HvacCategory;
  /** Canonical, human name. */
  name: string;
  /** Real tag-prefix(es) observed or published — e.g. "V-", "CV-". More than
   * one entry means more than one real convention is known; none is "the"
   * standard. */
  tagPrefixes: string[];
  /** Which schedule-table kind (sheetgraph.ts's TableKind) this component's
   * own schedule typically extracts under, once recognized — "equipment"
   * for anything with a real electrical/mechanical rating column,
   * undefined where this project has not yet seen or built recognition for
   * a dedicated schedule of this exact family. */
  scheduleKind?: "equipment" | "finish";
  /** A short note: what distinguishes this from its neighbors, and/or where
   * it was actually observed (real corpus) vs. only cross-checked against a
   * published reference. */
  note: string;
}

// ── valves ───────────────────────────────────────────────────────────────
// Real control-symbol legend observed on the Eglin AFB set (SmithGroup,
// sheet M8.1, "MECHANICAL CONTROLS - LEGEND") draws these as distinct
// glyphs with real labels — not invented here, read directly off that
// sheet. Tag-prefix conventions below are cross-corpus: "CV-"/"BCV-" are
// real, observed verbatim on the Miller Stauffer/Musgrove D-1 Lab set's own
// "CONTROL VALVE SCHEDULE (HOT WATER REHEAT COILS)" and "BYPASS CONTROL
// VALVE SCHEDULE" (CV-1..9, BCV-1); "V-"/"BV-" are the commonly-published
// generic convention this project's own prior research already cited, not
// independently observed on this specific corpus.
export const VALVES: HvacComponent[] = [
  { category: "valve", name: "Gate valve", tagPrefixes: ["V-", "GV-"], note: "Commonly published generic convention; not the specific type either real corpus set in this project's evidence base happened to schedule. Has a real reference-shape-seeded fingerprint (hvacRefShapes.ts's GATE_VALVE, matchAgainstLibrary) — the bowtie-body-plus-straight-stem convention, measured against a real precision case against Ball Valve below." },
  { category: "valve", name: "Globe valve", tagPrefixes: ["V-", "GLV-"], note: "As above — published convention, not yet independently corroborated on this project's own corpus." },
  { category: "valve", name: "Ball valve", tagPrefixes: ["V-", "BV-"], note: "Real symbol observed: Eglin AFB legend draws a distinct 'SEGMENTED BALL VALVE' (electric- and pneumatic-actuated variants). Has a real reference-shape-seeded fingerprint (hvacRefShapes.ts's BALL_VALVE) — a real bug caught building it: an early version's lever-handle length was too close to the gate valve's stem length, and scored a false match at this shape's real-world print scale until fixed (see hvacRefShapes.ts's own comment and hvacRefShapes.test.ts)." },
  { category: "valve", name: "Butterfly valve", tagPrefixes: ["V-", "BFV-"], note: "Real symbol observed: Eglin AFB legend draws a distinct 'BUTTERFLY VALVE' (electric- and pneumatic-actuated variants), visually similar to the ball valve glyph but a different body shape — a real precision case (see the maturity plan's Phase 1 valve-precision fixture, built on this exact distinction)." },
  { category: "valve", name: "Check valve", tagPrefixes: ["V-", "CKV-"], note: "Commonly published convention; a directional flow-check symbol, not independently observed on this project's own corpus yet." },
  // Split from a single generic "Control valve (2-way or 3-way, electric or
  // pneumatic)" entry (accuracy-hardening plan Phase 1, ledger item 11) —
  // the port-count granularity gap Phase 3's own vision eval surfaced (a
  // model naming the generic family scored as "correct" against a
  // specific-port-count key). All 5 real sub-variants below are the exact
  // distinct glyphs the Eglin AFB legend draws (federal-attachment4-
  // mechanical.pdf#17, the SmithGroup "MECHANICAL CONTROLS - LEGEND" sheet
  // M8.1) — D-1 Lab's own "CONTROL VALVE SCHEDULE (HOT WATER REHEAT
  // COILS)" (CV-1..CV-9) is the real corpus evidence for the family as a
  // whole; the tag prefix is shared, since the schedule itself doesn't
  // distinguish port count in its own row key.
  { category: "valve", name: "2-way electric control valve", tagPrefixes: ["CV-"], scheduleKind: "equipment", note: "REAL, observed verbatim on the Eglin AFB legend. Has a real reference-shape-seeded fingerprint (hvacRefShapes.ts's CONTROL_VALVE_2WAY_ELECTRIC, measured directly off the real legend's own vector geometry) — a real, measured strict-superset precision case against the 3-way variant below (see hvacRefShapes.test.ts, #HVAC-5)." },
  { category: "valve", name: "3-way electric control valve", tagPrefixes: ["CV-"], scheduleKind: "equipment", note: "REAL, observed verbatim on the Eglin AFB legend — the IDENTICAL 2-way body above plus one real, measured extra leg (a third port), not merely a different caption on the same shape. Has a real reference-shape-seeded fingerprint (hvacRefShapes.ts's CONTROL_VALVE_3WAY_ELECTRIC)." },
  { category: "valve", name: "2-way pneumatic control valve", tagPrefixes: ["CV-"], scheduleKind: "equipment", note: "REAL, observed verbatim on the Eglin AFB legend — the same 2-way valve body, a pneumatic (dome/diaphragm) actuator in place of the electric 'M' box. No reference shape digitized yet." },
  { category: "valve", name: "3-way pneumatic control valve", tagPrefixes: ["CV-"], scheduleKind: "equipment", note: "REAL, observed verbatim on the Eglin AFB legend. No reference shape digitized yet." },
  { category: "valve", name: "Pressure independent characterized control valve", tagPrefixes: ["CV-", "PICV-"], scheduleKind: "equipment", note: "REAL, observed verbatim on the Eglin AFB legend — a visually distinct body from the 2-way/3-way family above (a flow-characterizing cartridge symbol, not the plain bowtie). No reference shape digitized yet." },
  { category: "valve", name: "Bypass control valve", tagPrefixes: ["BCV-"], scheduleKind: "equipment", note: "REAL, observed verbatim: D-1 Lab's own 'BYPASS CONTROL VALVE SCHEDULE', BCV-1." },
  { category: "valve", name: "Balancing valve", tagPrefixes: ["BV-", "CB-"], note: "Commonly published convention (flow-balancing, not shutoff); not independently observed on this project's corpus yet." },
  { category: "valve", name: "Solenoid valve (2-way or 3-way)", tagPrefixes: ["SV-"], note: "Real symbol observed: Eglin AFB legend draws '2-WAY SOLENOID VALVE' and '3-WAY SOLENOID VALVE' as distinct glyphs from the electric/pneumatic control valve family above." },
];

// ── actuators ────────────────────────────────────────────────────────────
export const ACTUATORS: HvacComponent[] = [
  { category: "actuator", name: "Electric actuator", tagPrefixes: [], note: "Real, observed as a modifier on the Eglin AFB legend's own valve/damper labels — e.g. 'BUTTERFLY VALVE ELECTRIC ACTUATOR' — not a separately-tagged device; it rides the valve/damper's own tag." },
  { category: "actuator", name: "Pneumatic actuator", tagPrefixes: [], note: "Same real legend, the pneumatic-actuated sibling of every electric-actuated valve/damper entry — e.g. 'BUTTERFLY VALVE PNEUMATIC ACTUATOR'." },
  { category: "actuator", name: "Spring-return actuator", tagPrefixes: [], note: "Commonly published convention (fail-safe position on power loss) — not a distinct glyph on the one real controls legend this project has examined; typically a schedule/spec note (e.g. 'FAIL ON OPEN'/'FAIL OFF CLOSED', both real BMS point-function terms observed on the Eglin AFB legend's own point-function table) rather than a separate drawn symbol." },
];

// ── dampers ──────────────────────────────────────────────────────────────
// Prefixes cross-checked against Helonic's published mechanical-abbreviations
// reference (FD/FSD/SD/CD/MBD/VD) — a free secondary chart, not this
// project's own invention, and not ASHRAE 134 itself (paid, not
// redistributed here). "BDD" (backdraft damper) is common general practice,
// not independently found in that specific reference or on this project's
// corpus — flagged rather than asserted as confirmed.
export const DAMPERS: HvacComponent[] = [
  { category: "damper", name: "Fire damper", tagPrefixes: ["FD-"], note: "Published convention (Helonic)." },
  { category: "damper", name: "Fire/smoke damper (combination)", tagPrefixes: ["FSD-", "CD-"], note: "Published convention (Helonic) — 'CD' for combination overlaps with 'condensate' elsewhere in this project's own EQUIPMENT_HEADERS-adjacent conventions (e.g. Eglin AFB's pump tags 'CP-' for condensate pump); a tag alone is never enough to disambiguate 'CD' without the schedule kind it rides under." },
  { category: "damper", name: "Smoke damper", tagPrefixes: ["SD-"], note: "Published convention (Helonic)." },
  { category: "damper", name: "Backdraft damper", tagPrefixes: ["BDD-"], note: "Common general practice; not independently confirmed against either the Helonic reference or this project's own corpus — stated as a hypothesis, not a verified convention." },
  { category: "damper", name: "Manual balancing / volume damper", tagPrefixes: ["MBD-", "VD-"], note: "Published convention (Helonic)." },
  { category: "damper", name: "Opposed-blade damper", tagPrefixes: [], note: "Real symbol observed: Eglin AFB legend draws 'OPPOSED BLADE DAMPER' with electric- and pneumatic-actuated variants, and separately 'WITH END SWITCH' variants of each — a real, finer distinction (an end switch reports the damper's actual position back to the BMS) this taxonomy would otherwise miss if it only tracked the blade arrangement." },
  { category: "damper", name: "Parallel-blade damper", tagPrefixes: [], note: "Same real legend, the parallel-blade sibling of the opposed-blade entry above, same electric/pneumatic × end-switch variants." },
];

// ── air terminals (VAV/CAV) ─────────────────────────────────────────────
export const AIR_TERMINALS: HvacComponent[] = [
  {
    category: "air_terminal", name: "VAV box (variable air volume terminal)", tagPrefixes: ["VAV-"], scheduleKind: "equipment",
    note: "REAL, observed verbatim, at real scale: Eglin AFB's own 'VOLUME CONTROL BOX SCHEDULE' schedules VAV-1 through VAV-58 — the schedule's own TITLE never uses the word 'VAV', only the row tags do. A title-based or vocabulary-only match on 'VAV SCHEDULE' would miss this real table entirely; recognizing it needs the real column shape (airside CFM/noise/hydronic-reheat-coil data) plus the TAG-column values themselves, not the title.",
  },
  { category: "air_terminal", name: "CAV box (constant air volume terminal)", tagPrefixes: ["CAV-"], note: "Commonly published convention; not independently observed on this project's own corpus (every real terminal-unit schedule found so far is variable-volume)." },
  { category: "air_terminal", name: "Fan-powered terminal unit", tagPrefixes: ["FPT-", "FPB-"], note: "Commonly published convention; not independently observed on this project's own corpus yet." },
];

// ── major equipment ──────────────────────────────────────────────────────
// Tag prefixes below are the REAL, observed row-key values from this
// project's own corpus wherever a note says so; "CHL"/"BLR" alternates are
// Helonic's own published forms, kept alongside as real observed variance,
// not a correction of one by the other.
export const MAJOR_EQUIPMENT: HvacComponent[] = [
  { category: "major_equipment", name: "Air handling unit (AHU)", tagPrefixes: ["AHU-"], scheduleKind: "equipment", note: "REAL, observed on both the D-1 Lab set ('AIR HANDLING UNIT SCHEDULE', AHU-1, a deeply multi-tier merged header this project's extractor does not yet fully parse — a named, disclosed gap) and the Eglin AFB set (AHU-1, plus separate real 'AIR HANDLING UNIT FAN SCHEDULE' and 'AIR HANDLING UNIT HYDRONIC COIL SCHEDULE' sub-schedules for the SAME unit)." },
  { category: "major_equipment", name: "Rooftop unit (RTU)", tagPrefixes: ["RTU-"], note: "Real vocabulary hit on the Weld County, CO permit set (RTU×20 real text occurrences) — the richest RTU presence in this project's corpus; a dedicated RTU schedule table has not yet been individually rendered/confirmed the way AHU/VAV/Boiler schedules were this session." },
  { category: "major_equipment", name: "Air handler (AC)", tagPrefixes: ["AC-", "EAC-"], note: "REAL, observed on baker-county-eoc-bidset.pdf#41's own NATURAL GAS CALCULATION table — '(E)AC-1'..'(E)AC-9', 9 existing air handlers cited only for gas-demand accounting. The '(E)' EXISTING marker folds into a literal leading 'E' via this file's own rowKeyOf (the same general (E)-marker shape already noted for EWH-1/EBB-6/EF-1 above — real, standard 'AC-' tag family, not an artifact of one set)." },
  { category: "major_equipment", name: "Fan coil unit (FCU)", tagPrefixes: ["FCU-"], scheduleKind: "equipment", note: "REAL, observed: Eglin AFB's own 'HOT WATER FAN COIL UNIT SCHEDULE'." },
  { category: "major_equipment", name: "Unit heater — electric wall / baseboard", tagPrefixes: ["EWH-", "EBB-", "UH-"], scheduleKind: "equipment", note: "REAL, observed verbatim: Bessemer's own 'ELECTRIC WALL HEATER SCHEDULE' (EWH-1) and 'ELECTRIC BASEBOARD HEATER SCHEDULE' (EBB-1..8) — the Phase 0/5 finding this whole equipment vocabulary started from. 'ELECTRIC HEATER SCHEDULE' is D-1 Lab's own real equivalent, differently named." },
  { category: "major_equipment", name: "VRF / heat pump", tagPrefixes: ["HP-", "VRF-"], scheduleKind: "equipment", note: "REAL, observed verbatim: Bessemer's own 'VARIABLE REFRIGERANT PACKAGED HEAT PUMP' table (HP-1) — the real split-co-equal-tier-header table Phase 0's VRF merge fix makes findable." },
  { category: "major_equipment", name: "Ductless split system (high-wall cooling unit)", tagPrefixes: [], scheduleKind: "equipment", note: "REAL, observed: D-1 Lab's own 'DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE' — a real, distinct equipment family this taxonomy did not anticipate before reading the real corpus for it." },
  { category: "major_equipment", name: "Chiller", tagPrefixes: ["CH-", "CHL"], scheduleKind: "equipment", note: "REAL, observed: Eglin AFB's own 'CHILLER SCHEDULE (ELECTRIC AIR-COOLED)', CH-1. 'CHL' is Helonic's own published alternate form, not observed on this project's corpus." },
  { category: "major_equipment", name: "Boiler", tagPrefixes: ["B-", "BLR"], scheduleKind: "equipment", note: "REAL, observed on two independent real sets: D-1 Lab's 'CONDENSING HOT WATER BOILER SCHEDULE' (B-1, B-2) and Eglin AFB's 'HOT WATER CONDENSING BOILER SCHEDULE' (B-1, B-2) — the SAME real tag prefix, independently, at two different firms. 'BLR' is Helonic's own published alternate form." },
  { category: "major_equipment", name: "Pump", tagPrefixes: ["CP-", "CHWP-", "HWP-", "P-"], scheduleKind: "equipment", note: "REAL, observed: Eglin AFB's own 'PUMP SCHEDULE' distinguishes condensate (CP-), chilled-water (CHWP-), and hot-water (HWP-) pumps by prefix, on the SAME table — a real, finer convention than a bare 'P-' would capture." },
  { category: "major_equipment", name: "Fan (exhaust / supply / return / general)", tagPrefixes: ["EF-", "SF-", "RF-", "GEF-", "GCF-", "LEF-"], scheduleKind: "equipment", note: "REAL, observed across all three of this project's non-Bessemer real sets. D-1 Lab adds a real, specific 'LAB EXHAUST FAN SCHEDULE' (LEF-1) distinct from its general 'EXHAUST FAN SCHEDULE' — a real, named sub-family (lab exhaust carries different code/safety requirements than a general exhaust fan) this taxonomy would flatten if it only tracked 'EF-'." },
  { category: "major_equipment", name: "Air separator", tagPrefixes: ["AS-"], scheduleKind: "equipment", note: "REAL, observed: Eglin AFB's own 'AIR SEPARATOR SCHEDULE' (AS-1, AS-2) — a real hydronic-system component (removes entrained air from a closed loop) this taxonomy did not anticipate before reading the real corpus for it." },
  { category: "major_equipment", name: "Humidifier", tagPrefixes: ["HUM-"], scheduleKind: "equipment", note: "REAL, observed: D-1 Lab's own 'HUMIDIFIER SCHEDULE' (HUM-1). A real, disclosed extraction gap: this table's title is currently mis-read as a fragment ('AREA R.H. /', one of its own column headers) rather than 'HUMIDIFIER SCHEDULE' itself — the table's ROWS extract correctly (kind: equipment), only the title-hunt misses; named here rather than silently left unexplained." },
  { category: "major_equipment", name: "Canopy hood (kitchen/lab exhaust hood)", tagPrefixes: [], scheduleKind: "equipment", note: "REAL, observed: D-1 Lab's own 'CANOPY HOOD SCHEDULE' — not yet confirmed extracting under sheetgraph.ts's current equipment vocabulary (a named, deferred gap, not yet individually verified against the real table)." },
];

// ── sensors (BAS field devices) ──────────────────────────────────────────
// All REAL, read directly off the Eglin AFB set's own "MECHANICAL CONTROLS
// - LEGEND" sheet (M8.1) — a genuine BAS points-and-symbols legend, not
// invented or scraped from an external dataset.
export const SENSORS: HvacComponent[] = [
  { category: "sensor", name: "Temperature sensor", tagPrefixes: ["T-", "TS-"], note: "Real symbol + real BMS point-function schedule columns (POINT NAME/TAG) observed on the same legend sheet." },
  { category: "sensor", name: "Space temperature sensor / thermostat", tagPrefixes: [], note: "Real, distinct symbol from the general duct/pipe temperature sensor above." },
  { category: "sensor", name: "Pressure sensor / switch", tagPrefixes: ["PS-"], note: "Real symbol observed." },
  { category: "sensor", name: "Static pressure sensor", tagPrefixes: ["SP-"], note: "Real symbol observed, distinct from the general pressure sensor." },
  { category: "sensor", name: "Differential pressure switch", tagPrefixes: ["DPS-"], note: "Real symbol observed." },
  { category: "sensor", name: "Flow switch / flow meter", tagPrefixes: ["FS-", "FM-"], note: "Real, two distinct symbols observed (switch vs. metering)." },
  { category: "sensor", name: "Relative humidity sensor", tagPrefixes: ["RH-"], note: "Real symbol observed, both duct-mounted and space/wall-mounted variants." },
  { category: "sensor", name: "Smoke detector (duct)", tagPrefixes: ["SD-"], note: "Real symbol observed — note the tag-prefix OVERLAP with 'smoke damper' above; the two are only disambiguated by which schedule/legend section they ride under, never by the bare letters alone." },
  { category: "sensor", name: "Carbon monoxide / carbon dioxide sensor", tagPrefixes: ["CO-", "CO2-"], note: "Real, both duct-mounted and wall-mounted variants observed." },
  { category: "sensor", name: "Level sensor", tagPrefixes: ["LS-"], note: "Real symbol observed." },
  { category: "sensor", name: "Refrigerant leak sensor", tagPrefixes: [], note: "Real symbol observed — 'REFRIGERANT LEAK SENSING POINT' and a separate 'REFRIGERANT LEAK MONITORING SYSTEM' control-electrical-component entry." },
];

/** Row-key ("catalog anchor") conventions this project's own extractor
 * (sheetgraph.ts's CATALOG_ANCHOR_WORDS) recognizes — kept here too so an
 * agent reasoning about "what column names a device's own tag" has the same
 * real, cross-firm evidence sheetgraph.ts's own code comments cite.
 * Deliberately not "ID is standard" — three independent real firms in this
 * project's own corpus use three different words for the exact same
 * concept. */
export const ROW_KEY_CONVENTIONS: Array<{ header: string; observedOn: string }> = [
  { header: "ID", observedOn: "Bessemer (apartment-building set)" },
  { header: "SYMBOL", observedOn: "Miller Stauffer / Musgrove Engineering (D-1 Testing Laboratory set) — used consistently across every one of that firm's own equipment schedules" },
  { header: "TAG", observedOn: "SmithGroup (Eglin AFB set) — used consistently across every one of that firm's own equipment schedules" },
  { header: "MARK", observedOn: "commonly published convention; not independently observed on this project's own corpus yet" },
];

export const HVAC_TAXONOMY = { VALVES, ACTUATORS, DAMPERS, AIR_TERMINALS, MAJOR_EQUIPMENT, SENSORS, ROW_KEY_CONVENTIONS };

/** Every real component name this taxonomy documents, flattened once — the
 * exact vocabulary classify_symbol (agentClassifySymbol/ai.js's
 * classifySymbolPrompt) grounds the vision model in, and what
 * scripts/vision-classify-eval.mjs scores against. One list, shared by the
 * live tool and its own eval harness, so they can never quietly drift onto
 * two different vocabularies. ROW_KEY_CONVENTIONS is deliberately excluded
 * — it names header WORDS (ID/SYMBOL/TAG), not component types. */
export const ALL_COMPONENT_NAMES = [
  ...VALVES, ...ACTUATORS, ...DAMPERS, ...AIR_TERMINALS, ...MAJOR_EQUIPMENT, ...SENSORS,
].map((c) => c.name);
