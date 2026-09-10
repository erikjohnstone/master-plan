// Actual original-PDF upload, production compile, ordinary UI edits and Python
// transport. The applicability and conflict/withdrawal decisions are controlled
// test inputs, not automatically extracted project facts or installed proof.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basEquipmentRegister } from '../src/lib/basEquipmentReview.ts';
import { basAssemblyView, basAssemblyCalculationState } from '../src/lib/basAssemblyReview.ts';

assert.ok(process.env.OT_UI_PDF && process.env.OT_BAS_OUT, 'Original Fort Sam development PDF and new evidence directory required');
const truth = JSON.parse(readFileSync(new URL('../test/fixtures/bas-requirement-source-cases.json', import.meta.url), 'utf8'));
const out = resolve(process.env.OT_BAS_OUT); mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], started = performance.now();
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5177';
const saved = p => p.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const workspace = p => p.getByRole('region', { name: 'Equipment and template assignments', exact: true });
const assembly = p => p.getByRole('region', { name: 'Assembly and responsibilities', exact: true });
const editor = p => p.getByRole('region', { name: 'Assembly decision editor', exact: true });
const equipmentEditor = p => p.getByRole('region', { name: 'Equipment decision editor', exact: true });
page.on('pageerror', error => { errors.push(String(error)); console.error(String(error)); });
async function upload(p) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  const observation = setInterval(() => p.evaluate(() => window.__opentakeoff?.graphPrewarm?.()).then(s => console.log('Index:', JSON.stringify(s))).catch(e => console.error(e.message)), 45000);
  try { await p.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 }); }
  finally { clearInterval(observation); }
  assert.equal(await p.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(p);
}
async function enter(p) {
  if (!await p.getByRole('button', { name: 'Equipment', exact: true }).isVisible()) await p.locator('[data-workspace-nav="Takeoff"]').click();
  await p.getByRole('button', { name: 'Equipment', exact: true }).click();
  await workspace(p).waitFor();
}
async function equipmentDecision(p, reason, count) {
  const e = equipmentEditor(p);
  await e.getByLabel('Equipment decision reason').fill(reason);
  await e.getByRole('button', { name: 'Preview decision', exact: true }).click();
  await e.getByRole('button', { name: 'Record decision', exact: true }).focus(); await p.keyboard.press('Enter');
  await waitForAsync(async () => (await saved(p))?.equipment_events?.length === count, { timeout: 30000, label: `equipment event ${count}` });
  await e.waitFor({ state: 'hidden' });
}
async function saveComponent(p, count) {
  const e = editor(p);
  await e.getByRole('button', { name: 'Preview assembly decision', exact: true }).focus(); await p.keyboard.press('Enter');
  await e.getByRole('region', { name: 'Assembly decision preview', exact: true }).waitFor();
  await e.getByRole('button', { name: 'Save assembly decision', exact: true }).focus(); await p.keyboard.press('Enter');
  await waitForAsync(async () => (await saved(p))?.assembly_events?.length === count, { timeout: 30000, label: `assembly event ${count}` });
  await e.waitFor({ state: 'hidden' });
}
async function exportRecord(p, name) {
  const pending = p.waitForEvent('download');
  await workspace(p).getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await pending).saveAs(`${out}/${name}.takeoff.json`);
  return JSON.parse(readFileSync(`${out}/${name}.takeoff.json`, 'utf8'));
}
async function calculate(p, count) {
  await assembly(p).getByRole('button', { name: 'Calculate assembly quantities', exact: true }).click();
  await waitForAsync(async () => (await saved(p))?.assembly_calculations?.length === count, { timeout: 60000, label: `assembly calculation ${count}` });
  await assembly(p).getByRole('button', { name: 'Calculate assembly quantities', exact: true }).waitFor({ state: 'visible' });
}

