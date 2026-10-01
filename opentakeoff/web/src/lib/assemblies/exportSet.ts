// ASSEMBLIES goal, WP7.1 — the CSV set (plan §8.7; goals/ASSEMBLIES.md WP7).
//
// SHOULD THIS BE ON THE SHARED PATH? Yes. The bill of materials, the points
// and the device schedules are the takeoff's answer. The Takeoff panel's
// download and apply_assemblies' export_dir write the same bytes from this
// one builder; neither surface formats a column of its own.
//
// Every file after equipment.csv shares a key block. It says where the unit
// is (building, floor, system), which unit (tag, family, layer, typical),
// what the line is (rule, role, label), and how many (qty, with waste, unit).
// It also gives the line's status and what it waits for, who does what (six
// responsibility columns), and where it comes from (the schedule row it
// cites, and its rule's source locator, license and derivation). Units are in
// the headers.
//
// Each engineering field has a `*_source` column, one of EXPORT_SOURCES (no
// other column name ends in `_source`):
//   schedule         the printed schedule row (the unit's attribute);
//   drawing          a printed points list or another drawing statement;
//   derived          computed by the takeoff (the rule is in the column spec);
//   project, partner_default, starter_default, user
//                    a project setting, a partner or starter default, or the
//                    estimator's own override;
//   typical          the typical's own value or rule (see `rule`);
//   selection        left blank on purpose for the selection tool (an
//                    engineering decision made at selection time);
//   unknown          blank because nothing gives it.
// Partner columns (part_no, unit_cost, hours, labor_category) carry the
// partner's own fields where their library's rule has them, with
// partner_fields = "partner-entered"; lines.csv extends them (partner.ts).
// They are blank otherwise: this build ships no prices, rates or hours
// (decisions D2, D14).
//
// `scope` narrows lines.csv and lines_rollup.csv to one party's lines: those
// of its trade, or where it furnishes, installs, wires, powers, programs or
// tests. The unit list, the points and the device schedules stay whole.
import { csvEsc, parseCsvRows } from "../csv.js";
import type { AppliedInstance, PrintedPointRow } from "./apply";
import { extendedOf, PARTNER_ENTERED } from "./partner";
import type { AssembliesReport } from "./report";
import { rollup, type Breakdown } from "./rollup";
import { ACTIVITIES, PARTIES, type ApplicationRecord, type Cite, type ExpandedLine } from "./schema";

export const EXPORT_SOURCES = ["schedule", "drawing", "derived", "project", "partner_default", "starter_default", "user", "typical", "selection", "unknown"] as const;
export type ExportSource = (typeof EXPORT_SOURCES)[number];

const FROM: Record<string, ExportSource> = {
  attr: "schedule", drawing: "drawing", project: "project", partner_default: "partner_default",
  starter_default: "starter_default", user: "user", expr: "typical", literal: "typical", selection: "selection",
};

/** The unit's key block, and a line's. */
export const UNIT_KEY = ["building", "floor", "system", "unit_tag", "unit_family", "layer", "assembly"] as const;
export const LINE_KEY = [...UNIT_KEY, "rule", "role", "label", "qty", "qty_with_waste", "qty_unit", "status", "waits_for"] as const;
export const RESPONSIBILITY = ACTIVITIES.map((a) => a);
export const PROVENANCE = ["sheet", "table_title", "row_header", "row_bbox", "source_ref", "source_license", "source_derivation"] as const;
export const PARTNER = ["part_no", "unit_cost", "hours", "labor_category", "partner_fields"] as const;
/** lines.csv only: the partner's fields extended by the line's quantity. */
export const PARTNER_EXTENDED = ["extended_cost", "extended_hours"] as const;

/** An engineering field and its source column. */
const withSource = (...names: string[]) => names.flatMap((n) => [n, `${n}_source`]);

