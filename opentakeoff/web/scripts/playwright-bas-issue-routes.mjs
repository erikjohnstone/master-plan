/** Actual original-PDF upload, ordinary archive import and public navigation.
 * The comparison link is a controlled operator input, not inferred applicability. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basSequenceView } from '../src/lib/basReview.ts';
import { inspectBasIssueReview } from '../src/lib/basIssueReview.ts';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';
const [pdfPath, archivePath, output] = process.argv.slice(2);
assert.ok(pdfPath && archivePath && output);
const out = resolve(output), pdf = resolve(pdfPath), archive = resolve(archivePath);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const baseline = await verifyBasWorkflow(JSON.parse(readFileSync(archive, 'utf8')).bas_workflow);
const capture = baseline.captures.find(c => c.capture_id === baseline.current_capture_id);
const initial = await basSequenceView(baseline, baseline.current_capture_id);
const inspected = await inspectBasIssueReview(baseline, baseline.current_capture_id);
const sequence = initial.sequences.regions.find(r => r.page_id.endsWith(':p8') && r.title === 'DEDICATED OUTSIDE AIR SYSTEM CONTROL SEQUENCE');
assert.ok(sequence); assert.equal(initial.comparisons.length, 0);
const clause = sequence.clauses.at(-1), issue = inspected.project_review.issues.find(i => i.subject.id === clause.clause_id);
assert.ok(issue);
const source = capture.narrative_sources.pages.find(p => p.page_number === 8), reference = source.spans[61];
assert.equal(reference.text, 'DOAS 1 OR 2');
const matrix = capture.points.matrices.find(m => m.page_id === source.page_id); assert.ok(matrix);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(20000);
const errors = [], timings = {};
page.on('pageerror', e => errors.push(String(e)));
const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const review = page.getByRole('region', { name: 'Project BAS review', exact: true });
const detail = page.getByRole('region', { name: 'Selected BAS finding', exact: true });
const sequences = page.getByRole('region', { name: 'Sequences and comparison links', exact: true });
async function openFinding(finding, filter) {
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  if (await review.getByRole('button', { name: '← Back to findings', exact: true }).count()) await review.getByRole('button', { name: '← Back to findings', exact: true }).click();
  await review.getByLabel('Find a finding', { exact: true }).fill(filter);
  const button = review.locator(`[data-finding-id="${finding.occurrence_id}"]`); await button.focus(); await page.keyboard.press('Enter');
  await detail.waitFor();
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready'); await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(archive);
  await waitForAsync(async () => (await saved())?.issue_events?.length === baseline.issue_events.length, { timeout: 30000 });
  same(await saved(), baseline, 'Ordinary import');
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Point lists', exact: true }).click(); await page.getByRole('button', { name: 'Sequences & links', exact: true }).click();
  await sequences.getByLabel('Sequence', { exact: true }).selectOption(sequence.region_id);
  const draft = 'Controlled review route draft; keep through clause and source navigation';
  await sequences.getByLabel('Association reason', { exact: true }).fill(draft);
  await openFinding(issue, sequence.title);
  let started = performance.now(); await detail.getByRole('button', { name: 'Open Sequences workspace', exact: true }).click();
  const target = sequences.locator('[data-review-target="true"]'); await target.waitFor();
  timings.clause_route_ms = Math.round(performance.now() - started);
  assert.equal(await sequences.getByLabel('Sequence', { exact: true }).inputValue(), sequence.region_id);
  assert.equal(await target.getAttribute('data-clause-id'), clause.clause_id);
  await page.waitForFunction(() => document.activeElement?.getAttribute('data-review-target') === 'true');
  assert.equal(await sequences.getByLabel('Association reason', { exact: true }).inputValue(), draft);
  await target.getByRole('button', { name: 'View source', exact: true }).click(); await sequences.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  const markup = await page.evaluate(() => window.__opentakeoff.probe.markups().filter(m => m.source === 'takeoff_cite').at(-1));
  const span = clause.source_spans.find(s => s.text.length > 10) || clause.source_spans[0];
  same(markup.rect, [[span.bbox_px[0] / source.width_px, span.bbox_px[1] / source.height_px], [span.bbox_px[2] / source.width_px, span.bbox_px[3] / source.height_px]], 'Exact original clause bbox');
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden' });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: resolve(out, 'clause-original.png') });
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await sequences.waitFor();
  assert.equal(await sequences.getByLabel('Association reason', { exact: true }).inputValue(), draft);
  same(await saved(), baseline, 'Navigation changed no domain state');
  await sequences.getByLabel('Comparison point matrix', { exact: true }).selectOption(matrix.matrix_id);
  await sequences.getByLabel('Find equipment reference', { exact: true }).fill('DOAS 1 OR 2');
  await sequences.getByLabel('Equipment reference source', { exact: true }).selectOption(reference.span_id);
  await sequences.getByLabel('Reference tag', { exact: true }).fill(reference.text);
  await sequences.getByRole('button', { name: 'Save comparison link', exact: true }).click();
  await waitForAsync(async () => (await saved())?.review_events?.length === 1, { timeout: 30000 });
  const linked = await saved(); same(linked.captures, baseline.captures, 'Link did not rewrite source evidence');
  const current = await inspectBasIssueReview(linked, linked.current_capture_id);
  const comparison = current.project_review.issues.find(i => i.subject.kind === 'comparison'); assert.ok(comparison);
  await openFinding(comparison, comparison.code.replaceAll('_', ' '));
  started = performance.now(); await detail.getByRole('button', { name: 'Open Sequences workspace', exact: true }).click();
  await target.waitFor(); timings.comparison_route_ms = Math.round(performance.now() - started);
  assert.equal(await sequences.getByLabel('Sequence', { exact: true }).inputValue(), sequence.region_id);
  assert.equal(await target.getAttribute('data-matrix-id') || await target.getAttribute('data-comparison-matrix'), matrix.matrix_id);
  await page.screenshot({ path: resolve(out, 'comparison-target.png') });
  const pageIssue = current.project_review.issues.find(i => i.subject.kind === 'page' && i.subject.id.endsWith(':p9') && i.code === 'unassigned_horizontal_spans'); assert.ok(pageIssue);
  await openFinding(pageIssue, 'unassigned horizontal spans'); started = performance.now();
  await detail.getByRole('button', { name: 'Open Sequences workspace', exact: true }).click();
  const accounting = page.getByRole('region', { name: 'Narrative source accounting', exact: true }); await accounting.waitFor();
  timings.page_route_ms = Math.round(performance.now() - started);
  assert.equal(await accounting.getByLabel('Source accounting page').inputValue(), pageIssue.subject.id);
  await accounting.getByLabel('Text accounting group').selectOption('unassigned_horizontal_span_ids');
  assert.equal(await accounting.locator('tbody tr').count(), 50);
  const first = await accounting.locator('tbody tr').first().innerText();
  await accounting.getByRole('button', { name: 'Next text', exact: true }).click();
  assert.notEqual(await accounting.locator('tbody tr').first().innerText(), first);
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    await accounting.getByRole('heading', { name: 'Source coverage', exact: true }).scrollIntoViewIfNeeded();
    assert.ok(await accounting.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: resolve(out, `source-accounting-${theme}-${width}.png`) });
  }
  same(await saved(), linked, 'Accounting reads and paging changed no domain evidence');
  const download = page.waitForEvent('download'); await sequences.getByRole('button', { name: 'Export BAS evidence & history', exact: true }).click();
  await (await download).saveAs(resolve(out, 'linked.takeoff.json'));
  same(JSON.parse(readFileSync(resolve(out, 'linked.takeoff.json'), 'utf8')).bas_workflow, linked, 'Full UI export unaffected by filters');
  await page.reload({ waitUntil: 'domcontentloaded' }); await waitForAsync(async () => (await saved())?.review_events?.length === 1);
  same(await saved(), linked, 'Ordinary reload preserves original evidence and history');
  for (const time of Object.values(timings)) assert.ok(time < 10000, `Existing 10-second public-operation budget exceeded: ${time}`);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  writeFileSync(resolve(out, 'proof.json'), JSON.stringify({ pdf_sha256: createHash('sha256').update(readFileSync(pdf)).digest('hex'),
    input_sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), timings, errors,
    clause_id: clause.clause_id, comparison_issue: comparison.occurrence_id, page_id: pageIssue.subject.id,
    coverage_rows: 1185, rendered_at_once: 50, linked_event: linked.review_events[0].event_id,
    checks: ['Exact clause/region and keyboard focus', 'Draft preserved through issue and source navigation', 'Original citation bbox',
      'Actual form-created comparison exact target', 'Original evidence unchanged', 'Exact page and bounded accounting', 'Both themes / three sizes', 'Unfiltered UI export and durable reload'] }, null, 2));
  console.log(JSON.stringify({ ok: true, timings, errors, out }));
} catch (error) { await page.screenshot({ path: resolve(out, 'failure.png') }); throw error; }
finally { await browser.close(); }
