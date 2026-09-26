// ASSEMBLIES goal, WP1 — the canonical attribute schema per equipment family
// (plans/04-assemblies-plan.md §8.5; goals/ASSEMBLIES.md WP1).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. It is the one schema the structural
// normalizer (normalize.ts, WP2), the attribute eval, typical selection and
// every surface (Takeoff panel, MCP tools, exports) read: pure data plus unit
// arithmetic, no surface code.
//
// Scope: the 30 equipment families whose schedule attributes the
// opentakeoff-corpus/keys/*.attrs.csv keys cover (mcp/scripts/
// assemblies-baseline.mjs ATTR_KEY_FAMILIES). Valves, dampers, VFDs and air
// valves are selection roles with their own fields (WP7).
//
// Each family lists two kinds of attribute:
//   keyed       exactly the frozen key vocabulary (mcp/scripts/
//               assemblies-key-transcribe.mjs KEY_ATTRIBUTES); each maps to
//               the canonical attribute of the same id, and these are what
//               the attribute eval scores (GATE 1: mcp/test/assembliesSchema).
//   extensions  printed selectors that vocabulary cannot hold
//               (ASSEMBLIES_BUG_CATALOGUE AS-12, AS-13). The normalizer may
//               fill them; the current keys do not score them.
//
// Units: a number attribute has one canonical unit and accepts only printed
// units of the same dimension, each with an exact factor (48,400 BTU/H =
// 48.4 MBH; 745.7 W = 1 hp; 60 GPH = 1 GPM, a fuel-oil pump's flow).
// Temperatures accept °F only: °C would need an
// offset, and the keys type every bracketed SI column "-". A value is never
// converted across dimensions, and never guessed from a header that prints the
// wrong unit.
//
// Every attribute has a one-line definition and an example: the document and
// exact printed header a key (or, for an attribute outside the key
// vocabulary, a transcription column) takes it from. An attribute no keyed
// table prints says so instead of carrying an invented example; GATE 1 fails
// if a key later prints it, so the example has to be added then.
import { z } from "zod";

/** Canonical unit -> printed units it accepts, with the factor that turns a
 * printed value into the canonical unit. */
export const UNITS = {
  "": { "": 1 }, // counts: phase, quantities, rows, stages, speeds, MERV
  cfm: { cfm: 1 },
  gpm: { gpm: 1, GPH: 1 / 60 },
  F: { F: 1 },
  "%": { "%": 1 },
  MBH: { MBH: 1, "BTU/H": 0.001 },
  tons: { tons: 1 },
  kW: { kW: 1, W: 0.001 },
  hp: { hp: 1, W: 1 / 745.7 },
  W: { W: 1, hp: 745.7 },
  in: { in: 1 },
  ft: { ft: 1 },
  "in. w.c.": { "in. w.c.": 1, ft: 12 },
  "lb/hr": { "lb/hr": 1 },
  "pints/hr": { "pints/hr": 1 },
  psig: { psig: 1 },
  rpm: { rpm: 1 },
  V: { V: 1 },
} as const satisfies Record<string, Record<string, number>>;
export type CanonicalUnit = keyof typeof UNITS;

export type AttributeKind = "number" | "size" | "enum" | "text";
export interface AttributeExample {
  /** "key": a committed key's source_header for this attribute. "column": a
   * transcription column that prints it but types it "-" (the key vocabulary
   * has no attribute for it). */
  source: "key" | "column";
  set: string;
  header: string;
}
export interface AttributeSpec {
  kind: AttributeKind;
  unit: CanonicalUnit | null;
  values?: readonly string[];
  definition: string;
  example: AttributeExample | null;
  noExampleReason?: string;
}

const NO_EXAMPLE = "No committed key's table prints it (WP0.2's keys and the second tier's, AS-17).";

