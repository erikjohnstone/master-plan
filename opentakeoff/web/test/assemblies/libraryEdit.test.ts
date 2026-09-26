// ASSEMBLIES WP5.4 — the library an estimator edits (src/lib/assemblies/libraryEdit.ts):
// the starter is read-only, a clone is the partner's next version, live validation runs the
// library gate in the context of the whole library, and the override tint is the per-item diff.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cloneForEdit, combinedLibrary, overridesOf, validateEdit } from "../../src/lib/assemblies/libraryEdit.ts";
import { sanitizeAssemblyDefinitions } from "../../src/lib/assemblies/schema.ts";
import { latest } from "../../src/lib/assemblies/select.ts";
import { STARTER_DIR } from "../../scripts/assemblies-starter/build.mts";

const STARTER = sanitizeAssemblyDefinitions([
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-typicals-v1.json"), "utf8")).assemblies,
  ...JSON.parse(readFileSync(join(STARTER_DIR, "us-hookups-v1.json"), "utf8")).assemblies,
]).assemblies;
const fcu = STARTER.find((a) => a.id === "fcu")!;

test("clone: same id, the next version above every version of it, status partner_edited; it then wins latest()", () => {
  const c1 = cloneForEdit(fcu, STARTER);
  assert.deepEqual([c1.id, c1.version, c1.status], ["fcu", "1.1", "partner_edited"]);
  const c2 = cloneForEdit(fcu, [...STARTER, c1]);
  assert.equal(c2.version, "1.2");
  assert.equal(latest([...STARTER, c1]).find((a) => a.id === "fcu")!.version, "1.1");
  c1.title = "changed";
  assert.notEqual(fcu.title, "changed", "a deep copy");
});

test("live validation: JSON, the gate's shape and expression checks, sub-assembly references against the library; the starter is read-only", () => {
  const good = cloneForEdit(fcu, STARTER);
  assert.deepEqual(validateEdit(JSON.stringify(good), STARTER).errors, []);
  assert.match(validateEdit("{", STARTER).errors[0], /not JSON/);
  assert.match(validateEdit(JSON.stringify(fcu), STARTER).errors[0], /read-only/);
  const badExpr = { ...good, applies_to: { ...good.applies_to, selector: "attr.no_such_attribute = 'x'" } };
  assert.match(validateEdit(JSON.stringify(badExpr), STARTER).errors.join("\n"), /no_such_attribute/);
  // A hook-up whose sub-assembly reference names nothing in the library.
  const hook = STARTER.find((a) => a.lines.some((l) => l.kind === "assembly" && l.ref))!;
  const clone = cloneForEdit(hook, STARTER);
  const sub = clone.lines.find((l) => l.kind === "assembly" && l.ref)!;
  sub.ref = { id: "no-such-part" };
  assert.match(validateEdit(JSON.stringify(clone), STARTER).errors.join("\n"), /no assembly "no-such-part"/);
  sub.ref = { id: hook.lines.find((l) => l.kind === "assembly" && l.ref)!.ref!.id };
  assert.deepEqual(validateEdit(JSON.stringify(clone), STARTER).errors, [], "resolves against the starter");
});

test("override tint: what a partner record changes of the starter it came from", () => {
  const c = cloneForEdit(fcu, STARTER);
  assert.deepEqual(overridesOf(c, STARTER), { origin: "fcu@1", fields: [], options: [], variables: [], lines: [] }, "version and status are not overrides");
  c.options = c.options.map((o) => (o.id === "setpoint_adjust" ? { ...o, default: false } : o));
  c.lines = c.lines.slice(1);
  c.title = "FCU (partner)";
  const t = overridesOf(c, STARTER)!;
  assert.deepEqual(t.fields, ["title"]);
  assert.deepEqual(t.options, [{ id: "setpoint_adjust", change: "changed", fields: ["default"] }]);
  assert.deepEqual(t.lines, [{ id: fcu.lines[0].id, change: "removed" }]);
  assert.equal(overridesOf({ ...c, id: "brand-new" }, STARTER), null, "no starter record: nothing to tint");
});

test("the combined library: one gate over the starter and the partner's records", () => {
  const c = cloneForEdit(fcu, STARTER);
  const { library, rejected } = combinedLibrary(STARTER, [c, { ...c, version: "bad version!" }]);
  assert.ok(library.some((a) => a.id === "fcu" && a.version === "1.1"));
  assert.ok(rejected.length >= 1, "the malformed record is refused with its reasons");
});