export const COLUMNS = {
  "equipment.csv": [
    ...UNIT_KEY, "schedule_family", "selected_by", "status", "waits_for", "candidates", "excluded_reason",
    "multiplier", "multiplier_basis", "options", "option_sources", "variables", "variable_sources", "derived",
    "printed_points_rows", "printed_points_lists", "sheet", "table_title", "row_header", "row_bbox",
  ],
  "lines.csv": [
    ...LINE_KEY, "kind", "io", "device_role", "waste_pct", "round", "qty_basis",
    ...withSource("size_in", "end_type"), "params", "param_sources", "trade", "labor_task", "labor_driver",
    ...RESPONSIBILITY, ...PROVENANCE, ...PARTNER, ...PARTNER_EXTENDED,
  ],
  "lines_rollup.csv": [
    "building", "floor", "system", "family", "kind", "role", "io", "qty_unit", "params", "round",
    "qty", "qty_with_waste", "qty_order", "lines_summed", "lines_unresolved", "lines_replaced", "lines_error", "tags",
  ],
  "points.csv": [
    ...UNIT_KEY, "point", "function", "io", "device_role", "qty", "status", "waits_for", ...withSource("signal"),
    "source", "rule", "sheet", "table_title", "row_header", "row_bbox",
  ],
  "valves.csv": [
    ...LINE_KEY,
    ...withSource("service", "body", "action", "characteristic", "line_size_in", "flow_gpm", "coil_dp_psi", "cv",
      "valve_dp_psi", "fail_position", "steam_lb_hr", "steam_inlet_psig", "signal", "voltage", "close_off_psi",
      "pressure_class", "glycol_pct"),
    ...RESPONSIBILITY, ...PROVENANCE, ...PARTNER,
  ],
  "damper_actuators.csv": [
    ...LINE_KEY,
    ...withSource("service", "signal", "fail_position", "spring_return", "width_in", "height_in", "sections",
      "area_ft2", "flow_cfm", "velocity_fpm", "static_in_wc", "voltage", "end_switches", "torque_in_lb"),
    ...RESPONSIBILITY, ...PROVENANCE, ...PARTNER,
  ],
  "sensors.csv": [
    ...LINE_KEY, "variable", ...withSource("medium", "mounting", "element", "range", "accuracy", "signal", "accessories"),
    ...RESPONSIBILITY, ...PROVENANCE, ...PARTNER,
  ],
  "desigo_select_worksheet.csv": [
    "section", "building", "floor", "group", "family", "units", "AI", "AO", "BI", "BO", "PULSE", "NET_IN", "NET_OUT", "SOFT",
    "field_points", "points_from", "integration_points", "note",
  ],
} as const;
export type ExportFile = keyof typeof COLUMNS;

/** Device roles each device file takes. */
export const VALVE_ROLES = ["control-valve"] as const;
export const DAMPER_ROLES = ["damper-actuator"] as const;
/** Sensor roles and the variable each measures (the library's own role
 * vocabulary, never a word read from a drawing). */
export const SENSOR_VARIABLE: Readonly<Record<string, string>> = {
  "temperature-sensor": "temperature", "space-sensor": "temperature", "humidity-sensor": "relative_humidity",
  "pressure-sensor": "pressure", "co2-sensor": "co2", "airflow-sensor": "airflow", "airflow-station": "airflow",
  "occupancy-sensor": "occupancy", "flow-meter": "water_flow", "level-sensor": "level", "smoke-detector": "smoke",
  "freezestat": "low_temperature", "pressure-switch": "pressure_switch", "current-switch": "current",
  "end-switch": "position", "window-switch": "position", "vibration-switch": "vibration",
  "fume-hood-monitor": "hood_face_velocity", "electric-meter": "electric_energy", "utility-meter": "utility_flow",
};

type Row = Record<string, string | number | boolean | null | undefined>;

function csv(file: ExportFile, rows: readonly Row[]): string {
  const cols = COLUMNS[file] as readonly string[];
  const out = [cols.join(",")];
  for (const r of rows) out.push(cols.map((c) => csvEsc(r[c] ?? "")).join(","));
  return `${out.join("\r\n")}\r\n`;
}

const round6 = (n: number) => Number(n.toPrecision(6));
const unitKey = (tag: string, layer: string, cite: Cite | undefined) => `${tag}|${layer}|${JSON.stringify(cite ?? null)}`;
const instKey = (tag: string, cite: Cite | undefined) => `${tag}|${JSON.stringify(cite ?? null)}`;
const bbox = (b: number[] | null | undefined) => (Array.isArray(b) ? b.map((n) => round6(n)).join(" ") : "");
const roundText = (r: ExpandedLine["round"] | undefined) => (r == null ? "" : typeof r === "string" ? r : `increment ${r.increment}`);
const kv = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `${k}=${v === null || v === undefined ? "" : String(v)}`).join("; ");

