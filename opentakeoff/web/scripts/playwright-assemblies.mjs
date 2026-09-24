// Real PDF -> /__ot/assemblies-project (the production CLI) -> Takeoff -> Assemblies.
// Checks, in the running app and with nothing injected:
//   · the browser's records and lines are byte-identical to apply_assemblies over
//     MCP for the same PDF (mcp/scripts/assemblies-apply.mjs wrote OT_MCP_APPLY),
//     and the totals, exceptions and unit rows on screen are that report's;
//   · a unit's details open from the keyboard; an override asks for a reason and
//     is kept on the record;
//   · the library: the starter is read-only, a clone validates live, a saved
//     clone is offered as an update the project does not take until adopted
//     (A5), and deleting it withdraws the offer;
//   · both themes at three widths without a horizontal page scroll;
//   · the project file's assemblies block reaches IndexedDB, and a reload keeps
//     the pins and the override;
//   · "Download CSV set" gives the same bytes, file for file, as
//     apply_assemblies' export_dir (OT_MCP_EXPORT_DIR);
//   · project settings: the starter's hook-up defaults and the kit-maker
//     responsibility preset set from the panel, saved with the project, and the
//     mechanical-scope download equal to apply_assemblies with
//     settings { hookup_defaults, responsibility_preset } and export_scope
//     (OT_MCP_EXPORT_DIR_SCOPED); cleared again before the override checks.
//
//   OT_UI_PDF=plan.pdf OT_ASM_OUT=dir OT_MCP_APPLY=result.json OT_MCP_EXPORT_DIR=dir \
//     OT_MCP_EXPORT_DIR_SCOPED=dir2 node scripts/playwright-assemblies.mjs
// OT_UI_URL defaults to http://127.0.0.1:5173. OT_ASM_SMOKE=1 stops after the
// parity checks (a document with no typical-bearing unit has nothing to override).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';

assert.ok(process.env.OT_UI_PDF && process.env.OT_ASM_OUT && process.env.OT_MCP_APPLY && process.env.OT_MCP_EXPORT_DIR,
  'OT_UI_PDF, OT_ASM_OUT, OT_MCP_APPLY and OT_MCP_EXPORT_DIR are required');
const out = resolve(process.env.OT_ASM_OUT);
mkdirSync(out, { recursive: true });
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5173';
const smoke = process.env.OT_ASM_SMOKE === '1';
const mcp = JSON.parse(readFileSync(resolve(process.env.OT_MCP_APPLY), 'utf8'));
const REASON = "UI proof: the estimator's own choice";
const PRESET = 'valve-shipped-to-kit-maker';

const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const checks = [];
const timings = {};
const t = () => performance.now();

async function openAssemblies() {
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.locator('[data-takeoff-tab="assemblies"]').first().click();
  const panel = page.getByRole('region', { name: 'Assemblies', exact: true });
  await panel.waitFor({ state: 'visible', timeout: 30000 });
  // The starter library loads on demand; the header counts it.
  await page.waitForFunction(() => /\b[1-9]\d* assemblies\b/.test(document.querySelector('[data-assemblies-panel]')?.textContent || ''), null, { timeout: 60000 });
  return panel;
}

async function applyInPage() {
  return page.evaluate(async () => {
    const { applyAssemblies } = await import('/src/lib/assemblies/apply.ts');
    const { combinedLibrary } = await import('/src/lib/assemblies/libraryEdit.ts');
    const { projectLibrary } = await import('/src/lib/assemblies/projectState.ts');
    const { assembliesReport } = await import('/src/lib/assemblies/report.ts');
    const { loadStarterLibrary } = await import('/src/lib/assemblies/starterLibrary.ts');
    const { localStore } = await import('/src/lib/store.js');
    const project = window.__opentakeoff.probe.assembliesProject();
    const state = window.__opentakeoff.probe.assembliesState();
    const { library } = combinedLibrary(await loadStarterLibrary(), await localStore.loadEquipmentAssemblies());
    const applied = applyAssemblies({ project, library: projectLibrary(state, library), settings: state?.settings ?? {}, overrides: state?.overrides ?? [] });
    const report = assembliesReport(applied.instances, applied.applications, applied.lines);
    return { applications: JSON.stringify(applied.applications), lines: JSON.stringify(applied.lines), report: JSON.stringify(report) };
  });
}

