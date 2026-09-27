// ASSEMBLIES WP5.1 — the apply path (src/lib/assemblies/apply.ts): compiled
// rows → instances → records, with the attributes the project derives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, compiledRowsAndTables, continuedTitle, instancesOf, printedPointRows, servingAirHandlers, tableContextOf, type CompiledItem, type CompiledProject } from "../../src/lib/assemblies/apply.ts";
import { assembliesReport } from "../../src/lib/assemblies/report.ts";
import type { NormalizedItem } from "../../src/lib/assemblies/normalize.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies).assemblies;

const row = (family: string, tag: string, table_title: string, cells: Record<string, string> = {}, sheet_id = "set.pdf#3"): CompiledItem => ({
  family, tag, sheet_id, table_title,
  cells: Object.fromEntries(Object.entries({ MARK: tag, ...cells }).map(([h, text], i) => [h, { text, bbox: [i, 0, i + 1, 1] }])),
});
/** A row's normalized attributes, given directly (the normalizer has its own tests). */
const norm = (it: CompiledItem, values: Record<string, number | string> = {}): NormalizedItem => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value, printed: String(value), rule: "test", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k.toUpperCase(), bbox: null } }])),
});

test("terminal rows link to the air handler their cell or table title names; the tag is the evidence", () => {
  const items = [
    row("AHU", "AHU-1", "AIR HANDLING UNIT SCHEDULE"),
    row("AHU", "AHU-2", "AIR HANDLING UNIT SCHEDULE"),
    row("VAV", "VAV-1", "VAV BOX SCHEDULE", { "AHU": "AHU-1" }),
    row("VAV", "VAV-2", "VAV BOX SCHEDULE", { "SERVED BY": "AHU 1" }),
    row("VAV", "VAV-3", "VAV BOXES - AHU-2"),
    row("VAV", "VAV-4", "VAV BOX SCHEDULE", { "REMARKS": "SEE NOTE 2" }),
    row("VAV", "VAV-5", "VAV BOX SCHEDULE", { "SYSTEM": "AHU-1 / AHU-2" }),
    row("FCU", "FCU-1", "FAN COIL SCHEDULE", { "AHU": "AHU-1" }),
  ];
  const links = servingAirHandlers(items);
  assert.deepEqual(links.get(2), [0]);
  assert.deepEqual(links.get(3), [0], "AHU 1 reads as AHU-1 without its dash");
  assert.deepEqual(links.get(4), [1], "a part of the table's title");
  assert.equal(links.has(5), false, "nothing names an air handler");
  assert.deepEqual(links.get(6), [0, 1]);
  assert.equal(links.has(7), false, "only terminal families are linked");
  assert.equal(servingAirHandlers(items.filter((it) => it.family !== "AHU")).size, 0, "no air handler, no link");
  // An air handler marked "1" is not named by a terminal row's QTY cell.
  const numeric = [row("AHU", "1", "AHU SCHEDULE"), row("VAV", "VAV-9", "VAV BOX SCHEDULE", { QTY: "1" })];
  assert.equal(servingAirHandlers(numeric).size, 0);
});

