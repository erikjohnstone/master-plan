// ASSEMBLIES WP2 — the structural normalizer (src/lib/assemblies/normalize.ts)
// on rows shaped like the compile's own: flattened multi-tier header strings
// as the dev census recorded them, cells as printed.
import test from "node:test";
import assert from "node:assert/strict";
import {
  headerText, normalizeCompileItem, parseElectricalCell, parseNumberCell, parseSizeCell,
  type CompileItem,
} from "../../src/lib/assemblies/normalize.ts";

const row = (tag: string, table_title: string, cells: Record<string, string>): CompileItem => ({
  tag, sheet_id: "set.pdf#16", table_title,
  cells: Object.fromEntries(Object.entries(cells).map(([h, text], i) => [h, { text, bbox: [i, 0, i + 1, 1] }])),
});
const values = (n: ReturnType<typeof normalizeCompileItem>) =>
  Object.fromEntries(Object.entries(n.attributes).map(([k, v]) => [k, v.value]));

test("header text: acronym dots, water-column and BTU/H spellings, phase glyphs, note references", () => {
  assert.equal(headerText("FLUID PERFORMANCE E.W.T."), "FLUID PERFORMANCE EWT");
  assert.equal(headerText("MAX PD FT.H2O"), "MAX PD FTWC");
  assert.equal(headerText("DISCHARGE HEAD FT.H20"), "DISCHARGE HEAD FTWC");
  assert.equal(headerText("AIRSIDE DATA EXTERNAL SP I.W.G"), "AIRSIDE DATA EXTERNAL SP INWC");
  assert.equal(headerText("HYDRONIC REHEAT COIL DATA SENSIBLE CAPACITY (BTU/HR)"), "HYDRONIC REHEAT COIL DATA SENSIBLE CAPACITY ( BTUH )");
  assert.equal(headerText("MOTOR V/Ø"), "MOTOR V/ PH");
  assert.equal(headerText("ELECTRICAL (NOTE 1) VOLTAGE"), "ELECTRICAL VOLTAGE");
  assert.equal(headerText("MIN. O.S.A. CFM"), "MIN OSA CFM");
});

test("cell values: one number with its unit, fractions, sizes, V/PH; never two numbers", () => {
  assert.deepEqual(parseNumberCell("15,400"), { n: 15400, unit: null, words: "" });
  assert.equal(parseNumberCell("1-1/2")?.n, 1.5);
  assert.equal(parseNumberCell("1/15")?.n, 1 / 15);
  assert.equal(parseNumberCell(".5")?.n, 0.5);
  assert.deepEqual(parseNumberCell("7.5 HP (VFD)"), { n: 7.5, unit: "hp", words: "HP (VFD)" });
  assert.equal(parseNumberCell("70 W")?.unit, "W");
  for (const t of ["460/3", "50-80-110", "SEE NOTE 3", "0.7 1.2", ""]) assert.equal(parseNumberCell(t), null, t);
  assert.equal(parseSizeCell('8"'), "8");
  assert.equal(parseSizeCell('3/4"'), "0.75");
  assert.equal(parseSizeCell("10x8"), "10x8");
  assert.equal(parseSizeCell("8/10"), null);
  assert.deepEqual(parseElectricalCell("460/3"), { volts: 460, phase: 3 });
  assert.deepEqual(parseElectricalCell("115/1/60"), { volts: 115, phase: 1 });
  assert.deepEqual(parseElectricalCell("208V/1PH"), { volts: 208, phase: 1 });
  assert.equal(parseElectricalCell("208-230/1"), null);
  assert.deepEqual(parseElectricalCell("470/3"), { volts: null, phase: 3 });
});