try {
  console.log('Uploading original nine-page Fort Sam source');
  await upload(page); await page.screenshot({ path: `${out}/upload.png` });
  const download = page.waitForEvent('download', { predicate: d => d.suggestedFilename().endsWith('.json'), timeout: 600000 });
  const answer = await page.evaluate(() => window.__opentakeoff.compileCorpusTakeoff('bas_points', { download: true }));
  assert.equal(answer.error, undefined, JSON.stringify(answer));
  await (await download).saveAs(`${out}/compile.json`);
  const compiled = JSON.parse(readFileSync(`${out}/compile.json`, 'utf8'));
  const capture = compiled.bas_workflow.captures[0];
  assert.equal(capture.sources[0].sha256, truth.source_sha256);
  await waitForAsync(async () => (await saved(page))?.current_capture_id === capture.capture_id, { timeout: 30000, label: 'original capture saved' });
  const original = await saved(page);
  await enter(page);
  await workspace(page).getByRole('button', { name: 'Create scope', exact: true }).click();
  await equipmentEditor(page).getByLabel('System', { exact: true }).fill('DOAS 1 and 2 — controlled source-reviewed applicability');
  await equipmentEditor(page).locator('summary').filter({ hasText: /^Drawing references/ }).click();
  await equipmentEditor(page).getByLabel('Find drawing text').fill(truth.scope_evidence.diagram_caption);
  await equipmentEditor(page).getByRole('checkbox', { name: /DOAS 1&2 P&ID.*PDF p\.8$/ }).check();
  await equipmentDecision(page, 'Caption on M-512 supports the selected DOAS pair; building, level and phase remain unknown', 1);
  let register = basEquipmentRegister(await saved(page), capture.capture_id);
  await workspace(page).getByRole('button', { name: 'Register printed members', exact: true }).click();
  await equipmentEditor(page).getByLabel('Equipment scope').selectOption(register.scopes[0].scope_id);
  for (const tag of ['DOAS-1', 'DOAS-2']) {
    // The real set also repeats the tag in the external-static-pressure fan
    // schedule. Select the independently keyed equipment-schedule occurrence,
    // not the first equal label and not all mentions as extra installations.
    const matches = compiled.bas_equipment.occurrences.filter(o => o.named_members?.includes(tag)
      && o.page_id === `sha256:${truth.source_sha256}:p${truth.scope_evidence.schedule_page}`);
    assert.equal(matches.length, 1, `one keyed M-601 equipment-schedule occurrence for ${tag}`);
    const occurrence = matches[0], sourceTable = capture.equipment_sources.tables[occurrence.table_index];
    const span = capture.narrative_sources.pages.find(p => p.page_number === truth.scope_evidence.schedule_page).spans
      .find(s => s.source_index === truth.scope_evidence.scheduled_members.find(m => m.tag === tag).span);
    const cell = sourceTable.rows[occurrence.row_index].cells[occurrence.mark_columns[0]];
    assert.equal(cell.text, tag);
    assert.ok(span.bbox_px[0] >= cell.bbox[0] && span.bbox_px[1] >= cell.bbox[1] && span.bbox_px[2] <= cell.bbox[2] && span.bbox_px[3] <= cell.bbox[3]);
    const control = equipmentEditor(page).getByRole('checkbox', { name: `Register ${tag} from ${sourceTable.title.text} row ${occurrence.row_index + 1}`, exact: true });
    assert.equal(await control.count(), 1); await control.check();
  }
  await equipmentDecision(page, 'Bind only the independently reviewed M-601 DOAS-1 and DOAS-2 schedule members; not installed proof', 2);
  register = basEquipmentRegister(await saved(page), capture.capture_id);
  assert.deepEqual(register.equipment.map(e => e.tag), ['DOAS-1', 'DOAS-2']);
  await workspace(page).getByLabel('Equipment table view').selectOption('register');
  await workspace(page).getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'DOAS-1', exact: true }).click();
  await workspace(page).getByRole('button', { name: 'Assembly & responsibilities', exact: true }).click();
  const declarations = [
    { kind: 'variable frequency drive', role: 'SUPPLY', name: 'Supply fan VFD' },
    { kind: 'variable frequency drive', role: 'EXHAUST', name: 'Exhaust fan VFD' },
    { kind: 'onboard controller', role: '', name: 'Onboard controller' },
  ];
  let count = 0;
  for (const source of declarations) {
    await assembly(page).getByRole('button', { name: 'Add from drawing declarations', exact: true }).click();
    const candidates = page.getByRole('region', { name: 'Drawing component declarations', exact: true });
    await candidates.getByLabel('Find declarations').fill(source.kind);
    const row = candidates.getByRole('row').filter({ has: page.getByText('Original wording · PDF p.8', { exact: true }) })
      .filter({ has: page.getByRole('rowheader').filter({ hasText: `${source.kind}${source.role ? ` ${source.role}` : ''}` }) });
    assert.equal(await row.count(), 1, `one original p8 ${source.name} declaration`);
    await row.getByRole('button', { name: 'Review this declaration', exact: true }).click();
    const e = editor(page);
    await e.getByLabel('Component label', { exact: true }).fill(source.name);
    assert.equal(await e.getByLabel('Declared assembly quantity').inputValue(), '1');
    await e.getByLabel('Assembly applicability', { exact: true }).selectOption('per_equipment');
    await e.getByLabel('Assembly select DOAS-2', { exact: true }).check();
    await e.getByLabel('Quantity and applicability reason').fill('Explicit p8 declaration applied to the source-reviewed DOAS-1 and DOAS-2 pair; each component role stays separate');
    await e.getByLabel('Condition', { exact: true }).selectOption('unconditional');
    await e.getByLabel('Condition decision reason').fill('This selected declaration contains an unconditional provision; no optional kit inferred');
    await e.getByLabel('Assembly decision reason').fill(`Source-backed ${source.name} for the reviewed pair; no installed quantity established`);
    await saveComponent(page, ++count);
  }
  console.log('Three real declarations saved through ordinary keyboard/UI actions');
  let reviewed = await saved(page), view = await basAssemblyView(reviewed, capture.capture_id);
  assert.equal(view.components.length, 3);
  assert.deepEqual(view.components.map(c => c.declarations[0].clause.page_id), Array(3).fill(`sha256:${truth.source_sha256}:p8`));
  assert.deepEqual(reviewed.captures, original.captures);
  const controller = view.components.find(c => c.record.label === 'Onboard controller');
  assert.equal(controller.responsibilities.find(r => r.activity === 'furnish').assignment, 'factory_furnished');
  assert.ok(controller.responsibilities.filter(r => r.activity !== 'furnish').every(r => r.assignment === 'unknown'));
  await calculate(page, 1);
  reviewed = await saved(page);
  assert.deepEqual(reviewed.assembly_calculations[0].result.components.map(c => c.assigned_quantity), [2, 2, 2]);
  assert.equal(reviewed.assembly_calculations[0].result.unique_physical_total, null);
  await calculate(page, 1);
  assert.equal((await saved(page)).assembly_calculations.length, 1);
  // A real responsibility conflict is created as an explicitly controlled user
  // decision. Source factory furnishing must remain present after resolution.
  const table = assembly(page).getByRole('table', { name: 'Equipment assembly', exact: true });
  await table.getByRole('row').filter({ hasText: 'Onboard controller' }).getByRole('button', { name: 'Edit component', exact: true }).click();
  const e = editor(page);
  await e.locator('summary').filter({ hasText: /^Responsibility decisions/ }).click();
  await e.getByRole('button', { name: 'Add responsibility decision', exact: true }).click();
  await e.getByLabel('Assignment', { exact: true }).selectOption('by_others');
  await e.getByLabel('Responsibility reason').fill('Controlled conflicting scope input for verification, not a drawing fact');
  await e.getByRole('button', { name: 'Preview assembly decision', exact: true }).click();
  // The basis cell includes both its status and all original claims; it is not
  // an element whose complete text is the one word "conflict". Inspect the
  // actual furnish row while retaining the full evidence in that cell.
  const conflictTable = e.getByRole('table', { name: 'Assembly responsibilities', exact: true });
  await conflictTable.waitFor({ state: 'visible' });
  const furnishRow = conflictTable.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'furnish', exact: true }) });
  assert.match(await furnishRow.locator('td').nth(1).innerText(), /^conflict\b/);
  assert.match(await furnishRow.locator('td').nth(1).innerText(), /factory furnished/);
  assert.match(await furnishRow.locator('td').nth(1).innerText(), /by others/);
  await e.locator('summary').filter({ hasText: /^Resolve responsibility conflicts/ }).click();
  await e.getByLabel('furnish resolution').selectOption(`${controller.declarations[0].component.requirement_id}:furnish`);
  await e.getByLabel('Resolution reason').fill('Retain and select explicit factory furnishing; keep the conflicting controlled decision in history');
  assert.equal(await e.getByRole('button', { name: 'Save assembly decision', exact: true }).isEnabled(), false);
  await saveComponent(page, ++count);
  reviewed = await saved(page);
  assert.equal(basAssemblyCalculationState(reviewed, capture.capture_id).status, 'stale_dependencies');
  view = await basAssemblyView(reviewed, capture.capture_id);
  const resolved = view.components.find(c => c.record.label === 'Onboard controller').responsibilities.find(r => r.activity === 'furnish');
  assert.equal(resolved.assignment, 'factory_furnished'); assert.equal(resolved.claims.length, 2); assert.equal(resolved.status, 'explicit_resolution');
  await calculate(page, 2);
  await table.getByRole('button', { name: 'Onboard controller', exact: true }).click();
  const detail = assembly(page).getByRole('region', { name: 'Selected assembly component', exact: true });
  await detail.locator('summary').filter({ hasText: /^Original source/ }).click();
  await detail.getByRole('button', { name: 'View PDF p.8', exact: true }).first().focus(); await page.keyboard.press('Enter');
  await workspace(page).waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__opentakeoff.probe.markups().some(m => m.source === 'takeoff_cite'));
  await page.getByText('Rendering sheet…', { exact: true }).waitFor({ state: 'hidden', timeout: 60000 });
  await page.screenshot({ path: `${out}/source.png` });
  await page.locator('[data-workspace-nav="Takeoff"]').click(); await assembly(page).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : 1080 });
      await table.scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${out}/${theme}-${width}-assembly.png` });
      await detail.getByRole('table', { name: 'Assembly responsibilities', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${out}/${theme}-${width}-responsibilities.png` });
    }
  }
  reviewed = await saved(page);
  assert.deepEqual((await exportRecord(page, 'reviewed')).bas_workflow, reviewed);
  await page.reload({ waitUntil: 'domcontentloaded' }); await enter(page);
  assert.deepEqual((await exportRecord(page, 'reloaded')).bas_workflow, reviewed);
  console.log('Original source jump/return, themes, export and reload passed');
  const imported = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  imported.on('pageerror', error => errors.push(String(error)));
  await upload(imported);
  await imported.locator('input[name="takeoff-import"]').setInputFiles(`${out}/reviewed.takeoff.json`);
  await waitForAsync(async () => (await saved(imported))?.assembly_events?.length === count, { timeout: 30000, label: 'ordinary import' });
  assert.deepEqual(await saved(imported), reviewed); await enter(imported);
  // Removing one actual registered member makes all three assemblies stale.
  // Repair two together and explicitly withdraw the third, retaining history.
  await workspace(imported).getByLabel('Equipment table view').selectOption('register');
  await workspace(imported).getByRole('table', { name: 'Equipment table', exact: true }).getByRole('button', { name: 'DOAS-2', exact: true }).click();
  await workspace(imported).getByRole('button', { name: 'Remove from register', exact: true }).click();
  await equipmentDecision(imported, 'Controlled withdrawal of DOAS-2 to exercise stale multi-component repair; not a drawing revision', 3);
  await workspace(imported).getByRole('button', { name: 'Review saved assemblies', exact: true }).click();
  await assembly(imported).waitFor();
  assert.equal(basAssemblyCalculationState(await saved(imported), capture.capture_id).status, 'stale_dependencies');
  const savedTable = assembly(imported).getByRole('table', { name: 'Equipment assembly', exact: true });
  for (const name of ['Supply fan VFD', 'Exhaust fan VFD']) {
    await savedTable.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Edit component', exact: true }).click();
    await editor(imported).getByRole('button', { name: 'Remove unavailable member from this draft', exact: true }).click();
    await editor(imported).getByLabel('Assembly decision reason').fill(`Controlled repair: ${name} now selected only for retained DOAS-1`);
    await editor(imported).getByRole('button', { name: 'Stage component edit', exact: true }).click();
    await editor(imported).waitFor({ state: 'hidden' });
  }
  await savedTable.getByRole('row').filter({ hasText: 'Onboard controller' }).getByRole('button', { name: 'Withdraw component', exact: true }).click();
  await assembly(imported).getByLabel('Withdrawal reason').fill('Controlled controller withdrawal while retaining its source and conflicting/resolved history');
  await assembly(imported).getByRole('button', { name: 'Stage withdrawal', exact: true }).click();
  const pending = assembly(imported).getByRole('region', { name: 'Pending assembly changes', exact: true });
  await pending.getByLabel('Overall assembly change reason').fill('Controlled multi-component rebase after member withdrawal, not an actual addendum');
  assert.deepEqual((await saved(imported)).assembly_events, reviewed.assembly_events, 'Staging cannot persist partial invalid records');
  await pending.getByRole('button', { name: 'Preview all pending assembly changes', exact: true }).click();
  await pending.getByRole('button', { name: 'Save all assembly changes', exact: true }).focus(); await imported.keyboard.press('Enter');
  await waitForAsync(async () => (await saved(imported))?.assembly_events?.length === count + 1, { timeout: 30000, label: 'complete staged repair saved' });
  await calculate(imported, 3);
  const rebased = await saved(imported);
  assert.deepEqual(await verifyBasWorkflow(rebased), rebased);
  assert.deepEqual(rebased.captures, original.captures);
  assert.deepEqual(rebased.assembly_events.slice(0, count), reviewed.assembly_events);
  assert.deepEqual(rebased.assembly_calculations.slice(0, 2), reviewed.assembly_calculations);
  assert.deepEqual(rebased.assembly_calculations[2].result.components.map(c => c.assigned_quantity), [1, 1]);
  assert.ok(rebased.assembly_events.at(-1).reason.includes('Controlled controller withdrawal'));
  await exportRecord(imported, 'rebased'); await imported.screenshot({ path: `${out}/rebased.png` });
  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source_sha256: truth.source_sha256,
    selected_source_members: ['DOAS-1', 'DOAS-2'], original_declaration_components: 3, original_assigned_contributions: [2, 2, 2],
    installed_quantity: null, elapsed_ms: Math.round(performance.now() - started), workflow_bytes: Buffer.byteLength(JSON.stringify(rebased)),
    checks: ['actual upload/production compile', 'independent source keys', 'ordinary source-owned equipment registration',
      'separate fan roles; point rows add no devices', 'factory furnishing only', 'explicit conflict and source-preserving resolution',
      'keyboard preview/save/calculation/source', 'shared Python retry/stale calculation', 'source paint/return', 'both themes/1280 and 1920',
      'autosave/reload/export/fresh import', 'removed member retains readable assemblies', 'atomic multi-component repair and reasoned withdrawal',
      'history preserved and recalculated'], limits: 'Controlled applicability/responsibility/rebase decisions on original PDF, not automatic applicability, installed verification, actual addendum or full-goal completion.', errors }, null, 2));
  console.log('Actual assembly UI workflow passed');
} catch (error) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors));
  writeFileSync(`${out}/visible-workspace.txt`, await workspace(page).innerText().catch(() => 'Workspace unavailable'));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {}); throw error;
} finally { await browser.close(); }
