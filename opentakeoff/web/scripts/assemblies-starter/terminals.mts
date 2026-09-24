// ASSEMBLIES WP4 — starter typicals for terminal units (research 02 §3b,
// typicals 1–6 and 25): ASHRAE G36 terminal-unit I/O from the Modelica
// Buildings Library, UFGS 23 09 93 §3.3 sequences, UFC 3-410-01 Table 3-1.
import { device, labor, note, point, src, type Line } from "./common.mts";

export const xeto = (id: string) => ({ vocab: "xeto" as const, id });
export const ot = (id: string) => ({ vocab: "ot" as const, id });

/** A terminal unit's single-duct test, which a type the schedule does not
 * print leaves open (an unprinted type is a single-duct box). */
export const SINGLE_DUCT = "(not known(attr.terminal_type) or attr.terminal_type = 'single_duct')";

export const ZONE_OPTIONS = [
  { id: "co2_sensor", label: "Zone CO2 sensor (demand-controlled ventilation)", default: false, note: "UFC 3-410-01 §3-2.4.1 (401.1): Army and Air Force projects may not use CO2 sensors for ventilation control without approval." },
  { id: "occupancy_sensor", label: "Zone occupancy sensor", default: false },
  { id: "window_switch", label: "Window switch", default: false },
  { id: "setpoint_adjust", label: "Occupant setpoint adjustment at the zone sensor", default: true, note: "UFC 3-410-01 Table 3-1 lists the effective setpoint \"incorporating setpoint adjustment\"; the G36 zone setpoints (MBL ThermalZones/Setpoints) adjust locally by default." },
];

/** The zone's sensors, which every G36 terminal unit reads. `block` is the
 * terminal controller that declares them. */
export function zoneLines(block: string, opts: { co2?: boolean } = {}): Line[] {
  const co2 = opts.co2 ?? true;
  return [
    device("space-sensor", "space-sensor", { label: "Zone temperature sensor (wall module)", s223: "TemperatureSensor", params: { adjust: "opt.setpoint_adjust" }, source: src.mbl(block, "TZon") }),
    point("zone-temp", "AI", xeto("ZoneAirTempSensor"), "space-sensor", { label: "Zone temperature", source: src.mbl(block, "TZon") }),
    point("setpoint-adjust", "AI", ot("zone-setpoint-adjust"), "space-sensor", { when: "opt.setpoint_adjust", label: "Zone setpoint adjustment", source: src.mbl("ThermalZones/Setpoints", "setAdj") }),
    point("effective-setpoint", "SOFT", xeto("ZoneAirTempSp"), null, { label: "Effective zone temperature setpoint (heating/cooling), incorporating the adjustment", source: src.ufc("vs-09") }),
    ...(co2 ? [
      device("co2-sensor", "co2-sensor", { when: "opt.co2_sensor", label: "Zone CO2 sensor", s223: "ConcentrationSensor", params: { form: "'space'" }, source: src.mbl(block, "ppmCO2") }),
      point("zone-co2", "AI", xeto("ZoneCo2Sensor"), "co2-sensor", { when: "opt.co2_sensor", label: "Zone CO2 concentration", source: src.mbl(block, "ppmCO2") }),
    ] : []),
    device("occupancy-sensor", "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupancy sensor", s223: "OccupancySensor", source: src.mbl(block, "u1Occ") }),
    point("zone-occupancy", "BI", xeto("ZoneOccupiedSensor"), "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupied", source: src.mbl(block, "u1Occ") }),
    device("window-switch", "window-switch", { when: "opt.window_switch", label: "Window switch", s223: "Sensor", source: src.mbl(block, "u1Win") }),
    point("window", "BI", xeto("WindowOpenSensor"), "window-switch", { when: "opt.window_switch", label: "Window status", source: src.mbl(block, "u1Win") }),
  ];
}

/** Network values a G36 terminal exchanges with its air handler and plant
 * (NET-IN / NET-OUT), each a connector of `block`. */
