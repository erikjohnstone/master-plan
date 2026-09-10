/** Real PDF + ordinary saved-workflow import. Read-only review, source return,
 * keyboard, pagination, layout and export parity. No injected findings/outcomes. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basProjectReview } from '../src/lib/basProjectReview.ts';
import { canonicalBasJson } from '../src/lib/basCanonical.ts';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';

const [pdfPath, archivePath, output] = process.argv.slice(2);
assert.ok(pdfPath && archivePath && output, 'Original PDF, reviewed archive, new output directory required');
const pdf = resolve(pdfPath), archive = resolve(archivePath), out = resolve(output);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const payload = JSON.parse(readFileSync(archive, 'utf8'));
const baseline = await verifyBasWorkflow(payload.bas_workflow);
// Exercise the real backup ordering defect through ordinary browser import,
// not a store injection. This generated artifact preserves every payload value.
const canonicalArchive = resolve(out, 'canonical-backup.takeoff.json');
writeFileSync(canonicalArchive, canonicalBasJson(payload));
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(baseline.captures.some(c => c.sources.some(s => s.sha256 === sha)));
const expected = await basProjectReview(baseline, baseline.current_capture_id);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const checks = [], errors = [], timings = {}, started = performance.now();
page.on('pageerror', e => errors.push(String(e)));
const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const review = page.getByRole('region', { name: 'Project BAS review', exact: true });
const list = review.getByRole('table', { name: 'Project BAS findings', exact: true });
const detail = review.getByRole('region', { name: 'Selected BAS finding', exact: true });
async function enter() { await page.getByRole('button', { name: 'Review & changes', exact: true }).click(); await review.waitFor(); }
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(canonicalArchive);
  await waitForAsync(async () => (await saved())?.engineering_events?.at(-1)?.event_id === baseline.engineering_events.at(-1).event_id, { timeout: 30000 });
  same(await saved(), baseline, 'Ordinary imported history');
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  const queueStarted = performance.now(); await enter(); timings.first_open_ms = Math.round(performance.now() - queueStarted);
  assert.equal(await list.locator('tbody tr').count(), Math.min(50, expected.issues.length));
  assert.match(await review.innerText(), /not an approved takeoff/);
  const download = page.waitForEvent('download'); await review.getByRole('button', { name: 'Export findings', exact: true }).click();
  await (await download).saveAs(resolve(out, 'findings.json'));
  same(JSON.parse(readFileSync(resolve(out, 'findings.json'), 'utf8')), expected, 'Browser/shared exact queue');
  checks.push('Canonical backup imported through actual UI; exact original-order shared export; no approval or dropped findings');
  await review.getByRole('button', { name: 'Next findings', exact: true }).click();
  assert.equal(await list.locator('tbody tr').count(), Math.min(50, expected.issues.length - 50));
  await review.getByRole('button', { name: 'Previous findings', exact: true }).click();
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await review.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Workspace has no horizontal overflow');
    const pager = await review.getByRole('button', { name: 'Next findings', exact: true }).boundingBox();
    assert.ok(pager && pager.y >= 0 && pager.y + pager.height < height, 'Finding navigation remains in the viewport');
    await page.screenshot({ path: resolve(out, `findings-${theme}-${width}.png`) });
  }
  await review.getByLabel('Area', { exact: true }).selectOption('assemblies');
  await review.getByLabel('Find a finding', { exact: true }).fill('responsibility unknown');
  const issue = expected.issues.find(i => i.domain === 'assemblies' && i.code === 'responsibility_unknown' && i.evidence.some(e => e.bbox_px));
  assert.ok(issue, 'Saved real source has a located responsibility finding');
  const row = list.locator('tbody tr').filter({ has: page.getByText(issue.subject.label, { exact: true }) });
  const trigger = row.getByRole('button', { name: issue.title, exact: true });
  await trigger.focus(); await page.keyboard.press('Enter'); await detail.waitFor();
  assert.equal(await detail.getByRole('heading', { level: 3 }).evaluate(el => el === document.activeElement), true);
  await detail.locator('summary').click();
  assert.equal(await detail.locator('pre').innerText(), JSON.stringify(JSON.parse(issue.original_finding_json), null, 2));
  await detail.locator('summary').click();
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await detail.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Detail has no horizontal overflow');
    await page.screenshot({ path: resolve(out, `detail-${theme}-${width}.png`) });
  }
  await detail.getByRole('button', { name: /View PDF page/ }).first().click();
  await review.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  const markups = await page.evaluate(() => window.__opentakeoff.probe.markups().filter(m => m.source === 'takeoff_cite'));
  const evidence = issue.evidence[0];
  const sourcePage = baseline.captures.find(c => c.capture_id === expected.capture_id).narrative_sources.pages.find(p => p.page_id === evidence.page_id);
  assert.equal(markups.length, 1);
  assert.ok(markups[0].sheet_id.endsWith(`#${sourcePage.page_number}`));
  same(markups[0].rect, [[evidence.bbox_px[0] / sourcePage.width_px, evidence.bbox_px[1] / sourcePage.height_px],
    [evidence.bbox_px[2] / sourcePage.width_px, evidence.bbox_px[3] / sourcePage.height_px]], 'Original source bbox in existing canvas coordinates');
  writeFileSync(resolve(out, 'source-markups.json'), JSON.stringify(markups, null, 2));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: resolve(out, 'source.png') });
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await detail.waitFor();
  assert.equal(await review.getByLabel('Area', { exact: true }).inputValue(), 'assemblies');
  assert.equal(await review.getByLabel('Find a finding', { exact: true }).inputValue(), 'responsibility unknown');
  await detail.getByRole('button', { name: 'Open Assemblies workspace', exact: true }).click();
  await page.getByRole('region', { name: 'Assembly and responsibilities', exact: true }).waitFor();
  await enter(); await detail.waitFor();
  await detail.getByRole('button', { name: '← Back to findings', exact: true }).click();
  assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Back restores focus to the selected finding');
  checks.push('Keyboard selection, source citation, domain route, filter/selection and focus return');
  same(await saved(), baseline, 'Read-only review preserves all source/decision history');
  await review.getByRole('button', { name: 'Original PDFs', exact: true }).click();
  const originals = page.getByRole('region', { name: 'Original BAS PDFs', exact: true });
  const versions = originals.getByRole('table', { name: 'Original PDF versions', exact: true });
  await versions.waitFor();
  assert.equal(await originals.getByRole('heading', { name: 'Original PDFs', exact: true }).evaluate(el => el === document.activeElement), true);
  await originals.getByRole('button', { name: '← Back to findings', exact: true }).click();
  assert.equal(await review.getByRole('button', { name: 'Original PDFs', exact: true }).evaluate(el => el === document.activeElement), true);
  assert.equal(await review.getByLabel('Find a finding', { exact: true }).inputValue(), 'responsibility unknown');
  await page.keyboard.press('Enter'); await versions.waitFor();
  assert.equal(await versions.locator('tbody tr').count(), 1);
  const retentionStarted = performance.now();
  await originals.getByRole('button', { name: 'Retain original', exact: true }).click();
  await originals.getByText('Retained original · bytes verified now', { exact: true }).waitFor();
  timings.original_retention_ms = Math.round(performance.now() - retentionStarted);
  const originalDownload = page.waitForEvent('download');
  await originals.getByRole('button', { name: 'Download original', exact: true }).click();
  const downloadedOriginal = await originalDownload;
  assert.equal(downloadedOriginal.suggestedFilename(), `${sha}.pdf`);
  await downloadedOriginal.saveAs(resolve(out, 'downloaded-original.pdf'));
  assert.equal(createHash('sha256').update(readFileSync(resolve(out, 'downloaded-original.pdf'))).digest('hex'), sha);
  same(await saved(), baseline, 'Retention/download leaves original findings and all saved decisions unchanged');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await originals.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: resolve(out, `originals-${theme}-${width}.png`) });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openImportedSheet(page);
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  if (!(await originals.isVisible())) await review.getByRole('button', { name: 'Original PDFs', exact: true }).click();
  await originals.getByRole('button', { name: 'Verify retained copy', exact: true }).click();
  await originals.getByText('Retained original · bytes verified now', { exact: true }).waitFor();
  same(await saved(), baseline, 'Original retention survives browser reload without a workflow rewrite');
  // Explicit transport test, not a claim of exercising the canvas Close UI:
  // ordinary removePdf destroys the filename trail, never the BAS original.
  const removed = await page.evaluate(async () => {
    const { localStore } = await import('/src/lib/store.js');
    const names = (await localStore.listSheets()).map(s => s.name);
    for (const name of names) await localStore.removePdf(name);
    return (await localStore.listSheets()).length;
  });
  assert.equal(removed, 0);
  const recoveredDownload = page.waitForEvent('download');
  await originals.getByRole('button', { name: 'Download original', exact: true }).click();
  await (await recoveredDownload).saveAs(resolve(out, 'recovered-original.pdf'));
  assert.equal(createHash('sha256').update(readFileSync(resolve(out, 'recovered-original.pdf'))).digest('hex'), sha);
  checks.push('Actual UI retain/verify/download/reload; exact original hash survives separate ordinary removePdf transport test; no approval');
  assert.equal(errors.length, 0);
  const result = { pdf_sha256: sha, findings: expected.issues.length, checks, timings, page_errors: errors, duration_ms: Math.round(performance.now() - started) };
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} catch (error) {
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), stack: error.stack, checks, timings, page_errors: errors }, null, 2));
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error;
} finally { await browser.close(); }
