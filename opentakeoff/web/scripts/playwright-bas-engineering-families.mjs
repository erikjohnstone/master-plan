/** Original PDF + ordinary controlled review imports. All inputs are declared
 * test capabilities, not extracted ratings. Actual UI edits and shared Python
 * calculations; no fixture responses, React injection or extraction changes. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { basEngineeringHeads } from '../src/lib/basEngineeringReview.ts';
import { ENGINEERING_LABELS } from '../src/lib/basEngineeringLabels.ts';
import { engineeringCheckShape, editorSchema, engineeringRatingShape } from '../src/components/basEngineeringEditorState.ts';
import { controlledEngineeringCases } from '../../mcp/test/helpers/basEngineeringCases.ts';
import { applyBasEngineeringReview, verifyBasEngineeringHistory } from '../../mcp/src/basEngineeringReview.ts';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';

const [pdfPath, archivePath, outputPath] = process.argv.slice(2);
assert.ok(pdfPath && archivePath && outputPath, 'Original PDF, source-reviewed JSON and new output directory required');
const pdf = resolve(pdfPath), archive = JSON.parse(readFileSync(resolve(archivePath), 'utf8')), out = resolve(outputPath);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const baseline = await verifyBasWorkflow(archive.bas_workflow), captureId = baseline.current_capture_id;
const sourceHash = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(baseline.captures.find(c => c.capture_id === captureId).sources.some(s => s.sha256 === sourceHash));
const heads = basEngineeringHeads(baseline, captureId);
const equipment = baseline.equipment_events.find(e => e.event_id === heads.equipment).register.equipment;
assert.ok(equipment.length >= 2 && equipment[0].scope_id === equipment[1].scope_id, 'Two reviewed same-scope owners required');
const { cases, python } = controlledEngineeringCases([equipment[0].equipment_id, equipment[1].equipment_id], equipment[0].scope_id);
assert.equal(Object.keys(cases).length, 11);
const human = value => String(value).replace(/_/g, ' ').replace(/\b(ip|io|dc|ac)\b/gi, s => s.toUpperCase());
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], observations = [], fields = [], layouts = [], start = performance.now();
let phase = 'upload', family = '', seed = baseline;
page.on('pageerror', e => errors.push(String(e)));
const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow);
const workspace = page.getByRole('region', { name: 'Equipment and template assignments', exact: true });
const engineering = page.getByRole('region', { name: 'Engineering compatibility', exact: true });
const changes = engineering.getByRole('region', { name: 'Engineering changes', exact: true });
const preview = engineering.getByRole('region', { name: 'Engineering calculation preview', exact: true });
const row = kind => engineering.getByRole('table', { name: 'Engineering checks', exact: true }).getByRole('row')
  .filter({ has: page.getByRole('rowheader', { name: ENGINEERING_LABELS[kind], exact: true }) });
async function field(key) {
  await changes.getByRole('navigation', { name: 'Engineering input fields' }).getByRole('button', { name: `Edit ${human(key)}`, exact: true }).click();
}
/** Verify every rendered scalar and visit each nested list entry. This reader
 * uses the existing schema only for traversal, never to generate outcomes. */