function citeCols(c: Cite | undefined): Row {
  return { sheet: c?.sheet ?? "", table_title: c?.table_title ?? "", row_header: c?.header ?? "", row_bbox: bbox(c?.bbox) };
}

function unitCols(tag: string, family: string, layer: string, scope: ApplicationRecord["instance"]["scope"], app: ApplicationRecord | undefined): Row {
  return {
    building: scope.building ?? "", floor: scope.floor ?? "", system: scope.system ?? "",
    unit_tag: tag, unit_family: family, layer, assembly: app?.assembly ? `${app.assembly.id}@${app.assembly.version}` : "",
  };
}

/** A parameter's value and its export source. */
function param(line: ExpandedLine, name: string): { value: string | number | boolean | null; source: ExportSource } {
  const p = line.params[name];
  if (!p) return { value: null, source: "unknown" };
  if (p.source === "selection") return { value: null, source: "selection" };
  if (p.value === null || p.value === undefined) return { value: null, source: "unknown" };
  return { value: p.value, source: FROM[String(p.source)] ?? "unknown" };
}

function field(row: Row, name: string, v: { value: string | number | boolean | null; source: ExportSource }) {
  row[name] = v.value ?? "";
  row[`${name}_source`] = v.value === null && v.source !== "selection" ? "unknown" : v.source;
}

const selection = { value: null, source: "selection" as const };
const notGiven = { value: null, source: "unknown" as const };

function lineRow(line: ExpandedLine, app: ApplicationRecord | undefined): Row {
  const c = line.cites[0];
  const row: Row = {
    ...unitCols(line.tag, line.family, line.layer, line.scope, app),
    rule: line.rule, role: line.role.id, label: line.label ?? "",
    qty: line.qty_base ?? "", qty_with_waste: line.qty_with_waste ?? "", qty_unit: line.unit,
    status: line.status, waits_for: line.missing.join("; "),
    ...citeCols(c),
    source_ref: line.source?.ref ?? "", source_license: line.source?.license ?? "", source_derivation: line.source?.derivation ?? "",
  };
  for (const a of ACTIVITIES) row[a] = line.responsibility[a] ?? "";
  const p = line.partner;
  if (p) {
    row.part_no = p.part_no ?? ""; row.unit_cost = p.unit_cost ?? ""; row.hours = p.hours ?? ""; row.labor_category = p.labor_category ?? "";
    row.partner_fields = PARTNER_ENTERED;
  }
  return row;
}

/** Whether a line is in a party's scope: its trade, or any activity the
 * party does for it. */
export function inScope(line: Pick<ExpandedLine, "trade" | "responsibility">, party: string): boolean {
  return line.trade === party || ACTIVITIES.some((a) => line.responsibility[a] === party);
}

/** The whole CSV set for one application of the library. `breakdown` groups
 * lines_rollup.csv (building, floor, family by default). */
