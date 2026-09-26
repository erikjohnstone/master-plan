// Real PDF -> /__ot/assemblies-project (the production CLI) -> Takeoff ->
// Assemblies -> Project questions (CONTROL INTENT Track A, WP5.1). Checks, in
// the running app and with nothing injected:
//   · the card shows the questions project_questions returns over MCP for the
//     same PDF (mcp/scripts/assemblies-questions-mcp.mjs questions wrote
//     OT_MCP_QUESTIONS): the same ids in the same order, every choice's lines
//     and records changed, the same pre-fills;
//   · a pre-fill is a proposal: nothing is recorded until a choice is clicked;
//   · answering asks why, appends one operator_input event to the project's
//     journal, and the question shows the answer; the records it changes are
//     the ones its choice said it would (lines_changed, records_changed);
//   · "Don't know" takes the answer back (a second event), and answering again
//     is a third: the journal only grows;
//   · the project file reaches IndexedDB with its journal, and a reload keeps
//     the answer;
//   · the page writes its project file and its own records and lines with the
//     answer to OT_Q_OUT (takeoff.json, ui-answered.json) for the MCP half
//     (assemblies-questions-mcp.mjs apply) to compare byte for byte;
//   · both themes at three widths without a horizontal page scroll.
//
//   OT_UI_PDF=plan.pdf OT_Q_OUT=dir OT_MCP_QUESTIONS=questions.json \
//     OT_Q_ANSWER=PQ1=no node scripts/playwright-questions.mjs
// The dev server must read the control drawings deterministically
// (OPENTAKEOFF_CONTROL_READINGS=deterministic), as the MCP half does.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
import { waitForAsync } from './fixtures/wait-for-async.mjs';

assert.ok(process.env.OT_UI_PDF && process.env.OT_Q_OUT && process.env.OT_MCP_QUESTIONS, 'OT_UI_PDF, OT_Q_OUT and OT_MCP_QUESTIONS are required');
const out = resolve(process.env.OT_Q_OUT);
mkdirSync(out, { recursive: true });
const url = process.env.OT_UI_URL || 'http://127.0.0.1:5173';
const mcp = JSON.parse(readFileSync(resolve(process.env.OT_MCP_QUESTIONS), 'utf8'));
const [QID, VALUE] = (process.env.OT_Q_ANSWER || 'PQ1=no').split('=');
const REASON = "UI proof: the estimator's answer";

const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const dialogs = [];
page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(REASON); });
const checks = [];

async function openAssemblies() {
  await page.locator('[data-workspace-nav="Takeoff"]').click();
  await page.locator('[data-takeoff-tab="assemblies"]').first().click();
  const panel = page.getByRole('region', { name: 'Assemblies', exact: true });
  await panel.waitFor({ state: 'visible', timeout: 30000 });
  await page.waitForFunction(() => Number(document.querySelector('[data-assemblies-count]')?.dataset.assembliesCount) > 0, null, { timeout: 60000 });
  return panel;
}

/** The panel's own inputs applied in the page with the shared modules, with
 * and without the project's answers, and the effect between them. */
async function applyInPage() {
  return page.evaluate(async () => {
    const { applyAssemblies } = await import('/src/lib/assemblies/apply.ts');
    const { combinedLibrary } = await import('/src/lib/assemblies/libraryEdit.ts');
    const { projectLibrary } = await import('/src/lib/assemblies/projectState.ts');
    const { loadStarterLibrary } = await import('/src/lib/assemblies/starterLibrary.ts');
    const { answerSettings, replayAnswers } = await import('/src/lib/controlIntent/journal.ts');
    const { linesChanged, recordsChanged } = await import('/src/lib/controlIntent/questions.ts');
    const { localStore } = await import('/src/lib/store.js');
    const project = window.__opentakeoff.probe.assembliesProject();
    const state = window.__opentakeoff.probe.assembliesState();
    const { library } = combinedLibrary(await loadStarterLibrary(), await localStore.loadEquipmentAssemblies());
    const replayed = await replayAnswers(state?.answer_journal ?? []);
    const answers = answerSettings(replayed.events);
    const base = { project, library: projectLibrary(state, library), overrides: state?.overrides ?? [], readings: project.control_readings ?? null };
    const withAnswers = applyAssemblies({ ...base, settings: { ...(state?.settings ?? {}), ...answers } });
    const without = applyAssemblies({ ...base, settings: state?.settings ?? {} });
    return {
      applications: JSON.stringify(withAnswers.applications), lines: JSON.stringify(withAnswers.lines),
      lines_changed: linesChanged(without.lines, withAnswers.lines), records_changed: recordsChanged(without.applications, withAnswers.applications),
      events: replayed.events.map((e) => ({ question: e.question, answer: e.answer, origin: e.origin, approved: e.approved, reviewer: e.reviewer, reason: e.reason })),
    };
  });
}

