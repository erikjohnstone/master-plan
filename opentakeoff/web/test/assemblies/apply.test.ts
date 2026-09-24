// ASSEMBLIES WP5.1 — the apply path (src/lib/assemblies/apply.ts): compiled
// rows → instances → records, with the attributes the project derives.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, instancesOf, servingAirHandlers, tableContextOf, type CompiledItem, type CompiledProject } from "../../src/lib/assemblies/apply.ts";
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
