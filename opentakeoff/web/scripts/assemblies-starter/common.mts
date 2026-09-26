// ASSEMBLIES WP4 — the starter library's building blocks: sources, the
// single responsibility matrix (decision D13), and line helpers.
//
// SHOULD THIS BE ON THE SHARED PATH? The library it builds is: both surfaces
// load the same JSON through the same gate (schema.ts). This builder only
// writes that JSON; nothing at runtime imports it.
//
// Every line carries its source locator, license and derivation. Every
// responsibility comes from MATRIX, keyed by the line's role, so the
// typicals and the hook-ups share one matrix and a project edits it once.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { AssemblyLine } from "../../src/lib/assemblies/schema.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURES = join(HERE, "..", "..", "test", "assemblies", "fixtures");

// ── Sources ─────────────────────────────────────────────────────────────────

export type Source = AssemblyLine["source"];
export const LICENSE = {
  usgov: "LicenseRef-US-Government-Work",
  mbl: "BSD-3-Clause-LBNL",
  ot: "Apache-2.0",
} as const;

export const MBL_COMMIT = "a3cfdde";
const G36 = "Buildings/Controls/OBC/ASHRAE/G36/";
export const MBL_FILE: Record<string, string> = {
  "TerminalUnits/CoolingOnly": `${G36}TerminalUnits/CoolingOnly/Controller.mo`,
  "TerminalUnits/Reheat": `${G36}TerminalUnits/Reheat/Controller.mo`,
  "TerminalUnits/SeriesFanCVF": `${G36}TerminalUnits/SeriesFanCVF/Controller.mo`,
  "TerminalUnits/SeriesFanVVF": `${G36}TerminalUnits/SeriesFanVVF/Controller.mo`,
  "TerminalUnits/ParallelFanCVF": `${G36}TerminalUnits/ParallelFanCVF/Controller.mo`,
  "TerminalUnits/ParallelFanVVF": `${G36}TerminalUnits/ParallelFanVVF/Controller.mo`,
  "TerminalUnits/DualDuctSnapActing": `${G36}TerminalUnits/DualDuctSnapActing/Controller.mo`,
  "TerminalUnits/DualDuctMixConInletSensor": `${G36}TerminalUnits/DualDuctMixConInletSensor/Controller.mo`,
  "TerminalUnits/DualDuctMixConDischargeSensor": `${G36}TerminalUnits/DualDuctMixConDischargeSensor/Controller.mo`,
  "TerminalUnits/DualDuctColdDuctMin": `${G36}TerminalUnits/DualDuctColdDuctMin/Controller.mo`,
  "ThermalZones/Setpoints": `${G36}ThermalZones/Setpoints.mo`,
  "AHUs/MultiZone/VAV": `${G36}AHUs/MultiZone/VAV/Controller.mo`,
  "AHUs/SingleZone/VAV": `${G36}AHUs/SingleZone/VAV/Controller.mo`,
  "FanCoilUnits": `${G36}FanCoilUnits/Controller.mo`,
  "Plants/Chillers": `${G36}Plants/Chillers/Controller.mo`,
};

type Ufc = { lists: Array<{ list: string; printed_page: number; items: Array<{ id: string; text: string }> }> };
const UFC: Ufc = JSON.parse(readFileSync(join(FIXTURES, "ufc-3-410-01-table-3-1.json"), "utf8"));
export const UFC_ITEMS = new Map(UFC.lists.flatMap((l) => l.items.map((i) => [i.id, { ...i, list: l.list, page: l.printed_page }] as const)));

