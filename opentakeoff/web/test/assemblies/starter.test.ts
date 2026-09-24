// ASSEMBLIES WP4 — the starter library (web/src/lib/assemblies/starter/):
// GATE 4's coverage tests, deterministic.
//   (a) every UFC 3-410-01 Table 3-1 item appears in its typical, or is N/A
//       with a reason;
//   (b) each G36-derived typical's field points equal the G36 controller's
//       field connectors, configuration by configuration, recorded in
//       fixtures/mbl-g36-connectors.json with the MBL commit and file paths;
//   (c) nothing in starter/ names a manufacturer, model or part number, or
//       carries a price, a rate or hours.
// Also: the committed JSON is exactly what the builder writes; every record
// passes the library gate; every line is sourced; every responsibility is its
// role's row of the one matrix; typical ids and options are frozen for v1.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { familiesOf, sanitizeAssemblyDefinitions, type AssemblyDefinition, type ExpandedLine } from "../../src/lib/assemblies/schema.ts";
import { expandAll } from "../../src/lib/assemblies/expand.ts";
import { selectProjectAssemblies, type Instance } from "../../src/lib/assemblies/select.ts";
import { ATTRIBUTES, familyAttributes } from "../../src/lib/assemblies/attributes.ts";
import type { Value } from "../../src/lib/assemblies/expr.ts";
import { buildStarter, HOOKUP_PROFILE, serialize, STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";
import { MATRIX, ROLE_ROW, rowResponsibility } from "../../scripts/assemblies-starter/common.mts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, "fixtures");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const MBL = json(join(FIX, "mbl-g36-connectors.json"));
const UFC = json(join(FIX, "ufc-3-410-01-table-3-1.json"));
const RAW_TYPICALS: unknown[] = json(join(STARTER_DIR, "us-typicals-v1.json")).assemblies;
const RAW_HOOKUPS: unknown[] = json(join(STARTER_DIR, "us-hookups-v1.json")).assemblies;
const { assemblies: LIB, rejected } = sanitizeAssemblyDefinitions([...RAW_TYPICALS, ...RAW_HOOKUPS]);
const byId = new Map(LIB.map((a) => [a.id, a]));
const TYPICALS = LIB.slice(0, RAW_TYPICALS.length);
const HOOKUPS = LIB.slice(RAW_TYPICALS.length);
const HW = new Set(["AI", "AO", "BI", "BO"]);
const LICENSES = new Set(["BSD-3-Clause-LBNL", "LicenseRef-US-Government-Work", "Apache-2.0"]);

/** The typical ids and options typicals.csv keys use: frozen for v1 (GATE 4).
 * Changing one is a new library version, never an edit of v1. */
const FROZEN: Record<string, string[]> = {
  "vav-cooling-only": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust"],
  "vav-reheat-hw": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust", "reheat_water_temps"],
  "vav-reheat-electric": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust", "scr_heat"],
  "vav-series-fan": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust", "variable_fan", "scr_heat"],
  "vav-parallel-fan": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust", "variable_fan", "scr_heat"],
  "vav-dual-duct": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust", "inlet_flow_sensors"],
  "lab-airflow": ["fume_hood_monitor"],
  "ahu-multizone-vav": ["dedicated_min_oa", "min_oa_dp", "relief_damper", "relief_fan", "return_fan", "return_fan_airflow", "enthalpy_economizer", "differential_economizer", "dx_staged", "freezestat_to_bas", "duct_smoke_detectors", "ufc_minimum_points"],
  "ahu-single-zone": ["co2_sensor", "occupancy_sensor", "window_switch", "setpoint_adjust", "relief_damper", "relief_fan", "return_fan", "enthalpy_economizer", "differential_economizer", "dx_staged", "freezestat_to_bas", "duct_smoke_detectors", "ufc_minimum_points"],
  "ahu-constant-volume": ["economizer", "occupancy_sensor", "setpoint_adjust", "freezestat_to_bas", "duct_smoke_detectors", "ufc_minimum_points"],
  "doas": ["exhaust_fan", "variable_speed_wheel", "dx_staged", "duct_smoke_detectors", "ufc_minimum_points"],
  "rtu-networked": ["duct_smoke_detectors", "gateway"],
  "fcu": ["variable_speed_fan", "scr_heat", "occupancy_sensor", "window_switch", "setpoint_adjust"],
  "unit-heater": ["modulating_valve", "fan_status", "setpoint_adjust"],
  "split-dx-indoor": ["setpoint_adjust", "fan_status"],
  "heat-pump": ["setpoint_adjust", "fan_status"],
  "vrf-indoor": [],
  "vrf-outdoor": [],
  "pump-constant": ["ufc_minimum_points"],
  "pump-vfd": ["ufc_minimum_points"],
  "fan-constant": ["motorized_damper"],
  "fan-variable": ["motorized_damper", "pressure_control"],
  "boiler": ["isolation_valve", "network_interface"],
  "hw-plant": ["min_flow_bypass", "mixing_valve", "steam_condensate", "ufc_minimum_points"],
  "chiller": ["chw_isolation_valve", "modulating_isolation", "isolation_end_switches", "network_interface", "ufc_minimum_points"],
  "chw-plant": ["primary_secondary", "waterside_economizer", "water_cooled", "ufc_minimum_points"],
  "cooling-tower": ["two_speed_fans", "cell_isolation_valves", "vibration_switches", "basin_heater", "bypass_valve"],
  "heat-exchanger": ["isolation_valve", "condensate_pump", "ufc_minimum_points"],
  "humidifier": ["space_humidity"],
  "erv": ["packaged_controls", "variable_speed_wheel", "frost_control"],
  "building-meters": [],
};

const unit = (tag: string, family: string, attrs: Record<string, Value>): Instance => ({
  tag, family, attributes: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { value: v }])),
  scope: { building: "B1", floor: "1", system: null }, cites: [],
});

