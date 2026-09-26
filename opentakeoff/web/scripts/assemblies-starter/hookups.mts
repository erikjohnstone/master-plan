// ASSEMBLIES WP4.2 — the starter hook-up catalogue (research 04 §5), layer
// "hookup": component ROLES with size and end type, never products. The
// hook-up profile's switches and project variables (hookup-profile-v1.json)
// decide the variants the specifications disagree on. The control valve is
// the controls typical's device (installed by the mechanical trade under the
// matrix), so no hook-up furnishes it a second time.
import { component, note, part, src, type Line } from "./common.mts";

const R04 = (loc: string) => src.inferred(`research 04 ${loc}`);
const UF = (section: string, loc: string) => ({ ref: `UFGS ${section} ${loc}`, license: "LicenseRef-US-Government-Work", derivation: "paraphrase" as const });
const VA = (section: string, loc: string) => src.va(section, loc);

/** Profile variables every coil and pump hook-up reads. */
const PROFILE_VARIABLES = [
  { id: "balancing", from: "project.balancing", prompt: "Balancing at coils: 'manual' or 'automatic'" },
  { id: "valve_body", from: "project.coil_valve_body", prompt: "Coil control valve body: '2-way', '3-way' or 'picv'" },
  { id: "flange_min_in", unit: "in", from: "project.flange_min_in", prompt: "Unions below, flanges at and above this pipe size (in.)" },
  { id: "kit_max_in", unit: "in", from: "project.kit_max_in", prompt: "Coil kits at and below this size (in.); 0 for none" },
];

const joint = (size: string) => `if(${size} >= var.flange_min_in, 'flange', 'union')`;
const sized = (size: string) => ({ size_in: size, end_type: "<selection>" });

/** A hydronic coil's hook-up (research 04 §1.1, §5): `size` is the coil's
 * connection or runout, `svc` the service. */
