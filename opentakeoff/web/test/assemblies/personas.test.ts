// ASSEMBLIES WP8.2 — scripted persona scenarios (goals/ASSEMBLIES.md WP8.2), deterministic:
//   (a) a BAS integrator clones the starter, edits the VAV typical, adds part numbers, a unit
//       cost and labor hours to their copy, applies, and exports points, the Desigo worksheet
//       and HIT; the partner's figures come back extended and labelled (WP9);
//   (b) a mechanical contractor filters to the mechanical scope, sets a hook-up profile
//       (kits at 1 in. and below, no hoses, manual balancing) and the "valve shipped to kit
//       maker" responsibility preset, and exports hook-up lines with size and end type,
//       valves.csv and HIT;
//   (c) a distributor takes the device CSVs only.
// Every step is the shared path the Takeoff panel and apply_assemblies run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, type CompiledItem } from "../../src/lib/assemblies/apply.ts";
import { assembliesCsvSet } from "../../src/lib/assemblies/exportSet.ts";
import { importLibraryCsv, libraryToCsv } from "../../src/lib/assemblies/libraryCsv.ts";
import { cloneForEdit, combinedLibrary } from "../../src/lib/assemblies/libraryEdit.ts";
import type { NormalizedItem } from "../../src/lib/assemblies/normalize.ts";
import { hookupProfileDefaults, withResponsibilityPreset } from "../../src/lib/assemblies/presets.ts";
import { projectLibrary } from "../../src/lib/assemblies/projectState.ts";
import { assembliesReport } from "../../src/lib/assemblies/report.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { buildValveSizeExport } from "../../src/lib/valveSizeExport.ts";
import { valveSizeTemplateFiles } from "../../src/lib/valveSizeTemplate.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const STARTER = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;
const TEMPLATE = new Uint8Array(readFileSync(join(STARTER_DIR, "../../../../public/templates/Valve_Size_Template_US_Global.xlsx")));

function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; } else cell += ch;
  }
  const [head, ...rest] = rows;
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// A small project: two VAV boxes with hot-water reheat on AHU-1, a four-pipe fan coil, the AHU
// (2 1/2 in. chilled- and 1 1/2 in. hot-water coil connections), a pump.
const item = (family: string, tag: string, i: number, extra: Record<string, string> = {}): CompiledItem => ({
  family, tag, sheet_id: "m.pdf#4", table_title: `${family} SCHEDULE`,
  cells: { MARK: { text: tag, bbox: [i, 0, i + 1, 1] }, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, { text: v, bbox: null }])) },
});
const norm = (it: CompiledItem, values: Record<string, string | number>): NormalizedItem => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, printed: String(v), rule: "t", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k, bbox: null } }])),
});
const items = [
  item("VAV", "VAV-1", 0, { "AIR HANDLER": "AHU-1" }), item("VAV", "VAV-2", 1, { "AIR HANDLER": "AHU-1" }),
  item("FCU", "FCU-1", 2), item("AHU", "AHU-1", 3), item("PUMP", "P-1", 4),
];
const normalized = [
  norm(items[0], { heat_type: "hw", hw_gpm: 1.5, hw_conn_in: 0.5 }),
  norm(items[1], { heat_type: "hw", hw_gpm: 2, hw_conn_in: 0.75 }),
  norm(items[2], { ecm: "yes", cooling_type: "chw", heating_type: "hw", chw_gpm: 4, chw_wpd_ft: 8, chw_conn_in: 0.75, hw_gpm: 2, hw_wpd_ft: 5, hw_conn_in: 0.75 }),
  norm(items[3], { vfd: "yes", cooling_type: "chw", heating_type: "hw", supply_cfm: 6000, oa_cfm_min: 1200, chw_gpm: 30, chw_conn_in: 2.5, hw_gpm: 12, hw_conn_in: 1.5 }),
  norm(items[4], { vfd: "yes", motor_hp: 5 }),
];
const project = { items };
// A control-valve compile, as compile_corpus_takeoff kind control_valves gives it (the HIT export's input).
const valveCompile = { categories: { HHW_CONTROL_VALVE: { items: [
  { tag: "CV-1", sheet_id: "m.pdf#5", table_title: "CONTROL VALVE SCHEDULE", cells: { "Unit Mark": { text: "FCU-1" }, Service: { text: "HHW" }, GPM: { text: "2" }, Cv: { text: "1.6" }, Size: { text: "3/4\"" }, Configuration: { text: "2-WAY" }, "Fail position": { text: "NC" }, "Control signal": { text: "0-10 VDC" } } },
] } } };