export const src = {
  /** A G36 connector of the Modelica Buildings Library. */
  mbl: (block: string, connector: string): Source => {
    const file = MBL_FILE[block];
    if (!file) throw new Error(`no MBL block ${block}`);
    return { ref: `MBL ${MBL_COMMIT} ${file}#${connector}`, license: LICENSE.mbl, derivation: "paraphrase" };
  },
  /** A UFGS section (US Government work). */
  ufgs: (section: "23 09 00" | "23 09 13" | "23 09 23.02" | "23 09 93", locator: string, edition?: string): Source => ({
    ref: `UFGS ${section}${edition ? ` (${edition})` : ""} ${locator}`,
    license: LICENSE.usgov,
    derivation: "paraphrase",
  }),
  /** An item of UFC 3-410-01 Table 3-1, quoted. */
  ufc: (itemId: string): Source => {
    const item = UFC_ITEMS.get(itemId);
    if (!item) throw new Error(`no UFC Table 3-1 item ${itemId}`);
    return { ref: `UFC 3-410-01 (28 Jul 2025) Table 3-1 p.${item.page}, ${item.list}: "${item.text}" [${itemId}]`, license: LICENSE.usgov, derivation: "verbatim" };
  },
  ufc410: (locator: string): Source => ({ ref: `UFC 3-410-01 (28 Jul 2025) ${locator}`, license: LICENSE.usgov, derivation: "paraphrase" }),
  ufc41002: (locator: string): Source => ({ ref: `UFC 3-410-02 ${locator}`, license: LICENSE.usgov, derivation: "paraphrase" }),
  va: (section: string, locator: string): Source => ({ ref: `VA ${section} ${locator}`, license: LICENSE.usgov, derivation: "paraphrase" }),
  /** OpenTakeoff's own inference, from the research it names. */
  inferred: (why: string): Source => ({ ref: `[inferred] ${why}`, license: LICENSE.ot, derivation: "inferred" }),
};

// ── The responsibility matrix (D13) ─────────────────────────────────────────
// Default: the VA 23 09 23 (03-01-23) §1.1 Responsibility Table, verified,
// with its section numbers mapped to parties (23 09 23 → controls, 23 →
// mechanical, 26 and the old "16" → electrical, 28 31 00 and 28 → fire
// alarm; N/A leaves the activity unassigned). Rows VA does not cover follow
// research 02's "Default responsibility" notes and say [inferred]. Program
// and test are the controls contractor's for every BAS item (research 02).

export type Party = "controls" | "mechanical" | "electrical" | "fire_alarm" | "factory" | "owner" | "general" | "unassigned";
export interface MatrixRow {
  item: string;
  furnish?: Party; install?: Party; wire_lv?: Party; power?: Party; program?: Party; test?: Party;
  /** VA's printed cells, verbatim, for a VA row. */
  va?: [string, string, string, string];
  source: Source;
  note?: string;
}

const VA_TABLE = src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table");
const party = (cell: string): Party | undefined => {
  if (cell === "N/A") return undefined;
  if (cell === "23 09 23") return "controls";
  if (cell === "23" || cell === "23 21 11" || cell === "23 22 13") return "mechanical";
  if (cell === "26" || cell === "16") return "electrical";
  if (cell === "28 31 00" || cell === "28") return "fire_alarm";
  throw new Error(`unmapped VA cell ${cell}`);
};
const vaRow = (item: string, cells: [string, string, string, string], bas: boolean, note?: string): MatrixRow => ({
  item,
  furnish: party(cells[0]), install: party(cells[1]), wire_lv: party(cells[2]), power: party(cells[3]),
  ...(bas ? { program: "controls" as Party, test: "controls" as Party } : {}),
  va: cells, source: VA_TABLE, ...(note ? { note } : {}),
});

