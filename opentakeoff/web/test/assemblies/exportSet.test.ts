// ASSEMBLIES WP7.1 — the CSV set (src/lib/assemblies/exportSet.ts), instrument 5's schema
// checks: every file has its documented columns and only those, every row is whole, every
// `*_source` is in the closed vocabulary, numbers are numbers; and what the files say about
// a small project.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, type CompiledItem, type PrintedPointRow } from "../../src/lib/assemblies/apply.ts";
import { COLUMNS, EXPORT_SOURCES, assembliesCsvSet, inScope, type ExportFile } from "../../src/lib/assemblies/exportSet.ts";
import { LIBRARY_CSV_COLUMNS } from "../../src/lib/assemblies/libraryCsv.ts";
import type { NormalizedItem } from "../../src/lib/assemblies/normalize.ts";
import { assembliesReport } from "../../src/lib/assemblies/report.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;

/** RFC 4180: quoted cells, doubled quotes, CRLF rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; } else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const records = (text: string) => {
  const [head, ...rest] = parseCsv(text);
  return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
};

const item = (family: string, tag: string, i: number): CompiledItem => ({
  family, tag, sheet_id: "m.pdf#3", table_title: `${family} SCHEDULE`, cells: { MARK: { text: tag, bbox: [i, 10, i + 1, 11] } },
});
const norm = (it: CompiledItem, values: Record<string, string | number>): NormalizedItem => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { value: v, printed: String(v), rule: "t", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k, bbox: null } }])),
});
const items = [item("FCU", "FCU-1", 0), item("PUMP", "P-1", 1), item("PUMP", "P-3", 2), item("AHU", "AHU-1", 3)];
const normalized = [
  norm(items[0], { ecm: "yes", cooling_type: "chw", heating_type: "hw", chw_gpm: 4.5, chw_wpd_ft: 8, chw_conn_in: 0.75, hw_gpm: 2 }),
  norm(items[1], { vfd: "yes", motor_hp: 5 }),
  norm(items[2], {}),
  norm(items[3], { vfd: "yes", cooling_type: "chw", heating_type: "hw" }),
];
const printed: PrintedPointRow[] = [
  { unit: "AHU-1", list_title: "AHU-1 POINTS LIST", sheet_id: "c.pdf#7", point: "AI-1", io: "AI", description: "SUPPLY AIR TEMP", bbox: [1, 2, 3, 4] },
  { unit: "AHU-1", list_title: "AHU-1 POINTS LIST", sheet_id: "c.pdf#7", point: "BO-1", io: "BO", description: "FAN START/STOP", bbox: null },
];
const applied = applyAssemblies({ project: { items, printed_points: printed }, library: LIB, normalized });
const report = assembliesReport(applied.instances, applied.applications, applied.lines);
const set = assembliesCsvSet({ ...applied, report });

test("schema: every file has its documented columns, whole rows, closed-vocabulary sources", () => {
  assert.deepEqual(Object.keys(set).sort(), Object.keys(COLUMNS).sort());
  for (const [file, text] of Object.entries(set) as [ExportFile, string][]) {
    assert.ok(text.endsWith("\r\n"), `${file} ends its last row`);
    const rows = parseCsv(text);
    assert.deepEqual(rows[0], [...COLUMNS[file]], `${file} header`);
    assert.equal(new Set(rows[0]).size, rows[0].length, `${file}: no duplicate column`);
    for (const r of rows.slice(1)) assert.equal(r.length, rows[0].length, `${file}: a whole row`);
    for (const rec of records(text)) {
      for (const [k, v] of Object.entries(rec)) {
        if (k.endsWith("_source")) assert.ok((EXPORT_SOURCES as readonly string[]).includes(v), `${file} ${k}=${v}`);
        if (/^(qty|qty_with_waste|qty_order|multiplier|flow_gpm|coil_dp_psi|line_size_in|AI|AO|BI|BO)$/.test(k) && v !== "") assert.ok(Number.isFinite(Number(v)), `${file} ${k}=${v} is a number`);
      }
    }
  }
  assert.ok(records(set["lines.csv"]).length === applied.lines.length, "a row per expanded line");
  assert.ok(records(set["equipment.csv"]).length === applied.applications.length, "a row per record");
});

test("valves: schedule values with their source, the coil's pressure drop derived, selection fields left blank on purpose", () => {
  const v = records(set["valves.csv"]).filter((r) => r.unit_tag === "FCU-1");
  const chw = v.find((r) => r.service === "chw")!;
  assert.equal(chw.flow_gpm, "4.5");
  assert.equal(chw.flow_gpm_source, "schedule");
  assert.equal(chw.line_size_in, "0.75");
  assert.equal(chw.coil_dp_psi, "3.464");
  assert.equal(chw.coil_dp_psi_source, "derived");
  assert.equal(chw.service_source, "typical");
  assert.deepEqual([chw.cv, chw.cv_source, chw.valve_dp_psi_source, chw.signal_source], ["", "selection", "selection", "selection"]);
  const hw = v.find((r) => r.service === "hw")!;
  assert.deepEqual([hw.flow_gpm, hw.coil_dp_psi, hw.coil_dp_psi_source], ["2", "", "unknown"], "no printed WPD: blank and unknown, never guessed");
  assert.ok(v.every((r) => r.furnish !== undefined && r.rule.startsWith("fcu@1:")));
});

test("points: a printed list stands instead of the typical's points; elsewhere the typical's lines", () => {
  const p = records(set["points.csv"]);
  const ahu = p.filter((r) => r.unit_tag === "AHU-1");
  assert.deepEqual(ahu.map((r) => [r.point, r.io, r.source, r.function]), [["AI-1", "AI", "drawing", "SUPPLY AIR TEMP"], ["BO-1", "BO", "drawing", "FAN START/STOP"]]);
  assert.equal(ahu[0].sheet, "c.pdf#7");
  assert.equal(ahu[0].row_bbox, "1 2 3 4");
  const fcu = p.filter((r) => r.unit_tag === "FCU-1");
  assert.ok(fcu.length > 0 && fcu.every((r) => r.source === "typical" && r.rule.startsWith("fcu@1:")));
  // The unresolved pump's points wait, and say for what.
  const p3 = p.filter((r) => r.unit_tag === "P-3");
  assert.ok(p3.every((r) => r.status !== "ok"));
});

test("equipment, the roll-up and the Desigo worksheet", () => {
  const eq = records(set["equipment.csv"]);
  const p3 = eq.find((r) => r.unit_tag === "P-3" && r.layer === "controls")!;
  assert.equal(p3.status, "unresolved");
  assert.equal(p3.waits_for, "attr.vfd");
  const ahu = eq.find((r) => r.unit_tag === "AHU-1" && r.layer === "controls")!;
  assert.equal(ahu.printed_points_rows, "2");
  assert.equal(ahu.printed_points_lists, "c.pdf#7 · AHU-1 POINTS LIST");
  // The roll-up conserves the known quantities.
  const rolled = records(set["lines_rollup.csv"]);
  const known = applied.lines.filter((l) => l.qty_base !== null).reduce((n, l) => n + l.qty_base!, 0);
  assert.ok(Math.abs(rolled.reduce((n, r) => n + Number(r.qty), 0) - known) < 1e-9);
  // Desigo: FCU-1 is room automation; the AHU's plant row counts its printed list.
  const ds = records(set["desigo_select_worksheet.csv"]);
  assert.equal(ds.find((r) => r.section === "room_automation" && r.family === "FCU")!.units, "1");
  const plantAhu = ds.find((r) => r.section === "plant_automation" && r.group === "AHU-1")!;
  assert.deepEqual([plantAhu.AI, plantAhu.BO, plantAhu.points_from, plantAhu.field_points], ["1", "1", "drawing", "2"]);
  const cc = ds.find((r) => r.section === "desigo_cc")!;
  assert.equal(Number(cc.field_points), ds.filter((r) => r.section === "plant_automation").reduce((n, r) => n + Number(r.field_points), 0));
});

test("the builder is deterministic and ships no prices or hours", () => {
  assert.deepEqual(assembliesCsvSet({ ...applied, report }), set);
  for (const f of ["lines.csv", "valves.csv", "damper_actuators.csv", "sensors.csv"] as const) {
    for (const r of records(set[f])) assert.deepEqual([r.part_no, r.unit_cost, r.hours, r.labor_category, r.partner_fields], ["", "", "", "", ""]);
  }
  for (const r of records(set["lines.csv"])) assert.deepEqual([r.extended_cost, r.extended_hours], ["", ""]);
});

test("scope: one party's lines in lines.csv and the roll-up; every other file whole", () => {
  for (const party of ["mechanical", "electrical", "controls"]) {
    const scoped = assembliesCsvSet({ ...applied, report, scope: party });
    const lines = records(scoped["lines.csv"]);
    const mine = applied.lines.filter((l) => inScope(l, party));
    assert.ok(mine.length > 0 && mine.length < applied.lines.length, `${party}: some lines, not all`);
    assert.equal(lines.length, mine.length);
    assert.ok(lines.every((r) => r.trade === party || ["furnish", "install", "wire_lv", "power", "program", "test"].some((a) => r[a] === party)), party);
    const rolled = records(scoped["lines_rollup.csv"]);
    const known = mine.filter((l) => l.qty_base !== null).reduce((n, l) => n + l.qty_base!, 0);
    assert.ok(Math.abs(rolled.reduce((n, r) => n + Number(r.qty), 0) - known) < 1e-9, `${party}: the roll-up sums the scope's lines`);
    for (const f of ["equipment.csv", "points.csv", "valves.csv", "damper_actuators.csv", "sensors.csv", "desigo_select_worksheet.csv"] as const) {
      assert.equal(scoped[f], set[f], `${party}: ${f} stays whole`);
    }
  }
  assert.deepEqual(assembliesCsvSet({ ...applied, report, scope: null }), set, "no scope is the whole set");
  assert.throws(() => assembliesCsvSet({ ...applied, report, scope: "plumber" }), /scope "plumber" is not a party/);
});

test("docs/ASSEMBLIES_CSV.md names every column of every file", () => {
  const doc = readFileSync(join(import.meta.dirname, "../../../docs/ASSEMBLIES_CSV.md"), "utf8");
  for (const [file, cols] of Object.entries(COLUMNS)) {
    assert.match(doc, new RegExp(`^## ${file.replace(".", "\\.")}$`, "m"), `${file} has a section`);
    for (const c of cols) assert.ok(doc.includes(`\`${c}\``), `${file}: \`${c}\` is documented`);
  }
  for (const s of EXPORT_SOURCES) assert.ok(doc.includes(`| \`${s}\` |`), `source ${s} is documented`);
  for (const c of LIBRARY_CSV_COLUMNS) assert.ok(doc.includes(`\`${c}\``), `library CSV: \`${c}\` is documented`);
});
