// ASSEMBLIES WP2 — the structural normalizer (src/lib/assemblies/normalize.ts)
// on rows shaped like the compile's own: flattened multi-tier header strings
// as the dev census recorded them, cells as printed.
import test from "node:test";
import assert from "node:assert/strict";
import {
  headerText, normalizeCompileItem, parseElectricalCell, parseNumberCell, parseSizeCell, quantitiesOf, vfdDrivenTags,
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
  assert.equal(values(normalizeCompileItem(row("P-4", "PUMP SCHEDULE", { "ELECTRICAL MOTOR SPEED CONTROL": "CONSTANT" }), "PUMP")).vfd, "no", "constant speed: no VFD");
  assert.equal(values(normalizeCompileItem(row("P-4", "PUMP SCHEDULE", { "ELECTRICAL MOTOR SPEED CONTROL": "SEE NOTE 2" }), "PUMP")).vfd, undefined);
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

test("a mark printed on stacked lines: columns that differ are not one value, columns alike are", () => {
  // 031's FAN SCHEDULE as the sheet graph holds it: WHSE-SF1 on two lines
  // (SELECTION CRITERIA, then OPERATING CONDITION); the compile keeps the first.
  const headers = ["MARK", "AIR FLOW CFM", "TSP IN", "MOTOR ELECTRICAL NOMINAL POWER HP", "MOTOR ELECTRICAL VOLT", "REMARKS"];
  const line = (cfm: string, tsp: string, remark: string) => ({ key: "WHSE-SF1", cells: { MARK: "WHSE-SF1", "AIR FLOW CFM": cfm, "TSP IN": tsp, "MOTOR ELECTRICAL NOMINAL POWER HP": "15", "MOTOR ELECTRICAL VOLT": "460", REMARKS: remark } });
  const table = { headers, rows: [line("13500", "6.4", "SELECTION CRITERIA"), line("11250", "4.9", "OPERATING CONDITION")] };
  const n = normalizeCompileItem(row("WHSE-SF1", "FAN SCHEDULE", { "AIR FLOW CFM": "13500", "TSP IN": "6.4", "MOTOR ELECTRICAL NOMINAL POWER HP": "15", "MOTOR ELECTRICAL VOLT": "460", REMARKS: "SELECTION CRITERIA" }), "FAN", table);
  const v = values(n);
  assert.equal(v.cfm, undefined);
  assert.match(n.unknown.cfm.reason, /2 lines that differ in "AIR FLOW CFM" \(13500 \/ 11250\)/);
  assert.equal(v.esp_in, undefined);
  assert.equal(v.motor_hp, 15);
  assert.equal(v.volts, 460);
  // WHSE-PHC1 prints both lines alike: its values stand.
  const phc = { headers: ["MARK", "AIR FLOW CFM"], rows: [{ key: "WHSE-PHC1", cells: { "AIR FLOW CFM": "6075" } }, { key: "WHSE-PHC1", cells: { "AIR FLOW CFM": "6075" } }] };
  assert.equal(values(normalizeCompileItem(row("WHSE-PHC1", "HOT WATER HEATING COIL SCHEDULE", { "AIR FLOW CFM": "6075" }), "DUCT_MOUNTED_COIL", phc)).cfm, 6075);
});

test("one controller per motor: a VFD rules out an EC motor and a starter rules out both; HP\\QTY; NONE is no VFD", () => {
  const f = (cell: string) => values(normalizeCompileItem(row("EF-9", "FAN SCHEDULE", { "ELECTRICAL CONTROLLER/ STARTER TYPE": cell }), "FAN"));
  assert.deepEqual([f("VFD").vfd, f("VFD").ecm], ["yes", "no"]);
  assert.deepEqual([f("ECM").vfd, f("ECM").ecm], ["no", "yes"]);
  assert.deepEqual([f("MAGNETIC STARTER").vfd, f("MAGNETIC STARTER").ecm], ["no", "no"]);
  assert.equal(f("SEE NOTE 3").vfd, undefined);
  const ahu = values(normalizeCompileItem(row("AHU-9", "AHU SCHEDULE", { "SUPPLY FAN HP/QTY": "3.2 \\ 6" }), "AHU"));
  assert.deepEqual([ahu.supply_fan_hp, ahu.supply_fan_qty], [3.2, 6]);
  assert.equal(values(normalizeCompileItem(row("P-7", "PUMP SCHEDULE", { "ELECTRICAL MOTOR SPEED CONTROL": "NONE" }), "PUMP")).vfd, "no");
});

// itd-d1-lab SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE: one row, "F-1 , CU-1",
// a furnace and its condensing unit; bldg5406's "ACCU-1 / AC-1" row prints one
// unqualified V/φ/HZ (its φ lost by the text layer).
test("split systems: a column naming the other half is not this unit's; a pair's bare power is the outdoor unit's", () => {
  const cells = {
    "SUPPLY FAN CFM": "2,250", "SUPPLY FAN HP": "1.0", "SUPPLY FAN V/Ø": "115/1", "GAS HEATING CAPACITY OUTPUT MBH": "78.0",
    "ELECTRICAL FOR CONDENSING UNIT V/Ø": "208/1", "NOMINAL TONS": "5",
  };
  const rows = [{ key: "F-1CU-1", cells: { SYMBOL: "F-1 , CU-1", ...cells } }];
  const table = { headers: ["SYMBOL", ...Object.keys(cells)], rows };
  const title = "SPLIT SYSTEM AIR CONDITIONING UNIT SCHEDULE (96%+ GAS)";
  const f1 = values(normalizeCompileItem(row("F-1", title, cells), "FCU", table));
  assert.deepEqual([f1.volts, f1.phase, f1.cfm, f1.cooling_type], [115, 1, 2250, "dx"]);
  const cu = values(normalizeCompileItem(row("CU-1", title, cells), "CONDENSING_UNIT", table));
  assert.deepEqual([cu.volts, cu.phase, cu.cfm, cu.motor_hp, cu.heating_mbh], [208, 1, undefined, undefined, undefined]);
  const pair = { "(V / / ELECTRICAL HZ)": "208 / 1 / 60", CFM: "530", "COOLING MBH": "24" };
  const pairTable = { headers: ["MARK", ...Object.keys(pair)], rows: [{ key: "ACCU-1/AC-1", cells: { MARK: "ACCU-1 / AC-1", ...pair } }] };
  const accu = values(normalizeCompileItem(row("ACCU-1", "SPLIT SYSTEM AIR CONDITIONING UNITS", pair), "CONDENSING_UNIT", pairTable));
  assert.deepEqual([accu.volts, accu.phase, accu.cfm], [208, 1, undefined]);
  const ac = values(normalizeCompileItem(row("AC-1", "SPLIT SYSTEM AIR CONDITIONING UNITS", pair), "FCU", pairTable));
  assert.deepEqual([ac.volts, ac.phase, ac.cfm], [undefined, undefined, 530]);
});

// 12_MT's CABINET UNIT HEATER SCHEDULE prints the coil's water under AIR SIDE
// (EAT 180, LAT 160) and the air under LIQUID SIDE (EAT 55, LWT 130).
test("a coil water temperature that contradicts its own block's entering air is refused", () => {
  const cuh = normalizeCompileItem(row("CUH-1", "CABINET UNIT HEATER SCHEDULE", {
    "PERFORMANCE AIR SIDE EAT °F": "180", "PERFORMANCE AIR SIDE LAT °F": "160",
    "PERFORMANCE LIQUID SIDE (FRESH WATER) GPM": "1.5", "PERFORMANCE LIQUID SIDE (FRESH WATER) EAT °F": "55",
    "PERFORMANCE LIQUID SIDE (FRESH WATER) LWT °F": "130", "ELECTRICAL DATA VOLT": "24 VDC", "ELECTRICAL DATA WATT": "15",
  }), "CABINET_UNIT_HEATER");
  const v = values(cuh);
  assert.equal(v.hw_lwt_f, undefined);
  assert.match(cuh.unknown.hw_lwt_f.reason, /contradicts the row's entering air/);
  assert.equal(v.heating_medium, "hw", "a heating-only unit with a water flow heats with that water");
  assert.equal(v.volts, 24);
  assert.ok(Math.abs(Number(v.motor_hp) - 15 / 745.699872) < 1e-6, "a water-heated unit's electrical watts are its fan's");
  // 069's AHU: a preheat coil's 13 °F entering air says nothing of the cooling coil's water.
  const ahu = values(normalizeCompileItem(row("AHU-1", "AIR HANDLING UNIT SCHEDULE", {
    "CHILLED WATER/DEHUMIDIFICATION COOLING COIL E.A.T. (°F) D.B.": "98.7",
    "CHILLED WATER/DEHUMIDIFICATION COOLING COIL FLUID PERFORMANCE E.W.T.": "45",
    "CHILLED WATER/DEHUMIDIFICATION COOLING COIL FLUID PERFORMANCE L.W.T.": "55.0",
    "HEATING COIL E.A.T. (°F) D.B.": "12.9", "HEATING COIL FLUID PERFORMANCE E.W.T.": "140", "HEATING COIL FLUID PERFORMANCE L.W.T.": "98.1",
  }), "AHU"));
  assert.deepEqual([ahu.chw_ewt_f, ahu.chw_lwt_f, ahu.hw_ewt_f, ahu.hw_lwt_f, ahu.cooling_type], [45, 55, 140, 98.1, "chw"]);
});

test("coils named by tag, COOLING ONLY, gas inputs, split and packaged titles", () => {
  const ahu = values(normalizeCompileItem(row("AHU-1", "AIR HANDLING UNIT SCHEDULE", { "COIL DATA HEATING HW TAG": "HWC", "COIL DATA COOLING CHW TAG": "CHWC" }), "AHU"));
  assert.deepEqual([ahu.cooling_type, ahu.heating_type], ["chw", "hw"]);
  const dfc = values(normalizeCompileItem(row("DFC-1", "DUCTLESS SPLIT HIGH WALL COOLING UNIT SCHEDULE", { "UNIT TYPE": "HIGH WALL COOLING ONLY", "SUPPLY FAN CFM": "640" }), "FCU"));
  assert.deepEqual([dfc.heating_type, dfc.cooling_type], ["none", "dx"]);
  assert.equal(values(normalizeCompileItem(row("B-1", "HOT WATER CONDENSING BOILER SCHEDULE", { "FIRING RATE NATURAL GAS (CFH)": "750" }), "BOILER")).fuel, "gas");
  assert.equal(values(normalizeCompileItem(row("HUM-1", "HUMIDIFIER SCHEDULE", { "GAS INPUT MBH": "368.5" }), "HUMIDIFIER")).humidifier_type, "gas_fired");
  assert.equal(values(normalizeCompileItem(row("SH-1", "STEAM HUMIDIFER SCHEDULE", { "HUMIDIFIER TYPE": "UNIT-MOUNTED DISPERSION TUBE", SOURCE: "CLEAN STEAM" }), "HUMIDIFIER")).humidifier_type, "direct_injection");
  assert.equal(values(normalizeCompileItem(row("SH-2", "HUMIDIFIER SCHEDULE", { "HUMIDIFIER TYPE": "DISPERSION TUBE", SOURCE: "ELECTRIC" }), "HUMIDIFIER")).humidifier_type, undefined);
  assert.equal(values(normalizeCompileItem(row("RTU-1", "PACKAGED ROOFTOP AIR CONDITIONING UNIT SCHEDULE (GAS HEAT)", { "SUPPLY FAN CFM": "4000" }), "RTU")).cooling_type, "dx");
});

test("cells: one MERV in a filter's words, a NOMINAL size under a capacity, a per-unit share, inch marks, a printed zero motor", () => {
  const merv = (cell: string) => values(normalizeCompileItem(row("AHU-4", "AHU SCHEDULE", { "FILTERS FINAL FILTER TYPE": cell, "FILTERS PREFILTER TYPE": '2" Pleated - MERV 8' }), "AHU")).filter_merv;
  assert.equal(merv("12in. cartridge - 95% eff - MERV 15"), 15);
  assert.equal(merv("MERV 8 / MERV 13"), undefined);
  assert.equal(merv("13"), undefined, "a bare number counts only under a MERV header");
  assert.equal(values(normalizeCompileItem(row("CH-2", "CHILLER SCHEDULE", { "COOLING CAPACITY NOMINAL TONS": "30", "COOLING CAPACITY CAPACITY TONS": "23" }), "AIR_COOLED_CHILLER")).tons, 23);
  assert.equal(parseNumberCell("15,000 (7,500 PER FAN)")?.n, 15000);
  const lef = values(normalizeCompileItem(row("LEF-1", "LAB EXHAUST FAN SCHEDULE", { "BLOWER CFM DESIGN": "15,000 (7,500 PER FAN)", "BLOWER ESP": '4.0"' }), "FAN"));
  assert.deepEqual([lef.cfm, lef.esp_in], [15000, 4]);
  assert.equal(values(normalizeCompileItem(row("EV-1", "FAN COIL SCHEDULE", { "FAN DATA WATTS": "0" }), "FCU")).motor_hp, 0);
});

// 12_MT's DUAL DUCT VARIABLE AIR VOLUME UNIT SCHEDULE: air quantities with no
// CFM word, a cold and a hot deck each with a minimum.
test("a dual-duct terminal's air quantities: cold design is its maximum, hot design its heating flow, cold minimum its minimum", () => {
  const v = values(normalizeCompileItem(row("VAV-1", "DUAL DUCT VARIABLE AIR VOLUME UNIT SCHEDULE", {
    "PRIMARY AIR MINIMUM COLD": "70", "PRIMARY AIR MINIMUM HOT": "30", "DESIGN QUANTITIES COLD": "200", "DESIGN QUANTITIES HOT": "130", "INLET AIR SIZE COLD INLET": '6"',
  }), "VAV"));
  assert.deepEqual([v.cfm_max, v.cfm_min, v.cfm_heat], [200, 70, 130]);
});

// 040's FAN SCHEDULE: "CONTROLLER/ STARTER TYPE (NOTE C)" = "FV"; 094's AHU
// schedule: "UNIT COMPONENTS … SEE LEGEND BELOW" = "MXTD3-PF-FF-CC-HF-FAN";
// 069's VFD schedule: PURPOSE "HWP-1".
test("codes a cited note or the table's legend defines, and a drive schedule's load", () => {
  const codes = { "ELECTRICAL (NOTE 1) CONTROLLER/ STARTER TYPE (NOTE C)": { FV: "FULL VOLTAGE", VFD: "VARIABLE FREQUENCY DRIVE" } };
  const ef = (cell: string) => values(normalizeCompileItem(row("EF-2A", "FAN SCHEDULE", { "ELECTRICAL (NOTE 1) CONTROLLER/ STARTER TYPE (NOTE C)": cell }), "FAN", { headers: [], codes }));
  assert.deepEqual([ef("FV").vfd, ef("FV").ecm], ["no", "no"]);
  assert.equal(ef("XX").vfd, undefined);
  const legend = { MXTD3: "SIMILAR TO MXTD2", PF: "PREFILTER", FF: "FINAL FILTER", CC: "COILING COIL", HF: "ELECTRIC HUMIDIFIER SECTION", FAN: "FAN", HCS: "ELEC. HEATING COIL SECTION", OAI: "OUTSIDE AIR INTAKE SECTION" };
  const ahu = (seq: string) => values(normalizeCompileItem(row("AHU-4", "Air Handling Unit Schedule CHW", { "UNIT COMPONENTS IN DIRECTION OF AIR FLOW SEE LEGEND BELOW": seq }), "AHU", { headers: [], legend }));
  assert.deepEqual([ahu("MXTD3-PF-FF-CC-HF-FAN").humidifier, ahu("MXTD3-PF-FF-CC-HF-FAN").heating_type], ["yes", "none"]);
  assert.deepEqual([ahu("OAI-PF-FF-CC-HCS-FAN").humidifier, ahu("OAI-PF-FF-CC-HCS-FAN").heating_type], ["no", "electric"]);
  assert.equal(ahu("OAI-PF-XX-FAN").humidifier, undefined, "a code the legend does not define: no reading");
  const driven = vfdDrivenTags([
    { family: "PUMP", tag: "HWP-1", cells: {} }, { family: "PUMP", tag: "BP-1", cells: {} },
    { family: "VARIABLE_FREQUENCY_DRIVE", tag: "VFD-1", sheet_id: "set.pdf#5", table_title: "NEW VARIABLE FREQUENCY DRIVE SCHEDULE", cells: { PURPOSE: { text: "HWP-1", bbox: [1, 2, 3, 4] } } },
  ]);
  const pump = (tag: string) => normalizeCompileItem(row(tag, "NEW PUMP SCHEDULE", { "CAPACITY FLOW (GPM)": "80" }), "PUMP", { headers: [], driven });
  assert.deepEqual([values(pump("HWP-1")).vfd, values(pump("BP-1")).vfd], ["yes", undefined]);
  // The value is printed in the drive schedule, so it cites that row (a key
  // of the pump's own table scores it out of scope, never invented).
  assert.deepEqual(pump("HWP-1").attributes.vfd.cite, { sheet: "set.pdf#5", table_title: "NEW VARIABLE FREQUENCY DRIVE SCHEDULE", header: "PURPOSE", bbox: [1, 2, 3, 4] });
});

test("two units of one kind on a row are no split pair; a legend column must list the unit's sections", () => {
  const cells = { "ELECTRICAL V/PH": "208/1", CFM: "400" };
  const table = { headers: ["MARK", ...Object.keys(cells)], rows: [{ key: "FCU-1/FCU-2", cells: { MARK: "FCU-1/FCU-2", ...cells } }] };
  assert.equal(values(normalizeCompileItem(row("FCU-1", "FAN COIL UNIT SCHEDULE", cells), "FCU", table)).volts, 208);
  const legend = { PF: "PREFILTER", FF: "FINAL FILTER", HF: "ELECTRIC HUMIDIFIER SECTION" };
  const filters = values(normalizeCompileItem(row("AHU-9", "AHU SCHEDULE", { "FILTER TYPE (SEE LEGEND)": "PF-FF" }), "AHU", { headers: [], legend }));
  assert.equal(filters.humidifier, undefined, "a filter column's codes are not the unit's whole list of sections");
});

// ── AS-17: rules from the second dev tier's misses (each from a dev-2 row) ──

test("electrical tuples: labeled parts, V/HZ/PH and V/H/P orders, a dash separator, ELECTRICAL DATA V", () => {
  assert.deepEqual(parseElectricalCell("208V 3ph"), { volts: 208, phase: 3 }); // 036_LA "VOLTAGE- PHASE"
  assert.deepEqual(parseElectricalCell("208/60/1"), { volts: 208, phase: 1 }); // 066_MT "V/HZ/PH"
  assert.deepEqual(parseElectricalCell("120/1"), { volts: 120, phase: 1 }); // 14_OR "ELEC [V/H/P]"
  assert.deepEqual(parseElectricalCell("115/5"), { volts: 115, phase: null }, "a printed 5 is no phase");
  assert.equal(parseElectricalCell("208/230/1"), null, "two voltages");
  for (const h of ["ELECTRICAL VOLTAGE- PHASE", "ELEC [V/H/P]", "POWER (1) V/HZ/PH", "ELECTRICAL VOLTS/ PH /HZ", "ELECTRICAL VOLTS / PHASE / HERTZ"]) assert.ok(quantitiesOf(headerText(h)).includes("vph"), h);
  assert.deepEqual(quantitiesOf(headerText("ELECTRICAL DATA V")), ["volts"]);
  assert.ok(!quantitiesOf(headerText("V-BELT DRIVE")).includes("vph"));
  const cu = values(normalizeCompileItem(row("07-A-CU-1", "VRV- AIR-COOLED CONDENSING UNIT SCHEDULE", { "ELECTRICAL VOLTAGE- PHASE": "208V 3ph" }), "CONDENSING_UNIT"));
  assert.deepEqual([cu.volts, cu.phase], [208, 3]);
  // 044_NY: ELECTRICAL DATA over three unlabeled sub-columns.
  const accu = values(normalizeCompileItem(row("ACCU-1", "AIR-COOLED CONDENSING UNIT SCHEDULES (ACCU)", { "ELECTRICAL DATA": "208", "ELECTRICAL DATA 2": "1", "ELECTRICAL DATA 3": "60" }), "CONDENSING_UNIT"));
  assert.deepEqual([accu.volts, accu.phase], [208, 1]);
});

test("a US unit in brackets is the column's unit; an SI twin in brackets is never read", () => {
  const b = values(normalizeCompileItem(row("B-1", "HOT WATER CONDENSING BOILER", {
    "INPUT [MBH]": "600", "HIGH FIRE OUTPUT [MBH]": "585", "EWT [°F]": "110", "LWT [°F]": "130", "ELEC [V/H/P]": "120/1",
    "MIN GAS PRESS [IN. WC]": "5", "MAX GPM": "105", "MIN GPM": "10", "AIR INLET [IN]": "4", "GAS INLET [IN]": "1",
  }), "BOILER"));
  assert.deepEqual(b, { input_mbh: 600, output_mbh: 585, ewt_f: 110, lwt_f: 130, volts: 120, phase: 1, fuel: "gas" },
    "a MAX and a MIN flow are limits, not the design flow; a burner's air and gas inlets are no water connection");
  const ahu = values(normalizeCompileItem(row("AHU-1", "AHU SCHEDULE", { "AIR FLOW SUPPLY [L/S]": "[ 6400 ]", "TOTAL CAPACITY [KW]": "[ 170 ]", "AIR FLOW SUPPLY CFM": "13500" }), "AHU"));
  assert.deepEqual(ahu, { supply_cfm: 13500 });
});

test("a cell printing one value per labeled part of its header", () => {
  const vav = (cell: string) => values(normalizeCompileItem(row("VAV-1-01", "VAV TERMINAL BOX SCHEDULE", { "CFM DESIGN": "220", "CFM COOL MIN / HEATING": cell }), "VAV"));
  assert.deepEqual(vav("80 / 125"), { cfm_max: 220, cfm_min: 80, cfm_heat: 125 }); // 21_VA
  assert.deepEqual(vav("200 / -"), { cfm_max: 220, cfm_min: 200 }, "a dash part is none");
  assert.deepEqual(vav("80 / N/A"), { cfm_max: 220 }, "not two parts");
  const n = normalizeCompileItem(row("B1", "2-STAGE, GAS FIRED FURNACE SCHEDULE", { "HEATING PERFORMANCE OUTPUT CAPACITY SECOND STAGE/FIRST STAGE (MBH)": "60/42" }), "FURNACE");
  assert.equal(n.attributes.heating_mbh.value, 60, "the full (second-stage) capacity"); // 16_NV
  assert.equal(n.attributes.heating_mbh.printed, "60/42");
  assert.equal(n.attributes.heating_mbh.cite.header, "HEATING PERFORMANCE OUTPUT CAPACITY SECOND STAGE/FIRST STAGE (MBH)");
  assert.deepEqual(values(normalizeCompileItem(row("VAV-2", "VAV SCHEDULE", { "MAX/MIN CFM": "800/300" }), "VAV")), { cfm_max: 800, cfm_min: 300 });
  assert.deepEqual(values(normalizeCompileItem(row("P-1", "PUMP SCHEDULE", { "EFFICIENCY KW/TON": "0.6/0.5" }), "PUMP")), {}, "a unit's own slash");
});

test("unitary capacity words (COOL MBH TC/SC, HEAT MBH, HEAT MBH IN/OUT), a fired heater, a fan coil's chilled-water coil", () => {
  const hp = values(normalizeCompileItem(row("HP-01", "SPLIT SYSTEM HEAT PUMPS", { "COOL MBH TC": "30", "COOL MBH SC": "22", "HEAT MBH": "30" }), "HEAT_PUMP"));
  assert.deepEqual([hp.cooling_mbh, hp.heating_mbh], [30, 30]); // 14_OR
  const mau = values(normalizeCompileItem(row("MAU-1", "MAKE UP AIR UNITS", { "COOL MBH TC": "91", "COOL MBH SC": "90", "HEAT MBH IN": "174", "HEAT MBH OUT": "141", SEER: "18.6" }), "OUTDOOR_AIR_UNIT"));
  assert.deepEqual([mau.cooling_mbh, mau.gas_input_mbh, mau.heating_mbh, mau.heating_type, mau.cooling_type], [91, 174, 141, "gas", "dx"]);
  const fcu = values(normalizeCompileItem(row("FCU-1", "CHILLED WATER FAN COIL UNIT SCHEDULE", { "CHILLED WATER COIL TOTAL BTU/H": "24197.00", "CHILLED WATER COIL SENS. BTU/H": "18759.00", "CHILLED WATER COIL GPM": "3.4" }), "FCU"));
  assert.equal(fcu.chw_mbh, 24.197); // 088_AZ
  assert.equal(fcu.cooling_mbh, undefined);
  const ch = values(normalizeCompileItem(row("CH-1", "WATER COOLED CENTRIFUGAL CHILLER SCHEDULE", { TONS: "300", "MAX (KW/TON)": "0.630" }), "AIR_COOLED_CHILLER"));
  assert.deepEqual([ch.tons, ch.kw_input], [300, undefined], "KW/TON is an efficiency");
  assert.equal(values(normalizeCompileItem(row("CT-2", "COOLING TOWER SCHEDULE", { "HEAT REJECTION TONNAGE": "300", "# OF FANS": "1" }), "COOLING_TOWER")).tons, 300);
  assert.equal(values(normalizeCompileItem(row("CT-2", "COOLING TOWER SCHEDULE", { "# OF FANS": "1" }), "COOLING_TOWER")).qty, undefined, "a count of fans is no count of towers");
});

test("the unit's own speed over its motor's; each motor's HP over a TOTAL; NO. OF FAN(S); a package's TOTAL flow", () => {
  const p = values(normalizeCompileItem(row("CHP-1", "HYDRONIC PUMPS", { "OPER. RPM": "1893", "MOTOR RPM": "2000", "MOTOR CONTROL": "VFD" }), "PUMP"));
  assert.deepEqual([p.rpm, p.vfd], [1893, "yes"]); // 14_OR
  assert.equal(values(normalizeCompileItem(row("BP-1", "HYDRONIC PUMPS", { "MOTOR CONTROL": "ECM" }), "PUMP")).vfd, "no", "an ECM motor runs on no VFD");
  const ahu = values(normalizeCompileItem(row("AHU-1", "VARIABLE VOLUME AIR HANDLING UNIT SCHEDULE", {
    "FAN DATA FAN MOTOR NO. OF FAN(S)": "2", "FAN DATA FAN MOTOR FAN POWER HP": "4", "FAN DATA FAN MOTOR TOTAL FAN POWER HP": "8",
  }), "AHU"));
  assert.deepEqual([ahu.supply_fan_qty, ahu.supply_fan_hp], [2, 4]); // 03_FL
  assert.equal(values(normalizeCompileItem(row("BP-1", "DOMESTIC WATER BOOSTER PUMP SCHEDULE", { "TOTAL FLOW GPM": "100", "PUMP FLOW RATE GPM": "50" }), "PUMP")).gpm, 100); // 21_VA
  assert.equal(values(normalizeCompileItem(row("FOP-1", "GENERATOR FUEL OIL PUMP SCHEDULE", { "GENERATOR GPH": "757" }), "PUMP")).gpm, Number((757 / 60).toPrecision(12)), "GPH converts");
  assert.equal(values(normalizeCompileItem(row("C1", "ENERGY RECOVERY VENTILATOR SCHEDULE", { "OUTDOOR AIR PERFORMANCE QUANTITY": "1" }), "ERV")).qty, undefined, "a section's count"); // 16_NV
});

test("a coil's rows are a water coil's only where the row prints or names that water", () => {
  const dx = values(normalizeCompileItem(row("B1", "OUTDOOR AIR UNIT SCHEDULE", { "COOLING PERFORMANCE CAPACITY (MBH) TOTAL": "50.0", "COOLING PERFORMANCE ROWS": "3" }), "OUTDOOR_AIR_UNIT"));
  assert.equal(dx.chw_rows, undefined); // 16_NV
  const chw = values(normalizeCompileItem(row("DOAS-1", "DEDICATED OUTDOOR AIR SYSTEM", { "CHILLED WATER COIL ROWS": "6", "CHILLED WATER COIL FLOW GPM": "11" }), "DOAS"));
  assert.equal(chw.chw_rows, 6);
});

test("SERVICE names a duty; SERVING names what is served; a family with no service reads either as the area", () => {
  const fan = (header: string, cell: string) => values(normalizeCompileItem(row("EF-1", "FAN SCHEDULE", { [header]: cell }), "FAN"));
  assert.deepEqual(fan("SERVING", "KH-1"), { area_served: "KH-1" }); // 03_FL
  assert.deepEqual(fan("SERVING", "RESTROOMS"), { area_served: "RESTROOMS" });
  assert.deepEqual(fan("SERVING", "110° F RETURN"), { service: "110° F RETURN" }, "a system is a service");
  assert.deepEqual(fan("SERVICE", "RESTROOMS"), { service: "RESTROOMS" }, "SERVICE names the fan's duty (bldg5406)");
  assert.deepEqual(fan("SYSTEM AND/OR SERVICE", "WHSE-AHU-1"), { service: "WHSE-AHU-1" });
  const unit = (family: string, header: string, cell: string) => values(normalizeCompileItem(row("U-1", "SCHEDULE", { [header]: cell }), family)).area_served;
  assert.equal(unit("DOAS", "SERVING", "SECTOR A - WEST"), "SECTOR A - WEST"); // 14_OR
  assert.equal(unit("FURNACE", "GENERAL UNIT DATA SERVICE", "CLASSROOM 23"), "CLASSROOM 23"); // 16_NV
  assert.equal(unit("CONDENSING_UNIT", "UNIT GENERAL DATA SERVICE", "F-B1 AND EC-B1"), "F-B1 AND EC-B1");
  assert.equal(unit("OUTDOOR_AIR_UNIT", "UNIT GENERAL DATA SERVICE", "BUILDING B OUTSIDE AIR"), undefined, "a cell naming a system is not only an area");
  assert.equal(unit("FCU", "ELECTRICAL SERVICE", "208/1"), undefined);
});

test("a mezzanine in the word printed; a heating block printed empty is no heat; a heat pump schedule's indoor unit", () => {
  const loc = (cell: string) => values(normalizeCompileItem(row("U-1", "SCHEDULE", { LOCATION: cell }), "DOAS")).floor;
  assert.deepEqual([loc("RR 136 MEZZ"), loc("MEZZANINE")], ["MEZZ", "MEZZANINE"]); // 14_OR, 044_NY
  const vav = values(normalizeCompileItem(row("VAV-1-16", "VAV TERMINAL BOX SCHEDULE", {
    "REHEAT COIL DATA E.A.T DEG. F": "55.0", "REHEAT COIL DATA E.W.T. DEG. F": "-", "REHEAT COIL DATA P FT. H20": "-", "REHEAT COIL DATA GPM": "-", "REHEAT COIL DATA MBH": "-",
  }), "VAV"));
  assert.equal(vav.heat_type, "none"); // 21_VA
  const hwCells = { "HOT WATER HEATING PERFORMANCE CAPACITY (MBH)": "N/A", "HOT WATER HEATING PERFORMANCE FLUID FLOW (GPM)": "N/A", "HOT WATER HEATING PERFORMANCE EWT (°F)": "N/A" };
  assert.equal(values(normalizeCompileItem(row("B1", "OUTDOOR AIR UNIT SCHEDULE", hwCells), "OUTDOOR_AIR_UNIT")).heating_type, "none"); // 16_NV
  assert.equal(values(normalizeCompileItem(row("B1", "GAS FIRED OUTDOOR AIR UNIT SCHEDULE", hwCells), "OUTDOOR_AIR_UNIT")).heating_type, undefined, "the title names another heat");
  assert.equal(values(normalizeCompileItem(row("VAV-1", "VAV SCHEDULE", { "REHEAT COIL DATA P FT. H20": "0.16" }), "VAV")).hw_wpd_ft, 0.16, "a ΔP whose Δ the text lost");
  assert.equal(values(normalizeCompileItem(row("FC-01", "SPLIT SYSTEM HEAT PUMPS", { "COOL MBH TC": "30" }), "FCU")).heating_type, "heat_pump"); // 14_OR
});

test("a dual-fuel boiler's primary fuel rating; fuel from a firing rate in CFH or a gas pressure", () => {
  const b = values(normalizeCompileItem(row("B-1", "FIRE TUBE STEAM BOILER SCHEDULE", {
    "NATURAL GAS INPUT MBH": "24,494", "NATURAL GAS OUTPUT MBH": "20085", "# 2 OIL INPUT MBH": "24500", "# 2 OIL OUTPUT MBH": "20090",
  }), "BOILER"));
  assert.deepEqual([b.fuel, b.input_mbh, b.output_mbh], ["dual_fuel", 24494, 20085]); // 044_NY
  assert.equal(values(normalizeCompileItem(row("B-1", "CONDENSING BOILER SCHEDULE", { "BOILER RATINGS FIRING RATE (CFH)": "390" }), "BOILER")).fuel, "gas"); // 03_FL
  assert.equal(values(normalizeCompileItem(row("B-1", "BOILER", { "# 2 OIL INPUT MBH": "900" }), "BOILER")).fuel, "oil");
});

test("a heat exchanger's hot and cold sides by duty; a flue gas economizer's water; the heat it exchanges", () => {
  const hx = values(normalizeCompileItem(row("HX-1", "HEAT EXCHANGER", {
    "HOT SIDE FLOW (GPM)": "15.8", "HOT SIDE INLET TEMP (ºF)": "130", "HOT SIDE OUTLET TEMP (ºF)": "100",
    "COLD SIDE FLOW (GPM)": "17", "COLD SIDE INLET TEMP (ºF)": "85", "COLD SIDE OUTLET TEMP (ºF)": "115",
  }), "HEAT_EXCHANGER"));
  assert.deepEqual(hx, { primary_gpm: 15.8, primary_ewt_f: 130, primary_lwt_f: 100, secondary_gpm: 17, secondary_ewt_f: 85, secondary_lwt_f: 115 }); // 14_OR
  const eco = values(normalizeCompileItem(row("WSE-1", "PLATE HEAT EXCHANGER", {
    "HOT SIDE FLOW (GPM)": "400", "HOT SIDE INLET TEMP (ºF)": "58", "COLD SIDE FLOW (GPM)": "380", "COLD SIDE INLET TEMP (ºF)": "45",
  }), "HEAT_EXCHANGER"));
  assert.deepEqual([eco.primary_gpm, eco.secondary_gpm], [380, 400], "cooling duty: the cold side is the source");
  const fhx = values(normalizeCompileItem(row("FHX-1", "ECONOMIZER SCHEDULE, FLUE GAS/FEEDWATER HEAT EXCHANGERS", {
    "MIN HEAT EXCHANGED MBH": "672.94", "WATER FLOW GPM": "41.0", "DESIGN WATER TEMPERATURES DEG F IN": "210", "DESIGN WATER TEMPERATURES DEG F OUT": "242.5",
  }), "HEAT_EXCHANGER"));
  assert.deepEqual(fhx, { capacity_mbh: 672.94, secondary_gpm: 41, secondary_ewt_f: 210, secondary_lwt_f: 242.5, primary_medium: "other", secondary_medium: "other" }); // 044_NY
});

test("a duplex starter's LEAD/LAG; a trap's load (not its rated capacity); a humidifier's KW; a pump's SUCT. SIZE", () => {
  assert.equal(values(normalizeCompileItem(row("FOP-1", "FUEL OIL PUMP SCHEDULE", { STARTER: "AUTOMATIC W/LEAD LAG" }), "PUMP")).pump_arrangement, "lead_lag"); // 044_NY
  assert.equal(values(normalizeCompileItem(row("UH-3", "STEAM UNIT HEATER SCHEDULE", { "TRAP LBS/HR": "52.5" }), "UNIT_HEATER")).steam_lb_hr, 52.5);
  const hum = values(normalizeCompileItem(row("H-1", "HUMIDIFIER SCHEDULE", { "STEAM FLOW LBS/HR": "79.2", "TRAP CAPACITY LBS/HR": "80" }), "HUMIDIFIER"));
  assert.equal(hum.capacity_lb_hr ?? hum.steam_lb_hr, 79.2, "a trap's rated capacity is not the flow (031_MO)");
  assert.equal(values(normalizeCompileItem(row("H-1", "HUMIDIFIER SCHEDULE", { "POWER KW": "3" }), "HUMIDIFIER")).eh_kw, 3); // 066_MT
  assert.equal(values(normalizeCompileItem(row("P-1", "PUMP SCHEDULE", { "PIPING DATA SUCT. SIZE (IN.)": "4", "PIPING DATA DISCH. SIZE (IN.)": "3" }), "PUMP")).conn_in, 4); // 047_NC
});