async function annotations() {
  return page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).assemblies ?? null);
}

try {
  let t0 = t();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 1800000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  timings.index_s = Math.round((t() - t0) / 1000);
  await openImportedSheet(page);

  let panel = await openAssemblies();
  t0 = t();
  const response = page.waitForResponse((r) => r.url().includes('/__ot/assemblies-project'), { timeout: 1800000 });
  await panel.locator('[data-assemblies-load]').click();
  assert.equal((await response).status(), 200);
  const totalsEl = panel.locator('[data-assemblies-totals]');
  await totalsEl.waitFor({ state: 'visible', timeout: 120000 });
  timings.apply_s = Math.round((t() - t0) / 1000);
  checks.push('real /__ot/assemblies-project response');

  // Parity in the running app: the browser's own computation against MCP's.
  const mine = await applyInPage();
  writeFileSync(`${out}/browser-lines.json`, mine.lines);
  assert.equal(mine.applications, JSON.stringify(mcp.applications), 'browser records are the MCP records, byte for byte');
  assert.equal(mine.lines, JSON.stringify(mcp.lines), 'browser lines are the MCP lines, byte for byte');
  assert.equal(mine.report, JSON.stringify(mcp.report), 'the browser report is the MCP report');
  checks.push(`byte-identical to apply_assemblies over MCP (${mcp.applications.length} records, ${mcp.lines.length} lines)`);
  const shown = await totalsEl.evaluate((el) => ({ units: Number(el.dataset.units), unresolved: Number(el.dataset.unresolved), lines: Number(el.dataset.lines) }));
  assert.deepEqual(shown, { units: mcp.report.totals.units, unresolved: mcp.report.totals.by_status.unresolved, lines: mcp.report.totals.lines }, 'on-screen totals');
  const exceptionsShown = await panel.locator('[data-assemblies-exceptions]').count() ? Number(await panel.locator('[data-assemblies-exceptions]').getAttribute('data-assemblies-exceptions')) : 0;
  assert.equal(exceptionsShown, mcp.report.exceptions.length, 'exceptions listed first, all of them');
  assert.equal(await panel.locator('[data-assembly-unit]').count(), mcp.report.units.length, 'one row per unit and layer');
  checks.push('on-screen totals, exceptions and unit rows are the report');
  await page.screenshot({ path: `${out}/units.png` });

  // The CSV set: the download's files are export_dir's, byte for byte.
  const download = page.waitForEvent('download');
  await panel.locator('[data-assemblies-export]').click();
  const zipPath = `${out}/${(await download).suggestedFilename()}`;
  await (await download).saveAs(zipPath);
  const files = unzipSync(new Uint8Array(readFileSync(zipPath)));
  const mcpDir = resolve(process.env.OT_MCP_EXPORT_DIR);
  const expected = readdirSync(mcpDir).sort();
  assert.deepEqual(Object.keys(files).sort(), expected, 'the same files: eight CSVs and assemblies.pdf');
  const csvs = expected.filter((f) => f.endsWith('.csv'));
  for (const f of csvs) assert.equal(strFromU8(files[f]), readFileSync(`${mcpDir}/${f}`, 'utf8'), `${f}: the same bytes`);
  // The PDF carries its creation time, so it is compared as a PDF, not as bytes.
  assert.equal(strFromU8(files['assemblies.pdf'].slice(0, 5)), '%PDF-');
  checks.push(`CSV set download = export_dir, byte for byte (${csvs.length} CSV files; assemblies.pdf in both)`);

  // Project settings from the panel: the starter's hook-up defaults and a
  // responsibility preset, saved with the project; the mechanical scope's
  // download is apply_assemblies' with the same settings and export_scope.
  if (process.env.OT_MCP_EXPORT_DIR_SCOPED) {
    const settingsEl = panel.locator('[data-assemblies-settings]');
    await settingsEl.locator('summary').click();
    await settingsEl.locator('[data-assemblies-profile-defaults]').click();
    await settingsEl.locator('[data-assemblies-preset]').selectOption(PRESET);
    await page.waitForFunction((id) => (document.querySelector('[data-assemblies-presets-active]')?.dataset.assembliesPresetsActive || '').split(' ').includes(id), PRESET);
    const savedSettings = await waitForAsync(async () => {
      const a = await annotations();
      return a?.settings?.responsibility && a.settings.profile ? a.settings : null;
    }, { timeout: 30000, label: 'settings autosave' });
    assert.equal(savedSettings.responsibility['control-valve'].install, 'factory', 'the preset is saved with the project');
    await panel.locator('[data-assemblies-scope]').selectOption('mechanical');
    const scopedDownload = page.waitForEvent('download');
    await panel.locator('[data-assemblies-export]').click();
    const scopedZip = `${out}/${(await scopedDownload).suggestedFilename()}`;
    assert.match(scopedZip, /-mechanical\.zip$/);
    await (await scopedDownload).saveAs(scopedZip);
    const scopedFiles = unzipSync(new Uint8Array(readFileSync(scopedZip)));
    const scopedDir = resolve(process.env.OT_MCP_EXPORT_DIR_SCOPED);
    for (const f of readdirSync(scopedDir).filter((x) => x.endsWith('.csv'))) {
      assert.equal(strFromU8(scopedFiles[f]), readFileSync(`${scopedDir}/${f}`, 'utf8'), `${f}: mechanical scope under the preset, the same bytes`);
    }
    assert.notEqual(strFromU8(scopedFiles['lines.csv']), readFileSync(`${mcpDir}/lines.csv`, 'utf8'), 'the scope narrows lines.csv');
    checks.push('project settings: starter hook-up defaults + kit-maker preset saved; mechanical-scope download = apply_assemblies with the same settings and export_scope');
    await page.screenshot({ path: `${out}/settings.png` });
    // Back to no settings, so the checks below see the project as MCP applied it.
    await settingsEl.locator('[data-assemblies-profile-clear]').click();
    await settingsEl.getByRole('button', { name: 'Clear responsibility edits', exact: true }).click();
    await panel.locator('[data-assemblies-scope]').selectOption('');
    await waitForAsync(async () => {
      const a = await annotations();
      return a && Object.keys(a.settings ?? {}).length === 0 ? a : null;
    }, { timeout: 30000, label: 'settings cleared' });
    assert.equal((await applyInPage()).lines, JSON.stringify(mcp.lines), 'cleared: the lines are MCP\'s again');
    await settingsEl.locator('summary').click();
  }

  if (!smoke) {
    // A unit with a typical and options: its details open from the keyboard.
    const unit = mcp.report.units.find((u) => u.assembly && Object.keys(u.options).length);
    assert.ok(unit, 'the document has a unit with a typical and options');
    const toggle = panel.getByRole('button', { name: `${unit.tag} ${unit.layer} details`, exact: true }).first();
    await toggle.focus();
    await page.keyboard.press('Enter');
    const detail = panel.getByRole('region', { name: `${unit.tag} ${unit.layer} details`, exact: true }).first();
    await detail.waitFor({ state: 'visible' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    checks.push(`keyboard: ${unit.tag} (${unit.layer}) details`);

    // An override asks for a reason and is kept on the record.
    const [optionId, option] = Object.entries(unit.options)[0];
    const optionRow = () => detail.getByRole('table', { name: `${unit.tag} options` }).getByRole('row')
      .filter({ has: page.getByRole('cell', { name: optionId, exact: true }) });
    page.once('dialog', (d) => d.accept(REASON));
    await optionRow().getByRole('button').click();
    await panel.locator('[data-assemblies-overrides="1"]').waitFor({ state: 'visible' });
    assert.ok(await panel.getByText(REASON, { exact: false }).isVisible(), 'the reason is shown with the override');
    const cells = optionRow().getByRole('cell');
    assert.equal((await cells.nth(1).innerText()).trim(), String(!(option.value === true)), 'the value is the one chosen');
    assert.equal((await cells.nth(2).innerText()).trim(), 'user', 'the option now comes from the user');
    checks.push(`override ${unit.tag} ${optionId} with a reason`);
    await page.screenshot({ path: `${out}/override.png` });

    // The library: read-only starter, live validation, an update the project
    // does not take until adopted.
    await panel.getByRole('button', { name: /^Library/ }).click();
    const lib = page.getByRole('region', { name: 'Assembly library', exact: true });
    await lib.waitFor({ state: 'visible' });
    const target = unit.assembly.split('@')[0];
    await lib.locator(`[data-assembly-id="${target}"]`).click();
    await lib.getByRole('button', { name: 'Clone to edit', exact: true }).click();
    const editor = lib.getByRole('textbox', { name: 'Assembly definition (JSON)' });
    await editor.waitFor({ state: 'visible' });
    await lib.getByText('Valid against the library.').waitFor();
    const clone = JSON.parse(await editor.inputValue());
    assert.equal(clone.status, 'partner_edited');
    await editor.fill(JSON.stringify({ ...clone, applies_to: { ...clone.applies_to, selector: "attr.no_such_attribute = 'x'" } }, null, 2));
    await lib.locator('[data-assembly-edit-errors]').waitFor({ state: 'visible' });
    assert.match(await lib.locator('[data-assembly-edit-errors]').innerText(), /no_such_attribute/);
    await editor.fill(JSON.stringify(clone, null, 2));
    await lib.getByText('Valid against the library.').waitFor();
    await lib.getByRole('button', { name: 'Save to my library', exact: true }).click();
    await lib.locator(`[data-assemblies-updates]`).waitFor({ state: 'visible' });
    assert.ok(await lib.getByRole('button', { name: `Adopt ${target}@${clone.version}`, exact: true }).isVisible(), 'the pinned project is offered the update, not given it');
    assert.equal((await annotations())?.pinned?.find((a) => a.id === target)?.version, unit.assembly.split('@')[1], 'the project still pins the version it applied');
    await page.screenshot({ path: `${out}/library-update.png` });
    await lib.getByRole('button', { name: 'Delete my version', exact: true }).click();
    await lib.locator('[data-assemblies-updates]').waitFor({ state: 'detached' });
    assert.equal((await page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadEquipmentAssemblies()).length)), 0);
    checks.push(`library: clone ${target}, live validation, update offered not applied (A5), delete withdraws it`);
    await panel.getByRole('button', { name: 'Units', exact: true }).click();

    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForFunction((th) => document.documentElement.dataset.theme === th, theme);
      for (const width of [1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : 1080 });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}: no horizontal page scroll`);
        await page.screenshot({ path: `${out}/${theme}-${width}.png` });
      }
    }
    checks.push('both themes at 1280, 1440 and 1920 without a horizontal page scroll');

    // The project file's block reaches IndexedDB; a reload keeps it.
    const saved = await waitForAsync(async () => {
      const a = await annotations();
      return a?.overrides?.length === 1 && a.pinned.length > 0 ? a : null;
    }, { timeout: 30000, label: 'assemblies autosave' });
    assert.equal(saved.overrides[0].reason, REASON);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openImportedSheet(page);
    panel = await openAssemblies();
    assert.match(await panel.innerText(), new RegExp(`${saved.pinned.length} pinned in this project`));
    const again = page.waitForResponse((r) => r.url().includes('/__ot/assemblies-project'), { timeout: 1800000 });
    await panel.locator('[data-assemblies-load]').click();
    assert.equal((await again).status(), 200);
    await panel.locator('[data-assemblies-overrides="1"]').waitFor({ state: 'visible', timeout: 120000 });
    assert.deepEqual(await annotations(), saved, 'reload keeps the pins, settings and override');
    checks.push('actual IndexedDB autosave; reload keeps pins and the override');
  }

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source: process.env.OT_UI_PDF, smoke, timings,
    totals: mcp.report.totals, exceptions: mcp.report.exceptions.length, checks, errors }, null, 2));
  console.log(`Assemblies UI proof passed (${checks.length} checks): ${checks.join('; ')}`);
} catch (error) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors, null, 2));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