test("terminals_served is derived from the links, 0 only when the terminal schedules name their air handlers", () => {
  const items = [
    row("AHU", "AHU-1", "AHU SCHEDULE"),
    row("AHU", "AHU-2", "AHU SCHEDULE"),
    row("VAV", "VAV-1", "VAV SCHEDULE", { AHU: "AHU-1" }),
    row("VAV", "VAV-2", "VAV SCHEDULE", { AHU: "AHU-1" }),
  ];
  const project: CompiledProject = { items };
  const inst = instancesOf(project, items.map((it) => norm(it)));
  assert.equal(inst[0].attributes.terminals_served.value, 2);
  assert.equal(inst[0].derived.terminals_served.rule, "derive.terminals_served");
  assert.match(inst[0].derived.terminals_served.basis, /2 terminal row\(s\) name AHU-1: VAV-1, VAV-2/);
  assert.equal(inst[1].attributes.terminals_served.value, 0);
  assert.match(inst[1].derived.terminals_served.basis, /none names AHU-2/);
  assert.equal(inst[2].scope.system, "AHU-1", "a terminal's system is the air handler that serves it");
  assert.equal(inst[0].scope.system, "AHU-1");
  assert.deepEqual(inst[0].cites, [{ sheet: "set.pdf#3", table_title: "AHU SCHEDULE", header: "MARK", bbox: [0, 0, 1, 1] }]);

  // Terminal rows that name no air handler, and two air handlers: unknown.
  const silent = [row("AHU", "AHU-1", "AHU SCHEDULE"), row("RTU", "RTU-1", "RTU SCHEDULE"), row("VAV", "VAV-1", "VAV SCHEDULE", { CFM: "400" })];
  const s = instancesOf({ items: silent }, silent.map((it) => norm(it)));
  assert.equal(s[0].attributes.terminals_served, undefined);
  assert.match(s[0].unknown.terminals_served.reason, /name no air handler, and it has more than one/);
  assert.equal(s[2].scope.system, null);

  // The project's only AHU or RTU serves terminal rows that name none.
  const sole = [row("AHU", "AHU-1", "AHU SCHEDULE"), row("DOAS", "DOAS-1", "DOAS SCHEDULE"), row("VAV", "VAV-1", "VAV SCHEDULE"), row("VAV", "VAV-2", "VAV SCHEDULE")];
  const so = instancesOf({ items: sole }, sole.map((it) => norm(it)));
  assert.equal(so[0].attributes.terminals_served.value, 2);
  assert.equal(so[0].derived.terminals_served.rule, "derive.terminals_served.sole_air_handler");
  assert.equal(so[2].scope.system, "AHU-1");
  assert.equal(so[1].attributes.terminals_served, undefined, "a dedicated outdoor air unit is not given the terminals");

  // A project that schedules no terminal unit: every air handler serves none.
  const none = [row("AHU", "AHU-1", "AHU SCHEDULE"), row("AHU", "AHU-2", "AHU SCHEDULE"), row("PUMP", "P-1", "PUMP SCHEDULE")];
  const no = instancesOf({ items: none }, none.map((it) => norm(it)));
  assert.equal(no[0].attributes.terminals_served.value, 0);
  assert.equal(no[1].derived.terminals_served.rule, "derive.terminals_served.none_scheduled");
  assert.equal(no[2].attributes.terminals_served, undefined, "only air handlers get the count");

  // Duct-mounted reheat coils but no terminal schedule: the terminals are not known.
  const coils = [row("AHU", "AHU-1", "AHU SCHEDULE"), row("DUCT_MOUNTED_COIL", "RHC-1", "REHEAT COIL SCHEDULE")];
  const co = instancesOf({ items: coils }, coils.map((it) => norm(it)));
  assert.equal(co[0].attributes.terminals_served, undefined);
  assert.match(co[0].unknown.terminals_served.reason, /duct-mounted coils but no terminal unit/);
});