export const MATRIX: Record<string, MatrixRow> = {
  "va.terminal_units": vaRow("Terminal units", ["23", "23", "N/A", "26"], false),
  "va.terminal_unit_controllers": vaRow("Controllers for terminal units", ["23 09 23", "23", "23 09 23", "16"], true, "\"16\" is an old division number for electrical work."),
  "va.automatic_dampers": vaRow("Automatic dampers (not furnished with equipment)", ["23 09 23", "23", "N/A", "N/A"], true),
  "va.damper_actuators": vaRow("Automatic damper actuators", ["23 09 23", "23 09 23", "23 09 23", "23 09 23"], true),
  "va.manual_valves": vaRow("Manual valves", ["23", "23", "N/A", "N/A"], false),
  "va.automatic_valves": vaRow("Automatic valves", ["23 09 23", "23", "23 09 23", "23 09 23"], true, "The four coil-kit patterns (research 04 §4) are presets over this row, not separate assemblies."),
  "va.pipe_insertion": vaRow("Pipe insertion devices and taps, flow and pressure stations.", ["23", "23", "N/A", "N/A"], false),
  "va.thermowells": vaRow("Thermowells", ["23 09 23", "23", "N/A", "N/A"], false),
  "va.current_switches": vaRow("Current Switches", ["23 09 23", "23 09 23", "23 09 23", "N/A"], true),
  "va.control_relays": vaRow("Control Relays", ["23 09 23", "23 09 23", "23 09 23", "N/A"], true),
  "va.control_nodes": vaRow("All control system nodes, equipment, housings, enclosures and panels.", ["23 09 23", "23 09 23", "23 09 23", "26"], true),
  "va.chiller_boiler_interface": vaRow("Interface with chiller/boiler controls", ["23 09 23", "23 09 23", "23 09 23", "26"], true),
  "va.chiller_boiler_controls": vaRow("Chiller/boiler controls interface with control system", ["23", "23", "23 09 23", "26"], true),
  "va.smoke_detectors": vaRow("Smoke detectors", ["28 31 00", "28 31 00", "28 31 00", "28 31 00"], false, "Research 02 found university specifications [S] where the mechanical trade installs duct detectors; VA's table is the default."),
  "va.fire_smoke_dampers": vaRow("Fire/Smoke Dampers", ["23", "23", "28 31 00", "28 31 00"], false),
  "va.smoke_dampers": vaRow("Smoke Dampers", ["23", "23", "28 31 00", "28 31 00"], false),
  "va.fire_dampers": vaRow("Fire Dampers", ["23", "23", "N/A", "N/A"], false),
  "va.flow_switches": vaRow("Chiller Flow Switches (and Boiler Flow Switches, the same cells)", ["23", "23", "23", "N/A"], false, "VA §1.1 also lists flow switches among the items the controls contractor furnishes but does not install; the table row is the default and the conflict is a partner-review item."),
  "va.vfds": vaRow("VFDs", ["23", "26", "23 09 23", "26"], true),
  "va.starters_hoa": vaRow("Starters, HOA switches", ["23", "23", "N/A", "26"], false),
  "va.lab_air_valves": vaRow("Laboratory Air Valves", ["23", "23", "23 09 23", "N/A"], true),
  "va.fume_hood_controls": vaRow("Fume hood controls", ["23 09 23", "23 09 23", "23 09 23", "26"], true),
  "va.fcu_controls": vaRow("Fan Coil Unit controls (not furnished with equipment)", ["23 09 23", "23 09 23", "23 09 23", "26"], true),
  "va.uh_controls": vaRow("Unit Heater controls (not furnished with equipment)", ["23 09 23", "23 09 23", "23 09 23", "26"], true),
  "va.rtu_unit_controls": vaRow("Packaged RTU unit-mounted controls (not furnished with equipment)", ["23 09 23", "23 09 23", "23 09 23", "26"], true),
  "va.tower_vibration": vaRow("Cooling Tower Vibration Switches", ["23", "23", "23 09 23", "23 09 23"], true),
  "va.tower_level": vaRow("Cooling Tower Level Control Devices", ["23", "23", "23 09 23", "23 09 23"], true),
  "va.tower_makeup": vaRow("Cooling Tower makeup water control devices", ["23", "23", "23 09 23", "23 09 23"], true),
  "va.water_treatment": vaRow("Water treatment system", ["23", "23", "23", "26"], false),
  // Rows VA does not cover.
  "inf.bas_devices": { item: "Sensors, switches and transmitters of the BAS not in the VA table", furnish: "controls", install: "controls", wire_lv: "controls", program: "controls", test: "controls", source: src.inferred("research 02 'Default responsibility': the controls contractor furnishes, installs, wires, programs and tests BAS devices") },
  "inf.flow_meters": { item: "Hydronic flow meters", furnish: "controls", install: "mechanical", wire_lv: "controls", program: "controls", test: "controls", source: src.va("23 09 23 (03-01-23)", "§1.1: flow meters are furnished but not installed by the controls contractor"), note: "VA's table row \"Pipe insertion devices and taps, flow and pressure stations\" gives both to 23; the §1.1 list is the more specific. A partner-review item." },
  "inf.vav_flow_sensor": { item: "Terminal unit airflow sensor (the factory flow cross)", furnish: "factory", install: "factory", program: "controls", test: "controls", source: src.inferred("research 02 'Default responsibility': VAV flow sensors are factory") },
  "inf.airflow_station": { item: "Airflow measuring stations", furnish: "controls", install: "mechanical", wire_lv: "controls", program: "controls", test: "controls", source: src.inferred("research 04 §4: UFGS 23 09 13 §2.7.7 specifies them in the controls section; no source says who installs them, probably the sheet-metal trade") },
  "inf.packaged_controls": { item: "Controls furnished with packaged equipment (factory controllers, their sensors and staging)", furnish: "factory", install: "factory", wire_lv: "factory", power: "electrical", program: "factory", test: "controls", source: src.inferred("research 02 'Default responsibility': packaged-unit controls are factory furnished") },
  "inf.factory_interface": { item: "A factory device the BAS commands or monitors (a heater's SCR or contactors, a unit's DX staging, a boiler's alarm contact)", furnish: "factory", install: "factory", wire_lv: "controls", power: "electrical", program: "controls", test: "controls", source: src.inferred("VA 23 09 23 row 'Chiller/boiler controls interface with control system', extended to other packaged equipment") },
  "inf.meters_electric": { item: "Building electrical meter", furnish: "electrical", install: "electrical", wire_lv: "controls", program: "controls", test: "controls", source: src.inferred("UFGS 23 09 13 §2.7.8.4 specifies the meter; the electrical trade installs it") },
  "inf.meters_utility": { item: "Building water, gas and steam meters", furnish: "mechanical", install: "mechanical", wire_lv: "controls", program: "controls", test: "controls", source: src.inferred("the piping trades install in-line meters; the controls contractor wires the pulse or network output") },
  "inf.shutdown_switch": { item: "HVAC equipment shutdown switch", furnish: "controls", install: "controls", wire_lv: "controls", program: "controls", test: "controls", source: src.inferred("UFC 3-410-01 Table 3-1 names its status; which trade furnishes the switch is a partner-review item") },
  "inf.gauges": { item: "Thermometers and pressure gauges", furnish: "mechanical", install: "mechanical", source: src.ufgs("23 09 13", "§2.8 note: thermometers and gauges are typically provided by the mechanical contractor") },
  "inf.mechanical_specialty": { item: "Piping and duct specialties (air separator, expansion tank, fill, feeder, traps, connectors, access doors)", furnish: "mechanical", install: "mechanical", source: src.inferred("research 04 §1.5-1.6: each is specified in a Division 23 piping or duct section") },
  "inf.points": { item: "A point: programmed and tested by the controls contractor", program: "controls", test: "controls", source: src.inferred("research 02 'Default responsibility': the controls contractor programs and tests") },
};

