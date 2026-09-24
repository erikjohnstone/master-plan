// ASSEMBLIES WP3 — the engine: the library gate (schema.ts), selection
// (select.ts), expansion (expand.ts) and roll-up (rollup.ts), and the
// invariants GATE 3 names: conservation, determinism under shuffling,
// unknown propagation, drawing-evidence precedence, no double counting of
// nested sub-assemblies, and no exceptions on random attribute sets.
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAssemblyDefinitions, validateAssembly, type AssemblyDefinition, type ExpandedLine } from "../../src/lib/assemblies/schema.ts";
import { selectAssembly, type Instance } from "../../src/lib/assemblies/select.ts";
import { expandAll, expandApplication } from "../../src/lib/assemblies/expand.ts";
import { rollup, type Breakdown } from "../../src/lib/assemblies/rollup.ts";
import type { Value } from "../../src/lib/assemblies/expr.ts";

const src = { ref: "test fixture", license: "test", derivation: "inferred" as const };
const line = (l: Record<string, unknown>) => ({ unit: "ea", trade: "controls", source: src, ...l });

const RAW: unknown[] = [
  {
    id: "vav-hw", version: "1", title: "VAV, hot-water reheat", kind: "equipment", status: "starter",
    applies_to: { family: "VAV", selector: "attr.heat_type = 'hw'", rank: 20 },
    options: [{ id: "co2", label: "CO2 sensor", auto: "attr.cfm_max >= 1000" }],
    variables: [{ id: "valve_size", from: "attr.hw_conn_in", unit: "in" }, { id: "spare", default: 0 }],
    lines: [
      line({ id: "dat", kind: "device", qty: "1", role: { vocab: "s223", id: "TemperatureSensor" } }),
      line({ id: "dat-ai", kind: "point", qty: "1", io: "AI", role: { vocab: "xeto", id: "discharge-air-temp-sensor" }, device_role_ref: "TemperatureSensor" }),
      line({ id: "valve", kind: "device", qty: "1", role: { vocab: "s223", id: "Valve" }, params: { size: "var.valve_size", body: "'2-way'", model: "<selection>" } }),
      line({ id: "valve-ao", kind: "point", qty: "1", io: "AO", role: { vocab: "xeto", id: "hot-water-valve-cmd" }, device_role_ref: "Valve" }),
      line({ id: "co2", kind: "device", qty: "1", when: "opt.co2", role: { vocab: "s223", id: "CO2Sensor" } }),
      line({ id: "wire", kind: "component", qty: "25 + var.spare", unit: "ft", waste_pct: 10, round: { increment: 100 }, role: { vocab: "ot", id: "lv-cable" }, profile_switch: "cable_per_device" }),
      line({ id: "hookup", kind: "assembly", qty: "1", ref: { id: "coil-hookup" }, role: { vocab: "ot", id: "hydronic-coil-hookup" }, trade: "mechanical" }),
    ],
  },
  {
    id: "vav-cool", version: "1", title: "VAV, cooling only", kind: "equipment", status: "starter",
    applies_to: { family: "VAV", selector: "attr.heat_type = 'none'", rank: 20 },
    lines: [line({ id: "dat", kind: "device", qty: "1", role: { vocab: "s223", id: "TemperatureSensor" } })],
  },
  {
    id: "vav-any", version: "1", title: "VAV, any", kind: "equipment", status: "starter",
    applies_to: { family: "VAV", rank: 0 },
    lines: [line({ id: "zone", kind: "device", qty: "1", role: { vocab: "s223", id: "ZoneTemperatureSensor" } })],
  },
  {
    id: "coil-hookup", version: "1", title: "Hydronic coil hook-up", kind: "part", status: "starter",
    applies_to: { family: "ANY", rank: 0 },
    lines: [
      line({ id: "ball", kind: "component", qty: "2", trade: "mechanical", role: { vocab: "ot", id: "ball-valve" }, params: { size: "attr.hw_conn_in" } }),
      line({ id: "strainer", kind: "component", qty: "1", trade: "mechanical", role: { vocab: "ot", id: "y-strainer" } }),
    ],
  },
];

const { assemblies: LIB, rejected } = sanitizeAssemblyDefinitions(RAW);
const vav = (tag: string, attrs: Record<string, Value>, extra: Partial<Instance> = {}): Instance => ({
  tag, family: "VAV", attributes: Object.fromEntries(Object.entries(attrs).map(([k, v]) => [k, { value: v }])),
  scope: { building: "B1", floor: "LEVEL 1", system: "AHU-1" }, cites: [], ...extra,
});
const known = (lines: ExpandedLine[]) => lines.filter((l) => l.status === "ok");

