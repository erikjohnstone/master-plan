/** CONTROLLED source-derived pages, not an issued addendum or accuracy key.
 * Copy original vector pages without repainting their contents. Then compile
 * the derivative through the real shared Session/Python production pipeline. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { Session } from '../src/session.ts';
import { compileProductionTakeoff } from '../src/productionTakeoff.ts';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { shutdownVectorGrid } from '../../web/src/lib/vectorGridClient.ts';
const [sourcePath, outputDir, ...pageNumbers] = process.argv.slice(2);
assert.ok(sourcePath && outputDir && pageNumbers.length, 'Source, new output directory and 1-based page order required');
const out = resolve(outputDir); await mkdir(out);
const original = await PDFDocument.load(await readFile(sourcePath)), derivative = await PDFDocument.create();
const selected = pageNumbers.map(Number);
assert.ok(selected.every(n => Number.isInteger(n) && n >= 1 && n <= original.getPageCount()));
for (const page of await derivative.copyPages(original, selected.map(n => n - 1))) derivative.addPage(page);
derivative.setTitle('CONTROLLED TEST DERIVATIVE - not an issued drawing revision');
const path = join(out, 'controlled-reordered-source-pages.pdf'); await writeFile(path, await derivative.save());
const session = new Session(); await session.loadPlan(path);
try {
const start = performance.now(), graph = await session.graphForPipeline();
const compiled = await compileProductionTakeoff(session, graph, 'bas_points');
assert.ok(compiled.bas_workflow, 'Derivative must produce a real retained BAS capture');
await writeFile(join(out, 'controlled-revision.takeoff.json'), canonicalBasJson({ schema: 'opentakeoff.takeoff_canvas.v1',
  bas_workflow: compiled.bas_workflow }));
await writeFile(join(out, 'fixture-proof.json'), JSON.stringify({ fixture_kind: 'controlled_source_derived_page_reordering',
  source_path: resolve(sourcePath), original_page_count: original.getPageCount(), selected_original_pages: selected,
  derivative_path: path, derivative_source: compiled.bas_workflow.captures[0].sources,
  capture_id: compiled.bas_workflow.current_capture_id, compile_ms: performance.now() - start,
  matrices: compiled.bas_workflow.captures[0].points.matrices.length, actual_production_compile: true,
  real_issued_addendum: false, installed_quantity_proof: false }, null, 2));
console.log(JSON.stringify({ output: out, capture_id: compiled.bas_workflow.current_capture_id, pages: selected }));
} finally { shutdownVectorGrid(); }
