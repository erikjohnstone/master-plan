// UI-only acceptance checks. No model request, no alternate extraction path.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { openImportedSheet } from './fixtures/open-imported-sheet.mjs';
const out=process.env.OT_WORKSPACE_OUT || '/tmp/ot-workspace-ui';
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.OT_BROWSER_PATH || undefined});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok',name);};
const nav=name=>page.locator(`[data-workspace-nav="${name}"]`);
const fitsWorkspace=async locator=>locator.evaluate(el=>{
  const box=el.getBoundingClientRect();
  const dock=el.closest('[data-workspace-dock]').getBoundingClientRect();
  return box.width>0 && box.height>0 && box.top>=dock.top &&
    box.bottom<=Math.min(dock.bottom,innerHeight) && box.left>=dock.left && box.right<=dock.right;
});
try {
  await page.goto(process.env.OT_UI_URL || 'http://localhost:5176');
  await page.locator('input[name="sheet-file"]').first().setInputFiles(resolve(process.env.OT_UI_PDF || 'public/demo/sample-mechanical-set.pdf'));
  await page.waitForFunction(()=>window.__opentakeoff?.graphPrewarm()?.phase==='ready',null,{timeout:300000});
  for(const [width,height] of [[1280,800],[1440,900],[1920,1080],[2560,1440]]) {
    await page.setViewportSize({width,height});
    await openImportedSheet(page);
    await nav('Plans').click();
    for(const name of ['Plans','Schedules','Agent','Takeoff','Report']) {
      const box=await nav(name).boundingBox();
      check(`${width}: ${name} visible and ergonomic`,box && box.x>=0 && box.x+box.width<=width && box.height>=32);
    }
    const layout=await page.evaluate(()=>({top:document.querySelector('.workspace-body').getBoundingClientRect().top,width:document.documentElement.scrollWidth,viewport:innerWidth}));
    check(`${width}: shell at most 132px`,layout.top<=132);
    check(`${width}: no page overflow`,layout.width<=layout.viewport);
    await nav('Agent').click();
    check(`${width}: Agent active`,await nav('Agent').getAttribute('aria-pressed')==='true');
    check(`${width}: composer visible`,await page.locator('.agent-composer').isVisible());
    await nav('Schedules').click();
    check(`${width}: only one primary dock`,await page.locator('[data-workspace-dock]').count()===1);
    check(`${width}: Schedules active`,await nav('Schedules').getAttribute('aria-pressed')==='true');
    const drawing=await page.locator('.workspace-drawing').boundingBox();
    check(`${width}: usable drawing width`,drawing.width>=500);
    const panel=page.locator('[data-schedules-panel]');
    // Exercise a genuinely wide grid without assuming a particular extracted
    // title has the same column count under every supported reader. The real
    // graph remains authoritative; no cells or headers are fabricated here.
    const {table,tableIndex}=await page.evaluate(async()=>{
      const {groupBySheet}=await import('/src/lib/scheduleBrowse.js');
      const tables=groupBySheet(window.__opentakeoff.probe.graphTables()).flatMap(group=>group.tables);
      const table=tables.filter(t=>t.rows?.length).reduce((widest,t)=>
        !widest || (t.headers?.length||0)>(widest.headers?.length||0) ? t : widest,null);
      return {table,tableIndex:tables.indexOf(table)};
    });
    assert.ok(table?.headers.length>=8,'The real sample must supply a wide table (at least eight columns)');
    await panel.locator('[data-schedule-section] button[aria-expanded]').nth(tableIndex).click();
    const headers=await panel.locator('.schedule-grid thead th').allTextContents();
    check(`${width}: all headers unmodified`,JSON.stringify(headers.slice(1))===JSON.stringify(table.headers));
    const cells=await panel.locator('.schedule-grid tbody tr').first().locator('td').allTextContents();
    check(`${width}: all cells unmodified`,JSON.stringify(cells)===JSON.stringify(table.headers.map(h=>table.rows[0].cells?.[h]?.text ?? '')));
    // Wait for the newly mounted grid's layout (including ResizeObserver), not
    // just its text nodes. Keep the same strict overflow assertion on all hosts.
    await page.waitForFunction(()=>{
      const grid=document.querySelector('.schedule-grid-scroll');
      return grid?.clientWidth > 0 && grid.scrollWidth > grid.clientWidth;
    },null,{timeout:10000});
    const grid=await panel.locator('.schedule-grid-scroll').evaluate(el=>({scroll:el.scrollWidth,width:el.clientWidth}));
    check(`${width}: wide table scrolls internally`,grid.scroll>grid.width);
    await panel.getByLabel('Search schedules').fill('NO-SUCH-UI-TABLE');
    check(`${width}: filtered empty state`,await panel.getByRole('heading',{name:'No matching schedules'}).isVisible());
    await panel.getByRole('button',{name:'Clear filters'}).last().click();
    const footprint=(await page.locator('.workspace-drawing').boundingBox()).width;
    await page.locator('.workspace-dock-tools button').click();
    check(`${width}: expanded workspace`,await page.locator('[data-workspace-dock]').getAttribute('data-expanded')==='true');
    check(`${width}: expanded view keeps canvas footprint`,Math.abs((await page.locator('.workspace-drawing').boundingBox()).width-footprint)<1);
    await panel.getByRole('button',{name:'View',exact:true}).first().click();
    await page.waitForFunction(()=>!document.querySelector('[data-workspace-dock][data-expanded]'));
    check(`${width}: evidence reveals drawing`,true);
    const separator=page.getByRole('separator',{name:'Resize Schedules workspace'});
    await separator.focus(); await separator.press('Home');
    check(`${width}: keyboard minimum`,await separator.getAttribute('aria-valuenow')==='480');
    await separator.press('ArrowLeft');
    check(`${width}: keyboard increment`,await separator.getAttribute('aria-valuenow')==='512');
    await separator.press('End');
    const before=Number(await separator.getAttribute('aria-valuenow'));
    const box=await separator.boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+150); await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+64,box.y+150,{steps:5});await page.mouse.up();
    check(`${width}: pointer resize`,Number(await separator.getAttribute('aria-valuenow'))===before-64);
    await panel.getByRole('button',{name:'Close schedules'}).click();
    await page.waitForTimeout(100);
    check(`${width}: focus returns to Schedules`,await nav('Schedules').evaluate(el=>el===document.activeElement));
    await nav('Plans').click();
    await page.locator('.workspace-properties-toggle').click();
    check(`${width}: condition properties available on demand`,await page.getByRole('region',{name:'Condition properties'}).isVisible());
    await page.getByRole('region',{name:'Condition properties'}).locator('input').first().focus();
    await page.keyboard.press('Escape');
    await page.locator('.workspace-condition-tools').waitFor({state:'detached'});
    check(`${width}: condition popover Escape restores focus`,await page.locator('.workspace-properties-toggle').evaluate(el=>el===document.activeElement));
    await page.keyboard.press('f');
    await page.locator('[data-topbar]').waitFor({state:'detached'});
    check(`${width}: focus mode preserved`,await page.locator('[data-topbar]').count()===0);
    await page.keyboard.press('f');
    await page.locator('[data-topbar]').waitFor();
    await page.screenshot({path:resolve(out,`${width}-plans.png`)});
  }
  // Component callback contract: real component, deterministic props, no network.
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(async()=>{
    const {mountAgentHarness}=await import('/scripts/fixtures/ui-agent-harness.jsx');
    mountAgentHarness();
  });
  await page.locator('.agent-starters button').first().click();
  check('starter only fills draft',(await page.evaluate(()=>window.__uiCalls)).length===0);
  check('starter focuses composer',await page.locator('[name="agent-goal"]').evaluate(el=>el===document.activeElement));
  await page.locator('[name="agent-goal"]').fill('  Count globe valves  ');
  await page.getByRole('button',{name:'Run',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),['onRun','Count globe valves',{}]);
  check('Run preserves trimmed text and options',true);
  await page.evaluate(()=>window.__uiRender({thread:[{role:'assistant',text:'AHU-1 is 500 CFM.'}]}));
  await page.getByRole('button',{name:'Ask',exact:true}).waitFor();
  await page.locator('[name="agent-goal"]').fill('  Why?  ');await page.locator('[name="agent-goal"]').press('Control+Enter');
  assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),['onRun','Why?',{followUp:true}]);
  check('follow-up preserves exact options',true);
  await page.locator('.workspace-dock-tools button').click();
  await page.getByRole('button',{name:'AHU-1',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),['onOpenCitation',{id:'cite-1',sheet:'test#1',bbox_px:[10,20,30,40],row_key:'AHU-1',column:'CFM',value:'500'}]);
  check('citation callback payload unchanged',true);
  await page.waitForFunction(()=>!document.querySelector('[data-workspace-dock][data-expanded]'));
  check('Agent citation restores split',await page.locator('[data-workspace-dock]').getAttribute('data-expanded')===null);
  await page.evaluate(()=>window.__uiRender({running:true,status:'Reading schedules…',log:[{kind:'progress',text:'Reading schedule evidence'}]}));
  await page.locator('[data-agent-status]').waitFor();
  check('900px: running status fits real workspace',await fitsWorkspace(page.locator('[data-agent-status]')));
  check('900px: running composer fits real workspace',await fitsWorkspace(page.locator('.agent-composer')));
  await page.getByRole('button',{name:'■ Stop',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),['onStop',{event:'click'}]);
  check('Stop preserves direct click event contract',true);
  await page.screenshot({path:resolve(out,'agent-running.png')});
  await page.evaluate(()=>window.__uiRender({running:false,proposals:[{id:'proposal-1',condition_id:'c1',measure_role:'count',count:1,evidence:{schedule_row_tag:'AHU-1'}}]}));
  await page.locator('.agent-review-heading').waitFor();
  check('900px: pending review count fits real workspace',await fitsWorkspace(page.locator('.agent-review-heading')));
  check('900px: review composer fits real workspace',await fitsWorkspace(page.locator('.agent-composer')));
  for(const [title,callback,args] of [['Accept proposal','onAccept',['proposal-1']],['Reject proposal','onReject',['proposal-1']]]) {
    await page.getByTitle(title,{exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),[callback,...args]);
  }
  for(const [label,callback] of [['Accept all','onAcceptAll'],['Reject all','onRejectAll']]) {
    await page.getByRole('button',{name:label,exact:true}).click();assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),[callback,{event:'click'}]);
  }
  check('proposal review callbacks and IDs unchanged',true);
  check('no automatic accept or commit',(await page.evaluate(()=>window.__uiCalls)).length===0);
  for(const [title,callback] of [['AI settings','onOpenSettings'],['Start a new question','onResetChat'],['Run History','onToggleHistory'],['Open Takeoff panel — structured workflow data','onOpenTakeoff'],['Close panel','onClose']]) {
    await page.getByTitle(title,{exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>window.__uiCalls.pop()),[callback,{event:'click'}]);
  }
  check('settings, New, history, Takeoff and close callbacks unchanged',true);
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:resolve(out,'agent-review-hud.png')});
  check('no browser errors',errors.length===0);
  writeFileSync(resolve(out,'checks.json'),JSON.stringify({checks,errors},null,2));
} catch (error) {
  await page.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});
  const layout=await page.evaluate(()=>[...document.querySelectorAll('.workspace-dock,.schedule-grid-scroll,.schedule-grid')].map(el=>({
    className:el.className,clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
    rect:el.getBoundingClientRect().toJSON(),
  }))).catch(()=>[]);
  writeFileSync(resolve(out,'failure.json'),JSON.stringify({error:String(error),layout,checks,errors},null,2));
  throw error;
} finally {await browser.close();}