async function readField(raw, value, label, parent, path) {
  const schema = editorSchema(raw);
  if (schema instanceof z.ZodLiteral) { assert.equal(value, schema.value); return; }
  if (schema instanceof z.ZodNullable) {
    const group = parent.getByRole('group', { name: label, exact: true }).first();
    assert.equal(await group.getByLabel(`${label}: information available`, { exact: true }).inputValue(), value === null ? 'unknown' : 'known', path);
    fields.push({ family, path, kind: value === null ? 'null' : 'known' });
    if (value !== null) await readField(schema.unwrap(), value, label, group, path);
    return;
  }
  const rating = engineeringRatingShape(schema);
  if (rating) {
    const group = parent.getByRole('group', { name: `${label}: declared information`, exact: true });
    assert.equal(await group.getByLabel(`${label}: input basis`, { exact: true }).inputValue(), value.basis.origin, path);
    assert.equal(await group.getByLabel(`${label}: reason`, { exact: true }).inputValue(), value.basis.reason, path);
    assert.deepEqual(value.basis.source_span_ids, [], 'Controlled capabilities are not relabeled drawing transcriptions');
    await readField(rating.shape.value, value.value, label, group, `${path}.value`); return;
  }
  if (schema instanceof z.ZodObject) {
    const group = parent.getByRole('group', { name: label, exact: true }).first();
    for (const [key, child] of Object.entries(schema.shape)) await readField(child, value[key], human(key), group, `${path}.${key}`);
    return;
  }
  if (schema instanceof z.ZodArray) {
    const group = parent.getByRole('group', { name: `${label} · ${value.length} entries`, exact: true });
    for (let i = 0; i < value.length; i++) {
      await group.getByLabel(`${label}: selected entry`, { exact: true }).fill(String(i + 1));
      await readField(schema.element, value[i], `${label} entry ${i + 1}`, group, `${path}.${i}`);
    }
    fields.push({ family, path, kind: 'array', length: value.length }); return;
  }
  assert.equal(await parent.getByLabel(label, { exact: true }).inputValue(), String(value), path);
  fields.push({ family, path, kind: typeof value });
}
async function record(before, expectedRegister, expectedStatus) {
  await changes.getByLabel('Engineering review reason', { exact: true }).fill(`Controlled ${family} form proof, not an extracted configuration or installed design.`);
  await changes.getByRole('button', { name: 'Preview & calculate', exact: true }).click();
  await preview.getByRole('button', { name: 'Record engineering decision', exact: true }).waitFor({ state: 'visible' });
  same(await saved(), before, 'Preview must not persist');
  await preview.getByRole('button', { name: 'Record engineering decision', exact: true }).focus(); await page.keyboard.press('Enter');
  await waitForAsync(async () => (await saved())?.engineering_events?.length === before.engineering_events.length + 1,
    { timeout: 60000, label: `${family} UI decision persisted` });
  const after = await verifyBasEngineeringHistory(await saved(), { python });
  same(after.captures, baseline.captures, 'Original captures');
  same(after.equipment_events, baseline.equipment_events, 'Reviewed equipment');
  same(after.assembly_events, baseline.assembly_events, 'Assembly history');
  same(after.engineering_events.slice(0, -1), before.engineering_events, 'Earlier results');
  same(after.engineering_events.at(-1).register, expectedRegister, 'All original inputs except explicit form edit');
  assert.equal(after.engineering_events.at(-1).result.status, expectedStatus);
  assert.equal(after.engineering_events.at(-1).result.project_complete, false);
  return after;
}
async function captureLayouts(name) {
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.waitForFunction(t => document.documentElement.dataset.theme === t, theme);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : 1080 });
      await changes.locator('.bas-engineering-form-layout').scrollIntoViewIfNeeded();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: resolve(out, `${name}-${theme}-${width}.png`) }); layouts.push({ name, theme, width });
    }
  }
}
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdf);
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  for (const [name, originalRegister] of Object.entries(cases)) {
    family = name; phase = 'controlled review preparation'; console.log(`Starting ${name}`);
    // Continue the preceding saved history. An alternate branch from baseline
    // correctly refuses ordinary import; that is not a form defect to bypass.
    const currentHeads = basEngineeringHeads(seed, captureId);
    const prepared = await applyBasEngineeringReview(seed, { operation_id: randomUUID(), capture_id: captureId,
      expected_head: currentHeads.engineering, expected_equipment_head: currentHeads.equipment, expected_assembly_head: currentHeads.assembly,
      expected_sequence_head: currentHeads.sequence, register: originalRegister, reason: `Controlled ${name} inputs for form verification only.` }, 'operator_input', { python });
    assert.equal(prepared.event.result.status, 'pass');
    const imported = resolve(out, `${name}-input.takeoff.json`);
    writeFileSync(imported, JSON.stringify({ ...archive, bas_workflow: prepared.workflow }));
    phase = 'ordinary import';
    if (observations.length) {
      await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
      await openImportedSheet(page);
    }
    await page.locator('input[name="takeoff-import"]').setInputFiles(imported);
    await waitForAsync(async () => (await saved())?.engineering_events?.at(-1)?.event_id === prepared.event.event_id,
      { timeout: 30000, label: `${name} ordinary import` });
    same(await saved(), prepared.workflow, 'Ordinary source-owned import');
    await page.locator('[data-workspace-nav="Takeoff"]').click(); await page.getByRole('button', { name: 'Equipment', exact: true }).click();
    await workspace.getByRole('button', { name: 'Review saved engineering', exact: true }).click();
    let current = prepared.workflow, expected = structuredClone(originalRegister);
    for (const check of originalRegister.input.checks) {
      phase = `read ${check.kind}`; await row(check.kind).getByRole('button', { name: 'Edit check', exact: true }).click();
      for (const [key, schema] of Object.entries(engineeringCheckShape(check.kind).shape)) {
        if (['kind', 'check_id', 'equipment_ids', 'reason'].includes(key)) continue;
        await field(key); await readField(schema, check[key], human(key), changes.locator('.bas-engineering-form-layout'), `${check.check_id}.${key}`);
      }
      same(await saved(), current, 'Reading list entries cannot save or mutate inputs');
      expected.input.checks.find(c => c.check_id === check.check_id).reason = `${check.reason}; all visible fields reviewed through the browser.`;
      await changes.getByLabel('Check decision reason', { exact: true }).fill(expected.input.checks.find(c => c.check_id === check.check_id).reason);
      phase = `record ${check.kind}`; current = await record(current, expected, 'pass');
    }
    // Two independent nested correction journeys: a startup load and a duplicate
    // serial address. Neither is generated from or claimed to be on the PDF.
    if (name === 'power' || name === 'serial') {
      const kind = name === 'power' ? 'power' : 'serial_network';
      const top = name === 'power' ? 'scenarios' : 'nodes';
      await row(kind).getByRole('button', { name: 'Edit check', exact: true }).click(); await field(top);
      if (name === 'power') {
        const states = changes.getByRole('group', { name: 'states · 2 entries', exact: true });
        await states.getByLabel('states: selected entry', { exact: true }).fill('1');
        await states.getByLabel('state', { exact: true }).selectOption('startup');
        expected.input.checks[0].scenarios[0].states[0].state.value = 'startup';
      } else {
        await changes.getByLabel('nodes: selected entry', { exact: true }).fill('2');
        await changes.getByLabel('address', { exact: true }).fill('1');
        expected.input.checks[0].nodes[1].address.value = 1;
      }
      phase = 'failed nested correction'; await captureLayouts(`${name}-edit`); current = await record(current, expected, 'fail');
      assert.ok(current.engineering_events.at(-1).result.checks.some(c => c.constraints.some(r => r.status === 'fail')));
      await row(kind).getByRole('button', { name: 'Edit check', exact: true }).click(); await field(top);
      if (name === 'power') {
        await changes.getByLabel('states: selected entry', { exact: true }).fill('1');
        await changes.getByLabel('state', { exact: true }).selectOption('operating');
        expected.input.checks[0].scenarios[0].states[0].state.value = 'operating';
      } else {
        await changes.getByLabel('nodes: selected entry', { exact: true }).fill('2');
        await changes.getByLabel('address', { exact: true }).fill('2');
        expected.input.checks[0].nodes[1].address.value = 2;
      }
      phase = 'corrected nested value'; current = await record(current, expected, 'pass');
      assert.equal(current.engineering_events.at(-2).result.status, 'fail');
    }
    phase = 'export/reload';
    const download = page.waitForEvent('download'); await workspace.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
    const exported = resolve(out, `${name}-reviewed.takeoff.json`); await (await download).saveAs(exported);
    same(JSON.parse(readFileSync(exported, 'utf8')).bas_workflow, current, 'Export exact history');
    await page.reload({ waitUntil: 'domcontentloaded' }); same(await saved(), current, 'Reload exact history');
    seed = current;
    observations.push({ family: name, checks: originalRegister.input.checks.length, ui_recorded_events: current.engineering_events.length - prepared.workflow.engineering_events.length,
      visited_fields: fields.filter(f => f.family === name).length, exact_export_reload: true });
    writeFileSync(resolve(out, 'progress.json'), JSON.stringify({ observations, fields, errors, layouts }, null, 2));
    console.log(`Passed ${name}`);
  }
  assert.equal(errors.length, 0);
  const result = { source_sha256: sourceHash, observations, fields, layouts, errors, duration_ms: Math.round(performance.now() - start),
    limits: 'One original PDF, eleven controlled capability families bound to reviewed owners. Tests form fidelity/corrections, not discovery, independent arithmetic truth or real addenda.' };
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify({ ...result, fields: fields.length }));
} catch (error) {
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ family, phase, error: String(error), stack: error.stack, observations, fields, errors }, null, 2));
  await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error;
} finally { await browser.close(); }
