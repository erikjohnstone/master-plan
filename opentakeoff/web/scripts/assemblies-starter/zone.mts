// ASSEMBLIES WP4 — starter typicals for zone and unitary equipment
// (research 02 §3b, typicals 11, 12 and 14): the G36 fan coil unit from the
// Modelica Buildings Library, the UFGS 23 09 93 §3.2.1 and §3.3 sequences,
// and the network-integrated split and VRF systems of UFC 3-410-02 §2-4.
import { device, labor, note, point, src, type Line } from "./common.mts";
import { ot, xeto } from "./terminals.mts";

const FCU = "FanCoilUnits";
const S93 = (loc: string) => src.ufgs("23 09 93", loc);

const meta = (id: string, title: string, provenance: string[]) => ({
  id, version: "1", title, kind: "equipment" as const, status: "starter" as const,
  provenance: provenance.map((p) => ({ source: p, license: p.startsWith("MBL") ? "BSD-3-Clause-LBNL" : p.startsWith("[inferred]") ? "Apache-2.0" : "LicenseRef-US-Government-Work", derivation: (p.startsWith("[inferred]") ? "inferred" : "paraphrase") as "inferred" | "paraphrase" })),
});

const pvt20 = (what: string) => labor("pvt", "performance-verification-test", "per_typical", { qty: "0.2", round: "ceil", label: `Performance verification test (20% sample of identical ${what})`, source: src.ufgs("23 09 00", "§3.7.6 b(3): 20 percent of terminal equipment such as fan coil units and unit heaters") });
const program = (what: string) => labor("program", "sequence-programming", "per_typical", { label: `Program the ${what} sequence`, source: src.inferred("research 02 §3a labor hooks: programming per sequence") });