// 18_OR's sheet M5.1 (an unseen document): "AHU-3, HP-3" on one row of the AIR
// HANDLER HEAT PUMP SCHEDULE, the heat pump's columns grouped HEAT PUMP
// OUTDOOR UNIT. The heat pump took the heat-pump typical (a unit controller,
// a zone sensor, a fan command) beside the air handler's own.
test("the family the library applies: a heat pump on one row with its air handler is the split system's outdoor unit", () => {
  const title = "AIR HANDLER HEAT PUMP SCHEDULE (WITH ELECTRIC HEAT)";
  const cells = {
    "AREA SERVED": "GYM", "AIR HANDLER INDOOR UNIT SUPPLY FAN CFM": "10,000", "AIR HANDLER INDOOR UNIT ELECTRIC HEAT KW": "90",
    "HEAT PUMP OUTDOOR UNIT COOLING CAPACITY 95° OSA, 80° EDB, 62° EWB TOTAL MBH": "274", "HEAT PUMP OUTDOOR UNIT ELECTRICAL FOR HEAT PUMP V/Ø": "460/3",
  };
  const items = [row("AHU", "AHU-3", title, cells), row("HEAT_PUMP", "HP-3", title, cells), row("HEAT_PUMP", "HP-9", "HEAT PUMP SCHEDULE", { "SUPPLY FAN CFM": "1,200" })];
  const tables = [
    { sheet: "set.pdf#3", title, headers: ["SYMBOL", ...Object.keys(cells)], rows: [{ key: "AHU-3HP-3", cells: { SYMBOL: "AHU-3, HP-3", ...cells } }] },
    { sheet: "set.pdf#3", title: "HEAT PUMP SCHEDULE", headers: ["MARK", "SUPPLY FAN CFM"], rows: [{ key: "HP-9", cells: { MARK: "HP-9", "SUPPLY FAN CFM": "1,200" } }] },
  ];
  const { instances, applications } = applyAssemblies({ project: { items, tables }, library: LIB });
  assert.deepEqual(instances.map((i) => i.family), ["AHU", "CONDENSING_UNIT", "HEAT_PUMP"]);
  assert.equal(instances[1].compiled_family, "HEAT_PUMP");
  assert.equal(instances[1].derived.family.rule, "derive.family.split_outdoor");
  assert.match(instances[1].derived.family.basis, /its row schedules AHU-3 beside it/);
  const byTag = new Map(applications.filter((a) => a.layer === "controls").map((a) => [a.instance.tag, a]));
  assert.equal(byTag.get("HP-3")!.status, "no_assembly", "the air handler's typical carries the system's points");
  assert.equal(byTag.get("HP-9")!.assembly!.id, "heat-pump", "a packaged heat pump keeps its typical");
  assert.notEqual(byTag.get("AHU-3")!.status, "no_assembly");
});

// 14_OR's sheet M003 (dev 2): SPLIT SYSTEM HEAT PUMPS lists each half on a row
// of its own, HP-01 then FC-01; the key reads HP-01 and HP-02 as the outdoor
// units. The heat pump's row prints "CFM -", the fan coil's "389".
test("the family the library applies: a heat pump that moves no air in a split system table is its indoor units' outdoor unit", () => {
  const title = "SPLIT SYSTEM HEAT PUMPS";
  const hp = { SERVING: "MDF", "COOL MBH TC": "30", CFM: "-", "ELECTRICAL DATA V/PH": "208/1" };
  const fc = { SERVING: "MDF", "COOL MBH TC": "30", CFM: "389", "ELECTRICAL DATA V/PH": "-" };
  const project = (t: string, hpCells: Record<string, string>) => ({
    items: [row("HEAT_PUMP", "HP-01", t, hpCells), row("FCU", "FC-01", t, fc)],
    tables: [{ sheet: "set.pdf#3", title: t, headers: ["MARK", ...Object.keys(hp)], rows: [{ key: "HP-01", cells: { MARK: "HP-01", ...hpCells } }, { key: "FC-01", cells: { MARK: "FC-01", ...fc } }] }],
  });
  const split = applyAssemblies({ project: project(title, hp), library: LIB });
  assert.deepEqual(split.instances.map((i) => i.family), ["CONDENSING_UNIT", "FCU"]);
  assert.match(split.instances[0].derived.family.basis, /lists indoor units on rows of their own \(FC-01\)/);
  assert.equal(split.applications.find((a) => a.layer === "controls" && a.instance.tag === "HP-01")!.status, "no_assembly");
  // Negative controls: a table that is no split system's, and a heat pump row
  // that prints its own airflow, keep the heat pump and its typical.
  assert.equal(applyAssemblies({ project: project("HEAT PUMP AND FAN COIL SCHEDULE", hp), library: LIB }).instances[0].family, "HEAT_PUMP");
  const own = applyAssemblies({ project: project(title, { ...hp, CFM: "800" }), library: LIB });
  assert.equal(own.instances[0].family, "HEAT_PUMP");
  assert.equal(own.applications.find((a) => a.layer === "controls" && a.instance.tag === "HP-01")!.assembly!.id, "heat-pump");
});