test("a VAV reheat row: airflows by MIN/MAX, the hydronic coil block, BTU/H converted, heat type from the block", () => {
  const item = row("VAV-1", "VOLUME CONTROL BOX SCHEDULE", {
    "INLET DIAMETER": '8"',
    "AIRSIDE DATA MINIMUM AIR FLOW CFM": "350",
    "AIRSIDE DATA MAXIMUM AIR FLOW CFM": "550",
    "MAXIMUM NOISE DATA RADIATED SOUND (NC)": "30",
    "AIRSIDE DATA MIN INLET SP I.W.G.": "1.00",
    "AIRSIDE DATA MAX AIR PD I.W.G": "0.60",
    "HYDRONIC REHEAT COIL DATA EAT (°F)": "55",
    "HYDRONIC REHEAT COIL DATA LAT (°F)": "95",
    "HYDRONIC REHEAT COIL DATA EWT (°F)": "140",
    "HYDRONIC REHEAT COIL DATA LWT (°F)": "110",
    "HYDRONIC REHEAT COIL DATA SENSIBLE CAPACITY (BTU/HR)": "15400",
    "HYDRONIC REHEAT COIL DATA FLOW (GPM)": "1.1",
    "HYDRONIC REHEAT COIL DATA PIPE CONNECTI ON SIZE IN": '3/4"',
    "HYDRONIC REHEAT COIL DATA MAX WATER PD FT. H20": "5.00",
    MANUFACTURER: "PRICE",
  });
  const n = normalizeCompileItem(item, "VAV");
  assert.deepEqual(values(n), {
    inlet_size_in: "8", cfm_min: 350, cfm_max: 550, hw_ewt_f: 140, hw_lwt_f: 110, hw_mbh: 15.4,
    hw_gpm: 1.1, hw_conn_in: 0.75, hw_wpd_ft: 5, heat_type: "hw",
  });
  assert.equal(n.attributes.hw_mbh.cite.header, "HYDRONIC REHEAT COIL DATA SENSIBLE CAPACITY (BTU/HR)");
  assert.deepEqual(n.attributes.hw_mbh.cite.bbox, [10, 0, 11, 1]);
  assert.equal(n.attributes.cfm_min.rule, "airflow.terminal_min");
  assert.equal(n.unknown.eh_kw.reason, "no printed column answers it");
});

test("a pump row: flow, head, fractional hp, V/PH split", () => {
  const n = normalizeCompileItem(row("P-1", "PUMP SCHEDULE", {
    "AREA SERVED": "BOILERS", TYPE: "INLINE", "CAPACITY FLOW (GPM)": "45", "CAPACITY HEAD (FT)": "40",
    "CAPACITY MIN EFF": "55%", "MOTOR HP": "1-1/2", "MOTOR RPM": "1750", "MOTOR V/Ø": "208/3", "INLET SIZE": '2"',
  }), "PUMP");
  assert.deepEqual(values(n), { area_served: "BOILERS", gpm: 45, head_ft: 40, motor_hp: 1.5, rpm: 1750, volts: 208, phase: 3, conn_in: 2 });
});

test("an air handler: design supply over minimum, outdoor air, return, fan counts", () => {
  const n = normalizeCompileItem(row("AHU-1", "AIR HANDLING UNIT SCHEDULE", {
    "AIRFLOW MINIMUM SUPPLY AIR FLOW CFM": "2000", "AIRFLOW DESIGN SUPPLY AIR FLOW CFM": "4000",
    "AIRFLOW MINIMUM OUTSIDE AIR FLOW CFM": "800", "AIRFLOW DESIGN RETURN AIRFLOW": "3200",
    "SUPPLY FAN SF QTY": "2", "SUPPLY FAN E.S.P": "2.5", "RELIEF FAN RF QTY": "1",
  }), "AHU");
  const v = values(n);
  assert.equal(v.supply_cfm, 4000);
  assert.equal(v.oa_cfm_min, 800);
  assert.equal(v.return_cfm, 3200);
  assert.equal(v.supply_fan_qty, 2);
  assert.equal(v.return_fan_qty, 1);
});

test("an electric unit heater: kW is heat, the title names the medium, fan hp is a fraction", () => {
  const n = normalizeCompileItem(row("EUH-1", "ELECTRIC HEATER SCHEDULE", {
    "AREA SERVED": "STORAGE", "FAN CFM": "350", "FAN HP": "1/15", "ELECTRICAL KW": "5", "ELECTRICAL STEPS": "1", "ELECTRICAL V/Ø": "208/1",
  }), "UNIT_HEATER");
  const v = values(n);
  assert.equal(v.eh_kw, 5);
  assert.equal(v.heating_medium, "electric");
  assert.ok(Math.abs(Number(v.motor_hp) - 1 / 15) < 1e-9);
  assert.equal(v.cfm, 350);
  assert.equal(n.attributes.heating_medium.cite.header, "(table title)");
});