export function zoneTypicals() {
  const CHANGEOVER = "(known(attr.pipes) and attr.pipes = 2 and attr.cooling_type = 'chw' and attr.heating_type = 'hw')";
  const fcu = {
    ...meta("fcu", "Fan coil unit (2- or 4-pipe)", ["MBL FanCoilUnits", "UFGS 23 09 93 §3.3.7 (dual-temperature fan coil)"]),
    applies_to: { family: "FCU", rank: 10 },
    options: [
      { id: "variable_speed_fan", label: "Variable-speed (EC) fan modulated by the controller (G36); otherwise a multi-speed fan", auto: "attr.ecm = 'yes'" },
      { id: "scr_heat", label: "Electric heat modulated by an SCR (otherwise staged)", default: false },
      { id: "occupancy_sensor", label: "Zone occupancy sensor", default: false },
      { id: "window_switch", label: "Window switch", default: false },
      { id: "setpoint_adjust", label: "Occupant setpoint adjustment at the zone sensor", default: true },
    ],
    lines: [
      device("controller", "unit-controller", { label: "Fan coil unit controller (application-specific)", s223: "Controller", params: { class: "'application_specific'" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Fan Coil Unit controls") }),
      device("space-sensor", "space-sensor", { label: "Zone temperature sensor (wall module)", s223: "TemperatureSensor", params: { adjust: "opt.setpoint_adjust" }, source: src.mbl(FCU, "TZon") }),
      point("zone-temp", "AI", xeto("ZoneAirTempSensor"), "space-sensor", { label: "Zone temperature", source: src.mbl(FCU, "TZon") }),
      point("setpoint-adjust", "AI", ot("zone-setpoint-adjust"), "space-sensor", { when: "opt.setpoint_adjust", label: "Zone setpoint adjustment", source: src.mbl(FCU, "setAdj") }),
      device("occupancy-sensor", "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupancy sensor", s223: "OccupancySensor", source: S93("§3.1.2.3: space occupancy inputs") }),
      point("zone-occupancy", "BI", xeto("ZoneOccupiedSensor"), "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupied", source: S93("§3.1.2.3: space occupancy inputs") }),
      device("window-switch", "window-switch", { when: "opt.window_switch", label: "Window switch", s223: "Sensor", source: src.mbl(FCU, "u1Win") }),
      point("window", "BI", xeto("WindowOpenSensor"), "window-switch", { when: "opt.window_switch", label: "Window status", source: src.mbl(FCU, "u1Win") }),
      device("da-temp-sensor", "temperature-sensor", { label: "Discharge air temperature sensor", s223: "TemperatureSensor", params: { form: "'duct'", medium: "'air'" }, source: src.mbl(FCU, "TSup") }),
      point("da-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { label: "Discharge air temperature", source: src.mbl(FCU, "TSup") }),
      device("fan-relay", "relay", { label: "Fan start relay", s223: "Actuator", source: src.mbl(FCU, "y1Fan") }),
      point("fan-cmd", "BO", xeto("FanRunCmd"), "relay", { label: "Fan start/stop", source: src.mbl(FCU, "y1Fan") }),
      device("fan-status-switch", "current-switch", { label: "Fan current switch", s223: "ElectricCurrentSensor", source: src.mbl(FCU, "u1Fan") }),
      point("fan-status", "BI", xeto("FanRunSensor"), "current-switch", { label: "Fan status (proven on)", source: src.mbl(FCU, "u1Fan") }),
      device("fan-motor", "factory-interface", { when: "opt.variable_speed_fan", label: "EC fan motor speed input (factory)", source: src.mbl(FCU, "yFan") }),
      point("fan-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "factory-interface", { when: "opt.variable_speed_fan", label: "Fan speed command", source: src.mbl(FCU, "yFan") }),
      point("fan-speeds", "BO", xeto("FanSpeedEnumCmd"), "relay", { when: "not opt.variable_speed_fan", qty: "max(0, attr.fan_speeds - 1)", label: "Fan speed selection relays (a multi-speed fan)", source: S93("§3.3.7: multi-speed fan") }),
      device("chw-valve", "control-valve", { when: `attr.cooling_type = 'chw' and not ${CHANGEOVER}`, label: "Chilled-water valve and actuator", s223: "TwoWayValve", params: { service: "'chw'", body: "'2-way'", action: "'modulating'", line_size_in: "attr.chw_conn_in", gpm: "attr.chw_gpm", coil_wpd_ft: "attr.chw_wpd_ft", cv: "<selection>", fail: "<selection>" }, source: src.ufgs("23 09 13", "§2.5") }),
      device("dx-interface", "factory-interface", { when: "attr.cooling_type = 'dx'", label: "DX cooling controls (factory)", source: src.inferred("G36 FCU cooling coil may be DX (MBL cooCoi = DXCoil)") }),
      point("cooling-cmd", "AO", xeto("CoolModulatingCmd"), "control-valve", { when: `(attr.cooling_type = 'chw' and not ${CHANGEOVER}) or attr.cooling_type = 'dx'`, label: "Cooling coil control signal", source: src.mbl(FCU, "yCooCoi") }),
      device("hw-valve", "control-valve", { when: `attr.heating_type = 'hw' and not ${CHANGEOVER}`, label: "Hot-water valve and actuator", s223: "TwoWayValve", params: { service: "'hw'", body: "'2-way'", action: "'modulating'", line_size_in: "attr.hw_conn_in", gpm: "attr.hw_gpm", coil_wpd_ft: "attr.hw_wpd_ft", cv: "<selection>", fail: "<selection>" }, source: src.ufgs("23 09 13", "§2.5") }),
      device("electric-heat", "factory-interface", { when: "attr.heating_type = 'electric'", label: "Electric heat controls (factory)", params: { kw: "attr.eh_kw", control: "if(opt.scr_heat, 'scr', 'staged')" }, source: src.inferred("G36 FCU heating coil may be electric (MBL heaCoi = Electric)") }),
      point("heating-cmd", "AO", xeto("HeatModulatingCmd"), "control-valve", { when: `(attr.heating_type = 'hw' and not ${CHANGEOVER}) or (attr.heating_type = 'electric' and opt.scr_heat)`, label: "Heating coil control signal", source: src.mbl(FCU, "yHeaCoi") }),
      point("heat-stage", "BO", xeto("HeatRunCmd"), "factory-interface", { when: "attr.heating_type = 'electric' and not opt.scr_heat", label: "Electric heat enable", source: src.inferred("research 02 §3b typical 11: optional electric heat") }),
      device("dual-temp-valve", "control-valve", { when: CHANGEOVER, label: "Dual-temperature (changeover) valve and actuator", s223: "TwoWayValve", params: { service: "'dual_temperature'", body: "<selection>", action: "'modulating'", line_size_in: "attr.chw_conn_in", cv: "<selection>" }, source: S93("§3.3.7: dual-temperature valve (2- or 3-way)") }),
      point("dual-temp-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: CHANGEOVER, label: "Dual-temperature valve command", source: S93("§3.3.7") }),
      device("changeover-sensor", "temperature-sensor", { when: CHANGEOVER, label: "Changeover pipe temperature sensor (strap-on)", s223: "TemperatureSensor", params: { form: "'strap_on'", medium: "'water'" }, source: S93("§3.3.7: changeover pipe sensor") }),
      point("changeover-temp", "AI", xeto("PipeWaterTempSensor"), "temperature-sensor", { when: CHANGEOVER, label: "Supply water temperature (changeover)", source: S93("§3.3.7: changeover pipe sensor") }),
      ...([["TSupSet", "NET-OUT", "Supply air temperature setpoint"], ["yChiWatResReq", "NET-OUT", "Chilled-water reset requests", "attr.cooling_type = 'chw'"], ["yChiPlaReq", "NET-OUT", "Chiller plant requests", "attr.cooling_type = 'chw'"],
          ["yHotWatResReq", "NET-OUT", "Hot-water reset requests", "attr.heating_type = 'hw'"], ["yHotWatPlaReq", "NET-OUT", "Hot-water plant requests", "attr.heating_type = 'hw'"]] as const)
        .map(([c, io, label, when]) => point(`net-${c}`, io, ot(`g36-${c}`), null, { label, ...(when ? { when } : {}), source: src.mbl(FCU, c) })),
      note("pipes", "A fan coil whose schedule prints no pipe count is taken as 4-pipe when it prints both chilled- and hot-water coil data; a 2-pipe changeover unit needs PIPES printed or an override.", { source: src.inferred("UFGS 23 09 93 §3.3.7 distinguishes the dual-temperature unit") }),
      program("fan coil"),
      pvt20("fan coil units"),
    ],
  };

  const uh = {
    ...meta("unit-heater", "Unit heater or cabinet unit heater", ["UFGS 23 09 93 §3.3.5", "VA 23 09 23 Responsibility Table: Unit Heater controls"]),
    applies_to: { family: ["UNIT_HEATER", "CABINET_UNIT_HEATER"], rank: 10 },
    options: [
      { id: "modulating_valve", label: "Modulating heating valve (otherwise 2-position)", default: false },
      { id: "fan_status", label: "Fan status (current switch)", default: false },
      { id: "setpoint_adjust", label: "Occupant setpoint adjustment", default: false },
    ],
    lines: [
      device("controller", "unit-heater-controller", { label: "Unit heater controller", s223: "Controller", params: { class: "'application_specific'" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Unit Heater controls") }),
      device("off-auto", "hoa-switch", { label: "OFF-AUTO switch at the unit", source: S93("§3.3.5.1: Off-Auto switch") }),
      device("space-sensor", "space-sensor", { label: "Space temperature sensor", s223: "TemperatureSensor", params: { adjust: "opt.setpoint_adjust" }, source: S93("§3.3.5.4: space temperature control") }),
      point("space-temp", "AI", xeto("ZoneAirTempSensor"), "space-sensor", { label: "Space temperature", source: S93("§3.3.5.4") }),
      point("setpoint-adjust", "AI", ot("zone-setpoint-adjust"), "space-sensor", { when: "opt.setpoint_adjust", label: "Space setpoint adjustment", source: S93("§3.3.5.4") }),
      device("fan-relay", "relay", { label: "Fan start relay", s223: "Actuator", source: S93("§3.3.5: fan control") }),
      point("fan-cmd", "BO", xeto("FanRunCmd"), "relay", { label: "Fan start/stop", source: S93("§3.3.5: fan control") }),
      device("fan-status-switch", "current-switch", { when: "opt.fan_status", label: "Fan current switch", s223: "ElectricCurrentSensor", source: src.inferred("research 02 §3b typical 12: optional fan status") }),
      point("fan-status", "BI", xeto("FanRunSensor"), "current-switch", { when: "opt.fan_status", label: "Fan status", source: src.inferred("research 02 §3b typical 12: optional fan status") }),
      device("heating-valve", "control-valve", { when: "attr.heating_medium = 'hw' or attr.heating_medium = 'steam'", label: "Heating valve and actuator", s223: "TwoWayValve", params: { service: "attr.heating_medium", body: "'2-way'", action: "if(opt.modulating_valve, 'modulating', 'two_position')", line_size_in: "attr.conn_in", gpm: "attr.hw_gpm", cv: "<selection>" }, source: S93("§3.3.5: heating valve") }),
      point("valve-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: "(attr.heating_medium = 'hw' or attr.heating_medium = 'steam') and opt.modulating_valve", label: "Heating valve command", source: S93("§3.3.5: heating valve") }),
      point("valve-open", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: "(attr.heating_medium = 'hw' or attr.heating_medium = 'steam') and not opt.modulating_valve", label: "Heating valve open command (2-position)", source: S93("§3.3.5: heating valve") }),
      device("heater-interface", "factory-interface", { when: "attr.heating_medium = 'electric' or attr.heating_medium = 'gas'", label: "Electric or gas heat controls (factory)", params: { kw: "attr.eh_kw" }, source: S93("§3.3.6: gas infrared heater enable") }),
      point("heat-enable", "BO", xeto("HeatEnableCmd"), "factory-interface", { when: "attr.heating_medium = 'electric' or attr.heating_medium = 'gas'", label: "Heater enable", source: S93("§3.3.6: heater enable") }),
      program("unit heater"),
      pvt20("unit heaters"),
    ],
  };

  const unitary = (id: string, title: string, family: string, extra: Line[], opts: Array<{ id: string; label: string; default?: boolean; auto?: string; note?: string }> = []) => ({
    ...meta(id, title, ["UFGS 23 09 93 §3.2.1 (all-air small package unitary system)"]),
    applies_to: { family, rank: 10 },
    options: [{ id: "setpoint_adjust", label: "Occupant setpoint adjustment", default: true }, { id: "fan_status", label: "Fan status (current switch)", default: false }, ...opts],
    lines: [
      device("controller", "packaged-unit-controls", { label: "Unit controller (field-installed, not furnished with the equipment)", s223: "Controller", params: { class: "'application_specific'" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Packaged RTU unit-mounted controls (not furnished with equipment)") }),
      device("space-sensor", "space-sensor", { label: "Zone temperature sensor", s223: "TemperatureSensor", params: { adjust: "opt.setpoint_adjust" }, source: S93("§3.2.1.5: zone temperature control") }),
      point("zone-temp", "AI", xeto("ZoneAirTempSensor"), "space-sensor", { label: "Zone temperature (ZN-T)", source: S93("§3.2.1.5") }),
      point("setpoint-adjust", "AI", ot("zone-setpoint-adjust"), "space-sensor", { when: "opt.setpoint_adjust", label: "Zone setpoint adjustment (ZN-T-SP)", source: S93("§3.2.1.5 a") }),
      device("unit-interface", "factory-interface", { label: "Unit fan, heating and cooling stage inputs (factory)", source: S93("§3.2.1: outputs are fan, heat and cool stages") }),
      point("fan-cmd", "BO", xeto("FanRunCmd"), "factory-interface", { label: "Fan command (ON/AUTO)", source: S93("§3.2.1.1: fan ON-AUTO") }),
      device("fan-status-switch", "current-switch", { when: "opt.fan_status", label: "Fan current switch", s223: "ElectricCurrentSensor", source: src.inferred("UFGS 23 09 93 §3.2.1.4 leaves safeties to the manufacturer; fan status is optional") }),
      point("fan-status", "BI", xeto("FanRunSensor"), "current-switch", { when: "opt.fan_status", label: "Fan status", source: src.inferred("optional fan proof") }),
      ...extra,
      note("stages", "Stage counts beyond the first come from the unit's controls submittal; the schedule does not print them for this family.", { source: src.inferred("the family's attributes carry no stage count") }),
      program("unitary"),
      pvt20("unitary equipment"),
    ],
  });

  const furnace = unitary("split-dx-indoor", "Split DX system, indoor unit (furnace or air handler with DX coil)", "FURNACE", [
    point("heat-stage", "BO", xeto("HeatRunCmd"), "factory-interface", { label: "Heating stage 1", source: S93("§3.2.1: heat stages") }),
    point("cool-stage", "BO", xeto("CoolRunCmd"), "factory-interface", { when: "known(attr.cooling_mbh) or known(attr.cooling_tons)", label: "Cooling stage 1 (to the condensing unit)", source: S93("§3.2.1: cool stages") }),
  ]);
  const heatPump = unitary("heat-pump", "Heat pump (water-source or split), unitary", "HEAT_PUMP", [
    point("compressor", "BO", xeto("CoolRunCmd"), "factory-interface", { label: "Compressor stage 1", source: S93("§3.2.1: cool stages") }),
    point("heat-mode", "BO", ot("heat-pump-reversing-valve"), "factory-interface", { label: "Heating mode (reversing valve)", source: S93("§3.2.1.2: HEAT-OFF-COOL[-EMERG HEAT] switch") }),
    point("emergency-heat", "BO", xeto("HeatRunCmd"), "factory-interface", { when: "known(attr.eh_kw)", label: "Emergency (supplemental) electric heat", source: S93("§3.2.1.2: EMERG HEAT") }),
    device("source-valve", "control-valve", { when: "known(attr.source_gpm)", label: "Source-water 2-position valve, interlocked with the compressor", s223: "TwoWayValve", params: { service: "'condenser_water'", body: "'2-way'", action: "'two_position'", gpm: "attr.source_gpm", line_size_in: "attr.conn_in", cv: "<selection>" }, source: src.inferred("research 04 §1.1 rule 6: UFGS 23 81 47 §2.1.1 gives the unit a 2-position valve interlocked with the compressor") }),
    point("source-valve-cmd", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: "known(attr.source_gpm)", label: "Source-water valve open", source: src.inferred("research 04 §1.1 rule 6") }),
  ]);

  const UFC02 = (loc: string) => src.ufc41002(loc);
  const vrfIndoor = {
    ...meta("vrf-indoor", "VRF indoor unit (network-integrated through the VRF system's gateway)", ["UFC 3-410-02 §2-4 (proprietary-network exception, points schedule at the interface)", "UFC 3-410-01 §2-15 (VRF)", "[inferred] research 02 §3b typical 14: per-indoor-unit network points"]),
    applies_to: { family: "VRF_INDOOR", rank: 10 },
    options: [],
    lines: [
      note("interface", "A VRF system is one manufacturer's, factory-programmed, and integrated at its gateway; its points are scheduled at that interface (UFC 3-410-02 §2-4.1/2-4.2).", { source: UFC02("§2-4.1, §2-4.2") }),
      ...([["on-off", "NET-OUT", "On/off command"], ["mode", "NET-OUT", "Mode command"], ["setpoint", "NET-OUT", "Zone temperature setpoint"], ["fan-speed", "NET-OUT", "Fan speed command"],
          ["room-temp", "NET-IN", "Room temperature"], ["filter", "NET-IN", "Filter alarm"], ["fault", "NET-IN", "Unit fault"]] as const)
        .map(([id, io, label]) => point(id, io, ot(`vrf-${id}`), null, { label, source: src.inferred("research 02 §3b typical 14: per indoor unit on/off, mode, setpoint, room temperature, fan speed, filter, fault") })),
      labor("integration", "network-integration", "per_typical", { label: "Map and test the indoor unit's gateway points", source: UFC02("§2-4") }),
    ],
  };
  const vrfOutdoor = {
    ...meta("vrf-outdoor", "VRF outdoor unit and its gateway", ["UFC 3-410-01 §2-15 (VRF requires owner approval and open controls)", "UFC 3-410-02 §2-4", "[inferred] research 02 §3b typical 14"]),
    applies_to: { family: "VRF_OUTDOOR", rank: 10 },
    options: [],
    lines: [
      device("gateway", "network-interface", { label: "VRF system gateway to the BAS", s223: "Controller", params: { printed: "attr.bas_interface" }, source: src.ufc410("§2-15: VRF systems require owner approval and open controls") }),
      point("status", "NET-IN", ot("vrf-outdoor-status"), null, { label: "Outdoor unit status", source: src.inferred("research 02 §3b typical 14: per outdoor unit status and alarm") }),
      point("alarm", "NET-IN", ot("vrf-outdoor-alarm"), null, { label: "Outdoor unit alarm", source: src.inferred("research 02 §3b typical 14") }),
      labor("integration", "network-integration", "per_typical", { label: "Integrate the VRF gateway", source: UFC02("§2-4") }),
    ],
  };
  return [fcu, uh, furnace, heatPump, vrfIndoor, vrfOutdoor];
}
