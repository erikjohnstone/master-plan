/** Controlled source-shaped public export checks. Actual-PDF UI acceptance is
 * separate; these assertions do not establish real installed capabilities. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { engineeringFixture, uuid } from '../../web/test/helpers/basEngineeringFixture.ts';
import { basEngineeringWorkbook } from '../../web/src/lib/basEngineeringExport.ts';
import { buildXlsx } from '../../web/src/lib/xlsx.js';
import { canonicalBasJson } from '../../web/src/lib/basCanonical.ts';
import { applyBasEquipmentReview } from '../../web/src/lib/basEquipmentReview.ts';
import { emptyBasEquipmentRegister } from '../../web/src/lib/basEquipmentRegister.ts';
import { applyBasEngineeringReview, inspectBasEngineering } from '../src/basEngineeringReview.ts';
import { Session } from '../src/session.ts';
import { buildServer } from '../server.ts';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { writeEngineeringWorkbook } from '../src/engineeringWorkbookFile.ts';
const { unzipSync, strFromU8 } = createRequire(new URL('../../web/package.json', import.meta.url))('fflate');

test('staged workbook cancellation preserves old files, absent targets and cleans only its temporary output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bas-engineering-atomic-')), target = join(dir, 'review.xlsx');
  await writeFile(target, 'Original deliverable');
  await assert.rejects(writeEngineeringWorkbook(target, new Uint8Array([1, 2]), true, () => { throw new Error('Cancelled before commit'); }), /Cancelled/);
  assert.equal(await readFile(target, 'utf8'), 'Original deliverable');
  const absent = join(dir, 'absent.xlsx');
  await assert.rejects(writeEngineeringWorkbook(absent, new Uint8Array([1, 2]), false, () => { throw new Error('Changed snapshot'); }), /Changed/);
  await assert.rejects(stat(absent), /ENOENT/);
  assert.deepEqual(await readdir(dir), ['review.xlsx']);
  await writeEngineeringWorkbook(target, new Uint8Array([1, 2]), true, () => {});
  assert.deepEqual(await readFile(target), Buffer.from([1, 2]));
  assert.deepEqual(await readdir(dir), ['review.xlsx']);
});

test('saved exports retain outcomes, exclusions, exact source frame and pinned withdrawn owners', async () => {
  const f = await engineeringFixture(), first = await applyBasEngineeringReview(f.workflow, f.request, 'operator_input');
  const request = structuredClone(f.request); request.operation_id = uuid(51); request.expected_head = first.event.event_id;
  request.register.targets[0].disposition = 'excluded'; request.register.targets[0].exclusion_reason = 'Excluded for a declared reason; retain failure';
  const check = request.register.input.checks[0]; if (check.kind !== 'signal') throw new Error('fixture');
  check.source_mode = null; check.sink_direction!.value = 'output';
  const second = await applyBasEngineeringReview(first.workflow, request, 'operator_input');
  const withdrawn = await applyBasEquipmentReview(second.workflow, { operation_id: uuid(60), capture_id: request.capture_id,
    expected_head: request.expected_equipment_head, reason: 'Controlled withdrawal', register: emptyBasEquipmentRegister() }, 'operator_input');
  const before = canonicalBasJson(withdrawn), inspection = await inspectBasEngineering(withdrawn, request.capture_id);
  const book = await basEngineeringWorkbook(withdrawn, inspection);
  assert.equal(canonicalBasJson(withdrawn), before);
  const rows = (name: string) => book.sheets.find(s => s.name === name)!.rows.slice(1);
  assert.equal(rows('Checks').length, 2); assert.equal(rows('History').length, 2);
  assert.deepEqual(rows('Checks')[0].slice(0, 7), ['Stale dependencies', 'Signal direction & mode', 'AHU-1', 'fail', 'excluded', 'Controlled signal comparison', request.register.targets[0].exclusion_reason]);
  assert.equal(rows('Checks')[1][0], 'Superseded review'); assert.equal(rows('Checks')[1][3], 'pass');
  assert.ok(rows('Constraints').some(r => r[2] === 'not_evaluable'));
  assert.ok(rows('Findings').some(r => r[2] === 'engineering_check_explicitly_excluded'));
  assert.ok(rows('Inputs').some(r => r[1] === 'source_mode' && r[2] === 'null' && r[3] === 'Unknown / not provided'));
  assert.ok(rows('Inputs').some(r => r[1] === 'sink_modes.basis.original_text' && r[3] === f.source.pages[0].spans[1].text));
  assert.equal(rows('Resources').length, 4); assert.equal(rows('Resources')[0][1], 'AHU-1');
  assert.equal(rows('Source locations').length, 1);
  const source = rows('Source locations')[0];
  assert.equal(source[0], f.source.pages[0].spans[1].text); assert.equal(source[2], 1);
  assert.equal(source[4], JSON.stringify(f.source.pages[0].spans[1].bbox_px)); assert.equal(source[5], 1800); assert.equal(source[6], 1000);
  assert.equal(source[12], 'a'.repeat(64)); assert.equal(source[13], request.capture_id);
  assert.ok(rows('Review').some(r => r[1] === 'All saved engineering results replayed in shared Python at export'));
  const unverified = await basEngineeringWorkbook(withdrawn);
  assert.ok(unverified.sheets[0].rows.some(r => String(r[1]).includes('replay is required')));
  assert.equal((await basEngineeringWorkbook(withdrawn, inspection)).workflow_sha256, book.workflow_sha256);
  await assert.rejects(basEngineeringWorkbook(first.workflow, inspection), /differs/);
  const corrupt = structuredClone(withdrawn); corrupt.engineering_events![0].result.checks[0].constraints[0].message = 'tamper';
  await assert.rejects(basEngineeringWorkbook(corrupt), /fingerprint/);
  await assert.rejects(basEngineeringWorkbook(f.workflow), /No saved engineering reviews/);
});

test('public MCP XLSX export matches shared projection, preserves session, and protects existing files', async () => {
  const f = await engineeringFixture(), saved = await applyBasEngineeringReview(f.workflow, f.request, 'operator_input');
  const session = new Session(), server = buildServer(session), client = new Client({ name: 'engineering-export-test', version: '1' });
  const [ct, st] = InMemoryTransport.createLinkedPair(); await server.connect(st); await client.connect(ct);
  const dir = await mkdtemp(join(tmpdir(), 'bas-engineering-export-'));
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text: string }>;
    return { error: !!result.isError, data: JSON.parse(content[0].text) };
  };
  try {
    assert.equal((await call('load_plan', { path: fileURLToPath(new URL('../../demo/sample-plan.pdf', import.meta.url)) })).error, false);
    // Ordinary import of controlled retained history, not an interpretation of
    // the demo drawing. The capture retains its own original source identity.
    assert.equal(session.retainBasWorkflow(saved.workflow), false, 'foreign capture cannot become a compile result for the demo');
    const archive = join(dir, 'controlled.takeoff.json');
    await writeFile(archive, JSON.stringify({ ...session.exportPayload(), bas_workflow: saved.workflow }));
    assert.equal((await call('import_takeoff', { path: archive })).error, false);
    const baseline = await call('export_takeoff'), target = join(dir, 'engineering.xlsx');
    const exported = await call('export_takeoff', { engineering_workbook_path: target });
    assert.equal(exported.error, false, JSON.stringify(exported.data)); assert.deepEqual(exported.data, baseline.data);
    const bytes = await readFile(target), files = unzipSync(bytes);
    const expected = unzipSync(await buildXlsx((await basEngineeringWorkbook(saved.workflow, await inspectBasEngineering(saved.workflow, f.request.capture_id))).sheets));
    assert.deepEqual(Object.keys(files), Object.keys(expected));
    for (const key of Object.keys(files)) assert.equal(strFromU8(files[key]), strFromU8(expected[key]), key);
    assert.deepEqual(await call('export_takeoff'), baseline);
    assert.equal((await call('export_takeoff', { engineering_workbook_path: target })).error, true);
    assert.deepEqual(await readFile(target), bytes);
    const other = join(dir, 'unrelated.xlsx'); await writeFile(other, 'preserve me');
    assert.equal((await call('export_takeoff', { engineering_workbook_path: other })).error, true); assert.equal(await readFile(other, 'utf8'), 'preserve me');
    assert.equal((await call('export_takeoff', { engineering_workbook_path: other, overwrite: true })).error, false);
    const json = join(dir, 'takeoff.json'), bad = join(dir, 'not-written.xlsx');
    assert.equal((await call('export_takeoff', { path: json, engineering_workbook_path: bad })).error, true);
    await assert.rejects(stat(json), /ENOENT/); await assert.rejects(stat(bad), /ENOENT/);
    assert.equal((await call('export_takeoff', { path: json })).error, false);
    assert.deepEqual(JSON.parse(await readFile(json, 'utf8')), baseline.data);
    assert.deepEqual(await call('export_takeoff'), baseline);
    const originalExport = session.exportPayload.bind(session), stalePath = join(dir, 'stale-not-written.xlsx');
    let armed = true;
    session.exportPayload = () => {
      const payload = originalExport();
      if (armed) { armed = false; queueMicrotask(() => { session.conditions.push({ id: 'controlled-concurrent-condition', finish_tag: 'Concurrent in-place edit',
        color: '#112233', fill: '#112233', hatch: 'solid', multiplier: 1, waste_pct: 0, materials: [] }); }); }
      return payload;
    };
    const stale = await call('export_takeoff', { engineering_workbook_path: stalePath });
    assert.equal(stale.error, true); assert.match(JSON.stringify(stale.data), /Workspace changed/);
    await assert.rejects(stat(stalePath), /ENOENT/);
    assert.equal(session.conditions.at(-1)!.finish_tag, 'Concurrent in-place edit'); session.exportPayload = originalExport;
  } finally { await client.close(); await server.close(); }
});
