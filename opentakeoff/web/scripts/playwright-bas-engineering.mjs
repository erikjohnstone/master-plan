/** Actual PDF upload + ordinary retained-workflow import, then UI-only review.
 * Counterpart ratings are disclosed controlled inputs, not drawing capabilities. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_REVIEWED && process.env.OT_BAS_OUT);
const pdf = resolve(process.env.OT_UI_PDF), imported = resolve(process.env.OT_BAS_REVIEWED);
const expected = await verifyBasWorkflow(JSON.parse(readFileSync(imported, 'utf8')).bas_workflow);
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(expected.captures.some(c => c.sources.some(s => s.sha256 === sha)));
const capture = expected.captures.find(c => c.capture_id === expected.current_capture_id);
const equipment = expected.equipment_events.filter(e => e.capture_id === expected.current_capture_id).at(-1).register.equipment.find(e => e.tag === 'DOAS-1');
assert.ok(equipment);
const note = capture.narrative_sources.pages.flatMap(p => p.spans.map(s => ({ ...s, page: p }))).find(s => s.text.includes('10. PROVIDE WITH MIXING BOX WITH RETURN AND OUTSIDE AIR DAMPERS WITH 0-10 VDC MODULATING ACTUATOR.'));
assert.ok(note); assert.equal(note.page.page_number, 9);
const out = resolve(process.env.OT_BAS_OUT); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], layouts = [], started = performance.now();
page.on('pageerror', error => errors.push(String(error)));
const saved = async () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const workspace = page.getByRole('region', { name: 'Equipment and template assignments', exact: true });
const engineering = page.getByRole('region', { name: 'Engineering compatibility', exact: true });
const changes = engineering.getByRole('region', { name: 'Engineering changes', exact: true });
async function enter() {
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  await workspace.getByLabel('Equipment table view').selectOption('register');
  await workspace.getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'DOAS-1', exact: true }).click();
  await workspace.getByRole('button', { name: 'Engineering', exact: true }).click();
  await engineering.getByRole('heading', { name: 'Engineering', exact: true }).waitFor();
}
async function field(name) {
  await changes.getByRole('navigation', { name: 'Engineering input fields' }).getByRole('button', { name: `Edit ${name}`, exact: true }).click();
}
async function declared(name, value) {
  await field(name);
  await changes.getByLabel(`${name}: information available`, { exact: true }).selectOption('known');
  await changes.getByLabel(name, { exact: true }).selectOption(value);
  await changes.getByLabel(`${name}: reason`, { exact: true }).fill('Controlled counterpart configuration for this walkthrough, not an extracted hardware capability.');
}
try {
  console.log('Uploading original PDF');
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  await page.locator('input[name="takeoff-import"]').setInputFiles(imported);
  await waitForAsync(async () => (await saved())?.assembly_events?.length === expected.assembly_events.length, { timeout: 30000, label: 'ordinary workflow import' });
  assert.deepEqual(await saved(), expected); await enter();
  await page.screenshot({ path: `${out}/empty.png` });
  console.log('Declaring controlled resources through forms');
  await engineering.getByRole('button', { name: 'Declared resources', exact: true }).click();
  for (const label of ['Controlled DOAS-1 source port', 'Controlled DOAS-1 input port']) {
    await engineering.getByRole('button', { name: 'Add resource', exact: true }).click();
    await changes.getByLabel('Resource label', { exact: true }).fill(label);
    await changes.getByLabel('endpoint', { exact: true }).check();
    await changes.getByLabel('Resource decision reason', { exact: true }).fill('Controlled endpoint declaration for testing the note review; not detected installed equipment.');
    await changes.getByRole('button', { name: 'Stage resource', exact: true }).click();
  }
  await engineering.getByRole('button', { name: 'Checks', exact: true }).click();
  await engineering.getByRole('button', { name: 'New check', exact: true }).click();
  await changes.getByLabel('Check decision reason', { exact: true }).fill('Review M-601 note 10 signal requirement for DOAS-1 against controlled counterpart configuration. No installed design claim.');
  for (const [name, label] of [['source', 'Controlled DOAS-1 source port'], ['sink', 'Controlled DOAS-1 input port']]) {
    await field(name);
    await changes.getByLabel('endpoint id', { exact: true }).selectOption({ label: `${label} · DOAS-1` });
    await changes.getByLabel('equipment id', { exact: true }).selectOption(equipment.equipment_id);
    await changes.getByLabel('scope id', { exact: true }).selectOption(equipment.scope_id);
  }
  await changes.getByRole('button', { name: 'Select resources explicitly referenced by these inputs', exact: true }).click();
  await changes.getByLabel('Engineering applicability reason', { exact: true }).fill('Manual review of DOAS-1 schedule row referencing note 10; controlled endpoint bindings only.');
  await changes.getByLabel('Engineering review reason', { exact: true }).fill('First verify unknown ratings remain unresolved; then compare controlled settings to the retained source requirement.');
  await changes.getByRole('button', { name: 'Preview & calculate', exact: true }).click();
  const preview = engineering.getByRole('region', { name: 'Engineering calculation preview', exact: true });
  await preview.waitFor(); assert.match(await preview.innerText(), /Not evaluable/);
  assert.deepEqual(await saved(), expected, 'Preview does not save');
  console.log('Entering controlled ratings and original drawing evidence');
  await declared('source direction', 'output'); await declared('sink direction', 'input'); await declared('source mode', 'voltage');
  await field('sink modes');
  await changes.getByLabel('sink modes: information available', { exact: true }).selectOption('known');
  await changes.getByRole('button', { name: 'Add sink modes entry', exact: true }).click();
  await changes.getByLabel('sink modes entry 1', { exact: true }).selectOption('voltage');
  await changes.getByLabel('sink modes: input basis', { exact: true }).selectOption('drawing_transcription');
  await changes.getByLabel('sink modes: reason', { exact: true }).fill('Manual transcription of the required 0-10 VDC interface in DOAS note 10. This is a requirement, not proof of selected actuator hardware.');
  const sourcePicker = changes.locator('details').filter({ has: page.locator('summary', { hasText: /^sink modes: source evidence/ }) });
  await sourcePicker.locator('summary').click();
  await sourcePicker.getByLabel('Find drawing text').fill('10. PROVIDE WITH MIXING BOX');
  await sourcePicker.getByRole('checkbox').check();
  await sourcePicker.getByRole('button', { name: 'View source · PDF page 9', exact: true }).focus(); await page.keyboard.press('Enter');
  await workspace.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await changes.waitFor();
  assert.notEqual(await sourcePicker.getAttribute('open'), null, 'Source disclosure remains open after source navigation');
  assert.equal(await changes.getByLabel('sink modes: input basis', { exact: true }).inputValue(), 'drawing_transcription');
  assert.match(await changes.getByLabel('sink modes: reason', { exact: true }).inputValue(), /required 0-10/);
  await changes.getByRole('button', { name: 'Preview & calculate', exact: true }).click(); await preview.waitFor();
  await preview.getByRole('button', { name: 'Record engineering decision', exact: true }).waitFor({ state: 'visible' });
  assert.doesNotMatch(await preview.innerText(), /Not evaluable|Fails declared constraint/);
  assert.deepEqual(await saved(), expected);
  await preview.getByRole('button', { name: 'Record engineering decision', exact: true }).focus(); await page.keyboard.press('Enter');
  await waitForAsync(async () => (await saved())?.engineering_events?.length === (expected.engineering_events?.length || 0) + 1, { timeout: 60000, label: 'engineering decision persisted' });
  const reviewed = await verifyBasWorkflow(await saved());
  assert.deepEqual(reviewed.captures, expected.captures); assert.deepEqual(reviewed.equipment_events, expected.equipment_events);
  assert.deepEqual(reviewed.assembly_events, expected.assembly_events);
  const event = reviewed.engineering_events.at(-1);
  await engineering.getByText(/Saved calculations replayed in shared Python\./).waitFor();
  assert.equal(event.result.status, 'pass'); assert.equal(event.result.project_complete, false);
  assert.deepEqual(event.register.input.checks[0].sink_modes.basis.source_span_ids, [note.span_id]);
  assert.equal(event.register.input.checks[0].sink_modes.basis.original_text, note.text);
  await engineering.getByRole('button', { name: 'Read check', exact: true }).click();
  const savedCheck = engineering.getByRole('region', { name: 'Saved engineering check', exact: true });
  const outcomes = savedCheck.getByRole('table', { name: 'Engineering outcomes', exact: true });
  assert.match(await outcomes.innerText(), /Explicit input — not extracted/);
  assert.match(await outcomes.innerText(), /Manually transcribed from drawing/);
  await outcomes.getByRole('button', { name: 'sink modes', exact: true }).click();
  assert.match(await savedCheck.innerText(), /Manual transcription of the required 0-10 VDC/);
  const savedSource = savedCheck.locator('details').filter({ has: page.locator('summary', { hasText: /^Original source evidence/ }) });
  await savedSource.locator('summary').click();
  await savedSource.getByRole('button', { name: 'View source · PDF page 9', exact: true }).focus(); await page.keyboard.press('Enter');
  await workspace.waitFor({ state: 'hidden' }); await page.locator('[data-workspace-nav="Takeoff"]').click();
  await savedCheck.waitFor(); assert.notEqual(await savedSource.getAttribute('open'), null, 'Saved input source stays open after citation return');
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : 1080 });
      await engineering.getByRole('region', { name: 'Saved engineering check' }).scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      layouts.push({ theme, width }); await page.screenshot({ path: `${out}/${theme}-${width}.png` });
    }
  }
  const download = page.waitForEvent('download'); await workspace.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await download).saveAs(`${out}/reviewed.takeoff.json`);
  assert.deepEqual(JSON.parse(readFileSync(`${out}/reviewed.takeoff.json`, 'utf8')).bas_workflow, reviewed);
  await page.reload({ waitUntil: 'domcontentloaded' }); assert.deepEqual(await saved(), reviewed);
  await openImportedSheet(page); await enter();
  assert.match(await engineering.innerText(), /need shared Python replay/);
  await engineering.getByRole('button', { name: 'Verify saved calculations', exact: true }).focus(); await page.keyboard.press('Enter');
  await engineering.getByText('Saved calculations match shared Python replay. This is not project approval.', { exact: true }).waitFor();
  assert.deepEqual(await saved(), reviewed, 'Replay receipt is ephemeral, not rewritten history');
  // A fresh browser context, ordinary import, and a controlled operator withdrawal.
  // This is not a real addendum or an inferred equipment deletion.
  const importedPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  importedPage.on('pageerror', error => errors.push(String(error)));
  const importedSaved = () => importedPage.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
  await importedPage.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await importedPage.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await importedPage.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await importedPage.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(importedPage); assert.equal(await importedSaved(), undefined);
  await importedPage.locator('input[name="takeoff-import"]').setInputFiles(`${out}/reviewed.takeoff.json`);
  await waitForAsync(async () => (await importedSaved())?.engineering_events?.length === reviewed.engineering_events.length, { timeout: 30000, label: 'Fresh engineering import' });
  assert.deepEqual(await importedSaved(), reviewed);
  await importedPage.locator('[data-workspace-nav="Takeoff"]').click();
  await importedPage.getByRole('button', { name: 'Equipment', exact: true }).click();
  const importedWorkspace = importedPage.getByRole('region', { name: 'Equipment and template assignments', exact: true });
  await importedWorkspace.getByLabel('Equipment table view').selectOption('register');
  await importedWorkspace.getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'DOAS-1', exact: true }).click();
  await importedWorkspace.getByRole('button', { name: 'Remove from register', exact: true }).click();
  await importedWorkspace.getByLabel('Equipment decision reason').fill('Controlled operator withdrawal to test retained engineering access; not a real drawing revision.');
  await importedWorkspace.getByRole('button', { name: 'Preview decision', exact: true }).click();
  await importedWorkspace.getByRole('button', { name: 'Record decision', exact: true }).click();
  await waitForAsync(async () => (await importedSaved())?.equipment_events?.length === reviewed.equipment_events.length + 1, { timeout: 30000, label: 'Controlled equipment withdrawal' });
  await importedWorkspace.getByRole('button', { name: 'Review saved engineering', exact: true }).click();
  const retained = importedWorkspace.getByRole('region', { name: 'Engineering compatibility', exact: true });
  await retained.getByRole('heading', { name: 'Engineering', exact: true }).waitFor();
  assert.match(await retained.innerText(), /stale dependencies/);
  await retained.getByRole('button', { name: 'Read check', exact: true }).click();
  assert.match(await retained.innerText(), /Manually transcribed from drawing/);
  const withdrawn = await importedSaved();
  assert.deepEqual(withdrawn.engineering_events, reviewed.engineering_events);
  assert.deepEqual(withdrawn.captures, reviewed.captures);
  assert.deepEqual(withdrawn.equipment_events.slice(0, -1), reviewed.equipment_events);
  await importedPage.screenshot({ path: `${out}/withdrawn-engineering.png` });
  const withdrawnDownload = importedPage.waitForEvent('download');
  await importedWorkspace.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await withdrawnDownload).saveAs(`${out}/withdrawn.takeoff.json`);
  assert.deepEqual(JSON.parse(readFileSync(`${out}/withdrawn.takeoff.json`, 'utf8')).bas_workflow, withdrawn);
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source_sha256: sha, elapsed_ms: Math.round(performance.now() - started), layouts, errors,
    checks: ['original upload and ordinary import', 'two explicit resources', 'unknown preview without save', 'manual note evidence', 'citation navigation and draft return',
      'controlled pass preview/save', 'unchanged source/equipment/assembly histories', 'JSON export equality', 'reload and real Python replay',
      'visible input provenance and exact saved-source return', 'fresh-context reimport', 'controlled withdrawal keeps stale engineering accessible and exportable'],
    limits: 'One real signal-note workflow with controlled counterpart ratings. Not full engineering, real addenda, installed design or full-goal completion.' }, null, 2));
} catch (error) {
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  writeFileSync(`${out}/failure.json`, JSON.stringify({ error: String(error), errors }, null, 2)); throw error;
} finally { await browser.close(); }
