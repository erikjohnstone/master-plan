// Production UI components replaying recorded answer rows, not a fresh model run.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
const capture = readFileSync(resolve(process.env.OT_ANSWER_CAPTURE || '../docs/ui-workspace/evidence/live-table19/19__vol2__094.answer.txt'), 'utf8');
const lines = capture.split('\n');
const rows = lines.filter(line => line.startsWith('MARK:'));
assert.equal(rows.length, 5);
const title = lines[lines.indexOf('ANSWER') + 1];
const columnHeading = lines.find(line => line.startsWith('MARK –'));
// Restore list/heading Markdown lost by the earlier innerText capture.
const text = `**${title}**\n\n${columnHeading ? `**${columnHeading}**\n\n` : ''}${rows.map(row => '- ' + row).join('\n')}`;
const expected = rows.map(row => row.split(' · ').map(chunk => {
  const colon = chunk.indexOf(': ');
  return [chunk.slice(0, colon), chunk.slice(colon + 2)];
}));
assert.ok(expected.every(row => row.length === 35));
const out = process.env.OT_ANSWER_OUT || '/tmp/ot-agent-answer';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(String(error)));
const check = (label, ok) => { assert.ok(ok, label); checks.push(label); console.log('ok', label); };
const reader = page.locator('[data-agent-results]');
const dock = page.locator('[data-workspace-dock]');
const rowButtons = () => page.locator('.agent-results-nav > div > button');
const readFields = () => page.locator('.agent-results-detail dl > div').evaluateAll(nodes => nodes.map(node => [node.querySelector('dt').textContent, node.querySelector('dd').textContent]));
try {
  await page.goto(process.env.OT_UI_URL || 'http://127.0.0.1:5176');
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve('public/demo/sample-mechanical-set.pdf'));
  await page.waitForFunction(() => window.__opentakeoff?.indexProgress?.()?.phase === 'ready', null, { timeout: 180000 });
  await openImportedSheet(page);
  await page.locator('.workspace-body').waitFor();
  await page.evaluate(async () => {
    const { mountAgentHarness } = await import('/scripts/fixtures/ui-agent-harness.jsx');
    mountAgentHarness();
  });
  await page.evaluate(text => window.__uiRender({ thread: [{ role: 'assistant', text }], citations: [], takeoffRowCount: 0 }), text);
  const explore = page.getByRole('button', { name: 'Explore results', exact: true });
  await explore.waitFor();
  await dock.evaluate(el => { el.parentElement.style.width = '100vw'; });
  const splitWidth = (await dock.boundingBox()).width;
  check('one results entry replaces five in-chat accordions', await explore.count() === 1 && await page.locator('[data-agent-answer-record]').count() === 0);
  check('reader does not open or execute automatically', await reader.count() === 0 && (await page.evaluate(() => window.__uiCalls)).length === 0);
  await dock.screenshot({ path: resolve(out, 'results-entry.png') });
  await page.locator('[name="agent-goal"]').fill('Keep this follow-up draft');
  await explore.click();
  await reader.waitFor();
  check('reader expands the existing main workspace', await dock.getAttribute('data-expanded') !== null && (await reader.boundingBox()).width >= 1200);
  check('focus enters Back to conversation', await page.getByRole('button', { name: 'Back to conversation' }).evaluate(el => el === document.activeElement));
  check('five original rows, no invented rows', await rowButtons().count() === 5);
  if (expected[0][0][1].length > 60) {
    check('long navigation labels retain their full tooltip value', await rowButtons().first().locator('strong').getAttribute('title') === expected[0][0][1]);
    check('long labels do not consume multiple navigation lines', await rowButtons().first().locator('strong').evaluate(el => el.getBoundingClientRect().height < 32 && getComputedStyle(el).textOverflow === 'ellipsis'));
  }
  for (let i = 0; i < expected.length; i++) {
    await rowButtons().nth(i).click();
    assert.deepEqual(await readFields(), expected[i]);
    check(`row ${i + 1}: all 35 labels and values unchanged`, true);
  }
  await page.getByRole('searchbox', { name: 'Find a row' }).fill('no such item');
  check('search empty state is explicit', await page.getByText('No matching rows. Clear the search to see all rows.').isVisible());
  assert.deepEqual(await readFields(), expected[4]);
  check('filtering does not replace the selected row with unrelated data', true);
  await page.getByRole('searchbox', { name: 'Find a row' }).fill('');
  await rowButtons().first().click();
  await page.screenshot({ path: resolve(out, 'results-details.png') });
  for (const width of [1280, 1440, 1920, 2560]) {
    await page.setViewportSize({ width, height: 900 });
    check(`${width}: reader uses available width without page overflow`, await reader.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width >= innerWidth - 80 && document.documentElement.scrollWidth <= innerWidth; }));
    check(`${width}: field content fits detail pane`, await page.locator('.agent-results-detail').evaluate(el => el.scrollWidth <= el.clientWidth));
    check(`${width}: composer and review remain visible below reader`, await page.locator('.agent-composer').evaluate(el => { const r=el.getBoundingClientRect(); const reader=document.querySelector('[data-agent-results]').getBoundingClientRect(); const review=document.querySelector('.agent-review-heading').getBoundingClientRect(); return r.top >= reader.bottom && r.bottom <= innerHeight && review.bottom <= innerHeight; }));
    await page.screenshot({ path: resolve(out, `results-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Compare rows', exact: true }).click();
  assert.deepEqual(await page.locator('.agent-results-comparison th').allTextContents(), expected[0].map(pair => pair[0]));
  const values = await page.locator('.agent-results-comparison tbody tr').evaluateAll(nodes => nodes.map(node => [...node.querySelectorAll('td')].map(cell => cell.textContent)));
  assert.deepEqual(values, expected.map(row => row.map(pair => pair[1])));
  check('comparison preserves all 175 cells and exact original headers/order', true);
  check('wide comparison scrolls internally', await page.locator('.agent-results-comparison').evaluate(el => el.scrollWidth > el.clientWidth && document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: resolve(out, 'results-comparison.png') });
  await page.locator('.agent-results-comparison').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  check('comparison keeps row identity visible at the far-right columns', await page.locator('.agent-results-comparison tbody td').first().evaluate(el => Math.abs(el.getBoundingClientRect().left - el.closest('.agent-results-comparison').getBoundingClientRect().left) < 2));
  await page.screenshot({ path: resolve(out, 'results-comparison-last-columns.png') });
  await page.getByRole('button', { name: 'Details', exact: true }).click();
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.screenshot({ path: resolve(out, 'results-hud.png') });
  await page.evaluate(() => window.__uiRender({ running: true, status: 'Reading more schedule evidence…', log: [{ kind: 'progress', text: 'Reading schedule evidence' }], proposals: [{ id: 'p1', condition_id: 'c1', measure_role: 'count', count: 1 }] }));
  check('live status remains visible while reading results', await page.locator('[data-agent-status]').evaluate(el => { const r = el.getBoundingClientRect(); return r.height > 0 && r.top >= document.querySelector('[data-agent-results]').getBoundingClientRect().bottom && r.bottom <= document.querySelector('.agent-composer').getBoundingClientRect().top; }));
  check('Stop and pending review remain accessible in reader mode', await page.getByRole('button', { name: '■ Stop', exact: true }).isVisible() && await page.getByText('Proposals · 1', { exact: true }).isVisible());
  await page.screenshot({ path: resolve(out, 'results-running-review.png') });
  await page.evaluate(() => window.__uiRender({ running: false, status: '', log: [], proposals: [] }));
  await reader.locator('button').first().focus();
  await page.keyboard.press('Escape');
  await reader.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.activeElement?.textContent === 'Explore results');
  check('Escape restores focus and original split width', Math.abs((await dock.boundingBox()).width - splitWidth) < 1);
  check('reading results preserves the follow-up draft', await page.locator('[name="agent-goal"]').inputValue() === 'Keep this follow-up draft');
  check('reading, filtering and comparing never call run/accept or mutate data', (await page.evaluate(() => window.__uiCalls)).length === 0);
  // Separate synthetic callback control: never misrepresent it as live evidence.
  const cite = { id: 'cite-1', sheet: 'test#1', bbox_px: [10, 20, 30, 40], row_key: 'AHU-1', column: 'CFM', value: '500' };
  await page.evaluate(cite => window.__uiRender({ citations: [cite], thread: [{ role: 'assistant', text: '- MARK: AHU-1 · CFM: 500 · NOTE: unchanged · FLAG: NO\n- MARK: AHU-2 · DIFFERENT: 0 · NOTE: verify · FLAG: YES' }] }), cite);
  await explore.click();
  check('different field schemas are not merged into a comparison table', await page.getByRole('button', { name: 'Compare rows', exact: true }).count() === 0);
  await page.locator('.agent-results-detail dl button').first().click();
  assert.deepEqual(await page.evaluate(() => window.__uiCalls.pop()), ['onOpenCitation', cite]);
  await reader.waitFor({ state: 'detached' });
  check('citation closes reader, reveals drawing, preserves callback and bbox', await dock.getAttribute('data-expanded') === null);
  await explore.click();
  await page.getByRole('button', { name: 'Back to conversation' }).click();
  await reader.waitFor({ state: 'detached' });
  check('Back restores conversation without clearing it', await explore.isVisible());
  await explore.click();
  await page.evaluate(() => window.__uiRender({ thread: [] }));
  await reader.waitFor({ state: 'detached' });
  check('removing a response cleans up its reader and transient expansion', await dock.getAttribute('data-expanded') === null);
  check('no browser errors', errors.length === 0);
  writeFileSync(resolve(out, 'checks.json'), JSON.stringify({ provenance: 'Presentation replay of 175 recorded answer fields; separate synthetic citation control', checks, errors }, null, 2));
} finally { await browser.close(); }