test("a fan's HP/W column: a cell printed in watts is watts, a bare fraction is horsepower", () => {
  const cells = (hpw: string) => ({ "BLOWER CFM": "200", "ELECTRICAL HP/W": hpw, "ELECTRICAL V/Ø": "115/1" });
  assert.equal(values(normalizeCompileItem(row("EF-1", "LAB EXHAUST FAN SCHEDULE", cells("70 W")), "FAN")).motor_watts, 70);
  const hp = values(normalizeCompileItem(row("EF-2", "LAB EXHAUST FAN SCHEDULE", cells("1/4")), "FAN"));
  assert.equal(hp.motor_hp, 0.25);
  assert.equal(hp.motor_watts, undefined);
});

test("a water-source heat pump's COOLING / HEATING water side is its source loop, never chilled or hot water", () => {
  const n = normalizeCompileItem(row("WSHP-1", "WATER SOURCE HEAT PUMP", {
    "COOLING WATER SIDE EWT (°F)": "70.3", "COOLING WATER SIDE LWT (°F)": "90.1", "COOLING WATER SIDE FLOW (GPM)": "15.0",
  }), "HEAT_PUMP");
  const v = values(n);
  assert.equal(v.source_ewt_f, 70.3);
  assert.equal(v.source_gpm, 15);
  assert.equal(v.chw_ewt_f, undefined);
  assert.equal(v.chw_gpm, undefined);
});

test("refusals: not one value, disagreeing columns, a capacity with no unit, a nonstandard voltage", () => {
  const n = normalizeCompileItem(row("F-1", "FAN SCHEDULE", {
    CFM: "50-80-110", "FAN RPM": "1200", "MOTOR RPM": "1750", "DRIVE TYPE": "SEE NOTE 3", VOLTAGE: "470", PHASE: "3",
  }), "FAN");
  const v = values(n);
  assert.equal(v.cfm, undefined);
  assert.match(n.unknown.cfm.reason, /not one number/);
  assert.equal(v.rpm, 1200, "the fan's own RPM over its motor's");
  assert.equal(v.drive, undefined);
  assert.equal(v.volts, undefined);
  assert.equal(v.phase, 3);
  const twin = normalizeCompileItem(row("F-2", "FAN SCHEDULE", { "FAN RPM": "1200", "BLOWER RPM": "900" }), "FAN");
  assert.equal(twin.attributes.rpm, undefined);
  assert.match(twin.unknown.rpm.reason, /2 columns answer it differently/);
  const unitless = normalizeCompileItem(row("UH-1", "UNIT HEATER SCHEDULE", { CAPACITY: "15400" }), "UNIT_HEATER");
  assert.equal(unitless.attributes.heating_mbh, undefined);
  assert.match(unitless.unknown.heating_mbh.reason, /prints no unit/);
});

test("absence is not evidence: no column, no value; a room is not a floor", () => {
  const n = normalizeCompileItem(row("RTU-1", "PACKAGED ROOFTOP UNIT SCHEDULE", { LOCATION: "MECH 152", "SUPPLY AIR (CFM)": "2000" }), "RTU");
  assert.deepEqual(values(n), { supply_cfm: 2000 });
  assert.equal(values(normalizeCompileItem(row("RTU-2", "PACKAGED ROOFTOP UNIT SCHEDULE", { LOCATION: "NW ROOF" }), "RTU")).floor, "ROOF");
  assert.deepEqual(normalizeCompileItem(row("X-1", "ANYTHING", { CFM: "100" }), "NOT_A_FAMILY").attributes, {});
});

test("a boiler or pump in a HOT WATER table reports its own flow and temperatures", () => {
  const b = values(normalizeCompileItem(row("B-1", "CONDENSING HOT WATER BOILER SCHEDULE", {
    FUEL: "NATURAL GAS", "EWT (°F)": "140", "LWT (°F)": "180", "BOILER FLOW (GPM)": "40", "CAPACITY INPUT MBH": "1000", "CAPACITY OUTPUT MBH": "950",
  }), "BOILER"));
  assert.deepEqual(b, { fuel: "gas", ewt_f: 140, lwt_f: 180, gpm: 40, input_mbh: 1000, output_mbh: 950 });
  assert.equal(values(normalizeCompileItem(row("P-2", "HOT WATER PUMP SCHEDULE", { GPM: "120" }), "PUMP")).gpm, 120);
});