/** Which matrix row each role uses. A line's responsibility is its role's row. */
export const ROLE_ROW: Record<string, string> = {
  // controls devices
  "terminal-unit-controller": "va.terminal_unit_controllers",
  "unit-controller": "va.fcu_controls",
  "unit-heater-controller": "va.uh_controls",
  "system-controller": "va.control_nodes",
  "packaged-controller": "inf.packaged_controls",
  "network-interface": "va.chiller_boiler_controls",
  "transformer": "va.control_nodes",
  "space-sensor": "inf.bas_devices",
  "temperature-sensor": "inf.bas_devices",
  "humidity-sensor": "inf.bas_devices",
  "co2-sensor": "inf.bas_devices",
  "occupancy-sensor": "inf.bas_devices",
  "window-switch": "inf.bas_devices",
  "pressure-sensor": "inf.bas_devices",
  "pressure-switch": "inf.bas_devices",
  "freezestat": "inf.bas_devices",
  "end-switch": "inf.bas_devices",
  "level-sensor": "va.tower_level",
  "vibration-switch": "va.tower_vibration",
  "makeup-valve": "va.tower_makeup",
  "current-switch": "va.current_switches",
  "relay": "va.control_relays",
  "damper-actuator": "va.damper_actuators",
  "automatic-damper": "va.automatic_dampers",
  "control-valve": "va.automatic_valves",
  "airflow-sensor": "inf.vav_flow_sensor",
  "airflow-station": "inf.airflow_station",
  "flow-switch": "va.flow_switches",
  "flow-meter": "inf.flow_meters",
  "thermowell": "va.thermowells",
  "pressure-tap": "va.pipe_insertion",
  "vfd": "va.vfds",
  "starter": "va.starters_hoa",
  "hoa-switch": "va.starters_hoa",
  "packaged-unit-controls": "va.rtu_unit_controls",
  "smoke-detector": "va.smoke_detectors",
  "factory-interface": "inf.factory_interface",
  "lab-air-valve": "va.lab_air_valves",
  "fume-hood-monitor": "va.fume_hood_controls",
  "electric-meter": "inf.meters_electric",
  "utility-meter": "inf.meters_utility",
  "shutdown-switch": "inf.shutdown_switch",
  // hook-up components
  "isolation-valve": "va.manual_valves",
  "balancing-valve": "va.manual_valves",
  "flow-limiter": "va.manual_valves",
  "strainer": "va.manual_valves",
  "blowdown-valve": "va.manual_valves",
  "drain-valve": "va.manual_valves",
  "check-valve": "va.manual_valves",
  "triple-duty-valve": "va.manual_valves",
  "suction-diffuser": "va.manual_valves",
  "relief-valve": "va.manual_valves",
  "vacuum-breaker": "va.manual_valves",
  "test-valve": "va.manual_valves",
  "gas-cock": "va.manual_valves",
  "manual-flow-valve": "va.manual_valves",
  "coil-kit": "va.manual_valves",
  "union": "inf.mechanical_specialty",
  "flange-set": "inf.mechanical_specialty",
  "reducer": "inf.mechanical_specialty",
  "hose": "inf.mechanical_specialty",
  "air-vent": "inf.mechanical_specialty",
  "pt-port": "va.pipe_insertion",
  "thermometer": "inf.gauges",
  "pressure-gauge": "inf.gauges",
  "flexible-connector": "inf.mechanical_specialty",
  "steam-trap": "inf.mechanical_specialty",
  "dirt-pocket": "inf.mechanical_specialty",
  "bypass-set": "inf.mechanical_specialty",
  "gas-regulator": "inf.mechanical_specialty",
  "sediment-trap": "inf.mechanical_specialty",
  "fill-valve": "inf.mechanical_specialty",
  "backflow-preventer": "inf.mechanical_specialty",
  "air-separator": "inf.mechanical_specialty",
  "expansion-tank": "inf.mechanical_specialty",
  "pot-feeder": "va.water_treatment",
  "coupon-rack": "va.water_treatment",
  "water-meter": "inf.meters_utility",
  "condensate-trap": "inf.mechanical_specialty",
  "access-door": "inf.mechanical_specialty",
  "flexible-duct-connector": "inf.mechanical_specialty",
  "overflow-drain": "inf.mechanical_specialty",
  "equalizer-valve": "va.manual_valves",
  "flushing-bypass": "inf.mechanical_specialty",
  "low-water-cutoff": "inf.factory_interface",
};