export function assembliesCsvSet(input: {
  instances: readonly AppliedInstance[];
  applications: readonly ApplicationRecord[];
  lines: readonly ExpandedLine[];
  report: AssembliesReport;
  breakdown?: readonly Breakdown[];
  /** One party's lines only, in lines.csv and lines_rollup.csv. */
  scope?: string | null;
}): Record<ExportFile, string> {
  const { instances, applications, lines } = input;
  const scope = input.scope ?? null;
  if (scope !== null && !(PARTIES as readonly string[]).includes(scope)) throw new Error(`scope "${scope}" is not a party (${PARTIES.join(", ")})`);
  const scoped = scope === null ? lines : lines.filter((l) => inScope(l, scope));
  const apps = new Map(applications.map((a) => [unitKey(a.instance.tag, a.layer, a.instance.cites[0]), a]));
  const inst = new Map(instances.map((i) => [instKey(i.tag, i.cites[0]), i]));
  const appOf = (l: ExpandedLine) => apps.get(unitKey(l.tag, l.layer, l.cites[0]));

  // equipment.csv: one row per record.
  const equipment: Row[] = applications.map((a) => {
    const i = inst.get(instKey(a.instance.tag, a.instance.cites[0]));
    const printed = i?.printed_points ?? [];
    return {
      ...unitCols(a.instance.tag, a.instance.family, a.layer, a.instance.scope, a),
      schedule_family: i?.compiled_family ?? a.instance.family,
      selected_by: a.selected_by, status: a.status, waits_for: a.unresolved.missing.join("; "),
      candidates: a.unresolved.candidates.join("; "), excluded_reason: a.excluded_reason ?? "",
      multiplier: a.multiplier.value, multiplier_basis: a.multiplier.basis,
      options: kv(Object.fromEntries(Object.entries(a.options).map(([k, o]) => [k, o.value === null ? "unresolved" : o.value]))),
      option_sources: kv(Object.fromEntries(Object.entries(a.options).map(([k, o]) => [k, o.source ? FROM[o.source] ?? o.source : "unknown"]))),
      variables: kv(Object.fromEntries(Object.entries(a.variables).map(([k, v]) => [k, v.value]))),
      variable_sources: kv(Object.fromEntries(Object.entries(a.variables).map(([k, v]) => [k, v.source ? FROM[v.source] ?? v.source : "unknown"]))),
      derived: kv(Object.fromEntries(Object.entries(i?.derived ?? {}).map(([k, d]) => [k, `${String(d.value)} (${d.rule})`]))),
      printed_points_rows: printed.length || "",
      printed_points_lists: [...new Set(printed.map((r) => `${r.sheet_id} · ${r.list_title}`))].join("; "),
      ...citeCols(a.instance.cites[0]),
    };
  });

  // lines.csv: every expanded line (the scope's).
  const lineRows: Row[] = scoped.map((l) => {
    const row = lineRow(l, appOf(l));
    row.kind = l.kind; row.io = l.io ?? ""; row.device_role = l.device_role_ref ?? "";
    row.waste_pct = l.waste_pct; row.round = roundText(l.round);
    row.qty_basis = l.qty_source ?? "";
    field(row, "size_in", l.params.size_in ? param(l, "size_in") : l.params.line_size_in ? param(l, "line_size_in") : notGiven);
    field(row, "end_type", param(l, "end_type"));
    row.params = kv(Object.fromEntries(Object.entries(l.params).map(([k, p]) => [k, p.value])));
    row.param_sources = kv(Object.fromEntries(Object.entries(l.params).map(([k, p]) => [k, p.source ? FROM[p.source] ?? p.source : "unknown"])));
    row.trade = l.trade; row.labor_task = l.labor_task?.task ?? ""; row.labor_driver = l.labor_task?.driver ?? "";
    const x = extendedOf(l);
    row.extended_cost = x.cost ?? ""; row.extended_hours = x.hours ?? "";
    return row;
  });

  // lines_rollup.csv: the bill of materials by breakdown (D8 rounding).
  const by = input.breakdown ?? (["building", "floor", "family"] as const);
  const rolled = rollup(scoped, by).map((r) => ({
    building: r.group.building ?? "", floor: r.group.floor ?? "", system: r.group.system ?? "", family: r.group.family ?? "",
    kind: r.kind, role: r.role.id, io: r.io ?? "", qty_unit: r.unit, params: kv(r.params),
    round: roundText(r.round),
    qty: r.qty_base, qty_with_waste: r.qty_with_waste, qty_order: r.qty_order,
    lines_summed: r.lines, lines_unresolved: r.unresolved, lines_replaced: r.replaced, lines_error: r.errors, tags: r.tags.join("; "),
  }));

  // points.csv: a unit's printed list where the drawing prints one (D6),
  // otherwise its typical's point lines. The typical's lines a printed list
  // replaced stay out; the list's rows stand instead.
  const pointRows: Row[] = [];
  for (const i of instances) {
    if (!i.printed_points.length) continue;
    const app = apps.get(unitKey(i.tag, "controls", i.cites[0]));
    for (const r of i.printed_points) pointRows.push(printedRow(r, i, app));
  }
  for (const l of lines) {
    if (l.kind !== "point" || l.status === "replaced") continue;
    const app = appOf(l);
    pointRows.push({
      ...unitCols(l.tag, l.family, l.layer, l.scope, app),
      point: l.label ?? l.role.id, function: l.role.id, io: l.io ?? "", device_role: l.device_role_ref ?? "",
      qty: l.qty_base ?? "", status: l.status, waits_for: l.missing.join("; "),
      signal: "", signal_source: "selection", source: "typical", rule: l.rule, ...citeCols(l.cites[0]),
    });
  }

  // Device files: a device line of the file's roles, its selection fields.
  const devices = (roles: ReadonlySet<string>) => lines.filter((l) => l.kind === "device" && roles.has(l.role.id));
  const valves = devices(new Set(VALVE_ROLES)).map((l) => {
    const row = lineRow(l, appOf(l));
    field(row, "service", param(l, "service"));
    field(row, "body", param(l, "body"));
    field(row, "action", param(l, "action"));
    field(row, "characteristic", param(l, "characteristic"));
    field(row, "line_size_in", param(l, "line_size_in"));
    const gpm = param(l, "gpm");
    field(row, "flow_gpm", gpm);
    // Coil pressure drop: the coil's printed water pressure drop, ft of water
    // × 0.433 → psi (derived from the schedule).
    const wpd = param(l, "coil_wpd_ft");
    field(row, "coil_dp_psi", typeof wpd.value === "number" ? { value: round6(wpd.value * 0.433), source: "derived" } : wpd);
    const cv = param(l, "cv");
    field(row, "cv", cv);
    // Valve pressure drop: (GPM / Cv)² when both are known.
    field(row, "valve_dp_psi", typeof gpm.value === "number" && typeof cv.value === "number" && cv.value > 0
      ? { value: round6((gpm.value / cv.value) ** 2), source: "derived" } : cv.source === "selection" ? selection : notGiven);
    field(row, "fail_position", param(l, "fail"));
    field(row, "steam_lb_hr", param(l, "lb_hr"));
    field(row, "steam_inlet_psig", param(l, "psig"));
    for (const f of ["signal", "voltage", "close_off_psi", "pressure_class", "glycol_pct"]) field(row, f, selection);
    return row;
  });
  const dampers = devices(new Set(DAMPER_ROLES)).map((l) => {
    const row = lineRow(l, appOf(l));
    // The typical names the damper in its label; v1 carries no structured
    // service (catalogue AS-21), so the column is left for review.
    field(row, "service", notGiven);
    field(row, "signal", param(l, "signal"));
    field(row, "fail_position", param(l, "fail"));
    field(row, "spring_return", param(l, "spring_return"));
    for (const f of ["width_in", "height_in", "sections", "area_ft2", "flow_cfm", "velocity_fpm", "static_in_wc"]) field(row, f, notGiven);
    for (const f of ["voltage", "end_switches", "torque_in_lb"]) field(row, f, selection);
    return row;
  });
  const sensors = devices(new Set(Object.keys(SENSOR_VARIABLE))).map((l) => {
    const row = lineRow(l, appOf(l));
    row.variable = SENSOR_VARIABLE[l.role.id];
    field(row, "medium", param(l, "medium"));
    field(row, "mounting", param(l, "form"));
    field(row, "element", param(l, "element"));
    for (const f of ["range", "accuracy", "signal", "accessories"]) field(row, f, selection);
    return row;
  });

  return {
    "equipment.csv": csv("equipment.csv", equipment),
    "lines.csv": csv("lines.csv", lineRows),
    "lines_rollup.csv": csv("lines_rollup.csv", rolled),
    "points.csv": csv("points.csv", pointRows),
    "valves.csv": csv("valves.csv", valves),
    "damper_actuators.csv": csv("damper_actuators.csv", dampers),
    "sensors.csv": csv("sensors.csv", sensors),
    "desigo_select_worksheet.csv": csv("desigo_select_worksheet.csv", desigoWorksheet(input.report, lines, applications, instances)),
  };
}

