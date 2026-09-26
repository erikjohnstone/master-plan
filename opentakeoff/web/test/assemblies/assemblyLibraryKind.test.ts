// ASSEMBLIES WP3.1 — the estimator profile's assembly_library holds linear run
// assemblies (no `kind`) and this goal's equipment/project assemblies (a
// `kind`). The golden (fixtures/linear-golden.json) was captured from the
// linear code before its sanitizer learned `kind`: the sanitizer's output and
// every record's resolveLinearAssembly lines on duct and pipe runs must stay
// byte-identical, with or without equipment records in the same library.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizeAssemblyLibrary, SEED_ASSEMBLIES } from "../../src/lib/linear/assemblyLibrary.ts";
import { resolveLinearAssembly } from "../../src/lib/linear/assembly.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { LINEAR_GOLDEN_INPUTS } from "./fixtures/linearGoldenInputs.ts";

const golden = readFileSync(new URL("./fixtures/linear-golden.json", import.meta.url), "utf8");

function replay(rawLibrary: unknown[]): string {
  const { runs, settings } = LINEAR_GOLDEN_INPUTS;
  const sanitized = sanitizeAssemblyLibrary(rawLibrary);
  const resolved: Record<string, unknown> = {};
  for (const rec of [...SEED_ASSEMBLIES, ...sanitized]) {
    for (const [runId, { run, condition }] of Object.entries(runs)) {
      for (const [setId, s] of Object.entries(settings)) {
        resolved[`${rec.id}|${runId}|${setId}`] = resolveLinearAssembly(run as never, condition as never, rec, s as never);
      }
    }
  }
  return JSON.stringify({ seed: sanitizeAssemblyLibrary(SEED_ASSEMBLIES), mixed: sanitized, resolved }, null, 1) + "\n";
}

const equipment = {
  id: "vav-reheat-hw", version: "1", title: "VAV with hot-water reheat", kind: "equipment",
  applies_to: { family: "VAV", selector: "attr.heat_type = 'hw'", rank: 10 },
  lines: [{ id: "dat", kind: "device", qty: "1", unit: "ea", role: { vocab: "s223", id: "TemperatureSensor" }, trade: "controls", source: { ref: "test", license: "test", derivation: "inferred" } }],
  status: "starter",
};

test("the linear library and its resolutions are byte-identical to the golden", () => {
  assert.equal(replay(LINEAR_GOLDEN_INPUTS.rawLibrary), golden);
});

test("equipment assemblies in the same library change nothing linear, and load through their own gate", () => {
  const mixed = [equipment, ...LINEAR_GOLDEN_INPUTS.rawLibrary, { ...equipment, id: "kinded-but-broken", kind: "equipment", lines: [] }];
  assert.equal(replay(mixed), golden);
  const { assemblies, rejected } = sanitizeAssemblyDefinitions(mixed);
  assert.deepEqual(assemblies.map((a) => a.id), ["vav-reheat-hw"]);
  assert.deepEqual(rejected.map((r) => r.id), ["kinded-but-broken"]);
});

test("the store's two halves: replacing one kind keeps the other, and with no equipment nothing changes", async () => {
  const { withEquipmentAssemblies, withLinearRecords, equipmentAssembliesOf } = await import("../../src/lib/assemblies/library.ts");
  const linearOnly = sanitizeAssemblyLibrary(LINEAR_GOLDEN_INPUTS.rawLibrary);
  // No equipment stored: exactly what saveAssemblyLibrary always wrote.
  assert.equal(JSON.stringify(withLinearRecords(undefined, LINEAR_GOLDEN_INPUTS.rawLibrary)), JSON.stringify(linearOnly));
  assert.equal(JSON.stringify(withLinearRecords(linearOnly, linearOnly)), JSON.stringify(linearOnly), "idempotent");
  // Equipment stored beside: a linear save keeps it, an equipment save keeps the linear records.
  const both = withEquipmentAssemblies(linearOnly, [equipment]);
  assert.deepEqual(equipmentAssembliesOf(both).map((a) => a.id), ["vav-reheat-hw"]);
  const relinear = withLinearRecords(both, [SEED_ASSEMBLIES[0]]);
  assert.deepEqual(sanitizeAssemblyLibrary(relinear).map((a) => a.id), ["asm-duct-rect-default"]);
  assert.deepEqual(equipmentAssembliesOf(relinear).map((a) => a.id), ["vav-reheat-hw"]);
  const cleared = withEquipmentAssemblies(relinear, []);
  assert.equal(JSON.stringify(cleared), JSON.stringify(sanitizeAssemblyLibrary([SEED_ASSEMBLIES[0]])));
});
