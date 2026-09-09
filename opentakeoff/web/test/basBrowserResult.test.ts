import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from 'node:fs';
import { basResultForCanvas } from "../src/lib/basBrowserResult.js";
import { basPointListsSchema } from '../src/lib/basPointLists.ts';

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

test('real point evidence survives browser spool remapping with only navigation aliases changed', () => {
  const capture = JSON.parse(readFileSync(new URL('../../docs/bas-production/evidence/fort-sam-point-production-compile.json', import.meta.url), 'utf8'));
  const points = basPointListsSchema.parse(capture.bas_point_lists);
  const hash = points.matrices[0].source_id!.slice('sha256:'.length);
  // Controlled upload-spool aliases around the retained real result.
  for (const matrix of points.matrices) {
    const page = Number(matrix.page_id!.split(':p')[1]);
    const spool = `${hash}.pdf${page === 1 ? '' : '#' + page}`;
    matrix.raw.sheet = spool;
    const sources = [...matrix.header_sources, ...matrix.notes.map(n => n.source),
      ...matrix.rows.flatMap(r => [...r.observations.map(o => o.source), ...r.qualifiers.map(n => n.source)])];
    sources.forEach(s => { s.sheet_key = spool; });
  }
  const before = structuredClone(points);
  const compiled = { bas_point_lists: points, totals: { rows: 0 } };
  const result = basResultForCanvas(compiled, new Map([[hash, 'user-plan.pdf']]));
  const mapped = basPointListsSchema.parse(result.bas_point_lists);
  for (let i = 0; i < mapped.matrices.length; i++) {
    const matrix = mapped.matrices[i], original = before.matrices[i];
    assert.equal(matrix.matrix_id, original.matrix_id);
    assert.equal(matrix.page_id, original.page_id);
    assert.equal(matrix.source_id, original.source_id);
    assert.ok(matrix.raw.sheet.startsWith('user-plan.pdf#'));
    assert.deepEqual(matrix.raw.rows, original.raw.rows);
    for (let j = 0; j < matrix.rows.length; j++) {
      assert.equal(matrix.rows[j].row_id, original.rows[j].row_id);
      assert.deepEqual(matrix.rows[j].raw, original.rows[j].raw);
      for (let k = 0; k < matrix.rows[j].observations.length; k++) {
        const { sheet_key, ...source } = matrix.rows[j].observations[k].source;
        const { sheet_key: _spool, ...priorSource } = original.rows[j].observations[k].source;
        assert.equal(sheet_key, matrix.raw.sheet);
        assert.deepEqual(source, priorSource);
      }
    }
  }
  assert.deepEqual(result.totals, { rows: 0 });
});

test('malformed point record is unavailable without discarding valid legacy output', () => {
  const compiled = { categories: { original: true }, bas_point_lists: { matrices: [] } };
  const result = basResultForCanvas(compiled, new Map());
  assert.deepEqual(result.categories, { original: true });
  assert.equal(result.bas_point_lists.status, 'unavailable');
});