/** The four coil-kit patterns of research 04 §4: who furnishes and installs
 * the control valve (and, for PICV bodies, the actuator). Presets over the
 * `control-valve` row, not separate assemblies. */
export const PRESETS = [
  { id: "valve-by-controls-installed-by-mechanical", label: "The controls contractor furnishes the valve; the mechanical contractor installs it (VA 23 09 23 table)", roles: { "control-valve": { furnish: "controls", install: "mechanical" } }, source: VA_TABLE },
  { id: "valve-shipped-to-kit-maker", label: "The controls contractor furnishes the valve and ships it to the kit or unit maker for factory mounting", roles: { "control-valve": { furnish: "controls", install: "factory" } }, source: src.inferred("research 04 §4 pattern 2: IMEG 23 09 00 §1.4 B; VA 23 36 00 §2.2 H") },
  { id: "kit-picv-body-controls-actuator", label: "The kit includes the PICV body; the controls contractor furnishes the actuator", roles: { "control-valve": { furnish: "factory", install: "factory" } }, source: src.inferred("research 04 §4 pattern 3 (vendor literature, search summaries only)"), note: "The actuator is the controls contractor's: set it on the valve line's actuator parameter or a partner line." },
  { id: "kit-maker-valve-and-actuator", label: "The kit or unit maker supplies both valve and actuator", roles: { "control-valve": { furnish: "factory", install: "factory" } }, source: src.inferred("research 04 §4 pattern 4: VA 23 82 00 §2.2 H option; vendor literature") },
] as const;

export function responsibility(role: string): AssemblyLine["responsibility"] {
  const key = ROLE_ROW[role];
  if (!key) throw new Error(`role ${role} has no matrix row`);
  return rowResponsibility(key);
}

export function rowResponsibility(key: string): AssemblyLine["responsibility"] {
  const r = MATRIX[key];
  if (!r) throw new Error(`no matrix row ${key}`);
  const out: Record<string, string> = {};
  for (const a of ["furnish", "install", "wire_lv", "power", "program", "test"] as const) if (r[a]) out[a] = r[a]!;
  return out as AssemblyLine["responsibility"];
}