test("the family the library applies: a 100% outdoor-air air handler is a DOAS, a gas-fired fan coil a furnace", () => {
  const items = [
    row("AHU", "AHU-7", "AIR HANDLING UNIT SCHEDULE"),
    row("RTU", "RTU-1", "RTU SCHEDULE"),
    row("AHU", "AHU-1", "AIR HANDLING UNIT SCHEDULE"),
    row("AHU", "AHU-2", "AIR HANDLING UNIT SCHEDULE"),
    row("FCU", "F-1", "SPLIT SYSTEM SCHEDULE"),
    row("FCU", "FCU-1", "FAN COIL SCHEDULE"),
  ];
  const inst = instancesOf({ items }, [
    norm(items[0], { supply_cfm: 9770, oa_cfm_min: 9770 }),
    norm(items[1], { outdoor_air_pct: 100 }),
    norm(items[2], { supply_cfm: 13000, oa_cfm_min: 3950 }),
    norm(items[3], { supply_cfm: 5000 }),
    norm(items[4], { heating_type: "gas" }),
    norm(items[5], { heating_type: "hw" }),
  ]);
  assert.deepEqual(inst.map((i) => i.family), ["DOAS", "DOAS", "AHU", "AHU", "FURNACE", "FCU"]);
  assert.equal(inst[0].derived.family.rule, "derive.family.outdoor_air_cfm");
  assert.match(inst[0].derived.family.basis, /9770 cfm of 9770 cfm supply/);
  assert.equal(inst[1].derived.family.rule, "derive.family.outdoor_air_pct");
  assert.equal(inst[4].derived.family.rule, "derive.family.gas_heat");
  assert.equal(inst[3].derived.family, undefined, "no outdoor airflow printed: its schedule's family");
  const { applications } = applyAssemblies({ project: { items }, library: LIB, normalized: [
    norm(items[0], { supply_cfm: 9770, oa_cfm_min: 9770, energy_recovery: "none" }), norm(items[1], { outdoor_air_pct: 100 }),
    norm(items[2]), norm(items[3]), norm(items[4], { heating_type: "gas" }), norm(items[5]),
  ] });
  const byTag = new Map(applications.filter((a) => a.layer === "controls").map((a) => [a.instance.tag, a]));
  assert.equal(byTag.get("AHU-7")!.assembly!.id, "doas");
  assert.equal(byTag.get("AHU-7")!.instance.family, "DOAS");
  assert.equal(byTag.get("F-1")!.assembly!.id, "split-dx-indoor");
});

test("a printed hardwired interface is not a network interface (chiller, boiler, RTU)", () => {
  const items = [row("AIR_COOLED_CHILLER", "CH-1", "CHILLER SCHEDULE"), row("AIR_COOLED_CHILLER", "CH-2", "CHILLER SCHEDULE"), row("BOILER", "B-1", "BOILER SCHEDULE"), row("RTU", "RTU-1", "RTU SCHEDULE")];
  const { applications } = applyAssemblies({ project: { items }, library: LIB, normalized: [
    norm(items[0], { bas_interface: "HARDWIRE" }), norm(items[1], { bas_interface: "BACNET" }), norm(items[2], { bas_interface: "HARDWIRE" }), norm(items[3], { bas_interface: "HARDWIRE", vfd: "no" }),
  ] });
  const byTag = new Map(applications.filter((a) => a.layer === "controls").map((a) => [a.instance.tag, a]));
  assert.equal(byTag.get("CH-1")!.options.network_interface.value, false);
  assert.equal(byTag.get("CH-2")!.options.network_interface.value, true);
  assert.equal(byTag.get("B-1")!.options.network_interface.value, false);
  assert.notEqual(byTag.get("RTU-1")!.assembly?.id, "rtu-networked");
});

test("a printed QTY is the multiplier; otherwise one unit per tag", () => {
  const items = [row("PUMP", "P-1", "PUMP SCHEDULE"), row("PUMP", "P-2", "PUMP SCHEDULE"), row("PUMP", "P-3", "PUMP SCHEDULE")];
  const inst = instancesOf({ items }, [norm(items[0], { qty: 2 }), norm(items[1], { qty: 1.5 }), norm(items[2])]);
  assert.deepEqual(inst[0].multiplier, { value: 2, basis: 'QTY "2" (QTY)' });
  assert.deepEqual(inst[1].multiplier, { value: 1, basis: "one unit per tag" });
  assert.deepEqual(inst[2].multiplier, { value: 1, basis: "one unit per tag" });
});