/** A printed points-list row, once per unit its tag stands for. */
function printedRow(r: PrintedPointRow, i: AppliedInstance, app: ApplicationRecord | undefined): Row {
  return {
    ...unitCols(i.tag, i.family, "controls", i.scope, app),
    point: r.point, function: r.description ?? "", io: r.io ?? "", device_role: "",
    qty: i.multiplier?.value ?? 1, status: "ok", waits_for: "", signal: "", signal_source: "selection",
    source: "drawing", rule: `printed points list: ${r.list_title}`,
    sheet: r.sheet_id, table_title: r.list_title, row_header: r.point, row_bbox: bbox(r.bbox),
  };
}

const IO_COLS = ["AI", "AO", "BI", "BO", "PULSE", "NET_IN", "NET_OUT", "SOFT"] as const;
/** Hardwired field points: what a controller's I/O and the CC license count. */
const HARDWARE = ["AI", "AO", "BI", "BO", "PULSE"] as const;
const ioCol = (io: string | null | undefined) => (io ? io.replace("-", "_") : null);

/** The Desigo Select hand-entry worksheet: room automation counts terminal
 * units by building, floor and typical; plant automation gives each other
 * unit's I/O by type (its printed list where there is one); integration is
 * the points on a network interface. Nothing here selects a controller. */