test("the fixture library loads whole", () => {
  assert.deepEqual(rejected, []);
  assert.deepEqual(LIB.map((a) => a.id), ["vav-hw", "vav-cool", "vav-any", "coil-hookup"]);
});

test("the gate refuses a record with the offending token, field by field", () => {
  const base = RAW[1] as Record<string, unknown>;
  const errs = (patch: Record<string, unknown>) => {
    const v = validateAssembly({ ...base, ...patch });
    return v.ok ? [] : v.rejected.errors.join(" | ");
  };
  assert.match(String(errs({ applies_to: { family: "VAV", selector: "attr.heat_typ = 'none'", rank: 1 } })), /applies_to\.selector: "attr\.heat_typ" is not an attribute of this family at 1/);
  assert.match(String(errs({ lines: [line({ id: "p", kind: "point", qty: "1", role: { vocab: "xeto", id: "x" } })] })), /a point line names its io/);
  assert.match(String(errs({ lines: [line({ id: "p", kind: "point", qty: "1", io: "AI", role: { vocab: "xeto", id: "x" }, device_role_ref: "Valve" })] })), /no device line of role "Valve"/);
  assert.match(String(errs({ lines: [line({ id: "a", kind: "device", qty: "1", role: { vocab: "s223", id: "X" } }), line({ id: "a", kind: "device", qty: "2", role: { vocab: "s223", id: "Y" } })] })), /line "a" appears twice/);
  assert.match(String(errs({ lines: [line({ id: "a", kind: "device", qty: "1 +", role: { vocab: "s223", id: "X" } })] })), /lines\.a\.qty: unexpected end of expression/);
  assert.match(String(errs({ version: "v1" })), /version: a version is 1, 1\.2 or 1\.2\.3/);
  assert.match(String(errs({ lines: [line({ id: "a", kind: "device", qty: "1", role: { vocab: "s223", id: "X" }, price: 5 })] })), /Unrecognized key/);
  const cyc = sanitizeAssemblyDefinitions([
    { ...(RAW[3] as object), id: "p1", lines: [line({ id: "s", kind: "assembly", qty: "1", ref: { id: "p2" }, role: { vocab: "ot", id: "x" } })] },
    { ...(RAW[3] as object), id: "p2", lines: [line({ id: "s", kind: "assembly", qty: "1", ref: { id: "p1" }, role: { vocab: "ot", id: "x" } })] },
    { ...(RAW[3] as object), id: "p3", lines: [line({ id: "s", kind: "assembly", qty: "1", ref: { id: "nope" }, role: { vocab: "ot", id: "x" } })] },
  ]);
  assert.deepEqual(cyc.assemblies, []);
  assert.match(cyc.rejected.map((r) => r.errors.join()).join(" | "), /contains itself.*contains itself.*no assembly "nope"/);
});

test("selection: the most specific true selector wins; an unknown one only makes a candidate possible", () => {
  assert.equal(selectAssembly(vav("VAV-1", { heat_type: "hw" }), LIB).assembly?.id, "vav-hw");
  assert.equal(selectAssembly(vav("VAV-2", { heat_type: "none" }), LIB).assembly?.id, "vav-cool");
  assert.equal(selectAssembly(vav("VAV-3", { heat_type: "electric" }), LIB).assembly?.id, "vav-any");
  const unknown = selectAssembly(vav("VAV-4", {}), LIB);
  assert.equal(unknown.status, "unresolved");
  assert.equal(unknown.assembly, null);
  assert.deepEqual(unknown.unresolved, { missing: ["attr.heat_type"], candidates: ["vav-cool@1", "vav-hw@1", "vav-any@1"] });
  assert.equal(selectAssembly({ ...vav("FCU-1", {}), family: "FCU" }, LIB).status, "no_assembly");
  const user = selectAssembly(vav("VAV-5", {}), LIB, {}, { tag: "VAV-5", reason: "per engineer's RFI 12", assembly: { id: "vav-hw" } });
  assert.deepEqual([user.status, user.selected_by, user.reason, user.assembly?.id], ["overridden", "user", "per engineer's RFI 12", "vav-hw"]);
  const out = selectAssembly(vav("VAV-6", { heat_type: "hw" }), LIB, {}, { tag: "VAV-6", reason: "existing to remain", exclude: true });
  assert.deepEqual([out.status, out.excluded_reason], ["excluded", "existing to remain"]);
  assert.equal(selectAssembly({ ...vav("X-1", {}), family: "ANY" }, LIB).status, "no_assembly", "a part is never chosen on its own");
});

