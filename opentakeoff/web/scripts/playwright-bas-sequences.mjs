// Actual upload/compile/form/save/export/import. No injected domain results.
// Source selectors are independent development-fixture evidence, not production rules.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { basSequenceView } from '../src/lib/basReview.ts';
import { interpretBasSequences } from '../src/lib/basSequenceReconciliation.ts';
import { basEquipmentSummary } from '../src/lib/basEquipmentReview.ts';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_OUT, 'Real PDF and evidence directory required');
const out = resolve(process.env.OT_BAS_OUT);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5177';
const saved = p => p.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
async function upload(p) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await p.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 300000 });
  assert.equal(await p.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(p);
}
const regionFor = p => p.getByRole('region', { name: 'Sequences and comparison links', exact: true });
async function enter(p, regionId) {
  await p.locator('[data-workspace-nav="Takeoff"]').click();
  await p.getByRole('button', { name: 'Sequences & links', exact: true }).click();
  const r = regionFor(p);
  await r.getByLabel('Sequence', { exact: true }).selectOption(regionId);
  return r;
}
async function exportRecord(p, path) {
  const pending = p.waitForEvent('download');
  await regionFor(p).getByRole('button', { name: 'Export BAS evidence & history', exact: true }).click();
  await (await pending).saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
try {
  await upload(page);
  console.log('Uploaded actual PDF; compiling retained BAS sources');
  const responsePromise = page.waitForResponse(r => r.url().includes('/__ot/compile-corpus-takeoff'), { timeout: 120000 });
  const answer = await page.evaluate(() => window.__opentakeoff.compileCorpusTakeoff('bas_points', { download: false }));
  assert.equal(answer.error, undefined, JSON.stringify(answer));
  const wire = await (await responsePromise).text();
  writeFileSync(`${out}/compile-response.ndjson`, wire);
  const compiled = wire.trim().split('\n').map(JSON.parse).find(m => m.type === 'result')?.result;
  assert.ok(compiled?.bas_workflow, compiled?.bas_workflow_error);
  // The browser proxy uses content-addressed filenames. Compare its previous
  // verified wire output, not a differently named direct-CLI source file.
  const baseline = readFileSync(new URL('../../docs/bas-production/evidence/point-workspace-persistence-verified/compile-response.ndjson', import.meta.url), 'utf8')
    .trim().split('\n').map(JSON.parse).find(m => m.type === 'result').result;
  const withoutWorkflow = value => { const { bas_workflow: _workflow, bas_equipment: _equipment, ...rest } = value; return rest; };
  assert.deepEqual(withoutWorkflow(compiled), withoutWorkflow(baseline), 'Every legacy compile field remains exact');
  assert.deepEqual(compiled.bas_equipment, await basEquipmentSummary(compiled.bas_workflow, compiled.bas_workflow.current_capture_id), 'New equipment index agrees with its immutable capture');
  const capture = compiled.bas_workflow.captures[0];
  assert.equal(capture.narrative_sources.pages.length, 9);
  assert.equal(capture.points.matrices.length, 12);
  assert.equal(capture.points.matrices.reduce((n, m) => n + m.rows.length, 0), 193);
  const source = capture.narrative_sources;
  const sequence = interpretBasSequences(source).regions.find(r => r.page_id.endsWith(':p8') && r.title === 'DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE');
  assert.ok(sequence);
  const matrix = capture.points.matrices.find(m => m.page_id.endsWith(':p8'));
  assert.ok(matrix);
  const reference = source.pages.find(p => p.page_number === 8).spans[61];
  assert.equal(reference.text, 'DOAS 1 OR 2');
  await waitForAsync(async () => (await saved(page))?.current_capture_id === capture.capture_id, { label: 'initial browser capture save' });
  const beforeEdit = await saved(page);
  const browserCapture = structuredClone(capture);
  // Existing UI ingestion replaces ONLY the outer display filename. The raw
  // source snapshot, points and content identity must still match the wire.
  browserCapture.sources[0].names = [basename(process.env.OT_UI_PDF)];
  assert.deepEqual(beforeEdit.captures, [browserCapture]);
  await page.getByRole('button', { name: 'Sequences & links', exact: true }).click();
  let r = regionFor(page);
  await r.getByLabel('Sequence', { exact: true }).selectOption(sequence.region_id);
  assert.equal(await r.getByRole('table', { name: 'Source sequence clauses', exact: true }).locator(':scope > tbody > tr').count(), sequence.clauses.length);
  await r.getByLabel('Comparison point matrix').selectOption(matrix.matrix_id);
  await r.getByLabel('Find equipment reference').fill('DOAS 1 OR 2');
  await r.getByLabel('Equipment reference source').selectOption(reference.span_id);
  await r.getByLabel('Reference tag', { exact: true }).fill('INVENTED-EQUIPMENT');
  await r.getByLabel('Association reason').fill('Controlled UI verification using original M-512 evidence; not an approved takeoff.');
  await r.getByRole('button', { name: 'Save comparison link', exact: true }).click();
  await r.getByRole('alert').waitFor();
  assert.equal((await saved(page))?.review_events?.length || 0, 0, 'Invalid reference cannot create history');
  await r.getByLabel('Reference tag', { exact: true }).fill('DOAS 1 OR 2');
  await r.getByRole('button', { name: 'Save comparison link', exact: true }).focus();
  await page.keyboard.press('Enter');
  const table = r.getByRole('table', { name: 'SOO and point-list comparison', exact: true });
  await table.waitFor();
  assert.equal(await table.locator('tbody tr').count(), 3);
  assert.equal(await table.getByText('Listed — applicability and wiring unverified', { exact: true }).count(), 2);
  assert.equal(await table.getByText('Not listed in selected matrix', { exact: true }).count(), 1);
  await waitForAsync(async () => (await saved(page))?.review_events?.length === 1, { label: 'review autosave' });
  const reviewed = await saved(page);
  assert.deepEqual(reviewed.captures, beforeEdit.captures);
  assert.equal(reviewed.review_events[0].origin, 'operator_input');
  assert.deepEqual((await basSequenceView(reviewed, reviewed.current_capture_id)).comparisons[0].requirements.map(q => q.status), ['listed', 'listed', 'not_listed_in_selected_matrix']);
  console.log('Actual form: invalid source rejected; valid keyboard submission saved; comparison exact');
  if (!await r.getByLabel('Association reason').isVisible()) await r.locator('summary').filter({ hasText: 'Link a point list and equipment reference' }).click();
  await r.getByLabel('Association reason').fill('Retain this unsaved follow-up reason while inspecting the drawing');
  const prose = r.getByRole('region', { name: 'Original sequence text', exact: true });
  await prose.evaluate(el => { el.scrollTop = 120; });
  const scrollBefore = await prose.evaluate(el => el.scrollTop);
  await r.getByRole('button', { name: 'View reference on drawing', exact: true }).click();
  await r.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await r.waitFor();
  assert.equal(await r.getByLabel('Sequence', { exact: true }).inputValue(), sequence.region_id);
  assert.equal(await r.getByLabel('Association reason').inputValue(), 'Retain this unsaved follow-up reason while inspecting the drawing');
  assert.equal(await prose.evaluate(el => el.scrollTop), scrollBefore);
  await r.locator('summary').filter({ hasText: 'Link a point list and equipment reference' }).click();
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
      await table.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${theme}-${width}-comparison.png` });
    }
  }
  const exported = await exportRecord(page, `${out}/reviewed.takeoff.json`);
  assert.deepEqual(exported.bas_workflow, reviewed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  r = await enter(page, sequence.region_id);
  await r.getByRole('table', { name: 'SOO and point-list comparison', exact: true }).waitFor();
  assert.deepEqual(await exportRecord(page, `${out}/reloaded.takeoff.json`), exported);
  console.log('Source return, themes, autosave, reload and actual export passed');
  const imported = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  imported.on('pageerror', e => errors.push(String(e)));
  await upload(imported);
  assert.equal(await saved(imported), undefined);
  await imported.locator('input[name="takeoff-import"]').setInputFiles(`${out}/reviewed.takeoff.json`);
  await waitForAsync(async () => (await saved(imported))?.review_events?.length === 1, { label: 'fresh-context history import' });
  assert.deepEqual(await saved(imported), reviewed);
  const ir = await enter(imported, sequence.region_id);
  await ir.getByRole('table', { name: 'SOO and point-list comparison', exact: true }).waitFor();
  await ir.getByLabel('Removal reason for DOAS 1 OR 2', { exact: true }).fill('Withdraw this controlled test association; preserve source and previous decision');
  await ir.getByRole('button', { name: 'Remove comparison link', exact: true }).click();
  await waitForAsync(async () => (await saved(imported))?.review_events?.length === 2, { label: 'removal autosave' });
  const removed = await saved(imported);
  assert.deepEqual(removed.captures, reviewed.captures);
  assert.deepEqual(removed.review_events[0], reviewed.review_events[0]);
  assert.equal(removed.review_events[1].action.kind, 'remove');
  assert.equal((await basSequenceView(removed, removed.current_capture_id)).comparisons.length, 0);
  await exportRecord(imported, `${out}/removed.takeoff.json`);
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, capture_id: reviewed.current_capture_id,
    workflow_bytes: Buffer.byteLength(JSON.stringify(reviewed)), wire_bytes: Buffer.byteLength(wire),
    clauses: sequence.clauses.length, comparisons: 3, listed: 2, not_listed: 1,
    checks: ['real compile/legacy exact parity', 'all raw clauses retained', 'invalid reference rejected', 'keyboard create', 'shared comparison parity', 'source paint/return/draft/scroll', 'both themes/two widths', 'autosave', 'reload/export exact parity', 'fresh-context import', 'removal retains original evidence and event'], errors }, null, 2));
  console.log('Real sequence workflow passed');
} catch (e) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally { await browser.close(); }