test("the committed starter JSON is exactly what the builder writes", () => {
  const out = buildStarter();
  const committed = readdirSync(STARTER_DIR).filter((f) => f.endsWith(".json")).sort();
  assert.deepEqual(committed, Object.keys(out).sort(), "no stray or missing JSON in starter/");
  for (const [name, value] of Object.entries(out)) {
    assert.equal(readFileSync(join(STARTER_DIR, name), "utf8"), serialize(value), `${name} is stale: run node --import tsx scripts/assemblies-starter/build.mts`);
  }
});

test("every starter record passes the library gate; ids are unique; typical ids and options are frozen for v1", () => {
  assert.deepEqual(rejected, []);
  assert.equal(LIB.length, TYPICALS.length + HOOKUPS.length);
  assert.equal(new Set(LIB.map((a) => a.id)).size, LIB.length);
  assert.deepEqual(Object.fromEntries(TYPICALS.map((a) => [a.id, a.options.map((o) => o.id)])), FROZEN);
  for (const a of TYPICALS) assert.equal(a.applies_to.layer, "controls", `${a.id} is a controls typical`);
  for (const a of HOOKUPS) assert.equal(a.applies_to.layer, "hookup", `${a.id} is a hook-up`);
  for (const a of LIB) assert.equal(a.status, "starter");
});