test("an air-cooled chiller's unqualified water is its evaporator's chilled water", () => {
  const v = values(normalizeCompileItem(row("CH-1", "PACKAGED AIR COOLED CHILLER SCHEDULE", {
    "(GPM) FLOW WATER OPERATING": "240", "(TONS) CAPACITY NOMINAL": "100", "ELECTRICAL VOLTS": "460", "ELECTRICAL Ø": "3",
  }), "AIR_COOLED_CHILLER"));
  assert.deepEqual(v, { chw_gpm: 240, tons: 100, volts: 460, phase: 3, condenser: "air" });
});

test("EWT/LWT printed in one cell: the header's order, checked against the block's physics", () => {
  const ok = values(normalizeCompileItem(row("CH-1", "CHILLER SCHEDULE", { "EWT / LWT (°F)": "54/44" }), "AIR_COOLED_CHILLER"));
  assert.deepEqual(ok, { chw_ewt_f: 54, chw_lwt_f: 44 });
  // A header printed (or flattened) in the other order that would make
  // chilled water warm up across the evaporator is refused, not swapped.
  const bad = normalizeCompileItem(row("CH-1", "CHILLER SCHEDULE", { "(°F) LWT / EWT": "54/44" }), "AIR_COOLED_CHILLER");
  assert.equal(bad.attributes.chw_ewt_f, undefined);
  assert.match(bad.unknown.chw_ewt_f.reason, /contradicts/);
});

test("minimum outdoor air without CFM printed; MERV only where the cell says MERV; fan speeds; tower cells", () => {
  assert.equal(values(normalizeCompileItem(row("AHU-2", "AIR HANDLING UNIT SCHEDULE", { "SUPPLY FAN MIN. O.A.": "450" }), "AHU")).oa_cfm_min, 450);
  assert.equal(values(normalizeCompileItem(row("RTU-3", "RTU SCHEDULE", { "SUPPLY FAN FILTER": "MERV 13" }), "RTU")).filter_merv, 13);
  assert.equal(values(normalizeCompileItem(row("RTU-4", "RTU SCHEDULE", { "SUPPLY FAN FILTER": "2" }), "RTU")).filter_merv, undefined);
  assert.equal(values(normalizeCompileItem(row("RTU-5", "RTU SCHEDULE", { "PRE-FILTER MERV": "8" }), "RTU")).filter_merv, undefined);
  assert.equal(values(normalizeCompileItem(row("FC-1", "FAN COIL UNIT SCHEDULE", { "AIRSIDE DATA VOLUME CONTROL": "3 SPEED" }), "FCU")).fan_speeds, 3);
  assert.equal(values(normalizeCompileItem(row("CT-1", "COOLING TOWER SCHEDULE", { "# OF CELLS": "2", "FAN MOTOR DATA HP": "10" }), "COOLING_TOWER")).cells, 2);
  assert.equal(values(normalizeCompileItem(row("CT-1", "COOLING TOWER SCHEDULE", { "FAN MOTOR DATA HP": "10" }), "COOLING_TOWER")).fan_hp, 10);
  const pump = values(normalizeCompileItem(row("P-3", "PUMP SCHEDULE", { "ELECTRICAL MOTOR SPEED CONTROL": "VFD" }), "PUMP"));
  assert.equal(pump.vfd, "yes");
  assert.equal(values(normalizeCompileItem(row("P-4", "PUMP SCHEDULE", { "ELECTRICAL MOTOR SPEED CONTROL": "CONSTANT" }), "PUMP")).vfd, undefined);
});