test("(a) BAS integrator: a cloned VAV typical with part numbers and hours, applied and exported (points, Desigo worksheet, HIT)", async () => {
  // Clone the starter's VAV typical: CO2 sensors on by default, and the partner's own part number and hours on the controller.
  const vav = STARTER.find((a) => a.id === "vav-reheat-hw")!;
  const mine = cloneForEdit(vav, STARTER);
  mine.options = mine.options.map((o) => (o.id === "co2_sensor" ? { ...o, default: true } : o));
  mine.lines = mine.lines.map((l) => (l.role.id === "terminal-unit-controller" ? { ...l, partner: { part_no: "INT-VAV-100", unit_cost: 420, hours: 1.5, labor_category: "controls technician" } } : l));
  // The copy travels as the partner's library CSV and comes back through the gate.
  const imported = importLibraryCsv(libraryToCsv([mine]), STARTER, []);
  assert.deepEqual(imported.errors, []);
  const { library } = combinedLibrary(STARTER, imported.partner);
  const applied = applyAssemblies({ project, library: projectLibrary(null, library), normalized });
  const vavRecords = applied.applications.filter((a) => a.instance.family === "VAV" && a.layer === "controls");
  assert.ok(vavRecords.every((a) => a.assembly?.id === "vav-reheat-hw" && a.assembly.version === mine.version), "the partner's version is the latest");
  assert.ok(vavRecords.every((a) => a.options.co2_sensor.value === true && a.options.co2_sensor.source === "partner_default"));
  const report = assembliesReport(applied.instances, applied.applications, applied.lines);
  const set = assembliesCsvSet({ ...applied, report });
  // The partner's fields reach lines.csv, extended and labelled, and only on the partner's lines.
  const lines = parseCsv(set["lines.csv"]);
  const ctl = lines.filter((r) => r.role === "terminal-unit-controller" && r.unit_tag.startsWith("VAV"));
  assert.equal(ctl.length, 2);
  assert.ok(ctl.every((r) => r.part_no === "INT-VAV-100" && r.unit_cost === "420" && r.hours === "1.5" && r.labor_category === "controls technician"
    && r.partner_fields === "partner-entered" && r.extended_cost === "420" && r.extended_hours === "1.5"), JSON.stringify(ctl[0]));
  assert.ok(lines.filter((r) => r.role !== "terminal-unit-controller").every((r) => r.part_no === "" && r.hours === "" && r.partner_fields === "" && r.extended_cost === ""));
  // The report (and so its PDF section) sums them by labor category.
  assert.deepEqual(report.partner, { label: "partner-entered", lines: 2, extended_cost: 840, costed_lines: 2, hours: [{ labor_category: "controls technician", extended_hours: 3, lines: 2 }], not_extended: 0 });
  // Points: the CO2 point is in each VAV's list.
  const points = parseCsv(set["points.csv"]).filter((r) => r.unit_tag === "VAV-1");
  assert.ok(points.some((r) => /co2/i.test(r.function)), JSON.stringify(points.map((r) => r.function)));
  // The Desigo worksheet counts the two boxes under the partner's typical.
  const ds = parseCsv(set["desigo_select_worksheet.csv"]).find((r) => r.section === "room_automation" && r.family === "VAV")!;
  assert.deepEqual([ds.group, ds.units], [`vav-reheat-hw@${mine.version}`, "2"]);
  // HIT from the project's control-valve compile.
  const hit = buildValveSizeExport(valveCompile);
  const files = await valveSizeTemplateFiles(TEMPLATE, hit.rows);
  assert.deepEqual([files.length, hit.rows[0].system, hit.rows[0].positioningSignal], [1, "SHHW", "0...10 Vdc"]);
});

