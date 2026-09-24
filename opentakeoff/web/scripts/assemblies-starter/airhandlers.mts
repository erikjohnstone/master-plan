// ASSEMBLIES WP4 — starter typicals for air handlers (research 02 §3b,
// typicals 7–10 and 13): G36 multizone and single-zone VAV air handlers
// from the Modelica Buildings Library, the UFGS 23 09 93 §3.2 sequences
// (constant volume), UFGS 23 09 00 §3.7.8.5.5 (DOAS) and UFC 3-410-01
// Table 3-1 (the DoD minimum, behind an option).
import { device, labor, point, src, type Line } from "./common.mts";
import { ot, xeto, ZONE_OPTIONS } from "./terminals.mts";

const MZ = "AHUs/MultiZone/VAV", SZ = "AHUs/SingleZone/VAV";
export const AHU_FAMILIES = ["AHU", "RTU"];
export const DOAS_FAMILIES = ["DOAS", "DOAH_UNIT", "DOAH_HANDLING", "OUTDOOR_AIR_UNIT"];

const CHW = "attr.cooling_type = 'chw'";
const DX_MOD = "(attr.cooling_type = 'dx' and not opt.dx_staged)";
const DX_STAGED = "(attr.cooling_type = 'dx' and opt.dx_staged)";
const UFC = "opt.ufc_minimum_points";

export const AHU_COMMON_OPTIONS = [
  { id: "dx_staged", label: "DX cooling in compressor stages (otherwise a modulating capacity signal, as G36 models it)", auto: "attr.cooling_type = 'dx' and attr.dx_stages > 0" },
  { id: "freezestat_to_bas", label: "Freezestat wired to the BAS controller (otherwise hardwired to the fan starter or VFD and monitored)", default: true, note: "G36 freSta: Hardwired_to_BAS; UFGS 23 09 93 §3.2 hardwires the safety and monitors it." },
  { id: "duct_smoke_detectors", label: "Supply and return duct smoke detectors, monitored", default: true, note: "UFGS 23 09 93 §3.2.3.4 and §3.2.9.4 list SA-SMK and RA-SMK among the safeties." },
  { id: "ufc_minimum_points", label: "UFC 3-410-01 Table 3-1 minimum points (DoD projects)", default: false, note: "UFC 3-410-01 §3-2.3.4 (IMC 309.1) requires Table 3-1 on DoD projects; on for NAVFAC, USACE and AFCEC work." },
];

const PRESSURE_OPTIONS = [
  { id: "relief_damper", label: "Modulating relief damper controlling building pressure (G36 buiPreCon ReliefDamper)", default: false },
  { id: "relief_fan", label: "Relief fan controlling building pressure (G36 ReliefFan)", default: false },
  { id: "return_fan", label: "Return fan (G36 ReturnFanMeasuredAir or ReturnFanDp)", default: false },
];
const ECONOMIZER_OPTIONS = [
  { id: "enthalpy_economizer", label: "Enthalpy economizer high limit (outdoor enthalpy)", default: false, note: "G36 ecoHigLimCon FixedEnthalpyWithFixedDryBulb or DifferentialEnthalpyWithFixedDryBulb." },
  { id: "differential_economizer", label: "Differential economizer high limit (compares return air)", default: false, note: "G36 DifferentialDryBulb (dry bulb) or DifferentialEnthalpyWithFixedDryBulb (enthalpy)." },
];

const controller = (label: string): Line => device("controller", "system-controller", { label, s223: "Controller", params: { class: "'programmable'" }, source: src.inferred("research 02 §3b: air handlers use a programmable controller (UFC 3-410-02 §4-5)") });

const vfd = (id: string, fan: string, when?: string): Line => device(id, "vfd", { ...(when ? { when } : {}), label: `${fan} variable frequency drive (with integral H-O-A)`, s223: "VariableFrequencyDrive", source: src.ufgs("23 09 93", "§3.2.9.1: supply fan VFD with integral H-O-A and a fire-alarm override input") });

const actuator = (id: string, label: string, fail: string, when?: string, signal = "'modulating'"): Line =>
  device(id, "damper-actuator", { ...(when ? { when } : {}), label, s223: "Actuator", params: { signal, fail, spring_return: true }, source: src.ufgs("23 09 13", "§3.1.13.1: outdoor, makeup and relief dampers fail closed with spring return") });

const tempSensor = (id: string, label: string, form: string, source: ReturnType<typeof src.mbl>, when?: string, qty?: string): Line =>
  device(id, "temperature-sensor", { ...(when ? { when } : {}), ...(qty ? { qty } : {}), label, s223: "TemperatureSensor", params: { form: `'${form}'`, medium: "'air'" }, source });

/** Coils, heating and cooling, with the G36 valve commands where G36 has
 * them and the UFGS sequences where it does not. */
function coilLines(block: string, heatWhen: string, szFeedback: boolean): Line[] {
  const lines: Line[] = [
    device("chw-valve", "control-valve", { when: CHW, label: "Chilled-water coil control valve and actuator", s223: "TwoWayValve", params: { service: "'chw'", body: "'2-way'", action: "'modulating'", line_size_in: "attr.chw_conn_in", gpm: "attr.chw_gpm", coil_wpd_ft: "attr.chw_wpd_ft", cv: "<selection>", fail: "<selection>" }, source: src.ufgs("23 09 13", "§2.5: modulating 2-way, equal-percentage for liquid") }),
    device("dx-interface", "factory-interface", { when: "attr.cooling_type = 'dx'", label: "DX compressor controls (factory)", params: { stages: "attr.dx_stages", control: "if(opt.dx_staged, 'staged', 'modulating')" }, source: src.inferred("research 02 §3b typical 7: DX stage BOs, or G36's modulating cooling signal") }),
    point("cooling-cmd", "AO", xeto("CoolModulatingCmd"), "control-valve", { when: `${CHW} or ${DX_MOD}`, label: "Cooling coil valve or DX capacity command", source: src.mbl(block, "yCooCoi") }),
    point("dx-stages", "BO", xeto("CoolRunCmd"), "factory-interface", { when: DX_STAGED, qty: "attr.dx_stages", label: "DX cooling stage commands (one per stage)", source: src.ufgs("23 09 93", "§3.2.3.8: [DX] cooling coil control") }),
    device("hw-valve", "control-valve", { when: "attr.heating_type = 'hw'", label: "Hot-water coil control valve and actuator", s223: "TwoWayValve", params: { service: "'hw'", body: "'2-way'", action: "'modulating'", line_size_in: "attr.hw_conn_in", gpm: "attr.hw_gpm", coil_wpd_ft: "attr.hw_wpd_ft", cv: "<selection>", fail: "<selection>" }, source: src.ufgs("23 09 13", "§2.5; §3.1.13.1: spring return where freeze protection applies") }),
    point("heating-cmd", "AO", xeto("HeatModulatingCmd"), "control-valve", { when: heatWhen, label: "Heating coil valve (or SCR) command", source: src.mbl(block, "yHeaCoi") }),
    device("steam-valve", "control-valve", { when: "attr.heating_type = 'steam'", label: "Steam coil control valve and actuator", s223: "TwoWayValve", params: { service: "'steam'", body: "'2-way'", action: "'modulating'", characteristic: "'linear'", psig: "attr.steam_psig", lb_hr: "attr.steam_lb_hr", cv: "<selection>", fail: "'normally_open'" }, source: src.ufgs("23 09 13", "§2.5: linear characteristic for steam") }),
    point("steam-cmd", "AO", xeto("ValveModulatingCmd"), "control-valve", { when: "attr.heating_type = 'steam'", label: "Steam coil valve command", source: src.ufgs("23 09 93", "§3.2.9.10: preheat coil control") }),
    device("heat-interface", "factory-interface", { when: "attr.heating_type = 'electric' or attr.heating_type = 'gas'", label: "Electric or gas heat controls (factory)", params: { kw: "attr.eh_kw", gas_input_mbh: "attr.gas_input_mbh" }, source: src.inferred("research 02 §3b typical 7: packaged heat sections are staged or modulated by factory controls") }),
    point("gas-heat", "BO", xeto("HeatEnableCmd"), "factory-interface", { when: "attr.heating_type = 'gas'", label: "Gas heat enable (first stage; more stages per the unit's controls)", source: src.ufgs("23 09 93", "§3.2.1: outputs are fan, heat and cool stages") }),
  ];
  if (szFeedback) {
    lines.push(
      point("cooling-feedback", "AI", xeto("CoolModulatingSensor"), "control-valve", { when: `${CHW} or ${DX_MOD}`, label: "Cooling coil valve actual position", source: src.mbl(block, "uCooCoi_actual") }),
      point("heating-feedback", "AI", xeto("WaterValveModulatingSensor"), "control-valve", { when: "attr.heating_type = 'hw'", label: "Heating coil valve actual position", source: src.mbl(block, "uHeaCoi_actual") }),
    );
  }
  return lines;
}

