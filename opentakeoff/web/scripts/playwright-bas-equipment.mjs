// Real source upload, production compile and ordinary editor interactions.
// The equipment key is independently authored; scope/reason are disclosed test
// decisions, not claims that this browser test infers project applicability.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { basEquipmentView, basEquipmentRegister } from '../src/lib/basEquipmentReview.ts';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_OUT, 'Real source PDF and output directory required');
const truth = JSON.parse(readFileSync(new URL('../test/fixtures/bas-equipment-system-cases.json', import.meta.url), 'utf8'));
const members = truth.membership_cases.flatMap(c => c.members);
const out = resolve(process.env.OT_BAS_OUT); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => { errors.push(String(e)); console.error('Browser error:', String(e)); });
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5177';
const saved = p => p.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const workspace = p => p.getByRole('region', { name: 'Equipment and template assignments', exact: true });
const editor = p => p.getByRole('region', { name: 'Equipment decision editor', exact: true });
async function upload(p) {
  console.log('Opening local app');
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  console.log('Source file selected; waiting for actual browser index');
  await p.screenshot({ path: `${out}/upload.png` });
  const heartbeat = setInterval(() => {
    p.evaluate(() => window.__opentakeoff?.graphPrewarm?.() || null).then(state => console.log('Browser index:', JSON.stringify(state))).catch(error => console.error('Browser index observation:', error.message));
  }, 45000);
  try { await p.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 }); }
  finally { clearInterval(heartbeat); }
  assert.equal(await p.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(p);
}
async function enter(p) {
  if (!await p.getByRole('button', { name: 'Equipment', exact: true }).isVisible()) await p.locator('[data-workspace-nav="Takeoff"]').click();
  await p.getByRole('button', { name: 'Equipment', exact: true }).click();
  await workspace(p).waitFor();
  return workspace(p);
}
async function record(p, reason, count) {
  const e = editor(p);
  await e.getByLabel('Equipment decision reason').fill(reason);
  await e.getByRole('button', { name: 'Preview decision', exact: true }).focus();
  await p.keyboard.press('Enter');
  await e.getByRole('region', { name: 'Validated equipment preview' }).waitFor();
  // Editing after preview must invalidate it, not silently save stale inputs.
  await e.getByLabel('Equipment decision reason').fill(`${reason} (reviewed)`);
  assert.equal(await e.getByRole('button', { name: 'Record decision', exact: true }).count(), 0);
  await e.getByRole('button', { name: 'Preview decision', exact: true }).click();
  await e.getByRole('button', { name: 'Record decision', exact: true }).focus();
  await p.keyboard.press('Enter');
  await waitForAsync(async () => (await saved(p))?.equipment_events?.length === count, { timeout: 30000, label: `equipment event ${count} durable` });
  await e.waitFor({ state: 'hidden' });
}
async function exportRecord(p, name) {
  const pending = p.waitForEvent('download');
  await workspace(p).getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  const path = `${out}/${name}.takeoff.json`;
  await (await pending).saveAs(path);
  return JSON.parse(readFileSync(path, 'utf8'));
}
async function attachApplicabilityReferences(p) {
  const e = editor(p);
  await e.locator('summary').filter({ hasText: /^Drawing references/ }).click();
  for (const entry of truth.membership_cases) {
    await e.getByLabel('Find drawing text').fill(entry.expression);
    const literal = entry.expression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = e.getByRole('checkbox', { name: new RegExp(`^${literal}.*PDF p\\.${truth.applicability_page}$`) });
    assert.equal(await match.count(), 1, `one exact source applicability span for ${entry.expression}`);
    await match.check();
  }
}
try {
  await upload(page);
  console.log('Actual Behavioral PDF uploaded; invoking production BAS compile');
  // Chrome evicted streaming inspector bodies in two retained attempts, even
  // with enlarged diagnostic buffers. Capture the application's actual compile
  // JSON download instead. No response replacement or domain fixture injection.
  const downloaded = page.waitForEvent('download', { predicate: d => d.suggestedFilename().endsWith('.json'), timeout: 600000 });
  const answer = await page.evaluate(() => window.__opentakeoff.compileCorpusTakeoff('bas_points', { download: true }));
  assert.equal(answer.error, undefined, JSON.stringify(answer));
  await (await downloaded).saveAs(`${out}/compile.json`);
  const compileJson = readFileSync(`${out}/compile.json`, 'utf8');
  const compiled = JSON.parse(compileJson);
  assert.ok(compiled?.bas_workflow, compiled?.bas_workflow_error);
  const capture = compiled.bas_workflow.captures[0];
  assert.equal(capture.sources[0].sha256, truth.source_sha256);
  assert.ok(capture.equipment_sources);
  await waitForAsync(async () => (await saved(page))?.current_capture_id === capture.capture_id, { timeout: 30000, label: 'initial capture save' });
  const initial = await saved(page);
  let w = await enter(page);
  await w.getByRole('button', { name: 'Create scope', exact: true }).click();
  await editor(page).getByLabel('System', { exact: true }).fill(truth.system);
  await attachApplicabilityReferences(page);
  await record(page, 'Controlled source-reviewed chilled-water membership scope; building, level and phase unknown', 1);
  const scope = basEquipmentRegister(await saved(page), capture.capture_id).scopes[0];
  const expectedSpans = truth.membership_cases.map(c => `sha256:${truth.source_sha256}:p${truth.applicability_page}:s${c.span_index}`);
  assert.deepEqual(scope.source_span_ids, expectedSpans);
  await w.getByRole('button', { name: 'Register printed members', exact: true }).click();
  await editor(page).getByLabel('Equipment scope').selectOption(scope.scope_id);
  for (const tag of members) {
    const checkbox = editor(page).getByRole('checkbox', { name: new RegExp(`^Register ${tag} from `) });
    assert.equal(await checkbox.count(), 1, `independent key has one exact printed member for ${tag}`);
    await checkbox.check();
  }
  await record(page, 'Bind fourteen independently reviewed named schedule members, not installed quantities', 2);
  let register = basEquipmentRegister(await saved(page), capture.capture_id);
  assert.deepEqual(register.equipment.map(e => e.tag).sort(), [...members].sort());
  await w.getByLabel('Equipment table view').selectOption('register');
  const table = w.getByRole('table', { name: 'Equipment table', exact: true });
  assert.equal(await table.locator('tbody tr').count(), 14);
  await table.getByRole('button', { name: 'CH-1', exact: true }).click();
  await w.getByRole('button', { name: 'Assign point list', exact: true }).click();
  const matrix = capture.points.matrices.find(m => m.raw.title.text.includes(truth.point_matrix_title) && m.raw.title.text.includes(truth.system));
  assert.ok(matrix);
  await editor(page).getByLabel('Assignment point matrix').selectOption(matrix.matrix_id);
  await editor(page).getByLabel('Applicability', { exact: true }).selectOption('system_once');
  for (const tag of members) await editor(page).getByLabel(`Select ${tag}`, { exact: true }).check();
  await attachApplicabilityReferences(page);
  await record(page, 'System matrix already lists these units and system-wide points; apply once, not fourteen times', 3);
  let reviewed = await saved(page);
  assert.deepEqual(reviewed.captures, initial.captures);
  let view = await basEquipmentView(reviewed, capture.capture_id);
  assert.equal(view.assignments.length, 1);
  assert.equal(view.assignments[0].applicability, 'system_once');
  assert.equal(view.assignments[0].included_equipment_ids.length, 14);
  assert.equal(view.assignments[0].installed_quantity, null);
  assert.deepEqual(view.assignments[0].source_span_ids, expectedSpans);
  const references = w.locator('details').filter({ has: page.locator('summary').filter({ hasText: /^Assignment evidence/ }) });
  await references.locator('summary').click();
  assert.equal(await references.getByRole('button', { name: `View PDF page ${truth.applicability_page}`, exact: true }).count(), 5);
  await references.getByRole('button', { name: `View PDF page ${truth.applicability_page}`, exact: true }).first().click();
  await w.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/applicability-source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await w.waitFor();
  console.log('Actual keyboard scope/member/assignment saves passed; shared view has 14 named members, matrix once');
  await w.getByRole('button', { name: 'Edit assignment', exact: true }).click();
  await editor(page).getByLabel('Exclude CH-3', { exact: true }).check();
  const draftReason = 'Controlled pending exception review; source return must retain this draft';
  await editor(page).getByLabel('Equipment decision reason').fill(draftReason);
  await w.getByRole('button', { name: 'View printed member', exact: true }).click();
  await w.waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await w.waitFor();
  assert.equal(await editor(page).getByLabel('Equipment decision reason').inputValue(), draftReason);
  assert.equal(await editor(page).getByLabel('Exclude CH-3', { exact: true }).isChecked(), true);
  await record(page, 'Controlled UI exception only, not a source assertion: exclude CH-3 from this assignment', 4);
  reviewed = await saved(page); view = await basEquipmentView(reviewed, capture.capture_id);
  assert.equal(view.assignments[0].included_equipment_ids.length, 13);
  assert.equal(view.register.equipment.length, 14);
  assert.deepEqual(reviewed.captures, initial.captures);
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
      await w.getByRole('heading', { name: 'CH-1', exact: true }).scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${theme}-${width}-detail.png` });
    }
  }
  const exported = await exportRecord(page, 'reviewed');
  assert.deepEqual(exported.bas_workflow, reviewed);
  await page.reload({ waitUntil: 'domcontentloaded' });
  w = await enter(page);
  assert.deepEqual((await exportRecord(page, 'reloaded')).bas_workflow, reviewed);
  await w.getByLabel('Equipment table view').selectOption('register');
  await w.getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'CH-1', exact: true }).click();
  assert.equal(await w.getByRole('button', { name: 'Edit assignment', exact: true }).count(), 1);
  console.log('Source return/draft, both themes/two widths, autosave/reload/export passed');
  const imported = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  imported.on('pageerror', e => errors.push(String(e)));
  await upload(imported);
  assert.equal(await saved(imported), undefined);
  await imported.locator('input[name="takeoff-import"]').setInputFiles(`${out}/reviewed.takeoff.json`);
  await waitForAsync(async () => (await saved(imported))?.equipment_events?.length === 4, { timeout: 30000, label: 'fresh-context assignment import' });
  assert.deepEqual(await saved(imported), reviewed);
  const iw = await enter(imported);
  await iw.getByLabel('Equipment table view').selectOption('register');
  await iw.getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'CH-1', exact: true }).click();
  await iw.getByRole('button', { name: 'Withdraw assignment', exact: true }).click();
  await record(imported, 'Withdraw the controlled test assignment while retaining original evidence and history', 5);
  const removed = await saved(imported);
  assert.deepEqual(removed.captures, initial.captures);
  assert.deepEqual(removed.equipment_events.slice(0, 4), reviewed.equipment_events);
  assert.equal((await basEquipmentView(removed, capture.capture_id)).assignments.length, 0);
  assert.equal(basEquipmentRegister(removed, capture.capture_id).equipment.length, 14);
  await exportRecord(imported, 'withdrawn');
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source_sha256: truth.source_sha256, named_members: 14,
    assignment_mode: 'system_once', explicit_test_exception: 'CH-3', included_after_test_exception: 13,
    installed_quantity: null, workflow_bytes: Buffer.byteLength(JSON.stringify(reviewed)), compile_export_bytes: Buffer.byteLength(compileJson),
    checks: ['real upload/compile', 'independent source member key', 'five literal applicability references attached and saved',
      'saved assignment reference opens original drawing', 'keyboard scope/member/assignment saves', 'preview invalidation on edit',
      'shared assignment parity', 'source paint/return/draft', 'exception preserves register', 'both themes/two widths', 'autosave/reload/export',
      'fresh-context import', 'withdrawal retains history'],
    limits: 'Explicit operator assignment workflow, not automatic applicability or installed proof. Test exception is a controlled user input, not printed source truth. No assignment-driven Python demand or full-goal completion claimed.', errors }, null, 2));
  console.log('Real equipment editing workflow passed');
} catch (e) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw e;
} finally { await browser.close(); }
