// linear/assemblyLibrary.ts — sanitizeAssemblyLibrary + SEED_ASSEMBLIES
// (#linear-takeoff WP2.4). Same load-gate contract as
// sanitizeMaterialLibrary (materials.test.ts's own precedent): a
// non-array input is [], a malformed item is dropped, a duplicate id keeps
// only the first, and a well-formed library round-trips unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeAssemblyLibrary, SEED_ASSEMBLIES } from "../../src/lib/linear/assemblyLibrary.ts";

test("non-array records sanitize to []", () => {
  for (const raw of [undefined, null, 42, "asm_1", {}, { id: "asm_1" }]) {
    assert.deepEqual(sanitizeAssemblyLibrary(raw as never), [], String(raw));
  }
});

test("malformed items are dropped: needs a plain object with a non-empty string id", () => {
  const raw = [
    { id: "asm_1", family: "duct_rect", name: "OK", per_ft: [], per_vertex: [], per_run: [] },
    { name: "no id" },
    { id: "", name: "empty id" },
    { id: "asm_2", name: 42 }, // non-string name falls back to id, not dropped
    "not an object",
    null,
  ];
  const out = sanitizeAssemblyLibrary(raw as never);
  assert.deepEqual(out.map((a) => a.id), ["asm_1", "asm_2"]);
  assert.equal(out[1].name, "asm_2", "a non-string name falls back to the row's own id, same as sanitizeMaterialLibrary's minimal contract");
});

test("duplicate ids: first wins, later duplicates dropped", () => {
  const raw = [
    { id: "asm_1", name: "First", per_ft: [], per_vertex: [], per_run: [] },
    { id: "asm_1", name: "Second (dup, dropped)", per_ft: [], per_vertex: [], per_run: [] },
  ];
  const out = sanitizeAssemblyLibrary(raw as never);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "First");
});

test("per_ft/per_vertex/per_run default to [] when missing or malformed, never throw", () => {
  const out = sanitizeAssemblyLibrary([{ id: "asm_1", name: "Bare", per_ft: "nope", per_vertex: null }] as never);
  assert.deepEqual(out[0].per_ft, []);
  assert.deepEqual(out[0].per_vertex, []);
  assert.deepEqual(out[0].per_run, []);
});

test("deduct_fittings and allowances pass through only when well-typed", () => {
  const out = sanitizeAssemblyLibrary([
    { id: "a", name: "A", per_ft: [], per_vertex: [], per_run: [], deduct_fittings: true, allowances: { scrap_pct: 10 } },
    { id: "b", name: "B", per_ft: [], per_vertex: [], per_run: [], deduct_fittings: "yes", allowances: "nope" },
  ] as never);
  assert.equal(out[0].deduct_fittings, true);
  assert.deepEqual(out[0].allowances, { scrap_pct: 10 });
  assert.equal("deduct_fittings" in out[1], false);
  assert.equal("allowances" in out[1], false);
});

test("SEED_ASSEMBLIES: every entry has a unique id and sanitizes unchanged", () => {
  const ids = SEED_ASSEMBLIES.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate seed ids");
  const round = sanitizeAssemblyLibrary(JSON.parse(JSON.stringify(SEED_ASSEMBLIES)));
  assert.equal(round.length, SEED_ASSEMBLIES.length);
  for (const a of SEED_ASSEMBLIES) assert.ok(a.provenance && a.provenance.length > 0, `${a.id} carries a provenance string`);
});

test("SEED_ASSEMBLIES: the duct assemblies pin no fixed gauge, matching plan §5.5's lookup(pressure_class, max(W,H)) default", () => {
  for (const a of SEED_ASSEMBLIES.filter((x) => x.family === "duct_rect" || x.family === "duct_round")) {
    const ductLbRule = a.per_ft.find((r) => r.item === "duct_lb");
    assert.ok(ductLbRule, `${a.id} carries a duct_lb rule`);
    assert.equal("gauge" in (ductLbRule as object), false, `${a.id} must not pin a fixed gauge — that would silently override the per-segment lookup`);
  }
});
