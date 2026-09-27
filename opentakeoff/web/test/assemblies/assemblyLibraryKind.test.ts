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

test("the store keeps a partner's record that references the starter's sub-assemblies; the whole library resolves it (AS-41)", async () => {
  // 26_CA through the Takeoff panel (the UI proof): a clone of
  // hookup-air-handler, whose coil lines reference the starter's coil
  // hook-ups, was saved and read back as nothing. The store's gate resolved
  // its references among the partner's own records alone.
  const { join } = await import("node:path");
  const { STARTER_DIR } = await import("../../scripts/assemblies-starter/build.mts");
  const { withEquipmentAssemblies, equipmentAssembliesOf } = await import("../../src/lib/assemblies/library.ts");
  const { cloneForEdit, combinedLibrary } = await import("../../src/lib/assemblies/libraryEdit.ts");
  const { emptyAssembliesState, libraryUpdates } = await import("../../src/lib/assemblies/projectState.ts");
  const starter = sanitizeAssemblyDefinitions(["us-typicals-v1.json", "us-hookups-v1.json"]
    .flatMap((f) => JSON.parse(readFileSync(join(STARTER_DIR, f), "utf8")).assemblies)).assemblies;
  const hookup = starter.find((a) => a.id === "hookup-air-handler")!;
  assert.ok(hookup.lines.some((l) => l.kind === "assembly" && l.ref), "the hook-up references a sub-assembly");
  const clone = cloneForEdit(hookup, starter);
  const back = equipmentAssembliesOf(JSON.parse(JSON.stringify(withEquipmentAssemblies([], [clone]))));
  assert.deepEqual(back.map((a) => `${a.id}@${a.version}`), [`hookup-air-handler@${clone.version}`]);
  const { library, rejected } = combinedLibrary(starter, back);
  assert.deepEqual(rejected, []);
  const pinned = { ...emptyAssembliesState(), pinned: [hookup] };
  assert.deepEqual(libraryUpdates(pinned, library).map((u) => `${u.id} ${u.from}->${u.to}`), [`hookup-air-handler 1->${clone.version}`]);
  // A reference nothing holds is kept as saved, and refused, with its
  // reason, where the whole library is known.
  const broken = { ...clone, version: "1.2", lines: clone.lines.map((l) => (l.kind === "assembly" ? { ...l, ref: { id: "no-such-hookup" } } : l)) };
  const kept = equipmentAssembliesOf(withEquipmentAssemblies([], [broken]));
  assert.equal(kept.length, 1);
  assert.match(combinedLibrary(starter, kept).rejected[0].errors[0], /no assembly "no-such-hookup"/);
  // The gate everywhere else still resolves references among what it is given.
  assert.match(sanitizeAssemblyDefinitions([broken]).rejected[0].errors[0], /no assembly "no-such-hookup"/);
});
