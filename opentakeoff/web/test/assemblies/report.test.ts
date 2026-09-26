// ASSEMBLIES WP5.3/5.4 — the report every surface renders (src/lib/assemblies/report.ts):
// exceptions first, a table per family, a row per unit with its cites.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { applyAssemblies, type CompiledItem } from "../../src/lib/assemblies/apply.ts";
import type { NormalizedItem } from "../../src/lib/assemblies/normalize.ts";
import { assembliesReport } from "../../src/lib/assemblies/report.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const LIB = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;

const row = (family: string, tag: string, i: number): CompiledItem => ({
  family, tag, sheet_id: "s.pdf#2", table_title: `${family} SCHEDULE`, cells: { MARK: { text: tag, bbox: [i, 0, i + 1, 1] } },
});
const norm = (it: CompiledItem, values: Record<string, number | string> = {}): NormalizedItem => ({
  family: it.family, tag: it.tag, unknown: {},
  attributes: Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value, printed: String(value), rule: "test", cite: { sheet: it.sheet_id, table_title: it.table_title, header: k, bbox: null } }])),
});

test("the report: exceptions first (each naming what it waits for), a family table, unit rows with line counts and cites", () => {
  const items = [row("PUMP", "P-1", 0), row("PUMP", "P-2", 1), row("PUMP", "P-3", 2), row("FIN_TUBE_RADIATION", "FTR-1", 3), row("AHU", "AHU-7", 4)];
  const normalized = [norm(items[0], { vfd: "yes" }), norm(items[1], { vfd: "no" }), norm(items[2]), norm(items[3]),
    norm(items[4], { supply_cfm: 9000, oa_cfm_min: 9000, energy_recovery: "none", cooling_type: "chw" })];
  const { instances, applications, lines } = applyAssemblies({ project: { items }, library: LIB, normalized });
  const r = assembliesReport(instances, applications, lines);
  assert.equal(r.schema, "opentakeoff.assemblies_report.v1");
  assert.equal(r.totals.units, 5);
  assert.equal(r.totals.records, applications.length);
  assert.equal(r.totals.lines, lines.length);
  // P-3 prints no VFD: its controls record waits for it, and it is listed first.
  const ex = r.exceptions.find((e) => e.tag === "P-3" && e.layer === "controls");
  assert.ok(ex);
  assert.deepEqual(ex.waits_for, ["attr.vfd"]);
  assert.deepEqual(ex.candidates.sort(), ["pump-constant@1", "pump-vfd@1"]);
  assert.ok(r.exceptions.every((e) => e.status === "unresolved"));
  assert.equal(r.exceptions.length, r.totals.by_status.unresolved);
  // The family table counts units once, records per layer, and typicals by id@version.
  const pumps = r.families.find((f) => f.family === "PUMP")!;
  assert.equal(pumps.units, 3);
  assert.equal(pumps.records, applications.filter((a) => a.instance.family === "PUMP").length);
  assert.equal(pumps.assemblies["pump-vfd@1"], 1);
  assert.equal(pumps.assemblies["pump-constant@1"], 1);
  assert.equal(r.families.find((f) => f.family === "FIN_TUBE_RADIATION")!.by_status.no_assembly, 1);
  // Unit rows: the derived family with its rule, the schedule family, cites, line counts.
  const doas = r.units.find((u) => u.tag === "AHU-7" && u.layer === "controls")!;
  assert.equal(doas.family, "DOAS");
  assert.equal(doas.compiled_family, "AHU");
  assert.equal(doas.derived.family.rule, "derive.family.outdoor_air_cfm");
  assert.equal(doas.assembly, "doas@1");
  assert.deepEqual(doas.cites, [{ sheet: "s.pdf#2", table_title: "AHU SCHEDULE", header: "MARK", bbox: [4, 0, 5, 1] }]);
  const p1 = r.units.find((u) => u.tag === "P-1" && u.layer === "controls")!;
  assert.equal(p1.lines.ok + p1.lines.unresolved + p1.lines.replaced + p1.lines.error,
    lines.filter((l) => l.tag === "P-1" && l.layer === "controls").length);
  // Line status totals add up.
  assert.equal(Object.values(r.totals.lines_by_status).reduce((a, b) => a + b, 0), lines.length);
});