test("applied: the derived count chooses between the VAV and single-zone air handler typicals, or leaves it unresolved", () => {
  const items = [
    row("AHU", "AHU-1", "AHU SCHEDULE"),
    row("AHU", "AHU-2", "AHU SCHEDULE"),
    row("VAV", "VAV-1", "VAV SCHEDULE", { AHU: "AHU-1" }),
  ];
  const normalized = [norm(items[0], { vfd: "yes" }), norm(items[1], { vfd: "yes" }), norm(items[2], { heat_type: "hw" })];
  const { applications } = applyAssemblies({ project: { items }, library: LIB, normalized });
  const byTag = new Map(applications.filter((a) => a.layer === "controls").map((a) => [a.instance.tag, a]));
  assert.equal(byTag.get("AHU-1")!.assembly!.id, "ahu-multizone-vav");
  assert.equal(byTag.get("AHU-2")!.assembly!.id, "ahu-single-zone");
  assert.equal(byTag.get("VAV-1")!.assembly!.id, "vav-reheat-hw");

  // No terminal unit in the project: a VFD air handler is single-zone.
  const alone = [row("AHU", "AHU-1", "AHU SCHEDULE")];
  const r = applyAssemblies({ project: { items: alone }, library: LIB, normalized: [norm(alone[0], { vfd: "yes", cooling_type: "chw" })] });
  const one = r.applications.find((a) => a.layer === "controls")!;
  assert.equal(one.assembly!.id, "ahu-single-zone");
  assert.equal(one.status, "ok");

  // Terminals no row attributes, two air handlers: unresolved, and it says why.
  const two = [row("AHU", "AHU-1", "AHU SCHEDULE"), row("AHU", "AHU-2", "AHU SCHEDULE"), row("VAV", "VAV-1", "VAV SCHEDULE")];
  const r2 = applyAssemblies({ project: { items: two }, library: LIB, normalized: [norm(two[0], { vfd: "yes" }), norm(two[1], { vfd: "yes" }), norm(two[2], { heat_type: "hw" })] });
  const app = r2.applications.find((a) => a.layer === "controls" && a.instance.tag === "AHU-1")!;
  assert.equal(app.status, "unresolved");
  assert.ok(app.unresolved.missing.includes("attr.terminals_served"), app.unresolved.missing.join(", "));
  assert.deepEqual(app.unresolved.candidates.sort(), ["ahu-multizone-vav@1", "ahu-single-zone@1"]);
});

test("the table context is read once per table and joins every part the compile gave the same title", () => {
  const tables = [
    { sheet: "s#1", title: "FAN SCHEDULE", headers: ["MARK", "CFM"], notes: [{ id: "1", text: "PROVIDE WITH VFD." }] },
    { sheet: "s#1", title: "FAN SCHEDULE", headers: ["MARK", "HP"], rows: [{ key: "EF-1", cells: { HP: "1" } }] },
    { sheet: "s#2", title: "FAN SCHEDULE", headers: ["X"] },
  ];
  const ctx = tableContextOf({ sheet_id: "s#1", table_title: "FAN SCHEDULE" }, tables);
  assert.deepEqual(ctx?.headers, ["MARK", "CFM", "HP"]);
  assert.deepEqual(ctx?.notes, [{ id: "1", text: "PROVIDE WITH VFD." }]);
  assert.equal(ctx?.rows?.length, 1);
  assert.equal(tableContextOf({ sheet_id: "s#9", table_title: "FAN SCHEDULE" }, tables), null);
});

