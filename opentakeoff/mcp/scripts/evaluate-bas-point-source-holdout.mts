/** Final blind diagnostic for the source-span point recovery path only. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Session } from '../src/session.ts';
import { runBasPointLists } from '../src/basMath.ts';

const [inventoryPath, groundTruthRoot, outputDir, requestedId, requestedMode = 'blind'] = process.argv.slice(2);
if (!inventoryPath || !groundTruthRoot || !outputDir || !requestedId) {
  throw new Error('usage: evaluate-bas-point-source-holdout.mts INVENTORY GROUND_TRUTH_ROOT OUTPUT_DIR DOCUMENT_ID [blind|regression]');
}
assert.ok(requestedMode === 'blind' || requestedMode === 'regression', 'Evaluation mode must be blind or regression');
const inventory = JSON.parse(await readFile(path.resolve(inventoryPath), 'utf8'));
const item = inventory.selected.find((entry: { id: string }) => entry.id === requestedId);
assert.ok(item, `Unknown inventory entry: ${requestedId}`);
if (requestedMode === 'blind') {
  assert.equal(item.split, 'new_workflow_holdout', 'Only a still-untouched reserve may use blind mode');
} else {
  assert.notEqual(item.split, 'new_workflow_holdout', 'Regression mode cannot open an untouched reserve');
}
const pdfPath = path.resolve(inventory.source_roots.collection, item.relative_path);
const recordPath = path.resolve(groundTruthRoot, 'records', `${item.id}.json`);
const bytes = await readFile(pdfPath), recordBytes = await readFile(recordPath);
const pdfHash = createHash('sha256').update(bytes).digest('hex');
const record = JSON.parse(recordBytes.toString('utf8'));
assert.equal(pdfHash, item.sha256);
assert.equal(record.source_sha256, item.sha256);
assert.equal(record.page_count, item.pages);

const expected = (Array.isArray(record.modules?.points?.tables) ? record.modules.points.tables : [])
  .map((table: Record<string, unknown>) => ({ page: Number(table.page),
    title: String(table.title ?? table.title_as_printed ?? ''),
    rows: Array.isArray(table.rows) ? table.rows.length : null }));
const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const pageNumber = (pageId: string | null) => Number(pageId?.match(/:p([1-9]\d*)$/)?.[1] ?? NaN);
const start = performance.now();
const session = new Session();
await session.loadPlan(pdfPath);
const sources = session.basSourcesForPipeline();
assert.equal(sources.documents[0].sha256, item.sha256);
assert.equal(sources.pages.length, item.pages);
const points = await runBasPointLists({ sources, tables: [] });
const actual = points.matrices.map(matrix => ({ matrix_id: matrix.matrix_id,
  page: pageNumber(matrix.page_id), title: matrix.raw.title?.text ?? '', rows: matrix.rows.length,
  physical_rows: matrix.rows.filter(row => row.observations.some(value => value.kind === 'declared_io')).length,
  software_rows: matrix.rows.filter(row => row.observations.some(value => value.kind === 'software_value')).length,
  issues: matrix.issues }));
const matches = expected.map(source => {
  const candidates = actual.filter(candidate => candidate.page === source.page
    && (normalize(candidate.title).includes(normalize(source.title))
      || normalize(source.title).includes(normalize(candidate.title))));
  return { expected: source, matched: candidates.length === 1,
    actual: candidates.length === 1 ? candidates[0] : null,
    exact_row_count: candidates.length === 1 && source.rows !== null ? candidates[0].rows === source.rows : null };
});
const matchedIds = new Set(matches.map(match => match.actual?.matrix_id).filter(Boolean));
const result = {
  schema_version: 'bas_point_source_holdout_v1', evaluated_utc: new Date().toISOString(),
  evaluation_role: requestedMode === 'blind' ? 'blind_final_source_path' : 'post_fix_source_path_regression',
  production_rules_frozen_before_open: requestedMode === 'blind',
  document: { id: item.id, rank: item.rank, title: item.title, pages: item.pages,
    bytes: bytes.byteLength, pdf_sha256: pdfHash,
    independent_record_sha256: createHash('sha256').update(recordBytes).digest('hex') },
  source_accounting: { pages: sources.pages.length,
    spans: sources.pages.reduce((sum, page) => sum + page.spans.length, 0),
    no_text_pages: sources.pages.filter(page => page.text_status === 'no_text').length },
  expected_tables: expected.length,
  expected_rows: expected.reduce((sum, table) => sum + (table.rows ?? 0), 0),
  actual_tables: actual.length,
  actual_rows: actual.reduce((sum, table) => sum + table.rows, 0),
  matches,
  unmatched_actual: actual.filter(table => !matchedIds.has(table.matrix_id)),
  duration_ms: Math.round(performance.now() - start),
  peak_rss_bytes: process.resourceUsage().maxRSS * 1024,
  boundary: 'Source-span recovery only; this does not run VectorGrid, prove installed quantity, or replace the full production-graph holdout.',
};
await mkdir(path.resolve(outputDir), { recursive: true });
const outputPath = path.resolve(outputDir, `${requestedMode === 'blind' ? 'source' : 'source-regression'}-${item.id}.json`);
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ output: outputPath, ...result }, null, 2));
