// Surface-only regression evidence. Real sample, real graph and paint callbacks.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const phase = process.env.OT_PROOF_PHASE || 'baseline';
const out = resolve(process.env.OT_PROOF_OUT || '/tmp/ot-workspace-proof', phase);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.OT_BROWSER_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
const settled = () => page.waitForTimeout(500);
const shot = async name => { await settled(); await page.screenshot({ path: resolve(out, name + '.png') }); };
const clean = value => JSON.parse(JSON.stringify(value, (key, val) =>
  ['id', 'condition_id', 'created_at', 'updated_at', 'ts', 'proposed_ts', 'accepted_ts'].includes(key) ? undefined : val));
try {
  await page.goto(process.env.OT_UI_URL || 'http://localhost:5176');
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_PROOF_PDF || 'public/demo/sample-mechanical-set.pdf'));
  await page.waitForFunction(() => window.__opentakeoff?.graphPrewarm()?.phase === 'ready', null, { timeout: 300000 });
  await settled();
  const evidence = { tables: await page.evaluate(() => window.__opentakeoff.probe.graphTables()) };
  console.log('graph ready', evidence.tables.length, 'tables');
  for (const [width, height] of [[1280,800],[1440,900],[1920,1080],[2560,1440]]) {
    await page.setViewportSize({width,height});
    await shot(`${width}-plans`);
    await page.evaluate(() => window.__opentakeoff.probe.openSchedules());
    const schedules = page.locator('[data-schedules-panel]');
    const fan = schedules.getByRole('button', {name:/FAN SCHEDULE/i}).first();
    if (await fan.count()) await fan.click();
    await shot(`${width}-schedules`);
    if(phase==='after') {
      await page.locator('.workspace-dock-tools button').click();
      await schedules.getByRole('button',{name:/DIFFUSER, GRILLE, REGISTER SCHEDULE/}).first().click();
      await shot(`${width}-schedules-expanded`);
      await page.locator('.workspace-dock-tools button').click();
    }
    await schedules.locator('button[title="Close panel"]').click();
    await page.evaluate(() => window.__opentakeoff.openAgent());
    await shot(`${width}-agent-empty`);
    await page.locator('textarea[name="agent-goal"]').locator('xpath=ancestor::div[3]').locator('button[title="Close panel"]').count().then(async n => {
      if(n) await page.locator('textarea[name="agent-goal"]').locator('xpath=ancestor::div[3]').locator('button[title="Close panel"]').click();
      else await page.locator('button[title="Close panel"]').last().click();
    });
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(() => window.__opentakeoff.probe.openSchedules());
  const panel = page.locator('[data-schedules-panel]');
  await panel.getByRole('button',{name:'View',exact:true}).first().click();
  await settled();
  evidence.tablePaint = clean(await page.evaluate(() => window.__opentakeoff.probe.markups().filter(m=>m.source==='schedule_browse')));
  const expander = panel.locator('button[aria-expanded]').first();
  if(await expander.getAttribute('aria-expanded') !== 'true') await expander.click();
  await panel.getByTitle(`Show ${evidence.tables[0].rows[0].key} on the drawing`,{exact:true}).click();
  await settled();
  evidence.rowPaint = clean(await page.evaluate(() => window.__opentakeoff.probe.markups().filter(m=>m.source==='schedule_browse')));
  await panel.locator('button[title="Close panel"]').click();
  const table = evidence.tables.find(t=>t.rows?.some(r=>/^[A-Z]+-\d/.test(r.key)));
  const row = table.rows.find(r=>/^[A-Z]+-\d/.test(r.key));
  const cell = Object.values(row.cells).find(c=>Array.isArray(c.bbox));
  evidence.cite = clean(await page.evaluate(async ({table,row,cell}) => window.__opentakeoff.probe.cite({sheet:table.sheet,bbox_px:cell.bbox,row_key:row.key,column:'CFM',value:cell.text,table_title:typeof table.title==='string'?table.title:table.title.text}),{table,row,cell}));
  await page.evaluate(key=>window.__opentakeoff.probe.seedAnswer(`${key} is in the schedule. Review the cited drawing before committing.`),row.key);
  await page.locator('[data-agent-answer="structured"]').last().getByRole('button',{name:row.key,exact:true}).click();
  await settled();
  evidence.citeSheets=await page.evaluate(()=>window.__opentakeoff.probe.sheets());
  await page.evaluate(() => {
    const p=window.__opentakeoff.probe, sheet=p.sheets()[0].key;
    p.setScale(sheet, `1/8" = 1'-0"`);
  });
  await settled();
  await page.evaluate(() => {
    const p=window.__opentakeoff.probe, sheet=p.sheets()[0].key, id=p.mintCondition('UI-VERIFY');
    p.stageProposals([0.35,0.55].map(x=>({sheet,condition_id:id,measure_role:'count',verts_norm:[[x,0.4]],evidence:{schedule_row_tag:'UI-VERIFY'}})));
  });
  await settled();
  evidence.proposals=clean(await page.evaluate(()=>window.__opentakeoff.probe.proposals()));
  for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[2560,1440]]) {
    await page.setViewportSize({width,height}); await shot(`${width}-agent-review`);
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await shot('2560-agent-hud');
  await page.evaluate(()=>document.documentElement.dataset.theme='light');
  await page.getByRole('button',{name:'✓',exact:true}).last().click();
  await settled();
  evidence.accepted=clean(await page.evaluate(()=>({shapes:window.__opentakeoff.probe.shapes(),pending:window.__opentakeoff.probe.proposals()})));
  await page.getByRole('button',{name:'Reject all',exact:true}).click();
  await settled();
  evidence.rejected=clean(await page.evaluate(()=>({shapes:window.__opentakeoff.probe.shapes(),pending:window.__opentakeoff.probe.proposals()})));
  // Existing seed hook: rendering/export contract only, no synthetic engine answer.
  await page.evaluate(({table,row,cell})=>window.__otSeedAgentTakeoff([{id:'ui-proof-row',tag:row.key,field:'CFM',value:cell.text,sheet_id:table.sheet,table_title:typeof table.title==='string'?table.title:table.title.text,workflow:'UI parity fixture',source_tool:'query_table',cite:{sheet:table.sheet,bbox_px:cell.bbox,row_key:row.key,column:'CFM',value:cell.text}}]),{table,row,cell});
  await settled();
  evidence.takeoffCount=await page.evaluate(()=>window.__opentakeoff.takeoffRowCount());
  evidence.takeoffVisible=await page.locator('[aria-label="Takeoff"]').innerText();
  await page.locator('[aria-label="Takeoff"]').getByRole('button',{name:'Workflow data',exact:true}).click();
  evidence.workflowVisible=await page.locator('[aria-label="Takeoff"]').innerText();
  writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));
  await shot('takeoff');
  const download=page.waitForEvent('download');
  await page.locator('[aria-label="Takeoff"]').getByRole('button',{name:'CSV',exact:true}).click();
  const csv=await download; await csv.saveAs(resolve(out,'takeoff.csv'));
  evidence.csv=readFileSync(resolve(out,'takeoff.csv'),'utf8');
  evidence.errors=errors;
  writeFileSync(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));
  assert.deepEqual(errors,[]);
  if(phase==='after') assert.deepEqual(evidence,JSON.parse(readFileSync(resolve(out,'../baseline/evidence.json'),'utf8')));
  console.log(phase,'proof complete:',out);
} finally { await browser.close(); }