test("dev 5: a schedule continued in a second table (\"… (CONT.)\") is kept for the unit rows it continues", () => {
  // 061_IA page 58: the compile claims CUSTOM OUTDOOR AIR HANDLING UNIT
  // SCHEDULE; AHU-A's supply fan and final filter print in CUSTOM AIR
  // HANDLING UNIT SCHEDULE (CONT.) below it, which it does not claim.
  const cells = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).map(([h, text]) => [h, { text }]));
  const graph = { tables: [
    { sheet: "s#58", title: { text: "CUSTOM OUTDOOR AIR HANDLING UNIT SCHEDULE" }, headers: ["DESIGNATION", "RETURN FAN VOLTS/Ø"], region: [0, 0, 100, 40] as [number, number, number, number],
      rows: [{ key: "AHU-A", cells: cells({ DESIGNATION: "AHU-A", "RETURN FAN VOLTS/Ø": "460/3" }) }] },
    { sheet: "s#58", title: { text: "CUSTOM AIR HANDLING UNIT SCHEDULE (CONT.)" }, headers: ["DESIGNATION", "SUPPLY FAN VOLTS/Ø"], region: [0, 50, 60, 90] as [number, number, number, number],
      rows: [{ key: "AHU-A", cells: cells({ DESIGNATION: "AHU-A", "SUPPLY FAN VOLTS/Ø": "480/3" }) }] },
    // Not a continuation: its row is no row of the claimed table, or its title shares no words.
    { sheet: "s#58", title: { text: "HUMIDIFIER SCHEDULE (CONT.)" }, headers: ["TAG"], rows: [{ key: "AHU-A", cells: cells({ TAG: "AHU-A" }) }] },
    { sheet: "s#58", title: { text: "AIR HANDLING UNIT SCHEDULE (CONTINUED)" }, headers: ["TAG"], rows: [{ key: "AHU-B", cells: cells({ TAG: "AHU-B" }) }] },
    { sheet: "s#59", title: { text: "AIR HANDLING UNIT SCHEDULE (CONT.)" }, headers: ["TAG"], rows: [{ key: "AHU-A", cells: cells({ TAG: "AHU-A" }) }] },
  ] };
  const compiled = { categories: { AHU: { items: [{ tag: "AHU-A", sheet_id: "s#58", table_title: "CUSTOM OUTDOOR AIR HANDLING UNIT SCHEDULE", cells: { "RETURN FAN VOLTS/Ø": { text: "460/3", bbox: null } } }] } } };
  const { tables } = compiledRowsAndTables(compiled, graph);
  assert.deepEqual(tables.map((t) => [t.title, t.continues ?? null]), [
    ["CUSTOM OUTDOOR AIR HANDLING UNIT SCHEDULE", null],
    ["CUSTOM AIR HANDLING UNIT SCHEDULE (CONT.)", "CUSTOM OUTDOOR AIR HANDLING UNIT SCHEDULE"],
  ]);
  const ctx = tableContextOf({ sheet_id: "s#58", table_title: "CUSTOM OUTDOOR AIR HANDLING UNIT SCHEDULE" }, tables);
  assert.equal(ctx?.continuation?.[0]?.title, "CUSTOM AIR HANDLING UNIT SCHEDULE (CONT.)");
  assert.deepEqual(ctx?.headers, ["DESIGNATION", "RETURN FAN VOLTS/Ø"], "the continuation's headers are its own");
  for (const [title, base] of [["AHU SCHEDULE (CONT.)", "AHU SCHEDULE"], ["FAN SCHEDULE CONT'D", "FAN SCHEDULE"], ["PUMP SCHEDULE - CONTINUED", "PUMP SCHEDULE"], ["PUMP SCHEDULE", null], ["CONTROL SCHEDULE", null]] as const) {
    assert.equal(continuedTitle(title), base, title);
  }
});