function coilPart(id: string, title: string, svc: "hw" | "chw", size: string, gpm: string, wpd: string) {
  const kit = `var.kit_max_in > 0 and ${size} <= var.kit_max_in`;
  const loose = `not (${kit})`;
  const lines: Line[] = [
    component("isolation-valves", "isolation-valve", { when: loose, qty: "2", label: "Isolation valves, supply and return", params: sized(size), source: UF("23 21 13 (UF-6426)", "§3.1.5: on each side of each piece of equipment") }),
    component("unions", "union", { when: `${loose} and ${size} < var.flange_min_in`, qty: "2", label: "Unions at the coil and the control valve", params: sized(size), source: UF("23 21 13 (UF-2113)", "§3.2.5: unions below 2 in., downstream of valves") }),
    component("flanges", "flange-set", { when: `${size} >= var.flange_min_in`, qty: "2", label: "Flange sets at the coil and the control valve", params: sized(size), source: UF("23 21 13 (UF-2113)", "§3.2.5: flanges at 2 in. and above") }),
    component("strainer", "strainer", { when: loose, profile_switch: "strainer_at_coils", label: "Y-strainer, line size, with blowdown valve, hose end and cap", params: sized(size), source: UF("23 21 13 (UF-6426)", "§2.7.1") }),
    component("balancing-valve", "balancing-valve", { when: `${loose} and var.valve_body != 'picv' and var.balancing = 'manual'`, label: "Calibrated balancing valve (return)", params: { ...sized(size), gpm }, source: UF("23 21 13 (UF-6426)", "§2.6.8") }),
    component("flow-limiter", "flow-limiter", { when: `${loose} and var.valve_body != 'picv' and var.balancing = 'automatic'`, label: "Automatic flow limiter (return)", params: { ...sized(size), gpm }, source: R04("§1.1 rule 1: NSCS 231000 item 16 requires automatic flow control at terminals; UFGS forbids it with 2-way modulating valves") }),
    component("bypass-balancing-valve", "balancing-valve", { when: "var.valve_body = '3-way'", label: "Bypass balancing valve (3-way valve's bypass leg, set to the coil's pressure drop)", params: { ...sized(size), coil_wpd_ft: wpd }, source: R04("§1.1 rule 2: the bypass leg needs a balancing valve set to the coil pressure drop") }),
    component("pt-ports", "pt-port", { when: loose, profile_switch: "pt_ports_at_coils", qty: "2", label: "Pressure/temperature test ports, in and out", params: { size_in: size }, source: UF("23 05 93 (UF-0593)", "§3.2.4.1 b: adjacent to inlet and outlet of every coil") }),
    component("air-vent", "air-vent", { label: "Manual air vent at the coil", params: { size_in: "0.5" }, source: UF("23 21 13 (UF-6426)", "§3.1.6: on all water coils") }),
    component("drain", "drain-valve", { label: "Drain valve at the coil or low point", params: { size_in: "0.75" }, source: UF("23 21 13 (UF-6426)", "§3.1.7: low-point drains") }),
    component("coil-kit", "coil-kit", { when: kit, label: "Coil piping kit: isolation, strainer, union, balancing (or PICV body) and test ports, as one assembly", params: { ...sized(size), gpm, balancing: "var.balancing", valve_body: "var.valve_body" }, source: VA("23 21 13", "§2.8 H.3: combination assemblies accepted") }),
    note("reducers", "Reducers at the control valve: 0-2, decided when the valve is selected (VA 23 21 13 §3.1 F; run valves and strainers at line size).", { source: VA("23 21 13", "§3.1 F") }),
    note("control-valve", "The control valve is the controls typical's device; the mechanical trade installs it (VA 23 09 23 Responsibility Table).", { source: VA("23 09 23 (03-01-23)", "§1.1 Responsibility Table: automatic valves") }),
  ];
  return {
    id, version: "1", title, kind: "part" as const, status: "starter" as const,
    applies_to: { family: "ANY", rank: 0, layer: "hookup" },
    variables: PROFILE_VARIABLES,
    lines: lines.map((l) => ({ ...l, params: { ...(l.params ?? {}), service: `'${svc}'` } })),
    provenance: [{ source: "research 04 §1.1 and §5 (hydronic coil hook-up)", license: "Apache-2.0", derivation: "inferred" as const }],
  };
}

const equip = (id: string, title: string, family: string | string[], lines: Line[], extra: Record<string, unknown> = {}) => ({
  id, version: "1", title, kind: "equipment" as const, status: "starter" as const,
  applies_to: { family, rank: 10, layer: "hookup" },
  ...extra,
  lines,
  provenance: [{ source: "research 04 §5 (vendor-neutral hook-up catalogue)", license: "Apache-2.0", derivation: "inferred" as const }],
});

const terminalExtras = (size: string): Line[] => [
  component("hoses", "hose", { qty: "2", label: "Flexible hoses at the terminal coil (where the specification allows them)", params: { size_in: size, length_ft: "<selection>" }, source: UF("23 81 47 (UF-8147)", "§2.1.1 l; IMEG forbids them (research 04 §1.1)") }),
];