/** Safeties UFGS 23 09 93 §3.2 hardwires and monitors; the freezestat is
 * G36's input when it is wired to the BAS. */
function safeties(block: string, highStatic: boolean): Line[] {
  const f = (block === MZ ? "u1FreSta" : "u1FreSta");
  return [
    device("freezestat-switch", "freezestat", { label: "Low-limit thermostat (freezestat), manual reset, averaging element", s223: "Sensor", params: { element: "'averaging'" }, source: src.ufgs("23 09 13", "§2.7.20 temperature switch; UFGS 23 09 93 §3.2.9.4.2 a") }),
    point("freezestat", "BI", ot("freeze-stat"), "freezestat", { when: "opt.freezestat_to_bas", label: "Freezestat (low limit) status", source: src.mbl(block, f) }),
    point("freezestat-monitor", "BI", ot("freeze-stat"), "freezestat", { when: "not opt.freezestat_to_bas", label: "Freezestat (low limit) status, hardwired to the fan and monitored", source: src.ufgs("23 09 93", "§3.2.9.4: direct-hardwire interlock safeties and monitor them") }),
    device("smoke-detectors", "smoke-detector", { when: "opt.duct_smoke_detectors", qty: "2", label: "Supply and return duct smoke detectors", s223: "Sensor", source: src.ufgs("23 09 93", "§3.2.9.4.2 c-d: SA-SMK, RA-SMK") }),
    point("smoke", "BI", ot("smoke-detector-status"), "smoke-detector", { when: "opt.duct_smoke_detectors", qty: "2", label: "Supply and return smoke detector status", source: src.ufgs("23 09 93", "§3.2.9.4.2 c-d: SA-SMK, RA-SMK") }),
    ...(highStatic ? [
      device("high-static-switch", "pressure-switch", { label: "Supply duct high static pressure switch (manual reset)", s223: "Sensor", params: { medium: "'air'" }, source: src.ufgs("23 09 93", "§3.2.9.4.2 b: SA-P-HL") }),
      point("high-static", "BI", ot("duct-high-static"), "pressure-switch", { label: "Supply duct high static limit", source: src.ufgs("23 09 93", "§3.2.9.4.2 b: SA-P-HL") }),
    ] : []),
  ];
}

/** UFC 3-410-01 Table 3-1 items G36 does not already give the air handler. */
function ufcAirLines(o: { raPresent: string; maPresent: string; supplyFlowPresent: string; supplySpeedPresent: boolean }): Line[] {
  const coils = "max(0, if(attr.cooling_type != 'none', 1, 0) + if(attr.heating_type != 'none', 1, 0) - 1)";
  return [
    device("sa-humidity-sensor", "humidity-sensor", { when: UFC, label: "Supply air humidity (dewpoint) sensor", s223: "HumiditySensor", params: { form: "'duct'" }, source: src.ufc("ads-02") }),
    point("sa-dewpoint", "AI", xeto("DuctAirHumiditySensor"), "humidity-sensor", { when: UFC, label: "Supply air dewpoint temperature", source: src.ufc("ads-02") }),
    device("sa-airflow-station", "airflow-station", { when: `${UFC} and not (${o.supplyFlowPresent})`, label: "Supply airflow measuring station", s223: "FlowSensor", source: src.ufc("ads-04") }),
    point("sa-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-station", { when: `${UFC} and not (${o.supplyFlowPresent})`, label: "Supply airflow rate", source: src.ufc("ads-04") }),
    device("oa-humidity-sensor", "humidity-sensor", { when: `${UFC} and not opt.enthalpy_economizer`, label: "Outdoor air humidity sensor", s223: "HumiditySensor", params: { form: "'outdoor'" }, source: src.ufc("ads-06") }),
    point("oa-rh", "AI", xeto("AirHumiditySensor"), "humidity-sensor", { when: `${UFC} and not opt.enthalpy_economizer`, label: "Outdoor air relative humidity", source: src.ufc("ads-06") }),
    point("oa-dewpoint", "SOFT", ot("outdoor-air-dewpoint"), null, { when: UFC, label: "Calculated outdoor air dewpoint", source: src.ufc("ads-07") }),
    tempSensor("ra-temp-sensor-ufc", "Return air temperature sensor", "duct", src.ufc("ads-08"), `${UFC} and not (${o.raPresent})`),
    point("ra-temp-ufc", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: `${UFC} and not (${o.raPresent})`, label: "Return air temperature", source: src.ufc("ads-08") }),
    tempSensor("ma-temp-sensor-ufc", "Mixed air temperature sensor (averaging)", "averaging", src.ufc("ads-09"), `${UFC} and not (${o.maPresent})`),
    point("ma-temp-ufc", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: `${UFC} and not (${o.maPresent})`, label: "Mixed air temperature", source: src.ufc("ads-09") }),
    tempSensor("coil-lat-sensors", "Coil leaving air temperature sensors (each coil but the last, which the supply sensor reads)", "averaging", src.ufc("ads-10"), UFC, coils),
    point("coil-lat", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: UFC, qty: coils, label: "Discharge temperature from each heat transfer device", source: src.ufc("ads-10") }),
    device("filter-switch", "pressure-switch", { when: UFC, label: "Filter differential pressure switch", s223: "Sensor", params: { medium: "'air'" }, source: src.ufc("ads-11") }),
    point("filter", "BI", ot("filter-status"), "pressure-switch", { when: UFC, label: "Filter status", source: src.ufc("ads-11") }),
    point("heater-status", "BI", xeto("HeatRunSensor"), "factory-interface", { when: `${UFC} and attr.heating_type = 'electric'`, label: "Electric heater status (on/off and stages energized or % power)", source: src.ufc("ads-16") }),
    ...(o.supplySpeedPresent ? [] : [point("sf-speed", "AI", xeto("FanSpeedModulatingSensor"), "vfd", { when: UFC, label: "Supply fan actual speed", source: src.ufc("ads-20") })]),
    point("rf-speed", "AI", xeto("FanSpeedModulatingSensor"), "vfd", { when: `${UFC} and opt.return_fan`, label: "Return fan actual speed", source: src.ufc("ads-20") }),
    point("sf-alarm", "BI", xeto("AlarmSensor"), "vfd", { when: UFC, label: "Supply fan alarm (VFD fault)", source: src.ufc("ads-22") }),
    point("rf-alarm", "BI", xeto("AlarmSensor"), "vfd", { when: `${UFC} and opt.return_fan`, label: "Return fan alarm (VFD fault)", source: src.ufc("ads-22") }),
  ];
}