const saved = () => page.evaluate(async () => (await (await import('/src/lib/store.js')).localStore.loadAnnotations()) ?? null);

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF));
  await page.waitForFunction(() => ['ready', 'error'].includes(window.__opentakeoff?.graphPrewarm()?.phase), null, { timeout: 1800000 });
  assert.equal(await page.evaluate(() => window.__opentakeoff.graphPrewarm().phase), 'ready');
  await openImportedSheet(page);
  let panel = await openAssemblies();
  const response = page.waitForResponse((r) => r.url().includes('/__ot/assemblies-project'), { timeout: 1800000 });
  await panel.locator('[data-assemblies-load]').click();
  assert.equal((await response).status(), 200);
  await panel.locator('[data-assemblies-totals]').waitFor({ state: 'visible', timeout: 120000 });
  checks.push('real /__ot/assemblies-project response');

  // The card is MCP's project_questions, question for question.
  const card = panel.getByRole('region', { name: 'Project questions', exact: true });
  await card.waitFor({ state: 'visible', timeout: 120000 });
  await page.waitForFunction((n) => Number(document.querySelector('[data-assemblies-questions]')?.dataset.assembliesQuestions) === n, mcp.questions.length, { timeout: 300000 });
  const shown = await card.locator('[data-assemblies-question]').evaluateAll((els) => els.map((el) => ({
    id: el.dataset.assembliesQuestion,
    answer: el.dataset.answer || null,
    prefill: el.querySelector('[data-assemblies-prefill]')?.dataset.assembliesPrefill ?? null,
    choices: [...el.querySelectorAll('[data-assemblies-choice]')].map((b) => ({ value: b.dataset.assembliesChoice, text: b.textContent })),
  })));
  assert.deepEqual(shown.map((q) => q.id), mcp.questions.map((q) => q.id), 'the same questions in the same order');
  for (const [i, q] of mcp.questions.entries()) {
    const s = shown[i];
    assert.equal(s.prefill, q.answer ? null : q.prefill?.value ?? null, `${q.id}: the same pre-fill`);
    assert.deepEqual(s.choices.map((c) => c.value), q.choices.map((c) => c.value), `${q.id}: the same choices`);
    for (const c of q.choices) {
      if (c.value === 'unknown') continue;
      const text = s.choices.find((x) => x.value === c.value).text;
      assert.match(text, new RegExp(`· ${c.lines_changed} lines, ${c.records_changed} records`), `${q.id}=${c.value}: the effect MCP computed`);
    }
  }
  checks.push(`the card is project_questions over MCP: ${mcp.questions.map((q) => `${q.id}${q.prefill ? ` (pre-fill ${q.prefill.value})` : ''}`).join(', ')}`);
  const target = mcp.questions.find((q) => q.id === QID);
  assert.ok(target, `${QID} is shown for this document`);
  const choice = target.choices.find((c) => c.value === VALUE);
  assert.ok(choice, `${QID} offers ${VALUE}`);

  // A pre-fill is only a proposal: nothing is in the journal yet.
  assert.equal((await applyInPage()).events.length, 0, 'no answer before a click');
  await page.screenshot({ path: `${out}/questions.png` });

  // Answer: a reason is asked, one operator_input event is appended.
  await card.locator(`[data-assemblies-question="${QID}"] [data-assemblies-choice="${VALUE}"]`).click();
  await card.locator(`[data-assemblies-question="${QID}"][data-answer="${VALUE}"]`).waitFor({ timeout: 60000 });
  assert.equal(dialogs.length, 1, 'the answer asked why');
  let mine = await applyInPage();
  assert.deepEqual(mine.events, [{ question: QID, answer: VALUE, origin: 'operator_input', approved: false, reviewer: 'estimator (Takeoff panel)', reason: REASON }]);
  assert.equal(mine.lines_changed, choice.lines_changed, 'the lines it changed are the ones the choice showed');
  assert.equal(mine.records_changed, choice.records_changed, 'the records it changed are the ones the choice showed');
  checks.push(`${QID}=${VALUE}: one operator_input event; ${choice.lines_changed} lines and ${choice.records_changed} records changed, as shown`);
  await page.screenshot({ path: `${out}/answered.png` });

  // Don't know takes it back; answering again appends: the journal only grows.
  await card.locator(`[data-assemblies-question="${QID}"] [data-assemblies-choice="unknown"]`).click();
  await card.locator(`[data-assemblies-question="${QID}"][data-answer=""]`).waitFor({ timeout: 60000 });
  await card.locator(`[data-assemblies-question="${QID}"] [data-assemblies-choice="${VALUE}"]`).click();
  await card.locator(`[data-assemblies-question="${QID}"][data-answer="${VALUE}"]`).waitFor({ timeout: 60000 });
  mine = await applyInPage();
  assert.deepEqual(mine.events.map((e) => e.answer), [VALUE, 'unknown', VALUE], 'append-only: answer, don\'t know, answer');
  checks.push('"Don\'t know" takes an answer back; the journal only grows');

  // The project file carries the journal; a reload keeps the answer.
  const file = await waitForAsync(async () => {
    const a = await saved();
    return a?.assemblies?.answer_journal?.length === 3 ? a : null;
  }, { timeout: 30000, label: 'journal autosave' });
  writeFileSync(`${out}/takeoff.json`, JSON.stringify({ ...file, schema: file.schema ?? 'opentakeoff.takeoff_canvas.v1' }));
  writeFileSync(`${out}/ui-answered.json`, JSON.stringify({ applications: JSON.parse(mine.applications), lines: JSON.parse(mine.lines) }));
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    await page.waitForFunction((th) => document.documentElement.dataset.theme === th, theme);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: width === 1280 ? 800 : width === 1440 ? 900 : 1080 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}: no horizontal page scroll`);
      await card.screenshot({ path: `${out}/${theme}-${width}.png` });
    }
  }
  checks.push('both themes at 1280, 1440 and 1920 without a horizontal page scroll');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openImportedSheet(page);
  panel = await openAssemblies();
  const again = page.waitForResponse((r) => r.url().includes('/__ot/assemblies-project'), { timeout: 1800000 });
  await panel.locator('[data-assemblies-load]').click();
  assert.equal((await again).status(), 200);
  await panel.locator(`[data-assemblies-question="${QID}"][data-answer="${VALUE}"]`).waitFor({ timeout: 300000 });
  assert.equal((await saved()).assemblies.answer_journal.length, 3, 'reload keeps the journal');
  checks.push('IndexedDB autosave; reload keeps the answer and its journal');

  assert.deepEqual(errors, []);
  writeFileSync(`${out}/checks.json`, JSON.stringify({ ok: true, source: process.env.OT_UI_PDF, answer: `${QID}=${VALUE}`, checks, errors }, null, 2));
  console.log(`Project questions UI proof passed (${checks.length} checks): ${checks.join('; ')}`);
} catch (error) {
  writeFileSync(`${out}/browser-errors.json`, JSON.stringify(errors, null, 2));
  await page.screenshot({ path: `${out}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