function desigoWorksheet(report: AssembliesReport, lines: readonly ExpandedLine[], applications: readonly ApplicationRecord[], instances: readonly AppliedInstance[]): Row[] {
  const rows: Row[] = [];
  const controls = applications.filter((a) => a.layer === "controls" && a.status !== "excluded");
  const terminal = (a: ApplicationRecord) => ["VAV", "FCU", "UNIT_HEATER", "FIN_TUBE_RADIATION", "HEAT_PUMP", "LAB_AIR_VALVE"].includes(a.instance.family);
  // Room automation.
  const rooms = new Map<string, Row>();
  for (const a of controls.filter(terminal)) {
    const k = JSON.stringify([a.instance.scope.building, a.instance.scope.floor, a.assembly ? `${a.assembly.id}@${a.assembly.version}` : "(no typical)", a.instance.family]);
    const r = rooms.get(k) ?? { section: "room_automation", building: a.instance.scope.building ?? "", floor: a.instance.scope.floor ?? "", group: a.assembly ? `${a.assembly.id}@${a.assembly.version}` : "(no typical)", family: a.instance.family, units: 0 };
    r.units = Number(r.units) + a.multiplier.value;
    rooms.set(k, r);
  }
  rows.push(...[...rooms.values()].sort((x, y) => JSON.stringify([x.building, x.floor, x.group]).localeCompare(JSON.stringify([y.building, y.floor, y.group]))));
  // Plant automation: I/O per unit that has a typical or a printed list; a
  // unit with neither has no points to count, and the Desigo CC row says how
  // many were left out.
  const inst = new Map(instances.map((i) => [instKey(i.tag, i.cites[0]), i]));
  let noPoints = 0;
  for (const a of controls.filter((x) => !terminal(x))) {
    const mine = lines.filter((l) => l.kind === "point" && l.layer === "controls" && l.tag === a.instance.tag && JSON.stringify(l.cites[0]) === JSON.stringify(a.instance.cites[0]));
    const i = inst.get(instKey(a.instance.tag, a.instance.cites[0]));
    if (!a.assembly && !i?.printed_points.length) { noPoints += 1; continue; }
    const counts: Record<string, number | string> = Object.fromEntries(IO_COLS.map((c) => [c, 0]));
    let unknown = 0;
    let source = "typical";
    if (i?.printed_points.length) {
      source = "drawing";
      for (const r of i.printed_points) if (r.io) counts[r.io] = Number(counts[r.io]) + a.multiplier.value;
    } else {
      for (const l of mine) {
        const c = ioCol(l.io);
        if (!c) continue;
        if (l.qty_base === null) { unknown += 1; continue; }
        counts[c] = Number(counts[c]) + l.qty_base;
      }
    }
    const integration = mine.filter((l) => l.io === "NET-IN" || l.io === "NET-OUT").reduce((n, l) => n + (l.qty_base ?? 0), 0);
    rows.push({
      section: "plant_automation", building: a.instance.scope.building ?? "", floor: a.instance.scope.floor ?? "",
      group: a.instance.tag, family: a.instance.family, units: a.multiplier.value, ...counts,
      field_points: HARDWARE.reduce((n, c) => n + Number(counts[c]), 0),
      points_from: a.status === "ok" || a.status === "overridden" || source === "drawing" ? source : `${source} (record ${a.status})`,
      integration_points: integration || "",
      note: unknown ? `${unknown} point line(s) wait for a value: ${[...new Set(mine.filter((l) => l.qty_base === null).flatMap((l) => l.missing))].join("; ")}` : "",
    });
  }
  // Desigo CC: the connected field points the plant rows count.
  const plant = rows.filter((r) => r.section === "plant_automation");
  rows.push({
    section: "desigo_cc", group: "connected field points (plant automation rows)", units: plant.length,
    field_points: plant.reduce((n, r) => n + Number(r.field_points || 0), 0),
    integration_points: plant.reduce((n, r) => n + Number(r.integration_points || 0), 0), points_from: "sum",
    note: `${report.totals.units} units in the project; ${noPoints} with neither a typical nor a printed points list are not counted. Room automation points depend on the room controller the tool selects; they are not counted here.`,
  });
  return rows;
}