const ahuLabor = (): Line[] => [
  labor("program", "sequence-programming", "per_typical", { label: "Program the air handler sequence", source: src.inferred("research 02 §3a labor hooks: programming per sequence") }),
  labor("graphic", "graphic", "per_typical", { label: "Air handler graphic", source: src.inferred("research 02 §3a labor hooks: graphics") }),
  labor("pvt", "performance-verification-test", "per_typical", { label: "Performance verification test (every air handler)", source: src.ufgs("23 09 00", "§3.7.6 a(2): 100 percent of air handling unit systems") }),
];

const meta = (id: string, title: string, provenance: string[]) => ({
  id, version: "1", title, kind: "equipment" as const, status: "starter" as const,
  provenance: provenance.map((p) => ({ source: p, license: p.startsWith("MBL") ? "BSD-3-Clause-LBNL" : p.startsWith("[inferred]") ? "Apache-2.0" : "LicenseRef-US-Government-Work", derivation: (p.startsWith("[inferred]") ? "inferred" : "paraphrase") as "inferred" | "paraphrase" })),
});

export function airHandlerTypicals() {
  // G36 multizone: the pieces each building-pressure and outdoor-air design adds.
  const DP = "(opt.dedicated_min_oa and opt.min_oa_dp)";
  const mz = {
    ...meta("ahu-multizone-vav", "Multizone VAV air handler", ["MBL AHUs/MultiZone/VAV (have_ahuRelFan = true)", "UFGS 23 09 93 §3.2.9", "UFGS 23 09 00 §3.7.8.5.4", "UFC 3-410-01 Table 3-1, Air Distribution System"]),
    applies_to: { family: AHU_FAMILIES, selector: "attr.vfd = 'yes' and attr.terminals_served > 0", rank: 20 },
    options: [
      { id: "dedicated_min_oa", label: "A separate minimum outdoor-air damper (G36 minOADes DedicatedDampers*)", default: true, note: "UFGS 23 09 93 §3.2.9.7 controls minimum outdoor air with its own damper and flow measurement." },
      { id: "min_oa_dp", label: "Minimum outdoor air by the dedicated damper's pressure difference (G36 DedicatedDampersPressure)", default: false },
      ...PRESSURE_OPTIONS,
      { id: "return_fan_airflow", label: "Return fan tracks measured supply and return airflow (G36 ReturnFanMeasuredAir; otherwise building pressure, ReturnFanDp)", default: false },
      ...ECONOMIZER_OPTIONS,
      ...AHU_COMMON_OPTIONS,
    ],
    lines: [
      controller("Air handler controller (programmable)"),
      vfd("sf-vfd", "Supply fan"),
      point("sf-cmd", "BO", xeto("FanRunCmd"), "vfd", { label: "Supply fan start/stop", source: src.mbl(MZ, "y1SupFan") }),
      point("sf-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { label: "Supply fan speed command", source: src.mbl(MZ, "ySupFan") }),
      point("sf-status", "BI", xeto("FanRunSensor"), "vfd", { label: "Supply fan status", source: src.mbl(MZ, "u1SupFan") }),
      device("duct-static-sensor", "pressure-sensor", { label: "Supply duct static pressure transmitter (tap at 75% of the duct run)", s223: "PressureSensor", params: { medium: "'air'", form: "'duct_static'" }, source: src.ufgs("23 09 13", "§3.1.9: duct static tap 75 percent of the distance along the duct") }),
      point("duct-static", "AI", xeto("DuctAirPressureSensor"), "pressure-sensor", { label: "Supply air static pressure", source: src.mbl(MZ, "dpDuc") }),
      tempSensor("oa-temp-sensor", "Outdoor air temperature sensor (with shield)", "outdoor", src.mbl(MZ, "TOut")),
      point("oa-temp", "AI", xeto("AirTempSensor"), "temperature-sensor", { label: "Outdoor air temperature", source: src.mbl(MZ, "TOut") }),
      tempSensor("sa-temp-sensor", "Supply air temperature sensor", "duct", src.mbl(MZ, "TAirSup")),
      point("sa-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { label: "Supply air temperature", source: src.mbl(MZ, "TAirSup") }),
      tempSensor("ma-temp-sensor", "Mixed air temperature sensor (averaging)", "averaging", src.mbl(MZ, "TAirMix"), "attr.heating_type = 'hw' or attr.heating_type = 'electric'"),
      point("ma-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "attr.heating_type = 'hw' or attr.heating_type = 'electric'", label: "Mixed air temperature", source: src.mbl(MZ, "TAirMix") }),
      tempSensor("ra-temp-sensor", "Return air temperature sensor", "duct", src.mbl(MZ, "TAirRet"), "opt.differential_economizer and not opt.enthalpy_economizer"),
      point("ra-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "opt.differential_economizer and not opt.enthalpy_economizer", label: "Return air temperature (differential dry-bulb high limit)", source: src.mbl(MZ, "TAirRet") }),
      device("oa-enthalpy-sensor", "humidity-sensor", { when: "opt.enthalpy_economizer", label: "Outdoor air temperature and humidity transmitter (enthalpy)", s223: "HumiditySensor", params: { form: "'outdoor'" }, source: src.mbl(MZ, "hAirOut") }),
      point("oa-enthalpy", "AI", ot("outdoor-air-enthalpy"), "humidity-sensor", { when: "opt.enthalpy_economizer", label: "Outdoor air enthalpy", source: src.mbl(MZ, "hAirOut") }),
      device("ra-enthalpy-sensor", "humidity-sensor", { when: "opt.enthalpy_economizer and opt.differential_economizer", label: "Return air temperature and humidity transmitter (enthalpy)", s223: "HumiditySensor", params: { form: "'duct'" }, source: src.mbl(MZ, "hAirRet") }),
      point("ra-enthalpy", "AI", ot("return-air-enthalpy"), "humidity-sensor", { when: "opt.enthalpy_economizer and opt.differential_economizer", label: "Return air enthalpy", source: src.mbl(MZ, "hAirRet") }),
      actuator("oa-damper-actuator", "Economizer outdoor air damper actuator", "'closed'"),
      point("oa-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { label: "Economizer outdoor air damper command", source: src.mbl(MZ, "yOutDam") }),
      actuator("ra-damper-actuator", "Return air damper actuator", "'open'"),
      point("ra-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { label: "Return air damper command", source: src.mbl(MZ, "yRetDam") }),
      actuator("min-oa-damper-actuator", "Minimum outdoor air damper actuator", "'closed'", "opt.dedicated_min_oa", `if(opt.min_oa_dp, 'two_position', 'modulating')`),
      point("min-oa-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: "opt.dedicated_min_oa and not opt.min_oa_dp", label: "Minimum outdoor air damper command", source: src.mbl(MZ, "yMinOutDam") }),
      point("min-oa-damper-open", "BO", xeto("DuctAirDamperOpenCmd"), "damper-actuator", { when: DP, label: "Minimum outdoor air damper open command", source: src.mbl(MZ, "y1MinOutDam") }),
      device("oa-airflow-station", "airflow-station", { when: `not ${DP}`, label: "Outdoor airflow measuring station", s223: "FlowSensor", source: src.mbl(MZ, "VAirOut_flow") }),
      point("oa-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-station", { when: `not ${DP}`, label: "Outdoor airflow", source: src.mbl(MZ, "VAirOut_flow") }),
      device("min-oa-dp-sensor", "pressure-sensor", { when: DP, label: "Minimum outdoor air damper differential pressure transmitter", s223: "PressureSensor", params: { medium: "'air'", form: "'differential'" }, source: src.mbl(MZ, "dpMinOutDam") }),
      point("min-oa-dp", "AI", xeto("AirPressureSensor"), "pressure-sensor", { when: DP, label: "Minimum outdoor air damper differential pressure", source: src.mbl(MZ, "dpMinOutDam") }),
      actuator("relief-damper-actuator", "Relief air damper actuator", "'closed'", "opt.relief_damper or opt.return_fan or opt.relief_fan", "if(opt.relief_fan, 'two_position', 'modulating')"),
      point("relief-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: "opt.relief_damper or opt.return_fan", label: "Relief air damper command", source: src.mbl(MZ, "yRelDam") }),
      point("relief-damper-open", "BO", xeto("DuctAirDamperOpenCmd"), "damper-actuator", { when: "opt.relief_fan", label: "Relief damper open command (with the relief fan)", source: src.mbl(MZ, "y1RelDam") }),
      device("bldg-pressure-sensor", "pressure-sensor", { when: "opt.relief_damper or opt.relief_fan or (opt.return_fan and not opt.return_fan_airflow)", label: "Building static pressure transmitter (with outdoor reference)", s223: "PressureSensor", params: { medium: "'air'", form: "'building_static'" }, source: src.mbl(MZ, "dpBui") }),
      point("bldg-pressure", "AI", xeto("AirPressureSensor"), "pressure-sensor", { when: "opt.relief_damper or opt.relief_fan or (opt.return_fan and not opt.return_fan_airflow)", label: "Building static pressure", source: src.mbl(MZ, "dpBui") }),
      device("rf-airflow-stations", "airflow-station", { when: "opt.return_fan and opt.return_fan_airflow", qty: "2", label: "Supply and return airflow measuring stations", s223: "FlowSensor", source: src.mbl(MZ, "VAirSup_flow") }),
      point("sa-airflow-g36", "AI", xeto("DuctAirFlowSensor"), "airflow-station", { when: "opt.return_fan and opt.return_fan_airflow", label: "Supply airflow", source: src.mbl(MZ, "VAirSup_flow") }),
      point("ra-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-station", { when: "opt.return_fan and opt.return_fan_airflow", label: "Return airflow", source: src.mbl(MZ, "VAirRet_flow") }),
      vfd("rf-vfd", "Return fan", "opt.return_fan"),
      point("rf-cmd", "BO", xeto("FanRunCmd"), "vfd", { when: "opt.return_fan", label: "Return fan start/stop", source: src.mbl(MZ, "y1RetFan") }),
      point("rf-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { when: "opt.return_fan", label: "Return fan speed command", source: src.mbl(MZ, "yRetFan") }),
      point("rf-status", "BI", xeto("FanRunSensor"), "vfd", { when: "opt.return_fan", label: "Return fan status", source: src.ufgs("23 09 93", "§3.2.9.4.1 b: return fan status (RF-S)") }),
      vfd("relief-fan-vfd", "Relief fan", "opt.relief_fan"),
      point("relief-fan-cmd", "BO", xeto("FanRunCmd"), "vfd", { when: "opt.relief_fan", label: "Relief fan start/stop", source: src.mbl(MZ, "y1RelFan") }),
      point("relief-fan-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { when: "opt.relief_fan", label: "Relief fan speed command", source: src.mbl(MZ, "yRelFan") }),
      point("relief-fan-status", "BI", xeto("FanRunSensor"), "vfd", { when: "opt.relief_fan", label: "Relief fan status", source: src.inferred("UFGS 23 09 93 §3.2.9.4.1 proves each fan; G36 reads the relief fan's status only when another controller runs it") }),
      ...coilLines(MZ, "attr.heating_type = 'hw' or attr.heating_type = 'electric'", false),
      ...safeties(MZ, true),
      ...ufcAirLines({
        raPresent: "opt.differential_economizer and not opt.enthalpy_economizer",
        maPresent: "attr.heating_type = 'hw' or attr.heating_type = 'electric'",
        supplyFlowPresent: "opt.return_fan and opt.return_fan_airflow",
        supplySpeedPresent: false,
      }),
      ...([["uAhuOpeMod", "NET-IN", "Zone group operating mode"], ["uZonTemResReq", "NET-IN", "Zone supply-air temperature reset requests"], ["uZonPreResReq", "NET-IN", "Zone static pressure reset requests"],
          ["TAirSupSet", "NET-OUT", "Supply air temperature setpoint"], ["yChiWatResReq", "NET-OUT", "Chilled-water reset requests", CHW], ["yChiPlaReq", "NET-OUT", "Chiller plant requests", CHW],
          ["yHotWatResReq", "NET-OUT", "Hot-water reset requests", "attr.heating_type = 'hw'"], ["yHotWatPlaReq", "NET-OUT", "Hot-water plant requests", "attr.heating_type = 'hw'"]] as const)
        .map(([c, io, label, when]) => point(`net-${c}`, io, ot(`g36-${c}`), null, { label, ...(when ? { when } : {}), source: src.mbl(MZ, c) })),
      ...ahuLabor(),
    ],
  };

  const sz = {
    ...meta("ahu-single-zone", "Single-zone VAV air handler", ["MBL AHUs/SingleZone/VAV (have_ahuRelFan = true)", "UFGS 23 09 93 §3.2.3", "UFC 3-410-01 Table 3-1, Air Distribution System"]),
    applies_to: { family: AHU_FAMILIES, selector: "attr.vfd = 'yes' and attr.terminals_served = 0", rank: 20 },
    options: [...ZONE_OPTIONS, ...PRESSURE_OPTIONS, ...ECONOMIZER_OPTIONS, ...AHU_COMMON_OPTIONS],
    lines: [
      controller("Air handler controller (programmable)"),
      vfd("sf-vfd", "Supply fan"),
      point("sf-cmd", "BO", xeto("FanRunCmd"), "vfd", { label: "Supply fan start/stop", source: src.mbl(SZ, "y1SupFan") }),
      point("sf-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { label: "Supply fan speed command", source: src.mbl(SZ, "ySupFan") }),
      point("sf-speed", "AI", xeto("FanSpeedModulatingSensor"), "vfd", { label: "Supply fan actual speed", source: src.mbl(SZ, "uSupFan_actual") }),
      point("sf-status", "BI", xeto("FanRunSensor"), "vfd", { label: "Supply fan status (proof)", source: src.ufgs("23 09 93", "§3.2.3.4.1: supply fan status (SF-S)") }),
      device("space-sensor", "space-sensor", { label: "Zone temperature sensor (wall module)", s223: "TemperatureSensor", params: { adjust: "opt.setpoint_adjust" }, source: src.mbl(SZ, "TZon") }),
      point("zone-temp", "AI", xeto("ZoneAirTempSensor"), "space-sensor", { label: "Zone temperature", source: src.mbl(SZ, "TZon") }),
      point("setpoint-adjust", "AI", ot("zone-setpoint-adjust"), "space-sensor", { when: "opt.setpoint_adjust", label: "Zone setpoint adjustment", source: src.mbl(SZ, "setAdj") }),
      device("co2-sensor", "co2-sensor", { when: "opt.co2_sensor", label: "Zone CO2 sensor", s223: "ConcentrationSensor", params: { form: "'space'" }, source: src.mbl(SZ, "ppmCO2") }),
      point("zone-co2", "AI", xeto("ZoneCo2Sensor"), "co2-sensor", { when: "opt.co2_sensor", label: "Zone CO2 concentration", source: src.mbl(SZ, "ppmCO2") }),
      device("occupancy-sensor", "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupancy sensor", s223: "OccupancySensor", source: src.mbl(SZ, "u1OccSen") }),
      point("zone-occupancy", "BI", xeto("ZoneOccupiedSensor"), "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupied", source: src.mbl(SZ, "u1OccSen") }),
      device("window-switch", "window-switch", { when: "opt.window_switch", label: "Window switch", s223: "Sensor", source: src.mbl(SZ, "u1Win") }),
      point("window", "BI", xeto("WindowOpenSensor"), "window-switch", { when: "opt.window_switch", label: "Window status", source: src.mbl(SZ, "u1Win") }),
      tempSensor("oa-temp-sensor", "Outdoor air temperature sensor (with shield)", "outdoor", src.mbl(SZ, "TOut")),
      point("oa-temp", "AI", xeto("AirTempSensor"), "temperature-sensor", { label: "Outdoor air temperature", source: src.mbl(SZ, "TOut") }),
      tempSensor("sa-temp-sensor", "Supply air temperature sensor", "duct", src.mbl(SZ, "TAirSup")),
      point("sa-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { label: "Supply air temperature", source: src.mbl(SZ, "TAirSup") }),
      tempSensor("ma-temp-sensor", "Mixed air temperature sensor (averaging)", "averaging", src.mbl(SZ, "TAirMix"), "attr.heating_type = 'hw'"),
      point("ma-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "attr.heating_type = 'hw'", label: "Mixed air temperature", source: src.mbl(SZ, "TAirMix") }),
      tempSensor("ra-temp-sensor", "Return air temperature sensor", "duct", src.mbl(SZ, "TAirRet"), "opt.differential_economizer and not opt.enthalpy_economizer"),
      point("ra-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "opt.differential_economizer and not opt.enthalpy_economizer", label: "Return air temperature (differential dry-bulb high limit)", source: src.mbl(SZ, "TAirRet") }),
      device("oa-enthalpy-sensor", "humidity-sensor", { when: "opt.enthalpy_economizer", label: "Outdoor air temperature and humidity transmitter (enthalpy)", s223: "HumiditySensor", params: { form: "'outdoor'" }, source: src.mbl(SZ, "hOut") }),
      point("oa-enthalpy", "AI", ot("outdoor-air-enthalpy"), "humidity-sensor", { when: "opt.enthalpy_economizer", label: "Outdoor air enthalpy", source: src.mbl(SZ, "hOut") }),
      device("ra-enthalpy-sensor", "humidity-sensor", { when: "opt.enthalpy_economizer and opt.differential_economizer", label: "Return air temperature and humidity transmitter (enthalpy)", s223: "HumiditySensor", params: { form: "'duct'" }, source: src.mbl(SZ, "hAirRet") }),
      point("ra-enthalpy", "AI", ot("return-air-enthalpy"), "humidity-sensor", { when: "opt.enthalpy_economizer and opt.differential_economizer", label: "Return air enthalpy", source: src.mbl(SZ, "hAirRet") }),
      actuator("oa-damper-actuator", "Outdoor air damper actuator", "'closed'"),
      point("oa-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { label: "Outdoor air damper command", source: src.mbl(SZ, "yOutDam") }),
      actuator("ra-damper-actuator", "Return air damper actuator", "'open'"),
      point("ra-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { label: "Return air damper command", source: src.mbl(SZ, "yRetDam") }),
      actuator("relief-damper-actuator", "Relief air damper actuator", "'closed'", "opt.relief_damper or opt.relief_fan"),
      point("relief-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: "opt.relief_damper or opt.relief_fan", label: "Relief air damper command", source: src.mbl(SZ, "yRelDam") }),
      actuator("exhaust-damper-actuator", "Exhaust air damper actuator (with the return fan)", "'closed'", "opt.return_fan", "'two_position'"),
      point("exhaust-damper", "BO", xeto("DuctAirDamperOpenCmd"), "damper-actuator", { when: "opt.return_fan", label: "Exhaust damper open command", source: src.mbl(SZ, "y1ExhDam") }),
      device("bldg-pressure-sensor", "pressure-sensor", { when: "opt.relief_fan", label: "Building static pressure transmitter (with outdoor reference)", s223: "PressureSensor", params: { medium: "'air'", form: "'building_static'" }, source: src.mbl(SZ, "dpBui") }),
      point("bldg-pressure", "AI", xeto("AirPressureSensor"), "pressure-sensor", { when: "opt.relief_fan", label: "Building static pressure", source: src.mbl(SZ, "dpBui") }),
      vfd("rf-vfd", "Return fan", "opt.return_fan"),
      point("rf-cmd", "BO", xeto("FanRunCmd"), "vfd", { when: "opt.return_fan", label: "Return fan start/stop", source: src.mbl(SZ, "y1RetFan") }),
      point("rf-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { when: "opt.return_fan", label: "Return fan speed command", source: src.mbl(SZ, "yRetFan") }),
      point("rf-status", "BI", xeto("FanRunSensor"), "vfd", { when: "opt.return_fan", label: "Return fan status", source: src.ufgs("23 09 93", "§3.2.9.4.1 b: return fan status (RF-S)") }),
      vfd("relief-fan-vfd", "Relief fan", "opt.relief_fan"),
      point("relief-fan-cmd", "BO", xeto("FanRunCmd"), "vfd", { when: "opt.relief_fan", label: "Relief fan start/stop", source: src.mbl(SZ, "y1RelFan") }),
      point("relief-fan-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { when: "opt.relief_fan", label: "Relief fan speed command", source: src.mbl(SZ, "yRelFan") }),
      point("relief-fan-status", "BI", xeto("FanRunSensor"), "vfd", { when: "opt.relief_fan", label: "Relief fan status", source: src.inferred("UFGS 23 09 93 §3.2.9.4.1 proves each fan") }),
      ...coilLines(SZ, "attr.heating_type = 'hw'", true),
      point("eh-cmd", "AO", xeto("HeatModulatingCmd"), "factory-interface", { when: "attr.heating_type = 'electric'", label: "Electric heat command", source: src.ufgs("23 09 93", "§3.2.3.7: heating coil control") }),
      ...safeties(SZ, false),
      ...ufcAirLines({
        raPresent: "opt.differential_economizer and not opt.enthalpy_economizer",
        maPresent: "attr.heating_type = 'hw'",
        supplyFlowPresent: "false",
        supplySpeedPresent: true,
      }),
      ...([["TSupHeaEcoSet", "NET-OUT", "Heating and economizer supply temperature setpoint"], ["TSupCooSet", "NET-OUT", "Cooling supply temperature setpoint"],
          ["yChiWatResReq", "NET-OUT", "Chilled-water reset requests", CHW], ["yChiPlaReq", "NET-OUT", "Chiller plant requests", CHW],
          ["yHotWatResReq", "NET-OUT", "Hot-water reset requests", "attr.heating_type = 'hw'"], ["yHotWatPlaReq", "NET-OUT", "Hot-water plant requests", "attr.heating_type = 'hw'"]] as const)
        .map(([c, io, label, when]) => point(`net-${c}`, io, ot(`g36-${c}`), null, { label, ...(when ? { when } : {}), source: src.mbl(SZ, c) })),
      ...ahuLabor(),
    ],
  };

  const S93 = (loc: string) => src.ufgs("23 09 93", loc);
  const cv = {
    ...meta("ahu-constant-volume", "Constant-volume air handler or unit ventilator", ["UFGS 23 09 93 §3.2.2 (heating and ventilating unit / unit ventilator)", "UFGS 23 09 93 §3.2.3 (single zone with heating and DX cooling)", "UFC 3-410-01 Table 3-1, Air Distribution System"]),
    applies_to: { family: AHU_FAMILIES, selector: "attr.vfd = 'no'", rank: 20 },
    options: [
      { id: "economizer", label: "Airside economizer (modulating outdoor, return and relief dampers)", auto: "attr.economizer = 'airside'" },
      { id: "occupancy_sensor", label: "Zone occupancy sensor", default: false },
      { id: "setpoint_adjust", label: "Occupant setpoint adjustment at the zone sensor", default: true },
      ...AHU_COMMON_OPTIONS.filter((o) => o.id !== "dx_staged"),
    ],
    lines: [
      controller("Air handler controller (programmable)"),
      device("sf-starter", "starter", { label: "Supply fan starter with H-O-A switch", params: { hp: "attr.supply_fan_hp" }, source: S93("§3.2.2.1: HAND-OFF-AUTO switches at the starter") }),
      device("sf-relay", "relay", { label: "Supply fan start/stop relay", s223: "Actuator", source: S93("§3.2.2: SF-SS") }),
      point("sf-cmd", "BO", xeto("FanRunCmd"), "relay", { label: "Supply fan start/stop (SF-SS)", source: S93("§3.2.2: SF-SS") }),
      device("sf-status-switch", "current-switch", { label: "Supply fan current switch", s223: "ElectricCurrentSensor", source: S93("§3.2.2.4.1: SF-S") }),
      point("sf-status", "BI", xeto("FanRunSensor"), "current-switch", { label: "Supply fan status (SF-S)", source: S93("§3.2.2.4.1: supply fan status (proof)") }),
      device("space-sensor", "space-sensor", { label: "Zone temperature sensor (wall module)", s223: "TemperatureSensor", params: { adjust: "opt.setpoint_adjust" }, source: S93("§3.2.3: ZN-T") }),
      point("zone-temp", "AI", xeto("ZoneAirTempSensor"), "space-sensor", { label: "Zone temperature (ZN-T)", source: S93("§3.2.3: ZN-T") }),
      point("setpoint-adjust", "AI", ot("zone-setpoint-adjust"), "space-sensor", { when: "opt.setpoint_adjust", label: "Zone setpoint adjustment (ZN-T-SP)", source: S93("§3.2.1.5 a: occupant-adjustable setpoint via the wall-mounted thermostat") }),
      device("occupancy-sensor", "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupancy sensor", s223: "OccupancySensor", source: S93("§3.1.2.3: space occupancy inputs") }),
      point("zone-occupancy", "BI", xeto("ZoneOccupiedSensor"), "occupancy-sensor", { when: "opt.occupancy_sensor", label: "Zone occupied (ZN-OCC)", source: S93("§3.1.2.3: space occupancy inputs") }),
      tempSensor("sa-temp-sensor", "Supply (discharge) air temperature sensor", "duct", S93("§3.2.3: SA-T")),
      point("sa-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { label: "Supply air temperature", source: S93("§3.2.3: supply air temperature") }),
      tempSensor("ma-temp-sensor", "Mixed air temperature sensor (averaging)", "averaging", S93("§3.2.2.6: mixed air damper control (MA-T)"), "opt.economizer"),
      point("ma-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "opt.economizer", label: "Mixed air temperature (MA-T)", source: S93("§3.2.2.6: mixed air damper control") }),
      tempSensor("oa-temp-sensor", "Outdoor air temperature sensor (with shield)", "outdoor", S93("§3.2.3.6: economizer high and low limits on OA dry bulb"), "opt.economizer"),
      point("oa-temp", "AI", xeto("AirTempSensor"), "temperature-sensor", { when: "opt.economizer", label: "Outdoor air temperature (economizer)", source: S93("§3.2.3.6: ECO-HL-SP, ECO-LL-SP") }),
      actuator("min-oa-damper-actuator", "Minimum outdoor air damper actuator (2-position)", "'closed'", "not opt.economizer", "'two_position'"),
      point("min-oa-damper", "BO", xeto("DuctAirDamperOpenCmd"), "damper-actuator", { when: "not opt.economizer", label: "Minimum outdoor air damper open (OA-D-MIN)", source: S93("§3.2.3.5: 2-position minimum outside air damper") }),
      actuator("economizer-damper-actuators", "Outdoor, return and relief damper actuators (one signal)", "'closed'", "opt.economizer"),
      point("economizer-damper", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: "opt.economizer", label: "Mixed air (economizer) damper command", source: S93("§3.2.3.6: economizer damper control") }),
      ...coilLines(SZ, "attr.heating_type = 'hw'", false).map((l) => l.source.ref.startsWith("MBL")
        ? { ...l, source: l.id === "heating-cmd" ? S93("§3.2.3.7: heating coil control") : S93("§3.2.3.8: [DX] cooling coil control") }
        : l).map((l) => l.id === "cooling-cmd" ? { ...l, when: CHW, label: "Chilled-water cooling coil valve command" }
          : l.id === "dx-stages" ? { ...l, when: "attr.cooling_type = 'dx'" }
          : l.id === "dx-interface" ? { ...l, params: { stages: "attr.dx_stages", control: "'staged'" } } : l),
      point("eh-stages", "BO", xeto("HeatRunCmd"), "factory-interface", { when: "attr.heating_type = 'electric'", label: "Electric heat enable (stages per the heater's controls)", source: S93("§3.2.1: heat stages") }),
      point("hp-mode", "BO", ot("heat-pump-reversing-valve"), "factory-interface", { when: "attr.heating_type = 'heat_pump'", label: "Heat pump heating mode (reversing valve)", source: S93("§3.2.1.2: HEAT-OFF-COOL[-EMERG HEAT]") }),
      ...safeties(SZ, false).map((l) => l.id === "freezestat" ? { ...l, source: S93("§3.2.3.4.2 a: HTG-DA-T-LL, wired to the controller") } : l),
      ...ufcAirLines({ raPresent: "false", maPresent: "opt.economizer", supplyFlowPresent: "false", supplySpeedPresent: true })
        .filter((l) => !["rf-speed", "rf-alarm", "sf-alarm"].includes(l.id))
        .map((l) => l.when?.includes("opt.enthalpy_economizer") ? { ...l, when: UFC } : l),
      ...ahuLabor(),
    ],
  };

  const S00 = (loc: string) => src.ufgs("23 09 00", loc);
  const doas = {
    ...meta("doas", "Dedicated outdoor air unit (with or without energy recovery)", ["UFGS 23 09 00 §3.7.8.5.5 (DOAS trended points a-y)", "UFC 3-410-01 Table 3-1, Air Distribution System"]),
    applies_to: { family: DOAS_FAMILIES, rank: 10 },
    options: [
      { id: "exhaust_fan", label: "The unit's own exhaust fan (with energy recovery)", auto: "attr.energy_recovery != 'none'" },
      { id: "variable_speed_wheel", label: "Variable-speed energy recovery wheel", default: false },
      ...AHU_COMMON_OPTIONS.filter((o) => o.id === "duct_smoke_detectors" || o.id === "ufc_minimum_points" || o.id === "dx_staged"),
    ],
    lines: [
      controller("DOAS controller (programmable)"),
      tempSensor("oa-temp-sensor", "Outdoor air temperature sensor", "outdoor", S00("§3.7.8.5.5 item a")),
      point("oa-temp", "AI", xeto("AirTempSensor"), "temperature-sensor", { label: "Outdoor air temperature", source: S00("§3.7.8.5.5 item a") }),
      device("oa-humidity-sensor", "humidity-sensor", { label: "Outdoor air humidity sensor", s223: "HumiditySensor", params: { form: "'outdoor'" }, source: S00("§3.7.8.5.5 item b") }),
      point("oa-rh", "AI", xeto("AirHumiditySensor"), "humidity-sensor", { label: "Outdoor air relative humidity", source: S00("§3.7.8.5.5 item b") }),
      actuator("oa-isolation-actuator", "Outdoor air isolation damper actuator", "'closed'", undefined, "'two_position'"),
      point("oa-isolation", "BO", xeto("DuctAirDamperOpenCmd"), "damper-actuator", { label: "Outdoor air isolation damper command", source: S00("§3.7.8.5.5 item c") }),
      device("oa-isolation-switch", "end-switch", { label: "Outdoor air isolation damper end switch", s223: "Sensor", source: src.ufgs("23 09 13", "§2.7.21: damper end switches") }),
      point("oa-isolation-status", "BI", xeto("DuctAirDamperOpenSensor"), "end-switch", { label: "Outdoor air isolation damper status", source: S00("§3.7.8.5.5 item c") }),
      device("oa-airflow-station", "airflow-station", { label: "Outdoor airflow measuring station", s223: "FlowSensor", source: S00("§3.7.8.5.5 item d") }),
      point("oa-airflow", "AI", xeto("DuctAirFlowSensor"), "airflow-station", { label: "Outdoor airflow", source: S00("§3.7.8.5.5 item d") }),
      vfd("sf-vfd", "Supply fan"),
      point("sf-cmd", "BO", xeto("FanRunCmd"), "vfd", { label: "Supply fan start/stop", source: src.inferred("UFGS 23 09 93 §3.2.9: SF-SS, as for every air handler") }),
      point("sf-status", "BI", xeto("FanRunSensor"), "vfd", { label: "Supply (outdoor air) fan status", source: src.ufc("ads-24") }),
      point("sf-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { label: "Supply fan speed command", source: src.inferred("UFGS 23 09 00 §3.7.8.5.5 n trends the fan's speed, which the static pressure loop sets") }),
      point("sf-speed", "AI", xeto("FanSpeedModulatingSensor"), "vfd", { label: "Supply fan actual speed", source: S00("§3.7.8.5.5 item n") }),
      device("duct-static-sensor", "pressure-sensor", { label: "Supply duct static pressure transmitter", s223: "PressureSensor", params: { medium: "'air'", form: "'duct_static'" }, source: S00("§3.7.8.5.5 item q") }),
      point("duct-static", "AI", xeto("DuctAirPressureSensor"), "pressure-sensor", { label: "Supply air static pressure", source: S00("§3.7.8.5.5 item q") }),
      device("bldg-pressure-sensor", "pressure-sensor", { label: "Facility relative pressure transmitter", s223: "PressureSensor", params: { medium: "'air'", form: "'building_static'" }, source: S00("§3.7.8.5.5 item r") }),
      point("bldg-pressure", "AI", xeto("AirPressureSensor"), "pressure-sensor", { label: "Facility relative pressure", source: S00("§3.7.8.5.5 item r") }),
      tempSensor("da-temp-sensor", "Discharge air temperature sensor", "duct", S00("§3.7.8.5.5 item p")),
      point("da-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { label: "Discharge air temperature", source: S00("§3.7.8.5.5 item p") }),
      tempSensor("cc-lat-sensor", "Cooling coil leaving air temperature sensor", "averaging", S00("§3.7.8.5.5 item l"), "attr.cooling_type != 'none'"),
      point("cc-lat", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "attr.cooling_type != 'none'", label: "Cooling coil leaving air temperature", source: S00("§3.7.8.5.5 item l") }),
      tempSensor("ph-lat-sensor", "Preheat coil leaving air temperature sensor", "averaging", S00("§3.7.8.5.5 item j"), "attr.heating_type != 'none'"),
      point("ph-lat", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "attr.heating_type != 'none'", label: "Preheat coil leaving air temperature", source: S00("§3.7.8.5.5 item j") }),
      ...coilLines(SZ, "attr.heating_type = 'hw'", false).map((l) => l.source.ref.startsWith("MBL")
        ? { ...l, source: l.id === "heating-cmd" ? S00("§3.7.8.5.5 item k, o: preheat and reheat coil commands") : S00("§3.7.8.5.5 item m: cooling coil control valve command") }
        : l),
      tempSensor("ra-temp-sensor", "Return (exhaust) air temperature sensor", "duct", S00("§3.7.8.5.5 item s"), "opt.exhaust_fan"),
      point("ra-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "opt.exhaust_fan", label: "Return air temperature", source: S00("§3.7.8.5.5 item s") }),
      device("ra-humidity-sensor", "humidity-sensor", { when: "opt.exhaust_fan", label: "Return air humidity sensor", s223: "HumiditySensor", params: { form: "'duct'" }, source: S00("§3.7.8.5.5 item t") }),
      point("ra-rh", "AI", xeto("DuctAirHumiditySensor"), "humidity-sensor", { when: "opt.exhaust_fan", label: "Return air relative humidity", source: S00("§3.7.8.5.5 item t") }),
      vfd("ef-vfd", "Exhaust fan", "opt.exhaust_fan"),
      point("ef-cmd", "BO", xeto("FanRunCmd"), "vfd", { when: "opt.exhaust_fan", label: "Exhaust fan start/stop", source: src.inferred("UFGS 23 09 00 §3.7.8.5.5 x trends the exhaust fan's speed") }),
      point("ef-status", "BI", xeto("FanRunSensor"), "vfd", { when: "opt.exhaust_fan", label: "Exhaust fan status", source: src.ufc("ads-23") }),
      point("ef-speed-cmd", "AO", xeto("FanSpeedModulatingCmd"), "vfd", { when: "opt.exhaust_fan", label: "Exhaust fan speed command", source: src.inferred("UFGS 23 09 00 §3.7.8.5.5 x") }),
      point("ef-speed", "AI", xeto("FanSpeedModulatingSensor"), "vfd", { when: "opt.exhaust_fan", label: "Exhaust fan actual speed", source: S00("§3.7.8.5.5 item x") }),
      actuator("ea-isolation-actuator", "Exhaust air isolation damper actuator", "'closed'", "opt.exhaust_fan", "'two_position'"),
      point("ea-isolation", "BO", xeto("DuctAirDamperOpenCmd"), "damper-actuator", { when: "opt.exhaust_fan", label: "Exhaust air isolation damper command", source: S00("§3.7.8.5.5 item y") }),
      device("ea-isolation-switch", "end-switch", { when: "opt.exhaust_fan", label: "Exhaust air isolation damper end switch", s223: "Sensor", source: src.ufgs("23 09 13", "§2.7.21") }),
      point("ea-isolation-status", "BI", xeto("DuctAirDamperOpenSensor"), "end-switch", { when: "opt.exhaust_fan", label: "Exhaust air isolation damper status", source: S00("§3.7.8.5.5 item y") }),
      // Energy recovery: a wheel (command, rotation, speed, defrost), or a plate or heat pipe (bypass only).
      device("wheel-interface", "factory-interface", { when: "attr.energy_recovery = 'wheel'", label: "Energy recovery wheel motor controls (factory)", source: S00("§3.7.8.5.5 item e") }),
      point("wheel-cmd", "BO", xeto("MotorRunCmd"), "factory-interface", { when: "attr.energy_recovery = 'wheel'", label: "Energy recovery wheel command", source: S00("§3.7.8.5.5 item e") }),
      device("wheel-rotation-sensor", "current-switch", { when: "attr.energy_recovery = 'wheel'", label: "Wheel rotation sensor", s223: "Sensor", source: src.ufc("ads-25") }),
      point("wheel-status", "BI", xeto("MotorRunSensor"), "current-switch", { when: "attr.energy_recovery = 'wheel'", label: "Energy recovery wheel rotation status", source: src.ufc("ads-25") }),
      point("wheel-speed-cmd", "AO", xeto("MotorSpeedModulatingCmd"), "factory-interface", { when: "attr.energy_recovery = 'wheel' and opt.variable_speed_wheel", label: "Energy recovery wheel speed command", source: src.inferred("research 02 §3b typical 24: wheel speed AO") }),
      point("wheel-speed", "AI", xeto("MotorSpeedModulatingSensor"), "factory-interface", { when: "attr.energy_recovery = 'wheel' and opt.variable_speed_wheel", label: "Energy recovery wheel actual speed", source: S00("§3.7.8.5.5 item e") }),
      point("defrost-cmd", "BO", ot("wheel-defrost-cmd"), "factory-interface", { when: "attr.energy_recovery = 'wheel'", label: "Wheel defrost cycle command", source: S00("§3.7.8.5.5 item g") }),
      point("defrost-status", "BI", ot("wheel-defrost-status"), "factory-interface", { when: "attr.energy_recovery = 'wheel'", label: "Wheel defrost cycle status", source: S00("§3.7.8.5.5 item g") }),
      actuator("er-bypass-actuators", "Energy recovery bypass damper actuators (outdoor and exhaust sides)", "'closed'", "attr.energy_recovery != 'none'"),
      point("oa-bypass-cmd", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: "attr.energy_recovery != 'none'", label: "Energy recovery OA bypass damper command", source: S00("§3.7.8.5.5 item f") }),
      point("ea-bypass-cmd", "AO", xeto("DuctAirDamperModulatingCmd"), "damper-actuator", { when: "attr.energy_recovery != 'none' and opt.exhaust_fan", label: "Energy recovery EA bypass damper command", source: S00("§3.7.8.5.5 item u") }),
      device("er-bypass-switches", "end-switch", { when: "attr.energy_recovery != 'none'", qty: "if(opt.exhaust_fan, 2, 1)", label: "Bypass damper end switches", s223: "Sensor", source: src.ufgs("23 09 13", "§2.7.21") }),
      point("oa-bypass-status", "BI", xeto("DuctAirDamperOpenSensor"), "end-switch", { when: "attr.energy_recovery != 'none'", label: "Energy recovery OA bypass damper status", source: S00("§3.7.8.5.5 item f") }),
      point("ea-bypass-status", "BI", xeto("DuctAirDamperOpenSensor"), "end-switch", { when: "attr.energy_recovery != 'none' and opt.exhaust_fan", label: "Energy recovery EA bypass damper status", source: S00("§3.7.8.5.5 item u") }),
      tempSensor("er-oa-temp-sensor", "Energy recovery OA discharge temperature and humidity transmitter", "duct", S00("§3.7.8.5.5 item h-i"), "attr.energy_recovery != 'none'"),
      point("er-oa-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "attr.energy_recovery != 'none'", label: "Energy recovery OA discharge air temperature", source: S00("§3.7.8.5.5 item h") }),
      point("er-oa-rh", "AI", xeto("DuctAirHumiditySensor"), "temperature-sensor", { when: "attr.energy_recovery != 'none'", label: "Energy recovery OA discharge air relative humidity", source: S00("§3.7.8.5.5 item i") }),
      tempSensor("er-ea-temp-sensor", "Energy recovery EA discharge temperature and humidity transmitter", "duct", S00("§3.7.8.5.5 item v-w"), "attr.energy_recovery != 'none' and opt.exhaust_fan"),
      point("er-ea-temp", "AI", xeto("DuctAirTempSensor"), "temperature-sensor", { when: "attr.energy_recovery != 'none' and opt.exhaust_fan", label: "Energy recovery EA discharge air temperature", source: S00("§3.7.8.5.5 item v") }),
      point("er-ea-rh", "AI", xeto("DuctAirHumiditySensor"), "temperature-sensor", { when: "attr.energy_recovery != 'none' and opt.exhaust_fan", label: "Energy recovery EA discharge air relative humidity", source: S00("§3.7.8.5.5 item w") }),
      ...safeties(SZ, false).filter((l) => !l.id.startsWith("freezestat")).map((l) => l),
      device("freezestat-switch", "freezestat", { label: "Low-limit thermostat (freezestat)", s223: "Sensor", source: src.ufc("ads-17") }),
      point("freezestat", "BI", ot("freeze-stat"), "freezestat", { label: "Freezestat status", source: src.ufc("ads-17") }),
      ...ufcAirLines({ raPresent: "opt.exhaust_fan", maPresent: "true", supplyFlowPresent: "false", supplySpeedPresent: true })
        .filter((l) => ["sa-humidity-sensor", "sa-dewpoint", "sa-airflow-station", "sa-airflow", "oa-dewpoint", "filter-switch", "filter", "heater-status", "sf-alarm"].includes(l.id)),
      labor("program", "sequence-programming", "per_typical", { label: "Program the DOAS sequence", source: src.inferred("research 02 §3a labor hooks") }),
      labor("graphic", "graphic", "per_typical", { label: "DOAS graphic", source: src.inferred("research 02 §3a labor hooks") }),
      labor("pvt", "performance-verification-test", "per_typical", { label: "Performance verification test (every DOAS)", source: S00("§3.7.6 a(3): 100 percent of DOAS") }),
    ],
  };

  const S2302 = (loc: string) => src.ufgs("23 09 23.02", loc);
  const rtu = {
    ...meta("rtu-networked", "Packaged rooftop unit with factory controls on the network", ["UFGS 23 09 23.02 §3.1.5 (gateways, packaged units)", "UFGS 23 09 00 §1.4.54-1.4.55", "[inferred] research 02 §3b typical 13: the exposed point list"]),
    applies_to: { family: ["RTU"], selector: "known(attr.bas_interface)", rank: 30 },
    options: [AHU_COMMON_OPTIONS.find((o) => o.id === "duct_smoke_detectors")!, { id: "gateway", label: "A single-unit gateway (the unit's controller does not speak BACnet)", default: false, note: "UFGS 23 09 23.02 §3.1.5.1: one packaged unit per gateway, at most 10 ft of non-BACnet wiring." }],
    lines: [
      device("packaged-controller", "packaged-controller", { label: "Factory unit controller (furnished with the unit)", s223: "Controller", params: { class: "'packaged_onboard'" }, source: src.ufgs("23 09 00", "§1.4.54: packaged equipment") }),
      device("network-interface", "network-interface", { label: "BACnet interface card, or a single-unit gateway", s223: "Controller", params: { kind: "if(opt.gateway, 'gateway', 'bacnet_card')", printed: "attr.bas_interface" }, source: S2302("§3.1.5.1: gateway requirements") }),
      ...([["occupied-cmd", "NET-OUT", "Occupancy (enable) command"], ["clg-sp", "NET-OUT", "Cooling setpoint"], ["htg-sp", "NET-OUT", "Heating setpoint"],
          ["zone-temp", "NET-IN", "Zone temperature"], ["sa-temp", "NET-IN", "Supply air temperature"], ["oa-temp", "NET-IN", "Outdoor air temperature"],
          ["fan-status", "NET-IN", "Supply fan status"], ["cool-status", "NET-IN", "Cooling stage status"], ["heat-status", "NET-IN", "Heating stage status"],
          ["economizer-position", "NET-IN", "Economizer damper position"], ["alarm", "NET-IN", "Unit alarm"]] as const)
        .map(([id, io, label]) => point(id, io, ot(`rtu-${id}`), null, { label, source: src.inferred("research 02 §3b typical 13: exposed network points (the list is an inference; the rules are UFGS 23 09 23.02 §3.1.5)") })),
      device("smoke-detectors", "smoke-detector", { when: "opt.duct_smoke_detectors", qty: "2", label: "Supply and return duct smoke detectors (hardwired to the unit, monitored)", s223: "Sensor", source: src.inferred("research 02 §3b typical 13: hardwired extras, smoke detector") }),
      point("smoke", "BI", ot("smoke-detector-status"), "smoke-detector", { when: "opt.duct_smoke_detectors", qty: "2", label: "Supply and return smoke detector status", source: src.inferred("research 02 §3b typical 13") }),
      labor("integration", "network-integration", "per_typical", { label: "Integrate the unit's controller (map and test the exposed points)", source: S2302("§3.1.5") }),
      labor("graphic", "graphic", "per_typical", { label: "Unit graphic", source: src.inferred("research 02 §3a labor hooks") }),
    ],
  };

  return [mz, sz, cv, doas, rtu];
}