// ── Line helpers ────────────────────────────────────────────────────────────

type Params = Record<string, number | string | boolean>;
export type Line = AssemblyLine & { label: string };
interface Common { when?: string; qty?: string; params?: Params; source: Source; label: string; trade?: AssemblyLine["trade"]; profile_switch?: string }
const gate = (c: { when?: string; profile_switch?: string }) => ({ ...(c.when ? { when: c.when } : {}), ...(c.profile_switch ? { profile_switch: c.profile_switch } : {}) });

const tradeOf = (role: string): AssemblyLine["trade"] => {
  const r = MATRIX[ROLE_ROW[role]];
  const f = r.furnish;
  return f === "mechanical" ? "mechanical" : f === "electrical" ? "electrical" : f === "fire_alarm" ? "fire_alarm" : f === "factory" ? "factory" : "controls";
};

/** A field or network point. `dev` is the role of the device it belongs to. */
export function point(id: string, io: NonNullable<AssemblyLine["io"]>, fn: { vocab: "xeto" | "ot"; id: string }, dev: string | null, c: Common): Line {
  const hw = io !== "NET-IN" && io !== "NET-OUT" && io !== "SOFT";
  return {
    id, kind: "point", label: c.label, ...gate(c), qty: c.qty ?? "1", unit: "point",
    role: fn, io, ...(dev ? { device_role_ref: dev } : {}), ...(c.params ? { params: c.params } : {}),
    responsibility: rowResponsibility("inf.points"),
    trade: c.trade ?? "controls",
    labor_task: hw ? { task: "point-checkout", driver: "per_hw_point" } : io === "SOFT" ? { task: "software-point", driver: "per_soft_point" } : { task: "network-point-mapping", driver: "per_net_point" },
    source: c.source,
  } as Line;
}

/** A device the typical needs; its responsibility is its role's matrix row. */
export function device(id: string, role: string, c: Common & { s223?: string }): Line {
  const params: Params = { ...(c.s223 ? { s223_class: `'${c.s223}'` } : {}), ...(c.params ?? {}) };
  return {
    id, kind: "device", label: c.label, ...gate(c), qty: c.qty ?? "1", unit: "ea",
    role: { vocab: "ot", id: role }, ...(Object.keys(params).length ? { params } : {}),
    responsibility: responsibility(role), trade: c.trade ?? tradeOf(role),
    labor_task: { task: "device-install", driver: "per_device" },
    source: c.source,
  } as Line;
}

/** A hook-up component: a role with size and end type, never a product. */
export function component(id: string, role: string, c: Common & { unit?: string }): Line {
  return {
    id, kind: "component", label: c.label, ...gate(c), qty: c.qty ?? "1", unit: c.unit ?? "ea",
    role: { vocab: "ot", id: role }, ...(c.params ? { params: c.params } : {}),
    responsibility: responsibility(role), trade: c.trade ?? tradeOf(role),
    labor_task: { task: "component-install", driver: "per_component_size_end" },
    source: c.source,
  } as Line;
}

/** A labor hook: a task and its driver. Hours are partner data, never here. */
export function labor(id: string, task: string, driver: string, c: Common & { round?: AssemblyLine["round"] }): Line {
  return {
    id, kind: "labor", label: c.label, ...gate(c), qty: c.qty ?? "1", unit: "task",
    ...(c.round ? { round: c.round } : {}),
    role: { vocab: "ot", id: task }, trade: c.trade ?? "controls", labor_task: { task, driver }, source: c.source,
  } as Line;
}

export function note(id: string, text: string, c: Omit<Common, "label">): Line {
  return { id, kind: "note", label: text, ...gate(c), qty: "1", unit: "note", role: { vocab: "ot", id: "note" }, trade: c.trade ?? "controls", source: c.source } as Line;
}

/** A sub-assembly (a part), expanded under this line. */
export function part(id: string, ref: string, c: Common): Line {
  return {
    id, kind: "assembly", label: c.label, ...gate(c), qty: c.qty ?? "1", unit: "ea",
    role: { vocab: "ot", id: ref }, ref: { id: ref }, trade: c.trade ?? "mechanical", source: c.source,
  } as Line;
}