/** Columns that hold a number or nothing: counts, quantities, and every
 * engineering field whose name ends in its unit. */
const NUMERIC_COLUMN = /^(qty|qty_with_waste|qty_order|multiplier|waste_pct|units|AI|AO|BI|BO|PULSE|NET_IN|NET_OUT|SOFT|field_points|integration_points|lines_summed|lines_unresolved|lines_replaced|lines_error|printed_points_rows|unit_cost|hours|extended_cost|extended_hours|cv|sections)$|_(in|gpm|psi|psig|lb_hr|ft2|cfm|fpm|in_wc|in_lb|pct)$/;
const MAX_PROBLEMS_PER_FILE = 20;

/**
 * What is wrong with a CSV set, as instrument 5 checks it (goals/ASSEMBLIES.md
 * MEASURE 5). The checks:
 * - the files are the documented eight;
 * - each header is its file's columns, each row is whole and ends in CRLF;
 * - every `*_source` is in the closed list;
 * - a field with a value names where it came from, and a field whose source
 *   is `unknown` or `selection` is blank;
 * - number columns hold a number or nothing;
 * - partner columns are filled only on rows labelled partner-entered.
 * Empty when the set is sound; at most 20 problems a file, then a count.
 */
export function csvSetProblems(set: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  const files = Object.keys(COLUMNS) as ExportFile[];
  const extra = Object.keys(set).filter((f) => !(files as string[]).includes(f));
  const missing = files.filter((f) => !(f in set));
  if (extra.length) out.push(`files not in the set's spec: ${extra.join(", ")}`);
  if (missing.length) out.push(`files missing: ${missing.join(", ")}`);
  for (const file of files.filter((f) => f in set)) {
    const text = set[file];
    const found: string[] = [];
    const add = (p: string) => { found.push(`${file}: ${p}`); };
    if (!text.endsWith("\r\n")) add("the last row does not end in CRLF");
    if (/[^\r]\n/.test(text.replace(/"[^"]*"/g, ""))) add("a row ends in a bare LF");
    const [head, ...rows] = parseCsvRows(text);
    const cols = COLUMNS[file] as readonly string[];
    if (!head || head.join(",") !== cols.join(",")) { add(`header is not the documented columns`); out.push(...found); continue; }
    rows.forEach((r, i) => {
      const at = `row ${i + 2}`;
      if (r.length !== cols.length) { add(`${at} has ${r.length} cells, not ${cols.length}`); return; }
      const rec = Object.fromEntries(cols.map((c, j) => [c, r[j]]));
      for (const c of cols) {
        const v = rec[c];
        if (c.endsWith("_source")) {
          if (!(EXPORT_SOURCES as readonly string[]).includes(v)) add(`${at} ${c} = "${v}" is not a source`);
          const field = rec[c.slice(0, -"_source".length)];
          if (field !== undefined && field !== "" && (v === "unknown" || v === "selection")) add(`${at} ${c} = ${v} but the field has a value`);
          if (field !== undefined && field === "" && v !== "unknown" && v !== "selection") add(`${at} ${c} = ${v} but the field is blank`);
        } else if (NUMERIC_COLUMN.test(c) && v !== "" && !Number.isFinite(Number(v))) add(`${at} ${c} = "${v}" is not a number`);
      }
      if ("partner_fields" in rec) {
        if (rec.partner_fields !== "" && rec.partner_fields !== PARTNER_ENTERED) add(`${at} partner_fields = "${rec.partner_fields}"`);
        if (rec.partner_fields === "" && PARTNER.some((c) => c !== "partner_fields" && rec[c] !== "")) add(`${at} partner columns filled without the partner-entered label`);
      }
    });
    out.push(...found.slice(0, MAX_PROBLEMS_PER_FILE));
    if (found.length > MAX_PROBLEMS_PER_FILE) out.push(`${file}: …and ${found.length - MAX_PROBLEMS_PER_FILE} more`);
  }
  return out;
}