test("every line is sourced: a locator, one of the three licenses, a derivation; MBL and UFC locators name what exists", () => {
  const blocks = MBL.blocks as Record<string, { path: string; connectors: Array<{ name: string; io: string }> }>;
  const byPath = new Map(Object.values(blocks).map((b) => [b.path, b]));
  const ufcItems = new Map((UFC.lists as Array<{ items: Array<{ id: string; text: string }> }>).flatMap((l) => l.items.map((i) => [i.id, i.text] as const)));
  let mbl = 0, ufc = 0;
  for (const a of LIB) {
    assert.ok(a.provenance.length > 0, `${a.id} has provenance`);
    for (const l of a.lines) {
      const where = `${a.id}:${l.id}`;
      assert.ok(l.label && l.label.length > 3, `${where} has a label`);
      assert.ok(LICENSES.has(l.source.license), `${where}: license ${l.source.license}`);
      assert.equal(l.source.derivation === "inferred", l.source.ref.startsWith("[inferred] "), `${where}: an inference says so`);
      assert.equal(l.source.license === "Apache-2.0", l.source.derivation === "inferred", `${where}: only OpenTakeoff's inferences are Apache-2.0`);
      assert.ok(!("partner" in l), `${where}: no partner fields ship`);
      const m = l.source.ref.match(/^MBL a3cfdde (\S+)#(\w+)$/);
      if (l.source.ref.startsWith("MBL")) {
        assert.ok(m, `${where}: MBL locator ${l.source.ref}`);
        assert.equal(l.source.license, "BSD-3-Clause-LBNL");
        const block = byPath.get(m![1]);
        assert.ok(block, `${where}: ${m![1]} is a fixture block`);
        const c = block!.connectors.find((x) => x.name === m![2]);
        assert.ok(c, `${where}: ${m![2]} is a connector of ${m![1]}`);
        if (l.kind === "point") {
          assert.equal(HW.has(l.io!) ? l.io : "NET", HW.has(c!.io) ? c!.io : "NET", `${where}: I/O ${l.io} against the fixture's ${c!.io}`);
        }
        mbl++;
      }
      const u = l.source.ref.match(/^UFC 3-410-01 \(28 Jul 2025\) Table 3-1 p\.\d+, [^:]+: "(.*)" \[([a-z]+-\d\d)\]$/);
      if (l.source.ref.startsWith("UFC 3-410-01 (28 Jul 2025) Table 3-1 p.")) {
        assert.ok(u, `${where}: UFC locator ${l.source.ref}`);
        assert.equal(ufcItems.get(u![2]), u![1], `${where}: quotes item ${u![2]} verbatim`);
        ufc++;
      }
      assert.match(l.source.ref, /^(MBL |UFC 3-410-0[12] |UFGS \d\d \d\d \d\d|VA \d\d \d\d \d\d|\[inferred\] )/, `${where}: a known source (${l.source.ref})`);
    }
  }
  assert.ok(mbl > 300 && ufc > 60, `MBL lines ${mbl}, UFC lines ${ufc}`);
});

test("(a) every UFC 3-410-01 Table 3-1 item appears in its typical, or is N/A with a reason", () => {
  const cov = json(join(STARTER_DIR, "coverage-ufc-3-410-01.json")).items as Array<{ item: string; text: string; covered_by?: Array<{ typical: string; line: string }>; not_applicable?: string }>;
  const items = (UFC.lists as Array<{ items: Array<{ id: string; text: string }> }>).flatMap((l) => l.items);
  assert.equal(items.length, 73);
  assert.deepEqual(cov.map((c) => [c.item, c.text]), items.map((i) => [i.id, i.text]));
  const na: string[] = [];
  for (const c of cov) {
    if (c.not_applicable) { assert.ok(c.not_applicable.length > 40, `${c.item}: the reason is written out`); na.push(c.item); continue; }
    assert.ok(c.covered_by && c.covered_by.length > 0, `${c.item} "${c.text}" is covered`);
    for (const { typical, line } of c.covered_by!) {
      const l = byId.get(typical)?.lines.find((x) => x.id === line);
      assert.ok(l, `${c.item}: ${typical}:${line} exists`);
      assert.ok(l!.kind === "point" || l!.kind === "device", `${c.item}: ${typical}:${line} is a point or device`);
    }
  }
  assert.deepEqual(na, ["ads-26"]);
});

/** Expand a configuration's typical as a user who chose its options would:
 * the MBL-derived field points, by I/O type, connector by connector. */
function g36Points(cfg: { typical: string; attributes: Record<string, Value>; options: Record<string, boolean> }, library: AssemblyDefinition[] = TYPICALS) {
  const def = library.find((a) => a.id === cfg.typical)!;
  for (const o of Object.keys(cfg.options)) assert.ok(def.options.some((x) => x.id === o), `${cfg.typical} has option ${o}`);
  const inst = unit("U-1", familiesOf(def)[0], cfg.attributes);
  const { applications, lines } = expandAll([inst], library, {}, [{ tag: "U-1", reason: "configuration", layer: "controls", options: cfg.options }]);
  const app = applications.find((a) => a.layer === "controls")!;
  const out: Record<string, string[]> = { AI: [], AO: [], BI: [], BO: [] };
  for (const l of lines as ExpandedLine[]) {
    if (l.kind !== "point" || !HW.has(l.io!) || !l.source.ref.startsWith("MBL")) continue;
    assert.notEqual(l.status, "unresolved", `${cfg.typical} ${l.rule} waits for ${l.missing.join(", ")}`);
    if (l.status !== "ok") continue;
    assert.equal(l.qty_base, 1, `${l.rule}: one point per connector`);
    out[l.io!].push(l.source.ref.split("#")[1]);
  }
  for (const k of Object.keys(out)) out[k].sort();
  return { app, out };
}

test("(b) G36: every configuration's typical has exactly the G36 controller's field points, by I/O type", () => {
  const configs = MBL.configurations as Array<{ id: string; typical: string; attributes: Record<string, Value>; options: Record<string, boolean>; points: Record<string, string[]>; counts: Record<string, number> }>;
  assert.equal(configs.length, 192);
  assert.equal(MBL.source.commit, "a3cfdde4e2fa1605f351875c2199b6aafaee7fe0");
  const typicals = new Set<string>();
  for (const cfg of configs) {
    const { app, out } = g36Points(cfg);
    assert.equal(app.assembly?.id, cfg.typical, `${cfg.id}: the attributes select ${cfg.typical} (got ${app.assembly?.id ?? app.status}: ${app.unresolved.missing.join(", ")})`);
    assert.deepEqual(out, cfg.points, `${cfg.id}: ${cfg.typical}'s G36 points`);
    assert.deepEqual(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), cfg.counts);
    typicals.add(cfg.typical);
  }
  assert.deepEqual([...typicals].sort(), ["ahu-multizone-vav", "ahu-single-zone", "fcu", "vav-cooling-only", "vav-dual-duct", "vav-parallel-fan", "vav-reheat-electric", "vav-reheat-hw", "vav-series-fan"]);
});