export function hookups() {
  const hwCoil = coilPart("hw-coil-hookup", "Hot-water coil hook-up", "hw", "attr.hw_conn_in", "attr.hw_gpm", "attr.hw_wpd_ft");
  const chwCoil = coilPart("chw-coil-hookup", "Chilled-water coil hook-up", "chw", "attr.chw_conn_in", "attr.chw_gpm", "attr.chw_wpd_ft");
  const terminalHeater = {
    id: "terminal-heater-hookup", version: "1", title: "Terminal heating unit hook-up (unit heater, cabinet unit heater, convector)", kind: "part" as const, status: "starter" as const,
    applies_to: { family: "ANY", rank: 0, layer: "hookup" },
    variables: PROFILE_VARIABLES,
    lines: [
      component("inlet-stop", "isolation-valve", { label: "Inlet stop (radiator) valve", params: sized("attr.conn_in"), source: UF("23 21 13 (UF-2113)", "§3.2.9.2: radiator valve on the inlet") }),
      component("outlet-balancing", "balancing-valve", { label: "Outlet balancing valve", params: sized("attr.conn_in"), source: UF("23 21 13 (UF-2113)", "§3.2.9.2: balancing valve on the outlet") }),
      component("unions", "union", { when: "attr.conn_in < var.flange_min_in", qty: "2", label: "Unions", params: sized("attr.conn_in"), source: UF("23 21 13 (UF-2113)", "§3.2.5") }),
      component("air-vent", "air-vent", { label: "Manual air vent", params: { size_in: "0.5" }, source: UF("23 21 13 (UF-6426)", "§3.1.6") }),
    ],
    provenance: [{ source: "research 04 §5 (terminal heating unit)", license: "Apache-2.0", derivation: "inferred" as const }],
  };
  const steamCoil = {
    id: "steam-coil-hookup", version: "1", title: "Steam coil hook-up (supply and condensate)", kind: "part" as const, status: "starter" as const,
    applies_to: { family: "ANY", rank: 0, layer: "hookup" },
    variables: [...PROFILE_VARIABLES, { id: "lift", from: "project.condensate_lift", prompt: "Is condensate lifted or returned against back pressure after the trap?" }],
    lines: [
      component("supply-isolation", "isolation-valve", { label: "Supply isolation valve", params: { end_type: "<selection>" }, source: R04("§1.3 supply side") }),
      component("supply-strainer", "strainer", { label: "Supply strainer", params: { end_type: "<selection>" }, source: R04("§1.3 supply side") }),
      component("supply-union", "union", { label: "Supply union", params: { end_type: "<selection>" }, source: R04("§1.3 supply side") }),
      component("vacuum-breaker", "vacuum-breaker", { label: "Vacuum breaker between the control valve and the coil", source: UF("23 30 00 (UF-3000)", "§2.13.2.3: on every coil, field or factory installed") }),
      component("dirt-pocket", "dirt-pocket", { label: "Dirt pocket (at least 14 in.) at the coil's return connection", source: R04("§1.3: IMEG 23 22 18 §3.1 A.6; UFGS 23 22 26 §3.1.1.9") }),
      component("trap-inlet-isolation", "isolation-valve", { label: "Trap inlet shutoff valve", source: R04("§1.3: IMEG 23 22 18 §3.1 A.4-5") }),
      component("trap-strainer", "strainer", { label: "Trap inlet strainer", source: UF("23 22 26 (UF-2226)", "§3.1.1.9: dirt pocket and strainer ahead of the trap") }),
      component("trap", "steam-trap", { label: "Float-and-thermostatic trap (modulating load), sized 2.5 times the maximum condensate load", params: { lb_hr: "attr.steam_lb_hr", size_in: "<selection>" }, source: R04("§1.3: IMEG 23 22 18 §3.1 A.2-3; NSCS 231000 item 23") }),
      component("trap-unions", "union", { qty: "2", label: "Unions at both ends of the trap", source: R04("§1.3: IMEG 23 22 18 §3.1 A.4-5") }),
      component("check-valve", "check-valve", { when: "var.lift", label: "Check valve after the trap (lift or back pressure)", source: UF("23 22 26 (UF-2226)", "§3.1.1.9") }),
      component("trap-outlet-isolation", "isolation-valve", { label: "Trap discharge shutoff valve", source: R04("§1.3: IMEG 23 22 18 §3.1 A.4-5") }),
      component("trap-bypass", "bypass-set", { profile_switch: "steam_trap_bypass", label: "3-valve bypass around the trap", source: UF("23 22 26 (UF-2226)", "§3.1.1.9: where equipment must stay in service during trap work") }),
      note("control-valve", "The steam control valve is the controls typical's device.", { source: VA("23 09 23 (03-01-23)", "§1.1 Responsibility Table: automatic valves") }),
    ],
    provenance: [{ source: "research 04 §1.3 (steam coil hook-up)", license: "Apache-2.0", derivation: "inferred" as const }],
  };
  const pump = {
    id: "pump-hookup", version: "1", title: "Pump hook-up", kind: "part" as const, status: "starter" as const,
    applies_to: { family: "ANY", rank: 0, layer: "hookup" },
    variables: PROFILE_VARIABLES,
    lines: [
      component("suction-isolation", "isolation-valve", { label: "Suction shutoff valve", params: sized("attr.conn_in"), source: VA("23 21 23", "§2.1 B.12") }),
      component("suction-strainer", "suction-diffuser", { label: "Strainer with blowdown, or a suction diffuser (base-mounted pumps)", params: { ...sized("attr.conn_in"), type: "<selection>" }, source: R04("§1.4: VA 23 21 23 §2.1 B.12; IMEG 23 21 16 §2.6; UFGS 23 21 23 §2.7.4") }),
      component("flex-connectors", "flexible-connector", { qty: "2", label: "Flexible connectors (pump on isolators or pedestals)", params: sized("attr.conn_in"), source: UF("23 30 00 (UF-3000)", "§3.2.2") }),
      component("discharge-check", "triple-duty-valve", { label: "Check valve, or a triple-duty valve (shutoff, check and throttling)", params: { ...sized("attr.conn_in"), type: "<selection>" }, source: R04("§1.4: UFGS 23 21 23 §2.6.2; VA 23 21 13 §2.8") }),
      component("discharge-isolation", "isolation-valve", { label: "Discharge isolation (or balancing) valve", params: sized("attr.conn_in"), source: R04("§1.4") }),
      component("gauges", "pressure-gauge", { qty: "2", label: "Pressure gauges with needle valves or snubbers, before and after the pump", params: { dial_in: "4.5" }, source: UF("23 21 13 (UF-6426)", "§2.7.5; NSCS 231000 item 32") }),
      component("unions-or-flanges", "flange-set", { qty: "2", label: "Unions or flanges at the pump", params: { size_in: "attr.conn_in", joint: joint("attr.conn_in") }, source: UF("23 21 13 (UF-2113)", "§3.2.5") }),
    ],
    provenance: [{ source: "research 04 §1.4 (pump hook-up)", license: "Apache-2.0", derivation: "inferred" as const }],
  };

  const ahuFamilies = ["AHU", "RTU", "DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT"];
  const vav = equip("hookup-vav", "VAV terminal hook-up", "VAV", [
    part("hw-coil", "hw-coil-hookup", { when: "attr.heat_type = 'hw'", label: "Reheat coil hook-up", source: R04("§5: 1 per coil circuit") }),
    ...terminalExtras("attr.hw_conn_in").map((l) => ({ ...l, when: "attr.heat_type = 'hw'", profile_switch: "hoses_at_terminal_coils" })),
    component("access-door", "access-door", { when: "attr.heat_type = 'hw' or attr.heat_type = 'electric'", profile_switch: "access_door_at_reheat_coil", label: "Access door upstream of the reheat coil", source: R04("§1.6: IMEG 23 36 00 §2.2 F; UFGS 23 30 00 §2.12.2") }),
  ]);
  const fcu = equip("hookup-fcu", "Fan coil unit hook-up", "FCU", [
    part("chw-coil", "chw-coil-hookup", { when: "attr.cooling_type = 'chw'", label: "Chilled-water (or dual-temperature) coil hook-up", source: R04("§5: a 4-pipe FCU has 2 coil circuits") }),
    part("hw-coil", "hw-coil-hookup", { when: "attr.heating_type = 'hw' and not (known(attr.pipes) and attr.pipes = 2)", label: "Hot-water coil hook-up", source: R04("§5: a 4-pipe FCU has 2 coil circuits") }),
    ...terminalExtras("attr.chw_conn_in").map((l) => ({ ...l, id: "chw-hoses", when: "attr.cooling_type = 'chw'", profile_switch: "hoses_at_terminal_coils" })),
    ...terminalExtras("attr.hw_conn_in").map((l) => ({ ...l, id: "hw-hoses", when: "attr.heating_type = 'hw' and not (known(attr.pipes) and attr.pipes = 2)", profile_switch: "hoses_at_terminal_coils" })),
    component("condensate-trap", "condensate-trap", { when: "attr.cooling_type != 'none'", profile_switch: "condensate_trap_at_fcu", label: "Condensate trap (seal of 2 in. plus the unit's static pressure)", source: UF("23 30 00 (UF-3000)", "§3.2.1: room fan coil units may be exempted") }),
  ]);
  const ahu = equip("hookup-air-handler", "Air handler hook-up (coils, drain, fan connections)", ahuFamilies, [
    part("chw-coil", "chw-coil-hookup", { when: "attr.cooling_type = 'chw'", label: "Cooling coil hook-up", source: R04("§5: one per coil") }),
    part("hw-coil", "hw-coil-hookup", { when: "attr.heating_type = 'hw'", label: "Heating coil hook-up", source: R04("§5: one per coil") }),
    part("steam-coil", "steam-coil-hookup", { when: "attr.heating_type = 'steam'", label: "Steam coil hook-up", source: R04("§5: one per coil") }),
    component("coil-thermometers", "thermometer", { profile_switch: "thermometers_at_ahu_coils", qty: "2 * (if(attr.cooling_type = 'chw', 1, 0) + if(attr.heating_type = 'hw', 1, 0))", label: "Thermometers at the air handler's water coils (in and out)", source: R04("§1.1: NSCS 231000 items 31-32; AHU coils add 2 thermometers") }),
    component("coil-gauges", "pressure-gauge", { profile_switch: "thermometers_at_ahu_coils", qty: "2 * (if(attr.cooling_type = 'chw', 1, 0) + if(attr.heating_type = 'hw', 1, 0))", label: "Pressure gauges at the air handler's water coils (in and out)", source: R04("§1.1: NSCS 231000 items 31-32; AHU coils add 2 gauges") }),
    component("condensate-trap", "condensate-trap", { when: "attr.cooling_type != 'none'", label: "Condensate trap (2 in. plus the unit's total static pressure)", source: UF("23 30 00 (UF-3000)", "§3.2.1") }),
    component("flex-duct-connectors", "flexible-duct-connector", { qty: "2", label: "Flexible duct connectors at the fan connections (supply and return)", source: UF("23 30 00 (UF-3000)", "§2.12.1.3: a flexible connector at each fan connection") }),
  ]);
  const uh = equip("hookup-unit-heater", "Unit heater hook-up", ["UNIT_HEATER", "CABINET_UNIT_HEATER"], [
    part("hw", "terminal-heater-hookup", { when: "attr.heating_medium = 'hw'", label: "Hot-water terminal heating unit hook-up", source: R04("§5: 1 per unit") }),
    part("steam", "steam-coil-hookup", { when: "attr.heating_medium = 'steam'", label: "Steam unit heater hook-up", source: R04("§5: 1 per coil") }),
  ]);
  const pumpHook = equip("hookup-pump", "Pump hook-up", "PUMP", [part("pump", "pump-hookup", { label: "Pump hook-up", source: R04("§5: 1 per pump") })]);
  const heatPump = equip("hookup-heat-pump", "Water-source heat pump hose kit", "HEAT_PUMP", [
    component("hoses", "hose", { when: "known(attr.source_gpm)", qty: "2", label: "Stainless braided hoses, 2 ft, with a swivel on one end", params: { size_in: "attr.conn_in", length_ft: "2" }, source: UF("23 81 47 (UF-8147)", "§2.1.1 g, l, m") }),
    component("isolation", "isolation-valve", { when: "known(attr.source_gpm)", qty: "2", label: "Ball valves with memory stops (one with a test port)", params: sized("attr.conn_in"), source: UF("23 81 47 (UF-8147)", "§2.1.1") }),
    component("flow-valve", "manual-flow-valve", { when: "known(attr.source_gpm)", label: "Manual flow control valve with test ports", params: { ...sized("attr.conn_in"), gpm: "attr.source_gpm" }, source: UF("23 81 47 (UF-8147)", "§2.1.1") }),
    component("strainer", "strainer", { when: "known(attr.source_gpm)", label: "Y-strainer with blowdown ball valve", params: sized("attr.conn_in"), source: UF("23 81 47 (UF-8147)", "§2.1.1") }),
    component("flushing-bypass", "flushing-bypass", { when: "known(attr.source_gpm)", label: "Flushing bypass", params: sized("attr.conn_in"), source: R04("§1.1 rule 6") }),
    note("valve", "The 2-position source-water valve is the controls typical's device.", { source: R04("§1.1 rule 6") }),
  ]);
  const boiler = equip("hookup-boiler", "Boiler trim", "BOILER", [
    component("isolation", "isolation-valve", { qty: "2", label: "Isolation valves, supply and return", params: sized("attr.conn_in"), source: UF("23 21 13 (UF-6426)", "§3.1.5") }),
    component("relief", "relief-valve", { label: "Relief valve, piped to a floor drain", source: UF("23 21 13 (UF-2113)", "§3.2.9.3") }),
    component("thermometers", "thermometer", { qty: "2", label: "Thermometers, inlet and outlet", source: R04("§1.5: NSCS 231000 item 31") }),
    component("pressure-gauge", "pressure-gauge", { label: "Temperature and pressure gauge within 12 in. of the outlet", source: R04("§1.5: boiler installation manual (vendor)") }),
    component("gas-cock", "gas-cock", { when: "attr.fuel = 'gas' or attr.fuel = 'dual_fuel' or attr.fuel = 'propane'", label: "Manual gas shutoff outside the jacket", source: R04("§1.5: vendor installation manual") }),
    component("sediment-trap", "sediment-trap", { when: "attr.fuel = 'gas' or attr.fuel = 'dual_fuel' or attr.fuel = 'propane'", label: "Gas sediment trap and union", source: R04("§1.5: vendor installation manual") }),
    component("gas-regulator", "gas-regulator", { when: "attr.fuel = 'gas' or attr.fuel = 'dual_fuel' or attr.fuel = 'propane'", profile_switch: "gas_regulator_at_boilers", label: "Gas pressure regulator (supply above 10.5 in. w.c.)", source: R04("§1.5: vendor installation manual") }),
    note("flow-switch", "The flow switch is factory standard on many boilers; where field supplied it follows the matrix's flow-switch row. A low-water cutoff where the boiler sits above the radiation it serves.", { source: R04("§1.5") }),
  ]);
  const chiller = equip("hookup-chiller", "Chiller barrel trim", ["AIR_COOLED_CHILLER", "HEAT_RECOVERY_CHILLER"], [
    component("isolation", "isolation-valve", { qty: "if(attr.condenser = 'water', 4, 2)", label: "Isolation valves at each barrel (evaporator; condenser when water-cooled)", params: sized("attr.conn_in"), source: UF("23 21 13 (UF-6426)", "§3.1.5") }),
    component("thermometers", "thermometer", { qty: "if(attr.condenser = 'water', 4, 2)", label: "Thermometers in and out of each barrel", source: UF("23 21 13 (UF-6426)", "§3.1.9") }),
    component("pt-ports", "pt-port", { qty: "if(attr.condenser = 'water', 4, 2)", label: "P/T ports in and out of each barrel", source: UF("23 05 93 (UF-0593)", "§3.2.4.1 b") }),
    note("strainer", "An evaporator inlet strainer with gauge taps appears only in non-US installation manuals (research 04 §6): add it per the project specification.", { source: R04("§1.5, §6") }),
  ]);
  const tower = equip("hookup-tower", "Cooling tower cell trim", "COOLING_TOWER", [
    component("overflow-drain", "overflow-drain", { qty: "attr.cells", label: "Basin overflow and drain connections", source: UF("23 65 00 (UF-6500)", "§2.5.4.11") }),
    component("makeup-float", "fill-valve", { qty: "attr.cells", profile_switch: "tower_float_makeup", label: "Float makeup valve (electronic level control is the controls typical's alternative)", source: UF("23 65 00 (UF-6500)", "§2.5.4.11") }),
    component("equalizer", "equalizer-valve", { when: "attr.cells > 1", qty: "attr.cells - 1", label: "Equalizer pipe isolation valves between cells", source: R04("§1.5 (search summary)") }),
  ]);
  const hx = equip("hookup-hx", "Heat exchanger trim", "HEAT_EXCHANGER", [
    component("vacuum-breaker", "vacuum-breaker", { when: "attr.primary_medium = 'steam'", label: "Shell vacuum breaker", source: R04("§1.5: IMEG 23 57 00 §3.2; UFGS 23 57 10 §2.12.4") }),
    component("steam-gauge", "pressure-gauge", { when: "attr.primary_medium = 'steam'", label: "Shell gauge with pigtail siphon", source: R04("§1.5: IMEG 23 57 00 §3.2") }),
    component("relief", "relief-valve", { label: "ASME relief valve on the water outlet", source: R04("§1.5: IMEG 23 57 00 §3.2; UFGS 23 57 10 §2.12.5") }),
    component("thermometer-wells", "thermometer", { qty: "2", label: "Thermometer wells, water in and out", source: R04("§1.5: IMEG 23 57 00 §3.2") }),
    component("gauges", "pressure-gauge", { qty: "2", label: "Gauge tappings, water in and out", source: R04("§1.5: IMEG 23 57 00 §3.2") }),
    component("drain", "drain-valve", { label: "Valved drain at the water inlet", source: R04("§1.5: IMEG 23 57 00 §3.2") }),
    part("condensate", "steam-coil-hookup", { when: "attr.primary_medium = 'steam'", label: "Steam supply and condensate trim (as a steam coil's)", source: R04("§1.3, §1.5") }),
  ]);
  const specialties = {
    id: "system-specialties", version: "1", title: "Closed water system specialties (once per closed loop)", kind: "project" as const, status: "starter" as const,
    applies_to: { family: "project", selector: "var.loops > 0", rank: 0, layer: "hookup" },
    variables: [{ id: "loops", from: "project.closed_loops", prompt: "Closed water loops (heating, chilled, condenser, glycol)" }],
    lines: [
      component("air-separator", "air-separator", { qty: "var.loops", label: "Air separator with blowdown and automatic vent (or a coalescing air and dirt separator)", source: UF("23 21 13 (UF-6426)", "§2.10; NSCS 231000 item 17") }),
      component("expansion-tank", "expansion-tank", { qty: "var.loops", label: "Expansion tank with drain, fill, air-charging valve and system connections", source: UF("23 21 13 (UF-6426)", "§2.9") }),
      component("fill-valve", "fill-valve", { qty: "var.loops", label: "Fill (pressure-reducing) valve with manual shutoff", source: R04("§1.5: fill station") }),
      component("backflow", "backflow-preventer", { qty: "var.loops", label: "Backflow preventer on the fill", source: R04("§1.5: fill with a check valve or backflow preventer") }),
      component("pot-feeder", "pot-feeder", { qty: "var.loops", label: "Bypass (pot) feeder with inlet, outlet and drain valves", source: R04("§1.5: IMEG 23 25 00 §2.2 A") }),
      component("coupon-rack", "coupon-rack", { qty: "var.loops", label: "Corrosion coupon rack", source: R04("§1.5: IMEG 23 25 00 §2.2 A") }),
      component("makeup-meter", "water-meter", { qty: "var.loops", label: "Makeup water meter with a pulse output to the BAS", source: R04("§1.5: IMEG 23 25 00 §2.2 A") }),
    ],
    provenance: [{ source: "research 04 §1.5 (once per closed water system)", license: "Apache-2.0", derivation: "inferred" as const }],
  };
  return [hwCoil, chwCoil, terminalHeater, steamCoil, pump, vav, fcu, ahu, uh, pumpHook, heatPump, boiler, chiller, tower, hx, specialties];
}
