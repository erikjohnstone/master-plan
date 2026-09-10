/** Built public tool with a real original and actual browser-reviewed history.
 * Scope/applicability and counterpart ratings are controlled reviewer inputs. */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { assertProofEqual as same } from './helpers/proofEquality.ts';
import { catalogBasScope, prepareBasScopeCoverage } from '../../web/src/lib/basScopeCatalog.ts';
import { readBasScopeDecision } from '../../web/src/lib/basScopeReview.ts';
import { basScopeTransportResultSchema } from '../../web/src/lib/basScopeTransportContract.ts';
const [pdf, archive, browserReplay, output] = process.argv.slice(2);
assert.ok(pdf && archive && browserReplay && output, 'Original PDF, browser history/replay and fresh output required');
const out = resolve(output); assert.equal(existsSync(out), false); mkdirSync(out, { recursive: true });
const original = JSON.parse(readFileSync(resolve(archive), 'utf8')).bas_workflow;
const browser = JSON.parse(readFileSync(resolve(browserReplay), 'utf8'));
const timings: Record<string, number> = {}, checks: string[] = [];
async function connection() {
  const client = new Client({ name: 'bas-scope-public-proof', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/server.js'],
    cwd: fileURLToPath(new URL('../', import.meta.url)), stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', b => { stderr = (stderr + b.toString()).slice(-65536); });
  await client.connect(transport);
  const call = async (name: string, args: Record<string, unknown> = {}, expectError = false) => {
    const response = await client.callTool({ name, arguments: args }, undefined, { timeout: 600000 });
    assert.equal(!!response.isError, expectError, JSON.stringify(response.content).slice(0, 2000));
    const text = response.content.find(c => c.type === 'text'); assert.ok(text?.type === 'text');
    const parsed = JSON.parse(text.text);
    if (response.structuredContent) same(response.structuredContent, parsed, `${name} text/structured parity`);
    return parsed;
  };
  const scope = async (command: Record<string, unknown>, key?: string) => {
    const start = performance.now(), result = basScopeTransportResultSchema.parse((await call('bas_scope_review', { command })).result);
    if (key) timings[key] = Math.round(performance.now() - start); return result;
  };
  return { client, call, scope, close: async () => { await client.close(); await transport.close(); return stderr; } };
}
let c = await connection();
try {
  await c.call('load_plan', { path: resolve(pdf) }); await c.call('import_takeoff', { path: resolve(archive) });
  same((await c.call('export_takeoff')).bas_workflow, original, 'Ordinary import preserves actual browser history');
  const saved = original.scope_events.find((e: { action: { kind: string } }) => e.action.kind === 'save_scope'); assert.ok(saved);
  const source_set_id = saved.action.specification.basis.source_set_id;
  const catalog = await c.scope({ action: 'catalog', source_set_id, query: { path: ['targets'], limit: 2 } }, 'catalog_ms');
  const shared = await catalogBasScope(original, { source_set_id });
  assert.equal(catalog.page!.total, shared.targets.length);
  assert.ok(shared.targets.some(t => t.target.claim === 'assembly_components'));
  const replay = await c.scope({ action: 'replay', event_id: browser.event.event_id }, 'replay_ms');
  await c.scope({ action: 'export', view_id: replay.view_id, path: resolve(out, 'historical-replay.json') });
  const expected = await readBasScopeDecision(original, browser.event.event_id);
  const exported = JSON.parse(readFileSync(resolve(out, 'historical-replay.json'), 'utf8'));
  same(exported, expected, 'Built MCP/shared exact full replay');
  same(exported.original, browser.original, 'Browser/MCP identical original coverage, mappings and pinned evidence');
  const source = exported.original.value.source, target = exported.original.value.claim.target;
  const root = shared.targets.find(t => t.target.capture_id === target.capture_id && t.target.claim === target.claim && t.target.subject_id === target.subject_id);
  assert.ok(root);
  const referenced = new Set(root.source_refs.filter(s => s.page_id === source.unit.page_id && s.span_id).map(s => s.span_id));
  const span = source.spans.find((s: { span_id: string; bbox_px: unknown }) => referenced.has(s.span_id) && s.bbox_px);
  assert.ok(span); const [x0, y0, x1, y1] = span.bbox_px;
  const image = await c.client.callTool({ name: 'view_sheet', arguments: { sheet: source.unit.page_id,
    original_pdf_path: resolve(pdf), region: { x0, y0, x1, y1 }, px: 1200 } });
  assert.equal(image.isError, undefined, JSON.stringify(image.content).slice(0, 1000));
  const png = image.content.find(e => e.type === 'image'); assert.ok(png?.type === 'image');
  writeFileSync(resolve(out, 'original-source.png'), Buffer.from(png.data, 'base64'));
  same((await c.call('export_takeoff')).bas_workflow, original, 'Read/source view changes no history');
  const coverage = original.scope_events.find((e: { action: { kind: string } }) => e.action.kind === 'record_coverage'); assert.ok(coverage);
  const specification = { ...saved.action.specification, basis: shared.basis };
  const preparation = { specification, claim: coverage.action.claim, unit: coverage.action.unit };
  const prepared = await c.scope({ action: 'prepare_coverage', request: preparation }, 'prepare_ms');
  await c.scope({ action: 'export', view_id: prepared.view_id, path: resolve(out, 'prepared.json') });
  same(JSON.parse(readFileSync(resolve(out, 'prepared.json'), 'utf8')), await prepareBasScopeCoverage(original, preparation), 'Public/shared complete mapping parity');
  const request = { operation_id: randomUUID(), expected_head: shared.head, reviewer: 'Controlled MCP proposal',
    reason: 'Explicit source review proposal; never authenticated human approval',
    action: { ...coverage.action, basis: shared.basis } };
  const record = await c.scope({ action: 'record', request }, 'record_ms');
  const after = (await c.call('export_takeoff', { path: resolve(out, 'saved.takeoff.json') })).bas_workflow;
  assert.equal(after.scope_events.at(-1).origin, 'agent_proposal'); same(after.captures, original.captures, 'Sources unchanged');
  same(after.engineering_events, original.engineering_events, 'Independent engineering results unchanged');
  assert.equal((await c.scope({ action: 'record', request })).event_id, record.event_id, 'Exact retry');
  await c.call('bas_scope_review', { command: { action: 'record', request: { ...request, operation_id: randomUUID() } } }, true);
  same((await c.call('export_takeoff')).bas_workflow, after, 'Stale rejection changes no history');
  // Actual public declared-input edits, not direct Session injection: changing
  // an unrelated check must not stale this assembly claim; its member does.
  const engineering = after.engineering_events.at(-1), register = structuredClone(engineering.register);
  register.input.checks[0].reason += ' — controlled unrelated check-note change';
  await c.call('compile_corpus_takeoff', { kind: 'bas_points', bas_engineering_review: {
    operation_id: randomUUID(), capture_id: engineering.capture_id, expected_head: engineering.event_id,
    expected_equipment_head: engineering.expected_equipment_head, expected_assembly_head: engineering.expected_assembly_head,
    expected_sequence_head: engineering.expected_sequence_head, register, reason: 'Controlled unrelated declared check edit' } });
  const unrelated = (await c.call('export_takeoff')).bas_workflow;
  assert.equal(unrelated.engineering_events.length, after.engineering_events.length + 1, 'Actual public engineering edit saved');
  const unchanged = await c.scope({ action: 'replay', event_id: record.event_id }, 'replay_unrelated_ms');
  await c.scope({ action: 'export', view_id: unchanged.view_id, path: resolve(out, 'unrelated-replay.json') });
  const unaffected = JSON.parse(readFileSync(resolve(out, 'unrelated-replay.json'), 'utf8'));
  assert.equal(unaffected.state, 'current_dependencies');
  const equipment = unrelated.equipment_events.at(-1), memberRegister = structuredClone(equipment.register);
  memberRegister.equipment[0].reason += ' — controlled related source-identity review change';
  await c.call('compile_corpus_takeoff', { kind: 'bas_points', bas_equipment_review: { operation_id: randomUUID(),
    capture_id: equipment.capture_id, expected_head: equipment.event_id, register: memberRegister,
    reason: 'Controlled related member change must invalidate dependent coverage' } });
  const changed = (await c.call('export_takeoff', { path: resolve(out, 'changed.takeoff.json') })).bas_workflow;
  assert.equal(changed.equipment_events.length, unrelated.equipment_events.length + 1);
  const stale = await c.scope({ action: 'replay', event_id: record.event_id }, 'replay_related_ms');
  await c.scope({ action: 'export', view_id: stale.view_id, path: resolve(out, 'related-replay.json') });
  const affected = JSON.parse(readFileSync(resolve(out, 'related-replay.json'), 'utf8'));
  assert.equal(affected.state, 'changed_dependencies'); same(affected.original, unaffected.original, 'Historical coverage never rebounds to changed inputs');
  same(affected, await readBasScopeDecision(changed, record.event_id!), 'Actual public changed dependency replay parity');
  writeFileSync(resolve(out, 'first-stderr.log'), await c.close()); c = await connection();
  await c.call('load_plan', { path: resolve(pdf) }); await c.call('import_takeoff', { path: resolve(out, 'changed.takeoff.json') });
  same((await c.call('export_takeoff')).bas_workflow, changed, 'New-process ordinary recovery');
  const reopened = await c.scope({ action: 'replay', event_id: record.event_id }, 'reopen_ms');
  assert.equal(reopened.verification, 'shared_projection_replayed'); assert.equal(reopened.approved, false);
  for (const value of Object.values(timings)) assert.ok(value < 10000, 'Public scope operation under predeclared 10 s');
  checks.push('Built actual tool; original PDF/browser history; bounded catalog; exact historical source/mappings; original source view; preparation parity; proposal/retry/stale rejection; actual public unrelated/related edits; full export; fresh process recovery');
  const proof = { checks, timings, original_browser_coverage_equal: true, final_events: changed.scope_events.length,
    controlled_applicability_and_hardware_inputs: true, no_extraction_or_installed_quantity_claim: true };
  writeFileSync(resolve(out, 'proof.json'), JSON.stringify(proof, null, 2)); console.log(JSON.stringify(proof));
} catch (error) { writeFileSync(resolve(out, 'failure.txt'), String(error)); throw error; }
finally { writeFileSync(resolve(out, 'stderr.log'), await c.close()); }
