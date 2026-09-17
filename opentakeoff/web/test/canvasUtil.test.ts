// instantiateTemplate's routed-system fields (#linear-takeoff WP1.2, plan
// §7.2, decision D1): family/system/size/assembly_id are additive — a
// flooring template never gains them, a routed-system template's `size`
// is deep-copied so no two instantiated conditions ever alias the same
// object (the existing grout/roll_setup precedent this mirrors).
import { test } from "node:test";
import assert from "node:assert/strict";
import { instantiateTemplate, isRoutedCond } from "../src/lib/canvasUtil.js";

test("instantiateTemplate: a flooring template gains none of the routed-system fields", () => {
  const c: any = instantiateTemplate({ finish_tag: "LVT-1", color: "#123456", hatch: "plank", waste_pct: 8 });
  assert.equal(c.finish_tag, "LVT-1");
  assert.equal(c.family, undefined);
  assert.equal(c.system, undefined);
  assert.equal(c.size, undefined);
  assert.equal(c.assembly_id, undefined);
});

test("instantiateTemplate: a routed-system template carries family/system/size/assembly_id, size deep-copied", () => {
  const size = { kind: "rect", w_in: 12, h_in: 6 };
  const template = { finish_tag: "SA 12x6", color: "#222", hatch: "solid", waste_pct: 10,
    family: "duct_rect", system: "SA", size, assembly_id: "asm-duct-rect-2wg-r6" };
  const a: any = instantiateTemplate(template);
  const b: any = instantiateTemplate(template);
  assert.equal(a.family, "duct_rect");
  assert.equal(a.system, "SA");
  assert.deepEqual(a.size, size);
  assert.equal(a.assembly_id, "asm-duct-rect-2wg-r6");
  assert.ok(a.size !== size, "the template's own size object is never aliased into the instance");
  assert.ok(a.size !== b.size, "two conditions instantiated from the same template never share one size object");
  a.size.w_in = 999;
  assert.equal(b.size.w_in, 12, "mutating one instance's size never leaks into a sibling instance or the template");
});

test("isRoutedCond: true when system OR family is set, false for a plain flooring condition and for nothing at all", () => {
  assert.equal(isRoutedCond({ system: "SA" }), true);
  assert.equal(isRoutedCond({ family: "duct_rect" }), true);
  assert.equal(isRoutedCond({ system: "SA", family: "duct_rect" }), true);
  assert.equal(isRoutedCond({ finish_tag: "CPT-1" }), false);
  assert.equal(isRoutedCond({}), false);
  assert.equal(isRoutedCond(null), false);
  assert.equal(isRoutedCond(undefined), false);
});

test("instantiateTemplate: ids/timestamps still mint fresh and the flooring fields still default, unchanged by this addition", () => {
  const a: any = instantiateTemplate({ finish_tag: "CPT-1" });
  const b: any = instantiateTemplate({ finish_tag: "CPT-1" });
  assert.notEqual(a.id, b.id);
  assert.equal(a.multiplier, 1);
  assert.equal(a.waste_pct, 0);
  assert.equal(a.hatch, "solid");
});