test("(b) negative controls: the G36 comparison catches a missing point, a wrong condition and a wrong I/O type", () => {
  const configs = (MBL.configurations as Array<{ id: string; typical: string; attributes: Record<string, Value>; options: Record<string, boolean>; points: Record<string, string[]> }>).filter((c) => c.typical === "vav-reheat-hw");
  const mutate = (fn: (l: AssemblyDefinition["lines"][number]) => AssemblyDefinition["lines"][number] | null) =>
    TYPICALS.map((a) => (a.id !== "vav-reheat-hw" ? a : { ...a, lines: a.lines.map(fn).filter((l): l is AssemblyDefinition["lines"][number] => l !== null) }));
  const differs = (library: AssemblyDefinition[]) => configs.filter((c) => JSON.stringify(g36Points(c, library).out) !== JSON.stringify(c.points)).length;
  assert.equal(differs(TYPICALS), 0);
  assert.equal(differs(mutate((l) => (l.id === "zone-temp" ? null : l))), configs.length, "a dropped zone temperature");
  assert.equal(differs(mutate((l) => (l.id === "window" ? { ...l, when: "true" } : l))), 2, "a window switch without its option (the two configurations without one)");
  assert.equal(differs(mutate((l) => (l.id === "hw-valve-cmd" ? { ...l, io: "BO" } : l))), configs.length, "a valve command typed BO");
});

