// Real PDF -> /__ot/assemblies-project (the production CLI) -> Takeoff -> Assemblies.
// Checks, in the running app, with nothing injected but one saved option and one
// saved switch (below):
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
//     the pins and the override; an option the saved override sets that its
//     unit's typical has not (written into the saved project, as a file saved
//     before its typical was updated or an agent's typo would) is marked not
//     applied after the reload, and the rest of the override applies (AS-49);
//     a hook-up switch no line of the library names, written the same way, is
//     listed at the top of Project settings (AS-50);
//   · "Download CSV set" gives the same bytes, file for file, as
//     apply_assemblies' export_dir (OT_MCP_EXPORT_DIR);
//   · project settings: the starter's hook-up defaults and the kit-maker
//     responsibility preset set from the panel, saved with the project, and the
//     mechanical-scope download equal to apply_assemblies with
//     settings { hookup_defaults, responsibility_preset } and export_scope
//     (OT_MCP_EXPORT_DIR_SCOPED); cleared again before the override checks;
//   · another typical chosen from a unit's details, with a reason, and the
//     same choice for every row of a schedule like one unit (AS-55);
//   · the overrides of that choice for all as one row, removed in one step
//     (AS-59);
//   · the library CSV exported and read back from a spreadsheet's plain
//     Windows-1252 CSV with TRUE and FALSE, unchanged (AS-60);
//   · a sheet added after the schedules were read, named over the earlier
//     set's units (AS-58).
//
//   OT_UI_PDF=plan.pdf OT_ASM_OUT=dir OT_MCP_APPLY=result.json OT_MCP_EXPORT_DIR=dir \
//     OT_MCP_EXPORT_DIR_SCOPED=dir2 node scripts/playwright-assemblies.mjs
// OT_UI_URL defaults to http://127.0.0.1:5173. OT_ASM_SMOKE=1 skips from the
// parity checks to the typical choice (a document with no typical-bearing unit
// has no option or group to override). OT_UI_PDF may name several PDFs,
// separated as PATH is (a set opened as several files, read as one project);
// the canvas sends them in name order, so OT_MCP_APPLY is apply_assemblies over
// the same files in that order.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { delimiter, resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';

assert.ok(process.env.OT_UI_PDF && process.env.OT_ASM_OUT && process.env.OT_MCP_APPLY && process.env.OT_MCP_EXPORT_DIR,
  'OT_UI_PDF, OT_ASM_OUT, OT_MCP_APPLY and OT_MCP_EXPORT_DIR are required');
const out = resolve(process.env.OT_ASM_OUT);
mkdirSync(out, { recursive: true });
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5173';
const smoke = process.env.OT_ASM_SMOKE === '1';
const mcp = JSON.parse(readFileSync(resolve(process.env.OT_MCP_APPLY), 'utf8'));
const pdfs = process.env.OT_UI_PDF.split(delimiter).filter(Boolean).map((p) => resolve(p));
const REASON = "UI proof: the estimator's own choice";
const GROUP_REASON = "UI proof: one answer for the schedule's rows";
const GROUP_EXCLUDE_REASON = "UI proof: these rows are no units";
const CHOICE_REASON = "UI proof: another typical for this unit";
const PRESET = 'valve-shipped-to-kit-maker';
const ABSENT_OPTION = 'ui_proof_no_such_option';
const ABSENT_SWITCH = 'ui_proof_no_such_switch';

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
  await page.waitForFunction(() => Number(document.querySelector('[data-assemblies-count]')?.dataset.assembliesCount) > 0, null, { timeout: 60000 });
  return panel;
}

async function applyInPage() {
  return page.evaluate(async () => {
    const { applyAssemblies } = await import('/src/lib/assemblies/apply.ts');
    const { combinedLibrary } = await import('/src/lib/assemblies/libraryEdit.ts');
    const { projectLibrary } = await import('/src/lib/assemblies/projectState.ts');
    const { assembliesReport, exceptionGroups } = await import('/src/lib/assemblies/report.ts');
    const { loadStarterLibrary } = await import('/src/lib/assemblies/starterLibrary.ts');
    const { localStore } = await import('/src/lib/store.js');
    const project = window.__opentakeoff.probe.assembliesProject();
    const state = window.__opentakeoff.probe.assembliesState();
    const { library } = combinedLibrary(await loadStarterLibrary(), await localStore.loadEquipmentAssemblies());
    // The panel applies the control drawings' readings the project carries
    // (AssembliesPanel: project.control_readings), as apply_assemblies does.
    const applied = applyAssemblies({ project, library: projectLibrary(state, library), settings: state?.settings ?? {}, overrides: state?.overrides ?? [], readings: project?.control_readings ?? null });
    const report = assembliesReport(applied.instances, applied.applications, applied.lines, project?.unread_schedules, applied.rows_left_out);
    return { applications: JSON.stringify(applied.applications), lines: JSON.stringify(applied.lines), report: JSON.stringify(report),
      groups: JSON.stringify(exceptionGroups(report.exceptions).map((g) => ({ units: g.units.map((u) => [u.tag, u.family, u.layer]), options: g.options, candidates: g.candidates }))) };
  });
}

