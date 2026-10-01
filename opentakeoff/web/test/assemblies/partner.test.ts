// ASSEMBLIES WP9 — the partner's own cost and labor fields (src/lib/assemblies/partner.ts):
// extended by the line's quantity, summed by labor category, labelled "partner-entered", and
// nothing when the library carries none (decision D14).
import test from "node:test";
import assert from "node:assert/strict";
import { extendedOf, partnerSummary, PARTNER_ENTERED } from "../../src/lib/assemblies/partner.ts";
import type { ExpandedLine } from "../../src/lib/assemblies/schema.ts";

const line = (over: Partial<ExpandedLine>): ExpandedLine => ({
  tag: "X-1", family: "PUMP", layer: "hookup", scope: { building: null, floor: null, system: null }, rule: "a@1:l", kind: "component",
  label: null, role: { vocab: "ot", id: "isolation-valve" }, io: null, device_role_ref: null, unit: "ea", qty_base: 2, qty_with_waste: 2,
  waste_pct: 0, round: null, params: {}, responsibility: {}, trade: "mechanical", labor_task: null, status: "ok", missing: [],
  qty_source: "evidence", cites: [], source: { ref: "r", license: "l", derivation: "inferred" }, ...over,
});

test("extended cost is the quantity with waste × unit cost; hours the installed quantity × hours", () => {
  assert.deepEqual(extendedOf(line({ partner: { unit_cost: 3, hours: 0.5 } })), { cost: 6, hours: 1 });
  // Wire with 10% waste: the waste is bought, not installed.
  assert.deepEqual(extendedOf(line({ unit: "ft", qty_base: 100, qty_with_waste: 110, waste_pct: 10, partner: { unit_cost: 0.1, hours: 0.01 } })), { cost: 11, hours: 1 });
  // A figure the partner did not give stays null; so does a line whose quantity is not known.
  assert.deepEqual(extendedOf(line({ partner: { part_no: "P" } })), { cost: null, hours: null });
  assert.deepEqual(extendedOf(line({ status: "unresolved", qty_base: null, qty_with_waste: null, partner: { unit_cost: 3, hours: 1 } })), { cost: null, hours: null });
  assert.deepEqual(extendedOf(line({})), { cost: null, hours: null });
});

test("the summary: costs summed, hours by labor category, lines that could not be extended counted", () => {
  assert.equal(partnerSummary([line({}), line({})]), null, "no partner field anywhere: no summary");
  const s = partnerSummary([
    line({ partner: { unit_cost: 10, hours: 1, labor_category: "pipefitter" } }),
    line({ qty_base: 1, qty_with_waste: 1, partner: { unit_cost: 5, hours: 0.5, labor_category: "pipefitter" } }),
    line({ qty_base: 3, qty_with_waste: 3, partner: { hours: 2, labor_category: "electrician" } }),
    line({ status: "replaced", qty_base: null, qty_with_waste: null, partner: { unit_cost: 99, hours: 9 } }),
    line({ partner: { part_no: "ONLY-A-PART" } }),
    line({}),
  ]);
  assert.deepEqual(s, {
    label: PARTNER_ENTERED,
    lines: 5,
    extended_cost: 25,
    costed_lines: 2,
    hours: [{ labor_category: "electrician", extended_hours: 6, lines: 1 }, { labor_category: "pipefitter", extended_hours: 2.5, lines: 2 }],
    not_extended: 1,
  });
  assert.equal(PARTNER_ENTERED, "partner-entered");
});