test("every point function is a Project Haystack ph.points spec and every device class a 223P class", () => {
  const specs = new Set<string>(json(join(FIX, "xeto-ph-points.json")).specs);
  const classes = new Set<string>(json(join(FIX, "s223-classes.json")).classes);
  let x = 0, c = 0;
  for (const a of LIB) for (const l of a.lines) {
    if (l.role.vocab === "xeto") { assert.ok(specs.has(l.role.id), `${a.id}:${l.id}: ${l.role.id} is a ph.points spec`); x++; }
    const cls = l.params?.s223_class;
    if (typeof cls === "string") { assert.ok(classes.has(cls.replace(/'/g, "")), `${a.id}:${l.id}: ${cls} is a 223P class`); c++; }
  }
  assert.ok(x > 200 && c > 100, `${x} Xeto functions, ${c} 223P classes`);
});

test("(b) G36 chiller plant: each field connector is carried by a line, or left out of v1 with the reason", () => {
  const cov = json(join(STARTER_DIR, "coverage-g36-chiller-plant.json")).connectors as Array<{ connector: string; io: string; cited_by?: unknown[]; covered_by?: Array<{ typical: string; line: string }>; not_in_v1?: string }>;
  const field = (MBL.blocks["Plants/Chillers"].connectors as Array<{ name: string; io: string }>).filter((c) => c.io !== "NET").map((c) => c.name);
  assert.deepEqual(cov.map((c) => c.connector), field);
  for (const c of cov) {
    assert.ok(c.cited_by || c.covered_by || c.not_in_v1, c.connector);
    for (const { typical, line } of c.covered_by ?? []) assert.ok(byId.get(typical)?.lines.some((l) => l.id === line), `${c.connector}: ${typical}:${line}`);
  }
  const left = cov.filter((c) => !c.cited_by && !c.covered_by).map((c) => c.connector);
  assert.deepEqual(left, ["TConWatRet", "dpChiWat", "uEcoPum", "TEntHex", "u1TowInlIsoValOpe", "u1TowOutIsoValOpe", "u1TowInlIsoValClo", "u1TowOutIsoValClo", "yWseRetVal", "yWsePumOn", "y1WseChiWatBypVal", "yWsePumSpe"], "left out of v1, each with its reason");
});

// (c) — what a starter file may never carry.
const MAKERS = [
  "Siemens", "Honeywell", "Johnson Controls", "JCI", "Trane", "Carrier", "Daikin", "Belimo", "Schneider", "Distech", "Automated Logic", "ALC", "KMC", "Delta Controls",
  "Tridium", "Niagara", "Griswold", "Nexus", "IMI", "Flow Design", "Victaulic", "Bell & Gossett", "B&G", "Hays", "Armstrong", "Taco", "Grundfos", "Titus", "Krueger",
  "Nailor", "Enviro-Tec", "York", "Lennox", "Aaon", "Greenheck", "Loren Cook", "Mestek", "Modine", "Raypak", "Lochinvar", "Cleaver-Brooks", "Aerco", "Viessmann",
  "Baltimore Aircoil", "Evapco", "Marley", "Danfoss", "ABB", "Yaskawa", "Mitsubishi", "LG", "Samsung", "Fujitsu", "Carel", "Nortec", "DriSteem", "Spirax", "Watts",
  "Apollo", "Nibco", "Mueller", "Veris", "Setra", "Dwyer", "Kele", "Ebtron", "Vaisala", "Greystone", "BAPI", "Functional Devices", "Ruskin", "Pottorff", "Tamco",
  "Price Industries", "Neptune", "Badger Meter", "Onicon", "Emerson", "Rosemount", "Xylem", "Nortek", "Ventrol",
];
const FORBIDDEN: Array<[string, RegExp]> = [
  ["a maker", new RegExp(`\\b(${MAKERS.map((m) => m.replace(/[.*+?^${}()|[\]\\&]/g, (c) => (c === "&" ? "&" : `\\${c}`))).join("|")})\\b`)],
  ["money", /\$\s*\d|\bUSD\b|\b(price|prices|priced|pricing|unit cost|unit_cost|list cost|discount|markup)\b/i],
  ["a rate", /\b(labou?r|hourly|billing)\s+rates?\b|\brates?\s+per\s+hour\b|\$\s*\/\s*h/i],
  ["hours", /\b(hours?|hrs?|man-?hours?)\b/i],
  ["hours", /\b\d+(\.\d+)?\s?h\b(?![.\d])/],
  ["a model or part number", /\b(model|part|catalog(ue)?|cat\.)\s*(no\.?|number|#)/i],
];
/** Part-number shapes: letters then three or more digits ("GDE131.1P"), or
 * dash-joined capitals and digits with both ("SK2A-100"). Standards'
 * short keys (research 04's "UF-6426") and license ids pass. */
const SKU = [/\b[A-Z]{1,5}\d{3,}[A-Z0-9.]*\b/g, /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]+(?:-[A-Z0-9]+)+\b/g];
const STANDARD_TOKEN = /^(UF-\d{4}|VA-\d{4}|AFL-3|BSD-3)$/;
const skus = (text: string) => SKU.flatMap((re) => [...text.matchAll(re)].map((x) => x[0])).filter((t) => t.length >= 5 && !STANDARD_TOKEN.test(t));

test("(c) nothing in starter/ names a manufacturer, model or part number, or carries a price, rate or hours", () => {
  const files = readdirSync(STARTER_DIR).filter((f) => f.endsWith(".json") || f.endsWith(".md"));
  assert.ok(files.includes("NOTICE.md"), "NOTICE.md ships");
  for (const f of files) {
    const text = readFileSync(join(STARTER_DIR, f), "utf8");
    for (const [what, re] of FORBIDDEN) {
      const m = text.match(re);
      assert.equal(m, null, `${f} names ${what}: "${m?.[0]}" in …${m ? text.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 60) : ""}…`);
    }
    assert.deepEqual(skus(text), [], `${f}: part-number-like tokens`);
  }
  // The negative controls: each rule catches what it is for.
  const catches = (s: string) => FORBIDDEN.some(([, re]) => re.test(s)) || skus(s).length > 0;
  for (const bad of ["Belimo actuator", "unit_cost 125", "$40", "2.5 h per point", "8 hours", "labor rate", "model no. XY", "part number", "GDE131.1P", "SK2A-100"]) assert.ok(catches(bad), `the scan catches "${bad}"`);
  for (const ok of ["Airflow rate of each VAV box (primary)", "UFGS 23 21 13 (UF-6426) §3.1.5", "UFC 3-410-01 (28 Jul 2025)", "flow rate", "Hot water flow rate", "VA 23 21 13 §2.8 H.3", "G36 Figure A-2", "AFL-3.0", "§3.7.8.5.5 item h", "PH-DA-T-LL"]) assert.ok(!catches(ok), `the scan passes "${ok}"`);
});

test("one responsibility matrix: every line's responsibility is its role's row; VA rows map their printed cells", () => {
  for (const a of LIB) {
    for (const l of a.lines) {
      const where = `${a.id}:${l.id}`;
      if (l.kind === "device" || l.kind === "component") {
        const row = ROLE_ROW[l.role.id];
        assert.ok(row && MATRIX[row], `${where}: role ${l.role.id} has a matrix row`);
        assert.deepEqual(l.responsibility, rowResponsibility(row), `${where}: responsibility is ${row}`);
      } else if (l.kind === "point") {
        assert.deepEqual(l.responsibility, rowResponsibility("inf.points"), `${where}: points are programmed and tested by controls`);
      } else {
        assert.equal(l.responsibility, undefined, `${where}: a ${l.kind} line assigns no responsibility`);
      }
    }
  }
  const party: Record<string, string | undefined> = { "23 09 23": "controls", "23": "mechanical", "26": "electrical", "16": "electrical", "28 31 00": "fire_alarm", "N/A": undefined };
  for (const [key, row] of Object.entries(MATRIX)) {
    if (!row.va) { assert.ok(row.source.derivation === "inferred" || !key.startsWith("va."), key); continue; }
    assert.ok(key.startsWith("va."), key);
    assert.deepEqual([row.furnish, row.install, row.wire_lv, row.power], row.va.map((c) => party[c]), `${key}: ${row.va.join(" / ")}`);
  }
});

test("the hook-up profile: every switch and project variable a hook-up reads has a default and the sources that disagree", () => {
  const used = new Set<string>();
  const vars = new Set<string>();
  for (const a of HOOKUPS) {
    for (const l of a.lines) if (l.profile_switch) used.add(l.profile_switch);
    for (const v of a.variables) if (v.from?.startsWith("project.")) vars.add(v.from.slice(8));
  }
  for (const a of TYPICALS) for (const v of a.variables) if (v.from?.startsWith("project.")) vars.add(v.from.slice(8));
  assert.deepEqual([...used].sort(), Object.keys(HOOKUP_PROFILE.switches).sort());
  assert.deepEqual([...vars].sort(), Object.keys(HOOKUP_PROFILE.variables).sort());
  for (const [k, s] of [...Object.entries(HOOKUP_PROFILE.switches), ...Object.entries(HOOKUP_PROFILE.variables)]) {
    assert.ok(s.sources.length >= 1 && s.label.length > 10, k);
  }
});

test("a hot-water reheat box's hook-up under the starter profile: loose parts above the kit size, a kit at or below it", () => {
  const profile = Object.fromEntries(Object.entries(HOOKUP_PROFILE.switches).map(([k, v]) => [k, v.default]));
  const variables = Object.fromEntries(Object.entries(HOOKUP_PROFILE.variables).filter(([, v]) => v.default !== null).map(([k, v]) => [k, v.default as Value]));
  const settings = { profile, variables };
  const count = (size: number) => {
    const { lines } = expandAll([unit("VAV-1", "VAV", { heat_type: "hw", hw_conn_in: size, hw_gpm: 2, terminal_type: "single_duct" })], LIB, settings);
    const hook = lines.filter((l) => l.layer === "hookup" && l.status === "ok" && l.kind === "component");
    return Object.fromEntries(hook.map((l) => [l.role.id, (hook.filter((x) => x.role.id === l.role.id).reduce((s, x) => s + (x.qty_base ?? 0), 0))]));
  };
  assert.deepEqual(count(1.25), { "isolation-valve": 2, union: 2, strainer: 1, "balancing-valve": 1, "pt-port": 2, "air-vent": 1, "drain-valve": 1, "access-door": 1 });
  assert.deepEqual(count(0.75), { "coil-kit": 1, "air-vent": 1, "drain-valve": 1, "access-door": 1 });
  // Unknown connection size: the size-dependent lines wait for it; nothing is guessed.
  const { lines } = expandAll([unit("VAV-2", "VAV", { heat_type: "hw", terminal_type: "single_duct" })], LIB, settings);
  const waiting = lines.filter((l) => l.layer === "hookup" && l.status === "unresolved");
  assert.ok(waiting.length > 0 && waiting.every((l) => l.missing.includes("attr.hw_conn_in")), "unresolved on attr.hw_conn_in");
});

test("property: every typical and hook-up expands without an error over random attribute sets and settings", () => {
  let seed = 20260924;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  let expanded = 0;
  for (const def of LIB.filter((a) => a.kind === "equipment")) {
    for (const family of familiesOf(def)) {
      const attrs = familyAttributes(family).all;
      for (let i = 0; i < 12; i++) {
        const values: Record<string, Value> = {};
        for (const a of attrs) {
          if (rnd() < 0.3) continue;
          const spec = ATTRIBUTES[a];
          values[a] = spec.kind === "enum" ? pick(spec.values!) : spec.kind === "text" ? "BACNET" : Math.round(rnd() * 40) / 4;
        }
        const settings = {
          profile: Object.fromEntries(Object.keys(HOOKUP_PROFILE.switches).map((k) => [k, rnd() < 0.5])),
          variables: { balancing: pick(["manual", "automatic"]), coil_valve_body: pick(["2-way", "3-way", "picv"]), flange_min_in: 2, kit_max_in: pick([0, 1]), condensate_lift: rnd() < 0.5 },
        };
        const { lines } = expandAll([unit(`X-${i}`, family, values)], LIB, settings);
        const errors = lines.filter((l) => l.status === "error");
        assert.deepEqual(errors.map((l) => `${l.rule}: ${l.missing.join()}`), [], `${def.id} on ${family}`);
        expanded++;
      }
    }
  }
  const projects: Array<Record<string, Value>> = [{}, { hw_plants: 1, chw_plants: 2, buildings: 1, gas_service: true, steam_service: false, closed_loops: 3 }];
  for (const vars of projects) {
    const apps = selectProjectAssemblies(LIB, { variables: vars });
    assert.ok(Object.keys(vars).length === 0 || apps.length >= 4, "project assemblies apply once the project says how many");
  }
  assert.ok(expanded > 400, `${expanded} expansions`);
});
