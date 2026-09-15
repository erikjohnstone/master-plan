// GEMINI-VECTOR-SYMBOL-GROUNDING-GOAL.md Phase 7 requirement 6 — Legend
// Learn's own "accepted legend row creates a reference candidate, not a
// count" integration.
import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptLegendReference, acceptLegendReferences } from "../src/lib/legendReferenceAcceptance.ts";
import type { LegendReferenceEntry } from "../src/lib/legendReferenceBank.ts";

const entry = (overrides: Partial<LegendReferenceEntry> = {}): LegendReferenceEntry => ({
  caption: "V-1", captionBbox: [[0, 0], [10, 5]], rect: [[0, 0], [20, 20]],
  kind: "symbol", seedable: true, primitiveIds: [1, 2, 3], signature: null,
  ...overrides,
});

test("acceptLegendReference: a seedable entry is accepted, and the family binding records caption plus any supplied schema/tag evidence -- never compressed into one confidence", () => {
  const source = entry();
  const result = acceptLegendReference(source, { schemaEvidence: "M0.1 valve schedule", tagEvidence: "V-1 drawn on M2.1" });
  assert.equal(result.refusalReason, null);
  assert.ok(result.accepted);
  assert.deepEqual(result.accepted!.familyBinding, { caption: "V-1", schemaEvidence: "M0.1 valve schedule", tagEvidence: "V-1 drawn on M2.1" });
  assert.equal(result.accepted!.entry, source, "the entry itself is passed through unchanged, never copied or mutated");
});

test("acceptLegendReference: missing evidence is honestly null, never fabricated or defaulted to a truthy placeholder", () => {
  const result = acceptLegendReference(entry());
  assert.deepEqual(result.accepted!.familyBinding, { caption: "V-1", schemaEvidence: null, tagEvidence: null });
});

test("acceptLegendReference: a NONSEEDABLE entry is refused outright, with no accepted reference at all -- 'unsafe/nonseedable rows remain unavailable for automatic sweep'", () => {
  const result = acceptLegendReference(entry({ seedable: false }));
  assert.equal(result.accepted, null);
  assert.equal(result.refusalReason, "not-seedable");
});

test("acceptLegendReference: a nonseedable entry CANNOT be forced through by supplying strong evidence -- the seedable gate is never overridable by a caller", () => {
  const result = acceptLegendReference(entry({ seedable: false }), { schemaEvidence: "strong match", tagEvidence: "strong match" });
  assert.equal(result.accepted, null, "no amount of supplied evidence overrides the seedable gate");
});

test("acceptLegendReference: the accepted reference carries the entry's own real primitiveIds/signature -- an identity candidate, never a count (the result shape has no quantity field at all)", () => {
  const result = acceptLegendReference(entry({ primitiveIds: [4, 5, 6, 7] }));
  assert.deepEqual(result.accepted!.entry.primitiveIds, [4, 5, 6, 7]);
  assert.deepEqual(Object.keys(result.accepted!), ["entry", "familyBinding"], "no quantity/count field exists anywhere on an accepted reference");
});

test("acceptLegendReferences: two DIFFERENT real variants sharing the SAME caption are accepted as two SEPARATE references, never merged/deduped into one", () => {
  const variantA = entry({ primitiveIds: [1, 2, 3] });
  const variantB = entry({ primitiveIds: [10, 11, 12], rect: [[100, 100], [120, 120]] });
  const results = acceptLegendReferences([variantA, variantB]);
  assert.equal(results.length, 2);
  assert.notDeepEqual(results[0].accepted!.entry.primitiveIds, results[1].accepted!.entry.primitiveIds);
  assert.equal(results[0].accepted!.familyBinding.caption, "V-1");
  assert.equal(results[1].accepted!.familyBinding.caption, "V-1");
});

test("acceptLegendReferences: a mix of seedable and nonseedable rows resolves each independently -- one refusal never blocks or contaminates the others", () => {
  const results = acceptLegendReferences([entry({ seedable: true }), entry({ seedable: false }), entry({ seedable: true })]);
  assert.deepEqual(results.map((r) => r.refusalReason), [null, "not-seedable", null]);
});

test("acceptLegendReferences: evidenceFor is called once per entry, letting a caller attach different per-entry evidence -- never one evidence blob applied to every row", () => {
  const a = entry({ caption: "V-1" });
  const b = entry({ caption: "V-2" });
  const results = acceptLegendReferences([a, b], (e) => ({ schemaEvidence: `schema for ${e.caption}` }));
  assert.equal(results[0].accepted!.familyBinding.schemaEvidence, "schema for V-1");
  assert.equal(results[1].accepted!.familyBinding.schemaEvidence, "schema for V-2");
});