test("options and variables: attribute, project, partner default, starter default — and unknown stays unknown", () => {
  const app = selectAssembly(vav("VAV-1", { heat_type: "hw", cfm_max: 1200, hw_conn_in: 0.75 }), LIB);
  assert.equal(app.status, "ok");
  assert.deepEqual(app.options.co2, { value: true, source: "attr" });
  assert.deepEqual(app.variables.valve_size, { value: 0.75, source: "attr" });
  assert.deepEqual(app.variables.spare, { value: 0, source: "starter_default" });
  const open = selectAssembly(vav("VAV-2", { heat_type: "hw" }), LIB);
  assert.equal(open.status, "unresolved");
  assert.deepEqual(open.unresolved.missing, ["attr.cfm_max", "attr.hw_conn_in"]);
  const defaulted = selectAssembly(vav("VAV-3", { heat_type: "hw" }), LIB, { partnerDefaults: { "vav-hw.co2": false, valve_size: 0.5 } });
  assert.deepEqual([defaulted.status, defaulted.options.co2.source, defaulted.variables.valve_size.source], ["ok", "partner_default", "partner_default"]);
});

test("expansion: the quantity pipeline, parameters and their sources, the profile switch", () => {
  const inst = vav("VAV-1", { heat_type: "hw", cfm_max: 1200, hw_conn_in: 0.75 }, { multiplier: { value: 2, basis: "QTY 2 printed" } });
  const app = selectAssembly(inst, LIB);
  const lines = expandApplication(app, inst, LIB, { profile: { cable_per_device: true } });
  const by = (rule: string) => lines.find((l) => l.rule.endsWith(rule))!;
  assert.deepEqual([by(":dat").qty_base, by(":dat").qty_with_waste], [2, 2]);
  assert.deepEqual([by(":wire").qty_base, by(":wire").qty_with_waste], [50, 55], "waste on the base, never rounded per line");
  assert.deepEqual(by(":valve").params, { size: { value: 0.75, source: "attr" }, body: { value: "2-way", source: "expr" }, model: { value: null, source: "selection" } });
  assert.equal(by(":co2").status, "ok");
  const off = expandApplication(app, inst, LIB, { profile: { cable_per_device: false } });
  assert.equal(off.some((l) => l.rule.endsWith(":wire")), false, "a switch the profile has off drops the line");
  const unset = expandApplication(app, inst, LIB, {});
  assert.deepEqual([unset.find((l) => l.rule.endsWith(":wire"))!.status, unset.find((l) => l.rule.endsWith(":wire"))!.missing], ["unresolved", ["profile.cable_per_device"]]);
});

test("unknown propagation: an unknown never yields a known quantity, unless a partner default stands in and says so", () => {
  const inst = vav("VAV-7", { heat_type: "hw", hw_conn_in: 1 });
  const lines = expandApplication(selectAssembly(inst, LIB), inst, LIB, { profile: { cable_per_device: true } });
  const co2 = lines.find((l) => l.rule.endsWith(":co2"))!;
  assert.deepEqual([co2.status, co2.qty_base, co2.qty_with_waste, co2.missing], ["unresolved", null, null, ["opt.co2"]]);
  const withDefault = expandApplication(selectAssembly(inst, LIB, { partnerDefaults: { co2: true } }), inst, LIB, { partnerDefaults: { co2: true }, profile: { cable_per_device: true } });
  const co2d = withDefault.find((l) => l.rule.endsWith(":co2"))!;
  assert.deepEqual([co2d.status, co2d.qty_base, co2d.qty_source], ["ok", 1, "partner_default"]);
  assert.equal(withDefault.find((l) => l.rule.endsWith(":dat"))!.qty_source, "evidence");
});

