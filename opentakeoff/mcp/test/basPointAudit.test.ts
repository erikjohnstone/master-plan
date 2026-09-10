import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('point audit requires grounding for every expected nonempty cell, not only present boxes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bas-point-audit-'));
  const bytes = Buffer.from('Controlled checksum fixture, not a real source PDF');
  const write = (name: string, data: unknown) => writeFileSync(join(dir, name), JSON.stringify(data));
  try {
    const pdf = join(dir, 'checksum-fixture.pdf'); writeFileSync(pdf, bytes);
    write('document_manifest.json', { source_sha256: createHash('sha256').update(bytes).digest('hex'), module_sources: { points: ['points'] } });
    write('points.json', { tables: [{ id: 'fixture', page: 1, columns: 'TAG|AI', rows: ['1|X'], x_edges: [0, 10, 20], y_ranges: [[10, 20]] }] });
    write('baseline.json', { tables: [] });
    const table = { sheet: 'checksum-fixture.pdf', title: { text: 'POINT LIST' }, region: [0, 20, 40, 40], headers: ['TAG', 'AI'],
      rows: [{ key: '1', cells: { TAG: { text: '1', bbox: [0, 20, 20, 40] }, AI: { text: 'X', bbox: [20, 20, 40, 40] as number[] | null } } }] };
    const run = () => {
      write('candidate.json', { tables: [table] });
      const proc = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/audit-bas-point-matrices.mjs', import.meta.url)),
        dir, pdf, join(dir, 'baseline.json'), join(dir, 'candidate.json'), '2', join(dir, 'report.json')], { encoding: 'utf8' });
      return { status: proc.status, report: JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) };
    };
    assert.equal(run().status, 0);
    table.rows[0].cells.AI.bbox = null;
    const missing = run();
    assert.equal(missing.status, 1);
    assert.ok(missing.report.after[0].errors.some((e: { kind: string }) => e.kind === 'cell_box_missing_or_invalid'));
    table.rows[0].cells.AI.bbox = [1, 1, 2, 2];
    assert.equal(run().status, 1, 'outside source-cell region');
    table.rows[0].cells.AI.bbox = [40, 40, 20, 20];
    assert.equal(run().status, 1, 'inverted box must not pass just because its center is inside');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