test("enums the title or a TYPE cell states outright; none from a word the row does not print", () => {
  const dd = values(normalizeCompileItem(row("DD-1", "DUAL DUCT VARIABLE AIR VOLUME UNIT SCHEDULE", { "PLAN CODE": "DD-1" }), "VAV"));
  assert.equal(dd.terminal_type, "dual_duct");
  assert.equal(values(normalizeCompileItem(row("FP-1", "FAN POWERED TERMINAL UNIT SCHEDULE", { TYPE: "SERIES FAN POWERED" }), "VAV")).terminal_type, "fan_powered_series");
  assert.equal(values(normalizeCompileItem(row("FP-2", "FAN POWERED TERMINAL UNIT SCHEDULE", {}), "VAV")).terminal_type, undefined, "fan powered, but series or parallel is not printed");
  assert.equal(values(normalizeCompileItem(row("CH-2", "PACKAGED AIR COOLED CHILLER SCHEDULE", {}), "AIR_COOLED_CHILLER")).condenser, "air");
  const hx = values(normalizeCompileItem(row("HX-1", "STEAM TO WATER HEAT EXCHANGER SCHEDULE", { TYPE: "SHELL & TUBE" }), "HEAT_EXCHANGER"));
  assert.deepEqual([hx.primary_medium, hx.secondary_medium, hx.hx_type], ["steam", "hw", "shell_and_tube"]);
  const ahu = values(normalizeCompileItem(row("AHU-3", "AIR HANDLING UNIT SCHEDULE", {
    "HUMIDIFIER MARK": "H-1", "HEAT RECOVERY MARK": "N/A", ECONOMIZER: "DIFFERENTIAL ENTHALPY",
  }), "AHU"));
  assert.deepEqual([ahu.humidifier, ahu.energy_recovery, ahu.economizer], ["yes", "none", "airside"]);
  const wheel = values(normalizeCompileItem(row("AHU-4", "AIR HANDLING UNIT SCHEDULE", { "ACCESSORIES ENERGY RECOVERY WHEEL TAG": "ERW-1" }), "AHU"));
  assert.equal(wheel.energy_recovery, "wheel");
  assert.equal(values(normalizeCompileItem(row("RTU-6", "RTU SCHEDULE", { ECONOMIZER: "SEE NOTE 4" }), "RTU")).economizer, undefined);
});

test("an electric-reheat terminal's MBH is not a hot-water coil's capacity", () => {
  // bldg5406's AIR TERMINAL BOX SCHEDULE as the compile flattens it: the
  // group words are gone ("REHEAT MBH" -> "MBH", "ELECTRIC HEATER KW" -> "KW").
  const n = normalizeCompileItem(row("VAV-1", "AIR TERMINAL BOX SCHEDULE", { MBH: "41.0", KW: "12" }), "VAV");
  const v = values(n);
  assert.equal(v.hw_mbh, undefined);
  assert.equal(v.eh_kw, 12);
  assert.equal(v.heat_type, "electric");
});

test("a count of the unit's parts is never the count of units", () => {
  const ch = values(normalizeCompileItem(row("CH-3", "CHILLER SCHEDULE", {
    "ELECTRICAL COMPRESSOR DATA COMPRESSOR QTY": "4", "ELECTRICAL CONDENSER DATA FAN QTY": "6",
  }), "AIR_COOLED_CHILLER"));
  assert.equal(ch.qty, undefined);
  assert.equal(values(normalizeCompileItem(row("CU-2", "CONDENSING UNIT SCHEDULE", { "CONDENSER FANS QUANTITY": "2" }), "CONDENSING_UNIT")).qty, undefined);
  assert.equal(values(normalizeCompileItem(row("ERV-1", "ERV SCHEDULE", { QTY: "2" }), "ERV")).qty, 2);
  assert.equal(values(normalizeCompileItem(row("EF-6", "FAN SCHEDULE", { "BLOWER # OF FANS": "2" }), "FAN")).qty, 2);
});

test("design airflows only: not a coil's face airflow, a smoke-mode or a maximum outdoor air, nor an SI twin", () => {
  const ahu = values(normalizeCompileItem(row("AHU-5", "AIR HANDLING UNIT SCHEDULE", {
    "CHILLED WATER/DEHUMIDIFICATION COOLING COIL CFM": "3900", "AIR FLOWS OCCUPIED MODE OA CFM": "800",
    "AIR FLOWS SMOKE MODE SA & OA CFM": "4000", "AIR FLOWS TOTAL MAX. CFM": "4200",
  }), "AHU"));
  assert.equal(ahu.supply_cfm, 4200);
  assert.equal(ahu.oa_cfm_min, 800);
  assert.equal(values(normalizeCompileItem(row("DOAS-1", "DOAS SCHEDULE", { "MAX OUTSIDE AIR CFM": "2000" }), "DOAS")).oa_cfm_min, undefined);
  const uh = values(normalizeCompileItem(row("EUH-2", "ELECTRIC UNIT HEATER SCHEDULE", { "AIR FLOW L/S": "165", "AIR FLOW CFM": "350" }), "UNIT_HEATER"));
  assert.equal(uh.cfm, 350);
});