test("drawing evidence replaces the typical's lines of the same role and never adds to them", () => {
  const inst = vav("VAV-8", { heat_type: "hw", cfm_max: 500, hw_conn_in: 1 });
  const app = selectAssembly(inst, LIB);
  const lines = expandApplication(app, inst, LIB, { profile: { cable_per_device: true } }, { printedPoints: true, declaredRoles: ["Valve"] });
  const status = Object.fromEntries(lines.map((l) => [l.rule.split(":").pop(), l.status]));
  assert.deepEqual([status["dat-ai"], status["valve-ao"], status.valve, status.dat], ["replaced", "replaced", "replaced", "ok"]);
  assert.ok(lines.filter((l) => l.status === "replaced").every((l) => l.qty_base === null));
  const rows = rollup(lines);
  assert.equal(rows.find((r) => r.role.id === "Valve")!.qty_base, 0);
  assert.equal(rows.find((r) => r.role.id === "Valve")!.replaced, 1);
});

test("a nested sub-assembly counts once per use, under its parent's quantity and path", () => {
  const inst = vav("VAV-9", { heat_type: "hw", cfm_max: 500, hw_conn_in: 0.5 }, { multiplier: { value: 3, basis: "QTY 3" } });
  const lines = expandApplication(selectAssembly(inst, LIB), inst, LIB, { profile: { cable_per_device: true } });
  const ball = lines.filter((l) => l.role.id === "ball-valve");
  assert.equal(ball.length, 1);
  assert.equal(ball[0].rule, "vav-hw@1:hookup/coil-hookup@1:ball");
  assert.equal(ball[0].qty_base, 6, "2 per hook-up × 1 hook-up × 3 units");
  assert.deepEqual(ball[0].params.size, { value: 0.5, source: "attr" });
  assert.ok(!lines.some((l) => l.kind === "assembly"), "the container line carries no quantity of its own");
});

// Random attribute sets for property tests: seeded, deterministic.
function randomInstances(seed: number, n: number): Instance[] {
  let s = seed;
  const rand = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  return Array.from({ length: n }, (_, i) => {
    const attrs: Record<string, Value> = {};
    if (rand() < 0.8) attrs.heat_type = pick(["hw", "none", "electric", "HW"]);
    if (rand() < 0.6) attrs.cfm_max = Math.round(rand() * 3000);
    if (rand() < 0.6) attrs.hw_conn_in = pick([0.5, 0.75, 1, 1.25]);
    return vav(`VAV-${i + 1}`, attrs, {
      scope: { building: pick(["B1", "B2", null]), floor: pick(["LEVEL 1", "LEVEL 2", null]), system: pick(["AHU-1", "AHU-2", null]) },
      multiplier: { value: pick([1, 1, 2, 3]), basis: "fixture" },
    });
  });
}
const settings = { profile: { cable_per_device: true } };

test("property: random attribute sets expand without an exception, and every roll-up conserves the lines", () => {
  for (let seed = 1; seed <= 40; seed++) {
    const { lines } = expandAll(randomInstances(seed, 25), LIB, settings);
    const total = known(lines).reduce((n, l) => n + l.qty_base!, 0);
    const totalWaste = known(lines).reduce((n, l) => n + l.qty_with_waste!, 0);
    for (const by of [[], ["building"], ["floor"], ["system"], ["family"], ["building", "floor", "system", "family"]] as Breakdown[][]) {
      const rows = rollup(lines, by);
      assert.ok(Math.abs(rows.reduce((n, r) => n + r.qty_base, 0) - total) < 1e-9, `seed ${seed} by ${by}`);
      assert.ok(Math.abs(rows.reduce((n, r) => n + r.qty_with_waste, 0) - totalWaste) < 1e-9, `seed ${seed} by ${by} (waste)`);
      assert.equal(rows.reduce((n, r) => n + r.lines + r.unresolved + r.replaced + r.errors, 0), lines.length, "every line in exactly one row");
      for (const r of rows) assert.ok(r.qty_order >= r.qty_with_waste - 1e-9, "rounding only raises an order quantity");
    }
  }
});

test("determinism: shuffling the units and the library changes nothing", () => {
  const insts = randomInstances(7, 30);
  const a = expandAll(insts, LIB, settings);
  let s = 99;
  const shuffle = <T,>(xs: T[]) => xs.map((x) => ({ x, k: (s = (s * 1103515245 + 12345) % 2147483648) })).sort((p, q) => p.k - q.k).map((p) => p.x);
  for (let i = 0; i < 5; i++) {
    const b = expandAll(shuffle([...insts]), shuffle([...LIB]) as AssemblyDefinition[], settings);
    assert.equal(JSON.stringify(b), JSON.stringify(a));
    assert.equal(JSON.stringify(rollup(b.lines, ["building", "floor"])), JSON.stringify(rollup(a.lines, ["building", "floor"])));
  }
});

