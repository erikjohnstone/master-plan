// ASSEMBLIES — options the drawing decides by its printed I/O counts (src/lib/assemblies/ioMatch.ts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandApplication } from "../../src/lib/assemblies/expand.ts";
import { optionsFromPrintedIo, type PrintedIo } from "../../src/lib/assemblies/ioMatch.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { selectAssembly, type Instance } from "../../src/lib/assemblies/select.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions(JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies).assemblies;
const cite = { sheet: "m.pdf#3", table_title: "FAN COIL UNIT SCHEDULE", header: "MARK", bbox: null };
const fcu: Instance = {
  tag: "FCU-1", family: "FCU", scope: { building: null, floor: null, system: null }, cites: [cite],
  attributes: { ecm: { value: "yes" }, cooling_type: { value: "chw" }, heating_type: { value: "hw" } },
};

/** The typical's own hardware counts for a setting of its options. */
function countsFor(options: Record<string, boolean>): PrintedIo {
  const app = selectAssembly(fcu, LIB, {}, { tag: fcu.tag, reason: "test", assembly: { id: "fcu" }, options });
  const c: PrintedIo = { AI: 0, AO: 0, BI: 0, BO: 0 };
  for (const l of expandApplication(app, fcu, LIB)) if (l.kind === "point" && l.io && l.io in c) c[l.io as keyof PrintedIo] += l.qty_base!;
  return c;
}

test("the printed counts decide the free options that only one setting explains", () => {
  const base = selectAssembly(fcu, LIB);
  const free = Object.entries(base.options).filter(([, o]) => o.source === "starter_default").map(([k]) => k).sort();
  assert.ok(free.length >= 3, `free: ${free}`);
  // The drawing prints the points of the typical without setpoint adjustment (one AI fewer).
  const want: Record<string, boolean> = { ...Object.fromEntries(free.map((k) => [k, base.options[k].value === true])), setpoint_adjust: false };
  const m = optionsFromPrintedIo(fcu, LIB, {}, countsFor(want));
  // SCR heat changes no point of a hot-water fan coil: both of its values fit, so it stays open.
  assert.equal(m.fits, 2);
  assert.deepEqual(m.decided, { occupancy_sensor: false, setpoint_adjust: false, window_switch: false });
  // An option decided by the schedule (variable_speed_fan from ECM) is not free.
  assert.ok(!m.free.includes("variable_speed_fan"));
});

test("two options that add the same I/O type cannot be told apart: neither is decided, the rest still are", () => {
  // Occupancy sensor and window switch each add one binary input to the FCU typical.
  const base = selectAssembly(fcu, LIB);
  const free = Object.entries(base.options).filter(([, o]) => o.source === "starter_default").map(([k]) => k);
  const defaults = Object.fromEntries(free.map((k) => [k, base.options[k].value === true]));
  const one = countsFor({ ...defaults, occupancy_sensor: true, window_switch: false });
  const other = countsFor({ ...defaults, occupancy_sensor: false, window_switch: true });
  assert.deepEqual(one, other, "the fixture: both add the same count of the same type");
  const m = optionsFromPrintedIo(fcu, LIB, {}, one);
  assert.ok(m.fits >= 2);
  assert.ok(!("occupancy_sensor" in m.decided) && !("window_switch" in m.decided));
});

test("counts no setting gives decide nothing, and say so", () => {
  const m = optionsFromPrintedIo(fcu, LIB, {}, { AI: 99, AO: 0, BI: 0, BO: 0 });
  assert.deepEqual([m.fits, m.decided], [0, {}]);
  assert.match(m.reason!, /no setting of the free options/);
  const none = optionsFromPrintedIo({ ...fcu, family: "GRD" }, LIB, {}, { AI: 1, AO: 0, BI: 0, BO: 0 });
  assert.match(none.reason!, /no typical/);
});