/** The overrides the panel shows: its own state. IndexedDB's autosave can
 * lag a change just made. */
async function shownOverrides(panel) {
  const el = panel.locator('[data-assemblies-overrides]');
  return (await el.count()) ? Number(await el.getAttribute('data-assemblies-overrides')) : 0;
}

/** A unit's own row whose details offer another typical (AS-55), never the
 * project's or an excluded one: its family's other typicals first, else, for
 * a family no typical lists, the layer's others. With `group`, the first row
 * whose schedule has others like it (report.ts unitsLike), and them. */
async function typicalOffer({ group = false } = {}) {
  return JSON.parse(await page.evaluate(async (group) => {
    const { applyAssemblies } = await import('/src/lib/assemblies/apply.ts');
    const { combinedLibrary } = await import('/src/lib/assemblies/libraryEdit.ts');
    const { projectLibrary } = await import('/src/lib/assemblies/projectState.ts');
    const { assembliesReport, unitsLike } = await import('/src/lib/assemblies/report.ts');
    const { typicalChoices } = await import('/src/lib/assemblies/select.ts');
    const { loadStarterLibrary } = await import('/src/lib/assemblies/starterLibrary.ts');
    const { localStore } = await import('/src/lib/store.js');
    const project = window.__opentakeoff.probe.assembliesProject();
    const state = window.__opentakeoff.probe.assembliesState();
    const lib = projectLibrary(state, combinedLibrary(await loadStarterLibrary(), await localStore.loadEquipmentAssemblies()).library);
    const applied = applyAssemblies({ project, library: lib, settings: state?.settings ?? {}, overrides: state?.overrides ?? [], readings: project?.control_readings ?? null });
    const report = assembliesReport(applied.instances, applied.applications, applied.lines, project?.unread_schedules, applied.rows_left_out);
    const found = [];
    for (const u of report.units) {
      if (u.tag === '(project)' || u.status === 'excluded') continue;
      const like = unitsLike(report.units, u);
      if (group && like.length < 2) continue;
      const ch = typicalChoices(u.family, lib, u.layer);
      const alt = (ch.family.length ? ch.family : ch.other).filter((d) => `${d.id}@${d.version}` !== u.assembly).sort((x, y) => x.id.localeCompare(y.id));
      if (alt.length) found.push({ tag: u.tag, family: u.family, layer: u.layer, own: ch.family.length > 0, count: like.length, tags: like.map((l) => l.tag), pick: { id: alt[0].id, version: alt[0].version } });
    }
    return JSON.stringify((group ? found[0] : found.find((f) => f.own) ?? found[0]) ?? null);
  }, group));
}

/** Choose the offer's typical in its unit's details (for all like it with
 * `all`), answering the reason prompt; the records that took it. */
async function chooseTypical(panel, offer, { all = false, reason = CHOICE_REASON } = {}) {
  const name = `${offer.tag} ${offer.family} ${offer.layer} details`;
  const toggle = panel.getByRole('button', { name, exact: true }).first();
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const detail = panel.getByRole('region', { name, exact: true }).first();
  const select = detail.locator(all ? `[data-assemblies-choose-typical-all="${offer.count}"]` : `[data-assemblies-choose-typical="${offer.tag}"]`);
  await select.waitFor({ state: 'visible' });
  page.once('dialog', (d) => d.accept(reason));
  await select.selectOption(`${offer.pick.id}@${offer.pick.version}`);
  const tags = all ? offer.tags : [offer.tag];
  let taken = [];
  for (let i = 0; i < 120 && taken.length < tags.length; i++) {
    taken = JSON.parse((await applyInPage()).applications).filter((a) => tags.includes(a.instance.tag) && a.instance.family === offer.family && a.layer === offer.layer
      && a.assembly?.id === offer.pick.id && a.selected_by === 'user' && String(a.reason).startsWith(reason) && (!all || String(a.reason).includes('decided together')));
    if (taken.length < tags.length) await page.waitForTimeout(500);
  }
  assert.equal(taken.length, tags.length, `${all ? `all ${tags.length} ${offer.family} units like ${offer.tag}` : `${offer.tag} (${offer.family}, ${offer.layer})`} take ${offer.pick.id} by the choice, with the reason`);
  return taken;
}

