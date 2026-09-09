import test from "node:test";
import assert from "node:assert/strict";
import { basResultForCanvas } from "../src/lib/basBrowserResult.js";

test("BAS source navigation maps uploaded file identity without changing legacy data or quantities", () => {
  const hash = 'a'.repeat(64);
  const key = `${hash}.pdf#7`;
  const cite = { sheet_id: key, bbox_px: [10, 20, 30, 40], text: key, column: 'AI' };
  const compiled = { totals: { AI: 10 }, categories: { original: { sheet: key, rows: [1, 2] } },
    bas_math: { physical_total: { AI: 3, AO: 0, DI: 0, DO: 1 },
      points: [{ point_id: 'p', group_id: 'table-server-identity', evidence: [cite] }],
      diagnostics: [{ evidence: [{ ...cite }] }] } };
  const legacy = JSON.stringify(compiled.categories);
  const result = basResultForCanvas(compiled, new Map([[hash, 'real-plan.pdf']]));
  assert.equal(result, compiled);
  assert.equal(cite.sheet_id, 'real-plan.pdf#7');
  assert.deepEqual(cite.bbox_px, [10, 20, 30, 40]);
  assert.equal(cite.text, key);
  assert.equal(result.bas_math.diagnostics[0].evidence[0].sheet_id, 'real-plan.pdf#7');
  assert.equal(result.bas_math.points[0].group_id, 'table-server-identity');
  assert.deepEqual(result.bas_math.physical_total, { AI: 3, AO: 0, DI: 0, DO: 1 });
  assert.equal(JSON.stringify(result.categories), legacy);
  assert.deepEqual(result.totals, { AI: 10 });
});

test("non-BAS results and unknown upload identities are unchanged", () => {
  const result = { kind: 'hvac_equipment', categories: { a: { sheet: 'abc.pdf#2' } } };
  assert.equal(basResultForCanvas(result, new Map()), result);
  const bas = { bas_math: { points: [{ evidence: [{ sheet_id: `${'b'.repeat(64)}.pdf#1` }] }] } };
  const before = JSON.stringify(bas);
  basResultForCanvas(bas, new Map([['a'.repeat(64), 'different.pdf']]));
  assert.equal(JSON.stringify(bas), before);
});
