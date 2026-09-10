/** Original PDF, retained reviewed evidence and actual public controls.
 * Applicability/exclusions are controlled reviewer judgments, not extracted truth. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { catalogBasScope } from '../src/lib/basScopeCatalog.ts';
import { readBasScopeDecision } from '../src/lib/basScopeReview.ts';
import { basDeliverableTargetKey } from '../src/lib/basDeliverableScope.ts';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';
const [pdfPath, archivePath, output] = process.argv.slice(2);
assert.ok(pdfPath && archivePath && output, 'Original PDF, retained workflow and fresh output directory required');
const pdf = resolve(pdfPath), archive = resolve(archivePath), out = resolve(output);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const baseline = await verifyBasWorkflow(JSON.parse(readFileSync(archive, 'utf8')).bas_workflow);
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(baseline.captures.some(c => c.sources.some(s => s.sha256 === sha)));
assert.equal(baseline.scope_events?.length || 0, 0);
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); page.setDefaultTimeout(20000);
const errors = [], checks = [], timings = {}; let storeUrl;
page.on('pageerror', e => errors.push(String(e)));
page.on('request', req => { if (!storeUrl && new URL(req.url()).pathname === '/src/lib/store.js') storeUrl = req.url(); });
const saved = () => page.evaluate(async url => (await (await import(url)).localStore.loadAnnotations()).bas_workflow, storeUrl);
const workspace = page.getByRole('region', { name: 'Scope and coverage', exact: true });
const review = page.getByRole('region', { name: 'Project BAS review', exact: true });
async function waitEvents(n) { await waitForAsync(async () => (await saved())?.scope_events?.length === n, { timeout: 20000 }); }
async function reviewReason(reason) {
  await workspace.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  await workspace.getByLabel('Decision reason', { exact: true }).fill(reason);
}
async function capture(name, target) {
  for (const theme of ['light', 'dark']) for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    await page.setViewportSize({ width, height }); await target.scrollIntoViewIfNeeded();
    const layout = await workspace.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth,
      overflow: [...el.querySelectorAll('*')].filter(child => child.getBoundingClientRect().right > el.getBoundingClientRect().right + 1)
        .map(child => ({ tag: child.tagName, class: child.className, label: child.getAttribute('aria-label'),
          width: child.getBoundingClientRect().width, right: child.getBoundingClientRect().right,
          minWidth: getComputedStyle(child).minWidth, text: child.textContent.slice(0, 120) })) }));
    if (layout.scroll > layout.width + 1) writeFileSync(resolve(out, `${name}-${theme}-${width}-overflow.json`), JSON.stringify(layout, null, 2));
    assert.ok(layout.scroll <= layout.width + 1, 'No workspace horizontal overflow');
    await page.screenshot({ path: resolve(out, `${name}-${theme}-${width}.png`) });
  }
}
async function readLatest() {
  await workspace.getByRole('region', { name: 'Scope decision history', exact: true }).getByRole('button', { name: 'Read decision', exact: true }).first().click();
  const result = workspace.getByRole('region', { name: 'Replayed scope decision', exact: true }); await result.waitFor();
  return result;
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page); await page.locator('input[name="takeoff-import"]').setInputFiles(archive);
  await waitForAsync(async () => (await saved())?.engineering_events?.at(-1)?.event_id === baseline.engineering_events.at(-1).event_id, { timeout: 30000 });
  same(await saved(), baseline, 'Ordinary original-backed import');
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await review.getByRole('button', { name: 'Drawing changes', exact: true }).click();
  const drawings = page.getByRole('region', { name: 'Drawing changes', exact: true });
  await drawings.getByRole('button', { name: 'New source set', exact: true }).click();
  await drawings.getByLabel('Source-set name', { exact: true }).fill('Controlled whole-original BAS review');
  await drawings.getByLabel('Reviewer (self-declared)', { exact: true }).fill('Controlled browser reviewer');
  await drawings.getByLabel('Decision reason', { exact: true }).fill('Select the complete retained original; no addendum or installed-quantity claim');
  await drawings.getByRole('button', { name: 'Preview page accounting', exact: true }).click();
  await waitForAsync(() => drawings.getByRole('button', { name: 'Record page accounting', exact: true }).isEnabled());
  await drawings.getByRole('button', { name: 'Record page accounting', exact: true }).click();
  await waitForAsync(async () => (await saved())?.drawing_events?.length === (baseline.drawing_events?.length || 0) + 1);
  const sourceSetId = (await saved()).drawing_events.at(-1).event_id;
  await drawings.getByRole('button', { name: '← Back to findings', exact: true }).click();
  await review.getByRole('button', { name: 'Scope & coverage', exact: true }).click();
  let started = performance.now(); await workspace.getByLabel('Drawing source set', { exact: true }).selectOption(sourceSetId);
  await waitForAsync(() => workspace.getByRole('button', { name: 'New scope', exact: true }).isEnabled());
  timings.catalog_ms = Math.round(performance.now() - started);
  const catalog = await catalogBasScope(await saved(), { source_set_id: sourceSetId });
  assert.ok(catalog.targets.some(t => t.target.claim === 'assembly_components'));
  assert.ok(catalog.targets.some(t => t.target.claim === 'engineering_compatibility'));
  await workspace.getByRole('button', { name: 'New scope', exact: true }).click();
  await workspace.getByLabel('Scope name', { exact: true }).fill('Controlled BAS deliverable scope');
  await workspace.getByLabel('Scope purpose', { exact: true }).fill('Review retained equipment and declared capabilities, not installed quantities');
  await workspace.getByRole('button', { name: 'Include available claims', exact: true }).click();
  const excluded = catalog.targets.find(t => t.target.claim === 'engineering_compatibility');
  await workspace.getByLabel(`Disposition: Engineering compatibility ${excluded.label}`, { exact: true }).selectOption('excluded');
  await workspace.getByLabel('Exclusion reason', { exact: true }).fill('Controlled exclusion for public review verification');
  await workspace.getByLabel('Consequence for the takeoff', { exact: true }).fill('This declared check is omitted from this deliverable; dependent loads and findings remain');
  const evidencePage = catalog.pages.find(p => p.capture_id === excluded.target.capture_id);
  await workspace.getByLabel('Add exclusion source page', { exact: true }).selectOption(`${evidencePage.capture_id}|${evidencePage.page_id}`);
  started = performance.now(); await workspace.getByRole('button', { name: 'Preview scope', exact: true }).click();
  await workspace.getByRole('region', { name: 'Scope preview', exact: true }).waitFor(); timings.preview_ms = Math.round(performance.now() - started);
  assert.equal((await saved()).scope_events?.length || 0, 0, 'Preview is read-only');
  await reviewReason('Retain this scope reason across evidence navigation');
  const preview = workspace.getByRole('region', { name: 'Scope preview', exact: true });
  await preview.locator('summary').filter({ hasText: 'Explicit exclusions' }).click();
  await preview.getByRole('button', { name: 'View exclusion evidence', exact: true }).click();
  const originalReader = page.getByRole('region', { name: 'Original source reader', exact: true });
  await originalReader.waitFor(); await originalReader.getByText(/Original page \d+ ready/).waitFor();
  await page.screenshot({ path: resolve(out, 'whole-page-exclusion-source.png') });
  await originalReader.getByRole('button', { name: '← Back to takeoff', exact: true }).click();
  await preview.waitFor();
  assert.equal(await workspace.getByLabel('Decision reason', { exact: true }).inputValue(), 'Retain this scope reason across evidence navigation');
  assert.equal((await saved()).scope_events?.length || 0, 0, 'Whole-page inspection changes no saved decision');
  await capture('scope', workspace.getByRole('region', { name: 'Scope preview', exact: true }));
  await workspace.getByRole('button', { name: 'Save reviewed scope', exact: true }).focus();
  started = performance.now(); await page.keyboard.press('Enter'); await waitEvents(1); timings.save_scope_ms = Math.round(performance.now() - started);
  const scoped = await saved(); same(scoped.captures, baseline.captures, 'Scope save preserves exact source capture');
  assert.equal(scoped.scope_events[0].action.specification.included.length, catalog.targets.length - 1);
  assert.equal(scoped.scope_events[0].action.specification.excluded.length, 1);
  await workspace.getByRole('button', { name: 'Edit saved scope', exact: true }).click();
  assert.equal(await workspace.getByLabel('Exclusion reason', { exact: true }).inputValue(), 'Controlled exclusion for public review verification');
  await workspace.getByLabel('Scope name', { exact: true }).fill('Discard this unsaved scope edit');
  await workspace.getByRole('button', { name: 'Discard scope draft', exact: true }).click();
  same(await saved(), scoped, 'Discarding a scope edit never changes saved history');
  await workspace.getByRole('button', { name: 'Source coverage', exact: true }).click();
  const target = catalog.targets.find(t => t.target.claim === 'assembly_components' && t.source_refs.some(s => s.span_id)); assert.ok(target);
  const sourceRef = target.source_refs.find(s => s.span_id), originalPage = baseline.captures.find(c => c.capture_id === target.target.capture_id).narrative_sources.pages.find(p => p.page_id === sourceRef.page_id);
  await workspace.getByLabel('Included claim', { exact: true }).selectOption(basDeliverableTargetKey(target.target));
  await workspace.getByLabel('Original page', { exact: true }).selectOption(originalPage.page_id);
  started = performance.now(); await workspace.getByRole('button', { name: 'Load original source', exact: true }).click();
  await workspace.getByRole('region', { name: 'Original coverage source', exact: true }).waitFor(); timings.load_source_ms = Math.round(performance.now() - started);
  started = performance.now(); await workspace.getByRole('button', { name: 'Prepare evidence mappings', exact: true }).click();
  await workspace.getByLabel('Assessment', { exact: true }).waitFor(); timings.prepare_ms = Math.round(performance.now() - started);
  assert.equal(await workspace.getByLabel('Assessment', { exact: true }).inputValue(), '');
  await workspace.getByLabel('Assessment', { exact: true }).selectOption('applicable_mapped');
  await workspace.getByRole('button', { name: 'Select source-linked candidates', exact: true }).click();
  const selected = await workspace.getByRole('region', { name: 'Coverage mapping candidates', exact: true }).getByRole('checkbox', { checked: true }).count(); assert.ok(selected > 0);
  await reviewReason('Keep this explicit mapping draft while inspecting the original source');
  const attestation = workspace.getByLabel('I inspected the original source for this claim and review extent.', { exact: true });
  assert.equal(await attestation.isChecked(), false); assert.equal(await workspace.getByRole('button', { name: 'Record coverage decision', exact: true }).isEnabled(), false);
  const spanIndex = originalPage.spans.findIndex(s => s.span_id === sourceRef.span_id); assert.ok(spanIndex >= 0);
  const sourceRegion = workspace.getByRole('region', { name: 'Original coverage source', exact: true });
  for (let n = 0; n < Math.floor(spanIndex / 50); n++) await sourceRegion.getByRole('button', { name: 'Next source spans', exact: true }).click();
  await sourceRegion.getByRole('button', { name: 'View original', exact: true }).nth(spanIndex % 50).click();
  await workspace.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  const markup = await page.evaluate(() => window.__opentakeoff.probe.markups().find(m => m.source === 'takeoff_cite')), box = originalPage.spans[spanIndex].bbox_px;
  same(markup.rect, [[box[0] / originalPage.width_px, box[1] / originalPage.height_px], [box[2] / originalPage.width_px, box[3] / originalPage.height_px]], 'Exact original coverage bbox');
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden' });
  await page.screenshot({ path: resolve(out, 'original-source.png') });
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await workspace.getByLabel('Assessment', { exact: true }).waitFor();
  assert.equal(await workspace.getByLabel('Assessment', { exact: true }).inputValue(), 'applicable_mapped');
  assert.equal(await workspace.getByLabel('Decision reason', { exact: true }).inputValue(), 'Keep this explicit mapping draft while inspecting the original source');
  assert.equal(await workspace.getByRole('region', { name: 'Coverage mapping candidates', exact: true }).getByRole('checkbox', { checked: true }).count(), selected);
  await attestation.check(); await capture('coverage', workspace.getByRole('region', { name: 'Coverage mapping candidates', exact: true }));
  started = performance.now(); await workspace.getByRole('button', { name: 'Record coverage decision', exact: true }).click(); await waitEvents(2); timings.save_coverage_ms = Math.round(performance.now() - started);
  started = performance.now(); const replay = await readLatest(); timings.replay_ms = Math.round(performance.now() - started);
  assert.match(await replay.innerText(), /current dependencies/);
  await capture('history', replay);
  const download = page.waitForEvent('download'); await replay.getByRole('button', { name: 'Export decision evidence', exact: true }).click();
  await (await download).saveAs(resolve(out, 'coverage-review.json'));
  const covered = await saved(); same(JSON.parse(readFileSync(resolve(out, 'coverage-review.json'), 'utf8')), await readBasScopeDecision(covered, covered.scope_events.at(-1).event_id), 'UI/shared complete decision parity');
  const wholePageEventId = covered.scope_events.at(-1).event_id;
  await workspace.getByRole('button', { name: 'Source coverage', exact: true }).click();
  await workspace.getByRole('button', { name: 'Load original source', exact: true }).click();
  await workspace.getByLabel('Review extent', { exact: true }).selectOption('spans');
  assert.equal(await workspace.getByRole('button', { name: 'Prepare evidence mappings', exact: true }).isEnabled(), false, 'An empty span subset cannot become whole-page coverage');
  for (let n = 0; n < Math.floor(spanIndex / 50); n++) await sourceRegion.getByRole('button', { name: 'Next source spans', exact: true }).click();
  await sourceRegion.getByLabel(`Select source span ${spanIndex + 1}`, { exact: true }).check();
  await workspace.getByRole('button', { name: 'Prepare evidence mappings', exact: true }).click();
  await workspace.getByLabel('Assessment', { exact: true }).selectOption('not_applicable');
  await reviewReason('Controlled conflicting span assessment to exercise visible overlap review, not a real finding');
  await attestation.check();
  await workspace.getByRole('button', { name: 'Record coverage decision', exact: true }).click(); await waitEvents(3);
  const conflict = await readLatest(); assert.match(await conflict.innerText(), /potentially conflicting overlapping decisions/);
  const conflictWorkflow = await saved(); same(conflictWorkflow.scope_events.at(-1).action.unit.span_ids, [sourceRef.span_id], 'Only the explicitly selected original span is reviewed');
  await capture('overlap', conflict);
  await reviewReason('Withdraw the deliberately conflicting span review without removing either original decision');
  await conflict.getByRole('button', { name: 'Withdraw decision', exact: true }).click(); await waitEvents(4);
  await workspace.locator(`[data-scope-event-id="${wholePageEventId}"]`).getByRole('button', { name: 'Read decision', exact: true }).click();
  await replay.waitFor(); assert.doesNotMatch(await replay.innerText(), /potentially conflicting overlapping decisions/);
  await reviewReason('Controlled withdrawal preserves the original evidence and decision');
  await replay.getByRole('button', { name: 'Withdraw decision', exact: true }).click(); await waitEvents(5);
  const final = await saved(); same(final.captures, baseline.captures, 'All original evidence preserved');
  same(final.engineering_events, baseline.engineering_events, 'Engineering inputs/results unchanged');
  await workspace.getByRole('button', { name: '← Review & changes', exact: true }).click();
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  const backup = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await backup).saveAs(resolve(out, 'reviewed.takeoff.json'));
  same(JSON.parse(readFileSync(resolve(out, 'reviewed.takeoff.json'), 'utf8')).bas_workflow, final, 'Actual public workflow export');
  await page.reload(); await waitEvents(5); same(await saved(), final, 'Actual IndexedDB reload');
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await page.getByRole('button', { name: 'Review & changes', exact: true }).click();
  await review.getByRole('button', { name: 'Scope & coverage', exact: true }).click();
  await workspace.getByRole('button', { name: 'Decision history', exact: true }).click();
  const restored = await readLatest(); assert.match(await restored.innerText(), /withdrawn/);
  checks.push('Actual original upload/import; source set; populated/excluded scope; original whole-page exclusion inspection; discarded scope edit; keyboard save; explicit mapped coverage; exact original span/bbox; draft return; both themes/three widths; replay export; exact-span conflicting assessment/withdrawal; full workflow export; durable reload');
  for (const [key, value] of Object.entries(timings)) assert.ok(value < 10000, `${key} exceeds predeclared 10 s public operation gate`);
  assert.deepEqual(errors, []);
  const proof = { original_sha256: sha, checks, errors, timings, catalog_claims: catalog.targets.length, selected_visible_candidates: selected,
    scope_events: final.scope_events.length, controlled_applicability_and_hardware_inputs: true, fresh_extraction_truth_or_installed_verification: false };
  writeFileSync(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) { await page.screenshot({ path: resolve(out, 'failure.png') }); writeFileSync(resolve(out, 'failure.txt'), String(error)); throw error; }
finally { await browser.close(); }