test("(b) mechanical contractor: the mechanical scope, a hook-up profile and the kit-maker preset; hook-up lines with size and end type, valves.csv, HIT", async () => {
  const defaults = hookupProfileDefaults();
  const settings = withResponsibilityPreset({
    profile: { ...defaults.profile, hoses_at_terminal_coils: false },
    variables: { ...defaults.variables, kit_max_in: 1, balancing: "manual" },
  }, "valve-shipped-to-kit-maker");
  const applied = applyAssemblies({ project, library: STARTER, normalized, settings });
  const report = assembliesReport(applied.instances, applied.applications, applied.lines);
  const set = assembliesCsvSet({ ...applied, report, scope: "mechanical" });
  const lines = parseCsv(set["lines.csv"]);
  assert.ok(lines.length > 0);
  assert.ok(lines.length < applied.lines.length, "the scope leaves other parties' lines out");
  // Every row is in the mechanical contractor's scope.
  const acts = ["furnish", "install", "wire_lv", "power", "program", "test"];
  assert.ok(lines.every((r) => r.trade === "mechanical" || acts.some((a) => r[a] === "mechanical")), "only the mechanical scope");
  // Hook-up lines carry the size from the schedule's connection sizes and an end type the
  // selection decides: a kit at each coil of 1 in. and below, loose valves above it, with
  // unions below 2 in. and flanges at and above.
  const hook = lines.filter((r) => r.layer === "hookup" && r.kind === "component");
  const kits = hook.filter((r) => r.role === "coil-kit");
  assert.equal(kits.length, 4, "a kit per coil: two VAV reheat coils and the fan coil's two");
  assert.ok(kits.every((r) => r.size_in_source === "schedule" && Number(r.size_in) <= 1 && r.end_type_source === "selection"));
  const kitUnits = new Set(kits.map((r) => r.unit_tag));
  assert.ok(!hook.some((r) => r.role === "isolation-valve" && kitUnits.has(r.unit_tag)), "a kit replaces the loose valves at 1 in. and below");
  const ahu = hook.filter((r) => r.unit_tag === "AHU-1" && r.role === "isolation-valve");
  assert.deepEqual(ahu.map((r) => [r.size_in, r.size_in_source, r.end_type_source]).sort(), [["1.5", "schedule", "selection"], ["2.5", "schedule", "selection"]]);
  assert.ok(hook.some((r) => r.unit_tag === "AHU-1" && r.role === "flange-set" && r.size_in === "2.5"));
  assert.ok(hook.some((r) => r.unit_tag === "AHU-1" && r.role === "union" && r.size_in === "1.5"));
  // No hoses (the profile switch is off).
  assert.ok(!lines.some((r) => r.role === "hose"));
  // The device schedules stay whole, with who does what: under the preset the kit maker
  // installs the coil valves the controls contractor furnishes.
  const valves = parseCsv(set["valves.csv"]);
  assert.ok(valves.length > 0 && valves.every((r) => r.furnish === "controls" && r.install === "factory"), JSON.stringify(valves.map((r) => [r.furnish, r.install])));
  const hit = buildValveSizeExport(valveCompile);
  assert.equal((await valveSizeTemplateFiles(TEMPLATE, hit.rows)).length, 1);
});

test("(c) distributor: the device CSVs alone, with their selection fields and nothing priced", () => {
  const applied = applyAssemblies({ project, library: STARTER, normalized });
  const set = assembliesCsvSet({ ...applied, report: assembliesReport(applied.instances, applied.applications, applied.lines) });
  const devices = ["valves.csv", "damper_actuators.csv", "sensors.csv"] as const;
  for (const f of devices) {
    const rows = parseCsv(set[f]);
    assert.ok(rows.length > 0, `${f} has rows`);
    assert.ok(rows.every((r) => r.part_no === "" && r.unit_cost === "" && r.hours === ""), `${f}: nothing priced`);
  }
  const sensors = parseCsv(set["sensors.csv"]);
  assert.ok(sensors.every((r) => r.variable && r.range_source === "selection"));
});