function terminalNet(block: string, extra: Array<[string, "NET-IN" | "NET-OUT", string, string?]>): Line[] {
  const base: Array<[string, "NET-IN" | "NET-OUT", string, string?]> = [
    ["TSup", "NET-IN", "Air handler supply-air temperature"],
    ["u1Fan", "NET-IN", "Air handler supply-fan status"],
    ["uOpeMod", "NET-IN", "Zone group operating mode"],
    ["VSet_flow", "NET-OUT", "Airflow setpoint"],
    ["yZonTemResReq", "NET-OUT", "Supply-air temperature reset requests"],
    ["yZonPreResReq", "NET-OUT", "Duct static pressure reset requests"],
    ["yLowFloAla", "NET-OUT", "Low airflow alarm"],
    ["yFloSenAla", "NET-OUT", "Airflow sensor calibration alarm"],
    ["yLeaDamAla", "NET-OUT", "Leaking damper alarm"],
  ];
  return [...base, ...extra].map(([c, io, label, when]) =>
    point(`net-${c}`, io, ot(`g36-${c}`), null, { label, ...(when ? { when } : {}), source: src.mbl(block, c) }));
}

const controller = (): Line[] => [
  device("controller", "terminal-unit-controller", { label: "Terminal unit controller (application-specific, with airflow transducer)", s223: "Controller", params: { class: "'application_specific'" }, source: src.inferred("research 02 §3b typical 1 roles: terminal controller with DP transducer") }),
  device("transformer", "transformer", { label: "24 VAC control transformer", params: { voltage: "'24 VAC'" }, source: src.inferred("research 02 §3b typical 1 roles: 24 VAC transformer") }),
];