test("SYSTEM is never an area; SERVICE is an area only where no AREA SERVED column prints one", () => {
  const cu = values(normalizeCompileItem(row("CU-3", "CONDENSING UNIT SCHEDULE", { SYSTEM: "FCU-1" }), "CONDENSING_UNIT"));
  assert.equal(cu.area_served, undefined);
  const rtu = values(normalizeCompileItem(row("RTU-7", "RTU SCHEDULE", { SERVICE: "ADMIN AREA" }), "RTU"));
  assert.equal(rtu.area_served, "ADMIN AREA");
  const dmc = values(normalizeCompileItem(row("HC-1", "HOT WATER COIL SCHEDULE", { "AREA AND/OR BLDG SERVED": "BLDG 5", "SYSTEM AND/OR SERVICE": "AHU-1" }), "DUCT_MOUNTED_COIL"));
  assert.equal(dmc.area_served, "BLDG 5");
  assert.equal(values(normalizeCompileItem(row("P-5", "PUMP SCHEDULE", { SYSTEM: "HOT WATER" }), "PUMP")).service, "HOT WATER");
});

test("steam: the flow, not a trap's capacity; the supply pressure entering the control valve", () => {
  const hx = values(normalizeCompileItem(row("HX-2", "STEAM TO WATER HEAT EXCHANGER SCHEDULE", {
    "CONTROL VALVE LBS/HR": "850", "TRAP CAPACITY LBS/HR": "2550",
    "STEAM PRESSURE ENT CONTROL VALVE PSIG": "15", "STEAM PRESSURE ENT HEAT EXCHANGER PSIG": "10",
  }), "HEAT_EXCHANGER"));
  assert.equal(hx.primary_steam_lb_hr, 850);
  assert.equal(hx.primary_steam_psig, 15);
});

test("a hook-up connection is not a vent, a drain or a suction diffuser; ROW/FIN splits in the header's order", () => {
  const uh = values(normalizeCompileItem(row("GUH-1", "NATURAL GAS UNIT HEATER SCHEDULE", { "GAS CONNECTION": '1/2"', "VENT CONNECTION": '4"' }), "UNIT_HEATER"));
  assert.equal(uh.conn_in, 0.5);
  const p = values(normalizeCompileItem(row("P-6", "PUMP SCHEDULE", { "SUCTION DIFFUSER": "3", "PIPE CONNECTIONS SUCTION": '2-1/2"' }), "PUMP"));
  assert.equal(p.conn_in, 2.5);
  const ahu = values(normalizeCompileItem(row("AHU-6", "AHU SCHEDULE (CHW)", { "COOLING COIL AIR DATA ROW/FIN. PER FT.": "6/144", "COOLING COIL WATER DATA FLOW GPM": "40" }), "AHU"));
  assert.equal(ahu.chw_rows, 6);
});

test("a coil schedule whose water columns all name hot water decides an unqualified capacity", () => {
  const v = values(normalizeCompileItem(row("HC-2", "COIL SCHEDULE", {
    "HOT WATER FLOW GPM": "4.5", "HOT WATER EWT °F": "180", "HOT WATER LWT °F": "160", "TOTAL MIN CAPACITY MBH": "44",
  }), "DUCT_MOUNTED_COIL"));
  assert.equal(v.heating_mbh, 44);
  assert.equal(v.cooling_mbh, undefined);
});

test("a filter cell printing its thickness and MERV; OUTPUT over a bare BTUH", () => {
  assert.equal(values(normalizeCompileItem(row("RTU-8", "RTU SCHEDULE", { "SUPPLY FAN FILTER": '2" MERV 8' }), "RTU")).filter_merv, 8);
  const uh = values(normalizeCompileItem(row("GUH-2", "NATURAL GAS UNIT HEATER SCHEDULE", { BTUH: "60,000", "BTUH OUTPUT": "49,800" }), "UNIT_HEATER"));
  assert.equal(uh.heating_mbh, 49.8);
});