test("the order quantity rounds at roll-up: sum first, then round", () => {
  const insts = [1, 2, 3].map((i) => vav(`VAV-${i}`, { heat_type: "hw", cfm_max: 100, hw_conn_in: 1 }));
  const { lines } = expandAll(insts, LIB, settings);
  const wire = rollup(lines).find((r) => r.role.id === "lv-cable")!;
  assert.deepEqual([wire.qty_base, wire.qty_with_waste, wire.qty_order], [75, 82.5, 100], "3 × 25 ft, +10%, ordered in 100 ft");
});

test("a project assembly applies once per project, on project variables; unknown stays unresolved", () => {
  const { assemblies, rejected: bad } = sanitizeAssemblyDefinitions([...RAW, {
    id: "loop-specialties", version: "1", title: "Closed-loop specialties", kind: "project", status: "starter",
    applies_to: { family: "project", selector: "var.loops > 0", rank: 0 },
    variables: [{ id: "loops", from: "project.closed_loops" }],
    lines: [line({ id: "air-sep", kind: "component", qty: "var.loops", trade: "mechanical", role: { vocab: "ot", id: "air-separator" } })],
  }]);
  assert.deepEqual(bad, []);
  const inst = [vav("VAV-1", { heat_type: "none" })];
  const withLoops = expandAll(inst, assemblies, { variables: { closed_loops: 2 } });
  const sep = withLoops.lines.filter((l) => l.role.id === "air-separator");
  assert.deepEqual(sep.map((l) => [l.tag, l.family, l.qty_base]), [["(project)", "project", 2]]);
  const unset = expandAll(inst, assemblies, {});
  const app = unset.applications.find((a) => a.instance.tag === "(project)")!;
  assert.deepEqual([app.status, app.unresolved.missing], ["unresolved", ["var.loops"]]);
  assert.equal(unset.lines.filter((l) => l.role.id === "air-separator").length, 0);
  assert.equal(expandAll(inst, assemblies, { variables: { closed_loops: 0 } }).lines.filter((l) => l.role.id === "air-separator").length, 0);
});

test("layers: a unit gets one assembly per layer, each chosen by its own selectors", () => {
  const { assemblies, rejected: bad } = sanitizeAssemblyDefinitions([...RAW, {
    id: "vav-hw-hookup", version: "1", title: "VAV reheat coil hook-up", kind: "equipment", status: "starter",
    applies_to: { family: "VAV", selector: "attr.heat_type = 'hw'", rank: 20, layer: "hookup" },
    lines: [line({ id: "coil", kind: "assembly", qty: "1", ref: { id: "coil-hookup" }, trade: "mechanical", role: { vocab: "ot", id: "hydronic-coil-hookup" } })],
  }]);
  assert.deepEqual(bad, []);
  const inst = vav("VAV-1", { heat_type: "hw", cfm_max: 500, hw_conn_in: 0.75 });
  const { applications, lines } = expandAll([inst], assemblies, settings);
  assert.deepEqual(applications.map((a) => [a.layer, a.assembly?.id]), [["controls", "vav-hw"], ["hookup", "vav-hw-hookup"]]);
  assert.deepEqual([...new Set(lines.map((l) => l.layer))], ["controls", "hookup"]);
  const cool = expandAll([vav("VAV-2", { heat_type: "none" })], assemblies, settings).applications;
  assert.deepEqual(cool.map((a) => [a.layer, a.status]), [["controls", "ok"], ["hookup", "no_assembly"]], "a cooling-only box has no hook-up in this library");
  const excluded = expandAll([inst], assemblies, settings, [{ tag: "VAV-1", reason: "by others", exclude: true, layer: "hookup" }]).applications;
  assert.deepEqual(excluded.map((a) => [a.layer, a.status]), [["controls", "ok"], ["hookup", "excluded"]]);
});

test("every selector false is no assembly, not unresolved", () => {
  const onlyHw = LIB.filter((a) => a.id === "vav-hw");
  assert.equal(selectAssembly(vav("VAV-1", { heat_type: "none" }), onlyHw).status, "no_assembly");
  assert.equal(selectAssembly(vav("VAV-2", {}), onlyHw).status, "unresolved");
});