async function annotations() {
  return page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()).assemblies ?? null);
}

try {
  let t0 = t();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(pdfs);
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
  writeFileSync(`${out}/browser-records.json`, mine.applications);
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
  // The schedule sheets whose tables are pictures are named above the rest,
  // every one the report holds (AS-54).
  const picturesEl = panel.locator('[data-assemblies-schedules-unread]');
  const picturesShown = (await picturesEl.count()) ? Number(await picturesEl.getAttribute('data-assemblies-schedules-unread')) : 0;
  assert.equal(picturesShown, mcp.report.schedules_unread?.length ?? 0, 'the schedule sheets read as pictures are named, all of them');
  if (picturesShown) checks.push(`${picturesShown} schedule sheet${picturesShown === 1 ? '' : 's'} read as pictures named on screen (AS-54)`);
  // So are the rows of family schedules the takeoff reads as no unit, every
  // schedule and every row the report holds (AS-61).
  const leftEl = panel.locator('[data-assemblies-rows-left-out]');
  const leftShown = (await leftEl.count())
    ? { schedules: Number(await leftEl.getAttribute('data-assemblies-rows-left-out')), rows: Number(await leftEl.getAttribute('data-assemblies-rows-left-out-rows')) }
    : { schedules: 0, rows: 0 };
  const leftWant = mcp.report.schedules_left_out ?? [];
  assert.deepEqual(leftShown, { schedules: leftWant.length, rows: leftWant.reduce((n, e) => n + e.marks.length, 0) }, 'the scheduled rows that are no unit are named, all of them');
  if (leftShown.schedules) {
    const listed = await leftEl.locator('[data-assemblies-rows-left-out-schedule]').allTextContents();
    for (const [i, e] of leftWant.entries()) assert.ok(e.marks.every((m) => listed[i]?.includes(m)), `every mark of ${e.title} is on screen`);
    checks.push(`${leftShown.rows} scheduled row${leftShown.rows === 1 ? '' : 's'} in ${leftShown.schedules} schedule${leftShown.schedules === 1 ? '' : 's'} named as no unit on screen (AS-61)`);
  }
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
    // A document whose resolved records carry no options (hook-ups only, as
    // 26_CA's) still has a unit with a typical to open.
    // A unit's own record: the project's (tag "(project)") follow the settings.
    // A document whose units all wait (02_UT's one fan waits for its drive)
    // opens a waiting unit, and the library step clones the typical chosen
    // for it below.
    const unit = mcp.report.units.find((u) => u.tag !== '(project)' && u.assembly && Object.keys(u.options).length)
      ?? mcp.report.units.find((u) => u.tag !== '(project)' && u.assembly)
      ?? mcp.report.units.find((u) => u.tag !== '(project)' && u.status === 'unresolved' && u.candidates.length);
    assert.ok(unit, 'the document has a unit with a typical, or one waiting for one');
    const toggle = panel.getByRole('button', { name: `${unit.tag} ${unit.family} ${unit.layer} details`, exact: true }).first();
    await toggle.focus();
    await page.keyboard.press('Enter');
    const detail = panel.getByRole('region', { name: `${unit.tag} ${unit.family} ${unit.layer} details`, exact: true }).first();
    await detail.waitFor({ state: 'visible' });
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
    checks.push(`keyboard: ${unit.tag} (${unit.layer}) details`);

    // An override asks for a reason and is kept on the record: one of the
    // unit's options, or, where no typical carries an option, a typical
    // chosen for a unit that waits.
    let target = unit.assembly?.split('@')[0] ?? null;
    let targetVersion = unit.assembly?.split('@')[1] ?? null;
    if (unit.assembly && Object.keys(unit.options).length) {
      const [optionId, option] = Object.entries(unit.options)[0];
      const optionRow = () => detail.getByRole('table', { name: `${unit.tag} options` }).getByRole('row')
        .filter({ has: page.getByRole('cell', { name: optionId, exact: true }) });
      page.once('dialog', (d) => d.accept(REASON));
      await optionRow().getByRole('button').click();
      await panel.locator('[data-assemblies-overrides="1"]').waitFor({ state: 'visible' });
      assert.ok(await panel.getByText(REASON, { exact: false }).first().isVisible(), 'the reason is shown with the override');
      const cells = optionRow().getByRole('cell');
      assert.equal((await cells.nth(1).innerText()).trim(), String(!(option.value === true)), 'the value is the one chosen');
      assert.equal((await cells.nth(2).innerText()).trim(), 'user', 'the option now comes from the user');
      // A unit of another family under the same tag keeps its own records (AS-43).
      const beside = JSON.parse((await applyInPage()).applications).filter((a) => a.instance.tag === unit.tag && a.instance.family !== unit.family);
      assert.ok(beside.every((a) => a.selected_by !== 'user'), `the other units tagged ${unit.tag} keep their records: ${beside.map((a) => `${a.instance.family} ${a.layer} ${a.selected_by}`).join('; ')}`);
      checks.push(`override ${unit.tag} ${optionId} with a reason${beside.length ? ` (the ${[...new Set(beside.map((a) => a.instance.family))].join(', ')} also tagged ${unit.tag} untouched)` : ''}`);
    } else {
      // A unit's row, never the project's own (they follow the settings).
      const ex = mcp.report.exceptions.find((e) => e.tag !== '(project)' && e.candidates.length && mcp.report.exceptions.filter((o) => o.tag === e.tag).length === 1);
      // A document whose typicals carry no option and whose units all
      // resolve (093_ME's VRF units) still has an override to make: another
      // typical from a unit's details (AS-55).
      const offer = ex ? null : await typicalOffer();
      assert.ok(ex || offer, 'the document has an option to override, a waiting unit to choose a typical for, or a unit to give another typical');
      if (offer) {
        const [rec] = await chooseTypical(panel, offer, { reason: REASON });
        await panel.locator('[data-assemblies-overrides="1"]').waitFor({ state: 'visible' });
        checks.push(`override: ${offer.tag} (${offer.family}, ${offer.layer}) takes ${offer.pick.id} from its details with a reason, ${rec.status} (AS-55)`);
      } else {
        const [id] = ex.candidates[0].split('@');
        const exRow = panel.getByRole('table', { name: 'Records that wait for something' }).getByRole('row')
          .filter({ has: page.getByRole('button', { name: ex.tag, exact: true }) }).first();
        page.once('dialog', (d) => d.accept(REASON));
        await exRow.getByRole('button', { name: `Use ${id}`, exact: true }).click();
        await panel.locator('[data-assemblies-overrides="1"]').waitFor({ state: 'visible' });
        assert.ok(await panel.getByText(REASON, { exact: false }).first().isVisible(), 'the reason is shown with the override');
        const chosen = JSON.parse((await applyInPage()).applications).filter((a) => a.instance.tag === ex.tag && a.layer === ex.layer);
        assert.ok(chosen.length && chosen.every((a) => a.selected_by === 'user' && a.assembly?.id === id), `${ex.tag} takes ${id} by override`);
        checks.push(`override: ${ex.tag} (${ex.layer}) takes ${id} with a reason`);
        if (!target) [target, targetVersion] = [id, chosen[0].assembly.version];
      }
    }
    await page.screenshot({ path: `${out}/override.png` });

    // The library: read-only starter, live validation, an update the project
    // does not take until adopted.
    await panel.getByRole('button', { name: /^Library/ }).click();
    const lib = page.getByRole('region', { name: 'Assembly library', exact: true });
    await lib.waitFor({ state: 'visible' });
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
    assert.equal((await annotations())?.pinned?.find((a) => a.id === target)?.version, targetVersion, 'the project still pins the version it applied');
    await page.screenshot({ path: `${out}/library-update.png` });
    await lib.getByRole('button', { name: 'Delete my version', exact: true }).click();
    await lib.locator('[data-assemblies-updates]').waitFor({ state: 'detached' });
    assert.equal((await page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadEquipmentAssemblies()).length)), 0);
    checks.push(`library: clone ${target}, live validation, update offered not applied (A5), delete withdraws it`);
    {
      // Export CSV through a spreadsheet's plain CSV and back (AS-60): the
      // export carries a byte-order mark, and the file Excel writes on
      // Windows (Windows-1252, TRUE and FALSE) reads back as the library.
      const csvDownload = page.waitForEvent('download');
      await lib.locator('[data-assemblies-library-export]').click();
      const csvPath = `${out}/assemblies-library.csv`;
      await (await csvDownload).saveAs(csvPath);
      const bytes = readFileSync(csvPath);
      assert.deepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'the export opens in a spreadsheet as UTF-8');
      const excel = bytes.toString('utf8').replace(/^\uFEFF/, '').replace(/(^|,)(true|false)(?=,|\r)/gm, (_, a, b) => a + b.toUpperCase());
      const cp1252 = Buffer.from([...excel].map((ch) => {
        const c = ch.codePointAt(0);
        if (c < 0x80 || (c >= 0xA0 && c <= 0xFF)) return c;
        throw new Error(`not in Windows-1252: ${ch}`);
      }));
      await lib.locator('[data-assemblies-library-import]').setInputFiles({ name: 'library-excel.csv', mimeType: 'text/csv', buffer: cp1252 });
      const status = lib.locator('[data-assemblies-import]');
      await status.waitFor({ state: 'visible' });
      assert.equal(await status.getAttribute('data-assemblies-import'), 'ok', await status.innerText());
      assert.match(await status.innerText(), /0 added, 0 replaced, \d+ unchanged/);
      assert.equal(await lib.locator('[data-assemblies-import-encoding="windows-1252"]').count(), 1, 'the import says how it read the file');
      assert.equal((await page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadEquipmentAssemblies()).length)), 0, 'nothing is added');
      checks.push(`library CSV through a spreadsheet: exported with a byte-order mark, a plain Windows-1252 CSV with TRUE and FALSE reads back unchanged (${(await status.innerText()).match(/(\d+) unchanged/)[1]} records) (AS-60)`);
    }
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
    // The saved override also sets an option its unit's typical has not, and
    // the settings a hook-up switch no line names, as a project file saved
    // before its library was updated, or an agent's typo, would. (A debounced
    // save of the editor's own state lands within 700 ms: the write is read
    // back after that.)
    const kept = await waitForAsync(() => page.evaluate(async ([absent, absentSwitch]) => {
      const { localStore } = await import('/src/lib/store.js');
      const { annotationGeneration } = await import('/src/lib/annotationGeneration.js');
      const has = (a) => absent in (a.overrides[0].options ?? {}) && a.settings?.profile?.[absentSwitch] === true;
      const ann = await localStore.loadAnnotations();
      if (!has(ann.assemblies)) {
        const [o] = ann.assemblies.overrides;
        const settings = { ...(ann.assemblies.settings ?? {}), profile: { ...(ann.assemblies.settings?.profile ?? {}), [absentSwitch]: true } };
        const assemblies = { ...ann.assemblies, settings, overrides: [{ ...o, options: { ...(o.options ?? {}), [absent]: true } }] };
        await localStore.saveAnnotations({ ...ann, assemblies }, { generation: annotationGeneration(ann) });
      }
      await new Promise((r) => setTimeout(r, 1500));
      const back = (await localStore.loadAnnotations()).assemblies;
      return has(back) ? back : null;
    }, [ABSENT_OPTION, ABSENT_SWITCH]), { timeout: 30000, label: 'a saved override with an option its typical has not' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openImportedSheet(page);
    panel = await openAssemblies();
    assert.equal(Number(await panel.locator('[data-assemblies-count]').getAttribute('data-assemblies-pinned')), saved.pinned.length, 'the pins came back with the project');
    const again = page.waitForResponse((r) => r.url().includes('/__ot/assemblies-project'), { timeout: 1800000 });
    await panel.locator('[data-assemblies-load]').click();
    assert.equal((await again).status(), 200);
    await panel.locator('[data-assemblies-overrides="1"]').waitFor({ state: 'visible', timeout: 120000 });
    assert.deepEqual(await annotations(), kept, 'reload keeps the pins, settings and override');
    // "Your overrides" marks the part no record takes, with why; the rest of
    // the override still applies (AS-49).
    const [keptOverride] = kept.overrides;
    const keptRecord = JSON.parse((await applyInPage()).applications)
      .find((a) => a.instance.tag === keptOverride.tag && a.layer === keptOverride.layer && (!keptOverride.family || a.instance.family === keptOverride.family));
    const marked = panel.locator('[data-assemblies-override-ignored]');
    assert.equal(await marked.count(), 1, 'the option its typical has not is marked');
    assert.equal((await marked.innerText()).trim(), `· not applied: ${keptRecord.assembly.id}@${keptRecord.assembly.version} has no option ${ABSENT_OPTION}`);
    assert.ok(!(ABSENT_OPTION in keptRecord.options) && (keptRecord.selected_by === 'user' || Object.values(keptRecord.options).some((x) => x.source === 'user')), 'the rest of the override still applies');
    await panel.locator('[data-assemblies-overrides]').screenshot({ path: `${out}/override-not-applied.png` });
    // Project settings lists the switch no line names (AS-50).
    const unreadNote = panel.locator('[data-assemblies-settings-unread="1"]');
    assert.equal(await unreadNote.count(), 1, 'the switch no line names is listed');
    assert.match(await unreadNote.evaluate((el) => el.textContent), new RegExp(`profile\\.${ABSENT_SWITCH} \\(no line has the switch ${ABSENT_SWITCH}\\)`));
    const settingsBox = panel.locator('[data-assemblies-settings]');
    await settingsBox.evaluate((el) => { el.open = true; });
    await unreadNote.screenshot({ path: `${out}/settings-unread.png` });
    await settingsBox.evaluate((el) => { el.open = false; });
    checks.push(`actual IndexedDB autosave; reload keeps pins and the override; an option ${keptOverride.tag}'s typical has not is marked not applied, the rest applied (AS-49); a switch no line names is listed in Project settings (AS-50)`);

    // One schedule's rows that wait for the same things resolve together: one
    // choice and one reason, an override on each unit (report.ts
    // exceptionGroups). Each record then takes the chosen typical.
    const groupRow = panel.locator('[data-assemblies-group]').filter({ has: page.locator('[data-assemblies-group-use]') }).first();
    if (await groupRow.count()) {
      const n = Number(await groupRow.getAttribute('data-assemblies-group'));
      const use = groupRow.locator('[data-assemblies-group-use]').first();
      const [chosen] = String(await use.getAttribute('data-assemblies-group-use')).split('@');
      const exceptionsBefore = Number(await panel.locator('[data-assemblies-exceptions]').getAttribute('data-assemblies-exceptions'));
      const overridesBefore = await shownOverrides(panel);
      const tg = t();
      page.once('dialog', (d) => d.accept(GROUP_REASON));
      await use.click({ timeout: 180000 });
      await panel.locator(`[data-assemblies-overrides="${overridesBefore + n}"]`).waitFor({ state: 'visible', timeout: 180000 });
      timings.group_s = Math.round((t() - tg) / 1000);
      const exceptionsAfter = (await panel.locator('[data-assemblies-exceptions]').count())
        ? Number(await panel.locator('[data-assemblies-exceptions]').getAttribute('data-assemblies-exceptions')) : 0;
      const chosenByUser = JSON.parse((await applyInPage()).applications).filter((a) => a.selected_by === 'user' && a.assembly?.id === chosen && String(a.reason).startsWith(GROUP_REASON));
      assert.ok(chosenByUser.length >= n, `${n} records take ${chosen}, each with the reason (${chosenByUser.length})`);
      // A unit whose chosen typical still waits for a value (an economizer,
      // say) stays among the exceptions (AS-47).
      const stillWaiting = chosenByUser.filter((a) => a.status === 'unresolved');
      assert.ok(stillWaiting.every((a) => a.unresolved.missing.length), 'a chosen typical is unresolved only while it waits for something');
      assert.equal(exceptionsAfter, exceptionsBefore - n + stillWaiting.length, `the group's ${n} units leave the exceptions, but the ${stillWaiting.length} whose ${chosen} still waits`);
      checks.push(`${n} waiting units of one schedule resolved together with ${chosen}, an override each${stillWaiting.length ? `; ${stillWaiting.length} still wait for ${[...new Set(stillWaiting.flatMap((a) => a.unresolved.missing))].join(', ')} and stay among the exceptions` : ''}`);

      // Rows that are no units (a transposed schedule's attribute rows, a
      // notes table read as equipment) leave together: "Exclude all N", one
      // reason, every layer of each unit excluded.
      // The typical just chosen may still wait for an option's attribute
      // (AS-47): its units then form an option group, decided together
      // (AS-48). So may rows whose own typical waits.
      const optionRow = panel.locator('[data-assemblies-group]').filter({ has: page.locator('[data-assemblies-group-option]') }).first();
      if (await optionRow.count()) {
        const yes = optionRow.locator('[data-assemblies-group-option][data-assemblies-group-value="true"]').first();
        const opt = await yes.getAttribute('data-assemblies-group-option');
        const k = Number(await optionRow.getAttribute('data-assemblies-group'));
        const group = JSON.parse((await applyInPage()).groups).find((g) => g.options.includes(opt) && g.units.length === k);
        assert.ok(group, `the option group on screen is the report's (${opt}, ${k} units)`);
        const to = t();
        page.once('dialog', (d) => d.accept(GROUP_REASON));
        await yes.click({ timeout: 180000 });
        const decided = await waitForAsync(async () => {
          const all = JSON.parse((await applyInPage()).applications);
          const mine = all.filter((a) => group.units.some(([tag, family, layer]) => a.instance.tag === tag && a.instance.family === family && a.layer === layer));
          return mine.length >= k && mine.every((a) => a.options[opt]?.value === true && a.options[opt]?.source === 'user') ? mine : null;
        }, { timeout: 180000, label: `${opt} decided for the group` });
        timings.option_s = Math.round((t() - to) / 1000);
        const still = decided.filter((a) => a.status === 'unresolved');
        assert.ok(still.every((a) => a.unresolved.missing.length), 'a unit stays an exception only while it waits for something else');
        const left = JSON.parse((await applyInPage()).groups).filter((g) => g.options.includes(opt) && g.units.some(([tag, family]) => group.units.some(([t2, f2]) => t2 === tag && f2 === family)));
        assert.equal(left.length, 0, `no unit of the group still waits for ${opt}`);
        checks.push(`${k} units under one typical: ${opt} decided together for all, an override each${still.length ? ` (${still.length} still wait for something else)` : ''}`);
      }

      const next = panel.locator('[data-assemblies-group]').first();
      if (await next.count()) {
        // Each unit is its tag and family: a tag another family shares is
        // not that family's unit (AS-43).
        const [{ units }] = JSON.parse((await applyInPage()).groups);
        const m = Number(await next.getAttribute('data-assemblies-group'));
        assert.equal(units.length, m, "the first group on screen is the report's first group");
        const before = await shownOverrides(panel);
        const te = t();
        page.once('dialog', (d) => d.accept(GROUP_EXCLUDE_REASON));
        await next.locator('[data-assemblies-group-exclude]').click({ timeout: 180000 });
        await panel.locator(`[data-assemblies-overrides="${before + new Set(units.map((u) => JSON.stringify(u))).size}"]`).waitFor({ state: 'visible', timeout: 180000 });
        timings.exclude_s = Math.round((t() - te) / 1000);
        const all = JSON.parse((await applyInPage()).applications);
        const records = all.filter((a) => units.some(([tag, family]) => a.instance.tag === tag && a.instance.family === family));
        assert.ok(records.length >= m && records.every((a) => a.status === 'excluded' && String(a.reason).startsWith(GROUP_EXCLUDE_REASON)),
          `every record of the ${m} units is excluded with the reason: ${records.filter((a) => a.status !== 'excluded').map((a) => `${a.instance.tag} ${a.layer} ${a.status}`).slice(0, 5).join('; ')}`);
        // Units of another family under the same tags are not these (AS-43).
        const beside = all.filter((a) => units.some(([tag, family]) => a.instance.tag === tag && a.instance.family !== family));
        assert.ok(beside.every((a) => !String(a.reason ?? '').startsWith(GROUP_EXCLUDE_REASON)), `units sharing their tags keep their records: ${beside.map((a) => `${a.instance.tag} ${a.instance.family} ${a.status}`).slice(0, 5).join('; ')}`);
        checks.push(`${m} rows of another schedule excluded together (${records.length} records, every layer), an override each${beside.length ? `; ${beside.length} records of other families under the same tags untouched` : ''}`);
      }
    }

    // Every override the proof made applies to a unit, and the project's own
    // rows, which follow the settings, open them rather than offer an
    // override that would change nothing (AS-45).
    assert.equal(await panel.locator('[data-assemblies-override-unmatched]').count(), 0, 'no override applies to nothing');
    // Every part of them applies, but the option the saved file added (AS-49).
    for (const text of await panel.locator('[data-assemblies-override-ignored]').allInnerTexts()) assert.match(text, new RegExp(`has no option ${ABSENT_OPTION}$`));
    const toSettings = panel.locator('[data-assemblies-open-settings]').first();
    if (await toSettings.count()) {
      const settingsEl = panel.locator('[data-assemblies-settings]');
      await settingsEl.evaluate((el) => { el.open = false; });
      await toSettings.click();
      assert.equal(await settingsEl.evaluate((el) => el.open), true, "a project row's button opens the project settings");
      checks.push("the project's own rows open the project settings; no override applies to nothing");
    }
  }

  {
    // Another typical from a unit's details (AS-55): the record is then the
    // user's choice of it, with the reason.
    const offer = await typicalOffer();
    if (offer) {
      const [rec] = await chooseTypical(panel, offer);
      checks.push(`another typical from a unit's details: ${offer.tag} (${offer.family}, ${offer.layer}) takes ${offer.pick.id}${offer.own ? '' : " (another family's: no typical lists its own)"} with a reason, ${rec.status}${rec.status === 'unresolved' ? ` (waits for ${rec.unresolved?.missing?.join(', ') || 'a value'})` : ''} (AS-55)`);
    }
    // The same choice for every row of a schedule like one unit (report.ts
    // unitsLike): one reason, an override on each, as the exceptions' groups.
    const group = await typicalOffer({ group: true });
    if (group) {
      await chooseTypical(panel, group, { all: true });
      checks.push(`the same choice for all ${group.count} ${group.family} units of a schedule like ${group.tag}: each takes ${group.pick.id}, one reason and an override each (AS-55)`);
      // Its overrides are one row under Your overrides, and Remove all N
      // takes them back in one step (AS-59).
      const row = panel.locator('[data-assemblies-override-group]').filter({ hasText: CHOICE_REASON });
      await row.waitFor({ state: 'visible' });
      const n = Number(await row.getAttribute('data-assemblies-override-group'));
      assert.equal(n, new Set(group.tags).size, `the ${group.count} overrides of the choice are one row`);
      const before = await shownOverrides(panel);
      await row.locator('[data-assemblies-override-group-remove]').click();
      await waitForAsync(async () => (await shownOverrides(panel)) === before - n, { timeout: 180000, label: `the ${n} overrides removed together` });
      const left = await page.evaluate(() => (window.__opentakeoff.probe.assembliesState()?.overrides ?? []).map((o) => o.reason));
      assert.ok(!left.some((r) => r.startsWith(CHOICE_REASON) && r.endsWith('decided together)')), 'none of the choice is left');
      checks.push(`Remove all ${n} takes back the choice for all ${n} in one step (AS-59)`);
    }
    assert.equal(await panel.locator('[data-assemblies-override-unmatched]').count(), 0, 'the choices apply to their units');
  }

  {
    // A sheet added after the schedules were read (AS-58): the panel names
    // the change, over units and lines that are still the earlier set's.
    const { PDFDocument } = await import('pdf-lib');
    const extra = await PDFDocument.create();
    extra.addPage([612, 792]);
    const name = 'ui-proof-added-sheet.pdf';
    assert.equal(await panel.locator('[data-assemblies-stale]').count(), 0, 'the set the schedules were read from: nothing named');
    await page.locator('input[name="sheet-file"]').first().setInputFiles({ name, mimeType: 'application/pdf', buffer: Buffer.from(await extra.save()) });
    // The Takeoff dialog stays open over the canvas the new sheet opens in.
    if (!(await panel.isVisible())) panel = await openAssemblies();
    const stale = panel.locator('[data-assemblies-stale]');
    await stale.waitFor({ state: 'visible', timeout: 60000 });
    await stale.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/stale.png` });
    assert.match(await stale.innerText(), new RegExp(`changed since these schedules were read \\(added ${name.replace(/\./g, '\\.')}\\)`));
    assert.equal(await panel.locator('[data-assemblies-stale-reread]').count(), 1, 'with a button to read them again');
    checks.push(`a sheet added after the schedules were read is named over the earlier set's units (AS-58)`);
  }

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source: pdfs.length === 1 ? pdfs[0] : pdfs, smoke, timings,
    totals: mcp.report.totals, exceptions: mcp.report.exceptions.length, checks, errors }, null, 2));
  console.log(`Assemblies UI proof passed (${checks.length} checks): ${checks.join('; ')}`);
} catch (error) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors, null, 2));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