test("D6: a printed points list the BAS points compile maps to a unit replaces its typical's point lines, and the report says so", () => {
  const bas = { categories: { points_lists: { lists: [
    { title: "AHU-1 DDC POINTS LIST", sheet_id: "set.pdf#7", items: [
      { tag: "AI01", point_type: "AI", description: "SUPPLY AIR TEMPERATURE", bbox_px: [1, 2, 3, 4], served_equipment: "AHU-1" },
      { tag: "BO01", point_type: "BO", description: "SUPPLY FAN START/STOP", bbox_px: null, served_equipment: "AHU 1" },
      { tag: "X1", point_type: null, description: "NOTE", served_equipment: null },
      // A numbered list: the compile reads the row's own number as what it serves.
      { tag: "7", point_type: "AI", description: null, served_equipment: "7" },
    ] },
  ] } } };
  const rows = printedPointRows(bas);
  assert.equal(rows.length, 2, "a row that serves no unit cannot replace anything; a mark with no letter is a row number, not a unit");
  assert.deepEqual(rows[0], { unit: "AHU-1", list_title: "AHU-1 DDC POINTS LIST", sheet_id: "set.pdf#7", point: "AI01", io: "AI", description: "SUPPLY AIR TEMPERATURE", bbox: [1, 2, 3, 4] });
  const items = [row("AHU", "AHU-1", "AHU SCHEDULE"), row("AHU", "AHU-2", "AHU SCHEDULE")];
  const normalized = [norm(items[0], { vfd: "no", cooling_type: "chw" }), norm(items[1], { vfd: "no", cooling_type: "chw" })];
  const { instances, applications, lines } = applyAssemblies({ project: { items, printed_points: rows }, library: LIB, normalized });
  assert.equal(instances[0].printed_points.length, 2, "matched by the tag in one spelling (AHU 1 = AHU-1)");
  assert.equal(instances[1].printed_points.length, 0);
  const points1 = lines.filter((l) => l.tag === "AHU-1" && l.layer === "controls" && l.kind === "point");
  const points2 = lines.filter((l) => l.tag === "AHU-2" && l.layer === "controls" && l.kind === "point");
  assert.ok(points1.length > 0 && points1.every((l) => l.status === "replaced"), "the printed list stands instead of the typical's points");
  assert.ok(points2.every((l) => l.status !== "replaced"), "a unit without a printed list keeps them");
  assert.ok(lines.filter((l) => l.tag === "AHU-1" && l.kind === "device").some((l) => l.status !== "replaced"), "devices are not points");
  const r = assembliesReport(instances, applications, lines);
  const u = r.units.find((x) => x.tag === "AHU-1" && x.layer === "controls")!;
  assert.deepEqual(u.printed_points, { rows: 2, by_io: { AI: 1, AO: 0, BI: 0, BO: 1, other: 0 }, lists: ["set.pdf#7 · AHU-1 DDC POINTS LIST"] });
  assert.equal(r.units.find((x) => x.tag === "AHU-2" && x.layer === "controls")!.printed_points, null);
});

test("D6: a printed unit matches in a looser spelling (no dashes or spaces) only when one scheduled unit reads that way; dots count (VAV-1.11 ≠ VAV-11.1)", () => {
  const rows = printedPointRows({ categories: { points_lists: { lists: [
    { title: "VAV POINTS LIST", sheet_id: "set.pdf#8", items: [
      { tag: "AI01", point_type: "AI", description: "SPACE TEMPERATURE", served_equipment: "VAV-11.1" },
      { tag: "AI01", point_type: "AI", description: "SPACE TEMPERATURE", served_equipment: "VAV 2.1" },
      { tag: "AI01", point_type: "AI", description: "SPACE TEMPERATURE", served_equipment: "FCU3" },
      { tag: "AI01", point_type: "AI", description: "SPACE TEMPERATURE", served_equipment: "FCU 4" },
    ] },
  ] } } });
  const items = [
    row("VAV", "VAV-1.11", "VAV SCHEDULE"), row("VAV", "VAV-11.1", "VAV SCHEDULE"), row("VAV", "VAV-2.1", "VAV SCHEDULE"), row("VAV", "VAV-21", "VAV SCHEDULE"),
    row("FCU", "FCU-3", "FCU SCHEDULE"), row("FCU", "FCU-4", "FCU SCHEDULE"), row("FCU", "FCU4", "FCU SCHEDULE"),
  ];
  const inst = instancesOf({ items, printed_points: rows }, items.map((it) => norm(it, {})));
  assert.deepEqual(Object.fromEntries(inst.map((i) => [i.tag, i.printed_points.length])), {
    "VAV-1.11": 0, "VAV-11.1": 1, "VAV-2.1": 1, "VAV-21": 0,
    "FCU-3": 1,
    // Two scheduled units read "FCU4" without the dash: the list's "FCU 4" names neither of them.
    "FCU-4": 0, "FCU4": 0,
  });
});