const ATTRIBUTE_TABLE = {
  area_served: { kind: "text", unit: null, definition: "The area, room or system the unit serves, as printed (AREA SERVED, SERVES, a SERVICE column naming an area).", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "AREA AND/OR BLDG SERVED" } },
  bas_interface: { kind: "text", unit: null, definition: "A printed network or BAS interface (BACNET, BACNET IP, a hardwired DDC interface, an existing BMS connection).", example: { source: "key", set: "itd-d1-lab", header: "NOTE 5, where the row's REMARKS cite it: PROVIDE BACnet INTEGRATION CARD" } },
  building: { kind: "text", unit: null, definition: "The building the unit serves or sits in, where a schedule column prints one (multi-building sets).", example: null, noExampleReason: NO_EXAMPLE },
  capacity_lb_hr: { kind: "number", unit: "lb/hr", definition: "Humidifier steam capacity.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "STEAM / FLOW / LBS/HR" } },
  capacity_mbh: { kind: "number", unit: "MBH", definition: "Heat exchanger capacity.", example: { source: "key", set: "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers", header: "MIN HEAT EXCHANGED / MBH" } },
  cells: { kind: "number", unit: "", definition: "Cooling tower cells.", example: { source: "key", set: "094_FL_Orange_County_Regional_History_Center_HVAC", header: "# Of Cells" } },
  cfm: { kind: "number", unit: "cfm", definition: "The unit's rated airflow: the design or high-speed CFM.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "AIR FLOW / CFM" } },
  cfm_heat: { kind: "number", unit: "cfm", definition: "Heating airflow of a terminal unit, where printed apart from the minimum.", example: { source: "key", set: "12_MT_MSU_ReidHall_Renovation", header: "DESIGN QUANTITIES / HOT: heating maximum" } },
  cfm_max: { kind: "number", unit: "cfm", definition: "Maximum (cooling) primary airflow of a terminal unit.", example: { source: "key", set: "federal-mech", header: "AIRSIDE DATA / MAXIMUM AIR FLOW CFM" } },
  cfm_min: { kind: "number", unit: "cfm", definition: "Minimum primary airflow of a terminal unit.", example: { source: "key", set: "federal-mech", header: "AIRSIDE DATA / MINIMUM AIR FLOW CFM" } },
  chw_conn_in: { kind: "number", unit: "in", definition: "Pipe connection (runout) size of the chilled-water coil, inches.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA / PIPING RUNOUT SIZE (IN)" } },
  chw_ewt_f: { kind: "number", unit: "F", definition: "Chilled water entering the cooling coil.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA / ENT. WTR TEMP (°F)" } },
  chw_glycol_pct: { kind: "number", unit: "%", definition: "Glycol in the chilled-water coil's fluid, percent (0 for water).", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "CHILLED WATER/DEHUMIDIFICATION COOLING COIL / FLUID TYPE" } },
  chw_gpm: { kind: "number", unit: "gpm", definition: "Chilled-water flow through the cooling coil.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA / GPM" } },
  chw_lwt_f: { kind: "number", unit: "F", definition: "Chilled water leaving the cooling coil.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA / EXT. WTR TEMP (°F)" } },
  chw_mbh: { kind: "number", unit: "MBH", definition: "The chilled-water coil's own capacity, where the coil (not the unit) carries it.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA / TOTAL MBH" } },
  chw_rows: { kind: "number", unit: "", definition: "Rows in the chilled-water coil.", example: { source: "key", set: "094_FL_Orange_County_Regional_History_Center_HVAC", header: "Cooling Coil / Air Data / Row/Fin. Per Ft.: rows part" } },
  chw_wpd_ft: { kind: "number", unit: "ft", definition: "Water pressure drop across the chilled-water coil, feet of water.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA / W. P.D. FT. HD." } },
  compressor_kw: { kind: "number", unit: "kW", definition: "A chiller's compressor input, where printed apart from its unit power.", example: { source: "column", set: "navfac-cherry-point-atc", header: "COMPRESSOR / kW" } },
  condenser: { kind: "enum", unit: null, values: ["air", "water"], definition: "Chiller condenser: air- or water-cooled.", example: { source: "key", set: "navfac-cherry-point-atc", header: "TABLE TITLE" } },
  conn_in: { kind: "number", unit: "in", definition: "The pipe connection the unit's hook-up is sized to (a pump's suction, a coil's runout or connection), inches.", example: { source: "key", set: "itd-d1-lab", header: "PIPING RUNOUT SIZE: the coil hook-up's pipe size" } },
  control: { kind: "text", unit: null, definition: "Printed fan speed or volume control (VARIABLE, CV, a speed controller).", example: { source: "key", set: "040_IL_VA_Solicitation_36C77623B0051_Expand_Sterile", header: "CONTROL TYPE" } },
  cooling_mbh: { kind: "number", unit: "MBH", definition: "Total cooling capacity; in an air handler, the cooling coil block's total.", example: { source: "key", set: "004_MO_T2504_03_Interior_and_Exterior_Renovation", header: "COOLING / CAPACITY (MBH) / TOTAL" } },
  cooling_tons: { kind: "number", unit: "tons", definition: "Nominal cooling capacity in tons.", example: { source: "key", set: "federal-mech", header: "NOMINAL CAPACITY TONS" } },
  cooling_type: { kind: "enum", unit: null, values: ["chw", "dx", "none"], definition: "Cooling source: chilled water, DX or none.", example: { source: "key", set: "navfac-cherry-point-atc", header: "COOLING COIL DATA" } },
  drive: { kind: "enum", unit: null, values: ["direct", "belt"], definition: "Fan drive: direct or belt.", example: { source: "key", set: "itd-d1-lab", header: "BLOWER / DRIVE" } },
  dx_stages: { kind: "number", unit: "", definition: "Stages of DX cooling.", example: { source: "key", set: "024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri", header: "DX COOLING / COMPRESSOR / STAGES" } },
  ecm: { kind: "enum", unit: null, values: ["yes", "no"], definition: "Whether the fan motor is an electronically commutated (EC) motor.", example: { source: "key", set: "navfac-cherry-point-atc", header: "NOTE 3" } },
  economizer: { kind: "enum", unit: null, values: ["airside", "none", "waterside"], definition: "Economizer type: airside, waterside or none.", example: { source: "key", set: "004_MO_T2504_03_Interior_and_Exterior_Renovation", header: "NOTE 12, where the row's NOTES cite it: COMPARATIVE ENTHALPY ECONOMIZER WITH BAROMETRIC RELIEF DAMPER" } },
  eh_kw: { kind: "number", unit: "kW", definition: "Electric heating capacity; a value printed in watts converts.", example: { source: "key", set: "itd-d1-lab", header: "ELECTRICAL / KW" } },
  eh_stages: { kind: "number", unit: "", definition: "Stages (steps) of electric heat.", example: null, noExampleReason: NO_EXAMPLE },
  energy_recovery: { kind: "enum", unit: null, values: ["wheel", "plate", "heat_pipe", "runaround", "none"], definition: "Energy recovery type: wheel, plate, heat pipe, runaround or none.", example: { source: "key", set: "navfac-cherry-point-atc", header: "ENERGY WHEEL DATA" } },
  esp_in: { kind: "number", unit: "in. w.c.", definition: "External static pressure, inches of water column; a value printed in feet of water converts (1 ft = 12 in.).", example: { source: "key", set: "itd-d1-lab", header: "BLOWER / ESP" } },
  ewt_f: { kind: "number", unit: "F", definition: "Water entering a boiler or tower.", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "EWT (°F)" } },
  exhaust_cfm: { kind: "number", unit: "cfm", definition: "Exhaust airflow of an energy recovery ventilator.", example: { source: "key", set: "baker-county-eoc", header: "EXHAUST AIR / AIRFLOW (CFM)" } },
  exhaust_fan_hp: { kind: "number", unit: "hp", definition: "Horsepower of each exhaust fan motor.", example: { source: "key", set: "navfac-cherry-point-atc", header: "EXHAUST FAN / MIN. MOTOR HP" } },
  fan_cfm: { kind: "number", unit: "cfm", definition: "A fan-powered terminal's own fan airflow (apart from its primary airflow).", example: { source: "column", set: "navfac-cherry-point-atc", header: "FAN AIRFLOW (CFM)" } },
  fan_hp: { kind: "number", unit: "hp", definition: "Cooling tower fan motor horsepower.", example: { source: "key", set: "094_FL_Orange_County_Regional_History_Center_HVAC", header: "Fan Motor Data / HP" } },
  fan_qty: { kind: "number", unit: "", definition: "Fans (fan motors) in a packaged unit.", example: { source: "column", set: "navfac-cherry-point-atc", header: "FAN / FAN MOTOR (QTY) HP" } },
  fan_speeds: { kind: "number", unit: "", definition: "Fan speeds printed for the unit (3 from '3 SPEED').", example: { source: "key", set: "federal-mech", header: "AIRSIDE DATA / VOLUME CONTROL" } },
  filter_merv: { kind: "number", unit: "", definition: "MERV rating of the final (highest-rated) filter.", example: { source: "key", set: "004_MO_T2504_03_Interior_and_Exterior_Renovation", header: "SUPPLY FAN / FILTER: MERV" } },
  floor: { kind: "text", unit: null, definition: "The level the unit is on: a LOCATION cell naming a level (ROOF, BASEMENT, LEVEL 2), or the plan sheet its tag is drawn on (tag census, read-only).", example: { source: "key", set: "federal-mech", header: "LOCATION names a level" } },
  fuel: { kind: "enum", unit: null, values: ["gas", "oil", "electric", "dual_fuel", "propane"], definition: "Boiler fuel: gas, oil, electric, dual fuel or propane.", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "FUEL" } },
  gas_input_mbh: { kind: "number", unit: "MBH", definition: "Gas input rate of a gas-fired heating section; BTU/H converts.", example: { source: "key", set: "024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri", header: "NATURAL GAS HEATING / INPUT (MBH)" } },
  glycol_pct: { kind: "number", unit: "%", definition: "Glycol in the pumped fluid, percent (0 for water).", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "NOTE 3" } },
  gpm: { kind: "number", unit: "gpm", definition: "Design water flow of a pump, boiler or tower.", example: { source: "key", set: "navfac-cherry-point-atc", header: "FLOW (GPM)" } },
  head_ft: { kind: "number", unit: "ft", definition: "Pump head, feet of water.", example: { source: "key", set: "navfac-cherry-point-atc", header: "TDH (FT WC)" } },
  heat_type: { kind: "enum", unit: null, values: ["hw", "electric", "steam", "none"], definition: "Terminal reheat type: hot water, electric, steam or none.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA" } },
  heating_mbh: { kind: "number", unit: "MBH", definition: "Heating capacity: a heating coil's or heater's output; a value printed in BTU/H converts.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "TOTAL MIN CAPACITY / MBH" } },
  heating_medium: { kind: "enum", unit: null, values: ["hw", "steam", "electric", "gas"], definition: "Heating medium of a heater: hot water, steam, electric or gas.", example: { source: "key", set: "itd-d1-lab", header: "TABLE TITLE" } },
  heating_type: { kind: "enum", unit: null, values: ["hw", "steam", "gas", "electric", "heat_pump", "none"], definition: "Heating source: hot water, steam, gas, electric, heat pump or none.", example: { source: "key", set: "navfac-cherry-point-atc", header: "HEATING COIL DATA: a hot water coil, or \"-\" in every cell" } },
  humidifier: { kind: "enum", unit: null, values: ["yes", "no"], definition: "Whether the unit includes a humidifier section.", example: { source: "key", set: "094_FL_Orange_County_Regional_History_Center_HVAC", header: "Unit Components: HF (ELECTRIC HUMIDIFIER SECTION) present" } },
  humidifier_type: { kind: "enum", unit: null, values: ["steam_to_steam", "electrode", "resistive", "gas_fired", "direct_injection", "evaporative", "atomizing"], definition: "Humidifier type: steam-to-steam, electrode, resistive, gas-fired, direct injection, evaporative or atomizing.", example: { source: "key", set: "navfac-cherry-point-atc", header: "TYPE" } },
  hw_conn_in: { kind: "number", unit: "in", definition: "Pipe connection (runout) size of the hot-water coil, inches.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA / PIPE CONNECTION SIZE IN" } },
  hw_ewt_f: { kind: "number", unit: "F", definition: "Hot water entering the heating coil.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA / EWT (°F)" } },
  hw_glycol_pct: { kind: "number", unit: "%", definition: "Glycol in the hot-water coil's fluid, percent (0 for water).", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "HEATING COIL / FLUID TYPE" } },
  hw_gpm: { kind: "number", unit: "gpm", definition: "Hot-water flow through the heating coil.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA / FLOW (GPM)" } },
  hw_lwt_f: { kind: "number", unit: "F", definition: "Hot water leaving the heating coil.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA / LWT (°F)" } },
  hw_mbh: { kind: "number", unit: "MBH", definition: "The hot-water coil's own capacity, where the coil (not the unit) carries it; BTU/H converts.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA / SENSIBLE CAPACITY (BTU/HR)" } },
  hw_rows: { kind: "number", unit: "", definition: "Rows in the hot-water coil.", example: { source: "key", set: "navfac-cherry-point-atc", header: "PREHEAT COIL / # OF ROWS" } },
  hw_wpd_ft: { kind: "number", unit: "ft", definition: "Water pressure drop across the hot-water coil, feet of water.", example: { source: "key", set: "federal-mech", header: "HYDRONIC REHEAT COIL DATA / MAX WATER PD FT. H20" } },
  hx_type: { kind: "enum", unit: null, values: ["plate", "shell_and_tube"], definition: "Heat exchanger type: plate or shell-and-tube.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "TYPE" } },
  inlet_size_in: { kind: "size", unit: "in", definition: "Terminal inlet size in inches: a round diameter, or a rectangular width x height.", example: { source: "key", set: "federal-mech", header: "INLET DIAMETER" } },
  input_mbh: { kind: "number", unit: "MBH", definition: "Boiler input capacity.", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "CAPACITY / INPUT MBH" } },
  kw_input: { kind: "number", unit: "kW", definition: "Electrical input at design (a chiller's unit power, a condensing unit's maximum kW).", example: { source: "key", set: "navfac-cherry-point-atc", header: "ELECTRICAL / UNIT POWER (kW)" } },
  lwt_f: { kind: "number", unit: "F", definition: "Water leaving a boiler or tower.", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "LWT (°F)" } },
  moisture_removal_pints_hr: { kind: "number", unit: "pints/hr", definition: "A dehumidifier's moisture removal capacity.", example: { source: "column", set: "navfac-cherry-point-atc", header: "CAPACITY PINTS/HR" } },
  motor_hp: { kind: "number", unit: "hp", definition: "Horsepower of the unit's fan or pump motor; a motor printed in watts converts (745.7 W = 1 hp).", example: { source: "key", set: "navfac-cherry-point-atc", header: "ELECTRICAL / MOTOR HP" } },
  motor_watts: { kind: "number", unit: "W", definition: "A fan motor rated in watts; a value printed in hp converts.", example: { source: "key", set: "itd-d1-lab", header: "ELECTRICAL / HP/W" } },
  oa_cfm_min: { kind: "number", unit: "cfm", definition: "Minimum (design) outdoor airflow.", example: { source: "key", set: "004_MO_T2504_03_Interior_and_Exterior_Renovation", header: "SUPPLY FAN / OA CFM: design minimum outdoor air" } },
  outdoor_air_pct: { kind: "number", unit: "%", definition: "Minimum outdoor air as a percent of supply airflow.", example: { source: "key", set: "14_OR_KlamathCC_LearningCtr_Mechanical", header: "NOTE 2" } },
  output_mbh: { kind: "number", unit: "MBH", definition: "Boiler output capacity.", example: { source: "key", set: "069_ID_ITD_District_2_Laboratory_Heating_Upgrades", header: "CAPACITY / OUTPUT MBH" } },
  phase: { kind: "number", unit: "", definition: "Phase of the unit's power connection (1 or 3).", example: { source: "key", set: "navfac-cherry-point-atc", header: "ELECTRICAL / VOLTS/PH/HZ: phase part" } },
  pipes: { kind: "number", unit: "", definition: "Pipes to a fan coil: 2 or 4.", example: { source: "key", set: "092_IL_Guaranteed_Rate_Field_HVAC_AHU_Renovation", header: "TABLE TITLE" } },
  primary_conn_in: { kind: "number", unit: "in", definition: "Primary-side connection size of a heat exchanger, inches.", example: { source: "key", set: "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers", header: "NOTE 5" } },
  primary_ewt_f: { kind: "number", unit: "F", definition: "Primary-side water entering a heat exchanger.", example: { source: "key", set: "14_OR_KlamathCC_LearningCtr_Mechanical", header: "HOT SIDE / INLET TEMP (ºF)" } },
  primary_gpm: { kind: "number", unit: "gpm", definition: "Primary-side water flow of a heat exchanger.", example: { source: "key", set: "14_OR_KlamathCC_LearningCtr_Mechanical", header: "HOT SIDE / FLOW (GPM)" } },
  primary_lwt_f: { kind: "number", unit: "F", definition: "Primary-side water leaving a heat exchanger.", example: { source: "key", set: "14_OR_KlamathCC_LearningCtr_Mechanical", header: "HOT SIDE / OUTLET TEMP (ºF)" } },
  primary_medium: { kind: "enum", unit: null, values: ["chw", "hw", "steam", "cw", "glycol", "domestic_water", "condenser_water", "other"], definition: "Medium on the exchanger's primary (source) side.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "TABLE TITLE" } },
  primary_steam_lb_hr: { kind: "number", unit: "lb/hr", definition: "Steam flow of a steam-to-water exchanger.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "CONTROL VALVE / LBS/HR" } },
  primary_steam_psig: { kind: "number", unit: "psig", definition: "Steam pressure supplied to a steam-to-water exchanger (entering its control valve), psig.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "STEAM PRESSURE / ENT CONTROL VALVE / PSIG: the supply steam pressure" } },
  pump_arrangement: { kind: "enum", unit: null, values: ["duty", "standby", "duty_standby", "parallel", "lead_lag"], definition: "Pump arrangement: duty, standby, duty/standby, parallel or lead/lag.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "REMARKS: DUTY/STANDBY" } },
  qty: { kind: "number", unit: "", definition: "Units under one mark where the schedule prints a quantity (never the count of marks).", example: { source: "key", set: "bldg5406-hvac-demo", header: "QTY." } },
  recovery_type: { kind: "enum", unit: null, values: ["wheel", "plate", "heat_pipe", "runaround"], definition: "Energy recovery ventilator core: wheel, plate, heat pipe or runaround.", example: { source: "key", set: "16_NV_CarsonValleyMS_HVAC_Replacement", header: "NOTE 1 of the GENERAL NOTES and UNIT FEATURE 4: the recovery type" } },
  return_cfm: { kind: "number", unit: "cfm", definition: "Return (or relief) airflow of an air handler.", example: { source: "column", set: "federal-mech", header: "AIRFLOW / DESIGN RETURN AIRFLOW" } },
  return_fan_hp: { kind: "number", unit: "hp", definition: "Horsepower of each return or relief fan motor.", example: { source: "key", set: "088_AZ_Phoenix_Sky_Harbor_International_Airport_PHX", header: "RETURN FAN / FAN HP" } },
  return_fan_qty: { kind: "number", unit: "", definition: "Return or relief fans in an air handler.", example: { source: "column", set: "federal-mech", header: "RELIEF FAN / RF QTY" } },
  rpm: { kind: "number", unit: "rpm", definition: "Rotational speed as printed (a fan's or motor's).", example: { source: "key", set: "federal-mech", header: "MOTOR DATA / RPM" } },
  secondary_conn_in: { kind: "number", unit: "in", definition: "Secondary-side connection size of a heat exchanger, inches.", example: { source: "key", set: "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers", header: "NOTE 5" } },
  secondary_ewt_f: { kind: "number", unit: "F", definition: "Secondary-side water entering a heat exchanger.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "WATER CONDITIONS / EWT / °F" } },
  secondary_gpm: { kind: "number", unit: "gpm", definition: "Secondary-side water flow of a heat exchanger.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "WATER CONDITIONS / FLOW / GPM" } },
  secondary_lwt_f: { kind: "number", unit: "F", definition: "Secondary-side water leaving a heat exchanger.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "WATER CONDITIONS / LWT / °F" } },
  secondary_medium: { kind: "enum", unit: null, values: ["chw", "hw", "steam", "cw", "glycol", "domestic_water", "condenser_water", "other"], definition: "Medium on the exchanger's secondary (load) side.", example: { source: "key", set: "031_MO_VA_Project_589A4_20_158_Renovate_Warehouse_for", header: "SYSTEM AND/OR SERVICE" } },
  service: { kind: "text", unit: null, definition: "The system or service a pump or fan is scheduled for, as printed.", example: { source: "key", set: "navfac-cherry-point-atc", header: "SERVICE" } },
  source_ewt_f: { kind: "number", unit: "F", definition: "Source-loop water entering a water-source heat pump.", example: { source: "column", set: "018_GA_USDA_ARS_U_S_National_Poultry_Research_Center", header: "COOLING / WATER SIDE / EWT (°F)" } },
  source_gpm: { kind: "number", unit: "gpm", definition: "Source-loop water flow of a water-source heat pump.", example: { source: "column", set: "018_GA_USDA_ARS_U_S_National_Poultry_Research_Center", header: "COOLING / WATER SIDE / FLOW (GPM)" } },
  source_lwt_f: { kind: "number", unit: "F", definition: "Source-loop water leaving a water-source heat pump.", example: { source: "column", set: "018_GA_USDA_ARS_U_S_National_Poultry_Research_Center", header: "COOLING / WATER SIDE / LWT (°F)" } },
  source_wpd_ft: { kind: "number", unit: "ft", definition: "Source-loop water pressure drop of a water-source heat pump, feet of water.", example: { source: "column", set: "018_GA_USDA_ARS_U_S_National_Poultry_Research_Center", header: "COOLING / WATER SIDE / WPD (FT)" } },
  steam_lb_hr: { kind: "number", unit: "lb/hr", definition: "Steam flow (condensate load) of a steam coil.", example: { source: "key", set: "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers", header: "TRAP / LBS/HR: the heater's condensate load" } },
  steam_psig: { kind: "number", unit: "psig", definition: "Steam pressure supplied to a steam coil, psig.", example: { source: "key", set: "044_NY_VA_Project_528A8_17_805_Replace_Main_Boilers", header: "PRESS ENT HEATER / PSIG" } },
  supply_cfm: { kind: "number", unit: "cfm", definition: "Supply airflow of an air handler: the design or maximum.", example: { source: "key", set: "004_MO_T2504_03_Interior_and_Exterior_Renovation", header: "SUPPLY FAN / CFM" } },
  supply_fan_hp: { kind: "number", unit: "hp", definition: "Horsepower of each supply fan motor.", example: { source: "key", set: "004_MO_T2504_03_Interior_and_Exterior_Renovation", header: "SUPPLY FAN / HP" } },
  supply_fan_qty: { kind: "number", unit: "", definition: "Supply fans in the unit.", example: { source: "key", set: "024_MO_E2508_01_Replace_Steam_Heating_Units_Missouri", header: "SUPPLY / MOTOR QUANTITY" } },
  terminals_served: { kind: "number", unit: "", definition: "Terminal units (VAV, fan-powered and dual-duct boxes) whose schedules name this unit as the air handler serving them; counted when the typicals are applied, never read from this unit's own row.", example: null, noExampleReason: "Derived when typicals are applied (WP5) from the terminal schedules that name the unit; no schedule column prints it." },
  terminal_type: { kind: "enum", unit: null, values: ["single_duct", "fan_powered_series", "fan_powered_parallel", "dual_duct", "exhaust", "induction", "chilled_beam"], definition: "Terminal unit type: single duct, series or parallel fan powered, dual duct, exhaust, induction or chilled beam.", example: { source: "key", set: "navfac-cherry-point-atc", header: "UNIT TYPE" } },
  tons: { kind: "number", unit: "tons", definition: "Chiller or tower capacity in tons.", example: { source: "key", set: "navfac-cherry-point-atc", header: "CAPACITY (TONS)" } },
  vfd: { kind: "enum", unit: null, values: ["yes", "no"], definition: "Whether the motor (or each fan's motor) runs on a variable frequency drive.", example: { source: "key", set: "navfac-cherry-point-atc", header: "ELECTRICAL / SPEED CONTROL: VFD, or an ECM motor with no VFD" } },
  volts: { kind: "number", unit: "V", definition: "Nominal voltage of the unit's power connection.", example: { source: "key", set: "navfac-cherry-point-atc", header: "ELECTRICAL / VOLTS/PH/HZ: volts part" } },
} as const satisfies Record<string, AttributeSpec>;

export type AttributeId = keyof typeof ATTRIBUTE_TABLE;
/** Every canonical attribute, by id. */
export const ATTRIBUTES: Readonly<Record<string, AttributeSpec>> = ATTRIBUTE_TABLE;

const FAMILY_ATTRIBUTES: Record<string, { keyed: readonly string[]; extensions: readonly string[] }> = {
  AHU: { keyed: ["building", "floor", "area_served", "qty", "supply_cfm", "oa_cfm_min", "supply_fan_hp", "supply_fan_qty", "return_fan_hp", "exhaust_fan_hp", "vfd", "economizer", "outdoor_air_pct", "cooling_type", "cooling_mbh", "cooling_tons", "dx_stages", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "steam_psig", "steam_lb_hr", "gas_input_mbh", "eh_kw", "humidifier", "energy_recovery", "filter_merv", "bas_interface", "volts", "phase"], extensions: ["ecm", "return_cfm", "return_fan_qty", "exhaust_cfm", "terminals_served"] },
  AIR_COOLED_CHILLER: { keyed: ["building", "floor", "area_served", "qty", "condenser", "tons", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "kw_input", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  BOILER: { keyed: ["building", "floor", "area_served", "qty", "fuel", "input_mbh", "output_mbh", "gpm", "ewt_f", "lwt_f", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  CABINET_UNIT_HEATER: { keyed: ["building", "floor", "area_served", "qty", "heating_medium", "cfm", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "steam_psig", "steam_lb_hr", "eh_kw", "motor_hp", "conn_in", "volts", "phase"], extensions: ["bas_interface"] },
  CONDENSING_UNIT: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: ["kw_input"] },
  COOLING_TOWER: { keyed: ["building", "floor", "area_served", "qty", "cells", "tons", "gpm", "ewt_f", "lwt_f", "fan_hp", "vfd", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  CRAH: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: ["fan_qty"] },
  DEHUMIDIFIER: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: ["moisture_removal_pints_hr"] },
  DOAH_HANDLING: { keyed: ["building", "floor", "area_served", "qty", "supply_cfm", "oa_cfm_min", "supply_fan_hp", "supply_fan_qty", "return_fan_hp", "exhaust_fan_hp", "vfd", "economizer", "outdoor_air_pct", "cooling_type", "cooling_mbh", "cooling_tons", "dx_stages", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "steam_psig", "steam_lb_hr", "gas_input_mbh", "eh_kw", "humidifier", "energy_recovery", "filter_merv", "bas_interface", "volts", "phase"], extensions: ["ecm", "return_cfm", "return_fan_qty", "exhaust_cfm", "terminals_served"] },
  DOAH_UNIT: { keyed: ["building", "floor", "area_served", "qty", "supply_cfm", "oa_cfm_min", "supply_fan_hp", "supply_fan_qty", "return_fan_hp", "exhaust_fan_hp", "vfd", "economizer", "outdoor_air_pct", "cooling_type", "cooling_mbh", "cooling_tons", "dx_stages", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "steam_psig", "steam_lb_hr", "gas_input_mbh", "eh_kw", "humidifier", "energy_recovery", "filter_merv", "bas_interface", "volts", "phase"], extensions: ["ecm", "return_cfm", "return_fan_qty", "exhaust_cfm", "terminals_served"] },
  DOAS: { keyed: ["building", "floor", "area_served", "qty", "supply_cfm", "oa_cfm_min", "supply_fan_hp", "supply_fan_qty", "return_fan_hp", "exhaust_fan_hp", "vfd", "economizer", "outdoor_air_pct", "cooling_type", "cooling_mbh", "cooling_tons", "dx_stages", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "steam_psig", "steam_lb_hr", "gas_input_mbh", "eh_kw", "humidifier", "energy_recovery", "filter_merv", "bas_interface", "volts", "phase"], extensions: ["ecm", "return_cfm", "return_fan_qty", "exhaust_cfm", "terminals_served"] },
  DUCT_MOUNTED_COIL: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  ERV: { keyed: ["building", "floor", "area_served", "qty", "recovery_type", "supply_cfm", "exhaust_cfm", "supply_fan_hp", "exhaust_fan_hp", "volts", "phase"], extensions: [] },
  FAN: { keyed: ["building", "floor", "area_served", "qty", "service", "cfm", "esp_in", "motor_hp", "motor_watts", "rpm", "drive", "vfd", "ecm", "control", "volts", "phase"], extensions: [] },
  FCU: { keyed: ["building", "floor", "area_served", "qty", "pipes", "cfm", "motor_hp", "fan_speeds", "ecm", "cooling_type", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "eh_kw", "volts", "phase"], extensions: ["cooling_mbh", "heating_mbh", "gas_input_mbh"] },
  FIN_TUBE_RADIATION: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  FURNACE: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  HEAT_EXCHANGER: { keyed: ["building", "floor", "area_served", "qty", "hx_type", "primary_medium", "secondary_medium", "primary_gpm", "primary_ewt_f", "primary_lwt_f", "secondary_gpm", "secondary_ewt_f", "secondary_lwt_f", "capacity_mbh", "primary_conn_in", "secondary_conn_in", "primary_steam_psig", "primary_steam_lb_hr"], extensions: [] },
  HEAT_PUMP: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: ["source_gpm", "source_ewt_f", "source_lwt_f", "source_wpd_ft"] },
  HEAT_RECOVERY_CHILLER: { keyed: ["building", "floor", "area_served", "qty", "condenser", "tons", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "kw_input", "conn_in", "bas_interface", "volts", "phase"], extensions: ["compressor_kw"] },
  HUMIDIFIER: { keyed: ["building", "floor", "area_served", "qty", "humidifier_type", "capacity_lb_hr", "eh_kw", "volts", "phase"], extensions: ["bas_interface"] },
  OUTDOOR_AIR_UNIT: { keyed: ["building", "floor", "area_served", "qty", "supply_cfm", "oa_cfm_min", "supply_fan_hp", "supply_fan_qty", "return_fan_hp", "exhaust_fan_hp", "vfd", "economizer", "outdoor_air_pct", "cooling_type", "cooling_mbh", "cooling_tons", "dx_stages", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "steam_psig", "steam_lb_hr", "gas_input_mbh", "eh_kw", "humidifier", "energy_recovery", "filter_merv", "bas_interface", "volts", "phase"], extensions: ["ecm", "return_cfm", "return_fan_qty", "exhaust_cfm", "terminals_served"] },
  PUMP: { keyed: ["building", "floor", "area_served", "qty", "service", "gpm", "head_ft", "motor_hp", "rpm", "vfd", "pump_arrangement", "glycol_pct", "conn_in", "volts", "phase"], extensions: [] },
  RADIANT_CEILING_PANEL: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  RAH: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  RTU: { keyed: ["building", "floor", "area_served", "qty", "supply_cfm", "oa_cfm_min", "supply_fan_hp", "supply_fan_qty", "return_fan_hp", "exhaust_fan_hp", "vfd", "economizer", "outdoor_air_pct", "cooling_type", "cooling_mbh", "cooling_tons", "dx_stages", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "chw_wpd_ft", "chw_mbh", "chw_rows", "chw_conn_in", "chw_glycol_pct", "heating_type", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "steam_psig", "steam_lb_hr", "gas_input_mbh", "eh_kw", "humidifier", "energy_recovery", "filter_merv", "bas_interface", "volts", "phase"], extensions: ["ecm", "return_cfm", "return_fan_qty", "exhaust_cfm", "terminals_served"] },
  UNIT_HEATER: { keyed: ["building", "floor", "area_served", "qty", "heating_medium", "cfm", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "steam_psig", "steam_lb_hr", "eh_kw", "motor_hp", "conn_in", "volts", "phase"], extensions: ["bas_interface"] },
  VAV: { keyed: ["building", "floor", "area_served", "terminal_type", "inlet_size_in", "cfm_max", "cfm_min", "cfm_heat", "heat_type", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "hw_wpd_ft", "hw_mbh", "hw_rows", "hw_conn_in", "hw_glycol_pct", "eh_kw", "eh_stages", "motor_hp", "ecm", "volts", "phase"], extensions: ["fan_cfm"] },
  VRF_INDOOR: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
  VRF_OUTDOOR: { keyed: ["building", "floor", "area_served", "qty", "cfm", "cooling_mbh", "cooling_tons", "heating_mbh", "hw_gpm", "hw_ewt_f", "hw_lwt_f", "chw_gpm", "chw_ewt_f", "chw_lwt_f", "motor_hp", "eh_kw", "conn_in", "bas_interface", "volts", "phase"], extensions: [] },
};


/** The 30 equipment families the schema covers, in the key vocabulary's order. */
export const ASSEMBLY_FAMILIES: readonly string[] = Object.keys(FAMILY_ATTRIBUTES);

const exampleSchema = z.object({ source: z.enum(["key", "column"]), set: z.string().min(1), header: z.string().min(1) });
const attributeSpecSchema = z.object({
  kind: z.enum(["number", "size", "enum", "text"]),
  unit: z.string().nullable(),
  values: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/)).min(2).optional(),
  definition: z.string().min(20).regex(/^[^\n]+$/),
  example: exampleSchema.nullable(),
  noExampleReason: z.string().min(10).optional(),
}).strict().superRefine((s, ctx) => {
  const numeric = s.kind === "number" || s.kind === "size";
  if (numeric !== (s.unit !== null)) ctx.addIssue({ code: "custom", message: "a number or size has a unit; nothing else does" });
  if (s.unit !== null && !(s.unit in UNITS)) ctx.addIssue({ code: "custom", message: `unit "${s.unit}" is not canonical` });
  if ((s.kind === "enum") !== (s.values !== undefined)) ctx.addIssue({ code: "custom", message: "only an enum lists values" });
  if ((s.example === null) !== (s.noExampleReason !== undefined)) ctx.addIssue({ code: "custom", message: "an example, or the reason there is none" });
});

/** Throws with every problem if the schema is malformed (tests call it; the
 * UI never needs to). */
export function validateAttributeSchema(): void {
  const problems: string[] = [];
  for (const [id, spec] of Object.entries(ATTRIBUTES)) {
    const r = attributeSpecSchema.safeParse(spec);
    if (!r.success) problems.push(`${id}: ${r.error.issues.map((i) => i.message).join("; ")}`);
  }
  for (const [family, { keyed, extensions }] of Object.entries(FAMILY_ATTRIBUTES)) {
    for (const id of [...keyed, ...extensions]) if (!(id in ATTRIBUTES)) problems.push(`${family}.${id}: no such attribute`);
    for (const id of extensions) if (keyed.includes(id)) problems.push(`${family}.${id}: both keyed and an extension`);
  }
  if (problems.length) throw new Error(`attribute schema: ${problems.join(" | ")}`);
}

/** A family's attributes: the keyed ones (scored today), the extensions, and all. */
export function familyAttributes(family: string): { keyed: readonly string[]; extensions: readonly string[]; all: readonly string[] } {
  const f = FAMILY_ATTRIBUTES[family];
  if (!f) throw new Error(`${family} is not an assemblies equipment family`);
  return { keyed: f.keyed, extensions: f.extensions, all: [...f.keyed, ...f.extensions] };
}

export function attributeSpec(id: string): AttributeSpec {
  const spec = ATTRIBUTES[id];
  if (!spec) throw new Error(`unknown canonical attribute "${id}"`);
  return spec;
}

/** Factor turning a value printed in `unit` into `id`'s canonical unit. */
export function unitFactor(id: string, unit: string): number {
  const spec = attributeSpec(id);
  if (spec.unit === null) throw new Error(`"${id}" is not a number attribute`);
  const factor = (UNITS[spec.unit] as Record<string, number>)[unit];
  if (factor === undefined) throw new Error(`"${id}" (${spec.unit || "a count"}) does not accept unit "${unit}"`);
  return factor;
}

/** A printed number, in the unit it was printed in, as `id`'s canonical value. */
export function toCanonical(id: string, value: number, unit: string): number {
  const spec = attributeSpec(id);
  if (spec.kind !== "number") throw new Error(`"${id}" is not a number attribute`);
  return value * unitFactor(id, unit);
}

/** The canonical attribute a key-vocabulary attribute of `family` maps to:
 * the attribute of the same id, which must be keyed for that family. */
export function canonicalAttributeFor(family: string, keyAttribute: string): string {
  const { keyed } = familyAttributes(family);
  if (!keyed.includes(keyAttribute)) throw new Error(`${family}.${keyAttribute} is not in the frozen key vocabulary`);
  return keyAttribute;
}

/** A key line's value in canonical form: a number in the canonical unit, a
 * size string ("8" or "10x8", inches), an enum value, or text. */
export function keyValueToCanonical(family: string, keyAttribute: string, value: string, unit: string): number | string {
  const id = canonicalAttributeFor(family, keyAttribute);
  const spec = attributeSpec(id);
  if (spec.kind === "number") {
    const n = Number(value);
    if (value.trim() === "" || !Number.isFinite(n)) throw new Error(`${family}.${keyAttribute}: "${value}" is not a number`);
    return toCanonical(id, n, unit);
  }
  if (spec.kind === "size") {
    unitFactor(id, unit);
    if (!/^\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?$/.test(value)) throw new Error(`${family}.${keyAttribute}: "${value}" is not a size`);
    return value;
  }
  if (spec.kind === "enum" && !spec.values!.includes(value)) throw new Error(`${family}.${keyAttribute}: "${value}" is not one of ${spec.values!.join("/")}`);
  return value;
}
