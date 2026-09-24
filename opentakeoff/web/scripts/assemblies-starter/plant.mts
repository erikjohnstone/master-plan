// ASSEMBLIES WP4 — starter typicals for pumps, fans, plants and other
// equipment (research 02 §3b, typicals 15–24 and 26). Plant-wide points are
// project assemblies (once per plant), so a plant with three boilers counts
// its supply temperature once.
import { device, labor, note, point, src, type Line } from "./common.mts";
import { ot, xeto } from "./terminals.mts";

const S93 = (loc: string) => src.ufgs("23 09 93", loc);
const S00 = (loc: string) => src.ufgs("23 09 00", loc);
const S13 = (loc: string) => src.ufgs("23 09 13", loc);
const PL = "Plants/Chillers";
const UFC = "opt.ufc_minimum_points";
const UFC_OPTION = { id: "ufc_minimum_points", label: "UFC 3-410-01 Table 3-1 minimum points (DoD projects)", default: false, note: "UFC 3-410-01 §3-2.3.4 (IMC 309.1) requires Table 3-1 on DoD projects." };

const meta = (id: string, title: string, provenance: string[]) => ({
  id, version: "1", title, kind: "equipment" as const, status: "starter" as const,
  provenance: provenance.map((p) => ({ source: p, license: p.startsWith("MBL") ? "BSD-3-Clause-LBNL" : p.startsWith("[inferred]") ? "Apache-2.0" : "LicenseRef-US-Government-Work", derivation: (p.startsWith("[inferred]") ? "inferred" : "paraphrase") as "inferred" | "paraphrase" })),
});
const immersion = (id: string, label: string, source: ReturnType<typeof src.mbl>, when?: string, qty?: string, size?: string): Line[] => [
  device(id, "temperature-sensor", { ...(when ? { when } : {}), ...(qty ? { qty } : {}), label, s223: "TemperatureSensor", params: { form: "'immersion'", medium: "'water'" }, source }),
  device(`${id}-well`, "thermowell", { ...(when ? { when } : {}), ...(qty ? { qty } : {}), label: `Thermowell (${label.toLowerCase()})`, ...(size ? { params: { line_size_in: size } } : {}), source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: thermowells") }),
];
const dpTransmitter = (id: string, label: string, source: ReturnType<typeof src.mbl>, when?: string, qty?: string): Line[] => [
  device(id, "pressure-sensor", { ...(when ? { when } : {}), ...(qty ? { qty } : {}), label, s223: "PressureSensor", params: { medium: "'water'", form: "'differential'" }, source }),
  device(`${id}-taps`, "pressure-tap", { ...(when ? { when } : {}), qty: qty ? `2 * (${qty})` : "2", label: "Pressure taps with valves", source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: pipe insertion devices and taps") }),
];

function pumps() {
  const common = (vfd: boolean): Line[] => [
    vfd
      ? device("vfd", "vfd", { label: "Pump variable frequency drive (with H-O-A)", s223: "VariableFrequencyDrive", params: { hp: "attr.motor_hp" }, source: S93("§3.4.4: secondary variable-speed pump VFD") })
      : device("starter", "starter", { label: "Pump starter with H-O-A switch", params: { hp: "attr.motor_hp" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Starters, HOA switches") }),
    ...(vfd ? [] : [device("relay", "relay", { label: "Pump start/stop relay", s223: "Actuator", source: S93("§3.4.2: pump start/stop with proof") })]),
    point("cmd", "BO", xeto("MotorRunCmd"), vfd ? "vfd" : "relay", { label: "Pump start/stop", source: src.ufc("hwhs-02") }),
    ...(vfd ? [] : [device("status-switch", "current-switch", { label: "Pump current switch (or a differential pressure or flow switch)", s223: "ElectricCurrentSensor", source: S13("§2.7.8.2: current sensing relays") })]),
    point("status", "BI", xeto("MotorRunSensor"), vfd ? "vfd" : "current-switch", { label: "Pump status", source: src.ufc("hwhs-01") }),
    ...dpTransmitter("dp-across-pump", "Differential pressure transmitter across the pump", src.ufc("hwhs-07"), UFC),
    point("dp-across", "AI", xeto("WaterPressureSensor"), "pressure-sensor", { when: UFC, label: "Differential pressure across the pump", source: src.ufc("hwhs-07") }),
    note("hoa", "The H-O-A switch is at the starter or VFD, per UFGS 23 09 23.02 §3.1.3.5; the points schedule shows it.", { source: src.ufgs("23 09 23.02", "§3.1.3.5: H-O-A switches") }),
  ];
  return [
    {
      ...meta("pump-constant", "Pump, constant speed", ["UFGS 23 09 93 §3.4.2", "UFC 3-410-01 Table 3-1, Hot Water Heating System and Chilled Water System"]),
      applies_to: { family: "PUMP", selector: "attr.vfd = 'no'", rank: 20 },
      options: [UFC_OPTION],
      lines: common(false),
    },
    {
      ...meta("pump-vfd", "Pump, variable speed", ["UFGS 23 09 93 §3.4.4", "UFGS 23 09 00 §3.7.8.5.1-3 (pump actual speed)", "UFC 3-410-01 Table 3-1"]),
      applies_to: { family: "PUMP", selector: "attr.vfd = 'yes'", rank: 20 },
      options: [UFC_OPTION],
      lines: [
        ...common(true),
        point("speed-cmd", "AO", xeto("MotorSpeedModulatingCmd"), "vfd", { label: "Pump speed command", source: S93("§3.4.4: secondary variable-speed pump") }),
        point("speed", "AI", xeto("MotorSpeedModulatingSensor"), "vfd", { label: "Pump drive frequency (actual speed)", source: src.ufc("cws-17") }),
        point("fault", "BI", xeto("AlarmSensor"), "vfd", { label: "Pump VFD fault", source: src.inferred("research 02 §3b typical 16: speed and fault by NET or AI/BI") }),
      ],
    },
  ];
}

function fans() {
  const damper: Line[] = [
    device("damper-actuator", "damper-actuator", { when: "opt.motorized_damper", label: "Motorized damper actuator (2-position, spring return)", s223: "Actuator", params: { signal: "'two_position'", fail: "'closed'" }, source: S13("§3.1.13.1: outdoor, makeup and relief dampers fail closed") }),
    device("damper-end-switch", "end-switch", { when: "opt.motorized_damper", label: "Damper end switch (proves the damper open before the fan starts)", s223: "Sensor", source: S13("§2.7.21: damper end switches") }),
    point("damper-open", "BI", xeto("DamperOpenSensor"), "end-switch", { when: "opt.motorized_damper", label: "Damper open (end switch)", source: S13("§2.7.21") }),
  ];
  const pvt = labor("pvt", "performance-verification-test", "per_typical", { qty: "0.2", round: "ceil", label: "Performance verification test (20% sample of identical exhaust fans)", source: S00("§3.7.6 b(2): 20 percent of exhaust air fans") });
  const opts = [{ id: "motorized_damper", label: "Motorized damper interlocked with the fan", default: false }];
  return [
    {
      ...meta("fan-constant", "Fan (exhaust, supply or return), constant speed", ["UFC 3-410-01 Table 3-1 (exhaust fan status)", "[inferred] research 02 §3b typical 17"]),
      applies_to: { family: "FAN", selector: "attr.vfd = 'no'", rank: 20 },
      options: opts,
      lines: [
        device("starter", "starter", { label: "Fan starter or motor switch", params: { hp: "attr.motor_hp" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Starters, HOA switches") }),
        device("relay", "relay", { label: "Fan start/stop relay", s223: "Actuator", source: src.inferred("research 02 §3b typical 17: S/S BO") }),
        point("cmd", "BO", xeto("FanRunCmd"), "relay", { label: "Fan start/stop", source: src.inferred("research 02 §3b typical 17: S/S BO") }),
        device("status-switch", "current-switch", { label: "Fan current switch", s223: "ElectricCurrentSensor", source: src.ufc("ads-23") }),
        point("status", "BI", xeto("FanRunSensor"), "current-switch", { label: "Fan status", source: src.ufc("ads-23") }),
        ...damper, pvt,
      ],
    },
    {
      ...meta("fan-variable", "Fan, variable speed (VFD)", ["[inferred] research 02 §3b typical 18", "UFC 3-410-01 Table 3-1 (exhaust fan status)"]),
      applies_to: { family: "FAN", selector: "attr.vfd = 'yes'", rank: 20 },
      options: [...opts, { id: "pressure_control", label: "Fan speed controlled from a pressure (or CO) sensor", default: false }],
      lines: [
        device("vfd", "vfd", { label: "Fan variable frequency drive", s223: "VariableFrequencyDrive", params: { hp: "attr.motor_hp" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: VFDs") }),
        point("cmd", "BO", xeto("FanRunCmd"), "vfd", { label: "Fan start/stop", source: src.inferred("research 02 §3b typical 18") }),
        point("status", "BI", xeto("FanRunSensor"), "vfd", { label: "Fan status", source: src.ufc("ads-23") }),
        point("speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { label: "Fan speed command", source: src.inferred("research 02 §3b typical 18: speed AO") }),
        point("speed", "AI", xeto("FanSpeedModulatingSensor"), "vfd", { label: "Fan actual speed", source: src.inferred("research 02 §3b typical 18: feedback") }),
        point("fault", "BI", xeto("AlarmSensor"), "vfd", { label: "Fan VFD fault", source: src.inferred("research 02 §3b typical 18: fault") }),
        device("pressure-sensor", "pressure-sensor", { when: "opt.pressure_control", label: "Control pressure (or CO) sensor", s223: "PressureSensor", params: { medium: "'air'" }, source: src.inferred("research 02 §3b typical 18: a pressure or CO sensor when the fan is so controlled") }),
        point("pressure", "AI", xeto("AirPressureSensor"), "pressure-sensor", { when: "opt.pressure_control", label: "Control pressure (or CO)", source: src.inferred("research 02 §3b typical 18") }),
        ...damper, pvt,
      ],
    },
  ];
}

function boilers() {
  const boiler = {
    ...meta("boiler", "Boiler (one of a hot-water plant)", ["UFGS 23 09 93 §3.4.2", "UFGS 23 09 00 §3.7.8.5.2", "UFC 3-410-01 Table 3-1, Hot Water Heating System"]),
    applies_to: { family: "BOILER", rank: 10 },
    options: [
      { id: "isolation_valve", label: "Motorized isolation valve with status", default: false, note: "UFGS 23 09 00 §3.7.8.5.2 b trends each boiler's isolation valve command and status." },
      { id: "network_interface", label: "Boiler controls on the network (a BACnet interface)", auto: "known(attr.bas_interface)" },
    ],
    lines: [
      device("boiler-interface", "factory-interface", { label: "Boiler control panel interface (enable, status and alarm contacts)", source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Chiller/boiler controls interface with control system") }),
      point("enable", "BO", xeto("EnableCmd"), "factory-interface", { label: "Boiler enable/disable", source: src.ufc("hwhs-09") }),
      point("status", "BI", xeto("RunSensor"), "factory-interface", { label: "Boiler status", source: src.ufc("hwhs-08") }),
      point("alarm", "BI", xeto("AlarmSensor"), "factory-interface", { label: "Boiler failure alarm", source: src.ufc("hwhs-10") }),
      device("isolation-valve", "control-valve", { when: "opt.isolation_valve", label: "Boiler isolation valve and actuator (2-position)", s223: "TwoWayValve", params: { service: "'hw'", action: "'two_position'", line_size_in: "attr.conn_in", body: "<selection>" }, source: S00("§3.7.8.5.2 item b") }),
      point("isolation-cmd", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: "opt.isolation_valve", label: "Boiler isolation valve command", source: S00("§3.7.8.5.2 item b") }),
      device("isolation-switch", "end-switch", { when: "opt.isolation_valve", label: "Isolation valve end switch", s223: "Sensor", source: S00("§3.7.8.5.2 item b") }),
      point("isolation-status", "BI", xeto("ValveOpenSensor"), "end-switch", { when: "opt.isolation_valve", label: "Boiler isolation valve status", source: S00("§3.7.8.5.2 item b") }),
      device("network-interface", "network-interface", { when: "opt.network_interface", label: "Boiler BACnet interface", s223: "Controller", params: { printed: "attr.bas_interface" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Chiller/boiler controls interface with control system") }),
      ...([["supply-temp", "NET-IN", "Boiler supply temperature"], ["firing-rate", "NET-IN", "Firing rate"], ["alarm-code", "NET-IN", "Alarm code"]] as const)
        .map(([id, io, label]) => point(`net-${id}`, io, ot(`boiler-${id}`), null, { when: "opt.network_interface", label, source: src.inferred("research 02 §3b typical 19: plant-manager or boiler interface points") })),
      note("safeties", "Flame safeguard and limits stay factory controls; a plant-manager gateway only under UFC 3-410-02 §2-4.3.", { source: src.ufc41002("§2-4.3") }),
    ],
  };
  const plant = {
    ...meta("hw-plant", "Hot-water plant (once per plant)", ["UFGS 23 09 93 §3.4.2", "UFGS 23 09 00 §3.7.8.5.2", "UFC 3-410-01 Table 3-1, Hot Water Heating System"]),
    kind: "project" as const,
    applies_to: { family: "project", selector: "var.plants > 0", rank: 0 },
    variables: [{ id: "plants", from: "project.hw_plants", prompt: "Hot-water plants in the project" }],
    options: [
      { id: "min_flow_bypass", label: "Minimum-flow bypass valve", default: false, note: "UFGS 23 09 00 §3.7.8.5.2 e trends it where the plant has one." },
      { id: "mixing_valve", label: "3-way mixing valve on the supply", default: false, note: "UFGS 23 09 93 §3.4.2 (single-building boiler)." },
      { id: "steam_condensate", label: "Steam system with a condensate return pump", default: false },
      UFC_OPTION,
    ],
    lines: [
      device("controller", "system-controller", { qty: "var.plants", label: "Plant controller (programmable)", s223: "Controller", params: { class: "'programmable'" }, source: src.inferred("research 02 §3b typical 19: plant points on a programmable controller") }),
      ...immersion("hws-sensor", "Hot-water supply temperature sensor", S93("§3.4.2: HWS-T"), undefined, "var.plants"),
      point("hws-temp", "AI", xeto("WaterTempSensor"), "temperature-sensor", { qty: "var.plants", label: "Hot-water supply temperature", source: src.ufc("hwhs-03") }),
      ...immersion("hwr-sensor", "Hot-water return temperature sensor", S00("§3.7.8.5.2 item h"), undefined, "var.plants"),
      point("hwr-temp", "AI", xeto("WaterTempSensor"), "temperature-sensor", { qty: "var.plants", label: "Hot-water return temperature", source: src.ufc("hwhs-04") }),
      device("flow-meter", "flow-meter", { qty: "var.plants", label: "Hot-water flow meter", s223: "FlowSensor", source: S00("§3.7.8.5.2 item i") }),
      point("flow", "AI", xeto("WaterFlowSensor"), "flow-meter", { qty: "var.plants", label: "Hot-water flow rate", source: src.ufc("hwhs-05") }),
      ...dpTransmitter("system-dp-sensor", "System differential pressure transmitter", S93("§3.4.4: differential pressure tap and sensor"), undefined, "var.plants"),
      point("system-dp", "AI", xeto("WaterPressureSensor"), "pressure-sensor", { qty: "var.plants", label: "System differential pressure", source: S00("§3.7.8.5.2 item d") }),
      device("oa-temp-sensor", "temperature-sensor", { qty: "var.plants", label: "Outdoor air temperature sensor (for supply reset)", s223: "TemperatureSensor", params: { form: "'outdoor'", medium: "'air'" }, source: S93("§3.4.2: HWS-T reset from OAT") }),
      point("oa-temp", "AI", xeto("AirTempSensor"), "temperature-sensor", { qty: "var.plants", label: "Outdoor air temperature", source: S00("§3.7.8.5.2 item j") }),
      device("bypass-valve", "control-valve", { when: "opt.min_flow_bypass", qty: "var.plants", label: "Minimum-flow bypass valve and actuator", s223: "TwoWayValve", params: { service: "'hw'", action: "'modulating'", cv: "<selection>" }, source: S00("§3.7.8.5.2 item e") }),
      point("bypass-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: "opt.min_flow_bypass", qty: "var.plants", label: "Minimum-flow bypass valve command", source: S00("§3.7.8.5.2 item e") }),
      device("mixing-valve", "control-valve", { when: "opt.mixing_valve", qty: "var.plants", label: "3-way mixing valve and actuator", s223: "ThreeWayValve", params: { service: "'hw'", body: "'3-way'", action: "'modulating'", characteristic: "'linear'", cv: "<selection>" }, source: S93("§3.4.2: 3-way mixing valve") }),
      point("mixing-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: "opt.mixing_valve", qty: "var.plants", label: "Hot-water mixing valve position", source: src.ufc("hwhs-06") }),
      device("condensate-pump-switch", "current-switch", { when: "opt.steam_condensate", qty: "var.plants", label: "Condensate return pump status switch", s223: "ElectricCurrentSensor", source: src.ufc("hwhs-14") }),
      point("condensate-pump", "BI", xeto("MotorRunSensor"), "current-switch", { when: "opt.steam_condensate", qty: "var.plants", label: "Condensate return pump status", source: src.ufc("hwhs-14") }),
      labor("program", "sequence-programming", "per_typical", { qty: "var.plants", label: "Program the hot-water plant sequence", source: src.inferred("research 02 §3a labor hooks") }),
      labor("graphic", "graphic", "per_typical", { qty: "var.plants", label: "Hot-water plant graphic", source: src.inferred("research 02 §3a labor hooks") }),
      labor("pvt", "performance-verification-test", "per_typical", { qty: "var.plants", label: "Performance verification test (every primary system)", source: S00("§3.7.6 a(1): 100 percent of primary systems") }),
    ],
  };
  return [boiler, plant];
}

function chillers() {
  const WC = "attr.condenser = 'water'";
  const chiller = {
    ...meta("chiller", "Chiller (one of a chilled-water plant)", ["MBL Plants/Chillers (per-chiller connectors)", "UFGS 23 09 00 §3.7.8.5.1", "UFC 3-410-01 Table 3-1, Chilled Water System"]),
    applies_to: { family: ["AIR_COOLED_CHILLER", "HEAT_RECOVERY_CHILLER"], rank: 10 },
    options: [
      { id: "chw_isolation_valve", label: "Motorized chilled-water isolation valve (headered pumps)", default: true, note: "G36 (MBL chiIsoValTyp): 2-position by default; UFGS 23 09 00 §3.7.8.5.1 b trends its command and status." },
      { id: "modulating_isolation", label: "Modulating isolation valves with position feedback (G36 Actuator.Modulating)", default: false },
      { id: "isolation_end_switches", label: "Open and closed end switches on 2-position isolation valves", default: false },
      { id: "network_interface", label: "Chiller controls on the network (a BACnet interface)", auto: "known(attr.bas_interface)" },
      UFC_OPTION,
    ],
    lines: [
      device("chiller-interface", "factory-interface", { label: "Chiller control panel interface (enable, status and alarm contacts)", source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Chiller/boiler controls interface with control system") }),
      point("enable", "BO", xeto("EnableCmd"), "factory-interface", { label: "Chiller enable", source: src.mbl(PL, "yChi") }),
      point("status", "BI", xeto("RunSensor"), "factory-interface", { label: "Chiller status", source: src.mbl(PL, "uChi") }),
      point("alarm", "BI", xeto("AlarmSensor"), "factory-interface", { label: "Chiller failure alarm", source: src.ufc("cws-03") }),
      device("chw-isolation-valve", "control-valve", { when: "opt.chw_isolation_valve", label: "Chilled-water isolation valve and actuator", s223: "TwoWayValve", params: { service: "'chw'", action: "if(opt.modulating_isolation, 'modulating', 'two_position')", line_size_in: "attr.conn_in", body: "<selection>" }, source: src.mbl(PL, "y1ChiWatIsoVal") }),
      point("chw-isolation", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: "opt.chw_isolation_valve and not opt.modulating_isolation", label: "Chilled-water isolation valve command", source: src.mbl(PL, "y1ChiWatIsoVal") }),
      point("chw-isolation-mod", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: "opt.chw_isolation_valve and opt.modulating_isolation", label: "Chilled-water isolation valve position command", source: src.mbl(PL, "yChiWatIsoVal") }),
      point("chw-isolation-feedback", "AI", xeto("WaterValveModulatingSensor"), "control-valve", { when: "opt.chw_isolation_valve and opt.modulating_isolation", label: "Chilled-water isolation valve position", source: src.mbl(PL, "uChiWatIsoVal") }),
      device("isolation-switches", "end-switch", { when: "opt.chw_isolation_valve and opt.isolation_end_switches and not opt.modulating_isolation", qty: "2", label: "Isolation valve open and closed end switches", s223: "Sensor", source: src.mbl(PL, "u1ChiWatIsoValOpe") }),
      point("chw-isolation-open", "BI", xeto("ValveOpenSensor"), "end-switch", { when: "opt.chw_isolation_valve and opt.isolation_end_switches and not opt.modulating_isolation", label: "Chilled-water isolation valve open", source: src.mbl(PL, "u1ChiWatIsoValOpe") }),
      point("chw-isolation-closed", "BI", xeto("ValveOpenSensor"), "end-switch", { when: "opt.chw_isolation_valve and opt.isolation_end_switches and not opt.modulating_isolation", label: "Chilled-water isolation valve closed", source: src.mbl(PL, "u1ChiWatIsoValClo") }),
      device("cw-isolation-valve", "control-valve", { when: WC, label: "Condenser-water isolation valve and actuator", s223: "TwoWayValve", params: { service: "'cw'", action: "if(opt.modulating_isolation, 'modulating', 'two_position')", body: "<selection>" }, source: src.mbl(PL, "y1ConWatIsoVal") }),
      point("cw-isolation", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: `${WC} and not opt.modulating_isolation`, label: "Condenser-water isolation valve command", source: src.mbl(PL, "y1ConWatIsoVal") }),
      point("cw-isolation-mod", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: `${WC} and opt.modulating_isolation`, label: "Condenser-water isolation valve position command", source: src.mbl(PL, "yConWatIsoVal") }),
      ...immersion("chiller-temp-sensors", "Chiller entering and leaving water temperature sensors", src.ufc("cws-04"), UFC, "2"),
      point("chiller-temps", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: UFC, qty: "2", label: "Entering and leaving water temperatures at the chiller", source: src.ufc("cws-04") }),
      device("chiller-flow-meter", "flow-meter", { when: UFC, label: "Chiller chilled-water flow meter", s223: "FlowSensor", source: src.ufc("cws-05") }),
      point("chiller-flow", "AI", xeto("WaterFlowSensor"), "flow-meter", { when: UFC, label: "Chilled-water flow for the chiller", source: src.ufc("cws-05") }),
      device("network-interface", "network-interface", { when: "opt.network_interface", label: "Chiller BACnet interface", s223: "Controller", params: { printed: "attr.bas_interface" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Interface with chiller/boiler controls") }),
      point("net-TChiWatSupSet", "NET-OUT", ot("g36-TChiWatSupSet"), null, { label: "Chilled-water supply setpoint (written to the chiller)", source: src.mbl(PL, "TChiWatSupSet") }),
      point("net-uChiWatReq", "NET-IN", ot("g36-uChiWatReq"), null, { when: "opt.network_interface", label: "Chiller's chilled-water request", source: src.mbl(PL, "uChiWatReq") }),
      point("net-uConWatReq", "NET-IN", ot("g36-uConWatReq"), null, { when: `opt.network_interface and ${WC}`, label: "Chiller's condenser-water request", source: src.mbl(PL, "uConWatReq") }),
      point("net-demand-limit", "NET-OUT", ot("g36-yChiDem"), null, { when: "opt.network_interface", label: "Chiller demand limit", source: src.mbl(PL, "yChiDem") }),
    ],
  };
  const plant = {
    ...meta("chw-plant", "Chilled-water plant (once per plant)", ["MBL Plants/Chillers (plant-wide connectors)", "UFGS 23 09 00 §3.7.8.5.1", "UFC 3-410-01 Table 3-1, Chilled Water System"]),
    kind: "project" as const,
    applies_to: { family: "project", selector: "var.plants > 0", rank: 0 },
    variables: [{ id: "plants", from: "project.chw_plants", prompt: "Chilled-water plants in the project" }],
    options: [
      { id: "primary_secondary", label: "Primary/secondary pumping (common pipe, secondary loop)", default: false },
      { id: "waterside_economizer", label: "Waterside economizer (G36 have_WSE)", default: false },
      { id: "water_cooled", label: "Water-cooled chillers (condenser water to towers)", default: false },
      UFC_OPTION,
    ],
    lines: [
      device("controller", "system-controller", { qty: "var.plants", label: "Plant controller (programmable)", s223: "Controller", params: { class: "'programmable'" }, source: src.inferred("research 02 §3b typical 20") }),
      ...immersion("chws-sensor", "Chilled-water supply temperature sensor", src.mbl(PL, "TChiWatSup"), undefined, "var.plants"),
      point("chws-temp", "AI", xeto("WaterTempSensor"), "temperature-sensor", { qty: "var.plants", label: "Chilled-water supply temperature", source: src.mbl(PL, "TChiWatSup") }),
      ...immersion("chwr-sensor", "Chilled-water return temperature sensor", src.ufc("cws-07"), undefined, "var.plants"),
      point("chwr-temp", "AI", xeto("WaterTempSensor"), "temperature-sensor", { qty: "var.plants", label: "Chilled-water return temperature (central plant)", source: src.ufc("cws-07") }),
      device("flow-meter", "flow-meter", { qty: "var.plants", label: "Chilled-water flow meter", s223: "FlowSensor", source: src.mbl(PL, "VChiWat_flow") }),
      point("flow", "AI", xeto("WaterFlowSensor"), "flow-meter", { qty: "var.plants", label: "Chilled-water flow", source: src.mbl(PL, "VChiWat_flow") }),
      ...dpTransmitter("plant-dp-sensor", "Chilled-water differential pressure transmitter (local)", src.mbl(PL, "dpChiWat_local"), undefined, "var.plants"),
      point("plant-dp", "AI", xeto("WaterPressureSensor"), "pressure-sensor", { qty: "var.plants", label: "Chilled-water system differential pressure at the plant", source: src.mbl(PL, "dpChiWat_local") }),
      device("oa-temp-sensor", "temperature-sensor", { qty: "var.plants", label: "Outdoor air temperature sensor", s223: "TemperatureSensor", params: { form: "'outdoor'", medium: "'air'" }, source: src.mbl(PL, "TOut") }),
      point("oa-temp", "AI", xeto("AirTempSensor"), "temperature-sensor", { qty: "var.plants", label: "Outdoor air temperature", source: src.mbl(PL, "TOut") }),
      device("bypass-valve", "control-valve", { qty: "var.plants", label: "Minimum-flow bypass valve and actuator", s223: "TwoWayValve", params: { service: "'chw'", action: "'modulating'", cv: "<selection>" }, source: src.mbl(PL, "yMinValPosSet") }),
      point("bypass-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { qty: "var.plants", label: "Minimum-flow bypass valve command", source: src.mbl(PL, "yMinValPosSet") }),
      point("chw-pump-speed", "AO", xeto("MotorSpeedModulatingCmd"), null, { qty: "var.plants", label: "Chilled-water pump speed command (the group's; each pump's VFD takes it)", source: src.mbl(PL, "yChiPumSpe") }),
      ...immersion("common-pipe-sensor", "Common-pipe temperature sensor", src.ufc("cws-08"), "opt.primary_secondary", "var.plants"),
      point("common-pipe-temp", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: "opt.primary_secondary", qty: "var.plants", label: "Common-pipe water temperature", source: src.ufc("cws-08") }),
      device("secondary-flow-meter", "flow-meter", { when: "opt.primary_secondary", qty: "var.plants", label: "Secondary-loop flow meter", s223: "FlowSensor", source: src.ufc("cws-06") }),
      point("secondary-flow", "AI", xeto("WaterFlowSensor"), "flow-meter", { when: "opt.primary_secondary", qty: "var.plants", label: "Secondary-loop chilled-water flow", source: src.ufc("cws-06") }),
      ...dpTransmitter("remote-dp-sensor", "Remote differential pressure transmitter (secondary pump control)", src.mbl(PL, "dpChiWat_remote"), "opt.primary_secondary", "var.plants"),
      point("remote-dp", "AI", xeto("WaterPressureSensor"), "pressure-sensor", { when: "opt.primary_secondary", qty: "var.plants", label: "Chilled-water differential pressure used for the secondary pumps", source: src.ufc("cws-10") }),
      point("cw-pump-speed", "AO", xeto("MotorSpeedModulatingCmd"), null, { when: "opt.water_cooled", qty: "var.plants", label: "Condenser-water pump speed command", source: src.mbl(PL, "yConWatPumSpe") }),
      ...immersion("wse-sensors", "Waterside economizer return temperatures (upstream, downstream)", src.mbl(PL, "TChiWatRetUp"), "opt.waterside_economizer", "2 * var.plants"),
      point("wse-ret-up", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: "opt.waterside_economizer", qty: "var.plants", label: "Chilled-water return upstream of the economizer", source: src.mbl(PL, "TChiWatRetUp") }),
      point("wse-ret-down", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: "opt.waterside_economizer", qty: "var.plants", label: "Chilled-water return downstream of the economizer", source: src.mbl(PL, "TChiWatRetDow") }),
      device("wse-cw-valve-actuator", "control-valve", { when: "opt.waterside_economizer", qty: "var.plants", label: "Economizer condenser-water isolation valve", s223: "TwoWayValve", params: { service: "'cw'", action: "'two_position'" }, source: src.mbl(PL, "yEcoConWatIsoVal") }),
      point("wse-cw-valve", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: "opt.waterside_economizer", qty: "var.plants", label: "Economizer condenser-water isolation valve command", source: src.mbl(PL, "yEcoConWatIsoVal") }),
      labor("program", "sequence-programming", "per_typical", { qty: "var.plants", label: "Program the chilled-water plant sequence (G36)", source: src.inferred("research 02 §3a labor hooks") }),
      labor("graphic", "graphic", "per_typical", { qty: "var.plants", label: "Chilled-water plant graphic", source: src.inferred("research 02 §3a labor hooks") }),
      labor("pvt", "performance-verification-test", "per_typical", { qty: "var.plants", label: "Performance verification test (every primary system)", source: S00("§3.7.6 a(1)") }),
    ],
  };
  return [chiller, plant];
}

function tower() {
  const PER_CELL = "attr.cells";
  return {
    ...meta("cooling-tower", "Cooling tower (per tower, with per-cell points)", ["MBL Plants/Chillers (tower connectors)", "UFC 3-410-01 Table 3-1, Chilled Water System", "VA 23 09 23 Responsibility Table: cooling tower devices"]),
    applies_to: { family: "COOLING_TOWER", rank: 10 },
    options: [
      { id: "two_speed_fans", label: "Two-speed fan motors (high-low-off)", default: false, note: "UFC 3-410-01 Table 3-1: cooling tower fan status (high-low-off)." },
      { id: "cell_isolation_valves", label: "Motorized inlet isolation valve per cell (G36 have_towInlIsoVal)", default: false },
      { id: "vibration_switches", label: "Fan vibration switch per cell", default: false },
      { id: "basin_heater", label: "Basin heater control", default: false },
      { id: "bypass_valve", label: "Tower bypass valve", default: false },
    ],
    lines: [
      device("fan-vfd", "vfd", { when: "attr.vfd = 'yes'", qty: PER_CELL, label: "Tower fan variable frequency drive (per cell)", s223: "VariableFrequencyDrive", params: { hp: "attr.fan_hp" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: VFDs") }),
      device("fan-starter", "starter", { when: "attr.vfd = 'no'", qty: PER_CELL, label: "Tower fan starter (per cell; two-speed where so)", params: { hp: "attr.fan_hp" }, source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Starters, HOA switches") }),
      device("fan-relays", "relay", { when: "attr.vfd = 'no'", qty: `${PER_CELL} * if(opt.two_speed_fans, 2, 1)`, label: "Tower fan start relays", s223: "Actuator", source: src.mbl(PL, "yTowCel") }),
      point("fan-cmd", "BO", xeto("FanRunCmd"), "relay", { qty: `${PER_CELL} * if(opt.two_speed_fans, 2, 1)`, label: "Cell fan enable (and high speed, two-speed)", source: src.mbl(PL, "yTowCel") }),
      point("fan-status", "BI", xeto("FanRunSensor"), "relay", { qty: `${PER_CELL} * if(opt.two_speed_fans, 2, 1)`, label: "Cell fan status (high-low-off)", source: src.mbl(PL, "uTowSta") }),
      point("fan-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { when: "attr.vfd = 'yes'", label: "Tower fan speed command (the enabled cells')", source: src.mbl(PL, "yTowFanSpe") }),
      point("vfd-alarm", "BI", xeto("AlarmSensor"), "vfd", { when: "attr.vfd = 'yes'", qty: PER_CELL, label: "Tower fan VFD alarm (per cell)", source: src.ufc("cws-14") }),
      device("level-sensor", "level-sensor", { label: "Basin water level transmitter", s223: "Sensor", source: src.mbl(PL, "watLev") }),
      point("level", "AI", ot("basin-water-level"), "level-sensor", { label: "Basin water level", source: src.mbl(PL, "watLev") }),
      device("makeup-valve", "makeup-valve", { label: "Makeup water solenoid valve", s223: "TwoWayValve", source: src.mbl(PL, "yMakUp") }),
      point("makeup", "BO", xeto("WaterValveOpenCmd"), "makeup-valve", { label: "Makeup water valve", source: src.mbl(PL, "yMakUp") }),
      ...immersion("cw-temps", "Condenser-water supply and return temperature sensors", src.mbl(PL, "TConWatSup"), undefined, "2"),
      point("cw-supply", "AI", xeto("WaterTempSensor"), "temperature-sensor", { label: "Condenser-water supply temperature (to the chillers)", source: src.mbl(PL, "TConWatSup") }),
      point("cw-return", "AI", xeto("WaterTempSensor"), "temperature-sensor", { label: "Condenser-water return temperature (to the tower)", source: src.mbl(PL, "TConWatTowRet") }),
      device("cell-isolation-valves", "control-valve", { when: "opt.cell_isolation_valves", qty: PER_CELL, label: "Cell inlet isolation valve and actuator", s223: "TwoWayValve", params: { service: "'cw'", action: "'two_position'" }, source: src.mbl(PL, "yTowCelIsoVal") }),
      point("cell-isolation", "BO", xeto("WaterValveOpenCmd"), "control-valve", { when: "opt.cell_isolation_valves", qty: PER_CELL, label: "Cell isolation valve command", source: src.mbl(PL, "yTowCelIsoVal") }),
      device("vibration-switches", "vibration-switch", { when: "opt.vibration_switches", qty: PER_CELL, label: "Fan vibration switch", s223: "Sensor", source: src.va("23 09 23 (03-01-23)", "§1.1 Responsibility Table: Cooling Tower Vibration Switches") }),
      point("vibration", "BI", ot("vibration-switch"), "vibration-switch", { when: "opt.vibration_switches", qty: PER_CELL, label: "Fan vibration alarm", source: S13("§2.7.13: vibration switch") }),
      device("basin-heater", "factory-interface", { when: "opt.basin_heater", label: "Basin heater contactor", source: src.inferred("research 02 §3b typical 21: optional basin heater") }),
      point("basin-heater-cmd", "BO", xeto("HeatEnableCmd"), "factory-interface", { when: "opt.basin_heater", label: "Basin heater enable", source: src.inferred("research 02 §3b typical 21") }),
      device("bypass-valve", "control-valve", { when: "opt.bypass_valve", label: "Tower bypass valve and actuator", s223: "ThreeWayValve", params: { service: "'cw'", action: "'modulating'", cv: "<selection>" }, source: src.ufc("cws-16") }),
      point("bypass-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: "opt.bypass_valve", label: "Cooling tower bypass valve position", source: src.ufc("cws-16") }),
    ],
  };
}

function heatExchanger() {
  const STEAM = "attr.primary_medium = 'steam'";
  return {
    ...meta("heat-exchanger", "Heat exchanger (steam or hot water to water)", ["UFGS 23 09 93 §3.4.1, §3.4.3", "UFGS 23 09 00 §3.7.8.5.3", "UFC 3-410-01 Table 3-1 (heat exchanger temperatures)"]),
    applies_to: { family: "HEAT_EXCHANGER", rank: 10 },
    options: [
      { id: "isolation_valve", label: "Motorized isolation valve with status", default: false, note: "UFGS 23 09 00 §3.7.8.5.3 b." },
      { id: "condensate_pump", label: "Condensate pump status (steam)", default: false },
      UFC_OPTION,
    ],
    lines: [
      device("controller", "system-controller", { label: "Controller (shared with the heating plant where so)", s223: "Controller", params: { class: "'programmable'" }, source: S93("§3.4.1: HW from steam/HTHW converter") }),
      device("control-valve", "control-valve", { label: "Primary-side control valve and actuator (normally closed, spring return for steam)", s223: "TwoWayValve", params: { service: "attr.primary_medium", action: "'modulating'", characteristic: `if(${STEAM}, 'linear', 'equal_percentage')`, lb_hr: "attr.primary_steam_lb_hr", psig: "attr.primary_steam_psig", gpm: "attr.primary_gpm", cv: "<selection>" }, source: S13("§2.5: steam valves linear; HTHW normally closed") }),
      point("valve-cmd", "AO", xeto("ValveModulatingCmd"), "control-valve", { label: "Primary (steam or hot-water) control valve command", source: S00("§3.7.8.5.3 item a: steam control valve command") }),
      ...immersion("secondary-supply-sensor", "Secondary supply temperature sensor", S93("§3.4.1: HWS-T")),
      point("secondary-supply", "AI", xeto("WaterTempSensor"), "temperature-sensor", { label: "Secondary supply (leaving) temperature", source: src.ufc("hwhs-12") }),
      ...immersion("hx-temps-ufc", "Heat exchanger inlet temperature sensors and primary leaving sensor", src.ufc("hwhs-11"), UFC, "if(" + STEAM + ", 1, 3)"),
      point("hx-inlet", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: UFC, qty: `if(${STEAM}, 1, 2)`, label: "Heat exchanger inlet temperatures (secondary; primary for water)", source: src.ufc("hwhs-11") }),
      point("hx-primary-leaving", "AI", xeto("WaterTempSensor"), "temperature-sensor", { when: `${UFC} and not ${STEAM}`, label: "Heat exchanger primary leaving temperature", source: src.ufc("hwhs-12") }),
      device("low-pressure-switch", "pressure-switch", { when: STEAM, label: "Heat exchanger low-limit pressure switch (hardwired to the valve)", s223: "Sensor", source: S93("§3.4.3: HX-P-LL hardwired") }),
      point("low-pressure", "BI", ot("hx-low-limit"), "pressure-switch", { when: STEAM, label: "Heat exchanger low limit (HX-P-LL)", source: S93("§3.4.3") }),
      device("isolation-valve", "control-valve", { when: "opt.isolation_valve", label: "Isolation valve and actuator (2-position)", s223: "TwoWayValve", params: { action: "'two_position'" }, source: S00("§3.7.8.5.3 item b") }),
      point("isolation-cmd", "BO", xeto("ValveOpenCmd"), "control-valve", { when: "opt.isolation_valve", label: "Heat exchanger isolation valve command", source: S00("§3.7.8.5.3 item b") }),
      device("isolation-switch", "end-switch", { when: "opt.isolation_valve", label: "Isolation valve end switch", s223: "Sensor", source: S00("§3.7.8.5.3 item b") }),
      point("isolation-status", "BI", xeto("ValveOpenSensor"), "end-switch", { when: "opt.isolation_valve", label: "Heat exchanger isolation valve status", source: S00("§3.7.8.5.3 item b") }),
      device("condensate-pump-switch", "current-switch", { when: `opt.condensate_pump and ${STEAM}`, label: "Condensate pump status switch", s223: "ElectricCurrentSensor", source: src.ufc("hwhs-14") }),
      point("condensate-pump", "BI", xeto("MotorRunSensor"), "current-switch", { when: `opt.condensate_pump and ${STEAM}`, label: "Condensate return pump status", source: src.ufc("hwhs-14") }),
    ],
  };
}

function humidifier() {
  const STEAM = "attr.humidifier_type = 'steam_to_steam' or attr.humidifier_type = 'direct_injection'";
  return {
    ...meta("humidifier", "Humidifier", ["UFGS 23 09 93 §3.2.6", "UFGS 23 09 13 §3.1.10"]),
    applies_to: { family: "HUMIDIFIER", rank: 10 },
    options: [{ id: "space_humidity", label: "Space humidity sensor (otherwise return air)", default: false }],
    lines: [
      device("steam-valve", "control-valve", { when: STEAM, label: "Humidifier steam valve and actuator", s223: "TwoWayValve", params: { service: "'steam'", action: "'modulating'", lb_hr: "attr.capacity_lb_hr", cv: "<selection>" }, source: S93("§3.2.6: humidifier valve") }),
      device("humidifier-controls", "factory-interface", { when: `not (${STEAM})`, label: "Humidifier controls (factory: electrode, resistive, gas-fired, evaporative or atomizing)", params: { type: "attr.humidifier_type", lb_hr: "attr.capacity_lb_hr" }, source: src.inferred("a self-generating humidifier modulates by its own controls from the BAS signal") }),
      point("output-cmd", "AO", xeto("ModulatingCmd"), null, { label: "Humidifier output command", source: S93("§3.2.6.9: humidification control") }),
      point("enable", "BO", xeto("EnableCmd"), null, { label: "Humidifier enable", source: src.inferred("research 02 §3b typical 23: enable BO") }),
      point("alarm", "BI", xeto("AlarmSensor"), null, { label: "Humidifier alarm", source: src.inferred("research 02 §3b typical 23: alarm BI") }),
      device("rh-sensor", "humidity-sensor", { label: "Space or return air humidity sensor", s223: "HumiditySensor", params: { form: "if(opt.space_humidity, 'space', 'duct')" }, source: S93("§3.2.6: ZN-RH") }),
      point("rh", "AI", xeto("AirHumiditySensor"), "humidity-sensor", { label: "Space or return air relative humidity", source: S93("§3.2.6: ZN-RH") }),
      device("high-limit-sensor", "humidity-sensor", { label: "Supply air humidity high-limit sensor (at least 10 ft downstream)", s223: "HumiditySensor", params: { form: "'duct'" }, source: S13("§3.1.10: duct RH sensor at least 10 ft downstream of the humidifier") }),
      point("sa-rh", "AI", xeto("DuctAirHumiditySensor"), "humidity-sensor", { label: "Supply air relative humidity (high limit)", source: S93("§3.2.6: SA-RH high limit") }),
      device("airflow-switch", "pressure-switch", { label: "Airflow proving switch (interlock)", s223: "Sensor", params: { medium: "'air'" }, source: src.inferred("research 02 §3b typical 23: airflow-proof interlock") }),
    ],
  };
}

function erv() {
  const HW = "not opt.packaged_controls";
  const WHEEL = `${HW} and attr.recovery_type = 'wheel'`;
  return {
    ...meta("erv", "Energy or heat recovery ventilator", ["UFGS 23 09 00 §3.7.8.5.5 (energy recovery points)", "UFC 3-410-01 Table 3-1 (wheel rotation, fan status)", "[inferred] research 02 §3b typical 24"]),
    applies_to: { family: "ERV", rank: 10 },
    options: [
      { id: "packaged_controls", label: "Packaged unit controls on the network (the BAS reads and writes network points)", default: false, note: "ERV schedules carry no interface column in the attribute schema; set it per project." },
      { id: "variable_speed_wheel", label: "Variable-speed wheel", default: false },
      { id: "frost_control", label: "Frost control (defrost cycle)", default: false },
    ],
    lines: [
      device("controller", "system-controller", { when: HW, label: "ERV controller", s223: "Controller", params: { class: "'programmable'" }, source: src.inferred("research 02 §3b typical 24") }),
      device("network-interface", "network-interface", { when: "opt.packaged_controls", label: "Packaged ERV network interface", s223: "Controller", source: src.inferred("research 02 §3b typical 24: packaged ERV, network variant") }),
      ...([["enable", "NET-OUT", "Unit enable"], ["status", "NET-IN", "Unit status"], ["supply-temp", "NET-IN", "Supply air temperature"], ["alarm", "NET-IN", "Unit alarm"]] as const)
        .map(([id, io, label]) => point(`net-${id}`, io, ot(`erv-${id}`), null, { when: "opt.packaged_controls", label, source: src.inferred("research 02 §3b typical 24: packaged ERV, network variant") })),
      device("fan-relays", "relay", { when: HW, qty: "2", label: "Supply and exhaust fan start relays", s223: "Actuator", source: src.inferred("research 02 §3b typical 24") }),
      point("sf-cmd", "BO", xeto("FanRunCmd"), "relay", { when: HW, label: "Supply (outdoor air) fan start/stop", source: src.inferred("research 02 §3b typical 24") }),
      point("ef-cmd", "BO", xeto("FanRunCmd"), "relay", { when: HW, label: "Exhaust fan start/stop", source: src.inferred("research 02 §3b typical 24") }),
      device("fan-status-switches", "current-switch", { when: HW, qty: "2", label: "Supply and exhaust fan current switches", s223: "ElectricCurrentSensor", source: src.ufc("ads-24") }),
      point("sf-status", "BI", xeto("FanRunSensor"), "current-switch", { when: HW, label: "Outdoor air (supply) fan status", source: src.ufc("ads-24") }),
      point("ef-status", "BI", xeto("FanRunSensor"), "current-switch", { when: HW, label: "Exhaust fan status", source: src.ufc("ads-23") }),
      device("wheel-interface", "factory-interface", { when: WHEEL, label: "Wheel motor controls (factory)", source: src.inferred("research 02 §3b typical 24") }),
      point("wheel-cmd", "BO", xeto("MotorRunCmd"), "factory-interface", { when: WHEEL, label: "Wheel start/stop", source: src.inferred("research 02 §3b typical 24: wheel S/S BO") }),
      device("wheel-rotation-sensor", "current-switch", { when: WHEEL, label: "Wheel rotation sensor", s223: "Sensor", source: src.ufc("ads-25") }),
      point("wheel-status", "BI", xeto("MotorRunSensor"), "current-switch", { when: WHEEL, label: "Energy recovery wheel rotation status", source: src.ufc("ads-25") }),
      point("wheel-speed", "AO", xeto("MotorSpeedModulatingCmd"), "factory-interface", { when: `${WHEEL} and opt.variable_speed_wheel`, label: "Wheel speed command", source: src.inferred("research 02 §3b typical 24: speed AO") }),
      point("defrost", "BO", ot("wheel-defrost-cmd"), "factory-interface", { when: `${WHEEL} and opt.frost_control`, label: "Frost control (defrost) command", source: S00("§3.7.8.5.5 item g") }),
      device("bypass-actuator", "damper-actuator", { when: `${HW} and (attr.recovery_type = 'plate' or attr.recovery_type = 'heat_pipe')`, label: "Bypass damper actuator", s223: "Actuator", params: { signal: "'modulating'", fail: "'open'" }, source: S00("§3.7.8.5.5 item f") }),
      point("bypass-cmd", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: `${HW} and (attr.recovery_type = 'plate' or attr.recovery_type = 'heat_pipe')`, label: "Bypass damper command", source: S00("§3.7.8.5.5 item f") }),
      device("runaround-valve", "control-valve", { when: `${HW} and attr.recovery_type = 'runaround'`, label: "Runaround loop 3-way valve and actuator", s223: "ThreeWayValve", params: { service: "'glycol'", body: "'3-way'", action: "'modulating'", cv: "<selection>" }, source: src.inferred("research 02 §3b typical 24: run-around pump plus 3-way valve") }),
      point("runaround-valve-cmd", "AO", xeto("WaterValveModulatingCmd"), "control-valve", { when: `${HW} and attr.recovery_type = 'runaround'`, label: "Runaround loop valve command", source: src.inferred("research 02 §3b typical 24") }),
      point("runaround-pump", "BO", xeto("MotorRunCmd"), "relay", { when: `${HW} and attr.recovery_type = 'runaround'`, label: "Runaround loop pump start/stop", source: src.inferred("research 02 §3b typical 24") }),
      device("four-stream-sensors", "temperature-sensor", { when: HW, qty: "4", label: "Air temperature sensors, all four streams", s223: "TemperatureSensor", params: { form: "'duct'", medium: "'air'" }, source: src.inferred("research 02 §3b typical 24: four-stream temperatures") }),
      point("stream-temps", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: HW, qty: "4", label: "Outdoor, supply, return and exhaust air temperatures", source: S00("§3.7.8.5.5 item a, h, s, v") }),
      labor("program", "sequence-programming", "per_typical", { label: "Program the ERV sequence", source: src.inferred("research 02 §3a labor hooks") }),
    ],
  };
}

function building() {
  return {
    ...meta("building-meters", "Building level: utility meters, shutdown switch, outdoor conditions", ["UFC 3-410-01 Table 3-1, General Building Systems", "UFGS 23 09 13 §2.7.8.4 (energy metering)", "UFGS 23 09 93 §3.1 (system scheduler)"]),
    kind: "project" as const,
    applies_to: { family: "project", rank: 0 },
    variables: [
      { id: "buildings", from: "project.buildings", prompt: "Buildings in the project" },
      { id: "gas", from: "project.gas_service", prompt: "Does the building have natural gas service?" },
      { id: "steam", from: "project.steam_service", prompt: "Does the building have steam service?" },
    ],
    options: [],
    lines: [
      device("electric-meter", "electric-meter", { qty: "var.buildings", label: "Building electrical meter (pulse or network output)", s223: "ElectricityMeter", source: S13("§2.7.8.4.2: watthour revenue meter") }),
      point("electric", "PULSE", ot("electric-energy"), "electric-meter", { qty: "var.buildings", label: "Building electrical energy", source: src.ufc("gbs-01") }),
      device("water-meter", "utility-meter", { qty: "var.buildings", label: "Building water meter (pulse output)", s223: "Sensor", params: { utility: "'water'" }, source: src.ufc("gbs-02") }),
      point("water", "PULSE", xeto("WaterVolumeSensor"), "utility-meter", { qty: "var.buildings", label: "Building water use", source: src.ufc("gbs-02") }),
      device("gas-meter", "utility-meter", { when: "var.gas", qty: "var.buildings", label: "Building natural gas meter (pulse output)", s223: "Sensor", params: { utility: "'natural_gas'" }, source: src.ufc("gbs-03") }),
      point("gas", "PULSE", ot("natural-gas-volume"), "utility-meter", { when: "var.gas", qty: "var.buildings", label: "Building natural gas use", source: src.ufc("gbs-03") }),
      device("steam-meter", "utility-meter", { when: "var.steam", qty: "var.buildings", label: "Building steam meter", s223: "Sensor", params: { utility: "'steam'" }, source: S13("§2.7.8.4.3: steam meters") }),
      point("steam", "PULSE", xeto("SteamMassFlowSensor"), "utility-meter", { when: "var.steam", qty: "var.buildings", label: "Building steam use", source: src.ufc("gbs-04") }),
      device("shutdown-switch", "shutdown-switch", { qty: "var.buildings", label: "HVAC equipment shutdown switch", s223: "Sensor", source: src.ufc("gbs-05") }),
      point("shutdown", "BI", ot("hvac-shutdown-switch"), "shutdown-switch", { qty: "var.buildings", label: "HVAC equipment shutdown switch status", source: src.ufc("gbs-05") }),
      device("oa-sensors", "humidity-sensor", { qty: "var.buildings", label: "Building outdoor air temperature and humidity transmitter", s223: "HumiditySensor", params: { form: "'outdoor'" }, source: src.inferred("research 02 §3b typical 26: building-level OA temperature, humidity and dewpoint") }),
      point("oa-temp", "AI", xeto("AirTempSensor"), "humidity-sensor", { qty: "var.buildings", label: "Outdoor air temperature (building)", source: src.inferred("research 02 §3b typical 26") }),
      point("oa-rh", "AI", xeto("AirHumiditySensor"), "humidity-sensor", { qty: "var.buildings", label: "Outdoor air relative humidity (building)", source: src.inferred("research 02 §3b typical 26") }),
      point("scheduler", "SOFT", ot("system-scheduler"), null, { qty: "var.buildings", label: "System scheduler (occupancy)", source: S93("§3.1.2: system scheduler requirements") }),
      note("navy-metering", "UFC 3-410-01 Table 3-1, footnote: on Navy projects, building metering is coordinated with the RFP and base utilities; DDC totalizing is not required for utilities on an AMI or base-wide smart metering system.", { source: src.ufc410("Table 3-1 footnote") }),
    ],
  };
}

export function plantTypicals() {
  return [...pumps(), ...fans(), ...boilers(), ...chillers(), tower(), heatExchanger(), humidifier(), erv(), building()];
}
