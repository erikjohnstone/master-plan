/** Real retained PDF evidence, ordinary upload/import and actual public controls.
 * Scope changes are controlled operator declarations, not extracted plan truth. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { inspectBasIssueReview, readBasIssueDecision } from '../src/lib/basIssueReview.ts';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';
const [pdfPath, archivePath, output] = process.argv.slice(2);
assert.ok(pdfPath && archivePath && output, 'Original PDF, reviewed archive and fresh output directory required');
const pdf = resolve(pdfPath), archive = resolve(archivePath), out = resolve(output);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const payload = JSON.parse(readFileSync(archive, 'utf8')), baseline = await verifyBasWorkflow(payload.bas_workflow);
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(baseline.captures.some(c => c.sources.some(s => s.sha256 === sha)));
const expected = await inspectBasIssueReview(baseline, baseline.current_capture_id);
const issue = expected.project_review.issues.find(i => i.code === 'scope_partly_unknown' && i.evidence.some(e => e.bbox_px));
assert.ok(issue); assert.equal(baseline.issue_events?.length || 0, 0);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(20000);
const checks = [], errors = [], timings = {};
page.on('pageerror', e => errors.push(String(e)));
const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const review = page.getByRole('region', { name: 'Project BAS review', exact: true });
const detail = page.getByRole('region', { name: 'Selected BAS finding', exact: true });
const history = page.getByRole('region', { name: 'Issue decision history', exact: true });
async function waitHistory(n) { await waitForAsync(async () => (await saved())?.issue_events?.length === n, { timeout: 20000 }); }
async function record(action, reason) {
  await page.getByRole('button', { name: action, exact: true }).click();
  await page.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  await page.getByLabel('Issue decision reason', { exact: true }).fill(reason);
  const started = performance.now();
  const submit = { 'Record no longer reported': 'Confirm no longer reported', 'Withdraw decision': 'Record withdrawal' }[action];
  await page.getByRole('button', { name: submit, exact: true }).click();
  return started;
}
async function editScope(clear = false) {
  await page.getByRole('button', { name: 'Edit selected scope', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Equipment decision editor', exact: true });
  await editor.getByLabel('Building', { exact: true }).fill(clear ? '' : 'Controlled building');
  await editor.getByLabel('Level', { exact: true }).fill('Controlled level');
  await editor.getByLabel('Phase', { exact: true }).fill('Controlled phase');
  await editor.getByLabel('Equipment decision reason', { exact: true }).fill('Controlled UI scope change, not a requirement extracted from the PDF');
  await editor.getByRole('button', { name: 'Preview decision', exact: true }).click();
  await editor.getByRole('button', { name: 'Record decision', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '← Return to issue review', exact: true }).click();
  await history.getByRole('heading', { level: 3 }).waitFor();
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(archive);
  await waitForAsync(async () => (await saved())?.engineering_events?.at(-1)?.event_id === baseline.engineering_events.at(-1).event_id, { timeout: 30000 });
  same(await saved(), baseline, 'Ordinary source-backed import');
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await review.getByLabel('Find a finding', { exact: true }).fill('scope partly unknown');
  const trigger = review.locator(`[data-finding-id="${issue.occurrence_id}"]`);
  await trigger.focus(); await page.keyboard.press('Enter'); await detail.waitFor();
  await detail.getByRole('button', { name: 'Begin correction', exact: true }).click();
  await detail.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  await detail.getByLabel('Issue decision reason', { exact: true }).fill('Retain this reason across original source navigation');
  await detail.getByRole('button', { name: /View PDF page/ }).first().click();
  await review.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  const markup = await page.evaluate(() => window.__opentakeoff.probe.markups().find(m => m.source === 'takeoff_cite'));
  const evidence = issue.evidence.find(e => e.bbox_px), sourcePage = baseline.captures[0].narrative_sources.pages.find(p => p.page_id === evidence.page_id);
  same(markup.rect, [[evidence.bbox_px[0] / sourcePage.width_px, evidence.bbox_px[1] / sourcePage.height_px], [evidence.bbox_px[2] / sourcePage.width_px, evidence.bbox_px[3] / sourcePage.height_px]], 'Original cited bbox');
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await detail.waitFor();
  assert.equal(await detail.getByLabel('Issue decision reason', { exact: true }).inputValue(), 'Retain this reason across original source navigation');
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height });
    assert.ok(await detail.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await detail.evaluate(el => { const form = el.querySelector('.bas-issue-actions'); el.scrollTop += form.getBoundingClientRect().top - el.getBoundingClientRect().top; });
    await page.screenshot({ path: resolve(out, `decision-${theme}-${width}.png`) });
  }
  let started = performance.now();
  await detail.getByRole('button', { name: 'Record and open correction', exact: true }).click();
  await page.getByRole('button', { name: 'Edit selected scope', exact: true }).waitFor();
  timings.begin_correction_ms = Math.round(performance.now() - started); await waitHistory(1);
  const observed = await saved(); same(observed.captures, baseline.captures, 'Observation preserves source capture');
  same((await inspectBasIssueReview(observed, observed.current_capture_id)).project_review, expected.project_review, 'Observation never hides findings');
  await editScope();
  started = await record('Record no longer reported', 'Controlled current inputs no longer report the original unknown scope; not physical verification');
  await waitHistory(2); await history.getByRole('heading', { level: 3 }).waitFor();
  timings.record_absence_ms = Math.round(performance.now() - started);
  await history.getByRole('button', { name: '← Back to decision history', exact: true }).click();
  await history.getByRole('button', { name: 'record not reported', exact: true }).click();
  await history.getByRole('heading', { level: 3 }).waitFor();
  const download = page.waitForEvent('download'); await history.getByRole('button', { name: 'Export replayed decision', exact: true }).click();
  await (await download).saveAs(resolve(out, 'absence-replay.json'));
  const absent = await saved(); same(JSON.parse(readFileSync(resolve(out, 'absence-replay.json'), 'utf8')), await readBasIssueDecision(absent, absent.issue_events.at(-1).event_id), 'UI/shared full replay parity');
  await history.evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: resolve(out, 'absence-history.png') });
  await history.getByRole('button', { name: 'Open original domain workspace', exact: true }).click();
  await editScope(true);
  assert.match(await history.innerText(), /changed occurrence|same occurrence/);
  started = await record('Withdraw decision', 'Withdraw the earlier absence after a controlled reappearance');
  await waitHistory(3); timings.withdraw_ms = Math.round(performance.now() - started);
  const final = await saved(); same(final.captures, baseline.captures, 'Original captures unchanged through all edits');
  assert.equal(final.issue_events.at(-1).action.kind, 'withdraw');
  await history.getByRole('button', { name: 'Open original domain workspace', exact: true }).click();
  const backup = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await backup).saveAs(resolve(out, 'reviewed.takeoff.json'));
  same(JSON.parse(readFileSync(resolve(out, 'reviewed.takeoff.json'), 'utf8')).bas_workflow, final, 'Actual UI evidence export retains full journal');
  await page.reload();
  await waitForAsync(async () => (await saved())?.issue_events?.length === 3, { timeout: 30000 });
  same(await saved(), final, 'Actual IndexedDB reload');
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await review.getByRole('button', { name: 'Decision history', exact: true }).click();
  await history.getByRole('button', { name: 'withdraw', exact: true }).click(); await history.getByRole('heading', { level: 3 }).waitFor();
  assert.match(await history.innerText(), /Original finding replayed/);
  checks.push('Real upload/import; source bbox and draft return; both themes/three widths; keyboard; exact scope correction; absence; reappearance; withdrawal; full replay export; actual durable reload');
  for (const value of Object.values(timings)) assert.ok(value < 10000, 'Public issue action remains under its predeclared 10 s limit');
  assert.deepEqual(errors, []);
  const proof = { checks, errors, timings, original_sha256: sha, finding: issue.occurrence_id, events: final.issue_events.length,
    original_findings: expected.project_review.issues.length, final_findings: (await inspectBasIssueReview(final, final.current_capture_id)).project_review.issues.length,
    controlled_scope_changes: true, fresh_extraction_truth_or_installed_verification: false };
  writeFileSync(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) { await page.screenshot({ path: resolve(out, 'failure.png') }); writeFileSync(resolve(out, 'failure.txt'), String(error)); throw error; }
finally { await browser.close(); }