const damper = (block: string, connector: string, id = "damper-actuator", label = "Primary air damper actuator", point_id = "damper", point_label = "Damper command"): Line[] => [
  device(id, "damper-actuator", { label, s223: "Actuator", params: { signal: "'modulating'", fail: "'in_place'" }, source: src.ufgs("23 09 13", "§3.1.12.1: terminal-unit damper actuators may be non-spring-return") }),
  point(point_id, "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { label: point_label, source: src.mbl(block, connector) }),
];

const dat = (block: string): Line[] => [
  device("dat-sensor", "temperature-sensor", { label: "Discharge air temperature sensor (duct probe)", s223: "TemperatureSensor", params: { form: "'duct'", medium: "'air'" }, source: src.mbl(block, "TDis") }),
  point("discharge-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { label: "Discharge air temperature", source: src.mbl(block, "TDis") }),
];

const airflow = (block: string, connector: string, label = "Primary airflow"): Line[] => [
  device("airflow-sensor", "airflow-sensor", { label: "Inlet airflow sensor (factory flow cross)", s223: "FlowSensor", params: { form: "'inlet_cross'" }, source: src.mbl(block, connector) }),
  point("airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-sensor", { label, source: src.mbl(block, connector) }),
];

const hwValve = (block: string, when: string): Line[] => [
  device("hw-valve", "control-valve", {
    when, label: "Reheat hot-water control valve and actuator", s223: "TwoWayValve",
    params: { service: "'hw'", body: "'2-way'", action: "'modulating'", characteristic: "'equal_percentage'", line_size_in: "attr.hw_conn_in", gpm: "attr.hw_gpm", coil_wpd_ft: "attr.hw_wpd_ft", cv: "<selection>", fail: "<selection>" },
    source: src.ufgs("23 09 13", "§2.5: 2-way modulating, equal-percentage for liquid; Cv and close-off decided at selection"),
  }),
];

/** Electric reheat: a modulating (SCR) signal, which G36 models, or staged
 * contactors, which it does not (UFC Table 3-1 counts the stages). */
function electricHeat(block: string, gate: string): Line[] {
  return [
    device("electric-heat", "factory-interface", { when: gate, label: "Electric heater controls (SCR or step contactors, factory)", params: { control: "if(opt.scr_heat, 'scr', 'staged')", kw: "attr.eh_kw" }, source: src.ufgs("23 09 93", "§3.3.2: electric heat with airflow proof") }),
    point("heat-cmd", "AO", xeto("HeatModulatingCmd"), "factory-interface", { when: `${gate} and opt.scr_heat`, label: "Electric heat modulating command (SCR)", source: src.mbl(block, "yVal") }),
    point("heat-stages", "BO", xeto("HeatRunCmd"), "factory-interface", { when: `${gate} and not opt.scr_heat`, qty: "attr.eh_stages", label: "Electric heat stage commands (one per stage)", source: src.ufc("vs-07") }),
    note("airflow-proof", "The heater's airflow proof is a factory interlock (UFGS 23 09 93 §3.3.2).", { when: gate, source: src.ufgs("23 09 93", "§3.3.2") }),
  ];
}

const terminalLabor = (): Line[] => [
  labor("program", "sequence-programming", "per_typical", { label: "Program the G36 terminal sequence", source: src.inferred("research 02 §3a labor hooks: programming per sequence") }),
  labor("graphic", "graphic", "per_typical", { label: "Terminal unit graphic", source: src.inferred("research 02 §3a labor hooks: graphics") }),
  labor("pvt", "performance-verification-test", "per_typical", { qty: "0.2", round: "ceil", label: "Performance verification test (20% sample of identical terminal units)", source: src.ufgs("23 09 00", "§3.7.6 b(1): 20 percent of each set of air terminal units with an identical sequence") }),
];

const common = (id: string, title: string, provenance: string[]) => ({
  id, version: "1", title, kind: "equipment" as const, status: "starter" as const,
  provenance: provenance.map((p) => ({ source: p, license: p.startsWith("MBL") ? "BSD-3-Clause-LBNL" : p.startsWith("[inferred]") ? "Apache-2.0" : "LicenseRef-US-Government-Work", derivation: (p.startsWith("[inferred]") ? "inferred" : "paraphrase") as "inferred" | "paraphrase" })),
});

export function terminalTypicals() {
  const CO = "TerminalUnits/CoolingOnly", RH = "TerminalUnits/Reheat";
  const SCVF = "TerminalUnits/SeriesFanCVF", SVVF = "TerminalUnits/SeriesFanVVF", PCVF = "TerminalUnits/ParallelFanCVF", PVVF = "TerminalUnits/ParallelFanVVF";
  const DSA = "TerminalUnits/DualDuctSnapActing", DMI = "TerminalUnits/DualDuctMixConInletSensor", DMD = "TerminalUnits/DualDuctMixConDischargeSensor";
  const reheatNet: Array<[string, "NET-IN" | "NET-OUT", string, string?]> = [
    ["u1HotPla", "NET-IN", "Hot-water plant status", "attr.heat_type = 'hw'"],
    ["yHeaValResReq", "NET-OUT", "Hot-water supply temperature reset requests", "attr.heat_type = 'hw'"],
    ["yHotWatPlaReq", "NET-OUT", "Hot-water plant requests", "attr.heat_type = 'hw'"],
    ["yLeaValAla", "NET-OUT", "Leaking valve alarm"],
  ];
  const fanPowered = (id: string, title: string, tt: string, cvf: string, vvf: string, parallel: boolean) => ({
    ...common(id, title, [`MBL ${cvf} and ${vvf}`, `UFGS 23 09 93 §3.3.3`, `UFGS 23 09 00 §3.7.8.5.6`, "UFC 3-410-01 Table 3-1, VAV System"]),
    applies_to: { family: "VAV", selector: `known(attr.terminal_type) and attr.terminal_type = '${tt}'`, rank: 30 },
    options: [
      ...ZONE_OPTIONS,
      { id: "variable_fan", label: "Variable-volume terminal fan (G36 VVF): the controller modulates the fan's airflow", default: false, note: "Off: a constant-volume fan (G36 CVF), started and stopped." },
      { id: "scr_heat", label: "Electric heat modulated by an SCR (otherwise staged)", default: false },
    ],
    lines: [
      ...controller(),
      ...zoneLines(cvf),
      ...dat(cvf),
      ...airflow(cvf, "VPri_flow"),
      ...damper(cvf, "yDam"),
      device("fan-interface", "factory-interface", { label: "Terminal fan relay and motor speed input (factory)", params: { ecm: "attr.ecm" }, source: src.mbl(cvf, "y1Fan") }),
      point("fan-cmd", "BO", xeto("FanRunCmd"), "factory-interface", { label: "Terminal fan start/stop", source: src.mbl(cvf, "y1Fan") }),
      device("fan-status-switch", "current-switch", { label: "Terminal fan current switch", s223: "ElectricCurrentSensor", source: src.mbl(cvf, "u1TerFan") }),
      point("fan-status", "BI", xeto("FanRunSensor"), "current-switch", { label: "Terminal fan status", source: src.mbl(cvf, "u1TerFan") }),
      point("fan-flow-cmd", "AO", xeto("FanSpeedModulatingCmd"), "factory-interface", { when: "opt.variable_fan", label: "Terminal fan airflow command (variable-volume fan)", source: src.mbl(vvf, "VFan_flow_Set") }),
      ...(parallel ? [
        device("fan-airflow-sensor", "airflow-sensor", { when: "opt.co2_sensor", label: "Parallel fan airflow sensor", s223: "FlowSensor", source: src.mbl(cvf, "VParFan_flow") }),
        point("fan-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-sensor", { when: "opt.co2_sensor", label: "Parallel fan airflow (for ventilation with CO2 control)", source: src.mbl(cvf, "VParFan_flow") }),
      ] : []),
      ...hwValve(cvf, "attr.heat_type = 'hw'"),
      point("hw-valve-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: "attr.heat_type = 'hw'", label: "Reheat valve command", source: src.mbl(cvf, "yVal") }),
      ...electricHeat(cvf, "attr.heat_type = 'electric'"),
      ...terminalNet(cvf, [...reheatNet, ["yFanStaAla", "NET-OUT", "Terminal fan status alarm"]]),
      ...terminalLabor(),
    ],
  });

  return [
    {
      ...common("vav-cooling-only", "VAV terminal, cooling only", ["MBL TerminalUnits/CoolingOnly", "UFGS 23 09 93 §3.3.1", "UFC 3-410-01 Table 3-1, VAV System"]),
      applies_to: { family: "VAV", selector: `attr.heat_type = 'none' and ${SINGLE_DUCT}`, rank: 20 },
      options: ZONE_OPTIONS,
      lines: [...controller(), ...zoneLines(CO), ...dat(CO), ...airflow(CO, "VDis_flow"), ...damper(CO, "yDam"), ...terminalNet(CO, []), ...terminalLabor()],
    },
    {
      ...common("vav-reheat-hw", "VAV terminal, hot-water reheat", ["MBL TerminalUnits/Reheat (heaCoi = WaterBased)", "UFGS 23 09 93 §3.3.2", "UFC 3-410-01 Table 3-1, VAV System"]),
      applies_to: { family: "VAV", selector: `attr.heat_type = 'hw' and ${SINGLE_DUCT}`, rank: 20 },
      options: [...ZONE_OPTIONS, { id: "reheat_water_temps", label: "Reheat coil supply and return water temperature sensors", default: false, note: "The G36 VAV reheat model (223P G36 Figure A-2) shows them; G36's own controller does not read them." }],
      lines: [
        ...controller(), ...zoneLines(RH), ...dat(RH), ...airflow(RH, "VDis_flow"), ...damper(RH, "yDam"),
        ...hwValve(RH, "true"),
        point("hw-valve-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { label: "Reheat valve command", source: src.mbl(RH, "yVal") }),
        device("hw-temp-sensors", "temperature-sensor", { when: "opt.reheat_water_temps", qty: "2", label: "Reheat supply and return water temperature sensors (immersion)", s223: "TemperatureSensor", params: { form: "'immersion'", medium: "'water'" }, source: src.inferred("research 02 §3b typical 2: 223P G36 Figure A-2 reheat water temperature sensors") }),
        device("hw-thermowells", "thermowell", { when: "opt.reheat_water_temps", qty: "2", label: "Thermowells for the water temperature sensors", params: { line_size_in: "attr.hw_conn_in" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: thermowells") }),
        point("hw-temps", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: "opt.reheat_water_temps", qty: "2", label: "Reheat supply and return water temperatures", source: src.inferred("research 02 §3b typical 2: 223P G36 Figure A-2") }),
        ...terminalNet(RH, [...reheatNet, ["yLowTemAla", "NET-OUT", "Low discharge-air temperature alarm"]]),
        ...terminalLabor(),
      ],
    },
    {
      ...common("vav-reheat-electric", "VAV terminal, electric reheat", ["MBL TerminalUnits/Reheat (heaCoi = Electric)", "UFGS 23 09 93 §3.3.2", "UFC 3-410-01 Table 3-1, VAV System"]),
      applies_to: { family: "VAV", selector: `attr.heat_type = 'electric' and ${SINGLE_DUCT}`, rank: 20 },
      options: [...ZONE_OPTIONS, { id: "scr_heat", label: "Electric heat modulated by an SCR (otherwise staged)", default: false }],
      lines: [
        ...controller(), ...zoneLines(RH), ...dat(RH), ...airflow(RH, "VDis_flow"), ...damper(RH, "yDam"),
        ...electricHeat(RH, "true"),
        ...terminalNet(RH, [["yLeaValAla", "NET-OUT", "Heating output alarm (G36 leaking-valve alarm)"]]),
        ...terminalLabor(),
      ],
    },
    fanPowered("vav-series-fan", "Series fan-powered terminal", "fan_powered_series", SCVF, SVVF, false),
    fanPowered("vav-parallel-fan", "Parallel fan-powered terminal", "fan_powered_parallel", PCVF, PVVF, true),
    {
      ...common("vav-dual-duct", "Dual-duct terminal", ["MBL TerminalUnits/DualDuctSnapActing, DualDuctMixConInletSensor, DualDuctMixConDischargeSensor, DualDuctColdDuctMin", "UFC 3-410-01 Table 3-1, VAV System"]),
      applies_to: { family: "VAV", selector: "known(attr.terminal_type) and attr.terminal_type = 'dual_duct'", rank: 30 },
      options: [...ZONE_OPTIONS, { id: "inlet_flow_sensors", label: "An airflow sensor on each inlet (otherwise one discharge airflow sensor)", default: true, note: "G36: snap-acting with dual sensors, mixing with inlet sensors and cold-duct minimum use one per inlet; mixing with a discharge sensor uses one." }],
      lines: [
        ...controller(), ...zoneLines(DSA), ...dat(DSA),
        ...damper(DSA, "yCooDam", "cold-damper-actuator", "Cold-duct damper actuator", "cold-damper", "Cold-duct damper command"),
        device("hot-damper-actuator", "damper-actuator", { label: "Hot-duct damper actuator", s223: "Actuator", params: { signal: "'modulating'", fail: "'in_place'" }, source: src.ufgs("23 09 13", "§3.1.12.1: terminal-unit damper actuators may be non-spring-return") }),
        point("hot-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { label: "Hot-duct damper command", source: src.mbl(DSA, "yHeaDam") }),
        device("inlet-airflow-sensors", "airflow-sensor", { when: "opt.inlet_flow_sensors", qty: "2", label: "Cold- and hot-inlet airflow sensors (factory flow crosses)", s223: "FlowSensor", params: { form: "'inlet_cross'" }, source: src.mbl(DMI, "VColDucDis_flow") }),
        point("cold-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-sensor", { when: "opt.inlet_flow_sensors", label: "Cold-duct airflow", source: src.mbl(DMI, "VColDucDis_flow") }),
        point("hot-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-sensor", { when: "opt.inlet_flow_sensors", label: "Hot-duct airflow", source: src.mbl(DMI, "VHotDucDis_flow") }),
        device("discharge-airflow-sensor", "airflow-sensor", { when: "not opt.inlet_flow_sensors", label: "Discharge airflow sensor", s223: "FlowSensor", params: { form: "'discharge'" }, source: src.mbl(DMD, "VDis_flow") }),
        point("discharge-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-sensor", { when: "not opt.inlet_flow_sensors", label: "Discharge airflow", source: src.mbl(DMD, "VDis_flow") }),
        ...([["TColSup", "NET-IN", "Cold-duct supply-air temperature"], ["THotSup", "NET-IN", "Hot-duct supply-air temperature"], ["u1CooAHU", "NET-IN", "Cooling air handler status"], ["u1HeaAHU", "NET-IN", "Heating air handler status"],
            ["VSet_flow", "NET-OUT", "Airflow setpoint"], ["yZonCooTemResReq", "NET-OUT", "Cold-duct temperature reset requests"], ["yColDucPreResReq", "NET-OUT", "Cold-duct static pressure reset requests"],
            ["yZonHeaTemResReq", "NET-OUT", "Hot-duct temperature reset requests"], ["yHotDucPreResReq", "NET-OUT", "Hot-duct static pressure reset requests"], ["yLowFloAla", "NET-OUT", "Low airflow alarm"]] as const)
          .map(([c, io, label]) => point(`net-${c}`, io, ot(`g36-${c}`), null, { label, source: src.mbl(DMI, c) })),
        ...terminalLabor(),
      ],
    },
    {
      ...common("lab-airflow", "Laboratory airflow control (supply and exhaust air valves)", ["[inferred] research 02 §3b typical 25: no primary source read", "VA 23 09 23 Responsibility Table: Laboratory Air Valves"]),
      applies_to: { family: "VAV", selector: "false", rank: 0 },
      options: [{ id: "fume_hood_monitor", label: "Fume hood monitor (sash and face velocity) on the lab's exhaust", default: false }],
      lines: [
        note("partner-review", "Partner review required: no primary source was read for lab airflow; applied only by override.", { source: src.inferred("research 02 §3b typical 25") }),
        device("air-valve", "lab-air-valve", { label: "Laboratory air valve with actuator and flow feedback", params: { function: "<selection>" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Laboratory Air Valves") }),
        point("valve-flow", "AI", xeto("DuctAirFlowSensor"), "lab-air-valve", { label: "Air valve flow", source: src.inferred("research 02 §3b typical 25: valve flow AI") }),
        point("valve-cmd", "AO", xeto("DuctAirDamperModulatingCmd"), "lab-air-valve", { label: "Air valve command", source: src.inferred("research 02 §3b typical 25: valve command AO") }),
        device("room-pressure-sensor", "pressure-sensor", { label: "Room differential pressure (offset) sensor", s223: "PressureSensor", params: { medium: "'air'", form: "'room'" }, source: src.inferred("research 02 §3b typical 25: room offset/pressure AI") }),
        point("room-pressure", "AI", xeto("AirPressureSensor"), "pressure-sensor", { label: "Room differential pressure", source: src.inferred("research 02 §3b typical 25") }),
        device("fume-hood-monitor", "fume-hood-monitor", { when: "opt.fume_hood_monitor", label: "Fume hood monitor", s223: "Controller", source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Fume hood controls") }),
        point("hood-alarm", "NET-IN", ot("fume-hood-alarm"), null, { when: "opt.fume_hood_monitor", label: "Fume hood sash and face-velocity alarm", source: src.inferred("research 02 §3b typical 25: usually network-integrated from the lab-controls package") }),
        labor("program", "sequence-programming", "per_typical", { label: "Program the lab airflow sequence", source: src.inferred("research 02 §3a labor hooks") }),
      ],
    },
  ];
}
