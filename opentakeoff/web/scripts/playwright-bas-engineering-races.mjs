/** Actual PDF + ordinary import + actual HTTP/Python responses. The only fault
 * injection delays fetch delivery and ignores its abort signal; it cannot
 * fabricate outcomes, modify workflow state, or select engineering ratings. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';
import { verifyBasWorkflow } from '../src/lib/basWorkflow.ts';
import { assertProofEqual as same } from '../../mcp/scripts/helpers/proofEquality.ts';

const [pdfPath, reviewedPath, withdrawnPath, outputPath] = process.argv.slice(2);
assert.ok(pdfPath && reviewedPath && withdrawnPath && outputPath, 'Usage: original PDF, reviewed JSON, controlled withdrawal JSON, new output directory');
const pdf = resolve(pdfPath), imported = resolve(reviewedPath), withdrawnFile = resolve(withdrawnPath), out = resolve(outputPath);
assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const baseline = await verifyBasWorkflow(JSON.parse(readFileSync(imported, 'utf8')).bas_workflow);
const withdrawn = await verifyBasWorkflow(JSON.parse(readFileSync(withdrawnFile, 'utf8')).bas_workflow);
same(withdrawn.engineering_events, baseline.engineering_events, 'Controlled withdrawal retains prior engineering');
assert.equal(withdrawn.equipment_events.length, baseline.equipment_events.length + 1);
const sha = createHash('sha256').update(readFileSync(pdf)).digest('hex');
assert.ok(baseline.captures.some(c => c.sources.some(s => s.sha256 === sha)));
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
// Shared-path gate: no. These observations are browser-harness diagnostics;
// production persistence, matching and engineering decisions are untouched.
const errors = [], checks = [], timings = [], started = performance.now(); let activePage;
async function timed(label, operation) {
  const start = performance.now();
  try { return await operation(); }
  finally {
    const observation = { label, start_ms: Math.round(start - started), duration_ms: Math.round(performance.now() - start) };
    timings.push(observation); console.log(JSON.stringify(observation));
  }
}
const saved = page => timed('read full persisted workflow', () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).bas_workflow));

async function setup() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); activePage = page;
  page.on('pageerror', error => errors.push(String(error)));
  await timed('open application', () => page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5177', { waitUntil: 'domcontentloaded' }));
  await timed('upload original PDF', () => page.locator('input[name="sheet-file"]').first().setInputFiles(pdf));
  await timed('wait for graph readiness', () => page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 600000 }));
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await timed('open imported sheet', () => openImportedSheet(page));
  await timed('ordinary takeoff import', () => page.locator('input[name="takeoff-import"]').setInputFiles(imported));
  await waitForAsync(async () => (await saved(page))?.engineering_events?.length === baseline.engineering_events.length, { timeout: 30000 });
  same(await saved(page), baseline, 'Ordinary initial import');
  await timed('open Takeoff workspace', () => page.locator('[data-workspace-nav="Takeoff"]').click());
  await page.getByRole('button', { name: 'Equipment', exact: true }).click();
  const workspace = page.getByRole('region', { name: 'Equipment and template assignments', exact: true });
  await workspace.getByRole('button', { name: 'Review saved engineering', exact: true }).click();
  const engineering = page.getByRole('region', { name: 'Engineering compatibility', exact: true });
  await engineering.getByRole('button', { name: 'Edit check', exact: true }).click();
  const changes = engineering.getByRole('region', { name: 'Engineering changes', exact: true });
  await changes.getByLabel('Check decision reason', { exact: true }).fill('Controlled browser race test; retained source inputs and capabilities are unchanged.');
  await changes.getByLabel('Engineering review reason', { exact: true }).fill('Test cancellation and stale response protection without altering engineering inputs.');
  return { page, workspace, engineering, changes, preview: engineering.getByRole('region', { name: 'Engineering calculation preview', exact: true }) };
}

async function holdNext(page) {
  await page.evaluate(() => {
    const original = window.fetch;
    const gate = { held: false, delivered: false, calls: 0, ok: false, eventId: null, release: null, restore: () => { window.fetch = original; } };
    window.__engineeringRace = gate;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!url?.includes('/__ot/bas-engineering')) return original(input, init);
      gate.calls++;
      // Intentional adversarial transport: still forward the actual request,
      // but do not let abort prevent the computed response from arriving late.
      const response = await original(input, { ...init, signal: undefined });
      const body = await response.clone().json();
      gate.ok = response.ok; gate.eventId = body.event?.event_id || null;
      await new Promise(resolveGate => { gate.release = resolveGate; gate.held = true; });
      gate.delivered = true; return response;
    };
  });
}
async function held(page) {
  await page.waitForFunction(() => window.__engineeringRace?.held, null, { timeout: 60000 });
  const result = await page.evaluate(() => ({ ok: window.__engineeringRace.ok, eventId: window.__engineeringRace.eventId, calls: window.__engineeringRace.calls }));
  assert.equal(result.ok, true); assert.equal(result.calls, 1); assert.match(result.eventId, /^[a-f0-9]{64}$/);
  return result;
}
async function release(page) { await page.evaluate(() => { window.__engineeringRace.restore(); window.__engineeringRace.release(); }); }
async function exportExact(workspace, page, filename, expected) {
  const download = page.waitForEvent('download');
  await workspace.getByRole('button', { name: 'Export evidence & decisions', exact: true }).click();
  await (await download).saveAs(resolve(out, filename));
  same(JSON.parse(readFileSync(resolve(out, filename), 'utf8')).bas_workflow, expected, 'Export exact retained history');
}
try {
  const a = await setup();
  console.log('Cancel preview after actual Python response is ready');
  await holdNext(a.page); await a.changes.getByRole('button', { name: 'Preview & calculate', exact: true }).click();
  const cancelledPreview = await held(a.page);
  await a.engineering.getByRole('button', { name: 'Cancel operation', exact: true }).click(); await release(a.page);
  await a.engineering.getByRole('button', { name: 'Cancel operation', exact: true }).waitFor({ state: 'hidden' });
  assert.match(await a.engineering.innerText(), /cancelled/); same(await saved(a.page), baseline, 'Cancelled preview preserves history');
  assert.equal(await a.preview.count(), 0); assert.match(await a.changes.getByLabel('Check decision reason').inputValue(), /Controlled browser race test/);
  checks.push({ name: 'cancelled preview retains history and draft', response: cancelledPreview });
  await a.changes.getByRole('button', { name: 'Preview & calculate', exact: true }).click(); await a.preview.waitFor();
  same(await saved(a.page), baseline, 'Retry preview does not save');
  console.log('Cancel recording after actual Python response is ready');
  await holdNext(a.page); await a.preview.getByRole('button', { name: 'Record engineering decision', exact: true }).click();
  const cancelledRecord = await held(a.page);
  await a.engineering.getByRole('button', { name: 'Cancel operation', exact: true }).click(); await release(a.page);
  await a.engineering.getByRole('button', { name: 'Cancel operation', exact: true }).waitFor({ state: 'hidden' });
  same(await saved(a.page), baseline, 'Cancelled record preserves history');
  await a.page.screenshot({ path: resolve(out, 'cancelled-record.png') });
  checks.push({ name: 'cancelled record retains history and preview', response: cancelledRecord });
  await a.preview.getByRole('button', { name: 'Record engineering decision', exact: true }).click();
  await waitForAsync(async () => (await saved(a.page))?.engineering_events?.length === baseline.engineering_events.length + 1, { timeout: 60000 });
  const recorded = await verifyBasWorkflow(await saved(a.page));
  same(recorded.captures, baseline.captures, 'Retry keeps captures'); same(recorded.engineering_events.slice(0, -1), baseline.engineering_events, 'Retry retains earlier engineering');
  assert.equal(recorded.engineering_events.length, baseline.engineering_events.length + 1);
  await exportExact(a.workspace, a.page, 'retry.takeoff.json', recorded);
  await a.page.reload({ waitUntil: 'domcontentloaded' }); same(await saved(a.page), recorded, 'Retry persists across reload');
  checks.push({ name: 'explicit retry saves exactly one event, export/reload exact' });
  await a.page.close();

  const b = await setup();
  await b.changes.getByRole('button', { name: 'Preview & calculate', exact: true }).click(); await b.preview.waitFor();
  console.log('Delay recording across ordinary import of controlled newer decisions');
  await holdNext(b.page); await b.preview.getByRole('button', { name: 'Record engineering decision', exact: true }).click();
  const staleResponse = await held(b.page);
  await b.page.locator('input[name="takeoff-import"]').setInputFiles(withdrawnFile);
  await waitForAsync(async () => (await saved(b.page))?.equipment_events?.length === withdrawn.equipment_events.length, { timeout: 30000 });
  same(await saved(b.page), withdrawn, 'Changed decisions imported before old response arrives');
  await release(b.page);
  await b.engineering.getByRole('button', { name: 'Cancel operation', exact: true }).waitFor({ state: 'hidden' });
  await b.page.waitForFunction(() => window.__engineeringRace.delivered);
  same(await saved(b.page), withdrawn, 'Late response cannot overwrite new dependency');
  await b.page.screenshot({ path: resolve(out, 'stale-response.png') });
  await exportExact(b.workspace, b.page, 'stale-preserved.takeoff.json', withdrawn);
  await b.page.reload({ waitUntil: 'domcontentloaded' }); same(await saved(b.page), withdrawn, 'Late refusal persists across reload');
  checks.push({ name: 'late response after controlled newer import rejected, export/reload exact', response: staleResponse });
  assert.deepEqual(errors, []);
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify({ ok: true, source_sha256: sha, elapsed_ms: Math.round(performance.now() - started), checks, errors, timings,
    limits: 'Controlled browser transport delay ignoring abort, actual HTTP/Python replies and ordinary imports. Existing source-derived reviewed input includes controlled counterparts. Not real addenda, every browser failure mode, or full-goal completion.' }, null, 2));
} catch (error) {
  await activePage?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  writeFileSync(resolve(out, 'failure.json'), JSON.stringify({ error: String(error), checks, errors, timings }, null, 2)); throw error;
} finally { await browser.close(); }
