// ASSEMBLIES WP1: the canonical attribute schema (plan §8.5) on its own terms.
// The cross-check against the committed keys (GATE 1) lives in
// mcp/test/assembliesSchema.test.mjs, beside the key tooling it reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASSEMBLY_FAMILIES,
  ATTRIBUTES,
  familyAttributes,
  attributeSpec,
  unitFactor,
  toCanonical,
  validateAttributeSchema,
} from "../../src/lib/assemblies/attributes.ts";

test("WP1: the schema validates against its own zod shape and covers the 30 equipment families", () => {
  assert.doesNotThrow(() => validateAttributeSchema());
  assert.equal(ASSEMBLY_FAMILIES.length, 30);
  for (const family of ASSEMBLY_FAMILIES) {
    const attrs = familyAttributes(family);
    for (const loc of ["building", "floor", "area_served"]) assert.ok(attrs.all.includes(loc), `${family} lacks ${loc}`);
    assert.equal(new Set(attrs.all).size, attrs.all.length, `${family} lists an attribute twice`);
    for (const id of attrs.all) assert.ok(ATTRIBUTES[id], `${family}.${id} has no spec`);
  }
  assert.throws(() => familyAttributes("GRD"), /not an assemblies equipment family/);
});

test("WP1: every attribute has a definition line and an example, or says why none is printed", () => {
  for (const [id, spec] of Object.entries(ATTRIBUTES)) {
    assert.ok(spec.definition.length >= 20 && !spec.definition.includes("\n"), `${id}: one definition line`);
    if (spec.example === null) assert.ok(spec.noExampleReason && spec.noExampleReason.length > 10, `${id}: example or reason`);
    else assert.ok(spec.example.set && spec.example.header, `${id}: example names its document and printed header`);
  }
});

test("WP1: units convert within a dimension and never across one", () => {
  assert.equal(toCanonical("heating_mbh", 48400, "BTU/H"), 48.4);
  assert.equal(toCanonical("heating_mbh", 26, "MBH"), 26);
  assert.equal(toCanonical("eh_kw", 5000, "W"), 5);
  assert.ok(Math.abs(toCanonical("motor_hp", 745.7, "W") - 1) < 1e-12);
  assert.ok(Math.abs(toCanonical("motor_watts", 0.25, "hp") - 186.425) < 1e-9);
  assert.equal(toCanonical("esp_in", 1, "ft"), 12);
  assert.equal(toCanonical("phase", 3, ""), 3);
  assert.equal(unitFactor("cfm", "cfm"), 1);
  assert.throws(() => toCanonical("heating_mbh", 5, "hp"), /does not accept unit "hp"/);
  assert.throws(() => toCanonical("cfm", 500, "gpm"), /does not accept unit "gpm"/);
  // Temperatures are never scaled: °C would need an offset, and the keys type SI columns "-".
  assert.throws(() => toCanonical("hw_ewt_f", 60, "C"), /does not accept unit "C"/);
  assert.throws(() => toCanonical("vfd", 1, ""), /is not a number attribute/);
  assert.throws(() => toCanonical("no_such_attribute", 1, ""), /unknown canonical attribute/);
});

test("WP1: enums are closed lists and number attributes carry a canonical unit", () => {
  for (const [id, spec] of Object.entries(ATTRIBUTES)) {
    if (spec.kind === "enum") {
      assert.ok(spec.values && spec.values.length >= 2, `${id}: enum lists its values`);
      for (const v of spec.values) assert.match(v, /^[a-z][a-z0-9_]*$/, `${id}: canonical enum value ${v}`);
    } else assert.equal(spec.values, undefined, `${id}: only enums list values`);
    if (spec.kind === "number" || spec.kind === "size") assert.ok(typeof spec.unit === "string", `${id}: unit`);
    else assert.equal(spec.unit, null, `${id}: no unit on a ${spec.kind}`);
  }
  assert.deepEqual(attributeSpec("vfd").values, ["yes", "no"]);
  assert.equal(attributeSpec("inlet_size_in").kind, "size");
});

test("WP1: extensions (AS-12, AS-13) are marked unkeyed and never shadow a keyed attribute", () => {
  let extensions = 0;
  for (const family of ASSEMBLY_FAMILIES) {
    const { keyed, extensions: ext } = familyAttributes(family);
    for (const id of ext) {
      assert.ok(!keyed.includes(id), `${family}.${id} is both keyed and an extension`);
      extensions++;
    }
  }
  assert.ok(extensions > 0);
  assert.ok(familyAttributes("VAV").extensions.includes("fan_cfm"));
  assert.ok(familyAttributes("FCU").extensions.includes("cooling_mbh"));
});
